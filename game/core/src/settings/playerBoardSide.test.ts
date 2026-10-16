import { afterEach, describe, expect, test } from "bun:test";

import { TeamVals } from "@heroesofcrypto/common";

import {
    BOARD_SIDE_PREFERENCES,
    DEFAULT_BOARD_SIDE_PREFERENCE,
    readBoardSidePreference,
    shouldMirrorBoard,
    writeBoardSidePreference,
    type BoardSidePreference,
} from "./playerBoardSide";

const LEFT = TeamVals.LEFT;
const RIGHT = TeamVals.RIGHT;

// The preference lives in localStorage, which the test runner has no DOM to provide.
const store = new Map<string, string>();
const memoryStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
        store.set(key, value);
    },
};
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage;

afterEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = memoryStorage;
});

const mirrors = (preference: BoardSidePreference, viewerTeam: number | undefined, live = true): boolean =>
    shouldMirrorBoard({ viewerTeam: viewerTeam as never, preference, live });

/**
 * A player picks the side of the battlefield they want to SEE their army on. The seat itself is dealt by the
 * match and never changes: the board is only drawn mirrored for them when the two disagree.
 */
describe("which boards are mirrored", () => {
    test("the default keeps the side the match dealt, from either seat", () => {
        expect(DEFAULT_BOARD_SIDE_PREFERENCE).toBe("seat");
        expect(mirrors("seat", LEFT)).toBe(false);
        expect(mirrors("seat", RIGHT)).toBe(false);
    });

    test("'left' mirrors only the board of a player seated on the right", () => {
        expect(mirrors("left", RIGHT)).toBe(true);
        expect(mirrors("left", LEFT)).toBe(false);
    });

    test("'right' mirrors only the board of a player seated on the left", () => {
        expect(mirrors("right", LEFT)).toBe(true);
        expect(mirrors("right", RIGHT)).toBe(false);
    });

    test("a replay always shows the true sides, whatever the person watching prefers", () => {
        for (const preference of BOARD_SIDE_PREFERENCES) {
            expect(mirrors(preference, LEFT, false)).toBe(false);
            expect(mirrors(preference, RIGHT, false)).toBe(false);
        }
    });

    test("an observer has no side of their own, so their board is never mirrored", () => {
        for (const preference of BOARD_SIDE_PREFERENCES) {
            expect(mirrors(preference, undefined)).toBe(false);
            expect(mirrors(preference, TeamVals.NO_TEAM)).toBe(false);
        }
    });
});

describe("the stored preference", () => {
    test("round-trips every choice", () => {
        for (const preference of BOARD_SIDE_PREFERENCES) {
            writeBoardSidePreference(preference);
            expect(readBoardSidePreference()).toBe(preference);
        }
    });

    test("an unset or unknown value reads as the default", () => {
        expect(readBoardSidePreference()).toBe("seat");
        store.set("hoc.ranked.boardSide", "upper");
        expect(readBoardSidePreference()).toBe("seat");
    });

    test("a browser that refuses storage still renders the fight with the default", () => {
        (globalThis as { localStorage?: unknown }).localStorage = {
            getItem: () => {
                throw new Error("SecurityError");
            },
            setItem: () => {
                throw new Error("SecurityError");
            },
        };
        expect(() => writeBoardSidePreference("left")).not.toThrow();
        expect(readBoardSidePreference()).toBe("seat");
    });
});
