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

## 3. Opponent connection state is invisible in a fight — done

- The play session emits `PLAYER_CONNECTED` / `PLAYER_DISCONNECTED`, runs a 30 s AI takeover and a
  forfeit window, but the fight HUD never said "opponent disconnected, AI takes over in 20 s" or "opponent
  is back". Players read the pause as the game freezing.
- Shipped: each seat in the play snapshot now carries `aiTakeoverAtMs` / `forfeitAtMs` (server time,
  0 when nothing is pending); `OpponentConnectionBadge` under the matchup strip reads "Opponent
  disconnected · AI takes over in 12s", "… · the AI is playing their turns · forfeits in 2:31", and a
  five-second "Opponent is back". Observers see every human seat by colour; bot seats are skipped.

## 4. Invites have no lifecycle — done

- A `sandbox_invite` / `lobby_invite` was a bare notification: nothing marked it accepted or pointing at
  a room that already closed, so stale invites stayed clickable and dead-ended on an error screen.
- Shipped: joining stamps `acceptedAt` on the invite (sandbox join on the game role, lobby join on mm);
  the tray lists invites with `roomOpen`, resolved at read time — lobbies from their document status,
  sandboxes from a Redis marker the game role writes on open/close (`game/v1/sandbox_rooms.ts`) since the
  session lives in another process. A closed room's invite is greyed, non-clickable and labelled
  "· closed"; an accepted one reads "· accepted" while the room stays open.
- Still open: telling the inviter their invite was accepted, and a decline action.

## 5. No rematch after a friendly game — done (co-op sandbox)

- Ranked has "play again vs AI"; a finished co-op sandbox only offered a way back.
- Shipped: a Rematch button on the results overlay for co-op seats — whoever presses it hosts a fresh
  sandbox with the same friend in the other seat, and the friend gets the usual invite toast.
- Still open: a lobby rematch (lobby creation charges season gold, so it needs its own confirmation).

## 6. Presence is too coarse for coordinating — done

- Friends showed online / offline / in game only.
- Shipped: each presence ping reports what the tab is doing (route-derived: sandbox, co-op sandbox, arena,
  lobby + its id, browsing lobbies, spectating, portal); the server keeps it while the player is online and
  reads the matchmaking queue from the player document. The friend row now says "In the queue", "In a
  lobby" (with a Join lobby button while that room is joinable and you are free), "In the sandbox",
  "In a co-op sandbox", "In the arena", "Spectating"; the friends dock button carries a green count of
  friends online, which the ping returns.

## 7. Co-op sandboxes die on deploy — done

- Ranked fights persisted a restart state and resumed after a server restart; sandbox sessions lived only
  in memory, so a deploy ended every co-op session with "game not found".
- Shipped: sandbox sessions use the same throttled restart save (their save carries the two seats and the
  map, since there is no game document); an unknown game id is first checked against a saved sandbox
  before the game-document lookup, and `sandbox-join` restores on demand. Verified: a restart mid-placement
  came back with all placed units, ready flags and no placement clock.

## 8. Smaller co-op gaps — partly done

- Done: the co-op sandbox opens on the host's current map, and the green army the host had already placed
  in the offline sandbox is carried over (stored per tab when the invite is sent, replayed once as ordinary
  placements when the co-op board first shows the host an empty army). A rematch keeps the map.
- Done (staging feedback round): the co-op board uses the ranked pieces instead of bespoke ones — the
  matchup strip (green vs red, Ready / Not ready / Away per seat, a Leave button while setting up) and the
  standard READY PLACEMENT button, which toggles back with CANCEL READY. Artifacts and either synergy
  variant are pickable in the sidebar (server: sandbox-only ARTIFACT action; synergy variant check relaxed
  for sandboxes; both seats see each other's picks). S splits and D deletes the selected stack, as in the
  offline sandbox (ranked gets the same keys with D arming first). A friend's placement no longer drops
  the host's roster pick or in-progress drag (selection survives the board rebuild).
- Done (second staging round): synergies really work — the sidebar has the sandbox's synergy slots, a
  chosen variant is remembered by the server across recounts and is what the army fights with, and the
  highlight survives a reload; artifacts fold into every unit at fight start (verified over HTTP through
  fight start). Either seat switches the shared map (NORMAL / FIRE PIT / BARRELS) from the sidebar; the
  other seat's board and picker follow.
- Open: one friend per sandbox; no in-match text chat (the social dock collapses during a fight, DMs are
  behind the medallion).

## 9. A loading screen right before the augment step — done

- The draft's last phase hands off to the fight view, which boots Pixi behind a loader that held for a
  fixed 2 s on every route (a sandbox-only minimum applied everywhere), after a poll that checked for the
  play session only every 2 s. The loader now lasts only as long as the assets take on ranked and co-op
  boards, and the handoff poll runs every 0.75 s once the draft reaches its final phase.
