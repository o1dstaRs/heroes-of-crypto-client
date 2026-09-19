import { describe, expect, test } from "bun:test";
import { TeamVals } from "@heroesofcrypto/common";

import {
    fightLogDotColor,
    splitFightLogTeamDots,
    teamDotDefaultColor,
    TEAM_DOT_LEFT,
    TEAM_DOT_RIGHT,
} from "./fightLogTeamDots";

describe("fight log team dots", () => {
    test("splits a line around its team marker and keeps the rest of the text intact", () => {
        expect(splitFightLogTeamDots(`${TEAM_DOT_LEFT} FRENZIED BOAR MOVED TO (13, 12)`)).toEqual([
            { kind: "dot", team: TeamVals.LEFT },
            { kind: "text", text: " FRENZIED BOAR MOVED TO (13, 12)" },
        ]);
    });

    test("handles a line that marks both sides", () => {
        expect(splitFightLogTeamDots(`${TEAM_DOT_RIGHT} SCAVENGER hits ${TEAM_DOT_LEFT} CRUSADER`)).toEqual([
            { kind: "dot", team: TeamVals.RIGHT },
            { kind: "text", text: " SCAVENGER hits " },
            { kind: "dot", team: TeamVals.LEFT },
            { kind: "text", text: " CRUSADER" },
        ]);
    });

    test("a line without a marker stays one text run", () => {
        expect(splitFightLogTeamDots("LAP 2 STARTED")).toEqual([{ kind: "text", text: "LAP 2 STARTED" }]);
    });

    /** Multi-code-unit characters must survive the per-character walk. */
    test("keeps other emoji and punctuation in place", () => {
        expect(splitFightLogTeamDots(`${TEAM_DOT_LEFT} PIKEMAN HIT 103 💀 3`)).toEqual([
            { kind: "dot", team: TeamVals.LEFT },
            { kind: "text", text: " PIKEMAN HIT 103 💀 3" },
        ]);
    });

    test("falls back to the canonical team colours when no personal tint is armed", () => {
        expect(fightLogDotColor(TeamVals.LEFT, undefined)).toBe(teamDotDefaultColor(TeamVals.LEFT));
        expect(fightLogDotColor(TeamVals.RIGHT, undefined)).toBe(teamDotDefaultColor(TeamVals.RIGHT));
        expect(teamDotDefaultColor(TeamVals.LEFT)).toBe("#00d200");
        expect(teamDotDefaultColor(TeamVals.RIGHT)).toBe("#ff0000");
    });

    test("uses the armed colour so the dot matches how that army is painted", () => {
        expect(fightLogDotColor(TeamVals.LEFT, "#9b30ff")).toBe("#9b30ff");
    });
});
