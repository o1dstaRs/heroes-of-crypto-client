/**
 * Decodes a scene atlas and resamples it off the main thread: to half size, or (for an atlas the release
 * ships halved but whose code slices fixed full-size pixels) back up to its authored size.
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
    /** 0.5 halves a full-size atlas; 2 restores an atlas the release ships halved for transport. */
    factor?: number;
}

type HalvingResponse = { id: number; bitmap: ImageBitmap } | { id: number; error: string };

const scope = self as unknown as {
    onmessage: ((event: MessageEvent<HalvingRequest>) => void) | null;
    postMessage(message: HalvingResponse, transfer?: Transferable[]): void;
};

scope.onmessage = (event) => {
    const { id, blob, options, factor = 0.5 } = event.data;
    void (async () => {
        let full: ImageBitmap | undefined;
        try {
            full = await createImageBitmap(blob, options);
            const scaled = await createImageBitmap(full, {
                resizeWidth: Math.max(1, Math.round(full.width * factor)),
                resizeHeight: Math.max(1, Math.round(full.height * factor)),
                resizeQuality: "high",
            });
            scope.postMessage({ id, bitmap: scaled }, [scaled]);
        } catch (error) {
            scope.postMessage({ id, error: String(error) });
        } finally {
            full?.close();
        }
    })();
};
