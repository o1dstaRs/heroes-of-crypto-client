# 409 fight-finish desync — load-reproduction preregistration (2026-07-15)

## Defect under hunt (W5, plan §8)
Client shows the fight-finished overlay (winnerByAliveTotals / fight_finished SSE) with a live
"Play Again vs AI" button BEFORE the server's fire-and-forget `tryWriteGameResult`
(play_session.ts -> finishGameWithoutRating) commits `game.finished=true` + releases
`player.inGameId`. A click in that window makes POST /v1/mm/vs-ai 409 "Player is already in game".
Client already retries 4x with backoff (e241fc0, ~5-7s total). W5 observed one MINUTES-plus
instance under heavy host load; nightly QA under no load never reproduced it.

## Isolated stack (never touches :3001/:3033/vite 5173-5175/5199/zinc/peer procs)
- ArangoDB db `cryptopulse_hunt409` (fresh), Redis db 13 (empty), server :3021, vite :5191.
- Server launched from ~/Workplace/heroes-of-crypto-server with env overrides only (committed tree,
  no file changes). HOC_AI_TAKEOVER_MS=5000 (ghost seats), journal full ON (dev default).

## Load levels
- L0 shakeout: 1 test tab, no ghosts, ambient host load only. 3 cycles. Purpose: harness works,
  baseline desync-window measurement.
- L2 probe: 4 test tabs (2 normal, 2 brutal), 8 ghost vs-AI matches (never-connecting humans,
  AI-takeover), ambient peer tournament (~14.6 cores busy at prereg time). ~8 cycles.
- L3 max: L2 + my own sim tournament (run_tournament v0.6 v0.7, base seed 86000710, concurrency 6)
  + 5th/6th test tab if stable. Grind to >=40 total same-tab Play Again cycles at L2/L3.
  If the ambient peer tournament exits mid-run, my own tournament concurrency rises to 12 to keep
  the host saturated (documented in the run log).

## Per-cycle measurements
- t_finish: first poll where __hocVisibleState().hasFinished (client overlay gate), browser clock.
- t_click: Play Again click (immediately when button visible; 100-150ms poll).
- Network: every POST /v1/mm/vs-ai attempt with status + latency (Grade-A race hits = 409s that a
  later retry recovers).
- t_nav: navigation to the new /game/<id>.
- DB poller (100ms): test players' inGameId set/clear transitions + game doc {status, finished}
  transitions -> desync window = t(inGameId cleared) - t(game session fight_finished per server log).
- Server log (timestamped): [PLAY-LIFECYCLE] fight_finished, [FIGHT-RESULT] no-op warnings,
  "Failed to write game result", [vs-ai] creations.

## Preregistered verdict criteria
- REPRODUCED (defect) if ANY of:
  R1. A click chain exhausts the client's 4-attempt retry and surfaces the overlay error
      (user-visible failure), i.e. 409s persist > ~7s;
  R2. desync window (fight_finished -> inGameId cleared) > 10s on any cycle;
  R3. any game stuck status=PLAY/finished=false > 120s after client overlay (W5's brick).
- RACE-HIT (not itself the defect; evidence the window is being exercised): >=1 409 inside a
  chain that then succeeds within the built-in retries.
- BOUNDED-NOT-REPRODUCIBLE if >=40 cycles at L2/L3 with 0 REPRO events; report the RACE-HIT rate
  and the full desync-window distribution as the bound + watch-signal.

## Seeds
Sim tournament base seed 86000710 (86xxx710 family per shared rules; load-only, no measurement
claims ride on it). No fight-internals touched; no flips; no prod.
