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

import {
    AttackType,
    HoCLib,
    HoCConfig,
    ToFactionType,
    AllFactionsType,
    Grid,
    Spell,
    SpellPowerType,
    ISceneLog,
    Unit,
    SpellHelper,
    UnitsHolder,
    EffectHelper,
    FightStateManager,
} from "@heroesofcrypto/common";

const POSSIBLE_DEBUFFS_TO_FACTIONS = {
    Sadness: "Death",
    Quagmire: "Death",
    "Weakening Beam": "Death",
    Weakness: "Death",
    Rangebane: "Order",
    Cowardice: "Order",
};

export function processSpitBallAbility(
    fromUnit: Unit,
    targetUnit: Unit,
    currentActiveUnit: Unit,
    unitsHolder: UnitsHolder,
    grid: Grid,
    sceneLog: ISceneLog,
): void {
    // effect can be absorbed
    const absorptionTarget = EffectHelper.getAbsorptionTarget(targetUnit, grid, unitsHolder);
    if (absorptionTarget) {
        targetUnit = absorptionTarget;
    }

    if (targetUnit.isDead()) {
        return;
    }

    const debuffsNames = Object.keys(POSSIBLE_DEBUFFS_TO_FACTIONS);
    const debuffs = new Set(debuffsNames);
    if (targetUnit.getAttackType() !== AttackType.RANGE) {
        debuffs.delete("Rangebane");
    }

    for (const db of debuffsNames) {
        if (debuffs.has(db) && targetUnit.hasDebuffActive(db)) {
            debuffs.delete(db);
        }
    }

    if (!debuffs.size) {
        return;
    }

    for (const debuffName of debuffs) {
        const spilBallAbility = fromUnit.getAbility("Spit Ball");
        if (
            !spilBallAbility ||
            HoCLib.getRandomInt(0, 100) >=
                fromUnit.calculateAbilityApplyChance(
                    spilBallAbility,
                    FightStateManager.getInstance()
                        .getFightProperties()
                        .getAdditionalAbilityPowerPerTeam(fromUnit.getTeam()),
                )
        ) {
            continue;
        }

        let applied = true;
        const faction =
            ToFactionType[
                POSSIBLE_DEBUFFS_TO_FACTIONS[debuffName as keyof typeof POSSIBLE_DEBUFFS_TO_FACTIONS] as AllFactionsType
            ];

        if (faction === undefined) {
            continue;
        }

        const debuff = new Spell({ spellProperties: HoCConfig.getSpellConfig(faction, debuffName), amount: 1 });

        if (
            HoCLib.getRandomInt(0, 100) < Math.floor(targetUnit.getMagicResist()) ||
            (debuff.getPowerType() === SpellPowerType.MIND && targetUnit.hasMindAttackResistance())
        ) {
            applied = false;
        }

        if (applied) {
            let laps = debuff.getLapsTotal();

            targetUnit.applyDebuff(debuff, undefined, undefined, targetUnit.getId() === currentActiveUnit.getId());
            sceneLog.updateLog(
                `${fromUnit.getName()} applied ${debuffName} on ${targetUnit.getName()} for ${HoCLib.getLapString(
                    laps,
                )}`,
            );

            // we already know it has not been applied already
            if (
                SpellHelper.isMirrored(targetUnit) &&
                !(debuff.getPowerType() === SpellPowerType.MIND && fromUnit.hasMindAttackResistance())
            ) {
                fromUnit.applyDebuff(debuff, undefined, undefined, fromUnit.getId() === currentActiveUnit.getId());
                sceneLog.updateLog(
                    `${targetUnit.getName()} mirrored ${debuffName} to ${fromUnit.getName()} for ${HoCLib.getLapString(
                        laps,
                    )}`,
                );
            }
        } else {
            sceneLog.updateLog(`${targetUnit.getName()} resisted from ${debuffName}`);
        }
    }
}
