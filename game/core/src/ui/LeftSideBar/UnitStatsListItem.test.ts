import { expect, test } from "bun:test";

import { FactionVals, type UnitProperties } from "@heroesofcrypto/common";

import { formatInitiative } from "./sidebarMetrics";
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

test("initiative always keeps one visible decimal without rounding away tenths", () => {
    expect(formatInitiative(2.1)).toBe("2.1");
    expect(formatInitiative(2.4)).toBe("2.4");
    expect(formatInitiative(4)).toBe("4.0");
});
