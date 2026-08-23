import { describe, expect, test } from "bun:test";
import { CreatureVals } from "@heroesofcrypto/common";

import {
    playerPortalArtifactInfo,
    playerPortalCreatureLineupLabel,
    playerPortalMostPlayedFirst,
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
