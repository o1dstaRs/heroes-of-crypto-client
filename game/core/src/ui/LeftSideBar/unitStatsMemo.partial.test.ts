import { FactionVals, TeamVals, type UnitProperties } from "@heroesofcrypto/common";
import { expect, test } from "bun:test";

import { areUnitStatsPropsEqual } from "./unitStatsMemo";

const impact = { abilities: [], buffs: [], debuffs: [] };
const props = (unitProperties: Partial<UnitProperties>) => ({
    unitProperties: unitProperties as UnitProperties,
    overallImpact: impact,
    factionType: FactionVals.LIFE,
});

test("equivalent faction-only cards tolerate absent spell arrays", () => {
    expect(areUnitStatsPropsEqual(props({}), props({}))).toBe(true);
    expect(areUnitStatsPropsEqual(props({}), props({ spells: [] }))).toBe(true);
});

test("spell charges, team and casualties invalidate the selected card", () => {
    expect(areUnitStatsPropsEqual(props({ spells: ["Craft:2"] }), props({ spells: ["Craft:1"] }))).toBe(false);
    expect(areUnitStatsPropsEqual(props({ spells: [] }), props({ spells: ["Craft:1"] }))).toBe(false);
    expect(areUnitStatsPropsEqual(props({ amount_died: 1 }), props({ amount_died: 2 }))).toBe(false);
    expect(areUnitStatsPropsEqual(props({ team: TeamVals.LEFT }), props({ team: TeamVals.RIGHT }))).toBe(false);
});
