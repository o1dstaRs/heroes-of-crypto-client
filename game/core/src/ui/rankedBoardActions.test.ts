import { describe, expect, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";

import { PlayActionType, PlayPhase, type PlayAction } from "../api/play_protocol";
import { canSubmitRankedBoardAction } from "./rankedBoardActions";

type Snapshot = NonNullable<Parameters<typeof canSubmitRankedBoardAction>[0]>;
const snapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
    gameId: "match",
    phase: PlayPhase.PLACEMENT,
    fightStarted: false,
    fightFinished: false,
    placementSplit: true,
    placementStage: 1,
    players: [
        { playerId: "lower", team: TeamVals.LEFT, connected: true, aiControlled: false, lastSeenMs: 0 },
        { playerId: "upper", team: TeamVals.RIGHT, connected: true, aiControlled: false, lastSeenMs: 0 },
    ],
    readyPlayerIds: [],
    ...overrides,
});
const actions = [
    PlayActionType.PLACE_UNIT,
    PlayActionType.SPLIT_UNIT,
    PlayActionType.DELETE_UNIT,
    PlayActionType.UNPLACE_UNIT,
    PlayActionType.PLACE_BARREL,
    PlayActionType.UNPLACE_BARREL,
];

describe("queued ranked board actions", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const playerId = team === TeamVals.LEFT ? "lower" : "upper";
        for (const type of actions) {
            test(`team ${team}, action ${type}: a queued edit expires at Ready, combat, or a changed match`, async () => {
                const action = { gameId: "match", playerId, team, type };
                expect(canSubmitRankedBoardAction(snapshot(), action)).toBe(true);
                for (const current of [
                    null,
                    snapshot({ readyPlayerIds: [playerId] }),
                    snapshot({ phase: PlayPhase.PLAY }),
                    snapshot({ phase: PlayPhase.FINISHED }),
                    snapshot({ phase: PlayPhase.ABANDONED }),
                    snapshot({ fightStarted: true }),
                    snapshot({ fightFinished: true }),
                    snapshot({ gameId: "different" }),
                    snapshot({ placementStage: 0 }),
                    snapshot({ placementStage: 2 }),
                    snapshot({ players: [] }),
                ]) {
                    let sent = false;
                    const sendWhenDequeued = async () => {
                        await Promise.resolve();
                        if (canSubmitRankedBoardAction(current, action)) sent = true;
                    };
                    await sendWhenDequeued();
                    expect(sent).toBe(false);
                }
                expect(canSubmitRankedBoardAction(snapshot(), { ...action, playerId: "observer" })).toBe(false);
                expect(
                    canSubmitRankedBoardAction(snapshot(), {
                        ...action,
                        team: team === TeamVals.LEFT ? TeamVals.RIGHT : TeamVals.LEFT,
                    }),
                ).toBe(false);
                expect(canSubmitRankedBoardAction(snapshot({ placementSplit: false, placementStage: 0 }), action)).toBe(
                    true,
                );
            });
        }
    }

    test("an opponent's readiness does not lock the player's army", () => {
        expect(
            canSubmitRankedBoardAction(snapshot({ readyPlayerIds: ["upper"] }), {
                type: PlayActionType.PLACE_UNIT,
                gameId: "match",
                playerId: "lower",
                team: TeamVals.LEFT,
            }),
        ).toBe(true);
    });

    test("heartbeats, fight actions, and readiness keep their own validation paths", () => {
        for (const type of [PlayActionType.PING, PlayActionType.MOVE_UNIT, PlayActionType.READY_PLACEMENT]) {
            expect(canSubmitRankedBoardAction(null, { type } as PlayAction)).toBe(true);
        }
    });
});
