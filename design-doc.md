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

## Architecture (current — phase 4)

```
                    npm run scrape (CLI)
                              |
[Vite :5173] --proxy /api--> [Express :5000] --> [MongoDB Atlas]
                              |                        ^
                     GET /api/health                   |
                              |     jitter → stealth Chrome (+ optional proxy)
                              |     UA + headers → GET remoteok.com/api
                              |     normalize → bulkWrite upsert on url
```

Trigger HTTP endpoint is phase 7. ScrapeLog writes are phase 5.

## Detection surface (phase 4)

What gives an automated client away, and what we account for:

| Signal | Accounted for? |
| --- | --- |
| `navigator.webdriver` / common headless leaks | Yes — `puppeteer-extra-plugin-stealth` |
| Default Puppeteer user-agent | Yes — pick from a short current Chrome desktop list, one UA per run |
| Missing `Accept-Language` / `Referer` | Yes — `setExtraHTTPHeaders`. We do **not** override `Accept-Encoding` (Chromium owns that; faking it is itself a tell) |
| Perfectly even request timing | Yes — random sleep 800–2500ms (env) before `goto` |
| Datacenter IP | Stub only — `PROXY_URLS` round-robin into `--proxy-server` when set. Empty list = your real IP (honest local demo) |
| TLS / Chrome version mismatch | Partial — we use Puppeteer's bundled Chrome (`npx puppeteer browsers install chrome` if missing) |
| Behavioral / login / cookies | Out of scope — we do not log in |

**Mid-run block:** RemoteOK is **one GET**. A 403/429 fails the whole run (no upsert of a partial HTML crawl). On a paginated HTML board the same pattern would: stop remaining pages, keep jobs already saved, log `blocked`. Retries + circuit breaker are phase 5.

**Hostile-target upgrade we are not building:** paid residential proxies, sticky sessions, `page.authenticate` against a vendor, CAPTCHA farms, cookie jars. `PROXY_URLS` exists so the *rotation hook* is real and explainable.

## Ingestion strategy (phase 3–4)

One GET of the full JSON batch per run (RemoteOK is not paginated like a search UI). Skip the legal/metadata row and any item missing title, company, or http(s) URL. Strip HTML in descriptions, cap at 10k chars. Upsert with `bulkWrite` keyed on `url`. `scrapedAt` updates every time we see the listing. Pacing/UA/headers wrap that single GET so the same helpers can sit between pages later.

## Where I stop (ToS)

I will use RemoteOK's public feed and keep outbound links. I will not add LinkedIn/Indeed/Naukri adapters, cookie jars, or login automation — even as a "demo."

## Data model (phase 2)

**Job** — identity is `url` (unique). `contentHash` is SHA-256 of title+company+location+description so a re-scrape can tell "same URL, listing changed" vs "same listing, we just saw it again." `scrapedAt` is _our_ clock; `postedDate` is _theirs_. Empty `location` stays empty — UI will say "Not listed."

**ScrapeLog** — every run writes one row: `success` | `partial` | `failure`, plus `errorType`, `itemsFound`, `durationMs`. An empty payload is `failure` + `empty_payload`, never a quiet success. Optional `detail` is the sentence the dashboard shows.

## Phase log

- **0** — Locked RemoteOK JSON + MERN + Puppeteer-for-pipeline-not-because-HTML-is-required.
- **1** — Repo split, Prettier, ESLint, Atlas connection, `/api/health`.
- **3** — Puppeteer + stealth, RemoteOK JSON, normalize, upsert on `url` (`npm run scrape`).
- **4** — Randomized Chrome UA, jitter before goto, extra headers, stub `PROXY_URLS` round-robin.
