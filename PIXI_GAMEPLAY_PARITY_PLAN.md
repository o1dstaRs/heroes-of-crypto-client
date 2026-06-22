# PixiJS Gameplay Parity Plan

Closing the gameplay-mechanic gaps between the legacy scene
(`game/core/scripts/legacy/test_heroes.ts`) and the new PixiJS scene
(`game/core/src/scenes/Sandbox.ts` + supporting files).

> **Status legend:** ☐ todo · ◐ in progress · ☑ done
> Update the checkboxes as we go. Keep line refs current if files shift.

### Progress log
- **Phase 0 ☑** — `ButtonManager.ts:325` Defend now calls `cleanupLuckPerTurn()`. Typechecks.
- **Phase 2 ◐** — single-target magic casting implemented in `Sandbox.ts` (new `handleSpellbookClick`,
  `closeSpellBook`, `castSpellOnTarget`; spell routing added to `MouseDown`; racing stage
  `pointerdown` book-closer removed). Typechecks. **Awaiting user runtime test.**
- **Phase 3 ◐** — mass-cast implemented (`castMassOrSummonSpell` + `massCastOnFlyers` /
  `massCastOnAllies` / `massCastOnEnemies`; magic-resist roll, absorption, MIND-resist, mirror;
  shared `cleanupAfterSpell`). Typechecks. **Awaiting user runtime test.** (Legacy double-heal in
  ALL_ALLIES treated as a bug → applied once.)
- **Phase 4 ◐** — summon implemented (`summonUnits`: grow existing stack via `getSummonedUnitByName`,
  else build via `HoCConfig.getCreatureConfig` + `Unit.createUnit` + `RenderableUnit.fromBase` and
  spawn with grid occupancy/position/`ensureVisual`). Typechecks. **Highest runtime risk** (mid-fight
  spawn + texture loading; `largeTextureName` passed as "" so large summons may mis-texture).
- **Phase 1 ◐** — obstacle attacks wired: `attemptObstacleAttack` + `findObstacleAttackFromCell`
  in `MouseDown` (ranged auto-land; melee moves adjacent); obstacle destruction handled.
  Plus obstacle **hover** (`updateObstacleHover`: melee silhouette + ranged + "Hit the mountain")
  and the **mountain HP bar** + hide-on-destroy in `DungeonVisuals` (`drawCenterHitBar`). Typechecks.
  **Correction:** the mountain *is* rendered (via `DungeonVisuals.ensureCenterTerrainSprite`, sprite
  `mountain_432_412`) — the earlier "not rendered" claim was about the dead `PixiDrawer`/generator
  path. So only the HP bar + hover needed adding.
- **Phase 5 ☑** — flying verified: `getMovePath` calls pass `canFly()` (derived from `FLY` movement
  type). Fixed `Sandbox.ts:1587` which used `hasAbilityActive("Flying")` (no creature has that
  ability → innate flyers wouldn't fly there) → now `canFly()`.

## Background

The game **rules** live in the shared package `game/heroes-of-crypto-common/src/`
(`fights/`, `handlers/`, `abilities/`, `spells/`, `effects/`, `units/`). Both the
legacy and the PixiJS scenes call into it. A "missing mechanic" therefore means the
PixiJS scene fails to **call / sequence** a shared rule the legacy scene did — not
that the rule itself is gone.

Audit method: static call-graph diff of which shared-engine APIs each scene invokes,
corrected for receiver-variable renames, then read-through of the exact flows.

### What is already faithfully ported (do NOT touch)
- Turn loop: `finishTurn`, `startTurn`, `dequeueNextUnitId`, `flipLap`, lap narrowing,
  up-next queue, hourglass/**wait** queue, **skip**/**defend** buttons, armageddon wave, fight start/finish.
- Morale: decrease on skip/wait/defend, step-morale multiplier (`increaseStepsMoraleMultiplier`),
  morale extra-turn (`requestAdditionalTurn`).
- Luck: rolled/applied inside the melee & range handlers (which are called).
- Movement/speed: `MoveHandler`, `PathHelper`, known paths, reachable cells.
- Synergies, augments, auras (`refreshAuraEffects`), effects.
- Retaliation & multi-hit abilities (run inside the shared melee/range handlers).

### Key architectural facts discovered
- New attacks flow through `Sandbox.executeAttackSequence(attacker, target, attackFrom)`
  (`Sandbox.ts:1706`), branching only **range** vs **melee** (`:1755`, `:1811`).
  Legacy equivalent is `landAttack()` (`test_heroes.ts:3387`), a cascade
  melee → obstacle → range → magic.
- `attack_handler.ts` exposes **four** public entry points the scene must call by type:
  `handleMeleeAttack` (`:953`), `handleRangeAttack` (`:400`), `handleMagicAttack` (`:171`),
  `handleObstacleAttack` (`:1696`). New code calls only melee + range.
- **`handleMagicAttack` IS the targeted-spell engine** (heal / resurrect / buff / debuff via
  `currentActiveSpell`). So "magic attack" and "single-target spell cast" are the same path.
- Spell **selection** is partly wired in new code: `currentActiveSpell` field
  (`Sandbox.ts:127`), set on hover over the open spellbook (`Sandbox.ts:2253-2254`);
  spellbook overlay toggles (`ButtonManager.ts:313`). Spell **application** (dispatch by
  `SpellTargetType`, `useSpell`, `finishTurn`) is entirely missing.
- Legacy spell dispatch lives in the click handler at `test_heroes.ts:3771-4019`
  (summon / mass-cast ALL_ALLIES|ALL_ENEMIES|ALL_FLYING / FREE_CELL via `cast()` / single-target).
- New animation model differs: `executeAttackSequence` snapshots all units pre-attack and
  animates from state **deltas** (`Sandbox.ts:1734`), rather than the handler's `animationData`.
  → Spell/obstacle/magic effects will work **mechanically** via snapshots; bespoke VFX is a follow-up.

### Dependencies confirmed present in new `core/src`
- `gridMatrix` (`Sandbox.ts:89`, set `:233`) — needed by `handleMagicAttack`.
- Obstacle teardown: `cleanupCenterObstacle`, `switchToDryCenter`, `BLOCK_CENTER`, `GridType.NORMAL`.
- `getAllAllies` (9), `getAllEnemyUnits` (1), `refreshStackPowerForAllUnits` (9).
- Unit creation: `createUnitForTeam` (`Sandbox.ts:455`) → `Unit.createUnit`; RenderableUnit
  "upgrade" pattern (`RenderableUnit.ts:101`).

### Dependencies NOT yet called in new code (exist in shared pkg, must be wired)
`handleMagicAttack`, `handleObstacleAttack`, `getObstacleHitsLeft`, `getSummonedUnitByName`,
`getAllTeamUnitsCanFly`, `getAllEnemyUnitsCanFly`, `getAllTeamUnitsMagicResist`,
`getAllEnemyUnitsMagicResist`, `EffectHelper.getAbsorptionTarget`, `applyHeal`,
`applyResurrection`, `useSpell`, `getMagicResist`, `canBeHealed`, `SpellHelper.{canCastSpell,
canCastSummon, canMassCastSpell, hasAlreadyAppliedSpell, isMirrored}`.

---

## Execution phases (ordered by certainty → impact)

### Phase 0 — Quick win: Defend resets per-turn luck  ☐
- **Gap:** Legacy "LuckShield"/Defend calls `currentActiveUnit.cleanupLuckPerTurn()`
  (`test_heroes.ts:1019`); new handler doesn't. Button is even labeled
  "Cleanup randomized luck and skip turn" (`ButtonManager.ts:57`).
- **Fix:** In `ButtonManager.ts` `case "LuckShield"` (`:323`), add `active.cleanupLuckPerTurn();`
  before `decreaseMorale`.
- **Risk:** none. ~1 line.

### Phase 1 — Obstacle attacks (destructible center)  ☐
- **Gap:** `handleObstacleAttack` never called; `getObstacleHitsLeft` never read.
  Can't damage/destroy the central obstacle. Legacy: `test_heroes.ts:3445-3485`.
- **Plan:**
  1. In `executeAttackSequence` (`Sandbox.ts:1706`), before the melee branch, attempt
     `this.attackHandler.handleObstacleAttack(this.sc_mouseWorld, this.unitsHolder,
     this.moveHandler, attacker, attackFrom, this.currentActiveKnownPaths)`.
  2. On `.completed`: if `getObstacleHitsLeft() <= 0` →
     `drawer.switchToDryCenter()`, `grid.cleanupCenterObstacle()`, `drawer.setGridType(NORMAL)`.
     Handle `"Through Shot"` (skip to range instead of finishing turn).
  3. `finishTurn()` on completion (unless Through Shot).
  4. Wire the **target = obstacle cell** path: the click handler must allow targeting a
     center-obstacle cell (not just a unit) and route into `executeAttackSequence`/obstacle attack.
- **Deps:** all present.
- **Risk:** low–med — must let the click handler accept an obstacle cell as a target; verify
  `BLOCK_CENTER` grid + center cells exist for the active map.

### Phase 2 — Spell-cast entry point + single-target spells (`handleMagicAttack`)  ☐
This unlocks heal / resurrect / single-target buff & debuff + magic-resist + correct behavior
for `MAGIC` / `MELEE_MAGIC` creatures, and is the shared entry point for Phases 3–4.
- **Plan:**
  1. **Entry point:** find the click handler that currently routes unit clicks to
     `executeAttackSequence` (calls at `Sandbox.ts:1476-1586`). Add a guard at the top:
     if `sc_renderSpellBookOverlay` && `currentActiveSpell` set && fight started → run
     `this.applySpell(clickedCellOrUnit)` instead of normal move/attack.
  2. **`applySpell` dispatch** (port `test_heroes.ts:3771-4019`), branch on
     `currentActiveSpell.getSpellTargetType()`:
     - **Single target (default else, `:4009`):** keep `currentActiveSpell` armed; on the
       following click on a unit, call
       `attackHandler.handleMagicAttack(gridMatrix, unitsHolder, currentActiveSpell, attacker,
       targetUnit, currentEnemiesCellsWithinMovementRange)`; on `.completed` →
       process deaths (resurrection-aware `deleteUnitById(id, true)`),
       `refreshStackPowerForAllUnits`, `finishTurn`, clear spell + close book.
     - **FREE_CELL:** port `cast()` (`test_heroes.ts:4391`) — validate cell in grid → `finishTurn`.
  3. Close spellbook + clear `currentActiveSpell` after a successful cast or on deselect.
- **Deps:** `gridMatrix` present; `handleMagicAttack` internally uses
  `canCastSpell`/`applyHeal`/`applyResurrection`/`applyBuff`/`getMagicResist`/`canBeHealed`.
- **Risk:** med — death/resurrection cleanup + animation (snapshot model) need care.

### Phase 3 — Mass-cast spells (ALL_ALLIES / ALL_ENEMIES / ALL_FLYING)  ☐
- **Plan:** extend `applySpell` (port `test_heroes.ts:3818-4007`):
  - Gate with `SpellHelper.canMassCastSpell(...)` (needs `getAllTeamUnitsCanFly`,
    `getAllEnemyUnitsCanFly`, `getAllTeamUnits/EnemyUnitsMagicResist`, buffs/debuffs/hp getters).
  - **ALL_FLYING:** `applyBuff` to flying allies + enemies (skip 100% magic-resist / non-flyers).
  - **ALL_ALLIES:** heal (`canBeHealed`/`applyHeal`) or `applyBuff` (handle `UNIT_AMOUNT` multiplier).
  - **ALL_ENEMIES:** per enemy → `EffectHelper.getAbsorptionTarget`, magic-resist roll
    (`HoCLib.getRandomInt`), `applyDebuff`, MIND-resist skip, `SpellHelper.isMirrored` reflect.
  - Then `useSpell`, `refreshStackPowerForAllUnits`, refresh bars, `finishTurn`.
- **Deps:** wire the unused `unitsHolder` fly/magic-resist/buff getters + `EffectHelper`.
- **Risk:** med — faithful port of resist/mirror/absorption ordering.

### Phase 4 — Summon spells  ☐
- **Gap:** `canCastSummon`, `getSummonedUnitByName`, summon spawn — none wired. New
  `PixiUnitsFactory` is texture-only; creation is via `createUnitForTeam`/`Unit.createUnit`.
- **Plan:** port `test_heroes.ts:3786-3817`:
  - `amountToSummon = floor(caster.getAmountAlive() * spell.getPower())`.
  - If `SpellHelper.canCastSummon(spell, gridMatrix, randomCell)`:
    - existing stack of same name → `getSummonedUnitByName` → `increaseAmountAlive`;
    - else create the summoned creature (`spell.getSummonUnitRace/Name`) — **build a
      `summonCreatureForTeam(faction, name, team, amount)` helper** mirroring
      `createUnitForTeam` (`Sandbox.ts:455`) + RenderableUnit upgrade — and spawn at `randomCell`.
  - `useSpell`, refresh stacks/bars, `finishTurn`.
- **Risk:** **highest** — requires a new spawn path in the Pixi layer (placement, sprite/animation
  load, body registration). Investigate `createUnitForTeam` reuse first.

### Phase 5 — Flying mechanics verification  ☐
- **Gap signal:** `canFly` 14→2, `getMovementType` 2→0, `getAllTeam/EnemyUnitsCanFly` 1→0.
- **Plan:** confirm flyers path over obstacles/units (shared `PathHelper`), fly-based aura/range,
  and ALL_FLYING targeting (Phase 3). Fix only confirmed regressions.
- **Risk:** low (mostly verification); fly pathfinding may already be in shared `PathHelper`.

### Phase 6 — Build + verification  ☐
- Typecheck: `cd game/core && bunx tsc --noEmit` (full build is `tsc && vite build`).
- Manual smoke per phase: defend resets luck; attack/destroy obstacle; cast heal/buff/debuff on
  target; mass-cast on allies/enemies; summon; flyer crosses obstacle.

---

## Open questions / risks to resolve during execution
1. **Summon spawn** in the Pixi layer (Phase 4) — biggest unknown; needs sprite/body wiring.
2. **Spell VFX** — mechanics first; the snapshot-delta animator may not show buffs/debuffs/summons
   without added hooks. Track as follow-up, not a blocker for "how the game behaves".
3. **Obstacle-cell targeting** — click handler currently targets units only.
4. **`MAGIC` / `MELEE_MAGIC` basic attacks** — confirm these route through `currentActiveSpell` or
   need a distinct path (legacy gates magic on `currentActiveSpell`).
