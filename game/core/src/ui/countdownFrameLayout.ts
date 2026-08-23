import { boardFitHeight, boardFitWidth } from "../pixi/boardFit";
import { IWindowSize } from "../scenes/VisibleState";
import { BATTLEFIELD_ARTWORK, battlefieldArtworkLayout } from "../scenes/sandbox/BattlefieldVisualGrid";

export type CountdownFramePoints = Readonly<{
    topLeft: Readonly<{ x: number; y: number }>;
    topRight: Readonly<{ x: number; y: number }>;
    sideBottomRight: Readonly<{ x: number; y: number }>;
    sideBottomLeft: Readonly<{ x: number; y: number }>;
    bottomRight: Readonly<{ x: number; y: number }>;
    bottomLeft: Readonly<{ x: number; y: number }>;
}>;

export const COUNTDOWN_FRAME_LINE_KEYS = ["top", "left", "right", "bottom"] as const;
export type CountdownFrameLineKey = (typeof COUNTDOWN_FRAME_LINE_KEYS)[number];

export type CountdownFrameLine = Readonly<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}>;

export type CountdownFrameLines = Readonly<Record<CountdownFrameLineKey, CountdownFrameLine>>;

export type CountdownFrameLineOffset = Readonly<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}>;

export type CountdownFrameTuning = Readonly<Record<CountdownFrameLineKey, CountdownFrameLineOffset>>;

export const DEFAULT_COUNTDOWN_FRAME_TUNING: CountdownFrameTuning = Object.freeze({
    top: Object.freeze({ x1: 71, y1: -1, x2: -74, y2: 0 }),
    left: Object.freeze({ x1: 16, y1: -115, x2: -1, y2: 73 }),
    right: Object.freeze({ x1: 7, y1: 70, x2: -30, y2: -115 }),
    bottom: Object.freeze({ x1: 101, y1: 0, x2: -133, y2: 0 }),
});

export const COUNTDOWN_FRAME_TUNING_STORAGE_KEY = "hoc-dev-countdown-frame-tuning-v1";

/** Pixel offsets traced from the user's 2296x1648 reference. Ratios retain that exact silhouette on resize. */
const COUNTDOWN_RIM_REFERENCE = Object.freeze({
    width: 2296,
    height: 1648,
    topLeftX: 16,
    topRightX: 11,
    topY: -17,
    sideBottomLeftX: 3,
    sideBottomRightX: -25,
});

const clampOffset = (value: unknown): number => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(-1000, Math.min(1000, numeric)) : 0;
};

export const normalizeCountdownFrameTuning = (value?: Partial<CountdownFrameTuning>): CountdownFrameTuning =>
    Object.freeze(
        Object.fromEntries(
            COUNTDOWN_FRAME_LINE_KEYS.map((line) => [
                line,
                Object.freeze({
                    x1: clampOffset(value?.[line]?.x1),
                    y1: clampOffset(value?.[line]?.y1),
                    x2: clampOffset(value?.[line]?.x2),
                    y2: clampOffset(value?.[line]?.y2),
                }),
            ]),
        ) as unknown as CountdownFrameTuning,
    );

export const readStoredCountdownFrameTuning = (): CountdownFrameTuning => {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
        return DEFAULT_COUNTDOWN_FRAME_TUNING;
    }
    try {
        const raw = window.localStorage.getItem(COUNTDOWN_FRAME_TUNING_STORAGE_KEY);
        return raw
            ? normalizeCountdownFrameTuning(JSON.parse(raw) as Partial<CountdownFrameTuning>)
            : DEFAULT_COUNTDOWN_FRAME_TUNING;
    } catch {
        return DEFAULT_COUNTDOWN_FRAME_TUNING;
    }
};

export const writeStoredCountdownFrameTuning = (value: CountdownFrameTuning): CountdownFrameTuning => {
    const normalized = normalizeCountdownFrameTuning(value);
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        try {
            window.localStorage.setItem(COUNTDOWN_FRAME_TUNING_STORAGE_KEY, JSON.stringify(normalized));
        } catch {
            // A private/incognito storage failure must not disable the live editor for this session.
        }
    }
    return normalized;
};

/**
 * Screen-space path for the last-five-seconds frame.
 *
 * Its upper three runs sit on the authored brick rim of the perspective battlefield. The lower run is
 * deliberately detached from the bitmap's final row by only a few CSS pixels, keeping it visible instead
 * of letting the viewport clip half of the stroke.
 */
export const countdownFramePoints = ({ width, height }: IWindowSize): CountdownFramePoints => {
    const artwork = battlefieldArtworkLayout(
        width,
        height,
        boardFitWidth(width, height),
        boardFitHeight(width, height),
    );
    const artworkLeft = artwork.x - artwork.width * 0.5;
    const artworkTop = artwork.y - artwork.height * 0.5;
    const scaleX = artwork.width / BATTLEFIELD_ARTWORK.width;
    const scaleY = artwork.height / BATTLEFIELD_ARTWORK.height;
    const field = BATTLEFIELD_ARTWORK.field;
    const sourceToScreen = (point: Readonly<{ x: number; y: number }>): { x: number; y: number } => ({
        x: artworkLeft + point.x * scaleX,
        y: artworkTop + point.y * scaleY,
    });
    const fieldTopLeft = sourceToScreen(field.topLeft);
    const fieldTopRight = sourceToScreen(field.topRight);
    const bottomLeft = sourceToScreen(field.bottomLeft);
    const bottomRight = sourceToScreen(field.bottomRight);
    const bottomInset = Math.max(2, Math.min(4, Math.round(height * 0.002)));
    const bottomY = height - bottomInset;
    const topY = fieldTopLeft.y + (height * COUNTDOWN_RIM_REFERENCE.topY) / COUNTDOWN_RIM_REFERENCE.height;

    return {
        topLeft: {
            x: fieldTopLeft.x + (width * COUNTDOWN_RIM_REFERENCE.topLeftX) / COUNTDOWN_RIM_REFERENCE.width,
            y: topY,
        },
        topRight: {
            x: fieldTopRight.x + (width * COUNTDOWN_RIM_REFERENCE.topRightX) / COUNTDOWN_RIM_REFERENCE.width,
            y: topY,
        },
        sideBottomRight: {
            x: bottomRight.x + (width * COUNTDOWN_RIM_REFERENCE.sideBottomRightX) / COUNTDOWN_RIM_REFERENCE.width,
            y: bottomY,
        },
        sideBottomLeft: {
            x: bottomLeft.x + (width * COUNTDOWN_RIM_REFERENCE.sideBottomLeftX) / COUNTDOWN_RIM_REFERENCE.width,
            y: bottomY,
        },
        // The user explicitly approved the lower rule: keep its original endpoints and inset unchanged.
        bottomRight: { x: bottomRight.x, y: bottomY },
        bottomLeft: { x: bottomLeft.x, y: bottomY },
    };
};

/** Four independent SVG lines. Editor offsets are reference pixels, scaled with the viewport. */
export const countdownFrameLines = (
    windowSize: IWindowSize,
    requestedTuning: CountdownFrameTuning = DEFAULT_COUNTDOWN_FRAME_TUNING,
): CountdownFrameLines => {
    const points = countdownFramePoints(windowSize);
    const tuning = normalizeCountdownFrameTuning(requestedTuning);
    const base: CountdownFrameLines = {
        top: { x1: points.topLeft.x, y1: points.topLeft.y, x2: points.topRight.x, y2: points.topRight.y },
        left: {
            x1: points.sideBottomLeft.x,
            y1: points.sideBottomLeft.y,
            x2: points.topLeft.x,
            y2: points.topLeft.y,
        },
        right: {
            x1: points.topRight.x,
            y1: points.topRight.y,
            x2: points.sideBottomRight.x,
            y2: points.sideBottomRight.y,
        },
        bottom: {
            x1: points.bottomLeft.x,
            y1: points.bottomLeft.y,
            x2: points.bottomRight.x,
            y2: points.bottomRight.y,
        },
    };
    const xScale = windowSize.width / COUNTDOWN_RIM_REFERENCE.width;
    const yScale = windowSize.height / COUNTDOWN_RIM_REFERENCE.height;

    return Object.freeze(
        Object.fromEntries(
            COUNTDOWN_FRAME_LINE_KEYS.map((line) => [
                line,
                Object.freeze({
                    x1: base[line].x1 + tuning[line].x1 * xScale,
                    y1: base[line].y1 + tuning[line].y1 * yScale,
                    x2: base[line].x2 + tuning[line].x2 * xScale,
                    y2: base[line].y2 + tuning[line].y2 * yScale,
                }),
            ]),
        ) as unknown as CountdownFrameLines,
    );
};
