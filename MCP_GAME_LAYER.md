# MCP game adapter

`game/mcp` exposes Heroes of Crypto draft and combat decisions through a stdio MCP server and a
headless game adapter. It uses `@heroesofcrypto/common` to generate legal actions, validate choices,
and apply the rules. The browser integrates model opponents through `LocalModelOpponent` and
`AIController`.

## Run and verify

From the repository root:

```bash
bun --cwd game/mcp run build
bun --cwd game/mcp run dev     # stdio MCP server
bun --cwd game/mcp run test
```

The server registers draft tools for creating a draft, inspecting/evaluating legal picks, submitting
choices, and running AI draft steps. Combat tools create a match, inspect/evaluate legal actions,
submit choices, and run an AI turn. Rules, creatures, spells, abilities, effects, auras, and synergies
are exposed as read-only resources. The tool schemas in [server.ts](game/mcp/src/server.ts) and the
public types in [types.ts](game/mcp/src/types.ts) define the current interface.

`HeadlessMatchStore` keeps one active draft/match per process because the shared engine uses a fight
state singleton. Creating another match replaces the active one. Concurrent matches require separate
processes.

## Local model opponent

The launcher accepts an OpenAI-compatible model API. Its default root is `http://127.0.0.1:9091/`;
`HOC_MODEL_API_BASE` overrides it, and a trailing `/v1` is normalized automatically.

```bash
game/mcp/scripts/hoc-model-opponent.sh status  # probe the configured model
game/mcp/scripts/hoc-model-opponent.sh play    # terminal human vs model
game/mcp/scripts/hoc-model-opponent.sh ui      # browser human vs model
```

Set `HOC_MODEL_NAME` to select a model and `HOC_MODEL_STREAM=0` to force non-streaming requests.
Returned choices are checked against the current legal actions; an invalid or unavailable model
falls back to the built-in scorer. Inspect the runner's `builtin_fallback` results when measuring
model performance.

The mechanics-aware evaluation commands are `harness:match`, `harness:round-robin`, and
`harness:export-replay` in [package.json](game/mcp/package.json). Their argument handling lives in
[the scripts directory](game/mcp/scripts).

## Implementation

- [session_store.ts](game/mcp/src/session_store.ts): draft/match lifetime and action submission.
- [runtime.ts](game/mcp/src/runtime.ts): game-facing adapter.
- [model_ai.ts](game/mcp/src/model_ai.ts): decision providers and model requests.
- [LocalModelOpponent.ts](game/core/src/scenes/LocalModelOpponent.ts): browser integration.
- [AIController.ts](game/core/src/scenes/AIController.ts): battle AI orchestration.
