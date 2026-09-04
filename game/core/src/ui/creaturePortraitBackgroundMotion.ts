import { CreatureFactionsMap, FactionVals } from "@heroesofcrypto/common";

import { images } from "../generated/image_imports";

export type CreaturePortraitBackgroundMotionKind = "chaos" | "life" | "might" | "nature";

export interface CreaturePortraitBackgroundMotion {
    kind: CreaturePortraitBackgroundMotionKind;
    glowSrc: string;
    primaryAnimation: string;
    primaryFilter: string;
    secondaryAnimation: string;
    secondaryFilter: string;
}

const MOTION_BY_FACTION: Readonly<Partial<Record<number, Readonly<CreaturePortraitBackgroundMotion>>>> = Object.freeze({
    [FactionVals.CHAOS]: Object.freeze({
        kind: "chaos",
        glowSrc: images.chaos_portrait_bg_emissive_glow_v1,
        primaryAnimation: "hocPortraitChaosFire 3.8s ease-in-out infinite",
        primaryFilter: "brightness(1.42) saturate(1.35) contrast(1.08)",
        secondaryAnimation: "hocPortraitChaosEmbers 5.3s ease-in-out -1.7s infinite",
        secondaryFilter: "brightness(1.18) saturate(1.28) blur(2px)",
    }),
    [FactionVals.LIFE]: Object.freeze({
        kind: "life",
        glowSrc: images.life_portrait_bg_emissive_glow_v1,
        primaryAnimation: "hocPortraitLifeRays 7.2s ease-in-out infinite",
        primaryFilter: "brightness(1.38) saturate(1.16) contrast(1.04)",
        secondaryAnimation: "hocPortraitLifeHaze 9.1s ease-in-out -3.2s infinite",
        secondaryFilter: "brightness(1.16) saturate(1.12) blur(2.5px)",
    }),
    [FactionVals.MIGHT]: Object.freeze({
        kind: "might",
        glowSrc: images.might_portrait_bg_emissive_glow_v1,
        primaryAnimation: "hocPortraitMightClaws 4.6s ease-in-out infinite",
        primaryFilter: "brightness(1.44) saturate(1.4) contrast(1.1)",
        secondaryAnimation: "hocPortraitMightHeat 6.4s ease-in-out -2.1s infinite",
        secondaryFilter: "brightness(1.18) saturate(1.32) blur(2px)",
    }),
    [FactionVals.NATURE]: Object.freeze({
        kind: "nature",
        glowSrc: images.nature_portrait_bg_emissive_glow_v1,
        primaryAnimation: "hocPortraitNatureVeins 5.8s ease-in-out infinite",
        primaryFilter: "brightness(1.48) saturate(1.42) contrast(1.08)",
        secondaryAnimation: "hocPortraitNatureMist 8.7s ease-in-out -2.8s infinite",
        secondaryFilter: "brightness(1.2) saturate(1.34) blur(2.25px)",
    }),
});

/**
 * Two transparent emissive masks pulse over the approved static art. The base image and both masks
 * stay pixel-aligned, so fire, rays, cuts and veins breathe without camera movement or zoom.
 */
export const CREATURE_PORTRAIT_BACKGROUND_MOTION_KEYFRAMES = {
    "@keyframes hocPortraitChaosFire": {
        "0%, 100%": { opacity: 0.05 },
        "28%": { opacity: 0.8 },
        "57%": { opacity: 0.16 },
        "81%": { opacity: 0.96 },
    },
    "@keyframes hocPortraitChaosEmbers": {
        "0%, 100%": { opacity: 0.04 },
        "42%": { opacity: 0.32 },
        "72%": { opacity: 0.09 },
    },
    "@keyframes hocPortraitLifeRays": {
        "0%, 100%": { opacity: 0.04 },
        "50%": { opacity: 0.9 },
    },
    "@keyframes hocPortraitLifeHaze": {
        "0%, 100%": { opacity: 0.04 },
        "48%": { opacity: 0.28 },
    },
    "@keyframes hocPortraitMightClaws": {
        "0%, 100%": { opacity: 0.04 },
        "46%": { opacity: 0.96 },
        "67%": { opacity: 0.14 },
    },
    "@keyframes hocPortraitMightHeat": {
        "0%, 100%": { opacity: 0.04 },
        "52%": { opacity: 0.3 },
    },
    "@keyframes hocPortraitNatureVeins": {
        "0%, 100%": { opacity: 0.04 },
        "43%": { opacity: 0.98 },
        "65%": { opacity: 0.14 },
    },
    "@keyframes hocPortraitNatureMist": {
        "0%, 100%": { opacity: 0.03 },
        "50%": { opacity: 0.32 },
    },
} as const;

export const resolveCreaturePortraitBackgroundMotion = (
    creatureId: number,
): Readonly<CreaturePortraitBackgroundMotion> | null => MOTION_BY_FACTION[CreatureFactionsMap[creatureId]] ?? null;
