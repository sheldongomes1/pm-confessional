# The PM Confessional

A semantic search app that mines Lenny's podcast archive for hard-won PM mistakes — searchable by the situation you're facing right now.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/pm-confessional run dev` — run the frontend (PORT env set by workflow)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + wouter
- API: Express 5
- DB: PostgreSQL + pgvector 0.8.0 (HNSW cosine index on `vector(768)`)
- AI extraction/audit: Anthropic claude-sonnet-4-6 via Replit AI Integrations proxy
- AI search/coach: Google Gemini (`gemini-embedding-001` for vectors, `gemini-2.5-flash` for rerank + Decision Coach) via direct API key (Replit-managed Gemini does not expose embeddings)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle, externals `@google/*` so `@google/genai` must be a direct dep of `api-server`)

## Where things live

- API spec: `lib/api-spec/openapi.yaml`
- DB schema: `lib/db/src/schema/regrets.ts`
- Backend routes: `artifacts/api-server/src/routes/regrets/` and `artifacts/api-server/src/routes/ingest/`
- Frontend: `artifacts/pm-confessional/src/`
- Anthropic integration: `lib/integrations-anthropic-ai/`
- Gemini integration: `lib/integrations-gemini-direct/` (uses `GEMINI_API_KEY`)
- Generated hooks: `lib/api-client-react/src/generated/api.ts`
- Coach + meta routes: `artifacts/api-server/src/routes/{coach.ts,meta.ts}`
- Decision Coach UI: `artifacts/pm-confessional/src/pages/coach.tsx`
- Methodology / How-it-works pages: `artifacts/pm-confessional/src/pages/{methodology.tsx,how-it-works.tsx}`

## Search & coach pipeline

- Every visible regret is embedded once with `gemini-embedding-001` (768 dims, RETRIEVAL_DOCUMENT) by `scripts/src/embed-regrets.ts` (concurrency=4). Embeddings live in `regrets.embedding vector(768)` with an HNSW cosine index.
- `POST /api/regrets/search`: embed query (RETRIEVAL_QUERY) → cosine top-20 → Gemini Flash rerank with strict 0–10 rubric (JSON mime, temp 0) → top-k. Falls back to vector-only if rerank fails, or to keyword `ilike` if Gemini is unreachable. The response carries `retrieval_mode: "vector_rerank" | "vector_only" | "keyword"`.
- `POST /api/coach/start` creates a `coaching_sessions` row pinned to a set of regret_ids and returns the opening synthesis. `POST /api/coach/:id/reply` appends a user turn and a grounded model turn. The system prompt forbids any claim that isn't backed by `[#regret_id]` citations and refuses to invent regrets.
- `GET /api/methodology` exposes live audit stats; `GET /api/insights/public` returns PostHog totals (or local fallback when PostHog Query API keys aren't configured).

## Architecture decisions

- Ingestion is a 4-phase full-archive scan: (1) `list_content` paginated to enumerate all 298 podcasts, (2) broad `search_content` queries to harvest YouTube source URLs, (3) upsert all episodes into `episodes` table (idempotent on `filename`), (4) `read_content` per episode → 800-word chunks → `batchProcess` (concurrency=5, retries=3) → save regrets with `episode_id` FK and update `scanned_at`
- Resumable: Phase 4 only scans episodes where `scanned_at IS NULL`, so re-running picks up where it left off
- Semantic search is implemented as keyword-based scoring (no vector DB needed for MVP) — embeddings column reserved for future upgrade
- Ingestion runs async in the background; frontend polls `/api/ingest/status` every 3s while running
- MCP at `https://mcp.lennysdata.com/mcp` is tried first; falls back to curated sample episodes if unavailable
- The codegen script patches the generated `api-zod/src/index.ts` post-orval to remove a stale `api.schemas` reference that orval generates but doesn't produce
- Each regret persists `headline_evidence` — a verbatim 8-40 word span from the transcript containing first-person pronouns. The frontend displays this (with `source_quote` fallback) because `source_quote = chunk.slice(0, 500)` is often truncated mid-sentence
- `regrets.audit_verdict` is set by `scripts/src/audit-regrets-deep.ts` for any non-PERSONAL_CONFESSION row (HEADLINE_MISMATCH, AMBIGUOUS, GENERAL_ADVICE, THIRD_PARTY, LENNY_NOT_GUEST). All public-facing API queries filter `audit_verdict IS NULL` so flagged rows are hidden from the UI but preserved in the DB for review. After the May 2026 audit: 701 visible / 75 flagged out of 776
- Extractor prompt is strict: rejects imperatives, requires first-person past-tense ownership, lists explicit red-flag phrases. Audit shows 90% PERSONAL_CONFESSION (was 33% with loose prompt)
- Episode transcripts ARE cached locally in `episodes.markdown` (text column, ~30 MB across 298 episodes). Phase 4 of full ingestion populates it on first scan. `POST /api/ingest/reextract` reuses the cache to re-run the extractor without paying the ~3hr MCP fetch cost; legacy episodes without cached markdown are backfilled from MCP on first re-extract

## Product

- **Homepage**: "What decision are you facing?" search box → semantic (keyword) search of regrets database
- **Browse**: Filter regrets by topic tag (hiring, pricing, product, growth, etc.) and company stage (early/growth/scale)
- **Leaderboard**: Most candid/self-aware guests ranked by regret count
- **Ingest**: Admin page to trigger Claude-powered extraction pipeline from Lenny's archive

## User preferences

- Email: sheldon.gomes@gmail.com
- Lenny's data available via MCP at https://mcp.lennysdata.com/mcp (with fallback to sample data)
- Prefers dark UI, editorial aesthetic

## Gotchas

- After any OpenAPI spec change: run `pnpm --filter @workspace/api-spec run codegen`
- The codegen script uses `touch` + `sed` to fix the orval index.ts — don't manually edit `lib/api-zod/src/index.ts`
- Regret search uses `ilike` keyword matching; for production upgrade add pgvector for real semantic search
- Never use console.log in server code — use `req.log` in handlers, `logger` elsewhere
- MCP `read_content` returns raw markdown (not JSON) — `callMCP()` falls back to returning the inner text string when `JSON.parse` fails
- Source URLs are only available via `search_content`, not `list_content`/`read_content` — episodes without a search hit will have `episode_url = null`
- Stage `unknown` is legacy — new rows use `general`. OpenAPI enum still includes both for back-compat
- The deep audit script (`scripts/src/audit-regrets-deep.ts`) probes with `headline_evidence` (verbatim → guaranteed findable in markdown), not `source_quote` (truncated chunk start). Probing with the wrong field reports inflated MISMATCH rates

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Anthropic integration docs: `.local/skills/ai-integrations-anthropic/SKILL.md`
