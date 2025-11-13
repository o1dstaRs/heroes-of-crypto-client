// game/core/src/scenes/UnitChip.ts
import { Container, Graphics, Sprite, Text, TextStyle, Texture, Ticker } from "pixi.js";

export type AmountProvider = (unitName: string) => number | undefined | null;

export type UnitChipOptions = {
    unitName: string;
    texture?: Texture;
    getAmount?: AmountProvider;
    banned?: boolean;
};

export class UnitChip extends Container {
    public readonly nameKey: string;
    private content: Container;
    private glow: Graphics;
    private aroundGlow: Graphics;
    private sprite: Sprite;
    private badgeCont: Container;
    private badgeCircle: Graphics;
    private badgeText: Text;
    private hovered = false;
    private selected = false;
    private banned = false;
    private amountProvider?: AmountProvider;
    private lastIconSide = 0;
    // Tween targets and state
    private targetScale = 1.0;
    private targetY = 0;
    private currentScale = 1.0;
    private currentY = 0;
    private tweenDuration = 250;
    private tweenStartTime = 0;
    private isTweening = false;
    private ticker?: Ticker;
    public constructor(opts: UnitChipOptions) {
        super();
        this.nameKey = opts.unitName;
        this.amountProvider = opts.getAmount;
        this.banned = !!opts.banned;

        this.eventMode = "static";
        this.cursor = "pointer";

        this.content = new Container();

        this.glow = new Graphics();
        this.glow.visible = false;
        this.glow.blendMode = "add";

        this.aroundGlow = new Graphics();
        this.aroundGlow.visible = false;
        this.aroundGlow.blendMode = "add";

        this.sprite = new Sprite(opts.texture ?? Texture.EMPTY);
        this.sprite.anchor.set(0.5);

        this.badgeCont = new Container();
        this.badgeCircle = new Graphics().circle(0, 0, 10).fill({ color: 0xffffff, alpha: 1 });
        this.badgeText = new Text({
            text: "0",
            style: new TextStyle({ fill: 0x000000, fontSize: 14, fontWeight: "700" }),
        });
        this.badgeText.anchor.set(0.5);
        this.badgeCont.addChild(this.badgeCircle, this.badgeText);
        this.badgeCont.visible = false;

        this.content.addChild(this.aroundGlow, this.glow, this.sprite, this.badgeCont);
        this.addChild(this.content);

        // Pointer interactions
        this.on("pointerover", () => this.setHovered(true));
        this.on("pointerout", () => this.setHovered(false));
        this.off("pointertap");

        if (this.banned) this.applyBannedVisual(true);
    }
    public setTicker(ticker: Ticker): void {
        this.ticker = ticker;
    }
    /** Call whenever the grid lays out to size the chip nicely. */
    public layout(iconSide: number) {
        this.lastIconSide = iconSide;

        this.sprite.width = this.sprite.height = iconSide;

        const br = Math.max(10, Math.floor(iconSide * 0.18));
        this.badgeCircle.clear().circle(0, 0, br).fill({ color: 0xffffff, alpha: 1 });

        const fs = Math.max(12, Math.floor(iconSide * 0.22));
        this.badgeText.style = new TextStyle({ fill: 0x000000, fontSize: fs, fontWeight: "700" });
        this.badgeCont.position.set(iconSide * 0.35, -iconSide * 0.35);

        this.drawGlows(iconSide);

        // Re-apply states with split hover/selection logic
        this.applyHoverVisuals(); // sets scale/offset + tween based on hover only
        this.updateHighlight(); // sets glows/badge based on hover OR selection
    }
    /** Hover drives animation */
    public setHovered(v: boolean) {
        if (this.hovered === v) return;
        this.hovered = v;

        this.applyHoverVisuals(); // only hover changes scale/float
        this.updateHighlight(); // highlight may also change (hover is part of "active")
    }
    /** Selection only changes highlight; no scale/tween */
    public setSelected(v: boolean) {
        if (this.selected === v) return;
        this.selected = v;

        // Only update glows/badge; don't touch scale/position
        this.updateHighlight();
    }
    public setBanned(v: boolean) {
        if (this.banned === v) return;
        this.banned = v;
        this.applyBannedVisual(v);
        if (this.lastIconSide > 0) this.layout(this.lastIconSide);
    }
    public setAmountProvider(fn?: AmountProvider) {
        this.amountProvider = fn;
        this.updateHighlight();
    }
    /** Hover-only scale + float + tween */
    private applyHoverVisuals() {
        const hoverActive = this.hovered;

        this.targetScale = hoverActive ? 1.2 : 1.0;
        this.targetY = hoverActive ? -Math.max(2, Math.floor(this.lastIconSide * 0.06)) : 0;

        this.startTween();
    }
    private updateHighlight() {
        const anyActive = this.hovered || this.selected;

        this.glow.visible = anyActive;
        this.aroundGlow.visible = anyActive;

        const amount = this.amountProvider?.(this.nameKey) ?? 0;
        this.badgeText.text = String(amount);
        this.badgeCont.visible = anyActive && !!amount;
    }
    private startTween() {
        if (!this.ticker) {
            // No ticker: snap instantly
            this.content.scale.set(this.targetScale);
            this.content.y = this.targetY;
            return;
        }

        // If we are already tweening, restart from current transform
        this.currentScale = this.content.scale.x;
        this.currentY = this.content.y;
        this.tweenStartTime = performance.now();

        if (!this.isTweening) {
            this.isTweening = true;
            const step = () => {
                const elapsed = performance.now() - this.tweenStartTime;
                const progress = Math.min(1, elapsed / this.tweenDuration);
                const ease = this.easeInOutCubic(progress);

                this.content.scale.set(this.currentScale + (this.targetScale - this.currentScale) * ease);
                this.content.y = this.currentY + (this.targetY - this.currentY) * ease;

                if (progress >= 1) {
                    this.isTweening = false;
                    this.ticker?.remove(step);
                }
            };
            this.ticker.add(step);
        }
    }
    private easeInOutCubic(t: number): number {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }
    private drawGlows(iconSide: number) {
        const baseW = iconSide * 0.95;
        const baseH = iconSide * 0.28;
        const yOffset = iconSide * 0.48;

        this.glow.clear();
        this.glow.position.set(0, yOffset);

        const underLayers = 4;
        for (let i = 0; i < underLayers; i++) {
            const t = (i + 1) / underLayers;
            const w = baseW * (1 + 0.25 * t);
            const h = baseH * (1 + 0.35 * t);
            const alpha = 0.22 * (1 - t * 0.85);
            this.glow.ellipse(0, 0, w * 0.5, h * 0.5).fill({ color: 0xffffff, alpha });
        }

        this.aroundGlow.clear();
        this.aroundGlow.position.set(0, 0);
        const baseR = iconSide * 0.6;
        const aroundLayers = 5;
        for (let i = 0; i < aroundLayers; i++) {
            const t = (i + 1) / aroundLayers;
            const r = baseR * (1 + 0.4 * t);
            const alpha = 0.15 * (1 - t * 0.85);
            this.aroundGlow.circle(0, 0, r).fill({ color: 0xffffff, alpha });
        }
    }
    private applyBannedVisual(on: boolean) {
        if (on) {
            this.sprite.tint = 0x888888;
            this.alpha = 0.9;
        } else {
            this.sprite.tint = 0xffffff;
            this.alpha = 1.0;
        }
    }
}
