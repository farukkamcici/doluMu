# Deployment

| Part | Where | How it ships |
|---|---|---|
| Website (Next.js) | Vercel | Every push to `main` (Vercel Git integration) |
| API (FastAPI) + Postgres | Hetzner VPS, managed by **Dokploy** | Push to `main` that touches backend files → GitHub Action `Deploy API` → Dokploy webhook → `docker compose up --build` |
| Static transit data | `frontend/public/data/` in git | Monthly GitHub Action `Refresh transit data` (also redeploys the API, which reads it) |
| Live İBB data (`/api/live/*`) | Hetzner VPS, container `dolumu-live-web` | `live/deploy.sh` from a checkout (ships HEAD, builds on the server); the website rewrites `/api/live/*` to it |

## API server (since 2026-10-02)

- **Dokploy** runs on the server (Traefik for HTTPS, its own Postgres for settings). The app is the compose
  project **api** in Dokploy project **dolumu**, built from this repo with [`docker-compose.dokploy.yml`](../../docker-compose.dokploy.yml).
- **Image**: [`Dockerfile`](../../Dockerfile) installs only runtime deps (`requirements-api.txt`) locked by
  `constraints-api.txt` to the exact versions the forecasts were produced with. Don't upgrade those pins
  casually: model outputs must stay identical (thesis). Training dependencies stay in `requirements.txt`.
- **Artifacts** (not in git): the model and feature files live on the host in `/opt/dolumu/artifacts/`
  (`models/lgbm_transport_v7.txt`, `data/processed/`) and are mounted read-only.
- **Database**: Postgres 15 in the same compose project, on the long-lived volume `app_postgres_data`
  (declared `external` so a redeploy never recreates it).
- **Environment**: set in Dokploy (Environment tab of the compose app); same keys as the old `.env`.
- **Domain**: `ibb-transport.onthewifi.com` → `api:8000`, Let's Encrypt via Traefik.
- **Backups**: `/opt/dolumu/backup.sh` (cron 03:30) dumps the database to `/opt/dolumu/backups/`, kept 14 days.

## Live data server (since 2026-10-28)

- `live/` runs the website's own loaders (`frontend/src/lib/live`) as a small Node server (Hono), so the
  `/api/live/*` calls no longer run as Vercel functions. `frontend/next.config.js` rewrites them to
  `https://ibb-transport.onthewifi.com/live/*`.
- On the server: `/opt/dolumu/live-web` (compose project `dolumu-live-web`, 256 MB / 0.5 CPU cap), outside Dokploy.
  Traefik routes `PathPrefix(/live/)` of the API domain to it; everything else still goes to the API.
  The mobile app API (repo `dolumu-mobile`, `apps/api`) runs the same way in `/opt/dolumu/app-api` under `/app/`.
- Cache: in memory, stale-while-revalidate; after a failed refresh the next try waits 30 s.
- **İBB blocks non-Turkish IPs** (since 2026-10-22; the server, Vercel and other foreign hosts time out). If
  `IBB_PROXY_URL` is set in `/opt/dolumu/live-web/egress.conf` (an HTTP forward proxy on a Turkish line),
  `*.ibb.gov.tr` requests go through it (`live/egress.ts`). `GET /live/healthz` shows `ibb.ok`, checked every 2 min.
- Deploy: `live/deploy.sh` (commit first: it ships HEAD). Logs: `docker logs dolumu-live-web-live-1`.

## Operating

- **Dokploy panel**: not exposed to the internet (the firewall only allows 22/80/443). Open it through SSH:
  `ssh -N -L 13000:127.0.0.1:3000 root@<server>` → http://localhost:13000. Logs, restarts, env, deploy history live there.
- **Deploy by hand**: GitHub → Actions → *Deploy API* → Run workflow, or *Deploy* in the Dokploy panel.
- **Rollback**: redeploy an earlier commit from Dokploy's deployment list, or revert on `main`.
- **Restore a backup**: `gunzip -c backup.sql.gz | docker exec -i <db container> psql -U <user> <db>` (into an empty database).
- Only the path `/api/deploy/` of the API domain is routed to Dokploy (for the deploy webhook, which carries a secret token);
  see `/etc/dokploy/traefik/dynamic/dolumu-deploy-webhook.yml` on the server.
