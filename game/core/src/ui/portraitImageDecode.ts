import { isDecodedImageReady } from "./decodedImageCache";

/** A retained decoded bitmap can reveal its mounted copy before the first paint, without another decode. */
export const arePortraitImagesDecoded = (images: readonly HTMLImageElement[]): boolean =>
    images.length > 0 &&
    images.every((image) => {
        const src = image.currentSrc || image.src;
        return !!src && image.complete && image.naturalWidth > 0 && isDecodedImageReady(src);
    });

/** Decode the actual mounted images before revealing their composition together. */
export async function decodePortraitImages(
    images: readonly HTMLImageElement[],
    signal?: AbortSignal,
): Promise<boolean> {
    if (images.length === 0 || signal?.aborted) return false;
    if (arePortraitImagesDecoded(images)) return true;
    const ready = await Promise.all(
        images.map(async (image) => {
            if (typeof image.decode === "function") {
                try {
                    await image.decode();
                    return !signal?.aborted && image.naturalWidth > 0;
                } catch {
                    return false;
                }
            }
            return new Promise<boolean>((resolve) => {
                const finish = () => {
                    image.removeEventListener("load", finish);
                    image.removeEventListener("error", finish);
                    signal?.removeEventListener("abort", finish);
                    resolve(!signal?.aborted && image.naturalWidth > 0);
                };
                image.addEventListener("load", finish);
                image.addEventListener("error", finish);
                signal?.addEventListener("abort", finish, { once: true });
                if (image.complete) finish();
            });
        }),
    );
    return ready.every(Boolean);
}
