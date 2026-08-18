import { describe, expect, test } from "bun:test";

import type { GameEvent, Unit } from "@heroesofcrypto/common";

import {
    GridSettings,
    HoCConfig,
    offensiveSpellDamageAgainstTarget,
    projectSpellDamageAgainstUnit,
    projectSpellRebound,
    Spell,
    SpellHelper,
    SpellMultiplierType,
} from "@heroesofcrypto/common";

import { cellTargetedSpellBlockCells, spellCastSecondaryDamage } from "./Sandbox";

const key = (c: { x: number; y: number }) => `${c.x},${c.y}`;

const spellOf = (faction: string, name: string): Spell =>
    new Spell({ spellProperties: HoCConfig.getSpellConfig(faction, name), amount: 1 });

/**
 * A stand-in for a live Unit, carrying only what the spell projection reads off one.
 *
 * `calculatePossibleLosses` is deliberately a crude "one kill per hitPoints" rather than the engine's real
 * stack arithmetic: these tests are about WHICH damage figure reaches it (the one after a Water Shield ate
 * the hit, not the one before), and a simple stand-in makes a wrong figure show up as a wrong count.
 */
const unitLike = (params: {
    id?: string;
    magicResist?: number;
    abilities?: string[];
    waterShield?: boolean;
    hitPoints?: number;
    amountAlive?: number;
    stackPower?: number;
    luck?: number;
    magicReflectionPower?: number;
    /** Buff powers by name, as Unit.getBuffPower reports them: absent buff -> undefined, never 0. */
    buffPowers?: Record<string, number>;
}): Unit => {
    const abilities = new Set(params.abilities ?? []);
    if (params.magicReflectionPower) {
        abilities.add("Magic Reflection");
    }
    return {
        getId: () => params.id ?? "unit",
        getAmountAlive: () => params.amountAlive ?? 1,
        getStackPower: () => params.stackPower ?? 1,
        getLuck: () => params.luck ?? 0,
        getMagicResist: () => params.magicResist ?? 0,
        getMagicDamageBonusPercentage: () => 0,
        getAbilityPower: () => params.magicReflectionPower ?? 0,
        // getMagicMirrorPower reads Magic Mirror / Mass Magic Mirror through this. Returning undefined
        // for an absent buff is the real contract — 0 would read as a buff that reflects nothing, which
        // is a different statement — and these fixtures carry the dragon's ABILITY, not the mage's buff.
        getBuffPower: (name: string) => params.buffPowers?.[name],
        hasAbilityActive: (name: string) => abilities.has(name),
        // Mirrors Unit.willWaterShieldAbsorb: an intact shield eats anything but a Fire Element's hit.
        willWaterShieldAbsorb: (attacker?: { hasAbilityActive: (name: string) => boolean }) =>
            !!params.waterShield && !attacker?.hasAbilityActive("Fire Element"),
        calculatePossibleLosses: (minusHp: number) => Math.floor(minusHp / (params.hitPoints ?? 10)),
    } as unknown as Unit;
};

describe("cell-targeted spell aim footprint", () => {
    // The engine reads action.targetCell as the CENTRE for Meteor Shower (meteorShowerCast walks -1..1 on
    // both axes). If the preview anchored it at a corner instead, the highlighted block and the block that
    // actually burns would be one cell apart in each direction.
    test("Meteor Shower covers the 3x3 centred on the aimed cell", () => {
        const cells = cellTargetedSpellBlockCells("Meteor Shower", { x: 7, y: 7 });

        expect(cells).toHaveLength(9);
        const got = new Set(cells.map(key));
        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                expect(got.has(key({ x: 7 + dx, y: 7 + dy }))).toBe(true);
            }
        }
    });

    // Meteorite (and Smoke / Craft) have no centre cell, so their 2x2 hangs up-and-right of the cursor —
    // the corner convention meteoriteCast reads.
    test("Meteorite covers the 2x2 anchored at the aimed cell's bottom-left corner", () => {
        const cells = cellTargetedSpellBlockCells("Meteorite", { x: 4, y: 5 });

        expect(cells).toHaveLength(4);
        expect(new Set(cells.map(key))).toEqual(new Set(["4,5", "5,5", "4,6", "5,6"]));
    });

    test("anything that is not Meteor Shower keeps the 2x2 corner footprint", () => {
        for (const name of ["Smoke", "Craft", "Fire Strike"]) {
            expect(cellTargetedSpellBlockCells(name, { x: 0, y: 0 })).toHaveLength(4);
        }
    });

    test("the footprint moves with the cursor and never drifts", () => {
        const a = cellTargetedSpellBlockCells("Meteor Shower", { x: 2, y: 3 });
        const b = cellTargetedSpellBlockCells("Meteor Shower", { x: 5, y: 3 });

        expect(a.map((c) => key({ x: c.x + 3, y: c.y }))).toEqual(b.map(key));
    });

    // The preview must not label damage where the cast is refused: meteoriteCast / meteorShowerCast both
    // require the WHOLE block to be on the board, so the last column and the last row are drops that never
    // land (measured: the hover printed 152 and 4104 for exactly such casts).
    describe("only a block that fits the board can land", () => {
        const gridSettings = new GridSettings(16, 2048, 0, 2048, 0, 0, 0);
        const fits = (spellName: string, x: number, y: number) =>
            SpellHelper.cellTargetedSpellBlockFitsGrid(gridSettings, spellName, { x, y });

        test("Meteorite's 2x2 falls off the board's far edge", () => {
            expect(fits("Meteorite", 14, 3)).toBe(true);
            expect(fits("Meteorite", 15, 3)).toBe(false);
            expect(fits("Meteorite", 3, 15)).toBe(false);
        });

        test("Meteor Shower's 3x3 needs a cell of clearance on every side", () => {
            expect(fits("Meteor Shower", 1, 1)).toBe(true);
            expect(fits("Meteor Shower", 0, 5)).toBe(false);
            expect(fits("Meteor Shower", 15, 3)).toBe(false);
            expect(fits("Meteor Shower", 14, 14)).toBe(true);
            expect(fits("Meteor Shower", 14, 15)).toBe(false);
        });
    });
});

describe("spell damage preview parity", () => {
    test("includes every caster magic-damage bonus before applying target resistance", () => {
        // Lightning Strike: 30 * 2 creatures * 5 stack = 300. A combined +15% from
        // Empower/Sylvan raises it to 345; 20% magic resistance then lands exactly 276.
        expect(offensiveSpellDamageAgainstTarget(SpellMultiplierType.UNIT_AMOUNT_STACK_POWER, 30, 2, 5, 15, 20)).toBe(
            276,
        );
        expect(offensiveSpellDamageAgainstTarget(SpellMultiplierType.UNIT_AMOUNT_STACK_POWER, 30, 2, 5, 0, 20)).toBe(
            240,
        );
    });

    // The regression this projection was rebuilt for: the Battle Mage's book is UNIT_AMOUNT_DAMAGE (flat per
    // caster), and pricing it with the stack-powered shape showed up to 5x the damage the cast would deal.
    test("prices the Battle Mage's flat-per-caster book without the caster's stack power", () => {
        // Fire Strike, power 6, 50 casters -> 300 whatever the stack power is.
        expect(offensiveSpellDamageAgainstTarget(SpellMultiplierType.UNIT_AMOUNT_DAMAGE, 6, 50, 5, 0, 0)).toBe(300);
        expect(offensiveSpellDamageAgainstTarget(SpellMultiplierType.UNIT_AMOUNT_DAMAGE, 6, 50, 1, 0, 0)).toBe(300);
        // Meteorite, power 4, 50 casters -> 200, and the target's resistance still applies on top.
        expect(offensiveSpellDamageAgainstTarget(SpellMultiplierType.UNIT_AMOUNT_DAMAGE, 4, 50, 5, 0, 0)).toBe(200);
        expect(offensiveSpellDamageAgainstTarget(SpellMultiplierType.UNIT_AMOUNT_DAMAGE, 4, 50, 5, 0, 50)).toBe(100);
        // The Magic Dragon's stack-powered shape is unchanged, which is why this bug stayed invisible there.
        expect(offensiveSpellDamageAgainstTarget(SpellMultiplierType.UNIT_AMOUNT_STACK_POWER, 6, 50, 5, 0, 0)).toBe(
            1500,
        );
    });

    test("prices the target's element before its resistance, and leaves elementless spells alone", () => {
        // Ring of Fire at 24: 24 * 1 creature * 5 stack = 120 against an elementless target.
        expect(offensiveSpellDamageAgainstTarget(SpellMultiplierType.UNIT_AMOUNT_STACK_POWER, 24, 1, 5, 0, 0)).toBe(
            120,
        );
        expect(offensiveSpellDamageAgainstTarget(SpellMultiplierType.UNIT_AMOUNT_STACK_POWER, 24, 1, 5, 0, 0, 1)).toBe(
            120,
        );
        // A Fire Element previews as nothing at all rather than as a number the cast will never deal.
        expect(offensiveSpellDamageAgainstTarget(SpellMultiplierType.UNIT_AMOUNT_STACK_POWER, 24, 1, 5, 0, 0, 0)).toBe(
            0,
        );
        // A Water Element takes fire half again as hard, and only then resists it: 120 * 1.5 = 180, less 20%.
        expect(
            offensiveSpellDamageAgainstTarget(SpellMultiplierType.UNIT_AMOUNT_STACK_POWER, 24, 1, 5, 0, 0, 1.5),
        ).toBe(180);
        expect(
            offensiveSpellDamageAgainstTarget(SpellMultiplierType.UNIT_AMOUNT_STACK_POWER, 24, 1, 5, 0, 20, 1.5),
        ).toBe(144);
    });

    test("reads spell Flesh Shield transfers even when no primary damage remains", () => {
        const event = {
            type: "spell_cast",
            casterId: "mage",
            spellName: "Lightning Strike",
            unitIdsDied: [],
            animations: [],
            secondary: [
                {
                    source: "flesh_shield",
                    unitId: "abomination",
                    position: { x: 4, y: 5 },
                    amount: 500,
                    unitsDied: 1,
                },
            ],
        } as unknown as GameEvent;

        expect(spellCastSecondaryDamage(event)).toEqual([
            {
                source: "flesh_shield",
                unitId: "abomination",
                position: { x: 4, y: 5 },
                amount: 500,
                unitsDied: 1,
            },
        ]);
    });
});

describe("aim projection against a live target", () => {
    const fireStrike = spellOf("Chaos", "Fire Strike");
    // Battle Mage x50: Fire Strike is UNIT_AMOUNT_DAMAGE at power 6, so 300 raw whatever the stack power.
    const battleMage = unitLike({ id: "mage", amountAlive: 50, stackPower: 5 });

    test("a Water Element takes fire half again as hard, then resists it", () => {
        const plain = projectSpellDamageAgainstUnit({
            spell: fireStrike,
            caster: battleMage,
            target: unitLike({ id: "orc" }),
        });
        expect(plain.landed).toBe(300);
        expect(plain.damage).toBe(300);

        const mermaid = projectSpellDamageAgainstUnit({
            spell: fireStrike,
            caster: battleMage,
            target: unitLike({ id: "mermaid", abilities: ["Water Element"] }),
        });
        expect(mermaid.damage).toBe(450);

        const resistantMermaid = projectSpellDamageAgainstUnit({
            spell: fireStrike,
            caster: battleMage,
            target: unitLike({ id: "mermaid", abilities: ["Water Element"], magicResist: 20 }),
        });
        expect(resistantMermaid.damage).toBe(360);
    });

    test("a Fire Element takes nothing at all from fire", () => {
        const efreet = projectSpellDamageAgainstUnit({
            spell: fireStrike,
            caster: battleMage,
            target: unitLike({ id: "efreet", abilities: ["Fire Element"] }),
        });

        expect(efreet.damage).toBe(0);
        expect(efreet.kills).toBe(0);
    });

    // The measured divergence: hover promised 450 damage and 40 kills, the engine dealt 0 because
    // Unit.applyDamage short-circuits on an intact Water Shield and returns before any HP is subtracted.
    test("an intact Water Shield absorbs the whole cast, kills and all", () => {
        const shielded = projectSpellDamageAgainstUnit({
            spell: fireStrike,
            caster: battleMage,
            target: unitLike({ id: "mermaid", abilities: ["Water Element"], waterShield: true, hitPoints: 11 }),
        });

        expect(shielded.absorbedByWaterShield).toBe(true);
        expect(shielded.damage).toBe(0);
        expect(shielded.kills).toBe(0);
        // The hit still counts as a full one for anything downstream of it (what a mirror reflects).
        expect(shielded.landed).toBe(450);
    });

    test("fire walks straight through a Water Shield without even breaking it", () => {
        const firstborn = unitLike({ id: "efreet", amountAlive: 50, abilities: ["Fire Element"] });
        const shielded = projectSpellDamageAgainstUnit({
            spell: fireStrike,
            caster: firstborn,
            target: unitLike({ id: "mermaid", abilities: ["Water Element"], waterShield: true, hitPoints: 11 }),
        });

        expect(shielded.absorbedByWaterShield).toBe(false);
        expect(shielded.damage).toBe(450);
    });

    test("kills are counted off the damage that survives, not off the raw hit", () => {
        const target = unitLike({ id: "orc", hitPoints: 30, magicResist: 50 });
        const projection = projectSpellDamageAgainstUnit({ spell: fireStrike, caster: battleMage, target });

        // 300 raw, halved by 50% magic resistance = 150 -> 5 dead at 30 hp each, not the 10 the raw figure buys.
        expect(projection.damage).toBe(150);
        expect(projection.kills).toBe(5);
    });
});

describe("Magic Reflection rebound projection", () => {
    // Lightning Strike from a caster x4 at stack power 5: 30 * 4 * 5 = 600 raw.
    const lightning = spellOf("Nature", "Lightning Strike");
    const dragon = unitLike({ id: "dragon", magicReflectionPower: 75, stackPower: 1 });

    const casterWithResist = (magicResist: number) =>
        unitLike({ id: "caster", amountAlive: 4, stackPower: 5, magicResist });

    test("the caster takes the mirror's share back, cut by its own magic resistance", () => {
        // 75 power at stack power 1 = 15% -> floor(600 * 15%) = 90, then the caster's own resistance.
        for (const [magicResist, expected] of [
            [0, 90],
            [25, 67],
            [50, 45],
        ] as const) {
            const rebound = projectSpellRebound({
                spell: lightning,
                caster: casterWithResist(magicResist),
                holder: dragon,
                landedOnHolder: 600,
            });

            expect(rebound?.reflectionPercent).toBe(15);
            expect(rebound?.damage).toBe(expected);
        }
    });

    test("nothing rebounds off a creature without the passive, or off the caster itself", () => {
        expect(
            projectSpellRebound({
                spell: lightning,
                caster: casterWithResist(0),
                holder: unitLike({ id: "orc" }),
                landedOnHolder: 600,
            }),
        ).toBeUndefined();

        const selfCaster = casterWithResist(0);
        expect(
            projectSpellRebound({
                spell: lightning,
                caster: selfCaster,
                holder: selfCaster,
                landedOnHolder: 600,
            }),
        ).toBeUndefined();
    });

    test("the caster's OWN element answers the rebound", () => {
        // Lightning is AIR: a Wind Element caster gets its own bolt back and takes nothing from it.
        const windCaster = unitLike({ id: "caster", amountAlive: 4, stackPower: 5, abilities: ["Wind Element"] });
        const rebound = projectSpellRebound({
            spell: lightning,
            caster: windCaster,
            holder: dragon,
            landedOnHolder: 600,
        });

        expect(rebound?.damage).toBe(0);
    });
});
