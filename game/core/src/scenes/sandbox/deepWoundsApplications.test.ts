import { describe, expect, test } from "bun:test";
import { countDeepWoundsApplications, deepWoundsVisualLevel } from "./deepWoundsApplications";

describe("Deep Wounds impact applications", () => {
    test("matches the highest held card rather than stacked power or summed card levels", () => {
        expect(deepWoundsVisualLevel(["Deep Wounds Level 0"])).toBe(1);
        expect(deepWoundsVisualLevel(["Deep Wounds Level 1"])).toBe(1);
        expect(deepWoundsVisualLevel(["Deep Wounds Level 2", "Deep Wounds Level 1"])).toBe(2);
        expect(deepWoundsVisualLevel(["Battle Roar", "Deep Wounds Level 3"])).toBe(3);
    });
    test("retains each landed blow and includes journal-only sweep wounds without double counting", () => {
        const primary = { unitId: "victim", kind: "effect", name: "Deep Wounds" } as const;
        const counts = countDeepWoundsApplications(
            [
                { unitId: "victim", power: 6 },
                { unitId: "victim", power: 12 },
                { unitId: "attacker", power: 24 },
                { unitId: "missed", power: 0 },
                { unitId: "invalid", power: NaN },
            ],
            [
                {
                    type: "effects_applied",
                    applications: [
                        primary,
                        primary,
                        { ...primary, unitId: "attacker" },
                        { ...primary, unitId: "sweep victim" },
                        { ...primary, unitId: "resisted", resisted: true },
                        { ...primary, unitId: "slowed", name: "Slow" },
                    ],
                },
            ],
        );
        expect([...counts]).toEqual([
            ["victim", 2],
            ["attacker", 1],
            ["sweep victim", 1],
        ]);
        expect(countDeepWoundsApplications(undefined).size).toBe(0);
    });
});
