import { Sprite, Graphics, Container, Texture, BlurFilter, RenderTexture, Text, TextStyle } from "pixi.js";
import { PixiDrawer } from "../pixi/PixiDrawer";
import {
    SandboxDrawer,
    ENEMY_TURN_HIGHLIGHT_COLOR,
    hoveredShotRangeColor,
    movementCellsOutsideUnitFootprint,
    visibleAuraRanges,
    type IFootprintExtent,
    type ShotRangeOverlay,
} from "./SandboxDrawer";
import {
    AttackHandler,
    Augment,
    AbilityFactory,
    FactionType,
    EffectFactory,
    Grid,
    GridConstants,
    GridMath,
    GridType,
    GridSettings,
    HoCConstants,
    HoCLib,
    AttackType,
    Spell,
    SpellMultiplierType,
    SpellTargetType,
    SpellPowerType,
    SpellHelper,
    SmokeHelper,
    hasActiveTimeDenial,
    scatteredMountainsForSeed,
    VineHelper,
    FireWallHelper,
    RayTraversal,
    HoCMath,
    IWeightedRoute,
    PathHelper,
    TeamType,
    TeamVals,
    UnitProperties,
    IPlacement,
    Unit,
    IAttackTargets,
    IAttackObstacle,
    FightStateManager,
    UnitsHolder,
    MoveHandler,
    SpecificSynergy,
    ToLifeSynergy,
    ToChaosSynergy,
    ToMightSynergy,
    ToNatureSynergy,
    FACTION_SYNERGY_PAIRS,
    FactionVals,
    AttackVals,
    MovementVals,
    GridVals,
    UnitVals,
    IVisibleDamage,
    AbilityHelper,
    AllAbilities,
    Artifact,
    IDamageStatistic,
    FightProperties,
    GameAction,
    GameActionEngine,
    TurnEngine,
    GameEvent,
    isThrownOffensiveSpell,
    isOffensiveSpellMultiplier,
    offensiveSpellDamageAgainstTarget,
    elementalSpellMultiplier,
    type IGameActionResult,
    fireforgedSwordDamage,
    fireforgedSwordPower,
    projectAttackDamage,
    projectAttackDamageBand,
    projectKillBand,
    projectDoubleShotAttack,
    attackerParalysisMultiplier,
    aoeAttackAbility,
    aoeAttackAbilityMultiplier,
    applyAoeDamageTail,
    throughShotAbilityMultiplier,
    applyThroughShotDamageTail,
    doubleShotAbility,
    type IAttackDamageProjection,
} from "@heroesofcrypto/common";
import { UnitsOverlay } from "./UnitsOverlay";
import { DamageStatisticHolder } from "./DamageStats";
import { FightStatsTracker } from "./FightStatsTracker";
import { VisibleButtonState, IVisibleUnit } from "./VisibleState";
import { images } from "../generated/image_imports";
import { SceneSettings } from "./SceneSettings";
import { PixiScene, PixiSceneContext, registerScene } from "../pixi/PixiScene";
import { setSpawnFlowPhase } from "../pixi/PixiDrawablePlacement";
import { isBattlefieldShadowEditorActive } from "../ui/battlefieldShadowTuning";
import { PlacementManager } from "./PlacementManager";
import {
    animatableEffectNames,
    diffUnitEffects,
    dullingDefenseApplicationCount,
    type EffectFlash,
} from "./effect_pops";
import { formatTurnLogHeader } from "./sceneLogTurnHeaders";
import {
    formatAggrBlockedActionHint,
    isAggrBlockedActionHint,
    isManualAttackBlockedByAggr,
    shouldResolveAggrAfterFirstDoubleShotObstacle,
} from "./aggrBlockedActionHint";
import {
    placementFacingDirectionForTeam,
    previewPlacementFacing,
    preservesFacingForPureVerticalSingleCellAttack,
    RenderableUnit,
} from "./RenderableUnit";
import { resolveCreatureHeadPriorityDepths } from "./battlefieldCreatureDepthSort";
import { projectPlacementSplitStackPowers } from "./placementSplitPower";
import { PixiRenderableSpell } from "./RenderableSpell";
import { indexUnitTeam, resolveLineTeamFlag } from "./scene_log_flag";
import {
    combatFootprintCellsForBase,
    footprintHeightOf,
    footprintWidthOf,
    HoverManager,
    meleeSwordFacingAngle,
    meleeSwordTargetPoint,
    rangeTargetEdgeMarkerPosition,
    rangeTargetEdgeMarkerRowScale,
    rangeTargetEdgeTrajectoryEndpoint,
    type RangeTargetEdgeVisual,
} from "./HoverManager";
import { ButtonManager } from "./ButtonManager";
import { SpellBookOverlay } from "./SpellBookOverlay";
import { AIController, cloneAIKnownPaths } from "./AIController";
import { DungeonVisuals } from "./sandbox/DungeonVisuals";
import { SmokeLayer } from "./sandbox/SmokeLayer";
import { SmokeCloudLayer, type ISmokeCloudCell } from "./sandbox/SmokeCloudLayer";
import { VineLayer, type IVineCell } from "./sandbox/VineLayer";
import { FireWallLayer, type IFireWallCell } from "./sandbox/FireWallLayer";
import { WindLayer } from "./sandbox/WindLayer";
import { TerrainCellSnapshotCache } from "./sandbox/TerrainCellSnapshotCache";
import { createCinematicFilter } from "./sandbox/CinematicFilter";
import { LightingLayer } from "./sandbox/LightingLayer";
import { MoveAnimationManager } from "./sandbox/MoveAnimationManager";
import { CombatVisuals } from "./sandbox/CombatVisuals";
import { RangedProjectiles, BIG_PROJECTILE_UNITS } from "./sandbox/RangedProjectiles";
import {
    projectBattlefieldPoint,
    projectedBattlefieldMetricsAtPoint,
    projectedCellPoints,
    projectedRangeAttackCellSideCenter,
    rangeAttackCellSideCenter,
    unprojectBattlefieldPoint,
} from "./sandbox/BattlefieldVisualGrid";
import {
    type IRangeProjectileImpact,
    resolveLiveRangeProjectileTracePosition,
    resolveRangeProjectileImpactPlan,
    resolveRangeProjectilePlaybackPosition,
} from "./sandbox/range_projectile_impact";
import { createSummonedUnitProperties } from "./summonedUnitProperties";
import { isMovementAreaEditorActive } from "./movementAreaTuning";
import { tunedCellFillPolygon } from "./movementAreaVisual";
import { formatCombatRange } from "./combatRange";
import {
    alliesAreTransparent,
    isTargetedSpellReachable,
    targetedSpellBlockerCell,
    targetedSpellBlockerId,
    thrownSpellImpact,
    type TransparencyPredicate,
} from "./spell_targeting";
import type { AuthoritativeGameSnapshot, SceneGameActionTransport } from "../game_action_transport";
import { cloneReplayData, SandboxReplayRecorder, type SandboxReplay } from "../replay/sandbox_replay";
import {
    optimalRangeTargetEdge,
    rangeTargetEdgeEvaluationAim,
    rangeTargetEdgeIsSelectable,
    rangeTargetEdgeMarkerCell,
    rangeTargetEdgeOutwardNotchTip,
    rangeTargetExteriorEdges,
    rangeTrajectoryFootprintExit,
} from "./rangeTargetEdges";
import { pierceSweepPreviewOptions } from "./pierceSweepPreview";
import { isFriendlyTeam, setViewerTeamForColors } from "./teamColors";

/**
 * Client-side aim projection for an offensive spell: what ONE target actually takes.
 *
 * Delegates to common so the number a player is shown and the number the cast deals come out of the same
 * arithmetic. It used to hard-code the stack-powered shape, which multiplied the Battle Mage's flat
 * per-caster book (Fire Strike, Meteorite) by its stack power and projected up to 5x the real damage; the
 * Magic Dragon's book is stack-powered, so it read correctly and hid the bug. Passing the spell's own
 * multiplier is the fix, and it keeps a future spell in either shape honest for free.
 */
export const offensiveSpellPreviewDamage = (
    multiplierType: SpellMultiplierType,
    spellPower: number,
    casterAmountAlive: number,
    casterStackPower: number,
    casterMagicDamageBonusPercentage: number,
    targetMagicResist: number,
    // The target's own element answers the spell's before resistance does, exactly as the engine resolves it
    // (see elementalDamageAgainst): a Fire Element previews a Ring of Fire as 0, a Water Element as half again
    // as much. Defaulted so every non-elemental caller reads the same number it always did.
    elementMultiplier = 1,
): number =>
    offensiveSpellDamageAgainstTarget(
        multiplierType,
        spellPower,
        casterAmountAlive,
        casterStackPower,
        casterMagicDamageBonusPercentage,
        targetMagicResist,
        elementMultiplier,
    );

/**
 * Spell Flesh Shield damage was added to GameEvent after the original client event union. The structural
 * read keeps the client backward-compatible with older journals while giving both sandbox and ranked one
 * typed path to the optional secondary-damage payload.
 */
export const spellCastSecondaryDamage = (event: GameEvent): IVisibleDamage["secondary"] =>
    event.type === "spell_cast"
        ? (event as Extract<GameEvent, { type: "spell_cast" }> & { secondary?: IVisibleDamage["secondary"] }).secondary
        : undefined;

export const shouldSuppressInspectedUnitRangesForSpell = (spell: Spell): boolean => {
    const targetType = spell.getSpellTargetType();
    const targetsOneUnit =
        targetType === SpellTargetType.ANY_ALLY ||
        targetType === SpellTargetType.ANY_ENEMY ||
        targetType === SpellTargetType.ANY_UNIT ||
        targetType === SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE;
    return (
        targetsOneUnit &&
        spell.getPowerType() !== SpellPowerType.POSITION_CHANGE &&
        !isOffensiveSpellMultiplier(spell.getMultiplierType())
    );
};

/**
 * Setup choices are not part of SandboxSceneState, but ranked applies them to FightProperties immediately
 * before hydrating an authoritative snapshot. Capture and restore them around FightStateManager.reset() so
 * every hydrate retains the exact setup that drives placement, stats, artifact buffs, and synergies.
 */
export const captureFightSetupForHydration = (fightProps: FightProperties) =>
    [TeamVals.LOWER, TeamVals.UPPER].map((team) => ({
        team,
        doctrine: fightProps.getDoctrine(team),
        placement: fightProps.getAugmentPlacementLevel(team),
        armor: fightProps.getAugmentArmor(team),
        might: fightProps.getAugmentMight(team),
        empower: fightProps.getAugmentEmpower(team),
        sniper: fightProps.getAugmentSniper(team),
        movement: fightProps.getAugmentMovement(team),
        artifactTier1: fightProps.getArtifactTier1(team),
        artifactTier2: fightProps.getArtifactTier2(team),
        synergies: fightProps.getSynergiesPerTeam(team),
        // Team-independent, but carried per entry to keep the array shape: the per-game synergy-variant
        // draw must survive a hydration reset or the fresh FightProperties falls back to the defaults
        // and every post-reset synergy re-run computes the wrong half of each pair.
        synergyVariants: fightProps.getSynergyVariants(),
    }));

export const restoreFightSetupAfterHydrationReset = (
    fightProps: FightProperties,
    priorSetup: ReturnType<typeof captureFightSetupForHydration>,
): void => {
    for (const setup of priorSetup) {
        fightProps.setSynergyVariants(setup.synergyVariants);
        fightProps.setDoctrinePerTeam(setup.team, setup.doctrine);
        fightProps.setAugmentPerTeam(setup.team, { type: "Placement", value: setup.placement });
        fightProps.setAugmentPerTeam(setup.team, { type: "Armor", value: setup.armor });
        fightProps.setAugmentPerTeam(setup.team, { type: "Might", value: setup.might });
        fightProps.setAugmentPerTeam(setup.team, { type: "Empower", value: setup.empower });
        fightProps.setAugmentPerTeam(setup.team, { type: "Sniper", value: setup.sniper });
        fightProps.setAugmentPerTeam(setup.team, { type: "Movement", value: setup.movement });
        fightProps.setArtifactPerTeam(setup.team, Artifact.ArtifactTier.TIER_1, setup.artifactTier1);
        fightProps.setArtifactPerTeam(setup.team, Artifact.ArtifactTier.TIER_2, setup.artifactTier2);
        fightProps.setSynergiesPerTeam(setup.team, setup.synergies);
    }
};

/** One unit captured at fight start, enough to recreate it exactly on "Rematch". */
interface IUnitFightSnapshot {
    properties: UnitProperties;
    team: TeamType;
    position: HoCMath.XY;
}

/**
 * One unit's freshly-applied effects, captured by the diff but not yet animated. Kept as a per-unit
 * batch (rather than one entry per effect) so the pops keep their stacking order when they finally play.
 */
interface IPendingEffectPop {
    unit: RenderableUnit;
    flash: EffectFlash;
    debuffs: string[];
    buffs: string[];
}

/** One team's pre-fight picks, captured so "Rematch" restores them after the FightProperties reset. */
interface ITeamConfigSnapshot {
    placement: number;
    armor: number;
    might: number;
    empower: number;
    sniper: number;
    movement: number;
    artifactTier1: number;
    artifactTier2: number;
    synergies: string[];
}

/** Full board snapshot taken at fight start (pre-supply) for "Rematch". */
interface IFightSnapshot {
    units: IUnitFightSnapshot[];
    gridType: GridType;
    /** Augments/artifacts/synergies per team. Without these, rematch silently dropped every pick: the
     * FightStateManager reset wipes them, the units were recreated with bare properties, and the sidebar
     * still SHOWED the old selections — a half-default state that read as "rematch doesn't clean up". */
    teamConfigs: Partial<Record<TeamType, ITeamConfigSnapshot>>;
}

/**
 * Which kind of strike, if any, the active unit can land on the mountain it is pointing at.
 *
 * "melee" is CONDITIONAL: it still needs a reachable cell to swing from, which only the scene can work
 * out. Kept separate so that lookup stays lazy -- a shot needs no attack-from cell, and this runs on
 * every mouse move.
 *
 * This is the single rule behind BOTH the themed sword/bow cursor and the click that actually damages
 * the rock. They must not be able to disagree: an attack cursor is a promise that clicking lands a hit.
 */
export type ObstacleAttackKind = "none" | "range" | "melee";

/** Full-damage boundary around an arbitrary footprint; rectangular shooters must not be treated as 2x2. */
export const fullDamageShotRangeForFootprint = (
    xy: HoCMath.XY,
    shotDistance: number,
    footprintWidth: number,
    footprintHeight: number,
): ShotRangeOverlay => {
    const distance = GridMath.getFullDamageSquareHalfExtent(shotDistance, footprintWidth, GridConstants.STEP);
    const verticalDistance = GridMath.getFullDamageSquareHalfExtent(shotDistance, footprintHeight, GridConstants.STEP);
    return verticalDistance === distance ? { xy, distance } : { xy, distance, verticalDistance };
};

export const obstacleAttackKind = (params: {
    hasActiveUnit: boolean;
    gridType: number;
    obstacleHitsLeft: number;
    /** Lazy: this runs on every mouse move, and the cheap map/hit-count gates reject most of them. */
    isCenterCell: () => boolean;
    attackTypeSelection: AttackType;
    /** Lazy for the same reason -- an aggro-matrix lookup is not worth doing off the mountain. */
    canLandRangeHit: () => boolean;
}): ObstacleAttackKind => {
    if (!params.hasActiveUnit || params.gridType !== GridVals.BLOCK_CENTER || params.obstacleHitsLeft <= 0) {
        return "none";
    }
    if (!params.isCenterCell()) {
        return "none";
    }
    if (params.attackTypeSelection === AttackVals.RANGE && params.canLandRangeHit()) {
        return "range";
    }
    // Magic never chips the mountain, so it must not raise an attack cursor over one either. A ranged
    // unit that cannot land its shot (locked in melee, out of ammo) falls through to its melee swing,
    // which is exactly what clicking would do.
    if (params.attackTypeSelection === AttackVals.MAGIC) {
        return "none";
    }
    return "melee";
};

/**
 * Resolve the legal melee landing selected by a pointer over an enemy. This is the unit-target
 * counterpart to `obstacleAttackKind`: the cursor may promise a sword only when the same click can
 * resolve a real melee attack. Range targeting keeps its edge-aware path, but a ranged unit that
 * cannot shoot may still fall through to this melee path.
 */
export const resolveMeleeAttackFromPointer = (params: {
    attackTypeSelection: AttackType;
    hasNoMelee: boolean;
    hasEnemyTarget: boolean;
    targetIsHidden: boolean;
    isForcedTargetAllowed: boolean;
    isCowardiceBlocked: boolean;
    isEngineMeleeTarget: boolean;
    /** Lazy because this runs from every pointer move over an enemy. */
    isRangeAttackPreferred: () => boolean;
    /** Called only after all cheap target legality gates pass. */
    resolveAttackFrom: () => HoCMath.XY | undefined;
    /** Mirrors the engine's final footprint-adjacency validation for the resolved landing. */
    isAttackFromAdjacent: (attackFrom: HoCMath.XY) => boolean;
}): HoCMath.XY | undefined => {
    if (
        params.attackTypeSelection === AttackVals.MAGIC ||
        params.hasNoMelee ||
        !params.hasEnemyTarget ||
        params.targetIsHidden ||
        !params.isForcedTargetAllowed ||
        params.isCowardiceBlocked ||
        !params.isEngineMeleeTarget
    ) {
        return undefined;
    }
    if (params.attackTypeSelection === AttackVals.RANGE && params.isRangeAttackPreferred()) {
        return undefined;
    }
    const attackFrom = params.resolveAttackFrom();
    return attackFrom && params.isAttackFromAdjacent(attackFrom) ? attackFrom : undefined;
};

/** A unit's body in cells, for the overlays (aura squares) that measure outward from it. */
const footprintExtentOf = (unit: Unit): IFootprintExtent => ({
    width: unit.getFootprintWidth(),
    height: unit.getFootprintHeight(),
});

/** Horizontal sword facing for the resolved landing: the blade always points from attacker to target. */
export const resolveMeleeCursorDirection = (attackFromX: number, targetX: number): "left" | "right" =>
    targetX >= attackFromX ? "right" : "left";

/** Full arrow at 1/1; every penalized ranged band uses the broken-arrow badge. */
export const rangedDamageModifierIcon = (
    isRangeAttackContext: boolean,
    attackType: AttackType,
    rangeDivisor: number,
): string | undefined => {
    if (!isRangeAttackContext || attackType !== AttackVals.RANGE) {
        return undefined;
    }
    return rangeDivisor === 1 ? images.combat_range_full_arrow_icon_v1 : images.combat_range_half_broken_arrow_icon_v1;
};

/** Keep the exact falloff fraction readable even when an arrow badge is present. */
export const rangedDamagePredictionText = (
    isRangeAttackContext: boolean,
    rangeDivisor: number,
    damageSpread: string,
): string => (isRangeAttackContext && rangeDivisor > 1 ? `1/${rangeDivisor}  ${damageSpread}` : damageSpread);

export type SceneActionEngine = Pick<GameActionEngine, "apply">;

export interface SandboxSceneUnitState {
    properties: UnitProperties;
    team: TeamType;
    placed: boolean;
    dead: boolean;
    cells: HoCMath.XY[];
    baseCell: HoCMath.XY;
    attackType?: AttackType;
    /** Whether the unit is waiting on the hourglass (so the hourglass icon survives rebuild/replay). */
    onHourglass?: boolean;
    /** Whether the unit already used its one hourglass (wait) this lap — restored into fightProperties so the
     *  ranked client's canHourglass matches the server (else the AI re-requests a rejected wait → skip). */
    hasHourglassed?: boolean;
    /** Aggr forced target: the unit id this unit is compelled to attack (empty/undefined = none). Restored
     *  on rebuild so attack arrows never point at anyone but the forced target. */
    forcedTargetId?: string;
    /** Terrifying Gaze forbidden target: the one enemy this unit cannot attack. Restored independently of
     *  Aggr so every other enemy remains available after a rebuild or ranked snapshot. */
    forbiddenTargetId?: string;
    /** Remaining laps for a mechanically active Break effect. Ranked normally treats snapshot effects as
     *  display-only, but Break must exist in Unit.effects before passive/stat refresh so disabled abilities
     *  (notably Angelic Host) stay disabled in local previews too. */
    mechanicalBreakLaps?: number;
}

export interface SandboxSceneState {
    gridType: GridType;
    currentLap: number;
    fightStarted: boolean;
    fightFinished: boolean;
    currentUnitId?: string;
    narrowingLayers?: number;
    centerDried?: boolean;
    // Remaining hit points of the two BLOCK_CENTER mountains. Snapshotted so a replay checkpoint (or any
    // hydrate) restores the mountains' battered state — without it hydrateSceneState re-inits them to full
    // (setGridType), so a mountain's HP visibly sprang back to full on the turn after it was hit.
    obstacleHitsLeftLeft?: number;
    obstacleHitsLeftRight?: number;
    units: SandboxSceneUnitState[];
}

export interface ReplaySummonMaterialization {
    event: Extract<GameEvent, { type: "unit_summoned" }>;
    unitState: SandboxSceneUnitState;
}

/**
 * Resolve summoned units that an authoritative replay event refers to but the local board does not yet own.
 *
 * Ranked plays the journal BEFORE applying its post-action snapshot. A summon therefore has to be seeded from
 * that snapshot here so `unit_summoned` can animate the exact server-owned id. Re-running the summon locally is
 * not equivalent: both factories use secure random UUIDs, so the local body is absent from the next snapshot and
 * is incorrectly torn down with the generic broken-mirror death effect.
 */
export const getMissingReplaySummons = (
    events: readonly GameEvent[],
    stateAfter: Pick<SandboxSceneState, "units">,
    presentUnitIds: ReadonlySet<string>,
): ReplaySummonMaterialization[] => {
    const stateById = new Map(stateAfter.units.map((unitState) => [unitState.properties.id, unitState]));
    const resolvedIds = new Set(presentUnitIds);
    const missing: ReplaySummonMaterialization[] = [];

    for (const event of events) {
        if (event.type !== "unit_summoned" || resolvedIds.has(event.unitId)) {
            continue;
        }
        const unitState = stateById.get(event.unitId);
        // A malformed/older record is allowed to fall through to the normal snapshot hydrate. A summon that
        // was also killed in this action should likewise not be brought back just to play a spawn animation.
        if (!unitState || unitState.dead) {
            continue;
        }
        resolvedIds.add(event.unitId);
        missing.push({ event, unitState });
    }

    return missing;
};

interface PlacementBenchHitBox {
    center: HoCMath.XY;
    radius: number;
}

/** Multi-hit attacks show each impact on this cadence in both live play and authoritative replays. */
export const ATTACK_HIT_STAGGER_MS = 240;

// Count, band height and art-variant count come from common (scattered_mountains.ts) rather than being
// restated here. Sandbox rolls its own layout because it has no game id to seed from, but it must scatter
// the SAME number of stones over the SAME band as ranked — these were local copies, so a ranked-side change
// would have quietly left the sandbox board on the old count.

/**
 * A chakram ricochet leg too short to fly (adjacent victim, single-cell arc) still waits this beat before
 * landing its hit, so consecutive victims always bleed one after another — never in the same frame.
 */
const CHAKRAM_FLIGHTLESS_HOP_MS = 150;

// Magic Mirror rebound damage numbers: cold cyan rather than the usual red, so a hit the caster took off its
// own reflected spell is instantly distinguishable from the damage it dealt.
const MIRROR_DAMAGE_FILL = "#bfefff";
const MIRROR_DAMAGE_STROKE = "#12384d";

/**
 * Remaining hit points of each center mountain after an `obstacle_attacked` event.
 *
 * A current server sends both sides, and they are simply authoritative. An older one sends only the
 * TOTAL, and the old fallback (FightProperties.setObstacleHitsLeft) re-split that total LEFT-FIRST —
 * `left = min(3, total)`. With both mountains up (3+3), mining the LEFT one walks the total 6→5→4→3
 * while that split reports left=3 the whole way and silently drains the RIGHT mountain instead: the
 * rock the player is actually hitting shows no damage and can never be broken, which is exactly the
 * "can't kill the mountain in ranked, no HP reduced" report. Subtract the landed hits from the side
 * the strike actually landed on instead — `targetPosition` is the struck world point, so anything at
 * or right of the board's center line is the right-hand mountain.
 */
export const nextObstacleHits = (
    event: Extract<GameEvent, { type: "obstacle_attacked" }>,
    current: { left: number; right: number },
    boardCenterX: number,
): { left: number; right: number } => {
    if (event.hitsAfterLeft !== undefined && event.hitsAfterRight !== undefined) {
        return { left: event.hitsAfterLeft, right: event.hitsAfterRight };
    }
    const landed = Math.max(0, event.hitsBefore - event.hitsAfter);
    if ((event.targetPosition?.x ?? boardCenterX) >= boardCenterX) {
        return { left: current.left, right: Math.max(0, current.right - landed) };
    }
    return { left: Math.max(0, current.left - landed), right: current.right };
};

/**
 * Exact impact points an obstacle strike must animate, in landing order.
 *
 * Scattered tombstones emit one `obstacle_attacked` event per destroyed stone, so their recorded positions
 * are already the authoritative Double Shot path. Classic mountains instead aggregate a multi-hit strike
 * into one event; repeat that single position once per landed hit to preserve the existing two-projectile
 * presentation there.
 */
export const obstacleStrikePositions = (events: readonly GameEvent[], fallback: HoCMath.XY): HoCMath.XY[] => {
    const obstacleEvents = events.filter(
        (event): event is Extract<GameEvent, { type: "obstacle_attacked" }> => event.type === "obstacle_attacked",
    );
    if (obstacleEvents.length > 1) {
        return obstacleEvents.map((event) => ({ ...event.targetPosition }));
    }
    const event = obstacleEvents[0];
    const landedHits = event ? Math.max(1, event.hitsBefore - event.hitsAfter) : 1;
    const position = event?.targetPosition ?? fallback;
    return Array.from({ length: landedHits }, () => ({ ...position }));
};

/**
 * Split an area attack's `splash` payload into one bucket per wave.
 *
 * The engine folds every wave of a single area attack into one ordered `splash` array: each wave
 * appends its own entry per unit it damaged, so a unit hit by both waves of a Double Shot appears
 * twice (wave 1 first). Bucketing by how many times a unit has already been seen therefore recovers
 * the waves, and the bucket count IS the number of throws whose damage landed — which is what drives
 * the projectile count, since it survives a ranked replay where the attacker's ability flags do not.
 *
 * Returns `[]` for an empty/absent payload, so callers can treat "no waves" as "nothing to show".
 * Kept pure so it can be unit-tested without a scene.
 */
export const splitAreaThrowWaves = (splash: IVisibleDamage["splash"]): NonNullable<IVisibleDamage["splash"]>[] => {
    const waves: NonNullable<IVisibleDamage["splash"]>[] = [];
    const seenCountByUnitId = new Map<string, number>();
    for (const entry of splash ?? []) {
        const waveIndex = seenCountByUnitId.get(entry.unitId) ?? 0;
        seenCountByUnitId.set(entry.unitId, waveIndex + 1);
        (waves[waveIndex] ??= []).push(entry);
    }
    // A wave that damaged nobody leaves a hole; collapse so `waves.length` stays a true wave count.
    return waves.filter((wave) => wave?.length);
};

/**
 * Which units an attack exchange burns, and how big each burn reads — the rule behind
 * Sandbox.spawnFireDamageVfx, kept pure so it can be unit-tested without a scene.
 *
 * Fire damage arrives on the authoritative `damage.secondary` for the two ability sources (the Efreet's
 * Fire Shield reflect burns whoever struck it; a Black Dragon's breath burns every unit it passes
 * through), while the Fireforged Sword is a BUFF on the attacker rather than its own damage entry — its
 * bonus is the burning blade, so the unit the strike actually landed on ignites. `position` is the
 * engine's impact-time fallback for a unit that no longer exists by the time the burn is drawn.
 */
export const fireBurnTargets = (
    damage: IVisibleDamage | undefined,
    attackerHasFireforgedSword: boolean,
    fallbackVictimId: string,
): { unitId: string; position: HoCMath.XY; scale: number }[] => {
    if (!damage) {
        return [];
    }
    const burns: { unitId: string; position: HoCMath.XY; scale: number }[] = [];
    const burned = new Set<string>();
    for (const entry of damage.secondary ?? []) {
        if (entry.source !== "fire_shield" && entry.source !== "fire_breath") {
            continue;
        }
        if (entry.amount <= 0 && entry.unitsDied <= 0) {
            continue;
        }
        if (burned.has(entry.unitId)) {
            continue;
        }
        burned.add(entry.unitId);
        // A reflect is a lick of flame off a shield; a dragon's breath is the full burn.
        burns.push({
            unitId: entry.unitId,
            position: entry.position,
            scale: entry.source === "fire_shield" ? 0.85 : 1,
        });
    }

    if (!attackerHasFireforgedSword || damage.missed || damage.amount <= 0) {
        return burns;
    }
    // damage.unitId is the unit the handler ACTUALLY hit — a ranged shot can be intercepted before it
    // reaches the clicked target — so it wins over the caller's target.
    const victimId = damage.unitId || fallbackVictimId;
    if (victimId && !burned.has(victimId)) {
        burns.push({ unitId: victimId, position: damage.unitPosition, scale: 1 });
    }
    return burns;
};

/**
 * The block of cells a cell-targeted spell covers when aimed at `origin`.
 *
 * Meteor Shower's 3x3 is CENTRED on the cursor — an odd-sided footprint pivots about the mouse, the way the
 * Fire Wall's 3-cell line does. Everything else here is 2x2 (Meteorite, Smoke, Craft) and hangs off the
 * cursor cell as its bottom-left corner, because an even-sided block has no centre cell to anchor on. Both
 * match what the matching cast handler reads out of `action.targetCell` — a preview whose footprint differs
 * from the cast's is worse than no preview, so this is the ONE place either is derived.
 *
 * Shared by the aim outline and the damage labels drawn inside it, so the two can never disagree.
 */
export function cellTargetedSpellBlockCells(spellName: string, origin: HoCMath.XY): HoCMath.XY[] {
    const spread = spellName === "Meteor Shower" ? [-1, 0, 1] : [0, 1];
    return spread.flatMap((dx) => spread.map((dy) => ({ x: origin.x + dx, y: origin.y + dy })));
}

/** Delay from the first impact until the last impact in a staggered attack. */
export function getAttackFinalImpactDelayMs(hitCount: number): number {
    return Math.max(0, Math.floor(hitCount) - 1) * ATTACK_HIT_STAGGER_MS;
}

export class Sandbox extends PixiScene {
    private static readonly MOVE_SPEED_FACTOR = 16;
    private static readonly REPLAY_ACTION_GAP_MS = 80;
    private static readonly REPLAY_CONTROL_HOLD_MS = 120;
    private static readonly REPLAY_ATTACK_DAMAGE_BASE_HOLD_MS = 300;
    private static readonly REPLAY_ATTACK_AFTER_APPLY_HOLD_MS = 160;
    private static readonly REPLAY_SPELL_HOLD_MS = 150;
    // Longer than any real single replay animation chain (move ~1-2s + attack/retaliation ~2-3s), so
    // it only fires on a genuine hang. On a rare overrun it just snaps the animation to its end and
    // reconciles via the next authoritative snapshot — never a correctness issue, only a visual one.
    private static readonly REPLAY_HANG_WATCHDOG_MS = 5000;
    // Placement cells are shown on the battlefield and projected onto the authored stone seams.
    private static readonly DRAW_TEAM_PLACEMENT_ZONES = true;
    protected readonly grid: Grid;
    private readonly pathHelper: PathHelper;
    private canAttackByMeleeTargets?: IAttackTargets;
    // Mountain pseudo-targets (BLOCK_CENTER): same IAttackTargets shape as enemy units, so mountain
    // melee attacks reuse the identical hover/click machinery.
    private canAttackMountainTargets?: IAttackTargets;
    private canAttackByRangeTargets?: Set<string>;
    // --- Components ---
    private readonly attackHandler: AttackHandler;
    private readonly moveHandler: MoveHandler;
    private hoverManager: HoverManager;
    private buttonManager: ButtonManager;
    private readonly fightStatsTracker = new FightStatsTracker();
    private lastFightSnapshot?: IFightSnapshot;
    // Set while hovering a ranged attack whose line of sight is blocked by the central
    // mountain — the shot (and the click) is redirected to the obstacle instead of the enemy.
    private hoverRangeAttackObstacle?: IAttackObstacle;
    private currentEnemiesCellsWithinMovementRange?: HoCMath.XY[];
    protected unitsOverlay: UnitsOverlay;
    protected placementManager: PlacementManager;
    private spawnPulsePhase = 0;
    private bgKey = "background_new";
    private placementGraphics?: Graphics;
    private placementFrameContainer?: Container;
    private placementBenchGraphics?: Graphics;
    private placementBenchToggleSprite?: Sprite;
    private placementBenchToggleFallback?: Graphics;
    private placementBenchCollapsed = false;
    private placementBenchToggleHitBox?: PlacementBenchHitBox;
    private placementBenchToggleHovered = false;
    private placementBenchSlideOffsetX = 0;
    private placementBenchSlideCancel?: () => void;
    private placementBenchBounds?: { minX: number; maxX: number; minY: number; maxY: number };
    private placementBenchLastGroups: HoCMath.XY[][] = [];
    private readonly placementBenchBaseHitBoxes = new Map<string, PlacementBenchHitBox>();
    private readonly placementBenchHitBoxes = new Map<string, PlacementBenchHitBox>();
    /** Ids of revealed opponent units shown in the opponent placement area; excluded from start checks. */
    private readonly revealedOpponentUnitIds = new Set<string>();
    private selectedBoardUnit?: RenderableUnit;
    // Pointer as received from Pixi, before the painted battlefield is mapped back to the square
    // mechanics grid. Board interaction uses sc_mouseWorld (logical); world-space UI such as the
    // spellbook still needs this unmodified visual point.
    private pointerVisualWorld: HoCMath.XY = { x: 0, y: 0 };
    private isActiveUnitMoving = false;
    private gridMatrix: number[][];
    private gridMatrixNoUnits: number[][];
    private cellToUnitPreRound?: Map<string, Unit>;
    protected readonly unitsHolder: UnitsHolder;
    // Persistent creature-name → team map for scene-log team flags (🟢 LOWER / 🔴 UPPER). Accumulated
    // across the fight so a just-died unit's final line ("X died") still resolves after it's removed
    // from the board. A creature type fielded by BOTH teams is "ambiguous" → no flag (the line's name
    // alone can't say which side it's about).
    private readonly sceneLogTeamByName = new Map<string, number | "ambiguous">();
    // Last-shown active debuff / buff names per unit id, for the sandbox-local effect pop + colour wash
    // (ranked drives the same visuals from authoritative snapshots instead). Seeded silently on first
    // sight so fight start doesn't burst every existing effect.
    private readonly shownDebuffsByUnit = new Map<string, Set<string>>();
    private readonly shownBuffsByUnit = new Map<string, Set<string>>();
    // Buff/debuff pops whose strike hasn't connected yet — see queueOrPlayEffectPops. Held while an
    // attack animation is in flight (projectile still travelling, melee still approaching) and released
    // at impact by flushEffectPops, so an effect never pops before the blow that applied it lands.
    private pendingEffectPops: IPendingEffectPop[] = [];
    private readonly abilityFactory: AbilityFactory;
    private readonly replayRecorder = new SandboxReplayRecorder(() => this.captureSceneState());
    private replayRecordingSuspended = false;
    private replayPlaybackActive = false;
    // Attack events whose kills were already attributed to CombatVisuals (see noteDeathBlowsFromAttackEvent).
    private readonly notedDeathBlowEvents = new WeakSet<object>();
    // A dead stack leaves the simulation immediately, but its authored death atlas must keep ticking
    // until the final ember frame. These detached renderables are updated separately from UnitsHolder.
    private readonly dyingVisualUnits = new Set<RenderableUnit>();
    // The unit whose turn header is currently open in the scene log (sandbox text channel only;
    // ranked builds its headers from the journal). Cleared by that unit's turn_completed.
    private sandboxTurnLogHeaderUnitId?: string;
    // Ranked: a deferred local action (submitActionForAuthoritativeReplay) applies the engine action
    // immediately, mutating unit HP to its post-action value. The authoritative replay that follows
    // derives the attacker's counter-attack damage from an HP diff (getReplayUnitDamage), which would
    // then read 0 — silently dropping the retaliation projectile + damage for the attacking side. We
    // snapshot each unit's pre-action HP and rendered center here so the diff and any removed-unit
    // projectile endpoint use the true before-state.
    private preDeferredActionUnitHp?: Map<
        string,
        { amount: number; cumulativeHp: number; maxHp: number; visualCenter: HoCMath.XY }
    >;
    /** Re-entrancy guard so the eager turn-handoff in applyTurnEngineEvents can't recurse. */
    private isAdvancingTurnEvents = false;
    /**
     * checkStartCondition() runs every pre-fight frame; without this guard the sc_onHasStarted
     * listener was re-connected on every frame, accumulating an unbounded number of duplicate
     * handlers (and leaking their closures). Connect exactly once.
     */
    private startListenerConnected = false;
    private pendingReplayRecords: { action: GameAction; result: IGameActionResult }[] = [];
    /** Active-board-selection state (move existing unit) */
    private draggingUnitId?: string;
    private draggingUnitTeam?: TeamType;
    // A newly picked-up board unit must initially render its placement copy at the unit's own ground
    // point, not at whichever part of the tall sprite happened to receive the click. Once the pointer
    // actually moves, normal cursor-snapped placement resumes.
    private placementDragPointerOrigin?: HoCMath.XY;
    private placementDragPointerMoved = false;
    // --- Placement split-drag: shift-press a placed stack and drag out to peel models into a new
    // stack (default peels 1, source keeps N-1; dragging further past the target grows the peel). ---
    private splitDragActive = false;
    private splitDragSourceId?: string;
    private splitDragSourceCells: HoCMath.XY[] = [];
    private splitDragTargetCells?: HoCMath.XY[];
    private splitDragAmount = 1;
    // How the active split commits: mouse-up (started by shift+press) vs. the next click (started by Shift
    // while a stack was already in hand — that drag has no held button to release). Track Shift for the latter.
    private splitCommitOnClick = false;
    private shiftHeld = false;
    // Live preview of the split-off stack (an actual unit with its real team flag), shown at the target.
    private placementSplitPreviewUnit?: RenderableUnit;
    // Detached visual-only unit for the first hover after selecting a creature from UnitsOverlay. It is
    // never added to UnitsHolder or the grid; it exists solely to resolve the refreshed idle atlas/frame,
    // authored anchor and scale before the real stack is created on click.
    private overlayPlacementPreviewUnit?: RenderableUnit;
    private overlayPlacementPreviewRoot?: Container;
    // Hover hint ("Shift + drag to split"): rolled once per splittable-unit hover (~1/3 chance).
    private splitHintText?: Text;
    private splitHintUnitId?: string;
    private splitHintRoll = false;
    // Aim hint ("Shift to rotate"): shown whenever a rotatable area spell is armed. See
    // updateFireWallRotateHint for why this one does not roll a chance the way the split hint does.
    private fireWallRotateHintText?: Text;
    /** Is there an actual *active* selection (overlay or board)? */
    private hasActiveSelection = false;
    /** True if the active selection came from overlay; false if from board. */
    private selectionFromOverlay = false;
    /** Phase for animating the hover glow (shimmer effect) */
    private hoverGlowPhase = 0;
    private hoverRangeAttackDivisors: number[] = []; // Unified Range Visualization
    // Sandbox-only manual synergy picking (owner call): each team's explicitly chosen variant per
    // faction, re-applied by refreshSynergyNumbers on top of the fight-wide seeded/default variant.
    private sc_synergyVariantChoicePerTeam: Map<TeamType, { [factionName: string]: SpecificSynergy }> = new Map();
    private sc_hoveredShotRange?: ShotRangeOverlay;
    private sc_hoveredAuraRanges?: {
        xy: HoCMath.XY;
        auraRanges: { range: number; isBuff: boolean }[];
        footprint: IFootprintExtent;
    };
    // Movement Visualization
    private sc_placementMoveRange?: HoCMath.XY[];
    // Fight-phase hover: the HOVERED unit's reachable movement cells, drawn as larger rings than the
    // active unit's own path so the two overlays read separately. Recomputed on each hover (hover() is
    // event-driven — mouse-move / selection — not per-frame), so it always reflects the live board.
    private sc_hoveredMoveRange?: HoCMath.XY[];
    private sc_hoveredMoveRangeIsEnemy = false;
    private sc_lastCalcRef?: { unitId: string; x: number; y: number; steps: number; layoutVersion: number };
    private layoutVersion = 0; // Tracks board topology changes during placement
    private atmosphereAlpha = 0; // [NEW] Transition alpha for night/lights
    // --- Scene Setup ---
    private currentActiveUnit?: RenderableUnit;
    // Ranked move-intent relay. `moveIntentSink` (set by the ranked view) ships the local
    // player's live move aim to the opponent; `opponentMoveIntent` holds the opponent's
    // relayed aim so we can preview their unit's silhouette each frame.
    private moveIntentSink?: (unitId: string | undefined, cell: HoCMath.XY | undefined) => void;
    private lastEmittedMoveIntentKey?: string;
    private opponentMoveIntent?: { unitId: string; cell: HoCMath.XY };
    private currentShiftedUnit?: RenderableUnit;
    private currentActivePathHashes?: Set<number>;
    private currentActivePath?: HoCMath.XY[];
    private currentActiveKnownPaths?: Map<number, IWeightedRoute[]>;
    private spawnPulseDirection = 1;
    // Teams fully handed to the AI via the sandbox "AI side" checkboxes (green = LOWER, red = UPPER).
    // Such a team auto-plays every turn and the human can't act for it (board + toolbar locked on its
    // turn). Lets you place units and play vs the AI, or check both to watch two AIs clash.
    private readonly aiControlledTeams = new Set<TeamType>();
    // AIController manages AI decision-making (created in constructor after super())
    private aiController!: AIController;
    // Sandbox turn-timeout takeover: count consecutive missed turns. The 1st is played by the grace turn
    // (see runSandboxGraceTurn) or, once that is spent, a one-shot AI turn; the 2nd in a row turns the AI
    // toggle on. Reset whenever the human acts.
    private sandboxConsecutiveTimeouts = 0;
    // Whether this fight's single grace turn has been spent. Mirrors the server's per-player allowance
    // (play_session.ts graceTurnUsedByPlayer); the sandbox has one human at the keyboard, so one latch
    // matches the global consecutive counter above. Cleared on start_fight, never on a human action —
    // the allowance is once per FIGHT, not once per streak of missed turns.
    private sandboxGraceTurnUsed = false;
    private hasInitializedLap = false;
    /** Guards the one-time prewarm of unit animation atlases once the fight has started. */
    private atlasesPrewarmed = false;
    private gameplayGraphics?: Graphics;
    /** Authored bitmap corners for the shooting-range frame; kept separate from Pixi Graphics in v8. */
    private shotRangeCornerContainer?: Container;
    /** Reachable-cell sheet below tall terrain; rings and targeting previews stay in gameplayGraphics above it. */
    private movementGraphics?: Graphics;
    /** Tracks whether the dynamic board-overlay buffer needs one final clear after it becomes idle. */
    private gameplayGraphicsHasGeometry = false;
    // Protected: RankedPlayScene re-arms it after a mid-turn full hydrate (the armed-spell restore).
    protected currentActiveSpell?: PixiRenderableSpell;
    private hoveredSpell?: PixiRenderableSpell;
    private spellHoverInfoKey = "";
    private drawnNarrowingLaps: Set<number> = new Set();
    // Debug: render the cell grid once (helps verify attack trajectories / cell alignment).
    /** Debug cell-grid overlay master switch — off for now; flip to true to draw the grid again. */
    private static readonly DRAW_DEBUG_GRID = false;
    private gridDebugRendered = false;
    // Spellbook
    private spellBookContainer: Container;
    private spellBookBackdrop: Graphics;
    private spellBookOverlay?: SpellBookOverlay;
    private digitTextures?: Map<number, Texture>;
    // [NEW] Sub-Managers
    // Protected: the ranked scene installs/clears the seeded scattered stones on it from snapshots.
    protected dungeonVisuals: DungeonVisuals;
    private moveAnimManager: MoveAnimationManager;
    private smokeLayer?: SmokeLayer;
    private smokeCloudLayer?: SmokeCloudLayer;
    private readonly smokeCloudSnapshotCache = new TerrainCellSnapshotCache<ISmokeCloudCell>();
    private vineLayer?: VineLayer;
    private readonly vineSnapshotCache = new TerrainCellSnapshotCache<IVineCell>();
    private fireWallLayer?: FireWallLayer;
    private readonly fireWallSnapshotCache = new TerrainCellSnapshotCache<IFireWallCell>();
    /**
     * Which way the armed Fire Wall will lie when the player clicks. Rotated by Shift while aiming (see
     * rotateFireWallAim); reset to the default horizontal lay every time a spell is armed, so the wall never
     * opens on last cast's angle.
     */
    private fireWallAimOrientation: number = FireWallHelper.FireWallOrientation.HORIZONTAL;
    private windLayer?: WindLayer;
    private lightingLayer?: LightingLayer;
    protected combatVisuals: CombatVisuals;
    private rangedProjectiles: RangedProjectiles;
    // Screen-shake state (e.g. Armageddon wave): offsets the world root with a decaying jitter.
    private shakeTimeLeft = 0;
    private shakeDuration = 0;
    private shakeMagnitude = 0;
    private appliedShakeX = 0;
    private appliedShakeY = 0;
    private sandboxAuthoritativeSequence = -1;
    public constructor(context: PixiSceneContext) {
        const gs = new GridSettings(
            GridConstants.GRID_SIZE,
            GridConstants.MAX_Y,
            GridConstants.MIN_Y,
            GridConstants.MAX_X,
            GridConstants.MIN_X,
            GridConstants.MOVEMENT_DELTA,
            GridConstants.UNIT_SIZE_DELTA,
        );
        super(new SceneSettings(gs, false));
        // Sandbox/observer scenes have no participant perspective. Ranked restores its authoritative viewer
        // team as soon as the first snapshot is applied.
        setViewerTeamForColors(undefined);
        this.pathHelper = new PathHelper(this.sc_sceneSettings.getGridSettings());
        this.initialize(context);
        this.sc_gridTypeUpdateNeeded = true;
        this.abilityFactory = new AbilityFactory(new EffectFactory());
        const fp = FightStateManager.getInstance().getFightProperties();
        fp.setDefaultPlacementPerTeam(TeamVals.LOWER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        fp.setDefaultPlacementPerTeam(TeamVals.UPPER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        this.grid = new Grid(
            this.sc_sceneSettings.getGridSettings(),
            FightStateManager.getInstance().getFightProperties().getGridType(),
        );
        this.drawer = new PixiDrawer(this.grid, this.pixiApp.getApplication(), this.pixiApp.getWorldRoot());

        // --- Init Sub-Managers (Early) ---
        this.dungeonVisuals = new DungeonVisuals({
            getStage: () => this.pixiApp.getApplication().stage,
            getWorldRoot: () => this.pixiApp.getWorldRoot(),
            getViewportSize: () => this.getViewportSize(),
            getGridSettings: () => this.sc_sceneSettings.getGridSettings(),
            texAny: (n) => this.texAny(n),
            attachToWorldRoot: (o, z) => this.attachToWorldRoot(o, z ?? 0),
            attachToUnitDepthRoot: (o, z) => this.attachToUnitDepthRoot(o, z ?? 0),
        });

        // The grid type is already decided by now (the scene may open ON the mountain board without anyone
        // touching the map picker), and setGridType — the only other place that rolls — is not called for
        // that opening choice. Without this the board came up with no scattered rock at all, which
        // DungeonVisuals reads as "draw the old two-block mountain" instead, so the default map looked
        // nothing like the same map picked by hand a moment later.
        this.rollScatteredMountains();

        this.moveAnimManager = new MoveAnimationManager({
            getGridSettings: () => this.sc_sceneSettings.getGridSettings(),
            updateSceneLog: (msg) => this.sc_sceneLog.updateLog(msg),
            finishTurn: () => this.finishTurn(),
            setMoveBlocked: (b) => {
                this.sc_moveBlocked = b;
            },
            getHoverManager: () => this.hoverManager,
            getWorldRoot: () => this.pixiApp.getWorldRoot(),
            requestVisibleStateUpdate: () => {
                if (this.sc_visibleState) this.sc_visibleStateUpdateNeeded = true;
            },
        });

        // Procedural smoke for movement tracks — its own layer so the fBM shader only touches dust.
        this.smokeLayer = new SmokeLayer();
        this.attachToWorldRoot(this.smokeLayer.getContainer(), 50);
        // Spell smoke (Wandering Mage). Above the movement dust but below the units, so a creature standing in
        // a cloud is still readable — the cloud is a rule about the cell, not something to hide behind.
        this.smokeCloudLayer = new SmokeCloudLayer();
        this.attachToWorldRoot(this.smokeCloudLayer.getContainer(), 51);
        // Vines sit just above the smoke bank but still well under the units (~4000): they are ground
        // terrain the player plans routes around, not something that should occlude a creature.
        this.vineLayer = new VineLayer();
        this.attachToWorldRoot(this.vineLayer.getContainer(), 52);
        // Fire walls sit at the top of the ground-terrain stack: they are the loudest of the three and the
        // one a player must never miss, but still well under the units for the same reason as the vines.
        this.fireWallLayer = new FireWallLayer();
        this.attachToWorldRoot(this.fireWallLayer.getContainer(), 53);
        this.windLayer = new WindLayer();
        this.attachToWorldRoot(this.windLayer.getContainer(), 50);

        // Cinematic full-scene grade + vignette: post-process the whole game world (camera), which
        // leaves the React/DOM UI untouched and limits the blast radius if the shader misbehaves.
        const cinematic = createCinematicFilter();
        if (cinematic) {
            // Match the display resolution. A camera-wide Filter.from defaults to resolution 1, so it
            // rasterizes the entire world to a 1x render texture and upscales it on HiDPI/Retina
            // displays → the whole scene looks blocky/pixelated (the DOM UI is unaffected).
            cinematic.resolution = this.pixiApp.getApplication().renderer.resolution;
            this.pixiApp.getCamera().filters = [cinematic];
        }

        // Warm torch lighting (additive pools) over the darkened dungeon floor.
        // zIndex must sit below PixiDrawer's unitsContainer (1000), otherwise the darkening overlay
        // shades every placed unit regardless of each sprite's internal depth-sort value. Keep it
        // above terrain/placement graphics so the floor still gets the dungeon lighting pass.
        this.lightingLayer = new LightingLayer(this.sc_sceneSettings.getGridSettings());
        this.attachToWorldRoot(this.lightingLayer.getContainer(), 950);
        // Starts off with the current floor, whose lighting is painted into the texture (see
        // setLegacyBoardBackground); it comes back the moment the legacy, unlit floor is selected.
        // MoonlightLayer is the sole board light; legacy mode must not revive the orange corner braziers.
        this.lightingLayer.setEnabled(false);

        this.combatVisuals = new CombatVisuals({
            getGridSettings: () => this.sc_sceneSettings.getGridSettings(),
            attachToWorldRoot: (o, z) => this.attachToWorldRoot(o, z ?? 0),
            getUnitsHolder: () => this.unitsHolder,
            getSelectedUnitProperties: () => this.sc_selectedUnitProperties,
            updateSelectedUnitProperties: (p) => {
                this.sc_selectedUnitProperties = p;
                // Keep the buff/debuff impact in lockstep with the stats. CombatVisuals refreshes the
                // selected unit on every damage tick (showDamageVisualsFromDiff); without rebuilding the
                // impact here the left sidebar's Debuffs freeze at selection time and show stale/phantom
                // effects (e.g. a Dismorale cleared at the lap flip, or an expired Freeze) as the fight runs.
                this.setSelectedUnitProperties(p);
            },
            setUnitPropertiesUpdateNeeded: (b) => {
                this.sc_unitPropertiesUpdateNeeded = b;
            },
        });
        // Pay the floating-damage text's one-time font/shader cost now (at load), not on the first
        // move+attack landing frame — that one-time render was the ~34ms of the 39.8ms hitch.
        this.combatVisuals.prewarm();

        this.rangedProjectiles = new RangedProjectiles({
            getGridSettings: () => this.sc_sceneSettings.getGridSettings(),
            attachToWorldRoot: (o, z) => this.attachToWorldRoot(o, z ?? 0),
            texAny: (n) => this.texAny(n),
            onProjectileFired: () => this.hoverManager.clearAttackVisuals(),
        });

        // Hole container init is now in DungeonVisuals
        // We need to attach it here
        this.attachToWorldRoot(this.dungeonVisuals.getHoleContainer(), 1);
        this.spellBookContainer = new Container();
        this.spellBookContainer.visible = false;
        this.spellBookContainer.sortableChildren = true;
        this.spellBookContainer.zIndex = 7000;
        this.spellBookBackdrop = new Graphics();
        this.spellBookBackdrop.zIndex = -1;
        this.spellBookContainer.addChild(this.spellBookBackdrop);
        // Add Book Background Graphic
        const bookTex = this.texAny("book_1024_clean_pages_v1");
        if (bookTex) {
            const bookSprite = new Sprite(bookTex);
            bookSprite.anchor.set(0.5);
            bookSprite.position.set(0, 0);
            bookSprite.zIndex = 0;
            this.spellBookContainer.addChild(bookSprite);
        }
        const { width, height } = context.pixiApp.getApplication().screen;
        this.layoutSpellBook(width, height);

        context.pixiApp.getUIContainer().sortableChildren = true;
        context.pixiApp.getUIContainer().addChild(this.spellBookContainer);
        context.pixiApp.getApplication().stage.sortableChildren = true;

        this.unitsHolder = new UnitsHolder(this.grid);
        this.attackHandler = new AttackHandler(
            this.sc_sceneSettings.getGridSettings(),
            this.grid,
            this.sc_sceneLog,
            new DamageStatisticHolder(),
        );
        this.moveHandler = new MoveHandler(this.sc_sceneSettings.getGridSettings(), this.grid, this.unitsHolder);
        // Prefix each scene-log line with its side's colour (🟢 LOWER / 🔴 UPPER), like the ranked log.
        // The engine writes plain text lines; the resolver tags them by the unit they're about. Ranked
        // overrides resolveSceneLogTeamFlag() to "" since it rebuilds + prefixes its own log by unit id.
        this.sc_sceneLog.setTeamFlagResolver((line) => this.resolveSceneLogTeamFlag(line));
        this.refreshVisibleStateIfNeeded();
        // Re-roll the rock every time the mountain board is picked — including picking it again after a
        // detour through another map, which is the whole point of rolling here rather than once at startup.
        this.rollScatteredMountains();
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        this.placementManager = new PlacementManager(this.sc_sceneSettings.getGridSettings());

        this.unitsOverlay = new UnitsOverlay(
            context.pixiApp.getApplication(),
            (name) => this.texAny(name),
            (props) => {
                if (props) {
                    this.selectionFromOverlay = true;
                    this.hasActiveSelection = true;
                    this.placementDragPointerOrigin = undefined;
                    this.placementDragPointerMoved = false;
                    this.sc_selectedFactionType = FactionVals.NO_FACTION as FactionType;
                    this.sc_factionNameUpdateNeeded = true;
                    if (this.selectedBoardUnit) {
                        this.selectedBoardUnit.setBoardSelected(false);
                        this.selectedBoardUnit = undefined;
                    }
                    this.draggingUnitId = undefined;
                    this.draggingUnitTeam = undefined;
                    this.sc_selectedUnitProperties = props;
                    this.setSelectedUnitProperties(props);
                    this.hoverManager.resetHover(true);
                } else {
                    if (this.selectionFromOverlay) {
                        this.Deselect(false, true);
                    }
                }
            },
            (name) => {
                const p = this.unitsOverlay?.getUnitProperties(name);
                return p ? p.amount_alive : 99;
            },
        );
        this.unitsOverlay.build();
        if (this.sc_gameActionTransport) {
            this.unitsOverlay.setVisible(false);
        }

        this.hoverManager = new HoverManager({
            grid: this.grid,
            pathHelper: this.pathHelper,
            unitsHolder: this.unitsHolder,
            sceneSettings: this.sc_sceneSettings,
            placementManager: this.placementManager,
            abilityFactory: this.abilityFactory,
            texAny: (name) => this.texAny(name),
            attachToWorldRoot: (obj, z) => this.attachToWorldRoot(obj, z),
            attachToCursorOverlay: (obj, zIndex = 0) => {
                const cursorOverlayRoot = this.pixiApp.getCursorOverlayRoot();
                if (obj.parent !== cursorOverlayRoot) {
                    obj.removeFromParent();
                    cursorOverlayRoot.addChild(obj);
                }
                if (!cursorOverlayRoot.sortableChildren) cursorOverlayRoot.sortableChildren = true;
                obj.zIndex = zIndex;
            },
            getPlacement: (t, i) => this.getPlacement(t, i),
            getMouseWorld: () => this.sc_mouseWorld,
            getCameraScale: () => {
                const { x, y } = this.pixiApp.getCamera().scale;
                return { x, y };
            },
            getCurrentActiveUnit: () => this.currentActiveUnit,
            getCurrentActivePathHashes: () => this.currentActivePathHashes,
            getCurrentActiveKnownPaths: () => this.currentActiveKnownPaths,
            getDraggingUnitId: () => this.draggingUnitId,
            getDraggingUnitTeam: () => this.draggingUnitTeam,
            getPlacementPreviewUnit: () => this.getPlacementPreviewUnit(),
            getSelectedUnitProperties: () => this.sc_selectedUnitProperties,
            hasActiveSelection: () => this.hasActiveSelection,
        });

        // Spellbook open/close and spell selection are handled authoritatively in MouseDown()
        // (see the "SPELLBOOK" block there). A separate stage 'pointerdown' closer used to race
        // with MouseDown and swallow spell-selection clicks, so it has been removed.
        context.pixiApp.getApplication().stage.eventMode = "static";

        this.buttonManager = new ButtonManager(
            {
                getCurrentActiveUnit: () => this.currentActiveUnit,
                getSceneLog: () => this.sc_sceneLog,
                getGridSettings: () => this.sc_sceneSettings.getGridSettings(),
                applyGameAction: (action) => this.applyGameAction(action),
                refreshUnits: () => this.refreshUnits(),
                updateCurrentMovePath: (c) => this.updateCurrentMovePath(c),
                setUnitPropertiesUpdateNeeded: (n) => {
                    this.sc_unitPropertiesUpdateNeeded = n;
                },
                setCurrentEnemiesCellsWithinMovementRange: (c) => {
                    this.currentEnemiesCellsWithinMovementRange = c;
                },
                setSelectedAttackType: (t) => {
                    this.sc_selectedAttackType = t;
                },
                setCurrentActiveSpell: (s) => {
                    this.currentActiveSpell = s;
                },
                getCurrentActiveSpell: () => this.currentActiveSpell,
                getVisibleState: () => this.sc_visibleState,
                isInputLockedByAI: () => this.isBoardInputLockedByAI(),
                canControlCurrentActiveUnit: () => this.canControlCurrentActiveUnit(),
                hasUnactedTeammateInCurrentLap: (unit) => this.hasUnactedTeammateInCurrentLap(unit),
                setVisibleButtons: (buttons, updated) => {
                    this.sc_visibleButtonGroup = buttons;
                    this.sc_buttonGroupUpdated = updated;
                },
                setAIActive: (active) => {
                    this.sc_isAIActive = active;
                    this.aiController.isAIActive = active; // Sync AIController state
                    if (active) {
                        this.clearBoardHoverPreviews();
                    }
                    this.onAiToggleChanged(active);
                },
                isHourglassDenied: () => hasActiveTimeDenial(this.unitsHolder.getAllUnits().values()),
                setSpellBookOverlay: (active) => {
                    this.sc_renderSpellBookOverlay = active;
                    this.spellBookOverlay?.setOpen(active);
                    this.pixiApp.getWorldRoot().filters = active ? [new BlurFilter({ strength: 8 })] : [];
                },
            },
            this.sc_isAIActive,
        );

        this.moveHandler = new MoveHandler(this.sc_sceneSettings.getGridSettings(), this.grid, this.unitsHolder);

        HoCLib.interval(() => this.updateVisibleTurnTimer(), 500);

        // Initialize AI Controller with IAIContext implementation
        this.aiController = new AIController({
            getCurrentActiveUnit: () => this.currentActiveUnit,
            getTurnActivationKey: () => this.getTurnActivationKey(),
            getGrid: () => this.grid,
            getGridMatrix: () => this.gridMatrix,
            getUnitsHolder: () => this.unitsHolder,
            getAttackHandler: () => this.attackHandler,
            getPathHelper: () => this.pathHelper,
            getHoverManager: () => this.hoverManager,
            getButtonManager: () => this.buttonManager,
            getSceneSettings: () => this.sc_sceneSettings,
            getSceneLog: () => this.sc_sceneLog,
            setCurrentActiveKnownPaths: (paths) => {
                this.currentActiveKnownPaths = cloneAIKnownPaths(paths);
            },
            setSelectedAttackType: (type) => {
                this.sc_selectedAttackType = type;
            },
            isAuthoritativeAction: (action) => this.shouldDeferActionToAuthoritativeReplay(action),
            getToggleAiControlledTeam: () => this.getToggleAiControlledTeam(),
            isTeamAiControlled: (team) => this.isTeamAiControlled(team),
            applyGameAction: (action) => this.applyGameAction(action),
            executeAttackSequence: (attacker, target, attackFrom, replayAction) =>
                this.executeAttackSequence(attacker, target, attackFrom, replayAction),
            executeMoveSequence: (unit, path, overrideFootprint, onComplete, replayAction, rapidCharge, continueTurn) =>
                this.executeMoveSequence(
                    unit,
                    path,
                    overrideFootprint,
                    onComplete,
                    replayAction,
                    rapidCharge,
                    continueTurn,
                ),
            executeObstacleAttackSequence: (unit, targetWorldPosition, attackFromCell, onComplete) =>
                this.executeObstacleAttackSequence(unit, targetWorldPosition, attackFromCell, onComplete),
            refreshUnits: () => this.refreshUnits(),
            ensureAuthoritativeAuraState: () => this.ensureAuthoritativeAuraState(),
            ensureAuthoritativeGrid: () => this.ensureAuthoritativeGrid(),
        });

        this.spellBookOverlay = new SpellBookOverlay(
            context.pixiApp.getUIContainer(),
            context.pixiApp.getApplication().screen.width,
            context.pixiApp.getApplication().screen.height,
        );
        // --- Init Sub-Managers Moved UP ---

        // Dev/e2e hook: drive the on-canvas "AI toggle" (autobattle) from automated tests without
        // having to click the Pixi button. window.__hocSetAI(true) makes the local team auto-play.
        if (import.meta.env.DEV && typeof window !== "undefined") {
            const w = window as unknown as {
                __hocSetAI?: (active: boolean) => void;
                __hocAiState?: () => Record<string, unknown>;
                __hocGetLog?: () => string;
                __hocVisibleState?: () => Record<string, unknown>;
                __hocFloorLight?: () => Record<string, unknown>;
                __hocAtmosphere?: () => Record<string, unknown>;
            };
            // Why the floor's firelight is not moving: see getFireLightDiagnostics.
            w.__hocFloorLight = () => this.dungeonVisuals.getFireLightDiagnostics();
            w.__hocAtmosphere = () => ({ available: false });
            w.__hocSetAI = (active: boolean) => {
                this.sc_isAIActive = active;
                this.aiController.isAIActive = active;
                this.buttonManager.sc_isAIActive = active;
                if (active) {
                    this.clearBoardHoverPreviews();
                }
            };
            // Headless-harness hook: read the authoritative battle log (same lines the player sees) so an
            // automated run can measure skip/timeout/hourglass rates over many AI-vs-AI games.
            w.__hocGetLog = () => this.sc_sceneLog.getLog();
            // QA rig for the units overlay: canvas-space click targets (tabs + visible chips), so
            // automation can exercise every chip and assert the selection instead of guessing pixels.
            (w as { __hocOverlayClickMap?: () => unknown }).__hocOverlayClickMap = () =>
                this.unitsOverlay?.getDebugClickMap();
            // Diagnostic snapshot of the AI-gating state — lets a headless runner explain WHY the
            // autobattle isn't acting during a silent stall (which gate is stuck).
            w.__hocAiState = () => {
                const u = this.currentActiveUnit;
                const fp = FightStateManager.getInstance().getFightProperties();
                return {
                    fightStarted: fp.hasFightStarted(),
                    fightFinished: fp.hasFightFinished(),
                    lowerAlive: fp.getTeamUnitsAlive(TeamVals.LOWER),
                    upperAlive: fp.getTeamUnitsAlive(TeamVals.UPPER),
                    activeUnit: u ? `${u.getName()}:${u.getTeam()}` : null,
                    controlledTeam: this.getToggleAiControlledTeam() ?? null,
                    isAIActive: this.aiController.isAIActive,
                    performingAction: this.aiController.performingAction,
                    replayPlaybackActive: this.replayPlaybackActive,
                    isPlayingActionAnimation: this.isPlayingActionAnimation(),
                    isActiveUnitMoving: this.isActiveUnitMoving,
                    moveBlocked: this.sc_moveBlocked,
                    boardInputLockedByAI: this.isBoardInputLockedByAI(),
                    // Replay/hydrate leak diagnostics: logical units vs pixi children in the units
                    // container. A doubling board with a normal holder count = orphaned visuals.
                    unitsInHolder: this.unitsHolder.getAllUnits().size,
                    unitsContainerChildren: this.drawer?.getUnitsContainer()?.children?.length ?? -1,
                };
            };
            // Visual smoke/tuning hook for the missed-attack VFX: fires the "MISS" pop + bullet-time
            // dodge on the first two placed units (second dodges, first "attacks") without needing a
            // real in-fight miss roll — the animation only plays for ~900ms, so an on-demand trigger is
            // the only reliable way to eyeball or screenshot it.
            (w as { __hocMissVfxTest?: () => boolean }).__hocMissVfxTest = () => {
                const units = [...this.unitsHolder.getAllUnits().values()];
                if (units.length < 2) {
                    return false;
                }
                const attacker = units[0] as RenderableUnit;
                const target = units[1] as RenderableUnit;
                this.showAttackMissedVfx(attacker, target, {
                    amount: 0,
                    render: false,
                    unitPosition: target.getPosition(),
                    unitIsSmall: target.isSmallSize(),
                    unitId: target.getId(),
                    missed: true,
                });
                return true;
            };
            // Same idea for the Lucky Strike proc VFX: fire the gold flash + "LUCKY!" on the first
            // placed unit on demand (the proc is a ~35% roll — waiting for a natural one wastes time).
            (w as { __hocLuckyVfxTest?: () => boolean }).__hocLuckyVfxTest = () => {
                const units = [...this.unitsHolder.getAllUnits().values()];
                if (!units.length) {
                    return false;
                }
                this.spawnLuckyStrikeVfx({
                    amount: 0,
                    render: false,
                    unitPosition: units[0].getPosition(),
                    unitIsSmall: units[0].isSmallSize(),
                    luckyStrikeBy: [units[0].getId()],
                });
                return true;
            };
            // And for the resurrection burst + head-count label: play it over the first placed unit
            // with the given raised amount (a real raise needs a dead stack and an Angel's cast).
            (w as { __hocResurrectVfxTest?: (amount?: number) => boolean }).__hocResurrectVfxTest = (
                amount?: number,
            ) => {
                const gs = this.sc_sceneSettings.getGridSettings();
                const units = [...this.unitsHolder.getAllUnits().values()];
                const position =
                    units[0]?.getPosition() ??
                    GridMath.getPositionForCell({ x: 8, y: 8 }, gs.getMinX(), gs.getStep(), gs.getHalfStep());
                this.renderResurrectionVfx(position, amount ?? 3);
                return true;
            };
            // Enchant (rune) pop, for label QA: "+N armor/attack" clipping is only visible rendered.
            (w as { __hocEnchantVfxTest?: (total?: number, armor?: boolean) => boolean }).__hocEnchantVfxTest = (
                total?: number,
                armor?: boolean,
            ) => {
                const gs = this.sc_sceneSettings.getGridSettings();
                const iconTexture = this.texAny(armor ? "armor_rune_256" : "weapon_rune_256");
                if (!iconTexture) {
                    return false;
                }
                const units = [...this.unitsHolder.getAllUnits().values()];
                const position =
                    units[0]?.getPosition() ??
                    GridMath.getPositionForCell({ x: 8, y: 8 }, gs.getMinX(), gs.getStep(), gs.getHalfStep());
                this.combatVisuals?.spawnEnchantResult(position, gs.getCellSize(), {
                    tint: armor ? 0x59b6ff : 0xff7a3c,
                    iconTexture,
                    label: `+${total ?? 2} ${armor ? "armor" : "attack"}`,
                    success: true,
                });
                return true;
            };
            // And for the melee death "cleave": tear the first placed unit along a CALLER-CHOSEN blow
            // direction (world dx/dy, attacker -> victim). Deterministic — it calls the cleave directly
            // rather than rolling the 50% dispatcher — so an automated run can screenshot the cut at a
            // known angle and assert the slash actually follows the strike line.
            (w as { __hocCleaveVfxTest?: (dx: number, dy: number) => boolean }).__hocCleaveVfxTest = (
                dx: number,
                dy: number,
            ) => {
                const units = [...this.unitsHolder.getAllUnits().values()];
                const victim = units[0] as RenderableUnit | undefined;
                const info = victim?.getShatterInfo();
                if (!info || !this.combatVisuals) {
                    return false;
                }
                (
                    this.combatVisuals as unknown as {
                        spawnCleaveDeath(i: typeof info, dir?: { x: number; y: number }): void;
                    }
                ).spawnCleaveDeath(info, { x: dx, y: dy });
                return true;
            };
            // Diagnostic: the ENGINE's augment + placement-zone truth for a team — lets a headless run
            // (or a human in the console) confirm a picked Placement level actually reached
            // FightProperties and what rows the rebuilt zone covers, independent of the React sidebar.
            (w as { __hocPlacementState?: (team?: number) => Record<string, unknown> }).__hocPlacementState = (
                team = TeamVals.LOWER,
            ) => {
                const fp = FightStateManager.getInstance().getFightProperties();
                const zone = this.getPlacement(team as TeamType, 0);
                const cells = zone?.possibleCellPositions() ?? [];
                return {
                    augmentPlacementLevel: fp.getAugmentPlacementLevel(team as TeamType),
                    placementSizes: fp.getAugmentPlacement(team as TeamType),
                    zoneCellCount: cells.length,
                    zoneRowSpan: cells.length
                        ? [Math.min(...cells.map((c) => c.y)), Math.max(...cells.map((c) => c.y))]
                        : null,
                };
            };
            // Diagnostic twin of the sidebar's augment click: drive the SCENE's own propagation directly,
            // bypassing React — separates "engine/zone path broken" from "UI holds a stale scene".
            (w as { __hocPropagatePlacement?: (level?: number, team?: number) => boolean }).__hocPropagatePlacement = (
                level = 1,
                team = TeamVals.LOWER,
            ) => this.propagateAugmentation(team as TeamType, { type: "Placement", value: level });
            // Visual smoke/tuning hook for the mountain-collapse VFX: crashes one/both mountains apart
            // on demand (BLOCK_CENTER map only) without grinding their hit points down in a real fight.
            (w as { __hocMountainCollapseTest?: (side?: "left" | "right") => boolean }).__hocMountainCollapseTest = (
                side?: "left" | "right",
            ) => {
                if (FightStateManager.getInstance().getFightProperties().getGridType() !== GridVals.BLOCK_CENTER) {
                    return false;
                }
                if (side !== "right") this.dungeonVisuals.spawnMountainCollapse("left");
                if (side !== "left") this.dungeonVisuals.spawnMountainCollapse("right");
                return true;
            };
            // Diagnostic view of the PUBLISHED visible state + the pending-emission flag — lets an e2e
            // run explain a missing fight-results overlay: was the finish never published (scene bug),
            // published but never emitted (manager tick bug), or emitted with a winner mismatch.
            w.__hocVisibleState = () => ({
                updateNeeded: this.sc_visibleStateUpdateNeeded,
                hasFinished: this.sc_visibleState?.hasFinished,
                teamWin: this.sc_visibleState?.teamWin,
                statsWinner: this.sc_visibleState?.fightStats?.winner,
                lowerStartTotal: this.sc_visibleState?.fightStats?.lowerStartTotal,
                upperStartTotal: this.sc_visibleState?.fightStats?.upperStartTotal,
            });
        }
    }
    protected updateVisibleTurnTimer(): void {
        if (!this.sc_visibleState) return;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        this.sc_visibleState.secondsMax = (fightProps.getCurrentTurnEnd() - fightProps.getCurrentTurnStart()) / 1000;
        const remaining = (fightProps.getCurrentTurnEnd() - HoCLib.getTimeMillis()) / 1000;
        this.sc_visibleState.secondsRemaining = remaining > 0 ? remaining : 0;
        this.syncAiToggleToVisibleState();
        this.sc_visibleStateUpdateNeeded = true;
    }
    /**
     * Mirror the live AI toggle onto the visible state so the "AI on" badge tracks it. Extracted so the
     * ranked scene — which overrides updateVisibleTurnTimer() to drive the timer off the server clock and
     * would otherwise never set this — can reuse the single source of truth (aiController.isAIActive).
     */
    protected syncAiToggleToVisibleState(): void {
        if (!this.sc_visibleState) return;
        this.sc_visibleState.aiToggleOn = this.aiController.isAIActive;
    }
    /** Flip the replay-playback flag and mirror it to the visible state so the React "Exit Replay" button appears. */
    protected setReplayPlaybackActive(active: boolean): void {
        this.replayPlaybackActive = active;
        if (this.sc_visibleState) {
            this.sc_visibleState.replayPlaybackActive = active;
            this.sc_visibleStateUpdateNeeded = true;
        }
    }
    protected setLocalModelTeamOverride(team: TeamType | undefined): void {
        this.aiController.setLocalModelTeamOverride(team);
    }
    /** The team the local player is viewing as, or undefined when there is no single viewer (local
     *  sandbox / spectator). Ranked overrides this so hover previews respect concealment (Hidden units)
     *  from the opponent's perspective. */
    protected getViewerTeam(): TeamType | undefined {
        return undefined;
    }
    public override getUnitsOverlay(): UnitsOverlay | undefined {
        return this.sc_gameActionTransport ? undefined : this.unitsOverlay;
    }
    public override setGameActionTransport(transport?: Parameters<PixiScene["setGameActionTransport"]>[0]): void {
        super.setGameActionTransport(transport);
        this.updateUnitsOverlayVisibility();
    }
    protected selectSceneUnitForPlacement(unitId: string): boolean {
        const unit = this.unitsHolder.getAllUnits().get(unitId) as RenderableUnit | undefined;
        if (!unit || FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
            return false;
        }

        const alreadySelected =
            this.selectedBoardUnit?.getId() === unit.getId() &&
            this.draggingUnitId === unit.getId() &&
            this.hasActiveSelection &&
            !this.selectionFromOverlay;
        if (this.selectedBoardUnit && this.selectedBoardUnit !== unit) {
            this.selectedBoardUnit.setBoardSelected(false);
        }
        this.selectedBoardUnit = unit;
        this.selectedBoardUnit.setBoardSelected(true);
        this.hasActiveSelection = true;
        this.selectionFromOverlay = false;
        this.draggingUnitId = unit.getId();
        this.draggingUnitTeam = unit.getTeam();
        this.placementDragPointerOrigin = { ...this.sc_mouseWorld };
        this.placementDragPointerMoved = false;
        this.sc_selectedUnitProperties = unit.getUnitProperties();
        this.setSelectedUnitProperties(this.sc_selectedUnitProperties);
        this.sc_unitPropertiesUpdateNeeded = true;
        if (!alreadySelected) {
            this.hoverManager.resetBoardHoverState();
            this.hoverManager.resetHover(true);
        }
        return true;
    }
    public override selectAuthoritativeUnit(unitId: string): void {
        this.selectSceneUnitForPlacement(unitId);
    }
    protected shouldRenderUnplacedUnitBench(_unitState: SandboxSceneUnitState): boolean {
        return false;
    }
    /**
     * Whether Armageddon-wave VFX (floating damage + screen shake) are rendered inline from engine
     * events. True in the sandbox; RankedPlayScene overrides it to false and renders the wave from the
     * authoritative journal instead (the inline path doesn't fire reliably there).
     */
    protected shouldRenderArmageddonInline(): boolean {
        return true;
    }
    /**
     * Whether the lap-start Morale/Dismorale pop is rendered inline from engine events. True in the
     * sandbox; RankedPlayScene overrides it to false and renders it from the authoritative journal
     * instead (the inline replay path doesn't carry lap-flip events reliably there — same as Armageddon).
     */
    protected shouldRenderMoraleInline(): boolean {
        return true;
    }
    /**
     * Whether the poison DoT tick VFX (green number + drifting cloud) is rendered inline from engine
     * events. True in the sandbox; RankedPlayScene overrides it to false and renders it from the
     * authoritative journal instead. poison_ticked is emitted in the turn-advance batch (activateNextUnit),
     * the SAME journal entry as Morale/Armageddon, and rides the replayed player action — so without this
     * suppression the ranked local replay would render each tick once AND renderNewlyAppliedPoison a second
     * time (a double green number + double cloud).
     */
    protected shouldRenderPoisonInline(): boolean {
        return true;
    }
    protected getUnplacedUnitBenchGroupKey(_unitState: SandboxSceneUnitState): string {
        return "default";
    }
    /**
     * Uniform scale for units shown on the unplaced placement bench (the cluster centered on the
     * board during placement). 1 = one board cell. Scenes can render the bench bigger so the
     * waiting units read at "full size"; the layout spacing, hitboxes and backdrop padding all
     * scale with this value.
     */
    protected getUnplacedBenchUnitScale(): number {
        return 1;
    }
    protected getUnplacedUnitBenchPosition(
        index: number,
        total: number,
        _unitState?: SandboxSceneUnitState,
    ): HoCMath.XY | undefined {
        if (total <= 0) {
            return undefined;
        }

        const gs = this.sc_sceneSettings.getGridSettings();
        const cell = gs.getCellSize();
        const scale = this.getUnplacedBenchUnitScale();
        const columns = Math.min(4, total);
        const rows = Math.ceil(total / columns);
        const column = index % columns;
        const row = Math.floor(index / columns);
        const centerX = (gs.getMinX() + gs.getMaxX()) / 2;
        const centerY = (gs.getMinY() + gs.getMaxY()) / 2;

        return {
            x: centerX + (column - (columns - 1) / 2) * cell * 1.45 * scale,
            y: centerY + (row - (rows - 1) / 2) * cell * 1.35 * scale,
        };
    }
    protected shouldGhostUnplacedUnitBenchUnit(_unitState: SandboxSceneUnitState): boolean {
        return false;
    }
    /**
     * Map of unitId -> world position for revealed opponent units that should be displayed (ghosted,
     * spread out so they never stack) inside the opponent's placement area instead of their real,
     * hidden positions. Base scenes have no such concept; ranked play overrides this.
     */
    protected getRevealedOpponentUnitPositions(_units: SandboxSceneUnitState[]): Map<string, HoCMath.XY> {
        return new Map();
    }
    protected shouldShowPlacementBenchToggle(): boolean {
        return false;
    }
    protected shouldGhostCurrentPlacementBenchUnit(_unit: Unit): boolean {
        return false;
    }
    protected getCurrentActiveUnit(): RenderableUnit | undefined {
        return this.currentActiveUnit;
    }
    /**
     * Whether a destination silhouette should be drawn while this unit's recorded move animates.
     * Ranked play uses it for the opponent's units so the viewer sees the target cell during the
     * move even when no live move-aim was relayed (e.g. a quick click). Base scenes don't.
     */
    protected shouldShowMoveDestinationSilhouette(_unit: RenderableUnit): boolean {
        return false;
    }
    /**
     * Whether the currently active unit belongs to the viewer's enemy (ranked play). Drives the red
     * "enemy turn" cues — the active-unit aura, movement highlight, and board-edge glow. Always
     * false in the base scene (single-player sandbox has no opposing viewer).
     */
    protected isEnemyActiveTurn(): boolean {
        return false;
    }
    /**
     * The team the generic "AI toggle" (autobattle) may auto-play, or undefined for no restriction.
     * The base sandbox returns undefined so single-player autobattle can drive whichever unit is
     * active (both sides). Ranked restricts it to the local player's team so the toggle only
     * auto-plays the player's own units, never the opponent's.
     */
    protected getToggleAiControlledTeam(): TeamType | undefined {
        return undefined;
    }
    /** Ranked: install the sink that relays this player's live move aim to the opponent. */
    public override setMoveIntentSink(sink?: (unitId: string | undefined, cell: HoCMath.XY | undefined) => void): void {
        this.moveIntentSink = sink;
        if (!sink) {
            this.lastEmittedMoveIntentKey = undefined;
        }
    }
    /** Ranked: receive the opponent's relayed move aim (undefined clears it). */
    public override setOpponentMoveIntent(intent?: { unitId: string; cell: HoCMath.XY }): void {
        this.opponentMoveIntent = intent;
        if (!intent) {
            this.hoverManager.clearOpponentIntentSilhouette();
        }
    }
    /**
     * Emit the local player's current move aim, de-duplicated so a relay only goes out when
     * the targeted cell (or active unit) actually changes. Only fires when a sink is wired,
     * i.e. ranked play; hover() already gates this to the viewer's own turn.
     */
    private emitLocalMoveIntent(cell: HoCMath.XY | undefined): void {
        if (!this.moveIntentSink) {
            return;
        }
        const unitId = this.currentActiveUnit?.getId();
        const key = cell && unitId ? `${unitId}:${cell.x},${cell.y}` : "none";
        if (key === this.lastEmittedMoveIntentKey) {
            return;
        }
        this.lastEmittedMoveIntentKey = key;
        this.moveIntentSink(unitId, cell && unitId ? cell : undefined);
    }
    /** Ranked: draw the opponent's relayed move silhouette. Driven every frame from Step(). */
    private renderOpponentMoveIntent(): void {
        const intent = this.opponentMoveIntent;
        if (!intent) {
            return;
        }
        // Stop previewing once the aim's unit is no longer the one taking its turn (the
        // turn passed back to us, or moved on) — the relay is only valid for the active unit.
        if (this.currentActiveUnit?.getId() !== intent.unitId) {
            this.opponentMoveIntent = undefined;
            this.hoverManager.clearOpponentIntentSilhouette();
            return;
        }
        const unit = this.unitsHolder.getAllUnits().get(intent.unitId) as RenderableUnit | undefined;
        if (!unit) {
            this.hoverManager.clearOpponentIntentSilhouette();
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const props = unit.getUnitProperties();
        let center: HoCMath.XY | undefined;
        if (footprintWidthOf(props) > 1 || footprintHeightOf(props) > 1) {
            // findLargeUnitMoveCandidate needs the active unit's reachable-path hashes, which the viewer
            // never has for the OPPONENT's unit — so it always returned null and multi-cell opponents got
            // no move silhouette (one-cell ones worked, since they skip that path). Pick a valid footprint
            // around the relayed cell from board geometry + occupancy instead.
            const footprint = this.findOpponentLargeUnitFootprint(unit, intent.cell);
            center = footprint ? GridMath.getPositionForCells(gs, footprint) : undefined;
        } else {
            center = GridMath.getPositionForCell(intent.cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        }
        if (!center) {
            this.hoverManager.clearOpponentIntentSilhouette();
            return;
        }
        this.hoverManager.showOpponentIntentSilhouette(props, center);
    }
    /**
     * Pick the footprint around `cell` for a relayed opponent move silhouette, without the active unit's
     * reachable-path data (we don't have it for the opponent). Every block that COVERS the relayed cell is
     * a candidate — the sender's cursor may have sat on any cell of the body — and the first one that is
     * on the board and free of OTHER units wins (the moving unit itself still sits on its old cells).
     * Falls back to the first on-board block so a hint always renders.
     *
     * The candidate order matters: the relayed cell is the MINIMUM corner of the destination
     * (getMoveDestinationSilhouetteCell sends it that way), so that block has to be tried first.
     */
    private findOpponentLargeUnitFootprint(unit: Unit, cell: HoCMath.XY): HoCMath.XY[] | undefined {
        const gs = this.sc_sceneSettings.getGridSettings();
        const width = unit.getFootprintWidth();
        const height = unit.getFootprintHeight();
        const footprints: HoCMath.XY[][] = [];
        for (let cursorDy = 0; cursorDy < height; cursorDy++) {
            for (let cursorDx = 0; cursorDx < width; cursorDx++) {
                const anchor = { x: cell.x - cursorDx + width - 1, y: cell.y - cursorDy + height - 1 };
                if (!GridMath.isFootprintWithinGrid(gs, anchor, width, height)) continue;
                footprints.push(unit.getFootprintCellsForAnchor(anchor));
            }
        }
        const unoccupied = footprints.find((fp) =>
            fp.every((c) => {
                const occ = this.grid.getOccupantUnitId(c);
                return !occ || occ === unit.getId();
            }),
        );
        return unoccupied ?? footprints[0];
    }
    private clearPlacementBench(): void {
        this.stopPlacementBenchSlideAnimation();
        this.placementBenchBaseHitBoxes.clear();
        this.placementBenchHitBoxes.clear();
        this.placementBenchToggleHitBox = undefined;
        this.placementBenchToggleHovered = false;
        this.placementBenchBounds = undefined;
        this.placementBenchLastGroups = [];
        this.placementBenchGraphics?.clear();
        this.placementBenchGraphics?.position.set(0, 0);
        if (this.placementBenchToggleSprite) {
            this.placementBenchToggleSprite.visible = false;
        }
        if (this.placementBenchToggleFallback) {
            this.placementBenchToggleFallback.clear();
            this.placementBenchToggleFallback.visible = false;
        }
    }
    private ensurePlacementBenchGraphicsWorld(): Graphics {
        if (!this.placementBenchGraphics) {
            this.placementBenchGraphics = new Graphics();
        }
        this.attachToWorldRoot(this.placementBenchGraphics, 900);
        return this.placementBenchGraphics;
    }
    private ensurePlacementBenchToggleSpriteWorld(): Sprite {
        if (!this.placementBenchToggleSprite) {
            this.placementBenchToggleSprite = new Sprite(Texture.EMPTY);
            this.placementBenchToggleSprite.anchor.set(0.5);
        }
        this.attachToWorldRoot(this.placementBenchToggleSprite, 2501);
        return this.placementBenchToggleSprite;
    }
    private ensurePlacementBenchToggleFallbackWorld(): Graphics {
        if (!this.placementBenchToggleFallback) {
            this.placementBenchToggleFallback = new Graphics();
        }
        this.attachToWorldRoot(this.placementBenchToggleFallback, 2501);
        return this.placementBenchToggleFallback;
    }
    private placementBenchButtonSize(cell: number): number {
        return Math.max(28, cell * 0.8);
    }
    private getPlacementBenchCollapsedOffset(bounds = this.placementBenchBounds): number {
        if (!bounds) {
            return 0;
        }
        const cell = this.sc_sceneSettings.getGridSettings().getCellSize();
        const gridMinX = this.sc_sceneSettings.getGridSettings().getMinX();
        return gridMinX - bounds.maxX - this.placementBenchButtonSize(cell);
    }
    private stopPlacementBenchSlideAnimation(): void {
        this.placementBenchSlideCancel?.();
        this.placementBenchSlideCancel = undefined;
    }
    private applyPlacementBenchSlideOffset(offsetX: number): void {
        this.placementBenchSlideOffsetX = offsetX;
        this.placementBenchGraphics?.position.set(offsetX, 0);

        const gs = this.sc_sceneSettings.getGridSettings();
        const worldRoot = this.drawer.getUnitsContainer();
        for (const [unitId, baseHitBox] of this.placementBenchBaseHitBoxes.entries()) {
            const unit = this.unitsHolder.getAllUnits().get(unitId) as RenderableUnit | undefined;
            const position = { x: baseHitBox.center.x + offsetX, y: baseHitBox.center.y };
            if (unit) {
                unit.setPosition(position.x, position.y);
                unit.syncVisual(worldRoot, gs);
                unit.setVisualGhost(this.shouldGhostCurrentPlacementBenchUnit(unit));
            }
            this.placementBenchHitBoxes.set(unitId, {
                center: position,
                radius: baseHitBox.radius,
            });
        }
    }
    private animatePlacementBenchSlide(collapsed: boolean): void {
        this.stopPlacementBenchSlideAnimation();

        const startOffset = this.placementBenchSlideOffsetX;
        const endOffset = collapsed ? this.getPlacementBenchCollapsedOffset() : 0;
        const startRotation =
            this.placementBenchToggleSprite?.rotation ?? this.placementBenchToggleFallback?.rotation ?? 0;
        const endRotation = collapsed ? Math.PI : 0;
        const start = performance.now();
        const durationMs = 350;
        const ticker = this.pixiApp.getTicker();
        const easeInOutQuad = (t: number): number => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
        const step = (): void => {
            const progress = Math.min(1, (performance.now() - start) / durationMs);
            const eased = easeInOutQuad(progress);
            this.applyPlacementBenchSlideOffset(startOffset + (endOffset - startOffset) * eased);
            const rotation = startRotation + (endRotation - startRotation) * eased;
            if (this.placementBenchToggleSprite) {
                this.placementBenchToggleSprite.rotation = rotation;
            }
            if (this.placementBenchToggleFallback) {
                this.placementBenchToggleFallback.rotation = rotation;
            }
            if (progress >= 1) {
                ticker.remove(step);
                this.placementBenchSlideCancel = undefined;
                this.applyPlacementBenchSlideOffset(endOffset);
            }
        };

        ticker.add(step);
        this.placementBenchSlideCancel = () => ticker.remove(step);
    }
    private drawPlacementBenchBackdrops(positionGroups: HoCMath.XY[][]): void {
        const groups = positionGroups.filter((positions) => positions.length > 0);
        this.placementBenchLastGroups = groups.map((positions) => positions.map((position) => ({ ...position })));
        if (!groups.length) {
            this.placementBenchToggleHitBox = undefined;
            this.placementBenchBounds = undefined;
            this.placementBenchGraphics?.clear();
            this.placementBenchGraphics?.position.set(0, 0);
            if (this.placementBenchToggleSprite) {
                this.placementBenchToggleSprite.visible = false;
            }
            if (this.placementBenchToggleFallback) {
                this.placementBenchToggleFallback.clear();
                this.placementBenchToggleFallback.visible = false;
            }
            return;
        }

        const graphics = this.ensurePlacementBenchGraphicsWorld().clear();
        const gs = this.sc_sceneSettings.getGridSettings();
        const cell = gs.getCellSize();
        const scale = this.getUnplacedBenchUnitScale();
        const padX = cell * 0.95 * scale;
        const padY = cell * 0.9 * scale;
        const radius = Math.max(6, cell * 0.18);
        const allPositions = groups.flat();
        const rawBounds = {
            minX: Math.min(...allPositions.map((position) => position.x)) - padX,
            maxX: Math.max(...allPositions.map((position) => position.x)) + padX,
            minY: Math.min(...allPositions.map((position) => position.y)) - padY,
            maxY: Math.max(...allPositions.map((position) => position.y)) + padY,
        };
        const bounds = this.shouldShowPlacementBenchToggle()
            ? this.expandPlacementBenchPanelBounds(rawBounds, cell)
            : rawBounds;
        this.placementBenchBounds = bounds;
        if (!this.placementBenchSlideCancel) {
            this.placementBenchSlideOffsetX = this.placementBenchCollapsed
                ? this.getPlacementBenchCollapsedOffset(bounds)
                : 0;
        }

        if (this.shouldShowPlacementBenchToggle()) {
            graphics
                .roundRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, radius)
                .fill({ color: 0x05070c, alpha: 0.56 })
                .stroke({ color: 0xf6d87c, alpha: 0.28, width: Math.max(1, cell * 0.025) });
        } else {
            for (const positions of groups) {
                const minX = Math.min(...positions.map((position) => position.x)) - padX;
                const maxX = Math.max(...positions.map((position) => position.x)) + padX;
                const minY = Math.min(...positions.map((position) => position.y)) - padY;
                const maxY = Math.max(...positions.map((position) => position.y)) + padY;

                graphics
                    .roundRect(minX, minY, maxX - minX, maxY - minY, radius)
                    .fill({ color: 0x05070c, alpha: 0.56 })
                    .stroke({ color: 0xf6d87c, alpha: 0.28, width: Math.max(1, cell * 0.025) });
            }
        }
        this.drawPlacementBenchToggle(graphics, bounds, cell);
        this.applyPlacementBenchSlideOffset(this.placementBenchSlideOffsetX);
    }
    private expandPlacementBenchPanelBounds(
        bounds: { minX: number; maxX: number; minY: number; maxY: number },
        cell: number,
    ): { minX: number; maxX: number; minY: number; maxY: number } {
        const minWidth = cell * 6.5;
        const minHeight = cell * 3.2;
        const centerX = (bounds.minX + bounds.maxX) * 0.5;
        const centerY = (bounds.minY + bounds.maxY) * 0.5;
        const halfWidth = Math.max((bounds.maxX - bounds.minX) * 0.5, minWidth * 0.5);
        const halfHeight = Math.max((bounds.maxY - bounds.minY) * 0.5, minHeight * 0.5);

        return {
            minX: centerX - halfWidth,
            maxX: centerX + halfWidth,
            minY: centerY - halfHeight,
            maxY: centerY + halfHeight,
        };
    }
    private drawPlacementBenchToggle(
        graphics: Graphics,
        bounds: { minX: number; maxX: number; minY: number; maxY: number },
        cell: number,
    ): void {
        if (!this.shouldShowPlacementBenchToggle()) {
            this.placementBenchToggleHitBox = undefined;
            if (this.placementBenchToggleSprite) {
                this.placementBenchToggleSprite.visible = false;
            }
            return;
        }

        const size = this.placementBenchButtonSize(cell);
        // Anchor horizontally to a fixed inset from the board's left edge — the same offset the
        // sandbox UnitsOverlay uses for its toggle (leftColW * 0.5 = 0.75 * cell). Anchoring to the
        // full-width panel's left edge would push the arrow off the far left of the board.
        const gridMinX = this.sc_sceneSettings.getGridSettings().getMinX();
        const center = {
            x: gridMinX + cell * 0.75,
            y: bounds.maxY + size * 0.6,
        };
        const radius = size * 0.5;
        const tex = this.texAny(this.placementBenchToggleHovered ? "arrow_button_active" : "arrow_button_inactive");
        if (tex) {
            const sprite = this.ensurePlacementBenchToggleSpriteWorld();
            sprite.texture = tex;
            sprite.position.set(center.x, center.y);
            sprite.width = size;
            sprite.height = size;
            sprite.rotation = this.placementBenchCollapsed ? Math.PI : 0;
            sprite.visible = true;
            if (this.placementBenchToggleFallback) {
                this.placementBenchToggleFallback.clear();
                this.placementBenchToggleFallback.visible = false;
            }
            this.placementBenchToggleHitBox = { center, radius };
            return;
        }

        if (this.placementBenchToggleSprite) {
            this.placementBenchToggleSprite.visible = false;
        }
        const fallback = this.ensurePlacementBenchToggleFallbackWorld();
        fallback
            .clear()
            .roundRect(-radius, -radius, radius * 2, radius * 2, radius * 0.42)
            .fill({ color: 0x05070c, alpha: 0.82 })
            .stroke({ color: 0xf6d87c, alpha: 0.55, width: Math.max(1, cell * 0.028) });
        fallback
            .moveTo(-radius * 0.42, 0)
            .lineTo(radius * 0.22, radius * 0.44)
            .lineTo(radius * 0.22, -radius * 0.44)
            .closePath()
            .fill({ color: 0xf6d87c, alpha: 0.95 });
        fallback.position.set(center.x, center.y);
        fallback.rotation = this.placementBenchCollapsed ? Math.PI : 0;
        fallback.visible = true;
        this.placementBenchToggleHitBox = { center, radius };
    }
    private isPlacementBenchToggleAt(worldPos: HoCMath.XY): boolean {
        const hitBox = this.placementBenchToggleHitBox;
        if (!hitBox) {
            return false;
        }
        const dx = worldPos.x - hitBox.center.x;
        const dy = worldPos.y - hitBox.center.y;
        return dx * dx + dy * dy <= hitBox.radius * hitBox.radius;
    }
    private updatePlacementBenchToggleHover(worldPos: HoCMath.XY): void {
        const hovered = this.isPlacementBenchToggleAt(worldPos);
        if (hovered === this.placementBenchToggleHovered) {
            return;
        }
        this.placementBenchToggleHovered = hovered;
        const sprite = this.placementBenchToggleSprite;
        if (!sprite?.visible) {
            return;
        }
        const tex = this.texAny(hovered ? "arrow_button_active" : "arrow_button_inactive");
        if (tex) {
            sprite.texture = tex;
        }
    }
    private handlePlacementBenchToggleAt(worldPos: HoCMath.XY): boolean {
        if (!this.isPlacementBenchToggleAt(worldPos)) {
            return false;
        }

        const startOffset = this.placementBenchSlideOffsetX;
        const startRotation =
            this.placementBenchToggleSprite?.rotation ?? this.placementBenchToggleFallback?.rotation ?? 0;
        this.placementBenchCollapsed = !this.placementBenchCollapsed;
        this.drawPlacementBenchBackdrops(this.placementBenchLastGroups);
        this.applyPlacementBenchSlideOffset(startOffset);
        if (this.placementBenchToggleSprite) {
            this.placementBenchToggleSprite.rotation = startRotation;
        }
        if (this.placementBenchToggleFallback) {
            this.placementBenchToggleFallback.rotation = startRotation;
        }
        this.animatePlacementBenchSlide(this.placementBenchCollapsed);
        return true;
    }
    private renderUnplacedBenchUnit(
        unit: RenderableUnit,
        position: HoCMath.XY,
        unitState: SandboxSceneUnitState,
    ): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const worldRoot = this.drawer.getUnitsContainer();
        const cell = gs.getCellSize();
        const scale = this.getUnplacedBenchUnitScale();
        const isLarge = unit.getUnitProperties().size === 2;

        const visualPosition = {
            x: position.x + this.placementBenchSlideOffsetX,
            y: position.y,
        };
        unit.setBattlefieldVisualProjection(false);
        unit.setVisualScaleMultiplier(scale);
        unit.setPosition(visualPosition.x, visualPosition.y);
        unit.ensureVisual(worldRoot, gs);
        unit.syncVisual(worldRoot, gs);
        unit.setVisualGhost(this.shouldGhostUnplacedUnitBenchUnit(unitState));
        const baseHitBox = {
            center: { x: position.x, y: position.y },
            radius: cell * (isLarge ? 1.05 : 0.7) * scale,
        };
        this.placementBenchBaseHitBoxes.set(unit.getId(), baseHitBox);
        this.placementBenchHitBoxes.set(unit.getId(), {
            center: visualPosition,
            radius: baseHitBox.radius,
        });
    }
    /**
     * Render a revealed opponent unit at a fixed spot in the opponent placement area: black & white
     * (clearly not the viewer's unit) with its team-colored flag showing a "?" stack count. Unlike
     * bench units these are non-interactive and never occupy grid cells — they only show the viewer
     * *which* enemy units exist, never their real (hidden) positions or stack sizes.
     */
    private renderRevealedOpponentUnit(unit: RenderableUnit, position: HoCMath.XY, total: number): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const worldRoot = this.drawer.getUnitsContainer();
        // Set the mode BEFORE the visual passes so the very first rendered frame is already B&W.
        // These silhouettes now stand on real deployment-cell centres, so use the same perspective
        // projection as normal placed units. Leaving projection off made their logical positions correct
        // while their screen positions visibly drifted away from the painted grid.
        unit.setBattlefieldVisualProjection(true);
        unit.setVisualRevealed(true);
        unit.setVisualScaleMultiplier(this.getRevealedOpponentUnitScale(total));
        // Baseline teams deploy on opposite horizontal sides: red/UPPER faces left toward green,
        // green/LOWER faces right toward red. Force this even for models without a walk atlas.
        unit.setBoardFacing(placementFacingDirectionForTeam(unit.getTeam()));
        unit.setPosition(position.x, position.y);
        unit.ensureVisual(worldRoot, gs);
        unit.syncVisual(worldRoot, gs);
    }
    /** Sprite scale for the revealed opponent roster; ranked shrinks it so a full army fits one row. */
    protected getRevealedOpponentUnitScale(_total: number): number {
        return 1;
    }
    private getBenchUnitAtPosition(worldPos: HoCMath.XY): Unit | undefined {
        const hitEntries = Array.from(this.placementBenchHitBoxes.entries()).reverse();
        for (const [unitId, hitBox] of hitEntries) {
            const dx = worldPos.x - hitBox.center.x;
            const dy = worldPos.y - hitBox.center.y;
            if (dx * dx + dy * dy <= hitBox.radius * hitBox.radius) {
                return this.unitsHolder.getAllUnits().get(unitId);
            }
        }
        return undefined;
    }
    /**
     * Find a unit to inspect (read-only) under the cursor, including units that don't occupy grid
     * cells: the ranked placement bench and revealed opponent silhouettes. Used by shift-click so the
     * sidebar can show stats for any visible unit, not just on-board ones.
     */
    private getInspectableUnitAtPosition(worldPos: HoCMath.XY): Unit | undefined {
        const onGrid = this.getUnitAtPosition(worldPos);
        if (onGrid) {
            return onGrid;
        }
        const onBench = this.getBenchUnitAtPosition(worldPos);
        if (onBench) {
            return onBench;
        }
        // Revealed opponent silhouettes are positioned visually but never occupy grid cells; hit-test
        // them by proximity to their drawn center.
        if (this.revealedOpponentUnitIds.size) {
            const cell = this.sc_sceneSettings.getGridSettings().getCellSize();
            let best: Unit | undefined;
            let bestDistSq = cell * cell;
            for (const unitId of this.revealedOpponentUnitIds) {
                const ghost = this.unitsHolder.getAllUnits().get(unitId);
                if (!ghost) {
                    continue;
                }
                const center = ghost.getPosition();
                const dx = worldPos.x - center.x;
                const dy = worldPos.y - center.y;
                const distSq = dx * dx + dy * dy;
                if (distSq <= bestDistSq) {
                    bestDistSq = distSq;
                    best = ghost;
                }
            }
            if (best) {
                return best;
            }
        }
        return undefined;
    }
    public override applyAuthoritativeSnapshot(snapshot: AuthoritativeGameSnapshot): void {
        if (snapshot.latestSequence <= this.sandboxAuthoritativeSequence) {
            return;
        }
        this.sandboxAuthoritativeSequence = snapshot.latestSequence;

        const units: SandboxSceneUnitState[] = [];
        for (const unitState of snapshot.units) {
            const team = unitState.team as TeamType;
            let baseProperties: UnitProperties;
            try {
                baseProperties = this.unitsOverlay.getUnitProperties(unitState.name);
            } catch {
                this.sc_sceneLog.updateLog(`Cannot restore ${unitState.name} from server snapshot`);
                continue;
            }

            units.push({
                properties: {
                    ...baseProperties,
                    id: unitState.id,
                    team,
                    amount_alive: Math.max(0, Math.floor(unitState.amountAlive)),
                    amount_died: Math.max(0, Math.floor(unitState.amountDied)),
                    hp: unitState.hp || baseProperties.hp,
                    max_hp: unitState.maxHp || baseProperties.max_hp,
                    attack_type_selected: unitState.attackType || baseProperties.attack_type_selected,
                    stack_power: unitState.stackPower || baseProperties.stack_power,
                    // The SERVER's footprint wins, exactly like the ranked hydrate: the snapshot's
                    // cells drive occupancy, so a local-config drift (or a one-sided
                    // __hocFootprintOverrides) must not leave the renderer on a different shape
                    // than the grid. Absent wire fields mean "no opinion" and keep local config.
                    ...(unitState.footprintWidth && unitState.footprintHeight
                        ? {
                              footprint_width: unitState.footprintWidth,
                              footprint_height: unitState.footprintHeight,
                          }
                        : {}),
                } as UnitProperties,
                team,
                placed: unitState.placed,
                dead: unitState.dead,
                cells: unitState.cells,
                baseCell: unitState.baseCell,
                attackType: unitState.attackType as AttackType,
                forcedTargetId: unitState.forcedTargetId,
                forbiddenTargetId: unitState.forbiddenTargetId,
            });
        }

        this.hydrateSceneState({
            gridType: snapshot.gridType as GridType,
            currentLap: snapshot.currentLap,
            fightStarted: snapshot.fightStarted,
            fightFinished: snapshot.fightFinished,
            currentUnitId: snapshot.currentUnitId || undefined,
            units,
        });
    }
    public override CameraChanged(): void {
        this.attachToWorldRoot(this.placementGraphics, 90);
        this.attachToWorldRoot(this.placementFrameContainer, 90.1);
        this.attachToWorldRoot(this.movementGraphics, 49.5);
        this.attachToWorldRoot(this.gameplayGraphics, 55); // Ranges below units (Units > 100)
        this.attachToWorldRoot(this.shotRangeCornerContainer, 55.1);
        this.dungeonVisuals.attachCenterTerrainSprite();
        this.hoverManager.onCameraChanged();
    }
    protected getPlacement(teamType: TeamType, placementIndex: number): IPlacement | undefined {
        return this.placementManager.getPlacement(teamType, placementIndex);
    }
    /** Pick the frontmost rendered creature whose visible sprite box contains this board point. */
    private getUnitSpriteAtPosition(worldPos: HoCMath.XY): Unit | undefined {
        const gs = this.sc_sceneSettings.getGridSettings();
        let spriteHit: { unit: Unit; depth: number } | undefined;
        for (const candidate of this.unitsHolder.getAllUnits().values()) {
            if (candidate.isDead()) continue;
            const renderable = candidate as unknown as {
                spriteHitDepth?: (point: HoCMath.XY, gridSettings: GridSettings) => number | undefined;
            };
            if (typeof renderable.spriteHitDepth !== "function") continue;
            const depth = renderable.spriteHitDepth(worldPos, gs);
            if (depth === undefined) continue;
            if (!spriteHit || depth > spriteHit.depth) spriteHit = { unit: candidate, depth };
        }
        return spriteHit?.unit;
    }
    /** Get unit by world position: grid occupancy first, then the rendered silhouette. */
    private getUnitAtPosition(worldPos: HoCMath.XY): Unit | undefined {
        const gs = this.sc_sceneSettings.getGridSettings();
        const cell = GridMath.getCellForPosition(gs, worldPos);
        if (cell) {
            const occupantId = this.grid.getOccupantUnitId(cell);
            if (occupantId) {
                const occupant = this.unitsHolder.getAllUnits().get(occupantId);
                if (occupant) {
                    return occupant;
                }
                // occupantId is a terrain obstacle (mountain "B"/"H", lava "L", water "W"),
                // not a real unit. Don't short-circuit here, otherwise a floating bench/pick
                // creature rendered over this cell becomes unselectable. Fall through to the
                // sprite and bench hit-tests below.
            }
        }
        // The drawn body is taller than — and for the mounted class hangs past — the ground it
        // occupies, so a click on the visible silhouette often lands on a cell that holds nothing.
        // Fall back to sprite hit-testing then; among overlapping silhouettes the frontmost-drawn
        // one wins, which is the body the click visually touched. An OCCUPIED cell above keeps
        // priority so dense formations stay targetable by the ground a unit stands on.
        const spriteHit = this.getUnitSpriteAtPosition(worldPos);
        if (spriteHit) {
            return spriteHit;
        }
        if (!FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
            return this.getBenchUnitAtPosition(worldPos);
        }
        return undefined;
    }
    /** Map the pointer painted on the trapezoid battlefield back to the square mechanics board. */
    private getLogicalBattlefieldPoint(worldPos: HoCMath.XY): HoCMath.XY {
        return unprojectBattlefieldPoint(worldPos, this.sc_sceneSettings.getGridSettings()) ?? worldPos;
    }
    protected canSelectUnitForPlacement(_unit: Unit): boolean {
        return true;
    }
    protected ensureCenterTerrainSprite(): void {
        this.dungeonVisuals.ensureCenterTerrainSprite();
    }
    private stepMoveAnimation(dt: number): void {
        this.moveAnimManager.update(dt);
        const wasMoving = this.isActiveUnitMoving;
        this.isActiveUnitMoving = this.moveAnimManager.isMoving();
        // The hover silhouette is LOCKED at move-start (setSilhouetteLocked(true)) so the destination
        // preview holds steady while the unit slides. Nothing else ever releases it — so once ANY unit has
        // moved, the lock stays set for the rest of the session and every later clearHoverSilhouette() /
        // hideSilhouettesOnly() bails out, leaving a stale silhouette behind (e.g. after hovering the board
        // on the way to a button placed near it and clicking hourglass to end the turn). Release the lock —
        // and force-clear the now-stale preview — the instant the move animation finishes. Shared by the
        // live sandbox and the ranked replay (both drive moves through moveAnimManager).
        if (wasMoving && !this.isActiveUnitMoving) {
            this.hoverManager.setSilhouetteLocked(false);
            this.hoverManager.clearHoverSilhouette(true);
        }

        // Safety drain for held buff/debuff pops (queueOrPlayEffectPops). The impact hooks cover every
        // attack, but an effect can also be applied mid-move or mid-spell — and a replay can be cut short
        // by the hang watchdog. Releasing them the instant nothing is in flight means a queued pop is at
        // worst slightly late, never swallowed (the failure mode the eager diff exists to prevent).
        if (this.pendingEffectPops.length && !this.isStrikeInFlight()) {
            this.flushEffectPops();
        }
    }
    protected selectUnitPreStart(
        _teamType: TeamType,
        isSmallUnit: boolean,
        position: HoCMath.XY,
        rangeShotDistance = 0,
        _auraRanges: number[] = [],
        _auraIsBuff: boolean[] = [],
    ): void {
        if (rangeShotDistance > 0) {
            const footprintSize = isSmallUnit ? 1 : 2;
            this.sc_currentActiveShotRange = fullDamageShotRangeForFootprint(
                position,
                rangeShotDistance,
                footprintSize,
                footprintSize,
            );
        } else {
            this.sc_currentActiveShotRange = undefined;
        }
    }
    private ensurePlacementGraphicsWorld(): void {
        if (!this.placementGraphics) this.placementGraphics = new Graphics();
        if (!this.placementFrameContainer) this.placementFrameContainer = new Container();
        this.attachToWorldRoot(this.placementGraphics, 100);
        this.attachToWorldRoot(this.placementFrameContainer, 100.1);
    }
    private ensureBackgroundSprite(): void {
        this.dungeonVisuals.ensureBackgroundSprite();
    }
    private layoutBackgroundSquare(): void {
        this.dungeonVisuals.layoutBackgroundSquare(this.atmosphereAlpha);
    }
    private updateDungeonAtmosphere(started: boolean, alpha: number): void {
        this.dungeonVisuals.updateDungeonAtmosphere(started, alpha);
    }
    /**
     * Move fire perimeter lights inward toward the center when map narrows.
     * @param inwardOffset - Number of cells to move inward (based on narrowing laps)
     */
    private moveFiresInward(inwardOffset: number): void {
        this.dungeonVisuals.moveFiresInward(inwardOffset);
    }
    private attachToWorldRoot(obj: Graphics | Sprite | Container | undefined, zIndex: number): void {
        if (!obj) return;
        const worldRoot = this.pixiApp.getWorldRoot();
        if (obj.parent !== worldRoot) {
            obj.removeFromParent();
            worldRoot.addChild(obj);
        }
        if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
        obj.zIndex = zIndex;
    }
    private attachToUnitDepthRoot(obj: Graphics | Sprite | Container | undefined, zIndex: number): void {
        if (!obj) return;
        const depthRoot = this.drawer.getUnitsContainer();
        if (obj.parent !== depthRoot) {
            obj.removeFromParent();
            depthRoot.addChild(obj);
        }
        if (!depthRoot.sortableChildren) depthRoot.sortableChildren = true;
        obj.zIndex = zIndex;
    }
    private createUnitForTeam(teamType: TeamType, amount?: number): RenderableUnit | undefined {
        const selected = this.sc_selectedUnitProperties;
        if (!selected || teamType === TeamVals.NO_TEAM) return undefined;
        const unit = Unit.createUnit(
            // Deep-clone so each created unit OWNS its arrays. A shallow { ...selected } shares the nested
            // arrays (abilities, effects, spells, applied_*) with `selected` and with every other unit
            // built from the same selection, so a per-unit mutation like grantAbility (Craft's frozen
            // weapon) leaks onto all of them — e.g. one crafted Frozen Bow showing on all 4 elves.
            structuredClone({
                ...selected,
                id: HoCLib.createSecureUuid(),
                team: teamType,
                ...(amount !== undefined && amount > 0 ? { amount_alive: amount } : {}),
            }),
            this.sc_sceneSettings.getGridSettings(),
            teamType,
            UnitVals.CREATURE,
            this.abilityFactory,
            this.abilityFactory.getEffectsFactory(),
            false,
        );
        const renderableUnit = RenderableUnit.fromBase(unit, this.texAny);
        renderableUnit.setBattlefieldVisualProjection(true);
        if (!this.unitsHolder.getAllUnits().has(unit.getId())) {
            this.unitsHolder.addUnit(renderableUnit);
        }

        // Setup spellbook support
        if (renderableUnit.getSpellsCount() > 0) {
            // Lazy init digit textures
            if (!this.digitTextures) {
                this.digitTextures = new Map<number, Texture>();
                for (let i = 0; i <= 9; i++) {
                    const tex = this.texAny(`digit_${i}`);
                    if (tex) this.digitTextures.set(i, tex);
                }
                const minusOne = this.texAny("digit_-1"); // For damage or specials?
                if (minusOne) this.digitTextures.set(-1, minusOne);
            }
            renderableUnit.setSpellBookLayer(this.spellBookContainer, this.digitTextures);
        }

        if (!this.unitsHolder.getAllUnits().has(unit.getId())) {
            this.unitsHolder.addUnit(renderableUnit);
        }
        return renderableUnit;
    }
    private getPlacementPreviewUnit(): RenderableUnit | undefined {
        const existing = this.draggingUnitId
            ? (this.unitsHolder.getAllUnits().get(this.draggingUnitId) as RenderableUnit | undefined)
            : this.selectedBoardUnit;
        if (existing) return existing;

        const selected = this.sc_selectedUnitProperties;
        if (!this.selectionFromOverlay || !selected) return undefined;
        // Reuse the cached preview only for the same creature standing on the same rectangle — `size`
        // reports one number for both 2x1 and 2x2, so a shape change alone would have kept the stale body.
        const cachedProps = this.overlayPlacementPreviewUnit?.getUnitProperties();
        const sameShape =
            !!cachedProps &&
            footprintWidthOf(cachedProps) === footprintWidthOf(selected) &&
            footprintHeightOf(cachedProps) === footprintHeightOf(selected);
        if (!this.overlayPlacementPreviewUnit || cachedProps?.name !== selected.name || !sameShape) {
            this.overlayPlacementPreviewUnit?.destroyVisuals();
            this.overlayPlacementPreviewRoot?.destroy({ children: true });

            const previewBase = Unit.createUnit(
                structuredClone({
                    ...selected,
                    id: HoCLib.createSecureUuid(),
                    team: TeamVals.NO_TEAM,
                }),
                this.sc_sceneSettings.getGridSettings(),
                TeamVals.NO_TEAM,
                UnitVals.CREATURE,
                this.abilityFactory,
                this.abilityFactory.getEffectsFactory(),
                false,
            );
            this.overlayPlacementPreviewUnit = RenderableUnit.fromBase(previewBase, this.texAny);
            this.overlayPlacementPreviewUnit.setBattlefieldVisualProjection(true);
            this.overlayPlacementPreviewRoot = new Container();
            this.overlayPlacementPreviewRoot.visible = false;
            this.drawer.getUnitsContainer().addChild(this.overlayPlacementPreviewRoot);
        }

        // The preview body is built team-less (NO_TEAM), so it cannot inherit the deployment facing —
        // and the overlay CHIP is team-less too (the picker is a catalog; the drop assigns the side).
        // Aim from the real team when there is one, else from the hovered board half: a ghost over the
        // right half faces left exactly like the unit will once dropped there.
        this.overlayPlacementPreviewUnit.setBoardFacing(previewPlacementFacing(selected.team, this.sc_mouseWorld.x));
        this.overlayPlacementPreviewUnit.ensureVisual(
            this.overlayPlacementPreviewRoot!,
            this.sc_sceneSettings.getGridSettings(),
        );
        return this.overlayPlacementPreviewUnit;
    }
    private getPlacementPreviewPoint(): HoCMath.XY {
        if (
            !this.selectionFromOverlay &&
            this.draggingUnitId &&
            this.placementDragPointerOrigin &&
            !this.placementDragPointerMoved
        ) {
            const unit = this.unitsHolder.getAllUnits().get(this.draggingUnitId);
            if (unit) return unit.getPosition();
        }
        return this.sc_mouseWorld;
    }
    private createSummonedRenderableUnit(
        team: TeamType,
        faction: FactionType,
        unitName: string,
        amount: number,
    ): RenderableUnit | undefined {
        let properties: UnitProperties;
        try {
            properties = createSummonedUnitProperties(team, faction, unitName, amount);
        } catch {
            this.sc_sceneLog.updateLog(`Cannot summon ${unitName}`);
            return undefined;
        }

        const baseUnit = Unit.createUnit(
            { ...properties, id: HoCLib.createSecureUuid(), team },
            this.sc_sceneSettings.getGridSettings(),
            team,
            UnitVals.CREATURE,
            this.abilityFactory,
            this.abilityFactory.getEffectsFactory(),
            true,
        );
        const renderableUnit = RenderableUnit.fromBase(baseUnit, this.texAny);
        renderableUnit.setBattlefieldVisualProjection(true);
        if (renderableUnit.getSpellsCount() > 0) {
            this.ensureDigitTextures();
            if (this.digitTextures) {
                renderableUnit.setSpellBookLayer(this.spellBookContainer, this.digitTextures);
            }
        }
        return renderableUnit;
    }
    private createSplitRenderableUnit(sourceUnit: Unit, amount: number): RenderableUnit | undefined {
        if (amount <= 0) {
            return undefined;
        }
        const sourceProperties = sourceUnit.getUnitProperties();
        const baseUnit = Unit.createUnit(
            // Deep-clone so the split-off unit OWNS its arrays instead of sharing them with the source
            // stack — otherwise a per-unit grantAbility (e.g. a crafted Frozen Bow) on either one would
            // leak onto the other (and every other split of the same source).
            structuredClone({
                ...sourceProperties,
                id: HoCLib.createSecureUuid(),
                team: sourceUnit.getTeam(),
                hp: sourceProperties.max_hp,
                amount_alive: amount,
                amount_died: 0,
                attack_type_selected: sourceProperties.attack_type,
            }),
            this.sc_sceneSettings.getGridSettings(),
            sourceUnit.getTeam(),
            UnitVals.CREATURE,
            this.abilityFactory,
            this.abilityFactory.getEffectsFactory(),
            false,
        );
        const renderableUnit = RenderableUnit.fromBase(baseUnit, this.texAny);
        renderableUnit.setBattlefieldVisualProjection(true);
        if (renderableUnit.getSpellsCount() > 0) {
            this.ensureDigitTextures();
            if (this.digitTextures) {
                renderableUnit.setSpellBookLayer(this.spellBookContainer, this.digitTextures);
            }
        }
        return renderableUnit;
    }
    protected hydrateSceneState(snapshot: SandboxSceneState): void {
        // Preserve the mountains' battered state across the reset below. reset()+setGridType() re-inits
        // both mountains to full HP, so without carrying the prior (or snapshotted) hit counts a mountain
        // sprang back to full on the next hydrate — e.g. the turn after it was struck, or during replay.
        const priorFightProps = FightStateManager.getInstance().getFightProperties();
        const priorGridWasBlock = priorFightProps.getGridType() === GridVals.BLOCK_CENTER;
        const priorObstacleHitsLeft = priorGridWasBlock ? priorFightProps.getObstacleHitsLeftLeft() : undefined;
        const priorObstacleHitsRight = priorGridWasBlock ? priorFightProps.getObstacleHitsLeftRight() : undefined;

        // Preserve each team's SETUP (doctrine + augments + artifacts + synergies) across reset(): reset() builds
        // a fresh FightProperties and the authoritative scene state itself does not carry these into hydrate.
        // Without this, full ranked hydrates silently lose setup-driven placement, stats, and visible buffs.
        const priorSetup = captureFightSetupForHydration(priorFightProps);

        FightStateManager.getInstance().reset();
        const fightProps = FightStateManager.getInstance().getFightProperties();
        fightProps.setDefaultPlacementPerTeam(TeamVals.LOWER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        fightProps.setDefaultPlacementPerTeam(TeamVals.UPPER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        // Restore BEFORE rebuildFromFightProps so every setup-derived placement/stat/buff is available while
        // units are reconstructed. Doctrine goes first inside the helper because augment restores budget-check it.
        restoreFightSetupAfterHydrationReset(fightProps, priorSetup);
        fightProps.setGridType(snapshot.gridType);
        this.grid.refreshWithNewType(snapshot.gridType);
        this.placementManager.rebuildFromFightProps();

        // Restore the fight lifecycle so the client engine state matches the snapshot. Sandbox
        // replays re-run `start_fight` through the engine, but the ranked/authoritative path never
        // does — so without this the client's FightStateManager stays "not started" for the whole
        // fight, which silently breaks everything gated on hasFightStarted() (e.g. the AttackType /
        // Wait / Luck Shield buttons and the local select_attack_type apply).
        if (snapshot.fightStarted) {
            fightProps.startFight();
        }
        if (snapshot.fightFinished) {
            fightProps.finishFight();
        }

        // Restore the mountains' remaining HP after startFight() (which, via setGridType, just reset them
        // to full). Prefer the snapshot's explicit counts (sandbox replay records them); otherwise keep the
        // value we were already tracking from obstacle_attacked events (the ranked snapshot carries none, so
        // this stops a full board rebuild from wiping mid-fight mountain damage).
        if (snapshot.gridType === GridVals.BLOCK_CENTER && snapshot.fightStarted) {
            const left = snapshot.obstacleHitsLeftLeft ?? priorObstacleHitsLeft;
            const right = snapshot.obstacleHitsLeftRight ?? priorObstacleHitsRight;
            if (left !== undefined && right !== undefined) {
                fightProps.setObstacleHitsPerMountain(left, right);
                // A mountain reduced to 0 was cleared from the grid during the fight; refreshWithNewType
                // above rebuilt it solid, so re-clear the destroyed side(s) to match the restored HP.
                if (left <= 0) {
                    this.grid.clearMountainSide(false);
                }
                if (right <= 0) {
                    this.grid.clearMountainSide(true);
                }
            }
        }

        this.currentActiveUnit?.setActiveTurn(false);
        this.currentActiveUnit = undefined;
        this.currentShiftedUnit = undefined;
        this.selectedBoardUnit = undefined;
        this.draggingUnitId = undefined;
        this.draggingUnitTeam = undefined;
        this.hasActiveSelection = false;
        this.selectionFromOverlay = false;
        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.currentActivePathHashes = undefined;
        this.currentActiveSpell = undefined;
        this.currentEnemiesCellsWithinMovementRange = undefined;
        this.cellToUnitPreRound = undefined;
        this.canAttackByMeleeTargets = undefined;
        this.canAttackMountainTargets = undefined;
        this.canAttackByRangeTargets = undefined;
        this.hoverRangeAttackObstacle = undefined;
        this.sc_currentActiveShotRange = undefined;
        this.sc_currentActiveAuraRanges = [];
        this.sc_selectedUnitProperties = undefined;
        this.sc_selectedFactionType = FactionVals.NO_FACTION as FactionType;
        this.sc_visibleOverallImpact = undefined;
        this.sc_unitPropertiesUpdateNeeded = true;
        this.sc_factionNameUpdateNeeded = true;
        this.sc_moveBlocked = false;
        this.sc_isAnimating = false;
        this.drawnNarrowingLaps.clear();
        this.dungeonVisuals.clearHoleLayers();
        this.dungeonVisuals.setCenterDried(!!snapshot.centerDried);
        if (snapshot.centerDried) {
            this.grid.cleanupCenterObstacle();
        }
        this.hoverManager.clear();
        // Rebuilding the board invalidates unit-anchored VFX, but not the world overlays describing an
        // event that already resolved (Craft forge, damage numbers, buff/debuff pops) — those keep playing
        // out. In ranked this rebuild fires on the snapshot that lands right after a replayed action, so
        // clearing them wholesale cut the Craft forge (and its result pops) off almost immediately.
        this.combatVisuals.clear({ keepDetachedOverlays: true });
        this.rangedProjectiles.clear();

        const existingUnits = Array.from(this.unitsHolder.getAllUnits().values()) as RenderableUnit[];
        // Computed BEFORE the preserve pass below (and reused by the render loop): which units THIS
        // snapshot renders as revealed-opponent ghosts.
        const revealedOpponentPositions = this.getRevealedOpponentUnitPositions(snapshot.units);
        // During placement, KEEP already-drawn revealed opponent units alive across snapshot rebuilds instead
        // of destroying + recreating them each tick (which makes them flicker / play their spawn animation
        // repeatedly while the player drags their own units). They are non-interactive ghosts with no grid
        // occupancy, so preserving them is safe; their positions are re-applied below if they changed.
        //
        // ONLY units that are STILL ghosts in THIS snapshot may be preserved. A unit that graduated from
        // ghost to placed (terminal replays disclose the opponent's real cells, so their whole roster does
        // this on the first placement checkpoint) must be destroyed and rebuilt like everyone else: its id
        // staying in revealedOpponentUnitIds both shielded the stale instance from the destroy pass below
        // AND made addUnit() evict it from the holder without destroyVisuals() — orphaning its sprites in
        // the units container on EVERY placement-era hydrate. Replaying a fight hydrates dozens of times,
        // so the opponent's army piled up as a wall of duplicated sprites (prod replay b3f81f5c).
        const preservedRevealedOpponentUnitIds = new Set<string>();
        const preservedRevealedOpponentUnits = new Map<string, RenderableUnit>();
        if (!snapshot.fightStarted) {
            for (const id of this.revealedOpponentUnitIds) {
                if (!revealedOpponentPositions.has(id)) {
                    this.revealedOpponentUnitIds.delete(id);
                    continue;
                }
                preservedRevealedOpponentUnitIds.add(id);
                const u = this.unitsHolder.getAllUnits().get(id) as RenderableUnit | undefined;
                if (u) {
                    preservedRevealedOpponentUnits.set(id, u);
                }
            }
        }
        const unitsToDestroy = !snapshot.fightStarted
            ? existingUnits.filter((u) => !preservedRevealedOpponentUnitIds.has(u.getId()))
            : existingUnits;
        if (unitsToDestroy.length) {
            this.destroySpecificUnits(unitsToDestroy, true, false);
        }
        this.clearPlacementBench();
        if (!snapshot.fightStarted) {
            // Keep the preserved set; non-preserved (everything else) is already cleared above.
            for (const id of preservedRevealedOpponentUnitIds) {
                this.revealedOpponentUnitIds.add(id);
            }
        } else {
            this.revealedOpponentUnitIds.clear();
        }

        const gs = this.sc_sceneSettings.getGridSettings();
        const unitsContainer = this.drawer.getUnitsContainer();
        const benchPositions = new Map<string, HoCMath.XY>();
        const benchPositionsByGroup = new Map<string, HoCMath.XY[]>();
        if (!snapshot.fightStarted) {
            const benchUnitStates = snapshot.units.filter(
                (unitState) => !unitState.dead && !unitState.placed && this.shouldRenderUnplacedUnitBench(unitState),
            );
            const benchGroups = new Map<string, SandboxSceneUnitState[]>();
            for (const unitState of benchUnitStates) {
                const groupKey = this.getUnplacedUnitBenchGroupKey(unitState);
                const group = benchGroups.get(groupKey);
                if (group) {
                    group.push(unitState);
                } else {
                    benchGroups.set(groupKey, [unitState]);
                }
            }
            for (const [groupKey, group] of benchGroups.entries()) {
                group.forEach((unitState, index) => {
                    const position = this.getUnplacedUnitBenchPosition(index, group.length, unitState);
                    if (position) {
                        benchPositions.set(unitState.properties.id, position);
                        const groupPositions = benchPositionsByGroup.get(groupKey);
                        if (groupPositions) {
                            groupPositions.push(position);
                        } else {
                            benchPositionsByGroup.set(groupKey, [position]);
                        }
                    }
                });
            }
            this.drawPlacementBenchBackdrops([...benchPositionsByGroup.values()]);
        }

        for (const unitState of snapshot.units) {
            const revealedPosition = revealedOpponentPositions.get(unitState.properties.id);
            const isRevealedOpponent = !snapshot.fightStarted && !!revealedPosition;
            // Reuse a preserved revealed-opponent unit instead of recreating it (avoids the spawn/flicker on
            // every placement rebuild). Falls through to create+render for fresh ones (or after fight start).
            let unit: RenderableUnit | undefined;
            if (isRevealedOpponent) {
                unit = preservedRevealedOpponentUnits.get(unitState.properties.id);
            }
            if (!unit) {
                unit = this.createRenderableUnitFromSceneState(unitState);
            }
            this.unitsHolder.addUnit(unit);
            if (!unitState.placed || !unitState.cells.length) {
                const benchPosition = benchPositions.get(unitState.properties.id);
                if (benchPosition) {
                    this.renderUnplacedBenchUnit(unit, benchPosition, unitState);
                } else if (revealedPosition) {
                    this.revealedOpponentUnitIds.add(unit.getId());
                    this.renderRevealedOpponentUnit(unit, revealedPosition, revealedOpponentPositions.size);
                }
                continue;
            }

            // A multi-cell unit stands on the CENTRE of its footprint, not on its baseCell. A heartbeat
            // snapshot captured while the server is mid-AI-planning can carry a PARTIAL footprint for the
            // active unit (2 of a 2x2's 4 cells), and a partial set is not a rectangle, so it has no
            // centre — that used to fall through to the raw baseCell centre and land the unit exactly
            // (halfStep, halfStep) off diagonally, the intermittent "half-cell jerk" seen while the AI
            // deliberates. baseCell IS the anchor, so rebuild the whole body down-left from it instead:
            // both the render position and the grid occupancy below are then right whatever the snapshot
            // carried.
            let cells = unitState.cells;
            let position = GridMath.getPositionForCells(gs, cells);
            if (!position) {
                cells = unit.getFootprintCellsForAnchor(unitState.baseCell);
                position = this.footprintCenterForAnchor(unit, unitState.baseCell);
            }
            unit.setPosition(position.x, position.y);

            // Trust the recorded/authoritative position: pass canOccupyLava/Water = true. Deriving them
            // from hasAbilityActive("Made of Fire"/"Made of Water") silently FAILED the occupy for units
            // whose traversal comes from a granted ability (Lava Striders artifact grants "Made of Fire"),
            // because ranked rebuilds units from the base creature config and the snapshot-ability filter
            // drops granted abilities. The unit then never landed in grid occupancy — invisible to
            // getUnitAtPosition, so a lava-standing enemy could not be hovered or attacked at all.
            this.grid.occupyCells(cells, unit.getId(), unit.getTeam(), unit.getAttackRange(), true, true);

            if (!unitState.dead) {
                unit.setBattlefieldVisualProjection(true);
                unit.ensureVisual(unitsContainer, gs);
                unit.syncVisual(unitsContainer, gs);
            }
        }

        const mutableFightProps = fightProps as unknown as {
            currentLap: number;
            fightStarted: boolean;
            fightFinished: boolean;
        };
        mutableFightProps.currentLap = Math.max(1, Math.floor(snapshot.currentLap || 1));
        mutableFightProps.fightStarted = snapshot.fightStarted;
        mutableFightProps.fightFinished = snapshot.fightFinished;
        fightProps.setTeamUnitsAlive(
            TeamVals.LOWER,
            snapshot.units.filter((unit) => unit.team === TeamVals.LOWER && !unit.dead).length,
        );
        fightProps.setTeamUnitsAlive(
            TeamVals.UPPER,
            snapshot.units.filter((unit) => unit.team === TeamVals.UPPER && !unit.dead).length,
        );
        // Rebuild the "already used a hourglass this lap" set from the authoritative per-unit flag. The ranked
        // client never runs flipLap()/enqueueHourglass(), so without this alreadyHourglass stays empty forever
        // → canHourglass is always true → the AI re-requests a hourglass on a unit's re-up, the server rejects
        // it (hourglass_not_available) and the turn dies as a skip. Rebuilding here (every snapshot) keeps it
        // authoritative and clears it at lap change (the server resets hasHourglassed in flipLap()).
        fightProps.restoreAlreadyHourglass(
            snapshot.units.filter((unit) => unit.hasHourglassed && !unit.dead).map((unit) => unit.properties.id),
        );

        this.layoutVersion++;
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        this.unitsHolder.refreshStackPowerForAllUnits();
        if (snapshot.narrowingLayers) {
            this.renderNarrowingLayers(snapshot.narrowingLayers);
            this.gridMatrix = this.grid.getMatrix();
            this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        }
        if (!snapshot.fightStarted) {
            this.refreshSynergyNumbers(TeamVals.LOWER);
            this.refreshSynergyNumbers(TeamVals.UPPER);
        }
        this.refreshUnits();
        this.refreshVisibleStateIfNeeded(true);
        this.updateUnitsOverlayVisibility();

        if (snapshot.fightStarted) {
            super.startScene();
            this.atmosphereAlpha = Math.max(this.atmosphereAlpha, 1);
            this.updateDungeonAtmosphere(true, this.atmosphereAlpha);
            const activeUnit = snapshot.currentUnitId
                ? (this.unitsHolder.getAllUnits().get(snapshot.currentUnitId) as RenderableUnit | undefined)
                : undefined;
            if (activeUnit && !activeUnit.isDead()) {
                this.handleNextUnitActivation(activeUnit);
            }
            this.fightStatsTracker.start(this.unitsHolder.getAllUnits().values());
            this.updateLiveFightStats();
        } else {
            this.sc_visibleStateUpdateNeeded = true;
        }
    }
    private createRenderableUnitFromSceneState(unitState: SandboxSceneUnitState, summoned = false): RenderableUnit {
        const base = Unit.createUnit(
            // Deep-clone so each restored unit owns its arrays (see createUnitForTeam/split).
            structuredClone(unitState.properties),
            this.sc_sceneSettings.getGridSettings(),
            unitState.team,
            UnitVals.CREATURE,
            this.abilityFactory,
            this.abilityFactory.getEffectsFactory(),
            summoned,
        );
        const renderableUnit = RenderableUnit.fromBase(base, this.texAny);
        renderableUnit.setBattlefieldVisualProjection(true);
        if (renderableUnit.getSpellsCount() > 0) {
            this.ensureDigitTextures();
            if (this.digitTextures) {
                renderableUnit.setSpellBookLayer(this.spellBookContainer, this.digitTextures);
            }
        }
        // Initialize durable spellbook rendering before Break makes getSpellsCount() temporarily return 0.
        // The mechanical effect still lands before hydrate's passive/stat refresh below.
        renderableUnit.syncAuthoritativeBreak(unitState.mechanicalBreakLaps);
        renderableUnit.refreshPossibleAttackTypes(true);
        if (unitState.attackType !== undefined) {
            renderableUnit.selectAttackType(unitState.attackType);
        }
        // Carry the hourglass (wait) state so the icon renders on rebuilt units (ranked snapshots /
        // sandbox replay); the engine sets it live during normal sandbox play.
        renderableUnit.setOnHourglass(unitState.onHourglass ?? false);
        // Restore the Aggr forced-target lock so a rebuilt unit still only offers its compelled target
        // (empty string clears it — the source died or the effect expired).
        renderableUnit.setTarget(unitState.forcedTargetId ?? "");
        // Terrifying Gaze is the inverse: restore only the prohibited gazer, never a blanket attack lock.
        renderableUnit.setForbiddenTarget(unitState.forbiddenTargetId ?? "");
        return renderableUnit;
    }
    private captureSceneState(): SandboxSceneState {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const units: SandboxSceneUnitState[] = [];

        for (const unit of this.unitsHolder.getAllUnits().values()) {
            const cells = unit.getCells().map((cell) => ({ x: cell.x, y: cell.y }));
            const occupiedCells = cells.filter((cell) => this.grid.getOccupantUnitId(cell) === unit.getId());
            const baseCell = unit.getBaseCell();
            units.push({
                properties: unit.getAllProperties(),
                team: unit.getTeam(),
                placed: occupiedCells.length > 0,
                dead: unit.isDead(),
                cells: occupiedCells,
                baseCell: { x: baseCell.x, y: baseCell.y },
                attackType: unit.getAttackTypeSelection(),
                onHourglass: unit.isOnHourglass(),
                forcedTargetId: unit.getTarget() || undefined,
                forbiddenTargetId: unit.getForbiddenTarget() || undefined,
                mechanicalBreakLaps: unit.getEffect("Break")?.getLaps(),
            });
        }

        return {
            gridType: fightProps.getGridType(),
            currentLap: fightProps.hasFightStarted() ? fightProps.getCurrentLap() : 0,
            fightStarted: fightProps.hasFightStarted(),
            fightFinished: fightProps.hasFightFinished(),
            currentUnitId: this.currentActiveUnit?.getId(),
            narrowingLayers: fightProps.hasFightStarted()
                ? Math.min(Math.max(0, fightProps.getLapsNarrowed()), HoCConstants.MAX_HOLE_LAYERS)
                : 0,
            centerDried: this.dungeonVisuals.isCenterDried(),
            obstacleHitsLeftLeft: fightProps.getObstacleHitsLeftLeft(),
            obstacleHitsLeftRight: fightProps.getObstacleHitsLeftRight(),
            units,
        };
    }
    public override getCurrentSandboxReplay(): SandboxReplay | undefined {
        return this.replayRecorder.getCurrentReplay();
    }
    public override canPlayCurrentSandboxReplay(): boolean {
        return !!this.getCurrentSandboxReplay()?.actions.length;
    }
    public override async playSandboxReplay(
        replay: SandboxReplay,
        throughSequence = replay.actions.length,
    ): Promise<boolean> {
        const sequence = Math.max(0, Math.min(Math.floor(throughSequence), replay.actions.length));
        if (!replay.initialState) {
            return false;
        }

        const finalRecord = sequence > 0 ? replay.actions[sequence - 1] : undefined;
        const finalWinner = replay.actions
            .slice(0, sequence)
            .flatMap((record) => record.events)
            .reduce<Extract<GameEvent, { type: "fight_finished" }> | undefined>(
                (winner, event) => (event.type === "fight_finished" ? event : winner),
                undefined,
            );

        this.setReplayPlaybackActive(true);
        this.replayRecordingSuspended = true;
        this.pendingReplayRecords = [];
        try {
            this.hydrateSceneState(cloneReplayData(replay.initialState));
            this.sc_sceneLog.clear();
            if (sequence <= 0) {
                return true;
            }

            const records = replay.actions.slice(0, sequence);
            const startFightIndex = records.findIndex((record) => record.action.type === "start_fight");

            for (let index = 0; index < records.length; index += 1) {
                const record = records[index];
                const previousState = index > 0 ? records[index - 1]?.stateAfter : replay.initialState;

                if (this.shouldApplyReplayRecordAsCheckpoint(record, index, startFightIndex)) {
                    this.hydrateSceneState(cloneReplayData(record.stateAfter));
                    continue;
                }

                if (previousState) {
                    this.hydrateSceneState(cloneReplayData(previousState));
                }

                const played = await this.playSandboxReplayRecord(record);
                if (!played) {
                    console.warn("Replay could not animate action", record.action.type, record.action);
                }
                this.hydrateSceneState(cloneReplayData(record.stateAfter));
                await this.delayReplay(Sandbox.REPLAY_ACTION_GAP_MS);
            }

            if (finalRecord?.stateAfter) {
                this.hydrateSceneState(cloneReplayData(finalRecord.stateAfter));
                if (finalRecord.stateAfter.fightFinished && finalWinner?.type === "fight_finished") {
                    this.finishFight(finalWinner.winningTeam, { mechanicsAlreadyApplied: true });
                }
            }
            return true;
        } finally {
            this.replayRecordingSuspended = false;
            this.setReplayPlaybackActive(false);
        }
    }
    public override async playAuthoritativeActionRecord(
        action: GameAction,
        events: GameEvent[],
        stateAfter?: unknown,
    ): Promise<boolean> {
        if (!events.length) {
            return false;
        }

        const record: SandboxReplay["actions"][number] = {
            sequence: 0,
            clientTimeMs: Date.now(),
            action: cloneReplayData(action),
            events: cloneReplayData(events),
            stateAfter: this.isSandboxSceneState(stateAfter) ? cloneReplayData(stateAfter) : this.captureSceneState(),
        };

        const priorPlaybackActive = this.replayPlaybackActive;
        this.replayPlaybackActive = true;
        // Safety valve against a hung replay. If any await inside the replay never resolves (a move
        // whose completion callback never fires, a projectile/animation that stalls, etc.),
        // replayPlaybackActive + isPlayingActionAnimation stay true forever — the AI never re-triggers
        // and snapshots get ignored: a silent scene freeze (observed as long stalls). Race the replay
        // against a hard timeout that force-finalizes animations, restores playback state, and asks the
        // scene to fully rebuild from the next authoritative snapshot (so any partial replay is
        // reconciled to server truth — we deliberately do NOT re-apply events here to avoid double
        // application; ranked is snapshot-authoritative).
        let timedOut = false;
        let hangTimer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<boolean>((resolve) => {
            hangTimer = setTimeout(() => {
                timedOut = true;
                this.moveAnimManager.forceFinish();
                this.sc_isAnimating = false;
                this.onReplayHangRecovery();
                console.warn("[replay-watchdog] forced recovery of a hung authoritative replay");
                resolve(false);
            }, Sandbox.REPLAY_HANG_WATCHDOG_MS);
        });
        try {
            const played = await Promise.race([this.playSandboxReplayRecord(record), timeout]);
            if (!timedOut && !played) {
                this.applyReplayEvents(record.events, record.stateAfter);
            }
            return played;
        } finally {
            if (hangTimer !== undefined) {
                clearTimeout(hangTimer);
            }
            this.replayPlaybackActive = priorPlaybackActive;
        }
    }
    /**
     * Hook fired when the replay-hang watchdog force-recovers a stuck authoritative replay. Base scenes
     * have nothing to reconcile; ranked overrides this to force the next snapshot into a full rebuild.
     */
    protected onReplayHangRecovery(): void {
        // no-op in the base sandbox
    }
    private delayReplay(ms: number): Promise<void> {
        return new Promise((resolve) => {
            globalThis.setTimeout(resolve, ms);
        });
    }
    private isSandboxSceneState(value: unknown): value is SandboxSceneState {
        if (!value || typeof value !== "object") {
            return false;
        }
        const state = value as Partial<SandboxSceneState>;
        if (!Array.isArray(state.units)) {
            return false;
        }
        return state.units.every((unit) => !!unit && typeof unit === "object" && "properties" in unit);
    }
    private shouldApplyReplayRecordAsCheckpoint(
        record: SandboxReplay["actions"][number],
        index: number,
        startFightIndex: number,
    ): boolean {
        if (startFightIndex >= 0 && index <= startFightIndex) {
            return true;
        }
        return (
            record.action.type === "start_fight" ||
            record.action.type === "place_unit" ||
            record.action.type === "split_unit" ||
            record.action.type === "delete_unit"
        );
    }
    private async playSandboxReplayRecord(record: SandboxReplay["actions"][number]): Promise<boolean> {
        const action = cloneReplayData(record.action);
        const replayActorId = this.getReplayTurnActorId(action);
        if (replayActorId && !this.ensureReplayActiveUnit(replayActorId)) {
            return false;
        }
        switch (action.type) {
            case "start_fight": {
                const started = this.startScene();
                this.advanceAfterNoActiveUnitIfNeeded();
                return started;
            }
            case "move_unit":
                return this.playReplayMoveRecord(record);
            case "melee_attack":
            case "range_attack":
                return this.playReplayAttackRecord(record);
            case "obstacle_attack":
                return this.playReplayObstacleAttackAction(record);
            case "area_throw_attack":
                return this.playReplayAreaThrowAction(record);
            case "cast_spell":
                return this.playReplayCastSpellAction(record);
            case "end_turn":
            case "wait_turn":
            case "defend_turn":
            case "select_attack_type":
                return this.playReplayControlRecord(record);
            case "place_unit":
            case "split_unit":
            case "delete_unit":
                return this.applyGameAction(action);
            default:
                return false;
        }
    }
    private getReplayTurnActorId(action: GameAction): string | undefined {
        switch (action.type) {
            case "end_turn":
            case "wait_turn":
            case "defend_turn":
            case "select_attack_type":
            case "move_unit":
                return action.unitId;
            case "melee_attack":
            case "range_attack":
            case "obstacle_attack":
            case "area_throw_attack":
                return action.attackerId;
            case "cast_spell":
                return action.casterId;
            case "start_fight":
            case "place_unit":
            case "split_unit":
            case "delete_unit":
                return undefined;
            default:
                return undefined;
        }
    }
    private ensureReplayActiveUnit(unitId: string): boolean {
        const unit = this.unitsHolder.getAllUnits().get(unitId) as RenderableUnit | undefined;
        if (!unit || unit.isDead()) {
            return false;
        }

        if (this.currentActiveUnit?.getId() === unitId) {
            return true;
        }

        if (this.currentActiveUnit) {
            this.currentActiveUnit.setActiveTurn(false);
            this.currentActiveUnit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
        }
        this.handleNextUnitActivation(unit);
        return true;
    }
    private async playReplayControlRecord(record: SandboxReplay["actions"][number]): Promise<boolean> {
        const action = record.action;
        const actorId = this.getReplayTurnActorId(action);
        const actor = actorId ? (this.unitsHolder.getAllUnits().get(actorId) as RenderableUnit | undefined) : undefined;

        switch (action.type) {
            case "end_turn":
                if (actor) {
                    this.sc_sceneLog.updateLog(`${actor.getName()} skips turn`);
                }
                break;
            case "wait_turn":
                if (actor) {
                    this.sc_sceneLog.updateLog(`${actor.getName()} waits (hourglass)`);
                }
                break;
            case "defend_turn":
                if (actor) {
                    this.sc_sceneLog.updateLog(`${actor.getName()} uses Luck Shield`);
                }
                break;
            case "select_attack_type":
                break;
            default:
                return false;
        }

        this.applyReplayEvents(record.events);
        await this.delayReplay(Sandbox.REPLAY_CONTROL_HOLD_MS);
        return true;
    }
    private playReplayMoveRecord(record: SandboxReplay["actions"][number]): Promise<boolean> {
        const action = cloneReplayData(record.action);
        if (action.type !== "move_unit") {
            return Promise.resolve(false);
        }

        const unit = this.unitsHolder.getAllUnits().get(action.unitId) as RenderableUnit | undefined;
        const moveEvent = record.events.find(
            (event): event is Extract<GameEvent, { type: "unit_moved" }> =>
                event.type === "unit_moved" && event.unitId === action.unitId,
        );
        if (!unit || !moveEvent) {
            return Promise.resolve(false);
        }

        this.currentActiveUnit = unit;
        unit.setActiveTurn(true);
        unit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
        return this.playRecordedMoveAnimation(unit, moveEvent).then((played) => {
            // The move animation only plays unit_moved. Apply the rest of the record's events the
            // same way the attack/control replays do, so map narrowing, the dried/cleared center,
            // Armageddon, and system pushes/deaths that ride on a lap-ending move actually render.
            this.applyReplayEvents(record.events);
            return played;
        });
    }
    private playRecordedMoveAnimation(
        unit: RenderableUnit,
        moveEvent: Extract<GameEvent, { type: "unit_moved" }>,
        rapidCharge = false,
    ): Promise<boolean> {
        const worldPath = this.createRecordedMoveWorldPath(unit, moveEvent);
        if (worldPath.length < 2) {
            unit.setPosition(moveEvent.to.x, moveEvent.to.y);
            unit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
            this.syncMovedUnitGridOccupancy(unit, moveEvent);
            return Promise.resolve(true);
        }

        // For an opponent's move, pin a destination silhouette at the target cell for the duration
        // of the slide (reusing the relayed move-intent renderer), so the viewer can see where the
        // unit is heading even when no live aim was relayed. Cleared when the animation finishes.
        const destinationSilhouetteShown = this.shouldShowMoveDestinationSilhouette(unit);
        if (destinationSilhouetteShown) {
            this.setOpponentMoveIntent({
                unitId: unit.getId(),
                cell: this.getMoveDestinationSilhouetteCell(unit, moveEvent),
            });
        }

        return new Promise((resolve) => {
            const gs = this.sc_sceneSettings.getGridSettings();
            const speed = gs.getCellSize() * Sandbox.MOVE_SPEED_FACTOR;
            this.moveAnimManager.startMoveAnimation(
                unit,
                worldPath,
                speed,
                this.getRecordedMoveDestCell(moveEvent),
                this.shouldUseRecordedMoveTrack(unit, moveEvent) ? moveEvent.path : undefined,
                () => {
                    if (destinationSilhouetteShown) {
                        this.setOpponentMoveIntent(undefined);
                    }
                    this.syncMovedUnitGridOccupancy(unit, moveEvent);
                    resolve(true);
                },
                rapidCharge,
            );
            this.isActiveUnitMoving = true;
            if (this.sc_visibleState) {
                this.sc_visibleStateUpdateNeeded = true;
            }

            this.hoverManager.setSilhouetteLocked(true);
            this.currentActivePath = undefined;
            this.currentActiveKnownPaths = undefined;
            this.currentActivePathHashes = undefined;
            this.hoverManager.clearHoverSilhouette();
            this.hoverManager.hoveredUnitHighlight = undefined;
            this.sc_moveBlocked = true;
        });
    }
    /**
     * Recorded moves (ranked opponent replays, sandbox replays) only animate the sprite — the grid
     * occupancy matrix is otherwise left pointing at the unit's old cells, because the follow-up
     * authoritative snapshot is skipped (skipBoardRebuild). Re-point occupancy at the destination so
     * grid-based hit-testing (hover/attack targeting) finds the unit where it actually is, not where
     * it came from.
     */
    private syncMovedUnitGridOccupancy(
        unit: RenderableUnit,
        moveEvent: Extract<GameEvent, { type: "unit_moved" }>,
    ): void {
        const destCells = moveEvent.targetCells.length ? moveEvent.targetCells : unit.getCells();
        if (!destCells.length) {
            return;
        }
        this.grid.cleanupAll(unit.getId(), unit.getAttackRange(), unit.isSmallSize());
        // Recorded move = server-validated destination; always stamp it (see hydrateSceneState — deriving
        // lava/water permission locally fails for granted abilities like Lava Striders' "Made of Fire").
        this.grid.occupyCells(destCells, unit.getId(), unit.getTeam(), unit.getAttackRange(), true, true);
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
    }
    private createRecordedMoveWorldPath(
        unit: RenderableUnit,
        moveEvent: Extract<GameEvent, { type: "unit_moved" }>,
    ): HoCMath.XY[] {
        const gs = this.sc_sceneSettings.getGridSettings();
        const worldPath: HoCMath.XY[] = [{ x: moveEvent.from.x, y: moveEvent.from.y }];
        unit.setPosition(moveEvent.from.x, moveEvent.from.y);

        if (!moveEvent.path.length || this.isRecordedMoveFootprintOnly(unit, moveEvent)) {
            this.pushReplayWorldPathPoint(worldPath, moveEvent.to);
            return worldPath;
        }

        let offsetX = 0;
        let offsetY = 0;
        if (!unit.isSmallSize()) {
            const lastPathCell = moveEvent.path[moveEvent.path.length - 1];
            const lastCellPos = GridMath.getPositionForCell(lastPathCell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
            if (lastCellPos) {
                offsetX = moveEvent.to.x - lastCellPos.x;
                offsetY = moveEvent.to.y - lastCellPos.y;
            }
        }

        for (const cell of moveEvent.path) {
            const pos = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
            if (pos) {
                this.pushReplayWorldPathPoint(worldPath, { x: pos.x + offsetX, y: pos.y + offsetY });
            }
        }
        this.pushReplayWorldPathPoint(worldPath, moveEvent.to);
        return worldPath;
    }
    private pushReplayWorldPathPoint(path: HoCMath.XY[], point: HoCMath.XY): void {
        const last = path[path.length - 1];
        if (!last || Math.abs(last.x - point.x) > 0.01 || Math.abs(last.y - point.y) > 0.01) {
            path.push({ x: point.x, y: point.y });
        }
    }
    private isRecordedMoveFootprintOnly(
        unit: RenderableUnit,
        moveEvent: Extract<GameEvent, { type: "unit_moved" }>,
    ): boolean {
        return (
            !unit.isSmallSize() &&
            moveEvent.targetCells.length === moveEvent.path.length &&
            moveEvent.path.length > 0 &&
            moveEvent.path.every((cell) =>
                moveEvent.targetCells.some((targetCell) => targetCell.x === cell.x && targetCell.y === cell.y),
            )
        );
    }
    private shouldUseRecordedMoveTrack(
        unit: RenderableUnit,
        moveEvent: Extract<GameEvent, { type: "unit_moved" }>,
    ): boolean {
        return moveEvent.path.length > 0 && !this.isRecordedMoveFootprintOnly(unit, moveEvent);
    }
    /**
     * The cell an opponent's move-destination silhouette is pinned to. The renderer rebuilds the whole
     * footprint from this single cell via findOpponentLargeUnitFootprint, whose first candidate treats it
     * as the block's MIN (bottom-left) corner — so that is what must be sent for the rebuilt tiles to
     * match where the unit actually lands. getRecordedMoveDestCell returns targetCells[0], which is not
     * that corner, so for multi-cell units it placed the preview beside the real landing. A one-cell body
     * is unambiguous.
     */
    private getMoveDestinationSilhouetteCell(
        unit: RenderableUnit,
        moveEvent: Extract<GameEvent, { type: "unit_moved" }>,
    ): HoCMath.XY {
        if (unit.isSmallSize() || !moveEvent.targetCells.length) {
            return this.getRecordedMoveDestCell(moveEvent);
        }
        return moveEvent.targetCells.reduce(
            (min, cell) => ({ x: Math.min(min.x, cell.x), y: Math.min(min.y, cell.y) }),
            { x: moveEvent.targetCells[0].x, y: moveEvent.targetCells[0].y },
        );
    }
    private getRecordedMoveDestCell(moveEvent: Extract<GameEvent, { type: "unit_moved" }>): HoCMath.XY {
        if (moveEvent.targetCells.length) {
            return moveEvent.targetCells[0];
        }
        if (moveEvent.path.length) {
            return moveEvent.path[moveEvent.path.length - 1];
        }
        return (
            GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), moveEvent.to) ?? {
                x: Math.round(moveEvent.to.x),
                y: Math.round(moveEvent.to.y),
            }
        );
    }
    /*
     * ───────────────────────────────────────────────────────────────────────────────────────────────
     * ABILITY VFX CONTRACT — read before adding a new creature-ability visual effect.
     *
     * Ranked is server-authoritative, so the LIVE sandbox path (executeAttackSequence) and the RANKED
     * REPLAY path (playReplayAttackRecord) are SEPARATE code paths. A VFX added to only one renders in
     * one mode but not the other — the recurring "works in sandbox, missing in ranked" bug. To keep them
     * in lockstep, every ability VFX MUST follow this pattern:
     *
     *   1. SHARED HELPER. Put it in a `spawn<Ability>Vfx(attacker, target, damage?)` method (like the
     *      ones below) that gates INTERNALLY on `attacker.hasAbilityActive("<Ability>")` + the damage
     *      landing. Gate on the ABILITY, never on team/viewer — that keeps it team-agnostic, so it shows
     *      for BOTH teams (both ranked clients replay the same records).
     *   2. CALL IT FROM BOTH PATHS — once in executeAttackSequence (live) and once in
     *      playReplayAttackRecord (ranked replay) — AT IMPACT, next to showReplayAttackDamage, so the
     *      effect and its damage numbers land in sync. (A VFX fired before the attack one-shot flashes
     *      ~360ms early; the sole exception is a deliberate WIND-UP effect like Fire Breath.)
     *   3. SNAPSHOT-DRIVEN effects (debuff/buff icon pops, death shatter, board-wide waves) are NOT part
     *      of the attack replay — wire them into RankedPlayScene's snapshot path (processDebuffPops /
     *      shatterNewlyDeadUnits / renderNewlyAppliedArmageddon), diffed BEFORE the board-rebuild guards
     *      so a mid-animation snapshot can't drop them. DIFF EARLY, ANIMATE AT IMPACT: the snapshot lands
     *      when the SERVER resolves the action, which is well before the replayed projectile arrives or
     *      the attacker finishes walking in, so animating on the diff pops the icon ahead of the blow.
     *      Route the animation through queueOrPlayEffectPops — it holds the pop while a strike is in
     *      flight and flushEffectPops releases it here at impact (with a per-frame drain as the
     *      backstop, so holding can never swallow one).
     *
     * Retaliation note: playReplayRetaliation currently renders only the responder's return shot +
     * damage, not its ability sweeps — mirror any of these helpers there if a counter needs the full VFX.
     * ───────────────────────────────────────────────────────────────────────────────────────────────
     */
    /**
     * Render every authoritative Predatory Assimilation transfer performed by `thiefId`. The event is
     * the outcome gate (so a failed chance never flashes), while callers choose the correct impact:
     * initiating strike or response strike. Both local combat and replayed/ranked combat call this same
     * helper. `unitSnapshot` keeps a lethal victim's last visual position available until cleanup.
     */
    protected spawnAbilityStealVfx(
        events: readonly GameEvent[] | undefined,
        thiefId: string,
        unitSnapshot?: ReadonlyMap<string, RenderableUnit>,
    ): void {
        if (!events?.length || !this.combatVisuals) {
            return;
        }
        const units = this.unitsHolder.getAllUnits();
        const thief = (units.get(thiefId) as RenderableUnit | undefined) ?? unitSnapshot?.get(thiefId);
        if (!thief) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        for (const event of events) {
            if (event.type !== "ability_stolen" || event.thiefId !== thiefId) {
                continue;
            }
            const victim =
                (units.get(event.targetId) as RenderableUnit | undefined) ?? unitSnapshot?.get(event.targetId);
            if (!victim) {
                continue;
            }
            victim.flashDebuffDarken();
            const iconTexture = this.texAny(AbilityHelper.abilityToTextureName(event.abilityName));
            this.combatVisuals.spawnAbilitySteal(
                victim.getVisualCenter(gs),
                thief.getVisualCenter(gs),
                gs.getCellSize(),
                event.abilityName,
                iconTexture,
                () => {
                    if (!thief.isDead()) {
                        thief.flashBuffApplied();
                    }
                },
            );
        }
    }
    /**
     * Render ability cards explicitly delivered by a spell. Wild Regeneration is the first: its card flies
     * from the Troll to the receiving ally with GIFTED (or COPIED under Holy Cross). The outcome comes from
     * `spell_cast.abilityTransfers`, so this helper is safe in both the live sandbox path and ranked replay;
     * neither side guesses from a before/after snapshot.
     */
    protected spawnAbilityTransferVfx(
        events: readonly GameEvent[] | undefined,
        unitSnapshot?: ReadonlyMap<string, RenderableUnit>,
    ): void {
        if (!events?.length || !this.combatVisuals) {
            return;
        }
        const units = this.unitsHolder.getAllUnits();
        const gs = this.sc_sceneSettings.getGridSettings();
        for (const event of events) {
            if (event.type !== "spell_cast" || !event.abilityTransfers?.length) {
                continue;
            }
            for (const transfer of event.abilityTransfers) {
                const from =
                    (units.get(transfer.fromUnitId) as RenderableUnit | undefined) ??
                    unitSnapshot?.get(transfer.fromUnitId);
                const to =
                    (units.get(transfer.toUnitId) as RenderableUnit | undefined) ??
                    unitSnapshot?.get(transfer.toUnitId);
                if (!from || !to) {
                    continue;
                }
                const iconTexture = this.texAny(AbilityHelper.abilityToTextureName(transfer.abilityName));
                this.combatVisuals.spawnAbilityGift(
                    from.getVisualCenter(gs),
                    to.getVisualCenter(gs),
                    gs.getCellSize(),
                    transfer.abilityName,
                    transfer.mode,
                    iconTexture,
                    () => {
                        // A ranked post-cast hydrate can replace every RenderableUnit while the card is
                        // still flying. Resolve the current body by id on arrival instead of flashing the
                        // captured (destroyed) pre-hydrate instance.
                        const currentRecipient = this.unitsHolder.getAllUnits().get(transfer.toUnitId) as
                            RenderableUnit | undefined;
                        if (currentRecipient && !currentRecipient.isDead()) {
                            currentRecipient.flashBuffApplied();
                        }
                    },
                );
            }
        }
    }
    /** Rebuild the receiving spellbook/sidebar after an ability-transfer event mutates either endpoint. */
    private syncAbilityTransferUi(
        event: Extract<GameEvent, { type: "spell_cast" }>,
        unitSnapshot: ReadonlyMap<string, RenderableUnit>,
    ): void {
        if (!event.abilityTransfers?.length) {
            return;
        }
        const units = this.unitsHolder.getAllUnits();
        for (const transfer of event.abilityTransfers) {
            const recipient =
                (units.get(transfer.toUnitId) as RenderableUnit | undefined) ?? unitSnapshot.get(transfer.toUnitId);
            // Read the durable spell entries, not getSpellsCount(): Break deliberately makes the latter
            // report zero. A broken, previously spell-less ally can still receive this card, and must have
            // its Pixi spellbook layer ready for when Break expires.
            if (recipient?.getUnitProperties().spells.length) {
                this.ensureDigitTextures();
                if (this.digitTextures) {
                    recipient.setSpellBookLayer(this.spellBookContainer, this.digitTextures);
                }
            }

            const selectedId = this.sc_selectedUnitProperties?.id;
            if (selectedId !== transfer.fromUnitId && selectedId !== transfer.toUnitId) {
                continue;
            }
            const selected = (units.get(selectedId) as RenderableUnit | undefined) ?? unitSnapshot.get(selectedId);
            if (selected) {
                const props = { ...selected.getUnitProperties() };
                this.sc_selectedUnitProperties = props;
                this.setSelectedUnitProperties(props);
                this.sc_unitPropertiesUpdateNeeded = true;
            }
        }
    }
    /**
     * Pikeman's Skewer Strike pierces the primary target AND the unit(s) standing behind it along the
     * attack line. Draw a wind "spear" through attacker → target → those units so the two-unit (or more)
     * pierce reads at a glance. Driven off the authoritative `damage.secondary` (source "skewer_strike"),
     * so it fires identically in sandbox (live engine events) and ranked (replayed events).
     */
    protected spawnSkewerWindSpearVfx(attacker: RenderableUnit, target: Unit, damage?: IVisibleDamage): void {
        const skewerHits = (damage?.secondary ?? []).filter((s) => s.source === "skewer_strike");
        if (!skewerHits.length) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const centerOf = (unitId: string, fallback: HoCMath.XY): HoCMath.XY => {
            const u = this.unitsHolder.getAllUnits().get(unitId) as RenderableUnit | undefined;
            return u && typeof u.getVisualCenter === "function"
                ? u.getVisualCenter(gs)
                : projectBattlefieldPoint(fallback, gs);
        };
        const attackerCenter = attacker.getVisualCenter(gs);
        const targetCenter =
            target instanceof RenderableUnit
                ? target.getVisualCenter(gs)
                : projectBattlefieldPoint(target.getPosition(), gs);
        const points: HoCMath.XY[] = [attackerCenter, targetCenter];
        const skewerUnits: (RenderableUnit | undefined)[] = [];
        for (const hit of skewerHits) {
            points.push(centerOf(hit.unitId, hit.position));
            skewerUnits.push(this.unitsHolder.getAllUnits().get(hit.unitId) as RenderableUnit | undefined);
        }
        this.combatVisuals?.spawnWindSpear(points, gs.getCellSize());

        // Jolt each pierced "behind" unit a little as the light reaches it — a small push in the pierce
        // direction, timed to when the light orb passes (the target itself already gets the normal hit
        // knockback). Travel window matches the VFX so the shake lands as the light arrives.
        const cs = gs.getCellSize();
        let total = 0;
        for (let i = 1; i < points.length; i++) {
            total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        }
        const travelMs = 190; // keep in sync with WINDSPEAR_TRAVEL_MS
        let acc = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y); // up to the target
        for (let k = 0; k < skewerUnits.length; k++) {
            const idx = k + 2; // points[2..] are the behind units
            const segdx = points[idx].x - points[idx - 1].x;
            const segdy = points[idx].y - points[idx - 1].y;
            const slen = Math.hypot(segdx, segdy) || 1;
            acc += slen;
            const unit = skewerUnits[k];
            if (!unit || typeof unit.applyRecoil !== "function") {
                continue;
            }
            const jmag = cs * 0.14;
            const jx = (segdx / slen) * jmag;
            const jy = (segdy / slen) * jmag;
            const arrivalMs = total > 0 ? (acc / total) * travelMs : 0;
            setTimeout(() => unit.applyRecoil(jx, jy), Math.max(0, arrivalMs));
        }

        // Wind-up spear thrust on the attacker: pull back from the target, then lunge into it. Applied
        // last so it overrides the plain forward recoil for a skewer ("замахивается копьём").
        const dirX = targetCenter.x - attackerCenter.x;
        const dirY = targetCenter.y - attackerCenter.y;
        const dlen = Math.hypot(dirX, dirY);
        if (dlen > 0.001) {
            const mag = gs.getCellSize() * 0.32;
            attacker.applyWindupRecoil((dirX / dlen) * mag, (dirY / dlen) * mag);
        }
    }
    /**
     * Shatter Armor: slash red "sword wound" gashes across the struck enemy at impact when the attacker
     * has the ability and the blow landed. Gated like the other melee-ability VFX (hasAbilityActive +
     * damage), so it fires identically in sandbox (live) and ranked (replay).
     */
    protected spawnShatterArmorSlashVfx(attacker: RenderableUnit, target: Unit, damage?: IVisibleDamage): void {
        if (!attacker.hasAbilityActive("Shatter Armor") || !damage || damage.amount <= 0) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const attackerCenter = attacker.getVisualCenter(gs);
        const targetCenter =
            target instanceof RenderableUnit
                ? target.getVisualCenter(gs)
                : projectBattlefieldPoint(target.getPosition(), gs);
        const dir = { x: targetCenter.x - attackerCenter.x, y: targetCenter.y - attackerCenter.y };
        this.combatVisuals?.spawnSlash(targetCenter, gs.getCellSize(), dir);
    }
    /**
     * Black Dragon's Fire Breath: a fiery wave sweeping from the attacker through the target and ~2 cells
     * past it, so the line/breath reads. Gated on the ability + a landed hit. Shared by sandbox (live) and
     * ranked (replay). NOTE: this is a WIND-UP effect — callers fire it DURING the attack swing (before
     * the one-shot), not at impact, so the fire erupts with the strike instead of trailing it.
     */
    protected spawnFireBreathVfx(attacker: RenderableUnit, target: Unit, damage?: IVisibleDamage): void {
        if (!attacker.hasAbilityActive("Fire Breath") || !damage || damage.amount <= 0) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const from = attacker.getVisualCenter(gs);
        const tCenter =
            target instanceof RenderableUnit
                ? target.getVisualCenter(gs)
                : projectBattlefieldPoint(target.getPosition(), gs);
        const dx = tCenter.x - from.x;
        const dy = tCenter.y - from.y;
        const len = Math.hypot(dx, dy);
        if (len <= 0.001) {
            return;
        }
        const overshoot = gs.getCellSize() * 2; // breath continues ~2 cells past the target
        this.combatVisuals.spawnFireSweep(
            from,
            { x: tCenter.x + (dx / len) * overshoot, y: tCenter.y + (dy / len) * overshoot },
            gs.getCellSize(),
        );
    }
    /**
     * FIRE damage burst — embers + a soot curl over every unit this exchange burned, so fire damage
     * reads as burning instead of as a plain red number. Three sources, one look:
     *   • the Efreet's Fire Shield reflect (`secondary` source "fire_shield"), on whoever struck it;
     *   • every unit a Black Dragon's breath burns THROUGH (`secondary` source "fire_breath") — the
     *     line sweep already rushes past them, this is the burn where it lands;
     *   • a hit from a Fireforged Sword-buffed attacker: its bonus damage is the burning blade, so the
     *     primary victim ignites too (skipped when that unit already burned from a secondary above).
     * Positions come from the live unit, falling back to the engine's impact-time position so a unit
     * killed by the burn still shows it. Gated on a landed hit; shared by sandbox (live) and ranked
     * (replay) — both call it AT IMPACT, with the damage numbers.
     */
    protected spawnFireDamageVfx(attacker: RenderableUnit, target: Unit, damage?: IVisibleDamage, delayMs = 0): void {
        if (!this.combatVisuals) {
            return;
        }
        const burns = fireBurnTargets(damage, attacker.hasStatusBuff("Fireforged Sword"), target.getId());
        if (!burns.length) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const cellSize = gs.getCellSize();
        for (const burn of burns) {
            const spawn = (): void => {
                // Resolved at spawn time so a unit that moved in the meantime burns where it is now
                // (and one the burn killed still burns where the engine says it was hit).
                const unit = this.unitsHolder.getAllUnits().get(burn.unitId) as RenderableUnit | undefined;
                const position =
                    unit && !unit.isDead() ? unit.getVisualCenter(gs) : projectBattlefieldPoint(burn.position, gs);
                this.combatVisuals?.spawnFireBurn(position, cellSize, burn.scale);
            };
            if (delayMs > 0) {
                setTimeout(spawn, delayMs);
            } else {
                spawn();
            }
        }
    }
    /**
     * Thunderbird's Chain Lightning: a purple bolt arcing attacker → target → each chained enemy (the
     * same ordered chain the engine used). Gated on the ability + a landed hit. Shared by sandbox (live)
     * and ranked (replay); fired AT IMPACT so the bolt lands with the (AOE) damage numbers.
     */
    protected spawnChainLightningVfx(attacker: RenderableUnit, target: Unit, damage?: IVisibleDamage): void {
        if (!attacker.hasAbilityActive("Chain Lightning") || !damage || damage.amount <= 0) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        try {
            const targetRenderable = target as RenderableUnit;
            const chain = AllAbilities.getChainLightningTargets(target, this.grid, this.unitsHolder);
            const points: HoCMath.XY[] = [
                attacker.getVisualCenter(gs),
                typeof targetRenderable.getVisualCenter === "function"
                    ? targetRenderable.getVisualCenter(gs)
                    : projectBattlefieldPoint(target.getPosition(), gs),
            ];
            const seen = new Set<string>([target.getId()]);
            for (const u of chain) {
                if (seen.has(u.getId())) {
                    continue;
                }
                seen.add(u.getId());
                const ru = u as RenderableUnit;
                points.push(
                    typeof ru.getVisualCenter === "function"
                        ? ru.getVisualCenter(gs)
                        : projectBattlefieldPoint(u.getPosition(), gs),
                );
            }
            this.combatVisuals.spawnChainLightning(points, gs.getCellSize());
        } catch (err) {
            console.error("Failed to spawn Chain Lightning VFX", err);
        }
    }
    /**
     * A fully-MISSED attack (Dodge / Small Specie / Boar Saliva / Broken Aegis): pop a "MISS" label
     * under the dodging unit and play its bullet-time dodge (sidestep + afterimage trail). Shared by
     * the live sandbox path (executeAttackSequence) and the ranked replay path (showReplayAttackDamage)
     * per the ABILITY VFX CONTRACT above. Gates internally on damage.missed so callers can pass the
     * payload unconditionally. The dodger is resolved from damage.unitId (the unit the engine actually
     * aimed the blow at — e.g. the unit intercepting a ranged shot), falling back to the clicked target.
     */
    protected showAttackMissedVfx(attacker: RenderableUnit, target: Unit, damage?: IVisibleDamage): void {
        if (!damage?.missed) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const cell = gs.getCellSize();
        const aCenter = attacker.getVisualCenter(gs);
        const victimId = damage.unitId ?? target.getId();
        const victim = (this.unitsHolder.getAllUnits().get(victimId) as RenderableUnit | undefined) ?? target;
        const rVictim = victim as RenderableUnit;
        const vCenter =
            typeof rVictim.getVisualCenter === "function"
                ? rVictim.getVisualCenter(gs)
                : projectBattlefieldPoint(victim.getPosition(), gs);
        const dir = { x: vCenter.x - aCenter.x, y: vCenter.y - aCenter.y };
        const len = Math.hypot(dir.x, dir.y);

        if (typeof rVictim.playDodgeAnimation === "function" && len > 0.001) {
            const nx = dir.x / len;
            const ny = dir.y / len;
            // Sidestep mostly perpendicular to the strike line with a touch of "away"; large (2x2)
            // units step a bit further so the dodge visibly clears their silhouette. The perpendicular
            // side is picked per-unit (id parity) so repeated dodges don't all lean the same way.
            const side = victim.getId().charCodeAt(0) % 2 === 0 ? 1 : -1;
            const mag = cell * (victim.isSmallSize() ? 1 : 1.3);
            rVictim.playDodgeAnimation((-ny * side * 0.4 + nx * 0.3) * mag, (nx * side * 0.4 + ny * 0.3) * mag);
        }

        // "MISS" pops UNDER the unit (world +y is up) and drifts along the strike line, clear of the
        // dodge itself.
        const below = { x: vCenter.x, y: vCenter.y - (victim.isSmallSize() ? cell * 0.85 : cell * 1.25) };
        this.combatVisuals.showMissLabel(below, dir);
    }
    /**
     * A snare shrugged off by magic armor (Vine Throw): pop "RESISTED" over the saved creature and give it
     * the same arcane flash a resisted spell gets. Drifts away from the caster when that position is known,
     * so the label reads as the throw glancing off. Shared by the live and ranked paths per the ABILITY VFX
     * CONTRACT — ranked replays the identical vine_placed event.
     */
    /**
     * Snare saves the SERVER resolved, taken off a replayed cast record. Ranked replays every Vine Throw
     * (including the local player's own), and the local re-apply beside it re-rolls the magic-armor save —
     * so the pop has to come from the record or the two clients would disagree about who shrugged it off.
     * Same reasoning as renderHealVfx / renderCastOutcomes right next to it.
     */
    protected renderSnareResistVfx(events: readonly GameEvent[]): void {
        for (const event of events) {
            if (event.type !== "vine_placed" || !event.snareResisted) {
                continue;
            }
            const caster = this.unitsHolder.getAllUnits().get(event.casterId) as RenderableUnit | undefined;
            const gs = this.sc_sceneSettings.getGridSettings();
            const casterPosition =
                caster && typeof caster.getVisualCenter === "function"
                    ? caster.getVisualCenter(gs)
                    : caster?.getPosition();
            this.showSnareResistedVfx(event.targetId, casterPosition);
        }
    }
    protected showSnareResistedVfx(targetId: string, casterPosition?: HoCMath.XY): void {
        const target = this.unitsHolder.getAllUnits().get(targetId) as RenderableUnit | undefined;
        if (!target) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const cell = gs.getCellSize();
        const center =
            typeof target.getVisualCenter === "function"
                ? target.getVisualCenter(gs)
                : projectBattlefieldPoint(target.getPosition(), gs);
        const above = { x: center.x, y: center.y + (target.isSmallSize() ? cell * 0.75 : cell * 1.15) };
        const direction = casterPosition
            ? { x: center.x - casterPosition.x, y: center.y - casterPosition.y }
            : undefined;
        this.combatVisuals.showResistLabel(above, direction);
    }
    /**
     * Lucky Strike proc VFX: gold "LUCKY!" + gold flash over each unit whose Lucky Strike fired this
     * exchange (damage.luckyStrikeBy, written by the engine — covers attacker AND responder procs).
     * ABILITY VFX CONTRACT: called from BOTH the live attack path and the ranked replay path; no-op
     * unless the payload carries procs, so callers pass the damage unconditionally.
     */
    protected spawnLuckyStrikeVfx(damage?: IVisibleDamage): void {
        if (!damage?.luckyStrikeBy?.length) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const cell = gs.getCellSize();
        for (const strikerId of damage.luckyStrikeBy) {
            const striker = this.unitsHolder.getAllUnits().get(strikerId) as RenderableUnit | undefined;
            if (!striker || striker.isDead()) {
                continue;
            }
            striker.flashLuckyStrike();
            const center = striker.getVisualCenter(gs);
            // ABOVE the striker (world +y is up) — the MISS label owns the space below its victim.
            const above = { x: center.x, y: center.y + (striker.isSmallSize() ? cell * 0.85 : cell * 1.25) };
            this.combatVisuals.showLuckyLabel(above);
        }
    }
    private async playReplayAttackRecord(record: SandboxReplay["actions"][number]): Promise<boolean> {
        const action = cloneReplayData(record.action);
        if (action.type !== "melee_attack" && action.type !== "range_attack") {
            return false;
        }

        const attacker = this.unitsHolder.getAllUnits().get(action.attackerId) as RenderableUnit | undefined;
        const target = this.unitsHolder.getAllUnits().get(action.targetId) as RenderableUnit | undefined;
        const attackEvent = record.events.find(
            (event): event is Extract<GameEvent, { type: "unit_attacked" }> =>
                event.type === "unit_attacked" && event.attackerId === action.attackerId,
        );
        if (!attacker || !target || !attackEvent) {
            return false;
        }

        this.currentActiveUnit = attacker;
        attacker.setActiveTurn(true);
        attacker.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
        this.sc_moveBlocked = true;

        if (attackEvent.attackType === "range") {
            await this.playDirectionalAttackOneShot(attacker, target, 360, false);
            // A plain (non-piercing) shot stops at the FIRST unit on its trajectory. When a unit
            // intercepts the shot before the aimed target, the damage lands on that intercepting unit —
            // the authoritative engine records each outgoing shot's victim in its ordered animation.
            // Fire each projectile at THAT unit so it visually stops where the damage lands, instead of
            // flying to the aimed target behind it. Through Shot pierces everyone, so each recorded
            // volley travels to the aimed edge rather than stopping on a pierced stack.
            const throughShot = attacker.hasAbilityActive("Through Shot");
            const projectilePlan = resolveRangeProjectileImpactPlan(
                attackEvent,
                target.getId(),
                attacker.getPosition(),
                throughShot,
                this.shouldPlayReplayDoubleShotProjectile() &&
                    !!(attacker.getAbility("Double Shot") ?? attacker.getAbility("Crafted Double Shot")),
            );
            const firstProjectile = this.resolveRangeProjectilePlaybackTarget(projectilePlan[0], target);
            await this.playReplayProjectile(attacker, firstProjectile.target, firstProjectile.position);
            const secondImpact = projectilePlan[1];
            if (secondImpact) {
                const secondProjectile = this.resolveRangeProjectilePlaybackTarget(secondImpact, target);
                void this.playReplayProjectile(attacker, secondProjectile.target, secondProjectile.position);
            }
        } else {
            // Move + melee: the authoritative engine folds the approach into the attack (one
            // unit_attacked event, no separate unit_moved), so replay the walk to the attack-from
            // cell here before the strike — otherwise the unit hits from its old cell and the next
            // snapshot snaps it to where it actually moved.
            if (action.type === "melee_attack" && action.attackFrom) {
                await this.replayMeleeApproach(attacker, action.attackFrom, action.path);
            }
            // Fire Breath is a WIND-UP effect: erupt it DURING the swing (before the one-shot) so it
            // doesn't trail the strike by a beat (the "delayed fire" bug). Melee-only, so gate here on
            // the melee branch; the helper itself gates on the ability + a landed hit.
            if (attackEvent.attackType === "melee") {
                this.spawnFireBreathVfx(attacker, target, attackEvent.damage);
            }
            await this.playDirectionalAttackOneShot(attacker, target, 360, true);
        }

        if (attackEvent.damage.missed) {
            // Match the engine's own miss wording (sandbox replays; ranked suppresses updateLog and
            // rebuilds its log from the authoritative journal instead).
            this.sc_sceneLog.updateLog(
                `${attacker.getName()} misses ${attackEvent.attackType === "range" ? "🏹" : "⚔️"} on ${target.getName()}`,
            );
        } else {
            this.sc_sceneLog.updateLog(`${attacker.getName()} attk ${target.getName()} (${attackEvent.damage.amount})`);
        }
        // Chain Lightning arcs AT IMPACT, together with the (AOE) damage numbers — not 360ms earlier
        // during the swing, where it flashed and faded before the damage showed ("no lightning" + "delayed").
        this.spawnChainLightningVfx(attacker, target, attackEvent.damage);
        // Fire damage burns AT IMPACT too (Fire Shield reflect / dragon-breath burn / Fireforged Sword).
        this.spawnFireDamageVfx(attacker, target, attackEvent.damage);
        // In authoritative replays the live unit may already contain the post-action state, while its
        // sprite is deliberately kept until this impact. Resolve lethal victims from the replay events
        // before applying hit reactions so a killed cap plays only its death animation.
        const teardownEventUnitIds = new Set(
            record.events
                .filter((event) => event.type === "unit_destroyed" || event.type === "unit_deleted")
                .map((event) => event.unitId),
        );
        const destroyedUnitIds = new Set(attackEvent.unitIdsDied.filter((unitId) => teardownEventUnitIds.has(unitId)));
        this.showReplayAttackDamage(attacker, target, attackEvent, record);
        this.popDullingDefenseApplications(record.events, attacker.getId());
        this.spawnAbilityStealVfx(record.events, attacker.getId());
        // Shatter Armor: red wound gashes across the target, at impact (with the damage number).
        this.spawnShatterArmorSlashVfx(attacker, target, attackEvent.damage);
        this.applyReplayAttackRecoil(attacker, attackEvent, destroyedUnitIds);
        // Melee strikes don't emit a per-target recoil animation (only ranged hits do, via the
        // animations array), so knock the defender back here to give the struck side a visible hit
        // reaction regardless of attacker/target. A fully-dodged strike never connected — the dodge
        // animation (showAttackMissedVfx) is the reaction, so no knockback on top of it.
        if (attackEvent.attackType !== "range" && !attackEvent.damage.missed && !destroyedUnitIds.has(target.getId())) {
            this.applyReplayHitKnockback(target, attacker);
            // Double Punch / Crafted Double Punch land a SECOND melee strike inside the SAME action, so
            // the engine records two damage.hits[] entries and showReplayAttackDamage staggers a number
            // for each. The single swing above covered only the first, so the second punch drew its
            // number with no strike behind it — visible to BOTH sides in ranked, where even your own
            // melee is deferred to this authoritative replay (shouldDeferActionToAuthoritativeReplay).
            // Lunge once per extra hit on the same ATTACK_HIT_STAGGER_MS cadence as the numbers, which
            // is exactly what the live path does (executeAttackSequence's per-hit applyRecoil loop).
            // The ranged counterpart already exists as the double-shot second projectile above.
            const landedHits = attackEvent.damage.hits?.length ?? 0;
            for (let hitIndex = 1; hitIndex < landedHits; hitIndex++) {
                setTimeout(() => this.applyReplayLunge(attacker, target), hitIndex * ATTACK_HIT_STAGGER_MS);
            }
        }
        // Pikeman Skewer Strike: light streak through the pierced units + a wind-up thrust on the
        // attacker. Applied AFTER applyReplayAttackRecoil so the wind-up lunge overrides the plain recoil.
        this.spawnSkewerWindSpearVfx(attacker, target, attackEvent.damage);
        // Death teardown belongs on the impact that killed the stack. Previously every replay waited
        // through the 300ms damage-number hold before applying unit_destroyed, so even an ordinary
        // single-hit melee/projectile kill visibly lingered after contact. Multi-hit attacks still wait
        // until their final 240ms-staggered impact; the 300ms readability hold starts after that.
        const replayRetaliationDamage = this.getReplayRetaliationDamage(attacker, target, attackEvent, record);
        const attackerDiesFromRetaliation =
            destroyedUnitIds.has(attacker.getId()) && replayRetaliationDamage !== undefined;
        if (destroyedUnitIds.size > 0) {
            // Attribute only actual teardown events. unitIdsDied can also contain a stack that resurrected,
            // which must keep its live visual for the resurrection sequence.
            this.noteDeathBlowsFromAttackEvent({
                ...attackEvent,
                unitIdsDied: [...destroyedUnitIds],
            });
        }

        const finalPrimaryImpactDelayMs = getAttackFinalImpactDelayMs(attackEvent.damage.hits?.length ?? 0);
        if (finalPrimaryImpactDelayMs > 0) {
            await this.delayReplay(finalPrimaryImpactDelayMs);
        }
        this.destroyReplayAttackUnitsAtImpact(
            [...destroyedUnitIds].filter((unitId) => unitId !== attacker.getId() || !attackerDiesFromRetaliation),
        );
        await this.delayReplay(Sandbox.REPLAY_ATTACK_DAMAGE_BASE_HOLD_MS);
        // Replay the defender's counterattack so both combatants animate during an exchange — not
        // just the initiating attacker. Gives ranked (and sandbox) replays the full game experience.
        await this.playReplayRetaliation(attacker, target, attackEvent, record, () => {
            if (attackerDiesFromRetaliation) {
                this.destroyReplayAttackUnitsAtImpact([attacker.getId()]);
            }
        });
        // The attack event's kill attribution was consumed by the impact-time death VFX above. Do not
        // record it again here: the later unit_destroyed pass intentionally becomes an idempotent logical
        // cleanup, and re-noting would leave a stale blow that could color a resurrected unit's next death.
        const replayEvents =
            destroyedUnitIds.size > 0 ? record.events.filter((event) => event !== attackEvent) : record.events;
        this.applyReplayEvents(replayEvents, record.stateAfter);
        // The pre-action HP snapshot has now served this exchange; drop it so a later replay falls back
        // to live HP (it only applies to the locally-applied action that captured it).
        this.preDeferredActionUnitHp = undefined;
        this.sc_moveBlocked = false;
        await this.delayReplay(Sandbox.REPLAY_ATTACK_AFTER_APPLY_HOLD_MS);
        return true;
    }
    private resolveRangeProjectilePlaybackTarget(
        impact: IRangeProjectileImpact,
        requestedTarget: Unit,
        capturedVisualCenter?: HoCMath.XY,
    ): { target: RenderableUnit; position?: HoCMath.XY } {
        const impactUnit = this.unitsHolder.getAllUnits().get(impact.targetUnitId) as RenderableUnit | undefined;
        const preActionVisualCenter =
            capturedVisualCenter ?? this.preDeferredActionUnitHp?.get(impact.targetUnitId)?.visualCenter;
        return {
            target: impactUnit ?? (requestedTarget as RenderableUnit),
            position: resolveRangeProjectilePlaybackPosition(impact, !!impactUnit, preActionVisualCenter),
        };
    }
    private async playReplayProjectile(
        attacker: RenderableUnit,
        target: RenderableUnit,
        toPosition?: HoCMath.XY,
    ): Promise<void> {
        const gs = this.sc_sceneSettings.getGridSettings();
        // Prefer the authoritative aimed edge (the engine records it as the animation toPosition) so
        // the replayed projectile lands where the shot was aimed, not on the target's center.
        const targetPosition = toPosition ?? target.getVisualCenter(gs);
        const muzzle = attacker.getRangedProjectileOrigin(targetPosition, gs);
        const bigProjectile = BIG_PROJECTILE_UNITS.has(attacker.getName().toLowerCase());
        // Ranked replays the shot from the authoritative record, so the chakram must be thrown here too —
        // otherwise Zena's disc only spins for the acting player and everyone else sees a plain bolt.
        await this.rangedProjectiles.fire({
            from: muzzle,
            to: targetPosition,
            big: bigProjectile,
            chakram: attacker.hasAbilityActive("Chakram"),
            orcAxe: attacker.getName().trim().toLowerCase() === "orc",
            arbalesterBolt: attacker.getName().trim().toLowerCase() === "arbalester",
            centaurSpear: attacker.getName().trim().toLowerCase() === "centaur",
            dryadDart: attacker.getName().trim().toLowerCase() === "dryad",
            beholderEye: attacker.getName().trim().toLowerCase() === "beholder",
            elfArrow: attacker.getName().trim().toLowerCase() === "elf",
            medusaSerpent: attacker.getName().trim().toLowerCase() === "medusa",
            cyclopsRock: attacker.getName().trim().toLowerCase() === "cyclops",
            monkOrb: attacker.getName().trim().toLowerCase() === "monk",
            tsarCannonball: attacker.getName().trim().toLowerCase() === "tsar cannon",
            gargantuanRock: attacker.getName().trim().toLowerCase() === "gargantuan",
        });
    }
    /**
     * Walk the attacker to its attack-from cell before a melee strike. The authoritative engine
     * applies the move as part of the melee action (no separate unit_moved event), so we synthesize
     * one from the action's attackFrom + path and reuse the recorded-move animation (which also syncs
     * grid occupancy). No-op when the attacker is already standing on the attack-from cell.
     */
    private async replayMeleeApproach(
        attacker: RenderableUnit,
        attackFrom: HoCMath.XY,
        path?: HoCMath.XY[],
    ): Promise<void> {
        const gs = this.sc_sceneSettings.getGridSettings();
        // A multi-cell attacker's anchor cell is NOT its visual center — the center is the middle of the
        // whole footprint, which extends down-left from the anchor. Using the single-cell center
        // (getPositionForCell) left large attackers standing "in between cells" after a move+melee.
        // Derive the real footprint (matching the server's aiFootprintForCell) and move to its center,
        // passing those cells as targetCells so grid occupancy lands on them too.
        let toPos = GridMath.getPositionForCell(attackFrom, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        let targetCells: HoCMath.XY[] = [];
        if (!attacker.isSmallSize()) {
            targetCells = attacker.getFootprintCellsForAnchor(attackFrom);
            toPos = this.footprintCenterForAnchor(attacker, attackFrom);
        }
        // Anchor the walk to the recorded route's first cell (the attacker's pre-move position) rather
        // than its CURRENT position. A board resync can snap the attacker onto attackFrom before this
        // replay runs; reading getPosition() then would make fromPos == toPos and skip the walk — the
        // unit appears to teleport into the strike. path[0] is immune to that. Footprint-correct the
        // large-unit start the same way as the destination so the walk's first point matches the route.
        let fromPos = attacker.getPosition();
        if (path && path.length >= 2) {
            fromPos = attacker.isSmallSize()
                ? GridMath.getPositionForCell(path[0], gs.getMinX(), gs.getStep(), gs.getHalfStep())
                : this.footprintCenterForAnchor(attacker, path[0]);
        }
        if (Math.abs(fromPos.x - toPos.x) < 0.1 && Math.abs(fromPos.y - toPos.y) < 0.1) {
            return; // Already at the attack-from cell — stationary melee, nothing to walk.
        }
        const meleeMove: Extract<GameEvent, { type: "unit_moved" }> = {
            type: "unit_moved",
            unitId: attacker.getId(),
            from: { x: fromPos.x, y: fromPos.y },
            to: toPos,
            // Small units: empty targetCells lets occupancy come from the unit's single dest cell.
            // Large units: the explicit 2x2 footprint above keeps occupancy aligned to the real cells.
            path: path ?? [],
            targetCells,
        };
        // This walk feeds straight into a melee strike → Rapid Charge dash (if the attacker has it).
        await this.playRecordedMoveAnimation(attacker, meleeMove, true);
    }
    protected shouldPlayReplayDoubleShotProjectile(): boolean {
        return true;
    }
    private playReplayOneShot(unit: RenderableUnit, stateName: string, timeoutMs: number): Promise<void> {
        return new Promise((resolve) => {
            let done = false;
            const finish = (): void => {
                if (done) {
                    return;
                }
                done = true;
                clearTimeout(timeout);
                resolve();
            };
            const timeout = setTimeout(finish, timeoutMs);
            unit.playOneShotAnimation(stateName, finish);
        });
    }
    private prepareDirectionalAttackState(attacker: RenderableUnit, target: Unit, melee: boolean): string {
        const attackerCells = attacker.getCells();
        const targetCells = target.getCells();
        if (!preservesFacingForPureVerticalSingleCellAttack(attackerCells, targetCells)) {
            attacker.faceBoardTarget(target.getPosition());
        }
        return attacker.getAttackAnimationStateForTarget(target.getPosition(), melee ? "melee" : "range", targetCells);
    }
    private playDirectionalAttackOneShot(
        attacker: RenderableUnit,
        target: Unit,
        timeoutMs: number,
        melee = false,
    ): Promise<void> {
        return this.playReplayOneShot(attacker, this.prepareDirectionalAttackState(attacker, target, melee), timeoutMs);
    }
    /**
     * Floating-number colour for a secondary-damage source, matching the live sandbox styling:
     * Petrifying Gaze grey, Chain Lightning purple, Fire Shield amber, everything else plain red.
     */
    protected getSecondaryDamageStyle(source: string): { fill: string; stroke: string } {
        switch (source) {
            case "petrifying_gaze":
                return { fill: "#d8d8d8", stroke: "#5a5a5a" };
            case "chain_lightning":
                return { fill: "#b86bff", stroke: "#3b0a5c" };
            case "fire_shield":
                return { fill: "#ffb13c", stroke: "#7a3800" };
            case "flesh_shield":
                return { fill: "#cdd34a", stroke: "#4a4a00" };
            default:
                return { fill: "#ff3333", stroke: "#4a0000" };
        }
    }
    /**
     * Collapse Flesh Shield metadata to one display value per aura owner. The engine normally emits one
     * already-aggregated entry, but grouping here keeps old/replayed journals and multi-hit attacks from
     * producing several overlapping ABSORBED pops for the same Abomination.
     */
    /**
     * Devour Essence (Hydra) heals riding the attack's secondary payload: a green "+N" pop + a green
     * buff-wash on the devourer. A HEAL, so it must never enter the generic secondary loops that draw
     * red "-N" hits — every caller filters the source out of those. Shared by the live sandbox,
     * replay, and ranked event paths so all three read identically.
     */
    protected showDevourEssenceHeals(secondary?: IVisibleDamage["secondary"]): void {
        for (const entry of secondary ?? []) {
            if (entry.source !== "devour_essence" || entry.amount <= 0) {
                continue;
            }
            const unit = this.unitsHolder.getAllUnits().get(entry.unitId) as RenderableUnit | undefined;
            const gs = this.sc_sceneSettings.getGridSettings();
            const pos = unit?.getVisualCenter(gs) ?? projectBattlefieldPoint(entry.position, gs);
            this.combatVisuals?.showHealPop(pos, entry.amount);
            unit?.flashBuffApplied();
        }
    }
    protected aggregateFleshShieldDamage(
        secondary?: IVisibleDamage["secondary"],
    ): Map<string, { unitId: string; position: HoCMath.XY; amount: number; unitsDied: number }> {
        const aggregated = new Map<
            string,
            { unitId: string; position: HoCMath.XY; amount: number; unitsDied: number }
        >();
        for (const entry of secondary ?? []) {
            if (entry.source !== "flesh_shield") {
                continue;
            }
            const existing = aggregated.get(entry.unitId);
            if (existing) {
                existing.amount += entry.amount;
                existing.unitsDied += entry.unitsDied;
            } else {
                aggregated.set(entry.unitId, {
                    unitId: entry.unitId,
                    position: { ...entry.position },
                    amount: entry.amount,
                    unitsDied: entry.unitsDied,
                });
            }
        }
        return aggregated;
    }
    /** Render one yellow, two-line Flesh Shield value per aura owner and return the same totals for diff accounting. */
    protected showFleshShieldAbsorbedDamage(
        secondary?: IVisibleDamage["secondary"],
        attackerCenter?: HoCMath.XY,
        delayMs = 0,
    ): Map<string, { unitId: string; position: HoCMath.XY; amount: number; unitsDied: number }> {
        const aggregated = this.aggregateFleshShieldDamage(secondary);
        const gs = this.sc_sceneSettings.getGridSettings();
        for (const entry of aggregated.values()) {
            if (entry.amount <= 0 && entry.unitsDied <= 0) {
                continue;
            }
            const unit = this.unitsHolder.getAllUnits().get(entry.unitId) as RenderableUnit | undefined;
            const pos = unit?.getVisualCenter(gs) ?? projectBattlefieldPoint(entry.position, gs);
            const direction = attackerCenter ? { x: pos.x - attackerCenter.x, y: pos.y - attackerCenter.y } : undefined;
            const show = (): void => {
                this.combatVisuals.showFloatingAbsorbed(pos, entry.amount, direction, entry.unitsDied);
            };
            if (delayMs > 0) {
                setTimeout(show, delayMs);
            } else {
                show();
            }
        }
        return aggregated;
    }
    /**
     * Yellow ABSORBED pop over a Water Shield owner whose shield ate the whole hit (source
     * "water_shield") — shared by the live paths, the spell path and the ranked replay per the ABILITY
     * VFX CONTRACT. The red-number loops all EXCLUDE this source: the owner took nothing.
     */
    protected showWaterShieldAbsorbs(
        secondary?: IVisibleDamage["secondary"],
        attackerCenter?: HoCMath.XY,
        delayMs = 0,
    ): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        for (const entry of secondary ?? []) {
            if (entry.source !== "water_shield" || entry.amount <= 0) {
                continue;
            }
            const unit = this.unitsHolder.getAllUnits().get(entry.unitId) as RenderableUnit | undefined;
            const pos = unit?.getVisualCenter(gs) ?? projectBattlefieldPoint(entry.position, gs);
            const direction = attackerCenter ? { x: pos.x - attackerCenter.x, y: pos.y - attackerCenter.y } : undefined;
            const show = (): void => {
                this.combatVisuals.showFloatingAbsorbed(pos, entry.amount, direction);
            };
            if (delayMs > 0) {
                setTimeout(show, delayMs);
            } else {
                show();
            }
        }
    }
    /**
     * Render an AOE attack's per-unit floating damage from `damage.splash` — one number on EVERY splashed
     * unit at its own position. A Double-Shot AOE (Gargantuan Area Throw) lands TWO entries per unit (one
     * per shot); the repeated entry is staggered so the two numbers don't draw on top of each other.
     * Shared by the live paths (targeted range + area throw) and the ranked replay so all of them show
     * every shot's damage. Returns true if it rendered anything.
     */
    /**
     * Boulder impact for an AOE throw, centred on where the blast actually landed and sized to how far it
     * reached — both derived from the splash entries themselves, which is the one description of the blast
     * that BOTH scenes have. Shared so ranked renders it identically without re-deriving the geometry.
     *
     * A miss-only volley (every entry flagged `missed`) still gets the impact: the boulder came down, it
     * simply hurt nobody.
     */
    protected renderAreaImpactVfx(splash: NonNullable<IVisibleDamage["splash"]>): void {
        if (!splash.length || !this.combatVisuals) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const points = splash.map((entry) => {
            const unit = this.unitsHolder.getAllUnits().get(entry.unitId) as RenderableUnit | undefined;
            return unit?.getVisualCenter(gs) ?? projectBattlefieldPoint(entry.position, gs);
        });
        const center = {
            x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
            y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        };
        // Reach = the furthest unit the blast touched, floored at one cell so a single-target hit still reads
        // as an impact rather than a dot.
        const reach = points.reduce(
            (max, point) => Math.max(max, Math.hypot(point.x - center.x, point.y - center.y)),
            0,
        );
        this.combatVisuals.spawnAreaImpact(center, gs.getCellSize(), Math.max(gs.getCellSize(), reach * 1.25));
    }
    protected showSplashDamage(splash: IVisibleDamage["splash"], attackerCenter: HoCMath.XY): boolean {
        if (!splash?.length) {
            return false;
        }
        // The impact lands once for the whole volley, before the per-unit numbers fly out of it.
        this.renderAreaImpactVfx(splash);
        const gs = this.sc_sceneSettings.getGridSettings();
        const shotsShownPerUnit = new Map<string, number>();
        let rendered = false;
        for (const entry of splash) {
            if (entry.amount <= 0) {
                continue;
            }
            const splashUnit = this.unitsHolder.getAllUnits().get(entry.unitId) as RenderableUnit | undefined;
            const center = splashUnit ? splashUnit.getVisualCenter(gs) : projectBattlefieldPoint(entry.position, gs);
            const dir = { x: center.x - attackerCenter.x, y: center.y - attackerCenter.y };
            const pos = splashUnit ? this.offsetReplayDamagePosition(center, splashUnit, dir) : center;
            const flagAnchor = splashUnit?.getDamagePredictionAnchor(gs);
            const shotIndex = shotsShownPerUnit.get(entry.unitId) ?? 0;
            shotsShownPerUnit.set(entry.unitId, shotIndex + 1);
            if (shotIndex === 0) {
                this.combatVisuals.showFloatingDamage(
                    pos,
                    entry.amount,
                    dir,
                    entry.unitsDied,
                    undefined,
                    undefined,
                    flagAnchor,
                );
            } else {
                setTimeout(
                    () =>
                        this.combatVisuals.showFloatingDamage(
                            pos,
                            entry.amount,
                            dir,
                            entry.unitsDied,
                            undefined,
                            undefined,
                            flagAnchor,
                        ),
                    shotIndex * 220,
                );
            }
            rendered = true;
        }
        return rendered;
    }
    private showReplayAttackDamage(
        attacker: RenderableUnit,
        target: RenderableUnit,
        attackEvent: Extract<GameEvent, { type: "unit_attacked" }>,
        record: SandboxReplay["actions"][number],
    ): void {
        const damage = attackEvent.damage;
        const gs = this.sc_sceneSettings.getGridSettings();
        const attackerCenter = attacker.getVisualCenter(gs);

        // Secondary damage from abilities that trigger DURING the exchange — Fire Shield reflect,
        // Chain Lightning bounces, Petrifying Gaze kills, Magic Mirror — each gets its own floating
        // number on the affected unit (impact-time position fallback so dead units still show).
        // Staggered so they don't stack on the primary hit. Additive: shown alongside the
        // splash/primary numbers below, not instead of them. Styled per source (and Petrifying Gaze
        // yanks the struck unit) so the ranked replay matches the live sandbox effect — otherwise the
        // gaze read as a plain red number with no reaction on the side that took it.
        // Flesh Shield is deliberately rendered as ONE aggregated, labelled value on the aura owner.
        // Keep it out of the generic secondary loop below or it would also draw as an ordinary `-X` hit.
        this.showFleshShieldAbsorbedDamage(damage.secondary, attackerCenter, 220);
        this.showWaterShieldAbsorbs(damage.secondary, attackerCenter, 220);
        // Devour Essence is a HEAL riding the same payload — green "+N" on the devourer, kept out of
        // the red-number loop below.
        this.showDevourEssenceHeals(damage.secondary);
        (damage.secondary ?? [])
            .filter(
                (entry) =>
                    entry.source !== "flesh_shield" &&
                    entry.source !== "devour_essence" &&
                    // A Water Shield absorb is not damage taken — it gets the ABSORBED pop below, never
                    // a red number.
                    entry.source !== "water_shield",
            )
            .forEach((entry, index) => {
                if (entry.amount <= 0 && entry.unitsDied <= 0) return;
                const sUnit = this.unitsHolder.getAllUnits().get(entry.unitId) as RenderableUnit | undefined;
                const sCenter = sUnit ? sUnit.getVisualCenter(gs) : projectBattlefieldPoint(entry.position, gs);
                const sDir = { x: sCenter.x - attackerCenter.x, y: sCenter.y - attackerCenter.y };
                const sPos = sUnit ? this.offsetReplayDamagePosition(sCenter, sUnit, sDir) : sCenter;
                const flagAnchor = sUnit?.getDamagePredictionAnchor(gs);
                const style = this.getSecondaryDamageStyle(entry.source);
                setTimeout(
                    () => {
                        if (entry.source === "petrifying_gaze" && sUnit) {
                            // "Yank" the petrified unit away from the attacker, then it springs back —
                            // the same reaction the live sandbox path gives a gaze kill.
                            const len = Math.hypot(sDir.x, sDir.y);
                            if (len > 0.001) {
                                const mag = gs.getCellSize() * 0.35;
                                sUnit.applyRecoil((sDir.x / len) * mag, (sDir.y / len) * mag);
                            }
                        }
                        this.combatVisuals.showFloatingDamage(
                            sPos,
                            entry.amount,
                            sDir,
                            entry.unitsDied,
                            style.fill,
                            style.stroke,
                            flagAnchor,
                        );
                    },
                    220 + index * 180,
                );
            });

        // Deep Wounds: rake an orange claw slash across the wounded unit for EVERY application recorded
        // during this attack (a double-punch wounder produces two entries -> two claws). Driven off the
        // authoritative damage.deepWounds so it fires per-application (not once via the effect diff) and
        // matches between the live sandbox and the ranked replay.
        this.spawnDeepWoundsClaws(damage.deepWounds);

        // ABILITY Chakram (Zena) — the ricochet arcs, replayed from the authoritative payload so every
        // viewer watches the disc curve between victims, not just the player who threw it. `target` seeds the
        // homecoming loop for a throw that found no ricochet victim at all.
        void this.playChakramArcs(attacker, damage, target);

        // IMPACT. Release any buff/debuff pop this strike applied — the diff ran when the snapshot
        // arrived (before the projectile/approach finished), so the icons wait here to land with the
        // damage numbers rather than ahead of the blow.
        this.flushEffectPops();

        // AOE attacks (Cyclops' Large Caliber, Gargantuan's Area Throw) carry a per-affected-unit
        // breakdown. Draw a floating number on EVERY splashed unit at its own position — including
        // our own units caught in the blast — rather than a single number on the primary target.
        // Each entry keeps the impact-time position so units that died (and were removed) still show.
        if (damage.splash?.length) {
            // Chakram bounce victims are landed one-by-one by playChakramArcs AS the disc reaches each, so keep
            // them out of the all-at-once splash (else they double-draw and pop before the disc arrives). The
            // primary target isn't a bounce, so its number still lands here with the shot.
            const chakramVictims = this.chakramBounceVictimIds(damage);
            const nonChakramSplash = chakramVictims.size
                ? damage.splash.filter((entry) => !chakramVictims.has(entry.unitId))
                : damage.splash;
            this.showSplashDamage(nonChakramSplash, attackerCenter);
            return;
        }

        const damageUnitId = damage.unitId ?? attackEvent.targetId;
        const victim = (this.unitsHolder.getAllUnits().get(damageUnitId) as RenderableUnit | undefined) ?? target;
        const victimCenter = victim.getVisualCenter(gs);
        const flagAnchor = victim.getDamagePredictionAnchor(gs);
        const direction = { x: victimCenter.x - attackerCenter.x, y: victimCenter.y - attackerCenter.y };
        // Intercepted shot: keep the number on the screen, not on the unit standing behind it.
        const spawnPos = this.offsetReplayDamagePosition(
            damage.unitPosition ? projectBattlefieldPoint(damage.unitPosition, gs) : victimCenter,
            victim,
            direction,
            damageUnitId === attackEvent.targetId,
        );
        const hits = damage.hits ?? [];

        // Fully-missed attack: "MISS" + bullet-time dodge instead of a damage number. Placed after the
        // secondary/deepWounds rendering above (a missed primary can still land Skewer/Lightning-Spin
        // side damage) and before the HP-diff fallback, which must not run for a dodge.
        this.spawnLuckyStrikeVfx(damage);
        if (damage.missed) {
            this.showAttackMissedVfx(attacker, target, damage);
            return;
        }

        if (!damage.render || (damage.amount <= 0 && !hits.length)) {
            // Secondary entries above already rendered their own numbers (including the yellow Flesh
            // Shield total). The snapshot diff includes those same HP losses, so remove them before
            // using the diff as a last-resort primary value. This is essential for Lightning Spin,
            // whose clicked victim is represented only in `secondary`, and prevents a second red copy.
            const secondaryAlreadyShown = (damage.secondary ?? [])
                .filter((entry) => entry.unitId === damageUnitId)
                .reduce(
                    (total, entry) => ({
                        amount: total.amount + entry.amount,
                        unitsDied: total.unitsDied + entry.unitsDied,
                    }),
                    { amount: 0, unitsDied: 0 },
                );
            const totalFallbackDamage = this.getReplayUnitDamage(record, damageUnitId);
            const fallbackDamage = {
                amount: Math.max(0, totalFallbackDamage.amount - secondaryAlreadyShown.amount),
                unitsDied: Math.max(0, totalFallbackDamage.unitsDied - secondaryAlreadyShown.unitsDied),
            };
            if (fallbackDamage.amount <= 0) {
                return;
            }
            this.combatVisuals.showFloatingDamage(
                spawnPos,
                fallbackDamage.amount,
                direction,
                fallbackDamage.unitsDied,
                undefined,
                undefined,
                flagAnchor,
            );
            return;
        }

        if (hits.length) {
            hits.forEach((hit, index) => {
                if (hit.amount <= 0) {
                    return;
                }
                const pos = { ...spawnPos };
                setTimeout(() => {
                    this.combatVisuals.showFloatingDamage(
                        pos,
                        hit.amount,
                        direction,
                        hit.unitsDied,
                        undefined,
                        undefined,
                        flagAnchor,
                    );
                }, index * ATTACK_HIT_STAGGER_MS);
            });
            return;
        }

        this.combatVisuals.showFloatingDamage(
            spawnPos,
            damage.amount,
            direction,
            this.getReplayUnitLoss(record, damageUnitId),
            undefined,
            undefined,
            flagAnchor,
        );
    }
    /**
     * Nudge a damage number clear of the sprite it belongs to. `outward` = away from the attacker, which
     * is what a normal hit wants. Pass false for an INTERCEPTED shot: attacker, screen and aimed unit are
     * collinear with the aimed unit BEHIND the screen, so pushing away from the attacker walks the number
     * onto the unit behind and the screen's damage reads as the aimed target's. Inward keeps it clear of
     * the sprite while staying unambiguously on the unit that took the hit.
     */
    private offsetReplayDamagePosition(
        position: HoCMath.XY,
        unit: RenderableUnit,
        direction: HoCMath.XY,
        outward = true,
    ): HoCMath.XY {
        const gs = this.sc_sceneSettings.getGridSettings();
        const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
        const sign = outward ? 1 : -1;
        const spawnPos = { x: position.x, y: position.y };
        if (len <= 0.001) {
            spawnPos.y += gs.getCellSize();
            return spawnPos;
        }

        const radius = unit.isSmallSize() ? gs.getCellSize() * 0.5 : gs.getCellSize();
        const margin = gs.getCellSize() * 0.5;
        spawnPos.x += (direction.x / len) * (radius + margin) * sign;
        spawnPos.y += (direction.y / len) * (radius + margin) * sign;
        return spawnPos;
    }
    private getReplayUnitLoss(record: SandboxReplay["actions"][number], unitId: string): number {
        return this.getReplayUnitDamage(record, unitId).unitsDied;
    }
    private getReplayUnitDamage(
        record: SandboxReplay["actions"][number],
        unitId: string,
    ): { amount: number; unitsDied: number } {
        const before = this.unitsHolder.getAllUnits().get(unitId);
        // Prefer the pre-action HP snapshot captured at deferred-submit time: by the time this replays,
        // the local apply has already mutated the live unit to its post-action HP, which would make the
        // diff read 0 (dropping the attacker's counter-attack). Falls back to the live unit otherwise.
        const captured = this.preDeferredActionUnitHp?.get(unitId);
        if (!before && !captured) {
            return { amount: 0, unitsDied: 0 };
        }
        const after = record.stateAfter.units.find((unitState) => unitState.properties.id === unitId);
        const beforeAmount = captured?.amount ?? before?.getAmountAlive() ?? 0;
        const beforeTotalHp = captured?.cumulativeHp ?? before?.getCumulativeHp() ?? 0;
        const afterAmount = Math.max(0, Math.floor(after?.properties.amount_alive ?? 0));
        const maxHp = Math.max(1, after?.properties.max_hp ?? captured?.maxHp ?? before?.getMaxHp() ?? 1);
        const afterHp = afterAmount > 0 ? Math.max(0, after?.properties.hp ?? maxHp) : 0;
        const afterTotalHp = afterAmount > 0 ? (afterAmount - 1) * maxHp + afterHp : 0;
        return {
            amount: Math.max(0, beforeTotalHp - afterTotalHp),
            unitsDied: Math.max(0, beforeAmount - afterAmount),
        };
    }
    private applyReplayAttackRecoil(
        attacker: RenderableUnit,
        attackEvent: Extract<GameEvent, { type: "unit_attacked" }>,
        skipUnitIds: ReadonlySet<string> = new Set<string>(),
    ): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const attackerCenter = attacker.getVisualCenter(gs);
        for (const animation of attackEvent.animations) {
            const unitId = animation.affectedUnitId ?? animation.bodyUnitId;
            const unit = unitId
                ? (this.unitsHolder.getAllUnits().get(unitId) as RenderableUnit | undefined)
                : undefined;
            if (!unit || unit.isDead() || skipUnitIds.has(unit.getId())) {
                continue;
            }
            const from = animation.fromPosition ?? attackerCenter;
            const to = animation.toPosition;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0.001) {
                const magnitude = gs.getCellSize() * 0.28;
                unit.applyHitReaction((dx / len) * magnitude, (dy / len) * magnitude);
            }
        }
    }
    /** Push a surviving unit away from an impact origin and let RenderableUnit spring it back. */
    private applyHitReactionFromPoint(unit: Unit | undefined, source: HoCMath.XY, magnitudeScale = 0.22): void {
        if (!(unit instanceof RenderableUnit) || unit.isDead()) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const center = unit.getVisualCenter(gs);
        const dx = center.x - source.x;
        const dy = center.y - source.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len <= 0.001) {
            return;
        }
        const magnitude = gs.getCellSize() * magnitudeScale;
        unit.applyHitReaction((dx / len) * magnitude, (dy / len) * magnitude);
    }
    /** Knock `unit` back along the vector pointing away from `source` — a brief defensive hit reaction. */
    private applyReplayHitKnockback(unit: RenderableUnit, source: RenderableUnit): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const sourceCenter = source.getVisualCenter(gs);
        this.applyHitReactionFromPoint(unit, sourceCenter, 0.28);
    }
    /** Lunge `unit` toward `target` — a brief forward strike (applyRecoil's out-and-back envelope). */
    private applyReplayLunge(unit: RenderableUnit, target: RenderableUnit): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const unitCenter = unit.getVisualCenter(gs);
        const targetCenter = target.getVisualCenter(gs);
        const dx = targetCenter.x - unitCenter.x;
        const dy = targetCenter.y - unitCenter.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len <= 0.001) {
            return;
        }
        const magnitude = gs.getCellSize() * 0.22;
        unit.applyRecoil((dx / len) * magnitude, (dy / len) * magnitude);
    }
    /** Keep an authored death sequence alive after the logical stack has left UnitsHolder. */
    protected playCustomDeathAnimation(unit: RenderableUnit): boolean {
        if (!unit.hasAnimationState("death")) {
            return false;
        }
        this.dyingVisualUnits.add(unit);
        if (!unit.isPlayingOneShotAnimation("death")) {
            unit.playOneShotAnimation("death", () => {
                this.dyingVisualUnits.delete(unit);
                unit.destroyVisuals();
            });
        }
        return true;
    }
    /** Tear down only the renderable side of replay deaths; the recorded event still applies logical cleanup. */
    private destroyReplayAttackUnitsAtImpact(unitIds: readonly string[]): void {
        if (!unitIds.length) {
            return;
        }
        const unitSnapshot = this.snapshotRenderableUnits();
        for (const unitId of unitIds) {
            const unit = unitSnapshot.get(unitId);
            if (!unit) {
                continue;
            }
            if (this.playCustomDeathAnimation(unit)) {
                continue;
            }
            const shatterInfo = unit.getShatterInfo();
            if (shatterInfo) {
                this.combatVisuals?.spawnDeathVfx(shatterInfo, unitId, unit.hasStatusEffect("Freeze"));
            }
            unit.destroyVisuals();
        }
    }
    private getReplayRetaliationDamage(
        attacker: RenderableUnit,
        target: RenderableUnit,
        attackEvent: Extract<GameEvent, { type: "unit_attacked" }>,
        record: SandboxReplay["actions"][number],
    ): { amount: number; unitsDied: number } | undefined {
        if (attacker.isDead() || target.isDead()) {
            return undefined;
        }
        // A ranged response always produces an authoritative animation aimed back at the attacker.
        if (
            attackEvent.attackType === "range" &&
            !attackEvent.animations.some((animation) => animation.affectedUnitId === attacker.getId())
        ) {
            return undefined;
        }
        const totalResponseDamage = this.getReplayUnitDamage(record, attacker.getId());
        // The state diff includes every HP loss suffered by the initiating attacker. Every secondary
        // entry is rendered with the primary exchange, so remove those exact chunks before deciding
        // whether a real retaliation remains.
        const secondaryOnAttacker = (attackEvent.damage.secondary ?? [])
            .filter((entry) => entry.unitId === attacker.getId())
            .reduce(
                (total, entry) => ({
                    amount: total.amount + entry.amount,
                    unitsDied: total.unitsDied + entry.unitsDied,
                }),
                { amount: 0, unitsDied: 0 },
            );
        const responseDamage = {
            amount: Math.max(0, totalResponseDamage.amount - secondaryOnAttacker.amount),
            unitsDied: Math.max(0, totalResponseDamage.unitsDied - secondaryOnAttacker.unitsDied),
        };
        return responseDamage.amount > 0 ? responseDamage : undefined;
    }
    /**
     * Replay the defender's counterattack so an exchange animates on both sides, not just the
     * initiating attacker. The engine emits the attacker's strike but conveys the response only as
     * damage, so here we play the return strike (ranged projectile or melee lunge) and its response
     * damage. Detection is purely data-driven: a positive
     * HP loss on the attacker during its own action means it was struck back.
     */
    private async playReplayRetaliation(
        attacker: RenderableUnit,
        target: RenderableUnit,
        attackEvent: Extract<GameEvent, { type: "unit_attacked" }>,
        record: SandboxReplay["actions"][number],
        onImpact?: () => void,
    ): Promise<void> {
        const spawnResponseAbilitySteal = (): void => this.spawnAbilityStealVfx(record.events, target.getId());
        const responseDamage = this.getReplayRetaliationDamage(attacker, target, attackEvent, record);
        if (!responseDamage) {
            spawnResponseAbilitySteal();
            return;
        }

        this.sc_sceneLog.updateLog(`${target.getName()} resp ${attacker.getName()} (${responseDamage.amount})`);

        await this.playDirectionalAttackOneShot(target, attacker, 360, attackEvent.attackType === "melee");

        if (attackEvent.attackType === "range") {
            // Retaliation is not cursor aiming: land the return projectile in the visual centre of the
            // attacking figure. The recorded edge is a logical combat coordinate and made counters dive
            // toward the bottom of large sprites when reused as a rendered endpoint.
            await this.playReplayProjectile(target, attacker);
        } else {
            this.applyReplayLunge(target, attacker);
            await this.delayReplay(Sandbox.REPLAY_CONTROL_HOLD_MS);
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const attackerCenter = attacker.getVisualCenter(gs);
        const targetCenter = target.getVisualCenter(gs);
        const direction = { x: attackerCenter.x - targetCenter.x, y: attackerCenter.y - targetCenter.y };
        const spawnPos = this.offsetReplayDamagePosition(attackerCenter, attacker, direction);
        this.combatVisuals.showFloatingDamage(
            spawnPos,
            responseDamage.amount,
            direction,
            responseDamage.unitsDied,
            undefined,
            undefined,
            attacker.getDamagePredictionAnchor(gs),
        );
        this.popDullingDefenseApplications(record.events, target.getId());
        spawnResponseAbilitySteal();
        onImpact?.();

        await this.delayReplay(Sandbox.REPLAY_ATTACK_DAMAGE_BASE_HOLD_MS);
    }
    private materializeReplaySummons(events: readonly GameEvent[], stateAfter: SandboxSceneState): void {
        const presentUnitIds = new Set(this.unitsHolder.getAllUnits().keys());
        for (const { event, unitState } of getMissingReplaySummons(events, stateAfter, presentUnitIds)) {
            // Build from post-action truth so the id, creature properties, stolen abilities and remaining spells
            // all match the server. Mark it summoned just like the live common-engine factory does.
            const unit = this.createRenderableUnitFromSceneState(unitState, true);
            unit.setPosition(event.position.x, event.position.y);
            this.unitsHolder.addUnit(unit);
            // Grid occupancy belongs in syncSummonedUnit, when the event is reached in journal order. Infest
            // emits unit_destroyed immediately before unit_summoned; occupying here would race that cleanup and
            // fail because the corpse still owns the cell during this pre-seeding pass.
        }
    }
    protected applyReplayEvents(events: GameEvent[], stateAfter?: SandboxSceneState): void {
        const visibleEvents = events.filter((event) => event.type !== "fight_finished");
        if (!visibleEvents.length) {
            return;
        }
        if (stateAfter) {
            this.materializeReplaySummons(visibleEvents, stateAfter);
        }
        this.applyTurnEngineEvents(visibleEvents, this.snapshotRenderableUnits());
    }
    private async playReplayObstacleAttackAction(record: SandboxReplay["actions"][number]): Promise<boolean> {
        const action = record.action;
        if (action.type !== "obstacle_attack") {
            return false;
        }
        const unit = this.unitsHolder.getAllUnits().get(action.attackerId) as RenderableUnit | undefined;
        if (!unit) {
            return false;
        }
        this.currentActiveUnit = unit;
        unit.setActiveTurn(true);

        // Walk to the melee attack-from cell first (the engine folds the approach into the obstacle
        // attack, so there's no separate move record to replay).
        if (action.attackFrom) {
            const currentPos = unit.getPosition();
            const attackFromPos = this.getObstacleAttackFromPosition(unit, action.attackFrom);
            if (
                action.path?.length &&
                (Math.abs(currentPos.x - attackFromPos.x) > 0.1 || Math.abs(currentPos.y - attackFromPos.y) > 0.1)
            ) {
                await new Promise<void>((resolve) => {
                    const started = this.executeMoveSequence(
                        unit,
                        action.path!,
                        unit.isSmallSize() ? undefined : this.getLargeUnitObstacleFootprint(unit, action.attackFrom!),
                        resolve,
                    );
                    if (!started) {
                        resolve();
                    }
                });
            }
        }

        // Replay the strike from the RECORDED events instead of re-running it through the engine.
        // Re-running is unreliable mid-replay (validateTurnAction rejects once the actor's turn has
        // handed over), which would silently drop the whole strike — the mountain damage, the
        // destroy, and any lap mechanics (lava drying) bundled into this action's events. Driving it
        // off the journal mirrors how unit attacks replay and guarantees those all show.
        const obstacleEvents = record.events.filter(
            (event): event is Extract<GameEvent, { type: "obstacle_attacked" }> => event.type === "obstacle_attacked",
        );
        const remainingEvents = record.events.filter((event) => event.type !== "obstacle_attacked");
        const strikePositions = obstacleStrikePositions(record.events, action.targetPosition);
        const scattered = this.grid.hasScatteredMountains();
        this.sc_sceneLog.updateLog(`${unit.getName()} hit mountain`);
        let appliedObstacleEvents = 0;
        await this.animateObstacleStrikeSequence(unit, strikePositions, action.attackFrom, (impactIndex) => {
            if (!scattered) {
                return;
            }
            const event = obstacleEvents[impactIndex];
            if (!event) {
                return;
            }
            this.applyReplayEvents([event]);
            appliedObstacleEvents = impactIndex + 1;
        });
        this.applyReplayEvents([...obstacleEvents.slice(appliedObstacleEvents), ...remainingEvents]);
        this.sc_moveBlocked = false;
        await this.delayReplay(Sandbox.REPLAY_ATTACK_DAMAGE_BASE_HOLD_MS);
        await this.delayReplay(Sandbox.REPLAY_ATTACK_AFTER_APPLY_HOLD_MS);
        return true;
    }
    private async playReplayAreaThrowAction(record: SandboxReplay["actions"][number]): Promise<boolean> {
        const action = record.action;
        if (action.type !== "area_throw_attack") {
            return false;
        }
        const unit = this.unitsHolder.getAllUnits().get(action.attackerId) as RenderableUnit | undefined;
        const gs = this.sc_sceneSettings.getGridSettings();
        const cellPosition = GridMath.getPositionForCell(
            action.targetCell,
            gs.getMinX(),
            gs.getStep(),
            gs.getHalfStep(),
        );
        if (!unit || !cellPosition) {
            return false;
        }
        this.currentActiveUnit = unit;
        // Hand the RECORD down, not just the action: every other replay path renders from the recorded
        // events, and the area throw was the last one still reading its own local re-run (see the note in
        // performAreaThrow on why that showed re-rolled numbers and could drop the action entirely).
        await this.performAreaThrow(unit, action.targetCell, cellPosition, record);
        return true;
    }
    private async playReplayCastSpellAction(record: SandboxReplay["actions"][number]): Promise<boolean> {
        const action = record.action;
        if (action.type !== "cast_spell") {
            return false;
        }
        const caster = this.unitsHolder.getAllUnits().get(action.casterId) as RenderableUnit | undefined;
        if (!caster) {
            return false;
        }
        this.currentActiveUnit = caster;
        const gs = this.sc_sceneSettings.getGridSettings();
        const unitSnapshot = this.snapshotRenderableUnits();
        const facingTarget = action.targetId
            ? this.unitsHolder.getAllUnits().get(action.targetId)?.getPosition()
            : action.targetCell
              ? GridMath.getPositionForCell(action.targetCell, gs.getMinX(), gs.getStep(), gs.getHalfStep())
              : undefined;
        if (facingTarget) {
            caster.faceBoardTarget(facingTarget);
        }
        if (caster.hasAnimationState("cast")) {
            await this.playReplayOneShot(caster, "cast", 720);
        }

        // Craft (ALLIES_AREA area cast): capture the pre-cast state NOW so the forge result pops can diff it
        // after the engine applies — mirroring the live castAreaSpellAtCell path so a Craft resolved through
        // the authoritative replay (the opponent's cast, and in ranked the local player's own — the live
        // path defers to replay there) still renders the forge + per-ally results. targetCell is set only for
        // the area craft cast; single-target / swap (Castling) spells use targetId and skip this.
        // Only the forge CAST animation is replayed for Craft (area cast). The per-ally RESULTS
        // (weapon/Stun/"No effect") and any rune-enchant success/"Failed" are DELIBERATELY NOT rendered from
        // the replay: it re-runs the spell with local crypto-secure RNG (createActionEngine reconciles only
        // amounts from the next snapshot, NOT the discrete roll), so an outcome-dependent pop here would be a
        // ~random wrong result. The authoritative outcome instead arrives via the snapshot — a resulting Stun
        // pops through processDebuffPops, and a crafted weapon / rune buff shows in the unit's panel. The
        // forge itself is outcome-independent, so it is safe to play. The crafted ABILITY additionally pops
        // on the board in ranked, diffed off the snapshot's ability list (RankedPlayScene.processDebuffPops
        // -> renderCastOutcomes), which is authoritative and so identical on both players' screens.
        const isCraftCast = action.spellName === "Craft";
        const craftCasterPos = { ...caster.getPosition() };
        const craftTargetPos =
            isCraftCast && action.targetCell
                ? (this.getAreaSpellVisualCenter("Craft", action.targetCell) ?? caster.getVisualCenter(gs))
                : caster.getVisualCenter(gs);

        // Castling (POSITION_CHANGE) swaps the caster with a target. Re-running the engine during
        // replay is unreliable here (validateTurnAction can reject — the turn has handed over), so apply
        // the swap from authoritative truth: take both units' post-cast cells from the record's
        // stateAfter, animate them arcing to each other's old cell, then commit positions + grid
        // occupancy. Non-swap spells fall through to the engine (best-effort), with the next snapshot
        // reconciling amounts.
        const target = action.targetId
            ? (this.unitsHolder.getAllUnits().get(action.targetId) as RenderableUnit | undefined)
            : undefined;
        const afterById = new Map(record.stateAfter.units.map((u) => [u.properties.id, u]));
        const casterAfter = afterById.get(caster.getId());
        const targetAfter = target ? afterById.get(target.getId()) : undefined;
        // baseCell is the anchor, and a multi-cell body hangs down-left of it (see hydrateSceneState), so a
        // swapped unit has to land on its footprint's centre rather than on the anchor cell's centre — the
        // difference is half a cell diagonally for a 2x2.
        const cellToPos = (cell: HoCMath.XY, unit: RenderableUnit): HoCMath.XY =>
            this.footprintCenterForAnchor(unit, cell);
        const newCasterPos = casterAfter?.baseCell ? cellToPos(casterAfter.baseCell, caster) : undefined;
        const newTargetPos = targetAfter?.baseCell && target ? cellToPos(targetAfter.baseCell, target) : undefined;
        const oldCasterPos = { ...caster.getPosition() };
        const isSwap =
            !!target &&
            !!newCasterPos &&
            !!newTargetPos &&
            (Math.abs(oldCasterPos.x - newCasterPos.x) > 0.1 || Math.abs(oldCasterPos.y - newCasterPos.y) > 0.1);

        if (isSwap && target && newCasterPos && newTargetPos && casterAfter && targetAfter) {
            const oldTargetPos = { ...target.getPosition() };
            this.sc_moveBlocked = true;
            const worldRoot = this.drawer.getUnitsContainer();
            await new Promise<void>((resolve) => {
                this.moveAnimManager.startSwapAnimation(
                    caster,
                    oldCasterPos,
                    newCasterPos,
                    target,
                    oldTargetPos,
                    newTargetPos,
                    () => {
                        caster.setPosition(newCasterPos.x, newCasterPos.y);
                        target.setPosition(newTargetPos.x, newTargetPos.y);
                        // Re-point grid occupancy at the swapped cells (clean both first so neither
                        // cleanup wipes the other's freshly-occupied cells).
                        this.grid.cleanupAll(caster.getId(), caster.getAttackRange(), caster.isSmallSize());
                        this.grid.cleanupAll(target.getId(), target.getAttackRange(), target.isSmallSize());
                        // Replayed (authoritative) swap positions — always stamp; see hydrateSceneState
                        // on why deriving lava/water permission locally fails for granted abilities.
                        this.grid.occupyCells(
                            casterAfter.cells,
                            caster.getId(),
                            caster.getTeam(),
                            caster.getAttackRange(),
                            true,
                            true,
                        );
                        this.grid.occupyCells(
                            targetAfter.cells,
                            target.getId(),
                            target.getTeam(),
                            target.getAttackRange(),
                            true,
                            true,
                        );
                        this.gridMatrix = this.grid.getMatrix();
                        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
                        caster.syncVisual(worldRoot, gs);
                        target.syncVisual(worldRoot, gs);
                        this.sc_moveBlocked = false;
                        this.applyReplayEvents(record.events);
                        resolve();
                    },
                );
            });
            await this.delayReplay(Sandbox.REPLAY_SPELL_HOLD_MS);
            return true;
        }

        const authoritativeSummons = record.events.filter(
            (event): event is Extract<GameEvent, { type: "unit_summoned" }> => event.type === "unit_summoned",
        );
        if (authoritativeSummons.length) {
            // A new summon cannot be replayed through the local engine: its secure-random client UUID would
            // differ from the server UUID in this record/snapshot. Seed the authoritative body first, then let
            // the ordinary event path reveal it and run the spawn animation. This also handles merged summons
            // (the existing server-id stack is already present, so syncSummonedUnit only refreshes its visual).
            this.renderHealVfx(record.events);
            this.renderSpellDamageVfx(record.events, craftCasterPos);
            this.renderCastOutcomes(record.events);
            this.renderSnareResistVfx(record.events);
            for (const summon of authoritativeSummons) {
                this.sc_sceneLog.updateLog(`${caster.getName()} summoned ${summon.amount} x ${summon.unitName}`);
            }
            this.materializeReplaySummons(record.events, record.stateAfter);
            this.cleanupAfterSpell(record.events, this.snapshotRenderableUnits());
            await this.delayReplay(Sandbox.REPLAY_SPELL_HOLD_MS);
            return true;
        }

        // Render from the RECORD before the best-effort local re-apply. Ranked commonly rejects that
        // re-apply after the authoritative turn has already advanced, but the server-stated transfer must
        // still animate on both players' clients.
        this.spawnAbilityTransferVfx(record.events, unitSnapshot);
        const result = this.createActionEngine().apply(action);
        // Heal numbers come from the RECORD, not `result`: the local re-apply above is best-effort and in
        // ranked is routinely rejected, whereas the record is what the server actually resolved. Safe to
        // render during playback (unlike the outcome-dependent pops below) because `healed[]` is
        // authoritative rather than a local re-roll.
        this.renderHealVfx(record.events);
        // Fire Strike / Meteorite: same reasoning as the heal above — `damaged[]` on the RECORD is what the
        // server resolved, so the fire and the numbers are safe to play during replay.
        this.renderSpellDamageVfx(record.events, craftCasterPos);
        // Forge cast animation only (outcome-independent); the per-ally results come from the
        // authoritative snapshot, not this local re-roll — see the note at the capture above.
        // Spawned BEFORE the result branch and never gated on it: the record is authoritative (the server
        // already resolved this cast), while the local re-apply is best-effort and in ranked is routinely
        // rejected — the caster is marked as having acted, its Craft charge is already spent in a synced
        // snapshot (`spell_not_available`), or the turn has handed over. Gating the animation on
        // `result.completed` therefore swallowed the whole forge in ranked while it always played in sandbox.
        if (isCraftCast) {
            const forgeMs = this.combatVisuals?.spawnCraftForge(craftTargetPos, gs.getCellSize()) ?? 0;
            // The per-ally results the SERVER rolled, held until the forge finishes so they read as its
            // output. Safe from the replay precisely because they are stated on the record rather than
            // re-derived — re-running the roll locally would show each player a different craft.
            setTimeout(() => this.renderCastOutcomes(record.events), forgeMs + 80);
        } else {
            // Rune success/failure and any other stated roll; no forge to wait on.
            this.renderCastOutcomes(record.events);
        }
        // The magic-armor save on a Vine Throw is exactly such a stated roll.
        this.renderSnareResistVfx(record.events);
        if (result.completed) {
            this.cleanupAfterSpell(result.events, unitSnapshot);
        } else {
            // Engine re-apply rejected during replay (e.g. turn already handed over) — apply the
            // authoritative events directly so deaths/turn advance still happen; amounts reconcile from
            // the next snapshot.
            this.applyReplayEvents(record.events);
        }
        await this.delayReplay(Sandbox.REPLAY_SPELL_HOLD_MS);
        return true;
    }
    private captureFightSnapshot(): IFightSnapshot {
        const units: IUnitFightSnapshot[] = [];
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            units.push({
                // getAllProperties() returns a deep (structuredClone) copy, so the snapshot
                // is isolated from in-fight mutations.
                properties: unit.getAllProperties(),
                team: unit.getTeam(),
                position: { ...unit.getPosition() },
            });
        }
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const teamConfigs: Partial<Record<TeamType, ITeamConfigSnapshot>> = {};
        for (const team of [TeamVals.LOWER, TeamVals.UPPER] as TeamType[]) {
            teamConfigs[team] = {
                placement: fightProps.getAugmentPlacementLevel(team),
                armor: fightProps.getAugmentArmor(team),
                might: fightProps.getAugmentMight(team),
                empower: fightProps.getAugmentEmpower(team),
                sniper: fightProps.getAugmentSniper(team),
                movement: fightProps.getAugmentMovement(team),
                artifactTier1: fightProps.getArtifactTier1(team),
                artifactTier2: fightProps.getArtifactTier2(team),
                synergies: [...fightProps.getSynergiesPerTeam(team)],
            };
        }
        return {
            units,
            gridType: fightProps.getGridType(),
            teamConfigs,
        };
    }
    /**
     * Recreate and restart the exact same fight (same units, positions, map) captured at
     * the start of the previous fight. Returns false if there is nothing to rematch.
     */
    public override rematchLastFight(): boolean {
        const snapshot = this.lastFightSnapshot;
        console.log("[Rematch] start; snapshot units =", snapshot?.units.length ?? "none");
        if (!snapshot || !snapshot.units.length) {
            console.warn("[Rematch] aborted: no saved fight snapshot");
            return false;
        }

        try {
            this.replayRecorder.reset();
            this.pendingReplayRecords = [];
            this.replayRecordingSuspended = true;
            // 1. Reset shared fight state (laps/queues/started/finished). This also randomizes
            //    the grid type, so we re-apply the saved one below.
            FightStateManager.getInstance().reset();

            // reset() also wipes the per-team placement config; re-apply it (mirrors the scene
            // constructor) so getAugmentPlacement / rebuildFromFightProps don't throw.
            const freshProps = FightStateManager.getInstance().getFightProperties();
            freshProps.setDefaultPlacementPerTeam(TeamVals.LOWER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
            freshProps.setDefaultPlacementPerTeam(TeamVals.UPPER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);

            // Restore each team's pre-fight picks: the reset wiped them, and replaying the SAME fight is
            // the whole promise of the button — the sidebar still shows these picks, so the engine must
            // hold them too (refreshUnits below re-derives the augment/artifact buffs from here).
            for (const team of [TeamVals.LOWER, TeamVals.UPPER] as TeamType[]) {
                const config = snapshot.teamConfigs?.[team];
                if (!config) continue;
                freshProps.setAugmentPerTeam(team, { type: "Placement", value: config.placement });
                freshProps.setAugmentPerTeam(team, { type: "Armor", value: config.armor });
                freshProps.setAugmentPerTeam(team, { type: "Might", value: config.might });
                freshProps.setAugmentPerTeam(team, { type: "Empower", value: config.empower });
                freshProps.setAugmentPerTeam(team, { type: "Sniper", value: config.sniper });
                freshProps.setAugmentPerTeam(team, { type: "Movement", value: config.movement });
                freshProps.setArtifactPerTeam(team, Artifact.ArtifactTier.TIER_1, config.artifactTier1);
                freshProps.setArtifactPerTeam(team, Artifact.ArtifactTier.TIER_2, config.artifactTier2);
                freshProps.setSynergiesPerTeam(team, [...config.synergies]);
            }

            // 2. Clear leftover combat VFX + wipe the current board (force, since units may be
            //    mid/post-fight). destroySpecificUnits frees each unit's grid occupancy.
            this.combatVisuals.clear();
            this.rangedProjectiles.clear();
            const existing = Array.from(this.unitsHolder.getAllUnits().values()) as RenderableUnit[];
            if (existing.length) this.destroySpecificUnits(existing, true, false);
            console.log("[Rematch] wiped", existing.length, "units");

            // Drop selection/hover that referenced now-destroyed units so the side panels
            // don't show stale info from the previous fight.
            this.selectedBoardUnit = undefined;
            this.currentShiftedUnit = undefined;
            this.sc_selectedUnitProperties = undefined;
            this.sc_visibleOverallImpact = undefined;
            this.sc_unitPropertiesUpdateNeeded = true;
            this.hoverManager.clear();

            // 3. Restore the original map geometry + placement zones (setGridType no-ops once a
            //    fight has started, which is why we reset() first).
            this.setGridType(snapshot.gridType);
            this.placementManager.rebuildFromFightProps();

            // 4. Recreate every unit at its saved position through the common placement action
            //    so rematch uses the same occupancy validation and placement event as normal setup.
            const gs = this.sc_sceneSettings.getGridSettings();
            const unitsContainer = this.drawer.getUnitsContainer();
            for (const snap of snapshot.units) {
                const base = Unit.createUnit(
                    // Deep-clone so each rematched unit owns its arrays (see createUnitForTeam/split).
                    structuredClone({ ...snap.properties, id: HoCLib.createSecureUuid(), team: snap.team }),
                    gs,
                    snap.team,
                    UnitVals.CREATURE,
                    this.abilityFactory,
                    this.abilityFactory.getEffectsFactory(),
                    false,
                );
                const unit = RenderableUnit.fromBase(base, this.texAny);
                unit.setBattlefieldVisualProjection(true);
                this.unitsHolder.addUnit(unit);

                if (unit.getSpellsCount() > 0) {
                    this.ensureDigitTextures();
                    if (this.digitTextures) unit.setSpellBookLayer(this.spellBookContainer, this.digitTextures);
                }

                // Derive the footprint cells from the saved position.
                unit.setPosition(snap.position.x, snap.position.y);
                const cells = unit.getCells();
                const placementResult = this.createActionEngine().apply({
                    type: "place_unit",
                    unitId: unit.getId(),
                    team: unit.getTeam(),
                    unitName: unit.getName(),
                    cells,
                });
                if (!placementResult.completed) {
                    this.unitsHolder.deleteUnitById(unit.getId());
                    console.warn("[Rematch] skipped invalid placement for", unit.getName(), unit.getId(), cells);
                    continue;
                }

                // Snap to the exact cell-center position the placement flow uses.
                const placeEvent = placementResult.events.find((event) => event.type === "unit_placed");
                const placePos =
                    placeEvent?.type === "unit_placed" ? placeEvent.position : GridMath.getPositionForCells(gs, cells);
                if (placePos) unit.setPosition(placePos.x, placePos.y);
                const scale = unit.ensureVisual(unitsContainer, gs);
                if (scale) unit.startSpawnAnimation(scale);
            }
            console.log("[Rematch] recreated", snapshot.units.length, "units");

            // 5. Refresh derived state.
            this.gridMatrix = this.grid.getMatrix();
            this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
            this.unitsHolder.refreshStackPowerForAllUnits();
            this.refreshSynergyNumbers(TeamVals.LOWER);
            this.refreshSynergyNumbers(TeamVals.UPPER);
            this.refreshUnits();

            // 6. Start the fight again (re-snapshots, re-applies supply, calls startFight()).
            this.replayRecordingSuspended = false;
            const started = this.startScene();
            console.log("[Rematch] startScene() ->", started);
            return started;
        } catch (err) {
            console.error("[Rematch] FAILED:", err);
            return false;
        } finally {
            this.replayRecordingSuspended = false;
        }
    }
    private ensureDigitTextures(): void {
        if (this.digitTextures) return;
        this.digitTextures = new Map<number, Texture>();
        for (let i = 0; i <= 9; i++) {
            const tex = this.texAny(`digit_${i}`);
            if (tex) this.digitTextures.set(i, tex);
        }
        const minusOne = this.texAny("digit_-1");
        if (minusOne) this.digitTextures.set(-1, minusOne);
    }
    /**
     * Fit the spellbook to the viewport — scale AND centre, always together.
     *
     * The constructor used to set only the position and leave scale at 1, so until the first Resize
     * happened to fire, the very first open drew the book at full texture size, off-centre and clipped
     * by the board area. Toggling fullscreen "fixed" it only because that fires a resize. Both paths
     * (and the open below) now go through this, so the two can't drift apart again.
     *
     * The design box is the book texture (1536x1024) plus the same margins the old square 1024x1024
     * art was fitted with — widened from 1120 so the wider book still clears the sides.
     */
    private layoutSpellBook(width: number, height: number): void {
        if (!this.spellBookContainer) {
            return;
        }
        const scale = Math.min(width / 1680, height / 980) * 0.88;
        this.spellBookContainer.scale.set(scale);
        this.spellBookContainer.position.set(width / 2, height / 2);

        // Dim exactly the square occupied by the map. The backdrop is a child of the scaled book
        // container, so draw it in inverse-scaled local pixels to keep its final screen size stable.
        const mapSize = Math.min(width, height);
        const localMapSize = mapSize / scale;
        this.spellBookBackdrop
            .clear()
            .rect(-localMapSize / 2, -localMapSize / 2, localMapSize, localMapSize)
            .fill({ color: 0x000000, alpha: 0.65 });
    }
    public override Resize(w: number, h: number): void {
        // 1) Let the base scene update camera, worldRoot, etc.
        super.Resize(w, h);
        // 2) Background is in screen-space
        this.layoutBackgroundSquare();

        // Update SpellBook Container Position on Resize to keep it centered
        this.layoutSpellBook(w, h);
        if (this.spellBookOverlay) {
            this.spellBookOverlay.resize(w, h);
        }

        // [FIX] Force rebuild of dungeon atmosphere on resize
        this.dungeonVisuals.onResize();

        // 3) Overlay only exists / matters pre-fight
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const fightStarted = fightProps.hasFightStarted();
        if (!fightStarted && this.unitsOverlay) {
            this.unitsOverlay.onResize(w, h);
            // Placement graphics only used pre-fight
            this.attachToWorldRoot(this.placementGraphics, 100);
            this.attachToWorldRoot(this.placementFrameContainer, 100.1);
        } else if (fightStarted && this.unitsOverlay) {
            // Make sure it’s gone once fight has started
            this.unitsOverlay.destroy();
        }
        // 4) Anything that lives in world space and might have been attached.
        // Placement zones must stay below unit sprites; otherwise placed units show badges/stack
        // overlays while their actual art is painted over by the pre-fight placement tint.
        this.attachToWorldRoot(this.placementGraphics, 90);
        this.attachToWorldRoot(this.placementFrameContainer, 90.1);
        // Holes
        this.attachToWorldRoot(this.dungeonVisuals.getHoleContainer(), 20);
        this.attachToWorldRoot(this.movementGraphics, 49.5);
        this.attachToWorldRoot(this.gameplayGraphics, 55);
        this.dungeonVisuals.attachCenterTerrainSprite();
        this.spellBookOverlay?.resize(w, h);
        this.hoverManager.onCameraChanged();
    }
    /**
     * Re-assert authoritative aura gates before an AI decision. No-op in sandbox (the local engine is
     * authoritative); RankedPlayScene overrides it to re-apply the last snapshot's Hidden / Range Null
     * Field state so a local recompute can't leave a stale gate when the AI picks a target.
     */
    protected ensureAuthoritativeAuraState(): void {}
    /**
     * No-op in sandbox: the local engine mutates the grid authoritatively as units move, so occupancy + the
     * aggro board are always current. RankedPlayScene overrides this to re-stamp the grid from authoritative
     * unit positions before an AI decision (ranked skip-rebuild snapshots leave the aggro board stale).
     */
    protected ensureAuthoritativeGrid(): void {}
    /**
     * Activation identity for AI retry guards. FightProperties refreshes currentTurnStart on every genuine
     * activation, including a same-unit hourglass return, while leaving it stable through multi-action turns.
     * Ranked overrides this with the server's raw turn-start tuple.
     */
    protected getTurnActivationKey(): string {
        const fightProperties = FightStateManager.getInstance().getFightProperties();
        return `${fightProperties.getCurrentLap()}:${this.currentActiveUnit?.getId() ?? ""}:${fightProperties.getCurrentTurnStart()}`;
    }
    /**
     * Re-derive the cached path matrices from live grid occupancy. Subclasses that repair occupancy
     * (ranked's snapshot audit) must call this or movement previews keep pathing on the stale board.
     */
    protected refreshGridMatrices(): void {
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
    }
    public refreshUnits(): void {
        // those need to be applied first
        this.unitsHolder.applyAugments();
        this.unitsHolder.applyArtifacts();
        // now we can refresh unit properties
        this.unitsHolder.refreshAuraEffectsForAllUnits();
        this.unitsHolder.refreshStackPowerForAllUnits();
        // need to call it twice to make sure aura effects are applied
        this.unitsHolder.refreshAuraEffectsForAllUnits();
        this.unitsHolder.refreshStackPowerForAllUnits();
    }
    /**
     * Decode + GPU-upload every on-board unit's "default" (active/selection) animation atlas up front.
     * That atlas is otherwise built and uploaded lazily the first time each unit becomes active, which
     * lands a ~100ms decode/upload hitch on the turn-handoff frame (the "lag right before the turn
     * passes"). Doing it once here — during the load/placement phase — moves the cost off the gameplay
     * critical path. Renders to a tiny offscreen RenderTexture so nothing flickers on screen; the temp
     * sprites are destroyed but the shared atlas textures stay cached (atlasFramesCache).
     */
    private prewarmUnitAtlases(): void {
        const app = this.pixiApp.getApplication();
        const renderer = app?.renderer;
        if (!renderer) {
            return;
        }
        // The actual GPU pixel upload (texImage2D) only happens when a texture is drawn for real — calling
        // the texture system's initSource alone does NOT force it. So render one visible sprite per atlas
        // into a tiny OFFSCREEN RenderTexture: that executes a real draw call, binding+uploading each atlas
        // source now (during load/placement) instead of lazily on the unit's first activation at handoff.
        // Sprites MUST be visible (alpha > 0) — Pixi culls fully-transparent objects, so they'd never draw.
        const container = new Container();
        const seenSources = new Set<unknown>();
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            const frame = (unit as RenderableUnit).prewarmDefaultAtlasFrame?.();
            if (!frame) {
                continue;
            }
            const source = frame.source as unknown;
            if (seenSources.has(source)) {
                continue;
            }
            seenSources.add(source);
            container.addChild(new Sprite(frame));
        }
        if (container.children.length) {
            const rt = RenderTexture.create({ width: 8, height: 8 });
            try {
                renderer.render({ container, target: rt });
            } catch {
                // Prewarm is best-effort; on failure the atlas just uploads lazily as before.
            } finally {
                rt.destroy(true);
            }
        }
        container.destroy({ children: true });
    }
    /**
     * Record, on CombatVisuals, what killed every unit that died in this attack (melee vs range, plus
     * the blow's direction) BEFORE the death visuals spawn — spawnDeathVfx uses it to pick the melee
     * "cleave" / ranged "dissolve" death animation over the generic mirror shatter. Area throws count
     * as ranged kills. Only the engine's unitIdsDied are noted, so a unit that merely got hit here and
     * dies later (to a spell, armageddon…) still gets the generic death.
     */
    protected noteDeathBlowsFromAttackEvent(
        event: Extract<GameEvent, { type: "unit_attacked" | "area_attacked" }>,
    ): void {
        if (!event.unitIdsDied?.length) {
            return;
        }
        // The live path sees the same engine event twice (applyAttackActionResult at impact, then the
        // applyTurnEngineEvents sweep). Attribute each event object once: the sweep's re-note would both
        // recompute the blow angle AFTER teardown (no positions left) and resurrect a consumed entry,
        // which could color a later unrelated death.
        if (this.notedDeathBlowEvents.has(event)) {
            return;
        }
        this.notedDeathBlowEvents.add(event);
        const kind = event.type === "unit_attacked" ? event.attackType : "range";
        const units = this.unitsHolder.getAllUnits();
        // Strike line from VISUAL centers: getPosition() on a 2x2 unit is its base cell, which would
        // skew the blow's angle for large attackers/victims (same reason the splash VFX uses it).
        const gs = this.sc_sceneSettings.getGridSettings();
        const centerOf = (unitId: string): HoCMath.XY | undefined => {
            const unit = units.get(unitId) as RenderableUnit | undefined;
            return unit ? unit.getVisualCenter(gs) : undefined;
        };
        // Event-carried fallback geometry. In the live path this attribution can run AFTER the engine's
        // teardown removed the corpse, so a dead unit's live center is often gone — which silently dropped
        // the blow direction and left every real melee cleave on its random near-vertical fallback. The
        // event itself preserves the impact-time positions: the attacker's own animation entry (a melee
        // strike records `toPosition` = where it struck from) and the damage payload's per-unit positions.
        const attackerAnimLogical =
            event.type === "unit_attacked"
                ? event.animations.find((animation) => animation.affectedUnitId === event.attackerId)?.toPosition
                : undefined;
        const attackerAnimPos = attackerAnimLogical ? projectBattlefieldPoint(attackerAnimLogical, gs) : undefined;
        const damagePositionOf = (unitId: string): HoCMath.XY | undefined => {
            if (event.type !== "unit_attacked") {
                return undefined;
            }
            const damage = event.damage;
            if (damage.unitId === unitId && damage.unitPosition) {
                return projectBattlefieldPoint(damage.unitPosition, gs);
            }
            const position =
                damage.splash?.find((entry) => entry.unitId === unitId)?.position ??
                damage.secondary?.find((entry) => entry.unitId === unitId)?.position;
            return position ? projectBattlefieldPoint(position, gs) : undefined;
        };
        const attackerPos = centerOf(event.attackerId) ?? attackerAnimPos;
        const primaryPos =
            event.type === "unit_attacked"
                ? (centerOf(event.targetId) ?? damagePositionOf(event.targetId))
                : projectBattlefieldPoint(event.targetPosition, gs);
        // A ranged death "dissolve" should punch through toward the projectile's aimed edge, not the dead
        // unit's center. Projectile playback refines the launch end of this direction to the live weapon/hand
        // attachment; the event snapshot intentionally retains the stable body center for post-death VFX.
        const rangeAim =
            event.type === "area_attacked"
                ? projectBattlefieldPoint(event.targetPosition, gs)
                : event.animations[0]?.toPosition
                  ? projectBattlefieldPoint(event.animations[0].toPosition, gs)
                  : primaryPos;
        // A ranged RESPONSE that kills the initiating attacker follows the same broad return direction.
        // Retaliation deliberately ignores the recorded cursor edge, matching projectile playback below.
        const responseAim = attackerPos;
        for (const unitId of event.unitIdsDied) {
            // The attacker itself dying (melee retaliation or ranged response) is a blow FROM the target's side.
            const isAttackerDeath = unitId === event.attackerId;
            const from = isAttackerDeath ? primaryPos : attackerPos;
            let to: HoCMath.XY | undefined;
            if (isAttackerDeath) {
                // Both ranged response and melee/Fire-Shield now land on the attacker's visual center.
                to = kind === "range" ? (responseAim ?? attackerPos) : attackerPos;
            } else {
                to = kind === "range" ? rangeAim : (centerOf(unitId) ?? damagePositionOf(unitId) ?? primaryPos);
            }
            let dir: HoCMath.XY | undefined;
            if (from && to) {
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const len = Math.hypot(dx, dy);
                if (len > 0.001) {
                    dir = { x: dx / len, y: dy / len };
                }
            }
            this.combatVisuals.noteDeathBlow(unitId, kind, dir);
        }
    }
    protected destroySpecificUnits(unitsToDestroy: RenderableUnit[], force = false, isDead = false): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if ((!force && fightProps.hasFightStarted()) || !unitsToDestroy.length) return;
        const destroyedUnitIds = new Set<string>();
        // console.log(`Sandbox: destroySpecificUnits count=${unitsToDestroy.length} force=${force} isDead=${isDead}`);
        for (const utd of unitsToDestroy) {
            const unitId = utd.getId();
            if (destroyedUnitIds.has(unitId)) continue;
            this.layoutVersion++;
            // 1) Remove from UnitsHolder
            const deleted = this.unitsHolder.deleteUnitById(unitId, isDead);
            // console.log(`Sandbox: deleteUnitById(${unitId}) -> ${deleted}`);

            if (deleted) {
                // 2) Cleanup grid occupancy (we still have the Unit instance `utd`)
                this.grid.cleanupAll(unitId, utd.getAttackRange(), utd.isSmallSize());

                // 3) Remove Pixi visuals + selection
                // Spawn the "broken mirror" shatter from the unit's current sprite before tearing it
                // down (only for real deaths — not placement/force cleanup or resurrections).
                const customDeathPlaying = isDead && this.playCustomDeathAnimation(utd);
                if (isDead && !customDeathPlaying) {
                    const shatterInfo = utd.getShatterInfo();
                    if (shatterInfo) {
                        this.combatVisuals?.spawnDeathVfx(shatterInfo, unitId, utd.hasStatusEffect("Freeze"));
                    }
                }
                // console.log(`Sandbox: calling destroyVisuals for ${unitId}`);
                if (!customDeathPlaying) {
                    utd.destroyVisuals();
                }
                if (this.selectedBoardUnit === utd) {
                    this.selectedBoardUnit = undefined;
                }
                if (this.currentShiftedUnit === utd) {
                    this.currentShiftedUnit = undefined;
                }
                destroyedUnitIds.add(unitId);
            } else {
                const resurrectionMsg = `${utd.getName()} is resurrecting!`;
                this.sc_sceneLog.updateLog(resurrectionMsg);
                // Visual Resurrection Sequence: Death -> Wait -> Spawn(Idle)
                utd.playOneShotAnimation("death", () => {
                    // Enter ghost mode during the wait
                    utd.setVisualGhost(true);
                    setTimeout(() => {
                        const currentScale = utd.getCurrentVisualScale();
                        // Exit ghost mode and start spawn animation
                        utd.setVisualGhost(false);
                        utd.startSpawnAnimation(currentScale);
                    }, 2500);
                });
            }
        }
        this.unitsHolder.refreshStackPowerForAllUnits();
    }
    /**
     * Re-derive everything a LOADOUT change (augment, artifact, synergy) can move, and push it at the UI.
     *
     * Picking one of these does not just store a number in FightProperties: refreshUnits re-rolls every
     * stat off it, which can change the selected unit's whole stat block, the active unit's steps
     * (Movement), and its shot distance (Sniper). None of that reaches the screen by itself — the left
     * sidebar is fed by sc_unitPropertiesUpdateNeeded, and the reachable-cell highlight is only recomputed
     * when the cursor moves — so the board kept showing the pre-augment reach until the player happened to
     * jiggle the mouse.
     *
     * Extracted and shared because ranked overrides propagateAugmentation to route through the
     * authoritative server and so never runs the sandbox body. Inlining this recipe (it was inlined three
     * times) is exactly how "it refreshes in sandbox but not in ranked" keeps happening.
     */
    protected refreshAfterLoadoutChange(): void {
        this.refreshUnits();
        if (this.sc_selectedUnitProperties) {
            const unitId = this.sc_selectedUnitProperties.id;
            if (unitId) {
                const unit = this.unitsHolder.getAllUnits().get(unitId);
                if (unit) {
                    this.sc_selectedUnitProperties = { ...unit.getUnitProperties() };
                }
            }
            this.setSelectedUnitProperties(this.sc_selectedUnitProperties);
        }
        this.sc_unitPropertiesUpdateNeeded = true;
        this.refreshActiveUnitReach();
    }
    /**
     * Recompute the active unit's reachable cells and shot ring from its CURRENT stats — the same pair
     * selectNextUnit computes on a handoff, just re-run in place because the stats moved under a unit that
     * is already active. No active unit (the usual case while augments are still being picked at
     * placement) means there is no reach to redraw, so this is a no-op.
     */
    private refreshActiveUnitReach(): void {
        const activeUnit = this.currentActiveUnit;
        if (!activeUnit) {
            return;
        }
        // getMovePath keys on the footprint ANCHOR, and `position` is the body's centre — the two agree
        // only while both sides are at most 2, so read the anchor directly.
        const currentCell = activeUnit.getBaseCell();
        if (currentCell) {
            this.updateCurrentMovePath(currentCell);
        }
        const rangeShotCells = activeUnit.getRangeShotDistance();
        this.sc_currentActiveShotRange =
            rangeShotCells > 0
                ? fullDamageShotRangeForFootprint(
                      activeUnit.getPosition(),
                      rangeShotCells,
                      activeUnit.getFootprintWidth(),
                      activeUnit.getFootprintHeight(),
                  )
                : undefined;
    }
    protected destroyNonPlacedUnits(verifyWithinGridPosition = true): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.hasFightStarted()) return;
        const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
        const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
        const lowerRightPlacement = this.getPlacement(TeamVals.LOWER, 1);
        const upperLeftPlacement = this.getPlacement(TeamVals.UPPER, 1);
        if (!lowerLeftPlacement && !upperRightPlacement && !lowerRightPlacement && !upperLeftPlacement) {
            return;
        }
        // Snapshot units BEFORE we start deleting them from UnitsHolder
        const unitsSnapshot = Array.from(this.unitsHolder.getAllUnits().values()) as RenderableUnit[];
        for (const unit of unitsSnapshot) {
            const unitId = unit.getId();
            const shouldDelete = this.unitsHolder.deleteUnitIfNotAllowed(
                unitId,
                lowerLeftPlacement,
                upperRightPlacement,
                lowerRightPlacement,
                upperLeftPlacement,
                verifyWithinGridPosition,
            );
            if (!shouldDelete) continue;
            // UnitsHolder has already removed the unit at this point,
            // but we still have the original `unit` object for grid cleanup:
            this.grid.cleanupAll(unitId, unit.getAttackRange(), unit.isSmallSize());
            // Remove Pixi visuals + selection
            unit.destroyVisuals();
        }
        this.unitsHolder.refreshStackPowerForAllUnits();
    }
    public propagateAugmentation(teamType: TeamType, augmentType: Augment.AugmentType): boolean {
        const fp = FightStateManager.getInstance().getFightProperties();
        const canAugment = fp.canAugment(teamType, augmentType);
        if (!canAugment) return false;
        const augmented = fp.setAugmentPerTeam(teamType, augmentType);
        if (augmentType.type === "Placement") {
            this.placementManager.rebuildFromFightProps();
            this.destroyNonPlacedUnits(false);
            const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
            const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
            if (lowerLeftPlacement && upperRightPlacement) {
                const targetTeamSize = fp.getNumberOfUnitsAvailableForPlacement(teamType);
                const alliesPlacedCount = this.unitsHolder.getAllAlliesPlaced(
                    teamType,
                    lowerLeftPlacement,
                    upperRightPlacement,
                    this.getPlacement(TeamVals.LOWER, 1),
                    this.getPlacement(TeamVals.UPPER, 1),
                ).length;
                if (alliesPlacedCount > targetTeamSize) {
                    const unitsToCleanup = this.unitsHolder.toCleanupRandomUnitsTillTeamSize(
                        targetTeamSize,
                        teamType,
                        lowerLeftPlacement,
                        upperRightPlacement,
                        this.getPlacement(TeamVals.LOWER, 1),
                        this.getPlacement(TeamVals.UPPER, 1),
                    );
                    if (unitsToCleanup.length) {
                        this.destroySpecificUnits(unitsToCleanup as RenderableUnit[]);
                    }
                }
            }
        }
        if (augmented) {
            this.refreshAfterLoadoutChange();
        }
        return augmented;
    }
    public propagateArtifact(teamType: TeamType, tier: number, artifactId: number): boolean {
        const fp = FightStateManager.getInstance().getFightProperties();
        const applied = fp.setArtifactPerTeam(teamType, tier, artifactId);
        if (applied) {
            this.refreshAfterLoadoutChange();
        }
        return applied;
    }
    public propagateSynergy(
        teamType: TeamType,
        faction: FactionType,
        synergyName: string,
        synergyLevel: number,
    ): boolean {
        let specificSynergy: SpecificSynergy | undefined = undefined;
        let isNatureSynergy = false;
        if (faction === FactionVals.LIFE) {
            specificSynergy = ToLifeSynergy[synergyName];
        } else if (faction === FactionVals.CHAOS) {
            specificSynergy = ToChaosSynergy[synergyName];
        } else if (faction === FactionVals.MIGHT) {
            specificSynergy = ToMightSynergy[synergyName];
        } else if (faction === FactionVals.NATURE) {
            specificSynergy = ToNatureSynergy[synergyName];
            isNatureSynergy = true;
        }
        if (specificSynergy) {
            const hasUpdated = FightStateManager.getInstance()
                .getFightProperties()
                .updateSynergyPerTeam(teamType, faction, specificSynergy, synergyLevel);

            if (hasUpdated) {
                this.refreshAfterLoadoutChange();
            }

            // some synergies may affect the board state
            if (hasUpdated && isNatureSynergy) {
                const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
                const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
                if (lowerLeftPlacement && upperRightPlacement) {
                    const targetTeamSize = FightStateManager.getInstance()
                        .getFightProperties()
                        .getNumberOfUnitsAvailableForPlacement(teamType);
                    if (
                        this.unitsHolder.getAllAlliesPlaced(
                            teamType,
                            lowerLeftPlacement,
                            upperRightPlacement,
                            this.getPlacement(TeamVals.LOWER, 1),
                            this.getPlacement(TeamVals.UPPER, 1),
                        ).length > targetTeamSize
                    ) {
                        const unitsToCleanupFromTheBoard = this.unitsHolder.toCleanupRandomUnitsTillTeamSize(
                            targetTeamSize,
                            teamType,
                            lowerLeftPlacement,
                            upperRightPlacement,
                            this.getPlacement(TeamVals.LOWER, 1),
                            this.getPlacement(TeamVals.UPPER, 1),
                        );
                        if (unitsToCleanupFromTheBoard.length) {
                            this.destroySpecificUnits(unitsToCleanupFromTheBoard as RenderableUnit[]);
                        }
                    }
                }
            }
            return hasUpdated;
        }
        return false;
    }
    public getNumberOfUnitsAvailableForPlacement(teamType: TeamType): number {
        return FightStateManager.getInstance().getFightProperties().getNumberOfUnitsAvailableForPlacement(teamType);
    }
    public getNumberOfPlacedUnits(teamType: TeamType): number {
        let count = 0;
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            if (unit.getTeam() === teamType) {
                count++;
            }
        }
        return count;
    }
    public override propagateButtonClicked(name: string, state: VisibleButtonState): void {
        this.buttonManager.propagateButtonClicked(name, state);
    }
    // Helper to capture total health state and amount of all units
    private captureHealthState(): Map<string, { hp: number; maxHp: number; amount: number; pos: HoCMath.XY }> {
        return this.combatVisuals.captureHealthState();
    }
    // AI action logic has been moved to AIController
    protected refreshSynergyNumbers(teamType: TeamType): void {
        const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
        const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
        if (!lowerLeftPlacement || !upperRightPlacement) {
            return;
        }
        const teamUnits = this.unitsHolder.getAllAlliesPlaced(
            teamType,
            lowerLeftPlacement,
            upperRightPlacement,
            this.getPlacement(TeamVals.LOWER, 1),
            this.getPlacement(TeamVals.UPPER, 1),
        );
        let uniqueNamesLife: string[] = [];
        let uniqueNamesChaos: string[] = [];
        let uniqueNamesMight: string[] = [];
        let uniqueNamesNature: string[] = [];
        for (const ltu of teamUnits) {
            if (ltu.getFaction() === FactionVals.LIFE) {
                if (!uniqueNamesLife.includes(ltu.getName())) {
                    uniqueNamesLife.push(ltu.getName());
                }
            } else if (ltu.getFaction() === FactionVals.CHAOS) {
                if (!uniqueNamesChaos.includes(ltu.getName())) {
                    uniqueNamesChaos.push(ltu.getName());
                }
            } else if (ltu.getFaction() === FactionVals.MIGHT) {
                if (!uniqueNamesMight.includes(ltu.getName())) {
                    uniqueNamesMight.push(ltu.getName());
                }
            } else if (ltu.getFaction() === FactionVals.NATURE) {
                if (!uniqueNamesNature.includes(ltu.getName())) {
                    uniqueNamesNature.push(ltu.getName());
                }
            }
        }
        FightStateManager.getInstance()
            .getFightProperties()
            .setSynergyUnitsPerFactions(
                teamType,
                uniqueNamesLife.length,
                uniqueNamesChaos.length,
                uniqueNamesMight.length,
                uniqueNamesNature.length,
            );
        // Sandbox keeps MANUAL per-team variant picking (owner call): setSynergyUnitsPerFactions just
        // auto-applied the fight-wide seeded/default variant, so re-apply this team's explicit choices
        // on top — updateSynergyPerTeam enforces one-of-two by stripping the faction's other entry.
        const choices = this.sc_synergyVariantChoicePerTeam.get(teamType);
        if (choices) {
            const fightProps = FightStateManager.getInstance().getFightProperties();
            const countByFaction: Record<string, number> = {
                Life: uniqueNamesLife.length,
                Chaos: uniqueNamesChaos.length,
                Might: uniqueNamesMight.length,
                Nature: uniqueNamesNature.length,
            };
            const factionValByName: Record<string, FactionType> = {
                Life: FactionVals.LIFE,
                Chaos: FactionVals.CHAOS,
                Might: FactionVals.MIGHT,
                Nature: FactionVals.NATURE,
            };
            for (const [factionName, chosenVariant] of Object.entries(choices)) {
                const level = Math.min(
                    Math.floor((countByFaction[factionName] ?? 0) / 2),
                    HoCConstants.MAX_SYNERGY_LEVEL,
                );
                if (level > 0) {
                    fightProps.updateSynergyPerTeam(teamType, factionValByName[factionName], chosenVariant, level);
                }
            }
        }
        const synergies = this.sc_possibleSynergiesPerTeam.get(teamType);
        const newSynergies = FightStateManager.getInstance().getFightProperties().getPossibleSynergies(teamType);
        this.sc_possibleSynergiesPerTeam.set(teamType, newSynergies);
        this.sc_possibleSynergiesUpdateNeeded = synergies !== newSynergies;
    }
    /**
     * Sandbox-only manual synergy picking (owner call): choose which of a faction's two synergies this
     * TEAM fields. The choice is durable — refreshSynergyNumbers re-applies it after every loadout
     * change on top of the fight-wide seeded/default variant — and takes effect immediately at the
     * level the army currently unlocks (2/4/6 unique creatures -> level 1/2/3).
     */
    public selectSynergyVariant(teamType: TeamType, factionName: string, synergyName: string): boolean {
        const pair = FACTION_SYNERGY_PAIRS[factionName];
        if (!pair) {
            return false;
        }
        let chosen: SpecificSynergy | undefined;
        if (factionName === "Life") {
            chosen = ToLifeSynergy[synergyName];
        } else if (factionName === "Chaos") {
            chosen = ToChaosSynergy[synergyName];
        } else if (factionName === "Might") {
            chosen = ToMightSynergy[synergyName];
        } else if (factionName === "Nature") {
            chosen = ToNatureSynergy[synergyName];
        }
        if (!chosen || !pair.includes(chosen)) {
            return false;
        }
        const choices = this.sc_synergyVariantChoicePerTeam.get(teamType) ?? {};
        choices[factionName] = chosen;
        this.sc_synergyVariantChoicePerTeam.set(teamType, choices);
        this.refreshSynergyNumbers(teamType);
        this.refreshAfterLoadoutChange();
        // Nature's board-units synergy resizes the placement cap; shrink an over-filled board like
        // propagateSynergy does when a choice moves the cap down.
        if (factionName === "Nature") {
            const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
            const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
            if (lowerLeftPlacement && upperRightPlacement) {
                const targetTeamSize = FightStateManager.getInstance()
                    .getFightProperties()
                    .getNumberOfUnitsAvailableForPlacement(teamType);
                if (
                    this.unitsHolder.getAllAlliesPlaced(
                        teamType,
                        lowerLeftPlacement,
                        upperRightPlacement,
                        this.getPlacement(TeamVals.LOWER, 1),
                        this.getPlacement(TeamVals.UPPER, 1),
                    ).length > targetTeamSize
                ) {
                    const unitsToCleanupFromTheBoard = this.unitsHolder.toCleanupRandomUnitsTillTeamSize(
                        targetTeamSize,
                        teamType,
                        lowerLeftPlacement,
                        upperRightPlacement,
                        this.getPlacement(TeamVals.LOWER, 1),
                        this.getPlacement(TeamVals.UPPER, 1),
                    );
                    if (unitsToCleanupFromTheBoard.length) {
                        this.destroySpecificUnits(unitsToCleanupFromTheBoard as RenderableUnit[]);
                    }
                }
            }
        }
        this.sc_possibleSynergiesUpdateNeeded = true;
        return true;
    }
    protected handleMouseDownForSelectedBody(): void {}
    public cloneObject(newAmount?: number): boolean {
        let cloned = false;
        if (this.sc_selectedUnitProperties) {
            const selectedUnit = this.unitsHolder.getAllUnits().get(this.sc_selectedUnitProperties.id);
            if (!selectedUnit?.getTeam()) {
                return cloned;
            }
            // 1. Army Cap Check
            // Count all units of this team currently on the board/holder
            const currentTeamCount = Array.from(this.unitsHolder.getAllUnits().values()).filter(
                (u) => u.getTeam() === selectedUnit.getTeam(),
            ).length;
            const limit = FightStateManager.getInstance()
                .getFightProperties()
                .getNumberOfUnitsAvailableForPlacement(selectedUnit.getTeam());
            if (currentTeamCount >= limit) {
                return cloned;
            }
            const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
            const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
            if (!lowerLeftPlacement || !upperRightPlacement) {
                return cloned;
            }
            let placement: IPlacement;
            if (selectedUnit.getTeam() === TeamVals.LOWER) {
                placement = lowerLeftPlacement;
            } else {
                placement = upperRightPlacement;
            }
            // possibleCellPositions hands back ANCHOR cells — ones that leave room for the whole body
            // inside the zone — and it needs both sides to inset the two axes independently.
            const allowedCells = placement.possibleCellPositions(
                selectedUnit.isSmallSize(),
                selectedUnit.getFootprintWidth(),
                selectedUnit.getFootprintHeight(),
            );
            HoCLib.shuffle(allowedCells);
            const gs = this.sc_sceneSettings.getGridSettings();
            // Prepare the set of all valid placement hashes for this team to verify boundaries
            const teamAllowedHashes = this.placementManager.getAllowedPlacementCellHashesForTeam(
                selectedUnit.getTeam(),
            );
            // Prefer dropping the new stack right next to the source ("split target"): try anchor cells
            // adjacent to its footprint first (nearest first), then fall back to the shuffled zone cells.
            // The boundary + vacancy checks below still filter, so an occupied / out-of-zone adjacent cell
            // is simply skipped and we move on to the next candidate.
            const sourceCells = selectedUnit.getCells();
            const sourceHashes = new Set(sourceCells.map((c) => (c.x << 4) | c.y));
            const scx = sourceCells.reduce((s, c) => s + c.x, 0) / Math.max(1, sourceCells.length);
            const scy = sourceCells.reduce((s, c) => s + c.y, 0) / Math.max(1, sourceCells.length);
            const adjacentAnchors: HoCMath.XY[] = [];
            const adjSeen = new Set<number>();
            for (const c of sourceCells) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    for (let dy = -1; dy <= 1; dy += 1) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = c.x + dx;
                        const ny = c.y + dy;
                        if (nx < 0 || ny < 0) continue;
                        const h = (nx << 4) | ny;
                        if (sourceHashes.has(h) || adjSeen.has(h)) continue;
                        adjSeen.add(h);
                        adjacentAnchors.push({ x: nx, y: ny });
                    }
                }
            }
            adjacentAnchors.sort((a, b) => (a.x - scx) ** 2 + (a.y - scy) ** 2 - ((b.x - scx) ** 2 + (b.y - scy) ** 2));
            const orderedCells: HoCMath.XY[] = [];
            const orderedSeen = new Set<number>();
            for (const c of [...adjacentAnchors, ...allowedCells]) {
                const h = (c.x << 4) | c.y;
                if (orderedSeen.has(h)) continue;
                orderedSeen.add(h);
                orderedCells.push(c);
            }
            for (const cell of orderedCells) {
                // 2. Define the full footprint. Every candidate is an anchor, so the body hangs down-left
                // of it — growing up-right instead put the clone on cells the engine never assigns it, and
                // for a non-square body it also loses the one legal column at the zone's low edge.
                const cellsToOccupy = selectedUnit.getFootprintCellsForAnchor(cell);
                // 3. CHECK: Boundaries (Ensure EVERY cell is inside the placement zone)
                // Even if the anchor is valid, a large unit might spill out.
                if (teamAllowedHashes) {
                    let allInside = true;
                    for (const c of cellsToOccupy) {
                        const h = (c.x << 4) | c.y;
                        if (!teamAllowedHashes.has(h)) {
                            allInside = false;
                            break;
                        }
                    }
                    if (!allInside) continue; // Skip this position if it bleeds out
                }
                // 4. CHECK: Vacancy (Are these cells free?)
                if (!this.grid.areAllCellsEmpty(cellsToOccupy)) {
                    continue;
                }
                // 5. Create the logical unit
                const newUnit = this.createUnitForTeam(selectedUnit.getTeam(), newAmount);
                if (!newUnit) break;
                const placementAction: GameAction = {
                    type: "place_unit",
                    unitId: newUnit.getId(),
                    team: newUnit.getTeam(),
                    unitName: newUnit.getName(),
                    cells: cellsToOccupy,
                };
                const placementResult = this.createActionEngine().apply(placementAction);
                if (placementResult.completed) {
                    this.layoutVersion++;
                    this.gridMatrix = this.grid.getMatrix();
                    this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
                    // 7. Finalize Position and Visuals
                    const placeEvent = placementResult.events.find((event) => event.type === "unit_placed");
                    const placePos =
                        placeEvent?.type === "unit_placed"
                            ? placeEvent.position
                            : GridMath.getPositionForCells(gs, cellsToOccupy);
                    if (placePos) newUnit.setPosition(placePos.x, placePos.y);
                    const scale = newUnit.ensureVisual(this.drawer.getUnitsContainer(), gs);
                    if (scale) {
                        newUnit.startSpawnAnimation(scale);
                    }
                    // 8. Refresh State
                    this.unitsHolder.refreshStackPowerForAllUnits();
                    this.refreshSynergyNumbers(selectedUnit.getTeam());
                    this.refreshUnits();
                    cloned = true;
                    this.flushPendingReplayRecords();
                    this.grid.print(newUnit.getId());
                    break; // Stop after successful clone
                } else {
                    // If grid occupation failed unexpectedly, cleanup
                    this.unitsHolder.deleteUnitById(newUnit.getId());
                }
            }
        }
        return cloned;
    }
    public deleteObject(): void {
        const u = this.sc_selectedUnitProperties;
        if (!u || !u.id || FightStateManager.getInstance().getFightProperties().hasFightStarted()) return;

        const unit = this.unitsHolder.getAllUnits().get(u.id);
        if (unit) {
            const action: GameAction = { type: "delete_unit", unitId: u.id };
            const unitSnapshot = this.snapshotRenderableUnits();
            const result = this.createActionEngine().apply(action);
            if (!result.completed) return;
            this.applyTurnEngineEvents(result.events, unitSnapshot);

            this.refreshSynergyNumbers(unit.getTeam());
            this.refreshUnits();

            this.Deselect();
        }
    }
    public override refreshScene(u: UnitProperties): void {
        // 1. Safety checks
        if (FightStateManager.getInstance().getFightProperties().hasFightStarted() || !u.id) return;
        const unit = this.unitsHolder.getAllUnits().get(u.id);
        if (unit) {
            // 2. Update the Game Logic
            unit.setAmountAlive(u.amount_alive);
            // 3. Refresh Visuals (Stack power, HP bars, etc.)
            this.refreshUnits();
            // 4. CRITICAL FIX: Sync the UI State — rebuild the buff/debuff impact too (not just flag a
            // stats refresh), so the sidebar never emits fresh stats with a stale debuff list.
            this.sc_selectedUnitProperties = { ...unit.getUnitProperties() };
            this.setSelectedUnitProperties(this.sc_selectedUnitProperties);
        }
    }
    /**
     * Whether this scene rolls its own random scattered layout. The ranked scene overrides this OFF: its
     * layout is SEEDED from the game id (scatteredMountainsForSeed) so the server and both seats agree —
     * a local Math.random() roll here is exactly what put different stones on each ranked screen while
     * the server played yet another board ("still thinks we have old two mountains").
     */
    protected scatteredMountainsAutoRoll(): boolean {
        return true;
    }
    /**
     * Drop SCATTERED_MOUNTAIN_COUNT single-cell mountains at random over the neutral band, each wearing a
     * random variant from the art pool. A no-op (and a full clear) on any board that is not Mountains.
     *
     * The spawn lane is deliberately fixed at the four central columns for every placement preset, as the
     * Cemetery map design reserves that full-height strip between the left and right deployment fields.
     */
    /** The target/obstacle on which the engine applies Aggr's gate after resolving the actual range ray. */
    private resolveRangeAttackAggrIntent(
        targetUnit: Unit,
        exactAimPosition?: HoCMath.XY,
    ): { primary?: Unit; stoppedByObstacle: boolean } {
        const attacker = this.currentActiveUnit;
        if (!attacker || !this.attackHandler) {
            return { stoppedByObstacle: false };
        }
        const aimPosition = resolveLiveRangeProjectileTracePosition(
            exactAimPosition,
            () =>
                attacker instanceof RenderableUnit
                    ? this.resolveRangeAimForTarget(attacker, targetUnit)?.position
                    : undefined,
            targetUnit.getPosition(),
        );
        const throughShot = attacker.hasAbilityActive("Through Shot");
        const ignoresStructures = attacker.hasAbilityActive("Large Caliber") || attacker.hasAbilityActive("Area Throw");
        let evaluation = this.attackHandler.evaluateRangeAttack(
            this.unitsHolder.getAllUnits(),
            attacker,
            attacker.getPosition(),
            aimPosition,
            throughShot,
            false,
            ignoresStructures,
        );
        const hasDoubleShot = AbilityHelper.hasDoubleShotAbility(attacker);
        const obstacleIntersections =
            this.grid.hasScatteredMountains() && hasDoubleShot && !ignoresStructures
                ? this.attackHandler.getObstacleIntersections(attacker.getPosition(), aimPosition).slice(0, 2)
                : [];
        if (
            shouldResolveAggrAfterFirstDoubleShotObstacle(
                obstacleIntersections.length,
                hasDoubleShot,
                ignoresStructures,
            )
        ) {
            // Projectile one removes the sole tombstone; projectile two is then evaluated on the unchanged
            // ray. `isSelection` is the evaluator's read-only "ignore structures" mode, safe here because
            // getObstacleIntersections proved there is exactly one structure to remove on this segment.
            evaluation = this.attackHandler.evaluateRangeAttack(
                this.unitsHolder.getAllUnits(),
                attacker,
                attacker.getPosition(),
                aimPosition,
                throughShot,
                true,
                ignoresStructures,
            );
        }
        return {
            primary: evaluation.affectedUnits[0]?.[0],
            stoppedByObstacle: !!evaluation.attackObstacle,
        };
    }
    private showAggrBlockedActionHint(forcedTarget: Unit | undefined = this.getLiveAggrForcedTarget()): boolean {
        const activeUnit = this.currentActiveUnit;
        if (!activeUnit || !forcedTarget) {
            return false;
        }

        // A blocked attack must not leave the previous legal target's arrow, damage numbers, AOE outline,
        // move silhouette, or attack cursor behind the explanation. This is also used by MouseDown so a
        // quick move-and-click gets the same feedback even when hover() has not run at the new pointer yet.
        this.hoverManager.clearAttackVisuals();
        this.hoverManager.clearAOEArea();
        this.hoverManager.clearHoverSilhouette();
        this.hoverManager.hoverAttackFromCell = undefined;
        this.hoverRangeAttackObstacle = undefined;
        this.emitLocalMoveIntent(undefined);
        this.sc_isHoveringAttackTarget = false;
        this.sc_meleeCursorDirection = undefined;

        const viewerTeam = this.getViewerTeam();
        const concealedFromViewer =
            forcedTarget.hasBuffActive("Hidden") && viewerTeam !== undefined && forcedTarget.getTeam() !== viewerTeam;
        const hint = formatAggrBlockedActionHint(concealedFromViewer ? undefined : forcedTarget.getName());
        if (this.sc_hoverInfoArr.length !== 1 || this.sc_hoverInfoArr[0] !== hint) {
            this.cleanupHoverText(false);
            this.sc_hoverInfoArr = [hint];
            this.sc_hoverTextUpdateNeeded = true;
        }
        return true;
    }
    private clearAggrBlockedActionHint(): void {
        if (!isAggrBlockedActionHint(this.sc_hoverInfoArr[0])) {
            return;
        }
        this.sc_hoverInfoArr = [];
        this.sc_hoverTextUpdateNeeded = true;
    }
    private isAttackBlockedByAggr(
        resolvedPrimaryTarget: Unit | undefined,
        kind: "melee" | "range" | "area" | "spell",
    ): Unit | undefined {
        const forcedTarget = this.getLiveAggrForcedTarget();
        if (
            !forcedTarget ||
            !isManualAttackBlockedByAggr(forcedTarget.getId(), {
                kind,
                resolvedPrimaryTargetId: resolvedPrimaryTarget?.getId(),
            })
        ) {
            return undefined;
        }
        return forcedTarget;
    }
    private isRangeAttackBlockedByAggr(targetUnit: Unit, exactAimPosition?: HoCMath.XY): Unit | undefined {
        const resolution = this.resolveRangeAttackAggrIntent(targetUnit, exactAimPosition);
        if (!resolution.primary && resolution.stoppedByObstacle) {
            const forcedTarget = this.getLiveAggrForcedTarget();
            return forcedTarget && isManualAttackBlockedByAggr(forcedTarget.getId(), { kind: "obstacle" })
                ? forcedTarget
                : undefined;
        }
        return this.isAttackBlockedByAggr(resolution.primary, "range");
    }
    private isRangedUnitAttackIntent(targetUnit: Unit): boolean {
        const unit = this.currentActiveUnit;
        if (
            !(unit instanceof RenderableUnit) ||
            unit.getAttackTypeSelection() !== AttackVals.RANGE ||
            unit.getRangeShots() <= 0 ||
            unit.hasDebuffActive("Range Null Field Aura") ||
            unit.hasStatusApplied("Rangebane") ||
            // The unit itself: the legacy boolean can only describe 1x1 or 2x2, and a rectangle squeezed
            // through it is tested on cells it does not stand on — the cursor then refuses a legal shot.
            this.attackHandler.canBeAttackedByMelee(
                unit.getPosition(),
                unit,
                this.grid.getEnemyAggrMatrixByUnitId(unit.getId()),
            )
        ) {
            return false;
        }
        return (
            unit.hasAbilityActive("No Melee") ||
            HoCMath.getDistance(unit.getPosition(), targetUnit.getPosition()) > GridConstants.STEP * 1.5
        );
    }
    private isUnitAttackBlockedByAggr(targetUnit: Unit): Unit | undefined {
        const unit = this.currentActiveUnit;
        const selection = unit?.getAttackTypeSelection();
        if (selection === AttackVals.RANGE) {
            if (this.isRangedUnitAttackIntent(targetUnit)) {
                return this.isRangeAttackBlockedByAggr(targetUnit);
            }
            return unit?.hasAbilityActive("No Melee") ? undefined : this.isAttackBlockedByAggr(targetUnit, "melee");
        }
        if (selection !== AttackVals.MELEE && selection !== AttackVals.MELEE_MAGIC) {
            return undefined;
        }
        return this.isAttackBlockedByAggr(targetUnit, "melee");
    }
    /**
     * Aggr forced-target gate for attack HIGHLIGHTS. An aggravated unit (getTarget() set + target alive) can
     * only attack the unit that aggr'd it, so no other enemy should draw a red attack highlight — mirrors the
     * canAttackBy*Targets forced-target filter in updateCurrentMovePath. Returns true (attackable) when there
     * is no active forced target, when the lock has released (target dead/gone), or when this IS the target.
     */
    private getLiveAggrForcedTarget(): Unit | undefined {
        const forcedTargetId = this.currentActiveUnit?.getTarget();
        if (!forcedTargetId) {
            return undefined;
        }
        const forcedTarget = this.unitsHolder.getAllUnits().get(forcedTargetId);
        return forcedTarget && !forcedTarget.isDead() ? forcedTarget : undefined;
    }
    private rollScatteredMountains(): void {
        if (!this.scatteredMountainsAutoRoll()) {
            return;
        }
        const isMountains =
            FightStateManager.getInstance().getFightProperties().getGridType() === GridVals.BLOCK_CENTER;
        if (!isMountains) {
            this.grid.setScatteredMountains([]);
            this.dungeonVisuals?.setScatteredMountains([]);
            return;
        }
        // The band follows the board orientation: side-oriented boards (the default everywhere now —
        // owner call 2026-08-25) deploy on the left/right x-bands, so the neutral strip is the middle
        // COLUMNS, full height, matching scatteredMountainsForSeed exactly. A classic board keeps the
        // horizontal middle-rows belt between its bottom/top zones.
        // One roll, one rule. A static game's barrels now come from the SAME seeded generator the ranked
        // server, both seats and every replay use, keyed on this fight's own id — so a Cemetery board is
        // built identically everywhere, and the barrel COUNT is rolled per game (9-12) exactly like the
        // map itself rather than being a fixed number drawn locally. This block used to be a hand-copied
        // Math.random() twin of scatteredMountainsForSeed: it re-derived the same band, the same partial
        // Fisher-Yates and the same variant deck, which is three chances to drift from the server's idea
        // of the same board.
        const fightProperties = FightStateManager.getInstance().getFightProperties();
        const layout = scatteredMountainsForSeed(
            fightProperties.getId(),
            GridConstants.GRID_SIZE,
            fightProperties.isSideOrientedPlacement(),
        );
        this.grid.setScatteredMountains(layout.map((rock) => rock.cell));
        this.dungeonVisuals?.setScatteredMountains(
            layout.map((rock) => ({ x: rock.cell.x, y: rock.cell.y, variant: rock.variant })),
        );
    }
    public override setGridType(gridType: GridType): void {
        super.setGridType(gridType);
        if (FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
            return;
        }
        FightStateManager.getInstance().getFightProperties().setGridType(gridType);
        this.grid.refreshWithNewType(FightStateManager.getInstance().getFightProperties().getGridType());
        this.rollScatteredMountains();
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        // Fresh terrain starts wet (un-dried) — reset the dried sprite state.
        this.dungeonVisuals?.setCenterDried(false);
        // force as we might have changed the number of laps till narrowing
        this.refreshVisibleStateIfNeeded(true);
    }
    private refreshVisibleStateIfNeeded(force = false) {
        if (!this.sc_visibleState || force) {
            const fightProps = FightStateManager.getInstance().getFightProperties();
            const fightFinished = fightProps.hasFightFinished();
            // Preserve terminal state only while the authoritative fight state is terminal. Vite
            // refreshes can rebuild this object while carrying stale React-facing state; do not let
            // that resurrect the fight-finished overlay for an active or pre-fight board.
            const prevHasFinished = fightFinished ? (this.sc_visibleState?.hasFinished ?? false) : false;
            const prevTeamWin = fightFinished ? this.sc_visibleState?.teamWin : undefined;
            const prevFightStats = this.sc_visibleState?.fightStats;
            const nextFightStats =
                fightFinished || prevFightStats?.winner === TeamVals.NO_TEAM ? prevFightStats : undefined;
            const prevTeamTypeTurn = this.sc_visibleState?.teamTypeTurn;
            const prevLapNumber = this.sc_visibleState?.lapNumber ?? 0;
            const prevUpNext = this.sc_visibleState?.upNext ?? [];
            // The turn clock survives a rebuild too. Seeding it blank (-1 / MAX_SAFE_INTEGER) made the
            // timer bar empty out and read "0s" until the next 500ms tick refilled it, which is visible
            // as a flicker every time something forces a refresh mid-turn -- switching between melee and
            // ranged does exactly that. The clock lives in FightProperties, so read it straight from
            // there rather than carrying the previous frame's value forward: the rebuilt state is then
            // correct immediately instead of being one tick stale.
            const turnStart = fightProps.getCurrentTurnStart();
            const turnEnd = fightProps.getCurrentTurnEnd();
            const hasLiveTurnClock = turnEnd > turnStart;
            const secondsRemaining = hasLiveTurnClock
                ? Math.max(0, (turnEnd - HoCLib.getTimeMillis()) / 1000)
                : (this.sc_visibleState?.secondsRemaining ?? -1);
            const secondsMax = hasLiveTurnClock
                ? (turnEnd - turnStart) / 1000
                : (this.sc_visibleState?.secondsMax ?? Number.MAX_SAFE_INTEGER);
            this.sc_visibleState = {
                canBeStarted: false,
                hasFinished: prevHasFinished,
                teamWin: prevTeamWin,
                secondsRemaining,
                secondsMax,
                teamTypeTurn: prevTeamTypeTurn,
                hasAdditionalTime: false,
                lapNumber: prevLapNumber,
                numberOfLapsTillNarrowing: FightStateManager.getInstance()
                    .getFightProperties()
                    .getNumberOfLapsTillNarrowing(),
                numberOfLapsTillStopNarrowing: HoCConstants.NUMBER_OF_LAPS_TILL_STOP_NARROWING,
                canRequestAdditionalTime: !!FightStateManager.getInstance()
                    .getFightProperties()
                    .requestAdditionalTurnTime(undefined, true),
                upNext: prevUpNext,
                lapsNarrowed: FightStateManager.getInstance().getFightProperties().getLapsNarrowed(),
                // Preserve accumulated fight stats (the ALT-view casualties / "damage dealt")
                // across a forced rebuild; otherwise they're wiped on every lap flip and only
                // reappear on the next casualty sample, so the ALT view looks broken.
                fightStats: nextFightStats,
            };
            this.sc_visibleStateUpdateNeeded = true;
        }
    }
    public getGridType(): GridType {
        return FightStateManager.getInstance().getFightProperties().getGridType();
    }
    /**
     * "Use additional time": extend the active team's running turn clock once per lap. Local sandbox
     * applies it straight to the shared FightProperties (RankedPlayScene overrides this to route the
     * request through the authoritative server instead). No-op if the team already used it this lap or
     * has no remaining budget (requestAdditionalTurnTime returns 0).
     */
    public requestTime(team: number): void {
        if (team === undefined || team === null) {
            return;
        }
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const additionalTime = fightProps.requestAdditionalTurnTime(team as TeamType);
        if (additionalTime > 0) {
            // Log it — flagged by the active unit's team via the scene-log resolver (the active unit is
            // the requesting team's). Ranked logs this from the journal instead (engine text suppressed).
            this.sc_sceneLog.updateLog(`${this.currentActiveUnit?.getName() ?? "Team"} requested additional time`);
            if (this.sc_visibleState) {
                this.sc_visibleState.canRequestAdditionalTime = false;
                this.sc_visibleState.hasAdditionalTime = true;
                this.sc_visibleStateUpdateNeeded = true;
            }
        }
    }
    /**
     * Whether the local viewer may request additional turn time for `team`. Local sandbox drives every
     * team (single-player autobattle acts for both sides), so this is always true. RankedPlayScene
     * overrides it to the viewer's own team — you can't extend the opponent's clock.
     */
    protected canOfferAdditionalTimeForTeam(_team: TeamType): boolean {
        return true;
    }
    private clearBoardSelection(_notifyUnitDeselected: boolean = true): void {
        // stop board selection animation if any
        if (this.selectedBoardUnit) {
            this.selectedBoardUnit.setBoardSelected(false);
            this.selectedBoardUnit = undefined;
        }
        this.hasActiveSelection = false;
        this.selectionFromOverlay = false;
        this.draggingUnitId = undefined;
        this.draggingUnitTeam = undefined;
        this.placementDragPointerOrigin = undefined;
        this.placementDragPointerMoved = false;
        this.sc_selectedUnitProperties = undefined;
        this.hoverManager.resetHover(true);
        this.hoverManager.resetBoardHoverState();
    }
    private tryPlaceUnit(): void {
        const selected = this.sc_selectedUnitProperties;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        // 1. Basic Validations
        if (!this.hasActiveSelection || !selected) {
            console.log("No active selection");
            return;
        }
        if (fightProps.hasFightStarted()) {
            console.log("Fight already started, no placement");
            return;
        }
        if (
            !this.hoverManager.hoverSelectedCells ||
            this.hoverManager.hoverSelectedCells.length === 0 ||
            this.hoverManager.hoverSelectedCellsSwitchToRed
        ) {
            console.log("No valid hoverSelectedCells or hover is red, abort placement");
            if (!this.selectionFromOverlay) {
                this.clearBoardSelection();
            }
            return;
        }
        const teamType = this.hoverManager.hoverPlacementCellTeam;
        if (!teamType) {
            console.log("No hoverPlacementCellTeam, abort placement");
            if (!this.selectionFromOverlay) {
                this.clearBoardSelection();
            }
            return;
        }
        // 2. Validate Placement Hashes
        const gs = this.sc_sceneSettings.getGridSettings();
        const cellsToOccupy = this.hoverManager.hoverSelectedCells;
        for (const c of cellsToOccupy) {
            const h = (c.x << 4) | c.y;
            if (!this.placementManager.getAllowedPlacementCellHashes().has(h)) {
                console.log("Cell not in allowed placement hashes", c);
                if (!this.selectionFromOverlay) this.clearBoardSelection();
                return;
            }
        }
        // Calculate the target world position derived from the hover cells
        const placePos = GridMath.getPositionForCells(gs, cellsToOccupy);
        if (this.draggingUnitId && placePos) {
            const unit = this.unitsHolder.getAllUnits().get(this.draggingUnitId);
            if (unit) {
                const currentPos = unit.getPosition();
                const dx = Math.abs(currentPos.x - placePos.x);
                const dy = Math.abs(currentPos.y - placePos.y);
                if (dx < 0.1 && dy < 0.1) {
                    console.log("Dropped at exact same position. Ignoring action (keeping selection).");
                    return;
                }
            }
        }
        // ------------------------------------------------------------------
        // 3. Check Collision (unless moving existing unit, then we ignore self-collision for now)
        if (!this.draggingUnitId && !this.grid.areAllCellsEmpty(cellsToOccupy)) {
            console.log("Some cells already occupied, abort (new placement)");
            return;
        }
        // 4. Check Team Cap (only for new units)
        const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
        const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
        const lowerRightPlacement = this.getPlacement(TeamVals.LOWER, 1);
        const upperLeftPlacement = this.getPlacement(TeamVals.UPPER, 1);
        if (!this.draggingUnitId && lowerLeftPlacement && upperRightPlacement) {
            const alliesPlacedCount = this.unitsHolder.getAllAlliesPlaced(
                teamType,
                lowerLeftPlacement,
                upperRightPlacement,
                lowerRightPlacement,
                upperLeftPlacement,
            ).length;
            const maxUnitsForTeam = fightProps.getNumberOfUnitsAvailableForPlacement(teamType);
            if (alliesPlacedCount >= maxUnitsForTeam) {
                console.log(
                    `Team ${teamType} reached placement cap ${alliesPlacedCount}/${maxUnitsForTeam}, abort (new placement)`,
                );
                return;
            }
        }
        if (!placePos) {
            console.log("Failed to compute position for cells");
            if (!this.selectionFromOverlay) this.clearBoardSelection();
            return;
        }
        // 5. Resolve Unit Instance
        let unit: RenderableUnit | undefined;
        if (this.draggingUnitId) {
            unit = this.unitsHolder.getAllUnits().get(this.draggingUnitId) as RenderableUnit;
            if (!unit) console.log("Dragging unit not found, will create new");
        }
        if (!unit) {
            unit = this.createUnitForTeam(teamType);
        }
        if (!unit) {
            console.log("Failed to create or resolve unit");
            if (!this.selectionFromOverlay) this.clearBoardSelection();
            return;
        }
        const wasRepositioningPlacedUnit =
            !!this.draggingUnitId && unit.getCells().some((cell) => this.grid.getOccupantUnitId(cell) === unit.getId());
        const placementAction: GameAction = {
            type: "place_unit",
            unitId: unit.getId(),
            team: unit.getTeam(),
            unitName: unit.getName(),
            cells: cellsToOccupy,
        };
        const placementResult = this.createActionEngine().apply(placementAction);
        if (!placementResult.completed) {
            if (!this.draggingUnitId) {
                this.unitsHolder.deleteUnitById(unit.getId());
            }
            if (!this.selectionFromOverlay) this.clearBoardSelection();
            return;
        }
        // 9. Success: Finalize Updates
        const placeEvent = placementResult.events.find((event) => event.type === "unit_placed");
        const placedPosition = placeEvent?.type === "unit_placed" ? placeEvent.position : placePos;
        unit.setPosition(placedPosition.x, placedPosition.y);
        unit.setBattlefieldVisualProjection(true);
        // A unit dragged in from the placement bench keeps the enlarged bench scale on its instance;
        // reset it to normal board size now that it lives on the grid (ranked skips the post-place
        // re-hydrate, so nothing else would correct it).
        unit.setVisualScaleMultiplier(1);
        // It now lives on the board, so drop it from the placement-bench tracking. Otherwise the bench's
        // slide/collapse iterates these maps and setPosition()s the unit back to its old (off-screen)
        // bench slot — clearing already-placed units off the board and stacking them at the slide end.
        // Ranked skips the post-place re-hydrate that would otherwise prune these maps.
        this.placementBenchBaseHitBoxes.delete(unit.getId());
        this.placementBenchHitBoxes.delete(unit.getId());
        this.layoutVersion++;
        this.refreshSynergyNumbers(unit.getTeam());
        this.refreshUnits();
        this.flushPendingReplayRecords();
        const scale = unit.ensureVisual(this.drawer.getUnitsContainer(), gs);
        if (!scale) {
            console.log("Failed to ensure unit sprite");
            if (!this.selectionFromOverlay) this.clearBoardSelection();
            return;
        }
        // Sync pathfinding matrices
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        if (!wasRepositioningPlacedUnit) {
            unit.startSpawnAnimation(scale);
        }
        this.unitsHolder.refreshStackPowerForAllUnits();
        // 10. Clear Selection / Hover State
        // 10. Update Selection (Don't Clear)
        // Set the placed unit as the selected board unit to show its visuals immediately
        if (this.selectionFromOverlay) {
            this.sc_selectedUnitProperties = undefined;
            this.hoverManager.resetHover(true);
            if (this.unitsOverlay) this.unitsOverlay.clearSelection(true);
            this.hasActiveSelection = false;
            this.selectionFromOverlay = false;
        } else {
            // Board move - Deselect on drop
            if (this.selectedBoardUnit) {
                this.selectedBoardUnit.setBoardSelected(false);
                this.selectedBoardUnit = undefined;
            }
            this.clearBoardSelection();
            this.Deselect(false, true);
        }
        // Cooldown removed as per user request
        this.hoverManager.setLastPlacement(undefined);
    }
    protected destroyTempFixtures(): void {
        this.updateUnitsOverlayVisibility();
    }
    /**
     * Shift while a rotatable spell is armed turns its footprint a quarter-turn. Held or tapped, each press
     * is one turn — the manager filters auto-repeat, so holding Shift does not spin the wall.
     */
    public override ShiftKey(down: boolean): void {
        if (!down || this.sc_isAnimating) {
            return;
        }
        this.rotateFireWallAim();
    }
    public override ShiftMouseDown(p: HoCMath.XY): void {
        this.pointerVisualWorld = p;
        p = this.getLogicalBattlefieldPoint(p);
        this.sc_mouseWorld = p;
        if (this.sc_isAnimating) return;

        // While a rotatable spell is armed, shift-clicking the board turns the footprint instead of
        // inspecting whatever is under the cursor — the player is aiming, not browsing stat cards.
        if (this.rotateFireWallAim()) {
            return;
        }

        // A click-committed split (started by Shift after a stack was picked up) drops on this shift-click too.
        if (this.splitDragActive && this.splitCommitOnClick) {
            this.finishPlacementSplit();
            return;
        }

        // During placement, shift-pressing your own placed stack starts a split-drag instead of inspection.
        if (this.tryBeginPlacementSplit(p)) return;

        // Shift-click is read-only inspection (stats on the sidebar), so it is NOT gated by team or
        // placement eligibility — any visible unit can be inspected, matching the sandbox. Also look
        // beyond grid-occupying units so off-grid units (the ranked placement bench, and revealed
        // opponent silhouettes) are inspectable too.
        const unit = this.getInspectableUnitAtPosition(p);
        if (unit && unit instanceof RenderableUnit) {
            // Set shifted unit (Toggle if same)
            if (this.currentShiftedUnit && this.currentShiftedUnit.getId() === unit.getId()) {
                this.currentShiftedUnit = undefined;
            } else {
                this.currentShiftedUnit = unit;
            }

            // Force Sidebar Update
            const props = unit.getUnitProperties();
            this.sc_selectedUnitProperties = props;
            this.setSelectedUnitProperties(props);
            this.sc_unitPropertiesUpdateNeeded = true;

            // Update Board Selection Visuals
            if (this.selectedBoardUnit && this.selectedBoardUnit !== unit) {
                this.selectedBoardUnit.setBoardSelected(false);
            }
            this.selectedBoardUnit = unit;
            this.selectedBoardUnit.setBoardSelected(true);

            // Reset interaction states to ensure clean inspection
            this.draggingUnitId = undefined;
            this.draggingUnitTeam = undefined;
            this.draggingUnitId = undefined;
            this.draggingUnitTeam = undefined;
            this.hasActiveSelection = false; // Inspection only, do not enter placement/clone mode
            this.selectionFromOverlay = false;
            this.selectionFromOverlay = false;

            // Optional: Log
            // console.log("Shift+Click Shifted Unit:", unit.getName());
        }
    }
    /** MouseDown from screen coords (already converted to world if needed by caller) */
    public override MouseDown(p: HoCMath.XY): void {
        this.pointerVisualWorld = p;
        const logicalPoint = this.getLogicalBattlefieldPoint(p);
        this.sc_mouseWorld = logicalPoint;

        // A click-committed split (started by Shift after a stack was picked up) drops on this click.
        if (this.splitDragActive && this.splitCommitOnClick) {
            this.finishPlacementSplit();
            return;
        }

        // --- SPELLBOOK: while the book is open, a click selects a spell or closes the book. ---
        // This is the authoritative spellbook input handler (the stage pointerdown closer was
        // removed to avoid a click-ordering race that swallowed spell-selection clicks).
        if (this.sc_renderSpellBookOverlay) {
            this.handleSpellbookClick(p);
            return;
        }

        // Everything below this point targets the board, so clicks, occupancy and rendered figures
        // must all use the same logical coordinate system.
        p = logicalPoint;

        const fightProps = FightStateManager.getInstance().getFightProperties();
        // 1. FIGHT STARTED INTERACTION
        if (fightProps.hasFightStarted()) {
            // If AI owns the current turn, board input should not preview or execute player actions.
            if (this.isBoardInputLockedByAI()) {
                this.clearBoardHoverPreviews();
                return;
            }

            // --- SPELL CASTING (single-target): a spell is armed, so this click chooses the target. ---
            if (this.currentActiveSpell && this.currentActiveUnit) {
                // Cell-target spells (Craft, Smoke) resolve to a CELL, not a unit: cast on the clicked 2x2.
                if (
                    this.currentActiveSpell.getSpellTargetType() === SpellTargetType.ALLIES_AREA ||
                    this.currentActiveSpell.getSpellTargetType() === SpellTargetType.FREE_CELL
                ) {
                    const areaCell = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), p);
                    if (areaCell && this.castAreaSpellAtCell(areaCell)) {
                        return;
                    }
                    // Off-grid click — cancel the armed spell.
                    this.currentActiveSpell = undefined;
                    this.sc_sceneLog.updateLog("Spell cancelled");
                    this.buttonManager.refreshButtons(true);
                    return;
                }
                const spellTarget = this.getUnitAtPosition(p);
                if (spellTarget && !spellTarget.isDead()) {
                    const spellTargetType = this.currentActiveSpell.getSpellTargetType();
                    const aggrBlockedSpellTarget =
                        !spellTarget.hasBuffActive("Hidden") &&
                        (spellTargetType === SpellTargetType.ANY_ENEMY ||
                            spellTargetType === SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE)
                            ? this.isAttackBlockedByAggr(spellTarget, "spell")
                            : undefined;
                    if (aggrBlockedSpellTarget) {
                        this.showAggrBlockedActionHint(aggrBlockedSpellTarget);
                        return;
                    }
                    if (this.castSpellOnTarget(spellTarget)) {
                        return;
                    }
                    // Target invalid per spell rules — keep the spell armed for another pick. When a thrown
                    // spell's line is intercepted, say by WHOM: "for some reason it will not cast" is the
                    // difference between the player repositioning and the player filing a bug.
                    this.sc_sceneLog.updateLog(this.describeSpellRefusal(this.currentActiveSpell, spellTarget));
                    return;
                }
                // Clicked empty ground — cancel the armed spell.
                this.currentActiveSpell = undefined;
                this.sc_sceneLog.updateLog("Spell cancelled");
                this.buttonManager.refreshButtons(true);
                return;
            }

            // --- OBSTACLE ATTACK: striking the destructible center on BLOCK_CENTER maps. ---
            if (this.attemptObstacleAttack(p)) {
                return;
            }
            // A ranged shot whose line of sight is blocked by the mountain hits the mountain
            // instead of the enemy behind it (the hover step armed this).
            // With one scattered stone, Double Shot's hover leaves this unset because shot two can continue
            // to the unit. With two stones it is the SECOND intersection: route the click to obstacle_attack
            // so shot one destroys stone one and shot two destroys stone two. The previous blanket
            // "Double Shot + clicked unit" exemption sent this case into a rejected unit attack and left the
            // scene input-locked.
            if (this.hoverRangeAttackObstacle && this.attemptObstacleAttack(this.hoverRangeAttackObstacle.position)) {
                return;
            }

            // --- AREA THROW: Gargantuan-style AOE fired at a cell (incl. empty/terrain). ---
            if (this.attemptAreaThrowAttack(p)) {
                return;
            }

            const gs = this.sc_sceneSettings.getGridSettings();

            // Resolve this directly from the click position instead of waiting for hover()'s next
            // frame. A quick move-then-click therefore uses the same pointer-selected attack side
            // as the sword cursor and cannot degrade into a plain move.
            const pointerMeleeAttack = this.resolveUnitMeleeAttack(p);
            if (pointerMeleeAttack) {
                this.hoverManager.hoverAttackFromCell = pointerMeleeAttack.attackFrom;
            }

            // Unit Attack Interaction (melee and ranged)
            if (this.hoverManager.hoverAttackFromCell && this.currentActiveUnit) {
                const cell = GridMath.getCellForPosition(gs, p);
                if (cell) {
                    const occupantId = this.grid.getOccupantUnitId(cell);
                    // Prefer the visible creature body, then fall back to its occupied support cell.
                    const targetUnit =
                        this.getUnitSpriteAtPosition(p) ??
                        (occupantId ? this.unitsHolder.getAllUnits().get(occupantId) : undefined);
                    if (targetUnit) {
                        if (targetUnit.getTeam() !== this.currentActiveUnit.getTeam()) {
                            const attackFrom = this.hoverManager.hoverAttackFromCell;
                            const currentPos = this.currentActiveUnit.getPosition();

                            // Match the engine's melee rule on the click path too. This guards a rapid
                            // move-then-click from reusing a stale hover landing across an intervening cell.
                            // Range mode is intentionally exempt because it shoots from a non-adjacent cell.
                            if (
                                this.currentActiveUnit.getAttackTypeSelection() !== AttackVals.RANGE &&
                                !this.grid.areCellsAdjacent(
                                    this.currentActiveUnit.getFootprintCellsForBase(attackFrom),
                                    targetUnit.getCells(),
                                )
                            ) {
                                this.hoverManager.hoverAttackFromCell = undefined;
                                this.hoverManager.clearAttackVisuals();
                                return;
                            }

                            // Check if we need to move (attackFrom is different from current unit visual center/position)
                            // Note: For large units, getPosition() returns the anchor. attackFrom might be different even if same "logical" place?
                            // However, pathHelper usually returns specific anchor cell.
                            // Let's rely on pathfinding check or simple distance check.

                            // If standard adjacent attack without movement, just attack.
                            // If attackFrom is far, we need a path.
                            // Distance check to prevent zero-length moves (more robust than isSameCell)
                            // currentPos is already defined in outer scope
                            // attackFrom is the footprint's ANCHOR cell, while the unit's position is the
                            // centre of its whole body. Comparing currentPos to the raw cell centre left a
                            // static multi-cell RANGED attacker (Tsar Cannon, Gargantuan) reading as "needs
                            // to move", so it searched for a route to its own cell, found none, and
                            // silently never fired.
                            const attackPosition = this.footprintCenterForAnchor(this.currentActiveUnit, attackFrom);
                            const isAtTarget =
                                Math.abs(currentPos.x - attackPosition.x) < 0.1 &&
                                Math.abs(currentPos.y - attackPosition.y) < 0.1;

                            // In authoritative-replay (ranked) mode a melee_attack action already
                            // carries the move `path`, so the server moves-and-attacks in a single
                            // action. Splitting into a standalone move_unit + a later attack made the
                            // server treat the move as the unit's whole turn and skip the strike
                            // ("moved to (x,y)" then "skips turn"). Submit the combined action here.
                            const deferMoveAttackToServer = this.shouldDeferActionToAuthoritativeReplay({
                                type: "melee_attack",
                                attackerId: this.currentActiveUnit.getId(),
                                targetId: targetUnit.getId(),
                                attackFrom,
                            });
                            if (isAtTarget || deferMoveAttackToServer) {
                                // No movement needed (already at attack spot), or the server will
                                // perform the move as part of the combined melee_attack action.
                                this.executeAttackSequence(
                                    this.currentActiveUnit,
                                    targetUnit as RenderableUnit,
                                    attackFrom,
                                );
                            } else {
                                // Movement needed!
                                // Large Unit Logic (Adapted from test_heroes.ts "AI" working logic)
                                if (!this.currentActiveUnit.isSmallSize()) {
                                    const key = (attackFrom.x << 4) | attackFrom.y;
                                    const routes = this.currentActiveKnownPaths?.get(key);

                                    if (routes && routes.length > 0) {
                                        const route = routes[0].route;

                                        // The body the unit will occupy once it has walked there: attackFrom
                                        // is the anchor, so the footprint hangs down-left from it — the same
                                        // cells the engine occupies when it resolves this attack.
                                        const candidate = this.currentActiveUnit.getFootprintCellsForAnchor(attackFrom);

                                        this.executeMoveSequence(
                                            this.currentActiveUnit,
                                            route, // Use the actual route!
                                            candidate, // overrideFootprint
                                            () => {
                                                if (this.currentActiveUnit) {
                                                    this.executeAttackSequence(
                                                        this.currentActiveUnit,
                                                        targetUnit as RenderableUnit,
                                                        attackFrom,
                                                    );
                                                }
                                            },
                                            undefined, // replayAction
                                            true, // rapidCharge — this walk feeds into a melee strike
                                        );
                                    } else {
                                        console.warn(
                                            "Large Unit Move-Attack: no authorized route found in known paths.",
                                        );
                                    }
                                } else {
                                    // Small Unit Logic (Route based)
                                    const key = (attackFrom.x << 4) | attackFrom.y;
                                    const routes = this.currentActiveKnownPaths?.get(key);
                                    let route: HoCMath.XY[] | undefined;

                                    if (routes && routes.length > 0) {
                                        route = routes[0].route;
                                    }

                                    if (route && route.length > 0) {
                                        this.executeMoveSequence(
                                            this.currentActiveUnit,
                                            route,
                                            undefined,
                                            () => {
                                                if (this.currentActiveUnit) {
                                                    this.executeAttackSequence(
                                                        this.currentActiveUnit,
                                                        targetUnit as RenderableUnit,
                                                        attackFrom,
                                                    );
                                                }
                                            },
                                            undefined, // replayAction
                                            true, // rapidCharge — this walk feeds into a melee strike
                                        );
                                    } else {
                                        console.warn("Move-Attack: no authorized route found in known paths.");
                                    }
                                }
                            }

                            return;
                        }
                    }
                }
            }
            if (this.currentActiveUnit && this.currentActiveKnownPaths && !this.sc_moveBlocked) {
                const cell = GridMath.getCellForPosition(gs, p);
                if (!cell) return;
                const currentPos = this.currentActiveUnit.getPosition();
                if (!this.currentActiveUnit.isSmallSize()) {
                    const candidate = this.hoverManager.findLargeUnitMoveCandidate(cell);
                    if (!candidate) return;
                    // Any rectangle the candidate finder returns has an anchor and therefore a centre, so
                    // the destination is never optional here.
                    const anchor = GridMath.getFootprintAnchorForCells(candidate);
                    if (!anchor) return;
                    const targetPos = this.footprintCenterForAnchor(this.currentActiveUnit, anchor);
                    if (Math.abs(currentPos.x - targetPos.x) < 0.1 && Math.abs(currentPos.y - targetPos.y) < 0.1) {
                        console.log("Move target is same as current position. Ignoring.");
                        return;
                    }
                    // A footprint-only move animates as a straight A->B line, cutting across whatever
                    // lies between — on the Mountains map that reads as walking/flying THROUGH the
                    // rocks. Use the real route (keyed by the footprint's anchor = max corner) when it
                    // exists: walkers always follow it; flyers keep their straight glide unless the
                    // straight segment would cross a standing rock.
                    const route = this.currentActiveKnownPaths.get((anchor.x << 4) | anchor.y)?.[0]?.route;
                    const wantsRoute =
                        !!route?.length &&
                        (!this.currentActiveUnit.canFly() ||
                            this.straightSegmentBlockedForFlyer(this.currentActiveUnit, currentPos, targetPos));
                    if (wantsRoute && route) {
                        this.executeMoveSequence(this.currentActiveUnit, route, candidate);
                    } else {
                        this.executeMoveSequence(this.currentActiveUnit, candidate, candidate);
                    }
                    return;
                } else {
                    if (!this.hoverManager.isCellReachableForActiveUnit(cell)) return;
                    // The cell came from an unclamped floor-divide of a pointer position, and the cell hash
                    // packs four bits per axis — an off-board y = 16 aliases onto the real cell (x | 1, 0),
                    // which would run a route the player never aimed at.
                    if (!GridMath.isCellWithinGrid(gs, cell)) return;
                    const key = (cell.x << 4) | cell.y;
                    const routes = this.currentActiveKnownPaths.get(key);
                    if (routes && routes.length > 0) {
                        const route = routes[0].route;
                        if (route.length > 0) {
                            const destCell = route[route.length - 1];
                            const targetPos = GridMath.getPositionForCell(
                                destCell,
                                gs.getMinX(),
                                gs.getStep(),
                                gs.getHalfStep(),
                            );
                            const dx = Math.abs(currentPos.x - targetPos.x);
                            const dy = Math.abs(currentPos.y - targetPos.y);
                            if (dx < 0.1 && dy < 0.1) {
                                console.log("Move target is same as current position. Ignoring.");
                                return;
                            }
                        }
                        this.executeMoveSequence(this.currentActiveUnit, route);
                        return;
                    }
                }
            }
            return;
        }
        // 2. PRE-FIGHT PLACEMENT INTERACTION
        if (this.handlePlacementBenchToggleAt(p)) {
            return;
        }
        const unitUnderMouse = this.getUnitAtPosition(p);
        if (unitUnderMouse && !this.canSelectUnitForPlacement(unitUnderMouse)) {
            this.clearBoardSelection();
            this.Deselect(false, true);
            return;
        }
        const isSameBenchSelection =
            unitUnderMouse &&
            this.draggingUnitId === unitUnderMouse.getId() &&
            this.placementBenchHitBoxes.has(unitUnderMouse.getId());
        if (isSameBenchSelection) {
            return;
        }
        // Allow switching selection to another unit immediately, instead of trying to place and failing
        const isSwitchingSelection =
            unitUnderMouse && (!this.draggingUnitId || unitUnderMouse.getId() !== this.draggingUnitId);

        if (this.hasActiveSelection && this.sc_selectedUnitProperties && !isSwitchingSelection) {
            this.hoverManager.updateHoverPlacementCell(p);
            if (
                !this.hoverManager.hoverSelectedCells ||
                this.hoverManager.hoverSelectedCells.length === 0 ||
                this.hoverManager.hoverSelectedCellsSwitchToRed
            ) {
                if (!this.selectionFromOverlay) {
                    if (this.selectedBoardUnit) {
                        this.selectedBoardUnit.setBoardSelected(false);
                        this.selectedBoardUnit = undefined;
                    }
                    this.clearBoardSelection();
                    this.Deselect(false, true);
                    return;
                }
                return;
            }
            this.tryPlaceUnit();
            return;
        }

        // 3. UNIT SELECTION (Clicking a unit on board)
        const unit = unitUnderMouse;
        if (unit) {
            const ru = unit as RenderableUnit;
            if (this.selectedBoardUnit && this.selectedBoardUnit !== ru) {
                this.selectedBoardUnit.setBoardSelected(false);
            }
            this.selectedBoardUnit = ru;
            this.selectedBoardUnit.setBoardSelected(true);
            const props = unit.getUnitProperties();
            this.hoverManager.setLastPlacement(undefined);
            this.hasActiveSelection = true;
            this.selectionFromOverlay = false;
            this.draggingUnitId = unit.getId();
            this.draggingUnitTeam = unit.getTeam();
            this.placementDragPointerOrigin = { ...p };
            this.placementDragPointerMoved = false;
            this.sc_selectedUnitProperties = props;
            this.setSelectedUnitProperties(props);
            this.hoverManager.resetBoardHoverState();
            // At press time the copy sits exactly behind the live unit. Using `p` here selected the grid
            // cell under the clicked torso/head, which could place the copy one cell away before a drag.
            this.hoverManager.updateHoverPlacementCell(unit.getPosition());

            // Force immediate visual update to show ranges instantly
            this.gameplayGraphics?.clear();
            this.hover(); // Recalculate ranges/paths based on new selection
            if (this.gameplayGraphics) {
                this.drawGameplayVisuals(this.gameplayGraphics);
            }
            return;
        }
        super.MouseDown(p);
    }
    /** Close the spellbook overlay and clear its blur filter. */
    private closeSpellBook(): void {
        if (!this.sc_renderSpellBookOverlay) {
            return;
        }
        this.setHoveredSpell(undefined);
        this.sc_renderSpellBookOverlay = false;
        this.buttonManager.sc_renderSpellBookOverlay = false;
        this.spellBookOverlay?.setOpen(false);
        // Hide the book + its spell cells immediately (they live under spellBookContainer) and
        // drop the dim/blur filter, so the overlay is gone this frame rather than next render.
        if (this.spellBookContainer) {
            this.spellBookContainer.visible = false;
        }
        this.pixiApp.getWorldRoot().filters = [];
    }
    private setHoveredSpell(spell: PixiRenderableSpell | undefined, caster?: RenderableUnit): void {
        if (this.hoveredSpell !== spell) {
            this.hoveredSpell?.setHighlighted(false);
            spell?.setHighlighted(true);
            this.hoveredSpell = spell;
        }
        this.setSpellHoverInfo(spell, caster);
    }
    private setSpellHoverInfo(spell: PixiRenderableSpell | undefined, caster?: RenderableUnit): void {
        const lines =
            spell && caster
                ? spell.getHoverInfo(
                      caster.getStackPower(),
                      caster.getAmountAlive(),
                      caster.getCumulativeMaxHp(),
                      caster.getLuck(),
                      caster.getMagicDamageBonusPercentage(),
                  )
                : [];
        const key = lines.join("\n");
        if (this.spellHoverInfoKey === key) return;

        this.spellHoverInfoKey = key;
        this.sc_attackDamageSpreadStr = "";
        this.sc_attackRangeDamageDivisorStr = "";
        this.sc_attackKillSpreadStr = "";
        this.sc_hoverUnitNameStr = "";
        this.sc_hoverUnitLevel = 0;
        this.sc_hoverUnitMovementType = MovementVals.NO_MOVEMENT;
        this.sc_selectedAttackType = AttackVals.NO_ATTACK;
        this.sc_hoverInfoArr = lines;
        this.sc_hoverTextUpdateNeeded = true;
    }
    /**
     * Map a world-space point to global/screen space for spell hit-testing. The spellbook is
     * attached to the UI container, so spell hover/pick compares this
     * against each icon's global getBounds().
     */
    private spellbookGlobalFromWorld(worldPos: HoCMath.XY): HoCMath.XY {
        // isHover() hit-tests against each icon's global getBounds(), so return the click in
        // global (screen) space to match.
        return this.pixiApp.worldToScreen(worldPos.x, worldPos.y);
    }
    /**
     * Handle a click while the spellbook overlay is open.
     * - Single-target spell (ANY_ALLY / ANY_ENEMY / ANY_UNIT / ENEMY_WITHIN_MOVEMENT_RANGE):
     *   arm it and close the book; the next board click on a unit casts it (see castSpellOnTarget).
     * - Click outside the spells: just close the book.
     * - Cell-target spells (ALLIES_AREA: Craft, FREE_CELL: Smoke): arm and close the book; the next board
     *   click resolves to a CELL and casts on that 2x2 (see castAreaSpellAtCell).
     * - Mass-cast / summon apply immediately. AUTO / NO_TYPE are still unwired and log a notice.
     */
    private handleSpellbookClick(worldPos: HoCMath.XY): void {
        const caster = this.currentActiveUnit;
        const hovered =
            caster instanceof RenderableUnit
                ? caster.getHoveredSpell(this.spellbookGlobalFromWorld(worldPos), true)
                : undefined;
        if (!hovered || !caster) {
            this.closeSpellBook();
            return;
        }

        if (!hovered.canUse(caster.getStackPower())) {
            this.setHoveredSpell(hovered, caster);
            // Say WHICH gate refused the pick — "is unavailable" alone reads as a bug when the card
            // sits right there in the book (the ranked Vine Throw report).
            const minPower = hovered.getMinimalCasterStackPower();
            this.sc_sceneLog.updateLog(
                caster.getStackPower() < minPower
                    ? `${hovered.getName()} needs stack power ${minPower} — ${caster.getName()} has ${caster.getStackPower()}`
                    : `${hovered.getName()} has no casts left`,
            );
            return;
        }

        const targetType = hovered.getSpellTargetType();
        const isSingleTarget =
            targetType === SpellTargetType.ANY_ALLY ||
            targetType === SpellTargetType.ANY_ENEMY ||
            targetType === SpellTargetType.ANY_UNIT ||
            targetType === SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE;

        const isMassOrSummon =
            targetType === SpellTargetType.RANDOM_CLOSE_TO_CASTER ||
            targetType === SpellTargetType.ALL_FLYING ||
            targetType === SpellTargetType.ALL_ALLIES ||
            targetType === SpellTargetType.ALL_ENEMIES;

        // Cell-target spells arm like single-target spells, but the next board click resolves to a CELL
        // rather than a unit: ALLIES_AREA (Craft) reads the 2x2 footprint's top-left, and FREE_CELL
        // (Smoke) reads the bottom-left of the 2x2 it smokes.
        const isAreaTarget = targetType === SpellTargetType.ALLIES_AREA || targetType === SpellTargetType.FREE_CELL;

        if (!isSingleTarget && !isAreaTarget) {
            this.closeSpellBook();
            if (isMassOrSummon && this.currentActiveUnit instanceof RenderableUnit) {
                // Mass-cast / summon spells apply immediately (no target click needed).
                this.castMassOrSummonSpell(hovered, this.currentActiveUnit);
            } else {
                // FREE_CELL / AUTO / NO_TYPE are not wired yet (see PIXI_GAMEPLAY_PARITY_PLAN.md).
                this.sc_sceneLog.updateLog(`${hovered.getName()}: this spell type is not supported yet`);
            }
            return;
        }

        // Arm the spell; the next board click on a valid unit casts it.
        this.currentActiveSpell = hovered;
        this.closeSpellBook();
        this.sc_sceneLog.updateLog(`${caster.getName()} prepares ${hovered.getName()} - pick a target`);

        // A rotatable footprint always opens on its default lay, never on last cast's angle, and the player
        // is told how to turn it — the gesture is not discoverable otherwise.
        if (this.isRotatableAreaSpell(hovered)) {
            this.fireWallAimOrientation = FireWallHelper.FireWallOrientation.HORIZONTAL;
            this.sc_sceneLog.updateLog("Hold Shift to rotate the wall");
        }

        // Switch to the MAGIC attack type (parity with legacy) so the toolbar shows the scepter and
        // the melee hover/attack positions are suppressed while a spell is armed.
        if (
            this.applyGameAction({ type: "select_attack_type", unitId: caster.getId(), attackType: AttackVals.MAGIC })
        ) {
            this.sc_selectedAttackType = caster.getAttackTypeSelection();
        }

        // Recompute movement/targeting paths now that a spell is armed (parity with legacy).
        const currentCell = caster.getBaseCell();
        if (currentCell) {
            this.updateCurrentMovePath(currentCell);
        }

        // Castling (ENEMY_WITHIN_MOVEMENT_RANGE) swaps the caster with a small enemy inside its
        // movement range. canCastSpell — and thus the hover highlight + cast validation — needs the
        // list of those enemies' base cells, so compute it here (parity with the legacy arming path).
        this.currentEnemiesCellsWithinMovementRange = undefined;
        if (currentCell && targetType === SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE && caster.canMove()) {
            const moveCells = this.pathHelper.getMovePath(
                currentCell,
                this.gridMatrixNoUnits,
                caster.getSteps(),
                undefined,
                caster.canFly(),
                caster.isSmallSize(),
                caster.canTraverseLava(),
                caster.hasAbilityActive("In Its Own World"),
                caster.getFootprintWidth(),
                caster.getFootprintHeight(),
            ).cells;
            const enemies: HoCMath.XY[] = [];
            for (const c of moveCells) {
                const enemyId = this.grid.getOccupantUnitId(c);
                if (!enemyId) continue;
                const enemy = this.unitsHolder.getAllUnits().get(enemyId);
                if (!enemy || enemy.getTeam() === caster.getTeam() || !enemy.isSmallSize()) continue;
                enemies.push(enemy.getBaseCell());
            }
            this.currentEnemiesCellsWithinMovementRange = enemies.length ? enemies : undefined;
        }

        // Refresh the toolbar so the spellbook button shows the armed spell's icon immediately.
        this.buttonManager.refreshButtons(true);
    }
    /**
     * Cast the currently-armed single-target spell on `targetUnit` via the shared magic-attack
     * handler (handles heal / resurrect / buff / debuff, magic-resist rolls, and spell consumption).
     * Returns true if the spell was applied (turn finished), false if the target was invalid.
     */
    /**
     * The scene-log line for a refused single-target cast. A thrown spell (Vine Throw, Fire Strike …)
     * most often fails on line of sight, and the generic "Cannot cast X on Y" reads as a bug when the
     * interceptor is a third body two cells away — so name the blocker when there is one.
     */
    private describeSpellRefusal(spell: Spell, targetUnit: Unit): string {
        const caster = this.currentActiveUnit;
        const casterCell = caster?.getBaseCell();
        const targetCell = targetUnit.getBaseCell();
        if (caster && casterCell && targetCell) {
            const blockerId = targetedSpellBlockerId(
                spell.getName(),
                this.grid,
                casterCell,
                targetCell,
                this.throwTransparency(spell.getName(), caster),
            );
            if (blockerId) {
                const blockerName = this.unitsHolder.getAllUnits().get(blockerId)?.getName();
                return `${spell.getName()} is blocked by ${blockerName ?? "an obstacle"}`;
            }
        }
        return `Cannot cast ${spell.getName()} on ${targetUnit.getName()}`;
    }
    private castSpellOnTarget(targetUnit: Unit): boolean {
        const caster = this.currentActiveUnit;
        const spell = this.currentActiveSpell;
        if (!spell || !caster) {
            return false;
        }
        if (
            !isTargetedSpellReachable(
                spell.getName(),
                this.grid,
                caster.getBaseCell(),
                targetUnit.getBaseCell(),
                this.throwTransparency(spell.getName(), caster),
            )
        ) {
            return false;
        }

        // Castling (POSITION_CHANGE) swaps caster↔target. The engine teleports both instantly, so
        // capture their pre-swap positions and animate them arcing to their new cells afterwards.
        const isSwap = spell.getPowerType() === SpellPowerType.POSITION_CHANGE;
        const oldCasterPos = isSwap ? { ...caster.getPosition() } : undefined;
        const oldTargetPos = isSwap ? { ...targetUnit.getPosition() } : undefined;

        // Where the caster stands BEFORE the cast — the origin a thrown spell's projectile flies from.
        const casterPosBeforeCast = { ...caster.getPosition() };

        const action: GameAction = {
            type: "cast_spell",
            casterId: caster.getId(),
            spellName: spell.getName(),
            targetId: targetUnit.getId(),
            targetCell: targetUnit.getBaseCell(),
        };
        if (this.shouldDeferActionToAuthoritativeReplay(action)) {
            return this.submitActionForAuthoritativeReplay(action);
        }
        const unitSnapshot = this.snapshotRenderableUnits();
        const result = this.createActionEngine().apply(action);
        if (!result.completed) {
            return false;
        }
        caster.faceBoardTarget(targetUnit.getPosition());
        if (caster.hasAnimationState("cast")) {
            caster.playOneShotAnimation("cast");
        }
        // Heal numbers + restorative burst. Shared with the ranked replay path (see renderHealVfx).
        this.renderHealVfx(result.events);
        // Fire Strike's fireball + damage number. Same sharing rule as the heal above.
        this.renderSpellDamageVfx(result.events, casterPosBeforeCast);
        // Wild Regeneration's delivered card, shared with the authoritative replay path above.
        this.spawnAbilityTransferVfx(result.events, unitSnapshot);

        if (isSwap && oldCasterPos && oldTargetPos) {
            // Clear armed-spell state now; the turn ends when the swap animation finishes.
            this.currentActiveSpell = undefined;
            this.currentEnemiesCellsWithinMovementRange = undefined;
            this.hoverManager.clearHoverSilhouette();
            this.hoverManager.clearAttackVisuals();
            this.hoverManager.hoverAttackFromCell = undefined;
            this.sc_moveBlocked = true;
            this.sc_visibleStateUpdateNeeded = true;
            this.unitsHolder.refreshStackPowerForAllUnits();
            this.moveAnimManager.startSwapAnimation(
                caster,
                oldCasterPos,
                caster.getPosition(),
                targetUnit as RenderableUnit,
                oldTargetPos,
                targetUnit.getPosition(),
                () => {
                    this.sc_moveBlocked = false;
                    this.applyTurnEngineEvents(result.events, unitSnapshot);
                },
            );
            return true;
        }

        this.cleanupAfterSpell(result.events, unitSnapshot);
        // Craft and the Runes report their roll on the event; renderCastOutcomes turns it into the pop.
        this.renderCastOutcomes(result.events);
        return true;
    }
    /**
     * Play the Armor Rune / Weapon attempt->resolve VFX on the target and, on success, flash it. Success is
     * detected by the buff's running +N total having risen past its pre-cast value.
     */
    /**
     * Render a cast's per-target ROLL from the authoritative event.
     *
     * Craft and the Runes resolve by dice, not by state change, so two of their outcomes — Craft's "nothing"
     * and a failed rune — leave the board untouched. That made them invisible to a snapshot diff and unsafe
     * to re-derive in a ranked replay, which re-runs with unseeded RNG and would show each player a different
     * answer. The engine now states the roll on `spell_cast.outcomes`, so this reads the server's result and
     * is correct on BOTH sides: sandbox passes its own local events, ranked passes the authoritative record.
     *
     * Stun deliberately pops nothing here — the generic effect diff (reconcileEffectVisuals in sandbox,
     * processDebuffPops in ranked) already pops a newly gained Stun, and popping it again would double it.
     */
    protected renderCastOutcomes(events: readonly GameEvent[] | undefined): void {
        for (const event of events ?? []) {
            if (event.type !== "spell_cast" || !event.outcomes?.length) {
                continue;
            }
            for (const entry of event.outcomes) {
                const unit = this.unitsHolder.getAllUnits().get(entry.unitId) as RenderableUnit | undefined;
                if (!unit || unit.isDead()) {
                    continue;
                }
                switch (entry.outcome) {
                    case "double":
                    case "frozen":
                        // Each ally is a DISTINCT unit at its own position, so every pop uses stackIndex 0.
                        if (entry.grantedAbility) {
                            this.popAbilityOnUnit(unit, entry.grantedAbility, 0);
                        }
                        break;
                    case "stun":
                        break;
                    case "nothing":
                        this.combatVisuals?.showCraftFail(
                            unit.getVisualCenter(this.sc_sceneSettings.getGridSettings()),
                        );
                        break;
                    case "enchanted":
                    case "failed":
                        this.showEnchantResult(unit, event.spellName, entry.outcome === "enchanted", entry.amount);
                        break;
                    default:
                        break;
                }
            }
        }
    }
    /** The rune's attempt->resolve flourish, driven by the server's roll rather than a before/after diff. */
    private showEnchantResult(target: RenderableUnit, spellName: string, success: boolean, total?: number): void {
        const isArmor = spellName === "Armor Rune";
        const iconTexture = this.texAny(isArmor ? "armor_rune_256" : "weapon_rune_256");
        if (!iconTexture) {
            return;
        }
        if (success) {
            target.flashBuffApplied();
        }
        this.combatVisuals?.spawnEnchantResult(
            target.getVisualCenter(this.sc_sceneSettings.getGridSettings()),
            this.sc_sceneSettings.getGridSettings().getCellSize(),
            {
                tint: isArmor ? 0x59b6ff : 0xff7a3c,
                iconTexture,
                label: success ? `+${total ?? 1} ${isArmor ? "armor" : "attack"}` : "Failed",
                success,
            },
        );
    }
    /**
     * Whether the armed spell's footprint can be turned before it is placed. Only Fire Wall's 3-cell line
     * today; Craft's and Smoke's 2x2 blocks are rotationally symmetric, so there is nothing to turn.
     */
    private isRotatableAreaSpell(spell?: PixiRenderableSpell): boolean {
        return spell?.getName() === "Fire Wall";
    }
    /**
     * Turn the armed Fire Wall a quarter-turn. Bound to Shift (both the key and a shift-click) while the
     * spell is armed — see ShiftKey/ShiftMouseDown. A no-op for anything else that happens to be armed, so
     * Shift keeps its normal inspect behaviour everywhere else.
     */
    private rotateFireWallAim(): boolean {
        if (!this.isRotatableAreaSpell(this.currentActiveSpell)) {
            return false;
        }
        this.fireWallAimOrientation = FireWallHelper.nextFireWallOrientation(this.fireWallAimOrientation);
        return true;
    }
    /**
     * Cast the currently-armed CELL-target spell on the clicked cell — Craft (ALLIES_AREA), Smoke and Fire
     * Wall (FREE_CELL) all resolve to a footprint read off `targetCell`, so they share this path. The engine
     * owns what that footprint means: Craft resolves the allies inside its 2x2, Smoke smokes whichever of
     * those four cells are free, Fire Wall lights the 3-cell line at the orientation the player rotated to.
     * Returns true if the cast was applied (turn finished), false if the engine rejected it (e.g.
     * insufficient stack power, or a cell in the footprint occupied).
     */
    private castAreaSpellAtCell(cell: HoCMath.XY): boolean {
        const caster = this.currentActiveUnit;
        const spell = this.currentActiveSpell;
        if (!spell || !caster) {
            return false;
        }

        const casterPos = { ...caster.getPosition() };
        const gs = this.sc_sceneSettings.getGridSettings();

        const action: GameAction = {
            type: "cast_spell",
            casterId: caster.getId(),
            spellName: spell.getName(),
            targetCell: cell,
            // Only meaningful for a rotatable footprint; left off entirely for Craft and Smoke so their
            // actions serialize exactly as they did before the field existed.
            ...(this.isRotatableAreaSpell(spell) ? { targetOrientation: this.fireWallAimOrientation } : {}),
        };
        if (this.shouldDeferActionToAuthoritativeReplay(action)) {
            return this.submitActionForAuthoritativeReplay(action);
        }
        const unitSnapshot = this.snapshotRenderableUnits();
        const result = this.createActionEngine().apply(action);
        if (!result.completed) {
            this.sc_sceneLog.updateLog(`Cannot cast ${spell.getName()} here`);
            return false;
        }
        const castTargetPosition = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        if (castTargetPosition) {
            caster.faceBoardTarget(castTargetPosition);
        }
        if (caster.hasAnimationState("cast")) {
            caster.playOneShotAnimation("cast");
        }
        // Mass heal: one "+N" per ally the cast actually restored. Shared with the ranked replay path.
        this.renderHealVfx(result.events);
        // Meteorite's impact burst + one damage number per enemy caught under the 2x2.
        this.renderSpellDamageVfx(result.events, casterPos);

        // Craft-only theatrics: the forge cast (anvil + hammer) over the selected 2x2, then each ally's
        // crafted result once it finishes. Gated on the spell — Smoke shares this cast path but has no
        // forge and no per-ally outcome, and playing the anvil over a Wandering Mage would be nonsense. Its own
        // visual is the ground cloud, which SmokeCloudLayer picks up from the authoritative store.
        if (spell.getName() === "Craft") {
            const forgePos = this.getAreaSpellVisualCenter(spell.getName(), cell) ?? caster.getVisualCenter(gs);
            const forgeMs =
                this.combatVisuals?.spawnCraftForge(forgePos, this.sc_sceneSettings.getGridSettings().getCellSize()) ??
                0;
            this.cleanupAfterSpell(result.events, unitSnapshot);
            setTimeout(() => this.renderCastOutcomes(result.events), forgeMs + 80);
            return true;
        }
        this.cleanupAfterSpell(result.events, unitSnapshot);
        return true;
    }
    /**
     * Shared post-cast cleanup: remove units killed by the spell, refresh stacks, clear the
     * armed spell + hover visuals, and end the caster's turn.
     */
    private cleanupAfterSpell(
        commonEvents?: GameEvent[],
        unitSnapshot: ReadonlyMap<string, RenderableUnit> = this.snapshotRenderableUnits(),
    ): void {
        const unitsDied: RenderableUnit[] = [];
        for (const u of this.unitsHolder.getAllUnits().values()) {
            if (u.isDead()) {
                unitsDied.push(u as RenderableUnit);
            }
        }
        if (unitsDied.length > 0) {
            this.destroySpecificUnits(unitsDied, true, true);
        }
        this.unitsHolder.refreshStackPowerForAllUnits();

        this.currentActiveSpell = undefined;
        this.currentEnemiesCellsWithinMovementRange = undefined;
        this.hoverManager.clearHoverSilhouette();
        this.hoverManager.clearAttackVisuals();
        this.hoverManager.hoverAttackFromCell = undefined;
        this.sc_moveBlocked = false;
        this.sc_visibleStateUpdateNeeded = true;
        if (commonEvents) {
            this.applyTurnEngineEvents(commonEvents, unitSnapshot);
        } else {
            this.finishTurn();
        }
    }
    /**
     * Apply a mass-cast spell (ALL_ALLIES / ALL_ENEMIES / ALL_FLYING) or a summon spell
     * (RANDOM_CLOSE_TO_CASTER) immediately on selection. Ports the legacy dispatch
     * (test_heroes.ts:3771-4007). Ends the turn if anything was applied.
     */
    private castMassOrSummonSpell(spell: PixiRenderableSpell, caster: RenderableUnit): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const team = caster.getTeam();

        // 1. Summon path (e.g. RANDOM_CLOSE_TO_CASTER summon spells).
        // Seat the summon with the body it will actually have: Summon Wolves spawns a 2x1 Wolf, and the
        // engine refuses an EXPLICIT cell that cannot hold it rather than re-routing, so validating the
        // random draw as a 1x1 silently loses the player's cast. The draw is still preferred whenever it
        // fits, which is every 1x1 summon.
        const randomCell = SpellHelper.resolveSummonAnchor(
            spell,
            this.gridMatrix,
            GridMath.getCellsAroundFootprint(gs, caster.getCells()),
            GridMath.getRandomGridCellAroundPosition(gs, this.gridMatrix, team, caster.getPosition()),
        );
        const amountToSummon = Math.floor(caster.getAmountAlive() * spell.getPower());
        if (amountToSummon > 0 && randomCell) {
            const action: GameAction = {
                type: "cast_spell",
                casterId: caster.getId(),
                spellName: spell.getName(),
                targetCell: randomCell,
            };
            if (this.shouldDeferActionToAuthoritativeReplay(action)) {
                this.submitActionForAuthoritativeReplay(action);
                return;
            }
            const unitSnapshot = this.snapshotRenderableUnits();
            const result = this.createActionEngine().apply(action);
            if (result.completed) {
                if (caster.hasAnimationState("cast")) {
                    caster.playOneShotAnimation("cast");
                }
                this.cleanupAfterSpell(result.events, unitSnapshot);
            } else {
                this.sc_sceneLog.updateLog(result.message ?? `Cannot cast ${spell.getName()}`);
                this.currentActiveSpell = undefined;
            }
            return;
        }

        // 2. Mass-cast path (buff allies / debuff enemies / buff flyers).
        if (
            spell.getSpellTargetType() === SpellTargetType.ALL_FLYING ||
            spell.getSpellTargetType() === SpellTargetType.ALL_ALLIES ||
            spell.getSpellTargetType() === SpellTargetType.ALL_ENEMIES
        ) {
            const action: GameAction = {
                type: "cast_spell",
                casterId: caster.getId(),
                spellName: spell.getName(),
            };
            if (this.shouldDeferActionToAuthoritativeReplay(action)) {
                this.submitActionForAuthoritativeReplay(action);
                return;
            }
            const unitSnapshot = this.snapshotRenderableUnits();
            const result = this.createActionEngine().apply(action);
            if (result.completed) {
                if (caster.hasAnimationState("cast")) {
                    caster.playOneShotAnimation("cast");
                }
                this.cleanupAfterSpell(result.events, unitSnapshot);
            } else {
                this.sc_sceneLog.updateLog(`Cannot cast ${spell.getName()}`);
                this.currentActiveSpell = undefined;
            }
            return;
        }

        // 3. Nothing applicable — cancel quietly.
        this.sc_sceneLog.updateLog(`Cannot cast ${spell.getName()}`);
        this.currentActiveSpell = undefined;
    }
    /**
     * Attack the destructible center mountains (BLOCK_CENTER). A mountain is a plain 2x2 footprint,
     * so melee targeting REUSES the unit-vs-unit machinery verbatim: its attack cells come from the
     * same attackMeleeAllowed pass as enemy units (canAttackMountainTargets, built in
     * updateCurrentMovePath) and the landing under the cursor is resolved by the same
     * pathHelper.calculateClosestAttackFrom. Ranged units shoot in place. Returns true if a hit was
     * initiated (turn consumed).
     */
    /**
     * How the active unit would strike the mountain under `worldPos`, or undefined if it cannot.
     *
     * Split out of attemptObstacleAttack so the CURSOR and the CLICK are decided by one function. The
     * themed sword/bow cursor is a promise that a click will land a hit; when the two were worked out
     * separately the mountain read as plain terrain — no attack cursor at all — right up until the click
     * that damaged it. The melee branch resolves its attack-from cell here rather than leaving it to the
     * caller: a sword cursor over a mountain the unit cannot actually reach is exactly the false promise
     * this is meant to remove.
     */
    /** The pointer may target only an obstacle cell that still exists, never another cell behind it. */
    private isStandingAttackObstacleCell(cell: HoCMath.XY): boolean {
        const standingCells = this.grid.hasScatteredMountains()
            ? this.grid.getScatteredMountainsStanding()
            : this.grid.getCenterCells();
        return standingCells.some((standing) => standing.x === cell.x && standing.y === cell.y);
    }
    /** Shared hover gate for both fixed center mountains and independently destructible cemetery barrels. */
    private hasStandingShotBlockingObstacle(): boolean {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.getGridType() !== GridVals.BLOCK_CENTER) return false;
        return this.grid.hasScatteredMountains()
            ? this.grid.getScatteredMountainsStanding().length > 0
            : fightProps.getObstacleHitsLeft() > 0;
    }
    private resolveObstacleAttack(
        worldPos: HoCMath.XY,
    ):
        | { unit: RenderableUnit; attackType: AttackType; targetPosition: HoCMath.XY; attackFrom?: HoCMath.XY }
        | undefined {
        const unit = this.currentActiveUnit;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const gs = this.sc_sceneSettings.getGridSettings();
        const hoveredCell = GridMath.getCellForPosition(gs, worldPos);
        if (!hoveredCell || !this.isStandingAttackObstacleCell(hoveredCell)) {
            return undefined;
        }
        // Always aim at the authored obstacle cell centre. Hover previews already use this point;
        // forwarding the raw pointer position on click could trace through a neighbouring barrel
        // when two obstacles touch, so the red silhouette and the barrel damaged by the engine diverged.
        const targetPosition = GridMath.getPositionForCell(hoveredCell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        const obstacleHitsLeft = this.grid.hasScatteredMountains()
            ? this.grid.getScatteredMountainsStanding().length
            : fightProps.getObstacleHitsLeft();
        const kind = obstacleAttackKind({
            hasActiveUnit: !!unit,
            gridType: fightProps.getGridType(),
            obstacleHitsLeft,
            isCenterCell: () => this.isStandingAttackObstacleCell(hoveredCell),
            attackTypeSelection: unit?.getAttackTypeSelection() ?? AttackVals.MELEE,
            canLandRangeHit: () =>
                !!unit &&
                this.attackHandler.canLandRangeAttack(unit, this.grid.getEnemyAggrMatrixByUnitId(unit.getId())),
        });
        if (!unit || kind === "none") {
            return undefined;
        }
        if (kind === "range") {
            // A shot at the mountain needs no attack-from cell: the unit fires from where it stands.
            return { unit, attackType: AttackVals.RANGE, targetPosition };
        }
        const attackFrom = this.resolveMountainAttackFrom(worldPos);
        if (!attackFrom) {
            return undefined;
        }
        return { unit, attackType: AttackVals.MELEE, targetPosition, attackFrom };
    }
    /**
     * Pointer-driven unit melee target resolution. The same result feeds the cursor, hover preview,
     * and click path, so sliding across different cells of a large target chooses the matching side
     * without ever advertising an attack that the engine's precomputed target set rejects.
     */
    private resolveUnitMeleeAttack(
        worldPos: HoCMath.XY,
    ): { unit: RenderableUnit; target: Unit; attackFrom: HoCMath.XY } | undefined {
        const unit = this.currentActiveUnit;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const targets = this.canAttackByMeleeTargets;
        if (
            !unit ||
            !targets?.attackCells.length ||
            !fightProps.hasFightStarted() ||
            fightProps.hasFightFinished() ||
            this.isBoardInputLockedByAI() ||
            !this.canShowHoverForActiveUnit() ||
            this.currentActiveSpell
        ) {
            return undefined;
        }
        const target = this.getUnitAtPosition(worldPos);
        const targetCell = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), worldPos);
        if (!target || !targetCell) {
            return undefined;
        }
        const attackFrom = resolveMeleeAttackFromPointer({
            attackTypeSelection: unit.getAttackTypeSelection(),
            hasNoMelee: unit.hasAbilityActive("No Melee"),
            hasEnemyTarget:
                !target.isDead() &&
                target.getTeam() !== unit.getTeam() &&
                target.getCells().some((cell) => cell.x === targetCell.x && cell.y === targetCell.y),
            targetIsHidden: target.hasBuffActive("Hidden"),
            isForcedTargetAllowed: this.isAttackableUnderForcedTarget(target),
            isCowardiceBlocked: this.isCowardiceBlockedTarget(target),
            isEngineMeleeTarget: targets.unitIds.has(target.getId()),
            isRangeAttackPreferred: () => this.isStaticRangeAttackPreferred(unit, target),
            isAttackFromAdjacent: (attackFrom) =>
                this.grid.areCellsAdjacent(unit.getFootprintCellsForBase(attackFrom), target.getCells()),
            resolveAttackFrom: () =>
                this.pathHelper.calculateClosestAttackFrom(
                    worldPos,
                    targets.attackCells,
                    unit.getCells(),
                    [targetCell],
                    unit.isSmallSize(),
                    unit.getAttackRange(),
                    true,
                    TeamVals.NO_TEAM,
                    targets.attackCellHashesToLargeCells,
                ) ??
                this.pathHelper.calculateClosestAttackFrom(
                    worldPos,
                    targets.attackCells,
                    unit.getCells(),
                    target.getCells(),
                    unit.isSmallSize(),
                    unit.getAttackRange(),
                    target.isSmallSize(),
                    TeamVals.NO_TEAM,
                    targets.attackCellHashesToLargeCells,
                ),
        });
        return attackFrom ? { unit, target, attackFrom } : undefined;
    }
    /** Whether a selected ranged unit should keep its static shot instead of offering a melee cursor. */
    private isStaticRangeAttackPreferred(unit: RenderableUnit, target: Unit): boolean {
        return (
            unit.getAttackTypeSelection() === AttackVals.RANGE &&
            unit.getRangeShots() > 0 &&
            !unit.hasDebuffActive("Range Null Field Aura") &&
            !unit.hasStatusApplied("Rangebane") &&
            this.canAttackByRangeTargets?.has(target.getId()) === true &&
            this.attackHandler.canLandRangeAttack(unit, this.grid.getEnemyAggrMatrixByUnitId(unit.getId())) &&
            HoCMath.getDistance(unit.getPosition(), target.getPosition()) > GridConstants.STEP * 1.5
        );
    }
    /**
     * Whether the cursor at `worldPos` is aiming at a mountain the active unit can actually hit — the
     * gate for showing the sword/bow attack cursor over destructible terrain.
     */
    private isHoveringAttackableObstacle(worldPos: HoCMath.XY): boolean {
        return !!this.resolveObstacleAttack(worldPos);
    }
    private attemptObstacleAttack(worldPos: HoCMath.XY): boolean {
        const resolved = this.resolveObstacleAttack(worldPos);
        if (!resolved) {
            return false;
        }
        const forcedTarget = this.getLiveAggrForcedTarget();
        if (forcedTarget && isManualAttackBlockedByAggr(forcedTarget.getId(), { kind: "obstacle" })) {
            this.showAggrBlockedActionHint(forcedTarget);
            return true;
        }
        return this.executeObstacleAttackSequence(resolved.unit, resolved.targetPosition, resolved.attackFrom);
    }
    /**
     * Whether the straight world-space segment from -> to passes over anything a FLYER cannot
     * traverse. Mirrors the pathfinder's rule exactly: flyers may overfly lava ("L") and water
     * ("W") only — units, mountains ("B") and holes ("H") force a detour, so a straight glide
     * across them would misrepresent the actual route (a dragon soaring through a rock or over an
     * enemy line it logically flew around). The moving unit's own cells never block.
     */
    private straightSegmentBlockedForFlyer(unit: RenderableUnit, from: HoCMath.XY, to: HoCMath.XY): boolean {
        const gs = this.sc_sceneSettings.getGridSettings();
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        const steps = Math.max(2, Math.ceil(distance / (gs.getCellSize() * 0.4)));
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const cell = GridMath.getCellForPosition(gs, {
                x: from.x + (to.x - from.x) * t,
                y: from.y + (to.y - from.y) * t,
            });
            if (!cell) {
                continue;
            }
            const occupant = this.grid.getOccupantUnitId(cell);
            if (occupant && occupant !== unit.getId() && occupant !== "L" && occupant !== "W") {
                return true;
            }
        }
        return false;
    }
    /**
     * The melee landing for a mountain strike under the cursor — the EXACT call the unit-vs-unit
     * hover/click path uses (pathHelper.calculateClosestAttackFrom), fed with the mountain
     * pseudo-target's attack cells. The hovered rock's own 2x2 plays the role of the target's cells.
     */
    private resolveMountainAttackFrom(worldPos: HoCMath.XY): HoCMath.XY | undefined {
        const unit = this.currentActiveUnit;
        const targets = this.canAttackMountainTargets;
        if (!unit || !targets || !targets.attackCells.length) {
            return undefined;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const hoveredCell = GridMath.getCellForPosition(gs, worldPos);
        if (!hoveredCell) {
            return undefined;
        }
        const standingCells = this.grid.getCenterCells();
        const mid = gs.getGridSize() >> 1;
        const mountainCells = this.grid.hasScatteredMountains()
            ? standingCells.filter((c) => c.x === hoveredCell.x && c.y === hoveredCell.y)
            : standingCells.filter((c) => c.x >= mid === hoveredCell.x >= mid);
        if (!mountainCells.some((c) => c.x === hoveredCell.x && c.y === hoveredCell.y)) {
            return undefined;
        }
        return (
            this.pathHelper.calculateClosestAttackFrom(
                worldPos,
                targets.attackCells,
                unit.getCells(),
                mountainCells,
                unit.isSmallSize(),
                unit.getAttackRange(),
                mountainCells.length === 1,
                TeamVals.NO_TEAM,
                targets.attackCellHashesToLargeCells,
            ) ?? undefined
        );
    }
    /**
     * Team marker (🟢 LOWER / 🔴 UPPER) for a scene-log line, matched by the unit name the line leads
     * with (the engine writes "<UnitName> …"). Mirrors the ranked log's per-line colour flag, but
     * resolves by name here since the sandbox log is the engine's plain text rather than a rebuild
     * from events. Returns "" for lines that aren't about a unit (e.g. "Fight finished!", "Map
     * narrowed") or when the creature type is fielded by both teams (ambiguous).
     */
    protected resolveSceneLogTeamFlag(line: string): string {
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            indexUnitTeam(this.sceneLogTeamByName, unit.getName(), unit.getTeam());
        }
        // Delegate to the pure resolver (tested in scene_log_flag.test.ts). Passing the active unit lets
        // it disambiguate a creature mirrored on BOTH teams (e.g. a Beholder-vs-Beholder fight): the
        // active unit's own lines resolve to its side, and response lines resolve to its opponent's.
        const active = this.currentActiveUnit
            ? { name: this.currentActiveUnit.getName(), team: this.currentActiveUnit.getTeam() }
            : undefined;
        return resolveLineTeamFlag(line, this.sceneLogTeamByName, active);
    }
    /**
     * Sandbox-local effect visuals: diff every unit's active debuffs AND buffs against what we last
     * showed and, for each freshly-applied one (e.g. Beholder's Spit Ball landing Sadness / Quagmire /
     * Weakness, or a buff being cast), pop its spell icon + name over the unit and briefly wash the unit
     * with the effect's colour (violet for a debuff, green for a buff). Effects from one shot stack
     * upward so they don't overlap; the target washes once per batch. Aura effects are excluded (see
     * animatableEffectNames) since they toggle as units move in and out of range. A unit's effects are
     * seeded silently the first time it's seen so fight start (or a reconnect) doesn't burst every
     * existing one. Ranked drives the same pops from authoritative snapshots (processDebuffPops), so the
     * caller runs this for local sandbox only.
     */
    protected reconcileEffectVisuals(): void {
        const seen = new Set<string>();
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            const id = unit.getId();
            seen.add(id);
            // Ability-applied Effects (Shatter Armor, Stun, Paralysis, …) live on a separate list from
            // spell debuffs (unit.getEffects() vs getDebuffs()) but read as debuffs everywhere in the UI
            // (PixiScene folds applied_effects into the HUD's Debuffs). Include them here so their
            // "debuff applied" pop fires — otherwise e.g. Shatter Armor lands with no on-unit animation.
            const currentDebuffs = animatableEffectNames([
                ...unit.getDebuffs().map((d) => d.getName()),
                ...unit.getEffects().map((e) => e.getName()),
            ]);
            const currentBuffs = animatableEffectNames(unit.getBuffs().map((b) => b.getName()));
            const diff = diffUnitEffects(
                this.shownDebuffsByUnit.get(id),
                this.shownBuffsByUnit.get(id),
                currentDebuffs,
                currentBuffs,
            );
            this.shownDebuffsByUnit.set(id, currentDebuffs);
            this.shownBuffsByUnit.set(id, currentBuffs);
            if (diff.seeded) {
                continue; // First time we've seen this unit — seed without animating.
            }
            const renderable = unit as RenderableUnit;
            if (renderable.isDead()) {
                continue;
            }
            this.queueOrPlayEffectPops({
                unit: renderable,
                flash: diff.flash,
                debuffs: [...diff.newDebuffs],
                // Armor Rune / Weapon Rune render their own attempt->resolve flourish from the cast's
                // authoritative outcome (renderCastOutcomes), so skip the generic buff-applied pop here —
                // otherwise the rune bubbles up a second time on a successful enchant.
                buffs: [...diff.newBuffs].filter((name) => name !== "Armor Rune" && name !== "Weapon Rune"),
            });
        }
        for (const id of [...this.shownDebuffsByUnit.keys()]) {
            if (!seen.has(id)) {
                this.shownDebuffsByUnit.delete(id);
                this.shownBuffsByUnit.delete(id);
            }
        }
    }
    /**
     * Rake an Ursa-style orange Deep Wounds claw over each wounded unit — ONE slash per application that
     * landed during the attack. A double-punch wounder (e.g. Wolf) that wounds on both hits produces two
     * entries and therefore two claws. Driven off the authoritative `damage.deepWounds`, so it fires
     * per-application (not once via the effect-name diff) and is identical in the live sandbox and the
     * ranked replay. `power` scales the claw (reflects the effect's level / stack).
     */
    /**
     * Fly Zena's chakram through its ricochet arcs. `damage.chakramArcs` carries the engine-resolved sweeps
     * (cells), so the visual can never drift from where the damage actually landed. Shared by the live path
     * and the ranked replay — per the ABILITY VFX CONTRACT, a VFX wired into only one renders in one mode.
     */
    protected async playChakramArcs(
        attacker: RenderableUnit,
        damage?: IVisibleDamage,
        primaryTarget?: Unit,
    ): Promise<void> {
        if (!this.rangedProjectiles || !attacker.hasAbilityActive("Chakram")) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const cellSize = gs.getCellSize();
        const big = BIG_PROJECTILE_UNITS.has(attacker.getName().toLowerCase());

        // The engine PRECOMPUTED the flight AND the damage from ONE roll, so the disc's cells and the victims
        // never disagree on which way it curled. Per-victim amounts (for the numbers landed AS the disc
        // arrives) come from that same authoritative splash — never a client re-roll.
        const splashByUnit = new Map<string, { amount: number; unitsDied: number; missed?: boolean }>();
        for (const entry of damage?.splash ?? []) {
            splashByUnit.set(entry.unitId, {
                amount: entry.amount,
                unitsDied: entry.unitsDied,
                missed: entry.missed,
            });
        }
        const popChakramMiss = (unit: RenderableUnit, center: HoCMath.XY, dir: HoCMath.XY): void => {
            this.combatVisuals?.showMissLabel(
                { x: center.x, y: center.y - cellSize * (unit.isSmallSize() ? 0.85 : 1.25) },
                dir,
            );
        };

        // This runs at the exact moment the thrown disc lands on the PRIMARY target (both call sites await
        // the throw first), so the primary's wound opens right here — then each ricochet victim bleeds AS
        // the disc reaches it, never all at once.
        const attackerCenter = attacker.getVisualCenter(gs);
        const primaryDodged = !!(primaryTarget && splashByUnit.get(primaryTarget.getId())?.missed);
        if (primaryTarget && !damage?.missed && !primaryDodged) {
            const primary = this.unitsHolder.getAllUnits().get(primaryTarget.getId()) as RenderableUnit | undefined;
            if (primary && !primary.isDead()) {
                const center = primary.getVisualCenter(gs);
                const throwDir = this.chakramWorldDir(attackerCenter, center);
                this.combatVisuals?.spawnBloodSpray(center, cellSize, throwDir);
                this.combatVisuals?.spawnSlash(center, cellSize, throwDir);
            }
        }

        // Each leg is a RICOCHET: a curve TRUNCATED at the single unit it struck (or the terminal flourish
        // loop, which strikes nobody). So fly the whole leg, then land that one victim's number + blood + push
        // right where the disc ended — shoved the way the disc was travelling as it arrived. Short arcs (an
        // adjacent victim caught on the very first cell) still get a beat before the hit, so back-to-back
        // victims never pop in the same frame.
        let discEnd: HoCMath.XY | undefined;
        let lastDir: HoCMath.XY = { x: 0, y: 1 };
        for (const arc of damage?.chakramArcs ?? []) {
            const points = arc.cells
                .map((cell) => GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep()))
                .filter((position): position is HoCMath.XY => !!position);
            for (let index = 0; index < points.length; index++) {
                points[index] = projectBattlefieldPoint(points[index], gs);
            }
            if (!points.length) {
                continue;
            }
            const arrival = points[points.length - 1];
            if (points.length >= 2) {
                await this.rangedProjectiles.fireAlongPath(points, { big, chakram: true });
                lastDir = this.chakramWorldDir(points[points.length - 2], arrival);
            } else {
                await new Promise((resolve) => setTimeout(resolve, CHAKRAM_FLIGHTLESS_HOP_MS));
                if (discEnd) {
                    lastDir = this.chakramWorldDir(discEnd, arrival);
                }
            }
            discEnd = arrival;

            // The engine truncates a connecting leg at its one victim, so land it here as the disc arrives.
            const hitIds =
                (arc as { hitUnitIds?: string[] }).hitUnitIds ?? (arc.targetUnitId ? [arc.targetUnitId] : []);
            for (const unitId of hitIds) {
                const unit = this.unitsHolder.getAllUnits().get(unitId) as RenderableUnit | undefined;
                if (!unit) {
                    continue;
                }
                const center = unit.getVisualCenter(gs);
                const dmg = splashByUnit.get(unitId);
                if (dmg?.missed) {
                    popChakramMiss(unit, center, lastDir);
                    continue;
                }
                if (dmg && dmg.amount > 0) {
                    this.combatVisuals?.showFloatingDamage(
                        center,
                        dmg.amount,
                        lastDir,
                        dmg.unitsDied,
                        undefined,
                        undefined,
                        unit.getDamagePredictionAnchor(gs),
                    );
                }
                this.combatVisuals?.spawnBloodSpray(center, cellSize, lastDir);
                this.combatVisuals?.spawnSlash(center, cellSize, lastDir);
                unit.applyRecoil(lastDir.x * cellSize * 0.16, lastDir.y * cellSize * 0.16);
            }
        }

        // Home to Zena at the very end — the engine owns every sweep, so there is no client-side loop or random
        // flank here. A throw with no bounce (no arcs) flies back from the primary impact.
        if (!discEnd && primaryTarget) {
            discEnd = projectBattlefieldPoint(
                GridMath.getPositionForCell(primaryTarget.getBaseCell(), gs.getMinX(), gs.getStep(), gs.getHalfStep()),
                gs,
            );
        }
        if (discEnd) {
            const catchPoint = attacker.getRangedProjectileOrigin(discEnd, gs);
            await this.rangedProjectiles.fireAlongPath([discEnd, catchPoint], {
                big,
                chakram: true,
            });
        }
    }
    /** Unit-length world direction from -> to; falls back to "up the board" for a degenerate (zero-length) pair. */
    private chakramWorldDir(from: HoCMath.XY, to: HoCMath.XY): HoCMath.XY {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        return length < 0.0001 ? { x: 0, y: 1 } : { x: dx / length, y: dy / length };
    }
    /**
     * The bounce victims a chakram throw will hit, so the generic all-at-once splash renderer can SKIP them —
     * playChakramArcs lands each one's number as the disc reaches it. (The primary target isn't a bounce, so
     * its number still lands with the shot.) Empty for any non-chakram attack, leaving that path untouched.
     */
    protected chakramBounceVictimIds(damage?: IVisibleDamage): Set<string> {
        const ids = new Set<string>();
        for (const arc of damage?.chakramArcs ?? []) {
            for (const id of (arc as { hitUnitIds?: string[] }).hitUnitIds ?? []) {
                ids.add(id);
            }
        }
        return ids;
    }
    protected spawnDeepWoundsClaws(deepWounds?: { unitId: string; power: number }[]): void {
        if (!deepWounds?.length || !this.combatVisuals) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const cellSize = gs.getCellSize();
        for (const dw of deepWounds) {
            const woundedUnit = this.unitsHolder.getAllUnits().get(dw.unitId) as RenderableUnit | undefined;
            if (!woundedUnit) {
                continue;
            }
            this.combatVisuals.spawnClawSlash(woundedUnit.getVisualCenter(gs), cellSize, dw.power);
        }
    }
    /**
     * Green "+N" + restorative burst over every unit a cast actually healed. SHARED by both paths, per the
     * ABILITY VFX CONTRACT: called from the live cast (castSpellOnTarget / castAreaSpellAtCell) and from
     * playReplayCastSpellAction, so a heal renders identically in sandbox and in ranked — where even your
     * own cast is deferred to the authoritative replay.
     *
     * Driven off the engine's `healed[]` rather than an HP diff, which matters twice over. It is the
     * amount ACTUALLY restored (after magic resist, Holy Cross and the missing-HP cap), not the spell's
     * nominal power — a heal on a nearly-full stack correctly reads as the few points it gave back. And
     * unlike the replay's outcome-dependent pops, this is safe to render during playback: `healed[]` comes
     * from the authoritative record, not from the local re-run's RNG.
     */
    protected renderHealVfx(events: readonly GameEvent[]): void {
        if (!this.combatVisuals) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        for (const event of events) {
            if (event.type !== "spell_cast" || !event.healed?.length) {
                continue;
            }
            for (const heal of event.healed) {
                if (heal.amount <= 0) {
                    continue;
                }
                const healedUnit = this.unitsHolder.getAllUnits().get(heal.unitId) as RenderableUnit | undefined;
                if (!healedUnit || healedUnit.isDead()) {
                    continue;
                }
                this.combatVisuals.showFloatingHeal(healedUnit.getVisualCenter(gs), heal.amount);
            }
        }
    }
    /**
     * Fire + damage numbers for the Battle Mage's offensive spells, driven off the authoritative
     * `spell_cast.damaged` payload exactly the way renderHealVfx is driven off `healed`. Called from the live
     * cast paths AND the ranked replay, so the burn plays in both scenes (see fight_vfx_catalog: a helper wired
     * into only one path is the classic way a VFX goes missing in ranked).
     *
     * Fire Strike is THROWN, so it gets a sweep of embers along the line from the caster to its one victim;
     * Meteorite falls out of the sky, so there is nothing to travel and each enemy under the 2x2 just takes the
     * burst. Positions come off the event, not off the units: the engine captured them before applying damage,
     * so a stack that died still gets its number where it stood.
     */
    /**
     * What an offensive spell would actually land on `target`, for the aim preview — or undefined when the
     * hovered spell has no damage to show (a buff, a heal, a plain debuff, a summon).
     *
     * Battle magic has NO spread. A melee or ranged hover reads "12-19" because the roll happens at swing
     * time; a spell's damage is `creatures alive x stack power x the spell's own multiplier` and is decided
     * before it is cast, so the preview is one exact number. The only thing that moves it per target is magic
     * resistance — armor does nothing to a spell.
     *
     * Deliberately routed through the same two helpers the engine and the spellbook card use, so the number
     * the player reads while aiming is the number the cast deals.
     */
    private previewSpellDamage(spell: Spell, caster: Unit, target: Unit): number | undefined {
        if (!isOffensiveSpellMultiplier(spell.getMultiplierType())) {
            return undefined;
        }
        return offensiveSpellPreviewDamage(
            spell.getMultiplierType(),
            spell.getPower(),
            caster.getAmountAlive(),
            caster.getStackPower(),
            caster.getMagicDamageBonusPercentage(),
            target.getMagicResist(),
            elementalSpellMultiplier({
                element: spell.getElement(),
                targetIsFireElement: target.hasAbilityActive("Fire Element"),
                targetIsWaterElement: target.hasAbilityActive("Water Element"),
                targetIsWindElement: target.hasAbilityActive("Wind Element"),
            }),
        );
    }
    /**
     * Spells that burn everything AROUND their target while leaving the target itself untouched. The hover
     * has to know, or it prices the aimed creature for damage the engine will never deal it.
     */
    private spellSparesItsTarget(spell: Spell): boolean {
        return spell.getName() === "Ring of Fire";
    }
    /**
     * The units an offensive spell would splash onto BESIDES the one it is aimed at, each taking the same
     * damage as the primary target. Only Ring of Fire has such a splash today: it burns every cell touching
     * the target — friend or foe — while sparing the target and the caster (see ringOfFireCast).
     *
     * Mirrors that handler's geometry exactly, including the SIZE scaling: the ring hugs the target's whole
     * footprint, so a 2x2 enemy is ringed by 12 cells rather than the 8 around its base cell. Reading it off
     * the base cell alone would under-report the preview for every large target.
     */
    private splashedSpellTargets(spell: Spell, caster: Unit, target: Unit): Unit[] {
        if (spell.getName() !== "Ring of Fire") {
            return [];
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const cells = GridMath.getCellsAroundFootprint(gs, target.getCells());
        const seen = new Set<string>([caster.getId(), target.getId()]);
        const splashed: Unit[] = [];
        for (const cell of cells) {
            const id = this.grid.getOccupantUnitId(cell);
            if (!id || seen.has(id)) {
                continue;
            }
            seen.add(id);
            const unit = this.unitsHolder.getAllUnits().get(id);
            if (unit && !unit.isDead()) {
                splashed.push(unit);
            }
        }
        return splashed;
    }
    private cellTargetedSpellBlock(spell: Spell, origin: HoCMath.XY): HoCMath.XY[] {
        return cellTargetedSpellBlockCells(spell.getName(), origin);
    }
    /** World-space centre of a cell-targeted footprint, used to place its cast animation. */
    private getAreaSpellVisualCenter(spellName: string, origin: HoCMath.XY): HoCMath.XY | undefined {
        const gs = this.sc_sceneSettings.getGridSettings();
        const positions = cellTargetedSpellBlockCells(spellName, origin)
            .map((cell) => GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep()))
            .filter((position): position is HoCMath.XY => !!position)
            .map((position) => projectBattlefieldPoint(position, gs));
        if (!positions.length) return undefined;
        return {
            x: positions.reduce((sum, position) => sum + position.x, 0) / positions.length,
            y: positions.reduce((sum, position) => sum + position.y, 0) / positions.length,
        };
    }
    /**
     * Whether a unit-targeted spell can reach the target through the current board. The common classifier
     * includes Vine Throw despite its non-damaging status multiplier and lets called-down spells pass.
     */
    private hasTargetedSpellLineOfSight(spell: Spell, caster: Unit, target: Unit): boolean {
        return isTargetedSpellReachable(
            spell.getName(),
            this.grid,
            caster.getBaseCell(),
            target.getBaseCell(),
            this.throwTransparency(spell.getName(), caster),
        );
    }
    /**
     * Where to start a Magic Mirror rebound beam: the holder's CURRENT visual center when it is still on the
     * board, otherwise the position the engine recorded for it in this very cast (a mirror can be killed by
     * the spell it reflects, and the beam still has to come from where it stood).
     */
    private reboundMirrorPosition(
        holderUnitId: string,
        damaged: readonly { unitId: string; position: HoCMath.XY }[],
    ): HoCMath.XY | undefined {
        const holder = this.unitsHolder.getAllUnits().get(holderUnitId) as RenderableUnit | undefined;
        if (holder && !holder.isDead() && typeof holder.getVisualCenter === "function") {
            return holder.getVisualCenter(this.sc_sceneSettings.getGridSettings());
        }
        const fallback = damaged.find((entry) => entry.unitId === holderUnitId)?.position;
        return fallback ? projectBattlefieldPoint(fallback, this.sc_sceneSettings.getGridSettings()) : undefined;
    }
    protected renderSpellDamageVfx(events: readonly GameEvent[], casterPosition?: HoCMath.XY): void {
        if (!this.combatVisuals) {
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const cellSize = gs.getCellSize();
        const visualCasterPosition = casterPosition ? projectBattlefieldPoint(casterPosition, gs) : undefined;
        for (const event of events) {
            if (event.type !== "spell_cast") {
                continue;
            }
            const secondary = spellCastSecondaryDamage(event);
            // Ring of Fire is the exception among thrown spells: it bursts AROUND the aimed cell, catching
            // everything that touches it, so it gets one circle of flame centred on the target cell (and no
            // per-victim sweeps below). Draw that circle BEFORE the damage guard — a ring aimed at a lone
            // enemy catches no one and carries no damage, but the cast still happened and the player must see
            // the flame. Centre on the aimed CELL, not a victim, so a large target's off-centre sprite does
            // not shift it.
            const isRing = event.spellName === "Ring of Fire";
            if (isRing && event.targetCell) {
                const ringCenter = projectBattlefieldPoint(
                    GridMath.getPositionForCell(event.targetCell, gs.getMinX(), gs.getStep(), gs.getHalfStep()),
                    gs,
                );
                this.combatVisuals.spawnFireRing(ringCenter, cellSize);
            }
            if (!event.damaged?.length && !secondary?.length) {
                continue;
            }
            // A spell can hand part (or all) of each primary hit to an Abomination. Render that transfer
            // through the same grouped yellow ABSORBED path attacks use; never duplicate it as red damage.
            this.showFleshShieldAbsorbedDamage(secondary, visualCasterPosition);
            this.showWaterShieldAbsorbs(secondary, visualCasterPosition);
            // Thrown spells sweep embers from the caster to each victim; the called-down ones (Lightning
            // Strike, Meteor Shower) have nothing to travel and just burst where they land. Ring of Fire is
            // excluded from the per-victim sweep (its flame is the circle drawn above).
            const isThrown = isThrownOffensiveSpell(event.spellName);
            for (const hit of event.damaged ?? []) {
                const hitPosition = projectBattlefieldPoint(hit.position, gs);
                const hitUnit = this.unitsHolder.getAllUnits().get(hit.unitId) as RenderableUnit | undefined;
                const flagAnchor = hitUnit?.getDamagePredictionAnchor(gs);
                // A Magic Reflection sent part of the spell back: the caster's own entry gets the mirror
                // treatment instead of the spell's fire — a pane of glass flashing on the holder and a shard
                // driving back into the caster — so the player can see WHY the caster took damage from its
                // own cast, and from whom. Positions come off the event (the engine captured them before
                // applying damage), so a mirror that died to the very spell it reflected still throws it.
                if (hit.rebounded) {
                    const holderPosition = hit.reboundedFromUnitId
                        ? this.reboundMirrorPosition(hit.reboundedFromUnitId, event.damaged ?? [])
                        : undefined;
                    if (holderPosition) {
                        this.combatVisuals.spawnMagicMirrorRebound(holderPosition, hitPosition, cellSize);
                    }
                    if (hit.amount > 0) {
                        this.combatVisuals.showFloatingDamage(
                            hitPosition,
                            hit.amount,
                            undefined,
                            hit.unitsDied,
                            MIRROR_DAMAGE_FILL,
                            MIRROR_DAMAGE_STROKE,
                            flagAnchor,
                        );
                    }
                    continue;
                }
                if (isThrown && !isRing && visualCasterPosition) {
                    this.combatVisuals.spawnFireSweep(visualCasterPosition, hitPosition, cellSize);
                }
                this.combatVisuals.spawnFireBurn(hitPosition, cellSize, isThrown ? 0.9 : 1.3);
                if (hit.amount > 0) {
                    this.combatVisuals.showFloatingDamage(
                        hitPosition,
                        hit.amount,
                        undefined,
                        hit.unitsDied,
                        undefined,
                        undefined,
                        flagAnchor,
                    );
                }
            }
        }
    }
    /** Pop a freshly-applied effect's spell icon + name over a unit (shared by sandbox + ranked). */
    /**
     * True while a strike is still travelling — a projectile in flight, a melee approach/lunge, or any
     * authoritative replay record mid-playback. Effects applied by that strike are ALREADY in the data
     * (ranked diffs the snapshot the moment the server resolves the action, well before the replayed
     * arrow lands), so popping them here would show the debuff before the blow that caused it.
     */
    protected isStrikeInFlight(): boolean {
        return this.replayPlaybackActive || this.isPlayingActionAnimation();
    }
    /**
     * Animate a batch of freshly-applied effects, or hold it until the strike connects. The diff itself
     * always runs eagerly (see the ABILITY VFX CONTRACT — a mid-animation snapshot must never DROP an
     * effect); only the animation waits. flushEffectPops releases the queue at impact, and
     * stepMoveAnimation drains it unconditionally once nothing is in flight, so a queued pop can never be
     * swallowed even if an attack ends without reaching its impact hook.
     */
    protected queueOrPlayEffectPops(entry: IPendingEffectPop): void {
        if (entry.flash === "none" && !entry.debuffs.length && !entry.buffs.length) {
            return;
        }
        if (this.isStrikeInFlight()) {
            this.pendingEffectPops.push(entry);
            return;
        }
        this.playEffectPops(entry);
    }
    /** Release every held pop. Called at impact (next to the damage numbers) and as a safety drain. */
    protected flushEffectPops(): void {
        if (!this.pendingEffectPops.length) {
            return;
        }
        const queued = this.pendingEffectPops;
        this.pendingEffectPops = [];
        for (const entry of queued) {
            this.playEffectPops(entry);
        }
    }
    private playEffectPops(entry: IPendingEffectPop): void {
        // Re-check liveness at play time, not queue time: the strike that applied the effect may have
        // killed the unit while the pop was held, and a dead unit's sprite is torn down.
        if (entry.unit.isDead()) {
            return;
        }
        if (entry.flash === "debuff") {
            entry.unit.flashDebuffDarken();
        } else if (entry.flash === "buff") {
            entry.unit.flashBuffApplied();
        }
        let stackIndex = 0;
        for (const name of entry.debuffs) {
            this.popEffectOnUnit(entry.unit, name, stackIndex++, "debuff");
        }
        for (const name of entry.buffs) {
            this.popEffectOnUnit(entry.unit, name, stackIndex++, "buff");
        }
    }
    protected popDullingDefenseApplications(events: readonly GameEvent[] | undefined, unitId: string): void {
        const count = dullingDefenseApplicationCount(events, unitId);
        const unit = this.unitsHolder.getAllUnits().get(unitId) as RenderableUnit | undefined;
        if (!count || !unit || unit.isDead()) {
            return;
        }
        for (let index = 0; index < count; index++) {
            const pop = (): void => {
                if (!unit.isDead()) {
                    unit.flashDebuffDarken();
                    this.popEffectOnUnit(unit, "Dulling Defense", index, "debuff");
                }
            };
            if (index === 0) {
                pop();
            } else {
                setTimeout(pop, index * ATTACK_HIT_STAGGER_MS);
            }
        }
    }
    /**
     * Pop a newly GRANTED ability over a unit (Craft's "Crafted Double Punch" / "Crafted Frozen Sword").
     * Separate from popEffectOnUnit because an ability's icon is resolved through the ability texture
     * table, not the spell one — SpellHelper.spellToTextureName finds nothing for these names.
     */
    protected popAbilityOnUnit(unit: RenderableUnit, abilityName: string, stackIndex: number): void {
        const iconTexture = this.texAny(AbilityHelper.abilityToTextureName(abilityName));
        if (!iconTexture) {
            return;
        }
        this.combatVisuals?.spawnDebuffPop(
            unit.getVisualCenter(this.sc_sceneSettings.getGridSettings()),
            iconTexture,
            abilityName,
            stackIndex,
            "buff",
        );
    }
    protected popEffectOnUnit(
        unit: RenderableUnit,
        effectName: string,
        stackIndex: number,
        kind: "debuff" | "buff",
    ): void {
        // NOTE: the Deep Wounds orange claw is NO LONGER fired here. The effect-name diff pops only once
        // (when the name first appears) and can't tell a double-punch's two applications apart, so the claw
        // is driven per-application off `damage.deepWounds` via spawnDeepWoundsClaws() on both the live and
        // replay attack paths. Only the effect ICON still pops here.
        const iconTextureName = SpellHelper.spellToTextureName(effectName);
        const iconTexture = this.texAny(iconTextureName);
        if (!iconTexture) {
            return;
        }
        this.combatVisuals?.spawnDebuffPop(
            unit.getVisualCenter(this.sc_sceneSettings.getGridSettings()),
            iconTexture,
            effectName,
            stackIndex,
            kind,
        );
    }
    /** Hook fired whenever the manual AI toggle changes. Sandbox no-ops; ranked persists it. */
    protected onAiToggleChanged(_active: boolean): void {}
    /**
     * Force the manual AI toggle to a state and refresh its button + badge — used to restore a persisted
     * toggle on (re)load. Mirrors what the AI button does, plus a button/visible-state refresh so the
     * "AI" button and the React badge reflect the restored state.
     */
    protected forceAiToggle(active: boolean): void {
        this.sc_isAIActive = active;
        this.aiController.isAIActive = active;
        this.buttonManager.sc_isAIActive = active;
        if (active) {
            this.clearBoardHoverPreviews();
        }
        this.buttonManager.refreshButtons(true);
        this.sc_visibleStateUpdateNeeded = true;
        this.onAiToggleChanged(active);
    }
    /**
     * Pop the lap-start Morale (green) / Dismorale (violet) effect over a unit + flash it, driven by the
     * discrete `morale_applied` event (not the generic buff/debuff diff — see effect_pops.isMoraleEffectName).
     * Shared by sandbox (live, from applyTurnEngineEvents) and ranked (from the snapshot journal). No-op
     * if the unit is gone/dead.
     */
    /**
     * Open the incoming unit's turn header in the sandbox scene log ("⌖ 🟢 Fairy — Lap 2"). Goes
     * through updateLog — the engine/replay text channel — which ranked suppresses, so ranked (whose
     * headers come from the authoritative journal) never sees a duplicate. Skipped while a unit is
     * merely re-selected mid-turn (Double Shot's second volley).
     */
    private pushSandboxTurnLogHeader(unitId: string): void {
        if (this.sandboxTurnLogHeaderUnitId === unitId) {
            return;
        }
        const unit = this.unitsHolder.getAllUnits().get(unitId);
        if (!unit) {
            return;
        }
        this.sandboxTurnLogHeaderUnitId = unitId;
        const team = unit.getTeam();
        const flag = team === TeamVals.LOWER || team === TeamVals.UPPER ? (isFriendlyTeam(team) ? "🟢" : "🔴") : "";
        const lap = FightStateManager.getInstance().getFightProperties().getCurrentLap();
        this.sc_sceneLog.updateLog(formatTurnLogHeader(flag, unit.getName(), lap));
    }
    protected spawnMoralePop(unitId: string, kind: "plus" | "minus"): void {
        const unit = this.unitsHolder.getAllUnits().get(unitId) as RenderableUnit | undefined;
        if (!unit || unit.isDead()) {
            return;
        }
        if (kind === "plus") {
            unit.flashBuffApplied();
            this.popEffectOnUnit(unit, "Morale", 0, "buff");
        } else {
            unit.flashDebuffDarken();
            this.popEffectOnUnit(unit, "Dismorale", 0, "debuff");
        }
    }
    private executeObstacleAttackSequence(
        unit: RenderableUnit,
        targetPosition: HoCMath.XY,
        attackFromCell?: HoCMath.XY,
        onComplete?: () => void,
    ): boolean {
        // Ranked: the engine folds the melee approach into the obstacle_attack itself (attackFrom +
        // path), and the authoritative echo replays walk + strike exactly once
        // (playReplayObstacleAttackAction) — so submit the single combined action, mirroring the
        // unit-vs-unit melee fold. Running the local move sequence here instead submitted a bare
        // move_unit whose deferred branch never fires this strike callback: the unit walked up to
        // the mountain and its turn ended without an attack (and the server's post-move follow-up
        // whitelist has no OBSTACLE_ATTACK, so a second click couldn't land the strike either).
        const rankedAction = this.buildObstacleAttackAction(unit, targetPosition, attackFromCell);
        if (this.shouldDeferActionToAuthoritativeReplay(rankedAction)) {
            const submitted = this.submitActionForAuthoritativeReplay(rankedAction);
            if (submitted) {
                onComplete?.();
            }
            return submitted;
        }
        if (!attackFromCell) {
            return this.applyObstacleAttackAction(unit, targetPosition, undefined, onComplete);
        }

        const attackFromPos = this.getObstacleAttackFromPosition(unit, attackFromCell);
        const currentPos = unit.getPosition();
        const alreadyAtAttackCell =
            Math.abs(currentPos.x - attackFromPos.x) < 0.1 && Math.abs(currentPos.y - attackFromPos.y) < 0.1;
        if (alreadyAtAttackCell) {
            return this.applyObstacleAttackAction(unit, targetPosition, attackFromCell, onComplete);
        }

        const routes = this.currentActiveKnownPaths?.get((attackFromCell.x << 4) | attackFromCell.y);
        const route = routes?.[0]?.route;
        if (!route?.length) {
            return false;
        }

        // A one-cell body needs no override: the move lands on the single destination cell.
        const footprint = unit.isSmallSize() ? undefined : this.getLargeUnitObstacleFootprint(unit, attackFromCell);

        this.executeMoveSequence(unit, route, footprint, () => {
            this.applyObstacleAttackAction(unit, targetPosition, attackFromCell, onComplete);
        });
        return true;
    }
    private buildObstacleAttackAction(
        unit: RenderableUnit,
        worldPos: HoCMath.XY,
        attackFromCell?: HoCMath.XY,
    ): GameAction {
        const routeMetadata = attackFromCell
            ? this.currentActiveKnownPaths?.get((attackFromCell.x << 4) | attackFromCell.y)?.[0]
            : undefined;
        return {
            type: "obstacle_attack",
            attackerId: unit.getId(),
            targetPosition: worldPos,
            attackFrom: attackFromCell,
            path: routeMetadata?.route,
            hasLavaCell: routeMetadata?.hasLavaCell,
            hasWaterCell: routeMetadata?.hasWaterCell,
        };
    }
    private applyObstacleAttackAction(
        unit: RenderableUnit,
        worldPos: HoCMath.XY,
        attackFromCell?: HoCMath.XY,
        onComplete?: () => void,
    ): boolean {
        const action = this.buildObstacleAttackAction(unit, worldPos, attackFromCell);
        const unitSnapshot = this.snapshotRenderableUnits();
        const result = this.createActionEngine().apply(action);
        if (!result.completed) {
            return false;
        }

        const obstacleEvents = result.events.filter(
            (event): event is Extract<GameEvent, { type: "obstacle_attacked" }> => event.type === "obstacle_attacked",
        );
        const remainingEvents = result.events.filter((event) => event.type !== "obstacle_attacked");
        const strikePositions = obstacleStrikePositions(result.events, worldPos);
        const scattered = this.grid.hasScatteredMountains();
        this.hoverManager.clearHoverSilhouette();
        this.hoverManager.clearAttackVisuals();
        this.hoverManager.hoverAttackFromCell = undefined;
        this.sc_moveBlocked = true;

        // The engine has already resolved the action, but the tombstone sprites and turn hand-off wait for
        // their matching impacts. This makes Double Shot read as two real shots instead of deleting both
        // stones immediately and then drawing a cosmetic projectile at the final target.
        void (async () => {
            let appliedObstacleEvents = 0;
            try {
                await this.animateObstacleStrikeSequence(unit, strikePositions, attackFromCell, (impactIndex) => {
                    if (!scattered) {
                        return;
                    }
                    const event = obstacleEvents[impactIndex];
                    if (!event) {
                        return;
                    }
                    this.applyTurnEngineEvents([event], unitSnapshot);
                    appliedObstacleEvents = impactIndex + 1;
                });
            } finally {
                // Classic mountains aggregate all hits into one event, so apply it after the final impact.
                // The slice is also a recovery path if an animation is interrupted before every scattered
                // event reaches its per-impact callback: the turn can never remain locked indefinitely.
                const pendingEvents: GameEvent[] = [...obstacleEvents.slice(appliedObstacleEvents), ...remainingEvents];
                if (pendingEvents.length) {
                    this.applyTurnEngineEvents(pendingEvents, unitSnapshot);
                }
                this.unitsHolder.refreshStackPowerForAllUnits();
                this.sc_moveBlocked = false;
                this.sc_visibleStateUpdateNeeded = true;
                this.refreshUnits();
                onComplete?.();
            }
        })();
        return true;
    }
    /**
     * Attack animation against the mountain: a melee strike (attackFromCell set) lunges into the struck
     * edge along the attack trajectory; a ranged strike lobs a projectile at it. Mirrors the unit-vs-unit
     * melee lunge / range projectile. One animation plays per landed hit, so Double Punch (two lunges)
     * and Double Shot (two arrows) both read as the two strikes they are — staggered so they're distinct.
     */
    private async animateObstacleStrikeSequence(
        unit: RenderableUnit,
        worldPositions: readonly HoCMath.XY[],
        attackFromCell: HoCMath.XY | undefined,
        onImpact?: (impactIndex: number) => void,
    ): Promise<void> {
        const gsAnim = this.sc_sceneSettings.getGridSettings();
        const attackerCenter = unit.getVisualCenter(gsAnim);
        if (attackFromCell) {
            for (let hitIndex = 0; hitIndex < worldPositions.length; hitIndex += 1) {
                const worldPos = worldPositions[hitIndex];
                const animDir = { x: worldPos.x - attackerCenter.x, y: worldPos.y - attackerCenter.y };
                const animLen = Math.hypot(animDir.x, animDir.y);
                if (animLen <= 0.001) {
                    onImpact?.(hitIndex);
                    continue;
                }
                const mag = gsAnim.getCellSize() * 0.22;
                const recoilX = (animDir.x / animLen) * mag;
                const recoilY = (animDir.y / animLen) * mag;
                unit.applyRecoil(recoilX, recoilY);
                onImpact?.(hitIndex);
                if (hitIndex + 1 < worldPositions.length) {
                    await this.delayReplay(ATTACK_HIT_STAGGER_MS);
                }
            }
            return;
        }

        const big = BIG_PROJECTILE_UNITS.has(unit.getName().toLowerCase());
        const unitName = unit.getName().trim().toLowerCase();
        for (let shotIndex = 0; shotIndex < worldPositions.length; shotIndex += 1) {
            await this.rangedProjectiles.fire({
                from: unit.getRangedProjectileOrigin(worldPositions[shotIndex], gsAnim),
                to: worldPositions[shotIndex],
                big,
                orcAxe: unitName === "orc",
                arbalesterBolt: unitName === "arbalester",
                centaurSpear: unitName === "centaur",
                dryadDart: unitName === "dryad",
                beholderEye: unitName === "beholder",
                elfArrow: unitName === "elf",
                medusaSerpent: unitName === "medusa",
                cyclopsRock: unitName === "cyclops",
                monkOrb: unitName === "monk",
                tsarCannonball: unitName === "tsar cannon",
                gargantuanRock: unitName === "gargantuan",
            });
            onImpact?.(shotIndex);
        }
    }
    /**
     * Where a unit's body stands when its ANCHOR sits on `anchor` — the one conversion every landing cell
     * in this scene needs.
     *
     * An attack-from cell, a move destination and a base cell are all ANCHORS: the footprint's top-right
     * cell, with the body extending down-left from it (Unit.getFootprintCellsForAnchor). The unit's
     * position, though, is the CENTRE of that whole rectangle — half a cell down-left of the anchor cell's
     * centre for a 2-wide/2-tall body, and exactly the cell centre for a 1x1. Comparing a large unit's
     * position against the raw cell centre is what once made a static large shooter read as "not in place
     * yet" and silently never fire.
     */
    private footprintCenterForAnchor(unit: Unit, anchor: HoCMath.XY): HoCMath.XY {
        return GridMath.getPositionForFootprintAnchor(
            this.sc_sceneSettings.getGridSettings(),
            anchor,
            unit.getFootprintWidth(),
            unit.getFootprintHeight(),
        );
    }
    private getObstacleAttackFromPosition(unit: RenderableUnit, attackFromCell: HoCMath.XY): HoCMath.XY {
        return this.footprintCenterForAnchor(unit, attackFromCell);
    }
    private getLargeUnitObstacleFootprint(unit: Unit, attackFromCell: HoCMath.XY): HoCMath.XY[] {
        return unit.getFootprintCellsForAnchor(attackFromCell);
    }
    /**
     * Reuse the exact obstacle ray test from committed ranged attacks for every visible aiming line.
     * Cemetery barrels then speak the same red-target language whether the line came from a shot, a
     * spell, or an incoming-threat preview. Returning the intersections lets specialised callers retain
     * their existing stop/double-shot rules while this helper owns only the shared visual state.
     */
    private highlightScatteredObstaclesAlongTrajectory(
        from: HoCMath.XY | undefined,
        to: HoCMath.XY | undefined,
    ): IAttackObstacle[] {
        if (!from || !to || !this.grid.hasScatteredMountains()) {
            return [];
        }
        const intersections = this.attackHandler.getObstacleIntersections(from, to);
        this.dungeonVisuals.highlightScatteredMountains(intersections.map((obstacle) => obstacle.position));
        return intersections;
    }
    /**
     * Mountain hover: mirrors hovering a 2x2 ENEMY. Ranged units preview a shot in place; melee
     * units get the same cursor-tracked attack-from selection as unit targets (the landing follows
     * the cursor around the rock — edges, corners, both flanks), plus the move silhouette and arrow.
     */
    private updateObstacleHover(): boolean {
        // Clear any stale obstacle-hit state and report "not targeting the obstacle".
        const notHovering = (): boolean => {
            this.hoverManager.clearObstacleHighlight();
            this.dungeonVisuals.clearScatteredMountainHighlight();
            if (this.sc_hoverInfoArr[0] === "Hit the object") {
                this.sc_hoverInfoArr = [];
                this.sc_hoverTextUpdateNeeded = true;
                this.hoverManager.hoverAttackFromCell = undefined;
                this.hoverManager.clearHoverSilhouette();
                this.hoverManager.clearAttackVisuals();
            }
            return false;
        };
        const showHit = (): void => {
            if (this.sc_hoverInfoArr[0] !== "Hit the object") {
                this.sc_hoverInfoArr = ["Hit the object"];
                this.sc_hoverTextUpdateNeeded = true;
            }
        };

        const unit = this.currentActiveUnit;
        if (!unit || !this.sc_mouseWorld) {
            return notHovering();
        }
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const obstacleHitsLeft = this.grid.hasScatteredMountains()
            ? this.grid.getScatteredMountainsStanding().length
            : fightProps.getObstacleHitsLeft();
        if (fightProps.getGridType() !== GridVals.BLOCK_CENTER || obstacleHitsLeft <= 0) {
            return notHovering();
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const hoveredCell = GridMath.getCellForPosition(gs, this.sc_mouseWorld);
        if (!hoveredCell || !this.isStandingAttackObstacleCell(hoveredCell)) {
            return notHovering();
        }
        const hoveredObstacleCenter = GridMath.getPositionForCell(
            hoveredCell,
            gs.getMinX(),
            gs.getStep(),
            gs.getHalfStep(),
        );
        // Hover alone is enough to expose a barrel's red target silhouette. Attack-specific cursor and
        // path logic below still decides whether a click can actually strike it.
        if (this.grid.hasScatteredMountains()) {
            this.dungeonVisuals.highlightScatteredMountains([hoveredObstacleCenter]);
        }
        this.hoverManager.clearAttackVisuals();

        // Ranged attackers shoot the mountain in place (unless pinned into melee). Same
        // getAttackTypeSelection gating as the click path, so e.g. the Tsar Cannon previews correctly.
        const canRangeObstacle = this.attackHandler.canLandRangeAttack(
            unit,
            this.grid.getEnemyAggrMatrixByUnitId(unit.getId()),
        );
        if (unit.getAttackTypeSelection() === AttackVals.RANGE && canRangeObstacle) {
            // Switching from a valid move cell to a ranged obstacle target must end the movement preview
            // immediately. updateObstacleHover returns before the regular cell-hover cleanup below, so
            // without this explicit reset the previous creature ghost and its footprint remain under the
            // aiming line. Force the visual clear in case a just-finished move left the silhouette locked.
            this.hoverManager.clearHoverSilhouette(true);
            const cellCenter = hoveredObstacleCenter;
            const shotStart = projectBattlefieldPoint(unit.getPosition(), gs);
            const intersections = this.grid.hasScatteredMountains()
                ? this.attackHandler.getObstacleIntersections(unit.getPosition(), cellCenter)
                : [];
            const hasDoubleShot = !!(unit.getAbility("Double Shot") ?? unit.getAbility("Crafted Double Shot"));
            const projectileHits = intersections.slice(0, hasDoubleShot ? 2 : 1);
            const actualHit = projectileHits.at(-1)?.position ?? cellCenter;
            const reachesAimedStone = actualHit.x === cellCenter.x && actualHit.y === cellCenter.y;
            this.hoverRangeAttackObstacle = projectileHits.at(-1);
            this.hoverManager.drawAttackArrow(
                shotStart,
                projectBattlefieldPoint(actualHit, gs),
                reachesAimedStone ? undefined : projectBattlefieldPoint(cellCenter, gs),
            );
            this.hoverManager.highlightObstacles(
                projectileHits.length ? projectileHits.map((obstacle) => obstacle.position) : [cellCenter],
                gs.getCellSize(),
                false,
            );
            if (this.grid.hasScatteredMountains()) {
                this.hoverManager.clearObstacleHighlight();
                this.dungeonVisuals.highlightScatteredMountains(
                    projectileHits.length ? projectileHits.map((obstacle) => obstacle.position) : [cellCenter],
                );
            }
            if (projectileHits.length > 1) {
                this.sc_hoverInfoArr = ["Hit 2 tombstones"];
                this.sc_hoverTextUpdateNeeded = true;
                return true;
            }
            showHit();
            return true;
        }
        if (unit.getAttackTypeSelection() === AttackVals.MAGIC || unit.hasAbilityActive("No Melee")) {
            return this.grid.hasScatteredMountains() || notHovering();
        }

        const attackFromCell = this.resolveMountainAttackFrom(this.sc_mouseWorld);
        if (!attackFromCell) {
            return this.grid.hasScatteredMountains() || notHovering();
        }
        this.hoverManager.hoverAttackFromCell = attackFromCell;
        const attackFromPos = this.getObstacleAttackFromPosition(unit, attackFromCell);
        const cellCenter = hoveredObstacleCenter;
        this.hoverManager.updateHoverSilhouette(attackFromPos);
        // Aim at the target's own grid anchor, not the raw pointer. The sword keeps one fixed cell-size
        // scale, while the projected endpoints determine only its position and facing.
        //
        // Suppressed once the swing is committed: the marker is redrawn every frame while the pointer
        // rests on the target, so clearing it once at attack time was immediately undone.
        if (!this.isStrikeInFlight()) {
            const attackPreview = unit.getBattlefieldPreviewAt(attackFromPos, gs);
            this.hoverManager.drawAttackArrow(
                attackPreview ? { x: attackPreview.x, y: attackPreview.y } : projectBattlefieldPoint(attackFromPos, gs),
                projectBattlefieldPoint(cellCenter, gs),
                undefined,
                undefined,
                "melee",
                true,
                meleeSwordFacingAngle(attackFromPos, cellCenter),
            );
        }
        if (this.grid.hasScatteredMountains()) {
            this.dungeonVisuals.highlightScatteredMountains([cellCenter]);
        } else {
            this.hoverManager.highlightObstacle(cellCenter, gs.getCellSize());
        }
        showHit();
        return true;
    }
    /**
     * Area Throw (e.g. Gargantuan): when the active ranged unit hovers any in-grid cell that
     * isn't an enemy unit, preview the 3x3 splash AREA it will hit. Returns true while previewing
     * so hover() skips the normal unit/cell hover logic (parity with legacy drawAOECells).
     */
    private updateAreaThrowHover(): boolean {
        this.hoverManager.clearAOEArea();
        this.hoverManager.clearAttackVisuals();
        const clearInfo = (): boolean => {
            // Prefix match: the live label carries the falloff fraction ("Area attack — 🎯1/N"), so an exact
            // "Area attack" compare would never clear it.
            if (this.sc_hoverInfoArr[0]?.startsWith("Area attack")) {
                this.sc_hoverInfoArr = [];
                this.sc_hoverTextUpdateNeeded = true;
            }
            return false;
        };

        const cells = this.getAreaThrowCells(this.sc_mouseWorld);
        if (!cells) {
            return clearInfo();
        }

        const affectedGroups = AllAbilities.evaluateAffectedUnits(cells, this.unitsHolder, this.grid) ?? [];
        // The authoritative range handler checks only the ordered primary ([0][0]); a forced target later
        // in the splash does not make the throw legal. An empty splash is a legal miss and remains available.
        {
            const aggrBlockedAreaTarget = this.isAttackBlockedByAggr(affectedGroups[0]?.[0], "area");
            if (aggrBlockedAreaTarget) {
                this.showAggrBlockedActionHint(aggrBlockedAreaTarget);
                return true;
            }
            this.clearAggrBlockedActionHint();
        }

        // Aggr: an aggravated AOE unit can only attack the enemy that aggr'd it. Only preview/allow the throw
        // when its splash actually covers that forced target; suppress it (no AOE outline) anywhere else.
        const forcedTargetId = this.currentActiveUnit?.getTarget();
        if (forcedTargetId) {
            const forcedTarget = this.unitsHolder.getAllUnits().get(forcedTargetId);
            if (forcedTarget && !forcedTarget.isDead()) {
                const coversForcedTarget = affectedGroups.some((g) => g.some((u) => u.getId() === forcedTargetId));
                if (!coversForcedTarget) {
                    return clearInfo();
                }
            }
        }

        this.hoverManager.drawAOEArea(cells);
        // Trajectory line to the impact cell — the same arrow a single-target ranged hover draws. The
        // 3x3 outline alone showed WHERE the splash lands but not the path the throw takes to get
        // there, so the player couldn't see what the shot crosses: a unit standing in the way
        // intercepts it and drags the whole splash back onto itself (getAreaThrowImpactCell), and on
        // BLOCK_CENTER the line is the only cue that the throw passes over the mountain corridor.
        // Drawn AFTER clearAttackVisuals() above, which wipes the previous frame's arrow.
        const activeUnit = this.currentActiveUnit;
        const gs = this.sc_sceneSettings.getGridSettings();
        // One range divisor for the WHOLE 3x3, measured to the RESOLVED impact cell (an intercepting unit
        // drags the splash back — getAreaThrowImpactCell — exactly as the engine's areaThrowAttack measures
        // it). getRangeAttackDivisor returns 1/2/4/8 (halving per shot-distance band; Sniper negates) — the
        // "1/N" falloff the player sees, the same band 17a5522 shows on the single-target hover.
        let divisor = 1;
        if (activeUnit instanceof RenderableUnit) {
            const mouseCell = GridMath.getCellForPosition(gs, this.sc_mouseWorld);
            const impactCell = mouseCell ? this.getAreaThrowImpactCell(activeUnit, mouseCell) : undefined;
            const impactPos = impactCell
                ? GridMath.getPositionForCell(impactCell, gs.getMinX(), gs.getStep(), gs.getHalfStep())
                : undefined;
            if (impactPos) {
                this.hoverManager.drawAttackArrow(
                    projectBattlefieldPoint(activeUnit.getPosition(), gs),
                    projectBattlefieldPoint(impactPos, gs),
                );
                this.highlightScatteredObstaclesAlongTrajectory(activeUnit.getPosition(), impactPos);
                divisor = this.attackHandler.getRangeAttackDivisor(activeUnit, impactPos);
            }
        }

        // Outline every splashed unit red AND float its projected damage. affectedGroups is [units, units]
        // (two identical refs from evaluateAffectedUnits) — iterate ONE. Per-unit damage mirrors the engine
        // EXACTLY minus the luck/miss RNG: Unit.calculateAttackDamage (base min/max at abilityMultiplier=1,
        // then ONE floor of sample * abilityMultiplier * deepWounds * elemental — attackTypeMultiplier is 1
        // for a ranged throw), then processRangeAOEAbility's tail (Giant's Maul +%, victim Broken Aegis -%,
        // physical-AOE resistance — each its own floor). Gargantuan's native Double Shot fires a SECOND full
        // area wave (double_shot_ability -> processRangeAOEAbility again), so the total is ~2x. Keep in sync
        // with unit.ts calculateAttackDamage + aoe_range_ability.ts + double_shot_ability.ts.
        const splashUnits = affectedGroups[0] ?? [];
        let doubleShot = false;
        if (activeUnit) {
            const abilityPower = FightStateManager.getInstance()
                .getFightProperties()
                .getAdditionalAbilityPowerPerTeam(activeUnit.getTeam());
            const aoeAbility = activeUnit.getAbility("Area Throw") ?? activeUnit.getAbility("Large Caliber");
            let abilityMultiplier = aoeAbility ? activeUnit.calculateAbilityMultiplier(aoeAbility, abilityPower) : 1;
            const attackerParalysis = activeUnit.getEffect("Paralysis");
            if (attackerParalysis) {
                abilityMultiplier *= (100 - attackerParalysis.getPower()) / 100;
            }
            const giantsMaul = activeUnit.getBuff("Giants Maul");
            const attackRate = activeUnit.getAttack();
            // Deep Wounds bonus needs the ATTACKER to own a Deep Wounds Level ability AND the victim to carry
            // the "Deep Wounds" effect (checked per victim). Gargantuan has neither natively, but both can be
            // stolen/synergised, so model it to stay faithful.
            const attackerHasDeepWounds = !!(
                activeUnit.getAbility("Deep Wounds Level 0") ||
                activeUnit.getAbility("Deep Wounds Level 1") ||
                activeUnit.getAbility("Deep Wounds Level 2") ||
                activeUnit.getAbility("Deep Wounds Level 3")
            );
            doubleShot =
                activeUnit.hasAbilityActive("Double Shot") || activeUnit.hasAbilityActive("Crafted Double Shot");
            for (const affectedUnit of splashUnits) {
                this.hoverManager.addTargetHighlight(affectedUnit);
                if (affectedUnit.isDead()) {
                    continue;
                }
                // Base bounds WITHOUT the ability multiplier — the engine computes min/max at abilityMultiplier=1
                // and applies it (plus deepWounds/elemental) AFTER the roll in a single Math.floor.
                const baseMin = activeUnit.calculateAttackDamageMin(
                    attackRate,
                    affectedUnit,
                    true,
                    abilityPower,
                    divisor,
                );
                const baseMax = activeUnit.calculateAttackDamageMax(
                    attackRate,
                    affectedUnit,
                    true,
                    abilityPower,
                    divisor,
                );
                const deepWoundsPower = attackerHasDeepWounds
                    ? (affectedUnit.getEffect("Deep Wounds")?.getPower() ?? 0)
                    : 0;
                const deepWoundsMul = deepWoundsPower > 0 ? 1 + deepWoundsPower / 100 : 1;
                const postSample =
                    abilityMultiplier * deepWoundsMul * activeUnit.getElementalDamageMultiplier(affectedUnit);
                let minD = Math.floor(baseMin * postSample);
                let maxD = Math.floor(baseMax * postSample);
                if (giantsMaul) {
                    const gmMul = 1 + giantsMaul.getPower() / 100;
                    minD = Math.floor(minD * gmMul);
                    maxD = Math.floor(maxD * gmMul);
                }
                const brokenAegis = affectedUnit.getBuff("Broken Aegis");
                if (brokenAegis) {
                    const baMul = 1 - brokenAegis.getPower() / 100;
                    minD = Math.floor(minD * baMul);
                    maxD = Math.floor(maxD * baMul);
                }
                const aoeMul = affectedUnit.getPhysicalAoeDamageMultiplier();
                minD = Math.floor(minD * aoeMul);
                maxD = Math.floor(maxD * aoeMul);
                // Double Shot re-runs the whole area wave on the same units at the same divisor, so the total
                // is ~2x (an UPPER bound: the second wave can miss or hit a unit the first already killed).
                // Matches the single-target hover, which shows 2x for Double Shot.
                if (doubleShot) {
                    minD *= 2;
                    maxD *= 2;
                }
                // NOTE: Flesh Shield Aura redistribution across the splash isn't modeled — if a Flesh-Shield
                // owner and its protectee are both in the 3x3, the shown split won't match the resolved one.
                const dmgStr = formatCombatRange(minD, maxD);
                const labelPos =
                    affectedUnit instanceof RenderableUnit
                        ? affectedUnit.getVisualCenter(gs)
                        : affectedUnit.getPosition();
                this.hoverManager.addAOEDamageLabel(labelPos, dmgStr, !affectedUnit.isSmallSize());
            }
        } else {
            for (const affectedUnit of splashUnits) {
                this.hoverManager.addTargetHighlight(affectedUnit);
            }
        }

        // The whole 3x3 shares one divisor, so show the falloff once in the cursor text rather than on every
        // unit. When the attacker has Double Shot, each floating number already includes both waves, so flag
        // "×2" here so the (larger) numbers read correctly. clearInfo() matches by prefix so it still clears.
        const areaLabel = `Area attack — 🎯1/${divisor}${doubleShot ? "  ×2" : ""}`;
        if (this.sc_hoverInfoArr[0] !== areaLabel) {
            this.sc_hoverInfoArr = [areaLabel];
            this.sc_hoverTextUpdateNeeded = true;
        }
        return true;
    }
    /**
     * For mass / AOE ranged attackers (Cyclops = Large Caliber, Tsar Cannon = Through Shot,
     * Gargantuan = Area Throw), outline EVERY unit the shot will hit — not just the one under the
     * cursor — reusing the red target highlight. Returns true when it applied an AOE highlight, so
     * the caller skips the single-target highlight.
     */
    private highlightRangeAttackUnits(targetUnit: Unit): boolean {
        const attacker = this.currentActiveUnit;
        if (!attacker) {
            return false;
        }
        const largeCaliber = attacker.hasAbilityActive("Large Caliber");
        const areaThrow = attacker.hasAbilityActive("Area Throw");
        const throughShot = attacker.hasAbilityActive("Through Shot");
        if (!largeCaliber && !areaThrow && !throughShot) {
            return false;
        }
        // Aim at the same visible-edge center the real shot uses (matches the trajectory arrow and
        // the engine's resolveRangeTargetPosition), not the target's geometric center. For a large
        // attacker (center sits on a grid boundary) a center->center line has a different angle than
        // the actual center->edge shot, so highlighting from the center outlined the wrong units.
        const aim =
            attacker instanceof RenderableUnit
                ? this.resolveRangeAimForTarget(attacker, targetUnit)?.position
                : undefined;
        const evalResult = this.attackHandler.evaluateRangeAttack(
            this.unitsHolder.getAllUnits(),
            attacker,
            attacker.getPosition(),
            aim ?? targetUnit.getPosition(),
            throughShot, // isThroughShot
            false, // isSelection
            largeCaliber || areaThrow, // splash (Large Caliber / Area Throw)
        );
        const seen = new Set<string>();
        for (const affectedGroup of evalResult.affectedUnits) {
            for (const affectedUnit of affectedGroup) {
                if (seen.has(affectedUnit.getId())) {
                    continue;
                }
                seen.add(affectedUnit.getId());
                this.hoverManager.addTargetHighlight(affectedUnit);
            }
        }
        // Only highlight units the shot actually reaches. A non-piercing shot (Large Caliber / Area
        // Throw) stops at the first unit on its path, so when a unit intercepts the shot before the
        // aimed target, the target under the cursor is NOT hit — don't outline it. (A Through Shot or a
        // direct hit already includes the target above, since it's in evalResult.affectedUnits.)
        return seen.size > 0;
    }
    /**
     * The unit a plain (non-Through-Shot) ranged shot at `targetUnit` would actually hit. A normal
     * projectile can't pass through units, so if another unit stands on the trajectory between the
     * attacker and the target, THAT unit is struck instead. `exactAimPosition` is the action's already
     * resolved visible-edge position; hover-only callers omit it and retain cursor/default resolution.
     * Returns the first unit the shot meets (mirrors legacy test_heroes.ts getHoverAttackUnit =
     * affectedUnits[0][0]); undefined if the trajectory can't be evaluated.
     */
    private resolveFirstRangeHitUnit(targetUnit: Unit, exactAimPosition?: HoCMath.XY): Unit | undefined {
        const attacker = this.currentActiveUnit;
        if (!attacker || !this.attackHandler) {
            return undefined;
        }
        const aimPosition = resolveLiveRangeProjectileTracePosition(
            exactAimPosition,
            () =>
                attacker instanceof RenderableUnit
                    ? this.resolveRangeAimForTarget(attacker, targetUnit)?.position
                    : undefined,
            targetUnit.getPosition(),
        );
        const evalResult = this.attackHandler.evaluateRangeAttack(
            this.unitsHolder.getAllUnits(),
            attacker,
            attacker.getPosition(),
            aimPosition,
            false, // isThroughShot — a normal projectile stops at the first unit it meets
            false, // isSelection
            // Match GameActionEngine.rangeAttack's terrain/splash ray semantics exactly.
            attacker.hasAbilityActive("Large Caliber") || attacker.hasAbilityActive("Area Throw"),
        );
        return evalResult.affectedUnits[0]?.[0];
    }
    /**
     * The 3x3 splash cells for an Area Throw aimed at worldPos, or undefined when the active unit
     * can't area-throw there (not an Area Throw range unit, off-grid, or aiming directly at an
     * enemy unit — that goes through the normal single-target path).
     */
    /**
     * The active unit is AIMING an Area Throw rather than manoeuvring: it still has the ability (not
     * muted by Break, not stolen), it is in RANGE mode, and it has shots left. A Gargantuan in that state
     * does not walk — the whole turn is spent placing the 3x3 splash — so the hover must offer the AREA,
     * never a move preview. Switching to melee (or spending the last shot) drops the state and the normal
     * move/melee hover takes over.
     */
    private isAreaThrowAiming(): boolean {
        const unit = this.currentActiveUnit;
        return (
            !!unit &&
            unit.hasAbilityActive("Area Throw") &&
            unit.getAttackTypeSelection() === AttackVals.RANGE &&
            unit.getRangeShots() > 0
        );
    }
    private getAreaThrowCells(worldPos?: HoCMath.XY): HoCMath.XY[] | undefined {
        const unit = this.currentActiveUnit;
        if (!unit || !worldPos || !this.isAreaThrowAiming()) {
            return undefined;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const mouseCell = GridMath.getCellForPosition(gs, worldPos);
        if (!mouseCell || !GridMath.isCellWithinGrid(gs, mouseCell)) {
            return undefined;
        }
        const occupantId = this.grid.getOccupantUnitId(mouseCell);
        if (occupantId && occupantId !== "L" && occupantId !== "W") {
            return undefined; // aiming at an enemy unit → single-target preview handles it
        }
        const targetCell = this.getAreaThrowImpactCell(unit, mouseCell);
        return [...GridMath.getCellsAroundCell(gs, targetCell), targetCell];
    }
    /**
     * The cell an Area Throw actually lands on when aimed at `mouseCell` — the splash CENTRE. A unit
     * standing on the trajectory intercepts the throw, so the engine re-centres it on that unit
     * (projectAreaThrowTargetCell) instead of letting it reach the empty cell behind. Shared by the
     * 3x3 preview and the hover trajectory so the drawn line always ends where the splash will.
     */
    private getAreaThrowImpactCell(unit: Unit, mouseCell: HoCMath.XY): HoCMath.XY {
        return this.attackHandler.projectAreaThrowTargetCell(this.unitsHolder.getAllUnits(), unit, mouseCell);
    }
    /** Execute an Area Throw at the clicked cell. Returns true if it handled the click. */
    private attemptAreaThrowAttack(worldPos: HoCMath.XY): boolean {
        const unit = this.currentActiveUnit;
        const cells = this.getAreaThrowCells(worldPos);
        if (!unit || !cells) {
            return false;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const mouseCell = GridMath.getCellForPosition(gs, worldPos);
        if (!mouseCell) {
            return false;
        }
        const cellPosition = GridMath.getPositionForCell(mouseCell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        if (!cellPosition) {
            return false;
        }
        void this.performAreaThrow(unit, mouseCell, cellPosition);
        return true;
    }
    /**
     * `replayRecord` marks this as a REPLAY of an already-resolved throw (the ranked opponent's, and in
     * ranked the local player's own — it is deferred and comes back through the same path). The record's
     * `area_attacked` event is what the SERVER resolved, so it drives every visual; the local engine
     * re-apply is then only there to move local state along. Two things went wrong while this path read
     * its own re-run instead:
     *   - damage is `getRandomInt(min, max)` (plus luck/crit rolls), so each side re-rolled its own
     *     numbers — the figures on screen were not the damage the server dealt, and the two players
     *     disagreed. Every other replay path renders from the record for exactly this reason.
     *   - a re-apply the engine REJECTS (`unit_already_acted` once a snapshot has synced the actor,
     *     `fight_finished`, spent shots) returned early and swallowed the whole action: no projectile
     *     numbers, no deaths, and none of the events bundled onto it (turn advance, lap flip, Armageddon,
     *     narrowing). The cast/attack/obstacle replays all fall back to the recorded events here.
     */
    private async performAreaThrow(
        unit: RenderableUnit,
        mouseCell: HoCMath.XY,
        cellPosition: HoCMath.XY,
        replayRecord?: SandboxReplay["actions"][number],
    ): Promise<void> {
        const action: GameAction = {
            type: "area_throw_attack",
            attackerId: unit.getId(),
            targetCell: mouseCell,
        };

        // Ranked: defer to the authoritative replay so the throw — and Double Shot's second
        // projectile — animates exactly once, when the server echoes the action. Without this the
        // acting player animated it here AND again on the echo, doubling Gargantuan to four throws.
        // shouldDeferActionToAuthoritativeReplay() returns false while replaying, so the echoed
        // action still animates here as normal.
        if (this.shouldDeferActionToAuthoritativeReplay(action)) {
            this.hoverManager.clearAOEArea();
            this.hoverManager.clearAttackVisuals();
            this.hoverManager.clearHoverSilhouette();
            this.submitActionForAuthoritativeReplay(action);
            return;
        }

        // Snapshot health so the floating damage numbers can be derived from the diff.
        const preState = new Map<string, { hp: number; amount: number }>();
        for (const u of this.unitsHolder.getAllUnits().values()) {
            preState.set(u.getId(), { hp: u.getCumulativeHp(), amount: u.getAmountAlive() });
        }

        // The engine projects the throw onto the first enemy on the trajectory, so the projectile
        // and damage numbers must land on that intercepted cell too (not the empty cell behind it).
        const gs = this.sc_sceneSettings.getGridSettings();
        const effectiveCell = this.attackHandler.projectAreaThrowTargetCell(
            this.unitsHolder.getAllUnits(),
            unit,
            mouseCell,
        );
        const effectivePosition =
            GridMath.getPositionForCell(effectiveCell, gs.getMinX(), gs.getStep(), gs.getHalfStep()) ?? cellPosition;

        const muzzle = unit.getRangedProjectileOrigin(effectivePosition, gs);
        const bigProjectile = BIG_PROJECTILE_UNITS.has(unit.getName().toLowerCase());
        const areaThrowUnitName = unit.getName().trim().toLowerCase();
        const isDoubleShot = unit.hasAbilityActive("Double Shot") || unit.hasAbilityActive("Crafted Double Shot");
        // Shot ONE. Double Shot's second projectile is fired below, AFTER wave 1's numbers, so each shot's
        // damage pops in sync with its own throw instead of both landing at the end.
        await this.rangedProjectiles.fire({
            from: muzzle,
            to: effectivePosition,
            big: bigProjectile,
            tsarCannonball: areaThrowUnitName === "tsar cannon",
            gargantuanRock: areaThrowUnitName === "gargantuan",
        });

        const unitSnapshot = this.snapshotRenderableUnits();
        const result = this.createActionEngine().apply(action);
        const findAreaEvent = (
            events: readonly GameEvent[],
        ): Extract<GameEvent, { type: "area_attacked" }> | undefined =>
            events.find((e): e is Extract<GameEvent, { type: "area_attacked" }> => e.type === "area_attacked");
        // The record wins whenever there is one: it is the throw the server actually resolved, while
        // `result` is a local re-roll of the same dice (see the note on this method).
        const recordedAreaEvent = replayRecord ? findAreaEvent(replayRecord.events) : undefined;
        if (!result.completed && !recordedAreaEvent) {
            // Nothing to draw — but a replayed record still owes its deaths and turn advance. The caller
            // reports this action as played, so nobody else will apply them.
            if (replayRecord) {
                this.applyReplayEvents(replayRecord.events);
            }
            return;
        }

        // Prefer the engine's per-unit `splash` breakdown (the HP-diff fallback only sums to one number per
        // unit). Attribute kills before cleanupDeadUnits below tears the dead down and spawns death visuals.
        const areaEvent = recordedAreaEvent ?? findAreaEvent(result.events);
        if (areaEvent) {
            this.noteDeathBlowsFromAttackEvent(areaEvent);
        }
        const fleshShieldDamageByUnit = this.showFleshShieldAbsorbedDamage(areaEvent?.damage.secondary, muzzle, 180);
        this.showWaterShieldAbsorbs(areaEvent?.damage.secondary, muzzle, 180);
        const splash = areaEvent?.damage.splash;
        // The engine resolved EVERY wave in the single apply() above, and `splash` carries one entry per
        // surviving unit per wave — wave 1 then wave 2 (double_shot_ability appends the second). Show each
        // wave as ITS OWN throw lands, so the numbers pop in sync with the projectile instead of all
        // arriving at the end. A unit killed by wave 1 has no wave-2 entry, so it simply gets one number.
        //
        // The throw count is driven by the DAMAGE the engine actually dealt, not by hasAbilityActive():
        // ranked replays this action against an attacker rebuilt from the authoritative snapshot, where
        // the ability check has been observed false for the opponent's Gargantuan — which silently
        // dropped the second throw while the damage (read from this same splash payload) stayed correct.
        // Two entries for one unit means two waves landed, so two projectiles must fly. The ability flag
        // still matters only when wave 2 dealt no damage at all — it missed, or wave 1 already killed
        // everything — because then there is no splash evidence of it to read.
        const waves = splitAreaThrowWaves(splash);
        const throwCount = Math.max(waves.length, isDoubleShot ? 2 : 1);
        let shownAnyWave = this.showSplashDamage(waves[0] ?? [], muzzle);
        for (let throwIndex = 1; throwIndex < throwCount; throwIndex++) {
            await this.rangedProjectiles.fire({
                from: muzzle,
                to: effectivePosition,
                big: bigProjectile,
                tsarCannonball: areaThrowUnitName === "tsar cannon",
                gargantuanRock: areaThrowUnitName === "gargantuan",
            });
            shownAnyWave = this.showSplashDamage(waves[throwIndex] ?? [], muzzle) || shownAnyWave;
        }
        if (!shownAnyWave) {
            this.combatVisuals.showDamageVisualsFromDiff(
                preState,
                effectiveCell,
                undefined,
                undefined,
                fleshShieldDamageByUnit,
            );
        }
        this.sc_damageStatsUpdateNeeded = true;
        this.unitsHolder.refreshStackPowerForAllUnits();
        this.hoverManager.clearAOEArea();
        this.hoverManager.clearAttackVisuals();
        this.hoverManager.clearHoverSilhouette();
        this.cleanupDeadUnits();
        this.refreshUnits();
        if (result.completed) {
            this.applyTurnEngineEvents(result.events, unitSnapshot);
        } else if (replayRecord) {
            // The re-apply was rejected but the server did resolve this throw. Apply what it recorded so the
            // deaths, the turn advance and any lap mechanics riding on this action still land — the same
            // fallback playReplayCastSpellAction takes. Amounts reconcile from the next snapshot.
            this.applyReplayEvents(replayRecord.events);
        }
    }
    /**
     * Pick the visible edge of `target` a ranged shot is aimed at, from the current cursor position.
     * Returns bounded intent — the target cell and its side (RangeAttackCellSide) — for the engine to
     * validate and reconstruct; the raw position is intentionally NOT sent. Uses the same inputs as
     * the hover arrow so the committed shot matches what the player saw. Returns undefined when no
     * side is observable (the target is fully hidden), letting the engine fall back to its default.
     */
    /**
     * INCOMING-THREAT PREVIEW — a downtime planning aid, available ONLY while it is not your turn.
     *
     * Shift-click an enemy shooter to pin it (the existing inspect selection), then hover your own units:
     * each hover draws the shot that shooter would take at that unit — the trajectory it would fly, the
     * unit that would actually be struck if somebody screens it, and the distance falloff band it would
     * land at (the same 🎯1/1 … 1/8 the aiming player sees). Answers "who is safe where" before you commit
     * next turn's positions, instead of eyeballing the shot-range ring.
     *
     * Gated to the opponent's turn on purpose: during YOUR turn the arrow would fight with your own
     * aiming visuals for the same Graphics layer and read as if you were targeting your own unit.
     *
     * Returns true when it rendered, so the caller leaves the preview alone for this frame.
     */
    protected renderIncomingThreatPreview(hoveredUnit: Unit | undefined): boolean {
        const shooter = this.currentShiftedUnit;
        if (
            !this.isEnemyActiveTurn() ||
            !shooter ||
            !(shooter instanceof RenderableUnit) ||
            shooter.isDead() ||
            shooter.getAttackType() !== AttackVals.RANGE ||
            shooter.getRangeShots() <= 0 ||
            shooter.hasAbilityActive("Handyman") ||
            !hoveredUnit ||
            hoveredUnit.isDead() ||
            // Only a shot at the shooter's ENEMY is a threat; hovering its own allies previews nothing.
            hoveredUnit.getTeam() === shooter.getTeam() ||
            !this.attackHandler
        ) {
            return false;
        }

        const gs = this.sc_sceneSettings.getGridSettings();
        // Aim at the same visible edge a real shot resolves to, so the line and the falloff band match
        // what the shooter would actually get rather than a centre-to-centre approximation.
        const aim = this.resolveRangeAimForTarget(shooter, hoveredUnit, hoveredUnit.getPosition());
        const aimPos = aim?.position ?? hoveredUnit.getPosition();

        // Who the shot really meets: a plain shot stops at the FIRST unit on the line, so a teammate
        // standing in front turns this into a screen rather than a hit on the hovered unit.
        const evaluation = this.attackHandler.evaluateRangeAttack(
            this.unitsHolder.getAllUnits(),
            shooter,
            shooter.getPosition(),
            aimPos,
            shooter.hasAbilityActive("Through Shot"),
            false,
            shooter.hasAbilityActive("Large Caliber") || shooter.hasAbilityActive("Area Throw"),
        );
        const interceptor = evaluation.affectedUnits?.[0]?.[0];
        const screened = !!interceptor && interceptor.getId() !== hoveredUnit.getId();
        const impactUnit = (interceptor ?? hoveredUnit) as RenderableUnit;
        const impactAim = screened ? this.resolveRangeAimForTarget(shooter, impactUnit, impactUnit.getPosition()) : aim;
        const impactLogical = impactAim?.position ?? impactUnit.getPosition();
        const impactPos = impactAim
            ? projectedRangeAttackCellSideCenter(impactAim.cell, impactAim.side, gs)
            : projectBattlefieldPoint(impactLogical, gs);

        // Falloff the SHOOTER would apply on THIS ray — taken from the evaluation above so it includes
        // smoke (a ray crossing a smoked cell doubles the divisor, capped at 1/8), not just distance.
        const divisor = evaluation.rangeAttackDivisors[0] ?? this.attackHandler.getRangeAttackDivisor(shooter, aimPos);

        const shooterLogical = shooter.getPosition();
        const shooterCenter = projectBattlefieldPoint(shooterLogical, gs);
        const smokeLogical = this.resolveSmokeEntryPoint(shooterLogical, impactLogical);
        this.hoverManager.drawAttackArrow(
            shooterCenter,
            impactPos,
            undefined,
            smokeLogical ? projectBattlefieldPoint(smokeLogical, gs) : undefined,
        );
        this.highlightScatteredObstaclesAlongTrajectory(shooterLogical, impactLogical);
        this.hoverManager.addTargetHighlight(impactUnit);

        const line = screened
            ? `🎯1/${divisor}  ${shooter.getName()} → ${impactUnit.getName()} (screens ${hoveredUnit.getName()})`
            : `🎯1/${divisor}  ${shooter.getName()} → ${hoveredUnit.getName()}`;
        if (this.sc_hoverInfoArr[0] !== line) {
            this.sc_hoverInfoArr = [line];
            this.sc_hoverTextUpdateNeeded = true;
        }
        return true;
    }
    /**
     * Where a shot from `from` to `to` FIRST enters smoke, or undefined if the ray never crosses a cloud.
     *
     * Uses the engine's own ray tracer (traceGridRayCells — the same walk evaluateRangeAttack performs) and
     * the authoritative cloud store, so the red segment on the arrow marks exactly the stretch the engine
     * will halve. Deriving it separately would risk showing a penalty the shot does not take.
     */
    protected resolveSmokeEntryPoint(from: HoCMath.XY, to: HoCMath.XY): HoCMath.XY | undefined {
        const clouds = FightStateManager.getInstance().getFightProperties().getSmokeClouds();
        if (!clouds.size()) {
            return undefined;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        for (const [cell, firstPosition] of RayTraversal.traceGridRayCells(gs, from, to)) {
            if (clouds.has(cell)) {
                return firstPosition;
            }
        }
        return undefined;
    }
    private resolveRangeAimForTarget(
        attacker: RenderableUnit,
        target: Unit,
        aimAt: HoCMath.XY = this.sc_mouseWorld,
    ): GridMath.IClosestSideCenter | undefined {
        const gs = this.sc_sceneSettings.getGridSettings();
        return GridMath.getClosestSideCenterDetailed(
            this.grid.getMatrix(),
            gs,
            // The "mouse" position selects the aimed cell/side. For a human shot this is the live
            // cursor; AI/replay shots pass the target itself so the edge is resolved from the shot's
            // own geometry, not from wherever the human cursor happens to sit.
            aimAt,
            attacker.getPosition(),
            target.getPosition(),
            attacker.isSmallSize(),
            target.isSmallSize(),
            attacker.getTeam(),
            attacker.hasAbilityActive("Through Shot"),
        );
    }
    private shotRangeColorForHoveredUnit(unit: Unit): number {
        const friendlyTeam = this.getViewerTeam() ?? this.currentActiveUnit?.getTeam() ?? TeamVals.LOWER;
        return hoveredShotRangeColor(unit.getTeam() !== friendlyTeam);
    }
    /**
     * Exterior cell edges of the hovered enemy, evaluated independently against the authoritative ray tracer.
     * A green edge means a shot ending at that exact edge reaches the hovered unit; red means terrain or
     * another stack intercepts it. Internal seams of a multi-cell footprint are intentionally omitted.
     */
    private rangeTargetEdgeVisuals(attacker: RenderableUnit, target: Unit): RangeTargetEdgeVisual[] {
        const gs = this.sc_sceneSettings.getGridSettings();
        const half = gs.getHalfStep();
        const throughShot = attacker.hasAbilityActive("Through Shot");
        const aoeShot = attacker.hasAbilityActive("Large Caliber") || attacker.hasAbilityActive("Area Throw");
        const result: RangeTargetEdgeVisual[] = [];

        for (const { cell, side } of rangeTargetExteriorEdges(target.getCells())) {
            const center = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), half);
            // The painted edge stays on the exact seam below, but the authoritative ray must use the
            // engine's attacker-relative one-pixel inward nudge. An exact RIGHT/UP seam coordinate maps
            // to the neighbouring cell and falsely reports that a plainly valid shot misses the target.
            const aim = rangeTargetEdgeEvaluationAim(gs, cell, side, attacker.getPosition());
            const evaluation = this.attackHandler.evaluateRangeAttack(
                this.unitsHolder.getAllUnits(),
                attacker,
                attacker.getPosition(),
                aim,
                throughShot,
                false,
                aoeShot,
            );
            const reachesTarget =
                throughShot || aoeShot
                    ? evaluation.affectedUnits.some((group) =>
                          group.some((affected) => affected.getId() === target.getId()),
                      )
                    : evaluation.affectedUnits[0]?.[0]?.getId() === target.getId();
            const targetHitIndex = evaluation.affectedUnits.findIndex((group) =>
                group.some((affected) => affected.getId() === target.getId()),
            );
            const rangeDivisor =
                evaluation.rangeAttackDivisors[targetHitIndex] ??
                this.attackHandler.getRangeAttackDivisor(attacker, aim);
            let logicalFrom: HoCMath.XY;
            let logicalTo: HoCMath.XY;
            switch (side) {
                case GridMath.RangeAttackCellSide.LEFT:
                    logicalFrom = { x: center.x - half, y: center.y - half };
                    logicalTo = { x: center.x - half, y: center.y + half };
                    break;
                case GridMath.RangeAttackCellSide.RIGHT:
                    logicalFrom = { x: center.x + half, y: center.y - half };
                    logicalTo = { x: center.x + half, y: center.y + half };
                    break;
                case GridMath.RangeAttackCellSide.DOWN:
                    logicalFrom = { x: center.x - half, y: center.y - half };
                    logicalTo = { x: center.x + half, y: center.y - half };
                    break;
                case GridMath.RangeAttackCellSide.UP:
                default:
                    logicalFrom = { x: center.x - half, y: center.y + half };
                    logicalTo = { x: center.x + half, y: center.y + half };
                    break;
            }
            const shootable =
                rangeTargetEdgeIsSelectable(
                    this.grid.getMatrix(),
                    gs,
                    cell,
                    side,
                    attacker.getPosition(),
                    target.getPosition(),
                    attacker.isSmallSize(),
                    target.isSmallSize(),
                    attacker.getTeam(),
                    throughShot,
                ) &&
                !evaluation.attackObstacle &&
                reachesTarget;
            if (!shootable) continue;
            const logicalCenter = {
                x: (logicalFrom.x + logicalTo.x) * 0.5,
                y: (logicalFrom.y + logicalTo.y) * 0.5,
            };
            const markerCell = rangeTargetEdgeMarkerCell(cell, side);
            const markerLogicalCenter = GridMath.getPositionForCell(markerCell, gs.getMinX(), gs.getStep(), half);
            const shiftedMarkerLogicalCenter = rangeTargetEdgeMarkerPosition(
                markerLogicalCenter,
                gs.getCellSize(),
                side,
            );
            result.push({
                from: projectBattlefieldPoint(logicalFrom, gs),
                to: projectBattlefieldPoint(logicalTo, gs),
                // Shift before projection so vertical arrows remain on the visual centreline of the
                // perspective cell instead of moving along an unrelated screen-space vertical.
                markerCenter: projectBattlefieldPoint(shiftedMarkerLogicalCenter, gs),
                cell: { ...cell },
                side,
                notchTip: projectBattlefieldPoint(
                    rangeTargetEdgeOutwardNotchTip(logicalCenter, side, gs.getStep() * 0.09),
                    gs,
                ),
                shootable,
                rangeDivisor,
                aimPosition: { ...aim },
                markerScale: rangeTargetEdgeMarkerRowScale(markerCell.y, gs.getGridSize()),
            });
        }
        return result;
    }
    /**
     * Resolve the visible-edge center a ranged projectile should fly to. For a human shot this is the
     * one optimal edge shown by the hover preview; for an AI/replay action it honors the action's
     * explicit aim (aimCell/aimSide) when present, otherwise the edge facing the attacker — matching
     * what the engine resolves, so the projectile lands on the unit it actually hit rather than wherever
     * the human cursor sits.
     */
    private resolveRangeShotAim(
        attacker: RenderableUnit,
        target: Unit,
        replayAction?: Extract<GameAction, { type: "range_attack" }>,
    ): GridMath.IClosestSideCenter | undefined {
        if (!replayAction) {
            const edge = optimalRangeTargetEdge(this.rangeTargetEdgeVisuals(attacker, target), attacker.getPosition());
            return edge
                ? {
                      cell: { ...edge.cell },
                      side: edge.side,
                      position: { ...edge.aimPosition },
                  }
                : undefined;
        }
        if (replayAction.aimCell && replayAction.aimSide !== undefined) {
            return {
                cell: replayAction.aimCell,
                side: replayAction.aimSide,
                position: GridMath.getRangeAttackSideCenter(
                    this.sc_sceneSettings.getGridSettings(),
                    replayAction.aimCell,
                    replayAction.aimSide,
                    attacker.getPosition(),
                ),
            };
        }
        return this.resolveRangeAimForTarget(attacker, target, target.getPosition());
    }
    private async executeAttackSequence(
        attacker: RenderableUnit,
        target: Unit,
        attackFrom: HoCMath.XY,
        replayAction?: Extract<GameAction, { type: "melee_attack" }> | Extract<GameAction, { type: "range_attack" }>,
    ): Promise<boolean> {
        this.sc_moveBlocked = true;
        // The click has committed the attack. Drop the aim silhouette, directional sword, damage
        // prediction and attack cursor immediately instead of leaving them over the board until impact.
        this.clearCommittedBoardActionPreview();

        // Create a local damage object for animation
        const damageForAnimation: IVisibleDamage = {
            render: false,
            amount: 0,
            unitPosition: { x: 0, y: 0 },
            unitIsSmall: true,
            hits: [],
        };

        // Pre-calculate primary attack direction (Target - Attacker) for uniform visuals
        const gs = this.sc_sceneSettings.getGridSettings();
        const tVis =
            target instanceof RenderableUnit
                ? target.getVisualCenter(gs)
                : projectBattlefieldPoint(target.getPosition(), gs);
        // Use 'attackFrom' cell to ensure direction is accurate even if unit moves during sequence
        const attPos = GridMath.getPositionForCell(attackFrom, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        const primaryAttackDir = attPos ? { x: tVis.x - attPos.x, y: tVis.y - attPos.y } : { x: 0, y: -1 };

        const attackerBefore = { amount: attacker.getAmountAlive(), health: attacker.getHp() };

        // 1. Target Damage

        // Capture Target Start Amount specifically for death calc
        const targetBeforeAmount = target.getAmountAlive();

        // SNAPSHOT for AOE / Secondary Damage
        // We capture state of ALL units to detect side-effects/AOE
        const unitSnapshots = new Map<
            string,
            { amount: number; hp: number; maxHp: number; pos: HoCMath.XY; visualCenter: HoCMath.XY }
        >();
        for (const u of this.unitsHolder.getAllUnits().values()) {
            unitSnapshots.set(u.getId(), {
                amount: u.getAmountAlive(),
                hp: u.getHp(),
                maxHp: u.getMaxHp(),
                pos: { ...u.getPosition() }, // Clone position
                visualCenter:
                    u instanceof RenderableUnit
                        ? { ...u.getVisualCenter(gs) }
                        : projectBattlefieldPoint(u.getPosition(), gs),
            });
        }

        // Capture the scene-log position so we can read the engine's *isolated* Fire Shield amounts
        // ("X received (N) from Fire Shield") afterwards. The HP-snapshot deltas below lump the burn
        // in with the retaliation on the same unit, so we split them back out into a separate number.
        const logSizeBeforeAttack = this.sc_sceneLog.getLogSize();
        const actionEventSnapshot = this.snapshotRenderableUnits();
        let attackActionEvents: GameEvent[] | undefined;
        let attackTurnEventsApplied = false;
        let attackCleanupWatchdog: ReturnType<typeof setTimeout> | undefined;
        const clearAttackCleanupWatchdog = (): void => {
            if (attackCleanupWatchdog !== undefined) {
                clearTimeout(attackCleanupWatchdog);
                attackCleanupWatchdog = undefined;
            }
        };
        const applyAttackTurnEventsOnce = (): void => {
            if (!attackActionEvents || attackTurnEventsApplied) {
                return;
            }
            attackTurnEventsApplied = true;
            this.applyTurnEngineEvents(attackActionEvents, actionEventSnapshot);
        };
        const scheduleAttackCleanupWatchdog = (): void => {
            clearAttackCleanupWatchdog();
            attackCleanupWatchdog = setTimeout(() => {
                if (
                    attackTurnEventsApplied ||
                    !attackActionEvents ||
                    !this.currentActiveUnit ||
                    this.currentActiveUnit.getId() !== attacker.getId()
                ) {
                    return;
                }

                const fightProps = FightStateManager.getInstance().getFightProperties();
                if (!fightProps.hasAlreadyMadeTurn(attacker.getId())) {
                    return;
                }

                console.warn("Recovering delayed attack cleanup for completed turn", {
                    attackerId: attacker.getId(),
                    attackerName: attacker.getName(),
                });
                this.hoverManager.clearHoverSilhouette();
                this.hoverManager.clearAttackVisuals();
                this.hoverManager.hoverAttackFromCell = undefined;
                this.sc_moveBlocked = false;
                this.sc_visibleStateUpdateNeeded = true;
                applyAttackTurnEventsOnce();
            }, 3500);
        };
        const applyAttackActionResult = (result: ReturnType<GameActionEngine["apply"]>): boolean => {
            if (!result.completed) {
                this.sc_moveBlocked = false;
                return false;
            }
            const attackEvent = result.events.find((event) => event.type === "unit_attacked");
            if (attackEvent?.type !== "unit_attacked") {
                this.sc_moveBlocked = false;
                return false;
            }

            // Attribute kills now: performCleanup tears the dead down (spawning death visuals) BEFORE
            // these events reach applyTurnEngineEvents, so the event-switch note there is too late here.
            this.noteDeathBlowsFromAttackEvent(attackEvent);

            damageForAnimation.amount = attackEvent.damage.amount;
            damageForAnimation.render = attackEvent.damage.render;
            damageForAnimation.unitPosition = { ...attackEvent.damage.unitPosition };
            damageForAnimation.unitIsSmall = attackEvent.damage.unitIsSmall;
            damageForAnimation.unitId = attackEvent.damage.unitId;
            // A fully-dodged attack (Dodge / Small Specie / Boar Saliva / Broken Aegis) — drives the
            // "MISS" pop + bullet-time dodge below instead of a damage number.
            damageForAnimation.missed = attackEvent.damage.missed;
            damageForAnimation.hits = attackEvent.damage.hits?.map((hit) => ({ ...hit }));
            // Carry the per-affected-unit AOE breakdown (Gargantuan Area Throw / Large Caliber). Without
            // it the live path can't tell a Double-Shot AOE landed twice — so its second projectile and
            // second damage number were both dropped (the damage read as a single summed hit).
            damageForAnimation.splash = attackEvent.damage.splash?.map((entry) => ({
                ...entry,
                position: { ...entry.position },
            }));
            damageForAnimation.secondary = attackEvent.damage.secondary?.map((entry) => ({
                ...entry,
                position: { ...entry.position },
            }));
            // Carry Zena's Chakram ricochet circles (the per-leg swept cells + who each clipped) so the disc
            // actually FLIES its loops in the LIVE sandbox path. Without this, the reconstructed
            // damageForAnimation dropped chakramArcs and the disc just returned home with no circle at all.
            // (The ranked replay passes the event's damage straight through, so it was already fine there.)
            damageForAnimation.chakramArcs = attackEvent.damage.chakramArcs?.map((arc) => ({
                ...arc,
                cells: arc.cells.map((cell) => ({ ...cell })),
            }));
            attackActionEvents = result.events;
            scheduleAttackCleanupWatchdog();
            this.sc_damageStatsUpdateNeeded = true;
            return true;
        };

        // Check for Range Attack
        // If attackFrom is current position AND target is far away (or strictly defined as range target), use Range logic.
        // We can check if it is in canAttackByRangeTargets if available, or deduce from distance.
        const dist = HoCMath.getDistance(attackFrom, target.getPosition());
        const isRange =
            replayAction?.type === "range_attack" ||
            (attacker.getAttackTypeSelection() === AttackVals.RANGE &&
                (this.canAttackByRangeTargets?.has(target.getId()) ||
                    (dist > GridConstants.STEP * 1.5 &&
                        attackFrom.x === attacker.getPosition().x &&
                        attackFrom.y === attacker.getPosition().y)));

        if (isRange) {
            // Resolve which VISIBLE EDGE of the target the shot is aimed at — the shot flies
            // attacker-center -> that edge center, never to the target center. Only the bounded intent
            // (cell + side) goes to the engine/server, which validates and rebuilds the exact
            // trajectory. For a human shot this is the cursor-aimed edge (matches the hover arrow); for
            // an AI/replay action it's the action's own edge, NOT the live cursor — otherwise an
            // AI unit's projectile flew toward wherever the human cursor sat and read as a miss.
            const aim = this.resolveRangeShotAim(
                attacker,
                target,
                replayAction?.type === "range_attack" ? replayAction : undefined,
            );
            // No visible edge means there is nothing legal to aim at — drop a locally-initiated shot
            // rather than sending an aimless action the engine rejects. A replay/authoritative action
            // still goes through: its own recorded aim governs.
            if (!aim && !replayAction) {
                this.sc_moveBlocked = false;
                return false;
            }
            {
                const aggrBlockedTarget = replayAction
                    ? undefined
                    : this.isRangeAttackBlockedByAggr(target, aim?.position);
                if (aggrBlockedTarget) {
                    this.sc_moveBlocked = false;
                    this.showAggrBlockedActionHint(aggrBlockedTarget);
                    return false;
                }
            }
            const action: GameAction =
                replayAction?.type === "range_attack"
                    ? {
                          ...cloneReplayData(replayAction),
                          // An AI action carries no explicit aim; stamp the resolved edge so the engine
                          // hits the same edge the projectile flies to (a recorded aim is kept as-is).
                          aimCell: replayAction.aimCell ?? aim?.cell,
                          aimSide: replayAction.aimSide ?? aim?.side,
                      }
                    : {
                          type: "range_attack",
                          attackerId: attacker.getId(),
                          targetId: target.getId(),
                          aimCell: aim?.cell,
                          aimSide: aim?.side,
                      };
            if (this.shouldDeferActionToAuthoritativeReplay(action)) {
                return this.submitActionForAuthoritativeReplay(action);
            }

            await this.playDirectionalAttackOneShot(attacker, target, 360, false);

            // Fire the projectile BEFORE applying damage so the stack-count drop, damage
            // number and death skull all land in sync with the projectile's arrival. It flies to the
            // aimed visible-edge center (what the engine resolves the shot to), NOT the target's
            // geometric center — otherwise the arrow points at an edge but the projectile lands center.
            // A plain (non-piercing) shot stops at the first unit on its trajectory. If a unit
            // intercepts the shot before the aimed target, land the projectile on THAT unit (where the
            // damage lands) instead of the aimed edge behind it. Through Shot pierces, so it still flies
            // to the aimed edge.
            const interceptUnit = attacker.hasAbilityActive("Through Shot")
                ? undefined
                : this.resolveFirstRangeHitUnit(target, aim?.position);
            const intercepted = !!interceptUnit && interceptUnit.getId() !== target.getId();
            const interceptAim =
                intercepted && interceptUnit instanceof RenderableUnit
                    ? this.resolveRangeAimForTarget(attacker, interceptUnit, interceptUnit.getPosition())
                    : undefined;
            const shotTarget = interceptAim
                ? projectedRangeAttackCellSideCenter(interceptAim.cell, interceptAim.side, gs)
                : aim
                  ? projectedRangeAttackCellSideCenter(aim.cell, aim.side, gs)
                  : projectBattlefieldPoint(target.getPosition(), gs);
            const muzzle = attacker.getRangedProjectileOrigin(shotTarget, gs);
            const bigProjectile = BIG_PROJECTILE_UNITS.has(attacker.getName().toLowerCase());
            // ABILITY Chakram (Zena): throw the spinning disc instead of a bolt. Gated on the ABILITY, not
            // the creature name, so a stolen/granted Chakram throws one too — and a Broken one does not.
            await this.rangedProjectiles.fire({
                from: muzzle,
                to: shotTarget,
                big: bigProjectile,
                chakram: attacker.hasAbilityActive("Chakram"),
                orcAxe: attacker.getName().trim().toLowerCase() === "orc",
                arbalesterBolt: attacker.getName().trim().toLowerCase() === "arbalester",
                centaurSpear: attacker.getName().trim().toLowerCase() === "centaur",
                dryadDart: attacker.getName().trim().toLowerCase() === "dryad",
                beholderEye: attacker.getName().trim().toLowerCase() === "beholder",
                elfArrow: attacker.getName().trim().toLowerCase() === "elf",
                medusaSerpent: attacker.getName().trim().toLowerCase() === "medusa",
                cyclopsRock: attacker.getName().trim().toLowerCase() === "cyclops",
                monkOrb: attacker.getName().trim().toLowerCase() === "monk",
                tsarCannonball: attacker.getName().trim().toLowerCase() === "tsar cannon",
                gargantuanRock: attacker.getName().trim().toLowerCase() === "gargantuan",
            });

            if (!applyAttackActionResult(this.createActionEngine().apply(action))) {
                return false;
            }

            const liveAttackEvent = attackActionEvents?.find(
                (event): event is Extract<GameEvent, { type: "unit_attacked" }> => event.type === "unit_attacked",
            );

            // Resolve shot two only AFTER the engine applies shot one. Double Shot can kill the first
            // interceptor and retarget the follow-up, while a ranged response may sit between the two
            // outgoing animations. The authoritative event preserves those per-shot victims in order.
            if (liveAttackEvent) {
                const projectilePlan = resolveRangeProjectileImpactPlan(
                    liveAttackEvent,
                    target.getId(),
                    attacker.getPosition(),
                    attacker.hasAbilityActive("Through Shot"),
                    !!(attacker.getAbility("Double Shot") ?? attacker.getAbility("Crafted Double Shot")),
                );
                const secondImpact = projectilePlan[1];
                if (secondImpact) {
                    const secondProjectile = this.resolveRangeProjectilePlaybackTarget(
                        secondImpact,
                        target,
                        unitSnapshots.get(secondImpact.targetUnitId)?.visualCenter,
                    );
                    void this.playReplayProjectile(attacker, secondProjectile.target, secondProjectile.position);
                }
            }

            // Ranged counter: when the defender shoots back, the engine records a response shot as an
            // animation targeting the attacker (only the ranged-response branch emits one for a
            // range_attack). Live play otherwise just floats the counter's damage number (section 2
            // below) — fire the return projectile so the exchange reads the same as ranked's replay
            // path (playReplayRetaliation), which uses this exact signal.
            if (
                liveAttackEvent &&
                target instanceof RenderableUnit &&
                liveAttackEvent.animations.some((animation) => animation.affectedUnitId === attacker.getId())
            ) {
                target.playOneShotAnimation(this.prepareDirectionalAttackState(target, attacker, false));
                // Retaliation has no live cursor-owned edge: always land it at the figure's visual center.
                const responseTarget = attacker.getVisualCenter(gs);
                const responseMuzzle = target.getRangedProjectileOrigin(responseTarget, gs);
                const bigResponse = BIG_PROJECTILE_UNITS.has(target.getName().toLowerCase());
                // The RESPONDER throws its own weapon: a counter-shooting Zena sends the chakram back, not a
                // bolt. Gated on the responder's ability, mirroring the outgoing shot.
                void this.rangedProjectiles.fire({
                    from: responseMuzzle,
                    to: responseTarget,
                    big: bigResponse,
                    chakram: target.hasAbilityActive("Chakram"),
                    orcAxe: target.getName().trim().toLowerCase() === "orc",
                    arbalesterBolt: target.getName().trim().toLowerCase() === "arbalester",
                    centaurSpear: target.getName().trim().toLowerCase() === "centaur",
                    dryadDart: target.getName().trim().toLowerCase() === "dryad",
                    beholderEye: target.getName().trim().toLowerCase() === "beholder",
                    elfArrow: target.getName().trim().toLowerCase() === "elf",
                    medusaSerpent: target.getName().trim().toLowerCase() === "medusa",
                    cyclopsRock: target.getName().trim().toLowerCase() === "cyclops",
                    monkOrb: target.getName().trim().toLowerCase() === "monk",
                    tsarCannonball: target.getName().trim().toLowerCase() === "tsar cannon",
                    gargantuanRock: target.getName().trim().toLowerCase() === "gargantuan",
                });
            }
        } else {
            {
                const aggrBlockedTarget = replayAction ? undefined : this.isAttackBlockedByAggr(target, "melee");
                if (aggrBlockedTarget) {
                    this.sc_moveBlocked = false;
                    this.showAggrBlockedActionHint(aggrBlockedTarget);
                    return false;
                }
            }
            const routeMetadata = this.currentActiveKnownPaths?.get((attackFrom.x << 4) | attackFrom.y)?.[0];
            const action: GameAction =
                replayAction?.type === "melee_attack"
                    ? cloneReplayData(replayAction)
                    : {
                          type: "melee_attack",
                          attackerId: attacker.getId(),
                          targetId: target.getId(),
                          attackFrom,
                          path: routeMetadata?.route,
                          hasLavaCell: routeMetadata?.hasLavaCell,
                          hasWaterCell: routeMetadata?.hasWaterCell,
                      };
            if (this.shouldDeferActionToAuthoritativeReplay(action)) {
                return this.submitActionForAuthoritativeReplay(action);
            }
            // A local (sandbox) move+melee is recorded as TWO actions: a move_unit (whose own replay record
            // animates the walk) then this melee_attack. The unit is already standing on attackFrom, so the
            // engine resolves a stationary strike — but leaving the move `path` on the recorded melee_attack
            // makes the replay's melee-approach re-walk that same route on top of the move_unit record, so the
            // attacker appears to travel to the target TWICE. Strip the path for the local strike; the
            // authoritative (ranked) branch above keeps it so the server moves-and-strikes atomically.
            const localMeleeAction: GameAction =
                action.type === "melee_attack" && action.path?.length ? { ...action, path: undefined } : action;
            if (!applyAttackActionResult(this.createActionEngine().apply(localMeleeAction))) {
                return false;
            }

            await this.playDirectionalAttackOneShot(attacker, target, 360, true);

            // Melee landed: lunge the attacker a touch toward the target along the attack trajectory,
            // then spring back (applyRecoil's out-and-back envelope) so the strike reads as committed
            // rather than a static stand-and-deal. Range attacks throw a projectile, so no lunge there.
            const lungeLen = Math.hypot(primaryAttackDir.x, primaryAttackDir.y);
            if (lungeLen > 0.001) {
                const lungeMag = gs.getCellSize() * 0.22;
                const lungeX = (primaryAttackDir.x / lungeLen) * lungeMag;
                const lungeY = (primaryAttackDir.y / lungeLen) * lungeMag;
                // One lunge per landed hit — e.g. Double Punch strikes twice — staggered to line up
                // with the staggered damage numbers (index * 240ms) so each punch reads as its own
                // committed strike instead of a single nudge for the whole combo. The recoil envelope
                // is ~220ms, so it springs back before the next punch fires.
                const hitCount = Math.max(1, damageForAnimation.hits?.length ?? 1);
                for (let i = 0; i < hitCount; i++) {
                    if (i === 0) {
                        attacker.applyRecoil(lungeX, lungeY);
                    } else {
                        setTimeout(() => attacker.applyRecoil(lungeX, lungeY), i * ATTACK_HIT_STAGGER_MS);
                    }
                }

                // Black Dragon's Fire Breath — wind-up sweep, fired here (during the swing). See the
                // ABILITY VFX CONTRACT: this same helper is called from the ranked replay path too.
                this.spawnFireBreathVfx(attacker, target, damageForAnimation);
            }

            // Thunderbird's Chain Lightning — purple bolt through the chained enemies, fired at impact.
            // Shared helper (see ABILITY VFX CONTRACT); the ranked replay path calls the same one.
            this.spawnChainLightningVfx(attacker, target, damageForAnimation);

            // Pikeman's Skewer Strike: a wind spear through the target and the unit(s) behind it. Reads
            // the authoritative damage.secondary from the live engine result (no-op unless it skewered).
            const skewerAttackEvent = attackActionEvents?.find(
                (e): e is Extract<GameEvent, { type: "unit_attacked" }> => e.type === "unit_attacked",
            );
            this.spawnSkewerWindSpearVfx(attacker, target, skewerAttackEvent?.damage);
            // Shatter Armor: red wound gashes across the target on a landed strike.
            this.spawnShatterArmorSlashVfx(attacker, target, skewerAttackEvent?.damage);
            // Deep Wounds: one orange claw slash per application recorded on this strike (a double-punch
            // wounder shows two). Shared helper — the ranked replay fires the same one in showReplayAttackDamage.
            this.spawnDeepWoundsClaws(skewerAttackEvent?.damage?.deepWounds);
            this.popDullingDefenseApplications(attackActionEvents, attacker.getId());
            // IMPACT (live melee) — same contract as the replay path: pops land with the strike.
            this.flushEffectPops();
        }

        // ABILITY Chakram (Zena): fly the disc along the half circles the engine actually resolved, so the
        // ricochet is something the player WATCHES rather than damage appearing on far-off units. Fired and
        // not awaited: the arcs play out while the damage numbers land, the same way the second Double Shot
        // projectile overlaps its own damage.
        void this.playChakramArcs(attacker, damageForAnimation, target);

        // Predatory Assimilation is event-gated: draw the victim -> Queen transfer only when the engine
        // says this initiating strike actually stole an ability. Response steals are rendered with the
        // response damage below, using the same event payload in the opposite direction.
        this.spawnAbilityStealVfx(attackActionEvents, attacker.getId(), actionEventSnapshot);

        // Flesh Shield is event-driven so its aura owner receives one labelled value even when many AOE
        // victims redirected damage in this exchange. Keep these totals for the HP-diff passes below: that
        // damage is already spoken for and must not reappear as a red hit or a fake counterattack.
        const fleshShieldDamageByUnit = this.showFleshShieldAbsorbedDamage(
            damageForAnimation.secondary,
            attacker.getVisualCenter(gs),
            180,
        );
        this.showWaterShieldAbsorbs(damageForAnimation.secondary, attacker.getVisualCenter(gs), 180);

        // Devour Essence heal (Hydra devouring a slain enemy): green "+N" + buff-wash on the devourer.
        this.showDevourEssenceHeals(damageForAnimation.secondary);

        // Fire damage burst — Fire Shield reflect, dragon-breath burn, Fireforged Sword strike. Lives
        // in this shared section (not the melee branch above) so a RANGED attacker's fire also burns,
        // and delayed like the Flesh Shield pops so it lands with the numbers rather than the wind-up.
        // Same ABILITY VFX CONTRACT: the ranked replay path fires this very helper.
        this.spawnFireDamageVfx(attacker, target, damageForAnimation, 180);

        // Fully-missed attack: no damage number to draw — pop "MISS" under the dodging unit and play
        // its bullet-time dodge instead (no-op unless damageForAnimation.missed).
        this.showAttackMissedVfx(attacker, target, damageForAnimation);

        // Lucky Strike procs (attacker and/or responder): gold flash + "LUCKY!" over each striker.
        this.spawnLuckyStrikeVfx(damageForAnimation);

        // 1. Target Damage
        // AOE shots (Gargantuan Area Throw / Large Caliber) convey their damage per-affected-unit via
        // `splash` — including two entries on the target for a Double-Shot AOE. Render those (one number
        // per shot, per unit) instead of the single-target block below, which only knows `amount`/`hits`.
        if (damageForAnimation.splash?.length) {
            // Chakram bounce victims land one-by-one via playChakramArcs (synced to the disc), so exclude them
            // from the all-at-once splash here to avoid double numbers / early pops.
            const chakramVictims = this.chakramBounceVictimIds(damageForAnimation);
            const nonChakramSplash = chakramVictims.size
                ? damageForAnimation.splash.filter((entry) => !chakramVictims.has(entry.unitId))
                : damageForAnimation.splash;
            this.showSplashDamage(nonChakramSplash, attacker.getVisualCenter(this.sc_sceneSettings.getGridSettings()));
        } else if (damageForAnimation.amount > 0) {
            const gs = this.sc_sceneSettings.getGridSettings();
            const aCenter = attacker.getVisualCenter(gs);

            // Draw the number over the unit the engine ACTUALLY hit, not the clicked one. A plain
            // (non-piercing) shot stops at the first enemy on its line of fire, so when somebody screens
            // the aimed target the damage belongs to the SCREEN — the projectile already flies there
            // (see the interception resolution above), and this is what puts the number there too.
            // `unitPosition`/`unitIsSmall` come from the engine's own damage payload, so they still
            // resolve when the hit KILLED the victim and its sprite is already gone; the ranked replay
            // path reads exactly the same fields (showReplayAttackDamage).
            const primaryVictimId = damageForAnimation.unitId ?? target.getId();
            const damagedUnit = this.unitsHolder.getAllUnits().get(primaryVictimId) ?? target;
            const rTarget = damagedUnit as RenderableUnit;
            const tVis =
                damageForAnimation.unitPosition &&
                (damageForAnimation.unitPosition.x || damageForAnimation.unitPosition.y)
                    ? projectBattlefieldPoint(damageForAnimation.unitPosition, gs)
                    : typeof rTarget.getVisualCenter === "function"
                      ? rTarget.getVisualCenter(gs)
                      : projectBattlefieldPoint(damagedUnit.getPosition(), gs);
            const damageFlagAnchor =
                typeof rTarget.getDamagePredictionAnchor === "function"
                    ? rTarget.getDamagePredictionAnchor(gs)
                    : undefined;

            // Calculate trajectory direction (Attacker -> Target)
            const dir = { x: tVis.x - aCenter.x, y: tVis.y - aCenter.y };
            const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);

            // The struck cap yields away from the incoming blow, then springs back to its cell. The
            // engine state is already applied here, so lethal victims are dead and intentionally skip
            // this reaction in favour of the existing death animation.
            const struckUnit =
                this.unitsHolder.getAllUnits().get(primaryVictimId) ??
                (primaryVictimId === target.getId() ? target : undefined);
            this.applyHitReactionFromPoint(struckUnit, aCenter);

            // An intercepted shot damages the SCREEN, and the unit we aimed at stands BEHIND it —
            // attacker, screen and aimed unit are collinear by construction. The offsets below push the
            // number away from the attacker so it doesn't cover its own victim, but along that line
            // "away" walks it straight onto the unit behind: the screen's damage then reads as the aimed
            // target's. Push INWARD (back toward the attacker) when the victim isn't who we aimed at —
            // still clear of the sprite, but unambiguously on the unit that actually took the hit.
            const offsetSign = primaryVictimId !== target.getId() ? -1 : 1;

            let spawnPos = { x: tVis.x, y: tVis.y };
            if (len > 0.001) {
                // Normalize
                const ndx = (dir.x / len) * offsetSign;
                const ndy = (dir.y / len) * offsetSign;

                // Push text out by radius + margin
                // Small unit radius ~0.5 cell, Large ~1.0 cell. Add extra margin.
                const targetRadius = damageForAnimation.unitIsSmall ? gs.getCellSize() * 0.5 : gs.getCellSize() * 1.0;
                const margin = gs.getCellSize() * 0.5;
                spawnPos.x += ndx * (targetRadius + margin);
                spawnPos.y += ndy * (targetRadius + margin);
            } else {
                // Fallback for overlapping? Just push up
                spawnPos.y += gs.getCellSize();
            }

            // Calculation of actual dead count (Stack Size Diff) — read from whoever actually took the
            // hit, using the pre-attack snapshot so an intercepted shot counts the SCREEN's losses.
            const damagedBeforeAmount = unitSnapshots.get(primaryVictimId)?.amount ?? targetBeforeAmount;
            const targetDiedCount = Math.max(0, damagedBeforeAmount - damagedUnit.getAmountAlive());

            if (damageForAnimation.hits && damageForAnimation.hits.length > 0) {
                const totalHits = damageForAnimation.hits.length;
                damageForAnimation.hits.forEach((dmg, index) => {
                    // Capture spawnPos for the closure.
                    const pos = { ...spawnPos };

                    // Apply Spatial Offsets matching Melee/Ranged logic
                    // Strategy: First hit is "Deep" (+30), Second hit is "Further" (+70)
                    if (len > 0.001) {
                        // dir is already computed (tVis - aCenter); offsetSign keeps an intercepted
                        // shot's numbers on the screen instead of drifting them onto the unit behind.
                        const ndx = (dir.x / len) * offsetSign;
                        const ndy = (dir.y / len) * offsetSign;
                        let offset = 0;
                        if (totalHits === 1) {
                            offset = 20;
                        } else {
                            if (index === 0) {
                                offset = 75;
                            } else if (index === 1) {
                                offset = 20;
                            }
                        }
                        pos.x += ndx * offset;
                        pos.y += ndy * offset;
                    }

                    // Stagger multi-hit numbers slightly so they read as distinct hits
                    // (the floating-number system also stacks any that still overlap).
                    if (index === 0) {
                        this.combatVisuals.showFloatingDamage(
                            pos,
                            dmg.amount,
                            dir,
                            dmg.unitsDied,
                            undefined,
                            undefined,
                            damageFlagAnchor,
                        );
                    } else {
                        setTimeout(() => {
                            this.combatVisuals.showFloatingDamage(
                                pos,
                                dmg.amount,
                                dir,
                                dmg.unitsDied,
                                undefined,
                                undefined,
                                damageFlagAnchor,
                            );
                        }, index * ATTACK_HIT_STAGGER_MS);
                    }
                });
            } else {
                this.combatVisuals.showFloatingDamage(
                    spawnPos,
                    damageForAnimation.amount,
                    dir,
                    targetDiedCount,
                    undefined,
                    undefined,
                    damageFlagAnchor,
                );
            }
        }

        // Parse the engine's isolated Fire Shield burns from the new log lines, keyed by the burned
        // unit's name, so the snapshot deltas can be split into pure + Fire Shield numbers. Also
        // collect Petrifying Gaze kills ("N <name> killed by Petrifying Gaze") with their count, so
        // that hit can be styled differently (grey damage + a recoil jerk on the target) AND its
        // kill count shown is the gaze-only count, not the target's total deaths.
        const fireShieldByName = new Map<string, number>();
        const petrifyKillsByName = new Map<string, number>();
        // Chain Lightning is applied as its own magic hit (not folded into the attack's damage), so it is
        // drawn as a separate PURPLE number rather than a red one summed into the standard damage.
        //
        // Read from the engine's own secondary entries, NOT from the log line. The line is
        // "<name> got hit <n> by Chain Lightning" plus a kill tag, and the parse below was anchored with $ —
        // so every bounce that KILLED failed to match and fell through to red. Matching on the amount was
        // fragile too (Flesh Shield can split it). The entries carry the unit id outright, which is what the
        // replay and ranked paths already style from.
        const chainLightningUnitIds = new Set(
            (damageForAnimation.secondary ?? [])
                .filter((entry) => entry.source === "chain_lightning")
                .map((entry) => entry.unitId),
        );
        for (const entry of this.sc_sceneLog.getEntriesSince(logSizeBeforeAttack)) {
            const fsMatch = entry.match(/^(.+?) received \((\d+)\) from Fire Shield/);
            if (fsMatch) {
                fireShieldByName.set(fsMatch[1], (fireShieldByName.get(fsMatch[1]) ?? 0) + parseInt(fsMatch[2], 10));
                continue;
            }
            const pgMatch = entry.match(/^(\d+) (.+?) killed by Petrifying Gaze$/);
            if (pgMatch) {
                const nm = pgMatch[2];
                petrifyKillsByName.set(nm, (petrifyKillsByName.get(nm) ?? 0) + parseInt(pgMatch[1], 10));
            }
        }

        // 2. Attacker Damage (Counter-Attack)
        const attackerAfter = { amount: attacker.getAmountAlive(), health: attacker.getHp() };
        this.spawnAbilityStealVfx(attackActionEvents, target.getId(), actionEventSnapshot);

        const stackLost = Math.max(0, attackerBefore.amount - attackerAfter.amount);
        const hpLost = attackerBefore.health - attackerAfter.health;
        this.popDullingDefenseApplications(attackActionEvents, target.getId());

        if (stackLost > 0 || hpLost > 0) {
            const maxHp = attacker.getMaxHp();
            const totalHpBefore = (attackerBefore.amount - 1) * maxHp + attackerBefore.health;
            const totalHpAfter =
                attackerAfter.amount > 0 ? (attackerAfter.amount - 1) * maxHp + attackerAfter.health : 0;
            const damageTaken = totalHpBefore - totalHpAfter;

            if (damageTaken > 0) {
                // Attacker damage floats away from target
                // const gs = this.sc_sceneSettings.getGridSettings(); // Hoisted

                const aVis = attacker.getVisualCenter(gs);

                // Target visual center
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const rTarget = target as any;
                const tVis =
                    typeof rTarget.getVisualCenter === "function"
                        ? rTarget.getVisualCenter(gs)
                        : projectBattlefieldPoint(target.getPosition(), gs);

                // Direction: Target -> Attacker
                const dir = { x: aVis.x - tVis.x, y: aVis.y - tVis.y };
                const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);

                let spawnPos = { x: aVis.x, y: aVis.y };
                if (len > 0.001) {
                    const ndx = dir.x / len;
                    const ndy = dir.y / len;

                    const attackerRadius = attacker.isSmallSize() ? gs.getCellSize() * 0.5 : gs.getCellSize() * 1.0;
                    const margin = gs.getCellSize() * 0.5;
                    spawnPos.x += ndx * (attackerRadius + margin);
                    spawnPos.y += ndy * (attackerRadius + margin);
                } else {
                    spawnPos.y += gs.getCellSize();
                }

                // Split the attacker's HP loss into the pure (retaliation) hit and the Fire Shield
                // burn, shown as two separate numbers (parity with the log). Fire Shield is amber and
                // staggered so it reads as its own distinct hit instead of a single summed number.
                const attackerFireShield = fireShieldByName.get(attacker.getName()) ?? 0;
                const attackerFleshShield = fleshShieldDamageByUnit.get(attacker.getId());
                const lossesNotAbsorbed = Math.max(0, stackLost - (attackerFleshShield?.unitsDied ?? 0));
                const pureDamage = Math.max(0, damageTaken - attackerFireShield - (attackerFleshShield?.amount ?? 0));
                if (pureDamage > 0) {
                    if (!isRange && target instanceof RenderableUnit) {
                        target.playOneShotAnimation(this.prepareDirectionalAttackState(target, attacker, true));
                    }
                    this.combatVisuals.showFloatingDamage(
                        spawnPos,
                        pureDamage,
                        dir,
                        lossesNotAbsorbed,
                        undefined,
                        undefined,
                        attacker.getDamagePredictionAnchor(gs),
                    );
                }
                if (attackerFireShield > 0) {
                    const fsPos = { ...spawnPos };
                    setTimeout(() => {
                        this.combatVisuals.showFloatingDamage(
                            fsPos,
                            attackerFireShield,
                            dir,
                            pureDamage > 0 ? 0 : lossesNotAbsorbed,
                            "#ffb13c",
                            "#7a3800",
                            attacker.getDamagePredictionAnchor(gs),
                        );
                    }, 280);
                }
            }
        }

        // 3. Secondary / AOE Damage
        // Compare current state with snapshot
        // We iterate keys of snapshot to ensure we catch units that might have been deleted/died
        for (const uId of unitSnapshots.keys()) {
            const snap = unitSnapshots.get(uId);
            if (!snap) continue;

            const u = this.unitsHolder.getAllUnits().get(uId);
            // If unit is missing, it means it died and was removed. Treat as 0/0.
            const currentAmount = u ? u.getAmountAlive() : 0;
            const currentHp = u ? u.getHp() : 0;

            // Skip Attacker (Recall: Attacker damage is fully handled in Loop 2 via 'attackerAfter')
            if (uId === attacker.getId()) continue;

            // Calculate total HP lost
            // Use snapshot MaxHP to ensure we can calc damage even if unit died/vanished
            const unitMaxHp = snap.maxHp;
            const totalHpBefore = (snap.amount - 1) * unitMaxHp + snap.hp;
            // A deleted/dead stack has zero cumulative HP. Applying the living-stack formula at
            // amount=0 produces -maxHp, inventing one extra unit of damage; lethal Flesh Shield then
            // showed its correct yellow total plus a bogus red max-HP number from this fallback.
            const totalHpAfter = currentAmount > 0 ? (currentAmount - 1) * unitMaxHp + currentHp : 0;
            const diff = totalHpBefore - totalHpAfter;

            const primaryVictimId = damageForAnimation.unitId ?? target.getId();
            const primaryReactionAlreadyPlayed =
                uId === primaryVictimId && !damageForAnimation.splash?.length && damageForAnimation.amount > 0;
            if (diff > 0 && !primaryReactionAlreadyPlayed) {
                // Splash and other secondary victims recoil away from the attack origin too. Missing or
                // dead units are ignored by the helper, leaving lethal hits to the death animation.
                this.applyHitReactionFromPoint(u, attacker.getVisualCenter(gs), 0.2);
            }

            const diedCount = Math.max(0, snap.amount - currentAmount);

            // Deduct damage the attack's own hit numbers already showed (Section 1). Key off the
            // unit the handler ACTUALLY hit (damageForAnimation.unitId — e.g. the first enemy on a
            // ranged shot's line of fire), NOT the clicked `target`. When a different enemy
            // intercepts the ray (or the target is switched after a kill) those differ, and keying
            // on `target` left this at 0 — so Section 3 drew the full diff (standard + Petrifying
            // Gaze = the sum) instead of the isolated gaze.
            let alreadyShown = 0;
            // Kills the primary hit numbers already rendered for this victim (Section 1). The extra
            // number below must show only the deaths from the UNACCOUNTED damage, not the victim's
            // cumulative deaths — otherwise a multi-hit attack (Double Punch) whose second hit isn't
            // in `hits` draws the running total (11 + 8 = 19) instead of the isolated second hit (8).
            let alreadyDied = 0;
            if (uId === primaryVictimId) {
                if (damageForAnimation.hits && damageForAnimation.hits.length > 0) {
                    alreadyShown = damageForAnimation.hits.reduce((sum, h) => sum + h.amount, 0);
                    alreadyDied = damageForAnimation.hits.reduce((sum, h) => sum + h.unitsDied, 0);
                } else {
                    alreadyShown = damageForAnimation.amount;
                }
            }
            // AOE / Through Shot shots render each affected unit's damage via `splash` (showSplashDamage
            // in Section 1 above), so that number is already on screen. Deduct it here too — otherwise
            // this HP-diff pass draws a SECOND number on every splashed unit (Tsar Cannon's Through Shot
            // showed two per unit). Pure-splash shots carry no `hits`/`amount`, so without this the whole
            // diff read as "unaccounted". A genuine Fire Shield burn beyond the splash still surfaces.
            if (damageForAnimation.splash?.length) {
                alreadyShown += damageForAnimation.splash
                    .filter((s) => s.unitId === uId)
                    .reduce((sum, s) => sum + s.amount, 0);
            }
            // Flesh Shield damage is displayed from the authoritative secondary payload as one yellow
            // ABSORBED value. Account for both its HP and stack losses before the generic diff fallback,
            // otherwise the same damage appears again as an ordinary red number.
            const fleshShieldDamage = fleshShieldDamageByUnit.get(uId);
            alreadyShown += fleshShieldDamage?.amount ?? 0;
            alreadyDied += fleshShieldDamage?.unitsDied ?? 0;

            const unaccountedDiff = diff - alreadyShown;

            // Show any damage beyond what the attack's own hit numbers already covered. For a normal
            // hit, diff === sum(hits), so unaccountedDiff is 0 and nothing extra draws. When it's
            // positive there's genuinely-hidden damage the hits didn't account for — most notably a
            // Fire Shield reflection burning the TARGET on its counter-attack. This used to be
            // suppressed for the primary target whenever hits existed, which is exactly why Fire
            // Shield damage never animated. (Over-counting would make this negative, which `> 0`
            // already ignores.)
            const shouldShowDamage = unaccountedDiff > 0;

            if (shouldShowDamage) {
                // Use primary 'primaryAttackDir' so it matches the attacker's main attack angle

                // Use snapshot position (pre-attack) to avoid artifacts if unit was knocked back/moved
                // Unit snapshot stores World Coordinates directly
                const visPos = snap.pos;

                // Important: Clone position to avoid mutating Unit's internal state
                // Match offset logic from 'executeAttackSequence' setup (lines 2464+)
                // "Push text out by radius + margin" to avoid overlapping the unit model
                const gs = this.sc_sceneSettings.getGridSettings();
                const targetRadius = gs.getCellSize() * 0.5; // Assume small for genericAOE (or check unit size if possible)
                const margin = gs.getCellSize() * 0.5;
                const baseOffset = targetRadius + margin;

                const spawnPos = { ...visPos };
                if (primaryAttackDir) {
                    const len = Math.sqrt(
                        primaryAttackDir.x * primaryAttackDir.x + primaryAttackDir.y * primaryAttackDir.y,
                    );
                    if (len > 0.001) {
                        const ndx = primaryAttackDir.x / len;
                        const ndy = primaryAttackDir.y / len;

                        // Apply Base Offset (Radius+Margin) + Animation Offset (20)
                        // This matches the Primary Target logic roughly (SpawnPos = Center + Radius + Margin).
                        // And then we add the "20" for the hit animation itself.
                        const totalOffset = baseOffset + 20;

                        spawnPos.x += ndx * totalOffset;
                        spawnPos.y += ndy * totalOffset;
                    }
                }

                // Extra damage on the PRIMARY target beyond the main hit — Medusa's Petrifying Gaze,
                // a Fire Shield burn, etc. Stagger it a beat after the standard attack number so it
                // reads as its own distinct hit instead of looking summed into the standard damage.
                // Style by source: Petrifying Gaze (when it killed) → light grey + yank the target
                // back along the attack direction; Fire Shield burn → amber; otherwise red.
                const uName = u?.getName();
                const isPetrified = !!uName && petrifyKillsByName.has(uName);
                // For Petrifying Gaze, show only the gaze's own kill count (parsed from the log),
                // not the target's total deaths (which include the main attack's kills). For any other
                // extra number on the primary victim, subtract the kills its primary hits already showed
                // so a Double Punch's second hit reads its own count (8), not the running total (19).
                const extraDiedCount = isPetrified
                    ? (petrifyKillsByName.get(uName!) ?? 0)
                    : Math.max(0, diedCount - alreadyDied);
                const uFireShield = uName ? (fireShieldByName.get(uName) ?? 0) : 0;
                const isFsBurn = uFireShield > 0 && Math.abs(unaccountedDiff - uFireShield) <= 2;
                const isChainLightning = chainLightningUnitIds.has(uId);
                // Source styling priority: Petrifying Gaze grey, Chain Lightning purple, Fire Shield
                // amber, otherwise plain red.
                const fsFill = isPetrified
                    ? "#d8d8d8"
                    : isChainLightning
                      ? "#b86bff"
                      : isFsBurn
                        ? "#ffb13c"
                        : "#ff3333";
                const fsStroke = isPetrified
                    ? "#5a5a5a"
                    : isChainLightning
                      ? "#3b0a5c"
                      : isFsBurn
                        ? "#7a3800"
                        : "#4a0000";

                if (isPetrified && u instanceof RenderableUnit && primaryAttackDir) {
                    // "Yank" the target away from the attacker (recoil), then it springs back.
                    const len = Math.sqrt(
                        primaryAttackDir.x * primaryAttackDir.x + primaryAttackDir.y * primaryAttackDir.y,
                    );
                    if (len > 0.001) {
                        const mag = this.sc_sceneSettings.getGridSettings().getCellSize() * 0.35;
                        u.applyRecoil((primaryAttackDir.x / len) * mag, (primaryAttackDir.y / len) * mag);
                    }
                }

                const flagAnchor = u instanceof RenderableUnit ? u.getDamagePredictionAnchor(gs) : undefined;

                if (uId === primaryVictimId) {
                    setTimeout(() => {
                        this.combatVisuals.showFloatingDamage(
                            spawnPos,
                            unaccountedDiff,
                            primaryAttackDir,
                            extraDiedCount,
                            fsFill,
                            fsStroke,
                            flagAnchor,
                        );
                    }, 300);
                } else {
                    this.combatVisuals.showFloatingDamage(
                        spawnPos,
                        unaccountedDiff,
                        primaryAttackDir,
                        extraDiedCount,
                        fsFill,
                        fsStroke,
                        flagAnchor,
                    );
                }
            }
        }

        const performCleanup = () => {
            clearAttackCleanupWatchdog();
            const unitsDied: RenderableUnit[] = [];
            for (const u of this.unitsHolder.getAllUnits().values()) {
                if (u.isDead()) {
                    unitsDied.push(u as RenderableUnit);
                }
            }

            if (unitsDied.length > 0) {
                this.destroySpecificUnits(unitsDied, true, true);
            }

            this.unitsHolder.refreshStackPowerForAllUnits();

            if (attackActionEvents) {
                applyAttackTurnEventsOnce();
            } else {
                this.finishTurn();
            }

            // Clear hover state
            this.hoverManager.clearHoverSilhouette();
            this.hoverManager.clearAttackVisuals();
            this.hoverManager.hoverAttackFromCell = undefined;

            this.sc_moveBlocked = false;
            this.sc_visibleStateUpdateNeeded = true;
        };

        // Tear dead units down on the final visible impact. This used to use an obsolete 1000ms cadence
        // plus a 500ms text hold even though hit numbers/lunges are now staggered by 240ms, making a
        // Double Punch victim linger for 1.5s after it had visibly taken the killing blow.
        const maxDelay = getAttackFinalImpactDelayMs(damageForAnimation.hits?.length ?? 0);

        if (maxDelay > 0) {
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    performCleanup();
                    resolve();
                }, maxDelay);
            });
        } else {
            performCleanup();
        }
        return true;
    }
    /** Clear transient pointer previews as soon as a move/attack command is accepted. */
    private clearCommittedBoardActionPreview(): void {
        this.hoverManager.clearAttackVisuals();
        this.dungeonVisuals.clearScatteredMountainHighlight();
        // Move animation locks silhouettes so its completion cannot be disturbed by hover updates. Force
        // this pre-lock clear: a normal clear after setSilhouetteLocked(true) is deliberately ignored.
        this.hoverManager.clearHoverSilhouette(true);
        this.hoverManager.hoverAttackFromCell = undefined;
        this.hoverManager.hoveredUnitHighlight = undefined;
        this.hoverRangeAttackObstacle = undefined;
        this.sc_isHoveringAttackTarget = false;
        this.sc_meleeCursorDirection = undefined;
        this.sc_hoverInfoArr = [];
        this.sc_hoverTextUpdateNeeded = true;
    }
    private executeMoveSequence(
        unit: RenderableUnit,
        path: HoCMath.XY[],
        overrideFootprint?: HoCMath.XY[],
        onComplete?: () => void,
        replayAction?: Extract<GameAction, { type: "move_unit" }>,
        rapidCharge = false,
        continueTurn = false,
    ): boolean {
        if (!path || path.length === 0) return false;
        const gs = this.sc_sceneSettings.getGridSettings();
        const cellSize = gs.getCellSize();
        const isLargeUnit = !unit.isSmallSize();
        const footprintCellCount = unit.getFootprintWidth() * unit.getFootprintHeight();
        const hasFootprintOverride = !!overrideFootprint && overrideFootprint.length === footprintCellCount;

        // Multi-cell direct moves pass the final footprint as `path`; move-attacks pass a real route.
        const pathLooksLikeFootprintOnly =
            isLargeUnit &&
            hasFootprintOverride &&
            path.length === overrideFootprint!.length &&
            path.every((cell) =>
                overrideFootprint!.some((candidate) => candidate.x === cell.x && candidate.y === cell.y),
            );

        // Default destCell for logging / track anchor.
        let destCell = path[path.length - 1];

        // Capture starting world position before the common move mutates the shared unit object.
        const startPos = { ...unit.getPosition() };

        let cellsToOccupy: HoCMath.XY[];
        if (isLargeUnit) {
            if (hasFootprintOverride) {
                cellsToOccupy = overrideFootprint!;
            } else {
                // Fallback if we somehow don't get a footprint override. Preserve the unit's configured
                // rectangle: treating every multi-cell body as 2x2 makes a legal 2x1 move (including the
                // approach step of a melee attack) fail engine validation with `invalid_move`.
                cellsToOccupy = combatFootprintCellsForBase(
                    destCell,
                    unit.getFootprintWidth(),
                    unit.getFootprintHeight(),
                );
            }
        } else {
            cellsToOccupy = [destCell];
        }

        const routeMetadata = this.currentActiveKnownPaths?.get((destCell.x << 4) | destCell.y)?.[0];
        const action: GameAction = replayAction
            ? cloneReplayData(replayAction)
            : {
                  type: "move_unit",
                  unitId: unit.getId(),
                  path,
                  targetCells: cellsToOccupy,
                  hasLavaCell: routeMetadata?.hasLavaCell,
                  hasWaterCell: routeMetadata?.hasWaterCell,
              };
        if (this.shouldDeferActionToAuthoritativeReplay(action)) {
            return this.submitActionForAuthoritativeReplay(action, { continueTurn });
        }
        const moveResult = this.createActionEngine().apply(action);
        if (!moveResult.completed) {
            console.error(
                `Critical: Unit ${unit.getName()} failed to move to target footprint (dest ${destCell.x}, ${destCell.y}): ${moveResult.rejectionReason ?? "unknown"}`,
            );
            return false;
        }
        const moveEvent = moveResult.events.find((event) => event.type === "unit_moved");

        // Everything the move produced BESIDES the move itself still has to be applied — this path drives
        // the walk animation off `unit_moved` by hand and would otherwise swallow the rest. That used to be
        // harmless (a move could not hurt anyone) and no longer is: walking into a Fire Wall emits a burn,
        // and can emit the mover's own unit_destroyed, which must reach destroyEventDeletedUnit or the
        // corpse stays on the board. Applied now rather than at the end of the walk because the engine has
        // already resolved it — the board must not disagree with the engine for the length of an animation.
        const collateralEvents = moveResult.events.filter((event) => event.type !== "unit_moved");
        if (collateralEvents.length) {
            this.applyTurnEngineEvents(collateralEvents, this.snapshotRenderableUnits());
        }

        // Sync matrices
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();

        const newWorldPos =
            moveEvent?.type === "unit_moved" ? moveEvent.to : GridMath.getPositionForCells(gs, cellsToOccupy);
        if (!newWorldPos) {
            console.error(
                `Critical: Failed to compute world position for cells when moving ${unit.getName()} -> (${destCell.x}, ${destCell.y})`,
            );
            return false;
        }

        unit.setPosition(startPos.x, startPos.y);

        // For multi-cell units, recompute a sensible anchor destCell. Derived from the footprint rather
        // than from getCellForPosition, which only lands on the anchor while both sides are 1 or 2.
        if (pathLooksLikeFootprintOnly) {
            destCell = GridMath.getFootprintAnchorForPosition(
                gs,
                newWorldPos,
                unit.getFootprintWidth(),
                unit.getFootprintHeight(),
            );
        }

        // --- Build world-space path for visual animation ---
        const worldPath: HoCMath.XY[] = [];
        worldPath.push({ x: startPos.x, y: startPos.y });

        if (pathLooksLikeFootprintOnly) {
            // Large unit: we only know start and final footprint -> straight line A -> B.
            worldPath.push({ x: newWorldPos.x, y: newWorldPos.y });
        } else {
            // Calculate offset if needed (for Large Units following an anchor path)
            let offsetX = 0;
            let offsetY = 0;

            // If Large Unit, align the path visual to the Unit's Center, not the Anchor Cell center.
            if (isLargeUnit && path.length > 0) {
                const startCellPos = GridMath.getPositionForCell(path[0], gs.getMinX(), gs.getStep(), gs.getHalfStep());
                if (startCellPos) {
                    // If path[0] corresponds to our current location (start), calculating offset relative to current Center
                    // startPos is unit.getPosition() (Center).
                    // But path[0] might be the *next* cell?
                    // Usually path[0] is the start cell or the first step.
                    // If path includes start cell:
                    // Offset = BoxCenter - CellCenter.
                    // Let's assume constant offset for the whole path based on destination alignment, which is safer.

                    // Align LAST path node to LAST world pos (Target Center)
                    const lastPathCell = path[path.length - 1];
                    const lastCellPos = GridMath.getPositionForCell(
                        lastPathCell,
                        gs.getMinX(),
                        gs.getStep(),
                        gs.getHalfStep(),
                    );
                    if (lastCellPos) {
                        offsetX = newWorldPos.x - lastCellPos.x;
                        offsetY = newWorldPos.y - lastCellPos.y;
                    }
                }
            }

            // Small units (or future large units with real route): follow the full route.
            for (let i = 0; i < path.length; i++) {
                const cell = path[i];
                const pos = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
                if (pos) {
                    const targetX = pos.x + offsetX;
                    const targetY = pos.y + offsetY;
                    const last = worldPath[worldPath.length - 1];

                    // Avoid duplicates
                    if (!last || Math.abs(last.x - targetX) > 0.01 || Math.abs(last.y - targetY) > 0.01) {
                        worldPath.push({ x: targetX, y: targetY });
                    }
                }
            }
            // Ensure last point matches logical final position strictly.
            const last = worldPath[worldPath.length - 1];
            if (!last || Math.abs(last.x - newWorldPos.x) > 0.01 || Math.abs(last.y - newWorldPos.y) > 0.01) {
                worldPath.push({ x: newWorldPos.x, y: newWorldPos.y });
            }
        }

        const moveSpeed = cellSize * Sandbox.MOVE_SPEED_FACTOR; // Adjusted speed based on user feedback (was 12)

        const handleMoveComplete = (): void => {
            if (onComplete) {
                onComplete();
            } else {
                this.finishMovedUnitTurn(unit);
            }
            this.flushPendingReplayRecords();
        };

        this.moveAnimManager.startMoveAnimation(
            unit,
            worldPath,
            moveSpeed,
            destCell,
            pathLooksLikeFootprintOnly ? undefined : path, // trackPath
            handleMoveComplete,
            rapidCharge,
        );

        this.isActiveUnitMoving = true;
        if (this.sc_visibleState) {
            this.sc_visibleStateUpdateNeeded = true;
        }

        // Once the engine accepts the move, remove every click/hover preview in the same frame. Previously
        // the silhouette was locked first and clearHoverSilhouette() therefore did nothing, while the
        // sword and target shadow survived for the entire run-up to a melee strike.
        this.clearCommittedBoardActionPreview();
        this.hoverManager.setSilhouetteLocked(true);
        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.currentActivePathHashes = undefined;
        this.sc_moveBlocked = true;
        return true;
    }
    private finishMovedUnitTurn(unit: RenderableUnit): void {
        const action: GameAction = {
            type: "end_turn",
            unitId: unit.getId(),
            reason: "manual",
        };
        // Runs synchronously inside moveAnimManager.update() on the frame the move lands: commit the
        // end-of-turn action, apply its events, then hand off to the next unit in the same tick.
        const unitSnapshot = this.snapshotRenderableUnits();
        const result = this.createActionEngine().apply(action);
        if (!result.completed) {
            this.sc_sceneLog.updateLog(
                result.message ?? `Cannot finish move turn: ${result.rejectionReason ?? "unknown"}`,
            );
            return;
        }
        this.applyTurnEngineEvents(result.events, unitSnapshot);
        this.advanceAfterNoActiveUnitIfNeeded();
    }
    private advanceAfterNoActiveUnitIfNeeded(): void {
        if (this.currentActiveUnit) {
            return;
        }

        // Ranked is server-authoritative: the next unit / lap flip / morale / narrowing all come from
        // the server snapshot (syncAuthoritativeActiveUnit). Running the local turn engine here would
        // roll turn-order RNG and apply lap mechanics that cannot match the server, diverging from it.
        // Sandbox (no transport) keeps driving the local turn loop.
        if (this.sc_gameActionTransport) {
            return;
        }

        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (!fightProps.hasFightStarted() || fightProps.hasFightFinished()) {
            return;
        }

        const unitSnapshot = this.snapshotRenderableUnits();
        const result = this.createTurnEngine().advanceAfterNoActiveUnit({
            centerAlreadyDried: this.dungeonVisuals.isCenterDried(),
            damageDealtThisLap: this.attackHandler?.getDamageStatisticHolder().has(fightProps.getCurrentLap()) ?? false,
        });
        this.applyTurnEngineEvents(result.events, unitSnapshot);

        if (result.nextUnit) {
            this.handleNextUnitActivation(result.nextUnit as RenderableUnit);
        }
    }
    private isBoardInputLockedByAI(): boolean {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        return (
            fightProps.hasFightStarted() &&
            !fightProps.hasFightFinished() &&
            (this.sc_isAIActive ||
                !!this.currentActiveUnit?.hasAbilityActive("AI Driven") ||
                this.aiController?.shouldControlCurrentUnit() ||
                // The active unit's whole team is handed to the AI (sandbox "AI side" checkbox): the
                // human can't act for it, so lock board input + toolbar for its turn.
                (!!this.currentActiveUnit && this.isTeamAiControlled(this.currentActiveUnit.getTeam())))
        );
    }
    /** Whether the given team is fully AI-controlled via the sandbox "AI side" checkboxes. */
    public override isTeamAiControlled(team: TeamType): boolean {
        return this.aiControlledTeams.has(team);
    }
    /**
     * TEMPORARY: swap the board's floor between the current texture and the previous one, for a live
     * side-by-side. Everything layered on the floor — the dungeon lighting overlay, the atmosphere alpha,
     * terrain, holes — is driven by its own state and is deliberately left alone, so the only thing that
     * changes on screen is the painting itself.
     *
     * Re-lays the sprite immediately rather than waiting for the next frame, so the flip is instant even
     * while the board is idle.
     */
    public override setLegacyBoardBackground(enabled: boolean): void {
        // The legacy painting contains baked orange top/bottom light and conflicts with the new night +
        // horror-moon direction. Keep the API for the toolbar, but always render the current dark floor.
        void enabled;
        this.dungeonVisuals.setLegacyBackground(false);
        this.ensureBackgroundSprite();
        this.layoutBackgroundSquare();
        // The current floor carries its own painted lighting, so the dungeon lighting pass is switched OFF
        // over it — the map is meant to be seen exactly as painted, and adding braziers and a darkening
        // layer on top only doubles the light at its edges. The legacy texture is unlit, so it keeps them.
        this.lightingLayer?.setEnabled(false);
    }
    public override isLegacyBoardBackground(): boolean {
        return false;
    }
    /**
     * Toggle full AI control of a team (sandbox feature). When enabled the AIController auto-plays every
     * one of that team's turns and the human cannot act for it. Clearing the board hover previews on
     * enable avoids a stale silhouette/aura lingering from the moment control is handed over.
     */
    public override setTeamAiControlled(team: TeamType, enabled: boolean): void {
        if (enabled) {
            this.aiControlledTeams.add(team);
        } else {
            this.aiControlledTeams.delete(team);
        }
        if (enabled && this.currentActiveUnit?.getTeam() === team) {
            this.clearBoardHoverPreviews();
        }
        // Reflect the lock state in the toolbar immediately (enabled/disabled action buttons).
        this.buttonManager?.refreshButtons(true);
    }
    private clearBoardHoverPreviews(): void {
        this.hoverManager.clearAttackVisuals();
        this.dungeonVisuals.clearScatteredMountainHighlight();
        this.hoverManager.clearHoverSilhouette();
        this.hoverManager.clearAuraVisuals();
        this.hoverManager.clearAOEArea();
        this.hoverManager.clearSpellPreview();
        this.hoverManager.hoverAttackFromCell = undefined;
        this.hoverManager.hoveredUnitHighlight = undefined;
        this.hoverRangeAttackObstacle = undefined;
        this.sc_hoveredAuraRanges = undefined;
        this.sc_hoveredShotRange = undefined;
        this.clearAggrBlockedActionHint();
    }
    protected override canShowHoverForActiveUnit(): boolean {
        return true;
    }
    /**
     * Whether the local player may act on the current active unit (drives toolbar action buttons:
     * wait/end-turn/attack-type/spellbook). Sandbox controls both teams, so this is always true.
     * Ranked overrides it to gate the opponent's turn.
     */
    protected canControlCurrentActiveUnit(): boolean {
        return true;
    }
    /**
     * Ranked overrides this to true during the window between an authoritative action's animation
     * finishing and the next snapshot reassigning the active unit, so the just-finished unit's pulse
     * aura stays suppressed instead of flashing back on for a frame before the turn changes. Sandbox
     * resolves turns synchronously, so there is no such gap.
     */
    protected isAwaitingAuthoritativeTurnHandoff(): boolean {
        return false;
    }
    /**
     * True while a unit's move/attack animation is in flight. Used to avoid a destructive board
     * rebuild (which recreates units at their final cells and snaps the animation) landing mid-action
     * — e.g. a fallback snapshot poll arriving while a recorded move is still sliding.
     */
    protected isPlayingActionAnimation(): boolean {
        return this.isActiveUnitMoving || this.sc_isAnimating || this.moveAnimManager.isMoving();
    }
    protected override hover(): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();

        const boardInputLockedByAI = this.isBoardInputLockedByAI();

        // The projectile replaces the aiming preview once fired. Keep it cleared even if the pointer moves
        // across the target during the short flight; otherwise hover() would draw the dashed line again.
        if (this.rangedProjectiles.hasActive()) {
            this.hoverManager.clearAttackVisuals();
            this.clearAggrBlockedActionHint();
            return;
        }

        // Whether the local player may DRIVE the active unit this frame. Ranked returns false during the
        // opponent's turn (and there's no active unit during placement, so this is only meaningful once the
        // fight is live). The read-only hover previews — a hovered unit's aura / range / movement — are
        // still shown to the viewer even on the opponent's turn; only the active unit's INTERACTIVE previews
        // (move silhouette, attack/spell targeting, the move-intent relay) are gated below.
        const canDriveActiveUnit =
            !boardInputLockedByAI && (!fightProps.hasFightStarted() || this.canShowHoverForActiveUnit());

        // 0. Spellbook Interaction — the active unit's own book, so only when we can drive it.
        if (canDriveActiveUnit && this.sc_renderSpellBookOverlay && this.currentActiveUnit && this.sc_mouseWorld) {
            if (this.currentActiveUnit instanceof RenderableUnit) {
                const hoveredSpell = this.currentActiveUnit.getHoveredSpell(
                    this.spellbookGlobalFromWorld(this.pointerVisualWorld),
                    true,
                );
                this.setHoveredSpell(hoveredSpell, this.currentActiveUnit);

                // If hovering inside spellbook, skip other board interactions?
                // Probably yes, to avoid clicking units "through" the book.
                // Assuming SpellBook renders on top.
                if (hoveredSpell) {
                    this.hoverManager.clear();
                    return;
                }
            }
        } else {
            this.setHoveredSpell(undefined);
        }

        // --- 1. Generic Hover Logic (Pre & Post Fight) ---
        // Populates sc_hoveredAuraRanges / sc_hoveredShotRange for generic drawing via SandboxDrawer
        this.hoverManager.clearAuraVisuals(); // Ensure previous frame visual is cleared
        this.sc_hoveredAuraRanges = undefined;
        this.sc_hoveredShotRange = undefined;
        this.sc_hoveredMoveRange = undefined;
        this.sc_hoveredMoveRangeIsEnemy = false;

        // Always calculate hovered unit visuals (unless moving active unit)
        if (this.sc_mouseWorld && !this.isActiveUnitMoving) {
            const hoverTargetUnit = this.getUnitAtPosition(this.sc_mouseWorld);
            // A Hidden unit (e.g. Tiger) is concealed FROM THE OPPONENT: you can still hover your own
            // Hidden units to see their move/attack/aura ranges, but an enemy Hidden unit reveals nothing.
            // The viewer's team is known in ranked (getViewerTeam); in the local sandbox it is undefined,
            // so nothing is concealed there (you control/observe both sides).
            const viewerTeam = this.getViewerTeam();
            const concealedFromViewer =
                !!hoverTargetUnit &&
                hoverTargetUnit.hasBuffActive("Hidden") &&
                viewerTeam !== undefined &&
                hoverTargetUnit.getTeam() !== viewerTeam;
            // Incoming-threat preview: with an enemy shooter pinned by shift-click, hovering one of your
            // units shows the shot it would take. Only while it is NOT your turn, so it can never collide
            // with your own aiming visuals. Rendered before the generic previews so its arrow + highlight
            // survive the frame; the generic aura/range readouts below still run underneath it.
            const threatShown = this.renderIncomingThreatPreview(
                hoverTargetUnit && !hoverTargetUnit.isDead() && !concealedFromViewer ? hoverTargetUnit : undefined,
            );
            if (!threatShown && this.isEnemyActiveTurn()) {
                // Pinned shooter but nothing threatened under the cursor — drop last frame's arrow.
                this.hoverManager.clearAttackVisuals();
            }
            if (hoverTargetUnit && !hoverTargetUnit.isDead() && !concealedFromViewer) {
                // Aura: visualize the hovered unit's aura range. Routed through sc_hoveredAuraRanges so
                // SandboxDrawer paints it on the same persistent layer (z=55) as the active/selected
                // unit's aura. The old hoverManager.drawAuraArea layer (z=51) gets wiped mid-frame by the
                // placement-hover path (updateHoverPlacementCell -> clearAuraVisuals), which is why the
                // hover aura "never showed". Skip when the aura is ALREADY drawn for this unit (it's the
                // active or selected board unit) so we don't stack a second, darker ring on top.
                const auraAlreadyVisualized =
                    hoverTargetUnit === this.currentActiveUnit || hoverTargetUnit === this.selectedBoardUnit;
                const auraRanges = hoverTargetUnit.getAuraRanges();
                if (!auraAlreadyVisualized && auraRanges && auraRanges.length > 0) {
                    const finalAuras = visibleAuraRanges(
                        auraRanges,
                        hoverTargetUnit.getAuraIsBuff(),
                        FightStateManager.getInstance()
                            .getFightProperties()
                            .getAdditionalAuraRangePerTeam(hoverTargetUnit.getTeam()),
                    );
                    if (finalAuras.length > 0) {
                        this.sc_hoveredAuraRanges = {
                            xy: hoverTargetUnit.getPosition(),
                            auraRanges: finalAuras,
                            footprint: footprintExtentOf(hoverTargetUnit),
                        };
                    }
                }

                // Range Attack Visuals (Only if Ranged)
                if (hoverTargetUnit.getAttackType() === AttackVals.RANGE) {
                    if (hoverTargetUnit.hasAbilityActive("Sniper")) {
                        hoverTargetUnit.setRangeShotDistance(
                            Number(
                                (
                                    GridMath.getDistanceToFurthestCorner(
                                        hoverTargetUnit.getPosition(),
                                        this.sc_sceneSettings.getGridSettings(),
                                    ) /
                                        this.sc_sceneSettings.getGridSettings().getStep() -
                                    0.45
                                ).toFixed(2),
                            ),
                        );
                    }
                    const dist = hoverTargetUnit.getRangeShotDistance();
                    if (dist > 0) {
                        this.sc_hoveredShotRange = {
                            ...fullDamageShotRangeForFootprint(
                                hoverTargetUnit.getPosition(),
                                dist,
                                hoverTargetUnit.getFootprintWidth(),
                                hoverTargetUnit.getFootprintHeight(),
                            ),
                            color: this.shotRangeColorForHoveredUnit(hoverTargetUnit),
                        };
                    }
                }

                // Movement range: the hovered unit's reachable cells. Only meaningful during a fight, and
                // skipped for the active unit (its own path is already drawn as currentActivePath — drawing
                // the hover overlay on top would just stack).
                if (
                    fightProps.hasFightStarted() &&
                    hoverTargetUnit.getId() !== this.currentActiveUnit?.getId() &&
                    hoverTargetUnit.canMove()
                ) {
                    const movePath = this.pathHelper.getMovePath(
                        hoverTargetUnit.getBaseCell(),
                        this.gridMatrix,
                        hoverTargetUnit.getSteps(),
                        this.grid.getAggrMatrixByTeam(hoverTargetUnit.getOppositeTeam()),
                        hoverTargetUnit.canFly(),
                        hoverTargetUnit.isSmallSize(),
                        hoverTargetUnit.canTraverseLava(),
                        hoverTargetUnit.hasAbilityActive("In Its Own World"),
                        hoverTargetUnit.getFootprintWidth(),
                        hoverTargetUnit.getFootprintHeight(),
                    );
                    // A hovered enemy's movement wash must describe destinations only. Large 2x1/2x2
                    // footprints can return their additional currently occupied cells alongside the path;
                    // painting those red made ranged targeting look like a red cell highlight under the
                    // creature. Keep the red creature silhouette, but leave all of its base cells untouched.
                    this.sc_hoveredMoveRange = movementCellsOutsideUnitFootprint(
                        movePath.cells,
                        hoverTargetUnit.getCells(),
                    );
                    // Whether the hovered unit is an ENEMY of the active unit. Drives the active path's
                    // white -> light-orange switch: an enemy's reach overlapping your cells is a threat
                    // cue; an ally's is not, so hovering your own units keeps the plain white dots.
                    this.sc_hoveredMoveRangeIsEnemy =
                        this.currentActiveUnit !== undefined &&
                        hoverTargetUnit.getTeam() !== this.currentActiveUnit.getTeam();
                }
            }
        }

        // Opponent's turn (ranked): the read-only hovered previews above still render, but we must NOT run
        // the active unit's interactive targeting below — clear its move silhouette / attack / spell visuals
        // and relay no move intent, then stop. sc_hoveredAuraRanges/ShotRange/MoveRange are deliberately kept
        // so the drawer still shows what the hovered unit can do.
        if (!canDriveActiveUnit) {
            this.hoverManager.clearAttackVisuals();
            this.hoverManager.clearHoverSilhouette();
            this.hoverManager.clearAOEArea();
            this.hoverManager.clearSpellPreview();
            this.hoverManager.hoverAttackFromCell = undefined;
            this.hoverManager.hoveredUnitHighlight = undefined;
            this.hoverRangeAttackObstacle = undefined;
            this.emitLocalMoveIntent(undefined);
            return;
        }

        // --- FIGHT MODE: active unit move-hover silhouette ---
        if (fightProps.hasFightStarted()) {
            if (!this.currentActiveUnit) {
                this.hoverManager.clearHoverSilhouette();
                return;
            }
            if (this.sc_isAnimating || this.isActiveUnitMoving || this.sc_moveBlocked || !this.sc_mouseWorld) {
                // While a projectile is in flight / the unit is landing an attack, it can't move —
                // don't draw the move-preview silhouette.
                this.hoverManager.clearHoverSilhouette();
                return;
            }
            if (this.currentActiveUnit.hasAbilityActive("AI Driven")) {
                this.hoverManager.clearHoverSilhouette();
                return;
            }

            // --- SPELL TARGETING HOVER: a single-target spell is armed. Preview its effect on the
            // unit under the cursor — green silhouette for buffs/heals, red for debuffs/damage — and
            // only when the spell is actually castable on that unit (reusing SpellHelper.canCastSpell,
            // which already encodes team / magic-resist / healable / mind-resist / stack rules). A
            // colored beam caster→target + a persistent icon/name badge above the caster make it
            // obvious which spell is about to fire. Castling (position swap) is special: every valid
            // swap target is highlighted up-front in dark yellow, not just the one under the cursor.---
            if (this.currentActiveSpell && this.currentActiveUnit) {
                const spell = this.currentActiveSpell;
                const caster = this.currentActiveUnit;
                const gs2 = this.sc_sceneSettings.getGridSettings();
                const hoveredUnit = this.getUnitAtPosition(this.sc_mouseWorld);
                // Redrawn on every pointer frame; keep the current target's pinned damage-label anchor.
                this.hoverManager.clearAttackVisuals(true);
                this.hoverManager.clearHoverSilhouette();
                this.hoverManager.hoverAttackFromCell = undefined;

                // Positive magic reads emerald; debuffs and battle magic read as fire-red.
                const isSwap = spell.getSpellTargetType() === SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE;
                const isPositiveSpell = spell.isBuff() || isSwap;
                const spellColor = isPositiveSpell ? 0x18c868 : 0xe02b16;
                const casterPos = caster.getVisualCenter(gs2);
                const iconTex = this.texAny(SpellHelper.spellToTextureName(spell.getName())) ?? Texture.EMPTY;
                // Direct buffs/debuffs are applied to the chosen unit without travelling through the board,
                // so a trajectory arrow is misleading. Keep arrows for damaging, swap and genuinely thrown
                // spells; the shared classifier is the same one used by the engine and AI for interception.
                const hideDirectStatusArrow =
                    !SpellHelper.targetedSpellRequiresLineOfSight(spell.getName()) &&
                    !isOffensiveSpellMultiplier(spell.getMultiplierType()) &&
                    spell.getSpellTargetType() !== SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE;

                let targetCenter: HoCMath.XY | undefined;
                let trajectoryEnd: HoCMath.XY | undefined;
                if (isSwap && this.currentEnemiesCellsWithinMovementRange) {
                    // Highlight every small enemy within movement range so the player sees all options.
                    for (const c of this.currentEnemiesCellsWithinMovementRange) {
                        const id = this.grid.getOccupantUnitId(c);
                        const u = id ? this.unitsHolder.getAllUnits().get(id) : undefined;
                        if (u && !u.isDead()) {
                            this.hoverManager.addTargetHighlight(u, spellColor);
                        }
                    }
                    // Beam only to the one actually under the cursor (if it's a valid swap target).
                    const rTarget = hoveredUnit as RenderableUnit;
                    if (
                        hoveredUnit &&
                        !hoveredUnit.isDead() &&
                        typeof rTarget.getVisualCenter === "function" &&
                        SpellHelper.canCastSpell(
                            false,
                            gs2,
                            this.gridMatrix,
                            caster,
                            hoveredUnit,
                            spell,
                            hoveredUnit.getBaseCell(),
                            hoveredUnit.getMagicResist(),
                            hoveredUnit.hasMindAttackResistance(),
                            hoveredUnit.canBeHealed(),
                            this.currentEnemiesCellsWithinMovementRange,
                        )
                    ) {
                        targetCenter = rTarget.getVisualCenter(gs2);
                        trajectoryEnd = hoveredUnit.getPosition();
                    }
                } else if (
                    hoveredUnit &&
                    !hoveredUnit.isDead() &&
                    SpellHelper.canCastSpell(
                        false,
                        gs2,
                        this.gridMatrix,
                        caster,
                        hoveredUnit,
                        spell,
                        hoveredUnit.getBaseCell(),
                        hoveredUnit.getMagicResist(),
                        hoveredUnit.hasMindAttackResistance(),
                        hoveredUnit.canBeHealed(),
                        this.currentEnemiesCellsWithinMovementRange,
                    ) &&
                    this.hasTargetedSpellLineOfSight(spell, caster, hoveredUnit)
                ) {
                    // A target-sparing spell (Ring of Fire) aims AT this creature but never damages it, so
                    // it must not wear the red "this burns" tint the ring itself gets. Gold marks it as the
                    // aim point instead — the same "something happens here, but not damage" cue Castling
                    // uses — and the red highlights below are then exactly the units that will take a hit.
                    const sparesTarget = this.spellSparesItsTarget(spell);
                    // An intercepted throw burns the creature IN the line, not the one under the cursor, so
                    // the red highlight, the damage number and the kill count all have to name that creature.
                    // Leaving them on the aimed unit would contradict the trajectory drawn right beside them.
                    const impactUnit = this.thrownSpellVictim(spell, caster, hoveredUnit);
                    this.hoverManager.addTargetHighlight(impactUnit, sparesTarget ? 0xb8860b : spellColor);
                    const rTarget = impactUnit as RenderableUnit;
                    const trajectoryAim = this.optimalSpellTrajectoryAim(spell, caster, impactUnit);
                    trajectoryEnd = trajectoryAim?.position ?? impactUnit.getPosition();
                    targetCenter = projectBattlefieldPoint(trajectoryEnd, gs2);

                    // Offensive spells preview their damage exactly like an attack hover does, so the player
                    // chooses a target on a number rather than on the spellbook's generic card text.
                    const spellDamage = this.previewSpellDamage(spell, caster, impactUnit);
                    if (spellDamage !== undefined) {
                        const kills = sparesTarget ? 0 : impactUnit.calculatePossibleLosses(spellDamage);
                        // The spared target gets no number at all: printing one — even a 0 — next to a red
                        // ring reads as "this takes damage too", which is the exact confusion to avoid.
                        if (!sparesTarget) {
                            this.hoverManager.drawDamagePrediction(
                                `${spellDamage}`,
                                kills > 0 ? `${kills}` : undefined,
                                rTarget.getDamagePredictionAnchor(gs2),
                                !impactUnit.isSmallSize(),
                                kills > 0 ? images.combat_kills_skull_icon_v1 : undefined,
                                undefined,
                                impactUnit.getId(),
                            );
                        }
                        // Everything the splash also catches gets its own number, the way the Area Throw
                        // preview labels each unit under the 3x3. Same damage on each — a spell does not
                        // fall off across its own blast.
                        for (const splashed of this.splashedSpellTargets(spell, caster, impactUnit)) {
                            const splashDamage = this.previewSpellDamage(spell, caster, splashed) ?? 0;
                            const labelPos =
                                splashed instanceof RenderableUnit
                                    ? splashed.getVisualCenter(gs2)
                                    : projectBattlefieldPoint(splashed.getPosition(), gs2);
                            this.hoverManager.addTargetHighlight(splashed, spellColor);
                            this.hoverManager.addAOEDamageLabel(labelPos, `${splashDamage}`, !splashed.isSmallSize());
                        }
                    }
                }

                // A cell-targeted meteor has no hovered unit to hang a number on, so every enemy caught under
                // the block gets its own label instead — the treatment the Area Throw 3x3 preview already
                // gives its splash. Allies are skipped because the cast does not catch them.
                if (spell.getSpellTargetType() === SpellTargetType.FREE_CELL) {
                    const origin = GridMath.getCellForPosition(gs2, this.sc_mouseWorld);
                    const labelled = new Set<string>();
                    for (const cell of origin ? this.cellTargetedSpellBlock(spell, origin) : []) {
                        const id = this.grid.getOccupantUnitId(cell);
                        const under = id ? this.unitsHolder.getAllUnits().get(id) : undefined;
                        if (!under || under.isDead() || under.getTeam() === caster.getTeam()) {
                            continue;
                        }
                        // A large creature straddles several of the block's cells but is hit once.
                        if (labelled.has(under.getId())) {
                            continue;
                        }
                        const blockDamage = this.previewSpellDamage(spell, caster, under);
                        if (blockDamage === undefined) {
                            break; // not a damaging cell spell (Smoke, Craft) — nothing to preview at all
                        }
                        labelled.add(under.getId());
                        this.hoverManager.addAOEDamageLabel(
                            under instanceof RenderableUnit
                                ? under.getVisualCenter(gs2)
                                : projectBattlefieldPoint(under.getPosition(), gs2),
                            `${blockDamage}`,
                            !under.isSmallSize(),
                        );
                    }
                }

                if (!hideDirectStatusArrow && trajectoryEnd) {
                    this.highlightScatteredObstaclesAlongTrajectory(caster.getPosition(), trajectoryEnd);
                }
                this.hoverManager.drawSpellCastPreview({
                    casterPos,
                    targetPos: hideDirectStatusArrow ? undefined : targetCenter,
                    iconTex,
                    label: spell.getName(),
                    color: spellColor,
                    beamStyle: isPositiveSpell ? "positive" : "negative",
                });
                return;
            }

            // MAGIC attack type still shows the move silhouette (so you can position the caster);
            // we just suppress melee attack targeting downstream by not computing melee targets.

            // [Global Sniper Check] Ensure range is up-to-date before any calculations
            if (this.currentActiveUnit.hasAbilityActive("Sniper")) {
                this.currentActiveUnit.setRangeShotDistance(
                    Number(
                        (
                            GridMath.getDistanceToFurthestCorner(
                                this.currentActiveUnit.getPosition(),
                                this.sc_sceneSettings.getGridSettings(),
                            ) /
                                this.sc_sceneSettings.getGridSettings().getStep() -
                            0.45
                        ).toFixed(2),
                    ),
                );
            }
            const gs = this.sc_sceneSettings.getGridSettings();
            const cell = GridMath.getCellForPosition(gs, this.sc_mouseWorld);
            if (!cell) {
                this.hoverManager.clearHoverSilhouette();
                this.hoverManager.hoverAttackFromCell = undefined;
                this.hoverManager.clearAuraVisuals();
                this.sc_hoveredShotRange = undefined;
                return;
            }

            this.hoverManager.clearAuraVisuals(); // Ensure legacy visual is cleared
            // Generic Aura logic moved to top of function (sc_hoveredAuraRanges)

            // Generic Range logic moved to top of function (sc_hoveredShotRange)

            // Check for melee attack target
            let isAttacking = false;

            this.hoverManager.hoverAttackFromCell = undefined; // Reset state
            this.hoverRangeAttackObstacle = undefined; // Reset blocked-shot state

            // --- OBSTACLE HOVER: previewing an attack on the destructible center (BLOCK_CENTER). ---
            if (this.updateObstacleHover()) {
                return;
            }

            // --- AREA THROW HOVER: preview the splash area for Gargantuan-style AOE units. ---
            if (this.updateAreaThrowHover()) {
                return;
            }

            // Only checking for attack if we have melee targets calculated
            if (this.canAttackByMeleeTargets && this.currentActiveUnit) {
                const targetUnit = this.getUnitAtPosition(this.sc_mouseWorld);
                // A unit with the "Hidden" buff cannot be hovered/targeted for attack; show a
                // "Hidden" hover message instead (cleared once the cursor leaves the unit).
                const isHiddenEnemy =
                    !!targetUnit &&
                    targetUnit.getTeam() !== this.currentActiveUnit.getTeam() &&
                    targetUnit.hasBuffActive("Hidden");
                if (isHiddenEnemy) {
                    if (this.sc_hoverInfoArr[0] !== "Hidden") {
                        this.sc_hoverInfoArr = ["Hidden"];
                        this.sc_hoverTextUpdateNeeded = true;
                    }
                } else if (this.sc_hoverInfoArr[0] === "Hidden") {
                    this.sc_hoverInfoArr = [];
                    this.sc_hoverTextUpdateNeeded = true;
                }
                if (
                    targetUnit &&
                    targetUnit.getTeam() !== this.currentActiveUnit.getTeam() &&
                    !targetUnit.hasBuffActive("Hidden") &&
                    // Aggr: an aggravated unit can ONLY attack the enemy that aggr'd it, so never draw a red
                    // attack highlight on any other enemy (the ranged long-range visual relaxation below would
                    // otherwise light up non-target enemies). The canAttackBy*Targets sets are already filtered
                    // for the actual attack in updateCurrentMovePath; this guards the hover VISUAL too.
                    this.isAttackableUnderForcedTarget(targetUnit) &&
                    // Cowardice: the active unit cannot strike a stack with MORE cumulative HP than itself
                    // (the engine rejects it, cause "cowardice"). Suppress the melee/range hover highlight on
                    // those targets so the visual only ever shows attacks we can actually make.
                    !this.isCowardiceBlockedTarget(targetUnit)
                ) {
                    let attackFrom: HoCMath.XY | undefined;

                    // Resolve the attack side from the exact pointer cell once, then share it with
                    // the cursor and click path. This lets a player sweep across a 2x2 target to
                    // choose its near edge, just like sweeping across a mountain.
                    const pointerMeleeAttack = this.resolveUnitMeleeAttack(this.sc_mouseWorld);
                    const isMeleeAttackableTarget = pointerMeleeAttack?.target.getId() === targetUnit.getId();

                    const isRangedUnit = this.currentActiveUnit.getAttackTypeSelection() === AttackVals.RANGE;
                    const canStaticRangeAttack = this.canAttackByRangeTargets?.has(targetUnit.getId());
                    let isRangeAttackContext = false;

                    let skipMeleeCheck = this.currentActiveUnit.hasAbilityActive("No Melee");

                    const canPerformRangeAttack =
                        this.currentActiveUnit.getAttackTypeSelection() === AttackVals.RANGE &&
                        this.attackHandler.canLandRangeAttack(
                            this.currentActiveUnit,
                            this.grid.getEnemyAggrMatrixByUnitId(this.currentActiveUnit.getId()),
                        ) &&
                        // A shot lands on the center of a VISIBLE EDGE of the target, never on its center,
                        // so a unit covered on every side (boxed in by its own allies and/or mountains) has
                        // no legal aim point and cannot be shot at all. Gating the whole range CONTEXT here
                        // — not just the static-target set — keeps the long-range visual relaxation below
                        // from re-offering a shot the engine now rejects. Through Shot pierces bodies, so a
                        // piercing shooter only loses an edge to a hard BLOCK obstacle.
                        GridMath.hasObservableRangeAttackEdge(
                            this.grid.getMatrix(),
                            targetUnit.getCells(),
                            this.currentActiveUnit.getTeam(),
                            this.currentActiveUnit.hasAbilityActive("Through Shot"),
                        );

                    // 1. Static Range Priority. Targets beyond the full-damage frame remain legal shots;
                    // the engine applies the visible 1/2, 1/4 or 1/8 distance penalty to them.
                    if (
                        canPerformRangeAttack &&
                        (canStaticRangeAttack || (isRangedUnit && !this.currentActiveUnit.hasAbilityActive("Handyman")))
                    ) {
                        const dist = HoCMath.getDistance(
                            this.currentActiveUnit.getPosition(),
                            targetUnit.getPosition(),
                        );

                        if (canStaticRangeAttack || dist > GridConstants.STEP * 1.5) {
                            // If not adjacent (or forced No Melee), prefer shooting.
                            if (
                                dist > GridConstants.STEP * 1.5 ||
                                this.currentActiveUnit.hasAbilityActive("No Melee")
                            ) {
                                isRangeAttackContext = true;
                                skipMeleeCheck = true;
                            }
                        }
                    }

                    // 2. Move-and-Shoot Logic (if not static shooting)
                    if (canPerformRangeAttack && !isRangeAttackContext && isRangedUnit) {
                        if (this.currentActiveUnit.hasAbilityActive("Sniper")) {
                            this.currentActiveUnit.setRangeShotDistance(
                                Number(
                                    (
                                        GridMath.getDistanceToFurthestCorner(
                                            this.currentActiveUnit.getPosition(),
                                            this.sc_sceneSettings.getGridSettings(),
                                        ) /
                                            this.sc_sceneSettings.getGridSettings().getStep() -
                                        0.45
                                    ).toFixed(2),
                                ),
                            );
                        }
                        const shotDist = this.currentActiveUnit.getRangeShotDistance();
                        const attackRangeForCalc = Math.max(1, shotDist); // Use Shot Distance for pathfinding!

                        const possibleShootPos = this.pathHelper.calculateClosestAttackFrom(
                            this.sc_mouseWorld,
                            this.canAttackByMeleeTargets.attackCells,
                            this.currentActiveUnit.getCells(),
                            targetUnit.getCells(),
                            this.currentActiveUnit.isSmallSize(),
                            attackRangeForCalc,
                            targetUnit.isSmallSize(),
                            TeamVals.NO_TEAM,
                            this.canAttackByMeleeTargets.attackCellHashesToLargeCells,
                        );

                        // Valid if position found AND distance implies shooting (not melee)
                        if (possibleShootPos) {
                            const distFromDest = HoCMath.getDistance(possibleShootPos, targetUnit.getPosition());
                            if (distFromDest > GridConstants.STEP * 1.5) {
                                // Found a valid SHOOTING position
                                attackFrom = possibleShootPos;
                                isRangeAttackContext = true;
                                skipMeleeCheck = true;
                            }
                        }
                    }

                    if (!skipMeleeCheck && isMeleeAttackableTarget) {
                        attackFrom = pointerMeleeAttack.attackFrom;
                    }

                    if (attackFrom || isRangeAttackContext) {
                        // Clear previous frame's highlights/visuals before adding new ones
                        this.hoverManager.clearAttackVisuals(true);
                        let shootableRangeEdges: RangeTargetEdgeVisual[] = [];
                        if (isRangeAttackContext) {
                            shootableRangeEdges = this.rangeTargetEdgeVisuals(this.currentActiveUnit, targetUnit);
                        }
                        // Mass/AOE ranged units (Cyclops/Tsar Cannon/Gargantuan) outline every unit
                        // the shot will hit; everyone else highlights just the single target — except a
                        // plain ranged shot can't pass through units, so if one blocks the line to the
                        // hovered target, outline that actual victim (red) instead of the hovered unit.
                        // The mass/AOE outline is a RANGE-attack visual only. A ranged unit that also has an
                        // AOE ability (e.g. Gargantuan's Area Throw) can still MELEE when adjacent, so gate it
                        // on the range-attack context — otherwise a melee hover painted the whole splash as if
                        // the punch were an area attack. Melee (and blocked single shots) highlight one unit.
                        if (!(isRangeAttackContext && this.highlightRangeAttackUnits(targetUnit))) {
                            const highlightUnit = isRangeAttackContext
                                ? (this.resolveFirstRangeHitUnit(targetUnit) ?? targetUnit)
                                : targetUnit;
                            this.hoverManager.addTargetHighlight(highlightUnit);
                        }

                        let attackFromPos: HoCMath.XY | undefined;
                        let attackFromCell: HoCMath.XY;

                        if (attackFrom) {
                            attackFromCell = attackFrom;
                            this.hoverManager.hoverAttackFromCell = attackFrom;

                            // Silhouette center = the geometric center of the unit's footprint at the
                            // landing cell (matches where replayMeleeApproach puts it). attackFrom is that
                            // footprint's ANCHOR — getLargeUnitAttackCells pushes anchors, and the body
                            // extends down-left from one — so the centre is the anchor cell's centre pulled
                            // back by half the body on each axis.
                            attackFromPos = this.footprintCenterForAnchor(this.currentActiveUnit, attackFrom);

                            this.hoverManager.updateHoverSilhouette(attackFromPos);
                        } else {
                            // Static Range Attack (No movement)
                            attackFromPos = this.currentActiveUnit.getPosition();
                            attackFromCell = this.currentActiveUnit.getBaseCell();
                            this.hoverManager.hoverAttackFromCell = attackFromCell;
                            this.hoverManager.hideSilhouettesOnly();
                        }

                        // Target visual center
                        let tVis: HoCMath.XY;
                        if (targetUnit instanceof RenderableUnit) {
                            tVis = targetUnit.getVisualCenter(gs);
                        } else {
                            tVis = targetUnit.getPosition();
                        }

                        // A plain (non-piercing) shot stops at the first unit on its trajectory: if a
                        // unit intercepts it before the aimed target, THAT unit takes the damage — so
                        // predict damage against it and show the number over it, not the target behind
                        // it. Through Shot pierces, so it keeps predicting on the aimed target.
                        const rangeInterceptUnit =
                            isRangeAttackContext && !this.currentActiveUnit.hasAbilityActive("Through Shot")
                                ? this.resolveFirstRangeHitUnit(targetUnit)
                                : undefined;
                        const damageUnit =
                            rangeInterceptUnit && rangeInterceptUnit.getId() !== targetUnit.getId()
                                ? rangeInterceptUnit
                                : targetUnit;
                        const damageCenterVis =
                            damageUnit instanceof RenderableUnit
                                ? damageUnit.getDamagePredictionAnchor(gs)
                                : damageUnit.getPosition();
                        const arrowStartLogical = attackFromPos ?? this.currentActiveUnit.getPosition();
                        let arrowStartPos: HoCMath.XY;

                        if (!isRangeAttackContext) {
                            // Melee facing belongs to the selected logical landing cell. Do not start
                            // from the full-body sprite's shifted foot anchor: it can collapse adjacent
                            // right and bottom-right sides into the same visual direction.
                            arrowStartPos = projectBattlefieldPoint(arrowStartLogical, gs);
                        } else {
                            // A ranged trajectory starts at the exact centre of the shooter's logical cell.
                            // The unit preview is foot-anchored and therefore must not be used as line origin.
                            arrowStartPos = projectBattlefieldPoint(arrowStartLogical, gs);
                        }

                        let arrowEndPos: HoCMath.XY | undefined;
                        let arrowEndVisual: HoCMath.XY | undefined;
                        let optimalRangeEdge: RangeTargetEdgeVisual | undefined;

                        if (!isRangeAttackContext && attackFromPos) {
                            // Pick one of eight stable anchors around the target footprint (four edge
                            // midpoints + four corners), then project that logical anchor through the same
                            // transform as the painted grid. This matches the side selected by the pointer.
                            // Half the target's body on each axis: the blade stops on the edge it is
                            // actually pointing at, which is a different distance on a rectangle's two axes.
                            arrowEndPos = projectBattlefieldPoint(
                                meleeSwordTargetPoint(
                                    attackFromPos,
                                    targetUnit.getPosition(),
                                    gs.getHalfStep() * targetUnit.getFootprintWidth(),
                                    gs.getHalfStep() * targetUnit.getFootprintHeight(),
                                ),
                                gs,
                            );
                            arrowEndVisual = arrowEndPos;
                        } else {
                            optimalRangeEdge = optimalRangeTargetEdge(shootableRangeEdges, arrowStartLogical);
                            // The one visible arrow is selected by shot quality, not by which edge strip
                            // the pointer happens to cross: retain the most damage first, then use the
                            // nearest edge-center as a deterministic tie-breaker.
                            const rangeAim: GridMath.IClosestSideCenter | undefined = optimalRangeEdge
                                ? {
                                      cell: { ...optimalRangeEdge.cell },
                                      side: optimalRangeEdge.side,
                                      position: { ...optimalRangeEdge.aimPosition },
                                  }
                                : GridMath.getClosestSideCenterDetailed(
                                      this.grid.getMatrix(),
                                      gs,
                                      this.sc_mouseWorld,
                                      arrowStartLogical,
                                      targetUnit.getPosition(),
                                      this.currentActiveUnit.isSmallSize(),
                                      targetUnit.isSmallSize(),
                                      this.currentActiveUnit.getTeam(),
                                      this.currentActiveUnit.hasAbilityActive("Through Shot"),
                                  );
                            arrowEndPos = rangeAim?.position;
                            arrowEndVisual = rangeAim
                                ? projectedRangeAttackCellSideCenter(rangeAim.cell, rangeAim.side, gs)
                                : undefined;
                        }

                        // Fallback when getClosestSideCenter can't pick a side (e.g. the attacker is
                        // aligned with the target and the near cell reads blocked). Legacy drew no line
                        // here; snapping to the target CENTER made the trajectory read center-to-center.
                        // Aim at the target's NEAR EDGE along the attacker -> target line instead, so it
                        // stays "center -> the edge we pointed at".
                        if (!arrowEndPos) {
                            const targetCell =
                                GridMath.getCellForPosition(gs, this.sc_mouseWorld) ?? targetUnit.getBaseCell();
                            const targetCenter = GridMath.getPositionForCell(
                                targetCell,
                                gs.getMinX(),
                                gs.getStep(),
                                gs.getHalfStep(),
                            );
                            const dx = targetCenter.x - arrowStartLogical.x;
                            const dy = targetCenter.y - arrowStartLogical.y;
                            const fallbackSide =
                                Math.abs(dx) >= Math.abs(dy)
                                    ? dx >= 0
                                        ? GridMath.RangeAttackCellSide.LEFT
                                        : GridMath.RangeAttackCellSide.RIGHT
                                    : dy >= 0
                                      ? GridMath.RangeAttackCellSide.DOWN
                                      : GridMath.RangeAttackCellSide.UP;
                            arrowEndPos = rangeAttackCellSideCenter(targetCell, fallbackSide, gs);
                            arrowEndVisual = projectedRangeAttackCellSideCenter(targetCell, fallbackSide, gs);
                        }
                        if (isRangeAttackContext && shootableRangeEdges.length === 0) {
                            // `getClosestSideCenterDetailed` is only a geometric fallback; it must never
                            // resurrect an aiming rail after the authoritative edge checks proved that no
                            // ray reaches the hovered creature. Keep the one legitimate exception: a
                            // standing mountain/barrel on that fallback ray is an actual attack target, and
                            // the obstacle branch below will shorten the trajectory to that real impact.
                            const fallbackEvaluation = this.attackHandler.evaluateRangeAttack(
                                this.unitsHolder.getAllUnits(),
                                this.currentActiveUnit,
                                this.currentActiveUnit.getPosition(),
                                arrowEndPos,
                                false,
                                this.sc_isSelection,
                                this.currentActiveUnit.hasAbilityActive("Large Caliber") ||
                                    this.currentActiveUnit.hasAbilityActive("Area Throw"),
                            );
                            if (!fallbackEvaluation.attackObstacle) {
                                this.hoverManager.clearAttackVisuals();
                                this.hoverManager.clearHoverSilhouette();
                                this.hoverManager.hoverAttackFromCell = undefined;
                                this.hoverRangeAttackObstacle = undefined;
                                return;
                            }
                        }
                        if (isRangeAttackContext) {
                            arrowStartPos = projectBattlefieldPoint(
                                rangeTrajectoryFootprintExit(
                                    arrowStartLogical,
                                    arrowEndPos!,
                                    gs.getHalfStep() * this.currentActiveUnit.getFootprintWidth(),
                                    gs.getHalfStep() * this.currentActiveUnit.getFootprintHeight(),
                                ),
                                gs,
                            );
                            if (optimalRangeEdge) {
                                // Draw after resolving the footprint exit so the arrow and every casing use
                                // exactly the same rail. The arrow center/size remain unchanged; the casing
                                // line now terminates at the first opaque pixel of its fletching.
                                this.hoverManager.drawRangeTargetEdge(optimalRangeEdge, arrowStartPos);
                                const cameraScale = this.pixiApp.getCamera().scale;
                                arrowEndVisual = rangeTargetEdgeTrajectoryEndpoint(
                                    arrowStartPos,
                                    optimalRangeEdge.markerCenter,
                                    optimalRangeEdge.side,
                                    gs.getCellSize(),
                                    { x: cameraScale.x, y: cameraScale.y },
                                    optimalRangeEdge.markerScale,
                                );
                            }
                        }
                        let finalArrowEndPos = arrowEndPos!;
                        // Through Shot keeps flying past the aimed target to the field edge, so the
                        // trajectory line matches every unit it actually hits (parity with legacy).
                        if (this.currentActiveUnit.hasAbilityActive("Through Shot")) {
                            finalArrowEndPos = GridMath.projectLineToFieldEdge(
                                gs,
                                arrowStartLogical.x,
                                arrowStartLogical.y,
                                finalArrowEndPos.x,
                                finalArrowEndPos.y,
                            );
                        }
                        tVis = this.currentActiveUnit.hasAbilityActive("Through Shot")
                            ? projectBattlefieldPoint(finalArrowEndPos, gs)
                            : (arrowEndVisual ?? projectBattlefieldPoint(finalArrowEndPos, gs));

                        // Calculate projected damage.
                        //
                        // Every number below is produced by the SHARED projection in common
                        // (projectAttackDamage / projectDoubleShotAttack + the ability tails in
                        // damage/ability_damage_projection), which is the very code
                        // Unit.calculateAttackDamage resolves a real attack with. This block used to
                        // re-derive the engine's formula by hand and promise to "keep in sync" with it; the
                        // hand-kept copy drifted 40 measured ways — it read the wrong armor field, ceiled
                        // multipliers that the engine floors after the roll, published a top-of-band the
                        // engine can never roll, dropped the elemental / Giant's Maul / Broken Aegis /
                        // status-resistance tails, and priced Double Shot as a flat x2. Add nothing
                        // arithmetic here: extend the shared projection instead, so both sides move together.
                        const attackRate = this.currentActiveUnit.getAttack();
                        const abilityPower = FightStateManager.getInstance()
                            .getFightProperties()
                            .getAdditionalAbilityPowerPerTeam(this.currentActiveUnit.getTeam());

                        // The engine resolves a swing as MELEE and a shot as RANGE — there is no third case.
                        // A RANGE unit forced to poke in melee still resolves as MELEE: the projection derives
                        // its half-strength penalty from the ATTACKER's own attack type and applies it to the
                        // roll under the engine's single Math.floor. Hence no `isMelee` flag (it used to be
                        // handed to calculateAttackDamageMin/Max's `isRangeAttack` parameter, exactly
                        // inverted, so melee hovers priced against getRangeArmor() and shots against
                        // getArmor()) and no divisor of 2 for the poke.
                        const hoverAttackType: AttackType = isRangeAttackContext ? AttackVals.RANGE : AttackVals.MELEE;
                        let rangeDivisor = 1;
                        let multiplier = 1; // Initialize BEFORE position logic usage

                        // --- [FIX] Calculate Exact Attack Position for Multipliers (e.g. Backstab) ---
                        // We need to know WHERE the attack comes from to trigger position-based abilities.
                        // Logic from test_heroes.ts:
                        let hoverAttackFromCell: HoCMath.XY | undefined;
                        if (!isRangeAttackContext) {
                            // Reuse the pointer-resolved landing that already passed the same footprint
                            // adjacency rule as the engine. Resolving it a second time could choose a
                            // different cell and revive a through-cell preview in the damage calculation.
                            hoverAttackFromCell = attackFromCell;
                        } else {
                            // Range: From current position
                            hoverAttackFromCell = this.currentActiveUnit.getBaseCell();
                        }

                        // Apply Positional Ability Multipliers (Backstab). MELEE ONLY: handleMeleeAttack is
                        // the single engine path that folds a position coefficient into its abilityMultiplier
                        // (attack_handler ~1991). A shot never does, so neither may a ranged hover.
                        if (hoverAttackFromCell && !isRangeAttackContext) {
                            const abilitiesWithPositionCoeff = AbilityHelper.getAbilitiesWithPosisionCoefficient(
                                this.currentActiveUnit.getAbilities(),
                                hoverAttackFromCell,
                                targetUnit.getBaseCell(),
                                targetUnit.isSmallSize(),
                                this.currentActiveUnit.getTeam(),
                                targetUnit.getFootprintHeight(),
                                FightStateManager.getInstance().getFightProperties().isSideOrientedPlacement(),
                                targetUnit.getFootprintWidth(),
                            );
                            if (abilitiesWithPositionCoeff && abilitiesWithPositionCoeff.length) {
                                for (const awpc of abilitiesWithPositionCoeff) {
                                    multiplier *= this.currentActiveUnit.calculateAbilityMultiplier(awpc, abilityPower);
                                }
                            }
                        }

                        // Sync 'attackFromCell' usage for downstream logic (War Anger/Rapid Charge)
                        // But wait! attackFromCell was used EARLIER (lines 3156 or passed from earlier).
                        // If we overwrite it here, it only affects logic BELOW (which is what we want for damage calcs).
                        if (hoverAttackFromCell) {
                            attackFromCell = hoverAttackFromCell; // Update local 'attackFromCell' variable
                        }

                        // [Insert Positional Logic Here]

                        // NO melee-penalty divisor here. A RANGE unit swinging without Handyman lands a
                        // half-strength poke, and the engine applies that 0.5 to the ROLL, inside its single
                        // Math.floor (resolveAttackDamageChain.attackTypeMultiplier). Encoding it as
                        // `divisor = 2` divided INSIDE the band's Math.ceil instead — ceil(x/2) exceeds
                        // floor(ceil(x) * 0.5) for every odd value, so the hover over-promised roughly half
                        // of all ranged-into-melee pokes and advertised 1 damage where the engine deals 0.
                        // `divisor` is now ONLY the range falloff / smoke divisor, exactly as the engine
                        // names its own parameter.

                        // Distance falloff. Ask the ENGINE (getRangeAttackDivisor) rather than re-deriving
                        // it: damage halves for EVERY full shot-distance crossed and caps at 1/8, and the
                        // Sniper ability negates it entirely. The rule here used to be a single
                        // "further than one shot distance -> 1/2" step, so a shot two or three range-bands
                        // out was predicted at half damage while the engine actually dealt a quarter or an
                        // eighth — the hover over-promised on exactly the long shots where the penalty
                        // matters most. Same call the engine makes, so prediction and resolution agree.
                        // The attacker position is deliberately LEFT TO DEFAULT (getPosition()) rather than
                        // passed as arrowStartPos: the engine measures falloff from the unit's position,
                        // while arrowStartPos is its VISUAL centre — for a large (2x2) shooter those differ,
                        // and feeding the visual centre here would put the hover in a different band than
                        // the shot it is predicting, right at a boundary.
                        // Keep the WHOLE per-hit divisor list, not just the first entry. A Through Shot
                        // prices each unit it pierces with THAT unit's divisor — processThroughShotAbility
                        // reads hoverRangeAttackDivisors.at(i) — so indexing the aimed target with
                        // divisors[0] (the first body on the ray) mispriced it by up to 8x.
                        let rangeAttackDivisors: number[] = [];
                        let rangeAttackGroups: Unit[][] = [];
                        if (isRangeAttackContext) {
                            // Take the divisors the ENGINE resolved for this exact shot rather than the raw
                            // distance band: evaluateRangeAttack folds SMOKE in (a ray that crosses a
                            // smoked cell doubles the divisor, capped at 1/8), so the badge shows 1/2 where
                            // the shot really lands 1/2. Falls back to the pure distance band if the
                            // evaluation produced no divisor (nothing on the ray).
                            const shotEvaluation = this.attackHandler.evaluateRangeAttack(
                                this.unitsHolder.getAllUnits(),
                                this.currentActiveUnit,
                                this.currentActiveUnit.getPosition(),
                                finalArrowEndPos,
                                this.currentActiveUnit.hasAbilityActive("Through Shot"),
                                false,
                                this.currentActiveUnit.hasAbilityActive("Large Caliber") ||
                                    this.currentActiveUnit.hasAbilityActive("Area Throw"),
                            );
                            rangeAttackDivisors = shotEvaluation.rangeAttackDivisors;
                            rangeAttackGroups = shotEvaluation.affectedUnits;
                            // The badge sits on the unit the number is drawn over, so show ITS falloff band.
                            const damageUnitHitIndex = rangeAttackGroups.findIndex((group) =>
                                group.some((unit) => unit.getId() === damageUnit.getId()),
                            );
                            rangeDivisor =
                                rangeAttackDivisors[damageUnitHitIndex] ??
                                rangeAttackDivisors[0] ??
                                this.attackHandler.getRangeAttackDivisor(this.currentActiveUnit, finalArrowEndPos);
                        }

                        // --- The multiplier chain the ENGINE builds before calling calculateAttackDamage ---
                        //
                        // The RANGED ability multipliers (Through Shot, Large Caliber, Area Throw, Chakram and
                        // Double Shot's second volley) are deliberately NOT accumulated here any more: each
                        // has its own shared projection below, which owns both the multiplier AND the tail the
                        // engine runs after it. Notably Double Shot is not a flat x2 — it is a stack_powered
                        // ability whose second volley lands at 20%..100% + luck + Dual Strike Charm, and it
                        // does not fly at all on an empty quiver.
                        //
                        // What is left is exactly what handleMeleeAttack folds in: Rapid Charge, Paralysis and
                        // the position coefficient applied above.

                        // 1. Rapid Charge — MELEE only (attack_handler ~1983). A shot never charges.
                        if (!isRangeAttackContext && attackFromCell && this.currentActiveKnownPaths) {
                            const key = (attackFromCell.x << 4) | attackFromCell.y;
                            const paths = this.currentActiveKnownPaths.get(key);
                            let rapidChargeCellsNumber = 1;
                            if (paths && paths.length > 0) {
                                rapidChargeCellsNumber = paths[0].route.length;
                            }
                            multiplier *= AllAbilities.processRapidChargeAbility(
                                this.currentActiveUnit,
                                rapidChargeCellsNumber,
                            );
                        }

                        // 2. Paralysis (attacker effect) — the shared helper every engine damage path uses.
                        multiplier *= attackerParalysisMultiplier(this.currentActiveUnit);

                        // 3. NO Deep Wounds step. resolveAttackDamageChain owns the victim's stacked
                        // amplification and folds it into every projection below; applying it here as well
                        // would square it — which is exactly the bug the engine's own duplicate had.

                        // 4. War Anger (Attack Rate Modification based on Position)
                        const warAngerAuraEffect = this.currentActiveUnit.getAuraEffect("War Anger");
                        let effectiveAttackRate = attackRate;

                        if (warAngerAuraEffect) {
                            // Sample the auras on the cells the attacker will really stand on. attackFromCell
                            // is the landing ANCHOR, so the body hangs down-left of it; the three cells this
                            // used to push grew UP-RIGHT instead, which sampled cells no shape ever occupies.
                            const cells: HoCMath.XY[] = attackFromCell
                                ? this.currentActiveUnit.getFootprintCellsForAnchor(attackFromCell)
                                : this.currentActiveUnit.getCells();

                            const newAttackRate =
                                attackRate -
                                this.currentActiveUnit.getCurrentAttackModIncrease() +
                                this.unitsHolder.getUnitAuraAttackMod(this.currentActiveUnit, cells);
                            effectiveAttackRate = Math.max(1, newAttackRate);
                        }

                        // Shared by every branch below: the attacker, its team's synergy power, and the attack
                        // rate the strike will actually happen at (War Anger can change it at the destination
                        // cell — the ONLY reason to override the engine's own getAttack()).
                        const projectionBase = {
                            attacker: this.currentActiveUnit,
                            attackType: hoverAttackType,
                            synergyAbilityPowerIncrease: abilityPower,
                            attackRate: effectiveAttackRate,
                        };

                        // Lucky Strike is a PROC, so it belongs on the top of the band only — and at the exact
                        // point the engine applies it: to the damage calculateAttackDamage produced, BEFORE any
                        // AOE/line tail (Giant's Maul, Broken Aegis, status resistance) and before Penetrating
                        // Bite is added on. (The old code added the bite first and then multiplied it too.)
                        // Captured once: the closures below outlive TypeScript's narrowing of this.currentActiveUnit.
                        const attackerUnit = this.currentActiveUnit;
                        const luckyStrikeAbility = attackerUnit.getAbility("Lucky Strike");
                        const withLuckyStrike = (damage: number): number =>
                            luckyStrikeAbility
                                ? Math.floor(
                                      damage *
                                          attackerUnit.calculateAbilityMultiplier(luckyStrikeAbility, abilityPower),
                                  )
                                : damage;

                        // BUFF Fireforged Sword: the enchanted blade adds a SECOND, MAGICAL hit on the unit the
                        // swing/shot landed on — a share of the damage dealt, half again as much against water,
                        // nothing against fire, then cut by the victim's magic resistance. The engine reports it
                        // as its own secondary entry (attack_handler 1458 / 2468 / 2649) rather than folding it
                        // into the swing, which is why the hover never counted it and under-read every
                        // enchanted attack by the burn.
                        const fireforgedSwordBuff = attackerUnit.getBuff(AllAbilities.FIREFORGED_SWORD_BUFF_NAME);
                        const fireforgedBurn = (victim: Unit, damage: number): number =>
                            fireforgedSwordBuff
                                ? fireforgedSwordDamage({
                                      damageDealt: damage,
                                      swordPercentage: fireforgedSwordPower(
                                          fireforgedSwordBuff.getPower(),
                                          attackerUnit.getEmpowerPercentage(),
                                      ),
                                      targetMagicResist: victim.getMagicResist(),
                                      targetIsFireElement: victim.hasAbilityActive("Fire Element"),
                                      targetIsWaterElement: victim.hasAbilityActive("Water Element"),
                                  })
                                : 0;

                        // Everything the strike lands on, accumulated PER UNIT: a unit struck twice (both
                        // Double Shot volleys, a swing plus the spin that follows it) loses creatures to the
                        // SUM, so the kill spread has to be taken once, from the final post-tail damage —
                        // never per hit and never from a pre-tail band.
                        const projectedByUnit = new Map<string, { unit: Unit; min: number; max: number }>();
                        const addProjectedDamage = (victim: Unit, minDamage: number, maxDamage: number): void => {
                            const alreadyStruck = projectedByUnit.get(victim.getId());
                            if (alreadyStruck) {
                                alreadyStruck.min += minDamage;
                                alreadyStruck.max += maxDamage;
                                return;
                            }
                            projectedByUnit.set(victim.getId(), { unit: victim, min: minDamage, max: maxDamage });
                        };

                        // --- Multi-Target Highlight (AOE) ---
                        // Each secondary carries the ability that produced it: they do NOT share the primary's
                        // damage shape (its multiplier chain, its tail, its resistance), and pricing them all
                        // like the primary — as this used to — was wrong by the whole difference.
                        const secondaryHits: Array<{ unit: Unit; source: string }> = [];
                        // Units the RANGE branches priced themselves but that nothing else outlines (Chakram
                        // bounces leave the ray, so highlightRangeAttackUnits never sees them).
                        const rangeHighlightExtras: Unit[] = [];
                        // Per-victim damage scaling for the prediction (Chakram halves 2-cell bounces).
                        const secondaryDamageFactorById = new Map<string, number>();

                        const throughShotHover =
                            isRangeAttackContext && this.currentActiveUnit.hasAbilityActive("Through Shot");
                        const aoeHoverAbility = isRangeAttackContext
                            ? aoeAttackAbility(this.currentActiveUnit)
                            : undefined;
                        const doubleShotHoverAbility = doubleShotAbility(this.currentActiveUnit);
                        // The second volley of a Double Shot on an AOE / Through Shot attacker is the SAME wave
                        // fired again, scaled by the Double Shot multiplier (attack_handler ~934,
                        // double_shot_ability ~122). Paralysis is deliberately absent: the wave's own
                        // multiplier already carries it, and applying it twice would double-count the slow.
                        const secondVolleyMultiplier = doubleShotHoverAbility
                            ? AbilityHelper.withDualStrikeCharm(
                                  this.currentActiveUnit.calculateAbilityMultiplier(
                                      doubleShotHoverAbility,
                                      abilityPower,
                                  ),
                                  this.currentActiveUnit,
                              )
                            : 0;

                        if (isRangeAttackContext && throughShotHover) {
                            // Through Shot pierces: EVERY unit on the ray takes its own hit, priced with its
                            // OWN divisor and its own line tail (Giant's Maul, then that unit's physical-AOE
                            // status resistance — no Broken Aegis on this path). processThroughShotAbility
                            // walks exactly these groups and skips any group that is not a single unit.
                            //
                            // The bonus volley re-runs the whole pierce; it only flies while the quiver still
                            // holds an arrow, because the first volley spends one AFTER it lands and
                            // calculateAttackDamage then bails to a hard 0. Through Shot spends exactly one
                            // shot (decreaseNumberOfShots, not spendShotsAgainst), hence no Dense Flesh target.
                            const volleyMultipliers =
                                secondVolleyMultiplier > 0 &&
                                this.currentActiveUnit.projectRangeShotsAfterVolleys(undefined, 1) > 0
                                    ? [1, secondVolleyMultiplier]
                                    : [1];
                            for (let hitIndex = 0; hitIndex < rangeAttackGroups.length; hitIndex++) {
                                const hitGroup = rangeAttackGroups[hitIndex];
                                const piercedUnit = hitGroup?.length === 1 ? hitGroup[0] : undefined;
                                const pierceDivisor = rangeAttackDivisors[hitIndex];
                                if (!piercedUnit || piercedUnit.isDead() || !pierceDivisor) {
                                    continue;
                                }
                                let pierceMin = 0;
                                let pierceMax = 0;
                                for (const volleyMultiplier of volleyMultipliers) {
                                    const band = projectAttackDamageBand({
                                        ...projectionBase,
                                        target: piercedUnit,
                                        divisor: pierceDivisor,
                                        abilityMultiplier: throughShotAbilityMultiplier(
                                            this.currentActiveUnit,
                                            abilityPower,
                                            volleyMultiplier,
                                        ),
                                    });
                                    pierceMin += applyThroughShotDamageTail({
                                        attacker: this.currentActiveUnit,
                                        victim: piercedUnit,
                                        damage: band.min,
                                    });
                                    pierceMax += applyThroughShotDamageTail({
                                        attacker: this.currentActiveUnit,
                                        victim: piercedUnit,
                                        damage: withLuckyStrike(band.max),
                                    });
                                }
                                if (piercedUnit.getId() === damageUnit.getId()) {
                                    pierceMin += fireforgedBurn(piercedUnit, pierceMin);
                                    pierceMax += fireforgedBurn(piercedUnit, pierceMax);
                                }
                                addProjectedDamage(piercedUnit, pierceMin, pierceMax);
                            }
                            if (!projectedByUnit.size) {
                                // The ray produced no single-unit group (the aim edge resolved off the
                                // hovered body). Never leave the hover blank: price the aimed unit at the
                                // badge's own divisor rather than showing a 0 the shot will not deal.
                                const band = projectAttackDamageBand({
                                    ...projectionBase,
                                    target: damageUnit,
                                    divisor: rangeDivisor,
                                    abilityMultiplier: throughShotAbilityMultiplier(
                                        this.currentActiveUnit,
                                        abilityPower,
                                    ),
                                });
                                addProjectedDamage(
                                    damageUnit,
                                    applyThroughShotDamageTail({
                                        attacker: this.currentActiveUnit,
                                        victim: damageUnit,
                                        damage: band.min,
                                    }),
                                    applyThroughShotDamageTail({
                                        attacker: this.currentActiveUnit,
                                        victim: damageUnit,
                                        damage: withLuckyStrike(band.max),
                                    }),
                                );
                            }
                        } else if (isRangeAttackContext && aoeHoverAbility) {
                            // Large Caliber / Area Throw / Chakram: processRangeAOEAbility damages the WHOLE
                            // group the ray collected — the aimed unit AND everything the splash caught (which
                            // highlightRangeAttackUnits already outlines red) — each through the AOE tail:
                            // the per-victim bounce factor, ARTIFACT Giant's Maul, the victim's own Broken
                            // Aegis, then its physical-AOE status resistance, flooring at every step. The
                            // hover used to price the aimed unit alone and skip the tail entirely.
                            const aoeVictims: Unit[] = [];
                            for (const splashed of rangeAttackGroups[0] ?? []) {
                                if (!splashed.isDead()) {
                                    aoeVictims.push(splashed);
                                }
                            }
                            if (!aoeVictims.length) {
                                aoeVictims.push(damageUnit);
                            }
                            // ABILITY Chakram (Zena): the disc's separation chain is deterministic, so the
                            // hover shows the EXACT stack-power-capped victims the engine will strike — same
                            // resolver, zero drift. They JOIN affectedUnits in the attack handler, so they
                            // resolve through this very same AOE tail; a two-cell bounce carries its
                            // half-damage factor.
                            if (this.currentActiveUnit.hasAbilityActive("Chakram")) {
                                const chakramPreview = AllAbilities.resolveChakramTrajectory(
                                    this.currentActiveUnit,
                                    targetUnit,
                                    this.unitsHolder,
                                    this.grid,
                                );
                                for (const bounced of chakramPreview.hitUnits) {
                                    secondaryDamageFactorById.set(
                                        bounced.getId(),
                                        chakramPreview.damageFactorByUnitId[bounced.getId()] ?? 1,
                                    );
                                    if (bounced.isDead() || aoeVictims.some((u) => u.getId() === bounced.getId())) {
                                        continue;
                                    }
                                    aoeVictims.push(bounced);
                                    if (bounced.getId() !== damageUnit.getId()) {
                                        rangeHighlightExtras.push(bounced);
                                    }
                                }
                            }
                            // The second wave is the same area attack again (it re-enters
                            // processRangeAOEAbility with the AOE ability's own multiplier — the Double Shot
                            // multiplier and the Dual Strike Charm do NOT reach it), and it dies with the
                            // quiver: the first wave spends its arrows via spendShotsAgainst.
                            const aoeWaves =
                                doubleShotHoverAbility &&
                                this.currentActiveUnit.projectRangeShotsAfterVolleys(aoeVictims[0], 1) > 0
                                    ? 2
                                    : 1;
                            for (const victim of aoeVictims) {
                                const band = projectAttackDamageBand({
                                    ...projectionBase,
                                    target: victim,
                                    divisor: rangeAttackDivisors[0] ?? rangeDivisor,
                                    abilityMultiplier: aoeAttackAbilityMultiplier(
                                        this.currentActiveUnit,
                                        abilityPower,
                                        aoeHoverAbility,
                                    ),
                                });
                                const perUnitDamageFactor = secondaryDamageFactorById.get(victim.getId());
                                let victimMin =
                                    aoeWaves *
                                    applyAoeDamageTail({
                                        attacker: this.currentActiveUnit,
                                        victim,
                                        damage: band.min,
                                        perUnitDamageFactor,
                                    });
                                let victimMax =
                                    aoeWaves *
                                    applyAoeDamageTail({
                                        attacker: this.currentActiveUnit,
                                        victim,
                                        damage: withLuckyStrike(band.max),
                                        perUnitDamageFactor,
                                    });
                                if (victim.getId() === damageUnit.getId()) {
                                    victimMin += fireforgedBurn(victim, victimMin);
                                    victimMax += fireforgedBurn(victim, victimMax);
                                }
                                addProjectedDamage(victim, victimMin, victimMax);
                            }
                        } else if (isRangeAttackContext) {
                            // Plain shot. projectDoubleShotAttack fires BOTH volleys the way the engine does —
                            // two independent shots, each ceiling its own band and flooring its own product —
                            // and returns a flat 0 for the second one when the ability is missing or the last
                            // arrow already flew. The old flat "x2" was right only at a full stack with no
                            // luck and no Dual Strike Charm, and it promised a second shot on an empty quiver.
                            const doubleShot = projectDoubleShotAttack({
                                ...projectionBase,
                                target: damageUnit,
                                divisor: rangeDivisor,
                            });
                            const shotMin = doubleShot.first.min + doubleShot.second.min;
                            const shotMax =
                                withLuckyStrike(doubleShot.first.max) + withLuckyStrike(doubleShot.second.max);
                            // The blade burns off the FIRST shot only — the engine's on-hit block runs once
                            // per attack, on the damage that shot dealt.
                            addProjectedDamage(
                                damageUnit,
                                shotMin + fireforgedBurn(damageUnit, doubleShot.first.min),
                                shotMax + fireforgedBurn(damageUnit, withLuckyStrike(doubleShot.first.max)),
                            );
                        } else {
                            // Melee swing. One projection for the whole engine pipeline: the band, the
                            // ranged-poke penalty, the ability chain built above, the victim's Deep Wounds
                            // amplification and the Fire/Water affinity, all under the engine's single floor.
                            const swing = projectAttackDamage({
                                ...projectionBase,
                                target: damageUnit,
                                abilityMultiplier: multiplier,
                            });
                            const penetratingBite = AllAbilities.processPenetratingBiteAbility(
                                this.currentActiveUnit,
                                damageUnit,
                            );
                            let meleeMin = swing.min + penetratingBite;
                            let meleeMax = withLuckyStrike(swing.max) + penetratingBite;
                            // Double Punch / Crafted Double Punch: a SECOND full swing at the ability's own
                            // (stack-powered, luck- and Dual-Strike-Charm-scaled) share. The engine fires it
                            // unconditionally from attack_handler ~2547; the hover showed only the first punch,
                            // which under-read the attack by 20% at stack 1 and by 100% at a full stack.
                            const doublePunchAbility =
                                this.currentActiveUnit.getAbility("Double Punch") ??
                                this.currentActiveUnit.getAbility("Crafted Double Punch");
                            if (doublePunchAbility && !this.currentActiveUnit.hasAbilityActive("No Melee")) {
                                const secondPunch = projectAttackDamage({
                                    ...projectionBase,
                                    target: damageUnit,
                                    abilityMultiplier:
                                        AbilityHelper.withDualStrikeCharm(
                                            this.currentActiveUnit.calculateAbilityMultiplier(
                                                doublePunchAbility,
                                                abilityPower,
                                            ),
                                            this.currentActiveUnit,
                                        ) * attackerParalysisMultiplier(this.currentActiveUnit),
                                });
                                const secondPunchMin = secondPunch.min + penetratingBite;
                                const secondPunchMax = withLuckyStrike(secondPunch.max) + penetratingBite;
                                meleeMin += secondPunchMin + fireforgedBurn(damageUnit, secondPunchMin);
                                meleeMax += secondPunchMax + fireforgedBurn(damageUnit, secondPunchMax);
                            }
                            addProjectedDamage(
                                damageUnit,
                                meleeMin + fireforgedBurn(damageUnit, swing.min + penetratingBite),
                                meleeMax + fireforgedBurn(damageUnit, withLuckyStrike(swing.max) + penetratingBite),
                            );
                        }

                        // The primary hit ALONE, snapshotted before any rider adds to it: Chain Lightning's
                        // arcs are a share of the blow that triggered them, so they must not compound with a
                        // Lightning Spin hit that lands on the same unit later in this same pass.
                        const primaryHitBeforeRiders = projectedByUnit.get(damageUnit.getId());
                        const primaryHitMin = primaryHitBeforeRiders?.min ?? 0;
                        const primaryHitMax = primaryHitBeforeRiders?.max ?? 0;

                        // Common AOE (Lightning Spin, Fire Breath, Skewer Strike) - Usually Melee triggered?
                        // If Move-and-Shoot (Range), we probably shouldn't trigger Melee AOE visuals unless logic supports it.
                        // Assuming these are Melee abilities for now.
                        if (!isRangeAttackContext && attackFromCell) {
                            if (this.currentActiveUnit.hasAbilityActive("Lightning Spin")) {
                                const enemiesAround = this.unitsHolder.allEnemiesAroundUnit(
                                    this.currentActiveUnit,
                                    true,
                                    attackFromCell,
                                );
                                for (const enemy of enemiesAround) {
                                    // The spin hits EVERY adjacent enemy, the swung-at one included: the
                                    // engine's own enemy list is allEnemiesAroundUnit with no exclusion, so
                                    // the primary takes its swing AND a spin hit. Only the red highlight has
                                    // to skip it (it is outlined as the primary already).
                                    if (!enemy.isDead()) {
                                        secondaryHits.push({ unit: enemy, source: "Lightning Spin" });
                                    }
                                }
                            }

                            if (
                                this.currentActiveUnit.hasAbilityActive("Fire Breath") ||
                                this.currentActiveUnit.hasAbilityActive("Skewer Strike")
                            ) {
                                // Fire Breath and Skewer Strike sweep through the same helper but with
                                // DIFFERENT flags — see pierceSweepPreviewOptions. Previewing Skewer with
                                // Fire Breath's pierceLargeUnits outlined units behind a LARGE target that
                                // the spear never reaches.
                                const sweep = pierceSweepPreviewOptions(this.currentActiveUnit);
                                const attackerHasFireBreath = sweep.source === "Fire Breath";
                                const targets = AbilityHelper.nextStandingTargets(
                                    this.currentActiveUnit,
                                    targetUnit,
                                    this.grid,
                                    this.unitsHolder,
                                    attackFromCell,
                                    sweep.pierceLargeUnits,
                                    sweep.onlyOppositeTeam,
                                );

                                for (const enemy of targets) {
                                    // Dead units don't block the wave — the fire passes through their cell.
                                    if (enemy.isDead()) {
                                        continue;
                                    }
                                    // Fire Breath is FIRE: a fully fire-immune unit (Fire Element, e.g. Efreet /
                                    // Black Dragon, or 100% magic resist) takes no damage AND acts as a fire wall —
                                    // it shields every unit behind it. Stop the sweep highlight here so neither the
                                    // immune unit nor anything behind it is outlined (mirrors fire_breath_ability's
                                    // break). Skewer Strike is physical, so gate this on Fire Breath only.
                                    if (
                                        attackerHasFireBreath &&
                                        (enemy.hasAbilityActive("Fire Element") || enemy.getMagicResist() >= 100)
                                    ) {
                                        break;
                                    }
                                    // The primary target is outlined separately — don't double-add it here.
                                    if (enemy.getId() === targetUnit.getId()) {
                                        continue;
                                    }
                                    secondaryHits.push({ unit: enemy, source: sweep.source });
                                }
                            }

                            if (this.currentActiveUnit.hasAbilityActive("Chain Lightning")) {
                                const targets = AllAbilities.getChainLightningTargets(
                                    targetUnit,
                                    this.grid,
                                    this.unitsHolder,
                                );
                                for (const enemy of targets) {
                                    if (enemy.getId() !== targetUnit.getId() && !enemy.isDead()) {
                                        secondaryHits.push({ unit: enemy, source: "Chain Lightning" });
                                    }
                                }
                            }
                        }

                        // Calculate stats for secondary targets. Each one is projected with the SHARED band and
                        // then given ITS OWN ability's tail, because that is what the engine runs: the breath
                        // is magical (magic resistance, Heavy Armor, Broken Aegis — no Giant's Maul), the
                        // skewer and the spin are physical AOE (Giant's Maul, then physical-AOE status
                        // resistance). None of them carries the primary's multiplier chain.
                        const heavyArmorMultiplier = (unit: Unit): number => {
                            const heavyArmorAbility = unit.getAbility("Heavy Armor");
                            if (!heavyArmorAbility) {
                                return 1;
                            }
                            return Number(
                                (
                                    ((heavyArmorAbility.getPower() + unit.getLuck()) /
                                        100 /
                                        HoCConstants.MAX_UNIT_STACK_POWER) *
                                        unit.getStackPower() +
                                    1
                                ).toFixed(2),
                            );
                        };
                        const withBrokenAegis = (unit: Unit, damage: number): number => {
                            const aegisShieldBuff = unit.getBuff("Broken Aegis");
                            return aegisShieldBuff
                                ? Math.floor(damage * (1 - aegisShieldBuff.getPower() / 100))
                                : damage;
                        };
                        for (const secondaryHit of secondaryHits) {
                            const enemy = secondaryHit.unit;
                            // Penetrating Bite is an on-TARGET additive in the engine (the melee swing and the
                            // second punch add it); no AOE rider does, so it stays off every secondary.
                            if (secondaryHit.source === "Fire Breath") {
                                // fire_breath_ability ~86: the breath's own multiplier, then the victim's MAGIC
                                // resistance and Heavy Armor coefficient inside one floor, then its Broken
                                // Aegis. Magic resistance is the whole point of this branch — Wardguard, Magic
                                // Shield, Warding Mane Aura and Arcane Ward Aura all compose into it, and the
                                // hover applied none of them (it showed 400 against a hit that landed for 200).
                                const fireBreathAbility = this.currentActiveUnit.getAbility("Fire Breath");
                                const band = projectAttackDamageBand({
                                    ...projectionBase,
                                    target: enemy,
                                    abilityMultiplier: fireBreathAbility
                                        ? this.currentActiveUnit.calculateAbilityMultiplier(
                                              fireBreathAbility,
                                              abilityPower,
                                          )
                                        : 1,
                                });
                                const magicCut = (1 - enemy.getMagicResist() / 100) * heavyArmorMultiplier(enemy);
                                addProjectedDamage(
                                    enemy,
                                    withBrokenAegis(enemy, Math.floor(band.min * magicCut)),
                                    withBrokenAegis(enemy, Math.floor(band.max * magicCut)),
                                );
                                continue;
                            }
                            if (secondaryHit.source === "Skewer Strike") {
                                // skewer_strike_ability ~109: the skewer's own multiplier, then Giant's Maul
                                // and the victim's physical-AOE status resistance — the Through Shot tail.
                                const skewerStrikeAbility = this.currentActiveUnit.getAbility("Skewer Strike");
                                const band = projectAttackDamageBand({
                                    ...projectionBase,
                                    target: enemy,
                                    abilityMultiplier: skewerStrikeAbility
                                        ? this.currentActiveUnit.calculateAbilityMultiplier(
                                              skewerStrikeAbility,
                                              abilityPower,
                                          )
                                        : 1,
                                });
                                addProjectedDamage(
                                    enemy,
                                    applyThroughShotDamageTail({
                                        attacker: this.currentActiveUnit,
                                        victim: enemy,
                                        damage: band.min,
                                    }),
                                    applyThroughShotDamageTail({
                                        attacker: this.currentActiveUnit,
                                        victim: enemy,
                                        damage: band.max,
                                    }),
                                );
                                continue;
                            }
                            if (secondaryHit.source === "Lightning Spin") {
                                // lightning_spin_ability ~116-136 builds spin x Rapid Charge x Paralysis x the
                                // victim's Deep Wounds, and then hands that product to calculateAttackDamage's
                                // `divisor` PARAMETER with a synergy of 1 — the multiplier and the synergy are
                                // both in the wrong slot at that call site. This mirrors it argument for
                                // argument so the hover shows what the spin really deals; if that call is ever
                                // corrected, move the product back to `abilityMultiplier` here (and restore
                                // `abilityPower`) in the same change.
                                const lightningSpinAbility = this.currentActiveUnit.getAbility("Lightning Spin");
                                let spinMultiplier = lightningSpinAbility
                                    ? this.currentActiveUnit.calculateAbilityMultiplier(
                                          lightningSpinAbility,
                                          abilityPower,
                                      )
                                    : 1;
                                if (attackFromCell && this.currentActiveKnownPaths) {
                                    const spinPaths = this.currentActiveKnownPaths.get(
                                        (attackFromCell.x << 4) | attackFromCell.y,
                                    );
                                    spinMultiplier *= AllAbilities.processRapidChargeAbility(
                                        this.currentActiveUnit,
                                        spinPaths?.length ? spinPaths[0].route.length : 1,
                                    );
                                }
                                spinMultiplier *= attackerParalysisMultiplier(this.currentActiveUnit);
                                const spinDeepWounds = enemy.getEffect("Deep Wounds");
                                if (spinDeepWounds && AllAbilities.hasAnyDeepWoundsAbility(this.currentActiveUnit)) {
                                    spinMultiplier *= 1 + spinDeepWounds.getPower() / 100;
                                }
                                if (spinMultiplier <= 0) {
                                    // A fully paralysed spin: the engine would divide by zero here. Show the
                                    // nothing it is worth rather than an infinity.
                                    addProjectedDamage(enemy, 0, 0);
                                    continue;
                                }
                                const band = projectAttackDamageBand({
                                    ...projectionBase,
                                    target: enemy,
                                    synergyAbilityPowerIncrease: 1,
                                    divisor: spinMultiplier,
                                });
                                // The spin adds Penetrating Bite per victim and then runs the full AOE tail
                                // (Maul, the victim's Broken Aegis, its physical-AOE resistance) in that order.
                                const spinBite = AllAbilities.processPenetratingBiteAbility(
                                    this.currentActiveUnit,
                                    enemy,
                                );
                                addProjectedDamage(
                                    enemy,
                                    applyAoeDamageTail({
                                        attacker: this.currentActiveUnit,
                                        victim: enemy,
                                        damage: band.min + spinBite,
                                    }),
                                    applyAoeDamageTail({
                                        attacker: this.currentActiveUnit,
                                        victim: enemy,
                                        damage: withLuckyStrike(band.max) + spinBite,
                                    }),
                                );
                                continue;
                            }
                            // Chain Lightning: the arc is a SHARE of the swing that triggered it, decaying by
                            // layer (7/8, then 6/8, ...) — not a swing of its own. getChainLightningTargets
                            // returns a flat list with no layer information, so the layer decay is not modelled
                            // here; the first-layer rate is used for every arc, which is exact for the common
                            // single-layer chain and over-reads a deeper one.
                            const chainLightningAbility = this.currentActiveUnit.getAbility("Chain Lightning");
                            const chainMultiplier = chainLightningAbility
                                ? (this.currentActiveUnit.calculateAbilityMultiplier(
                                      chainLightningAbility,
                                      abilityPower,
                                  ) *
                                      7) /
                                  8
                                : 0;
                            const chainCut = (1 - enemy.getMagicResist() / 100) * heavyArmorMultiplier(enemy);
                            addProjectedDamage(
                                enemy,
                                Math.floor(chainMultiplier * primaryHitMin * chainCut),
                                Math.floor(chainMultiplier * primaryHitMax * chainCut),
                            );
                        }

                        // The aggregate the player reads, and the kill spread derived from it: one kill count
                        // per struck unit, taken from that unit's FINAL damage.
                        let totalMinDmg = 0;
                        let totalMaxDmg = 0;
                        let totalMinKills = 0;
                        let totalMaxKills = 0;
                        for (const struck of projectedByUnit.values()) {
                            const projection: IAttackDamageProjection = projectKillBand(
                                struck.unit,
                                struck.min,
                                struck.max,
                            );
                            totalMinDmg += projection.min;
                            totalMaxDmg += projection.max;
                            totalMinKills += projection.killsMin;
                            totalMaxKills += projection.killsMax;
                        }

                        const dmgSpreadStr = formatCombatRange(totalMinDmg, totalMaxDmg);
                        const attackType = this.currentActiveUnit.getAttackType();
                        const rangeModifierIconPath = rangedDamageModifierIcon(
                            isRangeAttackContext,
                            attackType,
                            rangeDivisor,
                        );
                        // A whole arrow already means full damage, so it needs no redundant 1/1 label.
                        // Broken-arrow bands retain the fraction so 1/2, 1/4 and 1/8 stay distinguishable.
                        const dmgStr = rangedDamagePredictionText(isRangeAttackContext, rangeDivisor, dmgSpreadStr);
                        let killStr: string | undefined;
                        let killIconPath: string | undefined;

                        if (totalMaxKills > 0) {
                            killStr = formatCombatRange(totalMinKills, totalMaxKills);
                            killIconPath = images.combat_kills_skull_icon_v1;
                        }

                        // Ranged shot whose line of sight crosses the central mountain is blocked: aim at
                        // the mountain, not the enemy behind it. This applies to Through Shot too — the
                        // pierce travels THROUGH lined-up units, but a solid mountain on the trajectory
                        // before the target still stops it (the obstacle check below uses the
                        // attacker→target segment, isThroughShot=false, so a mountain BEHIND a reachable
                        // target doesn't trigger it).
                        let blockedByObstacle: IAttackObstacle | undefined;
                        let doubleShotObstacleIntersections: IAttackObstacle[] = [];
                        if (isRangeAttackContext) {
                            if (this.hasStandingShotBlockingObstacle()) {
                                // Test the SHOT'S ACTUAL trajectory — attacker -> the resolved visible
                                // edge the projectile flies to (arrowEndPos, same edge the arrow and the
                                // committed shot use) — NOT the target's geometric CENTER. A shot at a
                                // unit whose near edge threads the 2x2 corridor or clears a mountain has a
                                // center line that clips the mountain but an edge line that is clear; using
                                // the center here wrongly reported "Hit the mountain" and routed the click
                                // to the obstacle, so reachable units became unattackable.
                                blockedByObstacle = this.attackHandler.evaluateRangeAttack(
                                    this.unitsHolder.getAllUnits(),
                                    this.currentActiveUnit,
                                    this.currentActiveUnit.getPosition(),
                                    arrowEndPos!,
                                    false,
                                    this.sc_isSelection,
                                    this.currentActiveUnit.hasAbilityActive("Large Caliber") ||
                                        this.currentActiveUnit.hasAbilityActive("Area Throw"),
                                ).attackObstacle;
                                if (
                                    blockedByObstacle &&
                                    this.grid.hasScatteredMountains() &&
                                    (this.currentActiveUnit.getAbility("Double Shot") ??
                                        this.currentActiveUnit.getAbility("Crafted Double Shot"))
                                ) {
                                    doubleShotObstacleIntersections = this.attackHandler
                                        .getObstacleIntersections(this.currentActiveUnit.getPosition(), arrowEndPos!)
                                        .slice(0, 2);
                                    // With one stone the bonus projectile reaches the creature. With two,
                                    // the second stone consumes the second projectile and becomes the arrow
                                    // endpoint; both intersections are highlighted below.
                                    blockedByObstacle =
                                        doubleShotObstacleIntersections.length >= 2
                                            ? doubleShotObstacleIntersections[1]
                                            : undefined;
                                }
                            }
                        }

                        if (blockedByObstacle) {
                            this.hoverRangeAttackObstacle = blockedByObstacle;
                            // Arrow to the mountain (what actually takes the hit), plus a faint dashed
                            // continuation on to the intended unit so the whole projection still reads, and
                            // a red glow on the mountain as the real target (the unit behind takes no damage).
                            const blockedVisual = projectBattlefieldPoint(blockedByObstacle.position, gs);
                            const blockedSmokeLogical = isRangeAttackContext
                                ? this.resolveSmokeEntryPoint(arrowStartLogical, blockedByObstacle.position)
                                : undefined;
                            this.hoverManager.drawAttackArrow(
                                arrowStartPos,
                                blockedVisual,
                                tVis,
                                blockedSmokeLogical ? projectBattlefieldPoint(blockedSmokeLogical, gs) : undefined,
                            );
                            if (this.grid.hasScatteredMountains()) {
                                this.hoverManager.clearObstacleHighlight();
                                this.dungeonVisuals.highlightScatteredMountains(
                                    (doubleShotObstacleIntersections.length
                                        ? doubleShotObstacleIntersections
                                        : [blockedByObstacle]
                                    ).map((obstacle) => obstacle.position),
                                );
                            } else {
                                this.hoverManager.highlightObstacle(
                                    blockedByObstacle.position,
                                    this.sc_sceneSettings.getGridSettings().getCellSize(),
                                );
                            }
                            this.sc_hoverInfoArr = [
                                doubleShotObstacleIntersections.length >= 2 ? "Hit 2 tombstones" : "Hit the object",
                            ];
                            this.sc_hoverTextUpdateNeeded = true;
                            isAttacking = true;
                        } else {
                            // Moving onto a reachable (unblocked) target: drop any mountain-hit glow.
                            this.hoverRangeAttackObstacle = undefined;
                            if (doubleShotObstacleIntersections.length > 0) {
                                this.hoverManager.clearObstacleHighlight();
                                this.dungeonVisuals.highlightScatteredMountains(
                                    doubleShotObstacleIntersections.map((obstacle) => obstacle.position),
                                );
                            } else {
                                this.hoverManager.clearObstacleHighlight();
                                this.dungeonVisuals.clearScatteredMountainHighlight();
                            }
                            this.hoverManager.drawDamagePrediction(
                                dmgStr,
                                killStr,
                                damageCenterVis,
                                !damageUnit.isSmallSize(), // isLargeTarget
                                killIconPath,
                                rangeModifierIconPath,
                                damageUnit.getId(),
                            );
                            const smokeLogical = isRangeAttackContext
                                ? this.resolveSmokeEntryPoint(arrowStartLogical, finalArrowEndPos)
                                : undefined;
                            this.hoverManager.drawAttackArrow(
                                arrowStartPos,
                                tVis,
                                undefined,
                                smokeLogical ? projectBattlefieldPoint(smokeLogical, gs) : undefined,
                                isRangeAttackContext ? "arrow" : "melee",
                                true,
                                !isRangeAttackContext && attackFromPos
                                    ? meleeSwordFacingAngle(attackFromPos, targetUnit.getPosition())
                                    : undefined,
                            );
                            isAttacking = true;

                            // Red-highlight every secondary target the strike will hit — including a
                            // "Hidden" one. Pierce/breath/spin/chain damage (Skewer Strike, Fire Breath,
                            // Lightning Spin, Chain Lightning) lands on a unit even while it carries
                            // Hidden: Hidden only blocks being the PRIMARY hovered target, not incidental
                            // AOE/pierce damage (the engine's nextStandingTargets / process*Ability apply
                            // no Hidden filter). The damage-prediction number above already counts these,
                            // so a Hidden secondary (e.g. a White Tiger behind the target of a Black
                            // Dragon or Pikeman) must be outlined too — otherwise it silently takes damage
                            // with no highlight.
                            for (const enemy of [
                                ...secondaryHits.map((secondaryHit) => secondaryHit.unit),
                                ...rangeHighlightExtras,
                            ]) {
                                // The primary is outlined by the block above; Lightning Spin also lists it.
                                if (enemy.getId() !== targetUnit.getId()) {
                                    this.hoverManager.addTargetHighlight(enemy);
                                }
                            }
                        }
                    }
                }
            }

            if (!isAttacking) {
                this.hoverManager.clearAttackVisuals();
            }

            if (!isAttacking) {
                this.hoverManager.hoverAttackFromCell = undefined;
                if (this.hoverManager.isCellReachableForActiveUnit(cell)) {
                    this.hoverManager.updateActiveMoveSilhouetteForCell(cell);
                    this.emitLocalMoveIntent(cell);
                } else {
                    this.hoverManager.clearHoverSilhouette();
                    this.emitLocalMoveIntent(undefined);
                }
            } else {
                this.emitLocalMoveIntent(undefined);
            }

            // A paralyzed active unit can't move, so a move hover/click is silently ignored — surface
            // the reason in the cursor popover the whole time the player aims at anything that isn't
            // an attack (striking in place is still allowed, so an attack hover keeps its preview).
            // "Hidden" keeps priority: hovering a concealed enemy stays explained as Hidden.
            const showParalyzedHint =
                !isAttacking && !this.currentActiveUnit.canMove() && this.sc_hoverInfoArr[0] !== "Hidden";
            if (showParalyzedHint && this.sc_hoverInfoArr[0] !== "Paralyzed — can't move") {
                this.sc_hoverInfoArr = ["Paralyzed — can't move"];
                this.sc_hoverTextUpdateNeeded = true;
            } else if (!showParalyzedHint && this.sc_hoverInfoArr[0] === "Paralyzed — can't move") {
                this.sc_hoverInfoArr = [];
                this.sc_hoverTextUpdateNeeded = true;
            }

            return;
        }
        // CASE 1: Active selection from OVERLAY (New Unit)
        if (this.hasActiveSelection && this.sc_selectedUnitProperties && this.selectionFromOverlay) {
            this.hoverManager.hoveredUnitHighlight = undefined;
            this.hoverManager.updateHoverPlacementCell(this.getPlacementPreviewPoint());
            return;
        }
        // CASE 2: Active selection from BOARD (Moving existing unit)
        if (
            this.hasActiveSelection &&
            this.sc_selectedUnitProperties &&
            !this.selectionFromOverlay &&
            this.draggingUnitId
        ) {
            this.hoverManager.calculateActiveSelectionHighlight();
            this.hoverManager.updateHoverPlacementCell(this.getPlacementPreviewPoint());
            return;
        }
        // CASE 3: No active selection → just passive hover highlight (mouse over unit)
        this.hoverManager.update(1 / 60);
        this.hoverManager.calculatePassiveHover();

        // Unified Visual Target: Hovered > Shifted > Selected
        let targetUnit: RenderableUnit | undefined;
        if (this.hoverManager.hoveredUnitId) {
            targetUnit = this.unitsHolder.getAllUnits().get(this.hoverManager.hoveredUnitId) as RenderableUnit;
        } else if (this.currentShiftedUnit) {
            targetUnit = this.currentShiftedUnit;
        } else if (this.selectedBoardUnit) {
            targetUnit = this.selectedBoardUnit;
        }

        // --- 1. Attack Range Visualization ---
        // The hovered unit's AURA is owned by the generic hover block near the top of hover(), which
        // sets sc_hoveredAuraRanges for melee AND ranged units. It must NOT be recomputed here: this
        // branch only ran for ranged units, so its else-paths wiped sc_hoveredAuraRanges for a hovered
        // MELEE aura unit — which is why melee aura units showed no aura ring when hovered during
        // placement. Only the (range-only) shot-range preview belongs here.
        // The generic block above resolves the unit directly under the rendered silhouette, including
        // mounted/tall bodies and attack-targeting hovers. PassiveHover intentionally has no hoveredUnitId
        // while an active selection is armed; do not let this legacy fallback erase the range we already
        // found (the red target highlight and damage prediction would otherwise show without its frame).
        if (!this.sc_hoveredShotRange && targetUnit && targetUnit.getAttackType() === AttackVals.RANGE) {
            if (targetUnit.hasAbilityActive("Sniper")) {
                targetUnit.setRangeShotDistance(
                    Number(
                        (
                            GridMath.getDistanceToFurthestCorner(
                                targetUnit.getPosition(),
                                this.sc_sceneSettings.getGridSettings(),
                            ) /
                                this.sc_sceneSettings.getGridSettings().getStep() -
                            0.45
                        ).toFixed(2),
                    ),
                );
            }
            const shotDist = targetUnit.getRangeShotDistance();
            this.sc_hoveredShotRange =
                shotDist > 0
                    ? {
                          ...fullDamageShotRangeForFootprint(
                              targetUnit.getPosition(),
                              shotDist,
                              targetUnit.getFootprintWidth(),
                              targetUnit.getFootprintHeight(),
                          ),
                          ...(this.hoverManager.hoveredUnitId
                              ? { color: this.shotRangeColorForHoveredUnit(targetUnit) }
                              : {}),
                      }
                    : undefined;
        } else if (!this.sc_hoveredShotRange) {
            this.sc_hoveredShotRange = undefined;
        }

        // --- 2. Movement Visualization (Placement Phase) ---
        if (!fightProps.hasFightStarted()) {
            if (targetUnit && targetUnit.canMove()) {
                // The anchor getMovePath expects, not the cell the body's centre lands in.
                const cell = targetUnit.getBaseCell();
                if (cell) {
                    const key = {
                        unitId: targetUnit.getId(),
                        x: cell.x,
                        y: cell.y,
                        steps: targetUnit.getSteps(),
                        layoutVersion: this.layoutVersion,
                    };

                    // Optimization: If nothing changed for this unit's path, reuse last calculation
                    if (
                        !this.sc_lastCalcRef ||
                        this.sc_lastCalcRef.unitId !== key.unitId ||
                        this.sc_lastCalcRef.x !== key.x ||
                        this.sc_lastCalcRef.y !== key.y ||
                        this.sc_lastCalcRef.steps !== key.steps ||
                        this.sc_lastCalcRef.layoutVersion !== key.layoutVersion
                    ) {
                        const tempMatrix = this.gridMatrix.map((row) => [...row]);
                        const gsVal = this.sc_sceneSettings.getGridSettings().getGridSize();
                        for (const occupiedCell of targetUnit.getCells()) {
                            const { x: cx, y: cy } = occupiedCell;
                            if (cx >= 0 && cx < gsVal && cy >= 0 && cy < gsVal) {
                                tempMatrix[cx][cy] = 0; // Treat self footprint as free for pathfinding starts
                            }
                        }

                        const movePath = this.pathHelper.getMovePath(
                            cell,
                            tempMatrix,
                            targetUnit.getSteps(),
                            this.grid.getAggrMatrixByTeam(targetUnit.getOppositeTeam()),
                            targetUnit.canFly(),
                            targetUnit.isSmallSize(),
                            targetUnit.canTraverseLava(),
                            targetUnit.hasAbilityActive("In Its Own World"),
                            targetUnit.getFootprintWidth(),
                            targetUnit.getFootprintHeight(),
                        );
                        this.sc_placementMoveRange = movePath.cells;
                        this.sc_lastCalcRef = key;
                    }
                } else {
                    this.sc_placementMoveRange = undefined;
                    this.sc_lastCalcRef = undefined;
                }
            } else {
                this.sc_placementMoveRange = undefined;
                this.sc_lastCalcRef = undefined;
            }
        }
    }
    public override MouseMove(p: HoCMath.XY, leftDrag: boolean): void {
        this.pointerVisualWorld = p;
        p = this.getLogicalBattlefieldPoint(p);
        if (this.placementDragPointerOrigin && !this.placementDragPointerMoved) {
            const dx = p.x - this.placementDragPointerOrigin.x;
            const dy = p.y - this.placementDragPointerOrigin.y;
            this.placementDragPointerMoved = dx * dx + dy * dy >= 1;
        }
        if (this.splitDragActive) {
            this.updatePlacementSplitFromCursor(p);
            return;
        }
        // Shift pressed AFTER a stack was click-picked (it's in hand): start the split from it now. This
        // path commits on the next click, since the in-hand drag has no held button to release.
        if (
            this.shiftHeld &&
            this.placementSplitEnabled() &&
            !FightStateManager.getInstance().getFightProperties().hasFightStarted()
        ) {
            const inHand = this.inHandSplittableUnit();
            if (inHand) {
                this.sc_mouseWorld = p;
                this.beginPlacementSplit(inHand, true);
                return;
            }
        }
        super.MouseMove(p, leftDrag);
        this.updatePlacementBenchToggleHover(p);
        this.updateSplitHint(p);
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.hasFightStarted()) {
            this.hoverManager.hoverPlacementCell = undefined;
            this.hoverManager.hoverPlacementCellTeam = undefined;
        }
        // Mirror "cursor is over an attackable enemy" into the scene's hover-info surface so the
        // HoMM-style attack cursor (themed melee/ranged/magic PNG) only renders while actively aiming
        // at a valid target. Flag a hover-text refresh so UpdateHoverInfo re-emits this frame.
        const wasHoveringTarget = this.sc_isHoveringAttackTarget;
        const previousMeleeCursorDirection = this.sc_meleeCursorDirection;
        // Mountains are attackable too, and they are not units, so hoverAttackTargetUnit never covers
        // them: aiming at a destructible centre showed the plain cursor even though the very next click
        // would chip it. hoverRangeAttackObstacle is the blocked-shot case -- the mountain intercepting a
        // shot aimed at someone behind it -- which is just as much an attack as aiming at the rock itself.
        const pointerMeleeAttack = this.resolveUnitMeleeAttack(p);
        if (pointerMeleeAttack) {
            // Face the blade from where the body will stand, not from its anchor cell: hover() draws its
            // arrow from that same footprint centre, and for a multi-cell unit the two are half a cell
            // apart — enough to flip the cursor the wrong way when the pointer sits between them.
            const attackFromPosition = this.footprintCenterForAnchor(
                pointerMeleeAttack.unit,
                pointerMeleeAttack.attackFrom,
            );
            this.sc_meleeCursorDirection = resolveMeleeCursorDirection(attackFromPosition.x, p.x);
        } else {
            this.sc_meleeCursorDirection = undefined;
        }
        this.sc_isHoveringAttackTarget =
            !!this.hoverManager.hoverAttackTargetUnit ||
            !!pointerMeleeAttack ||
            !!this.hoverRangeAttackObstacle ||
            this.isHoveringAttackableObstacle(p);
        if (
            wasHoveringTarget !== this.sc_isHoveringAttackTarget ||
            previousMeleeCursorDirection !== this.sc_meleeCursorDirection
        ) {
            this.sc_hoverTextUpdateNeeded = true;
        }
    }
    public override Deselect(_onlyWhenNotStarted = false, _refreshStats = true): void {
        // ESC routes here (HandleEscapeKey -> Deselect); also close the spellbook and drop its
        // overlays. closeSpellBook() is a no-op when the book isn't open.
        this.closeSpellBook();
        super.Deselect(_onlyWhenNotStarted, _refreshStats);
        if (this.selectedBoardUnit) {
            this.selectedBoardUnit.setBoardSelected(false);
            this.selectedBoardUnit = undefined;
        }
        this.currentShiftedUnit = undefined;
        this.sc_selectedFactionType = FactionVals.NO_FACTION as FactionType;
        this.sc_factionNameUpdateNeeded = true;
        this.hasActiveSelection = false;
        this.selectionFromOverlay = false;
        this.draggingUnitId = undefined;
        this.draggingUnitTeam = undefined;
        this.placementDragPointerOrigin = undefined;
        this.placementDragPointerMoved = false;
        this.hoverManager.hoverPlacementCell = undefined;
        this.hoverManager.hoverPlacementCellTeam = undefined;
        this.hoverManager.hoverSelectedCells = undefined;
        this.hoverManager.hoverSelectedCellsSwitchToRed = false;
        this.hoverManager.hoveredUnitHighlight = undefined;
        this.hoverManager.resetBoardHoverState();
        this.hoverManager.resetHover(false);
        this.hoverManager.clear();
        this.sc_hoveredAuraRanges = undefined;
        this.sc_hoveredShotRange = undefined;
        this.cancelPlacementSplit();
    }
    public override MouseUp(): void {
        // Shift+press splits commit on release; in-hand (click-committed) splits wait for the next click.
        if (this.splitDragActive && !this.splitCommitOnClick) {
            this.finishPlacementSplit();
            return;
        }
        super.MouseUp();
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // Placement split-drag. Shift-press a placed stack (>=2 models) to grab it, drag onto an empty
    // allowed cell (it becomes the destination, default peel = 1 → source keeps N-1), then keep
    // dragging further out to grow the peel (drag back to shrink); release to commit. The peeled-off
    // models spawn as a new stack on the destination cell and the source shrinks by that many.
    // Sandbox-only for now — RankedPlayScene disables it (its split position is server-authoritative).
    // ─────────────────────────────────────────────────────────────────────────────
    protected placementSplitEnabled(): boolean {
        return true;
    }
    private canSplitPlacedUnit(unit: Unit): boolean {
        // Placed on the board (occupies its own cells), controllable team, >=2 models, and under the team's
        // placement cap (so a new stack is actually allowed).
        const isPlaced = unit.getCells().some((c) => this.grid.getOccupantUnitId(c) === unit.getId());
        return (
            isPlaced &&
            this.canSelectUnitForPlacement(unit) &&
            unit.getAmountAlive() >= 2 &&
            this.canSplitUnitWithCommonRules(unit)
        );
    }
    private inHandSplittableUnit(): Unit | undefined {
        // A stack picked up by a normal click-to-place drag (draggingUnitId), if it can still be split.
        const unit = this.draggingUnitId ? this.unitsHolder.getAllUnits().get(this.draggingUnitId) : undefined;
        return unit && this.canSplitPlacedUnit(unit) ? unit : undefined;
    }
    private tryBeginPlacementSplit(p: HoCMath.XY): boolean {
        if (!this.placementSplitEnabled()) return false;
        if (FightStateManager.getInstance().getFightProperties().hasFightStarted()) return false;
        // Prefer the stack under the cursor; else fall back to one already in hand (clicked first, then
        // shift-pressed after the ghost was dragged off the unit). A shift+press commits on release.
        let unit = this.getUnitAtPosition(p);
        if (!unit || !this.canSplitPlacedUnit(unit)) unit = this.inHandSplittableUnit();
        if (!unit) return false;
        this.beginPlacementSplit(unit, false);
        return true;
    }
    private beginPlacementSplit(unit: Unit, commitOnClick: boolean): void {
        this.clearSplitHint();
        this.splitDragActive = true;
        this.splitCommitOnClick = commitOnClick;
        this.splitDragSourceId = unit.getId();
        this.splitDragSourceCells = unit.getCells().map((c) => ({ x: c.x, y: c.y }));
        this.splitDragTargetCells = undefined;
        this.splitDragAmount = 1;

        // Show the source as selected and clear the normal click-to-place drag (and its ghost) so they never mix.
        if (this.selectedBoardUnit && this.selectedBoardUnit.getId() !== unit.getId()) {
            this.selectedBoardUnit.setBoardSelected(false);
        }
        if (unit instanceof RenderableUnit) {
            this.selectedBoardUnit = unit;
            unit.setBoardSelected(true);
        }
        this.draggingUnitId = undefined;
        this.draggingUnitTeam = undefined;
        this.hasActiveSelection = false;
        this.hoverManager.clearHoverSilhouette();
        this.hoverManager.hoverSelectedCells = undefined;
        this.hoverManager.hoverSelectedCellsSwitchToRed = false;

        this.updatePlacementSplitFromCursor(this.sc_mouseWorld ?? unit.getPosition());
    }
    /**
     * Where a split-off stack would land with the cursor on `cell`.
     *
     * The peeled stack is the same creature, so it has the SOURCE's footprint — a 2x1 splits into a 2x1,
     * never into a square. As with the drag ghost, the cursor may sit on any cell of the body: the blocks
     * covering it are tried in the same order (cursor cell as the minimum corner first, then the block
     * sliding down and left over it) and the first one that is empty and inside the zone wins. Anchors
     * whose body would leave the board are dropped before any cell is hashed.
     */
    private placementSplitFootprints(unit: Unit, cell: HoCMath.XY): HoCMath.XY[][] {
        const gs = this.sc_sceneSettings.getGridSettings();
        const width = unit.getFootprintWidth();
        const height = unit.getFootprintHeight();
        const footprints: HoCMath.XY[][] = [];
        for (let cursorDx = 0; cursorDx < width; cursorDx++) {
            for (let cursorDy = 0; cursorDy < height; cursorDy++) {
                const anchor = { x: cell.x - cursorDx + width - 1, y: cell.y - cursorDy + height - 1 };
                if (!GridMath.isFootprintWithinGrid(gs, anchor, width, height)) continue;
                footprints.push(unit.getFootprintCellsForAnchor(anchor));
            }
        }
        return footprints;
    }
    protected isValidEmptySplitTarget(cells: HoCMath.XY[], team: TeamType): boolean {
        const allowed = this.placementManager.getAllowedPlacementCellHashesForTeam(team);
        if (!allowed) return false;
        if (cells.some((c) => !allowed.has((c.x << 4) | c.y))) return false;
        return this.grid.areAllCellsEmpty(cells);
    }
    private updatePlacementSplitFromCursor(p: HoCMath.XY): void {
        this.sc_mouseWorld = p;
        const source = this.splitDragSourceId ? this.unitsHolder.getAllUnits().get(this.splitDragSourceId) : undefined;
        if (!source) {
            this.cancelPlacementSplit();
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        // Lock the destination on the FIRST empty cell the drag reaches (default peel 1 → N-1/1). It stays put
        // afterwards, so moving the mouse sweeps the ratio instead of re-selecting the cell under the cursor
        // (the placement zone is almost all empty, so re-selecting would pin the peel at 1 forever).
        if (!this.splitDragTargetCells) {
            this.splitDragTargetCells = this.placementSplitFootprints(source, GridMath.getCellForPosition(gs, p)).find(
                (footprint) => this.isValidEmptySplitTarget(footprint, source.getTeam()),
            );
        }
        // Peel scales with how far the cursor is pulled from the locked cell: on it = 1 (N-1/1), ~5 cells out =
        // all-but-one (1/N-1); pull back toward the cell to peel fewer.
        const maxPeel = Math.max(1, source.getAmountAlive() - 1);
        const center = this.splitDragTargetCells
            ? GridMath.getPositionForCells(gs, this.splitDragTargetCells)
            : undefined;
        const cellSize = gs.getCellSize();
        if (center && cellSize > 0) {
            // Directional sizing: drag UP/RIGHT to peel MORE, DOWN/LEFT to peel FEWER. Radial distance made
            // opposite directions do the same thing (they "overlapped"), so project the pull from the locked
            // cell onto the bottom-left→top-right diagonal (world Y is up: mouse-up increases y).
            const along = (p.x - center.x + (p.y - center.y)) / Math.SQRT2;
            const t = Math.min(1, Math.max(0, along) / (cellSize * 4));
            this.splitDragAmount = Math.max(1, Math.min(maxPeel, Math.round(1 + t * (maxPeel - 1))));
        } else {
            this.splitDragAmount = 1;
        }
        this.updateSplitPreviewVisual(source);
    }
    private updateSplitPreviewVisual(source: Unit): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const alive = source.getAmountAlive();
        const peel = this.splitDragAmount;
        const units = [...this.unitsHolder.getAllUnits().values()];
        const projection = projectPlacementSplitStackPowers(
            units
                .filter((unit) => GridMath.isPositionWithinGrid(gs, unit.getPosition()))
                .map((unit) => ({
                    id: unit.getId(),
                    experience: unit.getExp(),
                    amount: unit.getAmountAlive(),
                })),
            source.getId(),
            peel,
        );
        // Splitting the strongest stack changes the global denominator, so every known allied stack may gain
        // projected pips. Never decorate the opponent's ranked roster: its amounts are deliberately hidden.
        // These overrides are visual only; live spell/ability gates keep reading real power.
        for (const unit of units) {
            if (!(unit instanceof RenderableUnit)) continue;
            if (unit.getTeam() !== source.getTeam()) {
                unit.clearProjectedStackPower();
                continue;
            }
            const power = projection?.unitPowers.get(unit.getId());
            if (power === undefined) unit.clearProjectedStackPower();
            else unit.setProjectedStackPower(power);
        }
        // Emphasise the SOURCE's real team flag, showing its projected remaining count (N-k).
        if (source instanceof RenderableUnit) {
            source.setBadgeEmphasis(1.6, Math.max(0, alive - peel));
        }
        // Render the split-off as an actual preview unit on the destination cell, carrying its own real
        // team flag (the split count k), also enlarged. It stays purely visual until the drag commits.
        const center = this.splitDragTargetCells
            ? GridMath.getPositionForCells(gs, this.splitDragTargetCells)
            : undefined;
        if (center) {
            if (!this.placementSplitPreviewUnit) {
                this.placementSplitPreviewUnit = this.createSplitRenderableUnit(source, peel);
            }
            const preview = this.placementSplitPreviewUnit;
            if (preview) {
                preview.setAmountAlive(peel);
                const power = projection?.splitPower;
                if (power === undefined) preview.clearProjectedStackPower();
                else preview.setProjectedStackPower(power);
                preview.setBadgeEmphasis(1.6);
                preview.setPosition(center.x, center.y);
                preview.ensureVisual(this.drawer.getUnitsContainer(), gs);
            }
        } else if (this.placementSplitPreviewUnit) {
            this.placementSplitPreviewUnit.destroyVisuals();
            this.placementSplitPreviewUnit = undefined;
        }
    }
    private finishPlacementSplit(): void {
        const source = this.splitDragSourceId ? this.unitsHolder.getAllUnits().get(this.splitDragSourceId) : undefined;
        const target = this.splitDragTargetCells;
        const amount = this.splitDragAmount;
        if (source && target && amount >= 1 && amount < source.getAmountAlive()) {
            this.commitPlacementSplit(source, amount, target);
        }
        this.cancelPlacementSplit();
    }
    protected commitPlacementSplit(source: Unit, amount: number, targetCells: HoCMath.XY[]): boolean {
        const alive = source.getAmountAlive();
        if (amount < 1 || amount >= alive) return false;
        if (!this.canSplitUnitWithCommonRules(source)) return false;
        if (!this.isValidEmptySplitTarget(targetCells, source.getTeam())) return false;

        // Reuse the live preview unit as the real split-off so its already-rendered sprite/flag carry over.
        const newUnit = this.placementSplitPreviewUnit ?? this.createSplitRenderableUnit(source, amount);
        if (!newUnit) return false;
        const wasPreview = newUnit === this.placementSplitPreviewUnit;
        this.placementSplitPreviewUnit = undefined; // consumed — don't let cancelPlacementSplit destroy it
        newUnit.setAmountAlive(amount);
        newUnit.clearBadgeEmphasis();
        this.unitsHolder.addUnit(newUnit);

        const placementResult = this.createActionEngine().apply({
            type: "place_unit",
            unitId: newUnit.getId(),
            team: newUnit.getTeam(),
            unitName: newUnit.getName(),
            cells: targetCells,
        });
        if (!placementResult.completed) {
            // Placement rejected — undo the peel entirely (source is untouched until here).
            this.unitsHolder.deleteUnitById(newUnit.getId());
            if (wasPreview) newUnit.destroyVisuals();
            return false;
        }

        source.setAmountAlive(alive - amount);
        if (source instanceof RenderableUnit) source.clearBadgeEmphasis();
        this.layoutVersion++;
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        const gs = this.sc_sceneSettings.getGridSettings();
        const placeEvent = placementResult.events.find((event) => event.type === "unit_placed");
        const placePos =
            placeEvent?.type === "unit_placed" ? placeEvent.position : GridMath.getPositionForCells(gs, targetCells);
        if (placePos) newUnit.setPosition(placePos.x, placePos.y);
        const scale = newUnit.ensureVisual(this.drawer.getUnitsContainer(), gs);
        if (scale && !wasPreview) {
            newUnit.startSpawnAnimation(scale);
        }
        this.unitsHolder.refreshStackPowerForAllUnits();
        this.refreshSynergyNumbers(source.getTeam());
        this.refreshUnits();
        this.flushPendingReplayRecords();
        return true;
    }
    private cancelPlacementSplit(): void {
        const source = this.splitDragSourceId ? this.unitsHolder.getAllUnits().get(this.splitDragSourceId) : undefined;
        if (source instanceof RenderableUnit) source.clearBadgeEmphasis();
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            if (unit instanceof RenderableUnit) unit.clearProjectedStackPower();
        }
        if (this.placementSplitPreviewUnit) {
            this.placementSplitPreviewUnit.clearProjectedStackPower();
            this.placementSplitPreviewUnit.destroyVisuals();
            this.placementSplitPreviewUnit = undefined;
        }
        this.splitDragActive = false;
        this.splitCommitOnClick = false;
        this.splitDragSourceId = undefined;
        this.splitDragSourceCells = [];
        this.splitDragTargetCells = undefined;
        this.splitDragAmount = 1;
    }
    private ensureSplitText(existing: Text | undefined, fontSize: number, fill: number): Text {
        if (existing) return existing;
        const t = new Text({
            text: "",
            style: new TextStyle({
                fill,
                fontSize,
                fontWeight: "900",
                stroke: { color: 0x000000, width: 5, join: "round" },
            }),
        });
        t.anchor.set(0.5);
        t.scale.y = -1; // world Y is inverted (see RenderableUnit.ensureBadge)
        this.attachToWorldRoot(t, 2650);
        return t;
    }
    private drawPlacementSplitOverlay(): void {
        const g = this.placementGraphics;
        if (!g || !this.splitDragActive) return;
        const gs = this.sc_sceneSettings.getGridSettings();
        const outline = (cells: HoCMath.XY[], color: number, fillAlpha: number): void => {
            for (const c of cells) {
                g.poly(tunedCellFillPolygon(c, gs, 1 / gs.getCellSize()))
                    .stroke({ width: 2.5, color, alpha: 0.95 })
                    .fill({ color, alpha: fillAlpha });
            }
        };
        // Green = where it peels FROM; gold = where the new stack lands. The stacks' own enlarged team
        // flags (source N-k, preview k) carry the amounts — see updateSplitPreviewVisual.
        outline(this.splitDragSourceCells, 0x39d353, 0.14);
        if (this.splitDragTargetCells) outline(this.splitDragTargetCells, 0xffcc33, 0.16);
    }
    private updateSplitHint(p: HoCMath.XY): void {
        if (!this.placementSplitEnabled() || FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
            this.clearSplitHint();
            return;
        }
        const unit = this.getUnitAtPosition(p);
        if (!unit || !this.canSplitPlacedUnit(unit)) {
            this.clearSplitHint();
            return;
        }
        // Roll once per newly-hovered splittable unit (~1/3 chance) so the hint teaches without nagging.
        if (unit.getId() !== this.splitHintUnitId) {
            this.splitHintUnitId = unit.getId();
            this.splitHintRoll = Math.random() < 0.33;
        }
        if (!this.splitHintRoll) {
            if (this.splitHintText) this.splitHintText.visible = false;
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const pos = unit.getPosition();
        this.splitHintText = this.ensureSplitText(this.splitHintText, 20, 0xffe08a);
        this.splitHintText.text = "⇧ Shift + drag to split";
        // Clear of the sprite's head: 0.95 cells above a one-cell-tall body, 1.35 above a two-cell one —
        // the same two offsets as before, now derived from the height rather than from `size`.
        const hintOffsetCells = 0.95 + (unit.getFootprintHeight() - 1) * 0.4;
        this.splitHintText.position.set(pos.x, pos.y + gs.getCellSize() * hintOffsetCells);
        this.splitHintText.visible = true;
    }
    private clearSplitHint(): void {
        this.splitHintUnitId = undefined;
        this.splitHintRoll = false;
        if (this.splitHintText) this.splitHintText.visible = false;
    }
    /**
     * "⇧ Shift to rotate" under the armed Fire Wall footprint — the same on-board cue the split gesture gets,
     * because Shift-to-rotate is no more discoverable than Shift-to-drag.
     *
     * Arming already writes a line to the scene log, but that log is a busy side panel during a fight and the
     * one moment this matters is while the player is looking at the board, aiming.
     *
     * Unlike the split hint this shows EVERY time rather than rolling a chance: hovering stacks during
     * placement happens constantly, so that one nags if it always fires, whereas this appears only while a
     * rotatable spell is actually armed — a deliberate, short-lived moment where missing the cue means laying
     * the wall the wrong way across the board.
     */
    private updateFireWallRotateHint(): void {
        const spell = this.currentActiveSpell;
        if (!spell || !this.isRotatableAreaSpell(spell)) {
            this.clearFireWallRotateHint();
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const anchor = GridMath.getCellForPosition(gs, this.sc_mouseWorld);
        if (!anchor) {
            this.clearFireWallRotateHint();
            return;
        }
        const pos = GridMath.getPositionForCell(anchor, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        if (!pos) {
            this.clearFireWallRotateHint();
            return;
        }
        this.fireWallRotateHintText = this.ensureSplitText(this.fireWallRotateHintText, 20, 0xffe08a);
        this.fireWallRotateHintText.text = "⇧ Shift to rotate";
        // Below the footprint, clear of the 3-cell line itself whichever way it currently lies.
        this.fireWallRotateHintText.position.set(pos.x, pos.y + gs.getCellSize() * 1.35);
        this.fireWallRotateHintText.visible = true;
    }
    private clearFireWallRotateHint(): void {
        if (this.fireWallRotateHintText) this.fireWallRotateHintText.visible = false;
    }
    protected updateUnitsOverlayVisibility(): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const started = fightProps.hasFightStarted();
        if (this.unitsOverlay?.container) {
            this.unitsOverlay.container.visible = !started && !this.sc_gameActionTransport;
        }
        if (started) {
            this.unitsOverlay.clearSelection(true);
            this.hasActiveSelection = false;
            this.selectionFromOverlay = false;
            this.sc_selectedUnitProperties = undefined;
            this.hoverManager.clearHoverSilhouette();
            this.hoverManager.hoverSelectedCells = undefined;
            this.hoverManager.hoverSelectedCellsSwitchToRed = false;
        }
    }
    public override startScene() {
        const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
        const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
        if (!lowerLeftPlacement || !upperRightPlacement) {
            return false;
        }

        // Add keyboard listeners for Alt key
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);

        if (
            this.unitsHolder.getAllAlliesPlaced(
                TeamVals.LOWER,
                lowerLeftPlacement,
                upperRightPlacement,
                this.getPlacement(TeamVals.LOWER, 1),
                this.getPlacement(TeamVals.UPPER, 1),
            ).length &&
            this.unitsHolder.getAllAlliesPlaced(
                TeamVals.UPPER,
                lowerLeftPlacement,
                upperRightPlacement,
                this.getPlacement(TeamVals.LOWER, 1),
                this.getPlacement(TeamVals.UPPER, 1),
            ).length
        ) {
            this.sc_buttonGroupUpdated = true;
            // Snapshot the exact roster + positions BEFORE the supply bump, so "Rematch"
            // can recreate the identical fight (supply is re-applied on the next startScene).
            this.lastFightSnapshot = this.captureFightSnapshot();
            this.hasInitializedLap = false;
            this.sandboxGraceTurnUsed = false;
            const action: GameAction = { type: "start_fight" };
            const unitSnapshot = this.snapshotRenderableUnits();
            const startResult = this.createActionEngine().apply(action);
            if (!startResult.completed) {
                this.sc_sceneLog.updateLog(startResult.message ?? "Cannot start fight");
                return false;
            }
            this.applyTurnEngineEvents(startResult.events, unitSnapshot);

            // Reset the previous fight's accumulated stats. This matters on Rematch, where
            // the scene + attack handler are reused (New Battle gets fresh ones via LoadGame).
            // The holder is exposed as the shared IStatisticHolder interface, so cast to the
            // concrete client type that has clear().
            (this.attackHandler.getDamageStatisticHolder() as DamageStatisticHolder).clear();
            this.sc_sceneLog.clear();
            this.sc_damageStatsUpdateNeeded = true;

            // Snapshot the starting roster so we can chart casualties over the fight.
            this.fightStatsTracker.start(this.unitsHolder.getAllUnits().values());
            this.refreshVisibleStateIfNeeded();
            this.updateLiveFightStats();

            return super.startScene();
        }
        return false;
    }
    public override Destroy(): void {
        // DungeonVisuals owns stage/world-root children that sit outside PixiDrawer's containers.
        // Dispose them before replacing the scene so a New Battle cannot inherit the prior board's
        // narrowing holes, terrain, or screen-space floor.
        this.dungeonVisuals?.destroy();
        super.Destroy();
        // Floating damage numbers are parented to the shared worldRoot; destroy them so
        // they don't linger after the scene is replaced (e.g. on "New Battle").
        this.combatVisuals?.clear();
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
    }
    private handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Shift") this.shiftHeld = true;
        if (e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight") {
            const fightProps = FightStateManager.getInstance().getFightProperties();
            if (!fightProps.hasFightStarted()) {
                this.unitsOverlay.setShowAllAmounts(true);
            }
        }
    };
    private handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === "Shift") this.shiftHeld = false;
        if (e.key === "Alt") {
            this.unitsOverlay.setShowAllAmounts(false);
        }
    };
    // --- Animation State ---
    private ensureGameplayGraphics(): void {
        if (!this.gameplayGraphics) this.gameplayGraphics = new Graphics();
        if (!this.movementGraphics) this.movementGraphics = new Graphics();
        if (!this.shotRangeCornerContainer) this.shotRangeCornerContainer = new Container();
        // Reachable-cell fills belong to the floor. Tombstones start at z=50, so their overhanging tops
        // naturally cover the neighbouring-cell sheet instead of being cut by its bright frame.
        this.attachToWorldRoot(this.movementGraphics, 49.5);
        // Range rings, spell footprints and targeting previews still need to remain visible over terrain.
        this.attachToWorldRoot(this.gameplayGraphics, 55);
        // Authored corner bitmaps sit just above their continuous vector perimeter.
        this.attachToWorldRoot(this.shotRangeCornerContainer, 55.1);
    }
    private clearShotRangeCornerSprites(): void {
        for (const child of this.shotRangeCornerContainer?.removeChildren() ?? []) child.destroy();
    }
    private hasAnySceneUnits(): boolean {
        return this.unitsHolder.getAllUnits().size > 0;
    }
    private recoverEmptyStartedFightState(): void {
        FightStateManager.getInstance().reset();
        const fightProps = FightStateManager.getInstance().getFightProperties();
        fightProps.setDefaultPlacementPerTeam(TeamVals.LOWER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        fightProps.setDefaultPlacementPerTeam(TeamVals.UPPER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);

        this.currentActiveUnit = undefined;
        this.currentActiveSpell = undefined;
        this.cleanActivePaths();
        this.hoverManager.clear();
        this.sc_moveBlocked = false;

        if (this.sc_visibleState) {
            this.sc_visibleState.hasFinished = false;
            this.sc_visibleState.teamWin = undefined;
            this.sc_visibleState.fightStats = undefined;
            this.sc_visibleState.teamTypeTurn = undefined;
            this.sc_visibleState.lapNumber = 0;
            this.sc_visibleState.upNext = [];
            this.sc_visibleStateUpdateNeeded = true;
        }

        this.sc_onHasStarted.emit(false);
    }
    public override Step(timeStep: number): void {
        this.cleanupDeadUnits();
        if (timeStep > 0) this.sc_stepCount.increment();
        this.sc_isAnimating = this.isAnimating();
        const fightStateManager = FightStateManager.getInstance();
        const fightProps = fightStateManager.getFightProperties();
        const fightStarted = fightProps.hasFightStarted();

        if (fightStarted && !this.hasAnySceneUnits()) {
            this.recoverEmptyStartedFightState();
            return;
        }

        // Once the fight is underway and every unit exists, prewarm each unit's active-animation atlas
        // so its first activation doesn't decode/upload on a turn-handoff frame (the recognizable lag).
        if (!this.atlasesPrewarmed && fightStarted && this.hasAnySceneUnits()) {
            this.atlasesPrewarmed = true;
            this.prewarmUnitAtlases();
        }

        // AI section - delegate to AIController
        if (
            fightStarted &&
            !this.replayPlaybackActive &&
            this.currentActiveUnit &&
            this.aiController.shouldTriggerAI()
        ) {
            this.aiController.triggerAIAction(1500);
        }

        // Debug grid overlay: draw the cell grid once so attack trajectories / cell coverage are
        // visible. Disabled for now (owner call, 2026-07-18) — flip DRAW_DEBUG_GRID to bring it back.
        if (Sandbox.DRAW_DEBUG_GRID && !this.gridDebugRendered) {
            this.drawer.drawGrid();
            this.gridDebugRendered = true;
        }

        if (this.dungeonVisuals) {
            this.dungeonVisuals.update(timeStep);
        }
        if (this.combatVisuals) {
            this.combatVisuals.update(timeStep);
        }
        this.updateScreenShake(timeStep);
        if (this.rangedProjectiles) {
            this.rangedProjectiles.update(timeStep);
        }

        // 1. Update Visual Overlays
        if (fightStarted) {
            // Both are static placement-only layers. Destroy/hide them once instead of invalidating their
            // graphics buffers on every simulation tick for the entire fight.
            if (!this.unitsOverlay.container.destroyed) this.unitsOverlay.destroy();
            if (this.placementGraphics?.visible) {
                this.placementGraphics.clear();
                this.placementGraphics.visible = false;
            }
            if (this.placementFrameContainer?.visible) {
                this.placementFrameContainer.removeChildren();
                this.placementFrameContainer.visible = false;
            }
        }

        // 2. Background & Static Elements
        this.ensureBackgroundSprite();
        this.layoutBackgroundSquare();
        this.ensureCenterTerrainSprite();
        this.ensurePlacementGraphicsWorld();
        this.ensureGameplayGraphics();
        this.spawnPulsePhase += timeStep * 1.85;
        this.hoverGlowPhase += timeStep * ((Math.PI * 2) / 2.5);
        if (this.hoverGlowPhase > Math.PI * 2) this.hoverGlowPhase -= Math.PI * 2;
        setSpawnFlowPhase(this.spawnPulsePhase, this.hoverGlowPhase);

        // Re-assert the opponent's relayed move silhouette every frame so it stays put and
        // tracks the unit, independent of the viewer's own (mouse-driven) hover updates.
        this.renderOpponentMoveIntent();

        // ==========================================================================================
        // CORE GAME LOGIC
        // ==========================================================================================
        // The localized spill around the lava pool stays alive during placement as well as combat.
        this.dungeonVisuals.updateFireLight();
        if (fightStarted) {
            // Atmosphere Transition & Animation
            if (this.atmosphereAlpha < 1 || this.dungeonVisuals.hasAtmosphereLights()) {
                // Fade In
                if (this.atmosphereAlpha < 1) {
                    this.atmosphereAlpha += timeStep / 3;
                    if (this.atmosphereAlpha > 1) this.atmosphereAlpha = 1;
                    this.updateDungeonAtmosphere(true, this.atmosphereAlpha);
                }

                // Fire flicker (driven by the actual DungeonVisuals lights).
                this.dungeonVisuals.updateAtmosphereFlicker(HoCLib.getTimeMillis() / 1000);
            }

            this.cleanupDeadUnits();
            if (this.fightStatsTracker.sample(this.unitsHolder.getAllUnits().values(), fightProps.getCurrentLap())) {
                this.updateLiveFightStats();
            }
            this.hoverManager.setLastPlacement(undefined);

            // --- A. TURN TIMER LOGIC ---
            // On a missed turn we no longer auto-skip. The FIRST miss of the fight plays a fixed safe
            // default (hourglass, else Luck Shield); every later miss is played by the AI. A 2nd missed
            // turn in a row flips the AI toggle on (so the AI keeps playing until the player turns it off
            // via the AI button). Skipping is only a fallback if neither can act.
            if (
                !this.sc_gameActionTransport &&
                !this.replayPlaybackActive &&
                this.currentActiveUnit &&
                !this.aiController.performingAction &&
                !this.aiController.isAIActive &&
                HoCLib.getTimeMillis() >= fightProps.getCurrentTurnEnd()
            ) {
                this.sandboxConsecutiveTimeouts += 1;
                if (this.sandboxConsecutiveTimeouts >= 2) {
                    // Second miss in a row: turn the AI toggle on; the normal AI trigger loop above takes
                    // over from here (and the bottom-left "AI Toggle On" badge shows).
                    this.aiController.isAIActive = true;
                    this.buttonManager.refreshButtons(true);
                    this.sc_visibleStateUpdateNeeded = true;
                } else {
                    // First miss of the FIGHT buys the grace turn instead of an AI-played one. The
                    // allowance is burned even when the engine refuses both defaults, so it stays once per
                    // fight rather than retrying on the next miss (matches the server). A spent grace — or
                    // a refused one — falls through to the one-shot AI turn, then to a bare skip.
                    let played = false;
                    if (!this.sandboxGraceTurnUsed) {
                        this.sandboxGraceTurnUsed = true;
                        played = this.runSandboxGraceTurn();
                    }
                    if (!played && !this.aiController.forceCurrentTurn(300)) {
                        this.finishTurn(false, "timeout");
                    }
                }
            }

            if (this.cellToUnitPreRound) {
                this.cellToUnitPreRound = undefined;
            }

            // --- B. WIN CONDITION & NEXT UNIT SELECTION ---
            if (!this.replayPlaybackActive) {
                this.advanceAfterNoActiveUnitIfNeeded();
            }

            // --- Movement animation + ground-track fade ---
            // Always step: this advances the travel animation while a unit is moving, and keeps
            // fading the lingering ground tracks afterwards. Gating it on isMoving() froze the
            // tracks on screen forever once the move finished.
            this.stepMoveAnimation(timeStep);
            const lingeringTracks = this.moveAnimManager.getLingeringTracks();
            // Both layers select the relevant tracks while drawing. Passing the shared list avoids two
            // short-lived filtered arrays on every simulation tick.
            this.smokeLayer?.update(timeStep, lingeringTracks);
            this.windLayer?.update(timeStep, lingeringTracks);
            const terrainGridSettings = this.sc_sceneSettings.getGridSettings();
            const terrainCellToWorld = (cell: HoCMath.XY) => {
                const logical = GridMath.getPositionForCell(
                    cell,
                    terrainGridSettings.getMinX(),
                    terrainGridSettings.getStep(),
                    terrainGridSettings.getHalfStep(),
                );
                const metrics = projectedBattlefieldMetricsAtPoint(logical, terrainGridSettings);
                return {
                    ...metrics.center,
                    cellSize: metrics.cellSize,
                    cellPoints: projectedCellPoints(cell, terrainGridSettings, 0.12),
                };
            };
            // Spell smoke is read straight from the authoritative store rather than from the
            // smoke_placed/dispel/expired events, so sandbox and ranked share one path: the ranked client
            // already carries smokeClouds on every snapshot, exactly like narrowing and terrain.
            if (this.smokeCloudLayer) {
                const smokeClouds = fightProps.getSmokeClouds();
                this.smokeCloudLayer.update(
                    timeStep,
                    this.smokeCloudSnapshotCache.get(smokeClouds),
                    terrainGridSettings.getCellSize(),
                    terrainCellToWorld,
                );
            }
            // Vines, same authoritative-store pattern as the smoke above.
            if (this.vineLayer) {
                const vines = fightProps.getVines();
                this.vineLayer.update(
                    timeStep,
                    this.vineSnapshotCache.get(vines),
                    terrainGridSettings.getCellSize(),
                    terrainCellToWorld,
                );
            }
            // Fire walls, same authoritative-store pattern as the smoke and vines above.
            if (this.fireWallLayer) {
                const fireWalls = fightProps.getFireWalls();
                this.fireWallLayer.update(
                    timeStep,
                    this.fireWallSnapshotCache.get(fireWalls),
                    terrainGridSettings.getCellSize(),
                    terrainCellToWorld,
                );
            }
            this.lightingLayer?.update(timeStep);
            // HoverManager owns animated combat previews (the flowing dashed ranged trajectory and
            // pulsing hover accents). It previously advanced only in the pre-fight branch below, so once
            // combat started the arrow was redrawn with a frozen phase and looked completely static.
            this.hoverManager.update(timeStep);

            // --- C. AI LOGIC - delegate to AIController ---
            if (
                this.currentActiveUnit &&
                !this.replayPlaybackActive &&
                this.aiController.shouldTriggerAI() &&
                !this.sc_isAnimating &&
                !this.moveAnimManager.isMoving()
            ) {
                this.aiController.triggerAIAction(2000);
            }
        } else {
            // Pre-fight logic
            this.checkStartCondition();
            this.hoverManager.update(timeStep);
            if (this.hasActiveSelection && this.sc_selectedUnitProperties && this.sc_mouseWorld) {
                this.hoverManager.updateHoverPlacementCell(this.getPlacementPreviewPoint());
            }
            if (this.placementGraphics) {
                this.placementGraphics.visible = true;
                if (this.placementFrameContainer) this.placementFrameContainer.visible = true;
                this.drawPlacements();
            }
        }

        // ==========================================================================================
        // RENDERING SYNCHRONIZATION
        // ==========================================================================================
        // this.updateLingeringTracks(timeStep); // Handled by moveAnimManager.update
        if (this.gameplayGraphics) {
            this.drawGameplayVisuals(this.gameplayGraphics);
        }

        const depthSortableUnits: RenderableUnit[] = [];
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            const rUnit = unit as RenderableUnit;
            rUnit.setHoverTurnAura(!fightProps.hasFightStarted() && this.hoverManager.hoveredUnitId === rUnit.getId());
            if (!fightProps.hasFightStarted()) {
                // Placement is a face-off: red/UPPER models are mirrored toward the left, while
                // green/LOWER models keep facing right. Re-assert every frame so dragging or hydration
                // cannot leave a unit with stale combat-facing from a previous scene state.
                rUnit.setBoardFacing(placementFacingDirectionForTeam(rUnit.getTeam()));
            }
            // Use PixiDrawer's unit container (Z=1000), not worldRoot directly.
            // This ensures units are ALWAYS above terrain (Z=20) and overlay (Z=60) but depth sorted inside.
            rUnit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
            depthSortableUnits.push(rUnit);
            // Animation atlases must keep ticking while the unit moves. Previously the moving branch
            // skipped this call and only applied the generic bob/tilt, leaving Wandering Mage's authored
            // walking atlas frozen forever on frame zero in a live battle.
            rUnit.stepSpawnAnimation(timeStep);
            if (this.isActiveUnitMoving && this.moveAnimManager.getMovingUnit() === rUnit) {
                rUnit.applyMoveEffect(this.spawnPulsePhase);
            }
        }
        // Logical death removes a stack from UnitsHolder immediately. Keep only its detached authored
        // death atlas advancing until the final frame, with the same world anchor/scaling as live units.
        for (const dyingUnit of [...this.dyingVisualUnits]) {
            if (this.unitsHolder.getAllUnits().get(dyingUnit.getId()) === dyingUnit) {
                continue;
            }
            dyingUnit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
            dyingUnit.stepSpawnAnimation(timeStep);
            depthSortableUnits.push(dyingUnit);
        }

        const depthCandidates = depthSortableUnits
            .map((unit, stableOrder) => unit.getCreatureDepthSortCandidate(stableOrder))
            .filter((candidate) => !!candidate);
        const headPriorityDepths = resolveCreatureHeadPriorityDepths(depthCandidates);
        if (headPriorityDepths.size) {
            for (const unit of depthSortableUnits) {
                const depth = headPriorityDepths.get(String(unit.getId()));
                if (depth !== undefined) unit.applyCreatureHeadPriorityDepth(depth);
            }
        }

        // Update SpellBook
        if (this.spellBookContainer) {
            const showSpellBook = !!this.sc_renderSpellBookOverlay;
            // Re-fit on the closed -> open transition: the canvas can still be settling into its final
            // size when the scene is constructed, and no resize necessarily fires before the first open.
            if (showSpellBook && !this.spellBookContainer.visible) {
                const screen = this.pixiApp.getApplication().screen;
                this.layoutSpellBook(screen.width, screen.height);
            }
            this.spellBookContainer.visible = showSpellBook;
        }
        if (this.sc_renderSpellBookOverlay && this.spellBookOverlay && this.currentActiveUnit) {
            for (const unit of this.unitsHolder.getAllUnits().values()) {
                const rUnit = unit as RenderableUnit;
                if (rUnit !== this.currentActiveUnit) {
                    rUnit.hideSpells();
                }
            }
            this.spellBookOverlay.render(this.currentActiveUnit);
        }
    }
    private drawGameplayVisuals(g: Graphics): void {
        // Movement cells have their own lower layer and are rebuilt with the rest of the dynamic overlay.
        this.movementGraphics?.clear();
        this.clearShotRangeCornerSprites();
        if (!this.hasGameplayVisuals()) {
            if (this.gameplayGraphicsHasGeometry) {
                g.clear();
                this.gameplayGraphicsHasGeometry = false;
            }
            // This text is owned by the dynamic overlay lifecycle too; run its hide path even when
            // no geometry is necessary so a disarmed Fire Wall does not leave a stale instruction behind.
            this.updateFireWallRotateHint();
            return;
        }

        g.clear();
        this.gameplayGraphicsHasGeometry = true;
        let sidebarUnitRanges:
            | {
                  xy: HoCMath.XY;
                  attackRange: number;
                  auraRanges: { range: number; isBuff: boolean }[];
                  footprint: IFootprintExtent;
              }
            | undefined;

        if (this.selectedBoardUnit) {
            const u = this.selectedBoardUnit;
            if (u === this.currentActiveUnit) {
                // If the selected board unit IS the current active unit, we rely on standard active unit visuals?
                // Or maybe we want to force sidebar visuals too?
            } else {
                // If the selected unit is also the hovered unit OR shift-selected, we want the "Interactive/Yellow" ring to take precedence.
                // So we suppress the "Sidebar/Blue" ring by setting attackRange to 0 here.
                const isHovered = this.hoverManager.hoveredUnitId === u.getId();
                const isShifted = this.currentShiftedUnit?.getId() === u.getId();
                // Real auras only, widened by the team synergy — visibleAuraRanges drops the
                // ability-aligned zero entries BEFORE adding the bonus (adding first painted a phantom
                // aura on every unit whenever the "+N aura range" synergy was active).
                const auraRanges = visibleAuraRanges(
                    u.getAuraRanges(),
                    u.getAuraIsBuff(),
                    FightStateManager.getInstance().getFightProperties().getAdditionalAuraRangePerTeam(u.getTeam()),
                );

                sidebarUnitRanges = {
                    xy: u.getPosition(),
                    attackRange:
                        !isHovered && !isShifted && u.getAttackType() === AttackVals.RANGE && u.getRangeShots() > 0
                            ? (() => {
                                  if (u.hasAbilityActive("Sniper")) {
                                      u.setRangeShotDistance(
                                          Number(
                                              (
                                                  GridMath.getDistanceToFurthestCorner(
                                                      u.getPosition(),
                                                      this.sc_sceneSettings.getGridSettings(),
                                                  ) /
                                                      this.sc_sceneSettings.getGridSettings().getStep() -
                                                  0.45
                                              ).toFixed(2),
                                          ),
                                      );
                                  }
                                  return u.getRangeShotDistance() * GridConstants.STEP;
                              })()
                            : 0,
                    auraRanges,
                    footprint: footprintExtentOf(u),
                };
            }
        }

        // Calculate shift-selected range
        let shiftSelectedShotRange: ShotRangeOverlay | undefined;
        if (this.currentShiftedUnit?.getAttackType() === AttackVals.RANGE) {
            const dist = this.currentShiftedUnit.getRangeShotDistance();
            if (dist > 0) {
                shiftSelectedShotRange = fullDamageShotRangeForFootprint(
                    this.currentShiftedUnit.getPosition(),
                    dist,
                    this.currentShiftedUnit.getFootprintWidth(),
                    this.currentShiftedUnit.getFootprintHeight(),
                );
            }
        }

        const fightProps = FightStateManager.getInstance().getFightProperties();
        const currentActiveShotRange = this.sc_currentActiveShotRange
            ? {
                  ...this.sc_currentActiveShotRange,
                  // The active creature is green for its viewer; in ranked an opponent's active creature
                  // remains red. Sandbox has no fixed viewer team, so its current mover is green as before.
                  color: this.currentActiveUnit
                      ? this.shotRangeColorForHoveredUnit(this.currentActiveUnit)
                      : hoveredShotRangeColor(false),
              }
            : undefined;

        SandboxDrawer.drawGameplayVisuals(g, {
            fightProps,
            currentActiveShotRange,
            shiftSelectedShotRange,
            hoveredShotRange: this.sc_hoveredShotRange,
            isActiveUnitMoving: this.isActiveUnitMoving,
            gridSettings: this.sc_sceneSettings.getGridSettings(),
            hoverGlowPhase: this.hoverGlowPhase,
            currentActivePath: this.currentActivePath,
            sc_isAnimating: this.sc_isAnimating,
            currentActiveUnit: this.currentActiveUnit,
            hoverManager: this.hoverManager,
            sidebarUnitRanges,
            hoveredAuraRanges: this.sc_hoveredAuraRanges,
            lingeringTracks: this.moveAnimManager.getLingeringTracks(),
            // Placement-only overlay. The calc that maintains sc_placementMoveRange is gated to the
            // placement phase, so once the fight starts it is never updated OR cleared — feeding the stale
            // value to the drawer left its little dots scattered across the board mid-fight (intermittent:
            // only when a unit happened to be selected at ready-up). Never render it during the fight.
            hoveredMoveRange: fightProps.hasFightStarted() ? undefined : this.sc_placementMoveRange,
            hoveredUnitMoveRange: this.sc_hoveredMoveRange,
            hoveredUnitMoveRangeIsEnemy: this.sc_hoveredMoveRangeIsEnemy,
            enemyTurnView: this.isEnemyActiveTurn(),
            movementGraphics: this.movementGraphics,
            shotRangeCornerContainer: this.shotRangeCornerContainer,
            shotRangeCornerTexture: this.texAny("shot_range_corner_aaa_v1"),
            shotRangeCornerFriendlyTexture: this.texAny("shot_range_corner_aaa_v4_green"),
            shotRangeCornerEnemyTexture: this.texAny("shot_range_corner_aaa_v4_red"),
        });

        // Craft (ALLIES_AREA) aim preview: while armed, highlight the 2x2 that a click would craft.
        this.drawCraftAim(g);
        // Vine Throw (ANY_ENEMY) aim preview: highlight the lane the vine would cover.
        this.drawVineThrowAim(g);
        // Fire Strike (ANY_ENEMY) aim preview: the projectile's trajectory and who it actually burns.
        this.drawFireStrikeAim(g);
        // "Shift to rotate" under an armed Fire Wall, alongside its footprint preview.
        this.updateFireWallRotateHint();
    }
    /** Whether the board-overlay Graphics has anything to render this simulation tick. */
    private hasGameplayVisuals(): boolean {
        if (isMovementAreaEditorActive()) return true;
        if (this.sc_placementMoveRange?.length || this.sc_hoveredMoveRange?.length) return true;
        if (this.sc_hoveredShotRange || this.sc_hoveredAuraRanges || this.sc_currentActiveShotRange) return true;
        if (this.hoverManager.hoverBattlefieldFootprintCells?.length) return true;
        if (this.currentActivePath?.length || this.currentShiftedUnit || this.selectedBoardUnit) return true;
        if (this.currentActiveSpell) return true;

        const activeUnit = this.currentActiveUnit;
        if (!activeUnit || this.isActiveUnitMoving) return false;
        return activeUnit.getAuraRanges().some((range) => range > 0);
    }
    /**
     * Vine Throw aim preview: while the spell is armed and the cursor is over an enemy, highlight every cell
     * the vine would cover — the whole lane from Trent to that target, not just the target itself. Which cells
     * end up vined is the entire tactical point of the throw (they cost non-flyers an extra step for two
     * laps), and without this the player is aiming blind at a line they cannot see.
     *
     * All-or-nothing like Smoke and Fire Wall: the engine refuses a throw whose lane is blocked, so an
     * illegal target draws nothing at all rather than dangling a highlight over a cast that would be
     * rejected. Legality comes from the shared targeted-spell predicate and the lane comes from the engine's
     * own vinePathCells walk, so the preview cannot promise something vineThrowCast will refuse.
     */
    /**
     * Bodies a throw flies OVER rather than into. Only Fire Strike arcs over the caster's own troops; Vine
     * Throw and Ring of Fire are stopped by ANY body, friend or foe. This mirrors the engine exactly — a
     * client that disagreed would either refuse a cast the server accepts or preview the wrong victim.
     */
    private throwTransparency(spellName: string, caster: Unit): TransparencyPredicate | undefined {
        if (spellName !== "Fire Strike") {
            return undefined;
        }
        return alliesAreTransparent(this.unitsHolder.getAllUnits(), caster.getTeam());
    }
    /**
     * One deterministic contact point for a unit-targeted spell, matching ranged targeting semantics.
     * Every observable exterior segment competes; spells have no distance falloff, so the nearest point
     * to the caster is the optimal one. The point is independent of where the pointer sits on the body.
     */
    private optimalSpellTrajectoryAim(
        spell: Spell,
        caster: Unit,
        target: Unit,
    ): GridMath.IClosestSideCenter | undefined {
        const gs = this.sc_sceneSettings.getGridSettings();
        const transparent = this.throwTransparency(spell.getName(), caster);
        const requiresLineOfSight = SpellHelper.targetedSpellRequiresLineOfSight(spell.getName());
        const candidates = rangeTargetExteriorEdges(target.getCells()).map(({ cell, side }) => {
            const neighbour = rangeTargetEdgeMarkerCell(cell, side);
            const occupant = GridMath.isCellWithinGrid(gs, neighbour)
                ? this.grid.getOccupantUnitId(neighbour)
                : undefined;
            const observable =
                !requiresLineOfSight ||
                !occupant ||
                occupant === "L" ||
                occupant === "W" ||
                transparent?.(occupant) === true;
            return {
                cell,
                side,
                shootable: observable,
                rangeDivisor: 1,
                aimPosition: rangeTargetEdgeEvaluationAim(gs, cell, side, caster.getPosition()),
            };
        });
        const optimal = optimalRangeTargetEdge(candidates, caster.getPosition());
        return optimal
            ? {
                  cell: { ...optimal.cell },
                  side: optimal.side,
                  position: { ...optimal.aimPosition },
              }
            : undefined;
    }
    /**
     * The enemy under the cursor for an armed ANY_ENEMY throw, with the caster that would throw it. Detection
     * covers every occupied support cell and the full rendered sprite; the engine still receives the stable
     * base cell while the preview chooses one optimal exterior contact point separately.
     */
    private hoveredThrowTarget(
        spellName: string,
    ): { caster: Unit; from: HoCMath.XY; target: Unit; to: HoCMath.XY } | undefined {
        if (this.currentActiveSpell?.getName() !== spellName) {
            return undefined;
        }
        const caster = this.currentActiveUnit;
        const from = caster?.getBaseCell();
        if (!caster || !from) {
            return undefined;
        }
        // The same resolver used by attacks checks occupied support cells first, then the actual rendered
        // sprite. A tall or overhanging creature therefore keeps the spell trajectory over its whole figure.
        const target = this.getUnitAtPosition(this.sc_mouseWorld);
        const to = target?.getBaseCell();
        if (!target || !to || target.isDead() || target.getTeam() === caster.getTeam()) {
            return undefined;
        }
        // Being an enemy is not the same as being a LEGAL target. A creature the spell can never touch —
        // 100% magic armor (Black Dragon's Enchanted Skin), the matching element, a mind-resistant target,
        // an already-applied debuff — is refused by the cast, so the aim preview must refuse it too.
        // Without this the lane painted itself green over a throw the engine would reject on click.
        if (!this.canArmedSpellTarget(target)) {
            return undefined;
        }
        return { caster, from, target, to };
    }
    /**
     * Whether the currently armed spell may legally land on this unit — the SAME predicate the click and
     * the target highlight use, so a preview can never promise a cast the engine refuses.
     */
    private canArmedSpellTarget(target: Unit): boolean {
        const spell = this.currentActiveSpell;
        const caster = this.currentActiveUnit;
        if (!spell || !caster) {
            return false;
        }
        return !!SpellHelper.canCastSpell(
            false,
            this.sc_sceneSettings.getGridSettings(),
            this.gridMatrix,
            caster,
            target,
            spell,
            target.getBaseCell(),
            target.getMagicResist(),
            target.hasMindAttackResistance(),
            target.canBeHealed(),
            this.currentEnemiesCellsWithinMovementRange,
        );
    }
    /**
     * Fire Strike aim preview: the projectile's trajectory, and a ring around the creature it actually burns.
     *
     * Fire Strike is thrown, not called down, so a body standing in the line takes it instead of the unit the
     * cursor is over (owner 2026-08-09 — it behaves like an archer's shot). That makes "who does this hit?"
     * genuinely ambiguous on a crowded board, which is exactly what this draws: the shared single spell beam
     * ends at the optimal point of impact and the actual victim is ringed. The valid beam is never redrawn here,
     * which keeps the trajectory one-pixel-axis consistent instead of producing two parallel rails.
     *
     * Terrain is the one thing that still refuses the cast, and that draws cold red and stops at the rock.
     */
    /**
     * Which creature a thrown spell actually hits when `aimed` is the one under the cursor. Normally that is
     * the aimed creature itself; for Fire Strike a body standing in the line intercepts the throw and takes
     * it instead. Terrain-blocked and non-thrown spells fall back to the aimed unit — the cast is refused in
     * that case anyway, so there is no victim to redirect to.
     */
    private thrownSpellVictim(spell: Spell, caster: Unit, aimed: Unit): Unit {
        const from = caster.getBaseCell();
        const to = aimed.getBaseCell();
        if (!from || !to) {
            return aimed;
        }
        const impact = thrownSpellImpact(
            spell.getName(),
            this.grid,
            from,
            to,
            this.throwTransparency(spell.getName(), caster),
        );
        if (!impact.interceptedBy) {
            return aimed;
        }
        const interceptor = this.unitsHolder.getAllUnits().get(impact.interceptedBy);
        return interceptor && !interceptor.isDead() ? interceptor : aimed;
    }
    private drawFireStrikeAim(g: Graphics): void {
        const aim = this.hoveredThrowTarget("Fire Strike");
        if (!aim) {
            return;
        }
        const { caster, from, target, to } = aim;
        const gs = this.sc_sceneSettings.getGridSettings();
        const cellPos = (cell: HoCMath.XY) =>
            GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());

        const impact = thrownSpellImpact(
            "Fire Strike",
            this.grid,
            from,
            to,
            this.throwTransparency("Fire Strike", caster),
        );
        const victim = impact.blockedByTerrain
            ? undefined
            : impact.interceptedBy
              ? this.unitsHolder.getAllUnits().get(impact.interceptedBy)
              : target;

        // Origin is the mage's visual centre. A creature endpoint uses the same one optimal exterior point
        // as the live spell beam; blocked terrain remains centered because it has no creature contour.
        const logicalOrigin = caster.getPosition();
        const spell = this.currentActiveSpell;
        const logicalEnd =
            (spell && victim ? this.optimalSpellTrajectoryAim(spell, caster, victim)?.position : undefined) ??
            victim?.getPosition() ??
            cellPos(impact.cell);
        if (!logicalOrigin || !logicalEnd) {
            return;
        }
        this.highlightScatteredObstaclesAlongTrajectory(logicalOrigin, logicalEnd);
        const origin = projectBattlefieldPoint(logicalOrigin, gs);
        const end = projectBattlefieldPoint(logicalEnd, gs);

        const size = gs.getCellSize();
        const pulse = (Math.sin(this.hoverGlowPhase) + 1) / 2;
        const refused = impact.blockedByTerrain;

        const trailColor = refused ? 0xff5a5a : 0xff8a2b;
        // A valid cast already owns exactly one HoverManager beam. Only a refused terrain hit needs this
        // fallback rail; drawing the valid rail here as well created the doubled parallel line in the UI.
        if (refused) {
            g.moveTo(origin.x, origin.y)
                .lineTo(end.x, end.y)
                .stroke({ width: 5, color: 0x7a1010, alpha: 0.35 + 0.2 * pulse, cap: "round" });
            g.moveTo(origin.x, origin.y)
                .lineTo(end.x, end.y)
                .stroke({ width: 2, color: trailColor, alpha: 0.7 + 0.25 * pulse, cap: "round" });
        }

        // The impact itself: a filled square on the struck cell under a ring, so the answer to "who burns"
        // survives even when the victim's own sprite is busy with other highlights.
        const impactPos = projectBattlefieldPoint(victim?.getPosition() ?? cellPos(impact.cell), gs);
        if (impactPos) {
            g.poly(tunedCellFillPolygon(impact.cell, gs, 1 / size))
                .fill({ color: refused ? 0x8f3a3a : 0xb03000, alpha: 0.28 + 0.16 * pulse })
                .stroke({ width: 2, color: refused ? 0xff9a9a : 0xffd04a, alpha: 0.85 });
            g.circle(impactPos.x, impactPos.y, (size / 2) * (0.72 + 0.1 * pulse)).stroke({
                width: 2,
                color: trailColor,
                alpha: 0.6 + 0.3 * pulse,
            });
        }
    }
    private drawVineThrowAim(g: Graphics): void {
        const spell = this.currentActiveSpell;
        if (spell?.getName() !== "Vine Throw") {
            return;
        }
        // Shared with Fire Strike: enemy under the cursor, measured to its BASE cell (the cell the engine
        // throws at, which for a large creature is not the one the cursor is over), and already gated on
        // the spell actually being castable at it.
        const aim = this.hoveredThrowTarget("Vine Throw");
        if (!aim) {
            return;
        }
        const { from, to } = aim;
        const gs = this.sc_sceneSettings.getGridSettings();
        const pathCells = VineHelper.vinePathCells(from, to);
        if (!pathCells.length) {
            return;
        }
        // Target legality is settled above (hoveredThrowTarget). What remains is the LANE: a throw whose
        // path a body intercepts is still previewed (owner 2026-08-08) — in red, up
        // to the creature intercepting it, because "nothing is drawn" reads as a broken preview rather
        // than as an explanation. Only a creature can block now, so this is always a body the player sees.
        const blockedAt = targetedSpellBlockerCell(spell.getName(), this.grid, from, to);
        const blockedIndex = blockedAt
            ? pathCells.findIndex((cell) => cell.x === blockedAt.x && cell.y === blockedAt.y)
            : -1;
        const lastDrawnIndex = blockedIndex >= 0 ? blockedIndex : pathCells.length - 1;

        const size = gs.getCellSize();
        const pulse = (Math.sin(this.hoverGlowPhase) + 1) / 2;
        for (let i = 0; i <= lastDrawnIndex; i += 1) {
            // The struck creature's cell reads brightest — it takes the snare debuff on top of the vine.
            // On a blocked lane the interceptor's cell is the bright one instead: that is the answer to
            // "why can't I hit them", and the lane behind it is never reached.
            const isEndCell = i === lastDrawnIndex;
            const fillAlpha = (isEndCell ? 0.3 : 0.18) + 0.14 * pulse;
            const fillColor = blockedIndex >= 0 ? 0x8f3a3a : 0x3f8f3a;
            const strokeColor = blockedIndex >= 0 ? (isEndCell ? 0xff9a9a : 0xd16a6a) : isEndCell ? 0xbff59a : 0x86d16a;
            g.poly(tunedCellFillPolygon(pathCells[i], gs, 1 / size))
                .fill({ color: fillColor, alpha: fillAlpha })
                .stroke({ width: 2, color: strokeColor, alpha: 0.75 });
        }
    }
    /**
     * While a CELL-target spell is armed, preview the 2x2 footprint under the cursor. The clicked cell is
     * the block's corner, so it extends one cell right (+x) and one down (+y) — matching craftCast and
     * smokeCast in the engine, which use the same footprint.
     *
     * The bright cells are the ones that will actually DO something, which differs per spell and is the
     * whole point of the preview: Craft acts on cells holding an ALLY, Smoke only takes hold on cells that
     * are FREE (a creature standing there blocks it, exactly as one stepping in later disperses it).
     */
    private drawCraftAim(g: Graphics): void {
        const spell = this.currentActiveSpell;
        const targetType = spell?.getSpellTargetType();
        if (!spell || (targetType !== SpellTargetType.ALLIES_AREA && targetType !== SpellTargetType.FREE_CELL)) {
            return;
        }
        // Fire Wall shares FREE_CELL with Smoke but not its footprint — it gets its own preview below.
        if (this.isRotatableAreaSpell(spell)) {
            this.drawFireWallAim(g);
            return;
        }
        // Meteorite shares FREE_CELL with Smoke but inverts its rule: the rock is MEANT to come down on
        // occupied cells, so emptiness is not required — only that the whole block is on the board and that it
        // catches at least one enemy (meteoriteCast refuses a drop that hits nobody rather than burn the
        // single charge).
        const isMeteorite = spell.getName() === "Meteorite" || spell.getName() === "Meteor Shower";
        const isSmoke = targetType === SpellTargetType.FREE_CELL && !isMeteorite;
        const gsAim = this.sc_sceneSettings.getGridSettings();
        const gs = this.sc_sceneSettings.getGridSettings();
        const origin = GridMath.getCellForPosition(gs, this.sc_mouseWorld);
        if (!origin) {
            return;
        }
        const cells = this.cellTargetedSpellBlock(spell, origin);
        const size = gs.getCellSize();
        const pulse = (Math.sin(this.hoverGlowPhase) + 1) / 2;
        const casterTeam = this.currentActiveUnit?.getTeam();
        const enemyOn = (c: HoCMath.XY): boolean => {
            const occupantId = this.grid.getOccupantUnitId(c);
            const occupant = occupantId ? this.unitsHolder.getAllUnits().get(occupantId) : undefined;
            return !!occupant && !occupant.isDead() && occupant.getTeam() !== casterTeam;
        };
        // Smoke is all-or-nothing: the engine rejects a partial 2x2, so only draw the footprint where the
        // WHOLE block is legal. Anywhere else shows nothing at all, which reads as "you cannot cast here"
        // rather than dangling a highlight over a placement that would be refused.
        if (
            isSmoke &&
            !cells.every((c) => SmokeHelper.isSmokeableCell(this.grid, GridMath.isCellWithinGrid(gsAim, c), c))
        ) {
            return;
        }
        // Same courtesy for the meteor: no highlight means the engine would refuse this drop.
        if (
            isMeteorite &&
            (!cells.every((c) => GridMath.isCellWithinGrid(gsAim, c)) || !cells.some((c) => enemyOn(c)))
        ) {
            return;
        }
        for (const c of cells) {
            const occupantId = this.grid.getOccupantUnitId(c);
            const occupant = occupantId ? this.unitsHolder.getAllUnits().get(occupantId) : undefined;
            const isAlly = !!occupant && !occupant.isDead() && occupant.getTeam() === casterTeam;
            // Smoke uses the ENGINE's own predicate so the preview can never promise a cast it will
            // reject: mountain, narrowed cell, creature or off-board all fail; lava and water are fine.
            // Meteorite brightens the cells that will actually be burnt — the ones holding an enemy.
            const willAffect = isMeteorite
                ? enemyOn(c)
                : isSmoke
                  ? SmokeHelper.isSmokeableCell(this.grid, GridMath.isCellWithinGrid(gsAim, c), c)
                  : isAlly;
            const fillAlpha = willAffect ? 0.28 + 0.14 * pulse : 0.1;
            // Slate for smoke, blue for the forge, ember for the meteor — each matches its own board VFX.
            const fill = isMeteorite ? 0xff6a1e : isSmoke ? 0x8b93a3 : 0x49b6ff;
            const stroke = isMeteorite ? 0xffc46b : isSmoke ? 0xd2d8e4 : 0x9fe0ff;
            g.poly(tunedCellFillPolygon(c, gs, 1 / size))
                .fill({ color: fill, alpha: fillAlpha })
                .stroke({ width: 2, color: stroke, alpha: 0.7 });
        }
    }
    /**
     * Fire Wall aim preview: the 3-cell line a click would set alight, centred on the cell under the cursor
     * so the wall pivots about the mouse as Shift turns it (see rotateFireWallAim).
     *
     * All-or-nothing like Smoke — the engine refuses a partial line, so an illegal placement draws nothing
     * at all rather than dangling a highlight over a cast that would be rejected. Legality is read from the
     * ENGINE's own predicate, so the preview can never promise something fireWallCast will refuse.
     *
     * Drawn hot (ember red under a bright orange stroke) to match the flames the cast leaves behind, with an
     * arrowhead on the leading cell so the current orientation is readable at a glance while rotating.
     */
    private drawFireWallAim(g: Graphics): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const anchor = GridMath.getCellForPosition(gs, this.sc_mouseWorld);
        if (!anchor) {
            return;
        }
        const cells = FireWallHelper.fireWallCells(anchor, this.fireWallAimOrientation);
        if (!cells.every((c) => FireWallHelper.isFireWallableCell(this.grid, GridMath.isCellWithinGrid(gs, c), c))) {
            return;
        }
        const size = gs.getCellSize();
        const pulse = (Math.sin(this.hoverGlowPhase) + 1) / 2;
        for (const c of cells) {
            g.poly(tunedCellFillPolygon(c, gs, 1 / size))
                .fill({ color: 0xb03000, alpha: 0.3 + 0.16 * pulse })
                .stroke({ width: 2, color: 0xff8a2b, alpha: 0.8 });
        }
        // A tick along the wall's own axis, drawn through all three cells, so a vertical wall and a diagonal
        // one are told apart instantly instead of by reading three separate squares.
        const first = projectBattlefieldPoint(
            GridMath.getPositionForCell(cells[0], gs.getMinX(), gs.getStep(), gs.getHalfStep()),
            gs,
        );
        const last = projectBattlefieldPoint(
            GridMath.getPositionForCell(cells[cells.length - 1], gs.getMinX(), gs.getStep(), gs.getHalfStep()),
            gs,
        );
        g.moveTo(first.x, first.y)
            .lineTo(last.x, last.y)
            .stroke({ width: 3, color: 0xffd04a, alpha: 0.5 + 0.3 * pulse, cap: "round" });
    }
    private snapshotRenderableUnits(): Map<string, RenderableUnit> {
        const snapshot = new Map<string, RenderableUnit>();
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            snapshot.set(unit.getId(), unit as RenderableUnit);
        }
        return snapshot;
    }
    private createTurnEngine(): TurnEngine {
        const context = {
            fightProperties: FightStateManager.getInstance().getFightProperties(),
            grid: this.grid,
            unitsHolder: this.unitsHolder,
            moveHandler: this.moveHandler,
            sceneLog: this.sc_sceneLog,
            canLandRangeAttack: (unit: Unit) => this.canLandRangeAttack(unit),
        } satisfies ConstructorParameters<typeof TurnEngine>[0] & { canLandRangeAttack?: (unit: Unit) => boolean };
        return new TurnEngine(context);
    }
    protected createActionEngine(): SceneActionEngine {
        const context = {
            fightProperties: FightStateManager.getInstance().getFightProperties(),
            grid: this.grid,
            unitsHolder: this.unitsHolder,
            moveHandler: this.moveHandler,
            sceneLog: this.sc_sceneLog,
            attackHandler: this.attackHandler,
            canLandRangeAttack: (unit: Unit) => this.canLandRangeAttack(unit),
            getCurrentActiveUnitId: () => this.currentActiveUnit?.getId(),
            getCurrentActiveKnownPaths: () => this.currentActiveKnownPaths,
            getCurrentEnemiesCellsWithinMovementRange: () => this.currentEnemiesCellsWithinMovementRange,
            createSummonedUnit: ({ team, faction, unitName, amount }) =>
                this.createSummonedRenderableUnit(team, faction, unitName, amount),
            canPlaceUnit: (unit, cells, action) => this.canPlaceUnitWithCommonRules(unit, cells, action),
            canSplitUnit: (unit) => this.canSplitUnitWithCommonRules(unit),
            createSplitUnit: (unit, amount) => this.createSplitRenderableUnit(unit, amount),
        } satisfies ConstructorParameters<typeof GameActionEngine>[0] & {
            canLandRangeAttack?: (unit: Unit) => boolean;
        };
        const engine = new GameActionEngine(context);
        return this.createReplayRecordingActionEngine(engine);
    }
    protected shouldDeferActionToAuthoritativeReplay(_action: GameAction): boolean {
        return false;
    }
    protected isPlayingAuthoritativeReplay(): boolean {
        return this.replayPlaybackActive;
    }
    private submitActionForAuthoritativeReplay(
        action: GameAction,
        options?: Parameters<SceneGameActionTransport>[1],
    ): boolean {
        // For attacks only: snapshot every unit's HP and rendered center BEFORE applying locally, so
        // the authoritative replay can recover both the true pre-action HP diff and the landing point
        // of an interceptor removed by the local apply. Non-attacks clear any prior snapshot.
        const isAttackAction = action.type === "range_attack" || action.type === "melee_attack";
        const preActionHp = isAttackAction
            ? new Map<string, { amount: number; cumulativeHp: number; maxHp: number; visualCenter: HoCMath.XY }>()
            : undefined;
        if (preActionHp) {
            const gridSettings = this.sc_sceneSettings.getGridSettings();
            for (const u of this.unitsHolder.getAllUnits().values()) {
                const renderable = u as RenderableUnit;
                const visualCenter =
                    typeof renderable.getVisualCenter === "function"
                        ? renderable.getVisualCenter(gridSettings)
                        : u.getPosition();
                preActionHp.set(u.getId(), {
                    amount: u.getAmountAlive(),
                    cumulativeHp: u.getCumulativeHp(),
                    maxHp: u.getMaxHp(),
                    visualCenter: { x: visualCenter.x, y: visualCenter.y },
                });
            }
        }
        // Intermediate ranked moves need submission metadata that GameAction does not carry. Route this
        // one case directly through the transport; all ordinary deferred actions retain the scene-engine
        // wrapper (including its turn-handoff visual bookkeeping).
        const result = options?.continueTurn
            ? (() => {
                  const transported = this.dispatchExternalGameAction(action, options);
                  return {
                      completed: transported.handled && transported.completed,
                      events: [] as GameEvent[],
                      message: transported.message,
                      rejectionReason: transported.handled ? undefined : "unsupported_action",
                  };
              })()
            : this.createActionEngine().apply(action);
        if (!result.completed) {
            this.sc_moveBlocked = false;
            this.sc_sceneLog.updateLog(result.message ?? result.rejectionReason ?? "Action rejected");
            return false;
        }
        this.preDeferredActionUnitHp = preActionHp;
        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.currentActivePathHashes = undefined;
        this.hoverManager.clearHoverSilhouette();
        this.hoverManager.clearAttackVisuals();
        this.dungeonVisuals.clearScatteredMountainHighlight();
        this.hoverManager.hoverAttackFromCell = undefined;
        this.sc_moveBlocked = false;
        this.sc_visibleStateUpdateNeeded = true;
        return true;
    }
    private canLandRangeAttack(unit: Unit): boolean {
        return (
            this.attackHandler?.canLandRangeAttack(unit, this.grid.getEnemyAggrMatrixByUnitId(unit.getId())) ?? false
        );
    }
    private createReplayRecordingActionEngine(engine: SceneActionEngine): SceneActionEngine {
        return {
            apply: (action: GameAction) => {
                const shouldRecord = !this.replayRecordingSuspended;
                if (shouldRecord) {
                    this.replayRecorder.beginAction();
                }

                const result = engine.apply(action);
                if (shouldRecord && result.completed) {
                    this.pendingReplayRecords.push({
                        action: cloneReplayData(action),
                        result: {
                            ...result,
                            events: cloneReplayData(result.events),
                        },
                    });
                }
                return result;
            },
        };
    }
    private flushPendingReplayRecords(): void {
        if (this.replayRecordingSuspended) {
            this.pendingReplayRecords = [];
            return;
        }

        const records = this.pendingReplayRecords.splice(0);
        for (const record of records) {
            this.replayRecorder.recordAction(record.action, record.result);
        }
    }
    private canPlaceUnitWithCommonRules(
        unit: Unit,
        cells: HoCMath.XY[],
        action: Extract<GameAction, { type: "place_unit" }>,
    ): boolean {
        const teamAllowedHashes = this.placementManager.getAllowedPlacementCellHashesForTeam(action.team);
        if (!teamAllowedHashes || cells.some((cell) => !teamAllowedHashes.has((cell.x << 4) | cell.y))) {
            return false;
        }

        const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
        const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
        if (!lowerLeftPlacement || !upperRightPlacement) {
            return false;
        }

        const unitAlreadyPlaced = unit.getCells().some((cell) => this.grid.getOccupantUnitId(cell) === unit.getId());
        if (unitAlreadyPlaced) {
            return true;
        }

        const lowerRightPlacement = this.getPlacement(TeamVals.LOWER, 1);
        const upperLeftPlacement = this.getPlacement(TeamVals.UPPER, 1);
        const alliesPlacedCount = this.unitsHolder
            .getAllAlliesPlaced(
                action.team,
                lowerLeftPlacement,
                upperRightPlacement,
                lowerRightPlacement,
                upperLeftPlacement,
            )
            .filter((ally) => ally.getId() !== unit.getId()).length;
        return (
            alliesPlacedCount <
            FightStateManager.getInstance().getFightProperties().getNumberOfUnitsAvailableForPlacement(action.team)
        );
    }
    protected canSplitUnitWithCommonRules(unit: Unit): boolean {
        const maxUnits = FightStateManager.getInstance()
            .getFightProperties()
            .getNumberOfUnitsAvailableForPlacement(unit.getTeam());
        const currentUnits = Array.from(this.unitsHolder.getAllUnits().values()).filter(
            (candidate) => candidate.getTeam() === unit.getTeam() && !candidate.isDead(),
        ).length;
        return currentUnits < maxUnits;
    }
    private applyGameAction(action: GameAction): boolean {
        const unitSnapshot = this.snapshotRenderableUnits();
        const result = this.createActionEngine().apply(action);
        this.applyTurnEngineEvents(result.events, unitSnapshot);
        return result.completed;
    }
    /**
     * Poison DoT tick VFX — the green damage number + drifting poison cloud on the poisoned unit. Shared by
     * the local engine-event loop (applyTurnEngineEvents, gated by shouldRenderPoisonInline) and the ranked
     * journal handler (RankedPlayScene.renderNewlyAppliedPoison) so the animation is written ONCE and fires
     * in both Sandbox and ranked play instead of drifting Sandbox-only.
     */
    protected renderPoisonTickVfx(unit: RenderableUnit, damage: number, unitsDied: number): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const pos = unit.getVisualCenter(gs);
        this.combatVisuals?.showFloatingDamage(
            pos,
            damage,
            undefined,
            unitsDied,
            "#7be639",
            "#123d0a",
            unit.getDamagePredictionAnchor(gs),
        );
        this.combatVisuals?.spawnPoisonCloud(pos, gs.getCellSize());
    }
    /**
     * Golden burst for a stack coming back — the Angel's cast Resurrection and a unit's own self-raise both
     * land here. Shared rather than inlined at each call site so ranked's live and replay paths render it
     * identically to the sandbox (the recurring "works in sandbox, missing in ranked" trap).
     */
    protected renderResurrectionVfx(position: HoCMath.XY, raisedCount?: number): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const cell = gs.getCellSize();
        const visualPosition = projectBattlefieldPoint(position, gs);
        this.combatVisuals?.spawnResurrectionBurst(visualPosition, cell);
        // A cast can restore HP without raising a whole unit (amount 0) — the burst alone covers that;
        // the head-count label only appears when stacks actually came back.
        if (raisedCount && raisedCount > 0) {
            // Above the ground rings (world +y is up) so the count rides the light column, not the unit.
            this.combatVisuals?.showResurrectedCount(
                { x: visualPosition.x, y: visualPosition.y + cell * 1.4 },
                raisedCount,
            );
        }
    }
    private applyTurnEngineEvents(events: GameEvent[], unitSnapshot: ReadonlyMap<string, RenderableUnit>): void {
        const armageddonWaves = new Set<number>();
        let shouldRefreshVisibleState = false;
        let sawFightFinished = false;
        let sawTurnCompleted = false;
        // Narrowing emits narrowing_applied BEFORE the unit_moved_by_system events in the same batch,
        // but the holes must be punched AFTER the force-moved units have vacated their border cells on
        // the grid (the engine's order is move-then-hole). Defer the hole render until after the loop so
        // syncSystemMovedUnit's grid cleanup can't wipe a freshly-placed hole.
        let pendingNarrowingLayers = 0;
        const activeUnitIdAtStart = this.currentActiveUnit?.getId();

        for (const event of events) {
            switch (event.type) {
                case "fight_started":
                    shouldRefreshVisibleState = true;
                    break;
                case "lap_initialized":
                case "lap_flipped":
                    this.hasInitializedLap = true;
                    shouldRefreshVisibleState = true;
                    break;
                case "center_dried":
                    this.dungeonVisuals.setCenterDried(true);
                    this.gridMatrix = this.grid.getMatrix();
                    this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
                    shouldRefreshVisibleState = true;
                    break;
                case "center_obstacle_cleared":
                    this.drawer.switchToDryCenter();
                    this.drawer.setGridType(GridVals.NORMAL);
                    this.gridMatrix = this.grid.getMatrix();
                    this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
                    shouldRefreshVisibleState = true;
                    break;
                case "narrowing_applied":
                    pendingNarrowingLayers = Math.max(pendingNarrowingLayers, event.layers);
                    shouldRefreshVisibleState = true;
                    break;
                case "unit_moved_by_system":
                    this.syncSystemMovedUnit(event.unitId, event.position, unitSnapshot);
                    break;
                case "unit_summoned":
                    this.syncSummonedUnit(event);
                    shouldRefreshVisibleState = true;
                    break;
                case "unit_destroyed":
                    this.destroyEventDeletedUnit(event.unitId, unitSnapshot);
                    shouldRefreshVisibleState = true;
                    break;
                case "poison_ticked": {
                    const poisoned = unitSnapshot.get(event.unitId);
                    if (poisoned && this.shouldRenderPoisonInline()) {
                        this.renderPoisonTickVfx(poisoned, event.damage, event.unitsDied);
                    }
                    shouldRefreshVisibleState = true;
                    break;
                }
                case "fire_wall_burned": {
                    // Read the position off the EVENT, not off the unit: a stack that burned to death is
                    // already gone from the holder by the time this runs, and it still owes a damage number.
                    this.combatVisuals?.showFloatingDamage(
                        projectBattlefieldPoint(event.position, this.sc_sceneSettings.getGridSettings()),
                        event.amount,
                        undefined,
                        event.unitsDied,
                        "#ffb347",
                        "#5a1500",
                    );
                    shouldRefreshVisibleState = true;
                    break;
                }
                case "unit_resurrected":
                    this.syncResurrectedUnit(event, unitSnapshot);
                    shouldRefreshVisibleState = true;
                    break;
                case "ability_stolen": {
                    // Predatory Assimilation can give an initially spell-less unit (Arachna Queen) its
                    // first castable card. Such a unit had no spellbook layer attached at creation, so
                    // RenderableUnit.parseSpells updated the logical spells but could not build their Pixi
                    // cells. Attach it as soon as the transfer event arrives; existing spellbooks are
                    // rebuilt idempotently and the target's parseSpells already removed transferred casts.
                    const thief =
                        (this.unitsHolder.getAllUnits().get(event.thiefId) as RenderableUnit | undefined) ??
                        unitSnapshot.get(event.thiefId);
                    if (thief?.getSpellsCount()) {
                        this.ensureDigitTextures();
                        if (this.digitTextures) {
                            thief.ensureSpellBookRendering(this.spellBookContainer, this.digitTextures);
                        }
                    }
                    // If either endpoint is open in the sidebar, publish its mutated mechanics now:
                    // the victim's card gains the permanent STOLEN wash, while the Queen gains the
                    // acquired card. A general visible-state refresh does not rebuild selected-unit
                    // properties, so without this the board VFX could finish before the sidebar caught up.
                    const selectedId = this.sc_selectedUnitProperties?.id;
                    if (selectedId === event.thiefId || selectedId === event.targetId) {
                        const selected =
                            (this.unitsHolder.getAllUnits().get(selectedId) as RenderableUnit | undefined) ??
                            unitSnapshot.get(selectedId);
                        if (selected) {
                            const props = { ...selected.getUnitProperties() };
                            this.sc_selectedUnitProperties = props;
                            this.setSelectedUnitProperties(props);
                            this.sc_unitPropertiesUpdateNeeded = true;
                        }
                    }
                    shouldRefreshVisibleState = true;
                    break;
                }
                case "armageddon_applied": {
                    // Ranked renders the wave VFX from the authoritative journal instead (the inline
                    // engine-event path doesn't fire reliably there); it overrides this hook to false.
                    if (this.shouldRenderArmageddonInline()) {
                        const unit = unitSnapshot.get(event.unitId);
                        if (unit) {
                            this.combatVisuals.showFloatingDamage(
                                unit.getVisualCenter(this.sc_sceneSettings.getGridSettings()),
                                event.damage,
                                undefined,
                                event.unitsDied,
                                undefined,
                                undefined,
                                unit.getDamagePredictionAnchor(this.sc_sceneSettings.getGridSettings()),
                            );
                        }
                        if (!armageddonWaves.has(event.wave)) {
                            armageddonWaves.add(event.wave);
                            this.triggerScreenShake(12 + event.wave * 3, 0.5);
                        }
                    }
                    break;
                }
                case "turn_completed":
                    if (this.currentActiveUnit?.getId() === event.unitId || activeUnitIdAtStart === event.unitId) {
                        this.finishTurnVisualState(event.hourglass);
                    }
                    // Re-arm the turn header: a unit re-selected on a LATER turn gets a fresh header,
                    // while a mid-turn re-selection (Double Shot's second volley) does not repeat it.
                    if (this.sandboxTurnLogHeaderUnitId === event.unitId) {
                        this.sandboxTurnLogHeaderUnitId = undefined;
                    }
                    // A turn finished by the human (not the AI mid-action) breaks the missed-turn streak
                    // that drives the sandbox AI takeover.
                    if (!this.aiController?.performingAction) {
                        this.sandboxConsecutiveTimeouts = 0;
                    }
                    sawTurnCompleted = true;
                    shouldRefreshVisibleState = true;
                    break;
                case "fight_finished":
                    sawFightFinished = true;
                    this.finishFight(event.winningTeam, { mechanicsAlreadyApplied: true });
                    shouldRefreshVisibleState = true;
                    break;
                case "obstacle_attacked": {
                    if (this.grid.hasScatteredMountains()) {
                        const destroyedCell = GridMath.getCellForPosition(
                            this.sc_sceneSettings.getGridSettings(),
                            event.targetPosition,
                        );
                        if (destroyedCell) {
                            this.grid.clearScatteredMountainAt(destroyedCell.x, destroyedCell.y);
                            this.dungeonVisuals?.removeScatteredMountainAt(destroyedCell.x, destroyedCell.y);
                            this.gridMatrix = this.grid.getMatrix();
                            this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
                        }
                        shouldRefreshVisibleState = true;
                        break;
                    }
                    // Reflect the recorded mountain damage authoritatively, so the center hit-bar drops
                    // during replay even though we don't re-run the strike through the engine.
                    // ensureCenterTerrainSprite() redraws the bar from this each frame, and hides a
                    // mountain entirely once its hits reach 0.
                    const obstacleFightProps = FightStateManager.getInstance().getFightProperties();
                    const gsObstacle = this.sc_sceneSettings.getGridSettings();
                    const nextHits = nextObstacleHits(
                        event,
                        {
                            left: obstacleFightProps.getObstacleHitsLeftLeft(),
                            right: obstacleFightProps.getObstacleHitsLeftRight(),
                        },
                        (gsObstacle.getMinX() + gsObstacle.getMaxX()) * 0.5,
                    );
                    obstacleFightProps.setObstacleHitsPerMountain(nextHits.left, nextHits.right);
                    // A mountain the server just destroyed has to stop blocking the board here too:
                    // ranked never runs the engine for the strike (which is what clears the side in
                    // sandbox), so without this its cells stay occupied — and the rock stays
                    // unattackable-through — until the next full board rebuild.
                    const clearedLeft = nextHits.left <= 0 && this.grid.clearMountainSide(false);
                    const clearedRight = nextHits.right <= 0 && this.grid.clearMountainSide(true);
                    if (clearedLeft || clearedRight) {
                        this.gridMatrix = this.grid.getMatrix();
                        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
                    }
                    shouldRefreshVisibleState = true;
                    break;
                }
                case "morale_applied":
                    // Lap-start Morale/Dismorale gets its own pop (excluded from the generic buff/debuff
                    // diff so it doesn't re-surface on later effects). Sandbox renders it live here; ranked
                    // renders it from the snapshot journal (renderNewlyAppliedMorale).
                    if (this.shouldRenderMoraleInline()) {
                        this.spawnMoralePop(event.unitId, event.kind);
                    }
                    shouldRefreshVisibleState = true;
                    break;
                case "unit_attacked":
                case "area_attacked":
                    // Attribute the kill (melee vs range + direction) before the same batch's
                    // unit_deleted / unit_destroyed teardown spawns the death visuals — the
                    // death-animation choice needs the blow recorded first.
                    this.noteDeathBlowsFromAttackEvent(event);
                    shouldRefreshVisibleState = true;
                    break;
                case "unit_skipped":
                case "unit_waited":
                case "unit_defended":
                case "attack_type_selected":
                case "unit_moved":
                case "unit_placed":
                case "unit_split":
                    shouldRefreshVisibleState = true;
                    break;
                case "next_unit_selected":
                    // Turn grouping: open the incoming unit's header in the scene log. updateLog is the
                    // engine/replay text channel, which ranked suppresses — there the header comes from
                    // the authoritative journal instead (buildAuthoritativeSceneLogLines), so this line
                    // can never double up.
                    this.pushSandboxTurnLogHeader(event.unitId);
                    shouldRefreshVisibleState = true;
                    break;
                case "spell_cast":
                    // A RESURRECT cast reports what it raised; play the burst over each stack it brought back.
                    for (const raised of event.resurrected ?? []) {
                        this.renderResurrectionVfx(raised.position, raised.amount);
                    }
                    this.syncAbilityTransferUi(event, unitSnapshot);
                    shouldRefreshVisibleState = true;
                    break;
                case "vine_placed": {
                    // Throw the dart from the caster to the victim. Fire-and-forget: the terrain vine is
                    // owned by VineLayer off the authoritative store and creeps in behind the flight, so
                    // nothing downstream has to wait on the animation.
                    const caster = this.unitsHolder.getAllUnits().get(event.casterId);
                    const gsVineShot = this.sc_sceneSettings.getGridSettings();
                    const fromCell = caster?.getBaseCell();
                    const toCell = event.cells[event.cells.length - 1];
                    const fromLogical = fromCell
                        ? GridMath.getPositionForCell(
                              fromCell,
                              gsVineShot.getMinX(),
                              gsVineShot.getStep(),
                              gsVineShot.getHalfStep(),
                          )
                        : undefined;
                    const toLogical = toCell
                        ? GridMath.getPositionForCell(
                              toCell,
                              gsVineShot.getMinX(),
                              gsVineShot.getStep(),
                              gsVineShot.getHalfStep(),
                          )
                        : undefined;
                    if (fromLogical && toLogical) {
                        const to = projectBattlefieldPoint(toLogical, gsVineShot);
                        const from =
                            caster instanceof RenderableUnit
                                ? caster.getRangedProjectileOrigin(to, gsVineShot)
                                : projectBattlefieldPoint(fromLogical, gsVineShot);
                        void this.rangedProjectiles.fire({ from, to, big: false, vine: true });
                        // Magic armor shrugged the snare off: the vine still painted the ground, so the save
                        // needs its own tell or the throw looks identical either way. LIVE path only — during
                        // replay these events come from the best-effort local re-apply, which RE-ROLLS the
                        // save, so a pop from here would show each player a different outcome. The replay
                        // renders it from the authoritative record instead (renderSnareResistVfx).
                        if (event.snareResisted && !this.replayPlaybackActive) {
                            this.showSnareResistedVfx(event.targetId, from);
                        }
                    }
                    shouldRefreshVisibleState = true;
                    break;
                }
                case "unit_deleted":
                    this.destroyEventDeletedUnit(event.unitId, unitSnapshot);
                    shouldRefreshVisibleState = true;
                    break;
            }
        }

        // Punch the narrowing holes now that the force-moved units have left their border cells on the
        // grid (see pendingNarrowingLayers above), so the vacated cells become holes and the units'
        // new cells stay occupied.
        if (pendingNarrowingLayers > 0) {
            this.renderNarrowingLayers(pendingNarrowingLayers);
            this.gridMatrix = this.grid.getMatrix();
            this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        }

        if (shouldRefreshVisibleState) {
            this.refreshVisibleStateIfNeeded(true);
            if (!sawFightFinished) {
                this.updateLiveFightStats();
            }
        }

        // Pop an icon + name (and colour-wash the target) for any debuff or buff that just landed this
        // action, e.g. Beholder's Spit Ball. Local sandbox only: ranked drives the same visuals from
        // authoritative snapshots (processDebuffPops), and a sandbox replay re-applies events whose
        // effects were already shown live, so skip both (matches the eager-handoff guard below).
        if (!this.sc_gameActionTransport && !this.replayPlaybackActive) {
            this.reconcileEffectVisuals();
        }
        this.flushPendingReplayRecords();

        // Hand off to the next unit in the same tick a turn completes, instead of waiting for the
        // next Step() frame to pick it up. The deferral was a small but noticeable lag between a
        // unit finishing (attack/spell/wait/manual end-turn/timeout) and the next unit becoming
        // active. The move path already advances eagerly (finishMovedUnitTurn), so this also makes
        // every turn-ending action consistent. Local-sandbox only: replay drives its own
        // sequencing and ranked is snapshot/transport-driven, so leave those untouched.
        if (
            sawTurnCompleted &&
            !this.currentActiveUnit &&
            !this.isAdvancingTurnEvents &&
            !this.replayPlaybackActive &&
            !this.sc_gameActionTransport &&
            !sawFightFinished
        ) {
            this.isAdvancingTurnEvents = true;
            try {
                this.advanceAfterNoActiveUnitIfNeeded();
            } finally {
                this.isAdvancingTurnEvents = false;
            }
        }
    }
    private renderNarrowingLayers(layers: number): void {
        this.attachToWorldRoot(this.dungeonVisuals.getHoleContainer(), 20);
        for (let layer = 1; layer <= layers; layer++) {
            if (this.drawnNarrowingLaps.has(layer)) {
                continue;
            }
            this.dungeonVisuals.spawnHoleLayer(layer);
            this.occupyNarrowingLayer(layer);
            this.drawnNarrowingLaps.add(layer);
            this.moveFiresInward(layer);
        }
        this.dungeonVisuals.setNarrowingLayers(layers);
    }
    /**
     * Reconcile the rendered map narrowing to an authoritative snapshot value. Idempotent
     * (renderNarrowingLayers skips already-drawn layers), so ranked can call this on every
     * snapshot to catch up regardless of which action triggered the narrowing — and even when
     * the destructive board rebuild that normally renders it was skipped.
     */
    protected applyAuthoritativeNarrowing(narrowingLayers: number): void {
        if (narrowingLayers > 0 && !this.drawnNarrowingLaps.has(narrowingLayers)) {
            this.renderNarrowingLayers(narrowingLayers);
            this.gridMatrix = this.grid.getMatrix();
            this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        }
    }
    private occupyNarrowingLayer(layer: number): void {
        const gs = this.grid.getSettings();
        const minCellX = gs.getMinX() / gs.getCellSize();
        const maxCellX = gs.getMaxX() / gs.getCellSize();
        const minCellY = gs.getMinY() / gs.getCellSize();
        const maxCellY = gs.getMaxY() / gs.getCellSize();
        const offset = layer - 1;

        for (let i = minCellX + offset; i < maxCellX - offset; i++) {
            this.grid.occupyByHole({ x: i + maxCellX, y: offset });
            this.grid.occupyByHole({ x: i + maxCellX, y: maxCellY - layer });
        }
        for (let i = minCellY + offset; i < maxCellY - offset; i++) {
            this.grid.occupyByHole({ x: offset, y: i });
            this.grid.occupyByHole({ x: (maxCellX << 1) - layer, y: i });
        }
    }
    private syncSystemMovedUnit(
        unitId: string,
        position: HoCMath.XY,
        unitSnapshot: ReadonlyMap<string, RenderableUnit>,
    ): void {
        const unit =
            (this.unitsHolder.getAllUnits().get(unitId) as RenderableUnit | undefined) ?? unitSnapshot.get(unitId);
        if (!unit) {
            return;
        }
        // Reposition on the GRID, not just visually. Map narrowing force-moves a unit off a cell that
        // becomes a hole; if we move only the sprite, the grid still records the unit on its old cell
        // and treats the new cell as empty — so the active unit's move preview proposes a destination
        // silhouette right on top of the freshly force-moved unit, and pathing reads a stale board.
        // Clean the old occupancy, commit the new position, then re-occupy the destination cells.
        this.grid.cleanupAll(unit.getId(), unit.getAttackRange(), unit.isSmallSize());
        unit.setPosition(position.x, position.y);
        unit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
        // Authoritative force-move destination — always stamp; see hydrateSceneState on why deriving
        // lava/water permission locally fails for granted abilities (Lava Striders' "Made of Fire").
        this.grid.occupyCells(unit.getCells(), unit.getId(), unit.getTeam(), unit.getAttackRange(), true, true);
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
    }
    private syncSummonedUnit(event: Extract<GameEvent, { type: "unit_summoned" }>): void {
        const unit = this.unitsHolder.getAllUnits().get(event.unitId) as RenderableUnit | undefined;
        if (!unit) {
            return;
        }

        unit.setPosition(event.position.x, event.position.y);
        // Commit occupancy when this event is reached, after any preceding unit_destroyed event has freed the
        // corpse cells (Infest). A live sandbox summon is already registered; cleanup + authoritative re-stamp
        // is idempotent and also repairs a ranked replay that arrived on a stale local grid.
        if (event.cells.length) {
            this.grid.cleanupAll(unit.getId(), unit.getAttackRange(), unit.isSmallSize());
            // A refused occupy leaves the summon VISIBLE but absent from the grid: unhoverable,
            // untargetable, and standing on cells the board still believes are free — and the refusal used
            // to be discarded. The event's cells are authoritative, so a refusal means they disagree with
            // the body built here (a partial footprint, or a shape this client does not give the creature):
            // retry on the unit's own footprint, and report it if even that is rejected rather than leaving
            // the stack off the board in silence.
            if (!this.grid.occupyCells(event.cells, unit.getId(), unit.getTeam(), unit.getAttackRange(), true, true)) {
                const own = unit.getCells();
                if (!this.grid.occupyCells(own, unit.getId(), unit.getTeam(), unit.getAttackRange(), true, true)) {
                    console.error(
                        `Critical: summoned ${unit.getName()} could not occupy its ${own.length}-cell footprint`,
                    );
                }
            }
        }
        this.layoutVersion++;
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        if (unit.getSpellsCount() > 0) {
            this.ensureDigitTextures();
            if (this.digitTextures) {
                unit.setSpellBookLayer(this.spellBookContainer, this.digitTextures);
            }
        }
        const scale = unit.ensureVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
        if (!event.merged && scale) {
            unit.startSpawnAnimation(scale);
        } else {
            unit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
        }
        this.refreshUnits();
    }
    /**
     * Remove "ghost" units: still on the local board but absent from the authoritative unit set (the
     * server killed/removed them, but a skip-rebuild snapshot only refreshed stats and never tore them
     * down). The full server snapshot lists every live unit, so an absent id mid-fight is genuinely
     * gone. This is a PURE removal — no live unit ever moves — so it cannot reintroduce the teleport the
     * skip-rebuild path exists to avoid, while it stops the AI (and targeting) acting on a unit the
     * server no longer has, which it rejects as unit_not_found.
     */
    protected reconcileGhostUnits(presentIds: Set<string>): void {
        if (this.unitsHolder.getAllUnits().size === presentIds.size) {
            return;
        }
        let removed = false;
        for (const unit of [...this.unitsHolder.getAllUnits().values()] as RenderableUnit[]) {
            if (presentIds.has(unit.getId())) {
                continue;
            }
            unit.destroyVisuals();
            this.grid.cleanupAll(unit.getId(), unit.getAttackRange(), unit.isSmallSize());
            this.unitsHolder.deleteUnitById(unit.getId());
            removed = true;
        }
        if (removed) {
            this.gridMatrix = this.grid.getMatrix();
            this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
            this.refreshUnits();
            this.sc_visibleStateUpdateNeeded = true;
        }
    }
    private destroyEventDeletedUnit(unitId: string, unitSnapshot: ReadonlyMap<string, RenderableUnit>): void {
        const unit = unitSnapshot.get(unitId);
        if (!unit) {
            return;
        }

        const customDeathPlaying = this.playCustomDeathAnimation(unit);
        if (!customDeathPlaying) {
            // Death visuals (mirror shatter, or a kill-specific cleave/dissolve when the lethal blow was
            // noted) from the unit's current sprite before tearing it down.
            const shatterInfo = unit.getShatterInfo();
            if (shatterInfo) {
                this.combatVisuals?.spawnDeathVfx(shatterInfo, unitId, unit.hasStatusEffect("Freeze"));
            }
        }

        this.layoutVersion++;
        if (!customDeathPlaying) {
            unit.destroyVisuals();
        }
        if (this.selectedBoardUnit === unit) {
            this.selectedBoardUnit = undefined;
        }
        if (this.currentShiftedUnit === unit) {
            this.currentShiftedUnit = undefined;
        }
        if (this.currentActiveUnit === unit) {
            this.currentActiveUnit = undefined;
        }
    }
    private syncResurrectedUnit(
        event: Extract<GameEvent, { type: "unit_resurrected" }>,
        unitSnapshot: ReadonlyMap<string, RenderableUnit>,
    ): void {
        const unit =
            (this.unitsHolder.getAllUnits().get(event.unitId) as RenderableUnit | undefined) ??
            unitSnapshot.get(event.unitId);
        if (!unit) {
            return;
        }

        unit.setPosition(event.position.x, event.position.y);
        // Restore the LOGICAL stack too, not just the sprite: in ranked the replay has already applied
        // the lethal hit (amount 0 -> isDead()), and the raise event is the authority on what came back.
        // Without this the freshly-raised unit read as DEAD until the next snapshot's stat apply — a
        // window where any dead-unit cull (activation checks, targeting, a ghost reconcile racing this
        // animation) dropped the stack entirely. Idempotent in sandbox, where the local engine already
        // revived it to exactly these values.
        const stackTotal = unit.getAmountAlive() + unit.getAmountDied();
        unit.setRemainingStats(event.amount, event.hp, Math.max(0, stackTotal - event.amount));
        unit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
        this.renderResurrectionVfx(event.position, event.amount);
        unit.playOneShotAnimation("death", () => {
            unit.setVisualGhost(true);
            setTimeout(() => {
                const currentScale = unit.getCurrentVisualScale();
                unit.setVisualGhost(false);
                unit.startSpawnAnimation(currentScale);
            }, 2500);
        });
    }
    /**
     * Override the UpNext turn queue. Sandbox returns undefined so the engine-maintained
     * fightProperties queue is used. Ranked (snapshot-driven, no local turn loop) overrides
     * this to supply the authoritative queue from the server snapshot.
     */
    protected getUpNextUnitIds(): string[] | undefined {
        return undefined;
    }
    /**
     * Hourglass can only defer behind another living teammate that still has a real turn pending this lap.
     * Ranked uses the server queue plus per-unit hourglass flags; sandbox can ask its local engine state.
     */
    private hasUnactedTeammateInCurrentLap(unit: Unit): boolean {
        const fightProperties = FightStateManager.getInstance().getFightProperties();
        const allUnits = this.unitsHolder.getAllUnits();
        const upNextOverride = this.getUpNextUnitIds();
        if (upNextOverride === undefined) {
            return fightProperties.hasUnactedTeammate(unit.getTeam(), unit.getId(), allUnits);
        }
        if (fightProperties.getTeamUnitsAlive(unit.getTeam()) <= 1) {
            return false;
        }
        for (const unitId of upNextOverride) {
            const queuedUnit = allUnits.get(unitId);
            if (
                unitId !== unit.getId() &&
                queuedUnit &&
                !queuedUnit.isDead() &&
                queuedUnit.getTeam() === unit.getTeam()
            ) {
                return true;
            }
        }
        // Server snapshots publish the normal up-next queue separately; teammates already waiting on
        // hourglass are still pending later in the lap and are identified by their authoritative unit flag.
        for (const queuedUnit of allUnits.values()) {
            if (
                queuedUnit.getId() !== unit.getId() &&
                !queuedUnit.isDead() &&
                queuedUnit.getTeam() === unit.getTeam() &&
                queuedUnit.isOnHourglass()
            ) {
                return true;
            }
        }
        return false;
    }
    protected syncAuthoritativeActiveUnit(currentUnitId: string | undefined, lapNumber?: number): void {
        if (!currentUnitId) {
            return;
        }

        const activeUnit = this.unitsHolder.getAllUnits().get(currentUnitId) as RenderableUnit | undefined;
        if (!activeUnit || activeUnit.isDead()) {
            return;
        }

        this.handleNextUnitActivation(activeUnit);
        if (this.sc_visibleState && lapNumber !== undefined) {
            this.sc_visibleState.lapNumber = Math.max(lapNumber || 0, 0);
            this.sc_visibleStateUpdateNeeded = true;
        }
    }
    private handleNextUnitActivation(nextUnit: RenderableUnit): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const gs = this.sc_sceneSettings.getGridSettings();
        const worldRoot = this.drawer.getUnitsContainer();

        // Re-activating the unit that's already active (ranked replays this on every snapshot
        // echo, even mid-turn) must not wipe a manual attack-type switch — see the
        // refreshPossibleAttackTypes() call below.
        const reactivatingSameUnit = this.currentActiveUnit === nextUnit;

        // Clear any shift-selected unit on a genuine turn change so the sidebar reverts to the active
        // unit. On a re-activation of the already-active unit (ranked replays this on every snapshot
        // echo mid-turn) we must NOT clear it — otherwise a shift-select opened to inspect another
        // unit's stats is wiped on the next snapshot and the sidebar snaps back to the active unit.
        if (!reactivatingSameUnit) {
            this.currentShiftedUnit = undefined;
            // A genuine turn change must never inherit the previous unit's aim preview (attack arrow /
            // damage prediction / target highlights) — hover() only reconciles on a canvas mouse-move,
            // so a resting cursor left the old unit's arrow on the board for the whole next turn. A
            // same-unit re-activation must NOT clear: it would wipe the player's live aim on every
            // ranked snapshot echo. Mirrors the finishTurnVisualState cleanup for paths (e.g. a ranked
            // snapshot advancing the turn without a local turn_completed event) that skip it.
            this.hoverManager.clearAttackVisuals();
            this.hoverManager.hoverAttackFromCell = undefined;
            this.hoverRangeAttackObstacle = undefined;
            // The BOARD SELECTION follows the turn too: leaving the previous unit selected kept its
            // sidebar panel open and its aura/attack-range inspection rings painted through the whole
            // next turn (drawGameplayVisuals draws them for any selected non-active unit). Selecting
            // the new active unit matches the sidebar hand-off below; inspection-only, so no drag /
            // placement state is armed.
            if (this.selectedBoardUnit && this.selectedBoardUnit !== nextUnit) {
                this.selectedBoardUnit.setBoardSelected(false);
            }
            this.selectedBoardUnit = nextUnit;
            this.hasActiveSelection = false;
            this.selectionFromOverlay = false;
            this.draggingUnitId = undefined;
            this.draggingUnitTeam = undefined;
        }

        if (this.currentActiveUnit && !reactivatingSameUnit) {
            this.currentActiveUnit.setActiveTurn(false);
            this.currentActiveUnit.syncVisual(worldRoot, gs);
        }
        this.currentActiveUnit = nextUnit;
        // Reassert this even for a same-unit ranked snapshot echo. Replay/hydration paths may assign
        // currentActiveUnit before the authoritative activation arrives; treating that as an already-active
        // reactivation left isActiveTurn false, so the flag neither enlarged nor received its gold glow.
        // setActiveTurn is idempotent and preserves the current animation phase when it is already true.
        nextUnit.setActiveTurn(true);
        // Red aura on the enemy's turn, white on yours, so the pulsing ring telegraphs whose turn it is.
        nextUnit.setActiveAuraColor(this.isEnemyActiveTurn() ? ENEMY_TURN_HIGHLIGHT_COLOR : 0xffffff);
        nextUnit.syncVisual(worldRoot, gs);

        const unitsNext: IVisibleUnit[] = [];
        const seenUnitIds = new Set<string>([nextUnit.getId()]);
        const upNextOverride = this.getUpNextUnitIds();
        const upNextQueue =
            upNextOverride ?? FightStateManager.getInstance().getFightProperties().getUpNextQueueIterable();
        for (const unitIdNext of upNextQueue) {
            if (seenUnitIds.has(unitIdNext)) continue;
            seenUnitIds.add(unitIdNext);
            const unitNext = this.unitsHolder.getAllUnits().get(unitIdNext);
            if (!unitNext) continue;
            unitsNext.unshift({
                id: unitNext.getId(),
                amount: unitNext.getAmountAlive(),
                smallTextureName: unitNext.getSmallTextureName(),
                name: unitNext.getName(),
                teamType: unitNext.getTeam(),
                isOnHourglass: unitNext.isOnHourglass(),
                isSkipping: unitNext.isSkippingThisTurn(),
                stackPower: unitNext.getStackPower(),
                isStackPowered: unitNext.getStackPower() > 0,
            });
        }
        if (nextUnit) {
            unitsNext.push({
                id: nextUnit.getId(),
                amount: nextUnit.getAmountAlive(),
                smallTextureName: nextUnit.getSmallTextureName(),
                name: nextUnit.getName(),
                teamType: nextUnit.getTeam(),
                isOnHourglass: nextUnit.isOnHourglass(),
                isSkipping: nextUnit.isSkippingThisTurn(),
                stackPower: nextUnit.getStackPower(),
                isStackPowered: nextUnit.getStackPower() > 0,
            });
        }
        if (this.sc_visibleState) {
            this.sc_visibleState.upNext = unitsNext;
            this.sc_visibleState.teamTypeTurn = nextUnit.getTeam();
            this.sc_visibleState.lapNumber = fightProps.hasFightStarted() ? fightProps.getCurrentLap() : 0;
            // Whether the active team can still extend its clock this lap — computed for the ACTIVE team
            // (checkOnly=true never mutates). The prior code passed `undefined`, so this was always false
            // and the "Use additional time" button never appeared. Ranked additionally restricts this to
            // the viewer's own turn (canOfferAdditionalTimeForTeam) so it can't extend the opponent's clock.
            this.sc_visibleState.canRequestAdditionalTime =
                fightProps.hasFightStarted() &&
                this.canOfferAdditionalTimeForTeam(nextUnit.getTeam()) &&
                !!fightProps.requestAdditionalTurnTime(nextUnit.getTeam(), true);
            this.sc_visibleStateUpdateNeeded = true;
        }

        if (nextUnit.isSkippingThisTurn()) {
            // A skipping unit's activation must still release the turn-transition button lock —
            // otherwise the whole toolbar (including the AI toggle) stays dead until the next
            // non-skipping unit activates.
            this.buttonManager.setButtonsRefreshLocked(false);
            return;
        }

        // Announce Paralysis the moment the afflicted unit's turn starts — without an explicit cue the
        // board silently ignores move clicks and the player can't tell why their unit "won't move"
        // (the hover popover adds a persistent "Paralyzed" hint on top of this). Genuine activations
        // only: ranked re-runs this for the same unit on every snapshot echo mid-turn.
        if (!reactivatingSameUnit && nextUnit.hasStatusApplied("Paralysis")) {
            this.sc_sceneLog.updateLog(`${nextUnit.getName()} is paralyzed and cannot move this turn`);
            this.popEffectOnUnit(nextUnit, "Paralysis", 0, "debuff");
        }

        this.sc_moveBlocked = false;
        const tRefresh = performance.now();
        this.refreshUnits();
        this.turnTrace("refreshUnits (augments+artifacts+auras x2)", tRefresh);
        const tGrid = performance.now();
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        this.turnTrace("grid.getMatrix x2", tGrid);
        nextUnit.setBoardSelected(true);
        const tVis = performance.now();
        this.refreshVisibleStateIfNeeded();
        this.turnTrace("refreshVisibleStateIfNeeded (React)", tVis);
        this.currentActiveUnit = nextUnit;
        this.buttonManager.setButtonsRefreshLocked(false);

        // Show the active unit's stats in the sidebar — but never override a shift-select the player
        // opened to inspect another unit (preserved across same-unit re-activations above), or the
        // ranked snapshot echo would snap the sidebar straight back to the active unit.
        if (!reactivatingSameUnit || !this.currentShiftedUnit) {
            const props = nextUnit.getUnitProperties();
            this.sc_selectedUnitProperties = props;
            this.setSelectedUnitProperties(props);
            this.sc_unitPropertiesUpdateNeeded = true;
        }

        const tPath = performance.now();
        const canLandRange =
            this.attackHandler?.canLandRangeAttack(nextUnit, this.grid.getEnemyAggrMatrixByUnitId(nextUnit.getId())) ??
            false;
        // refreshPossibleAttackTypes() resets the selection to possibleAttackTypes[0] (the
        // default, e.g. RANGE for a thrower like Gargantuan). When this is just a re-activation
        // of the already-active unit, restore the player's current pick so a manual attack-type
        // switch survives the next authoritative snapshot instead of silently reverting.
        const priorAttackTypeSelection = nextUnit.getAttackTypeSelection();
        nextUnit.refreshPossibleAttackTypes(canLandRange);
        if (reactivatingSameUnit && nextUnit.getPossibleAttackTypes().includes(priorAttackTypeSelection)) {
            nextUnit.selectAttackType(priorAttackTypeSelection);
        }

        // The anchor, not the cell under the centre — see refreshActiveUnitReach.
        const currentCell = nextUnit.getBaseCell();
        if (currentCell) {
            this.updateCurrentMovePath(currentCell);
        }

        const rangeShotCells = nextUnit.getRangeShotDistance();
        if (rangeShotCells > 0) {
            this.sc_currentActiveShotRange = fullDamageShotRangeForFootprint(
                nextUnit.getPosition(),
                rangeShotCells,
                nextUnit.getFootprintWidth(),
                nextUnit.getFootprintHeight(),
            );
        } else {
            this.sc_currentActiveShotRange = undefined;
        }

        this.buttonManager.setButtonsRefreshLocked(false);
        this.buttonManager.refreshButtons(true);
        this.turnTrace("aggro+path+attackTypes+buttons", tPath);
    }
    /**
     * Aggr forced-target gate for attack HIGHLIGHTS. An aggravated unit (getTarget() set + target alive) can
     * only attack the unit that aggr'd it, so no other enemy should draw a red attack highlight — mirrors the
     * canAttackBy*Targets forced-target filter in updateCurrentMovePath. Returns true (attackable) when there
     * is no active forced target, when the lock has released (target dead/gone), or when this IS the target.
     */
    private isAttackableUnderForcedTarget(targetUnit: Unit): boolean {
        // Terrifying Gaze is the mirror image of Aggr and is checked first: it removes exactly one enemy from
        // the attackable set instead of narrowing the set down to one.
        if (this.currentActiveUnit?.cannotAttackUnitId(targetUnit.getId())) {
            return false;
        }
        const forcedTargetId = this.currentActiveUnit?.getTarget();
        if (!forcedTargetId) {
            return true;
        }
        const forcedTarget = this.unitsHolder.getAllUnits().get(forcedTargetId);
        if (!forcedTarget || forcedTarget.isDead()) {
            return true;
        }
        return targetUnit.getId() === forcedTargetId;
    }
    // Cowardice: the active unit cannot attack a stack with MORE cumulative HP than itself — the engine
    // rejects such strikes (cause "cowardice"; see handlers/attack_handler.ts and the AI candidate guards).
    // Mirrors that rule client-side so the melee/range attack hover visual never highlights a target the
    // debuff makes illegal. Only the aimed/primary target is checked (AOE splash onto stronger stacks is fine).
    private isCowardiceBlockedTarget(targetUnit: Unit): boolean {
        const active = this.currentActiveUnit;
        // hasStatusApplied: Cowardice arrives from Spit Ball in combat, so in ranked the OBJECT array is
        // empty and this guard never fired — the very mirroring it exists for was sandbox-only, and ranked
        // highlighted targets the server then rejected.
        if (!active || !active.hasStatusApplied("Cowardice")) {
            return false;
        }
        return active.getCumulativeHp() < targetUnit.getCumulativeHp();
    }
    /**
     * Start a screen shake (decaying random offset of the world root). Re-triggering while a
     * shake is in progress takes the stronger/longer of the two so waves don't cut each other off.
     */
    public triggerScreenShake(magnitude = 16, durationSeconds = 0.5): void {
        this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
        this.shakeDuration = Math.max(this.shakeDuration, durationSeconds);
        this.shakeTimeLeft = this.shakeDuration;
    }
    private updateScreenShake(timeStep: number): void {
        const worldRoot = this.pixiApp.getWorldRoot();
        // Undo the previous frame's offset first so the world's base position is preserved.
        worldRoot.x -= this.appliedShakeX;
        worldRoot.y -= this.appliedShakeY;
        this.appliedShakeX = 0;
        this.appliedShakeY = 0;
        if (this.shakeTimeLeft <= 0) {
            return;
        }
        this.shakeTimeLeft = Math.max(0, this.shakeTimeLeft - timeStep);
        const progress = this.shakeDuration > 0 ? this.shakeTimeLeft / this.shakeDuration : 0; // 1 -> 0
        const amplitude = this.shakeMagnitude * progress; // linear decay to zero
        const offsetX = (Math.random() * 2 - 1) * amplitude;
        const offsetY = (Math.random() * 2 - 1) * amplitude;
        worldRoot.x += offsetX;
        worldRoot.y += offsetY;
        this.appliedShakeX = offsetX;
        this.appliedShakeY = offsetY;
        if (this.shakeTimeLeft <= 0) {
            this.shakeMagnitude = 0;
            this.shakeDuration = 0;
        }
    }
    private drawPlacements(): void {
        SandboxDrawer.drawPlacements({
            fightProps: FightStateManager.getInstance().getFightProperties(),
            placementManager: this.placementManager,
            hoverManager: this.hoverManager,
            placementGraphics: this.placementGraphics,
            placementFrameContainer: this.placementFrameContainer,
            restrictToTeam: this.getPlacementDrawTeam(),
            showTeamPlacementZones: Sandbox.DRAW_TEAM_PLACEMENT_ZONES && !isBattlefieldShadowEditorActive(),
        });
        this.drawPlacementSplitOverlay();
    }
    /**
     * Which team's placement zone should be drawn. Undefined draws both (sandbox). Ranked play
     * restricts this to the viewer's team so the opponent's placement area is never shown.
     */
    protected getPlacementDrawTeam(): TeamType | undefined {
        return undefined;
    }
    private checkStartCondition(): void {
        let lowerAllowed = false;
        let upperAllowed = false;
        const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
        const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
        if (!this.sc_renderSpellBookOverlay && lowerLeftPlacement && upperRightPlacement) {
            const lowerRightPlacement = this.getPlacement(TeamVals.LOWER, 1);
            const upperLeftPlacement = this.getPlacement(TeamVals.UPPER, 1);
            const isRealPlacedUnit = (unit: Unit) => !this.revealedOpponentUnitIds.has(unit.getId());

            // Use the exact footprint/cell validation used by startScene(). The former UI-only check
            // tested the rendered ground point, which can sit outside the placement rectangle after
            // perspective/framing changes even while every occupied cell is valid. That left START
            // disabled for a board the fight engine itself considered startable.
            lowerAllowed = this.unitsHolder
                .getAllAlliesPlaced(
                    TeamVals.LOWER,
                    lowerLeftPlacement,
                    upperRightPlacement,
                    lowerRightPlacement,
                    upperLeftPlacement,
                )
                .some(isRealPlacedUnit);
            upperAllowed = this.unitsHolder
                .getAllAlliesPlaced(
                    TeamVals.UPPER,
                    lowerLeftPlacement,
                    upperRightPlacement,
                    lowerRightPlacement,
                    upperLeftPlacement,
                )
                .some(isRealPlacedUnit);
        }
        if (lowerAllowed && upperAllowed) {
            if (this.sc_visibleState) {
                if (!this.sc_visibleState.canBeStarted) {
                    this.sc_visibleState.canBeStarted = true;
                    this.sc_visibleStateUpdateNeeded = true;
                }
            }
        } else {
            if (this.sc_visibleState) {
                if (this.sc_visibleState.canBeStarted) {
                    this.sc_visibleState.canBeStarted = false;
                    this.sc_visibleStateUpdateNeeded = true;
                }
            }
        }
        // Connect exactly once: checkStartCondition runs every pre-fight frame, and Signal.connect
        // appends a handler with no dedup, so re-connecting here leaked a handler per frame.
        if (this.startListenerConnected) {
            return;
        }
        this.startListenerConnected = true;
        this.sc_onHasStarted.connect((started) => {
            // Trigger Dungeon Atmosphere
            this.updateDungeonAtmosphere(started, this.atmosphereAlpha);

            if (this.sc_visibleState) {
                this.sc_visibleState.canBeStarted = false;
                // Only a fight actually STARTING re-arms the finished flag. This shared signal also
                // fires with started=false after EVERY post-finish authoritative snapshot apply
                // (PixiGameManager emits started = fightStarted && !fightFinished), and resetting
                // hasFinished there reverted the just-published fight result in the same tick —
                // hiding the ranked results overlay at the live finish. (Cold loads of a finished
                // game were unaffected only because this pre-fight listener never connects there.)
                if (started) {
                    this.sc_visibleState.hasFinished = false;
                }
                this.sc_visibleStateUpdateNeeded = true;
            }
            // If fight ended (started=false), ensure we reset
            if (!started) {
                // Clear state
                this.currentActiveUnit = undefined;
                this.currentActiveSpell = undefined;
                this.cleanActivePaths();
                this.hoverManager.clear();
            }
        });
    }
    public override getDamageStatisics(): IDamageStatistic[] {
        return this.attackHandler.getDamageStatisticHolder().get();
    }
    // Turn-handoff perf trace. Enable at runtime from devtools: `window.__hocTurnTrace = true`, then take a
    // turn — each phase logs `[turn-lag] <phase>: <ms>` so we can see what dominates the pass-to-next-unit lag.
    protected turnTrace(label: string, startMs: number): void {
        if (typeof window !== "undefined" && (window as unknown as { __hocTurnTrace?: boolean }).__hocTurnTrace) {
            console.log(`[turn-lag] ${label}: ${(performance.now() - startMs).toFixed(1)}ms`);
        }
    }
    /**
     * Play this fight's one grace turn: hourglass if the engine accepts it, Luck Shield if not. The engine
     * owns "is the hourglass available" (wait_turn rejects with `hourglass_not_available` when the unit has
     * no unacted teammate, already waited this round, etc.), so this asks rather than re-deriving the rule.
     * Both actions complete the unit's turn, so neither can leave it dangling into another timeout.
     *
     * Returns false only if the engine refused BOTH, leaving the caller to fall back to the AI.
     */
    private runSandboxGraceTurn(): boolean {
        if (!this.currentActiveUnit) {
            return false;
        }
        const unitId = this.currentActiveUnit.getId();
        const actions: GameAction[] = [
            { type: "wait_turn", unitId },
            { type: "defend_turn", unitId },
        ];
        for (const action of actions) {
            const unitSnapshot = this.snapshotRenderableUnits();
            const result = this.createActionEngine().apply(action);
            if (result.completed) {
                this.applyTurnEngineEvents(result.events, unitSnapshot);
                return true;
            }
        }
        return false;
    }
    protected finishTurn = (isHourglass = false, skipReason?: "effect" | "timeout"): void => {
        if (!this.currentActiveUnit) {
            this.finishTurnVisualState(isHourglass);
            return;
        }

        const action: GameAction = isHourglass
            ? { type: "wait_turn", unitId: this.currentActiveUnit.getId() }
            : {
                  type: "end_turn",
                  unitId: this.currentActiveUnit.getId(),
                  reason: skipReason ?? "manual",
              };
        const tFinish = performance.now();
        const unitSnapshot = this.snapshotRenderableUnits();
        this.turnTrace("snapshotRenderableUnits", tFinish);
        const tApply = performance.now();
        const result = this.createActionEngine().apply(action);
        this.turnTrace("engine.apply(end_turn)", tApply);
        if (!result.completed) {
            this.sc_sceneLog.updateLog(result.message ?? `Cannot finish turn: ${result.rejectionReason ?? "unknown"}`);
            return;
        }
        const tEvents = performance.now();
        this.applyTurnEngineEvents(result.events, unitSnapshot);
        this.turnTrace("applyTurnEngineEvents", tEvents);
        this.turnTrace("finishTurn TOTAL", tFinish);
    };
    private finishTurnVisualState(_isHourglass = false): void {
        this.buttonManager.setButtonsRefreshLocked(true);
        this.sc_currentActiveShotRange = undefined;
        if (this.currentActiveUnit) {
            this.currentActiveUnit.setBoardSelected(false);
        }
        this.hoverRangeAttackDivisors = [];
        this.currentActiveSpell = undefined;
        this.currentEnemiesCellsWithinMovementRange = undefined;
        // The finished unit's aim previews are definitionally stale — and hover() only runs on a canvas
        // mouse-move (never while sc_isAnimating), so nothing else clears them when the cursor is
        // resting or parked on the HTML toolbar. Without this, the old unit's attack arrow / damage
        // prediction / target highlights survive the turn handoff and sit on the board through the NEXT
        // unit's turn — reading as e.g. a melee Behemoth aiming a long ranged arrow. The stale
        // hoverRangeAttackObstacle is also an input hazard: MouseDown routes clicks to it.
        this.hoverManager.clearAttackVisuals();
        this.dungeonVisuals.clearScatteredMountainHighlight();
        this.hoverManager.hoverAttackFromCell = undefined;
        this.hoverRangeAttackObstacle = undefined;

        if (
            this.currentActiveUnit &&
            this.currentActiveUnit.refreshPossibleAttackTypes(
                this.attackHandler?.canLandRangeAttack(
                    this.currentActiveUnit,
                    this.grid.getEnemyAggrMatrixByUnitId(this.currentActiveUnit.getId()),
                ) ?? false,
            )
        ) {
            this.refreshUnits();
        }
        // Ensure visual state is reset (Orange Badge -> Default)
        this.currentActiveUnit?.setActiveTurn(false);
        const gs = this.sc_sceneSettings.getGridSettings();
        const worldRoot = this.drawer.getUnitsContainer();
        this.currentActiveUnit?.syncVisual(worldRoot, gs);
        this.currentActiveUnit = undefined;
        this.sc_selectedAttackType = AttackVals.NO_ATTACK;
        this.sc_renderSpellBookOverlay = false;
        this.sc_currentActiveShotRange = undefined;
        this.buttonManager.sc_renderSpellBookOverlay = false;
        this.spellBookOverlay?.setOpen(false);
        this.pixiApp.getWorldRoot().filters = [];
        this.buttonManager.refreshButtons(true);
    }
    protected cleanupDeadUnits(): void {
        const unitsToDestroy: RenderableUnit[] = [];
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            if (unit.getAmountAlive() <= 0) {
                unitsToDestroy.push(unit as RenderableUnit);
            }
        }
        if (unitsToDestroy.length > 0) {
            console.log(`Sandbox: cleanupDeadUnits found ${unitsToDestroy.length} dead units`);
            this.destroySpecificUnits(unitsToDestroy, true, true);
        }
    }
    /**
     * Push the current casualty stats into the visible state so the ALT "up next"
     * overlay can show the live chart/percentages mid-fight. Winner is NO_TEAM until
     * the fight actually ends (finishFight overwrites this with the real winner).
     */
    private updateLiveFightStats(): void {
        if (!this.sc_visibleState) return;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        this.sc_visibleState.fightStats = this.fightStatsTracker.buildReport(
            TeamVals.NO_TEAM,
            this.unitsHolder.getAllUnits().values(),
            fightProps.getCurrentLap(),
            this.attackHandler?.getDamageStatisticHolder().get() ?? [],
        );
        this.sc_visibleStateUpdateNeeded = true;
    }
    protected finishFight(teamWin: TeamType, opts: { mechanicsAlreadyApplied?: boolean } = {}): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        // Guard re-entry: the win-condition check runs every frame while there is no active unit,
        // so without marking the shared fight state finished we'd re-enter here and log
        // "Fight finished!" (and reset state) on every frame.
        if (opts.mechanicsAlreadyApplied && this.sc_visibleState?.hasFinished) {
            return;
        }
        if (fightProps.hasFightFinished() && !opts.mechanicsAlreadyApplied) {
            return;
        }
        if (!fightProps.hasFightFinished()) {
            fightProps.finishFight();
        }

        this.cleanupDeadUnits();
        this.selectedBoardUnit = undefined; // Force clear selection
        this.currentShiftedUnit = undefined;
        this.sc_currentActiveShotRange = undefined;
        this.sc_hoveredShotRange = undefined;
        this.hoverManager.clear();

        if (this.gameplayGraphics) this.gameplayGraphics.clear();
        this.clearShotRangeCornerSprites();

        // 3520 (approx)
        this.currentActiveUnit = undefined;
        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.sc_sceneLog.updateLog(
            teamWin === TeamVals.NO_TEAM
                ? "Fight finished! Draw!"
                : `Fight finished! ${teamWin === TeamVals.LOWER ? "Green" : "Red"} team wins!`,
        );
        this.refreshVisibleStateIfNeeded();
        if (this.sc_visibleState) {
            this.sc_visibleState.hasFinished = true;
            this.sc_visibleState.teamWin = teamWin;
            const report = this.fightStatsTracker.buildReport(
                teamWin,
                this.unitsHolder.getAllUnits().values(),
                fightProps.getCurrentLap(),
                this.attackHandler?.getDamageStatisticHolder().get() ?? [],
            );
            // Only adopt the local tracker's report when it carries real roster data. Ranked never
            // starts the sandbox tracker (it tracks stats from authoritative snapshots instead), so
            // here the report has 0 start totals — and the results overlay hides itself on a 0 start
            // total. Don't overwrite an already-populated report (e.g. the ranked one) with an empty
            // one; the ranked path fills it in via applyRankedFightStats.
            if (report.lowerStartTotal > 0 && report.upperStartTotal > 0) {
                this.sc_visibleState.fightStats = report;
            }
            this.sc_visibleStateUpdateNeeded = true;
        }
        this.buttonManager.refreshButtons(true);
    }
    protected cleanActivePaths(): void {
        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.currentActivePathHashes = undefined;
    }
    // --- Tier 2 Asset Loading Feedback ---
    public override onSupplementaryTexturesLoaded(): void {
        // A freshly-arrived atlas bundle does not repaint anything by itself: ensureVisual runs only
        // on sync points, so every unit spawned before the bundle keeps the static token it fell back
        // to (the "old squared images on initial load" report). Re-resolve every live renderable now —
        // ensureVisual rebuilds the idle atlas frames the moment texAny can finally see them.
        if (!this.drawer || !this.unitsHolder) {
            return; // bundle resolved while the scene is constructing or tearing down
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const unitsContainer = this.drawer.getUnitsContainer();
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            if (unit instanceof RenderableUnit && !unit.isDead()) {
                unit.ensureVisual(unitsContainer, gs);
            }
        }
    }
    private assetsLoadedLogged = false;
    public override onBackgroundAssetLoad(progress: number): void {
        // Simple visual feedback: show a small progress bar in bottom right corner
        // or just log to console if UI is too complex.
        // Let's create/update a dedicated graphics object.
        if (!this.gameplayGraphics) return;

        // If complete, clear it
        if (progress >= 1.0) {
            if (!this.assetsLoadedLogged) {
                this.sc_sceneLog.updateLog("Animations fully loaded.");
                this.assetsLoadedLogged = true;
            }
            return;
        }

        // Use Scene Log for non-intrusive feedback
        // "Loading Animations: 45%"
        const pct = Math.floor(progress * 100);
        if (pct % 10 === 0) {
            this.sc_sceneLog.updateLog(`Loading Animations... ${pct}%`);
        }
    }
    protected verifyButtonsTrigger(): void {}
    protected updateCurrentMovePath(currentCell: HoCMath.XY): void {
        if (!this.currentActiveUnit || this.moveAnimManager.isMoving()) {
            return;
        }
        if (
            // A web-locked flyer (Arachna Queen's Web Aura), exactly like a Paralyzed unit, cannot move but
            // CAN still strike from where it stands — so it must run this attack-targeting pass too (the else
            // branch below pins it to its base cell). Without web-lock here the UI silently drops its melee
            // targets and the player can't attack, even though the engine (AI path) allows it.
            (this.currentActiveUnit.canMove() ||
                this.currentActiveUnit.hasStatusApplied("Paralysis") ||
                this.currentActiveUnit.isWebMovementLocked()) &&
            this.currentActiveSpell?.getSpellTargetType() !== SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE
        ) {
            let movePath;
            // An Area Throw unit in RANGE mode aims instead of moving (see isAreaThrowAiming), so give it
            // the same pinned single-cell path an immobilized unit gets. That leaves no reachable cells,
            // which is what suppresses the move highlight AND the cursor silhouette that made a
            // Gargantuan look like it could walk while it was really placing its 3x3 splash.
            if (this.currentActiveUnit.canMove() && !this.isAreaThrowAiming()) {
                movePath = this.pathHelper.getMovePath(
                    currentCell,
                    this.gridMatrix,
                    this.currentActiveUnit.getSteps(),
                    this.grid.getAggrMatrixByTeam(this.currentActiveUnit.getOppositeTeam()),
                    this.currentActiveUnit.canFly(),
                    this.currentActiveUnit.isSmallSize(),
                    this.currentActiveUnit.canTraverseLava(),
                    this.currentActiveUnit.hasAbilityActive("In Its Own World"),
                    this.currentActiveUnit.getFootprintWidth(),
                    this.currentActiveUnit.getFootprintHeight(),
                );
            } else {
                // Immobilized (Paralysis or Arachna Queen's Web Aura): can't move, but treat as staying at the
                // current cell to allow attack targeting. Must use the unit's base cell, not the cursor's
                // currentCell, otherwise it thinks we teleported to the cursor.
                const unitCell = this.currentActiveUnit.getBaseCell();
                movePath = {
                    cells: [unitCell],
                    knownPaths: new Map<number, IWeightedRoute[]>(), // No paths to travel
                    hashes: new Set<number>([(unitCell.x << 4) | unitCell.y]),
                };
                // Explicitly valid "move" to self
                movePath.knownPaths.set((unitCell.x << 4) | unitCell.y, []);
            }

            this.currentActivePath = movePath.cells;
            this.currentActiveKnownPaths = movePath.knownPaths;
            this.currentActivePathHashes = movePath.hashes;

            if (this.currentActiveUnit) {
                let enemyTeam = this.unitsHolder.getAllEnemyUnits(this.currentActiveUnit.getTeam());
                const positions = new Map<string, HoCMath.XY>();
                for (const u of this.unitsHolder.getAllUnits().values()) {
                    positions.set(u.getId(), u.getPosition());
                }
                let adjacentEnemies = this.unitsHolder.allEnemiesAroundUnit(this.currentActiveUnit, false, undefined);

                // Aggr forced target: when the active unit is compelled onto one enemy (and it's still
                // alive), it can ONLY attack that unit. Restrict the attackable sets to it so we never
                // draw attack arrows / red previews to anyone else — mirrors the engine's forced-target
                // enforcement (attack_handler.ts) and legacy canTarget(). Applies to sandbox AND ranked
                // (RankedPlayScene extends Sandbox). If the forced target has died, the lock is released.
                const forcedTargetId = this.currentActiveUnit.getTarget();
                if (forcedTargetId) {
                    const forcedTarget = this.unitsHolder.getAllUnits().get(forcedTargetId);
                    if (forcedTarget && !forcedTarget.isDead()) {
                        enemyTeam = enemyTeam.filter((u) => u.getId() === forcedTargetId);
                        adjacentEnemies = adjacentEnemies.filter((u) => u.getId() === forcedTargetId);
                    }
                }

                // Terrifying Gaze forbidden target: the exact inverse of the block above — drop the one enemy
                // the active unit was frightened away from, leaving every other target highlightable.
                const forbiddenTargetId = this.currentActiveUnit.getForbiddenTarget();
                if (forbiddenTargetId) {
                    enemyTeam = enemyTeam.filter((u) => u.getId() !== forbiddenTargetId);
                    adjacentEnemies = adjacentEnemies.filter((u) => u.getId() !== forbiddenTargetId);
                }

                // MAGIC attack type is spell-casting mode — it has no melee attack positions, so
                // skip the melee-target computation (keeps the move silhouette but drops the red
                // melee highlights / attack-from cells while casting).
                if (this.currentActiveUnit.getAttackTypeSelection() === AttackVals.MAGIC) {
                    this.canAttackByMeleeTargets = undefined;
                } else {
                    this.canAttackByMeleeTargets = this.currentActiveUnit.attackMeleeAllowed(
                        enemyTeam,
                        positions,
                        adjacentEnemies,
                        movePath.cells,
                        movePath.knownPaths,
                    );
                }

                // Mountains are 2x2 blocks — feed each standing mountain through the SAME
                // melee-targeting pass as enemy units (a pseudo-target exposing getId/isSmallSize/
                // getCells is all attackMeleeAllowed reads), so every landing — edges, corners,
                // large-unit anchors, striking in place — comes from the identical code path.
                // An alive forced target (aggr) forbids mountain attacks, mirroring the engine.
                this.canAttackMountainTargets = undefined;
                const mountainFightProps = FightStateManager.getInstance().getFightProperties();
                const forcedMountainBlocker = forcedTargetId
                    ? this.unitsHolder.getAllUnits().get(forcedTargetId)
                    : undefined;
                if (
                    this.currentActiveUnit.getAttackTypeSelection() !== AttackVals.MAGIC &&
                    mountainFightProps.getGridType() === GridVals.BLOCK_CENTER &&
                    (this.grid.hasScatteredMountains()
                        ? this.grid.getScatteredMountainsStanding().length > 0
                        : mountainFightProps.getObstacleHitsLeft() > 0) &&
                    !(forcedMountainBlocker && !forcedMountainBlocker.isDead())
                ) {
                    const gsMountain = this.sc_sceneSettings.getGridSettings();
                    const centerCells = this.grid.getCenterCells();
                    const pseudoTargets: Unit[] = [];
                    const pseudoPositions = new Map<string, HoCMath.XY>();
                    if (this.grid.hasScatteredMountains()) {
                        for (const cell of centerCells) {
                            const position = GridMath.getPositionForCell(
                                cell,
                                gsMountain.getMinX(),
                                gsMountain.getStep(),
                                gsMountain.getHalfStep(),
                            );
                            const id = `mountain:${cell.x}:${cell.y}`;
                            pseudoTargets.push({
                                getId: () => id,
                                isSmallSize: () => true,
                                getCells: () => [cell],
                            } as unknown as Unit);
                            pseudoPositions.set(id, position);
                        }
                    }
                    const midColumn = gsMountain.getGridSize() >> 1;
                    for (const side of ["left", "right"] as const) {
                        if (this.grid.hasScatteredMountains()) {
                            break;
                        }
                        const cells = centerCells.filter((c) => (side === "left" ? c.x < midColumn : c.x >= midColumn));
                        if (cells.length !== 4) {
                            continue; // this side is already destroyed
                        }
                        const position = GridMath.getPositionForCells(gsMountain, cells);
                        if (!position) {
                            continue;
                        }
                        const id = `mountain:${side}`;
                        pseudoTargets.push({
                            getId: () => id,
                            isSmallSize: () => false,
                            getCells: () => cells,
                        } as unknown as Unit);
                        pseudoPositions.set(id, position);
                    }
                    if (pseudoTargets.length) {
                        this.canAttackMountainTargets = this.currentActiveUnit.attackMeleeAllowed(
                            pseudoTargets,
                            pseudoPositions,
                            [],
                            movePath.cells,
                            movePath.knownPaths,
                        );
                    }
                }

                this.canAttackByRangeTargets = undefined;
                // Range Attack Logic
                // We use attackHandler.canLandRangeAttack to check general ability (no range bane, no adjacent enemies block)
                // [Active Unit Sniper Check]
                if (this.currentActiveUnit.hasAbilityActive("Sniper")) {
                    this.currentActiveUnit.setRangeShotDistance(
                        Number(
                            (
                                GridMath.getDistanceToFurthestCorner(
                                    this.currentActiveUnit.getPosition(),
                                    this.sc_sceneSettings.getGridSettings(),
                                ) /
                                    this.sc_sceneSettings.getGridSettings().getStep() -
                                0.45
                            ).toFixed(2),
                        ),
                    );
                }

                if (
                    this.currentActiveUnit.getAttackTypeSelection() === AttackVals.RANGE &&
                    this.currentActiveUnit.getRangeShots() > 0 &&
                    this.attackHandler.canLandRangeAttack(
                        this.currentActiveUnit,
                        this.grid.getEnemyAggrMatrixByUnitId(this.currentActiveUnit.getId()),
                    )
                ) {
                    this.canAttackByRangeTargets = new Set<string>();
                    // const rangeDist = this.currentActiveUnit.getRangeShotDistance() * GridConstants.STEP; // Unused
                    // const attackerPos = this.currentActiveUnit.getPosition(); // Unused

                    // Through Shot pierces bodies: for a piercing shooter only a hard BLOCK obstacle hides
                    // an edge, so it keeps targets a plain shooter cannot see.
                    const isThroughShot = this.currentActiveUnit.hasAbilityActive("Through Shot");
                    for (const enemy of enemyTeam) {
                        if (
                            !enemy.hasBuffActive("Hidden") &&
                            // A shot lands on the center of a VISIBLE EDGE, so a unit whose every edge is
                            // covered — boxed in by its own allies and/or mountains — offers nothing legal to
                            // aim at and is not a target. Same rule the engine enforces, so the client never
                            // offers a shot the server would reject.
                            GridMath.hasObservableRangeAttackEdge(
                                this.grid.getMatrix(),
                                enemy.getCells(),
                                this.currentActiveUnit.getTeam(),
                                isThroughShot,
                            )
                        ) {
                            // Additionally check if unit is hittable (e.g. not dead, effectively already checked by being in enemyTeam mostly)
                            this.canAttackByRangeTargets.add(enemy.getId());
                        }
                    }
                }
            }
        } else {
            this.cleanActivePaths();
        }
    }
}

registerScene("Heroes", "Sandbox", Sandbox);
