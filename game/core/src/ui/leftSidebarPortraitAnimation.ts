import { CreatureVals } from "@heroesofcrypto/common";

import type { AnimationAtlasMeta } from "../generated/animation_atlases";
import { images } from "../generated/image_imports";
import { LEFT_SIDEBAR_PORTRAIT_ATLASES } from "./leftSidebarPortraitAnimationSources";
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";

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

const fullVideoMeta = (frameCount: number, sourceFrameCount: number): AnimationAtlasMeta => {
    const durationSec = sourceFrameCount / 24;
    const fps = frameCount / durationSec;
    const rows = Math.ceil(frameCount / 10);
    return {
        frameWidth: 572,
        frameHeight: 808,
        atlasWidth: 5720,
        atlasHeight: rows * 808,
        frameCount,
        fps,
        frameDurationSec: 1 / fps,
        totalDurationSec: durationSec,
        layout: { cols: 10, rows },
        loopDurationMs: Math.round(durationSec * 1000),
        pauseMs: 0,
        geometry: "left-sidebar-portrait-572x808",
        encoding: "webp-rgba-q93",
    };
};

const VIDEO_LEFT_SCREEN_IDLE_META = fullVideoMeta(100, 241);

// The last two Blacksmith frames repeat frame 0 and look like a pause at the seam.
// Keep the atlas layout and frame rate, but start the next cycle after frame 97.
const BLACKSMITH_LEFT_SCREEN_IDLE_META: AnimationAtlasMeta = {
    ...VIDEO_LEFT_SCREEN_IDLE_META,
    frameCount: 98,
    totalDurationSec: 98 / VIDEO_LEFT_SCREEN_IDLE_META.fps,
    loopDurationMs: Math.round((98 / VIDEO_LEFT_SCREEN_IDLE_META.fps) * 1000),
};

const FULL_VIDEO_META_BY_SLUG: Readonly<Record<string, AnimationAtlasMeta>> = Object.freeze({
    blacksmith: BLACKSMITH_LEFT_SCREEN_IDLE_META,
    squire: fullVideoMeta(60, 145),
});

const animatedPortraitBySlug: Readonly<Record<string, Readonly<LeftSidebarPortraitAnimation>>> = Object.freeze(
    Object.fromEntries(
        Object.entries(LEFT_SIDEBAR_PORTRAIT_ATLASES).map(([slug, src]) => [
            slug,
            Object.freeze({ src, meta: FULL_VIDEO_META_BY_SLUG[slug] ?? VIDEO_LEFT_SCREEN_IDLE_META }),
        ]),
    ),
);

/** Surface-specific motion: battlefield, draft and roster art remain unchanged. */
export const resolveLeftSidebarPortraitAnimation = (
    creatureId: number,
): Readonly<LeftSidebarPortraitAnimation> | null => {
    if (creatureId === CreatureVals.PEASANT) return PEASANT_LEFT_SCREEN_IDLE;
    const name = UNIT_ID_TO_NAME[creatureId];
    if (!name) return null;
    return animatedPortraitBySlug[name.toLowerCase().replaceAll(" ", "_")] ?? null;
};
