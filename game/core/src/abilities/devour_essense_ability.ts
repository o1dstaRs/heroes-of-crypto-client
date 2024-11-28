import { ISceneLog, Unit, UnitsHolder } from "@heroesofcrypto/common";
import { FightStateManager } from "@heroesofcrypto/common/dist/fights/fight_state_manager";

export function processDevourEssenceAbility(
    fromUnit: Unit,
    unitIdsDied: string[],
    unitsHolder: UnitsHolder,
    sceneLog: ISceneLog,
): void {
    if (fromUnit.isDead()) {
        return;
    }

    const devourEssenceAbility = fromUnit.getAbility("Devour Essence");
    if (!devourEssenceAbility?.getPower()) {
        return;
    }

    const alreadyProcessed: string[] = [];
    let killedAnEnemy = false;
    for (const uId of unitIdsDied) {
        if (alreadyProcessed.includes(uId)) {
            continue;
        }

        const unit = unitsHolder.getAllUnits().get(uId);
        if (unit && fromUnit.getOppositeTeam() === unit.getTeam()) {
            killedAnEnemy = true;
            break;
        }
        alreadyProcessed.push(uId);
    }

    if (killedAnEnemy && devourEssenceAbility) {
        const devourEssenceAbilityPower = Number(
            fromUnit
                .calculateAbilityApplyChance(
                    devourEssenceAbility,
                    FightStateManager.getInstance()
                        .getFightProperties()
                        .getAdditionalAbilityPowerPerTeam(fromUnit.getTeam()),
                )
                .toFixed(2),
        );
        if (devourEssenceAbilityPower > 0) {
            const devourEssenceMultiplier = Math.min(1, devourEssenceAbilityPower / 100);
            const canRejuvinateUpTo = Math.ceil(fromUnit.getMaxHp() * devourEssenceMultiplier);
            if (canRejuvinateUpTo > fromUnit.getHp()) {
                const rejuvinateBy = canRejuvinateUpTo - fromUnit.getHp();
                fromUnit.applyHeal(rejuvinateBy);
                sceneLog.updateLog(`${fromUnit.getName()} rejuvinated for ${rejuvinateBy} hp`);
            }
        }
    }
}
