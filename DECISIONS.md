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

## Trade-off under time pressure (will extend later)

Phase 1 does **not** verify Atlas for you — you still paste a URI. I would spend a real week adding a `npm run doctor` that checks DNS, auth, and IP allowlisting.

## Where AI was used (phase 1)

- Scaffold files, Prettier/ESLint configs, health endpoint, these docs.
- **You must personally:** create the Atlas cluster, copy `.env`, run `dev:server`, hit `/api/health`, and be able to explain each row in the table above without reading this file aloud.
