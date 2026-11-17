import spells from "../../../heroes-of-crypto-common/src/configuration/spells.json";
import creatures from "../../../heroes-of-crypto-common/src/configuration/creatures.json";
import abilities from "../../../heroes-of-crypto-common/src/configuration/abilities.json";
import { ToFactionName, type GameEvent, type Unit } from "@heroesofcrypto/common";

export const EFFECT_FACTION_COLORS = {
    Life: "#f2cf7b",
    Nature: "#98d78a",
    Chaos: "#f2a15f",
    Death: "#8dbdf5",
    Order: "#c7b7f0",
    Might: "#adc9e6",
    System: "#e9e6df",
} as const;
export type EffectFaction = keyof typeof EFFECT_FACTION_COLORS;
export interface EffectCaption {
    name: string;
    faction: EffectFaction;
    color: string;
}
const schools = new Map<string, EffectFaction>();
for (const [faction, entries] of Object.entries(spells)) {
    if (faction === "System" || typeof entries !== "object") continue;
    for (const name of Object.keys(entries)) schools.set(name, faction as EffectFaction);
}
const owners = new Map<string, Set<EffectFaction>>();
const addOwner = (name: string, faction: EffectFaction) => {
    const factions = owners.get(name) ?? new Set<EffectFaction>();
    factions.add(faction);
    owners.set(name, factions);
};
for (const [faction, entries] of Object.entries(creatures)) {
    if (typeof entries !== "object") continue;
    for (const creature of Object.values(entries)) {
        for (const spell of creature.spells) addOwner(spell.split(":")[1], faction as EffectFaction);
        for (const name of creature.abilities) {
            addOwner(name, faction as EffectFaction);
            const definition = abilities[name as keyof typeof abilities];
            const effect = typeof definition === "object" ? definition.effect : undefined;
            if (effect) addOwner(effect, faction as EffectFaction);
        }
    }
}
const sourceNames: Readonly<Record<string, string>> = {
    "Crafted Double Punch": "Craft",
    "Crafted Double Shot": "Craft",
    "Crafted Frozen Sword": "Craft",
    "Crafted Frozen Bow": "Craft",
    "Armor Rune": "Craft",
    "Weapon Rune": "Craft",
    Hamstring: "Hamstrung",
};
/** School belongs to the effect, not the affected army. Shared/unknown origins use neutral text. */
export function effectCaption(name: string, sourceFaction?: EffectFaction): EffectCaption {
    const source = sourceNames[name] ?? name;
    const factions = owners.get(source);
    const faction = schools.get(source) ?? sourceFaction ?? (factions?.size === 1 ? [...factions][0] : "System");
    return { name, faction, color: EFFECT_FACTION_COLORS[faction] };
}

/** On-hit/counter and spell records identify the source even when a status has several native owners. */
export function effectSourceFaction(
    events: readonly GameEvent[] | undefined,
    recipientId: string,
    units: ReadonlyMap<string, Unit>,
): EffectFaction | undefined {
    for (const event of events ?? []) {
        const sourceId =
            event.type === "spell_cast"
                ? event.casterId
                : event.type === "unit_attacked"
                  ? event.attackerId === recipientId
                      ? event.targetId
                      : event.attackerId
                  : undefined;
        const source = sourceId ? units.get(sourceId) : undefined;
        const faction = source?.getFaction?.();
        const name = faction === undefined ? undefined : ToFactionName[faction];
        if (name && name in EFFECT_FACTION_COLORS) return name as EffectFaction;
    }
    return undefined;
}
