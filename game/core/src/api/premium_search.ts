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

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === "object" && !Array.isArray(value));
const finiteOrNull = (value: unknown): boolean =>
    value === null || (typeof value === "number" && Number.isFinite(value));
const isSources = (value: unknown): boolean =>
    Array.isArray(value) &&
    value.every(
        (source: unknown) =>
            isRecord(source) && [source.id, source.name, source.href].every((field) => typeof field === "string"),
    );
const isEvidence = (value: unknown): boolean => {
    if (
        !isRecord(value) ||
        typeof value.evidenceId !== "string" ||
        (value.label !== undefined && typeof value.label !== "string") ||
        typeof value.independentFamilies !== "number" ||
        !Number.isSafeInteger(value.independentFamilies) ||
        value.independentFamilies < 0 ||
        !["none", "limited", "supported"].includes(value.status as string) ||
        typeof value.caveat !== "string"
    )
        return false;
    if ("metrics" in value)
        return (
            ["observed-health-metrics", "observed-combat-metrics"].includes(value.evidenceKind as string) &&
            isRecord(value.metrics) &&
            Object.values(value.metrics).every(
                (metric) =>
                    isRecord(metric) &&
                    typeof metric.description === "string" &&
                    [metric.mean, metric.minFamilyMean, metric.maxFamilyMean].every(finiteOrNull),
            )
        );
    return (
        (value.scoreRate === null ||
            (typeof value.scoreRate === "number" && value.scoreRate >= 0 && value.scoreRate <= 1)) &&
        Array.isArray(value.interval95) &&
        value.interval95.length === 2 &&
        value.interval95.every((bound: unknown) => typeof bound === "number" && bound >= 0 && bound <= 1) &&
        value.interval95[0] <= value.interval95[1]
    );
};

const validEvent = (kind: string, event: Record<string, unknown>): boolean => {
    if (kind === "meta")
        return (
            (event.context === undefined || ["match", "general"].includes(event.context as string)) &&
            (event.stage === undefined || ["draft", "setup", "board", "fight"].includes(event.stage as string)) &&
            (event.evidenceAvailable === undefined || typeof event.evidenceAvailable === "boolean")
        );
    if (kind === "delta") return typeof event.text === "string";
    if (kind === "done") return event.sources === undefined || isSources(event.sources);
    if (kind === "sources") return isSources(event.items);
    if (kind === "premium_evidence") return isEvidence(event.packet);
    if (kind === "error") return event.message === undefined || typeof event.message === "string";
    if (kind === "status") return event.phase === undefined || typeof event.phase === "string";
    return true;
};

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
                    if (!isRecord(parsed) || !validEvent(kind, parsed)) throw new Error();
                    event = parsed as PremiumSearchEvent;
                } catch {
                    throw new Error("The answer could not be read. Please try again.");
                }
                if (kind === "error") throw new Error(event.message ?? "Premium advice could not finish.");
                if (kind === "meta") premium = event.mode === "premium";
                if (!premium)
                    throw new Error("Premium advice needs a server update. Please try again after the update.");
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
