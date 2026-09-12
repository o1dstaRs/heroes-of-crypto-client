import { CreatureVals } from "@heroesofcrypto/common";

import type { AnimationAtlasMeta } from "../generated/animation_atlases";
import { images } from "../generated/image_imports";

export interface LeftSidebarPortraitAnimation {
    src: string;
    meta: AnimationAtlasMeta;
}

const PEASANT_LEFT_SCREEN_IDLE: Readonly<LeftSidebarPortraitAnimation> = Object.freeze({
    src: images.peasant_left_screen_idle_atlas,
    meta: Object.freeze({
        frameWidth: 572,
        frameHeight: 808,
        atlasWidth: 3432,
        atlasHeight: 4848,
        frameCount: 34,
        fps: 9.936,
        frameDurationSec: 1 / 9.936,
        totalDurationSec: 34 / 9.936,
        layout: Object.freeze({ cols: 6, rows: 6 }),
        loopDurationMs: Math.round((34 / 9.936) * 1000),
        pauseMs: 0,
        geometry: "left-sidebar-portrait-572x808",
        encoding: "webp-rgba-q90",
    }),
});

/** Surface-specific motion: battlefield, draft and roster art remain unchanged. */
export const resolveLeftSidebarPortraitAnimation = (
    creatureId: number,
): Readonly<LeftSidebarPortraitAnimation> | null =>
    creatureId === CreatureVals.PEASANT ? PEASANT_LEFT_SCREEN_IDLE : null;
