# Job listing ingestion pipeline (take-home)

MERN app that pulls **real** remote jobs from [RemoteOK's public API](https://remoteok.com/api) (`https://remoteok.com/api`), stores them in MongoDB Atlas, and shows them on a dashboard.

Not LinkedIn / Indeed / Naukri. Source is a public JSON feed they document themselves.

## Repo layout

- `server/` — Express + Mongo + Puppeteer scraper (`npm run scrape`)
- `client/` — React (Vite) dashboard

## Local setup

### 1. MongoDB Atlas

1. Create a free cluster.
2. Network Access: allow your IP (or `0.0.0.0/0` only if you understand the risk).
3. Database Access: a user/password.
4. Copy `server/.env.example` → `server/.env` and paste the connection string. Keep the DB name in the URI (`...mongodb.net/jobscraper?...`).

### 2. Install

```bash
npm install
cd server && npm install
cd ../client && npm install
```

Puppeteer needs its own Chrome (not necessarily the browser you use every day):

```bash
cd server
npx puppeteer browsers install chrome
```

### 3. Run

```bash
# terminal 1
npm run dev:server

# terminal 2
npm run dev:client

# ingest once (needs Atlas + Puppeteer Chrome)
npm run scrape
```

- API: http://localhost:5000/api/health
- UI: http://localhost:5173 — the dashboard: a jobs table, a "Run scrape now" button, and a status panel (last run, circuit breaker, next scheduled run). If the API isn't reachable it says so instead of showing a blank page.

API endpoints:

- `GET /api/health` — `{ ok, mongo }`, 503 if Mongo isn't connected
- `GET /api/jobs?page=1&limit=20` — paginated listings, newest `postedDate` first
- `POST /api/scrape/trigger` — starts a scrape in the background (202), or 409 if one's already running
- `GET /api/scrape/status` — `{ running, lastRun, circuit, nextScheduledRun }`

Health returns `{ ok, mongo }`. If Mongo is down you get HTTP 503 — that is intentional, not a silent green check.

After a scrape, Atlas → Browse Collections should show `jobs`. A successful scrape JSON includes `delayMs` and `proxyUsed` (false unless you set `PROXY_URLS`).

Optional: `PROXY_URLS` (comma-separated) in `server/.env` enables round-robin `--proxy-server`. Leave it unset for a direct connection.

Starting the server (`npm run dev:server` / `npm start`) also starts an automatic scrape every 6 hours by default (`SCRAPE_CRON_SCHEDULE`, `node-cron`) — set `SCRAPE_SCHEDULER_ENABLED=false` to turn that off and only scrape manually via `npm run scrape`. This runs in the same process, so it only fires while the server itself is awake — on a free Render deploy that spins down on inactivity, that means "every 6h while awake," not truly always-on.

## Deploy

- **API** (`server/`) → Render, via the committed `render.yaml` (root dir `server`, build installs Chrome, health check `/api/health`). Set `MONGODB_URI` and `CLIENT_ORIGIN` in the Render dashboard — not committed, `render.yaml` marks them `sync: false` on purpose.
- **Frontend** (`client/`) → Vercel/Netlify, root directory `client`, build `npm run build`, output `dist`. Set `VITE_API_URL` to the Render API's URL (no trailing slash).
- Atlas → Network Access must allow Render's outbound IP. Render's free tier has no static IP, so this means `0.0.0.0/0` for a demo deploy — same trade-off the local setup section above already flags.
- Deploy order matters once, not every time: API first (with a placeholder `CLIENT_ORIGIN`), then frontend (pointed at the live API URL), then go back and set the API's `CLIENT_ORIGIN` to the real frontend URL and redeploy.

## Docs

- `design-doc.md` — ingestion, detection, ToS line
- `DECISIONS.md` — why we chose X over Y, and what AI vs you owned

## Progress checklist

- [x] Phase 0 — Source locked: RemoteOK public JSON, Plan B (RSS), Plan C (fetch/axios)
- [x] Phase 1 — Repo scaffold: Express + Vite, ESLint/Prettier, Atlas connection, `/api/health`
- [x] Phase 2 — Data model: `Job` (unique `url`, `contentHash`), `ScrapeLog`
- [x] Phase 3 — Scraper core: Puppeteer + stealth, normalize, `bulkWrite` upsert (`npm run scrape`)
- [x] Phase 4 — Anti-detection: UA rotation, jitter, extra headers, stub proxy round-robin
- [x] Phase 5 — Resilience: retry/backoff, empty-payload = failure, circuit breaker, every run logged
- [x] Phase 6 — Scheduler: `node-cron`, shared `runScrape`, honest about Render spin-down
- [x] Phase 7 — Express API: `GET /api/jobs`, `POST /api/scrape/trigger`, `GET /api/scrape/status`
- [x] Phase 8 — Dashboard: listings table, trigger button, status panel, responsive, dark mode
- [ ] Phase 9 — Deploy: API+Chrome on Render/Railway, frontend on Vercel/Netlify, live E2E check
- [x] Phase 10 — `design-doc.md` restructured: engineering-approach intro, 3 verified Mermaid diagrams, all 4 required sections
- [x] Phase 11 — `DECISIONS.md` rewritten to 1 page (done ahead of 9/10, before deploy)
- [ ] Phase 12 — Interview walkthrough notes
