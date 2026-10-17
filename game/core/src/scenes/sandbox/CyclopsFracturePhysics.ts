import { readAnimationSetting } from "../../settings/animationLabProfile";
export type CyclopsImpactMode = "sprites" | "engine";
export const DEFAULT_CYCLOPS_IMPACT_MODE: CyclopsImpactMode = "engine";
export const readCyclopsImpactMode = (): CyclopsImpactMode =>
    readAnimationSetting<CyclopsImpactMode>("cyclops.impactMode", DEFAULT_CYCLOPS_IMPACT_MODE);
export const CYCLOPS_FRACTURE_LIFE_MS = 1850;
/** All impact layers share this clock: +60% speed, without changing the 3×3 footprint. */
export const CYCLOPS_FRACTURE_PLAYBACK_RATE = readAnimationSetting("stone.playbackRate", 1.6);
/** Only 30 ms of screen time on the floor after the final bounce. */
export const CYCLOPS_FRAGMENT_SETTLED_HOLD_SECONDS =
    (readAnimationSetting("stone.settledHoldMs", 30) / 1000) * CYCLOPS_FRACTURE_PLAYBACK_RATE;
export const CYCLOPS_FRACTURE_RADIUS = 1.5;
export type Vec3 = [number, number, number];
export interface StoneFragment {
    origin: Vec3;
    velocity: Vec3;
    size: number;
    spin: Vec3;
    rotation: Vec3;
    shape: Vec3;
    seed: number;
}
export function stoneRandom(seed: number): () => number {
    let n = seed >>> 0;
    return () => {
        n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
        return n / 4294967296;
    };
}
/** Stable fracture topology and trajectories: frame rate never changes a shard's path. */
export function createStoneFragments(seed: number): StoneFragment[] {
    const random = stoneRandom(seed);
    return Array.from({ length: 38 }, (_, i) => {
        const angle = i * 2.39996323 + random() * 0.35;
        const radius = 0.08 + random() * 0.19;
        const size = i < 12 ? 0.115 + random() * 0.055 : 0.035 + random() * 0.07;
        const speed = 1.05 + random() * 2.1;
        return {
            origin: [Math.cos(angle) * radius, Math.sin(angle) * radius, size * 0.65 + random() * 0.24],
            velocity: [Math.cos(angle) * speed, Math.sin(angle) * speed, 0.9 + random() * 2.6],
            size,
            spin: [(random() - 0.5) * 17, (random() - 0.5) * 17, (random() - 0.5) * 13],
            rotation: [random() * 6.28, random() * 6.28, random() * 6.28],
            shape: [0.65 + random() * 0.7, 0.55 + random() * 0.6, 0.55 + random() * 0.5],
            seed: random() * 100,
        };
    });
}
export function stoneFragmentPose(fragment: StoneFragment, ageSeconds: number) {
    const t = Math.max(0, ageSeconds);
    const ground = fragment.size * 0.55;
    const gravity = 10;
    let z = fragment.origin[2],
        vz = fragment.velocity[2],
        left = t,
        bounces = 0;
    let settledAt = 0;
    let settled = false;
    for (let bounce = 0; bounce < 5; bounce++) {
        const flight = (vz + Math.sqrt(vz * vz + 2 * gravity * Math.max(0, z - ground))) / gravity;
        if (left < flight) {
            z += vz * left - (gravity * left * left) / 2;
            break;
        }
        left -= flight;
        settledAt += flight;
        vz = (gravity * flight - vz) * 0.27;
        z = ground;
        bounces++;
        if (vz < 0.1 || bounce === 4) {
            settled = true;
            break;
        }
    }
    const motionTime = settled ? settledAt : t;
    const travel = (1 - Math.exp(-motionTime * 2.6)) / 2.6;
    let x = fragment.origin[0] + fragment.velocity[0] * travel;
    let y = fragment.origin[1] + fragment.velocity[1] * travel;
    const radius = Math.hypot(x, y);
    const limit = CYCLOPS_FRACTURE_RADIUS - fragment.size * 1.5;
    if (radius > limit) {
        x *= limit / radius;
        y *= limit / radius;
    }
    const spinTime = motionTime;
    const rotation = fragment.rotation.map(
        (a, i) => a + (fragment.spin[i] * (1 - Math.exp(-spinTime * 2.2))) / 2.2,
    ) as Vec3;
    const visible = !settled || t - settledAt < CYCLOPS_FRAGMENT_SETTLED_HOLD_SECONDS;
    return { x, y, z: Math.max(ground, z), rotation, bounces, settled, visible };
}
export function rotateStone([x, y, z]: Vec3, [a, b, c]: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
    const y1 = y * Math.cos(a) - z * Math.sin(a),
        z1 = y * Math.sin(a) + z * Math.cos(a);
    const x2 = x * Math.cos(b) + z1 * Math.sin(b),
        z2 = -x * Math.sin(b) + z1 * Math.cos(b);
    out[0] = x2 * Math.cos(c) - y1 * Math.sin(c);
    out[1] = x2 * Math.sin(c) + y1 * Math.cos(c);
    out[2] = z2;
    return out;
}
