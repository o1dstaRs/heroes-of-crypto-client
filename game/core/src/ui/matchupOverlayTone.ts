import { TeamVals, type TeamType } from "@heroesofcrypto/common";

import { readPlayerArmyColorId, resolvePlayerArmyColor } from "../settings/playerArmyColor";

// LEFT/RIGHT are being renamed to LOWER/UPPER in common without changing their wire values.
const teamValues = TeamVals as unknown as Record<string, number>;
export const MATCHUP_LOWER_TEAM = (teamValues.LEFT ?? teamValues.LOWER ?? 2) as TeamType;
export const MATCHUP_UPPER_TEAM = (teamValues.RIGHT ?? teamValues.UPPER ?? 1) as TeamType;

export type MatchupTeamTone = Readonly<{
    bright: string;
    edge: string;
    face: string;
    panel: string;
}>;

const AUTHORED_LOWER_TONE: MatchupTeamTone = {
    bright: "#8fd69b",
    edge: "#356d52",
    face: "linear-gradient(135deg, rgba(44,112,80,.96), rgba(12,36,29,.98))",
    panel: "rgba(20,80,61,.96)",
};

const AUTHORED_UPPER_TONE: MatchupTeamTone = {
    bright: "#ee9a90",
    edge: "#813c41",
    face: "linear-gradient(135deg, rgba(122,48,53,.98), rgba(44,17,22,.99))",
    panel: "rgba(102,35,43,.96)",
};

const cssHex = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;

/**
 * Match the same viewer-relative paint used by the live battlefield: once the player chooses an army
 * colour, their side uses that preset and the opponent is painted red. Observers and the team-default
 * setting retain the authored lower/upper colours.
 */
export const matchupTeamTone = (
    team: TeamType,
    viewerTeam: TeamType | undefined,
    presetId = readPlayerArmyColorId(),
): MatchupTeamTone => {
    const personal = resolvePlayerArmyColor({ team, viewerTeam, presetId, live: true });
    if (personal) {
        const [edge, center, farEdge] = personal.gradient.map(cssHex);
        return {
            bright: cssHex(personal.color),
            edge,
            face: `linear-gradient(135deg, ${edge}, ${center} 55%, ${farEdge})`,
            panel: center,
        };
    }

    return team === MATCHUP_LOWER_TEAM ? AUTHORED_LOWER_TONE : AUTHORED_UPPER_TONE;
};
