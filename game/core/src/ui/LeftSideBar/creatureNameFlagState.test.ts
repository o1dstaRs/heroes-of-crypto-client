import { expect, test } from "bun:test";

import { creatureFlagFraction, advanceCreatureFlag } from "./creatureNameFlagState";
import { areUnitStatsPropsEqual } from "./unitStatsMemo";
import { TeamVals, FactionVals, type UnitProperties } from "@heroesofcrypto/common";

test("stack depletion and resurrection use living plus fallen, including a wiped stack", () => {
    expect(creatureFlagFraction(100, 0)).toBe(1);
    expect(creatureFlagFraction(40, 60)).toBe(0.4);
    expect(creatureFlagFraction(70, 30)).toBe(0.7);
    expect(creatureFlagFraction(0, 100)).toBe(0);
    expect(creatureFlagFraction(0, 0)).toBe(0);
    expect(creatureFlagFraction(10, Number.NaN)).toBe(1);
    expect(creatureFlagFraction(-3, 10)).toBe(0);
});

test("depletion is monotone and frame-rate independent without crossing its target", () => {
    const advanceFor = (fps: number, start: number, target: number) => {
        let value = start;
        for (let i = 0; i < fps / 4; i++) {
            const next = advanceCreatureFlag(value, target, 1 / fps);
            expect(next).toBeGreaterThanOrEqual(Math.min(start, target));
            expect(next).toBeLessThanOrEqual(Math.max(start, target));
            value = next;
        }
        return value;
    };
    expect(advanceFor(60, 1, 0.4)).toBeCloseTo(advanceFor(120, 1, 0.4), 8);
    expect(advanceFor(60, 0.4, 0.7)).toBeCloseTo(advanceFor(120, 0.4, 0.7), 8);
});

test("a changed casualty denominator refreshes the sidebar even at the same living count", () => {
    const unit = { id: "stack", name: "Peasant", amount_alive: 40, amount_died: 60 } as UnitProperties;
    const props = {
        unitProperties: unit,
        factionType: FactionVals.NO_FACTION,
        overallImpact: { abilities: [], buffs: [], debuffs: [] },
    };
    expect(areUnitStatsPropsEqual(props, { ...props, unitProperties: { ...unit, amount_died: 20 } })).toBe(false);
});

test("cloth mesh has continuous shared vertices and nondegenerate consistently wound triangles", async () => {
    const { createCreatureFlagMesh } = await import("./creatureNameFlagMesh");
    const { vertices, indices } = createCreatureFlagMesh();
    expect(vertices.length).toBe(97 * 13 * 2);
    expect(indices.length).toBe(96 * 12 * 6);
    for (let i = 0; i < indices.length; i += 3) {
        const [a, b, c] = Array.from(indices.slice(i, i + 3), (index) => index * 2);
        expect(c + 1).toBeLessThan(vertices.length);
        const area =
            (vertices[b] - vertices[a]) * (vertices[c + 1] - vertices[a + 1]) -
            (vertices[b + 1] - vertices[a + 1]) * (vertices[c] - vertices[a]);
        expect(area).toBeLessThan(0);
    }
});

test("team changes refresh the same inspected unit", () => {
    const unit = { id: "stack", name: "Peasant", team: TeamVals.LEFT } as UnitProperties;
    const props = {
        unitProperties: unit,
        factionType: FactionVals.NO_FACTION,
        overallImpact: { abilities: [], buffs: [], debuffs: [] },
    };
    expect(areUnitStatsPropsEqual(props, { ...props, unitProperties: { ...unit, team: TeamVals.RIGHT } })).toBe(false);
});

test("flag materials preserve fixed green and red team identity across shadows and highlights", async () => {
    const { creatureNameFlagPalette, creatureFlagPixelRatio } = await import("./creatureNameFlagPalette");
    const green = creatureNameFlagPalette(TeamVals.LEFT);
    const red = creatureNameFlagPalette(TeamVals.RIGHT);
    for (const tone of ["shadow", "light"] as const) {
        expect(green[tone][1]).toBeGreaterThan(green[tone][0]);
        expect(green[tone][1]).toBeGreaterThan(green[tone][2]);
        expect(red[tone][0]).toBeGreaterThan(red[tone][1]);
        expect(red[tone][0]).toBeGreaterThan(red[tone][2]);
        for (const value of [...green[tone], ...red[tone]]) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
        }
    }
    expect(creatureFlagPixelRatio(1)).toBe(2);
    expect(creatureFlagPixelRatio(2)).toBe(2);
    expect(creatureFlagPixelRatio(4)).toBe(3);
    expect(creatureFlagPixelRatio(Number.NaN)).toBe(2);
});
