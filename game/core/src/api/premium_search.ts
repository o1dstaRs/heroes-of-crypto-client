import { knowledgeAiAskUrl } from "./knowledge_ai";
import type { PremiumSearchMessage } from "./premium_search_stream";
export { readPremiumSearch } from "./premium_search_stream";
export type { PremiumSearchMessage, PremiumSearchEvent } from "./premium_search_stream";

export const premiumSearchGameId = (pathname: string): string | undefined =>
    /^\/game\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i.exec(pathname)?.[1];

export const premiumSearchBody = (
    question: string,
    pathname: string,
    history: PremiumSearchMessage[],
    inspectedUnitId?: string,
    inspectedOptionId?: string,
) => {
    const gameId = premiumSearchGameId(pathname);
    const body = {
        mode: "premium",
        question: question.trim(),
        lang: "en",
        gameId,
        ...(gameId && inspectedUnitId ? { inspectedUnitId } : {}),
        ...(gameId && inspectedUnitId && inspectedOptionId ? { inspectedOptionId } : {}),
        history: history.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 2000) })),
    };
    while (body.history.length && new TextEncoder().encode(JSON.stringify(body)).length > 15_000)
        body.history.splice(0, 2);
    return body;
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
