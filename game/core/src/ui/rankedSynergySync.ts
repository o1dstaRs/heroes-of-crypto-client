import { TeamVals, type TeamType } from "@heroesofcrypto/common";

import type { PlaySnapshot } from "../api/play_protocol";

interface RankedSynergyStore {
    setSynergiesPerTeam(team: TeamType, synergies: string[]): void;
}

type RankedSynergySnapshot = Pick<PlaySnapshot, "gameId" | "fightStarted" | "lowerSynergies" | "upperSynergies">;

/**
 * Keeps the process-global fight model scoped to one ranked game. Placement snapshots intentionally hide
 * synergies, so only the first snapshot for a game clears stale state; later placement snapshots preserve
 * the viewer's optimistic choices. Once the fight starts, both teams are replaced from authoritative data.
 */
export const syncRankedSnapshotSynergies = (
    store: RankedSynergyStore,
    snapshot: RankedSynergySnapshot,
    previousGameId: string | undefined,
): string => {
    if (previousGameId === snapshot.gameId && !snapshot.fightStarted) {
        return snapshot.gameId;
    }

    store.setSynergiesPerTeam(TeamVals.LOWER, snapshot.fightStarted ? (snapshot.lowerSynergies ?? []) : []);
    store.setSynergiesPerTeam(TeamVals.UPPER, snapshot.fightStarted ? (snapshot.upperSynergies ?? []) : []);
    return snapshot.gameId;
};
