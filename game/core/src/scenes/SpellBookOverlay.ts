import { Container, Graphics } from "pixi.js";
import type { RenderableUnit } from "./RenderableUnit";

interface SpellBookPresentation {
    content: Container;
    prepare(unit: RenderableUnit): Promise<void>;
    onError(): void;
    now?: () => number;
    revealDurationMs?: number;
}

export class SpellBookOverlay {
    private overlayContainer: Container;
    private dimmer: Graphics;
    private isOpen: boolean = false;
    private requestedUnit?: RenderableUnit;
    private readyUnit?: RenderableUnit;
    private request?: object;
    private revealStartedAt?: number;
    private destroyed = false;
    private readonly now: () => number;
    private readonly revealDurationMs: number;
    public constructor(
        parentContainer: Container,
        appWidth: number,
        appHeight: number,
        private readonly presentation?: SpellBookPresentation,
    ) {
        this.now = presentation?.now ?? (() => performance.now());
        this.revealDurationMs =
            presentation?.revealDurationMs ??
            (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 140);
        this.overlayContainer = new Container();
        this.overlayContainer.visible = false;
        this.overlayContainer.zIndex = 6990;
        if (presentation) {
            presentation.content.visible = false;
            presentation.content.alpha = 0;
        }

        // Create a semi-transparent dimmer background
        this.dimmer = new Graphics();
        this.dimmer.rect(0, 0, appWidth, appHeight).fill({ color: 0x000000, alpha: 0.0 });
        this.dimmer.interactive = true; // Block clicks passing through

        this.overlayContainer.addChild(this.dimmer);
        parentContainer.sortableChildren = true;
        parentContainer.addChild(this.overlayContainer);
    }
    public setOpen(open: boolean): void {
        if (this.destroyed || this.isOpen === open) return;
        this.isOpen = open;
        this.overlayContainer.visible = open;
        this.request = undefined;
        this.requestedUnit = undefined;
        this.readyUnit = undefined;
        this.revealStartedAt = undefined;
        if (this.presentation) {
            this.presentation.content.visible = false;
            this.presentation.content.alpha = 0;
        }
    }
    public isReadyFor(unit: RenderableUnit | undefined): boolean {
        return (
            this.isOpen &&
            !!unit &&
            this.readyUnit === unit &&
            (!this.presentation || (this.presentation.content.visible && this.presentation.content.alpha > 0))
        );
    }
    public resize(width: number, height: number): void {
        this.dimmer.clear();
        this.dimmer.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.0 });

        // Keep the dimmer in screen space.
        this.overlayContainer.position.set(0, 0);
        this.overlayContainer.scale.set(1, 1);
    }
    public render(activeUnit: RenderableUnit | undefined): void {
        if (!this.isOpen || this.destroyed) return;
        if (!activeUnit) {
            this.request = undefined;
            this.requestedUnit = undefined;
            this.readyUnit = undefined;
            if (this.presentation) this.presentation.content.visible = false;
            return;
        }
        if (this.requestedUnit !== activeUnit) {
            this.requestedUnit = activeUnit;
            this.readyUnit = undefined;
            this.revealStartedAt = undefined;
            if (!this.presentation) {
                this.readyUnit = activeUnit;
            } else {
                this.presentation.content.visible = false;
                this.presentation.content.alpha = 0;
                const request = (this.request = {});
                void this.presentation.prepare(activeUnit).then(
                    () => {
                        if (this.request === request && this.isOpen && !this.destroyed) this.readyUnit = activeUnit;
                    },
                    () => {
                        if (this.request === request && this.isOpen && !this.destroyed) this.presentation?.onError();
                    },
                );
            }
        }
        if (this.readyUnit !== activeUnit) return;

        activeUnit.renderSpells(1);
        if (!this.presentation) return;
        this.revealStartedAt ??= this.now();
        const progress =
            this.revealDurationMs > 0
                ? Math.min(1, Math.max(0, (this.now() - this.revealStartedAt) / this.revealDurationMs))
                : 1;
        this.presentation.content.alpha = 1 - (1 - progress) ** 3;
        this.presentation.content.visible = true;
    }
    public destroy(): void {
        if (this.destroyed) return;
        this.setOpen(false);
        this.destroyed = true;
        this.overlayContainer.destroy({ children: true });
    }
}
