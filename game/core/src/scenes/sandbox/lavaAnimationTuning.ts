export type LavaFireMaskShape = "ellipse" | "triangle" | "rectangle";

export interface LavaAnimationTuning {
    widthCells: number;
    heightCells: number;
    shiftXCells: number;
    shiftYCells: number;
    fireScaleX: number;
    fireScaleY: number;
    fireShiftXCells: number;
    fireShiftYCells: number;
    fireAlpha: number;
    fireBrightness: number;
    fireSaturation: number;
    fireContrast: number;
    fire2Enabled: boolean;
    fire2ScaleX: number;
    fire2ScaleY: number;
    fire2ShiftXCells: number;
    fire2ShiftYCells: number;
    fire2Alpha: number;
    fire2Brightness: number;
    fire2Saturation: number;
    fire2Contrast: number;
    fire2Speed: number;
    fire2FrameOffset: number;
    fireMaskShape: LavaFireMaskShape;
    fireMaskWidthCells: number;
    fireMaskHeightCells: number;
    fireMaskShiftXCells: number;
    fireMaskShiftYCells: number;
    fireMaskRotationDeg: number;
    alpha: number;
    brightness: number;
    saturation: number;
    contrast: number;
    fps: number;
    firstFrame: number;
    lastFrame: number;
    paused: boolean;
    scrubFrame: number;
    reverse: boolean;
    lightIntensity: number;
    lightRadius: number;
    lightPulseAmount: number;
    lightPulseSpeed: number;
    edgeFlicker: number;
    lightShiftXCells: number;
    lightShiftYCells: number;
    pitLightEnabled: boolean;
    pitLightIntensity: number;
    pitLightRadius: number;
    pitLightPulseAmount: number;
    pitLightWarmth: number;
    splashesEnabled: boolean;
    splashRate: number;
    splashCount: number;
    splashHeightCells: number;
    splashSizeCells: number;
    splashSpreadCells: number;
    splashGlow: number;
}

export const LAVA_ANIMATION_FRAME_COUNT = 64;
export const LAVA_ANIMATION_TUNING_STORAGE_KEY = "hoc-dev-lava-animation-tuning-v7";

export const DEFAULT_LAVA_ANIMATION_TUNING: LavaAnimationTuning = {
    widthCells: 4,
    heightCells: 4,
    shiftXCells: 0,
    shiftYCells: 0,
    fireScaleX: 0.96,
    fireScaleY: 1.325,
    fireShiftXCells: -0.065,
    fireShiftYCells: 0.5,
    fireAlpha: 1,
    fireBrightness: 1.69,
    fireSaturation: 0.88,
    fireContrast: 1.05,
    fire2Enabled: true,
    fire2ScaleX: 0.755,
    fire2ScaleY: 1.145,
    fire2ShiftXCells: 0,
    fire2ShiftYCells: 1.32,
    fire2Alpha: 0.56,
    fire2Brightness: 1.83,
    fire2Saturation: 0.82,
    fire2Contrast: 1.04,
    fire2Speed: 0.83,
    fire2FrameOffset: 21,
    fireMaskShape: "ellipse",
    fireMaskWidthCells: 3.55,
    fireMaskHeightCells: 3.25,
    fireMaskShiftXCells: 0,
    fireMaskShiftYCells: -0.12,
    fireMaskRotationDeg: 0,
    alpha: 1,
    brightness: 1,
    saturation: 1,
    contrast: 1,
    fps: 16.25,
    firstFrame: 0,
    lastFrame: LAVA_ANIMATION_FRAME_COUNT - 1,
    paused: false,
    scrubFrame: 0,
    reverse: false,
    lightIntensity: 0,
    lightRadius: 0.79,
    lightPulseAmount: 0.27,
    lightPulseSpeed: 0.62,
    edgeFlicker: 0.64,
    lightShiftXCells: -0.22,
    lightShiftYCells: 1.31,
    pitLightEnabled: true,
    pitLightIntensity: 1.58,
    pitLightRadius: 1,
    pitLightPulseAmount: 0.87,
    pitLightWarmth: 0.76,
    splashesEnabled: true,
    splashRate: 1.8,
    splashCount: 4,
    splashHeightCells: 0.2,
    splashSizeCells: 0.021,
    splashSpreadCells: 0.91,
    splashGlow: 0.53,
};

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
};

const booleanValue = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);

const fireMaskShapeValue = (value: unknown): LavaFireMaskShape =>
    value === "triangle" || value === "rectangle" || value === "ellipse"
        ? value
        : DEFAULT_LAVA_ANIMATION_TUNING.fireMaskShape;

export const normalizeLavaAnimationTuning = (value: Partial<LavaAnimationTuning> | undefined): LavaAnimationTuning => {
    const firstFrame = Math.round(
        clamp(value?.firstFrame, DEFAULT_LAVA_ANIMATION_TUNING.firstFrame, 0, LAVA_ANIMATION_FRAME_COUNT - 1),
    );
    const lastFrame = Math.round(
        clamp(value?.lastFrame, DEFAULT_LAVA_ANIMATION_TUNING.lastFrame, firstFrame, LAVA_ANIMATION_FRAME_COUNT - 1),
    );

    return {
        widthCells: clamp(value?.widthCells, DEFAULT_LAVA_ANIMATION_TUNING.widthCells, 0.5, 8),
        heightCells: clamp(value?.heightCells, DEFAULT_LAVA_ANIMATION_TUNING.heightCells, 0.5, 8),
        shiftXCells: clamp(value?.shiftXCells, DEFAULT_LAVA_ANIMATION_TUNING.shiftXCells, -4, 4),
        shiftYCells: clamp(value?.shiftYCells, DEFAULT_LAVA_ANIMATION_TUNING.shiftYCells, -4, 4),
        fireScaleX: clamp(value?.fireScaleX, DEFAULT_LAVA_ANIMATION_TUNING.fireScaleX, 0.25, 2),
        fireScaleY: clamp(value?.fireScaleY, DEFAULT_LAVA_ANIMATION_TUNING.fireScaleY, 0.25, 2),
        fireShiftXCells: clamp(value?.fireShiftXCells, DEFAULT_LAVA_ANIMATION_TUNING.fireShiftXCells, -2, 2),
        fireShiftYCells: clamp(value?.fireShiftYCells, DEFAULT_LAVA_ANIMATION_TUNING.fireShiftYCells, -2, 2),
        fireAlpha: clamp(value?.fireAlpha, DEFAULT_LAVA_ANIMATION_TUNING.fireAlpha, 0, 1.5),
        fireBrightness: clamp(value?.fireBrightness, DEFAULT_LAVA_ANIMATION_TUNING.fireBrightness, 0.25, 2.5),
        fireSaturation: clamp(value?.fireSaturation, DEFAULT_LAVA_ANIMATION_TUNING.fireSaturation, 0, 2.5),
        fireContrast: clamp(value?.fireContrast, DEFAULT_LAVA_ANIMATION_TUNING.fireContrast, 0.25, 2.5),
        fire2Enabled: booleanValue(value?.fire2Enabled, DEFAULT_LAVA_ANIMATION_TUNING.fire2Enabled),
        fire2ScaleX: clamp(value?.fire2ScaleX, DEFAULT_LAVA_ANIMATION_TUNING.fire2ScaleX, 0.25, 2),
        fire2ScaleY: clamp(value?.fire2ScaleY, DEFAULT_LAVA_ANIMATION_TUNING.fire2ScaleY, 0.25, 2),
        fire2ShiftXCells: clamp(value?.fire2ShiftXCells, DEFAULT_LAVA_ANIMATION_TUNING.fire2ShiftXCells, -2, 2),
        fire2ShiftYCells: clamp(value?.fire2ShiftYCells, DEFAULT_LAVA_ANIMATION_TUNING.fire2ShiftYCells, -2, 2),
        fire2Alpha: clamp(value?.fire2Alpha, DEFAULT_LAVA_ANIMATION_TUNING.fire2Alpha, 0, 1.5),
        fire2Brightness: clamp(value?.fire2Brightness, DEFAULT_LAVA_ANIMATION_TUNING.fire2Brightness, 0.25, 2.5),
        fire2Saturation: clamp(value?.fire2Saturation, DEFAULT_LAVA_ANIMATION_TUNING.fire2Saturation, 0, 2.5),
        fire2Contrast: clamp(value?.fire2Contrast, DEFAULT_LAVA_ANIMATION_TUNING.fire2Contrast, 0.25, 2.5),
        fire2Speed: clamp(value?.fire2Speed, DEFAULT_LAVA_ANIMATION_TUNING.fire2Speed, 0.1, 3),
        fire2FrameOffset: Math.round(
            clamp(
                value?.fire2FrameOffset,
                DEFAULT_LAVA_ANIMATION_TUNING.fire2FrameOffset,
                0,
                LAVA_ANIMATION_FRAME_COUNT - 1,
            ),
        ),
        fireMaskShape: fireMaskShapeValue(value?.fireMaskShape),
        fireMaskWidthCells: clamp(value?.fireMaskWidthCells, DEFAULT_LAVA_ANIMATION_TUNING.fireMaskWidthCells, 0.25, 6),
        fireMaskHeightCells: clamp(
            value?.fireMaskHeightCells,
            DEFAULT_LAVA_ANIMATION_TUNING.fireMaskHeightCells,
            0.25,
            6,
        ),
        fireMaskShiftXCells: clamp(
            value?.fireMaskShiftXCells,
            DEFAULT_LAVA_ANIMATION_TUNING.fireMaskShiftXCells,
            -3,
            3,
        ),
        fireMaskShiftYCells: clamp(
            value?.fireMaskShiftYCells,
            DEFAULT_LAVA_ANIMATION_TUNING.fireMaskShiftYCells,
            -3,
            3,
        ),
        fireMaskRotationDeg: clamp(
            value?.fireMaskRotationDeg,
            DEFAULT_LAVA_ANIMATION_TUNING.fireMaskRotationDeg,
            -180,
            180,
        ),
        alpha: clamp(value?.alpha, DEFAULT_LAVA_ANIMATION_TUNING.alpha, 0, 1.5),
        brightness: clamp(value?.brightness, DEFAULT_LAVA_ANIMATION_TUNING.brightness, 0.25, 2.5),
        saturation: clamp(value?.saturation, DEFAULT_LAVA_ANIMATION_TUNING.saturation, 0, 2.5),
        contrast: clamp(value?.contrast, DEFAULT_LAVA_ANIMATION_TUNING.contrast, 0.25, 2.5),
        fps: clamp(value?.fps, DEFAULT_LAVA_ANIMATION_TUNING.fps, 0.25, 60),
        firstFrame,
        lastFrame,
        paused: booleanValue(value?.paused, DEFAULT_LAVA_ANIMATION_TUNING.paused),
        scrubFrame: Math.round(clamp(value?.scrubFrame, firstFrame, firstFrame, lastFrame)),
        reverse: booleanValue(value?.reverse, DEFAULT_LAVA_ANIMATION_TUNING.reverse),
        lightIntensity: clamp(value?.lightIntensity, DEFAULT_LAVA_ANIMATION_TUNING.lightIntensity, 0, 3),
        lightRadius: clamp(value?.lightRadius, DEFAULT_LAVA_ANIMATION_TUNING.lightRadius, 0.25, 2.5),
        lightPulseAmount: clamp(value?.lightPulseAmount, DEFAULT_LAVA_ANIMATION_TUNING.lightPulseAmount, 0, 1),
        lightPulseSpeed: clamp(value?.lightPulseSpeed, DEFAULT_LAVA_ANIMATION_TUNING.lightPulseSpeed, 0, 4),
        edgeFlicker: clamp(value?.edgeFlicker, DEFAULT_LAVA_ANIMATION_TUNING.edgeFlicker, 0, 3),
        lightShiftXCells: clamp(value?.lightShiftXCells, DEFAULT_LAVA_ANIMATION_TUNING.lightShiftXCells, -4, 4),
        lightShiftYCells: clamp(value?.lightShiftYCells, DEFAULT_LAVA_ANIMATION_TUNING.lightShiftYCells, -4, 4),
        pitLightEnabled: booleanValue(value?.pitLightEnabled, DEFAULT_LAVA_ANIMATION_TUNING.pitLightEnabled),
        pitLightIntensity: clamp(value?.pitLightIntensity, DEFAULT_LAVA_ANIMATION_TUNING.pitLightIntensity, 0, 2),
        pitLightRadius: clamp(value?.pitLightRadius, DEFAULT_LAVA_ANIMATION_TUNING.pitLightRadius, 0.15, 1),
        pitLightPulseAmount: clamp(value?.pitLightPulseAmount, DEFAULT_LAVA_ANIMATION_TUNING.pitLightPulseAmount, 0, 1),
        pitLightWarmth: clamp(value?.pitLightWarmth, DEFAULT_LAVA_ANIMATION_TUNING.pitLightWarmth, 0, 1),
        splashesEnabled: booleanValue(value?.splashesEnabled, DEFAULT_LAVA_ANIMATION_TUNING.splashesEnabled),
        splashRate: clamp(value?.splashRate, DEFAULT_LAVA_ANIMATION_TUNING.splashRate, 0, 5),
        splashCount: Math.round(clamp(value?.splashCount, DEFAULT_LAVA_ANIMATION_TUNING.splashCount, 0, 24)),
        splashHeightCells: clamp(value?.splashHeightCells, DEFAULT_LAVA_ANIMATION_TUNING.splashHeightCells, 0, 2.5),
        splashSizeCells: clamp(value?.splashSizeCells, DEFAULT_LAVA_ANIMATION_TUNING.splashSizeCells, 0.005, 0.2),
        splashSpreadCells: clamp(value?.splashSpreadCells, DEFAULT_LAVA_ANIMATION_TUNING.splashSpreadCells, 0, 2),
        splashGlow: clamp(value?.splashGlow, DEFAULT_LAVA_ANIMATION_TUNING.splashGlow, 0, 3),
    };
};

let storedCache: LavaAnimationTuning | undefined;
let lavaEditorActive = false;

export const readStoredLavaAnimationTuning = (): LavaAnimationTuning => {
    if (storedCache) return { ...storedCache };
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
        storedCache = { ...DEFAULT_LAVA_ANIMATION_TUNING };
        return { ...storedCache };
    }
    try {
        const raw = window.localStorage.getItem(LAVA_ANIMATION_TUNING_STORAGE_KEY);
        storedCache = normalizeLavaAnimationTuning(raw ? (JSON.parse(raw) as Partial<LavaAnimationTuning>) : undefined);
    } catch {
        storedCache = { ...DEFAULT_LAVA_ANIMATION_TUNING };
    }
    return { ...storedCache };
};

export const writeStoredLavaAnimationTuning = (value: Partial<LavaAnimationTuning>): LavaAnimationTuning => {
    storedCache = normalizeLavaAnimationTuning(value);
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.setItem(LAVA_ANIMATION_TUNING_STORAGE_KEY, JSON.stringify(storedCache));
    }
    return { ...storedCache };
};

export const resetStoredLavaAnimationTuning = (): LavaAnimationTuning => {
    storedCache = { ...DEFAULT_LAVA_ANIMATION_TUNING };
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.removeItem(LAVA_ANIMATION_TUNING_STORAGE_KEY);
    }
    return { ...storedCache };
};

export const resolveLavaAnimationTuning = (): LavaAnimationTuning => {
    if (import.meta.env.PROD || import.meta.env.VITE_IS_PROD === "true") {
        return DEFAULT_LAVA_ANIMATION_TUNING;
    }
    return readStoredLavaAnimationTuning();
};

export const setLavaAnimationEditorActive = (active: boolean): void => {
    lavaEditorActive = active;
};

export const isLavaAnimationEditorActive = (): boolean => lavaEditorActive;

export const lavaAnimationFrameAtTime = (tuning: LavaAnimationTuning, nowSeconds: number): number => {
    const first = tuning.firstFrame;
    const last = tuning.lastFrame;
    const span = Math.max(1, last - first + 1);
    const offset = tuning.paused
        ? Math.max(0, Math.min(span - 1, tuning.scrubFrame - first))
        : Math.floor(Math.max(0, nowSeconds) * tuning.fps) % span;
    return tuning.reverse ? last - offset : first + offset;
};

export interface LavaFireLightEnvelope {
    rootAlpha: number;
    baseAlpha: number;
    edgeAlphas: number[];
}

export const lavaPitLightIntensityAtTime = (tuning: LavaAnimationTuning, nowSeconds: number): number => {
    if (!tuning.pitLightEnabled || tuning.pitLightIntensity <= 0) return 0;
    const rawTime = tuning.paused ? tuning.scrubFrame / Math.max(0.25, tuning.fps) : Math.max(0, nowSeconds);
    const direction = tuning.reverse ? -1 : 1;
    const t = rawTime * direction * tuning.lightPulseSpeed;
    const wave = Math.sin(t * 2.7 + 0.4) * 0.62 + Math.sin(t * 6.1 + 1.8) * 0.38;
    return Math.max(0, Math.min(2, tuning.pitLightIntensity * (1 + wave * tuning.pitLightPulseAmount * 0.24)));
};

/** A visibly responsive but non-blinking fire-light envelope, independent from the simulation clock. */
export const lavaFireLightEnvelopeAtTime = (
    tuning: LavaAnimationTuning,
    nowSeconds: number,
    edgeCount = 4,
): LavaFireLightEnvelope => {
    const t = Math.max(0, nowSeconds) * tuning.lightPulseSpeed;
    const pulse = Math.sin(t * 3.7) * 0.52 + Math.sin(t * 7.9 + 1.1) * 0.34 + Math.sin(t * 15.3 + 2.7) * 0.14;
    const clampAlpha = (value: number): number => Math.max(0, Math.min(1, value));

    // Intensity is applied only once at the common root. The previous path multiplied it at both
    // parent and child levels, making the controls feel dead and crushing low values quadratically.
    const rootAlpha = clampAlpha(1 - Math.exp(-Math.max(0, tuning.lightIntensity) * 1.35));
    const baseAlpha = clampAlpha(0.76 + pulse * tuning.lightPulseAmount * 0.58);
    const edgeAlphas = Array.from({ length: edgeCount }, (_, index) => {
        const flicker = Math.sin(t * (5.8 + index * 0.77) + index * 1.63) * 0.16 * tuning.edgeFlicker;
        return clampAlpha(0.7 + pulse * tuning.lightPulseAmount * 0.5 + flicker);
    });
    return { rootAlpha, baseAlpha, edgeAlphas };
};
