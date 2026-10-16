import { describe, expect, test } from "bun:test";

import { isOlderRankedSnapshot, waitForRankedPlayback } from "./rankedSnapshotSync";

const snapshot = (latestSequence: number, serverTimeMs = 1000, gameId = "game-1") => ({
    gameId,
    latestSequence,
    serverTimeMs,
});

const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe("ranked snapshot ordering", () => {
    test("drops a late poll or action response after a newer SSE state", () => {
        expect(isOlderRankedSnapshot(snapshot(41, 2000), snapshot(42, 1000))).toBe(true);
        expect(isOlderRankedSnapshot(snapshot(43, 900), snapshot(42, 1000))).toBe(false);
    });

    test("orders clock and presence updates within the same journal sequence", () => {
        expect(isOlderRankedSnapshot(snapshot(42, 900), snapshot(42, 1000))).toBe(true);
        expect(isOlderRankedSnapshot(snapshot(42, 1000), snapshot(42, 1000))).toBe(false);
        expect(isOlderRankedSnapshot(snapshot(42, 1100), snapshot(42, 1000))).toBe(false);
    });

    test("accepts the first state, another game and snapshots without a server clock", () => {
        expect(isOlderRankedSnapshot(snapshot(1), null)).toBe(false);
        expect(isOlderRankedSnapshot(snapshot(1, 900, "game-2"), snapshot(42))).toBe(false);
        expect(isOlderRankedSnapshot(snapshot(42, 0), snapshot(42))).toBe(false);
    });
});

describe("ranked poll reconciliation during combat", () => {
    test("keeps a lethal poll from removing a fighter before its exchange finishes", async () => {
        const attack = deferred();
        let fighterOnBoard = true;
        const reconcile = waitForRankedPlayback(() => attack.promise).then(() => {
            fighterOnBoard = false;
        });

        await flush();
        expect(fighterOnBoard).toBe(true);
        attack.resolve();
        await reconcile;
        expect(fighterOnBoard).toBe(false);
    });

    test("also waits for a record queued after the poll started waiting", async () => {
        const first = deferred();
        const followUp = deferred();
        let playback = first.promise;
        let reconciled = false;
        const reconcile = waitForRankedPlayback(() => playback).then(() => {
            reconciled = true;
        });

        playback = playback.then(() => followUp.promise);
        first.resolve();
        await flush();
        expect(reconciled).toBe(false);
        followUp.resolve();
        await reconcile;
        expect(reconciled).toBe(true);
    });

    test("a failed animation does not block reconciliation or the next queued record", async () => {
        const followUp = deferred();
        let playback = Promise.reject<void>(new Error("animation failed"));
        let reconciled = false;
        const reconcile = waitForRankedPlayback(() => playback).then(() => {
            reconciled = true;
        });
        playback = playback.catch(() => undefined).then(() => followUp.promise);

        await flush();
        expect(reconciled).toBe(false);
        followUp.resolve();
        await reconcile;
        expect(reconciled).toBe(true);
    });

    test("rejects a polled state that became stale while the animation was playing", async () => {
        const attack = deferred();
        const poll = snapshot(41);
        let current = snapshot(40);
        const reconcile = waitForRankedPlayback(() => attack.promise).then(() => {
            if (!isOlderRankedSnapshot(poll, current)) current = poll;
        });

        current = snapshot(42);
        attack.resolve();
        await reconcile;
        expect(current.latestSequence).toBe(42);
    });
});
