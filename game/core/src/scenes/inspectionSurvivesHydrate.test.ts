import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A shift-selected stack must still be open after the board rebuilds.
 *
 * `hydrateSceneState` tears the board down and recreates every RenderableUnit, clearing currentShiftedUnit
 * on the way. In live play a full hydrate is occasional, so the loss is rarely noticed; a REPLAY hydrates
 * TWICE per replayed action (previousState, then stateAfter), so an inspection survived at most one action
 * before the sidebar snapped back to whoever was acting — which is what "replay doesn't let me click units
 * to see them" looked like.
 *
 * The fix is two ORDERINGS, and those are what this pins. A behavioural test would need a live Pixi scene:
 * hydrateSceneState builds real sprites, which is precisely why nothing covered this before.
 */
describe("inspection survives a scene hydrate", () => {
    const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
    const hydrate = source.slice(
        source.indexOf("protected hydrateSceneState(snapshot: SandboxSceneState): void {"),
        source.indexOf("private restoreInspectedUnit("),
    );

    test("the inspected unit is captured BEFORE the teardown clears it", () => {
        const capture = hydrate.indexOf("const inspectedUnitId = this.currentShiftedUnit?.getId()");
        const clear = hydrate.indexOf("this.currentShiftedUnit = undefined;");
        expect(capture).toBeGreaterThanOrEqual(0);
        expect(clear).toBeGreaterThan(capture);
    });

    test("it is restored AFTER activation, which would otherwise claim the sidebar", () => {
        // handleNextUnitActivation pushes the ACTING unit's card in; restoring before it would be undone,
        // and its own "never override a shift-select" guard cannot help because the teardown already
        // cleared currentShiftedUnit.
        const activation = hydrate.indexOf("this.handleNextUnitActivation(activeUnit)");
        const restore = hydrate.indexOf("this.restoreInspectedUnit(inspectedUnitId)");
        expect(activation).toBeGreaterThanOrEqual(0);
        expect(restore).toBeGreaterThan(activation);
    });

    test("restoring re-opens the card and the board ring on the REBUILT instance", () => {
        const restore = source.slice(
            source.indexOf("private restoreInspectedUnit("),
            source.indexOf("private restoreInspectedUnit(") + 1200,
        );
        // Looked up by id: the object the player clicked was destroyed by the rebuild.
        expect(restore).toContain("this.unitsHolder.getAllUnits().get(inspectedUnitId)");
        expect(restore).toContain("setBoardSelected(true)");
        expect(restore).toContain("this.setSelectedUnitProperties(props)");
        // A stack that died during the replayed action has nothing to show.
        expect(restore).toContain("unit.isDead()");
    });
});
