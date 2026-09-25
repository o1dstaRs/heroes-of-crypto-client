import { portraitArtUrl } from "./portrait";
import creaturesJson from "@heroesofcrypto/common/src/configuration/creatures.json";
import abilitiesJson from "@heroesofcrypto/common/src/configuration/abilities.json";
import effectsJson from "@heroesofcrypto/common/src/configuration/effects.json";

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
    "Arcane Ward Blessing": "/assets/images/units/abilities/arcane_ward_blessing_256.webp",
    "Warding Mane Blessing": "/assets/images/units/abilities/warding_mane_aura_256.webp",
    "Angelic Host Blessing": "/assets/images/units/abilities/angelic_host_256.webp",
    "Arrows Wingshield Blessing": "/assets/images/units/abilities/arrows_wingshield_aura_256.webp",
};

const abilityIcon = (name: string): string =>
    abilityIconOverrides[name] ?? `/assets/images/units/abilities/${slug(name)}_256.webp`;

// Mirrors common's MAX_UNIT_STACK_POWER (constants.ts) — the ceiling chakramBounceBudget clamps to.
const MAX_UNIT_STACK_POWER = 5;

// getCraftChances(0) from common's abilities/craft_ability.ts: stun = clamp(10 - luck), frozen = 20 - stun,
// with nothing/double fixed. Always sums to 100.
const NEUTRAL_LUCK_CRAFT_CHANCES = { double: 40, frozen: 10, stun: 10, nothing: 40 } as const;

// English card text where the game's own tooltip contradicts what the engine does. Each one was checked
// against the engine (common): the tooltip keeps the old wording until the game fixes it, but the Knowledge
// Base should not repeat it. "{}" takes the ability's power exactly like the game's template.
const abilityDescriptionOverridesEn: Record<string, string[]> = {
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
    "Heavy Armor": ["Has {}% additional base armor, while taking {}% more damage from magic — spells, Fire Wall, Fireforged burns, Chain Lightning, Fire Breath and Fire Shield"],
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

const abilityDescriptionRuTemplates: Record<string, string[]> = {
    "Angelic Host Blessing": [
        "Пока этот юнит жив, все союзные летающие юниты получают +{} к атаке, +{} к защите и +{} к дистанции перемещения.",
    ],
    "Arcane Ward Blessing": [
        "Пока этот юнит жив, все союзники на поле получают {}% защиты от магии.",
        "Сила всегда равна 10 + удача этого юнита и не зависит от размера стека.",
    ],
    "Arrows Wingshield Blessing": [
        "Пока этот юнит жив, все союзники на поле получают +{}% к защите от дальних атак.",
        "Сила растёт 5/10/15/20/25 с размером стека, затем умножается на процент удачи этого юнита.",
        "Владельца нельзя прострелить насквозь, и он не передаёт дальний урон по площади.",
    ],
    "Book of Nightmares": ["Открывает заклинания: Fire Wall и Empower."],
    "Crafted Double Punch": ["Кованое: наносит вторую атаку с {}% рассчитанного урона."],
    "Crafted Double Shot": ["Кованое: делает второй выстрел с {}% рассчитанного урона."],
    "Crafted Frozen Bow": ["Кованое: при атаке {}% шанс заморозить врага (Статус) на 2 хода."],
    "Crafted Frozen Sword": ["Кованое: при атаке {}% шанс заморозить врага (Статус) на 2 хода."],
    "Earth Element": ["Дает иммунитет к земле. Атаки ветра наносят на {}% больше урона."],
    Hamstring: ["При атаке {}% шанс на 3 круга сократить дистанцию перемещения летающего врага на 30% (Hamstrung)."],
    "In Its Own World": [
        "Ходит по своей лозе бесплатно: клетка с лозой не стоит ни одного шага — ни по прямой, ни по диагонали,",
        "поэтому юнит может пройти по брошенной лозе до самого конца и платит только за обычную землю за ней.",
    ],
    "Magic Reflection": [
        "Отражает каждое нацеленное на это существо заклинание с шансом {}%.",
        "Заклинание всё равно полностью действует на дракона — отражение идёт сверху:",
        "заклинатель получает ту же долю урона, что достался дракону, а дебафф копируется и на него.",
    ],
    "Sylvan Focus Aura": ["Союзники в радиусе 2 клеток наносят на {}% больше магического урона."],
    "Terrifying Gaze": [
        "При атаке {}% шанс напугать цель. Напуганный враг",
        "1 ход не может ни атаковать, ни отвечать тому, кто на него взглянул,",
        "но может бить любого другого.",
    ],
    "Time Denial": ["Пока способность действует, ни один юнит не может ждать через Hourglass."],
    "Tome of Elements": [
        "Четыре страницы — по одной на каждую стихию, из которых вылупился змей.",
        "Открывает заклинания: Whirlpool, Lightning Strike, Ring of Fire и Meteor Shower.",
    ],
    "Venom Cloud Aura": [
        "Союзники в радиусе 2 клеток добавляют к атаке {}% её урона в виде яда (Poison).",
        "Повторное отравление складывается: +50% урона ядом за каждый стак.",
    ],
    "Warding Mane Blessing": [
        "Пока этот юнит жив, все союзники на поле получают {}% защиты от магии.",
        "Сила растёт 5/10/15/20/25 с размером стека, затем умножается на процент удачи этого юнита.",
    ],
    "Water Element": ["Дает иммунитет к воде. Огненные атаки наносят на {}% больше урона."],
    "Water Shield": ["Один раз за бой полностью поглощает первую входящую атаку (0 полученного урона), после чего разрушается."],
    "Double Punch": ["Наносит вторую атаку с {}% рассчитанного урона."],
    Backstab: ["Наносит на {}% больше урона при ударе со стороны зоны появления врага."],
    Handyman: ["Урон в ближнем бою не снижается."],
    "Double Shot": ["Наносит второй выстрел с {}% рассчитанного урона."],
    "Double Throw": ["Метает второй валун с {}% рассчитанного урона."],
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
    Blindness: ["При атаке имеет {}% шанс ослепить врага (Разум) на 2 хода."],
    "Wild Regeneration": [
        "Автоматически восстанавливает здоровье до максимума в начале своего хода. Эффект можно подарить.",
    ],
    "Heavy Armor": ["Имеет +{}% базовой брони, но получает на {}% больше магического урона — от заклинаний, Fire Wall, поджогов Fireforged, Chain Lightning, Fire Breath и Fire Shield."],
    "No Melee": ["У юнита нет ближней атаки."],
    "Sharpened Weapons Aura": ["Союзники ближнего боя под эффектом получают +{}% к базовой силе атаки."],
    "Range Null Field Aura": ["Вражеские юниты под эффектом не могут использовать дальние атаки."],
    "Luck Aura": ["Союзники в радиусе получают максимальную удачу."],
    "Arrows Wingshield Aura": [
        "Союзники в радиусе получают +{}% защиты от дальних атак. Владелец невосприимчив к прострелу насквозь и не распространяет дальний урон по области.",
    ],
    "Angelic Host": [
        "Пока владелец жив, все союзные летающие юниты получают +{} к атаке, защите и дистанции перемещения. Эффект не складывается.",
    ],
    "AI Driven": ["Юнит действует сам: все его ходы решает AI, а не игрок."],
    "Magic Shield": ["Дает {}% сопротивления всем магическим атакам и дебаффам."],
    "Boar Saliva": ["Boar Saliva (Разум) дает врагу {}% шанс промахнуться физической атакой."],
    Dodge: ["Юнит имеет {}% шанс уклониться от физической атаки."],
    "Small Specie": ["Юнит имеет {}% шанс уклониться от физической атаки крупного юнита."],
    "Bitter Experience": [
        "Каждый удар, который убивает хотя бы одно существо стека, а стек выживает, даёт +1 к броне и +1 шаг до конца боя.",
    ],
    "Absorb Penalties Aura": [
        "Юнит имеет {}% шанс забрать себе вражеский дебафф заклинания, дебафф Spit Ball или Hamstring, наложенный на союзника в радиусе. Эффекты ударов вроде Stun и Blindness не поглощаются.",
    ],
    "Spit Ball": [
        "При дальнем ударе имеет {}% шанс наложить на цель один из дебаффов: Curse, Sadness, Quagmire, Weakening Beam, Weakness, Rangebane или Cowardice. За один выстрел может сработать несколько дебаффов.",
    ],
    "Petrifying Gaze": [
        "Каждое попадание убивает дополнительных существ на часть своего урона, а затем может окаменить (мгновенно убить) переднее существо цели. Юниты более высокого уровня окаменевают легче; дальние выстрелы окаменяют тем реже, чем дальше цель.",
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
    "Penetrating Bite": ["Ближние атаки наносят дополнительный урон, равный {}% максимального здоровья одного существа цели."],
    "Pegasus Might Aura": ["Союзники в радиусе получают +{} к базовой атаке и броне."],
    "Pegasus Light": ["Накладывает Pegasus Light на врага. Каждый юнит, атакующий его, получает +{} морали."],
    Paralysis: ["При срабатывании с шансом {}% Паралич (Статус) не дает врагу двигаться и снижает его урон на {}%."],
    "Deep Wounds Level 1": [
        "Каждая атака или ответ в ближнем бою добавляет цели {}% ран Deep Wounds, и каждый атакующий со способностью Deep Wounds наносит ей на столько же больше урона. Раны складываются.",
    ],
    "Deep Wounds Level 2": [
        "Каждая атака или ответ в ближнем бою добавляет цели {}% ран Deep Wounds, и каждый атакующий со способностью Deep Wounds наносит ей на столько же больше урона. Раны складываются.",
    ],
    "Deep Wounds Level 3": [
        "Каждая атака или ответ в ближнем бою добавляет цели {}% ран Deep Wounds, и каждый атакующий со способностью Deep Wounds наносит ей на столько же больше урона. Раны складываются.",
    ],
    Madness: ["Дает 100% сопротивления всем атакам и заклинаниям Разума. Владелец всегда имеет 0 морали."],
    "Blind Fury": ["Сила атаки юнита растет пропорционально потерянным существам. Текущая сила: {}%."],
    Miner: ["Навсегда крадет {} базовой брони у врага при ударе. Базовая броня цели не опускается ниже 1."],
    Mechanism: [
        "Неуязвим к атакам и заклинаниям Разума и к яду, но на 50% уязвимее к атакам Статуса и к физическим атакам по площади. Не может лечиться и воскрешаться и всегда имеет 0 морали.",
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
    "Vine Throw": [
        "При применении бросает лозу в любого врага, которого не заслоняет другое существо, оставляя её на каждой клетке по пути.",
        "Нелетающее существо тратит 1 дополнительный шаг, чтобы пересечь клетку с лозой.",
        "Любой враг, закончивший ход в лозе, теряет {} шага — как и поражённое броском существо.",
        "Магическая броня может стряхнуть захват с поражённого существа, но лозу на клетках не отменяет.",
    ],
    "Battle Roar": [
        "При применении все союзники получают +1 шаг движения за каждого заклинателя и гарантированно наносят максимальный урон каждой атакой.",
    ],
    Castling: ["При применении меняется местами с противником того же размера в пределах дистанции движения."],
    "Chain Lightning": [
        "При атаке или ответе наносит {}/{}/{}/{}% урона связанному врагу (Ветер). Сила зависит от расстояния врага до цели.",
        "Земляные элементали получают на 50% больше. Ветряной элементаль заземляет молнию: не получает урона, и цепь на нём обрывается.",
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
        "Поглощает {}% физического урона, нанесенного союзникам в радиусе.",
        "Поглощенный урон пересчитывается с учетом брони владельца и наносится владельцу вместо союзника. Магический урон не поглощается.",
    ],
    "Web Aura": [
        "Вражеские летающие юниты, начинающие ход в радиусе {} клетки от этого юнита, не могут двигаться в этот ход.",
    ],
    Infest: [
        "Когда этот юнит уничтожает существо 1–3 уровня, из него появляется один юнит Arachna Spider.",
        "При уничтожении существа 4 уровня вместо этого появляется один юнит Arachna Queen.",
    ],
    "Predatory Assimilation": [
        "Каждая попавшая прямая атака имеет {}% шанс навсегда отключить и украсть одну случайную активную способность цели.",
    ],
    Chakram: [
        "Максимум целей: {}. Дальняя атака поражает выбранного врага, затем диск поворачивает по часовой стрелке к следующему подходящему врагу.",
        "Зазор в 1 клетку сохраняет полный урон; зазор в 2 клетки снижает его вдвое и заканчивает полёт. Уклонение цели тоже заканчивает полёт. Каждый враг получает удар один раз, союзники не задеваются.",
    ],
    "Rallying Volley Aura": ["Союзные стрелки в радиусе получают +{} выстрела."],
    "Guiding Winds Aura": ["Союзные стрелки в радиусе ауры стреляют на {}% дальше."],
    "Book of Chaos": ["Открывает заклинания: Smoke, Misfortune, Fireforged Sword и Fireball."],
    "Basic Tome of Battle Magic": [
        "Полевой учебник боевой магии — первые две страницы, которым учат в любой военной академии.",
        "Открывает заклинания: Fire Strike и Meteorite.",
    ],
    "Blacksmith Tools": [
        "Craft (союзники в области 2x2, нужна сила стека 4). Для каждого союзника:",
        "Двойная атака {}%, замороженное оружие {}%, оглушение {}%, ничего {}%.",
    ],
    Enchants: [
        "Зачаровывает броню или оружие союзника (стек 1).",
        "Каждое применение: 50% шанс добавить +1 (складывается).",
    ],
    "Borrowed Grace": [
        "Каждый попавший выстрел с шансом {}% снимает с цели один случайный активный бафф",
        "и переносит его на владельца до конца действия. Ауры и снаряжение снять нельзя.",
    ],
    "Absolving Arrow": [
        "Союзники, через которых пролетает стрела, избавляются от одного негативного эффекта с шансом {}%",
        "(20% при силе стека 1 и до 100% при 5); каждый следующий эффект на том же союзнике снимается вдвое реже предыдущего.",
    ],
};

function abilityDescription(name: string, language: "en" | "ru" = "en"): string {
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
        isStackPowered: !notStackScaled.has(name) && !!(abilitiesJson as Record<string, RawAbility>)[name]?.stack_powered,
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
