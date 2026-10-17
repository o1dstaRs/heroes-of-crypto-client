import { describe, expect, test } from "bun:test";
import { deepWoundsFlagApplications, deepWoundsVisualLevel } from "./deepWoundsFlagApplications";

describe("Deep Wounds flag applications", () => {
    test("matches the highest held card rather than stacked power or summed card levels", () => {
        expect(deepWoundsVisualLevel(["Deep Wounds Level 0"])).toBe(1);
        expect(deepWoundsVisualLevel(["Deep Wounds Level 1"])).toBe(1);
        expect(deepWoundsVisualLevel(["Deep Wounds Level 2", "Deep Wounds Level 1"])).toBe(2);
        expect(deepWoundsVisualLevel(["Battle Roar", "Deep Wounds Level 3"])).toBe(3);
        expect(
            deepWoundsFlagApplications([{ unitId: "victim", power: 120 }], {
                id: "wolf",
                abilities: ["Deep Wounds Level 1"],
            }),
        ).toEqual([{ unitId: "victim", level: 1 }]);
    });
    test("routes retaliation to the attacker and splash wounds to their actual victims", () => {
        expect(
            deepWoundsFlagApplications(
                [
                    { unitId: "behemoth", power: 6 },
                    { unitId: "wolf", power: 21 },
                    { unitId: "other", power: 42 },
                ],
                { id: "behemoth", abilities: ["Deep Wounds Level 3"] },
                { id: "wolf", abilities: ["Deep Wounds Level 1"] },
            ),
        ).toEqual([
            { unitId: "behemoth", level: 1 },
            { unitId: "wolf", level: 3 },
            { unitId: "other", level: 3 },
        ]);
    });
    test("a double punch has one readable flag cue and misses have none", () => {
        const source = { id: "wolf", abilities: ["Deep Wounds Level 1"] };
        expect(
            deepWoundsFlagApplications(
                [
                    { unitId: "victim", power: 6 },
                    { unitId: "victim", power: 12 },
                    { unitId: "missed", power: 0 },
                    { unitId: "invalid", power: NaN },
                ],
                source,
            ),
        ).toEqual([{ unitId: "victim", level: 1 }]);
        expect(deepWoundsFlagApplications(undefined, source)).toEqual([]);
    });
});
