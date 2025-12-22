from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta, time as datetime_time
from typing import Dict, List, Optional
import logging
from ..db import get_db
from ..models import DailyForecast, TransportLine
from ..services.schedule_service import schedule_service
from ..services.metro_service import metro_service
from ..services.bus_schedule_cache import bus_schedule_cache_service
from ..constants import (
    METROBUS_CAPACITY,
    METROBUS_CODE,
    METROBUS_MIN_TRIPS_FALLBACK,
    METROBUS_POOL,
)
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()


def _parse_time(time_str: str) -> Optional[datetime_time]:
    """
    Parse time string to time object.
    
    Args:
        time_str: Time string (e.g., "06:00", "23:30")
        
    Returns:
        time object or None if parsing fails
    """
    try:
        parts = time_str.strip().split(':')
        if len(parts) >= 2:
            hour = int(parts[0])
            minute = int(parts[1])
            return datetime_time(hour=hour, minute=minute)
    except Exception as e:
        logger.warning(f"Failed to parse time '{time_str}': {e}")
    return None


def _crowd_level_for_capacity(prediction_value: float, max_capacity: int) -> str:
    if max_capacity <= 0:
        return "Unknown"
    occupancy_rate = prediction_value / max_capacity
    if occupancy_rate < 0.30:
        return "Low"
    if occupancy_rate < 0.60:
        return "Medium"
    if occupancy_rate < 0.90:
        return "High"
    return "Very High"


def _is_metrobus_request(line_code: str) -> bool:
    return line_code == METROBUS_CODE or line_code in METROBUS_POOL


def _trips_per_hour_from_payload_direction(payload: Dict, direction: str) -> List[int]:
    counts = [0] * 24
    for time_str in payload.get(direction, []) or []:
        parsed = _parse_time(time_str)
        if not parsed:
            continue
        counts[int(parsed.hour)] += 1
    return counts


def _get_service_hours(line_code: str, direction: Optional[str] = None) -> Optional[Dict[str, Optional[int]]]:
    """
    Get service hours (first and last departure) for a line.
    
    Args:
        line_code: Line code
        direction: Optional direction ('G' or 'D'). If None, uses combined schedule.
        
    Returns:
        Tuple of (first_hour, last_hour, wraps_midnight) or None if unknown
    """
    try:
        # Special case: Marmaray - hardcoded service hours (06:00 - 00:00)
        if line_code == 'MARMARAY':
            return {
                "first_hour": 6,
                "last_hour": 0,
                "wraps_midnight": True,
                "has_service": True
            }
        
        # Metro / rail: use topology first/last time when available.
        if isinstance(line_code, str) and line_code and line_code[0] in ('M', 'F', 'T'):
            metro_line = metro_service.get_line(line_code)
            if metro_line:
                first_t = _parse_time(metro_line.get('first_time') or '')
                last_t = _parse_time(metro_line.get('last_time') or '')
                if first_t and last_t:
                    wraps = last_t < first_t
                    return {
                        "first_hour": first_t.hour,
                        "last_hour": last_t.hour,
                        "wraps_midnight": wraps,
                        "has_service": True
                    }

        schedule = schedule_service.get_schedule(line_code)
        data_status = schedule.get('data_status')
        has_service_today = schedule.get('has_service_today', True)
        
        # Collect times from specified direction(s)
        all_times = []
        directions_to_check = [direction] if direction else ['G', 'D']
        
        for dir_code in directions_to_check:
            times = schedule.get(dir_code, [])
            for time_str in times:
                parsed = _parse_time(time_str)
                if parsed:
                    all_times.append(parsed)
        
        if not all_times:
            # If schedule fetch failed, we can't trust emptiness -> show forecasts for all hours.
            if data_status == 'FETCH_FAILED':
                logger.warning(f"Schedule unavailable for {line_code}, showing forecasts for all hours")
                return None

            # If caller asked for a specific direction and that direction has no departures,
            # treat it as no service for that direction (even if the opposite direction runs).
            if direction in ('G', 'D'):
                opposite = 'D' if direction == 'G' else 'G'
                opposite_has_times = bool(schedule.get(opposite, []))
                if opposite_has_times or has_service_today:
                    logger.info(
                        f"Line {line_code} has no planned departures for direction={direction} (opposite_has_times={opposite_has_times})"
                    )
                    return {
                        "first_hour": None,
                        "last_hour": None,
                        "wraps_midnight": False,
                        "has_service": False
                    }
            
            # Case 1: Genuinely no service today (e.g., line doesn't run on Sundays)
            if data_status == 'NO_SERVICE_DAY' or (data_status == 'NO_DATA' and schedule.get('has_service_today') is False):
                logger.info(f"Line {line_code} has no planned service for current day type")
                return {
                    "first_hour": None,
                    "last_hour": None,
                    "wraps_midnight": False,
                    "has_service": False
                }
            
            # Case 3: Unknown status - return None (show forecasts)
            logger.warning(f"No schedule data for {line_code} (status={data_status}), showing forecasts")
            return None
        
        # Sort and get first/last hours
        all_times.sort()
        first_hour = all_times[0].hour
        last_hour = all_times[-1].hour
        
        logger.debug(f"Service hours for {line_code} direction {direction}: {first_hour}:00 - {last_hour}:00")
        return {
            "first_hour": first_hour,
            "last_hour": last_hour,
            "wraps_midnight": False,
            "has_service": True
        }
        
    except Exception as e:
        logger.error(f"Error getting service hours for {line_code}: {e}")
        return None


def _is_hour_in_service(hour: int, service_hours: Optional[Dict[str, Optional[int]]]) -> bool:
    """
    Check if a given hour is within service hours.
    
    Args:
        hour: Hour to check (0-23)
        service_hours: Tuple of (first_hour, last_hour) or None
        
    Returns:
        True if in service, False otherwise
    """
    if service_hours is None:
        # No schedule data - assume in service (benefit of doubt)
        return True

    if not service_hours.get('has_service', True):
        return False

    first_hour = service_hours.get('first_hour')
    last_hour = service_hours.get('last_hour')
    wraps_midnight = service_hours.get('wraps_midnight', False)

    if first_hour is None or last_hour is None:
        return False

    if not wraps_midnight:
        # Normal daytime service
        return first_hour <= hour <= last_hour

    # Wrap-around (e.g., 06:00 -> 00:30): service is [first..23] U [0..last]
    return hour >= first_hour or hour <= last_hour

class HourlyForecastResponse(BaseModel):
    hour: int = Field(..., ge=0, le=23, description="Hour of day (0-23)")
    predicted_value: Optional[float] = Field(None, ge=0, description="Predicted passenger count (null if out of service)")
    occupancy_pct: Optional[int] = Field(None, ge=0, le=100, description="Occupancy percentage (null if out of service)")
    crowd_level: str = Field(..., description="Crowd level: Low, Medium, High, Very High, or Out of Service")
    max_capacity: int = Field(..., gt=0, description="Maximum line capacity")
    in_service: bool = Field(..., description="Whether the line is in service during this hour")
    trips_per_hour: Optional[int] = Field(None, ge=0, description="Number of scheduled trips (G+D combined)")
    vehicle_capacity: Optional[int] = Field(None, gt=0, description="Expected per-vehicle capacity")

    class Config:
        json_schema_extra = {
            "example": {
                "hour": 8,
                "predicted_value": 65827.69,
                "occupancy_pct": 70,
                "crowd_level": "High",
                "max_capacity": 94091,
                "in_service": True,
                "trips_per_hour": 45,
                "vehicle_capacity": 100
            }
        }

@router.get("/forecast/{line_name}", response_model=List[HourlyForecastResponse])
def get_daily_forecast(
    line_name: str,
    target_date: date = Query(..., description="Target date in YYYY-MM-DD format"),
    direction: Optional[str] = Query(None, description="Direction filter: 'G' (Outbound) or 'D' (Inbound). If provided, marks out-of-service hours based on that direction's schedule."),
    db: Session = Depends(get_db)
):
    """
    Retrieves the pre-calculated 24-hour forecast for a specific line and date.
    
    Marks hours as out-of-service based on the line's schedule. If direction is specified,
    uses only that direction's schedule; otherwise uses combined schedule from both directions.
    
    Args:
        line_name: Transport line identifier (e.g., '34', 'M2', '500T')
        target_date: Date for the forecast (YYYY-MM-DD)
        direction: Optional direction filter ('G' or 'D')
    
    Returns:
        List of 24 hourly forecasts with crowd levels and predictions.
        Hours outside service times will have null predicted_value/occupancy_pct and in_service=False.
    
    Raises:
        HTTPException 400: Invalid line name or date range
        HTTPException 404: No forecast data available
        HTTPException 500: Server error
    """
    try:
        # Backwards-compatible aliasing: M1A/M1B share the same forecast rows as M1.
        # IMPORTANT: service-hours should still be computed from the requested line_name
        # (because M1A vs M1B topology hours/stops can differ).
        if _is_metrobus_request(line_name):
            forecast_line_name = METROBUS_CODE
        else:
            forecast_line_name = 'M1' if line_name in ('M1A', 'M1B') else line_name

        if forecast_line_name != METROBUS_CODE:
            line_exists = db.query(TransportLine).filter(
                TransportLine.line_name == forecast_line_name
            ).first()
            
            if not line_exists:
                logger.warning(f"Forecast requested for non-existent line: {line_name}")
                raise HTTPException(
                    status_code=404,
                    detail=f"Transport line '{line_name}' not found. Please verify the line name."
                )
        
        max_date = datetime.now().date() + timedelta(days=7)
        if target_date > max_date:
            raise HTTPException(
                status_code=400,
                detail=f"Forecast date cannot be more than 7 days in the future. Requested: {target_date}, Max: {max_date}"
            )
        
        if forecast_line_name == METROBUS_CODE:
            # Aggregate metrobus variants into one virtual line.
            metrobus_rows = db.query(DailyForecast).filter(
                DailyForecast.line_name.in_(METROBUS_POOL),
                DailyForecast.date == target_date
            ).all()

            if not metrobus_rows:
                raise HTTPException(
                    status_code=404,
                    detail=f"No forecast data available for line '{METROBUS_CODE}' on {target_date}."
                )

            pred_by_hour = {h: 0.0 for h in range(24)}
            for row in metrobus_rows:
                if row.hour is None:
                    continue
                pred_by_hour[int(row.hour)] += float(row.predicted_value or 0.0)

            # Load schedules from persisted cache for the requested date.
            # If schedule is unavailable, keep forecasts visible but use a safe capacity floor.
            trips_by_hour = [0] * 24
            schedule_available = False
            for sub_code in METROBUS_POOL:
                payload, _, _ = bus_schedule_cache_service.get_cached_schedule(
                    db,
                    sub_code,
                    valid_for=target_date,
                    max_stale_days=7,
                )
                if not payload:
                    continue
                if payload.get('data_status') == 'FETCH_FAILED':
                    continue
                schedule_available = True
                if direction in ('G', 'D'):
                    sub_trips = _trips_per_hour_from_payload_direction(payload, direction)
                else:
                    sub_trips = bus_schedule_cache_service.trips_per_hour_from_payload(payload)
                trips_by_hour = [a + b for a, b in zip(trips_by_hour, sub_trips)]

            response_data = []
            for hour in range(24):
                total_pred = float(pred_by_hour.get(hour, 0.0))

                if schedule_available:
                    trips = int(trips_by_hour[hour])
                    in_service = trips > 0
                    if not in_service:
                        response_data.append({
                            "hour": hour,
                            "predicted_value": None,
                            "occupancy_pct": None,
                            "crowd_level": "Out of Service",
                            "max_capacity": max(1, trips * METROBUS_CAPACITY),
                            "in_service": False,
                            "trips_per_hour": trips,
                            "vehicle_capacity": METROBUS_CAPACITY,
                        })
                        continue

                    max_capacity = max(1, trips * METROBUS_CAPACITY)
                    occupancy_pct = min(100, round((total_pred / max_capacity) * 100))
                    response_data.append({
                        "hour": hour,
                        "predicted_value": total_pred,
                        "occupancy_pct": occupancy_pct,
                        "crowd_level": _crowd_level_for_capacity(total_pred, max_capacity),
                        "max_capacity": max_capacity,
                        "in_service": True,
                        "trips_per_hour": trips,
                        "vehicle_capacity": METROBUS_CAPACITY,
                    })
                    continue

                # Schedule unavailable: keep forecasts visible for all hours but avoid 0 capacity.
                effective_trips = METROBUS_MIN_TRIPS_FALLBACK
                max_capacity = effective_trips * METROBUS_CAPACITY
                occupancy_pct = min(100, round((total_pred / max_capacity) * 100))
                response_data.append({
                    "hour": hour,
                    "predicted_value": total_pred,
                    "occupancy_pct": occupancy_pct,
                    "crowd_level": _crowd_level_for_capacity(total_pred, max_capacity),
                    "max_capacity": max_capacity,
                    "in_service": True,
                    "trips_per_hour": effective_trips,
                    "vehicle_capacity": METROBUS_CAPACITY,
                })

            return response_data

        forecasts = db.query(DailyForecast).filter(
            DailyForecast.line_name == forecast_line_name,
            DailyForecast.date == target_date
        ).order_by(DailyForecast.hour).all()

        if not forecasts:
            logger.warning(f"No forecast data for line '{line_name}' on {target_date}")
            raise HTTPException(
                status_code=404,
                detail=f"No forecast available for line '{line_name}' on {target_date}. The batch forecast job may need to run."
            )
        
        if len(forecasts) != 24:
            logger.error(f"Incomplete forecast data for line '{line_name}' on {target_date}: {len(forecasts)}/24 hours")
        
        # Get service hours from schedule to mark out-of-service hours
        service_hours = _get_service_hours(line_name, direction)
        
        # Process forecasts to mark out-of-service hours
        processed_forecasts = []
        for forecast in forecasts:
            hour = forecast.hour
            in_service = _is_hour_in_service(hour, service_hours)
            
            if in_service:
                # Normal forecast data
                processed_forecasts.append({
                    "hour": hour,
                    "predicted_value": forecast.predicted_value,
                    "occupancy_pct": forecast.occupancy_pct,
                    "crowd_level": forecast.crowd_level,
                    "max_capacity": forecast.max_capacity,
                    "in_service": True,
                    "trips_per_hour": forecast.trips_per_hour,
                    "vehicle_capacity": forecast.vehicle_capacity
                })
            else:
                # Out of service - null the prediction values
                processed_forecasts.append({
                    "hour": hour,
                    "predicted_value": None,
                    "occupancy_pct": None,
                    "crowd_level": "Out of Service",
                    "max_capacity": forecast.max_capacity,
                    "in_service": False,
                    "trips_per_hour": forecast.trips_per_hour,
                    "vehicle_capacity": forecast.vehicle_capacity
                })
        
        return processed_forecasts
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching forecast for {line_name} on {target_date}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="An error occurred while fetching the forecast. Please try again later."
        )
