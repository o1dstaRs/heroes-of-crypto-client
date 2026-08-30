import { describe, expect, it } from "bun:test";

import { shouldShowSystemMenuLabel, SYSTEM_MENU_ITEM_OFFSETS } from "./systemControlsMode";

describe("system controls label visibility", () => {
    it("hides the master hint immediately when the fan opens", () => {
        expect(shouldShowSystemMenuLabel(false, "System controls")).toBe(true);
        expect(shouldShowSystemMenuLabel(true, "System controls")).toBe(false);
    });

    it("keeps child-button hints available while the fan is open", () => {
        expect(shouldShowSystemMenuLabel(true, "Friends")).toBe(true);
        expect(shouldShowSystemMenuLabel(true, undefined)).toBe(false);
    });
});

describe("system controls fan geometry", () => {
    const master = { left: 0, right: 54, top: 0, bottom: 54 };
    const childRect = ({ x, y }: Readonly<{ x: number; y: number }>) => ({
        // The child starts 8px from the same right edge as the master. A negative CSS X translation
        // moves it left, which increases this right-edge-relative coordinate.
        left: 8 - x,
        right: 42 - x,
        top: 8 + y,
        bottom: 42 + y,
    });
    const overlaps = (
        left: Readonly<{ left: number; right: number; top: number; bottom: number }>,
        right: Readonly<{ left: number; right: number; top: number; bottom: number }>,
    ): boolean =>
        left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;

    it("keeps every opened child clear of the master medallion and its siblings", () => {
        const children = Object.values(SYSTEM_MENU_ITEM_OFFSETS).map(childRect);
        for (const child of children) {
            expect(overlaps(child, master)).toBe(false);
        }
        for (let left = 0; left < children.length; left += 1) {
            for (let right = left + 1; right < children.length; right += 1) {
                expect(overlaps(children[left], children[right])).toBe(false);
            }
        }
    });

    it("opens the three controls on one aligned row", () => {
        const centers = Object.values(SYSTEM_MENU_ITEM_OFFSETS).map(({ y }) => 8 + y + 17);
        expect(new Set(centers).size).toBe(1);
    });
});
