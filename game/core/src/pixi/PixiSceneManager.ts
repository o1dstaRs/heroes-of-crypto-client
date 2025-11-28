// game/core/src/pixi/PixiSceneManager.ts
import { Application, Ticker, Container } from "pixi.js";
import { GridSettings, GridType, HoCMath, Grid } from "@heroesofcrypto/common";
import { PixiApp } from "./PixiApp";
import { PixiDrawer } from "./PixiDrawer";
import { SimplePhysicsManager } from "./SimplePhysicsManager";
import { RenderableUnit } from "../scenes/RenderableUnit";

/** Minimal grid shape expected by PixiDrawer; we'll cast it to the full Grid type for compatibility */
interface GridLike {
    getSettings(): GridSettings;
}

export class PixiSceneManager {
    private readonly pixiApp: PixiApp;
    private readonly units: Map<string, RenderableUnit> = new Map();
    private readonly drawer: PixiDrawer;
    private readonly physicsManager: SimplePhysicsManager;
    private readonly ticker: Ticker;
    /** keep reference so we can remove it in destroy() */
    private readonly updateFn: (ticker: Ticker) => void;
    /** overall anim flag you referenced in methods */
    private animating = false;
    public constructor(pixiApp: PixiApp, gridSettings: GridSettings) {
        this.pixiApp = pixiApp;
        this.ticker = pixiApp.getTicker();

        // Physics
        this.physicsManager = new SimplePhysicsManager();

        // Drawer (uses a lightweight Grid shim)
        const dummyGrid: GridLike = { getSettings: () => gridSettings };
        // Cast the shim to the full Grid type so PixiDrawer accepts it without implementing everything
        this.drawer = new PixiDrawer(dummyGrid as unknown as Grid, pixiApp.getApplication());

        // Start the render/update loop — Pixi v8 ticker passes the Ticker instance
        this.updateFn = (t) => this.update(t.deltaMS);
        this.ticker.add(this.updateFn);
    }
    public getBackgroundContainer(): Container {
        return this.pixiApp.getBackgroundContainer();
    }
    public getApplication(): Application {
        return this.pixiApp.getApplication();
    }
    public getWorldRoot(): Container {
        return this.pixiApp.getCamera();
    }
    public fitWorldToViewport(minX: number, minY: number, maxX: number, maxY: number, padding = 0): void {
        const { width, height } = this.getViewportSize(); // CSS pixels
        const worldW = Math.max(1, maxX - minX);
        const worldH = Math.max(1, maxY - minY);
        const viewW = Math.max(1, width - padding * 2);
        const viewH = Math.max(1, height - padding * 2);

        const zoom = Math.min(viewW / worldW, viewH / worldH);
        const cx = (minX + maxX) * 0.5;
        const cy = (minY + maxY) * 0.5;

        const root = this.getWorldRoot();
        // y-up: flip Y
        root.scale.set(zoom, -zoom);
        // map (cx, cy) to screen center; note + for y because of the flip
        root.position.set(width / 2 - cx * zoom, height / 2 + cy * zoom);
    }
    public removeUnit(unitId: string): void {
        const unit = this.units.get(unitId);
        if (unit) {
            // unit.destroy();
            this.units.delete(unitId);
        }
    }
    public getViewportSize(): { width: number; height: number } {
        const app = this.pixiApp.getApplication();
        // Pixi v8: renderer.width/height are in CSS pixels after autoDensity scaling
        return { width: app.renderer.width, height: app.renderer.height };
    }
    public startMoveAnimation(unitId: string, _path: HoCMath.XY[]): void {
        const unit = this.units.get(unitId);
        if (unit) {
            // unit.startMoveAnimation(path);
            this.animating = true;
        }
        // optional: also tell drawer if you want it to track anim state
        // this.drawer.startMoveAnimation(unit!, path);
    }
    public startFlyAnimation(unitId: string, _targetPosition: HoCMath.XY): void {
        const unit = this.units.get(unitId);
        if (unit) {
            // unit.startFlyAnimation(targetPosition);
            this.animating = true;
        }
        // optional: this.drawer.startFlyAnimation(unit!, targetPosition);
    }
    public isAnimating(): boolean {
        return this.animating;
    }
    private update(deltaTimeMs: number): void {
        // Update physics
        this.physicsManager.update(deltaTimeMs);

        // Sync units with physics & update each unit
        for (const [unitId, unit] of this.units.entries()) {
            const physicsUnit = this.physicsManager.getUnit(unitId);
            if (physicsUnit) {
                unit.setPosition(physicsUnit.position.x, physicsUnit.position.y);
                // unit.updateSpritePosition();
            }
            // unit.update(deltaTimeMs);
        }

        // Draw overlays / helpers
        this.drawer.update(deltaTimeMs);
    }
    // Camera delegation
    public setCameraPosition(x: number, y: number): void {
        this.pixiApp.setCameraPosition(x, y);
    }
    public setCameraZoom(zoom: number): void {
        this.pixiApp.setCameraZoom(zoom);
    }
    public getCameraPosition(): { x: number; y: number } {
        return this.pixiApp.getCameraPosition();
    }
    public getCameraZoom(): number {
        return this.pixiApp.getCameraZoom();
    }
    public resize(width: number, height: number): void {
        this.pixiApp.resize(width, height);
    }
    public destroy(): void {
        // Stop ticker and remove callback
        this.ticker.remove(this.updateFn);

        // Clean up all units
        this.units.clear();

        // Clean up drawer
        this.drawer.destroy();
    }
    // ------- Drawer delegates -------
    public drawPath(
        color: number,
        currentActivePath?: HoCMath.XY[],
        currentActiveUnitPositions?: HoCMath.XY[],
        hoverAttackFromHashes?: Set<number>,
        drawSolid = true,
    ): void {
        this.drawer.drawPath(color, currentActivePath, currentActiveUnitPositions, hoverAttackFromHashes, drawSolid);
    }
    public drawAttackTo(targetPosition: HoCMath.XY, size: number): void {
        this.drawer.drawAttackTo(targetPosition, size);
    }
    public drawHoverCells(cells?: HoCMath.XY[], hoverSelectedCellsSwitchToRed = false): void {
        this.drawer.drawHoverCells(cells, hoverSelectedCellsSwitchToRed);
    }
    public setHoleLayers(numberOfLayers: number): void {
        this.drawer.setHoleLayers(numberOfLayers);
    }
    public setGridType(gridType: GridType): void {
        this.drawer.setGridType(gridType);
    }
}
