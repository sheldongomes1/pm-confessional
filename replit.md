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
- DB: PostgreSQL + Drizzle ORM
- AI: Anthropic claude-sonnet-4-6 via Replit AI Integrations proxy
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- API spec: `lib/api-spec/openapi.yaml`
- DB schema: `lib/db/src/schema/regrets.ts`
- Backend routes: `artifacts/api-server/src/routes/regrets/` and `artifacts/api-server/src/routes/ingest/`
- Frontend: `artifacts/pm-confessional/src/`
- Anthropic integration: `lib/integrations-anthropic-ai/`
- Generated hooks: `lib/api-client-react/src/generated/api.ts`

## Architecture decisions

- Ingestion is a 4-phase full-archive scan: (1) `list_content` paginated to enumerate all 298 podcasts, (2) broad `search_content` queries to harvest YouTube source URLs, (3) upsert all episodes into `episodes` table (idempotent on `filename`), (4) `read_content` per episode → 800-word chunks → `batchProcess` (concurrency=5, retries=3) → save regrets with `episode_id` FK and update `scanned_at`
- Resumable: Phase 4 only scans episodes where `scanned_at IS NULL`, so re-running picks up where it left off
- Semantic search is implemented as keyword-based scoring (no vector DB needed for MVP) — embeddings column reserved for future upgrade
- Ingestion runs async in the background; frontend polls `/api/ingest/status` every 3s while running
- MCP at `https://mcp.lennysdata.com/mcp` is tried first; falls back to curated sample episodes if unavailable
- The codegen script patches the generated `api-zod/src/index.ts` post-orval to remove a stale `api.schemas` reference that orval generates but doesn't produce

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

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Anthropic integration docs: `.local/skills/ai-integrations-anthropic/SKILL.md`
