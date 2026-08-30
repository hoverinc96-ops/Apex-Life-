#!/usr/bin/env bash
# Rebuild the Next.js site and (re)start the production server on port 3000.
# Dependencies live on /tmp/apex-deps (overlay fs, lots of space) and are
# symlinked into the site directory, keeping /home usage minimal.
set -euo pipefail
cd "$(dirname "$0")"
umask 002
mkdir -p .run

# Free port 3000 (across user boundaries) — wait until it is ACTUALLY free,
# with a SIGKILL fallback for stragglers. If we skip this, the new server hits
# EADDRINUSE and dies while the stale server keeps serving old code (and the
# health check below passes against it — a silent bad deploy).
sudo sh -c 'for _ in $(seq 1 30); do
  pids=$(lsof -t -iTCP:3000 -sTCP:LISTEN 2>/dev/null || true);
  if [ -z "$pids" ]; then exit 0; fi;
  kill $pids 2>/dev/null || true;
  sleep 0.2;
done;
pids=$(lsof -t -iTCP:3000 -sTCP:LISTEN 2>/dev/null || true);
if [ -n "$pids" ]; then
  kill -9 $pids 2>/dev/null || true;
  sleep 0.5;
fi'

# Ensure deps are installed on the overlay filesystem and symlinked
if [ ! -d /tmp/apex-deps/node_modules ]; then
  mkdir -p /tmp/apex-deps
  cp package.json /tmp/apex-deps/
  cd /tmp/apex-deps && bun install
  cp bun.lock "$OLDPWD/"
  cd "$OLDPWD"
fi
if [ ! -L node_modules ]; then
  rm -rf node_modules
  ln -s /tmp/apex-deps/node_modules node_modules
fi

# Load env vars for runtime
export $(grep -v '^#' .env | xargs)

bun run build
setsid nohup env DATABASE_URL="$DATABASE_URL" RESEND_API_KEY="$RESEND_API_KEY" UPSTASH_REDIS_REST_URL="$UPSTASH_REDIS_REST_URL" UPSTASH_REDIS_REST_TOKEN="$UPSTASH_REDIS_REST_TOKEN" DEEPGRAM_API_KEY="$DEEPGRAM_API_KEY" ELEVENLABS_API_KEY="$ELEVENLABS_API_KEY" bun run start > .run/server.log 2>&1 < /dev/null &

# Wait for the new server to actually answer
for _ in $(seq 1 50); do
  if curl -sf -o /dev/null http://localhost:3000; then
    # Confirm the new server (not a stale one) owns the port.
    if grep -q "EADDRINUSE" .run/server.log; then
      echo "error: new server failed to bind (EADDRINUSE) — stale process won the port; check .run/server.log and republish" >&2
      exit 1
    fi
    echo "site published; serving on port 3000"
    exit 0
  fi
  sleep 0.2
done
echo "warning: published, but the server isn't responding — check .run/server.log" >&2
exit 1
