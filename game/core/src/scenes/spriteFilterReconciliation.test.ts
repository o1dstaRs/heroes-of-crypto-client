import { describe, expect, test } from "bun:test";

import { reconcileManagedSpriteFilters } from "./RenderableUnit";

describe("managed creature sprite filters", () => {
    const alpha = { name: "alpha" };
    const contour = { name: "contour" };
    const desaturate = { name: "desaturate" };
    const motion = { name: "motion" };

    test("allocates nothing when the installed identities and order already match", () => {
        expect(
            reconcileManagedSpriteFilters(
                [alpha, contour, motion, desaturate],
                undefined,
                alpha,
                contour,
                desaturate,
                alpha,
                contour,
                true,
            ),
        ).toBeUndefined();
    });

    test("replaces changed managed filters while preserving unmanaged filters", () => {
        const nextContour = { name: "next-contour" };
        expect(
            reconcileManagedSpriteFilters(
                [alpha, contour, motion, desaturate],
                undefined,
                alpha,
                contour,
                desaturate,
                alpha,
                nextContour,
                true,
            ),
        ).toEqual([alpha, nextContour, motion, desaturate]);
    });

    test("removes retired managed filters without disturbing an external filter", () => {
        expect(
            reconcileManagedSpriteFilters(
                [alpha, contour, motion, desaturate],
                undefined,
                alpha,
                contour,
                desaturate,
                undefined,
                undefined,
                false,
            ),
        ).toEqual([motion]);
    });
});
