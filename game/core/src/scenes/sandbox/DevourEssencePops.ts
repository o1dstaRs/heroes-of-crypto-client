import type { FlagOverlayAttach } from "./FlagOverlayLayout";
import { statusEffectElapsedMs } from "../../settings/statusEffectTiming";

import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";
import { AtlasFlagPops, atlasFlagFrameAt, type AtlasFlagEffect } from "./AtlasFlagPops";

export const DEVOUR_ESSENCE_EFFECT: AtlasFlagEffect = {
    url: images.vfx_devour_essence_short_atlas,
    meta: animationAtlases["Vfx Devour Essence"]?.short,
    durationMs: 1000,
    elapsedMs: (ms) => statusEffectElapsedMs(Math.max(0, ms)),
};

/** Appearance, inward essence absorption and disappearance are authored inside the one-second sprite sequence. */
export function devourEssenceFrameAt(elapsedMs: number): number | undefined {
    return atlasFlagFrameAt(DEVOUR_ESSENCE_EFFECT, elapsedMs);
}

/** Fixed-size painted essence cue following the healer's count flag. */
export class DevourEssencePops extends AtlasFlagPops {
    public constructor(attach: FlagOverlayAttach, now?: () => number) {
        super(DEVOUR_ESSENCE_EFFECT, attach, now);
    }
}
