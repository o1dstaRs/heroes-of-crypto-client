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

    public resize(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.viewport = new Rectangle(0, 0, width, height);
        this.update();
    }

    public setPositionAndZoom(x: number, y: number, zoom: number): void {
        this.center.x = x;
        this.center.y = y;
        this.zoom = zoom;
        this.update();
    }

    public setPosition(x: number, y: number): void {
        this.center.x = x;
        this.center.y = y;
        this.update();
    }

    public setZoom(zoom: number): void {
        this.zoom = zoom;
        this.update();
    }

    // World -> Screen
    public project(worldX: number, worldY: number): { x: number; y: number } {
        const x = (worldX - this.center.x) * this.zoom + this.width / 2;
        const y = (worldY - this.center.y) * this.zoom + this.height / 2;
        return { x, y };
    }

    // Screen -> World
    public unproject(screenX: number, screenY: number): { x: number; y: number } {
        const x = (screenX - this.width / 2) / this.zoom + this.center.x;
        const y = (screenY - this.height / 2) / this.zoom + this.center.y;
        return { x, y };
    }

    // Apply to a scene container
    public applyToContainer(container: Container): void {
        container.x = -this.center.x * this.zoom + this.width / 2;
        container.y = -this.center.y * this.zoom + this.height / 2;
        container.scale.set(this.zoom, this.zoom);
    }
}

export const g_pixiCamera = new PixiCamera();
