import { afterEach, describe, expect, test } from "bun:test";

import { TeamVals } from "@heroesofcrypto/common";
import {
    getViewerTeamForColors,
    isFriendlyTeam,
    setViewerTeamForColors,
    teamColor,
    TEAM_COLOR_GREEN,
    TEAM_COLOR_RED,
} from "./teamColors";

afterEach(() => setViewerTeamForColors(undefined));

describe("viewer-relative ranked team colors", () => {
    test("keeps canonical colors without a participant viewer", () => {
        setViewerTeamForColors(undefined);
        expect(teamColor(TeamVals.LOWER)).toBe(TEAM_COLOR_GREEN);
        expect(teamColor(TeamVals.UPPER)).toBe(TEAM_COLOR_RED);
    });

    test("renders an upper-seat participant green without changing team identity", () => {
        setViewerTeamForColors(TeamVals.UPPER);
        expect(getViewerTeamForColors()).toBe(TeamVals.UPPER);
        expect(isFriendlyTeam(TeamVals.UPPER)).toBe(true);
        expect(teamColor(TeamVals.UPPER)).toBe(TEAM_COLOR_GREEN);
        expect(teamColor(TeamVals.LOWER)).toBe(TEAM_COLOR_RED);
    });

    test("treats NO_TEAM as observer mode", () => {
        setViewerTeamForColors(TeamVals.NO_TEAM);
        expect(getViewerTeamForColors()).toBeUndefined();
        expect(teamColor(TeamVals.LOWER)).toBe(TEAM_COLOR_GREEN);
    });
});
