# Multiplayer usability backlog

Gaps in the online experience noticed while building the friend co-op sandbox and the friends-list
"in game / Spectate" row (2026-09-12). Ordered by how many players each one is likely to lose.
Status legend: **done** shipped, **open** not started.

## 1. Invites and turns arrive late or silently — done

- Notifications were poll-only on a 25 s presence ping, so a sandbox or lobby invite could sit unseen
  for half a minute while the inviter waited, and there was no in-app prompt, only the tray badge.
- Nothing told a player in a backgrounded tab that it was their turn.
- Shipped: the presence ping runs every 8 s while the tab is visible and focused (25 s otherwise, and
  immediately on focus); a fresh sandbox/lobby invite raises a Join / Later toast; the ranked board plays
  the notification chime when a turn becomes yours and, if the tab is not being watched, flashes the tab
  title and sends an OS notification (same permission the match-ready alert already asks for).
- Still open: true push. The matchmaking SSE stream only lives while queueing; a per-player social event
  stream (Redis fan-out like `lobby_events`) would replace the poll entirely.

## 2. No obvious way back into a game in progress — done

- The server knew the player's live game (`players.inGameId`), but outside the portal sidebar nothing
  offered a way back after a reload or a stray navigation.
- Shipped: the presence ping now reports the caller's live game and its stage; `LiveMatchBanner` shows
  "Match found — accept it in the arena / Your draft is in progress / Your fight is in progress" with a
  Return button on every screen except that game's own route.

## 3. Opponent connection state is invisible in a fight — open

- The play session emits `PLAYER_CONNECTED` / `PLAYER_DISCONNECTED`, runs a 30 s AI takeover and a
  forfeit window, but the fight HUD never says "opponent disconnected, AI takes over in 20 s" or "opponent
  is back". Players read the pause as the game freezing.
- Approach: reuse the co-op banner's seat-status strip (`SandboxCoopBanner`) as a general opponent
  indicator fed by `snapshot.players[].connected` / `lastSeenMs` and the takeover deadline.

## 4. Invites have no lifecycle — open

- A `sandbox_invite` / `lobby_invite` is a bare notification: nothing marks it accepted, expired, or
  pointing at a room that already closed, so stale invites stay clickable and dead-end on an error screen.
- Approach: store `acceptedAt` / `expiredAt` on the notification (or resolve the room's liveness when the
  tray lists it), grey out dead invites, and let the inviter see "accepted / declined".

## 5. No rematch after a friendly game — open

- Ranked has "play again vs AI"; a finished co-op sandbox or lobby game only offers a way back.
- Approach: a Rematch button on the results overlay that re-opens a sandbox (or lobby) with the same seats
  and re-invites the friend.

## 6. Presence is too coarse for coordinating — open

- Friends show online / offline / in game, but "in a lobby", "in the queue" and "in the sandbox" are
  invisible, there is no reverse "Join their lobby" action from the friend row, and no friends-online count
  outside the panel.
- Approach: extend the presence tracker with an activity kind published by the client on route change.

## 7. Co-op sandboxes die on deploy — open

- Ranked fights persist a restart state and resume after a server restart; sandbox sessions live only in
  memory, so a deploy ends every co-op session with "game not found".
- Approach: extend `session_state_store` persistence (currently gated on `fromGameDocument`) to sandbox
  sessions, keyed by session id, with a short TTL.

## 8. Smaller co-op gaps — open

- One friend per sandbox; no map choice; the host's local sandbox placements are dropped when inviting;
  no in-match text chat (the social dock collapses during a fight, DMs are behind the medallion).
