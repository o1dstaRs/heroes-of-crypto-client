import { Container, Sprite, Graphics, Text, TextStyle, Texture, Rectangle } from "pixi.js";
import { Unit, UnitProperties, HoCMath, GridSettings, GridMath, TeamVals } from "@heroesofcrypto/common";
import { TextureType, unitToTextureName } from "@/pixi/PixiUnitsFactory";
import { animationAtlases, AnimationUnitName, AnimationStateName } from "../generated/animation_atlases";
import { images, type ImageKey } from "../generated/image_imports";
export type TexResolver = (name: string) => Texture | undefined;
// --- Atlas helpers (same logic as UnitChip) ---
type AtlasMeta = (typeof animationAtlases)[AnimationUnitName][AnimationStateName];
function normalizeUnitNameForAtlas(name?: string | null): AnimationUnitName | null {
    if (!name) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    if (trimmed in animationAtlases) return trimmed as AnimationUnitName;
    return null;
}
function atlasImageKeyFromUnitAndState(unitName: string, state: string, size: number): ImageKey | null {
    const base = unitName.toLowerCase().replace(/\s+/g, "_");
    const stateLower = state.toLowerCase();
    // same `_atlas_quarter` suffix you already use on UnitChip
    const key = (size === 2 ? `${base}_${stateLower}_atlas_half` : `${base}_${stateLower}_atlas_quarter`) as ImageKey;
    if (key in images) return key;
    if (process.env.NODE_ENV === "development") {
        console.warn(`[atlas] Missing atlas image for unit "${unitName}", state "${state}". Expected key: ${key}`);
    }
    return null;
}
function getDefaultAnimationConfig(
    unitName: string,
    size: number,
): { meta: AtlasMeta; imageSrc: string; cacheKey: string } | null {
    const normalized = normalizeUnitNameForAtlas(unitName);
    if (!normalized) return null;
    const unitStates = animationAtlases[normalized];
    const stateNames = Object.keys(unitStates) as AnimationStateName[];
    if (!stateNames.length) return null;
    const preferredState = (stateNames as string[]).includes("default")
        ? ("default" as AnimationStateName)
        : stateNames[0];
    const meta = unitStates[preferredState];
    const imageKey = atlasImageKeyFromUnitAndState(normalized, preferredState, size);
    if (!imageKey) return null;
    const imageSrc = images[imageKey];
    if (!imageSrc) return null;
    const cacheKey = `${normalized}::${preferredState}`;
    return { meta, imageSrc, cacheKey };
}
// Cache textures per atlas to avoid rebuilding frames
const atlasFramesCache = new Map<string, Texture[]>();
function buildAtlasFrames(meta: AtlasMeta, imageSrc: string, size: number): Texture[] {
    const parentTexture = Texture.from(imageSrc);
    const source = parentTexture.source; // v8-friendly
    // quarter-sized frames (same trick you used for chips)
    const divider = size === 2 ? 2 : 4;
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
            const tex = new Texture({ source, frame: frameRect });
            frames.push(tex);
            index++;
        }
    }
    return frames;
}
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
    private stackPowerContainer?: Container;
    private stackPowerPips: Graphics[] = [];
    private spawnAnim?: SpawnAnimState;
    private boardSelected = false;
    private selectionAnimFrames?: Texture[];
    private selectionAnimFrameIndex = 0;
    private selectionAnimDirection: 1 | -1 = 1;
    private selectionAnimInPause = false;
    private selectionAnimStepMs = 0;
    private selectionAnimPauseMs = 0;
    private selectionAnimNextStepAtMs = 0;
    private stackForcedHidden = false;
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
        const baseTex = this.texResolver(texName);
        if (!baseTex) return;
        // --- sprite ---
        if (!this.sprite) {
            // first time: use base texture
            this.sprite = new Sprite(baseTex);
            this.sprite.anchor.set(0.5);
            this.sprite.scale.y = -1; // y-up world → flip in Pixi
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            this.sprite.zIndex = 120;
            worldRoot.addChild(this.sprite);
        } else {
            // ⬇️ IMPORTANT: only force base texture if NOT in selection animation
            const selectionActive = this.boardSelected && !!this.selectionAnimFrames?.length;
            if (!selectionActive) {
                this.sprite.texture = baseTex;
            }
            if (!this.sprite.parent) {
                worldRoot.addChild(this.sprite);
            }
        }
        const targetSize = props.size === 2 ? 256 : 128;
        // --- 🔴 FIX ---
        // Calculate scale based on the ACTUAL texture currently on the sprite.
        const currentTexture = this.sprite.texture;
        // Check if currentTexture exists and has a meaningful width ( > 1 )
        const currentWidth = currentTexture && currentTexture.width > 1 ? currentTexture.width : baseTex.width || 1;
        const scale = targetSize / currentWidth;
        // ------------------
        this.sprite.scale.set(scale, -scale);
        this.sprite.x = pos.x;
        this.sprite.y = pos.y;
        this.sprite.visible = true;
        this.sprite.alpha = 1;
        // keep tint white; selection uses atlas frames, not tinting
        this.sprite.tint = 0xffffff;
        // --- shadow (can safely follow base texture, selection is only the main sprite) ---
        if (!this.shadow) {
            this.shadow = new Sprite(baseTex);
            this.shadow.anchor.set(0.5);
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            this.shadow.zIndex = 110;
            worldRoot.addChild(this.shadow);
            this.shadow.filters = [];
        } else {
            this.shadow.texture = baseTex;
            if (!this.shadow.parent) {
                worldRoot.addChild(this.shadow);
            }
        }
        // Silhouette positioning same as before
        this.shadow.scale.set(scale, -scale);
        const shadowOffsetX = targetSize * 0.04;
        const shadowOffsetY = targetSize * 0.08;
        this.shadow.x = pos.x + shadowOffsetX;
        this.shadow.y = pos.y + shadowOffsetY;
        this.shadow.visible = true;
        this.shadow.alpha = 0.35;
        this.shadow.tint = 0x000000;
        // --- badge ---
        this.ensureBadge(worldRoot, gs, props, pos);
        // --- stack power indicator ---
        this.ensureStackPowerIndicator(worldRoot, gs, props, pos);
        return scale;
    }
    public setSpriteRotation(rotation: number) {
        if (this.sprite) {
            this.sprite.rotation = rotation;
        }
    }
    public applyMoveEffect(spawnPulsePhase: number): void {
        const sprite = this.sprite;
        if (!sprite) return;
        const swaySpeed = 15;
        const wave = Math.sin(spawnPulsePhase * swaySpeed);
        // 1. Tilt/Sway (Rotation)
        const rotationAmplitude = 0.08; // Radians
        sprite.rotation = wave * rotationAmplitude;
        // 2. Lift/Bob (Scale)
        // We want a positive bounce for every step
        const bounce = Math.abs(wave);
        const liftAmplitude = 0.05; // 5% scale up at peak
        // syncVisual sets the base scale every frame before this is called
        const scaleX = sprite.scale.x;
        const scaleY = sprite.scale.y;
        const lift = 1.0 + bounce * liftAmplitude;
        sprite.scale.set(scaleX * lift, scaleY * lift);
    }
    public syncVisual(worldRoot: Container, gs: GridSettings): void {
        const pos = this.getPosition();
        const inGrid = GridMath.isPositionWithinGrid(gs, pos);
        if (!inGrid) {
            if (this.sprite) this.sprite.visible = false;
            if (this.shadow) this.shadow.visible = false;
            if (this.badgeContainer) this.badgeContainer.visible = false;
            if (this.stackPowerContainer) this.stackPowerContainer.visible = false;
            return;
        }
        this.ensureVisual(worldRoot, gs);
    }
    public setBoardSelected(selected: boolean): void {
        if (this.boardSelected === selected) return;
        this.boardSelected = selected;
        if (selected) {
            this.startSelectionAnimationInternal();
        } else {
            this.stopSelectionAnimationInternal();
        }
    }
    private startSelectionAnimationInternal(): void {
        if (!this.sprite) return;
        const props = this.getUnitProperties();
        const config = getDefaultAnimationConfig(props.name, props.size);
        if (!config) return;
        const { meta, imageSrc, cacheKey } = config;
        let frames = atlasFramesCache.get(cacheKey);
        if (!frames) {
            frames = buildAtlasFrames(meta, imageSrc, props.size);
            atlasFramesCache.set(cacheKey, frames);
        }
        if (!frames.length) return;
        this.selectionAnimFrames = frames;
        this.selectionAnimFrameIndex = 0;
        this.selectionAnimDirection = 1;
        this.selectionAnimInPause = false;
        const frameCount = meta.frameCount ?? frames.length;
        const fallbackTotalSec =
            typeof meta.totalDurationSec === "number" && Number.isFinite(meta.totalDurationSec)
                ? meta.totalDurationSec
                : frameCount / (meta.fps || 12);
        const baseTotalMs = fallbackTotalSec * 1000;
        const loopDurationMs = meta.loopDurationMs ?? Math.round(baseTotalMs * 0.8);
        const pauseMs = meta.pauseMs ?? Math.round(loopDurationMs * 0.4);
        this.selectionAnimStepMs = loopDurationMs / Math.max(1, frameCount - 1);
        this.selectionAnimPauseMs = pauseMs;
        // start timing like UnitChip’s ticker version
        const now = performance.now();
        this.selectionAnimNextStepAtMs = now + this.selectionAnimStepMs;
        // show first frame
        this.sprite.texture = frames[0];
    }
    public stepSelectionAnimation(): void {
        if (!this.boardSelected) return;
        if (!this.selectionAnimFrames || !this.sprite) return;
        const frames = this.selectionAnimFrames;
        const frameCount = frames.length;
        if (frameCount <= 1) return;
        const now = performance.now();
        if (now < this.selectionAnimNextStepAtMs) return;
        if (this.selectionAnimInPause) {
            // end of pause → flip direction and resume stepping
            this.selectionAnimInPause = false;
            this.selectionAnimDirection = (this.selectionAnimDirection * -1) as 1 | -1;
            this.selectionAnimNextStepAtMs = now + this.selectionAnimStepMs;
            return;
        }
        this.selectionAnimNextStepAtMs = now + this.selectionAnimStepMs;
        let index = this.selectionAnimFrameIndex + this.selectionAnimDirection;
        const last = frameCount - 1;
        if (index <= 0) {
            index = 0;
            this.selectionAnimInPause = true;
            this.selectionAnimNextStepAtMs = now + this.selectionAnimPauseMs;
        } else if (index >= last) {
            index = last;
            this.selectionAnimInPause = true;
            this.selectionAnimNextStepAtMs = now + this.selectionAnimPauseMs;
        }
        this.selectionAnimFrameIndex = index;
        const tex = frames[index];
        if (tex) this.sprite.texture = tex;
    }
    public stepSpawnAnimation(dt: number): void {
        // --- Spawn animation ---
        if (this.spawnAnim && this.sprite && this.shadow && this.sprite.parent && dt) {
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
            this.shadow.scale.set(sx, sy);
            this.shadow.alpha = e * 0.35;
            if (t >= 1) {
                this.sprite.scale.set(anim.endScaleX, anim.endScaleY);
                this.sprite.alpha = 1;
                this.shadow.scale.set(anim.endScaleX, anim.endScaleY);
                this.shadow.alpha = 0.35;
                this.spawnAnim = undefined;
            }
        }
        // --- Board selection animation (always tick; wall clock inside) ---
        this.stepSelectionAnimation();
    }
    private stopSelectionAnimationInternal(): void {
        this.selectionAnimFrames = undefined;
        this.selectionAnimFrameIndex = 0;
        this.selectionAnimDirection = 1;
        this.selectionAnimInPause = false;
        this.selectionAnimStepMs = 0;
        this.selectionAnimPauseMs = 0;
        this.selectionAnimNextStepAtMs = 0;
        // restore original small board texture
        if (this.sprite) {
            const props = this.getUnitProperties();
            const texName = unitToTextureName(props.name, TextureType.SMALL, props.size);
            const tex = this.texResolver(texName);
            if (tex) this.sprite.texture = tex;
        }
    }
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
    /**
     * Returns the geometric center of the unit's footprint in world coordinates.
     * For 1x1 units: Same as position (center of tile).
     * For 2x2 units: Center of the 2x2 block.
     */
    public getVisualCenter(gs: GridSettings): HoCMath.XY {
        const pos = this.getPosition();
        const size = this.getSize();
        if (size > 1) {
            const offset = (size - 1) * 0.5 * gs.getCellSize();
            return { x: pos.x + offset, y: pos.y + offset };
        }
        return pos;
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
        if (this.stackPowerContainer) {
            this.stackPowerContainer.removeFromParent();
            this.stackPowerContainer = undefined;
            this.stackPowerPips = [];
        }
        this.spawnAnim = undefined;
        // ⬇️ NEW
        this.boardSelected = false;
        this.selectionAnimFrames = undefined;
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
    private ensureStackPowerIndicator(
        worldRoot: Container,
        gs: GridSettings,
        props: UnitProperties,
        pos: HoCMath.XY,
    ): void {
        const power = this.getStackPower();

        // Hide if 0 (or remove this check if you want to see the empty bar always)
        if (power <= 0) {
            if (this.stackPowerContainer) {
                this.stackPowerContainer.visible = false;
            }
            return;
        }

        // 1. Create Container if needed
        if (!this.stackPowerContainer) {
            this.stackPowerContainer = new Container();
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            this.stackPowerContainer.zIndex = 130;
            worldRoot.addChild(this.stackPowerContainer);

            this.stackPowerPips = [];
            for (let i = 0; i < 5; i++) {
                const pip = new Graphics();
                this.stackPowerPips.push(pip);
                this.stackPowerContainer.addChild(pip);
            }
        }

        // 2. Geometry & Style Configuration
        const unitSizeInCells = props.size === 2 ? 2 : 1;
        const cellSize = gs.getCellSize();

        // Bar dimensions
        const totalBarWidth = cellSize * unitSizeInCells * 0.85; // 85% of total unit width
        const barHeight = Math.max(6, cellSize * 0.12); // Thick enough to be visible
        const gap = Math.max(2, totalBarWidth * 0.02); // Gap between segments

        // Calculate single segment width
        // Formula: (TotalWidth - (All Gaps)) / Count
        const segmentWidth = (totalBarWidth - 4 * gap) / 5;
        const cornerRadius = 3;

        // Colors
        const teamColor = props.team === TeamVals.LOWER ? 0x00ff00 : 0xff0000;
        const emptyColor = 0x222222; // Dark grey for empty slots
        const borderColor = 0x000000;

        // 3. Positioning
        // Calculate offset to center the bar horizontally
        const startX = -totalBarWidth / 2;

        // Vertical Position:
        // Assuming your Badge (Top Right) logic used positive Y offset.
        // We want this at the BOTTOM.
        // We calculate the unit's visual half-height and subtract the bar height + padding.
        const unitHalfHeight = (cellSize * unitSizeInCells) / 2;
        const bottomPadding = barHeight * 0.5;
        const offsetY = -unitHalfHeight + bottomPadding;

        this.stackPowerContainer.x = pos.x;
        this.stackPowerContainer.y = pos.y + offsetY;

        // 4. Draw Segments
        for (let i = 0; i < 5; i++) {
            const pip = this.stackPowerPips[i];
            const segX = startX + i * (segmentWidth + gap);

            pip.clear();

            // Draw background/fill
            if (i < power) {
                // Active Stack
                pip.roundRect(0, 0, segmentWidth, barHeight, cornerRadius);
                pip.fill({ color: teamColor, alpha: 1 });
                // Add a bright border to active cells to make them pop
                pip.stroke({ width: 1.5, color: borderColor, alpha: 0.8 });
            } else {
                // Empty Slot (Background)
                pip.roundRect(0, 0, segmentWidth, barHeight, cornerRadius);
                pip.fill({ color: emptyColor, alpha: 0.6 });
                pip.stroke({ width: 1, color: borderColor, alpha: 0.4 });
            }

            pip.x = segX;
            pip.y = 0;
        }

        this.stackPowerContainer.visible = !this.stackForcedHidden;
    }
    protected override refreshAbilitiesDescriptions(_synergyAbilityPowerIncrease: number): void {
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
    public setStackVisibility(visible: boolean): void {
        this.stackForcedHidden = !visible;
        if (this.stackPowerContainer) {
            this.stackPowerContainer.visible = visible && this.getStackPower() > 0;
            // Also force alpha update if we are toggling back on
            if (visible) this.stackPowerContainer.alpha = 1;
        }
    }
}
