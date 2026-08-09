# Heroes of Crypto Core Game Logic

This package is the browser-side game client for Heroes of Crypto: board rendering, scene and turn
orchestration, the React UI shell, and the clients that talk to the auth, matchmaking, game and
ranked services.

Rendering is [Pixi.js](https://pixijs.com/). The shared rules — units, spells, abilities, grid and
combat maths — live in `@heroesofcrypto/common` and are consumed here rather than reimplemented, so
the client and the server always agree on what a fight does.

## Project Structure

```
src/
├── api/          # Service clients and the play-protocol codec (lobby, ranked, vs-AI, portal, social)
├── generated/    # Generated asset metadata (image imports, animation atlases)
├── i18n/         # Translation catalogues and locale plumbing
├── obstacles/    # Obstacle model and board obstacle generation
├── pixi/         # Pixi renderer: app, scene, camera, drawer, sprites, textures, animation
├── replay/       # Deterministic replay of ranked and sandbox fights
├── scenes/       # Scene and turn orchestration
│   └── sandbox/  # Sandbox-specific scene pieces
├── types/        # Ambient type declarations
├── ui/           # React UI shell (MUI Joy): sidebars, pick & ban, overlays, portal, audio
├── utils/        # Hotkeys, AI-opponent helpers, pre-game perks, React helpers
├── wallet/       # Wallet connection (wagmi / viem / RainbowKit)
├── intex.ts      # Entry point (note the intentional misspelling)
└── statics.ts    # Static constants and shared values
```

## Entry Point

`src/intex.ts` is deliberately thin: it imports `./scenes`, whose `index.ts` in turn imports
`Sandbox`. Importing a scene module is what registers it — the scene wires itself up on import
rather than being constructed by the entry point.

## Rendering (`src/pixi/`)

The renderer is Pixi-only; there is no physics engine and no hand-written WebGL shader layer.

- **`PixiApp.ts`** — owns the Pixi `Application` and the container hierarchy. `worldRoot` is
  Y-flipped once so the rest of the code can work in y-up world coordinates; camera pan/zoom is a
  transform on the `camera` container above it.
- **`PixiScene.ts`** — base scene: per-frame `Step`, selection state, statistics lines, and the
  hooks concrete scenes build on.
- **`PixiDrawer.ts` / `PixiSprite.ts` / `PixiTextureLoader.ts`** — board and sprite drawing, plus
  texture/atlas loading.
- **`PixiUnitsFactory.ts`** — creates units and heroes, positions them on the grid, and registers
  them with the scene manager.
- **`PixiAnimation.ts`** — atlas-driven unit and effect animation.
- **`PixiCamera.ts` / `boardFit.ts`** — camera control and fitting the board to the viewport.
- **`SimplePhysicsManager.ts`** — a small kinematic position/velocity helper for movement
  interpolation. The game is turn-based, so it runs with zero gravity and simple friction; it is
  not a physics simulation.
- **`webglContextGuard.ts` / `FpsCalculator.ts`** — context-loss handling and frame timing.

## Scenes (`src/scenes/`)

Scene code drives a fight from placement through to the result.

- **`Sandbox.ts` / `SandboxDrawer.ts`** and **`sandbox/`** — the local sandbox fight.
- **`RankedPlayScene.ts`** — the ranked fight, driven by authoritative server snapshots.
- **`PlacementManager.ts`**, **`placementSplitPower.ts`** — army placement and stack splitting.
- **`RenderableUnit.ts`**, **`RenderableSpell.ts`**, **`UnitChip.ts`**, **`UnitsOverlay.ts`** — the
  drawable wrappers around common's unit and spell models.
- **`fight_vfx_catalog.ts`**, **`effect_pops.ts`**, **`atlasAnimationTiming.ts`** — combat VFX. The
  catalog is shared so live and replay paths render the same animations.
- **`SceneLog.ts`**, **`sceneLogTurnHeaders.ts`**, **`DamageStats.ts`**, **`FightStatsTracker.ts`** —
  battle log and statistics.
- **`AIController.ts`**, **`LocalModelOpponent.ts`** — local AI opponents.
- **`HoverManager.ts`**, **`spell_targeting.ts`**, **`SpellBookOverlay.ts`**, **`ButtonManager.ts`** —
  hover previews, targeting and the spellbook.

## API Layer (`src/api/`)

`play_protocol.ts` and `game_action_play_codec.ts` encode and decode the wire protocol; the rest are
per-service clients (`lobby_client`, `ranked_play_client`, `vs_ai_client`, `player_portal_client`,
`social_client`) over the shared `axios` instance.

## Replay (`src/replay/`)

`ranked_replay.ts` and `sandbox_replay.ts` re-run a recorded fight through the same scene code that
played it live, so a replay and the original fight produce identical state.

## Game Architecture

1. **Rendering** — Pixi.js scene graph with atlas-based sprite animation.
2. **Scene Management** — a base scene providing the frame loop and selection state, with sandbox
   and ranked scenes on top.
3. **Shared Rules** — units, spells, abilities, grid and combat maths come from
   `@heroesofcrypto/common`.
4. **Combat** — turn-based, with melee, ranged and magical attack types.
5. **Spells** — spellbook casting with an overlay and targeting UI.
6. **AI** — local AI opponents for sandbox and practice play.
7. **Grid** — grid management for unit positioning and movement.
8. **Replay** — deterministic replay over the live scene code.

## Key Features

- **Turn-based Combat** — strategic combat with multiple attack types
- **Unit Stacking** — units stack for increased power
- **Faction System** — factions with distinct units and synergies
- **Spell System** — magic spells with a visual spellbook
- **Grid Narrowing** — the battlefield shrinks over the course of a fight
- **AI Opponents** — computer-controlled opponents
- **Visual Effects** — animated combat effects shared between live and replay
- **Responsive UI** — adapts to different screen sizes and orientations
