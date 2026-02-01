# =============================================================================
# OpenClaw Sentinel - Secure Multi-Stage Dockerfile
# =============================================================================
# Security features:
# - Multi-stage build (minimal final image)
# - Distroless-style minimal runtime
# - Non-root user with minimal permissions
# - Read-only filesystem support
# - No shell in final image
# - Pinned base image versions
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:22.13-alpine3.21 AS deps

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install dependencies only (better caching)
COPY package*.json ./
COPY server/package*.json ./server/

# Install all dependencies (build native modules)
RUN npm ci && \
    cd server && npm ci

# -----------------------------------------------------------------------------
# Stage 2: Builder
# -----------------------------------------------------------------------------
FROM node:22.13-alpine3.21 AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules

# Copy source (including pre-built dist/)
COPY . .

# Build frontend (skip if dist/ already exists from host)
RUN if [ ! -f dist/index.html ]; then npm run build; fi

# Prune dev dependencies
RUN npm prune --omit=dev && \
    cd server && npm prune --omit=dev

# Remove unnecessary files
RUN rm -rf src/ .git/ .github/ tests/ scripts/ \
    *.md *.config.js .eslintrc* .prettier* \
    .env* Makefile .dagger/ otel/

# -----------------------------------------------------------------------------
# Stage 3: Production Runtime
# -----------------------------------------------------------------------------
FROM node:22.13-alpine3.21 AS production

# Security: Don't run as root
RUN addgroup -g 65532 -S sentinel && \
    adduser -u 65532 -S sentinel -G sentinel -h /app -s /sbin/nologin

WORKDIR /app

# Copy only production artifacts
COPY --from=builder --chown=sentinel:sentinel /app/dist ./dist
COPY --from=builder --chown=sentinel:sentinel /app/server ./server
COPY --from=builder --chown=sentinel:sentinel /app/node_modules ./node_modules
COPY --from=builder --chown=sentinel:sentinel /app/package.json ./

# Create data directory for baseline storage
RUN mkdir -p /app/data && chown sentinel:sentinel /app/data

# Add runtime dependencies (wget for healthcheck, sqlite for memory reading)
RUN apk --no-cache add wget sqlite && \
    rm -rf /var/cache/apk/* /tmp/* /root/.npm /root/.node-gyp

# Switch to non-root user
USER sentinel

# Environment
ENV NODE_ENV=production \
    PORT=5056 \
    # Docker needs 0.0.0.0 for port mapping; native installs default to 127.0.0.1
    BIND_ADDRESS=0.0.0.0 \
    # Security: Disable npm update checks
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    # Security: Don't allow changing user at runtime
    npm_config_unsafe_perm=false

# Expose port
EXPOSE 5056

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT}/api/health || exit 1

# Security labels
LABEL org.opencontainers.image.title="OpenClaw Sentinel" \
      org.opencontainers.image.description="Security monitoring for AI agents" \
      org.opencontainers.image.vendor="OpenClaw" \
      org.opencontainers.image.source="https://github.com/jfr992/openclaw-sentinel" \
      org.opencontainers.image.licenses="MIT" \
      security.privileged="false" \
      security.capabilities.drop="ALL"

# Run
CMD ["node", "server/src/index.js"]

# -----------------------------------------------------------------------------
# Stage 4: Distroless (Optional - even smaller, no shell)
# -----------------------------------------------------------------------------
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS distroless

WORKDIR /app

# Copy from builder
COPY --from=builder --chown=65532:65532 /app/dist ./dist
COPY --from=builder --chown=65532:65532 /app/server ./server
COPY --from=builder --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=builder --chown=65532:65532 /app/package.json ./

ENV NODE_ENV=production \
    PORT=5056 \
    BIND_ADDRESS=0.0.0.0

EXPOSE 5056

# No shell, no wget - healthcheck via orchestrator
USER 65532

CMD ["server/src/index.js"]
