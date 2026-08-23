import { describe, expect, it } from "bun:test";
import { PortalMatchKind } from "@heroesofcrypto/common";

import {
    filterPortalMatches,
    formatMatchDamage,
    formatMatchDuration,
    formatSignedMatchValue,
    matchKindPresentation,
    matchOpponentProfileHref,
    matchReplayPath,
    matchResultPresentation,
    normalizeMatchSetup,
    normalizePerformances,
    type PortalMatchData,
} from "./matchHistoryModel";

const match = (overrides: Partial<PortalMatchData> = {}): PortalMatchData => ({
    game_id: "game/one",
    won: false,
    abandoned: false,
    finished_time: 1,
    opponent_username: "Rival",
    team: 2,
    creature_ids: [1, 2],
    opponent_creature_ids: [3, 4],
    ...overrides,
});

describe("match history model", () => {
    it("formats bounded match durations", () => {
        expect(formatMatchDuration(undefined)).toBe("");
        expect(formatMatchDuration(-1)).toBe("");
        expect(formatMatchDuration(42_900)).toBe("42s");
        expect(formatMatchDuration(61_000)).toBe("1m 1s");
        expect(formatMatchDuration(3_600_000)).toBe("1h");
        expect(formatMatchDuration(3_900_000)).toBe("1h 5m");
    });

    it("formats damage compactly without hiding small values", () => {
        expect(formatMatchDamage(undefined)).toBe("0");
        expect(formatMatchDamage(842.4)).toBe("842");
        expect(formatMatchDamage(1_250)).toBe("1.3k");
        expect(formatMatchDamage(125_000)).toBe("125k");
        expect(formatMatchDamage(1_500_000)).toBe("1.5m");
    });

    it("keeps draws under All and outside win/loss filters", () => {
        const matches = [
            match({ game_id: "win", won: true }),
            match({ game_id: "loss" }),
            match({ game_id: "draw", draw: true }),
        ];

        expect(filterPortalMatches(matches, "all").map((entry) => entry.game_id)).toEqual(["win", "loss", "draw"]);
        expect(filterPortalMatches(matches, "wins").map((entry) => entry.game_id)).toEqual(["win"]);
        expect(filterPortalMatches(matches, "losses").map((entry) => entry.game_id)).toEqual(["loss"]);
    });

    it("distinguishes draws and which player abandoned", () => {
        expect(matchResultPresentation(match({ won: true }))).toEqual({ detail: "", label: "Victory", tone: "win" });
        expect(matchResultPresentation(match({ draw: true }))).toEqual({ detail: "", label: "Draw", tone: "draw" });
        expect(matchResultPresentation(match({ abandoned: true, player_abandoned: true }))).toEqual({
            detail: "You left",
            label: "Defeat",
            tone: "loss",
        });
        expect(matchResultPresentation(match({ won: true, abandoned: true, player_abandoned: false }))).toEqual({
            detail: "Opponent left",
            label: "Victory",
            tone: "win",
        });
    });

    it("presents explicit match modes without inferring from rating values", () => {
        expect(matchKindPresentation(match({ match_kind: PortalMatchKind.RANKED, mmr_delta: 0 }))).toEqual({
            detail: "",
            label: "Ranked",
            showsGold: true,
            showsMmr: true,
            tone: "ranked",
        });
        expect(matchKindPresentation(match({ match_kind: PortalMatchKind.LOBBY, mmr_delta: 42 }))).toEqual({
            detail: "",
            label: "Lobby",
            showsGold: false,
            showsMmr: false,
            tone: "lobby",
        });
        expect(matchKindPresentation(match({ match_kind: PortalMatchKind.UNKNOWN }))).toEqual({
            detail: "",
            label: "Match",
            showsGold: false,
            showsMmr: false,
            tone: "unknown",
        });
        expect(matchKindPresentation(match())).toEqual({
            detail: "",
            label: "Match",
            showsGold: false,
            showsMmr: false,
            tone: "unknown",
        });
    });

    it("hides calibration MMR but keeps its gold, which a wager can still pay", () => {
        // The provisional rating a placement game moves is hidden by design, so a row reporting
        // "MMR -40" reports a penalty the player cannot see the total of. Gold is the opposite case:
        // the result mints none during calibration, but betting on your own game pays the pot
        // regardless, so the reward is real and belongs on the row.
        expect(matchKindPresentation(match({ match_kind: PortalMatchKind.CALIBRATION, mmr_delta: -40 }))).toEqual({
            detail: "",
            label: "Calibration",
            showsGold: true,
            showsMmr: false,
            tone: "calibration",
        });
    });

    it("explains why a calibration game didn't advance the counter", () => {
        // Only a fully played-out "normal" game counts (ranked_math.ts RankedOutcomeReason) — a forfeit
        // or disconnect still moves MMR/gold at reduced weight, so the badge alone can't tell them apart.
        expect(
            matchKindPresentation(match({ match_kind: PortalMatchKind.CALIBRATION, outcome_reason: "normal" })).detail,
        ).toBe("");
        expect(
            matchKindPresentation(match({ match_kind: PortalMatchKind.CALIBRATION, outcome_reason: "concede" })).detail,
        ).toBe("Didn't count toward calibration — a player conceded");
        expect(
            matchKindPresentation(match({ match_kind: PortalMatchKind.CALIBRATION, outcome_reason: "disconnect" }))
                .detail,
        ).toBe("Didn't count toward calibration — a player disconnected");
        // A non-calibration match kind never shows the detail, even with a non-"normal" reason.
        expect(
            matchKindPresentation(match({ match_kind: PortalMatchKind.RANKED, outcome_reason: "concede" })).detail,
        ).toBe("");
    });

    it("formats signed rating and reward values", () => {
        expect(formatSignedMatchValue(undefined)).toBe("");
        expect(formatSignedMatchValue(Number.NaN)).toBe("");
        expect(formatSignedMatchValue(18)).toBe("+18");
        expect(formatSignedMatchValue(0)).toBe("0");
        expect(formatSignedMatchValue(-40.4)).toBe("-40");
    });

    it("keeps every valid recorded performer while normalizing and sorting damage", () => {
        expect(
            normalizePerformances([
                { creature_id: 2, damage_dealt: 400 },
                { creature_id: 0, damage_dealt: 900 },
                { creature_id: 1, damage_dealt: 800 },
                { creature_id: 6, damage_dealt: 50 },
                { creature_id: 4, damage_dealt: 200 },
                { creature_id: 5, damage_dealt: 100 },
                { creature_id: 3, damage_dealt: 300 },
            ]),
        ).toEqual([
            { creature_id: 1, damage_dealt: 800 },
            { creature_id: 2, damage_dealt: 400 },
            { creature_id: 3, damage_dealt: 300 },
            { creature_id: 4, damage_dealt: 200 },
            { creature_id: 5, damage_dealt: 100 },
            { creature_id: 6, damage_dealt: 50 },
        ]);
    });

    it("normalizes recorded setup choices and keeps legacy availability explicit", () => {
        expect(normalizeMatchSetup(undefined)).toEqual({
            artifactTier1: 0,
            artifactTier2: 0,
            perk: 0,
            augments: [],
            synergies: [],
            available: false,
            complete: false,
        });

        expect(
            normalizeMatchSetup({
                artifact_tier_1: 7.9,
                artifact_tier_2: 2,
                perk: 3,
                augment_placement: 2,
                augment_armor: 3,
                augment_might: 0,
                augment_sniper: 9,
                augment_movement: -2,
                synergies: ["Might:2:3", " Life:1:2 ", "Might:2:3", ""],
                complete: true,
            }),
        ).toEqual({
            artifactTier1: 7,
            artifactTier2: 2,
            perk: 3,
            augments: [
                { kind: "Placement", level: 3 },
                { kind: "Armor", level: 3 },
                { kind: "Sniper", level: 3 },
            ],
            synergies: ["Might:2:3", "Life:1:2"],
            available: true,
            complete: true,
        });
    });

    it("does not invent combat choices for an incomplete historical setup", () => {
        expect(
            normalizeMatchSetup({
                artifact_tier_1: 4,
                artifact_tier_2: 9,
                perk: 2,
                augment_placement: 0,
                augment_armor: 3,
                synergies: ["Might:2:3"],
                complete: false,
            }),
        ).toEqual({
            artifactTier1: 4,
            artifactTier2: 9,
            perk: 2,
            augments: [],
            synergies: [],
            available: true,
            complete: false,
        });
    });

    it("builds an encoded historical replay route", () => {
        expect(matchReplayPath(match())).toBe("/game/game%2Fone/replay?team=2");
    });

    it("builds a localized, safely encoded public opponent profile link", () => {
        expect(
            matchOpponentProfileHref(
                match({
                    opponent_player_id: "d1bb3dd1-037e-4b0c-91aa-dca47d4f30bb",
                    opponent_username: "A rival + friend",
                }),
                "en",
            ),
        ).toBe(
            "https://heroesofcrypto.io/profile/?playerId=d1bb3dd1-037e-4b0c-91aa-dca47d4f30bb&username=A+rival+%2B+friend",
        );
        expect(
            matchOpponentProfileHref(
                match({
                    opponent_player_id: "ai:v0.9:rb03:00000000000000000000000",
                    opponent_username: "AI v0.9 #03",
                }),
                "ru",
            ),
        ).toBe(
            "https://heroesofcrypto.io/ru/profile/?playerId=ai%3Av0.9%3Arb03%3A00000000000000000000000&username=AI+v0.9+%2303",
        );
    });

    it("keeps legacy matches without an opponent id as plain text", () => {
        expect(matchOpponentProfileHref(match(), "en")).toBe("");
        expect(matchOpponentProfileHref(match({ opponent_player_id: "   " }), "ru")).toBe("");
    });
});
