#!/bin/bash
# Durable server-log watchdog for local e2e testing.
#
# Self-discovers the running server's log file via lsof on the listening pid, so it works no matter which
# launcher started the server (hoc-e2e.sh, a manual `bun index.ts`, an IDE task, ...). Scans new log lines
# for FATAL anomalies and detects crashes (port gone). Appends findings, with timestamps, to an anomaly file
# that stays stable across server restarts. Ignores known-benign noise (missing games, journal dedup).
#
# Meant to run DETACHED so it survives across agent turns:
#   nohup bash hoc-monitor.sh >/dev/null 2>&1 & disown
#
# Check findings any time with:  tail -n 40 "$HOC_ANOMALY_LOG"   (default /private/tmp/hoc-anomalies.log)

PORT="${HOC_SERVER_PORT:-3001}"
ANOM="${HOC_ANOMALY_LOG:-/private/tmp/hoc-anomalies.log}"
POLL="${HOC_MONITOR_POLL:-3}"

FATAL='uncaught_exception|uncaughtException|unhandledRejection|must be safe integers|must be finite numbers|RangeError|TypeError|is not a function|Cannot read prop|"level":"fatal"'
BENIGN='Game not found|UniqueConstraintError|Journal append failed'

stamp() { date '+%F %T'; }

find_server_log() {
    local pid
    pid=$(lsof -ti :"$PORT" -sTCP:LISTEN 2>/dev/null | head -1)
    [ -z "$pid" ] && return 1
    # Pick the server's own log fd (a regular .log file it has open for writing).
    lsof -p "$pid" 2>/dev/null | awk '$4 ~ /w/ && $NF ~ /\.log$/ {print $NF}' | head -1
}

echo "[$(stamp)] watchdog started (port $PORT); anomalies -> $ANOM" >> "$ANOM"

CUR_LOG=""
LAST=0
DOWN=0
while true; do
    LOG=$(find_server_log)
    if [ -z "$LOG" ]; then
        DOWN=$((DOWN + 1))
        if [ "$DOWN" -eq 3 ]; then   # ~9s down: real exit, not a restart gap (report once)
            echo "[$(stamp)] ANOMALY: server not listening on :$PORT (crash or unexpected exit)" >> "$ANOM"
            [ -n "$CUR_LOG" ] && [ -f "$CUR_LOG" ] && { echo "--- tail $CUR_LOG ---" >> "$ANOM"; tail -20 "$CUR_LOG" >> "$ANOM"; }
        fi
        sleep "$POLL"
        continue
    fi
    DOWN=0
    if [ "$LOG" != "$CUR_LOG" ]; then
        [ -n "$CUR_LOG" ] && echo "[$(stamp)] server log is now $LOG" >> "$ANOM"
        CUR_LOG="$LOG"
        LAST=$(wc -l < "$LOG" 2>/dev/null || echo 0)
    fi
    NOW=$(wc -l < "$LOG" 2>/dev/null || echo 0)
    [ "$NOW" -lt "$LAST" ] && LAST=0   # log truncated (server restarted onto same path)
    if [ "$NOW" -gt "$LAST" ]; then
        HITS=$(sed -n "$((LAST + 1)),${NOW}p" "$LOG" 2>/dev/null | grep -iE "$FATAL" | grep -viE "$BENIGN")
        if [ -n "$HITS" ]; then
            echo "[$(stamp)] FATAL ANOMALY in $LOG:" >> "$ANOM"
            echo "$HITS" | head -25 >> "$ANOM"
        fi
        LAST=$NOW
    fi
    sleep "$POLL"
done
