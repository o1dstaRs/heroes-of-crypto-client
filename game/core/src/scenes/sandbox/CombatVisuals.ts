import { Container, Sprite, Text as PixiText, TextStyle, Texture, Rectangle, Graphics } from "pixi.js";
import { GridSettings, HoCMath, GridMath, UnitProperties, UnitsHolder } from "@heroesofcrypto/common";
import { RenderableUnit } from "../RenderableUnit";
import { images } from "../../generated/image_imports";

export interface ICombatVisualsContext {
    getGridSettings(): GridSettings;
    attachToWorldRoot(obj: Container, zIndex?: number): void;
    getUnitsHolder(): UnitsHolder;
    getSelectedUnitProperties(): UnitProperties | undefined;
    updateSelectedUnitProperties(props: UnitProperties): void;
    setUnitPropertiesUpdateNeeded(needed: boolean): void;
}

interface IFloatingText {
    container: Container;
    age: number;
    life: number;
    startX: number;
    startY: number;
    riseY: number;
    driftX: number;
}

interface IShard {
    sprite: Sprite;
    vx: number;
    vy: number;
    rotSpeed: number;
    delay: number;
    age: number;
    life: number;
    x: number;
    y: number;
}

interface IShatterGroup {
    container: Container;
    shards: IShard[];
}

interface IFireParticle {
    sprite: Sprite;
    age: number; // seconds; negative means still delayed — the breath wave hasn't reached it yet
    life: number;
    x: number;
    y: number;
    riseY: number; // world px the ember floats up over its life
    driftX: number; // slight sideways waver
    baseScale: number;
    rot: number;
    spin: number;
}

interface IFireSweep {
    container: Container;
    particles: IFireParticle[];
}

interface IChainBolt {
    gfx: Graphics;
    from: HoCMath.XY;
    to: HoCMath.XY;
    cellSize: number;
    age: number; // seconds; negative means the chain hasn't reached this jump yet
    life: number;
    flicker: number; // accumulates dt; re-jags the bolt on CHAIN_FLICKER_S so it crackles
}

interface IChainLightning {
    container: Container;
    bolts: IChainBolt[];
}

// Tuning for the floating damage numbers.
const FT_LIFE = 0.8; // seconds on screen
const FT_RISE = 72; // world px the number floats up
const FT_DRIFT = 26; // world px horizontal drift in the hit direction
const FT_POP_DUR = 0.16; // seconds of the spawn "pop"
const FT_START_SCALE = 0.55; // scale the number pops in from
const FT_FADE_IN = 0.1; // seconds to fade in
const FT_FADE_OUT_FROM = 0.62; // fraction of life after which it fades out
const FT_STACK_DIST = 64; // px: numbers closer than this are stacked, not overlapped
const FT_STACK_STEP = 46; // px: vertical gap per stacked number

// Tuning for the Black Dragon's Fire Breath sweep — a line of embers that rushes from the attacker
// through every unit the breath burns. Timed to land with the strike: a tiny lead so the fire erupts
// right as the lunge connects (not before), then a FAST sweep so it reaches the target as the damage
// number pops — rather than trailing the attack by a beat.
const FIRE_LEAD_MS = 70; // delay before the wave starts ≈ when the attacker's lunge connects
const FIRE_SWEEP_MS = 120; // time for the wave to rush the WHOLE line (fast, so it tracks the strike)
const FIRE_PARTICLE_LIFE = 0.55; // seconds each ember lives
const FIRE_RISE = 30; // world px an ember floats up over its life
const FIRE_Z = 1900; // above units (~1000), below the damage numbers (2000) / death shatter (4500)
const FIRE_TINTS = [0xff3a0a, 0xff6a14, 0xff9a2e, 0xffc861]; // ember red → flame orange → spark gold

// Tuning for Thunderbird's Chain Lightning — a purple bolt that jumps from the attacker through the
// target and on to each chained enemy. Like the fire sweep, it's timed to the strike (small lead so
// it cracks as the lunge connects) and each jump fires a beat after the previous.
const CHAIN_LEAD_MS = 45; // delay before the first bolt ≈ when the lunge connects
const CHAIN_JUMP_MS = 64; // gap between successive jumps (target → next → next …)
const CHAIN_BOLT_LIFE = 0.195; // seconds each bolt crackles before fading
const CHAIN_FLICKER_S = 0.03; // re-jag the bolt this often so it crackles like live lightning
const CHAIN_Z = 1950; // above the fire sweep (1900), below the damage numbers (2000)
const CHAIN_GLOW = 0x7a2dff; // outer purple glow
const CHAIN_MID = 0xb36bff; // mid violet
const CHAIN_CORE = 0xedd6ff; // hot near-white core

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export class CombatVisuals {
    private context: ICombatVisualsContext;
    private floatingTexts: IFloatingText[] = [];
    private shatterGroups: IShatterGroup[] = [];
    private fireSweeps: IFireSweep[] = [];
    private chainLightnings: IChainLightning[] = [];
    // Soft radial ember texture, built once and reused for every Fire Breath sweep.
    private fireTexture?: Texture;
    // Damage/count text styles are reused across strikes — building a fresh TextStyle per hit is
    // wasteful, and (more importantly) the FIRST PixiText render of a style rasterizes the font and
    // compiles PIXI's text shader, a ~30-40ms one-time stall. prewarm() pays that off-screen at load.
    private damageStyleCache = new Map<string, TextStyle>();
    private countStyle?: TextStyle;
    private prewarmed = false;
    public constructor(context: ICombatVisualsContext) {
        this.context = context;
    }
    private getDamageStyle(fill: string, stroke: string): TextStyle {
        const key = `${fill}|${stroke}`;
        let style = this.damageStyleCache.get(key);
        if (!style) {
            style = new TextStyle({
                fontFamily: "Arial",
                fontSize: 60,
                fontWeight: "900",
                fill,
                stroke: { color: stroke, width: 5 },
                dropShadow: {
                    color: "#000000",
                    blur: 4,
                    angle: Math.PI / 6,
                    distance: 2,
                },
            });
            this.damageStyleCache.set(key, style);
        }
        return style;
    }
    private getCountStyle(): TextStyle {
        if (!this.countStyle) {
            this.countStyle = new TextStyle({
                fontFamily: "Arial",
                fontSize: 40,
                fontWeight: "bold",
                fill: "#ffffff",
                stroke: { color: "#000000", width: 4 },
            });
        }
        return this.countStyle;
    }
    /**
     * Render the damage/count text once, off-screen, so the one-time font rasterization + text-shader
     * compilation happen during scene load instead of stalling the first move+attack landing frame.
     */
    public prewarm(): void {
        if (this.prewarmed) {
            return;
        }
        this.prewarmed = true;
        const container = new Container();
        const dmg = new PixiText({ text: "-0", style: this.getDamageStyle("#ff3333", "#4a0000") });
        dmg.anchor.set(0.5);
        const count = new PixiText({ text: "0", style: this.getCountStyle() });
        count.anchor.set(0.5);
        count.position.set(0, 55);
        container.addChild(dmg, count);
        // Far off-screen + barely visible: renders once (compiling the shader / uploading glyphs)
        // without any visible flash, then update() destroys it on the next tick.
        container.position.set(-100000, -100000);
        container.alpha = 0.01;
        this.context.attachToWorldRoot(container, 2000);
        this.floatingTexts.push({
            container,
            age: 0,
            life: 0.0001,
            startX: -100000,
            startY: -100000,
            riseY: 0,
            driftX: 0,
        });
    }
    /** Destroy all floating numbers immediately (e.g. on fight end / restart). */
    public clear(): void {
        for (const ft of this.floatingTexts) {
            ft.container.destroy();
        }
        this.floatingTexts.length = 0;
        for (const group of this.shatterGroups) {
            group.container.destroy({ children: true });
        }
        this.shatterGroups.length = 0;
        for (const sweep of this.fireSweeps) {
            sweep.container.destroy({ children: true });
        }
        this.fireSweeps.length = 0;
        for (const chain of this.chainLightnings) {
            chain.container.destroy({ children: true });
        }
        this.chainLightnings.length = 0;
    }
    public update(dt: number) {
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.age += dt;
            const t = ft.age / ft.life;
            if (t >= 1) {
                ft.container.destroy();
                this.floatingTexts.splice(i, 1);
                continue;
            }

            // Decelerating rise + slight horizontal drift (feels like it's thrown up and settles).
            const e = easeOutCubic(t);
            ft.container.x = ft.startX + ft.driftX * e;
            ft.container.y = ft.startY + ft.riseY * e;

            // Spawn "pop" (slight overshoot), preserving the Y-up flip (negative scale.y).
            let scale = 1;
            if (ft.age < FT_POP_DUR) {
                scale = FT_START_SCALE + (1 - FT_START_SCALE) * easeOutBack(ft.age / FT_POP_DUR);
            }
            ft.container.scale.set(scale, -scale);

            // Fade in quickly, hold, then fade out smoothly.
            let alpha = 1;
            if (ft.age < FT_FADE_IN) {
                alpha = ft.age / FT_FADE_IN;
            } else if (t > FT_FADE_OUT_FROM) {
                alpha = 1 - (t - FT_FADE_OUT_FROM) / (1 - FT_FADE_OUT_FROM);
            }
            ft.container.alpha = Math.max(0, Math.min(1, alpha));
        }

        this.stepShatters(dt);
        this.stepFireSweeps(dt);
        this.stepChainLightnings(dt);
    }
    /**
     * "Broken mirror" death effect: slice the unit's current texture into a grid of shards that
     * start in place (composing the unit image), then burst outward, fall, spin, and fade.
     */
    public spawnShatter(info: { texture: Texture; x: number; y: number; scaleX: number; scaleY: number }): void {
        const tex = info.texture;
        const source = tex?.source;
        const frame = tex?.frame;
        if (!source || !frame || frame.width <= 1 || frame.height <= 1) return;

        const COLS = 6;
        const ROWS = 6;
        const tileTexW = frame.width / COLS;
        const tileTexH = frame.height / ROWS;
        const worldW = Math.abs(info.scaleX) * frame.width;
        const worldH = Math.abs(info.scaleY) * frame.height;
        const tileWorldW = worldW / COLS;
        const tileWorldH = worldH / ROWS;

        const container = new Container();
        container.visible = true;
        this.context.attachToWorldRoot(container, 4500);

        const group: IShatterGroup = { container, shards: [] };

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const subTex = new Texture({
                    source,
                    frame: new Rectangle(frame.x + c * tileTexW, frame.y + r * tileTexH, tileTexW, tileTexH),
                });
                const shard = new Sprite(subTex);
                shard.anchor.set(0.5);
                // Same orientation as the dying unit (scaleY carries the y-up flip).
                shard.scale.set(info.scaleX, info.scaleY);
                shard.tint = 0xffffff;
                shard.alpha = 1;
                // Texture row 0 is the top of the image; in world (y-up) that's the top of the
                // rect, so walk rows from the top down to keep the composite upright.
                const sx = info.x - worldW / 2 + (c + 0.5) * tileWorldW;
                const sy = info.y + worldH / 2 - (r + 0.5) * tileWorldH;
                shard.position.set(sx, sy);
                container.addChild(shard);

                // Outward burst from the unit centre + upward pop; pseudo-random per shard so the
                // image "shatters" instead of moving as one block.
                const ox = sx - info.x;
                const oy = sy - info.y;
                const dist = Math.hypot(ox, oy) || 1;
                const speed = 75 + Math.random() * 150 + dist * 0.75;
                const vx = (ox / dist) * speed + (Math.random() - 0.5) * 60;
                const vy = (oy / dist) * speed + 50 + Math.random() * 112; // world +y is up → upward pop
                group.shards.push({
                    sprite: shard,
                    vx,
                    vy,
                    rotSpeed: (Math.random() - 0.5) * 12,
                    delay: Math.random() * 0.04,
                    age: 0,
                    life: 0.4 + Math.random() * 0.2,
                    x: sx,
                    y: sy,
                });
            }
        }
        this.shatterGroups.push(group);
    }
    private stepShatters(dt: number): void {
        const GRAVITY = 325; // world px/s^2 pulling toward screen bottom (world -y)
        const FADE_FROM = 0.6; // start fading each shard past this fraction of its life
        for (let gi = this.shatterGroups.length - 1; gi >= 0; gi--) {
            const group = this.shatterGroups[gi];
            for (let si = group.shards.length - 1; si >= 0; si--) {
                const s = group.shards[si];
                s.age += dt;
                if (s.age < s.delay) continue;
                const tt = s.age - s.delay;
                s.vy -= GRAVITY * dt;
                s.x += s.vx * dt;
                s.y += s.vy * dt;
                s.sprite.position.set(s.x, s.y);
                s.sprite.rotation += s.rotSpeed * dt;
                const lifeT = tt / s.life;
                if (lifeT >= 1) {
                    s.sprite.destroy();
                    group.shards.splice(si, 1);
                } else if (lifeT > FADE_FROM) {
                    s.sprite.alpha = 1 - (lifeT - FADE_FROM) / (1 - FADE_FROM);
                }
            }
            if (group.shards.length === 0) {
                group.container.destroy();
                this.shatterGroups.splice(gi, 1);
            }
        }
    }
    /** Soft white→amber→transparent radial ember, drawn once and tinted per particle. */
    private getFireTexture(): Texture {
        if (this.fireTexture) {
            return this.fireTexture;
        }
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return Texture.WHITE;
        }
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0.0, "rgba(255,255,255,1)");
        grad.addColorStop(0.3, "rgba(255,238,170,0.9)");
        grad.addColorStop(0.65, "rgba(255,135,40,0.45)");
        grad.addColorStop(1.0, "rgba(255,70,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        this.fireTexture = Texture.from(canvas);
        return this.fireTexture;
    }
    /**
     * Fire Breath sweep: a wave of additive embers emitted in order along the line from `from` to `to`
     * (world coords), so the fire reads as rushing through every unit the Black Dragon's breath burns.
     * Each cluster's emission is delayed by its distance along the line (the "wave head" travels in
     * FIRE_SWEEP_MS), and each ember pops, floats up, wavers, and burns out.
     */
    public spawnFireSweep(from: HoCMath.XY, to: HoCMath.XY, cellSize: number): void {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) {
            return;
        }
        const container = new Container();
        this.context.attachToWorldRoot(container, FIRE_Z);
        const tex = this.getFireTexture();
        const texW = tex.width || 64;

        // A cluster roughly every half cell keeps the trail continuous for any line length.
        const clusters = Math.max(2, Math.round(len / Math.max(1, cellSize * 0.45)));
        const particles: IFireParticle[] = [];
        for (let ci = 0; ci <= clusters; ci++) {
            const along = ci / clusters; // 0 at the attacker, 1 at the far end of the breath
            const cx = from.x + dx * along;
            const cy = from.y + dy * along;
            const delaySec = (FIRE_LEAD_MS + along * FIRE_SWEEP_MS) / 1000;
            for (let k = 0; k < 3; k++) {
                const rand = Math.random();
                const jitter = cellSize * 0.28;
                const sprite = new Sprite(tex);
                sprite.anchor.set(0.5);
                sprite.blendMode = "add";
                sprite.tint = FIRE_TINTS[Math.floor(Math.random() * FIRE_TINTS.length)];
                sprite.scale.set(0.001);
                sprite.alpha = 0;
                sprite.visible = false;
                container.addChild(sprite);
                particles.push({
                    sprite,
                    age: -delaySec - Math.random() * 0.02,
                    life: FIRE_PARTICLE_LIFE * (0.8 + 0.4 * rand),
                    x: cx + (Math.random() - 0.5) * jitter,
                    y: cy + (Math.random() - 0.5) * jitter,
                    riseY: FIRE_RISE * (0.6 + 0.8 * rand),
                    driftX: (Math.random() - 0.5) * cellSize * 0.18,
                    baseScale: (cellSize * (0.5 + 0.45 * rand)) / texW,
                    rot: Math.random() * Math.PI * 2,
                    spin: (Math.random() - 0.5) * 5,
                });
            }
        }
        this.fireSweeps.push({ container, particles });
    }
    private stepFireSweeps(dt: number): void {
        for (let i = this.fireSweeps.length - 1; i >= 0; i--) {
            const sweep = this.fireSweeps[i];
            let anyPending = false;
            for (const p of sweep.particles) {
                p.age += dt;
                if (p.age < 0) {
                    anyPending = true; // wave hasn't reached this point yet
                    continue;
                }
                if (p.age >= p.life) {
                    if (p.sprite.visible) {
                        p.sprite.visible = false;
                    }
                    continue;
                }
                anyPending = true;
                const t = p.age / p.life;
                const e = easeOutCubic(t);
                p.sprite.visible = true;
                p.sprite.position.set(p.x + p.driftX * e, p.y + p.riseY * e);
                // Snap in over the first 10% of life (so it ignites instantly with the strike), then
                // shrink as it burns out.
                const scale =
                    t < 0.1 ? p.baseScale * (0.45 + 0.55 * (t / 0.1)) : p.baseScale * (1 - 0.55 * ((t - 0.1) / 0.9));
                p.sprite.scale.set(scale, scale);
                p.rot += p.spin * dt;
                p.sprite.rotation = p.rot;
                // Near-instant flare in, smooth fade out.
                const alpha = t < 0.07 ? t / 0.07 : 1 - (t - 0.07) / 0.93;
                p.sprite.alpha = Math.max(0, Math.min(1, alpha));
            }
            if (!anyPending) {
                sweep.container.destroy({ children: true });
                this.fireSweeps.splice(i, 1);
            }
        }
    }
    /**
     * Chain Lightning arc: a purple bolt jumps from the attacker to the target and then on through
     * each chained enemy, one jump after another (CHAIN_JUMP_MS apart), so it reads as electricity
     * arcing through the units the chain hits. `points` is the ordered path of world centers
     * [attacker, target, chained…]; each consecutive pair gets a crackling bolt.
     */
    public spawnChainLightning(points: HoCMath.XY[], cellSize: number): void {
        if (points.length < 2) {
            return;
        }
        const container = new Container();
        this.context.attachToWorldRoot(container, CHAIN_Z);
        const bolts: IChainBolt[] = [];
        for (let i = 0; i < points.length - 1; i++) {
            const gfx = new Graphics();
            gfx.blendMode = "add";
            gfx.visible = false;
            container.addChild(gfx);
            bolts.push({
                gfx,
                from: points[i],
                to: points[i + 1],
                cellSize,
                age: -(CHAIN_LEAD_MS + i * CHAIN_JUMP_MS) / 1000,
                life: CHAIN_BOLT_LIFE,
                flicker: CHAIN_FLICKER_S, // force a draw on the first visible tick
            });
        }
        this.chainLightnings.push({ container, bolts });
    }
    /** Redraw a jagged purple bolt between two points (stacked strokes: glow + mid + hot core). */
    private drawChainBolt(gfx: Graphics, from: HoCMath.XY, to: HoCMath.XY, cellSize: number): void {
        gfx.clear();
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len; // unit perpendicular to the bolt
        const ny = dx / len;
        const segments = Math.max(4, Math.round(len / (cellSize * 0.5)));
        const amp = Math.min(cellSize * 0.4, len * 0.2);
        const pts: HoCMath.XY[] = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const taper = Math.sin(Math.PI * t); // 0 at both ends so the bolt connects cleanly
            const off = (Math.random() - 0.5) * 2 * amp * taper;
            pts.push({ x: from.x + dx * t + nx * off, y: from.y + dy * t + ny * off });
        }
        const trace = () => {
            gfx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                gfx.lineTo(pts[i].x, pts[i].y);
            }
        };
        trace();
        gfx.stroke({ width: cellSize * 0.17, color: CHAIN_GLOW, alpha: 0.3, cap: "round", join: "round" });
        trace();
        gfx.stroke({ width: cellSize * 0.08, color: CHAIN_MID, alpha: 0.7, cap: "round", join: "round" });
        trace();
        gfx.stroke({ width: cellSize * 0.03, color: CHAIN_CORE, alpha: 1, cap: "round", join: "round" });
    }
    private stepChainLightnings(dt: number): void {
        for (let i = this.chainLightnings.length - 1; i >= 0; i--) {
            const chain = this.chainLightnings[i];
            let anyPending = false;
            for (const bolt of chain.bolts) {
                bolt.age += dt;
                if (bolt.age < 0) {
                    anyPending = true; // the chain hasn't reached this jump yet
                    continue;
                }
                if (bolt.age >= bolt.life) {
                    if (bolt.gfx.visible) {
                        bolt.gfx.visible = false;
                    }
                    continue;
                }
                anyPending = true;
                bolt.gfx.visible = true;
                // Re-jag periodically so the bolt crackles instead of sitting as a static zig-zag.
                bolt.flicker += dt;
                if (bolt.flicker >= CHAIN_FLICKER_S) {
                    bolt.flicker = 0;
                    this.drawChainBolt(bolt.gfx, bolt.from, bolt.to, bolt.cellSize);
                }
                // Bright flash, then fade out, with a little random crackle in the brightness.
                const t = bolt.age / bolt.life;
                const envelope = t < 0.18 ? 1 : 1 - (t - 0.18) / 0.82;
                bolt.gfx.alpha = Math.max(0, envelope) * (0.7 + Math.random() * 0.3);
            }
            if (!anyPending) {
                chain.container.destroy({ children: true });
                this.chainLightnings.splice(i, 1);
            }
        }
    }
    public showFloatingDamage(
        pos: HoCMath.XY,
        amount: number,
        direction?: HoCMath.XY,
        unitsDied?: number,
        fill = "#ff3333",
        stroke = "#4a0000",
    ): void {
        const container = new Container();

        // 1. Damage Text (style is cached + prewarmed; see getDamageStyle/prewarm)
        const textStyle = this.getDamageStyle(fill, stroke);

        const damageText = new PixiText({ text: `-${amount}`, style: textStyle });
        damageText.anchor.set(0.5);
        container.addChild(damageText);

        // 2. Skull + Count if units died
        if (unitsDied && unitsDied > 0) {
            const skullTex = Texture.from(images.skull || "/skull.webp");
            const skullSprite = new Sprite(skullTex);
            skullSprite.anchor.set(0.5);
            skullSprite.width = 40;
            skullSprite.height = 40;

            const countStyle = this.getCountStyle();
            const countText = new PixiText({ text: `${unitsDied}`, style: countStyle });
            countText.anchor.set(0.5);

            const lineY = 55;
            skullSprite.position.set(-25, lineY);
            countText.position.set(25, lineY);

            container.addChild(skullSprite, countText);
        }

        // Anti-overlap: if numbers are already floating near this spot, stack this one
        // above them instead of drawing on top.
        const baseX = pos.x;
        const baseY = pos.y + 20;
        let stack = 0;
        for (const other of this.floatingTexts) {
            const dx = other.container.x - baseX;
            const dy = other.container.y - baseY;
            if (dx * dx + dy * dy < FT_STACK_DIST * FT_STACK_DIST) stack++;
        }

        const startX = baseX;
        const startY = baseY + stack * FT_STACK_STEP;

        // Mostly-upward float with a small horizontal drift in the hit direction.
        let driftX = 0;
        if (direction) {
            const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
            if (len > 0.001) driftX = (direction.x / len) * FT_DRIFT;
        }
        // Slight alternating fan so stacked numbers don't form a rigid column.
        if (stack > 0) driftX += (stack % 2 === 0 ? 1 : -1) * 10 * stack;

        // Initial transform; update() animates the pop/rise/fade from here.
        container.scale.set(FT_START_SCALE, -FT_START_SCALE);
        container.alpha = 0;
        container.position.set(startX, startY);

        this.context.attachToWorldRoot(container, 2000);

        this.floatingTexts.push({
            container,
            age: 0,
            life: FT_LIFE,
            startX,
            startY,
            riseY: FT_RISE,
            driftX,
        });
    }
    public showDamageVisualsFromDiff(
        preState: Map<string, { hp: number; amount: number }>,
        attackerCell?: HoCMath.XY,
        ignoredUnitIds?: Set<string>,
        forcedDirection?: HoCMath.XY,
    ): void {
        const gs = this.context.getGridSettings();
        const unitsHolder = this.context.getUnitsHolder();

        for (const [id, oldState] of preState) {
            if (ignoredUnitIds && ignoredUnitIds.has(id)) {
                console.log(`[DEBUG] showDamageVisualsFromDiff: Ignoring ${id}`);
                continue;
            } else if (ignoredUnitIds) {
                console.log(
                    `[DEBUG] showDamageVisualsFromDiff: Processing ${id} (Not in ignored: ${Array.from(ignoredUnitIds).join(",")})`,
                );
            }

            const u = unitsHolder.getAllUnits().get(id);
            if (!u) continue;

            const newTotal = u.getCumulativeHp();

            if (newTotal < oldState.hp) {
                const diff = oldState.hp - newTotal;
                const unitsDied = Math.max(0, oldState.amount - u.getAmountAlive());

                let direction: HoCMath.XY | undefined = forcedDirection;
                if (!direction && attackerCell) {
                    const attPos = GridMath.getPositionForCell(
                        attackerCell,
                        gs.getMinX(),
                        gs.getStep(),
                        gs.getHalfStep(),
                    );
                    if (attPos) {
                        const center = u instanceof RenderableUnit ? u.getVisualCenter(gs) : u.getPosition();
                        direction = { x: center.x - attPos.x, y: center.y - attPos.y };
                    }
                }

                const center = u instanceof RenderableUnit ? u.getVisualCenter(gs) : u.getPosition();
                // console.log(`[DEBUG] showDamageVisualsFromDiff: Showing damage for ${id}, diff=${diff}`);
                this.showFloatingDamage(center, diff, direction, unitsDied);

                // UI Update logic
                const sc_selectedUnitProperties = this.context.getSelectedUnitProperties();
                if (sc_selectedUnitProperties && sc_selectedUnitProperties.id === id) {
                    this.context.updateSelectedUnitProperties({ ...u.getUnitProperties() });
                    this.context.setUnitPropertiesUpdateNeeded(true);
                }
            }
        }
    }
    public captureHealthState(): Map<string, { hp: number; maxHp: number; amount: number; pos: HoCMath.XY }> {
        const m = new Map<string, { hp: number; maxHp: number; amount: number; pos: HoCMath.XY }>();
        const units = this.context.getUnitsHolder().getAllUnits().values();
        for (const u of units) {
            m.set(u.getId(), {
                hp: u.getHp(),
                maxHp: u.getMaxHp(),
                amount: u.getAmountAlive(),
                pos: { ...u.getPosition() },
            });
        }
        return m;
    }
}
