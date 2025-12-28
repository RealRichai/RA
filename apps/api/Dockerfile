# RealRiches API Dockerfile
# Multi-stage build for optimized production image

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml* ./
COPY turbo.json ./

# Copy package files for all workspaces
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/
COPY packages/sdk/package.json ./packages/sdk/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/sdk/node_modules ./packages/sdk/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

# Copy source files
COPY . .

# Generate Prisma client
RUN cd apps/api && npx prisma generate

# Build packages and API
RUN pnpm turbo build --filter=@realriches/api

# ============================================
# Stage 3: Production
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# Security: Run as non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 realriches
USER realriches

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Copy necessary files
COPY --from=builder --chown=realriches:nodejs /app/package.json ./
COPY --from=builder --chown=realriches:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=realriches:nodejs /app/packages ./packages
COPY --from=builder --chown=realriches:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=realriches:nodejs /app/apps/api/package.json ./apps/api/
COPY --from=builder --chown=realriches:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=realriches:nodejs /app/apps/api/prisma ./apps/api/prisma

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start command
CMD ["node", "apps/api/dist/index.js"]
