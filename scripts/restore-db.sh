#!/usr/bin/env bash
# 백업 복구: scripts/restore-db.sh backups/db-xxxx.sql.gz
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

FILE="${1:?usage: restore-db.sh <file.sql.gz>}"
: "${POSTGRES_USER:=sen}"
: "${POSTGRES_DB:=sen_contract}"
gunzip -c "$FILE" | compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "restore done from $FILE"
