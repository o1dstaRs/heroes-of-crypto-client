import { expect, test } from "bun:test";

import { FactionVals, type UnitProperties } from "@heroesofcrypto/common";

import { formatSidebarAttackModifier, formatSidebarModifier, formatSidebarStat } from "./sidebarMetrics";
import { areUnitStatsPropsEqual } from "./unitStatsMemo";
import { DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING } from "../leftSidebarPortraitTuning";
import type { IVisibleOverallImpact } from "../../scenes/VisibleState";

const impact = (): IVisibleOverallImpact => ({ abilities: [], buffs: [], debuffs: [] });
const unit = (rangeShots: number): UnitProperties =>
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
        range_shots: rangeShots,
        range_shots_mod: 0,
        magic_resist_mod: 0,
    }) as UnitProperties;

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

test("stat modifiers keep their sign, drop float noise, and vanish at zero", () => {
    expect(formatSidebarModifier(2.4000000953674316)).toBe("+2.4");
    expect(formatSidebarModifier(-1.25)).toBe("-1.25");
    expect(formatSidebarModifier(0)).toBe("");
    expect(formatSidebarAttackModifier(5, 1.5)).toBe("+5 x1.5");
    expect(formatSidebarAttackModifier(-2, 0.75)).toBe("-2 x0.75");
    expect(formatSidebarAttackModifier(0, 1)).toBe("");
});

// The armor pair dedups on the FORMATTED figures: two armors that differ only past the displayed
// hundredths must collapse to the single regular-armor cell.
test("ranged armor hides when it formats identically to melee armor", () => {
    expect(formatSidebarStat(3.4512) === formatSidebarStat(3.4534)).toBe(true);
    expect(formatSidebarStat(3.45) === formatSidebarStat(3.46)).toBe(false);
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

test("left battle portrait uses the approved inset and seven-percent creature reduction", () => {
    expect(DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING.containerOffsetX).toBe(1);
    expect(DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING.containerWidth).toBe(99);
    expect(DEFAULT_LEFT_SIDEBAR_PORTRAIT_TUNING.artScale).toBe(0.93);
});
