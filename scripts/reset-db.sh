#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="findash-postgres"
VOLUME_NAME="findash-pgdata"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[db:reset]${NC} $1"; }
warn() { echo -e "${YELLOW}[db:reset]${NC} $1"; }
err()  { echo -e "${RED}[db:reset]${NC} $1"; }

# Confirm
echo ""
warn "This will destroy the local database and recreate it from scratch."
read -p "Are you sure? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  log "Aborted."
  exit 0
fi

# Stop and remove container
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  log "Stopping and removing container '${CONTAINER_NAME}'..."
  docker stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  docker rm "${CONTAINER_NAME}" >/dev/null 2>&1 || true
else
  log "No container to remove."
fi

# Remove volume
if docker volume ls --format '{{.Name}}' | grep -q "^${VOLUME_NAME}$"; then
  log "Removing volume '${VOLUME_NAME}'..."
  docker volume rm "${VOLUME_NAME}" >/dev/null 2>&1 || true
else
  log "No volume to remove."
fi

log "Done. Run 'npm run dev' to recreate the database and apply migrations."
