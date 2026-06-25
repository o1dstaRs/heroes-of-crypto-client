import { animationAtlases, AnimationUnitName, AnimationStateName } from "../generated/animation_atlases";

export type AtlasMeta = (typeof animationAtlases)[AnimationUnitName][AnimationStateName];

export interface AtlasPingPongTiming {
    frameCount: number;
    cols: number;
    rows: number;
    cycleMs: number;
    /**
     * Ping-pong frame index (0..frameCount-1) for a given ABSOLUTE timestamp in ms.
     *
     * Pass `performance.now()` on the board and the requestAnimationFrame timestamp in the
     * sidebar — both are DOMHighResTimeStamps off the same time origin, so feeding absolute
     * (not start-relative) time makes every view that uses this helper phase-locked: they all
     * land on the same frame at the same instant regardless of when each one started. A view
     * that becomes ready late (e.g. its atlas just finished downloading) snaps straight into
     * the shared phase.
     */
    frameForElapsed(absMs: number): number;
}

/**
 * Single source of truth for portrait ping-pong timing (forward → hold → backward → hold),
 * shared by the board sprite animation and the left-sidebar CSS animation so the two stay in sync.
 */
export function buildAtlasPingPongTiming(meta: AtlasMeta): AtlasPingPongTiming {
    const cols = meta.layout?.cols ?? 1;
    const rows = meta.layout?.rows ?? 1;
    const frameCount = Math.max(1, meta.frameCount ?? 1);
    const fallbackTotalSec =
        typeof meta.totalDurationSec === "number" && Number.isFinite(meta.totalDurationSec)
            ? meta.totalDurationSec
            : frameCount / (meta.fps || 12);
    const baseTotalMs = fallbackTotalSec * 1000;
    const loopDurationMs = meta.loopDurationMs ?? Math.round(baseTotalMs * 0.8);
    const pauseMs = meta.pauseMs ?? Math.round(loopDurationMs * 0.4);
    const forwardMs = Math.max(1, loopDurationMs);
    const holdMs = Math.max(0, pauseMs);
    const cycleMs = forwardMs * 2 + holdMs * 2;

    const frameForElapsed = (absMs: number): number => {
        if (frameCount <= 1) return 0;
        // Guard against negative timestamps so the modulo phase is always in [0, cycleMs).
        const cp = (((absMs % cycleMs) + cycleMs) % cycleMs) as number;
        if (cp < forwardMs) return Math.min(frameCount - 1, Math.floor((cp / forwardMs) * frameCount));
        if (cp < forwardMs + holdMs) return frameCount - 1;
        const rp = cp - forwardMs - holdMs;
        if (rp < forwardMs) return Math.max(0, frameCount - 1 - Math.floor((rp / forwardMs) * frameCount));
        return 0;
    };

    return { cols, rows, frameCount, cycleMs, frameForElapsed };
}
