#!/usr/bin/env bash
# ─── Seed a local environment from the live (CapRover) database ──────────────
#
#   scripts/seed-from-live.sh <dev|staging> [options]
#   pnpm seed:dev [options]      pnpm seed:staging [options]
#
# Replaces the target's database (and uploads) with a copy of live. Live is
# only ever read: pg_dump and tar, nothing is written there.
#
# How live is reached (configure in .env, see docs/architecture/configuration.md):
#   LIVE_SSH=user@host       SSH to the CapRover host; pg_dump runs inside the
#                            Postgres container and uploads are tarred from the
#                            app container. Needs Docker access for that user.
#   LIVE_DATABASE_URL=...    Direct connection (e.g. a temporary CapRover port
#                            mapping or an SSH tunnel). Database only.
#
# Options:
#   --reuse            use the newest dump/uploads already in .local/ (no download)
#   --from FILE        restore this pg_dump custom-format file
#   --uploads-from F   extract this tar into uploads
#   --skip-uploads     leave uploads untouched
#   -y, --yes          do not ask for confirmation
#
# If a run fails after the database was replaced, re-run with --reuse; see
# docs/architecture/configuration.md → "If seeding fails".
#
# Only Docker is needed locally: pg_restore/psql run inside the target's
# PostgreSQL container.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

die() { echo "error: $*" >&2; exit 1; }
log() { echo "==> $*"; }

TARGET="${1:-}"
[ "$TARGET" = dev ] || [ "$TARGET" = staging ] || die "usage: $0 <dev|staging> [--reuse] [--from FILE] [--uploads-from FILE] [--skip-uploads] [--yes]"
shift

REUSE=0 DUMP="" UPLOADS_TAR="" SKIP_UPLOADS=0 YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --reuse) REUSE=1 ;;
    --from) DUMP="${2:?--from needs a file}"; shift ;;
    --uploads-from) UPLOADS_TAR="${2:?--uploads-from needs a file}"; shift ;;
    --skip-uploads) SKIP_UPLOADS=1 ;;
    -y|--yes) YES=1 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

[ -f .env ] || die ".env not found (cp example.env .env)"
set -a; . ./.env; set +a

LIVE_DB_SERVICE="${LIVE_DB_SERVICE:-srv-captain--info-bisericabetel-db}"
LIVE_APP_SERVICE="${LIVE_APP_SERVICE:-srv-captain--info-bisericabetel}"
LIVE_DB_USER="${LIVE_DB_USER:-postgres}"
LIVE_DB_NAME="${LIVE_DB_NAME:-postgres}"

if [ "$TARGET" = dev ]; then
  COMPOSE=(docker compose -f docker-compose.yml)
  # Same default as packages/api/src/index.ts when started via `pnpm dev:api`.
  DEV_UPLOADS="${UPLOADS_DIR:-$ROOT/packages/uploads}"
  # The API runs with cwd packages/api, so a relative UPLOADS_DIR is relative to it.
  case "$DEV_UPLOADS" in
    /*) ;;
    *) DEV_UPLOADS="$ROOT/packages/api/$DEV_UPLOADS" ;;
  esac
else
  COMPOSE=(docker compose -f docker-compose.staging.yml)
fi

STASH="$ROOT/.local"
mkdir -p "$STASH"
STAMP="$(date +%Y%m%d-%H%M%S)"

newest() { ls -t "$STASH"/$1 2>/dev/null | head -n1 || true; }

# Runs a script on the live host. $1 = service name prefix, rest = script args.
# CapRover swarm task containers are named "<service>.<slot>.<id>".
remote() {
  local script="$1"; shift
  ssh -o BatchMode=yes "$LIVE_SSH" sh -s -- "$@" <<EOF
set -e
c=\$(docker ps --format '{{.Names}}' | grep -E "^\$1\\." | head -n1)
[ -n "\$c" ] || { echo "no running container for service \$1 on \$(hostname)" >&2; exit 1; }
$script
EOF
}

# ─── 1. Obtain the dump ──────────────────────────────────────────────────────
if [ -z "$DUMP" ] && [ $REUSE = 1 ]; then
  DUMP="$(newest 'live-*.dump')"
  [ -n "$DUMP" ] || die "--reuse: no live-*.dump in .local/"
fi
if [ -z "$DUMP" ]; then
  DUMP="$STASH/live-$STAMP.dump"
  if [ -n "${LIVE_SSH:-}" ]; then
    log "Dumping live database over SSH ($LIVE_SSH → $LIVE_DB_SERVICE/$LIVE_DB_NAME)"
    remote 'docker exec "$c" pg_dump -U "$2" -d "$3" -Fc --no-owner --no-privileges' \
      "$LIVE_DB_SERVICE" "$LIVE_DB_USER" "$LIVE_DB_NAME" > "$DUMP" || { rm -f "$DUMP"; die "remote pg_dump failed"; }
  elif [ -n "${LIVE_DATABASE_URL:-}" ]; then
    log "Dumping live database from LIVE_DATABASE_URL"
    # pg_dump runs in a container, where "localhost" is the container itself.
    # Linux: share the host network so loopback-only listeners (SSH tunnels) work.
    # Docker Desktop: reach the host through host.docker.internal instead.
    url="$LIVE_DATABASE_URL"; net=host
    if [ "$(uname -s)" != Linux ]; then
      net=bridge
      url="$(printf '%s' "$url" | sed -E 's#@(localhost|127\.0\.0\.1)([:/])#@host.docker.internal\2#')"
    fi
    docker run --rm --network "$net" postgres:16-alpine pg_dump --dbname="$url" -Fc --no-owner --no-privileges > "$DUMP" \
      || { rm -f "$DUMP"; die "pg_dump failed"; }
  else
    die "set LIVE_SSH or LIVE_DATABASE_URL in .env, or pass --from / --reuse"
  fi
fi
[ -s "$DUMP" ] || die "dump is empty: $DUMP"
log "Dump: $DUMP ($(du -h "$DUMP" | cut -f1))"

# ─── 2. Obtain the uploads archive ───────────────────────────────────────────
if [ $SKIP_UPLOADS = 0 ] && [ -z "$UPLOADS_TAR" ]; then
  if [ $REUSE = 1 ]; then
    UPLOADS_TAR="$(newest 'live-uploads-*.tar')"
  elif [ -n "${LIVE_SSH:-}" ]; then
    UPLOADS_TAR="$STASH/live-uploads-$STAMP.tar"
    log "Copying live uploads over SSH ($LIVE_APP_SERVICE)"
    remote 'docker exec "$c" sh -c '"'"'cd "${UPLOADS_DIR:-/app/uploads}" && tar -cf - .'"'"'' \
      "$LIVE_APP_SERVICE" > "$UPLOADS_TAR" || { rm -f "$UPLOADS_TAR"; die "remote uploads tar failed"; }
  fi
  [ -n "$UPLOADS_TAR" ] || { echo "    (no uploads source: images will be missing; use LIVE_SSH or --uploads-from)"; SKIP_UPLOADS=1; }
fi
if [ $SKIP_UPLOADS = 0 ]; then
  # Validate before anything destructive: the restore deletes current uploads first.
  # -xO reads every member, so a truncated archive fails here (-t alone does not).
  [ -s "$UPLOADS_TAR" ] || die "uploads archive missing or empty: $UPLOADS_TAR"
  tar -xOf "$UPLOADS_TAR" > /dev/null || die "uploads archive is not a valid tar: $UPLOADS_TAR"
  # Only plain files and directories, all inside the archive root: no absolute
  # paths, no ".." components, no symlinks, hard links or device files.
  if tar -tf "$UPLOADS_TAR" | grep -Eq '^/|(^|/)\.\.(/|$)'; then
    die "uploads archive contains absolute or ../ paths: $UPLOADS_TAR"
  fi
  if tar -tvf "$UPLOADS_TAR" | grep -Ev '^[-d]' | grep -q . || tar -tvf "$UPLOADS_TAR" | grep -q ' link to '; then
    die "uploads archive contains links or special files: $UPLOADS_TAR"
  fi
fi

# ─── 3. Confirm ──────────────────────────────────────────────────────────────
if [ $YES = 0 ]; then
  echo
  echo "This REPLACES the local $TARGET database$([ $SKIP_UPLOADS = 0 ] && echo ' and uploads') with the copy above."
  printf "Continue? [y/N] "
  read -r answer
  [ "$answer" = y ] || [ "$answer" = Y ] || die "aborted"
fi

# ─── 4. Stage uploads ────────────────────────────────────────────────────────
# Extract into <uploads>/.incoming first, so a failed extraction (e.g. a full
# disk) stops the script before the database is replaced. The swap into place
# happens after the database restore succeeded.
# Permissions are normalised so odd archive modes cannot block the swap or cleanup.
CLEAR_SH='[ ! -e "$1/.incoming" ] || { chmod -R u+rwX "$1/.incoming" && rm -rf "$1/.incoming"; }'
STAGE_SH="$CLEAR_SH"' && mkdir "$1/.incoming" && tar -xf - -C "$1/.incoming" && chmod -R u+rwX "$1/.incoming"'
SWAP_SH='find "$1" -mindepth 1 -maxdepth 1 ! -name .incoming -exec rm -rf {} + &&
  find "$1/.incoming" -mindepth 1 -maxdepth 1 -exec mv {} "$1/" \; && rmdir "$1/.incoming" &&
  echo "    $(find "$1" -type f | wc -l | tr -d " ") files in uploads"'
# On failure before the swap, drop the staged copy and keep the current uploads.
STAGED=0
cleanup_staged() {
  [ $STAGED = 1 ] || return 0
  if [ "$TARGET" = dev ]; then sh -c "$CLEAR_SH" sh "$DEV_UPLOADS"
  else docker run --rm -v betel-staging_uploads:/u alpine:3 sh -c "$CLEAR_SH" sh /u; fi
}
trap cleanup_staged EXIT
if [ $SKIP_UPLOADS = 0 ]; then
  log "Staging uploads from $UPLOADS_TAR"
  STAGED=1
  if [ "$TARGET" = dev ]; then
    mkdir -p "$DEV_UPLOADS"
    sh -c "$STAGE_SH" sh "$DEV_UPLOADS" < "$UPLOADS_TAR"
  else
    # Pre-create the volume with compose labels so `docker compose up` adopts it.
    docker volume create --label com.docker.compose.project=betel-staging \
      --label com.docker.compose.volume=uploads betel-staging_uploads > /dev/null
    docker run --rm -i -v betel-staging_uploads:/u alpine:3 sh -c "$STAGE_SH" sh /u < "$UPLOADS_TAR"
  fi
fi

# ─── 5. Restore the database ─────────────────────────────────────────────────
log "Starting $TARGET database"
"${COMPOSE[@]}" up -d --wait db
if [ "$TARGET" = staging ]; then
  "${COMPOSE[@]}" stop app 2>/dev/null || true
fi

log "Recreating database info_bisericabetel"
"${COMPOSE[@]}" exec -T db psql -v ON_ERROR_STOP=1 -q -U betel -d postgres \
  -c 'DROP DATABASE IF EXISTS info_bisericabetel WITH (FORCE)' \
  -c 'CREATE DATABASE info_bisericabetel'

log "Restoring dump"
# Non-fatal errors (e.g. COMMENT ON EXTENSION owned by another role) are
# reported but do not stop the restore; the table check below is the gate.
"${COMPOSE[@]}" exec -T db pg_restore -U betel -d info_bisericabetel --no-owner --no-privileges < "$DUMP" \
  || echo "    pg_restore reported errors (see above); continuing to verification"

tables="$("${COMPOSE[@]}" exec -T db psql -U betel -d info_bisericabetel -tAc \
  "select count(*) from information_schema.tables where table_schema='public' and table_name in ('sites','content_items','_migrations')")"
[ "$(echo "$tables" | tr -d '[:space:]')" = 3 ] \
  || die "restored database lacks the app tables — is LIVE_DB_NAME ($LIVE_DB_NAME) the database the live app uses?"
"${COMPOSE[@]}" exec -T db psql -U betel -d info_bisericabetel -tAc \
  "select 'sites: '||(select count(*) from sites)||', content items: '||(select count(*) from content_items)||', users: '||(select count(*) from users)||', last migration: '||(select max(name) from _migrations)"

# ─── 6. Swap the staged uploads into place ───────────────────────────────────
if [ $SKIP_UPLOADS = 0 ]; then
  log "Replacing uploads"
  STAGED=0  # from here on, keep .incoming if the swap fails part-way
  if [ "$TARGET" = dev ]; then
    sh -c "$SWAP_SH" sh "$DEV_UPLOADS"
  else
    docker run --rm -v betel-staging_uploads:/u alpine:3 sh -c "$SWAP_SH" sh /u
  fi || die "replacing uploads failed after the database was restored; re-run: $0 $TARGET --reuse --yes"
fi

# ─── 7. Bring the target back ────────────────────────────────────────────────
if [ "$TARGET" = staging ]; then
  log "Starting staging app (applies any newer migrations)"
  "${COMPOSE[@]}" up -d --build --wait
  echo "    http://localhost:${STAGING_APP_PORT:-8080}"
else
  echo "    Restart \`pnpm dev:api\` if it was running, so newer local migrations are applied."
fi
log "Done. Log in with your live admin credentials."
