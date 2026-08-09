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

describe("Vine Throw snare-save VFX wiring", () => {
    test("the catalog records how the save reaches ranked", () => {
        expect(FIGHT_EVENT_VFX.vine_placed.rendered).toBe(true);
        expect(FIGHT_EVENT_VFX.vine_placed.note).toContain("RESISTED");
    });

    // The save is an outcome-dependent roll. Ranked replays every cast (including the local player's own)
    // and re-applies it locally on a best-effort basis — that re-apply RE-ROLLS the magic-armor save, so a
    // pop driven from it would show the two players different outcomes. Live sandbox pops from its own
    // (authoritative) events; replay pops from the record.
    test("pops from the record in replay and from live events in sandbox", () => {
        const source = sandboxSource();
        const liveHandler = sliceFrom(source, 'case "vine_placed": {', 2_600);
        expect(liveHandler).toContain("!this.replayPlaybackActive");
        expect(liveHandler).toContain("this.showSnareResistedVfx(");

        const replay = sliceFrom(source, "private async playReplayCastSpellAction(", 20_000);
        expect(replay).toContain("this.renderSnareResistVfx(record.events)");
    });

    test("the record renderer only fires for a resisted throw", () => {
        const renderer = sliceFrom(sandboxSource(), "protected renderSnareResistVfx(", 1_200);
        expect(renderer).toContain('event.type !== "vine_placed" || !event.snareResisted');
        expect(renderer).toContain("this.showSnareResistedVfx(");
    });
});
