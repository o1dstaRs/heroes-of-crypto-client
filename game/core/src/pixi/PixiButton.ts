import { Container } from "pixi.js";
import { GridMath, GridSettings } from "@heroesofcrypto/common";
import { PixiSprite } from "./PixiSprite";

export class PixiButton {
    private readonly gridSettings: GridSettings;
    private position: { x: number; y: number };
    private cell?: { x: number; y: number };
    private spriteWhite: PixiSprite;
    private spriteBlack?: PixiSprite;
    private spriteActive?: PixiSprite;
    private selected = false;
    private container: Container;

    public constructor(
        gridSettings: GridSettings,
        spriteWhite: PixiSprite,
        position: { x: number; y: number },
        spriteBlack?: PixiSprite,
        spriteActive?: PixiSprite,
        selected = false,
    ) {
        this.gridSettings = gridSettings;
        this.spriteWhite = spriteWhite;
        this.spriteBlack = spriteBlack;
        this.spriteActive = spriteActive;
        this.position = position;
        this.cell = GridMath.getCellForPosition(this.gridSettings, position);
        this.selected = selected;

        // Create container for the button
        this.container = new Container();
        this.container.addChild(this.spriteWhite);
        if (this.spriteBlack) this.container.addChild(this.spriteBlack);
        if (this.spriteActive) this.container.addChild(this.spriteActive);
    }

    public getContainer(): Container {
        return this.container;
    }

    public getPosition(): { x: number; y: number } {
        return this.position;
    }

    public setPosition(position: { x: number; y: number }): void {
        this.position = position;
        this.cell = GridMath.getCellForPosition(this.gridSettings, position);

        // Update sprite positions
        this.spriteWhite.x = position.x;
        this.spriteWhite.y = position.y;
        if (this.spriteBlack) {
            this.spriteBlack.x = position.x;
            this.spriteBlack.y = position.y;
        }
        if (this.spriteActive) {
            this.spriteActive.x = position.x;
            this.spriteActive.y = position.y;
        }
    }

    public isHover(cellPosition?: { x: number; y: number }): boolean {
        return !!(cellPosition && this.cell && this.cell.x === cellPosition.x && this.cell.y === cellPosition.y);
    }

    public setIsSelected(isSelected: boolean): void {
        this.selected = isSelected;
    }

    public isSelected(): boolean {
        return this.selected;
    }

    public switchSprites(spriteWhite: PixiSprite, spriteBlack?: PixiSprite, allowDestroy = true): void {
        if (allowDestroy) {
            this.spriteWhite.destroy();
            if (this.spriteBlack) this.spriteBlack.destroy();
        }

        this.spriteWhite = spriteWhite;
        this.spriteBlack = spriteBlack;

        // Update container
        this.container.removeChildren();
        this.container.addChild(this.spriteWhite);
        if (this.spriteBlack) this.container.addChild(this.spriteBlack);
        if (this.spriteActive) this.container.addChild(this.spriteActive);
    }

    public render(isLightMode: boolean, multiplier = 1, isActive = false): void {
        // Hide all sprites first
        this.spriteWhite.visible = false;
        if (this.spriteBlack) this.spriteBlack.visible = false;
        if (this.spriteActive) this.spriteActive.visible = false;

        const x = this.position.x - this.gridSettings.getHalfStep() * multiplier;
        const y = this.position.y - this.gridSettings.getHalfStep() * multiplier;
        const w = this.gridSettings.getStep() * multiplier;
        const h = this.gridSettings.getStep() * multiplier;

        // Show the appropriate sprite
        if (isActive && this.spriteActive) {
            this.spriteActive.visible = true;
            this.spriteActive.setRect(x, y, w, h);
        } else if (this.spriteBlack) {
            if (isLightMode) {
                this.spriteBlack.visible = true;
                this.spriteBlack.setRect(x, y, w, h);
            } else {
                this.spriteWhite.visible = true;
                this.spriteWhite.setRect(x, y, w, h);
            }
        } else {
            this.spriteWhite.visible = true;
            this.spriteWhite.setRect(x, y, w, h);
        }
    }

    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
