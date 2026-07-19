import { Container, Sprite, Graphics, Text, TextStyle, Texture, Rectangle, BlurFilter } from "pixi.js";
import {
    Unit,
    UnitProperties,
    HoCMath,
    GridSettings,
    GridMath,
    TeamVals,
    HoCConstants,
    HoCConfig,
    SpellHelper,
    FightStateManager,
} from "@heroesofcrypto/common";
import { PixiRenderableSpell } from "./RenderableSpell";
import { TextureType, unitToTextureName } from "@/pixi/PixiUnitsFactory";
import { animationAtlases, AnimationUnitName, AnimationStateName } from "../generated/animation_atlases";
import { images, type ImageKey } from "../generated/image_imports";
import { buildAtlasPingPongTiming, AtlasPingPongTiming } from "./atlasAnimationTiming";
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
    // Server-authoritative "already used its hourglass (wait) this lap" flag, synced from the snapshot in
    // ranked (the client's FightProperties hourglass state isn't authoritative there). Overwritten every
    // snapshot, so it clears on its own when the lap flips. Drives the Wait button disable in ranked.
    private hasHourglassedThisLap = false;
    // Server-authoritative "skipping this turn" (Stun/Blindness) flag, synced from the snapshot in ranked.
    // The effect itself isn't on the wire, so isSkippingThisTurn() (which reads getEffects) can't see it
    // there — this flag is the only source. Drives the stun icon; OR'd with the live check for sandbox.
    private skippingThisTurnSynced = false;
    private sprite?: Sprite;
    private motionBlurFilter?: BlurFilter;
    private shadow?: Sprite;
    private badgeContainer?: Container;
    private badgeFlag?: Graphics;
    private badgeText?: Text;
    private stackPowerContainer?: Container;
    private stackPowerPips: Graphics[] = [];
    private hourglassContainer?: Container;
    private hourglassSprite?: Sprite;
    /** Stun/skip indicator (shown when the unit is skipping its turn) — shares the hourglass corner. */
    private stunContainer?: Container;
    private stunSprite?: Sprite;
    /** Retaliation tag (shown once the unit has used its response attack this round). */
    private respondContainer?: Container;
    private respondSprite?: Sprite;
    private spawnAnim?: SpawnAnimState;
    private boardSelected = false;
    private selectionAnimFrames?: Texture[];
    private selectionAnimTiming?: AtlasPingPongTiming;
    // Last frame written to the sprite; -1 forces the next step to apply the in-phase frame.
    private selectionAnimFrameIndex = -1;
    private stackForcedHidden = false;
    private isActiveTurn = false;
    private isDestroyed = false;
    private visualMode: "normal" | "hidden" | "ghost" = "normal";
    // Uniform multiplier applied to the rendered sprite, shadow, badge and corner indicators.
    // 1 = normal one-cell board size. The placement bench renders unplaced units larger (>1) so
    // they read at "full size" while waiting to be deployed; placed/board units keep the default 1.
    private visualScaleMultiplier = 1;
    // Animated "light waves" aura shown under the unit whose turn it is.
    private activeAura?: Graphics;
    // Color of the active-turn aura. White by default; the scene tints it (e.g. red) when the
    // active unit is the viewer's enemy so it reads clearly that it is not the viewer's turn.
    private activeAuraColor = 0xffffff;
    // While the active unit is mid-move or mid-attack, the aura is suppressed so it doesn't
    // distract from the action (set each frame by the scene).
    private suppressActiveAura = false;
    // Brief "jerk back" applied to the sprite/shadow (e.g. a petrifying-gaze hit yanking the
    // target away from the attacker). Decays to zero over ~220ms.
    private recoilStartMs = 0;
    private recoilDx = 0;
    private recoilDy = 0;
    // When true the recoil uses a wind-up envelope (pull back, then thrust forward, then settle) over a
    // longer duration — used for Pikeman's Skewer Strike spear thrust. Otherwise a simple out-and-back.
    private recoilWindup = false;
    private recoilDurationMs = 220;
    // Brief colour wash over the sprite when an effect lands on this unit — dark violet for a debuff
    // (e.g. Spit Ball), green for a buff. Decays over ~650ms; syncVisual reads it each frame via
    // currentEffectTint().
    private effectFlashStartMs = 0;
    private effectFlashColor = 0x2a0a3a;
    // Spells support
    private pixiSpells: PixiRenderableSpell[] = [];
    private spellBookLayer?: Container;
    private digitTextures?: Map<number, Texture>; // 0-9 and -1
    /**
     * Attach rendering capabilities to an existing Unit instance.
     * (We rely on JS prototype + TS casting; Unit stays the core owner.)
     */
    public static fromBase(base: Unit, texResolver: TexResolver): RenderableUnit {
        Object.setPrototypeOf(base, RenderableUnit.prototype);
        const ru = base as RenderableUnit;
        ru.texResolver = texResolver;
        ru.pixiSpells = [];
        ru.stackPowerPips = [];
        ru.boardSelected = false;
        ru.stackForcedHidden = false;
        ru.isActiveTurn = false;
        ru.isDestroyed = false;
        ru.visualMode = "normal";
        // fromBase() bypasses the constructor (it re-prototypes an existing Unit), so class field
        // defaults never run — initialise every added field explicitly or it stays `undefined`.
        ru.activeAura = undefined;
        ru.suppressActiveAura = false;
        ru.recoilStartMs = 0;
        ru.recoilDx = 0;
        ru.recoilDy = 0;
        ru.effectFlashStartMs = 0;
        ru.effectFlashColor = 0x2a0a3a;
        // Without this, visualScaleMultiplier is `undefined` -> targetSize = 128 * undefined = NaN
        // -> sprite.scale = NaN -> the unit collapses to an invisible point (renders as a bare dot).
        ru.visualScaleMultiplier = 1;
        return ru;
    }
    public setSpellBookLayer(layer: Container, digitTextures: Map<number, Texture>): void {
        this.spellBookLayer = layer;
        this.digitTextures = digitTextures;
        this.parseSpells();
    }
    public override parseSpells(): void {
        // Keep Unit's authoritative Spell objects synchronized even before a Pixi spellbook layer exists.
        // Runtime ability changes (for example Predatory Assimilation) call this method to remove or grant
        // castable/spellbook mechanics; returning before the base parser left getSpells() stale in sandbox.
        super.parseSpells();

        if (!this.spellBookLayer || !this.digitTextures) return;

        // Clear existing
        this.pixiSpells.forEach((s) => s.destroy());
        this.pixiSpells = [];

        const spellsData = this.parseSpellData(this.unitProperties.spells);

        for (const [k, v] of spellsData.entries()) {
            const spArr = k.split(":");
            if (spArr.length !== 2) continue;

            // Ability-derived spells are stored with an empty faction prefix (":SpellName").
            // Treat an empty faction as "System" (matching getSpellConfig's own default) so those
            // auto-parsed spells render in the spellbook instead of being skipped.
            const factionName = spArr[0] || "System";
            const spellName = spArr[1];
            if (!spellName) continue;

            const spellProperties = HoCConfig.getSpellConfig(factionName, spellName);
            const textureNames = SpellHelper.spellToTextureNames(spellName);

            // Resolve textures
            // textureNames[0] is the spell icon
            // textureNames[1] is the title strip
            const iconTex = this.texResolver(textureNames[0]);
            const titleTex = this.texResolver(textureNames[1]);
            const cellTex = this.texResolver("spell_cell_260");

            if (iconTex && titleTex && cellTex) {
                const newSpell = new PixiRenderableSpell(
                    { spellProperties: spellProperties, amount: v },
                    this.spellBookLayer,
                    { spell_cell_260: cellTex },
                    iconTex,
                    titleTex,
                    this.digitTextures,
                );
                this.pixiSpells.push(newSpell);
            }
        }
    }
    public renderSpells(pageNumber: number): void {
        this.syncSpellAmountsFromProperties();

        const windowLeft = (pageNumber - 1) * 6;
        const windowRight = (pageNumber - 1) * 6 + 6;
        let bookPosition = 1;
        const rendered: number[] = [];

        for (let i = windowLeft; i < windowRight; i++) {
            if (i < this.pixiSpells.length && this.pixiSpells[i]) {
                // Ensure spell book layer visibility is managed by Overlay
                this.pixiSpells[i].renderOnPage(bookPosition++, this.getStackPower());
                rendered.push(i);
            }
        }

        // Cleanup non-rendered spells
        for (let i = 0; i < this.pixiSpells.length; i++) {
            if (!rendered.includes(i)) {
                this.pixiSpells[i].cleanupPagePosition();
            }
        }
    }
    public hideSpells(): void {
        for (const s of this.pixiSpells) {
            s.cleanupPagePosition();
        }
    }
    public setHoveredSpell(spell: PixiRenderableSpell | undefined): void {
        for (const s of this.pixiSpells) {
            s.setHighlighted(s === spell);
        }
    }
    public getHoveredSpell(mousePosition: HoCMath.XY, includeUnavailable = false): PixiRenderableSpell | undefined {
        for (const s of this.pixiSpells) {
            if (s.isHover(mousePosition, this.getStackPower(), includeUnavailable)) {
                return s;
            }
        }
        return undefined;
    }
    private syncSpellAmountsFromProperties(): void {
        // Authoritative remaining casts come from the Spell objects (getSpells()). In sandbox the engine's
        // useSpell keeps their amount in lockstep with the unitProperties.spells entry list; in RANKED the
        // client never runs the cast engine and only syncs the Spell objects from the snapshot's
        // spellAmounts (reconcileAuraEffectsFromSnapshot -> setAmount) — the raw entry list stays at the
        // base count. Reading that list here made the spellbook show every spell as still available after a
        // cast in ranked. Sum by name so the pixi badge matches each spell's real getAmount().
        const remainingByName = new Map<string, number>();
        for (const spell of this.getSpells()) {
            remainingByName.set(spell.getName(), (remainingByName.get(spell.getName()) ?? 0) + spell.getAmount());
        }
        for (const spell of this.pixiSpells) {
            spell.syncAmount(remainingByName.get(spell.getName()) ?? 0);
        }
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
            // Dynamic Z: Objects lower on screen (low Y) draw last (high Z).
            // Base ~ 3000. Range 0-2048.
            this.sprite.zIndex = 4000 - pos.y;
            worldRoot.addChild(this.sprite);
        } else {
            // ⬇️ IMPORTANT: only force base texture if NOT in selection animation
            const selectionActive = this.boardSelected && !!this.selectionAnimFrames?.length;
            if (!selectionActive) {
                this.sprite.texture = baseTex;
            }
            if (!this.sprite.parent || this.sprite.parent !== worldRoot) {
                worldRoot.addChild(this.sprite);
            }
        }
        const targetSize = (props.size === 2 ? 256 : 128) * this.visualScaleMultiplier;
        const currentTexture = this.sprite.texture;
        const currentWidth = currentTexture && currentTexture.width > 1 ? currentTexture.width : baseTex.width || 1;
        const scale = targetSize / currentWidth;
        this.sprite.scale.set(scale, -scale);
        const recoil = this.currentRecoil();
        this.sprite.x = pos.x + recoil.x;
        this.sprite.y = pos.y + recoil.y;
        this.sprite.visible = this.visualMode !== "hidden";
        // Units with the "Hidden" buff (e.g. White Tiger) are drawn semi-transparent as a cue.
        const isHidden = this.hasBuffActive("Hidden");
        const normalSpriteAlpha = isHidden ? 0.4 : 1;
        this.sprite.alpha = this.visualMode === "ghost" ? 0.25 : normalSpriteAlpha;
        this.sprite.tint = this.currentEffectTint();
        if (!this.shadow) {
            this.shadow = new Sprite(baseTex);
            this.shadow.anchor.set(0.5);
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            this.shadow.zIndex = 4000 - pos.y - 0.5; // Slightly below sprite
            worldRoot.addChild(this.shadow);
            this.shadow.filters = [];
        } else {
            this.shadow.texture = baseTex;
            if (!this.shadow.parent || this.shadow.parent !== worldRoot) {
                worldRoot.addChild(this.shadow);
            }
        }
        // Silhouette positioning same as before
        this.shadow.scale.set(scale, -scale);
        const shadowOffsetX = targetSize * 0.04;
        const shadowOffsetY = targetSize * 0.08;
        this.shadow.x = pos.x + shadowOffsetX + recoil.x;
        this.shadow.y = pos.y + shadowOffsetY + recoil.y;
        this.shadow.visible = this.visualMode !== "hidden";
        const normalShadowAlpha = isHidden ? 0.15 : 0.35;
        this.shadow.alpha = this.visualMode === "ghost" ? 0.1 : normalShadowAlpha;
        this.shadow.tint = 0x000000;
        // --- badge ---
        this.ensureBadge(worldRoot, gs, props, pos);
        // --- stack power indicator ---
        this.ensureStackPowerIndicator(worldRoot, gs, props, pos);
        // --- turn status indicator ---
        this.ensureHourglassIndicator(worldRoot, gs, props, pos);
        // --- stun/skip indicator: top-left corner (same slot as the hourglass, mutually exclusive) ---
        {
            const r = this.buildCornerIcon(
                worldRoot,
                this.stunContainer,
                this.stunSprite,
                "stun_256",
                pos,
                props,
                -1,
                1,
                this.isSkippingForDisplay(),
            );
            this.stunContainer = r.container;
            this.stunSprite = r.sprite;
        }
        // --- retaliation tag: right-center edge (clear of flag/stack/hourglass) ---
        {
            const r = this.buildCornerIcon(
                worldRoot,
                this.respondContainer,
                this.respondSprite,
                "tag",
                pos,
                props,
                1,
                0,
                this.shouldShowRespondTag(),
            );
            this.respondContainer = r.container;
            this.respondSprite = r.sprite;
        }
        return scale;
    }
    public setSpriteRotation(rotation: number) {
        if (this.sprite) {
            this.sprite.rotation = rotation;
        }
    }
    /**
     * Drop a fading "afterimage" copy of the current sprite at its present transform — a frozen ghost
     * the caller then fades out. Spawned repeatedly along a fast charge (Rapid Charge) it reads as a
     * motion-blur streak trailing the unit. Returns the ghost so the caller can manage its lifetime,
     * or undefined when there is no sprite/texture yet.
     */
    public createAfterimageSprite(worldRoot: Container): Sprite | undefined {
        const src = this.sprite;
        if (!src || !src.texture) return undefined;
        // Add the ghost into the SAME container as the live sprite (its parent) so it shares the unit
        // layer's coordinate space and z-sorting; fall back to the passed root only if unparented.
        const parent = src.parent ?? worldRoot;
        const ghost = new Sprite(src.texture);
        ghost.anchor.set(0.5);
        ghost.x = src.x;
        ghost.y = src.y;
        ghost.scale.set(src.scale.x, src.scale.y);
        ghost.rotation = src.rotation;
        ghost.tint = src.tint;
        ghost.alpha = 0.45;
        // Just under the live sprite so the unit stays crisp on top of its blurred trail.
        ghost.zIndex = src.zIndex - 1;
        parent.addChild(ghost);
        return ghost;
    }
    /**
     * Apply (or clear, when strength <= 0) a light gaussian blur on the live sprite so a fast-charging
     * unit looks like it's moving too fast to focus on. Reuses a single filter instance; clearing
     * removes it so the unit renders crisp again the moment the charge ends.
     */
    public setMotionBlur(strength: number): void {
        if (!this.sprite) return;
        if (strength <= 0) {
            if (this.motionBlurFilter) {
                this.sprite.filters = [];
                this.motionBlurFilter = undefined;
            }
            return;
        }
        if (!this.motionBlurFilter) {
            this.motionBlurFilter = new BlurFilter({ strength });
            this.sprite.filters = [this.motionBlurFilter];
        } else {
            this.motionBlurFilter.strength = strength;
        }
    }
    public getCurrentVisualScale(): number {
        return this.sprite ? Math.abs(this.sprite.scale.x) : 1;
    }
    /**
     * Scale the whole unit visual (sprite + shadow + badge + indicators) uniformly around its
     * position. Used by the placement bench to render unplaced units bigger than one board cell.
     * Takes effect on the next ensureVisual/syncVisual pass.
     */
    public setVisualScaleMultiplier(multiplier: number): void {
        this.visualScaleMultiplier = multiplier > 0 ? multiplier : 1;
    }
    public setVisualVisible(visible: boolean): void {
        this.visualMode = visible ? "normal" : "hidden";
        if (this.sprite) this.sprite.visible = visible;
        if (this.shadow) this.shadow.visible = visible;
        if (this.badgeContainer) this.badgeContainer.visible = visible;
        if (this.stackPowerContainer) this.stackPowerContainer.visible = visible;
        if (this.hourglassContainer) {
            this.hourglassContainer.visible = visible && this.shouldShowHourglassIndicator();
        }
        if (this.stunContainer) {
            this.stunContainer.visible = visible && this.isSkippingForDisplay();
        }
        if (this.respondContainer) {
            this.respondContainer.visible = visible && this.shouldShowRespondTag();
        }
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
        if (this.hourglassContainer) {
            this.hourglassContainer.visible = !active && visible && this.shouldShowHourglassIndicator();
        }
        if (this.stunContainer) {
            this.stunContainer.visible = !active && visible && this.isSkippingForDisplay();
        }
        if (this.respondContainer) {
            this.respondContainer.visible = !active && visible && this.shouldShowRespondTag();
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
        if (this.isDestroyed) return;
        const pos = this.getPosition();
        const inGrid = GridMath.isPositionWithinGrid(gs, pos);
        if (!inGrid) {
            if (this.sprite) this.sprite.visible = false;
            if (this.shadow) this.shadow.visible = false;
            if (this.badgeContainer) this.badgeContainer.visible = false;
            if (this.stackPowerContainer) this.stackPowerContainer.visible = false;
            if (this.hourglassContainer) this.hourglassContainer.visible = false;
            if (this.stunContainer) this.stunContainer.visible = false;
            if (this.respondContainer) this.respondContainer.visible = false;
            return;
        }
        this.ensureVisual(worldRoot, gs);

        // Update Z-Index for depth sorting
        if (this.sprite) {
            const baseZ = 4000 - pos.y;
            this.sprite.zIndex = baseZ;
            if (this.shadow) this.shadow.zIndex = baseZ - 0.5;
            if (this.badgeContainer) this.badgeContainer.zIndex = baseZ + 1;
            if (this.stackPowerContainer) this.stackPowerContainer.zIndex = baseZ + 1;
            if (this.hourglassContainer) this.hourglassContainer.zIndex = baseZ + 2;
            if (this.stunContainer) this.stunContainer.zIndex = baseZ + 2;
            if (this.respondContainer) this.respondContainer.zIndex = baseZ + 2;
        }

        // Active-turn "light waves" identify an aura source; units with no aura ranges (for example,
        // Squire) must not look as though they project one. Suppress it during movement/attacks too.
        const hasAuraRange = this.getAuraRanges().some((range) => range > 0);
        if (this.isActiveTurn && !this.isDead() && !this.suppressActiveAura && hasAuraRange) {
            this.updateActiveAura(worldRoot, gs, pos);
        } else if (this.activeAura) {
            this.activeAura.visible = false;
        }
    }
    /**
     * Animated golden aura under the active unit: a soft breathing glow plus staggered rings of
     * light that radiate outward and fade — "waves of light" shining around it. Redrawn every
     * frame from a time-based phase so it stays smooth and never stutters.
     */
    private updateActiveAura(worldRoot: Container, gs: GridSettings, pos: HoCMath.XY): void {
        if (!this.activeAura) {
            this.activeAura = new Graphics();
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            worldRoot.addChild(this.activeAura);
        } else if (this.activeAura.parent !== worldRoot) {
            worldRoot.addChild(this.activeAura);
        }
        // Sit on the ground beneath the unit (and its shadow) so the unit stands in the light.
        this.activeAura.zIndex = 4000 - pos.y - 0.6;
        this.activeAura.visible = true;

        const cell = gs.getCellSize();
        const isLarge = this.getUnitProperties().size === 2;
        const baseR = cell * (isLarge ? 0.95 : 0.55);
        const t = performance.now() / 1000;

        const g = this.activeAura;
        g.clear();

        // 1. Soft pulsing inner glow that breathes with the waves.
        const pulse = 0.5 + 0.5 * Math.sin(t * 3.0);
        g.circle(pos.x, pos.y, baseR * (1.05 + 0.1 * pulse)).fill({
            color: this.activeAuraColor,
            alpha: 0.1 + 0.1 * pulse,
        });

        // 2. Expanding light rings radiating outward, staggered so a new wave emerges as the last fades.
        const ringCount = 3;
        const cycleSec = 1.8;
        const maxR = baseR * (isLarge ? 1.5 : 1.35);
        for (let i = 0; i < ringCount; i++) {
            const phase = (t / cycleSec + i / ringCount) % 1;
            const r = baseR + (maxR - baseR) * phase;
            const a = (1 - phase) * 0.55;
            const width = 2 + (1 - phase) * 2.5;
            g.circle(pos.x, pos.y, r).stroke({ color: this.activeAuraColor, alpha: a, width });
        }
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
        this.selectionAnimTiming = buildAtlasPingPongTiming(meta);
        this.selectionAnimFrameIndex = -1;
        // Render the in-phase frame immediately so the board lines up with the sidebar portrait
        // even before the next ticker step.
        this.stepSelectionAnimation();
    }
    public stepSelectionAnimation(): void {
        if (!this.boardSelected) return;
        const frames = this.selectionAnimFrames;
        const timing = this.selectionAnimTiming;
        if (!frames || !timing || !this.sprite) return;
        if (frames.length <= 1) return;
        // Derive the frame purely from the absolute wall clock so the board sprite and the
        // sidebar's CSS animation (which uses the same helper on the rAF timestamp) stay
        // phase-locked. See buildAtlasPingPongTiming for why absolute time keeps them in sync.
        const frame = timing.frameForElapsed(performance.now());
        if (frame === this.selectionAnimFrameIndex) return;
        this.selectionAnimFrameIndex = frame;
        const tex = frames[frame];
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
        this.selectionAnimTiming = undefined;
        this.selectionAnimFrameIndex = -1;
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
            // Drop/settle time when a unit lands on the board (seconds) — kept snappy.
            duration: 0.2,
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
        this.isDestroyed = true;

        if (this.sprite) {
            this.sprite.destroy();
            this.sprite = undefined;
        }
        if (this.shadow) {
            this.shadow.destroy();
            this.shadow = undefined;
        }
        if (this.hourglassContainer) {
            this.hourglassContainer.destroy({ children: true });
            this.hourglassContainer = undefined;
            this.hourglassSprite = undefined;
        }
        if (this.stunContainer) {
            this.stunContainer.destroy({ children: true });
            this.stunContainer = undefined;
            this.stunSprite = undefined;
        }
        if (this.respondContainer) {
            this.respondContainer.destroy({ children: true });
            this.respondContainer = undefined;
            this.respondSprite = undefined;
        }
        if (this.badgeContainer) {
            this.badgeContainer.destroy({ children: true });
            this.badgeContainer = undefined;
            this.badgeFlag = undefined;
            this.badgeText = undefined;
        }
        if (this.stackPowerContainer) {
            this.stackPowerContainer.destroy({ children: true });
            this.stackPowerContainer.removeFromParent();
            this.stackPowerContainer = undefined;
            this.stackPowerPips = [];
        }
        if (this.activeAura) {
            this.activeAura.destroy({ children: true });
            this.activeAura = undefined;
        }
        this.spawnAnim = undefined;
        this.oneShotAnim = undefined;
        // Spellbook sprites live in a scene-shared container, not under this unit's own display
        // objects, so destroying the unit's sprite/containers above does not free them. Leaving them
        // behind orphans them in that shared container — and because ranked snapshots constantly
        // rebuild units, those orphans accumulate and bleed one unit's spells into another unit's
        // spellbook overlay (e.g. a melee unit showing a destroyed healer's spells). Destroy them
        // here, mirroring parseSpells' own cleanup.
        this.pixiSpells.forEach((s) => s.destroy());
        this.pixiSpells = [];
        // ⬇️ NEW
        this.boardSelected = false;
        this.selectionAnimFrames = undefined;
    }
    private ensureBadge(worldRoot: Container, gs: GridSettings, props: UnitProperties, pos: HoCMath.XY): void {
        if (!this.badgeContainer) {
            this.badgeContainer = new Container();
            this.badgeFlag = new Graphics();
            this.badgeText = new Text({
                text: "0",
                style: new TextStyle({
                    fill: 0xffffff,
                    fontSize: 14,
                    fontWeight: "700",
                    stroke: { color: 0x000000, width: 3, join: "round" },
                }),
            });
            this.badgeText.anchor.set(0.5);
            this.badgeText.scale.y = -1;
            this.badgeContainer.addChild(this.badgeFlag, this.badgeText);
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            this.badgeContainer.zIndex = 4000 - pos.y + 1; // Initial Set
            worldRoot.addChild(this.badgeContainer);
        } else if (this.badgeContainer.parent !== worldRoot) {
            // Force re-parent if container changed (e.g. from worldRoot to unitsContainer)
            worldRoot.addChild(this.badgeContainer);
        }
        const iconSide = gs.getCellSize() * this.visualScaleMultiplier;
        const amount = this.getAmountAlive();
        const flag = this.badgeFlag!;
        const text = this.badgeText!;
        const container = this.badgeContainer!;
        const label = String(amount);
        const fs = Math.max(10, Math.floor(iconSide * 0.18));
        const flagHeight = Math.max(14, Math.floor(iconSide * 0.24));
        const flagWidth = Math.max(26, Math.floor(iconSide * 0.44), Math.ceil(label.length * fs * 0.62 + fs * 0.9));
        const notchDepth = Math.max(4, Math.floor(flagWidth * 0.15));
        const bannerLeft = -flagWidth * 0.82;
        const bannerRight = flagWidth * 0.18;
        const bannerTop = -flagHeight * 0.5;
        const bannerBottom = flagHeight * 0.5;
        const teamColor =
            props.team === TeamVals.LOWER ? 0x00d200 : props.team === TeamVals.UPPER ? 0xff0000 : 0x8b94a6;
        const borderWidth = this.isActiveTurn ? 1.75 : 1.25;
        const borderColor = this.isActiveTurn ? 0xffffff : 0x000000;
        const borderAlpha = this.isActiveTurn ? 1 : 0.58;

        flag.clear();
        flag.moveTo(bannerLeft, bannerTop)
            .lineTo(bannerRight, bannerTop)
            .lineTo(bannerRight - notchDepth, 0)
            .lineTo(bannerRight, bannerBottom)
            .lineTo(bannerLeft, bannerBottom)
            .closePath()
            .fill({ color: teamColor, alpha: 0.96 });
        flag.moveTo(bannerLeft, bannerTop)
            .lineTo(bannerRight, bannerTop)
            .lineTo(bannerRight - notchDepth, 0)
            .lineTo(bannerRight, bannerBottom)
            .lineTo(bannerLeft, bannerBottom)
            .closePath()
            .stroke({ width: borderWidth, color: borderColor, alpha: borderAlpha, join: "round" });
        flag.moveTo(bannerLeft, bannerTop - 2)
            .lineTo(bannerLeft, bannerBottom + 3)
            .stroke({ width: Math.max(1.5, iconSide * 0.024), color: 0x1b140f, alpha: 0.88, cap: "round" });
        flag.moveTo(bannerLeft + 2, bannerTop + 2)
            .lineTo(bannerRight - 2, bannerTop + 2)
            .stroke({ width: 1, color: 0xffffff, alpha: 0.32, cap: "round" });

        text.style = new TextStyle({
            fill: 0xffffff,
            fontSize: fs,
            fontWeight: "700",
            stroke: { color: 0x000000, width: 2, join: "round" },
        });
        text.text = label;
        text.position.set(bannerLeft + (flagWidth - notchDepth) * 0.5, 0);
        // position top-right of stack (1×1 or 2×2)
        const w = iconSide * (props.size === 2 ? 2 : 1);
        const h = iconSide * (props.size === 2 ? 2 : 1);
        const margin = Math.max(2, Math.floor(iconSide * 0.045));
        const offsetX = w * 0.5 - margin;
        const offsetY = h * 0.5 - margin;
        container.x = pos.x + offsetX;
        container.y = pos.y + offsetY;
        container.visible = amount > 0;
    }
    private ensureHourglassIndicator(
        worldRoot: Container,
        gs: GridSettings,
        props: UnitProperties,
        pos: HoCMath.XY,
    ): void {
        const tex = this.texResolver("hourglass");

        if (!this.hourglassContainer) {
            this.hourglassContainer = new Container();
            this.hourglassSprite = new Sprite(tex ?? Texture.EMPTY);
            this.hourglassSprite.anchor.set(0.5);
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            this.hourglassContainer.zIndex = 4000 - pos.y + 2;
            this.hourglassContainer.addChild(this.hourglassSprite);
            worldRoot.addChild(this.hourglassContainer);
        } else if (this.hourglassContainer.parent !== worldRoot) {
            worldRoot.addChild(this.hourglassContainer);
        }

        if (this.hourglassSprite) {
            this.hourglassSprite.texture = tex ?? Texture.EMPTY;
            this.hourglassSprite.visible = !!tex;
        }

        if (this.hourglassContainer) {
            this.hourglassContainer.zIndex = 4000 - pos.y + 2;
        }

        const visualSide = (props.size === 2 ? 256 : 128) * this.visualScaleMultiplier;
        const iconSide = Math.round((visualSide * 20) / 72);
        const unitHalfSize = visualSide / 2;
        const halfIcon = iconSide / 2;

        if (this.hourglassSprite) {
            this.hourglassSprite.width = iconSide;
            this.hourglassSprite.height = iconSide;
            this.hourglassSprite.scale.y = -Math.abs(this.hourglassSprite.scale.y);
        }

        if (this.hourglassContainer) {
            this.hourglassContainer.x = pos.x - unitHalfSize + halfIcon;
            this.hourglassContainer.y = pos.y + unitHalfSize - halfIcon;
            this.hourglassContainer.visible =
                (this.visualMode ?? "normal") === "normal" &&
                this.getAmountAlive() > 0 &&
                !!tex &&
                this.shouldShowHourglassIndicator();
            for (const child of this.hourglassContainer.children) {
                if (child instanceof Sprite) {
                    child.scale.y = -Math.abs(child.scale.y);
                }
            }
        }
    }
    private shouldShowHourglassIndicator(): boolean {
        // A stunned/skipping unit shows the stun icon in this same corner instead, so suppress the
        // hourglass when skipping (mirrors legacy, where stop and hourglass were mutually exclusive).
        if (this.isSkippingForDisplay()) return false;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        return this.isOnHourglass() || fightProps.hourglassIncludes(this.getId());
    }
    /**
     * Whether to show the retaliation tag. The legacy `responded` flag isn't propagated in the new
     * engine — the authoritative "already retaliated this round" state lives on FightProperties
     * (set via addRepliedAttack, cleared each lap), so read it from there.
     */
    /**
     * Capability indicator (NOT a "has already retaliated" mark): show the respond tag on a RANGE unit
     * that can still RETURN FIRE — it has range shots left and isn't blocked from responding (stun,
     * blindness, Through Shot). Melee retaliation is the default and isn't tagged; the tag flags the
     * conditional case (a ranged unit will shoot back). Retaliation is once per lap (enforced server-side
     * by processOneInTheFieldAbility), so once a unit has used its response this lap the tag clears —
     * except Unicorn's "One in the Field", which responds infinitely and always shows. (In ranked the
     * per-lap replied state isn't synced to the client, so there it reflects shots/eligibility only.)
     */
    private shouldShowRespondTag(): boolean {
        // The tag is a "HAS already retaliated this lap" marker — NOT a "can still respond" capability
        // hint. It was inverted before (showing on any ranged unit that COULD return fire), which is why
        // e.g. a Medusa that had not yet retaliated wrongly showed it. Read the authoritative per-lap
        // replied state (addRepliedAttack, cleared each lap). Kept to RANGE units since a ranged return-
        // fire is the notable case the tag flags (melee retaliation is the default and untagged).
        // Show it for ANY unit (melee OR ranged) that has used its retaliation this lap — retaliation is
        // once per lap and the tag flags "already responded". Sources: `responded` is set by the engine on
        // every responder (processOneInTheFieldAbility) and, in ranked, synced from the snapshot
        // (RankedPlayScene). FightProperties' replied set is the sandbox-authoritative fallback. Either => true.
        return (
            this.responded || FightStateManager.getInstance().getFightProperties().hasAlreadyRepliedAttack(this.getId())
        );
    }
    /** Sync the authoritative "already hourglassed (waited) this lap" flag from a ranked snapshot. */
    public setHasHourglassed(value: boolean): void {
        this.hasHourglassedThisLap = value;
    }
    /** Whether this unit already used its once-per-lap hourglass (wait) — per the last ranked snapshot. */
    public getHasHourglassed(): boolean {
        return this.hasHourglassedThisLap;
    }
    /** Sync the authoritative "skipping this turn" (Stun/Blindness) flag from a ranked snapshot. */
    public setSkipping(value: boolean): void {
        this.skippingThisTurnSynced = value;
    }
    /**
     * Whether to show the stun icon / treat the unit as skipping this turn FOR DISPLAY — the live effect
     * check (sandbox) OR the flag synced from the ranked snapshot (where the effect isn't on the wire).
     */
    private isSkippingForDisplay(): boolean {
        return this.skippingThisTurnSynced || this.isSkippingThisTurn();
    }
    /**
     * Create/refresh a small corner icon on the unit (stun, retaliation tag, …). Anchored by
     * (ax, ay) where -1/0/+1 select left/center/right and bottom/center/top. Returns the persisted
     * container+sprite so the caller can store them. Modeled on ensureHourglassIndicator so all the
     * unit overlays size and depth-sort identically.
     */
    private buildCornerIcon(
        worldRoot: Container,
        container: Container | undefined,
        sprite: Sprite | undefined,
        texKey: string,
        pos: HoCMath.XY,
        props: UnitProperties,
        ax: number,
        ay: number,
        shouldShow: boolean,
    ): { container: Container; sprite: Sprite } {
        const tex = this.texResolver(texKey);
        if (!container) {
            container = new Container();
            sprite = new Sprite(tex ?? Texture.EMPTY);
            sprite.anchor.set(0.5);
            if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
            container.addChild(sprite);
            worldRoot.addChild(container);
        } else if (container.parent !== worldRoot) {
            worldRoot.addChild(container);
        }
        const icon = sprite!;
        icon.texture = tex ?? Texture.EMPTY;

        const visualSide = (props.size === 2 ? 256 : 128) * this.visualScaleMultiplier;
        const iconSide = Math.round((visualSide * 20) / 72);
        const reach = visualSide / 2 - iconSide / 2;

        icon.width = iconSide;
        icon.height = iconSide;
        icon.scale.y = -Math.abs(icon.scale.y);

        container.zIndex = 4000 - pos.y + 2;
        container.x = pos.x + ax * reach;
        container.y = pos.y + ay * reach;
        container.visible =
            (this.visualMode ?? "normal") === "normal" && this.getAmountAlive() > 0 && !!tex && shouldShow;
        for (const child of container.children) {
            if (child instanceof Sprite) child.scale.y = -Math.abs(child.scale.y);
        }
        return { container, sprite: icon };
    }
    public setActiveTurn(active: boolean): void {
        if (this.isActiveTurn === active) return;
        this.isActiveTurn = active;
    }
    /**
     * Reconcile this unit's remaining stack stats (alive count, top-unit hp, dead count) to an
     * authoritative snapshot. Snapshot-driven clients (ranked) need this because a replayed action
     * animates the hit but its EVENTS don't mutate the stack — so attack/retaliation damage would
     * otherwise leave the on-board count frozen. Pure display reconciliation, hence a client concern.
     */
    public setRemainingStats(amountAlive: number, hp: number, amountDied: number): void {
        const alive = Math.max(0, Math.floor(amountAlive));
        this.unitProperties.amount_alive = alive;
        this.initialUnitProperties.amount_alive = alive;
        const clampedHp = Math.max(0, Math.min(Math.floor(hp), this.unitProperties.max_hp));
        this.unitProperties.hp = clampedHp;
        this.initialUnitProperties.hp = clampedHp;
        const died = Math.max(0, Math.floor(amountDied));
        this.unitProperties.amount_died = died;
        this.initialUnitProperties.amount_died = died;
    }
    /** Tint the active-turn aura (e.g. red for the enemy's turn in ranked, white otherwise). */
    public setActiveAuraColor(color: number): void {
        this.activeAuraColor = color;
    }
    /** Temporarily hide the active-turn aura (e.g. while the unit is moving or attacking). */
    public setSuppressActiveAura(suppress: boolean): void {
        this.suppressActiveAura = suppress;
    }
    /**
     * Apply a brief positional "recoil": the sprite/shadow jerk by (dx, dy) and spring back over
     * ~220ms. Used for petrifying-gaze hits to yank the target away from the attacker.
     */
    public applyRecoil(dx: number, dy: number): void {
        this.recoilStartMs = performance.now();
        this.recoilDx = dx;
        this.recoilDy = dy;
        this.recoilWindup = false;
        this.recoilDurationMs = 220;
    }
    /**
     * A wind-up spear thrust ("замахивается копьём"): the sprite first pulls BACK away from the target,
     * then thrusts FORWARD into it, then settles. (dx, dy) points toward the target (the thrust
     * direction). Used for Pikeman's Skewer Strike so the two-unit pierce reads as a real lunge.
     */
    public applyWindupRecoil(dx: number, dy: number): void {
        this.recoilStartMs = performance.now();
        this.recoilDx = dx;
        this.recoilDy = dy;
        this.recoilWindup = true;
        this.recoilDurationMs = 380;
    }
    private currentRecoil(): { x: number; y: number } {
        if (!this.recoilStartMs) return { x: 0, y: 0 };
        const t = (performance.now() - this.recoilStartMs) / this.recoilDurationMs;
        if (t >= 1) {
            this.recoilStartMs = 0;
            return { x: 0, y: 0 };
        }
        // Wind-up: -sin(2πt) pulls back (away from target) over the first half, then thrusts forward
        // (toward target) over the second half, settling at 0. Plain hit: out-and-back sin(πt).
        const env = this.recoilWindup ? -Math.sin(2 * Math.PI * t) : Math.sin(Math.PI * t);
        return { x: this.recoilDx * env, y: this.recoilDy * env };
    }
    /**
     * Briefly wash the unit toward a colour then back to normal — a "something just landed on me" cue
     * when an effect is applied. Debuffs (e.g. Beholder's Spit Ball applying Sadness / Quagmire /
     * Weakness) wash dark violet; buffs wash green. Read each frame by syncVisual via
     * currentEffectTint(); decays over ~650ms.
     */
    public flashDebuffDarken(): void {
        this.effectFlashStartMs = performance.now();
        this.effectFlashColor = 0x2a0a3a; // deep violet
    }
    public flashBuffApplied(): void {
        this.effectFlashStartMs = performance.now();
        this.effectFlashColor = 0x4dff9e; // bright green (keeps a positive, "buffed" feel)
    }
    private currentEffectTint(): number {
        if (!this.effectFlashStartMs) return 0xffffff;
        const DURATION = 650;
        const t = (performance.now() - this.effectFlashStartMs) / DURATION;
        if (t >= 1) {
            this.effectFlashStartMs = 0;
            return 0xffffff;
        }
        // Wash in, then back out (peak ~70% toward the effect colour) so it reads as a buff/debuff.
        const env = Math.sin(Math.PI * t) * 0.7;
        const lerp = (from: number, to: number): number => Math.round(from + (to - from) * env);
        const r = lerp(0xff, (this.effectFlashColor >> 16) & 0xff);
        const g = lerp(0xff, (this.effectFlashColor >> 8) & 0xff);
        const b = lerp(0xff, this.effectFlashColor & 0xff);
        return (r << 16) | (g << 8) | b;
    }
    /**
     * Build (and cache) this unit's "default" (active/selection) animation atlas frames so the WebP is
     * decoded up front, and return the first frame whose GPU upload the scene can prewarm. The default
     * atlas is distinct from the idle board sprite and is otherwise built + uploaded lazily the first
     * time the unit becomes active — a ~100ms decode/upload hitch on the turn-handoff frame. Prewarming
     * it during the load/placement phase moves that cost off the gameplay critical path.
     */
    public prewarmDefaultAtlasFrame(): Texture | undefined {
        const props = this.getUnitProperties();
        const config = getDefaultAnimationConfig(props.name, props.size);
        if (!config) {
            return undefined;
        }
        let frames = atlasFramesCache.get(config.cacheKey);
        if (!frames) {
            frames = buildAtlasFrames(config.meta, config.imageSrc, props.size);
            atlasFramesCache.set(config.cacheKey, frames);
        }
        return frames[0];
    }
    /**
     * Capture what's needed to spawn a "broken mirror" death shatter: the current sprite texture,
     * its world position, and the sprite scale (which includes the y-up flip). Call before
     * destroyVisuals(), while the sprite still exists.
     */
    public getShatterInfo(): { texture: Texture; x: number; y: number; scaleX: number; scaleY: number } | null {
        const s = this.sprite;
        if (!s || !s.texture) return null;
        const pos = this.getPosition();
        return { texture: s.texture, x: pos.x, y: pos.y, scaleX: s.scale.x, scaleY: s.scale.y };
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
            this.stackPowerContainer.zIndex = 4000 - pos.y + 1; // Initial Set
            worldRoot.addChild(this.stackPowerContainer);

            this.stackPowerPips = [];
            for (let i = 0; i < 5; i++) {
                const pip = new Graphics();
                this.stackPowerPips.push(pip);
                this.stackPowerContainer.addChild(pip);
            }
        } else if (this.stackPowerContainer.parent !== worldRoot) {
            worldRoot.addChild(this.stackPowerContainer);
        }

        // 2. Geometry & Style Configuration
        const unitSizeInCells = props.size === 2 ? 2 : 1;
        const cellSize = gs.getCellSize() * this.visualScaleMultiplier;

        // Bar dimensions
        const totalBarWidth = cellSize * unitSizeInCells * 0.85; // 85% of total unit width
        const barHeight = Math.max(6, cellSize * 0.12); // Thick enough to be visible
        const gap = Math.max(2, totalBarWidth * 0.02); // Gap between segments

        // Calculate single segment width
        // Formula: (TotalWidth - (All Gaps)) / Count
        const segmentWidth = (totalBarWidth - 4 * gap) / 5;
        const cornerRadius = 3;

        // Colors
        const teamColor = props.team === TeamVals.LOWER ? 0x00d200 : 0xff0000;
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

        // Flesh Shield Aura
        const fleshShieldAuraAbility = this.getAbility("Flesh Shield Aura");
        if (fleshShieldAuraAbility) {
            const auraEffect = this.effectFactory.makeAuraEffect("Flesh Shield");
            if (auraEffect) {
                this.refreshAbiltyDescription(
                    fleshShieldAuraAbility.getName(),
                    fleshShieldAuraAbility
                        .getDesc()
                        .join("\n")
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
