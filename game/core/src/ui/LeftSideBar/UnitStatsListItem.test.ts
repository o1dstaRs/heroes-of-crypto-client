import { expect, test } from "bun:test";

import { AttackVals, FactionVals, type UnitProperties } from "@heroesofcrypto/common";

import { formatSidebarAttackModifier, formatSidebarModifier, formatSidebarStat } from "./sidebarMetrics";
import { areUnitStatsPropsEqual, getSidebarRangedStats } from "./unitStatsMemo";
import type { IVisibleOverallImpact } from "../../scenes/VisibleState";

const impact = (): IVisibleOverallImpact => ({ abilities: [], buffs: [], debuffs: [] });
const unit = (rangeShots: number, overrides: Partial<UnitProperties> = {}): UnitProperties =>
    ({
        id: "archer",
        name: "Archer",
        amount_alive: 1,
        hp: 10,
        steps: 3,
        attack_mod: 0,
        attack_multiplier: 1,
        armor_mod: 0,
        steps_mod: 0,
        luck_mod: 0,
        attack_type: AttackVals.RANGE,
        shot_distance: 6,
        range_shots: rangeShots,
        range_shots_mod: 0,
        magic_resist_mod: 0,
        ...overrides,
    }) as UnitProperties;

test("native ranged units keep showing their shot count when the quiver is empty", () => {
    expect(getSidebarRangedStats(unit(0))).toEqual({ shotDistance: 6, remainingShots: 0 });
});

test("runtime ranged attacks show their replacement ammunition", () => {
    expect(
        getSidebarRangedStats(
            unit(0, {
                attack_type: AttackVals.MELEE,
                range_shots_mod: 4,
            }),
        ),
    ).toEqual({ shotDistance: 6, remainingShots: 4 });
});

test("melee-only units do not gain a ranged sidebar cell", () => {
    expect(
        getSidebarRangedStats(
            unit(0, {
                attack_type: AttackVals.MELEE,
                shot_distance: 0,
            }),
        ),
    ).toBeUndefined();
});

test("remaining shots invalidate the memoized sidebar card", () => {
    const overallImpact = impact();
    expect(
        areUnitStatsPropsEqual(
            { unitProperties: unit(6), overallImpact, factionType: FactionVals.NO_FACTION },
            { unitProperties: unit(5), overallImpact, factionType: FactionVals.NO_FACTION },
        ),
    ).toBe(false);
});

test("a reconciled live unit invalidates through its rebuilt impact", () => {
    const liveUnit = unit(5);
    expect(
        areUnitStatsPropsEqual(
            { unitProperties: liveUnit, overallImpact: impact(), factionType: FactionVals.NO_FACTION },
            { unitProperties: liveUnit, overallImpact: impact(), factionType: FactionVals.NO_FACTION },
        ),
    ).toBe(false);
});

test("sidebar stats preserve meaningful decimals and omit trailing zeroes", () => {
    expect(formatSidebarStat(2.1)).toBe("2.1");
    expect(formatSidebarStat(2.4)).toBe("2.4");
    expect(formatSidebarStat(4)).toBe("4");
    expect(formatSidebarStat(2.93)).toBe("2.93");
    expect(formatSidebarStat(7.75)).toBe("7.75");
    expect(formatSidebarStat(10.04)).toBe("10.04");
    expect(formatSidebarStat(2.4000000953674316)).toBe("2.4");
});

test("sidebar modifiers remain separate, signed context beside the effective stat", () => {
    expect(formatSidebarModifier(2.4000000953674316)).toBe("+2.4");
    expect(formatSidebarModifier(-1.25)).toBe("-1.25");
    expect(formatSidebarModifier(0)).toBe("");
    expect(formatSidebarAttackModifier(5, 1.5)).toBe("+5 x1.5");
    expect(formatSidebarAttackModifier(-2, 0.75)).toBe("-2 x0.75");
    expect(formatSidebarAttackModifier(0, 1)).toBe("");
});
