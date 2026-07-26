#!/bin/bash
# mklink.sh <tabIndex> <difficulty> -> prints deep link for that seeded tab account
SP="${HUNT409_DIR:-$(cd "$(dirname "$0")" && pwd)}"
EMAIL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SP/tabs.json')).accounts[$1].email)")
ENC=$(python3 -c "import urllib.parse;print(urllib.parse.quote('$EMAIL'))")
echo "http://localhost:5191/play?mode=vs-ai&difficulty=$2&e2eEmail=$ENC&e2ePassword=Password1!"
