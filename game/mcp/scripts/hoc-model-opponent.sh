#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODEL_API_BASE="${HOC_MODEL_API_BASE:-http://127.0.0.1:9091/}"
MODEL_API_V1_BASE=""

usage() {
    cat <<USAGE
Usage: $(basename "$0") <command>

Commands:
  play      Play a local headless full game: you vs model opponent
  demo      Let the built-in/model loop control both teams for smoke testing
  status    Check whether the model API is reachable and action-choice capable

Environment:
  HOC_MODEL_API_BASE   OpenAI-compatible model API base. Default: ${MODEL_API_BASE}
  HOC_MODEL_NAME       Model name sent to /chat/completions. Default: auto
  HOC_HUMAN_TEAM       LOWER or UPPER. Default: LOWER
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

demo() {
    (
        cd "$MCP_DIR"
        HOC_MODEL_API_BASE="$MODEL_API_BASE" HOC_AUTO_HUMAN=1 HOC_MODEL_DISABLED="${HOC_MODEL_DISABLED:-1}" \
            bun scripts/model-opponent.ts play --auto-human "${@}"
    )
}

case "${1:-}" in
    play) play ;;
    demo)
        shift
        demo "$@"
        ;;
    status) status ;;
    ""|-h|--help|help) usage ;;
    *) usage; exit 2 ;;
esac
