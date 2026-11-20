import { describe, expect, test } from "bun:test";

import { ensureCanvasContextUsable, recordContextAboutToBeLost, type GuardedCanvas } from "./webglContextGuard";

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
});
