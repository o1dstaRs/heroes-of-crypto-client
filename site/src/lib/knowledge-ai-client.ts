/**
 * Browser client for the Knowledge Base AI search service (heroes-of-crypto-server/src/knowledge_ai).
 *
 * The service streams server-sent events; this module resolves where it lives, sends the question and
 * turns the stream into typed events the page can render as they arrive. Pure parsing lives in
 * `parseSseChunk` so it can be unit-tested without a network.
 */

export type KnowledgeAiLanguage = "en" | "ru";

export interface KnowledgeAiSource {
    id: string;
    type: string;
    name: string;
    href: string;
}

export interface KnowledgeAiHistoryMessage {
    role: "user" | "assistant";
    content: string;
}

export type KnowledgeAiEvent =
    | { type: "meta"; language: KnowledgeAiLanguage }
    | { type: "status"; phase: "thinking" | "searching" | "reading" | "listing" | "answering"; detail?: string }
    | { type: "sources"; items: KnowledgeAiSource[] }
    | { type: "delta"; text: string }
    | { type: "reset" }
    | {
          type: "done";
          answer: string;
          sources: KnowledgeAiSource[];
          cached?: boolean;
          toolCalls?: number;
          language?: KnowledgeAiLanguage;
      }
    | { type: "error"; code: string; message: string };

export interface KnowledgeAiRequest {
    question: string;
    lang: KnowledgeAiLanguage;
    history?: KnowledgeAiHistoryMessage[];
}

export class KnowledgeAiRequestError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
        readonly retryAfterSeconds?: number,
    ) {
        super(message);
        this.name = "KnowledgeAiRequestError";
    }
}

const DEFAULT_PRODUCTION_URL = "https://test.heroesofcrypto.io/ai/knowledge";
const DEFAULT_DEV_URL = "http://localhost:3020/ai/knowledge";

/** Base URL of the service (no trailing slash), from the build env or the page's own host. */
export function knowledgeAiBaseUrl(): string {
    const configured = import.meta.env.PUBLIC_KNOWLEDGE_AI_URL as string | undefined;
    if (configured?.trim()) return configured.trim().replace(/\/+$/, "");
    const hostname = globalThis.location?.hostname ?? "";
    if (hostname === "heroesofcrypto.io" || hostname.endsWith(".heroesofcrypto.io")) return DEFAULT_PRODUCTION_URL;
    return DEFAULT_DEV_URL;
}

export const knowledgeAiAskUrl = (): string => `${knowledgeAiBaseUrl()}/ask`;

export interface ParsedSse {
    events: KnowledgeAiEvent[];
    rest: string;
}

const KNOWN_EVENTS = new Set(["meta", "status", "sources", "delta", "reset", "done", "error"]);

// The answer-language rule, kept identical to the service's (heroes-of-crypto-server
// src/knowledge_ai/language.ts) so the panel switches language before the first word arrives; the
// service still has the last word through its `meta` event.
const TRANSLIT_RUSSIAN = new Set(
    "kak chto chego pochemu zachem skolko naskolko kakoy kakoi kakaya kakie kakoe kakih kogo gde kogda kuda mozhno nuzhno nado rabotaet rabotayut rabotat luchshe luchshiy luchshii sposobnost sposobnosti yunit yunita yunity yunitov eto etot etoy etoi ili dlya kto esli igre igry igrat podnyat poluchit zarabotat pobedit uron bronya zdorovie zdorovya udacha reyting reiting zaklinanie zaklinaniya artefakt artefakty podskazhite obyasni rasskazhi".split(
        " ",
    ),
);
const ENGLISH_MARKERS = new Set(
    "how what whats what's which who whose why when where does do did is are was were can could should would will much many explain tell my me you your best better happens work works there about difference".split(
        " ",
    ),
);

/** The language a question is written in, or undefined when it cannot tell (a bare name, "MMR?"). */
export function detectQuestionLanguage(text: string): KnowledgeAiLanguage | undefined {
    if (/[а-яё]{2,}/i.test(text)) return "ru";
    const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
    if (words.some((word) => TRANSLIT_RUSSIAN.has(word))) return "ru";
    if (words.some((word) => ENGLISH_MARKERS.has(word))) return "en";
    return undefined;
}

/** The language the answer will be in: the question's, else the conversation's, else the page's. */
export function answerLanguageFor(
    question: string,
    pageLanguage: KnowledgeAiLanguage,
    history: readonly KnowledgeAiHistoryMessage[] = [],
): KnowledgeAiLanguage {
    const own = detectQuestionLanguage(question);
    if (own) return own;
    for (let index = history.length - 1; index >= 0; index -= 1) {
        if (history[index].role !== "user") continue;
        const earlier = detectQuestionLanguage(history[index].content);
        if (earlier) return earlier;
    }
    return pageLanguage;
}

/** Split buffered SSE text into complete events; `rest` holds the incomplete tail for the next chunk. */
export function parseSseChunk(buffer: string): ParsedSse {
    const events: KnowledgeAiEvent[] = [];
    const normalized = buffer.replace(/\r\n?/g, "\n");
    const lastBreak = normalized.lastIndexOf("\n\n");
    if (lastBreak === -1) return { events, rest: normalized };
    const complete = normalized.slice(0, lastBreak);
    const rest = normalized.slice(lastBreak + 2);
    for (const block of complete.split("\n\n")) {
        let name = "message";
        const data: string[] = [];
        for (const line of block.split("\n")) {
            if (line.startsWith("event:")) name = line.slice(6).trim();
            else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
        }
        if (!KNOWN_EVENTS.has(name) || data.length === 0) continue;
        try {
            const payload = JSON.parse(data.join("\n")) as Record<string, unknown>;
            events.push({ ...payload, type: name } as KnowledgeAiEvent);
        } catch {
            // A malformed frame is dropped; the stream stays usable.
        }
    }
    return { events, rest };
}

/**
 * Ask the assistant. Resolves when the stream ends; rejects with KnowledgeAiRequestError for HTTP
 * refusals (rate limit, busy, bad request) and with the underlying error for network failures.
 */
export async function askKnowledgeAi(
    request: KnowledgeAiRequest,
    onEvent: (event: KnowledgeAiEvent) => void,
    options: { signal?: AbortSignal; url?: string; fetchImpl?: typeof fetch } = {},
): Promise<void> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(options.url ?? knowledgeAiAskUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ question: request.question, lang: request.lang, history: request.history ?? [] }),
        signal: options.signal,
        cache: "no-store",
    });
    if (!response.ok) {
        let code = "http_error";
        let message = `request failed with status ${response.status}`;
        try {
            const payload = (await response.json()) as { code?: string; error?: string };
            if (payload.code) code = payload.code;
            if (payload.error) message = payload.error;
        } catch {
            // Non-JSON error body; keep the status text.
        }
        const retryAfter = Number(response.headers.get("Retry-After") ?? "");
        throw new KnowledgeAiRequestError(
            response.status,
            code,
            message,
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
        );
    }
    if (!response.body) throw new Error("empty response body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;
    while (!finished) {
        const { value, done } = await reader.read();
        buffer += done ? "\n\n" : decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buffer);
        buffer = parsed.rest;
        for (const event of parsed.events) {
            onEvent(event);
            if (event.type === "done" || event.type === "error") {
                finished = true;
                break;
            }
        }
        if (done) finished = true;
    }
    await reader.cancel().catch(() => undefined);
}
