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

const abilityDescriptionRuTemplates: Record<string, string[]> = {
    "Double Punch": ["Наносит вторую атаку с {}% рассчитанного урона."],
    Backstab: ["Наносит на {}% больше урона при ударе со стороны зоны появления врага."],
    Handyman: ["Урон в ближнем бою не снижается."],
    "Double Shot": ["Наносит второй выстрел с {}% рассчитанного урона."],
    "Shadow Touch": ["На атаки этого юнита нельзя ответить."],
    "One in the Field": ["Отвечает на каждую атаку."],
    "Endless Quiver": ["Бесконечный запас стрел."],
    Sniper: ["Игнорирует штрафы за выстрелы по дальним целям."],
    "Leather Armor": ["Броня этого юнита против дальних атак снижена на {}%."],
    "Limited Supply": ["Доступно только {}% стрел."],
    "Enchanted Skin": ["Дает 100% защиту от любой магии, включая баффы и дебаффы."],
    Undead: ["Неуязвим к ментальным атакам, яду и вампиризму. Уязвим к святым атакам."],
    "Lightning Spin": ["Атакует всех врагов вокруг с {}% урона. На атаки этого юнита нельзя ответить."],
    "Fire Breath": ["Прожигает врага огнем на {}% урона. Дистанция равна размеру юнита."],
    "Fire Element": ["Дает иммунитет к огню. Водные атаки наносят на {}% больше урона."],
    "Fire Shield": ["Отражает {}% входящего урона огнем по тем, кто атакует юнита в ближнем бою."],
    "Piercing Spear": ["Игнорирует {}% брони врага при любых атаках."],
    "Boost Health": ["Каждое существо в стеке получает на {}% больше здоровья."],
    Stun: ["При атаке имеет {}% шанс оглушить врага (Статус) на 1 ход."],
    Blindness: ["При ответе на ближнюю атаку имеет {}% шанс ослепить врага (Разум) на 2 хода."],
    "Wild Regeneration": [
        "Автоматически восстанавливает здоровье до максимума в начале своего хода. Эффект можно подарить.",
    ],
    "Heavy Armor": ["Имеет +{}% базовой брони, но получает на {}% больше урона от магии."],
    "No Melee": ["У юнита нет ближней атаки."],
    "Sharpened Weapons Aura": ["Союзники ближнего боя под эффектом получают +{}% к базовой силе атаки."],
    "Range Null Field Aura": ["Вражеские юниты под эффектом не могут использовать дальние атаки."],
    "Luck Aura": ["Союзники в радиусе получают максимальную удачу."],
    "Arrows Wingshield Aura": [
        "Союзники в радиусе получают +{}% защиты от дальних атак. Владелец невосприимчив к прострелу насквозь и не распространяет дальний урон по области.",
    ],
    "AI Driven": ["Юнит действует сам: все его ходы решает AI, а не игрок."],
    "Magic Shield": ["Дает {}% сопротивления всем магическим атакам и дебаффам."],
    "Boar Saliva": ["Boar Saliva (Разум) дает врагу {}% шанс промахнуться физической атакой."],
    Dodge: ["Юнит имеет {}% шанс уклониться от физической атаки."],
    "Small Specie": ["Юнит имеет {}% шанс уклониться от физической атаки крупного юнита."],
    "Bitter Experience": ["Каждый полученный удар дает +1 к броне и шагам до конца боя."],
    "Absorb Penalties Aura": [
        "Юнит имеет {}% шанс поглотить любой дебафф, наложенный на союзника в радиусе, и перенести его на себя.",
    ],
    "Spit Ball": [
        "При дальнем ударе имеет {}% шанс наложить на цель один из дебаффов: Sadness, Quagmire, Weakening Beam, Weakness, Rangebane или Cowardice. За один выстрел может сработать несколько дебаффов.",
    ],
    "Petrifying Gaze": [
        "При атаке может нанести цели дополнительный урон Разума до {}%, зависящий от количества существ.",
    ],
    Wardguard: ["Дает {}% сопротивления всем магическим атакам и дебаффам."],
    "Large Caliber": [
        "Дальние атаки наносят {}% урона всем юнитам рядом с клеткой цели. Дальние атаки игнорируют постройки. Враг отвечает после нанесения всего урона.",
    ],
    "Area Throw": [
        "Дальние атаки наносят {}% урона всем юнитам рядом с клеткой цели. Дальние атаки игнорируют постройки. Враг отвечает после нанесения всего урона.",
    ],
    "Through Shot": [
        "Дальние атаки проходят сквозь цели и наносят {}% урона задетым юнитам. Ответы отключаются с обеих сторон.",
    ],
    "Sky Runner": ["Дает владельцу +{} дополнительных шага."],
    "Lucky Strike": ["При атаке имеет {}% шанс нанести на {}% больше урона."],
    "Forest Spellbook": ["Открывает заклинания: Courage, Helping Hand и Summon Wolves."],
    "Tome of Might": ["Открывает заклинания: Riot, Magic Mirror, Mass Riot и Mass Magic Mirror."],
    "Book of Healing": ["Открывает заклинания: Heal, Spiritual Armor, Blessing и Mass Heal."],
    "Unyielding Power": ["Каждый круг получает +1 шаг, +2 к базовой атаке и +5 здоровья."],
    "Shatter Armor": ["Ближние атаки снимают {} брони (Статус) с цели. Эффект складывается."],
    "Rapid Charge": ["Каждая пройденная клетка увеличивает силу атаки на {}%."],
    "Wolf Trail Aura": ["Союзники в радиусе получают +{} к дистанции перемещения."],
    "Penetrating Bite": ["Ближние атаки наносят дополнительный урон, равный {}% максимального HP юнита."],
    "Pegasus Might Aura": ["Союзники в радиусе получают +{} к базовой атаке и броне."],
    "Pegasus Light": ["Накладывает Pegasus Light на врага. Каждый юнит, атакующий его, получает +{} морали."],
    Paralysis: ["При срабатывании с шансом {}% Паралич (Статус) не дает врагу двигаться и снижает его урон на {}%."],
    "Deep Wounds Level 1": [
        "Накладывает Deep Wounds при атаке или ответе, чтобы в следующий раз нанести на {}% больше урона. Работает только для владельца способности. Эффект складывается.",
    ],
    "Deep Wounds Level 2": [
        "Накладывает Deep Wounds при атаке или ответе, чтобы в следующий раз нанести на {}% больше урона. Работает только для владельца способности. Эффект складывается.",
    ],
    "Deep Wounds Level 3": [
        "Накладывает Deep Wounds при атаке или ответе, чтобы в следующий раз нанести на {}% больше урона. Работает только для владельца способности. Эффект складывается.",
    ],
    Madness: ["Дает 100% сопротивления всем атакам и заклинаниям Разума. Владелец всегда имеет 0 морали."],
    "Blind Fury": ["Сила атаки юнита растет пропорционально потерянным существам. Текущая сила: {}%."],
    Miner: ["Навсегда крадет {} базовой брони у врага при ударе."],
    Mechanism: [
        "Неуязвим к атакам и заклинаниям Разума, яду и вампиризму, но на 50% уязвимее к атакам Статуса. Не может лечиться и всегда имеет 0 морали.",
    ],
    Aggr: ["При срабатывании с шансом {}% Aggr (Разум) заставляет врага 1 ход только отвечать на атаки."],
    "Skewer Strike": ["Ближние атаки также задевают врагов рядом с меньшими целями с {}% силы атаки."],
    Resurrection: [
        "50% первоначального запаса существ восстанавливается после полной гибели стека. Можно применить, чтобы воскресить павших союзников на поле.",
    ],
    "War Anger Aura": ["Владелец получает +{}% урона за каждого врага в радиусе во время атаки."],
    "Wind Flow": [
        "При применении все летающие юниты получают +4 к базовой броне и теряют 4 очка перемещения, включая врагов.",
    ],
    "Battle Roar": [
        "При применении все союзники получают +1 шаг движения за каждого заклинателя и гарантированно наносят максимальный урон каждой атакой.",
    ],
    Castling: ["При применении меняется местами с малым противником в пределах дистанции движения."],
    "Chain Lightning": [
        "При атаке или ответе наносит {}/{}/{}/{}% урона связанному врагу (Ветер). Сила зависит от расстояния врага до цели.",
    ],
    "Wind Element": ["Дает иммунитет к ветру. Земляные атаки наносят на {}% больше урона."],
    "Tie up the Horses Aura": ["Союзные нелетающие юниты в радиусе ауры получают +{} к дистанции перемещения."],
    Crusade: ["Юнит получает +{} к атаке и броне за каждую пройденную клетку. Бонус не растет выше 50 базовых очков."],
    "Made of Fire": [
        "При контакте с лавой в центре карты существо получает +10% ко всем характеристикам, включая способности. Существо может проходить через лаву или стоять в ней.",
    ],
    "Disguise Aura": ["Владельца нельзя выбрать целью, пока в радиусе ауры нет вражеского юнита."],
    "Dulling Defense": ["Враг навсегда теряет {} базовой атаки, когда атакует владельца в ближнем бою."],
    "Devour Essence": ["После убийства врага юнит восстанавливается до {}% максимального здоровья."],
    "Dense Flesh": ["Вражеские дальние атаки, направленные на этого юнита, расходуют {} выстрела вместо одного."],
    "Flesh Shield Aura": [
        "Поглощает {}% урона от атак, нанесенного союзникам в радиусе.",
        "Поглощенный урон пересчитывается с учетом защиты владельца и наносится владельцу вместо союзника.",
    ],
    "Web Aura": [
        "Вражеские летающие юниты, начинающие ход в радиусе {} клетки от этого юнита, не могут двигаться в этот ход.",
    ],
    Infest: [
        "Когда этот юнит уничтожает существо 1–3 уровня, из него появляется один юнит Arachna Spider.",
        "При уничтожении существа 4 уровня вместо этого появляется один юнит Arachna Queen.",
    ],
    "Predatory Assimilation": [
        "Каждая попавшая прямая атака имеет зависящий от силы стека шанс ({}% при полной силе стека до модификаторов) навсегда отключить и украсть одну случайную активную способность цели.",
    ],
};

function abilityDescription(name: string, language: "en" | "ru" = "en"): string {
    const ability = (abilitiesJson as Record<string, RawAbility>)[name];
    if (!ability || !ability.desc?.length) {
        return "";
    }
    const descriptionTemplate =
        language === "ru" ? (abilityDescriptionRuTemplates[name] ?? ability.desc) : ability.desc;
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
    if (name === "Paralysis") {
        const p = ability.power;
        return joined.replace("{}", String(Math.round(p * 2))).replace("{}", String(Math.round(p)));
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
    experience: number;
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
    summonedOnly: boolean;
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

function buildUnit(faction: FactionName, raw: RawCreature): Unit {
    const base = slug(raw.name);
    const portrait = `/assets/images/units/units/${base}_512.webp`;
    const icon = `/assets/images/units/units/${base}_512.webp`;

    const abilities: UnitAbility[] = raw.abilities.map((name) => ({
        name,
        description: abilityDescription(name),
        descriptionRu: abilityDescription(name, "ru"),
        icon: `/assets/images/units/abilities/${slug(name)}_256.webp`,
        isAura: !!(abilitiesJson as Record<string, RawAbility>)[name]?.aura_effect,
        isCastable: !!(abilitiesJson as Record<string, RawAbility>)[name]?.can_be_cast,
        isStackPowered: !!(abilitiesJson as Record<string, RawAbility>)[name]?.stack_powered,
    }));

    return {
        name: raw.name,
        faction,
        level: raw.level,
        size: raw.size,
        experience: raw.exp,
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
        summonedOnly: summonedOnlyUnits.has(raw.name),
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
        icon: `/assets/images/units/factions/${faction.toLowerCase()}_128.webp`,
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
}

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
                    icon: unit.icon,
                    summonedOnly: unit.summonedOnly,
                });
            }
        }
    }
    return [...byName.values()]
        .map((ability) => ({
            ...ability,
            units: ability.units.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
})();

export const abilitiesCount = abilities.length;
