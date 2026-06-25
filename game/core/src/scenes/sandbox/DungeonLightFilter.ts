import { Filter } from "pixi.js";

/**
 * Dungeon "wall-sconce" lighting, drawn as a single GLSL pass over a board-sized quad instead of the
 * old stack of concentric `Graphics.circle()` fills (which read as flat, ringed blobs).
 *
 * The shader works in the quad's normalized space (vTextureCoord 0..1 over the board square) and
 * spills warm torch light inward from the midpoint of each of the four surrounding walls, leaving the
 * centre dark — like a room lit by sconces mounted on each wall. Falloff is analytic (smoothstep +
 * gaussian) so there are no rings, and each sconce flickers independently from a single `uTime`
 * uniform (same proven Filter.from + uniform-group pattern as SmokeLayer/WindLayer).
 *
 * `uInward` insets the sconces toward the centre so the light tracks the board as it shrinks (holes
 * eating the perimeter). If the shader fails to build, createDungeonLightFilter returns undefined and
 * the caller falls back to a plain dark overlay.
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
uniform float uInward;   // 0 = sconces on the walls, grows to inset them toward the centre

// --- mood knobs (edit to taste) ---
const vec3  DARK_RGB = vec3(0.012, 0.018, 0.045); // cool near-black for the unlit centre
const float DARK_A   = 0.74;                        // how hard the centre is darkened
const vec3  WARM_RGB = vec3(0.95, 0.55, 0.22);      // torch orange
const vec3  WARM_HOT = vec3(1.0, 0.80, 0.52);       // hotter core right at the sconce
const float LIGHT_A  = 0.46;                         // overlay alpha in fully-lit areas (higher = warmer wash, dimmer floor)
const float REACH    = 0.38;                         // how far each sconce reaches toward the centre
const float WIDTH     = 0.25;                        // spread of the pool along its wall

// Two out-of-phase sines read as flame rather than a clean pulse.
float flick(float t, float seed) {
    return 0.84 + 0.16 * sin(t * 3.1 + seed) * sin(t * 1.27 + seed * 1.7);
}

// One wall sconce. pos sits on (or just inside) a wall; inwardDir points toward the centre.
float sconce(vec2 uv, vec2 pos, vec2 inwardDir) {
    vec2 d = uv - pos;
    float inward = dot(d, inwardDir);               // 0 at the wall -> + toward the centre
    vec2 tangent = vec2(inwardDir.y, inwardDir.x);
    float along = dot(d, tangent);                  // sideways distance from the sconce
    float front = step(0.0, inward);                // nothing leaks behind the wall
    float radial = 1.0 - smoothstep(0.0, REACH, inward);     // smooth fade inward, no rings
    float lateral = exp(-(along * along) / (2.0 * WIDTH * WIDTH));
    return front * radial * lateral;
}

void main(void) {
    vec2 uv = vTextureCoord;
    float t = uTime;
    float n = clamp(uInward, 0.0, 0.42);

    float top    = sconce(uv, vec2(0.5, n),        vec2(0.0,  1.0)) * flick(t, 0.0);
    float bottom = sconce(uv, vec2(0.5, 1.0 - n),  vec2(0.0, -1.0)) * flick(t, 2.1);
    float left   = sconce(uv, vec2(n, 0.5),        vec2(1.0,  0.0)) * flick(t, 4.2);
    float right  = sconce(uv, vec2(1.0 - n, 0.5),  vec2(-1.0, 0.0)) * flick(t, 6.3);

    float light = clamp(top + bottom + left + right, 0.0, 1.0);

    // Warm pool: orange body, hotter core where the light is strongest.
    vec3 warm = mix(WARM_RGB, WARM_HOT, smoothstep(0.6, 1.0, light));
    vec3 straight = mix(DARK_RGB, warm, smoothstep(0.0, 0.45, light));
    float a = mix(DARK_A, LIGHT_A, light);

    // Premultiplied output for normal alpha blending over the background floor.
    finalColor = vec4(straight * a, a);
}
`;

export function createDungeonLightFilter(): Filter | undefined {
    try {
        const filter = Filter.from({
            gl: { vertex: VERTEX, fragment: FRAGMENT },
            resources: {
                dungeonLightUniforms: {
                    uTime: { value: 0, type: "f32" },
                    uInward: { value: 0, type: "f32" },
                },
            },
        });
        // Render at display resolution; Filter.from defaults to 1x and looks blocky on HiDPI.
        filter.resolution = Math.min(window.devicePixelRatio || 1, 2);
        // No bleed needed — the light is computed inside the quad — and a 0 pad keeps vTextureCoord
        // mapped exactly to the board square so the sconces land on the walls.
        filter.padding = 0;
        return filter;
    } catch {
        return undefined;
    }
}

/** Push the current time/inset into the filter's uniform group (no-op if the shader didn't build). */
export function updateDungeonLightUniforms(filter: Filter, timeSec: number, inward: number): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = filter.resources as any;
    if (res?.dungeonLightUniforms?.uniforms) {
        res.dungeonLightUniforms.uniforms.uTime = timeSec;
        res.dungeonLightUniforms.uniforms.uInward = inward;
    }
}
