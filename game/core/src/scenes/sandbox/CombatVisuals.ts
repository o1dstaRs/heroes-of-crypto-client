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
    driftY: number;
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

interface IIceCrystal {
    node: Graphics;
    x: number;
    y: number;
    vx: number;
    vy: number;
    spin: number;
    delay: number;
    life: number;
    gravity: number;
    drag: number;
    large: boolean;
}

interface IIceBreak {
    container: Container;
    body: Sprite;
    iceShell: Graphics;
    crackFlash: Graphics;
    crystals: IIceCrystal[];
    age: number;
    burstAt: number;
}

interface IDeathVfxInfo {
    texture: Texture;
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    frozenShellHalf?: number;
}

/** What killed a unit — recorded before its death visuals spawn so the animation can match the blow. */
export type DeathBlowKind = "melee" | "range";

interface ICleaveHalf {
    node: Container; // full unit sprite masked to one side of the cut
    vx: number;
    vy: number;
    rotSpeed: number;
}

interface ICleaveDeath {
    container: Container;
    halves: ICleaveHalf[];
    streak: Graphics; // slash flash swept along the cut, redrawn each frame
    dropsGfx: Graphics; // blood droplets shed from the rip, redrawn each frame
    drops: ISlashDrop[];
    cutU: HoCMath.XY; // unit vector along the cut line
    cutLen: number; // half-length of the flash sweep
    streakWidth: number; // base stroke width of the flash (scales with the unit)
    age: number;
    life: number;
    releaseAt: number; // when the halves let go of each other
    halfLife: number; // seconds each half lives after release
}

interface IDissolveShard {
    sprite: Sprite;
    x: number;
    y: number;
    vx: number;
    vy: number;
    delay: number; // when the erosion wave reaches this shard
    age: number;
    life: number; // seconds from release
    baseScaleX: number;
    baseScaleY: number;
    swayAmp: number; // ash-flutter lateral sway
    swayFreq: number;
    swayPhase: number;
    rotSpeed: number;
}

interface IDissolveSpark {
    sprite: Sprite;
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
}

interface IDissolveDeath {
    container: Container;
    shards: IDissolveShard[];
    tracer: Graphics; // the killing shot's streak through the body, redrawn each frame
    tracerFrom: HoCMath.XY;
    tracerTo: HoCMath.XY;
    tracerWidth: number;
    flash: Sprite; // impact flash at the unit's center
    flashScale: number;
    sparks: IDissolveSpark[]; // exit-side sparks — the shot punches THROUGH
    dirPerp: HoCMath.XY; // unit vector perpendicular to the shot — the shards' flutter axis
    age: number;
    life: number;
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

interface IForgeSpark {
    gfx: Graphics;
    x: number;
    y: number;
    vx: number;
    vy: number; // world px/s; gravity drags the spark back down after it flies off the anvil
    age: number;
    life: number;
}

interface ICraftForge {
    container: Container;
    anvil: Sprite;
    hammer: Sprite;
    sparks: IForgeSpark[];
    anvilBaseY: number;
    contactX: number; // where the hammer head lands on the anvil top (spark origin x)
    contactY: number; // where the hammer head lands on the anvil top (spark origin y)
    cellSize: number;
    age: number; // seconds since spawn
    life: number; // total seconds of the cast animation
    cycle: number; // seconds per hammer strike
    impactsDone: number; // strikes whose sparks have already fired
    impactFlash: number; // 0..1, set to 1 on each strike then decays (anvil recoil)
}

interface IEnchantMote {
    gfx: Graphics;
    ang: number; // orbit angle
    startR: number; // starting orbit radius (world px); spirals inward during the gather
}

interface IEnchant {
    container: Container; // counter-flipped (scale.y = -1) so local coords are screen-style (y down)
    ring: Graphics; // the runic ring, redrawn each frame
    icon: Sprite; // the enchant scroll icon that pops up on success
    label: PixiText; // "+N armor/attack" (success) or "Failed" (fail)
    motes: IEnchantMote[];
    sparks: IForgeSpark[]; // resolve burst (bright on success, grey ash on fail)
    iconBaseScale: number;
    tint: number;
    success: boolean;
    cellSize: number;
    age: number;
    resolved: boolean; // whether the resolve burst has fired
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

interface IWindSpear {
    container: Container;
    head: Sprite; // bright leading light orb
    trail: Sprite[]; // soft glow orbs lagging behind the head (comet-like light trail)
    pts: HoCMath.XY[]; // polyline: [attacker, primary target, unit(s) behind]
    segLens: number[]; // length of each polyline segment
    total: number; // total polyline length
    cellSize: number;
    age: number; // seconds since spawn (negative = lead delay before the thrust)
    life: number; // total seconds (travel + fade)
}

interface ISlashDrop {
    x: number;
    y: number;
    vx: number;
    vy: number; // world px/s; gravity pulls it down so the blood drips
    r: number;
    age: number;
    life: number;
}

interface ISlash {
    container: Container;
    gfx: Graphics; // wound shape + drops, redrawn each frame
    poly: HoCMath.XY[]; // jagged wound outline (closed loop)
    centerline: HoCMath.XY[]; // deepest part of the cut (bright red streak)
    drops: ISlashDrop[]; // blood droplets that drip from the wound
    age: number; // seconds since spawn
    life: number; // total seconds (covers the wound flash + the longest drip)
    woundLife: number; // how long the wound mark itself stays before it has faded
}

interface IClawMark {
    top: HoCMath.XY[]; // one tapered edge of the gash
    bot: HoCMath.XY[]; // the other tapered edge
    spine: HoCMath.XY[]; // bright centerline down the deepest part
    delay: number; // seconds this mark lags the first, so the set rakes in sequence
}

interface IClawSlash {
    container: Container;
    gfx: Graphics; // all marks, redrawn each frame (rake reveal + flare-out)
    marks: IClawMark[];
    age: number; // seconds since spawn
    life: number; // total seconds on screen
}

interface IDebuffPop {
    container: Container;
    age: number;
    life: number;
    startX: number;
    startY: number;
    riseY: number;
}

interface IAbilitySteal {
    container: Container;
    web: Graphics;
    rings: Graphics;
    payload: Container;
    payloadGlow: Sprite;
    trail: Sprite[];
    stolenLabel: PixiText;
    from: HoCMath.XY;
    to: HoCMath.XY;
    control: HoCMath.XY;
    cellSize: number;
    age: number;
    life: number;
    arrived: boolean;
    onArrival?: () => void;
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

// Tuning for the applied-debuff pop — a spell icon + name that pops over a unit when a debuff lands
// (e.g. Beholder's Spit Ball applying Sadness / Quagmire / Weakness). Lives a touch longer than a
// damage number so the icon + name are readable, then drifts up and fades.
const DP_LIFE = 0.95; // seconds on screen (kept short so the icon + name evaporate briskly)
const DP_RISE = 64; // world px the pop floats up over its life
const DP_POP_DUR = 0.2; // seconds of the spawn "pop" (icon scales in with overshoot)
const DP_START_SCALE = 0.25; // scale the pop springs in from
const DP_FADE_IN = 0.1; // seconds to fade in
const DP_FADE_OUT_FROM = 0.48; // fraction of life after which it fades out (earlier = quicker evaporate)
const DP_Z = 2100; // above the damage numbers (2000) so the debuff reads on top

// Tuning for Predatory Assimilation's ability transfer. Three lime strands cinch the stolen card out
// of the victim and carry it into Arachna Queen. The palette deliberately matches the permanent
// STOLEN overlay in the sidebar so the board moment and the resulting unit state read as one mechanic.
const ABILITY_STEAL_Z = 2180;
const ABILITY_STEAL_LIFE = 0.82;
const ABILITY_STEAL_TRAVEL = 0.46;
const ABILITY_STEAL_WEB_REVEAL = 0.16;
const ABILITY_STEAL_FADE_FROM = 0.54;
const ABILITY_STEAL_TINT = 0x9acd32;
const ABILITY_STEAL_CORE = 0xf2ffd0;
const ABILITY_STEAL_TRAIL_COUNT = 6;

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
const POISON_PARTICLE_LIFE = 0.95; // seconds each toxic puff lingers (longer than an ember — gas hangs)
const POISON_RISE = 44; // world px a puff floats up over its life (gas rises further than embers)
const POISON_TINTS = [0x9be15a, 0x6fd23a, 0x4caf2e, 0xbdf06a]; // toxic lime → poison green

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

// Tuning for Pikeman's Skewer Strike — a soft ORB of LIGHT that glides from the attacker through the
// primary target and the unit(s) standing behind it (jolting each as it passes), so a two-unit pierce
// reads at a glance. Fires the instant the strike lands (no lead); a glow trail follows, then it fades.
const WINDSPEAR_LEAD_MS = 0; // fire immediately with the strike — no delay
const WINDSPEAR_TRAVEL_MS = 190; // time for the light to glide the whole pierce line
const WINDSPEAR_FADE_MS = 150; // glow dissipation after the light reaches the end
const WINDSPEAR_Z = 1955; // just above chain lightning (1950), below the damage numbers (2000)
const WINDSPEAR_TINT = 0xdff4ff; // soft cyan-white light
const WINDSPEAR_TRAIL_COUNT = 7; // soft glow orbs trailing the head
const WINDSPEAR_HEAD_CELLS = 0.95; // head orb diameter in cells
const WINDSPEAR_TRAIL_SPACING = 0.32; // gap (cells) between successive trail orbs behind the head

// Tuning for Shatter Armor — a single bloody GASH torn across the struck enemy at impact, at a random
// angle, then it fades while a few droplets of blood drip down. An irregular, tapered, slightly-curved
// shape (not a clean line) reads as an open wound rather than a drawn stroke.
const SLASH_Z = 2050; // over the unit sprite (~1000), about level with the damage numbers
const CRAFT_Z = 2060; // Craft's anvil/hammer, just over the slash layer
const CRAFT_FORGE_LIFE = 1.5; // seconds — the full Craft cast animation (snappy)
const CRAFT_STRIKE_CYCLE = 0.42; // seconds per hammer strike (~3 strikes across the cast)
const CRAFT_HAMMER_RAISED_ANGLE = -0.45;
const CRAFT_HAMMER_IMPACT_ANGLE = -2.1;
const ENCHANT_Z = 2066; // Armor Rune/Weapon attempt-then-resolve VFX, just over the craft forge
const ENCHANT_LIFE = 1.45; // seconds — full attempt -> resolve
const ENCHANT_GATHER = 0.5; // seconds of the "trying" gather before it resolves (caller passes the per-spell tint)
const SLASH_WOUND_LIFE = 0.5; // seconds the gash itself stays before it has faded
const SLASH_DROP_LIFE = 0.85; // a blood droplet's max life as it drips and fades
const SLASH_GRAVITY = 1000; // world px/s^2 pulling droplets down (the drip)
const SLASH_FILL = 0x8a0000; // blood-red wound fill
const SLASH_RIM = 0x300000; // near-black-red torn edge
const SLASH_CORE = 0xe00000; // bright red deepest part of the cut
const SLASH_DROP = 0xa80000; // dripping blood droplets

// Tuning for the Deep Wounds "claw rake" — Ursa-style glowing orange claw marks that streak across the
// target as the debuff lands. Snappy: each mark rakes in fast (staggered so they read as a swipe), holds,
// then flares out. The mark count + rake width scale with the effect's power (Deep Wounds L1→L3, which
// also stacks), so a deeper wound reads as a bigger, angrier claw.
const CLAW_Z = 2120; // above the debuff pop (2100) so the rake reads on top of the icon
const CLAW_LIFE = 0.5; // seconds the whole rake lives
const CLAW_RAKE_DUR = 0.13; // seconds for one mark to streak to full length
const CLAW_STAGGER = 0.035; // seconds each successive mark lags → they rake in sequence
const CLAW_FADE_FROM = 0.5; // fraction of life after which the marks flare out
const CLAW_GLOW = 0xff6a14; // outer orange glow (the torn flesh)
const CLAW_MID = 0xff9a3a; // mid flame-orange body
const CLAW_CORE = 0xffe6b0; // hot near-white core down each gash

// Tuning for the MELEE death "cleave" — the killing blow tears the dying stack in TWO along a jagged,
// near-vertical rip: a white-hot slash flash sweeps the cut first, the body holds together for a beat
// (so the eye registers the intact unit + flash), then the halves let go — shoved apart and away from
// the attacker, toppling under gravity while a few drops of blood shed from the rip. Reads heavy and
// physical, unlike the mirror shatter's 36-piece radial burst.
const CLEAVE_Z = 4500; // same layer as the mirror shatter
const CLEAVE_RELEASE_S = 0.09; // beat between the flash and the halves letting go
const CLEAVE_HALF_LIFE = 0.72; // seconds each half lives after release (fall + fade)
const CLEAVE_FADE_FROM = 0.5; // fraction of a half's life after which it fades out
const CLEAVE_GRAVITY = 700; // world px/s^2 — the halves are heavy; they drop faster than mirror shards
const CLEAVE_STREAK_LIFE = 0.22; // seconds the slash flash lives in total
const CLEAVE_STREAK_SWEEP_S = 0.07; // seconds for the flash tip to sweep the full cut
const CLEAVE_DROP_GRAVITY = 900; // world px/s^2 on the shed blood droplets
const CLEAVE_GLOW = 0xff4a26; // outer hot-red glow of the slash flash
const CLEAVE_MID = 0xffb199; // mid warm body
const CLEAVE_CORE = 0xffffff; // white-hot core

// Tuning for the RANGE death "dissolve" — the killing shot punches THROUGH the stack: a pale-gold
// tracer streak + impact flash first, then the body erodes into a wave of shards that release from the
// entry side through to the exit side, carried along the shot's direction, slowing under drag and
// fluttering down like ash (lateral sway, shrink, soft fade) while a few sparks fly out the far side.
// Directional and airy where the mirror shatter is radial and the cleave is heavy.
const DISSOLVE_Z = 4500;
const DISSOLVE_COLS = 8;
const DISSOLVE_ROWS = 8;
const DISSOLVE_WAVE_S = 0.2; // seconds for the erosion wave to cross the whole body
const DISSOLVE_WAVE_JITTER_S = 0.02; // per-shard wavefront noise — small, so the front stays crisp
const DISSOLVE_LIFE_MIN = 0.55; // a shard's minimum life once released
const DISSOLVE_LIFE_VAR = 0.3;
const DISSOLVE_FADE_FROM = 0.45; // fraction of a shard's life after which it fades
// Shard speeds scale with the BODY SIZE (not absolute px) so the debris is visibly thrown along the
// shot for units of any size: at speed ≈ 2-3.6 bodies/s with this drag, a shard travels roughly a
// body length or two along the shot line before the ash-fall takes over — the angle must READ.
const DISSOLVE_SPEED_MIN = 2.0; // body-lengths/s carried along the shot at release
const DISSOLVE_SPEED_VAR = 1.6;
const DISSOLVE_CONE = 0.55; // perpendicular spread as a fraction of the body — tight = directional
const DISSOLVE_DRAG = 2.0; // 1/s exponential decay of shard velocity — the burst slows into a drift
const DISSOLVE_SINK = 110; // world px/s^2 gentle pull down once the burst has slowed (ash fall)
const DISSOLVE_TRACER_LIFE = 0.18; // seconds the shot streak stays
const DISSOLVE_FLASH_LIFE = 0.2; // seconds the impact flash stays
const DISSOLVE_TRACER_TINT = 0xffe9c2; // pale hot gold — a physical shot, not a spell
const DISSOLVE_SPARK_TINT = 0xffe9b8;

// Frozen death: the intact icy body cracks for one beat, then releases a mixture of heavy crystal chunks
// and quick splinters. Different size/physics bands keep it from reading as a uniform particle explosion.
const ICE_BREAK_Z = 4550;
const ICE_BREAK_BURST_S = 0.085;
const ICE_BREAK_COLORS = [0x91d8ff, 0xbdeaff, 0x6fc5f2, 0xd9f6ff] as const;

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
    private iceBreaks: IIceBreak[] = [];
    private cleaveDeaths: ICleaveDeath[] = [];
    private dissolveDeaths: IDissolveDeath[] = [];
    // Kill attribution, keyed by the dying unit's id: noted from the lethal attack event (only units
    // in unitIdsDied land here), consumed by spawnDeathVfx when the death visuals spawn.
    private deathBlowByUnitId = new Map<string, { kind: DeathBlowKind; dir?: HoCMath.XY }>();
    private fireSweeps: IFireSweep[] = [];
    private poisonClouds: IFireSweep[] = [];
    private chainLightnings: IChainLightning[] = [];
    private windSpears: IWindSpear[] = [];
    private slashes: ISlash[] = [];
    private clawSlashes: IClawSlash[] = [];
    private debuffPops: IDebuffPop[] = [];
    private craftForges: ICraftForge[] = [];
    private enchants: IEnchant[] = [];
    private abilitySteals: IAbilitySteal[] = [];
    private debuffStyle?: TextStyle;
    private buffStyle?: TextStyle;
    private missStyle?: TextStyle;
    private absorbedLabelStyle?: TextStyle;
    private stolenLabelStyle?: TextStyle;
    private stolenAbilityNameStyle?: TextStyle;
    // Soft radial ember texture, built once and reused for every Fire Breath sweep.
    private fireTexture?: Texture;
    private poisonTexture?: Texture;
    // Soft radial white-light texture, built once and reused for the Skewer Strike light orb + trail.
    private lightTexture?: Texture;
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
    private getDebuffStyle(): TextStyle {
        if (!this.debuffStyle) {
            this.debuffStyle = new TextStyle({
                fontFamily: "Arial",
                fontSize: 34,
                fontWeight: "900",
                fill: "#c77dff", // violet reads clearly as a debuff
                stroke: { color: "#2a0a3a", width: 5 },
                dropShadow: {
                    color: "#000000",
                    blur: 4,
                    angle: Math.PI / 6,
                    distance: 2,
                },
            });
        }
        return this.debuffStyle;
    }
    private getBuffStyle(): TextStyle {
        if (!this.buffStyle) {
            this.buffStyle = new TextStyle({
                fontFamily: "Arial",
                fontSize: 34,
                fontWeight: "900",
                fill: "#7dffb0", // green reads clearly as a buff (vs the violet debuff)
                stroke: { color: "#0a3a1c", width: 5 },
                dropShadow: {
                    color: "#000000",
                    blur: 4,
                    angle: Math.PI / 6,
                    distance: 2,
                },
            });
        }
        return this.buffStyle;
    }
    private getMissStyle(): TextStyle {
        if (!this.missStyle) {
            this.missStyle = new TextStyle({
                fontFamily: "Arial",
                fontSize: 34,
                fontWeight: "900",
                fill: "#e8eef5", // neutral cool-white — reads as "no hit", distinct from red/violet/green
                stroke: { color: "#1b2733", width: 5 },
                dropShadow: {
                    color: "#000000",
                    blur: 4,
                    angle: Math.PI / 6,
                    distance: 2,
                },
            });
        }
        return this.missStyle;
    }
    private getAbsorbedLabelStyle(): TextStyle {
        if (!this.absorbedLabelStyle) {
            this.absorbedLabelStyle = new TextStyle({
                fontFamily: "Arial",
                fontSize: 28,
                fontWeight: "900",
                fill: "#fff36d",
                stroke: { color: "#5c4600", width: 5 },
                dropShadow: {
                    color: "#000000",
                    blur: 4,
                    angle: Math.PI / 6,
                    distance: 2,
                },
            });
        }
        return this.absorbedLabelStyle;
    }
    private getStolenLabelStyle(): TextStyle {
        if (!this.stolenLabelStyle) {
            this.stolenLabelStyle = new TextStyle({
                fontFamily: "Arial",
                fontSize: 34,
                fontWeight: "900",
                fill: "#d7ff66",
                stroke: { color: "#172400", width: 6 },
                dropShadow: {
                    color: "#000000",
                    blur: 5,
                    angle: Math.PI / 6,
                    distance: 2,
                },
            });
        }
        return this.stolenLabelStyle;
    }
    private getStolenAbilityNameStyle(): TextStyle {
        if (!this.stolenAbilityNameStyle) {
            this.stolenAbilityNameStyle = new TextStyle({
                fontFamily: "Arial",
                fontSize: 20,
                fontWeight: "900",
                fill: "#f4ffd7",
                stroke: { color: "#172400", width: 4 },
                dropShadow: {
                    color: "#000000",
                    blur: 4,
                    angle: Math.PI / 6,
                    distance: 2,
                },
            });
        }
        return this.stolenAbilityNameStyle;
    }
    /** Put an upright container into the shared damage/MISS rise, drift, pop and fade animation. */
    private enqueueFloatingContainer(container: Container, pos: HoCMath.XY, direction?: HoCMath.XY): void {
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

        // Drift along the full hit trajectory (both axes), with a small alternating fan for stacked text.
        let driftX = 0;
        let driftY = 0;
        if (direction) {
            const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
            if (len > 0.001) {
                driftX = (direction.x / len) * FT_DRIFT;
                driftY = (direction.y / len) * FT_DRIFT;
            }
        }
        if (stack > 0) driftX += (stack % 2 === 0 ? 1 : -1) * 10 * stack;

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
            driftY,
        });
    }
    /**
     * Pop a "MISS" label over a unit that dodged an attack (Dodge / Small Specie / Boar Saliva). Reuses
     * the floating-text rise/fade so it reads like a damage number but in neutral white. Drifts along the
     * attack line when a direction is given. Same path in sandbox and ranked.
     */
    public showMissLabel(pos: HoCMath.XY, direction?: HoCMath.XY): void {
        const container = new Container();
        const label = new PixiText({ text: "MISS", style: this.getMissStyle() });
        label.anchor.set(0.5);
        container.addChild(label);
        this.enqueueFloatingContainer(container, pos, direction);
    }
    /**
     * Craft "failed" result: a plain dark-grey "No effect!" label with NO icon, reusing the floating-text
     * rise/fade. Deliberately unlike the icon pops used for a successful craft so a dud reads as nothing.
     */
    public showCraftFail(pos: HoCMath.XY): void {
        const container = new Container();
        const label = new PixiText({
            text: "No effect!",
            style: new TextStyle({
                fontFamily: "Arial",
                fontSize: 30,
                fontWeight: "900",
                fill: "#4a4a4a", // muted dark grey — "nothing happened"
                stroke: { color: "#dfe4ea", width: 4 }, // light halo so it reads on a dark board
                dropShadow: { color: "#000000", blur: 3, angle: Math.PI / 6, distance: 2 },
            }),
        });
        label.anchor.set(0.5);
        container.addChild(label);
        this.enqueueFloatingContainer(container, pos);
    }
    /**
     * Show Flesh Shield damage on its owner as a positive, yellow two-line value. The label distinguishes
     * redirected damage from an ordinary hit while the shared floating-text lifecycle keeps both paths in
     * visual sync. `unitsDied` belongs only to this absorbed chunk, so its skull never duplicates a primary
     * or response hit's losses.
     */
    public showFloatingAbsorbed(pos: HoCMath.XY, amount: number, direction?: HoCMath.XY, unitsDied?: number): void {
        const container = new Container();
        const label = new PixiText({ text: "ABSORBED", style: this.getAbsorbedLabelStyle() });
        label.anchor.set(0.5);
        label.position.set(0, -34);

        const amountText = new PixiText({
            text: `${amount}`,
            style: this.getDamageStyle("#fff36d", "#5c4600"),
        });
        amountText.anchor.set(0.5);
        amountText.position.set(0, 16);
        container.addChild(label, amountText);

        if (unitsDied && unitsDied > 0) {
            const skullTex = Texture.from(images.skull || "/skull.webp");
            const skullSprite = new Sprite(skullTex);
            skullSprite.anchor.set(0.5);
            skullSprite.width = 40;
            skullSprite.height = 40;

            const countText = new PixiText({ text: `${unitsDied}`, style: this.getCountStyle() });
            countText.anchor.set(0.5);
            skullSprite.position.set(-25, 72);
            countText.position.set(25, 72);
            container.addChild(skullSprite, countText);
        }

        this.enqueueFloatingContainer(container, pos, direction);
    }
    /**
     * Pop a freshly-applied effect's spell icon + name over a unit. `kind` only changes the name's
     * colour — violet for a debuff (e.g. Beholder's Spit Ball landing Sadness / Quagmire / Weakness),
     * green for a buff. The icon springs in with a slight overshoot, the icon + name drift up together
     * and evaporate. `stackIndex` lifts each extra effect from the same shot so they don't overlap.
     */
    public spawnDebuffPop(
        pos: HoCMath.XY,
        iconTexture: Texture,
        name: string,
        stackIndex = 0,
        kind: "debuff" | "buff" = "debuff",
    ): void {
        const cell = this.context.getGridSettings().getCellSize();
        const container = new Container();

        const iconSize = cell * 0.72;
        const icon = new Sprite(iconTexture);
        icon.anchor.set(0.5);
        icon.width = iconSize;
        icon.height = iconSize;

        const label = new PixiText({
            text: name,
            style: kind === "buff" ? this.getBuffStyle() : this.getDebuffStyle(),
        });
        label.anchor.set(0.5);
        // Sits just under the icon. The container is Y-flipped (see scale below), matching the
        // floating-damage convention where a positive child-y renders below its anchor.
        label.position.set(0, iconSize * 0.62);

        container.addChild(icon, label);

        const startX = pos.x;
        const startY = pos.y + cell * 0.55 + stackIndex * cell * 0.5;
        container.position.set(startX, startY);
        // Counter the world root's Y-up flip so the icon + text render upright (same as floating text).
        container.scale.set(DP_START_SCALE, -DP_START_SCALE);
        this.context.attachToWorldRoot(container, DP_Z);

        this.debuffPops.push({ container, age: 0, life: DP_LIFE, startX, startY, riseY: DP_RISE });
    }
    /**
     * Predatory Assimilation: pull the stolen ability out of the victim and into Arachna Queen. A
     * three-strand web briefly connects the units while the ability card rides a lime glow along a
     * curved path. `onArrival` lets the scene flash the Queen exactly when the card reaches her.
     */
    public spawnAbilitySteal(
        from: HoCMath.XY,
        to: HoCMath.XY,
        cellSize: number,
        abilityName: string,
        iconTexture?: Texture,
        onArrival?: () => void,
    ): void {
        if (Math.hypot(to.x - from.x, to.y - from.y) < 1) {
            onArrival?.();
            return;
        }

        const container = new Container();
        const web = new Graphics();
        const rings = new Graphics();
        web.blendMode = "add";
        rings.blendMode = "add";
        container.addChild(web, rings);

        const lightTexture = this.getLightTexture();
        const trail: Sprite[] = [];
        for (let i = 0; i < ABILITY_STEAL_TRAIL_COUNT; i++) {
            const mote = new Sprite(lightTexture);
            mote.anchor.set(0.5);
            mote.blendMode = "add";
            mote.tint = ABILITY_STEAL_TINT;
            mote.visible = false;
            container.addChild(mote);
            trail.push(mote);
        }

        // Counter-flip this payload against the y-up world root so the stolen card and its name remain
        // upright while moving in world coordinates. The glow itself is radial, so the flip is invisible.
        const payload = new Container();
        const payloadGlow = new Sprite(lightTexture);
        payloadGlow.anchor.set(0.5);
        payloadGlow.blendMode = "add";
        payloadGlow.tint = ABILITY_STEAL_TINT;
        payloadGlow.width = cellSize * 1.05;
        payloadGlow.height = cellSize * 1.05;
        payload.addChild(payloadGlow);

        const iconSize = cellSize * 0.5;
        if (iconTexture && iconTexture !== Texture.EMPTY) {
            const icon = new Sprite(iconTexture);
            icon.anchor.set(0.5);
            icon.width = iconSize;
            icon.height = iconSize;
            const frame = new Graphics();
            frame.roundRect(-iconSize * 0.54, -iconSize * 0.54, iconSize * 1.08, iconSize * 1.08, iconSize * 0.14);
            frame.stroke({ width: Math.max(2, cellSize * 0.035), color: ABILITY_STEAL_CORE, alpha: 0.95 });
            payload.addChild(icon, frame);
        }

        const abilityLabel = new PixiText({ text: abilityName, style: this.getStolenAbilityNameStyle() });
        abilityLabel.anchor.set(0.5);
        abilityLabel.position.set(0, iconTexture ? iconSize * 0.82 : 0);
        const maxLabelWidth = cellSize * 1.75;
        // Avoid asking Pixi to rasterize/measure the text here (which would make the rare first steal
        // pay that cost on its impact frame and breaks headless tests). Arial Black at 20px averages
        // roughly 11px per character; this estimate is only used to cap unusually long names.
        const estimatedLabelWidth = abilityName.length * 11;
        if (estimatedLabelWidth > maxLabelWidth) {
            abilityLabel.scale.set(maxLabelWidth / estimatedLabelWidth);
        }
        payload.addChild(abilityLabel);
        payload.scale.set(0.45, -0.45);
        container.addChild(payload);

        const stolenLabel = new PixiText({ text: "STOLEN", style: this.getStolenLabelStyle() });
        stolenLabel.anchor.set(0.5);
        stolenLabel.position.set(from.x, from.y + cellSize * 0.62);
        stolenLabel.scale.set(0.5, -0.5);
        stolenLabel.alpha = 0;
        container.addChild(stolenLabel);

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy);
        const nx = -dy / len;
        const ny = dx / len;
        const bend = Math.min(cellSize * 0.72, len * 0.24);
        // Alternate the bend deterministically by direction so repeated steals do not always bow toward
        // the same screen edge, while both ranked clients still render the exact same path.
        const bendSign = dx * dy >= 0 ? 1 : -1;
        const control = {
            x: (from.x + to.x) * 0.5 + nx * bend * bendSign,
            y: (from.y + to.y) * 0.5 + ny * bend * bendSign,
        };

        this.context.attachToWorldRoot(container, ABILITY_STEAL_Z);
        this.abilitySteals.push({
            container,
            web,
            rings,
            payload,
            payloadGlow,
            trail,
            stolenLabel,
            from: { ...from },
            to: { ...to },
            control,
            cellSize,
            age: 0,
            life: ABILITY_STEAL_LIFE,
            arrived: false,
            onArrival,
        });
    }
    private abilityStealPoint(steal: IAbilitySteal, t: number, strand = 0): HoCMath.XY {
        const clamped = Math.max(0, Math.min(1, t));
        const oneMinus = 1 - clamped;
        const x =
            oneMinus * oneMinus * steal.from.x +
            2 * oneMinus * clamped * steal.control.x +
            clamped * clamped * steal.to.x;
        const y =
            oneMinus * oneMinus * steal.from.y +
            2 * oneMinus * clamped * steal.control.y +
            clamped * clamped * steal.to.y;
        if (!strand) {
            return { x, y };
        }
        const tx = 2 * oneMinus * (steal.control.x - steal.from.x) + 2 * clamped * (steal.to.x - steal.control.x);
        const ty = 2 * oneMinus * (steal.control.y - steal.from.y) + 2 * clamped * (steal.to.y - steal.control.y);
        const tangentLength = Math.hypot(tx, ty) || 1;
        const taper = Math.sin(Math.PI * clamped);
        const webWidth = steal.cellSize * 0.13 * taper;
        const wobble = Math.sin(clamped * Math.PI * 5 + strand * 1.7) * steal.cellSize * 0.022 * taper;
        const offset = strand * webWidth + wobble;
        return { x: x + (-ty / tangentLength) * offset, y: y + (tx / tangentLength) * offset };
    }
    private traceAbilityStealStrand(steal: IAbilitySteal, strand: number, reveal: number): void {
        const segments = 24;
        const first = this.abilityStealPoint(steal, 0, strand);
        steal.web.moveTo(first.x, first.y);
        const visibleSegments = Math.max(1, Math.ceil(segments * reveal));
        for (let i = 1; i <= visibleSegments; i++) {
            const t = Math.min(reveal, i / segments);
            const point = this.abilityStealPoint(steal, t, strand);
            steal.web.lineTo(point.x, point.y);
        }
    }
    private drawAbilityStealWeb(steal: IAbilitySteal, reveal: number, alpha: number): void {
        steal.web.clear();
        for (const strand of [-1, 0, 1]) {
            this.traceAbilityStealStrand(steal, strand, reveal);
            steal.web.stroke({
                width: steal.cellSize * 0.06,
                color: ABILITY_STEAL_TINT,
                alpha: alpha * 0.25,
                cap: "round",
                join: "round",
            });
            this.traceAbilityStealStrand(steal, strand, reveal);
            steal.web.stroke({
                width: Math.max(1.5, steal.cellSize * 0.016),
                color: strand === 0 ? ABILITY_STEAL_CORE : ABILITY_STEAL_TINT,
                alpha: alpha * (strand === 0 ? 0.95 : 0.72),
                cap: "round",
                join: "round",
            });
        }

        // Short cross-threads make the tether read as Arachna's web rather than a generic spell beam.
        for (let t = 0.14; t < reveal; t += 0.14) {
            const a = this.abilityStealPoint(steal, t, -1);
            const b = this.abilityStealPoint(steal, t, 1);
            steal.web.moveTo(a.x, a.y);
            steal.web.lineTo(b.x, b.y);
        }
        steal.web.stroke({
            width: Math.max(1, steal.cellSize * 0.01),
            color: ABILITY_STEAL_CORE,
            alpha: alpha * 0.5,
            cap: "round",
        });
    }
    private stepAbilitySteals(dt: number): void {
        for (let i = this.abilitySteals.length - 1; i >= 0; i--) {
            const steal = this.abilitySteals[i];
            steal.age += dt;
            if (!steal.arrived && steal.age >= ABILITY_STEAL_TRAVEL) {
                steal.arrived = true;
                steal.onArrival?.();
            }
            if (steal.age >= steal.life) {
                steal.container.destroy({ children: true });
                this.abilitySteals.splice(i, 1);
                continue;
            }

            const fade =
                steal.age <= ABILITY_STEAL_FADE_FROM
                    ? 1
                    : 1 - (steal.age - ABILITY_STEAL_FADE_FROM) / Math.max(0.001, steal.life - ABILITY_STEAL_FADE_FROM);
            const reveal = Math.min(1, steal.age / ABILITY_STEAL_WEB_REVEAL);
            this.drawAbilityStealWeb(steal, reveal, Math.max(0, fade));

            const travelProgress = Math.min(1, steal.age / ABILITY_STEAL_TRAVEL);
            const easedTravel = easeOutCubic(travelProgress);
            const payloadPoint = this.abilityStealPoint(steal, easedTravel);
            steal.payload.position.set(payloadPoint.x, payloadPoint.y);
            const pop = Math.min(1, steal.age / 0.14);
            const payloadScale = 0.45 + 0.55 * easeOutBack(pop);
            steal.payload.scale.set(payloadScale, -payloadScale);
            steal.payload.alpha = Math.max(0, fade);
            steal.payloadGlow.rotation += dt * 2.8;
            steal.payloadGlow.alpha = 0.72 + Math.sin(steal.age * 28) * 0.2;

            for (let trailIndex = 0; trailIndex < steal.trail.length; trailIndex++) {
                const mote = steal.trail[trailIndex];
                const p = travelProgress - (trailIndex + 1) * 0.055;
                if (p <= 0 || fade <= 0) {
                    mote.visible = false;
                    continue;
                }
                const point = this.abilityStealPoint(steal, easeOutCubic(Math.min(1, p)));
                const strength = 1 - trailIndex / steal.trail.length;
                const size = steal.cellSize * (0.5 * strength + 0.16);
                mote.visible = true;
                mote.position.set(point.x, point.y);
                mote.width = size;
                mote.height = size;
                mote.alpha = fade * strength * 0.52;
            }

            const labelPop = Math.min(1, steal.age / 0.12);
            const labelScale = 0.5 + 0.5 * easeOutBack(labelPop);
            steal.stolenLabel.scale.set(labelScale, -labelScale);
            steal.stolenLabel.y = steal.from.y + steal.cellSize * (0.62 + 0.2 * easeOutCubic(steal.age / steal.life));
            steal.stolenLabel.alpha = Math.max(0, Math.min(1, steal.age / 0.07)) * fade;

            steal.rings.clear();
            const extractProgress = Math.min(1, steal.age / 0.32);
            const extractRadius = steal.cellSize * (0.58 - extractProgress * 0.3);
            steal.rings.circle(steal.from.x, steal.from.y, extractRadius);
            steal.rings.stroke({
                width: steal.cellSize * 0.045,
                color: ABILITY_STEAL_TINT,
                alpha: fade * (1 - extractProgress * 0.45),
            });
            const arrivalProgress = Math.max(
                0,
                Math.min(1, (steal.age - ABILITY_STEAL_TRAVEL * 0.72) / (steal.life - ABILITY_STEAL_TRAVEL * 0.72)),
            );
            if (arrivalProgress > 0) {
                steal.rings.circle(
                    steal.to.x,
                    steal.to.y,
                    steal.cellSize * (0.18 + 0.78 * easeOutCubic(arrivalProgress)),
                );
                steal.rings.stroke({
                    width: steal.cellSize * 0.055,
                    color: ABILITY_STEAL_CORE,
                    alpha: (1 - arrivalProgress) * 0.9,
                });
            }
        }
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
        const miss = new PixiText({ text: "MISS", style: this.getMissStyle() });
        miss.anchor.set(0.5);
        miss.position.set(0, 110);
        const absorbedLabel = new PixiText({ text: "ABSORBED", style: this.getAbsorbedLabelStyle() });
        absorbedLabel.anchor.set(0.5);
        absorbedLabel.position.set(0, 165);
        const absorbedValue = new PixiText({
            text: "0",
            style: this.getDamageStyle("#fff36d", "#5c4600"),
        });
        absorbedValue.anchor.set(0.5);
        absorbedValue.position.set(0, 210);
        const stolenLabel = new PixiText({ text: "STOLEN", style: this.getStolenLabelStyle() });
        stolenLabel.anchor.set(0.5);
        stolenLabel.position.set(0, 255);
        const stolenName = new PixiText({ text: "Ability", style: this.getStolenAbilityNameStyle() });
        stolenName.anchor.set(0.5);
        stolenName.position.set(0, 300);
        container.addChild(dmg, count, miss, absorbedLabel, absorbedValue, stolenLabel, stolenName);
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
            driftY: 0,
        });
        // Warm the Craft forge textures so the first cast's anvil/hammer don't pop in a frame late.
        Texture.from(images.craft_anvil);
        Texture.from(images.craft_hammer);
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
        for (const iceBreak of this.iceBreaks) {
            iceBreak.container.destroy({ children: true });
        }
        this.iceBreaks.length = 0;
        for (const cleave of this.cleaveDeaths) {
            cleave.container.destroy({ children: true });
        }
        this.cleaveDeaths.length = 0;
        for (const dissolve of this.dissolveDeaths) {
            dissolve.container.destroy({ children: true });
        }
        this.dissolveDeaths.length = 0;
        this.deathBlowByUnitId.clear();
        for (const sweep of this.fireSweeps) {
            sweep.container.destroy({ children: true });
        }
        this.fireSweeps.length = 0;
        for (const cloud of this.poisonClouds) {
            cloud.container.destroy({ children: true });
        }
        this.poisonClouds.length = 0;
        for (const chain of this.chainLightnings) {
            chain.container.destroy({ children: true });
        }
        this.chainLightnings.length = 0;
        for (const dp of this.debuffPops) {
            dp.container.destroy();
        }
        this.debuffPops.length = 0;
        for (const steal of this.abilitySteals) {
            steal.container.destroy({ children: true });
        }
        this.abilitySteals.length = 0;
        for (const claw of this.clawSlashes) {
            claw.container.destroy({ children: true });
        }
        this.clawSlashes.length = 0;
        for (const forge of this.craftForges) {
            forge.container.destroy({ children: true });
        }
        this.craftForges.length = 0;
        for (const enchant of this.enchants) {
            enchant.container.destroy({ children: true });
        }
        this.enchants.length = 0;
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

            // Decelerating rise + drift along the hit trajectory (both axes) so the number follows the
            // attack/response line instead of always floating straight up.
            const e = easeOutCubic(t);
            ft.container.x = ft.startX + ft.driftX * e;
            ft.container.y = ft.startY + (ft.riseY + ft.driftY) * e;

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

        for (let i = this.debuffPops.length - 1; i >= 0; i--) {
            const dp = this.debuffPops[i];
            dp.age += dt;
            const t = dp.age / dp.life;
            if (t >= 1) {
                dp.container.destroy();
                this.debuffPops.splice(i, 1);
                continue;
            }
            const e = easeOutCubic(t);
            dp.container.y = dp.startY + dp.riseY * e;

            let scale = 1;
            if (dp.age < DP_POP_DUR) {
                scale = DP_START_SCALE + (1 - DP_START_SCALE) * easeOutBack(dp.age / DP_POP_DUR);
            } else if (t > DP_FADE_OUT_FROM) {
                // Evaporate: the icon + name swell slightly as they dissolve upward and fade out.
                scale = 1 + 0.2 * ((t - DP_FADE_OUT_FROM) / (1 - DP_FADE_OUT_FROM));
            }
            dp.container.scale.set(scale, -scale);

            let alpha = 1;
            if (dp.age < DP_FADE_IN) {
                alpha = dp.age / DP_FADE_IN;
            } else if (t > DP_FADE_OUT_FROM) {
                alpha = 1 - (t - DP_FADE_OUT_FROM) / (1 - DP_FADE_OUT_FROM);
            }
            dp.container.alpha = Math.max(0, Math.min(1, alpha));
        }

        this.stepShatters(dt);
        this.stepIceBreaks(dt);
        this.stepCleaveDeaths(dt);
        this.stepDissolveDeaths(dt);
        this.stepFireSweeps(dt);
        this.stepPoisonClouds(dt);
        this.stepChainLightnings(dt);
        this.stepWindSpears(dt);
        this.stepAbilitySteals(dt);
        this.stepSlashes(dt);
        this.stepClawSlashes(dt);
        this.stepCraftForges(dt);
        this.stepEnchants(dt);
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
    private createIceCrystal(width: number, height: number, color: number, large: boolean): Graphics {
        const crystal = new Graphics();
        if (large) {
            crystal
                .poly([
                    0,
                    -height * 0.5,
                    width * 0.5,
                    -height * 0.12,
                    width * 0.34,
                    height * 0.33,
                    0,
                    height * 0.5,
                    -width * 0.36,
                    height * 0.31,
                    -width * 0.5,
                    -height * 0.13,
                ])
                .fill({ color, alpha: 0.78 })
                .stroke({ color: 0xeafaff, alpha: 0.9, width: 1, join: "round" });
            crystal
                .poly([0, -height * 0.5, width * 0.5, -height * 0.12, 0, height * 0.08])
                .fill({ color: 0xf1fcff, alpha: 0.34 });
            crystal
                .poly([0, height * 0.08, width * 0.34, height * 0.33, 0, height * 0.5])
                .fill({ color: 0x469dce, alpha: 0.3 });
            crystal
                .moveTo(0, -height * 0.5)
                .lineTo(0, height * 0.5)
                .moveTo(-width * 0.5, -height * 0.13)
                .lineTo(0, height * 0.08)
                .stroke({ color: 0xeafaff, alpha: 0.45, width: 0.8, cap: "round" });
        } else {
            crystal
                .poly([0, -height * 0.5, width * 0.5, height * 0.12, 0, height * 0.5, -width * 0.45, height * 0.08])
                .fill({ color, alpha: 0.86 })
                .stroke({ color: 0xf1fcff, alpha: 0.85, width: 0.7, join: "round" });
            crystal
                .moveTo(0, -height * 0.42)
                .lineTo(0, height * 0.38)
                .stroke({ color: 0xffffff, alpha: 0.45, width: 0.55, cap: "round" });
        }
        return crystal;
    }
    private spawnIceBreak(info: IDeathVfxInfo): boolean {
        const frame = info.texture?.frame;
        if (!frame || frame.width <= 1 || frame.height <= 1) return false;

        const worldW = Math.abs(info.scaleX) * frame.width;
        const worldH = Math.abs(info.scaleY) * frame.height;
        const bodySize = Math.min(worldW, worldH);
        if (bodySize <= 1) return false;
        const shellHalf = Math.max(info.frozenShellHalf ?? Math.max(worldW, worldH) * 0.54, bodySize * 0.54);
        const shellSize = shellHalf * 2;

        const container = new Container();
        container.position.set(info.x, info.y);
        this.context.attachToWorldRoot(container, ICE_BREAK_Z);

        // Preserve the dying unit for a very short crack beat after its live sprite is torn down.
        const body = new Sprite(info.texture);
        body.anchor.set(0.5);
        body.scale.set(info.scaleX, info.scaleY);
        body.tint = 0x9fdcff;
        body.alpha = 0.92;
        container.addChild(body);

        // Rebuild the same square frozen pane the live unit occupied so the kill starts from its existing
        // silhouette instead of dropping the shell and briefly reading as a circular ice cast.
        const iceShell = new Graphics();
        const shellCorner = shellHalf * 0.18;
        iceShell
            .roundRect(-shellHalf, -shellHalf, shellSize, shellSize, shellCorner)
            .fill({ color: 0xbfe8ff, alpha: 0.1 })
            .stroke({ color: 0xeaf7ff, alpha: 0.54, width: 1.4 });
        const rimInset = shellHalf * 0.045;
        iceShell
            .roundRect(
                -shellHalf + rimInset,
                -shellHalf + rimInset,
                shellSize - rimInset * 2,
                shellSize - rimInset * 2,
                shellCorner * 0.82,
            )
            .stroke({ color: 0xbfe8ff, alpha: 0.26, width: shellHalf * 0.055 });
        container.addChild(iceShell);

        const crackFlash = new Graphics();
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
            const rayX = Math.cos(angle);
            const rayY = Math.sin(angle);
            const edgeDistance = (shellHalf * (0.78 + Math.random() * 0.16)) / Math.max(Math.abs(rayX), Math.abs(rayY));
            const endX = rayX * edgeDistance;
            const endY = rayY * edgeDistance;
            const bendX = -Math.sin(angle) * bodySize * (Math.random() - 0.5) * 0.1;
            const bendY = Math.cos(angle) * bodySize * (Math.random() - 0.5) * 0.1;
            const midX = endX * 0.5 + bendX;
            const midY = endY * 0.5 + bendY;
            crackFlash.moveTo(0, 0).lineTo(midX, midY).lineTo(endX, endY);
            if (i % 2 === 0) {
                crackFlash
                    .moveTo(midX, midY)
                    .lineTo(midX - Math.sin(angle) * bodySize * 0.1, midY + Math.cos(angle) * bodySize * 0.1);
            }
        }
        crackFlash.stroke({
            color: 0xf4fdff,
            alpha: 0.95,
            width: Math.max(1, bodySize * 0.012),
            cap: "round",
            join: "round",
        });
        container.addChild(crackFlash);

        const sizeScale = Math.max(1, Math.min(2, shellSize / 128));
        const largeCount = Math.round(6 + (sizeScale - 1) * 4);
        const smallCount = Math.round(14 + (sizeScale - 1) * 14);
        const crystals: IIceCrystal[] = [];
        const addCrystal = (large: boolean): void => {
            const height = large ? shellSize * (0.2 + Math.random() * 0.13) : shellSize * (0.06 + Math.random() * 0.1);
            const width = height * (large ? 0.28 + Math.random() * 0.22 : 0.2 + Math.random() * 0.2);
            const color = ICE_BREAK_COLORS[Math.floor(Math.random() * ICE_BREAK_COLORS.length)];
            const node = this.createIceCrystal(width, height, color, large);
            const x = (Math.random() - 0.5) * shellSize * (large ? 1.36 : 1.76);
            const y = (Math.random() - 0.5) * shellSize * (large ? 1.36 : 1.76);
            const fallbackAngle = Math.random() * Math.PI * 2;
            const distance = Math.hypot(x, y);
            const outwardX = distance > shellSize * 0.04 ? x / distance : Math.cos(fallbackAngle);
            const outwardY = distance > shellSize * 0.04 ? y / distance : Math.sin(fallbackAngle);
            const spread = (Math.random() - 0.5) * (large ? 0.45 : 0.7);
            const dirX = outwardX * Math.cos(spread) - outwardY * Math.sin(spread);
            const dirY = outwardX * Math.sin(spread) + outwardY * Math.cos(spread);
            const speed = shellSize * (large ? 0.65 + Math.random() * 0.65 : 1.5 + Math.random() * 1.2);
            node.position.set(x, y);
            node.rotation = Math.random() * Math.PI * 2;
            node.visible = false;
            container.addChild(node);
            crystals.push({
                node,
                x,
                y,
                vx: dirX * speed,
                vy: dirY * speed + shellSize * (large ? 0.35 + Math.random() * 0.35 : 0.45 + Math.random() * 0.45),
                spin: (Math.random() - 0.5) * (large ? 6 : 16),
                delay: ICE_BREAK_BURST_S + Math.random() * (large ? 0.035 : 0.065),
                life: large ? 0.76 + Math.random() * 0.34 : 0.44 + Math.random() * 0.3,
                gravity: shellSize * (large ? 3.8 : 5.2),
                drag: large ? 0.32 : 0.75,
                large,
            });
        };
        for (let i = 0; i < largeCount; i++) addCrystal(true);
        for (let i = 0; i < smallCount; i++) addCrystal(false);

        this.iceBreaks.push({
            container,
            body,
            iceShell,
            crackFlash,
            crystals,
            age: 0,
            burstAt: ICE_BREAK_BURST_S,
        });
        return true;
    }
    private stepIceBreaks(dt: number): void {
        const fadeFrom = 0.62;
        for (let i = this.iceBreaks.length - 1; i >= 0; i--) {
            const iceBreak = this.iceBreaks[i];
            iceBreak.age += dt;
            if (iceBreak.age < iceBreak.burstAt) {
                const crackT = iceBreak.age / iceBreak.burstAt;
                iceBreak.body.alpha = 0.92 * (1 - crackT * 0.25);
                iceBreak.iceShell.alpha = 1 - crackT * 0.12;
                iceBreak.crackFlash.alpha = 1 - crackT * 0.35;
            } else {
                iceBreak.body.visible = false;
                iceBreak.iceShell.visible = false;
                const burstFlashT = (iceBreak.age - iceBreak.burstAt) / 0.09;
                iceBreak.crackFlash.visible = burstFlashT < 1;
                iceBreak.crackFlash.alpha = Math.max(0, (1 - burstFlashT) * 0.62);
                const flashScale = 1 + Math.min(1, burstFlashT) * 0.18;
                iceBreak.crackFlash.scale.set(flashScale);
            }

            for (let c = iceBreak.crystals.length - 1; c >= 0; c--) {
                const crystal = iceBreak.crystals[c];
                const elapsed = iceBreak.age - crystal.delay;
                if (elapsed < 0) continue;
                crystal.node.visible = true;
                const lifeT = elapsed / crystal.life;
                if (lifeT >= 1) {
                    crystal.node.destroy();
                    iceBreak.crystals.splice(c, 1);
                    continue;
                }
                crystal.vy -= crystal.gravity * dt;
                const drag = Math.exp(-crystal.drag * dt);
                crystal.vx *= drag;
                crystal.vy *= drag;
                crystal.x += crystal.vx * dt;
                crystal.y += crystal.vy * dt;
                crystal.node.position.set(crystal.x, crystal.y);
                crystal.node.rotation += crystal.spin * dt;
                const releaseScale = 0.7 + 0.3 * easeOutCubic(Math.min(1, lifeT / 0.12));
                crystal.node.scale.set(releaseScale);
                crystal.node.alpha =
                    lifeT > fadeFrom ? 1 - (lifeT - fadeFrom) / (1 - fadeFrom) : crystal.large ? 0.96 : 0.9;
            }

            if (iceBreak.crystals.length === 0) {
                iceBreak.container.destroy({ children: true });
                this.iceBreaks.splice(i, 1);
            }
        }
    }
    /**
     * Record what killed a unit (and the blow's direction, attacker → victim) BEFORE its death
     * visuals spawn, so spawnDeathVfx can pick a kill-specific animation. Only note units that
     * actually died from the blow (the engine's unitIdsDied) — noting mere hits would misattribute
     * a later death by spell to the earlier attack.
     */
    public noteDeathBlow(unitId: string, kind: DeathBlowKind, dir?: HoCMath.XY): void {
        this.deathBlowByUnitId.set(unitId, { kind, dir });
    }
    /**
     * Death-visuals dispatcher: a melee kill has a 50% chance of the "cleave" (torn in two) and a
     * ranged kill a 50% chance of the "dissolve" (shot through into drifting ash) — otherwise, and
     * for any death with no recorded blow (spells, armageddon, narrowing…), the classic broken-mirror
     * shatter. Consumes the recorded blow so a stale entry can never color a later death.
     */
    public spawnDeathVfx(info: IDeathVfxInfo, unitId?: string, frozen = false): void {
        const blow = unitId ? this.deathBlowByUnitId.get(unitId) : undefined;
        if (unitId) {
            this.deathBlowByUnitId.delete(unitId);
        }
        // A frozen stack always cracks into mixed-size crystals, however the killing blow was delivered.
        if (frozen && this.spawnIceBreak(info)) {
            return;
        }
        if (blow && Math.random() < 0.5) {
            if (blow.kind === "melee") {
                this.spawnCleaveDeath(info, blow.dir);
            } else {
                this.spawnDissolveDeath(info, blow.dir);
            }
        } else {
            this.spawnShatter(info);
        }
    }
    /**
     * Melee death "cleave": a slash flash sweeps a jagged cut through the unit PERPENDICULAR to the
     * strike line (`dir`, attacker → victim); the body holds intact for a beat, then the two masked
     * halves let go — separating along the blow and shoved away from the attacker, toppling under
     * gravity and shedding a few drops of blood from the rip.
     */
    private spawnCleaveDeath(
        info: { texture: Texture; x: number; y: number; scaleX: number; scaleY: number },
        dir?: HoCMath.XY,
    ): void {
        const tex = info.texture;
        const source = tex?.source;
        const frame = tex?.frame;
        if (!source || !frame || frame.width <= 1 || frame.height <= 1) return;

        const worldW = Math.abs(info.scaleX) * frame.width;
        const worldH = Math.abs(info.scaleY) * frame.height;

        const container = new Container();
        this.context.attachToWorldRoot(container, CLEAVE_Z);
        container.position.set(info.x, info.y);

        // Shove direction: away from the attacker; sideways at random when the blow's origin is unknown.
        let px = dir?.x ?? 0;
        let py = dir?.y ?? 0;
        const pLen = Math.hypot(px, py);
        const hadDir = pLen >= 0.001;
        if (!hadDir) {
            const a = Math.random() * Math.PI * 2;
            px = Math.cos(a);
            py = Math.sin(a);
        } else {
            px /= pLen;
            py /= pLen;
        }

        // The cut runs PERPENDICULAR to the strike line (attacker center → struck unit), with a small
        // random blade lean, jagged along its length so it reads as torn flesh, not a laser slice: a
        // horizontal blow cleaves the body into left/right halves, a strike from below cuts it at the
        // waist, a diagonal blow cuts diagonally — and the halves then separate ALONG the blow.
        // Without a known direction, fall back to a mostly-vertical random cut. All coordinates are
        // unit-local (the container sits at the unit's center).
        let ux: number;
        let uy: number;
        if (hadDir) {
            const lean = (Math.random() - 0.5) * 0.4;
            const cs = Math.cos(lean);
            const sn = Math.sin(lean);
            // perp(strike line), rotated by the blade lean.
            ux = -py * cs - px * sn;
            uy = px * cs - py * sn;
        } else {
            const lean = (0.25 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1);
            ux = Math.sin(lean);
            uy = Math.cos(lean);
        }
        // The slash flash sweeps from the +cutLen end toward -cutLen: orient the tangent so the
        // stroke comes DOWN along the cut (random for a horizontal cut, e.g. a waist cut).
        if (uy < -0.05 || (Math.abs(uy) <= 0.05 && Math.random() < 0.5)) {
            ux = -ux;
            uy = -uy;
        }
        const nx = uy;
        const ny = -ux; // cut normal — the halves separate along ±n (≈ the strike line when known)
        const cutLen = 0.62 * Math.hypot(worldW, worldH); // past the sprite corners on both ends

        const SEGS = 7;
        const jags: HoCMath.XY[] = [];
        for (let i = 0; i <= SEGS; i++) {
            const t = -cutLen + (2 * cutLen * i) / SEGS;
            const wobble = i === 0 || i === SEGS ? 0 : (Math.random() - 0.5) * worldW * 0.09;
            jags.push({ x: ux * t + nx * wobble, y: uy * t + ny * wobble });
        }

        const halves: ICleaveHalf[] = [];
        const FAR = cutLen * 2.5;
        for (const side of [1, -1]) {
            const half = new Container();
            const sprite = new Sprite(tex);
            sprite.anchor.set(0.5);
            // Same orientation as the dying unit (scaleY carries the y-up flip).
            sprite.scale.set(info.scaleX, info.scaleY);
            // Mask this copy to one side of the jagged cut: the cut polyline, closed far out along ±n.
            const maskG = new Graphics();
            maskG.moveTo(jags[0].x, jags[0].y);
            for (let i = 1; i < jags.length; i++) {
                maskG.lineTo(jags[i].x, jags[i].y);
            }
            maskG.lineTo(jags[SEGS].x + nx * FAR * side, jags[SEGS].y + ny * FAR * side);
            maskG.lineTo(jags[0].x + nx * FAR * side, jags[0].y + ny * FAR * side);
            maskG.closePath();
            maskG.fill({ color: 0xffffff });
            half.addChild(sprite, maskG);
            half.mask = maskG;
            container.addChild(half);

            const sep = 55 + Math.random() * 35; // lateral separation along the cut normal
            halves.push({
                node: half,
                vx: nx * sep * side + px * (70 + Math.random() * 50),
                vy: ny * sep * side + py * (70 + Math.random() * 50) * 0.5 + 30 + Math.random() * 30,
                rotSpeed: -side * (0.6 + Math.random() * 0.8),
            });
        }

        // Blood shed from the rip: droplets spray perpendicular to the cut as the halves let go
        // (negative age holds them until the release beat).
        const drops: ISlashDrop[] = [];
        const bodyR = 0.45 * Math.min(worldW, worldH);
        const dropCount = 8 + Math.floor(Math.random() * 4);
        for (let d = 0; d < dropCount; d++) {
            const along = (Math.random() - 0.5) * 2 * bodyR;
            const side = Math.random() < 0.5 ? 1 : -1;
            drops.push({
                x: ux * along + nx * side * 2,
                y: uy * along + ny * side * 2,
                vx: nx * side * (120 + Math.random() * 140) + ux * (Math.random() - 0.5) * 120,
                vy: ny * side * (120 + Math.random() * 140) + uy * (Math.random() - 0.5) * 120,
                r: 1.6 + Math.random() * 2.2,
                age: -CLEAVE_RELEASE_S - Math.random() * 0.05,
                life: 0.3 + Math.random() * 0.25,
            });
        }
        const dropsGfx = new Graphics();
        container.addChild(dropsGfx);

        const streak = new Graphics();
        streak.blendMode = "add";
        container.addChild(streak);

        this.cleaveDeaths.push({
            container,
            halves,
            streak,
            dropsGfx,
            drops,
            cutU: { x: ux, y: uy },
            cutLen,
            streakWidth: Math.max(3, worldH * 0.05),
            age: 0,
            life: CLEAVE_RELEASE_S + CLEAVE_HALF_LIFE,
            releaseAt: CLEAVE_RELEASE_S,
            halfLife: CLEAVE_HALF_LIFE,
        });
    }
    private stepCleaveDeaths(dt: number): void {
        for (let i = this.cleaveDeaths.length - 1; i >= 0; i--) {
            const cd = this.cleaveDeaths[i];
            cd.age += dt;
            if (cd.age >= cd.life) {
                cd.container.destroy({ children: true });
                this.cleaveDeaths.splice(i, 1);
                continue;
            }

            // Slash flash: the tip sweeps the cut top-to-bottom fast, then the whole streak fades.
            cd.streak.clear();
            if (cd.age < CLEAVE_STREAK_LIFE) {
                const sweepT = Math.min(1, cd.age / CLEAVE_STREAK_SWEEP_S);
                const tip = cd.cutLen - 2 * cd.cutLen * easeOutCubic(sweepT);
                const fade =
                    cd.age <= CLEAVE_STREAK_SWEEP_S
                        ? 1
                        : 1 - (cd.age - CLEAVE_STREAK_SWEEP_S) / (CLEAVE_STREAK_LIFE - CLEAVE_STREAK_SWEEP_S);
                const x0 = cd.cutU.x * cd.cutLen;
                const y0 = cd.cutU.y * cd.cutLen;
                const x1 = cd.cutU.x * tip;
                const y1 = cd.cutU.y * tip;
                const w = cd.streakWidth;
                cd.streak.moveTo(x0, y0);
                cd.streak.lineTo(x1, y1);
                cd.streak.stroke({ width: w * 3.2, color: CLEAVE_GLOW, alpha: 0.3 * fade, cap: "round" });
                cd.streak.moveTo(x0, y0);
                cd.streak.lineTo(x1, y1);
                cd.streak.stroke({ width: w * 1.4, color: CLEAVE_MID, alpha: 0.7 * fade, cap: "round" });
                cd.streak.moveTo(x0, y0);
                cd.streak.lineTo(x1, y1);
                cd.streak.stroke({ width: w * 0.55, color: CLEAVE_CORE, alpha: fade, cap: "round" });
            }

            // The halves hold together until the release beat, then slide apart, topple, and fade.
            if (cd.age >= cd.releaseAt) {
                const ht = (cd.age - cd.releaseAt) / cd.halfLife;
                const alpha = ht > CLEAVE_FADE_FROM ? 1 - (ht - CLEAVE_FADE_FROM) / (1 - CLEAVE_FADE_FROM) : 1;
                for (const half of cd.halves) {
                    half.vy -= CLEAVE_GRAVITY * dt;
                    half.node.x += half.vx * dt;
                    half.node.y += half.vy * dt;
                    half.node.rotation += half.rotSpeed * dt;
                    half.node.alpha = Math.max(0, alpha);
                }
            }

            // Blood droplets from the rip (unit-local coords; world y-up so gravity subtracts).
            const gfx = cd.dropsGfx;
            gfx.clear();
            for (const drop of cd.drops) {
                drop.age += dt;
                if (drop.age < 0 || drop.age >= drop.life) {
                    continue;
                }
                drop.vy -= CLEAVE_DROP_GRAVITY * dt;
                drop.x += drop.vx * dt;
                drop.y += drop.vy * dt;
                const dropAlpha = 1 - drop.age / drop.life;
                gfx.circle(drop.x, drop.y, drop.r * (0.7 + 0.3 * dropAlpha));
                gfx.fill({ color: SLASH_DROP, alpha: 0.9 * dropAlpha });
            }
        }
    }
    /**
     * Ranged death "dissolve": the killing shot punches through — a tracer streak + impact flash,
     * then the body erodes into a wave of shards released entry-side first, carried along the shot's
     * direction (`dir`, attacker → victim), slowing under drag and fluttering down like ash while a
     * few sparks fly out the exit side.
     */
    private spawnDissolveDeath(
        info: { texture: Texture; x: number; y: number; scaleX: number; scaleY: number },
        dir?: HoCMath.XY,
    ): void {
        const tex = info.texture;
        const source = tex?.source;
        const frame = tex?.frame;
        if (!source || !frame || frame.width <= 1 || frame.height <= 1) return;

        const worldW = Math.abs(info.scaleX) * frame.width;
        const worldH = Math.abs(info.scaleY) * frame.height;

        // Shot direction; a mostly-horizontal random one when the origin is unknown.
        let dx = dir?.x ?? 0;
        let dy = dir?.y ?? 0;
        const dLen = Math.hypot(dx, dy);
        if (dLen < 0.001) {
            const a = (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.6;
            dx = Math.cos(a);
            dy = Math.sin(a);
        } else {
            dx /= dLen;
            dy /= dLen;
        }
        const perpX = -dy;
        const perpY = dx;

        const container = new Container();
        this.context.attachToWorldRoot(container, DISSOLVE_Z);

        const COLS = DISSOLVE_COLS;
        const ROWS = DISSOLVE_ROWS;
        const tileTexW = frame.width / COLS;
        const tileTexH = frame.height / ROWS;
        const tileWorldW = worldW / COLS;
        const tileWorldH = worldH / ROWS;
        const bodyR = 0.5 * Math.hypot(worldW, worldH);

        const shards: IDissolveShard[] = [];
        let lastRelease = 0;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const subTex = new Texture({
                    source,
                    frame: new Rectangle(frame.x + c * tileTexW, frame.y + r * tileTexH, tileTexW, tileTexH),
                });
                const shard = new Sprite(subTex);
                shard.anchor.set(0.5);
                // Same orientation as the dying unit (scaleY carries the y-up flip); texture row 0 is
                // the top of the image, so walk rows top-down to keep the composite upright.
                shard.scale.set(info.scaleX, info.scaleY);
                const sx = info.x - worldW / 2 + (c + 0.5) * tileWorldW;
                const sy = info.y + worldH / 2 - (r + 0.5) * tileWorldH;
                shard.position.set(sx, sy);
                container.addChild(shard);

                // The erosion wave enters on the side facing the shooter and crosses the body in
                // DISSOLVE_WAVE_S — shards release in shot order, so the unit visibly erodes THROUGH.
                const along = (sx - info.x) * dx + (sy - info.y) * dy;
                const delay =
                    ((along + bodyR) / (2 * bodyR)) * DISSOLVE_WAVE_S + Math.random() * DISSOLVE_WAVE_JITTER_S;
                // A tight cone along the shot: strong carry in the shot direction, modest spread
                // across it — the debris streams away at the ATTACK ANGLE, whatever it is.
                const bodyMax = Math.max(worldW, worldH);
                const speed = bodyMax * (DISSOLVE_SPEED_MIN + Math.random() * DISSOLVE_SPEED_VAR);
                const spread = bodyMax * DISSOLVE_CONE * (Math.random() - 0.5);
                const life = DISSOLVE_LIFE_MIN + Math.random() * DISSOLVE_LIFE_VAR;
                lastRelease = Math.max(lastRelease, delay + life);
                shards.push({
                    sprite: shard,
                    x: sx,
                    y: sy,
                    vx: dx * speed + perpX * spread,
                    vy: dy * speed + perpY * spread + 18,
                    delay,
                    age: 0,
                    life,
                    baseScaleX: info.scaleX,
                    baseScaleY: info.scaleY,
                    swayAmp: 5 + Math.random() * 8,
                    swayFreq: 6 + Math.random() * 4,
                    swayPhase: Math.random() * Math.PI * 2,
                    rotSpeed: (Math.random() - 0.5) * 4,
                });
            }
        }

        // The shot's tracer through the body + an impact flash at the center. Asymmetric on purpose:
        // short on the entry side, long past the exit side — it reads as the shot PASSING THROUGH
        // along its actual flight line.
        const tracer = new Graphics();
        tracer.blendMode = "add";
        container.addChild(tracer);
        const tracerEntryR = 0.7 * Math.hypot(worldW, worldH);
        const tracerExitR = 1.25 * Math.hypot(worldW, worldH);

        const lightTex = this.getLightTexture();
        const flash = new Sprite(lightTex);
        flash.anchor.set(0.5);
        flash.blendMode = "add";
        flash.tint = DISSOLVE_TRACER_TINT;
        flash.position.set(info.x, info.y);
        container.addChild(flash);
        const flashScale = (worldH * 0.85) / Math.max(1, lightTex.width || 64);

        // Sparks out the exit side — the shot goes THROUGH.
        const sparks: IDissolveSpark[] = [];
        const sparkCount = 6;
        const sparkBody = Math.max(worldW, worldH);
        let sparkLife = 0;
        for (let s = 0; s < sparkCount; s++) {
            const sprite = new Sprite(lightTex);
            sprite.anchor.set(0.5);
            sprite.blendMode = "add";
            sprite.tint = DISSOLVE_SPARK_TINT;
            sprite.scale.set(flashScale * 0.28);
            container.addChild(sprite);
            const life = 0.2 + Math.random() * 0.15;
            sparkLife = Math.max(sparkLife, life);
            sparks.push({
                sprite,
                x: info.x + dx * bodyR * 0.4,
                y: info.y + dy * bodyR * 0.4,
                vx: dx * sparkBody * (2.6 + Math.random() * 1.4) + perpX * (Math.random() - 0.5) * sparkBody,
                vy: dy * sparkBody * (2.6 + Math.random() * 1.4) + perpY * (Math.random() - 0.5) * sparkBody,
                life,
            });
        }

        this.dissolveDeaths.push({
            container,
            shards,
            tracer,
            tracerFrom: { x: info.x - dx * tracerEntryR, y: info.y - dy * tracerEntryR },
            tracerTo: { x: info.x + dx * tracerExitR, y: info.y + dy * tracerExitR },
            tracerWidth: Math.max(2.5, worldH * 0.035),
            flash,
            flashScale,
            sparks,
            dirPerp: { x: perpX, y: perpY },
            age: 0,
            life: Math.max(lastRelease, DISSOLVE_TRACER_LIFE, DISSOLVE_FLASH_LIFE, sparkLife) + 0.02,
        });
    }
    private stepDissolveDeaths(dt: number): void {
        for (let i = this.dissolveDeaths.length - 1; i >= 0; i--) {
            const dd = this.dissolveDeaths[i];
            dd.age += dt;
            if (dd.age >= dd.life) {
                dd.container.destroy({ children: true });
                this.dissolveDeaths.splice(i, 1);
                continue;
            }

            // Tracer: full-bright with the impact, gone in a couple of frames' worth of afterglow.
            dd.tracer.clear();
            if (dd.age < DISSOLVE_TRACER_LIFE) {
                const fade = 1 - dd.age / DISSOLVE_TRACER_LIFE;
                const w = dd.tracerWidth;
                dd.tracer.moveTo(dd.tracerFrom.x, dd.tracerFrom.y);
                dd.tracer.lineTo(dd.tracerTo.x, dd.tracerTo.y);
                dd.tracer.stroke({ width: w * 3, color: DISSOLVE_TRACER_TINT, alpha: 0.28 * fade, cap: "round" });
                dd.tracer.moveTo(dd.tracerFrom.x, dd.tracerFrom.y);
                dd.tracer.lineTo(dd.tracerTo.x, dd.tracerTo.y);
                dd.tracer.stroke({ width: w, color: 0xffffff, alpha: fade, cap: "round" });
            }

            // Impact flash: springs open with the hit, then dissipates.
            if (dd.age < DISSOLVE_FLASH_LIFE) {
                const pop = easeOutCubic(Math.min(1, dd.age / 0.09));
                dd.flash.scale.set(dd.flashScale * (0.45 + 0.7 * pop));
                dd.flash.alpha = 1 - dd.age / DISSOLVE_FLASH_LIFE;
            } else if (dd.flash.visible) {
                dd.flash.visible = false;
            }

            // Exit-side sparks: fast, additive, quickly gone.
            for (const spark of dd.sparks) {
                if (dd.age >= spark.life) {
                    if (spark.sprite.visible) spark.sprite.visible = false;
                    continue;
                }
                spark.x += spark.vx * dt;
                spark.y += spark.vy * dt;
                spark.sprite.position.set(spark.x, spark.y);
                spark.sprite.alpha = 1 - dd.age / spark.life;
            }

            // The erosion wave: shards stay composed until the wave reaches them, then get carried
            // along the shot, slow under drag, and flutter down like ash — sway, shrink, soft fade.
            const drag = Math.exp(-DISSOLVE_DRAG * dt);
            for (const s of dd.shards) {
                s.age += dt;
                if (s.age < s.delay) {
                    continue; // still part of the (eroding) body
                }
                const a = s.age - s.delay;
                const t = a / s.life;
                if (t >= 1) {
                    if (s.sprite.visible) s.sprite.visible = false;
                    continue;
                }
                s.vx *= drag;
                s.vy = s.vy * drag - DISSOLVE_SINK * dt;
                s.x += s.vx * dt;
                s.y += s.vy * dt;
                // Ash flutter: lateral sway ACROSS the flight line (not world-x), ramping in as the
                // burst slows — so the flutter reads correctly at any attack angle.
                const sway = Math.sin(a * s.swayFreq + s.swayPhase) * s.swayAmp * Math.min(1, a * 2);
                s.sprite.position.set(s.x + dd.dirPerp.x * sway, s.y + dd.dirPerp.y * sway);
                s.sprite.rotation += s.rotSpeed * dt;
                const shrink = 1 - 0.65 * t;
                s.sprite.scale.set(s.baseScaleX * shrink, s.baseScaleY * shrink);
                s.sprite.alpha = t > DISSOLVE_FADE_FROM ? 1 - (t - DISSOLVE_FADE_FROM) / (1 - DISSOLVE_FADE_FROM) : 1;
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
    private getLightTexture(): Texture {
        if (this.lightTexture) {
            return this.lightTexture;
        }
        // Headless (tests): no DOM to rasterize the radial gradient on — a plain white texture works.
        if (typeof document === "undefined") {
            return Texture.WHITE;
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
        // Hot white core fading through a soft cyan-white halo to transparent — reads as glowing light.
        grad.addColorStop(0.0, "rgba(255,255,255,1)");
        grad.addColorStop(0.35, "rgba(223,244,255,0.85)");
        grad.addColorStop(0.7, "rgba(180,230,255,0.32)");
        grad.addColorStop(1.0, "rgba(150,220,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        this.lightTexture = Texture.from(canvas);
        return this.lightTexture;
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
    /** Soft green→transparent radial puff, drawn once and tinted per particle — one wisp of the toxic cloud. */
    private getPoisonTexture(): Texture {
        if (this.poisonTexture) {
            return this.poisonTexture;
        }
        // Headless (tests): no DOM to rasterize on — a plain white texture keeps the particle path alive.
        if (typeof document === "undefined") {
            return Texture.WHITE;
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
        grad.addColorStop(0.0, "rgba(226,255,188,0.95)");
        grad.addColorStop(0.35, "rgba(126,226,86,0.7)");
        grad.addColorStop(0.7, "rgba(60,170,54,0.3)");
        grad.addColorStop(1.0, "rgba(28,120,42,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        this.poisonTexture = Texture.from(canvas);
        return this.poisonTexture;
    }
    /**
     * Poison tick VFX: a puff of toxic-green gas rises off the poisoned unit at the start of its turn
     * (driven by the `poison_ticked` engine event). Particles pop in, float up, SWELL, and fade — the
     * fire-ember lifecycle but green and expanding (billowing gas) instead of shrinking (burning ember).
     * Shared by the live sandbox and the ranked replay (both route the event through applyTurnEngineEvents).
     */
    public spawnPoisonCloud(center: HoCMath.XY, cellSize: number): void {
        const container = new Container();
        this.context.attachToWorldRoot(container, FIRE_Z);
        const tex = this.getPoisonTexture();
        const texW = tex.width || 64;
        const particles: IFireParticle[] = [];
        for (let k = 0; k < 14; k++) {
            const rand = Math.random();
            const jitter = cellSize * 0.34;
            const sprite = new Sprite(tex);
            sprite.anchor.set(0.5);
            sprite.blendMode = "add";
            sprite.tint = POISON_TINTS[Math.floor(Math.random() * POISON_TINTS.length)];
            sprite.scale.set(0.001);
            sprite.alpha = 0;
            sprite.visible = false;
            container.addChild(sprite);
            particles.push({
                sprite,
                age: -Math.random() * 0.18, // slight stagger so the cloud billows up rather than popping at once
                life: POISON_PARTICLE_LIFE * (0.75 + 0.5 * rand),
                x: center.x + (Math.random() - 0.5) * jitter,
                y: center.y + (Math.random() - 0.5) * jitter * 0.5,
                riseY: POISON_RISE * (0.7 + 0.7 * rand),
                driftX: (Math.random() - 0.5) * cellSize * 0.3,
                baseScale: (cellSize * (0.34 + 0.4 * rand)) / texW,
                rot: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 2.4,
            });
        }
        this.poisonClouds.push({ container, particles });
    }
    private stepPoisonClouds(dt: number): void {
        for (let i = this.poisonClouds.length - 1; i >= 0; i--) {
            const cloud = this.poisonClouds[i];
            let anyPending = false;
            for (const p of cloud.particles) {
                p.age += dt;
                if (p.age < 0) {
                    anyPending = true; // still staggered in
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
                // Toxic gas SWELLS as it rises (embers shrink; poison billows out).
                const scale = p.baseScale * (0.5 + 1.15 * e);
                p.sprite.scale.set(scale, scale);
                p.rot += p.spin * dt;
                p.sprite.rotation = p.rot;
                const alpha = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
                p.sprite.alpha = Math.max(0, Math.min(1, alpha)) * 0.85;
            }
            if (!anyPending) {
                cloud.container.destroy({ children: true });
                this.poisonClouds.splice(i, 1);
            }
        }
    }
    /** Blacksmith's Craft cast: an upright anvil and a hammer swinging around its grip, just above the caster. */
    public spawnCraftForge(center: HoCMath.XY, cellSize: number): number {
        const container = new Container();
        // worldRoot is y-up. Counter-flip the forge art so both source images stay upright, then use ordinary
        // screen-style local coordinates (positive y is down) to keep the anvil below the swinging hammer.
        container.scale.set(1, -1);
        container.position.set(center.x, center.y + cellSize * 0.7);
        this.context.attachToWorldRoot(container, CRAFT_Z);

        const anvilTex = Texture.from(images.craft_anvil);
        const hammerTex = Texture.from(images.craft_hammer);

        // The anvil art carries transparent padding, so its visible top is about 27% down the source image.
        const anvil = new Sprite(anvilTex);
        anvil.anchor.set(0.5, 0.5);
        const anvilW = cellSize * 1.4;
        const anvilH = anvilW * ((anvilTex.height || 1) / (anvilTex.width || 1));
        anvil.width = anvilW;
        anvil.height = anvilH;
        const anvilBaseY = cellSize * 0.34;
        anvil.position.set(0, anvilBaseY);
        const anvilTopY = anvilBaseY - anvilH * 0.23; // 0.5 - 0.27 content-top fraction

        // Pivot at the grip near the handle's end. The lower-left face of the mallet is the strike point;
        // placing that point on the anvil at the impact angle makes the whole head follow a real circular arc.
        const hammer = new Sprite(hammerTex);
        hammer.anchor.set(0.5, 0.94);
        const hammerH = cellSize * 1.15;
        hammer.width = hammerH * ((hammerTex.width || 1) / (hammerTex.height || 1));
        hammer.height = hammerH;
        const contactX = cellSize * 0.02;
        const contactY = anvilTopY + cellSize * 0.025;
        const strikeOffsetX = (0.23 - hammer.anchor.x) * hammer.width;
        const strikeOffsetY = (0.16 - hammer.anchor.y) * hammer.height;
        const impactCos = Math.cos(CRAFT_HAMMER_IMPACT_ANGLE);
        const impactSin = Math.sin(CRAFT_HAMMER_IMPACT_ANGLE);
        const impactOffsetX = strikeOffsetX * impactCos - strikeOffsetY * impactSin;
        const impactOffsetY = strikeOffsetX * impactSin + strikeOffsetY * impactCos;
        hammer.position.set(contactX - impactOffsetX, contactY - impactOffsetY);
        hammer.rotation = CRAFT_HAMMER_IMPACT_ANGLE;

        container.addChild(anvil, hammer);
        container.alpha = 0;

        this.craftForges.push({
            container,
            anvil,
            hammer,
            sparks: [],
            anvilBaseY,
            contactX,
            contactY,
            cellSize,
            age: 0,
            life: CRAFT_FORGE_LIFE,
            cycle: CRAFT_STRIKE_CYCLE,
            impactsDone: 0,
            impactFlash: 0,
        });
        return CRAFT_FORGE_LIFE * 1000;
    }
    private spawnForgeSparks(forge: ICraftForge): void {
        const count = 11;
        for (let k = 0; k < count; k++) {
            const gfx = new Graphics();
            const r = forge.cellSize * (0.02 + Math.random() * 0.035);
            const color = Math.random() < 0.5 ? 0xfff2a0 : 0xffab36;
            gfx.circle(0, 0, r).fill({ color, alpha: 1 });
            gfx.blendMode = "add";
            gfx.position.set(forge.contactX, forge.contactY);
            forge.container.addChild(gfx);
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95; // fan upward off the anvil
            const spd = forge.cellSize * (1.6 + Math.random() * 2.8);
            forge.sparks.push({
                gfx,
                x: forge.contactX,
                y: forge.contactY,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                age: 0,
                life: 0.34 + Math.random() * 0.28,
            });
        }
    }
    private stepCraftForges(dt: number): void {
        const easeIn = (x: number): number => x * x * x;
        const impactPhase = 0.72; // fraction of a cycle at which the head lands on the anvil
        for (let i = this.craftForges.length - 1; i >= 0; i--) {
            const forge = this.craftForges[i];
            forge.age += dt;
            const t = forge.age / forge.life;
            if (t >= 1) {
                forge.container.destroy({ children: true });
                this.craftForges.splice(i, 1);
                continue;
            }

            // Group fade: in over the first 0.12s, hold, out over the last 0.2s.
            let groupAlpha = 1;
            if (forge.age < 0.12) {
                groupAlpha = forge.age / 0.12;
            } else if (t > 0.86) {
                groupAlpha = 1 - (t - 0.86) / 0.14;
            }
            forge.container.alpha = Math.max(0, Math.min(1, groupAlpha));

            // Recover around the fixed grip, then accelerate through the same circular arc into the strike.
            // Holding the impact angle through the cycle boundary keeps each repeated hit continuous.
            const phase = (forge.age % forge.cycle) / forge.cycle;
            let swing: number; // 0 = raised, 1 = striking face on the anvil
            if (phase < 0.55) {
                swing = 1 - easeOutCubic(phase / 0.55);
            } else if (phase < impactPhase) {
                swing = easeIn((phase - 0.55) / (impactPhase - 0.55));
            } else {
                swing = 1;
            }
            forge.hammer.rotation =
                CRAFT_HAMMER_RAISED_ANGLE + (CRAFT_HAMMER_IMPACT_ANGLE - CRAFT_HAMMER_RAISED_ANGLE) * swing;

            // Fire sparks the first frame each strike lands (age past (n + impactPhase) * cycle).
            const impactsOccurred =
                forge.age >= impactPhase * forge.cycle
                    ? Math.floor((forge.age - impactPhase * forge.cycle) / forge.cycle) + 1
                    : 0;
            if (impactsOccurred > forge.impactsDone && groupAlpha > 0.4) {
                forge.impactsDone = impactsOccurred;
                forge.impactFlash = 1;
                this.spawnForgeSparks(forge);
            }

            // Anvil recoil: a quick downward jolt on impact that springs back.
            if (forge.impactFlash > 0) {
                forge.impactFlash = Math.max(0, forge.impactFlash - dt * 8);
            }
            forge.anvil.y = forge.anvilBaseY + forge.impactFlash * forge.cellSize * 0.04;

            // Advance sparks (upward burst dragged down by gravity, fading out).
            const gravity = forge.cellSize * 9;
            for (let s = forge.sparks.length - 1; s >= 0; s--) {
                const sp = forge.sparks[s];
                sp.age += dt;
                if (sp.age >= sp.life) {
                    sp.gfx.destroy();
                    forge.sparks.splice(s, 1);
                    continue;
                }
                sp.vy += gravity * dt;
                sp.x += sp.vx * dt;
                sp.y += sp.vy * dt;
                sp.gfx.position.set(sp.x, sp.y);
                sp.gfx.alpha = 1 - sp.age / sp.life;
            }
        }
    }
    /**
     * Blacksmith's Armor Rune / Weapon Rune result over the target: a short "trying" gather (a runic ring
     * tightens while motes of the enchant colour spiral in), then a RESOLVE — on success a ring-burst + the scroll
     * icon popping up with "+N armor/attack"; on the 50% miss a grey fizzle + "Failed". Returns its duration (ms).
     */
    public spawnEnchantResult(
        center: HoCMath.XY,
        cellSize: number,
        opts: { tint: number; iconTexture: Texture; label: string; success: boolean },
    ): number {
        const container = new Container();
        // worldRoot is y-up; counter-flip so local coords are screen-style (y down) and the icon/text stay upright.
        container.scale.set(1, -1);
        container.position.set(center.x, center.y);
        this.context.attachToWorldRoot(container, ENCHANT_Z);

        const ring = new Graphics();
        container.addChild(ring);

        const icon = new Sprite(opts.iconTexture);
        icon.anchor.set(0.5);
        icon.tint = opts.success ? 0xffffff : 0x9a9a9a; // desaturate the rune on a failed enchant
        const iconBaseScale = (cellSize * 0.72) / (opts.iconTexture.width || 256);
        icon.scale.set(0.001);
        icon.position.set(0, -cellSize * 0.55); // above the unit (local -y = up)
        icon.alpha = 0;
        container.addChild(icon);

        const label = new PixiText({
            text: opts.label,
            style: new TextStyle({
                fontFamily: "Arial",
                fontSize: 26,
                fontWeight: "900",
                fill: opts.success ? "#8ef08a" : "#b8b8b8",
                stroke: { color: opts.success ? "#123d10" : "#2a2a2a", width: 4 },
                dropShadow: { color: "#000000", blur: 3, angle: Math.PI / 6, distance: 2 },
            }),
        });
        label.anchor.set(0.5);
        label.position.set(0, -cellSize * 0.1);
        label.alpha = 0;
        container.addChild(label);

        const motes: IEnchantMote[] = [];
        const moteCount = 10;
        for (let i = 0; i < moteCount; i++) {
            const gfx = new Graphics();
            gfx.circle(0, 0, cellSize * 0.035).fill({ color: opts.tint, alpha: 1 });
            gfx.blendMode = "add";
            gfx.alpha = 0;
            container.addChild(gfx);
            motes.push({ gfx, ang: (i / moteCount) * Math.PI * 2, startR: cellSize * (0.7 + 0.18 * (i % 3)) });
        }

        this.enchants.push({
            container,
            ring,
            icon,
            label,
            motes,
            sparks: [],
            iconBaseScale,
            tint: opts.tint,
            success: opts.success,
            cellSize,
            age: 0,
            resolved: false,
        });
        return ENCHANT_LIFE * 1000;
    }
    private spawnEnchantBurst(e: IEnchant): void {
        const count = e.success ? 12 : 7;
        for (let k = 0; k < count; k++) {
            const gfx = new Graphics();
            const r = e.cellSize * (0.02 + Math.random() * 0.03);
            const color = e.success ? (Math.random() < 0.5 ? e.tint : 0xfff2b0) : 0x9a9a9a;
            gfx.circle(0, 0, r).fill({ color, alpha: 1 });
            if (e.success) {
                gfx.blendMode = "add";
            }
            e.container.addChild(gfx);
            const ang = Math.random() * Math.PI * 2;
            const spd = e.cellSize * (e.success ? 1.6 + Math.random() * 2.2 : 0.6 + Math.random());
            e.sparks.push({
                gfx,
                x: 0,
                y: -e.cellSize * 0.1,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - (e.success ? e.cellSize * 1.2 : 0),
                age: 0,
                life: 0.4 + Math.random() * 0.3,
            });
        }
    }
    private stepEnchants(dt: number): void {
        const easeIn = (x: number): number => x * x * x;
        const TAU = Math.PI * 2;
        for (let i = this.enchants.length - 1; i >= 0; i--) {
            const e = this.enchants[i];
            e.age += dt;
            if (e.age / ENCHANT_LIFE >= 1) {
                e.container.destroy({ children: true });
                this.enchants.splice(i, 1);
                continue;
            }
            e.ring.clear();
            if (e.age < ENCHANT_GATHER) {
                // GATHER ("trying"): the ring tightens + runes orbit; motes spiral inward and brighten.
                const gp = e.age / ENCHANT_GATHER;
                const rr = e.cellSize * (0.6 - 0.18 * gp);
                e.ring.circle(0, 0, rr).stroke({ width: 2, color: e.tint, alpha: 0.25 + 0.5 * gp });
                for (let k = 0; k < 8; k++) {
                    const a = (k / 8) * TAU + e.age * 3;
                    e.ring
                        .circle(Math.cos(a) * rr, Math.sin(a) * rr, e.cellSize * 0.03)
                        .fill({ color: e.tint, alpha: 0.5 * gp });
                }
                for (const m of e.motes) {
                    const r = m.startR * (1 - easeIn(gp));
                    const a = m.ang + e.age * 5;
                    m.gfx.position.set(Math.cos(a) * r, Math.sin(a) * r);
                    m.gfx.alpha = gp;
                    m.gfx.scale.set(0.5 + gp);
                }
            } else {
                const rp = (e.age - ENCHANT_GATHER) / (ENCHANT_LIFE - ENCHANT_GATHER); // 0..1
                if (!e.resolved) {
                    e.resolved = true;
                    this.spawnEnchantBurst(e);
                }
                for (const m of e.motes) {
                    m.gfx.alpha = Math.max(0, m.gfx.alpha - dt * 6);
                }
                if (e.success) {
                    const rr = e.cellSize * (0.42 + easeOutCubic(rp));
                    e.ring.circle(0, 0, rr).stroke({ width: 3 * (1 - rp), color: e.tint, alpha: (1 - rp) * 0.8 });
                    const pop = Math.min(1, rp / 0.28);
                    e.icon.scale.set(e.iconBaseScale * (0.5 + 0.5 * easeOutBack(pop)));
                    e.icon.position.y = -e.cellSize * (0.55 + 0.35 * easeOutCubic(rp));
                    e.icon.alpha = rp < 0.7 ? pop : Math.max(0, 1 - (rp - 0.7) / 0.3);
                    e.label.position.y = e.icon.position.y + e.cellSize * 0.5;
                    e.label.alpha = e.icon.alpha;
                    e.label.scale.set(0.6 + 0.4 * easeOutBack(pop));
                } else {
                    const rr = e.cellSize * (0.42 * (1 - rp * 0.6));
                    e.ring.circle(0, 0, rr).stroke({ width: 2 * (1 - rp), color: 0x888888, alpha: (1 - rp) * 0.5 });
                    const pop = Math.min(1, rp / 0.25);
                    // Show the (desaturated) rune rising before the "Failed" text, mirroring the success layout,
                    // so a failed cast still reads as a rune attempt rather than a bare label.
                    const fade = rp < 0.65 ? pop : Math.max(0, 1 - (rp - 0.65) / 0.35);
                    e.icon.scale.set(e.iconBaseScale * (0.5 + 0.5 * easeOutBack(pop)));
                    e.icon.position.y = -e.cellSize * (0.55 + 0.3 * easeOutCubic(rp));
                    e.icon.alpha = fade * 0.9;
                    e.label.position.y = e.icon.position.y + e.cellSize * 0.5;
                    e.label.alpha = fade;
                    e.label.scale.set(0.9);
                }
                const grav = e.cellSize * (e.success ? 6 : 9);
                for (let s = e.sparks.length - 1; s >= 0; s--) {
                    const sp = e.sparks[s];
                    sp.age += dt;
                    if (sp.age >= sp.life) {
                        sp.gfx.destroy();
                        e.sparks.splice(s, 1);
                        continue;
                    }
                    sp.vy += grav * dt;
                    sp.x += sp.vx * dt;
                    sp.y += sp.vy * dt;
                    sp.gfx.position.set(sp.x, sp.y);
                    sp.gfx.alpha = 1 - sp.age / sp.life;
                }
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
    /**
     * Pikeman's Skewer Strike: a wind "spear" that thrusts from the attacker through the primary target
     * and the unit(s) standing behind it. `points` is the ordered polyline of world centers
     * [attacker, target, behind…]. The bright tip travels the whole line fast, leaving a fading wind
     * trail, so a two-unit (or more) pierce reads instantly. Works the same in sandbox and ranked —
     * both call this with the attacker + struck units once the strike lands.
     */
    public spawnWindSpear(points: HoCMath.XY[], cellSize: number): void {
        if (points.length < 2) {
            return;
        }
        const pts = points.map((p) => ({ x: p.x, y: p.y }));
        const segLens: number[] = [];
        let total = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
            segLens.push(len);
            total += len;
        }
        if (total < 1) {
            return;
        }
        const container = new Container();
        this.context.attachToWorldRoot(container, WINDSPEAR_Z);
        const tex = this.getLightTexture();
        const mkOrb = (): Sprite => {
            const s = new Sprite(tex);
            s.anchor.set(0.5);
            s.blendMode = "add";
            s.tint = WINDSPEAR_TINT;
            s.visible = false;
            container.addChild(s);
            return s;
        };
        // Trail orbs first (drawn under the head), then the bright head on top.
        const trail: Sprite[] = [];
        for (let t = 0; t < WINDSPEAR_TRAIL_COUNT; t++) {
            trail.push(mkOrb());
        }
        const head = mkOrb();
        this.windSpears.push({
            container,
            head,
            trail,
            pts,
            segLens,
            total,
            cellSize,
            age: -WINDSPEAR_LEAD_MS / 1000,
            life: (WINDSPEAR_TRAVEL_MS + WINDSPEAR_FADE_MS) / 1000,
        });
    }
    /** World point at distance `d` along the spear's polyline (clamped to [0, total]). */
    private pointAlong(spear: IWindSpear, d: number): HoCMath.XY {
        const clamped = Math.max(0, Math.min(spear.total, d));
        let acc = 0;
        for (let i = 0; i < spear.segLens.length; i++) {
            const seg = spear.segLens[i];
            if (clamped <= acc + seg || i === spear.segLens.length - 1) {
                const t = seg > 0 ? (clamped - acc) / seg : 0;
                const a = spear.pts[i];
                const b = spear.pts[i + 1];
                return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            }
            acc += seg;
        }
        return spear.pts[spear.pts.length - 1];
    }
    private stepWindSpears(dt: number): void {
        const travel = WINDSPEAR_TRAVEL_MS / 1000;
        for (let i = this.windSpears.length - 1; i >= 0; i--) {
            const spear = this.windSpears[i];
            spear.age += dt;
            if (spear.age < 0) {
                continue; // thrust hasn't started (lead delay)
            }
            if (spear.age >= spear.life) {
                spear.container.destroy({ children: true });
                this.windSpears.splice(i, 1);
                continue;
            }
            // The light orb glides down the whole pierce line over the travel window; soft glow orbs lag
            // behind it as a comet-like trail. After it reaches the end, the whole thing fades out.
            const cs = spear.cellSize;
            const tipProgress = Math.min(1, spear.age / travel);
            const leadDist = easeOutCubic(tipProgress) * spear.total;
            // Fade out over the fade window once the light has reached the end of the line.
            const fadeT = Math.max(0, (spear.age - travel) / (WINDSPEAR_FADE_MS / 1000));
            const groupAlpha = Math.max(0, Math.min(1, 1 - fadeT));
            if (groupAlpha <= 0.01) {
                spear.head.visible = false;
                for (const s of spear.trail) {
                    s.visible = false;
                }
                continue;
            }

            const headSize = cs * WINDSPEAR_HEAD_CELLS;
            const texW = spear.head.texture.width || 64;
            const headPos = this.pointAlong(spear, leadDist);
            spear.head.visible = true;
            spear.head.position.set(headPos.x, headPos.y);
            spear.head.scale.set(headSize / texW);
            spear.head.alpha = groupAlpha;

            // Each trail orb sits a little further back along the line, shrinking and dimming — a soft
            // glow tail that reads as light streaming through (not a hard arrow).
            const spacing = cs * WINDSPEAR_TRAIL_SPACING;
            for (let s = 0; s < spear.trail.length; s++) {
                const orb = spear.trail[s];
                const d = leadDist - spacing * (s + 1);
                if (d < 0) {
                    orb.visible = false;
                    continue;
                }
                const k = 1 - (s + 1) / (spear.trail.length + 1); // 1 (near head) → ~0 (far back)
                const pos = this.pointAlong(spear, d);
                orb.visible = true;
                orb.position.set(pos.x, pos.y);
                orb.scale.set((headSize * (0.45 + 0.5 * k)) / texW);
                orb.alpha = groupAlpha * 0.55 * k;
            }
        }
    }
    /**
     * Shatter Armor: tear a single bloody GASH across the struck enemy at impact. `center` is the
     * target's world center; the gash is at a RANDOM angle (the blow direction is ignored so repeated
     * hits look different). Built as an irregular, tapered, slightly-bowed filled shape (not a straight
     * line) so it reads as an open wound, plus a few droplets that drip down. Same in sandbox + ranked.
     */
    public spawnSlash(center: HoCMath.XY, cellSize: number, _dir?: HoCMath.XY): void {
        const container = new Container();
        this.context.attachToWorldRoot(container, SLASH_Z);
        const gfx = new Graphics();
        gfx.visible = false; // normal blend — blood, not glow
        container.addChild(gfx);

        const ang = Math.random() * Math.PI * 2; // random trajectory
        const len = cellSize * (1.1 + Math.random() * 0.6);
        const ux = Math.cos(ang);
        const uy = Math.sin(ang);
        const px = -uy; // unit perpendicular to the cut
        const py = ux;
        const maxHalfW = cellSize * (0.14 + Math.random() * 0.07);
        const bow = (Math.random() - 0.5) * cellSize * 0.5; // one-sided curve so the cut isn't straight
        const N = 12;
        const top: HoCMath.XY[] = [];
        const bot: HoCMath.XY[] = [];
        const centerline: HoCMath.XY[] = [];
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            const along = (t - 0.5) * len;
            const taper = Math.sin(Math.PI * t); // 0 at the ends, 1 in the middle → tapered gash
            // Jagged, asymmetric half-width so the edges look torn rather than drawn.
            const wTop = maxHalfW * taper * (0.55 + Math.random() * 0.7);
            const wBot = maxHalfW * taper * (0.55 + Math.random() * 0.7);
            const curve = bow * taper;
            const cx = center.x + ux * along + px * curve;
            const cy = center.y + uy * along + py * curve;
            centerline.push({ x: cx, y: cy });
            top.push({ x: cx + px * wTop, y: cy + py * wTop });
            bot.push({ x: cx - px * wBot, y: cy - py * wBot });
        }
        const poly: HoCMath.XY[] = [...top, ...bot.reverse()];

        // A few blood droplets along the gash, given a downward (gravity) velocity so they drip.
        const drops: ISlashDrop[] = [];
        const dropCount = 4 + Math.floor(Math.random() * 4);
        for (let d = 0; d < dropCount; d++) {
            const c = centerline[1 + Math.floor(Math.random() * (centerline.length - 2))];
            drops.push({
                x: c.x,
                y: c.y,
                vx: (Math.random() - 0.5) * cellSize * 0.6,
                vy: -(Math.random() * cellSize * 0.5), // small initial upward fleck before gravity wins
                r: cellSize * (0.04 + Math.random() * 0.05),
                age: -Math.random() * 0.08, // slight stagger
                life: SLASH_DROP_LIFE * (0.6 + Math.random() * 0.4),
            });
        }

        this.slashes.push({
            container,
            gfx,
            poly,
            centerline,
            drops,
            age: 0,
            life: Math.max(SLASH_WOUND_LIFE, SLASH_DROP_LIFE),
            woundLife: SLASH_WOUND_LIFE,
        });
    }
    private stepSlashes(dt: number): void {
        for (let i = this.slashes.length - 1; i >= 0; i--) {
            const slash = this.slashes[i];
            slash.age += dt;
            if (slash.age >= slash.life) {
                slash.container.destroy({ children: true });
                this.slashes.splice(i, 1);
                continue;
            }
            const gfx = slash.gfx;
            gfx.clear();
            gfx.visible = true;

            // Wound: flash in fast, hold, then bleed out over its life.
            const wt = slash.age / slash.woundLife;
            const woundAlpha = slash.age >= slash.woundLife ? 0 : wt < 0.1 ? wt / 0.1 : 1 - (wt - 0.1) / 0.9;
            if (woundAlpha > 0.01 && slash.poly.length > 2) {
                gfx.moveTo(slash.poly[0].x, slash.poly[0].y);
                for (let p = 1; p < slash.poly.length; p++) {
                    gfx.lineTo(slash.poly[p].x, slash.poly[p].y);
                }
                gfx.closePath();
                gfx.fill({ color: SLASH_FILL, alpha: 0.92 * woundAlpha });
                gfx.stroke({ width: 2, color: SLASH_RIM, alpha: 0.85 * woundAlpha });
                // Bright deepest part of the cut, down the centerline.
                gfx.moveTo(slash.centerline[0].x, slash.centerline[0].y);
                for (let p = 1; p < slash.centerline.length; p++) {
                    gfx.lineTo(slash.centerline[p].x, slash.centerline[p].y);
                }
                gfx.stroke({ width: 2, color: SLASH_CORE, alpha: 0.9 * woundAlpha, cap: "round", join: "round" });
            }

            // Blood droplets dripping down with gravity.
            for (const drop of slash.drops) {
                drop.age += dt;
                if (drop.age < 0 || drop.age >= drop.life) {
                    continue;
                }
                drop.vy += SLASH_GRAVITY * dt;
                drop.x += drop.vx * dt;
                drop.y += drop.vy * dt;
                const dropAlpha = 1 - drop.age / drop.life;
                gfx.circle(drop.x, drop.y, drop.r * (0.7 + 0.3 * dropAlpha));
                gfx.fill({ color: SLASH_DROP, alpha: 0.9 * dropAlpha });
            }
        }
    }
    /**
     * Deep Wounds "claw rake": a fan of glowing orange claw marks that streak diagonally across the
     * target as the effect lands (Ursa-style). `intensity` is the effect's power % (Deep Wounds L1≈6,
     * L2≈13, L3≈21, and it stacks) — the deeper the wound, the more marks and the wider the rake.
     */
    public spawnClawSlash(center: HoCMath.XY, cellSize: number, intensity: number): void {
        const level = intensity >= 18 ? 3 : intensity >= 10 ? 2 : 1;
        const markCount = 2 + level; // 3, 4, or 5 claws
        const spanScale = 0.85 + 0.12 * level; // a deeper wound rakes bigger

        const container = new Container();
        this.context.attachToWorldRoot(container, CLAW_Z);
        const gfx = new Graphics();
        container.addChild(gfx);

        // Diagonal swipe (top-right → bottom-left), jittered so repeats don't look identical.
        const ang = -Math.PI / 3 + (Math.random() - 0.5) * 0.5;
        const ux = Math.cos(ang);
        const uy = Math.sin(ang);
        const px = -uy; // perpendicular: marks are offset along this, and each bows along it too
        const py = ux;
        const len = cellSize * 1.15 * spanScale;
        const spread = cellSize * 0.14; // gap between adjacent marks
        const maxHalfW = cellSize * 0.055; // each mark is thin
        const N = 10;

        const marks: IClawMark[] = [];
        for (let m = 0; m < markCount; m++) {
            const offset = (m - (markCount - 1) / 2) * spread;
            const bow = (0.35 + Math.random() * 0.2) * cellSize; // all marks curve the same way → a rake
            const top: HoCMath.XY[] = [];
            const bot: HoCMath.XY[] = [];
            const spine: HoCMath.XY[] = [];
            for (let i = 0; i <= N; i++) {
                const t = i / N;
                const along = (t - 0.5) * len;
                const taper = Math.sin(Math.PI * t); // pointed at both ends
                const w = maxHalfW * taper;
                const curve = bow * taper;
                const cx = center.x + ux * along + px * (offset + curve);
                const cy = center.y + uy * along + py * (offset + curve);
                spine.push({ x: cx, y: cy });
                top.push({ x: cx + px * w, y: cy + py * w });
                bot.push({ x: cx - px * w, y: cy - py * w });
            }
            marks.push({ top, bot, spine, delay: m * CLAW_STAGGER });
        }

        this.clawSlashes.push({ container, gfx, marks, age: 0, life: CLAW_LIFE });
    }
    private stepClawSlashes(dt: number): void {
        for (let i = this.clawSlashes.length - 1; i >= 0; i--) {
            const claw = this.clawSlashes[i];
            claw.age += dt;
            if (claw.age >= claw.life) {
                claw.container.destroy({ children: true });
                this.clawSlashes.splice(i, 1);
                continue;
            }
            const gfx = claw.gfx;
            gfx.clear();
            const lifeT = claw.age / claw.life;
            const fade = lifeT < CLAW_FADE_FROM ? 1 : 1 - (lifeT - CLAW_FADE_FROM) / (1 - CLAW_FADE_FROM);
            for (const mark of claw.marks) {
                const local = claw.age - mark.delay;
                if (local <= 0) {
                    continue;
                }
                // Rake: each mark streaks from its leading end to full length.
                const reveal = Math.min(1, local / CLAW_RAKE_DUR);
                const n = mark.spine.length - 1;
                const k = Math.max(1, Math.ceil(reveal * n));
                gfx.moveTo(mark.top[0].x, mark.top[0].y);
                for (let p = 1; p <= k; p++) {
                    gfx.lineTo(mark.top[p].x, mark.top[p].y);
                }
                for (let p = k; p >= 0; p--) {
                    gfx.lineTo(mark.bot[p].x, mark.bot[p].y);
                }
                gfx.closePath();
                gfx.fill({ color: CLAW_GLOW, alpha: 0.5 * fade });
                gfx.stroke({ width: 2, color: CLAW_MID, alpha: 0.85 * fade, cap: "round", join: "round" });
                // Hot core down the revealed spine.
                gfx.moveTo(mark.spine[0].x, mark.spine[0].y);
                for (let p = 1; p <= k; p++) {
                    gfx.lineTo(mark.spine[p].x, mark.spine[p].y);
                }
                gfx.stroke({ width: 1.5, color: CLAW_CORE, alpha: 0.95 * fade, cap: "round" });
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
        this.enqueueFloatingContainer(container, pos, direction);
    }
    public showDamageVisualsFromDiff(
        preState: Map<string, { hp: number; amount: number }>,
        attackerCell?: HoCMath.XY,
        ignoredUnitIds?: Set<string>,
        forcedDirection?: HoCMath.XY,
        alreadyDisplayedByUnit?: ReadonlyMap<string, { amount: number; unitsDied: number }>,
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
                const alreadyDisplayed = alreadyDisplayedByUnit?.get(id);
                const diff = Math.max(0, oldState.hp - newTotal - (alreadyDisplayed?.amount ?? 0));
                const unitsDied = Math.max(
                    0,
                    oldState.amount - u.getAmountAlive() - (alreadyDisplayed?.unitsDied ?? 0),
                );
                if (diff <= 0) {
                    continue;
                }

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
