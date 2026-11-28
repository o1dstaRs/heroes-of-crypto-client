import { AllAbilities, AbilityType, type Unit } from "@heroesofcrypto/common";

import { petrifyingGazeForecast, type PetrifyingGazePreview } from "./petrifyingGazeForecast";

export { petrifyingGazePreviewText } from "./petrifyingGazeForecast";

/** Additional kills from the next landed hit, separate from the ordinary attack's damage and losses. */
export function petrifyingGazePreview(
    attacker: Unit,
    target: Unit,
    damage: { min: number; max: number },
    abilityPower: number,
    rangeDivisor = 1,
    damageTaken: (impact: number) => number = (impact) => impact,
): PetrifyingGazePreview | undefined {
    const ability = attacker.getAbility("Petrifying Gaze");
    if (!ability || target.isDead() || damage.max <= 0 || target.willAbsorbIncomingHit(attacker)) return undefined;

    const isMind = ability.getType() === AbilityType.MIND;
    const percentageMax = Math.floor(attacker.calculateAbilityApplyChance(ability, abilityPower));
    const procChance = AllAbilities.calculatePetrifyingGazeKillChance(
        percentageMax,
        target.getLevel(),
        isMind ? target.getMindResist() : 0,
        rangeDivisor,
    );
    return petrifyingGazeForecast(
        {
            ...damage,
            percentageMax,
            procChance,
            hp: target.getMaxHp(),
            totalHp: target.getCumulativeHp(),
            immune: isMind && target.hasMindAttackResistance(),
        },
        damageTaken,
    );
}
