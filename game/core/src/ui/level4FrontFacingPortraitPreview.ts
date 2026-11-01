import { CreatureVals } from "@heroesofcrypto/common";

import { images } from "../generated/image_imports";

const PORTRAIT_SLUGS: Readonly<Partial<Record<number, string>>> = {
    [CreatureVals.GARGANTUAN]: "gargantuan",
    [CreatureVals.ARACHNA_QUEEN]: "arachna_queen",
    [CreatureVals.MAGIC_DRAGON]: "magic_dragon",
    [CreatureVals.THUNDERBIRD]: "thunderbird",
    [CreatureVals.BEHEMOTH]: "behemoth",
    [CreatureVals.FRENZIED_BOAR]: "frenzied_boar",
    [CreatureVals.TSAR_CANNON]: "tsar_cannon",
    [CreatureVals.ANGEL]: "angel",
    [CreatureVals.CHAMPION]: "champion",
    [CreatureVals.BLACK_DRAGON]: "black_dragon",
    [CreatureVals.HYDRA]: "hydra",
    [CreatureVals.ABOMINATION]: "abomination",
};

/** Composed L4 portraits; the shared preview resolver owns route and query gating. */
export const level4FrontFacingPortraitPreviewSource = (creatureId: number): string | undefined => {
    const slug = PORTRAIT_SLUGS[creatureId];
    return slug ? (images as Readonly<Partial<Record<string, string>>>)[`portrait_aaa_front_v1_${slug}`] : undefined;
};
