import { HYDRA_IDLE_SPEED } from "./HydraLabIdle";

/** Independent travelling wave, sped up with the rest of Hydra idle. */
export const HYDRA_TAIL_WAVE_SPEED = 2.6 * HYDRA_IDLE_SPEED;
export const HYDRA_TAIL_WAVE_CYCLES = 1.15;
export const HYDRA_TAIL_WAVE_AMPLITUDE = 26;

// Authored 768px coordinates, from the attached root around the curl to the free tip.
const path: readonly (readonly [number, number])[] = [
    [260, 548],
    [180, 605],
    [95, 619],
    [47, 602],
    [36, 567],
    [51, 521],
    [81, 474],
    [123, 445],
];
const lengths = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
const total = lengths.reduce((sum, value) => sum + value, 0);
const distances = [0];
for (const length of lengths) distances.push(distances[distances.length - 1] + length);
const normals = path.map((p, i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
});

function smoothstep(low: number, high: number, value: number): number {
    const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return t * t * (3 - 2 * t);
}

/** A fixed root and a u^4 envelope, like the count flag; wave follows the curled tail's length. */
export function hydraTailOffset(x: number, y: number, nowMs: number): [number, number] {
    if (!Number.isFinite(x) || !Number.isFinite(y) || x > 285 || y < 390 || y > 665) return [0, 0];
    let closest = Infinity;
    let u = 0;
    let nx = 0;
    let ny = 0;
    for (let i = 0; i < lengths.length; i++) {
        const a = path[i];
        const b = path[i + 1];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const q = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lengths[i] ** 2));
        const distance = Math.hypot(x - a[0] - q * dx, y - a[1] - q * dy);
        if (distance >= closest) continue;
        closest = distance;
        u = (distances[i] + q * lengths[i]) / total;
        nx = normals[i][0] * (1 - q) + normals[i + 1][0] * q;
        ny = normals[i][1] * (1 - q) + normals[i + 1][1] * q;
    }
    // Support exceeds maximum travel so inverse sampling cannot leave the tip behind.
    const width = 48 * (1 - u) + 7 * u;
    const mask = 1 - smoothstep(width, width + 60, closest);
    const phase = (Number.isFinite(nowMs) ? nowMs : 0) * 0.001 * HYDRA_TAIL_WAVE_SPEED;
    const wave = HYDRA_TAIL_WAVE_AMPLITUDE * u ** 4 * mask * Math.sin(Math.PI * 2 * HYDRA_TAIL_WAVE_CYCLES * u - phase);
    if (!wave) return [0, 0];
    const normalLength = Math.hypot(nx, ny) || 1;
    return [(wave * nx) / normalLength, (wave * ny) / normalLength];
}

const gl = (value: number): string => value.toFixed(8);
export const HYDRA_TAIL_GLSL = /* glsl */ `
vec2 hydraTailOffset(vec2 p) {
    if (p.x > 285.0 || p.y < 390.0 || p.y > 665.0) return vec2(0.0);
    float closest = 1e10;
    float u = 0.0;
    vec2 normal = vec2(0.0, 1.0);
    ${lengths
        .map(
            (length, i) => `{
        vec2 a = vec2(${gl(path[i][0])}, ${gl(path[i][1])});
        vec2 d = vec2(${gl(path[i + 1][0] - path[i][0])}, ${gl(path[i + 1][1] - path[i][1])});
        float q = clamp(dot(p-a, d) / ${gl(length * length)}, 0.0, 1.0);
        float distance = length(p-a-q*d);
        if (distance < closest) {
            closest = distance;
            u = (${gl(distances[i])} + q * ${gl(length)}) / ${gl(total)};
            normal = mix(vec2(${gl(normals[i][0])}, ${gl(normals[i][1])}), vec2(${gl(normals[i + 1][0])}, ${gl(normals[i + 1][1])}), q);
        }
    }`,
        )
        .join("\n")}
    float width = mix(48.0, 7.0, u);
    float mask = 1.0 - smoothstep(width, width + 60.0, closest);
    float wave = ${gl(HYDRA_TAIL_WAVE_AMPLITUDE)} * pow(u, 4.0) * mask * sin(${gl(Math.PI * 2 * HYDRA_TAIL_WAVE_CYCLES)} * u - uPhase);
    return normalize(normal) * wave;
}`;
