import { Container, Graphics, Filter } from "pixi.js";

import type { ILingeringTrack } from "../SandboxDrawer";

/**
 * Procedural smoke for movement tracks.
 *
 * We draw soft blobs per cell into our own Graphics, then run an fBM (fractal-Brownian-motion)
 * fragment shader over them: it domain-warps the lookup so the round edges turn into wisps and
 * erodes the density with animated noise, so the result reads as drifting smoke rather than ideal
 * circles. If the shader fails to build for any reason we simply render the soft blobs unfiltered.
 *
 * Refs: PixiJS v8 custom filters (Filter.from + GLSL ES 3.0), and the fBM / domain-warping smoke
 * technique from thebookofshaders.com/13 and Inigo Quilez's warp articles.
 */
// Standard PixiJS v8 filter vertex (provides vTextureCoord + correct output framing).
const SMOKE_VERTEX = /* glsl */ `
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

const SMOKE_FRAGMENT = /* glsl */ `
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

void main(void) {
    vec2 uv = vTextureCoord;
    float t = uTime;

    // Domain warp: push the sample coords around with two animated fBM fields so the round
    // blobs get pulled into wisps.
    vec2 warp = vec2(
        fbm(uv * 4.0 + vec2(0.0, t * 0.16)),
        fbm(uv * 4.0 + vec2(5.2, 1.3) + vec2(t * 0.12, 0.0))
    );
    vec2 sampleUv = uv + (warp - 0.5) * 0.09;

    vec4 col = texture(uTexture, sampleUv);

    // Erode the density with finer animated noise so it breaks up into smoky tufts.
    float n = fbm(uv * 7.0 - vec2(t * 0.10, t * 0.05));
    float density = smoothstep(0.12, 0.9, n);

    // col is premultiplied; scaling by a scalar keeps it valid.
    finalColor = col * (0.25 + 0.95 * density);
}
`;

export class SmokeLayer {
    private readonly container = new Container();
    private readonly graphics = new Graphics();
    private filter?: Filter;
    private time = 0;

    public constructor() {
        this.container.addChild(this.graphics);
        try {
            this.filter = Filter.from({
                gl: { vertex: SMOKE_VERTEX, fragment: SMOKE_FRAGMENT },
                resources: {
                    smokeUniforms: {
                        uTime: { value: 0, type: "f32" },
                    },
                },
            });
            // Allow the domain-warp to bleed past the blob bounds without getting clipped.
            this.filter.padding = 28;
            this.container.filters = [this.filter];
        } catch {
            // Shader unavailable — fall back to plain soft blobs (still drawn below).
            this.filter = undefined;
        }
    }

    public getContainer(): Container {
        return this.container;
    }

    /** Advance the smoke and redraw the blobs for the current tracks. */
    public update(dt: number, tracks: ILingeringTrack[]): void {
        this.time += dt;
        if (this.filter) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = this.filter.resources as any;
            if (res?.smokeUniforms?.uniforms) {
                res.smokeUniforms.uniforms.uTime = this.time;
            }
        }

        const g = this.graphics;
        g.clear();
        if (!tracks.length) return;

        // Stable per-(track, index) pseudo-random seeded by the track's phase, so each cell's puff
        // differs but doesn't flicker frame to frame.
        const rnd = (a: number, b: number): number => {
            const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
            return x - Math.floor(x);
        };
        const dustTints = [0xd6d0c0, 0xcdc7b6, 0xded7c6];

        for (const t of tracks) {
            const seed = t.phase;
            const k = Math.max(0, t.life / t.maxLife); // 1 -> 0
            const fade = Math.min(1, k * 1.6); // hold then fall off
            const age = 1 - k; // 0 -> 1
            const puffCount = 4 + Math.floor(rnd(seed, 0) * 3); // 4..6
            const scale = 0.85 + rnd(seed, 1) * 0.5;
            const tint = dustTints[Math.floor(rnd(seed, 2) * dustTints.length)];

            // Solid-ish soft blobs: the shader carves them into wisps, so we want some density here.
            for (let i = 0; i < puffCount; i++) {
                const ang = seed + (i * 2 * Math.PI) / puffCount + (rnd(seed, i + 3) - 0.5) * 1.2 + age * 0.6;
                const spread = t.radius * scale * (0.1 + (0.4 + rnd(seed, i + 9) * 0.4) * age);
                const px = t.x + Math.cos(ang) * spread;
                const py = t.y + Math.sin(ang) * spread + t.radius * (0.35 + rnd(seed, i + 17) * 0.4) * age;
                const pr = t.radius * scale * (0.42 + 0.5 * age) * (0.7 + 0.6 * rnd(seed, i + 25));
                g.circle(px, py, pr).fill({ color: tint, alpha: 0.5 * fade });
            }
        }
    }

    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
