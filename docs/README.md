# Documentation

Documentation for **DoluMu** — Istanbul public-transit crowding prediction. For the product overview see the [root README](../README.md); for backend internals see [`README_TECHNICAL.md`](../README_TECHNICAL.md).

## Product

- [product/prd.md](product/prd.md) — Product requirements.

## Reference

- [reference/technical-overview.md](reference/technical-overview.md) — System technical overview.
- [reference/technical-qa.md](reference/technical-qa.md) — Technical Q&A.
- [ibb_api_doc.pdf](ibb_api_doc.pdf) — İBB open-data API reference.
- [data_quality_log.txt](data_quality_log.txt) / [data_quality_log_pl.txt](data_quality_log_pl.txt) — Data-quality notes from the offline pipeline.

## Subsystems

- [subsystems/metro-integration.md](subsystems/metro-integration.md) — Metro İstanbul API integration, topology, timetables.
- [subsystems/metro-cache-strategy.md](subsystems/metro-cache-strategy.md) — Stale-while-revalidate caching for metro timetables.
- [subsystems/metro-cache-freeze-mode.md](subsystems/metro-cache-freeze-mode.md) — Freeze mode used while the upstream Metro API is down (`METRO_CACHE_FREEZE=1`).
- [subsystems/bus-capacity-snapshots.md](subsystems/bus-capacity-snapshots.md) — Bus vehicle-mix capacity snapshots.
- [subsystems/capacity-integration.md](subsystems/capacity-integration.md) — Capacity-aware forecast integration.

## Seeds

- [`../seeds/metro_schedules_2026-01-17.sql.gz`](../seeds/metro_schedules_2026-01-17.sql.gz) — Frozen `metro_schedules` snapshot, restored into a fresh database because the upstream Metro API is unavailable. See [metro-cache-freeze-mode.md](subsystems/metro-cache-freeze-mode.md).

---

> **`docs/internal/`** holds private operational notes (deployment runbook, server details, dev logs). It is intentionally git-ignored and kept out of this public repository.
