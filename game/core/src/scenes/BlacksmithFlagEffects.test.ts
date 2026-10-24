import { expect, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { canPreviewCreatureLabState } from "../ui/creatureAnimationLabCapabilities";
import { BLACKSMITH_CRAFT_FLAGS, BLACKSMITH_FLAG_KINDS } from "./blacksmithFlagEffects";

function fixture() {
    const pops: string[] = [];
    const flashes: string[] = [];
    const failures: { x: number; y: number }[] = [];
    const scheduled: { callback: () => void; delay: number }[] = [];
    const prepared: string[] = [];
    const makeUnit = (id: string, dead = false) => ({
        getId: () => id,
        isDead: () => dead,
        getFlagEffectAnchor: () => ({ x: 100, y: 200 }),
        flashBuffApplied: () => flashes.push(id),
    });
    const caster = makeUnit("smith");
    const recipient = makeUnit("ally");
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: {
            getAllUnits: () =>
                new Map([
                    ["smith", caster],
                    ["ally", recipient],
                    ["dead", makeUnit("dead", true)],
                ]),
        },
        sc_sceneSettings: { getGridSettings: () => ({}) },
        scheduleSceneTimeout: (callback: () => void, delay: number) => scheduled.push({ callback, delay }),
        combatVisuals: {
            prepareCommonFlagPop: (kind: string) => prepared.push(kind),
            spawnCommonFlagPop: (unit: typeof caster, kind: string) => pops.push(`${unit.getId()}:${kind}`),
            showCraftFail: (pos: { x: number; y: number }) => failures.push(pos),
        },
    });
    return { scene, caster, pops, flashes, failures, scheduled, prepared };
}
const cast = (spellName: string, outcome: string, unitId = "ally") =>
    [
        {
            type: "spell_cast",
            casterId: "smith",
            spellName,
            unitIdsDied: [],
            animations: [],
            outcomes: [{ unitId, outcome, amount: 3 }],
        },
    ] as GameEvent[];

test("Craft announces the actual smith; successful recorded runes announce their recipient", () => {
    const f = fixture();
    expect(f.scene.showBlacksmithCraft(f.caster)).toBe(650);
    f.scene.renderCastOutcomes(cast("Armor Rune", "enchanted"));
    f.scene.renderCastOutcomes(cast("Weapon Rune", "enchanted"));
    f.scene.renderCastOutcomes(cast("Armor Rune", "enchanted", "smith"));
    expect(f.pops).toEqual([
        "smith:blacksmith_craft",
        "ally:blacksmith_armor",
        "ally:blacksmith_weapon",
        "smith:blacksmith_armor",
    ]);
    expect(f.flashes).toEqual(["ally", "ally", "smith"]);
});

test("failed, absent and dead recipients never receive a successful rune cue", () => {
    const f = fixture();
    f.scene.renderCastOutcomes(cast("Armor Rune", "failed"));
    f.scene.renderCastOutcomes(cast("Weapon Rune", "enchanted", "dead"));
    f.scene.renderCastOutcomes(cast("Armor Rune", "enchanted", "missing"));
    f.scene.renderCastOutcomes(cast("Unrelated spell", "enchanted"));
    expect(f.pops).toEqual([]);
    expect(f.flashes).toEqual([]);
    expect(f.failures).toEqual([{ x: 100, y: 200 }]);
});

test("the lab exposes every smith craft result and rune", () => {
    for (const state of BLACKSMITH_FLAG_KINDS) {
        expect(
            canPreviewCreatureLabState(
                {
                    name: "Blacksmith",
                    abilities: [],
                    spells: ["System:Craft", "System:Armor Rune", "System:Weapon Rune"],
                },
                state,
            ),
        ).toBe(true);
        expect(canPreviewCreatureLabState({ name: "Wolf", abilities: [], spells: [] }, state)).toBe(false);
    }
});

test.each(Object.entries(BLACKSMITH_CRAFT_FLAGS))("Craft delivers %s only after the forge", (ability, kind) => {
    const f = fixture();
    const events = cast("Craft", ability.includes("Frozen") ? "frozen" : "double");
    (events[0] as Extract<GameEvent, { type: "spell_cast" }>).outcomes![0].grantedAbility = ability;
    expect(f.scene.renderSpellCastSequence(f.caster, "Craft", events)).toBe(1380);
    expect(f.pops).toEqual(["smith:blacksmith_craft"]);
    expect(f.flashes).toEqual([]);
    expect(f.prepared).toContain(kind);
    expect(f.scheduled[0].delay).toBe(730);
    f.scheduled[0].callback();
    expect(f.pops).toEqual(["smith:blacksmith_craft", `ally:${kind}`]);
    expect(f.flashes).toEqual(["ally"]);
});

test.each(["Armor Rune", "Weapon Rune"])("%s always forges first, even on a failed roll", (spellName) => {
    const f = fixture();
    f.scene.renderSpellCastSequence(f.caster, spellName, cast(spellName, "failed"));
    expect(f.pops).toEqual(["smith:blacksmith_craft"]);
    expect(f.failures).toEqual([]);
    f.scheduled[0].callback();
    expect(f.pops).toEqual(["smith:blacksmith_craft"]);
    expect(f.failures).toEqual([{ x: 100, y: 200 }]);
});

test("Craft backfire and nothing announce their actual recipients after forging", () => {
    const f = fixture();
    const events = [...cast("Craft", "stun", "smith"), ...cast("Craft", "nothing")];
    f.scene.renderSpellCastSequence(f.caster, "Craft", events);
    expect(f.pops).toEqual(["smith:blacksmith_craft"]);
    f.scheduled[0].callback();
    expect(f.pops).toEqual(["smith:blacksmith_craft", "smith:stun"]);
    expect(f.failures).toEqual([{ x: 100, y: 200 }]);
    expect(f.flashes).toEqual([]);
});

test("unknown craft abilities and unrelated spells do not invent successful buffs or forging", () => {
    const f = fixture();
    f.scene.renderCastOutcomes(cast("Craft", "double"));
    f.scene.renderSpellCastSequence(f.caster, "Heal", []);
    expect(f.pops).toEqual([]);
    expect(f.scheduled).toEqual([]);
});
