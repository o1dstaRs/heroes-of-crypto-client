import {
    DEFAULT_SYNERGY_VARIANTS,
    SYNERGY_FACTION_ORDER,
    SynergyKeysToPower,
} from "@heroesofcrypto/common/src/synergies/synergy_properties";
import { getCreatureConfig, getSpellConfig } from "@heroesofcrypto/common/src/configuration/config_provider";
import { creatureInfo } from "@heroesofcrypto/common/src/ai/setup/creature_score";
import { tacticalSplitUnitFromUnit } from "@heroesofcrypto/common/src/ai/tactical_split_placement";
import { planA19SupportSplits } from "@heroesofcrypto/common/src/ai/support_setup";
import type { PremiumCatalog, PremiumLibrary, PremiumRow } from "./premium-library";
import { rankPremiumRows, escapePremiumHtml as e, premiumPercent as pct } from "./premium-library";
import { CREW_HISTORY_MINIMUM, type PremiumCrewHistory } from "./premium-crew-history";

export const CREW_SYNERGY_FACTIONS = SYNERGY_FACTION_ORDER;
export type CrewSynergyFaction = (typeof CREW_SYNERGY_FACTIONS)[number];
export type CrewSynergyVariants = Partial<Record<CrewSynergyFaction, 1 | 2>>;
const factionCode = { Life: 4, Nature: 3, Chaos: 1, Might: 2 };

export function normalizeCrewSynergyVariants(input: unknown): CrewSynergyVariants {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    const values = input as Record<string, unknown>;
    return Object.fromEntries(
        CREW_SYNERGY_FACTIONS.flatMap((faction) =>
            values[faction] === 1 || values[faction] === 2 ? [[faction, values[faction]]] : [],
        ),
    );
}

/** Recommendations compare the two variants at the same current level and in the same recorded population. */
export function resolveCrewSynergies(
    ids: readonly number[],
    catalog: PremiumCatalog,
    variants: CrewSynergyVariants = {},
    library?: PremiumLibrary | null,
    history?: PremiumCrewHistory,
) {
    const rows = history?.synergies.rows ?? library?.synergies ?? [];
    return CREW_SYNERGY_FACTIONS.map((faction) => {
        const count = [...new Set(ids)].filter((id) => catalog.units[id]?.faction === faction).length;
        const level = Math.min(3, Math.floor(count / 2));
        const matches = (row: PremiumRow) =>
            row.ids.length === 3 &&
            row.ids[0] === factionCode[faction] &&
            row.ids[2] === level &&
            [1, 2].includes(row.ids[1]);
        const local = rows.filter(matches);
        const broad = (library?.synergies ?? []).filter(matches);
        // Broaden only for better support coverage, never because another population has a higher score.
        const broader =
            !!history &&
            rankPremiumRows(broad, CREW_HISTORY_MINIMUM).length > rankPremiumRows(local, CREW_HISTORY_MINIMUM).length;
        const observed = broader ? broad : local;
        const contextUnits = broader ? [] : (history?.synergies.contextUnits ?? []);
        const recommended = rankPremiumRows(observed, CREW_HISTORY_MINIMUM)[0];
        const variant = variants[faction] ?? recommended?.ids[1] ?? DEFAULT_SYNERGY_VARIANTS[faction];
        return {
            faction,
            count,
            level,
            variant: variant as 1 | 2,
            power: level ? SynergyKeysToPower[`${faction}:${variant}:${level}`] : [],
            recommendedVariant: recommended?.ids[1] as 1 | 2 | undefined,
            rows: observed,
            contextUnits,
            contextNames: contextUnits.map((id) => catalog.units[id].name),
        };
    });
}
export type CrewResolvedSynergies = ReturnType<typeof resolveCrewSynergies>;

export function crewSynergyEffects(synergies: CrewResolvedSynergies) {
    const power = (faction: CrewSynergyFaction, variant: 1 | 2, index = 0) =>
        synergies.find((item) => item.faction === faction && item.variant === variant)?.power[index] ?? 0;
    return {
        supply: power("Life", 1),
        morale: power("Life", 2),
        luck: power("Life", 2, 1),
        movement: power("Chaos", 1),
        breakChance: power("Chaos", 2),
        auraRange: power("Might", 1),
        abilityPower: power("Might", 2),
        extraStacks: power("Nature", 1),
        flyingArmor: power("Nature", 2),
    };
}

/** Use the production support/decoy split planner with native creature and spell descriptors. */
export function crewSynergySplitPlans(
    ids: readonly number[],
    catalog: PremiumCatalog,
    synergies: CrewResolvedSynergies,
) {
    const effects = crewSynergyEffects(synergies);
    if (!effects.extraStacks) return [];
    const units = ids.map((id) => {
        const item = catalog.units[id],
            kit = item.kit!,
            info = creatureInfo(id)!;
        const native = getCreatureConfig(2, item.faction, item.name, "", kit.amount);
        return tacticalSplitUnitFromUnit({
            getId: () => String(id),
            getName: () => item.name,
            getAmountAlive: () => kit.amount,
            getLevel: () => item.level,
            isSmallSize: () => kit.width === 1 && kit.height === 1,
            isSummoned: () => false,
            getAttackType: () => native.attack_type,
            getSteps: () => kit.steps + (info.melee ? effects.movement : 0),
            getMaxHp: () => kit.hp,
            getAbilities: () =>
                native.abilities.map((name, index) => ({
                    getName: () => name,
                    getAuraEffectName: () => (native.abilities_auras[index] ? name : undefined),
                })),
            getSpells: () =>
                native.spells.map((entry) => {
                    const [faction, name, amount] = entry.split(":");
                    const spell = getSpellConfig(faction || "System", name);
                    return {
                        isRemaining: () => amount === undefined || Number(amount) > 0,
                        isBuff: () => spell.is_buff,
                        getMinimalCasterStackPower: () => spell.minimal_caster_stack_power,
                        getPowerType: () => spell.power_type,
                        getSpellTargetType: () => spell.spell_target_type,
                    };
                }),
        });
    });
    return planA19SupportSplits(units, 6 + effects.extraStacks);
}

export const crewSynergyVariantName = (faction: CrewSynergyFaction, variant: 1 | 2, lang: "en" | "ru") =>
    ({
        Life: lang === "ru" ? ["Численность", "Мораль и удача"] : ["More creatures", "Morale & luck"],
        Nature: lang === "ru" ? ["Дополнительные отряды", "Броня летающих"] : ["Extra stacks", "Flying armor"],
        Chaos: lang === "ru" ? ["Движение", "Слом при атаке"] : ["Movement", "Break on attack"],
        Might: lang === "ru" ? ["Радиус аур", "Сила способностей"] : ["Aura reach", "Ability power"],
    })[faction][variant - 1];

export function crewSynergyEvidenceNote(row?: PremiumRow) {
    return row
        ? `${(row.score * 100).toFixed(1)}% · n=${row.families} · 95%: ${(row.interval[0] * 100).toFixed(1)}%–${(row.interval[1] * 100).toFixed(1)}%`
        : "";
}

export function renderCrewSynergyChoices(own: CrewResolvedSynergies, enemy: CrewResolvedSynergies, lang: "en" | "ru") {
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    const names = {
        Life: t("Life", "Жизнь"),
        Nature: t("Nature", "Природа"),
        Chaos: t("Chaos", "Хаос"),
        Might: t("Might", "Сила"),
    };
    return (
        `<div class="premium-crew-synergy-heading"><h3>${t("Match synergies", "Синергии матча")}</h3><button type="button" class="premium-text-button" data-crew-synergies-recommended>${t("Use recommendations", "По рекомендациям")}</button></div><p class="premium-fine">${t("Applies to both armies. Ranked rolls one variant per faction; preview either here.", "Действует для обеих армий. В рейтинге вариант выпадает случайно; здесь можно проверить любой.")}</p>` +
        own
            .map((item) => {
                const opponent = enemy.find((other) => other.faction === item.faction)!;
                const next = Math.min(6, (item.level + 1) * 2);
                return `<section class="premium-crew-synergy-choice"><header><img src="/assets/images/units/factions/${item.faction.toLowerCase()}_128.webp" width="30" height="30" alt=""/><strong>${names[item.faction]}</strong><small>${t("You", "Вы")}: ${item.level ? `L${item.level}` : "—"} · ${t("Enemy", "Враг")}: ${opponent.level ? `L${opponent.level}` : "—"}</small></header><div role="group" aria-label="${e(names[item.faction])}">${(
                    [1, 2] as const
                )
                    .map((variant) => {
                        const row = item.rows.find((row) => row.ids[1] === variant);
                        const ownPower = item.level
                            ? SynergyKeysToPower[`${item.faction}:${variant}:${item.level}`]
                            : [];
                        const enemyPower = opponent.level
                            ? SynergyKeysToPower[`${item.faction}:${variant}:${opponent.level}`]
                            : [];
                        const effect = item.level
                            ? premiumCrewSynergyEffect(item.faction, variant, ownPower, lang)
                            : crewSynergyVariantName(item.faction, variant, lang);
                        const detail = [
                            item.contextNames.length
                                ? t("Armies with ", "Армии с ") + item.contextNames.join(", ")
                                : t(
                                      "All armies in the selected dataset and filters",
                                      "Все армии в выбранном наборе и фильтрах",
                                  ),
                            t("Your crew: ", "Ваша армия: ") +
                                (item.level
                                    ? premiumCrewSynergyEffect(item.faction, variant, ownPower, lang)
                                    : t("inactive", "не активна")),
                            t("Enemy: ", "Враг: ") +
                                (opponent.level
                                    ? premiumCrewSynergyEffect(item.faction, variant, enemyPower, lang)
                                    : t("inactive", "не активна")),
                            crewSynergyEvidenceNote(row),
                            t(
                                "Recorded whole-army association, not an isolated bonus comparison. Overlapping intervals remain uncertain.",
                                "Историческая связь с результатом всей армии, а не изолированное сравнение бонусов. Пересекающиеся интервалы не определяют победителя.",
                            ),
                        ]
                            .filter(Boolean)
                            .join(" · ");
                        return `<button type="button" data-crew-synergy="${item.faction}" data-crew-synergy-variant="${variant}" aria-pressed="${item.variant === variant}" data-premium-help="${e(detail)}" data-premium-help-title="${e(names[item.faction])}"><span>${e(effect)}${item.recommendedVariant === variant ? `<em>${t("Recommended", "Рекомендуется")}</em>` : ""}</span><small>${row ? `${pct(row.score)} · n=${row.families}${row.families < 50 ? ` · ${t("Small sample", "Малая выборка")}` : ""}` : item.level ? t("No recorded games", "Нет записанных боёв") : t("Not active for your crew", "В вашей армии не активна")}</small></button>`;
                    })
                    .join(
                        "",
                    )}</div>${item.count && item.level < 3 ? `<button type="button" class="premium-text-button premium-crew-faction-pick" data-crew-faction="${item.faction}">${t(`${next - item.count} more for L${item.level + 1} · pick next`, `Ещё ${next - item.count} до уровня ${item.level + 1} · выбрать`)} →</button>` : ""}</section>`;
            })
            .join("")
    );
}

export function premiumCrewSynergyEffect(faction: string, variant: number, power: number[], lang: "en" | "ru"): string {
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    const effects: Record<string, string[]> = {
        Life: [
            t(`+${power[0]}% supply`, `+${power[0]}% подкрепления`),
            t(`+${power[0]} morale, +${power[1]} luck`, `+${power[0]} мораль, +${power[1]} удача`),
        ],
        Nature: [
            t(`+${power[0]} board stacks`, `+${power[0]} стеков`),
            t(`+${power[0]}% flying armor`, `+${power[0]}% брони летающих`),
        ],
        Chaos: [
            t(`+${power[0]} movement`, `+${power[0]} движения`),
            t(`${power[0]}% Break on attack`, `${power[0]}% Слом при атаке`),
        ],
        Might: [
            t(`+${power[0]} aura range`, `+${power[0]} радиуса аур`),
            t(`+${power[0]}% ability power`, `+${power[0]}% силы способностей`),
        ],
    };
    return effects[faction]?.[variant - 1] ?? "";
}
