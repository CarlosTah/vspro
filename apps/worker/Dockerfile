# ─────────────────────────────────────────────────────────────
# VSPRO Worker — Background Job Processor
# ─────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# Dependencies
FROM base AS deps
COPY package*.json ./
COPY apps/worker/package*.json ./apps/worker/
COPY packages/database/package*.json ./packages/database/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci

# Development (with hot reload via swc-node)
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate --workspace=@vspro/database
CMD ["node", "--require", "@swc-node/register", "apps/worker/src/main.ts"]

# Production
FROM base AS production
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate --workspace=@vspro/database
USER worker
CMD ["node", "--require", "@swc-node/register", "apps/worker/src/main.ts"]
