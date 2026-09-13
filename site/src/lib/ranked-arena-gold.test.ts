import { describe, expect, test } from "bun:test";

import { displayedGold } from "./gold-display";
import { normalizeTopResponse, viewerInLiveMatch } from "./ranked-arena-data";

describe("arena gold figures", () => {
    test("a row shows the total when the server sends it, else the available gold", () => {
        expect(displayedGold({ gold: 300, totalGold: 800 })).toBe(800);
        expect(displayedGold({ gold: 300 })).toBe(300);
        expect(displayedGold({ gold: 300, totalGold: Number.NaN })).toBe(300);
    });

    test("ladder rows keep available gold and carry the total and in-play figures when sent", () => {
        const [withTotal, legacy] = normalizeTopResponse({
            players: [
                { playerId: "a", gold: 300, totalGold: 800, goldInPlay: 500 },
                { playerId: "b", gold: 120 },
            ],
        }).players;
        expect([withTotal.gold, withTotal.totalGold, withTotal.goldInPlay]).toEqual([300, 800, 500]);
        expect([legacy.gold, legacy.totalGold, legacy.goldInPlay]).toEqual([120, undefined, undefined]);
    });
});

describe("spectating while in a match", () => {
    const games = [
        { gameId: "g1", players: [{ username: "IronWarden" }, { username: "FrostQueen" }] },
        { gameId: "g2", players: [{ username: "Artemis" }, { username: "Borealis" }] },
    ];

    test("a viewer seated in any live game is in a match, by current game or by name", () => {
        expect(viewerInLiveMatch({ username: "frostqueen " }, games)).toBe(true);
        expect(viewerInLiveMatch({ username: "Someone", in_game_id: "g2" }, games)).toBe(true);
    });

    test("a spectator, a signed-out visitor, or a stale current game is not", () => {
        expect(viewerInLiveMatch({ username: "Watcher" }, games)).toBe(false);
        expect(viewerInLiveMatch(null, games)).toBe(false);
        expect(viewerInLiveMatch({ username: "Watcher", in_game_id: "finished-game" }, games)).toBe(false);
    });
});
