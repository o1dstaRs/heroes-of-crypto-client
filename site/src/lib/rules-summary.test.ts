import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
    NUMBER_OF_LAPS_TILL_NARROWING_NORMAL,
    NUMBER_OF_LAPS_TILL_STOP_NARROWING,
} from "@heroesofcrypto/common/src/constants";

test("both FIRE PIT map summaries retain the engine's narrowing schedule and drying explanation", () => {
    const source = readFileSync(new URL("../components/RulesPage.astro", import.meta.url), "utf8");
    const tables = [...source.matchAll(/maps:\s*(\[[\s\S]*?\n\s*\]),/g)];
    expect(tables).toHaveLength(2);
    const laps = [];
    for (
        let lap = NUMBER_OF_LAPS_TILL_NARROWING_NORMAL + 1;
        lap <= NUMBER_OF_LAPS_TILL_STOP_NARROWING;
        lap += NUMBER_OF_LAPS_TILL_NARROWING_NORMAL
    ) {
        laps.push(lap);
    }
    for (const [, literal] of tables) {
        const rows = new Function(`return (${literal});`)() as { name: string; center: string; narrows: string }[];
        const fire = rows.find((row) => row.name === "FIRE PIT")!;
        expect(fire.narrows.match(/\d+/g)?.map(Number)).toEqual(laps);
        expect(fire.center).toMatch(/dries|высыхает/);
        expect(fire.center).toContain("10");
    }
});
