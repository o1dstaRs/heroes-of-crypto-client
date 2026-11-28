import { describe, expect, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";

import { getTeamFlagBackground } from "./TeamAmountFlag";
import { TEAM_FLAG_PALETTE_GREEN, TEAM_FLAG_PALETTE_RED } from "../scenes/teamColors";

describe("team amount flag palette", () => {
    test("uses the same green and red cloth shades as battlefield amount flags", () => {
        expect(getTeamFlagBackground(TeamVals.LEFT)).toBe(`#${TEAM_FLAG_PALETTE_GREEN.edge.toString(16)}`);
        expect(getTeamFlagBackground(TeamVals.RIGHT)).toBe(`#${TEAM_FLAG_PALETTE_RED.edge.toString(16)}`);
    });
});
