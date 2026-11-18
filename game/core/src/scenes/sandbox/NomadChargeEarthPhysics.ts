/** World-ground velocity and vertical lift are separate; Y is up in the battlefield root. */
export interface EarthBody {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    bounces: number;
}

export function stepChargeEarth(body: EarthBody, dt: number, cell: number): boolean {
    let bounced = false;
    const drag = Math.exp(-1.5 * dt);
    body.vx *= drag;
    body.vy *= drag;
    body.vz -= cell * 8.5 * dt;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    body.z += body.vz * dt;
    if (body.z < 0) {
        body.z = 0;
        if (body.vz < -cell * 0.25 && body.bounces < 2) {
            body.vz *= -0.31;
            body.vx *= 0.58;
            body.vy *= 0.58;
            body.bounces++;
            bounced = true;
        } else {
            body.vz = 0;
            body.vx *= Math.exp(-18 * dt);
            body.vy *= Math.exp(-18 * dt);
        }
    }
    return bounced;
}

export const NOMAD_CHARGE_GAIT_MULTIPLIER = 2;
export const NOMAD_CHARGE_CYCLE_CELLS = 1.3 / NOMAD_CHARGE_GAIT_MULTIPLIER;
// Authored 8-cel walk: rear support at 0/4, fore contact at 3/7.
export const NOMAD_HOOF_PHASES = [0, 3 / 8, 4 / 8, 7 / 8] as const;
export function nomadHoofDistance(index: number): number {
    return (Math.floor(index / 4) + NOMAD_HOOF_PHASES[index % 4]) * NOMAD_CHARGE_CYCLE_CELLS;
}
