import { CreatureVals } from "@heroesofcrypto/common";
import type React from "react";

import { images } from "../imageAssets";
import { fullBodyCreatureImage } from "./unit_ui_constants";

export interface LeftSidebarPortraitArt {
    source?: string;
    fit?: React.CSSProperties["objectFit"];
    baseScale?: number;
    /** Negative values mirror only the creature artwork on the left battle card. */
    artScaleX?: number;
}

/** User-approved artwork sources that belong to left-screen portrait checkpoint X. */
export const LEFT_SIDEBAR_PORTRAIT_ART_CHECKPOINT_X: Readonly<Partial<Record<number, string>>> = Object.freeze({
    [CreatureVals.TROGLODYTE]: images.left_sidebar_troglodyte_hd,
    [CreatureVals.CENTAUR]: images.left_sidebar_centaur_hd,
    [CreatureVals.BERSERKER]: images.left_sidebar_berserker_hd,
    [CreatureVals.WOLF_RIDER]: images.left_sidebar_wolf_rider_hd,
    [CreatureVals.FAIRY]: images.left_sidebar_fairy_hd,
    [CreatureVals.PEASANT]: images.left_sidebar_peasant_hd,
    [CreatureVals.SQUIRE]: images.left_sidebar_squire_hd,
    [CreatureVals.PIKEMAN]: images.left_sidebar_pikeman_hd,
    [CreatureVals.HEALER]: images.left_sidebar_healer_hd,
    [CreatureVals.BATTLE_MAGE]: images.left_sidebar_battle_mage_hd,
    [CreatureVals.ELF]: images.left_sidebar_elf_hd,
    [CreatureVals.NOMAD]: images.left_sidebar_nomad_hd,
    [CreatureVals.ARBALESTER]: images.left_sidebar_arbalester_hd,
    [CreatureVals.VALKYRIE]: images.left_sidebar_valkyrie_hd,
    [CreatureVals.MERMAID]: images.left_sidebar_mermaid_hd,
    [CreatureVals.DRYAD]: images.left_sidebar_dryad_hd,
    [CreatureVals.BLACKSMITH]: images.left_sidebar_blacksmith_hd,
    [CreatureVals.WANDERING_MAGE]: images.left_sidebar_wandering_mage_hd,
    [CreatureVals.BEHOLDER]: images.left_sidebar_beholder_full,
    [CreatureVals.LEPRECHAUN]: images.left_sidebar_leprechaun,
    [CreatureVals.WHITE_TIGER]: images.left_sidebar_white_tiger,
    [CreatureVals.TSAR_CANNON]: images.left_sidebar_tsar_cannon,
    [CreatureVals.WYVERN]: images.left_sidebar_wyvern,
    [CreatureVals.ABOMINATION]: images.left_sidebar_abomination,
    [CreatureVals.ARACHNA_QUEEN]: images.left_sidebar_arachna_queen,
    [CreatureVals.BEHEMOTH]: images.left_sidebar_behemoth,
});

/** These legacy sidebar crops end inside the creature. Only the left card uses their complete source. */
const UNCROPPED_LEFT_SIDEBAR_ART_IDS = new Set<number>([CreatureVals.WYVERN, CreatureVals.TSAR_CANNON]);

const UNCROPPED_LEFT_SIDEBAR_BASE_SCALE = 1.3;

/**
 * Left-card-only art substitutions. Draft cards, roster cards, battlefield figures and every other portrait
 * surface keep the shared approved assets and framing.
 */
export const resolveLeftSidebarPortraitArt = (creatureId: number): LeftSidebarPortraitArt => {
    const correctedSource = LEFT_SIDEBAR_PORTRAIT_ART_CHECKPOINT_X[creatureId];
    const artScaleX = creatureId === CreatureVals.VALKYRIE ? -1 : undefined;
    if (creatureId === CreatureVals.BEHOLDER) {
        return {
            source: correctedSource,
            fit: "contain",
            baseScale: 0.9,
            artScaleX,
        };
    }
    if (UNCROPPED_LEFT_SIDEBAR_ART_IDS.has(creatureId)) {
        return {
            source: correctedSource ?? fullBodyCreatureImage(creatureId),
            fit: "contain",
            baseScale: UNCROPPED_LEFT_SIDEBAR_BASE_SCALE,
            artScaleX,
        };
    }
    return correctedSource || artScaleX !== undefined ? { source: correctedSource, artScaleX } : {};
};
