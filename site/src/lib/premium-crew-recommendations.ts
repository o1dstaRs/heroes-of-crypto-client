import { SynergyKeysToPower } from "@heroesofcrypto/common/src/synergies/synergy_properties";
import {
    CREW_LEVELS,
    premiumCrewArtifactBenefit,
    premiumCrewSlots,
    premiumCrewSynergies,
    premiumCrewSynergyEffect,
} from "./premium-crew";
import { rankPremiumCrewPicks } from "./premium-crew-picks";
import type { PremiumCrewHistory } from "./premium-crew-history";
import {
    escapePremiumHtml as e,
    premiumPercent as pct,
    rankPremiumRows,
    type PremiumCatalog,
    type PremiumLibrary,
    type PremiumRow,
} from "./premium-library";
import { portraitMarkup } from "./portrait";
import type { CrewSynergyVariants } from "./premium-crew-synergies";

export const CREW_RECOMMENDATION_CATEGORIES = ["units", "pairs", "triples", "artifacts", "synergies"] as const;
export type CrewRecommendationCategory = (typeof CREW_RECOMMENDATION_CATEGORIES)[number];
type Lang = "en" | "ru";

/** Reserve every requested unit before choosing replacements, keeping the rest of the six draft slots. */
export function premiumCrewComboDraft(
    own: readonly number[],
    picks: readonly number[],
    catalog: PremiumCatalog,
    activeSlot = 0,
) {
    if (
        !picks.length ||
        picks.length > 3 ||
        new Set(picks).size !== picks.length ||
        picks.some((id) => !Number.isSafeInteger(id) || !catalog.units[id]?.kit?.amount)
    )
        return;
    for (const level of CREW_LEVELS)
        if (
            picks.filter((id) => catalog.units[id].level === level).length >
            CREW_LEVELS.filter((value) => value === level).length
        )
            return;
    const slots = premiumCrewSlots(own, catalog);
    const replaced: number[] = [];
    for (const id of picks) {
        if (slots.includes(id)) continue;
        const legal = CREW_LEVELS.flatMap((level, index) =>
            level === catalog.units[id].level && !picks.includes(slots[index]!) ? [index] : [],
        );
        const slot =
            legal.find((index) => slots[index] === undefined) ?? (legal.includes(activeSlot) ? activeSlot : legal[0]);
        if (slot === undefined) return;
        if (slots[slot] !== undefined) replaced.push(slots[slot]!);
        slots[slot] = id;
    }
    return { ids: slots.filter((id): id is number => id !== undefined), replaced };
}

export function premiumCrewComboRecommendations(
    own: readonly number[],
    arity: 2 | 3,
    catalog: PremiumCatalog,
    library: PremiumLibrary | null | undefined,
    minimum: number,
    activeSlot = 0,
) {
    const ranked = rankPremiumRows((arity === 2 ? library?.pairs : library?.triples) ?? [], minimum).filter(
        (row) =>
            row.ids.length === arity &&
            !row.ids.every((id) => own.includes(id)) &&
            premiumCrewComboDraft(own, row.ids, catalog, activeSlot),
    );
    const connected = ranked.filter((row) => row.ids.some((id) => own.includes(id)));
    const changes = new Set<string>();
    const rows = (connected.length ? connected : ranked)
        .filter((row) => {
            const draft = premiumCrewComboDraft(own, row.ids, catalog, activeSlot)!;
            const key = [...draft.ids].sort((a, b) => a - b).join(",");
            if (changes.has(key)) return false;
            changes.add(key);
            return true;
        })
        .slice(0, 3);
    return { withCrew: connected.length > 0, rows };
}

const factions: Record<number, string> = { 1: "Chaos", 2: "Might", 3: "Nature", 4: "Life" };
const factionRu: Record<string, string> = { Chaos: "Хаос", Might: "Сила", Nature: "Природа", Life: "Жизнь" };

export function premiumCrewSynergyRecommendations(
    own: readonly number[],
    catalog: PremiumCatalog,
    rows: PremiumRow[],
    minimum: number,
) {
    const current = premiumCrewSynergies(own, catalog);
    return rankPremiumRows(rows, minimum)
        .flatMap((row) => {
            const [code, variant, level] = row.ids;
            const faction = factions[code];
            if (!faction || ![1, 2].includes(variant) || ![1, 2, 3].includes(level)) return [];
            const count = current.find((item) => item.faction === faction)?.count ?? 0;
            const currentLevel = current.find((item) => item.faction === faction)?.level ?? 0;
            if (level < currentLevel || level > currentLevel + 1) return [];
            const capacity = [1, 2, 3, 4].reduce(
                (sum, unitLevel) =>
                    sum +
                    Math.min(
                        CREW_LEVELS.filter((value) => value === unitLevel).length,
                        Object.values(catalog.units).filter(
                            (unit) => unit.kit?.amount && unit.level === unitLevel && unit.faction === faction,
                        ).length,
                    ),
                0,
            );
            if (level * 2 > capacity) return [];
            return [
                {
                    row,
                    faction,
                    variant,
                    level,
                    count,
                    needed: Math.max(0, level * 2 - count),
                    power: SynergyKeysToPower[`${faction}:${variant}:${level}`] ?? [],
                },
            ];
        })
        .slice(0, 3);
}

export function renderPremiumCrewRecommendations(
    own: readonly number[],
    activeSlot: number,
    category: CrewRecommendationCategory,
    catalog: PremiumCatalog,
    library: PremiumLibrary | null | undefined,
    lang: Lang,
    minimum = 50,
    history?: PremiumCrewHistory,
    equipped?: readonly number[],
    synergyVariants?: CrewSynergyVariants,
) {
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    const labels = {
        units: t("Units", "Юниты"),
        pairs: t("Pairs", "Пары"),
        triples: t("Trios", "Тройки"),
        artifacts: t("Artifacts", "Артефакты"),
        synergies: t("Synergies", "Синергии"),
    };
    const reference = (item: PremiumCatalog["units"][string]) =>
        `<a class="premium-pick-portrait" href="${lang === "ru" ? "/ru" : ""}/knowledge-base/#${e(item.anchor)}" aria-label="${e(item.name)}">${portraitMarkup(item.slug, item.name, { className: "premium-portrait", eager: true })}</a>`;
    const stats = (row: PremiumRow) =>
        `<span class="premium-pick-score" data-premium-help="${e(t(`Observed army score. ${row.families} independent battle pairs. 95% interval ${pct(row.interval[0])}–${pct(row.interval[1])}. This is not a win forecast against your enemy.`, `Результат армий в ${row.families} независимых парах боёв. 95% интервал ${pct(row.interval[0])}–${pct(row.interval[1])}. Это не прогноз против выбранного врага.`))}" tabindex="0"><strong>${pct(row.score)}</strong><small>n=${row.families}</small>${row.families < 50 ? `<small class="premium-pick-small-sample">${t("Small sample", "Малая выборка")}</small>` : ""}</span>`;
    const population = (ids: number[]) =>
        ids.length
            ? t("With ", "Вместе с ") + ids.map((id) => catalog.units[id].name).join(", ")
            : t("All armies in the selected data and filters", "Все армии в выбранном наборе и фильтрах");
    const comboCard = (row: PremiumRow, arity: 1 | 2 | 3) => {
        const draft = premiumCrewComboDraft(own, row.ids, catalog, activeSlot)!;
        const selected = row.ids.every((id) => own.includes(id));
        const names = row.ids.map((id) => catalog.units[id].name).join(" + ");
        const change = draft.replaced.length
            ? t("Replaces ", "Заменит ") + draft.replaced.map((id) => catalog.units[id].name).join(", ")
            : selected
              ? t("Already in your crew", "Уже в вашей армии")
              : t("Fills open slots", "Заполнит свободные слоты");
        return `<article class="premium-pick"><div class="premium-pick-icons">${row.ids.map((id) => reference(catalog.units[id])).join("")}</div>${stats(row)}<strong class="premium-pick-name">${e(names)}</strong><p>${e(change)}</p><button type="button" class="premium-text-button" data-crew-combo="${row.ids.join(",")}" ${selected ? "disabled" : ""} aria-label="${e(`${names} · ${change}`)}">${selected ? t("In crew", "В армии") : arity === 1 ? t("Pick unit", "Выбрать юнита") : arity === 2 ? t("Use pair", "Выбрать пару") : t("Use trio", "Выбрать тройку")} ${selected ? "✓" : "→"}</button></article>`;
    };
    let cards = "",
        scope = "",
        seeAll = "#premium-units";
    if (category === "units") {
        const picks = rankPremiumCrewPicks(own, activeSlot, catalog, library, lang, history).filter(
            (pick) => !pick.selected && pick.evidence,
        );
        const rows = rankPremiumRows(
            picks.map((pick) => pick.evidence!),
            minimum,
        ).slice(0, 3);
        cards = rows.map((row) => comboCard(row, 1)).join("");
        scope = `${t("Level", "Уровень")} ${CREW_LEVELS[activeSlot]} · ${population(history?.slots[activeSlot]?.contextUnits ?? [])}`;
    } else if (category === "pairs" || category === "triples") {
        const arity = category === "pairs" ? 2 : 3;
        const choices = premiumCrewComboRecommendations(own, arity, catalog, library, minimum, activeSlot);
        cards = choices.rows.map((row) => comboCard(row, arity)).join("");
        scope = choices.withCrew
            ? t(
                  "Recorded combinations with at least one of your picks",
                  "Записанные сочетания хотя бы с одним вашим юнитом",
              )
            : population([]);
        seeAll = "#premium-combos";
    } else if (category === "artifacts") {
        cards = ([1, 2] as const)
            .map((tier) => {
                const group = history?.artifacts.find((item) => item.tier === tier);
                const rows = rankPremiumRows(
                    group?.rows ?? (tier === 1 ? library?.artifactsTier1 : library?.artifactsTier2) ?? [],
                    minimum,
                )
                    .filter(
                        (row) =>
                            catalog.artifacts[`${tier}:${row.ids[0]}`] &&
                            premiumCrewArtifactBenefit(catalog.artifacts[`${tier}:${row.ids[0]}`].slug, own, lang).names
                                .length,
                    )
                    .slice(0, 3);
                return `<div class="premium-pick-tier"><h4>${t("Tier", "Уровень")} ${tier}</h4>${
                    rows
                        .map((row) => {
                            const id = row.ids[0],
                                item = catalog.artifacts[`${tier}:${id}`],
                                selected = equipped?.[tier - 1] === id;
                            return `<article class="premium-pick premium-pick-artifact"><a class="premium-pick-artifact-icon" href="${lang === "ru" ? "/ru" : ""}/knowledge-base/#${e(item.anchor)}"><img src="${e(item.icon)}" width="42" height="42" alt="${e(item.name)}"/></a>${stats(row)}<strong class="premium-pick-name">${e(item.name)}</strong><p>${e(premiumCrewArtifactBenefit(item.slug, own, lang).label)}</p><button type="button" class="premium-text-button" data-crew-artifact-tier="${tier}" data-crew-artifact="${id}" aria-pressed="${selected}">${selected ? t("Equipped ✓", "Выбран ✓") : t("Equip", "Выбрать")} </button></article>`;
                        })
                        .join("") || `<p class="premium-fine">${t("No supported choices", "Недостаточно данных")}</p>`
                }<p class="premium-pick-population">${e(population(group?.contextUnits ?? []))}</p></div>`;
            })
            .join("");
        scope = t(
            "Applicable artifacts · one per tier · click to equip",
            "Подходящие артефакты · один на уровень · нажмите для выбора",
        );
        seeAll = "#premium-artifacts";
    } else {
        const group = history?.synergies;
        cards = premiumCrewSynergyRecommendations(own, catalog, group?.rows ?? library?.synergies ?? [], minimum)
            .map(({ row, faction, variant, level, count, needed, power }) => {
                const name = lang === "ru" ? factionRu[faction] : faction;
                const effect = premiumCrewSynergyEffect(faction, variant, power, lang);
                return `<article class="premium-pick"><a class="premium-pick-artifact-icon" href="${lang === "ru" ? "/ru" : ""}/knowledge-base/#rule-synergies"><img src="/assets/images/units/factions/${faction.toLowerCase()}_128.webp" width="42" height="42" alt="${e(name)}"/></a>${stats(row)}<strong class="premium-pick-name">${e(name)} · L${level} · ${t("Variant", "Вариант")} ${variant}</strong><p>${e(effect)}</p><small>${needed ? e(t(`${count} picked · ${needed} more needed`, `Выбрано ${count} · нужно ещё ${needed}`)) : t("Active faction level", "Уровень фракции активен")}</small><button type="button" class="premium-text-button" data-crew-synergy="${faction}" data-crew-synergy-variant="${variant}" aria-pressed="${synergyVariants?.[faction as keyof CrewSynergyVariants] === variant}">${synergyVariants?.[faction as keyof CrewSynergyVariants] === variant ? t("Selected variant ✓", "Вариант выбран ✓") : t("Preview variant", "Выбрать вариант")}</button>${needed ? `<button type="button" class="premium-text-button" data-crew-faction="${faction}">${e(t(`Choose ${faction} units`, `Выбрать юнитов: ${name}`))} →</button>` : `<span class="premium-pick-active">${t("Level active", "Уровень активен")}</span>`}</article>`;
            })
            .join("");
        scope =
            population(group?.contextUnits ?? []) +
            " · " +
            t("One variant is rolled per faction in a match", "В матче выпадает один вариант каждой фракции");
        seeAll = "#premium-synergies";
    }
    return `<header class="premium-picks-heading"><h3>${t("Best next picks", "Что выбрать дальше")}</h3><a href="${seeAll}">${t("All results", "Все результаты")} →</a></header><div class="premium-picks-tabs" role="group" aria-label="${t("Pick suggestions", "Рекомендации для выбора")}">${CREW_RECOMMENDATION_CATEGORIES.map((key) => `<button type="button" data-crew-recommendation="${key}" aria-pressed="${category === key}">${labels[key]}</button>`).join("")}</div><p class="premium-picks-scope">${e(scope)}</p><div class="premium-picks-results${category === "artifacts" ? " premium-picks-artifacts" : ""}">${cards || `<p class="premium-fine">${t(`No choices meet ${minimum}+ battle pairs for these picks and filters.`, `Нет подходящих вариантов с ${minimum}+ парами боёв для этих юнитов и фильтров.`)}</p>${library && minimum > 1 ? `<button type="button" class="premium-text-button" data-crew-recommendation-minimum="${minimum === 50 ? 20 : 1}">${t(`Compare ${minimum === 50 ? 20 : 1}+ battle pairs instead`, `Сравнить от ${minimum === 50 ? 20 : 1} пар боёв`)} →</button>` : ""}`}</div><p class="premium-picks-footnote">${t("Observed army scores · cautious ranking · hover for uncertainty", "Результаты записанных армий · ранжирование с учётом неопределённости · интервал при наведении")}</p>`;
}
