import { portraitMarkup } from "./portrait";
import {
    escapePremiumHtml as e,
    premiumPercent as pct,
    rankPremiumRows,
    type PremiumCatalog,
    type PremiumLibrary,
    type PremiumRow,
    type PremiumSnapshot,
} from "./premium-library";
import type { PremiumView } from "./premium-render";

export function premiumInsightRows(library: PremiumLibrary, catalog: PremiumCatalog, minimum: number) {
    const threshold = Math.max(50, minimum);
    const ranked = (rows: PremiumRow[]) => rankPremiumRows(rows, threshold);
    const units = ranked(library.units).filter((row) => catalog.units[row.ids[0]]);
    return {
        threshold,
        unitLeaders: [1, 2, 3, 4].flatMap(
            (level) => units.find((row) => catalog.units[row.ids[0]].level === level) ?? [],
        ),
        unitLaggards: units
            .filter((row) => row.interval[1] < 0.5)
            .sort((a, b) => a.interval[1] - b.interval[1])
            .slice(0, 4),
        pairs: ranked(library.pairs).slice(0, 3),
        artifacts: ([1, 2] as const).flatMap((tier) =>
            ranked(tier === 1 ? library.artifactsTier1 : library.artifactsTier2)
                .filter((row) => catalog.artifacts[`${tier}:${row.key}`])
                .slice(0, 2)
                .map((row) => ({ tier, row })),
        ),
        synergies: [1, 2, 3].flatMap((level) => ranked(library.synergies).find((row) => row.ids[2] === level) ?? []),
        plans: ranked(library.plans).slice(0, 3),
    };
}

export function renderPremiumMeta(
    library: PremiumLibrary,
    catalog: PremiumCatalog,
    view: PremiumView,
    snapshot?: PremiumSnapshot,
): string {
    const t = (en: string, ru: string) => (view.lang === "ru" ? ru : en);
    const kb = (anchor: string) => `${view.lang === "ru" ? "/ru" : ""}/knowledge-base/#${e(anchor)}`;
    const rows = premiumInsightRows(library, catalog, view.minimum);
    const date =
        snapshot?.createdAt && Number.isFinite(Date.parse(snapshot.createdAt))
            ? new Date(snapshot.createdAt)
            : undefined;
    const leaders = rows.unitLeaders;
    const clear = leaders.filter((row) => row.interval[0] > 0.5);
    const summary = clear.length
        ? t(
              `${clear.map((row) => catalog.units[row.ids[0]].name).join(" and ")} ${clear.length === 1 ? "shows a stronger result at its draft level" : "show stronger results at their draft levels"}.`,
              `${clear.map((row) => catalog.units[row.ids[0]].name).join(" и ")} ${clear.length === 1 ? "показывает хороший результат на своём уровне" : "показывают хорошие результаты на своих уровнях"}.`,
          )
        : t(
              "Results are close. These are the leading options at each draft level.",
              "Результаты близки. Ниже — ведущие варианты на каждом уровне драфта.",
          );
    const units = leaders
        .map((row) => {
            const id = row.ids[0],
                item = catalog.units[id];
            return `<article class="premium-meta-unit"><a href="${kb(item.anchor)}" class="premium-meta-unit-link">${portraitMarkup(item.slug, item.name, { className: "premium-portrait", eager: true })}<span><small>${t("LEVEL", "УРОВЕНЬ")} ${item.level}</small><strong>${e(item.name)}</strong><span>${e(item.faction)}</span></span><b>${pct(row.score)}<small>${t("battle score", "результат боёв")}</small></b></a>${item.kit && !item.kit.amount ? "" : `<button type="button" data-add-crew="${id}" class="premium-meta-add" aria-label="${e(t(`Add ${item.name} to crew`, `Добавить ${item.name} в армию`))}">+ ${t("Add to crew", "В армию")}</button>`}</article>`;
        })
        .join("");
    const artifacts = ([1, 2] as const)
        .flatMap((tier) => rows.artifacts.find((item) => item.tier === tier) ?? [])
        .map(({ tier, row }) => {
            const item = catalog.artifacts[`${tier}:${row.key}`];
            return `<a class="premium-meta-artifact" href="${kb(item.anchor)}"><img src="${e(item.icon)}" alt="" width="46" height="46"/><span><small>${t("Tier", "Уровень")} ${tier}</small><strong>${e(item.name)}</strong></span><b>${pct(row.score)}</b></a>`;
        })
        .join("");
    return `<section id="premium-overview" class="premium-section premium-meta"><header class="premium-section-heading"><span>01</span><div><h2>${t("Current meta", "Текущая мета")}</h2><p>${summary}</p></div></header><div class="premium-meta-units">${units || `<p class="premium-empty">${t("Not enough battles for this selection. Try all battlefields.", "Недостаточно боёв. Выберите все поля боя.")}</p>`}</div>
        ${artifacts ? `<div class="premium-meta-artifacts"><span>${t("Leading artifacts", "Ведущие артефакты")}</span>${artifacts}</div>` : ""}
        <p class="premium-meta-source">${date ? `${t("Simulated battles", "Симуляции боёв")} · <time datetime="${date.toISOString()}">${new Intl.DateTimeFormat(view.lang, { dateStyle: "medium", timeZone: "UTC" }).format(date)}</time>` : t("Based on the selected simulated battles", "По выбранным симуляциям боёв")}${snapshot?.status === "development" ? t(" · Earlier balance version", " · Предыдущая версия баланса") : ""} · <a href="#premium-evidence">${t("About the data", "О данных")}</a></p>
        <details class="premium-crew-notes"><summary>${t("How these picks were ranked", "Как составлен рейтинг")}</summary><p>${t(`Compared within draft level using at least ${rows.threshold} battle pairs. Each pair swaps sides. A cautious ranking accounts for uncertainty. Overlapping intervals do not establish a winner. Scores belong to the whole army.`, `Сравнение внутри уровня по ${rows.threshold} и более парам боёв со сменой сторон. Рейтинг учитывает неопределённость; близкие результаты не доказывают превосходства. Счёт отражает результат всей армии.`)}</p>${snapshot?.status === "development" ? `<p>${t("These battles predate later balance changes and do not measure today’s human ranked games.", "Эти бои не учитывают поздние изменения баланса и не описывают сегодняшние рейтинговые игры людей.")}</p>` : ""}</details></section>`;
}
