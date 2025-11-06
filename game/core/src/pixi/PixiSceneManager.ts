// game/core/src/pixi/PixiSceneManager.ts
import { Application, Ticker } from "pixi.js";
import { GridSettings, HoCMath, GridType, Grid as GridTypeFull } from "@heroesofcrypto/common";
import { PixiApp } from "./PixiApp";
import { PixiUnit } from "./PixiUnit";
import { PixiDrawer } from "./PixiDrawer";
import { SimplePhysicsManager } from "./SimplePhysicsManager";
import { makeBodyLike, type BodyLike, type DisplayObjectLike } from "./userData";

/** Minimal grid shape expected by PixiDrawer; we'll cast it to the full Grid type for compatibility */
interface GridLike {
    getSettings(): GridSettings;
}

/** Bounds shape we care about */
interface BoundsLike {
    contains(x: number, y: number): boolean;
}

/** Type guard: does an unknown object expose getBounds(): BoundsLike ? */
function hasBounds(obj: unknown): obj is { getBounds: () => BoundsLike } {
    return !!obj && typeof obj === "object" && typeof (obj as { getBounds?: unknown }).getBounds === "function";
}

function hasRect(obj: unknown): obj is { x: number; y: number; width: number; height: number } {
    if (!obj || typeof obj !== "object") return false;
    const o = obj as Record<string, unknown>;
    return (
        typeof o.x === "number" &&
        typeof o.y === "number" &&
        typeof o.width === "number" &&
        typeof o.height === "number"
    );
}

export class PixiSceneManager {
    private readonly pixiApp: PixiApp;
    private readonly units: Map<string, PixiUnit> = new Map();
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
        this.drawer = new PixiDrawer(dummyGrid as unknown as GridTypeFull, pixiApp.getApplication());

        // Start the render/update loop — Pixi v8 ticker passes the Ticker instance
        this.updateFn = (t) => this.update(t.deltaMS);
        this.ticker.add(this.updateFn);
    }

    public getApplication(): Application {
        return this.pixiApp.getApplication();
    }

    public hitTest(x: number, y: number): BodyLike | undefined {
        const layer = this.pixiApp.getUnitsContainer();
        const children = layer.children as unknown as DisplayObjectLike[];

        for (let i = children.length - 1; i >= 0; i--) {
            const obj = children[i];

            // Prefer precise local/global bounds if available
            if (hasBounds(obj)) {
                // Pixi v8's getBounds() returns a Bounds-like object; we only need `contains`.
                const b = obj.getBounds() as unknown as BoundsLike;
                if (b.contains(x, y)) {
                    return makeBodyLike(obj);
                }
            } else if (hasRect(obj)) {
                // Fallback: simple AABB check using x,y,width,height
                if (x >= obj.x && y >= obj.y && x <= obj.x + obj.width && y <= obj.y + obj.height) {
                    return makeBodyLike(obj);
                }
            }
        }
        return undefined;
    }

    public addUnit(unitId: string, unit: PixiUnit): void {
        this.units.set(unitId, unit);
        this.pixiApp.getUnitsContainer().addChild(unit.getContainer());
    }

    public removeUnit(unitId: string): void {
        const unit = this.units.get(unitId);
        if (unit) {
            // unit.destroy();
            this.units.delete(unitId);
        }
    }

    public getUnit(unitId: string): PixiUnit | undefined {
        return this.units.get(unitId);
    }

    public getAllUnits(): Map<string, PixiUnit> {
        return new Map(this.units);
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

    public isAnimatingMovement(): boolean {
        for (const unit of this.units.values()) {
            if (unit.isAnimatingMovement()) return true;
        }
        return false;
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

        // Overall animation flag
        this.animating = this.isAnimatingMovement();
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
