export interface VisibleIntervalEnvironment {
    isHidden(): boolean;
    setInterval(callback: () => void, intervalMs: number): number;
    clearInterval(handle: number): void;
    addVisibilityListener(callback: () => void): void;
    removeVisibilityListener(callback: () => void): void;
}

const browserEnvironment = (): VisibleIntervalEnvironment => ({
    isHidden: () => document.hidden,
    setInterval: (callback, intervalMs) => window.setInterval(callback, intervalMs),
    clearInterval: (handle) => window.clearInterval(handle),
    addVisibilityListener: (callback) => document.addEventListener("visibilitychange", callback),
    removeVisibilityListener: (callback) => document.removeEventListener("visibilitychange", callback),
});

/**
 * Run immediately and periodically while visible, fully disarming the timer in background tabs.
 * Becoming visible runs once at once, so callers catch up without waiting for the next interval.
 */
export const startVisibleInterval = (
    callback: () => void,
    intervalMs: number,
    environment: VisibleIntervalEnvironment = browserEnvironment(),
): (() => void) => {
    let handle: number | undefined;
    const stopTimer = (): void => {
        if (handle === undefined) return;
        environment.clearInterval(handle);
        handle = undefined;
    };
    const startTimer = (): void => {
        if (handle !== undefined || environment.isHidden()) return;
        callback();
        handle = environment.setInterval(callback, intervalMs);
    };
    const onVisibilityChange = (): void => {
        if (environment.isHidden()) stopTimer();
        else startTimer();
    };

    environment.addVisibilityListener(onVisibilityChange);
    startTimer();
    return () => {
        stopTimer();
        environment.removeVisibilityListener(onVisibilityChange);
    };
};
