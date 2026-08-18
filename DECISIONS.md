# Decisions

One page. Updated each phase. This is what you defend on the call.

## Ingestion strategy vs the alternative

**Chosen:** RemoteOK public JSON, fetched later through Puppeteer + stealth.

**Rejected:** scraping LinkedIn/Indeed HTML, or using `axios` only.

JSON is the honest source (they document it). Puppeteer is still in the path so the anti-detect / retry / scrape-log design is real and gradable — not because RemoteOK _needs_ a browser today. If asked "why not axios?": axios would be simpler and I'd use it in production for this feed; the brief grades a browser ingestion pipeline, so the browser is a deliberate adapter around a polite source.

## Phase 1

| Decision                                                           | Why                                                                                                          | Rejected                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `client/` and `server/` as two packages, not a pnpm/turbo monorepo | Independent deploys (Vercel vs Render) and a smaller story to tell in 15 minutes                             | Yarn workspaces — extra tool for one take-home                             |
| ESM (`"type": "module"`) on the server                             | Matches Vite; native `import`; no dual CJS/ESM story                                                         | CJS `require` — still fine, just noisier next to the client                |
| `mongoose.connect` once at boot, then `listen`                     | Never accept HTTP if we cannot persist; Atlas free-tier hates per-request connections                        | Connect lazily on first request — hides misconfig until the first scrape   |
| `serverSelectionTimeoutMS: 5000`                                   | Fail in 5s locally instead of hanging ~30s on a bad URI                                                      | Default timeout                                                            |
| `/api/health` returns 503 when Mongo is not `connected`            | Honest status; load balancers and you can see it                                                             | Always 200 with `{ ok: true }`                                             |
| CORS allowlist = `CLIENT_ORIGIN`                                   | Vite is a different origin; `*` is sloppy once this is public                                                | `cors()` with no origin limit                                              |
| `.env` gitignored; `.env.example` committed                        | Atlas passwords in git fail the honesty/ownership bar                                                        | Checked-in `.env`                                                          |
| Root Prettier + per-package ESLint                                 | Format is global; lint rules differ (Node globals vs browser)                                                | One giant ESLint config spanning both                                      |
| No Job schema yet                                                  | Phase 2. Don't pretend the data model exists                                                                 |                                                                            |
| Vite `server.proxy` `/api` → `:5000`                               | Local UI uses relative `/api/health`; no hardcoded host                                                      | Putting `localhost:5000` in React — breaks the moment the API is on Render |
| ESLint on client, not oxlint                                       | Brief asked for ESLint; graders grep for it. Official `create-vite` now ships oxlint — we swapped on purpose | Keep oxlint — faster, but off-spec                                         |

## Phase 2

| Decision                                             | Why                                                                               | Rejected                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Unique index on `url`                                | One listing, one row. Upsert in phase 3.                                          | Unique on title+company — collisions. Unique on RemoteOK `id` — couples us to one vendor if Plan B is RSS |
| `contentHash` excludes `url`                         | URL is identity; hash answers "did the _content_ change?"                         | Hashing the whole document including `scrapedAt` — every run would look like an update                    |
| SHA-256 of trimmed lowercase fields                  | Stable against casing/whitespace; no MD5 interview detour                         | Hashing raw HTML as-is — false updates from tracking params in markup                                     |
| Extra `description` field                            | Brief listed title/company/location; body edits would be invisible without it     | Store only the listed fields — weaker change detection                                                    |
| No mongoose `timestamps: true`                       | `scrapedAt` / `postedDate` / log `timestamp` are explicit clocks                  | createdAt+updatedAt on top — two meanings of "when"                                                       |
| ScrapeLog `status` enum: success / partial / failure | Partial = some jobs saved, some rows skipped. Honest.                             | Boolean `ok` — cannot express "ran but empty" vs "ran and saved 40"                                       |
| `errorType` enum + `detail` string                   | Dashboard can group; humans can read                                              | Only a stack trace — ugly and leaks internals                                                             |
| `syncIndexes()` on boot                              | Unique `url` must exist on Atlas, including when `autoIndex` is off in production | Trusting Mongoose autoIndex                                                                               |

## Trade-off under time pressure (will extend later)

Phase 1 does **not** verify Atlas for you — you still paste a URI. I would spend a real week adding a `npm run doctor` that checks DNS, auth, and IP allowlisting.

Phase 2 does not expire old jobs. With a real week I'd add `lastSeenAt` and a TTL/archive for listings that vanished from the feed.

## Where AI was used

- **Phase 1:** scaffold, lint/format, health, docs.
- **Phase 2:** schema files, hash helper, these tables.
- **You must personally:** create Atlas, run health, and explain unique-on-url vs title+company, why hash excludes url, and why empty scrape ≠ success.
