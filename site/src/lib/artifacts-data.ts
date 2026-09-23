// Army-wide artifacts chosen during the pick phase (one Tier 1 + one Tier 2 per team).
//
// DERIVED from the game, not mirrored by hand. This file used to carry its own copy of every effect string
// with the numbers already written in, and it silently went stale: a balance pass moved Rime Charm's proc
// 30% -> 60%, Helm of Focus 25% -> 35%, Giant's Maul 35% -> 40% and Iron Plate 0.7 -> 1, and the codex kept
// advertising the old figures. Reading the same ARTIFACT_POWER table the engine reads means the site cannot
// disagree with the game again, and a rebalance needs no edit here at all.

import {
    formatArtifactDescription,
    TIER1_ARTIFACT_LIST,
    TIER2_ARTIFACT_LIST,
    type ArtifactProperties,
} from "@heroesofcrypto/common/src/artifacts/artifact_properties";

export type ArtifactTier = 1 | 2;

export interface Artifact {
    tier: ArtifactTier;
    slug: string;
    name: string;
    icon: string;
    description: string;
    /** The same effect in Russian, with the same numbers. */
    descriptionRu: string;
    /** True for the "cursed" artifacts that carry a downside — surfaced as a small tag. */
    cursed?: boolean;
}

const icon = (tier: ArtifactTier, slug: string) => `/assets/images/artifacts/artifact_t${tier}_${slug}_256.webp`;

/**
 * The codex prints the effect on its own, so it drops the "Artifact." marker the in-game tooltip needs to
 * distinguish an artifact buff from a spell, and the trailing "Lasts till the end of the fight." line that
 * is true of every artifact and therefore says nothing on a page that lists only artifacts.
 */
const codexDescription = (props: ArtifactProperties): string =>
    formatArtifactDescription(props)
        .replace(/^Artifact\.\s*/, "")
        .replace(/\s*Lasts till the end of the fight\.\s*$/, "")
        .trim();

/**
 * Russian for each artifact's effect. The placeholders ({}, [], <>) are the game's own, in the order of the
 * English template, and they are filled with the numbers the game printed into the English text — so a
 * rebalance reaches the Russian page with no edit here, the same way it reaches the English one.
 */
const ARTIFACT_DESCRIPTIONS_RU: Record<string, string> = {
    veteran_helm: "Повышает защиту всей армии ещё на {}%.",
    amulet_of_resolve: "Повышает сопротивление армии эффектам Статуса на {}%.",
    keen_blade: "Повышает базовую атаку армии (дальнюю и ближнюю) на {}.",
    iron_plate: "Повышает базовую броню армии на {}.",
    swift_boots: "Увеличивает перемещение юнитов ближнего боя на {}% от их базовых шагов.",
    winged_boots: "Даёт всем летающим юнитам +{} к базовой дистанции перемещения и +[] к броне.",
    dual_strike_charm: "Вторая атака юнита наносит на {}% больше урона.",
    wounding_charm:
        "Даёт всей армии Deep Wounds Level 1: каждая атака или ответ добавляет цели +{}% к получаемому урону, эффект складывается.",
    cursed_ward: "Проклятие: +{} к удаче, но −[] к морали для всей армии.",
    hunters_longbow: "Стрелки получают +{} к атаке за каждого стрелка в армии.",
    helm_of_focus: "Повышает сопротивление армии эффектам Разума на {}%.",
    mages_ring: "Увеличивает весь магический урон армии на {}%.",
    warlords_edge: "Даёт всей армии дополнительно {}% к атаке.",
    titan_plate: "Даёт всей армии дополнительно {}% к защите (от ближних и дальних атак).",
    clover_of_fortune: "Повышает удачу армии на {}.",
    crown_of_command: "Даёт всей армии +{} к перемещению, +[] к морали и +<> к броне.",
    giants_maul:
        "Увеличивает немагический (физический) урон по площади на {}% в момент удара; затем он снижается сопротивлением цели эффектам Статуса.",
    pendant_of_vitality: "Проклятие: +{}% к здоровью, но −[]% к атаке для всей армии.",
    farsight_quiver: "Увеличивает базовую дальность выстрела всех союзных стрелков ещё на {}%.",
    berserkers_bond: "Проклятие: +{} к атаке, но −[] к защите для всей армии.",
    tome_of_amplification:
        "Усиливает на {}% баффы, которые союзные юниты накладывают заклинаниями на союзников. Не влияет на лечение, воскрешение, апгрейды, артефакты, ауры и пассивные эффекты.",
    rime_charm: "{}% шанс, что любая атака замедлит цель на [] кругов.",
    lava_striders:
        "Все юниты армии могут ходить по лаве и стоять в ней; на центральной лаве они получают Made of Fire (+10% ко всем характеристикам и способностям).",
    archmages_ring: "Увеличивает весь магический урон армии на {}%.",
};

const PLACEHOLDER = /\{\}|\[\]|<>/g;
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The numbers the game filled into an English template, in order ("by {}%." + "by 4%." → ["4"]). */
const filledValues = (template: string, filled: string): string[] | undefined =>
    new RegExp(`^${template.split(PLACEHOLDER).map(escapeRegExp).join("(.+?)")}$`).exec(filled)?.slice(1);

const pluralRu = (count: number, [one, few, many]: [string, string, string]): string => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
};

const russianDescription = (props: ArtifactProperties, english: string): string => {
    const template = ARTIFACT_DESCRIPTIONS_RU[props.slug];
    const values = filledValues(props.description, formatArtifactDescription(props));
    if (!template || !values) return english;
    let index = 0;
    return template
        .replace(PLACEHOLDER, () => values[index++] ?? "")
        .replace(/(\d+) кругов/g, (_, laps: string) => `${laps} ${pluralRu(Number(laps), ["круг", "круга", "кругов"])}`);
};

const toArtifact = (tier: ArtifactTier) => (props: ArtifactProperties) => ({
    tier,
    slug: props.slug,
    name: props.name,
    icon: icon(tier, props.slug),
    description: codexDescription(props),
    descriptionRu: russianDescription(props, codexDescription(props)),
    // The downside is stated by the effect text itself, so the tag follows it rather than being a second
    // fact to keep in sync.
    cursed: props.description.startsWith("Cursed:") || undefined,
});

// Both lists already exclude NO_ARTIFACT and anything disabled, so the codex shows exactly what a player
// can actually be offered in the pick phase.
export const artifacts: Artifact[] = [
    ...TIER1_ARTIFACT_LIST.map(toArtifact(1)),
    ...TIER2_ARTIFACT_LIST.map(toArtifact(2)),
];

export const artifactsCount = artifacts.length;
export const tier1Count = artifacts.filter((a) => a.tier === 1).length;
export const tier2Count = artifacts.filter((a) => a.tier === 2).length;
