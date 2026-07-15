---
name: heroes-e2e
description: Start a local end-to-end Heroes of Crypto match and generate browser join links. Supports human-vs-human multiplayer (real pick/ban -> play, two links GREEN/LOWER + RED/UPPER) and single-human "Play vs AI" (one link, AI opponent drives picks/placement/fight). Use when the user asks to start an e2e game, test multiplayer, or play/test against the AI.
---

# Heroes of Crypto — Local E2E Multiplayer (pick-phase)

Boots the full local stack and creates a **real multiplayer match** that starts at the
pick & ban phase, then play. Prints two browser links — one per team. Each browser
auto-logs-in as its player and lands directly in the match.

## Stack

```
ArangoDB + Redis (Docker)  ->  server :3001  ->  game client :5174
```

- **ArangoDB** (`hoc-arangodb`, :8529, root/`ChangeMe`) — persistence. Server creates
  the `cryptopulse` db + all `*Test1` collections on first boot.
- **Redis** (`hoc-redis`, :6379) — sessions/queues/SSE pub-sub. **Required**: without it,
  `/v1/auth/login` hangs and times out (408).
- **server** — `bun index.ts` in `heroes-of-crypto-server`.
- **client** — vite dev server, started with `--port 5174 --strictPort`.

## How a pick-phase match is created

`simple_client/create_pick_match.ts`:
1. Seeds two **active** players directly in the DB (bcrypt password via the server's
   `hashPassword`) — Green=LOWER, Red=UPPER — each with `inGameId` set.
2. Inserts a `CONFIRMING` game linking them.
3. Logs both in over HTTP and POSTs `/v1/game/confirm/<gameId>` for each. The **running
   server** promotes the game to `PICK` (GameStatus.PICK=2) and its daemon initializes
   the Pick document. (Confirm MUST go through the live server — promotion enqueues to
   that process's in-memory `confirmedGamesQueue`.)
4. Prints two links of the form:
   `http://localhost:5174/game/<gameId>?e2eEmail=<email>&e2ePassword=Password1!`

The `?e2eEmail=&e2ePassword=` dev auto-login (`auth_provider.tsx`, enabled when not PROD)
authenticates the browser so `getCurrentGame()` returns the PICK game → the client renders
PickAndBanView. (The earlier `?e2ePlayerId=` observer links only work for the *play* phase
and show an empty board during pick — don't use them for pick.)

## Usage

```bash
.claude/skills/heroes-e2e/scripts/hoc-e2e.sh match       # human-vs-human: full pick/ban -> play match, print TWO links
.claude/skills/heroes-e2e/scripts/hoc-e2e.sh vs-ai       # human-vs-AI: ONE link, opens in pick phase against the bot
.claude/skills/heroes-e2e/scripts/hoc-e2e.sh placement   # SKIP pick/ban: start in placement, randomized rosters
.claude/skills/heroes-e2e/scripts/hoc-e2e.sh status      # what's running (incl. monitor)
.claude/skills/heroes-e2e/scripts/hoc-e2e.sh monitor     # start watchdog (if needed) + print recorded anomalies
.claude/skills/heroes-e2e/scripts/hoc-e2e.sh cleanup     # stop server + client + monitor (leaves DB containers)
```

### `vs-ai` mode (play against the AI, from picks)

One-command "Play vs AI": brings up the stack, seeds a single active player, and prints **one**
auto-login deep link:

```
http://localhost:5174/play?mode=vs-ai&e2eEmail=<email>&e2ePassword=Password1!
```

Open it in one browser. It auto-logs-in and the client's `/play?mode=vs-ai` deep link fires the real
**Play vs AI** button path (`MatchmakingRoute`): `createVsAiGame()` → `POST /v1/mm/vs-ai` creates a
PICK-status game with the human on one team and a persistent bot seat (`ai:<version>:default` playerId)
on the other. From there the **server drives the AI end-to-end** — the pick-phase daemon takes the
bot's draft turns immediately, and the play session pins the bot seat `aiControlled` so it auto-places
its army and runs every fight turn. No opponent browser needed; the human just plays their own side.

The bot's AI version is the shipped `DEFAULT_AI_VERSION`; override a fresh server start with
`HOC_VS_AI_VERSION=v0.6 .../hoc-e2e.sh vs-ai` (any registered `AI_VERSIONS` value). Run `cleanup` before
changing the version if the server is already up. Helper:
`heroes-of-crypto-server/simple_client/create_vs_ai_match.ts`. Each run seeds a fresh player — re-run
for a new match. The entire vs-AI feature (client button + deep link + server ingress + bot driving)
is shipped product code; this mode is just a convenience launcher around it.

### Server-log monitoring (always-on)

`match` and `placement` auto-start a detached **watchdog** (`scripts/hoc-monitor.sh`) that keeps watching the
server for the whole session. It **self-discovers** the running server's log file via `lsof` on the listening
pid (robust to whichever launcher started the server, and to different log paths), scans new lines for FATAL
anomalies (`uncaught_exception`, `RangeError`, `must be safe integers`, …), and detects crashes (port gone
for ~9s). Findings are appended, timestamped, to `$HOC_ANOMALY_LOG` (default `/private/tmp/hoc-anomalies.log`);
known-benign noise (`Game not found`, journal dedup) is ignored, and intentional SIGTERM restarts are not
flagged. **Check it any time** with `hoc-e2e.sh monitor` (or `tail -f /private/tmp/hoc-anomalies.log`). This
exists because a server that dies on an uncaught exception otherwise fails silently — every in-flight game
just "gets stuck" with no board updates.

### `placement` mode (fast iteration)

Skips pick/ban via `POST /v1/game/play-dev-create` and drops both players straight
into the **placement** phase. Each team gets a randomized roster of **2× L1, 2× L2,
1× L3, 1× L4** creatures (the game's standard `CreaturePoolByLevel = [2,2,1,1]`), and a
couple of each side's creatures are revealed to the opponent. Helper:
`heroes-of-crypto-server/simple_client/create_play_match.ts`.

These are **observer-style** links (`?e2ePlayerId=<uuid>`), which are fully playable in
dev (play-action is public in non-prod). No player registration needed — faster than the
pick flow. Env overrides: `HOC_UNIT_AMOUNT` (stack size, default 7),
`HOC_PLACEMENT_SECONDS` (default 180).

Present the output as two labelled links — GREEN in one browser, RED in the other.
Each `match` run creates a fresh game + fresh players; re-run for a new match.

## Requirements / gotchas

- Repos side by side under `~/Workplace/` (`heroes-of-crypto-client`, `heroes-of-crypto-server`).
  Override with `HOC_CLIENT_DIR` / `HOC_SERVER_DIR`.
- A working **container runtime** (Docker Desktop). If its VM is corrupted (writes fail with
  `input/output error`), reset it: quit Docker, delete
  `~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw`, relaunch (wipes all
  Docker data — the DB rebuilds from scratch, which is fine here).
- Apple `container` is **not** an option on macOS 15 (needs macOS 26 + has no host port
  forwarding the server can use).
- `timeout` is not installed on macOS by default — don't rely on it in probes.
- Team colors: **LOWER = Green (team 2)**, **UPPER = Red (team 1)**.

## Tuning

Edit `simple_client/create_pick_match.ts`: starting creatures (`lowerCreatureIds` /
`upperCreatureIds` are applied later in the play phase), password, emails.
