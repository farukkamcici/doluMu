"""
Daily history of what İETT bus lines actually did, from İETT's open trip archive.

GetIettArsivGorev_json lists every executed trip of a day (~55k rows, ~20 MB): line, route
variant, vehicle, planned and actual start/end. We keep a small per-line summary per day
(bus_line_days) so the app can show punctuality trends and estimate running times without
re-downloading the archive. GetIettYolculukHat_json adds journeys for the 50 busiest lines.
"""
from __future__ import annotations

import html
import json
import logging
import re
import statistics
import threading
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo

import requests
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import BusLineDay

logger = logging.getLogger(__name__)

_URL = "https://api.ibb.gov.tr/iett/ibb/ibb360.asmx"
_TZ = ZoneInfo("Europe/Istanbul")
_DATE_RE = re.compile(r"/Date\((\d+)\)/")
# A near-empty archive means İETT hasn't published the day yet (or had a hiccup).
_MIN_TRIPS = 10_000
HISTORY_DAYS = 14
_lock = threading.Lock()


def _soap(op: str, params: Dict[str, str], timeout: int = 120):
    body = "".join(f"<{k}>{v}</{k}>" for k, v in params.items())
    envelope = (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>'
        f'<{op} xmlns="http://tempuri.org/">{body}</{op}>'
        "</soap:Body></soap:Envelope>"
    )
    res = requests.post(
        _URL,
        data=envelope.encode("utf-8"),
        headers={"Content-Type": "text/xml; charset=utf-8", "SOAPAction": f'"http://tempuri.org/{op}"'},
        timeout=timeout,
    )
    res.raise_for_status()
    match = re.search(rf"<{op}Result>(.*?)</{op}Result>", res.text, re.S)
    if not match:
        raise ValueError(f"{op}: empty result")
    return json.loads(html.unescape(match.group(1)))


def _ts(value: Optional[str]) -> Optional[datetime]:
    match = _DATE_RE.match(value or "")
    return datetime.fromtimestamp(int(match.group(1)) / 1000, tz=timezone.utc).astimezone(_TZ) if match else None


def _median(values: List[float]) -> Optional[float]:
    return round(statistics.median(values), 1) if values else None


def summarize(duties: list, journeys: Dict[str, int]) -> Dict[str, dict]:
    """Per-line summary of one day's trip archive."""
    acc: Dict[str, dict] = defaultdict(lambda: {"trips": 0, "completed": 0, "cancelled": 0, "delays": [], "runs": defaultdict(list)})
    for d in duties:
        line = (d.get("SHATKODU") or "").strip()
        if not line:
            continue
        a = acc[line]
        a["trips"] += 1
        status = d.get("SGOREVDURUM")
        if status == "T":
            a["completed"] += 1
        elif status == "I":
            a["cancelled"] += 1
        start, end, planned = _ts(d.get("DTBASLAMAZAMANI")), _ts(d.get("DTBITISZAMANI")), _ts(d.get("DTPLANLANANBASLANGICZAMANI"))
        if start and planned:
            delay = (start - planned).total_seconds() / 60
            if abs(delay) < 180:
                a["delays"].append(delay)
        variant = (d.get("SGUZERGAHKODU") or "").strip()
        if status == "T" and start and end and variant:
            minutes = (end - start).total_seconds() / 60
            if 3 <= minutes <= 300:
                a["runs"][variant].append((start.hour, minutes))

    out: Dict[str, dict] = {}
    for line, a in acc.items():
        trip_minutes: Dict[str, Dict[str, float]] = {}
        for variant, runs in a["runs"].items():
            by_hour: Dict[int, List[float]] = defaultdict(list)
            for hour, minutes in runs:
                by_hour[hour].append(minutes)
            trip_minutes[variant] = {str(h): _median(v) for h, v in sorted(by_hour.items())}
        delays = a["delays"]
        out[line] = {
            "trips": a["trips"],
            "completed": a["completed"],
            "cancelled": a["cancelled"],
            "median_delay_min": _median(delays),
            "on_time_share": round(sum(abs(x) <= 3 for x in delays) / len(delays), 3) if delays else None,
            "journeys": journeys.get(line),
            "trip_minutes": trip_minutes,
        }
    return out


def fetch_day(day: date) -> Dict[str, dict]:
    duties = _soap("GetIettArsivGorev_json", {"Tarih": day.strftime("%Y%m%d")})
    if len(duties) < _MIN_TRIPS:
        raise ValueError(f"archive for {day} has only {len(duties)} trips")
    try:
        rows = _soap("GetIettYolculukHat_json", {"Tarih": day.isoformat()}, timeout=60)
        journeys = {str(r["Hat"]).strip(): int(r["Yolculuk"]) for r in rows if r.get("Hat")}
    except Exception as exc:  # noqa: BLE001 - journeys are optional
        logger.warning("İETT journeys for %s unavailable: %s", day, exc)
        journeys = {}
    return summarize(duties, journeys)


def store_day(db: Session, day: date) -> int:
    summary = fetch_day(day)
    db.query(BusLineDay).filter(BusLineDay.date == day).delete()
    db.bulk_insert_mappings(BusLineDay, [{"date": day, "line_code": line, **row} for line, row in summary.items()])
    db.commit()
    return len(summary)


def today_istanbul() -> date:
    return datetime.now(_TZ).date()


def sync_history(days: int = HISTORY_DAYS) -> Dict[str, int]:
    """Fetch any of the last `days` days that aren't stored yet (yesterday first) and drop older ones."""
    if not _lock.acquire(blocking=False):
        return {}
    db = SessionLocal()
    stored: Dict[str, int] = {}
    try:
        today = today_istanbul()
        have = {d for (d,) in db.query(BusLineDay.date).distinct()}
        for offset in range(1, days + 1):
            day = today - timedelta(days=offset)
            if day in have:
                continue
            try:
                stored[day.isoformat()] = store_day(db, day)
                logger.info("İETT archive stored for %s (%d lines)", day, stored[day.isoformat()])
            except Exception as exc:  # noqa: BLE001 - one bad day must not stop the rest
                db.rollback()
                logger.warning("İETT archive for %s unavailable: %s", day, exc)
        db.query(BusLineDay).filter(BusLineDay.date < today - timedelta(days=days + 30)).delete()
        db.commit()
    finally:
        db.close()
        _lock.release()
    return stored
