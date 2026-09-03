import {
    Assets,
    BlurFilter,
    ColorMatrixFilter,
    type ColorMatrix,
    Container,
    Filter,
    Graphics,
    PerspectiveMesh,
    Rectangle,
    Sprite,
    Texture,
} from "pixi.js";
import {
    GridSettings,
    GridVals,
    FightStateManager,
    GridConstants,
    GridMath,
    HoCConstants,
    HoCMath,
} from "@heroesofcrypto/common";

import { boardFitHeight, boardFitWidth } from "../../pixi/boardFit";
import { images } from "../../generated/image_imports";
import {
    BATTLEFIELD_ARTWORK,
    battlefieldArtworkLayout,
    projectBattlefieldPoint,
    projectedBattlefieldMetricsAtPoint,
    projectedCellPoints,
} from "./BattlefieldVisualGrid";
import { createDungeonLightFilter, updateDungeonLightUniforms } from "./DungeonLightFilter";
import {
    AMBIENT_FIRE_DEFINITIONS,
    getAmbientFireEditorSelection,
    resolveAmbientFireTuning,
    type AmbientFireTuning,
} from "./ambientFireTuning";
import {
    isLavaAnimationEditorActive,
    lavaAnimationFrameAtTime,
    lavaPitLightIntensityAtTime,
    resolveLavaAnimationTuning,
    type LavaAnimationTuning,
} from "./lavaAnimationTuning";

export interface IDungeonVisualsContext {
    getStage(): Container;
    getWorldRoot(): Container;
    getViewportSize(): { width: number; height: number };
    getGridSettings(): GridSettings;
    texAny(name: string): Texture | undefined;
    attachToWorldRoot(obj: Container, zIndex?: number): void;
    /** Shared depth-sorted parent used by live creatures and tall battlefield obstacles. */
    attachToUnitDepthRoot?(obj: Container, zIndex?: number): void;
}

/** A single-cell mountain: where it stands and which of the pool's variants it is drawn with. */
export interface IScatteredMountain {
    x: number;
    y: number;
    variant: number;
}

/** Bottom-row barrels keep the editor size; the top row is 10% smaller, with a linear step between rows. */
export const cemeteryObstacleScaleForRow = (row: number, gridSize = GridConstants.GRID_SIZE): number => {
    const lastRow = Math.max(1, gridSize - 1);
    const normalizedRow = Math.min(1, Math.max(0, row / lastRow));
    return 1 - normalizedRow * 0.1;
};

/** The approved brown barrel silhouette is 5% narrower than the previously tuned frame. */
export const CEMETERY_OBSTACLE_WIDTH_SCALE = 0.95;

/** Keep horizontal narrowing independent from the approved height and perspective tuning. */
export const cemeteryObstacleSpriteScale = (
    projectedWidth: number,
    textureWidth: number,
    drawnHeight: number,
    textureHeight: number,
    rowScale: number,
): { x: number; y: number } => ({
    x: (projectedWidth * rowScale * CEMETERY_OBSTACLE_WIDTH_SCALE) / textureWidth,
    y: -(drawnHeight / textureHeight),
});

/** Match creature depth sorting: a lower screen-space base renders in front. */
export const cemeteryObstacleDepthFromBaseY = (baseY: number): number => 4000 - baseY;

/** Barrels share the creature parent so their silhouettes and HP art interleave correctly with units. */
export const attachCemeteryObstacleToDepthRoot = (
    context: Pick<IDungeonVisualsContext, "attachToWorldRoot" | "attachToUnitDepthRoot">,
    object: Container,
    depth: number,
): void => (context.attachToUnitDepthRoot ?? context.attachToWorldRoot)(object, depth);

/** Editor-authored frame geometry before the per-cell base lift is added by the renderer. */
export const cemeteryObstacleFrameGeometry = (
    projectedWidth: number,
    projectedHeight: number,
    row: number,
    gridSize = GridConstants.GRID_SIZE,
): { frameHeight: number; rise: number; scale: number } => {
    const scale = cemeteryObstacleScaleForRow(row, gridSize);
    const frameHeight = projectedWidth * (461 / 256) * 1.785 * scale;
    return {
        frameHeight,
        rise: (frameHeight - projectedHeight) * 0.5,
        scale,
    };
};

/** Variant B: scale the packed barrel silhouette to a short, quarter-cell downward cast shadow. */
export const CEMETERY_OBSTACLE_SHADOW_LENGTH_CELLS = 0.25;
export const cemeteryObstacleShadowScaleY = (projectedHeight: number): number =>
    (projectedHeight * CEMETERY_OBSTACLE_SHADOW_LENGTH_CELLS) / 235;

// Standard Pixi v8 filter vertex. The fragment pass applies the approved dark bronze-brown material
// grade and tones the final antialiased contour texels without changing the authored transparency.
const CEMETERY_EDGE_VERTEX = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vTexelSize;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
    vTexelSize = uInputSize.zw;
}
`;

// The texel size is carried from the vertex as a varying rather than read from uInputSize here. Declaring
// uInputSize in BOTH stages is what broke this pass: a vertex float defaults to highp while pixi injects a
// mediump default into the fragment, so the two declarations disagree and the program fails to LINK —
// "Precisions of uniform 'uInputSize' differ between VERTEX and FRAGMENT shaders", then "Could not
// initialize shader" and an endless "useProgram: program not valid" once per frame. Same shape as the
// Battlefield alpha-hole and contour filters, which pass vTexelSize for exactly this reason.
const CEMETERY_EDGE_FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
in vec2 vTexelSize;
out vec4 finalColor;

uniform sampler2D uTexture;

void main(void) {
    vec4 color = texture(uTexture, vTextureCoord);
    if (color.a <= 0.001) {
        finalColor = color;
        return;
    }

    vec2 px = vTexelSize;
    float nearestAlpha = 1.0;
    nearestAlpha = min(nearestAlpha, texture(uTexture, vTextureCoord + vec2( px.x, 0.0)).a);
    nearestAlpha = min(nearestAlpha, texture(uTexture, vTextureCoord + vec2(-px.x, 0.0)).a);
    nearestAlpha = min(nearestAlpha, texture(uTexture, vTextureCoord + vec2(0.0,  px.y)).a);
    nearestAlpha = min(nearestAlpha, texture(uTexture, vTextureCoord + vec2(0.0, -px.y)).a);
    nearestAlpha = min(nearestAlpha, texture(uTexture, vTextureCoord + vec2( px.x,  px.y)).a);
    nearestAlpha = min(nearestAlpha, texture(uTexture, vTextureCoord + vec2(-px.x,  px.y)).a);
    nearestAlpha = min(nearestAlpha, texture(uTexture, vTextureCoord + vec2( px.x, -px.y)).a);
    nearestAlpha = min(nearestAlpha, texture(uTexture, vTextureCoord + vec2(-px.x, -px.y)).a);

    // Work in straight colour so translucent contour pixels receive the same material grade as the body.
    vec3 straightColor = color.rgb / max(color.a, 0.001);
    float luminance = dot(straightColor, vec3(0.2126, 0.7152, 0.0722));
    vec3 darkBronzeBrown = vec3(luminance * 1.04, luminance * 0.74, luminance * 0.50);
    straightColor = mix(straightColor, darkBronzeBrown, 0.52);
    straightColor *= 0.94;

    // Semi-transparent fringe texels receive the strongest correction. The adjacent opaque contour gets a
    // lighter tone, preventing a bright halo without replacing it with a black outline.
    float fringe = (1.0 - smoothstep(0.45, 0.92, color.a)) * step(0.01, color.a);
    float solidEdge = smoothstep(0.08, 0.75, color.a - nearestAlpha) * 0.48;
    float edge = clamp(max(fringe, solidEdge), 0.0, 1.0);
    vec3 materialDarkening = vec3(0.58, 0.56, 0.54);
    straightColor *= mix(vec3(1.0), materialDarkening, edge);
    finalColor = vec4(clamp(straightColor, 0.0, 1.0) * color.a, color.a);
}
`;

const createCemeteryEdgeDarkenFilter = (): Filter | undefined => {
    try {
        const filter = Filter.from({
            gl: { vertex: CEMETERY_EDGE_VERTEX, fragment: CEMETERY_EDGE_FRAGMENT },
            resources: {},
        });
        filter.resolution = "inherit";
        filter.padding = 1;
        return filter;
    } catch {
        return undefined;
    }
};

/** Keep splash births inside one of the twelve open grate windows marked by the user (4 columns × 3 rows). */
export const lavaSplashOriginWithinGrateOpening = (
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    zoneNoise: number,
    noiseX: number,
    noiseY: number,
): { x: number; y: number } => {
    // Normalized source-pixel ranges (512×512). Each range stays inset from the metal edges and rivets.
    const columns = [
        [86, 136],
        [183, 232],
        [280, 328],
        [376, 424],
    ] as const;
    const rows = [
        [205, 243],
        [287, 329],
        [373, 415],
    ] as const;
    const clampedZone = Math.max(0, Math.min(0.999999, zoneNoise));
    const zoneIndex = Math.floor(clampedZone * columns.length * rows.length);
    const column = columns[zoneIndex % columns.length];
    const row = rows[Math.floor(zoneIndex / columns.length)];
    const sourceX = (column[0] + (column[1] - column[0]) * Math.max(0, Math.min(1, noiseX))) / 512;
    const sourceY = (row[0] + (row[1] - row[0]) * Math.max(0, Math.min(1, noiseY))) / 512;
    return {
        x: centerX + (sourceX - 0.5) * width,
        // World Y grows upward, opposite to texture-source Y.
        y: centerY - (sourceY - 0.5) * height,
    };
};

export type CemeteryObstacleShadowStyle = Readonly<{
    firelightExposure: number;
    alpha: number;
    widthMultiplier: number;
    lengthMultiplier: number;
}>;

/**
 * The painted Cemetery floor carries three warm light lanes beneath the furnace openings. Shadows should
 * respond to those same lanes: strongest beside the top wall, still slightly reinforced farther down where
 * the warm spill remains visible, and unchanged between the lanes.
 */
export const cemeteryObstacleShadowStyle = (
    column: number,
    row: number,
    gridSize = GridConstants.GRID_SIZE,
): CemeteryObstacleShadowStyle => {
    const lastCell = Math.max(1, gridSize - 1);
    const cellCenter = Math.max(0, Math.min(lastCell, column)) + 0.5;
    // The furnace centres align with authored vertical seams 2, 8 and 14 of the 16-column floor.
    const furnaceSeams = [2, 8, 14].map((seam) => (seam / 16) * gridSize);
    const nearestLaneDistance = Math.min(...furnaceSeams.map((furnaceX) => Math.abs(cellCenter - furnaceX)));
    const horizontalExposure = Math.max(0, 1 - nearestLaneDistance / Math.max(1, gridSize * 0.19));
    const distanceTowardFurnaces = Math.max(0, Math.min(1, row / lastCell));
    const verticalExposure = 0.22 + 0.78 * Math.pow(distanceTowardFurnaces, 1.45);
    const firelightExposure = horizontalExposure * verticalExposure;
    return {
        firelightExposure,
        alpha: 0.44 + firelightExposure * 0.1,
        widthMultiplier: 1 + firelightExposure * 0.1,
        lengthMultiplier: 1 + firelightExposure * 0.3,
    };
};

/** One flying quarter of a collapsing mountain. */
interface IMountainChunk {
    sprite: Sprite;
    homeX: number;
    homeY: number;
    /** World units / second at the moment the block breaks apart. */
    vx: number;
    vy: number;
    /** Radians / second. */
    spin: number;
    /** The chunk's center settles on this line (the mountain's base) after falling. */
    floorY: number;
    /** Extra variant-specific pause after the common shudder, used for staged collapses. */
    delayMs?: number;
}

interface IMountainDustPuff {
    gfx: Graphics;
    vx: number;
    vy: number;
    lifeMs: number;
    baseAlpha: number;
    baseRadius: number;
    bornMs: number;
}

interface IMountainCollapse {
    container: Container;
    chunks: IMountainChunk[];
    dust: IMountainDustPuff[];
    startMs: number;
    lastStepMs: number;
    shudderMs?: number;
    gravityScale?: number;
}

interface ITombstoneCollapseProfile {
    /** Per quarter (image order: top-left, top-right, bottom-left, bottom-right). */
    vx: readonly [number, number, number, number];
    vy: readonly [number, number, number, number];
    spin: readonly [number, number, number, number];
    delayMs: readonly [number, number, number, number];
    gravityScale: number;
    shudderMs: number;
    dust: readonly [number, number];
    dustCount: number;
}

// Tuning for the mountain-collapse animation: the 2x2 block shudders in place, cracks into its four
// quarter-squares, they fly toward their corners under gravity, crash onto the mountain's base line
// with a bounce, then crumble away in a cloud of dust.
const MC_SHUDDER_MS = 200; // block trembles before it breaks
const MC_TOTAL_MS = 1400; // full animation lifetime (chunks + dust are destroyed after this)
const MC_FADE_START_MS = 750; // chunks/dust start dissolving here...
const MC_FADE_END_MS = 1350; // ...and are fully gone here
const MC_GRAVITY_CELLS = 9; // world-units/s² pulling chunks down, in cell sizes
const MC_BOUNCE = 0.35; // vertical velocity kept after crashing onto the base line
const MC_DUST_COUNT = 12;

/**
 * Nine deliberately different silhouettes of motion, one per Cemetery obstacle atlas tile:
 * burst, left topple, right topple, crown-pop, heavy crumble, cross-split, spiral, geyser, and gate-fall.
 * Values are expressed in cell widths/second (velocity) and radians/second (spin).
 */
const TOMBSTONE_COLLAPSE_PROFILES: readonly ITombstoneCollapseProfile[] = [
    {
        vx: [-0.9, 0.9, -0.55, 0.55],
        vy: [1.15, 1.05, 0.38, 0.32],
        spin: [-3.4, 3.2, -1.8, 1.7],
        delayMs: [0, 0, 35, 35],
        gravityScale: 1,
        shudderMs: 170,
        dust: [0x897761, 0x665847],
        dustCount: 8,
    },
    {
        vx: [-1.2, -0.78, -0.72, -0.38],
        vy: [0.38, 0.62, 0.12, 0.2],
        spin: [-4.5, -3.8, -2.2, -1.8],
        delayMs: [0, 45, 110, 145],
        gravityScale: 1.25,
        shudderMs: 230,
        dust: [0x766657, 0x51463c],
        dustCount: 10,
    },
    {
        vx: [0.78, 1.2, 0.38, 0.72],
        vy: [0.62, 0.38, 0.2, 0.12],
        spin: [3.8, 4.5, 1.8, 2.2],
        delayMs: [45, 0, 145, 110],
        gravityScale: 1.25,
        shudderMs: 230,
        dust: [0x82705d, 0x594a3c],
        dustCount: 10,
    },
    {
        vx: [-0.42, 0.42, -0.2, 0.2],
        vy: [1.85, 1.72, 0.18, 0.16],
        spin: [-5.6, 5.6, -0.7, 0.7],
        delayMs: [0, 0, 190, 190],
        gravityScale: 0.82,
        shudderMs: 125,
        dust: [0x9a8467, 0x6b5945],
        dustCount: 7,
    },
    {
        vx: [-0.24, 0.2, -0.12, 0.1],
        vy: [0.2, 0.16, 0.06, 0.05],
        spin: [-1.1, 0.9, -0.45, 0.4],
        delayMs: [30, 105, 0, 165],
        gravityScale: 1.7,
        shudderMs: 310,
        dust: [0x62584c, 0x403a33],
        dustCount: 14,
    },
    {
        vx: [-1.15, 1.15, 0.75, -0.75],
        vy: [0.78, 0.78, 0.42, 0.42],
        spin: [-2.8, 2.8, 3.3, -3.3],
        delayMs: [0, 0, 95, 95],
        gravityScale: 1.05,
        shudderMs: 155,
        dust: [0x8c745b, 0x5f4b39],
        dustCount: 9,
    },
    {
        vx: [-0.72, 0.56, -0.48, 0.78],
        vy: [1.2, 0.92, 0.48, 0.66],
        spin: [5.8, 5.2, 4.4, 4.9],
        delayMs: [0, 55, 110, 165],
        gravityScale: 0.92,
        shudderMs: 135,
        dust: [0x746b63, 0x4e4944],
        dustCount: 8,
    },
    {
        vx: [-0.34, 0.34, -0.62, 0.62],
        vy: [2.15, 1.9, 1.35, 1.48],
        spin: [-6.5, 6.5, -5.2, 5.2],
        delayMs: [0, 70, 140, 210],
        gravityScale: 0.72,
        shudderMs: 95,
        dust: [0x9b8b78, 0x6d5f50],
        dustCount: 12,
    },
    {
        vx: [-0.82, 0.74, -0.32, 0.38],
        vy: [0.92, 1.04, 0.2, 0.24],
        spin: [-3.1, 2.7, -1.2, 1.4],
        delayMs: [0, 40, 125, 155],
        gravityScale: 1.18,
        shudderMs: 205,
        dust: [0x806c57, 0x554638],
        dustCount: 11,
    },
];

// How many cells wide/tall each 2x2 BLOCK_CENTER mountain sprite is DRAWN. Deliberately larger than the
// 2-cell collision footprint so the rock reads as a chunky block (the texture has transparent padding).
// Shared by the resting sprite AND its collapse quarters so the four quarters overlay it exactly — keep it
// as the single source so they can't drift. (Was 2.75; bumped 10% — the mountains looked smaller than 2 cells.)
const MOUNTAIN_BLOCK_CELLS = 3.4;

export interface IMountainHitBarLayout {
    width: number;
    height: number;
    gap: number;
    framePadding: number;
    centerOffset: number;
}

/**
 * Keep the mountain HP meter inside the broad stone shelf at the sprite's base. The source texture's
 * visible rock ends just under one cell below its centre; reserving the last 10% keeps the frame from
 * leaking into the row beneath it at any board scale.
 */
export const getMountainHitBarLayout = (cellSize: number): IMountainHitBarLayout => {
    const height = Math.max(6, Math.round(cellSize * 0.085));
    const framePadding = Math.max(1, Math.round(cellSize * 0.012));
    const bottomLimit = cellSize * 0.9;

    return {
        width: cellSize * 1.12,
        height,
        gap: Math.max(2, Math.round(cellSize * 0.022)),
        framePadding,
        centerOffset: Math.min(cellSize * 0.8, bottomLimit - height / 2 - framePadding),
    };
};

export const getScatteredMountainHitBarLayout = (cellSize: number): IMountainHitBarLayout => ({
    // One clear red segment: every Cemetery barrel has exactly one hit point. Keep it narrower than the
    // barrel itself, but large enough to remain readable on the far rows of the perspective board.
    width: cellSize * 0.48,
    height: Math.max(4, Math.round(cellSize * 0.055)),
    gap: 0,
    framePadding: Math.max(1, Math.round(cellSize * 0.01)),
    // World Y grows upward, so subtracting this value puts the meter immediately BELOW the barrel base.
    centerOffset: cellSize * 0.055,
});

export class DungeonVisuals {
    private context: IDungeonVisualsContext;
    // State
    private atmosphereAlpha = 0;
    /** GLSL "wall-sconce" lighting applied over the board square; replaces the old circle fills. */
    private lightFilter?: Filter;
    private lightOverlay?: Graphics;
    private lightBuilt = false;
    /** Sconce inset (board-square uv units) so the light tracks the board as holes eat the edges. */
    private lightInward = 0;
    private lightTimeSec = 0;
    // The corner-brazier LightingLayer (world-space) now owns the dungeon firelight in BOTH placement
    // and fight. This separate wall-sconce shader overlay used to fade in at fight start and clashed
    // with the braziers (two different light patterns over the floor), which read as "ugly" the instant
    // the fight began. Disabled so lighting stays consistent across phases; flip to true to bring back
    // a second, floor-only lighting pass.
    private wallSconceOverlayEnabled: boolean = false;
    private dungeonOverlay?: Container;
    private holeContainer: Container;
    private bgSprite?: Sprite;
    /** Authored transparent fire atlases aligned to the background painting in source pixels. */
    private ambientFireLayer?: Container;
    private ambientFireSprites = new Map<string, Sprite>();
    private ambientFireGlowSprites = new Map<string, Sprite>();
    private ambientFireContactGlows = new Map<string, Graphics>();
    private ambientFireFrames = new Map<string, Texture[]>();
    private ambientFireAtlases = new Map<string, Texture>();
    private ambientFireAtlasLoads = new Set<string>();
    private ambientFireEditorOutline?: Graphics;
    /** Static screen-space fire layout is recalculated only after a resize, tuning edit, or decoded atlas. */
    private ambientFireLayoutDirty = true;
    private ambientFireLayoutTunings = new Map<string, AmbientFireTuning>();
    private ambientFireBaseScaleX = new Map<string, number>();
    private ambientFireGlowBaseScaleX = new Map<string, number>();
    private ambientFireEditorSelection?: string;
    private backgroundLayout?: {
        viewportWidth: number;
        viewportHeight: number;
        x: number;
        y: number;
        width: number;
        height: number;
    };
    private lavaColorFilter?: ColorMatrixFilter;
    private lavaFireColorFilter?: ColorMatrixFilter;
    private lavaFire2ColorFilter?: ColorMatrixFilter;
    /** Last material state written to the stable lava meshes; avoids rebuilding matrices every frame. */
    private lavaColorTuningSignature = "";
    /** Editor-only warm spill clipped to the static pit, below fire and grate. */
    private lavaPitLight?: Graphics;
    private lavaPitLightGeometrySignature = "";
    private lavaSplashGraphics?: Graphics;
    private lavaEditorOutline?: Graphics;
    /** Perspective-warped live lava, pinned to the four exact outer seams of its 4x4 footprint. */
    private lavaTerrainMesh?: PerspectiveMesh;
    /** Transparent editor-only fire, sharing the exact static pit corners without replacing its geometry. */
    private lavaFireOverlayMesh?: PerspectiveMesh;
    /** A separately tuned second editor fire, still below the same solid foreground grate. */
    private lavaFireOverlayMeshB?: PerspectiveMesh;
    /** Shared editable clip shape for both fire layers. */
    private lavaFireMask?: Graphics;
    private lavaFireMaskSignature = "";
    /** Guarantees local draw order: both fires first, immutable grate last. */
    private lavaPitForegroundContainer?: Container;
    /** Immutable editor-only grate, always drawn above the low fire ring. */
    private lavaGrateOverlayMesh?: PerspectiveMesh;
    private centerTerrainSprite?: Sprite;
    // Second mountain sprite: BLOCK_CENTER draws two 2x2 mountains flanking a 2x2 corridor (this is the
    // right-hand one; centerTerrainSprite is the left). Hidden for lava/water (single sprite).
    private centerTerrainSpriteB?: Sprite;
    private centerHitBar?: Graphics;
    /** The bar only changes after an obstacle hit; retain the last state to avoid rebuilding it every frame. */
    private lastCenterHitBarKey?: string;
    /** Once the lava/water center dries out it becomes walkable and shows a frozen/dry sprite. */
    private centerDried = false;
    // Last observed per-mountain hit counts. undefined until first sight: a mid-game (re)join or board
    // rebuild seeds silently, so ONLY a live ">0 -> 0" transition plays the collapse — the same
    // silent-seeding pattern effect pops use. Works for sandbox and ranked alike because both funnel
    // obstacle hits through FightProperties, which ensureCenterTerrainSprite reads every frame.
    private lastMountainHits?: { left: number; right: number };
    private activeCollapses: IMountainCollapse[] = [];
    /** Cached 2x2 quarter textures of the mountain sprite, built once per source texture. */
    private mountainQuarterTextures?: { source: Texture; quarters: Texture[] };
    /**
     * The scattered-object art: nine approved Cemetery obstacles in a 3x3 atlas of 256x461 transparent
     * tiles. A roll deals the full nine-variant deck first, then fills the remaining slots with repeats
     * (12 stones over 9 variants: exactly three repeat); transparent padding carries the per-object width,
     * height and base-centre tuning from the local obstacle editor.
     */
    private static readonly MOUNTAIN_TILES_KEY = "cemetery_obstacles_9x_256";
    /** Fight-only atlas with a separately fitted HP insert baked into each of the nine authored barrels. */
    private static readonly MOUNTAIN_TILES_HP_KEY = "cemetery_obstacles_9x_256_hp";
    /** One cell wide; taller than it is wide, and the surplus is the part that overhangs (see below). */
    private static readonly MOUNTAIN_TILE_W = 256;
    private static readonly MOUNTAIN_TILE_H = 461;
    private static readonly MOUNTAIN_TILE_COLS = 3;
    private static readonly MOUNTAIN_TILE_COUNT = 9;
    private mountainTileTextures?: Texture[];
    private mountainHitPointTileTextures?: Texture[];
    /**
     * How tall the rock is drawn, in cells — and it must match the atlas tile's own aspect (256x461), which is
     * where the overhang is baked. Width stays exactly one cell: this is a stretch upward, not a uniform
     * blow-up, because growing both axes fattens the boulder into its neighbours sideways.
     *
     * The surplus is alpha-cut in the artwork so only the ROCK crosses the grid line. Drawn opaque, the
     * tile's square backing went up with it and every mountain read as a tall block sitting in two cells
     * instead of a peak leaning into the one above.
     */
    /** Lift every baked base 20% of its projected cell height above the lower seam. */
    private static readonly MOUNTAIN_VERTICAL_OFFSET_CELLS = 0.2;
    /** One entry per standing mountain: which cell it occupies and which variant it wears. */
    private scatteredMountains: IScatteredMountain[] = [];
    /** Stays true after the final tombstone dies, so the removed classic mountains never become a fallback. */
    private scatteredMountainMode = false;
    private scatteredMountainSprites: Sprite[] = [];
    /** Variant-B soft cast shadows extending downward from each base by roughly a quarter cell. */
    private scatteredMountainShadows: Sprite[] = [];
    /** Red alpha-silhouette rings per stone, exposed only while that stone is targeted. */
    private scatteredMountainOutlines: Container[] = [];
    /** Matching translucent red washes above the authored barrel art, like unit target silhouettes. */
    private scatteredMountainDangerOverlays: Sprite[] = [];
    private tombstoneRedFilter?: ColorMatrixFilter;
    /** Approved dark bronze-brown material grade plus contour correction for the atlas' bright fringe. */
    private cemeteryEdgeDarkenFilter?: Filter;
    private cemeteryShadowBlurFilter?: BlurFilter;
    /** One single-pip HP rail per tombstone: every scattered stone takes exactly one hit. */
    private scatteredMountainHitBars: Graphics[] = [];
    private narrowingLayers = 0;
    /**
     * The molten centre, animated: an 8x8 atlas of 256px frames, 60 of them, a 5s loop at 12fps.
     *
     * The artwork is one 4x4 block of cells. Its original, softly glowing grout stays inside one sprite,
     * while the outer footprint reaches the visible seams of the four-by-four obstacle.
     *
     * The loop is closed with a cross-dissolve rather than a hard cut: measured, the wrap now differs by
     * 0.83/255 against 1.63 for an ordinary frame step, so the repeat is less of a change than the
     * animation's own motion and cannot be spotted.
     */
    private static readonly LAVA_ANIM_KEY = "lava_center_anim_atlas";
    private static readonly LAVA_ANIM_FRAME_PX = 256;
    private static readonly LAVA_ANIM_COLS = 8;
    private static readonly LAVA_ANIM_FRAMES = 60;
    /** Main four-by-four artwork and immutable foreground shared by editor and live game. */
    private static readonly FIRE_PIT_KEY = "fire_pit_center_clean_fire_v2_512";
    private static readonly FIRE_PIT_EDITOR_BOWL_KEY = "fire_pit_center_clean_fire_v2_512";
    private static readonly FIRE_PIT_EDITOR_GRATE_KEY = "fire_pit_grate_foreground_static_v7_512";
    private static readonly FIRE_PIT_ANIM_KEY = "fire_pit_variant_1_low_front_fire_overlay_seamless_v2_64_atlas_half";
    private static readonly FIRE_PIT_EDITOR_ANIM_KEY =
        "fire_pit_variant_1_low_front_fire_overlay_seamless_v2_64_atlas_half";
    /** The overlay displays below 512px, so 256px frames keep detail without a 64 MiB GPU texture. */
    private static readonly FIRE_PIT_ANIM_FRAME_PX = 256;
    private static readonly FIRE_PIT_ANIM_COLS = 8;
    private static readonly FIRE_PIT_ANIM_FRAMES = 64;
    private lavaAnimFrames?: Texture[];
    private firePitOverlayFrames?: Texture[];
    private firePitOverlayAtlas?: Texture;
    private firePitOverlayAtlasKey?: string;
    private firePitOverlayLoadStarted = false;
    public constructor(context: IDungeonVisualsContext) {
        this.context = context;
        this.holeContainer = new Container();
        this.holeContainer.sortableChildren = true;
    }
    public getHoleContainer(): Container {
        return this.holeContainer;
    }
    public clearHoleLayers(): void {
        for (const child of this.holeContainer.removeChildren()) {
            child.destroy({ children: true });
        }
    }
    public updateDungeonAtmosphere(started: boolean, alpha: number): void {
        const stage = this.context.getStage();

        // 1. Hide while disabled (see wallSconceOverlayEnabled) or before the fight starts.
        if (!this.wallSconceOverlayEnabled || !started) {
            if (this.dungeonOverlay) {
                this.dungeonOverlay.visible = false;
            }
            return;
        }

        // 2. Create Container if missing
        if (!this.dungeonOverlay) {
            this.dungeonOverlay = new Container();
            // This floor-lighting overlay's shader is darkest at the board centre, so it MUST render
            // below the world/units (the camera) — otherwise it dims the units placed in the middle
            // of the board. The stage sorts by zIndex (sortableChildren), so pin it under the camera
            // (default zIndex 0) with a negative zIndex rather than a fragile addChildAt index that
            // depends on whether the background/camera were attached first.
            stage.sortableChildren = true;
            this.dungeonOverlay.zIndex = -10;
            stage.addChild(this.dungeonOverlay);
        }

        const overlayContainer = this.dungeonOverlay;
        overlayContainer.visible = true;
        overlayContainer.alpha = alpha;

        // If already populated, just return
        if (overlayContainer.children.length > 0) return;

        const { width: vw, height: vh } = this.context.getViewportSize();
        const size = Math.min(vw, vh);
        const x = vw * 0.5;
        const y = vh * 0.5;
        const halfSize = size / 2;

        // A single board-square quad carries the "wall-sconce" lighting. The dark fill is what the
        // GLSL pass composites over: unlit cells stay dark, warm pools bleed inward from each wall.
        // (Replaces the old stack of concentric circle fills, which read as flat rings.)
        const overlay = new Graphics();
        overlay.rect(x - halfSize, y - halfSize, size, size).fill({ color: 0x000000, alpha: 1 });
        overlayContainer.addChild(overlay);
        this.lightOverlay = overlay;

        if (!this.lightFilter) {
            this.lightFilter = createDungeonLightFilter();
        }
        if (this.lightFilter) {
            overlay.filters = [this.lightFilter];
            updateDungeonLightUniforms(this.lightFilter, this.lightTimeSec, this.lightInward);
        } else {
            // Shader unavailable — keep a plain dark night overlay so the scene still reads as a dungeon.
            overlay.clear();
            overlay.rect(x - halfSize, y - halfSize, size, size).fill({ color: 0x05060c, alpha: 0.5 });
        }
        this.lightBuilt = true;
    }
    public hasAtmosphereLights(): boolean {
        return this.lightBuilt;
    }
    /** Advance the per-sconce flicker by pushing absolute time into the lighting shader. */
    public updateAtmosphereFlicker(nowSec: number): void {
        this.lightTimeSec = nowSec;
        if (this.lightFilter) {
            updateDungeonLightUniforms(this.lightFilter, this.lightTimeSec, this.lightInward);
        }
    }
    /** Pull the sconces toward the centre as the board shrinks (holes eat the perimeter). */
    public moveFiresInward(inwardOffset: number): void {
        // ~one grid cell per hole layer, expressed in board-square uv (16 cells across the square).
        this.lightInward = Math.min(0.42, Math.max(0, inwardOffset) / 16);
        if (this.lightFilter) {
            updateDungeonLightUniforms(this.lightFilter, this.lightTimeSec, this.lightInward);
        }
    }
    public spawnHoleLayer(layerIndex: number): void {
        const gs = this.context.getGridSettings();
        const cellSize = gs.getCellSize();
        const worldMinX = gs.getMinX();
        const worldMaxX = gs.getMaxX();
        const worldMinY = gs.getMinY();
        const worldMaxY = gs.getMaxY();

        const cellCountX = (worldMaxX - worldMinX) / cellSize;
        const cellCountY = (worldMaxY - worldMinY) / cellSize;
        const offset = layerIndex - 1;

        const holeGfx = new Graphics();
        const drawHoleCell = (cellIdxX: number, cellIdxY: number) => {
            holeGfx.poly(projectedCellPoints({ x: cellIdxX, y: cellIdxY }, gs)).fill({ color: 0x000000, alpha: 0.7 });
        };

        // Top
        for (let x = offset; x < cellCountX - offset; x++) drawHoleCell(x, offset);
        // Bottom
        for (let x = offset; x < cellCountX - offset; x++) drawHoleCell(x, cellCountY - layerIndex);
        // Left
        for (let y = offset + 1; y < cellCountY - offset - 1; y++) drawHoleCell(offset, y);
        // Right
        for (let y = offset + 1; y < cellCountY - offset - 1; y++) drawHoleCell(cellCountX - layerIndex, y);

        this.holeContainer.addChild(holeGfx);
    }
    public isCenterDried(): boolean {
        return this.centerDried;
    }
    /** Toggle the dried-out state of the lava/water center and re-render its sprite. */
    public setCenterDried(dried: boolean): void {
        if (this.centerDried === dried) return;
        this.centerDried = dried;
        this.ensureCenterTerrainSprite();
    }
    /**
     * The frame of the molten-centre loop that is due right now, or undefined if the atlas is absent —
     * in which case the caller falls back to the still lava, so a missing asset costs the motion and
     * nothing else.
     *
     * Driven off wall-clock, not the simulation step: the sim advances at a quarter of real time (see
     * PixiGameManager.SIM_STEP), which would run the lava at 3fps.
     */
    private lavaAnimTexture(): Texture | undefined {
        if (!this.lavaAnimFrames) {
            const atlas = this.context.texAny(DungeonVisuals.LAVA_ANIM_KEY);
            if (!atlas) {
                return undefined;
            }
            const side = DungeonVisuals.LAVA_ANIM_FRAME_PX;
            const frames: Texture[] = [];
            for (let i = 0; i < DungeonVisuals.LAVA_ANIM_FRAMES; i++) {
                const col = i % DungeonVisuals.LAVA_ANIM_COLS;
                const row = Math.floor(i / DungeonVisuals.LAVA_ANIM_COLS);
                frames.push(
                    new Texture({
                        source: atlas.source,
                        frame: new Rectangle(col * side, row * side, side, side),
                    }),
                );
            }
            this.lavaAnimFrames = frames;
        }
        const frames = this.lavaAnimFrames;
        const tuning = resolveLavaAnimationTuning();
        const idx = lavaAnimationFrameAtTime(tuning, performance.now() / 1000);
        return frames[idx % frames.length];
    }
    /** Current transparent fire-overlay frame; the editor can audition an isolated atlas safely. */
    private firePitOverlayTexture(secondary = false): Texture | undefined {
        const requestedAtlasKey = isLavaAnimationEditorActive()
            ? DungeonVisuals.FIRE_PIT_EDITOR_ANIM_KEY
            : DungeonVisuals.FIRE_PIT_ANIM_KEY;
        if (this.firePitOverlayAtlasKey !== requestedAtlasKey) {
            for (const texture of this.firePitOverlayFrames ?? []) texture.destroy(false);
            this.firePitOverlayFrames = undefined;
            this.firePitOverlayAtlas = undefined;
            this.firePitOverlayLoadStarted = false;
            this.firePitOverlayAtlasKey = requestedAtlasKey;
        }
        if (!this.firePitOverlayFrames) {
            const atlasUrl = (images as Readonly<Record<string, string | undefined>>)[requestedAtlasKey];
            const atlas = this.firePitOverlayAtlas;
            if (!atlas) {
                // Keep the large atlas out of the blocking core bundle. Load it in the background when a live
                // lava board asks for it; until then the complete still pit remains visible as a safe fallback.
                if (!this.firePitOverlayLoadStarted && atlasUrl) {
                    this.firePitOverlayLoadStarted = true;
                    void Assets.load<Texture>(atlasUrl)
                        .then((loaded) => {
                            if (this.firePitOverlayAtlasKey === requestedAtlasKey) {
                                this.firePitOverlayAtlas = loaded;
                            }
                        })
                        .catch(() => {
                            this.firePitOverlayLoadStarted = false;
                        });
                }
                return undefined;
            }
            const side = DungeonVisuals.FIRE_PIT_ANIM_FRAME_PX;
            const frames: Texture[] = [];
            for (let index = 0; index < DungeonVisuals.FIRE_PIT_ANIM_FRAMES; index++) {
                frames.push(
                    new Texture({
                        source: atlas.source,
                        frame: new Rectangle(
                            (index % DungeonVisuals.FIRE_PIT_ANIM_COLS) * side,
                            Math.floor(index / DungeonVisuals.FIRE_PIT_ANIM_COLS) * side,
                            side,
                            side,
                        ),
                    }),
                );
            }
            this.firePitOverlayFrames = frames;
        }
        const tuning = resolveLavaAnimationTuning();
        const speed = secondary ? tuning.fire2Speed : 1;
        const frameOffset = secondary ? tuning.fire2FrameOffset : 0;
        const rawFrame = lavaAnimationFrameAtTime(tuning, (performance.now() / 1000) * speed);
        return this.firePitOverlayFrames[(rawFrame + frameOffset) % DungeonVisuals.FIRE_PIT_ANIM_FRAMES];
    }
    private applyLavaColorTuning(tuning: LavaAnimationTuning | undefined): void {
        const baseTargets = [this.centerTerrainSprite, this.lavaTerrainMesh, this.lavaGrateOverlayMesh].filter(
            (target): target is Sprite | PerspectiveMesh => !!target,
        );
        const fireTarget = this.lavaFireOverlayMesh;
        const fire2Target = this.lavaFireOverlayMeshB;
        if (!baseTargets.length && !fireTarget && !fire2Target) return;
        const targetShape = `${this.centerTerrainSprite ? 1 : 0}:${this.lavaTerrainMesh ? 1 : 0}:${this.lavaGrateOverlayMesh ? 1 : 0}:${fireTarget ? 1 : 0}:${fire2Target ? 1 : 0}`;
        const signature = tuning
            ? [
                  targetShape,
                  tuning.alpha,
                  tuning.brightness,
                  tuning.saturation,
                  tuning.contrast,
                  tuning.fireAlpha,
                  tuning.fireBrightness,
                  tuning.fireSaturation,
                  tuning.fireContrast,
                  tuning.fire2Alpha,
                  tuning.fire2Brightness,
                  tuning.fire2Saturation,
                  tuning.fire2Contrast,
              ].join(":")
            : `${targetShape}:off`;
        if (signature === this.lavaColorTuningSignature) return;
        this.lavaColorTuningSignature = signature;
        if (!tuning) {
            for (const target of [...baseTargets, fireTarget, fire2Target].filter(
                (candidate): candidate is Sprite | PerspectiveMesh => !!candidate,
            )) {
                target.alpha = 1;
                target.filters = [];
            }
            return;
        }
        if (!this.lavaColorFilter) {
            this.lavaColorFilter = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
        }
        if (!this.lavaFireColorFilter) {
            this.lavaFireColorFilter = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
        }
        if (!this.lavaFire2ColorFilter) {
            this.lavaFire2ColorFilter = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
        }
        this.lavaColorFilter.matrix = DungeonVisuals.lavaColorMatrix(
            tuning.brightness,
            tuning.saturation,
            tuning.contrast,
        );
        this.lavaFireColorFilter.matrix = DungeonVisuals.lavaColorMatrix(
            tuning.fireBrightness,
            tuning.fireSaturation,
            tuning.fireContrast,
        );
        this.lavaFire2ColorFilter.matrix = DungeonVisuals.lavaColorMatrix(
            tuning.fire2Brightness,
            tuning.fire2Saturation,
            tuning.fire2Contrast,
        );
        for (const target of baseTargets) {
            target.alpha = tuning.alpha;
            target.filters = [this.lavaColorFilter];
        }
        if (fireTarget) {
            fireTarget.alpha = Math.min(1, tuning.fireAlpha);
            fireTarget.filters = [this.lavaFireColorFilter];
        }
        if (fire2Target) {
            fire2Target.alpha = Math.min(1, tuning.fire2Alpha);
            fire2Target.filters = [this.lavaFire2ColorFilter];
        }
    }
    private static lavaColorMatrix(brightness: number, saturation: number, contrast: number): ColorMatrix {
        const inverseSaturation = 1 - saturation;
        const red = 0.2126 * inverseSaturation;
        const green = 0.7152 * inverseSaturation;
        const blue = 0.0722 * inverseSaturation;
        const scale = contrast * brightness;
        const offset = (0.5 - contrast * 0.5) * brightness;
        return [
            (red + saturation) * scale,
            green * scale,
            blue * scale,
            0,
            offset,
            red * scale,
            (green + saturation) * scale,
            blue * scale,
            0,
            offset,
            red * scale,
            green * scale,
            (blue + saturation) * scale,
            0,
            offset,
            0,
            0,
            0,
            1,
            0,
        ];
    }
    private updateLavaFireMask(
        tuning: LavaAnimationTuning,
        gs: GridSettings,
        logicalTarget: { x: number; y: number },
        cellSize: number,
    ): void {
        if (!this.lavaFireMask) {
            this.lavaFireMask = new Graphics();
            this.lavaFireMask.eventMode = "none";
        }
        if (this.lavaPitForegroundContainer && this.lavaFireMask.parent !== this.lavaPitForegroundContainer) {
            this.lavaPitForegroundContainer.addChild(this.lavaFireMask);
        }
        this.lavaFireMask.zIndex = 0;
        this.lavaFireMask.visible = true;
        const signature = [
            logicalTarget.x,
            logicalTarget.y,
            cellSize,
            tuning.fireMaskShape,
            tuning.fireMaskWidthCells,
            tuning.fireMaskHeightCells,
            tuning.fireMaskShiftXCells,
            tuning.fireMaskShiftYCells,
            tuning.fireMaskRotationDeg,
        ].join(":");
        if (signature === this.lavaFireMaskSignature) return;
        this.lavaFireMaskSignature = signature;

        const center = {
            x: logicalTarget.x + tuning.fireMaskShiftXCells * cellSize,
            y: logicalTarget.y + tuning.fireMaskShiftYCells * cellSize,
        };
        const halfWidth = tuning.fireMaskWidthCells * cellSize * 0.5;
        const halfHeight = tuning.fireMaskHeightCells * cellSize * 0.5;
        const rotation = (tuning.fireMaskRotationDeg * Math.PI) / 180;
        const cosine = Math.cos(rotation);
        const sine = Math.sin(rotation);
        const localPoints: Array<{ x: number; y: number }> = [];

        if (tuning.fireMaskShape === "ellipse") {
            for (let index = 0; index < 48; index++) {
                const angle = (index / 48) * Math.PI * 2;
                localPoints.push({ x: Math.cos(angle) * halfWidth, y: Math.sin(angle) * halfHeight });
            }
        } else if (tuning.fireMaskShape === "triangle") {
            localPoints.push(
                { x: 0, y: halfHeight },
                { x: halfWidth, y: -halfHeight },
                { x: -halfWidth, y: -halfHeight },
            );
        } else {
            localPoints.push(
                { x: -halfWidth, y: halfHeight },
                { x: halfWidth, y: halfHeight },
                { x: halfWidth, y: -halfHeight },
                { x: -halfWidth, y: -halfHeight },
            );
        }

        const projected = localPoints.map((point) =>
            projectBattlefieldPoint(
                {
                    x: center.x + point.x * cosine - point.y * sine,
                    y: center.y + point.x * sine + point.y * cosine,
                },
                gs,
            ),
        );
        this.lavaFireMask
            .clear()
            .poly(projected.flatMap((point) => [point.x, point.y]))
            .fill({ color: 0xffffff });
    }
    private static mixColor(from: number, to: number, amount: number): number {
        const mix = (shift: number): number => {
            const a = (from >> shift) & 0xff;
            const b = (to >> shift) & 0xff;
            return Math.round(a + (b - a) * amount);
        };
        return (mix(16) << 16) | (mix(8) << 8) | mix(0);
    }
    private updateLavaPitLight(
        tuning: LavaAnimationTuning | undefined,
        corners: ReadonlyArray<{ x: number; y: number }>,
        fireCenter: { x: number; y: number },
    ): void {
        if (!tuning && !this.lavaPitLight) return;
        if (!this.lavaPitLight) {
            const light = new Graphics();
            light.eventMode = "none";
            light.blendMode = "add";
            this.context.attachToWorldRoot(light, 50.5);
            this.lavaPitLight = light;
        }
        const light = this.lavaPitLight;
        const intensity = tuning ? lavaPitLightIntensityAtTime(tuning, performance.now() / 1000) : 0;
        light.visible = !!tuning && intensity > 0;
        if (!tuning || !light.visible || corners.length !== 4) return;
        // The pulse changes only opacity. Keep the ten polygon meshes intact until their actual geometry
        // or warmth changes instead of clearing and tessellating all of them on every animation frame.
        light.alpha = Math.min(1, intensity / 2);
        const geometrySignature = [
            fireCenter.x,
            fireCenter.y,
            tuning.pitLightRadius,
            tuning.pitLightWarmth,
            ...corners.flatMap((corner) => [corner.x, corner.y]),
        ].join(":");
        if (geometrySignature === this.lavaPitLightGeometrySignature) return;
        this.lavaPitLightGeometrySignature = geometrySignature;
        light.clear();

        const layers = 10;
        const outerColor = DungeonVisuals.mixColor(0xff2c00, 0xff7418, tuning.pitLightWarmth);
        const innerColor = DungeonVisuals.mixColor(0xff6500, 0xffd36b, tuning.pitLightWarmth);
        for (let layerIndex = 0; layerIndex < layers; layerIndex++) {
            const depth = layerIndex / (layers - 1);
            const scale = tuning.pitLightRadius * (1 - depth * 0.82);
            const polygon = corners.flatMap((corner) => [
                fireCenter.x + (corner.x - fireCenter.x) * scale,
                fireCenter.y + (corner.y - fireCenter.y) * scale,
            ]);
            light.poly(polygon).fill({
                color: DungeonVisuals.mixColor(outerColor, innerColor, depth),
                // Root alpha carries intensity (0..2 mapped onto 0..1), preserving the previous product.
                alpha: 2 * (0.012 + depth * 0.006),
            });
        }
    }
    private static hash01(value: number): number {
        const hashed = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
        return hashed - Math.floor(hashed);
    }
    private updateLavaSplashEffects(
        tuning: LavaAnimationTuning | undefined,
        centerX: number,
        centerY: number,
        width: number,
        height: number,
    ): void {
        if (!this.lavaSplashGraphics) {
            const graphics = new Graphics();
            graphics.eventMode = "none";
            graphics.blendMode = "add";
            this.context.attachToWorldRoot(graphics, 54);
            this.lavaSplashGraphics = graphics;
        }
        const graphics = this.lavaSplashGraphics;
        graphics.clear();
        graphics.visible = !!tuning?.splashesEnabled && !!tuning.splashRate && !!tuning.splashCount;
        if (!tuning || !graphics.visible) return;

        const rawTime = tuning.paused ? tuning.scrubFrame / Math.max(0.25, tuning.fps) : performance.now() / 1000;
        const time = tuning.reverse ? -rawTime : rawTime;
        const period = 1 / Math.max(0.01, tuning.splashRate);
        const currentEvent = Math.floor(time / period);
        const cellWidth = width / Math.max(0.5, tuning.widthCells);
        const cellHeight = height / Math.max(0.5, tuning.heightCells);
        const baseRadius = Math.min(cellWidth, cellHeight) * tuning.splashSizeCells;

        for (let eventIndex = currentEvent - 2; eventIndex <= currentEvent; eventIndex++) {
            const age = time - eventIndex * period;
            const lifetime = 0.62 + tuning.splashHeightCells * 0.26;
            if (age < 0 || age > lifetime) continue;
            const progress = age / lifetime;
            const origin = lavaSplashOriginWithinGrateOpening(
                centerX,
                centerY,
                width,
                height,
                DungeonVisuals.hash01(eventIndex * 7.73 + 0.9),
                DungeonVisuals.hash01(eventIndex * 3.17),
                DungeonVisuals.hash01(eventIndex * 5.31 + 2.4),
            );
            const originX = origin.x;
            const originY = origin.y;
            const envelope = Math.sin(Math.PI * progress);

            for (let drop = 0; drop < tuning.splashCount; drop++) {
                const seed = eventIndex * 97.13 + drop * 17.71;
                const delay = DungeonVisuals.hash01(seed + 0.3) * 0.2;
                const dropProgress = (progress - delay) / Math.max(0.05, 1 - delay);
                if (dropProgress < 0 || dropProgress > 1) continue;
                const spread = (DungeonVisuals.hash01(seed + 1.7) - 0.5) * cellWidth * tuning.splashSpreadCells * 2;
                const heightScale = 0.62 + DungeonVisuals.hash01(seed + 4.9) * 0.55;
                const rise =
                    4 * tuning.splashHeightCells * cellHeight * heightScale * dropProgress * (1 - dropProgress);
                const x = originX + spread * dropProgress;
                const y = originY + rise - cellHeight * 0.025 * dropProgress;
                const radius = baseRadius * (0.66 + DungeonVisuals.hash01(seed + 8.1) * 0.8);
                const alpha = Math.max(0, Math.min(1, Math.sin(Math.PI * dropProgress))) * envelope;
                // One compact shape per drop. The previous launch ring and enlarged glow disc produced the
                // yellow ovals visible between the bars; glow now only grades the droplet itself.
                const glowAmount = Math.max(0, Math.min(1, tuning.splashGlow / 3));
                graphics.circle(x, y, radius).fill({
                    color: DungeonVisuals.mixColor(0xff9d22, 0xffffcf, glowAmount),
                    alpha: alpha * (0.84 + glowAmount * 0.12),
                });
            }
        }
    }
    private updateLavaEditorOutline(
        tuning: LavaAnimationTuning | undefined,
        centerX: number,
        centerY: number,
        width: number,
        height: number,
    ): void {
        const shouldShow = !!tuning && isLavaAnimationEditorActive();
        if (!shouldShow) {
            if (this.lavaEditorOutline?.visible) {
                this.lavaEditorOutline.clear();
                this.lavaEditorOutline.visible = false;
            }
            return;
        }
        if (!this.lavaEditorOutline) {
            const outline = new Graphics();
            outline.eventMode = "none";
            this.context.attachToWorldRoot(outline, 57);
            this.lavaEditorOutline = outline;
        }
        const outline = this.lavaEditorOutline;
        outline.clear();
        outline.visible = true;
        const left = centerX - width * 0.5;
        const bottom = centerY - height * 0.5;
        const handleRadius = Math.max(3, Math.min(width, height) * 0.012);
        outline
            .rect(left, bottom, width, height)
            .fill({ color: 0xff8a1f, alpha: 0.035 })
            .stroke({ color: 0xffbf55, alpha: 0.95, width: 1.5 });
        for (const [x, y] of [
            [left, bottom],
            [left + width, bottom],
            [left, bottom + height],
            [left + width, bottom + height],
        ] as const) {
            outline
                .circle(x, y, handleRadius)
                .fill({ color: 0xffd46d, alpha: 0.95 })
                .stroke({ color: 0x2b0d02, alpha: 0.95, width: 1 });
        }
    }
    /** Slice the normal or fight atlas once; undefined until that texture has loaded. */
    private mountainTiles(withIntegratedHitPoints = false): Texture[] | undefined {
        const cached = withIntegratedHitPoints ? this.mountainHitPointTileTextures : this.mountainTileTextures;
        if (!cached) {
            const atlas = this.context.texAny(
                withIntegratedHitPoints ? DungeonVisuals.MOUNTAIN_TILES_HP_KEY : DungeonVisuals.MOUNTAIN_TILES_KEY,
            );
            if (!atlas) {
                return undefined;
            }
            // The source art is intentionally much larger than a board cell. Linear mip sampling keeps
            // its fine stonework stable while the responsive board scales; without it, nearby texels
            // alternately win from frame to frame and read as a moving highlight on a static tombstone.
            atlas.source.autoGenerateMipmaps = true;
            atlas.source.scaleMode = "linear";
            const tileW = DungeonVisuals.MOUNTAIN_TILE_W;
            const tileH = DungeonVisuals.MOUNTAIN_TILE_H;
            const frames: Texture[] = [];
            for (let i = 0; i < DungeonVisuals.MOUNTAIN_TILE_COUNT; i++) {
                const col = i % DungeonVisuals.MOUNTAIN_TILE_COLS;
                const row = Math.floor(i / DungeonVisuals.MOUNTAIN_TILE_COLS);
                frames.push(
                    new Texture({
                        source: atlas.source,
                        frame: new Rectangle(col * tileW, row * tileH, tileW, tileH),
                    }),
                );
            }
            if (withIntegratedHitPoints) {
                this.mountainHitPointTileTextures = frames;
            } else {
                this.mountainTileTextures = frames;
            }
        }
        return withIntegratedHitPoints ? this.mountainHitPointTileTextures : this.mountainTileTextures;
    }
    /**
     * Install the scattered-mountain layout to draw. Pass an empty array to go back to the classic pair.
     *
     * Sprites are rebuilt from scratch rather than diffed: this runs when the board type is picked or a
     * mountain is destroyed, never per frame, and a dozen sprites are far cheaper to recreate than to
     * reconcile.
     */
    public setScatteredMountains(mountains: IScatteredMountain[], scatteredMode?: boolean): void {
        // scatteredMode override: a ranked game whose EVERY stone is already destroyed reinstalls an empty
        // list on rehydrate, but the board is still a scattered one — without the override an empty install
        // would flip the mode off and the classic mountain pair would ghost back in (see the
        // BLOCK_CENTER fallback in ensureCenterTerrainSprite).
        this.scatteredMountainMode = scatteredMode ?? mountains.length > 0;
        this.scatteredMountains = mountains.map((m) => ({ ...m }));
        this.rebuildScatteredMountainSprites();
    }
    public setNarrowingLayers(layers: number): void {
        this.narrowingLayers = Math.max(0, layers);
        this.syncScatteredMountainVisibility();
    }
    public highlightScatteredMountains(positions: readonly HoCMath.XY[]): void {
        const gs = this.context.getGridSettings();
        const targets = new Set(
            positions.map((position) => {
                const cell = GridMath.getCellForPosition(gs, position);
                return cell ? `${cell.x}:${cell.y}` : "";
            }),
        );
        this.scatteredMountainOutlines.forEach((outline, index) => {
            const mountain = this.scatteredMountains[index];
            const highlighted =
                !!mountain && this.isScatteredMountainActive(mountain) && targets.has(`${mountain.x}:${mountain.y}`);
            outline.visible = highlighted;
            if (this.scatteredMountainDangerOverlays[index]) {
                this.scatteredMountainDangerOverlays[index].visible = highlighted;
            }
        });
    }
    public clearScatteredMountainHighlight(): void {
        for (const outline of this.scatteredMountainOutlines) outline.visible = false;
        for (const overlay of this.scatteredMountainDangerOverlays) overlay.visible = false;
    }
    /** Remove one destroyed stone while retaining every survivor's assigned art variant. */
    public removeScatteredMountainAt(x: number, y: number): void {
        const destroyed = this.scatteredMountains.find((mountain) => mountain.x === x && mountain.y === y);
        if (destroyed) {
            this.spawnScatteredMountainCollapse(destroyed);
        }
        const next = this.scatteredMountains.filter((mountain) => mountain.x !== x || mountain.y !== y);
        if (next.length === this.scatteredMountains.length) {
            return;
        }
        this.scatteredMountains = next;
        this.rebuildScatteredMountainSprites();
    }
    /**
     * (Re)create one sprite per scattered mountain from the current layout.
     *
     * Separate from setScatteredMountains because the atlas may not have loaded when the layout arrives —
     * the scene rolls the rock in its constructor, well before the texture bundles are in. That used to
     * leave the layout stored but zero sprites drawn, and since a non-empty layout also suppresses the
     * classic mountain pair (see ensureCenterTerrainSprite), the board came up completely bare. So the
     * per-frame terrain update retries this until the atlas answers.
     */
    private rebuildScatteredMountainSprites(): void {
        for (const sprite of this.scatteredMountainSprites) {
            sprite.destroy();
        }
        for (const outline of this.scatteredMountainOutlines) {
            outline.destroy({ children: true });
        }
        for (const overlay of this.scatteredMountainDangerOverlays) {
            overlay.destroy();
        }
        for (const hitBar of this.scatteredMountainHitBars) {
            hitBar.destroy();
        }
        for (const shadow of this.scatteredMountainShadows) {
            shadow.destroy();
        }
        this.scatteredMountainSprites = [];
        this.scatteredMountainOutlines = [];
        this.scatteredMountainDangerOverlays = [];
        this.scatteredMountainHitBars = [];
        this.scatteredMountainShadows = [];
        const tiles = this.mountainTiles();
        const fightTiles = this.mountainTiles(true);
        if (!tiles?.length || !fightTiles?.length || !this.scatteredMountains.length) {
            return;
        }
        const fightStarted = FightStateManager.getInstance().getFightProperties().hasFightStarted();
        const gs = this.context.getGridSettings();
        if (!this.tombstoneRedFilter) {
            this.tombstoneRedFilter = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
            // Replace RGB with vivid red while preserving the texture's alpha exactly, producing a clean
            // silhouette around the selected barrel rather than tinting its interior.
            this.tombstoneRedFilter.matrix = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0.06, 0, 0, 0, 0, 0.025, 0, 0, 0, 1, 0];
        }
        if (!this.cemeteryShadowBlurFilter) {
            this.cemeteryShadowBlurFilter = new BlurFilter({
                strength: 3.75,
                quality: 2,
                resolution: "inherit",
            });
        }
        if (!this.cemeteryEdgeDarkenFilter) {
            this.cemeteryEdgeDarkenFilter = createCemeteryEdgeDarkenFilter();
        }
        this.cemeteryShadowBlurFilter.strength = 3.75;
        this.cemeteryShadowBlurFilter.padding = 8.5;
        for (const mountain of this.scatteredMountains) {
            const tileIndex = ((mountain.variant % tiles.length) + tiles.length) % tiles.length;
            const tex = tiles[tileIndex];
            const at = GridMath.getPositionForCell(
                { x: mountain.x, y: mountain.y },
                gs.getMinX(),
                gs.getStep(),
                gs.getHalfStep(),
            );
            const metrics = projectedBattlefieldMetricsAtPoint(at, gs);
            const localCellSize = metrics.cellSize;
            // The editor's baseWidth and baseHeight are both 125px, matching the bottom-row cell width.
            // Preserve that authored coordinate system: width stays at 88%, while the editor's 92% height
            // is scaled to 178.5% after the latest reduction. Projected height locates the lifted base.
            const geometry = cemeteryObstacleFrameGeometry(metrics.width, metrics.height, mountain.y);
            const rowScale = geometry.scale;
            const drawnHeight = geometry.frameHeight;
            const riseUp = geometry.rise + metrics.height * DungeonVisuals.MOUNTAIN_VERTICAL_OFFSET_CELLS;

            const sprite = new Sprite(fightStarted ? fightTiles[tileIndex] : tex);
            sprite.anchor.set(0.5);
            // Do not snap a scaled high-resolution texture to whole screen pixels: the world root already
            // provides a stable transform, while per-sprite snapping makes the detail visibly shimmer.
            sprite.roundPixels = false;
            sprite.x = metrics.center.x;
            // World Y grows upward (the world root carries the flip), so adding lifts the rock on screen.
            sprite.y = metrics.center.y + riseUp;
            // Both axes taper linearly to 90% on the top row. The selected barrel treatment is additionally
            // narrowed by 5%, while its approved vertical size remains unchanged. Y is negative because the
            // world root is y-flipped.
            const spriteScale = cemeteryObstacleSpriteScale(
                metrics.width,
                tex.width,
                drawnHeight,
                tex.height,
                rowScale,
            );
            sprite.scale.set(spriteScale.x, spriteScale.y);
            if (this.cemeteryEdgeDarkenFilter) sprite.filters = [this.cemeteryEdgeDarkenFilter];
            const baseY = sprite.y - drawnHeight * 0.5;
            const depth = cemeteryObstacleDepthFromBaseY(baseY);

            const shadow = new Sprite(tex);
            // Anchor the baked bottom edge at the barrel base. Positive local Y scale combined with the
            // world root's vertical flip projects the silhouette downward on screen instead of upward.
            shadow.anchor.set(0.5, 1);
            shadow.roundPixels = false;
            shadow.tint = 0x030201;
            const shadowStyle = cemeteryObstacleShadowStyle(mountain.x, mountain.y);
            shadow.alpha = shadowStyle.alpha;
            // Tuck the cast slightly under the barrel so texture-edge antialiasing cannot leave a visible gap.
            shadow.position.set(sprite.x, baseY + metrics.height * 0.04);
            shadow.scale.set(
                sprite.scale.x * shadowStyle.widthMultiplier,
                cemeteryObstacleShadowScaleY(metrics.height) * shadowStyle.lengthMultiplier,
            );
            shadow.filters = [this.cemeteryShadowBlurFilter];
            attachCemeteryObstacleToDepthRoot(this.context, shadow, depth - 0.002);
            this.scatteredMountainShadows.push(shadow);

            attachCemeteryObstacleToDepthRoot(this.context, sprite, depth);
            this.scatteredMountainSprites.push(sprite);

            // Creatures turn into a translucent red authored silhouette when they are valid targets.
            // Repeat that visual language on barrels: the exact same atlas tile, transform and alpha edge
            // sit above the brown art while the stronger offset copies below supply the crisp contour.
            const dangerOverlay = new Sprite(tex);
            dangerOverlay.anchor.copyFrom(sprite.anchor);
            dangerOverlay.roundPixels = false;
            dangerOverlay.position.copyFrom(sprite.position);
            dangerOverlay.scale.copyFrom(sprite.scale);
            dangerOverlay.filters = [this.tombstoneRedFilter];
            dangerOverlay.alpha = 0.15;
            dangerOverlay.visible = false;
            attachCemeteryObstacleToDepthRoot(this.context, dangerOverlay, depth + 0.001);
            this.scatteredMountainDangerOverlays.push(dangerOverlay);

            // Offset copies of the texture's own alpha silhouette leave only a thin rim visible behind
            // the opaque original. This follows every chipped/leaning edge in the atlas instead of drawing
            // a square around the occupied cell.
            const outline = new Container();
            const directions = [
                [-1, -1],
                [0, -1],
                [1, -1],
                [-1, 0],
                [1, 0],
                [-1, 1],
                [0, 1],
                [1, 1],
            ] as const;
            // A broad, faint silhouette supplies the glow; a second tighter ring supplies the crisp
            // selection line. The original opaque sprite is rendered immediately above both layers and
            // hides their interiors, leaving only the texture's real alpha contour visible.
            for (const { offset, alpha } of [
                { offset: Math.max(1.5, localCellSize * 0.024), alpha: 0.035 },
                { offset: Math.max(0.35, localCellSize * 0.004), alpha: 0.28 },
            ]) {
                for (const [dx, dy] of directions) {
                    const edge = new Sprite(tex);
                    edge.anchor.set(0.5);
                    edge.roundPixels = false;
                    edge.position.set(sprite.x + dx * offset, sprite.y + dy * offset);
                    edge.scale.copyFrom(sprite.scale);
                    edge.filters = this.tombstoneRedFilter;
                    edge.alpha = alpha;
                    outline.addChild(edge);
                }
            }
            outline.visible = false;
            attachCemeteryObstacleToDepthRoot(this.context, outline, depth - 0.001);
            this.scatteredMountainOutlines.push(outline);
        }
        this.syncScatteredMountainVisibility();
    }
    private isScatteredMountainActive(mountain: IScatteredMountain): boolean {
        const size = this.context.getGridSettings().getGridSize();
        return (
            mountain.x >= this.narrowingLayers &&
            mountain.y >= this.narrowingLayers &&
            mountain.x < size - this.narrowingLayers &&
            mountain.y < size - this.narrowingLayers
        );
    }
    private syncScatteredMountainTextures(fightStarted: boolean): void {
        const tiles = this.mountainTiles(fightStarted);
        if (!tiles?.length) return;
        this.scatteredMountains.forEach((mountain, index) => {
            const sprite = this.scatteredMountainSprites[index];
            if (!sprite) return;
            const tileIndex = ((mountain.variant % tiles.length) + tiles.length) % tiles.length;
            const target = tiles[tileIndex];
            if (sprite.texture !== target) sprite.texture = target;
        });
    }
    private syncScatteredMountainVisibility(): void {
        const fightStarted = FightStateManager.getInstance().getFightProperties().hasFightStarted();
        this.syncScatteredMountainTextures(fightStarted);
        this.scatteredMountains.forEach((mountain, index) => {
            const visible = this.isScatteredMountainActive(mountain);
            if (this.scatteredMountainSprites[index]) this.scatteredMountainSprites[index].visible = visible;
            if (this.scatteredMountainShadows[index]) this.scatteredMountainShadows[index].visible = visible;
            if (!visible && this.scatteredMountainOutlines[index]) {
                this.scatteredMountainOutlines[index].visible = false;
            }
            if (!visible && this.scatteredMountainDangerOverlays[index]) {
                this.scatteredMountainDangerOverlays[index].visible = false;
            }
        });
    }
    public hasScatteredMountains(): boolean {
        return this.scatteredMountainMode;
    }
    public ensureCenterTerrainSprite(): void {
        // A layout that arrived before its atlas did has no sprites yet — build them the first frame the
        // texture is available. Once they exist this costs one length comparison; mountainTiles() returns
        // undefined and this returns straight back out while the atlas is still loading.
        if (this.scatteredMountains.length && !this.scatteredMountainSprites.length) {
            this.rebuildScatteredMountainSprites();
        }
        // Keep the source artwork ungraded; Cemetery barrels only receive their separate editor-style shadow.
        this.scatteredMountainSprites.forEach((sprite) => {
            sprite.tint = 0xffffff;
            sprite.filters = null;
        });
        this.syncScatteredMountainTextures(FightStateManager.getInstance().getFightProperties().hasFightStarted());
        const gridType = FightStateManager.getInstance().getFightProperties().getGridType();
        const lavaTuning =
            gridType === GridVals.LAVA_CENTER && !this.centerDried ? resolveLavaAnimationTuning() : undefined;
        if (!lavaTuning) {
            if (this.lavaPitLight) this.lavaPitLight.visible = false;
            if (this.lavaSplashGraphics) this.lavaSplashGraphics.visible = false;
            if (this.lavaEditorOutline) this.lavaEditorOutline.visible = false;
            if (this.lavaTerrainMesh) this.lavaTerrainMesh.visible = false;
            if (this.lavaFireOverlayMesh) this.lavaFireOverlayMesh.visible = false;
            if (this.lavaFireOverlayMeshB) this.lavaFireOverlayMeshB.visible = false;
            if (this.lavaFireMask) this.lavaFireMask.visible = false;
            if (this.lavaGrateOverlayMesh) this.lavaGrateOverlayMesh.visible = false;
        }
        // Runs BEFORE the both-mountains-destroyed early return below — the collapse of the final
        // mountain must still be detected and stepped after its sprite is hidden.
        if (gridType === GridVals.BLOCK_CENTER && !this.scatteredMountainMode) {
            this.detectMountainCollapses();
        }
        this.stepMountainCollapses();
        let texKey: string | undefined;
        // Default the second mountain sprite off; only the BLOCK_CENTER branch below shows it.
        if (this.centerTerrainSpriteB) this.centerTerrainSpriteB.visible = false;

        switch (gridType) {
            case GridVals.WATER_CENTER:
                texKey = this.centerDried ? "water_dry_256" : "water_256";
                break;
            case GridVals.LAVA_CENTER:
                // Still art is the fallback only; the live pool is the animated atlas resolved below. The
                // common stone floor is shared with every other map, so this sprite is the only lava art.
                texKey = this.centerDried ? "lava_frozen_256" : "lava_256";
                break;
            case GridVals.BLOCK_CENTER:
                // Tombstones fully replace the old central mountain pair. In particular, an empty survivor
                // list means every tombstone was destroyed — it must leave an empty board, not resurrect the
                // retired mountain art as a non-interactive fallback.
                texKey = undefined;
                break;
            default:
                texKey = undefined;
                break;
        }

        if (!texKey) {
            if (this.centerTerrainSprite) this.centerTerrainSprite.visible = false;
            this.applyLavaColorTuning(undefined);
            this.clearCenterHitBars();
            return;
        }

        // Both mountains destroyed — hide both sprites + hit bars.
        if (
            gridType === GridVals.BLOCK_CENTER &&
            FightStateManager.getInstance().getFightProperties().getObstacleHitsLeft() <= 0
        ) {
            if (this.centerTerrainSprite) this.centerTerrainSprite.visible = false;
            if (this.centerTerrainSpriteB) this.centerTerrainSpriteB.visible = false;
            this.clearCenterHitBars();
            return;
        }

        // The rectified recessed grate is always the immutable LAVA_CENTER terrain. The transparent fire
        // atlas is drawn as a second mesh on the same four corners in both the game and the editor, so no
        // generated frame can move the rim, masonry, grate, or the 4x4 footprint.
        const liveLava = gridType === GridVals.LAVA_CENTER && !this.centerDried;
        const loadedFireOverlay = liveLava ? this.firePitOverlayTexture() : undefined;
        const loadedFireOverlayB = liveLava && lavaTuning?.fire2Enabled ? this.firePitOverlayTexture(true) : undefined;
        const loadedGrateOverlay = liveLava ? this.context.texAny(DungeonVisuals.FIRE_PIT_EDITOR_GRATE_KEY) : undefined;
        const layeredPitReady = !!loadedFireOverlay && !!loadedGrateOverlay;
        const firePitStill = this.context.texAny(
            layeredPitReady ? DungeonVisuals.FIRE_PIT_EDITOR_BOWL_KEY : DungeonVisuals.FIRE_PIT_KEY,
        );
        const animated = liveLava ? (firePitStill ?? this.lavaAnimTexture()) : undefined;
        const tex = animated ?? this.context.texAny(texKey);
        if (!tex) {
            if (this.centerTerrainSprite) this.centerTerrainSprite.visible = false;
            return;
        }

        const gs = this.context.getGridSettings();
        const logicalCenter = {
            x: (gs.getMinX() + gs.getMaxX()) * 0.5,
            y: (gs.getMinY() + gs.getMaxY()) * 0.5,
        };

        if (!this.centerTerrainSprite) {
            this.centerTerrainSprite = new Sprite(tex);
            this.centerTerrainSprite.anchor.set(0.5);
            this.context.attachToWorldRoot(this.centerTerrainSprite, 50);
            this.centerTerrainSprite.scale.y = -1;
        } else {
            if (this.centerTerrainSprite.texture !== tex) {
                this.centerTerrainSprite.texture = tex;
            }
            this.context.attachToWorldRoot(this.centerTerrainSprite, 50);
        }

        const cellSize = gs.getCellSize();
        const texW = tex.width || 1;
        const texH = tex.height || 1;
        const fireOverlay = layeredPitReady ? loadedFireOverlay : undefined;
        const fireOverlayB = layeredPitReady ? loadedFireOverlayB : undefined;
        const grateOverlay = layeredPitReady ? loadedGrateOverlay : undefined;

        if (liveLava) {
            if (!this.lavaPitForegroundContainer) {
                this.lavaPitForegroundContainer = new Container();
                this.lavaPitForegroundContainer.sortableChildren = true;
                this.lavaPitForegroundContainer.eventMode = "none";
            }
            this.context.attachToWorldRoot(this.lavaPitForegroundContainer, 51);
            if (!this.lavaTerrainMesh) {
                this.lavaTerrainMesh = new PerspectiveMesh({
                    texture: tex,
                    verticesX: 12,
                    verticesY: 12,
                    roundPixels: false,
                });
            } else if (this.lavaTerrainMesh.texture !== tex) {
                this.lavaTerrainMesh.texture = tex;
            }
            this.context.attachToWorldRoot(this.lavaTerrainMesh, 50);
            if (fireOverlay) {
                if (!this.lavaFireOverlayMesh) {
                    this.lavaFireOverlayMesh = new PerspectiveMesh({
                        texture: fireOverlay,
                        verticesX: 12,
                        verticesY: 12,
                        roundPixels: false,
                    });
                    this.lavaFireOverlayMesh.eventMode = "none";
                } else if (this.lavaFireOverlayMesh.texture !== fireOverlay) {
                    this.lavaFireOverlayMesh.texture = fireOverlay;
                }
                if (this.lavaFireOverlayMesh.parent !== this.lavaPitForegroundContainer) {
                    this.lavaPitForegroundContainer.addChild(this.lavaFireOverlayMesh);
                }
                this.lavaFireOverlayMesh.zIndex = 1;
            } else if (this.lavaFireOverlayMesh) {
                this.lavaFireOverlayMesh.visible = false;
            }
            if (fireOverlayB) {
                if (!this.lavaFireOverlayMeshB) {
                    this.lavaFireOverlayMeshB = new PerspectiveMesh({
                        texture: fireOverlayB,
                        verticesX: 12,
                        verticesY: 12,
                        roundPixels: false,
                    });
                    this.lavaFireOverlayMeshB.eventMode = "none";
                } else if (this.lavaFireOverlayMeshB.texture !== fireOverlayB) {
                    this.lavaFireOverlayMeshB.texture = fireOverlayB;
                }
                if (this.lavaFireOverlayMeshB.parent !== this.lavaPitForegroundContainer) {
                    this.lavaPitForegroundContainer.addChild(this.lavaFireOverlayMeshB);
                }
                this.lavaFireOverlayMeshB.zIndex = 2;
            } else if (this.lavaFireOverlayMeshB) {
                this.lavaFireOverlayMeshB.visible = false;
            }
            if (grateOverlay) {
                if (!this.lavaGrateOverlayMesh) {
                    this.lavaGrateOverlayMesh = new PerspectiveMesh({
                        texture: grateOverlay,
                        verticesX: 12,
                        verticesY: 12,
                        roundPixels: false,
                    });
                    this.lavaGrateOverlayMesh.eventMode = "none";
                } else if (this.lavaGrateOverlayMesh.texture !== grateOverlay) {
                    this.lavaGrateOverlayMesh.texture = grateOverlay;
                }
                if (this.lavaGrateOverlayMesh.parent !== this.lavaPitForegroundContainer) {
                    this.lavaPitForegroundContainer.addChild(this.lavaGrateOverlayMesh);
                }
                this.lavaGrateOverlayMesh.zIndex = 100;
                this.lavaPitForegroundContainer.sortChildren();
            } else if (this.lavaGrateOverlayMesh) {
                this.lavaGrateOverlayMesh.visible = false;
            }
        } else if (this.lavaTerrainMesh) {
            this.lavaTerrainMesh.visible = false;
            if (this.lavaPitLight) this.lavaPitLight.visible = false;
            if (this.lavaFireOverlayMesh) this.lavaFireOverlayMesh.visible = false;
            if (this.lavaFireOverlayMeshB) this.lavaFireOverlayMeshB.visible = false;
            if (this.lavaFireMask) this.lavaFireMask.visible = false;
            if (this.lavaGrateOverlayMesh) this.lavaGrateOverlayMesh.visible = false;
        }

        this.applyLavaColorTuning(lavaTuning);

        if (liveLava && this.lavaTerrainMesh) {
            const tuning = lavaTuning ?? resolveLavaAnimationTuning();
            const logicalTarget = {
                x: logicalCenter.x + cellSize * tuning.shiftXCells,
                y: logicalCenter.y + cellSize * tuning.shiftYCells,
            };
            const halfWidth = cellSize * tuning.widthCells * 0.5;
            const halfHeight = cellSize * tuning.heightCells * 0.5;
            const topLeft = projectBattlefieldPoint(
                { x: logicalTarget.x - halfWidth, y: logicalTarget.y + halfHeight },
                gs,
            );
            const topRight = projectBattlefieldPoint(
                { x: logicalTarget.x + halfWidth, y: logicalTarget.y + halfHeight },
                gs,
            );
            const bottomRight = projectBattlefieldPoint(
                { x: logicalTarget.x + halfWidth, y: logicalTarget.y - halfHeight },
                gs,
            );
            const bottomLeft = projectBattlefieldPoint(
                { x: logicalTarget.x - halfWidth, y: logicalTarget.y - halfHeight },
                gs,
            );
            this.lavaTerrainMesh.setCorners(
                topLeft.x,
                topLeft.y,
                topRight.x,
                topRight.y,
                bottomRight.x,
                bottomRight.y,
                bottomLeft.x,
                bottomLeft.y,
            );
            const fireLogicalTarget = {
                x: logicalTarget.x + cellSize * tuning.fireShiftXCells,
                y: logicalTarget.y + cellSize * tuning.fireShiftYCells,
            };
            const fireCenter = projectBattlefieldPoint(fireLogicalTarget, gs);
            this.updateLavaPitLight(tuning, [topLeft, topRight, bottomRight, bottomLeft], fireCenter);
            if (this.lavaFireOverlayMesh && fireOverlay) {
                const fireHalfWidth = halfWidth * tuning.fireScaleX;
                const fireHalfHeight = halfHeight * tuning.fireScaleY;
                const fireTopLeft = projectBattlefieldPoint(
                    { x: fireLogicalTarget.x - fireHalfWidth, y: fireLogicalTarget.y + fireHalfHeight },
                    gs,
                );
                const fireTopRight = projectBattlefieldPoint(
                    { x: fireLogicalTarget.x + fireHalfWidth, y: fireLogicalTarget.y + fireHalfHeight },
                    gs,
                );
                const fireBottomRight = projectBattlefieldPoint(
                    { x: fireLogicalTarget.x + fireHalfWidth, y: fireLogicalTarget.y - fireHalfHeight },
                    gs,
                );
                const fireBottomLeft = projectBattlefieldPoint(
                    { x: fireLogicalTarget.x - fireHalfWidth, y: fireLogicalTarget.y - fireHalfHeight },
                    gs,
                );
                this.lavaFireOverlayMesh.setCorners(
                    fireTopLeft.x,
                    fireTopLeft.y,
                    fireTopRight.x,
                    fireTopRight.y,
                    fireBottomRight.x,
                    fireBottomRight.y,
                    fireBottomLeft.x,
                    fireBottomLeft.y,
                );
                this.lavaFireOverlayMesh.visible = true;
            }
            if (this.lavaFireOverlayMeshB && fireOverlayB && tuning.fire2Enabled) {
                const fire2LogicalTarget = {
                    x: logicalTarget.x + cellSize * tuning.fire2ShiftXCells,
                    y: logicalTarget.y + cellSize * tuning.fire2ShiftYCells,
                };
                const fire2HalfWidth = halfWidth * tuning.fire2ScaleX;
                const fire2HalfHeight = halfHeight * tuning.fire2ScaleY;
                const fire2TopLeft = projectBattlefieldPoint(
                    { x: fire2LogicalTarget.x - fire2HalfWidth, y: fire2LogicalTarget.y + fire2HalfHeight },
                    gs,
                );
                const fire2TopRight = projectBattlefieldPoint(
                    { x: fire2LogicalTarget.x + fire2HalfWidth, y: fire2LogicalTarget.y + fire2HalfHeight },
                    gs,
                );
                const fire2BottomRight = projectBattlefieldPoint(
                    { x: fire2LogicalTarget.x + fire2HalfWidth, y: fire2LogicalTarget.y - fire2HalfHeight },
                    gs,
                );
                const fire2BottomLeft = projectBattlefieldPoint(
                    { x: fire2LogicalTarget.x - fire2HalfWidth, y: fire2LogicalTarget.y - fire2HalfHeight },
                    gs,
                );
                this.lavaFireOverlayMeshB.setCorners(
                    fire2TopLeft.x,
                    fire2TopLeft.y,
                    fire2TopRight.x,
                    fire2TopRight.y,
                    fire2BottomRight.x,
                    fire2BottomRight.y,
                    fire2BottomLeft.x,
                    fire2BottomLeft.y,
                );
                this.lavaFireOverlayMeshB.visible = true;
            }
            if (fireOverlay) {
                this.updateLavaFireMask(tuning, gs, logicalTarget, cellSize);
                if (this.lavaFireOverlayMesh) this.lavaFireOverlayMesh.mask = this.lavaFireMask ?? null;
                if (this.lavaFireOverlayMeshB) this.lavaFireOverlayMeshB.mask = this.lavaFireMask ?? null;
            } else {
                if (this.lavaFireOverlayMesh) this.lavaFireOverlayMesh.mask = null;
                if (this.lavaFireOverlayMeshB) this.lavaFireOverlayMeshB.mask = null;
                if (this.lavaFireMask) this.lavaFireMask.visible = false;
            }
            if (this.lavaGrateOverlayMesh && grateOverlay) {
                this.lavaGrateOverlayMesh.setCorners(
                    topLeft.x,
                    topLeft.y,
                    topRight.x,
                    topRight.y,
                    bottomRight.x,
                    bottomRight.y,
                    bottomLeft.x,
                    bottomLeft.y,
                );
                this.lavaGrateOverlayMesh.visible = true;
            }
            this.lavaTerrainMesh.visible = true;
            this.centerTerrainSprite.visible = false;

            const corners = [topLeft, topRight, bottomRight, bottomLeft];
            const minX = Math.min(...corners.map((point) => point.x));
            const maxX = Math.max(...corners.map((point) => point.x));
            const minY = Math.min(...corners.map((point) => point.y));
            const maxY = Math.max(...corners.map((point) => point.y));
            const visualCenterX = (minX + maxX) * 0.5;
            const visualCenterY = (minY + maxY) * 0.5;
            const targetW = maxX - minX;
            const targetH = maxY - minY;
            // Birth points follow the immutable grate geometry: one of the twelve open windows marked by the
            // user is selected for each burst. Particle flight may spread afterward; only birth is constrained.
            this.updateLavaSplashEffects(tuning, visualCenterX, visualCenterY, targetW, targetH);
            this.updateLavaEditorOutline(tuning, visualCenterX, visualCenterY, targetW, targetH);
        } else if (gridType === GridVals.BLOCK_CENTER) {
            // Two 2x2 mountains (each 2 cells) offset ±2 cells from center, leaving a 2-cell corridor between
            // — matches grid.isCenterObstacleCell. scale.y is negative because the world root is y-flipped.
            // Draw each mountain a bit larger than its 2x2 collision footprint so the rock reads as a chunky
            // block (the texture has transparent padding), and push them apart a touch to keep the corridor open.
            const fp = FightStateManager.getInstance().getFightProperties();
            const leftHits = fp.getObstacleHitsLeftLeft();
            const rightHits = fp.getObstacleHitsLeftRight();
            // Place each sprite at its mountain's ACTUAL cell centre (same call units use), so sprite,
            // collision, HP routing and bar all line up regardless of the world-X mapping.
            const { left, right } = this.mountainCenters(gs);
            const blockSize = cellSize * MOUNTAIN_BLOCK_CELLS;
            const sx = blockSize / texW;
            const sy = -(blockSize / texH);
            this.centerTerrainSprite.scale.set(sx, sy);
            this.centerTerrainSprite.x = left.x;
            this.centerTerrainSprite.y = left.y;
            this.centerTerrainSprite.visible = leftHits > 0;

            if (!this.centerTerrainSpriteB) {
                this.centerTerrainSpriteB = new Sprite(tex);
                this.centerTerrainSpriteB.anchor.set(0.5);
                this.context.attachToWorldRoot(this.centerTerrainSpriteB, 50);
            } else if (this.centerTerrainSpriteB.texture !== tex) {
                this.centerTerrainSpriteB.texture = tex;
            }
            this.centerTerrainSpriteB.scale.set(sx, sy);
            this.centerTerrainSpriteB.x = right.x;
            this.centerTerrainSpriteB.y = right.y;
            this.centerTerrainSpriteB.visible = rightHits > 0;
        } else {
            const metrics = projectedBattlefieldMetricsAtPoint(logicalCenter, gs);
            const targetW = metrics.width * 4;
            const targetH = metrics.height * 4;
            this.centerTerrainSprite.scale.set(targetW / texW, -(targetH / texH));
            this.centerTerrainSprite.x = metrics.center.x;
            this.centerTerrainSprite.y = metrics.center.y;
            this.centerTerrainSprite.visible = true;
        }

        // Draw the mountain's remaining hit points (BLOCK_CENTER only, and only once the fight has
        // started — there's nothing to attack during placement).
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (gridType === GridVals.BLOCK_CENTER && fightProps.hasFightStarted()) {
            this.drawCenterHitBars(fightProps.getObstacleHitsLeftLeft(), fightProps.getObstacleHitsLeftRight());
        } else {
            this.clearCenterHitBars();
        }
    }
    private clearCenterHitBars(): void {
        if (this.centerHitBar && this.lastCenterHitBarKey !== undefined) {
            this.centerHitBar.clear();
            this.lastCenterHitBarKey = undefined;
        }
    }
    /** One compact HP meter drawn inside the base of each mountain, HITS_PER_MOUNTAIN pips max. */
    private drawCenterHitBars(leftHits: number, rightHits: number): void {
        const key = `${leftHits}:${rightHits}`;
        if (this.lastCenterHitBarKey === key) {
            return;
        }
        if (!this.centerHitBar) {
            this.centerHitBar = new Graphics();
            this.context.attachToWorldRoot(this.centerHitBar, 52); // above the mountain sprites (z=50)
        }
        this.lastCenterHitBarKey = key;
        const bar = this.centerHitBar;
        bar.clear();

        const gs = this.context.getGridSettings();
        const { left, right } = this.mountainCenters(gs);
        const cellSize = gs.getCellSize();
        const layout = getMountainHitBarLayout(cellSize);

        // Only draw a bar for a mountain that still stands — a destroyed one (hits <= 0) hides its sprite
        // (visible = hits > 0 above), so its HP bar (backing + rim included) must disappear too.
        if (leftHits > 0) {
            this.drawOneHitBar(bar, left.x, left.y - layout.centerOffset, layout, leftHits);
        }
        if (rightHits > 0) {
            this.drawOneHitBar(bar, right.x, right.y - layout.centerOffset, layout, rightHits);
        }
    }
    private drawOneHitBar(
        bar: Graphics,
        cx: number,
        cy: number,
        layout: IMountainHitBarLayout,
        hits: number,
        segments: number = HoCConstants.HITS_PER_MOUNTAIN,
    ): void {
        const totalHits = segments;
        const { width: barW, height: barH, gap, framePadding } = layout;
        const x0 = cx - barW / 2;
        const y0 = cy - barH / 2;
        const radius = Math.max(2, barH * 0.28);
        const pipW = (barW - gap * (totalHits - 1)) / totalHits;

        // A low-profile iron rail anchors the meter to the rock without becoming another large pill.
        bar.roundRect(
            x0 - framePadding,
            y0 - framePadding,
            barW + framePadding * 2,
            barH + framePadding * 2,
            radius + framePadding,
        )
            .fill({ color: 0x090806, alpha: 0.84 })
            .stroke({ width: 1, color: 0x74552e, alpha: 0.9 });

        // Separate pips make the mountain's discrete hit count readable at a glance. Empty slots stay
        // visible, while the final remaining hit shifts from bronze to ember-red.
        for (let i = 0; i < totalHits; i++) {
            const pipX = x0 + i * (pipW + gap);
            const active = i < hits;
            const fillColor = active ? (hits === 1 ? 0xc8532f : 0xcf9130) : 0x211a14;
            const borderColor = active ? (hits === 1 ? 0xf18a58 : 0xe9bd61) : 0x60482d;

            bar.roundRect(pipX, y0, pipW, barH, radius)
                .fill({ color: fillColor, alpha: active ? 1 : 0.92 })
                .stroke({ width: 1, color: borderColor, alpha: active ? 0.95 : 0.72 });

            if (active) {
                const highlightH = Math.max(1, barH * 0.22);
                // World-space is y-up, so the visually top edge is the high-Y edge of the local shape.
                const highlightY = y0 + barH - highlightH - 1;
                bar.roundRect(pipX + 1, highlightY, Math.max(0, pipW - 2), highlightH, radius * 0.65).fill({
                    color: 0xffdc82,
                    alpha: 0.42,
                });
            }
        }
    }
    /** World-space centres of the two mountains (from their actual cells, so everything stays aligned). */
    private mountainCenters(gs: GridSettings): { left: { x: number; y: number }; right: { x: number; y: number } } {
        const mid = gs.getGridSize() >> 1;
        const columns = [mid - 1, mid];
        const cellsFor = (rows: number[]): { x: number; y: number }[] =>
            rows.flatMap((x) => columns.map((y) => ({ x, y })));
        // Each side passes a full 4-cell (2x2) footprint, so getPositionForCells always resolves a centre.
        return {
            left: projectBattlefieldPoint(GridMath.getPositionForCells(gs, cellsFor([mid - 3, mid - 2]))!, gs),
            right: projectBattlefieldPoint(GridMath.getPositionForCells(gs, cellsFor([mid + 1, mid + 2]))!, gs),
        };
    }
    /** Fire a collapse for any mountain whose hits just went from alive to 0 (see lastMountainHits). */
    private detectMountainCollapses(): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const left = fightProps.getObstacleHitsLeftLeft();
        const right = fightProps.getObstacleHitsLeftRight();
        if (this.lastMountainHits === undefined) {
            this.lastMountainHits = { left, right };
            return;
        }
        if (fightProps.hasFightStarted()) {
            if (this.lastMountainHits.left > 0 && left <= 0) {
                this.spawnMountainCollapse("left");
            }
            if (this.lastMountainHits.right > 0 && right <= 0) {
                this.spawnMountainCollapse("right");
            }
        }
        this.lastMountainHits = { left, right };
    }
    /** Slice the mountain texture into its 2x2 quarter-squares (cached per source texture). */
    private getMountainQuarterTextures(tex: Texture): Texture[] {
        if (this.mountainQuarterTextures?.source === tex) {
            return this.mountainQuarterTextures.quarters;
        }
        const halfW = tex.width / 2;
        const halfH = tex.height / 2;
        // `tex` can itself be a frame inside the 4x2 tombstone atlas. Slice relative to that frame,
        // otherwise every collapse samples atlas tile 0 even though the standing sprite and motion
        // profile belong to another variant.
        const frameX = tex.frame.x;
        const frameY = tex.frame.y;
        const quarters: Texture[] = [];
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 2; col++) {
                quarters.push(
                    new Texture({
                        source: tex.source,
                        frame: new Rectangle(frameX + col * halfW, frameY + row * halfH, halfW, halfH),
                    }),
                );
            }
        }
        this.mountainQuarterTextures = { source: tex, quarters };
        return quarters;
    }
    /**
     * The destroyed 2x2 mountain crashes apart into its four quarter-squares: the assembled block
     * shudders for a beat, then each quarter flies toward its own corner, falls under gravity, crashes
     * onto the mountain's base line with a bounce, and crumbles away in a burst of dust.
     */
    public spawnMountainCollapse(side: "left" | "right"): void {
        const tex = this.context.texAny("mountain_432_412");
        if (!tex) {
            return;
        }
        const gs = this.context.getGridSettings();
        const cellSize = gs.getCellSize();
        const center = this.mountainCenters(gs)[side];
        // Same oversize the intact sprite is drawn at, so the four quarters exactly overlay it.
        const blockSize = cellSize * MOUNTAIN_BLOCK_CELLS;
        const quarterSize = blockSize / 2;
        const quarters = this.getMountainQuarterTextures(tex);

        const container = new Container();
        // Above the mountain sprites (50), below the hit bars (52) — and far below the units layer.
        this.context.attachToWorldRoot(container, 51);

        const now = performance.now();
        const chunks: IMountainChunk[] = [];
        // Quarter textures are ordered rows-first from the IMAGE top; each quarter sprite is y-flipped
        // (like the intact sprite), so image row 0 lands on the world-space TOP half (+y is up).
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 2; col++) {
                const sprite = new Sprite(quarters[row * 2 + col]);
                sprite.anchor.set(0.5);
                sprite.scale.set(quarterSize / (tex.width / 2), -(quarterSize / (tex.height / 2)));
                const homeX = center.x + (col === 0 ? -1 : 1) * (quarterSize / 2);
                const homeY = center.y + (row === 0 ? 1 : -1) * (quarterSize / 2);
                sprite.x = homeX;
                sprite.y = homeY;
                container.addChild(sprite);

                // Corner-outward horizontal kick; top quarters also pop upward before gravity takes
                // them, so they visibly tumble over the bottom ones. Deterministic per-chunk jitter
                // (no Math.random in render code) keeps the four arcs from looking mirror-identical.
                const jitter = 0.75 + 0.5 * Math.abs(Math.sin((row * 2 + col + 1) * 12.9898));
                const outward = (col === 0 ? -1 : 1) * cellSize * 1.05 * jitter;
                const pop = row === 0 ? cellSize * 1.15 * jitter : cellSize * 0.3 * jitter;
                chunks.push({
                    sprite,
                    homeX,
                    homeY,
                    vx: outward,
                    vy: pop,
                    spin: (col === 0 ? -1 : 1) * (row === 0 ? 2.2 : 1.1) * jitter,
                    // Bottom quarters settle on their own line; top quarters fall onto the block's base.
                    floorY: center.y - quarterSize / 2,
                });
            }
        }

        // Dust burst along the base line, released when the block breaks apart.
        const dust: IMountainDustPuff[] = [];
        const baseY = center.y - quarterSize;
        for (let i = 0; i < MC_DUST_COUNT; i++) {
            const gfx = new Graphics();
            const t = i / (MC_DUST_COUNT - 1);
            const radius = cellSize * (0.09 + 0.12 * Math.abs(Math.sin(i * 78.233)));
            const shade = i % 2 === 0 ? 0x8a7a63 : 0x6b5d4a;
            gfx.circle(0, 0, radius).fill({ color: shade, alpha: 1 });
            gfx.alpha = 0;
            gfx.x = center.x - blockSize / 2 + blockSize * t;
            gfx.y = baseY + cellSize * 0.1;
            container.addChild(gfx);
            dust.push({
                gfx,
                vx: (t - 0.5) * cellSize * 1.6,
                vy: cellSize * (0.35 + 0.55 * Math.abs(Math.sin(i * 37.719))),
                lifeMs: 700 + 400 * Math.abs(Math.sin(i * 51.113)),
                baseAlpha: 0.55,
                baseRadius: radius,
                bornMs: now + MC_SHUDDER_MS,
            });
        }

        this.activeCollapses.push({ container, chunks, dust, startMs: now, lastStepMs: now });
    }
    /** Break a one-cell tombstone into four tumbling pieces and a short dust burst. */
    private spawnScatteredMountainCollapse(mountain: IScatteredMountain): void {
        const tiles = this.mountainTiles();
        if (!tiles?.length) {
            return;
        }
        const tex = tiles[((mountain.variant % tiles.length) + tiles.length) % tiles.length];
        const profile =
            TOMBSTONE_COLLAPSE_PROFILES[
                ((mountain.variant % TOMBSTONE_COLLAPSE_PROFILES.length) + TOMBSTONE_COLLAPSE_PROFILES.length) %
                    TOMBSTONE_COLLAPSE_PROFILES.length
            ];
        const gs = this.context.getGridSettings();
        const center = GridMath.getPositionForCell(
            { x: mountain.x, y: mountain.y },
            gs.getMinX(),
            gs.getStep(),
            gs.getHalfStep(),
        );
        const metrics = projectedBattlefieldMetricsAtPoint(center, gs);
        const localCellSize = metrics.cellSize;
        const geometry = cemeteryObstacleFrameGeometry(metrics.width, metrics.height, mountain.y);
        const rowScale = geometry.scale;
        const localDrawnHeight = geometry.frameHeight;
        const localRiseUp = geometry.rise + metrics.height * DungeonVisuals.MOUNTAIN_VERTICAL_OFFSET_CELLS;
        center.x = metrics.center.x;
        center.y = metrics.center.y + localRiseUp;
        const quarters = this.getMountainQuarterTextures(tex);
        const chunkW = metrics.width * rowScale * 0.5;
        const chunkH = localDrawnHeight * 0.5;
        const container = new Container();
        this.context.attachToWorldRoot(container, 53);
        const now = performance.now();
        const chunks: IMountainChunk[] = [];
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 2; col++) {
                const sprite = new Sprite(quarters[row * 2 + col]);
                sprite.anchor.set(0.5);
                sprite.roundPixels = true;
                sprite.scale.set(chunkW / (tex.width / 2), -(chunkH / (tex.height / 2)));
                const homeX = center.x + (col === 0 ? -1 : 1) * (chunkW * 0.5);
                const homeY = center.y + (row === 0 ? 1 : -1) * (chunkH * 0.5);
                sprite.position.set(homeX, homeY);
                container.addChild(sprite);
                const index = row * 2 + col;
                const jitter = 0.9 + 0.2 * Math.abs(Math.sin((index + 2) * 9.713));
                chunks.push({
                    sprite,
                    homeX,
                    homeY,
                    vx: profile.vx[index] * localCellSize * jitter,
                    vy: profile.vy[index] * localCellSize * jitter,
                    spin: profile.spin[index] * jitter,
                    floorY: center.y - localDrawnHeight * 0.5,
                    delayMs: profile.delayMs[index],
                });
            }
        }
        const dust: IMountainDustPuff[] = [];
        const dustCount = profile.dustCount;
        for (let i = 0; i < dustCount; i++) {
            const gfx = new Graphics();
            const t = i / (dustCount - 1);
            const radius = localCellSize * (0.045 + 0.055 * Math.abs(Math.sin(i * 31.71)));
            gfx.circle(0, 0, radius).fill({ color: profile.dust[i % profile.dust.length], alpha: 1 });
            gfx.alpha = 0;
            gfx.x = center.x - localCellSize * 0.42 + localCellSize * 0.84 * t;
            gfx.y = center.y - localDrawnHeight * 0.5;
            container.addChild(gfx);
            dust.push({
                gfx,
                vx: (t - 0.5) * localCellSize,
                vy: localCellSize * (0.28 + 0.38 * Math.abs(Math.sin(i * 17.3))),
                lifeMs: 520 + 260 * Math.abs(Math.sin(i * 23.9)),
                baseAlpha: 0.58,
                baseRadius: radius,
                bornMs: now + profile.shudderMs,
            });
        }
        this.activeCollapses.push({
            container,
            chunks,
            dust,
            startMs: now,
            lastStepMs: now,
            shudderMs: profile.shudderMs,
            gravityScale: profile.gravityScale,
        });
    }
    /** Advance every active collapse; called each frame from ensureCenterTerrainSprite. */
    private stepMountainCollapses(): void {
        if (!this.activeCollapses.length) {
            return;
        }
        const now = performance.now();
        const cellSize = this.context.getGridSettings().getCellSize();
        let writeIndex = 0;
        for (const collapse of this.activeCollapses) {
            const t = now - collapse.startMs;
            if (t >= MC_TOTAL_MS) {
                collapse.container.destroy({ children: true });
                continue;
            }
            // Clamped so a hitched frame (tab switch) doesn't teleport chunks through the floor.
            const dt = Math.min(0.05, (now - collapse.lastStepMs) / 1000);
            collapse.lastStepMs = now;
            const shudderMs = collapse.shudderMs ?? MC_SHUDDER_MS;
            const gravity = -cellSize * MC_GRAVITY_CELLS * (collapse.gravityScale ?? 1);
            const fade =
                t <= MC_FADE_START_MS
                    ? 1
                    : Math.max(0, 1 - (t - MC_FADE_START_MS) / (MC_FADE_END_MS - MC_FADE_START_MS));

            if (t < shudderMs) {
                // The assembled block trembles: all four quarters jitter around their home position.
                const mag = cellSize * 0.035 * (t / shudderMs);
                for (const [index, chunk] of collapse.chunks.entries()) {
                    chunk.sprite.x = chunk.homeX + Math.sin(now * 0.09 + index * 1.7) * mag;
                    chunk.sprite.y = chunk.homeY + Math.sin(now * 0.11 + index * 2.3) * mag;
                }
            } else {
                for (const chunk of collapse.chunks) {
                    if (t < shudderMs + (chunk.delayMs ?? 0)) {
                        const mag = cellSize * 0.02;
                        chunk.sprite.x = chunk.homeX + Math.sin(now * 0.08 + chunk.homeX) * mag;
                        chunk.sprite.y = chunk.homeY + Math.sin(now * 0.1 + chunk.homeY) * mag;
                        continue;
                    }
                    chunk.vy += gravity * dt;
                    chunk.sprite.x += chunk.vx * dt;
                    chunk.sprite.y += chunk.vy * dt;
                    chunk.sprite.rotation += chunk.spin * dt;
                    // Crash onto the base line: bounce once with most energy lost, then grind to a stop.
                    if (chunk.sprite.y < chunk.floorY && chunk.vy < 0) {
                        chunk.sprite.y = chunk.floorY;
                        chunk.vy = -chunk.vy * MC_BOUNCE;
                        chunk.vx *= 0.55;
                        chunk.spin *= 0.4;
                    }
                    chunk.sprite.alpha = fade;
                }
                for (const puff of collapse.dust) {
                    const age = now - puff.bornMs;
                    if (age < 0 || age >= puff.lifeMs) {
                        puff.gfx.alpha = 0;
                        continue;
                    }
                    const life = age / puff.lifeMs;
                    puff.gfx.x += puff.vx * dt;
                    puff.gfx.y += puff.vy * dt;
                    puff.vy *= 1 - 1.6 * dt; // dust decelerates as it billows
                    puff.gfx.alpha = puff.baseAlpha * (1 - life) * fade;
                    puff.gfx.scale.set(1 + life * 0.9); // billow outward as it fades
                }
            }
            this.activeCollapses[writeIndex++] = collapse;
        }
        this.activeCollapses.length = writeIndex;
    }
    /**
     * The board's floor texture. Only the base painting is swappable — the dungeon lighting overlay, the
     * atmosphere alpha and every other effect layered on top read nothing from this key and are unaffected.
     *
     * TEMPORARY: `background_new` is the previous floor, kept reachable so the sandbox toggle can put the
     * two side by side (see Sandbox.setLegacyBoardBackground). Drop the pair and inline the winner once the
     * comparison is settled.
     */
    // Use the same restored 16x16 field painting as the local sandbox. This is visual-only:
    // grid geometry, placement rules and combat coordinates remain unchanged.
    private static readonly BG_KEY_CURRENT = "background_stone_tiles_sinister_16x16_original_restored";
    private static readonly BG_KEY_LEGACY = "background_new";
    /**
     * Squares painted across the current floor texture — exactly the board's own GRID_SIZE, so the map
     * shows 16x16 and nothing else. Keep this in step with the artwork: the sprite is sized from it, so one
     * painted square stays exactly one cell.
     */
    private static readonly FLOOR_TILES_ACROSS = GridConstants.GRID_SIZE;
    private useLegacyBackground = false;
    /** Switch the floor painting. The next layoutBackgroundSquare re-reads the key and swaps the texture. */
    public setLegacyBackground(enabled: boolean): void {
        if (this.useLegacyBackground !== enabled) {
            this.useLegacyBackground = enabled;
            this.ambientFireLayoutDirty = true;
        }
        this.clearExperimentalBackgroundFilters();
    }
    public isLegacyBackground(): boolean {
        return this.useLegacyBackground;
    }
    private backgroundKey(): string {
        if (this.useLegacyBackground) {
            return DungeonVisuals.BG_KEY_LEGACY;
        }
        return DungeonVisuals.BG_KEY_CURRENT;
    }
    /** A missing optional painting must never leave the battle board transparent over the black stage. */
    private backgroundTexture(): Texture | undefined {
        return (
            this.context.texAny(this.backgroundKey()) ??
            this.context.texAny(DungeonVisuals.BG_KEY_CURRENT) ??
            this.context.texAny(DungeonVisuals.BG_KEY_LEGACY)
        );
    }
    public ensureBackgroundSprite(): void {
        if (!this.bgSprite) {
            const tex = this.backgroundTexture();
            if (!tex) return;

            const bg = new Sprite(tex);
            bg.anchor.set(0.5);
            // Behind every floor-only light; all remain below the world/units (camera @0).
            const stage = this.context.getStage();
            stage.sortableChildren = true;
            bg.zIndex = -20;
            stage.addChild(bg);
            this.bgSprite = bg;
        }

        // Optional VFX textures can finish decoding after the floor. Retry these independently instead of
        // returning just because bgSprite already exists.
        this.ensureAmbientFireSprites();
        this.clearExperimentalBackgroundFilters();
    }
    private ensureAmbientFireSprites(): void {
        if (!this.ambientFireLayer) {
            const layer = new Container();
            layer.eventMode = "none";
            layer.zIndex = -19;
            const stage = this.context.getStage();
            stage.sortableChildren = true;
            stage.addChild(layer);
            this.ambientFireLayer = layer;
        }

        for (const definition of AMBIENT_FIRE_DEFINITIONS) {
            if (this.ambientFireSprites.has(definition.key)) continue;
            const textureKey = definition.textureKey ?? definition.key;
            const atlas = this.ambientFireAtlases.get(textureKey);
            if (!atlas) {
                const atlasUrl = (images as Readonly<Record<string, string | undefined>>)[textureKey];
                if (atlasUrl && !this.ambientFireAtlasLoads.has(textureKey)) {
                    this.ambientFireAtlasLoads.add(textureKey);
                    void Assets.load<Texture>(atlasUrl)
                        .then((loaded) => this.ambientFireAtlases.set(textureKey, loaded))
                        .catch(() => this.ambientFireAtlasLoads.delete(textureKey));
                }
                continue;
            }
            const rows = Math.ceil(definition.frameCount / definition.columns);
            if (
                atlas.source.width < definition.columns * definition.frameWidth ||
                atlas.source.height < rows * definition.frameHeight
            ) {
                continue;
            }
            atlas.source.autoGenerateMipmaps = true;
            atlas.source.scaleMode = "linear";
            const frames: Texture[] = [];
            for (let index = 0; index < definition.frameCount; index++) {
                frames.push(
                    new Texture({
                        source: atlas.source,
                        frame: new Rectangle(
                            (index % definition.columns) * definition.frameWidth,
                            Math.floor(index / definition.columns) * definition.frameHeight,
                            definition.frameWidth,
                            definition.frameHeight,
                        ),
                    }),
                );
            }
            const sprite = new Sprite(frames[0]);
            sprite.anchor.set(0.5, 1);
            // Keep a fully rendered normal-blend flame in front of the painted brazier/firebox. A second,
            // restrained additive copy supplies heat and bloom without making the main body look translucent.
            sprite.blendMode = "normal";
            sprite.alpha = definition.alpha;
            sprite.eventMode = "none";
            const glowSprite = new Sprite(frames[0]);
            glowSprite.anchor.set(0.5, 1);
            glowSprite.blendMode = "add";
            glowSprite.alpha = definition.glowAlpha;
            glowSprite.eventMode = "none";
            if (definition.key.includes("furnace")) {
                const contactGlow = new Graphics();
                contactGlow.eventMode = "none";
                contactGlow.blendMode = "add";
                // Layered translucent shapes mimic a soft heat bloom without a BlurFilter. The broad outer
                // spill warms the shelf while the narrow core visually joins the atlas to its fuel line.
                contactGlow
                    .ellipse(
                        0,
                        definition.sourceHeight * 0.08,
                        definition.sourceWidth * 0.62,
                        definition.sourceHeight * 0.28,
                    )
                    .fill({ color: 0xff4a12, alpha: 0.075 });
                contactGlow
                    .ellipse(
                        0,
                        definition.sourceHeight * 0.035,
                        definition.sourceWidth * 0.49,
                        definition.sourceHeight * 0.17,
                    )
                    .fill({ color: 0xff7a22, alpha: 0.14 });
                contactGlow
                    .roundRect(
                        -definition.sourceWidth * 0.4,
                        -definition.sourceHeight * 0.04,
                        definition.sourceWidth * 0.8,
                        definition.sourceHeight * 0.13,
                        definition.sourceHeight * 0.06,
                    )
                    .fill({ color: 0xffbd55, alpha: 0.19 });
                contactGlow
                    .roundRect(
                        -definition.sourceWidth * 0.29,
                        -definition.sourceHeight * 0.045,
                        definition.sourceWidth * 0.58,
                        definition.sourceHeight * 0.085,
                        definition.sourceHeight * 0.04,
                    )
                    .fill({ color: 0xffe2a3, alpha: 0.18 });
                this.ambientFireContactGlows.set(definition.key, contactGlow);
                this.ambientFireLayer.addChild(contactGlow);
            }
            this.ambientFireFrames.set(definition.key, frames);
            this.ambientFireSprites.set(definition.key, sprite);
            this.ambientFireGlowSprites.set(definition.key, glowSprite);
            this.ambientFireLayer.addChild(sprite, glowSprite);
            this.ambientFireLayoutDirty = true;
        }
        // Re-adding an existing child moves it above sprites that may have finished decoding later.
        if (this.ambientFireEditorOutline) this.ambientFireLayer.addChild(this.ambientFireEditorOutline);
    }
    private updateAmbientFireSprites(nowSeconds: number): void {
        for (const definition of AMBIENT_FIRE_DEFINITIONS) {
            const frames = this.ambientFireFrames.get(definition.key);
            const sprite = this.ambientFireSprites.get(definition.key);
            const glowSprite = this.ambientFireGlowSprites.get(definition.key);
            if (!frames || !sprite || !glowSprite) continue;
            const tuning = resolveAmbientFireTuning(definition);
            const localTime = nowSeconds + definition.phaseSeconds;
            const frameIndex = Math.floor(localTime * definition.fps) % frames.length;
            if (sprite.texture !== frames[frameIndex]) {
                sprite.texture = frames[frameIndex];
                glowSprite.texture = frames[frameIndex];
            }
            const breath =
                0.94 +
                Math.sin(localTime * (4.1 + definition.phaseSeconds)) * 0.05 +
                Math.sin(localTime * (9.7 - definition.phaseSeconds)) * 0.03;
            // The side flames are intentionally compact. At that display size atlas-only deformation can
            // collapse below one pixel, so add a restrained lateral curl around the bottom-centre anchor.
            // Width and skew change, but height and the fuel-line position never do.
            const lateralBreath =
                1 +
                Math.sin(localTime * (5.3 + definition.phaseSeconds) + definition.phaseSeconds * 7.1) *
                    definition.motionAmount +
                Math.sin(localTime * (11.2 - definition.phaseSeconds) + definition.phaseSeconds * 3.7) *
                    definition.motionAmount *
                    0.38;
            const curl =
                (Math.sin(localTime * (4.7 + definition.phaseSeconds) + definition.phaseSeconds * 9.3) +
                    Math.sin(localTime * 8.9 + definition.phaseSeconds * 4.1) * 0.35) *
                definition.motionAmount *
                0.42;
            // Layout records the resting scale. Assign from it instead of multiplying the preceding frame,
            // which lets static geometry stay cached without the flame slowly widening over time.
            sprite.scale.x = (this.ambientFireBaseScaleX.get(definition.key) ?? sprite.scale.x) * lateralBreath;
            glowSprite.scale.x =
                (this.ambientFireGlowBaseScaleX.get(definition.key) ?? glowSprite.scale.x) * lateralBreath;
            sprite.skew.x = curl;
            glowSprite.skew.x = curl;
            sprite.alpha = tuning.alpha * breath;
            glowSprite.alpha = tuning.glowAlpha * (0.92 + (breath - 0.94) * 2.2);
            const contactGlow = this.ambientFireContactGlows.get(definition.key);
            if (contactGlow) {
                contactGlow.alpha =
                    tuning.contactGlowStrength *
                    (0.94 +
                        Math.sin(localTime * 3.8 + definition.phaseSeconds * 5.1) * 0.045 +
                        Math.sin(localTime * 8.6 + definition.phaseSeconds * 2.3) * 0.02);
            }
        }
    }
    /** Keep the floor free of the retired full-screen filters that could turn it black on WebGL. */
    private clearExperimentalBackgroundFilters(): void {
        const bg = this.bgSprite;
        if (!bg) {
            return;
        }
        // Experimental full-floor light filters are intentionally disabled. One of them rendered the
        // background texture as solid black on a fresh WebGL scene even though overlays remained visible.
        bg.filters = [];
    }
    /**
     * Live state of the localized lava-light pass, for the dev console (window.__hocFloorLight).
     */
    public getFireLightDiagnostics(): Record<string, unknown> {
        const sprite = this.bgSprite;
        return {
            spriteExists: !!sprite,
            shaderBuilt: false,
            filtersOnSprite: Array.isArray(sprite?.filters) ? sprite.filters.length : 0,
            filterAttached: false,
            legacyFloor: this.useLegacyBackground,
            lavaFireLightVisible: false,
            lavaFireLightGroups: 0,
            clockSeconds: 0,
        };
    }
    /**
     * Advances the ambient flame clock in REAL seconds, deliberately ignoring the simulation's step.
     *
     * The sim runs at 60 Hz but is handed a 1/240 step (see PixiGameManager.SIM_STEP), so game time passes
     * at a QUARTER of wall-clock — a deliberate choice there, to keep the legacy animation constants. Fed
     * that clock, this effect ran 4x slow: the fire's breath stretched from ~7s to nearly half a minute and
     * the fine flicker crawled, which on screen is indistinguishable from a static board. That was the whole
     * reason the floor looked frozen. The atmosphere flicker next door already sidesteps this the same way,
     * off HoCLib.getTimeMillis().
     *
     * Called once per SIM step, so several times per rendered frame — taking real deltas (rather than one
     * stamp per frame) keeps that from multiplying the speed by the number of substeps.
     */
    public updateFireLight(): void {
        const nowSeconds = performance.now() / 1000;
        this.updateAmbientFireSprites(nowSeconds);
    }
    public layoutBackgroundSquare(alpha: number): void {
        if (!this.bgSprite) return;
        const { width: vw, height: vh } = this.context.getViewportSize();
        const wantKey = this.backgroundKey();
        const wantTex = this.context.texAny(wantKey) ?? this.backgroundTexture();
        let textureChanged = false;
        if (wantTex && this.bgSprite.texture !== wantTex) {
            this.bgSprite.texture = wantTex;
            textureChanged = true;
        }

        let layout = this.backgroundLayout;
        const viewportChanged = !layout || layout.viewportWidth !== vw || layout.viewportHeight !== vh;
        if (viewportChanged) {
            // Fit the authored FIELD quad, not the bitmap rectangle, to the unchanged logical board. The art
            // has walls above and outside the 16x16 floor; decorations are not part of combat coordinates.
            const boardWidth = (boardFitWidth(vw, vh) * DungeonVisuals.FLOOR_TILES_ACROSS) / GridConstants.GRID_SIZE;
            const floorHeight = (boardFitHeight(vw, vh) * DungeonVisuals.FLOOR_TILES_ACROSS) / GridConstants.GRID_SIZE;
            const artwork = battlefieldArtworkLayout(vw, vh, boardWidth, floorHeight);
            layout = {
                viewportWidth: vw,
                viewportHeight: vh,
                x: artwork.x,
                y: artwork.y,
                width: artwork.width,
                height: artwork.height,
            };
            this.backgroundLayout = layout;
        }
        if (!layout) return;
        if (viewportChanged || textureChanged) {
            this.bgSprite.position.set(layout.x, layout.y);
            this.bgSprite.width = layout.width;
            this.bgSprite.height = layout.height;
        }

        if (this.ambientFireLayer) {
            this.ambientFireLayer.visible = !this.useLegacyBackground;
            let tuningChanged = false;
            for (const definition of AMBIENT_FIRE_DEFINITIONS) {
                const tuning = resolveAmbientFireTuning(definition);
                if (this.ambientFireLayoutTunings.get(definition.key) !== tuning) {
                    this.ambientFireLayoutTunings.set(definition.key, tuning);
                    tuningChanged = true;
                }
            }
            const selectedKey = getAmbientFireEditorSelection();
            const editorSelectionChanged = selectedKey !== this.ambientFireEditorSelection;
            const needsLayout = viewportChanged || this.ambientFireLayoutDirty || tuningChanged;
            if (needsLayout) {
                const artworkLeft = layout.x - layout.width * 0.5;
                const artworkTop = layout.y - layout.height * 0.5;
                const sourceScaleX = layout.width / BATTLEFIELD_ARTWORK.width;
                const sourceScaleY = layout.height / BATTLEFIELD_ARTWORK.height;
                for (const definition of AMBIENT_FIRE_DEFINITIONS) {
                    const sprite = this.ambientFireSprites.get(definition.key);
                    const glowSprite = this.ambientFireGlowSprites.get(definition.key);
                    if (!sprite || !glowSprite) continue;
                    const tuning = this.ambientFireLayoutTunings.get(definition.key)!;
                    const contactGlow = this.ambientFireContactGlows.get(definition.key);
                    const fireX = artworkLeft + tuning.sourceX * sourceScaleX;
                    const fireY = artworkTop + tuning.sourceY * sourceScaleY;
                    sprite.position.set(fireX, fireY);
                    sprite.width = tuning.sourceWidth * sourceScaleX;
                    sprite.height = tuning.sourceHeight * sourceScaleY;
                    glowSprite.position.set(fireX, fireY);
                    glowSprite.width = sprite.width;
                    glowSprite.height = sprite.height;
                    this.ambientFireBaseScaleX.set(definition.key, sprite.scale.x);
                    this.ambientFireGlowBaseScaleX.set(definition.key, glowSprite.scale.x);
                    if (contactGlow) {
                        contactGlow.position.set(fireX, fireY);
                        contactGlow.scale.set(
                            sourceScaleX * (tuning.sourceWidth / definition.sourceWidth),
                            sourceScaleY * (tuning.sourceHeight / definition.sourceHeight),
                        );
                    }
                }
                this.ambientFireLayoutDirty = false;
            }
            if (needsLayout || editorSelectionChanged) {
                const selectedDefinition = AMBIENT_FIRE_DEFINITIONS.find(
                    (definition) => definition.key === selectedKey,
                );
                if (selectedDefinition) {
                    if (!this.ambientFireEditorOutline) {
                        const outline = new Graphics();
                        outline.eventMode = "none";
                        this.ambientFireEditorOutline = outline;
                        this.ambientFireLayer.addChild(outline);
                    }
                    const tuning = this.ambientFireLayoutTunings.get(selectedDefinition.key)!;
                    const sourceScaleX = layout.width / BATTLEFIELD_ARTWORK.width;
                    const sourceScaleY = layout.height / BATTLEFIELD_ARTWORK.height;
                    const fireX = layout.x - layout.width * 0.5 + tuning.sourceX * sourceScaleX;
                    const fireY = layout.y - layout.height * 0.5 + tuning.sourceY * sourceScaleY;
                    const width = tuning.sourceWidth * sourceScaleX;
                    const height = tuning.sourceHeight * sourceScaleY;
                    this.ambientFireEditorOutline
                        .clear()
                        .roundRect(fireX - width * 0.5, fireY - height, width, height, 4)
                        .fill({ color: 0xffc83d, alpha: 0.055 })
                        .stroke({ color: 0xffd45b, alpha: 0.95, width: 1.5 })
                        .circle(fireX, fireY, 3.5)
                        .fill({ color: 0x63e6e2, alpha: 0.95 })
                        .stroke({ color: 0x081411, alpha: 0.9, width: 1 });
                    this.ambientFireEditorOutline.visible = true;
                } else if (this.ambientFireEditorOutline?.visible) {
                    this.ambientFireEditorOutline.clear();
                    this.ambientFireEditorOutline.visible = false;
                }
                this.ambientFireEditorSelection = selectedKey;
            }
        }

        // Update overlay
        if (this.dungeonOverlay && this.dungeonOverlay.visible) {
            this.updateDungeonAtmosphere(true, alpha);
        }
    }
    public onResize(): void {
        if (this.dungeonOverlay) {
            // Detach the (reused) light filter before tearing the overlay down, then force a rebuild
            // at the new viewport size on the next updateDungeonAtmosphere.
            if (this.lightOverlay) this.lightOverlay.filters = [];
            this.dungeonOverlay.removeChildren();
            this.lightOverlay = undefined;
            this.lightBuilt = false;
        }
    }
    /**
     * Tear down every display object this helper attached outside PixiDrawer's scene containers.
     *
     * Sandbox "New Battle" reuses the Pixi application and replaces only the scene. Most dungeon
     * objects are attached directly to the shared world root or stage, so PixiDrawer.destroy() cannot
     * remove them. In particular, a finished fight's black narrowing holes would otherwise remain over
     * the freshly-created board. Keep this ownership cleanup here so every dungeon visual follows the
     * same scene lifetime.
     */
    public destroy(): void {
        this.clearHoleLayers();
        this.holeContainer.destroy({ children: true });

        if (this.lightOverlay) this.lightOverlay.filters = [];
        this.dungeonOverlay?.destroy({ children: true });
        this.bgSprite?.destroy();
        this.ambientFireLayer?.destroy({ children: true });
        this.lavaPitLight?.destroy();
        this.lavaTerrainMesh?.destroy();
        this.lavaPitForegroundContainer?.destroy({ children: true });
        this.centerTerrainSprite?.destroy();
        this.centerTerrainSpriteB?.destroy();
        this.lavaSplashGraphics?.destroy();
        this.lavaEditorOutline?.destroy();
        this.centerHitBar?.destroy();

        for (const sprite of this.scatteredMountainSprites) sprite.destroy();
        for (const shadow of this.scatteredMountainShadows) shadow.destroy();
        for (const outline of this.scatteredMountainOutlines) outline.destroy({ children: true });
        for (const overlay of this.scatteredMountainDangerOverlays) overlay.destroy();
        for (const hitBar of this.scatteredMountainHitBars) hitBar.destroy();
        for (const collapse of this.activeCollapses) collapse.container.destroy({ children: true });

        for (const texture of this.lavaAnimFrames ?? []) texture.destroy(false);
        for (const texture of this.firePitOverlayFrames ?? []) texture.destroy(false);
        for (const frames of this.ambientFireFrames.values()) {
            for (const texture of frames) texture.destroy(false);
        }
        for (const texture of this.mountainTileTextures ?? []) texture.destroy(false);
        for (const texture of this.mountainHitPointTileTextures ?? []) texture.destroy(false);
        for (const texture of this.mountainQuarterTextures?.quarters ?? []) texture.destroy(false);
        this.lightFilter?.destroy();
        this.tombstoneRedFilter?.destroy();
        this.cemeteryEdgeDarkenFilter?.destroy();
        this.cemeteryShadowBlurFilter?.destroy();
        this.lavaColorFilter?.destroy();
        this.lavaFireColorFilter?.destroy();
        this.lavaFire2ColorFilter?.destroy();

        this.scatteredMountainSprites = [];
        this.scatteredMountainShadows = [];
        this.scatteredMountainOutlines = [];
        this.scatteredMountainDangerOverlays = [];
        this.scatteredMountainHitBars = [];
        this.activeCollapses = [];
        this.ambientFireSprites.clear();
        this.ambientFireGlowSprites.clear();
        this.ambientFireContactGlows.clear();
        this.ambientFireFrames.clear();
        this.ambientFireAtlases.clear();
        this.ambientFireAtlasLoads.clear();
        this.ambientFireLayoutTunings.clear();
        this.ambientFireBaseScaleX.clear();
        this.ambientFireGlowBaseScaleX.clear();
        this.backgroundLayout = undefined;
        this.lavaAnimFrames = undefined;
        this.firePitOverlayFrames = undefined;
        this.firePitOverlayAtlas = undefined;
        this.firePitOverlayAtlasKey = undefined;
        this.firePitOverlayLoadStarted = false;
        this.lavaTerrainMesh = undefined;
        this.lavaPitLight = undefined;
        this.lavaFireOverlayMesh = undefined;
        this.lavaFireOverlayMeshB = undefined;
        this.lavaFireMask = undefined;
        this.lavaPitForegroundContainer = undefined;
        this.lavaGrateOverlayMesh = undefined;
        this.lavaSplashGraphics = undefined;
        this.lavaEditorOutline = undefined;
        this.lavaColorFilter = undefined;
        this.lavaFireColorFilter = undefined;
        this.lavaFire2ColorFilter = undefined;
        this.mountainTileTextures = undefined;
        this.mountainHitPointTileTextures = undefined;
        this.mountainQuarterTextures = undefined;
        this.narrowingLayers = 0;
    }
    public attachCenterTerrainSprite(): void {
        if (this.lavaTerrainMesh) {
            this.context.attachToWorldRoot(this.lavaTerrainMesh, 50);
        }
        if (this.lavaPitLight) {
            this.context.attachToWorldRoot(this.lavaPitLight, 50.5);
        }
        if (this.lavaPitForegroundContainer) {
            this.context.attachToWorldRoot(this.lavaPitForegroundContainer, 51);
        }
        if (this.centerTerrainSprite) {
            this.context.attachToWorldRoot(this.centerTerrainSprite, 50);
        }
    }
    public update(dt: number) {
        // Keep the shader's clock advancing even when updateAtmosphereFlicker isn't driving it (e.g.
        // before the fight starts), so the sconces never freeze mid-flicker.
        if (this.lightBuilt && this.lightFilter) {
            this.lightTimeSec += dt;
            updateDungeonLightUniforms(this.lightFilter, this.lightTimeSec, this.lightInward);
        }
    }
}
