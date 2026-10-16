# Level-one animation release

The approved renderer is selected by creature name in `RenderableUnit.fromBase`, including authoritative scene reconstruction. The general animation freeze only applies to other creatures. Never replace this dispatch with an editor-only flag.

`game/core/src/animations/levelOneAtlases.ts` owns approved playback settings. `levelOneAssets.json` pins the WebP files; `battlefieldEnvironmentAssets.json` pins the locally approved burning/extinguished pit and five narrowing stages. Keep the relative paths under the configured `HOC_IMAGES_LOC` and `HOC_ANIMATIONS_LOC/output`. Source art remains outside Git.

Run the normal common build, then `NODE_ENV=production bun run --cwd game/core build:test`. Both image generators validate/copy the pinned package. `build:skip` also validates installed file hashes and required generated image entries. Missing or stale files abort the release. CI may compile image stubs for code checks only; never deploy CI stub output.

Update assets and their hash manifest together when approving a new revision. Upload files with their manifest-relative directory layout; do not flatten the authoring checkout. Deploy all hashed assets before switching index.html, retain the previous index and assets for rollback, and verify /play and battle routes from a fresh browser.

Checks: LevelOnePackage.test covers every level-one creature after authoritative reconstruction, idle availability, walking frames, melee directions, ranged directions and casts where applicable. Existing legacy renderer tests exercise the unapproved renderer separately. DungeonVisuals and lava tests cover scene teardown, extinguishing and narrowing.

Production loads each visible creature's approved sheets only after its base texture is available. Do not re-enable a whole-roster background preload: it competes with placement textures on slow connections. Arbalester idle pages remain bounded and demand-loaded. `approvedAnimationLoading.test` and the slow-portrait regression in `LevelOnePackage.test` protect this order.

The approved aim components are pinned separately in `game/core/src/pixi/shotTrajectoryAssets.json`. Keep all six head, fletching and shaft textures in production, demand-loaded as combat effects. The same build guard verifies their hashes and generated URL entries. HoverManager uses the local endpoint mipmap filtering and fractional sprite placement; do not restore pixel rounding on rotating endpoints.

## Combat order and sprite-only motion

Both sandbox actions and authoritative battle replays use the same resolved-strike queue.
A melee strike and its victim's hit reaction start together; the next response or repeated
strike waits for both clips. Ranged reactions start on projectile contact. A defender with
a recorded response that dies from the first blow responds before its fatal blow. Later
blows cannot hit an already presented corpse, and mutually lethal opening blows finish
before either figure can interrupt its own death animation. This changes presentation only.

Levels one and two suppress procedural cutout sway, bounce, recoil, attack windup and dodge.
Approved sprite clips remain enabled; unfinished actions have no invented motion or death
shatter fallback. Other levels keep their existing generic-motion policy.
