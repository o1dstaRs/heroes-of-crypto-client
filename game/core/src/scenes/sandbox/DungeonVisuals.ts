import { ColorMatrixFilter, Container, Filter, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import {
    GridSettings,
    GridVals,
    FightStateManager,
    GridConstants,
    GridMath,
    HoCConstants,
    HoCMath,
} from "@heroesofcrypto/common";

import { boardFitSize, boardFitVerticalShift } from "../../pixi/boardFit";
import { createDungeonLightFilter, updateDungeonLightUniforms } from "./DungeonLightFilter";

export interface IDungeonVisualsContext {
    getStage(): Container;
    getWorldRoot(): Container;
    getViewportSize(): { width: number; height: number };
    getGridSettings(): GridSettings;
    texAny(name: string): Texture | undefined;
    attachToWorldRoot(obj: Container, zIndex?: number): void;
}

/** A single-cell mountain: where it stands and which of the pool's variants it is drawn with. */
export interface IScatteredMountain {
    x: number;
    y: number;
    variant: number;
}

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
 * Eight deliberately different silhouettes of motion, one per tombstone atlas tile:
 * burst, left topple, right topple, crown-pop, heavy crumble, cross-split, spiral, and geyser.
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
    // The inset stone-framed meter is 15% narrower than the previous floating orange pip.
    width: cellSize * 0.36 * 0.85,
    height: Math.max(4, Math.round(cellSize * 0.045)),
    gap: 0,
    framePadding: Math.max(1, Math.round(cellSize * 0.01)),
    centerOffset: cellSize * 0.36,
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
    /** Screen-space fire spill around the animated 4x4 lava pool; kept below the world and units. */
    private lavaFireLight?: Container;
    private lavaFireLightBase?: Graphics;
    private lavaFireLightGroups: Graphics[] = [];
    private lavaFireLightTimeSec = 0;
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
     * The scattered-object art: 8 tombstones in a 4x2 atlas of 64x83 tiles, cut out of their painted ground
     * so only the stone itself is drawn — the board's own floor shows through around it, which is what makes
     * one read as an object standing on a cell rather than a square of scenery pasted over it.
     *
     * The cut is hand-made. Every automatic matte tried here failed the same way: the stone's dark faces are
     * exactly as dark as the shadowed floor and its lit tops exactly as warm as the lit floor, so no
     * threshold on brightness, warmth or distance-to-background separates them without eating the stone.
     *
     * Scaling MUST premultiply alpha (see setScatteredMountains' caller): under the transparent pixels the
     * source still carries floor colour, and a plain resize blends it into the edge as a pale halo.
     */
    private static readonly MOUNTAIN_TILES_KEY = "tombstone_tiles_64_atlas";
    /** One cell wide; taller than it is wide, and the surplus is the part that overhangs (see below). */
    private static readonly MOUNTAIN_TILE_W = 64;
    private static readonly MOUNTAIN_TILE_H = 83;
    private static readonly MOUNTAIN_TILE_COLS = 4;
    private static readonly MOUNTAIN_TILE_COUNT = 8;
    private mountainTileTextures?: Texture[];
    /**
     * How tall the rock is drawn, in cells — and it must match the atlas tile's own aspect (64x83), which is
     * where the overhang is baked. Width stays exactly one cell: this is a stretch upward, not a uniform
     * blow-up, because growing both axes fattens the boulder into its neighbours sideways.
     *
     * The surplus is alpha-cut in the artwork so only the ROCK crosses the grid line. Drawn opaque, the
     * tile's square backing went up with it and every mountain read as a tall block sitting in two cells
     * instead of a peak leaning into the one above.
     */
    private static readonly MOUNTAIN_HEIGHT_CELLS = 83 / 64;
    /** How far the occupied cell is darkened, under the stone. */
    private static readonly MOUNTAIN_CELL_SHADE = 0.35;
    /** One entry per standing mountain: which cell it occupies and which variant it wears. */
    private scatteredMountains: IScatteredMountain[] = [];
    /** Stays true after the final tombstone dies, so the removed classic mountains never become a fallback. */
    private scatteredMountainMode = false;
    private scatteredMountainSprites: Sprite[] = [];
    /** One shade per occupied cell, drawn under its stone. */
    private scatteredMountainShades: Graphics[] = [];
    /** White alpha-silhouette rings per stone, exposed only while that stone is targeted. */
    private scatteredMountainOutlines: Container[] = [];
    private tombstoneWhiteFilter?: ColorMatrixFilter;
    private tombstoneColorFilter?: ColorMatrixFilter;
    /** One single-pip HP rail per tombstone: every scattered stone takes exactly one hit. */
    private scatteredMountainHitBars: Graphics[] = [];
    private narrowingLayers = 0;
    /**
     * The molten centre, animated: an 8x8 atlas of 256px frames, 60 of them, a 5s loop at 12fps.
     *
     * The artwork is one 4x4 block of cells. Its original, softly glowing grout stays inside one sprite;
     * only the block's outer footprint is inset slightly so it does not touch the surrounding stone rim.
     *
     * The loop is closed with a cross-dissolve rather than a hard cut: measured, the wrap now differs by
     * 0.83/255 against 1.63 for an ordinary frame step, so the repeat is less of a change than the
     * animation's own motion and cannot be spotted.
     */
    private static readonly LAVA_ANIM_KEY = "lava_center_anim_atlas";
    private static readonly LAVA_ANIM_FRAME_PX = 256;
    private static readonly LAVA_ANIM_COLS = 8;
    private static readonly LAVA_ANIM_FRAMES = 60;
    private static readonly LAVA_ANIM_FPS = 12;
    /** Slightly inset inside the logical 4x4 obstacle; the atlas's original internal grout is preserved. */
    private static readonly LAVA_POOL_DRAW_CELLS = 3.86;
    private lavaAnimFrames?: Texture[];
    public constructor(context: IDungeonVisualsContext) {
        this.context = context;
        this.holeContainer = new Container();
        this.holeContainer.sortableChildren = true;
    }
    public getHoleContainer(): Container {
        return this.holeContainer;
    }
    public clearHoleLayers(): void {
        this.holeContainer.removeChildren();
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
            const worldX = worldMinX + cellIdxX * cellSize;
            const worldY = worldMinY + cellIdxY * cellSize;
            holeGfx.rect(worldX, worldY, cellSize, cellSize).fill({ color: 0x000000, alpha: 0.7 });
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
        const idx = Math.floor((performance.now() / 1000) * DungeonVisuals.LAVA_ANIM_FPS) % frames.length;
        return frames[idx];
    }
    /** Slice the mountain atlas once; undefined until the texture has loaded. */
    private mountainTiles(): Texture[] | undefined {
        if (!this.mountainTileTextures) {
            const atlas = this.context.texAny(DungeonVisuals.MOUNTAIN_TILES_KEY);
            if (!atlas) {
                return undefined;
            }
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
            this.mountainTileTextures = frames;
        }
        return this.mountainTileTextures;
    }
    /**
     * Install the scattered-mountain layout to draw. Pass an empty array to go back to the classic pair.
     *
     * Sprites are rebuilt from scratch rather than diffed: this runs when the board type is picked or a
     * mountain is destroyed, never per frame, and nine sprites are far cheaper to recreate than to reconcile.
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
            outline.visible =
                !!mountain && this.isScatteredMountainActive(mountain) && targets.has(`${mountain.x}:${mountain.y}`);
        });
    }
    public clearScatteredMountainHighlight(): void {
        for (const outline of this.scatteredMountainOutlines) outline.visible = false;
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
        for (const hitBar of this.scatteredMountainHitBars) {
            hitBar.destroy();
        }
        for (const shade of this.scatteredMountainShades) {
            shade.destroy();
        }
        this.scatteredMountainSprites = [];
        this.scatteredMountainOutlines = [];
        this.scatteredMountainHitBars = [];
        this.scatteredMountainShades = [];
        const tiles = this.mountainTiles();
        if (!tiles?.length || !this.scatteredMountains.length) {
            return;
        }
        const gs = this.context.getGridSettings();
        const cellSize = gs.getCellSize();
        if (!this.tombstoneWhiteFilter) {
            this.tombstoneWhiteFilter = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
            // Replace RGB with warm white while preserving the texture's alpha exactly. Sprite.tint cannot
            // do this: white tint merely multiplies the original dark stone and therefore stays dark.
            this.tombstoneWhiteFilter.matrix = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0.99, 0, 0, 0, 0, 0.95, 0, 0, 0, 1, 0];
        }
        if (!this.tombstoneColorFilter) {
            this.tombstoneColorFilter = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
            // ASH treatment: lift the dark atlas into a cool slate-grey range, with progressively more blue
            // in the shadows and midtones. The steeper response keeps carved recesses and chipped edges crisp
            // instead of flattening the whole tombstone into one pale value. Alpha remains untouched.
            this.tombstoneColorFilter.matrix = [
                1.16, 0.05, 0.02, 0, 0.105, 0.04, 1.17, 0.03, 0, 0.12, 0.03, 0.06, 1.18, 0, 0.15, 0, 0, 0, 1, 0,
            ];
        }
        const drawnHeight = cellSize * DungeonVisuals.MOUNTAIN_HEIGHT_CELLS;
        // Stand the rock on the cell's floor: the sprite is anchored at its middle, so lifting it by half
        // the surplus puts its base exactly on the cell's bottom edge and every extra pixel above it.
        const riseUp = (drawnHeight - cellSize) * 0.5;
        for (const mountain of this.scatteredMountains) {
            const tileIndex = ((mountain.variant % tiles.length) + tiles.length) % tiles.length;
            const tex = tiles[tileIndex];
            const at = GridMath.getPositionForCell(
                { x: mountain.x, y: mountain.y },
                gs.getMinX(),
                gs.getStep(),
                gs.getHalfStep(),
            );

            // Shade the occupied square before the stone goes on it: an object standing on a cell throws
            // the cell into shadow, and it also tells the player at a glance which square is taken — the
            // silhouette alone is ambiguous once it leans into the row above. Sits under every stone (49),
            // so a nearer stone's overhang still covers a farther cell's shade.
            const shade = new Graphics();
            shade.rect(at.x - cellSize * 0.5, at.y - cellSize * 0.5, cellSize, cellSize);
            shade.fill({ color: 0x000000, alpha: DungeonVisuals.MOUNTAIN_CELL_SHADE });
            this.context.attachToWorldRoot(shade, 49);
            this.scatteredMountainShades.push(shade);

            const sprite = new Sprite(tex);
            sprite.anchor.set(0.5);
            sprite.roundPixels = true;
            sprite.x = at.x;
            // World Y grows upward (the world root carries the flip), so adding lifts the rock on screen.
            sprite.y = at.y + riseUp;
            // Width stays one cell; only the height is stretched. scale.y is negative because the world
            // root is y-flipped, exactly as the other terrain does.
            sprite.scale.set(cellSize / tex.width, -(drawnHeight / tex.height));
            sprite.filters = this.tombstoneColorFilter;
            // Depth order: a stone standing lower on the board is NEARER, so its overhanging top must cover
            // the base of the one behind it. Cell y counts upward on screen, so a smaller y sorts in front.
            // The offset stays inside one unit, which keeps every stone below whatever already sits at 51+.
            const depth = (GridConstants.GRID_SIZE - 1 - mountain.y) / GridConstants.GRID_SIZE;
            this.context.attachToWorldRoot(sprite, 50 + depth);
            this.scatteredMountainSprites.push(sprite);

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
                { offset: Math.max(1.5, cellSize * 0.024), alpha: 0.09 },
                { offset: Math.max(0.35, cellSize * 0.004), alpha: 0.52 },
            ]) {
                for (const [dx, dy] of directions) {
                    const edge = new Sprite(tex);
                    edge.anchor.set(0.5);
                    edge.roundPixels = true;
                    edge.position.set(sprite.x + dx * offset, sprite.y + dy * offset);
                    edge.scale.copyFrom(sprite.scale);
                    edge.filters = this.tombstoneWhiteFilter;
                    edge.alpha = alpha;
                    outline.addChild(edge);
                }
            }
            outline.visible = false;
            this.context.attachToWorldRoot(outline, 50 + depth - 0.001);
            this.scatteredMountainOutlines.push(outline);

            // A single compact pip under the base communicates the whole durability model: one remaining
            // segment means one hit to destroy. It stays close to the stone and reads as a HUD accent,
            // rather than a second object occupying the cell.
            const hitBar = new Graphics();
            const hitBarLayout = getScatteredMountainHitBarLayout(cellSize);
            const barW = hitBarLayout.width;
            const barH = hitBarLayout.height;
            const barX = at.x - barW * 0.5;
            const barY = at.y - hitBarLayout.centerOffset - barH * 0.5;
            const frame = hitBarLayout.framePadding;
            const radius = Math.max(1, barH * 0.18);
            hitBar
                .roundRect(barX - frame, barY - frame, barW + frame * 2, barH + frame * 2, radius + frame)
                .fill({ color: 0x0b0c0e, alpha: 0.94 })
                .stroke({ width: 1, color: 0x777b80, alpha: 0.82 });
            hitBar
                .roundRect(barX, barY, barW, barH, radius)
                .fill({ color: 0x75150f, alpha: 1 })
                .stroke({ width: 1, color: 0x3b0b08, alpha: 0.96 });
            hitBar
                .roundRect(barX + frame, barY + frame, barW - frame * 2, Math.max(1, barH * 0.18), radius)
                .fill({ color: 0xb54434, alpha: 0.42 });
            hitBar.visible = FightStateManager.getInstance().getFightProperties().hasFightStarted();
            this.context.attachToWorldRoot(hitBar, 52 + depth);
            this.scatteredMountainHitBars.push(hitBar);
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
    private syncScatteredMountainVisibility(): void {
        this.scatteredMountains.forEach((mountain, index) => {
            const visible = this.isScatteredMountainActive(mountain);
            if (this.scatteredMountainSprites[index]) this.scatteredMountainSprites[index].visible = visible;
            if (this.scatteredMountainHitBars[index]) this.scatteredMountainHitBars[index].visible = visible;
            if (!visible && this.scatteredMountainOutlines[index]) {
                this.scatteredMountainOutlines[index].visible = false;
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
        const scatteredBarsVisible = FightStateManager.getInstance().getFightProperties().hasFightStarted();
        this.scatteredMountainHitBars.forEach((hitBar, index) => {
            const mountain = this.scatteredMountains[index];
            hitBar.visible = scatteredBarsVisible && !!mountain && this.isScatteredMountainActive(mountain);
        });
        const gridType = FightStateManager.getInstance().getFightProperties().getGridType();
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

        const animated = gridType === GridVals.LAVA_CENTER && !this.centerDried ? this.lavaAnimTexture() : undefined;
        const tex = animated ?? this.context.texAny(texKey);
        if (!tex) {
            if (this.centerTerrainSprite) this.centerTerrainSprite.visible = false;
            return;
        }

        const gs = this.context.getGridSettings();
        const centerX = (gs.getMinX() + gs.getMaxX()) * 0.5;
        const centerY = (gs.getMinY() + gs.getMaxY()) * 0.5;

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

        if (gridType === GridVals.BLOCK_CENTER) {
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
            const drawCells =
                gridType === GridVals.LAVA_CENTER && !this.centerDried ? DungeonVisuals.LAVA_POOL_DRAW_CELLS : 4;
            const targetW = cellSize * drawCells;
            const targetH = cellSize * drawCells;
            this.centerTerrainSprite.scale.set(targetW / texW, -(targetH / texH));
            this.centerTerrainSprite.x = centerX;
            this.centerTerrainSprite.y = centerY;
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
            left: GridMath.getPositionForCells(gs, cellsFor([mid - 3, mid - 2]))!,
            right: GridMath.getPositionForCells(gs, cellsFor([mid + 1, mid + 2]))!,
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
        const cellSize = gs.getCellSize();
        const drawnHeight = cellSize * DungeonVisuals.MOUNTAIN_HEIGHT_CELLS;
        const riseUp = (drawnHeight - cellSize) * 0.5;
        const center = GridMath.getPositionForCell(
            { x: mountain.x, y: mountain.y },
            gs.getMinX(),
            gs.getStep(),
            gs.getHalfStep(),
        );
        center.y += riseUp;
        const quarters = this.getMountainQuarterTextures(tex);
        const chunkW = cellSize * 0.5;
        const chunkH = drawnHeight * 0.5;
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
                sprite.filters = this.tombstoneColorFilter;
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
                    vx: profile.vx[index] * cellSize * jitter,
                    vy: profile.vy[index] * cellSize * jitter,
                    spin: profile.spin[index] * jitter,
                    floorY: center.y - drawnHeight * 0.5,
                    delayMs: profile.delayMs[index],
                });
            }
        }
        const dust: IMountainDustPuff[] = [];
        const dustCount = profile.dustCount;
        for (let i = 0; i < dustCount; i++) {
            const gfx = new Graphics();
            const t = i / (dustCount - 1);
            const radius = cellSize * (0.045 + 0.055 * Math.abs(Math.sin(i * 31.71)));
            gfx.circle(0, 0, radius).fill({ color: profile.dust[i % profile.dust.length], alpha: 1 });
            gfx.alpha = 0;
            gfx.x = center.x - cellSize * 0.42 + cellSize * 0.84 * t;
            gfx.y = center.y - drawnHeight * 0.5;
            container.addChild(gfx);
            dust.push({
                gfx,
                vx: (t - 0.5) * cellSize,
                vy: cellSize * (0.28 + 0.38 * Math.abs(Math.sin(i * 17.3))),
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
        this.activeCollapses = this.activeCollapses.filter((collapse) => {
            const t = now - collapse.startMs;
            if (t >= MC_TOTAL_MS) {
                collapse.container.destroy({ children: true });
                return false;
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
                return true;
            }

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
            return true;
        });
    }
    /**
     * The board's floor texture. Only the base painting is swappable — the dungeon lighting overlay, the
     * atmosphere alpha and every other effect layered on top read nothing from this key and are unaffected.
     *
     * TEMPORARY: `background_new` is the previous floor, kept reachable so the sandbox toggle can put the
     * two side by side (see Sandbox.setLegacyBoardBackground). Drop the pair and inline the winner once the
     * comparison is settled.
     */
    private static readonly BG_KEY_CURRENT = "background_stone_tiles_sinister_16x16";
    private static readonly BG_KEY_LEGACY = "background_new";
    /** The animated pool is 4x4; its warm spill reaches one more cell on every side, making a 6x6 area. */
    private static readonly LAVA_LIGHT_AREA_CELLS = 6;
    private static readonly FLOOR_SOURCE_TILE_PX = 128;
    /**
     * Squares painted across the current floor texture — exactly the board's own GRID_SIZE, so the map
     * shows 16x16 and nothing else. Keep this in step with the artwork: the sprite is sized from it, so one
     * painted square stays exactly one cell.
     */
    private static readonly FLOOR_TILES_ACROSS = GridConstants.GRID_SIZE;
    private useLegacyBackground = false;
    /** Switch the floor painting. The next layoutBackgroundSquare re-reads the key and swaps the texture. */
    public setLegacyBackground(enabled: boolean): void {
        this.useLegacyBackground = enabled;
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
        this.ensureLavaFireLight();
        this.clearExperimentalBackgroundFilters();
    }
    /**
     * Build a smooth, shader-free fire spill. Many very translucent overlapping shapes produce a soft
     * falloff without a BlurFilter, keeping this localized effect safe on the WebGL paths where full-floor
     * filters previously rendered the board black.
     */
    private ensureLavaFireLight(): void {
        if (this.lavaFireLight) return;

        const root = new Container();
        root.eventMode = "none";
        root.visible = false;
        root.zIndex = -18;

        const tilePx = DungeonVisuals.FLOOR_SOURCE_TILE_PX;
        const areaPx = DungeonVisuals.LAVA_LIGHT_AREA_CELLS * tilePx;
        const spillPx = tilePx;
        const base = new Graphics();
        base.eventMode = "none";
        base.blendMode = "add";

        // Rounded-square distance-field approximation: the outer edge is deep ember, becoming amber where
        // it touches the pool. Thirty-two sub-percent layers are visually continuous at any board scale.
        const gradientLayers = 32;
        for (let i = 0; i < gradientLayers; i++) {
            const t = i / (gradientLayers - 1);
            const inset = t * spillPx;
            const side = areaPx - inset * 2;
            const r = Math.round(0x66 + (0xff - 0x66) * t);
            const g = Math.round(0x0d + (0x69 - 0x0d) * t);
            const b = Math.round(0x02 + (0x12 - 0x02) * t);
            const color = (r << 16) | (g << 8) | b;
            const radius = (1 - t) * tilePx * 0.46 + t * tilePx * 0.12;
            base.roundRect(inset, inset, side, side, radius).fill({
                color,
                alpha: 0.009 + t * 0.009,
            });
        }

        const edgeGroups = Array.from({ length: 4 }, () => {
            const group = new Graphics();
            group.eventMode = "none";
            group.blendMode = "add";
            return group;
        });
        const innerEdge = tilePx;
        const sourceOffsets = [1.5, 2.5, 3.5, 4.5].map((cell) => cell * tilePx);
        const drawLobe = (gfx: Graphics, x: number, y: number, horizontal: boolean): void => {
            const lobeLayers = 9;
            for (let layer = 0; layer < lobeLayers; layer++) {
                const t = layer / (lobeLayers - 1);
                const longRadius = tilePx * (0.82 - t * 0.56);
                const shortRadius = tilePx * (0.56 - t * 0.35);
                gfx.ellipse(x, y, horizontal ? longRadius : shortRadius, horizontal ? shortRadius : longRadius).fill({
                    color: t > 0.62 ? 0xff9a2a : 0xd73d08,
                    alpha: 0.009 + t * 0.012,
                });
            }
        };
        for (const offset of sourceOffsets) {
            drawLobe(edgeGroups[0], offset, innerEdge, true);
            drawLobe(edgeGroups[1], offset, areaPx - innerEdge, true);
            drawLobe(edgeGroups[2], innerEdge, offset, false);
            drawLobe(edgeGroups[3], areaPx - innerEdge, offset, false);
        }

        root.addChild(base, ...edgeGroups);
        const stage = this.context.getStage();
        stage.sortableChildren = true;
        stage.addChild(root);
        this.lavaFireLight = root;
        this.lavaFireLightBase = base;
        this.lavaFireLightGroups = edgeGroups;
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
            lavaFireLightVisible: !!this.lavaFireLight?.visible,
            lavaFireLightGroups: this.lavaFireLightGroups.length,
            clockSeconds: Number(this.lavaFireLightTimeSec.toFixed(2)),
        };
    }
    /**
     * Advances the flame clock in REAL seconds, deliberately ignoring the simulation's step.
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
        const root = this.lavaFireLight;
        const base = this.lavaFireLightBase;
        if (!root || !base || !root.visible) return;

        // Fire has a common body plus faster, slightly independent edge flicker. The source never blinks
        // out and no single clean sine dominates, so the pool feels hot rather than electrically pulsed.
        const t = performance.now() / 1000;
        this.lavaFireLightTimeSec = t;
        const body = Math.max(
            0.45,
            Math.min(
                1,
                0.76 + Math.sin(t * 3.7) * 0.09 + Math.sin(t * 7.9 + 1.1) * 0.065 + Math.sin(t * 15.3 + 2.7) * 0.035,
            ),
        );
        root.alpha = 0.62 + body * 0.14;
        base.alpha = 0.7 + body * 0.12;
        for (let i = 0; i < this.lavaFireLightGroups.length; i++) {
            const edge = Math.sin(t * (5.8 + i * 0.77) + i * 1.63) * 0.12;
            this.lavaFireLightGroups[i].alpha = Math.max(0.48, Math.min(0.86, 0.62 + body * 0.16 + edge * 0.6));
        }
    }
    public layoutBackgroundSquare(alpha: number): void {
        if (!this.bgSprite) return;
        const { width: vw, height: vh } = this.context.getViewportSize();
        // The legacy floor is painted at exactly 16 squares, so it must match the camera's fit (see boardFit):
        // this sprite is screen-space, not under the camera, so it does not inherit the padding the world is
        // fitted with — take it from the same place instead, or the painted squares end up larger than the
        // grid drawn on them and units drift off centre.
        //
        // The current floor is painted at exactly those 16 squares, so it is drawn at exactly the fitted
        // board size too: all 16 columns and rows are whole and fully on screen, none sliced by the window
        // or hidden under a side panel, and the fit padding around it stays bare by design.
        const size = (boardFitSize(vw, vh) * DungeonVisuals.FLOOR_TILES_ACROSS) / GridConstants.GRID_SIZE;
        const x = vw * 0.5;
        // The same nudge the camera applies, taken from the same helper — the floor must not drift off the
        // grid, so both read the offset from one place.
        const y = vh * 0.5 - boardFitVerticalShift(vw, vh);
        if (this.bgSprite.x !== x || this.bgSprite.y !== y) {
            this.bgSprite.position.set(x, y);
        }
        if (this.bgSprite.width !== size || this.bgSprite.height !== size) {
            this.bgSprite.width = size;
            this.bgSprite.height = size;
        }
        const wantKey = this.backgroundKey();
        const wantTex = this.context.texAny(wantKey) ?? this.backgroundTexture();

        if (wantTex && this.bgSprite.texture !== wantTex) {
            this.bgSprite.texture = wantTex;
        }

        const gridType = FightStateManager.getInstance().getFightProperties().getGridType();
        const tileSize = size / DungeonVisuals.FLOOR_TILES_ACROSS;
        const lightSize = tileSize * DungeonVisuals.LAVA_LIGHT_AREA_CELLS;
        if (this.lavaFireLight) {
            this.lavaFireLight.visible =
                gridType === GridVals.LAVA_CENTER && !this.centerDried && !this.useLegacyBackground;
            if (this.lavaFireLight.visible) {
                this.lavaFireLight.position.set(x - lightSize * 0.5, y - lightSize * 0.5);
                this.lavaFireLight.scale.set(tileSize / DungeonVisuals.FLOOR_SOURCE_TILE_PX);
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
    public attachCenterTerrainSprite(): void {
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
