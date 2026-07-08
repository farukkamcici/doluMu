# Bus Capacity Snapshots (IETT Archive → Capacity Layer)

This document explains how `src/data_prep/build_bus_capacity_snapshots.py` works, what it reads, what it writes, and how the produced capacity layer can be integrated with hourly trips and ML passenger forecasts to compute occupancy.

## Why this exists

For bus lines, we want an operational capacity baseline derived from the observed fleet that serves each line.

The end goal is:

1. Estimate per-vehicle capacity for each line using observed fleet mix.
2. Combine it later with hourly trip counts and hourly passenger forecasts to compute:
   - Effective hourly line capacity
   - Expected occupancy percentage
   - UI explanations about how occupancy changes when a different vehicle model arrives

## Data sources

### 1) IETT Archive Duty SOAP endpoint (per day)

- URL: `https://api.ibb.gov.tr/iett/ibb/ibb360.asmx`
- SOAPAction: `http://tempuri.org/GetIettArsivGorev_json`
- Request body includes `<Tarih>yyyyMMdd</Tarih>`
- Response: SOAP XML contains `GetIettArsivGorev_jsonResult` which is a JSON string.

Fields used:

- `SHATKODU` → `line_code`
- `SKAPINUMARA` → `door_code`

Resilience:

- If the endpoint returns an empty SOAP result / empty JSON for a day, the script retries once (0.5s sleep) and then accepts it as a valid 0-row day.
- Real HTTP/XML/JSON errors are retried by `tenacity` (exponential backoff).
- If a day still fails after retries, it is logged and the pipeline continues with other days.

### 2) Vehicle reference (single file)

- Default path: `data/raw/arac_kapasite.csv` (override with `--vehicle-ref-path`)
- Expected header columns:
  - `Kapı Kodu`, `Plaka`, `Model Yılı`, `Marka`, `Tip`, `İşletmeci`, `full_capacity`

Rename mapping used:

- `Kapı Kodu` → `door_code`
- `Plaka` → `plate`
- `Model Yılı` → `model_year`
- `Marka` → `brand_model_raw`
- `Tip` → `vehicle_type_raw`
- `İşletmeci` → `operator_raw`
- `full_capacity` → parsed into `full_capacity_int`

Reference dedupe:

- If the reference contains duplicate `door_code`, it is deduplicated with `keep="first"` and the count is logged as `n_duplicate_door_codes_in_ref`.

Capacity parsing:

- `full_capacity` may be int-like or string-like.
- If it is a range like `"85 - 90"`, we take the mean and `round()` to int.
- Otherwise we parse the first numeric value and `round()` to int.

## Run / CLI

Example:

```bash
python -m src.data_prep.build_bus_capacity_snapshots \
  --dates 20251201,20251203,20251205 \
  --vehicle-ref-path data/raw/arac_kapasite.csv \
  --out-dir data \
  --format parquet
```

Important args:

- `--dates`: comma-separated `yyyyMMdd` list
- `--vehicle-ref-path`: reference file
- `--format`: `parquet` or `csv`
- `--min-k`: minimum number of capacity-bearing unique vehicles per line for confidence labeling (default: 3)
- `--top-k-mix`: keep top K vehicle models per line in the mix table (default: 10)

Optional step (offline patch, no SOAP):

```bash
python -m src.data_prep.impute_no_data_line_capacities \
  --processed-dir data/processed/bus_capacity_snapshots \
  --format parquet \
  --inplace
```

This fills weighted/representative capacity fields for a fixed set of known lines
that otherwise appear with `confidence="no_data"`.

## Outputs

All outputs are written under `--out-dir` (default `data/`). Format is controlled by `--format`.

### A) Daily snapshot (raw archive)

- Path: `data/interim/bus_capacity_snapshots/arsiv_gorev_YYYYMMDD.(parquet|csv)`
- Columns:
  - `date` (Date)
  - `line_code` (String)
  - `door_code` (String)

Notes:

- Within the same day+line, repeated `(door_code)` is deduplicated.
- If the same `door_code` appears on multiple lines in the same day, the script keeps one row per line and logs the count (`n_doors_multi_line_same_day`).

### B) Master table (joined)

- Path: `data/processed/bus_capacity_snapshots/bus_line_vehicle_master.(parquet|csv)`
- Columns:
  - `date`, `line_code`, `door_code`
  - `plate`, `model_year`, `brand_model_raw`, `vehicle_type_raw`, `operator_raw`
  - `full_capacity_int` (nullable)

Join rule:

- `archive_snapshot LEFT JOIN vehicle_ref ON door_code`
- If a `door_code` is not present in the reference, the row is retained and reference fields stay null.

### C) Daily line summary

- Path: `data/processed/bus_capacity_snapshots/line_capacity_daily.(parquet|csv)`

Columns and how they are computed (per `date`, `line_code`):

- `n_vehicles_total`
  - `n_unique(door_code)` across that day+line
- `n_vehicles_with_capacity`
  - `n_unique(door_code)` where `full_capacity_int IS NOT NULL`
- `missing_capacity_rate`
  - `1 - n_vehicles_with_capacity / n_vehicles_total` (null if total is 0)
- `avg_full_capacity`
  - `mean(full_capacity_int)` (ignores nulls)
- `median_full_capacity`
  - `median(full_capacity_int)` (ignores nulls)
- `expected_capacity_weighted_daily`
  - daily vehicle-mix weighted expected capacity (vehicles share-based):
    - for each model `m` in that day+line:
      - `model_capacity_int_daily(m) = median(full_capacity_int)` within that model (that day)
      - `share_daily(m) = n_unique(door_code in m) / n_vehicles_with_capacity`
    - `expected_capacity_weighted_daily = sum_m (share_daily(m) * model_capacity_int_daily(m))`
  - rounded to 2 decimals

### D) Line representative + global capacity stats

- Path: `data/processed/bus_capacity_snapshots/line_capacity_representative_vehicle.(parquet|csv)`

This is the main capacity table for downstream usage.

Key columns (per `line_code`):

Capacity distribution stats (capacity-bearing records only):

- `capacity_min`, `capacity_max`: min/max of `full_capacity_int` across all days for that line
- `capacity_mean`: mean of `full_capacity_int` (rounded 2)
- `capacity_median`: median of `full_capacity_int` (int)
- `capacity_std`, `p10_capacity`, `p90_capacity`: diagnostics

Target capacities:

- `target_capacity_median`: equals `capacity_median`
- `target_capacity_mean`: equals `capacity_mean`

Weighted expected capacity (PRIMARY metric):

- `expected_capacity_weighted`:
  - computed from per-line vehicle mix using unique vehicle shares:
  - `expected_capacity_weighted = sum_m (share_by_vehicles(m) * model_capacity_int(m))`
  - rounded to 2 decimals
- `expected_capacity_weighted_int`:
  - `round(expected_capacity_weighted)` cast to int

Representative model selection:

1. `model_frequency_vehicles` DESC (most common model by unique vehicles)
2. `abs(model_capacity_int - target_capacity_median)` ASC
3. `n_days_present` DESC
4. `brand_model_norm` ASC (deterministic)

Representative outputs:

- `representative_brand_model` (human label)
- `representative_full_capacity_int` (model capacity)
- `representative_share` (equals share_by_vehicles for that model)

Confidence:

- `no_data`: `n_vehicles_with_capacity_total == 0` (no capacity-bearing vehicles observed)
  - in this case representative and weighted fields are null
- `insufficient_data`: capacity exists but `n_vehicles_with_capacity_total < --min-k`
- `low`: `missing_capacity_rate > 0.40`
- `medium/high`: heuristic based on missing rate and representative share

Likely models list for UI:

- `likely_models_topk_json`: compact JSON string containing top 5 models by `share_by_vehicles`:
  - `[{"brand_model": "...", "model_capacity_int": 151, "share_by_vehicles": 0.42}, ...]`
  - allows simple UI tooltips without joining the mix file

### E) Line vehicle mix (for UI explanations)

- Path: `data/processed/bus_capacity_snapshots/line_capacity_vehicle_mix.(parquet|csv)`
- One row per (`line_code`, `brand_model_norm`)

Computed across all requested days, capacity-bearing only.

Core columns:

- `brand_model_norm`: normalized model name used for grouping
- `representative_brand_model`: stable human label for the model
- `model_capacity_int`: `median(full_capacity_int)` within that model (rounded to int)
- `model_frequency_vehicles`: `n_unique(door_code)` for that model across all days
- `model_frequency_records`: row count across all days (diagnostic)
- `share_by_vehicles`: `model_frequency_vehicles / n_vehicles_with_capacity_total`
- `share_by_records`: `model_frequency_records / total_capacity_records`
- `n_days_present`: `n_unique(date)` where this model appears with capacity
- `capacity_min_within_model`, `capacity_max_within_model`

Occupancy sensitivity fields (UI-ready):

- `occupancy_multiplier_vs_expected = model_capacity_int / expected_capacity_weighted`
  - >1 means the model is larger than expected (occupancy% lower)
- `occupancy_delta_pct_vs_expected = (expected_capacity_weighted / model_capacity_int - 1) * 100`
  - positive means model is smaller than expected → occupancy% higher than expected

Sorting / top-k:

- Sorted by `(line_code asc, model_frequency_vehicles desc, brand_model_norm asc)`
- The script keeps top `--top-k-mix` per line.

## Per-day JSON logs

Path: `reports/logs/bus_capacity_YYYYMMDD.json`

Important fields:

- `n_archive_rows`, `n_unique_lines`, `n_unique_doors`
- `n_invalid_door_code` (null/empty/whitespace/sentinel values removed)
- `n_doors_with_ref`, `missing_ref_rate`
- `n_doors_with_capacity`, `missing_capacity_rate`
- `n_doors_multi_line_same_day`
- `n_duplicate_door_codes_in_ref`
- `top_missing_door_codes` (debug list of door codes not found in reference)
- `error` (only if the day fails)

## How to integrate into the system

### What we have

From this ETL we have, per line:

- `expected_capacity_weighted_int` (expected capacity per vehicle for the line)
- `likely_models_topk_json` and full `line_capacity_vehicle_mix` for UX explanations

### What we still need

To compute an effective hourly capacity, we need hourly trip counts:

- `trips_per_hour(line_code, hour)`

### Recommended integration formula

For each (`line`, `date`, `hour`):

- `effective_max_capacity = trips_per_hour * expected_capacity_weighted_int`
- `occupancy_pct = predicted_passengers / effective_max_capacity`

Where `predicted_passengers` is already produced by the ML forecast pipeline.

### Last-resort fallback (API safety)

Even after the offline imputation step, there may still be lines/dates where no
capacity value is available (e.g., a line never appears in the requested archive
days and is not covered by the fixed no-data list).

To prevent occupancy computations from breaking (division by null/zero), we
standardize a **last-resort default per-vehicle capacity**:

- `DEFAULT_VEHICLE_CAPACITY_FALLBACK = 100` passengers per vehicle

Recommended usage:

- If `expected_capacity_weighted_int(line)` is missing at API calculation time,
  use `100` as the per-vehicle capacity for `effective_max_capacity`.
- Keep an explicit flag/notes in the API layer (or logs) that a fallback was
  used, so we can monitor and improve coverage.

This fallback should be treated as a safety net, not a source of truth.

### Where to integrate (repo locations)

Current occupancy calculation uses `DailyForecast.max_capacity`:

- `src/api/services/batch_forecast.py` writes `max_capacity` for each forecast row.
- `src/api/routers/forecast.py` returns it to clients.

Two integration options:

1) Write effective capacity into DB during batch job (recommended)
   - Update the daily forecast job to set:
     - `max_capacity = trips_per_hour(line, hour) * expected_capacity_weighted_int(line)`
   - Pros: API stays unchanged; capacity is stored and queryable.
   - Cons: Requires access to trips-per-hour during job.

2) Compute effective capacity at API response time
   - Keep DB unchanged and compute occupancy/max_capacity on the fly.
   - Pros: No DB migration; easy to iterate.
   - Cons: More runtime dependency + potential latency.

## UI/UX integration ideas

### Minimal UI (no extra joins)

Use `likely_models_topk_json` from `line_capacity_representative_vehicle`:

- Show Typical vehicles for this line list in a tooltip.
- Show `expected_capacity_weighted_int` as the baseline per-vehicle capacity.

### Rich UI (explain sensitivity)

Join by `line_code` with `line_capacity_vehicle_mix`:

- For each model row, display:
  - `share_by_vehicles` as a small horizontal bar
  - `model_capacity_int`
  - `occupancy_delta_pct_vs_expected` with sign and short explanation:
    - `+X%`: If this smaller vehicle arrives, occupancy% will be ~X% higher than expected.
    - `-X%`: If this larger vehicle arrives, occupancy% will be ~X% lower than expected.

### Forecast view

- Main occupancy chart uses hourly predicted passengers / effective capacity.
- Add an uncertainty band using `capacity_min`/`capacity_max` from the representative file:
  - best case: `trips_per_hour * capacity_max`
  - worst case: `trips_per_hour * capacity_min`

## Operational notes

- Re-run the ETL periodically (e.g., weekly) with the last N days to keep the fleet mix updated.
- Monitor daily logs for spikes in `missing_ref_rate` (reference drift or new door codes).

---

Related:

- ETL script: `src/data_prep/build_bus_capacity_snapshots.py`
- Outputs: `data/processed/bus_capacity_snapshots/`
