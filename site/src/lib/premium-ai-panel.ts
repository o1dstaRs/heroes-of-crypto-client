import { getAuthToken } from "./auth-state";
import { renderMarkdown } from "./markdown-lite";
import { initPremiumKnowledgePreview } from "./premium-knowledge-preview";
import { escapePremiumHtml as e, premiumPercent as pct } from "./premium-library";
import {
    fetchPremiumLibrarySearch,
    premiumAiBody,
    readPremiumLibrarySearch,
    samePremiumSelection,
    type PremiumAiEvent,
    type PremiumAiSelection,
    type PremiumSearchMessage,
} from "./premium-ai";

type Evidence = NonNullable<PremiumAiEvent["packet"]>;
const sourceHref = (href: string): string | undefined => {
    if (/^\/(?!\/)[^\s\\]*$/.test(href)) return href;
    try {
        const url = new URL(href);
        if (
            url.protocol === "https:" &&
            (url.hostname === "heroesofcrypto.io" || url.hostname.endsWith(".heroesofcrypto.io"))
        )
            return url.href;
    } catch {
        /* Ignore malformed source links. */
    }
    return undefined;
};

export function renderPremiumAiEvidence(packet: Evidence, lang: "en" | "ru"): string {
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    const value = (n: number | null) =>
        n === null ? t("Unavailable", "Нет данных") : n.toLocaleString(lang, { maximumFractionDigits: 2 });
    const detail =
        "metrics" in packet
            ? '<div class="premium-table-scroll"><table><thead><tr><th>' +
              t("Measured contribution", "Измеренный вклад") +
              "</th><th>" +
              t("Mean", "Среднее") +
              "</th><th>" +
              t("Observed range", "Наблюдаемый диапазон") +
              "</th></tr></thead><tbody>" +
              Object.values(packet.metrics)
                  .map(
                      (metric) =>
                          "<tr><td>" +
                          e(metric.description) +
                          "</td><td>" +
                          value(metric.mean) +
                          "</td><td>" +
                          value(metric.minFamilyMean) +
                          "–" +
                          value(metric.maxFamilyMean) +
                          "</td></tr>",
                  )
                  .join("") +
              "</tbody></table></div>"
            : "<p><strong>" +
              (packet.scoreRate === null
                  ? t("No matching evidence", "Нет подходящих данных")
                  : pct(packet.scoreRate) + " " + t("observed score", "наблюдаемый счёт")) +
              "</strong> · " +
              t("95% interval", "95% интервал") +
              " " +
              pct(packet.interval95[0]) +
              "–" +
              pct(packet.interval95[1]) +
              "</p>";
    return (
        '<details class="premium-ai-evidence-card"><summary><span>' +
        e(packet.label ?? t("Measured evidence", "Данные измерений")) +
        "</span><small>" +
        packet.independentFamilies.toLocaleString(lang) +
        " " +
        t("families", "семейств") +
        (packet.status !== "supported" ? " · " + t("limited", "мало данных") : "") +
        "</small></summary><div>" +
        detail +
        "<p>" +
        e(packet.caveat) +
        "</p><code>" +
        e(packet.evidenceId) +
        "</code></div></details>"
    );
}

export function initPremiumAi(root: HTMLElement, lang: "en" | "ru", onAccessLost: () => void) {
    const t = (en: string, ru: string) => (lang === "ru" ? ru : en);
    const panel = root.querySelector<HTMLElement>("[data-premium-ai]")!;
    const form = panel.querySelector<HTMLFormElement>("[data-ai-form]")!;
    const input = panel.querySelector<HTMLTextAreaElement>("[data-ai-question]")!;
    const submit = panel.querySelector<HTMLButtonElement>("[data-ai-submit]")!;
    const stop = panel.querySelector<HTMLButtonElement>("[data-ai-stop]")!;
    const transcript = panel.querySelector<HTMLElement>("[data-ai-transcript]")!;
    const status = panel.querySelector<HTMLElement>("[data-ai-status]")!;
    const scope = panel.querySelector<HTMLElement>("[data-ai-scope]")!;
    const preview = initPremiumKnowledgePreview(root, lang);
    let selection: PremiumAiSelection | undefined;
    let enabled = false;
    let history: PremiumSearchMessage[] = [];
    let controller: AbortController | undefined;
    let stopProgress: (() => void) | undefined;
    const setBusy = (busy: boolean) => {
        submit.disabled = busy || !enabled;
        stop.hidden = !busy;
        panel.querySelectorAll<HTMLButtonElement>("[data-ai-prompt]").forEach((button) => (button.disabled = busy));
        form.setAttribute("aria-busy", String(busy));
    };
    const clear = () => {
        preview.hide();
        stopProgress?.();
        stopProgress = undefined;
        controller?.abort();
        controller = undefined;
        history = [];
        transcript.replaceChildren();
        input.value = "";
        status.textContent = "";
        setBusy(false);
    };
    const setAccess = (active: boolean, next?: PremiumAiSelection, label = "") => {
        if (!active || !samePremiumSelection(selection, next)) clear();
        enabled = active;
        selection = next;
        panel.hidden = !active;
        scope.textContent = label;
        scope.title = next?.snapshotId ?? "";
        setBusy(Boolean(controller));
    };
    const ask = async () => {
        if (controller || !enabled || !input.value.trim()) return;
        const token = getAuthToken();
        if (!token) {
            clear();
            onAccessLost();
            return;
        }
        const question = input.value.trim();
        if (question.length > 2000) return;
        preview.hide();
        const selected = selection ? { ...selection } : undefined;
        const pending = new AbortController();
        controller = pending;
        setBusy(true);
        input.value = "";
        status.textContent = selected
            ? t("Reading your selected data…", "Изучаем выбранные данные…")
            : t("Checking game rules and strategy…", "Проверяем правила игры и стратегии…");
        const turn = document.createElement("article");
        turn.className = "premium-ai-turn";
        turn.innerHTML =
            '<p class="premium-ai-question">' +
            e(question) +
            '</p><div class="premium-ai-working" data-ai-working><div class="premium-ai-working-header"><span class="premium-ai-working-mark" aria-hidden="true">✦</span><p role="status" aria-live="polite" data-ai-phase></p><span class="premium-ai-elapsed" aria-hidden="true" data-ai-elapsed></span></div><div class="premium-ai-skeleton" aria-hidden="true"><i></i><i></i><i></i></div></div><div class="premium-ai-answer"></div><div class="premium-ai-sources"></div><div class="premium-ai-evidence"></div>';
        transcript.append(turn);
        while (transcript.children.length > 8) transcript.firstElementChild?.remove();
        const answer = turn.querySelector<HTMLElement>(".premium-ai-answer")!;
        const sources = turn.querySelector<HTMLElement>(".premium-ai-sources")!;
        const evidence = turn.querySelector<HTMLElement>(".premium-ai-evidence")!;
        const working = turn.querySelector<HTMLElement>("[data-ai-working]")!;
        working.hidden = false;
        const phase = turn.querySelector<HTMLElement>("[data-ai-phase]")!;
        const elapsed = turn.querySelector<HTMLElement>("[data-ai-elapsed]")!;
        const started = Date.now();
        const elapsedTimer = setInterval(() => {
            elapsed.textContent = `${Math.floor((Date.now() - started) / 1000)}s`;
        }, 1000);
        phase.textContent = status.textContent;
        status.textContent = "";
        answer.setAttribute("aria-busy", "true");
        const finishProgress = () => {
            clearInterval(elapsedTimer);
            working.hidden = true;
            answer.setAttribute("aria-busy", "false");
        };
        stopProgress = finishProgress;
        const packets = new Map<string, Evidence>();
        let text = "";
        const showSources = (items: PremiumAiEvent["sources"]) => {
            sources.innerHTML = (items ?? [])
                .flatMap((item) => {
                    const href = sourceHref(item.href);
                    return href
                        ? [
                              '<a href="' +
                                  e(href) +
                                  '" target="_blank" rel="noopener noreferrer">' +
                                  e(item.name) +
                                  "</a>",
                          ]
                        : [];
                })
                .join("");
        };
        const active = () =>
            enabled &&
            controller === pending &&
            !pending.signal.aborted &&
            getAuthToken() === token &&
            samePremiumSelection(selected, selection);
        try {
            const response = await fetchPremiumLibrarySearch(
                premiumAiBody(question, lang, selected, history),
                token,
                pending.signal,
            );
            if (!active()) {
                await response.body?.cancel();
                return;
            }
            if (response.status === 401 || response.status === 403) {
                clear();
                onAccessLost();
                return;
            }
            const completed = await readPremiumLibrarySearch(response, selected, (kind, event) => {
                if (!active()) return;
                if (kind === "delta") {
                    text += event.text ?? "";
                    working.setAttribute("data-has-answer", String(Boolean(text.trim())));
                    answer.innerHTML = renderMarkdown(text);
                } else if (kind === "reset") {
                    text = "";
                    working.setAttribute("data-has-answer", "false");
                    answer.replaceChildren();
                } else if (kind === "status") {
                    const label =
                        event.phase === "answering"
                            ? t("Writing your answer…", "Готовим ответ…")
                            : event.phase === "reading"
                              ? t("Reading game mechanics", "Изучаем механики игры")
                              : event.phase === "searching" || event.phase === "listing"
                                ? t("Checking relevant rules", "Проверяем нужные правила")
                                : t("Considering your strategy…", "Обдумываем стратегию…");
                    phase.textContent =
                        event.detail && event.phase !== "answering" && event.phase !== "thinking"
                            ? `${label}: ${event.detail.slice(0, 120)}`
                            : label;
                } else if (kind === "sources") showSources(event.items);
                else if (kind === "premium_evidence" && event.packet) {
                    packets.set(event.packet.evidenceId, event.packet);
                    evidence.innerHTML =
                        '<p class="premium-ai-evidence-label">' +
                        t("Evidence consulted", "Использованные данные") +
                        "</p>" +
                        [...packets.values()]
                            .slice(0, 32)
                            .map((packet) => renderPremiumAiEvidence(packet, lang))
                            .join("");
                } else if (kind === "done") {
                    answer.innerHTML = renderMarkdown(event.answer!);
                    showSources(event.sources);
                }
            });
            if (!active()) return;
            history = [
                ...history,
                { role: "user", content: question },
                { role: "assistant", content: completed },
            ].slice(-6) as PremiumSearchMessage[];
            status.textContent = selected
                ? t(
                      "Answer ready. Ask a follow-up or explore the evidence below.",
                      "Ответ готов. Задайте уточнение или изучите данные ниже.",
                  )
                : t("Answer ready. Ask a follow-up to explore further.", "Ответ готов. Задайте уточняющий вопрос.");
        } catch (error) {
            if (controller !== pending) return;
            const stopped = pending.signal.aborted;
            const message = stopped
                ? t(
                      "Stopped. This answer is incomplete; ask again to continue.",
                      "Остановлено. Ответ не завершён; задайте вопрос снова.",
                  )
                : t(
                      error instanceof Error ? error.message : "AI search is unavailable. Please try again.",
                      "Не удалось завершить ответ или проверить выбранные данные. Повторите попытку.",
                  );
            const notice = document.createElement("p");
            notice.className = "premium-ai-error";
            notice.textContent = message;
            turn.append(notice);
            status.textContent = message;
            input.value = question;
        } finally {
            finishProgress();
            if (controller === pending) {
                stopProgress = undefined;
                controller = undefined;
                setBusy(false);
            }
        }
    };
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void ask();
    });
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            if (input.value.trim()) form.requestSubmit();
        }
    });
    panel.querySelectorAll<HTMLButtonElement>("[data-ai-prompt]").forEach((button) =>
        button.addEventListener("click", () => {
            input.value = button.dataset.aiPrompt ?? "";
            void ask();
        }),
    );
    stop.addEventListener("click", () => controller?.abort());
    panel.querySelector("[data-ai-clear]")!.addEventListener("click", () => {
        clear();
        input.focus();
    });
    window.addEventListener("pagehide", () => clear());
    return {
        setAccess,
        askQuestion(question: string) {
            if (!enabled || controller) return;
            input.value = question;
            panel.scrollIntoView({ block: "start", behavior: "smooth" });
            void ask();
        },
    };
}
