import { beforeAll, describe, expect, test } from "bun:test";
import {
    AbilityFactory,
    Artifact,
    AttackHandler,
    EffectFactory,
    FightStateManager,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    Spell,
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
} from "@heroesofcrypto/common";

import { RenderableUnit } from "./RenderableUnit";
import { Sandbox, type SandboxSceneState, type SandboxSceneUnitState } from "./Sandbox";

const sceneLog = { updateLog: () => {}, getLog: () => "", hasBeenUpdated: () => false, clear: () => {} };
const prototype = Sandbox.prototype as unknown as {
    captureSceneState(this: unknown): SandboxSceneState;
    createRenderableUnitFromSceneState(this: unknown, state: SandboxSceneUnitState): RenderableUnit;
};

beforeAll(() => {
    if (typeof document === "undefined") {
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
            querySelectorAll: () => [],
        };
    }
});

function fixture() {
    FightStateManager.getInstance().reset();
    const fight = FightStateManager.getInstance().getFightProperties();
    fight.startFight();
    const settings = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const effects = new EffectFactory();
    const abilityFactory = new AbilityFactory(effects);
    const grid = new Grid(settings, GridVals.NORMAL);
    const unitsHolder = new UnitsHolder(grid);
    const place = (unit: RenderableUnit, x: number, holder = unitsHolder, board = grid) => {
        const position = GridMath.getPositionForCell(
            { x, y: 3 },
            settings.getMinX(),
            settings.getStep(),
            settings.getHalfStep(),
        );
        unit.setPosition(position.x, position.y);
        holder.addUnit(unit);
        board.occupyCells(unit.getCells(), unit.getId(), unit.getTeam(), unit.getAttackRange(), true, true);
    };
    const add = (x: number, maxHp = 50, armor = 10, caster = false) => {
        const properties = HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Squire", "", 2);
        Object.assign(properties, {
            name: `Checkpoint unit ${x}`,
            max_hp: maxHp,
            hp: maxHp,
            base_armor: armor,
            luck: 0,
            morale: 0,
            abilities: [],
            abilities_descriptions: [],
            abilities_stack_powered: [],
            abilities_auras: [],
            aura_effects: [],
            aura_ranges: [],
            aura_is_buff: [],
            spells: caster ? ["Life:Helping Hand", "Life:Helping Hand"] : [],
            can_cast_spells: caster,
            spell_entries_authoritative: true,
        });
        const unit = RenderableUnit.fromBase(
            Unit.createUnit(properties, settings, TeamVals.LEFT, UnitVals.CREATURE, abilityFactory, effects, false),
            () => undefined,
        );
        place(unit, x);
        return unit;
    };
    const donor = add(2, 100, 20, true);
    const target = add(4);
    const handler = new AttackHandler(settings, grid, sceneLog, {
        add: () => {},
        get: () => [],
        has: () => false,
        clear: () => {},
    });
    const cast = (caster = donor, recipient = target) => {
        caster.setStackPower(5);
        expect(
            handler.handleMagicAttack(
                grid.getMatrix(),
                unitsHolder,
                caster.getSpells().find((spell) => spell.getName() === "Helping Hand"),
                caster,
                recipient,
            ).completed,
        ).toBe(true);
        unitsHolder.refreshStackPowerForAllUnits();
    };
    const capture = (holder = unitsHolder, board = grid) =>
        prototype.captureSceneState.call({
            unitsHolder: holder,
            grid: board,
            dungeonVisuals: { isCenterDried: () => false },
            captureScatteredMountains: () => [],
        });
    const restore = (snapshot = capture()) => {
        const serialized = JSON.parse(JSON.stringify(snapshot)) as SandboxSceneState;
        const board = new Grid(settings, serialized.gridType);
        const holder = new UnitsHolder(board);
        const units = serialized.units.map((state) => {
            const unit = prototype.createRenderableUnitFromSceneState.call(
                {
                    sc_sceneSettings: { getGridSettings: () => settings },
                    abilityFactory,
                    texAny: () => undefined,
                    ensureDigitTextures: () => {},
                },
                state,
            );
            place(unit, state.baseCell.x, holder, board);
            return unit;
        });
        holder.refreshStackPowerForAllUnits();
        return { units, holder, board };
    };
    return { add, cast, capture, restore, donor, target, unitsHolder, fight, effects };
}

function stats(unit: Unit) {
    const properties = unit.getUnitProperties();
    return {
        hp: unit.getHp(),
        maxHp: unit.getMaxHp(),
        armor: unit.getBaseArmor(),
        armorMod: properties.armor_mod,
        attack: unit.getBaseAttack(),
        attackMod: properties.attack_mod,
        steps: unit.getSteps(),
        magicResist: unit.getMagicResist(),
        alive: unit.getAmountAlive(),
        died: unit.getAmountDied(),
        charges: [...properties.spells],
    };
}

function kill(unit: Unit) {
    unit.applyDamage(unit.getCumulativeHp(), 0, sceneLog);
    expect(unit.isDead()).toBe(true);
}

describe("Helping Hand sandbox checkpoint restoration", () => {
    test.each(["caster", "recipient"])("%s death restores the other endpoint's actual base stats", (endpoint) => {
        const f = fixture();
        f.cast();
        const before = [stats(f.donor), stats(f.target)];
        const {
            units: [donor, target],
            holder,
        } = f.restore();
        expect([stats(donor), stats(target)]).toEqual(before);
        expect(target.getBuff("Helping Hand")?.getFirstSpellProperty()).toBe(100);
        expect(donor.getDebuff("Helping Hand")?.getSecondSpellProperty()).toBe(20);
        kill(endpoint === "caster" ? donor : target);
        expect(holder.getAllUnits().size).toBe(2);
        expect(target.hasBuffActive("Helping Hand")).toBe(false);
        expect(donor.hasDebuffActive("Helping Hand")).toBe(false);
        if (endpoint === "caster") {
            expect([target.getMaxHp(), target.getBaseArmor()]).toEqual([50, 10]);
            target.applyDamage(51, 0, sceneLog);
            expect([target.getAmountAlive(), target.getHp()]).toEqual([1, 49]);
        } else {
            expect([donor.getMaxHp(), donor.getBaseArmor()]).toEqual([100, 20]);
        }
    });

    test.each(["caster", "recipient"])("restored %s duration expires the entire link", (endpoint) => {
        const f = fixture();
        f.cast();
        const {
            units: [donor, target],
        } = f.restore();
        const unit = endpoint === "caster" ? donor : target;
        const laps = (
            endpoint === "caster" ? donor.getDebuff("Helping Hand") : target.getBuff("Helping Hand")
        )!.getLaps();
        for (let lap = 0; lap < laps; lap++) unit.minusLap();
        expect([donor.getMaxHp(), donor.getBaseArmor(), target.getMaxHp(), target.getBaseArmor()]).toEqual([
            100, 20, 50, 10,
        ]);
        expect(target.getUnitProperties().helping_hand_caster_id).toBeUndefined();
    });

    test("keeps coexisting Pendant, Spiritual Armor, Made of Fire and Shatter Armor through repeat restores", () => {
        const f = fixture();
        f.fight.setArtifactPerTeam(TeamVals.LEFT, 2, Artifact.Tier2Artifact.PENDANT_OF_VITALITY);
        f.unitsHolder.applyArtifacts();
        f.target.applyBuff(
            new Spell({ spellProperties: HoCConfig.getSpellConfig("Life", "Spiritual Armor"), amount: 1 }),
        );
        f.target.applyBuff(
            new Spell({ spellProperties: HoCConfig.getSpellConfig("System", "Made of Fire"), amount: 1 }),
        );
        const shatter = f.effects.makeEffect("Shatter Armor")!;
        shatter.setPower(3);
        f.target.applyEffect(shatter);
        f.unitsHolder.refreshStackPowerForAllUnits();
        const base = stats(f.target);
        f.cast();
        f.target.applyDamage(7, 0, sceneLog);
        const expected = stats(f.target);
        const first = f.restore();
        const second = f.restore(f.capture(first.holder, first.board));
        const [donor, target] = second.units;
        second.holder.applyArtifacts();
        second.holder.refreshStackPowerForAllUnits();
        expect(stats(target)).toEqual(expected);
        expect(target.getEffect("Shatter Armor")?.getPower()).toBe(3);
        expect(target.getBuffs().filter((buff) => buff.getName() === "Helping Hand")).toHaveLength(1);
        expect(target.getUnitProperties().applied_buffs.filter((name) => name === "Helping Hand")).toHaveLength(1);
        kill(donor);
        expect(stats(target)).toEqual({ ...base, hp: Math.min(expected.hp, base.maxHp) });
        expect(target.hasBuffActive("Spiritual Armor")).toBe(true);
        expect(target.hasBuffActive("Made of Fire")).toBe(true);
    });

    test("preserves a recipient's onward gift and separate penalty until their own endpoints end", () => {
        const f = fixture();
        const middle = f.add(6, 50, 10, true);
        f.cast(f.donor, middle);
        f.cast(middle, f.target);
        const before = [stats(f.donor), stats(f.target), stats(middle)];
        const {
            units: [donor, target, restoredMiddle],
        } = f.restore();
        expect([stats(donor), stats(target), stats(restoredMiddle)]).toEqual(before);
        kill(donor);
        expect(restoredMiddle.hasBuffActive("Helping Hand")).toBe(false);
        expect(restoredMiddle.hasDebuffActive("Helping Hand")).toBe(true);
        expect([restoredMiddle.getMaxHp(), restoredMiddle.getBaseArmor()]).toEqual([26, 5]);
        kill(target);
        expect([restoredMiddle.getMaxHp(), restoredMiddle.getBaseArmor()]).toEqual([50, 10]);
    });

    test("restores an absorbed penalty owner and clears both sides on its death", () => {
        const f = fixture();
        const absorber = f.add(3, 200, 30);
        f.donor.applyAuraEffect("Absorb Penalties Aura", "absorb", true, 100, "3;3");
        f.cast();
        expect(f.target.getUnitProperties().helping_hand_penalty_id).toBe(absorber.getId());
        const {
            units: [donor, target, restoredAbsorber],
        } = f.restore();
        expect([donor.getMaxHp(), target.getMaxHp(), restoredAbsorber.getMaxHp()]).toEqual([100, 80, 170]);
        kill(restoredAbsorber);
        expect([target.getMaxHp(), target.getBaseArmor()]).toEqual([50, 10]);
        expect(target.getUnitProperties().helping_hand_caster_id).toBeUndefined();
    });

    test("keeps wounded stacks and spent spell charges when a restored recipient releases its caster", () => {
        const f = fixture();
        f.cast();
        f.donor.applyDamage(95, 0, sceneLog);
        const before = stats(f.donor);
        expect([before.alive, before.died, before.hp, before.charges.length]).toEqual([1, 1, 45, 1]);
        const {
            units: [donor, target],
        } = f.restore();
        expect(stats(donor)).toEqual(before);
        kill(target);
        expect([donor.getAmountAlive(), donor.getAmountDied(), donor.getHp(), donor.getMaxHp()]).toEqual([
            1, 1, 45, 100,
        ]);
        expect(
            donor
                .getSpells()
                .find((spell) => spell.getName() === "Helping Hand")
                ?.getAmount(),
        ).toBe(1);
    });

    test("does not rerun a restored Unyielding Power lap or compound Boost Health", () => {
        const f = fixture();
        f.target.grantAbility("Unyielding Power");
        f.target.grantAbility("Boost Health");
        f.unitsHolder.refreshStackPowerForAllUnits();
        f.cast();
        f.target.applyDamage(12, 0, sceneLog);
        const expected = stats(f.target);
        const checkpoint = f.capture();
        kill(f.donor);
        const released = stats(f.target);
        const first = f.restore(checkpoint);
        const {
            units: [donor, target],
        } = f.restore(f.capture(first.holder, first.board));
        expect(stats(target)).toEqual(expected);
        kill(donor);
        expect(stats(target)).toEqual(released);
    });

    test("leaves ordinary and legacy snapshot reconstruction on its existing path", () => {
        const f = fixture();
        expect(f.capture().units.every((unit) => unit.helpingHandStatState === undefined)).toBe(true);
        const ordinary = f.restore();
        expect(ordinary.units.map(stats)).toEqual([stats(f.donor), stats(f.target)]);
        f.cast();
        const legacy = f.capture();
        for (const unit of legacy.units) delete unit.helpingHandStatState;
        const restored = f.restore(legacy);
        expect(restored.units.map(stats)).toEqual([stats(f.donor), stats(f.target)]);
        expect(restored.units[1].getBuff("Helping Hand")).toBeUndefined();
    });
});
