import { describe, expect, test } from "bun:test";

import {
    BATTLEFIELD_HEIGHT_RATIO,
    BATTLE_SIDEBAR_WIDTH_RATIO,
    battleSidebarWidth,
    boardFitHeight,
    boardFitVerticalShift,
    boardFitWidth,
    legacyBoardChildScaleCompensation,
    legacyBattleSidebarWidth,
    legacyBoardFitSize,
} from "./boardFit";

describe("battlefield layout", () => {
    test("narrows both sidebars by 15% and gives their space to the board", () => {
        const width = 3416;
        const height = 1808;
        const originalSidebar = legacyBattleSidebarWidth(width, height);
        const sidebar = battleSidebarWidth(width, height);

        expect(originalSidebar).toBe(804);
        expect(sidebar).toBe(Math.round(originalSidebar * BATTLE_SIDEBAR_WIDTH_RATIO));
        expect(boardFitWidth(width, height)).toBe(width - sidebar * 2);
    });

    test("matches row height to the authored floor, bottom-aligning it below the upper wall", () => {
        const width = 3416;
        const height = 1808;
        const boardHeight = boardFitHeight(width, height);
        const shift = boardFitVerticalShift(width, height);
        const centerY = height / 2 - shift;

        expect(boardHeight).toBeCloseTo(legacyBoardFitSize(width, height) * BATTLEFIELD_HEIGHT_RATIO, 8);
        expect(centerY + boardHeight / 2).toBeCloseTo(height, 8);
        expect(centerY - boardHeight / 2).toBeCloseTo(height - boardHeight, 8);
    });

    test("restores character artwork to the old square-fit screen size without moving grid positions", () => {
        const width = 3416;
        const height = 1808;
        const worldSize = 2048;
        const oldScreenSize = legacyBoardFitSize(width, height);
        const cameraScaleX = boardFitWidth(width, height) / worldSize;
        const cameraScaleY = boardFitHeight(width, height) / worldSize;
        const compensation = legacyBoardChildScaleCompensation(cameraScaleX, cameraScaleY);

        expect(Math.abs(worldSize * cameraScaleX * compensation.x - oldScreenSize)).toBeLessThan(0.1);
        expect(Math.abs(worldSize * cameraScaleY * compensation.y - oldScreenSize)).toBeLessThan(0.1);
        expect(legacyBoardChildScaleCompensation(0.75, 0.75)).toEqual({ x: 1, y: 1 });
    });
});
