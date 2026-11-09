import { getAuthToken } from "./auth-state";
import { renderMarkdown } from "./markdown-lite";
import { renderPremiumAiEvidence } from "./premium-ai-panel";
import { createCrewStrategy, premiumCrewStrategyRequest, type CrewStrategyState } from "./premium-crew-strategy";
import {
    CREW_RECOMMENDATION_CATEGORIES,
    premiumCrewComboDraft,
    renderPremiumCrewRecommendations,
    type CrewRecommendationCategory,
} from "./premium-crew-recommendations";
import { premiumCrewFactionSlot } from "./premium-crew-picks";
import { renderPremiumCrewRoster } from "./premium-crew-roster";
import { validCrewHistory, type PremiumCrewHistory } from "./premium-crew-history";
import { premiumPercent as pct, type PremiumCatalog, type PremiumLibraryResponse } from "./premium-library";
import {
    CREW_LEVELS,
    premiumCrewSlots,
    renderPremiumCrew,
    samplePremiumCrew,
    randomPremiumEnemy,
    premiumCrewBoardPlan,
    premiumCrewArtifactBenefit,
    type CrewLayout,
    type PremiumCrewPlanner,
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
    getMinimumFamilies: () => number = () => 50,
    onAccessLost: () => void = () => {},
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
    let faction: string | undefined;
    let enemyIds = saved.enemyIds ?? [];
    let artifactIds: [number, number] = saved.artifactIds ?? [0, 0];
    let equipped: readonly number[] = [];
    let recommendationCategory: CrewRecommendationCategory = "units";
    let planner: PremiumCrewPlanner | undefined;
    let plannerLoading = false;
    let plannerFailed = false;
    let initialized = false;
    let strategyEnabled = false;
    let controller: AbortController | undefined;
    let historyController: AbortController | undefined;
    let history: PremiumCrewHistory | undefined;
    const historyCache = new Map<string, PremiumCrewHistory>();
    const evidenceCache = new Map<string, { families: number; score: number | null }>();
    const renderStrategy = (state: CrewStrategyState) => {
        const box = root.querySelector<HTMLElement>("[data-crew-strategy]");
        if (!box) return;
        const waiting = state.phase === "waiting" || state.phase === "loading";
        box.setAttribute("aria-busy", String(waiting));
        const label =
            state.phase === "error"
                ? t("Strategy is unavailable right now.", "План боя сейчас недоступен.")
                : waiting
                  ? t("Planning for this crew…", "Составляем план для этой армии…")
                  : state.phase === "idle"
                    ? ids.length !== 6
                        ? t("Choose all six units to get a plan.", "Выберите шесть юнитов для плана боя.")
                        : t("Preparing the formation…", "Готовим расстановку…")
                    : "";
        box.innerHTML = `<header><h3>${t("Battle plan", "План боя")}</h3><small>${t("Updates automatically", "Обновляется автоматически")}</small></header><p class="premium-fine" role="status">${label}</p>${state.text ? `<div class="premium-crew-strategy-answer">${renderMarkdown(state.text)}</div>` : ""}${state.phase === "error" ? `<button type="button" class="premium-text-button" data-crew-strategy-retry>${t("Retry", "Повторить")}</button>` : ""}${state.phase === "ready" && state.evidence.length ? `<details class="premium-crew-notes"><summary>${t("Data used", "Использованные данные")}</summary>${state.evidence.map((packet) => renderPremiumAiEvidence(packet, lang)).join("")}</details>` : ""}`;
    };
    const strategy = createCrewStrategy({ onChange: renderStrategy, onAccessLost });
    const draft = () => ({
        version: 1 as const,
        ids: [...ids],
        layout,
        battlefield,
        ...(enemyIds.length ? { enemyIds: [...enemyIds] } : {}),
        ...(artifactIds.some(Boolean) ? { artifactIds: [...artifactIds] as [number, number] } : {}),
    });
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
            window.history.replaceState(null, "", updated.href);
        }
    };
    const announce = (message: string) => {
        const status = root.querySelector<HTMLElement>(".premium-crew-toolbar [role=status]");
        if (status) status.textContent = message;
    };
    const loadPlanner = async () => {
        if (planner || plannerLoading || plannerFailed) return;
        plannerLoading = true;
        try {
            planner = (await import("@heroesofcrypto/common/src/ai/placement/adapter")).finalizeA19Placement;
        } catch {
            plannerFailed = true;
        } finally {
            plannerLoading = false;
        }
        refresh(false);
        if (plannerFailed)
            announce(
                t(
                    "Game AI could not load. Click Randomize enemy to retry.",
                    "Не удалось загрузить игровой ИИ. Нажмите «Случайный враг» для повтора.",
                ),
            );
    };
    const refreshRecommendations = () => {
        const target = root.querySelector<HTMLElement>("[data-crew-recommendations]");
        if (target)
            target.innerHTML = renderPremiumCrewRecommendations(
                ids,
                slot,
                recommendationCategory,
                catalog,
                getData()?.library,
                lang,
                getMinimumFamilies(),
                history,
                equipped,
            );
    };
    const refreshRoster = () => {
        const roster = root.querySelector<HTMLElement>("[data-crew-roster]");
        if (!roster) return;
        roster.innerHTML = renderPremiumCrewRoster(ids, slot, catalog, getData()?.library, lang, faction, history);
        root.querySelectorAll<HTMLButtonElement>("[data-crew-slot]").forEach((button) => {
            const active = Number(button.dataset.crewSlot) === slot;
            button.setAttribute("aria-pressed", String(active));
            button.closest(".premium-crew-slot")?.classList.toggle("premium-crew-slot-active", active);
        });
        refreshRecommendations();
    };
    const selectSlot = (index: number, scroll = false) => {
        if (!Number.isInteger(index) || index < 0 || index >= CREW_LEVELS.length) return;
        slot = index;
        refreshRoster();
        if (scroll)
            root.querySelector(".premium-crew-roster-heading")?.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    const renderEvidence = (box: HTMLElement, packet: { families: number; score: number | null }) => {
        box.innerHTML = `<details class="premium-crew-notes"><summary>${packet.families ? t(`${packet.families} recorded battle ${packet.families === 1 ? "pair" : "pairs"}`, `Записанных пар боёв: ${packet.families}`) : t("This crew has no recorded battles yet", "Этот состав ещё не встречался в записях")}</summary><p>${packet.families >= 50 && packet.score !== null ? `${pct(packet.score)} ${t("historical battle score for this exact crew.", "исторический результат точного состава.")}` : t("More battles are needed to compare this exact crew’s performance. Each unit’s hover shows the population used for its recorded score.", "Для сравнения результатов точного состава нужно больше боёв. При наведении на юнита указана выборка для его результата.")}</p></details>`;
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
    const expectedHistory = () => {
        const data = getData();
        return data?.snapshot && data.library
            ? {
                  snapshotId: data.snapshot.snapshotId,
                  sourceSha256: data.snapshot.sourceSha256,
                  cohort: data.library.scope.cohort,
                  map: String(data.library.scope.map ?? "all"),
                  ownUnits: [...ids],
              }
            : undefined;
    };
    const checkHistory = async () => {
        historyController?.abort();
        const expected = expectedHistory(),
            token = getAuthToken();
        if (!expected || !token) return;
        const key = token + JSON.stringify(expected);
        const cached = historyCache.get(key);
        if (cached) {
            if (history !== cached) {
                history = cached;
                refresh(false);
            }
            return;
        }
        const current = new AbortController();
        historyController = current;
        const params = new URLSearchParams({
            snapshot: expected.snapshotId,
            cohort: expected.cohort,
            map: expected.map,
            units: expected.ownUnits.join(","),
        });
        try {
            const response = await fetch(`${evidenceUrl()}/picks?${params}`, {
                headers: { Authorization: token, Accept: "application/json" },
                cache: "no-store",
                signal: AbortSignal.any([current.signal, AbortSignal.timeout(8000)]),
            });
            if (!response.ok) return;
            const value: unknown = await response.json();
            if (
                current.signal.aborted ||
                JSON.stringify(expectedHistory()) !== JSON.stringify(expected) ||
                getAuthToken() !== token ||
                !validCrewHistory(value, expected, catalog)
            )
                return;
            if (historyCache.size >= 32) historyCache.delete(historyCache.keys().next().value!);
            historyCache.set(key, value);
            history = value;
            refresh(false);
        } catch {
            /* Unit-level SQLite library results remain visible when co-play history is unavailable. */
        }
    };
    const refresh = (loadHistory = true) => {
        const target = root.querySelector<HTMLElement>("[data-crew-content]");
        if (!target) return;
        const focusKeys = [
            "data-crew-roster-pick",
            "data-crew-randomize",
            "data-crew-recommendation",
            "data-crew-combo",
            "data-crew-artifact",
            "data-crew-artifact-tier",
            "data-crew-artifacts-auto",
        ];
        const focused = target.querySelector<HTMLButtonElement>(
            [
                ...focusKeys.map((key) => `[${key}]:focus-visible`),
                ".premium-crew-slots [data-crew-slot]:focus-visible",
            ].join(","),
        );
        const scrollToCrew = !initialized && location.hash === "#premium-crew";
        if (!initialized) {
            ids = samplePremiumCrew(getData()?.library, catalog, ids);
            initialized = true;
        }
        if (getData()?.library) battlefield = String(getData()!.library!.scope.map ?? "all") as CrewBattlefield;
        if (enemyIds.length) enemyIds = randomPremiumEnemy(ids, catalog, Math.random, enemyIds);
        const expected = expectedHistory();
        if (!expected || !validCrewHistory(history, expected, catalog)) history = undefined;
        const data = getData();
        artifactIds = artifactIds.map((id, index) => {
            const item = catalog.artifacts[`${index + 1}:${id}`];
            return item && premiumCrewArtifactBenefit(item.slug, ids, lang).names.length ? id : 0;
        }) as [number, number];
        const plan = premiumCrewBoardPlan(
            ids,
            enemyIds,
            catalog,
            layout,
            battlefield === "all" ? 1 : Number(battlefield),
            planner,
            data?.library,
            history,
            artifactIds,
        );
        equipped = plan.own.input.artifacts;
        target.innerHTML = renderPremiumCrew(
            ids,
            catalog,
            lang,
            layout,
            battlefield === "all" ? 1 : Number(battlefield),
            !!getData()?.library,
            getData()?.library,
            history,
            enemyIds,
            planner,
            plan,
        );
        if (enemyIds.length && !planner && !plannerFailed) void loadPlanner();
        const randomize = target.querySelector<HTMLButtonElement>("[data-crew-randomize]");
        if (randomize && plannerLoading) {
            randomize.setAttribute("aria-disabled", "true");
            randomize.setAttribute("aria-busy", "true");
            randomize.textContent = t("Loading game AI…", "Загрузка игрового ИИ…");
        }
        refreshRoster();
        if (focused) {
            const keys = focusKeys.filter((key) => focused.hasAttribute(key));
            const selector = keys.length
                ? keys.map((key) => `[${key}="${focused.getAttribute(key)}"]`).join("")
                : `.premium-crew-slots [data-crew-slot="${focused.dataset.crewSlot}"]`;
            target.querySelector<HTMLButtonElement>(selector)?.focus({ preventScroll: true });
        }
        persist();
        strategy.update(
            strategyEnabled && data?.entitlement.active
                ? premiumCrewStrategyRequest(
                      plan,
                      catalog,
                      lang,
                      data.snapshot && data.library
                          ? {
                                snapshotId: data.snapshot.snapshotId,
                                ...data.library.scope,
                                minimumFamilies: getMinimumFamilies(),
                            }
                          : undefined,
                      data.snapshot?.sourceSha256,
                  )
                : undefined,
        );
        void checkEvidence();
        if (loadHistory) void checkHistory();
        if (scrollToCrew) target.closest("#premium-crew")?.scrollIntoView({ block: "start" });
    };
    const setCrew = (next: number[]) => {
        ids = normalizePremiumCrewDraft({ ...draft(), ids: next }, catalog).ids;
        refresh();
    };
    root.addEventListener("click", (event) => {
        const button = (event.target as Element).closest<HTMLButtonElement>("button");
        if (!button) return;
        if (button.hasAttribute("data-crew-recommendation-minimum")) {
            const minimum = Number(button.dataset.crewRecommendationMinimum);
            const filter = root.querySelector<HTMLSelectElement>('[data-premium-filters] select[name="minimum"]');
            if (![1, 20].includes(minimum) || !filter) return;
            filter.value = String(minimum);
            filter.dispatchEvent(new Event("change", { bubbles: true }));
            root.querySelector<HTMLButtonElement>(`[data-crew-recommendation="${recommendationCategory}"]`)?.focus({
                preventScroll: true,
            });
        }
        if (button.hasAttribute("data-crew-recommendation")) {
            const category = button.dataset.crewRecommendation as CrewRecommendationCategory;
            if (!CREW_RECOMMENDATION_CATEGORIES.includes(category)) return;
            recommendationCategory = category;
            refreshRecommendations();
            root.querySelector<HTMLButtonElement>(`[data-crew-recommendation="${category}"]`)?.focus({
                preventScroll: true,
            });
        }
        if (button.hasAttribute("data-crew-combo")) {
            const picks = (button.dataset.crewCombo ?? "").split(",").map(Number);
            const draft = premiumCrewComboDraft(ids, picks, catalog, slot);
            if (!draft) return;
            faction = undefined;
            setCrew(draft.ids);
            announce(t("Picked ", "Выбраны ") + picks.map((id) => catalog.units[id].name).join(" + "));
            root.querySelector<HTMLButtonElement>(`[data-crew-recommendation="${recommendationCategory}"]`)?.focus({
                preventScroll: true,
            });
        }
        if (button.hasAttribute("data-crew-artifact")) {
            const tier = Number(button.dataset.crewArtifactTier),
                id = Number(button.dataset.crewArtifact);
            const item = catalog.artifacts[`${tier}:${id}`];
            if (![1, 2].includes(tier) || !item || !premiumCrewArtifactBenefit(item.slug, ids, lang).names.length)
                return;
            artifactIds[tier - 1] = id;
            refresh(false);
            announce(t("Equipped ", "Выбран ") + item.name);
            root.querySelector<HTMLButtonElement>(
                `[data-crew-artifact-tier="${tier}"][data-crew-artifact="${id}"]`,
            )?.focus({ preventScroll: true });
        }
        if (button.hasAttribute("data-crew-artifacts-auto")) {
            artifactIds = [0, 0];
            refresh(false);
            root.querySelector<HTMLButtonElement>("[data-crew-artifacts-auto]")?.focus({ preventScroll: true });
        }
        if (button.hasAttribute("data-crew-strategy-retry")) strategy.retry();
        if (button.hasAttribute("data-crew-randomize")) {
            if (plannerLoading) return;
            enemyIds = randomPremiumEnemy(ids, catalog);
            plannerFailed = false;
            refresh(false);
            root.querySelector<HTMLButtonElement>("[data-crew-randomize]")?.focus({ preventScroll: true });
            announce(
                enemyIds.length
                    ? ids.length !== 6
                        ? t("Enemy crew ready · complete your six picks", "Армия врага готова · выберите шесть юнитов")
                        : planner
                          ? t(
                                "Enemy crew randomized · formation updated",
                                "Случайный враг выбран · расстановка обновлена",
                            )
                          : t(
                                "Enemy crew randomized · loading game AI…",
                                "Случайный враг выбран · загрузка игрового ИИ…",
                            )
                    : t("Not enough unpicked units for an enemy crew", "Недостаточно свободных юнитов для армии врага"),
            );
        }
        if (button.hasAttribute("data-crew-slot")) {
            faction = undefined;
            selectSlot(Number(button.dataset.crewSlot), button.classList.contains("premium-crew-token"));
        }
        if (button.hasAttribute("data-crew-remove") || button.hasAttribute("data-crew-roster-pick")) {
            const id = button.hasAttribute("data-crew-remove")
                ? premiumCrewSlots(ids, catalog)[Number(button.dataset.crewRemove)]
                : Number(button.dataset.crewRosterPick);
            const item = id === undefined ? undefined : catalog.units[id];
            if (!item?.kit?.amount || id === undefined) return;
            faction = undefined;
            if (ids.includes(id)) {
                const remaining = ids.filter((value) => value !== id);
                slot = premiumCrewSlots(remaining, catalog).findIndex(
                    (value, index) => value === undefined && CREW_LEVELS[index] === item.level,
                );
                setCrew(remaining);
                announce(
                    t(
                        `${item.name} removed · ${ids.length} / 6 units`,
                        `${item.name} убран · ${ids.length} / 6 юнитов`,
                    ),
                );
            } else {
                const target = Number(button.dataset.crewTargetSlot);
                if (
                    !Number.isInteger(target) ||
                    target < 0 ||
                    target >= CREW_LEVELS.length ||
                    CREW_LEVELS[target] !== item.level
                )
                    return;
                const slots = premiumCrewSlots(ids, catalog);
                const fillingEmpty = slots[target] === undefined;
                slots[target] = id;
                const next = slots.findIndex((value) => value === undefined);
                slot = fillingEmpty && next >= 0 ? next : (target + 1) % CREW_LEVELS.length;
                setCrew(slots.filter((value): value is number => value !== undefined));
                announce(
                    t(
                        `${item.name} picked · ${ids.length} / 6 units`,
                        `${item.name} выбран · ${ids.length} / 6 юнитов`,
                    ),
                );
            }
            if (event.detail === 0)
                root.querySelector<HTMLButtonElement>(".premium-crew-suggestion-1")?.focus({ preventScroll: true });
        }
        if (button.hasAttribute("data-crew-sample") && getData()?.library) {
            faction = undefined;
            slot = 0;
            setCrew(samplePremiumCrew(getData()!.library!, catalog));
        }
        if (button.hasAttribute("data-crew-faction")) {
            faction = button.dataset.crewFaction!;
            const next = premiumCrewFactionSlot(ids, faction, catalog, getData()?.library, history);
            if (next === undefined)
                return announce(t("No legal pick for this bonus", "Нет доступного выбора для бонуса"));
            selectSlot(next, true);
        }
        if (button.hasAttribute("data-crew-roster-all")) {
            faction = undefined;
            refreshRoster();
        }
        if (button.hasAttribute("data-crew-clear")) {
            faction = undefined;
            slot = 0;
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
    root.addEventListener("change", (event) => {
        const target = event.target as HTMLSelectElement;
        if (!target.matches("[data-crew-layout]")) return;
        layout = target.value === "spread" ? "spread" : "screen";
        refresh();
        root.querySelector<HTMLSelectElement>("[data-crew-layout]")?.focus();
    });
    return {
        battlefield: saved.battlefield,
        refresh() {
            strategyEnabled = true;
            refresh();
        },
        suspend() {
            strategyEnabled = false;
            strategy.suspend();
            controller?.abort();
            historyController?.abort();
            history = undefined;
        },
    };
}
