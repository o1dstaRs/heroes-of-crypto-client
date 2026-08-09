import { expect, test } from "bun:test";

import { FactionVals, type UnitProperties } from "@heroesofcrypto/common";

import { formatSidebarStat } from "./sidebarMetrics";
import { areUnitStatsPropsEqual } from "./unitStatsMemo";
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

test("sidebar stats preserve tenths and omit a trailing zero for whole values", () => {
    expect(formatSidebarStat(2.1)).toBe("2.1");
    expect(formatSidebarStat(2.4)).toBe("2.4");
    expect(formatSidebarStat(4)).toBe("4");
    expect(formatSidebarStat(9.5)).toBe("9.5");
    expect(formatSidebarStat(10.04)).toBe("10");
});
