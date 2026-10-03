from fastapi import APIRouter
from fastapi.responses import JSONResponse
import httpx
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

router = APIRouter()

# Cache storage
_traffic_cache: Optional[dict] = None
_cache_timestamp: Optional[datetime] = None
CACHE_TTL_SECONDS = 300  # 5 minutes

async def _latest_from_history(client: httpx.AsyncClient, now: datetime):
    """Newest value of the 5-minute traffic index history, if it is less than two hours old."""
    try:
        res = await client.get(
            "https://tkmservices.ibb.gov.tr/web/api/TrafficData/v1/TrafficIndexHistory/1/5M",
            headers={"User-Agent": "IstanbulTransportApp/1.0"},
        )
        res.raise_for_status()
        rows = res.json()
        if not rows:
            return None
        latest = max(rows, key=lambda r: r.get("TrafficIndexDate", ""))
        # Timestamps are Istanbul local time; the history runs about half an hour behind.
        stamp = datetime.fromisoformat(latest["TrafficIndexDate"])
        local_now = datetime.now(ZoneInfo("Europe/Istanbul")).replace(tzinfo=None)
        if abs((local_now - stamp).total_seconds()) > 7200:
            return None
        return latest.get("TrafficIndex") or None
    except Exception:  # noqa: BLE001 - the live value is still returned (as missing)
        return None


@router.get("/traffic/istanbul")
async def get_istanbul_traffic():
    """
    Proxy endpoint for Istanbul-wide traffic congestion index.
    
    Data source: IMM/UYM public traffic feed (used by city dashboards).
    Caches for 5 minutes to reduce load and respect unknown rate limits.
    """
    global _traffic_cache, _cache_timestamp
    
    now = datetime.now()
    
    # Return cached data if still valid
    if _traffic_cache and _cache_timestamp:
        age = (now - _cache_timestamp).total_seconds()
        if age < CACHE_TTL_SECONDS:
            return JSONResponse(_traffic_cache)
    
    # Fetch fresh data
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://tkmservices.ibb.gov.tr/web/api/TrafficData/v1/TrafficIndex_Sc1_Cont",
                headers={"User-Agent": "IstanbulTransportApp/1.0"}
            )
            response.raise_for_status()
            data = response.json()
            
            # Extract traffic index (TI is primary, fallback to TI_Av)
            ti = data.get("TI")
            ti_av = data.get("TI_Av")
            percent = ti if ti else ti_av

            # The live feed sometimes reports all zeros for hours while the 5-minute history
            # keeps updating; a city-wide index of 0 is never real, so read the history then.
            if not percent:
                percent = await _latest_from_history(client, now)

            if not percent:
                return JSONResponse(
                    {"percent": None, "source": "IMM_UYM", "updatedAt": now.isoformat()},
                    status_code=200
                )
            
            # Build response
            result = {
                "percent": int(percent),
                "source": "IMM_UYM",
                "updatedAt": now.isoformat()
            }
            
            # Update cache
            _traffic_cache = result
            _cache_timestamp = now
            
            return JSONResponse(result)
            
    except httpx.HTTPStatusError as e:
        return JSONResponse(
            {"percent": None, "source": "IMM_UYM", "updatedAt": now.isoformat(), "error": "upstream_error"},
            status_code=200
        )
    except Exception as e:
        return JSONResponse(
            {"percent": None, "source": "IMM_UYM", "updatedAt": now.isoformat(), "error": "fetch_failed"},
            status_code=200
        )
