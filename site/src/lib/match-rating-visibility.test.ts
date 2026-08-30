import { describe, expect, it } from "bun:test";

import { matchIsRated, matchShowsMmr, type MatchRatingMode } from "./match-rating-visibility";

/**
 * The reported bug: the profile's match list printed "-45 MMR" on CALIBRATION rows, which reads as a
 * rating loss. Calibration never moves `mmr` — the server scores it into `provisionalMmr`, and a first
 * calibration discards even that in favour of a seed chosen by win count. These pin the split so the
 * site cannot drift back to treating calibration as a rating-bearing mode.
 */
describe("only ranked matches move MMR", () => {
    it("shows MMR for ranked and nothing else", () => {
        const modes: MatchRatingMode[] = ["ranked", "calibration", "lobby", "unknown"];
        expect(modes.filter(matchShowsMmr)).toEqual(["ranked"]);
    });

    it("still treats calibration as a rewarded mode, so its gold keeps showing", () => {
        expect(matchIsRated("calibration")).toBe(true);
        expect(matchShowsMmr("calibration")).toBe(false);
    });

    it("leaves lobby and unknown out of both", () => {
        for (const mode of ["lobby", "unknown"] as MatchRatingMode[]) {
            expect({ mode, rated: matchIsRated(mode), mmr: matchShowsMmr(mode) }).toEqual({
                mode,
                rated: false,
                mmr: false,
            });
        }
    });
});
