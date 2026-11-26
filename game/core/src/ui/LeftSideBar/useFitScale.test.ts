import { expect, test } from "bun:test";

import { sameFit } from "./useFitScale";

const fits = (naturalHeight: number) => ({ scale: 1, scrollable: false, naturalHeight });
const scrolls = (naturalHeight: number) => ({ scale: 0.6, scrollable: true, naturalHeight });

test("content that still fits does not re-render the sidebar when only its natural height moves", () => {
    expect(sameFit(fits(420), fits(512))).toBe(true);
    expect(sameFit(fits(420), { scale: 0.92, scrollable: false, naturalHeight: 512 })).toBe(false);
    expect(
        sameFit(
            { scale: 0.92, scrollable: false, naturalHeight: 600 },
            { scale: 0.925, scrollable: false, naturalHeight: 640 },
        ),
    ).toBe(true);
});

test("a scrolling block still follows its natural height, and entering or leaving scroll mode always updates", () => {
    expect(sameFit(scrolls(900), scrolls(901))).toBe(true);
    expect(sameFit(scrolls(900), scrolls(960))).toBe(false);
    expect(sameFit(fits(700), scrolls(700))).toBe(false);
    expect(sameFit(scrolls(700), fits(700))).toBe(false);
});
