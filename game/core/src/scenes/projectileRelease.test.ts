import { describe, expect, test } from "bun:test";

import { keepProjectileReleaseBehindTarget } from "./RenderableUnit";

// Measured in a live sandbox: an Arbalester's raised crossbow tip and a Squire two rows straight above it.
const body = { x: -513, y: 857 };
const raisedTip = { x: -400, y: 969 };
const slack = 12.8;

describe("projectile release point", () => {
    test("a target clear of the weapon keeps the painted release", () => {
        const twoCellsAhead = { x: -293, y: 858 };
        expect(keepProjectileReleaseBehindTarget(raisedTip, body, twoCellsAhead, slack)).toEqual(raisedTip);
    });

    test("a target close above slides the release back along the weapon until the shot no longer flies backwards", () => {
        const above = { x: -498, y: 1140 };
        const release = keepProjectileReleaseBehindTarget(raisedTip, body, above, slack);
        // At most `slack` behind the target, and still on the line from the body to the crossbow tip.
        expect(release.x).toBeCloseTo(above.x + slack, 6);
        const share = (release.x - body.x) / (raisedTip.x - body.x);
        expect(release.y).toBeCloseTo(body.y + (raisedTip.y - body.y) * share, 6);
    });

    test("a target behind the shooter's own body releases from the body", () => {
        expect(keepProjectileReleaseBehindTarget(raisedTip, body, { x: -560, y: 1140 }, slack)).toEqual(body);
    });

    test("a slight lean within the slack, as from a bow held close, is left alone", () => {
        const bow = { x: -491, y: 917 };
        expect(keepProjectileReleaseBehindTarget(bow, body, { x: -498, y: 1140 }, slack)).toEqual(bow);
    });

    test("a shooter facing left is handled the same way", () => {
        const mirror = (point: { x: number; y: number }) => ({ x: -point.x, y: point.y });
        const release = keepProjectileReleaseBehindTarget(
            mirror(raisedTip),
            mirror(body),
            mirror({ x: -498, y: 1140 }),
            slack,
        );
        expect(release.x).toBeCloseTo(498 - slack, 6);
    });

    test("a release at the body has nothing to slide", () => {
        expect(keepProjectileReleaseBehindTarget(body, body, { x: -600, y: 0 }, slack)).toEqual(body);
    });
});
