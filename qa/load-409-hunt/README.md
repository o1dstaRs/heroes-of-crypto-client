# load-409-hunt — fight-finish 409 desync load-reproduction harness

Hunts the W5-documented ranked defect: the fight-finished overlay's **"Play Again vs AI"** races the
server's fire-and-forget result write (`play_session.ts tryWriteGameResult` ->
`finishGameWithoutRating`: game doc -> FINISHED + both `inGameId`s released). A click inside the
window gets **409 "Player is already in game"** from `POST /v1/mm/vs-ai`
(`saveGameAndClaimPlayers`). The client retries 4x/~5-7s (e241fc0); beyond that the user sees a raw
error on the overlay.

## Verdict (2026-07-16 run — see `docs/v0_7_plan.html` §8 in common for the full entry)

**BOUNDED-NOT-REPRODUCIBLE under maximum realistic load.** 51/51 sharp same-tab Play-Again cycles
(click 10-40ms after the button rendered), 0 race 409s, 0 repro events; across ALL 81 fight
finishes of the run (tabs + ghosts) the release window (`fight_finished` -> `inGameId` cleared) was
p50 0.06s / p90 0.11s / **max 0.13s**, 100% persisted (0 write failures, 0 no-ops, 0 stuck
memberships in the post-run sweep) — vs the >=0.21s (typically 1-4s) it takes the overlay button to
render at all. Load: loadavg 30-37 on 16 cores (two sim tournaments + 5 SwiftShader Chrome tabs),
12 concurrent ghost vs-AI matches, brutal-tier in-server search, ArangoDB at 54-86% CPU under
~500-950 targeted write-tx/s.

Fault-injection demo (`fault_inject_demo.mjs`, NOT load repro): with `inGameId` re-pinned for 20s
at overlay time, the click produced the exact W5 UX — 4x409 over ~4.8s -> overlay error "Already in
game" — and rapid re-clicking then tripped the per-route rate limit (429 "Rate limit exceeded"),
extending the outage past the pin itself; the next re-click after cool-down got 201 and navigated.
So IF the release ever genuinely lags (the code holes below), the user sees a raw error and an
impatient user makes it worse — but recovery is one calm re-click away, provided the doc DID get
settled. In hole (1) below nothing settles it, and /play re-enters the dead game: the true brick.

The minutes-scale W5 instance is NOT plain-load-reachable. The plausible mechanisms (code holes,
unfixed by design until reproduced — these are the watch-signals):

1. `tryWriteGameResult` sets `resultWritten = true` before the write settles and only re-arms the
   tick-retry in `.catch()`. A write that **never settles** (hung Arango request — no client
   timeout) => no retry, no log, `inGameId` stuck. Silent — matches the W5 signature.
2. The `persisted=false` no-op branch (doc not in PLAY) also never re-arms and doesn't clear
   `inGameId`.
3. Client `handlePlayAgainVsAi` lacks the `getCurrentGame()` self-heal fallback MatchmakingRoute
   has; after retry exhaustion the user sees a raw error. "Back to Lobby" recovers only if the doc
   did get settled; in hole (1) `/play` re-enters the dead game forever.

## Scripts

All Node/Bun, no packages beyond a Playwright install (edit the import path at the top of
`tab_driver.mjs` / `fault_inject_demo.mjs`). Run against an **isolated stack** only
(fresh `HOC_SERVER_PORT` / `HOC_ARANGODB_DB` / `HOC_REDIS_DB` / vite port, and
`HOC_RATE_LIMIT_MULTIPLIER=100` — 5 tabs + 12 ghosts from one IP blow the default dev budget).

- `seed_accounts.ts` — seed N login-ready players (bun; needs `HOC_ARANGODB_*` env).
- `tab_driver.mjs <link> <outdir> <cycles> <tag>` — the race driver: rides full vs-AI matches
  (clicks the pick phase, Ready Placement, `__hocSetAI` autobattle), clicks Play Again the instant
  the overlay button renders (120ms poll), records every `/v1/mm/vs-ai` attempt + user-visible
  errors, and survives the known same-tab Pixi-teardown wedge (timeout-raced page calls + hard
  recovery via reload/page replacement).
- `ghosts.mjs` — M never-connecting vs-AI matches (server plays both sides; sustained load).
- `arango_pressure.mjs` — targeted transactional write pressure on the same DB.
- `db_poller.mjs` — 100ms watcher: `player.inGameId` + game `{status,finished}` transitions.
- `analyze.mjs <serverLog> <dbWatch> <cycles...>` — joins the three streams into per-cycle
  writeWindow/releaseWindow/overlayLead/clickDelta + race-hit/repro verdicts.
- `fault_inject_demo.mjs` — NOT load repro: re-pins `inGameId` at overlay time to demonstrate the
  user-facing failure mode a genuinely delayed release produces.
- `run_l2.sh` / `mklink.sh` / `tslog.mjs` — launcher, deep-link builder, timestamp pipe.
- `prereg.md` — the preregistered protocol + verdict criteria this was run under.

Repro-defining criteria (preregistered): R1 = client retry chain exhausts into a user-visible
error; R2 = release window > 10s; R3 = game stuck `status=PLAY/finished=false` > 120s after the
overlay. Bound = >=40 cycles at max load with zero R1/R2/R3.
