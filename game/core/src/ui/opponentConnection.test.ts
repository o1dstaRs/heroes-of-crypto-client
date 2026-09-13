import { describe, expect, test } from "bun:test";

import { PlayPhase } from "../api/play_protocol";
import { formatCountdown, opponentConnectionNotices, returnedSeats } from "./opponentConnection";

const seat = (playerId: string, team: number, connected: boolean, extra: Record<string, unknown> = {}) => ({
    playerId,
    team,
    connected,
    aiControlled: false,
    lastSeenMs: 0,
    ...extra,
});

describe("opponentConnectionNotices", () => {
    test("reports a gone opponent with the takeover and forfeit countdowns, never the viewer's own seat", () => {
        const snapshot = {
            phase: PlayPhase.PLAY,
            fightFinished: false,
            players: [seat("me", 2, false), seat("them", 1, false, { aiTakeoverAtMs: 10_000, forfeitAtMs: 70_000 })],
        };
        expect(opponentConnectionNotices(snapshot, 2, undefined, 4_000, new Set())).toEqual([
            {
                playerId: "them",
                team: 1,
                state: "disconnected",
                connected: false,
                takeoverInMs: 6_000,
                forfeitInMs: 66_000,
            },
        ]);
    });

    test("an AI-driven seat reads as ai (no takeover countdown), bot seats and finished fights are silent", () => {
        const players = [seat("me", 2, true), seat("them", 1, false, { aiControlled: true, forfeitAtMs: 5_000 })];
        expect(
            opponentConnectionNotices(
                { phase: PlayPhase.PLAY, fightFinished: false, players },
                2,
                undefined,
                0,
                new Set(),
            ),
        ).toEqual([
            { playerId: "them", team: 1, state: "ai", connected: false, takeoverInMs: undefined, forfeitInMs: 5_000 },
        ]);
        expect(
            opponentConnectionNotices(
                { phase: PlayPhase.PLAY, fightFinished: false, players },
                2,
                "them",
                0,
                new Set(),
            ),
        ).toEqual([]);
        expect(
            opponentConnectionNotices(
                { phase: PlayPhase.PLAY, fightFinished: true, players },
                2,
                undefined,
                0,
                new Set(),
            ),
        ).toEqual([]);
    });

    test("a connected opponent the server took over after missed turns is reported as away, not hidden", () => {
        const players = [seat("me", 2, true), seat("them", 1, true, { aiControlled: true })];
        expect(
            opponentConnectionNotices(
                { phase: PlayPhase.PLAY, fightFinished: false, players },
                2,
                undefined,
                0,
                new Set(),
            ),
        ).toEqual([
            {
                playerId: "them",
                team: 1,
                state: "ai",
                connected: true,
                takeoverInMs: undefined,
                forfeitInMs: undefined,
            },
        ]);
    });

    test("bot seats stay silent even when no AI seat id is passed (ranked bots, bot-vs-bot spectating)", () => {
        const players = [
            seat("ai:v0.8:rb01:000000000000000000000000", 1, true, { aiControlled: true }),
            seat("ai:v0.7:brutal:0000000000000000000000", 2, false, { aiControlled: true }),
        ];
        expect(
            opponentConnectionNotices(
                { phase: PlayPhase.PLAY, fightFinished: false, players },
                undefined,
                undefined,
                0,
                new Set(),
            ),
        ).toEqual([]);
    });

    test("observers hear about every human seat, and a returned seat is announced once flagged", () => {
        const players = [seat("a", 2, false), seat("b", 1, true)];
        const notices = opponentConnectionNotices(
            { phase: PlayPhase.PLACEMENT, fightFinished: false, players },
            undefined,
            undefined,
            0,
            new Set(["b"]),
        );
        expect(notices.map((notice) => [notice.playerId, notice.state])).toEqual([
            ["a", "disconnected"],
            ["b", "back"],
        ]);
    });

    test("returnedSeats covers reconnects and AI control ending, and countdown formatting", () => {
        expect(
            returnedSeats([seat("a", 2, false), seat("b", 1, true)], [seat("a", 2, true), seat("b", 1, true)]),
        ).toEqual(["a"]);
        expect(returnedSeats([seat("a", 2, true, { aiControlled: true })], [seat("a", 2, true)])).toEqual(["a"]);
        expect(
            returnedSeats([seat("a", 2, false, { aiControlled: true })], [seat("a", 2, true, { aiControlled: true })]),
        ).toEqual([]);
        expect(returnedSeats(undefined, [seat("a", 2, true)])).toEqual([]);
        expect(formatCountdown(12_400)).toBe("13s");
        expect(formatCountdown(151_000)).toBe("2:31");
        expect(formatCountdown(-5)).toBe("0s");
    });
});
