import type { FlagOverlayAttach } from "./FlagOverlayLayout";
import { statusEffectElapsedMs } from "../../settings/statusEffectTiming";

import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";
import { AtlasFlagPops, atlasFlagFrameAt, type AtlasFlagEffect } from "./AtlasFlagPops";

export const MAGIC_REFLECTION_EFFECT: AtlasFlagEffect = {
    url: images.vfx_magic_reflection_pop_atlas,
    meta: animationAtlases["Vfx Magic Reflection"]?.pop,
    durationMs: 1000,
    elapsedMs: (ms) => statusEffectElapsedMs(Math.max(0, ms)),
};

/** The sprite alpha already contains its fade, inside an exact one-second lifetime. */
export function magicReflectionFrameAt(elapsedMs: number): number | undefined {
    return atlasFlagFrameAt(MAGIC_REFLECTION_EFFECT, elapsedMs);
}

/** Painted reflection cels above the flag; simultaneous rebound hits share one activation. */
export class MagicReflectionPops extends AtlasFlagPops {
    public constructor(attach: FlagOverlayAttach, now?: () => number) {
        super(MAGIC_REFLECTION_EFFECT, attach, now);
    }
}
