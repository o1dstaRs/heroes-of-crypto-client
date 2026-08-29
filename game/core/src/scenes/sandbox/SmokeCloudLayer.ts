import { Container, Graphics, Filter } from "pixi.js";

import type { HoCMath } from "@heroesofcrypto/common";

/**
 * Ground smoke laid down by the Smoke spell (Wandering Mage's Book of Chaos).
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
// Slowly-turning wind direction, shared by every cloud so the whole board drifts as one weather system
// rather than each cell inventing its own breeze. Set from the CPU each frame.
uniform vec2 uWind;

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

// Curl-style rotational offset: rotating the warp field instead of only translating it is what makes
// smoke ROLL rather than slide. Cheap approximation — two fbm taps read as a vector we spin over time.
vec2 curl(vec2 p, float t) {
    float a = fbm(p + vec2(0.0, t * 0.06));
    float b = fbm(p + vec2(5.2, 1.3) - vec2(t * 0.05, 0.0));
    float ang = (a - b) * 6.2831853;
    return vec2(cos(ang), sin(ang));
}

void main(void) {
    vec2 uv = vTextureCoord;
    float t = uTime;

    // THREE-SCALE warp with a rotational term. A single warp reads as a wet blur; layering a slow coarse
    // field into a faster fine one gives folding; adding curl makes those folds actually TUMBLE, which is
    // the difference between "wobbling blob" and smoke.
    // Every field is ADVECTED along the wind (scaled per octave: coarse structures ride it slowly, fine
    // detail is dragged fastest). That directional streaming is what makes it look blown rather than
    // simmering in place — the old version only ever drifted each field along its own fixed axis.
    vec2 w = uWind;
    vec2 coarse = vec2(
        fbm(uv * 2.0 + w * t * 0.10 + vec2(0.0, t * 0.055)),
        fbm(uv * 2.0 + w * t * 0.10 + vec2(3.7, 1.9) - vec2(t * 0.042, 0.0))
    );
    vec2 fine = vec2(
        fbm(uv * 6.0 + coarse * 1.7 + w * t * 0.26 + vec2(0.0, t * 0.13)),
        fbm(uv * 6.0 + coarse * 1.7 + w * t * 0.26 + vec2(2.4, 8.1) + vec2(t * 0.095, 0.0))
    );
    vec2 detail = vec2(
        fbm(uv * 13.0 + fine * 1.1 + w * t * 0.55 - vec2(t * 0.16, 0.0)),
        fbm(uv * 13.0 + fine * 1.1 + w * t * 0.55 + vec2(9.1, 4.4) + vec2(0.0, t * 0.14))
    );
    // Gusts: the warp strength itself breathes, so the cloud surges and eases instead of churning at one
    // constant rate. Two out-of-phase sines never line up into an obvious loop.
    float gust = 0.82 + 0.30 * sin(t * 0.23) + 0.14 * sin(t * 0.61 + 1.7);
    vec2 roll = curl(uv * 3.0 + w * t * 0.18, t) * 0.030 * gust;
    // Lean the whole sample downwind a touch as well, so the silhouette itself is pushed, not just
    // stirred internally. Kept small — the cloud must stay legibly ON its cell, since the cell IS the rule.
    vec2 lean = w * (0.016 + 0.010 * sin(t * 0.31));
    vec2 sampleUv =
        uv + ((coarse - 0.5) * 0.105 + (fine - 0.5) * 0.070 + (detail - 0.5) * 0.030) * gust + roll + lean;

    vec4 col = texture(uTexture, sampleUv);

    // Two erosion fields drifting in DIFFERENT directions at different rates. One field alone pulses the
    // whole cloud in unison; crossing two keeps parts thinning while others thicken, so the mass is never
    // still and never repeats obviously.
    float n1 = fbm(uv * 5.0 + w * t * 0.14 - vec2(t * 0.06, t * 0.033));
    float n2 = fbm(uv * 9.0 + w * t * 0.34 + vec2(t * 0.043, -t * 0.052) + 4.7);
    float n = mix(n1, n2, 0.42);
    float density = smoothstep(0.10, 0.88, n);

    // Wispy tendrils: a thin high-frequency band pulled along the curl, added only at the cloud's EDGE
    // (where the body is thin) so the silhouette frays instead of the core turning noisy.
    float edge = smoothstep(0.55, 0.12, density);
    // Wisps stream fastest of all — they are the part the wind visibly tears off the edge.
    float wisp = smoothstep(0.60, 0.95, fbm(uv * 16.0 + roll * 9.0 + w * t * 0.85 + vec2(0.0, -t * 0.20)));
    density += edge * wisp * 0.34 * gust;

    // Slow internal light shift — the mass looks lit from within as it churns, rather than flat grey.
    float body = smoothstep(0.32, 0.95, density);
    float glow = 0.5 + 0.5 * sin(t * 0.35 + fbm(uv * 3.0) * 6.2831853);
    vec3 thin = mix(vec3(0.82, 0.85, 0.95), vec3(0.90, 0.90, 0.99), glow);
    vec3 thick = mix(vec3(1.02, 0.99, 0.96), vec3(1.12, 1.06, 0.99), glow);
    vec3 shade = mix(thin, thick, body);

    // col is premultiplied; scaling by a scalar keeps it valid.
    finalColor = vec4(col.rgb * shade, col.a) * (0.26 + 0.86 * clamp(density, 0.0, 1.2));
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
    cellSize: number;
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
    /**
     * Wind direction, shared by every cloud so the board reads as one weather system. The angle wanders
     * slowly (two incommensurable sines, so it never settles into a visible loop) rather than being fixed:
     * a constant direction reads as a scrolling texture, and a fast one reads as a storm.
     */
    private windX = 1;
    private windY = 0;
    private readonly clouds = new Map<number, ITrackedCloud>();
    /** Avoid repeatedly invalidating an already-empty Pixi Graphics buffer. */
    private hasGeometry = false;
    public constructor() {
        this.container.addChild(this.graphics);
        try {
            this.filter = Filter.from({
                gl: { vertex: CLOUD_VERTEX, fragment: CLOUD_FRAGMENT },
                resources: {
                    smokeCloudUniforms: {
                        uTime: { value: 0, type: "f32" },
                        uWind: { value: new Float32Array([1, 0]), type: "vec2<f32>" },
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
        const windAngle = Math.sin(this.time * 0.055) * 0.9 + Math.sin(this.time * 0.021 + 2.1) * 0.5;
        const windSpeed = 0.75 + 0.35 * Math.sin(this.time * 0.13 + 0.7);
        this.windX = Math.cos(windAngle) * windSpeed;
        this.windY = Math.sin(windAngle) * windSpeed * 0.6;
        if (this.filter) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = this.filter.resources as any;
            if (res?.smokeCloudUniforms?.uniforms) {
                res.smokeCloudUniforms.uniforms.uTime = this.time;
                const wind = res.smokeCloudUniforms.uniforms.uWind;
                if (wind) {
                    wind[0] = this.windX;
                    wind[1] = this.windY;
                }
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
                existing.cellSize = world.cellSize ?? cellSize;
            } else {
                this.clouds.set(key, {
                    cell: { x: c.x, y: c.y },
                    x: world.x,
                    y: world.y,
                    cellSize: world.cellSize ?? cellSize,
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
    private draw(_cellSize: number): void {
        const g = this.graphics;
        if (!this.clouds.size) {
            if (this.hasGeometry) {
                g.clear();
                this.hasGeometry = false;
            }
            return;
        }
        g.clear();
        this.hasGeometry = true;

        const rnd = (a: number, b: number): number => {
            const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
            return x - Math.floor(x);
        };
        // Cool slate greys. Darker than the dust layer's warm tans so spell smoke never reads as a
        // movement track, and so it stays visible over both the lit and the darkened floor. Three depths:
        // a dark underbelly, the mid mass, and pale highlights that catch the light as the cloud turns.
        const tints = [0x5a5f6b, 0x6f7480, 0x7d8290, 0x8b90a0, 0x9aa0b2];

        for (const cloud of this.clouds.values()) {
            const p = Math.max(0, Math.min(1, cloud.presence));
            // Ease the billow so it swells in rather than scaling linearly.
            const eased = p * p * (3 - 2 * p);
            // A cloud on its last lap is visibly thinner — the player can read "this is about to clear"
            // off the board instead of having to remember when it was cast.
            const lapFade = cloud.lapsRemaining <= 1 ? 0.62 : 1;
            const alpha = 0.62 * eased * lapFade;
            if (alpha <= 0.001) {
                continue;
            }

            const seed = cloud.seed;
            // Enough puffs to fill a cell as one connected mass; the shader tears the outline apart.
            // Two passes: a wide, dark UNDERBELLY that grounds the cloud, then a tighter, brighter CORE on
            // top. One flat ring of equal puffs reads as a smudge; layering gives it depth and volume.
            const puffs = 9 + Math.floor(rnd(seed, 0) * 4);
            const baseR = cloud.cellSize * 0.5;

            // Underbelly: wide, dark, slow — the part that looks like it has weight.
            for (let i = 0; i < 5; i++) {
                const ang = seed * 1.7 + (i * 2 * Math.PI) / 5 + (rnd(seed, i + 71) - 0.5) * 1.2;
                const drift = this.time * (0.05 + rnd(seed, i + 83) * 0.04);
                const spread = baseR * (0.24 + rnd(seed, i + 91) * 0.3) * eased;
                // Heavier air hugs the ground: the underbelly leans downwind about half as far as the core.
                const baseLean = baseR * 0.1 * Math.sin(this.time * 0.33 + i * 1.3);
                const px = cloud.x + Math.cos(ang + drift) * spread + this.windX * baseLean;
                const py = cloud.y + Math.sin(ang + drift) * spread * 0.55 + this.windY * baseLean;
                const pr = baseR * (0.62 + 0.3 * rnd(seed, i + 97)) * (0.6 + 0.4 * eased);
                g.circle(px, py, pr).fill({ color: 0x4b505c, alpha: alpha * 0.55 });
            }

            for (let i = 0; i < puffs; i++) {
                const ang = seed + (i * 2 * Math.PI) / puffs + (rnd(seed, i + 3) - 0.5) * 0.9;
                // Slow per-puff orbit so the mass churns in place instead of sitting frozen between the
                // shader's wisps — the cloud stays on its cell, which matters because the cell IS the rule.
                const churn = this.time * (0.14 + rnd(seed, i + 41) * 0.11) + i;
                // Breathe each puff's orbit AND radius on its own phase, so the mass swells and settles
                // unevenly instead of rotating as one rigid ring.
                const breathe = 0.85 + 0.15 * Math.sin(this.time * (0.5 + rnd(seed, i + 57) * 0.4) + i * 1.7);
                // Wind sway: each puff leans downwind on its OWN phase and by its own amount, so the mass
                // SHEARS as it blows rather than sliding rigidly. Bounded sine, so it always returns and
                // the cloud stays on the cell that carries the rule.
                const sway = Math.sin(this.time * (0.42 + rnd(seed, i + 61) * 0.3) + i * 0.9);
                const lean = baseR * (0.14 + 0.16 * rnd(seed, i + 67)) * sway;
                const spread = baseR * (0.16 + rnd(seed, i + 9) * 0.34) * eased * breathe;
                const px = cloud.x + Math.cos(ang + churn * 0.5) * spread + this.windX * lean;
                const py = cloud.y + Math.sin(ang + churn * 0.5) * spread * 0.7 + this.windY * lean;
                const pr = baseR * (0.42 + 0.34 * rnd(seed, i + 25)) * (0.55 + 0.45 * eased) * breathe;
                g.circle(px, py, pr).fill({ color: tints[Math.floor(rnd(seed, i + 2) * tints.length)], alpha });
            }

            // Ash flecks: a few tiny bright motes riding the churn. They catch the eye and sell the cloud
            // as something burning rather than a static grey shape — the Book of CHAOS, after all.
            for (let i = 0; i < 4; i++) {
                const rise = (this.time * (0.22 + rnd(seed, i + 101) * 0.16) + rnd(seed, i + 103)) % 1;
                const ang = seed * 2.3 + i * 1.9 + rise * 2.2;
                const r = baseR * (0.2 + 0.55 * rise);
                // Flecks are light, so the wind carries them furthest and they trail off downwind as they
                // rise — the clearest cue for which way the wind is actually blowing.
                const carry = rise * baseR * 0.85;
                const fx = cloud.x + Math.cos(ang) * r + this.windX * carry;
                const fy = cloud.y + Math.sin(ang) * r * 0.6 + rise * baseR * 0.55 + this.windY * carry;
                // Fade in then out across the rise so flecks never pop on or off.
                const flick = Math.sin(rise * Math.PI);
                g.circle(fx, fy, baseR * 0.05 * (0.6 + 0.6 * flick)).fill({
                    color: 0xd8a463,
                    alpha: alpha * 0.75 * flick,
                });
            }
        }
    }
    public destroy(): void {
        this.container.destroy({ children: true });
    }
}

/** Resolve a board cell to its world centre; returns undefined for a cell that is off-grid. */
export type ToWorld = (cell: HoCMath.XY) => (HoCMath.XY & { cellSize?: number }) | undefined;
