# ─────────────────────────────────────────────────────────────
# Stage 1: Base
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ─────────────────────────────────────────────────────────────
# Stage 2: Dependencies (incluye devDependencies para el build)
# ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/worker/package*.json ./apps/worker/
COPY packages/database/package*.json ./packages/database/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci --include=dev

# ─────────────────────────────────────────────────────────────
# Stage 3: Development (con hot reload)
# ─────────────────────────────────────────────────────────────
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN npm run db:generate --workspace=@vspro/database
EXPOSE 3001
CMD ["npm", "run", "dev", "--workspace=@vspro/api"]

# ─────────────────────────────────────────────────────────────
# Stage 4: Builder
# ─────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN npm run db:generate --workspace=@vspro/database
RUN npm run build --workspace=@vspro/api

# ─────────────────────────────────────────────────────────────
# Stage 5: Production (imagen mínima)
# ─────────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production

# Usuario no-root por seguridad
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/prisma ./prisma

USER nestjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/apps/api/src/main.js"]
