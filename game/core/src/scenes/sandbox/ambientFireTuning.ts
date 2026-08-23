import sideBrazierTuning from "../../assets/tuning/ambient-fire-side-braziers.json";

export interface AmbientFireTuning {
    sourceX: number;
    sourceY: number;
    sourceWidth: number;
    sourceHeight: number;
    alpha: number;
    glowAlpha: number;
    contactGlowStrength: number;
}

export interface AmbientFireDefinition extends AmbientFireTuning {
    key: string;
    label: string;
    textureKey?: string;
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    columns: number;
    fps: number;
    phaseSeconds: number;
    motionAmount: number;
}

export const AMBIENT_FIRE_TUNING_STORAGE_KEY = "hoc-dev-ambient-fire-tuning-v1";
const SIDE_FIRE_TUNING_REVISION_STORAGE_KEY = "hoc-dev-ambient-fire-side-tuning-revision";
const SIDE_FIRE_TUNING_REVISION = "user-json-2026-08-19-v1";
const SIDE_FIRE_KEYS = new Set(Object.keys(sideBrazierTuning));

export const AMBIENT_FIRE_DEFINITIONS: readonly AmbientFireDefinition[] = [
    {
        key: "ambient_fire_left_brazier_atlas",
        label: "Левая чаша",
        textureKey: "ambient_fire_video_torch_left_natural_v4_64_atlas",
        frameWidth: 256,
        frameHeight: 256,
        frameCount: 64,
        columns: 8,
        fps: 16,
        phaseSeconds: 0.11,
        ...sideBrazierTuning.ambient_fire_left_brazier_atlas,
        motionAmount: 0,
    },
    {
        key: "ambient_fire_right_brazier_atlas",
        label: "Правая чаша",
        textureKey: "ambient_fire_video_torch_right_natural_v4_64_atlas",
        frameWidth: 256,
        frameHeight: 256,
        frameCount: 64,
        columns: 8,
        fps: 16,
        phaseSeconds: 0.47,
        ...sideBrazierTuning.ambient_fire_right_brazier_atlas,
        motionAmount: 0,
    },
    {
        key: "ambient_fire_left_furnace_atlas",
        label: "Левая печь",
        frameWidth: 256,
        frameHeight: 128,
        frameCount: 12,
        columns: 4,
        fps: 12,
        phaseSeconds: 0.29,
        sourceX: 371.4,
        sourceY: 307.2,
        sourceWidth: 122.7,
        sourceHeight: 62,
        alpha: 1,
        glowAlpha: 0.56,
        contactGlowStrength: 3,
        motionAmount: 0,
    },
    {
        key: "ambient_fire_center_furnace",
        label: "Центральная печь",
        textureKey: "ambient_fire_left_furnace_atlas",
        frameWidth: 256,
        frameHeight: 128,
        frameCount: 12,
        columns: 4,
        fps: 11,
        phaseSeconds: 0.63,
        sourceX: 762.5,
        sourceY: 304.7,
        sourceWidth: 150.5,
        sourceHeight: 62,
        alpha: 1.28,
        glowAlpha: 0.82,
        contactGlowStrength: 3,
        motionAmount: 0,
    },
    {
        key: "ambient_fire_right_furnace",
        label: "Правая печь",
        textureKey: "ambient_fire_left_furnace_atlas",
        frameWidth: 256,
        frameHeight: 128,
        frameCount: 12,
        columns: 4,
        fps: 13,
        phaseSeconds: 0.87,
        sourceX: 1157.4,
        sourceY: 301.5,
        sourceWidth: 123.2,
        sourceHeight: 62,
        alpha: 0.96,
        glowAlpha: 0.6,
        contactGlowStrength: 3,
        motionAmount: 0,
    },
] as const;

/** The two edge braziers have a dedicated editor so their tuning cannot accidentally reset furnace values. */
export const SIDE_FIRE_DEFINITIONS = AMBIENT_FIRE_DEFINITIONS.slice(0, 2);

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
};

export const baseAmbientFireTuning = (definition: AmbientFireDefinition): AmbientFireTuning => ({
    sourceX: definition.sourceX,
    sourceY: definition.sourceY,
    sourceWidth: definition.sourceWidth,
    sourceHeight: definition.sourceHeight,
    alpha: definition.alpha,
    glowAlpha: definition.glowAlpha,
    contactGlowStrength: definition.contactGlowStrength,
});

export const normalizeAmbientFireTuning = (
    value: Partial<AmbientFireTuning> | undefined,
    fallback: AmbientFireTuning,
): AmbientFireTuning => ({
    sourceX: clamp(value?.sourceX, fallback.sourceX, -200, 1776),
    sourceY: clamp(value?.sourceY, fallback.sourceY, -200, 1578),
    sourceWidth: clamp(value?.sourceWidth, fallback.sourceWidth, 1, 800),
    sourceHeight: clamp(value?.sourceHeight, fallback.sourceHeight, 1, 500),
    alpha: clamp(value?.alpha, fallback.alpha, 0, 1.5),
    glowAlpha: clamp(value?.glowAlpha, fallback.glowAlpha, 0, 1.5),
    contactGlowStrength: clamp(value?.contactGlowStrength, fallback.contactGlowStrength, 0, 3),
});

const definitionByKey = new Map(AMBIENT_FIRE_DEFINITIONS.map((definition) => [definition.key, definition]));
let storedCache: Record<string, AmbientFireTuning> | undefined;
let selectedEditorFireKey: string | undefined;

export const readStoredAmbientFireTuning = (): Record<string, AmbientFireTuning> => {
    if (storedCache) return { ...storedCache };
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
        storedCache = {};
        return {};
    }
    try {
        const raw = window.localStorage.getItem(AMBIENT_FIRE_TUNING_STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Record<string, Partial<AmbientFireTuning>>) : {};
        // The two side braziers were approved as a copied JSON preset. Older per-origin editor values can
        // silently override that preset after a reload and make both flames appear shifted again. Migrate
        // only those two entries once; furnace tuning values remain untouched.
        const shouldRestoreApprovedSideFire =
            window.localStorage.getItem(SIDE_FIRE_TUNING_REVISION_STORAGE_KEY) !== SIDE_FIRE_TUNING_REVISION;
        storedCache = Object.fromEntries(
            Object.entries(parsed).flatMap(([key, tuning]) => {
                const definition = definitionByKey.get(key);
                if (shouldRestoreApprovedSideFire && SIDE_FIRE_KEYS.has(key)) return [];
                return definition
                    ? [[key, normalizeAmbientFireTuning(tuning, baseAmbientFireTuning(definition))] as const]
                    : [];
            }),
        );
        if (shouldRestoreApprovedSideFire) {
            window.localStorage.setItem(AMBIENT_FIRE_TUNING_STORAGE_KEY, JSON.stringify(storedCache));
            window.localStorage.setItem(SIDE_FIRE_TUNING_REVISION_STORAGE_KEY, SIDE_FIRE_TUNING_REVISION);
        }
    } catch {
        storedCache = {};
    }
    return { ...storedCache };
};

export const writeStoredAmbientFireTuning = (tuning: Record<string, AmbientFireTuning>): void => {
    storedCache = Object.fromEntries(
        Object.entries(tuning).flatMap(([key, value]) => {
            const definition = definitionByKey.get(key);
            return definition
                ? [[key, normalizeAmbientFireTuning(value, baseAmbientFireTuning(definition))] as const]
                : [];
        }),
    );
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.setItem(AMBIENT_FIRE_TUNING_STORAGE_KEY, JSON.stringify(storedCache));
    }
};

export const resolveAmbientFireTuning = (definition: AmbientFireDefinition): AmbientFireTuning => {
    const baseline = baseAmbientFireTuning(definition);
    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") return baseline;
    if (!storedCache) readStoredAmbientFireTuning();
    return storedCache?.[definition.key] ?? baseline;
};

export const setAmbientFireEditorSelection = (key: string | undefined): void => {
    selectedEditorFireKey = key && definitionByKey.has(key) ? key : undefined;
};

export const getAmbientFireEditorSelection = (): string | undefined => selectedEditorFireKey;
