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

    // A splash is judged by everything its blast catches, never by the victim the 3x3 enumerates first: the
    // aimed cell is enumerated LAST, so that first entry is whichever stack stands in the RING. Reading it
    // refused a throw aimed squarely at the provoker for the crime of having a neighbour — and the engine
    // refused it too, so even the AI, which only ever aims at its provoker, lost those turns
    // (common attack_handler, handleRangeAttack's AOE branch; fixed 2026-09-19).
    test("an area attack is judged by its whole blast, not by whichever victim it enumerates first", () => {
        expect(isManualAttackBlockedByAggr(forcedTargetId, { kind: "area", splashTargetIds: ["squire"] })).toBe(true);
        expect(isManualAttackBlockedByAggr(forcedTargetId, { kind: "area", splashTargetIds: [forcedTargetId] })).toBe(
            false,
        );
        // The provoker stands in the blast behind a neighbour the ring enumerates first: still a legal throw.
        expect(
            isManualAttackBlockedByAggr(forcedTargetId, { kind: "area", splashTargetIds: ["squire", forcedTargetId] }),
        ).toBe(false);
        // A blast that catches nobody catches no provoker either.
        expect(isManualAttackBlockedByAggr(forcedTargetId, { kind: "area", splashTargetIds: [] })).toBe(true);
        expect(isManualAttackBlockedByAggr(forcedTargetId, { kind: "area" })).toBe(true);
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
    // check of any kind, so the throw the cursor had just forbidden went out anyway — to be refused by the
    // engine, or on a local board to simply land (audit 2026-09-19).
    test("the splash throw gates its click on Aggr, exactly as its siblings do", () => {
        const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        const click = source.slice(
            source.indexOf("private attemptAreaThrowAttack("),
            source.indexOf("private async performAreaThrow("),
        );
        // The same gate the hover asks, so the cursor and the throw judge one blast the same way.
        expect(click).toContain("this.aggrBlockedSplashTarget(");
        expect(click).toContain("this.showAggrBlockedActionHint(aggrBlockedAreaTarget)");

        const hover = source.slice(
            source.indexOf("private updateAreaThrowHover("),
            source.indexOf("private getAreaThrowCells("),
        );
        expect(hover).toContain("this.aggrBlockedSplashTarget(affectedGroups)");
    });
});
