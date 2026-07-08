# Documentation Index

Project documentation for **DoluMu** (Istanbul transit crowding prediction). For the product overview see the [root README](../README.md); for backend internals see [`README_TECHNICAL.md`](../README_TECHNICAL.md).

## Operations & Deployment

- [MIGRATION_HETZNER.md](MIGRATION_HETZNER.md) — Production deployment & disaster-recovery runbook (Hetzner + Docker + Caddy). Includes the as-built record of the current live server and a "can this be fully free (Vercel + Supabase)?" analysis.

## Subsystems

- [METRO_INTEGRATION.md](METRO_INTEGRATION.md) — Metro İstanbul API integration, topology, timetables.
- [METRO_CACHE_STRATEGY.md](METRO_CACHE_STRATEGY.md) — Stale-while-revalidate caching for metro timetables.
- [METRO_CACHE_FREEZE_MODE.md](METRO_CACHE_FREEZE_MODE.md) — Temporary freeze mode used while the upstream Metro API is down (`METRO_CACHE_FREEZE=1`).
- [BUS_CAPACITY_SNAPSHOTS.md](BUS_CAPACITY_SNAPSHOTS.md) — Bus vehicle-mix capacity snapshots.
- [CAPACITY_INTEGRATION_PLAN.md](CAPACITY_INTEGRATION_PLAN.md) — Capacity-aware forecast integration.

## Product & Reference

- [PRD.md](PRD.md) — Product requirements.
- [TECHNICAL_QA.md](TECHNICAL_QA.md) — Technical Q&A.
- [Technical Document.md](Technical%20Document.md) — Technical overview.
- [project-summary.md](project-summary.md) / [project-log.md](project-log.md) — Project history.
- `ibb_api_doc.pdf` — İBB open-data API reference.
- `data_quality_log.txt`, `data_quality_log_pl.txt` — Data-quality notes from the offline pipeline.

## Seeds

- `../seeds/metro_schedules_2026-01-17.sql.gz` — Frozen `metro_schedules` snapshot, restored into a fresh database because the upstream Metro API is unavailable. See [METRO_CACHE_FREEZE_MODE.md](METRO_CACHE_FREEZE_MODE.md) and the migration runbook.
