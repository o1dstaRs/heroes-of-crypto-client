import { CREATURES_JSON } from "@heroesofcrypto/common";

import { draftAttackIconKind, type DraftAttackIconKind } from "./PickAndBan/attackTypeIcon";
import { UNIT_NAME_TO_ID } from "./unit_ui_constants";

export type CreatureMovementIconKind = "WALK" | "FLY";

export interface CreatureTypePresentation {
    attack: DraftAttackIconKind;
    movement: CreatureMovementIconKind;
}

interface CreatureTypeConfig {
    attack_type?: string;
    movement_type?: string;
}

const creatureTypeConfigByName: ReadonlyMap<string, CreatureTypeConfig> = (() => {
    const configs = new Map<string, CreatureTypeConfig>();
    for (const roster of Object.values(CREATURES_JSON as Record<string, unknown>)) {
        if (!roster || typeof roster !== "object") continue;
        for (const [name, config] of Object.entries(roster as Record<string, CreatureTypeConfig>)) {
            configs.set(name, config);
        }
    }
    return configs;
})();

/** Match the attack and movement pictograms used by creature cards in the draft. */
export const creatureTypePresentation = (unitName?: string | null): CreatureTypePresentation | null => {
    const normalizedName = unitName?.trim();
    if (!normalizedName) return null;

    const creatureId = UNIT_NAME_TO_ID[normalizedName];
    const config = creatureTypeConfigByName.get(normalizedName);
    if (creatureId === undefined || !config?.attack_type) return null;
    if (config.movement_type !== "WALK" && config.movement_type !== "FLY") return null;

    return {
        attack: draftAttackIconKind(creatureId, config.attack_type),
        movement: config.movement_type,
    };
};
