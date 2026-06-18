# ─────────────────────────────────────────────────────────────
# VSPRO Worker — Background Job Processor
# ─────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# Dependencies (include dev for build tools)
FROM base AS deps
COPY package*.json ./
COPY apps/worker/package*.json ./apps/worker/
COPY packages/database/package*.json ./packages/database/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci --include=dev

# Development (with hot reload via swc-node)
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate --workspace=@vspro/database
CMD ["node", "--require", "@swc-node/register", "apps/worker/src/main.ts"]

# Builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
RUN npm run db:generate --workspace=@vspro/database
# Build with tsc (override nest-cli to avoid SWC issues)
RUN echo '{"collection":"@nestjs/schematics","sourceRoot":"src","compilerOptions":{"builder":"tsc","typeCheck":true}}' > apps/worker/nest-cli.json
RUN npm run build --workspace=@vspro/worker
# Resolve path aliases
RUN npx tsc-alias -p apps/worker/tsconfig.json --outDir apps/worker/dist

# Production
FROM base AS production
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

COPY --from=builder --chown=worker:nodejs /app/apps/worker/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/packages ./packages
COPY --from=builder --chown=worker:nodejs /app/packages/database/prisma ./prisma

USER worker

CMD ["node", "dist/apps/worker/src/main.js"]
