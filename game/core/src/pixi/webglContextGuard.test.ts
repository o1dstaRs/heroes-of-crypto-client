import { describe, expect, test } from "bun:test";

import {
    ensureCanvasContextUsable,
    hasRecordedLostContext,
    recordContextAboutToBeLost,
    type GuardedCanvas,
} from "./webglContextGuard";

// Minimal canvas double: enough event plumbing for the guard, no DOM required.
const makeCanvas = () => {
    const listeners = new Map<string, Array<() => void>>();
    const canvas: GuardedCanvas & { fire(type: string): void } = {
        addEventListener(type, listener) {
            const arr = listeners.get(type) ?? [];
            arr.push(listener);
            listeners.set(type, arr);
        },
        removeEventListener(type, listener) {
            const arr = listeners.get(type) ?? [];
            const idx = arr.indexOf(listener);
            if (idx >= 0) arr.splice(idx, 1);
        },
        fire(type) {
            for (const listener of [...(listeners.get(type) ?? [])]) listener();
        },
    };
    return canvas;
};

describe("webglContextGuard", () => {
    test("no-op for a canvas that never hosted a pixi context", async () => {
        const canvas = makeCanvas();
        await ensureCanvasContextUsable(canvas);
        expect(hasRecordedLostContext(canvas)).toBe(false);
    });

    test("no-op when the recorded context never actually got lost (aborted teardown)", async () => {
        const canvas = makeCanvas();
        let restored = 0;
        recordContextAboutToBeLost(canvas, { isContextLost: () => false }, { restoreContext: () => restored++ });
        expect(hasRecordedLostContext(canvas)).toBe(true);
        await ensureCanvasContextUsable(canvas);
        expect(restored).toBe(0);
        // Consumed either way — the record describes one specific teardown.
        expect(hasRecordedLostContext(canvas)).toBe(false);
    });

    test("restores a force-lost context and waits for webglcontextrestored", async () => {
        const canvas = makeCanvas();
        let restoreCalls = 0;
        recordContextAboutToBeLost(
            canvas,
            { isContextLost: () => true },
            {
                restoreContext: () => {
                    restoreCalls++;
                    // The browser fires the restored event asynchronously.
                    setTimeout(() => canvas.fire("webglcontextrestored"), 0);
                },
            },
        );
        await ensureCanvasContextUsable(canvas);
        expect(restoreCalls).toBe(1);
        expect(hasRecordedLostContext(canvas)).toBe(false);
    });

    test("throws (instead of freezing) when the context is lost with no restore handle", async () => {
        const canvas = makeCanvas();
        recordContextAboutToBeLost(canvas, { isContextLost: () => true }, null);
        await expect(ensureCanvasContextUsable(canvas)).rejects.toThrow(/cannot be restored/);
    });

    test("throws after the bounded wait when webglcontextrestored never fires", async () => {
        const canvas = makeCanvas();
        recordContextAboutToBeLost(
            canvas,
            { isContextLost: () => true },
            { restoreContext: () => undefined }, // restore requested, event never arrives
        );
        await expect(ensureCanvasContextUsable(canvas, 20)).rejects.toThrow(/Timed out restoring/);
    });

    test("throws when restoreContext itself throws", async () => {
        const canvas = makeCanvas();
        recordContextAboutToBeLost(
            canvas,
            { isContextLost: () => true },
            {
                restoreContext: () => {
                    throw new Error("INVALID_OPERATION");
                },
            },
        );
        await expect(ensureCanvasContextUsable(canvas)).rejects.toThrow("INVALID_OPERATION");
    });

    test("recording without a gl handle is ignored", async () => {
        const canvas = makeCanvas();
        recordContextAboutToBeLost(canvas, undefined, null);
        expect(hasRecordedLostContext(canvas)).toBe(false);
        await ensureCanvasContextUsable(canvas);
    });
});
