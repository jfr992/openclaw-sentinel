# =============================================================================
# MoltBot Guardian - Multi-stage Secure Build
# =============================================================================

# --- Stage 1: Build frontend ---
FROM node:20-alpine AS frontend
WORKDIR /build
COPY dashboard-ui/package*.json ./
RUN npm ci --silent
COPY dashboard-ui/ ./
RUN npm run build

# --- Stage 2: Python runtime ---
FROM python:3.11-slim AS runtime

# Install lsof for network monitoring (needed for full visibility)
RUN apt-get update && \
    apt-get install -y --no-install-recommends lsof procps && \
    rm -rf /var/lib/apt/lists/*

# Security: non-root user with writable home
RUN groupadd -r moltbot && \
    useradd -r -g moltbot -d /home/moltbot -m moltbot && \
    mkdir -p /home/moltbot/.moltbot && \
    chown -R moltbot:moltbot /home/moltbot

WORKDIR /app

# Install deps first (cache layer)
COPY dashboard/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    rm -rf /root/.cache/pip

# Copy app
COPY --chown=moltbot:moltbot dashboard/ ./dashboard/
COPY --chown=moltbot:moltbot --from=frontend /build/dist/ ./dashboard/static/

# Security hardening - readable by moltbot user
RUN chown -R moltbot:moltbot /app

# Environment
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MOLTBOT_HOST=0.0.0.0 \
    MOLTBOT_PORT=5050 \
    CLAWDBOT_DIR=/data

EXPOSE 5050

# Switch to non-root
USER moltbot
WORKDIR /app/dashboard

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5050/api/health')" || exit 1

CMD ["python", "app.py"]
