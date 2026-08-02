import { Container, Filter, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import {
    GridSettings,
    GridVals,
    FightStateManager,
    GridConstants,
    GridMath,
    HoCConstants,
} from "@heroesofcrypto/common";

import { boardFitSize, boardFitVerticalShift } from "../../pixi/boardFit";
import { createDungeonLightFilter, updateDungeonLightUniforms } from "./DungeonLightFilter";
import { createFireLightFilter, updateFireLightUniforms } from "./FireLightFilter";

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
     * The scattered-mountain art: 6 rocks in a 3x2 atlas of 64x83 tiles, cut out of their painted ground
     * so only the rock itself is drawn — the board's own floor shows through around it, which is what makes
     * a mountain read as an object standing on a cell rather than a square of scenery pasted over it.
     *
     * The cut is a filled SILHOUETTE, not a colour key: the rock's dark faces are as dark as the shadowed
     * ground and its lit tops are as warm as the lit ground, so no threshold separates them. Detecting the
     * outline and flooding the outside does, and then everything the outline encloses is rock.
     */
    private static readonly MOUNTAIN_TILES_KEY = "mountain_tiles_64_atlas";
    /** One cell wide; taller than it is wide, and the surplus is the part that overhangs (see below). */
    private static readonly MOUNTAIN_TILE_W = 64;
    private static readonly MOUNTAIN_TILE_H = 83;
    private static readonly MOUNTAIN_TILE_COLS = 3;
    private static readonly MOUNTAIN_TILE_COUNT = 6;
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
    /** One entry per standing mountain: which cell it occupies and which variant it wears. */
    private scatteredMountains: IScatteredMountain[] = [];
    private scatteredMountainSprites: Sprite[] = [];
    /**
     * The molten centre, animated: an 8x8 atlas of 256px frames, 60 of them, a 5s loop at 12fps.
     *
     * The artwork is one 4x4 block of cells, and its own tile lattice was resampled cell-by-cell onto exact
     * 64px quarters when the atlas was built — so the animation's grout lines sit on the board's cell edges
     * rather than merely near them. It replaces the still lava_256 on exactly the same sprite, which means
     * the existing placement (dead centre, scaled to four cells) already puts it on the right squares.
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
    public setScatteredMountains(mountains: IScatteredMountain[]): void {
        this.scatteredMountains = mountains.map((m) => ({ ...m }));
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
        this.scatteredMountainSprites = [];
        const tiles = this.mountainTiles();
        if (!tiles?.length || !this.scatteredMountains.length) {
            return;
        }
        const gs = this.context.getGridSettings();
        const cellSize = gs.getCellSize();
        const drawnHeight = cellSize * DungeonVisuals.MOUNTAIN_HEIGHT_CELLS;
        // Stand the rock on the cell's floor: the sprite is anchored at its middle, so lifting it by half
        // the surplus puts its base exactly on the cell's bottom edge and every extra pixel above it.
        const riseUp = (drawnHeight - cellSize) * 0.5;
        for (const mountain of this.scatteredMountains) {
            const tex = tiles[((mountain.variant % tiles.length) + tiles.length) % tiles.length];
            const at = GridMath.getPositionForCell(
                { x: mountain.x, y: mountain.y },
                gs.getMinX(),
                gs.getStep(),
                gs.getHalfStep(),
            );
            const sprite = new Sprite(tex);
            sprite.anchor.set(0.5);
            sprite.x = at.x;
            // World Y grows upward (the world root carries the flip), so adding lifts the rock on screen.
            sprite.y = at.y + riseUp;
            // Width stays one cell; only the height is stretched. scale.y is negative because the world
            // root is y-flipped, exactly as the other terrain does.
            sprite.scale.set(cellSize / tex.width, -(drawnHeight / tex.height));
            this.context.attachToWorldRoot(sprite, 50);
            this.scatteredMountainSprites.push(sprite);
        }
    }
    public hasScatteredMountains(): boolean {
        return this.scatteredMountains.length > 0;
    }
    public ensureCenterTerrainSprite(): void {
        // A layout that arrived before its atlas did has no sprites yet — build them the first frame the
        // texture is available. Once they exist this costs one length comparison; mountainTiles() returns
        // undefined and this returns straight back out while the atlas is still loading.
        if (this.scatteredMountains.length && !this.scatteredMountainSprites.length) {
            this.rebuildScatteredMountainSprites();
        }
        const gridType = FightStateManager.getInstance().getFightProperties().getGridType();
        // Runs BEFORE the both-mountains-destroyed early return below — the collapse of the final
        // mountain must still be detected and stepped after its sprite is hidden.
        if (gridType === GridVals.BLOCK_CENTER) {
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
                // Still art is the fallback only; the live pool is the animated atlas resolved below. It is
                // drawn even on the floor that already has lava painted into it, because it covers exactly
                // the same four-by-four block — so it replaces that paint rather than stacking on it.
                texKey = this.centerDried ? "lava_frozen_256" : "lava_256";
                break;
            case GridVals.BLOCK_CENTER:
                // A scattered layout owns the rock entirely — its own per-cell sprites are already on the
                // board, so the classic pair (and its HP bars) must stay off.
                texKey = this.hasScatteredMountains() ? undefined : "mountain_432_412";
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

        const gs = this.context.getGridSettings();
        const centerX = (gs.getMinX() + gs.getMaxX()) * 0.5;
        const centerY = (gs.getMinY() + gs.getMaxY()) * 0.5;
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
            const targetW = cellSize * 4;
            const targetH = cellSize * 4;
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
    private drawOneHitBar(bar: Graphics, cx: number, cy: number, layout: IMountainHitBarLayout, hits: number): void {
        const totalHits = HoCConstants.HITS_PER_MOUNTAIN;
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
        const quarters: Texture[] = [];
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 2; col++) {
                quarters.push(
                    new Texture({ source: tex.source, frame: new Rectangle(col * halfW, row * halfH, halfW, halfH) }),
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
    /** Advance every active collapse; called each frame from ensureCenterTerrainSprite. */
    private stepMountainCollapses(): void {
        if (!this.activeCollapses.length) {
            return;
        }
        const now = performance.now();
        const cellSize = this.context.getGridSettings().getCellSize();
        const gravity = -cellSize * MC_GRAVITY_CELLS;
        this.activeCollapses = this.activeCollapses.filter((collapse) => {
            const t = now - collapse.startMs;
            if (t >= MC_TOTAL_MS) {
                collapse.container.destroy({ children: true });
                return false;
            }
            // Clamped so a hitched frame (tab switch) doesn't teleport chunks through the floor.
            const dt = Math.min(0.05, (now - collapse.lastStepMs) / 1000);
            collapse.lastStepMs = now;
            const fade =
                t <= MC_FADE_START_MS
                    ? 1
                    : Math.max(0, 1 - (t - MC_FADE_START_MS) / (MC_FADE_END_MS - MC_FADE_START_MS));

            if (t < MC_SHUDDER_MS) {
                // The assembled block trembles: all four quarters jitter around their home position.
                const mag = cellSize * 0.035 * (t / MC_SHUDDER_MS);
                for (const [index, chunk] of collapse.chunks.entries()) {
                    chunk.sprite.x = chunk.homeX + Math.sin(now * 0.09 + index * 1.7) * mag;
                    chunk.sprite.y = chunk.homeY + Math.sin(now * 0.11 + index * 2.3) * mag;
                }
                return true;
            }

            for (const chunk of collapse.chunks) {
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
    private static readonly BG_KEY_CURRENT = "background_stone_tiles";
    private static readonly BG_KEY_LEGACY = "background_new";
    /**
     * The lava board gets its OWN painting rather than the plain floor plus a lava sprite: the artwork
     * carries different lighting for it — the room reads darker and colder away from the pool, which a
     * decal pasted onto the neutral floor cannot reproduce. The molten centre is painted into it, so the
     * separate hot-lava sprite is suppressed while this floor is up (see ensureCenterTerrainSprite).
     */
    private static readonly BG_KEY_LAVA = "background_stone_tiles_lava";
    /**
     * Squares painted across the current floor texture — exactly the board's own GRID_SIZE, so the map
     * shows 16x16 and nothing else. Keep this in step with the artwork: the sprite is sized from it, so one
     * painted square stays exactly one cell.
     */
    private static readonly FLOOR_TILES_ACROSS = GridConstants.GRID_SIZE;
    private useLegacyBackground = false;
    /**
     * Brings the floor's PAINTED lighting to life (see FireLightFilter). Only the current texture carries
     * its own light, so the legacy floor never gets this pass — there would be nothing lit for it to work
     * on, and the shader would find no warm texels to modulate anyway.
     */
    private fireLightFilter?: Filter;
    private fireLightTimeSec = 0;
    /** performance.now() at the previous tick; 0 until the first one. See updateFireLight for why. */
    private fireLightLastMs = 0;
    /** Switch the floor painting. The next layoutBackgroundSquare re-reads the key and swaps the texture. */
    public setLegacyBackground(enabled: boolean): void {
        this.useLegacyBackground = enabled;
        this.syncFireLightFilter();
    }
    public isLegacyBackground(): boolean {
        return this.useLegacyBackground;
    }
    private backgroundKey(): string {
        if (this.useLegacyBackground) {
            return DungeonVisuals.BG_KEY_LEGACY;
        }
        return this.hasBakedLavaFloor() ? DungeonVisuals.BG_KEY_LAVA : DungeonVisuals.BG_KEY_CURRENT;
    }
    /**
     * True only when the lava board is being played AND its painting is actually present.
     *
     * The texture check is the whole point of asking rather than assuming: if the art is missing the board
     * falls back to the plain floor with its lava sprite — the pre-existing look — instead of failing to
     * draw a floor at all. layoutBackgroundSquare likewise only swaps when the texture resolves.
     */
    private hasBakedLavaFloor(): boolean {
        if (this.useLegacyBackground) {
            return false;
        }
        const gridType = FightStateManager.getInstance().getFightProperties().getGridType();
        if (gridType !== GridVals.LAVA_CENTER) {
            return false;
        }
        return !!this.context.texAny(DungeonVisuals.BG_KEY_LAVA);
    }
    public ensureBackgroundSprite(): void {
        if (this.bgSprite) return;
        const tex = this.context.texAny(this.backgroundKey());
        if (!tex) return;

        const bg = new Sprite(tex);
        bg.anchor.set(0.5);
        // Behind the dungeon floor-lighting overlay (-10); both stay below the world/units (camera @0).
        const stage = this.context.getStage();
        stage.sortableChildren = true;
        bg.zIndex = -20;
        stage.addChild(bg);
        this.bgSprite = bg;
        this.syncFireLightFilter();
        // We can call layout here if we want/can
    }
    /**
     * Attach the fire-light pass to the floor sprite, or take it off for the unlit legacy texture.
     *
     * Built once and kept, so flipping the floor back and forth doesn't recompile the shader; if the
     * shader failed to build at all the floor simply renders as painted, which is a perfectly good board.
     */
    private syncFireLightFilter(): void {
        const bg = this.bgSprite;
        if (!bg) {
            return;
        }
        const wanted = !this.useLegacyBackground;
        if (wanted && !this.fireLightFilter) {
            this.fireLightFilter = createFireLightFilter();
        }
        const filter = this.fireLightFilter;
        if (!filter) {
            return;
        }
        const attached = Array.isArray(bg.filters) && bg.filters.includes(filter);
        if (wanted && !attached) {
            bg.filters = [filter];
        } else if (!wanted && attached) {
            bg.filters = [];
        }
    }
    /**
     * Advance the fire-light clock. Called every frame from the scene's render loop; nothing else in this
     * layer is time-driven, so this is a no-op whenever the floor has no painted light to animate.
     */
    /**
     * Live state of the floor's fire-light pass, for the dev console (window.__hocFloorLight).
     *
     * Exists because this effect is invisible when it fails: the floor still renders, just frozen, so
     * there is nothing on screen to tell "the shader never built" apart from "the clock never ticks" or
     * "the filter is not on the sprite". Each of those is a different bug and this names which one.
     */
    public getFireLightDiagnostics(): Record<string, unknown> {
        const sprite = this.bgSprite;
        return {
            spriteExists: !!sprite,
            shaderBuilt: !!this.fireLightFilter,
            filtersOnSprite: Array.isArray(sprite?.filters) ? sprite.filters.length : 0,
            filterAttached:
                !!this.fireLightFilter && Array.isArray(sprite?.filters)
                    ? sprite.filters.includes(this.fireLightFilter)
                    : false,
            legacyFloor: this.useLegacyBackground,
            clockSeconds: Number(this.fireLightTimeSec.toFixed(2)),
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
        if (!this.fireLightFilter || this.useLegacyBackground) {
            return;
        }
        const nowMs = performance.now();
        if (this.fireLightLastMs === 0) {
            this.fireLightLastMs = nowMs;
        }
        // Clamped exactly like the sim loop clamps its own dt: a backgrounded tab resumes with a huge gap,
        // and letting that through would jump the flame instead of continuing it.
        const dt = Math.min(Math.max((nowMs - this.fireLightLastMs) / 1000, 0), 0.1);
        this.fireLightLastMs = nowMs;
        this.fireLightTimeSec += dt;
        // Keep the value small enough that a 32-bit float still resolves the fast octaves. Wrapping costs
        // one imperceptible reseed of the noise per ~3h session; drifting into float mush costs the flicker.
        if (this.fireLightTimeSec > 10000) {
            this.fireLightTimeSec -= 10000;
        }
        updateFireLightUniforms(this.fireLightFilter, this.fireLightTimeSec, 1);
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
        const wantTex = this.context.texAny(wantKey);

        if (wantTex && this.bgSprite.texture !== wantTex) {
            this.bgSprite.texture = wantTex;
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
