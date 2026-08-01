/*
 * What has to be re-derived when a player picks an augment, artifact or synergy.
 *
 * Picking one of these does not merely store a number: refreshUnits re-rolls every stat off it, so the
 * selected unit's stat block moves and — for Movement and Sniper — so does the active unit's reach.
 * None of that reaches the screen on its own. The left sidebar only redraws when
 * sc_unitPropertiesUpdateNeeded is set, and the reachable-cell highlight is otherwise only recomputed
 * when the cursor moves.
 *
 * Regression guard: RankedPlayScene overrides propagateAugmentation to route the pick through the
 * authoritative server, so it never ran the sandbox body — it called refreshUnits and stopped. The
 * numbers changed underneath a sidebar that kept printing the old ones and a highlight that kept its
 * old shape, which is why augments "worked in sandbox but not in ranked". The recipe is one shared
 * method now, and these tests pin what it must do so a future override cannot quietly do half of it.
 */
import { describe, expect, test } from "bun:test";

import { GridConstants, GridSettings } from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

/**
 * The method only ever touches `this`, so a stand-in `this` is a faithful harness — and a far cheaper
 * one than booting a real Pixi scene just to watch five fields change.
 */
const makeScene = (
    overrides: {
        activeUnitPosition?: { x: number; y: number };
        rangeShotDistance?: number;
        selectedUnitId?: string;
        liveProperties?: Record<string, unknown>;
    } = {},
) => {
    const calls: string[] = [];
    const movePathCells: { x: number; y: number }[] = [];
    const hasActiveUnit = overrides.activeUnitPosition !== undefined;
    const scene = {
        refreshUnits: () => calls.push("refreshUnits"),
        unitsHolder: {
            getAllUnits: () =>
                new Map(
                    overrides.selectedUnitId && overrides.liveProperties
                        ? [[overrides.selectedUnitId, { getUnitProperties: () => overrides.liveProperties }]]
                        : [],
                ),
        },
        setSelectedUnitProperties: (properties: unknown) => {
            calls.push("setSelectedUnitProperties");
            scene.published = properties;
        },
        published: undefined as unknown,
        sc_selectedUnitProperties: overrides.selectedUnitId ? { id: overrides.selectedUnitId } : undefined,
        sc_unitPropertiesUpdateNeeded: false,
        sc_currentActiveShotRange: { xy: { x: -1, y: -1 }, distance: -1 } as unknown,
        sc_sceneSettings: { getGridSettings: () => gridSettings },
        currentActiveUnit: hasActiveUnit
            ? {
                  getPosition: () => overrides.activeUnitPosition,
                  getRangeShotDistance: () => overrides.rangeShotDistance ?? 0,
              }
            : undefined,
        updateCurrentMovePath: (cell: { x: number; y: number }) => {
            calls.push("updateCurrentMovePath");
            movePathCells.push(cell);
        },
    };
    return { scene, calls, movePathCells };
};

/** Run the REAL methods against the stand-in, including the private reach helper they delegate to. */
const runRefresh = (scene: object) => {
    const prototype = Sandbox.prototype as unknown as {
        refreshAfterLoadoutChange: () => void;
        refreshActiveUnitReach: () => void;
    };
    (scene as { refreshActiveUnitReach?: () => void }).refreshActiveUnitReach = prototype.refreshActiveUnitReach;
    prototype.refreshAfterLoadoutChange.call(scene);
};

describe("refreshing after an augment, artifact or synergy pick", () => {
    test("re-rolls the stats and tells the sidebar to redraw", () => {
        const { scene, calls } = makeScene();

        runRefresh(scene);

        expect(calls).toContain("refreshUnits");
        // Without this flag PixiGameManager never emits onSelectionCombined and the sidebar keeps its
        // pre-pick values however correct the recomputed stats are.
        expect(scene.sc_unitPropertiesUpdateNeeded).toBe(true);
    });

    test("republishes the SELECTED unit's stats from the live unit, not the stale copy", () => {
        const { scene, calls } = makeScene({
            selectedUnitId: "hero",
            liveProperties: { id: "hero", steps: 7 },
        });

        runRefresh(scene);

        expect(calls).toContain("setSelectedUnitProperties");
        // The scene holds a snapshot of the properties; re-reading the live unit is the whole point,
        // since refreshUnits has just moved the numbers on the unit itself.
        expect(scene.published).toEqual({ id: "hero", steps: 7 });
    });

    test("recomputes the active unit's reachable cells, so a Movement pick shows up at once", () => {
        const position = { x: 100, y: 100 };
        const { scene, calls, movePathCells } = makeScene({ activeUnitPosition: position });

        runRefresh(scene);

        expect(calls).toContain("updateCurrentMovePath");
        expect(movePathCells).toHaveLength(1);
    });

    test("recomputes the shot ring, so a Sniper pick shows up at once", () => {
        const { scene } = makeScene({ activeUnitPosition: { x: 100, y: 100 }, rangeShotDistance: 4 });

        runRefresh(scene);

        expect(scene.sc_currentActiveShotRange).toEqual({
            xy: { x: 100, y: 100 },
            distance: 4 * GridConstants.STEP,
        });
    });

    test("clears the shot ring for a unit that cannot shoot", () => {
        const { scene } = makeScene({ activeUnitPosition: { x: 100, y: 100 }, rangeShotDistance: 0 });

        runRefresh(scene);

        expect(scene.sc_currentActiveShotRange).toBeUndefined();
    });

    test("is a no-op on reach while no unit is active, which is the usual case at placement", () => {
        const { scene, calls } = makeScene();

        runRefresh(scene);

        // Augments are picked with units on the board but nobody's turn running; there is no reach to
        // redraw then, and asking for one would read a position off an undefined unit.
        expect(calls).not.toContain("updateCurrentMovePath");
        expect(scene.sc_unitPropertiesUpdateNeeded).toBe(true);
    });
});
