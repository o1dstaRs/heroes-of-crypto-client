import { Container, Graphics, Filter } from "pixi.js";

import type { ILingeringTrack } from "../SandboxDrawer";

/**
 * Procedural wind for FLYING units' movement.
 *
 * Where ground units kick up dust (see SmokeLayer), flying units displace air. We draw light,
 * elongated streaks trailing the unit along its movement direction, then run a fast, anisotropic
 * fBM fragment shader over them so the streaks shimmer and dissipate like gusting wind. If the
 * shader fails to build we fall back to the plain streaks.
 *
 * Refs: PixiJS v8 custom filters (Filter.from + GLSL ES 3.0); fBM / domain warping from
 * thebookofshaders.com/13.
 */
const WIND_VERTEX = /* glsl */ `
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

const WIND_FRAGMENT = /* glsl */ `
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

    // Fast, mostly-horizontal domain warp so the streaks feel blown along.
    vec2 warp = vec2(
        fbm(uv * 5.0 + vec2(t * 0.7, t * 0.05)),
        fbm(uv * 6.0 + vec2(3.1, 7.2) + vec2(t * 0.25, 0.0))
    );
    vec2 sampleUv = uv + (warp - 0.5) * 0.05;

    vec4 col = texture(uTexture, sampleUv);

    // Stretched (anisotropic) noise so the erosion reads as flowing wind streaks, not puffs.
    float n = fbm(uv * vec2(13.0, 6.0) - vec2(t * 1.1, t * 0.12));
    float density = smoothstep(0.18, 0.85, n);

    // col is premultiplied; scaling by a scalar keeps it valid.
    finalColor = col * (0.12 + 0.95 * density);
}
`;

export class WindLayer {
    private readonly container = new Container();
    private readonly graphics = new Graphics();
    private filter?: Filter;
    private time = 0;
    public constructor() {
        this.container.addChild(this.graphics);
        try {
            this.filter = Filter.from({
                gl: { vertex: WIND_VERTEX, fragment: WIND_FRAGMENT },
                resources: {
                    windUniforms: {
                        uTime: { value: 0, type: "f32" },
                    },
                },
            });
            // Render at display resolution; Filter.from defaults to resolution 1, which upscales the
            // effect from a 1x texture on HiDPI/Retina screens and looks blocky.
            this.filter.resolution = Math.min(window.devicePixelRatio || 1, 2);
            this.filter.padding = 32;
            this.container.filters = [this.filter];
        } catch {
            // Shader unavailable — fall back to plain streaks (still drawn below).
            this.filter = undefined;
        }
    }
    public getContainer(): Container {
        return this.container;
    }
    /** Advance the wind and redraw the streaks for the current flying-unit tracks. */
    public update(dt: number, tracks: ILingeringTrack[]): void {
        this.time += dt;
        if (this.filter) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = this.filter.resources as any;
            if (res?.windUniforms?.uniforms) {
                res.windUniforms.uniforms.uTime = this.time;
            }
        }

        const g = this.graphics;
        g.clear();
        if (!tracks.length) return;

        // Stable per-(track, index) pseudo-random seeded by the track's phase so each gust differs
        // but doesn't flicker frame to frame.
        const rnd = (a: number, b: number): number => {
            const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
            return x - Math.floor(x);
        };
        const windTints = [0xe8f4ff, 0xd8ecff, 0xf2f8ff];

        for (const t of tracks) {
            const seed = t.phase;
            const k = Math.max(0, t.life / t.maxLife); // 1 -> 0
            const fade = Math.min(1, k * 1.6); // hold then fall off
            const age = 1 - k; // 0 -> 1
            const tint = windTints[Math.floor(rnd(seed, 2) * windTints.length)];

            // Movement direction (falls back to a gentle upward drift when stationary).
            let dx = t.dirX;
            let dy = t.dirY;
            if (dx * dx + dy * dy < 1e-4) {
                dx = 0;
                dy = -1;
            }
            // Perpendicular, for fanning the streaks out to the sides.
            const perpX = -dy;
            const perpY = dx;

            // One clean contrail off each side EDGE of the unit — like the twin trails an aeroplane
            // leaves across the sky: each starts at the rim, then streams far back, thinning, fading
            // and spreading just slightly. A single gentle bow keeps it natural (not a ruler line);
            // seeded by phase so it's stable, and the shader adds the flowing shimmer.
            for (const side of [-1, 1]) {
                const sBase = seed + side * 37.1;
                // Length is measured in CELLS (not the unit radius) so it's clearly multi-cell for
                // small and large flyers alike — a long aeroplane-style trail.
                const length = t.cellSize * (3.5 + rnd(sBase, 1) * 2.5) * (0.55 + 0.45 * age);
                const bow = t.radius * (0.06 + rnd(sBase, 2) * 0.12); // gentle natural curve
                const segs = 20;
                // Draw as one continuous stroked, tapering line (so length never leaves gaps).
                let prevX = 0;
                let prevY = 0;
                for (let s = 0; s < segs; s++) {
                    const f = s / (segs - 1); // 0 (at the wingtip) -> 1 (far behind)
                    // Emanate straight from ONE wingtip (mid-body, ±radius to the side of travel) and
                    // stream straight back along -direction, near-parallel — twin aeroplane contrails
                    // off the left/right wingtips, not lines fanning out from the footprint corners.
                    const along = -length * f;
                    const lateral = side * (t.radius + Math.sin(f * Math.PI) * bow * 0.6);
                    const px = t.x + dx * along + perpX * lateral;
                    const py = t.y + dy * along + perpY * lateral;
                    if (s > 0) {
                        const width = t.radius * 0.17 * (1.0 - 0.6 * f); // thin, tapering
                        const alpha = 0.34 * fade * (1.0 - 0.72 * f);
                        g.moveTo(prevX, prevY).lineTo(px, py).stroke({ width, color: tint, alpha, cap: "round" });
                    }
                    prevX = px;
                    prevY = py;
                }
            }
        }
    }
    public destroy(): void {
        this.container.destroy({ children: true });
    }
}
