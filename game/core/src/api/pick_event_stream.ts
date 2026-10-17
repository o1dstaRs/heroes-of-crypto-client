import type { IPickPhaseEventData } from "../ui/context/PickBanContextDefs";
import { normalizeAccessToken } from "./access_token";

const STREAM_ID_KEY = "hoc:pick-stream-id";
const RETRY_DELAYS_MS = [1_200, 2_500, 5_000];
let fallbackStreamId: string | undefined;

/** A reload keeps this tab's identity, so its abandoned stream cannot lock it out of its own draft. */
export const pickStreamId = (storage?: Pick<Storage, "getItem" | "setItem">): string => {
    try {
        const tabStorage = storage ?? sessionStorage;
        const stored = tabStorage.getItem(STREAM_ID_KEY);
        if (stored) return stored;
        const id = crypto.randomUUID();
        tabStorage.setItem(STREAM_ID_KEY, id);
        return id;
    } catch {
        return (fallbackStreamId ??= crypto.randomUUID());
    }
};

interface PickStreamCallbacks {
    onOpen(): void;
    onMessage(event: IPickPhaseEventData): void;
    onError(error: Error): void;
    onConflict?(): void;
}

interface PickStreamOptions {
    connectionId: string;
    takeover?: boolean;
    retryDelaysMs?: readonly number[];
}

const waitForRetry = (ms: number, signal: AbortSignal): Promise<void> =>
    new Promise((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", finish);
            resolve();
        };
        if (signal.aborted) return finish();
        timer = setTimeout(finish, ms);
        signal.addEventListener("abort", finish, { once: true });
    });

/** Network failures and clean stream endings retry; only an explicit seat conflict opens the other-tab view. */
export const followPickEventStream = async (
    url: string,
    callbacks: PickStreamCallbacks,
    signal: AbortSignal,
    { connectionId, takeover = false, retryDelaysMs = RETRY_DELAYS_MS }: PickStreamOptions,
): Promise<void> => {
    let failures = 0;
    while (!signal.aborted) {
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        try {
            const requestUrl = new URL(url, globalThis.location?.href);
            requestUrl.searchParams.set("connectionId", connectionId);
            if (takeover) requestUrl.searchParams.set("takeover", "1");
            const token = normalizeAccessToken(localStorage.getItem("accessToken"));
            const response = await fetch(requestUrl.toString(), {
                headers: { Accept: "text/event-stream", ...(token ? { Authorization: token } : {}) },
                cache: "no-cache",
                mode: "cors",
                signal,
            });
            if (signal.aborted) {
                await response.body?.cancel();
                return;
            }
            if (response.status === 429) {
                const reason = await response.text();
                if (signal.aborted) return;
                if (reason === "You already have an active connection") {
                    callbacks.onConflict?.();
                    return;
                }
                throw new Error("Draft event stream rate limited");
            }
            if (!response.ok || !response.body) {
                await response.body?.cancel();
                throw new Error(`Draft event stream failed: ${response.status}`);
            }

            takeover = false;
            failures = 0;
            callbacks.onOpen();
            reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (!signal.aborted) {
                const { done, value } = await reader.read();
                if (signal.aborted || done) break;
                buffer += decoder.decode(value, { stream: true });
                const frames = buffer.split(/\r?\n\r?\n/);
                buffer = frames.pop() ?? "";
                for (const frame of frames) {
                    if (signal.aborted) break;
                    const payload = frame.trim();
                    if (!payload || payload.startsWith(":")) continue;
                    let event: IPickPhaseEventData;
                    try {
                        event = JSON.parse(payload) as IPickPhaseEventData;
                    } catch {
                        continue;
                    }
                    if (event && typeof event.pp === "number" && Array.isArray(event.a)) {
                        callbacks.onMessage(event);
                    }
                }
            }
            if (!signal.aborted) callbacks.onError(new Error("Draft connection interrupted"));
        } catch (error) {
            if (signal.aborted) return;
            callbacks.onError(error instanceof Error ? error : new Error(String(error)));
        } finally {
            await reader?.cancel().catch(() => undefined);
            reader?.releaseLock();
        }
        if (signal.aborted) return;
        await waitForRetry(retryDelaysMs[Math.min(failures++, retryDelaysMs.length - 1)] ?? 0, signal);
    }
};
