#!/bin/bash
# L2/L3 launcher: 12 ghosts + 4 same-tab Play Again tabs (2 normal, 2 brutal), 12 cycles each.
set -u
SP="${HUNT409_DIR:-$(cd "$(dirname "$0")" && pwd)}"
mkdir -p $SP/logs/l2
cd $SP
nohup node ghosts.mjs $SP/ghosts.json http://127.0.0.1:3021 $SP/logs/l2/ghosts.jsonl "normal,hard,brutal" >> $SP/logs/l2/ghosts.err 2>&1 &
echo "ghosts pid $!"
DIFFS=(normal brutal normal brutal)
for i in 0 1 2 3; do
  LINK=$($SP/mklink.sh $((i+1)) ${DIFFS[$i]})
  nohup node tab_driver.mjs "$LINK" $SP/logs/l2 12 tab$((i+1)) >> $SP/logs/l2/tab$((i+1)).stdout 2>&1 &
  echo "tab$((i+1)) (${DIFFS[$i]}) pid $!"
  sleep 20
done
