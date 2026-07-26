import { Container, Graphics, Filter } from "pixi.js";

import type { HoCMath } from "@heroesofcrypto/common";

/**
 * Ground smoke laid down by the Smoke spell (Ash Moth's Book of Chaos).
 *
 * Deliberately its OWN layer, not a reuse of SmokeLayer: that one is kicked-up movement DUST — thin,
 * short-lived, tied to a fading track. This is a persistent tactical object that sits on a cell for
 * several laps and halves ranged damage through it, so it has to read as a heavy, settled bank of smoke
 * a player can see and plan around, and it must not decay on its own — the ENGINE owns its lifetime.
 *
 * Driven straight off the authoritative `FightProperties.smokeClouds` rather than off the
 * smoke_placed/dispel/expired events, which is what makes it work in sandbox and ranked from one code
 * path: that store rides the snapshot, so the ranked client already has it without replaying anything.
 * Same reasoning as narrowing and terrain.
 *
 * Rendering follows the proven pattern in SmokeLayer/WindLayer: draw soft blobs into a Graphics, then run
 * an fBM (fractal-Brownian-motion) fragment shader that domain-warps the lookup and erodes the density, so
 * round blobs become billowing wisps. If the shader fails to build we still render the soft blobs.
 *
 * Refs: PixiJS v8 custom filters (Filter.from + GLSL ES 3.0); fBM / domain warping from
 * thebookofshaders.com/13 and Inigo Quilez's warp articles.
 */

// Standard PixiJS v8 filter vertex (provides vTextureCoord + correct output framing).
const CLOUD_VERTEX = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const CLOUD_FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Six octaves (dust uses five): a settled bank needs finer curl at its edges to avoid reading as a blob.
float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 6; i++) {
        v += amp * vnoise(p);
        p *= 2.0;
        amp *= 0.5;
    }
    return v;
}

void main(void) {
    vec2 uv = vTextureCoord;
    float t = uTime;

    // TWO-SCALE domain warp. A single warp gives uniform wobble that reads as a wet blur; feeding a slow
    // coarse warp into a faster fine one is what produces the folding, curling motion of real smoke.
    vec2 coarse = vec2(
        fbm(uv * 2.0 + vec2(0.0, t * 0.045)),
        fbm(uv * 2.0 + vec2(3.7, 1.9) - vec2(t * 0.035, 0.0))
    );
    vec2 fine = vec2(
        fbm(uv * 6.0 + coarse * 1.6 + vec2(0.0, t * 0.10)),
        fbm(uv * 6.0 + coarse * 1.6 + vec2(2.4, 8.1) + vec2(t * 0.075, 0.0))
    );
    // Warp harder than the dust layer (0.09): this smoke should visibly boil, not just shimmer.
    vec2 sampleUv = uv + (coarse - 0.5) * 0.085 + (fine - 0.5) * 0.055;

    vec4 col = texture(uTexture, sampleUv);

    // Erode with a slow field so the body holds together (a tactical marker must stay legible) while its
    // edges tear into wisps. Drifts up-left, so neighbouring cells don't pulse in lockstep.
    float n = fbm(uv * 5.0 - vec2(t * 0.05, t * 0.028));
    float density = smoothstep(0.12, 0.86, n);

    // Cooler in the thin parts, warmer in the thick — smoke scatters light unevenly, and a flat grey
    // cloud looks like fog. Subtle: this rides on top of the per-cell tint, it does not replace it.
    float body = smoothstep(0.35, 0.95, density);
    vec3 shade = mix(vec3(0.86, 0.88, 0.95), vec3(1.06, 1.02, 0.98), body);

    // col is premultiplied; scaling by a scalar keeps it valid.
    finalColor = vec4(col.rgb * shade, col.a) * (0.30 + 0.80 * density);
}
`;

/** One smoked cell as the engine reports it: board cell + laps of life left. */
export interface ISmokeCloudCell {
    x: number;
    y: number;
    l: number;
}

/** Seconds a cloud takes to billow in when placed / fade out once the engine drops it. */
const APPEAR_SECONDS = 0.55;
const VANISH_SECONDS = 0.75;

interface ITrackedCloud {
    /** Board cell, kept so we can re-resolve the world position if the grid is rebuilt. */
    cell: HoCMath.XY;
    x: number;
    y: number;
    /** Stable per-cell seed so a cloud's shape never flickers between frames. */
    seed: number;
    lapsRemaining: number;
    /** 0..1 billow-in, then back to 0 on the way out. */
    presence: number;
    /** The engine still lists this cell; false starts the fade-out. */
    alive: boolean;
}

export class SmokeCloudLayer {
    private readonly container = new Container();
    private readonly graphics = new Graphics();
    private filter?: Filter;
    private time = 0;
    private readonly clouds = new Map<number, ITrackedCloud>();
    public constructor() {
        this.container.addChild(this.graphics);
        try {
            this.filter = Filter.from({
                gl: { vertex: CLOUD_VERTEX, fragment: CLOUD_FRAGMENT },
                resources: {
                    smokeCloudUniforms: {
                        uTime: { value: 0, type: "f32" },
                    },
                },
            });
            // Render at display resolution; Filter.from defaults to 1, which upscales from a 1x texture on
            // HiDPI screens and looks blocky.
            this.filter.resolution = Math.min(window.devicePixelRatio || 1, 2);
            // Generous padding: this warps harder than the dust layer, so give the wisps room to bleed
            // past the blob bounds instead of being clipped into straight edges.
            this.filter.padding = 44;
            this.container.filters = [this.filter];
        } catch {
            // Shader unavailable — fall back to plain soft blobs (still drawn below).
            this.filter = undefined;
        }
    }
    public getContainer(): Container {
        return this.container;
    }
    /**
     * Reconcile against the authoritative cloud list and advance the animation.
     *
     * `cells` is the engine's truth for THIS frame. Anything it stops listing fades out rather than
     * vanishing on the spot: the engine drops a cloud the instant a creature steps in, and popping it
     * would read as a rendering glitch rather than as smoke being displaced.
     */
    public update(dt: number, cells: readonly ISmokeCloudCell[], cellSize: number, toWorld: ToWorld): void {
        this.time += dt;
        if (this.filter) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = this.filter.resources as any;
            if (res?.smokeCloudUniforms?.uniforms) {
                res.smokeCloudUniforms.uniforms.uTime = this.time;
            }
        }

        for (const cloud of this.clouds.values()) {
            cloud.alive = false;
        }
        for (const c of cells) {
            const key = (c.x << 8) | (c.y & 0xff);
            const world = toWorld(c);
            if (!world) {
                continue;
            }
            const existing = this.clouds.get(key);
            if (existing) {
                existing.alive = true;
                existing.lapsRemaining = c.l;
                existing.x = world.x;
                existing.y = world.y;
            } else {
                this.clouds.set(key, {
                    cell: { x: c.x, y: c.y },
                    x: world.x,
                    y: world.y,
                    // Mixing both axes keeps neighbouring cells from sharing a shape.
                    seed: Math.abs(Math.sin(c.x * 127.1 + c.y * 311.7) * 43758.5453) % 1000,
                    lapsRemaining: c.l,
                    presence: 0,
                    alive: true,
                });
            }
        }

        for (const [key, cloud] of this.clouds) {
            if (cloud.alive) {
                cloud.presence = Math.min(1, cloud.presence + dt / APPEAR_SECONDS);
            } else {
                cloud.presence -= dt / VANISH_SECONDS;
                if (cloud.presence <= 0) {
                    this.clouds.delete(key);
                }
            }
        }

        this.draw(cellSize);
    }
    private draw(cellSize: number): void {
        const g = this.graphics;
        g.clear();
        if (!this.clouds.size) {
            return;
        }

        const rnd = (a: number, b: number): number => {
            const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
            return x - Math.floor(x);
        };
        // Cool slate greys. Darker than the dust layer's warm tans so spell smoke never reads as a
        // movement track, and so it stays visible over both the lit and the darkened floor.
        const tints = [0x6f7480, 0x7d8290, 0x646974];

        for (const cloud of this.clouds.values()) {
            const p = Math.max(0, Math.min(1, cloud.presence));
            // Ease the billow so it swells in rather than scaling linearly.
            const eased = p * p * (3 - 2 * p);
            // A cloud on its last lap is visibly thinner — the player can read "this is about to clear"
            // off the board instead of having to remember when it was cast.
            const lapFade = cloud.lapsRemaining <= 1 ? 0.62 : 1;
            const alpha = 0.5 * eased * lapFade;
            if (alpha <= 0.001) {
                continue;
            }

            const seed = cloud.seed;
            // Enough puffs to fill a cell as one connected mass; the shader tears the outline apart.
            const puffs = 7 + Math.floor(rnd(seed, 0) * 3);
            const baseR = cellSize * 0.5;

            for (let i = 0; i < puffs; i++) {
                const ang = seed + (i * 2 * Math.PI) / puffs + (rnd(seed, i + 3) - 0.5) * 0.9;
                // Slow per-puff orbit so the mass churns in place instead of sitting frozen between the
                // shader's wisps — the cloud stays on its cell, which matters because the cell IS the rule.
                const churn = this.time * (0.1 + rnd(seed, i + 41) * 0.07) + i;
                const spread = baseR * (0.16 + rnd(seed, i + 9) * 0.34) * eased;
                const px = cloud.x + Math.cos(ang + churn * 0.5) * spread;
                const py = cloud.y + Math.sin(ang + churn * 0.5) * spread * 0.7;
                const pr = baseR * (0.42 + 0.34 * rnd(seed, i + 25)) * (0.55 + 0.45 * eased);
                g.circle(px, py, pr).fill({ color: tints[Math.floor(rnd(seed, i + 2) * tints.length)], alpha });
            }
        }
    }
    public destroy(): void {
        this.container.destroy({ children: true });
    }
}

/** Resolve a board cell to its world centre; returns undefined for a cell that is off-grid. */
export type ToWorld = (cell: HoCMath.XY) => HoCMath.XY | undefined;
