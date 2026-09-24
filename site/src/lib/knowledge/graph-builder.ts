/**
 * Builds the Knowledge Graph (see graph-types.ts) from the SAME sources the Knowledge Base renders:
 * common's creature/ability/spell/artifact configs and augment/doctrine/synergy/constant tables, plus the
 * site's own copy for ranked rules, FAQ, patch notes and the token page. The rules prose is passed in as
 * the rendered Knowledge Base HTML (English and Russian) and extracted with rules-extractor.ts.
 *
 * Pure: no I/O, so it is unit-tested directly and driven by scripts/build_knowledge_graph.ts at build time.
 */

import abilitiesJson from "@heroesofcrypto/common/src/configuration/abilities.json";
import effectsJson from "@heroesofcrypto/common/src/configuration/effects.json";
import {
    ArmorAugment,
    DefaultPlacementLevel1,
    EmpowerAugment,
    getArmorPower,
    getEmpowerPower,
    getMightPower,
    getMovementPower,
    getPlacementSizes,
    getSniperPower,
    MightAugment,
    MovementAugment,
    PlacementAugment,
    SniperAugment,
} from "@heroesofcrypto/common/src/augments/augment_properties";
import {
    LUCK_CHANGE_FOR_SHIELD,
    LUCK_MAX_CHANGE_FOR_TURN,
    LUCK_MAX_VALUE_TOTAL,
    MAX_AUGMENT_POINTS,
    MAX_HOLE_LAYERS,
    MAX_TIME_TO_MAKE_TURN_MILLIS,
    MAX_UNIT_STACK_POWER,
    MAX_UNITS_PER_TEAM,
    MIN_ARMAGEDDON_DAMAGE_FIRST_WAVE,
    MIN_TIME_TO_MAKE_TURN_MILLIS,
    MIN_UNIT_STACK_POWER,
    MORALE_CHANGE_FOR_CLOCK,
    MORALE_CHANGE_FOR_DISTANCE,
    MORALE_CHANGE_FOR_KILL,
    MORALE_CHANGE_FOR_SHIELD,
    MORALE_CHANGE_FOR_SKIP,
    MORALE_MAX_VALUE_TOTAL,
    NUMBER_OF_ARMAGEDDON_WAVES,
    NUMBER_OF_LAPS_FIRST_ARMAGEDDON,
    NUMBER_OF_LAPS_TILL_NARROWING_BLOCK,
    NUMBER_OF_LAPS_TILL_NARROWING_NORMAL,
    NUMBER_OF_LAPS_TILL_STOP_NARROWING,
    TOTAL_TIME_TO_MAKE_TURN_MILLIS,
} from "@heroesofcrypto/common/src/constants";
import { DOCTRINE_LIST } from "@heroesofcrypto/common/src/doctrines/doctrine_properties";
import { PlacementType } from "@heroesofcrypto/common/src/grid/placement_properties";
import {
    ChaosSynergy,
    LifeSynergy,
    MightSynergy,
    NatureSynergy,
    SynergyKeysToPower,
    UNITS_TO_SYNERGY_LEVEL,
} from "@heroesofcrypto/common/src/synergies/synergy_properties";

import { ruLabel, ruName } from "./names-ru";
import { extractRuleSections } from "./rules-extractor";
import { artifacts } from "../artifacts-data";
import { knowledgePath, type KnowledgeCatalogSection } from "../knowledge-base";
import { localizedFactionName } from "../localization";
import { abilityNote, artifactNote, DURATION_NOTE, effectNote, spellNote } from "../mechanics";
import { patchNotes } from "../patch-notes";
import { DEFAULT_RANKED_EXIT_RULES, ruleTokenValue, splitRuleTokens } from "../ranked-exit";
import { rankedArenaCopy } from "../ranked-arena-copy";
import { content, links, localPath, type Language } from "../site-data";
import { spells, type Spell } from "../spells-data";
import {
    abilities,
    allUnits,
    attackLabel,
    movementLabel,
    type Ability,
    type FactionName,
    type Unit,
} from "../units-data";
import type { KnowledgeEdge, KnowledgeEdgeRelation, KnowledgeGraph, KnowledgeNode } from "./graph-types";

export interface BuildKnowledgeGraphOptions {
    /** Rendered Knowledge Base pages, keyed by language; rules prose is extracted from them. */
    rulesHtml?: Partial<Record<Language, string>>;
    builtAt?: string;
    clientCommit?: string;
    commonCommit?: string;
    site?: string;
}

interface RawAbilityEntry {
    name: string;
    type: string;
    desc: string[];
    power: number | null;
    power_type: string;
    effect: string | null;
    aura_effect: string | null;
}

/**
 * English effect text where common's effects.json says something the engine does not do: Deep Wounds is not
 * spent by "the next attack" — every Deep Wounds attacker reads the whole wound total, hit after hit.
 */
const EFFECT_DESCRIPTION_OVERRIDES: Record<string, string> = {
    "Deep Wounds":
        "Every attack by a unit with a Deep Wounds ability deals extra damage to this target: the wound total, as a percentage.",
};

/** Abilities that apply an effect through their power type rather than an `effect` field. */
const effectByPowerType: Record<string, string> = { POISON_ON_HIT: "Poison" };

interface RawEffectEntry {
    name: string;
    laps: number;
    power: number;
    desc: string;
}

const RU_FACTIONS: FactionName[] = ["Life", "Nature", "Chaos", "Might"];

const pluralRu = (count: number, [one, few, many]: [string, string, string]): string => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
};

/** "1 круг", "2 круга", "15 кругов". */
const lapsRu = (laps: number): string => `${laps} ${pluralRu(laps, ["круг", "круга", "кругов"])}`;

/**
 * Status effects in Russian (common's effects.json is English only). "{}" takes the effect's power as in
 * English; the zero-power ones get their own wording, since their amount is set by whatever applied them.
 */
const effectDescriptionsRu: Record<string, { text: string; zeroPower?: string }> = {
    Stun: { text: "Юнит пропускает ход и не может отвечать." },
    Freeze: { text: "Юнит скован льдом: пропускает ходы и не может отвечать." },
    Blindness: { text: "Юнит теряет ход и не может совершать никаких действий." },
    "Boar Saliva": { text: "Юнит с вероятностью {}% промахивается физическими атаками." },
    "Shatter Armor": { text: "Юнит временно теряет {} брони." },
    Poison: {
        text: "Теряет {} здоровья в начале каждого своего хода.",
        zeroPower: "Теряет здоровье в начале каждого своего хода; сколько — задаёт наложившая яд способность.",
    },
    "Pegasus Light": { text: "Каждый юнит, атакующий цель, получает +{} морали." },
    Paralysis: { text: "Поражённый враг не может двигаться, а его урон снижен на {}%." },
    "Deep Wounds": {
        text: "Каждая атака юнита со способностью Deep Wounds наносит на {}% больше урона.",
        zeroPower: "Каждая атака юнита со способностью Deep Wounds наносит этой цели больше урона — на сумму её ран в процентах.",
    },
    Aggr: { text: "Заставляет цель отвечать только атакующему, не обращая внимания на других врагов." },
    Break: { text: "Отключает все способности юнита на два круга." },
    "Terrifying Gaze": {
        text: "Слишком напуган, чтобы противостоять чудовищу, которое на него взглянуло: не может ни атаковать, ни отвечать этому врагу, но может бить любого другого.",
    },
};

export const slugify = (value: string): string =>
    value
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9а-яё]+/giu, "-")
        .replace(/^-+|-+$/g, "");

const nodeId = (type: string, name: string): string => `${type}:${slugify(name)}`;

const hrefFor = (section: KnowledgeCatalogSection, entry: string): { href: string; hrefRu: string } => ({
    href: knowledgePath("en", { section, entry }),
    hrefRu: knowledgePath("ru", { section, entry }),
});

const bullet = (lines: readonly string[]): string => lines.map((line) => `- ${line}`).join("\n");
/** A multi-line card text as one line. */
const oneLine = (text: string): string => text.replace(/\s*\n\s*/g, " ").trim();

const joinNames = (names: string[]): string => (names.length ? names.join(", ") : "—");

/** "Медуза (Medusa, Хаос)": a Russian name with the in-game English and a detail in one bracket. */
const ruWithDetail = (name: string, detail: string): string => {
    const russian = ruName(name);
    return russian ? `${russian} (${name}, ${detail})` : `${name} (${detail})`;
};

const attackLabelRu: Record<string, string> = {
    MELEE: "ближняя атака",
    RANGE: "дальняя атака",
    MAGIC: "магическая атака",
    MELEE_MAGIC: "ближняя / магическая атака",
};
const movementLabelRu: Record<string, string> = { WALK: "пешком", FLY: "полёт", TELEPORT: "телепорт" };

/** common's ability and spell codes as Russian text says them ("MIND" read as English in a Russian answer). */
const abilityTypeRu: Record<string, string> = {
    HEAL: "лечение",
    BUFF_AURA: "аура-бафф",
    DEBUFF_AURA: "аура-дебафф",
    MIND: "Разум",
    STATUS: "Статус",
    CONTROL: "контроль",
    MASS_BUFF: "массовый бафф",
    TEMP_BUFF: "временный бафф",
    ATTACK: "атака",
    ADDITIONAL_ATTACK: "дополнительная атака",
    DEFENCE: "защита",
    INFO: "свойство",
    EFFECT: "эффект",
    SUPPLIES: "запас",
    REFLECT: "отражение",
    MOVEMENT: "движение",
    UNIT_TYPE: "тип юнита",
    RESPOND: "ответный удар",
};
const spellTargetRu: Record<string, string> = {
    ANY_ALLY: "любой союзник",
    ALL_ALLIES: "все союзники",
    ANY_ENEMY: "любой враг",
    RANDOM_CLOSE_TO_CASTER: "случайная клетка рядом с заклинателем",
    FREE_CELL: "свободная клетка",
    ENEMY_WITHIN_MOVEMENT_RANGE: "враг в пределах дистанции движения",
    AUTO: "автоматически",
    ALL_FLYING: "все летающие юниты",
    ALLIES_AREA: "союзники в области",
};
const spellBookRu: Record<string, string> = {
    Life: "Жизнь",
    Nature: "Природа",
    Order: "Порядок",
    Chaos: "Хаос",
    Death: "Смерть",
    System: "системная (эффекты игры)",
};

class GraphAssembler {
    readonly nodes = new Map<string, KnowledgeNode>();
    readonly edges: KnowledgeEdge[] = [];
    private readonly edgeKeys = new Set<string>();

    add(node: KnowledgeNode): KnowledgeNode {
        const existing = this.nodes.get(node.id);
        if (existing) return existing;
        this.nodes.set(node.id, node);
        return node;
    }

    link(from: string, to: string, rel: KnowledgeEdgeRelation, note?: string): void {
        if (from === to || !this.nodes.has(from) || !this.nodes.has(to)) return;
        const key = `${from}|${to}|${rel}`;
        if (this.edgeKeys.has(key)) return;
        this.edgeKeys.add(key);
        this.edges.push(note ? { from, to, rel, note } : { from, to, rel });
    }
}

const startingAmount = (unit: Unit): number => unit.draftedAmount;

/**
 * Where a shooter still hits for full damage. Falloff bands are squares of whole cells around the shooter's
 * body (king moves: a diagonal counts 1), one band = the shot distance rounded down, and the band's last
 * cell is still full strength (common attack_handler.getRangeAttackDivisor).
 */
const rangeBands = (unit: Unit, language: Language): string => {
    const isRu = language === "ru";
    if (unit.abilities.some((ability) => ability.name === "Sniper")) {
        return isRu
            ? "Дальность: полный урон на любом расстоянии (Sniper), но выстрел сквозь Smoke — вполовину"
            : "Range: full damage at any distance (Sniper), though a shot through Smoke is halved";
    }
    const band = Math.floor(unit.shotDistance);
    // A 16×16 board: nothing is farther than 15 cells, so bands past the edge go unlisted.
    const farthest = 15;
    const words = isRu ? ["полный урон", "половина", "четверть", "восьмая часть"] : ["full damage", "half", "a quarter", "an eighth"];
    const parts: string[] = [];
    for (let step = 0; step < words.length; step += 1) {
        const upTo = (step + 1) * band;
        if (step === words.length - 1 || upTo >= farthest) {
            parts.push(
                step === 0
                    ? isRu
                        ? `${words[0]} по всему полю`
                        : `${words[0]} anywhere on the board`
                    : isRu
                      ? `${words[step]} дальше ${step * band}`
                      : `${words[step]} beyond ${step * band}`,
            );
            break;
        }
        parts.push(isRu ? `${words[step]} до ${upTo} клеток` : `${words[step]} up to ${upTo} cells away`);
    }
    return isRu
        ? `Дальность (клетки считаются квадратом, диагональ = 1): ${parts.join(", ")}; апгрейд «Стрельба», Farsight Quiver и Guiding Winds расширяют полосы`
        : `Range (cells counted as a square, diagonals count 1): ${parts.join(", ")}; the Sniper augment, Farsight Quiver and Guiding Winds widen the bands`;
};

/** Factions the game's Russian interface names differently from the site (game/core i18n/ru.ts). */
const GAME_FACTION_NAMES_RU: Record<string, string> = { Might: "Мощь" };

/** Starting morale and luck by faction (common configuration/config_provider.ts). */
const FACTION_MORALE: Record<string, number> = { Life: 4, Might: 2, Nature: 1, Chaos: -1 };
const FACTION_LUCK: Record<string, number> = { Nature: 4, Life: 1, Might: 1, Chaos: -1 };
const signed = (value: number): string => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "0");

function unitText(unit: Unit, language: Language): string {
    const isRu = language === "ru";
    const faction = localizedFactionName(language, unit.faction);
    const attack = isRu ? (attackLabelRu[unit.attackType] ?? unit.attackType) : attackLabel(unit.attackType);
    const movement = isRu
        ? (movementLabelRu[unit.movementType] ?? unit.movementType)
        : movementLabel(unit.movementType);
    const footprint = unit.size === 1 ? "1x1" : unit.size === 2 ? "2x2" : `${unit.size}`;
    const abilityLines = unit.abilities.map(
        (ability) =>
            `${isRu ? ruLabel(ability.name) : ability.name}: ${(isRu ? ability.descriptionRu : ability.description).replace(/\s+/g, " ")}`,
    );
    const spellCounts = new Map<string, number>();
    for (const entry of unit.spells) {
        const name = entry.replace(/^[^:]+:/, "");
        spellCounts.set(name, (spellCounts.get(name) ?? 0) + 1);
    }
    const spellLines = [...spellCounts].map(([name, count]) => `${isRu ? ruLabel(name) : name} ×${count}`);
    if (isRu) {
        return [
            `**${ruLabel(unit.name)}** — ${faction}, уровень ${unit.level}${unit.summonedOnly ? " (только призыв, не драфтится)" : ""}.`,
            bullet([
                `Здоровье: ${unit.hp}`,
                `Атака: ${unit.attack} (${attack}), урон ${unit.damageMin}–${unit.damageMax}`,
                `Броня: ${unit.armor}, сопротивление магии: ${unit.magicResist}%`,
                `Инициатива: ${unit.initiative}, шаги: ${unit.steps} (${movement})`,
                `Размер: ${footprint}, опыт (ценность стека): ${unit.experience}`,
                ...(unit.rangeShots > 0
                    ? [`Выстрелы: ${unit.rangeShots}, дистанция выстрела: ${unit.shotDistance}`, rangeBands(unit, "ru")]
                    : []),
                ...(unit.summonedOnly
                    ? []
                    : [
                          `Стартовый стек: ${startingAmount(unit)} ${pluralRu(startingAmount(unit), ["существо", "существа", "существ"])} (1000 опыта ÷ ${unit.experience}, с округлением вверх), всего ${startingAmount(unit) * unit.hp} здоровья`,
                      ]),
                `Начальная мораль ${signed(FACTION_MORALE[unit.faction] ?? 0)}, базовая удача ${signed(FACTION_LUCK[unit.faction] ?? 0)} (по фракции)`,
            ]),
            `Способности:\n${abilityLines.length ? bullet(abilityLines) : "- нет"}`,
            spellLines.length ? `Книга заклинаний: ${spellLines.join(", ")}` : "Заклинаний нет.",
        ].join("\n\n");
    }
    return [
        `**${unit.name}** — ${faction}, level ${unit.level}${unit.summonedOnly ? " (summon-only, not draftable)" : ""}.`,
        bullet([
            `Health: ${unit.hp}`,
            `Attack: ${unit.attack} (${attack}), damage ${unit.damageMin}–${unit.damageMax}`,
            `Armor: ${unit.armor}, magic resist: ${unit.magicResist}%`,
            `Initiative: ${unit.initiative}, steps: ${unit.steps} (${movement})`,
            `Size: ${footprint}, experience (stack value): ${unit.experience}`,
            ...(unit.rangeShots > 0
                ? [`Shots: ${unit.rangeShots}, shot distance: ${unit.shotDistance}`, rangeBands(unit, "en")]
                : []),
            ...(unit.summonedOnly
                ? []
                : [
                      `Starting stack: ${startingAmount(unit)} creature${startingAmount(unit) === 1 ? "" : "s"} (1,000 experience ÷ ${unit.experience}, rounded up), ${startingAmount(unit) * unit.hp} health in total`,
                  ]),
            `Starting morale ${signed(FACTION_MORALE[unit.faction] ?? 0)}, base luck ${signed(FACTION_LUCK[unit.faction] ?? 0)} (from its faction)`,
        ]),
        `Abilities:\n${abilityLines.length ? bullet(abilityLines) : "- none"}`,
        spellLines.length ? `Spell book: ${spellLines.join(", ")}` : "No spells.",
    ].join("\n\n");
}

function unitSummary(unit: Unit, language: Language): string {
    const isRu = language === "ru";
    const faction = localizedFactionName(language, unit.faction);
    const attack = isRu ? (attackLabelRu[unit.attackType] ?? unit.attackType) : attackLabel(unit.attackType);
    const movement = isRu
        ? (movementLabelRu[unit.movementType] ?? unit.movementType)
        : movementLabel(unit.movementType);
    return isRu
        ? `${faction}, уровень ${unit.level}. ${attack}, ${movement}. Здоровье ${unit.hp}, атака ${unit.attack}, урон ${unit.damageMin}–${unit.damageMax}.`
        : `${faction}, level ${unit.level}. ${attack}, ${movement}. ${unit.hp} health, ${unit.attack} attack, ${unit.damageMin}–${unit.damageMax} damage.`;
}

const abilityKindLabel = (ability: Ability, language: Language): string => {
    if (language === "ru")
        return ability.kind === "aura" ? "Аура" : ability.kind === "active" ? "Активная" : "Пассивная";
    return ability.kind === "aura" ? "Aura" : ability.kind === "active" ? "Active" : "Passive";
};

/** "How it works: …" — the engine-checked mechanics under a card, when one is written for it. */
const howItWorks = (note: string | undefined, language: Language): string[] =>
    note ? [`${language === "ru" ? "Как это работает" : "How it works"}: ${note}`] : [];

function abilityText(ability: Ability, language: Language): string {
    const isRu = language === "ru";
    const carriers = ability.units.map((unit) =>
        isRu
            ? ruWithDetail(unit.name, localizedFactionName(language, unit.faction))
            : `${unit.name} (${localizedFactionName(language, unit.faction)})`,
    );
    const lines = [
        `**${isRu ? ruLabel(ability.name) : ability.name}** — ${abilityKindLabel(ability, language)}${
            ability.type ? ` · ${isRu ? (abilityTypeRu[ability.type] ?? ability.type) : ability.type}` : ""
        }${
            ability.isStackPowered ? (isRu ? " · зависит от силы стека" : " · scales with stack power") : ""
        }`,
        isRu ? ability.descriptionRu : ability.description,
        ...howItWorks(abilityNote(ability.name, language), language),
        carriers.length
            ? `${isRu ? "Носители" : "Carried by"}: ${carriers.join(", ")}`
            : ability.grantedBy
              ? isRu
                  ? `Ни один юнит не рождается с этой способностью: её даёт ${ruLabel(ability.grantedBy)}.`
                  : `No unit is born with this ability: it is granted by ${ability.grantedBy}.`
              : isRu
                ? "Носителей нет."
                : "No carriers.",
    ];
    return lines.join("\n\n");
}

const spellKindLabel = (spell: Spell, language: Language): string => {
    const labels =
        language === "ru"
            ? { spellbook: "заклинание из книги", ability: "применяется способностью", effect: "эффект" }
            : { spellbook: "spell book scroll", ability: "cast by an ability", effect: "applied effect" };
    return labels[spell.kind];
};

const spellPolarityLabel = (spell: Spell, language: Language): string => {
    if (!spell.polarity) return "";
    const labels =
        language === "ru"
            ? { buff: "бафф", debuff: "дебафф", damage: "урон" }
            : { buff: "buff", debuff: "debuff", damage: "damage" };
    return labels[spell.polarity];
};

function spellDurationLabel(spell: Spell, language: Language): string {
    const isRu = language === "ru";
    if (!spell.duration) return isRu ? "длительность не указана" : "no stated duration";
    if (spell.duration.kind === "laps")
        return isRu ? lapsRu(spell.duration.laps) : `${spell.duration.laps} lap(s)`;
    if (spell.duration.kind === "broken") return isRu ? "пока не разрушится" : "until broken";
    return isRu ? "до конца боя" : "whole fight";
}

function spellText(spell: Spell, language: Language): string {
    const isRu = language === "ru";
    const casters = spell.casters.map((caster) =>
        isRu
            ? ruWithDetail(caster.name, `${localizedFactionName(language, caster.faction)}, ×${caster.scrolls}`)
            : `${caster.name} (${localizedFactionName(language, caster.faction)}, ×${caster.scrolls})`,
    );
    const facts = [
        `${isRu ? "Школа" : "Book"}: ${isRu ? (spellBookRu[spell.book] ?? spell.book) : spell.book}`,
        `${isRu ? "Тип" : "Kind"}: ${spellKindLabel(spell, language)}${spell.polarity ? ` · ${spellPolarityLabel(spell, language)}` : ""}`,
        `${isRu ? "Уровень" : "Level"}: ${spell.level}`,
        `${isRu ? "Цель" : "Target"}: ${isRu ? (spellTargetRu[spell.target] ?? spell.target) : spell.target}`,
        `${isRu ? "Длительность" : "Duration"}: ${spellDurationLabel(spell, language)}`,
        `${isRu ? "Минимальная сила стека заклинателя" : "Minimum caster stack power"}: ${spell.minimalCasterStackPower}`,
        ...(spell.selfCastAllowed ? [isRu ? "Можно применить на себя" : "Can be cast on self"] : []),
        ...(spell.isGiftable ? [isRu ? "Можно подарить" : "Giftable"] : []),
        ...(spell.conflictsWith.length
            ? [`${isRu ? "Конфликтует с" : "Conflicts with"}: ${(isRu ? spell.conflictsWith.map(ruLabel) : spell.conflictsWith).join(", ")}`]
            : []),
    ];
    const source = casters.length
        ? `${isRu ? "Заклинатели" : "Casters"}: ${casters.join(", ")}`
        : spell.appliedBy.length
          ? `${isRu ? "Применяется способностями" : "Applied by abilities"}: ${(isRu ? spell.appliedBy.map(ruLabel) : spell.appliedBy).join(", ")}`
          : isRu
            ? "Применяется игрой автоматически (состояние, местность или предмет)."
            : "Applied automatically by the game (state, terrain or item).";
    return [
        `**${isRu ? ruLabel(spell.name) : spell.name}**`,
        isRu ? spell.descriptionRu : spell.description,
        ...howItWorks(spellNote(spell.name, language), language),
        bullet(facts),
        source,
    ].join("\n\n");
}

const artifactText = (artifact: (typeof artifacts)[number], language: Language): string => {
    const isRu = language === "ru";
    return [
        `**${isRu ? ruLabel(artifact.name) : artifact.name}** — ${isRu ? "артефакт уровня" : "Tier"} ${artifact.tier}${artifact.cursed ? (isRu ? " · проклятый (есть недостаток)" : " · cursed (has a downside)") : ""}`,
        isRu ? artifact.descriptionRu : artifact.description,
        ...howItWorks(artifactNote(artifact.name, language), language),
        isRu
            ? "Артефакты выбираются в драфте: артефакт 1-го уровня приходит с бандлом, который вы берёте, а артефакт 2-го уровня — один из трёх, предложенных после пика 3-го уровня. Оба действуют на всю армию с первого круга до конца боя."
            : "Artifacts come from the draft: your Tier 1 artifact arrives with the bundle you take, and your Tier 2 artifact is one of three offered after the Level-3 pick. Both work for the whole army from the first lap to the end of the fight.",
    ].join("\n\n");
};

interface AugmentSpec {
    name: string;
    nameRu: string;
    /** What the game's Russian interface calls it, when the site's name differs (i18n/ru.ts). */
    gameNameRu?: string;
    /** Which draftable units the bonus actually reaches, when that is not simply everyone. */
    beneficiaries?: { en: string; ru: string };
    summary: string;
    summaryRu: string;
    levels: { level: number; cost: number; effect: string; effectRu: string }[];
    note: string;
    noteRu: string;
    keywords: string[];
}

/** Spells and abilities the Empower bonuses raise (common EMPOWERED_MAGIC_ABILITIES + damage spells). */
const MAGIC_DAMAGE_SPELLS = new Set([
    ...["Fire Strike", "Fireball", "Meteorite", "Lightning Strike", "Ring of Fire", "Meteor Shower"],
    ...["Fire Wall", "Fireforged Sword"],
]);
const MAGIC_DAMAGE_ABILITIES = new Set(["Chain Lightning", "Fire Breath", "Fire Shield"]);

function augmentSpecs(): AugmentSpec[] {
    const draftable = allUnits.filter((unit) => !unit.summonedOnly);
    const shooters = draftable.filter((unit) => unit.attackType === "RANGE").map((unit) => unit.name);
    const magicDealers = draftable
        .filter(
            (unit) =>
                unit.spells.some((entry) => MAGIC_DAMAGE_SPELLS.has(entry.replace(/^[^:]+:/, ""))) ||
                unit.abilities.some((ability) => MAGIC_DAMAGE_ABILITIES.has(ability.name)),
        )
        .map((unit) => unit.name);
    const armor = [ArmorAugment.LEVEL_1, ArmorAugment.LEVEL_2, ArmorAugment.LEVEL_3].map(getArmorPower);
    const might = [MightAugment.LEVEL_1, MightAugment.LEVEL_2, MightAugment.LEVEL_3].map(getMightPower);
    const empower = [EmpowerAugment.LEVEL_1, EmpowerAugment.LEVEL_2, EmpowerAugment.LEVEL_3].map(getEmpowerPower);
    const sniper = [SniperAugment.LEVEL_1, SniperAugment.LEVEL_2, SniperAugment.LEVEL_3].map(getSniperPower);
    const movement = [MovementAugment.LEVEL_1, MovementAugment.LEVEL_2].map(getMovementPower);
    const placement = [PlacementAugment.LEVEL_1, PlacementAugment.LEVEL_2, PlacementAugment.LEVEL_3].map(
        (level) => getPlacementSizes(PlacementType.RECTANGLE, level, DefaultPlacementLevel1.THREE_BY_THREE)[0],
    );
    const stackCaps = [6, 7, 8];
    return [
        {
            name: "Armor Augment",
            nameRu: "Апгрейд «Броня»",
            summary:
                "Every unit gets a percentage of its base armor plus the same number of flat magic-resistance points.",
            summaryRu: "Каждый юнит получает процент к базовой броне и столько же очков сопротивления магии.",
            levels: armor.map((power, index) => ({
                level: index + 1,
                cost: index + 1,
                effect: `+${power}% base armor and +${power} magic resistance`,
                effectRu: `+${power}% базовой брони и +${power} сопротивления магии`,
            })),
            note: "Armor grows by a percentage of the unit's own base armor (before flat artifact armor); magic resistance gains the points outright, because creatures start with 0 / 5 / 8–12 / 15 by level — the flat bonus matters most to low-level creatures.",
            noteRu: "Броня растёт на процент от собственной базовой брони юнита (до плоской брони артефактов); сопротивление магии получает очки напрямую, потому что у существ оно изначально 0 / 5 / 8–12 / 15 по уровням, — плоский бонус важнее всего для существ низкого уровня.",
            keywords: ["defense", "защита", "armour"],
        },
        {
            name: "Might Augment",
            nameRu: "Апгрейд «Сила»",
            gameNameRu: "Мощь",
            summary: "Base-attack bonus while a unit's selected attack is not a shot: every melee unit, and a shooter switched to melee on its turn.",
            summaryRu: "Бонус к базовой атаке, пока выбранная атака юнита — не выстрел: каждому юниту ближнего боя и стрелку, переключённому в ближний бой в свой ход.",
            levels: might.map((power, index) => ({
                level: index + 1,
                cost: index + 1,
                effect: `+${power}% base attack while the selected attack is not a shot`,
                effectRu: `+${power}% к базовой атаке, пока выбранная атака — не выстрел`,
            })),
            note: "For armies that intend to fight up close. The bonus follows the attack a unit has selected (set on its own turn), not the blow: a shooter on its ranged selection retaliates in melee with the Sniper augment's bonus rather than this one.",
            noteRu: "Для армий, которые собираются драться вплотную. Бонус следует за выбранной атакой юнита (она выбирается в его ход), а не за ударом: стрелок с выбранной дальней атакой отвечает в ближнем бою с бонусом «Стрельбы», а не этим.",
            keywords: ["melee", "attack", "ближний бой", "атака"],
        },
        {
            name: "Empower Augment",
            nameRu: "Апгрейд «Магия»",
            gameNameRu: "Усиление",
            beneficiaries: {
                en: `Only magic damage gains, so it is worth points only to an army with a source of it: ${magicDealers.join(", ")}.`,
                ru: `Растёт только магический урон, поэтому очки стоит тратить только армии с его источником: ${magicDealers.join(", ")}.`,
            },
            summary:
                "Team-wide magic damage bonus: offensive spells, Fire Wall, Fireforged Sword, Chain Lightning, Fire Breath and Fire Shield.",
            summaryRu:
                "Командный бонус к магическому урону: атакующие заклинания, Fire Wall, Fireforged Sword, Chain Lightning, Fire Breath и Fire Shield.",
            levels: empower.map((power, index) => ({
                level: index + 1,
                cost: index + 1,
                effect: `+${power}% magic damage`,
                effectRu: `+${power}% магического урона`,
            })),
            note: "Does not touch healing, buffs or control spells (Heal, Whirlpool, Magic Mirror). Stacks additively with Mage's Ring, Archmage's Ring, the Empower scroll and Sylvan Focus: all of them form one sum.",
            noteRu: "Не влияет на лечение, баффы и контроль (Heal, Whirlpool, Magic Mirror). Складывается аддитивно с Mage's Ring, Archmage's Ring, свитком Empower и Sylvan Focus: все они дают одну сумму.",
            keywords: ["magic", "spell damage", "магия", "магический урон"],
        },
        {
            name: "Sniper Augment",
            nameRu: "Апгрейд «Стрельба»",
            gameNameRu: "Снайпер",
            beneficiaries: {
                en: `It reaches only the shooters: ${shooters.join(", ")}.`,
                ru: `Действует только на стрелков: ${shooters.join(", ")}.`,
            },
            summary: "Base-attack and shot-distance bonus for ranged units while their selected attack is the shot (the default).",
            summaryRu: "Бонус к базовой атаке и дистанции выстрела для стрелков, пока их выбранная атака — выстрел (по умолчанию).",
            levels: sniper.map(([attack, range], index) => ({
                level: index + 1,
                cost: index + 1,
                effect: `+${attack}% base attack and +${range}% shot distance`,
                effectRu: `+${attack}% к базовой атаке и +${range}% к дистанции выстрела`,
            })),
            note: "The longer shot distance widens the falloff bands — it adds to Farsight Quiver's +50%, both counted from the base distance — but never removes falloff. Bands count whole cells, so a bonus only helps once it adds a full cell: a Centaur's 4 cells stay 4 at level 1 (4.8) and become 5 at level 2. Units with the Sniper ability already ignore falloff, so for them only the attack bonus counts.",
            noteRu: "Большая дистанция расширяет полосы дальности — и складывается с +50% Farsight Quiver, оба бонуса считаются от базы, — но штраф за дальность не отменяет. Полосы считаются целыми клетками, поэтому бонус помогает, только когда добавляет полную клетку: 4 клетки Centaur на 1 уровне остаются 4 (4,8), а на 2 уровне становятся 5. Юниты со способностью Sniper и так его игнорируют, поэтому им важен только бонус к атаке.",
            keywords: ["ranged", "archer", "range", "стрелок", "дальность"],
        },
        {
            name: "Movement Augment",
            nameRu: "Апгрейд «Движение»",
            gameNameRu: "Передвижение",
            summary: "Team-wide extra movement steps.",
            summaryRu: "Дополнительные шаги движения для всей команды.",
            levels: movement.map((power, index) => ({
                level: index + 1,
                cost: index + 1,
                effect: `+${power} movement step${power === 1 ? "" : "s"}`,
                effectRu: `+${power} шаг(а) движения`,
            })),
            note: "Only two levels exist.",
            noteRu: "Есть только два уровня.",
            keywords: ["steps", "speed", "шаги", "скорость"],
        },
        {
            name: "Placement Augment",
            nameRu: "Апгрейд «Расстановка»",
            summary: "Deeper deployment zone and a higher stack cap on the ranked board.",
            summaryRu: "Более глубокая зона расстановки и больший лимит стеков на рейтинговом поле.",
            levels: placement.map((depth, index) => ({
                level: index + 1,
                cost: index,
                effect:
                    index === 0
                        ? `free: ${depth} cells deep, partial zone (outer side column and both ends closed), up to ${stackCaps[index]} stacks`
                        : index === 1
                          ? `${depth} cells deep, full height (side-edge column still closed), up to ${stackCaps[index]} stacks`
                          : `${depth} cells deep including the side edge, up to ${stackCaps[index]} stacks before Nature's Board Units synergy`,
                effectRu:
                    index === 0
                        ? `бесплатно: ${depth} клетки вглубь, частичная зона (крайняя боковая колонка и торцы закрыты), до ${stackCaps[index]} стеков`
                        : index === 1
                          ? `${depth} клетки вглубь, полная высота (боковая кромка ещё закрыта), до ${stackCaps[index]} стеков`
                          : `${depth} клеток вглубь вместе с боковым краем, до ${stackCaps[index]} стеков до синергии Природы «Отряды на поле»`,
            })),
            note: "Level 1 is free; level 2 costs 1 point and level 3 costs 2 points.",
            noteRu: "Уровень 1 бесплатный; уровень 2 стоит 1 очко, уровень 3 — 2 очка.",
            keywords: ["deployment", "zone", "board", "stacks", "расстановка", "зона", "стеки"],
        },
    ];
}

interface SynergySpec {
    faction: FactionName;
    variant: number;
    name: string;
    nameRu: string;
    effect: (powers: number[]) => string;
    effectRu: (powers: number[]) => string;
    /** How the engine applies it, checked against common; the levels' numbers come from SynergyKeysToPower. */
    detail: string;
    detailRu: string;
    keywords: string[];
}

/**
 * "200 Peasant → 238, …" at Life Supply level 3, grown the way the engine does at fight start. Unit names
 * stay English in both languages; the AI search pairs them with the Russian ones when it answers.
 */
const supplyExamples = (): string => {
    const percent = SynergyKeysToPower[`Life:${LifeSynergy.PLUS_SUPPLY_PERCENTAGE}:3`]?.[0] ?? 0;
    return ["Peasant", "Centaur", "Beholder", "Monk", "Angel"]
        .map((name) => allUnits.find((unit) => unit.name === name))
        .filter((unit): unit is Unit => Boolean(unit))
        .map((unit) => {
            const amount = Math.max(1, Math.ceil(1000 / unit.experience));
            const grown = Math.floor(amount * (1 + percent / 100));
            return `${amount} ${unit.name} → ${grown}`;
        })
        .join(", ");
};

const synergySpecs: SynergySpec[] = [
    {
        faction: "Life",
        variant: LifeSynergy.PLUS_SUPPLY_PERCENTAGE,
        name: "Life Supply Synergy",
        nameRu: "Синергия Жизни «Запас»",
        effect: ([power]) => `every stack grows ${power}% when the fight starts`,
        effectRu: ([power]) => `каждый стек вырастает на ${power}% в начале боя`,
        detail: `Applied once, when the fight starts: every stack's size is multiplied and rounded down, so small stacks gain nothing — at level 1 the first extra creature needs 17 in the stack, at level 2 nine, at level 3 six — and level-4 stacks of 1–3 creatures never grow. Creatures summoned later get nothing. At level 3: ${supplyExamples()}. It is worth most to armies of big low-level stacks.`,
        detailRu: `Применяется один раз, в начале боя: размер каждого стека умножается и округляется вниз, поэтому маленькие стеки ничего не получают — на уровне 1 первое лишнее существо появляется при 17 в стеке, на уровне 2 — при 9, на уровне 3 — при 6, — а стеки 4 уровня из 1–3 существ не растут никогда. Призванные позже существа ничего не получают. На уровне 3: ${supplyExamples()}. Больше всего она даёт армиям из больших стеков низкого уровня.`,
        keywords: ["supply", "stack size", "снабжение", "запас"],
    },
    {
        faction: "Life",
        variant: LifeSynergy.PLUS_MORALE_AND_LUCK,
        name: "Life Morale and Luck Synergy",
        nameRu: "Синергия Жизни «Мораль и удача»",
        effect: ([morale, luck]) => `+${morale} morale and +${luck} luck for every unit`,
        effectRu: ([morale, luck]) => `+${morale} морали и +${luck} удачи каждому юниту`,
        detail: "Every unit of the army, whatever its faction, gets the bonus. Morale is capped at +20 and luck at +10, so part of it is wasted on stacks already near the caps (Luck Aura, Clover of Fortune); Madness and Mechanism units stay at 0 morale.",
        detailRu: "Бонус получает каждый юнит армии любой фракции. Мораль ограничена +20, удача +10, поэтому часть бонуса пропадает у стеков, уже близких к пределам (Luck Aura, Clover of Fortune); у Madness и Mechanism мораль остаётся 0.",
        keywords: ["morale", "luck", "мораль", "удача"],
    },
    {
        faction: "Chaos",
        variant: ChaosSynergy.MOVEMENT,
        name: "Chaos Movement Synergy",
        nameRu: "Синергия Хаоса «Передвижение»",
        effect: ([power]) => `+${power} movement step${power === 1 ? "" : "s"} for every unit`,
        effectRu: ([power]) => `+${power} к движению каждому юниту`,
        detail: "Every unit of the army, whatever its faction, moves farther. Percentage slows (Quagmire, Hamstrung) shrink the bonus too.",
        detailRu: "Каждый юнит армии любой фракции ходит дальше. Процентные замедления (Quagmire, Hamstrung) урезают и этот бонус.",
        keywords: ["movement", "steps", "движение", "передвижение"],
    },
    {
        faction: "Chaos",
        variant: ChaosSynergy.BREAK_ON_ATTACK,
        name: "Chaos Break on Attack Synergy",
        nameRu: "Синергия Хаоса «Разлом при атаке»",
        effect: ([power]) => `${power}% chance per weapon hit to Break the target for 2 laps`,
        effectRu: ([power]) => `${power}% шанс при каждом ударе оружием наложить на цель Break на 2 круга`,
        detail: "Every damaging hit of every unit rolls — attacks, retaliations, second strikes, and each unit struck by splash or a piercing shot; magic follow-ups (Chain Lightning arcs, Fire Breath, Fire Shield, Fireforged burns) never roll. A unit already Broken is rolled on again only by a retaliation or counter-shot, which can renew its Break; there is no roll when a Water Shield absorbs the hit, and resistances don't lower it. Break shuts off all of the target's abilities, auras, blessings and spellcasting for 2 laps. Spells never Break.",
        detailRu: "Бросок делает каждое попадание с уроном каждого юнита — атаки, ответы, вторые удары и каждый, кого задел удар по площади или пробивающий выстрел; магические добавки (разряды Chain Lightning, Fire Breath, Fire Shield, поджоги Fireforged) не бросают никогда. Против юнита, уже находящегося под Break, бросают только ответ и ответный выстрел — и могут обновить Break; при поглощении удара Water Shield броска нет, а сопротивления его не снижают. Break отключает все способности, ауры, благословения и заклинания цели на 2 круга. Заклинания Break не накладывают.",
        keywords: ["break", "disable abilities", "разлом"],
    },
    {
        faction: "Might",
        variant: MightSynergy.PLUS_AURAS_RANGE,
        name: "Might Aura Range Synergy",
        nameRu: "Синергия Силы «Радиус аур»",
        effect: ([power]) => `+${power} cell${power === 1 ? "" : "s"} to every aura's range`,
        effectRu: ([power]) => `+${power} к радиусу каждой ауры`,
        detail: "Every aura of your army reaches farther — including enemy-facing ones such as Range Null Field and Web, War Anger's counting radius and Disguise's detection radius (auras reach 2 cells by default, Disguise 3). Blessings are not auras and already cover the whole board.",
        detailRu: "Каждая аура вашей армии бьёт дальше — включая направленные на врага, такие как Range Null Field Aura и Web Aura, радиус подсчёта War Anger Aura и радиус обнаружения Disguise Aura (ауры по умолчанию достают на 2 клетки, Disguise — на 3). Благословения — не ауры, они и так покрывают всё поле.",
        keywords: ["aura", "range", "аура", "мощь", "мощи"],
    },
    {
        faction: "Might",
        variant: MightSynergy.PLUS_STACK_ABILITIES_POWER,
        name: "Might Stack Abilities Power Synergy",
        nameRu: "Синергия Силы «Сила способностей»",
        effect: ([power]) => `+${power} points to ability chances and strength`,
        effectRu: ([power]) => `+${power} очков к шансам и силе способностей`,
        detail: "Added like extra luck to nearly every ability of every unit in the army: the points go onto trigger chances (Stun, Dodge, Blindness…), onto percentage effects and most auras, onto Deep Wounds, and a tenth of them onto count abilities (steps, armor taken). Magic Reflection, Guiding Winds, Sylvan Focus and the creature blessings don't use it. Unlike luck it isn't capped, and it works whether or not the ability is stack-powered.",
        detailRu: "Прибавляется как дополнительная удача почти к каждой способности каждого юнита армии: очки идут к шансам срабатывания (Stun, Dodge, Blindness…), к процентным эффектам и большинству аур, к Deep Wounds, а десятая часть — к способностям-счётчикам (шаги, отнятая броня). Magic Reflection, Guiding Winds, Sylvan Focus и благословения существ её не используют. В отличие от удачи не ограничена пределом и действует независимо от того, зависит ли способность от силы стека.",
        keywords: ["abilities power", "ability power", "stack power", "сила способностей", "мощь", "мощи"],
    },
    {
        faction: "Nature",
        variant: NatureSynergy.INCREASE_BOARD_UNITS,
        name: "Nature Board Units Synergy",
        nameRu: "Синергия Природы «Отряды на поле»",
        effect: ([power]) => `+${power} fielded stacks (raises the stack cap)`,
        effectRu: ([power]) => `+${power} стека(ов) на поле (повышает лимит стеков)`,
        detail: "Raises the number of stacks you may field — 6, 7 or 8 by Placement tier — for an absolute cap of 12; more stacks means splitting a roster unit without losing a slot.",
        detailRu: "Повышает число стеков, которые можно выставить, — 6, 7 или 8 по уровню «Расстановки», — до абсолютного максимума 12; больше стеков — значит, можно разделить юнита, не теряя места.",
        keywords: ["stack cap", "more units", "лимит стеков", "юниты на поле", "отряды на поле"],
    },
    {
        faction: "Nature",
        variant: NatureSynergy.PLUS_FLY_ARMOR,
        name: "Nature Flying Armor Synergy",
        nameRu: "Синергия Природы «Броня летающих»",
        effect: ([power]) => `+${power}% base armor for every flyer`,
        effectRu: ([power]) => `+${power}% базовой брони каждому летающему`,
        detail: "Every flying unit of the army, whatever its faction, gets the armor. Spiritual Armor on such a flyer doesn't add to it: the flyer gets Spiritual Armor's 30% × (1 + this bonus) instead — +40.5% in place of +35% at level 3.",
        detailRu: "Броню получает каждый летающий юнит армии любой фракции. Spiritual Armor на таком летающем к ней не добавляется: летающий получает 30% Spiritual Armor × (1 + этот бонус) — +40,5% вместо +35% на 3 уровне.",
        keywords: ["flying", "fly", "armor", "летающие", "броня"],
    },
];

const synergyLevels = [1, 2, 3] as const;
const unitsForLevel = (level: number): number =>
    Number(Object.entries(UNITS_TO_SYNERGY_LEVEL).find(([, value]) => value === level)?.[0] ?? level * 2);

interface FormulaSpec {
    name: string;
    nameRu: string;
    /** The way players ask for it, when that shares no words with the name. */
    aliases?: string[];
    summary: string;
    summaryRu: string;
    text: string;
    textRu: string;
    keywords: string[];
    rule: string;
}

function formulaSpecs(): FormulaSpec[] {
    const minutes = TOTAL_TIME_TO_MAKE_TURN_MILLIS / 60_000;
    const minTurn = MIN_TIME_TO_MAKE_TURN_MILLIS / 1000;
    const maxTurn = MAX_TIME_TO_MAKE_TURN_MILLIS / 1000;
    const lastWave = NUMBER_OF_LAPS_FIRST_ARMAGEDDON + NUMBER_OF_ARMAGEDDON_WAVES - 1;
    const scheduledRings = (every: number): number[] =>
        Array.from({ length: NUMBER_OF_LAPS_TILL_STOP_NARROWING }, (_, index) => index + 1).filter(
            (lap) => lap > every && lap % every === 1,
        );
    const normalRings = scheduledRings(NUMBER_OF_LAPS_TILL_NARROWING_NORMAL);
    const barrelRings = scheduledRings(NUMBER_OF_LAPS_TILL_NARROWING_BLOCK);
    return [
        {
            name: "Attack damage formula",
            nameRu: "Формула урона от атаки",
            summary:
                "How the engine turns a unit's damage range, attack, stack size, enemy armor, luck, range and morale into one number.",
            summaryRu:
                "Как движок превращает диапазон урона, атаку, размер стека, броню врага, удачу, дальность и мораль в одно число.",
            text: [
                "Every attack rolls one integer inside a band. Each end of the band is computed as:",
                "`ceil( damage_roll × attack × alive_bodies / enemy_armor × (1 − enemy_luck / 100) / range_divisor × morale_multiplier )`, minimum 1.",
                bullet([
                    "`damage_roll` is the unit's min or max damage. The roll is a whole number from the band's lower end up to one less than its upper end, so the very top is never rolled unless both ends are equal (Blessing and Battle Roar force the top, Curse the bottom).",
                    "`attack` is the attacker's current attack rating; `alive_bodies` is the number of living creatures in the stack.",
                    "`enemy_armor` is the target's armor (its ranged armor against a shot). Piercing Spear ignores 10% of it per stack power (50% at full stack).",
                    "`enemy_luck` runs from −10 to +10, so a lucky target takes about 1% less damage per point and an unlucky one about 1% more. Only attacks read the target's luck; spells, poison, Fire Wall and Armageddon ignore it.",
                    "`range_divisor` is 1 in melee and inside the first band of shot distance, then 2, 4 and at most 8; Smoke doubles it once more (still capped at 8). Units with the Sniper ability ignore distance, but not Smoke.",
                    "`morale_multiplier` is 1.25 while the attacker is on Morale, 0.8 on Dismorale, otherwise 1 — retaliations included.",
                ]),
                "The roll is then multiplied, in this order, and floored once: ×0.5 when a shooter without Handyman hits in melee (attacks and retaliations), × the ability multiplier (Through Shot, Area Throw, Double Shot's second arrow, Rapid Charge…), ×(100 − power)% when the attacker is Paralysed, × (1 + wound total %) when the attacker holds any Deep Wounds card and the target carries wounds, × the elemental multiplier (Fire and Water against each other, Earth and Wind against each other: ×1.5). After that single floor only a few things still change the hit: Lucky Strike, Penetrating Bite's flat bonus, Flesh Shield redirecting part of it, a Water Shield absorbing it — and on splash and bounce hits their own rounded multipliers (Chakram's half-damage bounce, Giant's Maul, status resistance or the Mechanism penalty). The band ends are at least 1, but the floored hit can reach 0.",
                "A ranged attack with an empty quiver deals 0. Stack losses are the damage divided through the target's per-creature health, the wounded front creature first. Spells use their own formula (see Spell damage).",
            ].join("\n\n"),
            textRu: [
                "Каждая атака бросает одно целое число внутри диапазона. Каждая граница диапазона считается так:",
                "`ceil( урон × атака × живые_существа / броня_врага × (1 − удача_врага / 100) / делитель_дальности × множитель_морали )`, минимум 1.",
                bullet([
                    "`урон` — минимальный или максимальный урон юнита. Бросок — целое число от нижней границы до верхней минус один, поэтому самый верх выпадает, только если границы равны (Blessing и Battle Roar дают верхнюю границу, Curse — нижнюю).",
                    "`атака` — текущая атака атакующего; `живые_существа` — число живых существ в стеке.",
                    "`броня_врага` — броня цели (против выстрела — её броня от дальних атак). Piercing Spear игнорирует 10% брони за единицу силы стека (50% при полной силе).",
                    "`удача_врага` от −10 до +10: удачливая цель получает примерно на 1% меньше урона за очко, неудачливая — больше. Удачу цели учитывают только атаки; заклинания, яд, Fire Wall и Армагеддон её игнорируют.",
                    "`делитель_дальности` равен 1 в ближнем бою и в первой полосе дистанции выстрела, затем 2, 4 и максимум 8; Smoke удваивает его ещё раз (предел тот же — 8). Юниты со способностью Sniper игнорируют расстояние, но не Smoke.",
                    "`множитель_морали` равен 1.25, пока атакующий под Morale, 0.8 под Dismorale, иначе 1 — и для ответных ударов тоже.",
                ]),
                "Затем бросок умножается в таком порядке и один раз округляется вниз: ×0.5, если стрелок без Handyman бьёт в ближнем бою (атаки и ответы); × множитель способности (Through Shot, Area Throw, вторая стрела Double Shot, Rapid Charge…); ×(100 − сила)%, если атакующий под Paralysis; × (1 + сумма ран %), если у атакующего есть любая карта Deep Wounds, а на цели раны; × стихийный множитель (Огонь и Вода друг против друга, Земля и Ветер друг против друга: ×1.5). После этого округления удар меняют лишь Lucky Strike, плоский бонус Penetrating Bite, Flesh Shield, забирающий часть удара, Water Shield, поглощающий его, — а удары по площади и отскоки получают ещё свои округлённые множители (половина урона у отскока Chakram, Giant's Maul, сопротивление статусам или штраф Mechanism). Границы диапазона не меньше 1, но итоговый удар после округления может стать 0.",
                "Дальняя атака с пустым колчаном наносит 0. Потери стека — это урон, поделённый на здоровье одного существа цели, начиная с раненого переднего. У заклинаний своя формула (см. «Урон заклинаний»).",
            ].join("\n\n"),
            keywords: ["damage", "formula", "calculation", "armor", "attack", "урон", "формула", "расчёт", "броня", "атака"],
            rule: "rule-mechanics",
        },
        {
            name: "Morale",
            nameRu: "Мораль",
            summary:
                "Morale runs from −20 to +20 and rolls at lap start: Morale acts first with ×1.25 damage, Dismorale acts late with ×0.8 — neither adds or removes a turn.",
            summaryRu:
                "Мораль от −20 до +20 и бросается в начале круга: Morale ходит первым с ×1.25 урона, Dismorale — поздно с ×0.8; ход ни добавляется, ни пропадает.",
            text: [
                `Morale is capped at ±${MORALE_MAX_VALUE_TOTAL}. Every creature starts with its faction's morale: Life +4, Might +2, Nature +1, Chaos −1. At the start of each lap the engine rolls a chance equal to the stack's absolute morale. A positive roll (Morale) puts it ahead of the regular turn order with ×1.25 damage for the lap; a negative roll (Dismorale) puts it after every regular stack — only Hourglass waiters come later — with ×0.8 damage. Either way the stack still takes exactly one turn. The multiplier also covers its retaliations and the damage spells, Heal and Resurrection it casts that lap.`,
                "While a stack is on Morale or Dismorale — or under Courage (+20) or Sadness (−20) — its morale cannot change; on Morale its buffs don't count down that lap, on Dismorale its debuffs and effects don't. Madness and Mechanism units sit at 0 and never roll (unless Broken, when those abilities are off).",
                "Exact changes:",
                bullet([
                    `+${MORALE_CHANGE_FOR_DISTANCE} for a move that ends closer to the centre of the enemy army (all enemy stacks, unweighted), −${MORALE_CHANGE_FOR_DISTANCE} for one that ends farther away; only a move ending at exactly the same distance is neutral. A melee attack's walk-in counts as a move.`,
                    `+${MORALE_CHANGE_FOR_KILL} to whichever stack destroys an enemy stack — the attacker, a retaliating defender or a caster; −${MORALE_CHANGE_FOR_KILL} to each of your other surviving stacks of a unit whose stack was wiped out. Deaths to Armageddon, narrowing, poison or Fire Wall change nobody's morale.`,
                    `−${MORALE_CHANGE_FOR_CLOCK} for waiting on the Hourglass, −${MORALE_CHANGE_FOR_SHIELD} for Defend (Luck Shield), −${MORALE_CHANGE_FOR_SKIP} for an actual skipped turn (including a timeout passed to the engine as a skip, or a turn lost to Whirlpool)`,
                    "Ending the turn after moving or another action costs nothing.",
                    "Other sources: the Life Morale and Luck synergy (+6/+13/+20), Crown of Command (+8), Cursed Ward (−6), and hitting an enemy marked by Pegasus Light (+10 plus the Pegasus's luck).",
                ]),
                `In a stalled fight morale also moves units: every lap in which the map narrows, or no stack ends closer to its nearest enemy, adds 0.05 steps per point of morale for the rest of the fight (+1 step at +20 after one such lap), and negative morale takes steps away.`,
            ].join("\n\n"),
            textRu: [
                `Мораль ограничена ±${MORALE_MAX_VALUE_TOTAL}. Каждое существо начинает с моралью своей фракции: Жизнь +4, Сила +2, Природа +1, Хаос −1. В начале каждого круга движок бросает шанс, равный модулю морали стека. Положительный результат (Morale) ставит его раньше обычной очереди с ×1.25 урона на круг; отрицательный (Dismorale) — после всех обычных стеков (позже ходят только ожидающие через Hourglass) с ×0.8 урона. В обоих случаях у стека ровно один ход. Множитель действует и на его ответы, и на заклинания урона, Heal и Resurrection, применённые в этом круге.`,
                "Пока стек под Morale или Dismorale — или под Courage (+20) и Sadness (−20), — его мораль не меняется; под Morale его баффы в этом круге не убывают, под Dismorale не убывают дебаффы и эффекты. Юниты с Madness и Mechanism имеют 0 морали и не бросают её (кроме как под Break, когда эти способности отключены).",
                "Точные изменения:",
                bullet([
                    `+${MORALE_CHANGE_FOR_DISTANCE} за перемещение, закончившееся ближе к центру вражеской армии (всех вражеских стеков, без весов), −${MORALE_CHANGE_FOR_DISTANCE} за закончившееся дальше; нейтрально только перемещение ровно на то же расстояние. Подход к ближней атаке считается перемещением.`,
                    `+${MORALE_CHANGE_FOR_KILL} тому стеку, который уничтожил вражеский стек, — атакующему, отвечающему защитнику или заклинателю; −${MORALE_CHANGE_FOR_KILL} каждому вашему другому стеку того же юнита, чей стек был уничтожен. Гибель от Армагеддона, сужения, яда или Fire Wall ничью мораль не меняет.`,
                    `−${MORALE_CHANGE_FOR_CLOCK} за ожидание (Hourglass), −${MORALE_CHANGE_FOR_SHIELD} за защиту (Luck Shield), −${MORALE_CHANGE_FOR_SKIP} за фактический пропуск хода (включая таймаут, переданный движку как пропуск, и ход, потерянный из-за Whirlpool)`,
                    "Завершение хода после движения или другого действия ничего не стоит.",
                    "Другие источники: синергия Жизни «Мораль и удача» (+6/+13/+20), Crown of Command (+8), Cursed Ward (−6) и удар по врагу с меткой Pegasus Light (+10 плюс удача Pegasus).",
                ]),
                "В затянувшемся бою мораль ещё и двигает юнитов: каждый круг, когда карта сужается или ни один стек не стал ближе к ближайшему врагу, добавляет 0.05 шага за очко морали до конца боя (+1 шаг при +20 после одного такого круга), а отрицательная мораль шаги отнимает.",
            ].join("\n\n"),
            keywords: ["morale", "tempo", "priority", "queue", "dismorale", "мораль", "темп", "очередь"],
            rule: "rule-morale",
        },
        {
            name: "Luck",
            nameRu: "Удача",
            summary:
                "Luck runs from −10 to +10, is re-rolled every lap around the faction base, cuts attack damage taken by ~1% per point and adds to the stack's ability chances.",
            summaryRu:
                "Удача от −10 до +10, перебрасывается каждый круг вокруг базы фракции, снижает урон от атак примерно на 1% за очко и добавляется к шансам способностей стека.",
            text: [
                `Luck is capped at ±${LUCK_MAX_VALUE_TOTAL}. Each lap it is re-rolled: the faction base (Nature +4, Life +1, Might +1, Chaos −1), plus a fresh −${LUCK_MAX_CHANGE_FOR_TURN}…+${LUCK_MAX_CHANGE_FOR_TURN}, plus synergy and artifact bonuses — it never accumulates from lap to lap. Defend (Luck Shield) replaces the roll with +${LUCK_CHANGE_FOR_SHIELD} for the rest of the lap at the cost of the turn and ${MORALE_CHANGE_FOR_SHIELD} morale.`,
                "What it does: incoming attack damage changes by about 1% per point (positive luck reduces it); spells, poison, Fire Wall and Armageddon ignore it. Each point also adds 1 percentage point to the stack's own ability chances (Stun, Dodge, Blindness…) and shifts the strength of many abilities and auras.",
                "Luck Aura fixes luck at exactly +10 for allies in range; Clover of Fortune adds +10 army-wide (so most units sit at the +10 cap); Cursed Ward gives +3 luck for −6 morale; the Life Morale and Luck synergy gives +2/+5/+9. Misfortune sets luck to −10 for 3 laps — to 0 on a unit with Luck Aura or Clover — and blocks both the lap roll and Luck Shield's bonus.",
            ].join("\n\n"),
            textRu: [
                `Удача ограничена ±${LUCK_MAX_VALUE_TOTAL}. Каждый круг она перебрасывается: база фракции (Природа +4, Жизнь +1, Сила +1, Хаос −1) плюс свежие −${LUCK_MAX_CHANGE_FOR_TURN}…+${LUCK_MAX_CHANGE_FOR_TURN} плюс бонусы синергий и артефактов — от круга к кругу она не накапливается. Защита (Luck Shield) заменяет бросок на +${LUCK_CHANGE_FOR_SHIELD} до конца круга ценой хода и ${MORALE_CHANGE_FOR_SHIELD} морали.`,
                "Что она делает: входящий урон от атак меняется примерно на 1% за очко (положительная удача его снижает); заклинания, яд, Fire Wall и Армагеддон её игнорируют. Каждое очко также добавляет 1 процентный пункт к шансам способностей самого стека (Stun, Dodge, Blindness…) и сдвигает силу многих способностей и аур.",
                "Luck Aura фиксирует удачу союзников в радиусе ровно на +10; Clover of Fortune добавляет +10 всей армии (поэтому большинство юнитов стоит на пределе +10); Cursed Ward даёт +3 удачи за −6 морали; синергия Жизни «Мораль и удача» — +2/+5/+9. Misfortune ставит удачу в −10 на 3 круга — в 0 у юнита с Luck Aura или Clover — и блокирует и бросок круга, и бонус Luck Shield.",
            ].join("\n\n"),
            keywords: ["luck", "critical", "удача"],
            rule: "rule-morale",
        },
        {
            name: "Stack power",
            nameRu: "Сила стека",
            summary: `A ${MIN_UNIT_STACK_POWER}–${MAX_UNIT_STACK_POWER} rating of a stack's share of the strongest stack on the board; it scales stack-powered abilities and auras and gates some spells.`,
            summaryRu: `Оценка ${MIN_UNIT_STACK_POWER}–${MAX_UNIT_STACK_POWER}: доля стека от сильнейшего стека на поле; масштабирует способности и ауры, зависящие от силы стека, и открывает часть заклинаний.`,
            text: [
                `Stack power compares a stack's experience × living creatures with the largest such value on the board, either army: up to 20% gives 1, up to 40% gives 2, up to 60% gives 3, up to 80% gives 4, above that ${MAX_UNIT_STACK_POWER}. It is recalculated after every action, so losses — or a much bigger stack appearing — lower it.`,
                "It scales the stack-powered parts of abilities (trigger chances and strengths — see Ability scaling), aura strength, Limited Supply ammo, Heavy Armor and Chakram's target count, and gates spells and cast abilities that need a minimum caster stack power (3, 4 or 5; Craft needs 4, Meteorite and Meteor Shower need 5). Damage spells themselves scale with creatures alive, not with stack power.",
                "Every drafted creature arrives as a stack worth 1,000–1,136 experience (its creature count is rounded up), so an unsplit stack normally starts the fight at stack power 5. Life's Supply synergy at level 3 can grow a stack past 1,250 (8 Monks → 9), and then the exactly-1,000 stacks on the board (Peasants, Angels, a Black Dragon) start at 4. Split a stack in half and both halves drop to 3 — 2 next to such a Supply stack — so a Stun that procs 35% at full stack procs 21%; a stack that has lost 60% of its creatures is down to 2. A split trades ability strength for board presence.",
            ].join("\n\n"),
            textRu: [
                `Сила стека сравнивает опыт × живые существа стека с наибольшим таким значением на поле среди обеих армий: до 20% — 1, до 40% — 2, до 60% — 3, до 80% — 4, выше — ${MAX_UNIT_STACK_POWER}. Она пересчитывается после каждого действия, поэтому потери — или появление гораздо большего стека — её снижают.`,
                "Она масштабирует зависящие от силы стека части способностей (шансы и силу — см. «Масштаб способностей»), силу аур, боезапас Limited Supply, Heavy Armor и число целей Chakram, а также открывает заклинания и активные способности с минимальной силой стека заклинателя (3, 4 или 5; Craft требует 4, Meteorite и Meteor Shower — 5). Сам урон заклинаний растёт с числом живых существ, а не с силой стека.",
                "Каждое задрафтованное существо приходит стеком на 1000–1136 опыта (число существ округляется вверх), поэтому неразделённый стек обычно начинает бой с силой 5. Синергия Жизни «Запас» 3 уровня может вырастить стек больше 1250 (8 Monk → 9), и тогда стеки ровно на 1000 опыта (Peasant, Angel, Black Dragon) начинают с 4. Разделите стек пополам — и обе половины опустятся до силы 3 (до 2 рядом с таким стеком «Запаса»), так что Stun, срабатывающий на 35% при полной силе, сработает на 21%; стек, потерявший 60% существ, опускается до 2. Разделение меняет силу способностей на присутствие на поле.",
            ].join("\n\n"),
            keywords: ["stack power", "stack", "сила стека"],
            rule: "rule-morale",
        },
        {
            name: "Ability scaling",
            nameRu: "Масштаб способностей",
            aliases: ["how abilities scale", "ability chance", "как считаются способности", "шанс способности"],
            summary:
                "How stack power, luck and the Might ability synergy turn an ability's card value into the chance or strength a stack actually gets.",
            summaryRu:
                "Как сила стека, удача и синергия Силы превращают число на карточке способности в реальный шанс или силу стека.",
            text: [
                "Ability cards print the full-stack value (stack power 5, luck 0). A stack at stack power SP gets:",
                bullet([
                    "Trigger chances (Stun, Blindness, Dodge, Aggr, Hamstring, Terrifying Gaze, Spit Ball, Predatory Assimilation, Magic Reflection…): card value ÷ 5 × SP, plus 1 percentage point per point of luck, plus the Might ability synergy (+5/+8/+12; not for Magic Reflection). Paralysis rolls twice that; Petrifying Gaze uses the same number for its extra kills and about a quarter of it for the petrify roll.",
                    "Stack-powered percentages (Double Punch and Double Shot's second hits, Piercing Spear, Magic Shield, Fire Breath, Heavy Armor…): (card value + luck + synergy) ÷ 100 × SP ÷ 5 — the luck and synergy points shrink with the stack too.",
                    "\"+X% more\" bonuses (Backstab, Rapid Charge, Lucky Strike's bonus, Sharpened Weapons, War Anger; Penetrating Bite takes that percentage of one target creature's health): card value ÷ 5 × SP percent, plus luck and synergy at full value.",
                    "Count abilities (Sky Runner steps, Miner armor, Shatter Armor): card value ÷ 5 × SP, plus a tenth of luck and synergy. Deep Wounds adds luck and synergy at full value.",
                    "Abilities that aren't stack-powered (Area Throw, Through Shot, Double Throw, Sylvan Focus, auras with flat numbers) deliver their full value from any stack size, shifted by luck where the card says so.",
                ]),
                "Made of Fire adds 10% of an ability's own power on top (1% for count abilities). Break turns every ability of the unit off for 2 laps.",
            ].join("\n\n"),
            textRu: [
                "Карточки способностей показывают значение при полной силе стека (5) и нулевой удаче. Стек с силой SP получает:",
                bullet([
                    "Шансы срабатывания (Stun, Blindness, Dodge, Aggr, Hamstring, Terrifying Gaze, Spit Ball, Predatory Assimilation, Magic Reflection…): значение ÷ 5 × SP плюс 1 процентный пункт за очко удачи плюс синергия Силы «Сила способностей» (+5/+8/+12; кроме Magic Reflection). Paralysis бросает удвоенный шанс; Petrifying Gaze берёт то же число для дополнительных убийств и около четверти его — для броска окаменения.",
                    "Проценты, зависящие от силы стека (второй удар Double Punch и Double Shot, Piercing Spear, Magic Shield, Fire Breath, Heavy Armor…): (значение + удача + синергия) ÷ 100 × SP ÷ 5 — очки удачи и синергии уменьшаются вместе со стеком.",
                    "Бонусы «+X% урона» (Backstab, Rapid Charge, бонус Lucky Strike, Sharpened Weapons, War Anger; Penetrating Bite берёт этот процент от здоровья одного существа цели): значение ÷ 5 × SP процентов плюс удача и синергия целиком.",
                    "Способности-счётчики (шаги Sky Runner, броня Miner, Shatter Armor): значение ÷ 5 × SP плюс десятая часть удачи и синергии. Deep Wounds добавляет удачу и синергию целиком.",
                    "Способности, не зависящие от силы стека (Area Throw, Through Shot, Double Throw, Sylvan Focus, ауры с фиксированными числами), дают полное значение при любом размере стека, со сдвигом от удачи, где это указано.",
                ]),
                "Made of Fire добавляет сверху 10% собственной силы способности (1% у способностей-счётчиков). Break отключает все способности юнита на 2 круга.",
            ].join("\n\n"),
            keywords: ["ability", "scaling", "chance", "stack power", "luck", "способность", "шанс", "масштаб"],
            rule: "rule-morale",
        },
        {
            name: "Turn order",
            nameRu: "Порядок ходов",
            aliases: ["who moves first", "initiative", "кто ходит первым", "инициатива"],
            summary:
                "Fixed at lap start: Morale stacks first, then the armies alternate one stack at a time by initiative, then Dismorale stacks, then Hourglass waiters.",
            summaryRu:
                "Фиксируется в начале круга: сначала стеки с Morale, затем армии по очереди по одному стеку по инициативе, затем стеки с Dismorale, затем ожидающие через Hourglass.",
            text: [
                "At the start of each lap — after Armageddon, narrowing and the morale rolls — the whole order is fixed:",
                bullet([
                    "Stacks that rolled Morale act first, highest initiative first.",
                    "Then the two armies alternate one stack at a time; each sends its highest-initiative stack that hasn't acted yet, and equal initiative is ordered at random. When one army has no stacks left to act, the other army's remaining stacks go back to back.",
                    "Then the stacks that rolled Dismorale.",
                    "Last, stacks that waited on the Hourglass, in the order they waited.",
                ]),
                "In the first lap the army with the higher average morale starts (then the one with the higher top initiative, then a coin flip) — unless a stack rolled Morale, in which case the alternation starts with the army opposite the last Morale stack; after that it simply continues from the previous lap. Initiative therefore orders stacks only within their own army — a Morale roll is the only way to act ahead of the alternation. Each turn is one action: move (arriving ends the turn), melee attack (walking in first if needed), shoot, cast, Hourglass, Luck Shield or skip.",
            ].join("\n\n"),
            textRu: [
                "В начале каждого круга — после Армагеддона, сужения и бросков морали — весь порядок фиксируется:",
                bullet([
                    "Сначала ходят стеки с сработавшей Morale, от большей инициативы к меньшей.",
                    "Затем армии ходят по очереди по одному стеку; каждая отправляет свой стек с наибольшей инициативой из ещё не ходивших, а при равной инициативе порядок случаен. Когда у одной армии не остаётся стеков, стеки другой ходят подряд.",
                    "Затем стеки с сработавшей Dismorale.",
                    "Последними — ожидающие через Hourglass, в том порядке, в каком они ждали.",
                ]),
                "В первом круге начинает армия с более высокой средней моралью (затем — с большей максимальной инициативой, затем — жребий), если только ни у кого не сработала Morale: тогда очерёдность начинается с армии, противоположной последнему стеку с Morale; дальше она просто продолжается с прошлого круга. Поэтому инициатива упорядочивает стеки только внутри своей армии — сработавшая Morale единственный способ походить раньше очереди. Каждый ход — одно действие: перемещение (прибытие завершает ход), ближняя атака (с подходом, если нужно), выстрел, заклинание, Hourglass, Luck Shield или пропуск.",
            ].join("\n\n"),
            keywords: ["turn order", "initiative", "queue", "first", "порядок ходов", "инициатива", "очередь"],
            rule: "rule-mechanics",
        },
        {
            name: "Retaliation",
            nameRu: "Ответный удар",
            aliases: ["response", "counterattack", "counter-shot", "ответ", "контратака"],
            summary:
                "A stack answers one attack per lap; the answer is computed before your blow lands, so even a stack you are about to destroy strikes back at full strength.",
            summaryRu:
                "Стек отвечает на одну атаку за круг; ответ считается до вашего удара, поэтому даже стек, который вы вот-вот уничтожите, отвечает в полную силу.",
            text: [
                "A stack answers an attack once per lap (One in the Field: every melee attack). The answer is spent even if it misses, and it resets every lap.",
                bullet([
                    "Timing: both hits are computed from the stacks as they stand, and the retaliation is applied first — you can't weaken a counterattack by hitting harder.",
                    "A melee blow goes unanswered when the defender is Stunned, Blinded or Frozen, has No Melee, is Aggr-locked onto another stack, is barred from this attacker by Terrifying Gaze, or is under Cowardice facing a stack with more total health. Shadow Touch and Lightning Spin attacks are never answered. Size doesn't matter.",
                    "A shooter retaliating in melee deals half damage unless it has Handyman.",
                    "A shot is answered only by a shooter that could shoot right now: arrows left, no enemy touching it, no Range Null Field or Rangebane. Through Shot units never answer. The counter-shot flies back along its line, hits the first enemy stack on it, has its own falloff and Smoke, and costs an arrow; splash from Area Throw, Large Caliber and Chakram lands before it.",
                    "Never answered: spells, Through Shot volleys, an Area Throw aimed at an empty cell.",
                ]),
                "What avoids a counterattack: no-response attackers, spells, splash, or hitting a defender that already answered this lap — which is why a cheap first hit can soak the answer before your main attacker goes in.",
            ].join("\n\n"),
            textRu: [
                "Стек отвечает на атаку один раз за круг (One in the Field — на каждую атаку в ближнем бою). Ответ тратится даже при промахе и восстанавливается каждый круг.",
                bullet([
                    "Время: оба удара считаются по стекам в текущем состоянии, и ответ наносится первым — ослабить контратаку более сильным ударом нельзя.",
                    "Удар в ближнем бою остаётся без ответа, если защитник оглушён, ослеплён или заморожен, у него No Melee, он привязан Aggr к другому стеку, Terrifying Gaze запрещает ему бить этого атакующего или он под Cowardice против стека с большим суммарным здоровьем. На атаки с Shadow Touch и Lightning Spin не отвечают никогда. Размер значения не имеет.",
                    "Стрелок, отвечающий в ближнем бою, наносит половину урона, если у него нет Handyman.",
                    "На выстрел отвечает только стрелок, который мог бы выстрелить прямо сейчас: есть стрелы, рядом нет врага, нет Range Null Field и Rangebane. Юниты с Through Shot не отвечают никогда. Ответный выстрел летит обратно по линии, попадает в первый вражеский стек на ней, имеет свой штраф дальности и Smoke и тратит стрелу; урон по площади от Area Throw, Large Caliber и Chakram наносится раньше него.",
                    "Без ответа всегда: заклинания, залпы Through Shot, Area Throw по пустой клетке.",
                ]),
                "Избежать контратаки помогают атакующие без ответа, заклинания, удары по площади или удар по защитнику, который уже ответил в этом круге, — поэтому дешёвый первый удар может забрать ответ до того, как пойдёт главный атакующий.",
            ].join("\n\n"),
            keywords: ["retaliation", "response", "counter", "answer", "ответ", "ответный удар", "контратака"],
            rule: "rule-mechanics",
        },
        {
            name: "Ranged attacks and range falloff",
            nameRu: "Дальние атаки и штраф дальности",
            aliases: ["range penalty", "shooting", "штраф за дальность", "стрельба"],
            summary:
                "Shooting needs arrows and no enemy touching the shooter; damage halves per band of shot distance (÷2, ÷4, at most ÷8), and Smoke doubles the divisor.",
            summaryRu:
                "Для выстрела нужны стрелы и ни одного врага вплотную; урон делится на 2 за каждую полосу дистанции (÷2, ÷4, максимум ÷8), а Smoke удваивает делитель.",
            text: bullet([
                "To shoot, a stack needs arrows, no enemy stack in any cell touching it (diagonals count), and no Range Null Field or Rangebane. Shots never move the shooter: moving ends the turn, so a shooter acts from where it stands.",
                "The arrow flies to a visible edge of the target. Your own stacks never block it, the first enemy stack on the line takes it, and structures (barrels, the mountain) stop it. Large Caliber and Area Throw fly over structures; Double Shot's two projectiles clear up to two barrels for one arrow.",
                "Falloff counts whole cells in king moves (diagonals count 1) from the shooter's body; one band is the unit's shot distance rounded down. Within 1 band: full damage; 2 bands: ÷2; 3 bands: ÷4; farther: ÷8.",
                "A shot that has crossed a Smoke cell has its divisor doubled (at most ÷8) for every target after it, Sniper shots included. The Sniper ability otherwise ignores distance entirely.",
                "The Sniper augment (+20/40/70% shot distance), Farsight Quiver (+50% of base distance) and Guiding Winds (up to +35%) widen the bands, which count whole cells (a bonus helps once it adds a full cell); none removes falloff. A shooter hitting in melee deals half damage unless it has Handyman.",
            ]),
            textRu: bullet([
                "Для выстрела стеку нужны стрелы, ни одного вражеского стека в соседних клетках (диагонали считаются) и отсутствие Range Null Field и Rangebane. Выстрел не двигает стрелка: перемещение завершает ход, поэтому стрелок действует с того места, где стоит.",
                "Стрела летит к видимому краю цели. Ваши стеки её не блокируют, первый вражеский стек на линии принимает её на себя, а постройки (бочки, гора) останавливают. Large Caliber и Area Throw летят поверх построек; два снаряда Double Shot сносят до двух бочек за одну стрелу.",
                "Штраф считается в целых клетках ходом короля (диагональ = 1) от тела стрелка; одна полоса — дистанция выстрела юнита, округлённая вниз. В пределах 1 полосы — полный урон; 2 полосы — ÷2; 3 полосы — ÷4; дальше — ÷8.",
                "У выстрела, прошедшего через клетку Smoke, делитель удваивается (максимум ÷8) для всех целей после неё, и у Sniper тоже. В остальном способность Sniper полностью игнорирует расстояние.",
                "Апгрейд «Стрельба» (+20/40/70% дистанции), Farsight Quiver (+50% от базовой дистанции) и Guiding Winds (до +35%) расширяют полосы, которые считаются целыми клетками (бонус помогает, когда добавляет полную клетку); штраф не отменяет ни один из них. Стрелок в ближнем бою наносит половину урона, если у него нет Handyman.",
            ]),
            keywords: ["ranged", "range", "falloff", "shot distance", "divisor", "smoke", "стрельба", "дальность", "штраф", "дым"],
            rule: "rule-mechanics",
        },
        {
            name: "Resistances",
            nameRu: "Сопротивления",
            aliases: ["magic resistance", "status resistance", "mind resistance", "сопротивление магии"],
            summary:
                "Magic resistance cuts magic damage and resists debuff spells; status resistance lowers Stun/Freeze/Paralysis and physical splash; mind resistance lowers Mind effects.",
            summaryRu:
                "Сопротивление магии снижает магический урон и отражает дебаффы заклинаний; сопротивление статусам снижает Stun/Freeze/Paralysis и физический урон по площади; ментальное — эффекты Разума.",
            text: bullet([
                "Magic resistance: magic damage is multiplied by (1 − resistance); a debuff spell — and the Spit Ball, Hamstring and Vine Throw debuffs — is resisted when a d100 roll lands under it (the scroll is spent either way). Creatures start with 0 / 5 / 8–12 / 15 by level; Armor augment points add to that base directly (15 + 21 = 36), and Magic Shield, Wardguard and the Warding Mane and Arcane Ward blessings then add as separate rolls: 1 − (1 − own)(1 − bonus). Armor never reduces magic damage.",
                "100% magic resistance (Enchanted Skin): immune to every spell from either side — buffs, heals and mass spells skip it — and to ability magic damage (Chain Lightning, Fire Breath, Fire Shield, Fireforged burns); Spit Ball, Hamstring and Vine Throw debuffs always fail on it. Not immune to on-hit status effects (Stun, Blindness, Paralysis, Petrifying Gaze…), auras, blessings, Craft or Resurrection.",
                "Status resistance (Amulet of Resolve, 25%): Stun, Freeze and Paralysis chances are multiplied by (1 − resistance), and so is physical area damage taken. Mechanism units count −50 here, so they take +50% from physical area attacks.",
                "Mind resistance (Helm of Focus, 35%): Blindness, Aggr, Boar Saliva, Terrifying Gaze and the petrify roll of Petrifying Gaze are multiplied by (1 − resistance). Madness and Mechanism units are fully immune to Mind abilities and spells.",
                "Elements: a unit is immune to its own element (Fire, Water, Earth, Wind) and can't be targeted by that element's spells; the opposed element (Fire↔Water, Earth↔Wind) deals it ×1.5.",
            ]),
            textRu: bullet([
                "Сопротивление магии: магический урон умножается на (1 − сопротивление); дебафф заклинания — а также дебаффы Spit Ball, Hamstring и Vine Throw — отражается, если бросок d100 меньше него (свиток тратится в любом случае). У существ оно изначально 0 / 5 / 8–12 / 15 по уровням; очки апгрейда «Броня» прибавляются к этой базе напрямую (15 + 21 = 36), а Magic Shield, Wardguard и благословения Warding Mane и Arcane Ward затем добавляются как отдельные броски: 1 − (1 − своё)(1 − бонус). Броня магический урон не снижает.",
                "100% сопротивления магии (Enchanted Skin): иммунитет ко всем заклинаниям обеих сторон — баффы, лечение и массовые заклинания его пропускают — и к магическому урону способностей (Chain Lightning, Fire Breath, Fire Shield, поджоги Fireforged); дебаффы Spit Ball, Hamstring и Vine Throw на него никогда не ложатся. Нет иммунитета к эффектам ударов (Stun, Blindness, Paralysis, Petrifying Gaze…), аурам, благословениям, Craft и Resurrection.",
                "Сопротивление статусам (Amulet of Resolve, 25%): шансы Stun, Freeze и Paralysis умножаются на (1 − сопротивление), как и получаемый физический урон по площади. У Mechanism здесь −50, поэтому они получают +50% от физических атак по площади.",
                "Сопротивление ментальным эффектам (Helm of Focus, 35%): Blindness, Aggr, Boar Saliva, Terrifying Gaze и бросок окаменения Petrifying Gaze умножаются на (1 − сопротивление). Юниты с Madness и Mechanism полностью неуязвимы к ментальным способностям и заклинаниям.",
                "Стихии: юнит неуязвим к своей стихии (Огонь, Вода, Земля, Ветер) и не может быть целью её заклинаний; противоположная стихия (Огонь↔Вода, Земля↔Ветер) наносит ему ×1.5.",
            ]),
            keywords: ["magic resist", "resistance", "status resist", "mind resist", "element", "сопротивление", "стихия", "иммунитет"],
            rule: "rule-unit-stats",
        },
        {
            name: "Spell damage",
            nameRu: "Урон заклинаний",
            aliases: ["how spells scale", "spell formula", "формула заклинаний"],
            summary:
                "A damage spell deals its power per creature alive in the casting stack, raised by magic-damage bonuses and morale, then cut by element and magic resistance; armor never counts.",
            summaryRu:
                "Заклинание урона наносит свою силу за каждое живое существо в стеке заклинателя, с бонусами к магическому урону и моралью, затем режется стихией и сопротивлением магии; броня не учитывается.",
            text: [
                "Lightning Strike, Ring of Fire, Meteor Shower, Fire Strike, Fireball and Meteorite: raw damage = floor(creatures alive in the casting stack × spell power × (1 + magic-damage bonus / 100) × morale factor). The bonus is one plain sum of the Empower augment (7/15/24), the Empower scroll (25), Sylvan Focus (15 + the Satyr's luck), Mage's Ring (10) and Archmage's Ring (20); the morale factor is 1.25 on Morale and 0.8 on Dismorale.",
                "Per victim: the element first (its own element deals 0 and can't be targeted; the opposed element ×1.5), then × (1 − magic resistance). Armor and luck never count, a Water Shield absorbs the hit, and spells never cause Break. Stack power only decides whether the spell can be cast.",
                "Heal (5 per Healer), Mass Heal (2.5 per Healer) and Resurrection (1.5 × the Angel stack's total health) follow the same per-creature rule; Heal and Resurrection also get the morale factor.",
            ].join("\n\n"),
            textRu: [
                "Lightning Strike, Ring of Fire, Meteor Shower, Fire Strike, Fireball и Meteorite: исходный урон = floor(живые существа в стеке заклинателя × сила заклинания × (1 + бонус к магическому урону / 100) × множитель морали). Бонус — одна простая сумма апгрейда «Магия» (7/15/24), свитка Empower (25), Sylvan Focus (15 + удача Satyr), Mage's Ring (10) и Archmage's Ring (20); множитель морали — 1.25 под Morale и 0.8 под Dismorale.",
                "Для каждой жертвы: сначала стихия (своя стихия — 0 урона и нельзя выбрать целью; противоположная — ×1.5), затем × (1 − сопротивление магии). Броня и удача не учитываются никогда, Water Shield поглощает удар, а заклинания никогда не накладывают Break. Сила стека лишь решает, можно ли применить заклинание.",
                "Heal (5 за Healer), Mass Heal (2.5 за Healer) и Resurrection (1.5 × суммарного здоровья стека Angel) следуют тому же правилу «за существо»; Heal и Resurrection получают и множитель морали.",
            ].join("\n\n"),
            keywords: ["spell damage", "spell", "magic damage", "empower", "урон заклинаний", "магический урон", "заклинание"],
            rule: "rule-mechanics",
        },
        {
            name: "Effect durations",
            nameRu: "Длительность эффектов",
            aliases: ["how long effects last", "laps", "сколько длится эффект"],
            summary:
                "An N-lap effect covers the holder's next N turns; it counts down when the holder ends a turn, and 15 laps means the whole fight.",
            summaryRu:
                "Эффект на N кругов покрывает следующие N ходов владельца; он убывает, когда владелец заканчивает ход, а 15 кругов — это весь бой.",
            text: [
                DURATION_NOTE.en,
                "Board effects count lap changes instead: Smoke lasts 3 full laps, and Fire Wall and vines disappear at the third lap change after they were cast. Permanent changes (runes, Craft's second attack and frozen weapons, Crusade, Miner, Dulling Defense, Bitter Experience) never expire.",
            ].join("\n\n"),
            textRu: [
                DURATION_NOTE.ru,
                "Эффекты на поле считают смены кругов: Smoke держится 3 полных круга, а Fire Wall и лоза исчезают на третьей смене круга после применения. Постоянные изменения (руны, вторая атака и замороженное оружие от Craft, Crusade, Miner, Dulling Defense, Bitter Experience) не истекают никогда.",
            ].join("\n\n"),
            keywords: ["duration", "laps", "effect", "buff", "debuff", "длительность", "круги", "эффект"],
            rule: "rule-mechanics",
        },
        {
            name: "Glossary",
            nameRu: "Словарь терминов",
            aliases: ["what is a stack", "what is a lap", "terms", "термины", "что такое стек", "что такое круг"],
            summary: "Stack, creature, lap, turn, stack power, footprint, retaliation — what the game's basic words mean.",
            summaryRu: "Стек, существо, круг, ход, сила стека, размер на поле, ответ — что значат основные слова игры.",
            text: [
                "The words the rules and cards use, in the engine's sense.",
                "#### Stack\nA group of identical creatures that acts as one unit: one turn, one attack, one retaliation per lap. Damage first takes the front creature's remaining health, then kills whole creatures; attack damage grows with the creatures alive. When none are left, the stack is destroyed. Every drafted creature arrives as one stack worth 1,000 experience (200 Peasants, 2 Angels…); during placement a stack can be split into several without creating creatures.",
                "#### Creature\nOne member of a stack. A unit card's health, damage and armor are one creature's; the whole stack's health is creatures × health.",
                "#### Lap and turn\nA lap is one round in which every stack gets exactly one turn, in the order fixed at its start (Morale stacks, then the armies alternating, then Dismorale stacks, then Hourglass waiters). A turn is one stack's single action: move, melee attack, shoot, cast, wait, defend or skip. Effect durations count laps as the holder's own turns.",
                "#### Stack power\nA 1–5 rating of a stack's experience × creatures alive against the strongest stack on the board; it scales abilities and auras and gates some spells. An unsplit drafted stack usually starts at 5.",
                "#### Footprint\nThe cells a stack occupies: 1×1, 2×1 or 2×2. Bigger bodies need more room to move, to be placed and to escape narrowing.",
                "#### Retaliation\nThe answer a stack gives to an attack — once per lap, computed before the attacker's blow lands.",
            ].join("\n\n"),
            textRu: [
                "Слова, которыми пользуются правила и карточки, в том смысле, в каком их понимает движок.",
                "#### Стек\nГруппа одинаковых существ, действующая как один юнит: один ход, одна атака, один ответ за круг. Урон сначала снимает оставшееся здоровье переднего существа, затем убивает существ целиком; урон атаки растёт с числом живых существ. Когда существ не осталось, стек уничтожен. Каждое задрафтованное существо приходит одним стеком на 1000 опыта (200 Peasant, 2 Angel…); при расстановке стек можно разделить на несколько, новых существ при этом не появляется.",
                "#### Существо\nОдин член стека. Здоровье, урон и броня на карточке юнита — это значения одного существа; здоровье всего стека — существа × здоровье.",
                "#### Круг и ход\nКруг — это раунд, в котором каждый стек получает ровно один ход в порядке, зафиксированном в его начале (стеки с Morale, затем армии по очереди, затем стеки с Dismorale, затем ожидающие через Hourglass). Ход — одно действие одного стека: перемещение, ближняя атака, выстрел, заклинание, ожидание, защита или пропуск. Длительность эффектов считается кругами в ходах самого владельца.",
                "#### Сила стека\nОценка 1–5: опыт × живые существа стека относительно сильнейшего стека на поле; масштабирует способности и ауры и открывает часть заклинаний. Неразделённый задрафтованный стек обычно начинает с 5.",
                "#### Размер на поле\nКлетки, которые занимает стек: 1×1, 2×1 или 2×2. Крупным телам нужно больше места, чтобы двигаться, встать при расстановке и уйти от сужения.",
                "#### Ответ\nОтветный удар стека на атаку — один раз за круг, рассчитывается до того, как удар атакующего нанесён.",
            ].join("\n\n"),
            keywords: ["glossary", "terms", "stack", "creature", "lap", "turn", "footprint", "словарь", "термины", "стек", "существо", "круг", "ход"],
            rule: "rule-victory",
        },
        {
            name: "Counters and interactions",
            nameRu: "Контры и взаимодействия",
            aliases: ["how to counter", "what beats", "counter", "как контрить", "чем контрить", "против чего"],
            summary:
                "What the engine gives you against shooters, spells, splash, crowd control, flyers, rushes and ability-heavy stacks — each answer is a mechanic described in its own entry.",
            summaryRu:
                "Что движок даёт против стрелков, заклинаний, ударов по площади, контроля, летающих, рывков и стеков, живущих способностями, — каждый ответ описан в своей записи.",
            text: [
                "Every answer below is a mechanic described in its own entry, checked against the engine.",
                "#### Shooters\nPut any unit next to them — an enemy in a touching cell stops them shooting. Range Null Field Aura (Griffin) stops enemy shooters within 2 cells from shooting or returning fire; Smoke halves every shot that crosses it, Sniper shots included; Arrows Wingshield Blessing (Angel) gives your army +25% armor against shots at full stack (a little more with luck); Dense Flesh (Abomination) makes most shots at it cost 2 arrows; Rangebane from Spit Ball silences a shooter for a lap.",
                "#### Spells and magic damage\nMagic resistance multiplies magic damage by (1 − resistance) and resists debuff spells — Armor augment points, Magic Shield, Wardguard, Warding Mane and Arcane Ward blessings all add to it. Enchanted Skin (Black Dragon) is immune to every spell; elements are immune to their own element; Magic Mirror and Magic Reflection send a share back; a Water Shield soaks one hit; Break (Chaos's Break on Attack) stops a Broken unit casting.",
                "#### Physical splash and piercing\nArea Throw and Large Caliber punish 3×3 clumps, Through Shot and Skewer Strike lines, Lightning Spin whatever touches the Hydra; a Chakram only bounces across one or two empty cells, so a tight formation starves it. Amulet of Resolve takes 25% off all of them; Area Throw or Large Caliber landing on an Angel with Arrows Wingshield Blessing hits the Angel alone, a Through Shot stops at it, and a Chakram can't bounce onto it; Mechanism units take +50%, so keep a Tsar Cannon out of the splash.",
                "#### Status and Mind effects\nStun, Freeze and Paralysis: Amulet of Resolve lowers their chance by 25%; Absolving Arrow (Monk) can lift them from allies its arrows fly past. Mind abilities (Blindness, Aggr, Boar Saliva, the gazes): Helm of Focus lowers them by 35%. Madness and Mechanism units are immune to them and to the Mind spells (Courage, Sadness, Misfortune, Rangebane, Cowardice), which otherwise only magic resistance resists.",
                "#### Debuff spells\nMagic resistance resists them, a Peasant's Absorb Penalties Aura can take them onto itself, Absolving Arrow lifts them, Magic Mirror may copy them back onto the caster (40%, Mass Magic Mirror 32%).",
                "#### Retaliation\nA stack answers once per lap, so a cheap first hit soaks the answer before your main attacker goes in (not against One in the Field); Shadow Touch and Lightning Spin attackers are never answered; a Stunned, Blinded or Frozen defender can't answer; spells are never answered.",
                "#### Flyers\nWeb Aura (Arachna Queen) stops enemy flyers that start their turn within 2 cells from moving; Hamstring (Dryad) takes 30% of a flyer's movement; Wind Flow (Valkyrie) takes 4 movement from every flyer on the board, both sides, while giving each of them +4 armor (flyers with 100% magic resistance are skipped).",
                "#### Fast melee rushes\nVine Throw (Trent) snares and makes vined cells cost an extra step; Quagmire from Rime Charm or Spit Ball takes 25% of movement; Whirlpool chains one stack for a turn; Paralysis stops movement.",
                "#### Ability-heavy stacks\nLosses lower their stack power — a share of the strongest stack on the board — and their abilities with it; Break turns all of a unit's abilities off for 2 laps; Predatory Assimilation (Arachna Queen) steals one for good.",
                "#### Waiting and stalling\nTime Denial (Nightmare) stops both armies waiting on the Hourglass; a fight where nobody closes in narrows early, and Armageddon ends every fight by lap 15.",
            ].join("\n\n"),
            textRu: [
                "Каждый ответ ниже — механика, описанная в своей записи и сверенная с движком.",
                "#### Стрелки\nПоставьте рядом с ними любого юнита — враг в соседней клетке не даёт стрелять. Range Null Field Aura (Griffin) не даёт вражеским стрелкам в радиусе 2 клеток ни стрелять, ни отвечать выстрелом; Smoke вдвое ослабляет каждый выстрел сквозь него, даже у Sniper; Arrows Wingshield Blessing (Angel) даёт вашей армии +25% брони от выстрелов при полной силе стека (с удачей чуть больше); Dense Flesh (Abomination) заставляет тратить на большинство выстрелов по ней 2 стрелы; Rangebane от Spit Ball лишает стрелка выстрелов на круг.",
                "#### Заклинания и магический урон\nСопротивление магии умножает магический урон на (1 − сопротивление) и отражает дебаффы заклинаний — его повышают очки апгрейда «Броня», Magic Shield, Wardguard, благословения Warding Mane и Arcane Ward. Enchanted Skin (Black Dragon) неуязвим ко всем заклинаниям; стихии неуязвимы к своей стихии; Magic Mirror и Magic Reflection возвращают часть урона; Water Shield поглощает один удар; Break (синергия Хаоса «Разлом при атаке») не даёт юниту колдовать.",
                "#### Физические удары по площади и насквозь\nArea Throw и Large Caliber наказывают кучу 3×3, Through Shot и Skewer Strike — линию, Lightning Spin — всех, кто стоит вплотную к Hydra; Chakram отскакивает только через одну-две пустые клетки, поэтому плотный строй его обесточивает. Amulet of Resolve снимает 25% со всех них; Area Throw или Large Caliber, попавшие в Angel с Arrows Wingshield Blessing, бьют только его, Through Shot на нём останавливается, а Chakram не может на него отскочить; Mechanism получает +50%, поэтому держите Tsar Cannon подальше от таких ударов.",
                "#### Эффекты Статуса и Разума\nStun, Freeze и Paralysis: Amulet of Resolve снижает их шанс на 25%; Absolving Arrow (Monk) может снять их с союзников, мимо которых летят его стрелы. Ментальные способности (Blindness, Aggr, Boar Saliva, взгляды): Helm of Focus снижает их на 35%. У Madness и Mechanism иммунитет к ним и к ментальным заклинаниям (Courage, Sadness, Misfortune, Rangebane, Cowardice), которым иначе противостоит только сопротивление магии.",
                "#### Дебаффы заклинаний\nСопротивление магии их отражает, Absorb Penalties Aura у Peasant может забрать их себе, Absolving Arrow снимает, Magic Mirror может скопировать их обратно на заклинателя (40%, Mass Magic Mirror — 32%).",
                "#### Ответные удары\nСтек отвечает раз за круг, поэтому дешёвый первый удар забирает ответ до того, как пойдёт главный атакующий, — но не против One in the Field; на атаки с Shadow Touch и Lightning Spin не отвечают; оглушённый, ослеплённый или замороженный защитник ответить не может; на заклинания не отвечают никогда.",
                "#### Летающие\nWeb Aura (Arachna Queen) не даёт вражеским летающим, начавшим ход в радиусе 2 клеток, двигаться; Hamstring (Dryad) отнимает у летающего 30% движения; Wind Flow (Valkyrie) отнимает 4 движения у всех летающих на поле, у обеих сторон, но даёт каждому из них +4 к броне (летающие со 100% сопротивления магии пропускаются).",
                "#### Быстрые рывки ближнего боя\nVine Throw (Trent) опутывает и делает клетки с лозой дороже на шаг; Quagmire от Rime Charm или Spit Ball отнимает 25% движения; Whirlpool приковывает один стек на ход; Paralysis останавливает движение.",
                "#### Стеки, живущие способностями\nПотери снижают их силу стека — долю от сильнейшего стека на поле, — а с ней и способности; Break отключает все способности юнита на 2 круга; Predatory Assimilation (Arachna Queen) крадёт одну навсегда.",
                "#### Ожидание и затягивание\nTime Denial (Nightmare) запрещает обеим армиям ждать через Hourglass; бой, где никто не сближается, сужается раньше, а Армагеддон заканчивает любой бой к 15-му кругу.",
            ].join("\n\n"),
            keywords: [
                ...["counter", "counters", "beat", "against", "weakness", "protect", "protection", "stop", "slow"],
                ...["shooters", "archers", "spells", "splash", "flyers", "rush"],
                ...["контра", "контрить", "против", "слабость", "защита", "защитить", "защититься", "остановить"],
                ...["стрелки", "заклинания", "летающие", "по площади"],
            ],
            rule: "rule-mechanics",
        },
        {
            name: "Waiting and defending",
            nameRu: "Ожидание и защита",
            aliases: ["Hourglass", "Luck Shield", "wait", "defend", "ждать", "защита"],
            summary:
                "Hourglass: act again at the very end of the lap for −3 morale, once per lap. Luck Shield: luck +3 for the lap, −2 morale, ends the turn.",
            summaryRu:
                "Hourglass: походить снова в самом конце круга за −3 морали, раз за круг. Luck Shield: удача +3 на круг, −2 морали, ход заканчивается.",
            text: bullet([
                `Hourglass (wait): the stack gives up its place and acts again at the very end of the lap, after the Dismorale stacks; several waiters keep their order. It costs ${MORALE_CHANGE_FOR_CLOCK} morale, works once per lap, isn't available to your last stack still to act, and nobody on either side can wait while a stack with Time Denial is alive. Time spent before waiting isn't charged to your turn clock.`,
                `Luck Shield (defend): replaces this lap's luck roll with +${LUCK_CHANGE_FOR_SHIELD} (never above +10), costs ${MORALE_CHANGE_FOR_SHIELD} morale and ends the turn. Misfortune blocks the bonus.`,
                `Skip: ending the turn without acting — or losing it to a timeout passed as a skip — costs ${MORALE_CHANGE_FOR_SKIP} morale; ending after a move or another action costs nothing.`,
            ]),
            textRu: bullet([
                `Hourglass (ожидание): стек уступает своё место и ходит снова в самом конце круга, после стеков с Dismorale; несколько ожидающих сохраняют порядок. Стоит ${MORALE_CHANGE_FOR_CLOCK} морали, доступно раз за круг, недоступно вашему последнему ещё не ходившему стеку, и никто из обеих армий не может ждать, пока жив стек с Time Denial. Время, потраченное до ожидания, не списывается с вашего таймера.`,
                `Luck Shield (защита): заменяет бросок удачи этого круга на +${LUCK_CHANGE_FOR_SHIELD} (не выше +10), стоит ${MORALE_CHANGE_FOR_SHIELD} морали и завершает ход. Misfortune блокирует бонус.`,
                `Пропуск: завершить ход без действия — или потерять его из-за таймаута, переданного как пропуск, — стоит ${MORALE_CHANGE_FOR_SKIP} морали; завершение после перемещения или другого действия ничего не стоит.`,
            ]),
            keywords: ["hourglass", "wait", "luck shield", "defend", "skip", "ожидание", "защита", "пропуск"],
            rule: "rule-mechanics",
        },
        {
            name: "Map narrowing and Armageddon",
            nameRu: "Сужение карты и Армагеддон",
            summary: `Rings of holes close in at laps ${normalRings.join(", ")} (${barrelRings.join(" and ")} on Barrels), sooner if nobody engages; Armageddon waves at laps ${NUMBER_OF_LAPS_FIRST_ARMAGEDDON}–${lastWave} end every fight by lap ${lastWave}.`,
            summaryRu: `Кольца провалов сжимают поле на ${normalRings.join(", ")}-м кругах (на Barrels — на ${barrelRings.join(" и ")}-м), раньше, если никто не сближается; волны Армагеддона на ${NUMBER_OF_LAPS_FIRST_ARMAGEDDON}–${lastWave}-м кругах заканчивают любой бой к ${lastWave}-му кругу.`,
            text: bullet([
                `On schedule, the outer ring of cells turns into holes at the start of laps ${normalRings.join(", ")} on Normal and FIRE PIT, and ${barrelRings.join(" and ")} on Barrels; nothing narrows after lap ${NUMBER_OF_LAPS_TILL_STOP_NARROWING}, and there are never more than ${MAX_HOLE_LAYERS} rings.`,
                "If no stack of either army ends a lap closer to its nearest enemy, the next ring comes one lap early; if no damage was dealt that lap either, one extra ring is added for the rest of the fight (not on a scheduled narrowing lap). Each such lap also turns morale into movement (+0.05 steps per point).",
                "A stack on a vanishing cell is pushed inward, sliding to the nearest free spot; with no room it is destroyed (no self-resurrection). FIRE PIT's lava dries into normal ground at the start of lap 10 (earlier after extra rings).",
                `Armageddon hits every stack of both armies at the start of laps ${NUMBER_OF_LAPS_FIRST_ARMAGEDDON}–${lastWave}, ignoring armor, luck and magic resistance (a Water Shield absorbs one wave). Counting every creature the stack started with, alive or dead: wave 1 deals 25% of their health (at least ${MIN_ARMAGEDDON_DAMAGE_FIRST_WAVE}), waves 2, 3 and 4 deal 50%, 75% and 100%, rounded up to whole creatures.`,
                `The first three waves add up to 150%, so a stack that faces them all dies to wave 3 unless Resurrection returned creatures (a Water Shield alone can't save it: it only ever takes wave 1, and waves 2 and 3 together are 125%); wave 4 destroys everything left, so a fight still running at lap ${lastWave} is a draw. Armies that lose their last stacks to the same wave draw; a stack down to half its starting creatures already dies to wave 2.`,
            ]),
            textRu: bullet([
                `По расписанию внешнее кольцо клеток превращается в провалы в начале ${normalRings.join(", ")}-го кругов на Normal и FIRE PIT и ${barrelRings.join(" и ")}-го на Barrels; после ${NUMBER_OF_LAPS_TILL_STOP_NARROWING}-го круга сужения нет, и колец не бывает больше ${MAX_HOLE_LAYERS}.`,
                "Если ни один стек обеих армий не закончил круг ближе к ближайшему врагу, следующее кольцо приходит на круг раньше; если за этот круг не было и урона, добавляется ещё одно кольцо до конца боя (не на круге планового сужения). Каждый такой круг ещё и превращает мораль в движение (+0.05 шага за очко).",
                "Стек на исчезающей клетке выталкивается внутрь, сдвигаясь к ближайшему свободному месту; без места он уничтожается (без самовоскрешения). Лава FIRE PIT высыхает в обычную землю в начале 10-го круга (раньше при лишних кольцах).",
                `Армагеддон бьёт по каждому стеку обеих армий в начале ${NUMBER_OF_LAPS_FIRST_ARMAGEDDON}–${lastWave}-го кругов без учёта брони, удачи и сопротивления магии (Water Shield поглощает одну волну). Если считать всех существ, с которыми стек начинал, живых и погибших: первая волна наносит 25% их здоровья (не меньше ${MIN_ARMAGEDDON_DAMAGE_FIRST_WAVE}), вторая, третья и четвёртая — 50%, 75% и 100%, с округлением вверх до целых существ.`,
                `Первые три волны вместе — это 150%, поэтому стек, встретивший их все, гибнет от третьей, если Resurrection не вернул существ (один Water Shield его не спасёт: он принимает только первую волну, а вторая и третья вместе — уже 125%); четвёртая уничтожает всех оставшихся, так что бой, доживший до ${lastWave}-го круга, — ничья. Армии, потерявшие последние стеки от одной волны, играют вничью; стек, у которого осталась половина начальных существ или меньше, гибнет уже от второй волны.`,
            ]),
            // "How long does a match last?" — narrowing and Armageddon are what end a match that nobody ends,
            // and nobody asks for it by its name.
            aliases: ["match length", "how long a match lasts", "длительность матча", "сколько длится матч"],
            keywords: [
                "map",
                "narrowing",
                "armageddon",
                "laps",
                "holes",
                "match length",
                "duration",
                "long",
                "draw",
                "карта",
                "сужение",
                "армагеддон",
                "круги",
                "длительность",
                "длится",
                "конец матча",
                "ничья",
            ],
            rule: "rule-map",
        },
        {
            name: "Turn timer",
            nameRu: "Таймер хода",
            summary: `Up to ${maxTurn} seconds per turn from each army's ${minutes}-minute budget per lap, always leaving ${minTurn} seconds for every stack still to act.`,
            summaryRu: `До ${maxTurn} секунд на ход из ${minutes}-минутного бюджета армии на круг; каждому ещё не ходившему стеку всегда остаётся ${minTurn} секунд.`,
            text: bullet([
                `Each army has ${minutes} minutes per lap. A turn lasts min(${maxTurn} s, remaining budget ÷ stacks still to act), always leaving ${minTurn} s for each of them — with 8 stacks to act that is 30 s, with 4 or fewer ${maxTurn} s. Time spent before an Hourglass wait isn't charged.`,
                `Once per lap you may ask for additional time on your own turn: + min(${maxTurn} s, remaining budget ÷ stacks still to act).`,
                "In ranked, your first missed deadline of the fight plays Hourglass (or Luck Shield, or End Turn); later misses are played by the AI, and two misses in a row put your seat under AI control until you act again (once the ranked exit rules are enforced, an absent player's turns are only waited, defended or skipped — see Leaving a ranked match). If the AI can't act, the turn is skipped for 1 morale.",
            ]),
            textRu: bullet([
                `У каждой армии ${minutes} минуты на круг. Ход длится min(${maxTurn} с, остаток бюджета ÷ стеки, которые ещё не ходили), и каждому из них всегда остаётся ${minTurn} с — при 8 стеках это 30 с, при 4 и меньше — ${maxTurn} с. Время до ожидания через Hourglass не списывается.`,
                `Раз за круг в свой ход можно попросить дополнительное время: + min(${maxTurn} с, остаток бюджета ÷ стеки, которые ещё не ходили).`,
                "В рейтинге первый пропуск таймера за бой играет Hourglass (или Luck Shield, или конец хода); следующие пропуски играет ИИ, а два пропуска подряд передают ваши стеки ИИ, пока вы снова не сделаете ход (когда правила выхода из рейтинговых матчей вступят в силу, за отсутствующего игрока ходы только ждут, защищаются или пропускаются — см. «Выход из рейтингового матча»). Если ИИ не может действовать, ход пропускается за 1 мораль.",
            ]),
            keywords: ["timer", "time", "seconds", "timeout", "additional time", "таймер", "время", "таймаут"],
            rule: "rule-mechanics",
        },
        {
            name: "Army limits",
            nameRu: "Лимиты армии",
            summary: `Draft 2/2/1/1 units by level, each a 1,000-experience stack; 6–${MAX_UNITS_PER_TEAM} stacks by Placement tier (up to 12 with Nature), 5–${MAX_AUGMENT_POINTS} augment points, synergies at 2/4/6 units.`,
            summaryRu: `Драфт 2/2/1/1 юнитов по уровням, каждый — стек на 1000 опыта; 6–${MAX_UNITS_PER_TEAM} стеков по уровню «Расстановки» (до 12 с Природой), 5–${MAX_AUGMENT_POINTS} очков апгрейдов, синергии при 2/4/6 юнитах.`,
            text: bullet([
                "Each match you draft two level-1 units, two level-2, one level-3 and one level-4 unit from a pool of 56 (14 per faction: 4/4/3/3 by level).",
                "Every drafted creature arrives as one stack worth 1,000 experience: its creature count is 1,000 ÷ its experience value, rounded up (Peasant 200, Centaur 73, Beholder 22, Monk 8, Champion 3, Angel 2, Black Dragon 1). Life's Supply synergy adds its percentage when the fight starts.",
                `The stack cap is 6, raised to 7 or ${MAX_UNITS_PER_TEAM} by the Placement augment; Nature's Board Units synergy adds another 2/3/4, for an absolute cap of 12. Splitting a unit into more stacks doesn't create creatures.`,
                `Doctrines pay 5, 6 or ${MAX_AUGMENT_POINTS} augment points. Armor, Might, Empower and Sniper cost 1/2/3 points for levels 1/2/3, Movement 1/2, and Placement tiers 2 and 3 cost 1 and 2 (tier 1 is free).`,
                `Faction synergies reach level 1/2/3 at ${unitsForLevel(1)}/${unitsForLevel(2)}/${unitsForLevel(3)} distinct roster units of that faction (3 still give level 1); splitting a unit into several stacks does not raise the count, and the level is locked when the fight starts.`,
            ]),
            textRu: bullet([
                "За матч вы берёте два юнита 1-го уровня, два — 2-го, один — 3-го и один — 4-го из пула в 56 существ (по 14 на фракцию: 4/4/3/3 по уровням).",
                "Каждое задрафтованное существо приходит одним стеком на 1000 опыта: число существ — 1000 ÷ опыт одного существа с округлением вверх (Peasant 200, Centaur 73, Beholder 22, Monk 8, Champion 3, Angel 2, Black Dragon 1). Синергия Жизни «Запас» добавляет свой процент в начале боя.",
                `Лимит стеков — 6; апгрейд «Расстановка» поднимает его до 7 или ${MAX_UNITS_PER_TEAM}; синергия Природы «Отряды на поле» добавляет ещё 2/3/4, абсолютный максимум — 12. Разделение юнита на стеки новых существ не создаёт.`,
                `Доктрины дают 5, 6 или ${MAX_AUGMENT_POINTS} очков апгрейдов. «Броня», «Сила», «Магия» и «Стрельба» стоят 1/2/3 очка за уровни 1/2/3, «Движение» — 1/2, а уровни 2 и 3 «Расстановки» — 1 и 2 (уровень 1 бесплатный).`,
                `Синергии фракций достигают уровня 1/2/3 при ${unitsForLevel(1)}/${unitsForLevel(2)}/${unitsForLevel(3)} разных юнитах фракции (3 — всё ещё уровень 1); разделение юнита на несколько стеков счёт не увеличивает, а уровень фиксируется в начале боя.`,
            ]),
            keywords: ["draft", "limits", "roster", "cap", "points", "stack size", "драфт", "лимит", "состав", "размер стека"],
            rule: "rule-draft",
        },
    ];
}

interface RuleSectionCopy {
    title: string;
    body?: readonly string[];
    items?: readonly string[];
}

const fillRuleTokens = (text: string, language: Language): string =>
    splitRuleTokens(text)
        .map((segment) =>
            "token" in segment ? ruleTokenValue(segment.token, DEFAULT_RANKED_EXIT_RULES, language) : segment.text,
        )
        .join("");

function sectionMarkdown(section: RuleSectionCopy, language: Language): string {
    const body = (section.body ?? []).map((paragraph) => fillRuleTokens(paragraph, language));
    const items = (section.items ?? []).map((item) => fillRuleTokens(item, language));
    return [...body, ...(items.length ? [bullet(items)] : [])].join("\n\n");
}

const ruleKeywords: Record<string, string[]> = {
    "rule-loop": ["phases", "start", "match flow", "how to play", "фазы", "начало", "как играть"],
    "rule-victory": ["win", "victory", "objective", "draw", "победа", "цель", "ничья"],
    "rule-draft": ["pick", "ban", "picks", "tiers", "bundles", "выбор", "пики", "бан", "уровни"],
    "rule-unit-stats": ["stats", "card", "health", "initiative", "параметры", "карточка", "здоровье", "инициатива"],
    "rule-augments": ["upgrades", "points", "усиления", "улучшения", "очки"],
    "rule-doctrines": ["scout", "spymaster", "battle trance", "reveal", "разведка"],
    "rule-synergies": ["factions", "bonuses", "percentages", "фракции", "бонусы"],
    "rule-placement": ["positioning", "board", "deployment", "footprint", "позиционирование", "поле"],
    "rule-mechanics": [
        "actions",
        "attack",
        "response",
        "resistance",
        "hourglass",
        "spells",
        "действия",
        "ответ",
        "сопротивление",
    ],
    "rule-morale": ["tempo", "luck", "morale", "stack power", "темп", "удача", "мораль"],
    "rule-map": ["lap", "shrinking", "narrowing", "armageddon", "lava", "obstacles", "круг", "сужение", "лава"],
};

/** Every entity name that can be linked from prose, longest first so multi-word names win. */
function buildNameIndex(nodes: Iterable<KnowledgeNode>): { pattern: RegExp; byName: Map<string, string> } {
    const byName = new Map<string, string>();
    for (const node of nodes) {
        if (
            !["unit", "ability", "spell", "artifact", "effect", "augment", "doctrine", "synergy", "faction"].includes(
                node.type,
            )
        )
            continue;
        const names = [node.name, ...(node.aliases ?? [])].filter((name) => name.length >= 4 && /^[A-Z]/.test(name));
        for (const name of names) if (!byName.has(name)) byName.set(name, node.id);
    }
    const escaped = [...byName.keys()]
        .sort((a, b) => b.length - a.length)
        .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${escaped.join("|")})(?![\\p{L}\\p{N}])`, "gu");
    return { pattern, byName };
}

export function buildKnowledgeGraph(options: BuildKnowledgeGraphOptions = {}): KnowledgeGraph {
    const graph = new GraphAssembler();
    const factions: FactionName[] = RU_FACTIONS;

    for (const faction of factions) {
        const units = allUnits.filter((unit) => unit.faction === faction && !unit.summonedOnly);
        const summoned = allUnits.filter((unit) => unit.faction === faction && unit.summonedOnly);
        const pair = synergySpecs.filter((spec) => spec.faction === faction);
        const factionRu = localizedFactionName("ru", faction);
        graph.add({
            id: nodeId("faction", faction),
            type: "faction",
            section: "units",
            name: faction,
            nameRu: factionRu,
            href: knowledgePath("en", { section: "units", faction }),
            hrefRu: knowledgePath("ru", { section: "units", faction }),
            summary: `${faction} faction: ${units.length} draftable units, starting morale ${signed(FACTION_MORALE[faction] ?? 0)} and luck ${signed(FACTION_LUCK[faction] ?? 0)}. Synergy pair: ${pair.map((spec) => spec.name).join(" or ")}.`,
            summaryRu: `Фракция ${factionRu}: ${units.length} юнитов для драфта, начальная мораль ${signed(FACTION_MORALE[faction] ?? 0)} и удача ${signed(FACTION_LUCK[faction] ?? 0)}. Пара синергий: ${pair.map((spec) => spec.nameRu).join(" или ")}.`,
            text: [
                `**${faction}** fields ${units.length} draftable units (levels 1–4)${summoned.length ? `, plus the summon-only ${joinNames(summoned.map((unit) => unit.name))}` : ""}. Drafting 2/4/6 distinct ${faction} units unlocks the faction synergy at level 1/2/3; which of the two synergies applies is fixed per match by the match id.`,
                `Every ${faction} creature starts the fight with ${signed(FACTION_MORALE[faction] ?? 0)} morale and ${signed(FACTION_LUCK[faction] ?? 0)} base luck; luck is re-rolled around that base every lap.`,
                `Units by level:\n${bullet(
                    [1, 2, 3, 4].map(
                        (level) =>
                            `Level ${level}: ${joinNames(units.filter((unit) => unit.level === level).map((unit) => unit.name))}`,
                    ),
                )}`,
                `Synergies: ${pair.map((spec) => spec.name).join(" / ")}.`,
            ].join("\n\n"),
            textRu: [
                `**${factionRu}** выставляет ${units.length} юнитов для драфта (уровни 1–4)${summoned.length ? ` и призываемых ${joinNames(summoned.map((unit) => ruLabel(unit.name)))}` : ""}. 2/4/6 разных юнитов фракции открывают синергию уровня 1/2/3; какая из двух синергий действует, определяется идентификатором матча.`,
                ...(GAME_FACTION_NAMES_RU[faction] ? [`В русском интерфейсе игры эта фракция называется «${GAME_FACTION_NAMES_RU[faction]}».`] : []),
                `Каждое существо фракции начинает бой с моралью ${signed(FACTION_MORALE[faction] ?? 0)} и базовой удачей ${signed(FACTION_LUCK[faction] ?? 0)}; удача каждый круг перебрасывается вокруг этой базы.`,
                `Юниты по уровням:\n${bullet(
                    [1, 2, 3, 4].map(
                        (level) =>
                            `Уровень ${level}: ${joinNames(units.filter((unit) => unit.level === level).map((unit) => unit.name))}`,
                    ),
                )}`,
                `Синергии: ${pair.map((spec) => spec.nameRu).join(" / ")}.`,
            ].join("\n\n"),
            tags: ["faction", faction],
            keywords: [factionRu, "faction", "фракция", ...(GAME_FACTION_NAMES_RU[faction] ? [GAME_FACTION_NAMES_RU[faction].toLowerCase()] : [])],
            props: { units: units.map((unit) => unit.name) },
        });
    }

    for (const unit of allUnits) {
        const { href, hrefRu } = hrefFor("units", unit.name);
        graph.add({
            id: nodeId("unit", unit.name),
            type: "unit",
            section: "units",
            name: unit.name,
            nameRu: ruName(unit.name),
            href,
            hrefRu,
            summary: unitSummary(unit, "en"),
            summaryRu: unitSummary(unit, "ru"),
            text: unitText(unit, "en"),
            textRu: unitText(unit, "ru"),
            tags: [
                "unit",
                unit.faction,
                `level ${unit.level}`,
                unit.attackType.toLowerCase(),
                unit.movementType.toLowerCase(),
                ...(unit.rangeShots > 0 ? ["ranged", "archer"] : []),
                ...(unit.movementType === "FLY" ? ["flying"] : []),
                ...(unit.spells.length ? ["caster"] : []),
                ...(unit.summonedOnly ? ["summon-only"] : []),
            ],
            keywords: [
                localizedFactionName("ru", unit.faction),
                "юнит",
                "creature",
                "существо",
                ...unit.abilities.map((ability) => ability.name),
                ...unit.spells.map((spell) => spell.replace(/^[^:]+:/, "")),
            ],
            props: {
                faction: unit.faction,
                level: unit.level,
                hp: unit.hp,
                attack: unit.attack,
                damageMin: unit.damageMin,
                damageMax: unit.damageMax,
                armor: unit.armor,
                initiative: unit.initiative,
                steps: unit.steps,
                size: unit.size,
                experience: unit.experience,
                attackType: unit.attackType,
                movementType: unit.movementType,
                rangeShots: unit.rangeShots,
                shotDistance: unit.shotDistance,
                magicResist: unit.magicResist,
                summonedOnly: unit.summonedOnly,
                // What a drafted stack of this creature starts with: its creatures and their pooled health.
                ...(unit.summonedOnly
                    ? {}
                    : { startingAmount: startingAmount(unit), stackHp: startingAmount(unit) * unit.hp }),
            },
        });
    }

    const rawAbilities = abilitiesJson as unknown as Record<string, RawAbilityEntry>;
    for (const ability of abilities) {
        const { href, hrefRu } = hrefFor("abilities", ability.name);
        graph.add({
            id: nodeId("ability", ability.name),
            type: "ability",
            section: "abilities",
            name: ability.name,
            nameRu: ruName(ability.name),
            href,
            hrefRu,
            // The whole card: its lines are soft wraps ("…the following spells:" / "Smoke, Misfortune…"), so
            // the first line alone can stop mid-sentence. Listings clip it to length.
            summary: oneLine(ability.description),
            summaryRu: oneLine(ability.descriptionRu),
            text: abilityText(ability, "en"),
            textRu: abilityText(ability, "ru"),
            tags: [
                "ability",
                ability.kind,
                ...(ability.type ? [ability.type.toLowerCase()] : []),
                ...(ability.isStackPowered ? ["stack-powered"] : []),
            ],
            keywords: ["способность", ...ability.units.map((unit) => unit.name)],
            props: {
                kind: ability.kind,
                type: ability.type,
                stackPowered: ability.isStackPowered,
                carriers: ability.units.map((unit) => unit.name),
                ...(ability.grantedBy ? { grantedBy: ability.grantedBy } : {}),
            },
        });
    }

    const rawEffects = effectsJson as unknown as Record<string, RawEffectEntry | number>;
    for (const [name, raw] of Object.entries(rawEffects)) {
        if (typeof raw !== "object") continue;
        // A zero power means the amount is set by whatever applies the effect (Poison ticks for a share of
        // the poisoner's damage), so "{}" must not print as 0.
        const description = (EFFECT_DESCRIPTION_OVERRIDES[name] ?? raw.desc).replace(
            /\{\}/g,
            raw.power > 0 ? String(raw.power) : "an amount set by whatever applied it",
        );
        const wholeFight = raw.laps >= 15;
        const russian = effectDescriptionsRu[name];
        const descriptionRu = russian
            ? raw.power > 0 || !russian.zeroPower
                ? russian.text.replace(/\{\}/g, String(raw.power))
                : russian.zeroPower
            : description;
        // Only abilities a player can actually meet (the codex roster) count as appliers: abilities.json
        // also defines retired or unassigned ones, and naming those would send players hunting for a
        // carrier that does not exist.
        const abilityNames = new Set(abilities.map((ability) => ability.name));
        const appliers = Object.values(rawAbilities)
            .filter(
                (entry): entry is RawAbilityEntry =>
                    typeof entry === "object" &&
                    (entry.effect === name || effectByPowerType[entry.power_type] === name) &&
                    abilityNames.has(entry.name),
            )
            .map((entry) => entry.name);
        // "Applied by: Stun (Orc, Squire)" — the carrier is the thing a player can actually draft, so it
        // travels with the ability instead of needing a second lookup.
        const carriersOf = (abilityName: string): string =>
            abilities
                .find((ability) => ability.name === abilityName)
                ?.units.map((unit) => unit.name)
                .join(", ") ?? "";
        const applierLines = appliers.map((abilityName) => {
            const carriers = carriersOf(abilityName);
            return carriers ? `${abilityName} (${carriers})` : abilityName;
        });
        // Russian: "Оглушение (Stun): Орк (Orc), Оруженосец (Squire)".
        const applierLinesRu = appliers.map((abilityName) => {
            const carriers = abilities.find((ability) => ability.name === abilityName)?.units ?? [];
            return carriers.length
                ? `${ruLabel(abilityName)}: ${carriers.map((unit) => ruLabel(unit.name)).join(", ")}`
                : ruLabel(abilityName);
        });
        // The card a player should land on: the ability of the same name, else the one ability that
        // applies the effect, else a search for it in the abilities tab.
        const linkedAbility = abilityNames.has(name)
            ? name
            : appliers.length === 1 && abilityNames.has(appliers[0])
              ? appliers[0]
              : undefined;
        graph.add({
            id: nodeId("effect", name),
            type: "effect",
            section: "abilities",
            name,
            nameRu: ruName(name),
            aliases: [`${name} effect`],
            href: linkedAbility
                ? knowledgePath("en", { section: "abilities", entry: linkedAbility })
                : knowledgePath("en", { section: "abilities", query: name }),
            hrefRu: linkedAbility
                ? knowledgePath("ru", { section: "abilities", entry: linkedAbility })
                : knowledgePath("ru", { section: "abilities", query: name }),
            summary: `Status effect: ${description} Lasts ${wholeFight ? "the whole fight" : `${raw.laps} lap(s)`}.`,
            summaryRu: `Эффект-состояние: ${descriptionRu} Длится ${wholeFight ? "до конца боя" : lapsRu(raw.laps)}.`,
            text: [
                `**${name}** is a status effect applied by abilities.`,
                description,
                ...howItWorks(effectNote(name, "en"), "en"),
                `Duration: ${wholeFight ? "the whole fight" : `${raw.laps} lap(s)`}. ${DURATION_NOTE.en}`,
                applierLines.length
                    ? `Applied by: ${applierLines.join(", ")}.`
                    : "Applied by the game (artifacts, synergies or terrain).",
            ].join("\n\n"),
            textRu: [
                `**${ruLabel(name)}** — эффект-состояние, который накладывают способности.`,
                descriptionRu,
                ...howItWorks(effectNote(name, "ru"), "ru"),
                `Длительность: ${wholeFight ? "до конца боя" : lapsRu(raw.laps)}. ${DURATION_NOTE.ru}`,
                applierLines.length
                    ? `Накладывается: ${applierLinesRu.join("; ")}.`
                    : "Накладывается игрой (артефакты, синергии или местность).",
            ].join("\n\n"),
            tags: ["effect", "status"],
            keywords: ["эффект", "состояние", "debuff", "дебафф"],
            props: { laps: raw.laps, power: raw.power, appliedBy: appliers },
        });
    }

    for (const spell of spells) {
        const { href, hrefRu } = hrefFor("spells", spell.name);
        graph.add({
            id: nodeId("spell", spell.name),
            type: "spell",
            section: "spells",
            name: spell.name,
            nameRu: ruName(spell.name),
            href,
            hrefRu,
            summary: oneLine(spell.description),
            summaryRu: oneLine(spell.descriptionRu),
            text: spellText(spell, "en"),
            textRu: spellText(spell, "ru"),
            tags: [
                "spell",
                spell.book,
                spell.kind,
                ...(spell.polarity ? [spell.polarity] : []),
                `level ${spell.level}`,
            ],
            keywords: [
                "заклинание",
                "магия",
                "magic",
                ...spell.casters.map((caster) => caster.name),
                ...spell.appliedBy,
            ],
            props: {
                book: spell.book,
                kind: spell.kind,
                level: spell.level,
                target: spell.target,
                polarity: spell.polarity ?? "",
                minimalCasterStackPower: spell.minimalCasterStackPower,
                casters: spell.casters.map((caster) => caster.name),
                appliedBy: spell.appliedBy,
            },
        });
    }

    for (const artifact of artifacts) {
        const { href, hrefRu } = hrefFor("artifacts", artifact.name);
        graph.add({
            id: nodeId("artifact", artifact.name),
            type: "artifact",
            section: "artifacts",
            name: artifact.name,
            nameRu: ruName(artifact.name),
            aliases: [artifact.slug.replace(/_/g, " ")],
            href,
            hrefRu,
            summary: `Tier ${artifact.tier} artifact: ${artifact.description}`,
            summaryRu: `Артефакт ${artifact.tier}-го уровня: ${artifact.descriptionRu}`,
            text: artifactText(artifact, "en"),
            textRu: artifactText(artifact, "ru"),
            tags: ["artifact", `tier ${artifact.tier}`, ...(artifact.cursed ? ["cursed"] : [])],
            keywords: ["артефакт", "item", "предмет", ...(artifact.cursed ? ["проклятый"] : [])],
            props: { tier: artifact.tier, cursed: Boolean(artifact.cursed) },
        });
    }

    for (const spec of augmentSpecs()) {
        graph.add({
            id: nodeId("augment", spec.name),
            type: "augment",
            section: "rules",
            name: spec.name,
            nameRu: spec.nameRu,
            aliases: [spec.name.replace(/ Augment$/, "")],
            href: knowledgePath("en", { section: "rules", entry: "rules-augments" }),
            hrefRu: knowledgePath("ru", { section: "rules", entry: "rules-augments" }),
            summary: spec.summary,
            summaryRu: spec.summaryRu,
            text: [
                `**${spec.name}** — ${spec.summary}`,
                bullet(
                    spec.levels.map(
                        (level) =>
                            `Level ${level.level} (${level.cost === 0 ? "free" : `${level.cost} point${level.cost === 1 ? "" : "s"}`}): ${level.effect}`,
                    ),
                ),
                spec.note,
                ...(spec.beneficiaries ? [spec.beneficiaries.en] : []),
                `Augment points come from the doctrine (5 for Spymaster, 6 for Scout, ${MAX_AUGMENT_POINTS} for Battle Trance) and are spent during Setup; they stay editable while you place your army, until you press Ready. The bonus is in place from the first lap, and points left unspent are spent for you automatically.`,
            ].join("\n\n"),
            textRu: [
                `**${spec.nameRu}** — ${spec.summaryRu}${spec.gameNameRu ? ` В игре этот апгрейд называется «${spec.gameNameRu}».` : ""}`,
                bullet(
                    spec.levels.map(
                        (level) =>
                            `Уровень ${level.level} (${level.cost === 0 ? "бесплатно" : `${level.cost} очк.`}): ${level.effectRu}`,
                    ),
                ),
                spec.noteRu,
                ...(spec.beneficiaries ? [spec.beneficiaries.ru] : []),
                `Очки апгрейдов даёт доктрина: ${ruLabel("Spymaster")} — 5, ${ruLabel("Scout")} — 6, ${ruLabel("Battle Trance")} — ${MAX_AUGMENT_POINTS}; они тратятся на этапе Setup, и менять их можно и во время расстановки — пока вы не нажмёте «Готово». Бонус действует с первого круга, а неизрасходованные очки тратятся за вас автоматически.`,
            ].join("\n\n"),
            tags: ["augment", "upgrade"],
            keywords: [
                "augment",
                "upgrade",
                "апгрейд",
                "усиление",
                ...(spec.gameNameRu ? [spec.gameNameRu.toLowerCase()] : []),
                ...spec.keywords,
            ],
            props: { levels: spec.levels.map((level) => `${level.level}:${level.cost}:${level.effect}`) },
        });
    }

    for (const doctrine of DOCTRINE_LIST) {
        // common's doctrine descriptions are English only; the Russian is built from the same data.
        const points = `${doctrine.upgradePoints} ${pluralRu(doctrine.upgradePoints, ["очко", "очка", "очков"])} апгрейдов`;
        const descriptionRu =
            doctrine.revealMode === "all"
                ? `Показывает все выборы соперника во время драфта. Даёт ${points}.`
                : doctrine.revealMode === "random3"
                  ? `Открывает выборы соперника в 3 случайных слотах его армии. Даёт ${points}.`
                  : `Не показывает ни одного выбора соперника. Даёт ${points}.`;
        const revealDetail =
            doctrine.revealMode === "all"
                ? {
                      en: "Every one of the opponent's six creature picks is shown as it happens, the bundle's two creatures included; artifacts (the bundle's too), the bundle offers and the augment budget stay hidden.",
                      ru: "Все шесть выборов существ соперника видны по мере того, как он их делает, включая два существа из бандла; артефакты (и артефакт бандла), предложения бандлов и бюджет апгрейдов остаются скрытыми.",
                  }
                : doctrine.revealMode === "random3"
                  ? {
                        en: "Watches three of the opponent's creature slots, drawn at random: one of the two level-1 slots, one of the two level-2 slots, and either the level-3 or the level-4 slot. Artifacts stay hidden.",
                        ru: "Следит за тремя случайными слотами существ соперника: одним из двух слотов 1 уровня, одним из двух слотов 2 уровня и слотом 3 или 4 уровня. Артефакты скрыты.",
                    }
                  : {
                        en: "Nothing is watched in advance. Like every doctrine, a pick that collides with a creature the opponent already took is refused and reveals that slot.",
                        ru: "Заранее ничего не видно. Как и при любой доктрине, выбор существа, уже взятого соперником, отклоняется и раскрывает этот слот.",
                    };
        graph.add({
            id: nodeId("doctrine", doctrine.name),
            type: "doctrine",
            section: "rules",
            name: doctrine.name,
            nameRu: ruName(doctrine.name),
            aliases: [`${doctrine.name} doctrine`],
            href: knowledgePath("en", { section: "rules", entry: "rules-doctrines" }),
            hrefRu: knowledgePath("ru", { section: "rules", entry: "rules-doctrines" }),
            summary: doctrine.description,
            summaryRu: descriptionRu,
            text: [
                `**${doctrine.name}** is a draft doctrine, the first pick-phase choice made simultaneously by both players.`,
                doctrine.description,
                `Reveal mode: ${doctrine.revealMode === "all" ? "see all of the opponent's picks" : doctrine.revealMode === "random3" ? "3 random opponent slots are revealed" : "nothing is revealed"}. Augment points: ${doctrine.upgradePoints}.`,
                revealDetail.en,
                "More vision costs points: the less you see of the opponent's draft, the larger your augment budget.",
            ].join("\n\n"),
            textRu: [
                `**${ruLabel(doctrine.name)}** — доктрина драфта, первый выбор фазы пиков, который оба игрока делают одновременно.`,
                descriptionRu,
                `Режим раскрытия: ${doctrine.revealMode === "all" ? "видны все пики соперника" : doctrine.revealMode === "random3" ? "раскрываются 3 случайных слота соперника" : "ничего не раскрывается"}. Очки апгрейдов: ${doctrine.upgradePoints}.`,
                revealDetail.ru,
                "Обзор стоит очков: чем меньше вы видите драфт соперника, тем больше бюджет апгрейдов.",
            ].join("\n\n"),
            tags: ["doctrine", "draft"],
            keywords: ["doctrine", "доктрина", "reveal", "scouting", "разведка", "points", "очки"],
            props: { upgradePoints: doctrine.upgradePoints, revealMode: doctrine.revealMode },
        });
    }

    for (const spec of synergySpecs) {
        const levels = synergyLevels.map((level) => ({
            level,
            units: unitsForLevel(level),
            powers: SynergyKeysToPower[`${spec.faction}:${spec.variant}:${level}`] ?? [],
        }));
        const factionRu = localizedFactionName("ru", spec.faction);
        graph.add({
            id: nodeId("synergy", spec.name),
            type: "synergy",
            section: "rules",
            name: spec.name,
            nameRu: spec.nameRu,
            href: knowledgePath("en", { section: "rules", entry: "rules-synergies" }),
            hrefRu: knowledgePath("ru", { section: "rules", entry: "rules-synergies" }),
            summary: `${spec.faction} synergy: ${levels.map((entry) => spec.effect(entry.powers)).join(" / ")} at ${levels.map((entry) => entry.units).join("/")} units.`,
            summaryRu: `Синергия фракции ${factionRu}: ${levels.map((entry) => spec.effectRu(entry.powers)).join(" / ")} при ${levels.map((entry) => entry.units).join("/")} юнитах.`,
            text: [
                `**${spec.name}** is one of the two ${spec.faction} faction synergies. Which of the pair applies in a match is fixed by the match id; both players see the same variant from the first draft screen.`,
                bullet(
                    levels.map(
                        (entry) =>
                            `Level ${entry.level} (${entry.units} distinct ${spec.faction} units): ${spec.effect(entry.powers)}`,
                    ),
                ),
                "Splitting one unit into several stacks does not raise the unit count.",
                `The bonus applies to every unit in your army, whatever its faction. The level is the number of different creatures of the faction ÷ 2, rounded down (3 creatures still give level 1), locked when the fight starts — losses never lower it — and a creature summoned mid-fight that is new to your army can raise it.`,
                `How it works: ${spec.detail}`,
            ].join("\n\n"),
            textRu: [
                `**${spec.nameRu}** — одна из двух синергий фракции ${factionRu}. Какая из пары действует в матче, определяется идентификатором матча; оба игрока видят один и тот же вариант с первого экрана драфта.`,
                bullet(
                    levels.map(
                        (entry) =>
                            `Уровень ${entry.level} (${entry.units} разных юнитов фракции): ${spec.effectRu(entry.powers)}`,
                    ),
                ),
                "Разделение одного юнита на несколько стеков счёт юнитов не увеличивает.",
                "Бонус действует на каждого юнита вашей армии, какой бы фракции он ни был. Уровень — число разных существ фракции ÷ 2 с округлением вниз (3 существа — всё ещё уровень 1); он фиксируется в начале боя, потери его не снижают, а призванное посреди боя новое для армии существо может его поднять.",
                `Как это работает: ${spec.detailRu}`,
            ].join("\n\n"),
            tags: ["synergy", spec.faction],
            keywords: ["synergy", "синергия", factionRu, ...spec.keywords],
            props: {
                faction: spec.faction,
                levels: levels.map((entry) => `${entry.level}:${entry.units}:${entry.powers.join("/")}`),
            },
        });
    }

    for (const spec of formulaSpecs()) {
        graph.add({
            id: nodeId("formula", spec.name),
            type: "formula",
            section: "rules",
            name: spec.name,
            nameRu: spec.nameRu,
            aliases: spec.aliases,
            href: knowledgePath("en", { section: "rules", entry: spec.rule.replace(/^rule-/, "rules-") }),
            hrefRu: knowledgePath("ru", { section: "rules", entry: spec.rule.replace(/^rule-/, "rules-") }),
            summary: spec.summary,
            summaryRu: spec.summaryRu,
            text: spec.text,
            textRu: spec.textRu,
            tags: ["formula", "mechanics"],
            keywords: ["formula", "mechanics", "формула", "механика", ...spec.keywords],
        });
    }

    const rulesEn = options.rulesHtml?.en ? extractRuleSections(options.rulesHtml.en) : [];
    const rulesRu = options.rulesHtml?.ru ? extractRuleSections(options.rulesHtml.ru) : [];
    for (const rule of rulesEn) {
        const ru = rulesRu.find((candidate) => candidate.id === rule.id);
        const entry = rule.id.replace(/^rule-/, "rules-");
        graph.add({
            id: `rule:${rule.id}`,
            type: "rule",
            section: "rules",
            name: rule.title,
            nameRu: ru?.title,
            aliases: [rule.eyebrow ?? "", ru?.eyebrow ?? ""].filter(Boolean),
            href: knowledgePath("en", { section: "rules", entry }),
            hrefRu: knowledgePath("ru", { section: "rules", entry }),
            summary:
                rule.markdown
                    .split("\n\n")
                    .find((paragraph) => !paragraph.startsWith("#"))
                    ?.slice(0, 240) ?? rule.title,
            summaryRu: ru?.markdown
                .split("\n\n")
                .find((paragraph) => !paragraph.startsWith("#"))
                ?.slice(0, 240),
            text: rule.markdown,
            textRu: ru?.markdown,
            tags: ["rule", "guide"],
            keywords: ["rules", "правила", ...(ruleKeywords[rule.id] ?? [])],
        });
    }

    const rankedPages: { key: "leavingRules" | "prizeRules" | "reputationRules"; path: string; slug: string }[] = [
        { key: "leavingRules", path: "/rules/leaving/", slug: "leaving" },
        { key: "prizeRules", path: "/rules/prizes/", slug: "prizes" },
        { key: "reputationRules", path: "/rules/reputation/", slug: "reputation" },
    ];
    for (const page of rankedPages) {
        const en = content.en[page.key];
        const ru = content.ru[page.key];
        const sections: readonly RuleSectionCopy[] = en.sections;
        const sectionsRu: readonly RuleSectionCopy[] = ru.sections;
        sections.forEach((section, index) => {
            const sectionRu = sectionsRu[index];
            graph.add({
                id: `ranked:${page.slug}-${slugify(section.title)}`,
                type: "ranked",
                section: "ranked",
                name: `${en.title}: ${section.title}`,
                nameRu: sectionRu ? `${ru.title}: ${sectionRu.title}` : undefined,
                href: page.path,
                hrefRu: `/ru${page.path}`,
                summary: `${en.title} — ${section.title}. ${en.description}`,
                summaryRu: sectionRu ? `${ru.title} — ${sectionRu.title}. ${ru.description}` : undefined,
                text: [`### ${section.title}`, index === 0 ? en.intro : "", sectionMarkdown(section, "en")]
                    .filter(Boolean)
                    .join("\n\n"),
                textRu: sectionRu
                    ? [`### ${sectionRu.title}`, index === 0 ? ru.intro : "", sectionMarkdown(sectionRu, "ru")]
                          .filter(Boolean)
                          .join("\n\n")
                    : undefined,
                tags: ["ranked", page.slug],
                keywords: ["ranked", "рейтинг", "рейтинговый", "mmr", "rating", page.slug, en.title, ru.title],
            });
        });
    }

    const copyEn = rankedArenaCopy.en;
    const copyRu = rankedArenaCopy.ru;
    graph.add({
        id: "ranked:leagues",
        type: "ranked",
        section: "ranked",
        name: "Ranked leagues and wealth tiers",
        nameRu: "Рейтинговые лиги и уровни богатства",
        aliases: [...copyEn.leagueNames, ...copyEn.wealthNames],
        href: "/play/ranked/",
        hrefRu: "/ru/play/ranked/",
        summary: `Five percentile leagues, worst to best: ${copyEn.leagueNames.join(", ")}; three wealth tiers inside each league: ${copyEn.wealthNames.join(", ")}.`,
        summaryRu: `Пять процентильных лиг, от худшей к лучшей: ${copyRu.leagueNames.join(", ")}; три уровня богатства внутри лиги: ${copyRu.wealthNames.join(", ")}.`,
        text: [
            `Placed ranked players are split into five leagues by MMR percentile, worst to best: ${copyEn.leagueNames.map((name, index) => `${index + 1}. ${name}`).join(", ")}. With all five leagues open the top league is the top 5% of active placed players, and its members carry a sequential leaderboard number.`,
            `Inside each league, players are also cut into three wealth tiers by season gold, poorest to richest: ${copyEn.wealthNames.join(", ")} (for example "Ragged Aspirant" or "Demigod Whale"). Wealth is derived from live gold balances and never stored.`,
            "Players in calibration have no league yet and show as Unranked. Leagues open one by one as the ladder fills — the population gate is in the ranked leagues entry — and while only the first is open, every placed player sits in it.",
        ].join("\n\n"),
        textRu: [
            `Размещённые рейтинговые игроки делятся на пять лиг по процентилю MMR, от худшей к лучшей: ${copyRu.leagueNames.map((name, index) => `${index + 1}. ${name}`).join(", ")}. Когда открыты все пять лиг, высшая — это верхние 5% активных размещённых игроков; её участники получают порядковый номер в таблице лидеров.`,
            `Внутри каждой лиги игроки также делятся на три уровня богатства по золоту сезона, от беднейших к богатейшим: ${copyRu.wealthNames.join(", ")}. Уровень богатства считается по живому балансу золота и никогда не сохраняется.`,
            "Игроки на калибровке лиги ещё не имеют и показываются как Unranked. Лиги открываются по очереди по мере заполнения таблицы — порог популяции указан в записи о рейтинговых лигах, — и пока открыта только первая, все размещённые игроки находятся в ней.",
        ].join("\n\n"),
        tags: ["ranked", "leagues"],
        keywords: [
            "league",
            "leagues",
            "rank",
            "tier",
            "wealth",
            "gold",
            "лига",
            "лиги",
            "ранг",
            "золото",
            "богатство",
            "mmr",
        ],
    });

    graph.add({
        id: "ranked:seasons",
        type: "ranked",
        section: "ranked",
        name: "Ranked seasons",
        nameRu: "Рейтинговые сезоны",
        href: "/seasons/",
        hrefRu: "/ru/seasons/",
        summary: content.en.seasons.subtitle,
        summaryRu: content.ru.seasons.subtitle,
        text: [
            content.en.seasons.subtitle,
            "Each season has its own in-game currency (gold) and prize places follow the gold table, the season's main result. Placed players keep their placement across seasons; seasonal MMR resets to the shared baseline and per-season records start from zero.",
        ].join("\n\n"),
        textRu: [
            content.ru.seasons.subtitle,
            "У каждого сезона своя внутриигровая валюта (золото), а призовые места определяются по таблице золота — главному результату сезона. Размещённые игроки сохраняют размещение между сезонами; сезонный MMR сбрасывается к общей базе, а сезонные записи начинаются с нуля.",
        ].join("\n\n"),
        tags: ["ranked", "seasons"],
        keywords: ["season", "seasons", "сезон", "сезоны", "gold", "золото", "prize", "приз"],
    });

    // The Contact page as knowledge: "who made the game", "is there a Discord", "how do I reach support".
    const contactEn = content.en.contact;
    const contactRu = content.ru.contact;
    // "Who made the game?" — the Terms of Service name the studio ("... made by Old Stars Gaming ('OSG', ...").
    const studio = /made by ([^('"]+?)\s*\(/.exec(content.en.legal.terms.intro)?.[1];
    const channels = [
        `Discord: ${links.discord}`,
        `Telegram: ${links.telegram}`,
        `X (Twitter): ${links.twitter}`,
        `Email: ${contactEn.email}`,
        `GitHub (public code): ${links.github}`,
    ];
    graph.add({
        id: "faq:contact",
        type: "faq",
        section: "faq",
        name: "Community and contact",
        nameRu: "Сообщество и связь с командой",
        aliases: ["contact", "support", "discord", "telegram", "community", "связаться", "поддержка", "сообщество"],
        href: localPath("en", "contact-us"),
        hrefRu: localPath("ru", "contact-us"),
        summary: `${contactEn.headline} Discord, Telegram, X and ${contactEn.email}; the code is public on GitHub.`,
        summaryRu: `${contactRu.headline} Discord, Telegram, X и ${contactRu.email}; код открыт на GitHub.`,
        text: [
            `**Community and contact** — ${contactEn.headline}`,
            bullet(channels),
            studio
                ? `Heroes of Crypto is made by ${studio}, as the Terms of Service state; the site does not list individual developers, and the team answers through these channels.`
                : "The site does not name the individual developers; the team answers through these channels.",
        ].join("\n\n"),
        textRu: [
            `**Сообщество и связь с командой** — ${contactRu.headline}`,
            bullet(channels.map((line) => line.replace("Email", "Почта").replace("(public code)", "(открытый код)"))),
            studio
                ? `Heroes of Crypto делает студия ${studio} — так сказано в Условиях использования; отдельных разработчиков сайт не перечисляет, а команда отвечает через эти каналы.`
                : "Имена разработчиков на сайте не указаны; команда отвечает через эти каналы.",
        ].join("\n\n"),
        tags: ["faq", "contact", "community"],
        keywords: ["team", "developer", "developers", "who made", "studio", "company", "команда", "разработчик", "разработчики", "кто сделал", "студия", "компания", "email", "почта", ...(studio ? [studio] : [])],
    });

    content.en.faq.forEach((entry, index) => {
        const ru = content.ru.faq[index];
        graph.add({
            id: `faq:${index + 1}-${slugify(entry.question).slice(0, 48)}`,
            type: "faq",
            section: "faq",
            name: entry.question,
            nameRu: ru?.question,
            href: "/faq/",
            hrefRu: "/ru/faq/",
            summary: entry.answer,
            summaryRu: ru?.answer,
            text: `**${entry.question}**\n\n${entry.answer}`,
            textRu: ru ? `**${ru.question}**\n\n${ru.answer}` : undefined,
            tags: ["faq"],
            keywords: ["faq", "question", "вопрос"],
        });
    });

    const playEn = content.en.play;
    const playRu = content.ru.play;
    graph.add({
        id: "faq:game-modes",
        type: "faq",
        section: "faq",
        name: "Game modes: ranked, lobbies with friends, sandbox",
        nameRu: "Режимы игры: рейтинг, лобби с друзьями, песочница",
        aliases: ["play with friends", "lobbies", "custom game", "private match", "game modes"],
        href: "/play/",
        hrefRu: "/ru/play/",
        summary: `${playEn.modeBody} ${playEn.lobbiesHint}`,
        summaryRu: `${playRu.modeBody} ${playRu.lobbiesHint}`,
        text: bullet([
            `Ranked: ${playEn.rankedHint.toLowerCase()} — rating, leagues, seasons and prizes apply. Open it from the Play page (/play/ranked/).`,
            `Lobbies (play with friends): ${playEn.lobbiesHint} Lobby matches are casual: they never move rating and leaving one costs no penalties or queue time. Open lobbies are listed on the Play page (/play/lobbies/).`,
            `Sandbox beta: ${playEn.sandboxHint} Sandbox fights are yours alone and never touch the ladder.`,
            "Games against the AI are casual too: they are excluded from the ranked ladder and from prizes.",
            "Everything runs in a desktop browser with no download; sign in to play ranked or lobby matches.",
        ]),
        textRu: bullet([
            `Рейтинг: ${playRu.rankedHint.toLowerCase()} — действуют рейтинг, лиги, сезоны и призы. Открывается со страницы «Играть» (/ru/play/ranked/).`,
            `Лобби (игра с друзьями): ${playRu.lobbiesHint} Матчи в лобби — обычные: они не меняют рейтинг, а выход из них не влечёт штрафов и ожидания очереди. Открытые лобби перечислены на странице «Играть» (/ru/play/lobbies/).`,
            `Песочница (бета): ${playRu.sandboxHint} Бои в песочнице никак не касаются рейтинговой таблицы.`,
            "Игры против ИИ тоже обычные: они исключены из рейтинговой таблицы и призов.",
            "Всё работает в браузере на компьютере без установки; для рейтинга и лобби нужно войти в аккаунт.",
        ]),
        tags: ["faq", "modes"],
        keywords: [
            "friend",
            "friends",
            "invite",
            "private",
            "custom",
            "lobby",
            "lobbies",
            "multiplayer",
            "modes",
            "sandbox",
            "vs ai",
            "друг",
            "друзья",
            "лобби",
            "приватный",
            "режим",
            "песочница",
        ],
    });

    const token = content.en.token;
    const tokenRu = content.ru.token;
    graph.add({
        id: "faq:hocai-token",
        type: "faq",
        section: "faq",
        name: "$HOCAI token",
        nameRu: "Токен $HOCAI",
        aliases: ["HOCAI", "token"],
        href: "/token/",
        hrefRu: "/ru/token/",
        summary: token.body,
        summaryRu: tokenRu.body,
        text: [
            token.body,
            `Allocation:\n${bullet(token.allocation.map((item) => `${item.label}: ${item.value}% — ${item.description}`))}`,
            `Utility:\n${bullet(token.utility)}`,
        ].join("\n\n"),
        textRu: [
            tokenRu.body,
            `Распределение:\n${bullet(tokenRu.allocation.map((item) => `${item.label}: ${item.value}% — ${item.description}`))}`,
            `Применение:\n${bullet(tokenRu.utility)}`,
        ].join("\n\n"),
        tags: ["token", "faq"],
        keywords: ["token", "crypto", "erc-20", "base", "токен", "крипто", "governance"],
    });

    patchNotes.en.forEach((note, index) => {
        const ru = patchNotes.ru[index];
        const render = (entry: typeof note): string =>
            [
                `**${entry.version}** (${entry.date}): ${entry.title}`,
                entry.impact,
                ...entry.sections.map((section) => `${section.title}:\n${bullet(section.items)}`),
                entry.closing,
            ]
                .filter(Boolean)
                .join("\n\n");
        graph.add({
            id: `patch:${slugify(note.version)}`,
            type: "patch",
            section: "patches",
            name: `Patch ${note.version}: ${note.title}`,
            nameRu: ru ? `Патч ${ru.version}: ${ru.title}` : undefined,
            aliases: [note.version],
            href: "/patches/",
            hrefRu: "/ru/patches/",
            summary: `${note.version} (${note.date}): ${note.impact}`,
            summaryRu: ru ? `${ru.version} (${ru.date}): ${ru.impact}` : undefined,
            text: render(note),
            textRu: ru ? render(ru) : undefined,
            tags: ["patch", note.version],
            keywords: ["patch", "update", "changelog", "release", "патч", "обновление", "версия", note.version],
            props: { version: note.version, date: note.date },
        });
    });

    // ---- Edges -------------------------------------------------------------------------------------------
    for (const unit of allUnits) {
        const unitId = nodeId("unit", unit.name);
        graph.link(unitId, nodeId("faction", unit.faction), "IN_FACTION");
        for (const ability of unit.abilities) graph.link(unitId, nodeId("ability", ability.name), "HAS_ABILITY");
        const scrolls = new Map<string, number>();
        for (const entry of unit.spells) {
            const name = entry.replace(/^[^:]+:/, "");
            scrolls.set(name, (scrolls.get(name) ?? 0) + 1);
        }
        for (const [name, count] of scrolls)
            graph.link(unitId, nodeId("spell", name), "CASTS", `${count} scroll${count === 1 ? "" : "s"}`);
    }
    for (const [name, raw] of Object.entries(rawAbilities)) {
        if (typeof raw !== "object") continue;
        if (raw.effect) graph.link(nodeId("ability", name), nodeId("effect", raw.effect), "APPLIES");
    }
    for (const spell of spells) {
        const spellId = nodeId("spell", spell.name);
        for (const abilityName of spell.appliedBy) graph.link(nodeId("ability", abilityName), spellId, "APPLIES");
        for (const other of spell.conflictsWith) graph.link(spellId, nodeId("spell", other), "CONFLICTS_WITH");
    }
    for (const spec of synergySpecs)
        graph.link(nodeId("synergy", spec.name), nodeId("faction", spec.faction), "SYNERGY_OF");
    for (const spec of augmentSpecs()) graph.link(nodeId("augment", spec.name), "rule:rule-augments", "RELATED");
    for (const doctrine of DOCTRINE_LIST)
        graph.link(nodeId("doctrine", doctrine.name), "rule:rule-doctrines", "RELATED");
    for (const spec of synergySpecs) graph.link(nodeId("synergy", spec.name), "rule:rule-synergies", "RELATED");
    for (const spec of formulaSpecs()) graph.link(nodeId("formula", spec.name), `rule:${spec.rule}`, "RELATED");

    const { pattern, byName } = buildNameIndex(graph.nodes.values());
    for (const node of graph.nodes.values()) {
        if (
            ![
                "rule",
                "formula",
                "ranked",
                "faq",
                "patch",
                "artifact",
                "ability",
                "spell",
                "effect",
                "augment",
                "synergy",
                "doctrine",
            ].includes(node.type)
        )
            continue;
        const mentioned = new Set<string>();
        for (const match of node.text.matchAll(pattern)) {
            const target = byName.get(match[0]);
            if (target && target !== node.id) mentioned.add(target);
            if (mentioned.size >= 40) break;
        }
        for (const target of mentioned) graph.link(node.id, target, "MENTIONS");
    }

    const nodes = [...graph.nodes.values()];
    const counts: Record<string, number> = {};
    for (const node of nodes) counts[node.type] = (counts[node.type] ?? 0) + 1;
    counts.nodes = nodes.length;
    counts.edges = graph.edges.length;

    return {
        schema: 1,
        builtAt: options.builtAt ?? new Date().toISOString(),
        source: {
            site: options.site ?? "https://heroesofcrypto.io",
            ...(options.clientCommit ? { clientCommit: options.clientCommit } : {}),
            ...(options.commonCommit ? { commonCommit: options.commonCommit } : {}),
        },
        languages: ["en", "ru"],
        counts,
        nodes,
        edges: graph.edges,
    };
}
