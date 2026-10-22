import { describe, expect, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";
import { createPlayActionFromGameAction } from "../api/game_action_play_codec";
import { PlayActionType, PlayPhase, PlayInputSource, type PlayAction } from "../api/play_protocol";
import {
    captureRankedReadinessIntent,
    canSubmitRankedReadinessIntent,
    isRecoveredRankedReadinessRejection,
    RankedReadinessSubmissions,
    sendRankedReadinessWithRetry,
} from "./rankedReadiness";

type Snapshot = NonNullable<Parameters<typeof captureRankedReadinessIntent>[0]>;
const snapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
    gameId: "match",
    phase: PlayPhase.PLACEMENT,
    fightStarted: false,
    fightFinished: false,
    placementSplit: true,
    placementStage: 0,
    players: [
        { playerId: "lower", team: TeamVals.LEFT, connected: true, aiControlled: false, lastSeenMs: 0 },
        { playerId: "upper", team: TeamVals.RIGHT, connected: true, aiControlled: false, lastSeenMs: 0 },
    ],
    readyPlayerIds: [],
    ...overrides,
});
const intent = (state = snapshot(), team = TeamVals.LEFT, type: number = PlayActionType.START_FIGHT) =>
    captureRankedReadinessIntent(state, team, type)!;

describe("ranked readiness intent", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        test(`team ${team} binds setup and board locks to their original stage`, () => {
            const setup = intent(snapshot(), team);
            const board = snapshot({ placementStage: 1 });
            expect(canSubmitRankedReadinessIntent(setup, snapshot())).toBe(true);
            expect(canSubmitRankedReadinessIntent(setup, board)).toBe(false);
            expect(captureRankedReadinessIntent(board, team, PlayActionType.START_FIGHT)).toBeUndefined();
            const ready = intent(board, team, PlayActionType.READY_PLACEMENT);
            expect(canSubmitRankedReadinessIntent(ready, board)).toBe(true);
            expect(canSubmitRankedReadinessIntent(ready, snapshot())).toBe(false);
            expect(captureRankedReadinessIntent(snapshot(), team, PlayActionType.READY_PLACEMENT)).toBeUndefined();
        });
    }

    test("reconnects preserve intent but a different game, seat or placement mode cannot reuse it", () => {
        const original = intent();
        expect(canSubmitRankedReadinessIntent(original, snapshot())).toBe(true);
        expect(canSubmitRankedReadinessIntent(original, snapshot({ gameId: "other" }))).toBe(false);
        expect(canSubmitRankedReadinessIntent(original, snapshot({ placementSplit: false }))).toBe(false);
        expect(canSubmitRankedReadinessIntent(original, snapshot({ players: [] }))).toBe(false);
        const changed = snapshot();
        changed.players[0] = { ...changed.players[0], playerId: "other-player" };
        expect(canSubmitRankedReadinessIntent(original, changed)).toBe(false);
    });

    test("unknown stages, observers, started games and already-ready seats cannot create a new intent", () => {
        for (const state of [
            snapshot({ placementStage: -1 }),
            snapshot({ placementStage: 2 }),
            snapshot({ phase: PlayPhase.PLAY }),
            snapshot({ phase: PlayPhase.FINISHED }),
            snapshot({ phase: PlayPhase.ABANDONED }),
            snapshot({ fightStarted: true }),
            snapshot({ fightFinished: true }),
            snapshot({ readyPlayerIds: ["lower"] }),
        ])
            expect(captureRankedReadinessIntent(state, TeamVals.LEFT, PlayActionType.START_FIGHT)).toBeUndefined();
        expect(captureRankedReadinessIntent(null, TeamVals.LEFT, PlayActionType.START_FIGHT)).toBeUndefined();
        expect(captureRankedReadinessIntent(snapshot(), TeamVals.NO_TEAM, PlayActionType.START_FIGHT)).toBeUndefined();
        expect(captureRankedReadinessIntent(snapshot(), TeamVals.LEFT, PlayActionType.AUGMENT)).toBeUndefined();
    });

    test("legacy combined placement keeps one explicit board-ready intent", () => {
        const combined = snapshot({ placementSplit: false, placementStage: 1 });
        const ready = intent(combined, TeamVals.LEFT, PlayActionType.READY_PLACEMENT);
        expect(canSubmitRankedReadinessIntent(ready, combined)).toBe(true);
        expect(captureRankedReadinessIntent(combined, TeamVals.LEFT, PlayActionType.START_FIGHT)).toBeUndefined();
    });
});

describe("readiness rejection recovery", () => {
    test("a deadline transition or acknowledged duplicate recovers without making the board ready", () => {
        const setup = intent();
        const board = snapshot({ placementStage: 1 });
        expect(isRecoveredRankedReadinessRejection(setup, "sequence_mismatch", board)).toBe(true);
        expect(isRecoveredRankedReadinessRejection(setup, "setup_not_available", board)).toBe(true);
        expect(board.readyPlayerIds).toEqual([]);
        expect(
            isRecoveredRankedReadinessRejection(setup, "setup_locked", snapshot({ readyPlayerIds: ["lower"] })),
        ).toBe(true);
        expect(isRecoveredRankedReadinessRejection(setup, "sequence_mismatch", snapshot())).toBe(false);
        expect(
            isRecoveredRankedReadinessRejection(setup, "setup_locked", snapshot({ readyPlayerIds: ["upper"] })),
        ).toBe(false);
    });

    test("a board-ready response crossing into combat is already resolved", () => {
        const ready = intent(snapshot({ placementStage: 1 }), TeamVals.LEFT, PlayActionType.READY_PLACEMENT);
        expect(
            isRecoveredRankedReadinessRejection(ready, "placement_not_available", snapshot({ phase: PlayPhase.PLAY })),
        ).toBe(true);
        expect(
            isRecoveredRankedReadinessRejection(ready, "sequence_mismatch", snapshot({ phase: PlayPhase.FINISHED })),
        ).toBe(true);
        expect(
            isRecoveredRankedReadinessRejection(ready, "placement_locked", snapshot({ readyPlayerIds: ["lower"] })),
        ).toBe(false);
    });

    test("authorization, validation and unrelated failures are never swallowed", () => {
        for (const reason of [
            "wrong_team",
            "wrong_player",
            "invalid_sequence",
            "duplicate_action_id",
            "rate_limited",
            "battle_state_quarantined",
            "",
            "spell_not_available",
        ]) {
            expect(isRecoveredRankedReadinessRejection(intent(), reason, snapshot({ placementStage: 1 }))).toBe(false);
        }
        expect(
            isRecoveredRankedReadinessRejection(
                intent(),
                "sequence_mismatch",
                snapshot({ gameId: "other", placementStage: 1 }),
            ),
        ).toBe(false);
        expect(
            isRecoveredRankedReadinessRejection(
                intent(),
                "sequence_mismatch",
                snapshot({ phase: PlayPhase.ABANDONED }),
            ),
        ).toBe(false);
        expect(
            isRecoveredRankedReadinessRejection(
                intent(),
                "sequence_mismatch",
                snapshot({ players: [], placementStage: 1 }),
            ),
        ).toBe(false);
        expect(isRecoveredRankedReadinessRejection(intent(), "sequence_mismatch", null)).toBe(false);
    });
});

describe("queued readiness", () => {
    test("rapid clicks and a shortcut coalesce, then an acknowledged lock prevents another request", async () => {
        const gate = new RankedReadinessSubmissions();
        let current = snapshot();
        let release!: () => void;
        const blocker = new Promise<void>((resolve) => {
            release = resolve;
        });
        const enqueue = async (run: () => Promise<void>) => {
            await blocker;
            await run();
        };
        let sends = 0;
        const send = async () => {
            sends++;
            current = snapshot({ readyPlayerIds: ["lower"] });
        };
        const clicks = Array.from({ length: 20 }, () => gate.submit(intent(), () => current, enqueue, send));
        expect(sends).toBe(0);
        release();
        await Promise.all(clicks);
        expect(sends).toBe(1);
        await gate.submit(intent(), () => current, enqueue, send);
        expect(sends).toBe(1);
    });

    test("expiry while waiting in the queue drops the setup click instead of reinterpreting it", async () => {
        const gate = new RankedReadinessSubmissions();
        let current = snapshot();
        const enqueued: Array<() => Promise<void>> = [];
        let sends = 0;
        await gate.submit(
            intent(),
            () => current,
            async (run) => {
                enqueued.push(run);
            },
            async () => {
                sends++;
            },
        );
        current = snapshot({ placementStage: 1 });
        await enqueued[0]();
        expect(sends).toBe(0);
        expect(current.readyPlayerIds).toEqual([]);
        await gate.submit(
            intent(current, TeamVals.LEFT, PlayActionType.READY_PLACEMENT),
            () => current,
            async (run) => {
                await run();
            },
            async () => {
                sends++;
            },
        );
        expect(sends).toBe(1);
    });

    test("a transport failure releases the pending lock and permits a deliberate retry", async () => {
        const gate = new RankedReadinessSubmissions();
        const enqueue = async (run: () => Promise<void>) => {
            await run();
        };
        await expect(
            gate.submit(
                intent(),
                () => snapshot(),
                enqueue,
                async () => {
                    throw Error("offline");
                },
            ),
        ).rejects.toThrow("offline");
        let sends = 0;
        await gate.submit(
            intent(),
            () => snapshot(),
            enqueue,
            async () => {
                sends++;
            },
        );
        expect(sends).toBe(1);
    });
});

describe("bounded readiness retry", () => {
    const action = () =>
        createPlayActionFromGameAction(
            { type: "start_fight" },
            {
                gameId: "match",
                playerId: "lower",
                team: TeamVals.LEFT,
                expectedSequence: 15,
                actionId: "original",
            },
        );
    const mismatch = { accepted: false, rejectionReason: "sequence_mismatch" };

    test("a same-stage race retries once with a new ID and fresh sequence, preserving the original intent", async () => {
        const sent: PlayAction[] = [];
        let refreshed = false;
        const result = await sendRankedReadinessWithRetry(action(), intent(), {
            send: async (a) => {
                sent.push(a);
                return sent.length === 1 ? mismatch : { accepted: true, rejectionReason: "" };
            },
            refresh: async () => {
                refreshed = true;
            },
            getSnapshot: () => ({ ...snapshot(), latestSequence: 16 }),
            newActionId: () => "retry",
        });
        expect(result.accepted).toBe(true);
        expect(refreshed).toBe(true);
        expect(sent).toHaveLength(2);
        expect(sent[1]).toMatchObject({
            actionId: "retry",
            expectedSequence: 16,
            inputSource: PlayInputSource.CLIENT_RETRY,
            type: PlayActionType.START_FIGHT,
            playerId: "lower",
            team: TeamVals.LEFT,
        });
    });

    test("a second race stops after one retry", async () => {
        let sends = 0;
        expect(
            await sendRankedReadinessWithRetry(action(), intent(), {
                send: async () => {
                    sends++;
                    return mismatch;
                },
                refresh: async () => {},
                getSnapshot: () => ({ ...snapshot(), latestSequence: 16 }),
                newActionId: () => "retry",
            }),
        ).toEqual(mismatch);
        expect(sends).toBe(2);
    });

    test("expiry, combat, a different match, a different seat or an acknowledged lock never trigger a new command", async () => {
        for (const current of [
            snapshot({ placementStage: 1 }),
            snapshot({ phase: PlayPhase.PLAY }),
            snapshot({ gameId: "other" }),
            snapshot({ players: [] }),
            snapshot({ readyPlayerIds: ["lower"] }),
        ]) {
            let sends = 0;
            await sendRankedReadinessWithRetry(action(), intent(), {
                send: async () => {
                    sends++;
                    return mismatch;
                },
                refresh: async () => {},
                getSnapshot: () => ({ ...current, latestSequence: 16 }),
                newActionId: () => "retry",
            });
            expect(sends).toBe(1);
        }
    });

    test("accepted responses, authorization failures and lost acknowledgements are not blindly replayed", async () => {
        for (const response of [
            { accepted: true, rejectionReason: "" },
            { accepted: false, rejectionReason: "wrong_team" },
            { accepted: false, rejectionReason: "wrong_player" },
        ]) {
            let sends = 0,
                refreshes = 0;
            expect(
                await sendRankedReadinessWithRetry(action(), intent(), {
                    send: async () => {
                        sends++;
                        return response;
                    },
                    refresh: async () => {
                        refreshes++;
                    },
                    getSnapshot: () => ({ ...snapshot(), latestSequence: 16 }),
                    newActionId: () => "retry",
                }),
            ).toEqual(response);
            expect(sends).toBe(1);
            expect(refreshes).toBe(0);
        }
        let sends = 0;
        await expect(
            sendRankedReadinessWithRetry(action(), intent(), {
                send: async () => {
                    sends++;
                    throw Error("ack lost");
                },
                refresh: async () => {},
                getSnapshot: () => ({ ...snapshot(), latestSequence: 16 }),
                newActionId: () => "retry",
            }),
        ).rejects.toThrow("ack lost");
        expect(sends).toBe(1);
    });
});

test("a readiness retry cannot relabel automated input as a human client retry", async () => {
    for (const inputSource of [PlayInputSource.CLIENT_AI, PlayInputSource.LOCAL_MODEL]) {
        const action = createPlayActionFromGameAction(
            { type: "start_fight" },
            {
                gameId: "match",
                playerId: "lower",
                team: TeamVals.LEFT,
                expectedSequence: 15,
                actionId: "automated",
            },
        );
        action.inputSource = inputSource;
        let sends = 0,
            refreshes = 0;
        await sendRankedReadinessWithRetry(action, intent(), {
            send: async () => {
                sends++;
                return { accepted: false, rejectionReason: "sequence_mismatch" };
            },
            refresh: async () => {
                refreshes++;
            },
            getSnapshot: () => ({ ...snapshot(), latestSequence: 16 }),
            newActionId: () => "retry",
        });
        expect(sends).toBe(1);
        expect(refreshes).toBe(0);
    }
});
