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

import { extractRuleSections } from "./rules-extractor";
import { artifacts } from "../artifacts-data";
import { knowledgePath, type KnowledgeCatalogSection } from "../knowledge-base";
import { localizedFactionName } from "../localization";
import { patchNotes } from "../patch-notes";
import { DEFAULT_RANKED_EXIT_RULES, ruleTokenValue, splitRuleTokens } from "../ranked-exit";
import { rankedArenaCopy } from "../ranked-arena-copy";
import { content, type Language } from "../site-data";
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

/** Abilities that apply an effect through their power type rather than an `effect` field. */
const effectByPowerType: Record<string, string> = { POISON_ON_HIT: "Poison" };

interface RawEffectEntry {
    name: string;
    laps: number;
    power: number;
    desc: string;
}

const RU_FACTIONS: FactionName[] = ["Life", "Nature", "Chaos", "Might"];

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

const bullet = (lines: string[]): string => lines.map((line) => `- ${line}`).join("\n");

const joinNames = (names: string[]): string => (names.length ? names.join(", ") : "—");

const attackLabelRu: Record<string, string> = {
    MELEE: "ближняя атака",
    RANGE: "дальняя атака",
    MAGIC: "магическая атака",
    MELEE_MAGIC: "ближняя / магическая атака",
};
const movementLabelRu: Record<string, string> = { WALK: "пешком", FLY: "полёт", TELEPORT: "телепорт" };

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

function unitText(unit: Unit, language: Language): string {
    const isRu = language === "ru";
    const faction = localizedFactionName(language, unit.faction);
    const attack = isRu ? (attackLabelRu[unit.attackType] ?? unit.attackType) : attackLabel(unit.attackType);
    const movement = isRu
        ? (movementLabelRu[unit.movementType] ?? unit.movementType)
        : movementLabel(unit.movementType);
    const footprint = unit.size === 1 ? "1x1" : unit.size === 2 ? "2x2" : `${unit.size}`;
    const abilityLines = unit.abilities.map(
        (ability) => `${ability.name}: ${(isRu ? ability.descriptionRu : ability.description).replace(/\s+/g, " ")}`,
    );
    const spellCounts = new Map<string, number>();
    for (const entry of unit.spells) {
        const name = entry.replace(/^[^:]+:/, "");
        spellCounts.set(name, (spellCounts.get(name) ?? 0) + 1);
    }
    const spellLines = [...spellCounts].map(([name, count]) => `${name} ×${count}`);
    if (isRu) {
        return [
            `**${unit.name}** — ${faction}, уровень ${unit.level}${unit.summonedOnly ? " (только призыв, не драфтится)" : ""}.`,
            bullet([
                `Здоровье: ${unit.hp}`,
                `Атака: ${unit.attack} (${attack}), урон ${unit.damageMin}–${unit.damageMax}`,
                `Броня: ${unit.armor}, сопротивление магии: ${unit.magicResist}%`,
                `Инициатива: ${unit.initiative}, шаги: ${unit.steps} (${movement})`,
                `Размер: ${footprint}, опыт (ценность стека): ${unit.experience}`,
                ...(unit.rangeShots > 0
                    ? [`Выстрелы: ${unit.rangeShots}, дистанция выстрела: ${unit.shotDistance}`]
                    : []),
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
            ...(unit.rangeShots > 0 ? [`Shots: ${unit.rangeShots}, shot distance: ${unit.shotDistance}`] : []),
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

function abilityText(ability: Ability, language: Language): string {
    const isRu = language === "ru";
    const carriers = ability.units.map((unit) => `${unit.name} (${localizedFactionName(language, unit.faction)})`);
    const lines = [
        `**${ability.name}** — ${abilityKindLabel(ability, language)}${ability.type ? ` · ${ability.type}` : ""}${
            ability.isStackPowered ? (isRu ? " · зависит от силы стека" : " · scales with stack power") : ""
        }`,
        isRu ? ability.descriptionRu : ability.description,
        carriers.length
            ? `${isRu ? "Носители" : "Carried by"}: ${carriers.join(", ")}`
            : ability.grantedBy
              ? isRu
                  ? `Ни один юнит не рождается с этой способностью: её даёт ${ability.grantedBy}.`
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
        return isRu ? `${spell.duration.laps} круг(а)` : `${spell.duration.laps} lap(s)`;
    if (spell.duration.kind === "broken") return isRu ? "пока не разрушится" : "until broken";
    return isRu ? "до конца боя" : "whole fight";
}

function spellText(spell: Spell, language: Language): string {
    const isRu = language === "ru";
    const casters = spell.casters.map(
        (caster) => `${caster.name} (${localizedFactionName(language, caster.faction)}, ×${caster.scrolls})`,
    );
    const facts = [
        `${isRu ? "Школа" : "Book"}: ${spell.book}`,
        `${isRu ? "Тип" : "Kind"}: ${spellKindLabel(spell, language)}${spell.polarity ? ` · ${spellPolarityLabel(spell, language)}` : ""}`,
        `${isRu ? "Уровень" : "Level"}: ${spell.level}`,
        `${isRu ? "Цель" : "Target"}: ${spell.target}`,
        `${isRu ? "Длительность" : "Duration"}: ${spellDurationLabel(spell, language)}`,
        `${isRu ? "Минимальная сила стека заклинателя" : "Minimum caster stack power"}: ${spell.minimalCasterStackPower}`,
        ...(spell.selfCastAllowed ? [isRu ? "Можно применить на себя" : "Can be cast on self"] : []),
        ...(spell.isGiftable ? [isRu ? "Можно подарить" : "Giftable"] : []),
        ...(spell.conflictsWith.length
            ? [`${isRu ? "Конфликтует с" : "Conflicts with"}: ${spell.conflictsWith.join(", ")}`]
            : []),
    ];
    const source = casters.length
        ? `${isRu ? "Заклинатели" : "Casters"}: ${casters.join(", ")}`
        : spell.appliedBy.length
          ? `${isRu ? "Применяется способностями" : "Applied by abilities"}: ${spell.appliedBy.join(", ")}`
          : isRu
            ? "Применяется игрой автоматически (состояние, местность или предмет)."
            : "Applied automatically by the game (state, terrain or item).";
    return [`**${spell.name}**`, isRu ? spell.descriptionRu : spell.description, bullet(facts), source].join("\n\n");
}

const artifactText = (artifact: (typeof artifacts)[number], language: Language): string => {
    const isRu = language === "ru";
    return [
        `**${artifact.name}** — ${isRu ? "артефакт уровня" : "Tier"} ${artifact.tier}${artifact.cursed ? (isRu ? " · проклятый (есть недостаток)" : " · cursed (has a downside)") : ""}`,
        artifact.description,
        isRu
            ? "Артефакты выбираются во время драфта: каждая команда берёт один артефакт 1-го уровня и один 2-го. Эффект действует на всю армию до конца боя."
            : "Artifacts are chosen during the draft: each team takes one Tier 1 and one Tier 2 artifact. The effect applies to the whole army for the entire fight.",
    ].join("\n\n");
};

interface AugmentSpec {
    name: string;
    nameRu: string;
    summary: string;
    summaryRu: string;
    levels: { level: number; cost: number; effect: string; effectRu: string }[];
    note: string;
    noteRu: string;
    keywords: string[];
}

function augmentSpecs(): AugmentSpec[] {
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
                "Team-wide armor bonus: a percentage of physical armor plus the same number of flat magic armor points.",
            summaryRu: "Командный бонус к броне: процент физической брони и столько же очков магической брони.",
            levels: armor.map((power, index) => ({
                level: index + 1,
                cost: index + 1,
                effect: `+${power}% armor and +${power} magic armor`,
                effectRu: `+${power}% брони и +${power} магической брони`,
            })),
            note: "Physical armor scales with the unit's own stat; magic armor gains the points outright because base magic armor is 0/5/10/15 by creature level.",
            noteRu: "Физическая броня растёт в процентах от собственной характеристики юнита; магическая броня получает очки напрямую, потому что базовая магическая броня равна 0/5/10/15 по уровню существа.",
            keywords: ["defense", "защита", "armour"],
        },
        {
            name: "Might Augment",
            nameRu: "Апгрейд «Сила»",
            summary: "Team-wide melee attack bonus.",
            summaryRu: "Командный бонус к атаке в ближнем бою.",
            levels: might.map((power, index) => ({
                level: index + 1,
                cost: index + 1,
                effect: `+${power}% melee attack`,
                effectRu: `+${power}% к атаке ближнего боя`,
            })),
            note: "For armies that intend to fight up close.",
            noteRu: "Для армий, которые собираются драться вплотную.",
            keywords: ["melee", "attack", "ближний бой", "атака"],
        },
        {
            name: "Empower Augment",
            nameRu: "Апгрейд «Магия»",
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
            note: "Does not touch healing, buffs or control spells (Heal, Whirlpool, Magic Mirror). Stacks additively with Mage's Ring, Archmage's Ring and the Empower scroll.",
            noteRu: "Не влияет на лечение, баффы и контроль (Heal, Whirlpool, Magic Mirror). Складывается аддитивно с Mage's Ring, Archmage's Ring и свитком Empower.",
            keywords: ["magic", "spell damage", "магия", "магический урон"],
        },
        {
            name: "Sniper Augment",
            nameRu: "Апгрейд «Стрельба»",
            summary: "Team-wide ranged attack and shot-range bonus.",
            summaryRu: "Командный бонус к дальней атаке и дистанции выстрела.",
            levels: sniper.map(([attack, range], index) => ({
                level: index + 1,
                cost: index + 1,
                effect: `+${attack}% ranged attack and +${range}% shot distance`,
                effectRu: `+${attack}% дальней атаки и +${range}% дистанции выстрела`,
            })),
            note: "Extends the full-damage band but does not remove range falloff.",
            noteRu: "Расширяет зону полного урона, но не отменяет штраф за дальность.",
            keywords: ["ranged", "archer", "range", "стрелок", "дальность"],
        },
        {
            name: "Movement Augment",
            nameRu: "Апгрейд «Движение»",
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
                          : `${depth} клеток вглубь вместе с боковым краем, до ${stackCaps[index]} стеков до синергии Природы «Юниты на поле»`,
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
    keywords: string[];
}

const synergySpecs: SynergySpec[] = [
    {
        faction: "Life",
        variant: LifeSynergy.PLUS_SUPPLY_PERCENTAGE,
        name: "Life Supply Synergy",
        nameRu: "Синергия Жизни «Снабжение»",
        effect: ([power]) => `+${power}% bodies in each stack`,
        effectRu: ([power]) => `+${power}% существ в каждом стеке`,
        keywords: ["supply", "stack size", "снабжение"],
    },
    {
        faction: "Life",
        variant: LifeSynergy.PLUS_MORALE_AND_LUCK,
        name: "Life Morale and Luck Synergy",
        nameRu: "Синергия Жизни «Мораль и удача»",
        effect: ([morale, luck]) => `+${morale} morale and +${luck} luck`,
        effectRu: ([morale, luck]) => `+${morale} морали и +${luck} удачи`,
        keywords: ["morale", "luck", "мораль", "удача"],
    },
    {
        faction: "Chaos",
        variant: ChaosSynergy.MOVEMENT,
        name: "Chaos Movement Synergy",
        nameRu: "Синергия Хаоса «Движение»",
        effect: ([power]) => `+${power} movement cell${power === 1 ? "" : "s"}`,
        effectRu: ([power]) => `+${power} клетка(и) движения`,
        keywords: ["movement", "steps", "движение"],
    },
    {
        faction: "Chaos",
        variant: ChaosSynergy.BREAK_ON_ATTACK,
        name: "Chaos Break on Attack Synergy",
        nameRu: "Синергия Хаоса «Разлом при атаке»",
        effect: ([power]) => `${power}% chance on attack to Break the target (shut off its abilities)`,
        effectRu: ([power]) => `${power}% шанс при атаке наложить Break (отключить способности цели)`,
        keywords: ["break", "disable abilities", "разлом"],
    },
    {
        faction: "Might",
        variant: MightSynergy.PLUS_AURAS_RANGE,
        name: "Might Aura Range Synergy",
        nameRu: "Синергия Силы «Радиус аур»",
        effect: ([power]) => `+${power} aura range cell${power === 1 ? "" : "s"}`,
        effectRu: ([power]) => `+${power} клетка(и) к радиусу аур`,
        keywords: ["aura", "range", "аура"],
    },
    {
        faction: "Might",
        variant: MightSynergy.PLUS_STACK_ABILITIES_POWER,
        name: "Might Stack Abilities Power Synergy",
        nameRu: "Синергия Силы «Сила способностей стека»",
        effect: ([power]) => `+${power}% power to stack-powered abilities`,
        effectRu: ([power]) => `+${power}% к силе способностей, зависящих от стека`,
        keywords: ["abilities power", "stack power", "сила способностей"],
    },
    {
        faction: "Nature",
        variant: NatureSynergy.INCREASE_BOARD_UNITS,
        name: "Nature Board Units Synergy",
        nameRu: "Синергия Природы «Юниты на поле»",
        effect: ([power]) => `+${power} fielded stacks (raises the stack cap)`,
        effectRu: ([power]) => `+${power} стека(ов) на поле (повышает лимит стеков)`,
        keywords: ["stack cap", "more units", "лимит стеков"],
    },
    {
        faction: "Nature",
        variant: NatureSynergy.PLUS_FLY_ARMOR,
        name: "Nature Flying Armor Synergy",
        nameRu: "Синергия Природы «Броня летающих»",
        effect: ([power]) => `+${power}% armor for flying units`,
        effectRu: ([power]) => `+${power}% брони летающим юнитам`,
        keywords: ["flying", "fly", "armor", "летающие", "броня"],
    },
];

const synergyLevels = [1, 2, 3] as const;
const unitsForLevel = (level: number): number =>
    Number(Object.entries(UNITS_TO_SYNERGY_LEVEL).find(([, value]) => value === level)?.[0] ?? level * 2);

interface FormulaSpec {
    name: string;
    nameRu: string;
    summary: string;
    summaryRu: string;
    text: string;
    textRu: string;
    keywords: string[];
    rule: string;
}

function formulaSpecs(): FormulaSpec[] {
    const minutes = TOTAL_TIME_TO_MAKE_TURN_MILLIS / 60_000;
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
                    "`damage_roll` is the unit's min or max damage (the roll lands between them).",
                    "`attack` is the attacker's current attack rating; `alive_bodies` is the number of living creatures in the stack.",
                    "`enemy_armor` is the target's armor (its ranged armor against a shot). Piercing Spear reduces it by the ability's percentage.",
                    "`enemy_luck` runs from −10 to +10, so a lucky target takes about 1% less damage per point and an unlucky one about 1% more.",
                    "`range_divisor` is 1 in melee and at short range; shooting beyond the shot distance doubles it per distance band, up to ×8. Smoke doubles it once more (still capped at 8). Units with the Sniper ability ignore the divisor entirely; the Sniper augment and Farsight Quiver only push the full-damage band further out.",
                    `\`morale_multiplier\` is 1.25 for a positive morale proc, 0.8 for a negative one, otherwise 1.`,
                ]),
                "The roll is then multiplied, in this order, and floored once: ×0.5 when a ranged unit without Handyman swings in melee, × the ability multiplier (Through Shot, Area Throw, Double Shot's second volley, …), × (1 + Deep Wounds stacks %) when the attacker inflicts Deep Wounds and the target already carries it, × the elemental multiplier (Fire vs Water, Wind vs Earth: the vulnerable side takes the element ability's percentage more).",
                "A ranged attack with an empty quiver deals 0. Stack losses are then the damage divided through the target's per-body health.",
            ].join("\n\n"),
            textRu: [
                "Каждая атака бросает одно целое число внутри диапазона. Каждая граница диапазона считается так:",
                "`ceil( урон × атака × живые_существа / броня_врага × (1 − удача_врага / 100) / делитель_дальности × множитель_морали )`, минимум 1.",
                bullet([
                    "`урон` — минимальный или максимальный урон юнита (бросок ложится между ними).",
                    "`атака` — текущая атака атакующего; `живые_существа` — число живых существ в стеке.",
                    "`броня_врага` — броня цели (против выстрела — её броня от дальних атак). Piercing Spear снижает её на процент способности.",
                    "`удача_врага` от −10 до +10: удачливая цель получает примерно на 1% меньше урона за очко, неудачливая — больше.",
                    "`делитель_дальности` равен 1 в ближнем бою и на короткой дистанции; выстрел дальше дистанции выстрела удваивает его за каждую полосу дальности, максимум ×8. Дым удваивает его ещё раз (предел тот же — 8). Юниты со способностью Sniper игнорируют делитель полностью; апгрейд «Стрельба» и Farsight Quiver лишь отодвигают зону полного урона.",
                    "`множитель_морали` равен 1.25 при положительном срабатывании морали, 0.8 при отрицательном, иначе 1.",
                ]),
                "Затем бросок умножается в таком порядке и один раз округляется вниз: ×0.5, если стрелок без Handyman бьёт в ближнем бою; × множитель способности (Through Shot, Area Throw, второй выстрел Double Shot и т.д.); × (1 + проценты стаков Deep Wounds), если атакующий наносит Deep Wounds, а цель уже под эффектом; × стихийный множитель (Огонь против Воды, Ветер против Земли: уязвимая сторона получает больше на процент стихийной способности).",
                "Дальняя атака с пустым колчаном наносит 0. Потери стека — это урон, поделённый на здоровье одного существа цели.",
            ].join("\n\n"),
            keywords: [
                "damage",
                "formula",
                "calculation",
                "armor",
                "attack",
                "урон",
                "формула",
                "расчёт",
                "броня",
                "атака",
            ],
            rule: "rule-mechanics",
        },
        {
            name: "Morale",
            nameRu: "Мораль",
            summary:
                "Morale runs from −20 to +20, procs at lap start with a chance equal to its absolute value, and changes with every move, kill and skip.",
            summaryRu:
                "Мораль от −20 до +20, срабатывает в начале круга с шансом, равным её модулю, и меняется от каждого хода, убийства и пропуска.",
            text: [
                `Morale is capped at ±${MORALE_MAX_VALUE_TOTAL}. At the start of each lap the engine rolls a chance equal to the unit's absolute morale: a positive proc puts the unit in the priority queue and gives it ×1.25 attack for the lap; a negative proc sends it to the back of the queue, sets ×0.8 attack and skips its turn. Morale never grants an extra action.`,
                "Exact changes:",
                bullet([
                    `+${MORALE_CHANGE_FOR_DISTANCE} for moving closer to the enemy army's centroid, −${MORALE_CHANGE_FOR_DISTANCE} for moving away`,
                    `+${MORALE_CHANGE_FOR_KILL} to the attacker for destroying an enemy stack; −${MORALE_CHANGE_FOR_KILL} to each of your other surviving stacks of a unit whose stack was wiped out`,
                    `−${MORALE_CHANGE_FOR_CLOCK} for waiting on the Hourglass, −${MORALE_CHANGE_FOR_SHIELD} for Defend (Luck Shield), −${MORALE_CHANGE_FOR_SKIP} for an actual skipped turn (including a timeout passed to the engine as a skip)`,
                    "Ending the turn after moving or another action costs nothing.",
                ]),
                "Madness and Mechanism units always sit at 0 morale.",
            ].join("\n\n"),
            textRu: [
                `Мораль ограничена ±${MORALE_MAX_VALUE_TOTAL}. В начале каждого круга движок бросает шанс, равный модулю морали юнита: положительное срабатывание ставит юнита в очередь приоритета и даёт ×1.25 к атаке на круг; отрицательное отправляет его в конец очереди, ставит ×0.8 к атаке и пропускает ход. Дополнительного действия мораль не даёт.`,
                "Точные изменения:",
                bullet([
                    `+${MORALE_CHANGE_FOR_DISTANCE} за движение к центру вражеской армии, −${MORALE_CHANGE_FOR_DISTANCE} за движение от него`,
                    `+${MORALE_CHANGE_FOR_KILL} атакующему за уничтожение вражеского стека; −${MORALE_CHANGE_FOR_KILL} каждому вашему другому стеку того же юнита, чей стек был уничтожен`,
                    `−${MORALE_CHANGE_FOR_CLOCK} за ожидание (Hourglass), −${MORALE_CHANGE_FOR_SHIELD} за защиту (Luck Shield), −${MORALE_CHANGE_FOR_SKIP} за фактический пропуск хода (включая таймаут, переданный движку как пропуск)`,
                    "Завершение хода после движения или другого действия ничего не стоит.",
                ]),
                "Юниты с Madness и Mechanism всегда имеют 0 морали.",
            ].join("\n\n"),
            keywords: ["morale", "tempo", "priority", "queue", "мораль", "темп", "очередь"],
            rule: "rule-morale",
        },
        {
            name: "Luck",
            nameRu: "Удача",
            summary:
                "Luck runs from −10 to +10, drifts by up to ±3 each lap, and mostly reduces (or increases) incoming damage.",
            summaryRu:
                "Удача от −10 до +10, каждый круг сдвигается до ±3 и в основном снижает (или повышает) входящий урон.",
            text: [
                `Luck is capped at ±${LUCK_MAX_VALUE_TOTAL}. Ordinary incoming damage changes by about 1% per point (positive luck reduces it, negative luck increases it), and luck also changes the power or proc chance of many stack-powered abilities.`,
                `At lap start every stack receives a random modifier from −${LUCK_MAX_CHANGE_FOR_TURN} to +${LUCK_MAX_CHANGE_FOR_TURN}; Defend (Luck Shield) replaces that roll with +${LUCK_CHANGE_FOR_SHIELD} for the rest of the lap at the cost of the turn and ${MORALE_CHANGE_FOR_SHIELD} morale.`,
                "Luck Aura grants maximum luck to allies in range; Clover of Fortune adds +10 army-wide; Cursed Ward trades morale for luck; Misfortune drops a target's luck to the minimum.",
            ].join("\n\n"),
            textRu: [
                `Удача ограничена ±${LUCK_MAX_VALUE_TOTAL}. Обычный входящий урон меняется примерно на 1% за очко (положительная удача снижает его, отрицательная повышает); удача также меняет силу или шанс срабатывания многих способностей, зависящих от стека.`,
                `В начале круга каждый стек получает случайный модификатор от −${LUCK_MAX_CHANGE_FOR_TURN} до +${LUCK_MAX_CHANGE_FOR_TURN}; защита (Luck Shield) заменяет этот бросок на +${LUCK_CHANGE_FOR_SHIELD} до конца круга ценой хода и ${MORALE_CHANGE_FOR_SHIELD} морали.`,
                "Luck Aura даёт союзникам в радиусе максимальную удачу; Clover of Fortune добавляет +10 всей армии; Cursed Ward меняет мораль на удачу; Misfortune опускает удачу цели до минимума.",
            ].join("\n\n"),
            keywords: ["luck", "critical", "удача"],
            rule: "rule-morale",
        },
        {
            name: "Stack power",
            nameRu: "Сила стека",
            summary: `A ${MIN_UNIT_STACK_POWER}–${MAX_UNIT_STACK_POWER} rating of a stack's board value that scales stack-powered abilities and gates some spells.`,
            summaryRu: `Оценка ${MIN_UNIT_STACK_POWER}–${MAX_UNIT_STACK_POWER} ценности стека на поле, которая усиливает зависящие от стека способности и открывает некоторые заклинания.`,
            text: `Stack power is recalculated from board value: unit experience × living amount, compared with the largest stack present. It ranges from ${MIN_UNIT_STACK_POWER} to ${MAX_UNIT_STACK_POWER} and affects only mechanics marked as stack-powered (ability proc chances and powers, Chakram's target count, Craft's requirement of stack power 4, spell minimum caster stack power).`,
            textRu: `Сила стека пересчитывается из ценности на поле: опыт юнита × число живых, относительно крупнейшего стека. Она лежит в диапазоне ${MIN_UNIT_STACK_POWER}–${MAX_UNIT_STACK_POWER} и влияет только на механики, помеченные как зависящие от силы стека (шансы и сила способностей, число целей Chakram, требование силы стека 4 для Craft, минимальная сила стека для заклинаний).`,
            keywords: ["stack power", "stack", "сила стека"],
            rule: "rule-morale",
        },
        {
            name: "Map narrowing and Armageddon",
            nameRu: "Сужение карты и Армагеддон",
            summary: `The battlefield shrinks every ${NUMBER_OF_LAPS_TILL_NARROWING_NORMAL} laps (${NUMBER_OF_LAPS_TILL_NARROWING_BLOCK} on block-center maps) and ${NUMBER_OF_ARMAGEDDON_WAVES} Armageddon waves start at lap ${NUMBER_OF_LAPS_FIRST_ARMAGEDDON}.`,
            summaryRu: `Поле сужается каждые ${NUMBER_OF_LAPS_TILL_NARROWING_NORMAL} круга (${NUMBER_OF_LAPS_TILL_NARROWING_BLOCK} на картах с заблокированным центром), а ${NUMBER_OF_ARMAGEDDON_WAVES} волны Армагеддона начинаются на ${NUMBER_OF_LAPS_FIRST_ARMAGEDDON}-м круге.`,
            text: bullet([
                `The map narrows every ${NUMBER_OF_LAPS_TILL_NARROWING_NORMAL} laps (every ${NUMBER_OF_LAPS_TILL_NARROWING_BLOCK} on maps with a blocked center): the outer ring of cells turns into holes, up to ${MAX_HOLE_LAYERS} layers.`,
                "A stack standing on a vanishing cell is pushed inward if there is legal space; otherwise it dies.",
                `Narrowing stops at lap ${NUMBER_OF_LAPS_TILL_STOP_NARROWING}. Armageddon is ${NUMBER_OF_ARMAGEDDON_WAVES} waves in total, one per lap from lap ${NUMBER_OF_LAPS_FIRST_ARMAGEDDON} to lap ${NUMBER_OF_LAPS_FIRST_ARMAGEDDON + NUMBER_OF_ARMAGEDDON_WAVES - 1}, each stronger than the last; the first wave deals at least ${MIN_ARMAGEDDON_DAMAGE_FIRST_WAVE} damage to every stack.`,
                "If a wave destroys both armies at once, the fight is a draw.",
            ]),
            textRu: bullet([
                `Карта сужается каждые ${NUMBER_OF_LAPS_TILL_NARROWING_NORMAL} круга (каждые ${NUMBER_OF_LAPS_TILL_NARROWING_BLOCK} на картах с заблокированным центром): внешнее кольцо клеток превращается в провалы, до ${MAX_HOLE_LAYERS} слоёв.`,
                "Стек на исчезающей клетке выталкивается внутрь, если есть свободное место; иначе он погибает.",
                `Сужение прекращается на ${NUMBER_OF_LAPS_TILL_STOP_NARROWING}-м круге. Армагеддон — это всего ${NUMBER_OF_ARMAGEDDON_WAVES} волны, по одной за круг с ${NUMBER_OF_LAPS_FIRST_ARMAGEDDON}-го по ${NUMBER_OF_LAPS_FIRST_ARMAGEDDON + NUMBER_OF_ARMAGEDDON_WAVES - 1}-й круг, каждая сильнее предыдущей; первая наносит каждому стеку минимум ${MIN_ARMAGEDDON_DAMAGE_FIRST_WAVE} урона.`,
                "Если волна уничтожает обе армии одновременно, бой заканчивается ничьей.",
            ]),
            keywords: ["map", "narrowing", "armageddon", "laps", "holes", "карта", "сужение", "армагеддон", "круги"],
            rule: "rule-map",
        },
        {
            name: "Turn timer",
            nameRu: "Таймер хода",
            summary: `${MIN_TIME_TO_MAKE_TURN_MILLIS / 1000}–${MAX_TIME_TO_MAKE_TURN_MILLIS / 1000} seconds per turn from a ${minutes}-minute budget per team per lap.`,
            summaryRu: `${MIN_TIME_TO_MAKE_TURN_MILLIS / 1000}–${MAX_TIME_TO_MAKE_TURN_MILLIS / 1000} секунд на ход из ${minutes}-минутного бюджета команды на круг.`,
            text: `The engine allocates ${MIN_TIME_TO_MAKE_TURN_MILLIS / 1000}–${MAX_TIME_TO_MAKE_TURN_MILLIS / 1000} seconds per turn from each team's ${minutes}-minute budget for the lap. In ranked play the first missed deadline is protected by Hourglass/Luck Shield; later misses are played by the AI, and two consecutive misses enable AI control of the seat.`,
            textRu: `Движок выделяет ${MIN_TIME_TO_MAKE_TURN_MILLIS / 1000}–${MAX_TIME_TO_MAKE_TURN_MILLIS / 1000} секунд на ход из ${minutes}-минутного бюджета команды на круг. В рейтинге первый пропуск таймера страхуется Hourglass/Luck Shield; следующие пропуски играет ИИ, а два пропуска подряд включают управление ИИ.`,
            keywords: ["timer", "time", "seconds", "timeout", "таймер", "время"],
            rule: "rule-mechanics",
        },
        {
            name: "Army limits",
            nameRu: "Лимиты армии",
            summary: `Draft 2/2/1/1 units by level, at most ${MAX_UNITS_PER_TEAM} stacks per team before Nature bonuses, ${MAX_AUGMENT_POINTS} augment points at most, synergies at 2/4/6 units.`,
            summaryRu: `Драфт 2/2/1/1 юнитов по уровням, не более ${MAX_UNITS_PER_TEAM} стеков в команде до бонусов Природы, максимум ${MAX_AUGMENT_POINTS} очков апгрейдов, синергии при 2/4/6 юнитах.`,
            text: bullet([
                "Each match you draft two level-1 units, two level-2, one level-3 and one level-4 unit.",
                `The baseline stack cap is 6, raised to 7 or ${MAX_UNITS_PER_TEAM} by the Placement augment; Nature's Board Units synergy adds another 2/3/4, for an absolute cap of 12.`,
                `Doctrines pay 5, 6 or ${MAX_AUGMENT_POINTS} augment points; every augment level costs as many points as its level (Placement level 1 is free).`,
                `Faction synergies reach level 1/2/3 at ${unitsForLevel(1)}/${unitsForLevel(2)}/${unitsForLevel(3)} distinct roster units of that faction; splitting a unit into several stacks does not raise the count.`,
            ]),
            textRu: bullet([
                "За матч вы берёте два юнита 1-го уровня, два — 2-го, один — 3-го и один — 4-го.",
                `Базовый лимит стеков — 6; апгрейд «Расстановка» поднимает его до 7 или ${MAX_UNITS_PER_TEAM}; синергия Природы «Юниты на поле» добавляет ещё 2/3/4, абсолютный максимум — 12.`,
                `Доктрины дают 5, 6 или ${MAX_AUGMENT_POINTS} очков апгрейдов; каждый уровень апгрейда стоит столько очков, каков его уровень (уровень 1 «Расстановки» бесплатный).`,
                `Синергии фракций достигают уровня 1/2/3 при ${unitsForLevel(1)}/${unitsForLevel(2)}/${unitsForLevel(3)} разных юнитах фракции; разделение юнита на несколько стеков счёт не увеличивает.`,
            ]),
            keywords: ["draft", "limits", "roster", "cap", "points", "драфт", "лимит", "состав"],
            rule: "rule-draft",
        },
    ];
}

interface RuleSectionCopy {
    title: string;
    body?: string[];
    items?: string[];
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
        const units = allUnits.filter((unit) => unit.faction === faction);
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
            summary: `${faction} faction: ${units.length} units. Synergy pair: ${pair.map((spec) => spec.name).join(" or ")}.`,
            summaryRu: `Фракция ${factionRu}: ${units.length} юнитов. Пара синергий: ${pair.map((spec) => spec.nameRu).join(" или ")}.`,
            text: [
                `**${faction}** fields ${units.length} units (levels 1–4). Drafting 2/4/6 distinct ${faction} units unlocks the faction synergy at level 1/2/3; which of the two synergies applies is fixed per match by the match id.`,
                `Units by level:\n${bullet(
                    [1, 2, 3, 4].map(
                        (level) =>
                            `Level ${level}: ${joinNames(units.filter((unit) => unit.level === level).map((unit) => unit.name))}`,
                    ),
                )}`,
                `Synergies: ${pair.map((spec) => spec.name).join(" / ")}.`,
            ].join("\n\n"),
            textRu: [
                `**${factionRu}** выставляет ${units.length} юнитов (уровни 1–4). 2/4/6 разных юнитов фракции открывают синергию уровня 1/2/3; какая из двух синергий действует, определяется идентификатором матча.`,
                `Юниты по уровням:\n${bullet(
                    [1, 2, 3, 4].map(
                        (level) =>
                            `Уровень ${level}: ${joinNames(units.filter((unit) => unit.level === level).map((unit) => unit.name))}`,
                    ),
                )}`,
                `Синергии: ${pair.map((spec) => spec.nameRu).join(" / ")}.`,
            ].join("\n\n"),
            tags: ["faction", faction],
            keywords: [factionRu, "faction", "фракция"],
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
            href,
            hrefRu,
            summary: ability.description.split("\n")[0],
            summaryRu: ability.descriptionRu.split("\n")[0],
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
        const description = raw.desc.replace(
            /\{\}/g,
            raw.power > 0 ? String(raw.power) : "an amount set by whatever applied it",
        );
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
            aliases: [`${name} effect`],
            href: linkedAbility
                ? knowledgePath("en", { section: "abilities", entry: linkedAbility })
                : knowledgePath("en", { section: "abilities", query: name }),
            hrefRu: linkedAbility
                ? knowledgePath("ru", { section: "abilities", entry: linkedAbility })
                : knowledgePath("ru", { section: "abilities", query: name }),
            summary: `Status effect: ${description} Lasts ${raw.laps} lap(s).`,
            summaryRu: `Эффект-состояние: ${description} Длится ${raw.laps} круг(а).`,
            text: [
                `**${name}** is a status effect applied by abilities.`,
                description,
                `Duration: ${raw.laps} lap(s).`,
                appliers.length
                    ? `Applied by: ${appliers.join(", ")}.`
                    : "Applied by the game (artifacts, synergies or terrain).",
            ].join("\n\n"),
            textRu: [
                `**${name}** — эффект-состояние, который накладывают способности.`,
                description,
                `Длительность: ${raw.laps} круг(а).`,
                appliers.length
                    ? `Накладывается: ${appliers.join(", ")}.`
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
            href,
            hrefRu,
            summary: spell.description.split("\n")[0],
            summaryRu: spell.descriptionRu.split("\n")[0],
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
            aliases: [artifact.slug.replace(/_/g, " ")],
            href,
            hrefRu,
            summary: `Tier ${artifact.tier} artifact: ${artifact.description}`,
            summaryRu: `Артефакт ${artifact.tier}-го уровня: ${artifact.description}`,
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
                `Augment points come from the doctrine (5 for Spymaster, 6 for Scout, ${MAX_AUGMENT_POINTS} for Battle Trance) and are spent during army setup before placement.`,
            ].join("\n\n"),
            textRu: [
                `**${spec.nameRu}** — ${spec.summaryRu}`,
                bullet(
                    spec.levels.map(
                        (level) =>
                            `Уровень ${level.level} (${level.cost === 0 ? "бесплатно" : `${level.cost} очк.`}): ${level.effectRu}`,
                    ),
                ),
                spec.noteRu,
                `Очки апгрейдов даёт доктрина (5 у Spymaster, 6 у Scout, ${MAX_AUGMENT_POINTS} у Battle Trance); они тратятся при подготовке армии перед расстановкой.`,
            ].join("\n\n"),
            tags: ["augment", "upgrade"],
            keywords: ["augment", "upgrade", "апгрейд", "усиление", ...spec.keywords],
            props: { levels: spec.levels.map((level) => `${level.level}:${level.cost}:${level.effect}`) },
        });
    }

    for (const doctrine of DOCTRINE_LIST) {
        graph.add({
            id: nodeId("doctrine", doctrine.name),
            type: "doctrine",
            section: "rules",
            name: doctrine.name,
            aliases: [`${doctrine.name} doctrine`],
            href: knowledgePath("en", { section: "rules", entry: "rules-doctrines" }),
            hrefRu: knowledgePath("ru", { section: "rules", entry: "rules-doctrines" }),
            summary: doctrine.description,
            summaryRu: doctrine.description,
            text: [
                `**${doctrine.name}** is a draft doctrine, the first pick-phase choice made simultaneously by both players.`,
                doctrine.description,
                `Reveal mode: ${doctrine.revealMode === "all" ? "see all of the opponent's picks" : doctrine.revealMode === "random3" ? "3 random opponent slots are revealed" : "nothing is revealed"}. Augment points: ${doctrine.upgradePoints}.`,
                "More vision costs points: the less you see of the opponent's draft, the larger your augment budget.",
            ].join("\n\n"),
            textRu: [
                `**${doctrine.name}** — доктрина драфта, первый выбор фазы пиков, который оба игрока делают одновременно.`,
                doctrine.description,
                `Режим раскрытия: ${doctrine.revealMode === "all" ? "видны все пики соперника" : doctrine.revealMode === "random3" ? "раскрываются 3 случайных слота соперника" : "ничего не раскрывается"}. Очки апгрейдов: ${doctrine.upgradePoints}.`,
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
        const sections = en.sections as RuleSectionCopy[];
        const sectionsRu = ru.sections as RuleSectionCopy[];
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
            `Placed ranked players are split into five leagues by MMR percentile, worst to best: ${copyEn.leagueNames.map((name, index) => `${index + 1}. ${name}`).join(", ")}. The top league is the top 5% of active placed players and its members carry a sequential leaderboard number.`,
            `Inside each league, players are also cut into three wealth tiers by season gold, poorest to richest: ${copyEn.wealthNames.join(", ")} (for example "Ragged Aspirant" or "Demigod Whale"). Wealth is derived from live gold balances and never stored.`,
            "Players in calibration have no league yet and show as Unranked; the ladder collapses everyone into the first league while fewer than 20 placed players are active.",
        ].join("\n\n"),
        textRu: [
            `Размещённые рейтинговые игроки делятся на пять лиг по процентилю MMR, от худшей к лучшей: ${copyRu.leagueNames.map((name, index) => `${index + 1}. ${name}`).join(", ")}. Высшая лига — это верхние 5% активных размещённых игроков; её участники получают порядковый номер в таблице лидеров.`,
            `Внутри каждой лиги игроки также делятся на три уровня богатства по золоту сезона, от беднейших к богатейшим: ${copyRu.wealthNames.join(", ")}. Уровень богатства считается по живому балансу золота и никогда не сохраняется.`,
            "Игроки на калибровке лиги ещё не имеют и показываются как Unranked; пока активных размещённых игроков меньше 20, все находятся в первой лиге.",
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
