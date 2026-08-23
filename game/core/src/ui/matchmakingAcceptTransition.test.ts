import { describe, expect, test } from "bun:test";

import {
    isAmbiguousConfirmFailure,
    isCurrentAcceptAttempt,
    resolveConfirmFailure,
    resolveTerminalHandoff,
    shouldSurfaceMatchmakingStreamError,
    TERMINAL_MATCHMAKING_STREAM_ERROR,
} from "./matchmakingAcceptTransition";

describe("ranked match accept handoff", () => {
    test("treats a lost confirm acknowledgement as accepted when current game confirms the write", () => {
        expect(resolveConfirmFailure("game-1", { id: "game-1", confirmed: true, abandoned: false }, true, true)).toBe(
            "accepted",
        );
    });

    test("restores a genuine rejection when current game remains unconfirmed", () => {
        expect(resolveConfirmFailure("game-1", { id: "game-1", confirmed: false }, true, true)).toBe("rejected");
        expect(resolveConfirmFailure("game-1", null, true, true)).toBe("rejected");
    });

    test("keeps waiting only when an ambiguous confirmation cannot be reconciled", () => {
        expect(isAmbiguousConfirmFailure({ message: "Network Error", code: "ERR_NETWORK" })).toBe(true);
        expect(isAmbiguousConfirmFailure(new Error("Internal Server Error"))).toBe(true);
        expect(isAmbiguousConfirmFailure(new Error("Bad Gateway"))).toBe(true);
        expect(isAmbiguousConfirmFailure(new Error("Gateway Timeout"))).toBe(true);
        expect(isAmbiguousConfirmFailure(new Error("Request failed with status code 502"))).toBe(true);
        expect(isAmbiguousConfirmFailure({ message: "request failed", response: { status: 502 } })).toBe(true);
        expect(resolveConfirmFailure("game-1", null, false, true)).toBe("unknown");

        expect(isAmbiguousConfirmFailure({ message: "Forbidden", response: { status: 403 } })).toBe(false);
        expect(isAmbiguousConfirmFailure(new Error("Unauthorized"))).toBe(false);
        expect(resolveConfirmFailure("game-1", null, false, false)).toBe("rejected");
    });

    test("ignores reconciliation that finishes after the authoritative handoff", () => {
        const liveAttempt = {
            acceptedGameId: "game-1",
            attempt: 3,
            currentAttempt: 3,
            expectedGameId: "game-1",
            mounted: true,
            pendingGameId: "game-1",
        };
        expect(isCurrentAcceptAttempt(liveAttempt)).toBe(true);
        expect(
            isCurrentAcceptAttempt({
                ...liveAttempt,
                acceptedGameId: "",
                currentAttempt: 4,
            }),
        ).toBe(false);
        expect(isCurrentAcceptAttempt({ ...liveAttempt, pendingGameId: "game-2" })).toBe(false);
        expect(isCurrentAcceptAttempt({ ...liveAttempt, mounted: false })).toBe(false);
    });

    test("hides retryable stream teardown only during the same accepted-game handoff", () => {
        expect(shouldSurfaceMatchmakingStreamError("Network Error", "game-1", "game-1")).toBe(false);
        expect(shouldSurfaceMatchmakingStreamError("Network Error", "", "game-1")).toBe(true);
        expect(shouldSurfaceMatchmakingStreamError("Network Error", "game-2", "game-1")).toBe(true);
    });

    test("surfaces a terminal reconnect failure during an accepted handoff", () => {
        expect(shouldSurfaceMatchmakingStreamError(TERMINAL_MATCHMAKING_STREAM_ERROR, "game-1", "game-1")).toBe(true);
    });

    test("ignores an abort delivered by the stream intentionally retired for c=1 navigation", () => {
        expect(shouldSurfaceMatchmakingStreamError("Network Error", "game-1", "game-1", false)).toBe(false);
        expect(shouldSurfaceMatchmakingStreamError(TERMINAL_MATCHMAKING_STREAM_ERROR, "game-1", "game-1", false)).toBe(
            false,
        );
    });

    test("resolves a terminal accepted handoff without leaving the route locked", () => {
        expect(resolveTerminalHandoff("game-1", { id: "game-1", confirmed: true }, true)).toBe("navigate");
        expect(resolveTerminalHandoff("game-1", { id: "game-1", confirmed: false }, true)).toBe("retry-confirm");
        expect(resolveTerminalHandoff("game-1", null, false)).toBe("recover");
        expect(resolveTerminalHandoff("game-1", { id: "another-game", confirmed: true }, true)).toBe("recover");
    });
});
