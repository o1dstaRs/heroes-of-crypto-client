import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    formatAggrBlockedActionHint,
    isAggrBlockedActionHint,
    isManualAttackBlockedByAggr,
    shouldResolveAggrAfterFirstDoubleShotObstacle,
} from "./aggrBlockedActionHint";

describe("Aggr blocked-action hint", () => {
    const forcedTargetId = "pikeman";

    test.each(["melee", "range", "spell"] as const)("blocks a %s attack resolved onto any other unit", (kind) => {
        expect(isManualAttackBlockedByAggr(forcedTargetId, { kind, resolvedPrimaryTargetId: "squire" })).toBe(true);
        expect(isManualAttackBlockedByAggr(forcedTargetId, { kind, resolvedPrimaryTargetId: forcedTargetId })).toBe(
            false,
        );
        expect(isManualAttackBlockedByAggr(forcedTargetId, { kind })).toBe(true);
    });

    test("uses the ordered resolved primary for area attacks, not any later splash victim", () => {
        expect(
            isManualAttackBlockedByAggr(forcedTargetId, {
                kind: "area",
                resolvedPrimaryTargetId: "squire",
            }),
        ).toBe(true);
        expect(
            isManualAttackBlockedByAggr(forcedTargetId, {
                kind: "area",
                resolvedPrimaryTargetId: forcedTargetId,
            }),
        ).toBe(false);
        expect(isManualAttackBlockedByAggr(forcedTargetId, { kind: "area" })).toBe(false);
    });

    test("blocks mountain attacks while the forced target is alive", () => {
        expect(isManualAttackBlockedByAggr(forcedTargetId, { kind: "obstacle" })).toBe(true);
    });

    test("resolves Aggr after exactly one Double Shot tombstone, while two remain an obstacle action", () => {
        expect(shouldResolveAggrAfterFirstDoubleShotObstacle(1, true, false)).toBe(true);
        expect(shouldResolveAggrAfterFirstDoubleShotObstacle(2, true, false)).toBe(false);
        expect(shouldResolveAggrAfterFirstDoubleShotObstacle(1, false, false)).toBe(false);
        expect(shouldResolveAggrAfterFirstDoubleShotObstacle(1, true, true)).toBe(false);
    });

    test("releases every attack surface when the forced target is dead or gone", () => {
        expect(isManualAttackBlockedByAggr(undefined, { kind: "melee", resolvedPrimaryTargetId: "squire" })).toBe(
            false,
        );
        expect(isManualAttackBlockedByAggr(undefined, { kind: "range", resolvedPrimaryTargetId: "squire" })).toBe(
            false,
        );
        expect(isManualAttackBlockedByAggr(undefined, { kind: "area" })).toBe(false);
        expect(isManualAttackBlockedByAggr(undefined, { kind: "obstacle" })).toBe(false);
    });

    test("names a visible provoker but does not leak a concealed one", () => {
        const hint = formatAggrBlockedActionHint("Pikeman");
        expect(hint).toBe("Aggr — must attack Pikeman");
        expect(formatAggrBlockedActionHint()).toBe("Aggr — must attack the unit that provoked it");
        expect(isAggrBlockedActionHint(hint)).toBe(true);
        expect(isAggrBlockedActionHint("Paralyzed — can't move")).toBe(false);
    });

    // Every attack surface gates the CLICK on Aggr, not just the cursor. The splash throw was the one
    // exception: its hover refused (hint, or no area drawn at all) while attemptAreaThrowAttack had no Aggr
    // check of any kind, and the engine's areaThrowAttack does not re-check the lock — so the throw the
    // cursor had just forbidden simply went out and landed (audit 2026-09-19).
    test("the splash throw gates its click on Aggr, exactly as its siblings do", () => {
        const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        const click = source.slice(
            source.indexOf("private attemptAreaThrowAttack("),
            source.indexOf("private async performAreaThrow("),
        );
        // The primary the engine will price must be the provoker...
        expect(click).toContain('this.isAttackBlockedByAggr(affectedGroups[0]?.[0], "area")');
        // ...and the splash has to cover it at all, which is the extra rule the hover applies.
        expect(click).toContain("this.getLiveAggrForcedTarget()");
        expect(click).toContain("this.showAggrBlockedActionHint(forcedTarget)");
    });
});
