# Istanbul Transport Crowding Prediction API

**Backend API Documentation**  
Machine Learning-Powered Real-Time Transit Forecasting System

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [API Endpoints](#api-endpoints)
5. [Data Pipeline](#data-pipeline)
6. [Machine Learning Integration](#machine-learning-integration)
7. [Caching & Performance](#caching--performance)
8. [Background Jobs](#background-jobs)
9. [Database Schema](#database-schema)
10. [External Integrations](#external-integrations)
11. [Capacity & Trips-Per-Hour](#capacity--trips-per-hour)

---

## System Overview

The Istanbul Transport API is a high-performance FastAPI-based backend that delivers **24-hour crowding predictions** for Istanbul's public transportation network (metro and bus lines). The system combines:

- **Machine Learning**: LightGBM gradient boosting model trained on historical passenger data
- **Real-Time Data**: Weather forecasting and live metro schedules
- **Smart Caching**: Multi-layer caching strategy for sub-second response times
- **Automated Jobs**: Daily forecast generation and data maintenance

### Key Features

✅ **Pre-calculated Forecasts**: Batch predictions stored in PostgreSQL  
✅ **Real-Time Weather Integration**: Open-Meteo API with fallback mechanisms  
✅ **Metro Live Data**: Direct integration with Metro Istanbul API  
✅ **Intelligent Caching**: TTL-based caching for frequently accessed data  
✅ **Robust Error Handling**: Graceful degradation and retry logic  
✅ **Automated Scheduling**: APScheduler-based cron jobs for maintenance  

---

## Architecture

### High-Level Architecture Diagram

```
┌─────────────────┐
│  Next.js Client │
└────────┬────────┘
         │ HTTP/REST
         ▼
┌────────────────────────────────────────┐
│        FastAPI Application             │
│  ┌──────────────────────────────────┐  │
│  │      Routers (Endpoints)         │  │
│  │  - Forecast  - Lines   - Metro   │  │
│  │  - Nowcast   - Admin   - Status  │  │
│  └──────────────┬───────────────────┘  │
│                 │                       │
│  ┌──────────────▼───────────────────┐  │
│  │    Business Logic Services       │  │
│  │  - Feature Store (Polars)        │  │
│  │  - Weather Service (Open-Meteo)  │  │
│  │  - Metro Service (Topology)      │  │
│  │  - Batch Forecast Engine         │  │
│  └──────────────┬───────────────────┘  │
│                 │                       │
│  ┌──────────────▼───────────────────┐  │
│  │      Application State           │  │
│  │  - LightGBM Model (in-memory)    │  │
│  │  - Feature Store Cache           │  │
│  │  - Route Shapes (JSON)           │  │
│  └──────────────────────────────────┘  │
└────────┬──────────────┬────────────────┘
         │              │
         ▼              ▼
┌────────────────┐  ┌──────────────┐
│   PostgreSQL   │  │ External APIs│
│   Database     │  │ - Metro API  │
│                │  │ - Open-Meteo │
└────────────────┘  └──────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Web Framework** | FastAPI 0.104+ | Async API with automatic OpenAPI docs |
| **ML Runtime** | LightGBM 4.1+ | Gradient boosting model inference |
| **Data Processing** | Polars 0.19+ | High-performance DataFrame operations |
| **Database** | PostgreSQL 15+ | Persistent storage with SQLAlchemy ORM |
| **Caching** | TTLCache (in-memory) | Fast lookup for frequently accessed data |
| **Scheduling** | APScheduler | Automated batch jobs and maintenance |
| **HTTP Client** | httpx | Async external API calls |
| **Validation** | Pydantic v2 | Request/response schema validation |

---

## Core Components

### 1. Application Entry Point (`main.py`)

**Responsibilities:**
- Application lifecycle management (startup/shutdown)
- Model loading and global state initialization
- CORS configuration for frontend communication
- Router registration and middleware setup

**Key Features:**

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load model, initialize Feature Store, start scheduler
    AppState.model = lgb.Booster(model_file=os.getenv('MODEL_PATH', 'models/lgbm_transport_v7.txt'))
    AppState.store = FeatureStore()
    route_service.load_data()
    start_scheduler()
    
    yield
    
    # Shutdown: Clean up resources
    shutdown_scheduler()
    AppState.model = None
    AppState.store = None
```

**Security & Configuration:**
- CORS origins: Configurable via environment variables
- Regex-based origin validation for Vercel preview deployments
- Global exception handler for graceful error responses

---

### 2. Feature Store (`services/store.py`)

**Purpose**: Intelligent historical data retrieval for ML predictions

**Architecture**:
- **Polars-based**: 10-100x faster than Pandas for large datasets
- **Multi-tier lag retrieval**: Seasonal matching → Hour-based fallback → Zeros
- **Pre-computed cache**: Lookup tables indexed by (line, hour, month, day)

**Lag Feature Strategy**:

```python
Priority 1: Seasonal Match (Same month/day, up to 3 years back)
  ├─ Search for same date in previous years
  ├─ Skip data older than max_seasonal_lookback_years
  └─ Verify no None values in lag features

Priority 2: Hour-based Fallback (Most recent data for that hour)
  ├─ Use latest available lag for (line, hour) regardless of date
  └─ Log fallback usage for monitoring

Priority 3: Zero Fallback (Last resort)
  └─ Return zeros if no historical data exists
```

**Performance Optimizations**:
- Column pruning: Only load 7 required columns from parquet
- Data type optimization: Float32 instead of Float64 (50% memory reduction)
- Batch retrieval: Single query for all lines × 24 hours

**Monitoring**:
```python
{
  "seasonal_match": 8547,      # 85% (ideal)
  "hour_fallback": 1234,       # 12% (acceptable)
  "zero_fallback": 219,        # 2% (needs attention)
  "seasonal_pct": 85.47,
  "total_requests": 10000
}
```

---

### 3. Batch Forecast Engine (`services/batch_forecast.py`)

**Purpose**: Generate 24-hour predictions for all transport lines

**Process Flow**:

```
1. Database Transaction Start
   ├─ Create JobExecution record (status: RUNNING)
   └─ Log start_time and metadata

2. Data Retrieval (Parallel)
   ├─ Fetch all line_names from TransportLine table
   ├─ Load calendar features (holidays, weekends, season)
   └─ Fetch 24-hour weather forecast (Open-Meteo API)

3. Feature Engineering (Batch)
   ├─ Batch-load lag features for all (line, hour) pairs
   ├─ Combine: calendar + weather + lags
   └─ Build ModelInput objects (Pydantic validation)

4. ML Inference (Vectorized)
   ├─ Convert to Pandas DataFrame
   ├─ Apply categorical encoding (line_name, season)
   ├─ Single batch prediction call: model.predict(df_batch)
   └─ Process 12,000+ predictions in <5 seconds

5. Post-processing
   ├─ Calculate occupancy_pct = prediction / max_capacity
   ├─ Map to crowd_level (Low/Medium/High/Very High)
   └─ Round and validate values

6. Database Upsert (Bulk)
   ├─ PostgreSQL ON CONFLICT DO UPDATE
   ├─ Insert/update ~12,000 rows in single transaction
   └─ Constraint: UNIQUE(line_name, date, hour)

7. Job Completion
   ├─ Update JobExecution (status: SUCCESS, records_processed)
   ├─ Log fallback statistics for monitoring
   └─ Commit transaction
```

**Error Handling**:
- Calendar data missing → Job fails immediately (critical dependency)
- Weather API timeout → Retry 3 times with exponential backoff
- Weather failure after retries → Use fallback weather constants
- Database error → Rollback entire transaction, mark job as FAILED

**Performance Metrics** (500 lines × 24 hours × 2 days):
- **Data Loading**: ~2 seconds
- **Feature Engineering**: ~3 seconds
- **ML Inference**: ~4 seconds (24,000 predictions)
- **Database Insert**: ~2 seconds
- **Total Runtime**: ~15 seconds

---

### 4. Weather Service (`services/weather.py`)

**Purpose**: Fetch meteorological data from Open-Meteo API

**Endpoints Used**:
- Forecast API: `https://api.open-meteo.com/v1/forecast`

**Data Retrieved**:
```python
{
  "temperature_2m": float,      # Celsius
  "precipitation": float,       # mm/hour
  "wind_speed_10m": float      # km/h
}
```

**Retry Mechanism**:
```python
max_retries = 3
for attempt in range(max_retries):
    try:
        response = httpx.get(WEATHER_API_URL, params=params, timeout=10.0)
        return _process_weather_response(response.json())
    except Exception as e:
        time.sleep(2)  # Wait before retry
        
# Fallback constants if all retries fail
return {hour: FALLBACK_WEATHER_DATA for hour in range(24)}
```

**Nowcast Feature** (`/nowcast` endpoint):
- Returns 7-hour window (current + next 6 hours)
- Used for real-time weather display in UI
- Cached at application level (no database persistence)

---

### 5. Metro Service (`services/metro_service.py`)

**Purpose**: Static topology data and live schedule integration

**Data Sources**:

1. **Static Topology** (`public/data/metro_topology.json`):
   - Metro lines (M1A, M1B, M2, M3, M4, M5, M6, M7, M8, M9, M11, F1, T1, T4, T5)
   - Station coordinates (lat/lng)
   - Accessibility metadata (elevators, escalators, WC, baby room)
   - Direction mappings (each station → valid directions)

2. **Live Metro Istanbul API**:
   - Real-time train schedules
   - Station-to-station travel times
   - Service disruptions (alerts)

**Caching Strategy**:

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Topology (static) | In-memory (forever) | Loaded at startup, rarely changes |
| Station list | 1 hour | Semi-static infrastructure data |
| Train schedules | Database cache | Daily prefetch + 2-day stale tolerance |
| Travel duration | 24 hours | Static infrastructure (doesn't change daily) |

**Metro Schedule Cache Architecture**:

```python
# Daily prefetch job (03:15 AM)
for each (station_id, direction_id) pair in topology:
    payload = fetch_from_metro_api(station_id, direction_id)
    store_in_database(
        station_id, direction_id, 
        valid_for=today, 
        payload=payload
    )

# Request-time cache lookup
cached = db.query(MetroScheduleCache).filter(
    station_id == X,
    direction_id == Y,
    valid_for == today
).first()

if cached:
    return cached.payload  # Instant response
else:
    fallback_to_api()      # Fetch on-demand if missing
```

**Fallback Handling**:
1. Try today's cache → Return immediately
2. Try yesterday's cache (stale) → Return with warning
3. Fetch from API → Store for future requests
4. API timeout → Return last known good data (up to 7 days old)

---

### 6. Bus Schedule Cache (`services/bus_schedule_cache.py`)

**Purpose**: Persist IETT planned bus schedules in Postgres to avoid runtime SOAP/XML timeouts.

**Data Source**:
- IETT SOAP API: `https://api.ibb.gov.tr/iett/UlasimAnaVeri/PlanlananSeferSaati.asmx` (`GetPlanlananSeferSaati_XML`)

**Cache Key**:
- `(line_code, valid_for, day_type)` where `day_type` is `I` (weekday), `C` (Saturday), `P` (Sunday)

**Behavior**:
- Nightly prefetch seeds today's schedules at 04:15 (Europe/Istanbul).
- Request-time fallback: if a user requests at e.g. 02:00 and today's row is missing, the API fetches upstream on-demand, stores it, and returns it.
- Stale tolerance: serve the latest successful cached row (up to 2 days old) when today's cache is missing.

---

### 7. Capacity Store (`services/capacity_store.py`)

**Purpose**: Provide line-level capacity metadata used to compute interpretable occupancy percentages.

**Inputs**:
- **Bus capacity snapshots**: `data/processed/bus_capacity_snapshots/*.parquet` (generated by ETL helpers).
- **Static rail capacities**: `config/rail_capacity.yaml` (optional overrides for rail/metro lines).

**Outputs**:
- Capacity meta (`expected_capacity_weighted_int`, bounds, confidence) and optional vehicle-mix rows.

**Related API**:
- `GET /api/capacity/{line_code}`
- `GET /api/capacity/{line_code}/mix?top_k=10`

---

### 8. Marmaray Schedule Service (`services/marmaray_service.py`)

**Purpose**: Provide a stable static schedule for Marmaray when upstream schedule sources are incomplete, enabling consistent service-hours checks and trips-per-hour derivation.

**Data Source**:
- `frontend/public/data/marmaray_static_schedule.json`

**Behavior**:
- Used by the batch forecast pipeline to compute Marmaray `trips_per_hour` and align capacity calculations.

---


## API Endpoints

### Forecast Endpoints

#### `GET /api/forecast/{line_name}`

**Description**: Retrieve pre-calculated 24-hour forecast for a specific line

**Parameters**:
- `line_name` (path): Line identifier (e.g., "M2", "500T", "34")
- `target_date` (query): Date in YYYY-MM-DD format
- `direction` (query, optional): "G" (Outbound) or "D" (Inbound)

**Response**:
```json
[
  {
    "hour": 8,
    "predicted_value": 65827.69,
    "occupancy_pct": 70,
    "crowd_level": "High",
    "max_capacity": 94091,
    "in_service": true
  },
  {
    "hour": 3,
    "predicted_value": null,
    "occupancy_pct": null,
    "crowd_level": "Out of Service",
    "max_capacity": 94091,
    "in_service": false
  }
]
```

**Additional Capacity Fields (when available)**:
- `trips_per_hour`: Integer trips per hour derived from schedule data.
- `vehicle_capacity`: Per-departure vehicle capacity used to compute `max_capacity`.


**Service Hours Logic**:
- Checks schedule data to determine operational hours
- Marks out-of-service hours with `in_service: false`
- Nullifies prediction values for non-operational hours
- Adds +1 hour buffer after last departure (vehicles in transit)

**Error Handling**:
- 404: Line not found or no forecast data available
- 400: Invalid date (more than 7 days in future)
- 500: Server error (database/model failure)

### Capacity Endpoints

#### `GET /api/capacity/{line_code}`

**Description**: Retrieve capacity metadata for a line (bus capacity artifacts or static rail capacity overrides).

**Response**:
```json
{
  "line_code": "500T",
  "expected_capacity_weighted_int": 108,
  "capacity_min": 92,
  "capacity_max": 135,
  "confidence": "observed",
  "likely_models_topk_json": "[...]",
  "notes": "..."
}
```

---

#### `GET /api/capacity/{line_code}/mix?top_k=10`

**Description**: Retrieve the top-K vehicle mix rows used to estimate effective bus capacity.

**Response**:
```json
[
  {
    "representative_brand_model": "Mercedes Citaro",
    "model_capacity_int": 120,
    "share_by_vehicles": 0.42,
    "occupancy_delta_pct_vs_expected": -3.5,
    "n_days_present": 180
  }
]
```


---

#### `GET /api/nowcast`

**Description**: Real-time weather-based crowding nowcast

**Parameters**:
- `lat` (query, default: 41.0082): Latitude
- `lon` (query, default: 28.9784): Longitude

**Response**:
```json
{
  "current": {
    "temperature_2m": 18.5,
    "precipitation": 0.0,
    "wind_speed_10m": 12.3
  },
  "hourly": [
    {
      "hour": 14,
      "temperature_2m": 19.0,
      "weather_code": 1,
      "precipitation": 0.0
    }
  ]
}
```

---

### Line Management Endpoints

#### `GET /api/lines/search`

**Description**: Search for transport lines with relevance ranking

**Parameters**:
- `query` (query): Search term (min 2 characters)

**Relevance Scoring**:
1. Exact line_name match → Score: 1
2. Starts with query → Score: 2
3. Contains query → Score: 3
4. Route description match → Score: 4

**Turkish Normalization**:
```python
replacements = {
    'İ': 'i', 'I': 'ı', 'Ğ': 'ğ', 
    'Ü': 'ü', 'Ş': 'ş', 'Ö': 'ö', 'Ç': 'ç'
}
```

**Response**:
```json
[
  {
    "line_name": "M2",
    "transport_type_id": 2,
    "road_type": "metro",
    "line": "Yenikapı - Hacıosman Metro Line",
    "relevance_score": 1
  }
]
```

**M1A/M1B Handling**:
- Database stores combined "M1" forecast
- API splits into M1A and M1B for search results
- Each variant uses its own topology (different stations/directions)

---

#### `GET /api/lines/{line_code}/route`

**Description**: Get route geometry for map rendering

**Response**:
```json
{
  "G": [[41.0082, 28.9784], [41.0085, 28.9790]],
  "D": [[41.0086, 28.9795], [41.0089, 28.9800]]
}
```

**Data Source**: In-memory route_service (loaded from `line_routes.json` at startup)

---

#### `GET /api/lines/{line_code}/status`

**Description**: Get line operational status and alerts

**Parameters**:
- `direction` (query, optional): Filter for specific direction

**Response**:
```json
{
  "status": "WARNING",
  "alerts": [
    {
      "text": "Service delay due to track maintenance",
      "time": "2025-01-15T08:30:00",
      "type": "DISRUPTION"
    }
  ],
  "next_service_time": "06:00"
}
```

**Status Types**:
- `ACTIVE`: Normal operations
- `WARNING`: Service alerts present
- `OUT_OF_SERVICE`: Line not operating (based on schedule)

---

### Metro Endpoints

#### `GET /api/metro/topology`

**Description**: Complete metro network topology

**Response Structure**:
```json
{
  "lines": {
    "M2": {
      "id": 2,
      "name": "M2",
      "description": "Yenikapı - Hacıosman",
      "color": "#00A651",
      "first_time": "06:00",
      "last_time": "00:30",
      "stations": [
        {
          "id": 123,
          "name": "Taksim",
          "order": 5,
          "coordinates": {"lat": 41.0369, "lng": 28.9857},
          "accessibility": {
            "elevator_count": 4,
            "escalator_count": 8,
            "has_wc": true
          },
          "directions": [
            {"id": 1, "name": "Hacıosman Direction"}
          ]
        }
      ]
    }
  }
}
```

---

#### `POST /api/metro/schedule`

**Description**: Get train schedule for a station/direction

**Request Body**:
```json
{
  "BoardingStationId": 123,
  "DirectionId": 1,
  "DateTime": "2025-01-15T14:00:00"  // Optional
}
```

**Response** (Cached from database if available):
```json
{
  "Success": true,
  "Data": [
    {
      "LastStation": "Hacıosman",
      "TimeInfos": {
        "Times": ["14:05", "14:12", "14:19", "14:26"]
      }
    }
  ]
}
```

**Cache Strategy**:
1. Check database for today's cached schedule
2. If missing, fetch from Metro API and store
3. If API fails, return stale cache (up to 2 days old)
4. Daily prefetch job updates all schedules at 03:15 AM

---

### Admin Endpoints

#### `POST /api/admin/forecast/trigger`

**Description**: Manually trigger forecast generation

**Request Body**:
```json
{
  "target_date": "2025-01-16",
  "num_days": 2
}
```

**Response**:
```json
{
  "job_id": "manual_forecast_trigger",
  "message": "Forecast generation started",
  "target_date": "2025-01-16",
  "num_days": 2
}
```

---

#### `GET /api/admin/scheduler/status`

**Description**: Get scheduler and job statistics

**Response**:
```json
{
  "status": "running",
  "timezone": "Europe/Istanbul",
  "jobs": [
    {
      "id": "daily_forecast",
      "name": "Generate Forecasts (T+1, T+2)",
      "next_run": "2025-01-16T02:00:00+03:00",
      "trigger": "cron[hour='2', minute='0']",
      "last_run": "2025-01-15T02:00:05+03:00",
      "last_status": "success",
      "run_count": 45,
      "error_count": 2
    }
  ]
}
```

---

#### `GET /api/admin/forecast/coverage`

**Description**: Check forecast data availability

**Response**:
```json
{
  "dates": [
    {
      "date": "2025-01-15",
      "line_count": 512,
      "record_count": 12288,
      "coverage_pct": 100.0,
      "missing_hours": []
    }
  ],
  "summary": {
    "total_lines": 512,
    "dates_checked": 3,
    "avg_coverage": 99.8
  }
}
```

---

## Data Pipeline

### 1. Offline Training Pipeline

```
Raw Data (data/raw/)
    ↓
Clean & Validate (data_prep/clean_data.py)
    ├─ Remove outliers (winsorization)
    ├─ Handle missing values
    └─ Normalize timestamps
    ↓
Feature Engineering (features/build_final_features.py)
    ├─ Lag features (24h, 48h, 168h)
    ├─ Rolling statistics (mean, std)
    ├─ Calendar features (holidays, season)
    └─ Weather integration
    ↓
Processed Features (data/processed/features_pl.parquet)
    ↓
Model Training (model/train_model.py)
    ├─ LightGBM with time-series CV
    ├─ Hyperparameter tuning
    └─ Feature importance analysis
    ↓
Trained Model (defaults to `models/lgbm_transport_v7.txt`, configurable via `MODEL_PATH`)
```

### 2. Online Prediction Pipeline

```
API Request (/forecast/{line_name})
    ↓
Check Database (DailyForecast table)
    ├─ Cache hit → Return immediately
    └─ Cache miss → 404 (batch job not run yet)

Background Batch Job (Daily at 02:00 AM)
    ↓
For each line × 24 hours:
    ├─ Retrieve calendar features (holidays, season)
    ├─ Fetch weather forecast (Open-Meteo API)
    ├─ Get lag features (Feature Store)
    └─ Combine into model input
    ↓
Batch ML Prediction (LightGBM)
    ↓
Calculate crowd_level & occupancy_pct
    ↓
Bulk Insert to Database (PostgreSQL)
    └─ ON CONFLICT DO UPDATE
```

### 3. Metro Schedule Pipeline

```
Daily Prefetch Job (03:15 AM)
    ↓
For each (station_id, direction_id) pair:
    ├─ Fetch from Metro Istanbul API
    ├─ Store in MetroScheduleCache table
    └─ Log fetch status (SUCCESS/FAILED)
    ↓
Failed pairs → Retry job (every 30 minutes)
    ├─ Exponential backoff
    ├─ Max 10 retry attempts
    └─ Mark as abandoned if still failing

API Request (/metro/schedule)
    ↓
Check Database Cache
    ├─ Fresh cache (today) → Return
    ├─ Stale cache (yesterday) → Return with warning
    └─ No cache → Fetch from API + store
```

---

## Machine Learning Integration

### Model Specifications

**Algorithm**: LightGBM (Gradient Boosting Decision Trees)

**Model Version**: v7 by default (`models/lgbm_transport_v7.txt`), configurable via `MODEL_PATH`

**Training Configuration**:
```yaml
objective: regression
metric: rmse
boosting_type: gbdt
num_leaves: 63
learning_rate: 0.05
feature_fraction: 0.8
bagging_fraction: 0.8
bagging_freq: 5
num_iterations: 1000
early_stopping_rounds: 50
```

**Feature Categories** (42 features total):

1. **Categorical Features** (2):
   - `line_name`: Transport line identifier (512 unique values)
   - `season`: Spring/Summer/Fall/Winter

2. **Temporal Features** (6):
   - `hour_of_day`: 0-23
   - `day_of_week`: 0-6 (Monday=0)
   - `month`: 1-12
   - `is_weekend`: boolean
   - `is_holiday`: boolean
   - `is_school_term`: boolean

3. **Lag Features** (5):
   - `lag_24h`: Passengers 24 hours ago
   - `lag_48h`: Passengers 48 hours ago
   - `lag_168h`: Passengers 1 week ago
   - `roll_mean_24h`: 24-hour rolling average
   - `roll_std_24h`: 24-hour rolling std dev

4. **Weather Features** (3):
   - `temperature_2m`: Air temperature (°C)
   - `precipitation`: Rainfall (mm/hour)
   - `wind_speed_10m`: Wind speed (km/h)

**Model Loading**:
```python
# At application startup
model = lgb.Booster(model_file=os.getenv('MODEL_PATH', 'models/lgbm_transport_v7.txt'))
AppState.model = model  # Global singleton
```

**Inference Optimization**:
- Batch prediction: Process all (line, hour) pairs in single call
- Categorical encoding: Pre-encoded line_name and season
- Memory efficiency: Float32 instead of Float64
- Vectorized operations: Pandas DataFrame for speed

**Prediction Post-processing**:
```python
# Ensure non-negative predictions
prediction = max(0, raw_prediction)

# Calculate occupancy percentage
max_capacity = line_max_capacity[line_name]
occupancy_pct = round((prediction / max_capacity) * 100)

# Map to crowd level
if occupancy_pct < 30: crowd_level = "Low"
elif occupancy_pct < 60: crowd_level = "Medium"
elif occupancy_pct < 90: crowd_level = "High"
else: crowd_level = "Very High"
```

---

## Caching & Performance

### Multi-Layer Caching Strategy

```
Layer 1: Database (PostgreSQL)
├─ DailyForecast table (indexed by line_name, date, hour)
├─ MetroScheduleCache (indexed by station_id, direction_id, valid_for)
└─ Persistent across restarts

Layer 2: In-Memory (Python)
├─ Feature Store lookup tables (Polars DataFrame)
├─ Route shapes (JSON loaded at startup)
├─ Metro topology (static JSON)
└─ TTLCache for metro API responses (cachetools)

Layer 3: Application State (Singleton)
├─ LightGBM model (loaded once at startup)
├─ Feature Store instance
└─ Route service instance
```

### Performance Benchmarks

| Operation | Latency | Optimization |
|-----------|---------|--------------|
| Forecast retrieval (cached) | <50ms | PostgreSQL index on (line_name, date, hour) |
| Line search | <100ms | Database LIKE query with relevance ranking |
| Metro schedule (cached) | <30ms | Database cache + JSON serialization |
| Metro schedule (API fallback) | 1-3s | Upstream Metro Istanbul API latency |
| Route polyline | <10ms | In-memory JSON lookup |
| Batch forecast (500 lines × 24h) | 15s | Polars batch processing + LightGBM vectorization |

### Database Indexing

```sql
-- DailyForecast table
CREATE INDEX idx_forecast_line_date_hour 
  ON daily_forecasts(line_name, date, hour);

-- MetroScheduleCache table
CREATE INDEX idx_metro_schedule_lookup 
  ON metro_schedules(station_id, direction_id, valid_for);

-- TransportLine table
CREATE INDEX idx_line_search 
  ON transport_lines USING gin(line_name gin_trgm_ops, line gin_trgm_ops);
```

---

## Background Jobs

### APScheduler Configuration

**Timezone**: Europe/Istanbul (UTC+3)

**Job Definitions**:

#### 1. Daily Forecast Generation
- **Schedule**: Every day at 02:00 AM
- **Function**: `generate_daily_forecast()`
- **Duration**: ~15 seconds
- **Output**: 12,000+ forecast records (T+1, T+2 days)
- **Retry**: 3 attempts with exponential backoff (1min, 2min, 4min)
- **Monitoring**: JobExecution table + job_stats dict

**Process**:
```python
1. Fetch all line names from database
2. Determine target dates (tomorrow, day after tomorrow)
3. Batch-load calendar features (holidays, weekends)
4. Fetch weather forecast (Open-Meteo API)
5. Retrieve lag features (Feature Store)
6. Run batch ML prediction (LightGBM)
7. Calculate occupancy & crowd levels
8. Bulk upsert to DailyForecast table
9. Log execution stats (runtime, records, fallbacks)
```

#### 2. Cleanup Old Forecasts
- **Schedule**: Every day at 03:00 AM
- **Function**: `cleanup_old_forecasts()`
- **Retention**: Keep last 3 days minimum
- **Action**: `DELETE FROM daily_forecasts WHERE date < cutoff_date`

**Benefits**:
- Reduces database size
- Prevents indefinite growth
- Maintains query performance

#### 3. Data Quality Check
- **Schedule**: Every day at 04:00 AM
- **Function**: `data_quality_check()`
- **Checks**:
  - All critical dates (T-1, T, T+1) have forecasts
  - No missing hours (24 hours per line)
  - Reasonable prediction values (no anomalies)
  - Future forecast availability (T+2, T+3)

**Output**:
```json
{
  "issues": [
    "Low forecast count for 2025-01-15: 9547 (expected >10000)",
    "Missing forecasts for 2025-01-18"
  ],
  "total_issues": 2,
  "status": "issues_found"
}
```

#### 4. Metro Schedule Prefetch
- **Schedule**: Every day at 03:15 AM
- **Function**: `prefetch_metro_schedules()`
- **Coverage**: All station/direction pairs (~200 combinations)
- **Strategy**: Parallel API calls with rate limiting
- **Fallback**: Retry failed pairs every 30 minutes (max 10 attempts)

**Workflow**:
```python
for (station_id, direction_id) in all_metro_pairs:
    try:
        payload = fetch_from_metro_api(station_id, direction_id)
        store_in_database(station_id, direction_id, valid_for=today, payload)
    except APITimeout:
        add_to_retry_queue(station_id, direction_id)

if retry_queue:
    schedule_retry_job(interval=30_minutes)
```

#### 5. Bus Schedule Prefetch
- **Schedule**: Every day at 04:15 AM
- **Function**: `prefetch_bus_schedules()`
- **Coverage**: All bus lines where `transport_type_id == 1` (~938 lines)
- **Fallback**: Retry failed lines every 30 minutes (max 10 attempts)

### Job Monitoring

**Metrics Tracked**:
```python
job_stats = {
    'daily_forecast': {
        'last_run': datetime.now(),
        'last_status': 'success',
        'run_count': 45,
        'error_count': 2
    }
}
```

**Admin API** (`GET /api/admin/scheduler/status`):
- Current scheduler state (running/paused/stopped)
- Next run time for each job
- Historical run counts and error rates
- Last execution status and duration

**Bus Cache Admin API**:
- `GET /api/admin/bus/cache/status`
- `POST /api/admin/bus/cache/refresh`
- `POST /api/admin/bus/cache/cleanup`

---

## Database Schema

### Entity Relationship Diagram

```
TransportLine (1) ──────────< (M) DailyForecast
    │
    └─ line_name (PK)
    └─ transport_type_id
    └─ road_type
    └─ line (description)

DailyForecast
    │
    ├─ line_name (FK → TransportLine)
    ├─ date
    ├─ hour
    ├─ predicted_value
    ├─ occupancy_pct
    ├─ crowd_level
    └─ max_capacity
    
    UNIQUE(line_name, date, hour)

MetroScheduleCache
    │
    ├─ station_id
    ├─ direction_id
    ├─ line_code
    ├─ valid_for (date)
    ├─ payload (JSONB)
    ├─ fetched_at
    └─ source_status
    
    UNIQUE(station_id, direction_id, valid_for)

BusScheduleCache
    |
    |- line_code
    |- valid_for (date)
    |- day_type (I/C/P)
    |- payload (JSONB)
    |- fetched_at
    |- source_status
    |
    UNIQUE(line_code, valid_for, day_type)


JobExecution
    │
    ├─ job_type
    ├─ target_date
    ├─ status (RUNNING/SUCCESS/FAILED)
    ├─ start_time
    ├─ end_time
    ├─ records_processed
    ├─ error_message
    └─ job_metadata (JSONB)

AdminUser
UserReport
```

### Key Tables

#### `transport_lines`
Stores metadata for all transport lines in Istanbul's network.

```sql
CREATE TABLE transport_lines (
    line_name VARCHAR PRIMARY KEY,
    transport_type_id INTEGER,
    road_type VARCHAR,
    line VARCHAR  -- Human-readable description
);
```

**Population**: Auto-initialized from `transport_meta.parquet` at startup

#### `daily_forecasts`
Pre-calculated 24-hour predictions for all lines.

```sql
CREATE TABLE daily_forecasts (
    id SERIAL PRIMARY KEY,
    line_name VARCHAR NOT NULL,
    date DATE NOT NULL,
    hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
    predicted_value FLOAT NOT NULL,
    occupancy_pct INTEGER NOT NULL CHECK (occupancy_pct >= 0 AND occupancy_pct <= 100),
    crowd_level VARCHAR NOT NULL,
    max_capacity INTEGER NOT NULL,
    UNIQUE (line_name, date, hour)
);
```

**Size**: ~12,000 rows per day × 3 days retention = 36,000 rows

#### `metro_schedules`
Cached metro timetables from IBB Metro Istanbul API.

```sql
CREATE TABLE metro_schedules (
    id SERIAL PRIMARY KEY,
    station_id INTEGER NOT NULL,
    direction_id INTEGER NOT NULL,
    line_code VARCHAR,
    station_name VARCHAR,
    direction_name VARCHAR,
    valid_for DATE NOT NULL,
    payload JSONB NOT NULL,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source_status VARCHAR DEFAULT 'SUCCESS',
    error_message TEXT,
    UNIQUE (station_id, direction_id, valid_for)
);
```

**Refresh Strategy**: Daily prefetch at 03:15 AM

#### `bus_schedules`
Cached IETT planned bus schedules (PlanlananSeferSaati) per line.

```sql
CREATE TABLE bus_schedules (
    id SERIAL PRIMARY KEY,
    line_code VARCHAR NOT NULL,
    valid_for DATE NOT NULL,
    day_type CHAR(1) NOT NULL,
    payload JSONB NOT NULL,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    source_status VARCHAR DEFAULT 'SUCCESS',
    error_message TEXT,
    UNIQUE (line_code, valid_for, day_type)
);
```

**Refresh Strategy**: Daily prefetch at 04:15 AM

---

## Capacity & Trips-Per-Hour

Capacity is treated as a first-class signal to make crowding forecasts explainable:

- `vehicle_capacity`: per-departure capacity (static for rail; inferred for buses via capacity snapshots).
- `trips_per_hour`: derived from schedule sources (cached metro schedules, cached bus schedules, or Marmaray static schedule).
- `max_capacity`: computed as `vehicle_capacity * trips_per_hour` when both are available; otherwise falls back to safer defaults.

This data is stored with forecasts (`daily_forecasts`) so the UI can show both occupancy and the assumptions behind it.


## External Integrations

### 1. Open-Meteo Weather API

**Base URL**: `https://api.open-meteo.com/v1/forecast`

**Features Used**:
- 24-hour temperature, precipitation, wind speed
- Istanbul coordinates: 41.0082°N, 28.9784°E
- Europe/Istanbul timezone
- Hourly resolution

**Request Example**:
```http
GET /v1/forecast?latitude=41.0082&longitude=28.9784
    &hourly=temperature_2m,precipitation,wind_speed_10m
    &start_date=2025-01-15&end_date=2025-01-15
    &timezone=Europe/Istanbul
```

**Rate Limiting**: No API key required for forecast endpoint (fair use)

**Error Handling**:
- 3 retry attempts with 2-second delays
- Fallback to default weather constants if all retries fail
- Logged warnings for monitoring

---

### 2. Metro Istanbul Public API

**Base URL**: `https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2`

**Endpoints Used**:

1. **GetTimeTable** (POST)
   - Retrieves train schedules for a station/direction
   - Returns: Departure times, destination station
   - Used for: Schedule widgets, live arrival predictions

2. **GetStationBetweenTime** (POST)
   - Calculates travel duration between stations
   - Returns: List of intermediate stations with travel times
   - Used for: "X minutes to destination" feature

3. **GetStationById** (GET)
   - Fetches station metadata (coordinates, accessibility)
   - Returns: Station details, elevator/escalator counts
   - Used for: Station info cards, accessibility information

**Authentication**: Public API (no API key required)

**Caching**:
- Schedules: Database cache (daily prefetch)
- Travel times: 24-hour TTL cache (in-memory)
- Station metadata: 1-hour TTL cache

**Reliability**:
- API uptime: ~99% (occasional timeouts during peak hours)
- Fallback: Serve stale cache data if API unavailable
- Retry logic: Single retry on timeout, then fallback

---

## Error Handling Strategies

### 1. Database Errors
- **Connection Pool**: Max 10 connections with 30s timeout
- **Transaction Rollback**: Automatic on exception
- **Retry**: Not implemented (fail fast for data consistency)
- **Logging**: Full traceback to application logs

### 2. External API Failures
- **Weather API**:
  - 3 retries with 2s delay
  - Fallback to default constants (15°C, 0mm rain, 5km/h wind)
  - Log warning but allow job to continue
  
- **Metro API**:
  - Single retry on timeout
  - Serve stale cache (up to 7 days old) on failure
  - Return 504 Gateway Timeout if no cache available

### 3. Model Prediction Errors
- **Model Loading Failure**: Application startup fails (critical)
- **Prediction Error**: Log error, skip line, continue batch job
- **Invalid Input**: Pydantic validation raises 422 Unprocessable Entity

### 4. Feature Store Errors
- **Missing Calendar Data**: Job fails immediately (critical dependency)
- **Missing Lag Data**: Use zero fallback, log fallback stats
- **Stale Data**: Multi-year seasonal matching with 3-year lookback window

---

## Deployment & Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/ibb_transport

# CORS (optional)
CORS_ALLOW_ORIGINS=http://localhost:3000,https://dolumu.app

# Weather API (optional)
WEATHER_API_URL=https://api.open-meteo.com/v1/forecast

# Model Path (optional)
MODEL_PATH=models/lgbm_transport_v7.txt
```

### Docker Deployment

```bash
# Build image
docker build -t ibb-transport-api .

# Run with docker-compose
docker-compose up -d

# Health check
curl http://localhost:8000/
```

### Development Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Initialize database
uvicorn src.api.main:app --reload

# Run tests (if implemented)
pytest src/api/tests/
```

---

## Future Enhancements

### Planned Features

1. **User Authentication & Notifications**
   - Push notifications for crowd level alerts
   - Personalized route recommendations
   - Favorite line subscriptions

2. **Advanced ML Models**
   - LSTM for time-series forecasting
   - Multi-task learning (predict delays + crowding)
   - Transfer learning for new lines with limited data

3. **Real-Time Updates**
   - WebSocket connections for live crowd updates
   - GPS-based bus tracking integration
   - Dynamic rerouting suggestions

4. **Analytics Dashboard**
   - Admin panel for data quality monitoring
   - Model performance metrics (RMSE, MAE per line)
   - API usage statistics (requests/day, response times)

---

## Appendix

### Glossary

- **Crowd Level**: Categorical classification of passenger density (Low/Medium/High/Very High)
- **Occupancy Percentage**: Ratio of predicted passengers to historical maximum capacity
- **Lag Features**: Historical data used as input for time-series forecasting
- **Feature Store**: Cached historical data repository for ML predictions
- **TTL Cache**: Time-To-Live cache with automatic expiration
- **Batch Job**: Automated background task (e.g., daily forecast generation)

### References

- LightGBM Documentation: https://lightgbm.readthedocs.io/
- FastAPI Documentation: https://fastapi.tiangolo.com/
- Open-Meteo API: https://open-meteo.com/en/docs
- Polars Guide: https://pola-rs.github.io/polars-book/

---

**Last Updated**: December 2024  
**API Version**: 1.0  
**Model Version**: v6
