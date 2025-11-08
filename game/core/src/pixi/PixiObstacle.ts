import { Container, Graphics } from "pixi.js";
import { ObstacleType, HoCMath, GridSettings, HoCConstants } from "@heroesofcrypto/common";
import { PixiSprite } from "./PixiSprite";

export class PixiObstacle {
    private readonly type: ObstacleType;
    private readonly position: HoCMath.XY;
    private readonly sizeX: number;
    private readonly sizeY: number;
    private readonly gridSettings: GridSettings;
    private lightSprite?: PixiSprite;
    private darkSprite?: PixiSprite;
    private readonly monitorHits: boolean;
    private container: Container;
    private hitBarGraphics: Graphics;
    public constructor(
        type: ObstacleType,
        position: HoCMath.XY,
        sizeX: number,
        sizeY: number,
        gridSettings: GridSettings,
        lightSprite?: PixiSprite,
        darkSprite?: PixiSprite,
        monitorHits: boolean = false,
    ) {
        this.type = type;
        this.position = position;
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.gridSettings = gridSettings;
        this.lightSprite = lightSprite;
        this.darkSprite = darkSprite;
        this.monitorHits = monitorHits;

        this.container = new Container();
        this.hitBarGraphics = new Graphics();
        this.container.addChild(this.hitBarGraphics);

        if (this.lightSprite) this.container.addChild(this.lightSprite);
        if (this.darkSprite) this.container.addChild(this.darkSprite);
    }
    public getContainer(): Container {
        return this.container;
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
    public setLightSprite(lightSprite?: PixiSprite): void {
        if (this.lightSprite) this.container.removeChild(this.lightSprite);
        this.lightSprite = lightSprite;
        if (this.lightSprite) this.container.addChild(this.lightSprite);
    }
    public setDarkSprite(darkSprite?: PixiSprite): void {
        if (this.darkSprite) this.container.removeChild(this.darkSprite);
        this.darkSprite = darkSprite;
        if (this.darkSprite) this.container.addChild(this.darkSprite);
    }
    private drawHitbar(hitsRemaining: number): void {
        this.hitBarGraphics.clear();
        if (this.type !== ObstacleType.BLOCK || !hitsRemaining) return;

        const centerX = (this.gridSettings.getMinX() + this.gridSettings.getMaxX()) >> 1;
        const centerY = (this.gridSettings.getMinY() + this.gridSettings.getMaxY()) >> 1;

        const startingPositionX = centerX - this.gridSettings.getTwoSteps();
        const startingPositionY = centerY - this.gridSettings.getTwoSteps();

        const shiftX = Math.floor(
            (this.gridSettings.getStep() / HoCConstants.MAX_HITS_MOUNTAIN) * (HoCConstants.MAX_HITS_MOUNTAIN - 1),
        );

        const barHeight = 40;

        for (let i = 0; i < hitsRemaining; i++) {
            const x = startingPositionX + shiftX * i;
            const y = startingPositionY;
            const w = shiftX;
            const h = barHeight;

            // Outline
            this.hitBarGraphics.rect(x, y, w, h).stroke({ width: 1, color: 0xffffff });

            // Inner fill (inset by 2px)
            this.hitBarGraphics.rect(x + 2, y + 2, Math.max(0, w - 4), Math.max(0, h - 4)).fill({ color: 0xfdfa70 });
        }
    }
    public render(isLightMode: boolean, hitsRemaining = 0): void {
        let sprite: PixiSprite | undefined = isLightMode ? this.lightSprite : this.darkSprite;

        // Hide all first
        if (this.lightSprite) this.lightSprite.visible = false;
        if (this.darkSprite) this.darkSprite.visible = false;

        if (sprite) {
            sprite.visible = true;
            sprite.setRect(this.position.x, this.position.y, this.sizeX, this.sizeY);
        }

        if (this.monitorHits && this.type === ObstacleType.BLOCK && hitsRemaining) {
            this.drawHitbar(hitsRemaining);
        } else {
            this.hitBarGraphics.clear();
        }
    }
    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
