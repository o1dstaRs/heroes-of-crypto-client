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
    getName(): string;
}

type RankedSynergySnapshot = Pick<PlaySnapshot, "gameId" | "fightStarted" | "leftSynergies" | "rightSynergies">;

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

    store.setSynergiesPerTeam(TeamVals.LEFT, snapshot.fightStarted ? (snapshot.leftSynergies ?? []) : []);
    store.setSynergiesPerTeam(TeamVals.RIGHT, snapshot.fightStarted ? (snapshot.rightSynergies ?? []) : []);
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
    // Synergies count DISTINCT drafted creatures, not stacks: splitting a creature into multiple placement
    // stacks (each sharing the creature's name) must not inflate its faction's synergy level. It is a property
    // of the fielded army, fixed before placement — so dedupe by creature name here to match the server.
    const seen = new Map<TeamType, { life: Set<string>; chaos: Set<string>; might: Set<string>; nature: Set<string> }>([
        [TeamVals.LEFT as TeamType, { life: new Set(), chaos: new Set(), might: new Set(), nature: new Set() }],
        [TeamVals.RIGHT as TeamType, { life: new Set(), chaos: new Set(), might: new Set(), nature: new Set() }],
    ]);
    for (const unit of units) {
        const teamSeen = seen.get(unit.getTeam());
        if (!teamSeen) {
            continue;
        }
        const name = unit.getName();
        const faction = unit.getFaction();
        if (faction === FactionVals.LIFE) {
            teamSeen.life.add(name);
        } else if (faction === FactionVals.CHAOS) {
            teamSeen.chaos.add(name);
        } else if (faction === FactionVals.MIGHT) {
            teamSeen.might.add(name);
        } else if (faction === FactionVals.NATURE) {
            teamSeen.nature.add(name);
        }
    }
    for (const [team, teamSeen] of seen) {
        store.setSynergyUnitsPerFactions(
            team,
            teamSeen.life.size,
            teamSeen.chaos.size,
            teamSeen.might.size,
            teamSeen.nature.size,
        );
    }
};
