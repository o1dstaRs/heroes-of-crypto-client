import { readAnimationSetting, saveAnimationSetting } from "../settings/animationLabProfile";
export interface MantisLabFlightSettings {
    takeoffSpeed: number;
    travelSpeed: number;
    landingSpeed: number;
}

export const MANTIS_LAB_FLIGHT_DEFAULTS: Readonly<MantisLabFlightSettings> = {
    takeoffSpeed: 1.3 * 1.15 * 1.2 * 1.25,
    travelSpeed: 1,
    landingSpeed: 1.3 * 1.15 * 1.2 * 1.25,
};

// Independent local profile, shared by the lab and approved animation renderer.
export const mantisLabFlightSettings: MantisLabFlightSettings = { ...MANTIS_LAB_FLIGHT_DEFAULTS };
for (const key of Object.keys(mantisLabFlightSettings) as (keyof MantisLabFlightSettings)[])
    mantisLabFlightSettings[key] = readAnimationSetting(`mantis.${key}`, mantisLabFlightSettings[key]);

export function setMantisLabFlightSetting(key: keyof MantisLabFlightSettings, value: number): void {
    if (!Number.isFinite(value)) return;
    mantisLabFlightSettings[key] = Math.max(0.25, Math.min(3, value));
    saveAnimationSetting(`mantis.${key}`, mantisLabFlightSettings[key]);
}

// Flight carries the current 512px idle at 60% scale with transparent wing clearance.
// The opening/landing sprites use this exact camera and palette, without changing unit size.
export const MANTIS_LAB_WALK_SCALE = 1 / 0.6;
export const mantisLabWalkAnchorY = (idleAnchorY: number): number => (180 + 512 * 0.6 * idleAnchorY) / 512;
