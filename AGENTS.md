# AGENTS.md

Media stream aggregator + [OMSS](https://github.com/omss-spec/omss-spec) API server for Ukrainian online cinemas. TypeScript/Hono backend, React/Vite frontend in the `web/` npm workspace.

## Commands

- `npm install` — root install also installs `web/` (npm workspaces).
- `npm run dev` — backend only, `tsx watch` on :3000; requires `.env` (copy `.env.example`). README claims this runs the web app too; it does not.
- `npm --prefix web run dev` — Vite frontend dev server. Needs `web/.env` with `VITE_API_BASE_URL` (defaults to `/api`, same-origin, which only works against a built server).
- `npm run build:all` — `tsc` to `dist/` then Vite build to `web/dist/`. Fastest full typecheck; backend has no separate lint or typecheck script.
- `npm start` — `node dist/api/server.js` (serves `web/dist` if present).
- `npm --prefix web run lint` — only linting in the repo.
- `npx tsx scripts/generate-badges.ts` — regenerate `public/logos/*.svg`; not wired to an npm script.
- No test suite. `npm run test` is bare `tsx` (REPL), not tests.

## Toolchain gotchas

- tsconfig uses `module: NodeNext`: relative imports must keep the `.js` extension even though sources are `.ts` (e.g. `import { x } from './foo.js'`).
- `web/` is plain JS/JSX (no TS), built separately by `build:web`.
- `better-sqlite3` is native; Docker builds run `python3 make g++` for it.
- Only `npm run dev` loads `.env` via `--env-file`; other scripts rely on `dotenv/config` imported by `src/api/server.ts` or the ambient environment.
- Commit style is Conventional Commits with scopes (`feat(web):`, `fix(stream):`).

## Architecture

`src/api/server.ts` is the entrypoint; it mounts each router twice, at `/` and `/api` (so both `/home` and `/api/home` work):

- `src/api/catalog/routes.ts` — TMDB-backed catalog (`/home`, `/search`, `/details`, `/season`) plus `/segments` (TheIntroDB/AniSkip) and `/comments` (scraped).
- `src/api/omss/routes.ts` — OMSS endpoints (`/v1/movies/:id`, `/v1/tv/:id/seasons/:s/episodes/:e`, `POST /v1/refresh/:id`). `?sse=1` or `Accept: text/event-stream` streams per-provider results.
- `src/api/stream/master.ts` — HLS proxy. `/master.m3u8` resolves lazy sources via VOD extractors, fetches the target CDN manifest with per-CDN `Origin`/`Referer` headers, and rewrites playlist/segment URLs; `/subs.m3u8` and `/subs.vtt` proxy subtitles.

Metadata: `src/api/services/tmdb.ts` uses `TMDB_TOKEN` when set, otherwise falls back to the local uakino SQLite catalog. Caches are in-memory `MemoryCache` instances (`src/api/services/cache.ts`), lost on restart.

### Adding a provider or VOD extractor

- Provider: `src/providers/<name>/{main,search,get}.ts` implementing `Provider` (`search` + `get`). Must be exported and added to the `providers[]` array in `src/providers/index.ts`. `OrchestratorService` runs all providers in parallel, dedupes by detected CDN (first provider wins a CDN), and rewrites URLs to the local proxy for `platform=web`.
- VOD extractor: `src/vods/<name>/main.ts` implementing `VodExtractor.extract()`. Register in `src/vods/index.ts` exports and `vodExtractors[]`, and add a URL-detection branch in `extractVod()` (a `cdn=` query param short-circuits directly to the matching extractor). CDNs needing special request headers also need a branch in `src/api/stream/master.ts`.

### Runtime data

- `cache/*.db` (gitignored, WAL) are built on demand with 24h TTL: uakino syncs from `api.uakino.app` using mutual-TLS certs in `certs/uakino/` (committed); kinoukr syncs from a GitHub raw JSON.
- `certs/uakino/cert.pem` + `cert.key` are required — without them the uakino provider and the TMDB local fallback fail.
- Docker mounts `./cache` as a volume; the image `chmod 777`es it.

## Frontend gotchas

- React Router uses real paths (`/search`, `/details/:type/:id`, ...) that collide with backend catalog routes. `src/api/server.ts` has a path allowlist in the SPA fallback so backend-owned paths are not shadowed; a new client route that must survive a hard refresh needs to be added there.
- API client base is `import.meta.env.VITE_API_BASE_URL || '/api'` (`web/src/api/axios.js`).
