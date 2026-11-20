import type { FlagOverlayAttach } from "./FlagOverlayLayout";
import { statusEffectElapsedMs } from "../../settings/statusEffectTiming";

import { animationAtlases } from "../../generated/animation_atlases";
import { images } from "../../imageAssets";
import { AtlasFlagPops, atlasFlagFrameAt, type AtlasFlagEffect } from "./AtlasFlagPops";

export const UNYIELDING_POWER_EFFECT: AtlasFlagEffect = {
    url: images.vfx_unyielding_power_curl_short_atlas,
    meta: animationAtlases["Vfx Unyielding Power Curl"]?.short,
    durationMs: 1000,
    elapsedMs: (ms) => statusEffectElapsedMs(Math.max(0, ms)),
};

/** The sprite alpha already contains its fade, inside an exact one-second lifetime. */
export function unyieldingPowerFrameAt(elapsedMs: number): number | undefined {
    return atlasFlagFrameAt(UNYIELDING_POWER_EFFECT, elapsedMs);
}

/** Complete painted curl cels, with coalesced simultaneous turn/passive notifications. */
export class UnyieldingPowerPops extends AtlasFlagPops {
    public constructor(attach: FlagOverlayAttach, now?: () => number) {
        super(UNYIELDING_POWER_EFFECT, attach, now);
    }
}
