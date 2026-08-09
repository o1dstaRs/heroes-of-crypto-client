import { FactionVals, TeamVals, type TeamType } from "@heroesofcrypto/common";

import type { PlaySnapshot } from "../api/play_protocol";

interface RankedSynergyStore {
    setSynergiesPerTeam(team: TeamType, synergies: string[]): void;
}

interface RankedSynergyCountsStore {
    setSynergyUnitsPerFactions(team: TeamType, life: number, chaos: number, might: number, nature: number): void;
}

interface FactionCountableUnit {
    getTeam(): TeamType;
    getFaction(): number;
}

type RankedSynergySnapshot = Pick<PlaySnapshot, "gameId" | "fightStarted" | "lowerSynergies" | "upperSynergies">;

/**
 * Keeps the process-global fight model scoped to one ranked game. Placement snapshots intentionally hide
 * synergies, so only the first snapshot for a game clears stale state; later placement snapshots preserve
 * the locally-derived faction bonuses. Once the fight starts, both teams are replaced from authoritative data.
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

/**
 * Keep the local engine's per-faction unit counts current during ranked PLACEMENT. Synergy levels
 * derive from those counts (2/4/6 units -> level 1/2/3), and the client's own placement gate reads
 * them through getNumberOfUnitsAvailableForPlacement — with the counts never set (only Sandbox set
 * them), Nature's INCREASE_BOARD_UNITS resolved to level 0 locally and the client refused the extra
 * board slot the server was ready to accept: "the Nature board-units synergy never works in ranked".
 * Once the fight is LIVE this must NOT run: the authoritative synergy lists own the fight (they are
 * baseline-frozen server-side so deaths never strip a synergy), and a local recount from survivors
 * would do exactly that stripping.
 */
export const syncPlacementSynergyUnitCounts = (
    store: RankedSynergyCountsStore,
    units: Iterable<FactionCountableUnit>,
    fightStarted: boolean,
): void => {
    if (fightStarted) {
        return;
    }
    const counts = new Map<TeamType, { life: number; chaos: number; might: number; nature: number }>([
        [TeamVals.LOWER as TeamType, { life: 0, chaos: 0, might: 0, nature: 0 }],
        [TeamVals.UPPER as TeamType, { life: 0, chaos: 0, might: 0, nature: 0 }],
    ]);
    for (const unit of units) {
        const teamCounts = counts.get(unit.getTeam());
        if (!teamCounts) {
            continue;
        }
        const faction = unit.getFaction();
        if (faction === FactionVals.LIFE) {
            teamCounts.life += 1;
        } else if (faction === FactionVals.CHAOS) {
            teamCounts.chaos += 1;
        } else if (faction === FactionVals.MIGHT) {
            teamCounts.might += 1;
        } else if (faction === FactionVals.NATURE) {
            teamCounts.nature += 1;
        }
    }
    for (const [team, teamCounts] of counts) {
        store.setSynergyUnitsPerFactions(team, teamCounts.life, teamCounts.chaos, teamCounts.might, teamCounts.nature);
    }
};
