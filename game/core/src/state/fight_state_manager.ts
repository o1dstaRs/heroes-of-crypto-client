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

import { GridMath, GridSettings, TeamType, FightProperties, HoCConstants } from "@heroesofcrypto/common";

import { Unit } from "../units/units";

export class FightStateManager {
    private static instance: FightStateManager;

    private fightProperties: FightProperties;

    private constructor() {
        this.fightProperties = new FightProperties();
    }

    public reset(): void {
        this.fightProperties = new FightProperties();
    }

    public static getInstance(): FightStateManager {
        if (!FightStateManager.instance) {
            FightStateManager.instance = new FightStateManager();
        }

        return FightStateManager.instance;
    }

    public getFightProperties(): FightProperties {
        return this.fightProperties;
    }

    // TODO: move all that into FightProperties. That requires Unit to be ported into Common code
    public prefetchNextUnitsToTurn(
        allUnits: Map<string, Unit>,
        unitsUpper: Unit[],
        unitsLower: Unit[],
        upNextUnitsCount = HoCConstants.UP_NEXT_UNITS_COUNT,
    ): void {
        if (upNextUnitsCount < 1) {
            upNextUnitsCount = 1;
        }
        upNextUnitsCount = Math.floor(upNextUnitsCount);

        if (this.fightProperties.getUpNextQueueSize() >= upNextUnitsCount) {
            return;
        }

        while (this.fightProperties.getUpNextQueueSize() < upNextUnitsCount) {
            const nextUnitId = this.getNextTurnUnitId(allUnits, unitsUpper, unitsLower);

            if (nextUnitId) {
                const unit = allUnits.get(nextUnitId);

                if (
                    unit &&
                    !this.fightProperties.upNextIncludes(nextUnitId) &&
                    !this.fightProperties.hasAlreadyMadeTurn(nextUnitId)
                ) {
                    this.fightProperties.enqueueUpNext(nextUnitId);
                    this.fightProperties.updatePreviousTurnTeam(unit.getTeam());
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

    private getNextTurnUnitId(allUnits: Map<string, Unit>, unitsUpper: Unit[], unitsLower: Unit[]): string | undefined {
        if (!unitsLower.length || !unitsUpper.length) {
            return undefined;
        }

        // plus morale
        while (this.fightProperties.getMoralePlusQueueSize()) {
            const nextUnitId = this.fightProperties.dequeueMoralePlus();
            if (
                nextUnitId &&
                !this.fightProperties.hasAlreadyMadeTurn(nextUnitId) &&
                !this.fightProperties.upNextIncludes(nextUnitId)
            ) {
                return nextUnitId;
            }
        }

        let totalArmyMoraleUpper = 0;
        let totalArmyMoraleLower = 0;
        let firstBatch: Unit[];
        let secondBatch: Unit[];

        // total morale based
        if (this.fightProperties.getPreviousTurnTeam() == TeamType.NO_TEAM) {
            for (const u of unitsUpper) {
                this.fightProperties.setHighestSpeedThisTurn(
                    Math.max(this.fightProperties.getHighestSpeedThisTurn(), u.getSpeed()),
                );
                totalArmyMoraleUpper += u.getMorale();
            }
            for (const u of unitsLower) {
                this.fightProperties.setHighestSpeedThisTurn(
                    Math.max(this.fightProperties.getHighestSpeedThisTurn(), u.getSpeed()),
                );
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
        } else if (this.fightProperties.getPreviousTurnTeam() === TeamType.LOWER) {
            firstBatch = unitsUpper;
            secondBatch = unitsLower;
        } else {
            firstBatch = unitsLower;
            secondBatch = unitsUpper;
        }

        for (const u of firstBatch) {
            const unitId = u.getId();
            if (
                !this.fightProperties.hasAlreadyMadeTurn(unitId) &&
                !this.fightProperties.upNextIncludes(unitId) &&
                !this.fightProperties.hourGlassIncludes(unitId) &&
                !this.fightProperties.moraleMinusIncludes(unitId)
            ) {
                return unitId;
            }
        }
        for (const u of secondBatch) {
            const unitId = u.getId();
            if (
                !this.fightProperties.hasAlreadyMadeTurn(unitId) &&
                !this.fightProperties.upNextIncludes(unitId) &&
                !this.fightProperties.hourGlassIncludes(unitId) &&
                !this.fightProperties.moraleMinusIncludes(unitId)
            ) {
                return unitId;
            }
        }

        // minus morale
        while (this.fightProperties.getMoraleMinusQueueSize()) {
            const nextUnitId = this.fightProperties.dequeueMoraleMinus();
            if (
                nextUnitId &&
                !this.fightProperties.hasAlreadyMadeTurn(nextUnitId) &&
                !this.fightProperties.upNextIncludes(nextUnitId)
            ) {
                return nextUnitId;
            }
        }

        // hourglass
        if (
            this.fightProperties.getHourGlassQueueSize() &&
            this.fightProperties.getAlreadyMadeTurnSize() +
                this.fightProperties.getHourGlassQueueSize() +
                this.fightProperties.getUpNextQueueSize() >=
                allUnits.size
        ) {
            while (this.fightProperties.getHourGlassQueueSize()) {
                const nextUnitId = this.fightProperties.dequeueHourGlassQueue();
                if (
                    nextUnitId &&
                    !this.fightProperties.hasAlreadyMadeTurn(nextUnitId) &&
                    !this.fightProperties.upNextIncludes(nextUnitId)
                ) {
                    return nextUnitId;
                }
            }
        }

        return undefined;
    }
}
