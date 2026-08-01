/*
 * -----------------------------------------------------------------------------
 * This file is part of the Heroes of Crypto game client.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { Container, Filter, Graphics } from "pixi.js";

/**
 * ARCANE DEATH BURST — the violet shockwave a dying stack leaves behind, replacing the old shatter.
 *
 * Modelled frame-by-frame on the reference clip: a ragged ring of white-violet electricity races outward on a
 * VORONOI crackle network, a dark cavity opens behind it laced with hot orange-red veins, a fainter web of the
 * same cells hangs in the air around it, and the whole thing sits in a soft additive violet bloom. At the end
 * the ring does not simply fade — it TEARS INTO ARCS, and the web outlives it by a beat.
 *
 * Rendering follows the proven SmokeCloudLayer pattern: paint a carrier into a Graphics, then run a fragment
 * shader over it. Unlike smoke the carrier is a plain quad and every pixel is computed procedurally, which is
 * what buys the detail — a particle spray of soft round blobs cannot draw a crack network, which is exactly why
 * the previous fire/death effects read as cotton wool.
 *
 * Everything is driven by ONE uniform, `uProgress` (0..1 over the burst's life), so the CPU side stays a single
 * float per frame and the whole animation is reproducible and tunable in one place.
 *
 * Refs: PixiJS v8 custom filters (Filter.from + GLSL ES 3.0); Voronoi/F2-F1 edge distance and fBM from
 * thebookofshaders.com and Inigo Quilez's cellular-noise articles.
 */

/** Seconds the burst lives. The reference clip's action runs ~0.9s from first spark to a bare fading web. */
export const ARCANE_DEATH_LIFE = 0.95;

// Standard PixiJS v8 filter vertex (provides vTextureCoord + correct output framing).
const BURST_VERTEX = /* glsl */ `
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

const BURST_FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
// 0 at the first spark, 1 when the last filament has gone cold.
uniform float uProgress;
// Per-death variation, so two stacks dying side by side do not draw the identical crack pattern.
uniform float uSeed;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

vec2 hash2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
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

float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
        v += amp * vnoise(p);
        p *= 2.0;
        amp *= 0.5;
    }
    return v;
}

/**
 * Cellular noise returning (F2 - F1, cell id). F2-F1 is near zero exactly ON a cell boundary, so thresholding
 * it draws the WEB of edges rather than the cells — that web is the whole look.
 */
vec2 voronoi(vec2 p) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;
    float id = 0.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = hash2(n + g);
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < f1) {
                f2 = f1;
                f1 = d;
                id = hash(n + g);
            } else if (d < f2) {
                f2 = d;
            }
        }
    }
    return vec2(sqrt(f2) - sqrt(f1), id);
}

void main(void) {
    // The carrier quad is square and centred, so this maps to -1..1 with the death at the origin.
    vec2 uv = vTextureCoord * 2.0 - 1.0;
    float r = length(uv);
    float ang = atan(uv.y, uv.x);
    float p = clamp(uProgress, 0.0, 1.0);

    // EXPANSION — fast out of the gate, easing to a stop around 55% of the life, which is where the
    // reference holds its widest ring before the break-up starts.
    float grow = 1.0 - pow(1.0 - min(p / 0.55, 1.0), 3.0);
    float rad = 0.80 * grow;
    // Lobed, not circular: a low-frequency fbm around the rim pushes it in and out so it reads as a shock
    // tearing through matter rather than an expanding hoop.
    vec2 dir = vec2(cos(ang), sin(ang));
    float jag = fbm(dir * 2.3 + uSeed * 17.0) - 0.5;
    rad *= 1.0 + jag * 0.26;

    // DOMAIN WARP — the single thing that separates a lightning crackle from a wireframe polygon. Without it
    // the cell edges are dead-straight segments and the ring reads as a faceted hoop; bending the lookup with
    // fbm before sampling makes every filament wander. Same trick the smoke layer uses to stop reading as
    // round blobs, applied to BOTH webs so they wander together.
    vec2 warp = vec2(fbm(uv * 3.1 + uSeed * 5.0), fbm(uv * 3.1 - uSeed * 3.0 + 9.7)) - 0.5;
    vec2 wuv = uv + warp * 0.30;

    // THE WEB, at two scales. One scale alone gives a single tidy loop of cell edges; laying a finer web over
    // a coarse one produces the dense fibrous mass the reference actually has. Narrow thresholds keep the
    // filaments hair-thin instead of fat violet bands.
    float wscale = 7.6 - 2.2 * p;
    vec2 vo = voronoi(wuv * wscale + uSeed * 31.0);
    float webCoarse = 1.0 - smoothstep(0.0, 0.055, vo.x);
    vec2 vo2 = voronoi(wuv * (wscale * 2.15) - uSeed * 19.0);
    float webFine = 1.0 - smoothstep(0.0, 0.040, vo2.x);
    float web = max(webCoarse, webFine * 0.72);

    // RIM — a gaussian band at the wave radius, thickening as it slows.
    float thick = 0.040 + 0.050 * p;
    float ring = exp(-pow((r - rad) / thick, 2.0));

    // BREAK-UP. Eroding by whole cells bites polygon-shaped holes; driving it with fbm around the rim instead
    // opens ARCS, which is how the reference ring comes apart.
    float shred = smoothstep(0.55, 1.0, p);
    float erode = fbm(dir * 3.4 + uSeed * 23.0 + p * 1.6);
    float rimAlive = 1.0 - smoothstep(erode - 0.16, erode + 0.16, shred);

    // The web is raised to a power so the bright core of each filament stays thin while its glow spreads.
    float rimI = ring * (0.22 + 1.05 * pow(web, 1.4)) * rimAlive;

    // HOT CORE — the orange-red lattice inside the cavity. Coarser than the outer web and with a wider
    // threshold, so it draws CONNECTED veins; at a higher frequency the edges break into disconnected dots.
    vec2 cuv = uv + warp * 0.22;
    vec2 co = voronoi(cuv * (6.8 + 2.2 * p) - uSeed * 11.0);
    float coreWeb = 1.0 - smoothstep(0.0, 0.10, co.x);
    float coreMask = smoothstep(rad * 0.78, rad * 0.12, r) * (1.0 - smoothstep(0.62, 0.95, p));
    float coreI = pow(coreWeb, 1.6) * coreMask;

    // HALO — the same cells, much fainter, hanging outside the wave. This is what outlives the rim at the end.
    float haloI = web * smoothstep(rad * 2.1, rad * 0.5, r) * 0.30;

    // Soft additive bloom so the burst lights its surroundings instead of floating on top of them.
    float bloom = exp(-r * 3.1) * 0.40 * (1.0 - smoothstep(0.5, 1.0, p));

    vec3 cRim = mix(vec3(0.58, 0.26, 0.98), vec3(0.99, 0.96, 1.00), smoothstep(0.25, 0.85, rimI));
    vec3 cWeb = vec3(0.44, 0.19, 0.90);
    vec3 cCore = vec3(1.00, 0.30, 0.08);
    vec3 cBloom = vec3(0.30, 0.12, 0.60);

    vec3 col = cRim * rimI * 1.70 + cWeb * haloI + cCore * coreI * 0.72 + cBloom * bloom;

    // Envelope: a very short flash in, a long tail out. The web fades last (its own slower curve above).
    float fadeIn = smoothstep(0.0, 0.05, p);
    float fadeOut = 1.0 - smoothstep(0.66, 1.0, p);
    float env = fadeIn * fadeOut;

    float a = clamp(max(max(rimI, coreI), max(haloI, bloom)), 0.0, 1.0) * env;
    col *= env;

    // Premultiplied, and the carrier's own colour is deliberately discarded — every pixel here is computed.
    finalColor = vec4(col, a);
}
`;

export interface IArcaneDeathBurst {
    container: Container;
    filter: Filter;
    age: number;
}

/**
 * Build a burst centred on (0,0) of its own container, `size` world units across.
 *
 * Returns undefined when the shader cannot be built — a machine without the WebGL feature set. Callers fall
 * back to the old shatter in that case, exactly as SmokeCloudLayer falls back to plain blobs, so the death is
 * never left invisible.
 *
 * HEADLESS QUIRK: Pixi reaches for `document` while building the FIRST filter of a process, so under a test
 * runner that one call throws and lands here — later ones succeed. Harmless in a browser, but it means the
 * very first death of a headless run takes the shatter fallback; tests that need the burst build one filter
 * up front to get past it.
 */
export function createArcaneDeathBurst(size: number, seed: number): IArcaneDeathBurst | undefined {
    let filter: Filter;
    try {
        filter = Filter.from({
            gl: { vertex: BURST_VERTEX, fragment: BURST_FRAGMENT },
            resources: {
                arcaneDeathUniforms: {
                    uProgress: { value: 0, type: "f32" },
                    uSeed: { value: seed, type: "f32" },
                },
            },
        });
    } catch {
        return undefined;
    }

    const container = new Container();
    // Additive: this is light, and it has to read over both the dark board and a bright unit underneath.
    container.blendMode = "add";

    // The carrier. Its colour never reaches the screen (the shader writes finalColor outright) — it exists
    // only to give the filter an area to run over, so it is exactly the burst's bounding square.
    const half = size / 2;
    const carrier = new Graphics().rect(-half, -half, size, size).fill({ color: 0xffffff, alpha: 1 });
    container.addChild(carrier);

    try {
        filter.resolution = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2);
    } catch {
        // Resolution is a refinement, not a requirement — a failure here must not lose the whole effect.
    }
    container.filters = [filter];

    return { container, filter, age: 0 };
}

/** Advance one burst. Returns false once it has finished and should be destroyed. */
export function advanceArcaneDeathBurst(burst: IArcaneDeathBurst, dt: number): boolean {
    burst.age += dt;
    const progress = burst.age / ARCANE_DEATH_LIFE;
    if (progress >= 1) {
        return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resources = burst.filter.resources as any;
    if (resources?.arcaneDeathUniforms?.uniforms) {
        resources.arcaneDeathUniforms.uniforms.uProgress = progress;
    }
    return true;
}
