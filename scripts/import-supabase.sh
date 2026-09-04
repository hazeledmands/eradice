#!/usr/bin/env bash
#
# One-shot import of the Supabase dataset into a migrated eradice database.
#
#   scripts/import-supabase.sh <source-url> <target-url> [--claim UUID=SUB]...
#
# Source is the Supabase connection string; target is the CNPG database with
# `node scripts/migrate.js` already applied. The script is idempotent only in
# the sense that it refuses to run twice: it requires the target's tables to be
# empty, so a retry means dropping and re-migrating the target first.
#
# Each --claim remaps one Supabase auth UUID onto a Cloudflare Access subject,
# so rolls and comments made under anonymous auth stay editable by their owner.
# Rows left unclaimed keep their UUID as historical provenance and match no
# Access subject, which makes them permanently read-only. Rows that predate
# Supabase auth entirely have a NULL owner and stay editable by everyone, which
# is what they were before.
#
# Everything here is exercised by a rehearsal against a replica of the Supabase
# schema; see README "Migrating from Supabase".

set -euo pipefail

TABLES=(public.rooms public.room_rolls public.roll_comments)

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
note() { printf '  %s\n' "$*"; }

[ $# -ge 2 ] || die "usage: $0 <source-url> <target-url> [--claim UUID=SUB]..."
SOURCE_URL=$1; TARGET_URL=$2; shift 2

CLAIMS=()
while [ $# -gt 0 ]; do
  case $1 in
    --claim) [ $# -ge 2 ] || die "--claim needs UUID=SUB"; CLAIMS+=("$2"); shift 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done

command -v pg_dump >/dev/null || die "pg_dump not found"
command -v psql    >/dev/null || die "psql not found"

WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT

echo "==> Preflight"

# pg_dump must be at least as new as the server it reads, or it refuses.
src_major=$(psql "$SOURCE_URL" -tAX -c "SHOW server_version_num" | cut -c1-2)
tgt_major=$(psql "$TARGET_URL" -tAX -c "SHOW server_version_num" | cut -c1-2)
dump_major=$(pg_dump --version | grep -oE '[0-9]+' | head -1)
note "source PostgreSQL $src_major, target $tgt_major, pg_dump $dump_major"
[ "$dump_major" -ge "$src_major" ] || die "pg_dump $dump_major is older than the source server $src_major"

# The target must already have the eradice schema, or COPY has nothing to fill.
applied=$(psql "$TARGET_URL" -tAX -c \
  "SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN ('rooms','room_rolls','roll_comments','room_presence')")
[ "$applied" = "4" ] || die "target is not migrated — run 'node scripts/migrate.js' against it first"

existing=$(psql "$TARGET_URL" -tAX -c \
  "SELECT (SELECT count(*) FROM rooms)+(SELECT count(*) FROM room_rolls)+(SELECT count(*) FROM roll_comments)")
[ "$existing" = "0" ] || die "target already holds $existing rows; import expects empty tables"

echo "==> Dumping ${#TABLES[@]} tables from source"
dump_args=(--data-only --no-owner --no-privileges)
for t in "${TABLES[@]}"; do dump_args+=(--table="$t"); done
pg_dump "$SOURCE_URL" "${dump_args[@]}" > "$WORK/data.sql"
note "$(wc -l < "$WORK/data.sql") lines"

# A newer pg_dump emits SET parameters an older target does not recognise
# (pg_dump 17 writes `transaction_timeout`, which PostgreSQL 16 rejects and
# which aborts the whole restore). Drop any the target does not know about.
echo "==> Sanitising dump preamble for the target"
while read -r param; do
  if ! psql "$TARGET_URL" -tAX -c "SHOW $param" >/dev/null 2>&1; then
    note "dropping unsupported SET $param"
    sed -i "/^SET ${param} =/d" "$WORK/data.sql"
  fi
done < <(grep -oP '^SET \K[a-z_]+' "$WORK/data.sql" | sort -u)

# Row counts from the source, to compare against after the load.
read -r s_rooms s_rolls s_comments < <(psql "$SOURCE_URL" -tAX -F' ' -c \
  "SELECT (SELECT count(*) FROM rooms),(SELECT count(*) FROM room_rolls),(SELECT count(*) FROM roll_comments)")
note "source: $s_rooms rooms, $s_rolls rolls, $s_comments comments"

echo "==> Importing"
# session_replication_role=replica suppresses the NOTIFY triggers. Without it
# every imported row announces itself on eradice_events, and any client already
# streaming would replay the entire history as if it were live.
{
  echo "SET session_replication_role = replica;"
  cat "$WORK/data.sql"
  # The dump empties search_path for safety, so every claim is schema-qualified.
  for claim in "${CLAIMS[@]}"; do
    uuid=${claim%%=*}; sub=${claim#*=}
    [ "$uuid" != "$claim" ] || die "malformed --claim (expected UUID=SUB): $claim"
    printf "UPDATE public.room_rolls SET user_id=%s WHERE user_id=%s;\n" \
      "$(printf "'%s'" "${sub//\'/\'\'}")" "$(printf "'%s'" "${uuid//\'/\'\'}")"
    printf "UPDATE public.roll_comments SET author_id=%s WHERE author_id=%s;\n" \
      "$(printf "'%s'" "${sub//\'/\'\'}")" "$(printf "'%s'" "${uuid//\'/\'\'}")"
  done
} | psql "$TARGET_URL" -v ON_ERROR_STOP=1 --single-transaction -q

echo "==> Verifying"
read -r t_rooms t_rolls t_comments < <(psql "$TARGET_URL" -tAX -F' ' -c \
  "SELECT (SELECT count(*) FROM rooms),(SELECT count(*) FROM room_rolls),(SELECT count(*) FROM roll_comments)")
note "target: $t_rooms rooms, $t_rolls rolls, $t_comments comments"
[ "$s_rooms$s_rolls$s_comments" = "$t_rooms$t_rolls$t_comments" ] || die "row counts differ"

# room_rolls.id is GENERATED ALWAYS AS IDENTITY and the dump restores explicit
# ids. pg_dump emits its own setval, but verify it rather than trust it: if the
# sequence trails the data, the next roll inserted collides on the primary key.
read -r seq_last max_id < <(psql "$TARGET_URL" -tAX -F' ' -c \
  "SELECT (SELECT last_value FROM room_rolls_id_seq),(SELECT coalesce(max(id),0) FROM room_rolls)")
note "identity sequence at $seq_last, highest row id $max_id"
[ "$seq_last" -ge "$max_id" ] || die "sequence ($seq_last) trails the data ($max_id); next insert would collide"

for claim in "${CLAIMS[@]}"; do
  sub=${claim#*=}
  n=$(psql "$TARGET_URL" -tAX -c "SELECT (SELECT count(*) FROM room_rolls WHERE user_id='${sub//\'/\'\'}')
                                       +(SELECT count(*) FROM roll_comments WHERE author_id='${sub//\'/\'\'}')")
  note "claimed $n rows for $sub"
done

frozen=$(psql "$TARGET_URL" -tAX -c \
  "SELECT (SELECT count(*) FROM room_rolls WHERE user_id IS NOT NULL AND user_id NOT LIKE '%|%' AND user_id ~ '^[0-9a-f-]{36}$')")
[ "$frozen" = "0" ] || note "note: $frozen rows still carry a Supabase UUID owner and are read-only to everyone"

echo "==> Done"
