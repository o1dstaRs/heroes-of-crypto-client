import { describe, expect, test } from "bun:test";
import { CreatureVals } from "@heroesofcrypto/common";

import {
    PLAYER_PORTAL_STRATEGY_TILE_OVERLAP,
    PLAYER_PORTAL_STRATEGY_TILE_SIZE,
    playerPortalArtifactInfo,
    playerPortalCreatureLineupLabel,
    playerPortalExitAccount,
    playerPortalMostPlayedFirst,
    playerPortalStrategyVisibleShare,
} from "./PlayerPortalPage";

describe("player portal exit account", () => {
    const spies = () => {
        const cleared: (string | null)[] = [];
        let redirects = 0;
        return {
            cleared,
            clearSession: (token: string | null) => cleared.push(token),
            redirect: () => {
                redirects += 1;
            },
            redirectCount: () => redirects,
        };
    };

    test("a successful sign-out leaves the session to the auth service and lands on the login screen", async () => {
        const spy = spies();
        let loggedOut = 0;

        await playerPortalExitAccount({
            logout: async () => {
                loggedOut += 1;
            },
            clearSession: spy.clearSession,
            redirect: spy.redirect,
        });

        expect(loggedOut).toBe(1);
        expect(spy.cleared).toEqual([]);
        expect(spy.redirectCount()).toBe(1);
    });

    /** A failed call used to strand the player inside an account they asked to leave. */
    test("a failed sign-out still drops this browser's credentials", async () => {
        const spy = spies();

        await playerPortalExitAccount({
            logout: async () => {
                throw new Error("network down");
            },
            clearSession: spy.clearSession,
            redirect: spy.redirect,
        });

        expect(spy.cleared).toEqual([null]);
        expect(spy.redirectCount()).toBe(1);
    });

    test("a missing auth context is treated as a failed sign-out, not as success", async () => {
        const spy = spies();

        await playerPortalExitAccount({
            logout: undefined,
            clearSession: spy.clearSession,
            redirect: spy.redirect,
        });

        expect(spy.cleared).toEqual([null]);
        expect(spy.redirectCount()).toBe(1);
    });
});

describe("player portal artifact history", () => {
    test("resolves retired artifacts from the compatibility catalog", () => {
        expect(playerPortalArtifactInfo(1, 12)).toMatchObject({
            name: "Broken Aegis",
            imageKey: "artifact_t1_broken_aegis_256",
        });
    });

    test("does not invent metadata for an unknown historical id", () => {
        expect(playerPortalArtifactInfo(2, 999)).toBeUndefined();
    });
});

describe("player portal combo portraits", () => {
    /**
     * A combo names three creatures, so all three have to be recognisable. Every portrait except the last
     * is painted over by the one after it, and what survives is its left-hand strip — mostly backdrop on a
     * centrally framed portrait. The original 24-of-54px overlap left only 55% of each covered tile (41%
     * on mobile) and the middle creature read as an empty gap between its two legible neighbours.
     */
    test("a covered portrait keeps enough width to identify the creature", () => {
        for (const breakpoint of ["xs", "sm"] as const) {
            expect(playerPortalStrategyVisibleShare(breakpoint)).toBeGreaterThanOrEqual(0.75);
        }
    });

    test("the overlap is real, so a trio still reads as one line-up", () => {
        for (const breakpoint of ["xs", "sm"] as const) {
            expect(PLAYER_PORTAL_STRATEGY_TILE_OVERLAP[breakpoint]).toBeGreaterThan(0);
            expect(PLAYER_PORTAL_STRATEGY_TILE_OVERLAP[breakpoint]).toBeLessThan(
                PLAYER_PORTAL_STRATEGY_TILE_SIZE[breakpoint],
            );
        }
    });

    test("the mobile tile stays smaller than the desktop one", () => {
        expect(PLAYER_PORTAL_STRATEGY_TILE_SIZE.xs).toBeLessThan(PLAYER_PORTAL_STRATEGY_TILE_SIZE.sm);
    });
});

describe("player portal strategy labels", () => {
    test("names every creature in a combo and removes duplicate portraits", () => {
        expect(playerPortalCreatureLineupLabel([CreatureVals.ELF, CreatureVals.MERMAID, CreatureVals.ELF])).toBe(
            "Elf + Mermaid",
        );
    });
});

describe("player portal usage statistics", () => {
    test("sorts by games played and uses win rate only to break ties", () => {
        const stats = [
            { id: "perfect-small", games: 2, wins: 2 },
            { id: "most-played", games: 9, wins: 3 },
            { id: "tie-lower-rate", games: 5, wins: 2 },
            { id: "tie-higher-rate", games: 5, wins: 4 },
        ];

        expect(playerPortalMostPlayedFirst(stats).map(({ id }) => id)).toEqual([
            "most-played",
            "tie-higher-rate",
            "tie-lower-rate",
            "perfect-small",
        ]);
    });
});
