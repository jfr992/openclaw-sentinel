# MoltBot Security Dashboard
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY dashboard/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY dashboard/ ./dashboard/
COPY dashboard-ui/dist/ ./dashboard/static/

# Environment
ENV MOLTBOT_HOST=127.0.0.1
ENV MOLTBOT_PORT=5050
ENV CLAWDBOT_DIR=/data

EXPOSE 5050

WORKDIR /app/dashboard
CMD ["python", "app.py"]
