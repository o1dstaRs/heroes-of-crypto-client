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

import { v4 as uuidv4 } from "uuid";
import { GridMath, GridSettings, HoCLib, TeamType } from "@heroesofcrypto/common";

import {
    MAX_TIME_TO_MAKE_TURN_MILLIS,
    MIN_TIME_TO_MAKE_TURN_MILLIS,
    STEPS_MORALE_MULTIPLIER,
    TOTAL_TIME_TO_MAKE_TURN_MILLIS,
    UP_NEXT_UNITS_COUNT,
} from "../statics";
import { Unit } from "../units/units";
import { IFightState } from "./state";

export class FightStateManager {
    private static instance: FightStateManager;

    private readonly fightState: IFightState;

    private constructor() {
        this.fightState = {
            id: uuidv4(),
            currentLap: 1,
            firstTurnMade: false,
            fightFinished: false,
            previousTurnTeam: TeamType.NO_TEAM,
            highestSpeedThisTurn: 0,
            alreadyMadeTurn: new Set(),
            alreadyMadeTurnByTeam: new Map(),
            alreadyHourGlass: new Set(),
            alreadyRepliedAttack: new Set(),
            teamUnitsAlive: new Map(),
            hourGlassQueue: [],
            moralePlusQueue: [],
            moraleMinusQueue: [],
            currentTurnStart: 0,
            currentTurnEnd: 0,
            currentLapTotalTimePerTeam: new Map(),
            upNext: [],
            stepsMoraleMultiplier: 0,
            hasAdditionalTimeRequestedPerTeam: new Map(),
        };
    }

    public reset(): void {
        this.fightState.id = uuidv4();
        this.fightState.currentLap = 1;
        this.fightState.firstTurnMade = false;
        this.fightState.fightFinished = false;
        this.fightState.previousTurnTeam = TeamType.NO_TEAM;
        this.fightState.highestSpeedThisTurn = 0;
        this.fightState.alreadyMadeTurn.clear();
        this.fightState.alreadyMadeTurnByTeam.clear();
        this.fightState.alreadyHourGlass.clear();
        this.fightState.alreadyRepliedAttack.clear();
        this.fightState.teamUnitsAlive.clear();
        this.fightState.hourGlassQueue = [];
        this.fightState.moralePlusQueue = [];
        this.fightState.moraleMinusQueue = [];
        this.fightState.currentTurnStart = 0;
        this.fightState.currentTurnEnd = 0;
        this.fightState.currentLapTotalTimePerTeam.clear();
        this.fightState.upNext = [];
        this.fightState.stepsMoraleMultiplier = 0;
        this.fightState.hasAdditionalTimeRequestedPerTeam.clear();
    }

    public static getInstance(): FightStateManager {
        if (!FightStateManager.instance) {
            FightStateManager.instance = new FightStateManager();
        }

        return FightStateManager.instance;
    }

    public prefetchNextUnitsToTurn(allUnits: Map<string, Unit>, unitsUpper: Unit[], unitsLower: Unit[]): void {
        if (this.fightState.upNext.length >= UP_NEXT_UNITS_COUNT) {
            return;
        }

        while (this.fightState.upNext.length < UP_NEXT_UNITS_COUNT) {
            const nextUnitId = this.getNextTurnUnitId(allUnits, unitsUpper, unitsLower);
            if (nextUnitId) {
                const unit = allUnits.get(nextUnitId);
                if (unit) {
                    this.fightState.upNext.push(nextUnitId);
                    this.updatePreviousTurnTeam(unit.getTeam());
                }
            } else {
                break;
            }
        }
    }

    public setUnitsCalculatedStacksPower(gridSettings: GridSettings, allUnits: Map<string, Unit>): void {
        let maxTotalExp = Number.MIN_SAFE_INTEGER;
        for (const u of allUnits.values()) {
            if (!GridMath.isPositionWithinGrid(gridSettings, u.getPosition())) {
                continue;
            }
            const totalExp = u.getExp() * u.getAmountAlive();
            maxTotalExp = maxTotalExp < totalExp ? totalExp : maxTotalExp;
        }
        for (const u of allUnits.values()) {
            if (!GridMath.isPositionWithinGrid(gridSettings, u.getPosition())) {
                continue;
            }
            const percentage = ((u.getExp() * u.getAmountAlive()) / maxTotalExp) * 100;
            if (percentage <= 20) {
                u.setStackPower(1);
            } else if (percentage <= 40) {
                u.setStackPower(2);
            } else if (percentage <= 60) {
                u.setStackPower(3);
            } else if (percentage <= 80) {
                u.setStackPower(4);
            } else {
                u.setStackPower(5);
            }
        }
    }

    public dequeueNextUnitId(): string | undefined {
        return this.fightState.upNext.shift();
    }

    private getNextTurnUnitId(allUnits: Map<string, Unit>, unitsUpper: Unit[], unitsLower: Unit[]): string | undefined {
        if (!unitsLower.length || !unitsUpper.length) {
            return undefined;
        }

        // plus morale
        while (this.fightState.moralePlusQueue.length) {
            const nextUnitId = this.fightState.moralePlusQueue.shift();
            if (
                nextUnitId &&
                !this.fightState.alreadyMadeTurn.has(nextUnitId) &&
                !this.fightState.upNext.includes(nextUnitId)
            ) {
                return nextUnitId;
            }
        }

        let totalArmyMoraleUpper = 0;
        let totalArmyMoraleLower = 0;
        let firstBatch: Unit[];
        let secondBatch: Unit[];

        // total morale based
        if (this.fightState.previousTurnTeam == null) {
            for (const u of unitsUpper) {
                this.fightState.highestSpeedThisTurn = Math.max(this.fightState.highestSpeedThisTurn, u.getSpeed());
                totalArmyMoraleUpper += u.getMorale();
            }
            for (const u of unitsLower) {
                this.fightState.highestSpeedThisTurn = Math.max(this.fightState.highestSpeedThisTurn, u.getSpeed());
                totalArmyMoraleLower += u.getMorale();
            }

            const avgArmyMoraleUpper = unitsUpper.length ? totalArmyMoraleUpper / unitsUpper.length : 0;
            const avgArmyMoraleLower = unitsLower.length ? totalArmyMoraleLower / unitsUpper.length : 0;

            if (avgArmyMoraleUpper > avgArmyMoraleLower) {
                firstBatch = unitsUpper;
                secondBatch = unitsLower;
            } else if (avgArmyMoraleUpper < avgArmyMoraleLower) {
                firstBatch = unitsLower;
                secondBatch = unitsUpper;
            } else {
                let lowerMaxSpeed = Number.MIN_SAFE_INTEGER;
                for (const u of unitsLower) {
                    lowerMaxSpeed = u.getSpeed() > lowerMaxSpeed ? u.getSpeed() : lowerMaxSpeed;
                }
                let upperMaxSpeed = Number.MIN_SAFE_INTEGER;
                for (const u of unitsUpper) {
                    upperMaxSpeed = u.getSpeed() > upperMaxSpeed ? u.getSpeed() : upperMaxSpeed;
                }
                if (lowerMaxSpeed > upperMaxSpeed) {
                    firstBatch = unitsLower;
                    secondBatch = unitsUpper;
                } else if (lowerMaxSpeed < upperMaxSpeed) {
                    firstBatch = unitsUpper;
                    secondBatch = unitsLower;
                } else {
                    const rnd = Math.floor(Math.random() * 2);
                    if (rnd) {
                        firstBatch = unitsUpper;
                        secondBatch = unitsLower;
                    } else {
                        firstBatch = unitsLower;
                        secondBatch = unitsUpper;
                    }
                }
            }
        } else if (this.fightState.previousTurnTeam === TeamType.LOWER) {
            firstBatch = unitsUpper;
            secondBatch = unitsLower;
        } else {
            firstBatch = unitsLower;
            secondBatch = unitsUpper;
        }

        for (const u of firstBatch) {
            const unitId = u.getId();
            if (
                !this.fightState.alreadyMadeTurn.has(unitId) &&
                !this.fightState.upNext.includes(unitId) &&
                !this.fightState.hourGlassQueue.includes(unitId) &&
                !this.fightState.moraleMinusQueue.includes(unitId)
            ) {
                return unitId;
            }
        }
        for (const u of secondBatch) {
            const unitId = u.getId();
            if (
                !this.fightState.alreadyMadeTurn.has(unitId) &&
                !this.fightState.upNext.includes(unitId) &&
                !this.fightState.hourGlassQueue.includes(unitId) &&
                !this.fightState.moraleMinusQueue.includes(unitId)
            ) {
                return unitId;
            }
        }

        // minus morale
        while (this.fightState.moraleMinusQueue.length) {
            const nextUnitId = this.fightState.moraleMinusQueue.shift();
            if (
                nextUnitId &&
                !this.fightState.alreadyMadeTurn.has(nextUnitId) &&
                !this.fightState.upNext.includes(nextUnitId)
            ) {
                return nextUnitId;
            }
        }

        // hourglass
        if (
            this.fightState.hourGlassQueue.length &&
            this.fightState.alreadyMadeTurn.size +
                this.fightState.hourGlassQueue.length +
                this.fightState.upNext.length >=
                allUnits.size
        ) {
            while (this.fightState.hourGlassQueue.length) {
                const nextUnitId = this.fightState.hourGlassQueue.shift();
                if (
                    nextUnitId &&
                    !this.fightState.alreadyMadeTurn.has(nextUnitId) &&
                    !this.fightState.upNext.includes(nextUnitId)
                ) {
                    return nextUnitId;
                }
            }
        }

        return undefined;
    }

    public getFightState(): IFightState {
        return this.fightState;
    }

    public finishFight(): void {
        this.fightState.fightFinished = true;
    }

    public startTurn(team: number): void {
        let currentTotalTimePerTeam = this.fightState.currentLapTotalTimePerTeam.get(team);
        if (currentTotalTimePerTeam === undefined) {
            currentTotalTimePerTeam = 0;
        }

        let alreadyMadeTurnTeamMembers = 0;
        const alreadyMadeTurnTeamMembersSet = this.fightState.alreadyMadeTurnByTeam.get(team);
        if (alreadyMadeTurnTeamMembersSet) {
            alreadyMadeTurnTeamMembers = alreadyMadeTurnTeamMembersSet.size;
        }
        const teamMembersAlive =
            team === TeamType.LOWER
                ? this.fightState.teamUnitsAlive.get(TeamType.LOWER) ?? 0
                : this.fightState.teamUnitsAlive.get(TeamType.UPPER) ?? 0;
        let teamMembersToMakeTurn = teamMembersAlive - alreadyMadeTurnTeamMembers - 1;
        if (teamMembersToMakeTurn < 0) {
            teamMembersToMakeTurn = 0;
        }

        const allocatedForOtherUnits = MIN_TIME_TO_MAKE_TURN_MILLIS * teamMembersToMakeTurn;
        const timeRemaining = TOTAL_TIME_TO_MAKE_TURN_MILLIS - currentTotalTimePerTeam - allocatedForOtherUnits;

        let maxTimeToMakeTurn = MAX_TIME_TO_MAKE_TURN_MILLIS;
        if (teamMembersAlive > 0 && teamMembersAlive - alreadyMadeTurnTeamMembers > 0) {
            maxTimeToMakeTurn = Math.min(
                maxTimeToMakeTurn,
                Math.ceil(
                    (TOTAL_TIME_TO_MAKE_TURN_MILLIS - currentTotalTimePerTeam) /
                        (teamMembersAlive - alreadyMadeTurnTeamMembers),
                ),
            );
        }

        this.fightState.currentTurnStart = HoCLib.getTimeMillis();
        this.fightState.currentTurnEnd = this.fightState.currentTurnStart + Math.min(timeRemaining, maxTimeToMakeTurn);
        console.log(
            `timeRemaining:${timeRemaining} currentTotalTimePerTeam:${currentTotalTimePerTeam} maxTimeToMakeTurn:${maxTimeToMakeTurn} alreadyMadeTurnTeamMembers:${alreadyMadeTurnTeamMembers}`,
        );
    }

    public requestAdditionalTurnTime(team?: number, justCheck = false): number {
        if (!team) {
            return 0;
        }

        const hasAdditionaTimeRequested = this.fightState.hasAdditionalTimeRequestedPerTeam.get(team);
        if (hasAdditionaTimeRequested) {
            return 0;
        }

        let currentTotalTimePerTeam = this.fightState.currentLapTotalTimePerTeam.get(team);
        if (currentTotalTimePerTeam === undefined) {
            currentTotalTimePerTeam = 0;
        }

        let alreadyMadeTurnTeamMembers = 0;
        const alreadyMadeTurnTeamMembersSet = this.fightState.alreadyMadeTurnByTeam.get(team);
        if (alreadyMadeTurnTeamMembersSet) {
            alreadyMadeTurnTeamMembers = alreadyMadeTurnTeamMembersSet.size;
        }
        const teamMembersAlive =
            team === TeamType.LOWER
                ? this.fightState.teamUnitsAlive.get(TeamType.LOWER) ?? 0
                : this.fightState.teamUnitsAlive.get(TeamType.UPPER) ?? 0;

        let teamMembersToMakeTurn = teamMembersAlive - alreadyMadeTurnTeamMembers;
        if (teamMembersToMakeTurn < 0) {
            teamMembersToMakeTurn = 0;
        }
        const allocatedForOtherUnits = MIN_TIME_TO_MAKE_TURN_MILLIS * (teamMembersToMakeTurn - 1);
        const timeRemaining = TOTAL_TIME_TO_MAKE_TURN_MILLIS - currentTotalTimePerTeam - allocatedForOtherUnits;
        if (timeRemaining > 0 && teamMembersAlive - alreadyMadeTurnTeamMembers > 0) {
            const additionalTime = Math.min(
                MAX_TIME_TO_MAKE_TURN_MILLIS,
                Math.ceil(
                    (TOTAL_TIME_TO_MAKE_TURN_MILLIS - currentTotalTimePerTeam) /
                        (teamMembersAlive - alreadyMadeTurnTeamMembers),
                ),
            );
            if (!justCheck) {
                this.fightState.currentTurnEnd += additionalTime;
                this.fightState.hasAdditionalTimeRequestedPerTeam.set(team, true);
            }

            return additionalTime;
        }

        return 0;
    }

    public markFirstTurn(): void {
        this.fightState.firstTurnMade = true;
    }

    public flipLap(): void {
        this.fightState.alreadyMadeTurn.clear();
        this.fightState.alreadyMadeTurnByTeam.clear();
        this.fightState.alreadyHourGlass.clear();
        this.fightState.alreadyRepliedAttack.clear();
        this.fightState.currentLap++;
        this.fightState.hourGlassQueue.length = 0;
        this.fightState.moraleMinusQueue.length = 0;
        this.fightState.moralePlusQueue.length = 0;
        this.fightState.currentLapTotalTimePerTeam.clear();
        this.fightState.hasAdditionalTimeRequestedPerTeam.clear();
    }

    public isForestLap(numberOfLapsTillsForest: number): boolean {
        return (
            this.fightState.currentLap > numberOfLapsTillsForest &&
            this.fightState.currentLap % numberOfLapsTillsForest === 1
        );
    }

    public setTeamUnitsAlive(teamType: TeamType, unitsAlive: number): void {
        if (teamType) {
            this.fightState.teamUnitsAlive.set(teamType, unitsAlive);
        }
    }

    public addRepliedAttack(unitId: string): void {
        this.fightState.alreadyRepliedAttack.add(unitId);
    }

    public addAlreadyMadeTurn(team: number, unitId: string): void {
        let unitIdsSet = this.fightState.alreadyMadeTurnByTeam.get(team);
        if (!unitIdsSet) {
            unitIdsSet = new Set();
        }
        unitIdsSet.add(unitId);

        this.fightState.alreadyMadeTurn.add(unitId);
        this.fightState.alreadyMadeTurnByTeam.set(team, unitIdsSet);
        let currentTotalTimePerTeam = this.fightState.currentLapTotalTimePerTeam.get(team);
        if (currentTotalTimePerTeam === undefined) {
            currentTotalTimePerTeam = 0;
        }
        currentTotalTimePerTeam += Math.floor(HoCLib.getTimeMillis() - this.fightState.currentTurnStart);
        this.fightState.currentLapTotalTimePerTeam.set(team, currentTotalTimePerTeam);
    }

    public enqueueHourGlass(unitId: string) {
        this.fightState.alreadyHourGlass.add(unitId);
        this.fightState.hourGlassQueue.push(unitId);
    }

    public enqueueMoraleMinus(unitId: string) {
        this.fightState.moraleMinusQueue.push(unitId);
    }

    public enqueueMoralePlus(unitId: string) {
        this.fightState.moralePlusQueue.push(unitId);
    }

    public removeFromUpNext(unitId: string): boolean {
        return HoCLib.removeItemOnce(this.fightState.upNext, unitId);
    }

    public removeFromHourGlassQueue(unitId: string): void {
        HoCLib.removeItemOnce(this.fightState.hourGlassQueue, unitId);
    }

    public removeFromMoraleMinusQueue(unitId: string): void {
        HoCLib.removeItemOnce(this.fightState.moraleMinusQueue, unitId);
    }

    public removeFromMoralePlusQueue(unitId: string): void {
        HoCLib.removeItemOnce(this.fightState.moralePlusQueue, unitId);
    }

    public increaseStepsMoraleMultiplier(): void {
        this.fightState.stepsMoraleMultiplier += STEPS_MORALE_MULTIPLIER;
    }

    public getStepsMoraleMultiplier(): number {
        return this.fightState.stepsMoraleMultiplier;
    }

    private updatePreviousTurnTeam(team: TeamType): void {
        this.fightState.previousTurnTeam = team;
    }
}
