/*
 * -----------------------------------------------------------------------------
 * This file is part of the client code of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

export interface BoxSize {
    width: number;
    height: number;
}

interface BoxObserver {
    observe(element: Element): void;
    disconnect(): void;
}

export interface ObserveElementBoxOptions {
    /** Injection seams for tests; each defaults to the browser primitive. */
    createObserver?: (onChange: () => void) => BoxObserver | undefined;
    measure?: (element: Element) => BoxSize;
    schedule?: (callback: () => void) => number;
    cancel?: (handle: number) => void;
}

/** Whole CSS pixels, never zero — the renderer and the camera fit both read the box this way. */
export const measureElementBox = (element: Element): BoxSize => {
    const rect = element.getBoundingClientRect();
    return {
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
    };
};

const defaultCreateObserver = (onChange: () => void): BoxObserver | undefined =>
    typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => onChange());

/**
 * Call `onResize` whenever an element's own box changes size.
 *
 * `window.resize` is not enough for the board: its wrapper is a flex item beside the sidebars, so a panel
 * that mounts or grows mid-match (ranked placement is full of them) re-lays the board out without the
 * window ever changing. The canvas then kept the pixel size it was last given and the camera stayed fit to
 * that stale box — the board slid off-centre and the sidebar was pushed past the window edge.
 *
 * Notifications are coalesced into one animation frame (a reflow can emit several in a row) and a change
 * that rounds to the same whole-pixel box is dropped, so this cannot feed a resize/relayout loop.
 * Returns a cleanup that disconnects the observer and cancels any pending frame.
 */
export const observeElementBox = (
    element: Element,
    onResize: (size: BoxSize) => void,
    options: ObserveElementBoxOptions = {},
): (() => void) => {
    const measure = options.measure ?? measureElementBox;
    const schedule =
        options.schedule ??
        ((callback: () => void) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(callback) : 0));
    const cancel =
        options.cancel ??
        ((handle: number) => {
            if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(handle);
        });

    let last = measure(element);
    let pending = 0;
    let stopped = false;

    const flush = (): void => {
        pending = 0;
        // A frame already in flight when the watcher is torn down must not report into a dead scene —
        // cancelling is best-effort, so the guard is what actually makes cleanup final.
        if (stopped) {
            return;
        }
        const next = measure(element);
        if (next.width === last.width && next.height === last.height) {
            return;
        }
        last = next;
        onResize(next);
    };

    const observer = (options.createObserver ?? defaultCreateObserver)(() => {
        if (pending || stopped) {
            return;
        }
        pending = schedule(flush);
    });
    if (!observer) {
        return () => undefined;
    }
    observer.observe(element);

    return () => {
        stopped = true;
        if (pending) {
            cancel(pending);
            pending = 0;
        }
        observer.disconnect();
    };
};
