import { describe, expect, test } from "bun:test";

import { aiOpponentLabel, getAiSeatVersion, isAiSeatPlayerId, isMarkedVsAiGame, markVsAiGame } from "./aiOpponent";

// The exact shape the server persists: "ai:<version>:<seat>:" padded to 36 chars (ai_seat.ts).
const AI_SEAT_ID = "ai:v0.7:default:".padEnd(36, "0");

describe("aiOpponent seat identification", () => {
    test("recognizes an AI seat playerId and extracts the version", () => {
        expect(isAiSeatPlayerId(AI_SEAT_ID)).toBe(true);
        expect(getAiSeatVersion(AI_SEAT_ID)).toBe("v0.7");
        expect(aiOpponentLabel(AI_SEAT_ID)).toBe("AI (v0.7)");
    });

    test("human and missing playerIds are not labeled as AI", () => {
        expect(isAiSeatPlayerId("8f4f2f9c-1234-4abc-9def-aaaaaaaaaaaa")).toBe(false);
        expect(aiOpponentLabel("8f4f2f9c-1234-4abc-9def-aaaaaaaaaaaa")).toBeUndefined();
        expect(aiOpponentLabel(undefined)).toBeUndefined();
        expect(aiOpponentLabel("")).toBeUndefined();
        expect(getAiSeatVersion("not-an-ai-seat")).toBeUndefined();
    });

    test("falls back to a generic AI label when the version segment is empty", () => {
        expect(aiOpponentLabel("ai::default:".padEnd(36, "0"))).toBe("AI");
    });
});

describe("vs-AI game marker", () => {
    test("marks and recognizes the last vs-AI game id", () => {
        const stored = new Map<string, string>();
        const localStorageStub = {
            getItem: (key: string) => stored.get(key) ?? null,
            setItem: (key: string, value: string) => void stored.set(key, value),
        } as unknown as Storage;
        const previous = (globalThis as { localStorage?: Storage }).localStorage;
        (globalThis as { localStorage?: Storage }).localStorage = localStorageStub;
        try {
            expect(isMarkedVsAiGame("game-1")).toBe(false);
            markVsAiGame("game-1");
            expect(isMarkedVsAiGame("game-1")).toBe(true);
            expect(isMarkedVsAiGame("game-2")).toBe(false);
            expect(isMarkedVsAiGame(undefined)).toBe(false);
            // A newer vs-AI game replaces the single slot.
            markVsAiGame("game-2");
            expect(isMarkedVsAiGame("game-1")).toBe(false);
            expect(isMarkedVsAiGame("game-2")).toBe(true);
        } finally {
            if (previous === undefined) {
                delete (globalThis as { localStorage?: Storage }).localStorage;
            } else {
                (globalThis as { localStorage?: Storage }).localStorage = previous;
            }
        }
    });

    test("storage failures degrade to unmarked instead of throwing", () => {
        const throwingStorage = {
            getItem: () => {
                throw new Error("denied");
            },
            setItem: () => {
                throw new Error("denied");
            },
        } as unknown as Storage;
        const previous = (globalThis as { localStorage?: Storage }).localStorage;
        (globalThis as { localStorage?: Storage }).localStorage = throwingStorage;
        try {
            expect(() => markVsAiGame("game-1")).not.toThrow();
            expect(isMarkedVsAiGame("game-1")).toBe(false);
        } finally {
            if (previous === undefined) {
                delete (globalThis as { localStorage?: Storage }).localStorage;
            } else {
                (globalThis as { localStorage?: Storage }).localStorage = previous;
            }
        }
    });
});
