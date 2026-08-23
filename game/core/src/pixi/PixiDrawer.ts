// game/core/src/pixi/PixiDrawer.ts
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import {
    Grid,
    GridMath,
    GridType,
    GridVals,
    GridSettings,
    HoCMath,
    UnitsHolder,
    ObstacleType,
} from "@heroesofcrypto/common";
import { Obstacle } from "../obstacles/obstacle";
import { RenderableUnit } from "../scenes/RenderableUnit";
import { projectedCellPoints, projectedPolyline, projectedRectPoints } from "../scenes/sandbox/BattlefieldVisualGrid";

// Internal helper to clamp values
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

interface IFlyingUnit {
    unit: RenderableUnit;
    targetPosition: HoCMath.XY;
}

export class PixiDrawer {
    private readonly grid: Grid;
    private readonly gridSettings: GridSettings;
    private readonly app: Application;
    private backgroundContainer: Container;
    private terrainContainerBack: Container; // water/lava etc. behind units
    private unitsContainer: Container; // you can attach real units elsewhere; this is for layering parity
    private terrainContainerFront: Container; // mountains/blocks etc. in front
    private overlayContainer: Container; // transient drawings (paths, hovers, aoe, grid)
    private interactionContainer: Container; // high-priority UI overlays (cursor, attack target)
    private pathGfx: Graphics;
    private hoverCellsGfx: Graphics;
    private highlightedCellsGfx: Graphics;
    private aoeGfx: Graphics;
    private auraGfx: Graphics;
    private hoverAreaGfx: Graphics;
    private attackFromToGfx: Graphics;
    private gridGfx: Graphics;
    private holeLayersSprites: Sprite[] = [];
    private holeLayers = 0;
    private terrainObstacles: Obstacle[] = [];
    private animating = false;
    private flyingUnits: IFlyingUnit[] = [];
    private readonly COLOR = {
        ORANGE: 0xe84a34,
        YELLOW: 0xfff36d,
        GREY: 0x808080,
        LIGHT_GREY: 0xd8d8d8,
        LIGHT_ORANGE: 0xf7be6d,
        LIGHT_YELLOW: 0xffffbf,
        RED: 0xff0000,
        GREEN: 0x00ff00,
        HOVER_DARK: 0x000000,
        HOVER_LIGHT: 0xffffff,
        ATTACK_TO: 0xff8080,
        ATTACK_FROM: 0x90ed90,
    };
    public constructor(grid: Grid, app: Application, root?: Container) {
        this.grid = grid;
        this.gridSettings = this.grid.getSettings();
        this.app = app;

        // Containers in a clean z-order
        this.backgroundContainer = new Container();
        this.terrainContainerBack = new Container();
        this.unitsContainer = new Container();
        this.unitsContainer.sortableChildren = true; // CRITICAL: Enable Z-sorting inside this container!
        this.terrainContainerFront = new Container();
        this.overlayContainer = new Container();

        // If root provided, use it (for world-space transform). Else stage.
        const parent = root ?? this.app.stage;

        parent.addChild(this.backgroundContainer);
        parent.addChild(this.terrainContainerBack);
        parent.addChild(this.unitsContainer);
        parent.addChild(this.terrainContainerFront);
        parent.addChild(this.overlayContainer);

        // Z-Index setup (assuming parent sorts)
        parent.sortableChildren = true;
        this.backgroundContainer.zIndex = 10;
        this.terrainContainerBack.zIndex = 20;
        this.unitsContainer.zIndex = 1000; // Placeholder
        this.terrainContainerFront.zIndex = 50;
        this.overlayContainer.zIndex = 60; // Paths etc above terrain, below units (Units start ~3000)

        // Reusable graphics layers
        this.pathGfx = new Graphics();
        this.hoverCellsGfx = new Graphics();
        this.highlightedCellsGfx = new Graphics();
        this.aoeGfx = new Graphics();
        this.auraGfx = new Graphics();
        this.hoverAreaGfx = new Graphics();
        this.attackFromToGfx = new Graphics();
        this.gridGfx = new Graphics();

        this.overlayContainer.addChild(
            this.gridGfx,
            this.pathGfx,
            this.auraGfx,
            this.highlightedCellsGfx,
            this.hoverAreaGfx,
        );

        // Interaction Container (Z=1500): Above units (Cursor, Attack Target, AOE)
        this.interactionContainer = new Container();
        parent.addChild(this.interactionContainer);
        this.interactionContainer.zIndex = 1500;
        this.interactionContainer.sortableChildren = false; // No internal sorting needed
        this.interactionContainer.addChild(this.hoverCellsGfx, this.attackFromToGfx, this.aoeGfx);

        this.initHoleLayers();
    }
    public getUnitsContainer(): Container {
        return this.unitsContainer; // Z=1000
    }
    public getOverlayContainer(): Container {
        return this.overlayContainer; // Z=60
    }
    private initHoleLayers(): void {
        // Make 5 layers with EMPTY textures by default; caller can later set textures if needed.
        for (let i = 0; i < 5; i++) {
            const sprite = new Sprite(Texture.EMPTY);
            sprite.x = this.gridSettings.getMinX();
            sprite.y = this.gridSettings.getMinY();
            sprite.width = this.gridSettings.getMaxX() - this.gridSettings.getMinX();
            sprite.height = this.gridSettings.getMaxY() - this.gridSettings.getMinY();
            sprite.visible = false;
            this.holeLayersSprites.push(sprite);
            this.backgroundContainer.addChild(sprite);
        }
    }
    public setHoleLayerTexture(layerIndex: number, texture: Texture): void {
        if (layerIndex < 0 || layerIndex >= this.holeLayersSprites.length) return;
        this.holeLayersSprites[layerIndex].texture = texture;
    }
    public setHoleLayers(numberOfLayers: number): void {
        this.holeLayers = clamp(numberOfLayers | 0, 0, this.holeLayersSprites.length);
        for (let i = 0; i < this.holeLayersSprites.length; i++) {
            this.holeLayersSprites[i].visible = i < this.holeLayers;
        }
    }
    public renderHole(): void {
        // In Pixi, sprites auto-render each frame; nothing needed here.
        // Method kept to mirror old API.
    }
    public setGridType(gridType: GridType): void {
        // Old drawer synthesized center obstacles via ObstacleGenerator.
        // Here we just reset; callers can add obstacles with addTerrainObstacle().
        this.terrainObstacles = [];

        if (gridType === GridVals.WATER_CENTER) {
            // addTerrainObstacle(...) via your PixiObstacleGenerator if desired
        } else if (gridType === GridVals.LAVA_CENTER) {
            // addTerrainObstacle(...) via your PixiObstacleGenerator if desired
        } else if (gridType === GridVals.BLOCK_CENTER) {
            // addTerrainObstacle(...) via your PixiObstacleGenerator if desired
        }
    }
    public switchToDryCenter(): void {
        for (const o of this.terrainObstacles) {
            if (o.getType() === ObstacleType.BLOCK) {
                o.setLightSprite(undefined);
                o.setDarkSprite(undefined);
            }
        }
    }
    public addTerrainObstacle(obstacle: Obstacle): void {
        this.terrainObstacles.push(obstacle);
    }
    public renderTerrainSpritesBack(isLightMode: boolean): void {
        for (const o of this.terrainObstacles) {
            if (o.getType() !== ObstacleType.BLOCK) o.render(isLightMode);
        }
    }
    public renderTerrainSpritesFront(isLightMode: boolean, hitsRemaining: number): void {
        for (const o of this.terrainObstacles) {
            if (o.getType() === ObstacleType.BLOCK) o.render(isLightMode, hitsRemaining);
        }
    }
    public startMoveAnimation(_unit: RenderableUnit, _path: HoCMath.XY[]): void {
        // if (unit?.startMoveAnimation) {
        //     unit.startMoveAnimation(path);
        //     this.animating = true;
        // }
        //
        console.log("startMoveAnimation called");
    }
    public startFlyAnimation(_unit: RenderableUnit, _targetPosition: HoCMath.XY): void {
        // if (unit?.startFlyAnimation) {
        //     unit.startFlyAnimation(targetPosition);
        //     this.flyingUnits.push({ unit, targetPosition });
        //     this.animating = true;
        // }
        //
        console.log("startFlyAnimation called");
    }
    public isAnimating(): boolean {
        return this.animating;
    }
    public update(_deltaTime: number): void {
        // Cull finished flying units
        const stillFlying: IFlyingUnit[] = [];
        // for (const f of this.flyingUnits) {
        // if (f.unit.isAnimatingMovement()) stillFlying.push(f);
        // }
        this.flyingUnits = stillFlying;

        // Global animating flag
        this.animating = this.flyingUnits.length > 0;
    }
    public drawPath(
        _color: number,
        _currentActivePath?: HoCMath.XY[],
        _currentActiveUnitPositions?: HoCMath.XY[],
        _hoverAttackFromHashes?: Set<number>,
        _drawSolid = true,
    ): void {
        // this.pathGfx.clear();
        // if (!currentActivePath?.length) return;
        // for (const p of currentActivePath) {
        //     const movePosition = GridMath.getPositionForCell(
        //         p,
        //         this.gridSettings.getMinX(),
        //         this.gridSettings.getStep(),
        //         this.gridSettings.getHalfStep(),
        //     );
        //     if (!movePosition) continue;
        //     if (
        //         hoverAttackFromHashes?.has((p.x << 4) | p.y) ||
        //         GridMath.hasXY(movePosition, currentActiveUnitPositions)
        //     ) {
        //         continue;
        //     }
        //     const x = movePosition.x; // Center x
        //     const y = movePosition.y; // Center y
        //     const radius = this.gridSettings.getStep() * 0.08; // Small dot
        //     if (drawSolid) {
        //         this.pathGfx.circle(x, y, radius).fill({ color, alpha: 0.8 }); // Increased alpha for visibility
        //     } else {
        //         this.pathGfx
        //             .circle(x, y, radius)
        //             .stroke({ width: 1, color, alpha: 1 })
        //             .circle(x, y, radius * 1.5) // Outer faint ring
        //             .stroke({ width: 1, color, alpha: 0.3 });
        //     }
        // }
    }
    /** Draws a red-ish filled square at a target position (old drawAttackTo) */
    public drawAttackTo(targetPosition: HoCMath.XY, size: number): void {
        this.attackFromToGfx.clear();

        const sizeSteps = size * this.gridSettings.getStep();
        const sizeHalfSteps = size * this.gridSettings.getHalfStep();

        const x = targetPosition.x - sizeHalfSteps;
        const y = targetPosition.y - sizeHalfSteps;

        this.attackFromToGfx
            .poly(projectedRectPoints(x, y, x + sizeSteps, y + sizeSteps, this.gridSettings))
            .fill({ color: this.COLOR.ATTACK_TO, alpha: 0.7 });
    }
    /** Green-ish square from a position (old drawAttackFrom) */
    public drawAttackFrom(fromPosition: HoCMath.XY, isSmallUnit = true): void {
        // Additive to attackFromTo layer
        const x = fromPosition.x - this.gridSettings.getHalfStep() - (isSmallUnit ? 0 : this.gridSettings.getStep());
        const y = fromPosition.y - this.gridSettings.getHalfStep() - (isSmallUnit ? 0 : this.gridSettings.getStep());
        const s = isSmallUnit ? this.gridSettings.getStep() : this.gridSettings.getTwoSteps();

        // Keep existing drawn content and add another rect
        this.attackFromToGfx
            .poly(projectedRectPoints(x, y, x + s, y + s, this.gridSettings))
            .fill({ color: this.COLOR.ATTACK_FROM, alpha: 1 });
    }
    /** Old drawHoverCells */
    public drawHoverCells(cells?: HoCMath.XY[], hoverSelectedCellsSwitchToRed = false): void {
        this.hoverCellsGfx.clear();
        if (!cells?.length) return;

        const color = hoverSelectedCellsSwitchToRed ? this.COLOR.ATTACK_TO : 0x808080;
        const mode = localStorage.getItem("joy-mode");
        const dark = mode === "light" ? this.COLOR.HOVER_DARK : this.COLOR.HOVER_LIGHT;
        const mixed = hoverSelectedCellsSwitchToRed ? color : dark;

        for (const cell of cells) {
            this.hoverCellsGfx.poly(projectedCellPoints(cell, this.gridSettings)).fill({ color: mixed, alpha: 0.8 });
        }
    }
    /** Old drawHighlightedCells */
    public drawHighlightedCells(isLightMode: boolean, cells?: HoCMath.XY[]): void {
        this.highlightedCellsGfx.clear();
        if (!cells?.length) return;

        const color = isLightMode ? this.COLOR.LIGHT_ORANGE : this.COLOR.LIGHT_YELLOW;

        for (const cell of cells) {
            this.highlightedCellsGfx.poly(projectedCellPoints(cell, this.gridSettings)).fill({ color, alpha: 1 });
        }
    }
    /** Old drawAOECells behavior (only size 1–2 are drawn with drawAttackTo) */
    public drawAOECells(unitsHolder: UnitsHolder, hoverAOECells?: HoCMath.XY[]): void {
        this.aoeGfx.clear();
        if (!hoverAOECells?.length) return;

        const drawableCells = new Map<number, HoCMath.XY>();

        for (const c of hoverAOECells) {
            const key = (c.x << 4) | c.y;
            if (drawableCells.has(key)) continue;

            const occId = this.grid.getOccupantUnitId(c);
            if (occId && occId !== "L" && occId !== "W") {
                const u = unitsHolder.getAllUnits().get(occId);
                if (!u) continue;

                for (const oc of u.getCells()) {
                    const k = (oc.x << 4) | oc.y;
                    drawableCells.set(k, oc);
                }
                continue;
            }
            drawableCells.set(key, c);
        }

        for (const cell of drawableCells.values()) {
            this.aoeGfx
                .poly(projectedCellPoints(cell, this.gridSettings))
                .fill({ color: this.COLOR.ATTACK_TO, alpha: 0.7 });
        }
    }
    /** Old drawAuraArea (two outlines) */
    public drawAuraArea(position: HoCMath.XY, range: number, isBuff: boolean, isSmallUnit: boolean = true): void {
        this.auraGfx.clear();

        const step = isSmallUnit ? this.gridSettings.getHalfStep() : this.gridSettings.getStep();
        const start = { x: position.x - range - step, y: position.y - range - step };
        const end = { x: position.x + range + step, y: position.y + range + step };
        const color = isBuff ? this.COLOR.GREEN : this.COLOR.RED;

        this.auraGfx
            .poly(projectedRectPoints(start.x, start.y, end.x, end.y, this.gridSettings))
            .stroke({ width: 1, color, alpha: 1 });

        const start2 = { x: start.x - 1, y: start.y - 1 };
        const end2 = { x: end.x + 1, y: end.y + 1 };
        this.auraGfx
            .poly(projectedRectPoints(start2.x, start2.y, end2.x, end2.y, this.gridSettings))
            .stroke({ width: 1, color, alpha: 1 });
    }
    /** Old drawHoverArea (filled rect between two corners) */
    public drawHoverArea(isLightMode: boolean, area: HoCMath.XY[]): void {
        this.hoverAreaGfx.clear();
        if (area.length !== 2) return;

        const start = area[0];
        const end = area[1];

        const color = isLightMode ? this.COLOR.HOVER_DARK : this.COLOR.HOVER_LIGHT;
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const right = Math.max(start.x, end.x);
        const top = Math.max(start.y, end.y);

        this.hoverAreaGfx.poly(projectedRectPoints(x, y, right, top, this.gridSettings)).fill({ color, alpha: 0.8 });
    }
    /** Draw the cell grid: a thin filled bar at every internal cell boundary. */
    public drawGrid(): void {
        this.gridGfx.clear();

        const minX = this.gridSettings.getMinX();
        const maxX = this.gridSettings.getMaxX();
        const minY = this.gridSettings.getMinY();
        const maxY = this.gridSettings.getMaxY();
        const step = this.gridSettings.getStep();
        const size = this.gridSettings.getGridSize();
        const color = localStorage.getItem("joy-mode") === "light" ? 0x333333 : 0xcccccc;
        const fill = { color, alpha: 0.3 };

        const lineW = Math.max(2, step * 0.03);
        for (let i = 1; i < size; i++) {
            const x = minX + i * step;
            this.gridGfx
                .poly(
                    projectedPolyline(
                        [
                            { x, y: minY },
                            { x, y: maxY },
                        ],
                        this.gridSettings,
                    ),
                )
                .stroke({ width: lineW, ...fill });
        }
        for (let j = 1; j < size; j++) {
            const y = minY + j * step;
            this.gridGfx
                .poly(
                    projectedPolyline(
                        [
                            { x: minX, y },
                            { x: maxX, y },
                        ],
                        this.gridSettings,
                    ),
                )
                .stroke({ width: lineW, ...fill });
        }
    }
    public destroy(): void {
        // Clear graphics to release GPU buffers
        this.pathGfx.clear();
        this.hoverCellsGfx.clear();
        this.highlightedCellsGfx.clear();
        this.aoeGfx.clear();
        this.auraGfx.clear();
        this.hoverAreaGfx.clear();
        this.attackFromToGfx.clear();
        this.gridGfx.clear();

        // Destroy containers (children first)
        this.backgroundContainer.destroy({ children: true });
        this.terrainContainerBack.destroy({ children: true });
        this.unitsContainer.destroy({ children: true });
        this.terrainContainerFront.destroy({ children: true });
        this.overlayContainer.destroy({ children: true });

        // Null out arrays
        this.holeLayersSprites.length = 0;
        this.terrainObstacles.length = 0;
        this.flyingUnits.length = 0;
        this.animating = false;
    }
}
