import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FIGHT_EVENT_VFX } from "./fight_vfx_catalog";

/**
 * The area throw was the LAST replay path still driving its visuals off a local engine re-run instead of
 * the recorded event. That cost two things, and both are what these assertions pin:
 *
 *   - damage is `getRandomInt(min, max)` plus luck/crit rolls, so each client re-rolled its own numbers.
 *     The figures on screen were not the damage the server dealt and the two players disagreed. Every
 *     other replay path (attack, cast, obstacle) renders from `record.events` for exactly this reason.
 *   - a re-apply the engine REJECTS — `unit_already_acted` once a snapshot has synced the actor,
 *     `fight_finished`, spent shots — returned early and swallowed the whole action: no numbers, no
 *     deaths, and none of the events riding along with it (turn advance, lap flip, Armageddon, narrowing).
 *
 * Read from the SOURCE, in the style of magic_mirror_vfx.test.ts: the failure mode here is a later edit
 * quietly dropping the wiring while the helper and the prose stay put, which a behavioural test of the
 * pure helpers would not catch.
 */
const sandboxSource = (): string => readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");

const sliceFrom = (source: string, anchor: string, length: number): string => {
    const start = source.indexOf(anchor);
    expect(start).toBeGreaterThan(-1);
    return source.slice(start, start + length);
};

const areaThrowSource = (): string => {
    const source = sandboxSource();
    const start = source.indexOf("private async performAreaThrow(");
    const end = source.indexOf("\n    protected renderIncomingThreatPreview(", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
};

describe("area throw replay reads the authoritative record", () => {
    test("the replay dispatcher hands down the whole record, not just the action", () => {
        const source = sandboxSource();

        // Without the record there is nothing authoritative to read — this is the wiring that broke.
        expect(source).toContain("return this.playReplayAreaThrowAction(record);");
        expect(source).toContain(
            'private async playReplayAreaThrowAction(record: SandboxReplay["actions"][number]): Promise<boolean>',
        );
        expect(sliceFrom(source, "private async playReplayAreaThrowAction(", 1400)).toContain(
            "this.performAreaThrow(unit, action.targetCell, cellPosition, record)",
        );
    });

    test("performAreaThrow prefers the recorded area_attacked over its own re-roll", () => {
        const body = areaThrowSource();

        expect(body).toContain('replayRecord?: SandboxReplay["actions"][number]');
        expect(body).toContain("findAreaEvent(replayRecord.events)");
        // The record first, the local re-run only as the fallback (sandbox live play has no record).
        expect(body).toContain("recordedAreaEvent ?? findAreaEvent(result.events)");
    });

    test("a rejected re-apply still lands the recorded events", () => {
        const body = areaThrowSource();

        // Both exits matter: the one that draws nothing (no recorded event either) and the one that drew
        // the recorded numbers but never mutated local state.
        expect(body.match(/this\.applyReplayEvents\(replayRecord\.events\)/g) ?? []).toHaveLength(2);
        // The local events are applied ONLY when the local engine actually completed, so the two paths
        // can never both run and double-advance the turn.
        expect(body).toContain("if (result.completed) {");
        expect(body).toContain("this.applyTurnEngineEvents(result.events, unitSnapshot);");
    });

    test("area_attacked is still classified as a replay-routed event", () => {
        // If this ever flips to snapshot-diff/none the wiring above is moot — the catalog is the contract.
        expect(FIGHT_EVENT_VFX.area_attacked.ranked).toBe("replay");
    });
});
