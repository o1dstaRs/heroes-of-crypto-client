#!/usr/bin/env bash
# Process-sharded AI-meta simulation: WORKERS fight workers per pair-window process, PROCS at a time.
# Bun Worker threads inside one process contend on a runtime futex (24 workers ran at ~35% CPU each on puffalo,
# 0.55 fights/s); separate processes do not (~2 fights/s on the same host). Pair seeds are global, so the windows
# tile each cohort exactly like the pooled runner. Merge afterwards with merge_ai_meta_shards.ts.
#
# Environment: ROOT (heroes-of-crypto-common root), RUN (fresh shard directory), GAMES, SEED, PROFILE,
# PROCS, WINDOW (pairs per process), COHORTS (CSV), BUN_DIR (optional bun directory to prepend to PATH).
# AI_META_PAIR_START / AI_META_PAIR_END optionally register a subset of the same fixed pair bank.
set -uo pipefail
if [ -n "${BUN_DIR:-}" ]; then
  export PATH=$BUN_DIR:$PATH
fi
ROOT=${ROOT:?}
RUN=${RUN:?}
GAMES=${GAMES:-1008}
SEED=${SEED:-85000717}
PROFILE=${PROFILE:?}
PROCS=${PROCS:-8}
WORKERS=${WORKERS:-1}
WINDOW=${WINDOW:-12}
COHORTS=${COHORTS:-ranked-draft,uniform-mixed,ranged-heavy,ground-melee,flyer-heavy,caster-support,cross-archetype}
LOG=$RUN/driver.log
PAIRS=$((GAMES / 2))
PAIR_START=${AI_META_PAIR_START:-0}
PAIR_END=${AI_META_PAIR_END:-$PAIRS}
if ! [[ $PAIR_START =~ ^(0|[1-9][0-9]*)$ && $PAIR_END =~ ^[1-9][0-9]*$ ]] ||
   ! ((PAIR_START < PAIR_END && PAIR_END <= PAIRS && PAIR_START % WINDOW == 0 &&
       (PAIR_END == PAIRS || PAIR_END % WINDOW == 0))); then
  echo "invalid pair range [$PAIR_START, $PAIR_END) for $PAIRS pairs and window $WINDOW" >&2
  exit 2
fi

if [ -e "$RUN" ] && [ -n "$(ls -A "$RUN" 2>/dev/null)" ] && [ "${AI_META_RESUME:-0}" != 1 ]; then
  echo "refusing non-empty shard directory $RUN" >&2
  exit 2
fi
mkdir -p "$RUN/shards"
python3 - "$RUN" "$$" <<'PYLOCK'
import json,os,socket,sys,time
from pathlib import Path
root=Path(sys.argv[1]); lock=root/'driver.lock.json'; pid=int(sys.argv[2]); host=socket.gethostname()
def alive(row):
 if row.get('host') != host: raise RuntimeError('Foreign driver/worker lock; coordinate before resuming')
 try: os.kill(int(row['pid']),0); return True
 except ProcessLookupError: return False
if lock.exists():
 if alive(json.loads(lock.read_text())): raise RuntimeError('Shard driver is already active')
 if os.environ.get('AI_META_RESUME') != '1': raise RuntimeError('Explicit resume required for stale driver')
 for child in (root/'shards').glob('*/collection.lock.json'):
  if alive(json.loads(child.read_text())): raise RuntimeError('Owned shard is still active; do not duplicate it')
 lock.rename(str(lock)+'.history-'+str(time.time_ns()))
with lock.open('x') as out: json.dump({'pid':pid,'host':host},out);out.flush();os.fsync(out.fileno())
PYLOCK
[ "$?" -eq 0 ] || exit 2
trap 'python3 - "$RUN/driver.lock.json" "$$" <<"PYUNLOCK"
import json,sys
from pathlib import Path
p=Path(sys.argv[1])
if p.exists() and json.loads(p.read_text()).get("pid")==int(sys.argv[2]): p.unlink()
PYUNLOCK
' EXIT
cd "$ROOT" || exit 2
# Register the whole tiled job before starting any windows; never mix a new source on resume.
export RUN GAMES SEED PROFILE PROCS WORKERS WINDOW COHORTS
bun -e 'import {readFileSync,existsSync,writeFileSync} from "node:fs"; import {captureAiMetaSourceIdentity,resolveAiMetaFightProfile} from "./src/simulation/measure_ai_meta_cohorts"; const keys=["GAMES","SEED","PROFILE","PROCS","WORKERS","WINDOW","COHORTS","AI_META_PAIR_START","AI_META_PAIR_END"];const path=process.env.RUN+"/driver-registration.json";const identity={schema:"ai-meta-driver-v1",arguments:Object.fromEntries(keys.map(k=>[k,process.env[k]])),source:captureAiMetaSourceIdentity(),profile:resolveAiMetaFightProfile(process.env.PROFILE)};const text=JSON.stringify(identity);if(existsSync(path)){if(readFileSync(path,"utf8")!==text)throw new Error("Shard driver source or fixed cases changed");}else writeFileSync(path,text,{flag:"wx"});' || exit 2
echo "START $(date -u +%FT%TZ) root=$ROOT commit=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["source"]["commonCommit"])' "$RUN/driver-registration.json") dirty=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["source"]["commonDirty"])' "$RUN/driver-registration.json") bun=$(bun --version) games=$GAMES seed=$SEED profile=$PROFILE procs=$PROCS workers=$WORKERS window=$WINDOW gc_markers=${BUN_JSC_numberOfGCMarkers:-default} cohorts=$COHORTS" >> "$LOG"

START_MONOTONIC=$(python3 -c 'import time; print(time.monotonic())')
START_UTC=$(date -u +%FT%TZ)
export START_MONOTONIC START_UTC
: > "$RUN/jobs.txt"
for ((s = PAIR_START; s < PAIR_END; s += WINDOW)); do
  n=$((PAIR_END - s < WINDOW ? PAIR_END - s : WINDOW))
  for c in ${COHORTS//,/ }; do echo "$c $s $n" >> "$RUN/jobs.txt"; done
done

run_job() {
  local c=$1 s=$2 n=$3 attempt d
  d=$RUN/shards/$c-$(printf %05d "$s")-a1
  for attempt in 1 2 3; do
    local resume=0
    [ -f "$d/collection-registration.json" ] && resume=1
    if AI_META_RESUME=$resume AI_META_SHARD=1 bun src/simulation/measure_ai_meta_cohorts.ts "$GAMES" "$SEED" "$d" "$WORKERS" "$c" 1 "$PROFILE" "$s" "$n" >> "$d.log" 2>&1; then
      echo "OK $c $s $n a$attempt $(date -u +%TZ)"
      return 0
    fi
    echo "FAIL $c $s $n a$attempt $(date -u +%TZ)"
  done
  return 1
}
export -f run_job
export RUN GAMES SEED PROFILE WORKERS PROCS

xargs -P "$PROCS" -L 1 bash -c 'run_job "$0" "$1" "$2"' < "$RUN/jobs.txt" >> "$RUN/jobs.log" 2>&1
rc=$?
echo "EXIT rc=$rc ok=$(grep -c '^OK' "$RUN/jobs.log") fail=$(grep -c '^FAIL' "$RUN/jobs.log") jobs=$(wc -l < "$RUN/jobs.txt") $(date -u +%FT%TZ)" >> "$LOG"
python3 - "$RUN/timing.json" "$rc" <<'PYTIMING'
import json, os, sys, time
from datetime import datetime, timezone
target=sys.argv[1]
if os.path.exists(target): os.rename(target,target+".history-"+str(time.time_ns()))
json.dump({"startedAt": os.environ["START_UTC"], "finishedAt": datetime.now(timezone.utc).isoformat(), "wallSeconds": time.monotonic()-float(os.environ["START_MONOTONIC"]), "exitCode": int(sys.argv[2]), "processes": int(os.environ["PROCS"]), "workersPerProcess": int(os.environ["WORKERS"]), "gcMarkers": os.environ.get("BUN_JSC_numberOfGCMarkers")}, open(target, "x"), indent=2)
PYTIMING
[ "$rc" -eq 0 ]
