import polars as pl
import time
from datetime import datetime


class FeatureStore:
    def __init__(self, features_path='data/processed/features_pl.parquet',
                 calendar_path='data/processed/calendar_dim.parquet'):
        print("Initializing Feature Store with Polars... 🐻‍❄️")
        start_time = time.time()
        try:
            # 1. Select required columns
            required_cols = [
                'line_name', 'hour_of_day', 'y', 'datetime',
                'lag_24h', 'lag_48h', 'lag_168h', 'roll_mean_24h', 'roll_std_24h'
            ]

            # 2. Load and Optimization
            self.features_df = pl.read_parquet(features_path, columns=required_cols).with_columns([
                pl.col(['y', 'lag_24h', 'lag_48h', 'lag_168h', 'roll_mean_24h', 'roll_std_24h']).cast(pl.Float32),
                pl.col('hour_of_day').cast(pl.UInt8),
                pl.col('datetime').cast(pl.Datetime),
                pl.col('datetime').dt.month().alias('month'),
                pl.col('datetime').dt.day().alias('day')
            ])

            self.calendar_df = pl.read_parquet(calendar_path)

            # 3. Calculate Thresholds
            max_caps = self.features_df.group_by("line_name").agg(pl.col("y").max().alias("max_y"))
            self.line_max_capacity = dict(zip(max_caps["line_name"], max_caps["max_y"]))
            self.global_average_max = max_caps["max_y"].mean() if not max_caps.is_empty() else 0

            # 4. Pre-compute latest lags per line/hour/month/day for fast lookup
            print("Building lag lookup cache...")
            self.lag_lookup = self._build_lag_lookup()
            
            elapsed = time.time() - start_time
            print(f"Feature Store initialized successfully in {elapsed:.2f}s.")

        except Exception as e:
            print(f"Error initializing FeatureStore: {e}. Make sure data files exist.")
            self.features_df = None
            self.calendar_df = None
            self.line_max_capacity = {}
            self.global_average_max = 0
            self.lag_lookup = None

    def _build_lag_lookup(self):
        if self.features_df is None:
            return {}
        
        lag_cols = ['lag_24h', 'lag_48h', 'lag_168h', 'roll_mean_24h', 'roll_std_24h']
        
        seasonal = (
            self.features_df
            .group_by(['line_name', 'hour_of_day', 'month', 'day'])
            .agg([
                pl.col('datetime').max().alias('latest_dt'),
                *[pl.col(c).last().alias(c) for c in lag_cols]
            ])
        )
        
        fallback = (
            self.features_df
            .group_by(['line_name', 'hour_of_day'])
            .agg([
                pl.col('datetime').max().alias('latest_dt'),
                *[pl.col(c).last().alias(c) for c in lag_cols]
            ])
        )
        
        return {
            'seasonal': seasonal,
            'fallback': fallback
        }

    def get_calendar_features(self, date_str: str) -> dict:
        if self.calendar_df is None: return {}
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()

        record = self.calendar_df.filter(pl.col("date") == target_date)

        if record.is_empty(): return {}

        features = record.select([
            'day_of_week', 'is_weekend', 'month', 'season', 'is_school_term',
            'is_holiday', 'holiday_win_m1', 'holiday_win_p1'
        ]).row(0, named=True)

        season_map = {1: "Winter", 2: "Spring", 3: "Summer", 4: "Fall"}
        season_val = features.get('season')
        if season_val is not None:
            features['season'] = season_map.get(season_val, str(season_val))

        return features

    def get_historical_lags(self, line_name: str, hour: int, target_date_str: str) -> dict:
        fallback_lags = {
            'lag_24h': 0.0, 'lag_48h': 0.0, 'lag_168h': 0.0,
            'roll_mean_24h': 0.0, 'roll_std_24h': 0.0
        }
        if not self.lag_lookup: 
            return fallback_lags

        target_dt = datetime.strptime(target_date_str, "%Y-%m-%d")
        target_month = target_dt.month
        target_day = target_dt.day
        lag_cols = ['lag_24h', 'lag_48h', 'lag_168h', 'roll_mean_24h', 'roll_std_24h']

        seasonal_match = self.lag_lookup['seasonal'].filter(
            (pl.col("line_name") == line_name) &
            (pl.col("hour_of_day") == hour) &
            (pl.col("month") == target_month) &
            (pl.col("day") == target_day)
        )

        if not seasonal_match.is_empty():
            return seasonal_match.select(lag_cols).row(0, named=True)

        fallback_match = self.lag_lookup['fallback'].filter(
            (pl.col("line_name") == line_name) &
            (pl.col("hour_of_day") == hour)
        )

        if not fallback_match.is_empty():
            return fallback_match.select(lag_cols).row(0, named=True)

        return fallback_lags
    
    def get_batch_historical_lags(self, line_names: list, target_date_str: str):
        if not self.lag_lookup:
            return {}
        
        target_dt = datetime.strptime(target_date_str, "%Y-%m-%d")
        target_month = target_dt.month
        target_day = target_dt.day
        lag_cols = ['line_name', 'hour_of_day', 'lag_24h', 'lag_48h', 'lag_168h', 'roll_mean_24h', 'roll_std_24h']
        
        seasonal_batch = self.lag_lookup['seasonal'].filter(
            (pl.col("line_name").is_in(line_names)) &
            (pl.col("month") == target_month) &
            (pl.col("day") == target_day)
        ).select(lag_cols)
        
        fallback_batch = self.lag_lookup['fallback'].filter(
            pl.col("line_name").is_in(line_names)
        ).select(lag_cols)
        
        seasonal_dict = {}
        for row in seasonal_batch.iter_rows(named=True):
            key = (row['line_name'], row['hour_of_day'])
            seasonal_dict[key] = {k: row[k] for k in lag_cols if k not in ['line_name', 'hour_of_day']}
        
        fallback_dict = {}
        for row in fallback_batch.iter_rows(named=True):
            key = (row['line_name'], row['hour_of_day'])
            fallback_dict[key] = {k: row[k] for k in lag_cols if k not in ['line_name', 'hour_of_day']}
        
        return {
            'seasonal': seasonal_dict,
            'fallback': fallback_dict
        }

    def get_crowd_level(self, line_name: str, prediction_value: float) -> str:
        max_capacity = self.line_max_capacity.get(line_name, self.global_average_max)
        if max_capacity is None or max_capacity == 0: return "Unknown"

        occupancy_rate = prediction_value / max_capacity
        if occupancy_rate < 0.30: return "Low"
        if occupancy_rate < 0.60: return "Medium"
        if occupancy_rate < 0.90: return "High"
        return "Very High"