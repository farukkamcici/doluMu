## Metro Cache Freeze Mode (Temporary Operation)

When `METRO_CACHE_FREEZE=1`, the backend keeps using the last known `metro_schedules` rows and avoids deleting them, so the system can keep working while the upstream Metro İstanbul API is unavailable.

### What Freeze Does

- **Serves last-known schedules**: `POST /metro/schedule` will return the latest cached `(station_id, direction_id)` payload found in `metro_schedules`, even if it is older than the usual stale window.
- **Prevents deletion**: Metro cache cleanup is skipped so old rows are not purged by retention logic.
- **Stops metro prefetch spam**: The nightly `metro_schedule_prefetch` job exits early and the retry job is disabled, so we do not hammer the upstream when it is failing.
- **Forecasts continue**: Forecast generation uses cached metro trips-per-hour derived from `metro_schedules` (it does not fetch MetroMobile directly). With freeze enabled it will use the last available day.

### How To Enable (Server)

1. Set env vars for the API container:
   - `METRO_CACHE_FREEZE=1`
   - (optional) `METRO_CACHE_RETENTION_DAYS=3650`
2. Restart/redeploy the API so env is re-read on import/startup.

### Optional: Disable Metro Timetable UI (Frontend)

If you want to hide/disable minute-level metro timetable displays in the UI while the system is in freeze mode, set:

- `NEXT_PUBLIC_METRO_TIMETABLE_DISABLED=1`

This stops the frontend from calling `POST /api/metro/schedule` and replaces timetable widgets/modals with a temporary notice.

### How To Verify

- `GET /api/admin/metro/cache/status` should show `storage.freeze_enabled: true`.
- `POST /api/metro/schedule` should return quickly even when the upstream MetroMobile API is returning 500.
- New rows for today will not appear in `metro_schedules` while freeze is enabled.

### How To Disable (Return To Live)

1. Remove `METRO_CACHE_FREEZE` (or set it to `0`).
2. Restart/redeploy the API.
3. Manually trigger a metro refresh:
   - `POST /api/admin/metro/cache/refresh` with `{ "mode": "all", "force": true }`
4. Confirm `metro_schedules` starts getting new `valid_for` rows again.

### Notes / Known Constraints

- Freeze mode can only serve station/direction pairs that already exist in `metro_schedules`. If topology changes introduce new pairs, those may still attempt an upstream fetch (avoid topology changes while frozen).
- Metro admin endpoints under `/api/metro/admin/*` now require JWT admin auth (to prevent accidental cache wipes).
