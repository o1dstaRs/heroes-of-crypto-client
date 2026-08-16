import { describe, expect, it } from "bun:test";

import { leagueEmblemKey } from "./LeagueEmblem";

describe("leagueEmblemKey", () => {
    it("maps all five leagues to distinct metal crests", () => {
        const keys = [1, 2, 3, 4, 5].map(leagueEmblemKey);
        expect(new Set(keys).size).toBe(5);
        expect(keys[0]).toBe("league_aspirant_512");
        expect(keys[4]).toBe("league_demigod_512");
    });

    it("uses the question-mark crest for calibration and unknown leagues", () => {
        expect(leagueEmblemKey(0)).toBe("league_calibration_512");
        expect(leagueEmblemKey(99)).toBe(leagueEmblemKey(0));
    });
});
