/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { GridMath } from "@heroesofcrypto/common";

import { optimalRangeTargetEdge } from "./rangeTargetEdges";

/**
 * The projectile must fly the line the hover drew.
 *
 * Both the hover arrow and the shot pick their target edge with optimalRangeTargetEdge, whose tie-break
 * is "edge-centre nearest the FIRING POINT". So the two agree only while they are handed the same firing
 * point. The hover uses the landing cell (attackFromPos — where the shooter will stand when it fires);
 * the shot used attacker.getPosition(), which is where the shooter stands *now*. For a shot taken on the
 * spot those coincide, which is why this looked fine most of the time — but a shooter that walks before
 * firing resolves the two against different points, and whenever two edges retain the same damage the
 * tie-break then picks a different edge for the projectile than the arrow promised.
 */
describe("the firing point decides the edge", () => {
    // The candidate carries the exterior edge it came from (cell + side); neither participates in the
    // choice — damage retention and the distance to aimPosition do — so they are filled in consistently
    // with the aim point and left alone.
    const edge = (id: string, x: number, y: number, rangeDivisor = 1) => ({
        id,
        rangeDivisor,
        shootable: true,
        aimPosition: { x, y },
        cell: { x: Math.sign(x), y: Math.sign(y) },
        side: x < 0 ? GridMath.RangeAttackCellSide.LEFT : GridMath.RangeAttackCellSide.RIGHT,
    });

    test("two equally-good edges are separated only by which point we measure from", () => {
        // A target with a west and an east edge; damage retention identical, so the tie-break decides.
        const west = edge("west", -100, 0);
        const east = edge("east", 100, 0);

        // Standing to the west (where the shooter is now) picks west...
        expect(optimalRangeTargetEdge([west, east], { x: -500, y: 0 })?.id).toBe("west");
        // ...while firing from the east landing cell picks east. Same candidates, different answer:
        // this is precisely the divergence between the drawn arrow and the flown projectile.
        expect(optimalRangeTargetEdge([west, east], { x: 500, y: 0 })?.id).toBe("east");
    });

    test("damage retention still outranks the firing point", () => {
        // A nearer edge that costs damage must never win over a full-damage one, whichever point we use.
        const near = edge("near-but-halved", -100, 0, 2);
        const far = edge("far-but-full", 100, 0, 1);
        expect(optimalRangeTargetEdge([near, far], { x: -500, y: 0 })?.id).toBe("far-but-full");
    });
});

describe("the shot is aimed from where it is fired", () => {
    const sandboxSource = (): string => readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");

    test("resolveRangeShotAim takes the firing point as an argument, not the live position", () => {
        const source = sandboxSource();
        const start = source.indexOf("private resolveRangeShotAim(");
        expect(start).toBeGreaterThan(-1);
        const fn = source.slice(start, start + 2000);
        const code = fn
            .split("\n")
            .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
            .join("\n");

        expect(code).toContain("firedFrom: HoCMath.XY");
        expect(code).toContain("optimalRangeTargetEdge(this.rangeTargetEdgeVisuals(attacker, target), firedFrom)");
        // The live position is exactly what made the projectile disagree with the arrow.
        expect(code).not.toContain("this.rangeTargetEdgeVisuals(attacker, target), attacker.getPosition()");
    });

    test("the caller hands it the landing cell, through the hover's own transform", () => {
        const source = sandboxSource();
        const call = source.slice(source.indexOf("const aim = this.resolveRangeShotAim("));
        // footprintCenterForAnchor is what the hover uses to turn the landing ANCHOR into a body centre,
        // so a large shooter agrees with its own preview rather than being half a body off.
        expect(call.slice(0, 400)).toContain("this.footprintCenterForAnchor(attacker, attackFrom)");
    });
});
