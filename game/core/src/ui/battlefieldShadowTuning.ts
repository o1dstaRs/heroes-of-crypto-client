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
const AUTOMATIC_BOTTOM_LENGTH_RATIO = 0.85;
const AUTOMATIC_BOTTOM_WIDTH_RATIO = 0.78 / 0.86;
const AUTOMATIC_BOTTOM_ALPHA_RATIO = 0.31 / 0.42;
const roundTuningValue = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

export const DEFAULT_BATTLEFIELD_SHADOW_TUNING: BattlefieldShadowTuning = Object.freeze({
    bottom: Object.freeze({
        lengthScale: 0.5763,
        widthScale: 0.80086,
        alpha: 0.332143,
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
    widthScale: roundTuningValue(top.widthScale * AUTOMATIC_BOTTOM_WIDTH_RATIO),
    alpha: roundTuningValue(top.alpha * AUTOMATIC_BOTTOM_ALPHA_RATIO),
    segmentLengthMultipliers: [...top.segmentLengthMultipliers],
});

export const normalizeBattlefieldShadowTuning = (
    value?: Partial<BattlefieldShadowTuning> & {
        bottom?: Partial<BattlefieldShadowRowTuning>;
        top?: Partial<BattlefieldShadowRowTuning>;
    },
): BattlefieldShadowTuning => {
    const top = normalizeRow(value?.top, DEFAULT_BATTLEFIELD_SHADOW_TUNING.top);
    return {
        bottom: automaticBottomRow(top),
        top,
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

export const BATTLEFIELD_SHADOW_TUNING_BY_CREATURE: Readonly<Record<string, BattlefieldShadowTuning>> = Object.freeze(
    Object.fromEntries([
        ...LEVEL_ONE_CREATURE_NAMES.map((name) => [name, DEFAULT_BATTLEFIELD_SHADOW_TUNING] as const),
        ["Black Dragon", BLACK_DRAGON_SHADOW_TUNING],
        ["Frenzied Boar", FRENZIED_BOAR_SHADOW_TUNING],
    ]),
);

const approvedBattlefieldShadowTuning = (unitName?: string): BattlefieldShadowTuning =>
    normalizeBattlefieldShadowTuning(
        unitName ? BATTLEFIELD_SHADOW_TUNING_BY_CREATURE[unitName] : DEFAULT_BATTLEFIELD_SHADOW_TUNING,
    );

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
    return stored ? normalizeBattlefieldShadowTuning(stored) : approvedBattlefieldShadowTuning(unitName);
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
    return readStoredBattlefieldShadowTuning(unitName);
};
