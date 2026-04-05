#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${DB_NAME:-findash}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
DB_PORT="${DB_PORT:-5433}"
CONTAINER_NAME="findash-postgres"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[db]${NC} $1"; }
warn() { echo -e "${YELLOW}[db]${NC} $1"; }
err()  { echo -e "${RED}[db]${NC} $1"; }

# Check for Docker
if ! command -v docker &>/dev/null; then
  err "Docker is not installed or not in PATH."
  exit 1
fi

# If container already exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    log "Container '${CONTAINER_NAME}' is already running on port ${DB_PORT}."
  else
    log "Starting existing container '${CONTAINER_NAME}'..."
    docker start "${CONTAINER_NAME}"
    log "Container started on port ${DB_PORT}."
  fi
else
  log "Creating PostgreSQL container '${CONTAINER_NAME}'..."
  docker run -d \
    --name "${CONTAINER_NAME}" \
    -e POSTGRES_DB="${DB_NAME}" \
    -e POSTGRES_USER="${DB_USER}" \
    -e POSTGRES_PASSWORD="${DB_PASSWORD}" \
    -p "${DB_PORT}:5432" \
    -v findash-pgdata:/var/lib/postgresql/data \
    postgres:16-alpine

  log "Waiting for PostgreSQL to be ready..."
  until docker exec "${CONTAINER_NAME}" pg_isready -U "${DB_USER}" &>/dev/null; do
    sleep 1
  done
  log "PostgreSQL is ready."
fi

# ── Connection check ─────────────────────────────────────────────────────────
log "Verifying database connection..."

MAX_RETRIES=10
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
  if docker exec "${CONTAINER_NAME}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" &>/dev/null; then
    # Run a real SQL query to confirm full connectivity
    RESULT=$(docker exec "${CONTAINER_NAME}" \
      psql -U "${DB_USER}" -d "${DB_NAME}" -tAc "SELECT 'ok'" 2>&1) || true
    if [ "$RESULT" = "ok" ]; then
      log "Connection verified  ──  ${DB_USER}@localhost:${DB_PORT}/${DB_NAME}"
      break
    fi
  fi
  RETRY=$((RETRY + 1))
  if [ $RETRY -eq $MAX_RETRIES ]; then
    err "Could not connect to database after ${MAX_RETRIES} attempts."
    exit 1
  fi
  warn "Waiting for database to accept connections... (${RETRY}/${MAX_RETRIES})"
  sleep 1
done

# ── Summary ──────────────────────────────────────────────────────────────────
TABLE_COUNT=$(docker exec "${CONTAINER_NAME}" \
  psql -U "${DB_USER}" -d "${DB_NAME}" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null || echo "?")

echo ""
log "┌──────────────────────────────────────┐"
log "│  PostgreSQL ${DB_NAME}               "
log "│  Host:     localhost:${DB_PORT}       "
log "│  User:     ${DB_USER}                 "
log "│  Tables:   ${TABLE_COUNT}             "
log "└──────────────────────────────────────┘"
