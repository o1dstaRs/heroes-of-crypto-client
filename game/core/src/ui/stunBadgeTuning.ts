export interface StunBadgeTuning {
    /** Sprite width divided by the live amount-flag height. */
    widthScale: number;
    /** Sprite height divided by the live amount-flag height. */
    heightScale: number;
    /** Extra horizontal shift measured in live amount-flag heights. Positive moves right. */
    offsetXFlagHeights: number;
}

export interface StunBadgeLayout {
    width: number;
    height: number;
    centerX: number;
}

export const STUN_BADGE_TUNING_STORAGE_KEY = "hoc-dev-stun-badge-tuning-v3";

/** Current reviewed runtime appearance exported from the development editor. */
export const DEFAULT_STUN_BADGE_TUNING: StunBadgeTuning = Object.freeze({
    widthScale: 1.84 * 0.97 * 0.97,
    heightScale: 1.99 * 0.97,
    offsetXFlagHeights: 0.25,
});

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
};

export const normalizeStunBadgeTuning = (value?: Partial<StunBadgeTuning>): StunBadgeTuning => ({
    widthScale: clamp(value?.widthScale, DEFAULT_STUN_BADGE_TUNING.widthScale, 0.5, 3),
    heightScale: clamp(value?.heightScale, DEFAULT_STUN_BADGE_TUNING.heightScale, 0.5, 3),
    offsetXFlagHeights: clamp(value?.offsetXFlagHeights, DEFAULT_STUN_BADGE_TUNING.offsetXFlagHeights, -1.5, 1.5),
});

let storedCache: StunBadgeTuning | undefined;

export const readStoredStunBadgeTuning = (): StunBadgeTuning => {
    if (storedCache) return { ...storedCache };
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
        storedCache = { ...DEFAULT_STUN_BADGE_TUNING };
        return { ...storedCache };
    }
    try {
        const raw = window.localStorage.getItem(STUN_BADGE_TUNING_STORAGE_KEY);
        storedCache = normalizeStunBadgeTuning(
            raw ? (JSON.parse(raw) as Partial<StunBadgeTuning>) : DEFAULT_STUN_BADGE_TUNING,
        );
    } catch {
        storedCache = { ...DEFAULT_STUN_BADGE_TUNING };
    }
    return { ...storedCache };
};

export const writeStoredStunBadgeTuning = (value: Partial<StunBadgeTuning>): StunBadgeTuning => {
    storedCache = normalizeStunBadgeTuning(value);
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.setItem(STUN_BADGE_TUNING_STORAGE_KEY, JSON.stringify(storedCache));
    }
    return { ...storedCache };
};

export const resetStoredStunBadgeTuning = (): StunBadgeTuning => {
    storedCache = { ...DEFAULT_STUN_BADGE_TUNING };
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.removeItem(STUN_BADGE_TUNING_STORAGE_KEY);
    }
    return { ...storedCache };
};

/** Local editor drafts never leak into production builds. */
export const resolveStunBadgeTuning = (): StunBadgeTuning => {
    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return { ...DEFAULT_STUN_BADGE_TUNING };
    }
    return readStoredStunBadgeTuning();
};

/** Shared layout for both the Pixi battlefield badge and the development preview. */
export const stunBadgeLayout = (
    flagHeight: number,
    bannerLeft: number,
    tuning: StunBadgeTuning = resolveStunBadgeTuning(),
): StunBadgeLayout => {
    const width = flagHeight * tuning.widthScale;
    const height = flagHeight * tuning.heightScale;
    return {
        width,
        height,
        centerX: bannerLeft - width * 0.5 + width * 0.04 + tuning.offsetXFlagHeights * flagHeight,
    };
};
