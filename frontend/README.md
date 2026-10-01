# DoluMu frontend

Mobile-first Next.js app for hourly crowding forecasts on Istanbul public transport.
Product and design decisions (information architecture, relative crowd levels, design tokens)
are in [DESIGN.md](DESIGN.md).

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm run lint
```

`NEXT_PUBLIC_API_URL` points at the FastAPI backend (defaults to the production API).

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 3 · TanStack Query 5 ·
next-intl 4 (TR default, EN) · next-themes · Radix Dialog · Leaflet + MapLibre (OpenFreeMap tiles) · Zustand (local prefs)

## Routes

| Route | Screen |
|---|---|
| `/[locale]` | Home: search, favourites, popular lines, weather/traffic |
| `/[locale]/line/[code]?dir=G\|D&day=today\|tomorrow` | Line: now card, hourly chart, departures, route map, methodology |
| `/[locale]/settings` | Language, theme, install, report a problem, about, local data |
| `/[locale]/forecast` | Redirects home (v1 favourites page) |
| `/[locale]/admin` | Admin panel (unchanged v1 code, JS) |

`src/proxy.js` handles locale detection and prefixes.

## Layout

```
src/
  app/[locale]/        routes (server components, metadata)
  components/
    app/               providers, app bar
    home/ line/ settings/ search/   screen-level components
    transit/           LineBadge, LevelPill, HourlyBars
    primitives/        Button, Card, Segmented, Sheet, Notice, Skeleton
    admin/             admin panel (v1)
  lib/
    api.ts             typed API client
    queries.ts         TanStack Query hooks (cache times per endpoint)
    crowd.ts           relative crowd levels, quieter-hour suggestion
    lines.ts           modes, official rail colours, search normalisation
    time.ts            Europe/Istanbul clock helpers
  store/prefs.ts       favourites + recent lines (localStorage, v1-compatible key)
messages/{tr,en}.json  UI copy
public/data/           metro_topology.json, marmaray_static_schedule.json (also read by the backend)
```

## Conventions

- All hour logic uses Istanbul time (`lib/time.ts`), never the device timezone.
- Colours come from CSS variables in `src/app/globals.css`; use the Tailwind tokens
  (`bg`, `card`, `fg`, `fg-muted`, `brand`, `level-*`, `mode-*`) instead of raw colours.
- Crowd colours are always paired with a text label.
- Search queries are folded to lower-case ASCII before hitting the API (`normalizeQuery`),
  because the backend only matches that form ("Kadıköy" → "kadikoy").
