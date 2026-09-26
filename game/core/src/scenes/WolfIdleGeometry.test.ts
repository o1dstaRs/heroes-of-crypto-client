import { expect, test } from "bun:test";
import { wolfGeometryRegisteredSourcePoint, wolfGeometrySourcePoint } from "./WolfIdleGeometry";

test("Wolf leg registration preserves the authored upper body and head proportions", () => {
    for (let pose = 0; pose < 9; pose++) {
        for (let y = 0; y <= 470; y += 47)
            for (let x = 0; x <= 768; x += 64) expect(wolfGeometryRegisteredSourcePoint(x, y, pose)).toEqual({ x, y });
        const ear = wolfGeometrySourcePoint(520, 80, pose);
        const muzzle = wolfGeometrySourcePoint(590, 210, pose);
        expect(muzzle.x - ear.x).toBe(70);
        expect(muzzle.y - ear.y).toBe(130);
    }
});

test("Wolf planted feet sample the authored foot edges at the baseline floor positions", () => {
    // Independent alpha-contour measurements from the original 768px source frames.
    // The four feet have different floor heights; aligning only the lowest paw is insufficient.
    const baselineFeet = [
        [149, 686],
        [292, 671],
        [454, 698],
        [560, 690],
    ];
    const sourceFootEdges = [
        [682, 667, 696, 684],
        [682, 667, 696, 685],
        [683, 667, 696, 684],
        [684, 667, 696, 686],
        [684, 666, 696, 684],
        [684, 667, 697, 686],
        [684, 667, 698, 687],
        [683, 666, 696, 686],
        [684, 667, 698, 687],
    ];
    for (let pose = 0; pose < 9; pose++)
        for (let foot = 0; foot < baselineFeet.length; foot++) {
            const [x, y] = baselineFeet[foot];
            const source = wolfGeometrySourcePoint(x, y, pose);
            // Alpha edges are measured at pixel centers; inverse sampling is continuous.
            expect(Math.abs(source.y - sourceFootEdges[pose][foot])).toBeLessThan(1);
        }
});

test("Wolf leg sampling stays ordered and does not fold between paws or outside the silhouette", () => {
    let minimumHorizontalStep = Infinity;
    let minimumJacobian = Infinity;
    const step = 0.25;
    for (let pose = 0; pose < 9; pose++)
        for (let y = 468; y <= 720; y += 4)
            for (let x = 48; x <= 704; x += 4) {
                const origin = wolfGeometrySourcePoint(x, y, pose);
                const horizontal = wolfGeometrySourcePoint(x + step, y, pose);
                const vertical = wolfGeometrySourcePoint(x, y + step, pose);
                const dx = horizontal.x - origin.x;
                minimumHorizontalStep = Math.min(minimumHorizontalStep, dx / step);
                minimumJacobian = Math.min(
                    minimumJacobian,
                    (dx * (vertical.y - origin.y) - (vertical.x - origin.x) * (horizontal.y - origin.y)) /
                        (step * step),
                );
            }
    expect(Number.isFinite(minimumHorizontalStep)).toBe(true);
    expect(Number.isFinite(minimumJacobian)).toBe(true);
    expect(minimumHorizontalStep).toBeGreaterThan(0.2);
    expect(minimumJacobian).toBeGreaterThan(0.2);
});

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
