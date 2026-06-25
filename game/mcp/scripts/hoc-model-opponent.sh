#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLIENT_DIR="$(cd "$MCP_DIR/../.." && pwd)"
MODEL_API_BASE="${HOC_MODEL_API_BASE:-http://127.0.0.1:9091/}"
MODEL_API_V1_BASE=""
UI_HOST="${HOC_MODEL_UI_HOST:-127.0.0.1}"
UI_PORT="${HOC_MODEL_UI_PORT:-5181}"
UI_OPEN="${HOC_MODEL_UI_OPEN:-1}"
MODEL_TEAM="${HOC_MODEL_TEAM:-UPPER}"

usage() {
    cat <<USAGE
Usage: $(basename "$0") <command>

Commands:
  ui        Start the normal browser UI with local model opponent enabled
  play      Play a local headless full game: you vs model opponent
  demo      Let the built-in/model loop control both teams for smoke testing
  status    Check whether the model API is reachable and action-choice capable

Environment:
  HOC_MODEL_API_BASE   OpenAI-compatible model API base. Default: ${MODEL_API_BASE}
  HOC_MODEL_NAME       Model name sent to /chat/completions. Default: auto
  HOC_HUMAN_TEAM       LOWER or UPPER. Default: LOWER
  HOC_MODEL_TEAM       LOWER or UPPER for browser UI opponent. Default: ${MODEL_TEAM}
  HOC_MODEL_UI_PORT    Browser UI dev-server port. Default: ${UI_PORT}
  HOC_MODEL_UI_OPEN    1 to open browser from Vite, 0 to only serve. Default: ${UI_OPEN}
  HOC_AI_STYLE         balanced, aggressive, defensive. Default: balanced
  HOC_MODEL_STREAM     0 to force non-streaming chat completions. Default: stream with non-stream retry
  HOC_MODEL_TEMPERATURE Chat completion temperature. Default: 0
USAGE
}

http_code() {
    curl -sS -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true
}

normalize_api_base() {
    local base="${1%/}"
    if [[ "$base" == */v1 ]]; then
        echo "$base"
    else
        echo "$base/v1"
    fi
}

model_proxy_target() {
    local base="${1%/}"
    if [[ "$base" == */v1 ]]; then
        echo "${base%/v1}"
    else
        echo "$base"
    fi
}

status() {
    local code
    MODEL_API_V1_BASE="$(normalize_api_base "$MODEL_API_BASE")"
    code="$(http_code "${MODEL_API_V1_BASE}/models")"
    if [[ "$code" != "000" ]]; then
        echo "model api reachable: ${MODEL_API_V1_BASE}/models HTTP $code"
        if [[ "$code" == "200" ]]; then
            (
                cd "$MCP_DIR"
                set +e
                HOC_MODEL_API_BASE="$MODEL_API_BASE" bun scripts/probe_model.ts
                local probe_code=$?
                set -e
                if [[ "$probe_code" == "2" ]]; then
                    echo "model probe reached chat completions but did not get a legal game action; local play will use fallback when this happens"
                elif [[ "$probe_code" != "0" ]]; then
                    echo "model probe failed with exit code $probe_code"
                fi
            )
        fi
    else
        echo "model api not reachable: ${MODEL_API_V1_BASE}"
        echo "the runner will fall back to the built-in scorer unless HOC_MODEL_DISABLED is unset and the API starts responding"
    fi
}

play() {
    (
        cd "$MCP_DIR"
        HOC_MODEL_API_BASE="$MODEL_API_BASE" bun scripts/model-opponent.ts play
    )
}

ui() {
    local url="/?localModelOpponent=1&modelTeam=${MODEL_TEAM}&modelStyle=${HOC_AI_STYLE:-balanced}"
    local vite_args=(--host "$UI_HOST" --port "$UI_PORT")
    if [[ "$UI_OPEN" != "0" ]]; then
        vite_args+=(--open "$url")
    fi
    echo "Starting game UI with local model opponent enabled"
    echo "Model API: ${MODEL_API_BASE}"
    echo "Model team: ${MODEL_TEAM}"
    echo "URL: http://${UI_HOST}:${UI_PORT}${url}"
    (
        cd "$CLIENT_DIR/game/core"
        VITE_HOC_LOCAL_MODEL_OPPONENT=1 \
        VITE_HOC_MODEL_TEAM="$MODEL_TEAM" \
        VITE_HOC_MODEL_PROXY_TARGET="$(model_proxy_target "$MODEL_API_BASE")" \
        VITE_HOC_AI_STYLE="${HOC_AI_STYLE:-balanced}" \
            bun run start -- "${vite_args[@]}"
    )
}

demo() {
    (
        cd "$MCP_DIR"
        HOC_MODEL_API_BASE="$MODEL_API_BASE" HOC_AUTO_HUMAN=1 HOC_MODEL_DISABLED="${HOC_MODEL_DISABLED:-1}" \
            bun scripts/model-opponent.ts play --auto-human "${@}"
    )
}

case "${1:-}" in
    ui) ui ;;
    play) play ;;
    demo)
        shift
        demo "$@"
        ;;
    status) status ;;
    ""|-h|--help|help) usage ;;
    *) usage; exit 2 ;;
esac
