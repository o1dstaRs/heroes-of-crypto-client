import { expect, test } from "bun:test";
import { WOLF_HEAD_FRAMES, wolfHeadSourcePoint } from "./WolfIdleHeadGeometry";

test("Wolf neutral head registers its eye, nose and both ear tips to the source art", () => {
    // Independent landmarks measured on the base and first authored pose.
    // Source Y coordinates include the existing rib-cage registration.
    const landmarks = [
        [651, 258, 623, 260],
        [715, 315, 694, 312.826087],
        [611, 142, 577, 157],
        [675, 152, 645, 161],
    ];
    for (const [x, y, sourceX, sourceY] of landmarks) {
        const actual = wolfHeadSourcePoint(x, y, 0);
        expect(Math.hypot(actual.x - sourceX, actual.y - sourceY)).toBeLessThan(0.1);
    }
});

test("Wolf eye registration follows all nine authored poses without drifting", () => {
    const sourceEyes = [
        [623, 260],
        [621, 255],
        [621, 223],
        [621, 184],
        [602, 164],
        [578, 138],
        [555, 119],
        [554, 103],
        [554, 96],
    ];
    for (let pose = 0; pose < sourceEyes.length; pose++) {
        const [x, y] = WOLF_HEAD_FRAMES[pose];
        const [sourceX, sourceY] = sourceEyes[pose];
        const actual = wolfHeadSourcePoint(x, y, pose);
        expect(Math.hypot(actual.x - sourceX, actual.y - sourceY)).toBeLessThan(0.1);
    }
});

test("Wolf head registration leaves the torso, tail and planted lower body untouched", () => {
    for (let pose = 0; pose < 9; pose++) {
        for (let y = 300; y <= 460; y += 20)
            for (let x = 160; x <= 350; x += 19) expect(wolfHeadSourcePoint(x, y, pose)).toEqual({ x, y });
        for (let y = 460; y <= 720; y += 20)
            for (let x = 0; x <= 768; x += 32) expect(wolfHeadSourcePoint(x, y, pose)).toEqual({ x, y });
        for (const [x, y] of [
            [160, 355],
            [110, 420],
            [70, 510],
            [30, 600],
        ])
            expect(wolfHeadSourcePoint(x, y, pose)).toEqual({ x, y });
    }
});

test("Wolf head registration has no folds or discontinuities through the head and blend boundaries", () => {
    let minimumJacobian = Infinity;
    let largestJump = 0;
    const step = 0.25;
    for (let pose = 0; pose < 9; pose++)
        for (let y = 0; y <= 488; y += 8)
            for (let x = 320; x <= 768; x += 8) {
                const origin = wolfHeadSourcePoint(x, y, pose);
                const horizontal = wolfHeadSourcePoint(x + step, y, pose);
                const vertical = wolfHeadSourcePoint(x, y + step, pose);
                const jacobian =
                    ((horizontal.x - origin.x) * (vertical.y - origin.y) -
                        (vertical.x - origin.x) * (horizontal.y - origin.y)) /
                    (step * step);
                minimumJacobian = Math.min(minimumJacobian, jacobian);
                largestJump = Math.max(
                    largestJump,
                    Math.hypot(horizontal.x - origin.x, horizontal.y - origin.y),
                    Math.hypot(vertical.x - origin.x, vertical.y - origin.y),
                );
            }
    expect(Number.isFinite(minimumJacobian)).toBe(true);
    expect(Number.isFinite(largestJump)).toBe(true);
    expect(minimumJacobian).toBeGreaterThan(0.1);
    expect(largestJump).toBeLessThan(1);
});
