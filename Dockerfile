# PM Confessional — single-container build for Google Cloud Run.
#
# Topology: one service. The Express API server (artifacts/api-server) also
# serves the built React SPA (artifacts/pm-confessional) so the frontend's
# relative `/api/...` calls work from one origin — no CORS, no second URL.
#
# Build context = repo root.  Build with Cloud Build / `docker build`:
#   docker build -t pm-confessional .
#
# glibc (bookworm), NOT alpine: pnpm-workspace.yaml excludes rollup's musl
# native binary but keeps linux-x64-gnu, so the Vite build needs glibc.
#
# NOTE: no Dockerfile heredocs — Cloud Build's default docker builder doesn't
# enable BuildKit, so the runtime package.json is a committed file we COPY.

# ---------------------------------------------------------------------------
# Stage 1 — builder: install the whole pnpm workspace, build FE + API.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS builder

# PostHog frontend analytics keys are baked into the SPA at build time.
# Defaults match the values from .replit (publishable phc_ key — safe in client JS).
ARG VITE_POSTHOG_KEY="phc_uJptRPCmQXZrB5tPBUzSLd4gxR5qySJtiC6eYuxyTAQF"
ARG VITE_POSTHOG_HOST="https://us.i.posthog.com"

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /src

# Copy the full workspace (lockfile-driven install needs the manifests; the
# build needs the sources). .dockerignore keeps node_modules / dumps out.
COPY . .

# Frozen install of the entire workspace (dev deps included — needed to build).
RUN pnpm install --frozen-lockfile

# Build the frontend. vite.config.ts *requires* PORT and BASE_PATH to be set
# even for a build, and skips the Replit-only plugins when NODE_ENV=production.
RUN NODE_ENV=production PORT=8080 BASE_PATH=/ \
    VITE_POSTHOG_KEY="${VITE_POSTHOG_KEY}" \
    VITE_POSTHOG_HOST="${VITE_POSTHOG_HOST}" \
    pnpm --filter @workspace/pm-confessional run build

# Build the API server (esbuild → artifacts/api-server/dist/index.mjs).
RUN pnpm --filter @workspace/api-server run build

# ---------------------------------------------------------------------------
# Stage 2 — runtime: minimal image. Bundle has everything inlined except the
# externalized @google/genai, which we install standalone.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# @google/genai is externalized by the esbuild config (@google/*), so the
# bundle imports it as a bare specifier at runtime. Install it standalone from a
# committed package.json (no heredoc — keeps Cloud Build's non-BuildKit docker
# builder happy). Keep the version in sync with artifacts/api-server/package.json.
COPY deploy/runtime-package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Server bundle (index.mjs + pino transport files) and the built SPA.
COPY --from=builder /src/artifacts/api-server/dist ./dist
COPY --from=builder /src/artifacts/pm-confessional/dist/public ./public

# Cloud Run injects PORT (defaults to 8080). The server reads it and refuses to
# start without it, so we provide a sane default for local `docker run` too.
ENV PORT=8080
ENV BASE_PATH=/
ENV PUBLIC_DIR=/app/public
ENV LOG_LEVEL=info

EXPOSE 8080

# Drop root.
USER node

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
