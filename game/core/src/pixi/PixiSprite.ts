import * as PIXI from "pixi.js";

export class PixiSprite extends PIXI.Sprite {
    public constructor(texture: PIXI.Texture) {
        super(texture);
        this.anchor.set(0.5); // Center anchor by default
    }

    public setRect(x: number, y: number, width: number, height: number): void {
        this.x = x + width / 2; // Adjust for anchor point
        this.y = y + height / 2; // Adjust for anchor point
        this.width = width;
        this.height = height;
    }

    public setRotatedRect(
        x: number,
        y: number,
        width: number,
        height: number,
        rotation: number,
        centerX: number,
        centerY: number,
        scale = 1,
    ): void {
        this.x = x + width / 2;
        this.y = y + height / 2;
        this.width = width * scale;
        this.height = height * scale;
        this.rotation = rotation;
        this.pivot.set(centerX, centerY);
    }

    public render(opacity = 1): void {
        this.alpha = opacity;
        // In PixiJS, rendering is handled automatically by the renderer
        // This method is kept for API compatibility
    }

    public destroy(): void {
        super.destroy();
    }

    public isDone(): boolean {
        // PixiJS sprites don't have a "done" state by default
        return true;
    }

    public setUvOffset(_x: number, _y: number): void {
        // UV offset is handled differently in PixiJS
        // This would require a custom shader or texture frame adjustment
        // For now, we'll keep it as a placeholder
    }
}
