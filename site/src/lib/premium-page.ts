import { initPremiumAi } from "./premium-ai-panel";
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
    const workspace = root.querySelector<HTMLElement>("[data-premium-workspace]")!;
    const content = root.querySelector<HTMLElement>("[data-premium-content]")!;
    const form = root.querySelector<HTMLFormElement>("[data-premium-filters]")!;
    const select = (name: string) => form.elements.namedItem(name) as HTMLSelectElement;
    const view: PremiumView = { lang, minimum: 50, search: "", level: "", sort: "confidence", combo: "pairs", tier: 1 };
    let data: PremiumLibraryResponse | undefined;
    let controller: AbortController | undefined;
    let currentToken: string | null = null;
    let busy = false;
    let entitlement: PremiumEntitlement | undefined;
    const url = (resource: "account" | "library") =>
        premiumApiUrl(resource, {
            hostname: location.hostname,
            protocol: location.protocol,
            port: import.meta.env.VITE_ARENA_SAME_HOST_API_PORT,
            api: import.meta.env.VITE_HOST_GAME_API || import.meta.env.VITE_GAME_API,
            production:
                import.meta.env.VITE_IS_PROD === "true" ||
                (import.meta.env.VITE_IS_PROD !== "false" && import.meta.env.PROD === true),
        });
    const ai = initPremiumAi(root, lang, () => void load());
    const updateAi = () => {
        const snapshot = data?.snapshot;
        const library = data?.library;
        ai.setSelection(
            snapshot && library
                ? { snapshotId: snapshot.snapshotId, ...library.scope, minimumFamilies: view.minimum }
                : undefined,
            [
                snapshot?.studyProfile.replace("premium-", ""),
                select("cohort").selectedOptions[0]?.text,
                select("map").selectedOptions[0]?.text,
                view.minimum + "+ " + t("families", "семейств"),
            ]
                .filter(Boolean)
                .join(" · "),
        );
    };
    const clear = () => {
        ai.setSelection();
        workspace.hidden = true;
        content.replaceChildren();
        data = undefined;
    };
    const locked = (signedIn: boolean) => {
        clear();
        gate.hidden = false;
        retry.hidden = true;
        root.querySelector<HTMLElement>("[data-premium-login]")!.hidden = signedIn;
        status.textContent = signedIn
            ? t("Premium is not active on this account.", "На этом аккаунте Premium не активен.")
            : t(
                  "Sign in to check Premium or calibration access.",
                  "Войдите для проверки Premium или доступа на калибровке.",
              );
    };
    const activeStatus = () =>
        entitlement?.reason === "calibration"
            ? t("Premium included · calibration access", "Premium включён · доступ на калибровке")
            : entitlement?.reason === "test"
              ? t("Premium active · test access", "Premium активен · тестовый доступ")
              : t("Premium active · your strategy library", "Premium активен · ваша библиотека стратегий");
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
        currentToken = token;
        busy = true;
        retry.hidden = true;
        if (sessionChanged || !recheckOnly) {
            clear();
            gate.hidden = true;
        }
        if (!token) {
            locked(false);
            busy = false;
            clearTimeout(timeout);
            return;
        }
        if (!recheckOnly) status.textContent = t("Loading your Premium library…", "Загружаем библиотеку Premium…");
        content.setAttribute("aria-busy", "true");
        try {
            const account = (await request(url("account"), token, signal)) as { entitlement: PremiumEntitlement };
            if (signal.aborted || getAuthToken() !== token) return;
            if (typeof account.entitlement?.active !== "boolean") throw new Error("invalid account response");
            entitlement = account.entitlement;
            if (!entitlement.active) {
                locked(true);
                return;
            }
            if (recheckOnly && !sessionChanged && data?.library) {
                status.textContent = activeStatus();
                return;
            }
            const params = new URLSearchParams({ cohort: select("cohort").value, map: select("map").value });
            if (select("snapshot").value) params.set("snapshot", select("snapshot").value);
            const result = (await request(`${url("library")}?${params}`, token, signal)) as PremiumLibraryResponse;
            if (signal.aborted || getAuthToken() !== token) return;
            if (!result.entitlement?.active) {
                locked(true);
                return;
            }
            if (!Array.isArray(result.snapshots) || !("library" in result)) throw new Error("invalid library response");
            data = result;
            select("snapshot").replaceChildren(
                ...result.snapshots.map(
                    (snapshot) =>
                        new Option(
                            `${snapshot.studyProfile.replace("premium-", "")} · ${snapshot.fights.toLocaleString()} ${t("battles", "боёв")}${snapshot.default ? ` · ${t("default", "основной")}` : ""}`,
                            snapshot.snapshotId,
                            false,
                            snapshot.snapshotId === result.snapshot?.snapshotId,
                        ),
                ),
            );
            gate.hidden = true;
            workspace.hidden = false;
            content.innerHTML = renderPremiumDashboard(result, catalog, view);
            updateAi();
            status.textContent = activeStatus();
            if (!result.library) retry.hidden = false;
        } catch (error) {
            if (controller !== controllerForRequest || getAuthToken() !== token) return;
            clear();
            if (error instanceof Error && error.message.startsWith("access:")) {
                locked(error.message !== "access:401");
                if (error.message === "access:401")
                    status.textContent = t(
                        "Your session could not be verified. Sign in again.",
                        "Не удалось проверить сеанс. Войдите снова.",
                    );
            } else {
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
    form.addEventListener("submit", (event) => event.preventDefault());
    form.addEventListener("change", (event) => {
        if ((event.target as HTMLSelectElement).name === "minimum") {
            view.minimum = Number(select("minimum").value);
            updateAi();
            if (data) content.innerHTML = renderPremiumDashboard(data, catalog, view);
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
        if (target.matches("[data-unit-level]")) view.level = target.value;
        if (target.matches("[data-unit-sort]")) view.sort = target.value;
        updateUnits();
    });
    content.addEventListener("click", (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
        if (!button || !data) return;
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
            void load();
            workspace.scrollIntoView({ block: "start" });
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
