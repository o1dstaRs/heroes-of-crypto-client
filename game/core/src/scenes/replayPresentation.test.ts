import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What a replay SHOWS beyond the board: the combat log, the fight-stats graph, the turn clock, the
 * journal-driven VFX (armageddon, lap morale, poison) and the buff/debuff pops.
 *
 * None of those can travel inside a SandboxSceneState — they are built from the snapshot's journal tail,
 * damage stats and server clocks. Live play runs them around every snapshot; a replay only ever hydrated
 * scene states, so it played a silent fight: no log (or the engine's unflagged wording), an empty graph, a
 * locally invented countdown, and no armageddon or morale pops at all.
 *
 * The fix keeps each record's whole snapshot beside its scene state and hands it to the ranked scene
 * through two hooks on the replay loop. These pin that wiring at the source, the way
 * replayTurnStatusIcons.test.ts pins the hydrate's: both sides build real Pixi sprites.
 */
describe("replay presentation", () => {
    const sandbox = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
    const ranked = readFileSync(join(import.meta.dir, "RankedPlayScene.ts"), "utf8");
    const runtime = readFileSync(join(import.meta.dir, "..", "ui", "RankedGameViewRuntime.tsx"), "utf8");

    const sliceBetween = (source: string, from: string, to: string): string => {
        const start = source.indexOf(from);
        expect(start).toBeGreaterThanOrEqual(0);
        const end = source.indexOf(to, start);
        expect(end).toBeGreaterThan(start);
        return source.slice(start, end);
    };

    test("the replay loop fires the hooks around the state it lands on", () => {
        const loop = sliceBetween(
            sandbox,
            "public override async playSandboxReplay(",
            "public override async playAuthoritativeActionRecord(",
        );
        const settling = loop.indexOf("this.onReplayRecordSettling(record)");
        const hydrate = loop.indexOf("this.hydrateSceneState(cloneReplayData(record.stateAfter))", settling);
        const presented = loop.indexOf("this.onReplayRecordPresented(record)", hydrate);
        expect(settling).toBeGreaterThanOrEqual(0);
        // Settling runs while the pre-action board still stands (a death with no event of its own has no
        // other moment to be seen); presenting runs once the new state is in.
        expect(hydrate).toBeGreaterThan(settling);
        expect(presented).toBeGreaterThan(hydrate);
    });

    test("a checkpoint record is presented too, so placement-era lines are not lost", () => {
        const loop = sliceBetween(
            sandbox,
            "public override async playSandboxReplay(",
            "public override async playAuthoritativeActionRecord(",
        );
        const checkpoint = loop.indexOf("shouldApplyReplayRecordAsCheckpoint");
        const presentedAtCheckpoint = loop.indexOf("this.onReplayRecordPresented(record)", checkpoint);
        const continued = loop.indexOf("continue;", checkpoint);
        expect(presentedAtCheckpoint).toBeGreaterThan(checkpoint);
        expect(continued).toBeGreaterThan(presentedAtCheckpoint);
    });

    test("ranked presents every live step that is not the board itself", () => {
        const present = sliceBetween(
            ranked,
            "protected override onReplayRecordPresented(",
            "/** Mark FULL fight playback",
        );
        for (const step of [
            "this.processDebuffPops(snapshot)",
            "this.applyAuthoritativeSceneLog(snapshot)",
            "this.renderNewlyAppliedMorale(snapshot)",
            "this.renderNewlyAppliedPoison(snapshot)",
            "this.renderNewlyAppliedArmageddon(snapshot)",
            "this.reconcileAuraEffectsFromSnapshot(snapshot)",
            "this.applyRankedTimer(snapshot)",
            "this.applyRankedFightStats(snapshot, record.stateAfter.units)",
        ]) {
            expect(present).toContain(step);
        }
    });

    test("a death the events never announced is shattered before the rebuild hides it", () => {
        const settling = sliceBetween(
            ranked,
            "protected override onReplayRecordSettling(",
            "protected override onReplayRecordPresented(",
        );
        expect(settling).toContain("this.shatterNewlyDeadUnits(snapshot)");
    });

    test("playback re-baselines the log, stats and VFX high-water marks", () => {
        // Otherwise a replay started from a live fight continues that fight's log and graph.
        const play = sliceBetween(
            ranked,
            "public override async playSandboxReplay(",
            "public override playAuthoritativeActionRecord(",
        );
        expect(play).toContain("this.resetRankedReplayPresentation()");
        // Shared with the snapshot-by-snapshot replay path, which needs exactly the same re-baselining.
        expect(ranked).toContain("private resetRankedReplayPresentation(): void {");
        const fallback = sliceBetween(
            ranked,
            "public override applyAuthoritativeReplaySnapshot(",
            "public override startScene(",
        );
        expect(fallback).toContain("this.resetRankedReplayPresentation()");
    });

    test("the engine text channel is muted only while a journal is there to replace it", () => {
        const play = sliceBetween(
            ranked,
            "public override async playSandboxReplay(",
            "public override playAuthoritativeActionRecord(",
        );
        // A sandbox replay (no snapshots) keeps the engine channel — muting it would leave an empty log.
        expect(play).toContain("replay.actions.some((record) => !!record.authoritativeSnapshot)");
        expect(play).toContain("this.sc_sceneLog.setSuppressed(true)");
        // And it is always put back, whatever the playback did.
        const restore = play.indexOf("this.sc_sceneLog.setSuppressed(wasSceneLogSuppressed)");
        expect(restore).toBeGreaterThan(play.indexOf("} finally {"));
    });

    test("the view hands the replay builder the unnarrowed snapshot", () => {
        expect(runtime).toContain("snapshotToAuthoritative: (playSnapshot) => toSceneSnapshot(playSnapshot)");
    });
});
