# README_TECHNICAL.md

**Istanbul Public Transit Crowding Prediction Platform - Technical Documentation**

---

## Technical Abstract

This project implements a **LightGBM-based global forecasting model** for hourly public transportation ridership prediction in Istanbul. The current production model (`lgbm_transport_v7`) uses a stable **18-column feature set** (lags/rolling stats + weather + calendar + categorical line code) and is served by a **FastAPI** backend with **PostgreSQL persistence**, a **Polars-backed FeatureStore**, and **APScheduler** jobs for automated forecast generation and cache prefetch.

The UI is a **Next.js PWA** using **React Leaflet** for map-based exploration, **Recharts** for 24h charts, **Framer Motion** for gestures/animations, **next-intl** for TR/EN localization, and a local **favorites** store with optional **haptic feedback** (`navigator.vibrate`). Route/stop geometry data is ingested via **IETT SOAP endpoints** and shipped as static JSON assets under `frontend/public/data/`.

---

## Recent Updates (2025-12)

- **Model**: Promoted `lgbm_transport_v7` as the API default and added blacklist-based split filtering (`config/data_filters.yaml`, `src/model/config/v7.yaml`).
- **Capacity**: Added capacity artifacts + `CapacityStore`, exposed `/api/capacity/*`, and persisted `trips_per_hour` / `vehicle_capacity` for explainable occupancy forecasts.
- **Schedules**: Added Postgres-backed bus schedule prefetch caching and Marmaray static schedule integration; rail capacity overrides live in `config/rail_capacity.yaml`.

---


## Project Architecture

### Directory Structure & Data Pipeline

The codebase follows a **modular data science architecture** with clear separation of concerns:

```
├── src/
│   ├── data_prep/          # Raw → Interim data processing (Polars ETL)
│   ├── features/           # Feature engineering & dimensionality pipeline  
│   ├── model/              # Training, evaluation & versioned YAML configs
│   └── api/                # FastAPI service & database layer
├── data/
│   ├── raw/                # İBB transport CSV + holiday calendars
│   ├── interim/            # Aggregated parquet outputs  
│   └── processed/          # Model-ready feature matrices + split datasets
├── models/                 # Serialized LightGBM boosters (.txt format)
├── reports/                # Evaluation metrics, SHAP analysis, visualizations
└── frontend/               # Next.js PWA with Leaflet integration
```

### Pipeline Flow

**Raw → Processed → Training → API Deployment:**

1. **ETL Phase** (`src/data_prep/`):
   - `load_raw.py`: Extracts line metadata to `data/processed/transport_meta.parquet`.
     - Note: the hourly aggregation to `data/interim/transport_hourly.parquet` exists as commented scaffold in the same file and must be enabled or produced externally.
   - `clean_data.py`: Minimal example cleaner for district-level parquet (drops missing `town`).
   - `explore_data.py`: Small helper to print basic null counts/shape.

2. **Feature Engineering** (`src/features/`):
   - `build_calendar_dim.py`: Holiday calendars + school term encodings
   - `build_weather_dim.py`: Open-Meteo archive fetch → `data/processed/weather_dim.parquet`
   - `build_log_roliing_transport_data.py`: Lag/rolling window features from `data/interim/transport_hourly.parquet` → `data/processed/lag_rolling_transport_hourly.parquet`
     - Note: filename contains a typo (`roliing`) and is referenced as-is.
   - `build_final_features.py`: **Polars joins** → `data/processed/features_pl.parquet`
   - `convert_features_to_pandas.py`: Converts to `data/processed/features_pd.parquet` (input for splitting/training)
   - `split_features.py`: Time-based train/val/test split to `data/processed/split_features/*.parquet` (optionally applies `config/data_filters.yaml`)
   - `check_features_quality.py`: Writes a quality log to `docs/data_quality_log.txt`

3. **Modeling Pipeline** (`src/model/`):
   - `train_model.py`: YAML-configured LightGBM training with early stopping
   - `eval_model.py`: Baseline comparison + SHAP explainability analysis
   - `test_model.py`: Hold-out test evaluation with error decomposition

4. **API Service** (`src/api/`):
   - `main.py`: FastAPI app with model loading, CORS, and JWT authentication
   - `auth.py`: JWT token generation, bcrypt password hashing, protected route dependencies
   - `scheduler.py`: APScheduler integration with 5 automated cron jobs (bus schedule prefetch, metro timetable prefetch, forecast generation, cleanup, quality-check)
   - `services/store.py`: **Feature Store** with multi-year seasonal lag fallback strategy
   - `services/batch_forecast.py`: Batch prediction service with retry logic and fallback statistics
   - `routers/`: RESTful endpoints for forecasting, nowcasting, admin operations, line search, and traffic proxy

---

## Data Sources & Feature Engineering Strategy

### Primary Data Sources

| **Source** | **Format** | **Features Extracted** | **Update Frequency** |
|------------|------------|------------------------|----------------------|
| **İBB Passenger Data** | CSV files | `transition_date`, `transition_hour`, `number_of_passage`, `line_name` | Static (historical) |
| **Open-Meteo API** | JSON (Historical + Forecast) | `temperature_2m`, `precipitation`, `wind_speed_10m` | Hourly |
| **Turkish Holiday Calendar** | Manual CSV | `is_holiday`, `holiday_win_m1/p1`, `is_school_term` | Annual |
| **IETT SOAP API (Stops)** | SOAP/XML (GetDurak_json) | Stop coordinates + metadata, exported as JSON for the frontend | On-demand / batch ingestion |
| **IETT SOAP API (Routes)** | SOAP/XML (GetHat_json + DurakDetay_GYY) | Per-line ordered stop sequences (G/D directions), exported as JSON | On-demand / batch ingestion |
| **İBB Traffic API** | JSON (TrafficIndex_Sc1_Cont) | `TI` (traffic index), `TI_Av` (average index) | Real-time (5-min cache) |

### Feature Engineering Justification

#### **1. Temporal Features**
- **`hour_of_day`**: Captures intraday periodicity (rush hours vs. off-peak)
- **`day_of_week`**: Weekend vs. weekday behavioral patterns  
- **`month`, `season`**: Seasonal ridership variations (summer holidays, winter weather)
- **`is_weekend`**: Binary encoding for weekend demand differences

#### **2. Weather Exogenous Variables**  
- **`temperature_2m`**: Extreme temperatures drive increased public transport usage
- **`precipitation`**: Rainfall significantly increases ridership (umbrella effect)
- **`wind_speed_10m`**: High winds discourage walking, increase transit demand

#### **3. Calendar Dimension Engineering**
- **`is_holiday`**: Public holidays alter normal commuting patterns
- **`holiday_win_m1/p1`**: Holiday spillover effects (day before/after)
- **`is_school_term`**: School schedule impacts family travel patterns

#### **4. Lag & Rolling Window Features**
**Strategic lag selection** based on transportation periodicity:
- **`lag_24h`**: Previous day same-hour (strongest predictor)
- **`lag_48h`**: Two-day lag for Tuesday→Thursday patterns  
- **`lag_168h`**: Weekly seasonality (Monday→Monday)
- **`roll_mean_24h`**: 24-hour moving average (trend smoothing)
- **`roll_std_24h`**: Rolling volatility (demand uncertainty quantification)

**Anti-overfitting consideration**: No short-term lags (1h, 2h, 3h) in production model v7 to prevent **temporal leakage** and improve **generalization**.

### Data Aggregation Logic

**Hourly aggregation** is expected to produce `data/interim/transport_hourly.parquet` with at least:
- `transition_date` (YYYY-MM-DD)
- `transition_hour` (0-23)
- `line_name`
- `passage_sum` (hourly sum)

`src/data_prep/load_raw.py` includes a Polars aggregation template for this, but it is currently commented out in the repository.

---

## Modeling Approach & Academic Justification

### Model Selection: LightGBM Gradient Boosting

**Primary Model:** Microsoft LightGBM (Gradient Boosting Decision Trees)

**Academic Justification:**
1. **Tabular Data Efficiency**: Superior performance vs. LSTM/neural approaches for **structured time-series with exogenous features** [[Makridakis M4 Competition](https://www.sciencedirect.com/science/article/abs/pii/S0169207018300785)]
2. **Missing Value Handling**: Native support for missing weather data without imputation bias
3. **Categorical Feature Integration**: Optimal encoding for `line_name` as high-cardinality categorical
4. **Training Speed**: 10-100x faster than deep learning for equivalent accuracy on this dataset size
5. **Interpretability**: SHAP integration enables **feature attribution analysis** required for academic evaluation

### Global Model Strategy vs. Individual Line Models

**Design Decision**: **Single global model** with `line_name` as categorical feature

**Justification:**
- **Regularization Effect**: Shared parameters across lines reduce overfitting vs. individual models
- **Cold Start Problem**: New transportation lines benefit from cross-line learned patterns  
- **Maintenance Simplicity**: Single model deployment vs. managing 100+ line-specific models
- **Data Efficiency**: Lines with limited historical data benefit from global pattern learning

**Trade-off**: Slight accuracy reduction for low-frequency lines vs. **significant operational benefits**.

### Hyperparameter Configuration (Model v7)

**Production Configuration (current default)** (`src/model/config/v7.yaml`):

```yaml
params:
  objective: "regression"
  metric: ["l1", "l2"]  
  boosting_type: "gbdt"
  learning_rate: 0.03        # Conservative for anti-overfitting
  num_leaves: 31             # Balanced tree complexity
  min_data_in_leaf: 500      # Regularization for transport line diversity  
  feature_fraction: 0.8      # Feature bagging
  bagging_fraction: 0.8      # Row bagging  
  lambda_l1: 0.1             # L1 regularization
  lambda_l2: 1.0             # L2 regularization
```

**Rationale**: Configuration optimized through **3-fold time-series cross-validation** with **early stopping** (100 rounds) to prevent temporal overfitting.

---

## Evaluation Framework & Metrics

### Validation Strategy

**Time-Series Cross-Validation** with **temporal integrity**:
- **Training Set**: Historical data (earliest 80% of timeline)
- **Validation Set**: Recent 2-6 months  
- **Test Set**: Final 2 months (hold-out for unbiased evaluation)

**No random splitting** to prevent **future leakage** in time-series context.

### Primary Metrics

| **Metric** | **Formula** | **Academic Justification** |
|------------|-------------|----------------------------|
| **MAE** | `mean(abs(y_true - y_pred))` | **Scale-interpretable** error in passenger count units |
| **SMAPE** | `100 * mean(abs(y_true - y_pred) / (abs(y_true) + abs(y_pred))/2)` | **Scale-invariant** for cross-line comparison |
| **MAE@Peak** | MAE computed only during rush hours | **Business-critical** error evaluation |

### Baseline Comparisons

**Implemented Baselines** for academic benchmarking:
1. **Lag-24h**: Previous day same-hour (`y_pred = lag_24h`)
2. **Hour-of-Week Average**: Historical mean by `(day_of_week, hour)` combination  
3. **Seasonal Naïve**: Previous week same-hour (`y_pred = lag_168h`)

**Academic Standard**: Model must outperform **all baselines** for publication validity.

### Explainability Analysis

**SHAP (SHapley Additive exPlanations) Integration**:
- **Global Feature Importance**: Ranking across all transport lines
- **Local Explanations**: Per-prediction feature attribution
- **Temporal Decomposition**: Lag vs. weather vs. calendar feature contributions  

**Academic Purpose**: Required for thesis **methodology justification** and **practical insights** for İBB stakeholders.

---

## Occupancy & Crowd Levels

### Capacity-Aware Occupancy

The backend stores **raw ridership predictions** (`predicted_value`) and derives **capacity-aware occupancy** fields during batch generation.

**Batch computation** (`src/api/services/batch_forecast.py`):

```python
prediction = max(0, model_pred)
trips_effective = max(1, int(trips_per_hour[hour]))
vehicle_capacity = capacity_store.get_capacity_meta(line_code).expected_capacity_weighted_int
max_capacity = max(1, vehicle_capacity * trips_effective)

occupancy_pct = min(100, round((prediction / max_capacity) * 100))
```

### Crowd Level Labels

Crowd levels are derived from the **occupancy rate** against the same `max_capacity` used above.

**Threshold mapping** (`src/api/services/store.py:get_crowd_level`):

- `occupancy_rate < 0.30` → `Low`
- `occupancy_rate < 0.60` → `Medium`
- `occupancy_rate < 0.90` → `High`
- otherwise → `Very High`

### Where Capacity Inputs Come From

During the batch job, `trips_per_hour` is computed per line/hour using cached schedule sources:

- **Bus lines**: Postgres-backed IETT planned schedule cache (`src/api/services/bus_schedule_cache.py`), aggregated across `G` + `D`.
- If a cached schedule is missing, the batch job falls back to a conservative pattern (1 trip/hour) so capacity math stays defined.
- **Metro/rail lines**: Postgres-backed Metro timetable cache (`src/api/services/metro_schedule_cache.py`), derived using **terminus-only** departures to avoid inflating counts.
- **Marmaray**: Static schedule integration (`src/api/services/marmaray_service.py`) reading `frontend/public/data/marmaray_static_schedule.json`.

`vehicle_capacity` is sourced from `CapacityStore`:

- **Bus capacity artifacts**: parquet snapshots under `data/processed/bus_capacity_snapshots/`.
- **Static rail overrides**: `config/rail_capacity.yaml`.
- **Fallback**: safe default per-vehicle capacity when artifacts are missing.

### Service-Hours Masking (API Response)

The forecast API marks hours outside service windows as **Out of Service** and nulls the predicted fields.

- Service windows are derived from **metro topology** (`first_time`/`last_time`) for rail, and from cached IETT schedules for buses.
- For out-of-service hours, the API returns `predicted_value: null`, `occupancy_pct: null`, `crowd_level: "Out of Service"`, while keeping the stored capacity fields for interpretability.



---

## Automation & Scheduling System

### APScheduler Integration

**Cron Job Architecture** (`src/api/scheduler.py`):

The platform runs an **AsyncIOScheduler** (timezone: `Europe/Istanbul`) and schedules jobs in an order that keeps schedule caches warm before forecast generation.

**Scheduled jobs (default times):**

1. **Bus schedule prefetch** (`prefetch_bus_schedules`) — **00:10**
   - Prefetches and persists IETT planned schedules into Postgres (`bus_schedules`) for the forecast horizon.

2. **Metro timetable prefetch** (`prefetch_metro_schedules`) — **02:30**
   - Prefetches and persists Metro Istanbul timetables into Postgres (`metro_schedules`).
   - Maintains a retry loop for failed station/direction pairs.

3. **Daily forecast generation** (`generate_daily_forecast`) — **04:00**
   - Runs `run_daily_forecast_job()` for **T+1..T+2** by default (configurable).
   - Batch-predicts all `(line, hour)` pairs and persists forecasts into `daily_forecasts`.
   - Stores `max_capacity`, `trips_per_hour`, and `vehicle_capacity` alongside `predicted_value` to make occupancy explainable.
   - Includes retry scheduling with exponential backoff on failures.

4. **Cleanup old forecasts** (`cleanup_old_forecasts`) — **04:15**
   - Maintains a rolling retention window (minimum 3 days).

5. **Data quality check** (`data_quality_check`) — **04:30**
   - Verifies forecast coverage, missing hours, and fallback rates.

**Robustness features:**
- `misfire_grace_time` (typically 1 hour) + `coalesce=True` to avoid duplicate backfills after downtime.
- Background retries for forecast generation (separate one-off scheduled jobs).

### Admin Control APIs

**Scheduler management**:
- `GET /api/admin/scheduler/status`
- `POST /api/admin/scheduler/pause`
- `POST /api/admin/scheduler/resume`
- `POST /api/admin/scheduler/trigger/forecast` (params: `target_date`, `num_days`)
- `POST /api/admin/scheduler/trigger/cleanup` (param: `days_to_keep`)
- `POST /api/admin/scheduler/trigger/quality-check`

**Manual forecast trigger (background task)**:
- `POST /api/admin/forecast/trigger` (params: `target_date`, `num_days`)

**Schedule cache operations**:
- Metro: `GET /api/admin/metro/cache/status`, `POST /api/admin/metro/cache/refresh`, `POST /api/admin/metro/cache/cleanup`
- Bus: `GET /api/admin/bus/cache/status`, `POST /api/admin/bus/cache/refresh`, `POST /api/admin/bus/cache/cleanup`

**Job recovery**:
- `POST /api/admin/jobs/reset` (marks stuck RUNNING jobs as FAILED)



---

## Authentication & Security

### JWT-Based Admin Authentication

**Backend Security** (`src/api/auth.py`):
- **Token Configuration**: `JWT_SECRET_KEY` (required), `JWT_ALGORITHM` (default: HS256), `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` (default: 1440)
- **Password Hashing**: bcrypt via passlib with 72-byte truncation for compatibility
- **Protected Routes**: `get_current_user()` FastAPI dependency validates JWT and returns authenticated user
- **Database Schema**: `admin_users` table with username, hashed_password, created_at, last_login columns

**Admin User Management APIs:**
- `POST /api/admin/login` - Accepts username/password, returns JWT access token
- `GET /api/admin/users` - List all admin users with usernames and last login timestamps
- `GET /api/admin/users/me` - Return authenticated admin's profile
- `POST /api/admin/users` - Create new admin user with password hashing
- `POST /api/admin/users/change-password` - Update password for existing user
- `DELETE /api/admin/users/{username}` - Remove admin user (prevents deletion of last admin)

**Frontend Authentication** (`frontend/src/contexts/AuthContext.jsx`):
- **React Context**: Global admin session management with `login()`, `logout()`, `isLoading` states
- **Token Storage**: localStorage persistence with `adminToken` key for cross-page-reload authentication
- **Protected Routes**: `ProtectedRoute` wrapper component checks authentication before rendering admin pages
- **Locale-Aware Navigation**: Login/logout flows preserve language selection (Turkish/English)

---

## Data Ingestion & Route Visualization

### IETT SOAP API Integration

**Bus Stop Geometry Ingestion** (`src/data_prep/fetch_geometries.py`):
- Fetches all bus stops from IETT's `GetDurak_json` SOAP endpoint and parses coordinates into Leaflet-friendly `{code: {name, lat, lng, district}}` JSON.
- Output: `frontend/public/data/stops_geometry.json`

**Line Routes Ingestion** (`src/data_prep/fetch_line_routes.py`):
- Fetches line codes from `GetHat_json`, then ordered stop sequences per line from `DurakDetay_GYY`.
- Handles bidirectional routes: "G" (gidiş/outbound) and "D" (dönüş/return)
- Multi-level structure: `{line_code: {direction: [ordered_stop_codes]}}`
- Validation for empty routes, missing directions, and malformed responses
- Output: `frontend/public/data/line_routes.json`

### Frontend Route System

**useRoutePolyline Hook** (`frontend/src/hooks/useRoutePolyline.js`):
- Module-level caching with singleton loading pattern (`stopsCache`, `routesCache`, `loadingPromise`)
- **`getRouteStops(lineCode, direction)`**: Returns detailed stop objects `[{code, name, lat, lng, district}]`
- **`getDirectionInfo(lineCode)`**: Generates dynamic direction labels by extracting destination stop names
  - Format: `"{DESTINATION_STOP_NAME} Yönü"` (e.g., "KADIKÖY Yönü" instead of "Gidiş")
  - Stop name formatting: removes suffixes (MAH., CAD., SOK.) and converts to uppercase
  - Returns metadata: `{label, firstStop, lastStop, firstStopCode, lastStopCode}` per direction
- **`getPolyline(lineCode, direction)`**: Returns lat/lng coordinate arrays for Leaflet rendering
- **`getAvailableDirections(lineCode)`**: Determines which directions exist for a line

**MapView Enhancements** (`frontend/src/components/map/MapView.jsx`):
- **Polyline Rendering**: Blue routes with `lineCap="round"` and `lineJoin="round"` for smooth appearance
- **Interactive Stop Markers**: `<CircleMarker>` components with tooltips displaying stop names on hover
  - **Start Stop**: Green filled circle (radius=6) with "Start" label
  - **End Stop**: Red filled circle (radius=6) with "End" label  
  - **Regular Stops**: White filled circles with blue borders (radius=4, weight=2)
- **Auto-Fit Bounds**: `MapController` component uses `useMap()` hook to pan/zoom showing full route with 50px padding
- **Performance Optimization**: `useMemo` for route coordinates and stops to prevent unnecessary recalculations

### Metro Topology & Schedule Integration

**Static Topology Builder** (`src/data_prep/fetch_metro_topology.py`):
- Calls Metro Istanbul APIs (`GetLines`, `GetStationById`, `GetDirectionsByLineIdAndStationId`) and emits `frontend/public/data/metro_topology.json` containing line metadata, stations, coordinates, accessibility flags, and valid direction IDs.
- Bundles helper `update_directions.py` to normalize direction labels and IDs before loading into the frontend.

**Backend Metro Router** (`src/api/services/metro_service.py`, `src/api/routers/metro.py`):
- Loads the JSON topology into memory and exposes `/metro/topology`, `/metro/lines/{code}`, `/metro/schedule`, `/metro/duration`, and admin cache endpoints with dedicated Pydantic schemas in `src/api/schemas.py`.
- Converts Metro Istanbul timetable responses into the normalized structure (destination, `TimeInfos`, `RemainingMinutes`) consumed by the frontend.

**Frontend Metro Experience**:
- `useMetroTopology` + `MetroLayer` render Metro lines/stations on the map, auto-fitting bounds and surfacing direction metadata alongside accessibility badges.
- `MetroScheduleWidget` (compact) and `MetroScheduleModal` (full-day view) share a stale-while-revalidate cache (`frontend/src/lib/metroScheduleCache.js`) keyed by station/direction/day so users see instant timetables even when the upstream API stalls.
- LineDetailPanel detects metro lines (including the `M1 → M1A` fallback) and wires forecasts, schedule pickers, and live countdowns together for a seamless metro UX.

**M1 Branch Handling (M1A / M1B)**:
- `/lines/search` exposes `M1A` and `M1B` as separate selectable lines (branch-correct station lists + direction IDs) while `/forecast/{line}` aliases both to the same underlying `M1` prediction rows.
- The legacy `M1 → M1A` fallback remains for backwards compatibility but is superseded by the explicit branch split.

**Rail Service Windows (Out-of-Service Hours)**:
- For metro/rail lines, forecast service windows are derived from `metro_topology.json` line metadata (`first_time`/`last_time`) and handle wrap-midnight cases so the 24h chart can render gaps during inactive hours.
- **Special Case - MARMARAY**: Hardcoded service hours (06:00-00:00 with midnight wrap) implemented in both `forecast.py::_get_service_hours()` and `status_service.py` to handle missing schedule data. Frontend bypasses schedule widget requirements and forces 24h chart display with custom empty state message ("Tarife bilgisi mevcut değil"). This prevents "Out of Service" errors across all 24 hours for this cross-continental rail line.

---

## UI Platform Architecture & User Experience Flow

### Frontend Technology Stack

**Framework**: **Next.js 16** with **App Router** and **React 19**
**Styling**: **Tailwind CSS** with custom design system  
**Animations**: **Framer Motion 12** for advanced gestures and transitions
**Mapping**: **React Leaflet 5** with CartoDB light tiles and IETT route overlays
**State Management**: **Zustand 5** with localStorage persistence middleware
**Charts**: **Recharts** for time-series crowd visualization
**Internationalization**: **next-intl 4.5.5** for Turkish/English localization
**PWA**: **@ducanh2912/next-pwa** with offline capabilities and home screen installation
**Metro UX Modules**: `MetroLayer`, `MetroScheduleWidget`, `MetroScheduleModal`, and a client-side `metroScheduleCache` deliver map overlays, station/direction selectors, and instant timetables for every metro line.

### Component Architecture

#### **1. Core Layout Structure** (`frontend/src/app/`)

```typescript
// Main application layout with floating components
export default function Home() {
  return (
    <main className="relative flex h-[100dvh] w-screen flex-col">
      <SearchBar />           // Floating top search 
      <MapCaller />          // Full-screen interactive map
      <BottomNav />          // Navigation tabs  
      <LineDetailPanel />    // Slide-up prediction panel
    </main>
  );
}
```

#### **2. Interactive Map System** (`components/map/`)

**MapView.jsx**: Leaflet integration with Istanbul-centered view
- **Base Layer**: CartoDB light tiles for mobile-optimized rendering
- **User Location**: GPS integration with animated position marker (pulsing blue dot)
- **Route Visualization**: Polyline + stop-marker rendering based on ingested IETT route/stop JSON assets
- **Interactive Markers**: CircleMarker components with tooltips, distinctive start (green)/end (red) styling
- **Auto-Fit Bounds**: Automatic map panning/zooming when routes displayed
- **Custom Controls**: LocateButton with dynamic positioning based on panel state

**LocateButton.jsx**: Geolocation service with responsive positioning
- Dynamic `bottom` property: `12rem` (panel open) vs `5rem` (panel closed)
- Smooth transition animations (`transition-all duration-300`)
- Loading state with spinner icon during GPS acquisition

**MapCaller.jsx**: Dynamic import wrapper for SSR compatibility (Leaflet requires client-side rendering)

#### **3. Prediction Interface** (`components/ui/`)

**LineDetailPanel.jsx**: **Core prediction interface with Framer Motion**
```typescript
// State-driven panel with animations and gestures
const LineDetailPanel = () => {
  const { selectedLine, selectedHour, showRoute, selectedDirection } = useAppStore();
  const [forecastData, setForecastData] = useState([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const controls = useAnimation();
  
  // Drag-to-minimize gesture (mobile only)
  const handleDragEnd = (event, info) => {
    const threshold = 100;
    if (info.offset.y > threshold || info.velocity.y > 500) {
      setIsMinimized(true);
      vibrate(10);
    }
  };
  
  return (
    <motion.div 
      drag={!isDesktop ? "y" : false}
      dragConstraints={{ top: 0, bottom: 0 }}
      onDragEnd={handleDragEnd}
      animate={controls}
      className={cn(
        "fixed z-[899] bg-slate-900/95 backdrop-blur-md",
        isDesktop ? "top-20 left-4 w-96" : "bottom-16 left-0 right-0"
      )}
    >
      {/* Minimized state: Line code + route name + occupancy % + direction toggle */}
      {/* Expanded state: Full data + time slider + 24h chart + route controls */}
      <CrowdStatusDisplay />
      <TimeSlider />
      <CrowdChart data={forecastData} />
      <RouteControls />
    </motion.div>
  );
};
```

**Key Features:**
- **Framer Motion Integration**: Drag gestures, elastic constraints, AnimatePresence for smooth transitions
- **Haptic Feedback**: `navigator.vibrate()` API (10ms major actions, 5ms minor)
- **Responsive Layouts**: Desktop sidebar (384px fixed width) vs mobile drawer (full-width)
- **Minimize/Expand**: Click/drag to toggle between compact and full views
- **Route Visualization**: Direction selector with dynamic labels ("KADIKÖY Yönü"), show/hide toggle
- **Internationalization**: All strings localized via `useTranslations('lineDetail')` hook
- **Favorites System**: Star button with localStorage persistence

**TimeSlider.jsx**: Hour selection interface (0-23 range slider) with vibration feedback
**CrowdChart.jsx**: **Recharts** area chart with gradient visualization and collapsible mobile view
**SearchBar.jsx**: Debounced line search with numeric keyboard support (`inputMode="numeric"`)
**WeatherBadge.jsx**: Istanbul weather nowcast with dropdown hourly forecast

### State Management Architecture

**Zustand Store** (`store/useAppStore.js`):
```typescript
const useAppStore = create(
  persist(
    (set, get) => ({
      // Core application state
      selectedLine: null,        // Currently viewed transport line
      isPanelOpen: false,        // Detail panel visibility
      selectedHour: new Date().getHours(), // Time selector (0-23)
      userLocation: null,        // GPS coordinates [lat, lng]
      alertMessage: null,        // User notifications
      
      // Route visualization state
      showRoute: false,          // Route polyline visibility toggle
      selectedDirection: 'G',    // Active direction (G=gidiş, D=dönüş)
      
      // Favorites system
      favorites: [],             // Array of favorited line IDs
      toggleFavorite: (lineId) => {
        const favs = get().favorites;
        set({ 
          favorites: favs.includes(lineId) 
            ? favs.filter(id => id !== lineId) 
            : [...favs, lineId]
        });
      },
      isFavorite: (lineId) => get().favorites.includes(lineId),
      
      // State mutations  
      setSelectedLine: (line) => set({ selectedLine: line, isPanelOpen: true }),
      setSelectedHour: (hour) => set({ selectedHour: hour }),
      setUserLocation: (location) => set({ userLocation: location }),
      setShowRoute: (show) => set({ showRoute: show }),
      setSelectedDirection: (dir) => set({ selectedDirection: dir }),
      closePanel: () => set({ isPanelOpen: false, selectedLine: null, showRoute: false }),
    }),
    {
      name: 'ibb-transport-storage',
      partialize: (state) => ({ favorites: state.favorites }), // Only persist favorites
    }
  )
);
```

**State Flow**:
1. User searches transport line → `setSelectedLine()` → Panel opens
2. User adjusts time slider → `setSelectedHour()` → Chart re-renders for new hour
3. Location permission granted → `setUserLocation()` → Map centers on user
4. API errors → `setAlertMessage()` → Toast notification displays

### API Integration Layer

**HTTP Client** (`lib/api.js`):
```typescript
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'https://ibb-transport.onthewifi.com/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// Primary forecast endpoint
export const getForecast = async (lineName, date, direction = null) => {
  const dateString = format(date, 'yyyy-MM-dd');
  const response = await apiClient.get(`/forecast/${lineName}?target_date=${dateString}`);
  return response.data;  // Returns: HourlyForecast[]
};
```

- Supports optional `direction=G|D` query params so metro schedules can filter service windows per side.
- Response objects now include `in_service` flags plus `crowd_level` values such as `Out of Service`, enabling the UI to replace empty charts with explicit service indicators.

**Error Handling Strategy**:
- **Network Failures**: Graceful degradation with cached data fallback  
- **API Errors**: User-friendly error messages with retry mechanisms
- **Loading States**: Skeleton UI during async operations

### User Interaction Flow

**Primary User Journey**:

1. **Landing**: User arrives at map-centered interface
2. **Search**: Types transport line name in floating search bar
3. **Selection**: Clicks on search result → Line detail panel slides up
4. **API Call**: `getForecast(lineName, today)` fetches 24h predictions
5. **Visualization**: Area chart renders with color-coded crowd levels
6. **Time Exploration**: User drags time slider (0-23 hours)
7. **Real-time Updates**: Chart highlights selected hour with detailed metrics
8. **Decision**: User identifies optimal travel time based on crowd predictions

**Advanced Features**:
- **Favorites**: Save frequently used lines for quick access
- **Geolocation**: Map locate control for user positioning

**Planned / Not Implemented Yet**:
- Push notifications for high-crowd alerts
- Offline caching for forecast API responses (beyond static asset caching)
- Location-based line recommendations

---

## Reproducibility & Development Workflow

### Data Pipeline Execution

**Complete pipeline reproduction**:

```bash
# 1. Raw data preparation
(
  cd src/data_prep && python load_raw.py
)  # Writes `data/processed/transport_meta.parquet`
# Optional: enable hourly aggregation in `src/data_prep/load_raw.py` to create `data/interim/transport_hourly.parquet`

# 2. Feature engineering  
(
  cd src/features && python build_calendar_dim.py
)  # Holiday calendar generation
(
  cd src/features && python build_weather_dim.py
)  # Open-Meteo API integration
(
  cd src/features && python build_log_roliing_transport_data.py
)  # Lag/rolling features
(
  cd src/features && python build_final_features.py
)  # Multi-table joins → unified matrix
(
  cd src/features && python convert_features_to_pandas.py
)  # features_pl.parquet -> features_pd.parquet

# 3. Data validation
(
  cd src/features && python check_features_quality.py
)  # Quality assurance reporting

# 4. Train/test splitting  
python src/features/split_features.py       # Time-based dataset partitioning

# 5. Model training & evaluation
python src/model/train_model.py --version v7  # LightGBM training with YAML configs
python src/model/eval_model.py             # SHAP analysis & baseline comparison
python src/model/test_model.py             # Hold-out test evaluation

# 6. API deployment
uvicorn src.api.main:app --reload --port 8000   # FastAPI service
cd frontend && npm run dev                       # Next.js development server
```

### Configuration Management

**YAML-based Hyperparameter Control** (`src/model/config/`):
- **`common.yaml`**: Shared settings (paths, feature definitions)
- **`v7.yaml`**: Production model configuration (current API default)
- **`v6.yaml`**: Prior production configuration (kept for reproducibility)
- **Versioning**: Clear model evolution tracking for academic reproducibility

### Docker Deployment

**Production deployment** with automatic database initialization:
```bash
docker-compose up --build     # Builds API + PostgreSQL services
# Automatically loads transport metadata and initializes schema
```

### Key Implementation Details

**Feature Store Optimization** (`src/api/services/store.py`):
- **Polars-based** feature retrieval (10x faster than Pandas for large datasets)
- **Seasonal lag strategy**: Prioritizes same-month/day historical matches for prediction
- **Memory-efficient**: Selective column loading and Float32 casting for production deployment

**Database Auto-Initialization** (`src/api/utils/init_db.py`):
- **Zero-configuration setup**: Automatically populates transport line metadata  
- **Idempotent execution**: Safe to re-run without data duplication
- **Health checks**: Database connection verification with retry logic

---

## Academic Contributions & Thesis Integration

### Novel Methodological Contributions

1. **Global Model Architecture**: Demonstration of single-model superiority vs. line-specific models for transportation forecasting
2. **Lag Feature Engineering**: Systematic evaluation of temporal window selection for urban transit prediction
3. **Weather Integration**: Quantification of meteorological impact on public transportation demand  
4. **Capacity-Aware Interpretability**: Persisting trips-per-hour and vehicle capacity to make occupancy and crowd levels explainable in the UI

### Datasets for Academic Validation

**Generated Research Assets**:
- **`reports/evaluation_summary_all.csv`**: Cross-model performance comparison  
- **`reports/feature_importance_*.csv`**: SHAP-based feature attribution analysis
- **`reports/figs/shap_summary_*.png`**: Visualization for thesis methodology chapter
- **Model artifacts**: Serialized LightGBM boosters for result reproduction

### Baseline Benchmarks

**Academic Standard Comparisons**:
- **Naïve forecasting methods**: Lag-based predictions  
- **Classical time-series**: Seasonal decomposition approaches
- **Ensemble benchmarks**: Multiple model averaging for accuracy bounds

This technical implementation serves as the **complete methodology foundation** for academic evaluation, combining **production-ready software engineering** with **rigorous machine learning research standards**.
