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

import { Grid, HoCLib, Unit } from "@heroesofcrypto/common";

import { UnitsHolder } from "../units/units_holder";

export const getAbsorptionTarget = (forUnit: Unit, grid: Grid, unitsHolder: UnitsHolder): Unit | undefined => {
    const absorbPenaltiesAura = forUnit.getBuff("Absorb Penalties Aura");
    if (absorbPenaltiesAura) {
        const x = absorbPenaltiesAura.getFirstSpellProperty();
        const y = absorbPenaltiesAura.getSecondSpellProperty();
        if (x !== undefined && y !== undefined) {
            const auraSourceUnitId = grid.getOccupantUnitId({ x: x, y: y });
            if (auraSourceUnitId) {
                const auraSourceUnit = unitsHolder.getAllUnits().get(auraSourceUnitId);
                if (auraSourceUnit) {
                    if (
                        HoCLib.getRandomInt(0, 100) < Math.floor(absorbPenaltiesAura.getPower()) &&
                        !auraSourceUnit.isDead()
                    ) {
                        return auraSourceUnit;
                    }
                }
            }
        }
    }

    return undefined;
};
