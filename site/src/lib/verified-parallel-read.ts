/** Overlap an independent read with access verification without exposing it before verification succeeds. */
export async function verifiedParallelRead<T>(
    verify: () => Promise<boolean>,
    read: (signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
): Promise<{ verified: false } | { verified: true; value: T }> {
    signal.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const verification = Promise.resolve().then(verify);
    // Attach the rejection handler immediately: the data endpoint may fail before verification finishes.
    const pending = Promise.resolve()
        .then(() => read(controller.signal))
        .then(
            (value) => ({ ok: true as const, value }),
            (error) => ({ ok: false as const, error }),
        );
    try {
        if (!(await verification)) return { verified: false };
        signal.throwIfAborted();
        const result = await pending;
        signal.throwIfAborted();
        if (!result.ok) throw result.error;
        return { verified: true, value: result.value };
    } finally {
        signal.removeEventListener("abort", abort);
        controller.abort();
    }
}
