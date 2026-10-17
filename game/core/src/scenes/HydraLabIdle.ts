/** Calm 768px idle: independent lower-head sway, with no biting section. */
export const HYDRA_IDLE_FRAME_COUNT = 64;
export const HYDRA_IDLE_SPEED = 1.2;
export const HYDRA_IDLE_FRAME_MS = 62.5 / HYDRA_IDLE_SPEED;

export function hydraLabIdleFrame(elapsedMs: number): number {
    // Timestamps can put an exact frame boundary a few ulps below it.
    const t = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) + 1e-7 : 0;
    return Math.floor(t / HYDRA_IDLE_FRAME_MS) % HYDRA_IDLE_FRAME_COUNT;
}
