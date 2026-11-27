import { describe, expect, test } from "bun:test";

import { isOlderRankedSnapshot, playMissingRankedSnapshotRecords, waitForRankedPlayback } from "./rankedSnapshotSync";
import { PlayActionType, type PlayJournalEntry, type PlaySnapshot } from "../api/play_protocol";

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

describe("ranked snapshot reconciliation during combat", () => {
    test("a poll winning the Fire Arrow race presents the journal before its narrowed snapshot", async () => {
        const delivery = deferred();
        const next = { ...snapshot(42), journalTail: [{ sequence: 42 }] } as PlaySnapshot;
        const timeline: string[] = [];
        const reconcile = playMissingRankedSnapshotRecords(next, snapshot(41), async (_entry, stateAfter) => {
            expect(stateAfter).toBe(next);
            timeline.push("cast");
            await delivery.promise;
            timeline.push("impact");
            return true;
        }).then((presented) => {
            timeline.push("narrowed snapshot");
            return presented;
        });
        await flush();
        expect(timeline).toEqual(["cast"]);
        delivery.resolve();
        expect(await reconcile).toBe(true);
        expect(timeline).toEqual(["cast", "impact", "narrowed snapshot"]);
    });

    test("missing records play in sequence without giving an intermediate action the final stats", async () => {
        const next = {
            ...snapshot(44),
            journalTail: [{ sequence: 44 }, { sequence: 42 }, { sequence: 43 }, { sequence: 42 }],
        } as PlaySnapshot;
        const played: number[] = [];
        expect(
            await playMissingRankedSnapshotRecords(next, snapshot(41), async (entry, stateAfter) => {
                played.push(entry.sequence);
                expect(stateAfter).toBe(entry.sequence === 44 ? next : undefined);
                return true;
            }),
        ).toBe(true);
        expect(played).toEqual([42, 43, 44]);
    });

    test.each([false, true])(
        "an attached narrowing record waits for the preceding attack, in journal=%p",
        async (inTail) => {
            const attack = deferred();
            const narrowing: PlayJournalEntry = {
                sequence: 43,
                actionId: "end-turn",
                playerId: "system",
                team: 0,
                actionType: PlayActionType.END_TURN,
                actionJson: '{"type":"end_turn","unitId":"attacker"}',
                eventsJson: '[{"type":"narrowing_applied","layers":1}]',
                acceptedAtMs: 1000,
            };
            const next = {
                ...snapshot(43),
                journalTail: inTail ? [narrowing, { sequence: 42 }] : [{ sequence: 42 }],
            } as PlaySnapshot;
            const timeline: string[] = [];
            const present = playMissingRankedSnapshotRecords(
                next,
                snapshot(41),
                async (entry, stateAfter) => {
                    if (entry.sequence === 42) {
                        expect(stateAfter).toBeUndefined();
                        timeline.push("attack started");
                        await attack.promise;
                        timeline.push("attack finished");
                    } else {
                        expect(entry).toBe(narrowing);
                        expect(stateAfter).toBe(next);
                        timeline.push("map narrowed");
                    }
                    return true;
                },
                narrowing,
            );
            await flush();
            expect(timeline).toEqual(["attack started"]);
            attack.resolve();
            expect(await present).toBe(true);
            expect(timeline).toEqual(["attack started", "attack finished", "map narrowed"]);
        },
    );

    test("initial loads, reconnect history and a different game do not replay old turns", async () => {
        const next = { ...snapshot(44), journalTail: [{ sequence: 44 }] } as PlaySnapshot;
        let calls = 0;
        const play = async () => {
            calls++;
            return true;
        };
        for (const current of [null, snapshot(44), snapshot(45), snapshot(43, 1000, "other")])
            expect(await playMissingRankedSnapshotRecords(next, current, play)).toBe(false);
        expect(calls).toBe(0);
    });

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
