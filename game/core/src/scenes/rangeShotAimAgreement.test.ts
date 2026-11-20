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

import { Sandbox } from "./Sandbox";

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
// The tie-break itself (damage first, then distance to the firing point) is optimalRangeTargetEdge's, and
// rangeTargetEdges.test.ts covers it. Cell and side do not take part in the choice.
const edge = (id: string, x: number, y: number, rangeDivisor = 1) => ({
    id,
    rangeDivisor,
    shootable: true,
    aimPosition: { x, y },
    cell: { x: Math.sign(x), y: Math.sign(y) },
    side: x < 0 ? GridMath.RangeAttackCellSide.LEFT : GridMath.RangeAttackCellSide.RIGHT,
});

describe("the shot is aimed from where it is fired", () => {
    const shotAim = (edges: ReturnType<typeof edge>[], firedFrom: { x: number; y: number }, doubleShot = false) => {
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            rangeTargetEdgeVisuals: () => edges,
        }) as {
            resolveRangeShotAim(attacker: unknown, target: unknown, firedFrom: { x: number; y: number }): unknown;
        };
        const attacker = {
            hasAbilityActive: (name: string) => doubleShot && name === "Double Shot",
            getPosition: () => ({ x: -500, y: 0 }),
        };
        return scene.resolveRangeShotAim(attacker, {}, firedFrom) as { cell: unknown; position: unknown } | undefined;
    };

    test("resolveRangeShotAim breaks the tie from the firing point it is handed, not the live position", () => {
        const west = edge("west", -100, 0);
        const east = edge("east", 100, 0);
        // The attacker stands west (-500, 0); it fires from the east landing cell.
        expect(shotAim([west, east], { x: 500, y: 0 })?.position).toEqual(east.aimPosition);
        expect(shotAim([west, east], { x: -500, y: 0 })?.position).toEqual(west.aimPosition);
    });

    // A disagreement about WHICH EDGES may be aimed at is silent in a way the firing-point one is not: the
    // fire path finds no edge it accepts, and the click is abandoned with nothing drawn, logged or sent.
    // The hover learned to aim past a screen (a Double Shot's first arrow takes the screen, the second
    // carries on) and the shot did not — so a screened creature showed the bow cursor and a damage forecast
    // while clicking it did nothing at all (owner report 2026-09-19).
    test("a Double Shot fires at the screened edge the cursor offered; a single shot does not", () => {
        const screened = { ...edge("screened", 100, 0), shootable: false };
        expect(shotAim([screened], { x: 500, y: 0 }, true)?.position).toEqual(screened.aimPosition);
        expect(shotAim([screened], { x: 500, y: 0 })).toBeUndefined();
    });

    test("the hover asks the same aim policy, and the caller hands the shot the landing cell", () => {
        // hover() and executeAttackSequence are not drivable in isolation, so these two seams stay pinned
        // against the source (whitespace-insensitive; line breaks are the formatter's business).
        const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        const hoverAim = source.slice(source.indexOf("optimalRangeEdge = optimalRangeTargetEdge(")).replace(/\s/g, "");
        expect(hoverAim.slice(0, hoverAim.indexOf(");"))).toContain(
            "rangeAimOptions(AbilityHelper.hasDoubleShotAbility(this.currentActiveUnit))",
        );
        // footprintCenterForAnchor is what the hover uses to turn the landing ANCHOR into a body centre,
        // so a large shooter agrees with its own preview rather than being half a body off.
        const call = source.slice(source.indexOf("const aim = this.resolveRangeShotAim(")).replace(/\s/g, "");
        expect(call.slice(0, call.indexOf(");"))).toContain("this.footprintCenterForAnchor(attacker,attackFrom)");
    });
});
