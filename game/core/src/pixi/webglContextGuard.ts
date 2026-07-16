// game/core/src/pixi/webglContextGuard.ts
//
// Guard against re-initializing a Pixi Application on a canvas whose WebGL context was force-lost
// by a previous Pixi teardown.
//
// pixi.js v8's GlContextSystem.destroy() UNCONDITIONALLY calls
// `WEBGL_lose_context.loseContext()` on the canvas's context. A lost context stays attached to its
// canvas forever: `canvas.getContext("webgl2")` keeps returning the SAME lost context object. If a
// new Pixi Application is then initialized against that canvas, pixi adopts the lost context and
// `GlLimitsSystem.contextChange` calls `checkMaxIfStatementsInShader`, whose maxIfs-halving
// `while (true)` loop can never exit (every shader compile fails on a lost context, and once maxIfs
// reaches 0, `0 / 2 | 0 === 0` forever). That is not an error or a crash — it is a TOTAL,
// uninterruptible main-thread freeze of the tab (nightly QA #3's P0 "Play Again vs AI" freeze).
//
// The structural fix is to never re-init on a used canvas (Main mounts a fresh <canvas> per boot).
// This guard is defense-in-depth for any residual same-canvas re-init (StrictMode double-mount,
// HMR, a future code path): PixiApp.destroy() records the context + WEBGL_lose_context extension it
// is about to lose, and PixiApp.init() restores the context (bounded wait) — or fails LOUDLY with a
// throw instead of freezing the tab — before handing the canvas back to pixi.

/** Minimal view of a WebGL context: enough to detect loss and restore. */
export interface RecordedGlContext {
    isContextLost(): boolean;
}

export interface RecordedLoseContextExtension {
    restoreContext(): void;
}

/** Minimal canvas surface used by the guard (kept tiny so tests don't need a DOM). */
export interface GuardedCanvas {
    addEventListener(type: string, listener: () => void, options?: { once: boolean }): void;
    removeEventListener(type: string, listener: () => void): void;
}

interface LostContextRecord {
    gl: RecordedGlContext;
    ext: RecordedLoseContextExtension | null;
}

const lostContextByCanvas = new WeakMap<object, LostContextRecord>();

/**
 * Record that `canvas`'s WebGL context is about to be force-lost by a Pixi renderer destroy.
 * Call BEFORE Application.destroy() — afterwards pixi has nulled its renderer references.
 */
export function recordContextAboutToBeLost(
    canvas: object,
    gl: RecordedGlContext | undefined,
    ext: RecordedLoseContextExtension | null | undefined,
): void {
    if (!gl) {
        return;
    }
    lostContextByCanvas.set(canvas, { gl, ext: ext ?? null });
}

/** How long to wait for the browser's async `webglcontextrestored` event before giving up. */
export const CONTEXT_RESTORE_TIMEOUT_MS = 2000;

/**
 * Make sure `canvas` can host a fresh WebGL context. Resolves immediately for a never-used canvas
 * or a still-live context. For a context we force-lost, restores it via WEBGL_lose_context and
 * waits (bounded) for `webglcontextrestored`. Throws — instead of letting pixi freeze the tab —
 * when the context is lost and cannot be restored.
 */
export async function ensureCanvasContextUsable(
    canvas: GuardedCanvas,
    timeoutMs: number = CONTEXT_RESTORE_TIMEOUT_MS,
): Promise<void> {
    const record = lostContextByCanvas.get(canvas);
    if (!record) {
        return;
    }
    lostContextByCanvas.delete(canvas);
    if (!record.gl.isContextLost()) {
        // The destroy that recorded this never actually lost the context (e.g. it threw earlier in
        // pixi's teardown). The live context is fine to adopt — nothing to restore.
        return;
    }
    if (!record.ext) {
        // Lost with no restore handle: initializing pixi here would hard-freeze the tab in
        // checkMaxIfStatementsInShader. A thrown init is recoverable; a frozen tab is not.
        throw new Error(
            "Canvas WebGL context was force-lost by a previous Pixi teardown and cannot be restored — " +
                "initialize Pixi against a freshly-created canvas instead",
        );
    }
    await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const onRestored = (): void => {
            if (timer !== undefined) {
                clearTimeout(timer);
            }
            resolve();
        };
        timer = setTimeout(() => {
            canvas.removeEventListener("webglcontextrestored", onRestored);
            reject(
                new Error(
                    "Timed out restoring a force-lost WebGL context — " +
                        "initialize Pixi against a freshly-created canvas instead",
                ),
            );
        }, timeoutMs);
        canvas.addEventListener("webglcontextrestored", onRestored, { once: true });
        try {
            record.ext!.restoreContext();
        } catch (err) {
            clearTimeout(timer);
            canvas.removeEventListener("webglcontextrestored", onRestored);
            reject(err instanceof Error ? err : new Error(String(err)));
        }
    });
}

/** Test-only visibility: whether a canvas currently has a recorded force-lost context. */
export function hasRecordedLostContext(canvas: object): boolean {
    return lostContextByCanvas.has(canvas);
}
