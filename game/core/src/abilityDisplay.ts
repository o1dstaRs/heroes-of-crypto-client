import { HoCConfig } from "@heroesofcrypto/common";

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
export const getAbilityDisplayMetadata = (abilityName: string): AbilityDisplayMetadata | undefined => {
    try {
        const ability = HoCConfig.getAbilityConfig(abilityName);
        const descriptionTemplate = ability.desc.join("\n");
        let description: string;

        if (abilityName === "Chain Lightning") {
            const power = ability.power;
            description = descriptionTemplate
                .replace("{}", Number(power.toFixed()).toString())
                .replace("{}", Number(((power * 7) / 8).toFixed()).toString())
                .replace("{}", Number(((power * 6) / 8).toFixed()).toString())
                .replace("{}", Number(((power * 5) / 8).toFixed()).toString());
        } else if (abilityName === "Paralysis") {
            const power = ability.power;
            description = descriptionTemplate
                .replace("{}", Number((power * 2).toFixed()).toString())
                .replace("{}", Number(power.toFixed()).toString());
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
