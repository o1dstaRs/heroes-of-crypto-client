import { knowledgeAiAskUrl } from "./knowledge_ai";
import type { PremiumEvidence } from "./premium_client";

export interface PremiumSearchMessage {
    role: "user" | "assistant";
    content: string;
}

export interface PremiumSearchEvent {
    text?: string;
    answer?: string;
    message?: string;
    mode?: string;
    context?: "match" | "general";
    evidenceAvailable?: boolean;
    stage?: "draft" | "setup" | "board" | "fight";
    phase?: string;
    items?: { id: string; name: string; href: string }[];
    sources?: { id: string; name: string; href: string }[];
    packet?: PremiumEvidence;
}

export const premiumSearchGameId = (pathname: string): string | undefined =>
    /^\/game\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i.exec(pathname)?.[1];

export const premiumSearchBody = (question: string, pathname: string, history: PremiumSearchMessage[]) => {
    const body = {
        mode: "premium",
        question: question.trim(),
        lang: "en",
        gameId: premiumSearchGameId(pathname),
        history: history.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 2000) })),
    };
    while (body.history.length && new TextEncoder().encode(JSON.stringify(body)).length > 15_000)
        body.history.splice(0, 2);
    return body;
};

/** Require the Premium service handshake so an old or misconfigured server cannot return free KB answers. */
export const readPremiumSearch = async (
    response: Response,
    onEvent: (kind: string, event: PremiumSearchEvent) => void,
): Promise<string> => {
    if (!response.ok || !response.body) {
        const failure = (await response.json().catch(() => ({}))) as { code?: string };
        if (response.status === 429) throw new Error("Please wait a moment before asking again.");
        if (response.status === 401) throw new Error("Please sign in again to use Premium advice.");
        if (response.status === 403) throw new Error("Premium access could not be verified for this account or match.");
        if (failure?.code === "premium_context_unavailable")
            throw new Error("Your match could not be read. Try again for advice on its current state.");
        throw new Error("Premium advice is unavailable. Please try again shortly.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let premium = false;
    let receivedBytes = 0;
    try {
        for (;;) {
            const chunk = await reader.read();
            receivedBytes += chunk.value?.byteLength ?? 0;
            if (receivedBytes > 512_000)
                throw new Error("The answer was too large. Please ask a more specific question.");
            buffer = (buffer + decoder.decode(chunk.value, { stream: !chunk.done })).replaceAll("\r\n", "\n");
            let boundary: number;
            while ((boundary = buffer.indexOf("\n\n")) >= 0) {
                const frame = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                const lines = frame.split("\n");
                const kind = lines
                    .find((line) => line.startsWith("event:"))
                    ?.slice(6)
                    .trim();
                const raw = lines
                    .filter((line) => line.startsWith("data:"))
                    .map((line) => line.slice(5).trim())
                    .join("\n");
                if (!kind || !raw) continue;
                let event: PremiumSearchEvent;
                try {
                    const parsed: unknown = JSON.parse(raw);
                    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
                    event = parsed as PremiumSearchEvent;
                } catch {
                    throw new Error("The answer could not be read. Please try again.");
                }
                if (kind === "error") throw new Error(event.message ?? "Premium advice could not finish.");
                if (kind === "meta" && event.mode === "premium") premium = true;
                if (!premium)
                    throw new Error("Premium advice needs a server update. Please try again after the update.");
                if (kind === "delta" && typeof event.text !== "string")
                    throw new Error("The answer could not be read. Please try again.");
                if (kind === "done" && (typeof event.answer !== "string" || !event.answer.trim()))
                    throw new Error("The answer was interrupted. Please try again.");
                onEvent(kind, event);
                if (kind === "done") return event.answer!;
            }
            if (chunk.done) break;
        }
        throw new Error("The answer was interrupted. Please try again.");
    } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
};

export const fetchPremiumSearch = (
    body: ReturnType<typeof premiumSearchBody>,
    headers: Record<string, string>,
    signal: AbortSignal,
): Promise<Response> =>
    fetch(knowledgeAiAskUrl(), {
        method: "POST",
        signal: AbortSignal.any([signal, AbortSignal.timeout(110_000)]),
        headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...headers },
        body: JSON.stringify(body),
    });
