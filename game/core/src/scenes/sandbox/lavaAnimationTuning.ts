export type LavaFireMaskShape = "ellipse" | "triangle" | "rectangle";

export interface LavaAnimationTuning {
    widthCells: number;
    heightCells: number;
    shiftXCells: number;
    shiftYCells: number;
    fogEnabled: boolean;
    fogDensity: number;
    fogOpacity: number;
    fogSpeed: number;
    fogScale: number;
    fogDetail: number;
    fogWarmth: number;
    fogColor: string;
    fogDriftX: number;
    fogDriftY: number;
    fireEnabled: boolean;
    fireScaleX: number;
    fireScaleY: number;
    fireShiftXCells: number;
    fireShiftYCells: number;
    fireAlpha: number;
    fireBrightness: number;
    fireSaturation: number;
    fireContrast: number;
    fireTint: string;
    fireTintAmount: number;
    fireOverAlpha: number;
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
    fire3Enabled: boolean;
    fire3ScaleX: number;
    fire3ScaleY: number;
    fire3ShiftXCells: number;
    fire3ShiftYCells: number;
    fire3Alpha: number;
    fire3Brightness: number;
    fire3Saturation: number;
    fire3Contrast: number;
    fire3Speed: number;
    fire3FrameOffset: number;
    fire4Enabled: boolean;
    fire4ScaleX: number;
    fire4ScaleY: number;
    fire4ShiftXCells: number;
    fire4ShiftYCells: number;
    fire4Alpha: number;
    fire4Brightness: number;
    fire4Saturation: number;
    fire4Contrast: number;
    fire4Speed: number;
    fire4FrameOffset: number;
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
export const LAVA_ANIMATION_TUNING_STORAGE_KEY = "hoc-dev-lava-animation-tuning-v9";

export const DEFAULT_LAVA_ANIMATION_TUNING: LavaAnimationTuning = {
    widthCells: 4,
    heightCells: 4,
    shiftXCells: 0,
    shiftYCells: 0,
    fogEnabled: true,
    fogDensity: 0.31,
    fogOpacity: 1,
    fogSpeed: 10,
    fogScale: 0.25,
    fogDetail: 2,
    fogWarmth: 0.77,
    fogColor: "#585855",
    fogDriftX: -0.46,
    fogDriftY: 0.28,
    // Approved live-board look: animated fire with the original dark corner details preserved.
    fireEnabled: true,
    fireScaleX: 1,
    fireScaleY: 1,
    fireShiftXCells: 0,
    fireShiftYCells: 0,
    fireAlpha: 1,
    fireBrightness: 1,
    fireSaturation: 1,
    fireContrast: 1,
    fireTint: "#ff7a1f",
    fireTintAmount: 0,
    fireOverAlpha: 0.82,
    fire2Enabled: true,
    fire2ScaleX: 0.875,
    fire2ScaleY: 1.48,
    fire2ShiftXCells: 0,
    fire2ShiftYCells: 1.145,
    fire2Alpha: 0.56,
    fire2Brightness: 1.83,
    fire2Saturation: 0.82,
    fire2Contrast: 1.04,
    fire2Speed: 0.83,
    fire2FrameOffset: 21,
    fire3Enabled: true,
    fire3ScaleX: 1.04,
    fire3ScaleY: 1.23,
    fire3ShiftXCells: 0.275,
    fire3ShiftYCells: 1.475,
    fire3Alpha: 0.62,
    fire3Brightness: 1.72,
    fire3Saturation: 0.9,
    fire3Contrast: 1.04,
    fire3Speed: 1.12,
    fire3FrameOffset: 37,
    fire4Enabled: true,
    fire4ScaleX: 0.465,
    fire4ScaleY: 0.86,
    fire4ShiftXCells: 0.115,
    fire4ShiftYCells: 1.44,
    fire4Alpha: 0.6,
    fire4Brightness: 1.76,
    fire4Saturation: 0.88,
    fire4Contrast: 1.05,
    fire4Speed: 0.94,
    fire4FrameOffset: 49,
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
    fps: 16,
    firstFrame: 0,
    lastFrame: LAVA_ANIMATION_FRAME_COUNT - 1,
    paused: false,
    scrubFrame: 0,
    reverse: false,
    lightIntensity: 1.7,
    lightRadius: 1.3,
    lightPulseAmount: 0.32,
    lightPulseSpeed: 1.35,
    edgeFlicker: 1.35,
    lightShiftXCells: -0.22,
    lightShiftYCells: 1.31,
    pitLightEnabled: true,
    pitLightIntensity: 1.58,
    pitLightRadius: 1,
    pitLightPulseAmount: 0.87,
    pitLightWarmth: 0.76,
    splashesEnabled: false,
    splashRate: 1.7,
    splashCount: 11,
    splashHeightCells: 0.82,
    splashSizeCells: 0.047,
    splashSpreadCells: 0.72,
    splashGlow: 1.45,
};

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
};

const booleanValue = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);

const hexColorValue = (value: unknown, fallback: string): string =>
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;

export const lavaFogColorRgb = (color: string): readonly [number, number, number] => {
    const normalized = hexColorValue(color, DEFAULT_LAVA_ANIMATION_TUNING.fogColor);
    return [
        Number.parseInt(normalized.slice(1, 3), 16) / 255,
        Number.parseInt(normalized.slice(3, 5), 16) / 255,
        Number.parseInt(normalized.slice(5, 7), 16) / 255,
    ];
};

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
        fogEnabled: booleanValue(value?.fogEnabled, DEFAULT_LAVA_ANIMATION_TUNING.fogEnabled),
        fogDensity: clamp(value?.fogDensity, DEFAULT_LAVA_ANIMATION_TUNING.fogDensity, 0, 1.5),
        fogOpacity: clamp(value?.fogOpacity, DEFAULT_LAVA_ANIMATION_TUNING.fogOpacity, 0, 1),
        fogSpeed: clamp(value?.fogSpeed, DEFAULT_LAVA_ANIMATION_TUNING.fogSpeed, 0, 12),
        fogScale: clamp(value?.fogScale, DEFAULT_LAVA_ANIMATION_TUNING.fogScale, 0.25, 3),
        fogDetail: clamp(value?.fogDetail, DEFAULT_LAVA_ANIMATION_TUNING.fogDetail, 0, 2),
        fogWarmth: clamp(value?.fogWarmth, DEFAULT_LAVA_ANIMATION_TUNING.fogWarmth, 0, 1),
        fogColor: hexColorValue(value?.fogColor, DEFAULT_LAVA_ANIMATION_TUNING.fogColor),
        fogDriftX: clamp(value?.fogDriftX, DEFAULT_LAVA_ANIMATION_TUNING.fogDriftX, -2, 2),
        fogDriftY: clamp(value?.fogDriftY, DEFAULT_LAVA_ANIMATION_TUNING.fogDriftY, -2, 2),
        fireEnabled: booleanValue(value?.fireEnabled, DEFAULT_LAVA_ANIMATION_TUNING.fireEnabled),
        fireScaleX: clamp(value?.fireScaleX, DEFAULT_LAVA_ANIMATION_TUNING.fireScaleX, 0.25, 2),
        fireScaleY: clamp(value?.fireScaleY, DEFAULT_LAVA_ANIMATION_TUNING.fireScaleY, 0.25, 2),
        fireShiftXCells: clamp(value?.fireShiftXCells, DEFAULT_LAVA_ANIMATION_TUNING.fireShiftXCells, -2, 2),
        fireShiftYCells: clamp(value?.fireShiftYCells, DEFAULT_LAVA_ANIMATION_TUNING.fireShiftYCells, -2, 2),
        fireAlpha: clamp(value?.fireAlpha, DEFAULT_LAVA_ANIMATION_TUNING.fireAlpha, 0, 1.5),
        fireBrightness: clamp(value?.fireBrightness, DEFAULT_LAVA_ANIMATION_TUNING.fireBrightness, 0.25, 2.5),
        fireSaturation: clamp(value?.fireSaturation, DEFAULT_LAVA_ANIMATION_TUNING.fireSaturation, 0, 2.5),
        fireContrast: clamp(value?.fireContrast, DEFAULT_LAVA_ANIMATION_TUNING.fireContrast, 0.25, 2.5),
        fireTint: hexColorValue(value?.fireTint, DEFAULT_LAVA_ANIMATION_TUNING.fireTint),
        fireTintAmount: clamp(value?.fireTintAmount, DEFAULT_LAVA_ANIMATION_TUNING.fireTintAmount, 0, 1),
        fireOverAlpha: clamp(value?.fireOverAlpha, DEFAULT_LAVA_ANIMATION_TUNING.fireOverAlpha, 0, 1.5),
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
        fire3Enabled: booleanValue(value?.fire3Enabled, DEFAULT_LAVA_ANIMATION_TUNING.fire3Enabled),
        fire3ScaleX: clamp(value?.fire3ScaleX, DEFAULT_LAVA_ANIMATION_TUNING.fire3ScaleX, 0.25, 2),
        fire3ScaleY: clamp(value?.fire3ScaleY, DEFAULT_LAVA_ANIMATION_TUNING.fire3ScaleY, 0.25, 2),
        fire3ShiftXCells: clamp(value?.fire3ShiftXCells, DEFAULT_LAVA_ANIMATION_TUNING.fire3ShiftXCells, -2, 2),
        fire3ShiftYCells: clamp(value?.fire3ShiftYCells, DEFAULT_LAVA_ANIMATION_TUNING.fire3ShiftYCells, -2, 2),
        fire3Alpha: clamp(value?.fire3Alpha, DEFAULT_LAVA_ANIMATION_TUNING.fire3Alpha, 0, 1.5),
        fire3Brightness: clamp(value?.fire3Brightness, DEFAULT_LAVA_ANIMATION_TUNING.fire3Brightness, 0.25, 2.5),
        fire3Saturation: clamp(value?.fire3Saturation, DEFAULT_LAVA_ANIMATION_TUNING.fire3Saturation, 0, 2.5),
        fire3Contrast: clamp(value?.fire3Contrast, DEFAULT_LAVA_ANIMATION_TUNING.fire3Contrast, 0.25, 2.5),
        fire3Speed: clamp(value?.fire3Speed, DEFAULT_LAVA_ANIMATION_TUNING.fire3Speed, 0.1, 3),
        fire3FrameOffset: Math.round(
            clamp(
                value?.fire3FrameOffset,
                DEFAULT_LAVA_ANIMATION_TUNING.fire3FrameOffset,
                0,
                LAVA_ANIMATION_FRAME_COUNT - 1,
            ),
        ),
        fire4Enabled: booleanValue(value?.fire4Enabled, DEFAULT_LAVA_ANIMATION_TUNING.fire4Enabled),
        fire4ScaleX: clamp(value?.fire4ScaleX, DEFAULT_LAVA_ANIMATION_TUNING.fire4ScaleX, 0.25, 2),
        fire4ScaleY: clamp(value?.fire4ScaleY, DEFAULT_LAVA_ANIMATION_TUNING.fire4ScaleY, 0.25, 2),
        fire4ShiftXCells: clamp(value?.fire4ShiftXCells, DEFAULT_LAVA_ANIMATION_TUNING.fire4ShiftXCells, -2, 2),
        fire4ShiftYCells: clamp(value?.fire4ShiftYCells, DEFAULT_LAVA_ANIMATION_TUNING.fire4ShiftYCells, -2, 2),
        fire4Alpha: clamp(value?.fire4Alpha, DEFAULT_LAVA_ANIMATION_TUNING.fire4Alpha, 0, 1.5),
        fire4Brightness: clamp(value?.fire4Brightness, DEFAULT_LAVA_ANIMATION_TUNING.fire4Brightness, 0.25, 2.5),
        fire4Saturation: clamp(value?.fire4Saturation, DEFAULT_LAVA_ANIMATION_TUNING.fire4Saturation, 0, 2.5),
        fire4Contrast: clamp(value?.fire4Contrast, DEFAULT_LAVA_ANIMATION_TUNING.fire4Contrast, 0.25, 2.5),
        fire4Speed: clamp(value?.fire4Speed, DEFAULT_LAVA_ANIMATION_TUNING.fire4Speed, 0.1, 3),
        fire4FrameOffset: Math.round(
            clamp(
                value?.fire4FrameOffset,
                DEFAULT_LAVA_ANIMATION_TUNING.fire4FrameOffset,
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
let lavaEditorOutlineActive = false;

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
    // Render code asks for this several times per simulation step. Public reads still return a defensive
    // copy for editor state, but the renderer only consumes the value and can share the immutable cache.
    if (!storedCache) readStoredLavaAnimationTuning();
    return storedCache ?? DEFAULT_LAVA_ANIMATION_TUNING;
};

export const setLavaAnimationEditorActive = (active: boolean, showOutline = active): void => {
    lavaEditorActive = active;
    lavaEditorOutlineActive = active && showOutline;
};

export const isLavaAnimationEditorActive = (): boolean => lavaEditorActive;
export const isLavaAnimationEditorOutlineActive = (): boolean => lavaEditorOutlineActive;

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
