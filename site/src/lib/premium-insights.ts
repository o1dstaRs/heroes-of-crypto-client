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

const text = (view: PremiumView) => (en: string, ru: string) => (view.lang === "ru" ? ru : en);
const support = (row: PremiumRow, view: PremiumView) =>
    `${row.families.toLocaleString(view.lang)} ${text(view)("families", "семейств")} · 95% ${pct(row.interval[0])}–${pct(row.interval[1])}`;
const kb = (anchor: string, view: PremiumView) => `${view.lang === "ru" ? "/ru" : ""}/knowledge-base/#${anchor}`;
const signal = (row: PremiumRow, view: PremiumView) =>
    row.interval[0] > 0.5
        ? text(view)("Above 50% in this population", "Выше 50% в этой выборке")
        : row.interval[1] < 0.5
          ? text(view)("Below 50% in this population", "Ниже 50% в этой выборке")
          : text(view)("Advantage unresolved", "Преимущество не установлено");
const reading = (name: string, row: PremiumRow, view: PremiumView) =>
    `<li><div><strong>${name}</strong><small>${e(support(row, view))}</small><small>${e(signal(row, view))}</small></div><b>${pct(row.score)}</b></li>`;

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

export function renderPremiumInsights(
    library: PremiumLibrary,
    catalog: PremiumCatalog,
    view: PremiumView,
    snapshot?: PremiumSnapshot,
): string {
    const t = text(view);
    const rows = premiumInsightRows(library, catalog, view.minimum);
    const unitLink = (id: number) => {
        const item = catalog.units[id];
        return item ? `<a href="${kb(e(item.anchor), view)}">${e(item.name)}</a>` : `#${id}`;
    };
    const missing = `<p class="premium-fine">${t("No result meets the sample threshold.", "Нет результатов с достаточной выборкой.")}</p>`;
    const card = (title: string, description: string, items: string[], noResult = missing) =>
        `<article class="premium-insight-card"><h3>${title}</h3><p>${description}</p>${items.length ? `<ul>${items.join("")}</ul>` : noResult}</article>`;
    return `<section id="premium-insights" class="premium-section">
        <header class="premium-section-heading"><span>02</span><div><h2>${t("Snapshot results", "Результаты выборки")}</h2><p>${t("Each result shown uses at least", "Каждый результат рассчитан как минимум по")} ${rows.threshold} ${t("independent families. Each family has two battles with sides swapped.", "независимым семействам. В каждом семействе два боя со сменой сторон.")}</p></div></header>
        ${snapshot ? `<p class="premium-context-note">${e(snapshot.studyProfile)} · ${snapshot.fights.toLocaleString(view.lang)} ${t("recorded fights", "записанных боёв")} · ${snapshot.status === "development" ? t("Historical development evidence", "Исторические исследовательские данные") : t("Validated snapshot", "Проверенный снимок")} · <code>${e(snapshot.snapshotId)}</code>${(snapshot.caveats ?? []).map((note) => `<br>${e(note)}`).join("")}</p>` : ""}
        <div class="premium-insight-grid">
        ${card(
            t("Unit leaders, by level", "Ведущие юниты по уровням"),
            t(
                "Highest lower confidence bound within each draft level.",
                "Наибольшая нижняя граница интервала внутри каждого уровня драфта.",
            ),
            rows.unitLeaders.map((row) =>
                reading(`L${catalog.units[row.ids[0]].level} · ${unitLink(row.ids[0])}`, row, view),
            ),
        )}
        ${card(
            t("Lower observed outcomes", "Более низкие результаты"),
            t(
                "Only rows whose entire interval is below 50%. This does not isolate a unit's contribution.",
                "Только результаты, у которых весь интервал ниже 50%. Это не измерение отдельного вклада юнита.",
            ),
            rows.unitLaggards.map((row) => reading(unitLink(row.ids[0]), row, view)),
            `<p class="premium-fine">${t("No clear below-50% unit result at this sample threshold.", "При этом пороге нет результатов юнитов с интервалом целиком ниже 50%.")}</p>`,
        )}
        ${card(
            t("Promising combinations", "Перспективные сочетания"),
            t(
                "Units observed in the same army, not an isolated combo test.",
                "Юниты в одной армии, а не изолированный тест комбинации.",
            ),
            rows.pairs.map((row) => reading(row.ids.map(unitLink).join(" + "), row, view)),
        )}
        ${card(
            t("Artifact watchlist", "Артефакты для изучения"),
            t(
                "Leading current choices within each tier. Their armies also differ.",
                "Ведущие доступные варианты внутри каждого уровня. Составы их армий тоже отличаются.",
            ),
            rows.artifacts.map(({ tier, row }) => {
                const item = catalog.artifacts[`${tier}:${row.key}`];
                return reading(`T${tier} · <a href="${kb(e(item.anchor), view)}">${e(item.name)}</a>`, row, view);
            }),
        )}
        ${card(
            t("Active synergy signals", "Результаты активных синергий"),
            t(
                "Leading exact variants at each activation level; faction counts and armies still differ.",
                "Ведущие точные варианты на каждом уровне активации; составы и число фракционных юнитов различаются.",
            ),
            rows.synergies.map((row) =>
                reading(
                    `${e(synergyNames[row.ids.slice(0, 2).join(":")]?.[view.lang === "ru" ? 1 : 0] ?? row.key)} · L${row.ids[2]}`,
                    row,
                    view,
                ),
            ),
        )}
        ${card(
            t("Complete build signals", "Результаты полных билдов"),
            t(
                "Whole augment plans. Doctrine budgets and unit fit matter; this is not an isolated upgrade ranking.",
                "Полные планы усилений. Важны бюджет доктрины и состав; это не рейтинг отдельных усилений.",
            ),
            rows.plans.map((row) => reading(planName(row.key, view), row, view)),
        )}
        </div>
        <p class="premium-fine">${t("These are associations in the selected snapshot, cohort and map. Overlapping intervals do not establish a winner; selecting leaders among many candidates needs fresh confirmation. Historical balance changes can invalidate a current recommendation.", "Это связи в выбранном снимке, типе армий и карте. Пересекающиеся интервалы не определяют победителя; лидерам среди множества вариантов нужна новая проверка. Изменения баланса могут сделать исторический совет неактуальным.")}</p>
        <button class="premium-secondary" type="button" data-snapshot-question>${t("Explain the strategies behind these results", "Объяснить стратегии за этими результатами")}</button>
    </section>`;
}

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
    const header = `<header class="premium-section-heading"><span>03</span><div><h2>${t("Unit matchups", "Противостояния юнитов")}</h2><p>${t("These results compare full armies that contained the two units on opposite sides. Other units and upgrades also affect the result.", "Здесь сравниваются результаты армий, в которых эти юниты были по разные стороны. На результат также влияют другие юниты и усиления.")}</p></div></header>`;
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
