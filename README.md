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
- UI: http://localhost:5173

Health returns `{ ok, mongo }`. If Mongo is down you get HTTP 503 — that is intentional, not a silent green check.

After a scrape, Atlas → Browse Collections should show `jobs`. A successful scrape JSON includes `delayMs` and `proxyUsed` (false unless you set `PROXY_URLS`).

Optional: `PROXY_URLS` (comma-separated) in `server/.env` enables round-robin `--proxy-server`. Leave it unset for a direct connection.

## Docs

- `design-doc.md` — ingestion, detection, ToS line
- `DECISIONS.md` — why we chose X over Y, and what AI vs you owned
