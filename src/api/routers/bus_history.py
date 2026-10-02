"""Per-line daily history of İETT bus operations (see services/iett_archive.py)."""
import csv
import io
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import BusLineDay, IettDailyJourneys
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


@router.get("/bus/journeys.csv")
def daily_journeys_csv(
    line: Optional[str] = Query(None, max_length=20),
    start: Optional[date] = Query(None, alias="from"),
    end: Optional[date] = Query(None, alias="to"),
    db: Session = Depends(get_db),
):
    """Daily journeys of İETT's 50 busiest lines since 2023-04-27 (date, line, journeys)."""
    q = db.query(IettDailyJourneys)
    if line:
        q = q.filter(IettDailyJourneys.line_code == line)
    if start:
        q = q.filter(IettDailyJourneys.date >= start)
    if end:
        q = q.filter(IettDailyJourneys.date <= end)
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["date", "line", "journeys"])
    for r in q.order_by(IettDailyJourneys.date, IettDailyJourneys.line_code):
        writer.writerow([r.date.isoformat(), r.line_code, r.journeys])
    return Response(
        out.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="iett_daily_journeys.csv"', "Cache-Control": "public, max-age=3600"},
    )
