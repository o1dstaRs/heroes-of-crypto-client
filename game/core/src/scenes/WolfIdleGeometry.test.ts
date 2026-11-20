import { expect, test } from "bun:test";
import { wolfGeometryRegisteredSourcePoint } from "./WolfIdleGeometry";

test("Wolf leg registration stays continuous where it meets the body and across contour bands", () => {
    let largestJump = 0;
    const epsilon = 0.001;
    for (let pose = 0; pose < 9; pose++)
        for (let y = 470; y <= 705; y++)
            for (let x = 64; x <= 656; x += 16) {
                const before = wolfGeometryRegisteredSourcePoint(x, y - epsilon, pose);
                const after = wolfGeometryRegisteredSourcePoint(x, y + epsilon, pose);
                largestJump = Math.max(largestJump, Math.hypot(after.x - before.x, after.y - before.y));
            }
    expect(Number.isFinite(largestJump)).toBe(true);
    expect(largestJump).toBeLessThan(0.015);
});
