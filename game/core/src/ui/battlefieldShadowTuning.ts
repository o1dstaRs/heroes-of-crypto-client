export interface BattlefieldShadowRowTuning {
    lengthScale: number;
    widthScale: number;
    alpha: number;
    offsetXCells: number;
    offsetYCells: number;
    rotationDegrees: number;
    /** Four left-to-right vertical silhouette bands; 1 keeps the row's base length. */
    segmentLengthMultipliers: readonly number[];
}

export interface BattlefieldShadowTuning {
    bottom: BattlefieldShadowRowTuning;
    top: BattlefieldShadowRowTuning;
    /** Keeps an explicitly approved lower-row opacity instead of deriving it from the upper row. */
    bottomAlphaOverride?: number;
    contactAlpha: number;
    contactShadowVisible: boolean;
}

export interface BattlefieldShadowSegmentVisualBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface BattlefieldShadowVisualBounds {
    bounds: BattlefieldShadowSegmentVisualBounds;
    cellWidth: number;
    cellHeight: number;
    updatedAt: number;
}

export const BATTLEFIELD_SHADOW_TUNING_STORAGE_KEY = "hoc-dev-battlefield-shadow-tuning-v7";
export const BATTLEFIELD_SHADOW_SEGMENT_COUNT = 4;
const DEFAULT_SEGMENT_LENGTH_MULTIPLIERS = Object.freeze([1, 1, 1, 1]);
const AUTOMATIC_BOTTOM_LENGTH_RATIO = 0.9;
const roundTuningValue = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

export const DEFAULT_BATTLEFIELD_SHADOW_TUNING: BattlefieldShadowTuning = Object.freeze({
    bottom: Object.freeze({
        lengthScale: 0.6102,
        widthScale: 0.883,
        alpha: 0.45,
        offsetXCells: 0.036,
        offsetYCells: 0.272,
        rotationDegrees: -14,
        segmentLengthMultipliers: DEFAULT_SEGMENT_LENGTH_MULTIPLIERS,
    }),
    top: Object.freeze({
        lengthScale: 0.678,
        widthScale: 0.883,
        alpha: 0.45,
        offsetXCells: 0.036,
        offsetYCells: 0.272,
        rotationDegrees: -14,
        segmentLengthMultipliers: DEFAULT_SEGMENT_LENGTH_MULTIPLIERS,
    }),
    contactAlpha: 0.15,
    contactShadowVisible: true,
});

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
};

const normalizeRow = (
    value: Partial<BattlefieldShadowRowTuning> | undefined,
    fallback: BattlefieldShadowRowTuning,
): BattlefieldShadowRowTuning => {
    const requestedSegments = Array.isArray(value?.segmentLengthMultipliers)
        ? value.segmentLengthMultipliers
        : fallback.segmentLengthMultipliers;
    return {
        lengthScale: clamp(value?.lengthScale, fallback.lengthScale, 0.05, 1.5),
        widthScale: clamp(value?.widthScale, fallback.widthScale, 0.1, 2),
        alpha: clamp(value?.alpha, fallback.alpha, 0, 1),
        offsetXCells: clamp(value?.offsetXCells, fallback.offsetXCells, -2, 2),
        offsetYCells: clamp(value?.offsetYCells, fallback.offsetYCells, -2, 2),
        rotationDegrees: clamp(value?.rotationDegrees, fallback.rotationDegrees, -60, 60),
        segmentLengthMultipliers: Array.from({ length: BATTLEFIELD_SHADOW_SEGMENT_COUNT }, (_, index) =>
            clamp(requestedSegments[index], fallback.segmentLengthMultipliers[index] ?? 1, 0.25, 3),
        ),
    };
};

const automaticBottomRow = (top: BattlefieldShadowRowTuning): BattlefieldShadowRowTuning => ({
    ...top,
    lengthScale: roundTuningValue(top.lengthScale * AUTOMATIC_BOTTOM_LENGTH_RATIO),
    segmentLengthMultipliers: [...top.segmentLengthMultipliers],
});

export const normalizeBattlefieldShadowTuning = (
    value?: Omit<Partial<BattlefieldShadowTuning>, "bottom" | "top"> & {
        bottom?: Partial<BattlefieldShadowRowTuning>;
        top?: Partial<BattlefieldShadowRowTuning>;
    },
): BattlefieldShadowTuning => {
    const top = normalizeRow(value?.top, DEFAULT_BATTLEFIELD_SHADOW_TUNING.top);
    const requestedBottomAlphaOverride = value?.bottomAlphaOverride;
    const bottomAlphaOverride =
        requestedBottomAlphaOverride === undefined ? undefined : clamp(requestedBottomAlphaOverride, top.alpha, 0, 1);
    const bottom = automaticBottomRow(top);
    if (bottomAlphaOverride !== undefined) bottom.alpha = bottomAlphaOverride;
    return {
        bottom,
        top,
        ...(bottomAlphaOverride === undefined ? {} : { bottomAlphaOverride }),
        contactAlpha: clamp(value?.contactAlpha, DEFAULT_BATTLEFIELD_SHADOW_TUNING.contactAlpha, 0, 1),
        contactShadowVisible:
            typeof value?.contactShadowVisible === "boolean"
                ? value.contactShadowVisible
                : DEFAULT_BATTLEFIELD_SHADOW_TUNING.contactShadowVisible,
    };
};

const LEVEL_ONE_CREATURE_NAMES = [
    "Orc",
    "Scavenger",
    "Troglodyte",
    "Centaur",
    "Berserker",
    "Wolf Rider",
    "Wolf",
    "Fairy",
    "Leprechaun",
    "Peasant",
    "Squire",
    "Arbalester",
    "Mermaid",
    "Dryad",
    "Blacksmith",
    "Wandering Mage",
] as const;

const BLACK_DRAGON_SHADOW_TUNING = normalizeBattlefieldShadowTuning({
    top: {
        lengthScale: 0.838,
        widthScale: 0.947,
        alpha: 0.45,
        offsetXCells: 0.035,
        offsetYCells: 0.594,
        rotationDegrees: -14,
        segmentLengthMultipliers: [1, 1, 1, 1],
    },
    contactAlpha: 0.15,
    contactShadowVisible: true,
});

const FRENZIED_BOAR_SHADOW_TUNING = normalizeBattlefieldShadowTuning({
    top: {
        lengthScale: 0.838,
        widthScale: 0.949,
        alpha: 0.45,
        offsetXCells: 0.043,
        offsetYCells: 0.731,
        rotationDegrees: -14,
        segmentLengthMultipliers: [1, 1, 1, 1],
    },
    contactAlpha: 0.15,
    contactShadowVisible: true,
});

const CYCLOPS_SHADOW_TUNING = normalizeBattlefieldShadowTuning({
    top: {
        lengthScale: 0.72,
        widthScale: 0.938,
        alpha: 0.45,
        offsetXCells: 0.095,
        offsetYCells: 0.413,
        rotationDegrees: -14,
        segmentLengthMultipliers: [1, 1, 1, 1],
    },
    contactAlpha: 0.15,
    contactShadowVisible: true,
});

// Recovered from the owner's final v7 editor draft. The large positive Y offset is intentional: it
// pulls the flattened spider silhouette back under the many-legged figure instead of leaving it as a
// detached pair of dark shapes farther down the board.
const ARACHNA_SHADOW_TUNING = normalizeBattlefieldShadowTuning({
    top: {
        lengthScale: 0.815,
        widthScale: 1.021,
        alpha: 0.45,
        offsetXCells: 0.183,
        offsetYCells: 1.606,
        rotationDegrees: -14,
        segmentLengthMultipliers: [1, 1, 1, 1],
    },
    contactAlpha: 0.15,
    contactShadowVisible: true,
});

const MANTIS_SHADOW_TUNING = normalizeBattlefieldShadowTuning({
    top: {
        lengthScale: 0.814,
        widthScale: 0.904,
        alpha: 0.45,
        offsetXCells: 0.052,
        offsetYCells: 0.51,
        rotationDegrees: -14,
        segmentLengthMultipliers: [1, 1, 1, 1],
    },
    contactAlpha: 0.15,
    contactShadowVisible: true,
});

const HYDRA_SHADOW_TUNING = normalizeBattlefieldShadowTuning({
    top: {
        lengthScale: 0.759,
        widthScale: 0.971,
        alpha: 0.45,
        offsetXCells: 0.017,
        offsetYCells: 0.49,
        rotationDegrees: -14,
        segmentLengthMultipliers: [1, 1, 1, 1],
    },
    contactAlpha: 0.15,
    contactShadowVisible: true,
});

const BEHEMOTH_SHADOW_TUNING = normalizeBattlefieldShadowTuning({
    top: {
        lengthScale: 1.042,
        widthScale: 0.994,
        alpha: 0.45,
        offsetXCells: 0.097,
        offsetYCells: 1.251,
        rotationDegrees: -14,
        segmentLengthMultipliers: [1, 1, 1, 1],
    },
    contactAlpha: 0.15,
    contactShadowVisible: true,
});

const GARGANTUAN_SHADOW_TUNING = normalizeBattlefieldShadowTuning({
    top: {
        lengthScale: 0.776,
        widthScale: 0.939,
        alpha: 0.45,
        offsetXCells: 0.038,
        offsetYCells: 0.478,
        rotationDegrees: -14,
        segmentLengthMultipliers: [1, 1, 1, 1],
    },
    contactAlpha: 0.15,
    contactShadowVisible: true,
});

const ABOMINATION_SHADOW_TUNING = normalizeBattlefieldShadowTuning({
    top: {
        lengthScale: 0.825,
        widthScale: 0.915,
        alpha: 0.45,
        offsetXCells: -0.008,
        offsetYCells: 0.608,
        rotationDegrees: -14,
        segmentLengthMultipliers: [1, 1, 1, 1],
    },
    contactAlpha: 0.15,
    contactShadowVisible: true,
});

const MAGIC_DRAGON_SHADOW_TUNING = normalizeBattlefieldShadowTuning({
    top: {
        lengthScale: 0.868,
        widthScale: 0.94,
        alpha: 0.45,
        offsetXCells: 0.12,
        offsetYCells: 0.42,
        rotationDegrees: -14,
        segmentLengthMultipliers: [1, 1, 1, 1],
    },
    contactAlpha: 0.15,
    contactShadowVisible: true,
});

const WOLF_RIDER_SHADOW_TUNING = normalizeBattlefieldShadowTuning({
    bottomAlphaOverride: 0.45,
    top: {
        lengthScale: 0.678,
        widthScale: 1.07,
        alpha: 0.45,
        offsetXCells: 0.01,
        offsetYCells: 0.08,
        rotationDegrees: -14,
        segmentLengthMultipliers: [1, 1, 1, 1],
    },
    contactAlpha: 0.15,
    contactShadowVisible: true,
});

export const BATTLEFIELD_SHADOW_TUNING_BY_CREATURE: Readonly<Record<string, BattlefieldShadowTuning>> = Object.freeze(
    Object.fromEntries([
        ...LEVEL_ONE_CREATURE_NAMES.map((name) => [name, DEFAULT_BATTLEFIELD_SHADOW_TUNING] as const),
        ["Wolf Rider", WOLF_RIDER_SHADOW_TUNING],
        ["Black Dragon", BLACK_DRAGON_SHADOW_TUNING],
        ["Frenzied Boar", FRENZIED_BOAR_SHADOW_TUNING],
        ["Cyclops", CYCLOPS_SHADOW_TUNING],
        ["Arachna Queen", ARACHNA_SHADOW_TUNING],
        ["Mantis", MANTIS_SHADOW_TUNING],
        ["Hydra", HYDRA_SHADOW_TUNING],
        ["Behemoth", BEHEMOTH_SHADOW_TUNING],
        ["Gargantuan", GARGANTUAN_SHADOW_TUNING],
        ["Abomination", ABOMINATION_SHADOW_TUNING],
        ["Magic Dragon", MAGIC_DRAGON_SHADOW_TUNING],
    ]),
);

const approvedBattlefieldShadowTuning = (unitName?: string): BattlefieldShadowTuning =>
    (unitName ? BATTLEFIELD_SHADOW_TUNING_BY_CREATURE[unitName] : undefined) ?? DEFAULT_BATTLEFIELD_SHADOW_TUNING;

let battlefieldShadowEditorActive = false;
const battlefieldShadowVisualBounds = new Map<string, BattlefieldShadowVisualBounds>();

export const setBattlefieldShadowEditorActive = (active: boolean): void => {
    battlefieldShadowEditorActive = active;
    if (!active) battlefieldShadowVisualBounds.clear();
};

export const isBattlefieldShadowEditorActive = (): boolean => battlefieldShadowEditorActive;

export const publishBattlefieldShadowVisualBounds = (
    unitName: string,
    bounds: Omit<BattlefieldShadowVisualBounds, "updatedAt">,
): void => {
    if (!battlefieldShadowEditorActive) return;
    battlefieldShadowVisualBounds.set(unitName, { ...bounds, updatedAt: performance.now() });
};

export const readBattlefieldShadowVisualBounds = (unitName: string): BattlefieldShadowVisualBounds | undefined =>
    battlefieldShadowVisualBounds.get(unitName);

let storedCache: Record<string, BattlefieldShadowTuning> | undefined;

const readStoredMap = (): Record<string, BattlefieldShadowTuning> => {
    if (storedCache) return storedCache;
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
        storedCache = {};
        return storedCache;
    }
    try {
        const raw = window.localStorage.getItem(BATTLEFIELD_SHADOW_TUNING_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        // Migrate the first global editor draft without losing the owner's top-row work.
        if (parsed && typeof parsed === "object" && "top" in parsed) {
            storedCache = { "*": normalizeBattlefieldShadowTuning(parsed) };
        } else {
            storedCache = Object.fromEntries(
                Object.entries(parsed as Record<string, Partial<BattlefieldShadowTuning>>).map(([name, value]) => [
                    name,
                    normalizeBattlefieldShadowTuning(value),
                ]),
            );
        }
    } catch {
        storedCache = {};
    }
    return storedCache;
};

export const readStoredBattlefieldShadowTuning = (unitName?: string): BattlefieldShadowTuning => {
    const values = readStoredMap();
    const stored = unitName ? values[unitName] : values["*"];
    return normalizeBattlefieldShadowTuning(stored ?? approvedBattlefieldShadowTuning(unitName));
};

export const writeStoredBattlefieldShadowTuning = (unitName: string, value: BattlefieldShadowTuning): void => {
    const values = { ...readStoredMap(), [unitName]: normalizeBattlefieldShadowTuning(value) };
    delete values["*"];
    storedCache = values;
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.setItem(BATTLEFIELD_SHADOW_TUNING_STORAGE_KEY, JSON.stringify(values));
    }
};

export const resetStoredBattlefieldShadowTuning = (unitName: string): void => {
    const values = { ...readStoredMap() };
    delete values[unitName];
    storedCache = values;
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.setItem(BATTLEFIELD_SHADOW_TUNING_STORAGE_KEY, JSON.stringify(values));
    }
};

/** Runtime hook: editor drafts are live only in local development builds. */
export const resolveBattlefieldShadowTuning = (unitName?: string): BattlefieldShadowTuning => {
    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return approvedBattlefieldShadowTuning(unitName);
    }
    const values = readStoredMap();
    return (unitName ? values[unitName] : values["*"]) ?? approvedBattlefieldShadowTuning(unitName);
};
