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

export interface IDamageStatistic {
    unitName: string;
    damage: number;
    team: TeamType;
}

export class DamageStatisticHolder {
    private static instance: DamageStatisticHolder;

    private readonly damageStatistics: IDamageStatistic[];

    private constructor() {
        this.damageStatistics = [];
    }

    public static getInstance(): DamageStatisticHolder {
        if (!DamageStatisticHolder.instance) {
            DamageStatisticHolder.instance = new DamageStatisticHolder();
        }

        return DamageStatisticHolder.instance;
    }

    public add(singleDamageStatistic: IDamageStatistic) {
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
    }

    public get(): IDamageStatistic[] {
        this.damageStatistics.sort((a: IDamageStatistic, b: IDamageStatistic) => {
            if (a.damage > b.damage) {
                return -1;
            }
            if (b.damage > a.damage) {
                return 1;
            }
            return 0;
        });
        return this.damageStatistics;
    }
}
