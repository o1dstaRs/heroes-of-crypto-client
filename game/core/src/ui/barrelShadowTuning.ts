export interface BarrelShadowTuning {
    offsetXCells: number;
    offsetYCells: number;
    widthScale: number;
    lengthCells: number;
    alpha: number;
    rotationDegrees: number;
}

export const BARREL_SHADOW_TUNING_CHANGE_EVENT = "hoc:barrel-shadow-tuning-change";
export const BARREL_SHADOW_TUNING_STORAGE_KEY = "hoc-dev-barrel-shadow-tuning-v1";

export const DEFAULT_BARREL_SHADOW_TUNING: Readonly<BarrelShadowTuning> = Object.freeze({
    offsetXCells: 0.03,
    offsetYCells: 0.4,
    widthScale: 1,
    lengthCells: 0.86,
    alpha: 0.45,
    rotationDegrees: -2,
});

export const BARREL_SHADOW_EDITOR_LAYOUT = Object.freeze(
    Array.from({ length: 9 }, (_, variant) => Object.freeze({ x: variant + 3, y: 15, variant })),
);

const finite = (value: unknown, fallback: number, min: number, max: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

export const normalizeBarrelShadowTuning = (value?: Partial<BarrelShadowTuning>): BarrelShadowTuning => ({
    offsetXCells: finite(value?.offsetXCells, DEFAULT_BARREL_SHADOW_TUNING.offsetXCells, -2, 2),
    offsetYCells: finite(value?.offsetYCells, DEFAULT_BARREL_SHADOW_TUNING.offsetYCells, -2, 2),
    widthScale: finite(value?.widthScale, DEFAULT_BARREL_SHADOW_TUNING.widthScale, 0.1, 3),
    lengthCells: finite(value?.lengthCells, DEFAULT_BARREL_SHADOW_TUNING.lengthCells, 0.05, 2.5),
    alpha: finite(value?.alpha, DEFAULT_BARREL_SHADOW_TUNING.alpha, 0, 1),
    rotationDegrees: finite(value?.rotationDegrees, DEFAULT_BARREL_SHADOW_TUNING.rotationDegrees, -60, 60),
});

export const readStoredBarrelShadowTuning = (): BarrelShadowTuning => {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
        return normalizeBarrelShadowTuning();
    }
    try {
        return normalizeBarrelShadowTuning(
            JSON.parse(window.localStorage.getItem(BARREL_SHADOW_TUNING_STORAGE_KEY) ?? "{}"),
        );
    } catch {
        return normalizeBarrelShadowTuning();
    }
};

export const writeStoredBarrelShadowTuning = (value: BarrelShadowTuning): void => {
    const normalized = normalizeBarrelShadowTuning(value);
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.setItem(BARREL_SHADOW_TUNING_STORAGE_KEY, JSON.stringify(normalized));
        window.dispatchEvent(new CustomEvent(BARREL_SHADOW_TUNING_CHANGE_EVENT, { detail: normalized }));
    }
};

export const resetStoredBarrelShadowTuning = (): BarrelShadowTuning => {
    const tuning = normalizeBarrelShadowTuning();
    writeStoredBarrelShadowTuning(tuning);
    return tuning;
};

let barrelShadowEditorActive = false;

export const setBarrelShadowEditorActive = (active: boolean): void => {
    barrelShadowEditorActive = active;
};

export const isBarrelShadowEditorActive = (): boolean => barrelShadowEditorActive;
