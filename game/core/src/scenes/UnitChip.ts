import { Container, Graphics, Sprite, Text, TextStyle, Texture, Ticker } from "pixi.js";

export type AmountProvider = (unitName: string) => number | undefined | null;

export type UnitChipOptions = {
    /** Display name / key used in callbacks & amount lookup */
    unitName: string;
    /** Texture for the unit icon */
    texture?: Texture;
    /** Optional amount provider (called on hover/selected) */
    getAmount?: AmountProvider;
    /** Optional banned look (greyscale-ish + red ring) */
    banned?: boolean;
};

/**
 * Interactive “chip” with:
 * - hover/selected: gentle scale + slight upward float
 * - soft additive glow under/around the unit when active
 * - amount badge (top-right) visible on hover/selected
 */
export class UnitChip extends Container {
    public readonly nameKey: string;
    private content: Container; // moves up/down on hover/selection
    private glow: Graphics; // soft light under the unit
    private aroundGlow: Graphics; // soft light around the unit
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
    private tweenDuration = 250; // ms, increased for smoother feel (adjust 200-300)
    private tweenStartTime = 0;
    private isTweening = false;
    private ticker?: Ticker; // Shared ticker reference (set externally if needed)

    public constructor(opts: UnitChipOptions) {
        super();
        this.nameKey = opts.unitName;
        this.amountProvider = opts.getAmount;
        this.banned = !!opts.banned;
        this.eventMode = "static";
        this.cursor = "pointer";
        this.content = new Container();
        // Soft glow under the sprite (drawn in layout)
        this.glow = new Graphics();
        this.glow.visible = false;
        this.glow.blendMode = "add";
        // Soft glow around the sprite (drawn in layout)
        this.aroundGlow = new Graphics();
        this.aroundGlow.visible = false;
        this.aroundGlow.blendMode = "add";
        this.sprite = new Sprite(opts.texture ?? Texture.EMPTY);
        this.sprite.anchor.set(0.5);
        // Amount badge (white dot + black number)
        this.badgeCont = new Container();
        this.badgeCircle = new Graphics().circle(0, 0, 10).fill({ color: 0xffffff, alpha: 1 });
        this.badgeText = new Text({
            text: "0",
            style: new TextStyle({ fill: 0x000000, fontSize: 14, fontWeight: "700" }),
        });
        this.badgeText.anchor.set(0.5);
        this.badgeCont.addChild(this.badgeCircle, this.badgeText);
        this.badgeCont.visible = false;
        // Build visual tree: glows below, then sprite, badge
        this.content.addChild(this.aroundGlow, this.glow, this.sprite, this.badgeCont);
        this.addChild(this.content);
        // Pointer interactions
        this.on("pointerover", () => this.setHovered(true));
        this.on("pointerout", () => this.setHovered(false));
        if (this.banned) this.applyBannedVisual(true);
    }

    /** Set the shared Ticker (e.g., from app.ticker) for animation. Call this after construction if not using the default. */
    public setTicker(ticker: Ticker): void {
        this.ticker = ticker;
    }

    /** Call whenever the grid lays out to size the chip nicely. */
    public layout(iconSide: number) {
        this.lastIconSide = iconSide;
        // sprite
        this.sprite.width = this.sprite.height = iconSide;
        // badge size/position (top-right of sprite)
        const br = Math.max(10, Math.floor(iconSide * 0.18));
        this.badgeCircle.clear().circle(0, 0, br).fill({ color: 0xffffff, alpha: 1 });
        const fs = Math.max(12, Math.floor(iconSide * 0.22));
        this.badgeText.style = new TextStyle({ fill: 0x000000, fontSize: fs, fontWeight: "700" });
        this.badgeCont.position.set(iconSide * 0.35, -iconSide * 0.35);
        // soft glows
        this.drawGlows(iconSide);
        // Re-apply active visuals with new sizes
        this.applyInteractionVisuals();
    }

    /** Toggle hover state */
    public setHovered(v: boolean) {
        if (this.hovered === v) return;
        this.hovered = v;
        this.applyInteractionVisuals();
    }

    /** Toggle selection (call from outside on click) */
    public setSelected(v: boolean) {
        if (this.selected === v) return;
        this.selected = v;
        this.applyInteractionVisuals();
    }

    /** Optional: toggle banned look */
    public setBanned(v: boolean) {
        if (this.banned === v) return;
        this.banned = v;
        this.applyBannedVisual(v);
        // re-evaluate sizing
        if (this.lastIconSide > 0) this.layout(this.lastIconSide);
    }

    /** Swap / set amount provider dynamically */
    public setAmountProvider(fn?: AmountProvider) {
        this.amountProvider = fn;
        this.applyInteractionVisuals();
    }

    // ---- internals ----
    private applyInteractionVisuals() {
        const active = this.hovered || this.selected;
        // Set tween targets for scale + slight upward float of the whole content
        this.targetScale = active ? 1.2 : 1.0;
        this.targetY = active ? -Math.max(2, Math.floor(this.lastIconSide * 0)) : 0;
        // soft glow visibility
        this.glow.visible = active;
        this.aroundGlow.visible = active;
        // badge shows only if active and amount > 0
        const amount = this.amountProvider?.(this.nameKey) ?? 0;
        this.badgeText.text = String(amount);
        this.badgeCont.visible = active && !!amount;

        // Start/restart tween if needed
        this.startTween();
    }

    private startTween() {
        if (this.isTweening) {
            // Reset start time to interrupt current tween
            this.tweenStartTime = performance.now();
            return;
        }
        if (!this.ticker) {
            console.warn("Ticker not set for UnitChip tween. Set via setTicker().");
            // Fallback to instant if no ticker
            this.content.scale.set(this.targetScale);
            this.content.y = this.targetY;
            return;
        }

        this.currentScale = this.content.scale.x;
        this.currentY = this.content.y;
        this.tweenStartTime = performance.now();
        this.isTweening = true;

        const step = () => {
            const elapsed = performance.now() - this.tweenStartTime;
            const progress = Math.min(1, elapsed / this.tweenDuration);
            const ease = this.easeInOutCubic(progress); // Smoother cubic easing

            this.content.scale.set(this.currentScale + (this.targetScale - this.currentScale) * ease);
            this.content.y = this.currentY + (this.targetY - this.currentY) * ease;

            if (progress >= 1) {
                this.isTweening = false;
                if (this.ticker) this.ticker.remove(step);
            }
        };

        this.ticker.add(step);
    }

    private easeInOutCubic(t: number): number {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    private drawGlows(iconSide: number) {
        // Draw a few concentric ellipses with decreasing alpha for a soft “spotlight” under.
        // Positioned just beneath the sprite center (y positive = down).
        const baseW = iconSide * 0.95;
        const baseH = iconSide * 0.28;
        const yOffset = iconSide * 0.48;
        this.glow.clear();
        this.glow.position.set(0, yOffset);
        const underLayers = 4;
        for (let i = 0; i < underLayers; i++) {
            const t = (i + 1) / underLayers; // 0..1
            const w = baseW * (1 + 0.25 * t);
            const h = baseH * (1 + 0.35 * t);
            const alpha = 0.22 * (1 - t * 0.85); // fade outwards
            this.glow.ellipse(0, 0, w * 0.5, h * 0.5).fill({ color: 0xffffff, alpha }); // white light
        }
        // Draw concentric circles with decreasing alpha for a soft glow around.
        this.aroundGlow.clear();
        this.aroundGlow.position.set(0, 0);
        const baseR = iconSide * 0.6;
        const aroundLayers = 5;
        for (let i = 0; i < aroundLayers; i++) {
            const t = (i + 1) / aroundLayers; // 0..1
            const r = baseR * (1 + 0.4 * t);
            const alpha = 0.15 * (1 - t * 0.85); // softer fade outwards
            this.aroundGlow.circle(0, 0, r).fill({ color: 0xffffff, alpha }); // white light
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
