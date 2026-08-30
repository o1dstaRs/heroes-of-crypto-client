import { describe, expect, test } from "bun:test";

import { OPPONENT_ARMY_COLOR } from "../settings/playerArmyColor";
import { MATCHUP_LOWER_TEAM, MATCHUP_UPPER_TEAM, matchupTeamTone } from "./matchupOverlayTone";

const hex = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

describe("matchup overlay team tones", () => {
    test("keeps the authored team colours for the default setting", () => {
        expect(matchupTeamTone(MATCHUP_LOWER_TEAM, MATCHUP_LOWER_TEAM, "team").bright).toBe("#8fd69b");
        expect(matchupTeamTone(MATCHUP_UPPER_TEAM, MATCHUP_LOWER_TEAM, "team").bright).toBe("#ee9a90");
    });

    test("uses the player's preset on whichever team they occupy and paints the opponent red", () => {
        expect(matchupTeamTone(MATCHUP_UPPER_TEAM, MATCHUP_UPPER_TEAM, "azure").bright).toBe("#1e90ff");
        expect(matchupTeamTone(MATCHUP_LOWER_TEAM, MATCHUP_UPPER_TEAM, "azure").bright).toBe(
            hex(OPPONENT_ARMY_COLOR.color),
        );
    });

    test("does not apply a local preference to observers", () => {
        expect(matchupTeamTone(MATCHUP_LOWER_TEAM, undefined, "amethyst").bright).toBe("#8fd69b");
        expect(matchupTeamTone(MATCHUP_UPPER_TEAM, undefined, "amethyst").bright).toBe("#ee9a90");
    });
});
