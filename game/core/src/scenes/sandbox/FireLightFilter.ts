import { Filter } from "pixi.js";

/**
 * Makes the light PAINTED INTO the floor texture behave like it comes from fire.
 *
 * The board art carries its own lighting — warm bands hugging the top and bottom walls, fading to dark
 * stone down the middle. That reads beautifully but it is frozen, and frozen firelight reads as a lamp.
 *
 * The pass does exactly one thing: it makes the already-lit parts burn rather than sit still.
 *
 * It deliberately does NOT re-light or re-colour the board. Earlier revisions also lifted the shadows so
 * the dark middle read better, dropped a pool of torchlight on the centre, and graded the whole floor
 * toward the UI's brown leather; all three were removed on the call that the artwork's own colours are
 * what should ship. What remains cannot change the board's colour balance: unlit stone is returned
 * untouched, and the flicker is centred on zero so the lit bands keep the average level they were
 * painted at. Turn uIntensity to 0 and the output is the source texture, exactly.
 *
 * WHAT IT DOES NOT DO: it never moves a pixel. No UV warp, no heat shimmer, no scroll — the stone, the
 * grout and the debris stay exactly where they were painted, and only the intensity and colour of the
 * light on them changes. That was a hard requirement for this board and it is why the effect is a pure
 * per-texel gain rather than anything geometric.
 *
 * HOW THE LIT AREA IS FOUND: from the art itself, not from a hand-authored mask or the board geometry.
 * A texel counts as lit in proportion to how BRIGHT and how WARM it is (luminance x red-minus-blue), so
 * the flicker lands exactly on the glow the artist painted, follows it around the debris and the cracks,
 * and keeps working unchanged if the floor texture is ever repainted with the light somewhere else.
 *
 * HOW IT FLICKERS: a 3D value-noise fBM, sampled at (position, time). Time is the THIRD AXIS rather than
 * a scroll offset, so the field evolves in place — a scrolled field reads as a texture sliding past, an
 * evolved one reads as flame. Four octaves, and each octave advances at its own speed: the broad body of
 * the glow swells slowly while the fine detail licks quickly, which is the single thing that most makes
 * this look like fire instead of a lava lamp. Interpolation is quintic, so there is no lattice blockiness
 * in the low octaves, and the frequency step is deliberately non-integer to stop the octaves aligning
 * into a visible grid.
 *
 * The noise is stretched along one axis relative to the other, so the glow does not pulse as one slab.
 *
 * On top of the noise sits a slow global breath from three incommensurate sines — the fire as a whole
 * rising and settling, never on a clean period — a sparse sharper flare, and a chromatic response: real
 * flame shifts toward yellow-white as it flares and sinks to deep ember-orange as it ebbs, so brightness
 * alone would look like someone turning a dimmer.
 *
 * Everything is deliberately non-positional; see the coordinates note in the fragment for why.
 */

// Standard PixiJS v8 filter vertex (provides vTextureCoord + correct output framing).
const VERTEX = /* glsl */ `
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

const FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uIntensity; // 0 = artwork untouched, 1 = full flicker

// NOTE ON COORDINATES, kept because it cost two silent failures to learn.
//
// vTextureCoord does NOT run 0..1 across the floor: pixi hands the pass an input texture larger than the
// filtered sprite, so the coordinate stops short of 1. Do not use it as board position. One earlier
// version assumed 0..1 and collapsed the effect to nothing; another tried to rebuild board space from
// uInputSize/uOutputFrame in the FRAGMENT — where those uniforms do not arrive, so they read as zero —
// and blacked the floor out entirely. Here it is used ONLY to sample the texture, which is all it is for.
//
// If anything positional is ever needed again, pass pixi's filter-quad attribute through the vertex stage
// (aPosition is literally [0,0, 1,0, 1,1, 0,1], so it already IS the fraction across the sprite) rather
// than reconstructing it. Nothing in this pass needs it today.

// --- how the lit band is recognised in the artwork ---
const float LUM_LO   = 0.10;  // below this the texel is unlit stone
const float LUM_HI   = 0.52;  // at/above this it is fully inside the glow
const float WARM_LO  = 0.04;  // red-over-blue needed before a texel counts as firelight at all
const float WARM_HI  = 0.34;  // ...and where it counts fully, so cool highlights never flicker

// --- flicker shape ---
const float SWING       = 0.52;  // peak-to-peak gain from the noise — a torch, not a dimmer
const float BREATH      = 0.16;  // slow whole-fire rise and fall on top of the noise
const float NOISE_SCALE_X = 3.4; // stretched along the wall...
const float NOISE_SCALE_Y = 9.0; // ...and tighter across it, so depth varies faster than length
const int   OCTAVES     = 4;

// Extra punch on the sparse flare that rides on top of the slow swell.
const float FLARE_GAIN  = 0.30;

// Flare pushes toward yellow-white, ebb sinks toward deep ember — fire changes colour, not just level.
const vec3 HOT_SHIFT = vec3(1.0, 0.72, 0.30);

// --- 3D value noise (position + time), quintic-smoothed ---
float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    // Quintic fade: C2-continuous, so the low octaves have no visible lattice creases.
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
    return mix(
        mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
        mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
        f.z
    );
}

/**
 * fBM where every octave keeps its OWN clock. The big swells breathe slowly, the small licks flutter —
 * a single shared speed makes the whole field wobble together and instantly reads as fake.
 */
float fireFbm(vec2 uv, float t) {
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    float norm = 0.0;
    for (int i = 0; i < OCTAVES; i++) {
        float speed = 0.55 + float(i) * 0.95;
        sum += amp * vnoise(vec3(uv * freq, t * speed));
        norm += amp;
        amp *= 0.55;
        freq *= 2.13; // non-integer, so octaves never line up into a grid
    }
    return sum / norm;
}


void main(void) {
    vec4 tex = texture(uTexture, vTextureCoord);
    vec3 rgb = tex.rgb;

    float lum = dot(rgb, vec3(0.299, 0.587, 0.114));
    float warmth = rgb.r - rgb.b;
    float t = uTime;

    // How much of this texel is firelight, read straight out of the painting: bright AND warm.
    float lit = smoothstep(LUM_LO, LUM_HI, lum) * smoothstep(WARM_LO, WARM_HI, warmth);
    lit *= clamp(uIntensity, 0.0, 1.0);

    if (lit <= 0.0005) {
        // Unlit stone is passed through EXACTLY as painted — not a channel touched — and the noise below
        // (much the most expensive part of this shader) is skipped with it.
        finalColor = tex;
        return;
    }

    // The fire as a whole rising and settling. Purely temporal, so it always works: three incommensurate
    // sines beat against each other, giving a swell that never repeats on a clean period, plus a sparse
    // sharper flare of the kind a real fire throws.
    float breath = 0.55 * sin(t * 0.87) + 0.30 * sin(t * 1.31 + 1.7) + 0.15 * sin(t * 0.41 + 3.1);
    // max(0,sin)^6 is never negative, so left alone it would sit as a permanent brightening — measured at
    // +15..27 of 255 on this floor, i.e. quietly repainting the artwork lighter. Subtracting its own mean
    // over a period (5/32) makes it a true flare: a touch below the painted level, spiking well above it.
    float flare = pow(max(0.0, sin(t * 0.37 + 1.1)), 6.0) - 0.15625;

    vec2 uv = vTextureCoord;

    // Fine flicker: the flames themselves, evolving in place rather than scrolling. Only needs the
    // coordinate to VARY across the surface, so its range is irrelevant.
    float n = fireFbm(vec2(uv.x * NOISE_SCALE_X, uv.y * NOISE_SCALE_Y), t) - 0.5;

    // Centred on 0: +/- half the swing around the artwork's own level, so the board's AVERAGE colour stays
    // exactly what the artist painted and this only rides on top of it. Scaled by lit, so the dark stone
    // never moves and only the painted glow breathes.
    float delta = (n * SWING + breath * BREATH + flare * FLARE_GAIN) * lit;

    // Level first...
    vec3 col = rgb * (1.0 + delta);
    // ...then the colour swing: warmer and paler on a flare, redder as it drops back.
    col += HOT_SHIFT * delta * lum * 0.55;

    finalColor = vec4(clamp(col, 0.0, 1.0), tex.a);
}
`;

export function createFireLightFilter(): Filter | undefined {
    try {
        const filter = Filter.from({
            gl: { vertex: VERTEX, fragment: FRAGMENT },
            resources: {
                fireLightUniforms: {
                    uTime: { value: 0, type: "f32" },
                    uIntensity: { value: 1, type: "f32" },
                },
            },
        });
        // Render at display resolution; Filter.from defaults to 1x and the noise looks chunky on HiDPI.
        filter.resolution = Math.min(window.devicePixelRatio || 1, 2);
        // Nothing is displaced, so the pass needs no bleed and vTextureCoord stays mapped to the sprite.
        filter.padding = 0;
        return filter;
    } catch {
        return undefined;
    }
}

/** Push the clock into the filter's uniform group (no-op if the shader didn't build). */
export function updateFireLightUniforms(filter: Filter, timeSec: number, intensity: number): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = filter.resources as any;
    if (res?.fireLightUniforms?.uniforms) {
        res.fireLightUniforms.uniforms.uTime = timeSec;
        res.fireLightUniforms.uniforms.uIntensity = intensity;
    }
}
