import { expect, test } from "bun:test";

import { FactionVals, type UnitProperties } from "@heroesofcrypto/common";

import { formatSidebarStat } from "./sidebarMetrics";
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
