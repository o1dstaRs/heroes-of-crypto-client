# MCP Game Layer Design

Goal: let AI models act as the in-game AI brain for Heroes of Crypto through the same shared rules engine used by the browser client, without giving models private state, filesystem access, or a separate rules implementation.

The intended product use is:

- player clicks the AI toggle in `Sandbox`
- player starts a match against PC
- opponent disconnects or times out
- server needs a bot to temporarily or permanently control one side

In all cases, the model represents the AI player. It should not simulate rules by itself. The game creates a compact state plus legal actions, the model chooses one action, and the game applies that action through `@heroesofcrypto/common`.

This layer should be a headless AI-driver adapter exposed through MCP tools/resources for model hosts and through a small game-facing API for the browser/server. The authoritative game runtime validates every action with `GameActionEngine` and returns events plus the next public state.

## Current Code Boundary

The right dependency boundary is `game/heroes-of-crypto-common`.

Useful existing surfaces:

- `GameAction` in `src/engine/actions.ts`: the canonical command union.
- `GameActionEngine` in `src/engine/action_engine.ts`: validates and applies commands.
- `GameEvent` in `src/engine/events.ts`: canonical result events.
- `TurnEngine` in `src/engine/turn_engine.ts`: turn queue, lap transitions, narrowing, Armageddon, finish checks.
- `FightProperties.serialize()` / `deserialize()`: fight-level persistence.
- `UnitsHolder`, `Grid`, `MoveHandler`, `AttackHandler`, `PathHelper`: the state and rule helpers needed for legal action generation.
- `AI.findTarget(...)`: an existing simple AI heuristic that can be reused as an MCP tool, but should not be the model interface.

Avoid coupling MCP to `game/core/src/scenes/Sandbox.ts`. The client scene owns Pixi rendering, animation, hover state, overlays, and mouse affordances. MCP needs the same rules, not the same UI.

## Actual Runtime Shape

There are two related pieces.

### 1. Game AI Driver

This is what the game calls when it needs a model to act for a team.

```ts
interface GameAIPlayer {
  decideTurn(input: AITurnRequest): Promise<AITurnDecision>;
}

type AITurnRequest = {
  matchId: string;
  team: "LOWER" | "UPPER";
  reason: "sandbox_toggle" | "pc_opponent" | "opponent_timeout" | "opponent_disconnected" | "server_bot";
  timeBudgetMs: number;
  style?: "balanced" | "aggressive" | "defensive";
  state: PublicMatchState;
  legalActions: LegalAction[];
};

type AITurnDecision = {
  actionId: string;
  confidence?: number;
  explanation?: string;
};
```

For `Sandbox`, this can replace or sit behind the current `AIController.performAction()` path:

1. Build legal actions for the current active unit.
2. Send `AITurnRequest` to a local/dev AI service or hosted endpoint.
3. Receive `actionId`.
4. Resolve it back to the canonical `GameAction`.
5. Call `applyGameAction(action)` exactly as the existing UI and AI do.
6. If the model times out or returns an invalid action, fall back to existing `AI.findTarget(...)` or `end_turn`.

The browser client should not open stdio MCP directly. For browser play, use HTTP/WebSocket to a game AI service. That service can be the MCP host that runs the model with the game tools.

### 2. MCP Tool Server For The Model Host

This is what the model uses internally to inspect state and choose legal actions.

The MCP server exposes game context to the model host:

- resources for rules/unit references
- tools for `get_state`, `list_legal_actions`, and optionally `submit_action`
- prompts like `play-turn`

For model-as-AI mode, prefer a choose-only loop:

- model reads state and legal actions
- model returns an `actionId`
- game runtime applies the action

Direct `submit_action` is still useful for fully headless model-vs-model benchmarks or server-owned bot seats, but the safer default for `Sandbox` and multiplayer fallback is to let the game apply the chosen action.

## Implemented Package Shape

The first implementation lives in the workspace package `@heroesofcrypto/mcp`:

```text
game/mcp/
  package.json
  tsconfig.json
  src/
    index.ts
    server.ts
    session_store.ts
    headless_match.ts
    serializers.ts
    legal_actions.ts
    model_ai.ts
    runtime.ts
    scene_log.ts
    test_units.ts
    types.ts
  test/
    headless_match.test.ts
```

Run modes:

- `stdio`: local model clients and dev tools.
- `streamable-http`: hosted multiplayer, tournaments, evaluation, and remote model clients.

The current code ships the stdio server, game-facing headless adapter, prompts, resources, ranked action evaluation, and richer local scenarios. Streamable HTTP is the next deployment layer.

Implemented today:

- headless quickstart and approach scenarios backed by `GameActionEngine` and `TurnEngine`
- public state serialization for visible units, active team, grid/lap state, winner, and recent events
- legal actions for attack-type selection, melee/range attacks, movement, single-target spells, mass spells, summons, wait, defend, and end turn
- attack action evaluation metadata: target value, real damage min/max, target total HP, lethal flag, retaliation risk, and priority score
- spell action evaluation metadata: target type, power type, duration, remaining casts, mass/summon flags, estimated tactical value, and priority score
- route metadata kept internal so `move_unit` and move-attack actions are still validated by common pathfinding
- default deterministic `RuleBasedModelAI` for local tests and fallback behavior, now prioritizing lethal/high-value threats and spell tempo
- full-turn bot runner that chains decisions until the active team changes or the fight finishes
- ranked tactical action view through `evaluate_actions`
- read-only MCP resources: `hoc://rules/summary`, `hoc://units`, `hoc://abilities`, `hoc://spells`, `hoc://effects`, `hoc://auras`, `hoc://synergies`
- model-facing MCP prompt: `play-turn`
- MCP stdio tools: `create_match`, `get_state`, `list_legal_actions`, `evaluate_actions`, `choose_action`, `submit_action`, `play_ai_turn`
- isolated Bun tests for legal actions, AI choice, action submission, cross-team rejection, movement, full-turn execution, resources, competitive target priority, spell casting, summoning, ranked evaluation, and SDK-level MCP tool calls

Current limitation: `@heroesofcrypto/common` stores fight properties in a singleton, so the MCP session store intentionally keeps one active headless match per process. A hosted multiplayer service should isolate each match in its own worker/process or move the common fight state behind an explicit match instance before running many matches concurrently.

## Core Principle

MCP should expose decisions, not internals. The model is a tactical brain, not a game authority.

Good:

```json
{
  "matchId": "m_123",
  "activeUnitId": "lower-angel-1",
  "legalActions": [
    {
      "id": "a_12",
      "kind": "move_unit",
      "summary": "Move Angel to D6, keeping Pegasus aura and threatening Medusa next turn.",
      "risk": "Leaves Angel in Gargantuan range.",
      "action": {
        "type": "move_unit",
        "unitId": "lower-angel-1",
        "path": [{ "x": 4, "y": 4 }, { "x": 5, "y": 5 }]
      }
    }
  ]
}
```

Bad:

```json
{
  "privateRandomSeed": "...",
  "enemyHiddenDraftSlots": "...",
  "callThisInternalMethod": "..."
}
```

## MCP Resources

Resources are read-only context. They help a model understand the game without spending tool calls on static data.

### `hoc://rules/summary`

Human-readable summary of the rules:

- draft shape
- placement rules
- action types
- attack rules
- spells
- morale and luck
- synergies
- map narrowing and Armageddon

This can reuse the rules text from the Astro site, but the source of truth for exact behavior remains `@heroesofcrypto/common`.

### `hoc://units`

Public unit roster derived from `CREATURES_JSON`:

- name
- faction
- level
- size
- attack type
- movement type
- stats
- abilities
- spells

Do not include hidden or unrevealed draft state.

### `hoc://abilities`

Ability and spell reference indexed by name.

### `hoc://match/{matchId}/public-state`

Current public board state for a match:

- match phase
- current lap
- grid type
- active unit
- turn queue summary
- visible units
- known buffs/debuffs/effects
- obstacle status
- narrowing layers
- last events

This should be concise enough for a model context window.

### `hoc://match/{matchId}/state-for-team/{team}`

Team-scoped state. This includes private information only for the requesting player team, such as unrevealed draft decisions if multiplayer draft later needs it.

Access must be authorized by session token or server-side match assignment.

## MCP Prompts

Prompts are reusable model instructions. Keep them short and tactical.

### `play-turn`

Purpose: choose one legal action for the active unit.

Inputs:

- `matchId`
- `team`
- optional style: `balanced`, `aggressive`, `defensive`, `explain`

Prompt behavior:

- read current state
- inspect legal actions
- pick exactly one action ID
- explain the reason in one short paragraph
- return `actionId` for the game runtime to apply
- call `submit_action` only in fully headless or server-owned bot-seat mode

### `draft-army`

Purpose: choose draft picks and bans when MCP draft support is added.

### `review-match`

Purpose: after a match, summarize decisive turns and mistakes from the event log.

## Game-Facing AI API

The product-facing API should be small and independent from MCP transport details.

### `POST /ai/turn`

Used by:

- Sandbox AI toggle
- PC opponent
- disconnected opponent fallback
- server bot seats

Request:

```ts
{
  matchId: string;
  team: "LOWER" | "UPPER";
  reason: "sandbox_toggle" | "pc_opponent" | "opponent_timeout" | "opponent_disconnected" | "server_bot";
  timeBudgetMs: number;
  style?: "balanced" | "aggressive" | "defensive";
  stateVersion: number;
}
```

Response:

```ts
{
  actionId: string;
  explanation?: string;
  model?: string;
  elapsedMs: number;
}
```

Important: the server should derive `state` and `legalActions` from its own match state. The browser should not be trusted to provide them in production.

For local Sandbox-only development, a dev endpoint can accept a full `AITurnRequest` because the browser owns the local state. That mode should never be used for ranked or real multiplayer.

## MCP Tools

Tools are the only model-facing action surface. Every tool must be deterministic from server state, validate input with schema, and never trust model-provided summaries.

### `create_match`

Create a local headless match.

Input:

```ts
{
  scenario?: "quickstart" | "mirror" | "drafted" | "custom";
  seed?: string;
  lower?: ArmySpec;
  upper?: ArmySpec;
}
```

Output:

```ts
{
  matchId: string;
  phase: "placement" | "fight";
  stateUri: string;
  legalActionsUri: string;
}
```

Implementation notes:

- For early implementation, support `quickstart` and `custom`.
- `quickstart` should create two small valid armies so models can immediately play.
- Use seeded runtime for deterministic evaluation.

### `get_state`

Return the compact public or team-scoped state.

Input:

```ts
{
  matchId: string;
  team?: "LOWER" | "UPPER";
  includeLegalActions?: boolean;
  includeEventLog?: boolean;
}
```

Output:

```ts
{
  matchId: string;
  phase: "draft" | "placement" | "fight" | "finished";
  state: PublicMatchState;
  legalActions?: LegalAction[];
  eventLog?: PublicGameEvent[];
}
```

### `list_legal_actions`

Return legal actions for the active unit or current phase.

Input:

```ts
{
  matchId: string;
  team: "LOWER" | "UPPER";
}
```

Output:

```ts
{
  activeUnitId?: string;
  activeUnitName?: string;
  legalActions: LegalAction[];
}
```

The model should submit an `actionId`, not raw arbitrary `GameAction`, whenever possible.

### `submit_action`

Apply one action.

Input:

```ts
{
  matchId: string;
  team: "LOWER" | "UPPER";
  actionId?: string;
  action?: GameAction;
  idempotencyKey?: string;
}
```

Output:

```ts
{
  completed: boolean;
  rejectionReason?: string;
  message?: string;
  events: PublicGameEvent[];
  state: PublicMatchState;
  nextLegalActions?: LegalAction[];
}
```

Rules:

- Prefer `actionId`.
- Allow raw `GameAction` only in dev mode or trusted evaluation mode.
- Reject if `team` is not allowed to act.
- Reject stale `actionId`s after any state transition.
- Apply through `GameActionEngine`, never by mutating state directly.
- In `Sandbox` AI-toggle mode, do not let the model call this directly; return an action decision and let `Sandbox.applyGameAction(...)` apply it.

### `choose_action`

Choose one legal action without mutating game state.

Input:

```ts
{
  matchId: string;
  team: "LOWER" | "UPPER";
  style?: "balanced" | "aggressive" | "defensive";
  reason?: "sandbox_toggle" | "pc_opponent" | "opponent_timeout" | "opponent_disconnected" | "server_bot" | "benchmark";
}
```

Output:

```ts
{
  actionId: string;
  explanation: string;
  confidence?: number;
}
```

This is the primary tool for model-backed AI inside the game. It keeps mutation in the game runtime while still letting the model reason over the current state.

### `ask_builtin_ai`

Return the simple existing heuristic move.

Input:

```ts
{
  matchId: string;
  team: "LOWER" | "UPPER";
}
```

Output:

```ts
{
  suggestedActionId?: string;
  reason: string;
}
```

This is useful for baselines and model-vs-bot tests. It should not bypass the same legal-action path.

### `resign_match`

End a match for a team.

### `reset_match`

Dev-only. Reset a headless match to a known scenario and seed.

## Public State Shape

Keep the default state small. A model does not need every numeric field every turn.

```ts
type PublicMatchState = {
  matchId: string;
  phase: "draft" | "placement" | "fight" | "finished";
  lap: number;
  grid: {
    size: 16;
    type: "NORMAL" | "BLOCK_CENTER" | "LAVA_CENTER" | "WATER_CENTER";
    obstacleHitsLeft?: number;
    holeLayers: number;
  };
  active?: {
    unitId: string;
    team: "LOWER" | "UPPER";
    name: string;
  };
  turnQueue: Array<{
    unitId: string;
    team: "LOWER" | "UPPER";
    name: string;
    speed: number;
    morale: number;
  }>;
  units: PublicUnitState[];
  lastEvents: PublicGameEvent[];
  winner?: "LOWER" | "UPPER";
};
```

```ts
type PublicUnitState = {
  id: string;
  team: "LOWER" | "UPPER";
  name: string;
  faction: string;
  level: number;
  size: 1 | 2;
  cells: Array<{ x: number; y: number }>;
  hp: number;
  maxHp: number;
  amountAlive: number;
  amountDied: number;
  attackType: string;
  selectedAttackType: string;
  movementType: string;
  speed: number;
  steps: number;
  shots: number;
  morale: number;
  luck: number;
  stackPower: number;
  abilities: string[];
  spells: Array<{ name: string; remaining: number }>;
  effects: string[];
  buffs: string[];
  debuffs: string[];
};
```

## Legal Action Generation

Legal action generation is the hard part. Do not ask the model to infer legality from rules text.

Server should calculate:

- wait / defend / end turn availability
- selectable attack types
- legal movement destinations and representative paths
- legal melee targets and required `attackFrom`
- legal ranged targets
- legal obstacle attack targets
- legal area throw targets
- legal spells and legal targets
- placement cells before fight start

The first implementation can be conservative:

1. Always include `end_turn`, `wait_turn`, `defend_turn` when valid.
2. Include ranged attacks using `AttackHandler.canLandRangeAttack`.
3. Include melee attacks against adjacent enemies.
4. Include move actions from `PathHelper.getMovePath`.
5. Add move-and-melee as a bundled action once routes are reliable.
6. Add spells after target generation is fully tested.

Each legal action should include:

- stable `id`
- raw `GameAction`
- one-line `summary`
- optional `tacticalTags`
- optional `risks`

The action ID should be a hash of:

- match id
- state version
- active unit id
- canonical JSON action

That prevents stale actions from being replayed after the board changes.

## Headless Match Adapter

The MCP package should own a `HeadlessMatch` class.

Responsibilities:

- initialize `FightProperties`, `Grid`, `UnitsHolder`, `MoveHandler`, `AttackHandler`, `PathHelper`
- create units from common unit configuration
- place units and start fights
- track current active unit id
- apply `GameActionEngine`
- convert engine events to public events
- generate legal actions
- serialize/deserialize full match state

Suggested shape:

```ts
class HeadlessMatch {
  readonly id: string;

  getPublicState(team?: TeamType): PublicMatchState;
  listLegalActions(team: TeamType): LegalAction[];
  submitAction(input: { team: TeamType; actionId?: string; action?: GameAction }): ActionResult;
  serialize(): SerializedHeadlessMatch;
  static deserialize(data: SerializedHeadlessMatch): HeadlessMatch;
}
```

## State Persistence

`FightProperties.serialize()` exists, but complete match persistence also needs:

- unit properties
- unit positions/cells
- grid type and hole layers
- obstacle state
- event log
- active unit id
- state version
- RNG seed / deterministic runtime cursor

Start with JSON for the headless adapter, even if `FightProperties` remains protobuf bytes inside it.

```ts
type SerializedHeadlessMatch = {
  version: 1;
  matchId: string;
  stateVersion: number;
  fight: string; // base64 protobuf from FightProperties.serialize()
  grid: SerializedGrid;
  units: SerializedUnit[];
  activeUnitId?: string;
  eventLog: PublicGameEvent[];
  rng: SerializedRngState;
};
```

Later, this can move to a compact protobuf if needed.

## Fairness And Security

Model clients are untrusted players.

Hard rules:

- Never expose hidden opponent draft state in public resources.
- Never accept model-provided state summaries as source of truth.
- Never accept arbitrary method names, script execution, file paths, or code.
- Do not let MCP tools mutate wallet, auth, marketplace, or production player data.
- In hosted mode, require auth and bind each MCP connection to one player/team.
- Rate limit `get_state`, `list_legal_actions`, and `submit_action`.
- Put a per-turn time budget around model actions.
- Log every action, rejection, and state version.

For local/dev stdio, keep the MCP server intentionally sandboxed to game state only.

## Multiplayer Integration

There are three modes.

### Sandbox model toggle

The current `AIController` path can gain a model provider:

```ts
type AIProvider = "basic" | "model";
```

Flow:

1. `AIController.shouldTriggerAI()` fires as it does today.
2. If provider is `basic`, keep existing `AI.findTarget(...)`.
3. If provider is `model`, call a model AI service with `matchId`, active team, reason `sandbox_toggle`, state version, and time budget.
4. Service returns `actionId`.
5. Client resolves and applies the canonical `GameAction`.
6. On invalid/timeout, use existing basic AI fallback.

This keeps the current Sandbox UX while replacing the brain behind the button.

### PC opponent / disconnected opponent

In real multiplayer, this should run on the authoritative game server, not in the browser.

Flow:

1. Match server marks a team as model-controlled because the match is vs PC, opponent timed out, or opponent disconnected.
2. On that team's active turn, server calls the model AI service.
3. Model service chooses an action from server-generated legal actions.
4. Match server applies it through `GameActionEngine`.
5. Events stream to both clients normally.

The model should never receive more hidden state than the controlled team is entitled to know.

### Local model match

The MCP server owns the match in memory:

- model vs built-in AI
- model vs model
- human testing through MCP Inspector
- deterministic benchmark scenarios

This is the easiest first milestone.

### Production multiplayer model player

The MCP server acts as a player client to the real game backend:

- matchmaking/session auth decides team
- MCP tools proxy to the authoritative multiplayer server
- server receives public/team state from backend
- `submit_action` sends a signed action to backend
- backend applies `GameActionEngine`

In production, MCP must not become a second game authority. It is only the decision layer for a team the match server has already decided is AI-controlled.

## Evaluation Harness

Add model benchmark scripts after the headless package exists:

```text
game/mcp/scripts/
  run_match.ts
  run_round_robin.ts
  export_replay.ts
```

Useful metrics:

- win rate by scenario
- average turns to win
- illegal action rate
- timeout rate
- repeated-state loops
- damage dealt per lap
- survival after narrowing
- use of spells/auras

This will make it possible to compare models and prompts without relying on vibes.

## Implementation Plan

### Milestone 1: Local playable MCP prototype

- Add `@heroesofcrypto/mcp` workspace.
- Add `HeadlessMatch` with quickstart scenario.
- Add stdio MCP server.
- Add `get_state`, `list_legal_actions`, `choose_action`, `submit_action`, `ask_builtin_ai`.
- Support start fight, end turn, wait, defend, adjacent melee, direct ranged attack.
- Add tests for action rejection and state versioning.

### Milestone 2: Sandbox AI toggle integration

- Add an `AIProvider` interface near `AIController`.
- Keep `basic` provider as the current `AI.findTarget(...)` behavior.
- Add `model` provider that calls a dev AI endpoint and receives an `actionId`.
- Add fallback to `basic` provider on timeout, invalid action, or network error.
- Surface a small UI setting for Basic AI vs Model AI only in dev/experimental mode.

### Milestone 3: Useful tactical play

- Add movement destinations through `PathHelper`.
- Add move-and-melee actions.
- Add obstacle attacks.
- Add compact tactical summaries for legal actions.
- Add event-log summarization.

### Milestone 4: Spells and placement

- Add legal spell target generation.
- Add placement-phase tools.
- Add draft-phase tools.
- Add resources for unit/ability references.

### Milestone 5: Hosted and multiplayer

- Add Streamable HTTP transport.
- Add auth binding to player/team.
- Connect to matchmaking and multiplayer sessions.
- Add timeout/disconnect bot-seat policy.
- Add replay export.
- Add model-vs-model tournaments.

## Open Questions

- Should production model players be allowed in ranked matches, or only model queues/custom lobbies?
- Should players see that the opponent is model-controlled?
- How much private draft information exists in the final multiplayer flow?
- Do we want a fixed seed mode for public model benchmarks?
- Should `GameActionEngine` move away from global `FightStateManager` usage in helpers before hosted MCP?
- Should Sandbox model AI be dev-only until hosted inference cost/rate limits are understood?
- What is the exact timeout policy before a disconnected player is replaced by model AI?

## Recommended First PR

Keep the first PR small:

1. Add `game/mcp`.
2. Implement local stdio server.
3. Implement one quickstart scenario.
4. Implement state summary and legal action IDs.
5. Implement `choose_action` and optional `submit_action` through `GameActionEngine`.
6. Add tests proving a model can play a complete simple fight without illegal actions.

Second PR: wire `Sandbox` AI toggle to the model provider behind a dev flag, with existing Basic AI as fallback.

Do not start with draft, matchmaking, or full HTTP hosting. Those are important, but they add auth and hidden-state risk before the basic model-as-AI loop is proven.
