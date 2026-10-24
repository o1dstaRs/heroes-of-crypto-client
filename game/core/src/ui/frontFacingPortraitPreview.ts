import { CreatureVals } from "@heroesofcrypto/common";

import { images } from "../generated/image_imports";
import { level3FrontFacingPortraitPreviewSource } from "./level3FrontFacingPortraitPreview";
import { level4FrontFacingPortraitPreviewSource } from "./level4FrontFacingPortraitPreview";
import { natureFrontFacingPortraitPreviewSource } from "./natureFrontFacingPortraitPreview";

const BACKGROUND_SHADE_SOURCES = new Map(
    Object.entries(images)
        .filter(([key]) => key.startsWith("portrait_aaa_front_v1_"))
        .map(([key, source]) => [
            source,
            (images as Readonly<Partial<Record<string, string>>>)[
                key.replace("portrait_aaa_front_v1_", "portrait_aaa_front_bg_shade_v1_")
            ],
        ]),
);

/** Inverse foreground masks let composed portraits dim their background without touching the artwork. */
export const frontFacingPortraitBackgroundShadeSource = (source: string): string | undefined =>
    BACKGROUND_SHADE_SOURCES.get(source);

const PORTRAIT_SLUGS: Readonly<Partial<Record<number, string>>> = {
    [CreatureVals.PEASANT]: "peasant",
    [CreatureVals.SQUIRE]: "squire",
    [CreatureVals.ARBALESTER]: "arbalester",
    [CreatureVals.BLACKSMITH]: "blacksmith",
    [CreatureVals.WOLF]: "wolf",
    [CreatureVals.FAIRY]: "fairy",
    [CreatureVals.LEPRECHAUN]: "leprechaun",
    [CreatureVals.DRYAD]: "dryad",
    [CreatureVals.ORC]: "orc",
    [CreatureVals.SCAVENGER]: "scavenger",
    [CreatureVals.TROGLODYTE]: "troglodyte",
    [CreatureVals.WANDERING_MAGE]: "wandering_mage",
    [CreatureVals.CENTAUR]: "centaur",
    [CreatureVals.BERSERKER]: "berserker",
    [CreatureVals.WOLF_RIDER]: "wolf_rider",
    [CreatureVals.MERMAID]: "mermaid",
    [CreatureVals.ELF]: "elf",
    [CreatureVals.WHITE_TIGER]: "white_tiger",
    [CreatureVals.SATYR]: "satyr",
    [CreatureVals.TRENT]: "trent",
    [CreatureVals.HARPY]: "harpy",
    [CreatureVals.NOMAD]: "nomad",
    [CreatureVals.HYENA]: "hyena",
    [CreatureVals.WYVERN]: "wyvern",
    [CreatureVals.VALKYRIE]: "valkyrie",
    [CreatureVals.PIKEMAN]: "pikeman",
    [CreatureVals.HEALER]: "healer",
    [CreatureVals.BATTLE_MAGE]: "battle_mage",
    [CreatureVals.TROLL]: "troll",
    [CreatureVals.MEDUSA]: "medusa",
    [CreatureVals.BEHOLDER]: "beholder",
    [CreatureVals.MANTICORE]: "manticore",
};

/** Approved portraits on local sandbox and draft previews; framing editors retain their own sources. */
export const usesLocalFrontFacingPortraits = (pathname: string): boolean =>
    pathname === "/" ||
    pathname.startsWith("/sandbox/") ||
    /^\/preview\/(?:picks\/(?:bundle|local|level[1-4]|map|artifact2)|augments|placement)$/.test(pathname);

export const frontFacingPortraitPreviewSource = (creatureId: number): string | undefined => {
    if (
        !import.meta.env.DEV ||
        typeof window === "undefined" ||
        !usesLocalFrontFacingPortraits(window.location.pathname)
    ) {
        return undefined;
    }
    const slug = PORTRAIT_SLUGS[creatureId];
    const source = slug
        ? (images as Readonly<Partial<Record<string, string>>>)[`portrait_aaa_front_v1_${slug}`]
        : undefined;
    return (
        natureFrontFacingPortraitPreviewSource(creatureId) ??
        source ??
        level3FrontFacingPortraitPreviewSource(creatureId) ??
        level4FrontFacingPortraitPreviewSource(creatureId)
    );
};
