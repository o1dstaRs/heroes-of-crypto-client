/*
 * -----------------------------------------------------------------------------
 * This file is part of the browser implementation of the Heroes of Crypto game client.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { TeamType } from "@heroesofcrypto/common";

export interface IFightState {
    id: string;
    currentLap: number;
    firstTurnMade: boolean;
    fightFinished: boolean;
    previousTurnTeam: TeamType;
    highestSpeedThisTurn: number;
    alreadyMadeTurn: Set<string>;
    alreadyMadeTurnByTeam: Map<number, Set<string>>;
    alreadyHourGlass: Set<string>;
    alreadyRepliedAttack: Set<string>;
    teamUnitsAlive: Map<number, number>;
    hourGlassQueue: string[];
    moralePlusQueue: string[];
    moraleMinusQueue: string[];
    currentTurnStart: number;
    currentTurnEnd: number;
    currentLapTotalTimePerTeam: Map<number, number>;
    upNext: string[];
    stepsMoraleMultiplier: number;
    hasAdditionalTimeRequestedPerTeam: Map<number, boolean>;
}

export interface IVisibleState {
    canBeStarted: boolean;
    hasFinished: boolean;
    secondsRemaining: number;
    secondsMax: number;
    teamTypeTurn?: TeamType;
    hasAdditionalTime: boolean;
    lapNumber: number;
    numberOfLapsTillNarrowing: number;
    numberOfLapsTillStopNarrowing: number;
    canRequestAdditionalTime: boolean;
}
