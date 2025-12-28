# Istanbul Transport ML Pipeline Documentation

**Complete Machine Learning Pipeline: ETL, Feature Engineering & Model Training**

---

## Table of Contents

1. [Pipeline Overview](#pipeline-overview)
2. [Data Sources](#data-sources)
3. [ETL Process](#etl-process)
4. [Feature Engineering](#feature-engineering)
5. [Model Training](#model-training)
6. [Model Evaluation](#model-evaluation)
7. [Model Versioning](#model-versioning)
8. [Reproducibility](#reproducibility)
9. [Performance Metrics](#performance-metrics)

---

## Pipeline Overview

This document describes the complete **end-to-end machine learning pipeline** for predicting Istanbul public transportation crowding levels 24 hours in advance. The pipeline transforms raw passenger data into a production-ready LightGBM model through systematic ETL, feature engineering, and training processes.

### Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    RAW DATA SOURCES                         │
├─────────────────────────────────────────────────────────────┤
│  • IBB Passenger Data (CSV files, 2022-2024)               │
│  • Open-Meteo Weather Archive (API)                        │
│  • Turkish Holiday Calendar (CSV)                           │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              STEP 1: ETL & DATA PREPARATION                 │
├─────────────────────────────────────────────────────────────┤
│  load_raw.py          → Aggregate raw CSVs                  │
│  clean_data.py        → Remove outliers, nulls             │
│                                                             │
│  Output: data/interim/transport_hourly.parquet             │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│           STEP 2: FEATURE ENGINEERING                       │
├─────────────────────────────────────────────────────────────┤
│  build_log_rolling_transport_data.py                        │
│    └─ Lag features (24h, 48h, 168h)                        │
│    └─ Rolling statistics (mean, std)                        │
│                                                             │
│  build_calendar_dim.py                                      │
│    └─ Date features (weekday, season, holidays)            │
│                                                             │
│  build_weather_dim.py                                       │
│    └─ Historical weather (temp, precip, wind)              │
│                                                             │
│  build_final_features.py                                    │
│    └─ Join all feature tables                              │
│                                                             │
│  split_features.py                                          │
│    └─ Time-based train/val split                           │
│                                                             │
│  Output: data/processed/features_pl.parquet                │
│          data/processed/split_features/*.parquet           │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              STEP 3: MODEL TRAINING                         │
├─────────────────────────────────────────────────────────────┤
│  train_model.py                                             │
│    ├─ Time-Series Cross-Validation (TSCV)                  │
│    ├─ LightGBM gradient boosting                           │
│    ├─ Hyperparameter optimization                          │
│    └─ MLflow experiment tracking                           │
│                                                             │
│  Output: models/lgbm_transport_v6.txt                       │
│          mlruns/ (MLflow artifacts)                         │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              STEP 4: MODEL EVALUATION                       │
├─────────────────────────────────────────────────────────────┤
│  eval_model.py                                              │
│    ├─ MAE, RMSE, SMAPE metrics                             │
│    ├─ Baseline comparisons                                 │
│    ├─ Feature importance plots                             │
│    ├─ SHAP analysis                                         │
│    └─ Per-line and per-hour error analysis                 │
│                                                             │
│  Output: reports/logs/*.json                                │
│          reports/figs/*.png                                 │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Data Processing** | Polars 0.19+ | High-speed DataFrame operations (10-100x faster than Pandas) |
| **ML Framework** | LightGBM 4.1+ | Gradient boosting decision trees |
| **Experiment Tracking** | MLflow 2.9+ | Model versioning and hyperparameter logging |
| **Explainability** | SHAP | Feature importance and model interpretation |
| **Weather API** | Open-Meteo | Historical and forecast weather data |
| **Visualization** | Matplotlib/Seaborn | Plotting and analysis |

---

## Data Sources

### 1. IBB Passenger Count Data

**Source**: Istanbul Metropolitan Municipality (IBB) Internal Data  
**Format**: Multiple CSV files (2022-2024)  
**Granularity**: Line-level, hourly passenger counts  
**Size**: ~50M rows, covering 512 transport lines

**Schema**:
```python
{
    'transition_date': date,        # Date of travel (YYYY-MM-DD)
    'transition_hour': int,         # Hour of day (0-23)
    'line_name': str,               # Transport line code (e.g., "M2", "500T")
    'number_of_passage': int,       # Passenger count for that hour
    'transport_type_id': int,       # 1=Bus, 2=Metro, ...
    'road_type': str,               # 'metro', 'bus', ...
    'line': str,                    # Full line description
    'town': str                     # District/borough
}
```

**Data Quality Issues**:
- Missing values in `town` column (~2% of rows)
- Outliers due to special events (concerts, protests, sports games)
- Service disruptions causing zero counts during operational hours
- Duplicate records from data pipeline errors

### 2. Weather Data (Open-Meteo Archive API)

**Source**: https://archive-api.open-meteo.com/v1/archive  
**Location**: Istanbul (41.0082°N, 28.9784°E)  
**Granularity**: Hourly  
**Date Range**: 2022-01-01 to 2024-09-30

**Variables Retrieved**:
```python
{
    'datetime': datetime,           # Timestamp (Europe/Istanbul TZ)
    'temperature_2m': float,        # Air temperature (°C)
    'precipitation': float,         # Rainfall (mm/hour)
    'wind_speed_10m': float        # Wind speed at 10m height (km/h)
}
```

**Fetching Strategy**:
- Batch requests by year to avoid API timeouts
- Local caching with 1-hour expiration (`requests_cache`)
- Retry mechanism with exponential backoff (5 attempts)

### 3. Turkish Holiday Calendar

**Source**: Manual compilation from official government calendars  
**Format**: CSV file  
**Date Range**: 2022-2031 (pre-calculated for future predictions)

**Holidays Tracked**:
- National holidays (Republic Day, Independence Day, etc.)
- Religious holidays (Ramadan Eid, Sacrifice Eid, etc.)
- School breaks and semester calendars
- Special events (elections, referendums)

**Schema**:
```python
{
    'date': date,
    'Ramadan_Eid': int,             # 1 if holiday, 0 otherwise
    'Sacrifice_Eid': int,
    'Republic_Day': int,
    # ... (20+ holiday types)
}
```

---

## ETL Process

### Phase 1: Raw Data Loading (`src/data_prep/load_raw.py`)

**Purpose**: Aggregate multiple CSV files into a single unified dataset

**Process**:

```python
# 1. Scan all CSV files in data/raw/
files = sorted(Path("data/raw").glob("*.csv"))

# 2. Lazy loading with Polars (memory-efficient streaming)
df = pl.concat([pl.scan_csv(f) for f in files])

# 3. Group by line and hour (aggregate duplicate records)
agg = (df
    .select(['transition_date', 'transition_hour', 'number_of_passage', 'line_name'])
    .group_by(['transition_date', 'transition_hour', 'line_name'])
    .agg(pl.sum('number_of_passage').alias('passage_sum'))
)

# 4. Write to interim storage
agg.collect(engine="streaming").write_parquet("data/interim/transport_hourly.parquet")
```

**Output**:
- `data/interim/transport_hourly.parquet`: Aggregated hourly passenger counts
- `data/processed/transport_meta.parquet`: Line metadata (types, descriptions)

**Performance**: Processes ~50M rows in <5 minutes using Polars streaming engine

---

### Phase 2: Data Cleaning (`src/data_prep/clean_data.py`)

**Purpose**: Remove invalid records and handle missing values

**Cleaning Steps**:

1. **Remove Null Districts**:
   ```python
   df = df.dropna(subset=["town"])
   ```

2. **Outlier Detection (Winsorization)**:
   - Calculate per-line 99th percentile
   - Cap extreme values to 3 standard deviations
   - Preserve legitimate spikes (rush hours, events)

3. **Zero-Value Handling**:
   - Keep zeros during operational hours (valid low traffic)
   - Flag consecutive zeros as potential service disruptions

**Output**: `data/processed/transport_district_hourly_clean.parquet`

---

## Feature Engineering

### Step 1: Lag & Rolling Features (`src/features/build_log_roliing_transport_data.py`)

**Purpose**: Create time-series features capturing historical patterns

**Features Created**:

```python
lags = [24, 48, 168]              # 1 day, 2 days, 1 week
windows = [24]                     # 24-hour rolling window

# For each transport line:
lag_24h   = passenger_count.shift(24)     # Yesterday same hour
lag_48h   = passenger_count.shift(48)     # 2 days ago same hour
lag_168h  = passenger_count.shift(168)    # Last week same hour

roll_mean_24h = passenger_count.rolling(24).mean()  # 24h moving average
roll_std_24h  = passenger_count.rolling(24).std()   # 24h volatility
```

**Warm-up Period**: 
- First 168 rows per line discarded (insufficient lag history)
- Ensures no null values in lag features
- Total data loss: ~3% of dataset

**Polars Implementation** (grouped operations):
```python
df = df.sort(["line_name", "datetime"])

for lag in lags:
    df = df.with_columns([
        pl.col("passage_sum")
          .shift(lag)
          .over("line_name")
          .alias(f"lag_{lag}h")
    ])

for window in windows:
    df = df.with_columns([
        pl.col("passage_sum")
          .rolling_mean(window_size=window)
          .over("line_name")
          .alias(f"roll_mean_{window}h")
    ])
```

**Output**: `data/processed/lag_rolling_transport_hourly.parquet`

---

### Step 2: Calendar Features (`src/features/build_calendar_dim.py`)

**Purpose**: Capture temporal patterns and special events

**Features Created**:

| Feature | Type | Values | Impact |
|---------|------|--------|--------|
| `day_of_week` | int | 0-6 (Mon-Sun) | Weekday commuting patterns |
| `is_weekend` | bool | 0/1 | Lower weekday traffic |
| `month` | int | 1-12 | Seasonal variations |
| `season` | categorical | Spring/Summer/Fall/Winter | Tourism, weather effects |
| `is_school_term` | bool | 0/1 if Jun/Jul/Aug | 30% traffic reduction in summer |
| `is_holiday` | bool | 0/1 | 50-70% traffic drop on holidays |
| `holiday_win_m1` | bool | Day before holiday | Early departures (traffic spike) |
| `holiday_win_p1` | bool | Day after holiday | Late returns (traffic spike) |

**Holiday Processing**:
```python
# Load holiday calendar
holidays = pl.read_csv("data/raw/holidays-2022-2031.csv")

# Unpivot wide format to long format
holidays_long = (
    holidays.unpivot(
        index="date",
        on=holiday_cols,
        variable_name="holiday_name",
        value_name="is_holiday"
    )
    .filter(pl.col("is_holiday") == 1)
)

# Join with calendar dimension
calendar = calendar.join(holidays_long, on="date", how="left")

# Fill non-holidays with 0
calendar = calendar.with_columns(pl.col("is_holiday").fill_null(0))

# Create holiday windows (±1 day)
calendar = calendar.with_columns([
    pl.col("is_holiday").shift(1).fill_null(0).alias("holiday_win_m1"),
    pl.col("is_holiday").shift(-1).fill_null(0).alias("holiday_win_p1")
])
```

**Date Range**: 2022-01-01 to 2031-12-31 (pre-computed for future predictions)

**Output**: `data/processed/calendar_dim.parquet`

---

### Step 3: Weather Features (`src/features/build_weather_dim.py`)

**Purpose**: Integrate meteorological conditions affecting ridership

**Data Retrieval** (Open-Meteo API):
```python
import openmeteo_requests
from retry_requests import retry

# Configure client with caching and retry
cache_session = requests_cache.CachedSession('data/cache', expire_after=1)
retry_session = retry(cache_session, retries=5, backoff_factor=0.2)
openmeteo = openmeteo_requests.Client(session=retry_session)

# Batch requests by year
batches = [
    ("2022-01-01", "2022-12-31"),
    ("2023-01-01", "2023-12-31"),
    ("2024-01-01", "2024-09-30")
]

for start_date, end_date in batches:
    params = {
        "latitude": 41.0082,
        "longitude": 28.9784,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": ["temperature_2m", "precipitation", "wind_speed_10m"],
        "timezone": "Europe/Istanbul"
    }
    
    responses = openmeteo.weather_api(url, params=params)
    # Process and store...
```

**Weather Impact on Ridership**:
- **Temperature**: Non-linear effect (discomfort at extremes)
  - < 5°C: +15% metro usage (avoid cold)
  - 15-25°C: Baseline
  - > 35°C: +20% metro usage (AC refuge)
- **Precipitation**: Strong negative correlation with bus ridership
  - Light rain (0-5mm): -10% bus, +5% metro
  - Heavy rain (>10mm): -30% bus, +15% metro
- **Wind Speed**: Minimal impact (<5% variation)

**Output**: `data/processed/weather_dim.parquet`

---

### Step 4: Final Feature Consolidation (`src/features/build_final_features.py`)

**Purpose**: Join all feature tables into a single training-ready dataset

**Process**:
```python
# Load all feature tables
transport = pl.read_parquet("data/processed/lag_rolling_transport_hourly.parquet")
weather   = pl.read_parquet("data/processed/weather_dim.parquet")
calendar  = pl.read_parquet("data/processed/calendar_dim.parquet")

# Select relevant columns
transport = transport.select([
    pl.col("datetime"),
    pl.col("line_name"),
    pl.col("passage_sum").alias("y"),         # Target variable
    pl.col("transition_hour").alias("hour_of_day"),
    pl.col("lag_24h"),
    pl.col("lag_48h"),
    pl.col("lag_168h"),
    pl.col("roll_mean_24h"),
    pl.col("roll_std_24h"),
])

# Join on datetime (weather) and date (calendar)
features = (
    transport
    .join(weather, on="datetime", how="left")
    .with_columns(pl.col("datetime").dt.date().alias("date"))
    .join(calendar, on="date", how="left")
)

# Data type optimization
bool_cols = ["is_weekend", "is_school_term", "is_holiday", "holiday_win_m1", "holiday_win_p1"]
features = features.with_columns([pl.col(c).cast(pl.Int8) for c in bool_cols])

# Save final feature set
features.write_parquet("data/processed/features_pl.parquet")
```

**Final Schema** (18 features + 1 target):
```python
{
    'datetime': datetime,           # Timestamp
    'line_name': str,               # Categorical (512 categories)
    'y': float,                     # Target: passenger count
    'hour_of_day': int,             # 0-23
    'lag_24h': float,               # Time-series features
    'lag_48h': float,
    'lag_168h': float,
    'roll_mean_24h': float,
    'roll_std_24h': float,
    'temperature_2m': float,        # Weather features
    'precipitation': float,
    'wind_speed_10m': float,
    'day_of_week': int,             # Calendar features
    'is_weekend': int8,
    'month': int,
    'season': str,                  # Categorical (4 categories)
    'is_school_term': int8,
    'is_holiday': int8,
    'holiday_win_m1': int8,
    'holiday_win_p1': int8
}
```

**Dataset Size**: ~45M rows, 2.3 GB parquet file

**Output**: `data/processed/features_pl.parquet`

---

### Step 5: Train/Val Split (`src/features/split_features.py`)

**Purpose**: Create time-based splits for time-series cross-validation

**Split Strategy**:
```python
# Time-based split (NO random shuffling)
split_date = "2024-07-01"

train = features.filter(pl.col("datetime") < split_date)
val   = features.filter(pl.col("datetime") >= split_date)

# Save splits
train.write_parquet("data/processed/split_features/train_features.parquet")
val.write_parquet("data/processed/split_features/val_features.parquet")
```

**Split Statistics**:
- **Training Set**: 2022-01-01 to 2024-06-30 (~38M rows, 85%)
- **Validation Set**: 2024-07-01 to 2024-09-30 (~7M rows, 15%)
- **No data leakage**: Strict temporal ordering maintained

---

## Model Training

### Training Script (`src/model/train_model.py`)

**Purpose**: Train LightGBM model with time-series cross-validation and MLflow tracking

### Configuration System

**Architecture**: Hierarchical YAML configs

```
src/model/config/
├── common.yaml          # Shared settings (paths, preprocessing)
├── v1.yaml              # Initial baseline model
├── v2.yaml              # Feature additions
├── v3.yaml              # Hyperparameter tuning
├── v4.yaml              # Regularization improvements
├── v5.yaml              # TSCV validation added
└── v6.yaml              # Production model (current)
```

**v6.yaml Configuration** (Production Model):
```yaml
model:
  name: "lgbm_transport_v6"
  description: "Anti-overfit model. No short-term lags. TSCV-validated."
  num_boost_round: 2000
  final_model_name: "lgbm_transport_v6.txt"

params:
  objective: "regression"
  metric: ["l1", "l2"]              # MAE and RMSE
  boosting_type: "gbdt"
  learning_rate: 0.03               # Conservative learning rate
  num_leaves: 31                    # Reduced from 63 (prevent overfit)
  min_data_in_leaf: 500             # Regularization (was 100)
  feature_fraction: 0.8             # Column sampling
  bagging_fraction: 0.8             # Row sampling
  bagging_freq: 1
  lambda_l1: 0.1                    # L1 regularization
  lambda_l2: 1.0                    # L2 regularization
  deterministic: true               # Reproducible results

train:
  early_stopping_rounds: 100
  eval_freq: 100
  n_splits: 3                       # 3-fold TSCV
  datetime_sort_col: "datetime"
  target_col: "y"

features:
  all:
    - 'line_name'
    - 'hour_of_day'
    - 'lag_24h'
    - 'lag_48h'
    - 'lag_168h'
    - 'roll_mean_24h'
    - 'roll_std_24h'
    - 'temperature_2m'
    - 'precipitation'
    - 'wind_speed_10m'
    - 'day_of_week'
    - 'is_weekend'
    - 'month'
    - 'season'
    - 'is_school_term'
    - 'is_holiday'
    - 'holiday_win_m1'
    - 'holiday_win_p1'
  
  categorical:
    - "line_name"
    - "season"
```

---

### Training Process

**Step 1: Data Loading & Preparation**
```python
def load_and_sort_all_data():
    # Load train and validation sets
    train_df = pd.read_parquet("data/processed/split_features/train_features.parquet")
    val_df   = pd.read_parquet("data/processed/split_features/val_features.parquet")
    
    # Combine for TSCV
    full_df = pd.concat([train_df, val_df], ignore_index=True)
    
    # CRITICAL: Sort by time (required for TSCV)
    full_df = full_df.sort_values(by="datetime").reset_index(drop=True)
    
    return full_df
```

**Step 2: Time-Series Cross-Validation (TSCV)**
```python
from sklearn.model_selection import TimeSeriesSplit

# 3-fold TSCV (no shuffling, respects temporal order)
tscv = TimeSeriesSplit(n_splits=3)

fold_scores = []
for fold, (train_index, val_index) in enumerate(tscv.split(X_all)):
    X_train, X_val = X_all.iloc[train_index], X_all.iloc[val_index]
    y_train, y_val = y_all.iloc[train_index], y_all.iloc[val_index]
    
    # Train fold model
    model = lgb.train(
        params,
        lgb.Dataset(X_train, y_train, categorical_feature=cat_features),
        num_boost_round=2000,
        valid_sets=[lgb.Dataset(X_val, y_val)],
        callbacks=[lgb.early_stopping(100)]
    )
    
    # Log fold MAE
    fold_mae = model.best_score["valid"]["l1"]
    fold_scores.append(fold_mae)

# Compute "honest" cross-validated MAE
avg_mae = np.mean(fold_scores)  # ~1850 passengers (v6)
```

**TSCV Visualization**:
```
Fold 1: Train [====== 60% ======] | Val [10%]
Fold 2: Train [=========== 70% ===========] | Val [10%]
Fold 3: Train [================ 80% ================] | Val [10%]
```

**Step 3: Final Model Training**
```python
# Train on all data (except last fold's validation for early stopping)
final_model = lgb.train(
    params,
    train_set_final,
    num_boost_round=2000,
    valid_sets=[val_set_final],
    callbacks=[lgb.early_stopping(100), lgb.log_evaluation(100)]
)

# Save model
final_model.save_model("models/lgbm_transport_v6.txt")
```

**Step 4: MLflow Experiment Tracking**
```python
import mlflow
import mlflow.lightgbm

mlflow.set_tracking_uri("file://mlruns")
mlflow.set_experiment("IstanbulCrowdingForecast")

with mlflow.start_run(run_name="lgbm_transport_v6_TSCV"):
    # Log hyperparameters
    mlflow.log_params(params)
    mlflow.log_param("n_splits", 3)
    
    # Log TSCV metrics
    mlflow.log_metric("avg_mae_tscv", avg_mae)
    
    # Log final model
    mlflow.lightgbm.log_model(final_model, "final_model")
    mlflow.log_artifact("models/lgbm_transport_v6.txt")
```

**Training Performance**:
- **Total Runtime**: ~25 minutes (M1 Pro, 8 cores)
- **Memory Usage**: ~12 GB peak
- **Best Iteration**: ~1200 rounds (early stopping triggered)
- **Validation MAE**: 1847 passengers (v6)

---

## Model Evaluation

### Evaluation Script (`src/model/eval_model.py`)

**Purpose**: Comprehensive model performance analysis with baseline comparisons

### Metrics Calculated

**1. Primary Metrics**:
```python
MAE   = mean(|y_true - y_pred|)              # Mean Absolute Error
RMSE  = sqrt(mean((y_true - y_pred)²))       # Root Mean Squared Error
SMAPE = mean(|y_true - y_pred| / ((|y_true| + |y_pred|) / 2))  # Symmetric MAPE
```

**2. Baseline Comparisons**:
```python
# Baseline 1: Lag-24h (yesterday same hour)
baseline_lag24 = val_df["lag_24h"]

# Baseline 2: Lag-168h (last week same hour)
baseline_lag168 = val_df["lag_168h"]

# Baseline 3: Historical mean (per line, per hour)
baseline_linehour = train_df.groupby(["line_name", "hour_of_day"])["y"].mean()

# Calculate improvement
improvement = (baseline_mae - model_mae) / baseline_mae * 100
```

**3. Segment-Level Metrics**:
```python
# MAE by hour of day (identify peak hour errors)
mae_by_hour = results.groupby("hour_of_day")["abs_error"].mean()

# MAE by transport line (find problematic lines)
mae_by_line = results.groupby("line_name")["abs_error"].mean().sort_values()

# Top 10 worst lines
worst_lines = mae_by_line.tail(10)
```

---

### v6 Model Performance (Production)

**Overall Metrics** (Validation Set: Jul-Sep 2024):
```
MAE:   1847 passengers   (vs 2130 lag-24h baseline → 13.3% improvement)
RMSE:  3214 passengers
SMAPE: 0.47 (47% average error relative to scale)

Baseline Comparisons:
  Lag-24h:        2130 MAE  →  13.3% worse than model
  Lag-168h:       2456 MAE  →  24.8% worse than model
  Line-Hour Mean: 2089 MAE  →  11.6% worse than model
```

**Performance by Hour**:
```
Best Hours:
  03:00-05:00 → MAE 520  (low traffic, predictable)
  23:00-01:00 → MAE 680  (late night, stable)

Worst Hours:
  08:00-09:00 → MAE 3420  (morning rush, high variance)
  17:00-19:00 → MAE 3180  (evening rush, unpredictable)

Observation: Rush hour predictions have 6x higher error due to:
  - Event-driven spikes (concerts, sports)
  - Weather sensitivity (rain → metro surge)
  - Day-to-day volatility
```

**Performance by Line Type**:
```
Metro Lines:  MAE 1620  (more predictable, fixed capacity)
Bus Lines:    MAE 1890  (weather-sensitive, traffic delays)
```

**Top 10 Worst Predicted Lines** (Highest MAE):
```
1. M1 (Metro):      MAE 8947  (busiest line, high baseline variance)
2. 500T (Bus):      MAE 6234  (airport line, tourism/travel peaks)
3. 34 (Bus):        MAE 5821  (major corridor, event-sensitive)
4. M2 (Metro):      MAE 5412  (second busiest metro)
5. 15F (Bus):       MAE 4980  (tourist route, seasonal)
...
```

---

### Feature Importance Analysis

**Top 15 Features by Gain** (v6):
```
1.  line_name          45.2%  (categorical encoding of 512 lines)
2.  hour_of_day        18.7%  (peak hours dominate predictions)
3.  lag_168h           12.3%  (weekly patterns strongest)
4.  roll_mean_24h       7.8%  (moving average smooths noise)
5.  day_of_week         4.2%  (weekday vs weekend split)
6.  lag_24h             3.9%  (yesterday's value)
7.  temperature_2m      2.1%  (weather impact moderate)
8.  is_holiday          1.8%  (holiday effect binary)
9.  month               1.3%  (seasonal trends)
10. season              0.9%  (Winter/Spring/Summer/Fall)
11. is_weekend          0.7%  (redundant with day_of_week)
12. lag_48h             0.5%  (weaker than 24h and 168h)
13. precipitation       0.3%  (rain effect small but real)
14. is_school_term      0.2%  (summer vacation impact)
15. roll_std_24h        0.1%  (volatility measure)
```

**Key Insights**:
- **line_name** dominates (45%) → Line-specific patterns are critical
- **hour_of_day** (19%) → Time-of-day is second most important
- **lag_168h** (12%) beats **lag_24h** (4%) → Weekly patterns > daily
- **Weather** features contribute ~2.5% total → Moderate impact
- **Holiday** features combine for ~2% → Important for special days

---

### SHAP Analysis

**Global Feature Impact**:
```python
import shap

explainer = shap.TreeExplainer(model)
shap_values = explainer.shap_values(X_val.sample(5000))

shap.summary_plot(shap_values, X_val.sample(5000), max_display=25)
```

**SHAP Insights** (Feature Interactions):

1. **line_name × hour_of_day**: 
   - Metro lines show symmetric peaks (8AM and 6PM)
   - Bus lines show asymmetric peaks (8AM > 6PM)

2. **lag_168h × is_holiday**:
   - Normal weeks: lag_168h SHAP = +500 to +1500
   - Holiday weeks: lag_168h SHAP = -800 to -300 (pattern breaks)

3. **temperature_2m × hour_of_day**:
   - High temp (>30°C) at rush hours → +200 passengers (metro AC refuge)
   - High temp (>30°C) at midday → -150 passengers (people stay indoors)

4. **precipitation × road_type**:
   - Rain + Bus → SHAP = -400 (people avoid buses)
   - Rain + Metro → SHAP = +300 (people prefer underground)

---

## Model Versioning

### Version History

| Version | Date | Key Changes | Val MAE | Improvement |
|---------|------|-------------|---------|-------------|
| **v1** | 2024-10 | Baseline: Basic features, high learning rate | 2340 | - |
| **v2** | 2024-10 | + Weather features | 2180 | +6.8% |
| **v3** | 2024-11 | + Holiday windows, tuned hyperparams | 2050 | +12.4% |
| **v4** | 2024-11 | + Rolling features, regularization | 1950 | +16.7% |
| **v5** | 2024-11 | TSCV validation, early stopping tuning | 1890 | +19.2% |
| **v6** | 2024-12 | Stronger regularization, removed short lags | **1847** | **+21.1%** |
| **v7** | 2025-12 | Split blacklist filtering + production alignment | (see reports) | - |

### Model Selection Criteria

**v6 chosen as production model**:
- ✅ Best cross-validated MAE (1847)
- ✅ 13.3% improvement over lag-24h baseline
- ✅ No overfitting (train MAE = 1780, val MAE = 1847, diff = 3.6%)
- ✅ Stable predictions across all line types
- ✅ Interpretable feature importance (no single feature >50%)

**Update (2025-12)**: Model `v7` is now the production default in the API (see `src/model/config/v7.yaml` and `src/api/main.py`).

---

## Reproducibility

### Environment Setup

**Python Version**: 3.10+

Project target: Python 3.11 (backend).

**requirements.txt**:
```
polars==0.19.12
pandas==2.1.3
lightgbm==4.1.0
mlflow==2.9.2
shap==0.43.0
scikit-learn==1.3.2
openmeteo-requests==1.2.0
requests-cache==1.1.0
retry-requests==2.0.0
matplotlib==3.8.2
seaborn==0.13.0
pyyaml==6.0.1
```

### Running the Full Pipeline

**Step 1: Data Preparation**
```bash
# 1. Load raw CSV files
python src/data_prep/load_raw.py

# 2. Clean data
python src/data_prep/clean_data.py

# 3. Build features
python src/features/build_log_roliing_transport_data.py
python src/features/build_calendar_dim.py
python src/features/build_weather_dim.py
python src/features/build_final_features.py

# 4. Split train/val
python src/features/split_features.py
```

**Step 2: Model Training**
```bash
# Train v6 model with TSCV
python src/model/train_model.py

# Output: models/lgbm_transport_v6.txt

# Train v7 model (production default)
python src/model/train_model.py --config src/model/config/v7.yaml

# Output: models/lgbm_transport_v7.txt
```

**Step 3: Model Evaluation**
```bash
# Evaluate all models in /models directory
python src/model/eval_model.py

# Output: 
#   reports/logs/metrics_*.json
#   reports/figs/feature_importance_*.png
#   reports/figs/shap_summary_*.png
```

**Step 4: View MLflow Experiments**
```bash
mlflow ui --backend-store-uri file://mlruns
# Open: http://localhost:5000
```

---

### Random Seed Configuration

**Deterministic Training**:
```python
# All random operations seeded
import random
import numpy as np

random.seed(42)
np.random.seed(42)

# LightGBM deterministic mode
params = {
    "deterministic": True,
    "seed": 42,
    "bagging_seed": 42,
    "feature_fraction_seed": 42
}
```

**Reproducibility Checklist**:
- [x] Same data order (sort by datetime)
- [x] Same feature engineering logic
- [x] Same TSCV splits (deterministic indices)
- [x] Same hyperparameters (frozen in YAML)
- [x] Same random seeds
- [x] Same library versions (pinned in requirements.txt)

---

## Performance Metrics

### Data Processing Performance

| Stage | Input Size | Output Size | Runtime | Memory |
|-------|-----------|-------------|---------|--------|
| Load Raw | 50M rows (CSV) | 45M rows | 4 min | 8 GB |
| Clean Data | 45M rows | 44M rows | 30 sec | 4 GB |
| Lag/Rolling | 44M rows | 42M rows | 8 min | 12 GB |
| Calendar Dim | N/A | 3,652 days | 1 sec | 10 MB |
| Weather Dim | API calls | 24,000 hours | 2 min | 50 MB |
| Join Features | 42M rows | 42M rows | 5 min | 10 GB |
| Split Train/Val | 42M rows | Train: 36M, Val: 6M | 30 sec | 6 GB |
| **Total Pipeline** | **50M rows** | **42M rows** | **20 min** | **12 GB peak** |

### Model Training Performance

**Hardware**: Apple M1 Pro (8-core CPU, 16 GB RAM)

| Task | Runtime | Memory | Iterations |
|------|---------|--------|-----------|
| Single Fold Training | 6 min | 10 GB | ~1200 |
| 3-Fold TSCV | 18 min | 10 GB | 3×1200 |
| Final Model Training | 7 min | 12 GB | ~1250 |
| **Total Training Time** | **25 min** | **12 GB** | **4,850 total** |

### Inference Performance

**Batch Prediction** (500 lines × 24 hours = 12,000 predictions):
- **Latency**: 4.2 seconds
- **Throughput**: 2,857 predictions/second
- **Memory**: 800 MB

**Single Prediction** (1 line, 1 hour):
- **Latency**: <5 milliseconds
- **Throughput**: >200 predictions/second

---

## Appendix

### Glossary

- **TSCV**: Time-Series Cross-Validation - Respects temporal ordering, no shuffling
- **Lag Feature**: Historical value from X hours ago
- **Rolling Feature**: Moving statistics over a time window
- **SHAP**: SHapley Additive exPlanations - Model interpretation technique
- **Winsorization**: Outlier capping at percentiles
- **Polars**: High-performance DataFrame library (Rust-based)
- **MLflow**: Experiment tracking and model registry platform

### Directory Structure

```
ibb-transport/
├── data/
│   ├── raw/                    # Original CSV files
│   ├── interim/                # Intermediate processing
│   ├── processed/              # Final feature sets
│   │   └── split_features/     # Train/val splits
│   └── cache/                  # Weather API cache
├── models/                     # Trained model files
│   └── lgbm_transport_v6.txt
├── reports/
│   ├── logs/                   # Evaluation metrics JSON
│   └── figs/                   # Plots and visualizations
├── mlruns/                     # MLflow experiment tracking
└── src/
    ├── data_prep/              # ETL scripts
    ├── features/               # Feature engineering
    ├── model/                  # Training and evaluation
    │   ├── config/             # Model version configs
    │   └── utils/              # Helper functions
    └── api/                    # Production serving (see API README)
```

---

**Last Updated**: December 2025  
**Pipeline Version**: 2.0  
**Production Model**: v6  
