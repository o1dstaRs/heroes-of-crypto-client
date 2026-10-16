import { Augment } from "@heroesofcrypto/common";

import { t, tf } from "../../i18n/i18n";
import { AUGMENT_DESCRIPTIONS } from "../RightSideBar/augmentLabels";
import type { MatchAugmentKind } from "./matchHistoryModel";

/**
 * What a recorded augment choice actually did, with that level's real numbers — read off the same power
 * tables the engine applies, so the card never quotes a figure the fight did not use. A level the tables
 * do not know (an older client reading a newer record) falls back to the augment's generic line.
 */
export const augmentEffectSummary = (kind: MatchAugmentKind, level: number): string => {
    try {
        switch (kind) {
            case "Armor": {
                const value = Augment.getArmorPower(level as Augment.ArmorAugment);
                return tf("+{value}% armor and +{value} magic armor for every unit", { value });
            }
            case "Might":
                return tf("+{value}% melee damage for every unit", {
                    value: Augment.getMightPower(level as Augment.MightAugment),
                });
            case "Empower":
                return tf("+{value}% magic damage from spells, abilities and effects", {
                    value: Augment.getEmpowerPower(level as Augment.EmpowerAugment),
                });
            case "Sniper": {
                const [damage, range] = Augment.getSniperPower(level as Augment.SniperAugment);
                return tf("+{damage}% ranged damage and +{range}% shooting range", { damage, range });
            }
            case "Movement":
                return tf("+{count} movement steps for every unit", {
                    count: Augment.getMovementPower(level as Augment.MovementAugment),
                });
            case "Placement":
                // The zone's exact rows depend on the map shape the record does not carry; the tiers are
                // still worth telling apart.
                if (level <= 1) {
                    return t("Standard deployment zone");
                }
                return level === 2 ? t("Wider deployment zone") : t("Widest deployment zone, up to the board's edge");
            default:
                break;
        }
    } catch {
        // Fall through to the generic description.
    }
    return t(AUGMENT_DESCRIPTIONS[kind] ?? "");
};
