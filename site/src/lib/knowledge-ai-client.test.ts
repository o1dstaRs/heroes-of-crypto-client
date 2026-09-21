import { describe, expect, test } from "bun:test";

import { askKnowledgeAi, KnowledgeAiRequestError, parseSseChunk, type KnowledgeAiEvent } from "./knowledge-ai-client";

const sse = (frames: string[]): string => frames.join("");

describe("knowledge ai client", () => {
    test("parses complete SSE frames and keeps the incomplete tail", () => {
        const first = parseSseChunk(
            ': connected\n\nevent: status\ndata: {"phase":"searching","detail":"Hydra"}\n\nevent: delta\ndata: {"text":"Hy',
        );
        expect(first.events).toEqual([{ type: "status", phase: "searching", detail: "Hydra" }]);
        expect(first.rest).toBe('event: delta\ndata: {"text":"Hy');
        const second = parseSseChunk(
            `${first.rest}dra"}\r\n\r\nevent: bogus\ndata: {}\n\nevent: done\ndata: not json\n\n`,
        );
        expect(second.events).toEqual([{ type: "delta", text: "Hydra" }]);
        expect(second.rest).toBe("");
    });

    test("streams events from the response and stops at done", async () => {
        const body = sse([
            'event: sources\ndata: {"items":[{"id":"unit:hydra","type":"unit","name":"Hydra","href":"/knowledge-base/?entry=Hydra#unit-hydra"}]}\n\n',
            'event: delta\ndata: {"text":"Hydra is "}\n\n',
            'event: delta\ndata: {"text":"a Chaos unit."}\n\n',
            'event: done\ndata: {"answer":"Hydra is a Chaos unit.","sources":[],"cached":false}\n\n',
            'event: delta\ndata: {"text":"ignored after done"}\n\n',
        ]);
        let captured: { url: string; body: string } | undefined;
        const fetchImpl = ((url: string, init?: RequestInit) => {
            captured = { url, body: String(init?.body) };
            return Promise.resolve(
                new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
            );
        }) as unknown as typeof fetch;
        const events: KnowledgeAiEvent[] = [];
        await askKnowledgeAi({ question: "What is Hydra?", lang: "en" }, (event) => events.push(event), {
            fetchImpl,
            url: "https://ai.test/ask",
        });
        expect(captured?.url).toBe("https://ai.test/ask");
        expect(JSON.parse(captured?.body ?? "{}")).toEqual({ question: "What is Hydra?", lang: "en", history: [] });
        expect(events.map((event) => event.type)).toEqual(["sources", "delta", "delta", "done"]);
    });

    test("turns HTTP refusals into a typed error with the retry hint", async () => {
        const fetchImpl = (() =>
            Promise.resolve(
                new Response(JSON.stringify({ error: "too many questions", code: "rate_limited" }), {
                    status: 429,
                    headers: { "Content-Type": "application/json", "Retry-After": "42" },
                }),
            )) as unknown as typeof fetch;
        let caught: unknown;
        try {
            await askKnowledgeAi({ question: "x", lang: "ru" }, () => undefined, {
                fetchImpl,
                url: "https://ai.test/ask",
            });
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(KnowledgeAiRequestError);
        expect(caught).toMatchObject({
            status: 429,
            code: "rate_limited",
            retryAfterSeconds: 42,
            message: "too many questions",
        });
    });
});
