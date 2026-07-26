import { describe, expect, test } from "bun:test";

import { splitAreaThrowWaves } from "./Sandbox";

type Splash = Parameters<typeof splitAreaThrowWaves>[0];

const entry = (unitId: string, amount: number, unitsDied = 0) =>
    ({ unitId, amount, unitsDied, position: { x: 0, y: 0 } }) as never;

/**
 * Gargantuan's Area Throw with Double Shot. The engine resolves both waves inside one apply() and
 * appends the second wave's per-unit numbers to the same splash array, so a unit caught by both
 * appears twice — wave 1 first.
 */
describe("area throw wave split", () => {
    test("splits a Double Shot area attack into its two waves, in order", () => {
        const splash = [entry("orc", 7), entry("peasant", 5), entry("orc", 6), entry("peasant", 4, 1)] as Splash;

        const waves = splitAreaThrowWaves(splash);

        expect(waves).toHaveLength(2);
        expect(waves[0].map((e) => [e.unitId, e.amount])).toEqual([
            ["orc", 7],
            ["peasant", 5],
        ]);
        expect(waves[1].map((e) => [e.unitId, e.amount])).toEqual([
            ["orc", 6],
            ["peasant", 4],
        ]);
    });

    // The regression this split exists for: ranked replays the throw against an attacker rebuilt from
    // the authoritative snapshot, where hasAbilityActive("Double Shot") came back false and the second
    // projectile was skipped even though both waves of damage landed. The wave count must come from the
    // damage itself so the throws follow it.
    test("reports two waves purely from the damage, with no ability flag involved", () => {
        const splash = [entry("orc", 7), entry("orc", 6)] as Splash;

        expect(splitAreaThrowWaves(splash)).toHaveLength(2);
    });

    test("a single-wave area attack stays one wave holding every splashed unit", () => {
        const splash = [entry("orc", 7), entry("peasant", 5), entry("troll", 3)] as Splash;

        const waves = splitAreaThrowWaves(splash);

        expect(waves).toHaveLength(1);
        expect(waves[0]).toHaveLength(3);
    });

    test("a unit killed by wave one only appears in wave one", () => {
        const splash = [entry("orc", 7), entry("peasant", 9, 2), entry("orc", 6)] as Splash;

        const waves = splitAreaThrowWaves(splash);

        expect(waves[0].map((e) => e.unitId)).toEqual(["orc", "peasant"]);
        expect(waves[1].map((e) => e.unitId)).toEqual(["orc"]);
    });

    test("no splash means no waves, so the caller falls back to its HP-diff numbers", () => {
        expect(splitAreaThrowWaves(undefined)).toEqual([]);
        expect(splitAreaThrowWaves([] as unknown as Splash)).toEqual([]);
    });
});
