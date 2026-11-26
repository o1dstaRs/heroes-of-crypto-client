import { describe, expect, test } from "bun:test";

import { matchupScreenOrder, type MatchupPlayer } from "./MatchupOverlay";
import { MATCHUP_LEFT_TEAM, MATCHUP_RIGHT_TEAM } from "./matchupOverlayTone";

const green: MatchupPlayer = { team: MATCHUP_LEFT_TEAM, playerId: "green-player" };
const red: MatchupPlayer = { team: MATCHUP_RIGHT_TEAM, playerId: "red-player" };

describe("the matchup strip lines up with the board under it", () => {
    test("as dealt, the left seat sits left of the VS whatever order the players arrive in", () => {
        expect(matchupScreenOrder([red, green])).toEqual([green, red]);
        expect(matchupScreenOrder([green, red])).toEqual([green, red]);
    });

    test("on a board mirrored for its viewer, the two sides swap with the armies", () => {
        expect(matchupScreenOrder([green, red], true)).toEqual([red, green]);
    });

    test("a seat that has not arrived yet keeps its honest placeholder on its own side", () => {
        const [left, right] = matchupScreenOrder([red], true);
        expect(left).toBe(red);
        expect(right).toEqual({ team: MATCHUP_LEFT_TEAM, label: "Green" });
    });
});
