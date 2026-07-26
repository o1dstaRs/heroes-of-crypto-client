import { describe, expect, test } from "bun:test";

import {
    aiOpponentLabel,
    findAiSeatPlayerId,
    getAiSeatDifficulty,
    getAiSeatVersion,
    getMarkedVsAiDifficulty,
    hasAiSeatPlayer,
    isAiSeatPlayerId,
    isMarkedVsAiGame,
    markVsAiGame,
    parseVsAiDifficulty,
    VS_AI_DIFFICULTIES,
    VS_AI_DIFFICULTY_VERSIONS,
    vsAiDifficultyLabel,
} from "./aiOpponent";

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

    test("finds an AI seat when it is first", () => {
        expect(hasAiSeatPlayer([{ playerId: AI_SEAT_ID }, { playerId: "human-upper" }])).toBe(true);
    });

    test("finds an AI seat when it is second", () => {
        expect(hasAiSeatPlayer([{ playerId: "human-lower" }, { playerId: AI_SEAT_ID }])).toBe(true);
    });

    test("rejects a human-only player list", () => {
        expect(hasAiSeatPlayer([{ playerId: "human-lower" }, { playerId: "human-upper" }])).toBe(false);
    });
});

describe("vs-AI difficulty tiers", () => {
    test("extracts the tier from a difficulty-encoded seat id and labels it", () => {
        const brutalSeat = "ai:v0.7:brutal:".padEnd(36, "0");
        expect(getAiSeatDifficulty(brutalSeat)).toBe("brutal");
        expect(aiOpponentLabel(brutalSeat)).toBe("AI — Brutal (v0.7)");
        const easySeat = "ai:v0.4:easy:".padEnd(36, "0");
        expect(getAiSeatDifficulty(easySeat)).toBe("easy");
        expect(aiOpponentLabel(easySeat)).toBe("AI — Easy (v0.4)");
    });

    test("legacy default seats keep the version-only label", () => {
        expect(getAiSeatDifficulty(AI_SEAT_ID)).toBeUndefined();
        expect(aiOpponentLabel(AI_SEAT_ID)).toBe("AI (v0.7)");
    });

    test("difficulty labels embed the tier's engine version", () => {
        for (const difficulty of VS_AI_DIFFICULTIES) {
            expect(vsAiDifficultyLabel(difficulty)).toContain(VS_AI_DIFFICULTY_VERSIONS[difficulty]);
        }
        expect(vsAiDifficultyLabel("hard")).toBe("AI — Hard (v0.7)");
        expect(vsAiDifficultyLabel("normal")).toBe("AI — Normal (v0.6)");
    });

    test("parseVsAiDifficulty accepts only the four tiers", () => {
        expect(parseVsAiDifficulty("easy")).toBe("easy");
        expect(parseVsAiDifficulty(" BRUTAL ")).toBe("brutal");
        expect(parseVsAiDifficulty("default")).toBeUndefined();
        expect(parseVsAiDifficulty("")).toBeUndefined();
        expect(parseVsAiDifficulty(undefined)).toBeUndefined();
        expect(parseVsAiDifficulty(null)).toBeUndefined();
    });

    test("findAiSeatPlayerId returns the bot seat from a snapshot player list", () => {
        expect(findAiSeatPlayerId([{ playerId: "human-lower" }, { playerId: AI_SEAT_ID }])).toBe(AI_SEAT_ID);
        expect(findAiSeatPlayerId([{ playerId: "human-lower" }, { playerId: "human-upper" }])).toBeUndefined();
        expect(findAiSeatPlayerId(undefined)).toBeUndefined();
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

    test("remembers the difficulty for the marked game and forgets it for tier-less remarks", () => {
        const stored = new Map<string, string>();
        const localStorageStub = {
            getItem: (key: string) => stored.get(key) ?? null,
            setItem: (key: string, value: string) => void stored.set(key, value),
            removeItem: (key: string) => void stored.delete(key),
        } as unknown as Storage;
        const previous = (globalThis as { localStorage?: Storage }).localStorage;
        (globalThis as { localStorage?: Storage }).localStorage = localStorageStub;
        try {
            markVsAiGame("game-1", "brutal");
            expect(getMarkedVsAiDifficulty("game-1")).toBe("brutal");
            // Another game's id never inherits the marked difficulty.
            expect(getMarkedVsAiDifficulty("game-2")).toBeUndefined();
            // A legacy (tier-less) re-mark clears the stale difficulty.
            markVsAiGame("game-3");
            expect(getMarkedVsAiDifficulty("game-3")).toBeUndefined();
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
