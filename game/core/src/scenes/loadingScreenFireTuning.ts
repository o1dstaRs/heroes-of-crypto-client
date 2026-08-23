export const LOADING_SCREEN_FIRE_TUNING_STORAGE_KEY = "hoc-dev-loading-screen-fire-tuning-v8";
const LEGACY_V7_STORAGE_KEY = "hoc-dev-loading-screen-fire-tuning-v7";
const LEGACY_V6_STORAGE_KEY = "hoc-dev-loading-screen-fire-tuning-v6";
const LEGACY_V5_STORAGE_KEY = "hoc-dev-loading-screen-fire-tuning-v5";
export const LOADING_SCREEN_FIRE_TUNING_EVENT = "hoc-loading-screen-fire-tuning-changed";

export const LOADING_SCREEN_FIRE_TYPES = ["furnace", "brazier"] as const;
export type LoadingScreenFireType = (typeof LOADING_SCREEN_FIRE_TYPES)[number];

export const LOADING_SCREEN_FIRE_BLEND_MODES = ["normal", "add", "screen"] as const;
export type LoadingScreenFireBlendMode = (typeof LOADING_SCREEN_FIRE_BLEND_MODES)[number];

export interface LoadingScreenFireZoneTuning {
    enabled: boolean;
    fireType: LoadingScreenFireType;
    offsetX: number;
    offsetY: number;
    width: number;
    /** Actual rendered sprite height. The bottom anchor remains fixed while this value changes. */
    height: number;
    overflowBottom: number;
    alpha: number;
    fps: number;
    tiles: number;
    frameOffset: number;
    phaseStep: number;
    overlap: number;
    alternateMirror: boolean;
    blendMode: LoadingScreenFireBlendMode;
    tint: number;
}

export interface LoadingScreenFireTuning {
    baseLavaAlpha: number;
    progressGlowAlpha: number;
    medallionVisible: boolean;
    medallionSize: number;
    medallionStartOffsetX: number;
    medallionStartOffsetY: number;
    medallionEndOffsetX: number;
    medallionEndOffsetY: number;
    sectionCount: number;
    sectionAlpha: number;
    overall: LoadingScreenFireZoneTuning;
    secondary: LoadingScreenFireZoneTuning;
}

export const DEFAULT_LOADING_SCREEN_FIRE_TUNING: LoadingScreenFireTuning = {
    baseLavaAlpha: 0,
    progressGlowAlpha: 0.14,
    medallionVisible: true,
    medallionSize: 82,
    medallionStartOffsetX: -6.5,
    medallionStartOffsetY: 5.5,
    medallionEndOffsetX: 6,
    medallionEndOffsetY: 4.5,
    sectionCount: 1,
    sectionAlpha: 0,
    overall: {
        enabled: true,
        fireType: "furnace",
        offsetX: -8,
        offsetY: 2.5,
        width: 340,
        height: 121.4,
        overflowBottom: 0.5,
        alpha: 1.5,
        fps: 13.5,
        tiles: 1,
        frameOffset: 0,
        phaseStep: 10,
        overlap: 1.12,
        alternateMirror: true,
        blendMode: "screen",
        tint: 0xffffff,
    },
    secondary: {
        enabled: true,
        fireType: "brazier",
        offsetX: 258.5,
        offsetY: 2.5,
        width: 54,
        height: 92.4,
        overflowBottom: 1.5,
        alpha: 1.5,
        fps: 12,
        tiles: 1,
        frameOffset: 4,
        phaseStep: 10,
        overlap: 0.99,
        alternateMirror: true,
        blendMode: "add",
        tint: 0xffffff,
    },
};

interface LegacyFireZoneTuning extends Partial<LoadingScreenFireZoneTuning> {
    overflowTop?: number;
}

interface LoadingScreenFireTuningInput extends Partial<Omit<LoadingScreenFireTuning, "overall" | "secondary">> {
    overall?: LegacyFireZoneTuning;
    secondary?: LegacyFireZoneTuning;
    center?: LegacyFireZoneTuning;
    left?: LegacyFireZoneTuning;
    right?: LegacyFireZoneTuning;
    lower?: LegacyFireZoneTuning;
}

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
};

const booleanValue = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);

const fireTypeValue = (value: unknown, fallback: LoadingScreenFireType): LoadingScreenFireType =>
    value === "furnace" || value === "brazier" ? value : fallback;

const blendModeValue = (value: unknown, fallback: LoadingScreenFireBlendMode): LoadingScreenFireBlendMode =>
    value === "normal" || value === "add" || value === "screen" ? value : fallback;

const normalizeZone = (
    value: Partial<LoadingScreenFireZoneTuning> | undefined,
    fallback: LoadingScreenFireZoneTuning,
    offsetXMin = -160,
    offsetXMax = 160,
): LoadingScreenFireZoneTuning => ({
    enabled: booleanValue(value?.enabled, fallback.enabled),
    fireType: fireTypeValue(value?.fireType, fallback.fireType),
    offsetX: clamp(value?.offsetX, fallback.offsetX, offsetXMin, offsetXMax),
    offsetY: clamp(value?.offsetY, fallback.offsetY, -160, 160),
    width: clamp(value?.width, fallback.width, 1, 900),
    height: clamp(value?.height, fallback.height, 1, 400),
    overflowBottom: clamp(value?.overflowBottom, fallback.overflowBottom, 0, 140),
    alpha: clamp(value?.alpha, fallback.alpha, 0, 1.5),
    fps: clamp(value?.fps, fallback.fps, 0.25, 60),
    tiles: Math.round(clamp(value?.tiles, fallback.tiles, 1, 32)),
    frameOffset: Math.round(clamp(value?.frameOffset, fallback.frameOffset, 0, 63)),
    phaseStep: Math.round(clamp(value?.phaseStep, fallback.phaseStep, 0, 63)),
    overlap: clamp(value?.overlap, fallback.overlap, 0.5, 2.5),
    alternateMirror: booleanValue(value?.alternateMirror, fallback.alternateMirror),
    blendMode: blendModeValue(value?.blendMode, fallback.blendMode),
    tint: Math.round(clamp(value?.tint, fallback.tint, 0, 0xffffff)),
});

const migrateOldCombinedZone = (legacy: LegacyFireZoneTuning): Partial<LoadingScreenFireZoneTuning> => {
    const fireType = fireTypeValue(legacy.fireType, DEFAULT_LOADING_SCREEN_FIRE_TUNING.overall.fireType);
    const oldHeight = clamp(legacy.height, 48, 4, 160);
    const oldTop = clamp(legacy.overflowTop, 42, 0, 100);
    const oldBottom = clamp(legacy.overflowBottom, 34, 0, 100);
    const multiplier = fireType === "furnace" ? 2.15 : 1.18;
    return {
        ...legacy,
        fireType,
        offsetX: 0,
        offsetY: 0,
        width: 652,
        height: Math.round((oldHeight + oldTop + oldBottom) * multiplier * 10) / 10,
        overflowBottom: 0,
    };
};

const unifiedZoneSource = (value: LoadingScreenFireTuningInput | undefined): Partial<LoadingScreenFireZoneTuning> => {
    if (value?.overall) {
        return "overflowTop" in value.overall ? migrateOldCombinedZone(value.overall) : value.overall;
    }
    if (value?.center) {
        // V6 stored three zones. Preserve the selected animation but reset geometry to the exact
        // continuous circle-plus-strip contour requested for the unified version.
        return {
            ...value.center,
            offsetX: 0,
            offsetY: 0,
            width: 652,
            overflowBottom: 0,
        };
    }
    return DEFAULT_LOADING_SCREEN_FIRE_TUNING.overall;
};

export const normalizeLoadingScreenFireTuning = (
    value: LoadingScreenFireTuningInput | undefined,
): LoadingScreenFireTuning => ({
    baseLavaAlpha: clamp(value?.baseLavaAlpha, DEFAULT_LOADING_SCREEN_FIRE_TUNING.baseLavaAlpha, 0, 1.5),
    progressGlowAlpha: clamp(value?.progressGlowAlpha, DEFAULT_LOADING_SCREEN_FIRE_TUNING.progressGlowAlpha, 0, 1),
    medallionVisible: booleanValue(value?.medallionVisible, DEFAULT_LOADING_SCREEN_FIRE_TUNING.medallionVisible),
    medallionSize: clamp(value?.medallionSize, DEFAULT_LOADING_SCREEN_FIRE_TUNING.medallionSize, 20, 200),
    medallionStartOffsetX: clamp(
        value?.medallionStartOffsetX,
        DEFAULT_LOADING_SCREEN_FIRE_TUNING.medallionStartOffsetX,
        -1600,
        250,
    ),
    medallionStartOffsetY: clamp(
        value?.medallionStartOffsetY,
        DEFAULT_LOADING_SCREEN_FIRE_TUNING.medallionStartOffsetY,
        -250,
        250,
    ),
    medallionEndOffsetX: clamp(
        value?.medallionEndOffsetX,
        DEFAULT_LOADING_SCREEN_FIRE_TUNING.medallionEndOffsetX,
        -250,
        250,
    ),
    medallionEndOffsetY: clamp(
        value?.medallionEndOffsetY,
        DEFAULT_LOADING_SCREEN_FIRE_TUNING.medallionEndOffsetY,
        -250,
        250,
    ),
    sectionCount: Math.round(clamp(value?.sectionCount, DEFAULT_LOADING_SCREEN_FIRE_TUNING.sectionCount, 1, 12)),
    sectionAlpha: clamp(value?.sectionAlpha, DEFAULT_LOADING_SCREEN_FIRE_TUNING.sectionAlpha, 0, 1),
    overall: normalizeZone(unifiedZoneSource(value), DEFAULT_LOADING_SCREEN_FIRE_TUNING.overall),
    secondary: normalizeZone(value?.secondary, DEFAULT_LOADING_SCREEN_FIRE_TUNING.secondary, -160, 1600),
});

export const readStoredLoadingScreenFireTuning = (): LoadingScreenFireTuning => {
    if (typeof window === "undefined") return normalizeLoadingScreenFireTuning(undefined);
    try {
        const raw =
            window.localStorage.getItem(LOADING_SCREEN_FIRE_TUNING_STORAGE_KEY) ??
            window.localStorage.getItem(LEGACY_V7_STORAGE_KEY) ??
            window.localStorage.getItem(LEGACY_V6_STORAGE_KEY) ??
            window.localStorage.getItem(LEGACY_V5_STORAGE_KEY);
        const tuning = normalizeLoadingScreenFireTuning(
            raw ? (JSON.parse(raw) as LoadingScreenFireTuningInput) : undefined,
        );
        if (raw) window.localStorage.setItem(LOADING_SCREEN_FIRE_TUNING_STORAGE_KEY, JSON.stringify(tuning));
        return tuning;
    } catch {
        return normalizeLoadingScreenFireTuning(undefined);
    }
};

const emitTuningChanged = (tuning: LoadingScreenFireTuning): void => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent<LoadingScreenFireTuning>(LOADING_SCREEN_FIRE_TUNING_EVENT, { detail: tuning }),
    );
};

export const writeStoredLoadingScreenFireTuning = (value: LoadingScreenFireTuningInput): LoadingScreenFireTuning => {
    const tuning = normalizeLoadingScreenFireTuning(value);
    if (typeof window !== "undefined") {
        window.localStorage.setItem(LOADING_SCREEN_FIRE_TUNING_STORAGE_KEY, JSON.stringify(tuning));
    }
    emitTuningChanged(tuning);
    return tuning;
};

export const resetStoredLoadingScreenFireTuning = (): LoadingScreenFireTuning => {
    if (typeof window !== "undefined") {
        window.localStorage.removeItem(LOADING_SCREEN_FIRE_TUNING_STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_V7_STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_V6_STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_V5_STORAGE_KEY);
    }
    const tuning = normalizeLoadingScreenFireTuning(undefined);
    emitTuningChanged(tuning);
    return tuning;
};
