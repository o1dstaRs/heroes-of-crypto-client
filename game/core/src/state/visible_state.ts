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

export interface IVisibleUnit {
    amount: number;
    smallTextureName: string;
    teamType: TeamType;
}

export interface IVisibleImpact {
    name: string;
    smallTextureName: string;
    description: string;
    laps: number;
    stackPower: number;
    isStackPowered: boolean;
    isAura: boolean;
}

export interface IVisibleOverallImpact {
    abilities: IVisibleImpact[];
    buffs: IVisibleImpact[];
    debuffs: IVisibleImpact[];
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
    upNext: IVisibleUnit[];
}
