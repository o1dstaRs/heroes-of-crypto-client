import { describe, expect, test } from "bun:test";

import { TeamVals } from "@heroesofcrypto/common";
import * as teamColors from "./teamColors";
import { isGreenTeam, teamColor, TEAM_COLOR_GREEN, TEAM_COLOR_RED } from "./teamColors";

/**
 * Board colours are TEAM-FIXED and must stay that way: LOWER is always green, UPPER always red, on every
 * screen — for both participants and every observer.
 *
 * This is a guard, not a description. The viewer-relative "whoever is playing is green" flip has now been
 * introduced and reverted TWICE (owner call 2026-08-08, and again 2026-08-28 after b0aed99c). Each time it
 * drew the same match in opposite colours on the two players' screens, and the second attempt also left the
 * board disagreeing with the Up Next queue, the stats pips, the fight log and a results card labelled
 * "GREEN LOSSES" while painted red — because a viewer-relative palette has to be threaded through every
 * surface that names a colour, and only the Pixi board ever was.
 *
 * If a future change makes these helpers depend on who is looking, it fails here first.
 */
describe("team colours are fixed to the team, never to the viewer", () => {
    test("LOWER is green and UPPER is red", () => {
        expect(teamColor(TeamVals.LOWER)).toBe(TEAM_COLOR_GREEN);
        expect(teamColor(TeamVals.UPPER)).toBe(TEAM_COLOR_RED);
        expect(isGreenTeam(TeamVals.LOWER)).toBe(true);
        expect(isGreenTeam(TeamVals.UPPER)).toBe(false);
    });

    test("the answer depends on nothing but the team argument", () => {
        // Called repeatedly and interleaved: a module that had learned a viewer would drift between calls.
        for (let i = 0; i < 50; i++) {
            expect(teamColor(TeamVals.UPPER)).toBe(TEAM_COLOR_RED);
            expect(teamColor(TeamVals.LOWER)).toBe(TEAM_COLOR_GREEN);
        }
    });

    test("the module exposes no way to tell it who is looking", () => {
        // The flip shipped as setViewerTeamForColors/isFriendlyTeam; pin that the seam is gone, so
        // reintroducing it is a deliberate act rather than an import that quietly still resolves.
        const api = Object.keys(teamColors);
        expect(api).not.toContain("setViewerTeamForColors");
        expect(api).not.toContain("getViewerTeamForColors");
        expect(api).not.toContain("isFriendlyTeam");
    });
});
