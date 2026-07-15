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
    /** Remaining laps per debuff/effect, parallel to `debuffs` — lets the ranked HUD render combat debuffs. */
    debuffLaps?: number[];
    /** Display-ready description per debuff/effect, parallel to `debuffs` (power already substituted in). */
    debuffDescriptions?: string[];
    buffs?: string[];
    responded?: boolean;
    /** True if the unit already used its hourglass (wait) this lap — disables the Wait button in ranked. */
    hasHourglassed?: boolean;
    /** True if the unit is skipping this turn (Stun/Blindness) — drives the stun icon in ranked. */
    skipping?: boolean;
    /** Aggr forced target: the unit id this unit is compelled to attack (empty/undefined = none). */
    forcedTargetId?: string;
    /** Remaining casts (scrolls) per spell in the unit's spellbook, in getSpells() order. Ranked syncs this
     * so the client's spell.amountRemaining matches the server (it never runs the cast engine locally). */
    spellAmounts?: number[];
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
    // Same fight-start capture, broken down per creature type (parallel arrays: creatureIds[i] fielded
    // in amounts[i]) — lets the fight-results overlay render a correct per-creature casualty breakdown
    // even for a team that lost an entire creature type (whose stacks are then gone from `units` too).
    lowerStartRosterCreatureIds?: number[];
    lowerStartRosterAmounts?: number[];
    upperStartRosterCreatureIds?: number[];
    upperStartRosterAmounts?: number[];
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

export interface SceneGameActionTransportOptions {
    /** Keep an accepted move active for the immediately queued spell/area-throw follow-up. */
    continueTurn?: boolean;
}

export type SceneGameActionTransport = (
    action: GameAction,
    options?: SceneGameActionTransportOptions,
) => SceneGameActionTransportResult;
