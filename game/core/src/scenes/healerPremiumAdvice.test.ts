import { afterEach, expect, spyOn, test } from "bun:test";

import {
    AbilityFactory,
    AttackHandler,
    AttackVals,
    EffectFactory,
    FightStateManager,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    HoCLib,
    MoveHandler,
    PathHelper,
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
    type IDecisionContext,
} from "@heroesofcrypto/common";
import { snapshotBattle } from "../../../heroes-of-crypto-common/src/simulation/battle_snapshot";
import { makeRng } from "../../../heroes-of-crypto-common/src/simulation/army";

import { DamageStatisticHolder } from "./DamageStats";
import { SceneLog } from "./SceneLog";
import type { ISandboxAiSearchHost } from "./sandboxAiSearch";
import { sandboxPremiumAdvice } from "./sandboxPremiumAdvice";

const previousFight = FightStateManager.getInstance().getFightProperties();
const previousRandom = HoCLib.captureDeterministicRandomState();
afterEach(() => {
    FightStateManager.getInstance().setFightProperties(previousFight);
    HoCLib.restoreDeterministicRandomState(previousRandom);
});

for (const damage of [1, 400]) {
    test(`A19 Healer advice compares Blessing with ${damage} missing HP and restores the board`, () => {
        HoCLib.setDeterministicRandomSource(makeRng(42));
        FightStateManager.getInstance().reset();
        const fight = FightStateManager.getInstance().getFightProperties();
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
        const sceneLog = new SceneLog();
        const effectFactory = new EffectFactory();
        const abilityFactory = new AbilityFactory(effectFactory);
        const attackHandler = new AttackHandler(settings, grid, sceneLog, new DamageStatisticHolder());
        let nextId = 0;
        const create = (faction: string, name: string, amount: number, team: number, x: number, y: number) => {
            const unit = Unit.createUnit(
                {
                    ...HoCConfig.getCreatureConfig(team, faction, name, "", amount),
                    id: `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
                },
                settings,
                team,
                UnitVals.CREATURE,
                abilityFactory,
                effectFactory,
                false,
            );
            const position = GridMath.getPositionForFootprintAnchor(
                settings,
                { x, y },
                unit.getFootprintWidth(),
                unit.getFootprintHeight(),
            );
            unit.setPosition(position.x, position.y);
            grid.occupyCells(unit.getCells(), unit.getId(), team, unit.getAttackRange(), false, false);
            unitsHolder.addUnit(unit);
            unit.setStackPower(5);
            unit.refreshPossibleAttackTypes(true);
            return unit;
        };
        const healer = create("Life", "Healer", 40, TeamVals.LEFT, 2, 3);
        const carry = create("Life", "Arbalester", 50, TeamVals.LEFT, 4, 8);
        const anchor = create("Chaos", "Abomination", 1, TeamVals.LEFT, 2, 5);
        create("Life", "Peasant", 200, TeamVals.RIGHT, damage === 1 ? 12 : 5, damage === 1 ? 8 : 5);
        anchor.applyDamage(damage, 0, sceneLog);
        sceneLog.clear();
        fight.setTeamUnitsAlive(TeamVals.LEFT, 3);
        fight.setTeamUnitsAlive(TeamVals.RIGHT, 1);
        fight.startFight();
        fight.startTurn(TeamVals.LEFT, 1000);
        const pathHelper = new PathHelper(settings);
        const host: ISandboxAiSearchHost = {
            grid,
            unitsHolder,
            pathHelper,
            attackHandler,
            sceneLog,
            abilityFactory,
            moveHandler: new MoveHandler(settings, grid, unitsHolder),
            fightProperties: () => fight,
            canLandRangeAttack: (unit) => unit.getPossibleAttackTypes().includes(AttackVals.RANGE),
            isBarrelCellAllowed: () => false,
            canPlaceUnit: () => false,
            canSplitUnit: () => false,
        };
        const context: IDecisionContext = {
            grid,
            unitsHolder,
            pathHelper,
            attackHandler,
            fightProperties: fight,
            matrix: grid.getMatrix(),
            decisionOrigin: "root",
        };
        const before = snapshotBattle(unitsHolder, grid, fight);
        // Assert the tactical choice independently of the live search deadline under suite CPU contention.
        const clock = spyOn(performance, "now").mockReturnValue(10_000);
        let advice: ReturnType<typeof sandboxPremiumAdvice>;
        try {
            advice = sandboxPremiumAdvice(healer, context, 42, host);
        } finally {
            clock.mockRestore();
        }
        expect(advice.status).toBe("ready");
        expect(advice.options).toHaveLength(2);
        const cast = advice.options[0]?.actions?.find((action) => action.type === "cast_spell");
        if (damage === 1) {
            expect(cast).toMatchObject({ spellName: "Blessing", targetId: carry.getId() });
        } else {
            const spellName = cast?.spellName;
            expect(spellName === "Heal" || spellName === "Mass Heal").toBe(true);
            if (spellName === "Heal") expect(cast?.targetId).toBe(anchor.getId());
        }
        expect(snapshotBattle(unitsHolder, grid, fight)).toEqual(before);
    });
}
