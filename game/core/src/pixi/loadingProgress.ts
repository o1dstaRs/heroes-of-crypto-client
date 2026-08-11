export const MINIMUM_LOADING_SCREEN_DURATION_MS = 2000;

function clampProgress(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
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
