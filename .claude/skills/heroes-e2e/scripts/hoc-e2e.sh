#!/usr/bin/env bash
# Heroes of Crypto — local E2E multiplayer harness (PICK-phase, real multiplayer).
#
# Brings up the full local stack and creates a real pick/ban match between two
# seeded players, printing two browser join links (GREEN = LOWER, RED = UPPER).
# Each link uses the dev e2e auto-login (?e2eEmail=&e2ePassword=) so the browser
# is authenticated and lands directly in the pick & ban phase.
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
    ensure_client
    echo "match: seeding two players + pick game, driving confirm -> PICK ..."
    # Run from the server dir so bun auto-loads its .env (HOC_ARANGODB_* creds).
    (cd "$SERVER_DIR" && bun simple_client/create_pick_match.ts)
}

cmd_status() {
    docker ps --format '{{.Names}}\t{{.Status}}' 2>/dev/null | grep -E 'hoc-(arangodb|redis)' || echo "db containers: none"
    port_busy "$SERVER_PORT" && echo "server: UP :$SERVER_PORT" || echo "server: DOWN :$SERVER_PORT"
    port_busy "$CLIENT_PORT" && echo "client: UP :$CLIENT_PORT" || echo "client: DOWN :$CLIENT_PORT"
}

cmd_cleanup() {
    pkill -f "bun index.ts" 2>/dev/null || true
    pkill -f "vite --port $CLIENT_PORT" 2>/dev/null || true
    echo "cleanup: stopped server + client (DB containers left running; 'docker stop hoc-arangodb hoc-redis' to stop them)"
}

case "${1:-match}" in
    all|match|up) cmd_match ;;
    status)       cmd_status ;;
    cleanup|down) cmd_cleanup ;;
    *) echo "Usage: $(basename "$0") {match|status|cleanup}"; exit 1 ;;
esac
