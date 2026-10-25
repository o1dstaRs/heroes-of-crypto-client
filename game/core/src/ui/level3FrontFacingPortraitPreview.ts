import { CreatureVals } from "@heroesofcrypto/common";

import { images } from "../generated/image_imports";

const PORTRAIT_SLUGS: Readonly<Partial<Record<number, string>>> = {
    [CreatureVals.MANTIS]: "mantis",
    [CreatureVals.UNICORN]: "unicorn",
    [CreatureVals.PEGASUS]: "pegasus",
    [CreatureVals.CYCLOPS]: "cyclops",
    [CreatureVals.OGRE_MAGE]: "ogre_mage",
    [CreatureVals.ZENA]: "zena",
    [CreatureVals.GRIFFIN]: "griffin",
    [CreatureVals.CRUSADER]: "crusader",
    [CreatureVals.MONK]: "monk",
    [CreatureVals.GOBLIN_KNIGHT]: "goblin_knight",
    [CreatureVals.EFREET]: "efreet",
    [CreatureVals.NIGHTMARE]: "nightmare",
};

/** Precomposed L3 art; the shared preview resolver owns route and opt-in checks. */
export const level3FrontFacingPortraitPreviewSource = (creatureId: number): string | undefined => {
    const slug = PORTRAIT_SLUGS[creatureId];
    return slug ? (images as Readonly<Partial<Record<string, string>>>)[`portrait_aaa_front_v1_${slug}`] : undefined;
};
