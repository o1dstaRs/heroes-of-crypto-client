import { expect, test } from "bun:test";
import { effectCaption, effectSourceFaction, EFFECT_FACTION_COLORS } from "./effectCaptions";
import { FactionVals, type GameEvent, type Unit } from "@heroesofcrypto/common";
import { statusFlagName } from "./sandbox/combatStatusPopups";

test.each([
    ["Curse", "Death"],
    ["Misfortune", "Chaos"],
    ["Fireforged Sword", "Chaos"],
    ["Courage", "Life"],
    ["Helping Hand", "Life"],
    ["Petrifying Gaze", "Chaos"],
    ["Wild Regeneration", "Chaos"],
    ["Crafted Double Punch", "Life"],
    ["Weapon Rune", "Life"],
    ["Rangebane", "Order"],
] as const)("%s captions use their origin's %s color", (name, faction) => {
    expect(effectCaption(name)).toEqual({ name, faction, color: EFFECT_FACTION_COLORS[faction] });
});

test("spell schools stay stable when applied across factions; ambiguous origins stay neutral", () => {
    expect(effectCaption("Curse", "Life").faction).toBe("Death");
    expect(effectCaption("Stun").faction).toBe("System");
    expect(effectCaption("Stun", "Chaos").color).toBe(EFFECT_FACTION_COLORS.Chaos);
    expect(effectCaption("Unknown effect").faction).toBe("System");
});

test("atlas keys display actual effect names", () => {
    expect(statusFlagName("mage_fireforged")).toBe("Fireforged Sword");
    expect(statusFlagName("blacksmith_frozen_bow")).toBe("Crafted Frozen Bow");
    expect(statusFlagName("dulling_defense")).toBe("Dulling Defense");
});

test("shared Stun colors follow the striker, counterattacker or spell caster", () => {
    const units = new Map([
        ["orc", { getFaction: () => FactionVals.CHAOS }],
        ["squire", { getFaction: () => FactionVals.LIFE }],
    ]) as unknown as ReadonlyMap<string, Unit>;
    const attack = [{ type: "unit_attacked", attackerId: "orc", targetId: "squire" }] as GameEvent[];
    expect(effectSourceFaction(attack, "squire", units)).toBe("Chaos");
    expect(effectSourceFaction(attack, "orc", units)).toBe("Life");
    expect(effectSourceFaction([{ type: "spell_cast", casterId: "squire" }] as GameEvent[], "orc", units)).toBe("Life");
    expect(effectSourceFaction(undefined, "squire", units)).toBeUndefined();
});
