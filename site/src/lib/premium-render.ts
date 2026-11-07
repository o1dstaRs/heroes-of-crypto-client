import { portraitMarkup } from "./portrait";
import { premiumGuides } from "./premium-copy";
import { renderPremiumInsights, renderPremiumMatchups } from "./premium-insights";
import {
    escapePremiumHtml as e,
    premiumPercent as pct,
    premiumPlanLevels,
    rankPremiumRows,
    type PremiumCatalog,
    type PremiumLibraryResponse,
    type PremiumRow,
} from "./premium-library";

export interface PremiumView {
    lang: "en" | "ru";
    minimum: number;
    search: string;
    level: string;
    sort: string;
    combo: "pairs" | "triples";
    tier: 1 | 2;
    matchupUnit?: number;
}
const translate = (view: PremiumView) => (en: string, ru: string) => (view.lang === "ru" ? ru : en);
const title = (number: string, heading: string, subtitle: string) =>
    `<header class="premium-section-heading"><span>${number}</span><div><h2>${heading}</h2><p>${subtitle}</p></div></header>`;
const empty = (text: string) => `<p class="premium-empty">${text}</p>`;
const count = (n: number) => n.toLocaleString("en-US");
const unit = (catalog: PremiumCatalog, id: number) =>
    catalog.units[id] ?? {
        name: `#${id}`,
        slug: "unknown_creature",
        faction: "",
        level: 0,
        anchor: "unit-unknown-creature",
    };
const unitName = (catalog: PremiumCatalog, row: PremiumRow) => row.ids.map((id) => unit(catalog, id).name).join(" + ");
const portraits = (catalog: PremiumCatalog, row: PremiumRow) =>
    `<span class="premium-portraits">${row.ids
        .map((id) => {
            const item = unit(catalog, id);
            return portraitMarkup(item.slug, item.name, { className: "premium-portrait", title: item.name });
        })
        .join("")}</span>`;
const interval = (row: PremiumRow, view: PremiumView) => {
    const label = `${pct(row.score)}; 95% ${translate(view)("interval", "интервал")} ${pct(row.interval[0])}–${pct(row.interval[1])}`;
    return `<svg class="premium-interval" viewBox="0 0 200 24" role="img" aria-label="${e(label)}"><title>${e(label)}</title><path class="interval-track" d="M6 12H194"/><path class="interval-reference" d="M100 3V21"/><path class="interval-range" d="M${6 + row.interval[0] * 188} 12H${6 + row.interval[1] * 188}"/><circle cx="${6 + row.score * 188}" cy="12" r="4"/></svg>`;
};
const support = (row: PremiumRow, view: PremiumView) =>
    `${count(row.families)} ${translate(view)("families", "семейств")}${row.families < 50 ? ` · ${translate(view)("limited", "мало данных")}` : ""}`;
const kb = (view: PremiumView, hash: string) => `${view.lang === "ru" ? "/ru" : ""}/knowledge-base/#${hash}`;

export function renderPremiumUnits(rows: PremiumRow[], catalog: PremiumCatalog, view: PremiumView): string {
    const t = translate(view);
    const visible = rankPremiumRows(rows, view.minimum, view.sort).filter((row) => {
        const item = unit(catalog, row.ids[0]);
        return (
            (!view.level || String(item.level) === view.level) &&
            `${item.name} ${item.faction}`.toLowerCase().includes(view.search.trim().toLowerCase())
        );
    });
    if (!visible.length)
        return empty(
            t(
                "No units match these filters. Try another level, search or minimum sample size.",
                "Нет юнитов с такими фильтрами. Измените уровень, поиск или минимальную выборку.",
            ),
        );
    const units = visible.map((row, index) => {
        const item = unit(catalog, row.ids[0]);
        const href = kb(view, e(item.anchor));
        const identity = `${portraits(catalog, row)}<span><strong>${e(item.name)}</strong><small>${e(item.faction)} · L${item.level}</small></span>`;
        const score = pct(row.score);
        const bounds = `${pct(row.interval[0])}–${pct(row.interval[1])}`;
        const frequency = pct(row.frequency);
        const limited =
            row.families < 50 ? `<small class="premium-limited">${t("Limited", "Мало данных")}</small>` : "";
        return {
            table: `<tr><td class="premium-rank">${String(index + 1).padStart(2, "0")}</td><td><a class="premium-unit-cell" href="${href}">${identity}</a></td><td class="premium-score">${score}</td><td>${interval(row, view)}<small>${bounds}</small></td><td>${frequency}</td><td>${count(row.families)}${limited}</td></tr>`,
            compact: `<li><details class="premium-unit-details"><summary>
                <span class="premium-unit-cell">${identity}</span>
                <span class="premium-unit-result"><span class="sr-only">${t("Observed score", "Наблюдаемый счёт")} </span><strong class="premium-score">${score}</strong><small>${count(row.families)} ${t("families", "семейств")}</small>${limited}</span>
            </summary><dl>
                <div><dt>${t("95% interval", "95% интервал")}</dt><dd>${bounds}</dd></div>
                <div><dt>${t("Army share", "Доля армий")}</dt><dd>${frequency}</dd></div>
            </dl><a class="premium-unit-guide" href="${href}">${t("Unit guide", "Описание юнита")} ↗</a></details></li>`,
        };
    });
    return `<div class="premium-table-scroll premium-unit-table"><table class="premium-table"><caption class="sr-only">${t("Unit outcomes in the selected snapshot and environment", "Результаты юнитов в выбранной выборке")}</caption><thead><tr><th>#</th><th>${t("Unit / faction", "Юнит / фракция")}</th><th>${t("Observed score", "Наблюдаемый счёт")}</th><th>${t("95% interval", "95% интервал")}</th><th>${t("Army share", "Доля армий")}</th><th>${t("Families", "Семейства")}</th></tr></thead><tbody>${units.map(({ table }) => table).join("")}</tbody></table></div><ul class="premium-unit-list" aria-label="${t("Unit rankings", "Рейтинги юнитов")}">${units.map(({ compact }) => compact).join("")}</ul>`;
}
function scatter(rows: PremiumRow[], catalog: PremiumCatalog, view: PremiumView): string {
    const t = translate(view);
    const visible = rankPremiumRows(rows, view.minimum);
    if (!visible.length)
        return empty(t("No units meet the selected sample threshold.", "Нет юнитов с достаточной выборкой."));
    const max = Math.max(0.1, ...visible.map((row) => row.frequency)) * 1.12;
    return `<svg class="premium-scatter" viewBox="0 0 680 330" role="img" aria-label="${t("Army share versus observed score. Exact values are in the unit table below.", "Доля армий и наблюдаемый счёт. Точные значения в таблице ниже.")}"><title>${t("Army share versus observed score", "Доля армий и наблюдаемый счёт")}</title>${[0, 0.25, 0.5, 0.75, 1].map((value) => `<path class="chart-grid" d="M58 ${278 - value * 232}H646"/><text x="46" y="${282 - value * 232}" text-anchor="end">${value * 100}%</text>`).join("")}${[0, 1, 2, 3, 4].map((step) => `<text x="${58 + step * 147}" y="300" text-anchor="middle">${pct((step / 4) * max)}</text>`).join("")}<text x="58" y="19" class="chart-label">${t("OBSERVED SCORE", "НАБЛЮДАЕМЫЙ СЧЁТ")}</text><text x="646" y="324" text-anchor="end" class="chart-label">${t("SHARE OF SAMPLED ARMIES →", "ДОЛЯ АРМИЙ В ВЫБОРКЕ →")}</text>${visible.map((row, index) => `<a href="${kb(view, e(unit(catalog, row.ids[0]).anchor))}" aria-label="${e(unitName(catalog, row))}: ${pct(row.score)}; ${support(row, view)}; ${pct(row.frequency)} ${t("army share", "доля армий")}"><circle class="scatter-dot ${index < 3 ? "scatter-leader" : ""}" cx="${58 + (row.frequency / max) * 588}" cy="${278 - row.score * 232}" r="${index < 3 ? 6 : 4}"><title>${e(unitName(catalog, row))}: ${pct(row.score)} · ${support(row, view)} · ${pct(row.frequency)} ${t("army share", "доля армий")}</title></circle></a>`).join("")}</svg><div class="premium-chart-legend">${visible
        .slice(0, 3)
        .map((row) => `<span>● ${e(unitName(catalog, row))} <b>${pct(row.score)}</b></span>`)
        .join("")}</div>`;
}
function network(rows: PremiumRow[], catalog: PremiumCatalog, view: PremiumView): string {
    const t = translate(view);
    const pairs = rankPremiumRows(rows, view.minimum).slice(0, 12);
    const ids = [...new Set(pairs.flatMap((row) => row.ids))].slice(0, 8);
    if (ids.length < 2)
        return empty(t("No supported connections at this sample threshold.", "При этом пороге выборки связей нет."));
    const positions = new Map(
        ids.map((id, index) => {
            const angle = (index / ids.length) * Math.PI * 2 - Math.PI / 2;
            return [id, { x: 280 + Math.cos(angle) * 175, y: 205 + Math.sin(angle) * 145 }];
        }),
    );
    return `<svg class="premium-network" viewBox="0 0 560 410" role="img" aria-label="${t("Observed unit pair network; detailed scores are listed beside the graph.", "Граф пар юнитов; точные значения приведены рядом.")}"><title>${t("Connections among leading observed pairs", "Связи среди ведущих наблюдаемых пар")}</title>${pairs
        .filter((row) => row.ids.every((id) => positions.has(id)))
        .map((row) => {
            const a = positions.get(row.ids[0])!;
            const b = positions.get(row.ids[1])!;
            return `<path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke-width="${1 + row.frequency * 12}"><title>${e(unitName(catalog, row))}: ${pct(row.score)}, ${support(row, view)}</title></path>`;
        })
        .join("")}${ids
        .map((id) => {
            const pos = positions.get(id)!;
            const item = unit(catalog, id);
            return `<a href="${kb(view, e(item.anchor))}"><circle cx="${pos.x}" cy="${pos.y}" r="9"/><text x="${pos.x}" y="${pos.y + 25}" text-anchor="middle">${e(item.name)}</text></a>`;
        })
        .join("")}</svg>`;
}
export function renderPremiumCombos(data: PremiumLibraryResponse, catalog: PremiumCatalog, view: PremiumView): string {
    const t = translate(view);
    const rows = rankPremiumRows(data.library![view.combo], view.minimum).slice(0, 8);
    return rows.length
        ? rows
              .map(
                  (row) =>
                      `<article class="premium-combo-card">${portraits(catalog, row)}<div><h3>${e(unitName(catalog, row))}</h3><p>${support(row, view)}</p></div><div class="premium-combo-score"><strong>${pct(row.score)}</strong>${interval(row, view)}</div></article>`,
              )
              .join("")
        : empty(
              t(
                  "No combinations meet this threshold. Lower the minimum to inspect limited evidence, or choose another environment.",
                  "Нет комбинаций с достаточной выборкой. Снизьте порог, чтобы изучить ограниченные данные, или выберите другой тип армий.",
              ),
          );
}
export function renderPremiumArtifacts(
    data: PremiumLibraryResponse,
    catalog: PremiumCatalog,
    view: PremiumView,
): string {
    const t = translate(view);
    const rows = rankPremiumRows(
        view.tier === 1 ? data.library!.artifactsTier1 : data.library!.artifactsTier2,
        view.minimum,
    );
    return rows.length
        ? rows
              .map((row) => {
                  const item = catalog.artifacts[`${view.tier}:${row.key}`];
                  return `<article class="premium-artifact-card"><div class="premium-artifact-title">${item ? `<img src="${e(item.icon)}" alt="" width="64" height="64" loading="lazy"/>` : ""}<div><small>T${view.tier} · ${pct(row.frequency)} ${t("army share", "доля армий")}</small><h3>${item ? `<a href="${kb(view, e(item.anchor))}">${e(item.name)}</a>` : e(row.key)}</h3></div></div><p>${e(item?.description ?? "")}</p><div class="premium-artifact-evidence"><strong>${pct(row.score)}</strong><span>${support(row, view)}</span></div>${interval(row, view)}</article>`;
              })
              .join("")
        : empty(t("No artifacts meet this sample threshold.", "Нет артефактов с достаточной выборкой."));
}
const synergyNames: Record<string, [string, string]> = {
    "1:1": ["Chaos · Movement", "Chaos · Движение"],
    "1:2": ["Chaos · Break on Attack", "Chaos · Слом при атаке"],
    "2:1": ["Might · Aura Range", "Might · Радиус аур"],
    "2:2": ["Might · Ability Power", "Might · Сила способностей"],
    "3:1": ["Nature · Board Units", "Nature · Стеки на поле"],
    "3:2": ["Nature · Flying Armor", "Nature · Броня летающих"],
    "4:1": ["Life · Supply", "Life · Подкрепление"],
    "4:2": ["Life · Morale & Luck", "Life · Мораль и удача"],
};
export function renderPremiumDashboard(
    data: PremiumLibraryResponse,
    catalog: PremiumCatalog,
    view: PremiumView,
): string {
    const t = translate(view);
    const lib = data.library;
    if (!lib || !data.snapshot)
        return `<div class="premium-empty"><h2>${t("Battle statistics are unavailable", "Статистика боёв недоступна")}</h2><p>${t("You can still ask about game rules and strategy.", "Вы по-прежнему можете задавать вопросы о правилах и стратегии.")} <a href="#premium-search">${t("Ask Premium AI", "Спросить Premium AI")} ↓</a></p></div>`;
    const snapshot = data.snapshots.find((item) => item.snapshotId === data.snapshot!.snapshotId) ?? data.snapshot;
    const createdAt = snapshot.createdAt ? new Date(snapshot.createdAt) : undefined;
    const snapshotDate =
        createdAt && Number.isFinite(createdAt.getTime())
            ? `<time datetime="${createdAt.toISOString()}">${new Intl.DateTimeFormat(view.lang, {
                  dateStyle: "medium",
                  timeZone: "UTC",
              }).format(createdAt)}</time>`
            : "";
    const leaders = rankPremiumRows(lib.units, view.minimum);
    const pair = rankPremiumRows(lib.pairs, view.minimum)[0];
    const artifact = rankPremiumRows(lib.artifactsTier2, view.minimum)[0];
    const signal = (label: string, name: string, row?: PremiumRow, art = "") =>
        `<article class="premium-signal"><p class="premium-eyebrow">${label}</p>${art}<h3>${e(name)}</h3>${row ? `<strong>${pct(row.score)}</strong><p>${support(row, view)}</p>${interval(row, view)}` : `<p>${t("Try a lower sample threshold or another environment.", "Попробуйте меньший порог или другой тип армий.")}</p>`}</article>`;
    const plans = rankPremiumRows(lib.plans, view.minimum).slice(0, 8);
    return `<section id="premium-overview" class="premium-section">${title("01", t("Snapshot overview", "Обзор выборки"), t("Battle results for the selected dataset, army type, and battlefield.", "Результаты боёв для выбранной выборки, типа армии и поля боя."))}
    <div class="premium-context-note"><strong>${e(snapshot.studyProfile.replace(/^premium-/, ""))}</strong>${snapshotDate ? ` · ${snapshotDate}` : ""} · ${t("AI self-play", "Бои между ИИ")} · <strong>${e(lib.scope.cohort)}</strong> · ${lib.scope.map ? e(({ 1: "Normal", 3: "Lava Center", 4: "Block Center" } as Record<number, string>)[lib.scope.map]) : t("All live maps", "Все активные карты")} · ${snapshot.status === "development" ? t("Development snapshot", "Экспериментальная выборка") : e(snapshot.status)}${snapshot.caveats?.length ? ` · <a href="#premium-evidence">${t("Dataset notes", "Примечания к выборке")}</a>` : ""}</div>
    <div class="premium-kpis"><div><span>${t("Battle families", "Семейств боёв")}</span><strong>${count(lib.families)}</strong><small>${t("Two battles per family, with sides swapped", "По два боя в семействе со сменой сторон")}</small></div><div><span>${t("Units observed", "Юнитов в выборке")}</span><strong>${lib.units.length}</strong><small>${t("In the filtered results", "С учётом фильтров")}</small></div><div><span>${t("Snapshot battles", "Боёв в снимке")}</span><strong>${count(snapshot.fights)}</strong><small>${t("Charts use the training split", "Графики по обучающей части выборки")}</small></div><div><span>${t("Minimum sample", "Минимальная выборка")}</span><strong>${view.minimum}<em>+</em></strong><small>${t("Families per displayed choice", "Семейств на отображаемый вариант")}</small></div></div>
    <div class="premium-subheading"><h3>${t("Top results by category", "Лучшие результаты по категориям")}</h3><span>${t("Ordered by lower 95% bound", "По нижней границе 95% интервала")}</span></div>
    <div class="premium-signals">${signal(t("UNIT", "ЮНИТ"), leaders[0] ? unitName(catalog, leaders[0]) : t("No supported pick", "Недостаточно данных"), leaders[0], leaders[0] ? portraits(catalog, leaders[0]) : "")}${signal(t("UNIT PAIR", "ПАРА ЮНИТОВ"), pair ? unitName(catalog, pair) : t("No supported pair", "Недостаточно данных"), pair, pair ? portraits(catalog, pair) : "")}${signal(t("TIER 2 ARTIFACT", "АРТЕФАКТ II УРОВНЯ"), artifact ? (catalog.artifacts[`2:${artifact.key}`]?.name ?? artifact.key) : t("No supported artifact", "Недостаточно данных"), artifact)}</div>
    <div class="premium-chart-panel"><div class="premium-subheading"><div><h3>${t("Unit frequency and battle score", "Частота появления и результат юнита")}</h3><p>${t("Each dot represents a unit. Hover or focus for its statistics. Select it to open the unit guide.", "Каждая точка соответствует юниту. Наведите курсор или переведите фокус, чтобы увидеть статистику. Выберите точку, чтобы открыть описание юнита.")}</p></div><span>● ${t("Units", "Юниты")}</span></div>${scatter(lib.units, catalog, view)}</div></section>

    ${renderPremiumInsights(lib, catalog, view, data.snapshot)}
    <section id="premium-matchups" class="premium-section"><div data-premium-matchups>${renderPremiumMatchups(lib, catalog, view)}</div></section>
    <section id="premium-units" class="premium-section">${title("04", t("Unit rankings", "Рейтинги юнитов"), t("Compare units within the same draft level. Scores are based on battles involving the entire army.", "Сравнивайте юнитов одного уровня драфта. Счёт отражает результат всей армии."))}<div class="premium-unit-filters"><label class="premium-search"><span class="sr-only">${t("Search units", "Поиск юнитов")}</span><input type="search" data-unit-search placeholder="${t("Search a unit or faction…", "Юнит или фракция…")}" value="${e(view.search)}" /></label><label><span class="sr-only">${t("Unit level", "Уровень юнита")}</span><select data-unit-level><option value="">${t("All levels", "Все уровни")}</option>${[1, 2, 3, 4].map((level) => `<option value="${level}" ${view.level === String(level) ? "selected" : ""}>${t("Level", "Уровень")} ${level}</option>`).join("")}</select></label><label><span class="sr-only">${t("Sort units", "Сортировка")}</span><select data-unit-sort>${[
        ["confidence", t("Conservative score", "Нижняя граница")],
        ["score", t("Observed score", "Наблюдаемый счёт")],
        ["frequency", t("Army share", "Доля армий")],
    ]
        .map(([value, label]) => `<option value="${value}" ${view.sort === value ? "selected" : ""}>${label}</option>`)
        .join(
            "",
        )}</select></label></div><div data-premium-units>${renderPremiumUnits(lib.units, catalog, view)}</div><p class="premium-fine">${t("Whiskers show 95% family-level bounds. Dashed marker = 50%. Score counts a win as 1, a draw as ½, and a loss as 0.", "Усы — 95% границы по семействам. Пунктир — 50%. Победа = 1, ничья = ½, поражение = 0.")}</p></section>

    <section id="premium-combos" class="premium-section">${title("05", t("Unit combinations", "Комбинации юнитов"), t("Results for armies that included a given pair or trio. Each score includes the rest of the army’s contribution.", "Результаты армий, в которых была определённая пара или тройка юнитов. На счёт влиял весь состав армии."))}<div class="premium-segmented" role="group" aria-label="${t("Combination size", "Размер комбинации")}">${["pairs", "triples"].map((value) => `<button type="button" data-combo="${value}" aria-pressed="${view.combo === value}">${value === "pairs" ? t("Duos", "Пары") : t("Trios", "Тройки")}</button>`).join("")}</div><div class="premium-combos-layout"><div class="premium-chart-panel"><h3>${t("Unit pair graph", "Граф пар юнитов")}</h3>${network(lib.pairs, catalog, view)}<p class="premium-fine">${t("Leading observed pairs; line width reflects their frequency in sampled armies. This graph always shows pairs.", "Ведущие наблюдаемые пары; толщина линий отражает частоту в выборке. Граф всегда показывает пары.")}</p></div><div data-premium-combos class="premium-combo-list">${renderPremiumCombos(data, catalog, view)}</div></div><p class="premium-fine">${t("Up to 60 pairs and 60 trios are shortlisted per context by their lower confidence bound; the eight qualifying leaders are shown here.", "В каждом контексте отобрано до 60 пар и 60 троек по нижней границе интервала; здесь показаны восемь лидеров, прошедших порог.")}</p></section>

    <section id="premium-artifacts" class="premium-section">${title("06", t("Artifacts", "Артефакты"), t("Compare results by artifact tier for the selected army type and battlefield. Scores reflect the whole army build.", "Сравнивайте результаты по уровню артефакта для выбранного типа армии и поля боя. Счёт отражает результат всего билда."))}<div class="premium-segmented" role="group" aria-label="${t("Artifact tier", "Уровень артефакта")}">${[1, 2].map((value) => `<button type="button" data-tier="${value}" aria-pressed="${view.tier === value}">${t("Tier", "Уровень")} ${value}</button>`).join("")}</div><div data-premium-artifacts class="premium-artifact-grid">${renderPremiumArtifacts(data, catalog, view)}</div></section>

    <section id="premium-synergies" class="premium-section">${title("07", t("Faction synergies", "Синергии фракций"), t("Results by faction, synergy variant, and activation level. A dash means the sample is below the selected minimum.", "Результаты по фракции, варианту синергии и уровню активации. Прочерк означает, что выборка меньше выбранного минимума."))}<div class="premium-table-scroll"><table class="premium-synergy-table"><caption class="sr-only">${t("Exact active synergy outcomes", "Результаты точных активных синергий")}</caption><thead><tr><th>${t("Faction / bonus", "Фракция / бонус")}</th><th>L1 <small>2–3 ${t("stacks", "стека")}</small></th><th>L2 <small>4–5 ${t("stacks", "стеков")}</small></th><th>L3 <small>6 ${t("stacks", "стеков")}</small></th></tr></thead><tbody>${Object.entries(
        synergyNames,
    )
        .map(
            ([key, names]) =>
                `<tr><th scope="row">${e(t(...names))}</th>${[1, 2, 3]
                    .map((level) => {
                        const row = lib.synergies.find(
                            (row) => row.key === `${key}:${level}` && row.families >= view.minimum,
                        );
                        return row
                            ? `<td class="premium-heat-cell" style="--heat:${Math.min(0.28, Math.max(0.04, row.score * 0.3))}"><strong>${pct(row.score)}</strong><small>${support(row, view)}</small><small>95% ${pct(row.interval[0])}–${pct(row.interval[1])}</small></td>`
                            : `<td><span aria-label="${t("Insufficient evidence", "Недостаточно данных")}">—</span></td>`;
                    })
                    .join("")}</tr>`,
        )
        .join(
            "",
        )}</tbody></table></div><p class="premium-fine">${t("Physical stacks determine activation. Faction composition and variant selection are linked to the result; the two variants are not a controlled head-to-head test.", "Активация зависит от числа физических стеков. Состав армии и вариант синергии связаны с результатом; это не контролируемое сравнение вариантов.")}</p><a class="premium-text-link" href="${kb(view, "rule-synergies")}">${t("Read the synergy rules", "Правила синергий")} ↗</a></section>

    <section id="premium-builds" class="premium-section">${title("08", t("Doctrines and upgrade plans", "Доктрины и планы усилений"), t("Scores cover the full set of upgrades used together.", "Счёт относится ко всему набору усилений, использованных вместе."))}<div class="premium-doctrines">${
        rankPremiumRows(lib.doctrines, view.minimum)
            .map((row) => {
                const doctrine = catalog.doctrines[row.key];
                return `<article><small>${t("DOCTRINE", "ДОКТРИНА")}</small><h3>${e(doctrine?.name ?? row.key)}</h3><p>${doctrine?.points ?? "—"} ${t("upgrade points", "очков усиления")}</p><strong>${pct(row.score)}</strong>${interval(row, view)}<small>${support(row, view)}</small></article>`;
            })
            .join("") || empty(t("No doctrine meets this threshold.", "Нет доктрин с достаточной выборкой."))
    }</div><div class="premium-plan-grid">${
        plans
            .map((row) => {
                const levels = premiumPlanLevels(row.key);
                const labels = [
                    t("Placement", "Расстановка"),
                    t("Armor", "Броня"),
                    t("Might", "Ближний бой"),
                    t("Sniper", "Стрельба"),
                    t("Movement", "Движение"),
                    t("Empower", "Магия"),
                ];
                return `<article class="premium-plan"><header><code>${e(row.key)}</code><strong>${pct(row.score)}</strong></header>${levels ? levels.map((value, index) => `<div class="premium-plan-axis"><span>${labels[index]}</span><div>${Array.from({ length: index === 0 || index === 4 ? 2 : 3 }, (_, tick) => `<i class="${tick < value ? "filled" : ""}"></i>`).join("")}</div><b>${value}</b></div>`).join("") : ""}${interval(row, view)}<small>${support(row, view)}</small></article>`;
            })
            .join("") ||
        empty(
            t(
                "No complete plans meet this threshold. Exact builds often have limited support.",
                "Нет полных планов с достаточной выборкой. Точные билды часто встречаются редко.",
            ),
        )
    }</div><a class="premium-text-link" href="${kb(view, "rule-augments")}">${t("Upgrade costs and doctrine budgets", "Стоимость усилений и бюджеты доктрин")} ↗</a></section>

    <section id="premium-playbook" class="premium-section">${title("09", t("Strategy guides", "Руководства по стратегии"), t("Tactics for four army types. Each guide links to the corresponding battle results.", "Тактика для четырёх типов армий. В каждом руководстве есть ссылка на результаты боёв для этого типа."))}<div class="premium-guides">${premiumGuides
        .map((guide, index) => {
            const copy = view.lang === "ru" ? guide.ru : guide.en;
            return `<article class="premium-guide"><div class="premium-guide-top"><span>0${index + 1} / ${e(copy[1])}</span><span aria-hidden="true">↗</span></div><h3>${e(copy[0])}</h3><p>${e(copy[2])}</p><h4>${e(copy[3])}</h4><p>${e(copy[4])}</p><h4>${e(copy[5])}</h4><p>${e(copy[6])}</p><button type="button" class="premium-text-button" data-environment="${guide.slug}">${t("View battle results", "Смотреть результаты боёв")} →</button></article>`;
        })
        .join(
            "",
        )}</div><div class="premium-draft-checklist"><h3>${t("Before you lock the draft", "Перед подтверждением драфта")}</h3><ol><li>${t("Compare candidates at the same level, in the same snapshot and environment.", "Сравните кандидатов одного уровня в одном снимке и типе армий.")}</li><li>${t("Check whether the army can reach its targets and protect its useful damage or support.", "Проверьте, достигает ли армия целей и защищает ли основные источники урона и поддержку.")}</li><li>${t("Read the exact active synergy and the complete augment budget.", "Проверьте точную активную синергию и полный бюджет усилений.")}</li><li>${t("Treat overlapping intervals as uncertainty; use current mechanics to resolve close decisions.", "Пересечение интервалов означает неопределённость; в близких решениях опирайтесь на текущие механики.")}</li></ol></div></section>

    <section id="premium-evidence" class="premium-section">${title("10", t("Data and methods", "Данные и методика"), t("Where the data came from and how scores and confidence intervals are calculated.", "Источник данных и расчёт счёта и доверительных интервалов."))}<div class="premium-evidence-layout"><div><h3>${t("Terrain coverage", "Покрытие карт")}</h3><p>${t("Training families by battlefield for the selected dataset and army type.", "Семейства боёв в обучающей части выборки по полям боя для выбранного типа армии.")}</p>${lib.maps.map((row) => `<div class="premium-coverage"><span>${e(({ 1: t("Normal", "Обычная"), 3: t("Lava Center", "Лава в центре"), 4: t("Block Center", "Блок в центре") } as Record<number, string>)[row.map])}</span><div><i style="width:${(row.families / Math.max(1, ...lib.maps.map((row) => row.families))) * 100}%"></i></div><b>${count(row.families)}</b></div>`).join("")}</div><dl><dt>${t("Snapshot", "Снимок")}</dt><dd><code>${e(snapshot.snapshotId)}</code></dd><dt>${t("Study profile", "Профиль исследования")}</dt><dd>${e(snapshot.studyProfile)}</dd><dt>${t("Release status", "Статус")}</dt><dd>${e(snapshot.status)}</dd><dt>${t("Source fingerprint", "Отпечаток исходников")}</dt><dd><code>${e(snapshot.sourceSha256)}</code></dd></dl></div>${(snapshot.caveats ?? []).map((note) => `<p class="premium-caveat">${e(note)}</p>`).join("")}<div class="premium-methodology"><details open><summary>${t("What is an observed score?", "Что такое наблюдаемый счёт?")}</summary><p>${t("Win = 1, draw = 0.5, loss = 0. Army outcomes are averaged within each seat-paired family, then across independent families. Only training families enter these charts. This is frozen self-play, not recent human ranked traffic or your chance of winning the next match.", "Победа = 1, ничья = 0,5, поражение = 0. Результаты сначала усредняются внутри семейства со сменой сторон, затем между независимыми семействами. Графики используют только train. Это зафиксированные бои ИИ, а не свежие рейтинговые игры людей и не ваши шансы в следующем матче.")}</p></details><details><summary>${t("How should I read the rankings?", "Как читать рейтинги?")}</summary><p>${t("The default order uses the lower 95% Hoeffding bound, which favors better-supported outcomes. Fewer than 50 families is limited evidence. Overlapping intervals do not establish a winner. Many combinations are inspected, so even a leading estimate may not replicate. Army share measures presence in sampled armies, not player popularity.", "По умолчанию используется нижняя 95% граница Хёффдинга, учитывающая объём данных. Менее 50 семейств — ограниченная выборка. Пересекающиеся интервалы не доказывают превосходства. Среди множества комбинаций даже лидер может не повторить результат. Доля армий — частота в выборке, а не популярность у игроков.")}</p></details><details><summary>${t("Why keep snapshots and environments separate?", "Зачем разделять снимки и типы армий?")}</summary><p>${t("Different batches can use different engine versions and sampling profiles. Synthetic ranged, flying or support armies answer different questions from ranked draft. Filters change the population; they do not simulate a counterfactual. Artifacts, synergies and augment plans are shown as observational associations, with no isolated causal-strength claim.", "Пакеты могут различаться версией движка и профилем выборки. Стрелковые, летающие и магические армии отвечают на иные вопросы, чем рейтинговый драфт. Фильтры меняют выборку, но не моделируют альтернативный исход. Артефакты, синергии и планы показаны как наблюдаемые связи, без заявления об изолированной причинной силе.")}</p></details><details><summary>${t("What does missing evidence mean?", "Что значит отсутствие данных?")}</summary><p>${t("An empty cell means no result clears the selected sample threshold. It does not mean a unit or build is weak. Historical v1/v2 snapshots did not sample Empower allocations. Current mechanics and legal in-game choices remain authoritative when a snapshot is older than the live game.", "Пустая клетка означает, что ни один результат не прошёл порог. Это не означает слабость юнита или билда. Исторические снимки v1/v2 не включали вложения в Empower. Если снимок старше игры, ориентируйтесь на текущие механики и доступные в игре действия.")}</p></details></div></section>`;
}
