import { describe, expect, test } from "bun:test";
import { CreatureVals } from "@heroesofcrypto/common";

import {
    PLAYER_PORTAL_STRATEGY_TILE_OVERLAP,
    PLAYER_PORTAL_STRATEGY_TILE_SIZE,
    playerPortalArtifactInfo,
    playerPortalCreatureLineupLabel,
    playerPortalMostPlayedFirst,
    playerPortalStrategyVisibleShare,
} from "./PlayerPortalPage";

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
