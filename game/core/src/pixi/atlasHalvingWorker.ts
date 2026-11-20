/**
 * Decodes a scene atlas and resamples it to half size off the main thread.
 *
 * Chrome resamples an ImageBitmap (`createImageBitmap(bitmap, { resizeWidth })`) synchronously on the
 * calling thread, and applies the resize options of a Blob decode there as well: on the main thread
 * the halved creature atlases cost 1.8 s of blocked frames while a match loaded (measured 2026-11-20,
 * Griffin's idle sheet alone 230 ms). Here the same work blocks only this worker.
 */

interface HalvingRequest {
    id: number;
    blob: Blob;
    options: ImageBitmapOptions;
}

type HalvingResponse = { id: number; bitmap: ImageBitmap } | { id: number; error: string };

const scope = self as unknown as {
    onmessage: ((event: MessageEvent<HalvingRequest>) => void) | null;
    postMessage(message: HalvingResponse, transfer?: Transferable[]): void;
};

scope.onmessage = (event) => {
    const { id, blob, options } = event.data;
    void (async () => {
        let full: ImageBitmap | undefined;
        try {
            full = await createImageBitmap(blob, options);
            const half = await createImageBitmap(full, {
                resizeWidth: Math.max(1, Math.round(full.width / 2)),
                resizeHeight: Math.max(1, Math.round(full.height / 2)),
                resizeQuality: "high",
            });
            scope.postMessage({ id, bitmap: half }, [half]);
        } catch (error) {
            scope.postMessage({ id, error: String(error) });
        } finally {
            full?.close();
        }
    })();
};
