import { Container, Sprite, Graphics, Text, TextStyle, Texture } from "pixi.js";
import { Unit, UnitProperties, HoCMath, GridSettings, GridMath } from "@heroesofcrypto/common";
import { TextureType, unitToTextureName } from "@/pixi/PixiUnitsFactory";

export type TexResolver = (name: string) => Texture | undefined;

interface SpawnAnimState {
    startScaleX: number;
    startScaleY: number;
    endScaleX: number;
    endScaleY: number;
    elapsed: number;
    duration: number;
}

/**
 * Unit + Pixi visualization (sprite, stack badge, spawn animation).
 * We never `new RenderableUnit` directly; instead we "upgrade"
 * an existing Unit via `RenderableUnit.fromBase`.
 */
export class RenderableUnit extends Unit {
    private texResolver!: TexResolver;
    private sprite?: Sprite;
    private shadow?: Sprite;
    private badgeContainer?: Container;
    private badgeCircle?: Graphics;
    private badgeText?: Text;
    private spawnAnim?: SpawnAnimState;
    /**
     * Attach rendering capabilities to an existing Unit instance.
     * (We rely on JS prototype + TS casting; Unit stays the core owner.)
     */
    public static fromBase(base: Unit, texResolver: TexResolver): RenderableUnit {
        Object.setPrototypeOf(base, RenderableUnit.prototype);
        const ru = base as RenderableUnit;
        ru.texResolver = texResolver;
        return ru;
    }
    /** Ensure sprite + badge exist and are laid out for the current unit state. */
    public ensureVisual(worldRoot: Container, gs: GridSettings): number | undefined {
        const props = this.getUnitProperties();
        const pos = this.getPosition();

        const texName = unitToTextureName(props.name, TextureType.SMALL, props.size);
        const tex = this.texResolver(texName);
        if (!tex) return;

        // --- sprite ---
        if (!this.sprite) {
            this.sprite = new Sprite(tex);
            this.sprite.anchor.set(0.5);
            this.sprite.scale.y = -1; // y-up world → flip in Pixi
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            this.sprite.zIndex = 120;
            worldRoot.addChild(this.sprite);
        } else {
            this.sprite.texture = tex;
            if (!this.sprite.parent) {
                worldRoot.addChild(this.sprite);
            }
        }

        const targetSize = props.size === 2 ? 256 : 128;
        const baseWidth = tex.width || 1;
        const scale = targetSize / baseWidth;

        this.sprite.scale.set(scale, -scale);
        this.sprite.x = pos.x;
        this.sprite.y = pos.y;
        this.sprite.visible = true;
        this.sprite.alpha = 1;
        this.sprite.tint = 0xffffff;

        // --- shadow ---
        if (!this.shadow) {
            // Use a simple sprite copy for the silhouette effect
            this.shadow = new Sprite(tex);
            this.shadow.anchor.set(0.5); // Center anchor matches sprite
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            this.shadow.zIndex = 110; // Below the unit
            worldRoot.addChild(this.shadow);

            // No blur filter for a crisp silhouette look
            this.shadow.filters = [];
        } else {
            this.shadow.texture = tex;
            if (!this.shadow.parent) {
                worldRoot.addChild(this.shadow);
            }
        }

        // Silhouette Logic:
        // 1. Exact scale as the unit (no flattening)
        this.shadow.scale.set(scale, -scale);

        // 2. Reset any skew/rotation from previous attempts
        this.shadow.skew.set(0, 0);
        this.shadow.rotation = 0;

        // 3. Shifted to the bottom right
        const shadowOffsetX = targetSize * 0.04; // Small shift to the right
        const shadowOffsetY = targetSize * 0.08; // Larger shift down
        this.shadow.x = pos.x + shadowOffsetX;
        this.shadow.y = pos.y + shadowOffsetY;

        this.shadow.visible = true;
        this.shadow.alpha = 0.35; // Reduced intensity (from 0.5 to 0.35)
        this.shadow.tint = 0x000000; // Black tint for the silhouette

        // --- badge ---
        this.ensureBadge(worldRoot, gs, props, pos);

        return scale;
    }
    /** Hide / show + refresh based on grid bounds. */
    public syncVisual(worldRoot: Container, gs: GridSettings): void {
        const pos = this.getPosition();
        const inGrid = GridMath.isPositionWithinGrid(gs, pos);

        if (!inGrid) {
            if (this.sprite) this.sprite.visible = false;
            if (this.shadow) this.shadow.visible = false;
            if (this.badgeContainer) this.badgeContainer.visible = false;
            return;
        }

        this.ensureVisual(worldRoot, gs);
    }
    /** Kick a small "pop-in" spawn animation for the sprite. */
    public startSpawnAnimation(scale: number): void {
        if (!this.sprite || !this.shadow) return;

        const endScaleX = scale;
        const endScaleY = -scale;
        const startScaleX = endScaleX * 1.3;
        const startScaleY = endScaleY * 1.3;

        this.sprite.scale.set(startScaleX, startScaleY);
        this.sprite.alpha = 0;

        // Shadow anim matches sprite exactly for silhouette effect
        this.shadow.scale.set(startScaleX, startScaleY);
        this.shadow.alpha = 0;

        this.spawnAnim = {
            startScaleX,
            startScaleY,
            endScaleX,
            endScaleY,
            elapsed: 0,
            duration: 0.25,
        };
    }
    /** Step spawn animation (call once per frame). */
    public stepSpawnAnimation(dt: number): void {
        if (!this.spawnAnim || !this.sprite || !this.shadow || !this.sprite.parent || !dt) return;

        const anim = this.spawnAnim;
        anim.elapsed += dt;

        const rawT = anim.elapsed / anim.duration;
        const t = rawT > 1 ? 1 : rawT;
        const u = 1 - t;
        const e = 1 - u * u * u; // easeOutCubic

        const sx = anim.startScaleX + (anim.endScaleX - anim.startScaleX) * e;
        const sy = anim.startScaleY + (anim.endScaleY - anim.startScaleY) * e;

        this.sprite.scale.set(sx, sy);
        this.sprite.alpha = e;

        // Animate shadow exactly with sprite
        this.shadow.scale.set(sx, sy);
        this.shadow.alpha = e * 0.35; // Target alpha is 0.35

        if (t >= 1) {
            this.sprite.scale.set(anim.endScaleX, anim.endScaleY);
            this.sprite.alpha = 1;

            this.shadow.scale.set(anim.endScaleX, anim.endScaleY);
            this.shadow.alpha = 0.35;

            this.spawnAnim = undefined;
        }
    }
    public destroyVisuals(): void {
        if (this.sprite) {
            this.sprite.removeFromParent();
            this.sprite = undefined;
        }
        if (this.shadow) {
            this.shadow.removeFromParent();
            this.shadow = undefined;
        }
        if (this.badgeContainer) {
            this.badgeContainer.removeFromParent();
            this.badgeContainer = undefined;
            this.badgeCircle = undefined;
            this.badgeText = undefined;
        }
        this.spawnAnim = undefined;
    }
    private ensureBadge(worldRoot: Container, gs: GridSettings, props: UnitProperties, pos: HoCMath.XY): void {
        if (!this.badgeContainer) {
            this.badgeContainer = new Container();
            this.badgeCircle = new Graphics();
            this.badgeText = new Text({
                text: "0",
                style: new TextStyle({
                    fill: 0x000000,
                    fontSize: 14,
                    fontWeight: "700",
                }),
            });
            this.badgeText.anchor.set(0.5);
            this.badgeText.scale.y = -1;

            this.badgeContainer.addChild(this.badgeCircle, this.badgeText);
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            this.badgeContainer.zIndex = 130;
            worldRoot.addChild(this.badgeContainer);
        }

        const iconSide = gs.getCellSize();
        const amount = this.getAmountAlive();

        const circle = this.badgeCircle!;
        const text = this.badgeText!;
        const container = this.badgeContainer!;

        // circle
        const br = Math.max(10, Math.floor(iconSide * 0.18));
        circle.clear().circle(0, 0, br).fill({ color: 0xffffff, alpha: 1 });

        // text
        const fs = Math.max(12, Math.floor(iconSide * 0.22));
        text.style = new TextStyle({
            fill: 0x000000,
            fontSize: fs,
            fontWeight: "700",
        });
        text.text = String(amount);

        // position top-right of stack (1×1 or 2×2)
        const w = iconSide * (props.size === 2 ? 2 : 1);
        const h = iconSide * (props.size === 2 ? 2 : 1);
        const margin = Math.max(4, Math.floor(iconSide * 0.12));
        const offsetX = w * 0.5 - margin;
        const offsetY = h * 0.5 - margin;

        container.x = pos.x + offsetX;
        container.y = pos.y + offsetY;
        container.visible = amount > 0;
    }
    protected refreshAbilitiesDescriptions(_synergyAbilityPowerIncrease: number): void {
        return;
    }
    private refreshAbiltyDescription(abilityName: string, abilityDescription: string): void {
        if (
            this.unitProperties.abilities.length === this.unitProperties.abilities_descriptions.length &&
            this.unitProperties.abilities.length === this.unitProperties.abilities_stack_powered.length &&
            this.unitProperties.abilities.length === this.unitProperties.abilities_auras.length
        ) {
            for (let i = 0; i < this.unitProperties.abilities.length; i++) {
                if (
                    this.unitProperties.abilities[i] === abilityName &&
                    (this.unitProperties.abilities_stack_powered[i] || abilityName === "Blind Fury")
                ) {
                    this.unitProperties.abilities_descriptions[i] = abilityDescription;
                }
            }
        }
    }
}
