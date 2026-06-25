import type { GameAction, TeamType } from "@heroesofcrypto/common";

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
}

export interface AuthoritativeGameSnapshot {
    gameId: string;
    viewerTeam?: TeamType | number;
    winnerTeam?: TeamType | number;
    phase: number;
    gridType: number;
    currentLap: number;
    fightStarted: boolean;
    fightFinished: boolean;
    currentUnitId: string;
    currentTurnTeam: TeamType | number;
    latestSequence: number;
    narrowingLayers: number;
    centerDried: boolean;
    units: AuthoritativeUnitState[];
    upNext?: string[];
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
