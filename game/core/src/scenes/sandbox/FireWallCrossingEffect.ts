import { Sprite, type Texture } from "pixi.js";

type XY = { x: number; y: number };

/** One ember, smoke puff or core flash of a fire-damage burst (see spawnFireBurn). */
export interface FireBurnParticle {
    sprite: Sprite;
    age: number; // seconds; negative while the particle is still waiting to be born
    life: number;
    x: number;
    y: number;
    riseY: number;
    driftX: number;
    startScale: number;
    endScale: number;
    peakAlpha: number;
    fadeInFraction: number;
    rot: number;
    spin: number;
}

export const FIRE_TINTS = [0xff3a0a, 0xff6a14, 0xff9a2e, 0xffc861]; // ember red → flame orange → spark gold
export const BURN_SMOKE_TINTS = [0x4a423c, 0x39322d, 0x5c5148]; // warm soot greys, tinted off the ember texture
export const FIRE_GLOW_STOPS = [
    [0, 255, 255, 255, 1],
    [0.3, 255, 238, 170, 0.9],
    [0.65, 255, 135, 40, 0.45],
    [1, 255, 70, 0, 0],
] as const;

const WALL_CROSS_FLAME_COUNT = 28;

const WALL_CROSS_SPARK_COUNT = 20;

const WALL_CROSS_SMOKE_COUNT = 7;

const WALL_CROSS_RIPPLE_S = 0.28;

const WALL_CROSS_FLAME_LIFE = 0.78;

const WALL_CROSS_SPARK_LIFE = 0.9;

const WALL_CROSS_SMOKE_LIFE = 1.3;

const WALL_CROSS_FLASH_LIFE = 0.3;

export function fireWallCrossingParticles(
    tex: Texture,
    center: XY,
    cellSize: number,
    delaySec: number,
    flying: boolean,
    direction: XY,
): FireBurnParticle[] {
    const texW = tex.width || 64;
    const size = Math.max(1, cellSize);
    const wait = Math.max(0, delaySec);
    const particles: FireBurnParticle[] = [];

    const push = (sprite: Sprite, particle: Omit<FireBurnParticle, "sprite">): void => {
        sprite.anchor.set(0.5);
        sprite.scale.set(0.001);
        sprite.alpha = 0;
        sprite.visible = false;
        particles.push({ sprite, ...particle });
    };
    const spread = flying ? 0.34 : 0.7; // how wide the sheet is, in cells
    const lift = flying ? 2.3 : 1.15; // how high the flames leap, in cells

    // 1. The sheet catching on the body: one hot bloom, wide and low for a walker, tall for a flyer.
    const flash = new Sprite(tex);
    flash.blendMode = "add";
    flash.tint = 0xfff0c0;
    push(flash, {
        age: -wait,
        life: WALL_CROSS_FLASH_LIFE,
        x: center.x,
        y: center.y - size * (flying ? 0.45 : 0.05),
        riseY: size * (flying ? 0.7 : 0.2),
        driftX: 0,
        startScale: (size * 0.9) / texW,
        endScale: (size * (flying ? 2.0 : 2.6)) / texW,
        peakAlpha: 0.9,
        fadeInFraction: 0.1,
        rot: 0,
        spin: 0,
    });

    // 2. Flame tongues, erupting in a ripple from the middle of the cell outwards and kept coming for
    //    about as long as the body takes to cross, so the sheet burns under it rather than puffing once.
    for (let i = 0; i < WALL_CROSS_FLAME_COUNT; i++) {
        const rand = Math.random();
        const across = (Math.random() - 0.5) * 2; // -1..1 across the cell
        const sprite = new Sprite(tex);
        sprite.blendMode = "add";
        sprite.tint = FIRE_TINTS[Math.floor(Math.random() * FIRE_TINTS.length)];
        push(sprite, {
            age: -wait - Math.abs(across) * 0.06 - Math.random() * WALL_CROSS_RIPPLE_S,
            life: WALL_CROSS_FLAME_LIFE * (0.7 + 0.6 * rand),
            x: center.x + across * size * spread,
            y: center.y + size * 0.22 - Math.random() * size * 0.12,
            riseY: size * lift * (0.55 + 0.6 * rand) * (1 - Math.abs(across) * 0.35),
            driftX: (Math.random() - 0.5) * size * 0.22 + direction.x * size * (flying ? 0.05 : 0.28),
            startScale: (size * (0.45 + 0.45 * rand)) / texW,
            endScale: (size * (0.14 + 0.14 * rand)) / texW,
            peakAlpha: 1,
            fadeInFraction: 0.07,
            rot: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 5,
        });
    }

    // 3. Sparks: small, bright and thrown far — on and out for a walker kicking through the embers,
    //    straight up for a flyer.
    for (let i = 0; i < WALL_CROSS_SPARK_COUNT; i++) {
        const rand = Math.random();
        const angle = Math.random() * Math.PI * 2;
        const throwX = flying ? Math.cos(angle) * 0.4 : direction.x * (0.6 + rand * 0.7) + Math.cos(angle) * 0.35;
        const sprite = new Sprite(tex);
        sprite.blendMode = "add";
        sprite.tint = rand > 0.5 ? 0xfff2c4 : 0xffc861;
        push(sprite, {
            age: -wait - Math.random() * WALL_CROSS_RIPPLE_S,
            life: WALL_CROSS_SPARK_LIFE * (0.6 + 0.7 * rand),
            x: center.x + (Math.random() - 0.5) * size * 0.35,
            y: center.y + size * 0.12,
            riseY: size * (flying ? 1.6 + rand * 1.4 : 0.7 + rand),
            driftX: throwX * size,
            startScale: (size * (0.12 + 0.1 * rand)) / texW,
            endScale: (size * 0.03) / texW,
            peakAlpha: 1,
            fadeInFraction: 0.05,
            rot: 0,
            spin: 0,
        });
    }

    // 4. Soot, born as the flames gutter, drifting up and lingering over the crossed cell.
    for (let i = 0; i < WALL_CROSS_SMOKE_COUNT; i++) {
        const rand = Math.random();
        const sprite = new Sprite(tex);
        sprite.tint = BURN_SMOKE_TINTS[i % BURN_SMOKE_TINTS.length];
        push(sprite, {
            age: -wait - (0.12 + Math.random() * 0.25),
            life: WALL_CROSS_SMOKE_LIFE * (0.8 + 0.4 * rand),
            x: center.x + (Math.random() - 0.5) * size * 0.5,
            y: center.y + (Math.random() - 0.5) * size * 0.2,
            riseY: size * (0.8 + 0.5 * rand),
            driftX: (Math.random() - 0.5) * size * 0.5 + direction.x * size * 0.2,
            startScale: (size * (0.26 + 0.16 * rand)) / texW,
            endScale: (size * (0.7 + 0.4 * rand)) / texW,
            peakAlpha: 0.4,
            fadeInFraction: 0.25,
            rot: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 1.6,
        });
    }

    return particles;
}

export function drawFireBurnParticle(particle: FireBurnParticle, age: number, stretch: number, rotation: number): void {
    const { sprite, life, fadeInFraction, peakAlpha } = particle;
    sprite.visible = age >= 0 && age < life;
    if (!sprite.visible) return;
    const progress = age / life;
    const ease = 1 - (1 - progress) ** 3;
    sprite.position.set(particle.x + particle.driftX * ease, particle.y + particle.riseY * ease);
    const scale = particle.startScale + (particle.endScale - particle.startScale) * ease;
    sprite.scale.set(scale, scale * stretch);
    sprite.rotation = rotation;
    sprite.alpha = Math.max(
        0,
        Math.min(
            1,
            peakAlpha * (progress < fadeInFraction ? progress / fadeInFraction : (1 - progress) / (1 - fadeInFraction)),
        ),
    );
}

export const FIRE_WALL_AFTERBURN_SEC = 1.15;
export const ABLAZE_EMBERS_PER_SECOND = 44;
export const ABLAZE_GLOW_ALPHA = 0.5;
export const BURN_SMOKE_LIFE = 0.92;
const ABLAZE_EMBER_LIFE = 0.55;
const ABLAZE_SOOT_EVERY = 5;

export function fireAfterburnParticle(tex: Texture, center: XY, size: number, ordinal: number): FireBurnParticle {
    const texW = tex.width || 64;
    const rand = Math.random();
    const soot = ordinal % ABLAZE_SOOT_EVERY === 0;
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.scale.set(0.001);
    sprite.alpha = 0;
    sprite.visible = false;
    if (soot) {
        sprite.tint = BURN_SMOKE_TINTS[ordinal % BURN_SMOKE_TINTS.length];
    } else {
        sprite.blendMode = "add";
        sprite.tint = FIRE_TINTS[Math.floor(Math.random() * FIRE_TINTS.length)];
    }
    return {
        sprite,
        age: 0,
        life: soot ? BURN_SMOKE_LIFE * 0.8 : ABLAZE_EMBER_LIFE * (0.7 + 0.6 * rand),
        // Born low on the body and a little behind it, so the trail reads as flames
        // licking off the back of something moving.
        x: center.x + (Math.random() - 0.5) * size * 0.65,
        y: center.y + (Math.random() - 0.15) * size * 0.6,
        riseY: size * (soot ? 0.8 : 0.4 + 0.5 * rand),
        driftX: (Math.random() - 0.5) * size * 0.3,
        startScale: (size * (soot ? 0.28 : 0.26 + 0.24 * rand)) / texW,
        endScale: (size * (soot ? 0.65 : 0.05)) / texW,
        peakAlpha: soot ? 0.32 : 0.95,
        fadeInFraction: soot ? 0.3 : 0.1,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * (soot ? 1.5 : 5),
    };
}
