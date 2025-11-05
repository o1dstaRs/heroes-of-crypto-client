// game/core/src/pixi/PixiDrawer.ts
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import { Grid, GridType, GridMath, GridSettings, HoCMath, UnitsHolder, ObstacleType } from "@heroesofcrypto/common";
import { Obstacle } from "../obstacles/obstacle";
import { PixiUnit } from "./PixiUnit";

// Internal helper to clamp values
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

interface IFlyingUnit {
    unit: PixiUnit;
    targetPosition: HoCMath.XY;
}

export class PixiDrawer {
    private readonly grid: Grid;
    private readonly gridSettings: GridSettings;
    private readonly app: Application;

    // Layered containers (in stage order)
    private backgroundContainer: Container;
    private terrainContainerBack: Container; // water/lava etc. behind units
    private unitsContainer: Container; // you can attach real units elsewhere; this is for layering parity
    private terrainContainerFront: Container; // mountains/blocks etc. in front
    private overlayContainer: Container; // transient drawings (paths, hovers, aoe, grid)

    // Reusable graphics (avoid constant allocations)
    private pathGfx: Graphics;
    private hoverCellsGfx: Graphics;
    private highlightedCellsGfx: Graphics;
    private aoeGfx: Graphics;
    private auraGfx: Graphics;
    private hoverAreaGfx: Graphics;
    private attackFromToGfx: Graphics;
    private gridGfx: Graphics;

    // Hole layers
    private holeLayersSprites: Sprite[] = [];
    private holeLayers = 0;

    // Terrain obstacles
    private terrainObstacles: Obstacle[] = [];

    // Animation state
    private animating = false;
    private flyingUnits: IFlyingUnit[] = [];

    // Colors (approx to Box2D color constants)
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

    public constructor(grid: Grid, app: Application) {
        this.grid = grid;
        this.gridSettings = this.grid.getSettings();
        this.app = app;

        // Containers in a clean z-order
        this.backgroundContainer = new Container();
        this.terrainContainerBack = new Container();
        this.unitsContainer = new Container();
        this.terrainContainerFront = new Container();
        this.overlayContainer = new Container();

        const stage = this.app.stage;
        stage.addChild(this.backgroundContainer);
        stage.addChild(this.terrainContainerBack);
        stage.addChild(this.unitsContainer);
        stage.addChild(this.terrainContainerFront);
        stage.addChild(this.overlayContainer);

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
            this.hoverCellsGfx,
            this.highlightedCellsGfx,
            this.aoeGfx,
            this.auraGfx,
            this.hoverAreaGfx,
            this.attackFromToGfx,
        );

        this.initHoleLayers();
    }

    // ----- Hole layers -----

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

    /** Optionally assign a texture to a particular hole layer (0..4) */
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

    // ----- Terrain -----

    public setGridType(gridType: GridType): void {
        // Old drawer synthesized center obstacles via ObstacleGenerator.
        // Here we just reset; callers can add obstacles with addTerrainObstacle().
        this.terrainObstacles = [];

        if (gridType === GridType.WATER_CENTER) {
            // addTerrainObstacle(...) via your PixiObstacleGenerator if desired
        } else if (gridType === GridType.LAVA_CENTER) {
            // addTerrainObstacle(...) via your PixiObstacleGenerator if desired
        } else if (gridType === GridType.BLOCK_CENTER) {
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

    // ----- Animations -----

    public startMoveAnimation(_unit: PixiUnit, _path: HoCMath.XY[]): void {
        // if (unit?.startMoveAnimation) {
        //     unit.startMoveAnimation(path);
        //     this.animating = true;
        // }
        //
        console.log("startMoveAnimation called");
    }

    public startFlyAnimation(_unit: PixiUnit, _targetPosition: HoCMath.XY): void {
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

    /** Call per frame with deltaTime from ticker */
    public update(_deltaTime: number): void {
        // Cull finished flying units
        const stillFlying: IFlyingUnit[] = [];
        for (const f of this.flyingUnits) {
            if (f.unit.isAnimatingMovement()) stillFlying.push(f);
        }
        this.flyingUnits = stillFlying;

        // Global animating flag
        this.animating = this.flyingUnits.length > 0;
    }

    // ----- Drawing helpers (non-deprecated Pixi v8 APIs) -----

    /** Draws path cells like old Drawer.drawPath */
    public drawPath(
        color: number,
        currentActivePath?: HoCMath.XY[],
        currentActiveUnitPositions?: HoCMath.XY[],
        hoverAttackFromHashes?: Set<number>,
        drawSolid = true,
    ): void {
        this.pathGfx.clear();

        if (!currentActivePath?.length) return;

        for (const p of currentActivePath) {
            const movePosition = GridMath.getPositionForCell(
                p,
                this.gridSettings.getMinX(),
                this.gridSettings.getStep(),
                this.gridSettings.getHalfStep(),
            );
            if (!movePosition) continue;

            if (
                hoverAttackFromHashes?.has((p.x << 4) | p.y) ||
                GridMath.hasXY(movePosition, currentActiveUnitPositions)
            ) {
                continue;
            }

            const x = movePosition.x - this.gridSettings.getHalfStep();
            const y = movePosition.y - this.gridSettings.getHalfStep();
            const w = this.gridSettings.getStep();
            const h = this.gridSettings.getStep();

            if (drawSolid) {
                this.pathGfx.rect(x, y, w, h).fill({ color, alpha: 0.5 });
            } else {
                this.pathGfx
                    .rect(x, y, w, h)
                    .stroke({ width: 1, color, alpha: 1 })
                    .rect(x + 1, y + 1, w, h)
                    .stroke({ width: 1, color, alpha: 1 })
                    .rect(x - 1, y - 1, w, h)
                    .stroke({ width: 1, color, alpha: 1 });
            }
        }
    }

    /** Draws a red-ish filled square at a target position (old drawAttackTo) */
    public drawAttackTo(targetPosition: HoCMath.XY, size: number): void {
        this.attackFromToGfx.clear();

        const sizeSteps = size * this.gridSettings.getStep();
        const sizeHalfSteps = size * this.gridSettings.getHalfStep();

        const x = targetPosition.x - sizeHalfSteps;
        const y = targetPosition.y - sizeHalfSteps;

        this.attackFromToGfx.rect(x, y, sizeSteps, sizeSteps).fill({ color: this.COLOR.ATTACK_TO, alpha: 0.7 });
    }

    /** Green-ish square from a position (old drawAttackFrom) */
    public drawAttackFrom(fromPosition: HoCMath.XY, isSmallUnit = true): void {
        // Additive to attackFromTo layer
        const x = fromPosition.x - this.gridSettings.getHalfStep() - (isSmallUnit ? 0 : this.gridSettings.getStep());
        const y = fromPosition.y - this.gridSettings.getHalfStep() - (isSmallUnit ? 0 : this.gridSettings.getStep());
        const s = isSmallUnit ? this.gridSettings.getStep() : this.gridSettings.getTwoSteps();

        // Keep existing drawn content and add another rect
        this.attackFromToGfx.rect(x, y, s, s).fill({ color: this.COLOR.ATTACK_FROM, alpha: 1 });
    }

    /** Old drawHoverCells */
    public drawHoverCells(cells?: HoCMath.XY[], hoverSelectedCellsSwitchToRed = false): void {
        this.hoverCellsGfx.clear();
        if (!cells?.length) return;

        const color = hoverSelectedCellsSwitchToRed ? this.COLOR.ATTACK_TO : 0x808080;
        const mode = localStorage.getItem("joy-mode");
        const dark = mode === "light" ? this.COLOR.HOVER_DARK : this.COLOR.HOVER_LIGHT;
        const mixed = hoverSelectedCellsSwitchToRed ? color : dark;

        // Special cases from the old implementation
        if (cells.length === 3 || (cells.length === 2 && cells[0].x !== cells[1].x && cells[0].y !== cells[1].y)) {
            for (const cell of cells) {
                const movePosition = GridMath.getPositionForCell(
                    cell,
                    this.gridSettings.getMinX(),
                    this.gridSettings.getStep(),
                    this.gridSettings.getHalfStep(),
                );
                if (!movePosition) continue;

                const x = movePosition.x - this.gridSettings.getHalfStep();
                const y = movePosition.y - this.gridSettings.getHalfStep();
                const s = this.gridSettings.getStep();

                this.hoverCellsGfx.rect(x, y, s, s).fill({ color: mixed, alpha: 0.8 });
            }
            return;
        }

        // General merged rectangle
        let minX = Number.MAX_SAFE_INTEGER;
        let minY = Number.MAX_SAFE_INTEGER;
        let maxX = Number.MIN_SAFE_INTEGER;
        let maxY = Number.MIN_SAFE_INTEGER;

        for (const cell of cells) {
            const pos = GridMath.getPositionForCell(
                cell,
                this.gridSettings.getMinX(),
                this.gridSettings.getStep(),
                this.gridSettings.getHalfStep(),
            );
            if (!pos) continue;

            const x = pos.x - this.gridSettings.getHalfStep();
            const y = pos.y - this.gridSettings.getHalfStep();
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + this.gridSettings.getStep());
            maxY = Math.max(maxY, y + this.gridSettings.getStep());
        }

        if (minX <= maxX && minY <= maxY) {
            this.hoverCellsGfx.rect(minX, minY, maxX - minX, maxY - minY).fill({ color: mixed, alpha: 0.8 });
        }
    }

    /** Old drawHighlightedCells */
    public drawHighlightedCells(isLightMode: boolean, cells?: HoCMath.XY[]): void {
        this.highlightedCellsGfx.clear();
        if (!cells?.length) return;

        const color = isLightMode ? this.COLOR.LIGHT_ORANGE : this.COLOR.LIGHT_YELLOW;

        for (const cell of cells) {
            const position = GridMath.getPositionForCell(
                cell,
                this.gridSettings.getMinX(),
                this.gridSettings.getStep(),
                this.gridSettings.getHalfStep(),
            );
            if (!position) continue;

            const x = position.x - this.gridSettings.getHalfStep();
            const y = position.y - this.gridSettings.getHalfStep();
            const s = this.gridSettings.getStep();

            this.highlightedCellsGfx.rect(x, y, s, s).fill({ color, alpha: 1 });
        }
    }

    /** Old drawAOECells behavior (only size 1–2 are drawn with drawAttackTo) */
    public drawAOECells(unitsHolder: UnitsHolder, hoverAOECells?: HoCMath.XY[]): void {
        this.aoeGfx.clear();
        if (!hoverAOECells?.length) return;

        const drawable: Array<{ position: HoCMath.XY; size: number }> = [];
        const cellKeys: number[] = [];

        for (const c of hoverAOECells) {
            const cellPos = GridMath.getPositionForCell(
                c,
                this.gridSettings.getMinX(),
                this.gridSettings.getStep(),
                this.gridSettings.getHalfStep(),
            );
            if (!cellPos) continue;

            const key = (c.x << 4) | c.y;
            if (cellKeys.includes(key)) continue;

            const occId = this.grid.getOccupantUnitId(c);
            if (occId && occId !== "L" && occId !== "W") {
                const u = unitsHolder.getAllUnits().get(occId);
                if (!u) continue;

                for (const oc of u.getCells()) {
                    const k = (oc.x << 4) | oc.y;
                    if (!cellKeys.includes(k)) cellKeys.push(k);
                }

                const baseCell = u.getBaseCell();
                if (!baseCell) continue;

                const basePos = GridMath.getPositionForCell(
                    baseCell,
                    this.gridSettings.getMinX(),
                    this.gridSettings.getStep(),
                    this.gridSettings.getHalfStep(),
                );
                if (!basePos) continue;

                drawable.push({
                    position: {
                        x: basePos.x - (u.isSmallSize() ? 0 : this.gridSettings.getHalfStep()),
                        y: basePos.y - (u.isSmallSize() ? 0 : this.gridSettings.getHalfStep()),
                    },
                    size: u.getSize(),
                });
                cellKeys.push(key);
                continue;
            }

            drawable.push({ position: cellPos, size: 1 });
            cellKeys.push(key);
        }

        // Only draw sizes 1 or 2 as in the old code
        for (const p of drawable) {
            if (p.size <= 2 && p.size >= 1) {
                const sizeSteps = p.size * this.gridSettings.getStep();
                const sizeHalfSteps = p.size * this.gridSettings.getHalfStep();
                const x = p.position.x - sizeHalfSteps;
                const y = p.position.y - sizeHalfSteps;
                this.aoeGfx.rect(x, y, sizeSteps, sizeSteps).fill({ color: this.COLOR.ATTACK_TO, alpha: 0.7 });
            }
        }
    }

    /** Old drawAuraArea (two outlines) */
    public drawAuraArea(position: HoCMath.XY, range: number, isBuff: boolean, isSmallUnit: boolean = true): void {
        this.auraGfx.clear();

        const step = isSmallUnit ? this.gridSettings.getHalfStep() : this.gridSettings.getStep();
        const start = { x: position.x - range - step, y: position.y - range - step };
        const end = { x: position.x + range + step, y: position.y + range + step };
        const w = end.x - start.x;
        const h = end.y - start.y;
        const color = isBuff ? this.COLOR.GREEN : this.COLOR.RED;

        this.auraGfx.rect(start.x, start.y, w, h).stroke({ width: 1, color, alpha: 1 });

        const start2 = { x: start.x - 1, y: start.y - 1 };
        const w2 = w + 2;
        const h2 = h + 2;
        this.auraGfx.rect(start2.x, start2.y, w2, h2).stroke({ width: 1, color, alpha: 1 });
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
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);

        this.hoverAreaGfx.rect(x, y, w, h).fill({ color, alpha: 0.8 });
    }

    /** Old drawGrid (with gap segments around large units) */
    public drawGrid(largeUnitsCache: [Map<number, number[]>, Map<number, number[]>]): void {
        this.gridGfx.clear();

        const largeUnitsXtoY = largeUnitsCache[0];
        const largeUnitsYtoX = largeUnitsCache[1];
        const mode = localStorage.getItem("joy-mode");
        const color = mode === "light" ? 0x333333 : 0xcccccc;

        const positions: HoCMath.XY[] = [];

        // verticals
        for (
            let newX = this.gridSettings.getMinX() + this.gridSettings.getStep();
            newX < this.gridSettings.getMaxX();
            newX += this.gridSettings.getStep()
        ) {
            let fromY = this.gridSettings.getMinY();
            for (
                let y = this.gridSettings.getMinY();
                y < this.gridSettings.getMaxY();
                y += this.gridSettings.getCellSize()
            ) {
                const xs = largeUnitsYtoX.get(y);
                if (xs?.length) {
                    for (const px of xs) {
                        if (px === newX) {
                            positions.push({ x: newX, y: fromY });
                            positions.push({ x: newX, y: y - this.gridSettings.getStep() });
                            fromY = y + this.gridSettings.getStep();
                        }
                    }
                }
            }
            positions.push({ x: newX, y: fromY });
            positions.push({ x: newX, y: this.gridSettings.getMaxY() });
        }

        // horizontals
        for (
            let newY = this.gridSettings.getStep();
            newY < this.gridSettings.getMaxY();
            newY += this.gridSettings.getStep()
        ) {
            let fromX = this.gridSettings.getMinX();
            for (
                let x = this.gridSettings.getMinX();
                x < this.gridSettings.getMaxX();
                x += this.gridSettings.getCellSize()
            ) {
                const ys = largeUnitsXtoY.get(x);
                if (ys?.length) {
                    for (const py of ys) {
                        if (py === newY) {
                            positions.push({ x: fromX, y: newY });
                            positions.push({ x: x - this.gridSettings.getStep(), y: newY });
                            fromX = x + this.gridSettings.getStep();
                        }
                    }
                }
            }
            positions.push({ x: fromX, y: newY });
            positions.push({ x: this.gridSettings.getMaxX(), y: newY });
        }

        // draw line segments
        this.gridGfx.stroke({ width: 1, color, alpha: 1 });
        for (let i = 0; i < positions.length - 1; i += 2) {
            const p1 = positions[i];
            const p2 = positions[i + 1];
            this.gridGfx.moveTo(p1.x, p1.y).lineTo(p2.x, p2.y);
        }
    }

    // ----- Cleanup -----

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
