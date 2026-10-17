import { expect, test } from "bun:test";
import { HoCConfig, TeamVals } from "@heroesofcrypto/common";

import { PixiScene } from "./PixiScene";

test.each([
    [
        "Artifact. +{}% healing and resurrection; the Troll's ability is not consumed.\nLasts till the end of the fight.;25;",
        "Artifact. +25% healing and resurrection; the Troll's ability is not consumed.\nLasts till the end of the fight.",
    ],
    ["Movement is blocked; the unit can still attack.;", "Movement is blocked; the unit can still attack."],
    ["Damage is reduced by {}%; applies on every hit.;12.5;", "Damage is reduced by 12.5%; applies on every hit."],
    ["{} attack and {} defense; lasts this round.;-2;0", "-2 attack and 0 defense; lasts this round."],
    ["A plain description; with punctuation", "A plain description; with punctuation"],
])("applied impact preserves prose and fills only numeric suffixes: %s", (raw, expected) => {
    const properties = HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Peasant", "", 1);
    properties.applied_buffs = ["Holy Cross"];
    properties.applied_buffs_laps = [99];
    properties.applied_buffs_descriptions = [raw];
    properties.applied_debuffs = ["Dulling Defense"];
    properties.applied_debuffs_laps = [99];
    properties.applied_debuffs_descriptions = [raw];
    const impact = (Object.create(PixiScene.prototype) as PixiScene).getUnitVisibleImpact(properties);
    expect(impact.buffs.find((entry) => entry.name === "Holy Cross")?.description).toBe(expected);
    expect(impact.debuffs.find((entry) => entry.name === "Dulling Defense")?.description).toBe(expected);
});
