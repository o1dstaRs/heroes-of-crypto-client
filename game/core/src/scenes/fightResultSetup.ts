import { TeamVals, synergyVariantsForSeed, type FightProperties } from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import type { IFightResultSetup } from "./VisibleState";

/** Copy the fight's choices, never the saved doctrine for the next AI game. */
export const captureFightResultSetup = (fight: FightProperties): IFightResultSetup => ({
    armies: [TeamVals.LEFT, TeamVals.RIGHT].map((team) => ({
        team,
        doctrine: fight.getDoctrine(team),
        artifactTier1: fight.getArtifactTier1(team),
        artifactTier2: fight.getArtifactTier2(team),
    })),
    synergyVariants: fight.getSynergyVariants(),
});

/**
 * Read the recorded authority directly: replay actions can run without React's placement setup effect,
 * and a cold terminal snapshot must not inherit whatever FightProperties held for the previous match.
 * Undefined legacy fields stay unknown instead of borrowing today's choices or pretending they were zero.
 */
export const fightResultSetupFromSnapshot = (snapshot: AuthoritativeGameSnapshot): IFightResultSetup => ({
    armies: [
        {
            team: TeamVals.LEFT,
            doctrine: snapshot.leftDoctrine,
            artifactTier1: snapshot.leftArtifactTier1,
            artifactTier2: snapshot.leftArtifactTier2,
        },
        {
            team: TeamVals.RIGHT,
            doctrine: snapshot.rightDoctrine,
            artifactTier1: snapshot.rightArtifactTier1,
            artifactTier2: snapshot.rightArtifactTier2,
        },
    ],
    synergyVariants: synergyVariantsForSeed(snapshot.gameId),
});
