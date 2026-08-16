import { describe, expect, it } from "bun:test";

import { leagueEmblemSource } from "./LeagueEmblem";

describe("leagueEmblemSource", () => {
    it("maps all five leagues to distinct metal crests", () => {
        const sources = [1, 2, 3, 4, 5].map(leagueEmblemSource);
        expect(new Set(sources).size).toBe(5);
        expect(sources[0]).toContain("league_aspirant_512.webp");
        expect(sources[4]).toContain("league_demigod_512.webp");
    });

    it("uses the question-mark crest for calibration and unknown leagues", () => {
        expect(leagueEmblemSource(0)).toContain("league_calibration_512.webp");
        expect(leagueEmblemSource(99)).toBe(leagueEmblemSource(0));
    });
});
