import { portraitArtUrl } from "./portrait";
import { abilityDescriptionRuTemplates } from "../../../game/core/src/i18n/ruAbilityDescriptions";
import { catalogIconUrl } from "./catalog-icon";
import creaturesJson from "@heroesofcrypto/common/src/configuration/creatures.json";
import abilitiesJson from "@heroesofcrypto/common/src/configuration/abilities.json";
import effectsJson from "@heroesofcrypto/common/src/configuration/effects.json";

import { factionColors, factionOrder, type FactionName } from "./factions";
export { factionColors, factionOrder, type FactionName } from "./factions";

interface RawCreature {
    name: string;
    hp: number;
    steps: number;
    initiative: number;
    armor: number;
    attack_type: string;
    attack: number;
    attack_damage_min: number;
    attack_damage_max: number;
    attack_range: number;
    range_shots: number;
    shot_distance: number;
    magic_resist: number;
    movement_type: string;
    exp: number;
    size: number;
    footprint_width?: number;
    footprint_height?: number;
    level: number;
    spells: string[];
    abilities: string[];
}

interface RawAbility {
    name: string;
    type: string;
    desc: string[];
    power: number | null;
    power_type: string;
    stack_powered: boolean;
    aura_effect: string | null;
    can_be_cast: boolean;
}

type CreatureMap = Record<string, RawCreature>;

const slug = (name: string) =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");

const abilityIconOverrides: Readonly<Record<string, string>> = {
    "Luck Blessing": "/assets/images/units/abilities/luck_aura_256.webp",
    "Sylvan Focus Blessing": "/assets/images/units/abilities/sylvan_focus_aura_256.webp",
    "Tie up the Horses Blessing": "/assets/images/units/abilities/tie_up_the_horses_aura_256.webp",
    "Wolf Trail Blessing": "/assets/images/units/abilities/wolf_trail_aura_256.webp",
    "Arcane Ward Blessing": "/assets/images/units/abilities/arcane_ward_blessing_256.webp",
    "Warding Mane Blessing": "/assets/images/units/abilities/warding_mane_aura_256.webp",
    "Angelic Host Blessing": "/assets/images/units/abilities/angelic_host_256.webp",
    "Arrows Wingshield Blessing": "/assets/images/units/abilities/arrows_wingshield_aura_256.webp",
    "Rallying Volley Blessing": "/assets/images/units/abilities/rallying_volley_blessing_256.webp",
    "Sharpened Weapons Blessing": "/assets/images/units/abilities/sharpened_weapons_aura_256.webp",
};

const abilityIcon = (name: string): string =>
    catalogIconUrl(abilityIconOverrides[name] ?? `/assets/images/units/abilities/${slug(name)}_256.webp`);

// Mirrors common's MAX_UNIT_STACK_POWER (constants.ts) — the ceiling chakramBounceBudget clamps to.
const MAX_UNIT_STACK_POWER = 5;

// getCraftChances(0) from common's abilities/craft_ability.ts: stun = clamp(10 - luck), frozen = 20 - stun,
// with nothing/double fixed. Always sums to 100.
const NEUTRAL_LUCK_CRAFT_CHANCES = { double: 40, frozen: 10, stun: 10, nothing: 40 } as const;

// English card text where the game's own tooltip contradicts what the engine does. Each one was checked
// against the engine (common): the tooltip keeps the old wording until the game fixes it, but the Knowledge
// Base should not repeat it. "{}" takes the ability's power exactly like the game's template.
const abilityDescriptionOverridesEn: Record<string, string[]> = {
    "Rallying Volley Blessing": [
        "All allied ranged units gain +{} shots once per fight at any distance.",
        "This bonus does not stack across carriers and is unaffected by stack power or Aura Range.",
    ],
    "Absorb Penalties Aura": [
        "The unit has a {}% chance to take an enemy spell debuff, Spit Ball debuff or Hamstring aimed at an ally within range and suffer it instead. On-hit effects such as Stun or Blindness are not absorbed.",
    ],
    "Bitter Experience": [
        "Every hit that kills at least one creature of the stack, while the stack survives, gives it +1 armor and +1 step for the rest of the battle.",
    ],
    Chakram: [
        "Maximum targets: {}. Ranged attacks hit the chosen enemy, then the disc turns clockwise to the next eligible enemy. A 1-cell gap keeps full damage; a 2-cell gap halves it and ends the flight there. A dodged target also ends it. Each enemy is hit once, and allies are never hit.",
    ],
    "Deep Wounds Level 1": [
        "Each melee attack or response adds {}% to the target's Deep Wounds, and every attacker with a Deep Wounds ability deals that much more damage to it. The wounds stack",
    ],
    "Deep Wounds Level 2": [
        "Each melee attack or response adds {}% to the target's Deep Wounds, and every attacker with a Deep Wounds ability deals that much more damage to it. The wounds stack",
    ],
    "Deep Wounds Level 3": [
        "Each melee attack or response adds {}% to the target's Deep Wounds, and every attacker with a Deep Wounds ability deals that much more damage to it. The wounds stack",
    ],
    "Heavy Armor": [
        "Has {}% additional base armor, while taking {}% more damage from magic — spells, Fire Wall, Fireforged burns, Chain Lightning, Fire Breath and Fire Shield",
    ],
    "Magic Reflection": [
        "Rebounds every spell aimed at this creature {}% of the time. The spell still lands on the dragon in full — a rebound strikes the caster with that same share of the damage the dragon took and copies a debuff onto it",
    ],
    Mechanism: [
        "Immune to Mind attacks and spells and to poison. 50% more vulnerable to Status attacks and to physical area attacks. Cannot be healed or resurrected, and always has 0 morale",
    ],
    "Penetrating Bite": ["Melee attacks deal additional damage equal to {}% of one target creature's max health"],
    "Petrifying Gaze": [
        "Every landed hit also kills extra creatures worth part of its damage, then may petrify (instantly kill) the target's front creature. Higher-level units are easier to petrify; ranged shots petrify less the farther away the target is.",
    ],
};

// The card's stack-power badge follows common's `stack_powered` flag, which is set on two abilities whose
// strength never depends on stack power: Dulling Defense takes a flat 2 attack, Pegasus Light gives flat
// morale. The badge would tell a player to protect a stack size that does not matter.
const notStackScaled = new Set(["Dulling Defense", "Pegasus Light"]);

export function abilityDescription(name: string, language: "en" | "ru" = "en"): string {
    const ability = (abilitiesJson as Record<string, RawAbility>)[name];
    if (!ability || !ability.desc?.length) {
        return "";
    }
    const descriptionTemplate =
        language === "ru"
            ? (abilityDescriptionRuTemplates[name] ?? ability.desc)
            : (abilityDescriptionOverridesEn[name] ?? ability.desc);
    const joined = descriptionTemplate.join("\n");
    if (ability.power === null || ability.power === undefined) {
        return joined.replace(/\{\}/g, "");
    }
    if (name === "Chain Lightning") {
        const p = ability.power;
        return joined
            .replace("{}", String(Math.round(p)))
            .replace("{}", String(Math.round((p / 8) * 7)))
            .replace("{}", String(Math.round((p / 8) * 6)))
            .replace("{}", String(Math.round((p / 8) * 5)));
    }
    // Paralysis rolls at twice its power, and the damage cut it applies is the Paralysis EFFECT's power
    // (effects.json), not the ability's — the game's card reads it the same way.
    if (name === "Paralysis") {
        const p = ability.power;
        const cut = (effectsJson as unknown as Record<string, { power?: number }>).Paralysis?.power ?? p;
        return joined.replace("{}", String(Math.round(p * 2))).replace("{}", String(Math.round(cut)));
    }
    // Chakram's "{}" is the maximum TOTAL target count, including the chosen target. It follows the
    // caster's stack power (1..MAX_UNIT_STACK_POWER), not `power`, which is its damage percentage.
    if (name === "Chakram") {
        return joined.replace("{}", String(MAX_UNIT_STACK_POWER));
    }
    // Blacksmith Tools lists Craft's four luck-weighted outcomes; `power` is 0, so the generic
    // substitution printed "0%" for all of them. These are getCraftChances(luck) at neutral luck, where
    // luck shifts probability 1:1 from Stun to Frozen.
    if (name === "Blacksmith Tools") {
        const { double, frozen, stun, nothing } = NEUTRAL_LUCK_CRAFT_CHANCES;
        return joined
            .replace("{}", String(double))
            .replace("{}", String(frozen))
            .replace("{}", String(stun))
            .replace("{}", String(nothing));
    }
    return joined.replace(/\{\}/g, String(ability.power));
}

export interface UnitAbility {
    name: string;
    description: string;
    descriptionRu: string;
    icon: string;
    isAura: boolean;
    isCastable: boolean;
    isStackPowered: boolean;
}

export interface Unit {
    name: string;
    faction: FactionName;
    level: number;
    size: number;
    footprintWidth: number;
    footprintHeight: number;
    experience: number;
    hp: number;
    armor: number;
    attack: number;
    attackType: string;
    damageMin: number;
    damageMax: number;
    initiative: number;
    steps: number;
    rangeShots: number;
    shotDistance: number;
    magicResist: number;
    movementType: string;
    spells: string[];
    abilities: UnitAbility[];
    summonedOnly: boolean;
    /**
     * Creatures in the stack a draft gives you: every drafted creature arrives as one stack worth
     * DRAFTED_STACK_EXPERIENCE, so 1,000 ÷ its experience, rounded up. 0 for summon-only creatures.
     */
    draftedAmount: number;
    /** Identifies the creature to CreaturePortrait.astro and to the portrait recipe map. */
    slug: string;
    portrait: string;
    icon: string;
}

export interface FactionUnits {
    faction: FactionName;
    color: string;
    icon: string;
    units: Unit[];
}

const attackTypeLabel: Record<string, string> = {
    MELEE: "Melee",
    RANGE: "Ranged",
    MAGIC: "Magic",
    MELEE_MAGIC: "Melee / Magic",
};

const movementTypeLabel: Record<string, string> = {
    WALK: "Walk",
    FLY: "Fly",
    TELEPORT: "Teleport",
};

export const attackLabel = (t: string) => attackTypeLabel[t] ?? t;
export const movementLabel = (t: string) => movementTypeLabel[t] ?? t;

const summonedOnlyUnits = new Set(["Arachna Spider"]);

/* Portrait files are named with a hash of their own bytes by site/scripts/sync_portrait_art.ts, so new
   art arrives at a new URL and nginx's day-long cache can never serve a stale one. That replaced a
   hand-maintained revision map, which only ever listed the one portrait somebody remembered to bump. */

// Mirrors the ranked server's PICK_TO_PLAY_STACK_EXPERIENCE (api/game/v1/play_session_bridge.ts).
export const DRAFTED_STACK_EXPERIENCE = 1000;

function buildUnit(faction: FactionName, raw: RawCreature): Unit {
    const base = slug(raw.name);
    /* The creature art on its own, for the handful of places that want a bare image. Anything showing a
       creature to a reader renders <CreaturePortrait> instead, which composes the full portrait. */
    const portrait = portraitArtUrl(base);
    const icon = portrait;

    const abilities: UnitAbility[] = raw.abilities.map((name) => ({
        name,
        description: abilityDescription(name),
        descriptionRu: abilityDescription(name, "ru"),
        icon: abilityIcon(name),
        isAura: !!(abilitiesJson as Record<string, RawAbility>)[name]?.aura_effect,
        isCastable: !!(abilitiesJson as Record<string, RawAbility>)[name]?.can_be_cast,
        isStackPowered:
            !notStackScaled.has(name) && !!(abilitiesJson as Record<string, RawAbility>)[name]?.stack_powered,
    }));

    return {
        name: raw.name,
        faction,
        level: raw.level,
        size: raw.size,
        footprintWidth: raw.footprint_width ?? raw.size,
        footprintHeight: raw.footprint_height ?? raw.size,
        experience: raw.exp,
        hp: raw.hp,
        armor: raw.armor,
        attack: raw.attack,
        attackType: raw.attack_type,
        damageMin: raw.attack_damage_min,
        damageMax: raw.attack_damage_max,
        initiative: raw.initiative,
        steps: raw.steps,
        rangeShots: raw.range_shots,
        shotDistance: raw.shot_distance,
        magicResist: raw.magic_resist,
        movementType: raw.movement_type,
        spells: raw.spells,
        abilities,
        summonedOnly: summonedOnlyUnits.has(raw.name),
        draftedAmount: summonedOnlyUnits.has(raw.name) ? 0 : Math.max(1, Math.ceil(DRAFTED_STACK_EXPERIENCE / raw.exp)),
        slug: base,
        portrait,
        icon,
    };
}

const creatures = creaturesJson as unknown as { version: number } & Record<FactionName, CreatureMap>;

// Historical spell summons without public roster art stay hidden. New summon-only units are exposed and
// explicitly labelled so the codex remains complete without implying that they are draftable.
const hiddenUnits = new Set(["Faerie Dragon", "Phoenix"]);

export const factionUnits: FactionUnits[] = factionOrder
    .filter((faction) => creatures[faction])
    .map((faction) => ({
        faction,
        color: factionColors[faction],
        icon: catalogIconUrl(`/assets/images/units/factions/${faction.toLowerCase()}_128.webp`),
        units: Object.values(creatures[faction])
            .filter((raw) => !hiddenUnits.has(raw.name))
            .map((raw) => buildUnit(faction, raw))
            .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    }));

export const allUnits: Unit[] = factionUnits.flatMap((f) => f.units);

export const unitCount = allUnits.length;
export const abilityCount = new Set(allUnits.flatMap((u) => u.abilities.map((a) => a.name))).size;

export interface AbilityUnitRef {
    name: string;
    faction: FactionName;
    /** Identifies the creature to the composed portrait; see lib/portrait. */
    slug: string;
    icon: string;
    summonedOnly: boolean;
}

export type AbilityKind = "aura" | "active" | "passive";

export interface Ability {
    name: string;
    description: string;
    descriptionRu: string;
    icon: string;
    type: string;
    kind: AbilityKind;
    isAura: boolean;
    isCastable: boolean;
    isStackPowered: boolean;
    units: AbilityUnitRef[];
    /**
     * What grants this ability, for the ones no creature is born with. Set only for abilities forged onto a
     * unit mid-fight, whose `units` roster is empty by nature rather than by omission.
     */
    grantedBy?: string;
}

// Abilities that exist but belong to no creature's roster: Blacksmith's Craft forges these onto a unit
// during the fight. They are real, player-facing abilities with their own icons and rules, so leaving them
// out of the codex hides what Craft can actually produce — but inverting units -> abilities can never find
// them, because no creature lists them. They are added explicitly instead, labelled with what grants them
// rather than carrying a "used by" roster that would be empty and read as a mistake.
const grantedAbilities: { name: string; grantedBy: string }[] = [
    { name: "Crafted Double Punch", grantedBy: "Craft" },
    { name: "Crafted Double Shot", grantedBy: "Craft" },
    { name: "Crafted Frozen Bow", grantedBy: "Craft" },
    { name: "Crafted Frozen Sword", grantedBy: "Craft" },
];

// Derive the ability catalogue straight from the units (which are built from the game's
// creatures.json + abilities.json). Inverting units -> abilities keeps a single source of truth:
// every ability shown is one a real unit actually has, and "used by" is computed, never hand-listed.
export const abilities: Ability[] = (() => {
    const byName = new Map<string, Ability>();
    for (const unit of allUnits) {
        for (const ability of unit.abilities) {
            let entry = byName.get(ability.name);
            if (!entry) {
                const raw = (abilitiesJson as Record<string, RawAbility>)[ability.name];
                entry = {
                    name: ability.name,
                    description: ability.description,
                    descriptionRu: ability.descriptionRu,
                    icon: ability.icon,
                    type: raw?.type ?? "",
                    kind: ability.isCastable ? "active" : ability.isAura ? "aura" : "passive",
                    isAura: ability.isAura,
                    isCastable: ability.isCastable,
                    isStackPowered: ability.isStackPowered,
                    units: [],
                };
                byName.set(ability.name, entry);
            }
            if (!entry.units.some((u) => u.name === unit.name)) {
                entry.units.push({
                    name: unit.name,
                    faction: unit.faction,
                    slug: unit.slug,
                    icon: unit.icon,
                    summonedOnly: unit.summonedOnly,
                });
            }
        }
    }
    for (const granted of grantedAbilities) {
        const raw = (abilitiesJson as Record<string, RawAbility>)[granted.name];
        if (!raw || byName.has(granted.name)) {
            // Skip silently if the game ever drops the ability, or if a creature has since been given it —
            // in the latter case the derived entry above is the better one, with a real roster attached.
            continue;
        }
        byName.set(granted.name, {
            name: granted.name,
            description: abilityDescription(granted.name),
            descriptionRu: abilityDescription(granted.name, "ru"),
            icon: abilityIcon(granted.name),
            type: raw.type ?? "",
            kind: raw.can_be_cast ? "active" : raw.aura_effect ? "aura" : "passive",
            isAura: !!raw.aura_effect,
            isCastable: !!raw.can_be_cast,
            isStackPowered: !!raw.stack_powered,
            units: [],
            grantedBy: granted.grantedBy,
        });
    }
    return [...byName.values()]
        .map((ability) => ({
            ...ability,
            units: ability.units.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
})();

export const abilitiesCount = abilities.length;
