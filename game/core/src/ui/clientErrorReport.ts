import { buildApiUrl, endpoints, HOST_MATCHMAKING_API } from "../api/axios";

/**
 * Uncaught client errors go to the server log. A React render error, an unhandled rejection or a window
 * error used to leave nothing behind but a blank page on the player's screen ("white screen from time to
 * time"), with no way to learn what threw. Best-effort and throttled: a storm of identical errors sends a
 * handful, never a flood, and reporting can never itself throw into the page.
 */
export interface ClientErrorReport {
    message: string;
    stack?: string;
    source: "window" | "unhandledrejection" | "react";
    url: string;
    userAgent: string;
    at: number;
    /** Where in the app it happened (route + game id when known), for grouping. */
    context?: string;
}

const MAX_REPORTS_PER_MINUTE = 6;
const MAX_FIELD = 4000;

let sentAtMs: number[] = [];
let installed = false;

const clip = (value: unknown): string => String(value ?? "").slice(0, MAX_FIELD);

/** Shape a report from whatever was thrown. Exported for tests. */
export const clientErrorPayload = (
    error: unknown,
    source: ClientErrorReport["source"],
    context?: string,
    now: number = Date.now(),
): ClientErrorReport => {
    const err = error instanceof Error ? error : undefined;
    return {
        message: clip(err ? err.message : typeof error === "string" ? error : (JSON.stringify(error) ?? "unknown")),
        stack: err?.stack ? clip(err.stack) : undefined,
        source,
        url: typeof window !== "undefined" ? clip(window.location.href) : "",
        userAgent: typeof navigator !== "undefined" ? clip(navigator.userAgent) : "",
        at: now,
        ...(context ? { context: clip(context) } : {}),
    };
};

/** True when another report may go out now (sliding one-minute window). Exported for tests. */
export const allowClientErrorReport = (now: number, sent: number[] = sentAtMs): boolean => {
    const cutoff = now - 60_000;
    while (sent.length && sent[0] < cutoff) {
        sent.shift();
    }
    if (sent.length >= MAX_REPORTS_PER_MINUTE) {
        return false;
    }
    sent.push(now);
    return true;
};

export const reportClientError = (error: unknown, source: ClientErrorReport["source"], context?: string): void => {
    try {
        if (!allowClientErrorReport(Date.now())) {
            return;
        }
        const payload = clientErrorPayload(error, source, context);
        const token = window.localStorage.getItem("accessToken");
        void fetch(buildApiUrl(HOST_MATCHMAKING_API, endpoints.social.clientError), {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
            body: JSON.stringify(payload),
            keepalive: true,
        }).catch(() => undefined);
    } catch {
        /* reporting must never throw into the page */
    }
};

/** Install the window-level hooks once per page. */
export const installClientErrorReporting = (): void => {
    if (installed || typeof window === "undefined") {
        return;
    }
    installed = true;
    window.addEventListener("error", (event) => {
        // Resource load failures (an <img> 404) also fire "error" on window but carry no message.
        if (!event.message && !event.error) {
            return;
        }
        reportClientError(event.error ?? event.message, "window");
    });
    window.addEventListener("unhandledrejection", (event) => {
        reportClientError(event.reason, "unhandledrejection");
    });
};

/** Test hook. */
export const resetClientErrorReportingForTests = (): void => {
    sentAtMs = [];
    installed = false;
};
