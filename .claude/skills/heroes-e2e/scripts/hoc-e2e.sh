#!/usr/bin/env bash
# Heroes of Crypto — local E2E harness (PICK-phase).
#
# Brings up the full local stack, then either:
#   match  — a real human-vs-human pick/ban match between two seeded players, printing two browser
#            join links (GREEN = LOWER, RED = UPPER); or
#   vs-ai  — a single-human "Play vs AI" match, printing one link that opens in the pick phase against
#            an AI opponent that drives its own picks/placement/fight server-side.
# Each link uses the dev e2e auto-login (?e2eEmail=&e2ePassword=) so the browser is authenticated and
# lands directly in the match.
#
# Stack: ArangoDB + Redis (Docker) -> server (:3001) -> game client (:5174).
set -euo pipefail

CLIENT_DIR="${HOC_CLIENT_DIR:-$HOME/Workplace/heroes-of-crypto-client}"
SERVER_DIR="${HOC_SERVER_DIR:-$HOME/Workplace/heroes-of-crypto-server}"
SERVER_PORT="${HOC_SERVER_PORT:-3001}"
CLIENT_PORT="${HOC_CLIENT_PORT:-5174}"
ARANGO_PASSWORD="${HOC_ARANGODB_PASSWORD:-ChangeMe}"

SERVER_LOG="/tmp/hoc-e2e-server.log"
CLIENT_LOG="/tmp/hoc-e2e-client.log"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR="$SCRIPT_DIR/hoc-monitor.sh"
ANOMALY_LOG="${HOC_ANOMALY_LOG:-/private/tmp/hoc-anomalies.log}"

port_busy() { lsof -iTCP:"$1" -sTCP:LISTEN -n -P >/dev/null 2>&1; }
wait_for() { local n="${2:-60}"; while ((n-- > 0)); do eval "$1" && return 0; sleep 1; done; return 1; }

ensure_docker_db() {
    if ! docker info >/dev/null 2>&1; then
        echo "docker: daemon not reachable — start Docker Desktop (or your container runtime) first" >&2
        exit 1
    fi
    if ! docker ps --format '{{.Names}}' | grep -qx hoc-arangodb; then
        echo "arangodb: starting container"
        docker rm -f hoc-arangodb >/dev/null 2>&1 || true
        docker run -d --name hoc-arangodb --restart unless-stopped -p 8529:8529 \
            -e ARANGO_ROOT_PASSWORD="$ARANGO_PASSWORD" -v hoc-arangodb-data:/var/lib/arangodb3 \
            arangodb:3.12 >/dev/null
    fi
    if ! docker ps --format '{{.Names}}' | grep -qx hoc-redis; then
        echo "redis: starting container"
        docker rm -f hoc-redis >/dev/null 2>&1 || true
        docker run -d --name hoc-redis --restart unless-stopped -p 6379:6379 redis:7-alpine >/dev/null
    fi
    wait_for "curl -sf -o /dev/null -u root:$ARANGO_PASSWORD http://127.0.0.1:8529/_api/version" 30 \
        || { echo "arangodb: not ready" >&2; exit 1; }
    echo "db: ArangoDB :8529 + Redis :6379 up"
}

ensure_server() {
    if port_busy "$SERVER_PORT"; then echo "server: already on :$SERVER_PORT"; return; fi
    echo "server: starting (bun index.ts) -> $SERVER_LOG"
    (cd "$SERVER_DIR" && nohup bun index.ts >"$SERVER_LOG" 2>&1 &)
    wait_for "curl -s -o /dev/null http://127.0.0.1:$SERVER_PORT/" 40 \
        || { echo "server failed; see $SERVER_LOG"; tail -20 "$SERVER_LOG"; exit 1; }
    echo "server: up on :$SERVER_PORT (bootstraps DB collections on first boot)"
}

ensure_monitor() {
    # Detached server-log watchdog: self-discovers the running server's log and records crashes/fatal
    # anomalies to $ANOMALY_LOG. Survives across shells (nohup) so it keeps watching the whole session.
    if pgrep -f "hoc-monitor.sh" >/dev/null 2>&1; then echo "monitor: already running (see $ANOMALY_LOG)"; return; fi
    echo "monitor: starting server-log watchdog -> $ANOMALY_LOG"
    HOC_SERVER_PORT="$SERVER_PORT" HOC_ANOMALY_LOG="$ANOMALY_LOG" nohup bash "$MONITOR" >/dev/null 2>&1 &
    disown 2>/dev/null || true
}

ensure_client() {
    if port_busy "$CLIENT_PORT"; then echo "client: already on :$CLIENT_PORT"; return; fi
    echo "client: starting (vite --port $CLIENT_PORT --strictPort) -> $CLIENT_LOG"
    (cd "$CLIENT_DIR/game/core" && nohup bun x vite --port "$CLIENT_PORT" --strictPort >"$CLIENT_LOG" 2>&1 &)
    wait_for "port_busy $CLIENT_PORT" 60 || { echo "client failed; see $CLIENT_LOG"; tail -20 "$CLIENT_LOG"; exit 1; }
    echo "client: up on :$CLIENT_PORT"
}

cmd_match() {
    ensure_docker_db
    ensure_server
    ensure_monitor
    ensure_client
    echo "match: seeding two players + pick game, driving confirm -> PICK ..."
    # Run from the server dir so bun auto-loads its .env (HOC_ARANGODB_* creds).
    (cd "$SERVER_DIR" && bun simple_client/create_pick_match.ts)
}

cmd_vs_ai() {
    ensure_docker_db
    if [[ -n "${HOC_VS_AI_VERSION:-}" ]] && port_busy "$SERVER_PORT"; then
        echo "vs-ai: HOC_VS_AI_VERSION requires a fresh server; run cleanup, then retry" >&2
        exit 1
    fi
    ensure_server
    ensure_monitor
    ensure_client
    echo "vs-ai: seeding one active player + creating the game + printing a Play-vs-AI link (AI drives picks/placement/fight) ..."
    # Run from the server dir so bun auto-loads its .env (HOC_ARANGODB_* creds).
    # AI version = difficulty tier, passed PER-GAME (no fresh server needed): HOC_VS_AI_DIFFICULTY =
    # easy(v0.4)|normal(v0.6)|hard(v0.7)|brutal(v0.7+search). HOC_VS_AI_VERSION still works (mapped),
    # but it's the older path — the difficulty gate above only applies to it.
    (cd "$SERVER_DIR" && \
        HOC_PLAY_BASE_URL="${HOC_PLAY_BASE_URL:-http://localhost:$SERVER_PORT}" \
        HOC_CLIENT_BASE_URL="${HOC_CLIENT_BASE_URL:-http://localhost:$CLIENT_PORT}" \
        bun simple_client/create_vs_ai_match.ts)
}

cmd_placement() {
    ensure_docker_db
    ensure_server
    ensure_monitor
    ensure_client
    echo "placement: creating dev play game (skips pick/ban) with randomized rosters ..."
    # Run from the server dir so bun auto-loads its .env (HOC_ARANGODB_* creds).
    (cd "$SERVER_DIR" && bun simple_client/create_play_match.ts)
}

cmd_status() {
    docker ps --format '{{.Names}}\t{{.Status}}' 2>/dev/null | grep -E 'hoc-(arangodb|redis)' || echo "db containers: none"
    port_busy "$SERVER_PORT" && echo "server: UP :$SERVER_PORT" || echo "server: DOWN :$SERVER_PORT"
    port_busy "$CLIENT_PORT" && echo "client: UP :$CLIENT_PORT" || echo "client: DOWN :$CLIENT_PORT"
    pgrep -f "hoc-monitor.sh" >/dev/null 2>&1 && echo "monitor: RUNNING -> $ANOMALY_LOG" || echo "monitor: not running"
}

# Start (if needed) the watchdog and print any anomalies it has recorded so far.
cmd_monitor() {
    ensure_monitor
    echo "--- anomalies ($ANOMALY_LOG) ---"
    [ -s "$ANOMALY_LOG" ] && tail -n 40 "$ANOMALY_LOG" || echo "(none recorded)"
}

cmd_cleanup() {
    pkill -f "bun index.ts" 2>/dev/null || true
    pkill -f "vite --port $CLIENT_PORT" 2>/dev/null || true
    pkill -f "hoc-monitor.sh" 2>/dev/null || true
    echo "cleanup: stopped server + client + monitor (DB containers left running; 'docker stop hoc-arangodb hoc-redis' to stop them)"
}

case "${1:-match}" in
    all|match|up)      cmd_match ;;
    vs-ai|ai|vsai)     cmd_vs_ai ;;
    placement|play)    cmd_placement ;;
    status)            cmd_status ;;
    monitor|anomalies) cmd_monitor ;;
    cleanup|down)      cmd_cleanup ;;
    *) echo "Usage: $(basename "$0") {match|vs-ai|placement|status|monitor|cleanup}"; exit 1 ;;
esac
