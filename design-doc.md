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

The scraper process does not exist yet. Health is the only API so we can prove env + Atlas before writing schemas.

## Detection surface (placeholder — filled in phases 3–5)

Even a public JSON URL can rate-limit or fingerprint:

- TLS / HTTP fingerprint of headless Chrome
- User-Agent + header set
- Request volume / interval
- Datacenter IP (Render) vs residential

Mitigations we will implement later: stealth plugin, UA jitter, delay/jitter, stubbed proxy rotation, retries + circuit breaker. We will **not** scrape behind a login.

## Where I stop (ToS)

I will use RemoteOK's public feed and keep outbound links. I will not add LinkedIn/Indeed/Naukri adapters, cookie jars, or login automation — even as a "demo."

## Phase log

- **0** — Locked RemoteOK JSON + MERN + Puppeteer-for-pipeline-not-because-HTML-is-required.
- **1** — Repo split, Prettier, ESLint, Atlas connection, `/api/health`.
