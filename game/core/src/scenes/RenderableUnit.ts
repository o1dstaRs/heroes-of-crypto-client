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
import { staticBattlefieldTextureNameForUnit, TextureType, unitToTextureName } from "@/pixi/PixiUnitsFactory";
import { legacyBoardChildScaleCompensation } from "@/pixi/boardFit";
import { CREATURE_SPRITE_ANIMATION_SETTINGS } from "@/pixi/creatureAnimationSettings";
import { animationAtlases, AnimationUnitName, type AnimationAtlasMeta } from "../generated/animation_atlases";
import { images, type ImageKey } from "../imageAssets";
import { buildAtlasPingPongTiming, AtlasPingPongTiming } from "./atlasAnimationTiming";
import { CAN_RENDER_FLAG_GRADIENT, personalArmyFlagGradient, personalArmyPresetFor } from "./personalArmyTint";
import { TEAM_COLOR_GREEN, TEAM_COLOR_RED, teamColor as resolveTeamColor } from "./teamColors";
import { HOC_NUMERIC_FONT_FAMILY } from "../fontFamilies";
import { projectBattlefieldPoint, projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";
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
    isBattlefieldShadowEditorActive,
    publishBattlefieldShadowVisualBounds,
    resolveBattlefieldShadowTuning,
    type BattlefieldShadowTuning,
} from "../ui/battlefieldShadowTuning";
import { stunBadgeLayout } from "../ui/stunBadgeTuning";
import { creatureHeadPriorityZone, type CreatureDepthSortCandidate } from "./battlefieldCreatureDepthSort";
export type TexResolver = (name: string) => Texture | undefined;

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

let sharedRevealedRosterDesaturateFilter: ColorMatrixFilter | undefined;

/** Every revealed opponent uses the same immutable grayscale matrix, so one filter serves the whole roster. */
const revealedRosterDesaturateFilter = (): ColorMatrixFilter => {
    if (sharedRevealedRosterDesaturateFilter) return sharedRevealedRosterDesaturateFilter;
    sharedRevealedRosterDesaturateFilter = new ColorMatrixFilter();
    sharedRevealedRosterDesaturateFilter.desaturate();
    return sharedRevealedRosterDesaturateFilter;
};

const syncSingleSpriteFilter = (sprite: Sprite, desired: Filter | undefined): void => {
    const installed = sprite.filters;
    if (desired) {
        if (installed?.length !== 1 || installed[0] !== desired) sprite.filters = [desired];
    } else if (installed?.length) {
        sprite.filters = null;
    }
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
              { offset: 0, color: 0x176238 },
              { offset: 0.5, color: 0x0b3d20 },
              { offset: 1, color: 0x176238 },
          ],
      })
    : undefined;
const RED_ARMY_FLAG_GRADIENT = CAN_RENDER_FLAG_GRADIENT
    ? new FillGradient({
          end: { x: 1, y: 0 },
          textureSpace: "local",
          colorStops: [
              { offset: 0, color: 0x7b1928 },
              { offset: 0.5, color: 0x510c16 },
              { offset: 1, color: 0x7b1928 },
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
const PEASANT_UNIT_NAME = "Peasant";
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
const ORC_UNIT_NAME = "Orc";
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

/** Authored weapon/hand attachment zones for the native ranged units. */
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
 * Which board row a figure stands on, normalized to 0 at the nearest row and 1 at the furthest legal one.
 *
 * Only the footprint's HEIGHT matters here: the logical position is the centre of the whole body, so the
 * row its feet occupy is half the body's height below that centre, and a taller body also has fewer legal
 * rows to stand on. A 2x1 therefore behaves exactly like a 1x1, which is the point.
 */
const battlefieldCreatureRowProgress = (logicalY: number, footprintHeight: number, gs: GridSettings): number => {
    const maximumBottomRow = Math.max(1, gs.getGridSize() - footprintHeight);
    const bottomRow =
        (logicalY - gs.getMinY() - (footprintHeight * gs.getCellSize()) / 2) / Math.max(1, gs.getCellSize());
    return Math.max(0, Math.min(1, bottomRow / maximumBottomRow));
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
/** A quadruped must read below a standing humanoid instead of inheriting the shared 1.5-cell height. */
export const WOLF_BOARD_MODEL_HEIGHT_CELLS = 1.05 * 0.99;
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
export const ORC_IDLE_BREATH_PERIOD_MS = 2600;
// Owner-tuned: ten percent stronger than the previous 1.035% vertical breathing motion.
const ORC_IDLE_BREATH_SCALE_AMPLITUDE = 0.01035 * 1.1;
const ORC_IDLE_CHEST_EXPANSION_AMPLITUDE = 0.008;
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
const WANDERING_MAGE_WALK_CYCLE_DISTANCE_CELLS = 2;
// Eight approved Peasant poses advance every quarter-cell: one full gait spans exactly two cells.
const PEASANT_WALK_CYCLE_DISTANCE_CELLS = 2;
// Stretch Troll's spatial gait cycle by 1 / 0.8 so its refreshed authored poses play 20% slower
// without changing how quickly the unit itself travels across the board.
const TROLL_WALK_SPEED_MULTIPLIER = 0.8;
const TROLL_WALK_CYCLE_DISTANCE_CELLS = 1 / TROLL_WALK_SPEED_MULTIPLIER;
// A grounded unit covers two cells in 0.5 real seconds. At the engine's quarter-rate simulation
// clock, 2.8x atlas cadence fits the Orc's six core gait poses plus its authored transition pose
// into that same interval without changing movement interpolation speed.
const ORC_WALK_FPS_MULTIPLIER = 2.8;
// Like the Orc above, the Troglodyte covers two cells in 0.5 real seconds, which is 125ms on the
// engine's quarter-rate simulation clock. Seven frames in 125ms require 56fps; its atlas declares
// 20fps, so the same 2.8x cadence used by the Orc is the exact fit.
const TROGLODYTE_WALK_FPS_MULTIPLIER = 2.8;
// Centaur keeps normal board interpolation while its authored gait uses the accumulated boosts:
// 25%, then 20%, then 7% (1.25 * 1.2 * 1.07 = 1.605).
const CENTAUR_WALK_FPS_MULTIPLIER = 1.605;
// Ground travel is 16 cells/second, so two cells take 125ms. Six Scavenger/Thief gait poses must
// advance in that interval: 6 / 0.125 = 48fps. The authored atlas declares 10fps, hence 4.8x.
const THIEF_WALK_FPS_MULTIPLIER = 4.8;
// Keep every authored action frame, but play the complete combat sequence in half the old time.
// Idle breathing and the movement loop deliberately retain their calmer cadence.
const WANDERING_MAGE_COMBAT_ANIMATION_DURATION_MULTIPLIER = 0.5;
const WANDERING_MAGE_DEATH_ADDITIONAL_SPEED_MULTIPLIER = 1.15;
const WANDERING_MAGE_IDLE_VISIBLE_HEIGHT_PX = 180;
// Opaque subject heights measured from the shipped quarter-resolution sheets. Normalizing only the
// cast and attack poses prevents their wider square canvases from making the mage zoom out mid-action.
// Hit and death remain authored reactions: hit recoils naturally and death must be allowed to collapse.
const WANDERING_MAGE_ACTION_VISIBLE_HEIGHTS: Readonly<Record<string, readonly number[]>> = {
    cast: [170, 171, 167, 169, 171, 166, 169, 169],
    attack: [162, 160, 157, 155, 153, 153, 159, 160],
    attack_up: [155, 152, 167, 171, 171, 148, 150, 151],
    attack_down: [165, 150, 140, 124, 137, 152, 165, 172],
};
// Preserve the previously approved boosts, then apply the new relative increases on top.
const ATTACK_ANIMATION_SPEED_MULTIPLIER = 1.4 * 1.22;
const HIT_ANIMATION_SPEED_MULTIPLIER = 1.22;
const DEATH_ANIMATION_SPEED_MULTIPLIER = 2 * 1.2;
const SCAVENGER_DEATH_ADDITIONAL_SPEED_MULTIPLIER = 1.12;
// Temporary art-direction switch: keep every creature on the first authored frame. Board interpolation,
// facing and gameplay VFX remain active, but no creature sprite-sheet frames (idle, walk, action or special)
// advance until this is switched back on.
export { CREATURE_SPRITE_ANIMATION_SETTINGS } from "@/pixi/creatureAnimationSettings";

/** Keep the newly approved Peasant walk active while the global creature-animation freeze remains in place. */
export function creatureWalkAnimationEnabledForUnit(unitName: string): boolean {
    return CREATURE_SPRITE_ANIMATION_SETTINGS.enabled || unitName === PEASANT_UNIT_NAME;
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

export function oneShotAnimationDurationMultiplier(unitName: string, stateName: string): number {
    // Wandering Mage has its own tuned combat cadence. Its death sequence is deliberately 15% faster.
    if (unitName === WANDERING_MAGE_UNIT_NAME) {
        return (
            WANDERING_MAGE_COMBAT_ANIMATION_DURATION_MULTIPLIER /
            (stateName === "death" ? WANDERING_MAGE_DEATH_ADDITIONAL_SPEED_MULTIPLIER : 1)
        );
    }

    let multiplier = 1;
    const isAttack =
        stateName === "attack" ||
        stateName.startsWith("attack_") ||
        stateName === "melee_attack" ||
        stateName.startsWith("melee_attack_");

    if (isAttack) multiplier /= ATTACK_ANIMATION_SPEED_MULTIPLIER;
    if (stateName === "hit") multiplier /= HIT_ANIMATION_SPEED_MULTIPLIER;
    if (stateName === "death") {
        multiplier /=
            DEATH_ANIMATION_SPEED_MULTIPLIER *
            (unitName === SCAVENGER_UNIT_NAME ? SCAVENGER_DEATH_ADDITIONAL_SPEED_MULTIPLIER : 1);
    }
    return multiplier;
}

export function ashMothActionScaleMultiplier(stateName: string, frameIndex: number): number {
    const heights = WANDERING_MAGE_ACTION_VISIBLE_HEIGHTS[stateName];
    if (!heights?.length) return 1;
    const safeFrameIndex = Math.max(0, Math.min(heights.length - 1, Math.floor(frameIndex)));
    return WANDERING_MAGE_IDLE_VISIBLE_HEIGHT_PX / heights[safeFrameIndex];
}

export function resolveAnimationAtlasState(_unitName: string, stateName: string): string {
    // Atlas direction names now match the board direction directly. In particular, Scavenger's
    // attack_up must use attack_up and attack_down must use attack_down.
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
    const breath = Math.sin((elapsedMs / ORC_IDLE_BREATH_PERIOD_MS) * Math.PI * 2);
    const scales = out ?? { x: 1, y: 1 };
    // Only the inhale broadens the chest. Exhaling returns to the authored width instead of pinching it.
    scales.x = 1 + Math.max(0, breath) * ORC_IDLE_CHEST_EXPANSION_AMPLITUDE;
    scales.y = 1 + breath * ORC_IDLE_BREATH_SCALE_AMPLITUDE;
    return scales;
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
): { meta: AtlasMeta; imageSrc: string; imageKey: ImageKey; cacheKey: string } | null {
    // The explicit animation switch is also the authored-atlas test/dev switch. Production keeps it
    // off and uses the approved static battlefield cutouts; when enabled, do not let those cutouts
    // shadow every idle/walk/action atlas.
    if (CREATURE_SPRITE_ANIMATION_SETTINGS.enabled) return null;
    const textureName = staticBattlefieldTextureNameForUnit(unitName, footprintWidth, footprintHeight);
    if (!textureName) return null;
    const imageKey = textureName as ImageKey;
    if (!(imageKey in images)) return null;
    return {
        meta: STATIC_BATTLEFIELD_IDLE_META,
        imageSrc: images[imageKey],
        imageKey,
        cacheKey: `${unitName}::${textureName}`,
    };
}

function getDefaultAnimationConfig(
    unitName: string,
    footprintWidth: number,
    footprintHeight = footprintWidth,
): { meta: AtlasMeta; imageSrc: string; imageKey: ImageKey; cacheKey: string } | null {
    const staticBattlefieldIdle = getStaticBattlefieldIdleConfig(unitName, footprintWidth, footprintHeight);
    if (staticBattlefieldIdle) return staticBattlefieldIdle;
    if (unitName === EFREET_UNIT_NAME && footprintWidth === 1 && footprintHeight === 1) {
        return {
            meta: EFREET_FIRE_IDLE_META,
            imageSrc: images[EFREET_FIRE_IDLE_IMAGE_KEY],
            imageKey: EFREET_FIRE_IDLE_IMAGE_KEY,
            cacheKey: `${EFREET_UNIT_NAME}::fire_idle`,
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
    return { meta, imageSrc, imageKey, cacheKey };
}

function getAnimationStateConfig(
    unitName: string,
    state: string,
    footprintWidth: number,
    footprintHeight = footprintWidth,
): { meta: AtlasMeta; imageSrc: string; imageKey: ImageKey; cacheKey: string } | null {
    const staticBattlefieldIdle = getStaticBattlefieldIdleConfig(unitName, footprintWidth, footprintHeight);
    if (staticBattlefieldIdle) {
        if (state === "idle") return staticBattlefieldIdle;
        // Production deliberately freezes the approved static figures, except Peasant's separately
        // approved walking strip. Let that one walk resolve its atlas without enabling every action.
        if (!(state === "walk" && creatureWalkAnimationEnabledForUnit(unitName))) return null;
    }
    if (unitName === EFREET_UNIT_NAME && state === "idle" && footprintWidth === 1 && footprintHeight === 1) {
        return {
            meta: EFREET_FIRE_IDLE_META,
            imageSrc: images[EFREET_FIRE_IDLE_IMAGE_KEY],
            imageKey: EFREET_FIRE_IDLE_IMAGE_KEY,
            cacheKey: `${EFREET_UNIT_NAME}::fire_idle`,
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
    return { meta, imageSrc, imageKey, cacheKey: `${normalized}::${resolvedState}` };
}
// Cache textures per atlas to avoid rebuilding frames
const atlasFramesCache = new Map<string, Texture[]>();
const ACTIVE_TURN_FIRE_FRAME_SIZE = 192;
const ACTIVE_TURN_FIRE_COLS = 8;
const ACTIVE_TURN_FIRE_FRAME_COUNT = 64;
const ACTIVE_TURN_FIRE_FRAME_MS = 1000 / 18;
// OPTIONAL lookup on purpose: the effect below is disabled and its 500 KB atlas lives in the
// review-source Google Drive staging area (over the 120 KB static-image ceiling), so the generated image
// manifest does not carry the key. A typed property access here made the whole client build demand
// art the images folder deliberately does not ship (the 2026-08-22 deploy abort). Restoring the
// effect means promoting the atlas back into the images folder — this lookup then finds it again.
const ACTIVE_TURN_FIRE_URL = (images as Partial<Record<string, string>>).active_turn_blue_fire_atlas ?? "";
// Prepared from the blue-fire source video. Keep the implementation/assets ready, but leave the
// effect visually disabled until the owner asks to restore it.
const ACTIVE_TURN_FIRE_ENABLED = false;
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
    frames: Texture[];
    footAnchorY: number;
    frameIndex: number;
    elapsed: number;
    durationPerFrame: number;
    onComplete?: () => void;
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
/** Active-turn arrow is 30% larger than its previous 1.06 scale, independent of its animated breath. */
export const ACTIVE_TURN_POINTER_SIZE_SCALE = 1.378;
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
    return cosineBreath * cosineBreath * (3 - 2 * cosineBreath);
};
export const activeFlagScaleForTime = (timeSeconds: number): number => 1 + activeFlagPulse(timeSeconds) * 0.08;
export const activeFlagGlowAlphaForTime = (timeSeconds: number): number => 0.32 + activeFlagPulse(timeSeconds) * 0.58;
export const activeTurnPointerGap = (flagHeight: number, flagWidth: number): number =>
    Math.max(2, flagHeight * 0.13) + flagWidth * (0.06 / 0.42);

/** Stable screen-space top of the amount flag, excluding the active pointer's animated pulse. */
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
    name: string;
    teamColor: number;
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
const RESPOND_EMBLEM_CANVAS_SCALE = 2.25;
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
    private silhouetteShadowSegments: Sprite[] = [];
    private silhouetteShadowSegmented = false;
    private battlefieldShadowProjection?: BattlefieldCreatureShadowProjection;
    private shadowSegmentLengthMultipliers?: number[];
    private groundCastShadow?: Sprite;
    private silhouetteShadowBlurFilter?: BlurFilter | null;
    private shadowDrawWidth = 0;
    private shadowDrawHeight = 0;
    private badgeContainer?: Container;
    private badgeHeader?: Graphics;
    private badgeFlagGlow?: Graphics;
    private badgeFlag?: Graphics;
    private activeTurnPointer?: Graphics;
    private activeTurnPointerSuppressed = false;
    private badgeText?: Text;
    private badgeDrawState?: BadgeDrawState;
    private battlefieldFramingChangeListener?: EventListener;
    private battlefieldFramingWorldRoot?: Container;
    private battlefieldFramingGridSettings?: GridSettings;
    /** Cached per-unit wave phase for the banner (see badgeFlagPhase). */
    private badgeFlagPhaseValue?: number;
    private badgeFlagXs?: number[];
    private badgeFlagTopY?: number[];
    private badgeFlagBottomY?: number[];
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
    private respondFeedbackUntilMs = 0;
    private respondFeedbackTimer?: ReturnType<typeof setTimeout>;
    private spawnAnim?: SpawnAnimState;
    private boardSelected = false;
    private selectionAnimFrames?: Texture[];
    private orcIdleAxeTwirlFrames?: Texture[];
    private orcActiveBattleCryFrames?: Texture[];
    private scavengerIdleBladeTwirlFrames?: Texture[];
    private scavengerActiveBattleCryFrames?: Texture[];
    private selectionAnimTiming?: AtlasPingPongTiming;
    private selectionAnimFrameDurationMs = 0;
    private selectionAnimFootAnchorY = 1;
    /** Wall-clock origin for this unit's current uninterrupted idle spell. */
    private selectionAnimationStartedAtMs = 0;
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
    private depthSortCandidate?: CreatureDepthSortCandidate;
    private inheritedScaleScratch?: HoCMath.XY;
    private projectedPositionScratch?: HoCMath.XY;
    private groundReferenceScratch?: HoCMath.XY;
    private idleBreathScaleScratch?: HoCMath.XY;
    private badgeSpriteBounds?: Bounds;
    private badgeScreenAnchor?: Point;
    private badgeLocalAnchor?: Point;
    /** Immutable render identity resolved once in fromBase instead of reconstructed every frame. */
    private smallTextureName = "";
    private idleAnimationStateAvailable = false;
    // "Revealed" roster marker: a translucent red cell beneath the B&W silhouette plus its name caption,
    // so the opponent's known army reads as a roster line-up rather than units already standing on the board.
    private rosterCard?: Container;
    private rosterCardPlate?: Graphics;
    private rosterCardLabel?: Text;
    private rosterCardDrawState?: RosterCardDrawState;
    // Uniform multiplier applied to the rendered sprite, shadow, badge and corner indicators.
    // 1 = normal one-cell board size. The placement bench renders unplaced units larger (>1) so
    // they read at "full size" while waiting to be deployed; placed/board units keep the default 1.
    private visualScaleMultiplier = 1;
    // Board mechanics stay on the regular square grid, while the painted dungeon floor uses a traced
    // perspective grid. Board units opt into that visual projection; roster/bench previews leave it off.
    private useBattlefieldVisualProjection = false;
    // Animated "light waves" aura shown under the unit whose turn it is.
    private activeAura?: Graphics;
    // Placement hover reuses the restrained active-turn light waves instead of the old stack of
    // opaque white circles drawn by HoverManager.
    private isHoverTurnAura = false;
    /** Transparent blue-fire atlas layered beneath the active unit and the existing light rings. */
    private activeTurnFireSprite?: Sprite;
    private activeTurnFireFrameIndex = -1;
    // Color of the active-turn aura. White by default; the scene tints it (e.g. red) when the
    // active unit is the viewer's enemy so it reads clearly that it is not the viewer's turn.
    private activeAuraColor = 0xffffff;
    // While the active unit is mid-move or mid-attack, the aura is suppressed so it doesn't
    // distract from the action (set each frame by the scene).
    private suppressActiveAura = false;
    // Light-blue circulating ring + small orbiting dots shown around a unit while its Water Shield buff is
    // active (the once-per-battle absorb). Created lazily; hidden the frame the shield breaks.
    private waterShieldAura?: Graphics;
    // Animated water vortex under a unit trapped by Whirlpool. It keys off the shared status predicate so
    // the live Sandbox debuff object and Ranked's authoritative applied_debuffs snapshot render identically.
    private whirlpoolAura?: Graphics;
    // Ice "crust" encasing a unit under the "Freeze" status (drawn over the sprite, above the icy tint).
    private freezeCrust?: Graphics;
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
        ru.selectionAnimFrameIndex = -1;
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
        ru.badgeAmountOverride = undefined;
        ru.badgeHeader = undefined;
        ru.badgeFlagGlow = undefined;
        ru.activeTurnPointer = undefined;
        ru.activeTurnPointerSuppressed = false;
        ru.badgeDrawState = undefined;
        ru.badgeFlagXs = undefined;
        ru.badgeFlagTopY = undefined;
        ru.badgeFlagBottomY = undefined;
        ru.battlefieldFramingChangeListener = undefined;
        ru.battlefieldFramingWorldRoot = undefined;
        ru.battlefieldFramingGridSettings = undefined;
        ru.stackPowerDrawState = undefined;
        ru.projectedStackPower = undefined;
        ru.rosterCardDrawState = undefined;
        ru.activeAura = undefined;
        ru.isHoverTurnAura = false;
        ru.activeTurnFireSprite = undefined;
        ru.activeTurnFireFrameIndex = -1;
        ru.activeAuraColor = 0xffffff;
        ru.waterShieldAura = undefined;
        ru.whirlpoolAura = undefined;
        ru.freezeCrust = undefined;
        ru.freezeLight = undefined;
        ru.waterShieldBreakGfx = undefined;
        ru.waterShieldBreakStartMs = undefined;
        ru.waterShieldWasActive = false;
        ru.suppressActiveAura = false;
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
        ru.depthSortCandidate = undefined;
        ru.inheritedScaleScratch = undefined;
        ru.projectedPositionScratch = undefined;
        ru.groundReferenceScratch = undefined;
        ru.idleBreathScaleScratch = undefined;
        ru.badgeSpriteBounds = undefined;
        ru.badgeScreenAnchor = undefined;
        ru.badgeLocalAnchor = undefined;
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
            const iconTex = generatedIconKey
                ? (this.texResolver(generatedIconKey) ??
                  Texture.from((images as Record<string, string>)[generatedIconKey]))
                : this.texResolver(SpellHelper.spellToTextureName(spellName));
            const cellTex = this.texResolver("spell_cell_260");
            const scrollBadgeTex =
                this.texResolver("spell_cast_wax_seal_blank_v1") ?? Texture.from(images.spell_cast_wax_seal_blank_v1);
            const stackRailTex =
                this.texResolver("spell_stack_rail_variant2") ?? Texture.from(images.spell_stack_rail_variant2);
            const stackFillGreenTex =
                this.texResolver("spell_stack_fill_green_variant2") ??
                Texture.from(images.spell_stack_fill_green_variant2);
            const stackFillRedTex =
                this.texResolver("spell_stack_fill_red_variant2") ?? Texture.from(images.spell_stack_fill_red_variant2);
            const innerFrameTex =
                this.texResolver("spell_inner_frame_linework_v2") ?? Texture.from(images.spell_inner_frame_linework_v2);

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
        const hasAuthoredIdle = this.idleAnimationStateAvailable;
        const tallBoardModel = usesTallBoardModel(props, texName, hasAuthoredIdle);
        const refreshedFullBodyScale = usesRefreshedFullBodyScale(props, hasAuthoredIdle);
        const baseTex = this.texResolver(texName);
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
        const footAnchorY = tallBoardModel
            ? (this.oneShotAnim?.footAnchorY ??
              this.walkAnim?.footAnchorY ??
              (showingOrcBattleCry
                  ? ORC_ACTIVE_BATTLE_CRY_FOOT_ANCHOR_Y
                  : showingScavengerFlourish
                    ? SCAVENGER_FLOURISH_FOOT_ANCHOR_Y
                    : this.selectionAnimFootAnchorY))
            : 0.5;
        if (this.sprite.anchor.x !== 0.5 || this.sprite.anchor.y !== footAnchorY) {
            this.sprite.anchor.set(0.5, footAnchorY);
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
        // Gameplay occupancy must never deform the authored creature. Rectangular 2x1 bodies use the
        // shorter footprint side for visual sizing, exactly like the approved local sandbox rendering.
        const visualFootprintSide = Math.min(footprintWidth, footprintHeight);
        const chipTargetSide =
            visualFootprintSide * BATTLEFIELD_CHIP_CELL_PIXELS * this.visualScaleMultiplier * battlefieldCreatureScale;
        // The rectangular board fit intentionally scales cell positions differently on X and Y. Undo that
        // camera deformation on the artwork alone so creatures keep their original square-fit screen size.
        const inheritedScale = inheritedAbsoluteScale(worldRoot, this.inheritedScaleScratch);
        this.inheritedScaleScratch = inheritedScale;
        const screenSizeCompensation = legacyBoardChildScaleCompensation(inheritedScale.x, inheritedScale.y);
        const currentTexture = this.sprite.texture;
        const currentWidth = currentTexture && currentTexture.width > 1 ? currentTexture.width : baseTex.width || 1;
        const currentHeight = currentTexture && currentTexture.height > 1 ? currentTexture.height : baseTex.height || 1;
        const usesThiefSilhouette = props.name === THIEF_UNIT_NAME || props.name === SCAVENGER_UNIT_NAME;
        // Key tall models by HEIGHT so they remain exactly 1.5 cells tall. Thief's authored idle/walk
        // frames contain a thin transparent safety margin, so size the visible body rather than that canvas.
        const thiefUsesNormalizedActionFrame = !!this.walkAnim || !!this.oneShotAnim || showingScavengerFlourish;
        const thiefVisibleHeightRatio = thiefUsesNormalizedActionFrame
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
        const visibleHeight = scaleReferenceHeight * (usesThiefSilhouette ? thiefVisibleHeightRatio : 1);
        const visibleWidth = currentWidth * (usesThiefSilhouette ? thiefVisibleWidthRatio : 1);
        const refreshedVisualProfile = refreshedBoardVisualProfileForUnit(props.name);
        const boardModelHeightCells = refreshedFullBodyScale
            ? refreshedVisualProfile.heightCells
            : props.name === SCAVENGER_UNIT_NAME
              ? SCAVENGER_BOARD_MODEL_HEIGHT_CELLS
              : 1.5;
        // `heightCells` describes the artwork, while footprint width/height describes occupied cells.
        // Keeping those concepts separate preserves the source aspect ratio for every rectangular body.
        const boardModelTargetHeightCells = boardModelHeightCells * battlefieldCreatureScale;
        const chipScaleX = chipTargetSide / currentWidth;
        const chipScaleY = chipTargetSide / currentHeight;
        const scaleY = tallBoardModel ? (gs.getCellSize() * boardModelTargetHeightCells) / visibleHeight : chipScaleY;
        // Idle/walk stay inside the requested width. Action sheets and Orc's square padded atlases must
        // keep a uniform scale: capping that transparent canvas independently used to visibly narrow him.
        const tallBoardWidthCells =
            props.name === SCAVENGER_UNIT_NAME
                ? SCAVENGER_BOARD_MODEL_HEIGHT_CELLS / 1.5
                : props.name === THIEF_UNIT_NAME
                  ? 1
                  : 1.1;
        const scaleX = tallBoardModel
            ? refreshedFullBodyScale || this.oneShotAnim || props.name === ORC_UNIT_NAME || showingScavengerFlourish
                ? scaleY * (refreshedFullBodyScale ? refreshedVisualProfile.widthScale : 1)
                : usesThiefSilhouette
                  ? (gs.getCellSize() * tallBoardWidthCells * visualFootprintSide) / visibleWidth
                  : Math.min(scaleY, (gs.getCellSize() * tallBoardWidthCells * visualFootprintSide) / currentWidth)
            : chipScaleX;
        // The bottom anchor is the creature's foot line. Breathing stretches/compresses only the
        // vertical scale around that anchor, so the robe and torso rise while both feet stay planted.
        const orcIdleElapsedMs = this.isActiveTurn
            ? orcActiveBattleCryBreathElapsed(now - this.activeTurnAnimationStartedAtMs)
            : now - this.selectionAnimationStartedAtMs;
        const idleOrcBreathScales =
            CREATURE_SPRITE_ANIMATION_SETTINGS.enabled &&
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
        const idleWanderingMageBreathScales =
            CREATURE_SPRITE_ANIMATION_SETTINGS.enabled &&
            !this.walkAnim &&
            !this.oneShotAnim &&
            props.name === WANDERING_MAGE_UNIT_NAME
                ? ashMothIdleBreathScalesForElapsed(now, (this.idleBreathScaleScratch ??= { x: 1, y: 1 }))
                : undefined;
        const idleBreathScale =
            !this.walkAnim && !this.oneShotAnim
                ? props.name === WANDERING_MAGE_UNIT_NAME
                    ? (idleWanderingMageBreathScales?.y ?? 1)
                    : usesThiefSilhouette
                      ? (idleThiefBreathScales?.y ?? 1)
                      : (idleOrcBreathScales?.y ?? 1)
                : 1;
        const ashMothActionScale =
            props.name === WANDERING_MAGE_UNIT_NAME && this.oneShotAnim
                ? ashMothActionScaleMultiplier(this.oneShotAnim.stateName, this.oneShotAnim.frameIndex)
                : 1;
        const renderedScaleY =
            scaleY *
            idleBreathScale *
            ashMothActionScale *
            screenSizeCompensation.y *
            editorFraming.scaleY *
            battlefieldPerspectiveScale;
        const authoredDirectedScaleX =
            scaleX *
            (idleWanderingMageBreathScales?.x ?? idleThiefBreathScales?.x ?? idleOrcBreathScales?.x ?? 1) *
            ashMothActionScale *
            this.facingDirection *
            nativeBoardFacingMultiplier(props.name) *
            editorFraming.scaleX *
            battlefieldPerspectiveScale;
        const directedScaleX = authoredDirectedScaleX * screenSizeCompensation.x;
        if (this.sprite.scale.x !== directedScaleX || this.sprite.scale.y !== -renderedScaleY) {
            this.sprite.scale.set(directedScaleX, -renderedScaleY);
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
        const spriteY =
            projectedFootPosition.y +
            this.currentRecoilY -
            gs.getCellSize() * editorFraming.offsetYCells * battlefieldPerspectiveScale;
        if (this.sprite.x !== spriteX || this.sprite.y !== spriteY) {
            this.sprite.position.set(spriteX, spriteY);
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
        // The approved Peasant walk already has its alpha cracks repaired in the source frames. Re-running
        // the bridge shader on its antialiased weapon edge can brighten isolated pixels into white flecks.
        const runtimeAlphaHoleFillFilter =
            shouldFillBattlefieldAlphaHoles(props.name) && !(props.name === PEASANT_UNIT_NAME && this.walkAnim)
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

        // Heroes-IV-style furnace shadow: one intact, editable copy of the current creature frame,
        // flattened into a compact dark projection below the unit.
        if (!this.silhouetteShadow) {
            this.silhouetteShadow = new Sprite(currentTexture);
            this.silhouetteShadow.anchor.set(0.5, footAnchorY);
            this.silhouetteShadow.tint = 0x000000;
            this.silhouetteShadow.blendMode = "multiply";
            this.silhouetteShadow.roundPixels = false;
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            this.silhouetteShadow.zIndex = 4000 - pos.y - 0.75;
            worldRoot.addChild(this.silhouetteShadow);
        } else if (!this.silhouetteShadow.parent || this.silhouetteShadow.parent !== worldRoot) {
            worldRoot.addChild(this.silhouetteShadow);
        }
        const shadowTuning = resolveBattlefieldShadowTuning(props.name);
        const shadowRowProgress = battlefieldCreatureRowProgress(logicalPos.y, footprintHeight, gs);
        const shadowProjection = writeBattlefieldCreatureShadowProjection(
            shadowTuning,
            shadowRowProgress,
            this.battlefieldShadowProjection,
        );
        this.battlefieldShadowProjection = shadowProjection;
        if (this.silhouetteShadow.texture !== currentTexture) this.silhouetteShadow.texture = currentTexture;
        if (this.silhouetteShadow.anchor.x !== 0.5 || this.silhouetteShadow.anchor.y !== footAnchorY) {
            this.silhouetteShadow.anchor.set(0.5, footAnchorY);
        }
        // The editor authors the upper-row length directly. Perspective is divided out here so the lower
        // rows can receive their automatic 85% attenuation without swapping the two endpoint controls.
        // Keep Peasant's crack repair on the upright figure only. On its vertically flattened projection,
        // the bridge shader joins unrelated rows and makes the shadow read denser than every neighbouring
        // creature even though they share the same authored alpha.
        const desiredShadowFilter =
            runtimeAlphaHoleFillFilter && props.name !== PEASANT_UNIT_NAME ? runtimeAlphaHoleFillFilter : undefined;
        syncSingleSpriteFilter(this.silhouetteShadow, desiredShadowFilter);
        const segmentLengthMultipliers =
            this.shadowSegmentLengthMultipliers ?? Array<number>(BATTLEFIELD_SHADOW_SEGMENT_COUNT);
        this.shadowSegmentLengthMultipliers = segmentLengthMultipliers;
        this.silhouetteShadowSegmented = false;
        for (let index = 0; index < BATTLEFIELD_SHADOW_SEGMENT_COUNT; index++) {
            const bottomMultiplier = shadowTuning.bottom.segmentLengthMultipliers[index] ?? 1;
            const multiplier =
                bottomMultiplier +
                ((shadowTuning.top.segmentLengthMultipliers[index] ?? 1) - bottomMultiplier) * shadowRowProgress;
            segmentLengthMultipliers[index] = multiplier;
            if (Math.abs(multiplier - 1) > 0.001) this.silhouetteShadowSegmented = true;
        }
        if (this.silhouetteShadowSegmented && this.silhouetteShadowSegments.length === 0) {
            this.silhouetteShadowSegments = battlefieldShadowSegmentTextures(currentTexture).map((texture, index) => {
                const segment = new Sprite(texture);
                // Outside-range anchors place every cropped band around the original sprite centre.
                segment.anchor.set(BATTLEFIELD_SHADOW_SEGMENT_COUNT / 2 - index, footAnchorY);
                segment.tint = 0x000000;
                segment.blendMode = "multiply";
                segment.roundPixels = false;
                segment.zIndex = 4000 - pos.y - 0.75;
                worldRoot.addChild(segment);
                return segment;
            });
        }
        const silhouetteScaleX = this.sprite.scale.x * shadowProjection.widthScale;
        // A positive local Y scale is inverted by the y-up world root, projecting the cutout downward from
        // its authored foot row. The regular creature uses a negative Y scale to remain upright.
        const silhouetteScaleY =
            (Math.abs(this.sprite.scale.y) / Math.max(0.01, battlefieldPerspectiveScale)) *
            shadowProjection.lengthScale;
        if (this.silhouetteShadow.scale.x !== silhouetteScaleX || this.silhouetteShadow.scale.y !== silhouetteScaleY) {
            this.silhouetteShadow.scale.set(silhouetteScaleX, silhouetteScaleY);
        }
        const silhouetteX =
            spriteX +
            gs.getCellSize() *
                interpolateBattlefieldShadowValue(
                    shadowTuning.bottom.offsetXCells,
                    shadowTuning.top.offsetXCells,
                    shadowRowProgress,
                ) *
                battlefieldPerspectiveScale *
                this.facingDirection;
        const silhouetteY =
            spriteY +
            gs.getCellSize() *
                interpolateBattlefieldShadowValue(
                    shadowTuning.bottom.offsetYCells,
                    shadowTuning.top.offsetYCells,
                    shadowRowProgress,
                ) *
                battlefieldPerspectiveScale;
        if (this.silhouetteShadow.x !== silhouetteX || this.silhouetteShadow.y !== silhouetteY) {
            this.silhouetteShadow.position.set(silhouetteX, silhouetteY);
        }
        const silhouetteRotation =
            ((interpolateBattlefieldShadowValue(
                shadowTuning.bottom.rotationDegrees,
                shadowTuning.top.rotationDegrees,
                shadowRowProgress,
            ) *
                Math.PI) /
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
        const silhouetteAlpha = shadowProjection.alpha * (isHidden ? 0.55 : 1) * (this.canFly() ? 0.8 : 1);
        if (this.silhouetteShadow.alpha !== silhouetteAlpha) this.silhouetteShadow.alpha = silhouetteAlpha;

        if (this.silhouetteShadowSegments.length > 0) {
            const textures = battlefieldShadowSegmentTextures(currentTexture);
            for (let index = 0; index < this.silhouetteShadowSegments.length; index++) {
                const segment = this.silhouetteShadowSegments[index];
                if (segment.parent !== worldRoot) worldRoot.addChild(segment);
                if (segment.texture !== textures[index]) segment.texture = textures[index];
                const anchorX = BATTLEFIELD_SHADOW_SEGMENT_COUNT / 2 - index;
                if (segment.anchor.x !== anchorX || segment.anchor.y !== footAnchorY) {
                    segment.anchor.set(anchorX, footAnchorY);
                }
                syncSingleSpriteFilter(segment, desiredShadowFilter);
                const segmentScaleY = silhouetteScaleY * (segmentLengthMultipliers[index] ?? 1);
                if (segment.scale.x !== silhouetteScaleX || segment.scale.y !== segmentScaleY) {
                    segment.scale.set(silhouetteScaleX, segmentScaleY);
                }
                if (segment.x !== silhouetteX || segment.y !== silhouetteY) {
                    segment.position.set(silhouetteX, silhouetteY);
                }
                if (segment.rotation !== silhouetteRotation) segment.rotation = silhouetteRotation;
                if (segment.alpha !== silhouetteAlpha) segment.alpha = silhouetteAlpha;
                const segmentVisible = silhouetteVisible && this.silhouetteShadowSegmented;
                if (segment.visible !== segmentVisible) segment.visible = segmentVisible;
            }
        }

        if (isBattlefieldShadowEditorActive()) {
            const shadowSprites = this.silhouetteShadowSegmented
                ? this.silhouetteShadowSegments
                : [this.silhouetteShadow];
            let left = Infinity;
            let top = Infinity;
            let right = -Infinity;
            let bottom = -Infinity;
            for (const shadowSprite of shadowSprites) {
                const bounds = shadowSprite.getBounds();
                left = Math.min(left, bounds.x);
                top = Math.min(top, bounds.y);
                right = Math.max(right, bounds.x + bounds.width);
                bottom = Math.max(bottom, bounds.y + bounds.height);
            }
            publishBattlefieldShadowVisualBounds(props.name, {
                bounds: { x: left, y: top, width: right - left, height: bottom - top },
                cellWidth: gs.getCellSize() * inheritedScale.x,
                cellHeight: gs.getCellSize() * inheritedScale.y,
            });
        }

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
        const shadowAlpha = this.visualMode === "ghost" ? 0.1 : normalShadowAlpha;
        if (this.shadow.alpha !== shadowAlpha) this.shadow.alpha = shadowAlpha;
        // --- bullet-time dodge (missed attack): offsets sprite+shadow, leans, trails ghosts ---
        this.stepDodgeAnimation(worldRoot, now);
        // --- revealed-roster card (plate + name), drawn under the sprite ---
        this.ensureRosterCard(worldRoot, gs, props, logicalPos);
        // --- badge ---
        this.ensureBadge(worldRoot, gs, props, pos, inheritedScale, now);
        // --- stack power indicator ---
        this.ensureStackPowerIndicator(worldRoot, gs, props, pos);
        // --- turn status indicators: grouped immediately left of the amount flag ---
        this.ensureFlagStatusIndicators();
        return scaleY;
    }
    public setSpriteRotation(rotation: number) {
        if (this.sprite) {
            this.sprite.rotation = rotation;
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
    /**
     * Snapshot the live battlefield figure at another logical grid position. Movement previews use this
     * instead of rebuilding a unit from the legacy static `*_128` portrait, so refreshed idle artwork,
     * authored foot anchors, framing overrides and rectangular-board compensation remain identical to the
     * figure that will actually move. Only the projected cell-center delta changes.
     */
    public getBattlefieldPreviewAt(position: HoCMath.XY, gs: GridSettings): BattlefieldUnitPreview | undefined {
        const src = this.sprite;
        if (!src || !src.texture) return undefined;

        const logicalPosition = this.getPosition();
        const currentGround = this.getBattlefieldGroundReference(logicalPosition, gs);
        const previewGround = this.getBattlefieldGroundReference(position, gs);
        const footprintHeight = this.getFootprintHeight();
        const currentPerspectiveScale = this.useBattlefieldVisualProjection
            ? battlefieldCreaturePerspectiveScale(logicalPosition.y, footprintHeight, gs)
            : 1;
        const previewPerspectiveScale = this.useBattlefieldVisualProjection
            ? battlefieldCreaturePerspectiveScale(position.y, footprintHeight, gs)
            : 1;
        const perspectiveRatio = previewPerspectiveScale / Math.max(0.001, currentPerspectiveScale);

        return {
            texture: src.texture,
            anchorX: src.anchor.x,
            anchorY: src.anchor.y,
            scaleX: src.scale.x * perspectiveRatio,
            scaleY: src.scale.y * perspectiveRatio,
            x: previewGround.x + (src.x - currentGround.x) * perspectiveRatio,
            y: previewGround.y + (src.y - currentGround.y) * perspectiveRatio,
            rotation: src.rotation,
        };
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
        const walkAnim = this.walkAnim;
        const props = this.getUnitProperties();
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
        if (!this.useBattlefieldVisualProjection || this.visualMode !== "normal" || !sprite?.visible) return undefined;
        const bounds = sprite.getBounds(false, (this.depthSortBounds ??= new Bounds()));
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
        if (this.respondContainer) this.respondContainer.zIndex = 0;
        if (this.freezeCrust) this.freezeCrust.zIndex = depth + 0.5;
        if (this.freezeLight) this.freezeLight.zIndex = depth + 0.55;
        if (this.waterShieldBreakGfx) this.waterShieldBreakGfx.zIndex = depth + 0.6;
        for (const ghost of this.dodgeAnim?.ghosts ?? []) ghost.sprite.zIndex = depth - 1;
    }
    public syncVisual(worldRoot: Container, gs: GridSettings): void {
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
            if (this.sprite.zIndex !== baseZ) this.sprite.zIndex = baseZ;
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
            if (this.badgeContainer && this.badgeContainer.zIndex !== baseZ + 1) this.badgeContainer.zIndex = baseZ + 1;
            if (this.stackPowerContainer && this.stackPowerContainer.zIndex !== baseZ + 1) {
                this.stackPowerContainer.zIndex = baseZ + 1;
            }
            if (this.hourglassContainer && this.hourglassContainer.zIndex !== baseZ + 2) {
                this.hourglassContainer.zIndex = baseZ + 2;
            }
            if (this.stunContainer && this.stunContainer.zIndex !== baseZ + 2) this.stunContainer.zIndex = baseZ + 2;
            if (this.respondContainer && this.respondContainer.zIndex !== 0) {
                this.respondContainer.zIndex = 0;
            }
        }

        // Active-turn "light waves" pulse: the SAME animated glow + radiating rings under EVERY
        // active unit. Owner call (2026-07-18): do NOT gate or vary this per unit — gating it on aura
        // ownership (5a20846) silently removed the turn cue for plain units, and a per-unit variant
        // read as two different pulse animations. Aura REACH is telegraphed separately by the
        // SandboxDrawer range rings. Suppressed while moving/attacking so the action reads clearly.
        const showActiveAura = this.isHoverTurnAura;
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
    /**
     * Animated golden aura under the active unit: a soft breathing glow plus staggered rings of
     * light that radiate outward and fade — "waves of light" shining around it. Redrawn every
     * frame from a time-based phase so it stays smooth and never stutters.
     */
    private updateActiveAura(worldRoot: Container, gs: GridSettings, pos: HoCMath.XY, nowMs: number): void {
        if (ACTIVE_TURN_FIRE_ENABLED) {
            this.updateActiveTurnFire(worldRoot, gs, pos, nowMs);
        } else if (this.activeTurnFireSprite) {
            this.activeTurnFireSprite.visible = false;
        }
        if (!this.activeAura) {
            this.activeAura = new Graphics();
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            worldRoot.addChild(this.activeAura);
        } else if (this.activeAura.parent !== worldRoot) {
            worldRoot.addChild(this.activeAura);
        }
        // Sit on the ground beneath the unit (and its shadow) so the unit stands in the light.
        this.activeAura.zIndex = 4000 - pos.y - 0.6;
        this.activeAura.visible = true;

        const cell = gs.getCellSize();
        const footprintWidth = this.getFootprintWidth();
        const footprintHeight = this.getFootprintHeight();
        const isMultiCell = footprintWidth > 1 || footprintHeight > 1;
        // Begin the turn waves on the portrait rim (slightly inside it), rather than in the empty
        // space above/outside the creature. This keeps the indicator visually attached to the cap.
        // Taking one semi-axis from each footprint side is what keeps the SAME single pulse attached to a
        // rectangular body: the shape follows the cells, never the creature.
        const baseRadiusX = cell * footprintEffectExtent(0.47, 0.86, footprintWidth);
        const baseRadiusY = cell * footprintEffectExtent(0.47, 0.86, footprintHeight);
        const t = nowMs / 1000;

        const g = this.activeAura;
        g.clear();

        // 1. Soft pulsing inner glow that breathes with the waves.
        const pulse = 0.5 + 0.5 * Math.sin(t * 3.0);
        const glowGrowth = 1.05 + 0.1 * pulse;
        drawFootprintOval(g, pos.x, pos.y, baseRadiusX * glowGrowth, baseRadiusY * glowGrowth).fill({
            color: this.activeAuraColor,
            alpha: 0.1 + 0.1 * pulse,
        });

        // 2. Expanding light rings radiating outward, staggered so a new wave emerges as the last fades.
        const ringCount = 3;
        const cycleSec = 1.8;
        const maxGrowth = (isMultiCell ? 1.5 : 1.35) * 1.15;
        for (let i = 0; i < ringCount; i++) {
            const phase = (t / cycleSec + i / ringCount) % 1;
            const growth = 1 + (maxGrowth - 1) * phase;
            const a = (1 - phase) * 0.55;
            const width = 2 + (1 - phase) * 2.5;
            drawFootprintOval(g, pos.x, pos.y, baseRadiusX * growth, baseRadiusY * growth).stroke({
                color: this.activeAuraColor,
                alpha: a,
                width,
            });
        }
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
        // One semi-axis per footprint side, so the ring circles the feet of a rectangular body too.
        const ringRadiusX = cell * footprintEffectExtent(0.52, 0.92, this.getFootprintWidth());
        const ringRadiusY = cell * footprintEffectExtent(0.52, 0.92, this.getFootprintHeight());
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
        // The pool is already an ellipse (a circular funnel seen in perspective). Its horizontal extent now
        // follows the footprint's width and its depth the footprint's height, on top of that squash.
        const radiusX = cell * footprintEffectExtent(0.66, 1.12, this.getFootprintWidth());
        const radiusY = cell * footprintEffectExtent(0.66, 1.12, this.getFootprintHeight());
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
        // The pane covers the body, so its two half-extents follow the two footprint sides. Everything the
        // frost DECORATES with (stroke widths, glint and spark sizes) keeps one scalar taken from the
        // shorter side: those are thicknesses, not extents, and must not stretch with the pane.
        const halfWidth = cell * footprintEffectExtent(0.56, 1.02, this.getFootprintWidth());
        const halfHeight = cell * footprintEffectExtent(0.56, 1.02, this.getFootprintHeight());
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
        const config = getDefaultAnimationConfig(props.name, this.getFootprintWidth(), this.getFootprintHeight());
        if (!config) return;
        const { meta, imageSrc, imageKey, cacheKey } = config;
        let frames = atlasFramesCache.get(cacheKey);
        if (!frames) {
            frames = buildAtlasFrames(meta, imageSrc, imageKey, this.texResolver(imageKey));
            // Do not cache the temporary empty fallback: ensureVisual retries after background loading.
            if (frames.length) atlasFramesCache.set(cacheKey, frames);
        }
        if (!frames.length) return;
        this.selectionAnimFrames = frames;
        this.selectionAnimTiming = buildAtlasPingPongTiming(meta);
        const authoredFrameDurationMs = 1000 / Math.max(1, meta.fps || 8);
        this.selectionAnimFrameDurationMs = usesRefreshedFullBodyScale(props, true)
            ? authoredFrameDurationMs / REFRESHED_IDLE_ANIMATION_SPEED_MULTIPLIER
            : authoredFrameDurationMs;
        this.selectionAnimFootAnchorY = tallBoardModelFootAnchorY(props.name, "idle", meta);
        this.selectionAnimFrameIndex = -1;
        if (props.name === ORC_UNIT_NAME) {
            const twirlCacheKey = `${ORC_UNIT_NAME}::idle_axe_twirl`;
            let twirlFrames = atlasFramesCache.get(twirlCacheKey);
            if (!twirlFrames) {
                const imageSrc = images[ORC_IDLE_AXE_TWIRL_IMAGE_KEY];
                twirlFrames = buildAtlasFrames(
                    ORC_IDLE_AXE_TWIRL_META,
                    imageSrc,
                    ORC_IDLE_AXE_TWIRL_IMAGE_KEY,
                    this.texResolver(ORC_IDLE_AXE_TWIRL_IMAGE_KEY),
                );
                atlasFramesCache.set(twirlCacheKey, twirlFrames);
            }
            this.orcIdleAxeTwirlFrames = twirlFrames;

            const battleCryCacheKey = `${ORC_UNIT_NAME}::active_battle_cry`;
            let battleCryFrames = atlasFramesCache.get(battleCryCacheKey);
            if (!battleCryFrames) {
                const imageSrc = images[ORC_ACTIVE_BATTLE_CRY_IMAGE_KEY];
                battleCryFrames = buildAtlasFrames(
                    ORC_ACTIVE_BATTLE_CRY_META,
                    imageSrc,
                    ORC_ACTIVE_BATTLE_CRY_IMAGE_KEY,
                    this.texResolver(ORC_ACTIVE_BATTLE_CRY_IMAGE_KEY),
                );
                atlasFramesCache.set(battleCryCacheKey, battleCryFrames);
            }
            this.orcActiveBattleCryFrames = battleCryFrames;
        }
        if (props.name === SCAVENGER_UNIT_NAME) {
            const bladeTwirlCacheKey = `${SCAVENGER_UNIT_NAME}::idle_blade_twirl`;
            let bladeTwirlFrames = atlasFramesCache.get(bladeTwirlCacheKey);
            if (!bladeTwirlFrames) {
                const imageSrc = images[SCAVENGER_IDLE_BLADE_TWIRL_IMAGE_KEY];
                bladeTwirlFrames = buildAtlasFrames(
                    SCAVENGER_FLOURISH_META,
                    imageSrc,
                    SCAVENGER_IDLE_BLADE_TWIRL_IMAGE_KEY,
                    this.texResolver(SCAVENGER_IDLE_BLADE_TWIRL_IMAGE_KEY),
                );
                atlasFramesCache.set(bladeTwirlCacheKey, bladeTwirlFrames);
            }
            this.scavengerIdleBladeTwirlFrames = bladeTwirlFrames;

            const battleCryCacheKey = `${SCAVENGER_UNIT_NAME}::active_battle_cry`;
            let battleCryFrames = atlasFramesCache.get(battleCryCacheKey);
            if (!battleCryFrames) {
                const imageSrc = images[SCAVENGER_ACTIVE_BATTLE_CRY_IMAGE_KEY];
                battleCryFrames = buildAtlasFrames(
                    SCAVENGER_FLOURISH_META,
                    imageSrc,
                    SCAVENGER_ACTIVE_BATTLE_CRY_IMAGE_KEY,
                    this.texResolver(SCAVENGER_ACTIVE_BATTLE_CRY_IMAGE_KEY),
                );
                atlasFramesCache.set(battleCryCacheKey, battleCryFrames);
            }
            this.scavengerActiveBattleCryFrames = battleCryFrames;
        }
        // Render the in-phase frame immediately so the board lines up with the sidebar portrait
        // even before the next ticker step.
        this.stepSelectionAnimation();
    }
    public stepSelectionAnimation(now = performance.now()): void {
        const hasAuthoredIdle = this.hasAnimationState("idle");
        if (!this.boardSelected && !hasAuthoredIdle) return;
        // A walking or one-shot action owns the sprite until it finishes; idle resumes immediately after.
        if (this.walkAnim || this.oneShotAnim) return;
        const frames = this.selectionAnimFrames;
        const timing = this.selectionAnimTiming;
        if (!frames || !timing || !this.sprite) return;
        if (!CREATURE_SPRITE_ANIMATION_SETTINGS.enabled) {
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
        const unitName = this.getUnitProperties().name;
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
        const frame =
            battleCryFrame !== undefined
                ? battleCryFrame
                : twirlFrame === undefined
                  ? hasAuthoredIdle
                      ? Math.floor(
                            (now +
                                this.refreshedIdlePhaseRatio *
                                    Math.max(1, this.selectionAnimFrameDurationMs) *
                                    frames.length) /
                                Math.max(1, this.selectionAnimFrameDurationMs),
                        ) % frames.length
                      : timing.frameForElapsed(now)
                  : twirlFrame;
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
                  ? frames[frame]
                  : idleTwirlFrames?.[frame];
        if (tex) this.sprite.texture = tex;
    }
    /** Start an authored Heroes-III-style walking loop when the creature provides one. */
    public startBoardWalkAnimation(horizontalDirection: number, travelDistanceCells?: number): void {
        this.suppressActiveTurnPointer();
        const props = this.getUnitProperties();
        if (!this.sprite) return;
        this.setBoardFacingFromMovement(horizontalDirection);
        if (!creatureWalkAnimationEnabledForUnit(props.name)) {
            this.walkAnim = undefined;
            this.stepSelectionAnimation();
            return;
        }
        const config = getAnimationStateConfig(props.name, "walk", this.getFootprintWidth(), this.getFootprintHeight());
        if (!config) return;
        let frames = atlasFramesCache.get(config.cacheKey);
        if (!frames) {
            frames = buildAtlasFrames(config.meta, config.imageSrc, config.imageKey, this.texResolver(config.imageKey));
            atlasFramesCache.set(config.cacheKey, frames);
        }
        if (!frames.length) return;
        const hasThiefTransitions = props.name === THIEF_UNIT_NAME || props.name === SCAVENGER_UNIT_NAME;
        const hasAuthoredTurnInAndOut =
            hasThiefTransitions ||
            props.name === WANDERING_MAGE_UNIT_NAME ||
            props.name === CENTAUR_UNIT_NAME ||
            props.name === DRYAD_UNIT_NAME ||
            props.name === LEPRECHAUN_UNIT_NAME ||
            props.name === WOLF_RIDER_UNIT_NAME;
        const hasOrcTurnInAndOut = props.name === ORC_UNIT_NAME && frames.length > 2;
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
                      (props.name === ORC_UNIT_NAME
                          ? ORC_WALK_FPS_MULTIPLIER
                          : props.name === TROGLODYTE_UNIT_NAME
                            ? TROGLODYTE_WALK_FPS_MULTIPLIER
                            : props.name === CENTAUR_UNIT_NAME
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
        this.walkAnim = {
            frames,
            footAnchorY: tallBoardModelFootAnchorY(props.name, "walk", config.meta),
            frameIndex: 0,
            // Scavenger/Thief frame 0 turns into movement, frames 1..6 are the complete two-leg gait,
            // and frame 7 turns back to the battlefield stance. Neither transition belongs in the loop.
            // Orc likewise uses frame 0 once to turn into the move, but its seven gait poses are
            // frames 1..7; the final frame is reserved for the one-shot turn back at the destination.
            // Dryad and Wolf Rider follow the same 1 + 7 + 1 structure. Leprechaun uses 1 + 2 + 1:
            // one turn-in, two deliberately slow running poses, and the matching turn-back pose.
            // Dryad's approved gait is stored in reverse order so its legs push toward its facing.
            // An authored flyer uses its intro once for take-off, repeats only the flight phase for
            // as long as the route lasts, then plays the complete landing phase at the destination.
            loopStartFrame: hasAuthoredFlightPhases
                ? flightPhases.flight.startFrame
                : hasAuthoredTurnInAndOut && frames.length > 2
                  ? 1
                  : hasOrcTurnInAndOut
                    ? 1
                    : 0,
            loopEndFrame: hasAuthoredFlightPhases
                ? flightPhases.flight.endFrame
                : hasAuthoredTurnInAndOut || hasOrcTurnInAndOut
                  ? frames.length - 2
                  : frames.length - 1,
            outroFrame: hasAuthoredFlightPhases
                ? flightPhases.landing.startFrame
                : hasAuthoredTurnInAndOut || hasOrcTurnInAndOut
                  ? frames.length - 1
                  : undefined,
            outroEndFrame: hasAuthoredFlightPhases ? flightPhases.landing.endFrame : undefined,
            introDistanceCells,
            introComplete: introDistanceCells === undefined || introDistanceCells <= 0,
            elapsedMs: 0,
            // Visual cadence only: movement interpolation keeps its original duration.
            durationPerFrameMs: baseDurationPerFrameMs,
            frameDurationsMs:
                config.meta.frameDurationsMs?.length === frames.length ? config.meta.frameDurationsMs : undefined,
            flightFrameDurationMs: hasAuthoredFlightPhases ? baseDurationPerFrameMs / flightSpeedMultiplier : undefined,
            outroFrameDurationMs: hasAuthoredFlightPhases ? baseDurationPerFrameMs / landingSpeedMultiplier : undefined,
            completedCycles: 0,
            finishAfterCycle: false,
            distanceDriven:
                props.name === PEASANT_UNIT_NAME ||
                props.name === WANDERING_MAGE_UNIT_NAME ||
                props.name === TROLL_UNIT_NAME,
        };
        this.sprite.texture = frames[0];
        if (props.name === PEASANT_UNIT_NAME && this.battlefieldAlphaHoleFillFilter) {
            const alphaHoleFilter = this.battlefieldAlphaHoleFillFilter;
            this.sprite.filters = (this.sprite.filters ?? []).filter((filter) => filter !== alphaHoleFilter);
            this.battlefieldAlphaHoleFillFilter = undefined;
        }
    }
    /**
     * Synchronize spatially-authored gait poses to real board distance. Peasant and Wandering Mage
     * span two cells per cycle; Troll advances its complete authored gait over the tuned 1.25-cell cycle.
     */
    public setBoardWalkDistanceCells(distanceCells: number): void {
        const anim = this.walkAnim;
        if (!anim || !this.sprite || this.oneShotAnim) return;
        const safeDistance = Math.max(0, distanceCells);
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
        const cycleDistance =
            unitName === PEASANT_UNIT_NAME
                ? PEASANT_WALK_CYCLE_DISTANCE_CELLS
                : unitName === TROLL_UNIT_NAME
                  ? TROLL_WALK_CYCLE_DISTANCE_CELLS
                  : WANDERING_MAGE_WALK_CYCLE_DISTANCE_CELLS;
        const frameDistance = cycleDistance / gaitFrameCount;
        const absoluteGaitFrame = Math.floor(safeDistance / frameDistance + 1e-9);
        anim.completedCycles = Math.floor(absoluteGaitFrame / gaitFrameCount);
        anim.frameIndex = anim.loopStartFrame + (absoluteGaitFrame % gaitFrameCount);
        anim.elapsedMs = 0;
        const texture = anim.frames[anim.frameIndex];
        if (texture) this.sprite.texture = texture;
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
        const prefix = attackKind === "melee" && this.hasAnimationState("melee_attack") ? "melee_attack" : "attack";
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
    public stopBoardWalkAnimation(): void {
        if (!this.walkAnim) return;
        const onOutroComplete = this.walkAnim.onOutroComplete;
        this.walkAnim = undefined;
        this.selectionAnimationStartedAtMs = performance.now();
        this.selectionAnimFrameIndex = -1;
        // Restore the permanent breathing/fire cycle immediately at the landing position.
        this.stepSelectionAnimation();
        if (onOutroComplete) onOutroComplete();
    }
    /**
     * Let a short move finish all authored footstep poses without extending the unit's actual travel.
     * The unit may complete the remaining frames at its destination; actions still interrupt this tail.
     */
    public finishBoardWalkAnimationAfterFullCycle(onLandingComplete?: () => void): boolean {
        const anim = this.walkAnim;
        if (!anim) return false;
        const startOutro = (): boolean => {
            const outroFrame = anim.outroFrame;
            if (outroFrame === undefined) return false;
            anim.frameIndex = outroFrame;
            anim.elapsedMs = 0;
            const texture = anim.frames[outroFrame];
            if (texture && this.sprite) this.sprite.texture = texture;
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
        // Orc turns back to its battlefield camera angle exactly once at the destination. Movement has
        // already ended here, so jump straight to the authored outro rather than completing more gait.
        if (this.getUnitProperties().name === ORC_UNIT_NAME) {
            if (!startOutro()) this.stopBoardWalkAnimation();
            return false;
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
        if (anim.distanceDriven && !isInOutro) return;
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
                return;
            }
        }
        anim.frameIndex = nextFrame;
        const texture = anim.frames[nextFrame];
        if (texture) this.sprite.texture = texture;
    }
    public stepSpawnAnimation(dt: number): void {
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
        this.stepBoardWalkAnimation(dt * 1000);
        // --- One Shot animation ---
        this.stepOneShotAnimation(dt * 1000);
    }
    private stopSelectionAnimationInternal(): void {
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
            const props = this.getUnitProperties();
            const texName = unitToTextureName(
                props.name,
                TextureType.SMALL,
                this.getFootprintWidth(),
                this.getFootprintHeight(),
            );
            const tex = this.texResolver(texName);
            if (tex) this.sprite.texture = tex;
        }
    }
    public startSpawnAnimation(_scale: number): void {
        if (!this.sprite || !this.shadow) return;
        const unitName = this.getUnitProperties().name;
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
    /** Current world-space weapon/hand attachment used to launch ranged projectiles. */
    public getRangedProjectileOrigin(target: HoCMath.XY, gs: GridSettings): HoCMath.XY {
        const sprite = this.sprite;
        const parent = sprite?.parent;
        if (!sprite || !parent || !sprite.visible) return this.getVisualCenter(gs);

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

                if (this.shouldShowRespondTag()) {
                    anchor.y +=
                        Math.max(0, (geometry.headerWidth - geometry.flagHeight) * 0.5) * this.badgeEmphasisScale;
                }
                const framing = resolveStoredBattlefieldCreatureFraming(this.getUnitProperties().name);
                anchor.x += (framing.flagOffsetXCells ?? 0) * gs.getCellSize();
                anchor.y -= (framing.flagOffsetYCells ?? 0) * gs.getCellSize();
                return anchor;
            }
        }

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
    public hasAnimationState(stateName: string): boolean {
        if (stateName === "idle") return this.idleAnimationStateAvailable;
        const props = this.getUnitProperties();
        return (
            getAnimationStateConfig(props.name, stateName, this.getFootprintWidth(), this.getFootprintHeight()) !== null
        );
    }
    public isPlayingOneShotAnimation(stateName?: string): boolean {
        return !!this.oneShotAnim && (!stateName || this.oneShotAnim.stateName === stateName);
    }
    /**
     * Plays a one-shot animation sequence (like 'death', 'attack', 'hit')
     * @param stateName The animation state name (e.g. "death", "attack")
     * @param onComplete Callback when animation finishes
     */
    public playOneShotAnimation(stateName: string, onComplete?: () => void): boolean {
        this.suppressActiveTurnPointer();
        if (!CREATURE_SPRITE_ANIMATION_SETTINGS.enabled) {
            this.oneShotAnim = undefined;
            this.walkAnim = undefined;
            this.stepSelectionAnimation();
            if (onComplete) onComplete();
            return false;
        }
        const props = this.getUnitProperties();
        const config = getAnimationStateConfig(
            props.name,
            stateName,
            this.getFootprintWidth(),
            this.getFootprintHeight(),
        );
        // If config/atlas not found, just fire callback immediately.
        if (!config || !this.sprite) {
            if (onComplete) onComplete();
            return false;
        }
        const { meta, imageSrc, imageKey, cacheKey } = config;
        let frames = atlasFramesCache.get(cacheKey);
        if (!frames) {
            frames = buildAtlasFrames(meta, imageSrc, imageKey, this.texResolver(imageKey));
            atlasFramesCache.set(cacheKey, frames);
        }
        if (!frames.length) {
            if (onComplete) onComplete();
            return false;
        }

        // Attacks, casts and reactions take visual priority over any short post-move walk tail.
        this.walkAnim = undefined;

        this.oneShotAnim = {
            stateName,
            frames,
            footAnchorY: tallBoardModelFootAnchorY(props.name, stateName, meta),
            frameIndex: 0,
            elapsed: 0,
            durationPerFrame:
                ((meta.loopDurationMs || 1000) / (meta.frameCount || frames.length)) *
                oneShotAnimationDurationMultiplier(props.name, stateName),
            onComplete,
        };

        // Set first frame immediately
        this.sprite.texture = frames[0];
        return true;
    }
    public stepOneShotAnimation(dtMs: number): void {
        if (!this.oneShotAnim || !this.sprite) return;

        const anim = this.oneShotAnim;
        anim.elapsed += dtMs;

        if (anim.elapsed >= anim.durationPerFrame) {
            const framesToAdvance = Math.floor(anim.elapsed / anim.durationPerFrame);
            anim.elapsed %= anim.durationPerFrame;

            anim.frameIndex += framesToAdvance;

            if (anim.frameIndex >= anim.frames.length) {
                // Animation Finished
                const callback = anim.onComplete;
                this.oneShotAnim = undefined;
                this.selectionAnimationStartedAtMs = performance.now();
                this.selectionAnimFrameIndex = -1;
                if (callback) callback();
            } else {
                this.sprite.texture = anim.frames[anim.frameIndex];
            }
        }
    }
    /** Release non-display resources whether the unit or its parent container initiates teardown. */
    private releaseVisualLifecycleResources(): void {
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
            this.rosterCardLabel = undefined;
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
     * fill following the painted cell, plus the creature's name underneath, makes the row read as a roster:
     * you can see WHAT they drafted at a glance (the stack size stays redacted as "?" on the badge).
     * Non-revealed units keep the marker hidden, so nothing changes on the live board.
     */
    private ensureRosterCard(
        worldRoot: Container,
        gs: GridSettings,
        props: UnitProperties,
        logicalPos: HoCMath.XY,
    ): void {
        if (this.visualMode !== "revealed") {
            if (this.rosterCard) {
                this.rosterCard.visible = false;
            }
            return;
        }

        if (!this.rosterCard) {
            this.rosterCard = new Container();
            this.rosterCardPlate = new Graphics();
            this.rosterCardLabel = new Text({
                text: props.name,
                style: new TextStyle({
                    fill: 0xefe4cc,
                    fontSize: 13,
                    fontWeight: "700",
                    fontFamily: BOARD_FONT_FAMILY,
                    stroke: { color: 0x000000, width: 3, join: "round" },
                }),
            });
            this.rosterCardLabel.anchor.set(0.5);
            // worldRoot is y-up; counter-flip so the caption reads upright.
            this.rosterCardLabel.scale.y = -1;
            this.rosterCard.addChild(this.rosterCardPlate, this.rosterCardLabel);
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            worldRoot.addChild(this.rosterCard);
        } else if (this.rosterCard.parent !== worldRoot) {
            worldRoot.addChild(this.rosterCard);
        }

        const cell = gs.getCellSize() * this.visualScaleMultiplier;
        const footprintWidth = this.getFootprintWidth();
        const footprintHeight = this.getFootprintHeight();
        const captionGap = cell * 0.3;
        const fontSize = Math.max(9, Math.round(cell * 0.15));
        const teamColor =
            props.team === TeamVals.NO_TEAM
                ? NO_TEAM_ROSTER_COLOR
                : // A player may repaint the armies: their OWN in a chosen colour, the enemy in red.
                  (personalArmyPresetFor(props.team)?.color ?? resolveTeamColor(props.team));
        const previousDrawState = this.rosterCardDrawState;
        const needsRedraw =
            !previousDrawState ||
            previousDrawState.x !== logicalPos.x ||
            previousDrawState.y !== logicalPos.y ||
            previousDrawState.cell !== cell ||
            previousDrawState.footprintWidth !== footprintWidth ||
            previousDrawState.footprintHeight !== footprintHeight ||
            previousDrawState.projected !== this.useBattlefieldVisualProjection ||
            previousDrawState.name !== props.name ||
            previousDrawState.teamColor !== teamColor;

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

            const label = this.rosterCardLabel!;
            label.style = new TextStyle({
                fill: 0xefe4cc,
                fontSize,
                fontWeight: "700",
                fontFamily: BOARD_FONT_FAMILY,
                stroke: { color: 0x000000, width: 3, join: "round" },
            });
            label.text = props.name;
            // Keep the caption just inside the footprint's lower seam. Projecting this anchor through the
            // same traced grid keeps it attached to the real stone cell instead of the old square overlay.
            const labelPosition = this.useBattlefieldVisualProjection
                ? projectBattlefieldPoint(
                      {
                          x: logicalPos.x,
                          y: logicalBottom + gs.getStep() * 0.12,
                      },
                      gs,
                  )
                : { x: logicalPos.x, y: logicalBottom + (captionGap + fontSize) * 0.5 };
            label.position.set(labelPosition.x, labelPosition.y);
            this.rosterCardDrawState = {
                x: logicalPos.x,
                y: logicalPos.y,
                cell,
                footprintWidth,
                footprintHeight,
                projected: this.useBattlefieldVisualProjection,
                name: props.name,
                teamColor,
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
            pointer.fill({ color: 0xffc83d, alpha: 1 });
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
        if (needsRedraw || !this.isActiveTurn) {
            this.drawBadgeFlag(flag, flagGlow, geometry, teamColor, stackPower, now);
        }
        this.drawActiveTurnPointer(activeTurnPointer, flagGlow, geometry, needsRedraw, now);
        // The flag stays static during the active turn; only authored preview emphasis may resize it.
        const renderedBadgeScale = this.badgeEmphasisScale;
        // Centre the ribbon above the actual rendered creature image rather than above its logical cell.
        // This keeps the badge over the head for tall, short and multi-cell creatures alike.
        const spriteBounds = this.sprite?.getBounds(false, (this.badgeSpriteBounds ??= new Bounds()));
        const margin = Math.max(2, Math.floor(iconSide * 0.04));
        let x: number;
        let y: number;
        if (spriteBounds && spriteBounds.width > 0 && spriteBounds.height > 0) {
            const screenHalfHeight = geometry.flagHeight * parentScale.y * renderedBadgeScale * 0.5;
            const screenAnchor = (this.badgeScreenAnchor ??= new Point());
            screenAnchor.set(spriteBounds.x + spriteBounds.width * 0.5, spriteBounds.y - margin - screenHalfHeight);
            const aboveHead = worldRoot.toLocal(screenAnchor, undefined, (this.badgeLocalAnchor ??= new Point()), true);
            x = aboveHead.x;
            y = aboveHead.y;
        } else {
            // Clear the body's own half-height, which is the footprint's HEIGHT in cells: a two-row body
            // would otherwise sit its count ribbon on the seam between its own cells.
            x = pos.x;
            y = pos.y + iconSide * this.getFootprintHeight() * 0.5 + geometry.flagHeight * 0.5 + margin;
        }
        const flagFraming = resolveStoredBattlefieldCreatureFraming(props.name);
        x += (flagFraming.flagOffsetXCells ?? 0) * gs.getCellSize();
        y -= (flagFraming.flagOffsetYCells ?? 0) * gs.getCellSize();
        if (container.x !== x || container.y !== y) container.position.set(x, y);
        if (container.scale.x !== renderedBadgeScale || container.scale.y !== renderedBadgeScale) {
            container.scale.set(renderedBadgeScale, renderedBadgeScale);
        }
        const visible = this.visualMode !== "hidden" && (amount > 0 || isRevealed);
        if (container.visible !== visible) container.visible = visible;
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
    private ensureFlagStatusIndicators(): void {
        const badge = this.badgeContainer;
        const geometry = this.badgeDrawState?.geometry;
        const canRender =
            (this.visualMode ?? "normal") === "normal" &&
            this.getAmountAlive() > 0 &&
            Boolean(badge?.visible && geometry);

        this.syncFlagStatusIcon("hourglass", "hourglass", canRender && this.shouldShowHourglassIndicator(), badge);
        this.syncFlagStatusIcon("stun", "stun_hand_forged", canRender && this.shouldShowStunIndicator(), badge);
        this.syncFlagStatusIcon("respond", "tag", canRender && this.shouldShowRespondTag(), badge);

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
    private shouldShowRespondTag(): boolean {
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
            performance.now() < this.respondFeedbackUntilMs
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
    /** Temporarily hide the active-turn aura (e.g. while the unit is moving or attacking). */
    public setSuppressActiveAura(suppress: boolean): void {
        this.suppressActiveAura = suppress;
        if (suppress) this.suppressActiveTurnPointer();
    }
    /**
     * Apply a brief positional "recoil": the sprite/shadow jerk by (dx, dy) and spring back over
     * ~220ms. Used for attack lunges and authored special-ability motion.
     */
    public applyRecoil(dx: number, dy: number): void {
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
        this.recoilStartMs = performance.now();
        this.recoilDx = dx;
        this.recoilDy = dy;
        this.recoilShakeAmplitude = 0;
        this.recoilWindup = true;
        this.recoilDurationMs = 380;
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
        let frames = atlasFramesCache.get(config.cacheKey);
        if (!frames) {
            frames = buildAtlasFrames(config.meta, config.imageSrc, config.imageKey, this.texResolver(config.imageKey));
            atlasFramesCache.set(config.cacheKey, frames);
        }
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
}
