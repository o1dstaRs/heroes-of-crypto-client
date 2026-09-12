import type { AnimationAtlasMeta } from "../generated/animation_atlases";

export const PEASANT_IDLE_REST_MS = 700;
// Sixth atlas cell is fully upright; the first cell is the bottom of the bend.
export const PEASANT_IDLE_UPRIGHT_FRAME = 5;
export const PEASANT_APPROVED_IDLE_META: AnimationAtlasMeta = {
    frameWidth: 768,
    frameHeight: 768,
    atlasWidth: 3072,
    atlasHeight: 2304,
    frameCount: 12,
    fps: 6 * 1.15,
    frameDurationSec: 1 / (6 * 1.15),
    totalDurationSec: 2 / 1.15,
    layout: { cols: 4, rows: 3 },
    footAnchorY: 730 / 768,
    loopDurationMs: 1800,
    pauseMs: PEASANT_IDLE_REST_MS,
};

export function peasantIdleFrameForElapsed(now: number, frameDurationMs: number, phaseRatio = 0): number {
    const duration = Math.max(1, frameDurationMs);
    const cycle = duration * 12 + PEASANT_IDLE_REST_MS;
    const elapsed = (((now + phaseRatio * cycle) % cycle) + cycle) % cycle;
    const holdStart = duration * (PEASANT_IDLE_UPRIGHT_FRAME + 1);
    if (elapsed < holdStart) return Math.floor(elapsed / duration);
    if (elapsed < holdStart + PEASANT_IDLE_REST_MS) return PEASANT_IDLE_UPRIGHT_FRAME;
    return Math.min(11, Math.floor((elapsed - PEASANT_IDLE_REST_MS) / duration));
}
