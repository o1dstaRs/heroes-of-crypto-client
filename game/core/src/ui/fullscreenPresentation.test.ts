import { describe, expect, test } from "bun:test";

import { FULLSCREEN_BROWSER_CHROME_TOLERANCE_PX, viewportFillsBrowserWindow } from "./fullscreen";

describe("browser fullscreen presentation", () => {
    test("recognizes a viewport with hidden browser chrome", () => {
        expect(viewportFillsBrowserWindow(1102, 1102)).toBe(true);
        expect(viewportFillsBrowserWindow(1098, 1102)).toBe(true);
        expect(viewportFillsBrowserWindow(1093, 1117)).toBe(true);
    });

    test("does not confuse a normal browser toolbar with fullscreen", () => {
        expect(FULLSCREEN_BROWSER_CHROME_TOLERANCE_PX).toBe(24);
        expect(viewportFillsBrowserWindow(906, 993)).toBe(false);
        expect(viewportFillsBrowserWindow(0, 0)).toBe(false);
    });
});
