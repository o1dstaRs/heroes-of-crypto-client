import { CreatureVals } from "@heroesofcrypto/common";

import type { AnimationAtlasMeta } from "../generated/animation_atlases";
import { withSidebarPortraitPages, type LeftSidebarPortraitAnimation } from "./leftSidebarPortraitAnimation";

const FRAME_COUNT = 100;
// Restore the source-video cycle, repeated twice, at the original slowed cadence.
const DURATION_SEC = 241 / 24 / 0.93;
const FPS = FRAME_COUNT / DURATION_SEC;

const INTEGRATED_ARBALESTER_PORTRAIT: Readonly<LeftSidebarPortraitAnimation> = Object.freeze({
    src: new URL("../../images/arbalester_v8_atlas.webp", import.meta.url).toString(),
    meta: Object.freeze({
        frameWidth: 572,
        frameHeight: 808,
        atlasWidth: 5720,
        atlasHeight: 8080,
        frameCount: FRAME_COUNT,
        fps: FPS,
        frameDurationSec: 1 / FPS,
        totalDurationSec: DURATION_SEC,
        layout: { cols: 10, rows: 10 },
        loopDurationMs: Math.round(DURATION_SEC * 1000),
        pauseMs: 0,
        geometry: "left-sidebar-portrait-572x808",
        encoding: "webp-rgba-lossless",
    } satisfies AnimationAtlasMeta),
});

export const resolveIntegratedArbalesterPortrait = (
    creatureId: number,
    fallback: Readonly<LeftSidebarPortraitAnimation> | null,
): Readonly<LeftSidebarPortraitAnimation> | null =>
    creatureId === CreatureVals.ARBALESTER
        ? withSidebarPortraitPages(INTEGRATED_ARBALESTER_PORTRAIT, "arbalester_v8_atlas.webp")
        : fallback;
