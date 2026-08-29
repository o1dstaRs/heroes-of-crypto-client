export type PickLanternFireSource = "natural-atlas" | "candle-video";
export type PickLanternFireSlot = 0 | 1;

export interface PickLanternFireTuning {
    enabled: boolean;
    source: PickLanternFireSource;
    anchorX: number;
    anchorY: number;
    width: number;
    height: number;
    opacity: number;
    fps: number;
    playbackRate: number;
    brightness: number;
    contrast: number;
    saturation: number;
    hue: number;
    blackCutoff: number;
    density: number;
    glowOpacity: number;
    glowSize: number;
    maskInset: number;
}

export interface PickLanternFireChangeDetail {
    slot: PickLanternFireSlot;
    tuning: PickLanternFireTuning;
}

export const PICK_LANTERN_FIRE_STORAGE_KEY = "hoc-dev-pick-lantern-fires-v2";
export const PICK_LANTERN_FIRE_CHANGE_EVENT = "hoc:pick-lantern-fire-change";
const PICK_LANTERN_FIRE_PRESET_REVISION_KEY = "hoc-dev-pick-lantern-fires-revision";
const PICK_LANTERN_FIRE_PRESET_REVISION = "approved-two-fire-2026-08-24-v2";

export const DEFAULT_PICK_LANTERN_FIRE_TUNING: Readonly<PickLanternFireTuning> = {
    enabled: true,
    source: "natural-atlas",
    anchorX: 29.74,
    anchorY: 16.61,
    width: 2.4,
    height: 6.1,
    opacity: 1.08,
    fps: 16,
    playbackRate: 0.78,
    brightness: 1.65,
    contrast: 0.84,
    saturation: 0.84,
    hue: 15,
    blackCutoff: 0.17,
    density: 0.7,
    glowOpacity: 0.62,
    glowSize: 2.09,
    maskInset: 0,
};

export const DEFAULT_SECOND_PICK_LANTERN_FIRE_TUNING: Readonly<PickLanternFireTuning> = {
    enabled: true,
    source: "natural-atlas",
    anchorX: 29.67,
    anchorY: 16.76,
    width: 1.55,
    height: 4.9,
    opacity: 1.08,
    fps: 16,
    playbackRate: 0.78,
    brightness: 1.34,
    contrast: 0.84,
    saturation: 0.84,
    hue: 15,
    blackCutoff: 0.17,
    density: 0.8,
    glowOpacity: 0.78,
    glowSize: 2.09,
    maskInset: 0,
};

export const DEFAULT_PICK_LANTERN_FIRE_TUNINGS = [
    DEFAULT_PICK_LANTERN_FIRE_TUNING,
    DEFAULT_SECOND_PICK_LANTERN_FIRE_TUNING,
] as const;

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
};

export const normalizePickLanternFireTuning = (
    value: Partial<PickLanternFireTuning> | undefined,
    fallback: Readonly<PickLanternFireTuning> = DEFAULT_PICK_LANTERN_FIRE_TUNING,
): PickLanternFireTuning => ({
    enabled: typeof value?.enabled === "boolean" ? value.enabled : fallback.enabled,
    source: value?.source === "candle-video" || value?.source === "natural-atlas" ? value.source : fallback.source,
    anchorX: clamp(value?.anchorX, fallback.anchorX, 0, 100),
    anchorY: clamp(value?.anchorY, fallback.anchorY, 0, 100),
    width: clamp(value?.width, fallback.width, 0.2, 30),
    height: clamp(value?.height, fallback.height, 0.2, 50),
    opacity: clamp(value?.opacity, fallback.opacity, 0, 1.5),
    fps: clamp(value?.fps, fallback.fps, 1, 30),
    playbackRate: clamp(value?.playbackRate, fallback.playbackRate, 0.1, 2.5),
    brightness: clamp(value?.brightness, fallback.brightness, 0.2, 3),
    contrast: clamp(value?.contrast, fallback.contrast, 0.2, 3),
    saturation: clamp(value?.saturation, fallback.saturation, 0, 3),
    hue: clamp(value?.hue, fallback.hue, -90, 90),
    blackCutoff: clamp(value?.blackCutoff, fallback.blackCutoff, 0, 0.75),
    density: clamp(value?.density, fallback.density, 0, 6),
    glowOpacity: clamp(value?.glowOpacity, fallback.glowOpacity, 0, 1.5),
    glowSize: clamp(value?.glowSize, fallback.glowSize, 0.5, 4),
    maskInset: clamp(value?.maskInset, fallback.maskInset, 0, 40),
});

const defaults = (): [PickLanternFireTuning, PickLanternFireTuning] => [
    { ...DEFAULT_PICK_LANTERN_FIRE_TUNING },
    { ...DEFAULT_SECOND_PICK_LANTERN_FIRE_TUNING },
];

export const readPickLanternFireTunings = (): [PickLanternFireTuning, PickLanternFireTuning] => {
    if (typeof window === "undefined" || import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true")
        return defaults();
    try {
        if (window.localStorage.getItem(PICK_LANTERN_FIRE_PRESET_REVISION_KEY) !== PICK_LANTERN_FIRE_PRESET_REVISION) {
            const approved = defaults();
            window.localStorage.setItem(PICK_LANTERN_FIRE_STORAGE_KEY, JSON.stringify(approved));
            window.localStorage.setItem(PICK_LANTERN_FIRE_PRESET_REVISION_KEY, PICK_LANTERN_FIRE_PRESET_REVISION);
            return approved;
        }
        const raw = window.localStorage.getItem(PICK_LANTERN_FIRE_STORAGE_KEY);
        if (!raw) return defaults();
        const parsed = JSON.parse(raw) as Array<Partial<PickLanternFireTuning>>;
        return [
            normalizePickLanternFireTuning(parsed[0], DEFAULT_PICK_LANTERN_FIRE_TUNING),
            normalizePickLanternFireTuning(parsed[1], DEFAULT_SECOND_PICK_LANTERN_FIRE_TUNING),
        ];
    } catch {
        return defaults();
    }
};

export const readPickLanternFireTuning = (slot: PickLanternFireSlot = 0): PickLanternFireTuning =>
    readPickLanternFireTunings()[slot];

export const pickLanternFireBounds = (tuning: PickLanternFireTuning) => ({
    left: tuning.anchorX - tuning.width / 2,
    right: tuning.anchorX + tuning.width / 2,
    top: tuning.anchorY - tuning.height,
    bottom: tuning.anchorY,
});
