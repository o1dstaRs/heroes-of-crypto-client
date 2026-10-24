import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test";

import { followPickEventStream, pickStreamId } from "./pick_event_stream";

const STREAM_URL = "https://game.example/v1/pick-events/match";
const CONNECTION = "8a7dbe4a-8c3b-4c5a-9cf7-60a04923ed75";
const frame = { pp: 2, a: [1], b: [], p: [], op: [], ws: [], ip: [], t: 20_000, r: 0, ia: false };
let previousFetch: typeof fetch;
let previousStorage: Storage;
let abort: AbortController;

const callbacks = () => ({ onOpen: mock(), onMessage: mock(), onError: mock(), onConflict: mock() });
const options = { connectionId: CONNECTION, retryDelaysMs: [0] };

beforeEach(() => {
    previousFetch = globalThis.fetch;
    previousStorage = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => "Bearer player-token" } as unknown as Storage;
    abort = new AbortController();
});

afterEach(() => {
    abort.abort();
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousStorage;
    jest.useRealTimers();
});

describe("ranked draft stream identity", () => {
    test("survives a reload of the same tab and differs between independent tabs", () => {
        const storage = () => {
            const values = new Map<string, string>();
            return {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => values.set(key, value),
            };
        };
        const firstTab = storage();
        const id = pickStreamId(firstTab);
        expect(pickStreamId(firstTab)).toBe(id);
        expect(pickStreamId(storage())).not.toBe(id);
        expect(id).toMatch(/^[a-f0-9-]{36}$/);
    });

    test("keeps a stable in-memory identity when session storage is blocked", () => {
        const blocked = {
            getItem: () => {
                throw new Error("Storage blocked");
            },
            setItem: () => undefined,
        };
        expect(pickStreamId(blocked)).toBe(pickStreamId(blocked));
    });
});

describe("ranked draft reconnect", () => {
    test("keeps retrying repeated network and server failures without claiming another tab owns the seat", async () => {
        const handlers = callbacks();
        const fetches = mock(async () => {
            if (fetches.mock.calls.length <= 8) {
                if (fetches.mock.calls.length % 2) throw new TypeError("Network connection lost");
                return new Response(null, { status: 503 });
            }
            return new Response(`${JSON.stringify(frame)}\n\n`);
        });
        globalThis.fetch = fetches as unknown as typeof fetch;
        handlers.onMessage = mock(() => abort.abort());

        await followPickEventStream(STREAM_URL, handlers, abort.signal, options);

        expect(fetches).toHaveBeenCalledTimes(9);
        expect(handlers.onError).toHaveBeenCalledTimes(8);
        expect(handlers.onConflict).not.toHaveBeenCalled();
        expect(handlers.onMessage).toHaveBeenCalledWith(frame);
    });

    test("a quiet HTTP 200 connects before any draft frame arrives", async () => {
        const handlers = callbacks();
        const cancelled = mock();
        globalThis.fetch = mock(
            async () => new Response(new ReadableStream({ cancel: cancelled })),
        ) as unknown as typeof fetch;
        handlers.onOpen = mock(() => abort.abort());

        await followPickEventStream(STREAM_URL, handlers, abort.signal, options);

        expect(handlers.onOpen).toHaveBeenCalledTimes(1);
        expect(handlers.onMessage).not.toHaveBeenCalled();
        expect(handlers.onConflict).not.toHaveBeenCalled();
        expect(cancelled).toHaveBeenCalledTimes(1);
    });

    test("reopens a cleanly ended stream and parses fragmented UTF-8, heartbeats and CRLF frames", async () => {
        const handlers = callbacks();
        const event = { ...frame, label: "Зена" };
        const bytes = new TextEncoder().encode(`: heartbeat\r\n\r\ninvalid\n\n${JSON.stringify(event)}\r\n\r\n`);
        const split = bytes.findIndex((byte) => byte === 0xd0) + 1;
        const fetches = mock(async () =>
            fetches.mock.calls.length === 1
                ? new Response(": heartbeat\n\n")
                : new Response(
                      new ReadableStream({
                          start(controller) {
                              controller.enqueue(bytes.subarray(0, split));
                              controller.enqueue(bytes.subarray(split));
                              controller.close();
                          },
                      }),
                  ),
        );
        globalThis.fetch = fetches as unknown as typeof fetch;
        handlers.onMessage = mock(() => abort.abort());

        await followPickEventStream(STREAM_URL, handlers, abort.signal, options);

        expect(fetches).toHaveBeenCalledTimes(2);
        expect(handlers.onOpen).toHaveBeenCalledTimes(2);
        expect(handlers.onMessage).toHaveBeenCalledTimes(1);
        expect(handlers.onMessage).toHaveBeenCalledWith(event);
        expect(handlers.onConflict).not.toHaveBeenCalled();
    });

    test("a confirmed connection conflict opens the other-tab view, with no competing retry loop", async () => {
        const handlers = callbacks();
        const fetches = mock(async () => new Response("You already have an active connection", { status: 429 }));
        globalThis.fetch = fetches as unknown as typeof fetch;

        await followPickEventStream(STREAM_URL, handlers, abort.signal, options);

        expect(fetches).toHaveBeenCalledTimes(1);
        expect(handlers.onConflict).toHaveBeenCalledTimes(1);
        expect(handlers.onOpen).not.toHaveBeenCalled();
        expect(handlers.onError).not.toHaveBeenCalled();
    });

    test("an ordinary rate limit retries without claiming the draft is open elsewhere", async () => {
        const handlers = callbacks();
        const fetches = mock(async () =>
            fetches.mock.calls.length === 1
                ? new Response("Rate limit exceeded", { status: 429 })
                : new Response(`${JSON.stringify(frame)}\n\n`),
        );
        globalThis.fetch = fetches as unknown as typeof fetch;
        handlers.onMessage = mock(() => abort.abort());

        await followPickEventStream(STREAM_URL, handlers, abort.signal, options);

        expect(fetches).toHaveBeenCalledTimes(2);
        expect(handlers.onError).toHaveBeenCalledTimes(1);
        expect(handlers.onConflict).not.toHaveBeenCalled();
        expect(handlers.onMessage).toHaveBeenCalledWith(frame);
    });

    test("Draft here takes over once, then ordinary reconnects reuse the same identity and current token", async () => {
        const handlers = callbacks();
        const requests: { url: string; init?: RequestInit }[] = [];
        globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
            requests.push({ url: String(input), init });
            globalThis.localStorage = { getItem: () => "Bearer rotated-token" } as unknown as Storage;
            return new Response(requests.length === 1 ? "" : `${JSON.stringify(frame)}\n\n`);
        }) as unknown as typeof fetch;
        handlers.onMessage = mock(() => abort.abort());

        await followPickEventStream(STREAM_URL, handlers, abort.signal, { ...options, takeover: true });

        const first = new globalThis.URL(requests[0].url);
        const second = new globalThis.URL(requests[1].url);
        expect(first.searchParams.get("takeover")).toBe("1");
        expect(second.searchParams.has("takeover")).toBe(false);
        expect(first.searchParams.get("connectionId")).toBe(CONNECTION);
        expect(second.searchParams.get("connectionId")).toBe(CONNECTION);
        expect(new Headers(requests[0].init?.headers).get("Authorization")).toBe("Bearer player-token");
        expect(new Headers(requests[1].init?.headers).get("Authorization")).toBe("Bearer rotated-token");
        expect(first.searchParams.has("token")).toBe(false);
    });

    test("ignores and cancels a late response after the draft unmounts", async () => {
        const handlers = callbacks();
        const cancelled = mock();
        globalThis.fetch = mock(async () => {
            abort.abort();
            return new Response(new ReadableStream({ cancel: cancelled }));
        }) as unknown as typeof fetch;

        await followPickEventStream(STREAM_URL, handlers, abort.signal, options);

        expect(handlers.onOpen).not.toHaveBeenCalled();
        expect(handlers.onConflict).not.toHaveBeenCalled();
        expect(handlers.onError).not.toHaveBeenCalled();
        expect(cancelled).toHaveBeenCalledTimes(1);
    });

    test("unmounting clears a pending retry without opening another stream", async () => {
        jest.useFakeTimers();
        const handlers = callbacks();
        const fetches = mock(async () => new Response(null, { status: 503 }));
        globalThis.fetch = fetches as unknown as typeof fetch;
        const following = followPickEventStream(STREAM_URL, handlers, abort.signal, {
            ...options,
            retryDelaysMs: [60_000],
        });
        for (let i = 0; i < 6; i += 1) await Promise.resolve();
        expect(handlers.onError).toHaveBeenCalledTimes(1);

        abort.abort();
        await following;
        jest.advanceTimersByTime(60_000);

        expect(fetches).toHaveBeenCalledTimes(1);
    });
});
