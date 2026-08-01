// game/core/src/scenes/UnitChip.ts
import { Container, Graphics, Sprite, Text, TextStyle, Texture, Ticker, Rectangle } from "pixi.js";
import { animationAtlases, AnimationUnitName, AnimationStateName } from "../generated/animation_atlases";
import { images, type ImageKey } from "../generated/image_imports";

// --- Atlas helpers (Pixi version of your React helpers) ---

type AtlasMeta = (typeof animationAtlases)[AnimationUnitName][AnimationStateName];

function normalizeUnitNameForAtlas(name?: string | null): AnimationUnitName | null {
    if (!name) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (trimmed in animationAtlases) return trimmed as AnimationUnitName;
    return null;
}

function atlasImageKeyFromUnitAndState(unitName: string, state: string): { key: ImageKey; divider: number } | null {
    const base = unitName.toLowerCase().replace(/\s+/g, "_");
    const stateLower = state.toLowerCase();

    // Full-resolution atlas first: the chips sit at ~90css px (180 device px on retina) and scale up
    // further on hover, where the quarter frames read visibly mushy. The full atlas only decodes when a
    // chip is actually hovered, and only for that unit, so the cost stays proportional to curiosity.
    const fullKey = `${base}_${stateLower}_atlas` as ImageKey;
    if (fullKey in images) return { key: fullKey, divider: 1 };
    const quarterKey = `${base}_${stateLower}_atlas_quarter` as ImageKey;
    if (quarterKey in images) return { key: quarterKey, divider: 4 };
    if (process.env.NODE_ENV === "development") {
        console.warn(`[atlas] Missing atlas image for unit "${unitName}", state "${state}". Expected key: ${fullKey}`);
    }
    return null;
}

function getDefaultAnimationConfig(
    unitName?: string | null,
): { meta: AtlasMeta; imageSrc: string; cacheKey: string; divider: number } | null {
    const normalized = normalizeUnitNameForAtlas(unitName);
    if (!normalized) return null;

    const unitStates = animationAtlases[normalized];
    const stateNames = Object.keys(unitStates) as AnimationStateName[];
    if (!stateNames.length) return null;

    const preferredState = (stateNames as string[]).includes("default")
        ? ("default" as AnimationStateName)
        : stateNames[0];

    const meta = unitStates[preferredState];
    const resolved = atlasImageKeyFromUnitAndState(normalized, preferredState);
    if (!resolved) return null;

    const imageSrc = images[resolved.key];
    if (!imageSrc) return null;

    // The variant is part of the cache key so a full-atlas frame set never collides with a quarter one.
    const cacheKey = `${normalized}::${preferredState}::${resolved.divider}`;
    return { meta, imageSrc, cacheKey, divider: resolved.divider };
}

// Cache textures per atlas to avoid rebuilding frames
const atlasFramesCache = new Map<string, Texture[]>();

function buildAtlasFrames(meta: AtlasMeta, imageSrc: string, divider: number): Texture[] {
    // Parent texture for the whole atlas image (cached by Pixi for a given id/url)
    const parentTexture = Texture.from(imageSrc);
    const source = parentTexture.source; // ✅ v8 way, replaces deprecated baseTexture

    // meta.frameWidth/Height describe the FULL-res frame; the divider matches the atlas variant loaded.
    const frameWidth = meta.frameWidth / divider;
    const frameHeight = meta.frameHeight / divider;
    const cols = meta.layout?.cols ?? 1;
    const rows = meta.layout?.rows ?? 1;
    const frameCount = meta.frameCount ?? cols * rows;

    const frames: Texture[] = [];

    let index = 0;
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (index >= frameCount) break;

            const frameRect = new Rectangle(col * frameWidth, row * frameHeight, frameWidth, frameHeight);

            // ✅ Pixi v8: TextureOptions uses `source` + `frame`
            const tex = new Texture({ source, frame: frameRect });

            frames.push(tex);
            index++;
        }
    }

    return frames;
}

export type AmountProvider = (unitName: string) => number | undefined | null;

export type UnitChipOptions = {
    unitName: string;
    texture?: Texture;
    getAmount?: AmountProvider;
    banned?: boolean;
};

// The roster's neutral team colour — the same grey RenderableUnit falls back to for a unit that has no side
// yet, so an unplaced stack and a placed one differ only in colour, not in kind.
const ROSTER_FLAG_COLOR = 0xd0d0d0;

export class UnitChip extends Container {
    public readonly nameKey: string;
    private content: Container;
    private glow: Graphics;
    private aroundGlow: Graphics;
    private sprite: Sprite;
    private badgeCont: Container;
    private badgeFlag: Graphics;
    private badgeText: Text;
    private hovered = false;
    private selected = false;
    private forceBadgeVisible = false;
    private banned = false;
    private amountProvider?: AmountProvider;
    private lastIconSide = 0;
    private idleTexture: Texture;
    // Tween targets and state
    private targetScale = 1.0;
    private targetY = 0;
    private currentScale = 1.0;
    private currentY = 0;
    private tweenDuration = 250;
    private tweenStartTime = 0;
    private isTweening = false;
    private ticker?: Ticker;
    private animationFrames?: Texture[];
    private animationFrameIndex = 0;
    private animationStepFn?: () => void;
    private tweenStepFn?: () => void;
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

        // ⬇️ store idle texture
        this.idleTexture = opts.texture ?? Texture.EMPTY;

        this.sprite = new Sprite(this.idleTexture);
        this.sprite.anchor.set(0.5);

        this.badgeCont = new Container();
        // Drawn as the SAME banner a placed stack wears, only colourless: a creature picked from the roster
        // is already "a stack of N", it just has no team yet. A plain white disc made the roster read as a
        // different kind of object from the board, and the moment of placing it looked like a substitution
        // rather than the same thing gaining a side.
        this.badgeFlag = new Graphics();
        this.badgeText = new Text({
            text: "0",
            style: new TextStyle({ fill: 0x000000, fontSize: 14, fontWeight: "700" }),
        });
        this.badgeText.anchor.set(0.5);
        this.badgeCont.addChild(this.badgeFlag, this.badgeText);
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

        // 0.18, not the chip's old 0.22: the banner's width is derived from the label, so a larger glyph
        // stretched it and left the notch and the pole too small to read — it came out looking like a plain
        // rectangle. This is the board's ratio, so the roster flag now has the board flag's proportions.
        const fs = Math.max(10, Math.floor(iconSide * 0.18));
        this.badgeText.style = new TextStyle({ fill: 0x000000, fontSize: fs, fontWeight: "700" });
        this.badgeCont.position.set(iconSide * 0.35, -iconSide * 0.35);
        this.drawBadgeFlag(iconSide, fs);

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

        if (this.selected) {
            this.startAtlasAnimation();
        } else {
            this.stopAtlasAnimation();
        }

        // Only update glows/badge; don't touch scale/position
        this.updateHighlight();
    }
    private startAtlasAnimation(): void {
        if (!this.ticker) return;
        if (this.animationStepFn) return; // already running

        const config = getDefaultAnimationConfig(this.nameKey);
        if (!config) {
            // No atlas for this unit – keep idle texture
            this.sprite.texture = this.idleTexture;
            return;
        }

        const { meta, imageSrc, cacheKey, divider } = config;

        let frames = atlasFramesCache.get(cacheKey);
        if (!frames) {
            frames = buildAtlasFrames(meta, imageSrc, divider);
            atlasFramesCache.set(cacheKey, frames);
        }

        if (!frames.length) {
            this.sprite.texture = this.idleTexture;
            return;
        }

        this.animationFrames = frames;
        this.animationFrameIndex = 0;
        this.sprite.texture = frames[0];

        const frameCount = meta.frameCount ?? frames.length;

        // Match React semantics as closely as we can
        const fallbackTotalSec =
            typeof meta.totalDurationSec === "number" && Number.isFinite(meta.totalDurationSec)
                ? meta.totalDurationSec
                : frameCount / (meta.fps || 12);

        const baseTotalMs = fallbackTotalSec * 1000;
        const loopDurationMs = meta.loopDurationMs ?? Math.round(baseTotalMs * 0.8);
        const pauseMs = meta.pauseMs ?? Math.round(loopDurationMs * 0.4);
        const stepDuration = loopDurationMs / Math.max(1, frameCount - 1);

        let index = 0;
        let direction = 1; // 1 = forward, -1 = backward
        let inPause = false;
        let nextStepAt = performance.now() + stepDuration;

        const step = () => {
            const now = performance.now();

            if (inPause) {
                if (now >= nextStepAt) {
                    inPause = false;
                    direction *= -1;
                    nextStepAt = now + stepDuration;
                }
                return;
            }

            if (now < nextStepAt) return;

            nextStepAt = now + stepDuration;

            index += direction;

            // ping-pong and pause at edges
            if (index <= 0) {
                index = 0;
                inPause = true;
                nextStepAt = now + pauseMs;
            } else if (index >= frameCount - 1) {
                index = frameCount - 1;
                inPause = true;
                nextStepAt = now + pauseMs;
            }

            this.animationFrameIndex = index;
            const framesRef = this.animationFrames;
            if (framesRef && framesRef[index]) {
                this.sprite.texture = framesRef[index];
            }
        };

        this.animationStepFn = step;
        this.ticker.add(step);
    }
    public override destroy(options?: Parameters<Container["destroy"]>[0]): void {
        this.stopAtlasAnimation();
        if (this.tweenStepFn && this.ticker) {
            try {
                this.ticker.remove(this.tweenStepFn);
            } catch {
                // Pixi may already have torn down ticker internals during HMR/app destroy.
            }
        }
        this.tweenStepFn = undefined;
        this.isTweening = false;
        super.destroy(options);
    }
    private stopAtlasAnimation(): void {
        if (this.animationStepFn && this.ticker) {
            try {
                this.ticker.remove(this.animationStepFn);
            } catch {
                // Pixi may already have torn down ticker internals during HMR/app destroy.
            }
        }
        this.animationStepFn = undefined;
        this.animationFrames = undefined;
        this.animationFrameIndex = 0;

        // Restore static idle texture when not selected
        if (!this.sprite.destroyed) {
            this.sprite.texture = this.idleTexture;
        }
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
    public setForceBadgeVisible(v: boolean) {
        if (this.forceBadgeVisible === v) return;
        console.log(`UnitChip: setForceBadgeVisible [${this.nameKey}] ${v}`);
        this.forceBadgeVisible = v;
        this.updateHighlight();
    }
    private applyHoverVisuals() {
        const hoverActive = this.hovered;

        this.targetScale = hoverActive ? 1.2 : 1.0;
        this.targetY = hoverActive ? -Math.max(2, Math.floor(this.lastIconSide * 0.06)) : 0;

        this.startTween();
    }
    /**
     * The roster banner: the placed-stack flag, drawn in the neutral roster grey.
     *
     * Geometry is copied from RenderableUnit.updateBadge deliberately — same notch, same proportions, same
     * anchor — so a creature does not change shape when it lands on the board; it only gains its team colour.
     */
    private drawBadgeFlag(iconSide: number, fontSize: number) {
        const label = this.badgeText.text || "0";
        const flagHeight = Math.max(14, Math.floor(iconSide * 0.24));
        const flagWidth = Math.max(
            26,
            Math.floor(iconSide * 0.44),
            Math.ceil(label.length * fontSize * 0.62 + fontSize * 0.9),
        );
        const notchDepth = Math.max(4, Math.floor(flagWidth * 0.15));
        const left = -flagWidth * 0.82;
        const right = flagWidth * 0.18;
        const top = -flagHeight * 0.5;
        const bottom = flagHeight * 0.5;

        this.badgeFlag.clear();
        this.badgeFlag
            .moveTo(left, top)
            .lineTo(right, top)
            .lineTo(right - notchDepth, 0)
            .lineTo(right, bottom)
            .lineTo(left, bottom)
            .closePath()
            .fill({ color: ROSTER_FLAG_COLOR, alpha: 0.96 });
        this.badgeFlag
            .moveTo(left, top)
            .lineTo(right, top)
            .lineTo(right - notchDepth, 0)
            .lineTo(right, bottom)
            .lineTo(left, bottom)
            .closePath()
            .stroke({ width: 1.25, color: 0x000000, alpha: 0.58, join: "round" });
        // The pole, same as on the board.
        this.badgeFlag
            .moveTo(left, top - 2)
            .lineTo(left, bottom + 3)
            .stroke({ width: Math.max(1.5, iconSide * 0.024), color: 0x1b140f, alpha: 0.88, cap: "round" });

        // Centre the count on the CLOTH, not on the container's origin. The banner hangs almost entirely to
        // the left of that origin (left = -0.82w, right = +0.18w), so a text anchored at 0,0 sat out by the
        // notch instead of in the middle of the flag. Same expression the board badge uses, so a stack reads
        // identically in the roster and once it is placed.
        this.badgeText.position.set(left + (flagWidth - notchDepth) * 0.5, 0);
    }
    private updateHighlight() {
        const anyActive = this.hovered || this.selected;

        this.glow.visible = anyActive;
        this.aroundGlow.visible = anyActive;

        const amount = this.amountProvider?.(this.nameKey) ?? 0;
        if (this.badgeText.text !== String(amount)) {
            this.badgeText.text = String(amount);
            // The banner is sized to its label, so it has to be redrawn whenever the count changes.
            const fs = Math.max(10, Math.floor(this.lastIconSide * 0.18));
            this.drawBadgeFlag(this.lastIconSide, fs);
        }

        // Show badge if:
        // 1. Active (Hover/Select) AND amount > 0 (Standard behavior)
        // 2. Forced (Alt key) => Show even if inactive. Should we show if 0?
        //    Probably yes, to show "0 available".
        //    But typically chips with 0 might be hidden or disallowed?
        //    Let's align with user request "sees all the units amount".

        if (this.forceBadgeVisible) {
            this.badgeCont.visible = true;
        } else {
            this.badgeCont.visible = anyActive && amount > 0;
        }

        // Ensure badge is on top?
        this.badgeCont.zIndex = 10;
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
                // The chip's content may be destroyed while a tween is still queued on the
                // ticker — unhook and bail instead of touching a destroyed container.
                if (this.content.destroyed) {
                    this.isTweening = false;
                    this.ticker?.remove(step);
                    this.tweenStepFn = undefined;
                    return;
                }
                const elapsed = performance.now() - this.tweenStartTime;
                const progress = Math.min(1, elapsed / this.tweenDuration);
                const ease = this.easeInOutCubic(progress);

                this.content.scale.set(this.currentScale + (this.targetScale - this.currentScale) * ease);
                this.content.y = this.currentY + (this.targetY - this.currentY) * ease;

                if (progress >= 1) {
                    this.isTweening = false;
                    this.ticker?.remove(step);
                    this.tweenStepFn = undefined;
                }
            };
            this.tweenStepFn = step;
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
