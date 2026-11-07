import { getAuthToken } from "./auth-state";
import { portraitMarkup } from "./portrait";
import {
    escapePremiumHtml as e,
    premiumPercent as pct,
    type PremiumCatalog,
    type PremiumLibrary,
    type PremiumLibraryResponse,
} from "./premium-library";
import {
    CREW_LEVELS,
    crewRole,
    premiumCrewSlots,
    renderPremiumCrew,
    samplePremiumCrew,
    type CrewLayout,
} from "./premium-crew";

export function initPremiumCrew(
    root: HTMLElement,
    catalog: PremiumCatalog,
    lang: "en" | "ru",
    getData: () => PremiumLibraryResponse | undefined,
    evidenceUrl: () => string,
) {
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    let ids: number[] = [],
        layout: CrewLayout = "screen",
        slot = 0;
    let controller: AbortController | undefined;
    const picker = document.createElement("dialog");
    picker.className = "premium-crew-picker";
    picker.setAttribute("aria-labelledby", "premium-crew-picker-title");
    picker.innerHTML = `<header><div><p class="premium-eyebrow">${t("YOUR CREW", "ВАША АРМИЯ")}</p><h2 id="premium-crew-picker-title"></h2></div><button type="button" class="premium-crew-close" data-crew-close aria-label="${t("Close unit picker", "Закрыть выбор юнита")}">×</button></header><label class="premium-search"><span class="sr-only">${t("Search crew units", "Поиск юнитов для армии")}</span><input type="search" data-crew-search placeholder="${t("Search a unit or faction…", "Юнит или фракция…")}" /></label><p class="premium-crew-sort">${t("Strongest supported results first · hover for abilities", "Сначала лучшие подтверждённые результаты · способности при наведении")}</p><div data-crew-choices class="premium-crew-choices"></div>`;
    root.append(picker);
    const search = picker.querySelector<HTMLInputElement>("[data-crew-search]")!;
    const announce = (message: string) => {
        const status = root.querySelector<HTMLElement>(".premium-crew-toolbar [role=status]");
        if (status) status.textContent = message;
    };
    const choices = () => {
        const rows = new Map(getData()?.library?.units.map((row) => [row.ids[0], row]));
        const visible = Object.entries(catalog.units)
            .filter(
                ([id, item]) =>
                    item.level === CREW_LEVELS[slot] &&
                    item.kit?.amount &&
                    `${item.name} ${item.faction}`.toLowerCase().includes(search.value.trim().toLowerCase()),
            )
            .sort(([a, itemA], [b, itemB]) => {
                const x = rows.get(Number(a)),
                    y = rows.get(Number(b));
                return (
                    Number((y?.families ?? 0) >= 50) - Number((x?.families ?? 0) >= 50) ||
                    (y?.interval[0] ?? -1) - (x?.interval[0] ?? -1) ||
                    (y?.families ?? 0) - (x?.families ?? 0) ||
                    itemA.name.localeCompare(itemB.name)
                );
            });
        picker.querySelector<HTMLElement>("[data-crew-choices]")!.innerHTML =
            visible
                .map(([key, item]) => {
                    const id = Number(key),
                        row = rows.get(id),
                        selected = ids.includes(id);
                    return `<button type="button" data-crew-pick="${id}" data-knowledge-reference="${e(item.anchor)}" ${selected ? "disabled" : ""}>${portraitMarkup(item.slug, item.name, { className: "premium-portrait" })}<span><strong>${e(item.name)}</strong><small>${e(item.faction)} · ${crewRole(item.kit?.role, lang)}</small></span><span class="premium-crew-choice-score">${selected ? t("Picked", "В армии") : row ? `${pct(row.score)}<small>${row.families < 50 ? t("Few games", "Мало боёв") : t("battle score", "результат боёв")}</small>` : t("No results", "Нет результатов")}</span></button>`;
                })
                .join("") || `<p class="premium-empty">${t("No matching units.", "Нет подходящих юнитов.")}</p>`;
    };
    const open = (index: number) => {
        slot = index;
        search.value = "";
        picker.querySelector("h2")!.textContent = t(
            `Choose a level ${CREW_LEVELS[slot]} unit`,
            `Выберите юнита ${CREW_LEVELS[slot]} уровня`,
        );
        choices();
        picker.showModal();
        search.focus();
    };
    const checkEvidence = async () => {
        controller?.abort();
        const box = root.querySelector<HTMLElement>("[data-crew-evidence]"),
            data = getData();
        const token = getAuthToken();
        if (!box || ids.length !== 6 || !data?.snapshot || !data.library || !token) return;
        const current = new AbortController();
        controller = current;
        const query = new URLSearchParams({
            snapshot: data.snapshot.snapshotId,
            cohort: data.library.scope.cohort,
            units: [...ids].sort((a, b) => a - b).join(","),
            map: String(data.library.scope.map ?? "all"),
        });
        box.textContent = t("Checking recorded games…", "Проверяем записанные бои…");
        try {
            const response = await fetch(`${evidenceUrl()}?${query}`, {
                headers: { Authorization: token, Accept: "application/json" },
                cache: "no-store",
                signal: current.signal,
            });
            if (!response.ok) throw new Error("Crew history unavailable");
            const packet = (await response.json()) as {
                snapshotId: string;
                ownUnits: number[];
                families: number;
                score: number | null;
            };
            if (current.signal.aborted || !box.isConnected) return;
            if (
                packet.snapshotId !== data.snapshot.snapshotId ||
                JSON.stringify(packet.ownUnits) !== JSON.stringify([...ids].sort((a, b) => a - b)) ||
                !Number.isSafeInteger(packet.families) ||
                packet.families < 0
            )
                throw new Error("Crew history does not match this selection");
            box.innerHTML = `<details class="premium-crew-notes"><summary>${packet.families ? t(`${packet.families} recorded battle pairs`, `${packet.families} записанных пар боёв`) : t("This crew has no recorded battles yet", "Этот состав ещё не встречался в записях")}</summary><p>${packet.families >= 50 && typeof packet.score === "number" ? `${pct(packet.score)} ${t("historical battle score for this exact crew.", "исторический результат точного состава.")}` : t("The formation and artifact suggestions use current game rules. More battles are needed to compare this exact crew’s performance.", "Расстановка и артефакты подобраны по текущим правилам. Для сравнения результатов точного состава нужно больше боёв.")}</p></details>`;
        } catch {
            if (!current.signal.aborted && box.isConnected)
                box.textContent = t(
                    "Crew-specific battle history isn’t available.",
                    "История боёв этого состава недоступна.",
                );
        }
    };
    const refresh = () => {
        const target = root.querySelector<HTMLElement>("[data-crew-content]");
        if (!target) return;
        target.innerHTML = renderPremiumCrew(ids, catalog, lang, layout, getData()?.library?.scope.map ?? 1);
        void checkEvidence();
    };
    const setCrew = (next: number[]) => {
        ids = premiumCrewSlots(next, catalog).filter((id): id is number => id !== undefined);
        refresh();
    };
    root.addEventListener("click", (event) => {
        const button = (event.target as Element).closest<HTMLButtonElement>("button");
        if (!button) return;
        if (button.hasAttribute("data-crew-close")) picker.close();
        if (button.hasAttribute("data-crew-slot")) open(Number(button.dataset.crewSlot));
        if (button.hasAttribute("data-crew-remove")) {
            const id = premiumCrewSlots(ids, catalog)[Number(button.dataset.crewRemove)];
            setCrew(ids.filter((value) => value !== id));
            root.querySelector<HTMLButtonElement>(`[data-crew-slot="${button.dataset.crewRemove}"]`)?.focus();
        }
        if (button.hasAttribute("data-crew-pick")) {
            const id = Number(button.dataset.crewPick);
            if (ids.includes(id) || catalog.units[id]?.level !== CREW_LEVELS[slot]) return;
            const slots = premiumCrewSlots(ids, catalog);
            slots[slot] = id;
            setCrew(slots.filter((value): value is number => value !== undefined));
            picker.close();
            root.querySelector<HTMLButtonElement>(`[data-crew-slot="${slot}"]`)?.focus();
        }
        if (button.hasAttribute("data-crew-sample") && getData()?.library)
            setCrew(samplePremiumCrew(getData()!.library!, catalog));
        if (button.hasAttribute("data-crew-clear")) {
            setCrew([]);
            root.querySelector<HTMLButtonElement>("[data-crew-slot]")?.focus();
        }
        if (button.hasAttribute("data-add-crew")) {
            const id = Number(button.dataset.addCrew),
                item = catalog.units[id],
                slots = premiumCrewSlots(ids, catalog);
            if (!item || ids.includes(id)) return announce(t("Already in your crew", "Уже в вашей армии"));
            const index = CREW_LEVELS.findIndex((level, i) => level === item.level && slots[i] === undefined);
            if (index < 0)
                return announce(
                    t(
                        `Level ${item.level} slots are full. Choose a slot to replace.`,
                        `Все слоты ${item.level} уровня заняты. Выберите слот для замены.`,
                    ),
                );
            slots[index] = id;
            setCrew(slots.filter((value): value is number => value !== undefined));
            root.querySelector("#premium-crew")?.scrollIntoView({ block: "start", behavior: "smooth" });
        }
    });
    search.addEventListener("input", choices);
    root.addEventListener("change", (event) => {
        const target = event.target as HTMLSelectElement;
        if (!target.matches("[data-crew-layout]")) return;
        layout = target.value === "spread" ? "spread" : "screen";
        refresh();
        root.querySelector<HTMLSelectElement>("[data-crew-layout]")?.focus();
    });
    return {
        refresh,
        suspend() {
            controller?.abort();
            if (picker.open) picker.close();
        },
    };
}
