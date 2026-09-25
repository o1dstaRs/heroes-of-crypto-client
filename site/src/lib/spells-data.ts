// The spell codex is derived straight from the game's spells.json (the same file the client and the
// simulator read), so the catalogue can never drift from the live rules. Only two things are curated
// here: the Russian description templates, and the handful of English descriptions whose "{}" is a
// caster-scaled runtime value rather than a constant (see resolvedDescriptions below).
//
// Army-wide artifacts are modelled as System spells in spells.json too. They are filtered out here
// because they already have their own Knowledge Base section — keeping them would list every artifact
// twice under a misleading "spell" label. Pre-game augments are excluded for the same reason: they are
// drafted, not cast, so a codex of castable spells is the wrong place for them.

import spellsJson from "@heroesofcrypto/common/src/configuration/spells.json";
import { TIER1_ARTIFACTS, TIER2_ARTIFACTS } from "@heroesofcrypto/common/src/artifacts/artifact_properties";
import { getSniperPower, SniperAugment } from "@heroesofcrypto/common/src/augments/augment_properties";

import { allUnits, factionColors, type FactionName } from "./units-data";

const sniperAugmentPowers = [SniperAugment.LEVEL_1, SniperAugment.LEVEL_2, SniperAugment.LEVEL_3].map(getSniperPower);

export type SpellBook = "System" | "Life" | "Nature" | "Chaos" | "Death" | "Order";

/**
 * How a spell reaches the battlefield:
 * - `spellbook` — a scroll a unit casts from its spell book during the fight
 * - `ability`   — cast by a unit ability rather than from the spell book
 * - `effect`    — a buff/debuff applied automatically by attacks, abilities, terrain or game state
 */
export type SpellKind = "spellbook" | "ability" | "effect";

/**
 * How long a spell sticks, taken from the description's own "Lasts ..." line rather than from `laps`.
 * The lap counter is not a duration on its own: instant spells (Heal, Castling, Resurrection) and
 * permanent ones (Armor Rune, Craft) all park at the 15-lap ceiling, so reading `laps` alone would
 * print "whole fight" on a heal. `null` means the game states no duration.
 */
export type SpellDuration = { kind: "laps"; laps: number } | { kind: "fight" } | { kind: "broken" } | null;

/**
 * The spell's player-facing combat category. The raw configuration stores only `is_buff`, so direct
 * damage spells need an explicit category instead of falling through to the misleading "Debuff" label.
 * `null` is reserved for spells such as summons and position changes that fit none of these categories.
 */
export type SpellPolarity = "buff" | "debuff" | "damage" | null;

interface RawSpell {
    name: string;
    level: number;
    desc: string[];
    target: string;
    power: number;
    power_type: string;
    multiplier_type: string;
    laps: number;
    is_buff: boolean;
    self_cast_allowed: boolean;
    self_debuff_applies: boolean;
    minimal_caster_stack_power: number;
    conflicts_with: string[];
    is_giftable: boolean;
    maximum_gift_level: number;
}

export interface SpellCaster {
    name: string;
    faction: FactionName;
    /** Identifies the creature to the composed portrait; see lib/portrait. */
    slug: string;
    icon: string;
    /** How many scrolls of this spell the unit carries into a fight. */
    scrolls: number;
}

export interface Spell {
    name: string;
    book: SpellBook;
    kind: SpellKind;
    level: number;
    icon: string;
    description: string;
    descriptionRu: string;
    target: string;
    duration: SpellDuration;
    polarity: SpellPolarity;
    selfCastAllowed: boolean;
    minimalCasterStackPower: number;
    conflictsWith: string[];
    isGiftable: boolean;
    /** Units that carry this spell in their spell book. */
    casters: SpellCaster[];
    /** Abilities that apply this spell when it is not cast from a spell book. */
    appliedBy: string[];
}

const slug = (name: string) =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");

const bookOrder: SpellBook[] = ["Life", "Nature", "Chaos", "Death", "Order", "System"];

const spellBookOverrides: Readonly<Record<string, SpellBook>> = {
    "Chaos:Empower": "Order",
};

const spellIconOverrides: Readonly<Record<string, string>> = {
    "System:Arcane Ward Blessing": "/assets/images/units/abilities/arcane_ward_blessing_256.webp",
    "System:Warding Mane Blessing": "/assets/images/units/abilities/warding_mane_aura_256.webp",
    "System:Angelic Host Blessing": "/assets/images/spells/angelic_host_256.webp",
    "System:Arrows Wingshield Blessing": "/assets/images/units/abilities/arrows_wingshield_aura_256.webp",
};

const damageSpells = new Set([
    "Fireball",
    "Fire Strike",
    "Fire Wall",
    "Lightning Strike",
    "Meteorite",
    "Meteor Shower",
    "Ring of Fire",
]);

export const bookColors: Record<SpellBook, string> = {
    Life: "#4ea36e",
    Nature: "#6f9bd6",
    Chaos: "#c63d33",
    Death: "#8a76bf",
    Order: "#e0b04a",
    System: "#9aa3ab",
};

/**
 * Pre-game army augments, which spells.json also models as System spells so the engine can apply them
 * through the same machinery. Nobody ever casts one — they are drafted and apply to the whole army — so
 * they are excluded from this codex entirely and documented in the Knowledge Base rules, which cover all
 * six with their point costs. Listing them here duplicated that under a misleading "spell" label.
 */
const augmentSpells = new Set([
    "Armor Augment",
    "Might Augment",
    "Empower Augment",
    "Sniper Augment",
    "Movement Augment",
]);

// Spells cast by a unit ability instead of from a spell book — these are exactly the abilities.json
// entries with `can_be_cast: true`.
const abilityCastSpells = new Set([
    "Wild Regeneration",
    "Resurrection",
    "Wind Flow",
    "Vine Throw",
    "Battle Roar",
    "Castling",
]);

// Which ability applies each non-castable buff/debuff. Curated because the link lives in ability code
// rather than in the data files; every entry here is an ability name shown in the Knowledge Base.
const appliedByAbility: Record<string, string[]> = {
    "Dulling Defense": ["Dulling Defense"],
    Miner: ["Miner"],
    "Angelic Host Blessing": ["Angelic Host Blessing"],
    "Arcane Ward Blessing": ["Arcane Ward Blessing"],
    "Arrows Wingshield Blessing": ["Arrows Wingshield Blessing"],
    "Warding Mane Blessing": ["Warding Mane Blessing"],
    "Made of Fire": ["Made of Fire"],
    "Water Shield": ["Water Shield"],
    "Wild Regeneration": ["Wild Regeneration"],
    Hidden: ["Disguise Aura"],
    Visible: ["Disguise Aura"],
    Curse: ["Spit Ball"],
    Sadness: ["Spit Ball"],
    Quagmire: ["Spit Ball", "Rime Charm"],
    Hamstrung: ["Hamstring"],
    "Weakening Beam": ["Spit Ball"],
    Weakness: ["Spit Ball"],
    Rangebane: ["Spit Ball"],
    Cowardice: ["Spit Ball"],
    Resurrection: ["Resurrection"],
    "Wind Flow": ["Wind Flow"],
    // Both cast by Trent's ability AND applied on arrival to anyone who ends a move standing in the vine,
    // so the ability is the right link either way.
    "Vine Throw": ["Vine Throw"],
    "Battle Roar": ["Battle Roar"],
    Castling: ["Castling"],
};

// The client fills a spell description's "{}" at cast time with a caster-scaled number (hit points
// healed, wolves summoned, ...), which a static codex cannot show. These rewrites state the scaling
// rule instead; a "{}" in them still takes the spell's configured power, so a rebalance reaches the card.
// Augment descriptions get the per-level values from augments/augment_properties.ts.
const resolvedDescriptions: Record<string, string> = {
    "Life:Heal":
        "Heals an ally's wounded front creature by {} health points per creature alive in the caster's stack — never above its maximum health, and never raising the dead.",
    "Life:Mass Heal": "Heals every ally for 2.5 health points per creature alive in the caster's stack.",
    "Nature:Summon Wolves": "Summons 1.5 wolves per creature alive in the caster's stack to fight for your team.",
    "System:Battle Roar":
        "All allies gain one additional movement step per creature alive in the caster's stack, and are ensured to deal maximum damage with each attack.",
    "System:Resurrection":
        "Restores an allied stack with losses — the Angel's own included — by up to 1.5× the Angel stack's total maximum health: the wounded creature first, then fallen ones, never more than died. One use per fight, shared with the Angel's own self-resurrection.",
    "Chaos:Fire Strike":
        "Sends a small fireball at an enemy in line of sight. Deals {} damage for every creature alive in the caster's stack, ignores armor, and is cut by magic resistance. Stack power does not change the damage — it only gates the cast.",
    "Chaos:Fireball":
        "Hurls a fireball at an enemy in line of sight. It and every unit on a cell touching it — friend or foe, never the caster — take {} damage for every creature alive in the caster's stack; it ignores armor and is cut by magic resistance. Fire magic: a Fire Element is untouched, a Water Element burns half again as hard.",
    "Chaos:Meteorite":
        "Calls a meteorite down on any 2x2 block of the battlefield, burning every enemy caught under it. Deals {} damage for every creature alive in the caster's stack — less than Fire Strike, because it strikes them all at once.",
    "Nature:Lightning Strike":
        "Calls lightning down on an enemy anywhere on the battlefield — no wall, body or mountain can block it. Deals {} damage for every creature alive in the caster's stack, ignores armor, and is cut by magic resistance.",
    "Nature:Ring of Fire":
        "Bursts into flame around an enemy in line of sight. Every other unit on a cell touching the target — friend or foe — burns for {} damage for every creature alive in the caster's stack; the aimed enemy itself is not hurt.",
    "Nature:Meteor Shower":
        "Calls a meteor shower down on a 3x3 block anywhere on the battlefield, striking every enemy in it. Deals {} damage for every creature alive in the caster's stack, ignores armor, and is cut by magic resistance.",
    "System:Dulling Defense":
        "The enemy permanently loses 2 base attack points each time it attacks the carrier in melee.",
    "System:Miner": "Base armor permanently reduced: every hit from a unit with Miner takes some of it, never below 1.",
    "System:Armor Rune": "50% chance per cast to add +1 armor to the target. The bonus stacks.",
    "System:Weapon Rune": "50% chance per cast to add +1 attack to the target. The bonus stacks.",
    "System:Armor Augment":
        "Boosts the entire team's base armor by a percentage and adds the same number of points straight onto its magic armor. Level 1: +6% armor, +6 magic armor. Level 2: +13% and +13. Level 3: +21% and +21.",
    "System:Might Augment": "Increases the entire team's base attack. Level 1: +8%. Level 2: +17%. Level 3: +27%.",
    "System:Empower Augment":
        "Increases all magic damage the entire team deals — offensive spells, Fire Wall, Fireforged Sword, Chain Lightning, Fire Breath and Fire Shield. Level 1: +7%. Level 2: +15%. Level 3: +24%.",
    "System:Sniper Augment": `Increases the team's ranged base attack and shot range. Level 1: +${sniperAugmentPowers[0][0]}% attack, +${sniperAugmentPowers[0][1]}% range. Level 2: +${sniperAugmentPowers[1][0]}% attack, +${sniperAugmentPowers[1][1]}% range. Level 3: +${sniperAugmentPowers[2][0]}% attack, +${sniperAugmentPowers[2][1]}% range.`,
    "System:Movement Augment": "Boosts the entire team's movement steps. Level 1: +1 step. Level 2: +2 steps.",
};

const descriptionsRu: Record<string, string> = {
    "Nature:Whirlpool":
        "Открывает под врагом бурлящий водоворот и приковывает его к месту.\nСущество пропускает следующий ход, пока заперто в водовороте.\nМагия воды: юнита с Water Element водоворот не удержит.",
    // Keyed by the data file's book (Chaos); the page files Empower under Order.
    "Chaos:Empower": "Добавляет {}% ко всему магическому урону, который наносит цель.",
    "Chaos:Fireball":
        "Бросает огненный шар во врага в зоне прямой видимости.\nОн и все на соседних с ним клетках — свои и чужие, но не заклинатель — получают {} урона за каждое живое существо в стеке заклинателя.\nМагический: игнорирует броню, но снижается сопротивлением магии.\nМагия огня: юниту с Fire Element он не вредит, а юнит с Water Element горит в полтора раза сильнее.",
    "Chaos:Fire Wall":
        "Выкладывает огненную стену на 4 клетки по прямой — в любом месте поля и в любом из четырёх направлений.\nЗажмите Shift при прицеливании, чтобы повернуть её. Загораются только свободные клетки: существо, гора\nили клетка, исчезнувшая при сужении карты, пропускаются, а остальная линия всё равно горит.\nВход на горящую клетку стоит любому существу 1 дополнительный шаг (вдвое дороже обычного)\nи обжигает его на {}% максимального здоровья — и своих, и чужих.",
    "Death:Curse": "Проклинает врага: он всегда наносит минимально возможный урон.",
    "System:Angelic Host Blessing":
        "Angelic Host Blessing даёт +{} к атаке, +{} к защите и +{} к дистанции перемещения.\nДействует, пока жив союзный юнит с Angelic Host Blessing.",
    "System:Arcane Ward Blessing":
        "Arcane Ward Blessing даёт {}% защиты от магии.\nДействует, пока жив союзный юнит с Arcane Ward Blessing.",
    "System:Arrows Wingshield Blessing":
        "Arrows Wingshield Blessing даёт +{}% к защите от дальних атак.\nДействует, пока жив союзный юнит с Arrows Wingshield Blessing.",
    // The data says "reduced by {}" with a power of 0, which printed "by 0"; the amount is whatever Miner's
    // hits took, so both languages name the source instead of a wrong number.
    "System:Miner": "Базовая броня навсегда снижена: её отнимает каждый удар юнита с Miner, но не ниже 1.",
    "System:Warding Mane Blessing":
        "Warding Mane Blessing даёт {}% защиты от магии.\nДействует, пока жив союзный юнит с Warding Mane Blessing.",
    "System:Morale": "Юнит достигает максимальной морали, повышая множитель атаки до 1.25.",
    "System:Dismorale": "Мораль юнита падает до минимума, снижая множитель атаки до 0.8.",
    "System:Dulling Defense":
        "Враг навсегда теряет 2 очка базовой атаки каждый раз, когда атакует носителя в ближнем бою.",
    "System:Wild Regeneration":
        "Дает способность восстанавливать здоровье до максимума в начале своего хода. Эффект можно подарить.",
    "System:Wind Flow": "Все летающие юниты получают +4 к базовой броне и теряют 4 очка перемещения, включая врагов.",
    "System:Vine Throw":
        "Бросает лозу в любого врага, которого не заслоняет другое существо, оставляя её на каждой клетке по пути. Нелетающее существо тратит 1 дополнительный шаг, чтобы пересечь клетку с лозой. Поражённое существо теряет ещё 1.5 шага — если только его магическая броня не стряхнёт захват. Лоза ложится на клетки в любом случае. Действует 3 круга.",
    "System:Battle Roar":
        "Все союзники получают по одному дополнительному шагу за каждое живое существо в стеке заклинателя и гарантированно наносят максимальный урон каждой атакой.",
    "System:Castling":
        "Меняется местами с противником точно такого же размера в пределах дистанции движения заклинателя.",
    "System:Resurrection":
        "Восстанавливает союзный стек с потерями — включая самих Angel — на величину до 1,5× суммарного максимального здоровья стека Angel: сначала раненое существо, потом павшие, не больше, чем погибло. Один раз за бой, общий заряд с самовоскрешением Angel.",
    "System:Armor Augment":
        "Повышает базовую броню всей команды в процентах и добавляет столько же очков к магической броне. Уровень 1: +6% брони и +6 магической брони. Уровень 2: +13% и +13. Уровень 3: +21% и +21.",
    "System:Might Augment": "Повышает базовую атаку всей команды. Уровень 1: +8%. Уровень 2: +17%. Уровень 3: +27%.",
    "System:Empower Augment":
        "Повышает весь магический урон команды — атакующие заклинания, Огненную стену, Огненный меч, Цепную молнию, Огненное дыхание и Огненный щит. Уровень 1: +7%. Уровень 2: +15%. Уровень 3: +24%.",
    "System:Sniper Augment": `Повышает базовую атаку и дальность стрелков команды. Уровень 1: +${sniperAugmentPowers[0][0]}% атаки, +${sniperAugmentPowers[0][1]}% дальности. Уровень 2: +${sniperAugmentPowers[1][0]}% атаки, +${sniperAugmentPowers[1][1]}% дальности. Уровень 3: +${sniperAugmentPowers[2][0]}% атаки, +${sniperAugmentPowers[2][1]}% дальности.`,
    "System:Movement Augment": "Повышает перемещение всей команды. Уровень 1: +1 шаг. Уровень 2: +2 шага.",
    "System:Angelic Host": "Дает +1 к атаке, +1 к защите и +1 к дистанции перемещения.",
    "System:Craft":
        "Обрабатывает союзников в области 2x2: каждый может получить вторую атаку, замороженное оружие, оглушение или ничего.",
    "System:Armor Rune": "50% шанс за каждое применение дать цели +1 брони. Бонус складывается.",
    "System:Weapon Rune": "50% шанс за каждое применение дать цели +1 атаки. Бонус складывается.",
    "System:Made of Fire": "Существо получает +10% ко всем характеристикам, включая способности.",
    "System:Water Shield":
        "Полностью поглощает первую входящую атаку в бою (0 полученного урона), после чего разрушается.",
    "System:Visible": "Юнит полностью видим для вражеской команды.",
    "System:Hidden": "Юнит не может быть выбран целью вражеской командой.",
    "Life:Heal":
        "Лечит раненое переднее существо союзника на {} единиц здоровья за каждое живое существо в стеке заклинателя — не выше максимального здоровья и без воскрешения погибших.",
    "Life:Spiritual Armor": "Дает союзнику дополнительные 30% брони.",
    "Life:Blessing": "Благословляет союзника, чтобы он всегда наносил максимально возможный урон.",
    "Life:Helping Hand": "Передает союзнику 30% максимального здоровья и базовой брони заклинателя.",
    "Life:Courage": "Мораль союзного юнита достигает пика.",
    "Life:Mass Heal": "Лечит всех союзников на 2.5 единицы здоровья за каждое живое существо в стеке заклинателя.",
    "Nature:Summon Wolves":
        "Призывает 1.5 волка за каждое живое существо в стеке заклинателя сражаться за вашу команду.",
    "Chaos:Riot": "Добавляет союзнику 30% дополнительного урона.",
    "Chaos:Mass Riot": "Добавляет всем союзникам 25% дополнительного урона.",
    "Chaos:Magic Mirror":
        "Отражает {}% полученного магического урона обратно в атакующего.\nДаёт {}% шанс отразить любой дебафф.",
    "Chaos:Smoke":
        "Бросает облако дыма 3x3 на свободные клетки в любой точке поля боя.\nЛюбая дальняя атака (с обеих сторон), траектория которой пересекает задымленную клетку, наносит ВДВОЕ меньше урона (делитель дальности удваивается: полный → 1/2, 1/2 → 1/4).\nСущество, вставшее на задымленную клетку, рассеивает дым с этой клетки.",
    "Chaos:Misfortune":
        "Снижает удачу пораженного юнита до минимума. Цель с бафом удачи (Luck Aura, Clover of Fortune) вместо этого обнуляется.",
    "Chaos:Fireforged Sword":
        "Атаки союзника поджигают цель на {}% нанесённого урона.\nЭто огненный урон: броня его не останавливает, сопротивление магии снижает.\nПо водным существам — на 50% больше, огненные существа невосприимчивы.",
    "Chaos:Mass Magic Mirror":
        "Отражает {}% полученного магического урона обратно в атакующего.\nДаёт {}% шанс отразить любой дебафф.",
    "Death:Sadness": "Мораль пораженного юнита падает до минимума.",
    "Death:Quagmire": "Дистанция перемещения юнита снижена на 25%.",
    "Death:Hamstrung": "Дистанция перемещения юнита снижена на 30%.",
    "Death:Weakening Beam": "Базовая броня юнита снижена на 24%.",
    "Death:Weakness": "Базовая атака юнита снижена на 30%.",
    "Chaos:Fire Strike":
        "Запускает небольшой огненный шар во врага в зоне видимости.\nУрон = {} за каждое живое существо в стеке заклинателя.\nСила стека не меняет урон — она лишь определяет, можно ли вообще применить заклинание.\nМагический: игнорирует броню, но снижается сопротивлением магии.",
    "Chaos:Meteorite":
        "Обрушивает метеорит на любой участок поля боя 2x2 клетки, поражая всех врагов под ним.\nУрон = {} за каждое живое существо в стеке заклинателя — меньше, чем у «Удара огнем», потому что бьет по всем сразу.",
    "Nature:Lightning Strike":
        "Призывает молнию на любого врага на поле боя — ни стена, ни тела, ни гора её не остановят.\nУрон = {} за каждое живое существо в стеке заклинателя.\nМагический: игнорирует броню, но снижается сопротивлением магии.",
    "Nature:Ring of Fire":
        "Вспыхивает пламенем вокруг врага в зоне видимости. Горит каждый другой юнит на соседней с ним клетке — свой или чужой; сам выбранный враг урона не получает.\nУрон = {} за каждое живое существо в стеке заклинателя.",
    "Nature:Meteor Shower":
        "Обрушивает метеоритный дождь на блок 3x3 в любом месте поля боя, поражая каждого врага в нём.\nУрон = {} за каждое живое существо в стеке заклинателя.\nМагический: игнорирует броню, но снижается сопротивлением магии.",
    "Order:Rangebane": "Пораженный юнит не может совершать дальние атаки.",
    "Order:Cowardice": "Пораженный юнит не может физически атаковать врагов с большим совокупным здоровьем.",
};

// The trailing "Lasts N laps." line is dropped from the body: duration is shown as its own chip, so
// keeping it would print the same fact twice on every card.
const isDurationLine = (line: string) => /^Lasts\b/i.test(line.trim());

// "Requires stack power N" is shown as its own meta row too, so drop it from the body as well.
const stripDurationLine = (lines: string[]) =>
    lines.filter((line) => !isDurationLine(line) && !/^Requires stack power\b/i.test(line.trim()));

function parseDuration(desc: string[]): SpellDuration {
    const line = desc.find(isDurationLine)?.trim();
    if (!line) {
        return null;
    }
    // "Lasts 1 laps." appears verbatim in the data alongside "Lasts 1 lap." — match both spellings.
    const laps = line.match(/^Lasts\s+(\d+)\s+laps?\b/i);
    if (laps) {
        return { kind: "laps", laps: Number(laps[1]) };
    }
    if (/till\s+broken/i.test(line)) {
        return { kind: "broken" };
    }
    return { kind: "fight" };
}

function englishDescription(book: SpellBook, raw: RawSpell): string {
    const override = resolvedDescriptions[`${book}:${raw.name}`];
    if (override) {
        return override.replace(/\{\}/g, String(raw.power));
    }
    return stripDurationLine(raw.desc).join("\n").replace(/\{\}/g, String(raw.power));
}

function russianDescription(book: SpellBook, raw: RawSpell, english: string): string {
    // Like the English, a "{}" takes the spell's power, so a rebalance reaches both languages.
    return descriptionsRu[`${book}:${raw.name}`]?.replace(/\{\}/g, String(raw.power)) ?? english;
}

function spellPolarity(raw: RawSpell): SpellPolarity {
    if (damageSpells.has(raw.name)) {
        return "damage";
    }
    if (raw.power_type === "POSITION_CHANGE" || raw.target === "RANDOM_CLOSE_TO_CASTER") {
        return null;
    }
    return raw.is_buff ? "buff" : "debuff";
}

function spellKind(book: SpellBook, raw: RawSpell, casterCount: number): SpellKind {
    if (casterCount > 0) {
        return "spellbook";
    }
    if (abilityCastSpells.has(raw.name)) {
        return "ability";
    }
    return "effect";
}

// Unit spell books store one entry per scroll ("Life:Heal" four times = four casts), so counting the
// occurrences gives both the carriers and how many charges each brings.
const castersBySpell = (() => {
    const byKey = new Map<string, SpellCaster[]>();
    for (const unit of allUnits) {
        const counts = new Map<string, number>();
        for (const entry of unit.spells) {
            counts.set(entry, (counts.get(entry) ?? 0) + 1);
        }
        for (const [key, scrolls] of counts) {
            const list = byKey.get(key) ?? [];
            list.push({ name: unit.name, faction: unit.faction, slug: unit.slug, icon: unit.icon, scrolls });
            byKey.set(key, list);
        }
    }
    return byKey;
})();

const rawBooks = spellsJson as unknown as { version: number } & Record<SpellBook, Record<string, RawSpell>>;

// Every artifact buff, offered or retired: Broken Aegis's text lacks the "Artifact." marker, and a disabled
// artifact must not reappear here as a spell a player could look for in the game.
const artifactBuffNames = new Set(
    [...Object.values(TIER1_ARTIFACTS), ...Object.values(TIER2_ARTIFACTS)].map((artifact) => artifact.buffName),
);

const isArtifactSpell = (raw: RawSpell): boolean =>
    artifactBuffNames.has(raw.name) || raw.desc.some((line) => /^Artifact\./i.test(line.trim()));

export const spells: Spell[] = bookOrder
    .filter((book) => rawBooks[book])
    .flatMap((book) =>
        Object.values(rawBooks[book])
            .filter((raw) => !isArtifactSpell(raw) && !augmentSpells.has(raw.name))
            .map((raw) => {
                const casters = (castersBySpell.get(`${book}:${raw.name}`) ?? []).sort((a, b) =>
                    a.name.localeCompare(b.name),
                );
                const description = englishDescription(book, raw);
                const displayBook = spellBookOverrides[`${book}:${raw.name}`] ?? book;

                return {
                    name: raw.name,
                    book: displayBook,
                    kind: spellKind(book, raw, casters.length),
                    level: raw.level,
                    icon:
                        spellIconOverrides[`${book}:${raw.name}`] ?? `/assets/images/spells/${slug(raw.name)}_256.webp`,
                    description,
                    descriptionRu: russianDescription(book, raw, description),
                    target: raw.target,
                    duration: parseDuration(raw.desc),
                    polarity: spellPolarity(raw),
                    selfCastAllowed: raw.self_cast_allowed,
                    minimalCasterStackPower: raw.minimal_caster_stack_power,
                    conflictsWith: raw.conflicts_with,
                    isGiftable: raw.is_giftable,
                    casters,
                    appliedBy: casters.length ? [] : (appliedByAbility[raw.name] ?? []),
                } satisfies Spell;
            })
            .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    );

export const spellsCount = spells.length;
export const spellbookCount = spells.filter((spell) => spell.kind === "spellbook").length;
export const buffCount = spells.filter((spell) => spell.polarity === "buff").length;
export const debuffCount = spells.filter((spell) => spell.polarity === "debuff").length;

export const spellBooks: SpellBook[] = bookOrder.filter((book) => spells.some((spell) => spell.book === book));

export { factionColors };
