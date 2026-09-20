import { useEffect, useState } from "react";

const preparedImages = new Map<string, Promise<string>>();

/** Prefilter before CSS transforms/filters minify the large metal textures into noisy speckles. */
const prepareImage = (source: string, size: number): Promise<string> => {
    const key = `${size}:${source}`;
    const cached = preparedImages.get(key);
    if (cached) return cached;

    const pending = (async () => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.src = source;
        await image.decode();

        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) return source;

        if (typeof createImageBitmap === "function") {
            const bitmap = await createImageBitmap(image, {
                resizeWidth: size,
                resizeHeight: size,
                resizeQuality: "high",
            });
            try {
                context.drawImage(bitmap, 0, 0);
            } finally {
                bitmap.close();
            }
        } else {
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
            context.drawImage(image, 0, 0, size, size);
        }
        return canvas.toDataURL("image/png");
    })().catch(() => source);

    // Keep a small shared cache across dock mounts and display/zoom changes.
    if (preparedImages.size >= 16) preparedImages.delete(preparedImages.keys().next().value!);
    preparedImages.set(key, pending);
    return pending;
};

export const useSmoothedDockImages = <T extends Record<string, string>>(sources: T): T => {
    const [prepared, setPrepared] = useState(sources);
    useEffect(() => {
        let cancelled = false;
        let revision = 0;
        let lastRatio = 0;
        const update = () => {
            const ratio = Math.max(1, window.devicePixelRatio || 1);
            if (ratio === lastRatio) return;
            lastRatio = ratio;
            const currentRevision = ++revision;
            // Two samples per device pixel keep the small bevels crisp during hover scaling.
            void Promise.all(
                Object.entries(sources).map(async ([key, source]) => {
                    const cssSize = key === "systemMenu" ? 54 : 36.8;
                    const size = Math.min(512, Math.ceil(cssSize * ratio * 2));
                    return [key, await prepareImage(source, size)] as const;
                }),
            ).then((entries) => {
                if (!cancelled && revision === currentRevision) {
                    setPrepared(Object.fromEntries(entries) as T);
                }
            });
        };
        update();
        window.addEventListener("resize", update);
        return () => {
            cancelled = true;
            window.removeEventListener("resize", update);
        };
    }, [sources]);
    return prepared;
};
