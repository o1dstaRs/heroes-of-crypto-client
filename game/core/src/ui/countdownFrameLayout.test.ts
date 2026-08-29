import { describe, expect, test } from "bun:test";

import { boardFitHeight, boardFitWidth } from "../pixi/boardFit";
import { BATTLEFIELD_ARTWORK, battlefieldArtworkLayout } from "../scenes/sandbox/BattlefieldVisualGrid";
import {
    DEFAULT_COUNTDOWN_FRAME_TUNING,
    countdownFrameLines,
    countdownFramePoints,
    normalizeCountdownFrameTuning,
} from "./countdownFrameLayout";

describe("countdownFramePoints", () => {
    test("keeps the approved per-line editor export as the production default", () => {
        expect(DEFAULT_COUNTDOWN_FRAME_TUNING).toEqual({
            top: { x1: 71, y1: -1, x2: -74, y2: 0 },
            left: { x1: 16, y1: -115, x2: -1, y2: 73 },
            right: { x1: 7, y1: 70, x2: -30, y2: -115 },
            bottom: { x1: 101, y1: 0, x2: -133, y2: 0 },
        });
    });

    test("tracks the three visible brick-rim edges and keeps the lower rule just inside the screen", () => {
        // Exact dimensions of the user's annotated reference image.
        const viewport = { width: 2296, height: 1648 };
        const points = countdownFramePoints(viewport);
        const artwork = battlefieldArtworkLayout(
            viewport.width,
            viewport.height,
            boardFitWidth(viewport.width, viewport.height),
            boardFitHeight(viewport.width, viewport.height),
        );
        const left = artwork.x - artwork.width * 0.5;
        const top = artwork.y - artwork.height * 0.5;
        const scaleX = artwork.width / BATTLEFIELD_ARTWORK.width;
        const scaleY = artwork.height / BATTLEFIELD_ARTWORK.height;

        expect(points.topLeft.x).toBeCloseTo(left + BATTLEFIELD_ARTWORK.field.topLeft.x * scaleX + 16, 8);
        expect(points.topLeft.y).toBeCloseTo(top + BATTLEFIELD_ARTWORK.field.topLeft.y * scaleY - 17, 8);
        expect(points.topRight.x).toBeCloseTo(left + BATTLEFIELD_ARTWORK.field.topRight.x * scaleX + 11, 8);
        expect(points.topRight.y).toBe(points.topLeft.y);
        expect(points.sideBottomLeft.x).toBeCloseTo(left + BATTLEFIELD_ARTWORK.field.bottomLeft.x * scaleX + 3, 8);
        expect(points.sideBottomRight.x).toBeCloseTo(left + BATTLEFIELD_ARTWORK.field.bottomRight.x * scaleX - 25, 8);
        expect(points.bottomLeft.x).toBeCloseTo(left + BATTLEFIELD_ARTWORK.field.bottomLeft.x * scaleX, 8);
        expect(points.bottomRight.x).toBeCloseTo(left + BATTLEFIELD_ARTWORK.field.bottomRight.x * scaleX, 8);
        expect(points.bottomLeft.y).toBe(viewport.height - 3);
        expect(points.bottomRight.y).toBe(viewport.height - 3);
    });

    test("caps the bottom inset at two to four pixels across viewport sizes", () => {
        expect(countdownFramePoints({ width: 640, height: 480 }).bottomLeft.y).toBe(478);
        expect(countdownFramePoints({ width: 3840, height: 2160 }).bottomLeft.y).toBe(2156);
    });

    test("tunes all four line endpoints independently in reference pixels", () => {
        const viewport = { width: 2296, height: 1648 };
        const original = countdownFrameLines(viewport, normalizeCountdownFrameTuning());
        const tuned = countdownFrameLines(
            viewport,
            normalizeCountdownFrameTuning({
                top: { x1: 11, y1: 12, x2: 13, y2: 14 },
                left: { x1: 21, y1: 22, x2: 23, y2: 24 },
                right: { x1: 31, y1: 32, x2: 33, y2: 34 },
                bottom: { x1: 41, y1: 42, x2: 43, y2: 44 },
            }),
        );

        expect(tuned.top).toEqual({
            x1: original.top.x1 + 11,
            y1: original.top.y1 + 12,
            x2: original.top.x2 + 13,
            y2: original.top.y2 + 14,
        });
        expect(tuned.left).toEqual({
            x1: original.left.x1 + 21,
            y1: original.left.y1 + 22,
            x2: original.left.x2 + 23,
            y2: original.left.y2 + 24,
        });
        expect(tuned.right).toEqual({
            x1: original.right.x1 + 31,
            y1: original.right.y1 + 32,
            x2: original.right.x2 + 33,
            y2: original.right.y2 + 34,
        });
        expect(tuned.bottom).toEqual({
            x1: original.bottom.x1 + 41,
            y1: original.bottom.y1 + 42,
            x2: original.bottom.x2 + 43,
            y2: original.bottom.y2 + 44,
        });
    });
});
