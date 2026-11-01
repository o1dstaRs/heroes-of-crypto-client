import { describe, expect, test } from "bun:test";
import { Artifact, CreatureVals } from "@heroesofcrypto/common";

import type { PortalMatchData } from "./matchHistoryModel";
import { matchHistoryPageCursor, matchHistorySuggestions, searchPortalMatches } from "./matchHistorySearch";

const match = (overrides: Partial<PortalMatchData> = {}): PortalMatchData => ({
    game_id: "history-game",
    finished_time: 1234,
    won: true,
    opponent_username: "MixedCaseRival",
    creature_ids: [CreatureVals.BERSERKER],
    opponent_creature_ids: [CreatureVals.WOLF],
    player_setup: { artifact_tier_1: Artifact.Tier1Artifact.DUAL_STRIKE_CHARM },
    ...overrides,
});

describe("match history search preview", () => {
    test("combines partial names regardless of capitalization or punctuation", () => {
        const games = [match(), match({ game_id: "other", creature_ids: [CreatureVals.SQUIRE] })];
        expect(searchPortalMatches(games, "  DUAL, bErSeRk ").map((game) => game.game_id)).toEqual(["history-game"]);
        expect(searchPortalMatches(games, "dual unknown name")).toEqual([]);
    });

    test("searches either army and lets the player distinguish their own build", () => {
        expect(searchPortalMatches([match()], "Dual Strike Wolf", "either")).toHaveLength(1);
        expect(searchPortalMatches([match()], "Wolf", "player")).toHaveLength(0);
        expect(searchPortalMatches([match()], "Wolf", "opponent")).toHaveLength(1);
        expect(searchPortalMatches([match()], "Dual Strike", "opponent")).toHaveLength(0);
    });

    test("keeps artifact ids qualified by tier and searches historical catalog entries", () => {
        const tierTwo = match({ player_setup: { artifact_tier_2: 7 } });
        expect(searchPortalMatches([tierTwo], "dual strike")).toHaveLength(0);
        expect(searchPortalMatches([tierTwo], "pendant vitality")).toHaveLength(1);
        expect(
            searchPortalMatches(
                [match({ player_setup: { artifact_tier_2: 10, complete: false } })],
                "tome amplification",
            ),
        ).toHaveLength(1);
    });

    test("accepts artifact names with or without straight and curly apostrophes", () => {
        const games = [match({ player_setup: { artifact_tier_1: Artifact.Tier1Artifact.HUNTERS_LONGBOW } })];
        for (const query of ["hunters longbow", "Hunter's Longbow", "Hunter’s Longbow"]) {
            expect(searchPortalMatches(games, query)).toHaveLength(1);
        }
    });

    test("keeps complete artifact names together across combined searches", () => {
        const real = match({ game_id: "real", player_setup: { artifact_tier_1: Artifact.Tier1Artifact.IRON_PLATE } });
        const decoy = match({
            game_id: "decoy",
            opponent_username: "Iron_Warden",
            player_setup: { artifact_tier_2: Artifact.Tier2Artifact.TITAN_PLATE },
        });
        expect(searchPortalMatches([real, decoy], "Iron Plate Berserker").map((game) => game.game_id)).toEqual([
            "real",
        ]);
    });

    test("an exact creature name does not match an artifact bearing that creature's name", () => {
        const decoy = match({
            creature_ids: [CreatureVals.SQUIRE],
            player_setup: {
                artifact_tier_1: Artifact.Tier1Artifact.DUAL_STRIKE_CHARM,
                artifact_tier_2: Artifact.Tier2Artifact.BERSERKERS_BOND,
            },
        });
        expect(searchPortalMatches([decoy], "Dual Strike Berserker")).toHaveLength(0);
        expect(searchPortalMatches([decoy], "Dual Strike berserk")).toHaveLength(1);
    });

    test("searches opponents without inventing metadata for missing historical setups", () => {
        const games = [match({ player_setup: undefined, opponent_setup: undefined, creature_ids: [9999] })];
        expect(searchPortalMatches(games, "mixedcaseRIVAL")).toHaveLength(1);
        expect(searchPortalMatches(games, "berserker")).toHaveLength(0);
        expect(searchPortalMatches(games, "")).toEqual(games);
    });

    test("encodes a timestamp and game id cursor compatible with server pagination", () => {
        const cursor = matchHistoryPageCursor(match());
        expect(JSON.parse(atob(cursor!.replace(/-/g, "+").replace(/_/g, "/")))).toEqual([1234, "history-game"]);
        expect(matchHistoryPageCursor(undefined)).toBeNull();
        expect(matchHistoryPageCursor(match({ finished_time: Number.NaN }))).toBeNull();
    });

    test("suggests named artifacts and creatures without repeating retired tier aliases", () => {
        expect(
            matchHistorySuggestions.some((option) => option.label === "Berserker" && option.kind === "creature"),
        ).toBe(true);
        expect(
            matchHistorySuggestions.some(
                (option) => option.label === "Dual Strike Charm" && option.kind === "artifact",
            ),
        ).toBe(true);
        expect(matchHistorySuggestions.filter((option) => option.label === "Tome of Amplification")).toHaveLength(1);
        expect(matchHistorySuggestions.some((option) => option.label === "Unknown")).toBe(false);
    });
});
