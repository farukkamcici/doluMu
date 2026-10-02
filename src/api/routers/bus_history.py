"""Per-line daily history of İETT bus operations (see services/iett_archive.py)."""
from datetime import timedelta

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import BusLineDay
from ..services.iett_archive import HISTORY_DAYS, today_istanbul

router = APIRouter(tags=["bus"])


@router.get("/bus/{line_code}/history")
def bus_line_history(
    response: Response,
    line_code: str = Path(..., max_length=20),
    days: int = Query(HISTORY_DAYS, ge=1, le=60),
    db: Session = Depends(get_db),
):
    today = today_istanbul()
    rows = (
        db.query(BusLineDay)
        .filter(BusLineDay.line_code == line_code, BusLineDay.date >= today - timedelta(days=days))
        .order_by(BusLineDay.date)
        .all()
    )
    # Running times depend on the weekday: prefer the same weekday last week, else the latest day.
    same_weekday = next((r for r in rows if r.date == today - timedelta(days=7)), None)
    times_from = same_weekday or (rows[-1] if rows else None)
    response.headers["Cache-Control"] = "public, max-age=1800"
    return {
        "line": line_code,
        "days": [
            {
                "date": r.date.isoformat(),
                "trips": r.trips,
                "completed": r.completed,
                "cancelled": r.cancelled,
                "medianDelayMin": r.median_delay_min,
                "onTimeShare": r.on_time_share,
                "journeys": r.journeys,
            }
            for r in rows
        ],
        "tripMinutes": times_from.trip_minutes if times_from else {},
        "tripMinutesDate": times_from.date.isoformat() if times_from else None,
    }
