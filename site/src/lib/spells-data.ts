// The spell codex is derived straight from the game's spells.json (the same file the client and the
// simulator read), so the catalogue can never drift from the live rules. Only two things are curated
// here: the Russian description templates, and the handful of English descriptions whose "{}" is a
// caster-scaled runtime value rather than a constant (see resolvedDescriptions below).
//
// Army-wide artifacts are modelled as System spells in spells.json too. They are filtered out here
// because they already have their own codex at /artifacts — keeping them would list every artifact
// twice under a misleading "spell" label.

import spellsJson from "@heroesofcrypto/common/src/configuration/spells.json";

import { artifacts } from "./artifacts-data";
import { allUnits, factionColors, type FactionName } from "./units-data";

export type SpellBook = "System" | "Life" | "Nature" | "Chaos" | "Death" | "Order";

/**
 * How a spell reaches the battlefield:
 * - `spellbook` — a scroll a unit casts from its spell book during the fight
 * - `augment`   — an army-wide upgrade chosen before the fight
 * - `ability`   — cast by a unit ability rather than from the spell book
 * - `effect`    — a buff/debuff applied automatically by attacks, abilities, terrain or game state
 */
export type SpellKind = "spellbook" | "augment" | "ability" | "effect";

/**
 * How long a spell sticks, taken from the description's own "Lasts ..." line rather than from `laps`.
 * The lap counter is not a duration on its own: instant spells (Heal, Castling, Resurrection) and
 * permanent ones (Armor Rune, Craft) all park at the 15-lap ceiling, so reading `laps` alone would
 * print "whole fight" on a heal. `null` means the game states no duration.
 */
export type SpellDuration = { kind: "laps"; laps: number } | { kind: "fight" } | { kind: "broken" } | null;

/**
 * Whether the spell leaves a buff or a debuff on a unit. `null` for spells that do neither — a summon
 * puts new units on the board and Castling swaps two positions, so tagging them from the raw `is_buff`
 * flag (false for both) would label them "Debuff", which they are not.
 */
export type SpellPolarity = "buff" | "debuff" | null;

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

// "Hunter's Longbow" (artifact) and "Hunters Longbow" (its System spell) are the same thing.
const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");

const artifactSpellNames = new Set(artifacts.map((artifact) => normalizeName(artifact.name)));

const bookOrder: SpellBook[] = ["Life", "Nature", "Chaos", "Death", "Order", "System"];

export const bookColors: Record<SpellBook, string> = {
    Life: "#4ea36e",
    Nature: "#6f9bd6",
    Chaos: "#c63d33",
    Death: "#8a76bf",
    Order: "#e0b04a",
    System: "#9aa3ab",
};

const augmentSpells = new Set(["Armor Augment", "Might Augment", "Sniper Augment", "Movement Augment"]);

// Spells cast by a unit ability instead of from a spell book — these are exactly the abilities.json
// entries with `can_be_cast: true`.
const abilityCastSpells = new Set(["Wild Regeneration", "Resurrection", "Wind Flow", "Battle Roar", "Castling"]);

// Which ability applies each non-castable buff/debuff. Curated because the link lives in ability code
// rather than in the data files; every entry here is an ability name shown on /abilities.
const appliedByAbility: Record<string, string[]> = {
    "Dulling Defense": ["Dulling Defense"],
    "Angelic Host": ["Angelic Host"],
    "Made of Fire": ["Made of Fire"],
    "Water Shield": ["Water Shield"],
    "Wild Regeneration": ["Wild Regeneration"],
    Hidden: ["Disguise Aura"],
    Visible: ["Disguise Aura"],
    Sadness: ["Spit Ball"],
    Quagmire: ["Spit Ball", "Rime Charm"],
    Hamstrung: ["Hamstring"],
    "Weakening Beam": ["Spit Ball"],
    Weakness: ["Spit Ball"],
    Rangebane: ["Spit Ball"],
    Cowardice: ["Spit Ball"],
    Resurrection: ["Resurrection"],
    "Wind Flow": ["Wind Flow"],
    "Battle Roar": ["Battle Roar"],
    Castling: ["Castling"],
};

// The client fills a spell description's "{}" at cast time with a caster-scaled number (hit points
// healed, wolves summoned, ...), which a static codex cannot show. These rewrites state the scaling
// rule instead. Augment descriptions get the per-level values from augments/augment_properties.ts.
const resolvedDescriptions: Record<string, string> = {
    "Life:Heal": "Heals an ally for 5 health points per creature alive in the caster's stack.",
    "Life:Mass Heal": "Heals every ally for 2.5 health points per creature alive in the caster's stack.",
    "Nature:Summon Wolves": "Summons 1.5 wolves per creature alive in the caster's stack to fight for your team.",
    "System:Battle Roar":
        "All allies gain one additional movement step per creature alive in the caster's stack, and are ensured to deal maximum damage with each attack.",
    "System:Resurrection":
        "Resurrects fallen ally units on the battlefield, up to the caster stack's cumulative maximum hit points.",
    "Life:Fire Strike":
        "Sends a small fireball at an enemy in line of sight. Damage is 0.8 per creature alive in the caster's stack per point of its stack power, ignores armor, and is cut by magic resistance.",
    "Life:Meteorite":
        "Calls a meteorite down on any 2x2 block of the battlefield, burning every enemy caught under it. Damage is 0.48 per creature alive in the caster's stack per point of its stack power — Fire Strike's formula less 40%, because it strikes them all at once.",
    "System:Dulling Defense":
        "The enemy permanently loses 2 base attack points each time it attacks the carrier in melee.",
    "System:Armor Rune": "50% chance per cast to add +1 armor to the target. The bonus stacks.",
    "System:Weapon Rune": "50% chance per cast to add +1 attack to the target. The bonus stacks.",
    "System:Armor Augment": "Boosts the entire team's base armor. Level 1: +6%. Level 2: +13%. Level 3: +21%.",
    "System:Might Augment": "Increases the entire team's base attack. Level 1: +8%. Level 2: +17%. Level 3: +27%.",
    "System:Sniper Augment":
        "Increases the team's ranged base attack and shot range. Level 1: +7% attack, +20% range. Level 2: +15% attack, +40% range. Level 3: +24% attack, +70% range.",
    "System:Movement Augment": "Boosts the entire team's movement steps. Level 1: +1 step. Level 2: +2 steps.",
};

const descriptionsRu: Record<string, string> = {
    "System:Morale": "Юнит достигает максимальной морали, повышая множитель атаки до 1.25.",
    "System:Dismorale": "Мораль юнита падает до минимума, снижая множитель атаки до 0.8.",
    "System:Dulling Defense":
        "Враг навсегда теряет 2 очка базовой атаки каждый раз, когда атакует носителя в ближнем бою.",
    "System:Wild Regeneration":
        "Дает способность восстанавливать здоровье до максимума в начале своего хода. Эффект можно подарить.",
    "System:Wind Flow": "Все летающие юниты получают +4 к базовой броне и теряют 4 очка перемещения, включая врагов.",
    "System:Battle Roar":
        "Все союзники получают по одному дополнительному шагу за каждое живое существо в стеке заклинателя и гарантированно наносят максимальный урон каждой атакой.",
    "System:Castling": "Меняется местами с малым противником в пределах дистанции движения заклинателя.",
    "System:Resurrection":
        "Воскрешает павших союзников на поле боя — суммарно до совокупного максимального запаса здоровья стека заклинателя.",
    "System:Armor Augment": "Повышает базовую броню всей команды. Уровень 1: +6%. Уровень 2: +13%. Уровень 3: +21%.",
    "System:Might Augment": "Повышает базовую атаку всей команды. Уровень 1: +8%. Уровень 2: +17%. Уровень 3: +27%.",
    "System:Sniper Augment":
        "Повышает базовую атаку и дальность стрелков команды. Уровень 1: +7% атаки, +20% дальности. Уровень 2: +15% атаки, +40% дальности. Уровень 3: +24% атаки, +70% дальности.",
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
    "Life:Heal": "Лечит союзника на 5 единиц здоровья за каждое живое существо в стеке заклинателя.",
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
        "Отражает 30% полученного магического урона обратно в атакующего.\nДает 30% шанс отразить любой дебафф.",
    "Chaos:Smoke":
        "Бросает облако дыма 2x2 на свободные клетки в любой точке поля боя.\nЛюбая дальняя атака (с обеих сторон), траектория которой пересекает задымленную клетку, наносит ВДВОЕ меньше урона (делитель дальности удваивается: полный → 1/2, 1/2 → 1/4).\nСущество, вставшее на задымленную клетку, рассеивает дым с этой клетки.",
    "Chaos:Misfortune":
        "Снижает удачу пораженного юнита до минимума. Цель с бафом удачи (Luck Aura, Clover of Fortune) вместо этого обнуляется.",
    "Chaos:Fireforged Sword": "Добавляет союзнику 10% дополнительного урона.",
    "Chaos:Mass Magic Mirror":
        "Отражает 25% полученного магического урона обратно в атакующего.\nДает 25% шанс отразить любой дебафф.",
    "Death:Sadness": "Мораль пораженного юнита падает до минимума.",
    "Death:Quagmire": "Дистанция перемещения юнита снижена на 25%.",
    "Death:Hamstrung": "Дистанция перемещения юнита снижена на 30%.",
    "Death:Weakening Beam": "Базовая броня юнита снижена на 24%.",
    "Death:Weakness": "Базовая атака юнита снижена на 30%.",
    "Life:Fire Strike":
        "Запускает небольшой огненный шар во врага в зоне видимости.\nУрон = 0.8 за каждое живое существо в стеке заклинателя за каждую единицу силы стека.\nМагический: игнорирует броню, но снижается сопротивлением магии.",
    "Life:Meteorite":
        "Обрушивает метеорит на любой участок поля боя 2x2 клетки, поражая всех врагов под ним.\nУрон = 0.48 за каждое живое существо в стеке заклинателя за каждую единицу силы стека — формула «Удара огнем» минус 40%, потому что бьет по всем сразу.",
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
        return override;
    }
    return stripDurationLine(raw.desc).join("\n").replace(/\{\}/g, String(raw.power));
}

function russianDescription(book: SpellBook, raw: RawSpell, english: string): string {
    return descriptionsRu[`${book}:${raw.name}`] ?? english;
}

function spellPolarity(raw: RawSpell): SpellPolarity {
    if (raw.power_type === "POSITION_CHANGE" || raw.target === "RANDOM_CLOSE_TO_CASTER") {
        return null;
    }
    return raw.is_buff ? "buff" : "debuff";
}

function spellKind(book: SpellBook, raw: RawSpell, casterCount: number): SpellKind {
    if (casterCount > 0) {
        return "spellbook";
    }
    if (augmentSpells.has(raw.name)) {
        return "augment";
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
            list.push({ name: unit.name, faction: unit.faction, icon: unit.icon, scrolls });
            byKey.set(key, list);
        }
    }
    return byKey;
})();

const rawBooks = spellsJson as unknown as { version: number } & Record<SpellBook, Record<string, RawSpell>>;

export const spells: Spell[] = bookOrder
    .filter((book) => rawBooks[book])
    .flatMap((book) =>
        Object.values(rawBooks[book])
            .filter((raw) => !artifactSpellNames.has(normalizeName(raw.name)))
            .map((raw) => {
                const casters = (castersBySpell.get(`${book}:${raw.name}`) ?? []).sort((a, b) =>
                    a.name.localeCompare(b.name),
                );
                const description = englishDescription(book, raw);

                return {
                    name: raw.name,
                    book,
                    kind: spellKind(book, raw, casters.length),
                    level: raw.level,
                    icon: `/assets/images/spells/${slug(raw.name)}_256.webp`,
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
