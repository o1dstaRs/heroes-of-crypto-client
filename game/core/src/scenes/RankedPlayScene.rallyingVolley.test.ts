import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
    AbilityFactory,
    CreatureVals,
    EffectFactory,
    FightStateManager,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    TeamVals,
    Unit,
    UnitVals,
    UnitsHolder,
} from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot, AuthoritativeUnitState } from "../game_action_transport";
import { abilityToTextureName } from "@heroesofcrypto/common/src/abilities/ability_helper";
import { images } from "../generated/image_imports";
import { authoritativeSnapshotToSandboxSceneState } from "./RankedPlayScene";
import { RenderableUnit } from "./RenderableUnit";

const BLESSING = "Rallying Volley Blessing";
let previousFight = FightStateManager.getInstance().getFightProperties();

beforeEach(() => {
    previousFight = FightStateManager.getInstance().getFightProperties();
    FightStateManager.getInstance().reset();
});

afterEach(() => FightStateManager.getInstance().setFightProperties(previousFight));

const unitState = (overrides: Partial<AuthoritativeUnitState>): AuthoritativeUnitState => ({
    id: "unit",
    team: TeamVals.LEFT,
    name: "Elf",
    creatureId: CreatureVals.ELF,
    amountAlive: 12,
    amountDied: 0,
    hp: 10,
    maxHp: 10,
    attackType: 0,
    size: 1,
    baseCell: { x: 14, y: 14 },
    cells: [{ x: 14, y: 14 }],
    initiative: 0,
    morale: 0,
    dead: false,
    placed: true,
    stackPower: 1,
    rangeShots: 1,
    luck: 0,
    onHourglass: false,
    ...overrides,
});

describe("ranked Rallying Volley Blessing reconnect", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT] as const) {
        for (const gridType of [GridVals.NORMAL, GridVals.WATER_CENTER, GridVals.LAVA_CENTER, GridVals.BLOCK_CENTER]) {
            for (const remaining of [0, 1, 4, 22]) {
                test(`team ${team}, map ${gridType}, ${remaining} remaining: preserves server ammo across global refreshes`, () => {
                    const snapshot: AuthoritativeGameSnapshot = {
                        gameId: "rallying-volley-reconnect",
                        viewerTeam: team,
                        phase: 2,
                        gridType,
                        currentLap: 2,
                        fightStarted: true,
                        fightFinished: false,
                        currentUnitId: "archer",
                        currentTurnTeam: team,
                        latestSequence: 10,
                        narrowingLayers: 0,
                        centerDried: false,
                        units: [
                            unitState({
                                id: "zena",
                                team,
                                name: "Zena",
                                creatureId: CreatureVals.ZENA,
                                amountAlive: 60,
                                baseCell: { x: 2, y: 2 },
                                cells: [
                                    { x: 1, y: 2 },
                                    { x: 2, y: 2 },
                                ],
                                rangeShots: 5,
                            }),
                            unitState({
                                id: "archer",
                                team,
                                rangeShots: remaining + 1,
                                buffs: [BLESSING],
                                buffLaps: [15],
                                buffDescriptions: ["Grants +2 shots once to the whole army."],
                            }),
                            unitState({
                                id: "limited-supply",
                                team,
                                name: "Arbalester",
                                creatureId: CreatureVals.ARBALESTER,
                                baseCell: { x: 12, y: 14 },
                                cells: [{ x: 12, y: 14 }],
                                rangeShots: remaining + 1,
                                buffs: [BLESSING],
                            }),
                        ],
                        upNext: [],
                    };
                    const state = authoritativeSnapshotToSandboxSceneState(snapshot);
                    const settings = new GridSettings(
                        GridConstants.GRID_SIZE,
                        GridConstants.MAX_Y,
                        GridConstants.MIN_Y,
                        GridConstants.MAX_X,
                        GridConstants.MIN_X,
                        GridConstants.MOVEMENT_DELTA,
                        GridConstants.UNIT_SIZE_DELTA,
                    );
                    const grid = new Grid(settings, gridType);
                    const holder = new UnitsHolder(grid);
                    for (const entry of state.units) {
                        const effects = new EffectFactory();
                        const unit = RenderableUnit.fromBase(
                            Unit.createUnit(
                                entry.properties,
                                settings,
                                team,
                                UnitVals.CREATURE,
                                new AbilityFactory(effects),
                                effects,
                                false,
                            ),
                            undefined as never,
                        );
                        const anchor = snapshot.units.find((source) => source.id === unit.getId())!.baseCell;
                        const position = GridMath.getPositionForFootprintAnchor(
                            settings,
                            anchor,
                            unit.getFootprintWidth(),
                            unit.getFootprintHeight(),
                        );
                        unit.setPosition(position.x, position.y);
                        grid.occupyCells(unit.getCells(), unit.getId(), team, unit.getAttackRange(), false, false);
                        holder.addUnit(unit);
                    }
                    expect(holder.getAllUnits().get("zena")!.hasAbilityActive(BLESSING)).toBe(true);
                    expect(holder.getAllUnits().get("zena")!.getBaseCell()).toEqual({ x: 2, y: 2 });
                    for (let refresh = 0; refresh < 5; refresh += 1) {
                        holder.refreshAuraEffectsForAllUnits();
                        holder.refreshStackPowerForAllUnits();
                        for (const id of ["archer", "limited-supply"]) {
                            const unit = holder.getAllUnits().get(id)!;
                            expect(unit.getRangeShots()).toBe(remaining);
                            expect(unit.getUnitProperties().range_shots_authoritative).toBe(true);
                            expect(unit.getUnitProperties().rallying_volley_granted).toBe(0);
                            expect(unit.getUnitProperties().applied_buffs).toContain(BLESSING);
                        }
                    }
                    const zena = holder.getAllUnits().get("zena")!;
                    expect(zena.hasAbilityActive(BLESSING)).toBe(true);
                    expect(zena.getRangeShots()).toBe(4);
                });
            }
        }
    }

    test("the canonical blessing icon is present in the generated client catalog", () => {
        expect(abilityToTextureName(BLESSING)).toBe("rallying_volley_blessing_256");
        expect(images.rallying_volley_blessing_256).toBeTruthy();
    });
});
