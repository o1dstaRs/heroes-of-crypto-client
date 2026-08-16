import { describe, expect, it } from "bun:test";

import { leagueEmblemPath } from "./league-emblems";

describe("leagueEmblemPath", () => {
    it("maps the five named leagues", () => {
        expect(leagueEmblemPath(1)).toContain("aspirant");
        expect(leagueEmblemPath(2)).toContain("vanguard");
        expect(leagueEmblemPath(3)).toContain("marshal");
        expect(leagueEmblemPath(4)).toContain("overlord");
        expect(leagueEmblemPath(5)).toContain("demigod");
    });

    it("uses calibration art for unplaced and unknown values", () => {
        expect(leagueEmblemPath(0)).toContain("calibration");
        expect(leagueEmblemPath(8)).toBe(leagueEmblemPath(0));
    });
});
