"""
Line Status Router - Unified Alerts and Operation Hours API.

Provides endpoints for checking line status including disruptions and service hours.

Author: Backend Team
Date: 2025-12-03
"""

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel
from typing import List
import logging

from ..services.status_service import status_service

logger = logging.getLogger(__name__)

router = APIRouter()


class AlertModel(BaseModel):
    """Model for a single alert."""
    text: str
    time: str
    type: str


class LineStatusResponse(BaseModel):
    """Response model for line status."""
    status: str
    alerts: List[AlertModel]
    next_service_time: str | None
    
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "status": "ACTIVE",
                    "alerts": [],
                    "next_service_time": None
                },
                {
                    "status": "WARNING",
                    "alerts": [
                        {
                            "text": "BOSTANCI PERONLAR dan Saat 10:40 de hareket etmesi planlanan seferimiz çesitli nedenlerle yapilamayacaktir.",
                            "time": "04:09",
                            "type": "Sefer"
                        },
                        {
                            "text": "BOSTANCI PERONLAR dan Saat 11:36 de hareket etmesi planlanan seferimiz çesitli nedenlerle yapilamayacaktir.",
                            "time": "04:09",
                            "type": "Sefer"
                        }
                    ],
                    "next_service_time": None
                },
                {
                    "status": "OUT_OF_SERVICE",
                    "alerts": [{"text": "Hat şu an hizmet vermemektedir. İlk sefer: 06:00", "time": "", "type": ""}],
                    "next_service_time": "06:00"
                }
            ]
        }
    }


@router.get(
    "/lines/{line_code}/status",
    response_model=LineStatusResponse,
    summary="Get Line Status",
    description="""
    Get comprehensive line status including:
    - Disruption alerts from IETT (accidents, route changes, etc.)
    - Operation hours status (in service or out of service)
    
    Status types:
    - ACTIVE: Line is operating normally
    - WARNING: Line has active alerts/disruptions
    - OUT_OF_SERVICE: Line is not currently operating (night hours)
    
    Query parameters:
    - direction: Optional. Filter operation hours by direction ('G' for Gidiş/Outbound, 'D' for Dönüş/Inbound)
    
    Results are cached for 5 minutes for performance.
    """,
    tags=["Status"]
)
async def get_line_status(
    line_code: str = Path(
        ...,
        description="Line code (e.g., '19', '15F', 'BN1')",
        examples=["19", "15F", "BN1"]
    ),
    direction: str | None = None
):
    """
    Get line operational status.
    
    Checks both IETT disruption alerts and operating hours to determine
    if the line is active, has warnings, or is out of service.
    
    If direction is specified, operation hours are checked for that specific
    direction only (useful for lines with different schedules per direction).
    """
    try:
        status_info = status_service.get_line_status(line_code, direction)
        
        return LineStatusResponse(
            status=status_info["status"],
            alerts=status_info["alerts"],
            next_service_time=status_info["next_service_time"]
        )
        
    except Exception as e:
        logger.error(f"Error fetching status for line {line_code}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch status for line {line_code}"
        )


@router.post(
    "/admin/status/clear-cache",
    summary="Clear Status Cache",
    description="Clear the status cache for all lines or a specific line.",
    tags=["Admin", "Status"]
)
async def clear_status_cache(line_code: str | None = None):
    """
    Clear status cache.
    
    Query parameter:
    - line_code: Optional. If provided, clears cache for specific line only.
    """
    try:
        status_service.clear_cache(line_code)
        
        return {
            "success": True,
            "message": f"Cache cleared for line {line_code}" if line_code else "All status cache cleared"
        }
        
    except Exception as e:
        logger.error(f"Error clearing status cache: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to clear status cache"
        )


@router.get(
    "/admin/status/cache-stats",
    summary="Get Status Cache Statistics",
    description="Get current status cache statistics.",
    tags=["Admin", "Status"]
)
async def get_status_cache_stats():
    """
    Get status cache statistics.
    
    Returns cache size, max size, and TTL information.
    """
    try:
        stats = status_service.get_cache_stats()
        return stats
        
    except Exception as e:
        logger.error(f"Error fetching status cache stats: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch status cache statistics"
        )
