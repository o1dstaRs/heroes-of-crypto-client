import { afterEach, describe, expect, test } from "bun:test";

import {
    AbilityFactory,
    EffectFactory,
    FightProperties,
    FightStateManager,
    GameActionEngine,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    MoveHandler,
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
    type ISceneLog,
} from "@heroesofcrypto/common";

import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";

const manager = FightStateManager.getInstance();
const originalFight = manager.getFightProperties();
afterEach(() => manager.setFightProperties(originalFight));

function fixture(blocked = false) {
    const settings = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const grid = new Grid(settings, GridVals.NORMAL);
    const unitsHolder = new UnitsHolder(grid);
    const fight = new FightProperties();
    manager.setFightProperties(fight);
    const effects = new EffectFactory();
    const create = (amount: number) =>
        RenderableUnit.fromBase(
            Unit.createUnit(
                HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Healer", "", amount),
                settings,
                TeamVals.LEFT,
                UnitVals.CREATURE,
                new AbilityFactory(effects),
                effects,
                false,
            ),
            () => undefined,
        );
    const source = create(40);
    const sourceCells = [{ x: 2, y: 2 }];
    const position = GridMath.getPositionForCells(settings, sourceCells);
    if (!position) throw new Error("Expected Healer placement position");
    source.setPosition(position.x, position.y);
    grid.occupyCells(sourceCells, source.getId(), source.getTeam(), source.getAttackRange(), false, false);
    unitsHolder.addUnit(source);
    const preview = create(1);
    preview.ensureVisual = () => undefined;
    const sceneLog = { updateLog: () => {} } as unknown as ISceneLog;
    const engine = new GameActionEngine({
        fightProperties: fight,
        grid,
        unitsHolder,
        moveHandler: new MoveHandler(settings, grid, unitsHolder),
        sceneLog,
    });
    const target = blocked ? sourceCells : [{ x: 3, y: 2 }];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        grid,
        unitsHolder,
        placementSplitPreviewUnit: preview,
        sc_sceneSettings: { getGridSettings: () => settings },
        canSplitUnitWithCommonRules: () => true,
        isValidEmptySplitTarget: () => true,
        createActionEngine: () => engine,
        playSceneGameSound: () => {},
        drawer: { getUnitsContainer: () => undefined },
        layoutVersion: 0,
        refreshSynergyNumbers: () => {},
        refreshUnits: () => {},
        flushPendingReplayRecords: () => {},
    }) as { commitPlacementSplit(unit: Unit, amount: number, cells: { x: number; y: number }[]): boolean };
    return { source, preview, scene, target, unitsHolder, engine };
}

describe("Sandbox drag split spell charges", () => {
    test("keeps a full spellbook on the real preview and does not inflate it after merging", () => {
        const { source, preview, scene, target, engine } = fixture();
        const originalBook = [...source.getUnitProperties().spells].sort();
        expect(scene.commitPlacementSplit(source, 1, target)).toBe(true);
        expect(preview.getAmountAlive()).toBe(1);
        expect(preview.getCanCastSpells()).toBe(true);
        expect([...preview.getUnitProperties().spells].sort()).toEqual(originalBook);
        expect([...source.getUnitProperties().spells].sort()).toEqual(originalBook);
        expect(engine.apply({ type: "delete_unit", unitId: preview.getId() }).completed).toBe(true);
        expect(source.getAmountAlive()).toBe(40);
        expect([...source.getUnitProperties().spells].sort()).toEqual(originalBook);
    });

    test("a rejected placement does not spend or transfer any source charges", () => {
        const { source, preview, scene, target, unitsHolder } = fixture(true);
        const originalBook = [...source.getUnitProperties().spells];
        expect(scene.commitPlacementSplit(source, 1, target)).toBe(false);
        expect(source.getAmountAlive()).toBe(40);
        expect(source.getUnitProperties().spells).toEqual(originalBook);
        expect(unitsHolder.getAllUnits().has(preview.getId())).toBe(false);
    });
});
