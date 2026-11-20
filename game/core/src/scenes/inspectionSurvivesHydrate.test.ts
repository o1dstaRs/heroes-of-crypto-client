import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FightStateManager, Grid, GridSettings, GridVals, TeamVals, type UnitProperties } from "@heroesofcrypto/common";

import { Sandbox, type SandboxSceneState } from "./Sandbox";

/**
 * A shift-selected stack must still be open after the board rebuilds.
 *
 * `hydrateSceneState` tears the board down and recreates every RenderableUnit, clearing currentShiftedUnit
 * on the way. In live play a full hydrate is occasional, so the loss is rarely noticed; a REPLAY hydrates
 * TWICE per replayed action (previousState, then stateAfter), so an inspection survived at most one action
 * before the sidebar snapped back to whoever was acting — which is what "replay doesn't let me click units
 * to see them" looked like.
 *
 * Board rendering is stubbed; the hydrate itself, its teardown and the activation/restore order are real.
 */
const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
const originalFight = FightStateManager.getInstance().getFightProperties();
beforeEach(() => FightStateManager.getInstance().reset());
afterEach(() => FightStateManager.getInstance().setFightProperties(originalFight));

interface FakeUnit {
    getId(): string;
    isDead(): boolean;
    selected: boolean;
    setBoardSelected(selected: boolean): void;
    getUnitProperties(): UnitProperties;
    setActiveTurn(): void;
    setBoardFacing(): void;
}

const fixture = () => {
    const units = new Map<string, FakeUnit>();
    const sidebar: string[] = [];
    const build = (id: string, dead: boolean): FakeUnit => ({
        getId: () => id,
        isDead: () => dead,
        selected: false,
        setBoardSelected(selected: boolean) {
            this.selected = selected;
        },
        getUnitProperties: () => ({ id }) as UnitProperties,
        setActiveTurn: () => {},
        setBoardFacing: () => {},
    });
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        grid: new Grid(settings, GridVals.NORMAL),
        sc_sceneSettings: { getGridSettings: () => settings },
        unitsHolder: {
            getAllUnits: () => units,
            addUnit: (unit: FakeUnit) => units.set(unit.getId(), unit),
            refreshStackPowerForAllUnits: () => {},
        },
        createRenderableUnitFromSceneState: (state: SandboxSceneState["units"][number]) =>
            build(state.properties.id, state.dead),
        destroySpecificUnits: (destroyed: FakeUnit[]) => destroyed.forEach((unit) => units.delete(unit.getId())),
        // Activation pushes the ACTING unit's card into the sidebar, as it does in play.
        handleNextUnitActivation: (unit: FakeUnit) => scene.setSelectedUnitProperties(unit.getUnitProperties()),
        setSelectedUnitProperties: (props: UnitProperties) => sidebar.push(props.id),
        placementManager: { rebuildFromFightProps: () => {} },
        dungeonVisuals: { setCenterDried: () => {}, clearHoleLayers: () => {} },
        hoverManager: { clear: () => {} },
        combatVisuals: { clear: () => {} },
        rangedProjectiles: { clear: () => {} },
        drawer: { getUnitsContainer: () => undefined },
        drawnNarrowingLaps: new Set(),
        revealedOpponentUnitIds: new Set(),
        layoutVersion: 0,
        cancelBarrelPlacement: () => {},
        pruneRebuiltWaterShields: () => {},
        clearPlacementBench: () => {},
        renderNarrowingLayers: () => {},
        refreshUnits: () => {},
        refreshVisibleStateIfNeeded: () => {},
        updateUnitsOverlayVisibility: () => {},
        destroyTempFixtures: () => {},
        updateDungeonAtmosphere: () => {},
        fightStatsTracker: { start: () => {} },
        updateLiveFightStats: () => {},
    });
    const unitState = (id: string, dead = false) => ({
        properties: { id, amount_alive: dead ? 0 : 10 } as UnitProperties,
        team: TeamVals.LEFT,
        placed: false,
        dead,
        cells: [],
        baseCell: { x: 0, y: 0 },
    });
    const state = (inspectedDead = false): SandboxSceneState => ({
        units: [unitState("acting"), unitState("inspected", inspectedDead)],
        gridType: GridVals.NORMAL,
        currentLap: 1,
        fightStarted: true,
        fightFinished: false,
        currentUnitId: "acting",
    });
    return { scene, units, sidebar, state };
};

describe("inspection survives a scene hydrate", () => {
    test("the inspected stack's card and board ring re-open on the REBUILT instance, after activation", () => {
        const { scene, units, sidebar, state } = fixture();
        scene.hydrateSceneState(state());
        const clicked = units.get("inspected");
        scene.currentShiftedUnit = clicked;
        sidebar.length = 0;

        scene.hydrateSceneState(state());

        const rebuilt = units.get("inspected")!;
        // Looked up by id: the object the player clicked was destroyed by the rebuild.
        expect(rebuilt).not.toBe(clicked);
        expect(scene.currentShiftedUnit).toBe(rebuilt);
        expect(scene.selectedBoardUnit).toBe(rebuilt);
        expect(rebuilt.selected).toBe(true);
        // Activation claims the sidebar first; the restored inspection has the last word.
        expect(sidebar).toEqual(["acting", "inspected"]);
        expect(scene.sc_selectedUnitProperties.id).toBe("inspected");
    });

    test("a stack that died during the replayed action has nothing to re-open", () => {
        const { scene, units, sidebar, state } = fixture();
        scene.hydrateSceneState(state());
        scene.currentShiftedUnit = units.get("inspected");
        sidebar.length = 0;

        scene.hydrateSceneState(state(true));

        expect(scene.currentShiftedUnit).toBeUndefined();
        expect(units.get("inspected")!.selected).toBe(false);
        expect(sidebar).toEqual(["acting"]);
    });
});
