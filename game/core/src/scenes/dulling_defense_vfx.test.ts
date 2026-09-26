import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FIGHT_EVENT_VFX } from "./fight_vfx_catalog";

const sandboxSource = (): string => readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");

const sliceFrom = (source: string, anchor: string, length: number): string => {
    const start = source.indexOf(anchor);
    expect(start).toBeGreaterThan(-1);
    return source.slice(start, start + length);
};

describe("Dulling Defense VFX wiring", () => {
    test("is driven by authoritative effect applications", () => {
        expect(FIGHT_EVENT_VFX.effects_applied.rendered).toBe(true);
        expect(FIGHT_EVENT_VFX.effects_applied.ranked).toBe("replay");
        expect(FIGHT_EVENT_VFX.effects_applied.note).toContain("Dulling Defense");
        expect(FIGHT_EVENT_VFX.effects_applied.note).toContain("impact");
    });

    test("pops whoever the action dulled, at the strike and again for anyone the exchange did not draw", () => {
        const source = sandboxSource();

        expect(source).toContain("this.popRecordedDullingDefense(");
        expect(source).toContain("new Set([strike.attackerId, strike.targetId])");
        expect(source).not.toContain("popDullingDefenseApplications(attackActionEvents, target.getId())");
        expect(source).not.toContain("popDullingDefenseApplications(record.events, target.getId())");
    });

    test("still shows the icon when the dulled stack is already dead", () => {
        const source = sandboxSource();
        const pop = sliceFrom(source, "protected popDullingDefenseApplications(", 700);

        expect(pop).not.toContain("unit.isDead()");
    });

    test("the ability card prints the flat attack loss, not a stack-and-luck count", () => {
        for (const file of ["RenderableUnit.ts", "LevelOneRenderableUnit.ts"]) {
            const source = readFileSync(join(import.meta.dir, file), "utf8");
            const block = sliceFrom(source, "Dulling Defense removes a flat amount", 450);

            expect(block).toContain("getPower()");
            expect(block).not.toContain("calculateAbilityCount");
        }
    });
});
