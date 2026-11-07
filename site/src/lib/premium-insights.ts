import { portraitMarkup } from "./portrait";
import {
    escapePremiumHtml as e,
    premiumPercent as pct,
    rankPremiumRows,
    type PremiumCatalog,
    type PremiumLibrary,
    type PremiumRow,
} from "./premium-library";
import type { PremiumView } from "./premium-render";

const text = (view: PremiumView) => (en: string, ru: string) => (view.lang === "ru" ? ru : en);
const support = (row: PremiumRow, view: PremiumView) =>
    `${row.families.toLocaleString(view.lang)} ${text(view)("battle pairs", "пар боёв")} · 95% ${pct(row.interval[0])}–${pct(row.interval[1])}`;
const kb = (anchor: string, view: PremiumView) => `${view.lang === "ru" ? "/ru" : ""}/knowledge-base/#${anchor}`;
const signal = (row: PremiumRow, view: PremiumView) =>
    row.interval[0] > 0.5
        ? text(view)("Above 50% in this population", "Выше 50% в этой выборке")
        : row.interval[1] < 0.5
          ? text(view)("Below 50% in this population", "Ниже 50% в этой выборке")
          : text(view)("Advantage unresolved", "Преимущество не установлено");
const reading = (name: string, row: PremiumRow, view: PremiumView) =>
    `<li><div><strong>${name}</strong><small>${e(support(row, view))}</small><small>${e(signal(row, view))}</small></div><b>${pct(row.score)}</b></li>`;

export { premiumInsightRows, renderPremiumMeta as renderPremiumInsights } from "./premium-meta";

export function premiumUnitMatchups(library: PremiumLibrary, ownUnit: number, minimum: number) {
    const rows = (library.matchups ?? []).filter((row) => row.ids[0] === ownUnit && row.families >= minimum);
    return {
        favorable: rows
            .filter((row) => row.interval[0] > 0.5)
            .sort((a, b) => b.interval[0] - a.interval[0])
            .slice(0, 4),
        difficult: rows
            .filter((row) => row.interval[1] < 0.5)
            .sort((a, b) => a.interval[1] - b.interval[1])
            .slice(0, 4),
        unresolved: rows
            .filter((row) => row.interval[0] <= 0.5 && row.interval[1] >= 0.5)
            .sort((a, b) => b.families - a.families)
            .slice(0, 6),
    };
}

export function renderPremiumMatchups(library: PremiumLibrary, catalog: PremiumCatalog, view: PremiumView): string {
    const t = text(view);
    const units = rankPremiumRows(library.units, 1).filter((row) => catalog.units[row.ids[0]]);
    const selected = units.find((row) => row.ids[0] === view.matchupUnit) ?? units[0];
    const own = selected && catalog.units[selected.ids[0]];
    const header = `<header class="premium-section-heading"><span>04</span><div><h2>${t("Unit matchups", "Противостояния юнитов")}</h2><p>${t("These results compare full armies that contained the two units on opposite sides. Other units and upgrades also affect the result.", "Здесь сравниваются результаты армий, в которых эти юниты были по разные стороны. На результат также влияют другие юниты и усиления.")}</p></div></header>`;
    if (!own || !selected)
        return (
            header +
            `<p class="premium-empty">${t("No matching unit observations.", "Нет подходящих наблюдений по юнитам.")}</p>`
        );
    const controls = `<label class="premium-matchup-select">${t("Choose a unit", "Выберите юнита")}<select data-matchup-unit>${[
        ...units,
    ]
        .sort(
            (a, b) =>
                catalog.units[a.ids[0]].level - catalog.units[b.ids[0]].level ||
                catalog.units[a.ids[0]].name.localeCompare(catalog.units[b.ids[0]].name),
        )
        .map(
            (row) =>
                `<option value="${row.ids[0]}" ${row.ids[0] === selected.ids[0] ? "selected" : ""}>L${catalog.units[row.ids[0]].level} · ${e(catalog.units[row.ids[0]].name)}</option>`,
        )
        .join("")}</select></label>`;
    if (!library.matchups)
        return (
            header +
            controls +
            `<p class="premium-empty">${t("Matchup breakdowns are not available from this server yet. General unit outcomes remain available below.", "Этот сервер пока не предоставляет разбор противостояний. Общие результаты юнитов доступны ниже.")}</p>`
        );
    const groups = premiumUnitMatchups(library, selected.ids[0], view.minimum);
    const group = (heading: string, rows: PremiumRow[], noResult: string) =>
        `<article class="premium-insight-card"><h3>${heading}</h3>${
            rows.length
                ? `<ul>${rows
                      .map((row) => {
                          const enemy = catalog.units[row.ids[1]];
                          return reading(
                              enemy ? `<a href="${kb(e(enemy.anchor), view)}">${e(enemy.name)}</a>` : `#${row.ids[1]}`,
                              row,
                              view,
                          );
                      })
                      .join("")}</ul>`
                : `<p>${noResult}</p>`
        }</article>`;
    return (
        header +
        controls +
        `<div class="premium-matchup-context">${portraitMarkup(own.slug, own.name, { className: "premium-portrait" })}<div><strong>${e(own.name)} · ${pct(selected.score)}</strong><p>${t("Overall observed score in this population", "Общий наблюдаемый результат в этой выборке")} · ${e(support(selected, view))}</p></div></div><div class="premium-insight-grid premium-matchup-grid">${group(t("Favorable observations", "Благоприятные результаты"), groups.favorable, t("No matchup has a full 95% interval above 50% at this threshold.", "Ни у одного противостояния весь 95% интервал не выше 50% при этом пороге."))}${group(t("Difficult observations", "Сложные противостояния"), groups.difficult, t("No matchup has a full 95% interval below 50% at this threshold.", "Ни у одного противостояния весь 95% интервал не ниже 50% при этом пороге."))}${group(t("Still uncertain", "Пока не определено"), groups.unresolved, t("No additional matchups meet the sample threshold.", "Нет других противостояний с достаточной выборкой."))}</div><p class="premium-fine">${t("Score = win + half a draw. Support counts independent seat-paired families. Intervals are pointwise, not corrected for inspecting many opponents. Missing evidence does not mean a unit is weak.", "Результат = победа + половина ничьей. Выборка считается по независимым семействам со сменой сторон. Интервалы относятся к отдельным сравнениям, без поправки на множество противников. Отсутствие данных не означает слабость юнита.")}</p>`
    );
}
