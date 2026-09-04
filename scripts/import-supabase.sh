#!/usr/bin/env bash
#
# One-shot import of the Supabase dataset into a migrated eradice database.
#
#   scripts/import-supabase.sh <source-url> <target-url> [options]
#
#     --only-room SLUG           keep just this room; drop every other
#     --claim UUID=SUB           remap one Supabase auth UUID onto an Access subject
#     --claim-nickname NICK=SUB  remap every row bearing this nickname
#
# Source is the Supabase connection string; target is the CNPG database with
# `node scripts/migrate.js` already applied. The script is idempotent only in
# the sense that it refuses to run twice: it requires the target's tables to be
# empty, so a retry means dropping and re-migrating the target first.
#
# Claiming remaps anonymous Supabase identities onto Cloudflare Access
# subjects, so rolls and comments stay editable by their owner. Rows left
# unclaimed keep their UUID as historical provenance and match no Access
# subject, which makes them permanently read-only — for an unrevealed secret
# roll that means it can never be revealed by anyone. Rows that predate
# Supabase auth have a NULL owner and stay editable by everyone.
#
# --claim is exact and safe: a UUID is an identity. --claim-nickname is a
# judgement call, because a nickname is just a display name that anyone could
# have typed, and it also sweeps up that nickname's NULL-owner rows, which are
# currently editable by everyone. Prefer --claim unless you have checked that
# each UUID in the data used exactly one nickname; the summary below reports
# what each claim actually touched so the result can be verified rather than
# assumed.
#
# Everything here is exercised by a rehearsal against a replica of the Supabase
# schema; see README "Migrating from Supabase".

set -euo pipefail

TABLES=(public.rooms public.room_rolls public.roll_comments)

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
note() { printf '  %s\n' "$*"; }

[ $# -ge 2 ] || die "usage: $0 <source-url> <target-url> [--claim UUID=SUB]..."
SOURCE_URL=$1; TARGET_URL=$2; shift 2

CLAIMS=(); NICK_CLAIMS=(); ONLY_ROOM=""
while [ $# -gt 0 ]; do
  case $1 in
    --claim)          [ $# -ge 2 ] || die "--claim needs UUID=SUB";           CLAIMS+=("$2");      shift 2 ;;
    --claim-nickname) [ $# -ge 2 ] || die "--claim-nickname needs NICK=SUB";  NICK_CLAIMS+=("$2"); shift 2 ;;
    --only-room)      [ $# -ge 2 ] || die "--only-room needs a slug";         ONLY_ROOM="$2";      shift 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done

# Single-quote a value for inclusion in SQL.
lit() { printf "'%s'" "${1//\'/\'\'}"; }

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

# Expected counts, computed from the source with the same room filter the
# import will apply. Comparing the target against these is what catches a
# partial load; comparing against unfiltered totals would only catch it when
# nothing is being pruned.
if [ -n "$ONLY_ROOM" ]; then
  keep=$(psql "$SOURCE_URL" -tAX -c "SELECT count(*) FROM rooms WHERE slug = $(lit "$ONLY_ROOM")")
  [ "$keep" = "1" ] || die "--only-room '$ONLY_ROOM' matches $keep rooms in the source, expected exactly 1"
  where="WHERE room_id = (SELECT id FROM rooms WHERE slug = $(lit "$ONLY_ROOM"))"
  read -r s_rooms s_rolls s_comments < <(psql "$SOURCE_URL" -tAX -F' ' -c \
    "SELECT 1,(SELECT count(*) FROM room_rolls $where),(SELECT count(*) FROM roll_comments $where)")
  note "source (room '$ONLY_ROOM' only): $s_rolls rolls, $s_comments comments"
  note "discarding $(psql "$SOURCE_URL" -tAX -c "SELECT count(*)-1 FROM rooms") other rooms"
else
  read -r s_rooms s_rolls s_comments < <(psql "$SOURCE_URL" -tAX -F' ' -c \
    "SELECT (SELECT count(*) FROM rooms),(SELECT count(*) FROM room_rolls),(SELECT count(*) FROM roll_comments)")
  note "source: $s_rooms rooms, $s_rolls rolls, $s_comments comments"
fi

echo "==> Importing"
# session_replication_role=replica suppresses the NOTIFY triggers. Without it
# every imported row announces itself on eradice_events, and any client already
# streaming would replay the entire history as if it were live.
#
# Everything below — load, prune, claims — runs in one transaction, so a
# malformed claim leaves the target empty rather than half-migrated.
{
  echo "SET session_replication_role = replica;"
  cat "$WORK/data.sql"
  # The dump empties search_path for safety, so everything after it is
  # schema-qualified.
  echo "SET search_path = public;"

  # Prune before claiming: the claims then only touch rows being kept, and the
  # reported counts describe the final dataset rather than the discarded one.
  #
  # Child rows are deleted explicitly, in FK order, rather than leaning on
  # ON DELETE CASCADE. session_replication_role = replica disables every
  # non-replica trigger, and referential actions are implemented as triggers —
  # so under it a cascade silently does nothing and the child rows survive as
  # orphans pointing at a room that no longer exists.
  if [ -n "$ONLY_ROOM" ]; then
    keep_id="(SELECT id FROM public.rooms WHERE slug = $(lit "$ONLY_ROOM"))"
    printf "DELETE FROM public.room_rolls     WHERE room_id IS DISTINCT FROM %s;\n" "$keep_id"
    printf "DELETE FROM public.roll_comments  WHERE room_id IS DISTINCT FROM %s;\n" "$keep_id"
    printf "DELETE FROM public.room_presence  WHERE room_id IS DISTINCT FROM %s;\n" "$keep_id"
    printf "DELETE FROM public.rooms          WHERE slug <> %s;\n" "$(lit "$ONLY_ROOM")"
  fi

  for claim in ${CLAIMS[@]+"${CLAIMS[@]}"}; do
    uuid=${claim%%=*}; sub=${claim#*=}
    [ "$uuid" != "$claim" ] || die "malformed --claim (expected UUID=SUB): $claim"
    printf "UPDATE public.room_rolls    SET user_id=%s   WHERE user_id=%s;\n"   "$(lit "$sub")" "$(lit "$uuid")"
    printf "UPDATE public.roll_comments SET author_id=%s WHERE author_id=%s;\n" "$(lit "$sub")" "$(lit "$uuid")"
  done

  for claim in ${NICK_CLAIMS[@]+"${NICK_CLAIMS[@]}"}; do
    nick=${claim%%=*}; sub=${claim#*=}
    [ "$nick" != "$claim" ] || die "malformed --claim-nickname (expected NICK=SUB): $claim"
    printf "UPDATE public.room_rolls    SET user_id=%s   WHERE user_nickname=%s;\n"   "$(lit "$sub")" "$(lit "$nick")"
    printf "UPDATE public.roll_comments SET author_id=%s WHERE author_nickname=%s;\n" "$(lit "$sub")" "$(lit "$nick")"
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

# One line per distinct subject: several claims commonly map onto the same
# account, and reporting per claim would count those rows once each.
subs=$(for claim in ${CLAIMS[@]+"${CLAIMS[@]}"} ${NICK_CLAIMS[@]+"${NICK_CLAIMS[@]}"}; do
         printf '%s\n' "${claim#*=}"; done | sort -u)
for sub in $subs; do
  read -r cr cc < <(psql "$TARGET_URL" -tAX -F' ' -c \
    "SELECT (SELECT count(*) FROM room_rolls WHERE user_id=$(lit "$sub")),
            (SELECT count(*) FROM roll_comments WHERE author_id=$(lit "$sub"))")
  note "$sub now owns $cr rolls, $cc comments"
done

# Anything owned by a subject that was not claimed matched no mapping. This
# cannot be inferred from the shape of the value: a Cloudflare Access subject
# is itself a UUID, so pattern-matching for "looks like a Supabase id" flags
# the accounts just assigned. Compare against the claimed set instead.
if [ -n "$subs" ]; then
  claimed_list=$(printf '%s\n' "$subs" | while read -r s; do printf '%s,' "$(lit "$s")"; done)
  not_claimed="user_id IS NOT NULL AND user_id NOT IN (${claimed_list%,})"
else
  not_claimed="user_id IS NOT NULL"
fi
read -r frozen frozen_secret < <(psql "$TARGET_URL" -tAX -F' ' -c \
  "SELECT count(*), count(*) FILTER (WHERE visibility='secret' AND NOT is_revealed)
     FROM room_rolls WHERE $not_claimed")
if [ "$frozen" != "0" ]; then
  note "warning: $frozen rolls carry an owner that was not claimed and are read-only to everyone"
  [ "$frozen_secret" = "0" ] || note "warning: $frozen_secret of those are unrevealed secret rolls, now permanently unrevealable"
fi

unowned=$(psql "$TARGET_URL" -tAX -c "SELECT count(*) FROM room_rolls WHERE user_id IS NULL")
note "$unowned rolls have no owner (editable by anyone in the room, as before)"

echo "==> Done"
