import { portraitMarkup } from "./portrait";
import { premiumGuides } from "./premium-copy";
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
}
const translate = (view: PremiumView) => (en: string, ru: string) => (view.lang === "ru" ? ru : en);
const title = (number: string, heading: string, subtitle: string) =>
    `<header class="premium-section-heading"><span>${number}</span><div><h2>${heading}</h2><p>${subtitle}</p></div></header>`;
const empty = (text: string) => `<p class="premium-empty">${text}</p>`;
const premiumIcon = '<span class="premium-icon" aria-hidden="true"></span>';
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
    `<div class="premium-portraits">${row.ids
        .map((id) => {
            const item = unit(catalog, id);
            return portraitMarkup(item.slug, item.name, { className: "premium-portrait", title: item.name });
        })
        .join("")}</div>`;
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
    return `<div class="premium-table-scroll"><table class="premium-table"><caption class="sr-only">${t("Unit outcomes in the selected snapshot and environment", "Результаты юнитов в выбранной выборке")}</caption><thead><tr><th>#</th><th>${t("Unit / faction", "Юнит / фракция")}</th><th>${t("Observed score", "Наблюдаемый счёт")}</th><th>${t("95% interval", "95% интервал")}</th><th>${t("Army share", "Доля армий")}</th><th>${t("Families", "Семейства")}</th></tr></thead><tbody>${visible
        .map((row, index) => {
            const item = unit(catalog, row.ids[0]);
            return `<tr><td class="premium-rank">${String(index + 1).padStart(2, "0")}</td><td><a class="premium-unit-cell" href="${kb(view, e(item.anchor))}">${portraits(catalog, row)}<span><strong>${e(item.name)}</strong><small>${e(item.faction)} · L${item.level}</small></span></a></td><td class="premium-score">${pct(row.score)}</td><td>${interval(row, view)}<small>${pct(row.interval[0])}–${pct(row.interval[1])}</small></td><td>${pct(row.frequency)}</td><td>${count(row.families)}${row.families < 50 ? `<small class="premium-limited">${t("Limited", "Мало данных")}</small>` : ""}</td></tr>`;
        })
        .join("")}</tbody></table></div>`;
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
        return `<div class="premium-empty"><h2>${t("Your Premium is active.", "Ваш Premium активен.")}</h2><p>${t("The snapshot library is temporarily unavailable. Your in-game access is unchanged. Try loading the library again shortly.", "Библиотека данных временно недоступна. Доступ в игре сохранён. Попробуйте обновить страницу позже.")}</p></div>`;
    const snapshot = data.snapshots.find((item) => item.snapshotId === data.snapshot!.snapshotId) ?? data.snapshot;
    const leaders = rankPremiumRows(lib.units, view.minimum);
    const pair = rankPremiumRows(lib.pairs, view.minimum)[0];
    const artifact = rankPremiumRows(lib.artifactsTier2, view.minimum)[0];
    const signal = (label: string, name: string, row?: PremiumRow, art = "") =>
        `<article class="premium-signal"><p class="premium-eyebrow">${label}</p>${art}<h3>${e(name)}</h3>${row ? `<strong>${pct(row.score)}</strong><p>${support(row, view)}</p>${interval(row, view)}` : `<p>${t("Try a lower sample threshold or another environment.", "Попробуйте меньший порог или другой тип армий.")}</p>`}</article>`;
    const plans = rankPremiumRows(lib.plans, view.minimum).slice(0, 8);
    return `<section id="premium-overview" class="premium-section">${title("01", t("The meta, in focus.", "Мета в деталях."), t("One snapshot. One environment. A clearer starting point for your next draft.", "Один снимок. Один тип армий. Ориентир для следующего драфта."))}
    <div class="premium-context-note">${t("Frozen self-play evidence", "Зафиксированные данные самообучения")} · <strong>${e(lib.scope.cohort)}</strong> · ${lib.scope.map ? e(({ 1: "Normal", 3: "Lava Center", 4: "Block Center" } as Record<number, string>)[lib.scope.map]) : t("All live maps", "Все активные карты")} · ${snapshot.status === "development" ? t("Development snapshot", "Экспериментальная выборка") : e(snapshot.status)}${snapshot.caveats?.length ? ` · <a href="#premium-evidence">${t("Historical engine caveat — read notes", "Историческая ошибка движка — подробнее")}</a>` : ""}</div>
    <div class="premium-kpis"><div><span>${t("Matched families", "Семейств в выборке")}</span><strong>${count(lib.families)}</strong><small>${t("Independent, seat-paired matchups", "Независимые пары со сменой сторон")}</small></div><div><span>${t("Units observed", "Юнитов в выборке")}</span><strong>${lib.units.length}</strong><small>${t("In the selected context", "В выбранном контексте")}</small></div><div><span>${t("Snapshot battles", "Боёв в снимке")}</span><strong>${count(snapshot.fights)}</strong><small>${t("Whole batch; charts use training only", "Весь пакет; графики только по train")}</small></div><div><span>${t("Evidence floor", "Порог выборки")}</span><strong>${view.minimum}<em>+</em></strong><small>${t("Families per displayed choice", "Семейств на отображаемый вариант")}</small></div></div>
    <div class="premium-subheading"><h3>${t("Signals worth a closer look", "Что стоит изучить")}</h3><span>${t("Ordered by lower 95% bound", "По нижней границе 95% интервала")}</span></div>
    <div class="premium-signals">${signal(t("DRAFT WATCH", "ЮНИТ"), leaders[0] ? unitName(catalog, leaders[0]) : t("No supported pick", "Недостаточно данных"), leaders[0], leaders[0] ? portraits(catalog, leaders[0]) : "")}${signal(t("COMBINATION WATCH", "КОМБИНАЦИЯ"), pair ? unitName(catalog, pair) : t("No supported pair", "Недостаточно данных"), pair, pair ? portraits(catalog, pair) : "")}${signal(t("TIER 2 WATCH", "АРТЕФАКТ T2"), artifact ? (catalog.artifacts[`2:${artifact.key}`]?.name ?? artifact.key) : t("No supported artifact", "Недостаточно данных"), artifact)}</div>
    <div class="premium-chart-panel"><div class="premium-subheading"><div><h3>${t("Popularity × performance", "Популярность × результат")}</h3><p>${t("Each dot is a unit. Hover or focus a dot for context; open it for mechanics.", "Каждая точка — юнит. Наведите или выберите точку; откройте её описание.")}</p></div><span>● ${t("Units", "Юниты")}</span></div>${scatter(lib.units, catalog, view)}</div></section>

    <section id="premium-units" class="premium-section">${title("02", t("Know your draft.", "Разбирайтесь в драфте."), t("Compare units at the same level. A strong army association does not make a unit a universal first pick.", "Сравнивайте юнитов одного уровня. Успех армии не делает юнита универсальным первым пиком."))}<div class="premium-unit-filters"><label class="premium-search"><span class="sr-only">${t("Search units", "Поиск юнитов")}</span><input type="search" data-unit-search placeholder="${t("Search a unit or faction…", "Юнит или фракция…")}" value="${e(view.search)}" /></label><label><span class="sr-only">${t("Unit level", "Уровень юнита")}</span><select data-unit-level><option value="">${t("All levels", "Все уровни")}</option>${[1, 2, 3, 4].map((level) => `<option value="${level}" ${view.level === String(level) ? "selected" : ""}>${t("Level", "Уровень")} ${level}</option>`).join("")}</select></label><label><span class="sr-only">${t("Sort units", "Сортировка")}</span><select data-unit-sort>${[
        ["confidence", t("Conservative score", "Нижняя граница")],
        ["score", t("Observed score", "Наблюдаемый счёт")],
        ["frequency", t("Army share", "Доля армий")],
    ]
        .map(([value, label]) => `<option value="${value}" ${view.sort === value ? "selected" : ""}>${label}</option>`)
        .join(
            "",
        )}</select></label></div><div data-premium-units>${renderPremiumUnits(lib.units, catalog, view)}</div><p class="premium-fine">${t("Whiskers show 95% family-level bounds. Dashed marker = 50%. Score counts a win as 1, a draw as ½, and a loss as 0.", "Усы — 95% границы по семействам. Пунктир — 50%. Победа = 1, ничья = ½, поражение = 0.")}</p></section>

    <section id="premium-combos" class="premium-section">${title("03", t("Better together? Follow the evidence.", "Лучше вместе? Изучайте данные."), t("These units appeared in the same army. Co-occurrence is a starting point for a plan, not proof of a causal combo.", "Эти юниты встречались в одной армии. Совместный результат — отправная точка, а не доказательство силы комбинации."))}<div class="premium-segmented" role="group" aria-label="${t("Combination size", "Размер комбинации")}">${["pairs", "triples"].map((value) => `<button type="button" data-combo="${value}" aria-pressed="${view.combo === value}">${premiumIcon}${value === "pairs" ? t("Duos", "Пары") : t("Trios", "Тройки")}</button>`).join("")}</div><div class="premium-combos-layout"><div class="premium-chart-panel"><h3>${t("The connection map", "Карта связей")}</h3>${network(lib.pairs, catalog, view)}<p class="premium-fine">${t("Leading observed pairs; line width reflects their frequency in sampled armies. This graph always shows pairs.", "Ведущие наблюдаемые пары; толщина линий отражает частоту в выборке. Граф всегда показывает пары.")}</p></div><div data-premium-combos class="premium-combo-list">${renderPremiumCombos(data, catalog, view)}</div></div><p class="premium-fine">${t("Up to 60 pairs and 60 trios are shortlisted per context by their lower confidence bound; the eight qualifying leaders are shown here.", "В каждом контексте отобрано до 60 пар и 60 троек по нижней границе интервала; здесь показаны восемь лидеров, прошедших порог.")}</p></section>

    <section id="premium-artifacts" class="premium-section">${title("04", t("Choose the right edge.", "Выбирайте подходящее усиление."), t("Compare artifacts in the same army environment and terrain. These are observed build outcomes, not randomized artifact effects.", "Сравнивайте артефакты в одном типе армий и на одной карте. Это результаты билдов, а не изолированный эффект артефакта."))}<div class="premium-segmented" role="group" aria-label="${t("Artifact tier", "Уровень артефакта")}">${[1, 2].map((value) => `<button type="button" data-tier="${value}" aria-pressed="${view.tier === value}">${premiumIcon}${t("Tier", "Уровень")} ${value}</button>`).join("")}</div><div data-premium-artifacts class="premium-artifact-grid">${renderPremiumArtifacts(data, catalog, view)}</div></section>

    <section id="premium-synergies" class="premium-section">${title("05", t("Build around an active bonus.", "Стройте вокруг активного бонуса."), t("Exact faction, variant and activation level. Empty cells mean insufficient support at your selected threshold.", "Точная фракция, вариант и уровень активации. Пустые клетки — недостаточно данных при выбранном пороге."))}<div class="premium-table-scroll"><table class="premium-synergy-table"><caption class="sr-only">${t("Exact active synergy outcomes", "Результаты точных активных синергий")}</caption><thead><tr><th>${t("Faction / bonus", "Фракция / бонус")}</th><th>L1 <small>2–3 ${t("stacks", "стека")}</small></th><th>L2 <small>4–5 ${t("stacks", "стеков")}</small></th><th>L3 <small>6 ${t("stacks", "стеков")}</small></th></tr></thead><tbody>${Object.entries(
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

    <section id="premium-builds" class="premium-section">${title("06", t("A build is the whole plan.", "Билд — это целый план."), t("Read all augment axes together. A high-scoring plan does not establish the independent value of any one upgrade.", "Оценивайте все усиления вместе. Результат плана не доказывает отдельную ценность каждого улучшения."))}<div class="premium-doctrines">${
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
    }</div><a class="premium-text-link" href="${kb(view, "rule-augments")}">${t("Understand upgrade costs and doctrine budgets", "Стоимость усилений и бюджеты доктрин")} ↗</a></section>

    <section id="premium-playbook" class="premium-section">${title("07", t("Go in with a plan.", "Начинайте с плана."), t("Practical principles to test in your own matches. Open an army environment above to put its observed choices in context.", "Практические принципы для ваших матчей. Выберите тип армий выше, чтобы изучить его результаты."))}<div class="premium-guides">${premiumGuides
        .map((guide, index) => {
            const copy = view.lang === "ru" ? guide.ru : guide.en;
            return `<article class="premium-guide"><div class="premium-guide-top"><span>0${index + 1} / ${e(copy[1])}</span><span aria-hidden="true">↗</span></div><h3>${e(copy[0])}</h3><p>${e(copy[2])}</p><h4>${e(copy[3])}</h4><p>${e(copy[4])}</p><h4>${e(copy[5])}</h4><p>${e(copy[6])}</p><button type="button" class="premium-text-button" data-environment="${guide.slug}">${premiumIcon}${t("Explore this environment", "Изучить этот тип армий")} →</button></article>`;
        })
        .join(
            "",
        )}</div><div class="premium-draft-checklist"><h3>${t("Before you lock the draft", "Перед подтверждением драфта")}</h3><ol><li>${t("Compare candidates at the same level, in the same snapshot and environment.", "Сравните кандидатов одного уровня в одном снимке и типе армий.")}</li><li>${t("Check whether the army can reach its targets and protect its useful damage or support.", "Проверьте, достигает ли армия целей и защищает ли основные источники урона и поддержку.")}</li><li>${t("Read the exact active synergy and the complete augment budget.", "Проверьте точную активную синергию и полный бюджет усилений.")}</li><li>${t("Treat overlapping intervals as uncertainty; use current mechanics to resolve close decisions.", "Пересечение интервалов означает неопределённость; в близких решениях опирайтесь на текущие механики.")}</li></ol></div></section>

    <section id="premium-evidence" class="premium-section">${title("08", t("See what the numbers can say.", "Понимайте границы данных."), t("Transparent provenance, honest uncertainty and no invented live win probabilities.", "Прозрачное происхождение, честная неопределённость, без выдуманных шансов победы."))}<div class="premium-evidence-layout"><div><h3>${t("Terrain coverage", "Покрытие карт")}</h3><p>${t("Training families in this snapshot and army environment, before the terrain filter.", "Семейства train в этом снимке и типе армий, до фильтра карты.")}</p>${lib.maps.map((row) => `<div class="premium-coverage"><span>${e(({ 1: t("Normal", "Обычная"), 3: t("Lava Center", "Лава в центре"), 4: t("Block Center", "Блок в центре") } as Record<number, string>)[row.map])}</span><div><i style="width:${(row.families / Math.max(1, ...lib.maps.map((row) => row.families))) * 100}%"></i></div><b>${count(row.families)}</b></div>`).join("")}</div><dl><dt>${t("Snapshot", "Снимок")}</dt><dd><code>${e(snapshot.snapshotId)}</code></dd><dt>${t("Study profile", "Профиль исследования")}</dt><dd>${e(snapshot.studyProfile)}</dd><dt>${t("Release status", "Статус")}</dt><dd>${e(snapshot.status)}</dd><dt>${t("Source fingerprint", "Отпечаток исходников")}</dt><dd><code>${e(snapshot.sourceSha256)}</code></dd></dl></div>${(snapshot.caveats ?? []).map((note) => `<p class="premium-caveat">${e(note)}</p>`).join("")}<div class="premium-methodology"><details open><summary>${t("What is an observed score?", "Что такое наблюдаемый счёт?")}</summary><p>${t("Win = 1, draw = 0.5, loss = 0. Army outcomes are averaged within each seat-paired family, then across independent families. Only training families enter these charts. This is frozen self-play, not recent human ranked traffic or your chance of winning the next match.", "Победа = 1, ничья = 0,5, поражение = 0. Результаты сначала усредняются внутри семейства со сменой сторон, затем между независимыми семействами. Графики используют только train. Это зафиксированные бои ИИ, а не свежие рейтинговые игры людей и не ваши шансы в следующем матче.")}</p></details><details><summary>${t("How should I read the rankings?", "Как читать рейтинги?")}</summary><p>${t("The default order uses the lower 95% Hoeffding bound, which favors better-supported outcomes. Fewer than 50 families is limited evidence. Overlapping intervals do not establish a winner. Many combinations are inspected, so even a leading estimate may not replicate. Army share measures presence in sampled armies, not player popularity.", "По умолчанию используется нижняя 95% граница Хёффдинга, учитывающая объём данных. Менее 50 семейств — ограниченная выборка. Пересекающиеся интервалы не доказывают превосходства. Среди множества комбинаций даже лидер может не повторить результат. Доля армий — частота в выборке, а не популярность у игроков.")}</p></details><details><summary>${t("Why keep snapshots and environments separate?", "Зачем разделять снимки и типы армий?")}</summary><p>${t("Different batches can use different engine versions and sampling profiles. Synthetic ranged, flying or support armies answer different questions from ranked draft. Filters change the population; they do not simulate a counterfactual. Artifacts, synergies and augment plans are shown as observational associations, with no isolated causal-strength claim.", "Пакеты могут различаться версией движка и профилем выборки. Стрелковые, летающие и магические армии отвечают на иные вопросы, чем рейтинговый драфт. Фильтры меняют выборку, но не моделируют альтернативный исход. Артефакты, синергии и планы показаны как наблюдаемые связи, без заявления об изолированной причинной силе.")}</p></details><details><summary>${t("What does missing evidence mean?", "Что значит отсутствие данных?")}</summary><p>${t("An empty cell means no result clears the selected sample threshold. It does not mean a unit or build is weak. Historical v1/v2 snapshots did not sample Empower allocations. Current mechanics and legal in-game choices remain authoritative when a snapshot is older than the live game.", "Пустая клетка означает, что ни один результат не прошёл порог. Это не означает слабость юнита или билда. Исторические снимки v1/v2 не включали вложения в Empower. Если снимок старше игры, ориентируйтесь на текущие механики и доступные в игре действия.")}</p></details></div></section>`;
}
