import { getAuthToken } from "./auth-state";
import { portraitMarkup } from "./portrait";
import { premiumCrewFactionSlot, rankPremiumCrewPicks } from "./premium-crew-picks";
import {
    escapePremiumHtml as e,
    premiumPercent as pct,
    type PremiumCatalog,
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
import {
    PREMIUM_CREW_STORAGE_KEY,
    readPremiumCrewDraft,
    normalizePremiumCrewDraft,
    premiumCrewShareUrl,
    type CrewBattlefield,
} from "./premium-crew-state";

export function initPremiumCrew(
    root: HTMLElement,
    catalog: PremiumCatalog,
    lang: "en" | "ru",
    getData: () => PremiumLibraryResponse | undefined,
    evidenceUrl: () => string,
) {
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    let stored: string | null = null;
    try {
        stored = localStorage.getItem(PREMIUM_CREW_STORAGE_KEY);
    } catch {
        /* Storage can be disabled. */
    }
    const saved = readPremiumCrewDraft(new URL(location.href), stored, catalog);
    let ids = saved.ids,
        layout: CrewLayout = saved.layout,
        battlefield: CrewBattlefield = saved.battlefield,
        slot = 0;
    let advance = false;
    let initialized = false;
    let focusAfterClose: "slot" | "unit" | "board" | "none" = "slot";
    let controller: AbortController | undefined;
    const evidenceCache = new Map<string, { families: number; score: number | null }>();
    const draft = () => ({ version: 1 as const, ids: [...ids], layout, battlefield });
    const persist = () => {
        try {
            localStorage.setItem(PREMIUM_CREW_STORAGE_KEY, JSON.stringify(draft()));
        } catch {
            /* Keep the working crew in memory. */
        }
        const current = new URL(location.href);
        if (current.searchParams.has("crew")) {
            const updated = new URL(premiumCrewShareUrl(current, draft()));
            updated.hash = current.hash;
            history.replaceState(null, "", updated.href);
        }
    };
    const picker = document.createElement("dialog");
    picker.className = "premium-crew-picker";
    picker.setAttribute("aria-labelledby", "premium-crew-picker-title");
    picker.innerHTML = `<header><div><p class="premium-eyebrow" data-crew-progress></p><h2 id="premium-crew-picker-title" aria-live="polite"></h2></div><button type="button" class="premium-crew-close" data-crew-close aria-label="${t("Close unit picker", "Закрыть выбор юнита")}">×</button></header><label class="premium-search"><span class="sr-only">${t("Search crew units", "Поиск юнитов для армии")}</span><input type="search" data-crew-search placeholder="${t("Search a unit or faction…", "Юнит или фракция…")}" /></label><p class="premium-crew-sort"></p><div data-crew-choices class="premium-crew-choices"></div>`;
    root.append(picker);
    const search = picker.querySelector<HTMLInputElement>("[data-crew-search]")!;
    const announce = (message: string) => {
        const status = root.querySelector<HTMLElement>(".premium-crew-toolbar [role=status]");
        if (status) status.textContent = message;
    };
    const choices = () => {
        picker.querySelector(".premium-crew-sort")!.textContent = getData()?.library
            ? t(
                  "Crew fit and recorded battles · faction bonuses, roles and artifacts",
                  "По составу и записанным боям · бонусы фракций, роли и артефакты",
              )
            : t(
                  "Crew fit first · faction bonuses, roles and artifacts · hover for abilities",
                  "По составу · бонусы фракций, роли и артефакты · способности при наведении",
              );
        const visible = rankPremiumCrewPicks(ids, slot, catalog, getData()?.library, lang)
            .filter(({ id }) => {
                const item = catalog.units[id];
                return `${item.name} ${item.faction}`.toLowerCase().includes(search.value.trim().toLowerCase());
            })
            .map((pick, index) => ({ ...pick, rank: index + 1 }));
        picker.querySelector<HTMLElement>("[data-crew-choices]")!.innerHTML =
            visible
                .map((pick) => {
                    const { id, evidence: row, selected } = pick;
                    const item = catalog.units[id];
                    const signals = selected
                        ? ""
                        : pick.signals
                              .slice(0, 2)
                              .map(
                                  (signal) =>
                                      `<span class="premium-crew-fit ${signal.kind === "lost-synergy" ? "premium-crew-fit-loss" : ""}" ${signal.detail ? `data-premium-help-title="${e(signal.text)}" data-premium-help="${e(signal.detail)}"` : ""}>${signal.faction ? `<img src="/assets/images/units/factions/${signal.faction.toLowerCase()}_128.webp" alt="" width="16" height="16" />` : ""}${e(signal.text)}</span>`,
                              )
                              .join("");
                    const artifacts = selected
                        ? ""
                        : pick.artifacts
                              .map(
                                  ({ item, tier, benefit }) =>
                                      `<img src="${e(item.icon)}" alt="${e(item.name)}" width="24" height="24" data-premium-help-title="${e(item.name)}" data-premium-help="${e(t(`Tier ${tier} for this crew. `, `Уровень ${tier} для состава. `) + item.description + " · " + benefit.label + ": " + benefit.names.join(", "))}" />`,
                              )
                              .join("");
                    return `<button type="button" data-crew-pick="${id}" data-knowledge-reference="${e(item.anchor)}" ${selected ? "disabled" : ""}>${portraitMarkup(item.slug, item.name, { className: "premium-portrait" })}<span class="premium-crew-choice-copy"><strong>${e(item.name)}</strong><small>${e(item.faction)} · ${crewRole(item.kit?.role, lang)}</small>${signals ? `<span class="premium-crew-fit-signals">${signals}</span>` : ""}${artifacts ? `<span class="premium-crew-choice-artifacts" aria-label="${t("Artifacts after this pick", "Артефакты после выбора")}">${artifacts}</span>` : ""}</span><span class="premium-crew-choice-score">${selected ? (pick.current ? t("Current", "Сейчас") : t("Picked", "В армии")) : `#${pick.rank}`}<small title="${row ? e(t(`${row.families} recorded battle pairs; historical score, not a win prediction`, `${row.families} записанных пар боёв; история, не прогноз победы`)) : ""}">${row && row.families >= 50 ? `${pct(row.score)} ${t("recorded", "в боях")}` : selected ? "" : t("crew fit", "по составу")}</small></span></button>`;
                })
                .join("") || `<p class="premium-empty">${t("No matching units.", "Нет подходящих юнитов.")}</p>`;
    };
    const open = (index: number, continuePicking = false, fromBoard = false) => {
        if (!Number.isInteger(index) || index < 0 || index >= CREW_LEVELS.length) return;
        slot = index;
        advance = continuePicking;
        focusAfterClose = fromBoard ? "unit" : "slot";
        search.value = "";
        picker.querySelector("[data-crew-progress]")!.textContent = t(
            `${ids.length} / 6 PICKED`,
            `ВЫБРАНО ${ids.length} / 6`,
        );
        picker.querySelector("h2")!.textContent = t(
            `Choose a level ${CREW_LEVELS[slot]} unit`,
            `Выберите юнита ${CREW_LEVELS[slot]} уровня`,
        );
        choices();
        if (!picker.open) picker.showModal();
        search.focus();
    };
    const renderEvidence = (box: HTMLElement, packet: { families: number; score: number | null }) => {
        box.innerHTML = `<details class="premium-crew-notes"><summary>${packet.families ? t(`${packet.families} recorded battle ${packet.families === 1 ? "pair" : "pairs"}`, `Записанных пар боёв: ${packet.families}`) : t("This crew has no recorded battles yet", "Этот состав ещё не встречался в записях")}</summary><p>${packet.families >= 50 && packet.score !== null ? `${pct(packet.score)} ${t("historical battle score for this exact crew.", "исторический результат точного состава.")}` : t("The formation and artifact suggestions use current game rules. More battles are needed to compare this exact crew’s performance.", "Расстановка и артефакты подобраны по текущим правилам. Для сравнения результатов точного состава нужно больше боёв.")}</p></details>`;
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
        const cacheKey = token + ":" + query;
        const cached = evidenceCache.get(cacheKey);
        if (cached) return renderEvidence(box, cached);
        box.textContent = t("Checking recorded games…", "Проверяем записанные бои…");
        try {
            const response = await fetch(`${evidenceUrl()}?${query}`, {
                headers: { Authorization: token, Accept: "application/json" },
                cache: "no-store",
                signal: AbortSignal.any([current.signal, AbortSignal.timeout(8000)]),
            });
            if (!response.ok) throw new Error("Crew history unavailable");
            const packet = (await response.json()) as {
                snapshotId: string;
                ownUnits: number[];
                families: number;
                score: number | null;
                cohort: string;
                map: string;
            };
            if (current.signal.aborted || !box.isConnected) return;
            if (
                packet.snapshotId !== data.snapshot.snapshotId ||
                packet.cohort !== data.library.scope.cohort ||
                packet.map !== String(data.library.scope.map ?? "all") ||
                JSON.stringify(packet.ownUnits) !== JSON.stringify([...ids].sort((a, b) => a - b)) ||
                !Number.isSafeInteger(packet.families) ||
                packet.families < 0 ||
                (packet.score !== null && (!Number.isFinite(packet.score) || packet.score < 0 || packet.score > 1)) ||
                (packet.families === 0 && packet.score !== null)
            )
                throw new Error("Crew history does not match this selection");
            if (evidenceCache.size >= 32) evidenceCache.delete(evidenceCache.keys().next().value!);
            evidenceCache.set(cacheKey, packet);
            renderEvidence(box, packet);
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
        if (!initialized) {
            ids = samplePremiumCrew(getData()?.library, catalog, ids);
            initialized = true;
        }
        if (getData()?.library) battlefield = String(getData()!.library!.scope.map ?? "all") as CrewBattlefield;
        target.innerHTML = renderPremiumCrew(
            ids,
            catalog,
            lang,
            layout,
            battlefield === "all" ? 1 : Number(battlefield),
            !!getData()?.library,
        );
        persist();
        void checkEvidence();
    };
    const setCrew = (next: number[]) => {
        ids = normalizePremiumCrewDraft({ ...draft(), ids: next }, catalog).ids;
        refresh();
    };
    root.addEventListener("click", (event) => {
        const button = (event.target as Element).closest<HTMLButtonElement>("button");
        if (!button) return;
        if (button.hasAttribute("data-crew-close")) picker.close();
        if (button.hasAttribute("data-crew-slot")) {
            const index = Number(button.dataset.crewSlot);
            open(
                index,
                premiumCrewSlots(ids, catalog)[index] === undefined,
                button.classList.contains("premium-crew-token"),
            );
        }
        if (button.hasAttribute("data-crew-remove")) {
            const id = premiumCrewSlots(ids, catalog)[Number(button.dataset.crewRemove)];
            setCrew(ids.filter((value) => value !== id));
            root.querySelector<HTMLButtonElement>(`[data-crew-slot="${button.dataset.crewRemove}"]`)?.focus();
        }
        if (button.hasAttribute("data-crew-pick")) {
            const id = Number(button.dataset.crewPick);
            if (ids.includes(id) || catalog.units[id]?.level !== CREW_LEVELS[slot]) return;
            const slots = premiumCrewSlots(ids, catalog);
            const fillingEmpty = slots[slot] === undefined;
            slots[slot] = id;
            setCrew(slots.filter((value): value is number => value !== undefined));
            const next = premiumCrewSlots(ids, catalog).findIndex((value) => value === undefined);
            if (advance && fillingEmpty && next >= 0) open(next, true);
            else {
                if (advance && fillingEmpty) focusAfterClose = "board";
                picker.close();
            }
        }
        if (button.hasAttribute("data-crew-sample") && getData()?.library)
            setCrew(samplePremiumCrew(getData()!.library!, catalog));
        if (button.hasAttribute("data-crew-faction")) {
            const faction = button.dataset.crewFaction!;
            const next = premiumCrewFactionSlot(ids, faction, catalog, getData()?.library);
            if (next === undefined)
                return announce(t("No legal pick for this bonus", "Нет доступного выбора для бонуса"));
            open(next);
            search.value = faction;
            choices();
        }
        if (button.hasAttribute("data-crew-clear")) {
            setCrew([]);
            root.querySelector<HTMLButtonElement>("[data-crew-slot]")?.focus();
        }
        if (button.hasAttribute("data-crew-share")) {
            const link = premiumCrewShareUrl(new URL(location.href), draft());
            void (async () => {
                try {
                    await navigator.clipboard.writeText(link);
                    announce(t("Crew link copied", "Ссылка на состав скопирована"));
                } catch {
                    const fallback = root.querySelector<HTMLElement>("[data-crew-share-fallback]")!;
                    fallback.hidden = false;
                    const input = fallback.querySelector<HTMLInputElement>("input")!;
                    input.value = link;
                    input.focus();
                    input.select();
                    announce(t("Copy the link below", "Скопируйте ссылку ниже"));
                }
            })();
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
    picker.addEventListener("close", () => {
        if (focusAfterClose === "board") {
            const board = root.querySelector<HTMLElement>(".premium-crew-board");
            board?.setAttribute("tabindex", "-1");
            board?.focus({ preventScroll: true });
            board?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } else if (focusAfterClose === "slot" || focusAfterClose === "unit")
            root.querySelector<HTMLButtonElement>(
                `${focusAfterClose === "unit" ? ".premium-crew-token" : ""}[data-crew-slot="${slot}"]`,
            )?.focus({ preventScroll: true });
    });
    root.addEventListener("change", (event) => {
        const target = event.target as HTMLSelectElement;
        if (!target.matches("[data-crew-layout]")) return;
        layout = target.value === "spread" ? "spread" : "screen";
        refresh();
        root.querySelector<HTMLSelectElement>("[data-crew-layout]")?.focus();
    });
    return {
        battlefield: saved.battlefield,
        refresh,
        suspend() {
            controller?.abort();
            focusAfterClose = "none";
            if (picker.open) picker.close();
        },
    };
}
