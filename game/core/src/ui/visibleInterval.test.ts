import { describe, expect, test } from "bun:test";

import { startVisibleInterval, type VisibleIntervalEnvironment } from "./visibleInterval";

describe("visible interval", () => {
    test("has no background timer and catches up immediately when the tab returns", () => {
        let hidden = true;
        let nextHandle = 0;
        let listener: (() => void) | undefined;
        const intervals = new Map<number, () => void>();
        const environment: VisibleIntervalEnvironment = {
            isHidden: () => hidden,
            setInterval: (callback) => {
                const handle = ++nextHandle;
                intervals.set(handle, callback);
                return handle;
            },
            clearInterval: (handle) => intervals.delete(handle),
            addVisibilityListener: (callback) => {
                listener = callback;
            },
            removeVisibilityListener: (callback) => {
                if (listener === callback) listener = undefined;
            },
        };
        let calls = 0;

        const stop = startVisibleInterval(() => calls++, 3_000, environment);
        expect(calls).toBe(0);
        expect(intervals.size).toBe(0);

        hidden = false;
        listener?.();
        expect(calls).toBe(1);
        expect(intervals.size).toBe(1);
        listener?.();
        expect(calls).toBe(1);
        intervals.values().next().value?.();
        expect(calls).toBe(2);

        hidden = true;
        listener?.();
        expect(intervals.size).toBe(0);
        stop();
        expect(listener).toBeUndefined();
    });
});
