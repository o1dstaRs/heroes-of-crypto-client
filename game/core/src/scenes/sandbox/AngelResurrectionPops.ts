import type { FlagOverlayAttach } from "./FlagOverlayLayout";
import { overheadEffectElapsedMs } from "../../settings/statusEffectTiming";

import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";
import { AtlasFlagPops, atlasFlagFrameAt, type AtlasFlagEffect } from "./AtlasFlagPops";

export const ANGEL_RESURRECTION_EFFECT: AtlasFlagEffect = {
    url: images.vfx_angel_resurrection_pop_atlas,
    meta: animationAtlases["Vfx Angel Resurrection"]?.pop,
    durationMs: 1200,
    elapsedMs: (ms) => overheadEffectElapsedMs(ms, 1200),
    alphaAt: (ageMs) => Math.min(1, ageMs / 70, (1200 - ageMs) / 180),
};

/** Frame selection for the exact 1.2-second lifetime. */
export function angelResurrectionFrameAt(elapsedMs: number): number | undefined {
    return atlasFlagFrameAt(ANGEL_RESURRECTION_EFFECT, elapsedMs);
}

/** Painted resurrection cels, coalescing simultaneous live/replay notifications. */
export class AngelResurrectionPops extends AtlasFlagPops {
    public constructor(attach: FlagOverlayAttach, now?: () => number) {
        super(ANGEL_RESURRECTION_EFFECT, attach, now);
    }
}
