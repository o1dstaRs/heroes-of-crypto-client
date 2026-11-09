import { portraitMarkup } from "./portrait";
import { CREW_LEVELS, premiumCrewSlots } from "./premium-crew";
import { rankPremiumCrewRoster } from "./premium-crew-picks";
import { CREW_HISTORY_MINIMUM, type PremiumCrewHistory } from "./premium-crew-history";
import { escapePremiumHtml as e, premiumPercent, type PremiumCatalog, type PremiumLibrary } from "./premium-library";

export function renderPremiumCrewRoster(
    ids: readonly number[],
    slot: number,
    catalog: PremiumCatalog,
    library?: PremiumLibrary | null,
    lang: "en" | "ru" = "en",
    faction?: string,
    history?: PremiumCrewHistory,
): string {
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    const slots = premiumCrewSlots(ids, catalog);
    const current = slots[slot] === undefined ? undefined : catalog.units[slots[slot]!];
    const picks = rankPremiumCrewRoster(ids, slot, catalog, library, lang, faction, history);
    const heading = current
        ? t(`Replacing ${current.name}`, `Заменить ${current.name}`)
        : t(`Choose level ${CREW_LEVELS[slot]}`, `Выберите уровень ${CREW_LEVELS[slot]}`);
    const scoreHelp = t(
        "Observed SQLite battle score: win = 1, draw = ½, loss = 0. n counts independent battle pairs, with mirrored seats averaged together. Suggestions need at least 50 pairs and are ranked by the lower 95% bound. Scores describe whole armies, not a predicted chance for this swap.",
        "Результат боёв из SQLite: победа = 1, ничья = ½, поражение = 0. n — число независимых пар боёв с усреднением зеркальных сторон. Для совета нужно минимум 50 пар; порядок — по нижней границе 95% интервала. Это результаты целых армий, не прогноз замены.",
    );
    const context = history?.slots[slot]?.contextUnits ?? [];
    const population = context.length
        ? t("With ", "Вместе с ") + context.map((id) => catalog.units[id].name).join(", ")
        : t("All armies · selected filters", "Все армии · выбранные фильтры");
    const enough = picks.some((pick) => pick.suggestion);
    const factionNames: Record<string, string> = { Life: "Жизнь", Nature: "Природа", Chaos: "Хаос", Might: "Сила" };
    const factionName = lang === "ru" && faction ? (factionNames[faction] ?? faction) : faction;
    return `<div class="premium-crew-roster-heading" data-crew-history-snapshot="${e(history?.snapshotId ?? "")}"><h3>${e(heading)} <small>· L${CREW_LEVELS[slot]}</small></h3><span>${picks.length} ${t("units", "юнитов")} · <button type="button" class="premium-crew-score-help" data-premium-help-title="${t("Battle score", "Результат боёв")}" data-premium-help="${e(scoreHelp)}">${t("Battle score %", "Результат %")} ⓘ</button></span>${faction ? `<button type="button" class="premium-text-button" data-crew-roster-all>${e(factionName)} · ${t("Show all", "Все фракции")} ×</button>` : ""}</div><p class="premium-crew-roster-population">${e(population)}${enough ? "" : ` · ${t("Not enough games to recommend picks yet", "Пока мало боёв для рекомендаций")}`}</p><div class="premium-crew-roster-grid" role="group" aria-label="${t("All crew units, sorted by recorded results", "Все юниты по результатам боёв")}">${picks
        .map((pick) => {
            const item = catalog.units[pick.id];
            const replaced = slots[pick.slot] === undefined ? undefined : catalog.units[slots[pick.slot]!];
            const action = pick.selected
                ? t(`Remove ${item.name} from crew`, `Убрать ${item.name} из армии`)
                : replaced
                  ? t(`Pick ${item.name}, replacing ${replaced.name}`, `Выбрать ${item.name} вместо ${replaced.name}`)
                  : t(`Pick ${item.name}`, `Выбрать ${item.name}`);
            const row = pick.evidence;
            const percent = row ? premiumPercent(row.score) : "—";
            const historyNote = row
                ? t(
                      `Recorded score: ${percent} across ${row.families} independent battle pairs. 95% interval ${premiumPercent(row.interval[0])}–${premiumPercent(row.interval[1])}${row.families < CREW_HISTORY_MINIMUM ? "; small sample" : ""}.`,
                      `Результат: ${percent}, независимых пар боёв: ${row.families}. 95% интервал ${premiumPercent(row.interval[0])}–${premiumPercent(row.interval[1])}${row.families < CREW_HISTORY_MINIMUM ? "; малая выборка" : ""}.`,
                  )
                : t(
                      "No recorded battles for this unit in the selected population.",
                      "В выбранной выборке нет боёв с этим юнитом.",
                  );
            const scope = pick.contextUnits.length
                ? t("Armies with ", "Армии с ") + pick.contextUnits.map((id) => catalog.units[id].name).join(", ")
                : t(
                      "All armies in the selected dataset, army type and battlefield.",
                      "Все армии в выбранном наборе, типе армии и поле.",
                  );
            const detail = [action, historyNote, scope, ...pick.signals.map((signal) => signal.text)].join(" · ");
            const badge = pick.selected
                ? `<span class="premium-crew-roster-picked" aria-hidden="true">✓</span>`
                : pick.suggestion
                  ? `<span class="premium-crew-roster-rank" aria-hidden="true">${pick.suggestion === 1 ? t("#1", "#1") : `#${pick.suggestion}`}</span>`
                  : "";
            const label = `${action} · ${row ? `${percent} ${t("recorded score", "в боях")} · n=${row.families}` : t("no recorded games", "нет записанных боёв")}${pick.suggestion ? ` · #${pick.suggestion} ${t("suggestion", "совет")}` : ""}`;
            return `<button type="button" class="premium-crew-roster-unit${pick.suggestion ? ` premium-crew-suggestion-${pick.suggestion}` : ""}${pick.selected ? " premium-crew-roster-selected" : ""}" data-crew-roster-pick="${pick.id}" data-crew-target-slot="${pick.slot}" data-knowledge-reference="${e(item.anchor)}" data-premium-reference-note="${e(detail)}" aria-pressed="${pick.selected}" aria-label="${e(label)}"><span class="premium-crew-roster-portrait"><span class="premium-crew-icon-crop">${portraitMarkup(item.slug, item.name, { className: "premium-portrait", eager: true })}</span>${badge}<small class="premium-crew-roster-level" aria-hidden="true">${item.level}</small></span><strong>${e(item.name)}</strong><span class="premium-crew-roster-percent">${percent}</span><small class="premium-crew-roster-sample${row && row.families < CREW_HISTORY_MINIMUM ? " premium-crew-small-sample" : ""}">${row ? `n=${row.families}` : t("No games", "Нет боёв")}</small></button>`;
        })
        .join("")}</div>`;
}
