# Design doc

## Goal

Ingest remote job listings from a **public, documented** source, persist them, and display them. The pipeline should still behave predictably if the source slows down, returns empty payloads, or starts blocking the client.

## Source (locked, phase 0)

|             |                                                                           |
| ----------- | ------------------------------------------------------------------------- |
| Name        | RemoteOK                                                                  |
| Endpoint    | `GET https://remoteok.com/api`                                            |
| Format      | JSON array (index 0 is often legal/metadata, not a job)                   |
| Auth        | None                                                                      |
| Attribution | Credit RemoteOK; keep original job URLs so candidates apply on their site |

**Why this source:** they publish the feed on purpose. We are not logging into anyone's account and not fighting LinkedIn/Indeed/Naukri ToS.

**Plan B:** RemoteOK RSS (`https://remoteok.com/remote-jobs.rss`) if JSON is blocked or changed.

**Plan C:** swap the fetcher to `fetch`/`axios` against the same URL if a headless browser is the thing they block.

## Stack (locked, phase 0)

- MongoDB Atlas, Express, React (Vite), Node.js
- Scraper engine (phase 3+): Puppeteer + puppeteer-extra + stealth
- Scheduler (phase 6): `node-cron` in-process

**Deploy intent (phase 9, not done yet):** API + Chrome on Render/Railway; React on Vercel. Serverless + Puppeteer is a poor fit.

## Architecture (current — phase 1)

```
[Vite :5173]  --proxy /api-->  [Express :5000]  -->  [MongoDB Atlas]
                                      |
                               GET /api/health  (mongo readyState; 503 if down)
```

Locally the browser talks to Vite only. CORS still matters in production when the UI host ≠ API host.

Collections (phase 2): `jobs` (one doc per canonical URL) and `scrapelogs` (one doc per run, including failures). Scraper still lands in phase 3.

## Detection surface (placeholder — filled in phases 3–5)

Even a public JSON URL can rate-limit or fingerprint:

- TLS / HTTP fingerprint of headless Chrome
- User-Agent + header set
- Request volume / interval
- Datacenter IP (Render) vs residential

Mitigations we will implement later: stealth plugin, UA jitter, delay/jitter, stubbed proxy rotation, retries + circuit breaker. We will **not** scrape behind a login.

## Where I stop (ToS)

I will use RemoteOK's public feed and keep outbound links. I will not add LinkedIn/Indeed/Naukri adapters, cookie jars, or login automation — even as a "demo."

## Data model (phase 2)

**Job** — identity is `url` (unique). `contentHash` is SHA-256 of title+company+location+description so a re-scrape can tell "same URL, listing changed" vs "same listing, we just saw it again." `scrapedAt` is _our_ clock; `postedDate` is _theirs_. Empty `location` stays empty — UI will say "Not listed."

**ScrapeLog** — every run writes one row: `success` | `partial` | `failure`, plus `errorType`, `itemsFound`, `durationMs`. An empty payload is `failure` + `empty_payload`, never a quiet success. Optional `detail` is the sentence the dashboard shows.

## Phase log

- **0** — Locked RemoteOK JSON + MERN + Puppeteer-for-pipeline-not-because-HTML-is-required.
- **1** — Repo split, Prettier, ESLint, Atlas connection, `/api/health`.
- **2** — Job + ScrapeLog schemas, unique `url`, `contentHash` helper, index sync on boot.
