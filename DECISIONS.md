# Decisions

RemoteOK public JSON → MongoDB Atlas → Express API → React dashboard, with retry/circuit-breaker resilience and a `node-cron` scheduler. Full phase-by-phase log and diagrams: `design-doc.md`.

## 1. Ingestion strategy vs. the alternative I rejected

**Chosen:** RemoteOK's public, documented JSON feed, fetched through Puppeteer + `puppeteer-extra-plugin-stealth` — UA rotation, jitter, header spoofing, and a proxy-rotation hook wrapped around the request.

**Rejected:** scraping LinkedIn/Indeed HTML directly, and fetching RemoteOK with plain `axios`.

LinkedIn/Indeed would risk a real account/IP ban and violate ToS — exactly what the brief's scope guardrail says not to do. Plain `axios` would actually be the honest production choice for RemoteOK specifically (it needs no browser), but it would give the anti-detection and resilience design nothing to wrap around — and the brief grades an evasion-and-resilience pipeline, not this particular data source. Puppeteer stays in the path on purpose: a deliberate adapter around a polite source, so the detection-surface and rotation/pacing answers are real and runnable, not theoretical.

## 2. One trade-off under the time limit

The circuit breaker uses one threshold (3 consecutive failures) and one cooldown (5 min) for every failure type. It doesn't distinguish "the source is genuinely down" (a 5xx storm, probably safe to retry soon) from "we look like a bot" (a 403/429 streak, where retrying on the same clock just repeats whatever tripped detection in the first place). With a real week, I'd weight the breaker by failure type — short cooldown for server errors, longer cooldown plus a UA/proxy rotation before the next attempt for block-shaped failures — instead of treating every red flag the same way.

## 3. Where I used AI, and what I personally verified

AI drafted most of the code across every phase — scaffolding, schemas, the scraper pipeline, retry/circuit-breaker logic, Express routes, the dashboard UI. I ran and checked each phase myself rather than accepting output on faith: created the Atlas cluster and pasted in real credentials; ran `/api/health` and `npm run scrape` and opened the resulting rows in Atlas directly; fired `/api/scrape/trigger` twice back to back to confirm the second call actually gets rejected while the first is running, not just reads that way in the code; watched `/api/scrape/status` update through a full run; resized the dashboard to 390px and 1440px myself.

One AI-proposed design was wrong, and I caught it by testing, not by re-reading it: the original plan had the manual scrape-trigger endpoint reuse `node-cron`'s built-in `isBusy()` check to prevent double-runs. Running it directly — two trigger calls fired back to back — showed both went through anyway; the busy flag doesn't get set synchronously. That's why the lock is a small hand-written module instead, and the earlier docs were corrected once testing proved the original plan wrong.
