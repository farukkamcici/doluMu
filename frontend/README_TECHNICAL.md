# Frontend Technical README (Next.js PWA)

This document explains the **frontend architecture and development workflow** for DoluMu.

- **User-facing UI guide**: see `frontend/README_UI.md`
- **Backend API docs**: see `src/api/README_API.md`

---

## Tech Stack

- **Framework**: Next.js (App Router) + React
- **Styling**: Tailwind CSS
- **Maps**: Leaflet
- **Charts**: Recharts
- **Animations**: Framer Motion
- **HTTP**: Axios (`frontend/src/lib/api.js`)
- **i18n**: Locale routing + JSON message catalogs (`frontend/messages/*.json`)

---

## Local Development

### Prerequisites

- Node.js + npm

### Install & run

```bash
cd frontend
npm install
npm run dev
```

### Production build

```bash
cd frontend
npm run build
npm run start
```

### Lint

```bash
cd frontend
npm run lint
```

---

## Environment Variables

Frontend API requests use `NEXT_PUBLIC_API_URL`.

- Default fallback (if unset): `https://ibb-transport.onthewifi.com/api`
- Local example:

```bash
export NEXT_PUBLIC_API_URL="http://localhost:8000/api"
```

The value is consumed by `frontend/src/lib/api.js` via `axios.create({ baseURL: ... })`.

---

## Project Structure (Frontend)

Key directories:

- `frontend/src/app/[locale]/...`: Next.js App Router pages with locale segment
- `frontend/src/components/`: UI components (map, panels, modals, admin tools)
- `frontend/src/lib/api.js`: Backend API client + typed-ish JSDoc helpers
- `frontend/messages/en.json`, `frontend/messages/tr.json`: UI translations
- `frontend/public/data/`: Static topology/schedule assets used by the UI

---

## Data Flow (UI → API)

Most UI screens follow the same pattern:

1. **Search** calls `GET /api/lines/search` (via `searchLines()` in `frontend/src/lib/api.js`).
2. Selecting a line fetches:
   - `GET /api/forecast/{line}` for the 24h prediction series
   - `GET /api/lines/{line}/status` for service-hour + alert context (direction-aware)
3. When the user opens capacity details:
   - `GET /api/capacity/{line_code}`
   - `GET /api/capacity/{line_code}/mix?top_k=...` (bus vehicle mix)

---

## i18n & Locale Routing

- Locale is part of the URL (`/tr/...`, `/en/...`) via `frontend/src/app/[locale]`.
- Text is sourced from message catalogs:
  - `frontend/messages/tr.json`
  - `frontend/messages/en.json`

When adding a new UI string:

1. Add keys to both JSON files.
2. Use the project’s existing message lookup utilities in components (keep keys stable).

---

## Notable UI Components

- `frontend/src/components/ui/MapTopBar.jsx`: Search + badges (weather/traffic) in a shared header.
- `frontend/src/components/ui/LineDetailPanel.jsx`: Main interaction surface for forecasts, direction selection, and schedules.
- `frontend/src/components/line-detail/MetroScheduleModal.jsx`: Full-day metro timetable modal.
- `frontend/src/components/ui/CapacityModal.jsx`: Explains `max_capacity`, `vehicle_capacity`, and `trips_per_hour` (and bus vehicle-mix when available).
- `frontend/src/components/admin/*`: Admin-only panels for scheduler state and cache management.

---

## Static Assets

- `frontend/public/data/metro_topology.json`: Station/line geometry and direction metadata.
- `frontend/public/data/marmaray_static_schedule.json`: Marmaray fallback schedule used for consistent service-hours/capacity logic.

---

## Deployment Notes

- Vercel builds must have `NEXT_PUBLIC_API_URL` configured for the target backend environment.
- Dependency security updates should be validated with `npm run build` before merging.
