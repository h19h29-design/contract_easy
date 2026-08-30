#!/usr/bin/env bash
# PostgreSQL 백업 → $SEN_CONTRACT_DATA_ROOT/backups (NAS 볼륨 권장)
set -euo pipefail

compose() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "Docker Compose가 필요합니다." >&2
    return 127
  fi
}

: "${SEN_CONTRACT_DATA_ROOT:=./data}"
: "${POSTGRES_USER:=sen}"
: "${POSTGRES_DB:=sen_contract}"
STAMP=$(date +%Y%m%d-%H%M%S)
DIR="${SEN_CONTRACT_DATA_ROOT}/backups"
mkdir -p "$DIR"
compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "${DIR}/db-${STAMP}.sql.gz"
echo "backup written: ${DIR}/db-${STAMP}.sql.gz"
