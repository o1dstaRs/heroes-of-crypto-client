import { describe, expect, it } from "bun:test";

import {
    filterPortalMatches,
    formatMatchDamage,
    formatMatchDuration,
    matchReplayPath,
    matchResultPresentation,
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

    it("normalizes and sorts top performers", () => {
        expect(
            normalizePerformances([
                { creature_id: 2, damage_dealt: 400 },
                { creature_id: 0, damage_dealt: 900 },
                { creature_id: 1, damage_dealt: 800 },
            ]),
        ).toEqual([
            { creature_id: 1, damage_dealt: 800 },
            { creature_id: 2, damage_dealt: 400 },
        ]);
    });

    it("builds an encoded historical replay route", () => {
        expect(matchReplayPath(match())).toBe("/game/game%2Fone/replay?team=2");
    });
});
