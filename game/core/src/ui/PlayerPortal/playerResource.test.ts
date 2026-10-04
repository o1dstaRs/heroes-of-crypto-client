import { describe, expect, test } from "bun:test";

import { createPlayerResource } from "./playerResource";

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};

describe("player profile loading", () => {
    test("the arena and portal share a request and its completed response", async () => {
        const response = deferred<{ username: string }>();
        let calls = 0;
        const resource = createPlayerResource(
            () => {
                calls += 1;
                return response.promise;
            },
            () => "Unavailable",
        );

        const arenaRequest = resource.load("player");
        const portalRequest = resource.load("player");
        expect(portalRequest).toBe(arenaRequest);
        expect(resource.getSnapshot("player")).toEqual({ data: null, loading: true, error: "" });
        response.resolve({ username: "player" });
        await arenaRequest;

        expect(calls).toBe(1);
        expect(resource.getSnapshot("player")).toEqual({ data: { username: "player" }, loading: false, error: "" });
        expect(resource.getSnapshot("player")).toBe(resource.getSnapshot("player"));
    });

    test("a refresh keeps the existing profile until its replacement arrives", async () => {
        const refresh = deferred<{ wins: number }>();
        let calls = 0;
        const resource = createPlayerResource(
            () => (++calls === 1 ? Promise.resolve({ wins: 4 }) : refresh.promise),
            () => "Unavailable",
        );
        await resource.load("player");

        const request = resource.load("player");
        expect(resource.getSnapshot("player")).toEqual({ data: { wins: 4 }, loading: true, error: "" });
        refresh.resolve({ wins: 5 });
        await request;
        expect(resource.getSnapshot("player")).toEqual({ data: { wins: 5 }, loading: false, error: "" });
    });

    test("a failed refresh preserves the profile and can be retried", async () => {
        let calls = 0;
        const resource = createPlayerResource(
            async () => {
                if (++calls === 2) throw new Error("Offline");
                return { wins: calls };
            },
            () => "Unavailable",
        );
        await resource.load("player");
        await resource.load("player");
        expect(resource.getSnapshot("player")).toEqual({ data: { wins: 1 }, loading: false, error: "Offline" });

        await resource.load("player");
        expect(resource.getSnapshot("player")).toEqual({ data: { wins: 3 }, loading: false, error: "" });
    });

    test("switching accounts never exposes the other player's cached or in-flight data", async () => {
        const first = deferred<{ username: string }>();
        let calls = 0;
        const resource = createPlayerResource(
            () => (++calls === 1 ? first.promise : Promise.resolve({ username: "second" })),
            () => "Unavailable",
        );
        const firstRequest = resource.load("first");
        await resource.load("second");
        first.resolve({ username: "first" });
        await firstRequest;

        expect(resource.getSnapshot("second").data).toEqual({ username: "second" });
        expect(resource.getSnapshot("third").data).toBeNull();
        await resource.load("");
        expect(resource.getSnapshot("")).toEqual({ data: null, loading: false, error: "" });
        expect(calls).toBe(2);
    });

    test("only mounted surfaces are notified when a request finishes", async () => {
        const response = deferred<number>();
        const resource = createPlayerResource(
            () => response.promise,
            () => "Unavailable",
        );
        let notifications = 0;
        const unsubscribe = resource.subscribe("player", () => notifications++);
        const request = resource.load("player");
        expect(notifications).toBe(1);
        unsubscribe();
        response.resolve(1);
        await request;
        expect(notifications).toBe(1);
        expect(resource.getSnapshot("player").data).toBe(1);
    });
});
