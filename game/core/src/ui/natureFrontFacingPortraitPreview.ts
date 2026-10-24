import { CreatureVals } from "@heroesofcrypto/common";

import { images } from "../generated/image_imports";

/** Foreground-only versions of the approved frontal art, with its original crop preserved. */
const NATURE_PORTRAIT_SLUGS: Readonly<Partial<Record<number, string>>> = {
    [CreatureVals.WOLF]: "wolf",
    [CreatureVals.FAIRY]: "fairy",
    [CreatureVals.LEPRECHAUN]: "leprechaun",
    [CreatureVals.DRYAD]: "dryad",
    [CreatureVals.ELF]: "elf",
    [CreatureVals.WHITE_TIGER]: "white_tiger",
    [CreatureVals.SATYR]: "satyr",
    [CreatureVals.TRENT]: "trent",
    [CreatureVals.MANTIS]: "mantis",
    [CreatureVals.UNICORN]: "unicorn",
    [CreatureVals.PEGASUS]: "pegasus",
    [CreatureVals.GARGANTUAN]: "gargantuan",
    [CreatureVals.ARACHNA_QUEEN]: "arachna_queen",
    [CreatureVals.MAGIC_DRAGON]: "magic_dragon",
};

/** The caller owns the preview route guard. These cutouts must be paired with the faction plate. */
export const natureFrontFacingPortraitPreviewSource = (creatureId: number): string | undefined => {
    const slug = NATURE_PORTRAIT_SLUGS[creatureId];
    return slug
        ? (images as Readonly<Partial<Record<string, string>>>)[`portrait_aaa_front_nature_cutout_v2_${slug}`]
        : undefined;
};
