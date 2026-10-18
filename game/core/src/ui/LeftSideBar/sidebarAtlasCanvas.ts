import type { buildAtlasPingPongTiming } from "../../scenes/atlasAnimationTiming";

type AtlasTiming = Pick<ReturnType<typeof buildAtlasPingPongTiming>, "cols" | "rows" | "frameForElapsed">;

/** Paint one authored cel, retaining the original clock without a full-sheet CSS background repaint. */
export function playSidebarAtlas(
    canvas: HTMLCanvasElement,
    image: HTMLImageElement,
    timing: AtlasTiming,
): (() => void) | undefined {
    const context = canvas.getContext("2d");
    if (!context || !image.naturalWidth || !image.naturalHeight) return;
    const frameWidth = image.naturalWidth / timing.cols;
    const frameHeight = image.naturalHeight / timing.rows;
    if (![frameWidth, frameHeight].every((size) => Number.isInteger(size) && size > 0)) return;
    let lastFrame = -1;
    let frame: number | undefined;
    let stopped = false;
    let hasSize = false;
    const canPlay = () => !stopped && hasSize && !document.hidden;
    const paint = (time: number) => {
        const next = timing.frameForElapsed(time);
        if (next === lastFrame) return;
        lastFrame = next;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
            image,
            (next % timing.cols) * frameWidth,
            Math.floor(next / timing.cols) * frameHeight,
            frameWidth,
            frameHeight,
            0,
            0,
            canvas.width,
            canvas.height,
        );
    };
    const animate = (time: number) => {
        if (!canPlay()) return;
        paint(time);
        frame = window.requestAnimationFrame(animate);
    };
    const syncVisibility = () => {
        if (stopped) return;
        if (frame !== undefined) window.cancelAnimationFrame(frame);
        frame = undefined;
        if (canPlay()) {
            paint(performance.now());
            frame = window.requestAnimationFrame(animate);
        }
    };
    const resize = () => {
        if (stopped) return;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (width <= 0 || height <= 0) {
            hasSize = false;
            syncVisibility();
            return;
        }
        // Match the still's object-fit: contain, retaining the source aspect on any sidebar size.
        // Retina stays sharp without allocating beyond one source cel.
        const scale = Math.min(1, (window.devicePixelRatio || 1) * Math.min(width / frameWidth, height / frameHeight));
        const targetWidth = Math.max(1, Math.round(frameWidth * scale));
        const targetHeight = Math.max(1, Math.round(frameHeight * scale));
        const wasSized = hasSize;
        hasSize = true;
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
            lastFrame = -1;
            syncVisibility();
        } else if (!wasSized) {
            syncVisibility();
        }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", syncVisibility);
    resize();
    return () => {
        if (stopped) return;
        stopped = true;
        observer.disconnect();
        document.removeEventListener("visibilitychange", syncVisibility);
        if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
}
