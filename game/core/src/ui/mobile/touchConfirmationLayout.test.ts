import { expect, test } from "bun:test";

import { TOUCH_ACTIONBAR_HEIGHT, TOUCH_TOPBAR_HEIGHT } from "../../viewport/gameViewport";
import { touchConfirmationLayout } from "./touchConfirmationLayout";

const size = { width: 220, height: 86 };
const devices = [
    { width: 568, height: 320, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
    { width: 844, height: 390, safe: { top: 0, bottom: 21, left: 44, right: 44 } },
    { width: 1024, height: 768, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
    { width: 1180, height: 820, safe: { top: 0, bottom: 21, left: 0, right: 0 } },
    { width: 1366, height: 1024, safe: { top: 24, bottom: 21, left: 0, right: 0 } },
];

test.each(devices)("confirmation remains near the action and clear of the target and controls at %j", (viewport) => {
    const { safe } = viewport;
    const top = safe.top + TOUCH_TOPBAR_HEIGHT + 8;
    const bottom = viewport.height - safe.bottom - TOUCH_ACTIONBAR_HEIGHT - 8;
    const left = safe.left + 8;
    const right = viewport.width - safe.right - 8;
    for (const x of [left + 1, (left + right) / 2, right - 1]) {
        for (const y of [top + 1, (top + bottom) / 2, bottom - 1]) {
            const rect = touchConfirmationLayout({ x, y }, size, viewport, safe);
            expect(rect.left).toBeGreaterThanOrEqual(left);
            expect(rect.left + size.width).toBeLessThanOrEqual(right);
            expect(rect.top).toBeGreaterThanOrEqual(top);
            expect(rect.top + size.height).toBeLessThanOrEqual(bottom);
            expect(
                rect.left + size.width <= x - 12 ||
                    rect.left >= x + 12 ||
                    rect.top + size.height <= y - 12 ||
                    rect.top >= y + 12,
            ).toBe(true);
            expect(rect.arrow).toBeGreaterThanOrEqual(18);
            const horizontal = rect.placement === "above" || rect.placement === "below";
            expect(rect.arrow).toBeLessThanOrEqual((horizontal ? size.width : size.height) - 18);
        }
    }
});

test("a short phone places the bubble beside a central target instead of covering it", () => {
    const viewport = devices[0];
    expect(touchConfirmationLayout({ x: 284, y: 150 }, size, viewport, viewport.safe).placement).toBe("left");
});

test("the bubble leaves creature art above a ground target visible when space below is available", () => {
    const viewport = devices[3];
    const target = { x: 787, y: 567 };
    const rect = touchConfirmationLayout(target, size, viewport, viewport.safe);
    expect(rect.placement).toBe("below");
    expect(rect.top).toBeGreaterThan(target.y);
});
