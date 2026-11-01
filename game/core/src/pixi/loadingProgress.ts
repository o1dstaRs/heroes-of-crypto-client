export const MINIMUM_LOADING_SCREEN_DURATION_MS = 2000;
// Pixi can report bundle progress 1 before loadBundle resolves while the browser finalizes hundreds of
// decoded textures. Do not leave the user behind a visually completed loader indefinitely.
export const CORE_ASSET_FINALIZATION_GRACE_MS = 1500;

export function minimumLoadingScreenDurationMs(sceneTitle: string): number {
    return sceneTitle === "Sandbox" ? MINIMUM_LOADING_SCREEN_DURATION_MS : 0;
}

function clampProgress(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

/** Ease real loading updates in frame time; a stalled frame must not teleport the slider. */
export function advanceLoadingProgress(current: number, target: number, deltaMs: number): number {
    const from = clampProgress(current);
    const to = Math.max(from, clampProgress(target));
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || from === to) return from;
    const next = from + (to - from) * -Math.expm1(-Math.min(deltaMs, 50) / 120);
    return to - next < 0.0001 ? to : next;
}

/**
 * Keep the loading screen visible for at least the minimum duration without letting its indicator
 * get ahead of the work that has actually completed.
 */
export function displayedLoadingProgress(
    actualProgress: number,
    elapsedMs: number,
    minimumDurationMs = MINIMUM_LOADING_SCREEN_DURATION_MS,
): number {
    const durationProgress = minimumDurationMs <= 0 ? 1 : elapsedMs / minimumDurationMs;
    return Math.min(clampProgress(actualProgress), clampProgress(durationProgress));
}
