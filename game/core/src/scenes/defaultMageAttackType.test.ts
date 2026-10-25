import { describe, expect, test } from "bun:test";
import {
    AbilityFactory,
    AttackVals,
    EffectFactory,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";
import { RenderableUnit } from "./RenderableUnit";

const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
const create = (faction = "Nature", name = "Magic Dragon") => {
    const effects = new EffectFactory();
    const unit = RenderableUnit.fromBase(
        Unit.createUnit(
            HoCConfig.getCreatureConfig(TeamVals.LEFT, faction, name, "", 10),
            settings,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        ),
        () => undefined,
    );
    unit.setStackPower(3);
    return unit;
};
const activate = (unit: RenderableUnit, sameTurn = false, controlled = true, ai = false) => {
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        canControlCurrentActiveUnit: () => controlled,
        isBoardInputLockedByAI: () => ai,
    }) as { refreshActiveAttackType(unit: RenderableUnit, canLandRange: boolean, sameTurn: boolean): void };
    scene.refreshActiveAttackType(unit, true, sameTurn);
    return unit.getAttackTypeSelection();
};

describe("human damage-mage attack defaults", () => {
    for (const [faction, name] of [
        ["Nature", "Magic Dragon"],
        ["Life", "Battle Mage"],
        ["Chaos", "Wandering Mage"],
    ]) {
        test(`${name} starts a new human turn in Magic`, () => {
            expect(activate(create(faction, name))).toBe(AttackVals.MAGIC);
        });
    }

    test("spent damage spells fall back to melee even when support scrolls remain", () => {
        const unit = create("Chaos", "Wandering Mage");
        unit.getSpells()
            .find((spell) => spell.getName() === "Fireball")!
            .setAmount(0);
        expect(unit.getSpells().some((spell) => spell.isRemaining())).toBe(true);
        expect(activate(unit)).toBe(AttackVals.MELEE);
    });

    test("damage scrolls above the current stack power do not select Magic", () => {
        const unit = create("Life", "Battle Mage");
        unit.getSpells()
            .find((spell) => spell.getName() === "Fire Strike")!
            .setAmount(0);
        expect(activate(unit)).toBe(AttackVals.MELEE_MAGIC);
        unit.setStackPower(5);
        expect(activate(unit)).toBe(AttackVals.MAGIC);
    });

    test("Break and an already-spent move keep melee available as the default", () => {
        const broken = create();
        broken.applyEffect(new EffectFactory().makeEffect("Break")!);
        expect(activate(broken)).toBe(AttackVals.MELEE_MAGIC);
        const moved = create();
        moved.setMovedThisTurn(true);
        expect(activate(moved)).toBe(AttackVals.MELEE_MAGIC);
    });

    test("support and terrain casters retain their existing defaults", () => {
        expect(activate(create("Might", "Ogre Mage"))).toBe(AttackVals.MELEE_MAGIC);
        expect(activate(create("Chaos", "Nightmare"))).toBe(AttackVals.MELEE);
        expect(activate(create("Life", "Healer"))).toBe(AttackVals.MAGIC);
        expect(activate(create("Might", "Centaur"))).toBe(AttackVals.RANGE);
    });

    test("a human's manual melee selection survives repeated activation on the same turn", () => {
        const unit = create();
        expect(activate(unit)).toBe(AttackVals.MAGIC);
        unit.selectAttackType(AttackVals.MELEE_MAGIC);
        for (let i = 0; i < 5; i++) expect(activate(unit, true)).toBe(AttackVals.MELEE_MAGIC);
        expect(activate(unit)).toBe(AttackVals.MAGIC);
    });

    test("AI, enemy turns and observer views retain the engine's default stance", () => {
        expect(activate(create(), false, true, true)).toBe(AttackVals.MELEE_MAGIC);
        expect(activate(create(), false, false)).toBe(AttackVals.MELEE_MAGIC);
    });
});
