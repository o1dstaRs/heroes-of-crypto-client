import creaturesJson from "@heroesofcrypto/common/src/configuration/creatures.json";
import abilitiesJson from "@heroesofcrypto/common/src/configuration/abilities.json";

export type FactionName = "Life" | "Nature" | "Chaos" | "Death" | "Might";

export const factionOrder: FactionName[] = ["Chaos", "Life", "Might", "Nature"];

export const factionColors: Record<FactionName, string> = {
    Chaos: "#c63d33",
    Life: "#4ea36e",
    Might: "#e0b04a",
    Nature: "#6f9bd6",
    Death: "#8a76bf",
};

interface RawCreature {
    name: string;
    hp: number;
    steps: number;
    speed: number;
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

function abilityDescription(name: string): string {
    const ability = (abilitiesJson as Record<string, RawAbility>)[name];
    if (!ability || !ability.desc?.length) {
        return "";
    }
    const joined = ability.desc.join("\n");
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
    if (name === "Paralysis") {
        const p = ability.power;
        return joined.replace("{}", String(Math.round(p * 2))).replace("{}", String(Math.round(p)));
    }
    return joined.replace(/\{\}/g, String(ability.power));
}

export interface UnitAbility {
    name: string;
    description: string;
    icon: string;
    isAura: boolean;
    isCastable: boolean;
}

export interface Unit {
    name: string;
    faction: FactionName;
    level: number;
    size: number;
    hp: number;
    armor: number;
    attack: number;
    attackType: string;
    damageMin: number;
    damageMax: number;
    speed: number;
    steps: number;
    rangeShots: number;
    shotDistance: number;
    magicResist: number;
    movementType: string;
    spells: string[];
    abilities: UnitAbility[];
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

function buildUnit(faction: FactionName, raw: RawCreature): Unit {
    const base = slug(raw.name);
    const portrait = `/assets/images/units/units/${base}_512.webp`;
    const icon = `/assets/images/units/units/${base}_512.webp`;

    const abilities: UnitAbility[] = raw.abilities.map((name) => ({
        name,
        description: abilityDescription(name),
        icon: `/assets/images/units/abilities/${slug(name)}_256.webp`,
        isAura: !!(abilitiesJson as Record<string, RawAbility>)[name]?.aura_effect,
        isCastable: !!(abilitiesJson as Record<string, RawAbility>)[name]?.can_be_cast,
    }));

    return {
        name: raw.name,
        faction,
        level: raw.level,
        size: raw.size,
        hp: raw.hp,
        armor: raw.armor,
        attack: raw.attack,
        attackType: raw.attack_type,
        damageMin: raw.attack_damage_min,
        damageMax: raw.attack_damage_max,
        speed: raw.speed,
        steps: raw.steps,
        rangeShots: raw.range_shots,
        shotDistance: raw.shot_distance,
        magicResist: raw.magic_resist,
        movementType: raw.movement_type,
        spells: raw.spells,
        abilities,
        portrait,
        icon,
    };
}

const creatures = creaturesJson as unknown as { version: number } & Record<FactionName, CreatureMap>;

const hiddenUnits = new Set(["Faerie Dragon", "Phoenix"]);

export const factionUnits: FactionUnits[] = factionOrder
    .filter((faction) => creatures[faction])
    .map((faction) => ({
        faction,
        color: factionColors[faction],
        icon: `/assets/images/units/factions/${faction.toLowerCase()}_128.webp`,
        units: Object.values(creatures[faction])
            .filter((raw) => !hiddenUnits.has(raw.name))
            .map((raw) => buildUnit(faction, raw))
            .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    }));

export const allUnits: Unit[] = factionUnits.flatMap((f) => f.units);

export const unitCount = allUnits.length;
export const abilityCount = new Set(allUnits.flatMap((u) => u.abilities.map((a) => a.name))).size;
