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
COPY . .
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
RUN npm run db:generate --workspace=@vspro/database
# Override nest-cli.json to use tsc instead of swc (avoids SWC resolution issues in Docker)
RUN echo '{"collection":"@nestjs/schematics","sourceRoot":"src","compilerOptions":{"builder":"tsc","typeCheck":true}}' > apps/api/nest-cli.json
RUN npm run build --workspace=@vspro/api
# Resolve path aliases (@vspro/database, @vspro/shared) to relative paths in compiled output
RUN npx tsc-alias -p apps/api/tsconfig.json --outDir apps/api/dist

# ─────────────────────────────────────────────────────────────
# Stage 5: Production (imagen mínima)
# ─────────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production

# Usuario no-root por seguridad
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy the compiled API
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./dist
# Copy all node_modules (includes workspace symlinks)
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
# Copy workspace packages (database + shared) so symlinks resolve
COPY --from=builder --chown=nestjs:nodejs /app/packages ./packages
# Copy Prisma schema for migrations
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/prisma ./prisma
# Copy prisma assets to dist path (tsc-alias resolves paths relative to dist)
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/prisma ./dist/packages/database/prisma

USER nestjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/apps/api/src/main.js"]
