import { afterEach, describe, expect, test } from "bun:test";

import { BATTLEFIELD_ARTWORK, battlefieldArtworkLayout } from "../scenes/sandbox/BattlefieldVisualGrid";
import { setTouchGameActive, setTouchGameInsets } from "../viewport/gameViewport";
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
        expect(bottom).toBeCloseTo(390 - 76 - 21, 6);
        expect(paintedBottom).toBeCloseTo(bottom, 6);
    });
    test.each([
        [568, 320],
        [844, 390],
        [1024, 768],
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
        expect(bottom).toBeCloseTo(height - 76, 6);
        expect(paintedBottom).toBeCloseTo(bottom, 6);
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
