import { describe, expect, test } from "bun:test";

import { isGameplayPath, pointInGameElement, resolveGameViewport } from "./gameViewport";

describe("landscape gameplay viewport", () => {
    test.each([
        [390, 844],
        [430, 932],
        [768, 1024],
        [1024, 1366],
    ])("rotates a touch %d×%d surface into landscape", (width, height) => {
        expect(resolveGameViewport(width, height, true, true)).toMatchObject({
            width: height,
            height: width,
            touch: true,
            rotated: true,
        });
    });
    test.each([
        [844, 390],
        [1024, 768],
        [1366, 1024],
    ])("retains a touch %d×%d landscape surface", (width, height) => {
        expect(resolveGameViewport(width, height, true, true)).toMatchObject({
            width,
            height,
            touch: true,
            rotated: false,
        });
    });
    test("desktop dimensions and portrait account pages remain unchanged", () => {
        expect(resolveGameViewport(1440, 900, false, true)).toMatchObject({ width: 1440, height: 900, touch: false });
        expect(resolveGameViewport(390, 844, false, true)).toMatchObject({ width: 390, height: 844, rotated: false });
        expect(resolveGameViewport(390, 844, true, false)).toMatchObject({ width: 390, height: 844, touch: false });
    });
    test("only gameplay routes opt into landscape", () => {
        for (const path of [
            "/",
            "/game/123",
            "/game/123/replay",
            "/sandbox/123",
            "/preview/placement",
            "/preview/picks/local",
            "/preview/augments",
        ])
            expect(isGameplayPath(path)).toBe(true);
        for (const path of ["/portal", "/login", "/lobby/123", "/dev/portrait-framing"])
            expect(isGameplayPath(path)).toBe(false);
    });
    test("input follows the same inverse rotation and zoom as the rendered board", () => {
        const rect = { left: -50, top: -100, width: 800, height: 1600 };
        expect(pointInGameElement(350, 700, rect, 800, 400, true)).toEqual({ x: 400, y: 200 });
        expect(pointInGameElement(-50, -100, rect, 800, 400, true)).toEqual({ x: 0, y: 400 });
        expect(pointInGameElement(750, 1500, rect, 800, 400, true)).toEqual({ x: 800, y: 0 });
        expect(pointInGameElement(350, 700, rect, 400, 800, false)).toEqual({ x: 200, y: 400 });
    });
});
