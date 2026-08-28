export interface LeftSidebarPortraitTuning {
    /** Extra multiplier applied only to the creature artwork. */
    artScale: number;
    /** Extra horizontal creature-art offset, in portrait percentages. */
    artOffsetX: number;
    /** Extra vertical creature-art offset, in portrait percentages. */
    artOffsetY: number;
    /** Width of the linked portrait + stat plate block, as a sidebar percentage. */
    containerWidth: number;
    /** Horizontal offset of the linked portrait + stat plate block, as a sidebar percentage. */
    containerOffsetX: number;
}

export const DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING: Readonly<LeftSidebarPortraitTuning> = Object.freeze({
    artScale: 0.93,
    artOffsetX: 0,
    artOffsetY: 0,
    containerWidth: 99,
    containerOffsetX: 1,
});

/** Complete selected-unit zone, from the portrait top through the stat plate and down to Abilities. */
export const LEFT_SIDEBAR_CARD_ASPECT = 190 / 256;
/** Share of the complete selected-unit zone occupied by the three stat rows. */
export const LEFT_SIDEBAR_STAT_PLATE_SHARE = 0.32;

export const LEFT_SIDEBAR_ART_SCALE_MIN = 0.5;
export const LEFT_SIDEBAR_ART_SCALE_MAX = 1.5;
export const LEFT_SIDEBAR_ART_OFFSET_MIN = -100;
export const LEFT_SIDEBAR_ART_OFFSET_MAX = 100;
export const LEFT_SIDEBAR_CONTAINER_WIDTH_MIN = 60;
export const LEFT_SIDEBAR_CONTAINER_WIDTH_MAX = 120;
export const LEFT_SIDEBAR_CONTAINER_OFFSET_MIN = -30;
export const LEFT_SIDEBAR_CONTAINER_OFFSET_MAX = 30;

/**
 * Production values exported from the left-sidebar editor belong here. The shared default preserves the
 * approved one-percent inset and seven-percent creature reduction until an individual creature is tuned.
 */
export const LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X: Readonly<Partial<Record<number, LeftSidebarPortraitTuning>>> =
    Object.freeze({
        1: { artScale: 0.76, artOffsetX: 3, artOffsetY: -31, containerWidth: 99, containerOffsetX: 1 },
        2: { artScale: 0.82, artOffsetX: 0, artOffsetY: -27, containerWidth: 99, containerOffsetX: 1 },
        3: { artScale: 0.68, artOffsetX: 10, artOffsetY: -16, containerWidth: 99, containerOffsetX: 1 },
        4: { artScale: 0.74, artOffsetX: 0, artOffsetY: -13, containerWidth: 99, containerOffsetX: 1 },
        5: { artScale: 0.74, artOffsetX: 4, artOffsetY: -21, containerWidth: 99, containerOffsetX: 1 },
        6: { artScale: 1.5, artOffsetX: -1, artOffsetY: 17, containerWidth: 99, containerOffsetX: 1 },
        7: { artScale: 0.73, artOffsetX: 1, artOffsetY: -35, containerWidth: 99, containerOffsetX: 1 },
        8: { artScale: 0.82, artOffsetX: -5, artOffsetY: -22, containerWidth: 99, containerOffsetX: 1 },
        9: { artScale: 0.82, artOffsetX: 26, artOffsetY: -8, containerWidth: 99, containerOffsetX: 1 },
        10: { artScale: 0.79, artOffsetX: 25, artOffsetY: -12, containerWidth: 99, containerOffsetX: 1 },
        11: { artScale: 0.71, artOffsetX: -7, artOffsetY: -4, containerWidth: 99, containerOffsetX: 1 },
        12: { artScale: 0.69, artOffsetX: 3, artOffsetY: -17, containerWidth: 99, containerOffsetX: 1 },
        13: { artScale: 0.86, artOffsetX: 4, artOffsetY: -14, containerWidth: 99, containerOffsetX: 1 },
        14: { artScale: 0.76, artOffsetX: 2, artOffsetY: -15, containerWidth: 99, containerOffsetX: 1 },
        15: { artScale: 0.7, artOffsetX: -6, artOffsetY: -18, containerWidth: 99, containerOffsetX: 1 },
        16: { artScale: 0.74, artOffsetX: 19, artOffsetY: -20, containerWidth: 99, containerOffsetX: 1 },
        17: { artScale: 0.75, artOffsetX: 0, artOffsetY: -28, containerWidth: 99, containerOffsetX: 1 },
        18: { artScale: 0.82, artOffsetX: 5, artOffsetY: -18, containerWidth: 99, containerOffsetX: 1 },
        19: { artScale: 0.84, artOffsetX: 17, artOffsetY: -21, containerWidth: 99, containerOffsetX: 1 },
        20: { artScale: 0.69, artOffsetX: 44, artOffsetY: -29, containerWidth: 99, containerOffsetX: 1 },
        21: { artScale: 0.9, artOffsetX: 12, artOffsetY: -10, containerWidth: 99, containerOffsetX: 1 },
        22: { artScale: 0.7, artOffsetX: 1, artOffsetY: -17, containerWidth: 99, containerOffsetX: 1 },
        23: { artScale: 1.05, artOffsetX: 5, artOffsetY: 27, containerWidth: 99, containerOffsetX: 1 },
        24: { artScale: 0.85, artOffsetX: -7, artOffsetY: -5, containerWidth: 99, containerOffsetX: 1 },
        25: { artScale: 0.85, artOffsetX: 20, artOffsetY: -15, containerWidth: 99, containerOffsetX: 1 },
        26: { artScale: 0.89, artOffsetX: -9, artOffsetY: -5, containerWidth: 99, containerOffsetX: 1 },
        27: { artScale: 0.64, artOffsetX: 14, artOffsetY: -35, containerWidth: 99, containerOffsetX: 1 },
        28: { artScale: 0.89, artOffsetX: 11, artOffsetY: -17, containerWidth: 99, containerOffsetX: 1 },
        29: { artScale: 0.88, artOffsetX: 5, artOffsetY: -14, containerWidth: 99, containerOffsetX: 1 },
        30: { artScale: 0.89, artOffsetX: -1, artOffsetY: -12, containerWidth: 99, containerOffsetX: 1 },
        31: { artScale: 0.72, artOffsetX: -7, artOffsetY: -13, containerWidth: 99, containerOffsetX: 1 },
        32: { artScale: 0.69, artOffsetX: 8, artOffsetY: -6, containerWidth: 99, containerOffsetX: 1 },
        33: { artScale: 0.59, artOffsetX: -5, artOffsetY: -21, containerWidth: 99, containerOffsetX: 1 },
        34: { artScale: 0.8, artOffsetX: 38, artOffsetY: 59, containerWidth: 99, containerOffsetX: 1 },
        35: { artScale: 0.73, artOffsetX: -3, artOffsetY: 11, containerWidth: 99, containerOffsetX: 1 },
        36: { artScale: 0.77, artOffsetX: -8, artOffsetY: -11, containerWidth: 99, containerOffsetX: 1 },
        37: { artScale: 0.8, artOffsetX: 22, artOffsetY: -13, containerWidth: 99, containerOffsetX: 1 },
        38: { artScale: 0.74, artOffsetX: 0, artOffsetY: -22, containerWidth: 99, containerOffsetX: 1 },
        39: { artScale: 1.18, artOffsetX: 25, artOffsetY: 15, containerWidth: 99, containerOffsetX: 1 },
        40: { artScale: 0.65, artOffsetX: 6, artOffsetY: -46, containerWidth: 99, containerOffsetX: 1 },
        41: { artScale: 0.72, artOffsetX: 4, artOffsetY: -32, containerWidth: 99, containerOffsetX: 1 },
        42: { artScale: 0.73, artOffsetX: -7, artOffsetY: -33, containerWidth: 99, containerOffsetX: 1 },
        43: { artScale: 0.78, artOffsetX: 38, artOffsetY: -13, containerWidth: 99, containerOffsetX: 1 },
        44: { artScale: 0.74, artOffsetX: 3, artOffsetY: -12, containerWidth: 99, containerOffsetX: 1 },
        46: { artScale: 0.71, artOffsetX: 1, artOffsetY: -4, containerWidth: 99, containerOffsetX: 1 },
        47: { artScale: 0.69, artOffsetX: 16, artOffsetY: -9, containerWidth: 99, containerOffsetX: 1 },
        48: { artScale: 0.76, artOffsetX: -6, artOffsetY: -9, containerWidth: 99, containerOffsetX: 1 },
        49: { artScale: 0.77, artOffsetX: 0, artOffsetY: -12, containerWidth: 99, containerOffsetX: 1 },
        50: { artScale: 0.77, artOffsetX: 0, artOffsetY: -33, containerWidth: 99, containerOffsetX: 1 },
        51: { artScale: 1.48, artOffsetX: 5, artOffsetY: 39, containerWidth: 99, containerOffsetX: 1 },
        52: { artScale: 0.76, artOffsetX: 6, artOffsetY: 2, containerWidth: 99, containerOffsetX: 1 },
        53: { artScale: 0.74, artOffsetX: 19, artOffsetY: -17, containerWidth: 99, containerOffsetX: 1 },
        54: { artScale: 0.71, artOffsetX: 6, artOffsetY: -41, containerWidth: 99, containerOffsetX: 1 },
        55: { artScale: 0.67, artOffsetX: 6, artOffsetY: 1, containerWidth: 99, containerOffsetX: 1 },
        56: { artScale: 0.71, artOffsetX: 20, artOffsetY: -21, containerWidth: 99, containerOffsetX: 1 },
        57: { artScale: 0.82, artOffsetX: 21, artOffsetY: -8, containerWidth: 99, containerOffsetX: 1 },
    });

/** Active production set: the user-approved left-screen portrait recovery point X. */
export const LEFT_SIDEBAR_PORTRAIT_TUNING = LEFT_SIDEBAR_PORTRAIT_CHECKPOINT_X;

// Preserve the JSON tuned in the left-sidebar dev editor. The temporary OSG-2308 namespace hid those
// settings from localhost; keep it only as a fallback so edits made under either key remain recoverable.
export const LEFT_SIDEBAR_PORTRAIT_TUNING_STORAGE_KEY = "hoc-dev-left-sidebar-portrait-tuning-v1";
const LEGACY_LEFT_SIDEBAR_PORTRAIT_TUNING_STORAGE_KEYS: readonly string[] = [
    "hoc-dev-left-sidebar-portrait-tuning-osg-2308-v1",
];
export const LEFT_SIDEBAR_PORTRAIT_TUNING_EVENT = "hoc:left-sidebar-portrait-tuning-change";

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));

const finiteOr = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const normalizeLeftSidebarPortraitTuning = (
    value?: Partial<LeftSidebarPortraitTuning>,
    fallback: LeftSidebarPortraitTuning = DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING,
): LeftSidebarPortraitTuning => ({
    artScale: clamp(
        finiteOr(value?.artScale, fallback.artScale),
        LEFT_SIDEBAR_ART_SCALE_MIN,
        LEFT_SIDEBAR_ART_SCALE_MAX,
    ),
    artOffsetX: clamp(
        finiteOr(value?.artOffsetX, fallback.artOffsetX),
        LEFT_SIDEBAR_ART_OFFSET_MIN,
        LEFT_SIDEBAR_ART_OFFSET_MAX,
    ),
    artOffsetY: clamp(
        finiteOr(value?.artOffsetY, fallback.artOffsetY),
        LEFT_SIDEBAR_ART_OFFSET_MIN,
        LEFT_SIDEBAR_ART_OFFSET_MAX,
    ),
    containerWidth: clamp(
        finiteOr(value?.containerWidth, fallback.containerWidth),
        LEFT_SIDEBAR_CONTAINER_WIDTH_MIN,
        LEFT_SIDEBAR_CONTAINER_WIDTH_MAX,
    ),
    containerOffsetX: clamp(
        finiteOr(value?.containerOffsetX, fallback.containerOffsetX),
        LEFT_SIDEBAR_CONTAINER_OFFSET_MIN,
        LEFT_SIDEBAR_CONTAINER_OFFSET_MAX,
    ),
});

export const committedLeftSidebarPortraitTuning = (creatureId: number): LeftSidebarPortraitTuning =>
    normalizeLeftSidebarPortraitTuning(LEFT_SIDEBAR_PORTRAIT_TUNING[creatureId]);

let cachedStorageValue: string | null | undefined;
let cachedStoredTunings: Record<number, LeftSidebarPortraitTuning> = {};

export const readStoredLeftSidebarPortraitTunings = (): Record<number, LeftSidebarPortraitTuning> => {
    if (typeof window === "undefined") return {};

    let raw = window.localStorage.getItem(LEFT_SIDEBAR_PORTRAIT_TUNING_STORAGE_KEY);
    if (!raw) {
        raw =
            LEGACY_LEFT_SIDEBAR_PORTRAIT_TUNING_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(
                Boolean,
            ) ?? null;
        if (raw) window.localStorage.setItem(LEFT_SIDEBAR_PORTRAIT_TUNING_STORAGE_KEY, raw);
    }
    if (raw === cachedStorageValue) return cachedStoredTunings;

    cachedStorageValue = raw;
    if (!raw) {
        cachedStoredTunings = {};
        return cachedStoredTunings;
    }

    try {
        const parsed = JSON.parse(raw) as Record<string, Partial<LeftSidebarPortraitTuning>>;
        cachedStoredTunings = Object.fromEntries(
            Object.entries(parsed)
                .filter(([creatureId]) => Number.isInteger(Number(creatureId)))
                .map(([creatureId, tuning]) => [
                    Number(creatureId),
                    normalizeLeftSidebarPortraitTuning(tuning, committedLeftSidebarPortraitTuning(Number(creatureId))),
                ]),
        );
    } catch {
        cachedStoredTunings = {};
    }
    return cachedStoredTunings;
};

export const writeStoredLeftSidebarPortraitTunings = (tunings: Record<number, LeftSidebarPortraitTuning>): void => {
    if (typeof window === "undefined") return;

    const normalized = Object.fromEntries(
        Object.entries(tunings).map(([creatureId, tuning]) => [
            creatureId,
            normalizeLeftSidebarPortraitTuning(tuning, committedLeftSidebarPortraitTuning(Number(creatureId))),
        ]),
    );
    const raw = JSON.stringify(normalized);
    window.localStorage.setItem(LEFT_SIDEBAR_PORTRAIT_TUNING_STORAGE_KEY, raw);
    cachedStorageValue = raw;
    cachedStoredTunings = normalized;
    window.dispatchEvent(new Event(LEFT_SIDEBAR_PORTRAIT_TUNING_EVENT));
};

export const resolveLeftSidebarPortraitTuning = (creatureId: number): LeftSidebarPortraitTuning => {
    const committed = committedLeftSidebarPortraitTuning(creatureId);
    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") return committed;
    return normalizeLeftSidebarPortraitTuning(readStoredLeftSidebarPortraitTunings()[creatureId], committed);
};

export const leftSidebarPortraitTuningEquals = (
    left: LeftSidebarPortraitTuning,
    right: LeftSidebarPortraitTuning,
): boolean =>
    left.artScale === right.artScale &&
    left.artOffsetX === right.artOffsetX &&
    left.artOffsetY === right.artOffsetY &&
    left.containerWidth === right.containerWidth &&
    left.containerOffsetX === right.containerOffsetX;
