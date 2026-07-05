import { describe, expect, test } from "bun:test";

import { animatableEffectNames, diffUnitEffects, isAuraEffectName } from "./effect_pops";

const set = (...names: string[]): Set<string> => new Set(names);

describe("isAuraEffectName / animatableEffectNames", () => {
    test("recognises aura effects by their real applied effect name (aura_effects.json) and the ' Aura' suffix", () => {
        // The ABILITY name carries the suffix...
        expect(isAuraEffectName("Luck Aura")).toBe(true);
        expect(isAuraEffectName("War Anger Aura")).toBe(true);
        expect(isAuraEffectName("Range Null Field Aura")).toBe(true);
        // ...but the EFFECT that actually lands on a unit is the SHORT name (ability "Pegasus Might Aura"
        // applies effect "Pegasus Might") — the real source of the aura-pop bug. Those must count too.
        expect(isAuraEffectName("Luck")).toBe(true);
        expect(isAuraEffectName("Pegasus Might")).toBe(true);
        expect(isAuraEffectName("War Anger")).toBe(true);
        expect(isAuraEffectName("Disguise")).toBe(true);
        // Directly-applied (cast) debuffs are not auras.
        expect(isAuraEffectName("Sadness")).toBe(false);
        expect(isAuraEffectName("Quagmire")).toBe(false);
        // A name that merely contains the word isn't an aura.
        expect(isAuraEffectName("Aura Blade")).toBe(false);
    });

    test("filters out aura effects (short applied names) and empties, keeping directly-applied effects", () => {
        const names = animatableEffectNames(["Sadness", "Luck", "", "Quagmire", "Pegasus Might", "War Anger Aura"]);
        expect([...names]).toEqual(["Sadness", "Quagmire"]);
    });

    test("a unit carrying only aura effects yields an empty animatable set", () => {
        expect(animatableEffectNames(["Luck", "Sharpened Weapons", "Pegasus Might"]).size).toBe(0);
    });

    test("the passive 'Pegasus Light' team mark is never animated (not an aura, but still excluded)", () => {
        expect(isAuraEffectName("Pegasus Light")).toBe(false);
        expect(animatableEffectNames(["Pegasus Light"]).size).toBe(0);
        expect([...animatableEffectNames(["Pegasus Light", "Sadness"])]).toEqual(["Sadness"]);
    });
});

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

    test("an aura gained as a unit moves into range does NOT pop (filtered before diff)", () => {
        // Raw buff lists as the scene would read them, using the REAL applied effect names (short, no
        // " Aura" suffix): the unit moves into a Luck aura, but also gets a real cast buff (Courage).
        // Only Courage should animate — the aura effect is filtered out.
        const prevBuffs = animatableEffectNames(["War Anger"]); // already standing in an aura
        const currentBuffs = animatableEffectNames(["War Anger", "Luck", "Courage"]);
        const diff = diffUnitEffects(set(), prevBuffs, set(), currentBuffs);
        expect(diff.newBuffs).toEqual(["Courage"]);
        expect(diff.flash).toBe("buff");
    });
});
