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
        expect(bottom).toBeCloseTo(390 - 21, 6);
        expect(paintedBottom).toBeCloseTo(bottom, 6);
    });
    test.each([
        [568, 320],
        [844, 390],
        [660, 580],
        [1024, 768],
        [1133, 744],
        [1180, 820],
        [1194, 834],
        [1280, 800],
        [1366, 1024],
    ])("fits the floor and camera to the viewport at %d×%d", (width, height) => {
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
        expect(bottom).toBeCloseTo(height, 6);
        expect(paintedBottom).toBeCloseTo(bottom, 6);
        expect(art.y - art.height / 2).toBeGreaterThanOrEqual(-1e-6);
    });
    test("uses the available height for the wall and floor after allowing for top and bottom insets", () => {
        setTouchGameActive(true);
        setTouchGameInsets({ top: 24, bottom: 21 });
        const width = 844,
            height = 390;
        const boardHeight = boardFitHeight(width, height);
        const art = battlefieldArtworkLayout(width, height, boardFitWidth(width, height), boardHeight);
        expect(art.y - art.height / 2).toBeCloseTo(24, 6);
        const floorBottom = height / 2 - boardFitVerticalShift(width, height) + boardHeight / 2;
        expect(floorBottom).toBeCloseTo(height - 21, 6);
    });
    test("fits a width-constrained board inside either side of an asymmetric notch", () => {
        setTouchGameActive(true);
        setTouchGameInsets({ top: 0, bottom: 0, left: 44, right: 0 });
        const width = 640;
        const height = 520;
        const art = battlefieldArtworkLayout(
            width,
            height,
            boardFitWidth(width, height),
            boardFitHeight(width, height),
        );
        const left = art.x - art.width / 2;
        const scale = art.width / BATTLEFIELD_ARTWORK.width;
        expect(left + BATTLEFIELD_ARTWORK.field.bottomLeft.x * scale).toBeGreaterThan(44);
        expect(left + BATTLEFIELD_ARTWORK.field.bottomRight.x * scale).toBeCloseTo(width - 44, 6);
    });
    test("uses the full usable width when split view limits the fit", () => {
        setTouchGameActive(true);
        const width = 660;
        const height = 580;
        const art = battlefieldArtworkLayout(
            width,
            height,
            boardFitWidth(width, height),
            boardFitHeight(width, height),
        );
        const paintedRight =
            art.x - art.width / 2 + (BATTLEFIELD_ARTWORK.field.bottomRight.x * art.width) / BATTLEFIELD_ARTWORK.width;
        expect(paintedRight).toBeCloseTo(width, 6);
        expect(art.width / BATTLEFIELD_ARTWORK.width).toBeCloseTo(art.height / BATTLEFIELD_ARTWORK.height, 8);
    });
});
