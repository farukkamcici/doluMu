# DoluMu API (FastAPI). Code and small data ship in the image; the large model artifacts
# (models/, data/processed/) are mounted read-only at runtime, see docker-compose.dokploy.yml.
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# libgomp1: OpenMP runtime for LightGBM
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements-api.txt constraints-api.txt ./
RUN pip install --upgrade pip && pip install -r requirements-api.txt -c constraints-api.txt

COPY src ./src
COPY config ./config
# Topology, Marmaray timetable and the other static transit snapshots the API reads.
COPY frontend/public/data ./frontend/public/data

RUN useradd --create-home --uid 1000 app
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/', timeout=4)"

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
