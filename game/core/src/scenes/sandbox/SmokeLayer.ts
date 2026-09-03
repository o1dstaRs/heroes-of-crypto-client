import { Assets, Container, Graphics, Filter, Rectangle, Sprite, Texture } from "pixi.js";

import { images } from "../../generated/image_imports";

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
    // Six octaves retain fine granular detail after the effect is scaled down on the board.
    for (int i = 0; i < 6; i++) {
        v += amp * vnoise(p);
        // A small rotation between octaves prevents obvious axis-aligned noise bands.
        p = mat2(1.71, -1.03, 1.03, 1.71) * p;
        amp *= 0.5;
    }
    return v;
}

void main(void) {
    vec2 uv = vTextureCoord;
    float t = uTime;

    // Two moving warp scales: a broad curl shapes the puff while the finer field continuously
    // breaks its rim into small rolling wisps. This gives every rendered frame visible detail.
    vec2 broadWarp = vec2(
        fbm(uv * 4.2 + vec2(t * 0.035, t * 0.19)),
        fbm(uv * 4.2 + vec2(5.2, 1.3) + vec2(t * 0.15, -t * 0.025))
    );
    vec2 fineWarp = vec2(
        fbm(uv * 11.0 + broadWarp * 1.6 + vec2(-t * 0.21, t * 0.11)),
        fbm(uv * 11.0 + broadWarp.yx * 1.4 + vec2(t * 0.13, t * 0.24))
    );
    vec2 sampleUv = uv + (broadWarp - 0.5) * 0.075 + (fineWarp - 0.5) * 0.022;

    vec4 col = texture(uTexture, sampleUv);

    // Layer a soft body, thin filaments and high-frequency grains. The layers travel at different
    // rates, avoiding the old single blurred blob while remaining stable rather than flickering.
    float body = fbm(sampleUv * 7.5 - vec2(t * 0.09, t * 0.055));
    float filament = fbm(sampleUv * 16.0 + broadWarp * 2.3 + vec2(t * 0.17, -t * 0.08));
    float grain = fbm(sampleUv * 29.0 - vec2(t * 0.31, t * 0.14));
    float density = smoothstep(0.24, 0.82, body * 0.58 + filament * 0.29 + grain * 0.13);
    float wisps = smoothstep(0.58, 0.84, filament) * (0.55 + 0.45 * grain);

    // col is premultiplied; scaling by a scalar keeps it valid. The lower baseline deliberately
    // keeps the entire effect translucent even where several detailed particles overlap.
    finalColor = col * (0.10 + 0.62 * density + 0.18 * wisps);
}
`;

/**
 * The dust artwork is a horizontal strip. Align that strip with the grid axis travelled by the unit,
 * treating opposite directions as the same axis so left/right preserve the existing presentation.
 */
const dustTrailRotation = (dirX: number, dirY: number): number => {
    const hasHorizontalMovement = Math.abs(dirX) > 0.001;
    const hasVerticalMovement = Math.abs(dirY) > 0.001;
    if (!hasVerticalMovement) return 0;
    if (!hasHorizontalMovement) return Math.PI / 2;
    return Math.sign(dirX * dirY) * (Math.PI / 4);
};

const DUST_TINTS = [0xc6bfb0, 0xbbb4a5, 0xcec7b8] as const;
const DUST_ATLAS_URL = images.vfx_dust_smoky_ash_atlas;

const dustNoise = (a: number, b: number): number => {
    const value = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return value - Math.floor(value);
};

export class SmokeLayer {
    private readonly container = new Container();
    private readonly graphics = new Graphics();
    private readonly spriteContainer = new Container();
    private readonly dustSprites = new Map<ILingeringTrack, Sprite>();
    private readonly activeTracks = new Set<ILingeringTrack>();
    private dustFrames?: Texture[];
    private dustAtlas?: Texture;
    private atlasLoadStarted = false;
    private filter?: Filter;
    private time = 0;
    private atlasLoadFailed = false;
    private destroyed = false;
    /** Whether the graphics currently contain dust that must be cleared when the last track expires. */
    private hasGeometry = false;
    public constructor() {
        this.container.addChild(this.graphics, this.spriteContainer);
        this.container.once("destroyed", () => {
            this.destroyed = true;
            this.filter?.destroy();
            this.filter = undefined;
            for (const frame of this.dustFrames ?? []) frame.destroy(false);
            this.dustFrames = undefined;
            if (this.dustAtlas) {
                this.dustAtlas = undefined;
                void Assets.unload(DUST_ATLAS_URL).catch(() => undefined);
            }
            this.dustSprites.clear();
            this.activeTracks.clear();
        });
    }
    private ensureDustAtlasLoad(): void {
        if (this.atlasLoadStarted || this.dustFrames || this.destroyed) return;
        this.atlasLoadStarted = true;
        // The selected painted atlas is a 3x2 sheet of square frames. It replaces the generated blobs
        // during normal play, while the old shader remains below as a safe fallback for headless tests or
        // a missing image asset. Keeping square source frames gives the fine particles enough resolution;
        // the display scale deliberately compresses only Y so the result stays broad and ground-hugging.
        // Wait for the first real ground track before fetching it: placement-only sessions and fights where
        // no unit has moved should not retain a 1536x1024 texture. Keep the layer empty while it is pending,
        // so the former procedural dust never flashes in place of the selected artwork.
        void Assets.load<Texture>(DUST_ATLAS_URL)
            .then((atlas) => {
                if (this.destroyed) {
                    void Assets.unload(DUST_ATLAS_URL).catch(() => undefined);
                    return;
                }
                this.dustAtlas = atlas;
                this.installDustAtlas(atlas);
            })
            .catch(() => {
                this.atlasLoadFailed = true;
                this.installProceduralFallback();
            });
    }
    private installDustAtlas(atlas: Texture): void {
        if (this.destroyed) return;
        try {
            atlas.source.autoGenerateMipmaps = true;
            atlas.source.scaleMode = "linear";
            const frameSide = 512;
            this.dustFrames = Array.from({ length: 6 }, (_, index) => {
                const col = index % 3;
                const row = Math.floor(index / 3);
                return new Texture({
                    source: atlas.source,
                    frame: new Rectangle(col * frameSide, row * frameSide, frameSide, frameSide),
                });
            });
        } catch {
            this.dustFrames = undefined;
            this.atlasLoadFailed = true;
            this.installProceduralFallback();
        }
    }
    private installProceduralFallback(): void {
        if (this.destroyed || this.filter) return;
        try {
            this.filter = Filter.from({
                gl: { vertex: SMOKE_VERTEX, fragment: SMOKE_FRAGMENT },
                resources: {
                    smokeUniforms: {
                        uTime: { value: 0, type: "f32" },
                    },
                },
            });
            // Render at display resolution; Filter.from defaults to resolution 1, which upscales the
            // effect from a 1x texture on HiDPI/Retina screens and looks blocky.
            this.filter.resolution = "inherit";
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
    /** Draw the selected six-frame atlas at the bottom edge of every travelled cell. */
    private updateSpriteDust(tracks: readonly ILingeringTrack[]): void {
        const frames = this.dustFrames;
        if (!frames) return;

        const activeTracks = this.activeTracks;
        activeTracks.clear();
        for (const track of tracks) {
            if (track.flying) continue;
            activeTracks.add(track);

            let sprite = this.dustSprites.get(track);
            if (!sprite) {
                sprite = new Sprite(frames[0]);
                sprite.anchor.set(0.5, 1);
                this.spriteContainer.addChild(sprite);
                this.dustSprites.set(track, sprite);
            }

            const life = Math.max(0, track.life / track.maxLife); // 1 -> 0
            const age = 1 - life; // 0 -> 1
            const frameIndex = Math.min(frames.length - 1, Math.floor(age * frames.length));
            sprite.texture = frames[frameIndex];

            // Small units fill roughly one cell; a 2x2 unit receives a proportionally wider sheet, but
            // only a slightly taller one. This is intentionally non-uniform: the owner asked for a wide,
            // low effect rather than a circular cloud around the unit's waist.
            const footprintScale = Math.max(1, track.radius / (track.cellSize * 0.42));
            const displayWidth = track.cellSize * 1.38 * footprintScale;
            const displayHeight = track.cellSize * (0.62 + (footprintScale - 1) * 0.12);
            sprite.scale.set(displayWidth / 512, -displayHeight / 512);
            sprite.rotation = dustTrailRotation(track.dirX, track.dirY);

            // The generated frames have a small transparent strip below their painted baseline. Offset
            // that strip as well as half a cell so the visible dust itself hugs the cell's lower edge.
            const transparentBottomPadding = displayHeight * 0.12;
            sprite.position.set(track.x, track.y - track.cellSize * 0.5 - transparentBottomPadding);

            // The atlas already has a soft alpha matte. A second restrained layer opacity keeps its dense
            // middle frames from looking like an opaque wall and fades the final flecks smoothly.
            const fade = Math.min(1, life * 1.6);
            sprite.alpha = 0.52 * fade;
        }

        for (const [track, sprite] of this.dustSprites) {
            if (activeTracks.has(track)) continue;
            sprite.destroy();
            this.dustSprites.delete(track);
        }
    }
    /** Advance the smoke and redraw the blobs for the current tracks. */
    public update(dt: number, tracks: readonly ILingeringTrack[]): void {
        if (!tracks.length && !this.dustSprites.size && !this.hasGeometry) return;
        let hasGroundTrack = false;
        for (const track of tracks) {
            if (!track.flying) {
                hasGroundTrack = true;
                break;
            }
        }
        if (hasGroundTrack && !this.dustFrames) this.ensureDustAtlasLoad();
        if (this.dustFrames) {
            this.updateSpriteDust(tracks);
            return;
        }

        // Do not show the former procedural dust while the chosen atlas is still loading. It made a
        // refreshed browser look as if the replacement had not been connected at all.
        if (!this.atlasLoadFailed) return;

        this.time += dt;
        if (this.filter) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = this.filter.resources as any;
            if (res?.smokeUniforms?.uniforms) {
                res.smokeUniforms.uniforms.uTime = this.time;
            }
        }

        if (!hasGroundTrack) {
            if (this.hasGeometry) {
                this.graphics.clear();
                this.hasGeometry = false;
            }
            return;
        }

        const g = this.graphics;
        g.clear();
        this.hasGeometry = true;

        // Muted grey-browns, but light enough to read against the darkened dungeon floor.

        for (const t of tracks) {
            if (t.flying) continue;
            const seed = t.phase;
            const k = Math.max(0, t.life / t.maxLife); // 1 -> 0
            const fade = Math.min(1, k * 1.6); // hold then fall off
            const age = 1 - k; // 0 -> 1
            const puffCount = 5 + Math.floor(dustNoise(seed, 0) * 3); // 5..7 smaller particles add detail
            const scale = 0.8 + dustNoise(seed, 1) * 0.45;
            const tint = DUST_TINTS[Math.floor(dustNoise(seed, 2) * DUST_TINTS.length)];
            const visualRadius = t.radius * 0.72;

            // Small, translucent grains stay close to the boots. The shader connects and erodes
            // their overlap into a detailed puff without restoring the previous oversized cloud.
            for (let i = 0; i < puffCount; i++) {
                const ang = seed + (i * 2 * Math.PI) / puffCount + (dustNoise(seed, i + 3) - 0.5) * 1.0 + age * 0.25;
                const spread = visualRadius * scale * (0.08 + (0.34 + dustNoise(seed, i + 9) * 0.28) * age);
                const px = t.x + Math.cos(ang) * spread;
                const py = t.y + Math.sin(ang) * spread + visualRadius * (0.16 + dustNoise(seed, i + 17) * 0.24) * age;
                const pr = visualRadius * scale * (0.2 + 0.28 * age) * (0.68 + 0.52 * dustNoise(seed, i + 25));
                g.circle(px, py, pr).fill({ color: tint, alpha: 0.26 * fade });
            }
        }
    }
    public destroy(): void {
        this.dustSprites.clear();
        this.container.destroy({ children: true });
    }
}
