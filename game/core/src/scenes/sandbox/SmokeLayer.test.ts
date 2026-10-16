import { describe, expect, test } from "bun:test";
import { walkDustRotation } from "./SmokeLayer";

describe("shared walking dust orientation", () => {
    test("does not turn the sprite around when the route direction reverses", () => {
        const directions = [
            [1, 0],
            [1, 1],
            [1, -1],
            [0, 1],
        ] as const;

        for (const [x, y] of directions) {
            expect(walkDustRotation(x, y)).toBeCloseTo(walkDustRotation(-x, -y), 10);
        }
    });

    test("keeps horizontal left and right movement in the authored orientation", () => {
        expect(walkDustRotation(1, 0)).toBeCloseTo(0, 10);
        expect(walkDustRotation(-1, 0)).toBeCloseTo(0, 10);
    });
});
