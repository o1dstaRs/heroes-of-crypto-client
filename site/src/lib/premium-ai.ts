import {
    readPremiumSearch,
    type PremiumSearchEvent,
    type PremiumSearchMessage,
} from "../../../game/core/src/api/premium_search_stream";
import { knowledgeAiAskUrl } from "./knowledge-ai-client";

export interface PremiumAiSelection {
    snapshotId: string;
    cohort: string;
    map?: number;
    minimumFamilies: number;
}
export type PremiumAiEvent = PremiumSearchEvent & { library?: PremiumAiSelection };
export type { PremiumSearchMessage };

export function premiumAiBody(
    question: string,
    lang: "en" | "ru",
    library: PremiumAiSelection,
    history: PremiumSearchMessage[],
) {
    const body = {
        mode: "premium",
        question: question.trim(),
        lang,
        library: {
            snapshotId: library.snapshotId,
            cohort: library.cohort,
            ...(library.map === undefined ? {} : { map: library.map }),
            minimumFamilies: library.minimumFamilies,
        },
        history: history.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 2000) })),
    };
    while (body.history.length && new TextEncoder().encode(JSON.stringify(body)).length > 15_000)
        body.history.splice(0, 2);
    return body;
}

export const samePremiumSelection = (a?: PremiumAiSelection, b?: PremiumAiSelection): boolean =>
    Boolean(
        a &&
        b &&
        a.snapshotId === b.snapshotId &&
        a.cohort === b.cohort &&
        a.map === b.map &&
        a.minimumFamilies === b.minimumFamilies,
    );

export function readPremiumLibrarySearch(
    response: Response,
    selection: PremiumAiSelection,
    onEvent: (kind: string, event: PremiumAiEvent) => void,
): Promise<string> {
    return readPremiumSearch(response, (kind, raw) => {
        const event = raw as PremiumAiEvent;
        if (kind === "meta" && (event.evidenceAvailable !== true || !samePremiumSelection(event.library, selection))) {
            throw new Error("AI could not verify the selected dataset. Reload the library and try again.");
        }
        onEvent(kind, event);
    });
}

export function fetchPremiumLibrarySearch(
    body: ReturnType<typeof premiumAiBody>,
    token: string,
    signal: AbortSignal,
): Promise<Response> {
    return fetch(knowledgeAiAskUrl(), {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(110_000)]),
        headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: token },
        body: JSON.stringify(body),
    });
}
