import type { HoCMath } from "@heroesofcrypto/common";

/** Input contains only units actually intersected by the engine's Through Shot evaluation. */
export function lastCannonHit<T extends { getPosition(): HoCMath.XY }>(
    from: HoCMath.XY,
    toward: HoCMath.XY,
    affected: readonly T[],
): T | undefined {
    const dx = toward.x - from.x;
    const dy = toward.y - from.y;
    if (Math.hypot(dx, dy) < 0.001) return undefined;
    let last: T | undefined;
    let farthest = 0;
    for (const unit of affected) {
        const p = unit.getPosition();
        const along = (p.x - from.x) * dx + (p.y - from.y) * dy;
        if (along > farthest) {
            farthest = along;
            last = unit;
        }
    }
    return last;
}

/** Stop the sphere when its leading surface reaches the victim's contact point. */
export function cannonContactCenter(from: HoCMath.XY, contact: HoCMath.XY, diameter: number): HoCMath.XY {
    const dx = contact.x - from.x;
    const dy = contact.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.001) return { ...from };
    const t = Math.max(0, distance - diameter / 2) / distance;
    return { x: from.x + dx * t, y: from.y + dy * t };
}

export const CANNON_EXPLOSION_DURATIONS = Array.from({ length: 16 }, (_, i) => 20 + 4 * i);
export const CANNON_FLIGHT_SPEED_MULTIPLIER = 1.25 * 1.6 * 1.15;
export const CANNON_EXPLOSION_SPEED_MULTIPLIER = 1.38 * 1.6 * 1.22;
export const CANNON_EXPLOSION_RADIUS_SCALE = 0.75;
export const CANNON_BALL_SIZE_MULTIPLIER = 1.1;
// Compensate for the larger projectile sprite so the wake is exactly half its previous world size.
export const CANNON_WAKE_SCALE = (0.7 * 0.5) / CANNON_BALL_SIZE_MULTIPLIER;
export const CANNON_FLIGHT_FRAME_SIZE = 320;
export const CANNON_FLIGHT_BALL_DIAMETER = 88;
export const CANNON_FLIGHT_BALL_ANCHOR = { x: 257 / 320, y: 145 / 320 };
export const cannonFlightFrame = (elapsedMs: number): number => Math.floor(Math.max(0, elapsedMs) / 40) % 16;
export function cannonExplosionFrame(elapsedMs: number): number {
    let end = 0;
    for (let i = 0; i < CANNON_EXPLOSION_DURATIONS.length; i++) {
        end += CANNON_EXPLOSION_DURATIONS[i];
        if (elapsedMs < end) return i;
    }
    return -1;
}
