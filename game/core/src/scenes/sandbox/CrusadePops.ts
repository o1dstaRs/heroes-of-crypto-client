import type { FlagOverlayAttach } from "./FlagOverlayLayout";
import { statusEffectElapsedMs } from "../../settings/statusEffectTiming";

import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";
import { AtlasFlagPops, atlasFlagFrameAt, type AtlasFlagEffect } from "./AtlasFlagPops";

export const CRUSADE_EFFECT: AtlasFlagEffect = {
    url: images.vfx_champion_crusade_pop_atlas,
    meta: animationAtlases["Vfx Champion Crusade"]?.pop,
    durationMs: 1000,
    elapsedMs: (ms) => statusEffectElapsedMs(Math.max(0, ms)),
};

/** The sprite alpha already contains its fade, inside an exact one-second lifetime. */
export function crusadeFrameAt(elapsedMs: number): number | undefined {
    return atlasFlagFrameAt(CRUSADE_EFFECT, elapsedMs);
}

/** Painted Crusade banner cels following the champion above its stack flag. */
export class CrusadePops extends AtlasFlagPops {
    public constructor(attach: FlagOverlayAttach, now?: () => number) {
        super(CRUSADE_EFFECT, attach, now);
    }
}
