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

/**
 * A melee click strikes the unit the cursor promised — never a different one.
 *
 * The click used to derive its own target with getUnitSpriteAtPosition, which returns the FRONTMOST
 * overlapping sprite and excludes only the acting unit. Creature art reaches well past the ground a unit
 * holds (about a cell and a half up, ~1.7 cells wide for the wide portraits), so a third creature's
 * sprite could win the pick over the enemy actually standing in the clicked cell. That produced two
 * reports from one cause, both intermittent and both invisible:
 *
 *   - the mis-picked unit was NOT adjacent, so the guard below refused the attack-from cell and returned
 *     with no strike, no message and no request — "cursor showed but the click did nothing";
 *   - the mis-picked unit WAS adjacent, so the attack went through against the wrong enemy — clicking a
 *     Crusader and hitting a Troglodyte (test server game 40a72b86, where the server logged the melee
 *     action against the wrong target id and accepted it, because the client had sent exactly that).
 *
 * Source-contract rather than a render test for the reason the sibling pointer specs are: this repo has
 * no DOM/GL harness, and the regression is a refactor quietly re-deriving the target.
 */
const sandboxSource = (): string => readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");

const clickAttackBlock = (source: string): string => {
    const start = source.indexOf("const pointerMeleeAttack = this.resolveUnitMeleeAttack(p);");
    expect(start).toBeGreaterThan(-1);
    // Wide enough to reach past the target pick and the reachability guard that follows it.
    return source.slice(start, start + 8000);
};

describe("melee click acts on the target the cursor promised", () => {
    test("the click takes the resolve's own target, ahead of any sprite hit-test", () => {
        const block = clickAttackBlock(sandboxSource());
        const code = block
            .split("\n")
            .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
            .join("\n");

        const resolved = code.indexOf("pointerMeleeAttack?.target");
        const spriteHit = code.indexOf("this.getUnitSpriteAtPosition(p, this.currentActiveUnit.getId())");
        const occupancy = code.indexOf("this.unitsHolder.getAllUnits().get(occupantId)");

        // All three still exist — the sprite/occupancy pick remains the fallback for ranged and for
        // bodies outside the melee target set.
        expect(resolved).toBeGreaterThan(-1);
        expect(spriteHit).toBeGreaterThan(-1);
        expect(occupancy).toBeGreaterThan(-1);
        // ...but the engine-validated resolve is consulted FIRST.
        expect(resolved).toBeLessThan(spriteHit);
        expect(spriteHit).toBeLessThan(occupancy);
    });

    test("the reachability guard reports itself instead of dropping the click in silence", () => {
        const block = clickAttackBlock(sandboxSource());
        const guard = block.slice(block.indexOf("!this.grid.areCellsAdjacent("));
        const abort = guard.indexOf("return;");
        expect(abort).toBeGreaterThan(-1);

        // Whatever else the guard does, it must say something before abandoning the player's click.
        const beforeAbort = guard.slice(0, abort);
        expect(beforeAbort).toContain("console.warn");
        expect(beforeAbort).toContain("[melee]");
    });

    test("the resolve still feeds the attack-from cell, so cursor and click share one landing", () => {
        const block = clickAttackBlock(sandboxSource());
        expect(block).toContain("this.hoverManager.hoverAttackFromCell = pointerMeleeAttack.attackFrom;");
    });
});
