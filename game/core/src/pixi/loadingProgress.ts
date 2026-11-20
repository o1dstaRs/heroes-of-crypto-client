export const MINIMUM_LOADING_SCREEN_DURATION_MS = 2000;

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

/** The longest the bar takes to sweep from empty to full once loading is done; a nearly full bar takes less. */
export const LOADING_EXIT_SWEEP_MS = 280;
/** The loading screen then fades over the already rendered board instead of vanishing in one frame. */
export const LOADING_EXIT_FADE_MS = 220;

export interface ILoadingExitFrame {
    progress: number;
    alpha: number;
    done: boolean;
}

/**
 * The loading screen's exit: the bar first sweeps from where it is to 100% (ease-out), then the screen fades.
 * The eased bar trails the real progress, so without this the screen was removed while the bar still showed
 * about half and the board appeared with a jump.
 */
export function loadingExitFrame(
    fromProgress: number,
    elapsedMs: number,
    sweepMs = LOADING_EXIT_SWEEP_MS,
    fadeMs = LOADING_EXIT_FADE_MS,
): ILoadingExitFrame {
    const from = clampProgress(fromProgress);
    const sweep = Math.max(0, sweepMs * (1 - from));
    const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
    if (sweep > 0 && elapsed < sweep) {
        const t = elapsed / sweep;
        return { progress: from + (1 - from) * (1 - (1 - t) ** 3), alpha: 1, done: false };
    }
    const fade = elapsed - sweep;
    if (fadeMs > 0 && fade < fadeMs) return { progress: 1, alpha: 1 - fade / fadeMs, done: false };
    return { progress: 1, alpha: 0, done: true };
}
