import { initPremiumAi } from "./premium-ai-panel";
import { initPremiumCrew } from "./premium-crew-panel";
import { renderPremiumMatchups } from "./premium-insights";
import { getAuthToken, onAuthStateChange } from "./auth-state";
import {
    premiumApiUrl,
    type PremiumCatalog,
    type PremiumEntitlement,
    type PremiumLibraryResponse,
} from "./premium-library";
import {
    renderPremiumArtifacts,
    renderPremiumCombos,
    renderPremiumDashboard,
    renderPremiumUnits,
    type PremiumView,
} from "./premium-render";

export function initPremiumPage(): void {
    const root = document.querySelector<HTMLElement>("[data-premium-page]");
    if (!root) return;
    const lang = root.dataset.language === "ru" ? "ru" : "en";
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    const catalog = JSON.parse(document.getElementById("premium-catalog")!.textContent!) as PremiumCatalog;
    const status = root.querySelector<HTMLElement>("[data-premium-status]")!;
    const retry = root.querySelector<HTMLButtonElement>("[data-premium-retry]")!;
    const gate = root.querySelector<HTMLElement>("[data-premium-gate]")!;
    const login = root.querySelector<HTMLAnchorElement>("[data-premium-login]")!;
    const workspace = root.querySelector<HTMLElement>("[data-premium-workspace]")!;
    const content = root.querySelector<HTMLElement>("[data-premium-content]")!;
    const form = root.querySelector<HTMLFormElement>("[data-premium-filters]")!;
    const refresh = root.querySelector<HTMLElement>("[data-premium-refresh]")!;
    const refreshStatus = root.querySelector<HTMLElement>("[data-premium-refresh-status]")!;
    const refreshRetry = root.querySelector<HTMLButtonElement>("[data-premium-refresh-retry]")!;
    const select = (name: string) => form.elements.namedItem(name) as HTMLSelectElement;
    const view: PremiumView = { lang, minimum: 50, search: "", level: "", sort: "confidence", combo: "pairs", tier: 1 };
    let data: PremiumLibraryResponse | undefined;
    let controller: AbortController | undefined;
    let currentToken: string | null = null;
    let busy = false;
    let scopeUnsettled = false;
    let entitlement: PremiumEntitlement | undefined;
    const url = (resource: "account" | "library" | "crew") =>
        premiumApiUrl(resource, {
            hostname: location.hostname,
            protocol: location.protocol,
            port: import.meta.env.VITE_ARENA_SAME_HOST_API_PORT,
            api: import.meta.env.VITE_HOST_GAME_API || import.meta.env.VITE_GAME_API,
            production:
                import.meta.env.VITE_IS_PROD === "true" ||
                (import.meta.env.VITE_IS_PROD !== "false" && import.meta.env.PROD === true),
        });
    const ai = initPremiumAi(root, lang, () => void load(), catalog);
    const crew = initPremiumCrew(
        root,
        catalog,
        lang,
        () => data,
        () => url("crew"),
    );
    select("map").value = crew.battlefield;
    const updateAi = () => {
        const snapshot = data?.snapshot;
        const library = data?.library;
        form.hidden = !library;
        refresh.hidden = !library;
        root.querySelectorAll<HTMLAnchorElement>("[data-premium-library-nav]").forEach((link) => {
            link.hidden = !library && link.hash !== "#premium-crew";
        });
        ai.setAccess(
            entitlement?.active === true,
            snapshot && library
                ? { snapshotId: snapshot.snapshotId, ...library.scope, minimumFamilies: view.minimum }
                : undefined,
            snapshot && library
                ? [
                      snapshot?.studyProfile.replace("premium-", ""),
                      select("cohort").selectedOptions[0]?.text,
                      select("map").selectedOptions[0]?.text,
                      view.minimum + "+ " + t("battle pairs", "пар боёв"),
                  ]
                      .filter(Boolean)
                      .join(" · ")
                : t(
                      "Game rules and strategy · statistical library not yet available",
                      "Правила игры и стратегии · статистическая библиотека пока недоступна",
                  ),
        );
    };
    const clear = () => {
        crew.suspend();
        ai.setAccess(false);
        workspace.hidden = true;
        content.replaceChildren();
        scopeUnsettled = false;
        refreshStatus.textContent = "";
        refreshRetry.hidden = true;
        data = undefined;
    };
    const locked = (signedIn: boolean) => {
        clear();
        gate.hidden = false;
        retry.hidden = true;
        login.hidden = signedIn;
        status.textContent = signedIn
            ? t("Premium is not active on this account.", "На этом аккаунте Premium не активен.")
            : t(
                  "Sign in on this website to check Premium or calibration access. Your game login is separate.",
                  "Войдите на этом сайте для проверки Premium или доступа на калибровке. Вход в игру выполняется отдельно.",
              );
    };
    const activeStatus = () =>
        entitlement?.reason === "calibration"
            ? t("Premium included · calibration access", "Premium включён · доступ на калибровке")
            : entitlement?.reason === "test"
              ? t("Premium active · test access", "Premium активен · тестовый доступ")
              : t("Premium active · strategy guidance", "Premium активен · стратегические подсказки");
    const request = async (endpoint: string, token: string, signal: AbortSignal) => {
        const response = await fetch(endpoint, {
            signal,
            cache: "no-store",
            headers: { Accept: "application/json", Authorization: token, "x-request-id": crypto.randomUUID() },
        });
        if (response.status === 401 || response.status === 403) throw new Error(`access:${response.status}`);
        if (!response.ok) throw new Error(`service:${response.status}`);
        return response.json();
    };
    const load = async (recheckOnly = false) => {
        const token = getAuthToken();
        if (recheckOnly && busy && token === currentToken) return;
        controller?.abort();
        controller = new AbortController();
        const signal = controller.signal;
        const controllerForRequest = controller;
        const timeout = setTimeout(() => controllerForRequest.abort(new Error("timeout")), 20000);
        const sessionChanged = token !== currentToken;
        const keepResults = !recheckOnly && !sessionChanged && Boolean(data?.library);
        const isCurrent = () => controller === controllerForRequest && getAuthToken() === token;
        currentToken = token;
        busy = true;
        retry.hidden = true;
        if (keepResults) {
            crew.suspend();
            scopeUnsettled = true;
            refreshRetry.hidden = true;
            refreshStatus.textContent = t(
                "Updating filters. Showing previous results.",
                "Обновляем фильтры. Пока показаны предыдущие результаты.",
            );
            ai.setAccess(true, undefined, t("Updating battle results…", "Обновляем результаты боёв…"), false);
        } else if (sessionChanged || !recheckOnly) {
            clear();
            gate.hidden = true;
            login.hidden = true;
        }
        if (!token) {
            locked(false);
            busy = false;
            content.setAttribute("aria-busy", "false");
            clearTimeout(timeout);
            return;
        }
        if (!keepResults && !recheckOnly) {
            status.textContent = t("Loading your Premium library…", "Загружаем библиотеку Premium…");
        }
        const params = new URLSearchParams({ cohort: select("cohort").value, map: select("map").value });
        if (select("snapshot").value) params.set("snapshot", select("snapshot").value);
        if (!recheckOnly || sessionChanged || !data) content.setAttribute("aria-busy", "true");
        let accountVerified = false;
        try {
            const account = (await request(url("account"), token, signal)) as { entitlement: PremiumEntitlement };
            if (!isCurrent()) return;
            signal.throwIfAborted();
            if (typeof account.entitlement?.active !== "boolean") throw new Error("invalid account response");
            entitlement = account.entitlement;
            if (!entitlement.active) {
                locked(true);
                return;
            }
            accountVerified = true;
            if (recheckOnly && !sessionChanged && data) {
                status.textContent = activeStatus();
                return;
            }
            const result = (await request(`${url("library")}?${params}`, token, signal)) as PremiumLibraryResponse;
            if (!isCurrent()) return;
            signal.throwIfAborted();
            if (!result.entitlement?.active) {
                locked(true);
                return;
            }
            if (!Array.isArray(result.snapshots) || !("library" in result)) throw new Error("invalid library response");
            const markup = renderPremiumDashboard(result, catalog, view);
            select("snapshot").replaceChildren(
                ...result.snapshots.map(
                    (snapshot) =>
                        new Option(
                            `${snapshot.createdAt && Number.isFinite(Date.parse(snapshot.createdAt)) ? new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(snapshot.createdAt)) : snapshot.studyProfile.replace("premium-", "")} · ${snapshot.fights.toLocaleString()} ${t("battles", "боёв")}`,
                            snapshot.snapshotId,
                            false,
                            snapshot.snapshotId === result.snapshot?.snapshotId,
                        ),
                ),
            );
            data = result;
            scopeUnsettled = false;
            gate.hidden = true;
            workspace.hidden = false;
            content.innerHTML = markup;
            crew.refresh();
            updateAi();
            refreshStatus.textContent = keepResults ? t("Results updated.", "Результаты обновлены.") : "";
            status.textContent = activeStatus();
            if (!result.library) retry.hidden = false;
        } catch (error) {
            if (!isCurrent()) return;
            if (error instanceof Error && error.message.startsWith("access:")) {
                locked(error.message !== "access:401");
                if (error.message === "access:401")
                    status.textContent = t(
                        "Your session could not be verified. Sign in again.",
                        "Не удалось проверить сеанс. Войдите снова.",
                    );
            } else if (keepResults && accountVerified) {
                refreshStatus.textContent = t(
                    "Couldn’t update filters. Showing previous results.",
                    "Не удалось обновить фильтры. Показаны предыдущие результаты.",
                );
                refreshRetry.hidden = false;
                ai.setAccess(
                    true,
                    undefined,
                    t(
                        "Refresh the results to ask about this selection.",
                        "Обновите результаты, чтобы задать вопрос по этой выборке.",
                    ),
                    false,
                );
            } else {
                clear();
                gate.hidden = true;
                retry.hidden = false;
                status.textContent = t(
                    "The Premium service is unavailable. Please retry; your account access has not been changed.",
                    "Сервис Premium недоступен. Повторите попытку; доступ вашего аккаунта не изменён.",
                );
            }
        } finally {
            clearTimeout(timeout);
            if (controller === controllerForRequest) {
                busy = false;
                content.setAttribute("aria-busy", "false");
            }
        }
    };
    retry.addEventListener("click", () => void load());
    refreshRetry.addEventListener("click", () => {
        select("cohort").focus({ preventScroll: true });
        void load();
    });
    form.addEventListener("submit", (event) => event.preventDefault());
    form.addEventListener("change", (event) => {
        if ((event.target as HTMLSelectElement).name === "minimum") {
            view.minimum = Number(select("minimum").value);
            if (scopeUnsettled) return;
            updateAi();
            if (data) {
                content.innerHTML = renderPremiumDashboard(data, catalog, view);
                crew.refresh();
            }
        } else void load();
    });
    const updateUnits = () => {
        if (data?.library)
            content.querySelector("[data-premium-units]")!.innerHTML = renderPremiumUnits(
                data.library.units,
                catalog,
                view,
            );
    };
    content.addEventListener("input", (event) => {
        const target = event.target as HTMLInputElement;
        if (target.matches("[data-unit-search]")) {
            view.search = target.value;
            updateUnits();
        }
    });
    content.addEventListener("change", (event) => {
        const target = event.target as HTMLSelectElement;
        if (target.matches("[data-matchup-unit]") && data?.library) {
            view.matchupUnit = Number(target.value);
            content.querySelector("[data-premium-matchups]")!.innerHTML = renderPremiumMatchups(
                data.library,
                catalog,
                view,
            );
            content.querySelector<HTMLSelectElement>("[data-matchup-unit]")?.focus();
            return;
        }
        if (target.matches("[data-unit-level]")) view.level = target.value;
        if (target.matches("[data-unit-sort]")) view.sort = target.value;
        updateUnits();
    });
    content.addEventListener("click", (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
        if (!button || !data) return;
        if (button.hasAttribute("data-snapshot-question")) {
            ai.askQuestion(
                t(
                    "Use the selected snapshot to explain what works and what struggles: units within each draft level, unit pairs, artifacts within each tier, exact active synergies and complete augment plans. Cite actual sample sizes and uncertainty. Develop two or three practical strategies from those observations, explain their tradeoffs and distinguish current mechanics from historical associations. Do not claim a unique best choice when intervals overlap.",
                    "По выбранному снимку объясни, что работает и что показывает слабые результаты: юниты внутри каждого уровня драфта, пары, артефакты внутри уровня, точные активные синергии и полные планы усилений. Укажи реальные размеры выборки и неопределённость. Предложи две-три практические стратегии, объясни компромиссы и отдели текущие механики от исторических связей. Не объявляй единственного победителя при пересекающихся интервалах.",
                ),
            );
        }
        if (button.dataset.combo) {
            view.combo = button.dataset.combo === "triples" ? "triples" : "pairs";
            content.querySelector("[data-premium-combos]")!.innerHTML = renderPremiumCombos(data, catalog, view);
            content
                .querySelectorAll<HTMLButtonElement>("[data-combo]")
                .forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.combo === view.combo)));
        }
        if (button.dataset.tier) {
            view.tier = button.dataset.tier === "2" ? 2 : 1;
            content.querySelector("[data-premium-artifacts]")!.innerHTML = renderPremiumArtifacts(data, catalog, view);
            content
                .querySelectorAll<HTMLButtonElement>("[data-tier]")
                .forEach((item) => item.setAttribute("aria-pressed", String(Number(item.dataset.tier) === view.tier)));
        }
        if (button.dataset.environment) {
            select("cohort").value = button.dataset.environment;
            select("cohort").focus({ preventScroll: true });
            form.scrollIntoView({ block: "start" });
            void load();
        }
    });
    onAuthStateChange(() => void load(true));
    globalThis.addEventListener("focus", () => void load(true));
    window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
            clear();
            void load();
        }
    });
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) void load(true);
    });
    setInterval(() => {
        if (!document.hidden) void load(true);
    }, 60000);
}
