import type { FlagOverlayAttach } from "./FlagOverlayLayout";
import { statusEffectElapsedMs } from "../../settings/statusEffectTiming";

import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";
import { AtlasFlagPops, atlasFlagFrameAt, type AtlasFlagEffect } from "./AtlasFlagPops";

export const BOAR_SALIVA_EFFECT: AtlasFlagEffect = {
    url: images.vfx_boar_saliva_short_atlas,
    meta: animationAtlases["Vfx Boar Saliva"]?.short,
    durationMs: 1000,
    elapsedMs: (ms) => statusEffectElapsedMs(Math.max(0, ms)),
};

/** Appearance, falling droplets and disappearance are authored inside the one-second sprite sequence. */
export function boarSalivaFrameAt(elapsedMs: number): number | undefined {
    return atlasFlagFrameAt(BOAR_SALIVA_EFFECT, elapsedMs);
}

/** Fixed-size painted saliva cue following the recipient's count flag. */
export class BoarSalivaPops extends AtlasFlagPops {
    public constructor(attach: FlagOverlayAttach, now?: () => number) {
        super(BOAR_SALIVA_EFFECT, attach, now);
    }
}
