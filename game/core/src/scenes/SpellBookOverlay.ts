import { Container, Graphics } from "pixi.js";
import { RenderableUnit } from "./RenderableUnit";

export class SpellBookOverlay {
    private overlayContainer: Container;
    private dimmer: Graphics;
    private isOpen: boolean = false;
    public constructor(parentContainer: Container, appWidth: number, appHeight: number) {
        this.overlayContainer = new Container();
        this.overlayContainer.visible = false;

        // Create a semi-transparent dimmer background
        this.dimmer = new Graphics();
        this.dimmer.rect(0, 0, appWidth, appHeight).fill({ color: 0x000000, alpha: 0.0 });
        this.dimmer.interactive = true; // Block clicks passing through

        this.overlayContainer.addChild(this.dimmer);
        parentContainer.addChild(this.overlayContainer);
    }
    public setOpen(open: boolean): void {
        this.isOpen = open;
        this.overlayContainer.visible = open;
        if (open) {
            console.log(
                `[SpellBookOverlay] setOpen(true). Pos: ${this.overlayContainer.x},${this.overlayContainer.y}. ScaleY: ${this.overlayContainer.scale.y}`,
            );
            // Force front?
            // this.overlayContainer.parent.setChildIndex(this.overlayContainer, 0); // Background
        }
    }
    public resize(width: number, height: number): void {
        this.dimmer.clear();
        this.dimmer.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.0 });

        // Reset transforms in case we are on Stage (Screen Space)
        this.overlayContainer.position.set(0, 0);
        this.overlayContainer.scale.set(1, 1);
    }
    public render(activeUnit: RenderableUnit | undefined): void {
        if (!this.isOpen || !activeUnit) return;

        // Delegate rendering to the unit
        // We assume activeUnit has a method to render its spells onto the overlay container
        // Note: In the planned architecture, RenderableUnit will manage the PixiRenderableSpells
        // and toggle their visibility/position based on this call.
        if (activeUnit.renderSpells) {
            activeUnit.renderSpells(1); // Render page 1 for now
        }
    }
}
