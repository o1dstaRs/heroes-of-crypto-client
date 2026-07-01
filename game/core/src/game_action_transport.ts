import type { GameAction, IDamageStatistic, TeamType } from "@heroesofcrypto/common";

export interface AuthoritativeCell {
    x: number;
    y: number;
}

export interface AuthoritativeUnitState {
    id: string;
    team: TeamType | number;
    name: string;
    creatureId: number;
    amountAlive: number;
    amountDied: number;
    hp: number;
    maxHp: number;
    attackType: number;
    size: number;
    baseCell: AuthoritativeCell;
    cells: AuthoritativeCell[];
    speed: number;
    morale: number;
    dead: boolean;
    placed: boolean;
    stackPower: number;
    /** Remaining ranged shots, 1-based on the wire (count + 1; 0/absent = unknown). */
    rangeShots: number;
    /** Authoritative effective luck (base + per-turn roll + auras); can be negative. */
    luck: number;
    /** Whether the unit is waiting on the hourglass (drives the hourglass icon on unit/UpNext/ALT). */
    onHourglass: boolean;
    debuffs?: string[];
    buffs?: string[];
    responded?: boolean;
}

export interface AuthoritativeJournalEntry {
    sequence: number;
    actionId: string;
    playerId: string;
    team: TeamType | number;
    actionType: number;
    actionJson: string;
    eventsJson: string;
    acceptedAtMs: number;
}

export interface AuthoritativeGameSnapshot {
    gameId: string;
    viewerTeam?: TeamType | number;
    localModelTeam?: TeamType | number;
    winnerTeam?: TeamType | number;
    phase: number;
    gridType: number;
    currentLap: number;
    fightStarted: boolean;
    fightFinished: boolean;
    currentUnitId: string;
    currentTurnTeam: TeamType | number;
    latestSequence: number;
    serverTimeMs?: number;
    placementDeadlineMs?: number;
    currentTurnStartMs?: number;
    currentTurnEndMs?: number;
    narrowingLayers: number;
    centerDried: boolean;
    units: AuthoritativeUnitState[];
    upNext?: string[];
    damageStats?: IDamageStatistic[];
    journalTail?: AuthoritativeJournalEntry[];
    // Each team's army totals captured at fight start (units + cumulative HP), so the fight-results
    // overlay renders casualty stats even for a team later fully wiped (whose units are then gone).
    lowerStartUnits?: number;
    upperStartUnits?: number;
    lowerStartHealth?: number;
    upperStartHealth?: number;
}

export type SceneGameActionTransportResult =
    | {
          handled: true;
          completed: boolean;
          message?: string;
      }
    | {
          handled: false;
          message?: string;
      };

export type SceneGameActionTransport = (action: GameAction) => SceneGameActionTransportResult;
