export type PortraitFit = "cover" | "contain";
export type PortraitBackground = "none" | "soft";
export type PortraitSource = "portrait" | "full";

export interface PortraitFraming {
    source: PortraitSource;
    fit: PortraitFit;
    scale: number;
    offsetX: number;
    offsetY: number;
    background: PortraitBackground;
}

export const DEFAULT_PORTRAIT_FRAMING: PortraitFraming = {
    source: "full",
    fit: "contain",
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    background: "none",
};

export const PORTRAIT_OFFSET_X_MIN = -100;
export const PORTRAIT_OFFSET_X_MAX = 50;
export const PORTRAIT_OFFSET_Y_MIN = -200;
export const PORTRAIT_OFFSET_Y_MAX = 200;
export const PORTRAIT_SCALE_MIN = 0.5;
export const PORTRAIT_SCALE_MAX = 4;

/**
 * Named owner checkpoint for the complete approved portrait state. Keep this snapshot unchanged so a
 * later framing pass can always return to "точка X" without reconstructing values from local drafts.
 */
export const PORTRAIT_FRAMING_CHECKPOINT_X: Readonly<Partial<Record<number, PortraitFraming>>> = Object.freeze({
    1: { source: "full", fit: "cover", scale: 2.78, offsetX: -4, offsetY: 84, background: "none" },
    2: { source: "portrait", fit: "cover", scale: 3.01, offsetX: 13, offsetY: 100, background: "none" },
    3: { source: "portrait", fit: "cover", scale: 1.87, offsetX: -11, offsetY: 25, background: "none" },
    4: { source: "portrait", fit: "contain", scale: 2.44, offsetX: 3, offsetY: 11, background: "none" },
    5: { source: "portrait", fit: "cover", scale: 2.62, offsetX: -11, offsetY: 47, background: "none" },
    6: { source: "portrait", fit: "cover", scale: 1.23, offsetX: -2, offsetY: -6, background: "none" },
    7: { source: "full", fit: "contain", scale: 3.72, offsetX: 14, offsetY: 98, background: "none" },
    8: { source: "full", fit: "contain", scale: 3.82, offsetX: 0, offsetY: 80, background: "none" },
    9: { source: "full", fit: "contain", scale: 3.35, offsetX: -100, offsetY: 3, background: "none" },
    10: { source: "full", fit: "contain", scale: 2.84, offsetX: -71, offsetY: 5, background: "none" },
    11: { source: "portrait", fit: "cover", scale: 2.3, offsetX: 31, offsetY: -19, background: "none" },
    12: { source: "portrait", fit: "cover", scale: 1.94, offsetX: -18, offsetY: 27, background: "none" },
    13: { source: "full", fit: "contain", scale: 3.38, offsetX: -32, offsetY: 93, background: "none" },
    14: { source: "portrait", fit: "cover", scale: 1.67, offsetX: -23, offsetY: 14, background: "none" },
    15: { source: "portrait", fit: "cover", scale: 2.58, offsetX: 17, offsetY: 30, background: "none" },
    16: { source: "portrait", fit: "contain", scale: 2.53, offsetX: -50, offsetY: 22, background: "none" },
    17: { source: "full", fit: "contain", scale: 3.3, offsetX: -8, offsetY: 90, background: "none" },
    18: { source: "full", fit: "contain", scale: 3.41, offsetX: -14, offsetY: 79, background: "none" },
    19: { source: "full", fit: "contain", scale: 3.11, offsetX: -73, offsetY: 49, background: "none" },
    20: { source: "full", fit: "contain", scale: 3.35, offsetX: -91, offsetY: 49, background: "none" },
    21: { source: "portrait", fit: "contain", scale: 2.4, offsetX: -53, offsetY: 32, background: "none" },
    22: { source: "portrait", fit: "cover", scale: 2.11, offsetX: -10, offsetY: 32, background: "none" },
    23: { source: "portrait", fit: "cover", scale: 1.95, offsetX: -9, offsetY: 14, background: "none" },
    24: { source: "portrait", fit: "cover", scale: 1.95, offsetX: 26, offsetY: 30, background: "none" },
    25: { source: "full", fit: "contain", scale: 2.87, offsetX: -93, offsetY: 23, background: "none" },
    26: { source: "portrait", fit: "cover", scale: 1.75, offsetX: 27, offsetY: -3, background: "none" },
    27: { source: "full", fit: "contain", scale: 3.64, offsetX: -60, offsetY: 47, background: "none" },
    28: { source: "full", fit: "contain", scale: 2.53, offsetX: -56, offsetY: 30, background: "none" },
    29: { source: "full", fit: "contain", scale: 3.01, offsetX: -20, offsetY: 70, background: "none" },
    30: { source: "full", fit: "cover", scale: 2.4, offsetX: -47, offsetY: 42, background: "none" },
    31: { source: "portrait", fit: "cover", scale: 2, offsetX: 28, offsetY: 28, background: "none" },
    32: { source: "portrait", fit: "cover", scale: 2, offsetX: -13, offsetY: 14, background: "none" },
    33: { source: "portrait", fit: "cover", scale: 2, offsetX: 13, offsetY: 30, background: "none" },
    34: { source: "portrait", fit: "cover", scale: 2.78, offsetX: -25, offsetY: -12, background: "none" },
    35: { source: "portrait", fit: "cover", scale: 2.73, offsetX: 50, offsetY: -60, background: "none" },
    36: { source: "portrait", fit: "cover", scale: 2, offsetX: 13, offsetY: 32, background: "none" },
    37: { source: "full", fit: "contain", scale: 2.89, offsetX: -65, offsetY: 28, background: "none" },
    38: { source: "full", fit: "contain", scale: 4, offsetX: 1, offsetY: 73, background: "none" },
    39: { source: "full", fit: "contain", scale: 2.16, offsetX: -44, offsetY: -14, background: "none" },
    40: { source: "full", fit: "cover", scale: 3.81, offsetX: -15, offsetY: 100, background: "none" },
    41: { source: "full", fit: "contain", scale: 3.5, offsetX: -5, offsetY: 73, background: "none" },
    42: { source: "full", fit: "cover", scale: 3.78, offsetX: 16, offsetY: 89, background: "none" },
    43: { source: "full", fit: "contain", scale: 3.1, offsetX: -96, offsetY: -3, background: "none" },
    44: { source: "full", fit: "contain", scale: 3.93, offsetX: -58, offsetY: 4, background: "none" },
    46: { source: "portrait", fit: "cover", scale: 2.28, offsetX: 10, offsetY: 7, background: "none" },
    47: { source: "portrait", fit: "cover", scale: 2.24, offsetX: -41, offsetY: 6, background: "none" },
    48: { source: "portrait", fit: "cover", scale: 2, offsetX: 7, offsetY: 29, background: "none" },
    49: { source: "portrait", fit: "cover", scale: 2, offsetX: 5, offsetY: 39, background: "none" },
    50: { source: "full", fit: "contain", scale: 3.62, offsetX: 0, offsetY: 120, background: "none" },
    51: { source: "portrait", fit: "contain", scale: 2.08, offsetX: -48, offsetY: -27, background: "none" },
    52: { source: "portrait", fit: "cover", scale: 2, offsetX: -3, offsetY: -10, background: "none" },
    53: { source: "portrait", fit: "cover", scale: 2.89, offsetX: -72, offsetY: 16, background: "none" },
    54: { source: "full", fit: "cover", scale: 3.2, offsetX: -7, offsetY: 100, background: "none" },
    55: { source: "portrait", fit: "cover", scale: 2.49, offsetX: -15, offsetY: -3, background: "none" },
    56: { source: "full", fit: "contain", scale: 2.79, offsetX: -62, offsetY: 33, background: "none" },
    57: { source: "full", fit: "contain", scale: 2.95, offsetX: -83, offsetY: -10, background: "none" },
});

/** Production baseline used by every portrait consumer. */
export const PICK_PORTRAIT_FRAMING: Partial<Record<number, PortraitFraming>> = {
    ...PORTRAIT_FRAMING_CHECKPOINT_X,
};

// Start a clean editor namespace with the restored production framing so stale neutral localhost
// overrides from the uncropped roster regression cannot hide the approved close-ups.
export const PORTRAIT_FRAMING_STORAGE_KEY = "hoc-dev-pick-sandbox-portrait-framing-v2";

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const normalizePortraitFraming = (
    value: Partial<PortraitFraming> | undefined,
    fallback: PortraitFraming = DEFAULT_PORTRAIT_FRAMING,
): PortraitFraming => ({
    source: value?.source === "full" || value?.source === "portrait" ? value.source : fallback.source,
    fit: value?.fit === "contain" || value?.fit === "cover" ? value.fit : fallback.fit,
    scale: clamp(
        Number.isFinite(value?.scale) ? Number(value?.scale) : fallback.scale,
        PORTRAIT_SCALE_MIN,
        PORTRAIT_SCALE_MAX,
    ),
    offsetX: clamp(
        Number.isFinite(value?.offsetX) ? Number(value?.offsetX) : fallback.offsetX,
        PORTRAIT_OFFSET_X_MIN,
        PORTRAIT_OFFSET_X_MAX,
    ),
    offsetY: clamp(
        Number.isFinite(value?.offsetY) ? Number(value?.offsetY) : fallback.offsetY,
        PORTRAIT_OFFSET_Y_MIN,
        PORTRAIT_OFFSET_Y_MAX,
    ),
    background: value?.background === "soft" || value?.background === "none" ? value.background : fallback.background,
});

let cachedStorageValue: string | null | undefined;
let cachedStoredFraming: Record<number, PortraitFraming> = {};

export const readStoredPortraitFraming = (): Record<number, PortraitFraming> => {
    if (typeof window === "undefined") return {};

    const raw = window.localStorage.getItem(PORTRAIT_FRAMING_STORAGE_KEY);
    if (raw === cachedStorageValue) return cachedStoredFraming;

    cachedStorageValue = raw;
    if (!raw) {
        cachedStoredFraming = {};
        return cachedStoredFraming;
    }

    try {
        const parsed = JSON.parse(raw) as Record<string, Partial<PortraitFraming>>;
        cachedStoredFraming = Object.fromEntries(
            Object.entries(parsed)
                .filter(([creatureId]) => Number.isInteger(Number(creatureId)))
                .map(([creatureId, framing]) => [Number(creatureId), normalizePortraitFraming(framing)]),
        );
    } catch {
        cachedStoredFraming = {};
    }
    return cachedStoredFraming;
};

export const writeStoredPortraitFraming = (framing: Record<number, PortraitFraming>): void => {
    if (typeof window === "undefined") return;

    const normalized = Object.fromEntries(
        Object.entries(framing).map(([creatureId, value]) => [creatureId, normalizePortraitFraming(value)]),
    );
    const raw = JSON.stringify(normalized);
    window.localStorage.setItem(PORTRAIT_FRAMING_STORAGE_KEY, raw);
    cachedStorageValue = raw;
    cachedStoredFraming = normalized;
};

export const resolvePortraitFraming = (creatureId: number): PortraitFraming => {
    const committed = normalizePortraitFraming(PICK_PORTRAIT_FRAMING[creatureId]);
    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") return committed;
    return normalizePortraitFraming(readStoredPortraitFraming()[creatureId], committed);
};

export const portraitFramingEquals = (left: PortraitFraming, right: PortraitFraming): boolean =>
    left.source === right.source &&
    left.fit === right.fit &&
    left.scale === right.scale &&
    left.offsetX === right.offsetX &&
    left.offsetY === right.offsetY &&
    left.background === right.background;
