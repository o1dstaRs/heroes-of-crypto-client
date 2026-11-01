import { afterEach, describe, expect, test } from "bun:test";

import { BATTLEFIELD_ARTWORK, battlefieldArtworkLayout } from "../scenes/sandbox/BattlefieldVisualGrid";
import {
    setTouchGameActive,
    setTouchGameInsets,
    TOUCH_ACTIONBAR_HEIGHT,
    TOUCH_TOPBAR_HEIGHT,
    TOUCH_BOARD_GAP,
} from "../viewport/gameViewport";
import { battleSidebarWidth, boardFitHeight, boardFitVerticalShift, boardFitWidth } from "./boardFit";

afterEach(() => {
    setTouchGameActive(false);
    setTouchGameInsets({ top: 0, bottom: 0 });
});

describe("touch battlefield fit", () => {
    test("keeps the home-indicator inset clear on both the painting and the camera", () => {
        setTouchGameActive(true);
        setTouchGameInsets({ top: 0, bottom: 21 });
        const width = boardFitWidth(844, 390),
            height = boardFitHeight(844, 390);
        const art = battlefieldArtworkLayout(844, 390, width, height);
        const bottom = 390 / 2 - boardFitVerticalShift(844, 390) + height / 2;
        const paintedBottom =
            art.y - art.height / 2 + (BATTLEFIELD_ARTWORK.field.bottomLeft.y * art.height) / BATTLEFIELD_ARTWORK.height;
        expect(bottom).toBeCloseTo(390 - TOUCH_ACTIONBAR_HEIGHT - TOUCH_BOARD_GAP - 21, 6);
        expect(paintedBottom).toBeCloseTo(bottom, 6);
    });
    test.each([
        [568, 320],
        [844, 390],
        [1024, 768],
        [1133, 744],
        [1180, 820],
        [1194, 834],
        [1280, 800],
        [1366, 1024],
    ])("keeps floor, units and action dock aligned at %d×%d", (width, height) => {
        setTouchGameActive(true);
        const boardWidth = boardFitWidth(width, height);
        const boardHeight = boardFitHeight(width, height);
        const bottom = height / 2 - boardFitVerticalShift(width, height) + boardHeight / 2;
        const art = battlefieldArtworkLayout(width, height, boardWidth, boardHeight);
        expect(art.width / BATTLEFIELD_ARTWORK.width).toBeCloseTo(art.height / BATTLEFIELD_ARTWORK.height, 8);
        const paintedBottom =
            art.y - art.height / 2 + (BATTLEFIELD_ARTWORK.field.bottomLeft.y * art.height) / BATTLEFIELD_ARTWORK.height;
        expect(battleSidebarWidth(width, height)).toBe(0);
        expect(boardWidth).toBeGreaterThan(0);
        expect(boardWidth).toBeLessThan(width);
        expect(bottom).toBeCloseTo(height - TOUCH_ACTIONBAR_HEIGHT - TOUCH_BOARD_GAP, 6);
        expect(paintedBottom).toBeCloseTo(bottom, 6);
        // The authored wall provides headroom for creatures standing on the top row. Previously its
        // top (and the roster attached to it) was cropped by the touch navigation at tablet sizes.
        expect(art.y - art.height / 2).toBeGreaterThanOrEqual(TOUCH_TOPBAR_HEIGHT + TOUCH_BOARD_GAP - 1e-6);
    });
    test("reserves both safe areas without hiding the upper wall or floor behind a control bar", () => {
        setTouchGameActive(true);
        setTouchGameInsets({ top: 24, bottom: 21 });
        const width = 844,
            height = 390;
        const boardHeight = boardFitHeight(width, height);
        const art = battlefieldArtworkLayout(width, height, boardFitWidth(width, height), boardHeight);
        expect(art.y - art.height / 2).toBeCloseTo(24 + TOUCH_TOPBAR_HEIGHT + TOUCH_BOARD_GAP, 6);
        const floorBottom = height / 2 - boardFitVerticalShift(width, height) + boardHeight / 2;
        expect(floorBottom).toBeCloseTo(height - 21 - TOUCH_ACTIONBAR_HEIGHT - TOUCH_BOARD_GAP, 6);
    });
    test("width-constrained views keep the same artwork aspect without clipping the field", () => {
        setTouchGameActive(true);
        const width = 600,
            height = 1024;
        const art = battlefieldArtworkLayout(
            width,
            height,
            boardFitWidth(width, height),
            boardFitHeight(width, height),
        );
        expect(art.width / BATTLEFIELD_ARTWORK.width).toBeCloseTo(art.height / BATTLEFIELD_ARTWORK.height, 8);
        expect(boardFitWidth(width, height)).toBeLessThanOrEqual(width - 24);
        expect(boardFitHeight(width, height)).toBeLessThan(height - 128);
    });
});
