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
    artScale: 1,
    artOffsetX: 0,
    artOffsetY: 0,
    containerWidth: 99,
    containerOffsetX: 1,
});

export const LEFT_SIDEBAR_ART_SCALE_MIN = 0.5;
export const LEFT_SIDEBAR_ART_SCALE_MAX = 3;
export const LEFT_SIDEBAR_ART_OFFSET_MIN = -100;
export const LEFT_SIDEBAR_ART_OFFSET_MAX = 100;
export const LEFT_SIDEBAR_CONTAINER_WIDTH_MIN = 60;
export const LEFT_SIDEBAR_CONTAINER_WIDTH_MAX = 120;
export const LEFT_SIDEBAR_CONTAINER_OFFSET_MIN = -30;
export const LEFT_SIDEBAR_CONTAINER_OFFSET_MAX = 30;

/** Active production set: the user-approved left-screen portrait recovery point X. */
export const LEFT_SIDEBAR_PORTRAIT_TUNING: Readonly<Partial<Record<number, LeftSidebarPortraitTuning>>> = Object.freeze(
    {},
);

// The prepared left-screen WebPs use their own neutral editor namespace. Legacy tuning remains in its
// previous localStorage keys but must not be inherited by this surface-specific asset set.
export const LEFT_SIDEBAR_PORTRAIT_TUNING_STORAGE_KEY = "hoc-dev-left-screen-portrait-tuning-v1";
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

    const raw = window.localStorage.getItem(LEFT_SIDEBAR_PORTRAIT_TUNING_STORAGE_KEY);
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
