import { AllAbilities, HoCConfig, HoCConstants } from "@heroesofcrypto/common";

export interface AbilityDisplayMetadata {
    description: string;
    isStackPowered: boolean;
    isAura: boolean;
    auraEffect?: string;
    auraRange: number;
    auraIsBuff: boolean;
    spellEntry?: string;
}

/**
 * Build sidebar metadata for a runtime-granted ability that is not present in the unit's base creature
 * configuration. Ranked snapshots only carry ability names, so stolen abilities must be reconstructed from
 * the shared ability catalogue before the unit is handed to the regular UI.
 */
export const getAbilityDisplayMetadata = (
    abilityName: string,
    stackPower = HoCConstants.MAX_UNIT_STACK_POWER,
): AbilityDisplayMetadata | undefined => {
    try {
        const ability = HoCConfig.getAbilityConfig(abilityName);
        const descriptionTemplate = ability.desc.join("\n");
        let description: string;

        if (abilityName === AllAbilities.CHAKRAM_ABILITY_NAME) {
            description = AllAbilities.chakramDescription(descriptionTemplate, stackPower);
        } else if (abilityName === "Chain Lightning") {
            const power = ability.power;
            description = descriptionTemplate
                .replace("{}", Number(power.toFixed()).toString())
                .replace("{}", Number(((power * 7) / 8).toFixed()).toString())
                .replace("{}", Number(((power * 6) / 8).toFixed()).toString())
                .replace("{}", Number(((power * 5) / 8).toFixed()).toString());
        } else if (abilityName === "Paralysis") {
            // The ability's power sets the landing chance (doubled when it rolls); the damage cut is the
            // Paralysis effect's own power. Both scale with stack power, as common's card does.
            const stackShare = stackPower / HoCConstants.MAX_UNIT_STACK_POWER;
            const effectPower = (ability.effect && HoCConfig.getEffectConfig(ability.effect)?.power) || 0;
            description = descriptionTemplate
                .replace("{}", Number(Math.min(100, ability.power * 2 * stackShare).toFixed(2)).toString())
                .replace("{}", Number((effectPower * stackShare).toFixed(2)).toString());
        } else {
            description = descriptionTemplate.replace(/\{\}/g, ability.power.toString());
        }

        const auraEffect = ability.aura_effect ?? undefined;
        const auraConfig = auraEffect ? HoCConfig.getAuraEffectConfig(auraEffect) : undefined;

        return {
            description,
            isStackPowered: ability.stack_powered,
            isAura: !!auraEffect,
            auraEffect,
            auraRange: auraConfig?.range ?? 0,
            auraIsBuff: auraConfig?.is_buff ?? true,
            spellEntry: ability.can_be_cast ? `:${ability.name}` : undefined,
        };
    } catch {
        // A newer server can briefly lead an older client catalogue during a rolling deploy. Keep the
        // snapshot usable; the unknown ability simply cannot be rendered until the client is refreshed.
        return undefined;
    }
};
