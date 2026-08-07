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

    test("fires at the initiating hit in sandbox and ranked replay", () => {
        const source = sandboxSource();
        const live = sliceFrom(source, "private async executeAttackSequence(", 25_000);
        const replay = sliceFrom(source, "private async playReplayAttackRecord(", 12_000);

        expect(live).toContain("this.popDullingDefenseApplications(attackActionEvents, attacker.getId())");
        expect(replay).toContain("this.popDullingDefenseApplications(record.events, attacker.getId())");
    });

    test("fires on the responder only when the response impact is replayed", () => {
        const response = sliceFrom(sandboxSource(), "private async playReplayRetaliation(", 5_000);

        expect(response).toContain("this.popDullingDefenseApplications(record.events, target.getId())");
        expect(response.indexOf("showFloatingDamage")).toBeLessThan(response.indexOf("popDullingDefenseApplications"));
    });
});
