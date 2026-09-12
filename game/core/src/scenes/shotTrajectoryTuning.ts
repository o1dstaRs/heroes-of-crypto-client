export interface ShotTrajectoryTransformTuning {
    /** World pixels along the authoritative shot ray. */
    offsetAlong: number;
    /** World pixels perpendicular to the authoritative shot ray. */
    offsetPerpendicular: number;
    rotationDegrees: number;
    scale: number;
}

export interface ShotTrajectoryOriginTuning {
    /** Local pixels along the shot ray, relative to the transformed fletching. */
    offsetAlong: number;
    /** Local pixels perpendicular to the shot ray, relative to the transformed fletching. */
    offsetPerpendicular: number;
}

export interface ShotTrajectoryTuning {
    /** Visual transform of the fletching and socket artwork. */
    emergence: ShotTrajectoryTransformTuning;
    /** Independent point from which casing segments begin to emerge. */
    projectileOrigin: ShotTrajectoryOriginTuning;
    /** Welding strip at the fletching socket while a casing begins to emerge. */
    emergenceSparks: ShotTrajectoryTransformTuning;
    contactSparks: ShotTrajectoryTransformTuning;
}

// Bump the key whenever an approved calibration replaces the previous preset. This prevents an older
// editor session from silently overriding the shipped values after deployment.
export const SHOT_TRAJECTORY_TUNING_STORAGE_KEY = "hoc-dev-shot-trajectory-tuning-v3";
export const SHOT_TRAJECTORY_TUNING_CHANGED_EVENT = "hoc-shot-trajectory-tuning-changed";
/** Authoring widths used by the calibration SVG; runtime offsets are scaled from this coordinate space. */
export const SHOT_FLETCHING_AUTHORING_WIDTH = 144;
export const SHOT_ARROWHEAD_AUTHORING_WIDTH = 112;

export const shotTrajectoryAuthoringOffsetToWorld = (
    offset: number,
    runtimeDisplayLength: number,
    authoringDisplayLength: number,
): number => (offset * runtimeDisplayLength) / Math.max(1, authoringDisplayLength);

export interface ShotCasingVisibleSlice {
    sourceStartFraction: number;
    sourceEndFraction: number;
}

/** Crop a moving casing at the emergence/impact boundaries instead of waiting for a whole sprite to fit. */
export const shotCasingVisibleSlice = (
    segmentCenter: number,
    segmentLength: number,
    visibleFrom: number,
    visibleTo: number,
): ShotCasingVisibleSlice | undefined => {
    const segmentStart = segmentCenter - segmentLength / 2;
    const segmentEnd = segmentCenter + segmentLength / 2;
    const visibleStart = Math.max(segmentStart, visibleFrom);
    const visibleEnd = Math.min(segmentEnd, visibleTo);
    if (visibleEnd <= visibleStart) return undefined;
    return {
        sourceStartFraction: Math.max(0, Math.min(1, (visibleStart - segmentStart) / segmentLength)),
        sourceEndFraction: Math.max(0, Math.min(1, (visibleEnd - segmentStart) / segmentLength)),
    };
};

export const DEFAULT_SHOT_TRAJECTORY_TUNING: ShotTrajectoryTuning = Object.freeze({
    emergence: Object.freeze({
        offsetAlong: -11,
        offsetPerpendicular: 0,
        rotationDegrees: 0,
        scale: 1,
    }),
    projectileOrigin: Object.freeze({
        offsetAlong: 65,
        offsetPerpendicular: 0,
    }),
    emergenceSparks: Object.freeze({
        offsetAlong: 4,
        offsetPerpendicular: 0,
        rotationDegrees: 0,
        scale: 0.7,
    }),
    contactSparks: Object.freeze({
        offsetAlong: 5,
        offsetPerpendicular: -2,
        rotationDegrees: 3,
        scale: 0.87,
    }),
});

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
};

const normalizeTransform = (
    value: Partial<ShotTrajectoryTransformTuning> | undefined,
    fallback: ShotTrajectoryTransformTuning,
): ShotTrajectoryTransformTuning => ({
    offsetAlong: clamp(value?.offsetAlong, fallback.offsetAlong, -160, 160),
    offsetPerpendicular: clamp(value?.offsetPerpendicular, fallback.offsetPerpendicular, -160, 160),
    rotationDegrees: clamp(value?.rotationDegrees, fallback.rotationDegrees, -180, 180),
    scale: clamp(value?.scale, fallback.scale, 0.2, 3),
});

const normalizeOrigin = (
    value: Partial<ShotTrajectoryOriginTuning> | undefined,
    fallback: ShotTrajectoryOriginTuning,
): ShotTrajectoryOriginTuning => ({
    offsetAlong: clamp(value?.offsetAlong, fallback.offsetAlong, -160, 160),
    offsetPerpendicular: clamp(value?.offsetPerpendicular, fallback.offsetPerpendicular, -160, 160),
});

export const normalizeShotTrajectoryTuning = (value?: Partial<ShotTrajectoryTuning>): ShotTrajectoryTuning => ({
    emergence: normalizeTransform(value?.emergence, DEFAULT_SHOT_TRAJECTORY_TUNING.emergence),
    projectileOrigin: normalizeOrigin(value?.projectileOrigin, DEFAULT_SHOT_TRAJECTORY_TUNING.projectileOrigin),
    emergenceSparks: normalizeTransform(value?.emergenceSparks, DEFAULT_SHOT_TRAJECTORY_TUNING.emergenceSparks),
    contactSparks: normalizeTransform(value?.contactSparks, DEFAULT_SHOT_TRAJECTORY_TUNING.contactSparks),
});

const readStored = (): ShotTrajectoryTuning => {
    if (typeof window === "undefined") return normalizeShotTrajectoryTuning();
    try {
        const stored = window.localStorage.getItem(SHOT_TRAJECTORY_TUNING_STORAGE_KEY);
        return normalizeShotTrajectoryTuning(
            stored ? (JSON.parse(stored) as Partial<ShotTrajectoryTuning>) : undefined,
        );
    } catch {
        return normalizeShotTrajectoryTuning();
    }
};

let currentTuning: ShotTrajectoryTuning | undefined;

export const getShotTrajectoryTuning = (): ShotTrajectoryTuning => {
    currentTuning ??= readStored();
    return currentTuning;
};

export const setShotTrajectoryTuning = (value: Partial<ShotTrajectoryTuning>): ShotTrajectoryTuning => {
    currentTuning = normalizeShotTrajectoryTuning(value);
    if (typeof window !== "undefined") {
        window.localStorage.setItem(SHOT_TRAJECTORY_TUNING_STORAGE_KEY, JSON.stringify(currentTuning));
        window.dispatchEvent(new CustomEvent(SHOT_TRAJECTORY_TUNING_CHANGED_EVENT, { detail: currentTuning }));
    }
    return currentTuning;
};

export const resetShotTrajectoryTuning = (): ShotTrajectoryTuning =>
    setShotTrajectoryTuning(DEFAULT_SHOT_TRAJECTORY_TUNING);

if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
        if (event.key === SHOT_TRAJECTORY_TUNING_STORAGE_KEY) currentTuning = readStored();
    });
}
