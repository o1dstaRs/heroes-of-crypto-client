import { Container, Sprite, Graphics, Text, TextStyle, Texture, Rectangle } from "pixi.js";
import { Unit, UnitProperties, HoCMath, GridSettings, GridMath, TeamVals, HoCConstants } from "@heroesofcrypto/common";
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

interface OneShotAnimState {
    frames: Texture[];
    frameIndex: number;
    elapsed: number;
    durationPerFrame: number;
    onComplete?: () => void;
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
    private isActiveTurn = false;
    private isDestroyed = false;
    private visualMode: "normal" | "hidden" | "ghost" = "normal";
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
        if (this.isDestroyed) return;
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
        const currentTexture = this.sprite.texture;
        const currentWidth = currentTexture && currentTexture.width > 1 ? currentTexture.width : baseTex.width || 1;
        const scale = targetSize / currentWidth;
        this.sprite.scale.set(scale, -scale);
        this.sprite.x = pos.x;
        this.sprite.y = pos.y;
        this.sprite.visible = this.visualMode !== "hidden";
        this.sprite.alpha = this.visualMode === "ghost" ? 0.25 : 1;
        this.sprite.tint = 0xffffff;
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
        this.shadow.visible = this.visualMode !== "hidden";
        this.shadow.alpha = this.visualMode === "ghost" ? 0.1 : 0.35;
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
    public getCurrentVisualScale(): number {
        return this.sprite ? Math.abs(this.sprite.scale.x) : 1;
    }
    public setVisualVisible(visible: boolean): void {
        this.visualMode = visible ? "normal" : "hidden";
        if (this.sprite) this.sprite.visible = visible;
        if (this.shadow) this.shadow.visible = visible;
        if (this.badgeContainer) this.badgeContainer.visible = visible;
        if (this.stackPowerContainer) this.stackPowerContainer.visible = visible;
    }
    public setVisualGhost(active: boolean): void {
        this.visualMode = active ? "ghost" : "normal";
        const visible = active || this.visualMode === "normal";
        const alpha = active ? 0.25 : 1;

        if (this.sprite) {
            this.sprite.visible = visible;
            this.sprite.alpha = alpha;
        }
        if (this.shadow) {
            this.shadow.visible = visible;
            this.shadow.alpha = active ? 0.1 : 0.35;
        }
        // Hide badges in ghost mode
        if (this.badgeContainer) this.badgeContainer.visible = !active && visible;
        if (this.stackPowerContainer) this.stackPowerContainer.visible = !active && visible;
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
        if (this.isDestroyed) return;
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
        // --- One Shot animation ---
        this.stepOneShotAnimation(dt * 1000);
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
    public getVisualCenter(_gs: GridSettings): HoCMath.XY {
        return this.getPosition();
    }
    private oneShotAnim?: OneShotAnimState;
    /**
     * Plays a one-shot animation sequence (like 'death', 'attack', 'hit')
     * @param stateName The animation state name (e.g. "death", "attack")
     * @param onComplete Callback when animation finishes
     */
    public playOneShotAnimation(stateName: string, onComplete?: () => void): void {
        const props = this.getUnitProperties();
        const config = getDefaultAnimationConfig(props.name, props.size);
        // If config/atlas not found, just fire callback immediately
        if (!config || !this.sprite) {
            if (onComplete) onComplete();
            return;
        }

        // We override the state name to the requested one (e.g. "death") to find the right frames
        // But getDefaultAnimationConfig only returns the preferred/default state metadata.
        // We need to fetch specific state metadata.

        const normalized = normalizeUnitNameForAtlas(props.name);
        if (!normalized) {
            if (onComplete) onComplete();
            return;
        }

        const unitStates = animationAtlases[normalized];
        // @ts-ignore: string vs AnimationStateName
        const targetState = unitStates[stateName] ? stateName : null;

        if (!targetState) {
            console.warn(`[RenderableUnit] Animation state '${stateName}' not found for ${props.name}`);
            if (onComplete) onComplete();
            return;
        }

        // @ts-ignore: generic string key access to strictly typed map
        const targetMeta = unitStates[targetState] as AtlasMeta;

        // We need the cache key for THIS specific state
        const targetCacheKey = `${normalized}::${targetState}`;
        const targetImageKey = atlasImageKeyFromUnitAndState(normalized, targetState, props.size);

        // If we can't find image for this state, fallback
        if (!targetImageKey || !images[targetImageKey]) {
            console.warn(`[RenderableUnit] Missing image for state '${stateName}'`);
            if (onComplete) onComplete();
            return;
        }

        const targetImageSrc = images[targetImageKey];

        let frames = atlasFramesCache.get(targetCacheKey);
        if (!frames) {
            frames = buildAtlasFrames(targetMeta, targetImageSrc, props.size);
            atlasFramesCache.set(targetCacheKey, frames);
        }

        this.oneShotAnim = {
            frames,
            frameIndex: 0,
            elapsed: 0,
            durationPerFrame: (targetMeta.loopDurationMs || 1000) / (targetMeta.frameCount || frames.length),
            onComplete,
        };

        // Set first frame immediately
        this.sprite.texture = frames[0];
    }
    public stepOneShotAnimation(dtMs: number): void {
        if (!this.oneShotAnim || !this.sprite) return;

        const anim = this.oneShotAnim;
        anim.elapsed += dtMs;

        if (anim.elapsed >= anim.durationPerFrame) {
            const framesToAdvance = Math.floor(anim.elapsed / anim.durationPerFrame);
            anim.elapsed %= anim.durationPerFrame;

            anim.frameIndex += framesToAdvance;

            if (anim.frameIndex >= anim.frames.length) {
                // Animation Finished
                const callback = anim.onComplete;
                this.oneShotAnim = undefined;
                if (callback) callback();
            } else {
                this.sprite.texture = anim.frames[anim.frameIndex];
            }
        }
    }
    public destroyVisuals(): void {
        console.log(`RenderableUnit: destroyVisuals id=${this.getId()} sprite=${!!this.sprite}`);
        this.isDestroyed = true;

        if (this.sprite) {
            this.sprite.destroy();
            this.sprite = undefined;
        }
        if (this.shadow) {
            this.shadow.destroy();
            this.shadow = undefined;
        }
        if (this.badgeContainer) {
            this.badgeContainer.destroy({ children: true });
            this.badgeContainer = undefined;
            this.badgeCircle = undefined;
            this.badgeText = undefined;
        }
        if (this.stackPowerContainer) {
            this.stackPowerContainer.destroy({ children: true });
            this.stackPowerContainer.removeFromParent();
            this.stackPowerContainer = undefined;
            this.stackPowerPips = [];
        }
        this.spawnAnim = undefined;
        this.oneShotAnim = undefined;
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
        const badgeColor = this.isActiveTurn ? 0xffaa00 : 0xffffff; // Orange if active, White otherwise
        circle.clear().circle(0, 0, br).fill({ color: badgeColor, alpha: 1 });
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

        // Active Turn Highlight (Orange Ring)
        // Clear previous ring if any (it might be drawn on circle or container)
        // Let's draw it on the `circle` graphics instance, expanding outwards.
        if (this.isActiveTurn) {
            const ringColor = 0xffaa00; // Orange
            const ringWidth = 2; // Thinner
            // Draw ring around the circle
            circle.stroke({ width: ringWidth, color: ringColor, alpha: 1 });
        } else {
            // Default Black Border
            circle.stroke({ width: 1.5, color: 0x000000, alpha: 0.5 });
        }
    }
    public setActiveTurn(active: boolean): void {
        if (this.isActiveTurn === active) return;
        this.isActiveTurn = active;
        // Force immediate visual update to ensure ring appears/disappears instantly
        // This requires accessing internal sprite logic or just relying on the next syncVisual.
        // To be safe, we can try to mark it dirty if possible, but unit.ts doesn't have a dirty flag for visuals.
        // However, ensuresBadge is called every syncVisual (every frame).
        // If the ring is not disappearing, it's possible ensureBadge logic specifically for clearing isn't working?
        // Ah, ensuring circle.clear() at the top of ensureBadge effectively clears it.
        // But we must assume syncVisual IS called.
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
        // Heavy Armor
        const heavyArmorAbility = this.getAbility("Heavy Armor");
        if (heavyArmorAbility) {
            const percentage = Number(
                (
                    ((heavyArmorAbility.getPower() + this.getLuck() + _synergyAbilityPowerIncrease) /
                        100 /
                        HoCConstants.MAX_UNIT_STACK_POWER) *
                    this.getStackPower() *
                    100
                ).toFixed(2),
            );
            this.refreshAbiltyDescription(
                heavyArmorAbility.getName(),
                heavyArmorAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Lightning Spin
        const lightningSpinAbility = this.getAbility("Lightning Spin");
        if (lightningSpinAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(lightningSpinAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                lightningSpinAbility.getName(),
                lightningSpinAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Fire Breath
        const fireBreathAbility = this.getAbility("Fire Breath");
        if (fireBreathAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(fireBreathAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                fireBreathAbility.getName(),
                fireBreathAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Skewer Strike
        const skewerStrikeAbility = this.getAbility("Skewer Strike");
        if (skewerStrikeAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(skewerStrikeAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                skewerStrikeAbility.getName(),
                skewerStrikeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Fire Shield
        const fireShieldAbility = this.getAbility("Fire Shield");
        if (fireShieldAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(fireShieldAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                fireShieldAbility.getName(),
                fireShieldAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Backstab
        const backstabAbility = this.getAbility("Backstab");
        if (backstabAbility) {
            const percentage =
                Number(
                    (this.calculateAbilityMultiplier(backstabAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
                ) - 100;
            this.refreshAbiltyDescription(
                backstabAbility.getName(),
                backstabAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Stun
        const stunAbility = this.getAbility("Stun");
        if (stunAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(stunAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                stunAbility.getName(),
                stunAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Double Punch
        const doublePunchAbility = this.getAbility("Double Punch");
        if (doublePunchAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(doublePunchAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                doublePunchAbility.getName(),
                doublePunchAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Piercing Spear
        const piercingSpearAbility = this.getAbility("Piercing Spear");
        if (piercingSpearAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(piercingSpearAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                piercingSpearAbility.getName(),
                piercingSpearAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Boost Health
        const boostHealthAbility = this.getAbility("Boost Health");
        if (boostHealthAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(boostHealthAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                boostHealthAbility.getName(),
                boostHealthAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Double Shot
        const doubleShotAbility = this.getAbility("Double Shot");
        if (doubleShotAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(doubleShotAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                doubleShotAbility.getName(),
                doubleShotAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Blindness
        const blindnessAbility = this.getAbility("Blindness");
        if (blindnessAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(blindnessAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                blindnessAbility.getName(),
                blindnessAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Sharpened Weapons Aura
        const sharpenedWeaponsAuraAbility = this.getAbility("Sharpened Weapons Aura");
        if (sharpenedWeaponsAuraAbility) {
            const percentage = Number(
                (
                    this.calculateAbilityMultiplier(sharpenedWeaponsAuraAbility, _synergyAbilityPowerIncrease) * 100 -
                    100
                ).toFixed(2),
            );
            this.refreshAbiltyDescription(
                sharpenedWeaponsAuraAbility.getName(),
                sharpenedWeaponsAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // War Anger Aura
        const warAngerAuraAbility = this.getAbility("War Anger Aura");
        if (warAngerAuraAbility) {
            const percentage =
                Number(
                    (this.calculateAbilityMultiplier(warAngerAuraAbility, _synergyAbilityPowerIncrease) * 100).toFixed(
                        2,
                    ),
                ) - 100;
            this.refreshAbiltyDescription(
                warAngerAuraAbility.getName(),
                warAngerAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Arrows Wingshield Aura
        const arrowsWingshieldAuraAbility = this.getAbility("Arrows Wingshield Aura");
        if (arrowsWingshieldAuraAbility) {
            const percentage =
                Number(
                    (
                        this.calculateAbilityMultiplier(arrowsWingshieldAuraAbility, _synergyAbilityPowerIncrease) * 100
                    ).toFixed(2),
                ) - 100;
            this.refreshAbiltyDescription(
                arrowsWingshieldAuraAbility.getName(),
                arrowsWingshieldAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Limited Supply
        const limitedSupplyAbility = this.getAbility("Limited Supply");
        if (limitedSupplyAbility) {
            const percentage = Number(
                ((this.getStackPower() / HoCConstants.MAX_UNIT_STACK_POWER) * limitedSupplyAbility.getPower()).toFixed(
                    2,
                ),
            );
            this.refreshAbiltyDescription(
                limitedSupplyAbility.getName(),
                limitedSupplyAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Boar Saliva
        const boarSalivaAbility = this.getAbility("Boar Saliva");
        if (boarSalivaAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(boarSalivaAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                boarSalivaAbility.getName(),
                boarSalivaAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Aggr
        const aggrAbility = this.getAbility("Aggr");
        if (aggrAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(aggrAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                aggrAbility.getName(),
                aggrAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Wardguard
        const wardguardAbility = this.getAbility("Wardguard");
        if (wardguardAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(wardguardAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                wardguardAbility.getName(),
                wardguardAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Magic Shield
        const magicShieldAbility = this.getAbility("Magic Shield");
        if (magicShieldAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(magicShieldAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                magicShieldAbility.getName(),
                magicShieldAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Dodge
        const dodgeAbility = this.getAbility("Dodge");
        if (dodgeAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(dodgeAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                dodgeAbility.getName(),
                dodgeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Small Specie
        const smallSpecieAbility = this.getAbility("Small Specie");
        if (smallSpecieAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(smallSpecieAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                smallSpecieAbility.getName(),
                smallSpecieAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Absorb Penalties Aura
        const absorbPenaltiesAuraAbility = this.getAbility("Absorb Penalties Aura");
        if (absorbPenaltiesAuraAbility) {
            const percentage = Number(
                (
                    this.calculateAbilityMultiplier(absorbPenaltiesAuraAbility, _synergyAbilityPowerIncrease) * 100
                ).toFixed(2),
            );
            this.refreshAbiltyDescription(
                absorbPenaltiesAuraAbility.getName(),
                absorbPenaltiesAuraAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Petrifying Gaze
        const petrifyingGazeAbility = this.getAbility("Petrifying Gaze");
        if (petrifyingGazeAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(petrifyingGazeAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                petrifyingGazeAbility.getName(),
                petrifyingGazeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Spit Ball
        const spitBallAbility = this.getAbility("Spit Ball");
        if (spitBallAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(spitBallAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                spitBallAbility.getName(),
                spitBallAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Large Caliber
        const largeCaliberAbility = this.getAbility("Large Caliber");
        if (largeCaliberAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(largeCaliberAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                largeCaliberAbility.getName(),
                largeCaliberAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Area Throw
        const areaThrowAbility = this.getAbility("Area Throw");
        if (areaThrowAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(areaThrowAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                areaThrowAbility.getName(),
                areaThrowAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Through Shot
        const throughShotAbility = this.getAbility("Through Shot");
        if (throughShotAbility) {
            const percentage = Number(
                (this.calculateAbilityMultiplier(throughShotAbility, _synergyAbilityPowerIncrease) * 100).toFixed(2),
            );
            this.refreshAbiltyDescription(
                throughShotAbility.getName(),
                throughShotAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Sky Runner
        const skyRunnerAbility = this.getAbility("Sky Runner");
        if (skyRunnerAbility) {
            this.refreshAbiltyDescription(
                skyRunnerAbility.getName(),
                skyRunnerAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        this.calculateAbilityCount(skyRunnerAbility, _synergyAbilityPowerIncrease).toString(),
                    ),
            );
        }

        // Lucky Strike
        const luckyStrikeAbility = this.getAbility("Lucky Strike");
        if (luckyStrikeAbility) {
            const percentage =
                Number(
                    (this.calculateAbilityMultiplier(luckyStrikeAbility, _synergyAbilityPowerIncrease) * 100).toFixed(
                        2,
                    ),
                ) - 100;
            this.refreshAbiltyDescription(
                luckyStrikeAbility.getName(),
                luckyStrikeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Shatter Armor
        const shatterArmorAbility = this.getAbility("Shatter Armor");
        if (shatterArmorAbility) {
            this.refreshAbiltyDescription(
                shatterArmorAbility.getName(),
                shatterArmorAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        this.calculateAbilityCount(shatterArmorAbility, _synergyAbilityPowerIncrease).toString(),
                    ),
            );
        }

        // Rapid Charge
        const rapidChargeAbility = this.getAbility("Rapid Charge");
        if (rapidChargeAbility) {
            const percentage =
                Number(
                    (this.calculateAbilityMultiplier(rapidChargeAbility, _synergyAbilityPowerIncrease) * 100).toFixed(
                        2,
                    ),
                ) - 100;
            this.refreshAbiltyDescription(
                rapidChargeAbility.getName(),
                rapidChargeAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Wolf Trail Aura
        const wolfTrailAuraEffect = this.getAuraEffect("Wolf Trail");
        if (wolfTrailAuraEffect) {
            const auraEffect = this.effectFactory.makeAuraEffect("Wolf Trail");
            if (auraEffect) {
                this.refreshAbiltyDescription(
                    "Wolf Trail Aura",
                    wolfTrailAuraEffect
                        .getDesc()
                        .replace(/\{\}/g, this.calculateAuraPower(auraEffect, _synergyAbilityPowerIncrease).toString()),
                );
            }
        }

        // Penetrating Bite
        const penetratingBiteAbility = this.getAbility("Penetrating Bite");
        if (penetratingBiteAbility) {
            const percentage =
                Number(
                    (
                        this.calculateAbilityMultiplier(penetratingBiteAbility, _synergyAbilityPowerIncrease) * 100
                    ).toFixed(2),
                ) - 100;
            this.refreshAbiltyDescription(
                penetratingBiteAbility.getName(),
                penetratingBiteAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Pegasus Light
        const pegasusLightAbility = this.getAbility("Pegasus Light");
        if (pegasusLightAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(pegasusLightAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                pegasusLightAbility.getName(),
                pegasusLightAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }

        // Paralysis
        const paralysisAbility = this.getAbility("Paralysis");
        if (paralysisAbility) {
            const description = paralysisAbility.getDesc().join("\n");
            const reduction = this.calculateAbilityApplyChance(paralysisAbility, _synergyAbilityPowerIncrease);
            const chance = Math.min(100, reduction * 2);
            const updatedDescription = description
                .replace("{}", Number(chance.toFixed(2)).toString())
                .replace("{}", Number(reduction.toFixed(2)).toString());
            this.refreshAbiltyDescription(paralysisAbility.getName(), updatedDescription);
        }

        // Deep Wounds Level 1
        const deepWoundsLevel1Ability = this.getAbility("Deep Wounds Level 1");
        if (deepWoundsLevel1Ability) {
            this.refreshAbiltyDescription(
                deepWoundsLevel1Ability.getName(),
                deepWoundsLevel1Ability
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        this.calculateAbilityCount(deepWoundsLevel1Ability, _synergyAbilityPowerIncrease).toString(),
                    ),
            );
        }

        // Deep Wounds Level 2
        const deepWoundsLevel2Ability = this.getAbility("Deep Wounds Level 2");
        if (deepWoundsLevel2Ability) {
            this.refreshAbiltyDescription(
                deepWoundsLevel2Ability.getName(),
                deepWoundsLevel2Ability
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        this.calculateAbilityCount(deepWoundsLevel2Ability, _synergyAbilityPowerIncrease).toString(),
                    ),
            );
        }

        // Deep Wounds Level 3
        const deepWoundsLevel3Ability = this.getAbility("Deep Wounds Level 3");
        if (deepWoundsLevel3Ability) {
            this.refreshAbiltyDescription(
                deepWoundsLevel3Ability.getName(),
                deepWoundsLevel3Ability
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        this.calculateAbilityCount(deepWoundsLevel3Ability, _synergyAbilityPowerIncrease).toString(),
                    ),
            );
        }

        // Blind Fury
        const blindFuryAbility = this.getAbility("Blind Fury");
        if (blindFuryAbility) {
            this.refreshAbiltyDescription(
                blindFuryAbility.getName(),
                blindFuryAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        (
                            (1 -
                                this.unitProperties.amount_alive /
                                    (this.unitProperties.amount_alive + this.unitProperties.amount_died)) *
                            100
                        ).toFixed(1),
                    ),
            );
        }

        // Miner
        const minerAbility = this.getAbility("Miner");
        if (minerAbility) {
            this.refreshAbiltyDescription(
                minerAbility.getName(),
                minerAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        this.calculateAbilityCount(minerAbility, _synergyAbilityPowerIncrease).toString(),
                    ),
            );
        }

        // Chain Lightning
        const chainLightningAbility = this.getAbility("Chain Lightning");
        if (chainLightningAbility) {
            const percentage =
                this.calculateAbilityMultiplier(chainLightningAbility, _synergyAbilityPowerIncrease) * 100;
            const description = chainLightningAbility.getDesc().join("\n");
            const updatedDescription = description
                .replace("{}", Number(percentage.toFixed()).toString())
                .replace("{}", Number(((percentage * 7) / 8).toFixed()).toString())
                .replace("{}", Number(((percentage * 6) / 8).toFixed()).toString())
                .replace("{}", Number(((percentage * 5) / 8).toFixed()).toString());
            this.refreshAbiltyDescription(chainLightningAbility.getName(), updatedDescription);
        }

        // Crusade
        const crusadeAbility = this.getAbility("Crusade");
        if (crusadeAbility) {
            this.refreshAbiltyDescription(
                crusadeAbility.getName(),
                crusadeAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        Number(
                            this.calculateAbilityCount(crusadeAbility, _synergyAbilityPowerIncrease).toFixed(2),
                        ).toString(),
                    ),
            );
        }

        // Dulling Defense
        const dullingDefenseAbility = this.getAbility("Dulling Defense");
        if (dullingDefenseAbility) {
            this.refreshAbiltyDescription(
                dullingDefenseAbility.getName(),
                dullingDefenseAbility
                    .getDesc()
                    .join("\n")
                    .replace(
                        /\{\}/g,
                        Number(
                            this.calculateAbilityCount(dullingDefenseAbility, _synergyAbilityPowerIncrease).toFixed(1),
                        ).toString(),
                    ),
            );
        }

        // Devour Essence
        const devourEssenceAbility = this.getAbility("Devour Essence");
        if (devourEssenceAbility) {
            const percentage = Number(
                this.calculateAbilityApplyChance(devourEssenceAbility, _synergyAbilityPowerIncrease).toFixed(2),
            );
            this.refreshAbiltyDescription(
                devourEssenceAbility.getName(),
                devourEssenceAbility.getDesc().join("\n").replace(/\{\}/g, percentage.toString()),
            );
        }
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
