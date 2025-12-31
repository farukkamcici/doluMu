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
│          STEP 0: ETL & INTERIM PREPARATION                  │
├─────────────────────────────────────────────────────────────┤
│  src/data_prep/load_raw.py                                  │
│    ├─ Always: write line metadata                            │
│    │    Output: data/processed/transport_meta.parquet         │
│    └─ Optional: uncomment hourly aggregation scaffold         │
│         Output: data/interim/transport_hourly.parquet         │
│                                                             │
│  Note: src/data_prep/clean_data.py is a minimal example       │
│        cleaner for district-level parquet, not the main ETL.  │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              STEP 1: FEATURE ENGINEERING                    │
├─────────────────────────────────────────────────────────────┤
│  build_log_roliing_transport_data.py                         │
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
│  convert_features_to_pandas.py                               │
│    └─ features_pl.parquet -> features_pd.parquet             │
│                                                             │
│  split_features.py                                           │
│    └─ Time-based train/val/test split                        │
│                                                             │
│  Output: data/processed/features_pl.parquet                  │
│          data/processed/features_pd.parquet                  │
│          data/processed/split_features/*.parquet             │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              STEP 3: MODEL TRAINING                         │
├─────────────────────────────────────────────────────────────┤
│  train_model.py                                             │
│    ├─ Time-Series Cross-Validation (TSCV)                  │
│    ├─ LightGBM gradient boosting                           │
│    └─ MLflow experiment tracking                           │
│                                                             │
│  Output: models/lgbm_transport_v7.txt (or v6, v5...)         │
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
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              STEP 5: MODEL TEST / GATES                     │
├─────────────────────────────────────────────────────────────┤
│  test_model.py                                              │
│    └─ Hold-out test metrics + sanity checks                 │
│                                                             │
│  (Optional / Planned) API contract tests via pytest          │
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
**Format**: Multiple CSV files (multi-year)  
**Granularity**: Line-level, hourly passenger counts  
**Size**: Dataset-dependent (large, multi-year)

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
The pipeline assumes the raw feed may contain:
- Missing values in descriptive columns (e.g. `town`)
- Duplicate records that need hourly aggregation
- Zeros from genuine low demand or service disruptions

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

**Purpose**:
- Always: extract per-line metadata to support filtering and API lookups.
- Optional: generate an hourly aggregated parquet (`data/interim/transport_hourly.parquet`) if you enable the scaffold.

**Process**:

```python
# NOTE: In the current repository state, the hourly aggregation is present
# in `src/data_prep/load_raw.py` but commented out.

files = sorted(Path("../../data/raw").glob("*.csv"))
df = pl.concat([pl.scan_csv(f) for f in files])

# Line meta-data (ACTIVE)
district_meta = (
    df.select(['transport_type_id', 'road_type', 'line', 'line_name'])
      .unique(subset=['line_name'])
)
district_meta.sink_parquet("../../data/processed/transport_meta.parquet")

# Hourly line aggregation (SCAFFOLD - currently commented in code)
# agg = (
#     df.select(['transition_date', 'transition_hour', 'number_of_passage', 'line_name'])
#       .group_by(['transition_date', 'transition_hour', 'line_name'])
#       .agg(pl.sum('number_of_passage').alias('passage_sum'))
# )
# agg.collect(engine="streaming").write_parquet("../../data/interim/transport_hourly.parquet")
```

**Output**:
- `data/processed/transport_meta.parquet`: Line metadata (types, descriptions)
- `data/interim/transport_hourly.parquet`: (optional) Aggregated hourly passenger counts, required by `build_log_roliing_transport_data.py`

---

### Phase 2: Data Cleaning (`src/data_prep/clean_data.py`)

**Purpose**: Minimal example cleaner for district-level parquet.

**Cleaning Steps**:

1. **Remove Null Districts**:
   ```python
   df = df.dropna(subset=["town"])
   ```

**Output**: `data/processed/transport_district_hourly_clean.parquet` (if the input `data/processed/transport_district_hourly.parquet` exists)

---

## Feature Engineering

### Step 1: Lag & Rolling Features (`src/features/build_log_roliing_transport_data.py`)

**Purpose**: Create time-series features capturing historical patterns

**Features Created**:

```python
lags = [24, 48, 168]              # 1 day, 2 days, 1 week
windows = [24]                     # 24-hour rolling window

# For each transport line:
lag_24h   = passage_sum.shift(24)     # Yesterday same hour
lag_48h   = passage_sum.shift(48)     # 2 days ago same hour
lag_168h  = passage_sum.shift(168)    # Last week same hour

roll_mean_24h = passage_sum.rolling(24).mean()  # 24h moving average
roll_std_24h  = passage_sum.rolling(24).std()   # 24h volatility
```

**Warm-up Period**: 
- First 168 rows per line discarded (insufficient lag history)
- Ensures no null values in lag features
- Proportion of dropped rows depends on dataset/line coverage

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
| `is_school_term` | bool | 0/1 (months 6-8 treated as out-of-term) | School term proxy |
| `is_holiday` | bool | 0/1 | Public holiday indicator |
| `holiday_win_m1` | bool | Day before holiday | Holiday spillover feature |
| `holiday_win_p1` | bool | Day after holiday | Holiday spillover feature |

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

**Note on impact**: The pipeline only defines weather feature columns; the model learns any relationships from data. This document avoids hardcoding behavioral assumptions or percentage effects.

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
    'line_name': str,               # Categorical line code
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
    'season': str,                  # Categorical (Winter/Spring/Summer/Fall)
    'is_school_term': int8,
    'is_holiday': int8,
    'holiday_win_m1': int8,
    'holiday_win_p1': int8
}
```

**Output**: `data/processed/features_pl.parquet`

---

### Step 5: Train/Val/Test Split (`src/features/split_features.py`)

**Purpose**: Create time-based splits for time-series cross-validation

**Split Strategy** (as implemented):
```python
# Reads data/processed/features_pd.parquet
features["datetime"] = pd.to_datetime(features["datetime"])

train_df = features[features["datetime"] <= "2024-04-30"]
val_df = features[(features["datetime"] > "2024-04-30") & (features["datetime"] <= "2024-06-30")]
test_df = features[features["datetime"] > "2024-06-30"]

train_df.to_parquet("data/processed/split_features/train_features.parquet", index=False)
val_df.to_parquet("data/processed/split_features/val_features.parquet", index=False)
test_df.to_parquet("data/processed/split_features/test_features.parquet", index=False)
```

**No leakage**: The split is purely time-based (no random shuffling).

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
├── v3.yaml              # DART boosting variant
├── v4.yaml              # Regularization improvements
├── v5.yaml              # TSCV validation added
├── v6.yaml              # Previous production default
└── v7.yaml              # Current API default
```

**v7.yaml Configuration** (Current API default):
```yaml
model:
  name: "lgbm_transport_v7"
  description: "Same as v6 params/features; excludes out-of-scope line_name list at split stage."
  num_boost_round: 2000
  final_model_name: "lgbm_transport_v7.txt"

params:
  objective: "regression"
  metric: ["l1", "l2"]
  boosting_type: "gbdt"
  learning_rate: 0.03
  n_jobs: -1
  verbose: -1
  deterministic: true
  num_leaves: 31
  min_data_in_leaf: 500
  feature_fraction: 0.8
  bagging_fraction: 0.8
  bagging_freq: 1
  lambda_l1: 0.1
  lambda_l2: 1.0

train:
  early_stopping_rounds: 100
  eval_freq: 100
  n_splits: 3
  baseline_mae_target: 273.0
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
        lgb.Dataset(X_train, label=y_train, categorical_feature=cat_features),
        num_boost_round=2000,
        valid_sets=[lgb.Dataset(X_val, label=y_val)],
        callbacks=[lgb.early_stopping(100)]
    )
    
    # Log fold MAE
    fold_mae = model.best_score["valid"]["l1"]
    fold_scores.append(fold_mae)

# Compute "honest" cross-validated MAE
avg_mae = np.mean(fold_scores)
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
final_model.save_model("models/lgbm_transport_v7.txt")
```

**Step 4: MLflow Experiment Tracking**
```python
import mlflow
import mlflow.lightgbm

mlflow.set_tracking_uri("file://mlruns")
mlflow.set_experiment("IstanbulCrowdingForecast")

with mlflow.start_run(run_name="lgbm_transport_v7_TSCV"):
    # Log hyperparameters
    mlflow.log_params(params)
    mlflow.log_param("n_splits", 3)
    
    # Log TSCV metrics
    mlflow.log_metric("avg_mae_tscv", avg_mae)
    
    # Log final model
    mlflow.lightgbm.log_model(final_model, "final_model")
    mlflow.log_artifact("models/lgbm_transport_v7.txt")
```

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

### Feature Importance & SHAP

`src/model/eval_model.py` generates model diagnostics from the validation split:
- Gain-based feature importance plot
- SHAP summary plot using `shap.TreeExplainer` on a sampled subset of validation rows

Outputs are written under `reports/` (filenames include the model name), for example:
- `reports/figs/feature_importance_<model>.png`
- `reports/figs/shap_summary_<model>.png`

These plots depend on the trained model and the dataset used; this document intentionally avoids hardcoding numeric importances.
---

## Model Versioning

### Version History

Versions are tracked via YAML configs under `src/model/config/`.

| Version | Config | Notes |
|---------|--------|-------|
| `v1` | `src/model/config/v1.yaml` | Early baseline |
| `v2` | `src/model/config/v2.yaml` | Variant iteration |
| `v3` | `src/model/config/v3.yaml` | DART boosting variant |
| `v4` | `src/model/config/v4.yaml` | Regularization/feature iteration |
| `v5` | `src/model/config/v5.yaml` | Adds TSCV in `train_model.py` |
| `v6` | `src/model/config/v6.yaml` | Previous production default |
| `v7` | `src/model/config/v7.yaml` | Current API default + split filtering support |

### Model Selection Criteria

**Current default**: Model `v7` is the API default (see `src/model/config/v7.yaml` and `src/api/main.py`).

You can override the loaded booster by setting `MODEL_PATH` when starting the API.

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
# NOTE: ETL/feature scripts under `src/data_prep/` and `src/features/` use
# relative `../../data/...` paths, so run them from their own directories.

# 1. Load raw CSV files (writes `data/processed/transport_meta.parquet`)
(cd src/data_prep && python load_raw.py)

# 2. Ensure `data/interim/transport_hourly.parquet` exists
#    - `src/data_prep/load_raw.py` contains an hourly aggregation scaffold (currently commented)
#    - alternatively, generate the parquet externally as long as it matches the expected schema

# 3. Build features
(cd src/features && python build_log_roliing_transport_data.py)
(cd src/features && python build_calendar_dim.py)
(cd src/features && python build_weather_dim.py)
(cd src/features && python build_final_features.py)
(cd src/features && python convert_features_to_pandas.py)

# (Optional) sanity checks + log
(cd src/features && python check_features_quality.py)

# 4. Split train/val
python src/features/split_features.py
```

**Step 2: Model Training**
```bash
# Train v6 model with TSCV (default)
python src/model/train_model.py

# Output: models/lgbm_transport_v6.txt

# Train v7 model (production default)
python src/model/train_model.py --version v7

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

This repository does not store canonical runtime/throughput benchmarks because they vary heavily by:
- Hardware (CPU cores, RAM, disk)
- Dataset size and parquet layout
- Whether Polars/LightGBM can use multithreading effectively

To benchmark your environment, use simple wall-clock timing around each stage (and record your machine specs):

```bash
time (cd src/features && python build_log_roliing_transport_data.py)
time (cd src/features && python build_final_features.py)
time python src/features/split_features.py
time python src/model/train_model.py --version v7
time python src/model/eval_model.py
time python src/model/test_model.py
```

---

## Appendix

### Glossary

- **TSCV**: Time-Series Cross-Validation - Respects temporal ordering, no shuffling
- **Lag Feature**: Historical value from X hours ago
- **Rolling Feature**: Moving statistics over a time window
- **SHAP**: SHapley Additive exPlanations - Model interpretation technique
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
│   └── lgbm_transport_v7.txt
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
