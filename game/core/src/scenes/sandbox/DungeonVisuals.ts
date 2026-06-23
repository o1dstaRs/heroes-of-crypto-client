import { Container, Graphics, Sprite, BlurFilter, Texture } from "pixi.js";
import { GridSettings, GridVals, FightStateManager, HoCConstants } from "@heroesofcrypto/common";

export interface IDungeonVisualsContext {
    getStage(): Container;
    getWorldRoot(): Container;
    getViewportSize(): { width: number; height: number };
    getGridSettings(): GridSettings;
    texAny(name: string): Texture | undefined;
    attachToWorldRoot(obj: Container, zIndex?: number): void;
}

interface IFlickeringLight extends Graphics {
    _flickerOffset: number;
    _flickerSpeed: number;
    _baseScale: number;
    _baseAlpha: number;
}

export class DungeonVisuals {
    private context: IDungeonVisualsContext;
    // State
    private atmosphereAlpha = 0;
    private atmosphereLights: Graphics[] = [];
    private dungeonOverlay?: Container;
    private holeContainer: Container;
    private bgSprite?: Sprite;
    private centerTerrainSprite?: Sprite;
    private centerHitBar?: Graphics;
    /** Once the lava/water center dries out it becomes walkable and shows a frozen/dry sprite. */
    private centerDried = false;
    public constructor(context: IDungeonVisualsContext) {
        this.context = context;
        this.holeContainer = new Container();
        this.holeContainer.sortableChildren = true;
    }
    public getHoleContainer(): Container {
        return this.holeContainer;
    }
    public updateDungeonAtmosphere(started: boolean, alpha: number): void {
        const stage = this.context.getStage();

        // 1. Hide if not started
        if (!started) {
            if (this.dungeonOverlay) {
                this.dungeonOverlay.visible = false;
            }
            return;
        }

        // 2. Create Container if missing
        if (!this.dungeonOverlay) {
            this.dungeonOverlay = new Container();
            // We want it above background (0)?
            // Sandbox said: stage.addChildAt(this.dungeonOverlay, 1);
            // We need to be careful with indices if other things are added.
            // Safer to addAt(1) or just verify.
            try {
                stage.addChildAt(this.dungeonOverlay, 1);
            } catch {
                stage.addChild(this.dungeonOverlay);
            }
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

        // A. Dark Night Overlay — light enough that the background still reads through it.
        const overlay = new Graphics();
        overlay.rect(x - halfSize, y - halfSize, size, size).fill({ color: 0x000000, alpha: 0.38 });
        overlayContainer.addChild(overlay);

        // B. Perimeter Lights
        const radius = size * 0.25;
        const blur = new BlurFilter({ strength: 40, quality: 4 });
        // Generous padding so the blur isn't clipped to its bounding box (the clip shows up as
        // hard rectangular "lines" — esp. horizontal bands along the top/bottom perimeter rows —
        // when the blurred glow spills past the filter region). Keep this comfortably larger than
        // the blur strength and the largest light radius.
        blur.padding = Math.ceil(size * 0.35);
        this.atmosphereLights = [];

        const margin = size * 0.18;
        const tl = { x: x - halfSize - margin, y: y - halfSize - margin };
        const tr = { x: x + halfSize + margin, y: y - halfSize - margin };
        const bl = { x: x - halfSize - margin, y: y + halfSize + margin };
        const br = { x: x + halfSize + margin, y: y + halfSize + margin };

        const lightsInit: Array<{ x: number; y: number }> = [];
        const steps = 6;
        const jitter = () => (Math.random() - 0.5) * (size * 0.05);

        // Top
        for (let i = 0; i <= steps; i++) {
            lightsInit.push({ x: tl.x + (tr.x - tl.x) * (i / steps) + jitter(), y: tl.y + jitter() });
        }
        // Right
        for (let i = 0; i <= steps; i++) {
            lightsInit.push({ x: tr.x + jitter(), y: tr.y + (br.y - tr.y) * (i / steps) + jitter() });
        }
        // Bottom
        for (let i = 0; i <= steps; i++) {
            lightsInit.push({ x: br.x + (bl.x - br.x) * (i / steps) + jitter(), y: br.y + jitter() });
        }
        // Left
        for (let i = 0; i <= steps; i++) {
            lightsInit.push({ x: bl.x + jitter(), y: bl.y + (tl.y - bl.y) * (i / steps) + jitter() });
        }

        lightsInit.forEach((pos) => {
            const light = new Graphics();
            // Per-light variation so the perimeter reads as separate braziers, not a uniform band.
            const r = radius * (0.55 + Math.random() * 0.85); // 0.55 .. 1.4 of base
            const intensity = 0.7 + Math.random() * 0.5;
            // Smooth radial falloff via many fine concentric layers (so there are no visible rings),
            // warm deep-ember edge fading to a hot near-white core.
            const layers = 10;
            for (let L = layers; L >= 1; L--) {
                const lr = (r * L) / layers;
                const tcore = 1 - (L - 1) / (layers - 1); // 0 (edge) -> 1 (core)
                const color = tcore > 0.66 ? 0xffe9b0 : tcore > 0.33 ? 0xffa83c : 0xc23e06;
                const a = (0.04 + 0.34 * tcore * tcore) * intensity;
                light.circle(0, 0, lr).fill({ color, alpha: a });
            }

            const fLight = light as unknown as IFlickeringLight;
            fLight._flickerOffset = Math.random() * 100;
            fLight._flickerSpeed = 1.4 + Math.random() * 3.2;
            fLight._baseScale = 1;
            fLight._baseAlpha = 0.8 + Math.random() * 0.2;

            light.position.set(pos.x, pos.y);
            light.alpha = fLight._baseAlpha;
            light.filters = [blur];
            overlayContainer.addChild(light);
            this.atmosphereLights.push(light);
        });
    }
    public hasAtmosphereLights(): boolean {
        return this.atmosphereLights.length > 0;
    }
    /** Organic two-octave flicker (intensity + a subtle scale "breath") for the perimeter fires. */
    public updateAtmosphereFlicker(nowSec: number): void {
        for (const light of this.atmosphereLights) {
            const f = light as unknown as IFlickeringLight;
            const offset = f._flickerOffset ?? 0;
            const speed = f._flickerSpeed ?? 1;
            // Sum of two sines (different rates) reads as flame, not a clean pulse. Range ~[-1, 1].
            const n = 0.6 * Math.sin(nowSec * speed + offset) + 0.4 * Math.sin(nowSec * speed * 2.7 + offset * 1.7);
            light.alpha = (f._baseAlpha ?? 0.9) * (0.72 + 0.28 * n);
            const s = (f._baseScale ?? 1) * (1.0 + 0.07 * n);
            light.scale.set(s, s);
        }
    }
    public moveFiresInward(inwardOffset: number): void {
        if (!this.atmosphereLights || this.atmosphereLights.length === 0) return;

        const { width: vw, height: vh } = this.context.getViewportSize();
        const size = Math.min(vw, vh);
        const x = vw * 0.5;
        const y = vh * 0.5;
        const halfSize = size / 2;

        const cellSize = this.context.getGridSettings().getCellSize();
        const inwardShift = (inwardOffset + 1) * cellSize * 0.5;

        const baseMargin = size * 0.22;
        const adjustedMargin = baseMargin - inwardShift;

        const tl = { x: x - halfSize - adjustedMargin, y: y - halfSize - adjustedMargin };
        const tr = { x: x + halfSize + adjustedMargin, y: y - halfSize - adjustedMargin };
        const bl = { x: x - halfSize - adjustedMargin, y: y + halfSize + adjustedMargin };
        const br = { x: x + halfSize + adjustedMargin, y: y + halfSize + adjustedMargin };

        const steps = 6;
        const lightsPerEdge = steps + 1;

        const getPos = (edgeIdx: number, stepIdx: number): { x: number; y: number } => {
            const t = stepIdx / steps;
            if (edgeIdx === 0) return { x: tl.x + (tr.x - tl.x) * t, y: tl.y }; // Top
            if (edgeIdx === 1) return { x: tr.x, y: tr.y + (br.y - tr.y) * t }; // Right
            if (edgeIdx === 2) return { x: br.x + (bl.x - br.x) * t, y: br.y }; // Bottom
            return { x: bl.x, y: bl.y + (tl.y - bl.y) * t }; // Left
        };

        this.atmosphereLights.forEach((light, i) => {
            const edgeIndex = Math.floor(i / lightsPerEdge);
            const stepIndex = i % lightsPerEdge;
            const newPos = getPos(edgeIndex, stepIndex);

            // Should we animate? Logic was simple assignment
            light.position.set(newPos.x, newPos.y);
        });
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
    public ensureCenterTerrainSprite(): void {
        const gridType = FightStateManager.getInstance().getFightProperties().getGridType();
        let texKey: string | undefined;

        switch (gridType) {
            case GridVals.WATER_CENTER:
                texKey = this.centerDried ? "water_dry_256" : "water_256";
                break;
            case GridVals.LAVA_CENTER:
                texKey = this.centerDried ? "lava_frozen_256" : "lava_256";
                break;
            case GridVals.BLOCK_CENTER:
                texKey = "mountain_432_412";
                break;
            default:
                texKey = undefined;
                break;
        }

        if (!texKey) {
            if (this.centerTerrainSprite) this.centerTerrainSprite.visible = false;
            if (this.centerHitBar) this.centerHitBar.clear();
            return;
        }

        // Mountain is destroyed once its hit points run out — hide sprite + hit bar.
        if (
            gridType === GridVals.BLOCK_CENTER &&
            FightStateManager.getInstance().getFightProperties().getObstacleHitsLeft() <= 0
        ) {
            if (this.centerTerrainSprite) this.centerTerrainSprite.visible = false;
            if (this.centerHitBar) this.centerHitBar.clear();
            return;
        }

        const tex = this.context.texAny(texKey);
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
        const targetW = cellSize * 4;
        const targetH = cellSize * 4;
        const texW = tex.width || 1;
        const texH = tex.height || 1;

        this.centerTerrainSprite.scale.set(targetW / texW, -(targetH / texH));
        this.centerTerrainSprite.x = centerX;
        this.centerTerrainSprite.y = centerY;
        this.centerTerrainSprite.visible = true;

        // Draw the mountain's remaining hit points (BLOCK_CENTER only, and only once the fight has
        // started — there's nothing to attack during placement).
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (gridType === GridVals.BLOCK_CENTER && fightProps.hasFightStarted()) {
            this.drawCenterHitBar(fightProps.getObstacleHitsLeft());
        } else if (this.centerHitBar) {
            this.centerHitBar.clear();
        }
    }
    /** Draw the mountain hit-point bar at the grid center (mirrors the legacy obstacle hitbar). */
    private drawCenterHitBar(hitsRemaining: number): void {
        if (!this.centerHitBar) {
            this.centerHitBar = new Graphics();
            this.context.attachToWorldRoot(this.centerHitBar, 51);
        }
        const bar = this.centerHitBar;
        bar.clear();
        if (hitsRemaining <= 0) {
            return;
        }

        const gs = this.context.getGridSettings();
        const centerX = (gs.getMinX() + gs.getMaxX()) * 0.5;
        const centerY = (gs.getMinY() + gs.getMaxY()) * 0.5;
        const twoSteps = gs.getTwoSteps();
        const startX = centerX - twoSteps;
        const startY = centerY - twoSteps;
        const shiftX = Math.floor(
            (gs.getStep() / HoCConstants.MAX_HITS_MOUNTAIN) * (HoCConstants.MAX_HITS_MOUNTAIN - 1),
        );
        const barHeight = 40;
        for (let i = 0; i < hitsRemaining; i++) {
            const x = startX + shiftX * i;
            bar.rect(x, startY, shiftX, barHeight).stroke({ width: 1, color: 0xffffff });
            bar.rect(x + 2, startY + 2, Math.max(0, shiftX - 4), Math.max(0, barHeight - 4)).fill({ color: 0xfdfa70 });
        }
    }
    public ensureBackgroundSprite(): void {
        if (this.bgSprite) return;
        const tex = this.context.texAny("background_new");
        if (!tex) return;

        const bg = new Sprite(tex);
        bg.anchor.set(0.5);
        this.context.getStage().addChildAt(bg, 0);
        this.bgSprite = bg;
        // We can call layout here if we want/can
    }
    public layoutBackgroundSquare(alpha: number): void {
        if (!this.bgSprite) return;
        const { width: vw, height: vh } = this.context.getViewportSize();
        const size = Math.min(vw, vh);
        this.bgSprite.x = vw * 0.5;
        this.bgSprite.y = vh * 0.5;
        this.bgSprite.width = size;
        this.bgSprite.height = size;
        const wantKey = "background_new";
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
            this.dungeonOverlay.removeChildren();
        }
    }
    public attachCenterTerrainSprite(): void {
        if (this.centerTerrainSprite) {
            this.context.attachToWorldRoot(this.centerTerrainSprite, 50);
        }
    }
    public update(dt: number) {
        if (this.atmosphereLights.length > 0) {
            this.atmosphereLights.forEach((light) => {
                const fLight = light as unknown as IFlickeringLight;
                fLight._flickerOffset += dt * fLight._flickerSpeed;
                light.alpha = 0.5 + Math.sin(fLight._flickerOffset) * 0.1;
            });
        }
    }
}
