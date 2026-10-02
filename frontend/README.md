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
next-intl 4 (TR default, EN) · next-themes · Radix Dialog · MapLibre GL (OpenFreeMap tiles, recoloured) · Zustand (local prefs) ·
Barlow / Barlow Semi Condensed

## Routes

| Route | Screen |
|---|---|
| `/[locale]` | Home: network map with hour scrubber, search, favourites, "right now" board, nearby stations |
| `/[locale]/line/[code]?dir=G\|D&day=today\|tomorrow` | Line: focused map, now + calm/avoid windows, hourly chart, departures, station strip, methodology |
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
    home/ line/ settings/ search/ station/   screen-level components
    map/               TransitMap (MapLibre), MapPanel (full-screen toggle)
    transit/           LineBadge, CrowdGlyph, LevelPill, HourlyBars
    primitives/        Button, Card, Segmented, Sheet, Notice, Skeleton
    admin/             admin panel (v1)
  lib/
    api.ts             typed API client
    queries.ts         TanStack Query hooks (cache times per endpoint)
    crowd.ts           relative crowd levels, quieter-hour suggestion, calm/peak windows
    network.ts         rail network + Metrobüs geometry, merged stations, nearest stations
    lines.ts           modes, official rail colours, search normalisation
    time.ts            Europe/Istanbul clock helpers
  store/prefs.ts       favourites + recent lines (localStorage, v1-compatible key)
messages/{tr,en}.json  UI copy
public/data/           metro_topology.json, marmaray_static_schedule.json (both also read by the backend),
                       marmaray_stations.json (OpenStreetMap, ODbL)
```

## Conventions

- All hour logic uses Istanbul time (`lib/time.ts`), never the device timezone.
- Colours come from CSS variables in `src/app/globals.css`; use the Tailwind tokens
  (`bg`, `card`, `fg`, `fg-muted`, `signal`, `line`) instead of raw colours. The only chroma in the
  UI is official line colours and `signal` (peak). The map reads `--map-*` variables, so a theme
  switch repaints it without reloading the style.
- Crowd levels are always a word plus the people glyph, never colour alone.
- Search queries are folded to lower-case ASCII before hitting the API (`normalizeQuery`),
  because the backend only matches that form ("Kadıköy" → "kadikoy").
