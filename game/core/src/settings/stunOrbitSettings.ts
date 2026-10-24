import { readAnimationSetting, saveAnimationSetting } from "./animationLabProfile";

export const STUN_ORBIT_DEFAULTS = { tiltDeg: 52, rotationDeg: 0 };
export type StunOrbitSettings = typeof STUN_ORBIT_DEFAULTS;
export const STUN_ORBIT_RANGES: Record<keyof StunOrbitSettings, readonly [number, number]> = {
    tiltDeg: [0, 90],
    rotationDeg: [-180, 180],
};

function clampSetting(key: keyof StunOrbitSettings, value: number): number {
    const [min, max] = STUN_ORBIT_RANGES[key];
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : STUN_ORBIT_DEFAULTS[key];
}

export function readStunOrbitSettings(): StunOrbitSettings {
    return {
        tiltDeg: clampSetting("tiltDeg", readAnimationSetting<number>("stun.tiltDeg", STUN_ORBIT_DEFAULTS.tiltDeg)),
        rotationDeg: clampSetting("rotationDeg", readAnimationSetting<number>("stun.rotationDeg", 0)),
    };
}

export function setStunOrbitSetting(key: keyof StunOrbitSettings, value: number): number {
    const bounded = clampSetting(key, value);
    saveAnimationSetting(`stun.${key}`, bounded);
    return bounded;
}
