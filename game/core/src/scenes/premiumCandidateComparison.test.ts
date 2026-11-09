import { expect, test } from "bun:test";
import type { IEnumeratedCandidate } from "@heroesofcrypto/common";
import { hasClearPremiumAttackAdvantage } from "./premiumCandidateComparison";

const melee = (damage: number, preferred = false): IEnumeratedCandidate => ({
    kind: preferred ? "incumbent" : "melee",
    targetId: "enemy",
    actions: [{ type: "melee_attack", attackerId: "actor", targetId: "enemy", attackFrom: { x: 4, y: 4 } }],
    features: {
        moraleDelta: 0,
        luckDelta: 0,
        enemiesNotYetActedFrac: 0,
        alliesNotYetActedFrac: 0,
        lap: 1,
        hourglassSpent: 0,
        spendsRangeShot: 0,
        spendsSpellCharge: 0,
        burnsResurrectionCharge: 0,
        expectedDamage: damage,
        expectedKill: 0,
    },
});

test.each([
    [150, 100, true],
    [149, 100, false],
    [75, 50, true],
    [74, 49, true],
    [60, 40, false],
    [100, 100, false],
    [25, 0, true],
    [24, 0, false],
    [0, -100, false],
    [-10, -100, false],
    [NaN, 100, false],
    [Infinity, 100, false],
    [150, NaN, false],
    [150, Infinity, false],
])("clear attack margin %s vs %s is %s", (best, other, expected) => {
    expect(hasClearPremiumAttackAdvantage(melee(best as number, true), melee(other as number))).toBe(expected);
});

test("search preference and comparable targets and positions are required", () => {
    const best = melee(200, true);
    const other = melee(100);
    expect(hasClearPremiumAttackAdvantage({ ...best, kind: "melee" }, other)).toBe(false);
    expect(hasClearPremiumAttackAdvantage(best, { ...other, targetId: "another-enemy" })).toBe(false);
    expect(
        hasClearPremiumAttackAdvantage(best, {
            ...other,
            actions: [{ type: "melee_attack", attackerId: "actor", targetId: "enemy", attackFrom: { x: 5, y: 4 } }],
        }),
    ).toBe(false);
    for (const type of ["wait_turn", "defend_turn"] as const) {
        expect(hasClearPremiumAttackAdvantage(best, { ...other, actions: [{ type, unitId: "actor" }] })).toBe(false);
    }
    expect(
        hasClearPremiumAttackAdvantage(best, {
            ...other,
            actions: [{ type: "cast_spell", casterId: "actor", targetId: "ally", spellName: "Heal" }],
        }),
    ).toBe(false);
});

test("extra charges, lost morale/luck, worse kill estimates and terrain hazards keep the comparison", () => {
    const best = melee(200, true),
        other = melee(100);
    for (const cost of ["spendsRangeShot", "spendsSpellCharge", "burnsResurrectionCharge", "hourglassSpent"] as const) {
        expect(hasClearPremiumAttackAdvantage({ ...best, features: { ...best.features, [cost]: 1 } }, other)).toBe(
            false,
        );
    }
    for (const benefit of ["moraleDelta", "luckDelta"] as const) {
        expect(hasClearPremiumAttackAdvantage({ ...best, features: { ...best.features, [benefit]: -1 } }, other)).toBe(
            false,
        );
    }
    expect(hasClearPremiumAttackAdvantage(best, { ...other, features: { ...other.features, expectedKill: 1 } })).toBe(
        false,
    );
    for (const hazard of ["hasLavaCell", "hasWaterCell"] as const) {
        const hazardous = { ...best, actions: [{ ...best.actions[0], [hazard]: true }] };
        expect(hasClearPremiumAttackAdvantage(hazardous, other)).toBe(false);
    }
});

const shot = (damage: number, preferred = false): IEnumeratedCandidate => ({
    ...melee(damage, preferred),
    actions: [
        {
            type: "range_attack",
            attackerId: "actor",
            targetId: "enemy",
            aimCell: { x: 7, y: 4 },
            aimSide: preferred ? 1 : 2,
        },
    ],
    shotFeatures: {
        enemyDamage: damage,
        friendlyFireDamage: 0,
        primaryTargetDamage: damage,
        targetFirepower: 1,
        targetLevel: 1,
        targetIsRanged: 0,
        targetCanCastSpells: 0,
        targetNotYetActed: 0,
        targetWoundedFraction: 0,
        targetFocusFire: 0,
    },
});

test("ranged comparisons require supported estimates and no extra friendly damage", () => {
    const best = shot(200, true),
        other = shot(100);
    expect(hasClearPremiumAttackAdvantage(best, other)).toBe(true);
    expect(hasClearPremiumAttackAdvantage({ ...best, shotFeatures: undefined }, other)).toBe(false);
    expect(hasClearPremiumAttackAdvantage(best, { ...other, shotFeatures: undefined })).toBe(false);
    expect(
        hasClearPremiumAttackAdvantage(
            {
                ...best,
                shotFeatures: { ...best.shotFeatures!, friendlyFireDamage: 1 },
            },
            other,
        ),
    ).toBe(false);
    expect(
        hasClearPremiumAttackAdvantage(
            {
                ...best,
                shotFeatures: { ...best.shotFeatures!, primaryTargetDamage: 99 },
            },
            other,
        ),
    ).toBe(false);
    expect(
        hasClearPremiumAttackAdvantage(
            {
                ...best,
                shotFeatures: { ...best.shotFeatures!, enemyDamage: NaN },
            },
            other,
        ),
    ).toBe(false);
});
