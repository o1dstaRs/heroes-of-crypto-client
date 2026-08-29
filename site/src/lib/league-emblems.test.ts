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

    it("maps every placed league and wealth tier to a distinct portrait", () => {
        const paths = [1, 2, 3, 4, 5].flatMap((league) => [1, 2, 3].map((wealth) => leagueEmblemPath(league, wealth)));
        expect(new Set(paths).size).toBe(15);
        expect(leagueEmblemPath(1, 1)).toContain("wealth_aspirant_ragged");
        expect(leagueEmblemPath(5, 3)).toContain("wealth_demigod_whale");
    });

    it("keeps the generic league crest when wealth is missing or invalid", () => {
        expect(leagueEmblemPath(3, 0)).toBe(leagueEmblemPath(3));
        expect(leagueEmblemPath(3, 99)).toBe(leagueEmblemPath(3));
    });
});
