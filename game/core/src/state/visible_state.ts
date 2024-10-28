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

import { TeamType, HoCMath, AttackType, MovementType } from "@heroesofcrypto/common";

export interface IVisibleUnit {
    amount: number;
    smallTextureName: string;
    teamType: TeamType;
    isOnHourglass: boolean;
    isSkipping: boolean;
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

export interface IVisibleDamage {
    amount: number;
    render: boolean;
    unitPosition: HoCMath.XY;
    unitIsSmall: boolean;
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

export enum VisibleButtonState {
    FIRST = 1,
    SECOND = 2,
    THIRD = 3,
}

export interface IVisibleButton {
    name: string;
    text: string;
    state: VisibleButtonState;
    isVisible: boolean;
    isDisabled: boolean;
    numberOfOptions: number;
    selectedOption: number;
    customSpriteName?: string;
}

export interface IHoverInfo {
    attackType: AttackType;
    damageSpread: string;
    damageRangeDivisor: string;
    killsSpread: string;
    unitName: string;
    unitLevel: number;
    unitMovementType: MovementType;
    information: string[];
}

export type VisibleSynergyLevel = 0 | 1 | 2 | 3;
