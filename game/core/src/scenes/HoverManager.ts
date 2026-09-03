import { Assets, Sprite, Graphics, Matrix, Texture, Text, ColorMatrixFilter } from "pixi.js";
import {
    FightStateManager,
    IPlacement,
    Grid,
    PathHelper,
    UnitsHolder,
    AbilityFactory,
    TeamType,
    TeamVals,
    HoCMath,
    Unit,
    UnitProperties,
    GridMath,
    HoCLib,
    type IWeightedRoute,
} from "@heroesofcrypto/common";
import { SceneSettings } from "./SceneSettings";
import { PlacementManager } from "./PlacementManager";
import { TextureType, unitToTextureName } from "@/pixi/PixiUnitsFactory";
import { HOC_NUMERIC_ARIAL_FONT_FAMILY } from "../fontFamilies";
import { images } from "../generated/image_imports";
import { placementFootprintCandidates } from "./placementFootprintCandidates";
import { projectBattlefieldPoint, projectedPolyline, projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";
import { placementFacingDirectionForTeam, previewPlacementFacing, type BattlefieldUnitPreview } from "./RenderableUnit";
import { rangeTargetEdgeMarkerAngle } from "./rangeTargetEdges";
import { getShotTrajectoryStyle } from "./shotTrajectoryStyle";
import { tunedCellFillPolygon } from "./movementAreaVisual";
import { placementZonePolygon } from "../pixi/PixiDrawablePlacement";

const approachValue = (from: number, to: number, speed: number, dt: number): number => {
    if (from === to) return from;
    return from + (to - from) * Math.min(1, speed * dt);
};

export interface RangeTargetEdgeVisual {
    from: HoCMath.XY;
    to: HoCMath.XY;
    markerCenter: HoCMath.XY;
    cell: HoCMath.XY;
    side: GridMath.RangeAttackCellSide;
    notchTip: HoCMath.XY;
    shootable: boolean;
    rangeDivisor: number;
    aimPosition: HoCMath.XY;
    markerScale: number;
}

const MELEE_SWORD_ANGLE_STEP = Math.PI / 4;
/** Ranged aim paints the approved moving gold-casing trajectory from shooter to selected target edge. */
export const RANGED_ATTACK_TRAJECTORY_VISIBLE = true;
export const BASE_SHOT_CASING_SPACING = 38;
export const SHOT_CASING_SPACING_SCALE = 1.3;
export const SHOT_CASING_SPACING = BASE_SHOT_CASING_SPACING * SHOT_CASING_SPACING_SCALE;
/** Reduce only the casing artwork dimensions by seven percent; trajectory spacing stays unchanged. */
export const SHOT_CASING_SIZE_SCALE = 0.93;
/** Keeping scale fixed prevents the terminal arrow jumping while the optimal edge is recomputed. */
export const RANGE_TARGET_EDGE_SELECTED_SCALE = 1;
/** The furthest painted row is ten percent smaller; the nearest row keeps the approved current size. */
export const RANGE_TARGET_EDGE_TOP_ROW_SCALE = 0.9;
export const rangeTargetEdgeMarkerRowScale = (markerCellY: number, gridSize: number): number => {
    const topRow = Math.max(1, gridSize - 1);
    const rowProgress = Math.max(0, Math.min(1, markerCellY / topRow));
    return 1 + (RANGE_TARGET_EDGE_TOP_ROW_SCALE - 1) * rowProgress;
};
/** Shorten only the arrow artwork's long axis; its readable authored thickness stays unchanged. */
export const RANGE_TARGET_EDGE_LENGTH_SCALE = 0.8 * 0.85;
/** Move every target-edge arrow 50% of a cell inward, along the direction its point faces. */
export const RANGE_TARGET_EDGE_INWARD_OFFSET_FRACTION = 0.5;

export const rangeTargetEdgeMarkerPosition = (
    cellCenter: HoCMath.XY,
    cellSize: number,
    side: GridMath.RangeAttackCellSide,
): HoCMath.XY => {
    const offset = cellSize * RANGE_TARGET_EDGE_INWARD_OFFSET_FRACTION;
    switch (side) {
        case GridMath.RangeAttackCellSide.LEFT:
            return { x: cellCenter.x + offset, y: cellCenter.y };
        case GridMath.RangeAttackCellSide.RIGHT:
            return { x: cellCenter.x - offset, y: cellCenter.y };
        case GridMath.RangeAttackCellSide.DOWN:
            return { x: cellCenter.x, y: cellCenter.y + offset };
        case GridMath.RangeAttackCellSide.UP:
        default:
            return { x: cellCenter.x, y: cellCenter.y - offset };
    }
};

/** Authored long-axis size shared by rendering and the trajectory-to-marker join. */
export const rangeTargetEdgeMarkerDisplayLength = (cellSize: number): number =>
    Math.min(56, Math.max(42, cellSize * 0.52)) * 1.35;

/** V7 keeps the original 128-unit arrow in place and adds 57.5 units only behind its fixed head. */
const RANGE_TARGET_EDGE_ART_BASE_WIDTH = 128;
const RANGE_TARGET_EDGE_ART_WIDTH = 185.5;
const RANGE_TARGET_EDGE_ART_HEIGHT = 47;
const RANGE_TARGET_EDGE_ART_ANCHOR_X = 121.5;
const RANGE_TARGET_EDGE_NECK_X = 139.5;

const rangeTargetEdgeWideArtX = (originalX: number): number => {
    if (originalX <= 45) return originalX;
    if (originalX >= 68) return originalX + (RANGE_TARGET_EDGE_ART_WIDTH - RANGE_TARGET_EDGE_ART_BASE_WIDTH);
    const shaftProgress = (originalX - 45) / (68 - 45);
    return 45 + shaftProgress * (68 - 45 + RANGE_TARGET_EDGE_ART_WIDTH - RANGE_TARGET_EDGE_ART_BASE_WIDTH);
};

type RangeTargetEdgeArtPoint = readonly [x: number, y: number];

/** Coarse outer alpha contour of the approved cutout; transparent corners remain non-blocking. */
const RANGE_TARGET_EDGE_BASE_ART_POLYGONS: readonly (readonly RangeTargetEdgeArtPoint[])[] = [
    [
        [2, 3],
        [25, 3],
        [32, 12],
        [42, 12],
        [45, 15],
        [68, 15],
        [70, 12],
        [77, 12],
        [80, 15],
        [81, 2],
        [84, 2],
        [126, 23],
        [84, 44],
        [81, 44],
        [80, 30],
        [77, 32],
        [70, 32],
        [68, 30],
        [45, 30],
        [42, 32],
        [32, 32],
        [25, 41],
        [2, 41],
        [7, 23],
    ],
];
const RANGE_TARGET_EDGE_ART_POLYGONS: readonly (readonly RangeTargetEdgeArtPoint[])[] =
    RANGE_TARGET_EDGE_BASE_ART_POLYGONS.map((polygon) =>
        polygon.map(([x, y]) => [rangeTargetEdgeWideArtX(x), y] as const),
    );

const firstSegmentPolygonIntersection = (
    from: HoCMath.XY,
    to: HoCMath.XY,
    polygon: readonly HoCMath.XY[],
): { point: HoCMath.XY; fraction: number } | undefined => {
    const ray = { x: to.x - from.x, y: to.y - from.y };
    const cross = (a: HoCMath.XY, b: HoCMath.XY): number => a.x * b.y - a.y * b.x;
    let first: { point: HoCMath.XY; fraction: number } | undefined;

    for (let index = 0; index < polygon.length; index += 1) {
        const edgeFrom = polygon[index];
        const edgeTo = polygon[(index + 1) % polygon.length];
        const edge = { x: edgeTo.x - edgeFrom.x, y: edgeTo.y - edgeFrom.y };
        const denominator = cross(ray, edge);
        if (Math.abs(denominator) <= Number.EPSILON) continue;
        const offset = { x: edgeFrom.x - from.x, y: edgeFrom.y - from.y };
        const fraction = cross(offset, edge) / denominator;
        const edgeFraction = cross(offset, ray) / denominator;
        if (fraction < 0 || fraction > 1 || edgeFraction < 0 || edgeFraction > 1) continue;
        if (first && first.fraction <= fraction) continue;
        first = {
            point: { x: from.x + ray.x * fraction, y: from.y + ray.y * fraction },
            fraction,
        };
    }
    return first;
};

const rangeTargetEdgeArtToWorld = (
    artPoint: RangeTargetEdgeArtPoint,
    edgeCenter: HoCMath.XY,
    side: GridMath.RangeAttackCellSide,
    cellSize: number,
    cameraScale: HoCMath.XY,
    trajectoryFrom?: HoCMath.XY,
    markerScale = 1,
): HoCMath.XY => {
    // `edgeCenter` is already shifted inward in logical board space and then projected onto the painted
    // grid. Applying the inward offset here in projected X/Y would pull top/bottom arrows off the centreline
    // of perspective cells.
    const position = edgeCenter;
    const angle = trajectoryFrom
        ? Math.atan2(edgeCenter.y - trajectoryFrom.y, edgeCenter.x - trajectoryFrom.x)
        : rangeTargetEdgeMarkerAngle(side);
    const zoomX = Math.abs(cameraScale.x) || 1;
    const zoomY = Math.abs(cameraScale.y) || zoomX;
    const screenAngle = Math.atan2(-Math.sin(angle) * zoomY, Math.cos(angle) * zoomX);
    const cos = Math.cos(screenAngle);
    const sin = Math.sin(screenAngle);
    // Match the existing marker's screen size: its authored world scale was multiplied by camera X.
    // The generalized transform below then cancels only the camera's non-uniform distortion.
    const artScale = (rangeTargetEdgeMarkerDisplayLength(cellSize) * zoomX) / RANGE_TARGET_EDGE_ART_BASE_WIDTH;
    const localX =
        (artPoint[0] - RANGE_TARGET_EDGE_ART_ANCHOR_X) * artScale * RANGE_TARGET_EDGE_LENGTH_SCALE * markerScale;
    const localY = (artPoint[1] - RANGE_TARGET_EDGE_ART_HEIGHT / 2) * artScale * markerScale;
    return {
        x: position.x + (localX * cos - localY * sin) / zoomX,
        y: position.y + (-localX * sin - localY * cos) / zoomY,
    };
};

/** The blue-marked point where the broad arrowhead joins its shaft. */
export const rangeTargetEdgeMarkerNeckPoint = (
    edgeCenter: HoCMath.XY,
    side: GridMath.RangeAttackCellSide,
    cellSize: number,
    cameraScale: HoCMath.XY,
): HoCMath.XY =>
    rangeTargetEdgeArtToWorld(
        [RANGE_TARGET_EDGE_NECK_X, RANGE_TARGET_EDGE_ART_HEIGHT / 2],
        edgeCenter,
        side,
        cellSize,
        cameraScale,
    );

/**
 * Aim for the arrowhead/shaft join, but stop at the first opaque part of the marker encountered earlier.
 * This keeps a diagonal casing rail from painting across the head, shaft or fletching on its way there.
 */
export const rangeTargetEdgeTrajectoryEndpoint = (
    trajectoryFrom: HoCMath.XY,
    edgeCenter: HoCMath.XY,
    side: GridMath.RangeAttackCellSide,
    cellSize: number,
    cameraScale: HoCMath.XY,
    markerScale = 1,
): HoCMath.XY => {
    const neckPoint = rangeTargetEdgeArtToWorld(
        [RANGE_TARGET_EDGE_NECK_X, RANGE_TARGET_EDGE_ART_HEIGHT / 2],
        edgeCenter,
        side,
        cellSize,
        cameraScale,
        trajectoryFrom,
        markerScale,
    );
    let firstContact: { point: HoCMath.XY; fraction: number } | undefined;
    for (const artPolygon of RANGE_TARGET_EDGE_ART_POLYGONS) {
        const worldPolygon = artPolygon.map((point) =>
            rangeTargetEdgeArtToWorld(point, edgeCenter, side, cellSize, cameraScale, trajectoryFrom, markerScale),
        );
        const contact = firstSegmentPolygonIntersection(trajectoryFrom, neckPoint, worldPolygon);
        if (!contact || (firstContact && firstContact.fraction <= contact.fraction)) continue;
        firstContact = contact;
    }
    return firstContact?.point ?? neckPoint;
};

export interface CameraCompensatedSpriteTransform {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
}

/**
 * Local sprite matrix whose final on-screen transform is an undistorted rotation + uniform scale.
 * This cancels the battlefield camera's deliberately different X/Y zoom without changing world position.
 */
export const cameraCompensatedSpriteTransform = (
    worldPosition: HoCMath.XY,
    screenAngle: number,
    screenScale: number,
    cameraScale: HoCMath.XY,
): CameraCompensatedSpriteTransform => {
    const zoomX = Math.abs(cameraScale.x) || 1;
    const zoomY = Math.abs(cameraScale.y) || zoomX;
    const cos = Math.cos(screenAngle);
    const sin = Math.sin(screenAngle);
    return {
        a: (screenScale * cos) / zoomX,
        b: (-screenScale * sin) / zoomY,
        c: (-screenScale * sin) / zoomX,
        d: (-screenScale * cos) / zoomY,
        tx: worldPosition.x,
        ty: worldPosition.y,
    };
};
// The visible blade-to-pommel diagonal inside the 20x24 cursor artwork.
const MELEE_SWORD_ART_LENGTH = 29;
// The source is 20x24, so its painted blade is not geometrically aligned to a perfect 45-degree
// square diagonal. Measure the actual pommel -> tip vector; subtracting 135deg made every supposedly
// horizontal/vertical marker visibly lean by several degrees.
const MELEE_SWORD_NATIVE_WORLD_ANGLE = Math.atan2(23, -18);

// Keep the whole prediction group (damage, losses and skull) at one fixed visual size for every creature.
// The target point is the top of the creature's stack flag, so the group is shifted upward far enough for
// its bottom edge to clear the flag instead of covering either the banner or the creature artwork.
const DAMAGE_PREDICTION_SCALE = 1.3;
const DAMAGE_PREDICTION_FONT_SIZE = 24;
const DAMAGE_PREDICTION_STROKE_WIDTH = 4;
const DAMAGE_PREDICTION_ROW_SPACING = 28;
const DAMAGE_PREDICTION_GROUND_GAP = 6;
const DAMAGE_PREDICTION_KILL_ICON_SCALE = 1.3;
const DAMAGE_PREDICTION_RANGE_ICON_SCALE = 1.45;
// Damage forecasts are pointer UI, not world scenery. Parenting the whole block to the camera's final
// sibling makes the foreground guarantee structural: no depth-sorted barrel, unit or target silhouette can
// cover the numbers or either icon.
const DAMAGE_PREDICTION_OVERLAY_Z_INDEX = 100;

export const damagePredictionVerticalScaleCompensation = (cameraScale: HoCMath.XY): number => {
    const zoomX = Math.abs(cameraScale.x) || 1;
    const zoomY = Math.abs(cameraScale.y) || zoomX;
    return zoomX / zoomY;
};

export const damagePredictionLayout = (
    _isLargeTarget: boolean,
    hasKills: boolean,
    verticalScaleCompensation = 1,
): { scale: number; verticalScale: number; centerOffsetY: number } => {
    const scale = DAMAGE_PREDICTION_SCALE;
    const verticalScale = scale * verticalScaleCompensation;
    const rowHeight = (DAMAGE_PREDICTION_FONT_SIZE + DAMAGE_PREDICTION_STROKE_WIDTH) * verticalScale;
    const blockHeight = rowHeight + (hasKills ? DAMAGE_PREDICTION_ROW_SPACING * verticalScale : 0);
    return {
        scale,
        verticalScale,
        // Battlefield coordinates are Y-up, therefore a positive offset places the label above the flag.
        centerOffsetY: blockHeight / 2 + DAMAGE_PREDICTION_GROUND_GAP,
    };
};

export interface DamagePredictionAnchorState {
    targetKey: string;
    position: HoCMath.XY;
}

/** Keep a prediction motionless while the pointer remains on the same target. */
export const pinnedDamagePredictionAnchor = (
    current: DamagePredictionAnchorState | undefined,
    targetKey: string,
    position: HoCMath.XY,
): DamagePredictionAnchorState =>
    current?.targetKey === targetKey ? current : { targetKey, position: { x: position.x, y: position.y } };

const THIEF_PREVIEW_VISIBLE_HEIGHT_RATIO = 186 / 192;

const usesTallThiefPreview = (props: UnitProperties): boolean =>
    props.size === 1 && (props.name === "Thief" || props.name === "Scavenger");

/**
 * Footprint sides read straight off raw properties. Unit.getFootprintWidth() is not available here: the
 * hover surfaces preview bench selections, relayed opponent intents and snapshot payloads, any of which
 * can be a plain UnitProperties bag that predates footprints and carries only `size`.
 */
export const footprintWidthOf = (props: UnitProperties): number =>
    GridMath.normalizeFootprintSide(props.footprint_width, GridMath.normalizeFootprintSide(props.size));

export const footprintHeightOf = (props: UnitProperties): number =>
    GridMath.normalizeFootprintSide(props.footprint_height, GridMath.normalizeFootprintSide(props.size));

/** Whether these properties describe a body that covers more than its anchor cell. */
const occupiesManyCells = (props: UnitProperties): boolean =>
    footprintWidthOf(props) > 1 || footprintHeightOf(props) > 1;

const unitPreviewScale = (props: UnitProperties, texture: Texture, cellSize: number): number => {
    if (usesTallThiefPreview(props)) {
        return (cellSize * 1.5) / (Math.max(1, texture.height) * THIEF_PREVIEW_VISIBLE_HEIGHT_RATIO);
    }
    // 128 authored pixels is one cell of board art, so a ghost spans as many of them as its footprint is
    // WIDE — 128 for a 1x1 and 256 for a 2x2, the two numbers this used to hard-code off `size`. Height
    // deliberately follows the texture's own aspect: the art tiers are square (_128 / _256) and none of
    // them is rectangular yet, so a wide creature's vertical framing stays RenderableUnit's authored
    // profile rather than a stretch applied here.
    return (128 * footprintWidthOf(props)) / Math.max(1, texture.width);
};

const unitPreviewY = (props: UnitProperties, centerY: number, cellSize: number): number =>
    usesTallThiefPreview(props) ? centerY + cellSize * 0.5 : centerY;

/** Cells occupied by a unit whose battlefield anchor is the top-right cell of its footprint. */
export const combatFootprintCellsForBase = (base: HoCMath.XY, width: number, height = width): HoCMath.XY[] => {
    const cells: HoCMath.XY[] = [];
    for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) cells.push({ x: base.x - dx, y: base.y - dy });
    }
    return cells;
};

export const snapMeleeSwordAngle = (angle: number): number =>
    Math.round(angle / MELEE_SWORD_ANGLE_STEP) * MELEE_SWORD_ANGLE_STEP;

/** Compact original cursor: half a cell, regardless of side, projection, or attacker offset. */
export const meleeSwordDisplayLength = (cellSize: number): number => cellSize * 0.5;

/** Resolve the eight-way facing from logical cells, never from an authored sprite's shifted foot anchor. */
export const meleeSwordFacingAngle = (landingCenter: HoCMath.XY, targetCenter: HoCMath.XY): number =>
    snapMeleeSwordAngle(Math.atan2(targetCenter.y - landingCenter.y, targetCenter.x - landingCenter.x));

/** Keep the blade tip on the target anchor while the sword body stays outside the target footprint. */
export const meleeSwordSpriteCenter = (
    targetAnchor: HoCMath.XY,
    snappedAngle: number,
    displayLength: number,
): HoCMath.XY => ({
    x: targetAnchor.x - Math.cos(snappedAngle) * (displayLength / 2),
    y: targetAnchor.y - Math.sin(snappedAngle) * (displayLength / 2),
});

/**
 * Intersection of the landing-cell -> target-centre ray with the target's footprint rectangle.
 * Cardinal landings meet the middle of an edge; diagonal landings meet the corresponding corner.
 *
 * The two half-extents are separate because a rectangular body reaches further on its long axis; they
 * are equal for every square shape, which is why the callers used to pass a single number.
 */
export const meleeSwordTargetPoint = (
    landingCenter: HoCMath.XY,
    targetCenter: HoCMath.XY,
    targetHalfExtentX: number,
    targetHalfExtentY: number = targetHalfExtentX,
): HoCMath.XY => {
    const dx = landingCenter.x - targetCenter.x;
    const dy = landingCenter.y - targetCenter.y;
    const maxAxis = Math.max(Math.abs(dx), Math.abs(dy));
    if (maxAxis === 0) return { ...targetCenter };
    return {
        x: targetCenter.x + (dx / maxAxis) * targetHalfExtentX,
        y: targetCenter.y + (dy / maxAxis) * targetHalfExtentY,
    };
};

export interface ISandboxHoverContext {
    grid: Grid;
    pathHelper: PathHelper;
    unitsHolder: UnitsHolder;
    sceneSettings: SceneSettings;
    placementManager: PlacementManager;
    abilityFactory: AbilityFactory;

    // Callbacks
    texAny(name: string): Texture | undefined;
    attachToWorldRoot(obj: Sprite | Graphics | Text, zIndex: number): void;
    attachToCursorOverlay(obj: Sprite | Text, zIndex?: number): void;
    getPlacement(teamType: TeamType, placementIndex: number): IPlacement | undefined;
    // Wait, IPlacement IS imported in Sandbox.ts from common.

    // State access
    getMouseWorld(): HoCMath.XY;
    getCameraScale(): HoCMath.XY;
    getCurrentActiveUnit(): Unit | undefined;
    getCurrentActivePathHashes(): Set<number> | undefined;
    getCurrentActiveKnownPaths(): Map<number, IWeightedRoute[]> | undefined;
    getDraggingUnitId(): string | undefined;
    getDraggingUnitTeam(): TeamType | undefined;
    getPlacementPreviewUnit(): Unit | undefined;
    getSelectedUnitProperties(): UnitProperties | undefined;
    hasActiveSelection(): boolean;
}

export class HoverManager {
    private context: ISandboxHoverContext;
    // State moved from Sandbox
    public hoverPlacementCell?: HoCMath.XY = undefined;
    public hoverPlacementCellTeam?: TeamType = undefined;
    public hoverSelectedCells?: HoCMath.XY[];
    public hoverSelectedCellsSwitchToRed = false;
    public hoverBattlefieldFootprintCells?: HoCMath.XY[];
    // AI Support
    public hoverAttackUnits?: Unit[][];
    public hoverAttackFromCell?: HoCMath.XY = undefined;
    public hoverSpellCell?: HoCMath.XY = undefined;
    public hoverAbilityCell?: HoCMath.XY = undefined;
    private auraVisuals: Graphics[] = [];
    public hoverAttackTargetUnit?: Unit; // New state for attack target
    private hoverSilhouette?: Sprite;
    private hoverSilhouetteOutline?: Sprite;
    private hoverSilhouetteKey?: string;
    private phantomGrayscaleFilter?: ColorMatrixFilter;
    // Dedicated sprites for the opponent's relayed move aim. Kept separate from the local
    // hover silhouette so the two never clobber each other's visibility/position.
    private opponentIntentSilhouette?: Sprite;
    private opponentIntentOutline?: Sprite;
    private opponentIntentKey?: string;
    private hoverTargetSilhouette?: Sprite; // For enemy unit red highlight
    public hoveredUnitHighlight?: { x: number; y: number; w: number; h: number };
    public hoveredUnitId?: string;
    private hoverGlowPhase = 0;
    private boardHoverScale = 1;
    private boardHoverTargetScale = 1;
    private boardHoverYOffset = 0;
    private boardHoverTargetYOffset = 0;
    public boardHoverProps?: UnitProperties;
    public boardHoverCenter?: HoCMath.XY;
    private lastPlacementUnitId?: string;
    private lastPlacementTimestampSec = 0;
    private readonly hoverRearmDelaySec = 2.0;
    private auraGraphics: Graphics;
    private aoeGraphics: Graphics;
    private hoverAttackSwordTexture?: Texture;
    private hoverRangeTargetEdgeTexture?: Texture;
    private hoverShotHammeredBronzeCasingTexture?: Texture;
    /**
     * Invisible child of the app-owned cursor overlay. PixiScene empties that persistent layer whenever a
     * scene is replaced, so its destroyed event gives this helper a lifecycle signal without making the
     * shared overlay itself scene-owned.
     */
    private readonly lifecycleMarker: Sprite;
    private destroyed = false;
    public constructor(context: ISandboxHoverContext) {
        this.context = context;
        this.auraGraphics = new Graphics();
        this.aoeGraphics = new Graphics();
        this.lifecycleMarker = new Sprite(Texture.EMPTY);
        this.lifecycleMarker.visible = false;
        this.lifecycleMarker.eventMode = "none";
        this.lifecycleMarker.once("destroyed", () => this.releaseOwnedResources());
        // Some headless geometry tests intentionally provide no render attachment surface.
        this.context.attachToCursorOverlay?.(this.lifecycleMarker, Number.MIN_SAFE_INTEGER);
        // Pixi v8's Texture.from(string) only resolves textures already present in its cache. The cursor
        // artwork comes from the Google Drive-backed generated image set; load it explicitly so the melee
        // geometry never starts with Texture.EMPTY.
        //
        // Both loads are best-effort. They are cursor decoration — the sword and the terminal target arrow
        // — and every geometry decision in this class works without them. Pixi's asset
        // pipeline reaches for `document` while resolving a URL, so it throws outright wherever there is no
        // DOM, and an unguarded load took the whole HoverManager down with it rather than costing a cursor
        // ornament.
        this.loadCursorTexture(images.cursor_melee, (texture) => {
            // Keep the tiny pixel-art sword crisp when it is enlarged to span a grid-cell segment.
            this.hoverAttackSwordTexture = texture;
        });
        this.loadCursorTexture(images.range_target_arrow_v7_gold_wide_crisp, (texture) => {
            // The high-resolution source carries its final gold/bronze palette; never recolor it at runtime.
            texture.source.scaleMode = "linear";
            this.hoverRangeTargetEdgeTexture = texture;
        });
        this.loadCursorTexture(images.shot_trajectory_hammered_bronze_casing_sprite_v4, (texture) => {
            this.hoverShotHammeredBronzeCasingTexture = texture;
        });
    }
    /** Best-effort cursor art: never let a decoration failure break hover construction. */
    private loadCursorTexture(asset: string, apply: (texture: Texture) => void): void {
        try {
            void Assets.load<Texture>(asset)
                .then((texture) => {
                    // A scene can be replaced while this optional image is still decoding. Do not let that
                    // completion retain or mutate the retired HoverManager after its persistent layer clears.
                    if (this.destroyed) return;
                    texture.source.scaleMode = "nearest";
                    apply(texture);
                })
                .catch(() => undefined);
        } catch {
            // No asset pipeline here (headless, or a environment without a DOM). Geometry is unaffected.
        }
    }
    private releaseOwnedResources(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        // Display objects on worldRoot are released by Sandbox and cursor-overlay objects by PixiScene.
        // Filters are independent GPU resources and Container.destroy() only detaches them.
        this.phantomGrayscaleFilter?.destroy();
        this.phantomGrayscaleFilter = undefined;
    }
    private isGraphicsUsable(graphics?: Graphics): graphics is Graphics {
        const state = graphics as (Graphics & { destroyed?: boolean; context?: unknown }) | undefined;
        return !!state && state.destroyed !== true && state.context !== null;
    }
    private safeClearGraphics(graphics?: Graphics): boolean {
        if (!this.isGraphicsUsable(graphics)) {
            return false;
        }
        try {
            graphics.clear();
            return true;
        } catch {
            return false;
        }
    }
    private safeAttachGraphics(graphics: Graphics, zIndex: number): boolean {
        if (!this.isGraphicsUsable(graphics)) {
            return false;
        }
        try {
            this.context.attachToWorldRoot(graphics, zIndex);
            return true;
        } catch {
            return false;
        }
    }
    private getLiveUnitPreview(
        props: UnitProperties,
        logicalPosition: HoCMath.XY,
        preferredUnit?: Unit,
    ): BattlefieldUnitPreview | undefined {
        const active = (preferredUnit ?? this.context.getCurrentActiveUnit()) as
            | (Unit & {
                  getBattlefieldPreviewAt?: (
                      position: HoCMath.XY,
                      gridSettings: ReturnType<SceneSettings["getGridSettings"]>,
                  ) => BattlefieldUnitPreview | undefined;
              })
            | undefined;
        if (!active?.getBattlefieldPreviewAt) return undefined;
        const activeProps = active.getUnitProperties();
        // The live frame may only be cloned onto a preview that stands on the same rectangle. Comparing
        // `size` collapsed 2x1 and 2x2 onto the same number, so a stack of one shape could borrow the
        // other's transform.
        if (
            activeProps.name !== props.name ||
            footprintWidthOf(activeProps) !== footprintWidthOf(props) ||
            footprintHeightOf(activeProps) !== footprintHeightOf(props)
        ) {
            return undefined;
        }
        return active.getBattlefieldPreviewAt(logicalPosition, this.context.sceneSettings.getGridSettings());
    }
    private applyLiveUnitPreview(
        sprite: Sprite,
        outline: Sprite,
        preview: BattlefieldUnitPreview,
        outlineGrowth = 1.06,
    ): void {
        sprite.texture = preview.texture;
        outline.texture = preview.texture;
        sprite.anchor.set(preview.anchorX, preview.anchorY);
        outline.anchor.set(preview.anchorX, preview.anchorY);
        sprite.scale.set(preview.scaleX, preview.scaleY);
        outline.scale.set(preview.scaleX * outlineGrowth, preview.scaleY * outlineGrowth);
        sprite.position.set(preview.x, preview.y);
        outline.position.set(preview.x, preview.y);
        sprite.rotation = preview.rotation;
        outline.rotation = preview.rotation;
    }
    /** Render a preview as the untouched source cutout with grayscale as its only visual change. */
    private applyPhantomAppearance(sprite: Sprite, legacyBacking: Sprite): void {
        if (!this.phantomGrayscaleFilter) {
            this.phantomGrayscaleFilter = new ColorMatrixFilter();
            this.phantomGrayscaleFilter.desaturate();
        }
        sprite.filters = [this.phantomGrayscaleFilter];
        sprite.tint = 0xffffff;
        sprite.alpha = 1;
        sprite.visible = true;

        // Older previews used a second enlarged white sprite as an outline/backing. Besides changing the
        // creature's contour, that layer exposed rectangular matte pixels in otherwise transparent art.
        legacyBacking.visible = false;
        legacyBacking.filters = null;
    }
    /** Placement carries the real creature onto the board: full colour, full opacity, no phantom layers. */
    private applyPlacementAppearance(sprite: Sprite, legacyBacking: Sprite): void {
        sprite.filters = null;
        sprite.tint = 0xffffff;
        sprite.alpha = 1;
        sprite.visible = true;
        legacyBacking.visible = false;
        legacyBacking.filters = null;
    }
    private ensureAuraGraphics(): Graphics | undefined {
        if (this.isGraphicsUsable(this.auraGraphics)) {
            return this.auraGraphics;
        }
        const graphics = new Graphics();
        if (!this.safeAttachGraphics(graphics, 51)) {
            graphics.destroy();
            return undefined;
        }
        this.auraGraphics = graphics;
        return graphics;
    }
    private ensureAOEGraphics(): Graphics | undefined {
        if (this.isGraphicsUsable(this.aoeGraphics)) {
            return this.aoeGraphics;
        }
        const graphics = new Graphics();
        if (!this.safeAttachGraphics(graphics, 4500)) {
            graphics.destroy();
            return undefined;
        }
        this.aoeGraphics = graphics;
        return graphics;
    }
    public onCameraChanged(): void {
        if (this.hoverSilhouette) this.context.attachToWorldRoot(this.hoverSilhouette, 110);
        if (this.hoverSilhouetteOutline) this.context.attachToWorldRoot(this.hoverSilhouetteOutline, 109);
        const auraGraphics = this.ensureAuraGraphics();
        const aoeGraphics = this.ensureAOEGraphics();
        if (auraGraphics) this.safeAttachGraphics(auraGraphics, 51); // Below units and movement path
        if (aoeGraphics) this.safeAttachGraphics(aoeGraphics, 4500); // Above units: AOE splash area
        if (this.isGraphicsUsable(this.spellBeam)) this.safeAttachGraphics(this.spellBeam, 2199);
        if (this.isGraphicsUsable(this.spellBadgeRing)) this.safeAttachGraphics(this.spellBadgeRing, 2202);
        if (this.spellBadgeIcon) this.context.attachToWorldRoot(this.spellBadgeIcon, 2203);
        if (this.spellBadgeText) this.context.attachToWorldRoot(this.spellBadgeText, 2203);
    }
    public clearAuraVisuals(): void {
        this.safeClearGraphics(this.auraGraphics);
    }
    public clearAOEArea(): void {
        this.safeClearGraphics(this.aoeGraphics);
    }
    /** Paint a single translucent square over the whole area-of-effect splash (its bounding box). */
    public drawAOEArea(cells: HoCMath.XY[]): void {
        const aoeGraphics = this.ensureAOEGraphics();
        if (!aoeGraphics) return;
        aoeGraphics.clear();
        if (!cells.length) return;
        const gs = this.context.sceneSettings.getGridSettings();
        const half = gs.getCellSize() / 2;
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const c of cells) {
            const pos = GridMath.getPositionForCell(c, gs.getMinX(), gs.getStep(), gs.getHalfStep());
            if (!pos) continue;
            minX = Math.min(minX, pos.x - half);
            maxX = Math.max(maxX, pos.x + half);
            minY = Math.min(minY, pos.y - half);
            maxY = Math.max(maxY, pos.y + half);
        }
        if (!Number.isFinite(minX)) return;
        aoeGraphics
            .poly(projectedRectPoints(minX + 1, minY + 1, maxX - 1, maxY - 1, gs))
            .fill({ color: 0xff3333, alpha: 0.18 })
            .stroke({ width: 2, color: 0xff6666, alpha: 0.85 });
    }
    public clear(): void {
        this.hoverAttackUnits = undefined;
        this.hoverAttackFromCell = undefined;
        this.hoverPlacementCell = undefined;
        this.hoverSelectedCells = undefined;
        this.hoverBattlefieldFootprintCells = undefined;
        this.hoverSpellCell = undefined;
        this.hoverAbilityCell = undefined;
        this.hoverAttackTargetUnit = undefined;
        this.hoveredUnitId = undefined;
        this.clearAuraVisuals();
        this.clearAOEArea();
    }
    public drawAuraArea(
        center: HoCMath.XY,
        radius: number,
        isBuff: boolean,
        footprintWidth: number,
        footprintHeight = footprintWidth,
        alphaMultiplier = 1.0,
    ): void {
        // Aesthetic Configuration
        const color = isBuff ? 0x00ff88 : 0xff4444; // Green vs Red
        const fillColor = isBuff ? 0x00ff88 : 0xff0000;
        const fillAlpha = 0.15 * alphaMultiplier;
        const strokeAlpha = 0.6 * alphaMultiplier;
        const strokeWidth = 2;

        const gs = this.context.sceneSettings.getGridSettings();
        // The aura reaches `radius` out from the BODY, so each axis is widened by that axis' own half
        // footprint: half a cell for a side of 1, a whole cell for a side of 2 — the previous
        // isSmallUnit branch, once per axis instead of once for both.
        const extentX = radius + GridMath.normalizeFootprintSide(footprintWidth) * gs.getHalfStep();
        const extentY = radius + GridMath.normalizeFootprintSide(footprintHeight) * gs.getHalfStep();

        const auraGraphics = this.ensureAuraGraphics();
        if (!auraGraphics) return;
        auraGraphics
            .poly(
                projectedRectPoints(center.x - extentX, center.y - extentY, center.x + extentX, center.y + extentY, gs),
            )
            .fill({ color: fillColor, alpha: fillAlpha })
            .stroke({ width: strokeWidth, color: color, alpha: strokeAlpha });
    }
    public drawAttackRange(center: HoCMath.XY, radius: number): void {
        const color = 0xffff00; // Yellow (matches Active/Hovered Range)
        const alpha = 0.8;
        const width = 2;

        const auraGraphics = this.ensureAuraGraphics();
        if (!auraGraphics) return;
        const points: HoCMath.XY[] = [];
        const segments = 96;
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
        }
        auraGraphics.poly(projectedPolyline(points, this.context.sceneSettings.getGridSettings())).stroke({
            width,
            color,
            alpha,
        });
    }
    public update(dt: number): void {
        this.hoverGlowPhase += dt * (5 / 3);
        if (this.animatedRangeArrow) {
            const arrow = this.animatedRangeArrow;
            this.drawAttackArrow(arrow.from, arrow.to, arrow.continuationTo, arrow.smokeFrom, "arrow", false);
        }
        this.updateBoardHoverTween(dt);
        this.updatePlacementHoverRearm();
    }
    public setLastPlacement(unitId: string | undefined) {
        this.lastPlacementUnitId = unitId;
        if (unitId) {
            this.lastPlacementTimestampSec = HoCLib.getTimeMillis() / 1000;
        } else {
            this.lastPlacementTimestampSec = 0;
        }
    }
    public resetBoardHoverState(): void {
        this.boardHoverProps = undefined;
        this.boardHoverCenter = undefined;
        this.boardHoverTargetScale = 1;
        this.boardHoverTargetYOffset = 0;
    }
    private updateBoardHoverTween(dt: number): void {
        if (!dt) return;
        this.boardHoverScale = approachValue(this.boardHoverScale, this.boardHoverTargetScale, 8, dt);
        this.boardHoverYOffset = approachValue(this.boardHoverYOffset, this.boardHoverTargetYOffset, 8, dt);

        if (this.boardHoverProps && this.boardHoverCenter && !this.context.hasActiveSelection()) {
            this.updateBoardHoverSilhouette(this.boardHoverProps, this.boardHoverCenter);
        }
    }
    private drawFootprintCells(gfx: Graphics, cells: HoCMath.XY[], invalid: boolean): void {
        const gs = this.context.sceneSettings.getGridSettings();
        const size = gs.getCellSize();
        const inset = Math.max(2, size * 0.055);
        const pulse = (Math.sin(this.hoverGlowPhase * 1.2) + 1) / 2;
        const strokeColor = invalid ? 0xff5555 : 0xffe2a0;
        const fillColor = invalid ? 0xff3333 : 0xffc85a;
        const fillAlpha = invalid ? 0.25 : 0.16 + pulse * 0.06;
        const strokeAlpha = invalid ? 1 : 0.82 + pulse * 0.18;

        // Multi-cell creatures need one readable footprint, not a separate framed tile under every body
        // section. Picking only the four outer corners removes the internal 2x1 / 2x2 seams while retaining
        // the same visual inset as the established 1x1 support-cell treatment.
        const polygon =
            cells.length === 1 ? tunedCellFillPolygon(cells[0], gs, inset / size) : placementZonePolygon(cells, gs);
        gfx.poly(polygon)
            .fill({ color: fillColor, alpha: fillAlpha })
            .stroke({ width: Math.max(2, size * 0.035), color: strokeColor, alpha: strokeAlpha });
    }
    public drawHoverPlacementCell(gfx: Graphics): void {
        const cells = this.hoverSelectedCells;
        if (!cells || cells.length === 0) return;
        // The phantom shows the artwork, while these cells show the exact board footprint that will be
        // occupied after the click. Keep them visible for valid placement too — especially for 2x1 and 2x2
        // creatures whose support cells cannot be inferred reliably from the tall rendered silhouette.
        this.drawFootprintCells(gfx, cells, this.hoverSelectedCellsSwitchToRed);
    }
    public drawHoverBattlefieldFootprint(gfx: Graphics): void {
        const cells = this.hoverBattlefieldFootprintCells;
        if (!cells || cells.length === 0) return;
        this.drawFootprintCells(gfx, cells, false);
    }
    public isCellReachableForActiveUnit(cell: HoCMath.XY): boolean {
        const currentActiveUnit = this.context.getCurrentActiveUnit();
        const currentActivePathHashes = this.context.getCurrentActivePathHashes();

        if (!currentActiveUnit) return false;
        if (!currentActivePathHashes || !currentActivePathHashes.size) return false;

        if (!GridMath.isCellWithinGrid(this.context.sceneSettings.getGridSettings(), cell)) return false;

        const props = currentActiveUnit.getUnitProperties();
        const hash = (x: number, y: number) => (x << 4) | y;

        // A one-cell body is reachable exactly when its own cell is in the path set; anything larger has to
        // find a whole footprint that fits, which is what the candidate finder answers.
        if (!occupiesManyCells(props)) {
            return currentActivePathHashes.has(hash(cell.x, cell.y));
        }

        return this.findLargeUnitMoveCandidate(cell) !== null;
    }
    // Copied from Sandbox (assumed private there)
    public findLargeUnitMoveCandidate(cell: HoCMath.XY): HoCMath.XY[] | null {
        const currentActiveUnit = this.context.getCurrentActiveUnit();
        const currentActivePathHashes = this.context.getCurrentActivePathHashes();
        const currentActiveKnownPaths = this.context.getCurrentActiveKnownPaths();
        if (!currentActiveUnit || !currentActivePathHashes) return null;

        const hash = (x: number, y: number) => (x << 4) | y;
        const gs = this.context.sceneSettings.getGridSettings();

        const props = currentActiveUnit.getUnitProperties();
        const width = footprintWidthOf(props);
        const height = footprintHeightOf(props);

        // Every footprint that COVERS the hovered cell is a candidate landing: the cursor may sit on any
        // of the body's W*H cells. The candidate order decides which landing wins when several are legal,
        // so it is kept exactly as it was — cursor cell as the block's minimum corner first, then the
        // block sliding down and left over it — which is also the order the placement ghost enumerates.
        for (let cursorDx = 0; cursorDx < width; cursorDx++) {
            for (let cursorDy = 0; cursorDy < height; cursorDy++) {
                const anchor = { x: cell.x - cursorDx + width - 1, y: cell.y - cursorDy + height - 1 };
                // Reject the whole block before any of its cells is hashed: an off-board cell packs into
                // (x << 4) | y as a key that collides with a real one ((-1 << 4) | y === -1 for every y).
                if (!GridMath.isFootprintWithinGrid(gs, anchor, width, height)) continue;

                // Ascending from the minimum corner, so the LAST cell is the anchor. Callers hand this
                // list straight to executeMoveSequence as the move path, which keys the route metadata off
                // its final cell — and only the anchor is a key in knownPaths.
                const footprint: HoCMath.XY[] = [];
                for (let dx = 0; dx < width; dx++) {
                    for (let dy = 0; dy < height; dy++) {
                        footprint.push({ x: anchor.x - width + 1 + dx, y: anchor.y - height + 1 + dy });
                    }
                }
                if (!footprint.every((c) => currentActivePathHashes.has(hash(c.x, c.y)))) continue;
                if (!currentActiveKnownPaths?.has(hash(anchor.x, anchor.y))) continue;

                return footprint;
            }
        }

        return null;
    }
    public getHoverSelectedCells(): HoCMath.XY[] | undefined {
        return this.hoverSelectedCells;
    }
    public getHoverSilhouette(): Sprite | undefined {
        return this.hoverSilhouette;
    }
    public drawHoveredUnitHighlight(gfx: Graphics): void {
        const r = this.hoveredUnitHighlight;
        if (!r) return;
        const cx = r.x + r.w * 0.5;
        const cy = r.y + r.h * 0.5;
        const iconSide = Math.max(r.w, r.h);
        const pulse = (Math.sin(this.hoverGlowPhase) + 1) / 2;
        const pulseFactor = 0.05 + pulse * 0.1;
        const baseW = iconSide * 0.95;
        const baseH = iconSide * 0.28;
        const yOffset = iconSide * 0.48;
        const underLayers = 5;
        for (let i = 0; i < underLayers; i++) {
            const t = (i + 1) / underLayers;
            const w = baseW * (1 + 0.3 * t) * (1 + pulseFactor);
            const h = baseH * (1 + 0.4 * t) * (1 + pulseFactor);
            const alpha = 0.3 * (1 - t * 0.75) * (1 - pulseFactor * 0.5);

            // Check for Active Unit
            const isActive = this.hoveredUnitId && this.context.getCurrentActiveUnit()?.getId() === this.hoveredUnitId;
            const color = isActive ? 0xffffff : 0xffffff;

            gfx.ellipse(cx, cy - yOffset, w * 0.5, h * 0.5).fill({ color, alpha });
        }
        const baseR = iconSide * 0.6;
        const aroundLayers = 6;
        for (let i = 0; i < aroundLayers; i++) {
            const t = (i + 1) / aroundLayers;
            const rg = baseR * (1 + 0.45 * t) * (1 + pulseFactor);
            const alpha = 0.22 * (1 - t * 0.8) * (1 - pulseFactor * 0.5);

            const isActive = this.hoveredUnitId && this.context.getCurrentActiveUnit()?.getId() === this.hoveredUnitId;
            const color = isActive ? 0xffffff : 0xffffff;

            gfx.circle(cx, cy, rg).fill({ color, alpha });
        }
    }
    private updatePlacementHoverRearm(): void {
        if (!this.lastPlacementUnitId) return;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.hasFightStarted() || this.context.hasActiveSelection()) {
            this.lastPlacementUnitId = undefined;
            return;
        }
        if (this.hoveredUnitHighlight) return;
        const nowSec = HoCLib.getTimeMillis() / 1000;
        if (nowSec - this.lastPlacementTimestampSec < this.hoverRearmDelaySec) return;
        const unit = this.context.unitsHolder.getAllUnits().get(this.lastPlacementUnitId);
        if (!unit) {
            this.lastPlacementUnitId = undefined;
            return;
        }

        // We need getHighlightRectForUnit. It was likely a private method in Sandbox.
        // We can implement it here or ask context.
        // It seems simple enough to implement if we have the unit.
        const rect = this.getHighlightRectForUnit(unit);

        if (!rect) {
            this.lastPlacementUnitId = undefined;
            return;
        }
        const p = this.context.getMouseWorld();
        const inside = p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
        if (inside) {
            this.hoveredUnitHighlight = rect;
        }
        this.lastPlacementUnitId = undefined;
    }
    public calculateActiveSelectionHighlight(): void {
        const draggingId = this.context.getDraggingUnitId();
        if (!draggingId) {
            this.hoveredUnitHighlight = undefined;
            this.hoveredUnitId = undefined;
            return;
        }

        const unit = this.context.unitsHolder.getAllUnits().get(draggingId);
        if (!unit) {
            this.hoveredUnitHighlight = undefined;
            this.hoveredUnitId = undefined;
            return;
        }

        // Reuse the logic used for passive hover to set the highlight rect
        this.hoveredUnitHighlight = this.getHighlightRectForUnit(unit);
        this.hoveredUnitId = unit.getId();
    }
    public getHighlightRectForUnit(unit: Unit): { x: number; y: number; w: number; h: number } | undefined {
        // Use the exact world position of the unit, which is the CENTRE of its whole footprint.
        const pos = unit.getPosition();
        const gs = this.context.sceneSettings.getGridSettings();
        const cellSize = gs.getCellSize();

        // The rect is the body's own cells: one cell per footprint side. `size` gave the same answer for
        // 1x1 and 2x2 and a square for everything else, which both over-covered the short axis (hovering
        // empty board lit the unit) and under-covered the long one (half the body was not hoverable).
        const w = cellSize * unit.getFootprintWidth();
        const h = cellSize * unit.getFootprintHeight();

        // Top-left corner relative to that centre.
        const x = pos.x - w / 2;
        const y = pos.y - h / 2;

        return { x, y, w, h };
    }
    public resetHover(resetSelectedCells = true): void {
        if (resetSelectedCells) {
            this.hoverSelectedCells = undefined;
            this.hoverSelectedCellsSwitchToRed = false;
            this.hoverAttackFromCell = undefined;
        }
        // These were in Sandbox, need to check if we need to expose them or if they are local to hover
        // sc_hoverAttackIsTargetingObstacle -> seems attack related
        // sc_moveBlocked -> seems move related
        // sc_isSelection -> seems selection related

        // We might need to tell Sandbox to reset these flags via context or just ignore them here if they are not strictly hover state.
        // But resetHover was clearing them.

        this.hoveredUnitId = undefined; // Clear tracked unit ID
        this.clearHoverSilhouette();
        this.clearAOEArea();
    }
    public hoverAttackArrow?: Graphics;
    private hoverRangeTargetEdgeSprites: Sprite[] = [];
    private hoverShotCasingSprites: Sprite[] = [];
    private animatedRangeArrow?: {
        from: HoCMath.XY;
        to: HoCMath.XY;
        continuationTo?: HoCMath.XY;
        smokeFrom?: HoCMath.XY;
    };
    private hoverAttackSword?: Sprite;
    private silhouetteLocked = false;
    public setSilhouetteLocked(locked: boolean): void {
        this.silhouetteLocked = locked;
        if (!locked) {
            // Check if we should clear immediately (optional, or let next update handle it)
            // Usually safest to let logic handle it, but if we call unlock we might want to clear.
            // Sandbox will call resetHover likely.
        }
    }
    public clearHoverSilhouette(force = false): void {
        if (this.silhouetteLocked && !force) return;

        if (this.hoverSilhouette) {
            this.hoverSilhouette.visible = false;
        }
        if (this.hoverSilhouetteOutline) {
            this.hoverSilhouetteOutline.visible = false;
        }
        if (this.hoverTargetSilhouette) {
            this.hoverTargetSilhouette.visible = false;
        }
        if (this.hoverAttackArrow) {
            this.safeClearGraphics(this.hoverAttackArrow);
            this.hoverAttackArrow.visible = false;
        }
        this.animatedRangeArrow = undefined;
        if (this.hoverAttackSword) this.hoverAttackSword.visible = false;
        this.hoverBattlefieldFootprintCells = undefined;
        this.hoverAttackFromCell = undefined;
        this.hoverAttackTargetUnit = undefined;
    }
    public hideSilhouettesOnly(): void {
        if (this.silhouetteLocked) return;

        if (this.hoverSilhouette) {
            this.hoverSilhouette.visible = false;
        }
        if (this.hoverSilhouetteOutline) {
            this.hoverSilhouetteOutline.visible = false;
        }
        if (this.hoverTargetSilhouette) {
            this.hoverTargetSilhouette.visible = false;
        }
        if (this.hoverAttackArrow) {
            this.safeClearGraphics(this.hoverAttackArrow);
            this.hoverAttackArrow.visible = false;
        }
        if (this.hoverAttackSword) this.hoverAttackSword.visible = false;
        this.hoverBattlefieldFootprintCells = undefined;
    }
    private hoverDamageText?: Text;
    private hoverKillText?: Text;
    private hoverDamageIcon?: Sprite;
    private hoverRangeModifierIcon?: Sprite;
    private hoverDamageAnchor?: DamagePredictionAnchorState;
    private attachDamagePredictionObject(obj: Sprite | Text): void {
        this.context.attachToCursorOverlay(obj, DAMAGE_PREDICTION_OVERLAY_Z_INDEX);
    }
    public drawDamagePrediction(
        damageStr: string,
        killStr: string | undefined, // undefined if 0 kills
        position: HoCMath.XY,
        isLargeTarget: boolean,
        killIconPath?: string,
        rangeModifierIconPath?: string,
        targetKey?: string,
    ): void {
        if (targetKey) {
            this.hoverDamageAnchor = pinnedDamagePredictionAnchor(this.hoverDamageAnchor, targetKey, position);
            position = this.hoverDamageAnchor.position;
        }
        const hasKills = !!killStr;
        const verticalScaleCompensation = damagePredictionVerticalScaleCompensation(this.context.getCameraScale());
        const { scale, verticalScale, centerOffsetY } = damagePredictionLayout(
            isLargeTarget,
            hasKills,
            verticalScaleCompensation,
        );
        const centerY = position.y + centerOffsetY;
        const hasKillIcon = !!killIconPath && hasKills;
        const hasRangeModifierIcon = !!rangeModifierIconPath;

        // 1. Setup Damage Text (Top Row)
        if (!this.hoverDamageText) {
            this.hoverDamageText = new Text({
                text: damageStr,
                style: {
                    fontFamily: HOC_NUMERIC_ARIAL_FONT_FAMILY,
                    fontSize: DAMAGE_PREDICTION_FONT_SIZE,
                    fill: 0xff3333,
                    stroke: { color: 0x000000, width: DAMAGE_PREDICTION_STROKE_WIDTH, join: "round" },
                    align: "center",
                    fontWeight: "bold",
                },
            });
        } else {
            this.hoverDamageText.text = damageStr;
        }

        // 3. Visibility & Scaling
        const damageText = this.hoverDamageText!;
        // Reassert the foreground parent on every draw. This also repairs an existing object after HMR or
        // a camera/container rebuild instead of trusting the parent it received when first constructed.
        this.attachDamagePredictionObject(damageText);
        damageText.visible = true;
        // The battlefield camera deliberately has different X/Y zoom. Counter-scale Y so glyphs and
        // square icons remain undistorted on screen while their world-space anchor still follows the unit.
        damageText.scale.set(scale, -verticalScale);

        const positionDamageRow = (rowY: number): void => {
            if (hasRangeModifierIcon) {
                const texture = this.context.texAny(rangeModifierIconPath!) || Texture.from(rangeModifierIconPath!);
                if (!this.hoverRangeModifierIcon) {
                    this.hoverRangeModifierIcon = new Sprite(texture);
                } else {
                    this.hoverRangeModifierIcon.texture = texture;
                }
                this.attachDamagePredictionObject(this.hoverRangeModifierIcon);

                const iconWidth = DAMAGE_PREDICTION_FONT_SIZE * scale * DAMAGE_PREDICTION_RANGE_ICON_SCALE;
                const iconHeight = DAMAGE_PREDICTION_FONT_SIZE * verticalScale * DAMAGE_PREDICTION_RANGE_ICON_SCALE;
                const padding = 4 * scale;
                const startX = position.x - (iconWidth + padding + damageText.width) / 2;
                this.hoverRangeModifierIcon.visible = true;
                this.hoverRangeModifierIcon.anchor.set(0, 0.5);
                this.hoverRangeModifierIcon.width = iconWidth;
                this.hoverRangeModifierIcon.height = iconHeight;
                this.hoverRangeModifierIcon.scale.y = -Math.abs(this.hoverRangeModifierIcon.scale.y);
                this.hoverRangeModifierIcon.position.set(startX, rowY);
                damageText.anchor.set(0, 0.5);
                damageText.position.set(startX + iconWidth + padding, rowY);
                return;
            }

            if (this.hoverRangeModifierIcon) this.hoverRangeModifierIcon.visible = false;
            damageText.anchor.set(0.5, 0.5);
            damageText.position.set(position.x, rowY);
        };

        if (hasKills) {
            if (this.hoverKillText) {
                this.hoverKillText.text = killStr || "0";
            } else {
                this.hoverKillText = new Text({
                    text: killStr || "0",
                    style: {
                        fontFamily: HOC_NUMERIC_ARIAL_FONT_FAMILY,
                        fontSize: DAMAGE_PREDICTION_FONT_SIZE,
                        fill: 0xffffff,
                        stroke: { color: 0x000000, width: DAMAGE_PREDICTION_STROKE_WIDTH, join: "round" },
                        align: "center",
                        fontWeight: "bold",
                    },
                });
            }
            this.attachDamagePredictionObject(this.hoverKillText);
            this.hoverKillText.visible = true;
            this.hoverKillText.scale.set(scale, -verticalScale);

            // Icon Init
            if (hasKillIcon) {
                if (!this.hoverDamageIcon) {
                    this.hoverDamageIcon = new Sprite(
                        this.context.texAny(killIconPath!) || Texture.from(killIconPath!),
                    );
                    this.hoverDamageIcon.anchor.set(0.5);
                } else {
                    this.hoverDamageIcon.texture = this.context.texAny(killIconPath!) || Texture.from(killIconPath!);
                }
                this.attachDamagePredictionObject(this.hoverDamageIcon);
                this.hoverDamageIcon.visible = true;
            } else if (this.hoverDamageIcon) {
                this.hoverDamageIcon.visible = false;
            }

            // Layout: Stacked Centered
            const spacing = DAMAGE_PREDICTION_ROW_SPACING * verticalScale;

            positionDamageRow(centerY + spacing / 2);

            // Icon placement
            if (hasKillIcon && this.hoverDamageIcon) {
                this.hoverDamageIcon.visible = true;
                const iconWidth = DAMAGE_PREDICTION_FONT_SIZE * scale * DAMAGE_PREDICTION_KILL_ICON_SCALE;
                const iconHeight = DAMAGE_PREDICTION_FONT_SIZE * verticalScale * DAMAGE_PREDICTION_KILL_ICON_SCALE;
                this.hoverDamageIcon.width = iconWidth;
                this.hoverDamageIcon.height = iconHeight;
                this.hoverDamageIcon.scale.y = -Math.abs(this.hoverDamageIcon.scale.y);

                // Align icon to left of Kill Text
                const padding = 5 * scale;
                const totalW = iconWidth + padding + this.hoverKillText.width;
                const startX = position.x - totalW / 2;

                this.hoverDamageIcon.anchor.set(0, 0.5);
                this.hoverDamageIcon.position.set(startX, centerY - spacing / 2);

                this.hoverKillText.anchor.set(0, 0.5);
                this.hoverKillText.position.set(startX + iconWidth + padding, centerY - spacing / 2);
            } else {
                this.hoverKillText.anchor.set(0.5, 0.5);
                this.hoverKillText.position.set(position.x, centerY - spacing / 2);
            }
        } else {
            // A damage-only prediction is one centered row below the creature.
            if (this.hoverDamageIcon) this.hoverDamageIcon.visible = false;
            if (this.hoverKillText) this.hoverKillText.visible = false;

            positionDamageRow(centerY);
        }
    }
    public clearAttackVisuals(preserveDamagePredictionAnchor = false): void {
        if (this.hoverAttackArrow) {
            this.hoverAttackArrow.clear();
        }
        this.animatedRangeArrow = undefined;
        if (this.hoverAttackSword) this.hoverAttackSword.visible = false;
        this.clearObstacleHighlight();
        for (const sprite of this.hoverRangeTargetEdgeSprites) sprite.visible = false;
        for (const sprite of this.hoverShotCasingSprites) sprite.visible = false;

        // 1. Restore stack visibility for ALL highlighted units
        for (const unit of this.highlightedUnits) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rUnit = unit as any;
            if (typeof rUnit.setStackVisibility === "function") {
                rUnit.setStackVisibility(true);
            }
        }
        this.highlightedUnits = [];

        // 2. Hide silhouettes and return to pool
        for (const s of this.hoverTargetSilhouettes) {
            s.visible = false;
            this.silhouettePool.push(s);
        }
        this.hoverTargetSilhouettes = [];

        // Hide the per-unit AOE damage labels (Gargantuan Area Throw preview) and return them to the pool,
        // exactly like the silhouettes above. updateAreaThrowHover calls clearAttackVisuals() at the top of
        // every hover frame, so the labels refresh each frame and clear on every aim-exit path.
        for (const label of this.aoeDamageLabels) {
            label.visible = false;
            this.aoeDamageLabelPool.push(label);
        }
        this.aoeDamageLabels = [];

        if (this.hoverDamageText) {
            this.hoverDamageText.visible = false;
        }
        if (this.hoverKillText) {
            this.hoverKillText.visible = false;
        }
        if (this.hoverDamageIcon) {
            this.hoverDamageIcon.visible = false;
        }
        if (this.hoverRangeModifierIcon) {
            this.hoverRangeModifierIcon.visible = false;
        }
        if (!preserveDamagePredictionAnchor) this.hoverDamageAnchor = undefined;
        this.clearSpellPreview();
        this.hoverAttackTargetUnit = undefined;
    }
    /** Paint the one optimal arrow as the terminal continuation of the casing trajectory. */
    public drawRangeTargetEdge(edge: RangeTargetEdgeVisual, trajectoryFrom: HoCMath.XY): void {
        const texture =
            this.hoverRangeTargetEdgeTexture ?? this.context.texAny("range_target_arrow_v7_gold_wide_crisp");
        for (const sprite of this.hoverRangeTargetEdgeSprites) sprite.visible = false;
        if (!texture) return;

        // Keep the approved head size and inward/outward contact point. The rear extension grows away from
        // the creature, and the whole marker follows the exact casing rail instead of a cardinal direction.
        const gridSettings = this.context.sceneSettings.getGridSettings();
        const displayLength = rangeTargetEdgeMarkerDisplayLength(gridSettings.getCellSize());
        const cameraScale = this.context.getCameraScale();
        const zoomX = Math.abs(cameraScale.x) || 1;
        const zoomY = Math.abs(cameraScale.y) || zoomX;
        const worldAngle = Math.atan2(edge.markerCenter.y - trajectoryFrom.y, edge.markerCenter.x - trajectoryFrom.x);
        const screenAngle = Math.atan2(-Math.sin(worldAngle) * zoomY, Math.cos(worldAngle) * zoomX);
        const markerScreenScale = (displayLength * zoomX * RANGE_TARGET_EDGE_SELECTED_SCALE * edge.markerScale) / 512;

        let marker = this.hoverRangeTargetEdgeSprites[0];
        if (!marker || marker.destroyed) {
            marker = new Sprite(texture);
            // The head occupies exactly the old V6 coordinates. Moving the anchor right by the new rear
            // extension pins that head in place while every added pixel grows away from the target creature.
            marker.anchor.set(486 / 742, 0.5);
            marker.eventMode = "none";
            // Attaching sets zIndex on a sortable world container. Doing it on every pointer move
            // dirtied Pixi's full child order and made ranged hover appear to freeze; attach once.
            this.context.attachToWorldRoot(marker, 5601);
            this.hoverRangeTargetEdgeSprites[0] = marker;
        } else if (marker.texture !== texture) {
            marker.texture = texture;
        }
        const transform = cameraCompensatedSpriteTransform(
            edge.markerCenter,
            screenAngle,
            markerScreenScale,
            cameraScale,
        );
        marker.setFromMatrix(
            new Matrix(
                transform.a * RANGE_TARGET_EDGE_LENGTH_SCALE,
                transform.b * RANGE_TARGET_EDGE_LENGTH_SCALE,
                transform.c,
                transform.d,
                transform.tx,
                transform.ty,
            ),
        );
        marker.visible = true;
        marker.roundPixels = false;
        marker.tint = 0xffffff;
        marker.alpha = 1;
        marker.filters = null;
    }
    private hoverTargetSilhouettes: Sprite[] = [];
    private silhouettePool: Sprite[] = [];
    private highlightedUnits: Unit[] = [];
    public addTargetHighlight(targetUnit: Unit, tint: number = 0xff3030): void {
        this.hoverAttackTargetUnit = targetUnit; // Keep referring to last added (primary usually added first, but overwritten here is fine for now as long as we track all in highlightedUnits)
        this.highlightedUnits.push(targetUnit);

        // Hide stack on target for cleaner visual
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rUnit = targetUnit as any;
        if (typeof rUnit.setStackVisibility === "function") {
            rUnit.setStackVisibility(false);
        }

        const targetProps = targetUnit.getUnitProperties();
        const livePreview = this.getLiveUnitPreview(targetProps, targetUnit.getPosition(), targetUnit);
        // Board art, never the _512 card portrait, and the REAL shape: passing `size` as both axes
        // collapsed the rectangular texture tiers, so the ghost picked a different texture (and a
        // different normalized scale) than the live sprite.
        const texName = unitToTextureName(
            targetUnit.getName(),
            TextureType.SMALL,
            targetUnit.getFootprintWidth(),
            targetUnit.getFootprintHeight(),
        );
        const tex = livePreview?.texture ?? this.context.texAny(texName);
        if (!tex) return;

        let silhouette: Sprite;
        if (this.silhouettePool.length > 0) {
            silhouette = this.silhouettePool.pop()!;
            silhouette.texture = tex;
        } else {
            silhouette = new Sprite(tex);
            silhouette.anchor.set(0.5);
            this.context.attachToWorldRoot(silhouette, 2100); // Above units (Z=1000)
            silhouette.scale.y = -1;
        }
        // The old blurred legacy portrait produced an amorphous red spot. Use the current authored
        // frame and exact live transform so the creature itself is what turns red.
        silhouette.filters = [];

        if (livePreview) {
            silhouette.texture = livePreview.texture;
            silhouette.anchor.set(livePreview.anchorX, livePreview.anchorY);
            silhouette.scale.set(livePreview.scaleX, livePreview.scaleY);
            silhouette.position.set(livePreview.x, livePreview.y);
            silhouette.rotation = livePreview.rotation;
        } else {
            let centerPos = targetUnit.getPosition();
            if (typeof rUnit.getVisualCenter === "function") {
                centerPos = rUnit.getVisualCenter(this.context.sceneSettings.getGridSettings());
            }
            const baseWidth = tex.width || 1;
            // Same authored-pixels-per-cell rule as the hover ghost (unitPreviewScale): the overlay is as
            // wide as the body it covers, so it never overhangs a narrow creature.
            const scale = (128 * targetUnit.getFootprintWidth()) / baseWidth;
            silhouette.anchor.set(0.5);
            silhouette.scale.set(scale, -scale);
            silhouette.position.set(centerPos.x, centerPos.y);
            silhouette.rotation = 0;
        }
        silhouette.visible = true;
        silhouette.alpha = 0.72;
        // Caller-chosen tint: dark red for harmful targets, green for buff/heal spell targets.
        silhouette.tint = tint;

        this.hoverTargetSilhouettes.push(silhouette);
    }
    private aoeDamageLabels: Text[] = [];
    private aoeDamageLabelPool: Text[] = [];
    /**
     * Floating projected-damage number over ONE splashed unit, for the Gargantuan Area Throw (3x3) aim
     * preview. Unlike drawDamagePrediction (which reuses a single shared Text and so can only show one
     * number), this pools N labels — one per unit in the splash — recycled each hover frame in
     * clearAttackVisuals(). Same style + Y-flip as drawDamagePrediction. Works in ranked unchanged, since
     * the whole area-throw hover path is inherited by RankedPlayScene.
     */
    public addAOEDamageLabel(position: HoCMath.XY, damageStr: string, isLargeTarget: boolean): void {
        const scale = isLargeTarget ? 2 : 1;
        let label: Text;
        if (this.aoeDamageLabelPool.length > 0) {
            label = this.aoeDamageLabelPool.pop()!;
            label.text = damageStr;
        } else {
            label = new Text({
                text: damageStr,
                style: {
                    fontFamily: HOC_NUMERIC_ARIAL_FONT_FAMILY,
                    fontSize: 24,
                    fill: 0xffffff,
                    stroke: { color: 0x000000, width: 4, join: "round" },
                    align: "center",
                    fontWeight: "bold",
                },
            });
            label.anchor.set(0.5, 0.5);
        }
        // The same structural foreground guarantee as the single-target forecast: the label is a camera
        // sibling after the full battlefield, not another participant in world depth sorting.
        this.attachDamagePredictionObject(label);
        label.visible = true;
        // The world root is Y-inverted (see drawDamagePrediction / the silhouettes) — a negative Y scale
        // keeps the number upright instead of mirrored.
        label.scale.set(scale, -scale);
        label.position.set(position.x, position.y);
        this.aoeDamageLabels.push(label);
    }
    /**
     * `smokeFrom` marks where the shot first enters SMOKE. From that point to the target the arrow is
     * drawn thick and red, because the smoke rule is STICKY: once the ray crosses a smoked cell every
     * target after it takes half damage (divisor doubles, capped at 1/8). Highlighting only the smoked
     * CELLS would understate that — the penalty applies to the whole remainder of the flight, so that is
     * what the emphasis covers. The cloud is neutral, so this shows for either side's shots.
     */
    public drawAttackArrow(
        from: HoCMath.XY,
        to: HoCMath.XY,
        continuationTo?: HoCMath.XY,
        smokeFrom?: HoCMath.XY,
        marker: "arrow" | "melee" = "arrow",
        rememberAnimation = true,
        meleeFacingAngle?: number,
    ): void {
        for (const sprite of this.hoverShotCasingSprites) sprite.visible = false;
        // The feature flag remains explicit so dev builds can isolate target-edge marker behavior without
        // deleting the authoritative trajectory implementation.
        if (marker === "arrow" && !RANGED_ATTACK_TRAJECTORY_VISIBLE) {
            this.animatedRangeArrow = undefined;
            if (this.hoverAttackArrow) {
                this.hoverAttackArrow.clear();
                this.hoverAttackArrow.visible = false;
            }
            if (this.hoverAttackSword) this.hoverAttackSword.visible = false;
            return;
        }
        // If attacking from same position (Stand Ground), don't draw arrow
        const dist = Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2));
        if (dist < 10) {
            if (this.hoverAttackArrow) this.hoverAttackArrow.visible = false;
            if (this.hoverAttackSword) this.hoverAttackSword.visible = false;
            return;
        }

        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        if (marker === "melee") {
            this.animatedRangeArrow = undefined;
            if (this.hoverAttackArrow) this.hoverAttackArrow.visible = false;
            if (!this.hoverAttackSwordTexture) return;
            if (!this.hoverAttackSword || this.hoverAttackSword.destroyed) {
                this.hoverAttackSword = new Sprite(this.hoverAttackSwordTexture);
                this.hoverAttackSword.anchor.set(0.5);
            }
            const sword = this.hoverAttackSword;
            // Reassert the foreground parent on every draw. HMR and scene/container rebuilds can leave an
            // already-created sword attached to an obsolete world layer; that made only some attack angles
            // appear behind the target. The cursor overlay is a camera sibling rendered after the full world.
            this.context.attachToCursorOverlay(sword);
            sword.visible = true;
            // Melee landings occupy the eight cells around a target. Snap to those eight 45-degree
            // facings so the marker never wobbles with tiny pointer movements inside the same cell.
            // Projection and authored foot anchors make the measured segment differ by side. Resolve the
            // eight-way melee facing from logical cells when supplied, while keeping the cursor compact.
            const snappedAngle = snapMeleeSwordAngle(meleeFacingAngle ?? angle);
            const displayLength = meleeSwordDisplayLength(this.context.sceneSettings.getGridSettings().getCellSize());
            const swordScale = displayLength / MELEE_SWORD_ART_LENGTH;
            sword.scale.set(swordScale, -swordScale);
            // Negative Y keeps the PNG upright inside the inverted world. Rotate from the artwork's
            // measured axis rather than assuming its non-square 20x24 canvas has a perfect 45° diagonal.
            sword.rotation = snappedAngle - MELEE_SWORD_NATIVE_WORLD_ANGLE;
            sword.roundPixels = true;
            // `to` is one of the eight projected edge/corner anchors around the target. It marks the
            // BLADE TIP from the user's sketch, not the sprite centre: keep the whole sword on the
            // attacker's side instead of letting half of it cross the target figure.
            const swordCenter = meleeSwordSpriteCenter(to, snappedAngle, displayLength);
            sword.position.set(swordCenter.x, swordCenter.y);
            return;
        }
        if (rememberAnimation) {
            this.animatedRangeArrow = {
                from: { ...from },
                to: { ...to },
                continuationTo: continuationTo ? { ...continuationTo } : undefined,
                smokeFrom: smokeFrom ? { ...smokeFrom } : undefined,
            };
        }
        if (this.hoverAttackSword) this.hoverAttackSword.visible = false;

        if (!this.isGraphicsUsable(this.hoverAttackArrow)) {
            this.hoverAttackArrow = new Graphics();
            if (!this.safeAttachGraphics(this.hoverAttackArrow, 2200)) {
                this.hoverAttackArrow.destroy();
                this.hoverAttackArrow = undefined;
                return;
            }
        }

        const g = this.hoverAttackArrow;
        g.clear();
        g.visible = true;

        // Draw glow/light effect (layered lines)
        // Adjust arrow length to stop a bit before the visual center
        const stopDistance = 0; // Removed gap as per user request
        const arrowLen = Math.max(0, dist - stopDistance);

        if (arrowLen <= 0) return;

        // Four selectable straight-line treatments share the exact authoritative ray and arrow endpoint.
        // Only the ornament changes, so no preview can imply a curved path around an obstacle.
        const dashLength = 18;
        const dashGap = 11;
        const dashCycle = dashLength + dashGap;
        const dashPhase = (this.hoverGlowPhase * 58) % dashCycle;
        const drawDashes = (start: number, finish: number, width: number, color: number, alpha: number) => {
            for (let d = start - dashCycle + dashPhase; d < finish; d += dashCycle) {
                const segmentStart = Math.max(start, d);
                const segmentEnd = Math.min(finish, d + dashLength);
                if (segmentEnd <= segmentStart) continue;
                g.moveTo(from.x + Math.cos(angle) * segmentStart, from.y + Math.sin(angle) * segmentStart)
                    .lineTo(from.x + Math.cos(angle) * segmentEnd, from.y + Math.sin(angle) * segmentEnd)
                    .stroke({ width, color, alpha, cap: "round" });
            }
        };
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        const endX = from.x + Math.cos(angle) * arrowLen;
        const endY = from.y + Math.sin(angle) * arrowLen;
        const trajectoryStyle = getShotTrajectoryStyle();
        switch (trajectoryStyle) {
            case "solid-gold":
                g.moveTo(from.x, from.y).lineTo(endX, endY).stroke({
                    width: 13,
                    color: 0xff5428,
                    alpha: 0.2,
                    cap: "round",
                });
                g.moveTo(from.x, from.y).lineTo(endX, endY).stroke({
                    width: 4,
                    color: 0xffd27a,
                    alpha: 0.92,
                    cap: "round",
                });
                break;
            case "twin-tracer":
                for (const offset of [-5, 5]) {
                    g.moveTo(from.x + nx * offset, from.y + ny * offset)
                        .lineTo(endX + nx * offset, endY + ny * offset)
                        .stroke({ width: 3, color: 0xffb24d, alpha: 0.78, cap: "round" });
                }
                drawDashes(0, arrowLen, 1.5, 0xffffe9, 0.9);
                break;
            case "gold-casings": {
                const ux = Math.cos(angle);
                const uy = Math.sin(angle);
                const casingLength = 22 * 1.25 * 1.15 * SHOT_CASING_SIZE_SCALE;
                const casingSpacing = SHOT_CASING_SPACING;
                const casingPhase = (this.hoverGlowPhase * 36) % casingSpacing;
                const texture =
                    this.hoverShotHammeredBronzeCasingTexture ??
                    this.context.texAny("shot_trajectory_hammered_bronze_casing_sprite_v4");
                if (!texture) break;
                const cameraScale = this.context.getCameraScale();
                const zoomX = Math.abs(cameraScale.x) || 1;
                const zoomY = Math.abs(cameraScale.y) || zoomX;
                const screenAngle = Math.atan2(-uy * zoomY, ux * zoomX);
                const casingScreenScale = (casingLength * zoomX) / Math.max(1, texture.width);
                let casingIndex = 0;
                for (let d = casingPhase - casingSpacing; d < arrowLen + casingSpacing; d += casingSpacing) {
                    if (d < casingLength * 0.5 || d > arrowLen - casingLength * 0.5) continue;
                    let casing = this.hoverShotCasingSprites[casingIndex];
                    if (!casing || casing.destroyed) {
                        casing = new Sprite(texture);
                        casing.anchor.set(0.5);
                        casing.eventMode = "none";
                        this.context.attachToWorldRoot(casing, 2201);
                        this.hoverShotCasingSprites[casingIndex] = casing;
                    } else if (casing.texture !== texture) {
                        casing.texture = texture;
                    }
                    casing.visible = true;
                    const position = { x: from.x + ux * d, y: from.y + uy * d };
                    const transform = cameraCompensatedSpriteTransform(
                        position,
                        screenAngle,
                        casingScreenScale,
                        cameraScale,
                    );
                    casing.setFromMatrix(
                        new Matrix(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty),
                    );
                    casing.roundPixels = true;
                    casing.tint = 0xffffff;
                    casing.alpha = 1;
                    casingIndex += 1;
                }
                break;
            }
            case "marching-chevrons":
            case "double-chevron-pulses":
            case "forged-double-chevrons":
            case "ember-double-chevrons": {
                const isDouble = trajectoryStyle !== "marching-chevrons";
                const isForged = trajectoryStyle === "forged-double-chevrons";
                const isEmber = trajectoryStyle === "ember-double-chevrons";
                // Keep a persistent aiming rail beneath the moving ornaments. The forged treatment used
                // to contain only widely spaced chevrons, so at some animation phases the whole trajectory
                // appeared to vanish even though the target-edge arrows remained visible.
                if (isForged) {
                    drawDashes(0, arrowLen, 3.2, 0xe2ad58, 0.82);
                    drawDashes(0, arrowLen, 1.15, 0xffffd8, 0.92);
                } else {
                    g.moveTo(from.x, from.y)
                        .lineTo(endX, endY)
                        .stroke({
                            width: isEmber ? 7 : 2,
                            color: isEmber ? 0xff4d22 : 0xffb45b,
                            alpha: isEmber ? 0.25 : 0.4,
                            cap: "round",
                        });
                }
                const spacing = isForged ? 50 : isDouble ? 43 : 28;
                const chevronPhase = (this.hoverGlowPhase * 50) % spacing;
                const drawChevron = (d: number, scale = 1) => {
                    const depth = 9 * scale;
                    const halfWidth = 5 * scale;
                    const tipX = from.x + Math.cos(angle) * (d + depth);
                    const tipY = from.y + Math.sin(angle) * (d + depth);
                    const backX = from.x + Math.cos(angle) * d;
                    const backY = from.y + Math.sin(angle) * d;
                    if (isEmber) {
                        g.circle(tipX, tipY, 10 * scale).fill({ color: 0xff3219, alpha: 0.2 });
                    }
                    if (isForged || isEmber) {
                        g.moveTo(backX + nx * halfWidth, backY + ny * halfWidth)
                            .lineTo(tipX, tipY)
                            .lineTo(backX - nx * halfWidth, backY - ny * halfWidth)
                            .stroke({
                                width: isForged ? 6.5 : 7,
                                color: isForged ? 0x2a180f : 0x5b1d12,
                                alpha: 0.9,
                                cap: "round",
                                join: "round",
                            });
                    }
                    g.moveTo(backX + nx * halfWidth, backY + ny * halfWidth)
                        .lineTo(tipX, tipY)
                        .lineTo(backX - nx * halfWidth, backY - ny * halfWidth)
                        .stroke({
                            width: isEmber ? 3.5 : isForged ? 2.8 : 2.4,
                            color: isEmber ? 0xffa53e : isForged ? 0xe2ad58 : 0xffffdf,
                            alpha: 0.95,
                            cap: "round",
                            join: "round",
                        });
                };
                for (let d = chevronPhase; d < arrowLen - 12; d += spacing) {
                    drawChevron(d);
                    if (isDouble && d + 16 < arrowLen - 12) drawChevron(d + 13, 0.86);
                }
                break;
            }
            case "ember-dashes":
            default:
                drawDashes(0, arrowLen, 16, 0xff4028, 0.28);
                drawDashes(0, arrowLen, 7, 0xffa13d, 0.58);
                drawDashes(0, arrowLen, 2.5, 0xfff4dc, 0.98);
                break;
        }

        // The forged version stays 1:1 with its approved preview: only paired chevrons and their rivets.
        // Other treatments retain the travelling bead that was part of their original animation.
        if (trajectoryStyle !== "forged-double-chevrons" && trajectoryStyle !== "gold-casings") {
            const flightPulse = (this.hoverGlowPhase * 92) % Math.max(arrowLen, 1);
            const pulseX = from.x + Math.cos(angle) * flightPulse;
            const pulseY = from.y + Math.sin(angle) * flightPulse;
            g.circle(pulseX, pulseY, 11).fill({ color: 0xff542e, alpha: 0.2 });
            g.circle(pulseX, pulseY, 5).fill({ color: 0xffbc58, alpha: 0.62 });
            g.circle(pulseX, pulseY, 2).fill({ color: 0xffffee, alpha: 1 });
        }

        // SMOKED SEGMENT: from where the ray enters smoke to the tip, overdrawn thick and red so the
        // halved stretch of the flight is unmistakable against the plain white core above. Clamped to the
        // arrow so a smoke entry resolved slightly off-axis can't draw past the target.
        if (smokeFrom) {
            const along = (smokeFrom.x - from.x) * Math.cos(angle) + (smokeFrom.y - from.y) * Math.sin(angle);
            const startAlong = Math.max(0, Math.min(arrowLen, along));
            const sx = from.x + Math.cos(angle) * startAlong;
            const sy = from.y + Math.sin(angle) * startAlong;
            drawDashes(startAlong, arrowLen, 15, 0xff2020, 0.26);
            drawDashes(startAlong, arrowLen, 5, 0xff5f4f, 0.95);
            const smokeLength = arrowLen - startAlong;
            if (smokeLength > 0) {
                const smokePulse = startAlong + ((this.hoverGlowPhase * 76) % smokeLength);
                const smokePulseX = from.x + Math.cos(angle) * smokePulse;
                const smokePulseY = from.y + Math.sin(angle) * smokePulse;
                g.circle(smokePulseX, smokePulseY, 12).fill({ color: 0xff1818, alpha: 0.24 });
                g.circle(smokePulseX, smokePulseY, 4).fill({ color: 0xff7666, alpha: 0.95 });
            }
            // A tick at the entry point so it is obvious WHERE the smoke starts, not just that it exists.
            const nx = Math.cos(angle + Math.PI / 2);
            const ny = Math.sin(angle + Math.PI / 2);
            g.moveTo(sx - nx * 11, sy - ny * 11)
                .lineTo(sx + nx * 11, sy + ny * 11)
                .stroke({ width: 4, color: 0xff8a8a, alpha: 0.95 });
        }

        // Optional faint dashed continuation PAST the arrow tip. Used when a ranged shot is stopped by a
        // mountain: the arrow ends at the rock, then this thin dotted line traces where the shot WOULD
        // have carried on to the intended unit, so the whole projection still reads at a glance.
        if (continuationTo) {
            const cDist = Math.hypot(continuationTo.x - endX, continuationTo.y - endY);
            if (cDist > 6) {
                const cAngle = Math.atan2(continuationTo.y - endY, continuationTo.x - endX);
                const dash = 9;
                const gap = 9;
                const continuationPhase = (this.hoverGlowPhase * 58) % (dash + gap);
                for (let d = -dash - gap + continuationPhase; d < cDist; d += dash + gap) {
                    const segmentStart = Math.max(0, d);
                    const segEnd = Math.min(d + dash, cDist);
                    if (segEnd <= segmentStart) continue;
                    g.moveTo(endX + Math.cos(cAngle) * segmentStart, endY + Math.sin(cAngle) * segmentStart)
                        .lineTo(endX + Math.cos(cAngle) * segEnd, endY + Math.sin(cAngle) * segEnd)
                        .stroke({ width: 2, color: 0xff9c70, alpha: 0.42, cap: "round" });
                }
                const continuationPulse = (this.hoverGlowPhase * 74) % cDist;
                const continuationPulseX = endX + Math.cos(cAngle) * continuationPulse;
                const continuationPulseY = endY + Math.sin(cAngle) * continuationPulse;
                g.circle(continuationPulseX, continuationPulseY, 7).fill({ color: 0xff6540, alpha: 0.2 });
                g.circle(continuationPulseX, continuationPulseY, 2.5).fill({ color: 0xffb27f, alpha: 0.8 });
            }
        }
    }
    // Soft red glow marking an obstacle (a BLOCK_CENTER mountain) as the thing a blocked ranged shot
    // actually hits — used instead of the unit target-silhouette, since the unit behind it takes no damage.
    private hoverObstacleHighlight?: Graphics;
    public highlightObstacle(position: HoCMath.XY, cellSize: number, subtleInteractive = false): void {
        this.highlightObstacles([position], cellSize, subtleInteractive);
    }
    public highlightObstacles(positions: readonly HoCMath.XY[], cellSize: number, subtleInteractive = false): void {
        if (!this.isGraphicsUsable(this.hoverObstacleHighlight)) {
            this.hoverObstacleHighlight = new Graphics();
            if (!this.safeAttachGraphics(this.hoverObstacleHighlight, 2150)) {
                this.hoverObstacleHighlight.destroy();
                this.hoverObstacleHighlight = undefined;
                return;
            }
        }
        const g = this.hoverObstacleHighlight;
        g.clear();
        g.visible = true;
        if (subtleInteractive) {
            const pulse = 0.5 + 0.5 * Math.sin(this.hoverGlowPhase * 2.2);
            const inset = cellSize * (0.09 - pulse * 0.018);
            // Animated white focus brackets stay readable on every tombstone texture without tinting
            // the art. A soft outer trace breathes around a crisp inner rim, so crossed obstacles read
            // as interactive trajectory hits rather than enemy targets or selected board cells.
            for (const position of positions) {
                const points = projectedRectPoints(
                    position.x - cellSize * 0.5 + inset,
                    position.y - cellSize * 0.5 + inset,
                    position.x + cellSize * 0.5 - inset,
                    position.y + cellSize * 0.5 - inset,
                    this.context.sceneSettings.getGridSettings(),
                );
                g.poly(points).stroke({ width: 5 + pulse * 2, color: 0xffffff, alpha: 0.08 + pulse * 0.12 });
                g.poly(points).stroke({
                    width: 1.5 + pulse * 0.7,
                    color: 0xffffff,
                    alpha: 0.72 + pulse * 0.25,
                });
            }
            return;
        }
        for (const position of positions) {
            const outer = projectedRectPoints(
                position.x - cellSize * 0.48,
                position.y - cellSize * 0.48,
                position.x + cellSize * 0.48,
                position.y + cellSize * 0.48,
                this.context.sceneSettings.getGridSettings(),
            );
            const inner = projectedRectPoints(
                position.x - cellSize * 0.42,
                position.y - cellSize * 0.42,
                position.x + cellSize * 0.42,
                position.y + cellSize * 0.42,
                this.context.sceneSettings.getGridSettings(),
            );
            g.poly(outer).fill({ color: 0xaa0000, alpha: 0.22 });
            g.poly(inner).fill({ color: 0xff2a2a, alpha: 0.3 });
            g.poly(inner).stroke({ width: 3, color: 0xff4444, alpha: 0.85 });
        }
    }
    public clearObstacleHighlight(): void {
        if (this.hoverObstacleHighlight) {
            this.hoverObstacleHighlight.clear();
            this.hoverObstacleHighlight.visible = false;
        }
    }
    // --- Armed-spell on-board preview: a colored beam caster→target plus a persistent icon+name
    // badge floating above the caster, so the player can always see which spell is about to fire. ---
    private spellBeam?: Graphics;
    private spellBadgeRing?: Graphics;
    private spellBadgeIcon?: Sprite;
    private spellBadgeText?: Text;
    public drawSpellCastPreview(opts: {
        casterPos: HoCMath.XY;
        targetPos?: HoCMath.XY;
        iconTex: Texture;
        label: string;
        color: number;
        beamStyle: "positive" | "negative";
    }): void {
        const color = opts.color;

        // 1. Beam from caster to hovered target (only when a target is hovered).
        if (opts.targetPos) {
            if (!this.isGraphicsUsable(this.spellBeam)) {
                this.spellBeam = new Graphics();
                if (!this.safeAttachGraphics(this.spellBeam, 2199)) {
                    this.spellBeam.destroy();
                    this.spellBeam = undefined;
                    return;
                }
            }
            const g = this.spellBeam;
            g.clear();
            g.visible = true;
            const fx = opts.casterPos.x;
            const fy = opts.casterPos.y;
            const tx = opts.targetPos.x;
            const ty = opts.targetPos.y;
            const angle = Math.atan2(ty - fy, tx - fx);
            const negative = opts.beamStyle === "negative";
            const glowColor = negative ? 0x9e1308 : 0x00a94f;
            const midColor = negative ? 0xff3b12 : 0x18e875;
            const coreColor = negative ? 0xffc04a : 0xbaffd2;

            // Variant 1: a narrow luminous core, broad magical glow and a sharp arcane spearhead.
            g.moveTo(fx, fy).lineTo(tx, ty).stroke({ width: 20, color: glowColor, alpha: 0.16 });
            g.moveTo(fx, fy).lineTo(tx, ty).stroke({ width: 9, color: midColor, alpha: 0.38 });
            g.moveTo(fx, fy).lineTo(tx, ty).stroke({ width: 3, color: coreColor, alpha: 0.95 });

            const dx = tx - fx;
            const dy = ty - fy;
            const length = Math.max(1, Math.hypot(dx, dy));
            const nx = -dy / length;
            const ny = dx / length;
            for (let i = 1; i <= 6; i++) {
                const t = i / 8;
                const wave = Math.sin(i * 2.35) * (negative ? 8 : 5);
                const px = fx + dx * t + nx * wave;
                const py = fy + dy * t + ny * wave;
                const runeSize = negative ? 4 + (i % 2) : 3 + (i % 2);
                if (negative) {
                    // Ember tongues trail off the fiery red beam.
                    g.moveTo(px - nx * runeSize, py - ny * runeSize)
                        .quadraticCurveTo(
                            px + nx * runeSize * 2.5 - (dx / length) * 5,
                            py + ny * runeSize * 2.5 - (dy / length) * 5,
                            px + nx * runeSize * 0.6,
                            py + ny * runeSize * 0.6,
                        )
                        .stroke({ width: 2, color: i % 2 ? 0xff6a18 : 0xffc13b, alpha: 0.72 });
                } else {
                    // Small diamond runes keep the green beam magical without obscuring the board.
                    g.poly([px, py - runeSize, px + runeSize, py, px, py + runeSize, px - runeSize, py]).stroke({
                        width: 1.5,
                        color: coreColor,
                        alpha: 0.72,
                    });
                }
            }

            const hl = 28;
            const hw = 12;
            const ux = Math.cos(angle);
            const uy = Math.sin(angle);
            const bx = tx - ux * hl;
            const by = ty - uy * hl;
            g.poly([tx, ty, bx + nx * hw, by + ny * hw, bx + ux * 7, by + uy * 7, bx - nx * hw, by - ny * hw])
                .fill({ color: midColor, alpha: 0.28 })
                .stroke({ width: 3, color: coreColor, alpha: 1 });
        } else if (this.spellBeam) {
            this.safeClearGraphics(this.spellBeam);
        }

        // 2. Badge above the caster (world is y-up, so +Y floats it higher on screen).
        const cx = opts.casterPos.x;
        const cy = opts.casterPos.y + 96;
        const iconSize = 46;
        if (!this.isGraphicsUsable(this.spellBadgeRing)) {
            this.spellBadgeRing = new Graphics();
            if (!this.safeAttachGraphics(this.spellBadgeRing, 2202)) {
                this.spellBadgeRing.destroy();
                this.spellBadgeRing = undefined;
                return;
            }
        }
        const ring = this.spellBadgeRing;
        ring.clear();
        ring.visible = true;
        ring.circle(cx, cy, iconSize / 2 + 7).fill({ color: 0x000000, alpha: 0.5 });
        ring.circle(cx, cy, iconSize / 2 + 7).stroke({ width: 3, color, alpha: 0.95 });

        if (!this.spellBadgeIcon) {
            this.spellBadgeIcon = new Sprite(opts.iconTex);
            this.spellBadgeIcon.anchor.set(0.5);
            this.context.attachToWorldRoot(this.spellBadgeIcon, 2203);
        } else {
            this.spellBadgeIcon.texture = opts.iconTex;
        }
        const texW = opts.iconTex.width || iconSize;
        this.spellBadgeIcon.visible = true;
        this.spellBadgeIcon.scale.set(iconSize / texW, -iconSize / texW);
        this.spellBadgeIcon.position.set(cx, cy);
        this.spellBadgeIcon.tint = 0xffffff;

        if (!this.spellBadgeText) {
            this.spellBadgeText = new Text({
                text: opts.label,
                style: {
                    fontFamily: HOC_NUMERIC_ARIAL_FONT_FAMILY,
                    fontSize: 18,
                    fill: 0xffffff,
                    stroke: { color: 0x000000, width: 4, join: "round" },
                    align: "center",
                    fontWeight: "bold",
                },
            });
            this.context.attachToWorldRoot(this.spellBadgeText, 2203);
        } else {
            this.spellBadgeText.text = opts.label;
        }
        this.spellBadgeText.visible = true;
        this.spellBadgeText.anchor.set(0.5, 0.5);
        this.spellBadgeText.scale.set(1, -1);
        this.spellBadgeText.position.set(cx, cy - (iconSize / 2 + 18));
    }
    public clearSpellPreview(): void {
        if (this.spellBeam) this.safeClearGraphics(this.spellBeam);
        if (this.spellBadgeRing) this.safeClearGraphics(this.spellBadgeRing);
        if (this.spellBadgeIcon) this.spellBadgeIcon.visible = false;
        if (this.spellBadgeText) this.spellBadgeText.visible = false;
    }
    public updateHoverSilhouette(boundsCenter: HoCMath.XY): void {
        // Size/shape the move-preview from the ACTIVE unit's LIVE properties — this silhouette is
        // that unit's projected position. The cached selected-properties can be stale/mistyped and
        // made large units (e.g. Hydra) render a small silhouette. Fall back to selected (placement).
        const active = this.context.getCurrentActiveUnit();
        const selected = active ? active.getUnitProperties() : this.context.getSelectedUnitProperties();

        if (this.hoverAttackTargetUnit) {
            // If we have a target unit (red highlight), we might want to keep it?
            // Actually, Sandbox resets this every frame if attacking.
            // If we are here and NOT attacking, we should clear.
        }

        // If we are just moving (active unit), clear attack specifics
        if (this.hoverTargetSilhouette && !this.hoverAttackFromCell) {
            this.hoverTargetSilhouette.visible = false;
        }
        if (this.hoverAttackArrow && !this.hoverAttackFromCell) {
            this.hoverAttackArrow.visible = false;
        }
        if (this.hoverAttackSword && !this.hoverAttackFromCell) {
            this.hoverAttackSword.visible = false;
        }

        // 1. If we have an attack-from cell, we behave differently:
        if (this.hoverAttackFromCell && selected) {
            this.hoverBattlefieldFootprintCells = combatFootprintCellsForBase(
                this.hoverAttackFromCell,
                footprintWidthOf(selected),
                footprintHeightOf(selected),
            );
            // The landing footprint is the useful attack-position information. A full creature ghost
            // obscures those cells and nearby units, so attack hover intentionally keeps only the cells.
            if (this.hoverSilhouette) this.hoverSilhouette.visible = false;
            if (this.hoverSilhouetteOutline) this.hoverSilhouetteOutline.visible = false;
            return;
        }

        this.hoverBattlefieldFootprintCells = undefined;

        if (!selected || this.hoverSelectedCellsSwitchToRed || !this.hoverSelectedCells?.length) {
            this.clearHoverSilhouette();
            return;
        }

        this.ensureHoverSilhouetteParams(selected, boundsCenter, false);
    }
    /**
     * Placement is a face-off: both armies look at the battlefield centre, so a preview's horizontal
     * mirroring is a function of its TEAM and nothing else — the same rule Sandbox re-asserts on every
     * placed unit every frame. Applied to whichever branch produced the sprite, because the two branches
     * disagree by construction: the texture branch has no facing of its own, and the live branch inherits
     * the source's, which before the fight can be any direction the source last happened to hold.
     *
     * During the fight this must NOT run: facing there follows the direction a unit walked or the target it
     * is striking, and forcing the team direction would spin previews back to a deployment pose.
     */
    private applyPlacementFacing(
        sprite: Sprite,
        outline: Sprite,
        selected: UnitProperties,
        boundsCenter: HoCMath.XY,
    ): void {
        if (FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
            return;
        }
        // The overlay picker's chips are team-less (NO_TEAM until the drop assigns a side), so a
        // teamless preview takes its facing from the hovered board half instead of defaulting right.
        const facing = previewPlacementFacing(selected.team, boundsCenter.x);
        sprite.scale.x = Math.abs(sprite.scale.x) * facing;
        outline.scale.x = Math.abs(outline.scale.x) * facing;
    }
    private ensureHoverSilhouetteParams(
        selected: UnitProperties,
        boundsCenter: HoCMath.XY,
        _isAttack: boolean,
        previewUnit?: Unit,
        exactPlacementCopy = false,
    ): void {
        const outlineGrowth = exactPlacementCopy ? 1 : 1.06;
        const livePreview = this.getLiveUnitPreview(selected, boundsCenter, previewUnit);
        const texName = unitToTextureName(
            selected.name,
            TextureType.SMALL,
            footprintWidthOf(selected),
            footprintHeightOf(selected),
        );
        const tex = livePreview?.texture ?? this.context.texAny(texName);
        if (!tex) {
            this.clearHoverSilhouette();
            return;
        }
        if (!this.hoverSilhouette) {
            this.hoverSilhouette = new Sprite(tex);
            this.hoverSilhouette.anchor.set(0.5);
            this.context.attachToWorldRoot(this.hoverSilhouette, 110);
            this.hoverSilhouette.scale.y = -1;
        } else if (this.hoverSilhouetteKey !== texName) {
            this.hoverSilhouette.texture = tex;
        }
        if (!this.hoverSilhouetteOutline) {
            this.hoverSilhouetteOutline = new Sprite(tex);
            this.hoverSilhouetteOutline.anchor.set(0.5);
            this.context.attachToWorldRoot(this.hoverSilhouetteOutline, 109);
            this.hoverSilhouetteOutline.scale.y = -1;
        } else if (this.hoverSilhouetteKey !== texName) {
            this.hoverSilhouetteOutline.texture = tex;
        }
        this.hoverSilhouetteKey = texName;
        const sprite = this.hoverSilhouette;
        const outline = this.hoverSilhouetteOutline;
        const cellSize = this.context.sceneSettings.getGridSettings().getCellSize();
        if (livePreview) {
            this.applyLiveUnitPreview(sprite, outline, livePreview, outlineGrowth);
            // The live branch inherits the SOURCE sprite's facing, which is right during the fight (facing
            // there follows movement) but only accidentally right before it. Placement has one rule and the
            // board asserts it on every unit every frame: red/RIGHT faces left, green/LEFT faces right. The
            // preview of a placement must obey the rule it is previewing, whichever source it was cloned
            // from — otherwise the ghost points one way and the unit turns the other the moment it lands.
            this.applyPlacementFacing(sprite, outline, selected, boundsCenter);
        } else {
            const projectedCenter = projectBattlefieldPoint(boundsCenter, this.context.sceneSettings.getGridSettings());
            const scale = unitPreviewScale(selected, tex, cellSize);
            const outlineScale = scale * outlineGrowth;
            sprite.anchor.set(0.5);
            outline.anchor.set(0.5);
            sprite.scale.set(scale, -scale);
            outline.scale.set(outlineScale, -outlineScale);
            this.applyPlacementFacing(sprite, outline, selected, boundsCenter);
            sprite.x = projectedCenter.x;
            sprite.y = unitPreviewY(selected, projectedCenter.y, cellSize);
            outline.x = projectedCenter.x;
            outline.y = sprite.y;
            sprite.rotation = 0;
            outline.rotation = 0;
        }
        if (exactPlacementCopy) {
            this.applyPlacementAppearance(sprite, outline);
        } else {
            this.applyPhantomAppearance(sprite, outline);
        }
    }
    /**
     * Show silhouette for a unit at a specific position - used for AI moves/attacks
     * Uses the exact original cutout with only a black-and-white filter.
     */
    public showSilhouetteForUnit(unitProps: UnitProperties, position: HoCMath.XY): void {
        this.ensureHoverSilhouetteParams(unitProps, position, false);
    }
    /**
     * Render a ghost of the opponent's active unit at the cell they are currently aiming
     * at during their turn in ranked play. Uses its own sprite so the live "intent" preview
     * does not disturb the local player's hover silhouette; both use the same exact B&W treatment.
     */
    public showOpponentIntentSilhouette(props: UnitProperties, position: HoCMath.XY): void {
        const livePreview = this.getLiveUnitPreview(props, position);
        const texName = unitToTextureName(
            props.name,
            TextureType.SMALL,
            footprintWidthOf(props),
            footprintHeightOf(props),
        );
        const tex = livePreview?.texture ?? this.context.texAny(texName);
        if (!tex) {
            this.clearOpponentIntentSilhouette();
            return;
        }
        if (!this.opponentIntentSilhouette) {
            this.opponentIntentSilhouette = new Sprite(tex);
            this.opponentIntentSilhouette.anchor.set(0.5);
            this.context.attachToWorldRoot(this.opponentIntentSilhouette, 110);
            this.opponentIntentSilhouette.scale.y = -1;
        } else if (this.opponentIntentKey !== texName) {
            this.opponentIntentSilhouette.texture = tex;
        }
        if (!this.opponentIntentOutline) {
            this.opponentIntentOutline = new Sprite(tex);
            this.opponentIntentOutline.anchor.set(0.5);
            this.context.attachToWorldRoot(this.opponentIntentOutline, 109);
            this.opponentIntentOutline.scale.y = -1;
        } else if (this.opponentIntentKey !== texName) {
            this.opponentIntentOutline.texture = tex;
        }
        this.opponentIntentKey = texName;
        const sprite = this.opponentIntentSilhouette;
        const outline = this.opponentIntentOutline;
        const cellSize = this.context.sceneSettings.getGridSettings().getCellSize();
        if (livePreview) {
            this.applyLiveUnitPreview(sprite, outline, livePreview);
        } else {
            const projectedCenter = projectBattlefieldPoint(position, this.context.sceneSettings.getGridSettings());
            const scale = unitPreviewScale(props, tex, cellSize);
            const outlineScale = scale * 1.06;
            const intentFacing = placementFacingDirectionForTeam(props.team);
            sprite.anchor.set(0.5);
            outline.anchor.set(0.5);
            sprite.scale.set(scale * intentFacing, -scale);
            outline.scale.set(outlineScale * intentFacing, -outlineScale);
            sprite.x = projectedCenter.x;
            sprite.y = unitPreviewY(props, projectedCenter.y, cellSize);
            outline.x = projectedCenter.x;
            outline.y = sprite.y;
            sprite.rotation = 0;
            outline.rotation = 0;
        }
        this.applyPhantomAppearance(sprite, outline);
    }
    public clearOpponentIntentSilhouette(): void {
        if (this.opponentIntentSilhouette) {
            this.opponentIntentSilhouette.visible = false;
        }
        if (this.opponentIntentOutline) {
            this.opponentIntentOutline.visible = false;
        }
    }
    public updateBoardHoverSilhouette(props: UnitProperties, center: HoCMath.XY): void {
        const texName = unitToTextureName(
            props.name,
            TextureType.SMALL,
            footprintWidthOf(props),
            footprintHeightOf(props),
        );
        const tex = this.context.texAny(texName);
        if (!tex) {
            this.clearHoverSilhouette();
            return;
        }
        if (!this.hoverSilhouette) {
            this.hoverSilhouette = new Sprite(tex);
            this.hoverSilhouette.anchor.set(0.5);
            this.context.attachToWorldRoot(this.hoverSilhouette, 110);
            this.hoverSilhouette.scale.y = -1;
        } else if (this.hoverSilhouetteKey !== texName) {
            this.hoverSilhouette.texture = tex;
        }
        if (!this.hoverSilhouetteOutline) {
            this.hoverSilhouetteOutline = new Sprite(tex);
            this.hoverSilhouetteOutline.anchor.set(0.5);
            this.context.attachToWorldRoot(this.hoverSilhouetteOutline, 109);
            this.hoverSilhouetteOutline.scale.y = -1;
        } else if (this.hoverSilhouetteKey !== texName) {
            this.hoverSilhouetteOutline.texture = tex;
        }
        this.hoverSilhouetteKey = texName;
        const sprite = this.hoverSilhouette;
        const outline = this.hoverSilhouetteOutline;
        const cellSize = this.context.sceneSettings.getGridSettings().getCellSize();
        const baseScale = unitPreviewScale(props, tex, cellSize);
        const scale = baseScale * this.boardHoverScale;
        const outlineScale = scale * 1.08;
        const y = unitPreviewY(props, center.y, cellSize) + this.boardHoverYOffset;
        sprite.scale.set(scale, -scale);
        outline.scale.set(outlineScale, -outlineScale);
        // Same placement rule as every other preview. This path is currently unreachable — nothing assigns
        // `boardHoverProps` — but it is a public entry point, and leaving the one silhouette renderer
        // without a facing is how this bug would come back the day someone wires it up.
        this.applyPlacementFacing(sprite, outline, props, center);
        sprite.x = center.x;
        sprite.y = y;
        outline.x = center.x;
        outline.y = y;
        this.applyPhantomAppearance(sprite, outline);
    }
    public updateActiveMoveSilhouetteForCell(cell: HoCMath.XY): void {
        if (this.silhouetteLocked) return;

        const currentActiveUnit = this.context.getCurrentActiveUnit();
        if (!currentActiveUnit) {
            this.clearHoverSilhouette();
            return;
        }

        const gs = this.context.sceneSettings.getGridSettings();
        const props = currentActiveUnit.getUnitProperties();

        let centerPos: HoCMath.XY;
        let footprintCells: HoCMath.XY[];

        if (occupiesManyCells(props)) {
            const candidate = this.findLargeUnitMoveCandidate(cell);
            if (!candidate) {
                this.clearHoverSilhouette();
                return;
            }
            // The ghost stands on the centre of the landing rectangle. Any rectangle resolves, so there is
            // no shape here that can leave the preview without a position.
            footprintCells = candidate;
            centerPos = GridMath.getPositionForFootprintAnchor(
                gs,
                GridMath.getFootprintAnchorForCells(candidate) ?? cell,
                footprintWidthOf(props),
                footprintHeightOf(props),
            );
        } else {
            if (!this.isCellReachableForActiveUnit(cell)) {
                this.clearHoverSilhouette();
                return;
            }
            footprintCells = [cell];
            centerPos = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        }

        this.hoverBattlefieldFootprintCells = footprintCells;
        this.ensureHoverSilhouetteParams(props, centerPos, false);
    }
    public updateHoverPlacementCell(worldPos: HoCMath.XY): void {
        const gs = this.context.sceneSettings.getGridSettings();
        // Sandbox stores the pointer in logical board coordinates. Re-unprojecting an already logical
        // point shifts the chosen cell a second time and makes the ghost land beside the cursor.
        const logicalWorldPos = worldPos;
        const selected = this.context.getSelectedUnitProperties();
        const fightProps = FightStateManager.getInstance().getFightProperties();

        this.hoverPlacementCell = undefined;
        this.hoverPlacementCellTeam = undefined;
        this.hoverSelectedCells = undefined;
        this.hoverSelectedCellsSwitchToRed = false;

        // ⬅️ IMPORTANT: only require a selected unit,
        // do NOT depend on hasActiveSelection() here,
        // otherwise bench-placement hover dies.
        if (!selected) {
            this.clearAuraVisuals();
            this.clearHoverSilhouette();
            return;
        }

        const cell = GridMath.getCellForPosition(gs, logicalWorldPos);
        this.clearAuraVisuals();
        // A pointer OFF the board still produces a cell — getCellForPosition is an unclamped floor-divide.
        // The 4-bits-per-axis cell hash then ALIASES rather than missing: y = 16 sets the low bit of x, so
        // `(x << 4) | 16` is the key of the real cell (x | 1, 0), and an off-board cursor would light up a
        // placement silhouette on row 0.
        if (!cell || !GridMath.isCellWithinGrid(gs, cell)) {
            this.clearHoverSilhouette();
            return;
        }

        const isLarge = occupiesManyCells(selected);
        const cellHash = (cell.x << 4) | cell.y;

        let teamFromPlacement: TeamType | undefined;
        if (this.context.placementManager.getAllowedPlacementCellHashesForTeam(TeamVals.LEFT)?.has(cellHash)) {
            teamFromPlacement = TeamVals.LEFT;
        } else if (this.context.placementManager.getAllowedPlacementCellHashesForTeam(TeamVals.RIGHT)?.has(cellHash)) {
            teamFromPlacement = TeamVals.RIGHT;
        }

        const draggingUnitTeam = this.context.getDraggingUnitTeam();
        const draggingUnitId = this.context.getDraggingUnitId();

        // Placing a NEW unit (not repositioning a board unit) while the cursor sits on another unit:
        // a click here SELECTS that unit, it isn't a placement. So don't show any placement square
        // (red read as "can't place" was misleading) — show the unit's selection highlight instead.
        if (!draggingUnitId) {
            const cursorOccupantId = this.context.grid.getOccupantUnitId(cell);
            if (cursorOccupantId) {
                const occupantUnit = this.context.unitsHolder.getAllUnits().get(cursorOccupantId);
                if (occupantUnit) {
                    this.clearAuraVisuals();
                    this.clearHoverSilhouette();
                    // (placement square vars were already reset at the top of this method)
                    this.hoveredUnitHighlight = this.getHighlightRectForUnit(occupantUnit);
                    this.hoveredUnitId = occupantUnit.getId();
                    return;
                }
            }
        }

        // --- 1. Calculate Candidate Cells (Early) ---
        // We need these for both Visualization (Mock Unit) and Validation
        let candidateCells: HoCMath.XY[];
        if (isLarge) {
            // If teamFromPlacement is known, prioritize that side's valid cells
            // If undefined (void), use dragging team's side or generic?
            // Existing logic used "allowedForThatSide" inside "Wrong Team" block, and "allowedForTeam" later.
            // We'll try to find best fit.
            const targetTeamForPath = teamFromPlacement ?? draggingUnitTeam ?? TeamVals.LEFT;
            const allowedForPath =
                this.context.placementManager.getAllowedPlacementCellHashesForTeam(targetTeamForPath);

            // Let the square finder skip terrain and other stacks while still allowing a dragged 2x2
            // creature to overlap its own current footprint. Previously this list was always empty, so
            // hovering beside lava/another unit selected the blocked square first and made otherwise
            // available placement cells impossible to use.
            const draggedUnit = draggingUnitId ? this.context.unitsHolder.getAllUnits().get(draggingUnitId) : undefined;
            const ownCells = draggedUnit?.getCells();
            const occupiedKeys: string[] = [];
            for (let x = 0; x < gs.getGridSize(); x += 1) {
                for (let y = 0; y < gs.getGridSize(); y += 1) {
                    const occupantId = this.context.grid.getOccupantUnitId({ x, y });
                    if (occupantId && occupantId !== draggingUnitId) occupiedKeys.push(`${x}:${y}`);
                }
            }
            const ownKeys = new Set(ownCells?.map((own) => `${own.x}:${own.y}`) ?? []);
            const blocked = new Set(occupiedKeys);
            const width = footprintWidthOf(selected);
            const height = footprintHeightOf(selected);
            // Every W x H block covering the cursor, best first — and crucially, a unit being REPOSITIONED
            // prefers the block it already stands on, so picking it up does not slide the proposed drop a
            // cell away while the mouse is still. See placementFootprintCandidates.
            const footprints = placementFootprintCandidates(
                cell,
                width,
                height,
                (anchor) => GridMath.isFootprintWithinGrid(gs, anchor, width, height),
                ownCells,
            );
            candidateCells =
                footprints.find((footprint) =>
                    footprint.every(
                        (candidate) =>
                            allowedForPath?.has((candidate.x << 4) | candidate.y) &&
                            (!blocked.has(`${candidate.x}:${candidate.y}`) ||
                                ownKeys.has(`${candidate.x}:${candidate.y}`)),
                    ),
                ) ?? [];

            // Fallback if pathing fails (e.g. void): just use the cell under mouse
            if (candidateCells.length === 0) {
                candidateCells = [cell];
            }
        } else {
            candidateCells = [cell];
        }

        // --- 2. (Removed) Aura & attack-range preview for the unplaced selection ---
        // Selecting a unit for placement (sandbox UnitsOverlay / ranked bench) used to project its
        // aura square + range circle at the candidate drop cell via a mock unit. Range visuals are
        // now reserved for units actually PLACED on the board (hovered/selected board units); the
        // cursor-following valid placement preview shows only the B&W creature; invalid placement keeps
        // the red footprint as its error feedback.

        // --- 3. Validation & Interaction Highlight ---

        // Case A: Void (Outside any placement zone) -> No Red Square, Just Return
        if (!teamFromPlacement) {
            this.resetHover(false); // keep aura
            return;
        }

        // Case B: Wrong Team Zone -> Red Square
        if (draggingUnitTeam && teamFromPlacement !== draggingUnitTeam) {
            this.hoverSelectedCells = candidateCells;
            this.hoverSelectedCellsSwitchToRed = true;
            this.hoverPlacementCell = cell;
            this.hoverPlacementCellTeam = teamFromPlacement;
            this.clearHoverSilhouette();
            return;
        }

        // Case C: Valid Team Zone, but placement invalid (Blocked / Not Allowed / Max Units)
        const allowedForTeam = this.context.placementManager.getAllowedPlacementCellHashesForTeam(teamFromPlacement);

        // Standard Validation Checks
        let invalid = false;

        // Check 1: Allowed Cells existence
        if (!allowedForTeam || allowedForTeam.size === 0) {
            invalid = true;
        }

        // Check 2: Large Unit Shape
        if (!invalid && isLarge) {
            const width = footprintWidthOf(selected);
            const height = footprintHeightOf(selected);
            if (candidateCells.length !== width * height) {
                // The fallback above degrades to the single cell under the cursor when no whole block
                // fits, and a partial body is never placeable.
                invalid = true;
            } else if (!this.context.pathHelper.areCellsFormingFootprint(candidateCells, width, height)) {
                invalid = true;
            }
        }

        // Check 3: Cells in Allowed Set
        if (!invalid) {
            for (const c of candidateCells) {
                const h = (c.x << 4) | c.y;
                if (!allowedForTeam?.has(h)) {
                    invalid = true;
                    break;
                }
            }
        }

        // Check 4: Occupied by another stack or terrain (that isn't the dragged unit itself).
        // The old check ignored terrain ids such as lava/water/mountains because they aren't in
        // UnitsHolder. That painted a green valid preview which the grid then rejected on click.
        if (!invalid) {
            for (const c of candidateCells) {
                const occId = this.context.grid.getOccupantUnitId(c);
                if (occId && occId !== draggingUnitId) {
                    invalid = true;
                    break;
                }
            }
        }

        // Check 5: Max Units Limit
        if (!invalid && !draggingUnitId) {
            // Only check count if spawning new, not moving existing
            // ... existing max unit check ...
            // Simplified: logic was checking "alliesPlacedCount >= maxUnitsForTeam"
            const leftBottomPlacement = this.context.getPlacement(TeamVals.LEFT, 0);
            const rightTopPlacement = this.context.getPlacement(TeamVals.RIGHT, 0);
            const leftTopPlacement = this.context.getPlacement(TeamVals.LEFT, 1);
            const rightBottomPlacement = this.context.getPlacement(TeamVals.RIGHT, 1);
            if (leftBottomPlacement && rightTopPlacement) {
                const alliesPlacedCount = this.context.unitsHolder.getAllAlliesPlaced(
                    teamFromPlacement,
                    leftBottomPlacement,
                    rightTopPlacement,
                    leftTopPlacement,
                    rightBottomPlacement,
                ).length;
                const maxUnitsForTeam = fightProps.getNumberOfUnitsAvailableForPlacement(teamFromPlacement);
                if (alliesPlacedCount >= maxUnitsForTeam) {
                    invalid = true;
                }
            }
        }

        // Handle Invalid Result
        if (invalid) {
            this.hoverSelectedCells = candidateCells;
            this.hoverSelectedCellsSwitchToRed = true;
            this.hoverPlacementCell = cell;
            this.hoverPlacementCellTeam = teamFromPlacement;
            return;
        }

        // --- 4. Success: Green/Blue Highlight ---
        this.hoverSelectedCells = candidateCells;
        this.hoverSelectedCellsSwitchToRed = false; // Green
        this.hoverPlacementCell = cell;
        this.hoverPlacementCellTeam = teamFromPlacement;
        // set silhouette if needed? existing code did clearHoverSilhouette() in failure cases.
        // Success case used generic drawHoverPlacementCell in SandboxDrawer?
        // No, SandboxDrawer draws hoverPlacementCell.
        if (!invalid && candidateCells.length > 0) {
            const logicalCenter = GridMath.getPositionForCells(gs, candidateCells);
            if (logicalCenter) {
                // Placement has no combat-active unit. Use the actual selected board/bench instance so
                // the preview clones its refreshed idle frame and framing instead of the legacy portrait.
                this.ensureHoverSilhouetteParams(
                    selected,
                    logicalCenter,
                    false,
                    this.context.getPlacementPreviewUnit(),
                    // Placement is a literal copy of the live creature. The legacy backing is hidden, but
                    // keeping its dormant transform exact also prevents a one-frame HMR flash at old scale.
                    true,
                );
            }
        } else {
            this.clearHoverSilhouette();
        }
    }
    public calculatePassiveHover(): void {
        // If we have an active selection, we shouldn't show passive hover
        if (this.context.hasActiveSelection()) {
            this.hoveredUnitHighlight = undefined;
            this.hoveredUnitId = undefined;
            return;
        }

        const p = this.context.getMouseWorld();
        const gs = this.context.sceneSettings.getGridSettings();

        // Find unit under mouse
        const cell = GridMath.getCellForPosition(gs, p);
        if (!cell) {
            this.hoveredUnitHighlight = undefined;
            this.hoveredUnitId = undefined;
            this.clearHoverSilhouette();
            return;
        }

        const occupantId = this.context.grid.getOccupantUnitId(cell);
        if (!occupantId) {
            this.hoveredUnitHighlight = undefined;
            this.hoveredUnitId = undefined;
            this.clearHoverSilhouette();
            return;
        }

        const unit = this.context.unitsHolder.getAllUnits().get(occupantId);
        if (!unit) {
            this.hoveredUnitHighlight = undefined;
            this.hoveredUnitId = undefined;
            this.clearHoverSilhouette();
            return;
        }

        // Prevent highlighting the unit we just placed for a brief moment (handled by Rearm)
        const nowSec = HoCLib.getTimeMillis() / 1000;
        if (
            this.lastPlacementUnitId &&
            nowSec - this.lastPlacementTimestampSec < this.hoverRearmDelaySec &&
            unit.getId() === this.lastPlacementUnitId
        ) {
            this.hoveredUnitHighlight = undefined;
            this.hoveredUnitId = undefined;
            this.clearHoverSilhouette();
            return;
        }

        this.hoveredUnitHighlight = this.getHighlightRectForUnit(unit);
        this.hoveredUnitId = unit.getId();
    }
}
