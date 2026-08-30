#!/usr/bin/env bash
set -euo pipefail

# Break caught: NAS installations that expose only `docker-compose` cannot run
# either operational database script when `docker compose` is unavailable.
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf -- "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/data"

cat > "$TMP/bin/docker" <<'EOF'
#!/usr/bin/env bash
exit 127
EOF

cat > "$TMP/bin/docker-compose" <<EOF
#!/usr/bin/env bash
printf '%s\\n' "\$*" >> "$TMP/compose.log"
case "\$*" in
  *pg_dump*) printf 'fake postgres dump\\n' ;;
  *psql*) cat >/dev/null ;;
esac
EOF
chmod 700 "$TMP/bin/docker" "$TMP/bin/docker-compose"

PATH="$TMP/bin:$PATH" SEN_CONTRACT_DATA_ROOT="$TMP/data" POSTGRES_USER=sen POSTGRES_DB=sen_contract \
  bash "$ROOT/scripts/backup-db.sh" >/dev/null

BACKUP=$(find "$TMP/data/backups" -name 'db-*.sql.gz' -type f -print -quit)
test -n "$BACKUP"
test "$(gunzip -c "$BACKUP")" = 'fake postgres dump'

PATH="$TMP/bin:$PATH" POSTGRES_USER=sen POSTGRES_DB=sen_contract \
  bash "$ROOT/scripts/restore-db.sh" "$BACKUP" >/dev/null

grep -qx 'exec -T postgres pg_dump -U sen sen_contract' "$TMP/compose.log"
grep -qx 'exec -T postgres psql -U sen -d sen_contract' "$TMP/compose.log"

PREFERRED=$(mktemp -d)
trap 'rm -rf -- "$TMP" "$PREFERRED"' EXIT
mkdir -p "$PREFERRED/bin" "$PREFERRED/data"
cat > "$PREFERRED/bin/docker" <<EOF
#!/usr/bin/env bash
test "\${1:-}" = compose
shift
if test "\${1:-}" = version; then exit 0; fi
printf '%s\\n' "\$*" >> "$PREFERRED/docker.log"
case "\$*" in
  *pg_dump*) printf 'preferred docker compose dump\\n' ;;
  *psql*) cat >/dev/null ;;
esac
EOF
printf '%s\n' '#!/usr/bin/env bash' 'exit 99' > "$PREFERRED/bin/docker-compose"
chmod 700 "$PREFERRED/bin/docker" "$PREFERRED/bin/docker-compose"

PATH="$PREFERRED/bin:$PATH" SEN_CONTRACT_DATA_ROOT="$PREFERRED/data" POSTGRES_USER=sen POSTGRES_DB=sen_contract \
  bash "$ROOT/scripts/backup-db.sh" >/dev/null
PREFERRED_BACKUP=$(find "$PREFERRED/data/backups" -name 'db-*.sql.gz' -type f -print -quit)
test "$(gunzip -c "$PREFERRED_BACKUP")" = 'preferred docker compose dump'
PATH="$PREFERRED/bin:$PATH" POSTGRES_USER=sen POSTGRES_DB=sen_contract \
  bash "$ROOT/scripts/restore-db.sh" "$PREFERRED_BACKUP" >/dev/null
grep -qx 'exec -T postgres pg_dump -U sen sen_contract' "$PREFERRED/docker.log"
grep -qx 'exec -T postgres psql -U sen -d sen_contract' "$PREFERRED/docker.log"
