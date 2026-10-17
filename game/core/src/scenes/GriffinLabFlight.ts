import { readAnimationSetting, saveAnimationSetting } from "../settings/animationLabProfile";
import { VALKYRIE_LAB_TRANSITION_SPEED } from "./ValkyrieLabWalk";

export interface GriffinLabFlightSettings {
    takeoffSpeed: number;
    travelSpeed: number;
    landingSpeed: number;
}

export const GRIFFIN_LAB_FLIGHT_DEFAULTS: Readonly<GriffinLabFlightSettings> = {
    takeoffSpeed: 1,
    travelSpeed: 1,
    landingSpeed: 1,
};

export const GRIFFIN_FLIGHT_SETTINGS_STORAGE_KEY = "hoc:griffinFlightSettings:v1";

export function readGriffinLabFlightSettings(storage?: Pick<Storage, "getItem">): GriffinLabFlightSettings {
    const settings = { ...GRIFFIN_LAB_FLIGHT_DEFAULTS };
    try {
        const saved = JSON.parse(
            (storage ?? globalThis.localStorage)?.getItem(GRIFFIN_FLIGHT_SETTINGS_STORAGE_KEY) ?? "null",
        );
        if (saved && typeof saved === "object") {
            for (const key of Object.keys(settings) as Array<keyof GriffinLabFlightSettings>) {
                if (typeof saved[key] === "number" && Number.isFinite(saved[key])) {
                    settings[key] = Math.max(0.25, Math.min(3, saved[key]));
                }
            }
        }
    } catch {
        // Keep the approved defaults if browser storage is unavailable or corrupt.
    }
    if (!storage)
        for (const key of Object.keys(settings) as (keyof GriffinLabFlightSettings)[])
            settings[key] = readAnimationSetting(`griffin.${key}`, settings[key]);
    return settings;
}

export const griffinLabFlightSettings: GriffinLabFlightSettings = readGriffinLabFlightSettings();

export function setGriffinLabFlightSetting(key: keyof GriffinLabFlightSettings, value: number): void {
    if (!Number.isFinite(value)) return;
    griffinLabFlightSettings[key] = Math.max(0.25, Math.min(3, value));
    saveAnimationSetting(`griffin.${key}`, griffinLabFlightSettings[key]);
    try {
        globalThis.localStorage?.setItem(GRIFFIN_FLIGHT_SETTINGS_STORAGE_KEY, JSON.stringify(griffinLabFlightSettings));
    } catch {
        // The current session remains usable when browser storage is disabled.
    }
}

// Exact raster placement of the canonical 768px source on the expanded canvas.
// Use the actual rounded raster size, not the nominal 0.85 resize factor.
export const GRIFFIN_LAB_SOURCE_SIZE = 653;
export const GRIFFIN_LAB_SOURCE_X = 249;
export const GRIFFIN_LAB_SOURCE_Y = 186;
export const GRIFFIN_LAB_WALK_SCALE = 1024 / GRIFFIN_LAB_SOURCE_SIZE;

// Registration of the canonical source centre on the expanded flight canvas.
export const GRIFFIN_LAB_WALK_ANCHOR_X = (GRIFFIN_LAB_SOURCE_X + GRIFFIN_LAB_SOURCE_SIZE / 2) / 1024;

export function griffinLabWalkAnchorY(sourceAnchorY: number): number {
    return (GRIFFIN_LAB_SOURCE_Y + GRIFFIN_LAB_SOURCE_SIZE * sourceAnchorY) / 1024;
}

// Use the same wall-clock correction as Valkyrie, before the user phase multiplier.
export const GRIFFIN_LAB_TRANSITION_SPEED = VALKYRIE_LAB_TRANSITION_SPEED;

export const GRIFFIN_LAB_LANDING_SPEED = 1.2;
export const GRIFFIN_LAB_TAKEOFF_SPEED = 1.2;

// Measured grounded foremost talon positions in the authored 768px hit frames.
// Register the sprite around that contact instead of moving the source pixels or clipping the tail.
const GRIFFIN_LAB_HIT_SUPPORT_X = [706, 719, 732, 740, 749, 740, 732, 729, 726, 716, 706] as const;

export function griffinLabHitAnchorX(frameIndex: number): number {
    const contactX = GRIFFIN_LAB_HIT_SUPPORT_X[frameIndex] ?? GRIFFIN_LAB_HIT_SUPPORT_X[0];
    return 0.5 + (contactX - GRIFFIN_LAB_HIT_SUPPORT_X[0]) / 768;
}
