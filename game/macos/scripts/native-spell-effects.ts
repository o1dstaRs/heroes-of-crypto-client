import type { Container as PixiContainer } from "pixi.js";

import { animationAtlases } from "../../core/src/generated/animation_atlases";
import { images } from "../../core/src/generated/image_imports";
import { FireWallLayer } from "../../core/src/scenes/sandbox/FireWallLayer";
import {
    ABLAZE_EMBERS_PER_SECOND,
    ABLAZE_GLOW_ALPHA,
    drawFireBurnParticle,
    FIRE_GLOW_STOPS,
    FIRE_WALL_AFTERBURN_SEC,
    fireAfterburnParticle,
    fireWallCrossingParticles,
    type FireBurnParticle,
} from "../../core/src/scenes/sandbox/FireWallCrossingEffect";
import { fireWallCrossingSchedule } from "../../core/src/scenes/sandbox/fireWallCrossing";
import type { SpellAtmosphereSample } from "../../core/src/scenes/sandbox/SpellAtmosphere";
import { createFireParticleMaterials, SpellFireParticles } from "../../core/src/scenes/sandbox/SpellFireParticles";
import { SpellFireSprites } from "../../core/src/scenes/sandbox/SpellFireSprites";
import { ThunderbirdLightningProcedural } from "../../core/src/scenes/sandbox/ThunderbirdLightningProcedural";
import type { WhirlpoolFootprint as Footprint } from "../../core/src/scenes/sandbox/WhirlpoolSprites";
import { StunStars } from "../../core/src/scenes/StunStars";
import { STUN_ORBIT_DEFAULTS } from "../../core/src/settings/stunOrbitSettings";
import { atlasSources, Container, Filter, materialPixels, recordLayer, Sprite, Texture } from "./spell-drawing";

type Point = { x: number; y: number };
type Cast = {
    kind: string;
    start: number;
    flight?: number;
    size: number;
    from?: Point;
    to?: Point;
    hand?: Point[];
    handDuration?: number;
    ground?: Footprint;
    area?: Footprint;
    cells?: Footprint[];
    crossings?: { cell: Point; center: Point }[];
    path?: Point[];
    speed?: number;
    moveDuration?: number;
    flying?: boolean;
    actor?: number;
};
type Wall = { x: number; y: number; l: number; world: Point & { width: number; height: number } };

// The shared material generator only writes ImageData. JavaScriptCore supplies the same clamped RGBA
// buffer without a DOM canvas; Swift owns the textures and draws the resulting display list.
Object.assign(globalThis, {
    document: {
        createElement() {
            return {
                width: 0,
                height: 0,
                pixels: new Uint8ClampedArray(),
                getContext() {
                    return {
                        createImageData: (width: number, height: number) => ({
                            data: new Uint8ClampedArray(width * height * 4),
                        }),
                        putImageData: (image: { data: Uint8ClampedArray }) => {
                            this.pixels = image.data;
                        },
                    };
                },
            };
        },
    },
});

for (const [id, key, meta] of [
    [-1, images.vfx_ring_fire_hollow_burst_atlas, animationAtlases["Vfx Ring Fire Hollow"].burst],
    [-2, images.vfx_ring_fire_burst_atlas, animationAtlases["Vfx Ring Fire"].burst],
    [-3, images.vfx_meteor_shower_impact_atlas, animationAtlases["Vfx Meteor Shower"].impact],
] as const) {
    atlasSources.set(key, { id, width: meta.atlasWidth, height: meta.atlasHeight });
}

const materials = createFireParticleMaterials();
const crossingGlow = new Uint8ClampedArray(64 * 64 * 4);
for (let i = 0; i < 64 * 64; i++) {
    const radius = Math.hypot((i % 64) - 31.5, Math.floor(i / 64) - 31.5) / 32;
    const stop = FIRE_GLOW_STOPS.findIndex(([distance]) => distance >= radius);
    if (stop < 1) continue;
    const first = FIRE_GLOW_STOPS[stop - 1],
        last = FIRE_GLOW_STOPS[stop];
    const weight = (radius - first[0]) / (last[0] - first[0]);
    for (let channel = 1; channel <= 4; channel++) {
        const value = first[channel] + (last[channel] - first[channel]) * weight;
        crossingGlow[i * 4 + channel - 1] = value * (channel === 4 ? 255 : 1);
    }
}
const crossingTexture = Texture.from({ pixels: crossingGlow, width: 64, height: 64 });
const world = new Container();
world.scale.y = -1;
const attach = (node: PixiContainer, depth: number) => {
    node.zIndex = depth;
    world.addChild(node as unknown as Container);
};
let time = 0;
let lastFrame: number | undefined;
let ambient: SpellAtmosphereSample[] = [];
let walls: Wall[] = [];
let wallSize = 1;
let wallStarted: number | undefined;
const wallLayers = new WeakSet<Container>();
const attachWall = (node: PixiContainer, depth: number) => {
    wallLayers.add(node as unknown as Container);
    attach(node, depth);
};
const now = () => time;
const emit = (sample: SpellAtmosphereSample) => ambient.push(sample);
const particles = new SpellFireParticles(attach, now, () => materials, emit);
const sprites = new SpellFireSprites(attach, now, emit);
const lightning = new ThunderbirdLightningProcedural(attach, now, emit);
let wall = new FireWallLayer(attachWall, () => materials, attach);
type Afterburn = {
    actor: number;
    glow: Sprite;
    delay: number;
    duration: number;
    size: number;
    debt: number;
    emitted: number;
};
let crossingEffects: { layer: Container; start: number; particles: FireBurnParticle[]; afterburn?: Afterburn }[] = [];

function begin(cast: Cast): Promise<void> | void {
    const previous = time;
    time = cast.start;
    try {
        const { kind, from, to, size, ground, area } = cast;
        if (kind === "Lightning Strike" && to) lightning.spawn([to], size, "natural");
        if (kind === "Ring of Fire" && ground && area) return sprites.ring(ground, area, true, cast.start);
        if (kind === "Meteor Shower" && cast.cells) return sprites.meteors(cast.cells, cast.start);
        if (kind === "Meteorite" && cast.cells) particles.meteors(cast.cells);
        if (kind === "Fire Wall Crossing" && cast.crossings?.length) {
            const layer = new Container();
            layer.zIndex = 5525;
            world.addChild(layer);
            const positions = new Map(cast.crossings.map(({ cell, center }) => [`${cell.x},${cell.y}`, center]));
            const steps = fireWallCrossingSchedule(
                cast.path ?? [],
                cast.crossings.map(({ cell }) => cell),
                ({ x, y }) => ({ x: x + 0.5, y: y + 0.5 }),
                cast.speed ?? 0,
            );
            const sparks = steps.flatMap(({ cell, delaySec, direction }) =>
                fireWallCrossingParticles(
                    crossingTexture as unknown as Parameters<typeof fireWallCrossingParticles>[0],
                    positions.get(`${cell.x},${cell.y}`)!,
                    size,
                    cast.flying ? (cast.moveDuration ?? delaySec) : delaySec,
                    cast.flying ?? false,
                    direction,
                ),
            );
            layer.addChild(...sparks.map(({ sprite }) => sprite as unknown as Container));
            let afterburn: Afterburn | undefined;
            if (cast.actor !== undefined && steps.length) {
                const first = cast.flying ? (cast.moveDuration ?? 0) : steps[0].delaySec;
                const last = cast.flying ? first : steps[steps.length - 1].delaySec;
                const glow = new Sprite(crossingTexture);
                glow.anchor.set(0.5);
                glow.blendMode = "add";
                glow.tint = 0xff7a1a;
                glow.visible = false;
                glow.width = glow.height = size * 1.5;
                layer.addChild(glow);
                afterburn = {
                    actor: cast.actor,
                    glow,
                    delay: first,
                    duration: last - first + FIRE_WALL_AFTERBURN_SEC,
                    size,
                    debt: 0,
                    emitted: 0,
                };
            }
            crossingEffects.push({ layer, start: cast.start, particles: sparks, afterburn });
        }
        if (!from || !to || !ground) return;
        const target = { center: to, width: size, height: size };
        if (kind === "Fire Strike") {
            const hand = cast.hand ?? [];
            const source = hand.length
                ? () => {
                      const progress = Math.max(
                          0,
                          Math.min(1, (time - cast.start) / Math.max(1, cast.handDuration ?? 1)),
                      );
                      return hand[Math.min(hand.length - 1, Math.floor(progress * hand.length))];
                  }
                : undefined;
            particles.strike(from, target, ground, source, undefined, cast.flight);
        } else if (kind === "Fireball" && area) {
            particles.fireball(from, target, ground, () => particles.fireballImpact(ground, area), cast.flight);
        }
    } finally {
        time = previous;
    }
}

function render(frameTime: number, actors: Record<number, Point> = {}) {
    const dt = lastFrame === undefined ? 1 / 60 : Math.max(0, (frameTime - lastFrame) / 1000);
    lastFrame = frameTime;
    time = frameTime;
    ambient = [];
    particles.update();
    sprites.update();
    lightning.update();
    // The display list goes idle between spells. That gap must never count as ignition time.
    const wallDelta = wallStarted === undefined ? dt : Math.min(dt, Math.max(0, (frameTime - wallStarted) / 1000));
    wall.update(wallDelta, walls, wallSize, (cell) => (cell as Wall).world);
    wallStarted = undefined;
    crossingEffects = crossingEffects.filter(({ layer, start, particles: sparks, afterburn }) => {
        const elapsed = (frameTime - start) / 1000;
        let active = false;
        if (afterburn) {
            const age = elapsed - afterburn.delay;
            const center = actors[afterburn.actor];
            active = age < afterburn.duration;
            afterburn.glow.visible = active && age >= 0 && center !== undefined;
            if (afterburn.glow.visible && center) {
                const progress = age / afterburn.duration;
                afterburn.glow.position.set(center.x, center.y + afterburn.size * 0.15);
                afterburn.glow.alpha = ABLAZE_GLOW_ALPHA * (1 - progress) * (0.8 + 0.2 * Math.sin(age * 23));
                afterburn.debt += Math.min(dt, 0.1) * ABLAZE_EMBERS_PER_SECOND * (1 - progress * 0.7);
                while (afterburn.debt >= 1) {
                    afterburn.debt -= 1;
                    const ember = fireAfterburnParticle(
                        crossingTexture as unknown as Parameters<typeof fireAfterburnParticle>[0],
                        center,
                        afterburn.size,
                        ++afterburn.emitted,
                    );
                    ember.age = -elapsed;
                    layer.addChild(ember.sprite as unknown as Container);
                    sparks.push(ember);
                }
            }
        }
        for (const spark of sparks) {
            const age = elapsed + spark.age;
            drawFireBurnParticle(spark, age, 1, spark.rot + Math.max(0, age) * spark.spin);
            if (age < spark.life) active = true;
        }
        if (!active) layer.destroy({ children: true });
        return active;
    });

    const heat: number[] = [];
    for (const filter of world.filters ?? []) {
        if (!(filter instanceof Filter)) continue;
        const uniforms = filter.resources.atmosphere.uniforms;
        for (let i = 0; i < 16; i++) {
            const region = uniforms[`uRegion${i}`] as Float32Array;
            const energy = uniforms[`uEnergy${i}`] as Float32Array;
            if (region[2] > 0 && region[3] > 0 && energy[1] > 0) {
                heat.push(region[0], -region[1], region[2], region[3], energy[1], Number(uniforms.uTime));
            }
            if (region[2] > 0 && energy[0] > 0) {
                emit({
                    x: region[0],
                    y: region[1],
                    width: region[2],
                    height: region[3],
                    light: energy[0],
                    cool: energy[3],
                });
            }
        }
    }
    const lights = ambient
        .sort((a, b) => b.light - a.light)
        .slice(0, 16)
        .flatMap(({ x, y, width, height, light, cool }) => [x, -y, width, height, light, cool ?? 0]);
    return {
        layers: world.children
            .filter((node) => node.visible && node.renderable)
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((node) => ({ depth: node.zIndex, wall: wallLayers.has(node), commands: recordLayer(node) })),
        lights: new Float32Array(lights),
        heat: new Float32Array(heat),
    };
}

// Status stars have their own lifetime, independent of the cast and damage particles in the world layer.
const statusRoot = new Container();
statusRoot.scale.y = -1;
const stunned = new Map<number, { flag: Container; effect: StunStars }>();
function drawStunStars(timestamp: number, cell: number, stacks: ({ id: number } & Point)[]): Float32Array {
    const ids = new Set(stacks.map(({ id }) => id));
    for (const [id, { flag, effect }] of stunned) {
        if (ids.has(id)) continue;
        effect.destroy();
        flag.destroy();
        stunned.delete(id);
    }
    for (const { id, x, y } of stacks) {
        let status = stunned.get(id);
        if (!status) {
            status = { flag: new Container(), effect: new StunStars() };
            statusRoot.addChild(status.flag);
            stunned.set(id, status);
        }
        status.flag.position.set(x, -y);
        status.effect.update(
            status.flag as unknown as PixiContainer,
            timestamp,
            cell,
            Math.max(17, cell * 0.42),
            Math.max(9, cell * 0.2),
            STUN_ORBIT_DEFAULTS,
        );
    }
    return recordLayer(statusRoot, [1, 0, 0, 1, 0, 0]);
}

Object.assign(globalThis, {
    hocSpellEffects: {
        materialPixels,
        begin,
        render,
        drawStunStars,
        setWalls(cells: Wall[], size: number, changedAt?: number) {
            if (!walls.length && cells.length) wallStarted = changedAt;
            walls = cells;
            wallSize = size;
        },
        clear() {
            particles.clear();
            sprites.clear();
            lightning.clear();
            wall.destroy();
            wall = new FireWallLayer(attachWall, () => materials, attach);
            for (const crossing of crossingEffects) crossing.layer.destroy({ children: true });
            crossingEffects = [];
            walls = [];
            wallStarted = undefined;
            lastFrame = undefined;
        },
    },
});
