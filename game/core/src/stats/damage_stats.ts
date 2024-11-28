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

import { IStatisticHolder, IDamageStatistic } from "@heroesofcrypto/common";

export class DamageStatisticHolder implements IStatisticHolder<IDamageStatistic> {
    private readonly damageStatistics: IDamageStatistic[];

    private readonly damageDealtLaps: Set<number>;

    public constructor() {
        this.damageStatistics = [];
        this.damageDealtLaps = new Set();
    }

    public add(singleDamageStatistic: IDamageStatistic): void {
        let added = false;

        for (const ds of this.damageStatistics) {
            if (ds.unitName === singleDamageStatistic.unitName && ds.team === singleDamageStatistic.team) {
                ds.damage += singleDamageStatistic.damage;
                added = true;
                break;
            }
        }

        if (!added) {
            this.damageStatistics.push(singleDamageStatistic);
        }

        if (singleDamageStatistic.damage > 0) {
            this.damageDealtLaps.add(singleDamageStatistic.lap);
        }
    }

    public get(): IDamageStatistic[] {
        this.damageStatistics.sort((a, b) => b.damage - a.damage);

        return this.damageStatistics;
    }

    public hasDamageDealt(lap: number): boolean {
        return this.damageDealtLaps.has(lap);
    }
}
