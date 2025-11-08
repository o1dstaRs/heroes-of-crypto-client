// game/core/src/obstacles/obstacle.ts
import { ObstacleType, HoCMath, GridSettings, HoCConstants } from "@heroesofcrypto/common";
import { Graphics, Container } from "pixi.js";

// Minimal shape both old GL Sprite and Pixi adapter can satisfy
export interface SpriteLike {
    setRect(x: number, y: number, width: number, height: number): void;
    render(): void;
}

export class Obstacle {
    private readonly type: ObstacleType;
    private readonly position: HoCMath.XY;
    private readonly sizeX: number;
    private readonly sizeY: number;
    private readonly gridSettings: GridSettings;
    private lightSprite?: SpriteLike;
    private darkSprite?: SpriteLike;
    private readonly monitorHits: boolean;
    // Optional: a graphics layer for hitbar (attach externally if you want)
    private hitbarLayer?: Container;
    public constructor(
        type: ObstacleType,
        position: HoCMath.XY,
        sizeX: number,
        sizeY: number,
        gridSettings: GridSettings,
        lightSprite?: SpriteLike,
        darkSprite?: SpriteLike,
        monitorHits = false,
        hitbarLayer?: Container, // optional container to draw hitbar into
    ) {
        this.type = type;
        this.position = position;
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.gridSettings = gridSettings;
        this.lightSprite = lightSprite;
        this.darkSprite = darkSprite;
        this.monitorHits = monitorHits;
        this.hitbarLayer = hitbarLayer;
    }
    public getSizeX(): number {
        return this.sizeX;
    }
    public getSizeY(): number {
        return this.sizeY;
    }
    public getType(): ObstacleType {
        return this.type;
    }
    public setLightSprite(lightSprite?: SpriteLike): void {
        this.lightSprite = lightSprite;
    }
    public setDarkSprite(darkSprite?: SpriteLike): void {
        this.darkSprite = darkSprite;
    }
    private drawHitbar(hitsRemaining: number): void {
        if (!this.hitbarLayer) return;

        // Clear old bar
        for (let i = this.hitbarLayer.children.length - 1; i >= 0; i--) {
            const child = this.hitbarLayer.children[i];
            if (child instanceof Graphics) {
                child.destroy();
            } else {
                this.hitbarLayer.removeChild(child);
            }
        }

        const g = new Graphics();
        const startX =
            ((this.gridSettings.getMinX() + this.gridSettings.getMaxX()) >> 1) - this.gridSettings.getTwoSteps();
        const startY =
            ((this.gridSettings.getMinY() + this.gridSettings.getMaxY()) >> 1) - this.gridSettings.getTwoSteps();

        const shiftX = Math.floor(
            (this.gridSettings.getStep() / HoCConstants.MAX_HITS_MOUNTAIN) * (HoCConstants.MAX_HITS_MOUNTAIN - 1),
        );

        for (let h = hitsRemaining; h > 0; h--) {
            const idx = h - 1;
            const currentShiftX = shiftX * idx;

            const x0 = startX + currentShiftX;
            const y0 = startY;
            const x1 = startX + currentShiftX + shiftX;
            const y1 = startY + 40;

            // Outer frame
            g.rect(x0, y0, x1 - x0, y1 - y0).stroke({ width: 1, color: 0xffffff, alpha: 1 });
            // Inner frame
            g.rect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2).stroke({ width: 1, color: 0xffffff, alpha: 1 });
            // Fill
            g.rect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4).fill({ color: 0xfdfa70, alpha: 1 });
        }

        this.hitbarLayer.addChild(g);
    }
    public render(isLightMode: boolean, hitsRemaining = 0): void {
        const sprite = isLightMode ? this.lightSprite : this.darkSprite;

        if (sprite) {
            sprite.setRect(this.position.x, this.position.y, this.sizeX, this.sizeY);
            sprite.render();
        }

        if (this.monitorHits && this.type === ObstacleType.BLOCK && hitsRemaining) {
            this.drawHitbar(hitsRemaining);
        }
    }
}
