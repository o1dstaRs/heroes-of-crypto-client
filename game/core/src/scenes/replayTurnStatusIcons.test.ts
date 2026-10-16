import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The hourglass and stun badges in a REPLAY.
 *
 * A replay never runs the live snapshot path: it turns each snapshot into a SandboxSceneState and hydrates
 * it, which destroys and rebuilds every unit. Three things the icons need therefore have to travel inside
 * that state, because a rebuilt unit cannot derive them:
 *   - `onHourglass`  — the wait flag (the engine sets it live in sandbox; nothing sets it on a rebuild),
 *   - `skipping`     — Stun/Blindness are EFFECTS, and effects are neither on the ranked wire nor rebuilt
 *                      from a unit's properties, so the stun badge could never light up in a replay,
 *   - `upNext`       — a hydrate resets FightStateManager, so the strip kept the queue it was last given.
 *
 * Behavioural coverage of the badges themselves lives in RenderableUnit.test.ts (which drives setSkipping /
 * setOnHourglass and asserts the sprites). What can't be exercised there is the plumbing inside
 * hydrateSceneState/captureSceneState: both build real Pixi sprites, so this pins the wiring at the source
 * level, in the same spirit as inspectionSurvivesHydrate.test.ts.
 */
describe("replay turn-status icons", () => {
    const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
    const sliceBetween = (from: string, to: string): string => {
        const start = source.indexOf(from);
        expect(start).toBeGreaterThanOrEqual(0);
        const end = source.indexOf(to, start);
        expect(end).toBeGreaterThan(start);
        return source.slice(start, end);
    };
    const rebuildUnit = sliceBetween("private createRenderableUnitFromSceneState(", "private captureSceneState(");
    const capture = sliceBetween("private captureSceneState(", "public override getCurrentSandboxReplay(");
    const hydrate = sliceBetween(
        "protected hydrateSceneState(snapshot: SandboxSceneState): void {",
        "private restoreInspectedUnit(",
    );

    test("a rebuilt unit is given back both flags", () => {
        expect(rebuildUnit).toContain("setOnHourglass(unitState.onHourglass ?? false)");
        expect(rebuildUnit).toContain("setSkipping(unitState.skipping ?? false)");
    });

    test("the capture records what a rebuild cannot recompute", () => {
        // Effects and FightProperties are both gone after a hydrate, so a sandbox replay needs all three.
        expect(capture).toContain("onHourglass: unit.isOnHourglass()");
        expect(capture).toContain("skipping: Sandbox.skippingForDisplay(unit)");
        expect(capture).toContain("hasHourglassed: fightProps.hasAlreadyHourglass(unit.getId())");
        expect(capture).toContain("upNext: [...fightProps.getUpNextQueueIterable()]");
    });

    test("the hydrate restores the queue AFTER the reset that empties it, and before the activation that reads it", () => {
        const reset = hydrate.indexOf("FightStateManager.getInstance().reset()");
        const restore = hydrate.indexOf("this.applySceneStateUpNext(snapshot.upNext)");
        const activation = hydrate.indexOf("this.handleNextUnitActivation(activeUnit)");
        expect(reset).toBeGreaterThanOrEqual(0);
        expect(restore).toBeGreaterThan(reset);
        expect(activation).toBeGreaterThan(restore);
    });

    test("the Up Next strip asks for the DISPLAYED skip state, not the effect-only one", () => {
        // In ranked (live and replay) the Stun effect never reaches the client, so isSkippingThisTurn() is
        // always false there and the queue's stun marker stayed dark whatever the board showed.
        const upNextEntries = sliceBetween("private handleNextUnitActivation(", "private updateLiveFightStats(");
        expect(upNextEntries).not.toContain("isSkipping: unitNext.isSkippingThisTurn()");
        expect(upNextEntries).not.toContain("isSkipping: nextUnit.isSkippingThisTurn()");
        expect(upNextEntries).toContain("isSkipping: Sandbox.skippingForDisplay(unitNext)");
        expect(upNextEntries).toContain("isSkipping: Sandbox.skippingForDisplay(nextUnit)");
    });

    test("the display helper tolerates a unit the ENGINE summoned (a plain Unit, no badges yet)", () => {
        const helper = sliceBetween("private static skippingForDisplay(", "protected applySceneStateUpNext(");
        expect(helper).toContain('typeof renderable.isSkippingDisplayed === "function"');
        expect(helper).toContain("unit.isSkippingThisTurn()");
    });

    test("ranked extends the queue restore to its own authoritative copy", () => {
        // Ranked overrides getUpNextUnitIds(), so restoring only FightProperties would leave the strip stale.
        const ranked = readFileSync(join(import.meta.dir, "RankedPlayScene.ts"), "utf8");
        expect(ranked).toContain("protected override applySceneStateUpNext(");
        expect(ranked).toContain("this.upNextUnitIds = [...upNext]");
    });
});
