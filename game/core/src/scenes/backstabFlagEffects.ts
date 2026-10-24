import { AbilityHelper, type Unit } from "@heroesofcrypto/common";

/** Use the engine's positional rule, including rectangular footprints and board orientation. */
export function isBackstabImpact(
    attacker: Unit,
    victim: Unit,
    attackType: string,
    missed: boolean | undefined,
    amount: number,
    sideOriented: boolean,
): boolean {
    if (attackType !== "melee" || missed || amount <= 0 || !attacker.hasAbilityActive?.("Backstab")) return false;
    return AbilityHelper.getAbilitiesWithPosisionCoefficient(
        attacker.getAbilities(),
        attacker.getBaseCell(),
        victim.getBaseCell(),
        victim.isSmallSize(),
        attacker.getTeam(),
        victim.getFootprintHeight(),
        sideOriented,
        victim.getFootprintWidth(),
    ).some((ability) => ability.getName() === "Backstab");
}
