import logging
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert
import pandas as pd
import lightgbm as lgb
from datetime import datetime, timedelta
import traceback
from ..db import SessionLocal
from ..models import TransportLine, DailyForecast, JobExecution
from ..schemas import ModelInput
from ..state import COLUMN_ORDER
from .store import FeatureStore
from .capacity_store import CapacityStore, DEFAULT_VEHICLE_CAPACITY_FALLBACK
from .weather import fetch_daily_weather_data_sync
from .bus_schedule_cache import bus_schedule_cache_service
from .metro_schedule_cache import metro_schedule_cache_service
from .metro_service import metro_service
from .marmaray_service import marmaray_service

logger = logging.getLogger(__name__)

# Placeholder for Istanbul coordinates
ISTANBUL_LAT = 41.0082
ISTANBUL_LON = 28.9784


def run_daily_forecast_job(
    db: Session,
    store: FeatureStore,
    model: lgb.Booster,
    target_date: datetime.date,
    num_days: int = 1,
    capacity_store: CapacityStore | None = None,
):
    """
    Run daily forecast job in background for one or more days.
    
    Args:
        db: Database session (will be replaced with new session)
        store: Feature store instance
        model: Trained LightGBM model
        target_date: Starting date for forecast
        num_days: Number of consecutive days to forecast (default: 1)
    
    NOTE: Creates its own DB session to avoid session lifecycle issues with background tasks.
    """
    # Create a NEW session for this background task (ignore the passed session)
    db = SessionLocal()
    job_log = None
    capacity_store = capacity_store or CapacityStore()
    
    try:
        # Calculate end date for the job
        end_date = target_date + timedelta(days=num_days - 1)
        
        # 1. Create Job Log (STARTED)
        job_log = JobExecution(
            job_type="daily_forecast",
            target_date=target_date,
            end_date=end_date if num_days > 1 else None,
            status="RUNNING",
            start_time=datetime.now(),
            job_metadata={"num_days": num_days, "days": [str(target_date + timedelta(days=i)) for i in range(num_days)]}
        )
        db.add(job_log)
        db.commit()
        db.refresh(job_log)

        logger.info(f"Starting daily forecast job for {num_days} day(s) starting from: {target_date} (Job ID: {job_log.id})")

        # Fetch all available lines
        all_lines = db.query(TransportLine.line_name).all()
        line_names = [line[0] for line in all_lines]
        logger.info(f"Found {len(line_names)} lines to process.")

        rail_line_codes = set(metro_service.get_lines().keys())

        all_forecasts_to_insert = []
        total_processed_count = 0
        
        # Process each day
        for day_offset in range(num_days):
            current_date = target_date + pd.Timedelta(days=day_offset)
            date_str = current_date.strftime("%Y-%m-%d")
            forecast_date = current_date.date() if hasattr(current_date, "date") else current_date
            
            logger.info("Processing day %d/%d: %s", day_offset + 1, num_days, date_str)

            # Fetch weather SYNC
            logger.info(f"Fetching weather data for {date_str}...")
            daily_weather_data = fetch_daily_weather_data_sync(date_str, ISTANBUL_LAT, ISTANBUL_LON)
            logger.info(f"Weather data fetched: {len(daily_weather_data)} hours available.")

            forecasts_to_insert = []

            # Loop through lines and hours
            logger.info(f"Starting prediction loop for {len(line_names)} lines × 24 hours...")
            
            # First check if calendar features exist
            calendar_features = store.get_calendar_features(date_str)
            if not calendar_features:
                error_msg = f"No calendar features found for {date_str}! Job cannot proceed."
                logger.error(error_msg)
                raise ValueError(error_msg)
            
            logger.info(f"Calendar features loaded: {calendar_features}")
            
            logger.info("Batch-loading lag features for all lines...")
            lag_batch = store.get_batch_historical_lags(line_names, date_str)
            logger.info(f"Lag features loaded: {len(lag_batch.get('seasonal', {}))} seasonal, {len(lag_batch.get('fallback', {}))} fallback")

            logger.info(f"Loading bus schedule trips-per-hour for {date_str}...")
            trips_per_hour_by_line = {}
            day_type = bus_schedule_cache_service.day_type_for_date(forecast_date)
            cache_hits = 0
            cache_misses = 0
            
            # Fallback pattern when schedule is unavailable (NOT an assumption - just capacity calc)
            # Each hour gets 1 trip minimum to enable capacity calculation
            # Actual service hours will be determined by cached schedule or marked as "data unavailable"
            FALLBACK_TRIPS_PATTERN = [1] * 24  # 1 trip per hour enables forecast generation
            
            for idx, line_name in enumerate(line_names):
                if idx % 200 == 0:
                    logger.debug("Loading schedules: %d/%d lines (target=%s, day_type=%s)...", idx, len(line_names), date_str, day_type)
                
                # Marmaray: compute trips-per-hour from static schedule
                if line_name == 'MARMARAY':
                    is_weekend = forecast_date.weekday() in [4, 5]  # Friday/Saturday nights
                    marmaray_trips = marmaray_service.get_all_trips_per_hour(is_weekend)
                    if marmaray_trips:
                        cache_hits += 1
                        trips_per_hour_by_line[line_name] = marmaray_trips
                        continue
                
                # Rail lines: compute trips-per-hour from Metro timetable cache.
                if line_name in rail_line_codes or line_name == 'M1':
                    metro_trips = metro_schedule_cache_service.get_line_trips_per_hour(
                        db,
                        line_name,
                        valid_for=forecast_date,
                        max_stale_days=7,
                    )
                    if metro_trips is not None:
                        cache_hits += 1
                        trips_per_hour_by_line[line_name] = metro_trips
                        continue

                # Bus/ferry: get cached planned schedule (prefetch job should have created exact match).
                payload, is_stale, record = bus_schedule_cache_service.get_cached_schedule(
                    db,
                    line_name,
                    valid_for=forecast_date,
                    max_stale_days=7,
                )

                if payload is None:
                    cache_misses += 1
                    if cache_misses <= 10:
                        logger.debug("No cached schedule for %s (day_type=%s), using fallback", line_name, day_type)
                    trips_per_hour_by_line[line_name] = FALLBACK_TRIPS_PATTERN
                else:
                    cache_hits += 1
                    trips_per_hour_by_line[line_name] = bus_schedule_cache_service.trips_per_hour_from_payload(payload)
            
            logger.info(f"Schedule cache: {cache_hits} hits, {cache_misses} misses (total {len(line_names)} lines)")
            if cache_misses > 0:
                logger.info(f"{cache_misses} lines using fallback pattern (schedule unavailable)")

            vehicle_capacity_by_line = {
                line_name: capacity_store.get_capacity_meta(line_name).expected_capacity_weighted_int
                for line_name in line_names
            }
            
            fallback_lags = {
                'lag_24h': 0.0, 'lag_48h': 0.0, 'lag_168h': 0.0,
                'roll_mean_24h': 0.0, 'roll_std_24h': 0.0
            }
            
            # Build all prediction inputs in batch
            batch_inputs = []
            batch_metadata = []
            
            for idx, line_name in enumerate(line_names):
                if idx % 100 == 0:
                    logger.debug("Building inputs: %d/%d lines...", idx, len(line_names))

                for hour in range(24):
                    weather_data = daily_weather_data.get(hour)
                    if not weather_data:
                        continue

                    key = (line_name, hour)
                    # Get lag features with proper fallback handling
                    lag_features = lag_batch['seasonal'].get(key) or lag_batch['fallback'].get(key)
                    
                    # If no lag features found OR if lag features contain None values, use fallback
                    if not lag_features or any(v is None for v in lag_features.values()):
                        lag_features = fallback_lags.copy()

                    model_input_data = {
                        "line_name": line_name, "hour_of_day": hour,
                        **calendar_features, **weather_data, **lag_features
                    }
                    model_input = ModelInput(**model_input_data)
                    batch_inputs.append(model_input.model_dump())
                    batch_metadata.append((line_name, hour))

            # Batch prediction (much faster!)
            if batch_inputs:
                logger.info(f"Running batch predictions for {len(batch_inputs)} records...")
                df_batch = pd.DataFrame(batch_inputs)
                df_batch = df_batch[COLUMN_ORDER]
                df_batch['line_name'] = df_batch['line_name'].astype('category')
                df_batch['season'] = df_batch['season'].astype('category')
                
                # Single batch prediction call
                predictions = model.predict(df_batch)
                logger.info(f"Predictions complete! Processing results...")
                
                # Process results
                for idx, (prediction_np, (line_name, hour)) in enumerate(zip(predictions, batch_metadata)):
                    if idx % 5000 == 0:
                        logger.debug("Processing results: %d/%d...", idx, len(predictions))
                        
                    prediction = float(max(0, prediction_np))
                    trips = trips_per_hour_by_line.get(line_name, [0] * 24)[hour]
                    trips_effective = max(1, int(trips))
                    vehicle_capacity = vehicle_capacity_by_line.get(line_name, DEFAULT_VEHICLE_CAPACITY_FALLBACK)
                    max_capacity = max(1, int(vehicle_capacity * trips_effective))

                    occupancy_pct = min(100, round((prediction / max_capacity) * 100))
                    crowd_level = store.get_crowd_level(line_name, prediction, max_capacity=max_capacity)

                    forecasts_to_insert.append({
                        "line_name": line_name,
                        "date": current_date,
                        "hour": hour,
                        "predicted_value": prediction,
                        "occupancy_pct": occupancy_pct,
                        "crowd_level": crowd_level,
                        "max_capacity": int(max_capacity),
                        "trips_per_hour": int(trips),
                        "vehicle_capacity": int(vehicle_capacity)
                    })
                
                logger.info(f"Result processing complete: {len(forecasts_to_insert)} forecasts ready for {date_str}.")
                
            all_forecasts_to_insert.extend(forecasts_to_insert)
            total_processed_count += len(forecasts_to_insert)

        # Bulk Upsert
        if all_forecasts_to_insert:
            logger.info("Inserting %d total forecast records for %d day(s)...", len(all_forecasts_to_insert), num_days)
            stmt = insert(DailyForecast).values(all_forecasts_to_insert)
            stmt = stmt.on_conflict_do_update(
                constraint='_line_date_hour_uc',
                set_={
                    'predicted_value': stmt.excluded.predicted_value,
                    'occupancy_pct': stmt.excluded.occupancy_pct,
                    'crowd_level': stmt.excluded.crowd_level,
                    'max_capacity': stmt.excluded.max_capacity,
                    'trips_per_hour': stmt.excluded.trips_per_hour,
                    'vehicle_capacity': stmt.excluded.vehicle_capacity,
                }
            )
            db.execute(stmt)
            db.commit()
            logger.info(f"Successfully inserted {len(all_forecasts_to_insert)} records.")
        else:
            logger.info("No forecasts generated. Check calendar/weather data availability.")

        # 2. Update Job Log (SUCCESS)
        job_log.status = "SUCCESS"
        job_log.end_time = datetime.now()
        job_log.records_processed = total_processed_count
        db.commit()

        # 3. Log Feature Store fallback statistics for monitoring
        fallback_stats = store.get_fallback_stats()
        logger.info(f"Job {job_log.id} completed. Processed {total_processed_count} predictions for {num_days} day(s).")
        logger.info(f"Lag Fallback Stats: {fallback_stats.get('seasonal_pct', 0):.1f}% seasonal, "
              f"{fallback_stats.get('hour_fallback_pct', 0):.1f}% hour-based, "
              f"{fallback_stats.get('zero_fallback_pct', 0):.1f}% zeros")
        
        return {
            "status": "success", 
            "processed_count": total_processed_count,
            "num_days": num_days,
            "fallback_stats": fallback_stats
        }

    except Exception as e:
        # 3. Update Job Log (FAILED)
        db.rollback()
        error_details = traceback.format_exc()
        logger.exception("Daily forecast job failed: %s", e)

        try:
            # Fetch job_log again in case it was detached or never created
            if job_log is None or job_log.id is None:
                job_log = db.query(JobExecution).filter(
                    JobExecution.status == "RUNNING"
                ).order_by(JobExecution.start_time.desc()).first()
            
            if job_log:
                job_log.status = "FAILED"
                job_log.end_time = datetime.now()
                job_log.error_message = error_details[:1000]  # Limit to 1000 chars
                db.commit()
                logger.info("Updated job %s status to FAILED.", job_log.id)
        except Exception as update_error:
            logger.error("Failed to update job status: %s", update_error)
            db.rollback()

        return {"status": "failed", "error": str(e)}
    
    finally:
        # Always close the session we created
        db.close()
        logger.info("Database session closed.")
