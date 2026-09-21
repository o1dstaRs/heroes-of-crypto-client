import { TROLL_LAB_WALK_SCALE_X, TROLL_LAB_WALK_SCALE_Y, syncTrollLabWalkPalette } from "./TrollLabWalkVisuals";
import { isTrollLabCastGuard, syncTrollLabCastGlow } from "./TrollLabCastVisuals";
import { syncTrollLabCastMatch } from "./TrollLabCastMatch";
import {
    isTrollLabAttack,
    isTrollLabAttackGuard,
    syncTrollLabAttack,
    trollLabAttackFrames,
} from "./TrollLabAttackVisuals";
import { syncWhiteTigerLabWalk } from "./WhiteTigerLabWalkVisuals";
import { syncWhiteTigerIdleTail } from "./WhiteTigerIdleTailVisuals";
import {
    Container,
    Sprite,
    Graphics,
    Point,
    Text,
    TextStyle,
    Texture,
    Rectangle,
    BlurFilter,
    ColorMatrixFilter,
    FillGradient,
    Bounds,
    type Filter,
} from "pixi.js";
import {
    Unit,
    UnitProperties,
    HoCMath,
    GridSettings,
    GridMath,
    TeamVals,
    HoCConstants,
    HoCConfig,
    MAGIC_REFLECTION_ABILITY_NAME,
    SpellHelper,
    FightStateManager,
    AbilityHelper,
    AllAbilities,
    type Effect,
    type TeamType,
} from "@heroesofcrypto/common";
import { PixiRenderableSpell } from "./RenderableSpell";
import { syncBlacksmithWalkColorFilter } from "./BlacksmithWalkColorFilter";
import { syncManticoreLabIdle } from "./ManticoreLabIdleVisuals";
import { manticoreLabAttackEye } from "./ManticoreLabAttackEyes";
import { syncManticoreLabWalkPalette } from "./ManticoreLabWalkPalette";
import { syncManticoreLabPoseCalibration } from "./ManticoreLabPoseCalibration";
import { syncHealerLabWalkPalette } from "./HealerLabWalkPalette";
import { centaurLabWalkScale, syncCentaurLabWalkColor } from "./CentaurLabWalkVisuals";
import { syncCentaurLabIdleWind } from "./CentaurLabIdleWindVisuals";
import { syncCentaurLabMeleePalette } from "./CentaurLabMeleeVisuals";
import { SQUIRE_PLUME_PERIOD_MS, syncSquireIdlePlume } from "./SquireIdlePlume";
import { syncValkyrieLabIdle } from "./ValkyrieLabIdle";
import {
    syncValkyrieLabReaction,
    isValkyrieLabAction,
    valkyrieLabActionCanvasScale,
    valkyrieLabActionAnchorX,
    valkyrieLabActionAnchorY,
    VALKYRIE_DEATH_SPEED,
    VALKYRIE_HIT_SPEED,
} from "./ValkyrieLabReactions";
import { syncLeprechaunLabWalkVisuals } from "./LeprechaunLabWalkVisuals";
import { syncFairyLabHead } from "./FairyLabHeadVisuals";
import { syncFairyLabIdle } from "./FairyLabIdleVisuals";
import { syncFairyLabReaction } from "./FairyLabReactionVisuals";
import { syncFairyLabSurface } from "./FairyLabSurfaceVisuals";
import { fairyLabAttackElapsed } from "./FairyLabAttackMotion";
import { fairyLabIdleFrame } from "./FairyLabIdle";
import {
    VALKYRIE_LAB_WALK_SCALE,
    VALKYRIE_LAB_WALK_ANCHOR_X,
    VALKYRIE_LAB_TRANSITION_SPEED,
    VALKYRIE_LAB_FLIGHT_SPEED,
    valkyrieLabWalkAnchorY,
    syncValkyrieLabWalk,
} from "./ValkyrieLabWalk";
import { syncWanderingMageIdleFire } from "./WanderingMageIdleFire";
import { syncDryadLabIdle } from "./DryadLabIdleVisuals";
import { syncBattleMageLabIdle } from "./BattleMageLabIdleVisuals";
import { syncElfIdleCape } from "./ElfIdleCape";
import {
    BATTLE_MAGE_REACTION_DURATION_MS,
    battleMageReactionPose,
    syncBattleMageLabReaction,
    type BattleMageReaction,
} from "./BattleMageLabReactions";
import { syncPikemanLabIdle } from "./PikemanLabIdleVisuals";
import {
    FAIRY_LAB_WALK_SCALE,
    FAIRY_LAB_WALK_WIDTH_SCALE,
    FAIRY_LAB_WALK_SPEED,
    FAIRY_LAB_TRANSITION_SPEED,
    syncFairyLabWalkColor,
} from "./FairyLabWalkVisuals";
import { centaurLabIdleFrame } from "./CentaurLabIdle";
import {
    syncWolfIdleVisuals,
    wolfIdleFrameScale,
    wolfIdleTextureFrame,
    wolfIdlePlaybackDurations,
} from "./WolfIdleVisuals";
import { wolfReactionFrameScale, wolfReactionFootAnchorY } from "./WolfReactionGeometry";
import { syncWolfReactionVisuals } from "./WolfReactionVisuals";
import { syncWolfAttackReachVisuals } from "./WolfAttackReachVisuals";
import { syncScavengerHitColorFilter, syncScavengerIdleColorFilter } from "./ScavengerIdleColorFilter";
import { syncBerserkerIdleVisuals } from "./BerserkerIdleVisuals";
import { applyScavengerHitRegistration, clearScavengerHitRegistration } from "./ScavengerHitRegistration";
import { staticBattlefieldTextureNameForUnit, TextureType, unitToTextureName } from "@/pixi/PixiUnitsFactory";
import { legacyBoardChildScaleCompensation } from "@/pixi/boardFit";
import { CREATURE_SPRITE_ANIMATION_SETTINGS, usesApprovedBaseAnimations } from "@/pixi/creatureAnimationSettings";
import { animationAtlases, AnimationUnitName, type AnimationAtlasMeta } from "../generated/animation_atlases";
import { images, type ImageKey } from "../imageAssets";
import { buildAtlasPingPongTiming, AtlasPingPongTiming } from "./atlasAnimationTiming";
import { ArbalesterIdlePager, arbalesterIdlePages } from "./ArbalesterIdlePager";
import { syncArbalesterAppearance } from "./ArbalesterAppearance";
import { CAN_RENDER_FLAG_GRADIENT, personalArmyFlagGradient, personalArmyPresetFor } from "./personalArmyTint";
import {
    TEAM_COLOR_GREEN,
    TEAM_COLOR_RED,
    TEAM_FLAG_PALETTE_GREEN,
    TEAM_FLAG_PALETTE_RED,
    teamColor as resolveTeamColor,
} from "./teamColors";
import { HOC_NUMERIC_FONT_FAMILY } from "../fontFamilies";
import { projectBattlefieldPoint, projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";
import { ACTIVE_TURN_GOLD_COLOR, updateActiveTurnGroundRing } from "./ActiveTurnGroundRing";
import {
    BATTLEFIELD_CREATURE_CONTOUR_FURNACE_OPACITY,
    getBattlefieldCreatureContourFilter,
    shouldApplyRuntimeBattlefieldContour,
} from "./BattlefieldCreatureContourFilter";
import { getBattlefieldAlphaHoleFillFilter, shouldFillBattlefieldAlphaHoles } from "./BattlefieldAlphaHoleFillFilter";
import {
    BATTLEFIELD_CREATURE_FRAMING_CHANGE_EVENT,
    isBattlefieldCreatureEditorActive,
    publishBattlefieldCreatureVisualBounds,
    resolveStoredBattlefieldCreatureFraming,
    type BattlefieldCreatureFramingChangeDetail,
} from "../ui/battlefieldCreatureFraming";
import {
    BATTLEFIELD_SHADOW_SEGMENT_COUNT,
    DEFAULT_BATTLEFIELD_SHADOW_TUNING,
    publishBattlefieldShadowVisualBounds,
    resolveBattlefieldShadowTuning,
    type BattlefieldShadowTuning,
} from "../ui/battlefieldShadowTuning";
import { stunBadgeLayout } from "../ui/stunBadgeTuning";
import { creatureHeadPriorityZone, type CreatureDepthSortCandidate } from "./battlefieldCreatureDepthSort";
export type TexResolver = (name: string) => Texture | undefined;

interface CreatureBoundsCacheState {
    texture: Texture;
    parent: Container;
    spriteX: number;
    spriteY: number;
    spriteScaleX: number;
    spriteScaleY: number;
    spriteRotation: number;
    spritePivotX: number;
    spritePivotY: number;
    spriteSkewX: number;
    spriteSkewY: number;
    spriteAnchorX: number;
    spriteAnchorY: number;
    parentX: number;
    parentY: number;
    parentScaleX: number;
    parentScaleY: number;
    parentRotation: number;
    parentPivotX: number;
    parentPivotY: number;
    parentSkewX: number;
    parentSkewY: number;
    parentWorldA: number;
    parentWorldB: number;
    parentWorldC: number;
    parentWorldD: number;
    parentWorldTx: number;
    parentWorldTy: number;
}

interface ContinuousEffectDrawState {
    drawnAtMs: number;
    x: number;
    y: number;
    cellSize: number;
    footprintWidth: number;
    footprintHeight: number;
    color: number;
}

/**
 * Rebuild the sprite filter list only when one of this renderer's managed filters truly changed.
 * `undefined` means the installed array already has the desired identity/order and can stay untouched.
 */
export const reconcileManagedSpriteFilters = <T>(
    installed: readonly T[],
    retiredStyle: T | undefined,
    retiredAlphaFill: T | undefined,
    retiredContour: T | undefined,
    desaturate: T | undefined,
    alphaFill: T | undefined,
    contour: T | undefined,
    includeDesaturate: boolean,
): T[] | undefined => {
    let expectedIndex = 0;
    let matches = true;
    if (alphaFill !== undefined) {
        if (installed[expectedIndex] !== alphaFill) matches = false;
        expectedIndex++;
    }
    if (contour !== undefined) {
        if (installed[expectedIndex] !== contour) matches = false;
        expectedIndex++;
    }
    for (const filter of installed) {
        if (
            filter !== retiredStyle &&
            filter !== retiredAlphaFill &&
            filter !== retiredContour &&
            filter !== desaturate
        ) {
            if (installed[expectedIndex] !== filter) matches = false;
            expectedIndex++;
        }
    }
    if (includeDesaturate && desaturate !== undefined) {
        if (installed[expectedIndex] !== desaturate) matches = false;
        expectedIndex++;
    }
    if (matches && expectedIndex === installed.length) return undefined;

    const desired: T[] = [];
    if (alphaFill !== undefined) desired.push(alphaFill);
    if (contour !== undefined) desired.push(contour);
    for (const filter of installed) {
        if (
            filter !== retiredStyle &&
            filter !== retiredAlphaFill &&
            filter !== retiredContour &&
            filter !== desaturate
        ) {
            desired.push(filter);
        }
    }
    if (includeDesaturate && desaturate !== undefined) desired.push(desaturate);
    return desired;
};

const EMPTY_FILTERS: readonly Filter[] = Object.freeze([]);
const CONTINUOUS_EFFECT_SAME_FRAME_GUARD_MS = 4;

const newContinuousEffectDrawState = (): ContinuousEffectDrawState => ({
    drawnAtMs: Number.NEGATIVE_INFINITY,
    x: Number.NaN,
    y: Number.NaN,
    cellSize: Number.NaN,
    footprintWidth: 0,
    footprintHeight: 0,
    color: 0,
});

const shouldRedrawContinuousEffect = (
    state: ContinuousEffectDrawState,
    nowMs: number,
    pos: HoCMath.XY,
    cellSize: number,
    footprintWidth: number,
    footprintHeight: number,
    color = 0,
): boolean => {
    const sameGeometry =
        state.x === pos.x &&
        state.y === pos.y &&
        state.cellSize === cellSize &&
        state.footprintWidth === footprintWidth &&
        state.footprintHeight === footprintHeight &&
        state.color === color;
    const elapsedSinceDraw = nowMs - state.drawnAtMs;
    if (sameGeometry && elapsedSinceDraw >= 0 && elapsedSinceDraw < CONTINUOUS_EFFECT_SAME_FRAME_GUARD_MS) {
        return false;
    }
    state.drawnAtMs = nowMs;
    state.x = pos.x;
    state.y = pos.y;
    state.cellSize = cellSize;
    state.footprintWidth = footprintWidth;
    state.footprintHeight = footprintHeight;
    state.color = color;
    return true;
};

let sharedRevealedRosterDesaturateFilter: ColorMatrixFilter | undefined;

/** Every revealed opponent uses the same immutable grayscale matrix, so one filter serves the whole roster. */
const revealedRosterDesaturateFilter = (): ColorMatrixFilter => {
    if (sharedRevealedRosterDesaturateFilter) return sharedRevealedRosterDesaturateFilter;
    sharedRevealedRosterDesaturateFilter = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
    sharedRevealedRosterDesaturateFilter.desaturate();
    return sharedRevealedRosterDesaturateFilter;
};

const battlefieldShadowSegmentTextureCache = new WeakMap<Texture, readonly Texture[]>();

/** Four untrimmed atlas slices that meet at the original sprite centre without changing its source texture. */
const battlefieldShadowSegmentTextures = (texture: Texture): readonly Texture[] => {
    const cached = battlefieldShadowSegmentTextureCache.get(texture);
    if (cached) return cached;
    const segmentWidth = texture.frame.width / BATTLEFIELD_SHADOW_SEGMENT_COUNT;
    const segments = Array.from(
        { length: BATTLEFIELD_SHADOW_SEGMENT_COUNT },
        (_, index) =>
            new Texture({
                source: texture.source,
                frame: new Rectangle(
                    texture.frame.x + segmentWidth * index,
                    texture.frame.y,
                    segmentWidth,
                    texture.frame.height,
                ),
            }),
    );
    battlefieldShadowSegmentTextureCache.set(texture, segments);
    return segments;
};

const GREEN_ARMY_FLAG_GRADIENT = CAN_RENDER_FLAG_GRADIENT
    ? new FillGradient({
          end: { x: 1, y: 0 },
          textureSpace: "local",
          colorStops: [
              { offset: 0, color: TEAM_FLAG_PALETTE_GREEN.edge },
              { offset: 0.5, color: TEAM_FLAG_PALETTE_GREEN.center },
              { offset: 1, color: TEAM_FLAG_PALETTE_GREEN.edge },
          ],
      })
    : undefined;
const RED_ARMY_FLAG_GRADIENT = CAN_RENDER_FLAG_GRADIENT
    ? new FillGradient({
          end: { x: 1, y: 0 },
          textureSpace: "local",
          colorStops: [
              { offset: 0, color: TEAM_FLAG_PALETTE_RED.edge },
              { offset: 0.5, color: TEAM_FLAG_PALETTE_RED.center },
              { offset: 1, color: TEAM_FLAG_PALETTE_RED.edge },
          ],
      })
    : undefined;
export interface BattlefieldUnitPreview {
    texture: Texture;
    anchorX: number;
    anchorY: number;
    scaleX: number;
    scaleY: number;
    x: number;
    y: number;
    rotation: number;
}
const WANDERING_MAGE_BOARD_TEXTURE = "wandering_mage_board_128";
const WANDERING_MAGE_UNIT_NAME = "Wandering Mage";
const THIEF_BOARD_TEXTURE = "thief_board_128";
const THIEF_UNIT_NAME = "Thief";
const SCAVENGER_UNIT_NAME = "Scavenger";
/** The requested 5% lift is relative to the rendered figure, not the much shorter board cell. */
const SCAVENGER_BATTLEFIELD_VERTICAL_LIFT_FRACTION = 0.05;
const PEASANT_UNIT_NAME = "Peasant";
const BEHOLDER_UNIT_NAME = "Beholder";
const SQUIRE_UNIT_NAME = "Squire";
const ARBALESTER_UNIT_NAME = "Arbalester";
const BLACKSMITH_UNIT_NAME = "Blacksmith";
const TROGLODYTE_UNIT_NAME = "Troglodyte";
const CENTAUR_UNIT_NAME = "Centaur";
const DRYAD_UNIT_NAME = "Dryad";
const LEPRECHAUN_UNIT_NAME = "Leprechaun";
// The idle sheet retains substantially more transparent headroom than the normalized walk sheet.
// Use the measured alpha bounds for each state so placement/idle and movement keep the same visible size.
const THIEF_IDLE_VISIBLE_WIDTH_RATIO = 121 / 160;
const THIEF_IDLE_VISIBLE_HEIGHT_RATIO = 186 / 192;
const THIEF_WALK_VISIBLE_WIDTH_RATIO = 125 / 160;
const THIEF_WALK_VISIBLE_HEIGHT_RATIO = 185 / 192;
// The approved original Scavenger loop keeps its 256px source canvas: the first figure is 247px
// high. Match it to the current static figure's measured 757px height, including that figure's
// existing legacy idle scale, instead of fitting the old narrower Thief walk canvas.
const SCAVENGER_ORIGINAL_WALK_VISIBLE_HEIGHT_RATIO = (247 / 256) * ((768 * THIEF_IDLE_VISIBLE_HEIGHT_RATIO) / 757);
const SCAVENGER_LAB_ACTIONS = ["hit", "death", "attack", "attack_up", "attack_down"];
const scavengerLabCanvasScale = (state?: string): number => (state?.startsWith("attack") ? 1024 / 768 : 1);
export const SCAVENGER_LAB_VISIBLE_HEIGHT_RATIO = (700 / 768) * ((768 * THIEF_IDLE_VISIBLE_HEIGHT_RATIO) / 757);
const ORC_UNIT_NAME = "Orc";
const MERMAID_UNIT_NAME = "Mermaid";
const TROLL_UNIT_NAME = "Troll";
const EFREET_UNIT_NAME = "Efreet";
const ARACHNA_QUEEN_UNIT_NAME = "Arachna Queen";
const WOLF_UNIT_NAME = "Wolf";
const WOLF_RIDER_UNIT_NAME = "Wolf Rider";
const GARGANTUAN_UNIT_NAME = "Gargantuan";
export const TALL_BOARD_MODEL_FOOT_INSET_RATIO = 0.06;
/**
 * Authored pixels per footprint cell for the portrait-chip sizing path. One cell is the 128px chip and
 * two cells the 256px one, so a footprint-derived box reproduces both shipped numbers exactly.
 */
export const BATTLEFIELD_CHIP_CELL_PIXELS = 128;
/** Shared foot line for one-cell creatures, raised 25% of a cell from the lower seam. */
export const BATTLEFIELD_SINGLE_CELL_Y_OFFSET_RATIO = 0.25;
export const BATTLEFIELD_FOUR_CELL_Y_OFFSET_RATIO = 0.7;

/**
 * How far below the footprint's centre the projected foot line sits, in cells.
 *
 * The feet stand just above the footprint's LEFT SEAM, and that seam is `footprintHeight / 2` below the
 * centre — the only term a rectangle changes. The inset above the seam stays exactly as authored: a
 * quarter of a cell for a one-cell-tall body and three tenths for the taller multi-row art, which
 * reproduces both approved ratios (1 -> 0.25, 2 -> 0.7) unchanged.
 */
export function battlefieldFootLineOffsetCells(footprintHeight: number): number {
    const insetAboveSeam =
        footprintHeight > 1 ? 1 - BATTLEFIELD_FOUR_CELL_Y_OFFSET_RATIO : 0.5 - BATTLEFIELD_SINGLE_CELL_Y_OFFSET_RATIO;
    return footprintHeight / 2 - insetAboveSeam;
}
/** Bottom-row framing is the authored maximum; the top legal row is exactly fifteen percent smaller. */
export const BATTLEFIELD_TOP_ROW_CREATURE_SCALE = 0.85;

/**
 * Compact furnace-cast silhouette shadow. The upper legal row is nearest the three wall furnaces and
 * therefore receives the largest projection; the bottom row keeps only a restrained grounding mark.
 * Values are fractions of the live creature cutout, so every creature and animation frame shares the
 * same art direction without needing a separate shadow asset.
 */
export const BATTLEFIELD_SHADOW_BOTTOM_ROW_LENGTH_SCALE = DEFAULT_BATTLEFIELD_SHADOW_TUNING.bottom.lengthScale;
export const BATTLEFIELD_SHADOW_TOP_ROW_LENGTH_SCALE = DEFAULT_BATTLEFIELD_SHADOW_TUNING.top.lengthScale;
export const BATTLEFIELD_SHADOW_BOTTOM_ROW_WIDTH_SCALE = DEFAULT_BATTLEFIELD_SHADOW_TUNING.bottom.widthScale;
export const BATTLEFIELD_SHADOW_TOP_ROW_WIDTH_SCALE = DEFAULT_BATTLEFIELD_SHADOW_TUNING.top.widthScale;
export const BATTLEFIELD_SHADOW_BOTTOM_ROW_ALPHA = DEFAULT_BATTLEFIELD_SHADOW_TUNING.bottom.alpha;
export const BATTLEFIELD_SHADOW_TOP_ROW_ALPHA = DEFAULT_BATTLEFIELD_SHADOW_TUNING.top.alpha;
/** Hide source-image bottom padding behind the figure so the cast silhouette visibly touches its feet. */
export const BATTLEFIELD_SHADOW_FOOT_OVERLAP_CELL_RATIO = DEFAULT_BATTLEFIELD_SHADOW_TUNING.bottom.offsetYCells;

export interface BattlefieldCreatureShadowProjection {
    lengthScale: number;
    widthScale: number;
    alpha: number;
}

export interface RangedProjectileOriginBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

interface RangedProjectileOriginProfile {
    /** Fraction of full visible width from body centre toward the target (0.5 reaches the front edge). */
    forward: number;
    /** Fraction of visible height measured downward from the top of the cutout. */
    height: number;
}

/**
 * Authored attachment zones for the twelve native shooters. Weapon users sit near the visible muzzle or
 * weapon tip; unarmed throwers sit nearer the torso where their forward hand is painted. The bounds and
 * target direction do the mirroring, so one profile works for either army side.
 */
const RANGED_PROJECTILE_ORIGIN_BY_UNIT: Readonly<Record<string, RangedProjectileOriginProfile>> = {
    arbalester: { forward: 0.46, height: 0.4 },
    monk: { forward: 0.28, height: 0.4 },
    "tsar cannon": { forward: 0.45, height: 0.5 },
    dryad: { forward: 0.3, height: 0.42 },
    elf: { forward: 0.43, height: 0.39 },
    gargantuan: { forward: 0.3, height: 0.43 },
    orc: { forward: 0.34, height: 0.4 },
    medusa: { forward: 0.31, height: 0.4 },
    beholder: { forward: 0.08, height: 0.38 },
    centaur: { forward: 0.42, height: 0.38 },
    cyclops: { forward: 0.31, height: 0.41 },
    zena: { forward: 0.31, height: 0.4 },
};
const DEFAULT_RANGED_PROJECTILE_ORIGIN: RangedProjectileOriginProfile = { forward: 0.32, height: 0.41 };

export function rangedProjectileOriginFromBounds(
    unitName: string,
    bounds: RangedProjectileOriginBounds,
    target: HoCMath.XY,
    fallbackFacing: -1 | 1 = 1,
): HoCMath.XY {
    const width = Math.max(0, bounds.right - bounds.left);
    const height = Math.max(0, bounds.bottom - bounds.top);
    const centerX = (bounds.left + bounds.right) * 0.5;
    const profile = RANGED_PROJECTILE_ORIGIN_BY_UNIT[unitName.trim().toLowerCase()] ?? DEFAULT_RANGED_PROJECTILE_ORIGIN;
    const horizontalDelta = target.x - centerX;
    const direction = Math.abs(horizontalDelta) > 0.001 ? (horizontalDelta < 0 ? -1 : 1) : fallbackFacing;
    return {
        x: centerX + direction * width * profile.forward,
        y: bounds.top + height * profile.height,
    };
}

/**
 * Which playable board row a figure stands on, normalized to 0 at the nearest row and 1 at the furthest.
 *
 * The illustrated battlefield keeps one mechanical buffer row behind each end of the playable floor.
 * The shadow editor deliberately parks its comparison row in the upper buffer (row 15), while a unit
 * dropped on the highest real cell lands on row 14. Clamp both buffers to their adjacent playable
 * endpoint so the upper real cell receives the editor profile exactly and the lowest real cell receives
 * the authored lower profile exactly. Only footprint HEIGHT changes the upper legal anchor; a 2x1 still
 * behaves exactly like a 1x1.
 */
const battlefieldCreatureRowProgress = (logicalY: number, footprintHeight: number, gs: GridSettings): number => {
    const playableEdgeInsetRows = 1;
    const minimumBottomRow = playableEdgeInsetRows;
    const maximumBottomRow = Math.max(minimumBottomRow + 1, gs.getGridSize() - footprintHeight - playableEdgeInsetRows);
    const bottomRow =
        (logicalY - gs.getMinY() - (footprintHeight * gs.getCellSize()) / 2) / Math.max(1, gs.getCellSize());
    return Math.max(0, Math.min(1, (bottomRow - minimumBottomRow) / (maximumBottomRow - minimumBottomRow)));
};

const interpolateBattlefieldShadowValue = (bottom: number, top: number, rowProgress: number): number =>
    bottom + (top - bottom) * rowProgress;

/**
 * The two rows nearest the wall furnaces soften their dark rim. A body two cells tall also softens one
 * anchor row earlier because its right half already occupies that furnace-adjacent two-row band — which
 * is why the threshold is expressed as "one row above the top of the body" rather than as a size test.
 */
export function battlefieldCreatureContourOpacity(logicalY: number, footprintHeight: number, gs: GridSettings): number {
    const bottomRow =
        (logicalY - gs.getMinY() - (footprintHeight * gs.getCellSize()) / 2) / Math.max(1, gs.getCellSize());
    const firstFurnaceAffectedBottomRow = gs.getGridSize() - (footprintHeight + 1);
    return bottomRow >= firstFurnaceAffectedBottomRow - 0.001 ? BATTLEFIELD_CREATURE_CONTOUR_FURNACE_OPACITY : 1;
}

export function battlefieldCreatureShadowProjection(
    logicalY: number,
    footprintHeight: number,
    gs: GridSettings,
    unitName?: string,
): BattlefieldCreatureShadowProjection {
    return writeBattlefieldCreatureShadowProjection(
        resolveBattlefieldShadowTuning(unitName),
        battlefieldCreatureRowProgress(logicalY, footprintHeight, gs),
    );
}

const writeBattlefieldCreatureShadowProjection = (
    tuning: BattlefieldShadowTuning,
    rowProgress: number,
    output?: BattlefieldCreatureShadowProjection,
): BattlefieldCreatureShadowProjection => {
    const projection = output ?? { lengthScale: 0, widthScale: 0, alpha: 0 };
    projection.lengthScale = interpolateBattlefieldShadowValue(
        tuning.bottom.lengthScale,
        tuning.top.lengthScale,
        rowProgress,
    );
    projection.widthScale = interpolateBattlefieldShadowValue(
        tuning.bottom.widthScale,
        tuning.top.widthScale,
        rowProgress,
    );
    projection.alpha = interpolateBattlefieldShadowValue(tuning.bottom.alpha, tuning.top.alpha, rowProgress);
    return projection;
};

/**
 * Project the visible pose. The live sprite supplies its canvas scale and foot anchor separately,
 * while the authored row profile keeps the shadow's offset, rotation and length.
 */
export function battlefieldShadowSourceForUnit<T>(_unitName: string, _editorReferenceSource: T, currentSource: T): T {
    return currentSource;
}

/** Use one deterministic frame for gameplay shadows once the editor-authored profile is applied. */
export function battlefieldCanonicalShadowReference<T>(baseTexture: T, authoredIdleFrames?: readonly T[]): T {
    return authoredIdleFrames?.[0] ?? baseTexture;
}

export function battlefieldStableShadowReferenceScale(options: {
    unitName: string;
    referenceWidth: number;
    referenceHeight: number;
    cellSize: number;
    chipTargetSide: number;
    tallBoardModel: boolean;
    boardModelTargetHeightCells: number;
    usesThiefSilhouette: boolean;
    refreshedFullBodyScale: boolean;
    refreshedWidthScale: number;
    tallBoardWidthCells: number;
    visualFootprintSide: number;
}): { x: number; y: number } {
    const baseVisibleHeight =
        options.referenceHeight * (options.usesThiefSilhouette ? THIEF_IDLE_VISIBLE_HEIGHT_RATIO : 1);
    const baseVisibleWidth =
        options.referenceWidth * (options.usesThiefSilhouette ? THIEF_IDLE_VISIBLE_WIDTH_RATIO : 1);
    const y = options.tallBoardModel
        ? (options.cellSize * options.boardModelTargetHeightCells) / baseVisibleHeight
        : options.chipTargetSide / options.referenceHeight;
    const x = options.tallBoardModel
        ? options.refreshedFullBodyScale ||
          options.unitName === ORC_UNIT_NAME ||
          options.unitName === SCAVENGER_UNIT_NAME
            ? y * (options.refreshedFullBodyScale ? options.refreshedWidthScale : 1)
            : options.usesThiefSilhouette
              ? (options.cellSize * options.tallBoardWidthCells * options.visualFootprintSide) / baseVisibleWidth
              : Math.min(
                    y,
                    (options.cellSize * options.tallBoardWidthCells * options.visualFootprintSide) /
                        options.referenceWidth,
                )
        : options.chipTargetSide / options.referenceWidth;
    return { x, y };
}

/**
 * Continuous perspective attenuation for a placed battlefield figure.
 * One-cell-tall bodies distribute the 15% reduction evenly across 15 row transitions. A two-cell-tall
 * body has 14 legal transitions, so it traverses the same 100% -> 85% range across the rows it can occupy.
 */
export function battlefieldCreaturePerspectiveScale(
    logicalY: number,
    footprintHeight: number,
    gs: GridSettings,
): number {
    const rowProgress = battlefieldCreatureRowProgress(logicalY, footprintHeight, gs);
    return 1 - (1 - BATTLEFIELD_TOP_ROW_CREATURE_SCALE) * rowProgress;
}
/** The horned Gargantuan keeps the previously approved 20% enlargement. */
export const BATTLEFIELD_GARGANTUAN_SCALE_MULTIPLIER = 1.2;
/** Every other four-cell silhouette receives another 10% on top of the approved 20%. */
export const BATTLEFIELD_FOUR_CELL_SCALE_MULTIPLIER = 1.2 * 1.1;

/**
 * The approved enlargement for a multi-cell silhouette. Both tiers were art-directed against the SQUARE
 * footprints, so only those receive one: a rectangle already reads as a bigger creature because its
 * sprite box is derived from its own cells (two of them along the long axis), and picking an enlargement
 * tier for rectangular art is an art-direction call the owner has not made.
 */
export function battlefieldCreatureScaleMultiplier(
    unitName: string,
    footprintWidth: number,
    footprintHeight = footprintWidth,
): number {
    if (footprintWidth !== 2 || footprintHeight !== 2) return 1;
    return unitName === GARGANTUAN_UNIT_NAME
        ? BATTLEFIELD_GARGANTUAN_SCALE_MULTIPLIER
        : BATTLEFIELD_FOUR_CELL_SCALE_MULTIPLIER;
}
/** Authored refreshed idle loops run at 77% of their generated cadence (23% slower). */
export const REFRESHED_IDLE_ANIMATION_SPEED_MULTIPLIER = 0.77;
/** Owner-tuned: v5 adds another exact 8% on top of Squire v4's 20% runtime speed increase. */
export const SQUIRE_IDLE_SPEED_MULTIPLIER = 1.2 * 1.08;
// The approved walk frames share one exact 408x696 alpha envelope, while the approved idle/base figure
// occupies 426x726 pixels. Apply one constant uniform scale for the whole walk so entering/leaving movement
// does not make the Squire shrink or grow; the authored poses themselves are never scaled independently.
export const SQUIRE_WALK_VISIBLE_SCALE_MULTIPLIER = 726 / 696;
// Alpha > 128: battlefield Berserker spans 765px on 768px; the HD opening walk
// spans 979px on 1024px. One uniform correction preserves the authored gait.
const BERSERKER_WALK_VISIBLE_SCALE_MULTIPLIER = 765 / 768 / (979 / 1024);
const BERSERKER_WALK_SOLE_Y = 1004 / 1024;
// Overhead sword clearance: the unchanged 768px figure occupies 576px of a 1024px cell.
const BERSERKER_SWORD_IDLE_SCALE = 1024 / 576;
const isBerserkerAuthoredAction = (unitName: string, state?: string): boolean =>
    unitName === "Berserker" &&
    ["hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"].includes(state ?? "");
// The approved death opening frame matches idle height once its 832px canvas is normalized, but its
// opaque body is 495px wide versus idle's 426px on a 768px canvas. Compensate X only, with one fixed
// coefficient for the complete death sequence, so the transition cannot flash wider before the fall.
export const SQUIRE_DEATH_HORIZONTAL_SCALE_MULTIPLIER = 426 / 768 / (495 / 832);

export function authoredIdleFrameDurationMs(
    unitName: string,
    authoredFrameDurationMs: number,
    refreshedFullBodyScale: boolean,
): number {
    if (
        unitName === BEHOLDER_UNIT_NAME ||
        unitName === TROGLODYTE_UNIT_NAME ||
        unitName === BLACKSMITH_UNIT_NAME ||
        unitName === MERMAID_UNIT_NAME ||
        !refreshedFullBodyScale
    ) {
        return authoredFrameDurationMs;
    }
    const unitSpeedMultiplier = unitName === SQUIRE_UNIT_NAME ? SQUIRE_IDLE_SPEED_MULTIPLIER : 1;
    return authoredFrameDurationMs / REFRESHED_IDLE_ANIMATION_SPEED_MULTIPLIER / unitSpeedMultiplier;
}
/** A quadruped must read below a standing humanoid instead of inheriting the shared 1.5-cell height. */
export const WOLF_BOARD_MODEL_HEIGHT_CELLS = 1.05 * 0.99;
// Visible alpha heights measured from the shipped half-resolution Wolf walk atlas. The gait naturally
// crouches by up to ~3%, but switching directly between that crouched frame and the static battlefield
// figure reads as the whole creature changing size. Compensate uniformly around the foot anchor so the
// apparent height stays constant while the authored limb motion remains untouched.
const WOLF_STATIC_VISIBLE_HEIGHT_RATIO = 562 / 768;
const WOLF_WALK_VISIBLE_HEIGHT_RATIOS = [376, 375, 369, 365, 365, 370, 372, 370, 369, 363].map(
    (height) => height / 512,
);
export function wolfWalkFrameScaleMultiplier(frameIndex: number): number {
    const safeIndex = Math.max(0, Math.min(WOLF_WALK_VISIBLE_HEIGHT_RATIOS.length - 1, Math.floor(frameIndex)));
    return WOLF_STATIC_VISIBLE_HEIGHT_RATIO / WOLF_WALK_VISIBLE_HEIGHT_RATIOS[safeIndex];
}
/** Matches Scavenger's measured visible idle silhouette to Squire's measured visible idle height. */
export const SCAVENGER_BOARD_MODEL_HEIGHT_CELLS = (1.5 * (180 / 192) * 186) / 190;
type RefreshedBoardVisualProfile = Readonly<{
    heightCells: number;
    widthScale: number;
    offsetXCells: number;
    offsetYCells?: number;
    footInsetRatio?: number;
}>;
const DEFAULT_REFRESHED_BOARD_VISUAL_PROFILE: RefreshedBoardVisualProfile = {
    heightCells: 1.5,
    widthScale: 1,
    offsetXCells: 0,
};
const REFRESHED_BOARD_VISUAL_PROFILES: Readonly<Record<string, RefreshedBoardVisualProfile>> = {
    Peasant: { heightCells: 1.5, widthScale: 1, offsetXCells: 0.025 },
    Fairy: { heightCells: 1.5, widthScale: 1, offsetXCells: 0, offsetYCells: -0.1 },
    [ORC_UNIT_NAME]: { heightCells: 1.5, widthScale: 1, offsetXCells: 0, offsetYCells: 0.1 },
    [CENTAUR_UNIT_NAME]: { heightCells: 1.5, widthScale: 1, offsetXCells: 0, offsetYCells: 0.15 },
    // Lift only these three figures from the lower cell edge; every other creature keeps the 6% default.
    Arbalester: { heightCells: 1.5, widthScale: 1, offsetXCells: 0, footInsetRatio: 0.3 },
    Blacksmith: { heightCells: 1.5, widthScale: 1, offsetXCells: 0, footInsetRatio: 0.4 },
    Leprechaun: { heightCells: 1.5, widthScale: 1, offsetXCells: 0, footInsetRatio: 0.5 },
    // Low quadrupeds should occupy roughly one tile in height instead of standing as tall as a humanoid.
    [WOLF_UNIT_NAME]: { heightCells: WOLF_BOARD_MODEL_HEIGHT_CELLS, widthScale: 1, offsetXCells: 0.02 },
    [ARACHNA_QUEEN_UNIT_NAME]: { heightCells: 1.15, widthScale: 1, offsetXCells: 0 },
    // These long-bodied L2 creatures remain mechanically 1x1, but their battlefield art is authored
    // across two horizontal cells. Their logical position is already the centre of the 2x1 footprint.
    "White Tiger": { heightCells: 1.18, widthScale: 1.695, offsetXCells: 0 },
    Griffin: { heightCells: 1.5, widthScale: 0.92, offsetXCells: 0 },
    Hyena: { heightCells: 1.25, widthScale: 1.616, offsetXCells: 0 },
    Mantis: { heightCells: 1.5, widthScale: 0.92, offsetXCells: 0 },
    // A slightly taller/narrower projection reads closer to the reared Heroes-III silhouette.
    Manticore: { heightCells: 1.5, widthScale: 1.14, offsetXCells: 0 },
    // Keep the spear free to overhang while centring the fighter's feet in the occupied cell.
    Pikeman: { heightCells: 1.5, widthScale: 1, offsetXCells: 0.14 },
    Unicorn: { heightCells: 1.5, widthScale: 0.93, offsetXCells: 0 },
    Pegasus: { heightCells: 1.425, widthScale: 1, offsetXCells: 0 },
    Nightmare: { heightCells: 1.5, widthScale: 0.98, offsetXCells: 0.05 },
    // Requested proportional 6% reduction.
    Wyvern: { heightCells: 1.41, widthScale: 1.153, offsetXCells: 0 },
};
/** Shared, restrained full-body idle breath used by every battlefield creature. */
export const COMMON_IDLE_BREATH_PERIOD_MS = 2600;
// Art direction: battlefield figures remain rigid at idle. Keep the helper math
// for authored cadence tests, but do not apply breathing scale in production.
export const COMMON_IDLE_BREATH_SETTINGS = { enabled: false };
// Owner-tuned: ten percent stronger than the previous 1.035% vertical breathing motion.
const COMMON_IDLE_BREATH_SCALE_AMPLITUDE = 0.01035 * 1.1;
const COMMON_IDLE_CHEST_EXPANSION_AMPLITUDE = 0.008;
export const ORC_IDLE_BREATH_PERIOD_MS = COMMON_IDLE_BREATH_PERIOD_MS;
const ORC_IDLE_BREATH_SCALE_AMPLITUDE = COMMON_IDLE_BREATH_SCALE_AMPLITUDE;
const ORC_IDLE_CHEST_EXPANSION_AMPLITUDE = COMMON_IDLE_CHEST_EXPANSION_AMPLITUDE;
const WANDERING_MAGE_IDLE_BREATH_PERIOD_MS = ORC_IDLE_BREATH_PERIOD_MS;
const WANDERING_MAGE_IDLE_BREATH_SCALE_AMPLITUDE = ORC_IDLE_BREATH_SCALE_AMPLITUDE;
const WANDERING_MAGE_IDLE_CHEST_EXPANSION_AMPLITUDE = ORC_IDLE_CHEST_EXPANSION_AMPLITUDE;
export const ORC_IDLE_BREATH_CYCLES_PER_AXE_TWIRL = 4;
export const ORC_IDLE_AXE_TWIRL_FRAME_DURATION_MS = 120;
const ORC_IDLE_AXE_TWIRL_FRAME_COUNT = 6;
const ORC_IDLE_AXE_TWIRL_IMAGE_KEY = "orc_idle_axe_twirl_atlas_quarter" as const;
export const ORC_ACTIVE_BATTLE_CRY_BREATH_CYCLES = 5;
export const ORC_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS = 156;
const ORC_ACTIVE_BATTLE_CRY_FRAME_COUNT = 6;
const ORC_ACTIVE_BATTLE_CRY_IMAGE_KEY = "orc_idle_battle_cry_atlas_quarter" as const;
const ORC_ACTIVE_BATTLE_CRY_FOOT_ANCHOR_Y = 215 / 224;
// The battle-cry canvas is taller so the raised axe is never clipped. Render against the normal
// 192px Orc reference height so his body does not shrink when the texture switches to 224px.
const ORC_ACTIVE_BATTLE_CRY_RENDER_HEIGHT = 192;
const EFREET_FIRE_IDLE_FRAME_COUNT = 12;
const EFREET_FIRE_IDLE_FRAME_DURATION_MS = 90;
const EFREET_FIRE_IDLE_IMAGE_KEY = "efreet_idle_atlas_quarter" as const;
const THIEF_IDLE_BREATH_PERIOD_MS = 2800;
// Scavenger shares the Orc's stronger full-body breath: a visible rise plus a small chest expansion.
const THIEF_IDLE_BREATH_SCALE_AMPLITUDE = ORC_IDLE_BREATH_SCALE_AMPLITUDE;
const THIEF_IDLE_CHEST_EXPANSION_AMPLITUDE = ORC_IDLE_CHEST_EXPANSION_AMPLITUDE;
export const SCAVENGER_IDLE_BREATH_CYCLES_PER_BLADE_TWIRL = 4;
export const SCAVENGER_ACTIVE_BATTLE_CRY_BREATH_CYCLES = 4;
export const SCAVENGER_FLOURISH_FRAME_DURATION_MS = 120;
const SCAVENGER_FLOURISH_FRAME_COUNT = 6;
// Battle cry is deliberately more readable than the idle blade flourish: play its moving poses at
// 85% of the old speed, then hold the penultimate pointing pose for a full second.
export const SCAVENGER_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS = Math.round(SCAVENGER_FLOURISH_FRAME_DURATION_MS / 0.85);
export const SCAVENGER_ACTIVE_BATTLE_CRY_POINT_HOLD_MS = 1000;
const SCAVENGER_ACTIVE_BATTLE_CRY_POINT_FRAME = SCAVENGER_FLOURISH_FRAME_COUNT - 2;
const SCAVENGER_ACTIVE_BATTLE_CRY_FRAME_DURATIONS_MS = Array.from(
    { length: SCAVENGER_FLOURISH_FRAME_COUNT },
    (_, frame) =>
        frame === SCAVENGER_ACTIVE_BATTLE_CRY_POINT_FRAME
            ? SCAVENGER_ACTIVE_BATTLE_CRY_POINT_HOLD_MS
            : SCAVENGER_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS,
);
export const SCAVENGER_ACTIVE_BATTLE_CRY_DURATION_MS = SCAVENGER_ACTIVE_BATTLE_CRY_FRAME_DURATIONS_MS.reduce(
    (total, duration) => total + duration,
    0,
);
const SCAVENGER_IDLE_BLADE_TWIRL_IMAGE_KEY = "thief_idle_blade_twirl_atlas_quarter" as const;
const SCAVENGER_ACTIVE_BATTLE_CRY_IMAGE_KEY = "thief_idle_battle_cry_atlas_quarter" as const;
const SCAVENGER_FLOURISH_FOOT_ANCHOR_Y = 190 / 192;
// The generated 192px square contains about 185px of authored character height. Size against that
// reference so switching away from the narrower idle canvas does not make the Scavenger shrink.
const SCAVENGER_FLOURISH_RENDER_HEIGHT = 185;
// Visual cadence only: this does not affect board movement speed or path duration.
const WANDERING_MAGE_WALK_FPS = 13.44;
// Shared by every existing and newly added locomotion loop. One cycle spans 1.3 travelled cells.
export const CREATURE_WALK_CYCLE_DISTANCE_CELLS = 1.3;
// Both sources use a 768px square, but the HD opening walk pose occupies only 517px versus
// 697px in the battlefield figure (alpha > 128). Keep this correction constant across the gait:
// measuring each pose separately would stretch the robe as the legs cross.
const WANDERING_MAGE_WALK_VISIBLE_WIDTH_MULTIPLIER = 697 / 517;
// Visible sole rows (alpha > 64) in the approved 192px walk frames. Preserve the
// static figure's 32px gap between its 730px anchor and its 762px sole row.
const ARBALESTER_WALK_SOLE_ROWS = [191, 189, 183, 183, 183, 188, 190, 190] as const;
const ARBALESTER_WALK_TOP_ROWS = [10, 11, 10, 8, 11, 10, 9, 9] as const;
// The lab redraw occupies 344px of its padded 384px canvas; match the static 727/768 silhouette.
const ARBALESTER_LAB_RENDER_SCALE = 727 / 688;
// The walk drawing has narrower shoulders and waist than idle despite its matching standing height.
const ARBALESTER_WALK_HORIZONTAL_SCALE = 1.08;
// The source walk's helmet/body are about 10% narrower than the canonical static figure.
// Keep this correction constant through the gait; foot spacing must not drive per-frame stretching.
const PIKEMAN_WALK_HORIZONTAL_SCALE = 1.1;
// The canonical idle spans 516 opaque pixels; the matching walk entry spans 453.
// One fixed correction preserves the authored gait without frame-to-frame width pumping.
const BATTLE_MAGE_LAB_WALK_WIDTH_SCALE = 516 / 453;
const ARBALESTER_LAB_FOOT_ANCHOR_Y = 369 / 384 - 32 / (768 * ARBALESTER_LAB_RENDER_SCALE);
const ARBALESTER_ATTACK_STATES = [
    "attack",
    "attack_up",
    "attack_down",
    "melee_attack",
    "melee_attack_up",
    "melee_attack_down",
] as const;
function isArbalesterAttack(stateName: string): boolean {
    return (ARBALESTER_ATTACK_STATES as readonly string[]).includes(stateName);
}
function arbalesterWalkScaleMultiplier(frameIndex: number): number {
    const index = frameIndex % ARBALESTER_WALK_SOLE_ROWS.length;
    // The static cutout spans rows 35..762 of its 768px canvas.
    return 727 / 768 / ((ARBALESTER_WALK_SOLE_ROWS[index] - ARBALESTER_WALK_TOP_ROWS[index]) / 192);
}
function arbalesterWalkFootAnchorY(frameIndex: number): number {
    return (
        ARBALESTER_WALK_SOLE_ROWS[frameIndex % ARBALESTER_WALK_SOLE_ROWS.length] / 192 -
        32 / (768 * arbalesterWalkScaleMultiplier(frameIndex))
    );
}
// Squire keeps its duplicate closing frame outside the repeating gait.
// Match the authored attack anatomy to Peasant's 701px live static battlefield silhouette. The generated
// coherent redraws keep one internal character scale in every frame. The runtime therefore uses one
// fixed multiplier per direction: no per-frame zoom means no silhouette pulse during the strike.
export const PEASANT_ATTACK_RENDER_SCALE = 701 / 438;
export const PEASANT_DIAGONAL_ATTACK_RENDER_SCALE = 701 / 443;
// Skip the two upward wind-up poses. Hold the downward impact and recovery for one
// extra tick each, preserving the eight-tick attack duration and the idle seam.
export const PEASANT_ATTACK_DOWN_FRAME_ORDER = [0, 3, 4, 5, 5, 6, 6, 7] as const;
export const PEASANT_ATTACK_FRAME_SCALE_FACTORS = Object.freeze({
    attack: [1, 1, 1, 1, 1, 1, 1, 1],
    attack_up: [1, 1, 1, 1, 1, 1, 1, 1],
    attack_down: [1, 1, 1, 1, 1, 1, 1, 1],
} satisfies Readonly<Record<string, readonly number[]>>);
export const PEASANT_ATTACK_HORIZONTAL_FRAME_FACTORS: Readonly<Record<string, readonly number[]>> = Object.freeze({
    // The coherent redraw is authored at one body scale. Match horizontal and vertical scale exactly
    // in every frame so the final idle seam cannot widen or "grow" when the one-shot ends.
    attack: [
        PEASANT_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_ATTACK_RENDER_SCALE / 1.46,
    ],
    attack_up: [
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
    ],
    attack_down: [
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
        PEASANT_DIAGONAL_ATTACK_RENDER_SCALE / 1.46,
    ],
});
export const PEASANT_ATTACK_END_RENDER_SCALE =
    PEASANT_ATTACK_RENDER_SCALE * PEASANT_ATTACK_FRAME_SCALE_FACTORS.attack[7];
export const PEASANT_ATTACK_UP_RECOVERY_RENDER_SCALES = [
    PEASANT_DIAGONAL_ATTACK_RENDER_SCALE * PEASANT_ATTACK_FRAME_SCALE_FACTORS.attack_up[6],
    PEASANT_DIAGONAL_ATTACK_RENDER_SCALE * PEASANT_ATTACK_FRAME_SCALE_FACTORS.attack_up[7],
] as const;
export const PEASANT_ATTACK_DOWN_END_RENDER_SCALE =
    PEASANT_DIAGONAL_ATTACK_RENDER_SCALE * PEASANT_ATTACK_FRAME_SCALE_FACTORS.attack_down[7];
// Match the approved death opening pose (629px visible height) to Peasant's 701px static figure.
// Keep this one coefficient for the full fall so the runtime never zooms between authored frames.
export const PEASANT_DEATH_RENDER_SCALE = 701 / 629;
// The last two poses lift the supporting forearm even after the atlas's ground correction.
// Register the body contact, not the lower pitchfork tips. Runtime offsets also leave room
// below the atlas canvas, so settling the corpse cannot clip the weapon.
const PEASANT_DEATH_SETTLE_OFFSET_Y = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 38, 30] as const;
const PEASANT_IDLE_SUPPORT_FOOT_OFFSET_X = 289 - 384;
export const PEASANT_ATTACK_EFFECTIVE_X_SCALE = 1.46;
const PEASANT_ATTACK_SUPPORT_FOOT_X: Readonly<Record<string, readonly number[]>> = {
    // The four-tine heads need 24px more room at full extension. The atlas shifts every
    // pose left by that amount; moving its anchor equally preserves the world-space boot.
    attack: [265, 265.34, 265, 264, 211, 226, 265, 265],
    attack_up: [265, 265, 265, 265, 265, 265, 265, 265],
    attack_down: [265, 265, 265, 265, 265.04, 265, 265, 265],
};
// Attacking figures must remain above every normally depth-sorted battlefield creature. Ground shadows
// deliberately retain their natural board depth so only the acting figure moves to the foreground.
export const CREATURE_ATTACK_FOREGROUND_Z_INDEX = 8000;
// Centaur keeps normal board interpolation while its authored gait uses the accumulated boosts:
// 25%, then 20%, then 7% (1.25 * 1.2 * 1.07 = 1.605).
const CENTAUR_WALK_FPS_MULTIPLIER = 1.605;
// Ground travel is 16 cells/second, so two cells take 125ms. Six Scavenger/Thief gait poses must
// advance in that interval: 6 / 0.125 = 48fps. The authored atlas declares 10fps, hence 4.8x.
const THIEF_WALK_FPS_MULTIPLIER = 4.8;
// Keep every authored action frame, but play the complete combat sequence in half the old time.
// Idle breathing and the movement loop deliberately retain their calmer cadence.
const WANDERING_MAGE_COMBAT_ANIMATION_DURATION_MULTIPLIER = 0.5;
const WANDERING_MAGE_IDLE_VISIBLE_HEIGHT_PX = 180;
// Opaque subject heights measured from the shipped quarter-resolution sheets. Normalizing only the
// legacy ranged poses prevents their wider square canvases from making the mage zoom out mid-action.
// New cast, melee, hit and death frames preserve their authored body proportions.
const WANDERING_MAGE_ACTION_VISIBLE_HEIGHTS: Readonly<Record<string, readonly number[]>> = {
    attack: [162, 160, 157, 155, 153, 153, 159, 160],
    attack_up: [155, 152, 167, 171, 171, 148, 150, 151],
    attack_down: [165, 150, 140, 124, 137, 152, 165, 172],
};
// Preserve the previously approved boosts, then apply the new relative increases on top.
const ATTACK_ANIMATION_SPEED_MULTIPLIER = 1.4 * 1.22;
const HIT_ANIMATION_SPEED_MULTIPLIER = 1.22;
const DEATH_ANIMATION_SPEED_MULTIPLIER = 2 * 1.2;
const SQUIRE_DEATH_ADDITIONAL_SPEED_MULTIPLIER = 1.15;
// Preserve the shared death cadence and approved +35%/+10%/+16%, then apply the requested +15% increase.
const PEASANT_DEATH_ADDITIONAL_SPEED_MULTIPLIER = 1.35 * 1.1 * 1.16 * 1.15;
const SCAVENGER_DEATH_ADDITIONAL_SPEED_MULTIPLIER = 1.12;
// Preserve the previously approved +20%/+15%, then apply the requested additional +10% on top.
const PEASANT_ATTACK_ADDITIONAL_SPEED_MULTIPLIER = 1.2 * 1.15 * 1.1;
// Five fixed 240 Hz simulation steps per pose. This removes the alternating 5/6-step dwell that
// made the horizontal strike look like individual frames were flashing, without materially changing speed.
export const PEASANT_SIDE_ATTACK_FRAME_DURATION_MS = 1000 / 48;
// Approved base animations run independently of the master switch for legacy creature sheets.
export { CREATURE_SPRITE_ANIMATION_SETTINGS } from "@/pixi/creatureAnimationSettings";

function usesApprovedPermanentIdleAtlas(unitName: string): boolean {
    return (
        unitName === MERMAID_UNIT_NAME ||
        unitName === ORC_UNIT_NAME ||
        unitName === BLACKSMITH_UNIT_NAME ||
        unitName === PEASANT_UNIT_NAME ||
        unitName === BEHOLDER_UNIT_NAME ||
        unitName === WANDERING_MAGE_UNIT_NAME ||
        unitName === SQUIRE_UNIT_NAME ||
        unitName === TROGLODYTE_UNIT_NAME ||
        unitName === WOLF_RIDER_UNIT_NAME ||
        unitName === WOLF_UNIT_NAME
    );
}

/** Keep individually approved idle loops active while other creature atlases remain frozen. */
export function creatureIdleAnimationEnabledForUnit(unitName: string): boolean {
    return (
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled ||
        usesApprovedBaseAnimations(unitName) ||
        usesApprovedPermanentIdleAtlas(unitName)
    );
}

/** Resolve a looping authored idle frame whose poses have independent durations. */
export function authoredIdleFrameForElapsed(
    elapsedMs: number,
    frameDurationsMs: readonly number[],
    cycleEndPauseMs = 0,
): number {
    if (frameDurationsMs.length <= 1) return 0;
    const durations = frameDurationsMs.map((duration) => (Number.isFinite(duration) && duration > 0 ? duration : 1));
    const cycleMs = durations.reduce((total, duration) => total + duration, 0);
    const pauseMs = Number.isFinite(cycleEndPauseMs) ? Math.max(0, cycleEndPauseMs) : 0;
    const repeatMs = cycleMs + pauseMs;
    let cursorMs = ((elapsedMs % repeatMs) + repeatMs) % repeatMs;
    if (cursorMs >= cycleMs) return 0;
    for (let index = 0; index < durations.length; index += 1) {
        if (cursorMs < durations[index]) return index;
        cursorMs -= durations[index];
    }
    return durations.length - 1;
}

// Source combat canvas is resized to 630px and placed at (83, 92) in the 768px lab frames.
const MANTICORE_LAB_WALK_SCALE = 768 / 630;
const MANTICORE_LAB_WALK_ANCHOR_X = (83 + 384 / MANTICORE_LAB_WALK_SCALE) / 768;

/** Keep individually approved walks active while the global creature-animation freeze remains in place. */
export function creatureWalkAnimationEnabledForUnit(unitName: string, labPreview = false): boolean {
    return (
        (labPreview && unitName === "Manticore") ||
        (labPreview && unitName === "White Tiger") ||
        (labPreview && unitName === "Valkyrie") ||
        (labPreview && unitName === TROLL_UNIT_NAME) ||
        (labPreview && (unitName === "Healer" || unitName === "Battle Mage" || unitName === "Elf")) ||
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled ||
        usesApprovedBaseAnimations(unitName) ||
        (labPreview &&
            (unitName === "Fairy" ||
                unitName === "Medusa" ||
                unitName === "Pikeman" ||
                unitName === DRYAD_UNIT_NAME)) ||
        (labPreview &&
            (unitName === "Berserker" || unitName === CENTAUR_UNIT_NAME || unitName === LEPRECHAUN_UNIT_NAME)) ||
        unitName === MERMAID_UNIT_NAME ||
        unitName === ORC_UNIT_NAME ||
        unitName === PEASANT_UNIT_NAME ||
        unitName === SQUIRE_UNIT_NAME ||
        unitName === WOLF_UNIT_NAME ||
        unitName === WOLF_RIDER_UNIT_NAME ||
        unitName === WANDERING_MAGE_UNIT_NAME ||
        unitName === SCAVENGER_UNIT_NAME ||
        unitName === BLACKSMITH_UNIT_NAME ||
        unitName === TROGLODYTE_UNIT_NAME ||
        unitName === ARBALESTER_UNIT_NAME
    );
}

function isWolfRiderAction(stateName: string): boolean {
    return (
        stateName === "hit" ||
        stateName === "death" ||
        stateName === "attack" ||
        stateName === "attack_up" ||
        stateName === "attack_down"
    );
}

export function isOrcMeleeAttack(stateName: string | undefined): boolean {
    return stateName === "melee_attack" || stateName === "melee_attack_up" || stateName === "melee_attack_down";
}

export function isOrcRangedAttack(stateName: string | undefined): boolean {
    return stateName === "attack" || stateName === "attack_up" || stateName === "attack_down";
}

function isOrcAuthoredAction(stateName: string | undefined): boolean {
    return stateName === "hit" || stateName === "death" || isOrcMeleeAttack(stateName) || isOrcRangedAttack(stateName);
}

function orcActionCanvasScale(stateName: string | undefined): number {
    return isOrcMeleeAttack(stateName) || isOrcRangedAttack(stateName) ? 1024 / 768 : 1;
}

function isWanderingMageMeleeAttack(stateName: string | undefined): boolean {
    return stateName === "melee_attack" || stateName === "melee_attack_up" || stateName === "melee_attack_down";
}

function isWanderingMageAuthoredAction(stateName: string | undefined): boolean {
    return (
        stateName === "hit" || stateName === "death" || stateName === "cast" || isWanderingMageMeleeAttack(stateName)
    );
}

function wanderingMageActionCanvasScale(stateName: string | undefined): number {
    return isWanderingMageMeleeAttack(stateName) || stateName === "cast" ? 1024 / 768 : 1;
}

function isBlacksmithSpriteAttack(stateName: string | undefined): boolean {
    return stateName === "melee_attack" || stateName === "melee_attack_up" || stateName === "melee_attack_down";
}

function blacksmithActionCanvasScale(stateName: string | undefined): number {
    return isBlacksmithSpriteAttack(stateName) || stateName === "cast" ? 1024 / 768 : 1;
}

function isBlacksmithAuthoredAction(stateName: string | undefined): boolean {
    return stateName === "hit" || stateName === "death" || stateName === "cast" || isBlacksmithSpriteAttack(stateName);
}

function isTroglodyteSpriteAttack(stateName: string | undefined): boolean {
    return stateName === "attack" || stateName === "attack_up" || stateName === "attack_down";
}

function isTroglodyteAuthoredAction(stateName: string | undefined): boolean {
    return stateName === "hit" || stateName === "death" || isTroglodyteSpriteAttack(stateName);
}

function isMermaidSpriteAttack(stateName: string | undefined): boolean {
    return stateName === "melee_attack" || stateName === "melee_attack_up" || stateName === "melee_attack_down";
}

function isMermaidAuthoredAction(stateName: string | undefined): boolean {
    return stateName === "hit" || stateName === "death" || isMermaidSpriteAttack(stateName);
}

function mermaidActionCanvasScale(stateName: string | undefined): number {
    return isMermaidSpriteAttack(stateName) ? 1152 / 768 : 1;
}

function isWolfSpriteAttack(stateName: string | undefined): boolean {
    return stateName === "attack" || stateName === "attack_up" || stateName === "attack_down";
}

function isWolfAuthoredAction(stateName: string | undefined): boolean {
    return stateName === "hit" || stateName === "death" || isWolfSpriteAttack(stateName);
}

/** Attack canvases add 128 pixels on each side of the unchanged 768-pixel figure. */
function wolfActionCanvasScale(stateName: string | undefined): number {
    return isWolfSpriteAttack(stateName) ? 1024 / 768 : 1;
}

/** Retain authored pose timing while applying the approved death playback speed. */
function wolfActionFrameDurations(stateName: string, durations: readonly number[]): readonly number[] {
    return stateName === "death" ? durations.map((duration) => duration / 1.12) : durations;
}

function troglodyteActionCanvasScale(stateName: string | undefined): number {
    return isTroglodyteSpriteAttack(stateName) ? 1280 / 768 : 1;
}

/** Keep individually approved one-shot animations active while the global art freeze remains in place. */
export function creatureOneShotAnimationEnabledForUnit(unitName: string, stateName: string): boolean {
    if (unitName === BLACKSMITH_UNIT_NAME && ["attack", "attack_up", "attack_down"].includes(stateName)) return false;
    return (
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled ||
        (usesApprovedBaseAnimations(unitName) &&
            (["hit", "death"].includes(stateName) ||
                (unitName === "Battle Mage" && (stateName === "cast" || isOrcMeleeAttack(stateName))) ||
                (unitName === TROLL_UNIT_NAME && (stateName === "cast" || isTrollLabAttack(stateName))) ||
                (unitName === "Healer" &&
                    (stateName === "cast" || isOrcMeleeAttack(stateName) || isOrcRangedAttack(stateName))) ||
                (unitName === "White Tiger" && (isOrcMeleeAttack(stateName) || isOrcRangedAttack(stateName))) ||
                (isOrcRangedAttack(stateName) &&
                    ["Scavenger", "Orc", "Arbalester", "Dryad", "Centaur", "Elf", "Medusa"].includes(unitName)) ||
                (isOrcMeleeAttack(stateName) &&
                    [
                        "Fairy",
                        "Leprechaun",
                        "Berserker",
                        "Orc",
                        "Arbalester",
                        "Dryad",
                        "Centaur",
                        "Manticore",
                        "Elf",
                        "Medusa",
                    ].includes(unitName)))) ||
        (unitName === MERMAID_UNIT_NAME && isMermaidAuthoredAction(stateName)) ||
        (unitName === WOLF_UNIT_NAME && isWolfAuthoredAction(stateName)) ||
        (unitName === ORC_UNIT_NAME && isOrcAuthoredAction(stateName)) ||
        (unitName === TROGLODYTE_UNIT_NAME && isTroglodyteAuthoredAction(stateName)) ||
        (unitName === WANDERING_MAGE_UNIT_NAME && isWanderingMageAuthoredAction(stateName)) ||
        (unitName === WOLF_RIDER_UNIT_NAME && isWolfRiderAction(stateName)) ||
        (unitName === BLACKSMITH_UNIT_NAME && isBlacksmithAuthoredAction(stateName)) ||
        (unitName === SQUIRE_UNIT_NAME &&
            (stateName === "hit" || stateName === "death" || isSquireSpriteAttack(stateName))) ||
        (unitName === PEASANT_UNIT_NAME &&
            (stateName === "attack" ||
                stateName === "attack_up" ||
                stateName === "attack_down" ||
                stateName === "hit" ||
                stateName === "death"))
    );
}

/** All creatures use authored sprite motion without additional whole-sprite overlays. */
export function creatureGenericWholeSpriteMotionEnabledForLevel(_unitLevel: number): boolean {
    return false;
}

export function creatureGenericCombatMotionEnabledForUnit(unitName: string, unitLevel: number): boolean {
    return creatureGenericWholeSpriteMotionEnabledForLevel(unitLevel) && unitName !== PEASANT_UNIT_NAME;
}
// Battlefield units expose their compact team/count ribbon. Stack power remains mechanical state and no
// longer allocates a separate pip rail.
const SHOW_BOARD_STACK_DECORATIONS = true;

const inheritedAbsoluteScale = (container: Container, output?: HoCMath.XY): HoCMath.XY => {
    let x = 1;
    let y = 1;
    let current: Container | null = container;
    while (current) {
        x *= Math.abs(current.scale.x);
        y *= Math.abs(current.scale.y);
        current = current.parent;
    }
    const scale = output ?? { x: 1, y: 1 };
    scale.x = x;
    scale.y = y;
    return scale;
};

export function isAttackAnimationStateName(stateName: string): boolean {
    return (
        stateName === "attack" ||
        stateName.startsWith("attack_") ||
        stateName === "melee_attack" ||
        stateName.startsWith("melee_attack_")
    );
}

/** The three authored Squire attacks have extra canvas space for the weapon arc. */
export function isSquireSpriteAttack(stateName: string | undefined): boolean {
    return stateName === "attack" || stateName === "attack_up" || stateName === "attack_down";
}

export function squireActionCanvasScale(stateName: string | undefined): number {
    return isSquireSpriteAttack(stateName) ? 1024 / 768 : 1;
}

export function oneShotAnimationDurationMultiplier(unitName: string, stateName: string): number {
    const isAttack = isAttackAnimationStateName(stateName);
    if (unitName === ORC_UNIT_NAME && isOrcAuthoredAction(stateName)) return 1;

    // Troglodyte actions preserve the same authored timing in combat and the local preview.
    if (unitName === TROGLODYTE_UNIT_NAME && isTroglodyteAuthoredAction(stateName)) {
        const meta = animationAtlases[TROGLODYTE_UNIT_NAME]?.[stateName];
        return meta?.loopDurationMs ? (meta.totalDurationSec * 1000) / meta.loopDurationMs : 1 / 0.9;
    }

    // Keep Squire attacks/hits and Blacksmith actions on their authored cadence.
    if (
        (unitName === SQUIRE_UNIT_NAME && (stateName === "hit" || isSquireSpriteAttack(stateName))) ||
        (unitName === BLACKSMITH_UNIT_NAME && isBlacksmithAuthoredAction(stateName))
    ) {
        const meta = animationAtlases[unitName]?.[stateName];
        return meta?.loopDurationMs ? (meta.totalDurationSec * 1000) / meta.loopDurationMs : 1 / 0.9;
    }

    // Recover the authored Peasant hit cadence from the registry. Runtime keeps the approved fast
    // reaction, with the subsequent 15%, 20% and 13% slow-downs applied cumulatively to the former
    // 2.25x setting: source/preview stays 75 ms/frame, runtime is 51.98 ms/frame (~416 ms total).
    if (unitName === PEASANT_UNIT_NAME && stateName === "hit") {
        const meta = animationAtlases[PEASANT_UNIT_NAME]?.[stateName];
        if (meta?.loopDurationMs) {
            return (meta.frameDurationSec * 1000 * meta.frameCount) / meta.loopDurationMs / (2.25 / 1.15 / 1.2 / 1.13);
        }
        return 1 / 0.9 / (2.25 / 1.15 / 1.2 / 1.13);
    }

    // The atlas registry deliberately shortens totalDurationSec by 10% and rounds its loop to whole
    // milliseconds. Recover the authored Peasant timing from the generated metadata so successive speed
    // reviews remain exact instead of accumulating a small rounding error in battle.
    if (unitName === PEASANT_UNIT_NAME && isAttack) {
        const meta = animationAtlases[PEASANT_UNIT_NAME]?.[stateName];
        if (meta?.loopDurationMs) {
            return (
                (meta.frameDurationSec * 1000 * meta.frameCount) /
                meta.loopDurationMs /
                PEASANT_ATTACK_ADDITIONAL_SPEED_MULTIPLIER
            );
        }
        return 1 / 0.9 / PEASANT_ATTACK_ADDITIONAL_SPEED_MULTIPLIER;
    }

    // Reactions carry their own authored timing; retain the existing cadence for other Mage actions.
    if (unitName === WANDERING_MAGE_UNIT_NAME) {
        return isWanderingMageAuthoredAction(stateName) ? 1 : WANDERING_MAGE_COMBAT_ANIMATION_DURATION_MULTIPLIER;
    }

    let multiplier = 1;
    if (isAttack) multiplier /= ATTACK_ANIMATION_SPEED_MULTIPLIER;
    if (stateName === "hit") multiplier /= HIT_ANIMATION_SPEED_MULTIPLIER;
    if (stateName === "death") {
        multiplier /=
            DEATH_ANIMATION_SPEED_MULTIPLIER *
            (unitName === SQUIRE_UNIT_NAME ? SQUIRE_DEATH_ADDITIONAL_SPEED_MULTIPLIER : 1) *
            (unitName === PEASANT_UNIT_NAME ? PEASANT_DEATH_ADDITIONAL_SPEED_MULTIPLIER : 1) *
            (unitName === SCAVENGER_UNIT_NAME ? SCAVENGER_DEATH_ADDITIONAL_SPEED_MULTIPLIER : 1);
    }
    return multiplier;
}

/** Keep a differently sized atlas frame at the same on-screen height until the next layout sync. */
export function textureSwapHeightScaleRatio(previousHeight: number, nextHeight: number): number {
    return Number.isFinite(previousHeight) && previousHeight > 0 && Number.isFinite(nextHeight) && nextHeight > 0
        ? previousHeight / nextHeight
        : 1;
}

export function ashMothActionScaleMultiplier(stateName: string, frameIndex: number): number {
    const heights = WANDERING_MAGE_ACTION_VISIBLE_HEIGHTS[stateName];
    if (!heights?.length) return 1;
    const safeFrameIndex = Math.max(0, Math.min(heights.length - 1, Math.floor(frameIndex)));
    return WANDERING_MAGE_IDLE_VISIBLE_HEIGHT_PX / heights[safeFrameIndex];
}

export function peasantActionScaleMultiplier(stateName: string, frameIndex = 0): number {
    const safeFrameIndex = Math.max(0, Math.min(7, Math.floor(frameIndex)));
    if (stateName === "attack") {
        return PEASANT_ATTACK_RENDER_SCALE * PEASANT_ATTACK_FRAME_SCALE_FACTORS.attack[safeFrameIndex];
    }
    if (stateName === "attack_up") {
        return PEASANT_DIAGONAL_ATTACK_RENDER_SCALE * PEASANT_ATTACK_FRAME_SCALE_FACTORS.attack_up[safeFrameIndex];
    }
    if (stateName === "attack_down") {
        return PEASANT_DIAGONAL_ATTACK_RENDER_SCALE * PEASANT_ATTACK_FRAME_SCALE_FACTORS.attack_down[safeFrameIndex];
    }
    if (stateName === "death") return PEASANT_DEATH_RENDER_SCALE;
    return 1;
}

export function peasantAttackHorizontalScaleMultiplier(stateName: string, frameIndex = 0): number {
    const factors = PEASANT_ATTACK_HORIZONTAL_FRAME_FACTORS[stateName];
    if (!factors) return 1;
    const safeFrameIndex = Math.max(0, Math.min(factors.length - 1, Math.floor(frameIndex)));
    const effectiveXScale = PEASANT_ATTACK_EFFECTIVE_X_SCALE * factors[safeFrameIndex];
    return effectiveXScale / peasantActionScaleMultiplier(stateName, safeFrameIndex);
}

/** Keep the planted boot at the same world X as Peasant's idle support foot in every attack frame. */
export function peasantAttackAnchorX(stateName: string, frameIndex = 0): number {
    const contacts = PEASANT_ATTACK_SUPPORT_FOOT_X[stateName];
    if (!contacts?.length) return 0.5;
    const safeFrameIndex = Math.max(0, Math.min(contacts.length - 1, Math.floor(frameIndex)));
    const horizontalFactor = PEASANT_ATTACK_HORIZONTAL_FRAME_FACTORS[stateName]?.[safeFrameIndex] ?? 1;
    const effectiveXScale = PEASANT_ATTACK_EFFECTIVE_X_SCALE * horizontalFactor;
    const sourceFrameIndex =
        stateName === "attack_down" ? PEASANT_ATTACK_DOWN_FRAME_ORDER[safeFrameIndex] : safeFrameIndex;
    const anchorPixels = contacts[sourceFrameIndex] - PEASANT_IDLE_SUPPORT_FOOT_OFFSET_X / effectiveXScale;
    return anchorPixels / 768;
}

export function peasantDeathAnchorY(authoredAnchorY: number, frameIndex: number): number {
    const index = Math.max(0, Math.min(PEASANT_DEATH_SETTLE_OFFSET_Y.length - 1, Math.floor(frameIndex)));
    return authoredAnchorY - PEASANT_DEATH_SETTLE_OFFSET_Y[index] / 768;
}

export function resolveAnimationAtlasState(unitName: string, stateName: string): string {
    // Mage's approved melee clips are swapped for upper/lower targets, including lab playback.
    if (unitName === WANDERING_MAGE_UNIT_NAME) {
        if (stateName === "melee_attack_up") return "melee_attack_down";
        if (stateName === "melee_attack_down") return "melee_attack_up";
    }
    return stateName;
}

/** Board art uses its authored orientation; Centaur is intentionally mirrored from its previous direction. */
export function nativeBoardFacingMultiplier(_unitName: string): -1 | 1 {
    return 1;
}

/** During placement both armies face the battlefield centre: green from the left, red from the right. */
export function placementFacingDirectionForTeam(team: TeamType): -1 | 1 {
    return team === TeamVals.RIGHT ? -1 : 1;
}

/** Mirror the authored flag anchor with the creature while keeping the flag graphics and text upright. */
export function flagOffsetXForFacing(flagOffsetXCells: number, facingDirection: -1 | 1): number {
    return flagOffsetXCells * facingDirection;
}

/**
 * Deployment facing for a PREVIEW that may not know its team yet. The army overlay is a team-less
 * catalog — its chips carry NO_TEAM until the drop assigns a side — so a ghost hovering the RIGHT half
 * of the board must already face left the way the dropped unit will (the "ghost points right until I
 * place it" bug). A real team always wins; the board-half rule only fills the teamless gap. World x = 0
 * is the battlefield centre line.
 */
export function previewPlacementFacing(team: TeamType, worldX: number): -1 | 1 {
    if (team === TeamVals.RIGHT || team === TeamVals.LEFT) {
        return placementFacingDirectionForTeam(team);
    }
    return worldX > 0 ? -1 : 1;
}

export type AttackAnimationVerticalBand = "up" | "side" | "down";

/**
 * Resolve the authored attack band from occupied grid rows.
 *
 * Grid Y grows upward: an attacker wholly above the target strikes downward, an attacker wholly below
 * strikes upward, and any overlap between their occupied row ranges uses the side animation. Comparing
 * ranges instead of centers is what makes both rows of a 2x2 target valid side-attack rows.
 */
export function attackAnimationVerticalBandForFootprints(
    attackerCells: readonly HoCMath.XY[],
    targetCells: readonly HoCMath.XY[],
): AttackAnimationVerticalBand | undefined {
    if (!attackerCells.length || !targetCells.length) return undefined;
    const attackerMinY = Math.min(...attackerCells.map((cell) => cell.y));
    const attackerMaxY = Math.max(...attackerCells.map((cell) => cell.y));
    const targetMinY = Math.min(...targetCells.map((cell) => cell.y));
    const targetMaxY = Math.max(...targetCells.map((cell) => cell.y));
    if (attackerMinY > targetMaxY) return "down";
    if (attackerMaxY < targetMinY) return "up";
    return "side";
}

/** A strictly vertical 1x1-vs-1x1 attack keeps the horizontal facing established by movement. */
export function preservesFacingForPureVerticalSingleCellAttack(
    attackerCells: readonly HoCMath.XY[],
    targetCells: readonly HoCMath.XY[],
): boolean {
    if (attackerCells.length !== 1 || targetCells.length !== 1) return false;
    return attackerCells[0].x === targetCells[0].x && attackerCells[0].y !== targetCells[0].y;
}

export function commonIdleBreathScalesForElapsed(elapsedMs: number): { x: number; y: number } {
    const breath = Math.sin((elapsedMs / COMMON_IDLE_BREATH_PERIOD_MS) * Math.PI * 2);
    return {
        // Broaden only on inhale so the creature never looks unnaturally pinched on exhale.
        x: 1 + Math.max(0, breath) * COMMON_IDLE_CHEST_EXPANSION_AMPLITUDE,
        y: 1 + breath * COMMON_IDLE_BREATH_SCALE_AMPLITUDE,
    };
}

export function ashMothIdleBreathScaleForElapsed(elapsedMs: number): number {
    return ashMothIdleBreathScalesForElapsed(elapsedMs).y;
}

export function ashMothIdleBreathScalesForElapsed(elapsedMs: number, out?: HoCMath.XY): HoCMath.XY {
    const breath = Math.sin((elapsedMs / WANDERING_MAGE_IDLE_BREATH_PERIOD_MS) * Math.PI * 2);
    const scales = out ?? { x: 1, y: 1 };
    scales.x = 1 + Math.max(0, breath) * WANDERING_MAGE_IDLE_CHEST_EXPANSION_AMPLITUDE;
    scales.y = 1 + breath * WANDERING_MAGE_IDLE_BREATH_SCALE_AMPLITUDE;
    return scales;
}

export function thiefIdleBreathScaleForElapsed(elapsedMs: number): number {
    return thiefIdleBreathScalesForElapsed(elapsedMs).y;
}

export function thiefIdleBreathScalesForElapsed(elapsedMs: number, out?: HoCMath.XY): HoCMath.XY {
    const breath = Math.sin((elapsedMs / THIEF_IDLE_BREATH_PERIOD_MS) * Math.PI * 2);
    const scales = out ?? { x: 1, y: 1 };
    scales.x = 1 + Math.max(0, breath) * THIEF_IDLE_CHEST_EXPANSION_AMPLITUDE;
    scales.y = 1 + breath * THIEF_IDLE_BREATH_SCALE_AMPLITUDE;
    return scales;
}

/** The compact two-dagger flourish plays once after every four complete inactive breathing cycles. */
export function scavengerIdleBladeTwirlFrameForElapsed(elapsedMs: number): number | undefined {
    const breathingWindowMs = THIEF_IDLE_BREATH_PERIOD_MS * SCAVENGER_IDLE_BREATH_CYCLES_PER_BLADE_TWIRL;
    const flourishWindowMs = SCAVENGER_FLOURISH_FRAME_DURATION_MS * SCAVENGER_FLOURISH_FRAME_COUNT;
    const sequenceMs = breathingWindowMs + flourishWindowMs;
    const elapsedInSequence = ((elapsedMs % sequenceMs) + sequenceMs) % sequenceMs;
    if (elapsedInSequence < breathingWindowMs) return undefined;
    return Math.min(
        SCAVENGER_FLOURISH_FRAME_COUNT - 1,
        Math.floor((elapsedInSequence - breathingWindowMs) / SCAVENGER_FLOURISH_FRAME_DURATION_MS),
    );
}

/** Battle cry opens the active turn, then repeats after four full Scavenger breaths. */
export function scavengerActiveBattleCryFrameForElapsed(elapsedMs: number): number | undefined {
    const breathingWindowMs = THIEF_IDLE_BREATH_PERIOD_MS * SCAVENGER_ACTIVE_BATTLE_CRY_BREATH_CYCLES;
    const sequenceMs = SCAVENGER_ACTIVE_BATTLE_CRY_DURATION_MS + breathingWindowMs;
    const elapsedInSequence = ((elapsedMs % sequenceMs) + sequenceMs) % sequenceMs;
    if (elapsedInSequence >= SCAVENGER_ACTIVE_BATTLE_CRY_DURATION_MS) return undefined;

    let frameStartMs = 0;
    for (let frame = 0; frame < SCAVENGER_ACTIVE_BATTLE_CRY_FRAME_DURATIONS_MS.length; frame += 1) {
        frameStartMs += SCAVENGER_ACTIVE_BATTLE_CRY_FRAME_DURATIONS_MS[frame];
        if (elapsedInSequence < frameStartMs) return frame;
    }
    return SCAVENGER_FLOURISH_FRAME_COUNT - 1;
}

/** Freeze breathing during the cry, then count exactly four cycles before its next playback. */
export function scavengerActiveBattleCryBreathElapsed(elapsedMs: number): number {
    const breathingWindowMs = THIEF_IDLE_BREATH_PERIOD_MS * SCAVENGER_ACTIVE_BATTLE_CRY_BREATH_CYCLES;
    const sequenceMs = SCAVENGER_ACTIVE_BATTLE_CRY_DURATION_MS + breathingWindowMs;
    const elapsedInSequence = ((elapsedMs % sequenceMs) + sequenceMs) % sequenceMs;
    return Math.max(0, elapsedInSequence - SCAVENGER_ACTIVE_BATTLE_CRY_DURATION_MS);
}

export function orcIdleBreathScalesForElapsed(elapsedMs: number, out?: HoCMath.XY): HoCMath.XY {
    // Every creature shares the approved calm breathing loop; the scratch object avoids per-frame allocation.
    const scales = commonIdleBreathScalesForElapsed(elapsedMs);
    if (!out) return scales;
    out.x = scales.x;
    out.y = scales.y;
    return out;
}

/** The approved axe flourish plays once after every four complete breathing cycles. */
export function orcIdleAxeTwirlFrameForElapsed(elapsedMs: number): number | undefined {
    const breathingWindowMs = ORC_IDLE_BREATH_PERIOD_MS * ORC_IDLE_BREATH_CYCLES_PER_AXE_TWIRL;
    const twirlWindowMs = ORC_IDLE_AXE_TWIRL_FRAME_DURATION_MS * ORC_IDLE_AXE_TWIRL_FRAME_COUNT;
    const sequenceMs = breathingWindowMs + twirlWindowMs;
    const elapsedInSequence = ((elapsedMs % sequenceMs) + sequenceMs) % sequenceMs;
    if (elapsedInSequence < breathingWindowMs) return undefined;
    return Math.min(
        ORC_IDLE_AXE_TWIRL_FRAME_COUNT - 1,
        Math.floor((elapsedInSequence - breathingWindowMs) / ORC_IDLE_AXE_TWIRL_FRAME_DURATION_MS),
    );
}

/** Battle cry starts immediately, then repeats after five complete breaths while the Orc owns the turn. */
export function orcActiveBattleCryFrameForElapsed(elapsedMs: number): number | undefined {
    const cryWindowMs = ORC_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS * ORC_ACTIVE_BATTLE_CRY_FRAME_COUNT;
    const breathingWindowMs = ORC_IDLE_BREATH_PERIOD_MS * ORC_ACTIVE_BATTLE_CRY_BREATH_CYCLES;
    const sequenceMs = cryWindowMs + breathingWindowMs;
    const elapsedInSequence = ((elapsedMs % sequenceMs) + sequenceMs) % sequenceMs;
    if (elapsedInSequence >= cryWindowMs) return undefined;
    return Math.min(
        ORC_ACTIVE_BATTLE_CRY_FRAME_COUNT - 1,
        Math.floor(elapsedInSequence / ORC_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS),
    );
}

/** Breathing begins after the opening cry and reaches exactly five cycles before the next one. */
export function orcActiveBattleCryBreathElapsed(elapsedMs: number): number {
    const cryWindowMs = ORC_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS * ORC_ACTIVE_BATTLE_CRY_FRAME_COUNT;
    const breathingWindowMs = ORC_IDLE_BREATH_PERIOD_MS * ORC_ACTIVE_BATTLE_CRY_BREATH_CYCLES;
    const sequenceMs = cryWindowMs + breathingWindowMs;
    const elapsedInSequence = ((elapsedMs % sequenceMs) + sequenceMs) % sequenceMs;
    return Math.max(0, elapsedInSequence - cryWindowMs);
}

/**
 * World-space ground line for the UNPROJECTED (bench / roster) figure: normally six percent above the
 * lower edge of the occupied cell. Only the footprint's height moves this line, so a 2x1 stands exactly
 * where a 1x1 does; the half-cell the taller body adds back is the authored bench behaviour and is
 * deliberately left as it is.
 */
export function tallBoardModelFootLineY(
    positionY: number,
    cellSize: number,
    footprintHeight = 1,
    footInsetRatio = TALL_BOARD_MODEL_FOOT_INSET_RATIO,
): number {
    const baseLine = positionY - cellSize * 0.5 + cellSize * footInsetRatio;
    return baseLine + (footprintHeight > 1 ? cellSize * 0.5 : 0);
}

/** Tall board models stand on the lower edge of their tile instead of being centred like portrait chips. */
function usesTallBoardModel(props: UnitProperties, textureName?: string, hasAuthoredIdle = false): boolean {
    return (
        hasAuthoredIdle ||
        textureName === WANDERING_MAGE_BOARD_TEXTURE ||
        textureName === THIEF_BOARD_TEXTURE ||
        props.name === WANDERING_MAGE_UNIT_NAME ||
        props.name === THIEF_UNIT_NAME ||
        props.name === SCAVENGER_UNIT_NAME ||
        props.name === ORC_UNIT_NAME ||
        props.name === TROLL_UNIT_NAME ||
        props.name === EFREET_UNIT_NAME ||
        props.name === ARACHNA_QUEEN_UNIT_NAME
    );
}

/**
 * The refreshed creature set is authored as an undistorted full-body silhouette on a square atlas frame.
 * Preserve its uniform X/Y scale everywhere. Orc, Scavenger/Thief and Wandering Mage retain their older,
 * individually tuned placement behaviour and are deliberately excluded from this shared rule.
 */
function usesRefreshedFullBodyScale(props: UnitProperties, hasAuthoredIdle: boolean): boolean {
    return (
        (hasAuthoredIdle || props.name === ARACHNA_QUEEN_UNIT_NAME) &&
        props.name !== ORC_UNIT_NAME &&
        props.name !== SCAVENGER_UNIT_NAME &&
        props.name !== THIEF_UNIT_NAME &&
        props.name !== WANDERING_MAGE_UNIT_NAME
    );
}

export function refreshedBoardVisualProfileForUnit(unitName: string): RefreshedBoardVisualProfile {
    return REFRESHED_BOARD_VISUAL_PROFILES[unitName] ?? DEFAULT_REFRESHED_BOARD_VISUAL_PROFILE;
}

/** Stable per-stack phase: recreated ranked units keep their own breathing rhythm without marching in sync. */
export function refreshedIdlePhaseRatio(unitId: string, unitName: string): number {
    const value = `${unitName}:${unitId}`;
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 0x100000000;
}

const LEGACY_TALL_MODEL_FOOT_ANCHORS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
    [ORC_UNIT_NAME]: {
        idle: 185 / 192,
        walk: 185 / 192,
        attack: 185 / 192,
        attack_up: 185 / 192,
        attack_down: 185 / 192,
        melee_attack: 185 / 192,
        melee_attack_up: 185 / 192,
        melee_attack_down: 185 / 192,
        cast: 185 / 192,
        hit: 185 / 192,
        death: 185 / 192,
    },
    [THIEF_UNIT_NAME]: {
        idle: 191 / 192,
        walk: 1,
        attack: 186 / 192,
        attack_up: 186 / 192,
        attack_down: 186 / 192,
        cast: 186 / 192,
        hit: 186 / 192,
        death: 186 / 192,
    },
    [WANDERING_MAGE_UNIT_NAME]: {
        idle: 1,
        walk: 184 / 192,
        attack: 189 / 192,
        attack_up: 184 / 192,
        attack_down: 184 / 192,
        cast: 190 / 192,
        celebrate: 189 / 192,
        defend: 190 / 192,
        hit: 184 / 192,
        death: 184 / 192,
    },
};

/**
 * Anchor the actual authored foot row, not the centre or transparent bottom edge of a frame.
 * New atlases carry this value in generated metadata; the table preserves already-generated art.
 */
export function tallBoardModelFootAnchorY(
    unitName: string,
    stateName: string,
    meta?: Pick<AtlasMeta, "footAnchorY">,
): number {
    const generatedAnchor = meta?.footAnchorY;
    if (typeof generatedAnchor === "number" && Number.isFinite(generatedAnchor)) {
        return Math.max(0, Math.min(1, generatedAnchor));
    }
    const normalizedName = normalizeUnitNameForAtlas(unitName) ?? unitName;
    return (
        LEGACY_TALL_MODEL_FOOT_ANCHORS[unitName]?.[stateName] ??
        LEGACY_TALL_MODEL_FOOT_ANCHORS[normalizedName]?.[stateName] ??
        1
    );
}
// --- Atlas helpers (same logic as UnitChip) ---
type AtlasMeta = AnimationAtlasMeta;
interface UnitAtlasConfig {
    meta: AtlasMeta;
    imageSrc: string;
    imageKey: ImageKey;
    cacheKey: string;
    /** Animation bundles are process-owned; lazy battlefield cutouts belong only to their live scene. */
    cacheAcrossScenes: boolean;
}
const STATIC_BATTLEFIELD_IDLE_META: AtlasMeta = {
    frameWidth: 768,
    frameHeight: 768,
    atlasWidth: 768,
    atlasHeight: 768,
    frameCount: 1,
    fps: 1,
    frameDurationSec: 1,
    totalDurationSec: 1,
    layout: { cols: 1, rows: 1 },
    footAnchorY: 730 / 768,
    loopDurationMs: 1000,
    pauseMs: 0,
};
const ORC_IDLE_AXE_TWIRL_META: AtlasMeta = {
    frameWidth: 768,
    frameHeight: 768,
    atlasWidth: 2304,
    atlasHeight: 2304,
    frameCount: ORC_IDLE_AXE_TWIRL_FRAME_COUNT,
    fps: 1000 / ORC_IDLE_AXE_TWIRL_FRAME_DURATION_MS,
    frameDurationSec: ORC_IDLE_AXE_TWIRL_FRAME_DURATION_MS / 1000,
    totalDurationSec: (ORC_IDLE_AXE_TWIRL_FRAME_DURATION_MS * ORC_IDLE_AXE_TWIRL_FRAME_COUNT) / 1000,
    layout: { cols: 3, rows: 2 },
    footAnchorY: 185 / 192,
    loopDurationMs: ORC_IDLE_AXE_TWIRL_FRAME_DURATION_MS * ORC_IDLE_AXE_TWIRL_FRAME_COUNT,
    pauseMs: 0,
};
const ORC_ACTIVE_BATTLE_CRY_META: AtlasMeta = {
    frameWidth: 896,
    frameHeight: 896,
    atlasWidth: 2688,
    atlasHeight: 1792,
    frameCount: ORC_ACTIVE_BATTLE_CRY_FRAME_COUNT,
    fps: 1000 / ORC_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS,
    frameDurationSec: ORC_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS / 1000,
    totalDurationSec: (ORC_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS * ORC_ACTIVE_BATTLE_CRY_FRAME_COUNT) / 1000,
    layout: { cols: 3, rows: 2 },
    footAnchorY: ORC_ACTIVE_BATTLE_CRY_FOOT_ANCHOR_Y,
    loopDurationMs: ORC_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS * ORC_ACTIVE_BATTLE_CRY_FRAME_COUNT,
    pauseMs: 0,
};
const SCAVENGER_FLOURISH_META: AtlasMeta = {
    frameWidth: 768,
    frameHeight: 768,
    atlasWidth: 2304,
    atlasHeight: 1536,
    frameCount: SCAVENGER_FLOURISH_FRAME_COUNT,
    fps: 1000 / SCAVENGER_FLOURISH_FRAME_DURATION_MS,
    frameDurationSec: SCAVENGER_FLOURISH_FRAME_DURATION_MS / 1000,
    totalDurationSec: (SCAVENGER_FLOURISH_FRAME_DURATION_MS * SCAVENGER_FLOURISH_FRAME_COUNT) / 1000,
    layout: { cols: 3, rows: 2 },
    footAnchorY: SCAVENGER_FLOURISH_FOOT_ANCHOR_Y,
    loopDurationMs: SCAVENGER_FLOURISH_FRAME_DURATION_MS * SCAVENGER_FLOURISH_FRAME_COUNT,
    pauseMs: 0,
};
const EFREET_FIRE_IDLE_META: AtlasMeta = {
    frameWidth: 512,
    frameHeight: 768,
    atlasWidth: 2048,
    atlasHeight: 1536,
    frameCount: EFREET_FIRE_IDLE_FRAME_COUNT,
    fps: 1000 / EFREET_FIRE_IDLE_FRAME_DURATION_MS,
    frameDurationSec: EFREET_FIRE_IDLE_FRAME_DURATION_MS / 1000,
    totalDurationSec: (EFREET_FIRE_IDLE_FRAME_DURATION_MS * EFREET_FIRE_IDLE_FRAME_COUNT) / 1000,
    layout: { cols: 4, rows: 3 },
    footAnchorY: 1,
    loopDurationMs: EFREET_FIRE_IDLE_FRAME_DURATION_MS * EFREET_FIRE_IDLE_FRAME_COUNT,
    pauseMs: 0,
};
function normalizeUnitNameForAtlas(name?: string | null): AnimationUnitName | null {
    if (!name) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    // Scavenger is the level-one Chaos thief. Preserve the engine-facing name while resolving the new art.
    if (trimmed === SCAVENGER_UNIT_NAME) return THIEF_UNIT_NAME as AnimationUnitName;
    // Animation assets retain their stable pre-rename key; only the player-facing creature name changed.
    if (trimmed === WANDERING_MAGE_UNIT_NAME) return "Ash Moth" as AnimationUnitName;
    // The approved Ember Executioner uses the custom fire idle resolved above. Never fall back to the
    // former Efreet action atlases, otherwise the creature changes identity mid-animation.
    if (trimmed === EFREET_UNIT_NAME) return null;
    // Same rule for the approved static Arachna Queen: never switch back to the former animated design.
    if (trimmed === ARACHNA_QUEEN_UNIT_NAME) return null;
    if (trimmed in animationAtlases) return trimmed as AnimationUnitName;
    return null;
}
/**
 * Atlas tiers mirror the static ones: `_atlas_half` holds the two-cell art and `_atlas_quarter` the
 * one-cell art. A rectangle spans two cells along its long side, so it asks for the half sheet and falls
 * through to the quarter sheet below when — as today, for every creature — no half sheet is authored.
 */
function atlasImageKeyFromUnitAndState(
    unitName: string,
    state: string,
    footprintWidth: number,
    footprintHeight: number,
): ImageKey | null {
    const base = unitName.toLowerCase().replace(/\s+/g, "_");
    const stateLeft = state.toLowerCase();
    if (unitName === "Pikeman" && stateLeft === "walk" && "pikeman_walk_atlas" in images) {
        return "pikeman_walk_atlas" as ImageKey;
    }
    if (
        unitName === ARBALESTER_UNIT_NAME &&
        (["walk", "hit", "death"].includes(stateLeft) || isArbalesterAttack(stateLeft))
    ) {
        const nativeKey = `arbalester_${stateLeft}_atlas` as ImageKey;
        if (nativeKey in images) return nativeKey;
    }
    if (unitName === ORC_UNIT_NAME && stateLeft === "idle" && "orc_idle_atlas" in images) {
        return "orc_idle_atlas" as ImageKey;
    }
    if (unitName === ORC_UNIT_NAME && isOrcAuthoredAction(stateLeft)) {
        const reactionKey = `orc_${stateLeft}_atlas`;
        if (reactionKey in images) return reactionKey as ImageKey;
    }
    if (unitName === ORC_UNIT_NAME && stateLeft === "walk" && "orc_walk_atlas" in images) {
        return "orc_walk_atlas" as ImageKey;
    }
    // Keep the HD lab walk at its authored 1024px frame resolution.
    if (unitName === "Berserker" && (stateLeft === "walk" || isBerserkerAuthoredAction(unitName, stateLeft))) {
        const key = `berserker_${stateLeft}_atlas` as ImageKey;
        if (key in images) return key;
    }
    // Preserve the approved detailed walk at its source resolution, including soft alpha edges.
    if (unitName === BLACKSMITH_UNIT_NAME && stateLeft === "walk" && "blacksmith_walk_atlas" in images) {
        return "blacksmith_walk_atlas" as ImageKey;
    }
    if (unitName === BLACKSMITH_UNIT_NAME && stateLeft === "idle" && "blacksmith_idle_atlas" in images) {
        return "blacksmith_idle_atlas" as ImageKey;
    }
    if (unitName === BLACKSMITH_UNIT_NAME && isBlacksmithAuthoredAction(stateLeft)) {
        const key = `blacksmith_${stateLeft}_atlas` as ImageKey;
        if (key in images) return key;
    }
    // same `_atlas_quarter` suffix you already use on UnitChip
    const key = (
        footprintWidth > 1 || footprintHeight > 1
            ? `${base}_${stateLeft}_atlas_half`
            : `${base}_${stateLeft}_atlas_quarter`
    ) as ImageKey;
    if (key in images) return key;
    const quarterKey = `${base}_${stateLeft}_atlas_quarter` as ImageKey;
    if (quarterKey in images) return quarterKey;
    if (process.env.NODE_ENV === "development") {
        console.warn(`[atlas] Missing atlas image for unit "${unitName}", state "${state}". Expected key: ${key}`);
    }
    return null;
}

function getStaticBattlefieldIdleConfig(
    unitName: string,
    footprintWidth: number,
    footprintHeight: number,
): UnitAtlasConfig | null {
    const textureName = staticBattlefieldTextureNameForUnit(unitName, footprintWidth, footprintHeight);
    if (!textureName) return null;
    const imageKey = textureName as ImageKey;
    if (!(imageKey in images)) return null;
    return {
        meta: STATIC_BATTLEFIELD_IDLE_META,
        imageSrc: images[imageKey],
        imageKey,
        cacheKey: `${unitName}::${textureName}`,
        cacheAcrossScenes: false,
    };
}

function getDefaultAnimationConfig(
    unitName: string,
    footprintWidth: number,
    footprintHeight = footprintWidth,
): UnitAtlasConfig | null {
    // Approved idle atlases authored from their matching static figures own the permanent board loop.
    // Other static-redraw creatures keep their single-frame battlefield override.
    const staticBattlefieldIdle = usesApprovedPermanentIdleAtlas(unitName)
        ? null
        : getStaticBattlefieldIdleConfig(unitName, footprintWidth, footprintHeight);
    if (staticBattlefieldIdle) return staticBattlefieldIdle;
    if (unitName === EFREET_UNIT_NAME && footprintWidth === 1 && footprintHeight === 1) {
        return {
            meta: EFREET_FIRE_IDLE_META,
            imageSrc: images[EFREET_FIRE_IDLE_IMAGE_KEY],
            imageKey: EFREET_FIRE_IDLE_IMAGE_KEY,
            cacheKey: `${EFREET_UNIT_NAME}::fire_idle`,
            cacheAcrossScenes: true,
        };
    }
    const normalized = normalizeUnitNameForAtlas(unitName);
    if (!normalized) return null;
    const unitStates = animationAtlases[normalized] as unknown as Record<string, AtlasMeta>;
    const stateNames = Object.keys(unitStates);
    if (!stateNames.length) return null;
    // A unit can expose many action atlases. Its permanent board loop must stay on the authored idle
    // state instead of whichever action happens to sort first (Wandering Mage's `attack` does).
    const preferredState = stateNames.includes("idle")
        ? "idle"
        : stateNames.includes("default")
          ? "default"
          : stateNames[0];
    const meta = unitStates[preferredState];
    const imageKey = atlasImageKeyFromUnitAndState(normalized, preferredState, footprintWidth, footprintHeight);
    if (!imageKey) return null;
    const imageSrc = images[imageKey];
    if (!imageSrc) return null;
    const cacheKey = `${normalized}::${preferredState}`;
    return { meta, imageSrc, imageKey, cacheKey, cacheAcrossScenes: true };
}

function getAnimationStateConfig(
    unitName: string,
    state: string,
    footprintWidth: number,
    footprintHeight = footprintWidth,
): UnitAtlasConfig | null {
    if (unitName === BLACKSMITH_UNIT_NAME && ["attack", "attack_up", "attack_down"].includes(state)) return null;
    const staticBattlefieldIdle = usesApprovedPermanentIdleAtlas(unitName)
        ? null
        : getStaticBattlefieldIdleConfig(unitName, footprintWidth, footprintHeight);
    // The approved final figure replaces the resting battlefield model only. Keep authored walk, attack,
    // hit, cast and death atlases available so applying a static redraw never removes combat behaviour.
    if (staticBattlefieldIdle && state === "idle") return staticBattlefieldIdle;
    if (unitName === EFREET_UNIT_NAME && state === "idle" && footprintWidth === 1 && footprintHeight === 1) {
        return {
            meta: EFREET_FIRE_IDLE_META,
            imageSrc: images[EFREET_FIRE_IDLE_IMAGE_KEY],
            imageKey: EFREET_FIRE_IDLE_IMAGE_KEY,
            cacheKey: `${EFREET_UNIT_NAME}::fire_idle`,
            cacheAcrossScenes: true,
        };
    }
    const normalized = normalizeUnitNameForAtlas(unitName);
    if (!normalized) return null;
    const resolvedState = resolveAnimationAtlasState(unitName, state);
    const unitStates = animationAtlases[normalized] as unknown as Record<string, AtlasMeta>;
    const meta = unitStates[resolvedState];
    if (!meta) return null;
    const imageKey = atlasImageKeyFromUnitAndState(normalized, resolvedState, footprintWidth, footprintHeight);
    if (!imageKey) return null;
    const imageSrc = images[imageKey];
    if (!imageSrc) return null;
    return {
        meta,
        imageSrc,
        imageKey,
        cacheKey: `${normalized}::${resolvedState}`,
        cacheAcrossScenes: true,
    };
}
// Reuse frame wrappers while their parent atlas is live without pinning an unloaded atlas for the
// lifetime of the tab. WeakMap ephemeron semantics also allow the value's frame sources to disappear
// once Pixi releases the parent texture after a scene teardown.
const atlasFramesCache = new WeakMap<Texture, Map<string, Texture[]>>();
const ACTIVE_TURN_FIRE_FRAME_SIZE = 192;
const ACTIVE_TURN_FIRE_COLS = 8;
const ACTIVE_TURN_FIRE_FRAME_COUNT = 64;
const ACTIVE_TURN_FIRE_FRAME_MS = 1000 / 18;
const BADGE_FLAG_WAVE_FRAME_MS = 1000 / 20;
// OPTIONAL lookup on purpose: the effect below is disabled and its 500 KB atlas lives in the
// review-source Google Drive staging area (over the 120 KB static-image ceiling), so the generated image
// manifest does not carry the key. A typed property access here made the whole client build demand
// art the images folder deliberately does not ship (the 2026-08-22 deploy abort). Restoring the
// effect means promoting the atlas back into the images folder — this lookup then finds it again.
const ACTIVE_TURN_FIRE_URL = (images as Partial<Record<string, string>>).active_turn_blue_fire_atlas ?? "";
// Prepared from the blue-fire source video. Keep the implementation/assets ready, but leave the
// effect visually disabled until the owner asks to restore it.
let activeTurnFireFramesCache: Texture[] | null | undefined;

/** Ping-pong frame selection keeps the expanding fire cloud seamless at both ends of its loop. */
export function activeTurnFireFrameForElapsed(elapsedMs: number): number {
    const cycleFrames = ACTIVE_TURN_FIRE_FRAME_COUNT * 2 - 2;
    const step = Math.floor(Math.max(0, elapsedMs) / ACTIVE_TURN_FIRE_FRAME_MS) % cycleFrames;
    return step < ACTIVE_TURN_FIRE_FRAME_COUNT ? step : cycleFrames - step;
}

function getActiveTurnFireFrames(): Texture[] {
    if (activeTurnFireFramesCache !== undefined) return activeTurnFireFramesCache ?? [];
    try {
        const parentTexture = Texture.from(ACTIVE_TURN_FIRE_URL);
        const source = parentTexture.source;
        activeTurnFireFramesCache = Array.from({ length: ACTIVE_TURN_FIRE_FRAME_COUNT }, (_, index) => {
            const col = index % ACTIVE_TURN_FIRE_COLS;
            const row = Math.floor(index / ACTIVE_TURN_FIRE_COLS);
            return new Texture({
                source,
                frame: new Rectangle(
                    col * ACTIVE_TURN_FIRE_FRAME_SIZE,
                    row * ACTIVE_TURN_FIRE_FRAME_SIZE,
                    ACTIVE_TURN_FIRE_FRAME_SIZE,
                    ACTIVE_TURN_FIRE_FRAME_SIZE,
                ),
            });
        });
    } catch {
        // Headless tests do not have a browser image decoder. Keep the vector aura as a safe fallback.
        activeTurnFireFramesCache = null;
    }
    return activeTurnFireFramesCache ?? [];
}

function buildAtlasFrames(meta: AtlasMeta, imageSrc: string, imageKey: string, resolvedTexture?: Texture): Texture[] {
    let parentTexture = resolvedTexture;
    if (!parentTexture) {
        try {
            parentTexture = Texture.from(imageSrc);
        } catch {
            return [];
        }
    }
    // Texture.from can return no texture while a background atlas is still being loaded. Falling back
    // to the unit's already-visible static board texture keeps one missing atlas from aborting the whole
    // scene hydrate (the L1 framing editor intentionally creates sixteen creatures at once).
    if (!parentTexture?.source) return [];
    const source = parentTexture.source; // v8-friendly
    if (
        imageKey === "pikeman_walk_atlas" ||
        imageKey === "arbalester_walk_atlas" ||
        imageKey === "arbalester_hit_atlas" ||
        imageKey === "arbalester_death_atlas" ||
        ARBALESTER_ATTACK_STATES.some((state) => imageKey === `arbalester_${state}_atlas`) ||
        imageKey === "berserker_walk_atlas" ||
        imageKey === "berserker_sword_idle_atlas" ||
        imageKey === "berserker_hit_atlas" ||
        imageKey === "berserker_death_atlas" ||
        imageKey === "berserker_melee_attack_atlas" ||
        imageKey === "berserker_melee_attack_up_atlas" ||
        imageKey === "berserker_melee_attack_down_atlas" ||
        imageKey === "centaur_lab_walk_atlas" ||
        imageKey === "medusa_lab_walk_atlas" ||
        imageKey === "medusa_lab_idle_atlas" ||
        imageKey === "medusa_lab_hit_atlas" ||
        imageKey === "medusa_lab_melee_attack_atlas" ||
        imageKey === "medusa_lab_melee_attack_up_atlas" ||
        imageKey === "medusa_lab_melee_attack_down_atlas" ||
        imageKey === "medusa_lab_death_atlas" ||
        imageKey === "medusa_lab_attack_atlas" ||
        imageKey === "medusa_lab_attack_up_atlas" ||
        imageKey === "medusa_lab_attack_down_atlas" ||
        imageKey === "manticore_lab_walk_atlas" ||
        imageKey === "manticore_lab_death_atlas" ||
        imageKey === "manticore_lab_hit_atlas" ||
        imageKey === "manticore_lab_melee_attack_atlas" ||
        imageKey === "manticore_lab_melee_attack_up_atlas" ||
        imageKey === "manticore_lab_melee_attack_down_atlas" ||
        imageKey === "troll_lab_walk_atlas" ||
        imageKey === "troll_lab_idle_atlas" ||
        imageKey === "troll_lab_hit_atlas" ||
        imageKey === "troll_lab_death_atlas" ||
        imageKey === "troll_lab_cast_atlas" ||
        imageKey === "troll_lab_melee_attack_atlas" ||
        imageKey === "troll_lab_melee_attack_up_atlas" ||
        imageKey === "troll_lab_melee_attack_down_atlas" ||
        imageKey === "battle_mage_lab_walk_atlas" ||
        imageKey === "battle_mage_lab_hit_atlas" ||
        imageKey === "battle_mage_lab_death_atlas" ||
        imageKey === "battle_mage_lab_melee_attack_atlas" ||
        imageKey === "battle_mage_lab_melee_attack_up_atlas" ||
        imageKey === "battle_mage_lab_melee_attack_down_atlas" ||
        imageKey === "battle_mage_lab_cast_atlas" ||
        imageKey === "healer_lab_walk_atlas" ||
        imageKey === "white_tiger_lab_walk_atlas" ||
        imageKey === "white_tiger_lab_idle_atlas" ||
        imageKey === "white_tiger_lab_hit_atlas" ||
        imageKey === "white_tiger_lab_death_atlas" ||
        imageKey === "white_tiger_lab_melee_attack_atlas" ||
        imageKey === "white_tiger_lab_melee_attack_up_atlas" ||
        imageKey === "white_tiger_lab_melee_attack_down_atlas" ||
        imageKey === "healer_lab_idle_atlas" ||
        imageKey === "healer_lab_hit_atlas" ||
        imageKey === "healer_lab_death_atlas" ||
        imageKey === "healer_lab_attack_atlas" ||
        imageKey === "healer_lab_attack_up_atlas" ||
        imageKey === "healer_lab_attack_down_atlas" ||
        imageKey === "healer_lab_cast_atlas" ||
        imageKey === "elf_lab_walk_atlas" ||
        imageKey === "elf_lab_idle_atlas" ||
        imageKey === "elf_lab_hit_atlas" ||
        imageKey === "elf_lab_death_atlas" ||
        imageKey === "elf_lab_melee_attack_atlas" ||
        imageKey === "elf_lab_melee_attack_up_atlas" ||
        imageKey === "elf_lab_melee_attack_down_atlas" ||
        imageKey === "elf_lab_attack_atlas" ||
        imageKey === "elf_lab_attack_up_atlas" ||
        imageKey === "elf_lab_attack_down_atlas" ||
        imageKey === "valkyrie_lab_current_walk_atlas" ||
        imageKey === "valkyrie_lab_current_hit_atlas" ||
        imageKey === "valkyrie_lab_current_death_atlas" ||
        imageKey === "fairy_lab_walk_atlas" ||
        imageKey === "fairy_lab_idle_atlas" ||
        imageKey === "fairy_lab_hit_atlas" ||
        imageKey === "fairy_lab_death_atlas" ||
        imageKey === "fairy_lab_melee_attack_atlas" ||
        imageKey === "fairy_lab_melee_attack_up_atlas" ||
        imageKey === "fairy_lab_melee_attack_down_atlas" ||
        imageKey === "centaur_lab_idle_atlas" ||
        imageKey === "centaur_lab_hit_atlas" ||
        imageKey === "centaur_lab_death_atlas" ||
        imageKey === "centaur_lab_melee_attack_atlas" ||
        imageKey === "centaur_lab_melee_attack_up_atlas" ||
        imageKey === "centaur_lab_melee_attack_down_atlas" ||
        imageKey === "centaur_lab_attack_atlas" ||
        imageKey === "centaur_lab_attack_up_atlas" ||
        imageKey === "centaur_lab_attack_down_atlas" ||
        imageKey === "leprechaun_lab_walk_atlas" ||
        imageKey === "leprechaun_lab_hit_atlas" ||
        imageKey === "leprechaun_lab_death_atlas" ||
        imageKey === "leprechaun_lab_melee_attack_atlas" ||
        imageKey === "leprechaun_lab_melee_attack_up_atlas" ||
        imageKey === "leprechaun_lab_melee_attack_down_atlas" ||
        imageKey === "dryad_lab_walk_atlas" ||
        imageKey === "dryad_lab_hit_atlas" ||
        imageKey === "dryad_lab_death_atlas" ||
        imageKey === "dryad_lab_melee_attack_atlas" ||
        imageKey === "dryad_lab_melee_attack_up_atlas" ||
        imageKey === "dryad_lab_melee_attack_down_atlas" ||
        imageKey === "dryad_lab_attack_atlas" ||
        imageKey === "dryad_lab_attack_up_atlas" ||
        imageKey === "dryad_lab_attack_down_atlas" ||
        imageKey === "blacksmith_walk_atlas" ||
        imageKey === "blacksmith_idle_atlas" ||
        imageKey === "blacksmith_hit_atlas" ||
        imageKey === "blacksmith_death_atlas" ||
        imageKey === "blacksmith_cast_atlas" ||
        imageKey === "blacksmith_melee_attack_atlas" ||
        imageKey === "blacksmith_melee_attack_up_atlas" ||
        imageKey === "blacksmith_melee_attack_down_atlas" ||
        imageKey === "orc_walk_atlas" ||
        imageKey === "orc_idle_atlas" ||
        imageKey === "orc_hit_atlas" ||
        imageKey === "orc_death_atlas" ||
        imageKey === "orc_melee_attack_atlas" ||
        imageKey === "orc_melee_attack_up_atlas" ||
        imageKey === "orc_attack_atlas" ||
        imageKey === "orc_attack_up_atlas" ||
        imageKey === "orc_attack_down_atlas" ||
        imageKey === "orc_melee_attack_down_atlas"
    ) {
        source.scaleMode = "linear";
    }
    // Detect the actually loaded atlas variant. Dedicated static battlefield sprites are one complete
    // frame and carry neither suffix, so only explicit quarter/half atlas keys may be divided.
    const divider = imageKey.endsWith("_half") ? 2 : imageKey.endsWith("_quarter") ? 4 : 1;
    const frameWidth = meta.frameWidth / divider;
    const frameHeight = meta.frameHeight / divider;
    const cols = meta.layout?.cols ?? 1;
    const rows = meta.layout?.rows ?? 1;
    const frameCount = meta.frameCount ?? cols * rows;
    const frames: Texture[] = [];
    let index = 0;
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (index >= frameCount) break;
            const frameRect = new Rectangle(col * frameWidth, row * frameHeight, frameWidth, frameHeight);
            const tex = new Texture({ source, frame: frameRect });
            frames.push(tex);
            index++;
        }
    }
    return frames;
}

function cachedAtlasFrames(
    cacheKey: string,
    meta: AtlasMeta,
    imageSrc: string,
    imageKey: string,
    resolvedTexture?: Texture,
): Texture[] {
    let parentTexture = resolvedTexture;
    if (!parentTexture) {
        try {
            parentTexture = Texture.from(imageSrc);
        } catch {
            return [];
        }
    }
    if (!parentTexture?.source) return [];

    let framesByKey = atlasFramesCache.get(parentTexture);
    const layoutKey = JSON.stringify([
        cacheKey,
        imageSrc,
        imageKey,
        meta.frameWidth,
        meta.frameHeight,
        meta.layout?.cols,
        meta.layout?.rows,
        meta.frameCount,
    ]);
    const cached = framesByKey?.get(layoutKey);
    if (cached) return cached;

    const frames = buildAtlasFrames(meta, imageSrc, imageKey, parentTexture);
    if (!frames.length) return frames;
    if (!framesByKey) {
        framesByKey = new Map<string, Texture[]>();
        atlasFramesCache.set(parentTexture, framesByKey);
    }
    framesByKey.set(layoutKey, frames);
    return frames;
}

/**
 * Reuse true animation sheets while their parent texture is live, but never pin a lazy battlefield cutout
 * in the module cache. PixiScene lease-counts these textures and unloads them with the last owning scene.
 */
function framesForAtlasConfig(config: UnitAtlasConfig, texResolver: TexResolver): Texture[] {
    const resolvedTexture = texResolver(config.imageKey);
    if (config.cacheAcrossScenes) {
        return cachedAtlasFrames(config.cacheKey, config.meta, config.imageSrc, config.imageKey, resolvedTexture);
    }
    // Static battlefield art is already one complete frame. Reuse the scene-leased texture itself rather
    // than creating a wrapper that can outlive the lease and keep the decoded source resident.
    return resolvedTexture
        ? [resolvedTexture]
        : buildAtlasFrames(config.meta, config.imageSrc, config.imageKey, resolvedTexture);
}
interface SpawnAnimState {
    startScaleX: number;
    startScaleY: number;
    endScaleX: number;
    endScaleY: number;
    elapsed: number;
    duration: number;
}

interface OneShotAnimState {
    stateName: string;
    /** Keep Blacksmith's resting overlap geometry while its arms/tools move. */
    depthSortBounds?: Readonly<{ x: number; y: number; width: number; height: number }>;
    frames: Texture[];
    footAnchorY: number;
    frameIndex: number;
    elapsed: number;
    durationPerFrame: number;
    frameDurationsMs?: readonly number[];
    authoredRealTime?: boolean;
    onComplete?: () => void;
    holdLastFrame?: boolean;
    finished?: boolean;
    orcRelease?: () => void;
    orcCancel?: () => void;
    projectileReleaseFrame?: number;
    projectileRelease?: () => void;
}
interface LoopAnimState {
    frames: Texture[];
    footAnchorY: number;
    frameIndex: number;
    /** Frames before this index are a one-shot turn-in; this index starts the repeating gait. */
    loopStartFrame: number;
    /** Last frame in the repeating gait (inclusive). A separate outro frame may follow it. */
    loopEndFrame: number;
    /** Optional one-shot turn-back frame shown after the unit reaches its destination. */
    outroFrame?: number;
    /** Last frame of a multi-frame landing/turn-back sequence; defaults to outroFrame. */
    outroEndFrame?: number;
    /** Chained action released only after every authored landing frame has been shown. */
    onOutroComplete?: () => void;
    /** Distance over which the non-looping take-off frames are selected spatially. */
    introDistanceCells?: number;
    introComplete: boolean;
    /** Travel already consumed by a non-looping turn-in or take-off. */
    gaitStartDistanceCells: number;
    gaitDistanceCells?: number;
    elapsedMs: number;
    durationPerFrameMs: number;
    /** Optional authored timing for each atlas frame, including one-shot turn-in/out poses. */
    frameDurationsMs?: readonly number[];
    flightFrameDurationMs?: number;
    outroFrameDurationMs?: number;
    completedCycles: number;
    finishAfterCycle: boolean;
    /** Spatially-authored gaits advance from travelled board distance instead of wall-clock time. */
    distanceDriven?: boolean;
}
interface DodgeGhost {
    sprite: Sprite;
    bornMs: number;
}
interface DodgeAnimState {
    startMs: number;
    durationMs: number;
    /** World-space displacement (sprite + shadow) at full extension. */
    dx: number;
    dy: number;
    /** Sprite lean (radians) at full extension. */
    lean: number;
    lastGhostMs: number;
    ghosts: DodgeGhost[];
}
interface BadgeDrawState {
    iconSide: number;
    label: string;
    teamColor: number;
    stackPower: number;
    isActiveTurn: boolean;
    parentScaleRatio: number;
    /** Banner geometry, kept so the per-frame cloth redraw doesn't recompute it every tick. */
    geometry: BadgeFlagGeometry;
}

interface BadgeFlagGeometry {
    bannerLeft: number;
    bannerRight: number;
    bannerTop: number;
    bannerBottom: number;
    notchDepth: number;
    flagHeight: number;
    borderWidth: number;
    borderColor: number;
    borderAlpha: number;
    /** Overall horizontal ribbon size. The creature amount is centered inside it. */
    headerWidth: number;
    headerHeight: number;
}

/**
 * The compact amount ribbon ripples like cloth: it stays restrained at its left edge and billows more
 * the further out you go, with the wave travelling toward the free edge.
 *
 * The motion is pure sine of wall-clock time, which is what makes it loop with no seam at all — there is no
 * clip to wrap around and no keyframe to land back on, so it simply never stops being mid-wave. Baking the
 * same look as a sprite sheet would put a visible hitch wherever the loop rejoined.
 */
/** Points sampled along the banner to draw the wave. Enough to read as cloth, cheap enough for every unit. */
const FLAG_WAVE_SEGMENTS = 12;
/** Peak sway at the free edge, as a fraction of the banner's height. */
const FLAG_WAVE_AMPLITUDE = 0.14;
/** How many wave crests fit across the banner. Just over one reads as cloth rather than a wobbling plank. */
const FLAG_WAVE_CYCLES = 1.15;
/** Radians per second the wave travels — a lazy flag in still dungeon air, not a gale. */
const FLAG_WAVE_SPEED = 2.6;
/** Heroes-IV-style count ribbon stays horizontal above the creature. */
const BATTLEFIELD_FLAG_ROTATION = 0;
/** Active-turn arrow enlarged by another 50%, independent of its animated breath. */
export const ACTIVE_TURN_POINTER_SIZE_SCALE = 1.06 * 1.3 * 1.5;
/** A warm, slightly orange gold that stays legible against both army colours. */
const ACTIVE_FLAG_GLOW_COLOR = 0xffd05a;
/** Twice the previous cadence: one complete grow/shrink breath every 1.4 seconds. */
const ACTIVE_FLAG_GLOW_SPEED = (Math.PI * 2) / 1.4;
let sharedActiveTurnGlowBlurFilter: BlurFilter | null | undefined;

/** One lazily compiled glow filter is enough because exactly one battlefield unit owns the active turn. */
const activeTurnGlowBlurFilter = (): BlurFilter | undefined => {
    if (sharedActiveTurnGlowBlurFilter !== undefined) return sharedActiveTurnGlowBlurFilter ?? undefined;
    try {
        sharedActiveTurnGlowBlurFilter = new BlurFilter({
            strength: 2,
            quality: 3,
            kernelSize: 5,
            resolution: "inherit",
            antialias: "inherit",
        });
        sharedActiveTurnGlowBlurFilter.padding = 8;
    } catch {
        sharedActiveTurnGlowBlurFilter = null;
    }
    return sharedActiveTurnGlowBlurFilter ?? undefined;
};
/** Normalized 0..1 pulse shared by the active-turn pointer's glow and scale. */
const activeFlagPulse = (timeSeconds: number): number => {
    const cosineBreath = 0.5 - Math.cos(timeSeconds * ACTIVE_FLAG_GLOW_SPEED) * 0.5;
    // Smoothstep eases both ends of the breath, so neither the scale nor halo appears to change direction.
    return cosineBreath * cosineBreath * (3 - 2 * cosineBreath);
};
/** Public for regression tests: pointer size and glow share the same restrained 100–108% pulse. */
export const activeFlagScaleForTime = (timeSeconds: number): number => 1 + activeFlagPulse(timeSeconds) * 0.08;
/** The halo never vanishes completely, so the pointer remains identifiable at the dim pulse phase. */
export const activeFlagGlowAlphaForTime = (timeSeconds: number): number => 0.32 + activeFlagPulse(timeSeconds) * 0.58;
/**
 * Preserve the established two-pixel/13%-of-flag clearance, then add a visible six percent of one board
 * cell (the previous three percent plus the requested extra lift). The flag width is authored as 42% of a
 * cell, so this remains resolution-independent.
 */
export const activeTurnPointerGap = (flagHeight: number, flagWidth: number): number =>
    Math.max(2, flagHeight * 0.13) + flagWidth * (0.06 / 0.42);

/**
 * Stable screen-space top of the amount flag for pointer UI.
 *
 * The active-turn pointer breathes independently while the flag stays fixed. `badgeEmphasisScale` is the
 * flag's persistent scale, so this anchor only changes when the creature, camera or authored framing does.
 */
export const stableDamagePredictionBadgeScreenTop = (
    spriteScreenTop: number,
    margin: number,
    flagHeight: number,
    parentScaleY: number,
    badgeEmphasisScale: number,
): number => spriteScreenTop - margin - flagHeight * parentScaleY * badgeEmphasisScale;
/**
 * The top edge sways slightly less than the bottom, so the cloth's height breathes instead of the whole
 * banner sliding up and down as a rigid block.
 */
const FLAG_WAVE_TOP_FACTOR = 0.82;

/**
 * Vertical offset of the cloth at `u` (0 at the pole, 1 at the free edge) for time `t`.
 *
 * Amplitude ramps as u^4: the readable number area stays almost rigid and only the short tail visibly moves.
 */
function flagWaveOffset(u: number, t: number, phase: number, height: number): number {
    const amplitude = height * FLAG_WAVE_AMPLITUDE * Math.pow(u, 4);
    return amplitude * Math.sin(Math.PI * 2 * FLAG_WAVE_CYCLES * u - FLAG_WAVE_SPEED * t + phase);
}

const traceBadgeFlag = (
    target: Graphics,
    geometry: BadgeFlagGeometry,
    xs: readonly number[],
    topY: readonly number[],
    bottomY: readonly number[],
    notchTipY: number,
): void => {
    target.moveTo(xs[0], topY[0]);
    for (let index = 1; index <= FLAG_WAVE_SEGMENTS; index++) {
        target.lineTo(xs[index], topY[index]);
    }
    target.lineTo(geometry.bannerRight - geometry.notchDepth, notchTipY);
    for (let index = FLAG_WAVE_SEGMENTS; index >= 0; index--) {
        target.lineTo(xs[index], bottomY[index]);
    }
    target.closePath();
};

const traceActiveTurnPointer = (
    target: Graphics,
    shaftHalfWidth: number,
    arrowHalfWidth: number,
    arrowHeight: number,
    headHeight: number,
): void => {
    target
        .moveTo(-shaftHalfWidth, arrowHeight)
        .lineTo(shaftHalfWidth, arrowHeight)
        .lineTo(shaftHalfWidth, headHeight)
        .lineTo(arrowHalfWidth, headHeight)
        .lineTo(0, 0)
        .lineTo(-arrowHalfWidth, headHeight)
        .lineTo(-shaftHalfWidth, headHeight)
        .closePath();
};
interface StackPowerDrawState {
    power: number;
    cellSize: number;
    footprintWidthInCells: number;
    footprintHeightInCells: number;
    teamColor: number;
}
interface RosterCardDrawState {
    x: number;
    y: number;
    cell: number;
    footprintWidth: number;
    footprintHeight: number;
    projected: boolean;
}

/**
 * Cell-relative extent of a ground effect along ONE footprint axis.
 *
 * Every one of these effects was authored as a pair of numbers — the one-cell value and the two-cell one —
 * which is a straight line through two points, so each further footprint cell simply adds another
 * interval. Both authored values come back untouched for a body one or two cells across.
 */
function footprintEffectExtent(oneCell: number, twoCells: number, footprintSide: number): number {
    return oneCell + (twoCells - oneCell) * (footprintSide - 1);
}

/**
 * Ground rings are circles around every SQUARE body — which is every shipped creature — so that case
 * keeps the literal circle call and its geometry is untouched. Only a rectangle needs the oval form.
 */
function drawFootprintOval(g: Graphics, x: number, y: number, radiusX: number, radiusY: number): Graphics {
    return radiusX === radiusY ? g.circle(x, y, radiusX) : g.ellipse(x, y, radiusX, radiusY);
}

/**
 * Exact painted-grid footprint used by a revealed opponent's deployment marker.
 *
 * The marker must cover the cells the unit actually occupies, so the two half-extents are taken from the
 * footprint separately. They coincide for every square body, which is every shipped creature.
 */
export function revealedOpponentFootprintPoints(
    logicalCenter: HoCMath.XY,
    footprintWidth: number,
    footprintHeight: number,
    gs: GridSettings,
): number[] {
    const halfWidth = (gs.getStep() * footprintWidth) / 2;
    const halfHeight = (gs.getStep() * footprintHeight) / 2;
    return projectedRectPoints(
        logicalCenter.x - halfWidth,
        logicalCenter.y - halfHeight,
        logicalCenter.x + halfWidth,
        logicalCenter.y + halfHeight,
        gs,
    );
}
// Tuning for the "bullet-time" dodge played when an attack fully MISSES this unit (Dodge /
// Small Specie / Boar Saliva / Broken Aegis): dash out of the strike line, hang at full extension
// for a beat, then spring back — trailing matrix-style afterimages the whole way out.
const DODGE_DURATION_MS = 640;
const DODGE_DASH_END = 0.22; // fraction of the dodge spent dashing out
const DODGE_HOLD_END = 0.55; // fraction after which the unit springs back
const DODGE_LEAN_RAD = 0.26; // sprite lean at full extension
const DODGE_GHOST_EVERY_MS = 45;
const DODGE_GHOST_LIFE_MS = 300;
const DODGE_GHOST_ALPHA = 0.35;
const DODGE_GHOST_TINT = 0xaaffcc; // faint green wash so the trail reads "bullet time", not "unit copy"
const DODGE_BLUR_STRENGTH = 2.5;
// Uneven, stable frost deposits around a normalized unit silhouette. Keeping this layout fixed prevents
// the frozen shell from crawling or pulsing while still avoiding a mechanical, evenly-spaced border.
const FREEZE_FROST_PATCHES = [
    [-0.84, -0.95, 0.15],
    [-0.38, -0.99, 0.11],
    [0.12, -0.96, 0.17],
    [0.7, -0.92, 0.13],
    [0.96, -0.63, 0.14],
    [0.99, -0.08, 0.17],
    [0.93, 0.52, 0.12],
    [0.66, 0.94, 0.17],
    [0.08, 0.99, 0.12],
    [-0.46, 0.95, 0.16],
    [-0.95, 0.6, 0.13],
    [-0.99, 0.08, 0.18],
    [-0.94, -0.52, 0.12],
] as const;
function dodgeEaseOutCubic(t: number): number {
    const u = 1 - t;
    return 1 - u * u * u;
}
function dodgeEaseOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const u = t - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
}
/**
 * Drop every repeated name from a display list and its three parallel arrays, keeping the FIRST entry.
 * Returns true when something was removed. Exported for tests.
 */
export const dropDuplicateAppliedEntries = (
    names: string[],
    laps: number[],
    descriptions: string[],
    powers: number[],
): boolean => {
    // Same precondition Unit.deleteBuff/deleteDebuff use: only touch entries while all four arrays are
    // parallel — splicing desynced arrays would corrupt the very alignment this is meant to preserve.
    if (names.length !== laps.length || names.length !== descriptions.length || names.length !== powers.length) {
        return false;
    }
    let removed = false;
    for (let i = names.length - 1; i >= 0; i--) {
        if (names.indexOf(names[i]) === i) {
            continue;
        }
        names.splice(i, 1);
        laps.splice(i, 1);
        descriptions.splice(i, 1);
        powers.splice(i, 1);
        removed = true;
    }
    return removed;
};
/**
 * Unit + Pixi visualization (sprite, stack badge, spawn animation).
 * We never `new RenderableUnit` directly; instead we "upgrade"
 * an existing Unit via `RenderableUnit.fromBase`.
 */
/**
 * The board's own text face, matching the UI's (see ui/style.scss).
 *
 * PixiJS TextStyle defaults to Arial when fontFamily is omitted, so unit names and stack counts were
 * rendering in a different typeface from every other piece of text in the game — close enough to look
 * like a mistake rather than a choice. Anything drawn onto the board should use this.
 */
const BOARD_FONT_FAMILY = HOC_NUMERIC_FONT_FAMILY;

/**
 * The roster-card colour for a unit that belongs to NO team.
 *
 * A neutral light grey, deliberately with no hue in it. The previous value (0x8b94a6) was a blue-cast
 * slate, which on the units overlay read as a third TEAM colour sitting alongside the green and the red
 * rather than as "unaffiliated". Matches the grey the overlay already uses for its unselected faction
 * icons, so the two neutral states look like the same state.
 */
const NO_TEAM_ROSTER_COLOR = 0xd0d0d0;
/**
 * `tag.webp` contains generous transparent padding around the crossed swords. At the flag's raw width
 * the opaque blades are narrower than the cloth and disappear completely behind it, so enlarge the
 * source canvas until the actual tips and hilts clearly protrude on the battlefield.
 */
const RESPOND_EMBLEM_CANVAS_SCALE = 2.25;
/** Selected mockup variant: compress only the crossed-swords emblem vertically by 20%. */
const RESPOND_EMBLEM_HEIGHT_SCALE = 0.8;
export class RenderableUnit extends Unit {
    private texResolver!: TexResolver;
    // Server-authoritative "already used its hourglass (wait) this lap" flag, synced from the snapshot in
    // ranked (the client's FightProperties hourglass state isn't authoritative there). Overwritten every
    // snapshot, so it clears on its own when the lap flips. Drives the Wait button disable in ranked.
    private hasHourglassedThisLap = false;
    // Server-authoritative "skipping this turn" (Stun/Blindness) flag, synced from the snapshot in ranked.
    // The effect itself isn't on the wire, so isSkippingThisTurn() (which reads getEffects) can't see it
    // there — this flag is the only source. Drives the stun icon; OR'd with the live check for sandbox.
    private skippingThisTurnSynced = false;
    private sprite?: Sprite;
    private motionBlurFilter?: BlurFilter;
    private shadow?: Graphics;
    private silhouetteShadow?: Sprite;
    /** First stable placement/idle frame: the exact canvas against which the shadow editor was tuned. */
    private silhouetteShadowReferenceTexture?: Texture;
    private silhouetteShadowReferenceAnchorY?: number;
    private silhouetteShadowSegments: Sprite[] = [];
    private silhouetteShadowSegmented = false;
    private battlefieldShadowProjection?: BattlefieldCreatureShadowProjection;
    private shadowSegmentLengthMultipliers?: number[];
    private groundCastShadow?: Sprite;
    private silhouetteShadowBlurFilter?: BlurFilter | null;
    private shadowDrawWidth = 0;
    private shadowDrawHeight = 0;
    private badgeContainer?: Container;
    /** Freeze the overhead flag in world space while a one-shot pose changes the sprite bounds. */
    private oneShotBadgePosition?: Readonly<{ x: number; y: number }>;
    /** Height above the projected ground point, captured before movement changes the pose. */
    private restingBadgeOffsetY?: number;
    private movementBadgeOffsetY?: number;
    private badgeHeader?: Graphics;
    private badgeFlagGlow?: Graphics;
    private badgeFlag?: Graphics;
    /** Animated all-gold pointer shown above the count flag for the unit whose turn it is. */
    private activeTurnPointer?: Graphics;
    /** Once the active unit starts moving or acting, keep its pointer hidden until a new turn begins. */
    private activeTurnPointerSuppressed = false;
    private badgeText?: Text;
    private badgeDrawState?: BadgeDrawState;
    private battlefieldFramingChangeListener?: EventListener;
    private battlefieldFramingWorldRoot?: Container;
    private battlefieldFramingGridSettings?: GridSettings;
    /** Effective Wolf canvas registration, with gait compensation and action padding divided out. */
    private wolfRenderedCanvasHeight?: number;
    /** Applied reaction calibration, tracked separately from source canvas registration. */
    private wolfRenderedReactionScale = 1;
    private wolfShadowReactionScale = 1;
    /** Last resolved floor projection, reused by synchronous action/canvas swaps. */
    private wolfShadowProjectionScaleX?: number;
    private wolfShadowProjectionScaleY?: number;
    private wolfReactionRegistrationActive = false;
    /** Cached per-unit wave phase for the banner (see badgeFlagPhase). */
    private badgeFlagPhaseValue?: number;
    private badgeFlagXs?: number[];
    private badgeFlagTopY?: number[];
    private badgeFlagBottomY?: number[];
    private badgeFlagWaveFrame = -1;
    private stackPowerContainer?: Container;
    private stackPowerPips: Graphics[] = [];
    private stackPowerDrawState?: StackPowerDrawState;
    // Placement split preview only. Keep the projected pips visual so hovering never changes spell gates,
    // abilities, or any other gameplay logic that reads Unit.getStackPower().
    private projectedStackPower?: number;
    private hourglassContainer?: Container;
    private hourglassSprite?: Sprite;
    /** Stun/skip badge occupies the hourglass slot immediately left of the amount flag. */
    private stunContainer?: Container;
    private stunSprite?: Sprite;
    /** Crossed-swords emblem behind the flag once the unit has used its response attack this round. */
    private respondContainer?: Container;
    private respondSprite?: Sprite;
    /**
     * Keep a just-played retaliation visible through the damage animation even when that same engine
     * transaction also flips the lap and immediately clears `responded`. Without this short visual latch
     * a two-stack fight can set true -> false before Pixi renders a single frame, so the swords never appear.
     */
    private respondFeedbackUntilMs = 0;
    private respondFeedbackTimer?: ReturnType<typeof setTimeout>;
    private spawnAnim?: SpawnAnimState;
    private boardSelected = false;
    private selectionAnimFrames?: Texture[];
    private arbalesterIdlePager?: ArbalesterIdlePager;
    private orcIdleAxeTwirlFrames?: Texture[];
    private orcActiveBattleCryFrames?: Texture[];
    private scavengerIdleBladeTwirlFrames?: Texture[];
    private scavengerActiveBattleCryFrames?: Texture[];
    private selectionAnimTiming?: AtlasPingPongTiming;
    private selectionAnimFrameDurationMs = 0;
    private selectionAnimFrameDurationsMs?: readonly number[];
    private selectionAnimFootAnchorY = 1;
    /** Wall-clock origin for this unit's current uninterrupted idle spell. */
    private selectionAnimationStartedAtMs = 0;
    /** Resume a Peasant attack at the same upright pose used by its closing atlas frame. */
    private peasantIdleResumeAtMs?: number;
    private troglodyteIdleResumeAtMs?: number;
    /** Stable randomized starting point for refreshed idle loops, preventing synchronized breathing. */
    private refreshedIdlePhaseRatio = 0;
    private activeTurnAnimationStartedAtMs = 0;
    private isShowingOrcBattleCryFrame = false;
    private isShowingScavengerFlourishFrame = false;
    // Last frame written to the sprite; -1 forces the next step to apply the in-phase frame.
    private selectionAnimFrameIndex = -1;
    /** An authored walking cycle temporarily takes precedence over the permanent idle cycle. */
    private walkAnim?: LoopAnimState;
    /** Keep the last horizontal facing after a move, Heroes III-style. */
    private facingDirection: -1 | 1 = 1;
    private stackForcedHidden = false;
    private isActiveTurn = false;
    private isDestroyed = false;
    private visualMode: "normal" | "hidden" | "ghost" | "revealed" = "normal";
    // Split preview: temporarily enlarge the count badge and (optionally) show a projected amount.
    private badgeEmphasisScale = 1;
    private badgeAmountOverride?: number;
    // Grayscale filter for the "revealed" mode (ranked placement: opponent roster shown in B&W).
    // Attached lazily from one immutable roster-wide instance.
    private desaturateFilter?: ColorMatrixFilter;
    private battlefieldAlphaHoleFillFilter?: ReturnType<typeof getBattlefieldAlphaHoleFillFilter>;
    private battlefieldContourFilter?: ReturnType<typeof getBattlefieldCreatureContourFilter>;
    private battlefieldStyleFilter?: ColorMatrixFilter;
    private battlefieldStyleSignature = "";
    /** Reused each frame so depth sorting does not allocate four geometry objects per visible unit. */
    private depthSortBounds?: Bounds;
    /** The badge already measures the live sprite before the scene's depth pass. */
    private depthSortBoundsAreCurrent = false;
    /** Transform snapshot guarding reuse of the expensive world-space sprite bounds. */
    private depthSortBoundsCacheState?: CreatureBoundsCacheState;
    private depthSortCandidate?: CreatureDepthSortCandidate;
    private inheritedScaleScratch?: HoCMath.XY;
    private projectedPositionScratch?: HoCMath.XY;
    private groundReferenceScratch?: HoCMath.XY;
    private previewCurrentGroundScratch?: HoCMath.XY;
    private previewDestinationGroundScratch?: HoCMath.XY;
    private battlefieldPreviewScratch?: BattlefieldUnitPreview;
    private idleBreathScaleScratch?: HoCMath.XY;
    private badgeScreenAnchor?: Point;
    private badgeLocalAnchor?: Point;
    /** Immutable render identity resolved once in fromBase instead of reconstructed every frame. */
    private smallTextureName = "";
    /** The stable fallback portrait/full-body texture; lazy assets are retained only after they resolve. */
    private baseTexture?: Texture;
    private idleAnimationStateAvailable = false;
    private creatureAnimationLabPreviewEnabled = false;
    private scavengerLabAnimationsEnabled = false;
    private arbalesterLabIdleEnabled = false;
    private arbalesterRangedShot?: AbortController;
    private dryadRangedShot?: AbortController;
    // "Revealed" roster marker: a translucent red cell beneath the B&W silhouette plus its name caption,
    // so the opponent's known army reads as a roster line-up rather than units already standing on the board.
    private rosterCard?: Container;
    private rosterCardPlate?: Graphics;
    private rosterCardDrawState?: RosterCardDrawState;
    // Uniform multiplier applied to the rendered sprite, shadow, badge and corner indicators.
    // 1 = normal one-cell board size. The placement bench renders unplaced units larger (>1) so
    // they read at "full size" while waiting to be deployed; placed/board units keep the default 1.
    private visualScaleMultiplier = 1;
    // Board mechanics stay on the regular square grid, while the painted dungeon floor uses a traced
    // perspective grid. Board units opt into that visual projection; roster/bench previews leave it off.
    private useBattlefieldVisualProjection = false;
    // Gold ground ring contained within the active creature's occupied footprint.
    private activeAura?: Container;
    private activeAuraGlow?: Graphics;
    private activeAuraMask?: Graphics;
    private activeAuraGlowBlurFilter?: BlurFilter | null;
    // Placement hover reuses the restrained active-turn cell light instead of the old stack of opaque
    // white circles drawn by HoverManager.
    private isHoverTurnAura = false;
    private activeAuraDrawState?: ContinuousEffectDrawState;
    /** Transparent blue-fire atlas layered beneath the active unit and the existing light rings. */
    private activeTurnFireSprite?: Sprite;
    private activeTurnFireFrameIndex = -1;
    // Color of the active-turn aura. White by default; the scene tints it (e.g. red) when the
    // active unit is the viewer's enemy so it reads clearly that it is not the viewer's turn.
    private activeAuraColor = 0xffffff;
    // While the active unit is mid-move or mid-attack, the aura is suppressed so it doesn't
    // distract from the action (set each frame by the scene).
    // Light-blue circulating ring + small orbiting dots shown around a unit while its Water Shield buff is
    // active (the once-per-battle absorb). Created lazily; hidden the frame the shield breaks.
    private waterShieldAura?: Graphics;
    private waterShieldAuraDrawState?: ContinuousEffectDrawState;
    // Animated water vortex under a unit trapped by Whirlpool. It keys off the shared status predicate so
    // the live Sandbox debuff object and Ranked's authoritative applied_debuffs snapshot render identically.
    private whirlpoolAura?: Graphics;
    private whirlpoolAuraDrawState?: ContinuousEffectDrawState;
    // Ice "crust" encasing a unit under the "Freeze" status (drawn over the sprite, above the icy tint).
    private freezeCrust?: Graphics;
    private freezeCrustDrawState?: ContinuousEffectDrawState;
    // Additive light layer over the ice crust: a sheen raking across + caustic sparks drifting inside the
    // shell. Separate Graphics so the light blends additively (glows) while the frost stays normal-blend.
    private freezeLight?: Graphics;
    // Water Shield dissolve burst: a one-shot ring-snap + droplet spray fired the instant the shield is
    // consumed (the buff disappears while the unit is still alive).
    private waterShieldWasActive = false;
    private waterShieldBreakStartMs?: number;
    private waterShieldBreakGfx?: Graphics;
    // Brief "jerk back" applied to the sprite/shadow (e.g. a petrifying-gaze hit yanking the
    // target away from the attacker). Decays to zero over ~220ms.
    private recoilStartMs = 0;
    private recoilDx = 0;
    private recoilDy = 0;
    // Only damage reactions add a restrained side-to-side vibration; attack lunges stay perfectly clean.
    private recoilShakeAmplitude = 0;
    // When true the recoil uses a wind-up envelope (pull back, then thrust forward, then settle) over a
    // longer duration — used for Pikeman's Skewer Strike spear thrust. Otherwise a simple out-and-back.
    private recoilWindup = false;
    private recoilDurationMs = 220;
    private currentRecoilX = 0;
    private currentRecoilY = 0;
    // Brief colour wash over the sprite when an effect lands on this unit — dark violet for a debuff
    // (e.g. Spit Ball), green for a buff. Decays over ~650ms; syncVisual reads it each frame via
    // currentEffectTint().
    private effectFlashStartMs = 0;
    private effectFlashColor = 0x2a0a3a;
    // "Bullet-time" dodge played when an attack fully misses this unit; stepped every frame from
    // ensureVisual. Lives until the spring-back finishes AND its afterimage ghosts have faded.
    private dodgeAnim?: DodgeAnimState;
    // undefined = not built yet; null = construction failed (headless — no GL), don't retry.
    private dodgeBlurFilter?: BlurFilter | null;
    // Spells support
    private pixiSpells: PixiRenderableSpell[] = [];
    private spellBookLayer?: Container;
    private digitTextures?: Map<number, Texture>; // 0-9 and -1
    /**
     * Attach rendering capabilities to an existing Unit instance.
     * (We rely on JS prototype + TS casting; Unit stays the core owner.)
     */
    public static fromBase(base: Unit, texResolver: TexResolver): RenderableUnit {
        Object.setPrototypeOf(base, RenderableUnit.prototype);
        const ru = base as RenderableUnit;
        ru.texResolver = texResolver;
        ru.pixiSpells = [];
        ru.stackPowerPips = [];
        ru.boardSelected = false;
        ru.selectionAnimFrames = undefined;
        ru.arbalesterIdlePager = undefined;
        ru.orcIdleAxeTwirlFrames = undefined;
        ru.orcActiveBattleCryFrames = undefined;
        ru.scavengerIdleBladeTwirlFrames = undefined;
        ru.scavengerActiveBattleCryFrames = undefined;
        ru.selectionAnimTiming = undefined;
        ru.selectionAnimFrameDurationMs = 0;
        ru.selectionAnimFootAnchorY = 1;
        ru.selectionAnimationStartedAtMs = performance.now();
        ru.refreshedIdlePhaseRatio = refreshedIdlePhaseRatio(ru.getId(), ru.getUnitProperties().name);
        ru.activeTurnAnimationStartedAtMs = 0;
        ru.isShowingOrcBattleCryFrame = false;
        ru.isShowingScavengerFlourishFrame = false;
        ru.scavengerLabAnimationsEnabled =
            usesApprovedBaseAnimations(ru.getName()) && ru.getName() === SCAVENGER_UNIT_NAME;
        ru.creatureAnimationLabPreviewEnabled = usesApprovedBaseAnimations(ru.getName());
        ru.arbalesterLabIdleEnabled = usesApprovedBaseAnimations(ru.getName()) && ru.getName() === ARBALESTER_UNIT_NAME;
        ru.arbalesterRangedShot = undefined;
        ru.dryadRangedShot = undefined;
        ru.selectionAnimFrameIndex = -1;
        ru.peasantIdleResumeAtMs = undefined;
        ru.troglodyteIdleResumeAtMs = undefined;
        ru.walkAnim = undefined;
        // Fresh units face the ENEMY, not a fixed screen direction: green/LEFT deploys on the left
        // and faces right, red/RIGHT deploys on the right and faces left. Movement during the fight
        // re-aims facing from the walk direction as before.
        ru.facingDirection = placementFacingDirectionForTeam(ru.getTeam());
        ru.stackForcedHidden = false;
        ru.isActiveTurn = false;
        ru.isDestroyed = false;
        ru.visualMode = "normal";
        // fromBase() bypasses the constructor (it re-prototypes an existing Unit), so class field
        // defaults never run — initialise every added field explicitly or it stays `undefined`.
        ru.badgeEmphasisScale = 1;
        ru.restingBadgeOffsetY = undefined;
        ru.movementBadgeOffsetY = undefined;
        ru.badgeAmountOverride = undefined;
        ru.badgeHeader = undefined;
        ru.badgeFlagGlow = undefined;
        ru.activeTurnPointer = undefined;
        ru.activeTurnPointerSuppressed = false;
        ru.badgeDrawState = undefined;
        ru.badgeFlagXs = undefined;
        ru.badgeFlagTopY = undefined;
        ru.badgeFlagBottomY = undefined;
        ru.badgeFlagWaveFrame = -1;
        ru.battlefieldFramingChangeListener = undefined;
        ru.battlefieldFramingWorldRoot = undefined;
        ru.battlefieldFramingGridSettings = undefined;
        ru.wolfRenderedCanvasHeight = undefined;
        ru.wolfRenderedReactionScale = 1;
        ru.wolfShadowReactionScale = 1;
        ru.wolfShadowProjectionScaleX = undefined;
        ru.wolfShadowProjectionScaleY = undefined;
        ru.wolfReactionRegistrationActive = false;
        ru.stackPowerDrawState = undefined;
        ru.projectedStackPower = undefined;
        ru.rosterCardDrawState = undefined;
        ru.activeAura = undefined;
        ru.activeAuraGlow = undefined;
        ru.activeAuraMask = undefined;
        ru.activeAuraGlowBlurFilter = undefined;
        ru.isHoverTurnAura = false;
        ru.activeAuraDrawState = undefined;
        ru.activeTurnFireSprite = undefined;
        ru.activeTurnFireFrameIndex = -1;
        ru.activeAuraColor = 0xffffff;
        ru.waterShieldAura = undefined;
        ru.waterShieldAuraDrawState = undefined;
        ru.whirlpoolAura = undefined;
        ru.whirlpoolAuraDrawState = undefined;
        ru.freezeCrust = undefined;
        ru.freezeCrustDrawState = undefined;
        ru.freezeLight = undefined;
        ru.waterShieldBreakGfx = undefined;
        ru.waterShieldBreakStartMs = undefined;
        ru.waterShieldWasActive = false;
        ru.recoilStartMs = 0;
        ru.recoilDx = 0;
        ru.recoilDy = 0;
        ru.currentRecoilX = 0;
        ru.currentRecoilY = 0;
        ru.effectFlashStartMs = 0;
        ru.effectFlashColor = 0x2a0a3a;
        ru.dodgeAnim = undefined;
        ru.dodgeBlurFilter = undefined;
        ru.silhouetteShadow = undefined;
        ru.silhouetteShadowReferenceTexture = undefined;
        ru.silhouetteShadowReferenceAnchorY = undefined;
        ru.silhouetteShadowSegments = [];
        ru.silhouetteShadowSegmented = false;
        ru.battlefieldShadowProjection = undefined;
        ru.shadowSegmentLengthMultipliers = undefined;
        ru.groundCastShadow = undefined;
        ru.silhouetteShadowBlurFilter = undefined;
        ru.battlefieldAlphaHoleFillFilter = undefined;
        ru.battlefieldContourFilter = undefined;
        ru.battlefieldStyleFilter = undefined;
        ru.battlefieldStyleSignature = "";
        ru.depthSortBounds = undefined;
        ru.depthSortBoundsAreCurrent = false;
        ru.depthSortBoundsCacheState = undefined;
        ru.depthSortCandidate = undefined;
        ru.inheritedScaleScratch = undefined;
        ru.projectedPositionScratch = undefined;
        ru.groundReferenceScratch = undefined;
        ru.previewCurrentGroundScratch = undefined;
        ru.previewDestinationGroundScratch = undefined;
        ru.battlefieldPreviewScratch = undefined;
        ru.idleBreathScaleScratch = undefined;
        ru.badgeScreenAnchor = undefined;
        ru.badgeLocalAnchor = undefined;
        ru.baseTexture = undefined;
        const unitProperties = ru.getUnitProperties();
        const footprintWidth = ru.getFootprintWidth();
        const footprintHeight = ru.getFootprintHeight();
        ru.smallTextureName = unitToTextureName(
            unitProperties.name,
            TextureType.SMALL,
            footprintWidth,
            footprintHeight,
        );
        ru.idleAnimationStateAvailable =
            getAnimationStateConfig(unitProperties.name, "idle", footprintWidth, footprintHeight) !== null;
        ru.shadowDrawWidth = 0;
        ru.shadowDrawHeight = 0;
        // Without this, visualScaleMultiplier is `undefined` -> targetSize = 128 * undefined = NaN
        // -> sprite.scale = NaN -> the unit collapses to an invisible point (renders as a bare dot).
        ru.visualScaleMultiplier = 1;
        ru.useBattlefieldVisualProjection = false;
        return ru;
    }
    public setSpellBookLayer(layer: Container, digitTextures: Map<number, Texture>): void {
        this.spellBookLayer = layer;
        this.digitTextures = digitTextures;
        this.parseSpells();
    }
    /** Attach/rebuild Pixi spellbook cells after a runtime ability grants this unit its first spell. */
    public ensureSpellBookRendering(layer: Container, digitTextures: Map<number, Texture>): boolean {
        if (this.getSpellsCount() <= 0) return false;
        this.setSpellBookLayer(layer, digitTextures);
        return true;
    }
    public override parseSpells(): void {
        // Keep Unit's authoritative Spell objects synchronized even before a Pixi spellbook layer exists.
        // Runtime ability changes (for example Predatory Assimilation) call this method to remove or grant
        // castable/spellbook mechanics; returning before the base parser left getSpells() stale in sandbox.
        super.parseSpells();

        if (!this.spellBookLayer || !this.digitTextures) return;

        // Clear existing
        this.pixiSpells.forEach((s) => s.destroy());
        this.pixiSpells = [];

        const spellsData = this.parseSpellData(this.unitProperties.spells);

        for (const [k, v] of spellsData.entries()) {
            const spArr = k.split(":");
            if (spArr.length !== 2) continue;

            // Ability-derived spells are stored with an empty faction prefix (":SpellName").
            // Treat an empty faction as "System" (matching getSpellConfig's own default) so those
            // auto-parsed spells render in the spellbook instead of being skipped.
            const factionName = spArr[0] || "System";
            const spellName = spArr[1];
            if (!spellName) continue;

            const spellProperties = HoCConfig.getSpellConfig(factionName, spellName);
            // Only the ICON is art now — the name is drawn as text (see PixiRenderableSpell.titleText).
            // This used to also require a hand-authored "<spell>_font" strip, and a missing one dropped the
            // spell from the book entirely and silently: that is how Wandering Mage shipped with an empty
            // spellbook. A new spell now needs one icon and nothing else.
            const generatedIconKey =
                spellName === "Fire Strike"
                    ? "fire_strike_chaos_256_v1"
                    : spellName === "Meteorite"
                      ? "meteorite_chaos_256_v1"
                      : undefined;
            const iconTex = this.texResolver(generatedIconKey ?? SpellHelper.spellToTextureName(spellName));
            const cellTex = this.texResolver("spell_cell_260");
            const scrollBadgeTex = this.texResolver("spell_cast_wax_seal_blank_v1");
            const stackRailTex = this.texResolver("spell_stack_rail_variant2");
            const stackFillGreenTex = this.texResolver("spell_stack_fill_green_variant2");
            const stackFillRedTex = this.texResolver("spell_stack_fill_red_variant2");
            const innerFrameTex = this.texResolver("spell_inner_frame_linework_v2");

            if (iconTex && cellTex) {
                const newSpell = new PixiRenderableSpell(
                    { spellProperties: spellProperties, amount: v },
                    this.spellBookLayer,
                    {
                        spell_cell_260: cellTex,
                        scrollBadge: scrollBadgeTex,
                        innerFrame: innerFrameTex,
                        stackRail: stackRailTex,
                        stackFillGreen: stackFillGreenTex,
                        stackFillRed: stackFillRedTex,
                    },
                    iconTex,
                    this.digitTextures,
                );
                this.pixiSpells.push(newSpell);
            }
        }
    }
    public renderSpells(pageNumber: number): void {
        this.syncSpellAmountsFromProperties();

        const windowLeft = Math.min(this.pixiSpells.length, Math.max(0, (pageNumber - 1) * 6));
        const windowRight = Math.min(this.pixiSpells.length, windowLeft + 6);
        let bookPosition = 1;

        for (let i = windowLeft; i < windowRight; i++) {
            if (this.pixiSpells[i]) {
                // Ensure spell book layer visibility is managed by Overlay
                this.pixiSpells[i].renderOnPage(bookPosition++, this.getStackPower());
            }
        }

        // Pages are contiguous, so retire the two outside ranges directly instead of allocating a
        // rendered-index list and scanning it with includes() on every open-book frame.
        for (let i = 0; i < windowLeft; i++) {
            this.pixiSpells[i].cleanupPagePosition();
        }
        for (let i = windowRight; i < this.pixiSpells.length; i++) {
            this.pixiSpells[i].cleanupPagePosition();
        }
    }
    public hideSpells(): void {
        for (const s of this.pixiSpells) {
            s.cleanupPagePosition();
        }
    }
    /** The unit's built spellbook card for a spell name, if the book has been constructed. */
    public getBookSpellByName(spellName: string): PixiRenderableSpell | undefined {
        return this.pixiSpells.find((spell) => spell.getName() === spellName);
    }
    public setHoveredSpell(spell: PixiRenderableSpell | undefined): void {
        for (const s of this.pixiSpells) {
            s.setHighlighted(s === spell);
        }
    }
    public getHoveredSpell(mousePosition: HoCMath.XY, includeUnavailable = false): PixiRenderableSpell | undefined {
        for (const s of this.pixiSpells) {
            if (s.isHover(mousePosition, this.getStackPower(), includeUnavailable)) {
                return s;
            }
        }
        return undefined;
    }
    private syncSpellAmountsFromProperties(): void {
        // Authoritative remaining casts come from the Spell objects (getSpells()). In sandbox the engine's
        // useSpell keeps their amount in lockstep with the unitProperties.spells entry list; in RANKED the
        // client never runs the cast engine and only syncs the Spell objects from the snapshot's
        // spellAmounts (reconcileAuraEffectsFromSnapshot -> setAmount) — the raw entry list stays at the
        // base count. Reading that list here made the spellbook show every spell as still available after a
        // cast in ranked. Sum by name so the pixi badge matches each spell's real getAmount().
        const remainingByName = new Map<string, number>();
        for (const spell of this.getSpells()) {
            remainingByName.set(spell.getName(), (remainingByName.get(spell.getName()) ?? 0) + spell.getAmount());
        }
        for (const spell of this.pixiSpells) {
            spell.syncAmount(remainingByName.get(spell.getName()) ?? 0);
        }
    }
    /**
     * Whether a LOGICAL board point lands inside this unit's rendered sprite box — and at what draw
     * depth. The silhouette rises well above (and, for the mounted class, hangs past) the cells the
     * unit stands on, so a selection click on the visible body often misses every occupied cell; the
     * scene falls back to this test and, among overlapping silhouettes, picks the highest depth (the
     * frontmost-drawn body — the one the click visually touched). The projection into the sprite's
     * own coordinate space happens here, so callers never need to know whether this unit renders on
     * the trapezoid battlefield or the flat board.
     */
    public spriteHitDepth(logicalPoint: HoCMath.XY, gs: GridSettings): number | undefined {
        const sprite = this.sprite;
        if (!sprite || this.isDestroyed || !sprite.visible || !sprite.parent || sprite.alpha <= 0) {
            return undefined;
        }
        const visualPoint = this.useBattlefieldVisualProjection
            ? projectBattlefieldPoint(logicalPoint, gs)
            : logicalPoint;
        const local = sprite.toLocal(new Point(visualPoint.x, visualPoint.y), sprite.parent);
        return sprite.getLocalBounds().containsPoint(local.x, local.y) ? sprite.zIndex : undefined;
    }
    private resolveBaseTexture(): Texture | undefined {
        if (this.baseTexture && !this.baseTexture.destroyed) return this.baseTexture;
        const texture = this.texResolver(this.smallTextureName);
        if (texture) this.baseTexture = texture;
        return texture;
    }
    /** Ensure sprite + badge exist and are laid out for the current unit state. */
    public ensureVisual(worldRoot: Container, gs: GridSettings, now = performance.now()): number | undefined {
        if (this.isDestroyed) return;
        const props = this.getUnitProperties();
        this.watchBattlefieldCreatureFramingChanges(worldRoot, gs, props.name);
        const logicalPos = this.getPosition();
        const pos = this.useBattlefieldVisualProjection
            ? projectBattlefieldPoint(logicalPos, gs, (this.projectedPositionScratch ??= { x: 0, y: 0 }))
            : logicalPos;
        // Every draw decision below is taken from the unit's own footprint rather than its square `size`,
        // which is only the art tier. They agree for every shipped creature (all 1x1 or 2x2).
        const footprintWidth = this.getFootprintWidth();
        const footprintHeight = this.getFootprintHeight();
        const texName = this.smallTextureName;
        const hasAuthoredIdle = this.hasAnimationState("idle");
        const tallBoardModel = usesTallBoardModel(props, texName, hasAuthoredIdle);
        const refreshedFullBodyScale = usesRefreshedFullBodyScale(props, hasAuthoredIdle);
        const baseTex = this.resolveBaseTexture();
        if (!baseTex) return;
        // --- sprite ---
        if (!this.sprite) {
            // first time: use base texture
            this.sprite = new Sprite(baseTex);
            // PixiDrawer owns the shared units container and destroys its children directly when the
            // entire scene is replaced. Observe that path too: Container.destroy() detaches filters but
            // does not destroy the unit-owned filter resources held below.
            this.sprite.once("destroyed", () => this.handlePrimarySpriteDestroyed());
            this.selectionAnimationStartedAtMs = now;
            this.sprite.anchor.set(0.5);
            this.sprite.scale.y = -1; // y-up world → flip in Pixi
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            // Dynamic Z: Objects lower on screen (low Y) draw last (high Z).
            // Base ~ 3000. Range 0-2048.
            this.sprite.zIndex = 4000 - pos.y;
            worldRoot.addChild(this.sprite);
        } else {
            // Preserve a creature's permanent authored idle atlas, or its temporary walk atlas, instead of
            // forcing the old static texture back on every scene synchronization pass.
            const atlasActive =
                !!this.oneShotAnim ||
                !!this.walkAnim?.frames.length ||
                ((this.boardSelected || hasAuthoredIdle) && !!this.selectionAnimFrames?.length);
            if (!atlasActive && this.sprite.texture !== baseTex) {
                this.sprite.texture = baseTex;
            }
            if (!this.sprite.parent || this.sprite.parent !== worldRoot) {
                worldRoot.addChild(this.sprite);
            }
        }
        // Creatures with an authored idle state breathe continuously, not only while selected. Lazily build the atlas once
        // the sprite exists; the shared frame cache means every stack reuses the same textures.
        if (hasAuthoredIdle && !this.selectionAnimFrames?.length) {
            this.startSelectionAnimationInternal();
        }
        // Select the current idle/special texture before measuring it and applying its authored anchor.
        this.stepSelectionAnimation(now);
        const showingOrcBattleCry =
            props.name === ORC_UNIT_NAME && this.isShowingOrcBattleCryFrame && !this.walkAnim && !this.oneShotAnim;
        const showingScavengerFlourish =
            props.name === SCAVENGER_UNIT_NAME &&
            this.isShowingScavengerFlourishFrame &&
            !this.walkAnim &&
            !this.oneShotAnim;
        clearScavengerHitRegistration(this.sprite);
        const wolfReactionScale =
            props.name === WOLF_UNIT_NAME && !this.walkAnim
                ? wolfReactionFrameScale(this.oneShotAnim?.stateName, this.oneShotAnim?.frameIndex ?? -1)
                : 1;
        const wolfAttackCanvasScale =
            props.name === WOLF_UNIT_NAME && !this.walkAnim ? wolfActionCanvasScale(this.oneShotAnim?.stateName) : 1;
        const footAnchorY = tallBoardModel
            ? ((props.name === WOLF_UNIT_NAME && !this.walkAnim && isWolfAuthoredAction(this.oneShotAnim?.stateName)
                  ? isWolfSpriteAttack(this.oneShotAnim?.stateName)
                      ? this.oneShotAnim?.footAnchorY
                      : wolfReactionFootAnchorY(wolfReactionScale)
                  : props.name === PEASANT_UNIT_NAME && this.oneShotAnim?.stateName === "death"
                    ? peasantDeathAnchorY(this.oneShotAnim.footAnchorY, this.oneShotAnim.frameIndex)
                    : this.oneShotAnim?.footAnchorY) ??
              this.walkAnim?.footAnchorY ??
              (showingOrcBattleCry
                  ? ORC_ACTIVE_BATTLE_CRY_FOOT_ANCHOR_Y
                  : showingScavengerFlourish
                    ? SCAVENGER_FLOURISH_FOOT_ANCHOR_Y
                    : this.selectionAnimFootAnchorY))
            : 0.5;
        const actionAnchorX =
            props.name === "Manticore" && this.creatureAnimationLabPreviewEnabled && this.walkAnim
                ? MANTICORE_LAB_WALK_ANCHOR_X
                : props.name === "Valkyrie" &&
                    this.creatureAnimationLabPreviewEnabled &&
                    (this.walkAnim || this.valkyrieLabCanvasScale() > 1)
                  ? valkyrieLabActionAnchorX(this.oneShotAnim?.stateName)
                  : props.name === PEASANT_UNIT_NAME &&
                      this.oneShotAnim &&
                      isAttackAnimationStateName(this.oneShotAnim.stateName)
                    ? peasantAttackAnchorX(this.oneShotAnim.stateName, this.oneShotAnim.frameIndex)
                    : 0.5;
        if (this.sprite.anchor.x !== actionAnchorX || this.sprite.anchor.y !== footAnchorY) {
            this.sprite.anchor.set(actionAnchorX, footAnchorY);
        }
        // Legacy portrait chips use a fixed board texture. Full-body models instead key their authored
        // visible bounds to the live cell size so viewport scaling cannot change their battlefield footprint.
        const battlefieldCreatureScale = battlefieldCreatureScaleMultiplier(
            props.name,
            footprintWidth,
            footprintHeight,
        );
        const battlefieldPerspectiveScale = this.useBattlefieldVisualProjection
            ? battlefieldCreaturePerspectiveScale(logicalPos.y, footprintHeight, gs)
            : 1;
        const editorFraming = resolveStoredBattlefieldCreatureFraming(props.name);
        // A rectangular footprint is gameplay geometry, not permission to deform the authored figure.
        // Size legacy chips from the shorter footprint side, preserving the same square presentation they
        // had before mounted/long-bodied creatures received their 2x1 occupancy.
        const visualFootprintSide = Math.min(footprintWidth, footprintHeight);
        const chipTargetSide =
            visualFootprintSide * BATTLEFIELD_CHIP_CELL_PIXELS * this.visualScaleMultiplier * battlefieldCreatureScale;
        // The rectangular board fit intentionally scales cell positions differently on X and Y. Undo that
        // camera deformation on the artwork alone so creatures keep their original square-fit screen size.
        const inheritedScale = inheritedAbsoluteScale(worldRoot, this.inheritedScaleScratch);
        this.inheritedScaleScratch = inheritedScale;
        const screenSizeCompensation = legacyBoardChildScaleCompensation(inheritedScale.x, inheritedScale.y);
        const baseWidth = baseTex.width > 1 ? baseTex.width : 1;
        const baseHeight = baseTex.height > 1 ? baseTex.height : 1;
        const currentTexture = this.sprite.texture;
        const currentWidth = currentTexture && currentTexture.width > 1 ? currentTexture.width : baseWidth;
        const currentHeight = currentTexture && currentTexture.height > 1 ? currentTexture.height : baseHeight;
        // Freeze the same deterministic idle source in gameplay and in the shadow editor. Keeping the
        // source frame and its authored foot anchor identical is what makes an editor profile transfer 1:1.
        const canonicalShadowReferenceTexture = battlefieldCanonicalShadowReference(
            baseTex,
            hasAuthoredIdle ? this.selectionAnimFrames : undefined,
        );
        if (this.useBattlefieldVisualProjection && !this.walkAnim && !this.oneShotAnim) {
            this.silhouetteShadowReferenceTexture = canonicalShadowReferenceTexture;
            this.silhouetteShadowReferenceAnchorY = hasAuthoredIdle ? this.selectionAnimFootAnchorY : footAnchorY;
        }
        const shadowReferenceTexture = this.silhouetteShadowReferenceTexture ?? currentTexture;
        let shadowReferenceAnchorY = this.sprite.anchor.y;
        let shadowReferenceAnchorX = this.sprite.anchor.x;
        const usesThiefSilhouette = props.name === THIEF_UNIT_NAME || props.name === SCAVENGER_UNIT_NAME;
        // Key tall models by HEIGHT so they remain exactly 1.5 cells tall. Thief's authored idle/walk
        // frames contain a thin transparent safety margin, so size the visible body rather than that canvas.
        const thiefUsesNormalizedActionFrame = !!this.walkAnim || !!this.oneShotAnim || showingScavengerFlourish;
        const thiefVisibleHeightRatio =
            this.scavengerLabAnimationsEnabled &&
            !this.walkAnim &&
            (!this.oneShotAnim || SCAVENGER_LAB_ACTIONS.includes(this.oneShotAnim.stateName))
                ? SCAVENGER_LAB_VISIBLE_HEIGHT_RATIO / scavengerLabCanvasScale(this.oneShotAnim?.stateName)
                : props.name === SCAVENGER_UNIT_NAME && this.walkAnim
                  ? SCAVENGER_ORIGINAL_WALK_VISIBLE_HEIGHT_RATIO
                  : thiefUsesNormalizedActionFrame
                    ? THIEF_WALK_VISIBLE_HEIGHT_RATIO
                    : THIEF_IDLE_VISIBLE_HEIGHT_RATIO;
        const thiefVisibleWidthRatio = thiefUsesNormalizedActionFrame
            ? THIEF_WALK_VISIBLE_WIDTH_RATIO
            : THIEF_IDLE_VISIBLE_WIDTH_RATIO;
        const scaleReferenceHeight = showingOrcBattleCry
            ? ORC_ACTIVE_BATTLE_CRY_RENDER_HEIGHT
            : showingScavengerFlourish
              ? SCAVENGER_FLOURISH_RENDER_HEIGHT
              : currentHeight;
        const visibleHeight =
            (scaleReferenceHeight * (usesThiefSilhouette ? thiefVisibleHeightRatio : 1)) /
            (props.name === BLACKSMITH_UNIT_NAME
                ? blacksmithActionCanvasScale(this.oneShotAnim?.stateName)
                : props.name === SQUIRE_UNIT_NAME
                  ? squireActionCanvasScale(this.oneShotAnim?.stateName)
                  : props.name === ORC_UNIT_NAME
                    ? orcActionCanvasScale(this.oneShotAnim?.stateName)
                    : props.name === WANDERING_MAGE_UNIT_NAME
                      ? wanderingMageActionCanvasScale(this.oneShotAnim?.stateName)
                      : props.name === TROGLODYTE_UNIT_NAME
                        ? troglodyteActionCanvasScale(this.oneShotAnim?.stateName)
                        : props.name === MERMAID_UNIT_NAME
                          ? mermaidActionCanvasScale(this.oneShotAnim?.stateName)
                          : 1);
        const visibleWidth = currentWidth * (usesThiefSilhouette ? thiefVisibleWidthRatio : 1);
        const refreshedVisualProfile = refreshedBoardVisualProfileForUnit(props.name);
        const boardModelHeightCells = refreshedFullBodyScale
            ? refreshedVisualProfile.heightCells
            : props.name === SCAVENGER_UNIT_NAME
              ? SCAVENGER_BOARD_MODEL_HEIGHT_CELLS
              : 1.5;
        // `heightCells` describes the authored figure itself. Footprint width/height only changes occupied
        // cells; the approved square-body enlargement remains the sole mechanical size multiplier.
        const boardModelTargetHeightCells = boardModelHeightCells * battlefieldCreatureScale;
        const chipScaleX = chipTargetSide / currentWidth;
        const chipScaleY = chipTargetSide / currentHeight;
        const scaleY = tallBoardModel ? (gs.getCellSize() * boardModelTargetHeightCells) / visibleHeight : chipScaleY;
        // Idle/walk stay inside the requested width. Action sheets, Orc's square padded atlases and the
        // restyled Scavenger must keep a uniform scale. The Scavenger's new square cutout was previously
        // squeezed on X by the legacy Thief width fit, which made its body look vertically stretched.
        const tallBoardWidthCells =
            props.name === SCAVENGER_UNIT_NAME
                ? SCAVENGER_BOARD_MODEL_HEIGHT_CELLS / 1.5
                : props.name === THIEF_UNIT_NAME
                  ? 1
                  : 1.1;
        const scaleX = tallBoardModel
            ? refreshedFullBodyScale ||
              (this.oneShotAnim &&
                  !(
                      props.name === WANDERING_MAGE_UNIT_NAME &&
                      isWanderingMageAuthoredAction(this.oneShotAnim.stateName)
                  )) ||
              props.name === ORC_UNIT_NAME ||
              props.name === SCAVENGER_UNIT_NAME ||
              showingScavengerFlourish
                ? scaleY * (refreshedFullBodyScale ? refreshedVisualProfile.widthScale : 1)
                : usesThiefSilhouette
                  ? (gs.getCellSize() * tallBoardWidthCells * visualFootprintSide) / visibleWidth
                  : Math.min(
                        scaleY,
                        (gs.getCellSize() *
                            tallBoardWidthCells *
                            visualFootprintSide *
                            (props.name === WANDERING_MAGE_UNIT_NAME
                                ? wanderingMageActionCanvasScale(this.oneShotAnim?.stateName)
                                : 1)) /
                            currentWidth,
                    )
            : chipScaleX;
        // The bottom anchor is the creature's foot line. Breathing stretches/compresses only the
        // vertical scale around that anchor, so the body rises while both feet stay planted. Every
        // stack gets a stable phase offset so a whole army never inhales in lockstep.
        const commonIdleBreathScales =
            COMMON_IDLE_BREATH_SETTINGS.enabled &&
            props.name !== BLACKSMITH_UNIT_NAME &&
            !(props.name === "Healer" && this.creatureAnimationLabPreviewEnabled) &&
            !(props.name === "Medusa" && this.creatureAnimationLabPreviewEnabled) &&
            !(props.name === "Elf" && this.creatureAnimationLabPreviewEnabled) &&
            !(props.name === "White Tiger" && this.creatureAnimationLabPreviewEnabled) &&
            !(props.name === "Valkyrie" && this.creatureAnimationLabPreviewEnabled) &&
            !(props.name === "Manticore" && this.creatureAnimationLabPreviewEnabled) &&
            creatureGenericWholeSpriteMotionEnabledForLevel(props.level) &&
            !this.walkAnim &&
            !this.oneShotAnim
                ? commonIdleBreathScalesForElapsed(
                      performance.now() + this.refreshedIdlePhaseRatio * COMMON_IDLE_BREATH_PERIOD_MS,
                  )
                : undefined;
        const orcIdleElapsedMs = this.isActiveTurn
            ? orcActiveBattleCryBreathElapsed(now - this.activeTurnAnimationStartedAtMs)
            : now - this.selectionAnimationStartedAtMs;
        const idleOrcBreathScales =
            CREATURE_SPRITE_ANIMATION_SETTINGS.enabled &&
            !usesApprovedPermanentIdleAtlas(props.name) &&
            !this.walkAnim &&
            !this.oneShotAnim &&
            props.name === ORC_UNIT_NAME
                ? orcIdleBreathScalesForElapsed(orcIdleElapsedMs, (this.idleBreathScaleScratch ??= { x: 1, y: 1 }))
                : undefined;
        const thiefIdleElapsedMs =
            props.name === SCAVENGER_UNIT_NAME && this.isActiveTurn
                ? scavengerActiveBattleCryBreathElapsed(now - this.activeTurnAnimationStartedAtMs)
                : now - this.selectionAnimationStartedAtMs;
        const idleThiefBreathScales =
            CREATURE_SPRITE_ANIMATION_SETTINGS.enabled && !this.walkAnim && !this.oneShotAnim && usesThiefSilhouette
                ? thiefIdleBreathScalesForElapsed(thiefIdleElapsedMs, (this.idleBreathScaleScratch ??= { x: 1, y: 1 }))
                : undefined;
        // The Mage's authored idle already contains local breathing; keep its canvas scale fixed.
        const idleBreathScales =
            COMMON_IDLE_BREATH_SETTINGS.enabled &&
            creatureGenericWholeSpriteMotionEnabledForLevel(props.level) &&
            props.name !== WANDERING_MAGE_UNIT_NAME
                ? usesThiefSilhouette
                    ? (idleThiefBreathScales ?? commonIdleBreathScales)
                    : (idleOrcBreathScales ?? commonIdleBreathScales)
                : undefined;
        const ashMothActionScale =
            props.name === WANDERING_MAGE_UNIT_NAME && this.oneShotAnim
                ? ashMothActionScaleMultiplier(this.oneShotAnim.stateName, this.oneShotAnim.frameIndex)
                : 1;
        const peasantActionScale =
            props.name === PEASANT_UNIT_NAME && this.oneShotAnim
                ? peasantActionScaleMultiplier(this.oneShotAnim.stateName, this.oneShotAnim.frameIndex)
                : 1;
        const wolfWalkScale =
            props.name === WOLF_UNIT_NAME && this.walkAnim ? wolfWalkFrameScaleMultiplier(this.walkAnim.frameIndex) : 1;
        const wolfIdleScale =
            props.name === WOLF_UNIT_NAME && !this.walkAnim && !this.oneShotAnim
                ? wolfIdleFrameScale(this.selectionAnimFrameIndex)
                : 1;
        const squireWalkScale =
            props.name === SQUIRE_UNIT_NAME && this.walkAnim ? SQUIRE_WALK_VISIBLE_SCALE_MULTIPLIER : 1;
        const arbalesterWalkScale =
            props.name === ARBALESTER_UNIT_NAME && this.walkAnim
                ? arbalesterWalkScaleMultiplier(this.walkAnim.frameIndex)
                : 1;
        const actionScale =
            ashMothActionScale *
            peasantActionScale *
            wolfWalkScale *
            wolfIdleScale *
            wolfReactionScale *
            wolfAttackCanvasScale *
            this.trollLabCanvasScale() *
            this.centaurLabCanvasScale() *
            this.leprechaunLabCanvasScale() *
            this.elfLabCanvasScale() *
            this.medusaLabCanvasScale() *
            squireWalkScale *
            (props.name === "Berserker" && this.walkAnim
                ? BERSERKER_WALK_VISIBLE_SCALE_MULTIPLIER
                : isBerserkerAuthoredAction(props.name, this.oneShotAnim?.stateName)
                  ? BERSERKER_SWORD_IDLE_SCALE
                  : !this.oneShotAnim
                    ? this.berserkerLabIdleScale()
                    : 1) *
            arbalesterWalkScale *
            (props.name === CENTAUR_UNIT_NAME && this.creatureAnimationLabPreviewEnabled && this.walkAnim
                ? centaurLabWalkScale(this.walkAnim.frameIndex)
                : 1) *
            (props.name === "Fairy" && this.creatureAnimationLabPreviewEnabled && this.walkAnim
                ? FAIRY_LAB_WALK_SCALE
                : 1) *
            (props.name === "Valkyrie" && this.creatureAnimationLabPreviewEnabled && this.walkAnim
                ? VALKYRIE_LAB_WALK_SCALE
                : this.valkyrieLabCanvasScale()) *
            (props.name === "Manticore" && this.creatureAnimationLabPreviewEnabled && this.walkAnim
                ? MANTICORE_LAB_WALK_SCALE
                : this.manticoreLabCanvasScale()) *
            this.battleMageLabCanvasScale() *
            (this.walkAnim ? 1 : this.arbalesterLabScaleMultiplier(this.oneShotAnim?.stateName));
        const squireDeathHorizontalScale =
            props.name === SQUIRE_UNIT_NAME && this.oneShotAnim?.stateName === "death"
                ? SQUIRE_DEATH_HORIZONTAL_SCALE_MULTIPLIER
                : 1;
        const actionScaleX =
            actionScale *
            (props.name === "Battle Mage" && this.creatureAnimationLabPreviewEnabled && this.walkAnim
                ? BATTLE_MAGE_LAB_WALK_WIDTH_SCALE
                : 1) *
            (props.name === TROLL_UNIT_NAME && this.creatureAnimationLabPreviewEnabled && this.walkAnim
                ? TROLL_LAB_WALK_SCALE_X
                : 1) *
            (props.name === "Fairy" && this.creatureAnimationLabPreviewEnabled && this.walkAnim
                ? FAIRY_LAB_WALK_WIDTH_SCALE
                : 1) *
            (props.name === ARBALESTER_UNIT_NAME && this.walkAnim ? ARBALESTER_WALK_HORIZONTAL_SCALE : 1) *
            (props.name === "Pikeman" && this.walkAnim ? PIKEMAN_WALK_HORIZONTAL_SCALE : 1) *
            (props.name === WANDERING_MAGE_UNIT_NAME && this.walkAnim
                ? WANDERING_MAGE_WALK_VISIBLE_WIDTH_MULTIPLIER
                : 1) *
            squireDeathHorizontalScale *
            (props.name === PEASANT_UNIT_NAME &&
            this.oneShotAnim &&
            isAttackAnimationStateName(this.oneShotAnim.stateName)
                ? peasantAttackHorizontalScaleMultiplier(this.oneShotAnim.stateName, this.oneShotAnim.frameIndex)
                : 1);
        const renderedScaleY =
            scaleY *
            (props.name === TROLL_UNIT_NAME && this.creatureAnimationLabPreviewEnabled && this.walkAnim
                ? TROLL_LAB_WALK_SCALE_Y
                : 1) *
            (idleBreathScales?.y ?? 1) *
            actionScale *
            screenSizeCompensation.y *
            editorFraming.scaleY *
            battlefieldPerspectiveScale;
        const authoredDirectedScaleX =
            scaleX *
            (idleBreathScales?.x ?? 1) *
            actionScaleX *
            this.facingDirection *
            nativeBoardFacingMultiplier(props.name) *
            editorFraming.scaleX *
            battlefieldPerspectiveScale;
        const directedScaleX = authoredDirectedScaleX * screenSizeCompensation.x;
        if (this.sprite.scale.x !== directedScaleX || this.sprite.scale.y !== -renderedScaleY) {
            this.sprite.scale.set(directedScaleX, -renderedScaleY);
        }
        if (props.name === WOLF_UNIT_NAME) {
            this.wolfRenderedCanvasHeight = currentHeight / (wolfWalkScale * wolfIdleScale * wolfAttackCanvasScale);
            this.wolfRenderedReactionScale = wolfReactionScale;
        }
        this.updateCurrentRecoil(now);
        // The editor is authored on the lowest (maximum-size) row. Attenuate its cell-relative
        // placement by the same row factor as the silhouette, while the projected ground reference
        // below keeps the feet at the same proportional inset inside every painted cell.
        const authoredOffsetX = refreshedFullBodyScale
            ? refreshedVisualProfile.offsetXCells *
              gs.getCellSize() *
              this.facingDirection *
              battlefieldPerspectiveScale
            : 0;
        const projectedFootPosition = this.getBattlefieldGroundReference(
            logicalPos,
            gs,
            (this.groundReferenceScratch ??= { x: 0, y: 0 }),
        );
        const spriteX =
            projectedFootPosition.x +
            authoredOffsetX +
            this.currentRecoilX +
            gs.getCellSize() * editorFraming.offsetXCells * this.facingDirection * battlefieldPerspectiveScale;
        // Every full-body model uses one stable ground line in every state. The state-specific anchor above
        // points at the actual authored boot row, so transparent frame padding cannot move the creature.
        // The world root is y-up. Keep the Scavenger's authored boot row intact, but lift the complete
        // figure (and the shadows that derive from spriteY) by five percent of its rendered height.
        const figureVerticalLift =
            props.name === SCAVENGER_UNIT_NAME
                ? gs.getCellSize() *
                  boardModelTargetHeightCells *
                  editorFraming.scaleY *
                  SCAVENGER_BATTLEFIELD_VERTICAL_LIFT_FRACTION *
                  battlefieldPerspectiveScale
                : 0;
        const spriteY =
            projectedFootPosition.y +
            this.currentRecoilY -
            gs.getCellSize() * editorFraming.offsetYCells * battlefieldPerspectiveScale +
            figureVerticalLift;
        if (this.sprite.x !== spriteX || this.sprite.y !== spriteY) {
            this.sprite.position.set(spriteX, spriteY);
        }
        if (this.scavengerLabAnimationsEnabled && this.oneShotAnim?.stateName === "hit") {
            applyScavengerHitRegistration(this.sprite, this.oneShotAnim.frameIndex);
            shadowReferenceAnchorY = this.sprite.anchor.y;
            shadowReferenceAnchorX = this.sprite.anchor.x;
        }
        if (isBattlefieldCreatureEditorActive()) {
            const bounds = this.sprite.getBounds();
            publishBattlefieldCreatureVisualBounds(props.name, {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
                cellWidth: gs.getCellSize() * inheritedScale.x,
                cellHeight: gs.getCellSize() * inheritedScale.y,
            });
        }
        const spriteVisible = this.visualMode !== "hidden";
        if (this.sprite.visible !== spriteVisible) this.sprite.visible = spriteVisible;
        // Units with the "Hidden" buff (e.g. White Tiger) are drawn semi-transparent as a cue.
        const isHidden = this.hasBuffActive("Hidden");
        const normalSpriteAlpha = isHidden ? 0.4 : 1;
        const spriteAlpha =
            this.visualMode === "ghost" ? 0.25 : this.visualMode === "revealed" ? 0.9 : normalSpriteAlpha;
        if (this.sprite.alpha !== spriteAlpha) this.sprite.alpha = spriteAlpha;
        const spriteTint = this.currentEffectTint(now);
        if (this.sprite.tint !== spriteTint) this.sprite.tint = spriteTint;
        // "Revealed" mode (ranked placement: the opponent's known roster) draws the sprite in black &
        // white so it clearly reads as an enemy silhouette, not one of the viewer's own units.
        if (this.visualMode === "revealed") {
            this.desaturateFilter ??= revealedRosterDesaturateFilter();
        }
        // Retire the experimental shared colour grade. The purpose-built contour pass below is deliberately
        // edge-only: it leaves interior colour untouched while matching the approved level-three baked rim.
        // Gameplay-only filters (motion blur, revealed-roster grayscale) remain intact.
        const retiredBattlefieldStyleFilter = this.battlefieldStyleFilter;
        const retiredBattlefieldAlphaHoleFillFilter = this.battlefieldAlphaHoleFillFilter;
        const retiredBattlefieldContourFilter = this.battlefieldContourFilter;
        // The approved Peasant walk and combat atlases already have their alpha cracks repaired in the
        // source frames. Re-running the bridge shader on their antialiased weapon and body edges can
        // brighten isolated pixels into a white rim during the transition away from idle.
        const peasantUsesSourceRepairedAtlas =
            props.name === PEASANT_UNIT_NAME &&
            (this.walkAnim ||
                (this.oneShotAnim &&
                    (isAttackAnimationStateName(this.oneShotAnim.stateName) || this.oneShotAnim.stateName === "hit")));
        const runtimeAlphaHoleFillFilter =
            shouldFillBattlefieldAlphaHoles(props.name) && !peasantUsesSourceRepairedAtlas
                ? getBattlefieldAlphaHoleFillFilter()
                : undefined;
        const runtimeContourFilter =
            CREATURE_SPRITE_ANIMATION_SETTINGS.enabled ||
            shouldApplyRuntimeBattlefieldContour(props.name, footprintWidth, footprintHeight)
                ? getBattlefieldCreatureContourFilter(
                      battlefieldCreatureContourOpacity(logicalPos.y, footprintHeight, gs),
                  )
                : undefined;
        const installedFilters = this.sprite.filters ?? EMPTY_FILTERS;
        const desiredFilters = reconcileManagedSpriteFilters<Filter>(
            installedFilters,
            retiredBattlefieldStyleFilter,
            retiredBattlefieldAlphaHoleFillFilter,
            retiredBattlefieldContourFilter,
            this.desaturateFilter,
            runtimeAlphaHoleFillFilter,
            runtimeContourFilter,
            this.visualMode === "revealed",
        );
        this.battlefieldAlphaHoleFillFilter = runtimeAlphaHoleFillFilter;
        this.battlefieldContourFilter = runtimeContourFilter;
        this.battlefieldStyleFilter = undefined;
        this.battlefieldStyleSignature = "";
        if (desiredFilters) {
            this.sprite.filters = desiredFilters.length ? desiredFilters : null;
        }
        this.syncCreaturePalette(now, true);

        // The current pose casts the silhouette; the editor profile controls its projection on the floor.
        // Wolf's idle is rendered by a filter. Always project its opaque canonical figure,
        // independently of the filtered display texture or any previous animation carrier.
        const shadowSourceTexture =
            props.name === WOLF_UNIT_NAME && !this.walkAnim && !this.oneShotAnim
                ? canonicalShadowReferenceTexture
                : battlefieldShadowSourceForUnit(props.name, shadowReferenceTexture, currentTexture);
        if (!this.silhouetteShadow) {
            this.silhouetteShadow = new Sprite(shadowSourceTexture);
            this.silhouetteShadow.anchor.set(shadowReferenceAnchorX, shadowReferenceAnchorY);
            this.silhouetteShadow.tint = 0x000000;
            this.silhouetteShadow.blendMode = "multiply";
            this.silhouetteShadow.roundPixels = false;
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            this.silhouetteShadow.zIndex = 4000 - pos.y - 0.75;
            worldRoot.addChild(this.silhouetteShadow);
        } else if (!this.silhouetteShadow.parent || this.silhouetteShadow.parent !== worldRoot) {
            worldRoot.addChild(this.silhouetteShadow);
        }
        const shadowProjection = battlefieldCreatureShadowProjection(logicalPos.y, footprintHeight, gs, props.name);
        const shadowTuning = resolveBattlefieldShadowTuning(props.name);
        if (this.silhouetteShadow.texture !== shadowSourceTexture) this.silhouetteShadow.texture = shadowSourceTexture;
        if (
            this.silhouetteShadow.anchor.x !== shadowReferenceAnchorX ||
            this.silhouetteShadow.anchor.y !== shadowReferenceAnchorY
        ) {
            this.silhouetteShadow.anchor.set(shadowReferenceAnchorX, shadowReferenceAnchorY);
        }
        const shadowRowProgress = battlefieldCreatureRowProgress(logicalPos.y, footprintHeight, gs);
        const interpolateShadowValue = (bottom: number, top: number): number =>
            bottom + (top - bottom) * shadowRowProgress;
        // The editor authors the furthest upper-row shadow against the creature's minimum perspective size.
        // Perspective is divided out so only the shadow's far edge moves: its foot anchor stays fixed while
        // the length decreases linearly to 90% at the nearest lower row.
        // Keep Peasant's crack repair on the upright figure only. On its vertically flattened projection,
        // the bridge shader joins unrelated rows and makes the shadow read denser than every neighbouring
        // creature even though they share the same authored alpha.
        const desiredShadowFilters =
            runtimeAlphaHoleFillFilter && props.name !== PEASANT_UNIT_NAME ? [runtimeAlphaHoleFillFilter] : [];
        const installedShadowFilters = this.silhouetteShadow.filters ?? [];
        if (
            desiredShadowFilters.length !== installedShadowFilters.length ||
            desiredShadowFilters.some((filter, index) => filter !== installedShadowFilters[index])
        ) {
            this.silhouetteShadow.filters = desiredShadowFilters.length ? desiredShadowFilters : null;
        }
        const segmentLengthMultipliers = Array.from({ length: BATTLEFIELD_SHADOW_SEGMENT_COUNT }, (_, index) =>
            interpolateShadowValue(
                shadowTuning.bottom.segmentLengthMultipliers[index] ?? 1,
                shadowTuning.top.segmentLengthMultipliers[index] ?? 1,
            ),
        );
        this.silhouetteShadowSegmented = segmentLengthMultipliers.some(
            (multiplier) => Math.abs(multiplier - 1) > 0.001,
        );
        if (this.silhouetteShadowSegmented && this.silhouetteShadowSegments.length === 0) {
            this.silhouetteShadowSegments = battlefieldShadowSegmentTextures(shadowSourceTexture).map(
                (texture, index) => {
                    const segment = new Sprite(texture);
                    // Anchors outside 0..1 place all four cropped sprites around the same original centre.
                    segment.anchor.set(
                        BATTLEFIELD_SHADOW_SEGMENT_COUNT * shadowReferenceAnchorX - index,
                        shadowReferenceAnchorY,
                    );
                    segment.tint = 0x000000;
                    segment.blendMode = "multiply";
                    segment.roundPixels = false;
                    segment.zIndex = 4000 - pos.y - 0.75;
                    worldRoot.addChild(segment);
                    return segment;
                },
            );
        }
        // Match the visible pose's scale, including differently sized walk/action canvases. Reflect
        // around the same authored foot anchor; row tuning still owns the floor projection.
        const silhouetteScaleX = this.sprite.scale.x * shadowProjection.widthScale;
        const silhouetteScaleY =
            (Math.abs(this.sprite.scale.y) / Math.max(0.01, battlefieldPerspectiveScale)) *
            shadowProjection.lengthScale;
        if (props.name === WOLF_UNIT_NAME) {
            this.wolfShadowProjectionScaleX = shadowProjection.widthScale;
            this.wolfShadowProjectionScaleY =
                shadowProjection.lengthScale / Math.max(0.01, battlefieldPerspectiveScale);
        }
        if (this.silhouetteShadow.scale.x !== silhouetteScaleX || this.silhouetteShadow.scale.y !== silhouetteScaleY) {
            this.silhouetteShadow.scale.set(silhouetteScaleX, silhouetteScaleY);
        }
        const silhouetteX =
            spriteX +
            gs.getCellSize() *
                interpolateShadowValue(shadowTuning.bottom.offsetXCells, shadowTuning.top.offsetXCells) *
                battlefieldPerspectiveScale *
                this.facingDirection;
        const silhouetteY =
            spriteY +
            gs.getCellSize() *
                interpolateShadowValue(shadowTuning.bottom.offsetYCells, shadowTuning.top.offsetYCells) *
                battlefieldPerspectiveScale;
        if (this.silhouetteShadow.x !== silhouetteX || this.silhouetteShadow.y !== silhouetteY) {
            this.silhouetteShadow.position.set(silhouetteX, silhouetteY);
        }
        const silhouetteRotation =
            ((interpolateShadowValue(shadowTuning.bottom.rotationDegrees, shadowTuning.top.rotationDegrees) * Math.PI) /
                180) *
            this.facingDirection;
        if (this.silhouetteShadow.rotation !== silhouetteRotation) {
            this.silhouetteShadow.rotation = silhouetteRotation;
        }
        const silhouetteVisible = spriteVisible && this.visualMode === "normal" && this.useBattlefieldVisualProjection;
        const wholeSilhouetteVisible = silhouetteVisible && !this.silhouetteShadowSegmented;
        if (this.silhouetteShadow.visible !== wholeSilhouetteVisible) {
            this.silhouetteShadow.visible = wholeSilhouetteVisible;
        }
        // Profile alpha is the final authored opacity for every creature. Flying units used to receive
        // another hidden 0.8 multiplier here, so an editor value of 0.45 rendered as 0.36 in battle and
        // could never match the editor one-for-one.
        const battleMageDeathAlpha = this.battleMageLabDeathShadowAlpha();
        const silhouetteAlpha = shadowProjection.alpha * (isHidden ? 0.55 : 1) * battleMageDeathAlpha;
        if (this.silhouetteShadow.alpha !== silhouetteAlpha) this.silhouetteShadow.alpha = silhouetteAlpha;

        if (this.silhouetteShadowSegments.length > 0) {
            const textures = battlefieldShadowSegmentTextures(shadowSourceTexture);
            for (let index = 0; index < this.silhouetteShadowSegments.length; index++) {
                const segment = this.silhouetteShadowSegments[index];
                if (segment.parent !== worldRoot) worldRoot.addChild(segment);
                if (segment.texture !== textures[index]) segment.texture = textures[index];
                const anchorX = BATTLEFIELD_SHADOW_SEGMENT_COUNT * shadowReferenceAnchorX - index;
                if (segment.anchor.x !== anchorX || segment.anchor.y !== shadowReferenceAnchorY) {
                    segment.anchor.set(anchorX, shadowReferenceAnchorY);
                }
                const installedSegmentFilters = segment.filters ?? [];
                if (
                    desiredShadowFilters.length !== installedSegmentFilters.length ||
                    desiredShadowFilters.some((filter, filterIndex) => filter !== installedSegmentFilters[filterIndex])
                ) {
                    segment.filters = desiredShadowFilters.length ? desiredShadowFilters : null;
                }
                const segmentScaleY = silhouetteScaleY * (segmentLengthMultipliers[index] ?? 1);
                if (segment.scale.x !== silhouetteScaleX || segment.scale.y !== segmentScaleY) {
                    segment.scale.set(silhouetteScaleX, segmentScaleY);
                }
                if (segment.x !== silhouetteX || segment.y !== silhouetteY)
                    segment.position.set(silhouetteX, silhouetteY);
                if (segment.rotation !== silhouetteRotation) segment.rotation = silhouetteRotation;
                if (segment.alpha !== silhouetteAlpha) segment.alpha = silhouetteAlpha;
                const segmentVisible = silhouetteVisible && this.silhouetteShadowSegmented;
                if (segment.visible !== segmentVisible) segment.visible = segmentVisible;
            }
        }

        if (props.name === WOLF_UNIT_NAME) this.syncWolfAttackReach();

        const silhouetteBounds = (
            this.silhouetteShadowSegmented ? this.silhouetteShadowSegments : [this.silhouetteShadow]
        ).reduce(
            (combined, displayObject) => {
                const bounds = displayObject.getBounds();
                return {
                    left: Math.min(combined.left, bounds.x),
                    top: Math.min(combined.top, bounds.y),
                    right: Math.max(combined.right, bounds.x + bounds.width),
                    bottom: Math.max(combined.bottom, bounds.y + bounds.height),
                };
            },
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        publishBattlefieldShadowVisualBounds(props.name, {
            bounds: {
                x: silhouetteBounds.left,
                y: silhouetteBounds.top,
                width: silhouetteBounds.right - silhouetteBounds.left,
                height: silhouetteBounds.bottom - silhouetteBounds.top,
            },
            cellWidth: gs.getCellSize() * inheritedScale.x,
            cellHeight: gs.getCellSize() * inheritedScale.y,
        });

        // The second, independently blurred cast-shadow copy remains retired. One transparent flattened
        // silhouette plus the compact contact patch is cheaper and closer to Heroes IV's readable style.
        if (this.groundCastShadow) {
            this.groundCastShadow.destroy();
            this.groundCastShadow = undefined;
        }
        this.silhouetteShadowBlurFilter = undefined;

        if (!this.shadow) {
            this.shadow = new Graphics();
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            this.shadow.zIndex = 4000 - pos.y - 0.5; // Slightly below sprite
            worldRoot.addChild(this.shadow);
        } else {
            if (!this.shadow.parent || this.shadow.parent !== worldRoot) {
                worldRoot.addChild(this.shadow);
            }
        }
        // A restrained contact patch hides harmless transparent padding in authored frames and plants the
        // creature without trying to draw a separate connector for every boot, hoof or claw.
        const modelWidth = currentWidth * Math.abs(authoredDirectedScaleX);
        // The patch grows with the body it plants: the two authored sizes (0.88 / 1.55 cells across,
        // 0.09 / 0.13 cells deep) are the one- and two-cell ends of one straight line, so each further
        // footprint cell simply adds another interval on that axis.
        const contactPatchWidth = gs.getCellSize() * (0.88 + (footprintWidth - 1) * 0.67);
        const contactWidth =
            Math.max(gs.getCellSize() * 0.28, Math.min(modelWidth * 0.52, contactPatchWidth * 0.72)) *
            screenSizeCompensation.x;
        const contactHeight =
            gs.getCellSize() *
            (0.09 + (footprintHeight - 1) * 0.04) *
            (this.canFly() ? 0.78 : 1) *
            screenSizeCompensation.y;
        if (this.shadowDrawWidth !== contactWidth || this.shadowDrawHeight !== contactHeight) {
            this.shadow
                .clear()
                .ellipse(0, 0, contactWidth / 2, contactHeight / 2)
                .fill({ color: 0x000000 });
            this.shadowDrawWidth = contactWidth;
            this.shadowDrawHeight = contactHeight;
        }
        const shadowX = spriteX;
        const shadowY = spriteY - gs.getCellSize() * (this.canFly() ? 0.015 : 0.005);
        if (this.shadow.x !== shadowX || this.shadow.y !== shadowY) {
            this.shadow.position.set(shadowX, shadowY);
        }
        const shadowVisible =
            spriteVisible &&
            this.visualMode === "normal" &&
            (!this.useBattlefieldVisualProjection || shadowTuning.contactShadowVisible);
        if (this.shadow.visible !== shadowVisible) this.shadow.visible = shadowVisible;
        const normalShadowAlpha = this.useBattlefieldVisualProjection
            ? isHidden
                ? shadowTuning.contactAlpha * 0.5
                : this.canFly()
                  ? shadowTuning.contactAlpha * 0.75
                  : shadowTuning.contactAlpha
            : isHidden
              ? 0.16
              : this.canFly()
                ? 0.3
                : 0.45;
        const shadowAlpha = (this.visualMode === "ghost" ? 0.1 : normalShadowAlpha) * battleMageDeathAlpha;
        if (this.shadow.alpha !== shadowAlpha) this.shadow.alpha = shadowAlpha;
        // --- bullet-time dodge (missed attack): offsets sprite+shadow, leans, trails ghosts ---
        this.stepDodgeAnimation(worldRoot, now);
        // --- revealed-roster card (plate + name), drawn under the sprite ---
        this.ensureRosterCard(worldRoot, gs, logicalPos);
        // --- badge ---
        this.ensureBadge(worldRoot, gs, props, pos, inheritedScale, now);
        // --- stack power indicator ---
        this.ensureStackPowerIndicator(worldRoot, gs, props, pos);
        // --- turn status indicators: grouped immediately left of the amount flag ---
        this.ensureFlagStatusIndicators(now);
        if (battleMageDeathAlpha === 0) {
            if (this.badgeContainer) this.badgeContainer.visible = false;
            if (this.stackPowerContainer) this.stackPowerContainer.visible = false;
        }
        return scaleY;
    }
    public setSpriteRotation(rotation: number) {
        if (this.sprite) {
            this.sprite.rotation = rotation;
            this.depthSortBoundsAreCurrent = false;
        }
    }
    /**
     * Drop a fading "afterimage" copy of the current sprite at its present transform — a frozen ghost
     * the caller then fades out. Spawned repeatedly along a fast charge (Rapid Charge) it reads as a
     * motion-blur streak trailing the unit. Returns the ghost so the caller can manage its lifetime,
     * or undefined when there is no sprite/texture yet.
     */
    public createAfterimageSprite(worldRoot: Container): Sprite | undefined {
        const src = this.sprite;
        if (!src || !src.texture) return undefined;
        // Add the ghost into the SAME container as the live sprite (its parent) so it shares the unit
        // layer's coordinate space and z-sorting; fall back to the passed root only if unparented.
        const parent = src.parent ?? worldRoot;
        const ghost = new Sprite(src.texture);
        // Preserve the bottom anchor of tall full-body models; centring their afterimage would make it
        // jump half a tile during dodge/charge trails.
        ghost.anchor.copyFrom(src.anchor);
        ghost.x = src.x;
        ghost.y = src.y;
        ghost.scale.set(src.scale.x, src.scale.y);
        ghost.rotation = src.rotation;
        ghost.tint = src.tint;
        ghost.alpha = 0.45;
        // Just under the live sprite so the unit stays crisp on top of its blurred trail.
        ghost.zIndex = src.zIndex - 1;
        parent.addChild(ghost);
        return ghost;
    }
    /** A fixed battle pose for destination ghosts, independent of the live idle/action frame. */
    public getStaticBattlefieldPreviewAt(position: HoCMath.XY, gs: GridSettings): BattlefieldUnitPreview | undefined {
        const src = this.sprite;
        const texture = this.selectionAnimFrames?.[0] ?? this.resolveBaseTexture();
        if (!src?.parent || !texture) return undefined;
        const props = this.getUnitProperties();
        const width = this.getFootprintWidth();
        const height = this.getFootprintHeight();
        const tall = usesTallBoardModel(props, this.smallTextureName, this.idleAnimationStateAvailable);
        const refreshed = usesRefreshedFullBodyScale(props, this.idleAnimationStateAvailable);
        const profile = refreshedBoardVisualProfileForUnit(props.name);
        const framing = resolveStoredBattlefieldCreatureFraming(props.name);
        const creatureScale = battlefieldCreatureScaleMultiplier(props.name, width, height);
        const perspective = this.useBattlefieldVisualProjection
            ? battlefieldCreaturePerspectiveScale(position.y, height, gs)
            : 1;
        const inherited = inheritedAbsoluteScale(src.parent);
        const compensation = legacyBoardChildScaleCompensation(inherited.x, inherited.y);
        const thief = props.name === THIEF_UNIT_NAME || props.name === SCAVENGER_UNIT_NAME;
        const footprint = Math.min(width, height);
        const chipSide = footprint * BATTLEFIELD_CHIP_CELL_PIXELS * this.visualScaleMultiplier * creatureScale;
        const heightCells =
            (refreshed
                ? profile.heightCells
                : props.name === SCAVENGER_UNIT_NAME
                  ? SCAVENGER_BOARD_MODEL_HEIGHT_CELLS
                  : 1.5) * creatureScale;
        const scaleY = tall
            ? (gs.getCellSize() * heightCells) /
              (Math.max(1, texture.height) * (thief ? THIEF_IDLE_VISIBLE_HEIGHT_RATIO : 1))
            : chipSide / Math.max(1, texture.height);
        const widthCells =
            props.name === SCAVENGER_UNIT_NAME
                ? SCAVENGER_BOARD_MODEL_HEIGHT_CELLS / 1.5
                : props.name === THIEF_UNIT_NAME
                  ? 1
                  : 1.1;
        const scaleX = tall
            ? refreshed || props.name === ORC_UNIT_NAME || props.name === SCAVENGER_UNIT_NAME
                ? scaleY * (refreshed ? profile.widthScale : 1)
                : thief
                  ? (gs.getCellSize() * widthCells * footprint) /
                    (Math.max(1, texture.width) * THIEF_IDLE_VISIBLE_WIDTH_RATIO)
                  : Math.min(scaleY, (gs.getCellSize() * widthCells * footprint) / Math.max(1, texture.width))
            : chipSide / Math.max(1, texture.width);
        const ground = this.getBattlefieldGroundReference(
            position,
            gs,
            (this.previewDestinationGroundScratch ??= { x: 0, y: 0 }),
        );
        const preview = (this.battlefieldPreviewScratch ??= {} as BattlefieldUnitPreview);
        preview.texture = texture;
        preview.anchorX = 0.5;
        preview.anchorY = tall ? this.selectionAnimFootAnchorY : 0.5;
        preview.scaleX =
            scaleX *
            this.facingDirection *
            nativeBoardFacingMultiplier(props.name) *
            framing.scaleX *
            perspective *
            compensation.x;
        preview.scaleY = -scaleY * framing.scaleY * perspective * compensation.y;
        preview.x =
            ground.x +
            gs.getCellSize() *
                ((refreshed ? profile.offsetXCells : 0) + framing.offsetXCells) *
                this.facingDirection *
                perspective;
        preview.y =
            ground.y -
            gs.getCellSize() * framing.offsetYCells * perspective +
            (props.name === SCAVENGER_UNIT_NAME
                ? gs.getCellSize() *
                  heightCells *
                  framing.scaleY *
                  SCAVENGER_BATTLEFIELD_VERTICAL_LIFT_FRACTION *
                  perspective
                : 0);
        preview.rotation = 0;
        return preview;
    }
    /** Snapshot the live pose for target highlights; destination ghosts use the static pose above. */
    public getBattlefieldPreviewAt(position: HoCMath.XY, gs: GridSettings): BattlefieldUnitPreview | undefined {
        const src = this.sprite;
        if (!src || !src.texture) return undefined;

        const logicalPosition = this.getPosition();
        const currentGround = this.getBattlefieldGroundReference(
            logicalPosition,
            gs,
            (this.previewCurrentGroundScratch ??= { x: 0, y: 0 }),
        );
        const previewGround = this.getBattlefieldGroundReference(
            position,
            gs,
            (this.previewDestinationGroundScratch ??= { x: 0, y: 0 }),
        );
        const footprintHeight = this.getFootprintHeight();
        const currentPerspectiveScale = this.useBattlefieldVisualProjection
            ? battlefieldCreaturePerspectiveScale(logicalPosition.y, footprintHeight, gs)
            : 1;
        const previewPerspectiveScale = this.useBattlefieldVisualProjection
            ? battlefieldCreaturePerspectiveScale(position.y, footprintHeight, gs)
            : 1;
        const perspectiveRatio = previewPerspectiveScale / Math.max(0.001, currentPerspectiveScale);

        const preview = (this.battlefieldPreviewScratch ??= {} as BattlefieldUnitPreview);
        preview.texture = src.texture;
        preview.anchorX = src.anchor.x;
        preview.anchorY = src.anchor.y;
        preview.scaleX = src.scale.x * perspectiveRatio;
        preview.scaleY = src.scale.y * perspectiveRatio;
        preview.x = previewGround.x + (src.x - currentGround.x) * perspectiveRatio;
        preview.y = previewGround.y + (src.y - currentGround.y) * perspectiveRatio;
        preview.rotation = src.rotation;
        return preview;
    }
    /** Exact ground reference used by both the live sprite and every movement/attack preview. */
    private getBattlefieldGroundReference(logicalPosition: HoCMath.XY, gs: GridSettings, out?: HoCMath.XY): HoCMath.XY {
        const props = this.getUnitProperties();
        const footprintHeight = this.getFootprintHeight();
        const tallBoardModel = usesTallBoardModel(props, this.smallTextureName, this.idleAnimationStateAvailable);
        const visualProfile = refreshedBoardVisualProfileForUnit(props.name);
        if (!this.useBattlefieldVisualProjection) {
            const ground = out ?? { x: 0, y: 0 };
            ground.x = logicalPosition.x;
            ground.y = tallBoardModel
                ? tallBoardModelFootLineY(
                      logicalPosition.y,
                      gs.getCellSize(),
                      footprintHeight,
                      visualProfile.footInsetRatio,
                  )
                : logicalPosition.y;
            return ground;
        }

        // The foot line hangs below the footprint's centre by half the body's height, less the authored
        // inset above its lower seam — so a two-cell-tall body plants its feet in its LEFT cell instead
        // of floating in the right one, while a 2x1 stands exactly where a 1x1 does.
        const battlefieldYOffsetRatio = battlefieldFootLineOffsetCells(footprintHeight);
        // A one-cell-tall creature always uses the same projected foot line. Historical per-creature Y
        // nudges made feet float on several different baselines; keep those profiles only for taller art.
        const authoredBattlefieldOffsetY = footprintHeight > 1 ? (visualProfile.offsetYCells ?? 0) : 0;
        const ground = out ?? { x: 0, y: 0 };
        ground.x = logicalPosition.x;
        ground.y =
            logicalPosition.y -
            gs.getCellSize() * battlefieldYOffsetRatio +
            gs.getCellSize() * authoredBattlefieldOffsetY;
        return projectBattlefieldPoint(ground, gs, ground);
    }
    /**
     * Apply (or clear, when strength <= 0) a light gaussian blur on the live sprite so a fast-charging
     * unit looks like it's moving too fast to focus on. Reuses a single filter instance; clearing
     * removes it so the unit renders crisp again the moment the charge ends.
     */
    public setMotionBlur(strength: number): void {
        if (!this.sprite) return;
        if (strength <= 0) {
            if (this.motionBlurFilter) {
                const retiredFilter = this.motionBlurFilter;
                this.sprite.filters = (this.sprite.filters ?? []).filter((filter) => filter !== retiredFilter);
                this.motionBlurFilter = undefined;
                retiredFilter.destroy();
            }
            return;
        }
        if (!this.motionBlurFilter) {
            this.motionBlurFilter = new BlurFilter({ strength });
            this.sprite.filters = [...(this.sprite.filters ?? []), this.motionBlurFilter];
        } else {
            this.motionBlurFilter.strength = strength;
        }
    }
    public getCurrentVisualScale(): number {
        return this.sprite ? Math.abs(this.sprite.scale.x) : 1;
    }
    /**
     * Scale the whole unit visual (sprite + shadow + badge + indicators) uniformly around its
     * position. Used by the placement bench to render unplaced units bigger than one board cell.
     * Takes effect on the next ensureVisual/syncVisual pass.
     */
    public setVisualScaleMultiplier(multiplier: number): void {
        this.visualScaleMultiplier = multiplier > 0 ? multiplier : 1;
    }
    public setBattlefieldVisualProjection(enabled: boolean): void {
        // Crossing from the flat placement bench onto the battlefield is a new visual authoring context.
        // Drop any reference retained by an older build/state so the next ensureVisual captures the same
        // stable projected idle frame used by the editor. Repeated `true` calls while moving on the board
        // intentionally preserve the reference across animations.
        if (enabled && !this.useBattlefieldVisualProjection) {
            this.silhouetteShadowReferenceTexture = undefined;
            this.silhouetteShadowReferenceAnchorY = undefined;
        }
        this.useBattlefieldVisualProjection = enabled;
    }
    private setSilhouetteShadowVisibility(visible: boolean): void {
        if (this.silhouetteShadow) this.silhouetteShadow.visible = visible && !this.silhouetteShadowSegmented;
        for (const segment of this.silhouetteShadowSegments) {
            segment.visible = visible && this.silhouetteShadowSegmented;
        }
    }
    public setVisualVisible(visible: boolean): void {
        this.visualMode = visible ? "normal" : "hidden";
        if (this.sprite) this.sprite.visible = visible;
        if (this.shadow) this.shadow.visible = visible;
        this.setSilhouetteShadowVisibility(visible && this.useBattlefieldVisualProjection);
        if (this.groundCastShadow) this.groundCastShadow.visible = visible && this.useBattlefieldVisualProjection;
        // The roster card belongs to "revealed" mode, which this call always leaves.
        if (this.rosterCard) this.rosterCard.visible = false;
        if (this.badgeContainer) this.badgeContainer.visible = visible;
        if (this.stackPowerContainer) {
            this.stackPowerContainer.visible = visible;
        }
        if (this.hourglassContainer) {
            this.hourglassContainer.visible = visible && this.shouldShowHourglassIndicator();
        }
        if (this.stunContainer) {
            this.stunContainer.visible = visible && this.shouldShowStunIndicator();
        }
        if (this.respondContainer) {
            this.respondContainer.visible = visible && this.shouldShowRespondTag();
        }
    }
    public setVisualGhost(active: boolean): void {
        this.visualMode = active ? "ghost" : "normal";
        const visible = active || this.visualMode === "normal";
        const alpha = active ? 0.25 : 1;

        if (this.sprite) {
            this.sprite.visible = visible;
            this.sprite.alpha = alpha;
        }
        if (this.shadow) {
            this.shadow.visible = visible;
            this.shadow.alpha = active ? 0.1 : 0.35;
        }
        this.setSilhouetteShadowVisibility(!active && visible && this.useBattlefieldVisualProjection);
        if (this.groundCastShadow) {
            this.groundCastShadow.visible = !active && visible && this.useBattlefieldVisualProjection;
        }
        // Hide badges in ghost mode
        if (this.badgeContainer) this.badgeContainer.visible = !active && visible;
        if (this.stackPowerContainer) {
            this.stackPowerContainer.visible = !active && visible;
        }
        if (this.hourglassContainer) {
            this.hourglassContainer.visible = !active && visible && this.shouldShowHourglassIndicator();
        }
        if (this.stunContainer) {
            this.stunContainer.visible = !active && visible && this.shouldShowStunIndicator();
        }
        if (this.respondContainer) {
            this.respondContainer.visible = !active && visible && this.shouldShowRespondTag();
        }
    }
    /**
     * "Revealed opponent" mode (ranked placement): the sprite is drawn in black & white and
     * near-opaque — clearly present but clearly not the viewer's unit — and the team-colored flag
     * badge stays visible with a "?" count (the roster is known, the stack size is not). The actual
     * alpha/filter/badge application lives in ensureVisual/ensureBadge, which key off visualMode,
     * so the look survives every subsequent sync pass.
     */
    public setVisualRevealed(active: boolean): void {
        if (active) {
            this.visualMode = "revealed";
        } else if (this.visualMode === "revealed") {
            this.visualMode = "normal";
        }
    }
    public applyMoveEffect(spawnPulsePhase: number): void {
        const sprite = this.sprite;
        if (!sprite) return;
        this.depthSortBoundsAreCurrent = false;
        const walkAnim = this.walkAnim;
        const props = this.getUnitProperties();
        // Level-one creatures now use only their individually authored sprite frames. Do not layer the
        // legacy whole-cutout tilt/bounce over them, including units that do not yet have a refreshed atlas.
        if (!creatureGenericWholeSpriteMotionEnabledForLevel(props.level)) {
            sprite.rotation = 0;
            return;
        }
        // Every authored walk atlas already contains the complete footwork, weight transfer and body
        // motion. The legacy whole-sprite tilt/bounce hid those poses and made refreshed creatures look
        // as if a static cutout was merely rocking. Keep Orc/Wandering Mage/Scavenger exactly on their
        // established bespoke paths; this early return only affects the refreshed creature set.
        if (walkAnim && usesRefreshedFullBodyScale(props, true)) {
            sprite.rotation = 0;
            return;
        }
        // Scavenger's authored frames have always owned the complete body motion too.
        if (walkAnim && props.name === SCAVENGER_UNIT_NAME) {
            sprite.rotation = 0;
            return;
        }
        const isOrcWalk = !!walkAnim && props.name === ORC_UNIT_NAME;
        const useAuthoredWalkEffect = !!walkAnim && !isOrcWalk;
        const authoredWalkPhase =
            walkAnim && isOrcWalk
                ? walkAnim.frameIndex >= walkAnim.loopStartFrame && walkAnim.frameIndex <= walkAnim.loopEndFrame
                    ? ((walkAnim.frameIndex - walkAnim.loopStartFrame) /
                          Math.max(1, walkAnim.loopEndFrame - walkAnim.loopStartFrame + 1)) *
                      Math.PI *
                      2
                    : 0
                : useAuthoredWalkEffect && walkAnim
                  ? (walkAnim.frameIndex / Math.max(1, walkAnim.frames.length)) * Math.PI * 2
                  : undefined;
        const swaySpeed = 15;
        const wave = Math.sin(authoredWalkPhase ?? spawnPulsePhase * swaySpeed);
        // 1. Tilt/Sway (Rotation)
        const rotationAmplitude = useAuthoredWalkEffect ? 0.115 : 0.08;
        sprite.rotation = wave * rotationAmplitude;
        // 2. Lift/Bob (Scale)
        // We want a positive bounce for every step
        const bounce = Math.abs(wave);
        // syncVisual sets the base scale every frame before this is called
        const scaleX = sprite.scale.x;
        const scaleY = sprite.scale.y;
        const lift = 1.0 + bounce * (useAuthoredWalkEffect ? 0.085 : 0.05);
        sprite.scale.set(scaleX * lift, scaleY * lift);
    }
    /** Current live cutout geometry used by the scene's head-first overlap resolver. */
    public getCreatureDepthSortCandidate(stableOrder: number): CreatureDepthSortCandidate | undefined {
        const sprite = this.sprite;
        if (
            !this.useBattlefieldVisualProjection ||
            this.visualMode !== "normal" ||
            !sprite?.visible ||
            this.isPlayingForegroundAttackAnimation()
        ) {
            return undefined;
        }
        const bounds = this.oneShotAnim?.depthSortBounds ?? this.getCreatureBounds();
        if (!bounds) return undefined;
        if (bounds.width <= 0 || bounds.height <= 0) return undefined;
        const candidate = (this.depthSortCandidate ??= {
            id: String(this.getId()),
            baseDepth: sprite.zIndex,
            stableOrder,
            bounds: { left: 0, top: 0, right: 0, bottom: 0 },
            headZone: { left: 0, top: 0, right: 0, bottom: 0 },
        });
        candidate.baseDepth = sprite.zIndex;
        candidate.stableOrder = stableOrder;
        candidate.bounds.left = bounds.x;
        candidate.bounds.top = bounds.y;
        candidate.bounds.right = bounds.x + bounds.width;
        candidate.bounds.bottom = bounds.y + bounds.height;
        creatureHeadPriorityZone(candidate.bounds, this.facingDirection, candidate.headZone);
        return candidate;
    }
    /** Raise the live figure and its foreground indicators without lifting its ground shadow/aura. */
    public applyCreatureHeadPriorityDepth(depth: number): void {
        if (!this.sprite) return;
        this.sprite.zIndex = depth;
        if (this.badgeContainer) this.badgeContainer.zIndex = depth + 1;
        if (this.stackPowerContainer) this.stackPowerContainer.zIndex = depth + 1;
        if (this.hourglassContainer) this.hourglassContainer.zIndex = depth + 2;
        if (this.stunContainer) this.stunContainer.zIndex = depth + 2;
        // Response swords are a local badge child; their layer is controlled by child order, not world depth.
        if (this.respondContainer) this.respondContainer.zIndex = 0;
        if (this.freezeCrust) this.freezeCrust.zIndex = depth + 0.5;
        if (this.freezeLight) this.freezeLight.zIndex = depth + 0.55;
        if (this.waterShieldBreakGfx) this.waterShieldBreakGfx.zIndex = depth + 0.6;
        for (const ghost of this.dodgeAnim?.ghosts ?? []) ghost.sprite.zIndex = depth - 1;
    }
    public syncVisual(worldRoot: Container, gs: GridSettings, movementInProgress = false): void {
        if (this.isDestroyed) return;
        const logicalPos = this.getPosition();
        const inGrid = GridMath.isPositionWithinGrid(gs, logicalPos);
        if (!inGrid) {
            if (this.sprite) this.sprite.visible = false;
            if (this.shadow) this.shadow.visible = false;
            this.setSilhouetteShadowVisibility(false);
            if (this.groundCastShadow) this.groundCastShadow.visible = false;
            if (this.badgeContainer) this.badgeContainer.visible = false;
            if (this.stackPowerContainer) this.stackPowerContainer.visible = false;
            if (this.hourglassContainer) this.hourglassContainer.visible = false;
            if (this.stunContainer) this.stunContainer.visible = false;
            if (this.respondContainer) this.respondContainer.visible = false;
            if (this.activeAura) this.activeAura.visible = false;
            if (this.activeTurnFireSprite) this.activeTurnFireSprite.visible = false;
            if (this.whirlpoolAura) this.whirlpoolAura.visible = false;
            return;
        }
        // ensureVisual already projects this exact point for the sprite and badge. Reuse that result here
        // instead of running the hand-traced grid projection a second time for every unit on every frame.
        // The same timestamp also keeps every animated layer on this unit phase-locked without repeatedly
        // consulting the browser clock.
        const now = performance.now();
        this.ensureVisual(worldRoot, gs, now);
        const pos = this.useBattlefieldVisualProjection ? this.projectedPositionScratch! : logicalPos;

        // Update Z-Index for depth sorting
        if (this.sprite) {
            const baseZ = 4000 - pos.y;
            const figureZ = this.isPlayingForegroundAttackAnimation() ? CREATURE_ATTACK_FOREGROUND_Z_INDEX : baseZ;
            if (this.sprite.zIndex !== figureZ) this.sprite.zIndex = figureZ;
            if (this.shadow && this.shadow.zIndex !== baseZ - 0.5) this.shadow.zIndex = baseZ - 0.5;
            if (this.silhouetteShadow && this.silhouetteShadow.zIndex !== baseZ - 0.75) {
                this.silhouetteShadow.zIndex = baseZ - 0.75;
            }
            for (const segment of this.silhouetteShadowSegments) {
                if (segment.zIndex !== baseZ - 0.75) segment.zIndex = baseZ - 0.75;
            }
            if (this.groundCastShadow && this.groundCastShadow.zIndex !== baseZ - 0.85) {
                this.groundCastShadow.zIndex = baseZ - 0.85;
            }
            if (this.badgeContainer && this.badgeContainer.zIndex !== figureZ + 1) {
                this.badgeContainer.zIndex = figureZ + 1;
            }
            if (this.stackPowerContainer && this.stackPowerContainer.zIndex !== figureZ + 1) {
                this.stackPowerContainer.zIndex = figureZ + 1;
            }
            if (this.hourglassContainer && this.hourglassContainer.zIndex !== figureZ + 2) {
                this.hourglassContainer.zIndex = figureZ + 2;
            }
            if (this.stunContainer && this.stunContainer.zIndex !== figureZ + 2) {
                this.stunContainer.zIndex = figureZ + 2;
            }
            if (this.respondContainer && this.respondContainer.zIndex !== 0) {
                this.respondContainer.zIndex = 0;
            }
        }

        // The ground ring follows the creature whose turn it is, alongside the pointer above its flag.
        const showActiveAura =
            this.isActiveTurn && this.visualMode === "normal" && !movementInProgress && !this.walkAnim;
        if (showActiveAura && !this.isDead()) {
            this.updateActiveAura(worldRoot, gs, pos, now);
        } else {
            if (this.activeAura) this.activeAura.visible = false;
            if (this.activeTurnFireSprite) this.activeTurnFireSprite.visible = false;
        }

        // Water Shield: a light-blue circulating ring while the once-per-battle absorb buff is up. It
        // disappears the frame the shield breaks, and is independent of whose turn it is.
        //
        // hasStatusBuff, NOT hasBuffActive: the latter reads only the buff OBJECT array, which a ranked
        // client fills solely from its own seeding pass (trySeedWaterShield, gated on the unit carrying the
        // Water Shield ABILITY). A shield the server granted for any other reason — most visibly one an
        // Arachna Queen assimilated off a Mermaid — is then present in the authoritative applied_buffs list
        // and completely invisible on the board. hasStatusBuff ORs both, so the ring follows the server.
        const waterShieldActive = !this.isDead() && this.hasStatusBuff("Water Shield");
        if (waterShieldActive) {
            this.updateWaterShieldAura(worldRoot, gs, pos, now);
        } else if (this.waterShieldAura) {
            this.waterShieldAura.visible = false;
        }

        // Whirlpool is a one-lap movement/turn lock. Keep its vortex visible for exactly as long as the
        // authoritative status is applied, rather than guessing from a cast event that may predate a ranked
        // reconnect. hasStatusEffect reads the live object in Sandbox and applied_debuffs in Ranked.
        if (!this.isDead() && this.hasStatusEffect("Whirlpool")) {
            this.updateWhirlpoolAura(worldRoot, gs, pos, now);
        } else if (this.whirlpoolAura) {
            this.whirlpoolAura.visible = false;
        }

        // Freeze (Blacksmith's "Freeze" status): an ice crust encasing the unit, over the icy tint.
        if (!this.isDead() && this.hasStatusEffect("Freeze")) {
            this.updateFreezeCrust(worldRoot, gs, pos, now);
        } else {
            if (this.freezeCrust) this.freezeCrust.visible = false;
            if (this.freezeLight) this.freezeLight.visible = false;
        }
        // The shield is permanent until it absorbs a hit, so a still-alive unit losing the buff means it
        // just broke — kick off the one-shot dissolve burst at that instant.
        if (this.waterShieldWasActive && !waterShieldActive && !this.isDead()) {
            this.waterShieldBreakStartMs = now;
        }
        this.waterShieldWasActive = waterShieldActive;
        if (this.waterShieldBreakStartMs !== undefined) {
            this.updateWaterShieldBreak(worldRoot, gs, pos, now);
        }
    }
    /** Ground-plane turn marker, aligned with the occupied cell seams and beneath the figure. */
    private updateActiveAura(worldRoot: Container, gs: GridSettings, _pos: HoCMath.XY, nowMs: number): void {
        if (!this.activeAura) {
            this.activeAura = new Container();
            this.activeAura.eventMode = "none";
        }
        if (this.activeAura.parent !== worldRoot) worldRoot.addChild(this.activeAura);
        updateActiveTurnGroundRing(
            this.activeAura,
            gs,
            this.getPosition(),
            this.getFootprintWidth(),
            this.getFootprintHeight(),
            this.useBattlefieldVisualProjection,
            this.texResolver(
                this.getFootprintWidth() === 2 && this.getFootprintHeight() === 1
                    ? "active_turn_ancient_runes_ring_oval_v1"
                    : "active_turn_ancient_runes_ring_v3",
            ),
            nowMs,
        );
        if (this.activeTurnFireSprite) this.activeTurnFireSprite.visible = false;
    }
    /** Lightweight transparent sprite-sheet glow for the unit whose turn is currently active. */
    private updateActiveTurnFire(worldRoot: Container, gs: GridSettings, pos: HoCMath.XY, nowMs: number): void {
        const frames = getActiveTurnFireFrames();
        if (!frames.length) return;

        if (!this.activeTurnFireSprite) {
            this.activeTurnFireSprite = new Sprite(frames[0]);
            this.activeTurnFireSprite.anchor.set(0.5);
            this.activeTurnFireSprite.blendMode = "add";
            this.activeTurnFireSprite.alpha = 0.34;
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            worldRoot.addChild(this.activeTurnFireSprite);
        } else if (this.activeTurnFireSprite.parent !== worldRoot) {
            worldRoot.addChild(this.activeTurnFireSprite);
        }

        const frameIndex = activeTurnFireFrameForElapsed(nowMs);
        if (frameIndex !== this.activeTurnFireFrameIndex) {
            this.activeTurnFireFrameIndex = frameIndex;
            this.activeTurnFireSprite.texture = frames[frameIndex];
        }

        const cell = gs.getCellSize();
        this.activeTurnFireSprite.position.set(pos.x, pos.y);
        this.activeTurnFireSprite.width = cell * footprintEffectExtent(1.55, 2.8, this.getFootprintWidth());
        this.activeTurnFireSprite.height = cell * footprintEffectExtent(1.55, 2.8, this.getFootprintHeight());
        this.activeTurnFireSprite.zIndex = 4000 - pos.y - 0.7;
        this.activeTurnFireSprite.visible = true;
    }
    /**
     * Water Shield aura: a light-blue ring with small dots circulating around the unit, emphasizing that its
     * once-per-battle absorb shield is up. Pure vector draw (no texture), redrawn each frame from a time-based
     * phase. Drawn beneath the sprite like the active-turn aura; shown while the "Water Shield" buff is active
     * and hidden the moment it breaks.
     */
    private updateWaterShieldAura(worldRoot: Container, gs: GridSettings, pos: HoCMath.XY, nowMs: number): void {
        if (!this.waterShieldAura) {
            this.waterShieldAura = new Graphics();
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            worldRoot.addChild(this.waterShieldAura);
        } else if (this.waterShieldAura.parent !== worldRoot) {
            worldRoot.addChild(this.waterShieldAura);
        }
        // Sit just beneath the unit so the ring reads as circling around her feet.
        this.waterShieldAura.zIndex = 4000 - pos.y - 0.55;
        this.waterShieldAura.visible = true;

        const cell = gs.getCellSize();
        const footprintWidth = this.getFootprintWidth();
        const footprintHeight = this.getFootprintHeight();
        const drawState = (this.waterShieldAuraDrawState ??= newContinuousEffectDrawState());
        if (!shouldRedrawContinuousEffect(drawState, nowMs, pos, cell, footprintWidth, footprintHeight)) return;
        // One semi-axis per footprint side, so the ring circles the feet of a rectangular body too.
        const ringRadiusX = cell * footprintEffectExtent(0.52, 0.92, footprintWidth);
        const ringRadiusY = cell * footprintEffectExtent(0.52, 0.92, footprintHeight);
        const t = nowMs / 1000;
        const color = 0x66ccff; // light blue

        const g = this.waterShieldAura;
        g.clear();

        // Faint breathing halo.
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
        const haloGrowth = 1.02 + 0.04 * pulse;
        drawFootprintOval(g, pos.x, pos.y, ringRadiusX * haloGrowth, ringRadiusY * haloGrowth).fill({
            color,
            alpha: 0.06 + 0.05 * pulse,
        });

        // The shield ring itself.
        drawFootprintOval(g, pos.x, pos.y, ringRadiusX, ringRadiusY).stroke({ color, alpha: 0.55, width: 2 });

        // Small dots circulating clockwise around the ring.
        const dotCount = 8;
        for (let i = 0; i < dotCount; i++) {
            const a = (i / dotCount) * Math.PI * 2 + t * 1.4;
            const dotR = 2.2 + 1.3 * (0.5 + 0.5 * Math.sin(t * 3 + i));
            g.circle(pos.x + ringRadiusX * Math.cos(a), pos.y + ringRadiusY * Math.sin(a), dotR).fill({
                color,
                alpha: 0.85,
            });
        }
        // A few inner dots spinning the other way for a watery swirl.
        const innerCount = 4;
        for (let i = 0; i < innerCount; i++) {
            const a = (i / innerCount) * Math.PI * 2 - t * 1.0;
            g.circle(pos.x + ringRadiusX * 0.72 * Math.cos(a), pos.y + ringRadiusY * 0.72 * Math.sin(a), 1.6).fill({
                color,
                alpha: 0.6,
            });
        }
    }
    /**
     * Whirlpool status VFX: a dark water funnel with bright spiral currents and orbiting foam beneath the
     * trapped creature. Pure vector graphics keep it available in every client build without an atlas, and
     * the time-based redraw makes the water continuously churn until the authoritative debuff disappears.
     */
    private updateWhirlpoolAura(worldRoot: Container, gs: GridSettings, pos: HoCMath.XY, nowMs: number): void {
        if (!this.whirlpoolAura) {
            this.whirlpoolAura = new Graphics();
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            worldRoot.addChild(this.whirlpoolAura);
        } else if (this.whirlpoolAura.parent !== worldRoot) {
            worldRoot.addChild(this.whirlpoolAura);
        }
        // Layer the pool beneath the shadow/unit while leaving its bright outer water visible around the feet.
        this.whirlpoolAura.zIndex = 4000 - pos.y - 0.58;
        this.whirlpoolAura.visible = true;

        const cell = gs.getCellSize();
        const footprintWidth = this.getFootprintWidth();
        const footprintHeight = this.getFootprintHeight();
        const drawState = (this.whirlpoolAuraDrawState ??= newContinuousEffectDrawState());
        if (!shouldRedrawContinuousEffect(drawState, nowMs, pos, cell, footprintWidth, footprintHeight)) return;
        // The pool is already an ellipse (a circular funnel seen in perspective). Its horizontal extent now
        // follows the footprint's width and its depth the footprint's height, on top of that squash.
        const radiusX = cell * footprintEffectExtent(0.66, 1.12, footprintWidth);
        const radiusY = cell * footprintEffectExtent(0.66, 1.12, footprintHeight);
        const squash = 0.42;
        const time = nowMs / 1000;
        const pulse = 0.5 + 0.5 * Math.sin(time * 4.2);
        const g = this.whirlpoolAura;
        g.clear();

        // Deep centre + translucent water shelf: the dark eye makes the inward spiral read as a funnel.
        g.ellipse(pos.x, pos.y, radiusX, radiusY * squash).fill({ color: 0x063b5c, alpha: 0.28 + pulse * 0.06 });
        g.ellipse(pos.x, pos.y, radiusX * 0.32, radiusY * squash * 0.34).fill({
            color: 0x021b35,
            alpha: 0.72,
        });
        g.ellipse(pos.x, pos.y, radiusX * (0.95 + pulse * 0.03), radiusY * squash).stroke({
            color: 0x42d7ff,
            alpha: 0.46,
            width: Math.max(1.5, cell * 0.025),
        });

        // Four curved currents coil from the rim into the eye. Rotating the whole construction clockwise
        // sells the pull without rotating a container (which would turn the ground ellipse upright).
        const arms = 4;
        const points = 18;
        for (let arm = 0; arm < arms; arm++) {
            for (let point = 0; point < points; point++) {
                const progress = point / (points - 1);
                const coil = 0.94 - progress * 0.7;
                const angle = -time * 3.25 + (arm / arms) * Math.PI * 2 + progress * Math.PI * 1.7;
                const x = pos.x + Math.cos(angle) * radiusX * coil;
                const y = pos.y + Math.sin(angle) * radiusY * coil * squash;
                if (point === 0) g.moveTo(x, y);
                else g.lineTo(x, y);
            }
            g.stroke({
                color: arm % 2 === 0 ? 0x8cecff : 0x28bde9,
                alpha: 0.58,
                width: Math.max(1.5, cell * (arm % 2 === 0 ? 0.035 : 0.026)),
            });
        }

        // Foam and droplets race around the rim at different radii, breaking up the perfect geometry.
        for (let i = 0; i < 12; i++) {
            const angle = -time * (3.6 + (i % 3) * 0.25) + (i / 12) * Math.PI * 2;
            const orbit = 0.72 + (i % 4) * 0.07;
            const size = cell * (0.018 + (i % 3) * 0.008);
            g.circle(
                pos.x + Math.cos(angle) * radiusX * orbit,
                pos.y + Math.sin(angle) * radiusY * orbit * squash,
                size,
            ).fill({
                color: i % 3 === 0 ? 0xd9f8ff : 0x64dcff,
                alpha: 0.62 + (i % 2) * 0.2,
            });
        }
    }
    /** An ice crust encasing a "Freeze"-status unit: a frosted pane with soft buildup and branching veins. */
    private updateFreezeCrust(worldRoot: Container, gs: GridSettings, pos: HoCMath.XY, nowMs: number): void {
        if (!this.freezeCrust) {
            this.freezeCrust = new Graphics();
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            worldRoot.addChild(this.freezeCrust);
        } else if (this.freezeCrust.parent !== worldRoot) {
            worldRoot.addChild(this.freezeCrust);
        }
        // Sit just above the sprite so the frost reads as a shell over the unit (below the badge at +1).
        this.freezeCrust.zIndex = 4000 - pos.y + 0.5;
        this.freezeCrust.visible = true;

        const cell = gs.getCellSize();
        const footprintWidth = this.getFootprintWidth();
        const footprintHeight = this.getFootprintHeight();
        const drawState = (this.freezeCrustDrawState ??= newContinuousEffectDrawState());
        if (!shouldRedrawContinuousEffect(drawState, nowMs, pos, cell, footprintWidth, footprintHeight)) {
            if (this.freezeLight) {
                this.freezeLight.zIndex = 4000 - pos.y + 0.55;
                this.freezeLight.visible = true;
            }
            return;
        }
        // The pane covers the body, so its two half-extents follow the two footprint sides. Everything the
        // frost DECORATES with (stroke widths, glint and spark sizes) keeps one scalar taken from the
        // shorter side: those are thicknesses, not extents, and must not stretch with the pane.
        const halfWidth = cell * footprintEffectExtent(0.56, 1.02, footprintWidth);
        const halfHeight = cell * footprintEffectExtent(0.56, 1.02, footprintHeight);
        const half = Math.min(halfWidth, halfHeight);
        const t = nowMs / 1000;
        const shimmer = 0.5 + 0.5 * Math.sin(t * 1.6);
        const ice = 0xbfe8ff;
        const iceBright = 0xeaf7ff;
        const g = this.freezeCrust;
        g.clear();

        // A softly rounded frozen pane, with a second diffuse rim that gives the shell some thickness.
        const corner = half * 0.18;
        g.roundRect(pos.x - halfWidth, pos.y - halfHeight, halfWidth * 2, halfHeight * 2, corner)
            .fill({ color: ice, alpha: 0.08 + 0.035 * shimmer })
            .stroke({ color: iceBright, alpha: 0.44 + 0.08 * shimmer, width: 1.4 });
        const rimInset = half * 0.045;
        g.roundRect(
            pos.x - halfWidth + rimInset,
            pos.y - halfHeight + rimInset,
            (halfWidth - rimInset) * 2,
            (halfHeight - rimInset) * 2,
            corner * 0.82,
        ).stroke({ color: ice, alpha: 0.2 + 0.05 * shimmer, width: half * 0.055 });

        // Frost collects in short, bowed deposits along the edge. Rounded strokes avoid both the old sharp
        // wedges and a ring of circular blobs; only their shared translucency shimmers.
        for (let i = 0; i < FREEZE_FROST_PATCHES.length; i++) {
            const [nx, ny, normalizedRadius] = FREEZE_FROST_PATCHES[i];
            const len = Math.hypot(nx, ny) || 1;
            const outwardX = nx / len;
            const outwardY = ny / len;
            const perpendicularX = -outwardY;
            const perpendicularY = outwardX;
            const side = (((i * 5) % 7) - 3) / 3;
            const radius = half * normalizedRadius;
            const baseX = pos.x + nx * halfWidth;
            const baseY = pos.y + ny * halfHeight;
            const startX = baseX - perpendicularX * radius * (0.9 + Math.abs(side) * 0.15);
            const startY = baseY - perpendicularY * radius * (0.9 + Math.abs(side) * 0.15);
            const endX = baseX + perpendicularX * radius * (0.78 - side * 0.08);
            const endY = baseY + perpendicularY * radius * (0.78 - side * 0.08);
            g.moveTo(startX, startY).quadraticCurveTo(
                baseX - outwardX * radius * (0.38 + Math.abs(side) * 0.08),
                baseY - outwardY * radius * (0.38 + Math.abs(side) * 0.08),
                endX,
                endY,
            );
        }
        g.stroke({
            color: ice,
            alpha: 0.22 + 0.06 * shimmer,
            width: half * 0.065,
            cap: "round",
            join: "round",
        });

        // Fine, bent frost veins grow inward from selected deposits. Small side branches break up the radial
        // pattern without producing filled wedges or sharp triangular silhouettes.
        for (let i = 0; i < FREEZE_FROST_PATCHES.length; i += 2) {
            const [nx, ny] = FREEZE_FROST_PATCHES[i];
            const len = Math.hypot(nx, ny) || 1;
            const outwardX = nx / len;
            const outwardY = ny / len;
            const perpendicularX = -outwardY;
            const perpendicularY = outwardX;
            const startX = pos.x + nx * halfWidth;
            const startY = pos.y + ny * halfHeight;
            const depth = half * (0.2 + (i % 3) * 0.035);
            const bend = half * ((((i * 5) % 7) - 3) * 0.018);
            const midX = startX - outwardX * depth * 0.55 + perpendicularX * bend;
            const midY = startY - outwardY * depth * 0.55 + perpendicularY * bend;
            const tipX = startX - outwardX * depth - perpendicularX * bend * 0.6;
            const tipY = startY - outwardY * depth - perpendicularY * bend * 0.6;
            const branchSide = i % 4 === 0 ? 1 : -1;
            g.moveTo(startX, startY).lineTo(midX, midY).lineTo(tipX, tipY);
            g.moveTo(midX, midY).lineTo(
                midX - outwardX * half * 0.07 + perpendicularX * half * 0.09 * branchSide,
                midY - outwardY * half * 0.07 + perpendicularY * half * 0.09 * branchSide,
            );
        }
        g.stroke({ color: iceBright, alpha: 0.3 + 0.1 * shimmer, width: 1, cap: "round", join: "round" });

        // Three restrained highlights pulse in place instead of orbiting around the unit.
        for (let i = 0; i < 3; i++) {
            const [nx, ny] = FREEZE_FROST_PATCHES[i * 4 + 1];
            const glintX = pos.x + nx * halfWidth * 0.82;
            const glintY = pos.y + ny * halfHeight * 0.82;
            const twinkle = 0.5 + 0.5 * Math.sin(t * 3.2 + i * 2.3);
            const glintRadius = half * (0.018 + 0.008 * twinkle);
            g.moveTo(glintX - glintRadius, glintY).lineTo(glintX + glintRadius, glintY);
            g.moveTo(glintX, glintY - glintRadius).lineTo(glintX, glintY + glintRadius);
            g.stroke({ color: iceBright, alpha: 0.35 + 0.4 * twinkle, width: 1, cap: "round" });
        }

        // --- play of light INSIDE the ice ---
        // A separate additive layer so these read as luminous refractions rather than paint: a slow sheen
        // rakes across the frozen pane while a handful of caustic sparks drift and breathe deep in the shell.
        if (!this.freezeLight) {
            this.freezeLight = new Graphics();
            this.freezeLight.blendMode = "add";
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            worldRoot.addChild(this.freezeLight);
        } else if (this.freezeLight.parent !== worldRoot) {
            worldRoot.addChild(this.freezeLight);
        }
        // Just above the crust (+0.5), still below the badge (+1).
        this.freezeLight.zIndex = 4000 - pos.y + 0.55;
        this.freezeLight.visible = true;
        const gl = this.freezeLight;
        gl.clear();

        // Caustic sparks: soft points of light, each wandering an independent slow path and breathing on its
        // own cycle. Held well inside the pane (±0.46·half) so they read as refractions within the ice.
        for (let i = 0; i < 4; i++) {
            const cx = pos.x + Math.sin(t * (0.55 + i * 0.17) + i * 1.7) * halfWidth * 0.46;
            const cy = pos.y + Math.cos(t * (0.63 + i * 0.13) + i * 2.6) * halfHeight * 0.46;
            const breathe = 0.5 + 0.5 * Math.sin(t * (1.1 + i * 0.4) + i * 1.3);
            const r = half * (0.05 + 0.035 * breathe);
            gl.circle(cx, cy, r).fill({ color: ice, alpha: 0.05 + 0.06 * breathe });
            gl.circle(cx, cy, r * 0.45).fill({ color: 0xffffff, alpha: 0.05 + 0.11 * breathe });
        }

        // A glancing sheen rakes across the pane on a loop — brightest mid-pass, fading to nothing at the
        // ends (which also hides the instant its tips would cross the rounded corners). The bar lies along
        // the main diagonal and travels perpendicular to its own length.
        const sweepPhase = (t % 4.6) / 4.6;
        const sweepPos = -1 + 2 * sweepPhase;
        const sweepFade = Math.sin(sweepPhase * Math.PI);
        const sweepCx = pos.x + sweepPos * halfWidth * 0.72;
        const sweepCy = pos.y - sweepPos * halfHeight * 0.72;
        const sweepArm = half * 0.44;
        gl.moveTo(sweepCx - sweepArm, sweepCy - sweepArm)
            .lineTo(sweepCx + sweepArm, sweepCy + sweepArm)
            .stroke({ color: ice, alpha: 0.2 * sweepFade, width: half * 0.06, cap: "round" });
        gl.moveTo(sweepCx - sweepArm * 0.82, sweepCy - sweepArm * 0.82)
            .lineTo(sweepCx + sweepArm * 0.82, sweepCy + sweepArm * 0.82)
            .stroke({ color: 0xffffff, alpha: 0.26 * sweepFade, width: 1.4, cap: "round" });
    }
    /**
     * One-shot "dissolve" burst played when the Water Shield absorbs a hit and breaks: a brief inner splash,
     * the ring snapping outward and thinning as it fades, and a spray of light-blue droplets flung away from
     * it. Pure vector draw driven by a time-based progress; self-clears after ~0.55s.
     */
    private updateWaterShieldBreak(worldRoot: Container, gs: GridSettings, pos: HoCMath.XY, nowMs: number): void {
        if (this.waterShieldBreakStartMs === undefined) return;
        const DURATION_MS = 550;
        const elapsed = nowMs - this.waterShieldBreakStartMs;
        if (elapsed >= DURATION_MS || this.isDead()) {
            if (this.waterShieldBreakGfx) this.waterShieldBreakGfx.visible = false;
            this.waterShieldBreakStartMs = undefined;
            return;
        }
        if (!this.waterShieldBreakGfx) {
            this.waterShieldBreakGfx = new Graphics();
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            worldRoot.addChild(this.waterShieldBreakGfx);
        } else if (this.waterShieldBreakGfx.parent !== worldRoot) {
            worldRoot.addChild(this.waterShieldBreakGfx);
        }
        // Draw just above the unit so the shatter reads over her for the brief moment it lasts.
        this.waterShieldBreakGfx.zIndex = 4000 - pos.y + 0.6;
        this.waterShieldBreakGfx.visible = true;

        const cell = gs.getCellSize();
        // The burst snaps outward from the same ring the shield drew, so it reads as that ring breaking.
        const ringRadiusX = cell * footprintEffectExtent(0.52, 0.92, this.getFootprintWidth());
        const ringRadiusY = cell * footprintEffectExtent(0.52, 0.92, this.getFootprintHeight());
        const p = elapsed / DURATION_MS; // 0 -> 1
        const ease = 1 - (1 - p) * (1 - p); // easeOutQuad
        const fade = 1 - p;
        const color = 0x66ccff; // light blue

        const g = this.waterShieldBreakGfx;
        g.clear();

        // Brief inner splash flash at the very start.
        if (p < 0.35) {
            const fp = 1 - p / 0.35;
            const splash = 0.5 + 0.6 * p;
            drawFootprintOval(g, pos.x, pos.y, ringRadiusX * splash, ringRadiusY * splash).fill({
                color: 0xbfe8ff,
                alpha: 0.3 * fp,
            });
        }

        // The ring snapping outward and thinning as it fades.
        const snap = 1 + 1.25 * ease;
        drawFootprintOval(g, pos.x, pos.y, ringRadiusX * snap, ringRadiusY * snap).stroke({
            color,
            alpha: 0.75 * fade,
            width: Math.max(0.5, 3 * fade),
        });

        // A spray of droplets flung outward from the ring, shrinking as they go.
        const dropletCount = 16;
        for (let i = 0; i < dropletCount; i++) {
            const a = (i / dropletCount) * Math.PI * 2 + (i % 3) * 0.5;
            const flight = 1 + (1.5 + 0.15 * (i % 4)) * ease;
            const dropR = Math.max(0.4, (2.6 - (i % 3) * 0.5) * fade);
            g.circle(
                pos.x + Math.cos(a) * ringRadiusX * flight,
                pos.y + Math.sin(a) * ringRadiusY * flight,
                dropR,
            ).fill({
                color,
                alpha: 0.9 * fade,
            });
        }
    }
    private arbalesterLabScaleMultiplier(stateName = "idle"): number {
        if (
            this.arbalesterLabIdleEnabled &&
            this.getName() === ARBALESTER_UNIT_NAME &&
            isArbalesterAttack(stateName) &&
            animationAtlases.Arbalester?.[stateName]?.frameHeight === 512
        ) {
            return (ARBALESTER_LAB_RENDER_SCALE * 512) / 384;
        }
        return this.arbalesterLabIdleEnabled &&
            this.getName() === ARBALESTER_UNIT_NAME &&
            ["idle", "hit", "death"].includes(stateName) &&
            (stateName !== "idle" || !!this.arbalesterIdlePager) &&
            animationAtlases.Arbalester?.[stateName]?.frameHeight === 384
            ? ARBALESTER_LAB_RENDER_SCALE
            : 1;
    }
    private arbalesterLabFootAnchorY(stateName: string, meta: AtlasMeta): number {
        if (
            this.arbalesterLabIdleEnabled &&
            this.getName() === ARBALESTER_UNIT_NAME &&
            isArbalesterAttack(stateName) &&
            meta.frameHeight === 512
        ) {
            return (ARBALESTER_LAB_FOOT_ANCHOR_Y * 384 + 64) / 512;
        }
        return this.arbalesterLabScaleMultiplier(stateName) === ARBALESTER_LAB_RENDER_SCALE
            ? ARBALESTER_LAB_FOOT_ANCHOR_Y
            : tallBoardModelFootAnchorY(this.getName(), stateName, meta);
    }
    /** The lab can preview other creatures; the approved base package remains active in combat. */
    public setCreatureAnimationLabPreviewEnabled(enabled: boolean): void {
        enabled = enabled || usesApprovedBaseAnimations(this.getName());
        if (!enabled) this.cancelArbalesterRangedShot();
        if (!enabled) this.cancelDryadRangedShot();
        const previousBerserkerIdleScale = this.berserkerLabIdleScale();
        if (this.getName() === "Berserker" && this.creatureAnimationLabPreviewEnabled !== enabled) {
            this.stopBoardWalkAnimation();
        }
        const labChanged = this.creatureAnimationLabPreviewEnabled !== enabled;
        if (labChanged && this.getName() === "Pikeman") this.stopBoardWalkAnimation();
        if (labChanged && this.getName() === "Valkyrie") this.stopBoardWalkAnimation();
        if (labChanged && this.getName() === "Valkyrie") this.returnToIdleAnimation();
        if (labChanged && this.getName() === "Manticore") this.stopBoardWalkAnimation();
        if (labChanged && this.getName() === "Manticore") this.returnToIdleAnimation();
        if (labChanged && this.getName() === "Battle Mage") this.stopBoardWalkAnimation();
        if (labChanged && this.getName() === "Battle Mage") this.returnToIdleAnimation();
        if (labChanged && this.getName() === LEPRECHAUN_UNIT_NAME) this.stopBoardWalkAnimation();
        if (labChanged && this.getName() === "Elf") this.returnToIdleAnimation();
        if (labChanged && this.getName() === "Medusa") this.returnToIdleAnimation();
        if (labChanged && this.getName() === "Fairy") this.returnToIdleAnimation();
        if (labChanged && this.getName() === DRYAD_UNIT_NAME) this.returnToIdleAnimation();
        if (labChanged && this.getName() === TROLL_UNIT_NAME) this.returnToIdleAnimation();
        if (labChanged && this.getName() === "White Tiger") this.returnToIdleAnimation();
        if (labChanged && this.getName() === CENTAUR_UNIT_NAME) this.returnToIdleAnimation();
        this.creatureAnimationLabPreviewEnabled = enabled;
        if (
            labChanged &&
            (this.getName() === DRYAD_UNIT_NAME ||
                this.getName() === "Battle Mage" ||
                this.getName() === "Pikeman" ||
                this.getName() === "Manticore")
        ) {
            this.selectionAnimationStartedAtMs = performance.now();
            this.syncCreaturePalette();
        }
        if (this.getName() === "Berserker") {
            if (!labChanged) return;
            const previousHeight = this.sprite ? this.sprite.texture.height * this.sprite.scale.y : undefined;
            this.stopSelectionAnimationInternal();
            this.selectionAnimationStartedAtMs = performance.now();
            this.startSelectionAnimationInternal();
            if (previousHeight !== undefined && this.sprite) {
                const ratio =
                    ((previousHeight / (this.sprite.texture.height * this.sprite.scale.y)) *
                        this.berserkerLabIdleScale()) /
                    previousBerserkerIdleScale;
                this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
                this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
            }
            return;
        }
        if (
            this.getName() === CENTAUR_UNIT_NAME ||
            this.getName() === "Fairy" ||
            this.getName() === "Healer" ||
            this.getName() === "Elf" ||
            this.getName() === "Medusa" ||
            this.getName() === "White Tiger" ||
            this.getName() === TROLL_UNIT_NAME
        ) {
            if (!labChanged) return;
            const previousHeight = this.sprite ? this.sprite.texture.height * this.sprite.scale.y : undefined;
            this.stopSelectionAnimationInternal();
            this.selectionAnimationStartedAtMs = performance.now();
            this.startSelectionAnimationInternal();
            if (previousHeight !== undefined && this.sprite) {
                const scaleRatio = previousHeight / (this.sprite.texture.height * this.sprite.scale.y);
                this.sprite.scale.set(this.sprite.scale.x * scaleRatio, this.sprite.scale.y * scaleRatio);
                this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
            }
            return;
        }
        if (this.getName() === ARBALESTER_UNIT_NAME) {
            if (this.arbalesterLabIdleEnabled === enabled) return;
            this.returnToIdleAnimation();
            const previousHeight = this.sprite ? this.sprite.texture.height * this.sprite.scale.y : undefined;
            const previousLabScale = this.arbalesterLabScaleMultiplier();
            this.arbalesterLabIdleEnabled = enabled;
            this.stopSelectionAnimationInternal();
            this.startSelectionAnimationInternal();
            if (previousHeight !== undefined && this.sprite) {
                const scaleRatio =
                    (previousHeight / (this.sprite.texture.height * this.sprite.scale.y)) *
                    (this.arbalesterLabScaleMultiplier() / previousLabScale);
                this.sprite.scale.set(this.sprite.scale.x * scaleRatio, this.sprite.scale.y * scaleRatio);
                this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
            }
            return;
        }
        if (this.getName() !== SCAVENGER_UNIT_NAME || this.scavengerLabAnimationsEnabled === enabled) return;
        this.scavengerLabAnimationsEnabled = enabled;
        this.returnToIdleAnimation();
        this.stopSelectionAnimationInternal();
        this.startSelectionAnimationInternal();
    }
    private berserkerLabIdleScale(): number {
        return this.creatureAnimationLabPreviewEnabled &&
            this.getName() === "Berserker" &&
            "berserker_sword_idle_atlas" in images
            ? BERSERKER_SWORD_IDLE_SCALE
            : 1;
    }
    private medusaLabCanvasScale(state = this.oneShotAnim?.stateName): number {
        return this.creatureAnimationLabPreviewEnabled &&
            this.getName() === "Medusa" &&
            (state === "hit" || state === "death" || /^(?:melee_)?attack(?:_up|_down)?$/.test(state ?? ""))
            ? 1024 / 768
            : 1;
    }
    private medusaLabAnimationConfig(state = "idle"): UnitAtlasConfig | null {
        if (!this.creatureAnimationLabPreviewEnabled || this.getName() !== "Medusa") return null;
        const authoredState = state;
        if (
            ![
                "idle",
                "hit",
                "death",
                "melee_attack",
                "melee_attack_up",
                "melee_attack_down",
                "attack",
                "attack_up",
                "attack_down",
            ].includes(authoredState)
        )
            return null;
        const meta = animationAtlases["Medusa Lab"]?.[authoredState];
        const imageKey = `medusa_lab_${authoredState}_atlas` as ImageKey;
        const imageSrc = images[imageKey];
        if (!meta || !imageSrc) return null;
        return {
            meta,
            imageKey,
            imageSrc,
            cacheKey: `Medusa::lab-arm-serpent-ranged-20260920-v4::${authoredState}`,
            cacheAcrossScenes: true,
        };
    }
    private trollLabCanvasScale(state = this.oneShotAnim?.stateName): number {
        return this.creatureAnimationLabPreviewEnabled &&
            this.getName() === TROLL_UNIT_NAME &&
            ["cast", "melee_attack", "melee_attack_up", "melee_attack_down"].includes(state ?? "")
            ? 1152 / 768
            : 1;
    }
    private trollLabAnimationConfig(state = "idle"): UnitAtlasConfig | null {
        if (
            !["idle", "hit", "death", "cast", "melee_attack", "melee_attack_up", "melee_attack_down"].includes(state) ||
            !this.creatureAnimationLabPreviewEnabled ||
            this.getName() !== TROLL_UNIT_NAME
        )
            return null;
        const meta = animationAtlases["Troll Lab"]?.[state];
        const imageKey = `troll_lab_${state}_atlas` as ImageKey;
        const imageSrc = images[imageKey];
        if (!meta || !imageSrc) return null;
        return {
            meta,
            imageKey,
            imageSrc,
            cacheKey:
                state === "idle"
                    ? "Troll::lab-idle-full-redraw-20260913-v2"
                    : state === "cast"
                      ? "Troll::lab-cast-raised-fist-20260920-v1"
                      : state.startsWith("melee_attack")
                        ? `Troll::lab-attacks-20260920-v3-idle-match::${state}`
                        : `Troll::lab-reactions-20260920-v4-idle-proportions::${state}`,
            cacheAcrossScenes: true,
        };
    }
    private whiteTigerLabAnimationConfig(state = "idle"): UnitAtlasConfig | null {
        const authoredState = /^attack(?:_up|_down)?$/.test(state) ? `melee_${state}` : state;
        if (
            !["idle", "hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"].includes(authoredState) ||
            !this.creatureAnimationLabPreviewEnabled ||
            this.getName() !== "White Tiger"
        )
            return null;
        const meta = animationAtlases["White Tiger Lab"]?.[authoredState];
        const imageKey = `white_tiger_lab_${authoredState}_atlas` as ImageKey;
        const imageSrc = images[imageKey];
        if (!meta || !imageSrc) return null;
        return {
            meta,
            imageKey,
            imageSrc,
            cacheKey:
                state === "idle"
                    ? "White Tiger::lab-idle-full-redraw-20260920-v5-compatible-grid"
                    : `White Tiger::lab-reactions-20260920-v1::${authoredState}`,
            cacheAcrossScenes: true,
        };
    }
    private elfLabCanvasScale(state = this.oneShotAnim?.stateName): number {
        if (!this.creatureAnimationLabPreviewEnabled || this.getName() !== "Elf") return 1;
        if (["attack", "attack_up", "attack_down"].includes(state ?? "")) return 1152 / 768;
        return ["melee_attack", "melee_attack_up", "melee_attack_down"].includes(state ?? "") ? 1024 / 768 : 1;
    }
    private elfLabReactionConfig(state: string): UnitAtlasConfig | null {
        if (
            !this.creatureAnimationLabPreviewEnabled ||
            this.getName() !== "Elf" ||
            ![
                "hit",
                "death",
                "melee_attack",
                "melee_attack_up",
                "melee_attack_down",
                "attack",
                "attack_up",
                "attack_down",
            ].includes(state)
        )
            return null;
        const meta = animationAtlases["Elf Lab"]?.[state];
        const imageKey = `elf_lab_${state}_atlas` as ImageKey;
        const imageSrc = images[imageKey];
        if (!meta || !imageSrc) return null;
        return {
            meta: {
                ...meta,
                footAnchorY: ["attack", "attack_up", "attack_down"].includes(state)
                    ? 986 / 1152
                    : this.elfLabCanvasScale(state) > 1
                      ? 858 / 1024
                      : STATIC_BATTLEFIELD_IDLE_META.footAnchorY,
            },
            imageKey,
            imageSrc,
            cacheKey: ["attack", "attack_up", "attack_down"].includes(state)
                ? `Elf::lab-full-archery-speed115-20260920-v3::${state}`
                : state === "hit"
                  ? "Elf::lab-hit-speed135-20260920-v1"
                  : `Elf::lab-idle-palette-rigid-bow-20260920-v6::${state}`,
            cacheAcrossScenes: true,
        };
    }
    private dryadLabActionConfig(state: string): UnitAtlasConfig | null {
        if (
            !this.creatureAnimationLabPreviewEnabled ||
            this.getName() !== DRYAD_UNIT_NAME ||
            ![
                "hit",
                "death",
                "melee_attack",
                "melee_attack_up",
                "melee_attack_down",
                "attack",
                "attack_up",
                "attack_down",
            ].includes(state)
        )
            return null;
        // The lab's upper/lower buttons intentionally use the opposite authored bow swing.
        const authoredState =
            state === "melee_attack_up"
                ? "melee_attack_down"
                : state === "melee_attack_down"
                  ? "melee_attack_up"
                  : state;
        const meta = animationAtlases["Dryad Lab"]?.[authoredState];
        const imageKey = `dryad_lab_${authoredState}_atlas` as ImageKey;
        const imageSrc = images[imageKey];
        if (!meta || !imageSrc) return null;
        return {
            meta,
            imageKey,
            imageSrc,
            cacheKey: `Dryad::lab-actions-20260913-v7::${authoredState}`,
            cacheAcrossScenes: true,
        };
    }
    private leprechaunLabCanvasScale(state = this.oneShotAnim?.stateName): number {
        return this.creatureAnimationLabPreviewEnabled &&
            this.getName() === LEPRECHAUN_UNIT_NAME &&
            ["melee_attack", "melee_attack_up", "melee_attack_down"].includes(state ?? "")
            ? 1024 / 768
            : 1;
    }
    private leprechaunLabReactionConfig(state: string): UnitAtlasConfig | null {
        if (
            !this.creatureAnimationLabPreviewEnabled ||
            this.getName() !== LEPRECHAUN_UNIT_NAME ||
            !["hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"].includes(state)
        )
            return null;
        const meta = animationAtlases["Leprechaun Lab"]?.[state];
        const imageKey = `leprechaun_lab_${state}_atlas` as ImageKey;
        const imageSrc = images[imageKey];
        if (!meta || !imageSrc) return null;
        return {
            // Attacks add 128px padding around the same-size standing figure.
            meta: {
                ...meta,
                footAnchorY:
                    this.leprechaunLabCanvasScale(state) > 1 ? 858 / 1024 : STATIC_BATTLEFIELD_IDLE_META.footAnchorY,
            },
            imageKey,
            imageSrc,
            cacheKey: `Leprechaun::lab-reactions-v2::${state}`,
            cacheAcrossScenes: true,
        };
    }
    private centaurLabCanvasScale(state = this.oneShotAnim?.stateName): number {
        return this.creatureAnimationLabPreviewEnabled &&
            this.getName() === CENTAUR_UNIT_NAME &&
            ["melee_attack", "melee_attack_up", "melee_attack_down", "attack", "attack_up", "attack_down"].includes(
                state ?? "",
            )
            ? 1024 / 768
            : 1;
    }
    private pikemanLabReactionConfig(state: string): UnitAtlasConfig | null {
        const authoredState = state.replace(/^melee_attack/, "attack");
        if (
            !this.creatureAnimationLabPreviewEnabled ||
            this.getName() !== "Pikeman" ||
            !["hit", "death", "attack", "attack_up", "attack_down", "cast"].includes(authoredState)
        )
            return null;
        const meta = animationAtlases["Pikeman Lab"]?.[authoredState];
        const imageKey = `pikeman_lab_${authoredState}_atlas` as ImageKey;
        const imageSrc = images[imageKey];
        if (!meta || !imageSrc) return null;
        return {
            meta: { ...meta, footAnchorY: STATIC_BATTLEFIELD_IDLE_META.footAnchorY },
            imageKey,
            imageSrc,
            cacheKey: `Pikeman::lab-actions-20260920-v5::${authoredState}`,
            cacheAcrossScenes: true,
        };
    }
    private healerLabReactionConfig(state: string): UnitAtlasConfig | null {
        const authoredState = state.replace(/^melee_attack/, "attack");
        if (
            !this.creatureAnimationLabPreviewEnabled ||
            this.getName() !== "Healer" ||
            !["hit", "death", "attack", "attack_up", "attack_down", "cast"].includes(authoredState)
        )
            return null;
        const meta = animationAtlases["Healer Lab"]?.[authoredState];
        const imageKey = `healer_lab_${authoredState}_atlas` as ImageKey;
        const imageSrc = images[imageKey];
        if (!meta || !imageSrc) return null;
        return {
            meta: { ...meta, footAnchorY: STATIC_BATTLEFIELD_IDLE_META.footAnchorY },
            imageKey,
            imageSrc,
            cacheKey: `Healer::lab-actions-20260920-v2::${authoredState}`,
            cacheAcrossScenes: true,
        };
    }
    private centaurLabReactionConfig(state: string): UnitAtlasConfig | null {
        if (
            !this.creatureAnimationLabPreviewEnabled ||
            this.getName() !== CENTAUR_UNIT_NAME ||
            ![
                "hit",
                "death",
                "melee_attack",
                "melee_attack_up",
                "melee_attack_down",
                "attack",
                "attack_up",
                "attack_down",
            ].includes(state)
        )
            return null;
        const meta = animationAtlases["Centaur Lab"]?.[state];
        const imageKey = `centaur_lab_${state}_atlas` as ImageKey;
        const imageSrc = images[imageKey];
        if (!meta || !imageSrc) return null;
        return {
            meta,
            imageKey,
            imageSrc,
            cacheKey: `Centaur::lab-reaction-registered-20260913::${state}`,
            cacheAcrossScenes: true,
        };
    }
    private scavengerLabAnimationConfig(state: string): UnitAtlasConfig | null {
        if (!this.scavengerLabAnimationsEnabled || !["idle", ...SCAVENGER_LAB_ACTIONS].includes(state)) return null;
        const meta = animationAtlases[state === "idle" ? "Scavenger Homm" : "Scavenger Combat"]?.[state];
        const imageKey = (
            state === "idle" ? "scavenger_homm_idle_atlas_quarter" : `scavenger_combat_${state}_atlas_quarter`
        ) as ImageKey;
        const imageSrc = images[imageKey];
        if (!meta || !imageSrc) return null;
        return {
            // Match the static figure's ground registration, including its existing 38px sole offset.
            meta: state === "idle" ? { ...meta, footAnchorY: (744 - (38 * 700) / 757) / 768 } : meta,
            imageKey,
            imageSrc,
            cacheKey: `Scavenger::lab-combat-v2::${state}`,
            cacheAcrossScenes: true,
        };
    }
    public setBoardSelected(selected: boolean): void {
        if (this.boardSelected === selected) return;
        this.boardSelected = selected;
        if (selected) {
            this.startSelectionAnimationInternal();
        } else if (!this.hasAnimationState("idle")) {
            this.stopSelectionAnimationInternal();
        }
    }
    private startSelectionAnimationInternal(): void {
        if (!this.sprite) return;
        const props = this.getUnitProperties();
        let config =
            this.medusaLabAnimationConfig() ??
            this.whiteTigerLabAnimationConfig() ??
            this.trollLabAnimationConfig() ??
            this.fairyLabAnimationConfig() ??
            this.scavengerLabAnimationConfig("idle") ??
            getDefaultAnimationConfig(props.name, this.getFootprintWidth(), this.getFootprintHeight());
        if (this.berserkerLabIdleScale() !== 1) {
            config = {
                meta: animationAtlases["Berserker Sword"].idle,
                imageKey: "berserker_sword_idle_atlas",
                imageSrc: images.berserker_sword_idle_atlas,
                cacheKey: "Berserker::lab-sword-idle-v2",
                cacheAcrossScenes: true,
            };
        }
        if (this.creatureAnimationLabPreviewEnabled && props.name === CENTAUR_UNIT_NAME) {
            config = {
                meta: animationAtlases["Centaur Lab"].idle,
                imageKey: "centaur_lab_idle_atlas",
                imageSrc: images.centaur_lab_idle_atlas,
                cacheKey: "Centaur::lab-idle-wind-20260913",
                cacheAcrossScenes: true,
            };
        }
        if (this.creatureAnimationLabPreviewEnabled && props.name === "Elf") {
            config = {
                meta: {
                    ...animationAtlases["Elf Lab"].idle,
                    footAnchorY: STATIC_BATTLEFIELD_IDLE_META.footAnchorY,
                },
                imageKey: "elf_lab_idle_atlas",
                imageSrc: images.elf_lab_idle_atlas,
                cacheKey: "Elf::lab-idle-aaa-painted-yew-bow-20260920-v10-pause1000",
                cacheAcrossScenes: true,
            };
        }
        if (this.creatureAnimationLabPreviewEnabled && props.name === "Healer") {
            config = {
                meta: {
                    ...animationAtlases["Healer Lab"].idle,
                    footAnchorY: STATIC_BATTLEFIELD_IDLE_META.footAnchorY,
                },
                imageKey: "healer_lab_idle_atlas",
                imageSrc: images.healer_lab_idle_atlas,
                cacheKey: "Healer::lab-idle-book-breath-20260913-v1",
                cacheAcrossScenes: true,
            };
        }
        if (this.arbalesterLabIdleEnabled && props.name === ARBALESTER_UNIT_NAME) {
            const pages = arbalesterIdlePages(animationAtlases.Arbalester.idle);
            if (pages) {
                const neutralConfig = getAnimationStateConfig(
                    props.name,
                    "hit",
                    this.getFootprintWidth(),
                    this.getFootprintHeight(),
                );
                const neutral = neutralConfig ? framesForAtlasConfig(neutralConfig, this.texResolver)[0] : undefined;
                // The hit clip opens on the exact neutral pose. Keep this independently resident source
                // for shadows and action returns, so unloading page zero never invalidates their texture.
                if (!neutral) return;
                if (!this.arbalesterIdlePager) {
                    this.arbalesterIdlePager = new ArbalesterIdlePager(pages);
                    this.selectionAnimationStartedAtMs = performance.now();
                }
                this.selectionAnimFrames = [neutral];
                this.selectionAnimTiming = buildAtlasPingPongTiming(animationAtlases.Arbalester.idle);
                this.selectionAnimFootAnchorY = this.arbalesterLabFootAnchorY("idle", animationAtlases.Arbalester.idle);
                this.selectionAnimFrameIndex = -1;
                this.stepSelectionAnimation();
                return;
            }
            // An incomplete native manifest falls back to the detailed static figure while the
            // local assets rebuild; never decode the giant authoring sheet or enlarge quarter art.
            config = getStaticBattlefieldIdleConfig(props.name, this.getFootprintWidth(), this.getFootprintHeight());
        }
        if (config && props.name === PEASANT_UNIT_NAME) {
            config = {
                ...config,
                meta: {
                    frameWidth: 768,
                    frameHeight: 768,
                    atlasWidth: 3072,
                    atlasHeight: 2304,
                    frameCount: 12,
                    fps: 6 * 1.15,
                    frameDurationSec: 1 / (6 * 1.15),
                    totalDurationSec: 2 / 1.15,
                    layout: { cols: 4, rows: 3 },
                    footAnchorY: 0.9505208333333334,
                    loopDurationMs: 1800,
                    pauseMs: 700,
                },
                imageSrc: images.peasant_idle_red_atlas_quarter,
                imageKey: "peasant_idle_red_atlas_quarter",
                cacheKey: "Peasant::idle::shared::joined-fork-v3",
            };
        }
        if (!config) return;
        const { meta } = config;
        const frames = framesForAtlasConfig(config, this.texResolver);
        if (!frames.length) return;
        this.selectionAnimFrames = frames;
        this.selectionAnimTiming = buildAtlasPingPongTiming(meta);
        this.selectionAnimFrameDurationsMs =
            meta.frameDurationsMs?.length === frames.length ? meta.frameDurationsMs : undefined;
        if (props.name === WOLF_UNIT_NAME && this.selectionAnimFrameDurationsMs) {
            this.selectionAnimFrameDurationsMs = wolfIdlePlaybackDurations(this.selectionAnimFrameDurationsMs);
        }
        const authoredFrameDurationMs = 1000 / Math.max(1, meta.fps || 8);
        // Beholder's metadata owns its independently tuned tentacle and blink durations. Applying
        // the shared refreshed-model multiplier here would destroy those authored percentages.
        this.selectionAnimFrameDurationMs = authoredIdleFrameDurationMs(
            props.name,
            authoredFrameDurationMs,
            usesRefreshedFullBodyScale(props, true),
        );
        // Atlas frame 5 (sixth cell) is fully upright; frame 0 is the bottom of the bend.
        if (props.name === PEASANT_UNIT_NAME) {
            const durations = frames.map(() => this.selectionAnimFrameDurationMs);
            durations[5] += 700;
            this.selectionAnimFrameDurationsMs = durations;
        }
        this.selectionAnimFootAnchorY = this.arbalesterLabFootAnchorY("idle", meta);
        this.selectionAnimFrameIndex = -1;
        // The permanent breathing atlas already includes the hands and axe. Legacy flourishes
        // belong to the old figure and must not interrupt the new idle, even with animations enabled.
        if (
            CREATURE_SPRITE_ANIMATION_SETTINGS.enabled &&
            props.name === ORC_UNIT_NAME &&
            !usesApprovedPermanentIdleAtlas(props.name)
        ) {
            const twirlCacheKey = `${ORC_UNIT_NAME}::idle_axe_twirl`;
            const imageSrc = images[ORC_IDLE_AXE_TWIRL_IMAGE_KEY];
            const twirlFrames = cachedAtlasFrames(
                twirlCacheKey,
                ORC_IDLE_AXE_TWIRL_META,
                imageSrc,
                ORC_IDLE_AXE_TWIRL_IMAGE_KEY,
                this.texResolver(ORC_IDLE_AXE_TWIRL_IMAGE_KEY),
            );
            this.orcIdleAxeTwirlFrames = twirlFrames;

            const battleCryCacheKey = `${ORC_UNIT_NAME}::active_battle_cry`;
            const battleCryImageSrc = images[ORC_ACTIVE_BATTLE_CRY_IMAGE_KEY];
            const battleCryFrames = cachedAtlasFrames(
                battleCryCacheKey,
                ORC_ACTIVE_BATTLE_CRY_META,
                battleCryImageSrc,
                ORC_ACTIVE_BATTLE_CRY_IMAGE_KEY,
                this.texResolver(ORC_ACTIVE_BATTLE_CRY_IMAGE_KEY),
            );
            this.orcActiveBattleCryFrames = battleCryFrames;
        }
        if (
            CREATURE_SPRITE_ANIMATION_SETTINGS.enabled &&
            !this.scavengerLabAnimationsEnabled &&
            props.name === SCAVENGER_UNIT_NAME
        ) {
            const bladeTwirlCacheKey = `${SCAVENGER_UNIT_NAME}::idle_blade_twirl`;
            const imageSrc = images[SCAVENGER_IDLE_BLADE_TWIRL_IMAGE_KEY];
            const bladeTwirlFrames = cachedAtlasFrames(
                bladeTwirlCacheKey,
                SCAVENGER_FLOURISH_META,
                imageSrc,
                SCAVENGER_IDLE_BLADE_TWIRL_IMAGE_KEY,
                this.texResolver(SCAVENGER_IDLE_BLADE_TWIRL_IMAGE_KEY),
            );
            this.scavengerIdleBladeTwirlFrames = bladeTwirlFrames;

            const battleCryCacheKey = `${SCAVENGER_UNIT_NAME}::active_battle_cry`;
            const battleCryImageSrc = images[SCAVENGER_ACTIVE_BATTLE_CRY_IMAGE_KEY];
            const battleCryFrames = cachedAtlasFrames(
                battleCryCacheKey,
                SCAVENGER_FLOURISH_META,
                battleCryImageSrc,
                SCAVENGER_ACTIVE_BATTLE_CRY_IMAGE_KEY,
                this.texResolver(SCAVENGER_ACTIVE_BATTLE_CRY_IMAGE_KEY),
            );
            this.scavengerActiveBattleCryFrames = battleCryFrames;
        }
        // Render the in-phase frame immediately so the board lines up with the sidebar portrait
        // even before the next ticker step.
        this.stepSelectionAnimation();
    }
    public stepSelectionAnimation(now = performance.now()): void {
        this.syncCreaturePalette(now);
        const hasAuthoredIdle = this.hasAnimationState("idle");
        if (!this.boardSelected && !hasAuthoredIdle) return;
        // A walking or one-shot action owns the sprite until it finishes; idle resumes immediately after.
        if (this.walkAnim || this.oneShotAnim) return;
        if (this.arbalesterIdlePager && this.arbalesterLabIdleEnabled && this.sprite) {
            const sprite = this.sprite;
            // While a page decodes, the independently resident neutral pose also permits immediate
            // walk/hit returns. A successful callback swaps the texture before the previous page unloads.
            const shown = this.arbalesterIdlePager.showFrame(
                now - this.selectionAnimationStartedAtMs,
                (texture, frame) => {
                    sprite.texture = texture;
                    this.selectionAnimFrameIndex = frame;
                },
            );
            if (!shown && this.selectionAnimFrameIndex < 0 && this.selectionAnimFrames?.[0]) {
                sprite.texture = this.selectionAnimFrames[0];
            }
            return;
        }
        const frames = this.selectionAnimFrames;
        const timing = this.selectionAnimTiming;
        if (!frames || !timing || !this.sprite) return;
        const unitName = this.getUnitProperties().name;
        if (unitName === "Medusa" && this.creatureAnimationLabPreviewEnabled) {
            const durations = this.selectionAnimFrameDurationsMs;
            const frame = durations
                ? authoredIdleFrameForElapsed(now - this.selectionAnimationStartedAtMs, durations)
                : 0;
            this.selectionAnimFrameIndex = frame;
            if (frames[frame]) this.sprite.texture = frames[frame];
            return;
        }
        if ((unitName === TROLL_UNIT_NAME || unitName === "White Tiger") && this.creatureAnimationLabPreviewEnabled) {
            // Local breathing and secondary motion are drawn into the native frames.
            // Metadata owns the complete loop, including its neutral endpoints.
            const durations = this.selectionAnimFrameDurationsMs;
            const cycleEndPauseMs =
                unitName === TROLL_UNIT_NAME ? (animationAtlases["Troll Lab"]?.idle.cycleEndPauseMs ?? 0) : 0;
            const frame = durations
                ? authoredIdleFrameForElapsed(now - this.selectionAnimationStartedAtMs, durations, cycleEndPauseMs)
                : 0;
            this.selectionAnimFrameIndex = frame;
            if (frames[frame]) this.sprite.texture = frames[frame];
            if (unitName === TROLL_UNIT_NAME) this.syncCreaturePalette(now);
            return;
        }
        if (unitName === "Elf" && this.creatureAnimationLabPreviewEnabled) {
            // The sprite sequence includes breathing, bow inspection and exact neutral endpoints.
            // Play its authored holds directly, without stretching the body or ping-ponging the clip.
            const durations = this.selectionAnimFrameDurationsMs;
            const frame = durations
                ? authoredIdleFrameForElapsed(
                      now - this.selectionAnimationStartedAtMs,
                      durations,
                      animationAtlases["Elf Lab"].idle.cycleEndPauseMs ?? 0,
                  )
                : 0;
            this.selectionAnimFrameIndex = frame;
            if (frames[frame]) this.sprite.texture = frames[frame];
            return;
        }
        if (unitName === "Healer" && this.creatureAnimationLabPreviewEnabled) {
            // These individually drawn poses include the breath and page turn. Their authored
            // holds include the exact canonical first/last frames; never ping-pong a page turn.
            const durations = this.selectionAnimFrameDurationsMs;
            const frame = durations
                ? authoredIdleFrameForElapsed(now - this.selectionAnimationStartedAtMs, durations)
                : 0;
            this.selectionAnimFrameIndex = frame;
            if (frames[frame]) this.sprite.texture = frames[frame];
            return;
        }
        if (unitName === "Fairy" && this.creatureAnimationLabPreviewEnabled) {
            const frame = fairyLabIdleFrame(now - this.selectionAnimationStartedAtMs);
            this.selectionAnimFrameIndex = frame;
            if (frames[frame]) this.sprite.texture = frames[frame];
            return;
        }
        if (unitName === CENTAUR_UNIT_NAME && this.creatureAnimationLabPreviewEnabled) {
            const frame = centaurLabIdleFrame(now - this.selectionAnimationStartedAtMs);
            this.selectionAnimFrameIndex = frame;
            if (frames[frame]) this.sprite.texture = frames[frame];
            return;
        }
        if (
            !this.scavengerLabAnimationsEnabled &&
            !this.arbalesterLabIdleEnabled &&
            this.berserkerLabIdleScale() === 1 &&
            !creatureIdleAnimationEnabledForUnit(unitName)
        ) {
            const firstFrame = frames[0];
            this.selectionAnimFrameIndex = 0;
            this.isShowingOrcBattleCryFrame = false;
            this.isShowingScavengerFlourishFrame = false;
            if (firstFrame && this.sprite.texture !== firstFrame) this.sprite.texture = firstFrame;
            return;
        }
        if (frames.length <= 1) {
            const onlyFrame = frames[0];
            if (onlyFrame && this.sprite.texture !== onlyFrame) this.sprite.texture = onlyFrame;
            return;
        }
        // Derive the frame purely from the absolute wall clock so the board sprite and the
        // sidebar's CSS animation (which uses the same helper on the rAF timestamp) stay
        // phase-locked. See buildAtlasPingPongTiming for why absolute time keeps them in sync.
        // Authored idle frames are seamless breathing/fire loops, so play them linearly.
        // Legacy creature atlases retain their existing forward/hold/backward selection timing.
        const isOrc = unitName === ORC_UNIT_NAME;
        const isScavenger = unitName === SCAVENGER_UNIT_NAME;
        const activeBattleCryFrames = isOrc
            ? this.orcActiveBattleCryFrames
            : isScavenger
              ? this.scavengerActiveBattleCryFrames
              : undefined;
        const idleTwirlFrames = isOrc
            ? this.orcIdleAxeTwirlFrames
            : isScavenger
              ? this.scavengerIdleBladeTwirlFrames
              : undefined;
        const battleCryFrame =
            this.isActiveTurn && activeBattleCryFrames?.length
                ? isOrc
                    ? orcActiveBattleCryFrameForElapsed(now - this.activeTurnAnimationStartedAtMs)
                    : scavengerActiveBattleCryFrameForElapsed(now - this.activeTurnAnimationStartedAtMs)
                : undefined;
        const twirlFrame =
            !this.isActiveTurn && idleTwirlFrames?.length
                ? isOrc
                    ? orcIdleAxeTwirlFrameForElapsed(now - this.selectionAnimationStartedAtMs)
                    : scavengerIdleBladeTwirlFrameForElapsed(now - this.selectionAnimationStartedAtMs)
                : undefined;
        const variableIdleDurations = this.selectionAnimFrameDurationsMs;
        const variableIdleCycleMs = variableIdleDurations?.reduce((total, duration) => total + duration, 0) ?? 0;
        const idleElapsedMs =
            unitName === "Berserker" ||
            unitName === MERMAID_UNIT_NAME ||
            unitName === ORC_UNIT_NAME ||
            unitName === WOLF_UNIT_NAME ||
            unitName === WOLF_RIDER_UNIT_NAME ||
            unitName === BLACKSMITH_UNIT_NAME ||
            (unitName === ARBALESTER_UNIT_NAME && this.arbalesterLabIdleEnabled)
                ? now - this.selectionAnimationStartedAtMs
                : unitName === PEASANT_UNIT_NAME && this.peasantIdleResumeAtMs !== undefined
                  ? now - this.peasantIdleResumeAtMs + this.selectionAnimFrameDurationMs * 5
                  : unitName === TROGLODYTE_UNIT_NAME && this.troglodyteIdleResumeAtMs !== undefined
                    ? now - this.troglodyteIdleResumeAtMs
                    : now + this.refreshedIdlePhaseRatio * variableIdleCycleMs;
        const authoredIdleFrame = hasAuthoredIdle
            ? variableIdleDurations
                ? authoredIdleFrameForElapsed(idleElapsedMs, variableIdleDurations)
                : Math.floor(
                      (now +
                          this.refreshedIdlePhaseRatio *
                              Math.max(1, this.selectionAnimFrameDurationMs) *
                              frames.length) /
                          Math.max(1, this.selectionAnimFrameDurationMs),
                  ) % frames.length
            : timing.frameForElapsed(now);
        const frame =
            battleCryFrame !== undefined ? battleCryFrame : twirlFrame === undefined ? authoredIdleFrame : twirlFrame;
        const frameKey =
            battleCryFrame !== undefined
                ? frames.length + (idleTwirlFrames?.length ?? 0) + frame
                : twirlFrame === undefined
                  ? frame
                  : frames.length + frame;
        if (frameKey === this.selectionAnimFrameIndex) return;
        this.selectionAnimFrameIndex = frameKey;
        this.isShowingOrcBattleCryFrame = isOrc && battleCryFrame !== undefined;
        this.isShowingScavengerFlourishFrame =
            isScavenger && (battleCryFrame !== undefined || twirlFrame !== undefined);
        const tex =
            battleCryFrame !== undefined
                ? activeBattleCryFrames?.[frame]
                : twirlFrame === undefined
                  ? frames[unitName === WOLF_UNIT_NAME ? wolfIdleTextureFrame(frame) : frame]
                  : idleTwirlFrames?.[frame];
        if (tex) this.sprite.texture = tex;
        if (unitName === WOLF_UNIT_NAME || unitName === "Berserker") this.syncCreaturePalette(now);
    }
    /** Start an authored Heroes-III-style walking loop when the creature provides one. */
    public startBoardWalkAnimation(
        horizontalDirection: number,
        travelDistanceCells?: number,
        _verticalDirection = 0,
    ): void {
        this.cancelArbalesterRangedShot();
        this.suppressActiveTurnPointer();
        this.cancelDryadRangedShot();
        const props = this.getUnitProperties();
        if (!this.sprite) return;
        this.movementBadgeOffsetY ??= this.restingBadgeOffsetY;
        this.setBoardFacingFromMovement(horizontalDirection);
        clearScavengerHitRegistration(this.sprite);
        if (!creatureWalkAnimationEnabledForUnit(props.name, this.creatureAnimationLabPreviewEnabled)) {
            this.restoreScaleAfterSquireWalk();
            this.restoreWidthAfterBoardWalk();
            this.walkAnim = undefined;
            this.stepSelectionAnimation();
            return;
        }
        const centaurLabWalk = this.creatureAnimationLabPreviewEnabled && props.name === CENTAUR_UNIT_NAME;
        if (centaurLabWalk && this.oneShotAnim) this.returnToIdleAnimation();
        const leprechaunLabWalk = this.creatureAnimationLabPreviewEnabled && props.name === LEPRECHAUN_UNIT_NAME;
        const dryadLabWalk = this.creatureAnimationLabPreviewEnabled && props.name === DRYAD_UNIT_NAME;
        const manticoreLabWalk = this.creatureAnimationLabPreviewEnabled && props.name === "Manticore";
        const wasManticoreLabWalking = manticoreLabWalk && !!this.walkAnim;
        const fairyLabWalk = this.creatureAnimationLabPreviewEnabled && props.name === "Fairy";
        const valkyrieLabWalk = this.creatureAnimationLabPreviewEnabled && props.name === "Valkyrie";
        if (valkyrieLabWalk) syncValkyrieLabWalk(this.sprite, -1);
        const wasValkyrieLabWalking = valkyrieLabWalk && !!this.walkAnim;
        const medusaLabWalk = this.creatureAnimationLabPreviewEnabled && props.name === "Medusa";
        const trollLabWalk = this.creatureAnimationLabPreviewEnabled && props.name === TROLL_UNIT_NAME;
        const wasTrollLabWalking = trollLabWalk && !!this.walkAnim;
        const battleMageLabWalk = this.creatureAnimationLabPreviewEnabled && props.name === "Battle Mage";
        if (battleMageLabWalk && this.oneShotAnim) this.returnToIdleAnimation();
        const wasBattleMageLabWalking = battleMageLabWalk && !!this.walkAnim;
        const wasFairyLabWalking = fairyLabWalk && !!this.walkAnim;
        let config: UnitAtlasConfig | null = fairyLabWalk
            ? {
                  meta: animationAtlases["Fairy Lab"].walk,
                  imageKey: "fairy_lab_walk_atlas",
                  imageSrc: images.fairy_lab_walk_atlas,
                  cacheKey: "Fairy::lab-flight-20260913-v1",
                  cacheAcrossScenes: true,
              }
            : centaurLabWalk
              ? {
                    meta: animationAtlases["Centaur Lab"].walk,
                    imageKey: "centaur_lab_walk_atlas",
                    imageSrc: images.centaur_lab_walk_atlas,
                    cacheKey: "Centaur::lab-walk-cloth-20260913",
                    cacheAcrossScenes: true,
                }
              : leprechaunLabWalk
                ? {
                      meta: animationAtlases["Leprechaun Lab"].walk,
                      imageKey: "leprechaun_lab_walk_atlas",
                      imageSrc: images.leprechaun_lab_walk_atlas,
                      cacheKey: "Leprechaun::lab-walk-hd-20260913",
                      cacheAcrossScenes: true,
                  }
                : dryadLabWalk
                  ? {
                        meta: animationAtlases["Dryad Lab"].walk,
                        imageKey: "dryad_lab_walk_atlas",
                        imageSrc: images.dryad_lab_walk_atlas,
                        cacheKey: "Dryad::lab-walk-palette-20260913-v4",
                        cacheAcrossScenes: true,
                    }
                  : getAnimationStateConfig(props.name, "walk", this.getFootprintWidth(), this.getFootprintHeight());
        if (valkyrieLabWalk) {
            config = {
                meta: animationAtlases["Valkyrie Lab Current"].walk,
                imageKey: "valkyrie_lab_current_walk_atlas",
                imageSrc: images.valkyrie_lab_current_walk_atlas,
                cacheKey: "Valkyrie::lab-flight-actual-battlefield-source-20260913-v7",
                cacheAcrossScenes: true,
            };
        }
        if (manticoreLabWalk) {
            config = {
                meta: animationAtlases["Manticore Lab"].walk,
                imageKey: "manticore_lab_walk_atlas",
                imageSrc: images.manticore_lab_walk_atlas,
                cacheKey: "Manticore::lab-flight-20260913-v2",
                cacheAcrossScenes: true,
            };
        }
        if (battleMageLabWalk) {
            config = {
                meta: animationAtlases["Battle Mage Lab"].walk,
                imageKey: "battle_mage_lab_walk_atlas",
                imageSrc: images.battle_mage_lab_walk_atlas,
                cacheKey: "Battle Mage::lab-walk-source-exact-20260913-v1",
                cacheAcrossScenes: true,
            };
        }
        if (this.creatureAnimationLabPreviewEnabled && props.name === "White Tiger") {
            config = {
                meta: animationAtlases["White Tiger Lab"].walk,
                imageKey: "white_tiger_lab_walk_atlas",
                imageSrc: images.white_tiger_lab_walk_atlas,
                cacheKey: "White Tiger::lab-walk-source-exact-20260913-v1",
                cacheAcrossScenes: true,
            };
        }
        if (this.creatureAnimationLabPreviewEnabled && props.name === "Healer") {
            config = {
                meta: animationAtlases["Healer Lab"].walk,
                imageKey: "healer_lab_walk_atlas",
                imageSrc: images.healer_lab_walk_atlas,
                cacheKey: "Healer::lab-walk-facefix-20260913-v2",
                cacheAcrossScenes: true,
            };
        }
        if (this.creatureAnimationLabPreviewEnabled && props.name === "Elf") {
            config = {
                meta: animationAtlases["Elf Lab"].walk,
                imageKey: "elf_lab_walk_atlas",
                imageSrc: images.elf_lab_walk_atlas,
                cacheKey: "Elf::lab-walk-idle-palette-ground-20260920-v4",
                cacheAcrossScenes: true,
            };
        }
        if (medusaLabWalk) {
            config = {
                meta: animationAtlases["Medusa Lab"].walk,
                imageKey: "medusa_lab_walk_atlas",
                imageSrc: images.medusa_lab_walk_atlas,
                cacheKey: "Medusa::lab-walk-complete-face-hands-20260920-v8",
                cacheAcrossScenes: true,
            };
        }
        if (trollLabWalk) {
            config = {
                meta: animationAtlases["Troll Lab"].walk,
                imageKey: "troll_lab_walk_atlas",
                imageSrc: images.troll_lab_walk_atlas,
                cacheKey: "Troll::lab-walk-source-exact-20260913-v1",
                cacheAcrossScenes: true,
            };
        }
        if (!config) return;
        const frames = framesForAtlasConfig(config, this.texResolver);
        if (!frames.length) return;
        const hasThiefTransitions = props.name === THIEF_UNIT_NAME;
        const hasAuthoredTurnInAndOut =
            hasThiefTransitions ||
            (props.name === CENTAUR_UNIT_NAME && !centaurLabWalk) ||
            (props.name === DRYAD_UNIT_NAME && !dryadLabWalk) ||
            (props.name === LEPRECHAUN_UNIT_NAME && !leprechaunLabWalk);
        const flightPhases = config.meta.phases;
        const hasAuthoredFlightPhases =
            flightPhases !== undefined &&
            flightPhases.intro.startFrame === 0 &&
            flightPhases.intro.endFrame + 1 === flightPhases.flight.startFrame &&
            flightPhases.flight.endFrame + 1 === flightPhases.landing.startFrame &&
            flightPhases.landing.endFrame < frames.length &&
            !flightPhases.intro.loop &&
            flightPhases.flight.loop &&
            !flightPhases.landing.loop;
        const baseDurationPerFrameMs =
            props.name === WANDERING_MAGE_UNIT_NAME
                ? 1000 / WANDERING_MAGE_WALK_FPS
                : 1000 /
                  (Math.max(1, config.meta.fps || 12) *
                      (props.name === CENTAUR_UNIT_NAME && !centaurLabWalk
                          ? CENTAUR_WALK_FPS_MULTIPLIER
                          : hasThiefTransitions
                            ? THIEF_WALK_FPS_MULTIPLIER
                            : 1));
        const authoredIntroDistance = hasAuthoredFlightPhases ? flightPhases.intro.distanceCells : undefined;
        const introSpeedMultiplier = hasAuthoredFlightPhases
            ? Math.max(0.001, flightPhases.intro.speedMultiplier ?? 1)
            : 1;
        const introDistanceCells =
            authoredIntroDistance !== undefined && authoredIntroDistance > 0
                ? Math.min(
                      authoredIntroDistance / introSpeedMultiplier,
                      Math.max(0, travelDistanceCells ?? authoredIntroDistance),
                  )
                : undefined;
        const flightSpeedMultiplier = hasAuthoredFlightPhases
            ? Math.max(0.001, flightPhases.flight.speedMultiplier ?? 1)
            : 1;
        const landingSpeedMultiplier = hasAuthoredFlightPhases
            ? Math.max(0.001, flightPhases.landing.speedMultiplier ?? 1)
            : 1;
        const wasSquireWalking = props.name === SQUIRE_UNIT_NAME && !!this.walkAnim;
        const wasArbalesterWalking = props.name === ARBALESTER_UNIT_NAME && !!this.walkAnim;
        const wasPikemanWalking = props.name === "Pikeman" && !!this.walkAnim;
        const wasBerserkerWalking = props.name === "Berserker" && !!this.walkAnim;
        const previousCentaurLabScale =
            centaurLabWalk && this.walkAnim ? centaurLabWalkScale(this.walkAnim.frameIndex) : 1;
        const scavengerPreviousVisibleHeight =
            props.name === SCAVENGER_UNIT_NAME
                ? this.sprite.texture.height *
                  (this.walkAnim
                      ? SCAVENGER_ORIGINAL_WALK_VISIBLE_HEIGHT_RATIO
                      : this.scavengerLabAnimationsEnabled
                        ? SCAVENGER_LAB_VISIBLE_HEIGHT_RATIO
                        : THIEF_IDLE_VISIBLE_HEIGHT_RATIO)
                : undefined;
        const previousArbalesterWalkScale =
            props.name === ARBALESTER_UNIT_NAME && this.walkAnim
                ? arbalesterWalkScaleMultiplier(this.walkAnim.frameIndex)
                : this.arbalesterLabScaleMultiplier(this.oneShotAnim?.stateName);
        this.walkAnim = {
            frames,
            footAnchorY: valkyrieLabWalk
                ? valkyrieLabWalkAnchorY(this.selectionAnimFootAnchorY)
                : props.name === "Berserker"
                  ? BERSERKER_WALK_SOLE_Y - 38 / 768 / BERSERKER_WALK_VISIBLE_SCALE_MULTIPLIER
                  : props.name === ARBALESTER_UNIT_NAME
                    ? arbalesterWalkFootAnchorY(0)
                    : tallBoardModelFootAnchorY(props.name, "walk", config.meta),
            frameIndex: 0,
            // Thief frame 0 turns into movement, frames 1..6 are the complete two-leg gait,
            // and frame 7 turns back to the battlefield stance. Neither transition belongs in the loop.
            // Orc, Scavenger and Wolf Rider loop all eight walking frames without turn transitions.
            // Dryad follows the same 1 + 7 + 1 structure. Legacy Leprechaun uses 1 + 2 + 1:
            // one turn-in, two deliberately slow running poses, and the matching turn-back pose.
            // The HD Leprechaun and Dryad lab drafts loop all eight frames without those legacy transitions.
            // Dryad's approved gait is stored in reverse order so its legs push toward its facing.
            // An authored flyer uses its intro once for take-off, repeats only the flight phase for
            // as long as the route lasts, then plays the complete landing phase at the destination.
            loopStartFrame: hasAuthoredFlightPhases
                ? flightPhases.flight.startFrame
                : hasAuthoredTurnInAndOut && frames.length > 2
                  ? 1
                  : 0,
            // Medusa's final cel is a neutral reference; idle owns arrival without an extra held pose.
            loopEndFrame: medusaLabWalk
                ? frames.length - 2
                : hasAuthoredFlightPhases
                  ? flightPhases.flight.endFrame
                  : props.name === SQUIRE_UNIT_NAME && frames.length > 1
                    ? frames.length - 2
                    : hasAuthoredTurnInAndOut
                      ? frames.length - 2
                      : frames.length - 1,
            outroFrame: medusaLabWalk
                ? undefined
                : hasAuthoredFlightPhases
                  ? flightPhases.landing.startFrame
                  : hasAuthoredTurnInAndOut
                    ? frames.length - 1
                    : undefined,
            outroEndFrame: hasAuthoredFlightPhases ? flightPhases.landing.endFrame : undefined,
            introDistanceCells,
            introComplete: !hasAuthoredTurnInAndOut && !hasAuthoredFlightPhases,
            gaitStartDistanceCells: introDistanceCells ?? 0,
            elapsedMs: 0,
            // Visual cadence only: movement interpolation keeps its original duration.
            durationPerFrameMs: baseDurationPerFrameMs,
            frameDurationsMs:
                config.meta.frameDurationsMs?.length === frames.length ? config.meta.frameDurationsMs : undefined,
            flightFrameDurationMs: hasAuthoredFlightPhases ? baseDurationPerFrameMs / flightSpeedMultiplier : undefined,
            outroFrameDurationMs: hasAuthoredFlightPhases ? baseDurationPerFrameMs / landingSpeedMultiplier : undefined,
            completedCycles: 0,
            finishAfterCycle: false,
            distanceDriven: true,
        };
        // Swap source resolution and anchor in the same tick as the texture. An older idle atlas
        // can use 192px cells while the detailed walk uses 768px cells.
        if (
            props.name === ORC_UNIT_NAME ||
            props.name === MERMAID_UNIT_NAME ||
            centaurLabWalk ||
            leprechaunLabWalk ||
            dryadLabWalk ||
            medusaLabWalk ||
            (props.name === "Elf" && this.creatureAnimationLabPreviewEnabled) ||
            battleMageLabWalk
        ) {
            const transitionScale =
                (this.sprite.texture.height / frames[0].height) *
                (centaurLabWalk ? centaurLabWalkScale(0) / previousCentaurLabScale : 1);
            this.sprite.scale.set(this.sprite.scale.x * transitionScale, this.sprite.scale.y * transitionScale);
            this.sprite.anchor.set(0.5, this.walkAnim.footAnchorY);
        }
        // Match the smaller walk silhouette to idle immediately, before the next ensureVisual pass. This
        // closes the one-render-tick transition gap that can otherwise expose the raw atlas envelope.
        if (props.name === "Berserker") {
            const transitionScale =
                (this.sprite.texture.height / frames[0].height) *
                (wasBerserkerWalking ? 1 : BERSERKER_WALK_VISIBLE_SCALE_MULTIPLIER / this.berserkerLabIdleScale());
            this.sprite.scale.set(this.sprite.scale.x * transitionScale, this.sprite.scale.y * transitionScale);
            this.sprite.anchor.set(0.5, this.walkAnim.footAnchorY);
        }
        if (props.name === SQUIRE_UNIT_NAME && !wasSquireWalking) {
            this.sprite.scale.set(
                this.sprite.scale.x * SQUIRE_WALK_VISIBLE_SCALE_MULTIPLIER,
                this.sprite.scale.y * SQUIRE_WALK_VISIBLE_SCALE_MULTIPLIER,
            );
        }
        // The original walk uses 192px runtime cells and static idle uses 768px. Apply their size and
        // anchor conversion with the texture swap so no render can expose a quarter-size entry frame.
        if (scavengerPreviousVisibleHeight !== undefined) {
            const transitionScale =
                scavengerPreviousVisibleHeight / (frames[0].height * SCAVENGER_ORIGINAL_WALK_VISIBLE_HEIGHT_RATIO);
            this.sprite.scale.set(this.sprite.scale.x * transitionScale, this.sprite.scale.y * transitionScale);
            this.sprite.anchor.set(0.5, this.walkAnim.footAnchorY);
        }
        if (props.name === ARBALESTER_UNIT_NAME) {
            const transitionScale =
                (this.sprite.texture.height / frames[0].height) *
                (arbalesterWalkScaleMultiplier(0) / previousArbalesterWalkScale);
            this.sprite.scale.set(
                this.sprite.scale.x * transitionScale * (wasArbalesterWalking ? 1 : ARBALESTER_WALK_HORIZONTAL_SCALE),
                this.sprite.scale.y * transitionScale,
            );
            this.sprite.anchor.set(0.5, this.walkAnim.footAnchorY);
        }
        if (valkyrieLabWalk) {
            const scale =
                (this.sprite.texture.height / frames[0].height) * (wasValkyrieLabWalking ? 1 : VALKYRIE_LAB_WALK_SCALE);
            this.sprite.scale.set(this.sprite.scale.x * scale, this.sprite.scale.y * scale);
            this.sprite.anchor.set(VALKYRIE_LAB_WALK_ANCHOR_X, this.walkAnim.footAnchorY);
        }
        if (manticoreLabWalk) {
            // The original 768px combat figure is registered at 630px inside each authored frame.
            const scale =
                (this.sprite.texture.height / frames[0].height) *
                (wasManticoreLabWalking ? 1 : MANTICORE_LAB_WALK_SCALE);
            this.sprite.scale.set(this.sprite.scale.x * scale, this.sprite.scale.y * scale);
            this.sprite.anchor.set(MANTICORE_LAB_WALK_ANCHOR_X, this.walkAnim.footAnchorY);
        }
        if (fairyLabWalk) {
            const scale =
                (this.sprite.texture.height / frames[0].height) * (wasFairyLabWalking ? 1 : FAIRY_LAB_WALK_SCALE);
            this.sprite.scale.set(
                this.sprite.scale.x * scale * (wasFairyLabWalking ? 1 : FAIRY_LAB_WALK_WIDTH_SCALE),
                this.sprite.scale.y * scale,
            );
            this.sprite.anchor.set(0.5, this.walkAnim.footAnchorY);
        }
        if (props.name === "Pikeman" && !wasPikemanWalking) {
            this.sprite.scale.x *= PIKEMAN_WALK_HORIZONTAL_SCALE;
        }
        if (trollLabWalk) {
            const resolutionScale = this.sprite.texture.height / frames[0].height;
            this.sprite.scale.set(
                this.sprite.scale.x * resolutionScale * (wasTrollLabWalking ? 1 : TROLL_LAB_WALK_SCALE_X),
                this.sprite.scale.y * resolutionScale * (wasTrollLabWalking ? 1 : TROLL_LAB_WALK_SCALE_Y),
            );
            this.sprite.anchor.set(0.5, this.walkAnim.footAnchorY);
        }
        if (battleMageLabWalk && !wasBattleMageLabWalking) {
            this.sprite.scale.x *= BATTLE_MAGE_LAB_WALK_WIDTH_SCALE;
        }
        this.sprite.texture = frames[0];
        this.syncCreaturePalette();
        if (props.name === PEASANT_UNIT_NAME && this.battlefieldAlphaHoleFillFilter) {
            const alphaHoleFilter = this.battlefieldAlphaHoleFillFilter;
            this.sprite.filters = (this.sprite.filters ?? []).filter((filter) => filter !== alphaHoleFilter);
            this.battlefieldAlphaHoleFillFilter = undefined;
        }
    }
    /**
     * Repeating locomotion defaults to one cycle per 1.3 travelled cells; the lab Fairy
     * and Valkyrie have their explicitly requested faster cadences.
     * Non-looping turn-in, take-off and landing poses retain their separate timing.
     */
    public setBoardWalkDistanceCells(distanceCells: number): void {
        const anim = this.walkAnim;
        if (!anim || !this.sprite || this.oneShotAnim) return;
        const safeDistance = Number.isFinite(distanceCells) ? Math.max(0, distanceCells) : 0;
        if (!anim.introComplete && anim.introDistanceCells === undefined) {
            anim.gaitStartDistanceCells = safeDistance;
            return;
        }
        if (!anim.introComplete && anim.introDistanceCells !== undefined) {
            const introFrameCount = anim.loopStartFrame;
            if (introFrameCount > 0 && safeDistance < anim.introDistanceCells) {
                const frameDistance = anim.introDistanceCells / introFrameCount;
                anim.frameIndex = Math.min(introFrameCount - 1, Math.floor(safeDistance / frameDistance + 1e-9));
            } else {
                anim.introComplete = true;
                anim.frameIndex = anim.loopStartFrame;
            }
            anim.elapsedMs = 0;
            const texture = anim.frames[anim.frameIndex];
            if (texture) this.sprite.texture = texture;
            if (!anim.introComplete) return;
        }
        if (!anim.distanceDriven) return;
        const gaitFrameCount = anim.loopEndFrame - anim.loopStartFrame + 1;
        if (gaitFrameCount <= 0) return;
        const unitName = this.getUnitProperties().name;
        // Medusa's 0.9 multiplier is the user's explicit 10% cadence reduction;
        // board travel speed and the shared cadence for other creatures stay unchanged.
        const cadenceSpeed = this.creatureAnimationLabPreviewEnabled
            ? unitName === "Fairy"
                ? FAIRY_LAB_WALK_SPEED
                : unitName === "Valkyrie"
                  ? VALKYRIE_LAB_FLIGHT_SPEED
                  : unitName === "Medusa"
                    ? 0.9
                    : 1
            : 1;
        const frameDistance = CREATURE_WALK_CYCLE_DISTANCE_CELLS / cadenceSpeed / gaitFrameCount;
        const gaitDistance = Math.max(0, safeDistance - anim.gaitStartDistanceCells);
        anim.gaitDistanceCells = gaitDistance;
        const absoluteGaitFrame = Math.floor(gaitDistance / frameDistance + 1e-9);
        const previousArbalesterWalkScale =
            unitName === ARBALESTER_UNIT_NAME ? arbalesterWalkScaleMultiplier(anim.frameIndex) : 1;
        const centaurLabWalk = unitName === CENTAUR_UNIT_NAME && this.creatureAnimationLabPreviewEnabled;
        const previousCentaurLabScale = centaurLabWalk ? centaurLabWalkScale(anim.frameIndex) : 1;
        anim.completedCycles = Math.floor(absoluteGaitFrame / gaitFrameCount);
        anim.frameIndex = anim.loopStartFrame + (absoluteGaitFrame % gaitFrameCount);
        anim.elapsedMs = 0;
        if (centaurLabWalk) {
            const frameScale = centaurLabWalkScale(anim.frameIndex) / previousCentaurLabScale;
            this.sprite.scale.set(this.sprite.scale.x * frameScale, this.sprite.scale.y * frameScale);
        }
        if (unitName === ARBALESTER_UNIT_NAME) {
            const frameScale = arbalesterWalkScaleMultiplier(anim.frameIndex) / previousArbalesterWalkScale;
            this.sprite.scale.set(this.sprite.scale.x * frameScale, this.sprite.scale.y * frameScale);
            anim.footAnchorY = arbalesterWalkFootAnchorY(anim.frameIndex);
            this.sprite.anchor.y = anim.footAnchorY;
        }
        const texture = anim.frames[anim.frameIndex];
        if (texture) this.sprite.texture = texture;
        this.syncCreaturePalette();
    }
    /** Keep an authored Wolf action, its ground registration and silhouette in the same render tick. */
    private syncWolfActionRegistration(state: string | undefined, frameIndex: number): void {
        if (!this.sprite) return;
        const factor = wolfReactionFrameScale(state, frameIndex);
        const ratio = factor / this.wolfRenderedReactionScale;
        if (ratio !== 1) {
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
        }
        this.wolfRenderedReactionScale = factor;
        if (state || this.wolfReactionRegistrationActive) {
            const anchorY = state
                ? isWolfSpriteAttack(state)
                    ? (this.oneShotAnim?.footAnchorY ?? 858 / 1024)
                    : wolfReactionFootAnchorY(factor)
                : (this.walkAnim?.footAnchorY ?? this.oneShotAnim?.footAnchorY ?? this.selectionAnimFootAnchorY);
            this.sprite.anchor.set(0.5, anchorY);
            const shadowRatio = factor / this.wolfShadowReactionScale;
            const previousShadowScaleY = this.silhouetteShadow?.scale.y;
            const shadowScaleX =
                this.wolfShadowProjectionScaleX === undefined
                    ? (this.silhouetteShadow?.scale.x ?? 0) * shadowRatio
                    : this.sprite.scale.x * this.wolfShadowProjectionScaleX;
            const shadowScaleY =
                this.wolfShadowProjectionScaleY === undefined
                    ? (previousShadowScaleY ?? 0) * shadowRatio
                    : Math.abs(this.sprite.scale.y) * this.wolfShadowProjectionScaleY;
            const segmentScaleRatioY = previousShadowScaleY ? shadowScaleY / previousShadowScaleY : shadowRatio;
            const texture =
                !state && !this.walkAnim && !this.oneShotAnim
                    ? (this.selectionAnimFrames?.[0] ?? this.sprite.texture)
                    : this.sprite.texture;
            if (this.silhouetteShadow) {
                this.silhouetteShadow.texture = texture;
                this.silhouetteShadow.anchor.copyFrom(this.sprite.anchor);
                this.silhouetteShadow.scale.set(shadowScaleX, shadowScaleY);
            }
            if (this.silhouetteShadowSegments.length) {
                const textures = battlefieldShadowSegmentTextures(texture);
                for (let index = 0; index < this.silhouetteShadowSegments.length; index++) {
                    const segment = this.silhouetteShadowSegments[index];
                    segment.texture = textures[index];
                    segment.anchor.set(BATTLEFIELD_SHADOW_SEGMENT_COUNT * 0.5 - index, anchorY);
                    segment.scale.set(shadowScaleX, segment.scale.y * segmentScaleRatioY);
                }
            }
        }
        this.wolfShadowReactionScale = factor;
        this.wolfReactionRegistrationActive = !!state;
    }
    /** Extend the authored bite through the whole body while keeping all paw contacts fixed. */
    private syncWolfAttackReach(): void {
        if (!this.sprite || this.getName() !== WOLF_UNIT_NAME) return;
        const anim = !this.walkAnim ? this.oneShotAnim : undefined;
        let elapsedMs = anim?.elapsed ?? 0;
        if (anim) {
            for (let index = 0; index < anim.frameIndex; index++) {
                elapsedMs += anim.frameDurationsMs?.[index] ?? anim.durationPerFrame;
            }
        }
        const state = anim?.stateName;
        const texture = this.sprite.texture;
        syncWolfAttackReachVisuals(this.sprite, state, elapsedMs, texture);
        if (this.silhouetteShadow) {
            syncWolfAttackReachVisuals(this.silhouetteShadow, state, elapsedMs, texture);
        }
        this.silhouetteShadowSegments.forEach((segment, index) => {
            syncWolfAttackReachVisuals(segment, state, elapsedMs, texture, index, BATTLEFIELD_SHADOW_SEGMENT_COUNT);
        });
    }
    private syncCreaturePalette(now = performance.now(), valkyrieScaleWasReset = false): void {
        if (this.sprite && this.getName() === "Manticore") {
            const deathOpening = this.oneShotAnim?.stateName === "death" && this.oneShotAnim.frameIndex === 0;
            const attackEye = manticoreLabAttackEye(this.oneShotAnim?.stateName, this.oneShotAnim?.frameIndex ?? -1);
            syncManticoreLabIdle(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled &&
                    !this.walkAnim &&
                    (!this.oneShotAnim || deathOpening || !!attackEye) &&
                    !this.spawnAnim &&
                    !this.isDead(),
                deathOpening ? this.oneShotAnim!.elapsed : now - this.selectionAnimationStartedAtMs,
                1,
                deathOpening,
                attackEye,
            );
            syncManticoreLabWalkPalette(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled ? (this.walkAnim?.frameIndex ?? -1) : -1,
            );
            syncManticoreLabPoseCalibration(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled ? (this.walkAnim?.frameIndex ?? -1) : -1,
                this.creatureAnimationLabPreviewEnabled && this.oneShotAnim?.stateName === "death"
                    ? this.oneShotAnim.frameIndex
                    : -1,
            );
        }
        if (this.sprite && this.getName() === "White Tiger") {
            syncWhiteTigerIdleTail(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled &&
                    !this.walkAnim &&
                    !this.oneShotAnim &&
                    !this.spawnAnim &&
                    !this.isDead(),
                now,
            );
            syncWhiteTigerLabWalk(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled ? (this.walkAnim?.frameIndex ?? -1) : -1,
                valkyrieScaleWasReset,
            );
        }
        if (this.sprite && this.getName() === "Valkyrie") {
            syncValkyrieLabIdle(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled &&
                    !this.walkAnim &&
                    !this.oneShotAnim &&
                    !this.spawnAnim &&
                    !this.isDead(),
                now - this.selectionAnimationStartedAtMs,
            );
            syncValkyrieLabWalk(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled && this.walkAnim ? this.walkAnim.frameIndex : -1,
                valkyrieScaleWasReset,
            );
            syncValkyrieLabReaction(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled ? this.oneShotAnim?.stateName : undefined,
                this.oneShotAnim?.frameIndex ?? -1,
                valkyrieScaleWasReset,
            );
        }
        if (this.sprite && this.getName() === "Pikeman") {
            syncPikemanLabIdle(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled &&
                    !this.walkAnim &&
                    !this.oneShotAnim &&
                    !this.spawnAnim &&
                    !this.isDead(),
                now - this.selectionAnimationStartedAtMs,
                this.creatureAnimationLabPreviewEnabled && "pikeman_lab_idle_atlas" in images
                    ? this.texResolver("pikeman_lab_idle_atlas" as ImageKey)
                    : undefined,
            );
        }
        if (this.sprite && this.getName() === TROLL_UNIT_NAME) {
            syncTrollLabWalkPalette(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled && this.walkAnim ? this.walkAnim.frameIndex : -1,
                this.creatureAnimationLabPreviewEnabled &&
                    ((!this.walkAnim &&
                        !this.oneShotAnim &&
                        !this.spawnAnim &&
                        !this.isDead() &&
                        this.selectionAnimFrames?.includes(this.sprite.texture) === true) ||
                        isTrollLabAttackGuard(this.oneShotAnim?.stateName, this.oneShotAnim?.frameIndex ?? -1) ||
                        isTrollLabCastGuard(this.oneShotAnim?.stateName, this.oneShotAnim?.frameIndex ?? -1)),
            );
            syncTrollLabAttack(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled ? this.oneShotAnim?.stateName : undefined,
                this.oneShotAnim?.frameIndex ?? -1,
                valkyrieScaleWasReset,
            );
            syncTrollLabCastGlow(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled ? this.oneShotAnim?.stateName : undefined,
                this.oneShotAnim?.frameIndex ?? -1,
                this.oneShotAnim?.elapsed ?? 0,
                this.oneShotAnim?.frameDurationsMs?.[this.oneShotAnim.frameIndex] ?? 1,
            );
            syncTrollLabCastMatch(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled ? this.oneShotAnim?.stateName : undefined,
                this.oneShotAnim?.frameIndex ?? -1,
            );
        }
        if (this.sprite && this.getName() === "Elf") {
            syncElfIdleCape(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled &&
                    !this.walkAnim &&
                    !this.oneShotAnim &&
                    !this.spawnAnim &&
                    !this.isDead(),
                now,
            );
        }
        if (this.sprite && this.getName() === "Battle Mage") {
            syncBattleMageLabIdle(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled &&
                    !this.walkAnim &&
                    !this.oneShotAnim &&
                    !this.spawnAnim &&
                    !this.isDead(),
                now - this.selectionAnimationStartedAtMs,
            );
            const reaction = this.creatureAnimationLabPreviewEnabled ? this.oneShotAnim : undefined;
            const state = reaction?.stateName;
            syncBattleMageLabReaction(
                this.sprite,
                reaction?.frames.length === 1 && (state === "hit" || state === "death") ? state : undefined,
                reaction?.finished ? BATTLE_MAGE_REACTION_DURATION_MS.death : (reaction?.elapsed ?? 0),
            );
        }
        if (this.sprite && this.getName() === "Healer") {
            syncHealerLabWalkPalette(this.sprite, this.creatureAnimationLabPreviewEnabled && !!this.walkAnim);
        }
        if (this.sprite && this.getName() === WANDERING_MAGE_UNIT_NAME) {
            syncWanderingMageIdleFire(
                this.sprite,
                creatureIdleAnimationEnabledForUnit(WANDERING_MAGE_UNIT_NAME) &&
                    !this.walkAnim &&
                    !this.oneShotAnim &&
                    !this.spawnAnim &&
                    !this.isDead()
                    ? this.selectionAnimFrameIndex
                    : -1,
                now + this.refreshedIdlePhaseRatio * 2000,
                this.selectionAnimFrames ?? [],
            );
        }
        if (this.sprite && this.getName() === SQUIRE_UNIT_NAME) {
            syncSquireIdlePlume(
                this.sprite,
                creatureIdleAnimationEnabledForUnit(SQUIRE_UNIT_NAME) &&
                    this.idleAnimationStateAvailable &&
                    !this.walkAnim &&
                    !this.oneShotAnim &&
                    !this.spawnAnim &&
                    !this.isDead(),
                now + this.refreshedIdlePhaseRatio * SQUIRE_PLUME_PERIOD_MS,
            );
        }
        if (this.sprite && this.getName() === DRYAD_UNIT_NAME) {
            syncDryadLabIdle(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled &&
                    !this.walkAnim &&
                    !this.oneShotAnim &&
                    !this.spawnAnim &&
                    !this.isDead(),
                now - this.selectionAnimationStartedAtMs,
            );
        }
        if (this.sprite && this.getName() === LEPRECHAUN_UNIT_NAME) {
            const walk = this.creatureAnimationLabPreviewEnabled ? this.walkAnim : undefined;
            const reaction =
                this.creatureAnimationLabPreviewEnabled &&
                ["hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"].includes(
                    this.oneShotAnim?.stateName ?? "",
                );
            syncLeprechaunLabWalkVisuals(
                this.sprite,
                walk?.frameIndex ?? -1,
                walk?.gaitDistanceCells ?? 0,
                walk?.frames ?? [],
                !this.walkAnim && (!this.oneShotAnim || reaction),
                this.creatureAnimationLabPreviewEnabled && !this.oneShotAnim && !this.spawnAnim && !this.isDead()
                    ? now - this.selectionAnimationStartedAtMs
                    : -1,
                this.creatureAnimationLabPreviewEnabled ? this.texResolver("leprechaun_lab_idle_atlas") : undefined,
                reaction && this.oneShotAnim?.stateName === "hit" ? this.oneShotAnim.frameIndex : -1,
            );
        }
        if (this.sprite && this.getName() === "Fairy") {
            syncFairyLabReaction(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled ? this.oneShotAnim?.stateName : undefined,
                this.oneShotAnim?.frameIndex ?? -1,
            );
            syncFairyLabIdle(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled && !this.walkAnim && !this.oneShotAnim && !this.spawnAnim,
                now - this.selectionAnimationStartedAtMs,
            );
            syncFairyLabWalkColor(this.sprite, this.creatureAnimationLabPreviewEnabled && !!this.walkAnim);
            syncFairyLabHead(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled ? (this.walkAnim?.frameIndex ?? -1) : -1,
            );
            syncFairyLabSurface(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled,
                this.oneShotAnim?.stateName ?? (this.walkAnim ? "walk" : "idle"),
                this.oneShotAnim
                    ? fairyLabAttackElapsed(
                          this.oneShotAnim.frameIndex,
                          this.oneShotAnim.elapsed,
                          this.oneShotAnim.frameDurationsMs ?? [],
                      )
                    : 0,
                this.oneShotAnim?.frameIndex ?? this.walkAnim?.frameIndex ?? this.selectionAnimFrameIndex,
            );
        }
        if (this.sprite && this.getName() === "Berserker") {
            syncBerserkerIdleVisuals(
                this.sprite,
                this.berserkerLabIdleScale() !== 1 && !this.walkAnim && !this.oneShotAnim
                    ? this.selectionAnimFrameIndex
                    : -1,
                now - this.selectionAnimationStartedAtMs,
                this.selectionAnimFrameDurationsMs ?? [],
            );
        }
        if (this.sprite && this.getName() === ARBALESTER_UNIT_NAME) {
            syncArbalesterAppearance(
                this.sprite,
                this.walkAnim ? "walk" : (this.oneShotAnim?.stateName ?? "idle"),
                this.walkAnim?.frameIndex ?? this.oneShotAnim?.frameIndex ?? 0,
                this.texResolver("arbalester_walk_head_opacity_mask_v2") ?? Texture.EMPTY,
            );
        }
        if (this.sprite && this.getUnitProperties().name === CENTAUR_UNIT_NAME) {
            syncCentaurLabIdleWind(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled &&
                    !this.walkAnim &&
                    !this.oneShotAnim &&
                    !this.spawnAnim &&
                    !this.isDead(),
                now - this.selectionAnimationStartedAtMs,
            );
            syncCentaurLabWalkColor(this.sprite, this.creatureAnimationLabPreviewEnabled && !!this.walkAnim);
            syncCentaurLabMeleePalette(
                this.sprite,
                this.creatureAnimationLabPreviewEnabled ? this.oneShotAnim?.stateName : undefined,
                this.oneShotAnim?.frameIndex ?? -1,
            );
        }
        if (this.sprite && this.getUnitProperties().name === WOLF_UNIT_NAME) {
            syncWolfIdleVisuals(
                this.sprite,
                !this.walkAnim && !this.oneShotAnim ? this.selectionAnimFrameIndex : -1,
                now - this.selectionAnimationStartedAtMs,
                this.selectionAnimFrameDurationsMs ?? [],
                this.selectionAnimFrames ?? [],
            );
            const state = !this.walkAnim ? this.oneShotAnim?.stateName : undefined;
            const reaction = state === "hit" || state === "death" ? state : undefined;
            const frameIndex = this.oneShotAnim?.frameIndex ?? -1;
            this.syncWolfActionRegistration(isWolfAuthoredAction(state) ? state : undefined, frameIndex);
            syncWolfReactionVisuals(this.sprite, reaction, frameIndex);
            this.syncWolfAttackReach();
        }
        if (this.sprite && this.getUnitProperties().name === SCAVENGER_UNIT_NAME) {
            syncScavengerHitColorFilter(
                this.sprite,
                this.scavengerLabAnimationsEnabled && this.oneShotAnim?.stateName === "hit"
                    ? this.oneShotAnim.frameIndex
                    : -1,
            );
            syncScavengerIdleColorFilter(
                this.sprite,
                this.scavengerLabAnimationsEnabled && !this.walkAnim && !this.oneShotAnim,
            );
        }
        if (!this.sprite || this.getUnitProperties().name !== BLACKSMITH_UNIT_NAME) return;
        const frameIndex = this.oneShotAnim ? -1 : (this.walkAnim?.frames.indexOf(this.sprite.texture) ?? -1);
        syncBlacksmithWalkColorFilter(this.sprite, frameIndex);
    }
    /** Update facing at path corners without restarting the footstep cycle. */
    public setBoardFacingFromMovement(horizontalDirection: number): void {
        if (!this.hasAnimationState("walk") || Math.abs(horizontalDirection) < 0.001) return;
        this.setBoardFacing(horizontalDirection);
    }
    /** Force a side-facing board model toward one horizontal side, including static/revealed models. */
    public setBoardFacing(horizontalDirection: number): void {
        if (Math.abs(horizontalDirection) < 0.001) return;
        this.facingDirection = horizontalDirection < 0 ? -1 : 1;
    }
    /** Turn the authored side-view model toward the unit/cell it is interacting with. */
    public faceBoardTarget(target: HoCMath.XY): void {
        this.setBoardFacingFromMovement(target.x - this.getPosition().x);
    }
    /** Pick the matching ranged/melee authored strike from the attacker's row relative to the target footprint. */
    public getAttackAnimationStateForTarget(
        target: HoCMath.XY,
        attackKind: "range" | "melee" = "range",
        targetCells: readonly HoCMath.XY[] = [],
    ): string {
        const origin = this.getPosition();
        const dy = target.y - origin.y;
        const prefix =
            (attackKind === "melee" || this.getName() === BLACKSMITH_UNIT_NAME) &&
            this.hasAnimationState("melee_attack")
                ? "melee_attack"
                : "attack";
        const footprintBand = attackAnimationVerticalBandForFootprints(this.getCells(), targetCells);
        // Position fallback keeps callers without hydrated cell footprints correct: world/grid Y grows upward,
        // so a lower target needs the downward strike and a higher target needs the upward strike.
        const verticalBand = footprintBand ?? (Math.abs(dy) <= 1 ? "side" : dy < 0 ? "down" : "up");
        if (verticalBand !== "side") {
            const directionalState = `${prefix}_${verticalBand}`;
            if (this.hasAnimationState(directionalState)) {
                return directionalState;
            }
        }
        return prefix;
    }
    private restoreWidthAfterBoardWalk(): void {
        if (
            this.getName() === "Battle Mage" &&
            this.creatureAnimationLabPreviewEnabled &&
            this.walkAnim &&
            this.sprite
        ) {
            this.sprite.scale.x /= BATTLE_MAGE_LAB_WALK_WIDTH_SCALE;
        }
        if (
            this.getName() === TROLL_UNIT_NAME &&
            this.creatureAnimationLabPreviewEnabled &&
            this.walkAnim &&
            this.sprite
        ) {
            this.sprite.scale.set(
                this.sprite.scale.x / TROLL_LAB_WALK_SCALE_X,
                this.sprite.scale.y / TROLL_LAB_WALK_SCALE_Y,
            );
        }
        if (this.getName() === "Pikeman" && this.walkAnim && this.sprite) {
            this.sprite.scale.x /= PIKEMAN_WALK_HORIZONTAL_SCALE;
        }
        if (this.getName() === ARBALESTER_UNIT_NAME && this.walkAnim && this.sprite) {
            this.sprite.scale.x /= ARBALESTER_WALK_HORIZONTAL_SCALE;
        }
    }
    private restoreScaleAfterSquireWalk(): void {
        if (this.getUnitProperties().name !== SQUIRE_UNIT_NAME || !this.walkAnim || !this.sprite) return;
        this.sprite.scale.set(
            this.sprite.scale.x / SQUIRE_WALK_VISIBLE_SCALE_MULTIPLIER,
            this.sprite.scale.y / SQUIRE_WALK_VISIBLE_SCALE_MULTIPLIER,
        );
    }
    public stopBoardWalkAnimation(): void {
        this.movementBadgeOffsetY = undefined;
        if (!this.walkAnim) return;
        if (this.sprite && this.getName() === "Valkyrie") syncValkyrieLabWalk(this.sprite, -1);
        if (this.sprite && this.getName() === "Manticore") syncManticoreLabWalkPalette(this.sprite, -1);
        const manticoreLabWalkHeight =
            this.getName() === "Manticore" && this.creatureAnimationLabPreviewEnabled && this.sprite
                ? this.sprite.texture.height / MANTICORE_LAB_WALK_SCALE
                : undefined;
        const valkyrieLabWalkHeight =
            this.getName() === "Valkyrie" && this.creatureAnimationLabPreviewEnabled && this.sprite
                ? this.sprite.texture.height / VALKYRIE_LAB_WALK_SCALE
                : undefined;
        const fairyLabWalkHeight =
            this.getName() === "Fairy" && this.creatureAnimationLabPreviewEnabled && this.sprite
                ? this.sprite.texture.height / FAIRY_LAB_WALK_SCALE
                : undefined;
        const berserkerWalkHeight =
            this.getUnitProperties().name === "Berserker" ? this.sprite?.texture.height : undefined;
        const onOutroComplete = this.walkAnim.onOutroComplete;
        const centaurLabWalkHeight =
            this.getUnitProperties().name === CENTAUR_UNIT_NAME &&
            this.creatureAnimationLabPreviewEnabled &&
            this.sprite
                ? this.sprite.texture.height / centaurLabWalkScale(this.walkAnim.frameIndex)
                : undefined;
        const constantScaleLabWalkHeight =
            (this.getUnitProperties().name === TROLL_UNIT_NAME ||
                this.getUnitProperties().name === LEPRECHAUN_UNIT_NAME ||
                this.getUnitProperties().name === DRYAD_UNIT_NAME ||
                this.getUnitProperties().name === "Elf" ||
                this.getUnitProperties().name === "Battle Mage") &&
            this.creatureAnimationLabPreviewEnabled
                ? this.sprite?.texture.height
                : undefined;
        const orcWalkHeight =
            this.getUnitProperties().name === ORC_UNIT_NAME || this.getUnitProperties().name === MERMAID_UNIT_NAME
                ? this.sprite?.texture.height
                : undefined;
        const arbalesterWalkHeight =
            this.getUnitProperties().name === ARBALESTER_UNIT_NAME && this.sprite
                ? this.sprite.texture.height / arbalesterWalkScaleMultiplier(this.walkAnim.frameIndex)
                : undefined;
        const scavengerWalkVisibleHeight =
            this.getUnitProperties().name === SCAVENGER_UNIT_NAME && this.sprite
                ? this.sprite.texture.height * SCAVENGER_ORIGINAL_WALK_VISIBLE_HEIGHT_RATIO
                : undefined;
        this.restoreScaleAfterSquireWalk();
        this.restoreWidthAfterBoardWalk();
        this.walkAnim = undefined;
        this.selectionAnimationStartedAtMs = performance.now() - this.medusaIdleResumeOffsetMs();
        if (this.sprite && this.getName() === LEPRECHAUN_UNIT_NAME) {
            syncLeprechaunLabWalkVisuals(this.sprite, -1, 0, []);
        }
        this.selectionAnimFrameIndex = -1;
        // Restore the permanent breathing/fire cycle immediately at the landing position.
        this.stepSelectionAnimation();
        const labWalkHeight = centaurLabWalkHeight ?? constantScaleLabWalkHeight;
        if (labWalkHeight !== undefined && this.sprite) {
            const idleTexture = this.selectionAnimFrames?.[0] ?? this.resolveBaseTexture();
            if (idleTexture) {
                this.sprite.texture = idleTexture;
                const transitionScale = labWalkHeight / idleTexture.height;
                this.sprite.scale.set(this.sprite.scale.x * transitionScale, this.sprite.scale.y * transitionScale);
                this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
            }
        }
        if (orcWalkHeight !== undefined && this.sprite) {
            const transitionScale = orcWalkHeight / this.sprite.texture.height;
            this.sprite.scale.set(this.sprite.scale.x * transitionScale, this.sprite.scale.y * transitionScale);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (berserkerWalkHeight !== undefined && this.sprite) {
            const idleTexture = this.selectionAnimFrames?.[0] ?? this.resolveBaseTexture();
            if (idleTexture) {
                this.sprite.texture = idleTexture;
                const transitionScale =
                    (berserkerWalkHeight / idleTexture.height / BERSERKER_WALK_VISIBLE_SCALE_MULTIPLIER) *
                    this.berserkerLabIdleScale();
                this.sprite.scale.set(this.sprite.scale.x * transitionScale, this.sprite.scale.y * transitionScale);
                this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
            }
        }
        if (arbalesterWalkHeight !== undefined && this.sprite) {
            const transitionScale =
                (arbalesterWalkHeight / this.sprite.texture.height) * this.arbalesterLabScaleMultiplier();
            this.sprite.scale.set(this.sprite.scale.x * transitionScale, this.sprite.scale.y * transitionScale);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        // Playback advances after visual synchronization. Restore the static scale in this same tick,
        // otherwise its four-times-larger source would flash for a frame before the next sync.
        if (scavengerWalkVisibleHeight !== undefined && this.sprite) {
            const transitionScale =
                scavengerWalkVisibleHeight /
                (this.sprite.texture.height *
                    (this.scavengerLabAnimationsEnabled
                        ? SCAVENGER_LAB_VISIBLE_HEIGHT_RATIO
                        : THIEF_IDLE_VISIBLE_HEIGHT_RATIO));
            this.sprite.scale.set(this.sprite.scale.x * transitionScale, this.sprite.scale.y * transitionScale);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (manticoreLabWalkHeight !== undefined && this.sprite) {
            const idle = this.selectionAnimFrames?.[0] ?? this.resolveBaseTexture();
            if (idle) {
                this.sprite.texture = idle;
                const scale = manticoreLabWalkHeight / idle.height;
                this.sprite.scale.set(this.sprite.scale.x * scale, this.sprite.scale.y * scale);
                this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
                this.selectionAnimationStartedAtMs = performance.now();
                this.syncCreaturePalette();
            }
        }
        if (valkyrieLabWalkHeight !== undefined && this.sprite) {
            const idle = this.selectionAnimFrames?.[0] ?? this.resolveBaseTexture();
            if (idle) {
                this.sprite.texture = idle;
                const scale = valkyrieLabWalkHeight / idle.height;
                this.sprite.scale.set(this.sprite.scale.x * scale, this.sprite.scale.y * scale);
                this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
            }
        }
        if (fairyLabWalkHeight !== undefined && this.sprite) {
            const idle = this.selectionAnimFrames?.[0] ?? this.resolveBaseTexture();
            if (idle) {
                this.sprite.texture = idle;
                const scale = fairyLabWalkHeight / idle.height;
                this.sprite.scale.set(
                    (this.sprite.scale.x * scale) / FAIRY_LAB_WALK_WIDTH_SCALE,
                    this.sprite.scale.y * scale,
                );
                this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
            }
            syncFairyLabWalkColor(this.sprite, false);
            syncFairyLabHead(this.sprite, -1);
        }
        if (this.getName() === LEPRECHAUN_UNIT_NAME) this.syncCreaturePalette();
        if (onOutroComplete) onOutroComplete();
    }
    /**
     * Let a short move finish all authored footstep poses without extending the unit's actual travel.
     * The unit may complete the remaining frames at its destination; actions still interrupt this tail.
     */
    public finishBoardWalkAnimationAfterFullCycle(onLandingComplete?: () => void): boolean {
        const anim = this.walkAnim;
        if (!anim) {
            this.movementBadgeOffsetY = undefined;
            return false;
        }
        const startOutro = (): boolean => {
            const outroFrame = anim.outroFrame;
            if (outroFrame === undefined) return false;
            anim.frameIndex = outroFrame;
            anim.elapsedMs = 0;
            const texture = anim.frames[outroFrame];
            if (texture && this.sprite) this.sprite.texture = texture;
            if (
                this.creatureAnimationLabPreviewEnabled &&
                (this.getName() === "Fairy" || this.getName() === "Valkyrie" || this.getName() === "Manticore")
            )
                this.syncCreaturePalette();
            return true;
        };
        // A multi-frame landing is a destination-only phase. Start it immediately when travel ends,
        // even if a very short route completed before the take-off span or a full flight loop.
        if (anim.outroEndFrame !== undefined) {
            anim.introComplete = true;
            anim.onOutroComplete = onLandingComplete;
            if (!startOutro()) {
                this.stopBoardWalkAnimation();
                return false;
            }
            return onLandingComplete !== undefined;
        }
        if (anim.distanceDriven) {
            if (!startOutro()) this.stopBoardWalkAnimation();
            return false;
        }
        if (anim.completedCycles > 0) {
            if (!startOutro()) this.stopBoardWalkAnimation();
            return false;
        }
        anim.finishAfterCycle = true;
        return false;
    }
    private stepBoardWalkAnimation(dtMs: number): void {
        const anim = this.walkAnim;
        if (!anim || !this.sprite || this.oneShotAnim) return;
        if (!anim.introComplete && anim.introDistanceCells !== undefined) return;
        const outroStartFrame = anim.outroFrame;
        const outroEndFrame = anim.outroEndFrame ?? outroStartFrame;
        const isInOutro =
            outroStartFrame !== undefined &&
            outroEndFrame !== undefined &&
            anim.frameIndex >= outroStartFrame &&
            anim.frameIndex <= outroEndFrame;
        if (anim.distanceDriven && anim.introComplete && !isInOutro) return;
        const authoredFrameDurationMs = anim.frameDurationsMs?.[anim.frameIndex];
        const phaseFrameDurationMs =
            typeof authoredFrameDurationMs === "number" && authoredFrameDurationMs > 0
                ? authoredFrameDurationMs
                : isInOutro
                  ? (anim.outroFrameDurationMs ?? anim.durationPerFrameMs)
                  : (anim.flightFrameDurationMs ?? anim.durationPerFrameMs);
        anim.elapsedMs += dtMs;
        if (anim.elapsedMs < phaseFrameDurationMs) return;
        // Advance at most one authored pose per render tick. A delayed frame can slow the cycle,
        // but it must never skip a leg pose and turn a walk back into a sliding sprite.
        anim.elapsedMs -= phaseFrameDurationMs;
        // An authored outro advances once through its reserved frames, then idle breathing resumes.
        // It is never allowed to enter the repeating gait, keeping landing unique to movement finish.
        if (isInOutro) {
            if (outroEndFrame === undefined || anim.frameIndex >= outroEndFrame) {
                this.stopBoardWalkAnimation();
                return;
            }
            anim.frameIndex += 1;
            const texture = anim.frames[anim.frameIndex];
            if (texture) this.sprite.texture = texture;
            if (this.getName() === "Manticore") this.syncCreaturePalette();
            return;
        }
        const reachedCycleEnd = anim.frameIndex >= anim.loopEndFrame;
        const nextFrame = reachedCycleEnd ? anim.loopStartFrame : anim.frameIndex + 1;
        if (reachedCycleEnd) {
            anim.completedCycles += 1;
            if (anim.finishAfterCycle) {
                const outroFrame = anim.outroFrame;
                if (outroFrame === undefined) {
                    this.stopBoardWalkAnimation();
                    return;
                }
                anim.frameIndex = outroFrame;
                anim.elapsedMs = 0;
                const texture = anim.frames[outroFrame];
                if (texture) this.sprite.texture = texture;
                if (this.getName() === "Manticore") this.syncCreaturePalette();
                return;
            }
        }
        anim.frameIndex = nextFrame;
        if (nextFrame >= anim.loopStartFrame) anim.introComplete = true;
        const texture = anim.frames[nextFrame];
        if (texture) this.sprite.texture = texture;
        if (this.getName() === "Manticore") this.syncCreaturePalette();
    }
    public stepSpawnAnimation(dt: number): void {
        const mayChangeSpriteBounds = !!this.spawnAnim || !!this.walkAnim || !!this.oneShotAnim;
        // --- Spawn animation ---
        if (this.spawnAnim && this.sprite && this.shadow && this.sprite.parent && dt) {
            const anim = this.spawnAnim;
            anim.elapsed += dt;
            const rawT = anim.elapsed / anim.duration;
            const t = rawT > 1 ? 1 : rawT;
            const u = 1 - t;
            const e = 1 - u * u * u; // easeOutCubic
            const sx = anim.startScaleX + (anim.endScaleX - anim.startScaleX) * e;
            const sy = anim.startScaleY + (anim.endScaleY - anim.startScaleY) * e;
            this.sprite.scale.set(sx, sy);
            this.sprite.alpha = e;
            this.shadow.scale.set(1);
            const endShadowAlpha = this.hasBuffActive("Hidden") ? 0.08 : this.canFly() ? 0.12 : 0.2;
            this.shadow.alpha = e * endShadowAlpha;
            if (t >= 1) {
                this.sprite.scale.set(anim.endScaleX, anim.endScaleY);
                this.sprite.alpha = 1;
                this.shadow.scale.set(1);
                this.shadow.alpha = endShadowAlpha;
                this.spawnAnim = undefined;
            }
        }
        // ensureVisual() already advances the authored idle/selection frame immediately before this
        // transient-animation pass in the scene loop. Repeating it here used to read the wall clock and
        // resolve the same texture a second time for every creature on every rendered frame.
        // --- Wandering Mage movement animation (takes precedence over idle while active) ---
        // The lab Fairy's one-shot take-off/landing use authored real milliseconds.
        // The scene supplies the legacy 1/240 step at 60 Hz; distance-driven flight
        // ignores this clock. Take-off/landing have an additional user-requested 30%
        // speed-up; the existing flight cadence remains unchanged.
        // The lab simulates at 1/240s per displayed 60Hz frame; authored transitions use wall time.
        const labTransitionTimeScale = this.creatureAnimationLabPreviewEnabled
            ? this.getName() === "Fairy"
                ? 4 * FAIRY_LAB_TRANSITION_SPEED
                : this.getName() === "Valkyrie"
                  ? 4 * VALKYRIE_LAB_TRANSITION_SPEED
                  : this.getName() === "Manticore"
                    ? 4 * 1.35 * 1.15
                    : 1
            : 1;
        this.stepBoardWalkAnimation(dt * 1000 * labTransitionTimeScale);
        // --- One Shot animation ---
        // The fixed simulation loop advances at 60 Hz but deliberately passes the legacy 1/240 step,
        // so dt*1000 represents only one quarter of real elapsed milliseconds. Most older one-shots
        // were tuned around that legacy clock. Approved reactions and authored attacks use real milliseconds
        // and compensate here so their on-screen cadence matches the authored previews.
        const oneShotRealTimeScale =
            this.oneShotAnim?.authoredRealTime ||
            (this.getUnitProperties().name === WANDERING_MAGE_UNIT_NAME &&
                isWanderingMageAuthoredAction(this.oneShotAnim?.stateName)) ||
            (this.getUnitProperties().name === BLACKSMITH_UNIT_NAME &&
                isBlacksmithAuthoredAction(this.oneShotAnim?.stateName)) ||
            (this.getUnitProperties().name === ORC_UNIT_NAME && isOrcAuthoredAction(this.oneShotAnim?.stateName)) ||
            (this.scavengerLabAnimationsEnabled && SCAVENGER_LAB_ACTIONS.includes(this.oneShotAnim?.stateName ?? "")) ||
            (this.oneShotAnim?.stateName === "hit" &&
                (this.getUnitProperties().name === PEASANT_UNIT_NAME ||
                    this.getUnitProperties().name === SQUIRE_UNIT_NAME)) ||
            (this.getUnitProperties().name === SQUIRE_UNIT_NAME && isSquireSpriteAttack(this.oneShotAnim?.stateName)) ||
            (this.getUnitProperties().name === TROGLODYTE_UNIT_NAME &&
                isTroglodyteSpriteAttack(this.oneShotAnim?.stateName))
                ? 4
                : 1;
        this.stepOneShotAnimation(dt * 1000 * oneShotRealTimeScale);
        if (
            this.creatureAnimationLabPreviewEnabled &&
            (this.getName() === "Fairy" || this.getName() === "Valkyrie" || this.getName() === "Manticore")
        )
            this.syncCreaturePalette();
        if (mayChangeSpriteBounds) this.depthSortBoundsAreCurrent = false;
    }
    private stopSelectionAnimationInternal(): void {
        this.arbalesterIdlePager?.dispose();
        this.arbalesterIdlePager = undefined;
        this.selectionAnimFrames = undefined;
        this.orcIdleAxeTwirlFrames = undefined;
        this.orcActiveBattleCryFrames = undefined;
        this.scavengerIdleBladeTwirlFrames = undefined;
        this.scavengerActiveBattleCryFrames = undefined;
        this.selectionAnimTiming = undefined;
        this.selectionAnimFrameDurationMs = 0;
        this.selectionAnimFootAnchorY = 1;
        this.selectionAnimFrameIndex = -1;
        this.isShowingOrcBattleCryFrame = false;
        this.isShowingScavengerFlourishFrame = false;
        // restore original small board texture
        if (this.sprite) {
            const tex = this.resolveBaseTexture();
            if (tex) this.sprite.texture = tex;
        }
    }
    public startSpawnAnimation(_scale: number): void {
        if (!this.sprite || !this.shadow) return;
        const props = this.getUnitProperties();
        const unitName = props.name;
        if (!creatureGenericWholeSpriteMotionEnabledForLevel(props.level)) {
            this.spawnAnim = undefined;
            this.sprite.alpha = 1;
            this.shadow.scale.set(1);
            return;
        }
        const preservesRefreshedFullBodyScale =
            this.hasAnimationState("idle") &&
            unitName !== ORC_UNIT_NAME &&
            unitName !== SCAVENGER_UNIT_NAME &&
            unitName !== THIEF_UNIT_NAME &&
            unitName !== WANDERING_MAGE_UNIT_NAME;
        // Preserve the exact scale already resolved by ensureVisual. Besides authored rectangular models,
        // every unit can now have different X/Y local scales to counter the rectangular board camera.
        const endScaleX = this.sprite.scale.x;
        const endScaleY = this.sprite.scale.y;
        // The Thief/Scavenger is authored at its exact battlefield footprint. Do not apply the legacy
        // 30% oversize drop to refreshed full-body art either: it made every new creature visibly shrink.
        const spawnOversize = unitName === SCAVENGER_UNIT_NAME || preservesRefreshedFullBodyScale ? 1 : 1.3;
        const startScaleX = endScaleX * spawnOversize;
        const startScaleY = endScaleY * spawnOversize;
        this.sprite.scale.set(startScaleX, startScaleY);
        this.sprite.alpha = 0;
        // Shadow anim matches sprite exactly for silhouette effect
        this.shadow.scale.set(1);
        this.shadow.alpha = 0;
        this.spawnAnim = {
            startScaleX,
            startScaleY,
            endScaleX,
            endScaleY,
            elapsed: 0,
            // Drop/settle time when a unit lands on the board (seconds) — kept snappy.
            duration: 0.2,
        };
    }
    /**
     * Returns the geometric center of the unit's footprint in world coordinates.
     * `position` is already that centre for any WxH body — one cell's centre for a 1x1, the shared corner
     * of a 2x2, the middle of the long side for a 2x1 — so nothing here has to reason about the shape.
     */
    public getVisualCenter(gs: GridSettings): HoCMath.XY {
        if (!this.useBattlefieldVisualProjection) return this.getPosition();
        // Combat labels, arrows, projectiles and target highlights must follow the rendered ground
        // point, not the old square-grid coordinate. Prefer the live sprite so editor framing and
        // transient recoil remain visually attached to the creature.
        if (this.sprite) return { x: this.sprite.x, y: this.sprite.y };
        return this.getBattlefieldGroundReference(this.getPosition(), gs);
    }
    public hasPendingDryadRangedShot(): boolean {
        return !!this.dryadRangedShot && !this.dryadRangedShot.signal.aborted;
    }
    public prepareDryadRangedShot(): AbortController | undefined {
        if (
            !this.creatureAnimationLabPreviewEnabled ||
            ![DRYAD_UNIT_NAME, "Elf", "Medusa"].includes(this.getName()) ||
            this.oneShotAnim ||
            this.dryadRangedShot
        )
            return undefined;
        return (this.dryadRangedShot = new AbortController());
    }
    public playDryadRangedShot(state: string, shot: AbortController, onRelease: () => void): boolean {
        if (
            this.dryadRangedShot !== shot ||
            shot.signal.aborted ||
            !["attack", "attack_up", "attack_down"].includes(state)
        )
            return false;
        this.dryadRangedShot = undefined;
        if (!this.playOneShotAnimation(state, undefined, true) || !this.oneShotAnim) {
            shot.abort();
            return false;
        }
        this.dryadRangedShot = shot;
        const unitKey = this.getName() === "Medusa" ? "Medusa Lab" : this.getName() === "Elf" ? "Elf Lab" : "Dryad Lab";
        const meta = animationAtlases[unitKey]?.[state];
        this.oneShotAnim.projectileReleaseFrame =
            typeof meta?.releaseFrameIndex === "number" ? meta.releaseFrameIndex : 3;
        this.oneShotAnim.projectileRelease = onRelease;
        return true;
    }
    public finishDryadRangedShot(shot: AbortController): void {
        if (this.dryadRangedShot === shot) this.dryadRangedShot = undefined;
    }
    private cancelDryadRangedShot(): void {
        const shot = this.dryadRangedShot;
        this.dryadRangedShot = undefined;
        if (shot && this.oneShotAnim) this.oneShotAnim.projectileRelease = undefined;
        shot?.abort();
    }
    public getDryadArrowLength(): number | undefined {
        if (!this.sprite || !this.oneShotAnim || ![DRYAD_UNIT_NAME, "Elf", "Medusa"].includes(this.getName()))
            return undefined;
        const unitKey = this.getName() === "Medusa" ? "Medusa Lab" : this.getName() === "Elf" ? "Elf Lab" : "Dryad Lab";
        const meta = animationAtlases[unitKey]?.[this.oneShotAnim.stateName];
        return typeof meta?.projectileLength === "number"
            ? meta.projectileLength * Math.abs(this.sprite.scale.x)
            : undefined;
    }
    /** Continue the drawn hand/weapon's aim when the lab has no practice target. */
    public getElfLabFreeShotTarget(origin: HoCMath.XY, distance: number): HoCMath.XY | undefined {
        const sprite = this.sprite;
        if (
            !this.creatureAnimationLabPreviewEnabled ||
            !["Elf", "Medusa"].includes(this.getName()) ||
            !this.oneShotAnim ||
            !sprite?.parent
        )
            return undefined;
        const direction = animationAtlases[this.getName() === "Medusa" ? "Medusa Lab" : "Elf Lab"]?.[
            this.oneShotAnim.stateName
        ]?.projectileDirection as HoCMath.XY | undefined;
        if (!direction || !Number.isFinite(direction.x) || !Number.isFinite(direction.y)) return undefined;
        const a = sprite.parent.toLocal(sprite.toGlobal({ x: 0, y: 0 }));
        const b = sprite.parent.toLocal(sprite.toGlobal(direction));
        const dx = b.x - a.x,
            dy = b.y - a.y,
            length = Math.hypot(dx, dy);
        return length > 0
            ? { x: origin.x + (dx / length) * distance, y: origin.y + (dy / length) * distance }
            : undefined;
    }
    /** Reserve the entire lab shot, including texture preparation, so later input can cancel it. */
    public hasPendingArbalesterRangedShot(): boolean {
        return !!this.arbalesterRangedShot && !this.arbalesterRangedShot.signal.aborted;
    }
    public prepareArbalesterRangedShot(): AbortController | undefined {
        if (
            !this.arbalesterLabIdleEnabled ||
            this.getName() !== ARBALESTER_UNIT_NAME ||
            this.oneShotAnim ||
            this.arbalesterRangedShot
        )
            return undefined;
        this.arbalesterRangedShot = new AbortController();
        return this.arbalesterRangedShot;
    }
    public playArbalesterRangedShot(stateName: string, shot: AbortController, onRelease: () => void): boolean {
        if (
            this.arbalesterRangedShot !== shot ||
            shot.signal.aborted ||
            !["attack", "attack_up", "attack_down"].includes(stateName)
        )
            return false;
        // Starting this reserved shot must not cancel its own pending preparation.
        this.arbalesterRangedShot = undefined;
        const started = this.playOneShotAnimation(stateName, undefined, true);
        if (!started || !this.oneShotAnim) {
            shot.abort();
            return false;
        }
        this.arbalesterRangedShot = shot;
        const authoredRelease = animationAtlases.Arbalester?.[stateName]?.releaseFrameIndex;
        this.oneShotAnim.projectileReleaseFrame =
            typeof authoredRelease === "number" &&
            Number.isInteger(authoredRelease) &&
            authoredRelease >= 1 &&
            authoredRelease < this.oneShotAnim.frames.length
                ? authoredRelease
                : Math.min(5, this.oneShotAnim.frames.length - 1);
        this.oneShotAnim.projectileRelease = onRelease;
        return true;
    }
    public finishArbalesterRangedShot(shot: AbortController): void {
        if (this.arbalesterRangedShot === shot) this.arbalesterRangedShot = undefined;
    }
    private cancelArbalesterRangedShot(): void {
        const shot = this.arbalesterRangedShot;
        this.arbalesterRangedShot = undefined;
        if (this.oneShotAnim) this.oneShotAnim.projectileRelease = undefined;
        shot?.abort();
    }
    /** World-space torso anchor for incoming projectiles, independent of the logical aimed cell edge. */
    public getProjectileImpactPoint(gs: GridSettings): HoCMath.XY {
        const sprite = this.sprite;
        if (!sprite?.parent || !sprite.visible) return this.getVisualCenter(gs);
        return sprite.parent.toLocal(
            sprite.toGlobal({
                x: (0.5 - sprite.anchor.x) * sprite.texture.width,
                // Orc actions add transparent canvas above the same idle-sized body. Measuring up
                // from its authored soles keeps hits at the waist in idle and all attack directions.
                y: this.getName() === ORC_UNIT_NAME ? -330 : (0.45 - sprite.anchor.y) * sprite.texture.height,
            }),
        );
    }
    /** Release the lab spear on the first empty-hand pose; interruptions before release cancel it. */
    public playCentaurLabRangedThrow(stateName: string, onRelease: () => void, onCancel: () => void): boolean {
        if (
            !this.creatureAnimationLabPreviewEnabled ||
            this.getName() !== CENTAUR_UNIT_NAME ||
            !["attack", "attack_up", "attack_down"].includes(stateName)
        )
            return false;
        if (!this.playOneShotAnimation(stateName, undefined, true) || !this.oneShotAnim) return false;
        const action = this.oneShotAnim;
        action.projectileReleaseFrame = 3;
        action.orcCancel = onCancel;
        action.projectileRelease = () => {
            action.orcCancel = undefined;
            onRelease();
        };
        return true;
    }
    /** A throw keeps its empty-hand recovery until its own projectile lands. */
    public playOrcRangedThrow(stateName: string, onRelease: () => void, onCancel: () => void): boolean {
        if (this.getName() !== ORC_UNIT_NAME || !isOrcRangedAttack(stateName)) return false;
        if (!this.playOneShotAnimation(stateName, undefined, true) || !this.oneShotAnim) return false;
        this.oneShotAnim.orcRelease = onRelease;
        this.oneShotAnim.orcCancel = onCancel;
        this.oneShotAnim.holdLastFrame = true;
        return true;
    }
    public finishOrcRangedThrow(): void {
        if (this.oneShotAnim?.holdLastFrame && isOrcRangedAttack(this.oneShotAnim.stateName)) {
            this.returnToIdleAnimation();
        }
    }
    public getOrcProjectileAppearance(): { length: number; rotation: number; facing: number } | undefined {
        if (this.getName() !== ORC_UNIT_NAME || !this.sprite) return undefined;
        const state = this.oneShotAnim?.stateName;
        const angle = state === "attack_up" ? -1.1 : state === "attack_down" ? 0.45 : -0.65;
        // Match the visible weapon diameter in the last held frame, before release.
        // Each authored direction has its own perspective; keep this scale fixed throughout flight.
        const sourceLength = state === "attack_up" ? 336.69 : state === "attack_down" ? 254.72 : 301.75;
        return {
            length: Math.abs(this.sprite.scale.y) * sourceLength,
            rotation: -angle * this.facingDirection,
            facing: this.facingDirection,
        };
    }
    /** Current world-space weapon/hand attachment used to launch ranged projectiles. */
    public getRangedProjectileOrigin(target: HoCMath.XY, gs: GridSettings): HoCMath.XY {
        const sprite = this.sprite;
        const parent = sprite?.parent;
        if (!sprite || !parent || !sprite.visible) return this.getVisualCenter(gs);

        if (
            this.creatureAnimationLabPreviewEnabled &&
            [DRYAD_UNIT_NAME, "Elf", "Medusa"].includes(this.getName()) &&
            this.oneShotAnim
        ) {
            const origin = animationAtlases[
                this.getName() === "Medusa" ? "Medusa Lab" : this.getName() === "Elf" ? "Elf Lab" : "Dryad Lab"
            ]?.[this.oneShotAnim.stateName]?.projectileOrigin as HoCMath.XY | undefined;
            if (origin)
                return parent.toLocal(
                    sprite.toGlobal({
                        x: origin.x - sprite.anchor.x * sprite.texture.width,
                        y: origin.y - sprite.anchor.y * sprite.texture.height,
                    }),
                );
        }

        if (this.creatureAnimationLabPreviewEnabled && this.getName() === CENTAUR_UNIT_NAME && this.oneShotAnim) {
            const state = this.oneShotAnim.stateName;
            if (["attack", "attack_up", "attack_down"].includes(state)) {
                const hand = animationAtlases["Centaur Lab"]?.[state]?.projectileOrigin as HoCMath.XY | undefined;
                if (hand)
                    return parent.toLocal(
                        sprite.toGlobal({
                            x: hand.x - sprite.anchor.x * sprite.texture.width,
                            y: hand.y - sprite.anchor.y * sprite.texture.height,
                        }),
                    );
            }
        }

        if (
            this.arbalesterLabIdleEnabled &&
            this.getName() === ARBALESTER_UNIT_NAME &&
            this.oneShotAnim &&
            this.oneShotAnim.frames[0]?.height === 512 &&
            ["attack", "attack_up", "attack_down"].includes(this.oneShotAnim.stateName)
        ) {
            const stateName = this.oneShotAnim.stateName;
            const authored = animationAtlases.Arbalester?.[stateName]?.projectileOrigin as HoCMath.XY | undefined;
            const muzzle =
                authored && Number.isFinite(authored.x) && Number.isFinite(authored.y)
                    ? authored
                    : stateName === "attack_up"
                      ? { x: 400, y: 105 } // Raised crossbow rail at release, in the native 512px frame.
                      : { x: 425, y: stateName === "attack_down" ? 295 : 230 };
            return parent.toLocal(
                sprite.toGlobal({
                    x: muzzle.x - sprite.anchor.x * sprite.texture.width,
                    y: muzzle.y - sprite.anchor.y * sprite.texture.height,
                }),
            );
        }

        if (this.getName() === ORC_UNIT_NAME && isOrcRangedAttack(this.oneShotAnim?.stateName)) {
            const hand =
                this.oneShotAnim?.stateName === "attack_up"
                    ? { x: 984, y: 310 }
                    : this.oneShotAnim?.stateName === "attack_down"
                      ? { x: 1008, y: 510 }
                      : { x: 1008, y: 415 };
            return parent.toLocal(
                sprite.toGlobal({
                    x: hand.x - sprite.anchor.x * sprite.texture.width,
                    y: hand.y - sprite.anchor.y * sprite.texture.height,
                }),
            );
        }
        const bounds = sprite.getBounds();
        if (bounds.width <= 1 || bounds.height <= 1) return this.getVisualCenter(gs);
        const globalCorners = [
            new Point(bounds.x, bounds.y),
            new Point(bounds.x + bounds.width, bounds.y),
            new Point(bounds.x, bounds.y + bounds.height),
            new Point(bounds.x + bounds.width, bounds.y + bounds.height),
        ];
        const localCorners = globalCorners.map((point) => parent.toLocal(point));
        return rangedProjectileOriginFromBounds(
            this.getName(),
            {
                left: Math.min(...localCorners.map((point) => point.x)),
                top: Math.min(...localCorners.map((point) => point.y)),
                right: Math.max(...localCorners.map((point) => point.x)),
                bottom: Math.max(...localCorners.map((point) => point.y)),
            },
            target,
            this.facingDirection,
        );
    }
    /** World-space anchor immediately above the creature's visible stack flag. */
    public getDamagePredictionAnchor(gs: GridSettings): HoCMath.XY {
        const badge = this.badgeContainer;
        const worldRoot = badge?.parent;
        const geometry = this.badgeDrawState?.geometry;
        const sprite = this.sprite;
        if (badge?.visible && worldRoot && geometry && sprite) {
            const spriteBounds = sprite.getBounds();
            if (spriteBounds.width > 0 && spriteBounds.height > 0) {
                const parentScale = inheritedAbsoluteScale(worldRoot, this.inheritedScaleScratch);
                this.inheritedScaleScratch = parentScale;
                const margin = Math.max(2, Math.floor(this.badgeDrawState!.iconSide * 0.04));
                const anchor = worldRoot.toLocal({
                    x: spriteBounds.x + spriteBounds.width * 0.5,
                    y: stableDamagePredictionBadgeScreenTop(
                        spriteBounds.y,
                        margin,
                        geometry.flagHeight,
                        parentScale.y,
                        this.badgeEmphasisScale,
                    ),
                });

                // Match the stable, non-pulsing forms of the same authored offsets used by ensureBadge().
                // The active-turn breathing scale is intentionally excluded from every term here.
                if (this.shouldShowRespondTag()) {
                    anchor.y +=
                        Math.max(0, (geometry.headerWidth - geometry.flagHeight) * 0.5) * this.badgeEmphasisScale;
                }
                const framing = resolveStoredBattlefieldCreatureFraming(this.getUnitProperties().name);
                anchor.x +=
                    flagOffsetXForFacing(framing.flagOffsetXCells ?? 0, this.facingDirection) * gs.getCellSize();
                anchor.y -= (framing.flagOffsetYCells ?? 0) * gs.getCellSize();
                return anchor;
            }
        }

        // The flag is created lazily. During that first frame, keep the preview above the creature instead
        // of flashing at its feet; the next hover update will use the exact live banner bounds.
        const spriteParent = sprite?.parent;
        if (sprite && spriteParent) {
            const bounds = sprite.getBounds();
            if (bounds.width > 0 && bounds.height > 0) {
                return spriteParent.toLocal({ x: bounds.x + bounds.width * 0.5, y: bounds.y });
            }
        }

        const center = this.getVisualCenter(gs);
        return { x: center.x, y: center.y + gs.getCellSize() };
    }
    private oneShotAnim?: OneShotAnimState;
    private battleMageLabDeathShadowAlpha(): number {
        if (
            this.getName() !== "Battle Mage" ||
            !this.creatureAnimationLabPreviewEnabled ||
            this.oneShotAnim?.stateName !== "death"
        )
            return 1;
        return battleMageReactionPose(
            "death",
            this.oneShotAnim.finished
                ? BATTLE_MAGE_REACTION_DURATION_MS.death
                : this.oneShotAnim.elapsed +
                      (this.oneShotAnim.frameDurationsMs
                          ?.slice(0, this.oneShotAnim.frameIndex)
                          .reduce((sum, duration) => sum + duration, 0) ??
                          this.oneShotAnim.frameIndex * this.oneShotAnim.durationPerFrame),
        ).shadowAlpha;
    }
    private manticoreLabCanvasScale(state = this.oneShotAnim?.stateName): number {
        return this.creatureAnimationLabPreviewEnabled &&
            this.getName() === "Manticore" &&
            ["melee_attack", "melee_attack_up", "melee_attack_down"].includes(state ?? "")
            ? 896 / 768
            : 1;
    }
    private manticoreLabReactionConfig(state: string): UnitAtlasConfig | null {
        if (!this.creatureAnimationLabPreviewEnabled || this.getName() !== "Manticore") return null;
        if (!["hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"].includes(state)) return null;
        const meta = animationAtlases["Manticore Lab"]?.[state];
        const imageKey = `manticore_lab_${state}_atlas` as ImageKey;
        const imageSrc = images[imageKey];
        return meta && imageSrc
            ? { meta, imageKey, imageSrc, cacheKey: `Manticore::lab-${state}-20260920-v4`, cacheAcrossScenes: true }
            : null;
    }
    private battleMageLabCanvasScale(state = this.oneShotAnim?.stateName): number {
        return this.creatureAnimationLabPreviewEnabled &&
            this.getName() === "Battle Mage" &&
            ["melee_attack", "melee_attack_up", "melee_attack_down", "cast"].includes(state ?? "")
            ? 1152 / 768
            : 1;
    }
    private battleMageLabReactionConfig(state: string): UnitAtlasConfig | null {
        if (
            !this.creatureAnimationLabPreviewEnabled ||
            this.getName() !== "Battle Mage" ||
            !["hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down", "cast"].includes(state)
        )
            return null;
        const meta = animationAtlases["Battle Mage Lab"]?.[state];
        const imageKey = `battle_mage_lab_${state}_atlas` as ImageKey;
        const imageSrc = images[imageKey];
        if (meta && imageSrc) {
            return {
                meta,
                imageSrc,
                imageKey,
                cacheKey: `Battle Mage::lab-${state}-combat-20260920-v8`,
                cacheAcrossScenes: true,
            };
        }
        if (state !== "hit" && state !== "death") return null;
        const base = getStaticBattlefieldIdleConfig(
            this.getName(),
            this.getFootprintWidth(),
            this.getFootprintHeight(),
        );
        if (!base) return null;
        const duration = BATTLE_MAGE_REACTION_DURATION_MS[state as BattleMageReaction];
        return {
            ...base,
            meta: {
                ...base.meta,
                fps: 1000 / duration,
                frameDurationSec: duration / 1000,
                totalDurationSec: duration / 1000,
                loopDurationMs: duration,
                frameDurationsMs: [duration],
            },
            cacheKey: `Battle Mage::lab-${state}-continuous-20260913-v1`,
        };
    }
    private valkyrieLabCanvasScale(state = this.oneShotAnim?.stateName): number {
        return this.creatureAnimationLabPreviewEnabled && this.getName() === "Valkyrie" && isValkyrieLabAction(state)
            ? valkyrieLabActionCanvasScale(state)
            : 1;
    }
    private valkyrieLabReactionConfig(state: string): UnitAtlasConfig | null {
        if (!this.creatureAnimationLabPreviewEnabled || this.getName() !== "Valkyrie" || !isValkyrieLabAction(state))
            return null;
        const meta = animationAtlases["Valkyrie Lab Current"]?.[state];
        const imageKey = `valkyrie_lab_current_${state}_atlas` as ImageKey;
        const imageSrc = images[imageKey];
        if (!meta || !imageSrc) return null;
        const playbackSpeed = state === "death" ? VALKYRIE_DEATH_SPEED : state === "hit" ? VALKYRIE_HIT_SPEED : 1;
        return {
            meta: {
                ...meta,
                footAnchorY: valkyrieLabActionAnchorY(this.selectionAnimFootAnchorY, state),
                fps: meta.fps * playbackSpeed,
                frameDurationSec: meta.frameDurationSec / playbackSpeed,
                totalDurationSec: meta.totalDurationSec / playbackSpeed,
                loopDurationMs: (meta.loopDurationMs ?? meta.totalDurationSec * 1000) / playbackSpeed,
                frameDurationsMs: meta.frameDurationsMs?.map((ms) => ms / playbackSpeed),
            },
            imageKey,
            imageSrc,
            cacheKey: `Valkyrie::lab-${state}-source-20260913-v1`,
            cacheAcrossScenes: true,
        };
    }
    private fairyLabAnimationConfig(state = "idle"): UnitAtlasConfig | null {
        if (!this.creatureAnimationLabPreviewEnabled || this.getName() !== "Fairy") return null;
        if (!["idle", "hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down"].includes(state))
            return null;
        const meta = animationAtlases["Fairy Lab"]?.[state];
        const imageKey = `fairy_lab_${state}_atlas` as ImageKey;
        const imageSrc = images[imageKey];
        if (!meta || !imageSrc) return null;
        return {
            meta,
            imageSrc,
            imageKey,
            cacheKey: `Fairy::lab-h3-20260913-v1::${state}`,
            cacheAcrossScenes: true,
        };
    }
    /** Exact atlas used by this creature, for preparing a complete combat pair before playback. */
    public getAnimationTextureKey(stateName: string): string | undefined {
        return (
            this.pikemanLabReactionConfig(stateName) ??
            this.manticoreLabReactionConfig(stateName) ??
            this.valkyrieLabReactionConfig(stateName) ??
            this.medusaLabAnimationConfig(stateName) ??
            this.healerLabReactionConfig(stateName) ??
            this.battleMageLabReactionConfig(stateName) ??
            this.whiteTigerLabAnimationConfig(stateName) ??
            this.trollLabAnimationConfig(stateName) ??
            this.leprechaunLabReactionConfig(stateName) ??
            this.fairyLabAnimationConfig(stateName) ??
            this.dryadLabActionConfig(stateName) ??
            this.elfLabReactionConfig(stateName) ??
            this.centaurLabReactionConfig(stateName) ??
            this.scavengerLabAnimationConfig(stateName) ??
            getAnimationStateConfig(this.getName(), stateName, this.getFootprintWidth(), this.getFootprintHeight())
        )?.imageKey;
    }
    public hasAnimationState(stateName: string): boolean {
        if (this.medusaLabAnimationConfig(stateName)) return true;
        if (this.pikemanLabReactionConfig(stateName)) return true;
        if (this.manticoreLabReactionConfig(stateName)) return true;
        if (this.valkyrieLabReactionConfig(stateName)) return true;
        if (this.healerLabReactionConfig(stateName)) return true;
        if (this.battleMageLabReactionConfig(stateName)) return true;
        if (this.whiteTigerLabAnimationConfig(stateName)) return true;
        if (this.trollLabAnimationConfig(stateName)) return true;
        if (this.leprechaunLabReactionConfig(stateName)) return true;
        if (this.fairyLabAnimationConfig(stateName)) return true;
        if (this.dryadLabActionConfig(stateName)) return true;
        if (this.elfLabReactionConfig(stateName)) return true;
        if (this.centaurLabReactionConfig(stateName)) return true;
        if (this.scavengerLabAnimationConfig(stateName)) return true;
        if (stateName === "idle") return this.idleAnimationStateAvailable;
        const props = this.getUnitProperties();
        return (
            getAnimationStateConfig(props.name, stateName, this.getFootprintWidth(), this.getFootprintHeight()) !== null
        );
    }
    public isPlayingOneShotAnimation(stateName?: string): boolean {
        return !!this.oneShotAnim && (!stateName || this.oneShotAnim.stateName === stateName);
    }
    public isPlayingForegroundAttackAnimation(): boolean {
        return (
            this.getName() !== BLACKSMITH_UNIT_NAME &&
            !!this.oneShotAnim &&
            isAttackAnimationStateName(this.oneShotAnim.stateName)
        );
    }
    /**
     * Plays a one-shot animation sequence (like 'death', 'attack', 'hit')
     * @param stateName The animation state name (e.g. "death", "attack")
     * @param onComplete Callback when animation finishes
     */
    public playOneShotAnimation(stateName: string, onComplete?: () => void, forcePreview = false): boolean {
        this.cancelArbalesterRangedShot();
        this.cancelDryadRangedShot();
        this.oneShotAnim?.orcCancel?.();
        if (this.sprite) clearScavengerHitRegistration(this.sprite);
        // An action has begun even when this creature has no authored atlas for it. Hide immediately
        // instead of allowing the turn marker to linger until the callback or next turn snapshot.
        this.suppressActiveTurnPointer();
        const props = this.getUnitProperties();
        if (!forcePreview && !creatureOneShotAnimationEnabledForUnit(props.name, stateName)) {
            // A generic Peasant hit/death/cast request is intentionally visual-only no-op. Do not let it
            // cancel an approved attack or gait that is already playing; death callbacks still run below
            // and own the actual teardown.
            if (props.name !== PEASANT_UNIT_NAME) {
                this.oneShotAnim = undefined;
                this.restoreScaleAfterSquireWalk();
                this.restoreWidthAfterBoardWalk();
                this.walkAnim = undefined;
                this.movementBadgeOffsetY = undefined;
                this.stepSelectionAnimation();
            }
            if (onComplete) onComplete();
            return false;
        }
        // Authored actions share the sword idle's padded canvas. Restore gait registration before swapping.
        if (isBerserkerAuthoredAction(props.name, stateName) && this.walkAnim) this.stopBoardWalkAnimation();
        const previousBerserkerScale = isBerserkerAuthoredAction(props.name, this.oneShotAnim?.stateName)
            ? BERSERKER_SWORD_IDLE_SCALE
            : this.berserkerLabIdleScale();
        const labConfig = this.scavengerLabAnimationConfig(stateName);
        const fairyLabConfig = this.fairyLabAnimationConfig(stateName);
        const centaurLabConfig = this.centaurLabReactionConfig(stateName);
        const dryadLabConfig = this.dryadLabActionConfig(stateName);
        const elfLabConfig = this.elfLabReactionConfig(stateName);
        const leprechaunLabConfig = this.leprechaunLabReactionConfig(stateName);
        const battleMageLabConfig = this.battleMageLabReactionConfig(stateName);
        const healerLabConfig = this.healerLabReactionConfig(stateName);
        const pikemanLabConfig = this.pikemanLabReactionConfig(stateName);
        const trollLabConfig = this.trollLabAnimationConfig(stateName);
        const medusaLabConfig = this.medusaLabAnimationConfig(stateName);
        const whiteTigerLabConfig = this.whiteTigerLabAnimationConfig(stateName);
        const valkyrieLabConfig = this.valkyrieLabReactionConfig(stateName);
        const manticoreLabConfig = this.manticoreLabReactionConfig(stateName);
        const config =
            medusaLabConfig ??
            pikemanLabConfig ??
            manticoreLabConfig ??
            valkyrieLabConfig ??
            whiteTigerLabConfig ??
            trollLabConfig ??
            healerLabConfig ??
            battleMageLabConfig ??
            fairyLabConfig ??
            leprechaunLabConfig ??
            dryadLabConfig ??
            elfLabConfig ??
            centaurLabConfig ??
            labConfig ??
            getAnimationStateConfig(props.name, stateName, this.getFootprintWidth(), this.getFootprintHeight());
        // If config/atlas not found, just fire callback immediately.
        if (!config || !this.sprite) {
            if (onComplete) onComplete();
            return false;
        }
        const { meta } = config;
        const arbalesterLabReaction =
            this.arbalesterLabIdleEnabled &&
            props.name === ARBALESTER_UNIT_NAME &&
            (stateName === "hit" || stateName === "death" || isArbalesterAttack(stateName));
        const mermaidAction = props.name === MERMAID_UNIT_NAME && isMermaidAuthoredAction(stateName);
        const wolfAction = props.name === WOLF_UNIT_NAME && isWolfAuthoredAction(stateName);
        const atlasFrames = framesForAtlasConfig(
            arbalesterLabReaction ? { ...config, cacheKey: `Arbalester::lab-combat-v1::${stateName}` } : config,
            this.texResolver,
        );
        let frames =
            props.name === PEASANT_UNIT_NAME &&
            stateName === "attack_down" &&
            atlasFrames.length === PEASANT_ATTACK_DOWN_FRAME_ORDER.length
                ? PEASANT_ATTACK_DOWN_FRAME_ORDER.map((index) => atlasFrames[index])
                : atlasFrames;
        if (trollLabConfig && (isTrollLabAttack(stateName) || stateName === "cast")) {
            const idleConfig = this.trollLabAnimationConfig("idle");
            const idle = idleConfig && framesForAtlasConfig(idleConfig, this.texResolver)[0];
            if (idle) frames = trollLabAttackFrames(frames, idle);
        }
        if (!frames.length) {
            if (onComplete) onComplete();
            return false;
        }

        if (
            (medusaLabConfig ||
                manticoreLabConfig ||
                pikemanLabConfig ||
                valkyrieLabConfig ||
                whiteTigerLabConfig ||
                trollLabConfig ||
                healerLabConfig ||
                fairyLabConfig ||
                centaurLabConfig ||
                dryadLabConfig ||
                elfLabConfig ||
                leprechaunLabConfig ||
                battleMageLabConfig) &&
            this.walkAnim
        )
            this.stopBoardWalkAnimation();
        const previousArbalesterWalkScale =
            this.walkAnim && props.name === ARBALESTER_UNIT_NAME
                ? arbalesterWalkScaleMultiplier(this.walkAnim.frameIndex)
                : undefined;
        // Attacks, casts and reactions take visual priority over any short post-move walk tail.
        this.restoreScaleAfterSquireWalk();
        this.restoreWidthAfterBoardWalk();
        this.walkAnim = undefined;

        this.oneShotBadgePosition = this.badgeContainer
            ? { x: this.badgeContainer.x, y: this.badgeContainer.y }
            : undefined;
        this.movementBadgeOffsetY = undefined;

        const previousScavengerCanvasScale = scavengerLabCanvasScale(this.oneShotAnim?.stateName);
        const previousTrollCanvasScale = this.trollLabCanvasScale();
        const previousCentaurCanvasScale = this.centaurLabCanvasScale();
        const previousLeprechaunCanvasScale = this.leprechaunLabCanvasScale();
        const previousElfCanvasScale = this.elfLabCanvasScale();
        const previousMedusaCanvasScale = this.medusaLabCanvasScale();
        const previousScavengerRatio =
            this.scavengerLabAnimationsEnabled || this.oneShotAnim
                ? SCAVENGER_LAB_VISIBLE_HEIGHT_RATIO
                : THIEF_IDLE_VISIBLE_HEIGHT_RATIO;
        const authoredDurationPerFrame =
            medusaLabConfig ||
            whiteTigerLabConfig ||
            pikemanLabConfig ||
            manticoreLabConfig ||
            valkyrieLabConfig ||
            trollLabConfig ||
            healerLabConfig ||
            battleMageLabConfig ||
            fairyLabConfig ||
            leprechaunLabConfig ||
            dryadLabConfig ||
            elfLabConfig ||
            centaurLabConfig ||
            labConfig ||
            arbalesterLabReaction ||
            mermaidAction ||
            wolfAction ||
            isBerserkerAuthoredAction(props.name, stateName)
                ? 1000 / meta.fps / (wolfAction && stateName === "death" ? 1.12 : 1)
                : ((meta.loopDurationMs || 1000) / (meta.frameCount || frames.length)) *
                  oneShotAnimationDurationMultiplier(props.name, stateName);

        const previousValkyrieCanvasScale = this.valkyrieLabCanvasScale();
        const previousManticoreCanvasScale = this.manticoreLabCanvasScale();
        const previousBattleMageCanvasScale = this.battleMageLabCanvasScale();
        const previousPeasantScale =
            props.name === PEASANT_UNIT_NAME && this.oneShotAnim
                ? peasantActionScaleMultiplier(this.oneShotAnim.stateName, this.oneShotAnim.frameIndex)
                : 1;

        const previousBlacksmithCanvasScale = blacksmithActionCanvasScale(this.oneShotAnim?.stateName);
        const previousMermaidCanvasScale = mermaidActionCanvasScale(this.oneShotAnim?.stateName);
        const blacksmithDepthBounds =
            props.name === BLACKSMITH_UNIT_NAME && (isBlacksmithSpriteAttack(stateName) || stateName === "cast")
                ? (this.oneShotAnim?.depthSortBounds ?? this.getCreatureBounds())
                : undefined;
        const previousSquireCanvasScale = squireActionCanvasScale(this.oneShotAnim?.stateName);
        const previousTroglodyteCanvasScale = troglodyteActionCanvasScale(this.oneShotAnim?.stateName);
        const previousOrcCanvasScale = orcActionCanvasScale(this.oneShotAnim?.stateName);
        const previousMageCanvasScale = wanderingMageActionCanvasScale(this.oneShotAnim?.stateName);
        const previousArbalesterLabScale =
            previousArbalesterWalkScale ?? this.arbalesterLabScaleMultiplier(this.oneShotAnim?.stateName);

        this.oneShotAnim = {
            stateName,
            depthSortBounds: blacksmithDepthBounds
                ? {
                      x: blacksmithDepthBounds.x,
                      y: blacksmithDepthBounds.y,
                      width: blacksmithDepthBounds.width,
                      height: blacksmithDepthBounds.height,
                  }
                : undefined,
            frames,
            footAnchorY: this.arbalesterLabFootAnchorY(stateName, meta),
            frameIndex: 0,
            elapsed: 0,
            frameDurationsMs:
                (medusaLabConfig ||
                    whiteTigerLabConfig ||
                    manticoreLabConfig ||
                    pikemanLabConfig ||
                    valkyrieLabConfig ||
                    trollLabConfig ||
                    healerLabConfig ||
                    battleMageLabConfig ||
                    fairyLabConfig ||
                    leprechaunLabConfig ||
                    dryadLabConfig ||
                    elfLabConfig ||
                    centaurLabConfig ||
                    arbalesterLabReaction ||
                    isBerserkerAuthoredAction(props.name, stateName) ||
                    mermaidAction ||
                    wolfAction ||
                    (props.name === ORC_UNIT_NAME && isOrcAuthoredAction(stateName)) ||
                    (props.name === WANDERING_MAGE_UNIT_NAME && isWanderingMageAuthoredAction(stateName)) ||
                    (props.name === SQUIRE_UNIT_NAME && (stateName === "hit" || isSquireSpriteAttack(stateName))) ||
                    (props.name === TROGLODYTE_UNIT_NAME && isTroglodyteAuthoredAction(stateName)) ||
                    (props.name === WOLF_RIDER_UNIT_NAME && isWolfRiderAction(stateName)) ||
                    (props.name === BLACKSMITH_UNIT_NAME && isBlacksmithAuthoredAction(stateName))) &&
                meta.frameDurationsMs?.length === frames.length &&
                meta.frameDurationsMs.every((duration) => Number.isFinite(duration) && duration > 0)
                    ? wolfAction
                        ? wolfActionFrameDurations(stateName, meta.frameDurationsMs)
                        : meta.frameDurationsMs
                    : undefined,
            authoredRealTime:
                !!medusaLabConfig ||
                !!whiteTigerLabConfig ||
                !!pikemanLabConfig ||
                !!manticoreLabConfig ||
                !!valkyrieLabConfig ||
                !!trollLabConfig ||
                !!healerLabConfig ||
                !!battleMageLabConfig ||
                !!fairyLabConfig ||
                !!leprechaunLabConfig ||
                !!dryadLabConfig ||
                !!elfLabConfig ||
                !!centaurLabConfig ||
                arbalesterLabReaction ||
                mermaidAction ||
                wolfAction ||
                isBerserkerAuthoredAction(props.name, stateName),
            durationPerFrame:
                props.name === PEASANT_UNIT_NAME && stateName === "attack"
                    ? PEASANT_SIDE_ATTACK_FRAME_DURATION_MS
                    : authoredDurationPerFrame,
            onComplete,
            holdLastFrame:
                stateName === "death" &&
                (forcePreview ||
                    usesApprovedBaseAnimations(props.name) ||
                    props.name === ORC_UNIT_NAME ||
                    props.name === WANDERING_MAGE_UNIT_NAME ||
                    props.name === WOLF_UNIT_NAME ||
                    props.name === MERMAID_UNIT_NAME),
        };

        // Set the first frame immediately. A differently sized atlas would otherwise keep the old
        // texture's scale for one render tick and visibly flash larger/smaller before ensureVisual()
        // recalculates it. Preserve screen height across this synchronous swap.
        const openingFrame = frames[0];
        const scaleRatio =
            textureSwapHeightScaleRatio(
                wolfAction ? (this.wolfRenderedCanvasHeight ?? this.sprite.texture.height) : this.sprite.texture.height,
                openingFrame.height,
            ) *
            // The cached effective height already removes the previous action's padding.
            (wolfAction ? wolfActionCanvasScale(stateName) : 1) *
            (this.valkyrieLabCanvasScale(stateName) / previousValkyrieCanvasScale) *
            (this.manticoreLabCanvasScale(stateName) / previousManticoreCanvasScale) *
            (this.battleMageLabCanvasScale(stateName) / previousBattleMageCanvasScale) *
            (this.trollLabCanvasScale(stateName) / previousTrollCanvasScale) *
            (this.centaurLabCanvasScale(stateName) / previousCentaurCanvasScale) *
            (this.leprechaunLabCanvasScale(stateName) / previousLeprechaunCanvasScale) *
            (this.elfLabCanvasScale(stateName) / previousElfCanvasScale) *
            (this.medusaLabCanvasScale(stateName) / previousMedusaCanvasScale) *
            (labConfig
                ? ((previousScavengerRatio / SCAVENGER_LAB_VISIBLE_HEIGHT_RATIO) * scavengerLabCanvasScale(stateName)) /
                  previousScavengerCanvasScale
                : 1) *
            (props.name === BLACKSMITH_UNIT_NAME
                ? blacksmithActionCanvasScale(stateName) / previousBlacksmithCanvasScale
                : 1) *
            (props.name === MERMAID_UNIT_NAME ? mermaidActionCanvasScale(stateName) / previousMermaidCanvasScale : 1) *
            (props.name === SQUIRE_UNIT_NAME ? squireActionCanvasScale(stateName) / previousSquireCanvasScale : 1) *
            (props.name === TROGLODYTE_UNIT_NAME
                ? troglodyteActionCanvasScale(stateName) / previousTroglodyteCanvasScale
                : 1) *
            (props.name === ORC_UNIT_NAME ? orcActionCanvasScale(stateName) / previousOrcCanvasScale : 1) *
            (props.name === WANDERING_MAGE_UNIT_NAME
                ? wanderingMageActionCanvasScale(stateName) / previousMageCanvasScale
                : 1) *
            (this.arbalesterLabScaleMultiplier(stateName) / previousArbalesterLabScale) *
            (isBerserkerAuthoredAction(props.name, stateName)
                ? BERSERKER_SWORD_IDLE_SCALE / previousBerserkerScale
                : 1) *
            (props.name === WOLF_UNIT_NAME ? 1 / this.wolfRenderedReactionScale : 1);
        const openingHorizontalScale =
            props.name === SQUIRE_UNIT_NAME && stateName === "death" ? SQUIRE_DEATH_HORIZONTAL_SCALE_MULTIPLIER : 1;
        if (scaleRatio !== 1 || openingHorizontalScale !== 1) {
            this.sprite.scale.set(
                this.sprite.scale.x * scaleRatio * openingHorizontalScale,
                this.sprite.scale.y * scaleRatio,
            );
        }
        if (valkyrieLabConfig) this.sprite.anchor.x = valkyrieLabActionAnchorX(stateName);
        this.sprite.anchor.y = this.oneShotAnim.footAnchorY;
        this.sprite.texture = openingFrame;
        if (props.name === WOLF_UNIT_NAME) this.wolfRenderedReactionScale = 1;
        if (wolfAction) this.wolfRenderedCanvasHeight = openingFrame.height / wolfActionCanvasScale(stateName);
        if (labConfig && stateName === "hit") applyScavengerHitRegistration(this.sprite, 0);
        this.syncCreaturePalette();
        if (props.name === PEASANT_UNIT_NAME) {
            const actionScale = peasantActionScaleMultiplier(stateName) / previousPeasantScale;
            this.sprite.scale.set(this.sprite.scale.x * actionScale, this.sprite.scale.y * actionScale);
            this.sprite.anchor.x = isAttackAnimationStateName(stateName) ? peasantAttackAnchorX(stateName) : 0.5;
        }
        return true;
    }
    private medusaIdleResumeOffsetMs(): number {
        // Arrival/recovery already supplies the neutral pose. Begin at the first moving idle cel
        // instead of holding the same neutral stance for another complete frame.
        return this.creatureAnimationLabPreviewEnabled && this.getName() === "Medusa"
            ? (this.selectionAnimFrameDurationsMs?.[0] ?? 0)
            : 0;
    }
    /** Cancel any transient pose and restore this creature's authored permanent idle loop immediately. */
    public returnToIdleAnimation(preserveRangedProjectile = false): void {
        this.movementBadgeOffsetY = undefined;
        if (!preserveRangedProjectile) this.cancelArbalesterRangedShot();
        if (!preserveRangedProjectile) this.cancelDryadRangedShot();
        // Lab walks with a different canvas size must restore scale before returning to the static idle.
        if (
            this.walkAnim &&
            (this.getName() === "Berserker" ||
                (this.getName() === "Elf" && this.creatureAnimationLabPreviewEnabled) ||
                (this.getName() === "Fairy" && this.creatureAnimationLabPreviewEnabled) ||
                (this.getName() === "Valkyrie" && this.creatureAnimationLabPreviewEnabled) ||
                (this.getName() === "Manticore" && this.creatureAnimationLabPreviewEnabled) ||
                (this.getName() === DRYAD_UNIT_NAME && this.creatureAnimationLabPreviewEnabled))
        )
            this.stopBoardWalkAnimation();
        if (this.sprite) clearScavengerHitRegistration(this.sprite);
        const previousAction = this.oneShotAnim;
        previousAction?.orcCancel?.();
        const previousArbalesterHeight =
            this.getName() === ARBALESTER_UNIT_NAME && this.sprite && (previousAction || this.walkAnim)
                ? this.sprite.texture.height /
                  (this.walkAnim
                      ? arbalesterWalkScaleMultiplier(this.walkAnim.frameIndex)
                      : this.arbalesterLabScaleMultiplier(previousAction?.stateName))
                : undefined;
        this.oneShotAnim = undefined;
        this.oneShotBadgePosition = undefined;
        this.restoreScaleAfterSquireWalk();
        this.restoreWidthAfterBoardWalk();
        this.walkAnim = undefined;
        this.selectionAnimationStartedAtMs = performance.now() - this.medusaIdleResumeOffsetMs();
        this.selectionAnimFrameIndex = -1;
        if (this.getUnitProperties().name === PEASANT_UNIT_NAME) {
            this.peasantIdleResumeAtMs = this.selectionAnimationStartedAtMs;
        }
        if (this.getUnitProperties().name === TROGLODYTE_UNIT_NAME) {
            this.troglodyteIdleResumeAtMs = this.selectionAnimationStartedAtMs;
        }
        const previousHeight = this.sprite?.texture.height ?? 0;
        this.stepSelectionAnimation();
        if (
            previousAction &&
            this.sprite &&
            this.getName() === TROLL_UNIT_NAME &&
            this.creatureAnimationLabPreviewEnabled
        ) {
            const ratio =
                textureSwapHeightScaleRatio(previousHeight, this.sprite.texture.height) /
                this.trollLabCanvasScale(previousAction.stateName);
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (
            previousAction &&
            this.sprite &&
            this.getName() === "Manticore" &&
            this.creatureAnimationLabPreviewEnabled
        ) {
            const ratio =
                textureSwapHeightScaleRatio(previousHeight, this.sprite.texture.height) /
                this.manticoreLabCanvasScale(previousAction.stateName);
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (
            previousAction &&
            this.sprite &&
            this.getName() === "White Tiger" &&
            this.creatureAnimationLabPreviewEnabled
        ) {
            // Attack canvases reserve space below the feet for the low claw strike.
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (
            previousAction &&
            this.sprite &&
            this.getName() === CENTAUR_UNIT_NAME &&
            this.creatureAnimationLabPreviewEnabled
        ) {
            const ratio =
                textureSwapHeightScaleRatio(previousHeight, this.sprite.texture.height) /
                this.centaurLabCanvasScale(previousAction.stateName);
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (previousAction && this.sprite && this.getName() === "Valkyrie" && this.creatureAnimationLabPreviewEnabled) {
            const ratio =
                textureSwapHeightScaleRatio(previousHeight, this.sprite.texture.height) /
                this.valkyrieLabCanvasScale(previousAction.stateName);
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (previousAction && this.sprite && isBerserkerAuthoredAction(this.getName(), previousAction.stateName)) {
            const ratio =
                textureSwapHeightScaleRatio(previousHeight, this.sprite.texture.height) *
                (this.berserkerLabIdleScale() / BERSERKER_SWORD_IDLE_SCALE);
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (
            previousAction &&
            this.sprite &&
            (this.getName() === DRYAD_UNIT_NAME ||
                this.getName() === "Medusa" ||
                this.getName() === "Elf" ||
                this.getName() === "Battle Mage" ||
                this.getName() === LEPRECHAUN_UNIT_NAME ||
                this.getName() === "Fairy") &&
            this.creatureAnimationLabPreviewEnabled
        ) {
            const ratio =
                textureSwapHeightScaleRatio(previousHeight, this.sprite.texture.height) /
                this.leprechaunLabCanvasScale(previousAction.stateName) /
                this.elfLabCanvasScale(previousAction.stateName) /
                this.medusaLabCanvasScale(previousAction.stateName) /
                this.battleMageLabCanvasScale(previousAction.stateName);
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
            if (this.getName() === LEPRECHAUN_UNIT_NAME) this.syncCreaturePalette();
        }
        if (
            previousAction &&
            this.sprite &&
            this.getUnitProperties().name === BLACKSMITH_UNIT_NAME &&
            blacksmithActionCanvasScale(previousAction.stateName) !== 1
        ) {
            const ratio =
                textureSwapHeightScaleRatio(previousHeight, this.sprite.texture.height) /
                blacksmithActionCanvasScale(previousAction.stateName);
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (previousAction && this.sprite && this.getName() === MERMAID_UNIT_NAME) {
            const ratio =
                textureSwapHeightScaleRatio(previousHeight, this.sprite.texture.height) /
                mermaidActionCanvasScale(previousAction.stateName);
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (previousAction && this.sprite && this.getName() === WANDERING_MAGE_UNIT_NAME) {
            const ratio =
                textureSwapHeightScaleRatio(previousHeight, this.sprite.texture.height) /
                wanderingMageActionCanvasScale(previousAction.stateName);
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (previousArbalesterHeight !== undefined && this.sprite) {
            const ratio = (previousArbalesterHeight / this.sprite.texture.height) * this.arbalesterLabScaleMultiplier();
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (
            previousAction &&
            this.sprite &&
            this.getUnitProperties().name === ORC_UNIT_NAME &&
            (isOrcMeleeAttack(previousAction.stateName) || isOrcRangedAttack(previousAction.stateName))
        ) {
            const ratio =
                textureSwapHeightScaleRatio(previousHeight, this.sprite.texture.height) /
                orcActionCanvasScale(previousAction.stateName);
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (
            previousAction &&
            this.sprite &&
            this.getUnitProperties().name === TROGLODYTE_UNIT_NAME &&
            isTroglodyteSpriteAttack(previousAction.stateName)
        ) {
            const ratio =
                textureSwapHeightScaleRatio(previousHeight, this.sprite.texture.height) /
                troglodyteActionCanvasScale(previousAction.stateName);
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (
            previousAction &&
            this.sprite &&
            this.getUnitProperties().name === SQUIRE_UNIT_NAME &&
            isSquireSpriteAttack(previousAction.stateName)
        ) {
            const ratio =
                textureSwapHeightScaleRatio(previousHeight, this.sprite.texture.height) /
                squireActionCanvasScale(previousAction.stateName);
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (
            previousAction &&
            this.sprite &&
            this.scavengerLabAnimationsEnabled &&
            SCAVENGER_LAB_ACTIONS.includes(previousAction.stateName)
        ) {
            const ratio =
                textureSwapHeightScaleRatio(previousHeight, this.sprite.texture.height) /
                scavengerLabCanvasScale(previousAction.stateName);
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
        if (previousAction && this.sprite && this.getUnitProperties().name === PEASANT_UNIT_NAME) {
            const ratio =
                textureSwapHeightScaleRatio(previousHeight, this.sprite.texture.height) /
                peasantActionScaleMultiplier(previousAction.stateName, previousAction.frameIndex);
            this.sprite.scale.set(this.sprite.scale.x * ratio, this.sprite.scale.y * ratio);
            this.sprite.anchor.set(0.5, this.selectionAnimFootAnchorY);
        }
    }
    private applyOneShotFrame(anim: OneShotAnimState): void {
        if (!this.sprite) return;
        clearScavengerHitRegistration(this.sprite);
        this.sprite.texture = anim.frames[anim.frameIndex];
        if (this.scavengerLabAnimationsEnabled && anim.stateName === "hit") {
            applyScavengerHitRegistration(this.sprite, anim.frameIndex);
        }
        this.syncCreaturePalette();
        // Layout precedes the animation tick. Move each frame and its registration together,
        // including a large time step that jumps straight to the held death pose.
        if (this.getUnitProperties().name === PEASANT_UNIT_NAME) {
            if (isAttackAnimationStateName(anim.stateName)) {
                this.sprite.anchor.x = peasantAttackAnchorX(anim.stateName, anim.frameIndex);
            } else if (anim.stateName === "death") {
                this.sprite.anchor.y = peasantDeathAnchorY(anim.footAnchorY, anim.frameIndex);
            }
        }
    }
    public stepOneShotAnimation(dtMs: number): void {
        if (!this.oneShotAnim || !this.sprite) return;

        const anim = this.oneShotAnim;
        anim.elapsed += dtMs;

        if (anim.elapsed >= (anim.frameDurationsMs?.[anim.frameIndex] ?? anim.durationPerFrame)) {
            while (
                anim.frameIndex < anim.frames.length &&
                anim.elapsed >= (anim.frameDurationsMs?.[anim.frameIndex] ?? anim.durationPerFrame)
            ) {
                anim.elapsed -= anim.frameDurationsMs?.[anim.frameIndex] ?? anim.durationPerFrame;
                anim.frameIndex++;
                if (anim.frameIndex === anim.projectileReleaseFrame && anim.projectileRelease) {
                    this.applyOneShotFrame(anim);
                    const release = anim.projectileRelease;
                    anim.projectileRelease = undefined;
                    release();
                    if (this.oneShotAnim !== anim) return;
                }
                if (anim.frameIndex === 4 && anim.orcRelease) {
                    this.applyOneShotFrame(anim);
                    const release = anim.orcRelease;
                    anim.orcRelease = undefined;
                    release();
                }
            }

            if (anim.frameIndex >= anim.frames.length) {
                if (anim.holdLastFrame) {
                    anim.finished = true;
                    anim.frameIndex = anim.frames.length - 1;
                    anim.elapsed = 0;
                    this.applyOneShotFrame(anim);
                    const callback = anim.onComplete;
                    anim.onComplete = undefined;
                    callback?.();
                    return;
                }
                // Animation Finished
                const callback = anim.onComplete;
                // Restore Peasant's idle texture, scale, anchor and phase in the same tick.
                // Otherwise the last attack texture is briefly drawn with the following pose's bounds.
                if (
                    (this.getUnitProperties().name === ORC_UNIT_NAME && isOrcAuthoredAction(anim.stateName)) ||
                    isBerserkerAuthoredAction(this.getName(), anim.stateName) ||
                    (this.getUnitProperties().name === MERMAID_UNIT_NAME && isMermaidAuthoredAction(anim.stateName)) ||
                    (this.getUnitProperties().name === WOLF_UNIT_NAME && isWolfAuthoredAction(anim.stateName)) ||
                    this.getUnitProperties().name === PEASANT_UNIT_NAME ||
                    this.getUnitProperties().name === SQUIRE_UNIT_NAME ||
                    this.getUnitProperties().name === TROGLODYTE_UNIT_NAME ||
                    this.getUnitProperties().name === WOLF_RIDER_UNIT_NAME ||
                    (this.getUnitProperties().name === BLACKSMITH_UNIT_NAME &&
                        (anim.stateName === "hit" ||
                            anim.stateName === "cast" ||
                            isBlacksmithSpriteAttack(anim.stateName))) ||
                    (this.getUnitProperties().name === WANDERING_MAGE_UNIT_NAME &&
                        (anim.stateName === "hit" ||
                            anim.stateName === "cast" ||
                            isWanderingMageMeleeAttack(anim.stateName))) ||
                    (this.creatureAnimationLabPreviewEnabled &&
                        (this.getName() === CENTAUR_UNIT_NAME ||
                            this.getName() === "Medusa" ||
                            this.getName() === TROLL_UNIT_NAME ||
                            this.getName() === "White Tiger" ||
                            this.getName() === "Battle Mage" ||
                            this.getName() === "Manticore" ||
                            this.getName() === "Elf" ||
                            this.getName() === "Fairy" ||
                            this.getName() === "Valkyrie" ||
                            this.getName() === DRYAD_UNIT_NAME ||
                            this.getName() === LEPRECHAUN_UNIT_NAME)) ||
                    this.scavengerLabAnimationsEnabled ||
                    (this.arbalesterLabIdleEnabled && this.getName() === ARBALESTER_UNIT_NAME)
                ) {
                    this.returnToIdleAnimation(true);
                    callback?.();
                    return;
                }
                this.oneShotAnim = undefined;
                this.oneShotBadgePosition = undefined;
                this.selectionAnimationStartedAtMs = performance.now();
                this.selectionAnimFrameIndex = -1;
                if (callback) callback();
            } else {
                this.applyOneShotFrame(anim);
            }
        }
        if (this.oneShotAnim === anim) this.syncWolfAttackReach();
        if (this.getName() === "Battle Mage" || this.getName() === "Manticore" || this.getName() === TROLL_UNIT_NAME)
            this.syncCreaturePalette();
    }
    /** Release non-display resources whether the unit or its parent container initiates teardown. */
    private releaseVisualLifecycleResources(): void {
        this.cancelArbalesterRangedShot();
        this.cancelDryadRangedShot();
        this.arbalesterIdlePager?.dispose();
        this.arbalesterIdlePager = undefined;
        this.oneShotAnim?.orcCancel?.();
        if (this.battlefieldFramingChangeListener && typeof window !== "undefined") {
            window.removeEventListener(
                BATTLEFIELD_CREATURE_FRAMING_CHANGE_EVENT,
                this.battlefieldFramingChangeListener,
            );
        }
        this.battlefieldFramingChangeListener = undefined;
        this.battlefieldFramingWorldRoot = undefined;
        this.battlefieldFramingGridSettings = undefined;
        if (this.respondFeedbackTimer !== undefined) {
            clearTimeout(this.respondFeedbackTimer);
            this.respondFeedbackTimer = undefined;
        }

        // Pixi containers only detach filters when destroyed; they do not destroy the filters' shader
        // resources. Ranked snapshot reconciliation replaces units repeatedly, so leaving these owned
        // instances alive accumulates bind groups and uniforms for the lifetime of the tab.
        if (this.sprite) this.sprite.filters = null;
        if (this.silhouetteShadow) this.silhouetteShadow.filters = null;
        for (const segment of this.silhouetteShadowSegments) segment.filters = null;
        if (this.badgeFlagGlow) this.badgeFlagGlow.filters = null;
        this.motionBlurFilter?.destroy();
        this.dodgeBlurFilter?.destroy();
        this.battlefieldStyleFilter?.destroy();
        this.silhouetteShadowBlurFilter?.destroy();
        this.motionBlurFilter = undefined;
        this.dodgeBlurFilter = undefined;
        this.desaturateFilter = undefined;
        this.battlefieldStyleFilter = undefined;
        this.silhouetteShadowBlurFilter = undefined;
    }
    private handlePrimarySpriteDestroyed(): void {
        if (this.isDestroyed) return;
        this.isDestroyed = true;
        this.releaseVisualLifecycleResources();
    }
    public destroyVisuals(): void {
        if (this.isDestroyed) return;
        this.isDestroyed = true;
        this.releaseVisualLifecycleResources();

        if (this.dodgeAnim) {
            for (const ghost of this.dodgeAnim.ghosts) {
                if (!ghost.sprite.destroyed) ghost.sprite.destroy();
            }
            this.dodgeAnim = undefined;
        }
        if (this.sprite) {
            this.sprite.destroy();
            this.sprite = undefined;
        }
        if (this.shadow) {
            this.shadow.destroy();
            this.shadow = undefined;
        }
        if (this.silhouetteShadow) {
            this.silhouetteShadow.destroy();
            this.silhouetteShadow = undefined;
            this.silhouetteShadowBlurFilter = undefined;
        }
        this.silhouetteShadowReferenceTexture = undefined;
        this.silhouetteShadowReferenceAnchorY = undefined;
        for (const segment of this.silhouetteShadowSegments) segment.destroy();
        this.silhouetteShadowSegments = [];
        this.silhouetteShadowSegmented = false;
        if (this.groundCastShadow) {
            this.groundCastShadow.destroy();
            this.groundCastShadow = undefined;
        }
        if (this.hourglassContainer) {
            this.hourglassContainer.destroy({ children: true });
            this.hourglassContainer = undefined;
            this.hourglassSprite = undefined;
        }
        if (this.stunContainer) {
            this.stunContainer.destroy({ children: true });
            this.stunContainer = undefined;
            this.stunSprite = undefined;
        }
        if (this.respondContainer) {
            this.respondContainer.destroy({ children: true });
            this.respondContainer = undefined;
            this.respondSprite = undefined;
        }
        if (this.badgeContainer) {
            this.badgeContainer.destroy({ children: true });
            this.badgeContainer = undefined;
            this.badgeHeader = undefined;
            this.badgeFlagGlow = undefined;
            this.badgeFlag = undefined;
            this.activeTurnPointer = undefined;
            this.badgeText = undefined;
            this.badgeDrawState = undefined;
        }
        if (this.rosterCard) {
            this.rosterCard.destroy({ children: true });
            this.rosterCard = undefined;
            this.rosterCardPlate = undefined;
            this.rosterCardDrawState = undefined;
        }
        if (this.stackPowerContainer) {
            this.stackPowerContainer.destroy({ children: true });
            this.stackPowerContainer.removeFromParent();
            this.stackPowerContainer = undefined;
            this.stackPowerPips = [];
            this.stackPowerDrawState = undefined;
        }
        if (this.activeAura) {
            this.activeAura.destroy({ children: true });
            this.activeAura = undefined;
        }
        this.activeAuraGlow = undefined;
        this.activeAuraMask = undefined;
        this.activeAuraGlowBlurFilter = undefined;
        if (this.activeTurnFireSprite) {
            this.activeTurnFireSprite.destroy();
            this.activeTurnFireSprite = undefined;
        }
        this.activeTurnFireFrameIndex = -1;
        if (this.waterShieldAura) {
            this.waterShieldAura.destroy({ children: true });
            this.waterShieldAura = undefined;
        }
        if (this.whirlpoolAura) {
            this.whirlpoolAura.destroy({ children: true });
            this.whirlpoolAura = undefined;
        }
        if (this.freezeCrust) {
            this.freezeCrust.destroy({ children: true });
            this.freezeCrust = undefined;
        }
        if (this.freezeLight) {
            this.freezeLight.destroy({ children: true });
            this.freezeLight = undefined;
        }
        if (this.waterShieldBreakGfx) {
            this.waterShieldBreakGfx.destroy({ children: true });
            this.waterShieldBreakGfx = undefined;
        }
        this.waterShieldBreakStartMs = undefined;
        this.waterShieldWasActive = false;
        this.spawnAnim = undefined;
        this.oneShotAnim = undefined;
        this.oneShotBadgePosition = undefined;
        this.restingBadgeOffsetY = undefined;
        this.movementBadgeOffsetY = undefined;
        this.walkAnim = undefined;
        this.facingDirection = placementFacingDirectionForTeam(this.getTeam());
        // Spellbook sprites live in a scene-shared container, not under this unit's own display
        // objects, so destroying the unit's sprite/containers above does not free them. Leaving them
        // behind orphans them in that shared container — and because ranked snapshots constantly
        // rebuild units, those orphans accumulate and bleed one unit's spells into another unit's
        // spellbook overlay (e.g. a melee unit showing a destroyed healer's spells). Destroy them
        // here, mirroring parseSpells' own cleanup.
        this.pixiSpells.forEach((s) => s.destroy());
        this.pixiSpells = [];
        // ⬇️ NEW
        this.boardSelected = false;
        this.selectionAnimFrames = undefined;
        this.orcIdleAxeTwirlFrames = undefined;
        this.orcActiveBattleCryFrames = undefined;
        this.scavengerIdleBladeTwirlFrames = undefined;
        this.scavengerActiveBattleCryFrames = undefined;
        this.selectionAnimTiming = undefined;
        this.selectionAnimFrameDurationMs = 0;
        this.selectionAnimFrameIndex = -1;
        this.isShowingOrcBattleCryFrame = false;
        this.isShowingScavengerFlourishFrame = false;
        this.baseTexture = undefined;
    }
    public setBadgeEmphasis(scale: number, amountOverride?: number): void {
        this.badgeEmphasisScale = scale;
        this.badgeAmountOverride = amountOverride;
    }
    public clearBadgeEmphasis(): void {
        this.badgeEmphasisScale = 1;
        this.badgeAmountOverride = undefined;
    }
    public setProjectedStackPower(power: number): void {
        this.projectedStackPower = Math.max(1, Math.min(HoCConstants.MAX_UNIT_STACK_POWER, Math.round(power)));
    }
    public clearProjectedStackPower(): void {
        this.projectedStackPower = undefined;
    }
    /**
     * The card behind a "revealed" unit — ranked placement shows the opponent's known army as a row of
     * B&W silhouettes, and without a marker they read as enemies already deployed on the board. A soft red
     * fill follows the painted footprint; the creature art itself identifies the draft while the stack size
     * stays redacted as "?" on the badge.
     * Non-revealed units keep the marker hidden, so nothing changes on the live board.
     */
    private ensureRosterCard(worldRoot: Container, gs: GridSettings, logicalPos: HoCMath.XY): void {
        if (this.visualMode !== "revealed") {
            if (this.rosterCard) {
                this.rosterCard.visible = false;
            }
            return;
        }

        if (!this.rosterCard) {
            this.rosterCard = new Container();
            this.rosterCardPlate = new Graphics();
            this.rosterCard.addChild(this.rosterCardPlate);
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            worldRoot.addChild(this.rosterCard);
        } else if (this.rosterCard.parent !== worldRoot) {
            worldRoot.addChild(this.rosterCard);
        }

        const cell = gs.getCellSize() * this.visualScaleMultiplier;
        const footprintWidth = this.getFootprintWidth();
        const footprintHeight = this.getFootprintHeight();
        const previousDrawState = this.rosterCardDrawState;
        const needsRedraw =
            !previousDrawState ||
            previousDrawState.x !== logicalPos.x ||
            previousDrawState.y !== logicalPos.y ||
            previousDrawState.cell !== cell ||
            previousDrawState.footprintWidth !== footprintWidth ||
            previousDrawState.footprintHeight !== footprintHeight ||
            previousDrawState.projected !== this.useBattlefieldVisualProjection;

        if (needsRedraw) {
            const plate = this.rosterCardPlate!;
            plate.clear();
            // The marker must cover exactly the cells the unit stands on, so each half-extent comes from
            // its own footprint side. They are equal for every square body, which is every shipped one.
            const halfFootprintWidth = (gs.getStep() * footprintWidth) / 2;
            const halfFootprintHeight = (gs.getStep() * footprintHeight) / 2;
            const logicalBottom = logicalPos.y - halfFootprintHeight;
            const footprintPoints = this.useBattlefieldVisualProjection
                ? revealedOpponentFootprintPoints(logicalPos, footprintWidth, footprintHeight, gs)
                : [
                      logicalPos.x - halfFootprintWidth,
                      logicalBottom,
                      logicalPos.x + halfFootprintWidth,
                      logicalBottom,
                      logicalPos.x + halfFootprintWidth,
                      logicalPos.y + halfFootprintHeight,
                      logicalPos.x - halfFootprintWidth,
                      logicalPos.y + halfFootprintHeight,
                      logicalPos.x - halfFootprintWidth,
                      logicalBottom,
                  ];
            // Highlight the cell itself instead of tracing it with a thin red outline. A fixed enemy red is
            // intentional: this remains an opponent cue even when the viewer occupies the red team.
            plate.poly(footprintPoints).fill({ color: 0xe02b35, alpha: 0.22 });

            this.rosterCardDrawState = {
                x: logicalPos.x,
                y: logicalPos.y,
                cell,
                footprintWidth,
                footprintHeight,
                projected: this.useBattlefieldVisualProjection,
            };
        }

        // Just under the sprite/shadow pair so the silhouette always sits on top of its own card.
        const visualCenter = this.useBattlefieldVisualProjection ? projectBattlefieldPoint(logicalPos, gs) : logicalPos;
        const zIndex = 4000 - visualCenter.y - 1;
        if (this.rosterCard.zIndex !== zIndex) this.rosterCard.zIndex = zIndex;
        if (!this.rosterCard.visible) this.rosterCard.visible = true;
    }
    /**
     * A stable per-unit phase, so a board full of stacks doesn't wave as one synchronised wall of cloth.
     * Hashed off the unit id rather than randomised, so a flag looks the same across a snapshot restore.
     */
    private badgeFlagPhase(): number {
        if (this.badgeFlagPhaseValue === undefined) {
            const id = this.getId();
            let hash = 0;
            for (let i = 0; i < id.length; i++) {
                hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
            }
            this.badgeFlagPhaseValue = ((hash % 1000) / 1000) * Math.PI * 2;
        }
        return this.badgeFlagPhaseValue;
    }
    /**
     * Redraw the compact Heroes-IV-style amount ribbon as cloth caught mid-wave.
     *
     * Runs every frame (the geometry it works from is cached — see BadgeDrawState.geometry), and the shape
     * is rebuilt from sines of the clock, so the motion simply continues forever with no loop point to see.
     *
     * The number stays put while the small right-hand tail moves subtly, preserving readability.
     */
    private drawBadgeFlag(
        flag: Graphics,
        glow: Graphics,
        g: BadgeFlagGeometry,
        teamColor: number,
        _stackPower: number,
        nowMs: number,
    ): void {
        const t = nowMs / 1000;
        const phase = this.badgeFlagPhase();
        const span = g.bannerRight - g.bannerLeft;

        const pointCount = FLAG_WAVE_SEGMENTS + 1;
        const topY = this.badgeFlagTopY ?? Array<number>(pointCount);
        const bottomY = this.badgeFlagBottomY ?? Array<number>(pointCount);
        const xs = this.badgeFlagXs ?? Array<number>(pointCount);
        this.badgeFlagTopY = topY;
        this.badgeFlagBottomY = bottomY;
        this.badgeFlagXs = xs;
        for (let i = 0; i <= FLAG_WAVE_SEGMENTS; i++) {
            const u = i / FLAG_WAVE_SEGMENTS;
            // The acting unit's flag is deliberately rigid: all active-turn motion belongs to the pointer.
            const offset = this.isActiveTurn ? 0 : flagWaveOffset(u, t, phase, g.flagHeight);
            xs[i] = g.bannerLeft + span * u;
            topY[i] = g.bannerTop + offset * FLAG_WAVE_TOP_FACTOR;
            bottomY[i] = g.bannerBottom + offset;
        }
        const last = FLAG_WAVE_SEGMENTS;
        // The swallowtail notch is cut into the free edge, so its tip rides whatever that edge is doing.
        const notchTipY = (topY[last] + bottomY[last]) * 0.5;

        glow.clear();
        glow.visible = false;

        flag.clear();
        traceBadgeFlag(flag, g, xs, topY, bottomY, notchTipY);
        // A personal tint brings its own three stops, so a chosen banner keeps the cloth shading the two
        // authored ones have instead of falling back to the flat fill below.
        const personalGradient = personalArmyFlagGradient(teamColor);
        const teamGradient =
            personalGradient ??
            (teamColor === TEAM_COLOR_GREEN
                ? GREEN_ARMY_FLAG_GRADIENT
                : teamColor === TEAM_COLOR_RED
                  ? RED_ARMY_FLAG_GRADIENT
                  : undefined);
        flag.fill(teamGradient ?? { color: teamColor, alpha: 1 });

        // Ten-percent shade under the digits increases local contrast without looking like a separate badge
        // or changing the team's red/green identity. The inset is larger than the cloth-wave amplitude, so
        // this rigid readability panel always remains inside the moving silhouette.
        const numberPanelLeft = g.bannerLeft + 2;
        const numberPanelRight = g.bannerRight - g.notchDepth - 1;
        flag.roundRect(
            numberPanelLeft,
            g.bannerTop + 2,
            numberPanelRight - numberPanelLeft,
            g.bannerBottom - g.bannerTop - 4,
            1,
        ).fill({ color: 0x000000, alpha: 0.1 });

        // Highlight along the top hem — it follows the wave, which is most of what sells the cloth as
        // curved rather than as a rectangle sliding up and down.
        const hemInset = Math.max(1, g.flagHeight * 0.05);
        flag.moveTo(xs[0] + hemInset, topY[0] + hemInset);
        for (let i = 1; i <= last; i++) {
            flag.lineTo(xs[i] - (i === last ? hemInset : 0), topY[i] + hemInset);
        }
        flag.stroke({ width: 0.75, color: 0xffffff, alpha: 0.32, cap: "round" });

        // Trace the animated silhouette once more and draw the gold edge last. `pixelLine` keeps the contour
        // at one physical screen pixel instead of letting the board/camera scale squeeze the 0.75-local-pixel
        // stroke onto changing sub-pixel coverage. The cloth still waves, but its gold edge no longer appears
        // to thicken, fade or "float" between animation frames.
        traceBadgeFlag(flag, g, xs, topY, bottomY, notchTipY);
        flag.stroke({
            width: g.borderWidth,
            color: g.borderColor,
            alpha: g.borderAlpha,
            join: "round",
            pixelLine: true,
        });
    }
    /**
     * Draw the active-turn marker in badge-local coordinates.
     *
     * The battlefield root is y-up, so the arrow tip sits at local y=0 while the body extends toward
     * positive y. On screen this becomes the requested downward arrow, positioned above the flag.
     */
    private drawActiveTurnPointer(
        pointer: Graphics,
        glow: Graphics,
        geometry: BadgeFlagGeometry,
        redrawGeometry: boolean,
        nowMs: number,
    ): void {
        if (
            !this.isActiveTurn ||
            this.activeTurnPointerSuppressed ||
            this.visualMode !== "normal" ||
            this.getAmountAlive() <= 0
        ) {
            if (pointer.visible) pointer.visible = false;
            if (glow.visible) glow.visible = false;
            return;
        }

        const arrowHeight = Math.max(8, geometry.flagHeight * 0.82) * ACTIVE_TURN_POINTER_SIZE_SCALE;
        const arrowHalfWidth = Math.max(4, geometry.headerWidth * 0.16) * ACTIVE_TURN_POINTER_SIZE_SCALE;
        const shaftHalfWidth = arrowHalfWidth * 0.42;
        const headHeight = arrowHeight * 0.47;
        const flagGap = activeTurnPointerGap(geometry.flagHeight, geometry.headerWidth);
        const timeSeconds = nowMs / 1000;
        const activeGlow = activeFlagGlowAlphaForTime(timeSeconds);
        const pointerScale = activeFlagScaleForTime(timeSeconds);

        const pointerY = geometry.bannerBottom + flagGap;
        if (redrawGeometry) {
            glow.clear();
            traceActiveTurnPointer(glow, shaftHalfWidth, arrowHalfWidth, arrowHeight, headHeight);
            glow.stroke({
                width: Math.max(4, geometry.flagHeight * 0.34),
                color: ACTIVE_FLAG_GLOW_COLOR,
                alpha: 0.16,
                join: "round",
            });
            traceActiveTurnPointer(glow, shaftHalfWidth, arrowHalfWidth, arrowHeight, headHeight);
            glow.stroke({
                width: Math.max(2, geometry.flagHeight * 0.16),
                color: ACTIVE_FLAG_GLOW_COLOR,
                alpha: 0.36,
                join: "round",
            });

            pointer.clear();
            traceActiveTurnPointer(pointer, shaftHalfWidth, arrowHalfWidth, arrowHeight, headHeight);
            pointer.fill({ color: ACTIVE_TURN_GOLD_COLOR, alpha: 1 });
            traceActiveTurnPointer(pointer, shaftHalfWidth, arrowHalfWidth, arrowHeight, headHeight);
            pointer.stroke({
                width: 1,
                color: 0x100d08,
                alpha: 1,
                join: "miter",
                pixelLine: true,
            });
        }
        if (glow.x !== 0 || glow.y !== pointerY) glow.position.set(0, pointerY);
        glow.scale.set(pointerScale);
        if (glow.alpha !== activeGlow) glow.alpha = activeGlow;
        if (!glow.visible) glow.visible = true;
        const blurFilter = activeTurnGlowBlurFilter();
        if (blurFilter) {
            if (glow.filters?.length !== 1 || glow.filters[0] !== blurFilter) glow.filters = [blurFilter];
            blurFilter.strength = 1.6 + activeGlow * 1.4;
        }

        if (pointer.x !== 0 || pointer.y !== pointerY) pointer.position.set(0, pointerY);
        pointer.scale.set(pointerScale);
        if (!pointer.visible) pointer.visible = true;
    }
    /** Hide both parts synchronously so the marker is gone before the first movement/action frame. */
    private suppressActiveTurnPointer(): void {
        if (!this.isActiveTurn) return;
        this.activeTurnPointerSuppressed = true;
        if (this.activeTurnPointer?.visible) this.activeTurnPointer.visible = false;
        if (this.badgeFlagGlow?.visible) this.badgeFlagGlow.visible = false;
    }
    private watchBattlefieldCreatureFramingChanges(worldRoot: Container, gs: GridSettings, unitName: string): void {
        if (typeof window === "undefined" || import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") return;
        this.battlefieldFramingWorldRoot = worldRoot;
        this.battlefieldFramingGridSettings = gs;
        if (this.battlefieldFramingChangeListener) return;

        this.battlefieldFramingChangeListener = (event: Event) => {
            const changedUnitName = (event as CustomEvent<BattlefieldCreatureFramingChangeDetail>).detail?.unitName;
            if (changedUnitName && changedUnitName !== unitName) return;
            const currentWorldRoot = this.battlefieldFramingWorldRoot;
            const currentGridSettings = this.battlefieldFramingGridSettings;
            if (this.isDestroyed || !currentWorldRoot || !currentGridSettings) return;
            this.ensureVisual(currentWorldRoot, currentGridSettings);
        };
        window.addEventListener(BATTLEFIELD_CREATURE_FRAMING_CHANGE_EVENT, this.battlefieldFramingChangeListener);
    }
    private ensureBadge(
        worldRoot: Container,
        gs: GridSettings,
        props: UnitProperties,
        pos: HoCMath.XY,
        parentScale: HoCMath.XY,
        now: number,
    ): void {
        if (!SHOW_BOARD_STACK_DECORATIONS) {
            if (this.badgeContainer?.visible) this.badgeContainer.visible = false;
            return;
        }
        if (!this.badgeContainer) {
            this.badgeContainer = new Container();
            // Keep the response emblem behind the flag through deterministic child order. Enabling local
            // z-index sorting here can either raise it over the cloth or drop it out of the rendered batch.
            this.badgeContainer.sortableChildren = false;
            this.badgeHeader = new Graphics();
            this.badgeFlagGlow = new Graphics();
            this.badgeFlagGlow.blendMode = "add";
            this.badgeFlag = new Graphics();
            this.activeTurnPointer = new Graphics();
            this.badgeText = new Text({
                text: "0",
                style: new TextStyle({
                    fill: 0xffffff,
                    fontSize: 14,
                    fontWeight: "700",
                    fontFamily: BOARD_FONT_FAMILY,
                }),
            });
            this.badgeText.anchor.set(0.5);
            this.badgeText.scale.y = -1;
            this.badgeContainer.addChild(
                this.badgeHeader,
                this.badgeFlagGlow,
                this.badgeFlag,
                this.activeTurnPointer,
                this.badgeText,
            );
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            this.badgeContainer.zIndex = 4000 - pos.y + 1; // Initial Set
            worldRoot.addChild(this.badgeContainer);
        } else if (this.badgeContainer.parent !== worldRoot) {
            // Force re-parent if container changed (e.g. from worldRoot to unitsContainer)
            worldRoot.addChild(this.badgeContainer);
        }
        // Reset live containers preserved by hot reload too; child order below is the single layer authority.
        if (this.badgeContainer.sortableChildren) this.badgeContainer.sortableChildren = false;
        // Hot module replacement can preserve a unit created before the rigid header was introduced.
        // Upgrade that live container in place so testing never requires rebuilding the whole fight.
        if (!this.badgeHeader || !this.badgeFlagGlow || !this.activeTurnPointer) {
            this.badgeHeader ??= new Graphics();
            this.badgeFlagGlow ??= new Graphics();
            this.activeTurnPointer ??= new Graphics();
            this.badgeFlagGlow.blendMode = "add";
            this.badgeContainer.addChild(
                this.badgeHeader,
                this.badgeFlagGlow,
                this.badgeFlag!,
                this.activeTurnPointer,
                this.badgeText!,
            );
            this.badgeDrawState = undefined;
        }
        const iconSide = gs.getCellSize() * this.visualScaleMultiplier;
        const amount = this.badgeAmountOverride ?? this.getAmountAlive();
        const stackPower = Math.max(0, Math.min(5, Math.round(this.projectedStackPower ?? this.getStackPower())));
        const header = this.badgeHeader!;
        const flagGlow = this.badgeFlagGlow!;
        const flag = this.badgeFlag!;
        const activeTurnPointer = this.activeTurnPointer!;
        const text = this.badgeText!;
        const container = this.badgeContainer!;
        // The selected Heroes-IV-style treatment is a single horizontal count ribbon. Clear and hide the
        // former rigid header so hot reload also removes the old stack-layout graphics immediately.
        if (header.visible) {
            header.clear();
            header.visible = false;
        }
        if (!flag.visible) flag.visible = true;
        // Revealed opponents (ranked placement) carry a sanitized stack of 0 — the flag still shows,
        // team-colored, with "?" standing in for the hidden stack size.
        const isRevealed = this.visualMode === "revealed";
        const label = isRevealed && amount <= 0 ? "?" : String(amount);
        const teamColor =
            props.team === TeamVals.NO_TEAM
                ? NO_TEAM_ROSTER_COLOR
                : // A player may repaint the armies: their OWN in a chosen colour, the enemy in red.
                  (personalArmyPresetFor(props.team)?.color ?? resolveTeamColor(props.team));
        // The board camera is deliberately flatter on Y than X. Compensate the ribbon's height so it keeps
        // the intended horizontal Heroes-IV proportions on screen.
        const parentScaleRatio = Math.max(0.75, Math.min(2.5, parentScale.x / Math.max(0.01, parentScale.y)));
        const previousDrawState = this.badgeDrawState;
        const needsRedraw =
            !previousDrawState ||
            previousDrawState.iconSide !== iconSide ||
            previousDrawState.label !== label ||
            previousDrawState.teamColor !== teamColor ||
            previousDrawState.stackPower !== stackPower ||
            previousDrawState.isActiveTurn !== this.isActiveTurn ||
            previousDrawState.parentScaleRatio !== parentScaleRatio ||
            previousDrawState.geometry.bannerLeft !== -previousDrawState.geometry.headerWidth * 0.5;

        if (needsRedraw) {
            const baseCellSide = gs.getCellSize();
            // Variant 5: one tiny horizontal count ribbon, including a shallow cut-out at its right edge.
            // There is intentionally no second cloth piece and no stack-power geometry.
            const headerWidth = Math.max(29, Math.floor(baseCellSide * 0.42));
            const headerHeight = Math.max(13, Math.floor(baseCellSide * 0.2)) * parentScaleRatio;
            const notchDepth = Math.max(3, Math.floor(headerWidth * 0.14));
            const preferredFontSize = Math.max(
                11,
                Math.floor(baseCellSide * 0.2),
                Math.ceil(9 / Math.max(0.01, parentScale.x)),
            );
            const usableTextWidth = (headerWidth - notchDepth) * 0.84;
            const estimatedTextWidth = Math.max(1, label.length * preferredFontSize * 0.62);
            const fittedFontSize = Math.max(
                8,
                Math.floor(preferredFontSize * Math.min(1, usableTextWidth / estimatedTextWidth)),
            );
            // Three-digit amounts are the common battlefield case and should fill the compact inner frame.
            // Keep shorter/longer labels on the established scale so only 100-999 receives this enlargement.
            const fs = fittedFontSize * (label.length === 3 ? 1.45 : 1.15) * 1.06;

            text.style = new TextStyle({
                fill: 0xffffff,
                fontSize: fs,
                fontWeight: "900",
                fontFamily: BOARD_FONT_FAMILY,
                dropShadow: {
                    color: "#000000",
                    blur: 1,
                    angle: Math.PI / 4,
                    distance: 1,
                },
            });
            text.text = label;
            // Shift the digits away from the right-hand notch so the visible cloth, not the bounding box,
            // determines their optical centre.
            text.position.set(-notchDepth * 0.18, 0);
            this.badgeDrawState = {
                iconSide,
                label,
                teamColor,
                stackPower,
                isActiveTurn: this.isActiveTurn,
                parentScaleRatio,
                // Everything the per-frame cloth pass needs, resolved once here: only the wave changes
                // between frames, so re-deriving the banner's size on every tick would be pure waste.
                geometry: {
                    bannerLeft: -headerWidth * 0.5,
                    bannerRight: headerWidth * 0.5,
                    bannerTop: -headerHeight * 0.5,
                    bannerBottom: headerHeight * 0.5,
                    notchDepth,
                    flagHeight: headerHeight,
                    borderWidth: 0.75,
                    borderColor: 0xb08a45,
                    borderAlpha: 1,
                    headerWidth,
                    headerHeight,
                },
            };
        }
        if (flag.rotation !== BATTLEFIELD_FLAG_ROTATION) flag.rotation = BATTLEFIELD_FLAG_ROTATION;
        const geometry = this.badgeDrawState!.geometry;
        if (flag.x !== 0 || flag.y !== 0) flag.position.set(0, 0);
        const visible = this.visualMode !== "hidden" && (amount > 0 || isRevealed);
        const waveFrame = Math.floor(now / BADGE_FLAG_WAVE_FRAME_MS);
        const advanceFlagWave = visible && !this.isActiveTurn && waveFrame !== this.badgeFlagWaveFrame;
        if (needsRedraw || advanceFlagWave) {
            this.drawBadgeFlag(flag, flagGlow, geometry, teamColor, stackPower, now);
            this.badgeFlagWaveFrame = waveFrame;
        }
        this.drawActiveTurnPointer(activeTurnPointer, flagGlow, geometry, needsRedraw, now);
        // The flag stays static during the active turn; only authored preview emphasis may resize it.
        const renderedBadgeScale = this.badgeEmphasisScale;
        const margin = Math.max(2, Math.floor(iconSide * 0.04));
        let x: number;
        let y: number;
        if (this.oneShotAnim && this.oneShotBadgePosition) {
            // One-shot atlases change their transparent canvas bounds radically between poses. The flag
            // belongs to the unit's board position, so retain the exact pre-action coordinates instead of
            // following the attacking weapon tip or the collapsing death silhouette.
            x = this.oneShotBadgePosition.x;
            y = this.oneShotBadgePosition.y;
        } else {
            // Centre the ribbon above the actual rendered creature image rather than above its logical cell.
            // This keeps the badge over the head for tall, short and multi-cell creatures alike.
            const spriteBounds = this.getCreatureBounds();
            if (spriteBounds && spriteBounds.width > 0 && spriteBounds.height > 0) {
                const screenHalfHeight = geometry.flagHeight * parentScale.y * renderedBadgeScale * 0.5;
                const screenAnchor = (this.badgeScreenAnchor ??= new Point());
                // Sword-idle cells reserve 400px above the resting figure. Keep its count over the
                // head instead of lifting it to that empty canvas margin or following the blade.
                const idleHeadInset =
                    this.berserkerLabIdleScale() !== 1 && !this.walkAnim ? (spriteBounds.height * 400) / 1024 : 0;
                screenAnchor.set(
                    spriteBounds.x + spriteBounds.width * 0.5,
                    spriteBounds.y + idleHeadInset - margin - screenHalfHeight,
                );
                const aboveHead = worldRoot.toLocal(
                    screenAnchor,
                    undefined,
                    (this.badgeLocalAnchor ??= new Point()),
                    true,
                );
                x = aboveHead.x;
                y = aboveHead.y;
            } else {
                // Clear the body's own half-height, which is the footprint's HEIGHT in cells: a two-row body
                // would otherwise sit its count ribbon on the seam between its own cells.
                x = pos.x;
                y = pos.y + iconSide * this.getFootprintHeight() * 0.5 + geometry.flagHeight * 0.5 + margin;
            }
            const flagFraming = resolveStoredBattlefieldCreatureFraming(props.name);
            x += flagOffsetXForFacing(flagFraming.flagOffsetXCells ?? 0, this.facingDirection) * gs.getCellSize();
            y -= (flagFraming.flagOffsetYCells ?? 0) * gs.getCellSize();
            if (this.movementBadgeOffsetY !== undefined || this.walkAnim) {
                // Follow the route's projected ground height, not the current frame's canvas,
                // foot anchor, tilt or bounce. Keep the same offset through turns and landing.
                this.movementBadgeOffsetY ??= y - pos.y;
                y = pos.y + this.movementBadgeOffsetY;
            } else {
                this.restingBadgeOffsetY = y - pos.y;
            }
        }
        if (container.x !== x || container.y !== y) container.position.set(x, y);
        if (container.scale.x !== renderedBadgeScale || container.scale.y !== renderedBadgeScale) {
            container.scale.set(renderedBadgeScale, renderedBadgeScale);
        }
        if (container.visible !== visible) container.visible = visible;
    }
    /**
     * Pixi's world-space bounds walk the display tree. Most simulation steps leave both the creature and
     * its units container unchanged, so retain that result until either local geometry or the parent camera
     * transform changes. The badge and overlap sorter then share the same measurement across steady ticks.
     */
    private getCreatureBounds(): Bounds | undefined {
        const sprite = this.sprite;
        const parent = sprite?.parent;
        if (!sprite || !parent) return undefined;
        const state = this.depthSortBoundsCacheState;
        const world = parent.worldTransform;
        const unchanged =
            this.depthSortBoundsAreCurrent &&
            state?.texture === sprite.texture &&
            state.parent === parent &&
            state.spriteX === sprite.x &&
            state.spriteY === sprite.y &&
            state.spriteScaleX === sprite.scale.x &&
            state.spriteScaleY === sprite.scale.y &&
            state.spriteRotation === sprite.rotation &&
            state.spritePivotX === sprite.pivot.x &&
            state.spritePivotY === sprite.pivot.y &&
            state.spriteSkewX === sprite.skew.x &&
            state.spriteSkewY === sprite.skew.y &&
            state.spriteAnchorX === sprite.anchor.x &&
            state.spriteAnchorY === sprite.anchor.y &&
            state.parentX === parent.x &&
            state.parentY === parent.y &&
            state.parentScaleX === parent.scale.x &&
            state.parentScaleY === parent.scale.y &&
            state.parentRotation === parent.rotation &&
            state.parentPivotX === parent.pivot.x &&
            state.parentPivotY === parent.pivot.y &&
            state.parentSkewX === parent.skew.x &&
            state.parentSkewY === parent.skew.y &&
            state.parentWorldA === world.a &&
            state.parentWorldB === world.b &&
            state.parentWorldC === world.c &&
            state.parentWorldD === world.d &&
            state.parentWorldTx === world.tx &&
            state.parentWorldTy === world.ty;
        if (unchanged) return this.depthSortBounds;

        const bounds = sprite.getBounds(false, (this.depthSortBounds ??= new Bounds()));
        const updatedWorld = parent.worldTransform;
        const updatedState = (this.depthSortBoundsCacheState ??= {} as CreatureBoundsCacheState);
        updatedState.texture = sprite.texture;
        updatedState.parent = parent;
        updatedState.spriteX = sprite.x;
        updatedState.spriteY = sprite.y;
        updatedState.spriteScaleX = sprite.scale.x;
        updatedState.spriteScaleY = sprite.scale.y;
        updatedState.spriteRotation = sprite.rotation;
        updatedState.spritePivotX = sprite.pivot.x;
        updatedState.spritePivotY = sprite.pivot.y;
        updatedState.spriteSkewX = sprite.skew.x;
        updatedState.spriteSkewY = sprite.skew.y;
        updatedState.spriteAnchorX = sprite.anchor.x;
        updatedState.spriteAnchorY = sprite.anchor.y;
        updatedState.parentX = parent.x;
        updatedState.parentY = parent.y;
        updatedState.parentScaleX = parent.scale.x;
        updatedState.parentScaleY = parent.scale.y;
        updatedState.parentRotation = parent.rotation;
        updatedState.parentPivotX = parent.pivot.x;
        updatedState.parentPivotY = parent.pivot.y;
        updatedState.parentSkewX = parent.skew.x;
        updatedState.parentSkewY = parent.skew.y;
        updatedState.parentWorldA = updatedWorld.a;
        updatedState.parentWorldB = updatedWorld.b;
        updatedState.parentWorldC = updatedWorld.c;
        updatedState.parentWorldD = updatedWorld.d;
        updatedState.parentWorldTx = updatedWorld.tx;
        updatedState.parentWorldTy = updatedWorld.ty;
        this.depthSortBoundsAreCurrent = bounds.width > 0 && bounds.height > 0;
        return bounds;
    }
    private syncFlagStatusIcon(
        kind: "hourglass" | "stun" | "respond",
        texKey: string,
        shouldRender: boolean,
        badge: Container | undefined,
    ): void {
        let container =
            kind === "hourglass"
                ? this.hourglassContainer
                : kind === "stun"
                  ? this.stunContainer
                  : this.respondContainer;
        let sprite =
            kind === "hourglass" ? this.hourglassSprite : kind === "stun" ? this.stunSprite : this.respondSprite;
        if (!container && !shouldRender) return;
        if (!shouldRender || !badge) {
            if (container?.visible) container.visible = false;
            return;
        }

        const tex = this.texResolver(texKey);
        if (!tex) {
            if (container?.visible) container.visible = false;
            return;
        }
        if (!container) container = new Container();
        if (!sprite) {
            sprite = new Sprite(tex);
            sprite.anchor.set(0.5);
            container.addChild(sprite);
        } else if (sprite.texture !== tex) {
            sprite.texture = tex;
        }
        if (container.parent !== badge) badge.addChild(container);
        if (!container.visible) container.visible = true;
        if (!sprite.visible) sprite.visible = true;

        if (kind === "hourglass") {
            this.hourglassContainer = container;
            this.hourglassSprite = sprite;
        } else if (kind === "stun") {
            this.stunContainer = container;
            this.stunSprite = sprite;
        } else {
            this.respondContainer = container;
            this.respondSprite = sprite;
        }
    }
    /** Keep turn-state badges attached on the left and the spent-response crossed swords behind the count flag. */
    private ensureFlagStatusIndicators(now?: number): void {
        const badge = this.badgeContainer;
        const geometry = this.badgeDrawState?.geometry;
        const canRender =
            (this.visualMode ?? "normal") === "normal" &&
            this.getAmountAlive() > 0 &&
            Boolean(badge?.visible && geometry);

        this.syncFlagStatusIcon("hourglass", "hourglass", canRender && this.shouldShowHourglassIndicator(), badge);
        this.syncFlagStatusIcon("stun", "stun_hand_forged", canRender && this.shouldShowStunIndicator(), badge);
        this.syncFlagStatusIcon("respond", "tag", canRender && this.shouldShowRespondTag(now), badge);

        const hourglassContainer = this.hourglassContainer;
        const hourglassSprite = this.hourglassSprite;
        const stunContainer = this.stunContainer;
        const stunSprite = this.stunSprite;
        const respondContainer = this.respondContainer;
        const respondSprite = this.respondSprite;

        // The count cloth hides the swords' central crossing; only blades and hilts protrude around it.
        if (badge && respondContainer?.parent === badge) {
            if (respondContainer.zIndex !== 0) respondContainer.zIndex = 0;
            if (badge.getChildIndex(respondContainer) !== 0) badge.setChildIndex(respondContainer, 0);
        }

        if (!canRender || !geometry) return;
        // Match the amount flag exactly in height. The hourglass source has nine transparent pixels on the
        // right side of its 64 px canvas; tuck that empty inset into the flag so the visible gold bar reads
        // as physically attached while its top and bottom remain perfectly level with the cloth.
        const iconSide = geometry.flagHeight;
        if (hourglassContainer?.visible && hourglassSprite?.visible) {
            if (hourglassSprite.width !== iconSide) hourglassSprite.width = iconSide;
            if (hourglassSprite.height !== iconSide) hourglassSprite.height = iconSide;
            const flippedScaleY = -Math.abs(hourglassSprite.scale.y);
            if (hourglassSprite.scale.y !== flippedScaleY) hourglassSprite.scale.y = flippedScaleY;
            const hourglassTransparentInset = iconSide * (9 / 64);
            const x = geometry.bannerLeft - iconSide * 0.5 + hourglassTransparentInset;
            if (hourglassContainer.x !== x || hourglassContainer.y !== 0) hourglassContainer.position.set(x, 0);
        }

        if (stunContainer?.visible && stunSprite?.visible) {
            const layout = stunBadgeLayout(iconSide, geometry.bannerLeft);
            if (stunSprite.width !== layout.width) stunSprite.width = layout.width;
            if (stunSprite.height !== layout.height) stunSprite.height = layout.height;
            const flippedScaleY = -Math.abs(stunSprite.scale.y);
            if (stunSprite.scale.y !== flippedScaleY) stunSprite.scale.y = flippedScaleY;
            if (stunContainer.x !== layout.centerX || stunContainer.y !== 0)
                stunContainer.position.set(layout.centerX, 0);
        }

        if (respondContainer?.visible && respondSprite?.visible) {
            const emblemSide = geometry.headerWidth * RESPOND_EMBLEM_CANVAS_SCALE;
            if (respondSprite.width !== emblemSide) respondSprite.width = emblemSide;
            const emblemHeight = emblemSide * RESPOND_EMBLEM_HEIGHT_SCALE;
            if (respondSprite.height !== emblemHeight) respondSprite.height = emblemHeight;
            const flippedScaleY = -Math.abs(respondSprite.scale.y);
            if (respondSprite.scale.y !== flippedScaleY) respondSprite.scale.y = flippedScaleY;
            const x = (geometry.bannerLeft + geometry.bannerRight) * 0.5;
            if (respondContainer.x !== x || respondContainer.y !== 0) respondContainer.position.set(x, 0);
        }
    }
    private shouldShowHourglassIndicator(): boolean {
        // A stunned/skipping unit shows the stun state instead, so suppress the hourglass as before.
        if (this.isSkippingForDisplay()) return false;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        return this.isOnHourglass() || fightProps.hourglassIncludes(this.getId());
    }
    /**
     * Whether to show the retaliation tag. The legacy `responded` flag isn't propagated in the new
     * engine — the authoritative "already retaliated this round" state lives on FightProperties
     * (set via addRepliedAttack, cleared each lap), so read it from there.
     */
    /**
     * Capability indicator (NOT a "has already retaliated" mark): show the respond tag on a RANGE unit
     * that can still RETURN FIRE — it has range shots left and isn't blocked from responding (stun,
     * blindness, Through Shot). Melee retaliation is the default and isn't tagged; the tag flags the
     * conditional case (a ranged unit will shoot back). Retaliation is once per lap (enforced server-side
     * by processOneInTheFieldAbility), so once a unit has used its response this lap the tag clears —
     * except Unicorn's "One in the Field", which responds infinitely and always shows. (In ranked the
     * per-lap replied state isn't synced to the client, so there it reflects shots/eligibility only.)
     */
    private shouldShowRespondTag(now?: number): boolean {
        // The tag is a "HAS already retaliated this lap" marker — NOT a "can still respond" capability
        // hint. It was inverted before (showing on any ranged unit that COULD return fire), which is why
        // e.g. a Medusa that had not yet retaliated wrongly showed it. Read the authoritative per-lap
        // replied state (addRepliedAttack, cleared each lap). Kept to RANGE units since a ranged return-
        // fire is the notable case the tag flags (melee retaliation is the default and untagged).
        // Show it for ANY unit (melee OR ranged) that has used its retaliation this lap — retaliation is
        // once per lap and the tag flags "already responded". Sources: `responded` is set by the engine on
        // every responder (processOneInTheFieldAbility) and, in ranked, synced from the snapshot
        // (RankedPlayScene). FightProperties' replied set is the sandbox-authoritative fallback. Either => true.
        return (
            this.responded ||
            FightStateManager.getInstance().getFightProperties().hasAlreadyRepliedAttack(this.getId()) ||
            (now ?? performance.now()) < this.respondFeedbackUntilMs
        );
    }
    /** Build/reveal the response layer in the same tick the combat engine records a retaliation. */
    public override setResponded(hasResponded: boolean): void {
        super.setResponded(hasResponded);
        if (hasResponded) {
            // Floating attack/response feedback remains on screen for roughly this interval. The latch is
            // only a presentation fallback: while the per-lap engine state remains true the emblem stays
            // visible indefinitely, and once it clears the timer removes this last-action confirmation.
            const feedbackMs = 1600;
            // `fromBase` upgrades an existing Unit instance without running subclass field initializers,
            // so treat the first value as zero instead of letting Math.max(undefined, ...) become NaN.
            this.respondFeedbackUntilMs = Math.max(this.respondFeedbackUntilMs || 0, performance.now() + feedbackMs);
            if (this.respondFeedbackTimer !== undefined) clearTimeout(this.respondFeedbackTimer);
            this.respondFeedbackTimer = setTimeout(() => {
                this.respondFeedbackTimer = undefined;
                if (performance.now() < this.respondFeedbackUntilMs || this.shouldShowRespondTag()) return;
                if (this.respondContainer) this.respondContainer.visible = false;
            }, feedbackMs + 20);
        }
        // Attack resolution can be the target's last scene update for the whole turn. Build and lay out
        // the marker here so the actual retaliation—not a later move or activation—makes it appear.
        if (this.shouldShowRespondTag() && !this.respondContainer && this.badgeContainer && this.badgeDrawState) {
            this.ensureFlagStatusIndicators();
        }
        if (!this.respondContainer) return;
        const visible =
            this.shouldShowRespondTag() &&
            (this.visualMode ?? "normal") === "normal" &&
            this.getAmountAlive() > 0 &&
            Boolean(this.badgeContainer?.visible);
        if (this.respondContainer.visible !== visible) this.respondContainer.visible = visible;
    }
    /** Sync the authoritative "already hourglassed (waited) this lap" flag from a ranked snapshot. */
    public setHasHourglassed(value: boolean): void {
        this.hasHourglassedThisLap = value;
    }
    /** Whether this unit already used its once-per-lap hourglass (wait) — per the last ranked snapshot. */
    public getHasHourglassed(): boolean {
        return this.hasHourglassedThisLap;
    }
    /** Sync the authoritative "skipping this turn" (Stun/Blindness) flag from a ranked snapshot. */
    public setSkipping(value: boolean): void {
        this.skippingThisTurnSynced = value;
        // Snapshot metadata is applied after the board sprite has already been drawn. Refresh this local
        // badge immediately; otherwise the queue shows Stun while the board waits until the unit's turn.
        this.refreshTurnStatusIndicators();
    }
    /** Keep live sandbox effects and snapshot-only ranked state on the same visual update path. */
    private refreshTurnStatusIndicators(): void {
        if (this.badgeContainer && this.badgeDrawState) this.ensureFlagStatusIndicators();
    }
    public override applyEffect(effect: Effect): boolean {
        const applied = super.applyEffect(effect);
        if (applied && ["Stun", "Blindness", "Freeze"].includes(effect.getName())) {
            this.refreshTurnStatusIndicators();
        }
        return applied;
    }
    public override deleteEffect(effectName: string): void {
        super.deleteEffect(effectName);
        if (["Stun", "Blindness", "Freeze"].includes(effectName)) {
            this.refreshTurnStatusIndicators();
        }
    }
    /**
     * Whether to show the stun icon / treat the unit as skipping this turn FOR DISPLAY — the live effect
     * check (sandbox) OR the flag synced from the ranked snapshot (where the effect isn't on the wire).
     */
    private isSkippingForDisplay(): boolean {
        return this.skippingThisTurnSynced || this.isSkippingThisTurn();
    }
    /**
     * Whether to draw the stun badge beside the flag. A skipping unit normally shows it — EXCEPT under
     * "Freeze", where the ice crust already reads as "this unit can't act", so the badge would just clutter
     * the frozen shell. The hourglass stays suppressed regardless: that keys off isSkippingForDisplay, which
     * Freeze keeps true. (Up-next/ALT views have no ice crust, so their stun icon is unaffected by this.)
     */
    private shouldShowStunIndicator(): boolean {
        return this.isSkippingForDisplay() && !this.hasStatusEffect("Freeze");
    }
    public setActiveTurn(active: boolean): void {
        if (this.isActiveTurn === active) return;
        this.isActiveTurn = active;
        // A suppression belongs only to the action that consumed the previous turn.
        this.activeTurnPointerSuppressed = false;
        if (active) {
            this.activeTurnAnimationStartedAtMs = performance.now();
        } else if (this.getUnitProperties().name === SCAVENGER_UNIT_NAME) {
            // Count the four inactive breathing cycles from the moment Scavenger's turn ends.
            this.selectionAnimationStartedAtMs = performance.now();
        }
        this.isShowingOrcBattleCryFrame = false;
        this.isShowingScavengerFlourishFrame = false;
        this.selectionAnimFrameIndex = -1;
        // The opening pose must appear on the same render pass that grants the creature its turn.
        this.stepSelectionAnimation();
    }
    /** Reuse the combat turn indicator while inspecting a placed unit before combat starts. */
    public setHoverTurnAura(hovered: boolean): void {
        this.isHoverTurnAura = hovered;
    }
    /**
     * Reconcile this unit's remaining stack stats (alive count, top-unit hp, dead count) to an
     * authoritative snapshot. Snapshot-driven clients (ranked) need this because a replayed action
     * animates the hit but its EVENTS don't mutate the stack — so attack/retaliation damage would
     * otherwise leave the on-board count frozen. Pure display reconciliation, hence a client concern.
     */
    public setRemainingStats(amountAlive: number, hp: number, amountDied: number): void {
        const alive = Math.max(0, Math.floor(amountAlive));
        this.unitProperties.amount_alive = alive;
        this.initialUnitProperties.amount_alive = alive;
        const clampedHp = Math.max(0, Math.min(Math.floor(hp), this.unitProperties.max_hp));
        this.unitProperties.hp = clampedHp;
        this.initialUnitProperties.hp = clampedHp;
        const died = Math.max(0, Math.floor(amountDied));
        this.unitProperties.amount_died = died;
        this.initialUnitProperties.amount_died = died;
    }
    /**
     * Reconcile the one ranked snapshot effect that must be mechanical rather than display-only. Break mutes
     * every ability lookup in common; keeping it as text alone lets local passive refreshes and movement
     * previews re-enable abilities that the authoritative server has disabled.
     */
    public syncAuthoritativeBreak(laps?: number): boolean {
        const authoritativeLaps = laps !== undefined && Number.isFinite(laps) && laps > 0 ? Math.floor(laps) : 0;
        const current = this.getEffect("Break");

        if (!authoritativeLaps) {
            if (!current) return false;
            this.deleteEffect("Break");
            return true;
        }
        if (current?.getLaps() === authoritativeLaps) return false;

        const effect = this.effectFactory.makeEffect("Break");
        if (!effect) return false;
        effect.getProperties().laps = authoritativeLaps;
        return this.applyEffect(effect);
    }
    /** Tint the active-turn aura (e.g. red for the enemy's turn in ranked, white otherwise). */
    public setActiveAuraColor(color: number): void {
        this.activeAuraColor = color;
    }
    /**
     * Apply a brief positional "recoil": the sprite/shadow jerk by (dx, dy) and spring back over
     * ~220ms. Used for attack lunges and authored special-ability motion.
     */
    public applyRecoil(dx: number, dy: number): void {
        const props = this.getUnitProperties();
        if (!creatureGenericCombatMotionEnabledForUnit(props.name, props.level)) {
            this.clearGenericCombatRecoil();
            return;
        }
        this.recoilStartMs = performance.now();
        this.recoilDx = dx;
        this.recoilDy = dy;
        this.recoilShakeAmplitude = 0;
        this.recoilWindup = false;
        this.recoilDurationMs = 220;
    }
    /**
     * Softer damage reaction: half-length knockback, a slower return and a very small perpendicular
     * shake. Kept separate from applyRecoil so attack lunges and authored ability motion are unchanged.
     */
    public applyHitReaction(dx: number, dy: number): void {
        const props = this.getUnitProperties();
        const unitName = props.name;
        if (
            !creatureGenericCombatMotionEnabledForUnit(unitName, props.level) ||
            (unitName === TROLL_UNIT_NAME && this.creatureAnimationLabPreviewEnabled)
        ) {
            // Peasant's authored hit already contains the full recoil. Play it without adding the
            // generic world-space displacement/shake that would slide its floor-locked boots.
            if (
                this.hasAnimationState("hit") &&
                !this.isPlayingOneShotAnimation("death") &&
                !this.isPlayingOneShotAnimation("hit") &&
                !this.isPlayingForegroundAttackAnimation()
            ) {
                this.playOneShotAnimation("hit");
            }
            this.clearGenericCombatRecoil();
            return;
        }
        // dx points away from the impact source, so its inverse turns Wandering Mage toward whoever hit it.
        this.setBoardFacingFromMovement(-dx);
        // Keep the authored damage pose in the same low-level path as the positional recoil. Both the
        // live sandbox and authoritative replay ultimately land here, so neither mode can miss it.
        if (this.hasAnimationState("hit") && !this.isPlayingOneShotAnimation("death")) {
            this.playOneShotAnimation("hit");
        }
        this.recoilStartMs = performance.now();
        this.recoilDx = dx * 0.5;
        this.recoilDy = dy * 0.5;
        const shortenedLength = Math.hypot(this.recoilDx, this.recoilDy);
        this.recoilShakeAmplitude = Math.min(2.2, Math.max(0.8, shortenedLength * 0.14));
        this.recoilWindup = false;
        this.recoilDurationMs = 330;
    }
    /**
     * "Bullet-time" dodge for a fully-missed attack: the unit dashes (dx, dy) out of the strike line
     * with a lean and a green-washed afterimage trail, hangs at full extension for a beat, then springs
     * back with a slight overshoot. (dx, dy) is the world-space displacement at full extension — the
     * caller computes it from the attack direction (see Sandbox.showAttackMissedVfx). Safe to call in
     * any mode; a dodge already in flight is restarted but keeps its fading ghosts.
     */
    public playDodgeAnimation(dx: number, dy: number): void {
        if (!this.sprite || this.isDestroyed) return;
        const props = this.getUnitProperties();
        if (!creatureGenericCombatMotionEnabledForUnit(props.name, props.level)) {
            this.clearGenericDodgeAnimation();
            return;
        }
        this.suppressActiveTurnPointer();
        // Lean INTO the dodge: tip the sprite toward the escape direction so the sidestep reads as a
        // committed lean rather than a horizontal teleport. Screen-x sign picks the tilt side.
        const lean = (dx >= 0 ? -1 : 1) * DODGE_LEAN_RAD;
        this.dodgeAnim = {
            startMs: performance.now(),
            durationMs: DODGE_DURATION_MS,
            dx,
            dy,
            lean,
            lastGhostMs: 0,
            ghosts: this.dodgeAnim?.ghosts ?? [],
        };
    }
    /** True while a dodge (including its fading ghost trail) is still animating. */
    public isDodging(): boolean {
        return !!this.dodgeAnim;
    }
    /** Take the dodge blur off the sprite while leaving the shared grade and other filters alone. */
    private removeDodgeBlur(): void {
        if (this.sprite && this.dodgeBlurFilter) {
            const installed = this.sprite.filters;
            if (!installed?.includes(this.dodgeBlurFilter)) return;
            const remaining = installed.filter((filter) => filter !== this.dodgeBlurFilter);
            this.sprite.filters = remaining.length ? remaining : null;
        }
    }
    /** Put dodge blur first exactly once; subsequent animation frames retain the installed array. */
    private installDodgeBlur(): void {
        const sprite = this.sprite;
        const blur = this.dodgeBlurFilter;
        if (!sprite || !blur) return;
        const installed = sprite.filters ?? [];
        if (installed[0] === blur && installed.indexOf(blur, 1) === -1) return;
        const remaining = installed.filter((filter) => filter !== blur);
        sprite.filters = [blur, ...remaining];
    }
    private stepDodgeAnimation(worldRoot: Container, now = performance.now()): void {
        const anim = this.dodgeAnim;
        if (!anim) return;
        const t = (now - anim.startMs) / anim.durationMs;

        // Fade + expire the afterimage ghosts regardless of phase (they outlive the spring-back).
        let liveGhostCount = 0;
        for (const ghost of anim.ghosts) {
            const age = now - ghost.bornMs;
            if (age >= DODGE_GHOST_LIFE_MS || ghost.sprite.destroyed) {
                if (!ghost.sprite.destroyed) ghost.sprite.destroy();
                continue;
            }
            ghost.sprite.alpha = DODGE_GHOST_ALPHA * (1 - age / DODGE_GHOST_LIFE_MS);
            anim.ghosts[liveGhostCount++] = ghost;
        }
        anim.ghosts.length = liveGhostCount;

        if (t >= 1) {
            if (this.sprite) {
                this.sprite.rotation = 0;
                this.removeDodgeBlur();
            }
            if (!anim.ghosts.length) this.dodgeAnim = undefined;
            return;
        }

        // Dash out fast, hang at full extension (the "bullet-time" beat), then spring back with a
        // slight overshoot past the origin so the recovery reads springy instead of a rewind.
        let env: number;
        if (t < DODGE_DASH_END) {
            env = dodgeEaseOutCubic(t / DODGE_DASH_END);
        } else if (t < DODGE_HOLD_END) {
            env = 1;
        } else {
            env = 1 - dodgeEaseOutBack((t - DODGE_HOLD_END) / (1 - DODGE_HOLD_END));
        }

        if (this.sprite) {
            this.sprite.x += anim.dx * env;
            this.sprite.y += anim.dy * env;
            this.sprite.rotation = anim.lean * env;
            // Light blur while dashing/held so the sidestep looks too fast to focus on; removed
            // explicitly on the spring-back (don't rely on any ambient per-frame filter reset).
            if (t < DODGE_HOLD_END) {
                if (this.dodgeBlurFilter === undefined) {
                    // BlurFilter compiles its GL program at construction — unavailable headless
                    // (bun tests / battle runner). null remembers the failure so it isn't retried
                    // (and rethrown) every frame.
                    try {
                        this.dodgeBlurFilter = new BlurFilter({ strength: DODGE_BLUR_STRENGTH });
                    } catch {
                        this.dodgeBlurFilter = null;
                    }
                }
                this.installDodgeBlur();
            } else {
                this.removeDodgeBlur();
            }
        }
        if (this.shadow) {
            this.shadow.x += anim.dx * env;
            this.shadow.y += anim.dy * env;
        }
        if (this.silhouetteShadow) {
            this.silhouetteShadow.x += anim.dx * env;
            this.silhouetteShadow.y += anim.dy * env;
        }
        for (const segment of this.silhouetteShadowSegments) {
            segment.x += anim.dx * env;
            segment.y += anim.dy * env;
        }
        if (this.groundCastShadow) {
            this.groundCastShadow.x += anim.dx * env;
            this.groundCastShadow.y += anim.dy * env;
        }

        // Trail: drop a fading ghost of the current transform every few ms while dashing/held.
        if (t < DODGE_HOLD_END && now - anim.lastGhostMs >= DODGE_GHOST_EVERY_MS) {
            anim.lastGhostMs = now;
            const ghost = this.createAfterimageSprite(worldRoot);
            if (ghost) {
                ghost.tint = DODGE_GHOST_TINT;
                ghost.alpha = DODGE_GHOST_ALPHA;
                anim.ghosts.push({ sprite: ghost, bornMs: now });
            }
        }
    }
    /**
     * A wind-up spear thrust ("замахивается копьём"): the sprite first pulls BACK away from the target,
     * then thrusts FORWARD into it, then settles. (dx, dy) points toward the target (the thrust
     * direction). Used for Pikeman's Skewer Strike so the two-unit pierce reads as a real lunge.
     */
    public applyWindupRecoil(dx: number, dy: number): void {
        const props = this.getUnitProperties();
        if (!creatureGenericCombatMotionEnabledForUnit(props.name, props.level)) {
            this.clearGenericCombatRecoil();
            return;
        }
        this.recoilStartMs = performance.now();
        this.recoilDx = dx;
        this.recoilDy = dy;
        this.recoilShakeAmplitude = 0;
        this.recoilWindup = true;
        this.recoilDurationMs = 380;
    }
    private clearGenericCombatRecoil(): void {
        this.recoilStartMs = 0;
        this.recoilDx = 0;
        this.recoilDy = 0;
        this.recoilShakeAmplitude = 0;
        this.recoilWindup = false;
        this.recoilDurationMs = 220;
    }
    private clearGenericDodgeAnimation(): void {
        if (this.dodgeAnim) {
            for (const ghost of this.dodgeAnim.ghosts) {
                if (!ghost.sprite.destroyed) ghost.sprite.destroy();
            }
        }
        this.dodgeAnim = undefined;
        if (this.sprite) this.sprite.rotation = 0;
        this.removeDodgeBlur();
    }
    private updateCurrentRecoil(now = performance.now()): void {
        if (!this.recoilStartMs) {
            this.currentRecoilX = 0;
            this.currentRecoilY = 0;
            return;
        }
        const t = (now - this.recoilStartMs) / this.recoilDurationMs;
        if (t >= 1) {
            this.recoilStartMs = 0;
            this.currentRecoilX = 0;
            this.currentRecoilY = 0;
            return;
        }
        // Wind-up: -sin(2πt) pulls back (away from target) over the first half, then thrusts forward
        // (toward target) over the second half, settling at 0. Plain hit: out-and-back sin(πt).
        const env = this.recoilWindup ? -Math.sin(2 * Math.PI * t) : Math.sin(Math.PI * t);
        let x = this.recoilDx * env;
        let y = this.recoilDy * env;
        if (this.recoilShakeAmplitude > 0) {
            const len = Math.hypot(this.recoilDx, this.recoilDy) || 1;
            const fade = (1 - t) * (1 - t);
            const shake = Math.sin(t * Math.PI * 8) * this.recoilShakeAmplitude * fade;
            x += (-this.recoilDy / len) * shake;
            y += (this.recoilDx / len) * shake;
        }
        this.currentRecoilX = x;
        this.currentRecoilY = y;
    }
    /**
     * Briefly wash the unit toward a colour then back to normal — a "something just landed on me" cue
     * when an effect is applied. Debuffs (e.g. Beholder's Spit Ball applying Sadness / Quagmire /
     * Weakness) wash dark violet; buffs wash green. Read each frame by syncVisual via
     * currentEffectTint(); decays over ~650ms.
     */
    public flashDebuffDarken(): void {
        this.effectFlashStartMs = performance.now();
        this.effectFlashColor = 0x2a0a3a; // deep violet
    }
    public flashBuffApplied(): void {
        this.effectFlashStartMs = performance.now();
        this.effectFlashColor = 0x4dff9e; // bright green (keeps a positive, "buffed" feel)
    }
    /** Gold wash for a Lucky Strike proc — same envelope as the buff/debuff flash, luck-colored. */
    public flashLuckyStrike(): void {
        this.effectFlashStartMs = performance.now();
        this.effectFlashColor = 0xffd94d;
    }
    private currentEffectTint(now = performance.now()): number {
        // Frozen (Blacksmith's "Freeze" status): a persistent icy-blue cast so the unit visibly reads as
        // encased in ice, overriding any transient buff/debuff flash for as long as the freeze holds.
        if (this.hasStatusEffect("Freeze")) {
            return 0x8ec6ff;
        }
        if (!this.effectFlashStartMs) return 0xffffff;
        const DURATION = 650;
        const t = (now - this.effectFlashStartMs) / DURATION;
        if (t >= 1) {
            this.effectFlashStartMs = 0;
            return 0xffffff;
        }
        // Wash in, then back out (peak ~70% toward the effect colour) so it reads as a buff/debuff.
        const env = Math.sin(Math.PI * t) * 0.7;
        const lerp = (from: number, to: number): number => Math.round(from + (to - from) * env);
        const r = lerp(0xff, (this.effectFlashColor >> 16) & 0xff);
        const g = lerp(0xff, (this.effectFlashColor >> 8) & 0xff);
        const b = lerp(0xff, this.effectFlashColor & 0xff);
        return (r << 16) | (g << 8) | b;
    }
    /**
     * Build (and cache) this unit's "default" (active/selection) animation atlas frames so the WebP is
     * decoded up front, and return the first frame whose GPU upload the scene can prewarm. The default
     * atlas is distinct from the idle board sprite and is otherwise built + uploaded lazily the first
     * time the unit becomes active — a ~100ms decode/upload hitch on the turn-handoff frame. Prewarming
     * it during the load/placement phase moves that cost off the gameplay critical path.
     */
    public prewarmDefaultAtlasFrame(): Texture | undefined {
        const props = this.getUnitProperties();
        const config = getDefaultAnimationConfig(props.name, this.getFootprintWidth(), this.getFootprintHeight());
        if (!config) {
            return undefined;
        }
        const frames = framesForAtlasConfig(config, this.texResolver);
        return frames[0];
    }
    /**
     * True when the named EFFECT is active — from the live effect list (Sandbox drives it as a real
     * this.effects entry) OR folded into the authoritative debuffs (ranked: the server ships
     * applied_effects concatenated into the snapshot's `debuffs` — see play_session.ts — so a
     * frozen/stunned unit never gets a client-side runtime effect). Frame-driven effect visuals — the
     * Freeze ice crust, the icy death shatter — MUST key off this, not hasEffectActive, or they never fire
     * in ranked. Safe in Sandbox: applied_debuffs never holds effect names there, so it reduces to
     * hasEffectActive.
     *
     * Kept as the visual-side name, but delegating: the same question is asked by engine rules through
     * Unit.hasStatusApplied, and two independent implementations of one predicate is how they drift.
     */
    public hasStatusEffect(name: string): boolean {
        return this.hasStatusApplied(name);
    }
    /**
     * The buff-side twin of hasStatusEffect. Ranked fills only the DISPLAY array (applied_buffs) and
     * leaves the buff OBJECT array empty on purpose — stats arrive authoritative — so hasBuffActive
     * alone answers "no" in ranked for a buff the server really did apply. Anything that keys a visual
     * off a buff (e.g. the Fireforged Sword burn) must ask this instead, or it only ever fires in sandbox.
     */
    public hasStatusBuff(name: string): boolean {
        return this.hasStatusBuffApplied(name);
    }
    /**
     * Ranked-only: the client never runs applyDamage, so the engine's `waterShieldSpent` flag stays false
     * and the client's OWN seeding pass (unitsHolder.trySeedWaterShield) re-grants a Water Shield the server
     * already consumed — in the SAME synchronous snapshot-apply that just pruned it, so the ring never
     * blinks off and the break dissolve never fires. Deriving "spent" from the authoritative snapshot (the
     * unit has the innate Water Shield ability but the snapshot no longer lists the buff) and setting the
     * flag here makes trySeedWaterShield short-circuit, so the buff stays pruned. `waterShieldSpent` is
     * protected on the common Unit, accessible here since RenderableUnit extends it.
     */
    public markWaterShieldSpent(): void {
        this.waterShieldSpent = true;
    }
    /**
     * Ranked-only repair: collapse repeated names in the DISPLAY arrays (applied_buffs/applied_debuffs plus
     * their parallel laps/description/power arrays) so the sidebar lists each buff once.
     *
     * In ranked the snapshot seeds those display arrays (getUnitPropertiesFromAuthoritativeState) while the
     * OBJECT arrays — this.buffs/this.debuffs — are deliberately left empty, because stats already arrive
     * authoritative and rebuilding the objects would make adjustBaseStats double-apply them. Common's own
     * recompute then guards on the OBJECT arrays ("if (!u.hasDebuffActive('Visible')) u.applyDebuff(…)" in
     * refreshStackPowerForAllUnits, same shape for the Hidden buff and for Made of Fire/Water), sees nothing,
     * and appends a SECOND display entry on top of the seeded one — which is how White Tiger's Visible/Hidden
     * came to render twice. The engine treats buffs/debuffs as unique by name (getBuff/hasBuffActive match on
     * name, deleteBuff removes every entry with that name), so collapsing to the first occurrence loses
     * nothing — and the first occurrence is the snapshot's, i.e. authoritative laps + server-filled text.
     * `unitProperties` is protected on the common Unit, accessible here since RenderableUnit extends it.
     */
    public dropDuplicateAppliedDisplayEntries(): boolean {
        const properties = this.unitProperties;
        const buffsCollapsed = dropDuplicateAppliedEntries(
            properties.applied_buffs,
            properties.applied_buffs_laps,
            properties.applied_buffs_descriptions,
            properties.applied_buffs_powers,
        );
        const debuffsCollapsed = dropDuplicateAppliedEntries(
            properties.applied_debuffs,
            properties.applied_debuffs_laps,
            properties.applied_debuffs_descriptions,
            properties.applied_debuffs_powers,
        );
        return buffsCollapsed || debuffsCollapsed;
    }
    /**
     * Capture what's needed to spawn a "broken mirror" death shatter: the current sprite texture,
     * its world position, and the sprite scale (which includes the y-up flip). Call before
     * destroyVisuals(), while the sprite still exists.
     */
    public getShatterInfo(): {
        texture: Texture;
        x: number;
        y: number;
        scaleX: number;
        scaleY: number;
        frozenShellHalf?: number;
    } | null {
        const s = this.sprite;
        if (!s || !s.texture) return null;
        // Every death effect (shatter, ice break, cleave, dissolve) tiles this texture across a
        // |scaleX| x |scaleY| frame rectangle CENTRED on the point returned here, in the world root's
        // space — which the units container shares, being an untransformed child of it. So the point
        // owed is the sprite's rendered CENTRE.
        //
        // The unit's logical position is NOT that point, and handing it over dropped the body by 0.6
        // to 2.1 cells depending on where it stood: the drawn sprite sits at its projected battlefield
        // ground reference (plus authored/editor offsets), and its position is its ANCHOR, which for a
        // full-body model is the foot line (~0.95 of the frame) rather than the middle of the art.
        // Reading the live sprite covers both, and every later placement refinement, for free — the
        // effect already took its SCALE from here for exactly that reason.
        const frame = s.texture.frame;
        const offsetX = (0.5 - s.anchor.x) * frame.width * s.scale.x;
        const offsetY = (0.5 - s.anchor.y) * frame.height * s.scale.y;
        const cos = Math.cos(s.rotation);
        const sin = Math.sin(s.rotation);
        const freezeBounds = this.freezeCrust?.getLocalBounds();
        const frozenShellHalf =
            freezeBounds && freezeBounds.width > 1 && freezeBounds.height > 1
                ? Math.max(freezeBounds.width, freezeBounds.height) * 0.5
                : undefined;
        return {
            texture: s.texture,
            x: s.x + offsetX * cos - offsetY * sin,
            y: s.y + offsetX * sin + offsetY * cos,
            scaleX: s.scale.x,
            scaleY: s.scale.y,
            frozenShellHalf,
        };
    }
    private ensureStackPowerIndicator(
        _worldRoot: Container,
        gs: GridSettings,
        props: UnitProperties,
        _pos: HoCMath.XY,
    ): void {
        // Stack power is now integrated into the five sections of the vertical flag. Keep this state for
        // placement-preview/gameplay consumers, but never allocate or show the former detached pip bar.
        const power = this.projectedStackPower ?? this.getStackPower();
        const cellSize = gs.getCellSize() * this.visualScaleMultiplier;
        const teamColor =
            props.team === TeamVals.NO_TEAM
                ? NO_TEAM_ROSTER_COLOR
                : // A player may repaint the armies: their OWN in a chosen colour, the enemy in red.
                  (personalArmyPresetFor(props.team)?.color ?? resolveTeamColor(props.team));
        const footprintWidthInCells = this.getFootprintWidth();
        const footprintHeightInCells = this.getFootprintHeight();
        if (this.stackPowerDrawState) {
            this.stackPowerDrawState.power = power;
            this.stackPowerDrawState.cellSize = cellSize;
            this.stackPowerDrawState.footprintWidthInCells = footprintWidthInCells;
            this.stackPowerDrawState.footprintHeightInCells = footprintHeightInCells;
            this.stackPowerDrawState.teamColor = teamColor;
        } else {
            this.stackPowerDrawState = {
                power,
                cellSize,
                footprintWidthInCells,
                footprintHeightInCells,
                teamColor,
            };
        }
        if (this.stackPowerContainer?.visible) this.stackPowerContainer.visible = false;
    }
    protected override refreshAbilitiesDescriptions(_synergyAbilityPowerIncrease: number): void {
        // Heavy Armor
        const heavyArmorAbility = this.getAbility("Heavy Armor");
        if (heavyArmorAbility) {
            const percentage = Number(
                (
                    ((heavyArmorAbility.getPower() + this.getLuck() + _synergyAbilityPowerIncrease) /
                        100 /
                        HoCConstants.MAX_UNIT_STACK_POWER) *
                    this.getStackPower() *
                    100
                ).toFixed(2),
            );
            this.refreshAbiltyDescription(
                heavyArmorAbility.getName(),
                heavyArmorAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Lightning Spin
        const lightningSpinAbility = this.getAbility("Lightning Spin");
        if (lightningSpinAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(lightningSpinAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                lightningSpinAbility.getName(),
                lightningSpinAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Fire Breath
        const fireBreathAbility = this.getAbility("Fire Breath");
        if (fireBreathAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(fireBreathAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                fireBreathAbility.getName(),
                fireBreathAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Skewer Strike
        const skewerStrikeAbility = this.getAbility("Skewer Strike");
        if (skewerStrikeAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(skewerStrikeAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                skewerStrikeAbility.getName(),
                skewerStrikeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Fire Shield
        const fireShieldAbility = this.getAbility("Fire Shield");
        if (fireShieldAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(fireShieldAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                fireShieldAbility.getName(),
                fireShieldAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Backstab
        const backstabAbility = this.getAbility("Backstab");
        if (backstabAbility) {
            const percentage =
                Number(
                    (this.calculateAbilityMultiplier(backstabAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
                ) - 100;
            this.refreshAbiltyDescription(
                backstabAbility.getName(),
                backstabAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Stun Aura (Abomination) — the field's own roll, same stack+luck shape as the Stun ability
        // below at a lower configured power, so the card shows what enemies actually face.
        const stunAuraAbility = this.getAbility("Stun Aura");
        if (stunAuraAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(stunAuraAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                stunAuraAbility.getName(),
                stunAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Stun
        const stunAbility = this.getAbility("Stun");
        if (stunAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(stunAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                stunAbility.getName(),
                stunAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Terrifying Gaze (stack-powered fright chance, same shape as Stun): 12 per stack plus the gazer's
        // luck, so the card reads 12/24/36/48/60 (+luck) rather than the flat 60 sitting in the config.
        const terrifyingGazeAbility = this.getAbility("Terrifying Gaze");
        if (terrifyingGazeAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(terrifyingGazeAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                terrifyingGazeAbility.getName(),
                terrifyingGazeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Predatory Assimilation (stack-powered steal chance, same shape as Stun)
        const predatoryAssimilationAbility = this.getAbility("Predatory Assimilation");
        if (predatoryAssimilationAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(predatoryAssimilationAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                predatoryAssimilationAbility.getName(),
                predatoryAssimilationAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Poison auras (Poison Cloud / Venom Cloud): flat base % + the unit's own luck (luck-dependent
        // though not stack-powered).
        for (const poisonAuraAbilityName of HoCConfig.POISON_ON_HIT_AURA_BUFF_NAMES) {
            const poisonCloudAbility = this.getAbility(poisonAuraAbilityName);
            if (poisonCloudAbility) {
                const percentage = Math.max(0, poisonCloudAbility.getPower() + this.getLuck());
                this.refreshAbiltyDescription(
                    poisonCloudAbility.getName(),
                    poisonCloudAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
                );
            }
        }

        // Guiding Winds Aura (Dryad): stack-scaled plus the Dryad's luck, including the same cap the aura
        // applies to ranged allies. Recompute at display time so stack/luck changes cannot leave a stale card.
        const guidingWindsAbility = this.getAbility("Guiding Winds Aura");
        if (guidingWindsAbility) {
            const auraEffect = this.effectFactory.makeAuraEffect("Guiding Winds");
            if (auraEffect) {
                const percentage = Number(this.calculateAuraPower(auraEffect, _synergyAbilityPowerIncrease).toFixed(2));
                this.refreshAbiltyDescription(
                    guidingWindsAbility.getName(),
                    guidingWindsAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
                );
            }
        }

        // Sylvan Focus Aura (Satyr): base % + the Satyr's own luck, matching what calculateAuraPower stores
        // on the aura the allies receive — so the card and the buff they get always read the same number.
        const sylvanFocusAbility = this.getAbility("Sylvan Focus Aura");
        if (sylvanFocusAbility) {
            const auraEffect = this.effectFactory.makeAuraEffect("Sylvan Focus");
            if (auraEffect) {
                const percentage = Number(this.calculateAuraPower(auraEffect, _synergyAbilityPowerIncrease).toFixed(2));
                this.refreshAbiltyDescription(
                    sylvanFocusAbility.getName(),
                    sylvanFocusAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
                );
            }
        }

        // Magic Reflection (Magic Dragon's passive): stack-scaled base % + the unit's own luck, read straight
        // out of the engine's own getMagicMirrorAbilityChance — including its clamp — so the card can never
        // advertise a chance the rebound roll does not use. The lookup name matters: while this still asked
        // for the ability's old name ("Magic Mirror") it silently found nothing, the refresh never ran, and
        // the card sat at the configured 75% no matter the stack or the luck.
        const magicMirrorAbility = this.getAbility(MAGIC_REFLECTION_ABILITY_NAME);
        if (magicMirrorAbility) {
            const percentage = SpellHelper.getMagicMirrorAbilityChance(this);
            this.refreshAbiltyDescription(
                magicMirrorAbility.getName(),
                magicMirrorAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Chakram's TOTAL target limit is the holder's stack power: one pip hits only the chosen target,
        // while five pips may hit it plus four bounces. The hover and engine use the same shared resolver.
        const chakramAbility = this.getAbility(AllAbilities.CHAKRAM_ABILITY_NAME);
        if (chakramAbility) {
            this.refreshAbiltyDescription(
                chakramAbility.getName(),
                AllAbilities.chakramDescription(chakramAbility.getDesc().join("\n"), this.getStackPower()),
            );
        }

        // Double Punch
        const doublePunchAbility = this.getAbility("Double Punch");
        if (doublePunchAbility) {
            // Fold in the Dual Strike Charm artifact — the same helper the damage path uses — so the
            // hovered total is what the second strike actually lands, not just stack power and luck.
            const percentage = Number(
                (
                    AbilityHelper.withDualStrikeCharm(
                        this.calculateAbilityMultiplier(doublePunchAbility, _synergyAbilityPowerIncrease),
                        this,
                    ) * 100
                ).toFixed(2),
            );
            this.refreshAbiltyDescription(
                doublePunchAbility.getName(),
                doublePunchAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Piercing Spear
        const piercingSpearAbility = this.getAbility("Piercing Spear");
        if (piercingSpearAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(piercingSpearAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                piercingSpearAbility.getName(),
                piercingSpearAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Boost Health
        const boostHealthAbility = this.getAbility("Boost Health");
        if (boostHealthAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(boostHealthAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                boostHealthAbility.getName(),
                boostHealthAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Double Shot
        const doubleShotAbility = this.getAbility("Double Shot");
        if (doubleShotAbility) {
            // Fold in the Dual Strike Charm artifact — the same helper the damage path uses — so the
            // hovered total is what the second strike actually lands, not just stack power and luck.
            const percentage = Number(
                (
                    AbilityHelper.withDualStrikeCharm(
                        this.calculateAbilityMultiplier(doubleShotAbility, _synergyAbilityPowerIncrease),
                        this,
                    ) * 100
                ).toFixed(2),
            );
            this.refreshAbiltyDescription(
                doubleShotAbility.getName(),
                doubleShotAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Blindness
        const blindnessAbility = this.getAbility("Blindness");
        if (blindnessAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(blindnessAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                blindnessAbility.getName(),
                blindnessAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Sharpened Weapons Aura
        const sharpenedWeaponsAuraAbility = this.getAbility("Sharpened Weapons Aura");
        if (sharpenedWeaponsAuraAbility) {
            const percentage = Number(
                (
                    this.calculateAbilityMultiplier(sharpenedWeaponsAuraAbility, _synergyAbilityPowerIncrease) * 100 -
                    100
                ).toFixed(2),
            );
            this.refreshAbiltyDescription(
                sharpenedWeaponsAuraAbility.getName(),
                sharpenedWeaponsAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // War Anger Aura
        const warAngerAuraAbility = this.getAbility("War Anger Aura");
        if (warAngerAuraAbility) {
            const percentage =
                Number(
                    (this.calculateAbilityMultiplier(warAngerAuraAbility, _synergyAbilityPowerIncrease) * 100).toFixed(
                        2,
                    ),
                ) - 100;
            this.refreshAbiltyDescription(
                warAngerAuraAbility.getName(),
                warAngerAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Arrows Wingshield Blessing (Angel) — board-wide at 5/10/15/20/25 by stack, plus the Angel's Luck.
        const arrowsWingshieldBlessingAbility = this.getAbility("Arrows Wingshield Blessing");
        if (arrowsWingshieldBlessingAbility) {
            this.refreshAbiltyDescription(
                arrowsWingshieldBlessingAbility.getName(),
                arrowsWingshieldBlessingAbility
                    .getDesc()
                    .join("\n")
                    .replace(/\{\}/g, this.calculateArrowsWingshieldBlessingPower().toString()),
            );
        }

        // Limited Supply
        const limitedSupplyAbility = this.getAbility("Limited Supply");
        if (limitedSupplyAbility) {
            const percentage = Number(
                ((this.getStackPower() / HoCConstants.MAX_UNIT_STACK_POWER) * limitedSupplyAbility.getPower()).toFixed(
                    2,
                ),
            );
            this.refreshAbiltyDescription(
                limitedSupplyAbility.getName(),
                limitedSupplyAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Boar Saliva
        const boarSalivaAbility = this.getAbility("Boar Saliva");
        if (boarSalivaAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(boarSalivaAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                boarSalivaAbility.getName(),
                boarSalivaAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Aggr
        const aggrAbility = this.getAbility("Aggr");
        if (aggrAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(aggrAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                aggrAbility.getName(),
                aggrAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Wardguard
        const wardguardAbility = this.getAbility("Wardguard");
        if (wardguardAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(wardguardAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                wardguardAbility.getName(),
                wardguardAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Magic Shield
        const magicShieldAbility = this.getAbility("Magic Shield");
        if (magicShieldAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(magicShieldAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                magicShieldAbility.getName(),
                magicShieldAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Borrowed Grace (Monk) — its stack curve is its own (20% at one stack up to the card's power at
        // five), so the tooltip has to read borrowedGraceChance rather than the generic apply chance.
        const borrowedGraceAbility = this.getAbility(AllAbilities.BORROWED_GRACE_NAME);
        if (borrowedGraceAbility) {
            const percentage = Number(AllAbilities.borrowedGraceChance(this, _synergyAbilityPowerIncrease).toFixed(2));
            this.refreshAbiltyDescription(
                borrowedGraceAbility.getName(),
                borrowedGraceAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Absolving Arrow (Monk) — the FIRST lift's chance is the stack-and-luck curve (20% per stack at the
        // card's power of 100), read through absolvingArrowFirstLiftChance so the tooltip prints exactly the
        // figure the lift rolls against.
        const absolvingArrowAbility = this.getAbility(AllAbilities.ABSOLVING_ARROW_NAME);
        if (absolvingArrowAbility) {
            const percentage = Number(
                AllAbilities.absolvingArrowFirstLiftChance(this, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                absolvingArrowAbility.getName(),
                absolvingArrowAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Dodge
        const dodgeAbility = this.getAbility("Dodge");
        if (dodgeAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(dodgeAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                dodgeAbility.getName(),
                dodgeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Small Specie
        const smallSpecieAbility = this.getAbility("Small Specie");
        if (smallSpecieAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(smallSpecieAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                smallSpecieAbility.getName(),
                smallSpecieAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Absorb Penalties Aura
        const absorbPenaltiesAuraAbility = this.getAbility("Absorb Penalties Aura");
        if (absorbPenaltiesAuraAbility) {
            const percentage = Number(
                (
                    this.calculateAbilityMultiplier(absorbPenaltiesAuraAbility, _synergyAbilityPowerIncrease) * 100
                ).toFixed(2),
            );
            this.refreshAbiltyDescription(
                absorbPenaltiesAuraAbility.getName(),
                absorbPenaltiesAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Petrifying Gaze
        const petrifyingGazeAbility = this.getAbility("Petrifying Gaze");
        if (petrifyingGazeAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(petrifyingGazeAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                petrifyingGazeAbility.getName(),
                petrifyingGazeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Spit Ball
        const spitBallAbility = this.getAbility("Spit Ball");
        if (spitBallAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(spitBallAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                spitBallAbility.getName(),
                spitBallAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Large Caliber
        const largeCaliberAbility = this.getAbility("Large Caliber");
        if (largeCaliberAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(largeCaliberAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                largeCaliberAbility.getName(),
                largeCaliberAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Area Throw
        const areaThrowAbility = this.getAbility("Area Throw");
        if (areaThrowAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(areaThrowAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                areaThrowAbility.getName(),
                areaThrowAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Through Shot
        const throughShotAbility = this.getAbility("Through Shot");
        if (throughShotAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(throughShotAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                throughShotAbility.getName(),
                throughShotAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Sky Runner
        const skyRunnerAbility = this.getAbility("Sky Runner");
        if (skyRunnerAbility) {
            this.refreshAbiltyDescription(
                skyRunnerAbility.getName(),
                skyRunnerAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        this.calculateAbilityCount(skyRunnerAbility, _synergyAbilityPowerIncrease).toString(),
                    ),
            );
        }

        // Lucky Strike
        const luckyStrikeAbility = this.getAbility("Lucky Strike");
        if (luckyStrikeAbility) {
            const percentage =
                Number(
                    (this.calculateAbilityMultiplier(luckyStrikeAbility, _synergyAbilityPowerIncrease) * 100).toFixed(
                        2,
                    ),
                ) - 100;
            this.refreshAbiltyDescription(
                luckyStrikeAbility.getName(),
                luckyStrikeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Shatter Armor
        const shatterArmorAbility = this.getAbility("Shatter Armor");
        if (shatterArmorAbility) {
            this.refreshAbiltyDescription(
                shatterArmorAbility.getName(),
                shatterArmorAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        this.calculateAbilityCount(shatterArmorAbility, _synergyAbilityPowerIncrease).toString(),
                    ),
            );
        }

        // Rapid Charge
        const rapidChargeAbility = this.getAbility("Rapid Charge");
        if (rapidChargeAbility) {
            const percentage =
                Number(
                    (this.calculateAbilityMultiplier(rapidChargeAbility, _synergyAbilityPowerIncrease) * 100).toFixed(
                        2,
                    ),
                ) - 100;
            this.refreshAbiltyDescription(
                rapidChargeAbility.getName(),
                rapidChargeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Wolf Trail Aura
        const wolfTrailAuraEffect = this.getAuraEffect("Wolf Trail");
        if (wolfTrailAuraEffect) {
            const auraEffect = this.effectFactory.makeAuraEffect("Wolf Trail");
            if (auraEffect) {
                this.refreshAbiltyDescription(
                    "Wolf Trail Aura",
                    wolfTrailAuraEffect
                        .getDesc()
                        .replace(/\{\}/g, this.calculateAuraPower(auraEffect, _synergyAbilityPowerIncrease).toString()),
                );
            }
        }

        // Warding Mane Blessing — board-wide at 5/10/15/20/25 by stack, plus the Manticore's Luck.
        const wardingManeBlessingAbility = this.getAbility("Warding Mane Blessing");
        if (wardingManeBlessingAbility) {
            this.refreshAbiltyDescription(
                wardingManeBlessingAbility.getName(),
                wardingManeBlessingAbility
                    .getDesc()
                    .join("\n")
                    .replace(/\{\}/g, this.calculateWardingManeBlessingPower().toString()),
            );
        }

        // Arcane Ward Blessing (Squire) — board-wide and flat at 10 + the source's Luck.
        const arcaneWardBlessingAbility = this.getAbility("Arcane Ward Blessing");
        if (arcaneWardBlessingAbility) {
            this.refreshAbiltyDescription(
                arcaneWardBlessingAbility.getName(),
                arcaneWardBlessingAbility
                    .getDesc()
                    .join("\n")
                    .replace(/\{\}/g, this.calculateArcaneWardBlessingPower().toString()),
            );
        }

        // Flesh Shield Aura
        const fleshShieldAuraAbility = this.getAbility("Flesh Shield Aura");
        if (fleshShieldAuraAbility) {
            const auraEffect = this.effectFactory.makeAuraEffect("Flesh Shield");
            if (auraEffect) {
                this.refreshAbiltyDescription(
                    fleshShieldAuraAbility.getName(),
                    fleshShieldAuraAbility
                        .getDesc()
                        .join("\n")
                        .replace(/\{\}/g, this.calculateAuraPower(auraEffect, _synergyAbilityPowerIncrease).toString()),
                );
            }
        }

        // Poison auras (Poison Cloud / Venom Cloud) — {} is the base % plus this unit's luck (combined,
        // like the other aura tooltips); the per-ally luck is what actually applies at hit time
        // (processPoisonAuraAbility).
        for (const poisonAuraEffectName of HoCConfig.POISON_ON_HIT_AURA_EFFECT_NAMES) {
            const poisonCloudAuraAbility = this.getAbility(`${poisonAuraEffectName} Aura`);
            if (poisonCloudAuraAbility) {
                const auraEffect = this.effectFactory.makeAuraEffect(poisonAuraEffectName);
                if (auraEffect) {
                    const poisonPercent = Math.max(
                        0,
                        this.calculateAuraPower(auraEffect, _synergyAbilityPowerIncrease) + this.getLuck(),
                    );
                    this.refreshAbiltyDescription(
                        poisonCloudAuraAbility.getName(),
                        poisonCloudAuraAbility.getDesc().join("\n").replace(/\{\}/g, poisonPercent.toString()),
                    );
                }
            }
        }

        // Hamstring — {} is the stack+luck apply chance, the exact value processHamstringAbility rolls
        // against (calculateAbilityApplyChance), same as Stun and the other on-hit chance abilities.
        const hamstringAbility = this.getAbility("Hamstring");
        if (hamstringAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(hamstringAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                hamstringAbility.getName(),
                hamstringAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Penetrating Bite
        const penetratingBiteAbility = this.getAbility("Penetrating Bite");
        if (penetratingBiteAbility) {
            const percentage =
                Number(
                    (
                        this.calculateAbilityMultiplier(penetratingBiteAbility, _synergyAbilityPowerIncrease) * 100
                    ).toFixed(2),
                ) - 100;
            this.refreshAbiltyDescription(
                penetratingBiteAbility.getName(),
                penetratingBiteAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Pegasus Light
        const pegasusLightAbility = this.getAbility("Pegasus Light");
        if (pegasusLightAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(pegasusLightAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                pegasusLightAbility.getName(),
                pegasusLightAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Paralysis
        const paralysisAbility = this.getAbility("Paralysis");
        if (paralysisAbility) {
            const description = paralysisAbility.getDesc().join("\n");
            const reduction = this.calculateAbilityApplyChance(paralysisAbility, _synergyAbilityPowerIncrease);
            const chance = Math.min(100, reduction * 2);
            const updatedDescription = description
                .replace("{}", Number(chance.toFixed(2)).toString())
                .replace("{}", Number(reduction.toFixed(2)).toString());
            this.refreshAbiltyDescription(paralysisAbility.getName(), updatedDescription);
        }

        // Deep Wounds Levels 0..3 — same card shape at four strengths, and a unit can hold more than one
        // (the Wounding Charm artifact grants Level 1 on top of a higher native card). They resolve as a
        // SINGLE application whose powers stack with luck counted once, so every card shows that one total
        // rather than its own isolated number, which would not sum to what the unit actually applies.
        const deepWoundsAbilities = [
            "Deep Wounds Level 0",
            "Deep Wounds Level 1",
            "Deep Wounds Level 2",
            "Deep Wounds Level 3",
        ]
            .map((deepWoundsName) => this.getAbility(deepWoundsName))
            .filter((ability) => ability !== undefined);
        if (deepWoundsAbilities.length) {
            const deepWoundsCount = this.calculateDeepWoundsCount(
                deepWoundsAbilities,
                _synergyAbilityPowerIncrease,
            ).toString();
            for (const deepWoundsAbility of deepWoundsAbilities) {
                this.refreshAbiltyDescription(
                    deepWoundsAbility.getName(),
                    deepWoundsAbility.getDesc().join("\n").replace(/\{\}/g, deepWoundsCount),
                );
            }
        }

        // Blind Fury is refreshed by the BASE implementation, in common, because a ranked player reads the
        // description the server wrote into the snapshot and the server has no RenderableUnit. Chaining up
        // rather than recomputing it here keeps the sandbox card and the ranked card on one expression --
        // they drifted before, and only the sandbox showed the live number.
        super.refreshAbilitiesDescriptions(_synergyAbilityPowerIncrease);

        // Chain Lightning
        const chainLightningAbility = this.getAbility("Chain Lightning");
        if (chainLightningAbility) {
            const percentage =
                this.calculateAbilityMultiplier(chainLightningAbility, _synergyAbilityPowerIncrease) * 100;
            const description = chainLightningAbility.getDesc().join("\n");
            const updatedDescription = description
                .replace("{}", Number(percentage.toFixed()).toString())
                .replace("{}", Number(((percentage * 7) / 8).toFixed()).toString())
                .replace("{}", Number(((percentage * 6) / 8).toFixed()).toString())
                .replace("{}", Number(((percentage * 5) / 8).toFixed()).toString());
            this.refreshAbiltyDescription(chainLightningAbility.getName(), updatedDescription);
        }

        // Crusade
        const crusadeAbility = this.getAbility("Crusade");
        if (crusadeAbility) {
            this.refreshAbiltyDescription(
                crusadeAbility.getName(),
                crusadeAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        Number(
                            this.calculateAbilityCount(crusadeAbility, _synergyAbilityPowerIncrease).toFixed(2),
                        ).toString(),
                    ),
            );
        }

        // Dulling Defense
        const dullingDefenseAbility = this.getAbility("Dulling Defense");
        if (dullingDefenseAbility) {
            this.refreshAbiltyDescription(
                dullingDefenseAbility.getName(),
                dullingDefenseAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        Number(
                            this.calculateAbilityCount(dullingDefenseAbility, _synergyAbilityPowerIncrease).toFixed(1),
                        ).toString(),
                    ),
            );
        }

        // Devour Essence
        const devourEssenceAbility = this.getAbility("Devour Essence");
        if (devourEssenceAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(devourEssenceAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                devourEssenceAbility.getName(),
                devourEssenceAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Crafted Frozen Sword / Crafted Frozen Bow (Blacksmith's Craft): the freeze chance is stack-scaled
        // AND luck-scaled — power/5 * stackPower + luck — so a full stack reads 20% at -10 luck up to 40% at
        // +10, not the flat 30% the config carries. Nothing filled their {} before, so the tooltip showed the
        // raw configured power and a lucky unit's real odds were invisible. Same calculateAbilityApplyChance
        // the engine rolls against, and the same treatment Stun and Hamstring already get.
        for (const frozenName of ["Crafted Frozen Sword", "Crafted Frozen Bow"]) {
            const frozenAbility = this.getAbility(frozenName);
            if (frozenAbility) {
                const chance = Number(
                    this.calculateAbilityApplyChance(frozenAbility, _synergyAbilityPowerIncrease).toFixed(2),
                );
                this.refreshAbiltyDescription(
                    frozenAbility.getName(),
                    frozenAbility.getDesc().join("\n").replace(/\{\}/g, chance.toString()),
                );
            }
        }

        // Crafted Double Punch / Crafted Double Shot (from the Blacksmith's Craft) land a SECOND attack for a
        // stack-scaled fraction of the damage — power/5 * stackPower + luck, i.e. 20/40/60/80/100% + luck —
        // unlike the base Double Punch/Shot which always land a full second hit. Show the live scaled % (it
        // was reading a flat 100% because nothing refreshed the {} with the calculated multiplier).
        for (const craftedName of ["Crafted Double Punch", "Crafted Double Shot"]) {
            const craftedAbility = this.getAbility(craftedName);
            if (craftedAbility) {
                const percentage = Number(
                    (
                        AbilityHelper.withDualStrikeCharm(
                            this.calculateAbilityMultiplier(craftedAbility, _synergyAbilityPowerIncrease),
                            this,
                        ) * 100
                    ).toFixed(0),
                );
                this.refreshAbiltyDescription(
                    craftedAbility.getName(),
                    craftedAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
                );
            }
        }

        // Blacksmith Tools (Craft): the four per-ally outcome chances shift with the caster's live luck
        // (getCraftChances). Fill them at display time like every other ability's {} — otherwise, with no
        // per-ability block, the description falls back to the flat power-0 value and reads "0%" everywhere.
        const blacksmithToolsAbility = this.getAbility("Blacksmith Tools");
        if (blacksmithToolsAbility) {
            const { stun, nothing, double, frozen } = AllAbilities.getCraftChances(this.getLuck());
            this.refreshAbiltyDescription(
                blacksmithToolsAbility.getName(),
                blacksmithToolsAbility
                    .getDesc()
                    .join("\n")
                    .replace("{}", double.toString())
                    .replace("{}", frozen.toString())
                    .replace("{}", stun.toString())
                    .replace("{}", nothing.toString()),
            );
        }
    }
    private refreshAbiltyDescription(abilityName: string, abilityDescription: string): void {
        if (
            this.unitProperties.abilities.length === this.unitProperties.abilities_descriptions.length &&
            this.unitProperties.abilities.length === this.unitProperties.abilities_stack_powered.length &&
            this.unitProperties.abilities.length === this.unitProperties.abilities_auras.length
        ) {
            for (let i = 0; i < this.unitProperties.abilities.length; i++) {
                if (
                    this.unitProperties.abilities[i] === abilityName &&
                    // A poison aura is not stack-powered but IS luck-dependent, so its description must
                    // still be refreshed with the live value like the stack-powered ones. Through Shot and
                    // Area Throw are the same case now: non-stack-powered (a lone Gargantuan / Tsar Cannon
                    // lands the full percentage) yet still luck-scaled, so their cards must keep refreshing.
                    (this.unitProperties.abilities_stack_powered[i] ||
                        abilityName === "Blind Fury" ||
                        abilityName === "Guiding Winds Aura" ||
                        abilityName === "Sylvan Focus Aura" ||
                        abilityName === "Through Shot" ||
                        abilityName === "Area Throw" ||
                        abilityName === MAGIC_REFLECTION_ABILITY_NAME ||
                        HoCConfig.POISON_ON_HIT_AURA_BUFF_NAMES.has(abilityName))
                ) {
                    this.unitProperties.abilities_descriptions[i] = abilityDescription;
                }
            }
        }
    }
    public setStackVisibility(visible: boolean): void {
        this.stackForcedHidden = !visible;
        if (this.stackPowerContainer) {
            this.stackPowerContainer.visible = visible && this.getStackPower() > 0;
            // Also force alpha update if we are toggling back on
            if (visible) this.stackPowerContainer.alpha = 1;
        }
    }
    public isSkippingDisplayed(): boolean {
        return this.isSkippingForDisplay();
    }
}
