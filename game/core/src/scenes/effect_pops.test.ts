import { describe, expect, test } from "bun:test";

import { diffUnitEffects } from "./effect_pops";

const set = (...names: string[]): Set<string> => new Set(names);

describe("diffUnitEffects", () => {
    test("seeds silently on first sight (previous sets missing) — animates nothing", () => {
        const diff = diffUnitEffects(undefined, undefined, set("Sadness"), set("Courage"));
        expect(diff.seeded).toBe(true);
        expect(diff.newDebuffs).toEqual([]);
        expect(diff.newBuffs).toEqual([]);
        expect(diff.flash).toBe("none");
    });

    test("seeds when only one of the two previous sets is missing", () => {
        // Defensive: the maps are written together, but a single missing set must still seed (not crash
        // / not treat every current effect as brand new).
        expect(diffUnitEffects(set(), undefined, set("Sadness"), set()).seeded).toBe(true);
        expect(diffUnitEffects(undefined, set(), set(), set("Courage")).seeded).toBe(true);
    });

    test("pops only the newly-applied debuff, not ones already shown", () => {
        const diff = diffUnitEffects(set("Sadness"), set(), set("Sadness", "Quagmire"), set());
        expect(diff.seeded).toBe(false);
        expect(diff.newDebuffs).toEqual(["Quagmire"]);
        expect(diff.newBuffs).toEqual([]);
        expect(diff.flash).toBe("debuff");
    });

    test("pops a newly-applied buff with the green wash", () => {
        const diff = diffUnitEffects(set(), set(), set(), set("Courage"));
        expect(diff.newBuffs).toEqual(["Courage"]);
        expect(diff.newDebuffs).toEqual([]);
        expect(diff.flash).toBe("buff");
    });

    test("a debuff hit takes wash priority over a simultaneously-applied buff", () => {
        const diff = diffUnitEffects(set(), set(), set("Weakness"), set("Courage"));
        expect(diff.newDebuffs).toEqual(["Weakness"]);
        expect(diff.newBuffs).toEqual(["Courage"]);
        expect(diff.flash).toBe("debuff");
    });

    test("no change → nothing pops and no wash", () => {
        const diff = diffUnitEffects(set("Sadness"), set("Courage"), set("Sadness"), set("Courage"));
        expect(diff.newDebuffs).toEqual([]);
        expect(diff.newBuffs).toEqual([]);
        expect(diff.flash).toBe("none");
        expect(diff.seeded).toBe(false);
    });

    test("a removed (expired) effect does not pop, and re-applying it later pops again", () => {
        // Expire: Sadness drops off — no pop.
        const expired = diffUnitEffects(set("Sadness"), set(), set(), set());
        expect(expired.newDebuffs).toEqual([]);
        expect(expired.flash).toBe("none");
        // Re-apply: Sadness comes back after being absent — pops again.
        const reapplied = diffUnitEffects(set(), set(), set("Sadness"), set());
        expect(reapplied.newDebuffs).toEqual(["Sadness"]);
        expect(reapplied.flash).toBe("debuff");
    });

    test("reports multiple newly-applied debuffs from a single Spit Ball volley in order", () => {
        const diff = diffUnitEffects(set(), set(), set("Sadness", "Quagmire", "Weakness"), set());
        expect(diff.newDebuffs).toEqual(["Sadness", "Quagmire", "Weakness"]);
        expect(diff.flash).toBe("debuff");
    });
});
