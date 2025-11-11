// game/core/src/pixi/PixiCamera.ts
import { Rectangle } from "pixi.js";
import type { Container } from "pixi.js";

export class PixiCamera {
    private center: { x: number; y: number } = { x: 0, y: 20 };
    private zoom = 1;
    private width = 0;
    private height = 0;
    // PixiJS viewport
    private viewport: Rectangle = new Rectangle(0, 0, 0, 0);
    public getZoom(): number {
        return this.zoom;
    }
    public getCenter(): { x: number; y: number } {
        return { ...this.center };
    }
    public getWidth(): number {
        return this.width;
    }
    public getHeight(): number {
        return this.height;
    }
    public getViewport(): Rectangle {
        return this.viewport.clone();
    }
    public update(): void {
        // Camera math only; applied via applyToContainer
    }
    /** Resize the *screen* (render surface) that this camera maps onto */
    public resize(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.viewport = new Rectangle(0, 0, width, height);
        this.update();
    }
    /** Fit the camera so the [minX..maxX]×[minY..maxY] world rect fills the screen */
    public fitToBounds(minX: number, minY: number, maxX: number, maxY: number, padding = 0): void {
        const worldW = Math.max(1, maxX - minX);
        const worldH = Math.max(1, maxY - minY);
        const viewW = Math.max(1, this.width - padding * 2);
        const viewH = Math.max(1, this.height - padding * 2);

        // uniform scale to keep aspect ratio
        this.zoom = Math.min(viewW / worldW, viewH / worldH);

        // center on the world rect
        this.center.x = (minX + maxX) * 0.5;
        this.center.y = (minY + maxY) * 0.5;

        this.update();
    }
    // World <-> Screen + applyToContainer stay the same...
    public project(worldX: number, worldY: number): { x: number; y: number } {
        const x = (worldX - this.center.x) * this.zoom + this.width / 2;
        const y = (worldY - this.center.y) * this.zoom + this.height / 2;
        return { x, y };
    }
    public unproject(screenX: number, screenY: number): { x: number; y: number } {
        const x = (screenX - this.width / 2) / this.zoom + this.center.x;
        const y = (screenY - this.height / 2) / this.zoom + this.center.y;
        return { x, y };
    }
    public applyToContainer(container: Container): void {
        container.x = -this.center.x * this.zoom + this.width / 2;
        container.y = -this.center.y * this.zoom + this.height / 2;
        container.scale.set(this.zoom, this.zoom);
    }
}

export const g_pixiCamera = new PixiCamera();
