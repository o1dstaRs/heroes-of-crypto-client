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
        expect(leagueEmblemKey(0)).toBe("league_calibration_black_512");
        expect(leagueEmblemKey(99)).toBe(leagueEmblemKey(0));
    });

    it("maps every league and wealth tier to a distinct portrait", () => {
        const keys = [1, 2, 3, 4, 5].flatMap((league) => [1, 2, 3].map((wealth) => leagueEmblemKey(league, wealth)));
        expect(new Set(keys).size).toBe(15);
        expect(leagueEmblemKey(1, 1)).toBe("wealth_aspirant_ragged_512");
        expect(leagueEmblemKey(5, 3)).toBe("wealth_demigod_whale_512");
    });

    it("falls back to the generic league crest when wealth is missing or invalid", () => {
        expect(leagueEmblemKey(3, 0)).toBe("league_marshal_512");
        expect(leagueEmblemKey(3, 99)).toBe("league_marshal_512");
    });
});
