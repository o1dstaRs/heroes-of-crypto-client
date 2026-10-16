import { describe, expect, test } from "bun:test";
import { measureElementBox, observeElementBox, type BoxSize } from "./observeElementBox";

/** A stand-in for the board wrapper: the harness drives both its box and the observer's notifications. */
const harness = (initial: BoxSize) => {
    let box = initial;
    let notify: (() => void) | undefined;
    let observed: Element | undefined;
    let disconnected = false;
    const frames: (() => void)[] = [];
    const cancelled: number[] = [];
    const sizes: BoxSize[] = [];

    const element = {} as Element;
    const stop = observeElementBox(element, (size) => sizes.push(size), {
        createObserver: (onChange) => {
            notify = onChange;
            return {
                observe: (target: Element) => {
                    observed = target;
                },
                disconnect: () => {
                    disconnected = true;
                },
            };
        },
        measure: () => box,
        schedule: (callback) => {
            frames.push(callback);
            return frames.length; // 1-based: 0 means "nothing pending"
        },
        cancel: (handle) => cancelled.push(handle),
    });

    return {
        element,
        sizes,
        cancelled,
        stop,
        get observed() {
            return observed;
        },
        get disconnected() {
            return disconnected;
        },
        get pendingFrames() {
            return frames.length;
        },
        resizeTo: (next: BoxSize) => {
            box = next;
        },
        notify: () => notify?.(),
        runFrames: () => {
            while (frames.length) {
                frames.shift()?.();
            }
        },
    };
};

describe("observeElementBox", () => {
    test("reports the new box once the frame runs", () => {
        const h = harness({ width: 1200, height: 800 });
        expect(h.observed).toBe(h.element);

        h.resizeTo({ width: 980, height: 800 });
        h.notify();
        expect(h.sizes).toEqual([]); // nothing until the frame — a reflow is still in flight

        h.runFrames();
        expect(h.sizes).toEqual([{ width: 980, height: 800 }]);
    });

    test("a burst of notifications during one reflow costs one callback", () => {
        const h = harness({ width: 1200, height: 800 });
        h.resizeTo({ width: 1100, height: 780 });
        h.notify();
        h.notify();
        h.notify();
        expect(h.pendingFrames).toBe(1);

        h.runFrames();
        expect(h.sizes).toEqual([{ width: 1100, height: 780 }]);
    });

    test("a notification that leaves the box unchanged is dropped", () => {
        // Layout churn (a repaint, a sub-pixel wobble that floors to the same value) must not re-fit the
        // camera, or the board would jump on every unrelated reflow.
        const h = harness({ width: 1200, height: 800 });
        h.notify();
        h.runFrames();
        expect(h.sizes).toEqual([]);
    });

    test("consecutive changes each report once", () => {
        const h = harness({ width: 1200, height: 800 });
        h.resizeTo({ width: 1000, height: 800 });
        h.notify();
        h.runFrames();
        h.resizeTo({ width: 1000, height: 600 });
        h.notify();
        h.runFrames();
        expect(h.sizes).toEqual([
            { width: 1000, height: 800 },
            { width: 1000, height: 600 },
        ]);
    });

    test("cleanup disconnects, cancels the pending frame, and makes a straggler inert", () => {
        const h = harness({ width: 1200, height: 800 });
        h.resizeTo({ width: 900, height: 700 });
        h.notify();
        h.stop();
        expect(h.disconnected).toBe(true);
        expect(h.cancelled).toEqual([1]);

        // Cancelling is best-effort (a scheduler may fire anyway); the callback must still do nothing.
        h.runFrames();
        expect(h.sizes).toEqual([]);
    });

    test("without ResizeObserver it is an inert no-op, not a crash", () => {
        const sizes: BoxSize[] = [];
        const stop = observeElementBox({} as Element, (size) => sizes.push(size), {
            createObserver: () => undefined,
            measure: () => ({ width: 10, height: 10 }),
        });
        expect(() => stop()).not.toThrow();
        expect(sizes).toEqual([]);
    });

    test("measureElementBox floors to whole pixels and never returns zero", () => {
        const element = {
            getBoundingClientRect: () => ({ width: 1279.6, height: 0 }) as DOMRect,
        } as unknown as Element;
        expect(measureElementBox(element)).toEqual({ width: 1279, height: 1 });
    });
});
