import { afterEach, expect, mock, test } from "bun:test";
import {
    AbilityFactory,
    EffectFactory,
    FightStateManager,
    Grid,
    GridConstants,
    GridSettings,
    GridVals,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
    UnitsHolder,
} from "@heroesofcrypto/common";
import { BufferImageSource, Container, Texture } from "pixi.js";
import { restoreBattle, snapshotBattle } from "../../../heroes-of-crypto-common/src/simulation/battle_snapshot";
import { runAiSearchSimulation } from "./aiSearchGuard";
import { RenderableUnit } from "./RenderableUnit";

const settings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const previousFight = FightStateManager.getInstance().getFightProperties();
afterEach(() => FightStateManager.getInstance().setFightProperties(previousFight));

const baseUnit = () => {
    const effects = new EffectFactory();
    return Unit.createUnit(
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Chaos", "Orc", "orc_512", 12),
        settings,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
};

test("pending damage counts retain their action identity across an AI rollback", () => {
    const grid = new Grid(settings, GridVals.NORMAL);
    const units = new UnitsHolder(grid);
    const fight = FightStateManager.getInstance().getFightProperties();
    const unit = RenderableUnit.fromBase(baseUnit(), () => undefined);
    units.addUnit(unit);
    unit.beginDamagePresentation(20);
    const pending = unit.captureDamageCasualties(3);
    const presentation = Reflect.get(unit, "combatAmountPresentation");
    const before = snapshotBattle(units, grid, fight);
    runAiSearchSimulation(() => {
        unit.setPosition(500, 500);
        unit.setResponded(true);
        restoreBattle(before, units, grid, fight);
    });
    expect(Reflect.get(unit, "combatAmountPresentation")).toBe(presentation);
    pending();
    expect(unit.getDisplayedAmount()).toBe(17);
    expect(unit.getAmountAlive()).toBe(12);
    expect(snapshotBattle(units, grid, fight)).toEqual(before);
    unit.beginDamagePresentation();
    pending();
    expect(unit.getDisplayedAmount()).toBe(12);
    unit.captureDamageCasualties(2)();
    expect(unit.getDisplayedAmount()).toBe(10);
    expect(snapshotBattle(units, grid, fight)).toEqual(before);
});

for (const [renderer, factory] of [["battlefield", RenderableUnit]] as const) {
    test(`${renderer} lazy visuals stay outside battle snapshots and survive rollback by identity`, () => {
        const grid = new Grid(settings, GridVals.NORMAL);
        const units = new UnitsHolder(grid);
        const fight = FightStateManager.getInstance().getFightProperties();
        const base = baseUnit();
        const engineFields = Object.keys(base);
        const texture = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 2048, height: 2048 }),
        });
        const unit = factory.fromBase(base, () => texture);
        const root = new Container();
        try {
            expect(unit as Unit).toBe(base);
            expect(Object.keys(unit)).toEqual(engineFields);
            unit.setPosition(0, 1024);
            unit.ensureVisual(root, settings);
            unit.setBoardSelected(true);
            expect(Object.keys(unit)).toEqual(engineFields);
            units.addUnit(unit);
            const presentation = Object.getOwnPropertyNames(unit)
                .filter((field) => !engineFields.includes(field))
                .map((field) => [field, Reflect.get(unit, field)] as const);
            expect(presentation.some(([field, value]) => field === "sprite" && value)).toBe(true);
            const before = snapshotBattle(units, grid, fight);
            runAiSearchSimulation(() => {
                unit.setPosition(500, 500);
                unit.setResponded(true);
                restoreBattle(before, units, grid, fight);
            });
            expect(snapshotBattle(units, grid, fight)).toEqual(before);
            for (const [field, value] of presentation) expect(Reflect.get(unit, field), field).toBe(value);
        } finally {
            unit.destroyVisuals();
            root.destroy({ children: true });
            texture.destroy(true);
        }
    });

    test(`${renderer} snapshot coverage still rejects unknown battle state before or after promotion`, () => {
        for (const beforePromotion of [true, false]) {
            const grid = new Grid(settings, GridVals.NORMAL);
            const units = new UnitsHolder(grid);
            const base = baseUnit();
            if (beforePromotion) Object.assign(base, { unclassifiedBattleState: { value: 1 } });
            const unit = factory.fromBase(base, () => undefined);
            if (!beforePromotion) Object.assign(unit, { unclassifiedBattleState: { value: 1 } });
            units.addUnit(unit);
            expect(() => snapshotBattle(units, grid, previousFight)).toThrow(
                "Battle snapshot field coverage incomplete for Unit: unclassifiedBattleState",
            );
        }
    });

    test(`${renderer} promotion refuses to hide a new engine field with a presentation name`, () => {
        const base = Object.assign(baseUnit(), { sprite: { battleValue: 1 } });
        const fields = Object.keys(base);
        expect(() => factory.fromBase(base, () => undefined)).toThrow(
            "Unit presentation field conflicts with existing battle state: sprite",
        );
        expect(Object.keys(base)).toEqual(fields);
        expect(Object.getPrototypeOf(base)).toBe(Unit.prototype);
    });

    test(`${renderer} simulated spells and statuses never rebuild icons or schedule response feedback`, () => {
        const unit = factory.fromBase(baseUnit(), () => undefined);
        const refresh = mock(() => undefined);
        const destroySpell = mock(() => undefined);
        const icons = [{ destroy: destroySpell }];
        Object.assign(unit, {
            badgeContainer: {},
            badgeDrawState: {},
            ensureFlagStatusIndicators: refresh,
            pixiSpells: icons,
            spellBookLayer: {},
            digitTextures: new Map(),
        });
        runAiSearchSimulation(() => {
            unit.setResponded(true);
            unit.parseSpells();
            unit.applyEffect(new EffectFactory().makeEffect("Stun")!);
            unit.deleteEffect("Stun");
        });
        expect(refresh).not.toHaveBeenCalled();
        expect(destroySpell).not.toHaveBeenCalled();
        expect(Reflect.get(unit, "pixiSpells")).toBe(icons);
        expect(Reflect.get(unit, "respondFeedbackTimer")).toBeUndefined();
        expect(Reflect.get(unit, "respondFeedbackUntilMs")).toBeUndefined();
    });
}
