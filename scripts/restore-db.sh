#!/usr/bin/env bash
# 백업 복구: scripts/restore-db.sh backups/db-xxxx.sql.gz
set -euo pipefail
FILE="${1:?usage: restore-db.sh <file.sql.gz>}"
: "${POSTGRES_USER:=sen}"
: "${POSTGRES_DB:=sen_contract}"
gunzip -c "$FILE" | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "restore done from $FILE"
