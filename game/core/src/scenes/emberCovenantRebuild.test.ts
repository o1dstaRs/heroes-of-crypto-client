import { afterEach, beforeEach, expect, test } from "bun:test";
import {
    FightStateManager,
    type GameEvent,
    Grid,
    GridSettings,
    GridVals,
    TeamVals,
    UnitsHolder,
    type Spell,
    type UnitProperties,
} from "@heroesofcrypto/common";

import { Sandbox, type SandboxSceneState } from "./Sandbox";

/**
 * The Hydra's Ember Covenant: the engine remembers which armies still hold it and gives it to every stack added to
 * one. A board rebuild re-adds every stack, so a covenant the snapshot had already broken came back on the whole
 * army, and the next update dissolved it again: the dissolve played on rings nobody had.
 *
 * Board rendering is stubbed; the hydrate and the engine's army bookkeeping (UnitsHolder) are real.
 */
const COVENANT = "Ember Covenant Blessing";
const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
const originalFight = FightStateManager.getInstance().getFightProperties();
beforeEach(() => FightStateManager.getInstance().reset());
afterEach(() => FightStateManager.getInstance().setFightProperties(originalFight));

type UnitState = SandboxSceneState["units"][number];

// Just enough of a stack for UnitsHolder.addUnit and breakEmberCovenant.
const stack = (state: UnitState) => {
    const properties = structuredClone(state.properties);
    const drop = (name: string) => {
        const index = properties.applied_buffs.indexOf(name);
        if (index < 0) return;
        properties.applied_buffs.splice(index, 1);
        properties.applied_buffs_laps.splice(index, 1);
    };
    return {
        getId: () => properties.id,
        getName: () => properties.id,
        getTeam: () => state.team,
        isDead: () => state.dead,
        getBaseCell: () => state.baseCell,
        getUnitProperties: () => properties,
        hasStatusBuffApplied: (name: string) => properties.applied_buffs.includes(name),
        applyBuff: (buff: Spell) => {
            properties.applied_buffs.push(buff.getName());
            properties.applied_buffs_laps.push(buff.getLapsTotal());
        },
        deleteBuff: drop,
        setActiveTurn: () => {},
        setBoardFacing: () => {},
        setBoardSelected: () => {},
        setPosition: () => {},
    };
};

const fixture = () => {
    const grid = new Grid(settings, GridVals.NORMAL);
    const holder = new UnitsHolder(grid);
    holder.refreshStackPowerForAllUnits = () => {};
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        grid,
        sc_sceneSettings: { getGridSettings: () => settings },
        unitsHolder: holder,
        createRenderableUnitFromSceneState: stack,
        destroySpecificUnits: (destroyed: { getId(): string }[]) =>
            destroyed.forEach((unit) => (holder.getAllUnits() as Map<string, unknown>).delete(unit.getId())),
        handleNextUnitActivation: () => {},
        setSelectedUnitProperties: () => {},
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
    const unitState = (id: string, team: UnitState["team"], covenant: boolean): UnitState => ({
        properties: {
            id,
            amount_alive: 10,
            applied_buffs: covenant ? [COVENANT] : [],
            applied_buffs_laps: covenant ? [15] : [],
        } as UnitProperties,
        team,
        placed: false,
        dead: false,
        cells: [],
        baseCell: { x: 0, y: 0 },
    });
    const state = (covenant: boolean): SandboxSceneState => ({
        units: [
            unitState("hydra", TeamVals.LEFT, covenant),
            unitState("squire", TeamVals.LEFT, covenant),
            unitState("enemy", TeamVals.RIGHT, false),
        ],
        gridType: GridVals.NORMAL,
        currentLap: 3,
        fightStarted: true,
        fightFinished: false,
        currentUnitId: "enemy",
    });
    const carriers = () =>
        [...holder.getAllUnits().values()]
            .filter((unit) => unit.getUnitProperties().applied_buffs.includes(COVENANT))
            .map((unit) => unit.getId());
    return { scene, holder, state, carriers, unitState };
};

test("a rebuild after the covenant broke elsewhere does not hand the army its rings back", () => {
    const { scene, holder, state, carriers, unitState } = fixture();
    scene.hydrateSceneState(state(true));
    expect(carriers()).toEqual(["hydra", "squire"]);

    // The break happened on the server (or in a replayed record), not in this engine.
    scene.hydrateSceneState(state(false));

    expect(carriers()).toEqual([]);
    expect(holder.hasEmberCovenant(TeamVals.LEFT)).toBe(false);
    // A stack joining that army later (a summon, a raise) is not granted a covenant that is gone.
    holder.addUnit(stack(unitState("summon", TeamVals.LEFT, false)) as never);
    expect(carriers()).toEqual([]);
});

test("a covenant the snapshot still shows survives the rebuild", () => {
    const { scene, holder, state, carriers } = fixture();
    scene.hydrateSceneState(state(true));
    scene.hydrateSceneState(state(true));

    expect(carriers()).toEqual(["hydra", "squire"]);
    expect(holder.hasEmberCovenant(TeamVals.LEFT)).toBe(true);
});

test("a replayed summon joins without a covenant its army already lost", () => {
    const { scene, holder, state, carriers, unitState } = fixture();
    scene.hydrateSceneState(state(true));
    // Live ranked updates drop the spent buff in place and leave the engine's army record alone.
    for (const unit of holder.getAllUnits().values()) unit.deleteBuff(COVENANT);
    expect(holder.hasEmberCovenant(TeamVals.LEFT)).toBe(true);

    const after = state(false);
    after.units.push(unitState("summon", TeamVals.LEFT, false));
    const summoned = {
        type: "unit_summoned",
        casterId: "hydra",
        unitId: "summon",
        team: TeamVals.LEFT,
        unitName: "Wolf",
        amount: 3,
        position: { x: 0, y: 0 },
        cells: [{ x: 0, y: 0 }],
        merged: false,
    } as GameEvent;
    (
        scene as unknown as { materializeReplaySummons(e: GameEvent[], s: SandboxSceneState): void }
    ).materializeReplaySummons([summoned], after);

    expect(holder.getAllUnits().has("summon")).toBe(true);
    expect(carriers()).toEqual([]);
    expect(holder.hasEmberCovenant(TeamVals.LEFT)).toBe(false);
});
