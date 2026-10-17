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
    let lastFrame = -1;
    let frame: number | undefined;
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
    const resize = () => {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (width <= 0 || height <= 0) return;
        // Retina stays sharp, but upscaling the backing store beyond the source cel adds only memory.
        const density = Math.min(window.devicePixelRatio || 1, frameWidth / width, frameHeight / height);
        const targetWidth = Math.max(1, Math.round(width * density));
        const targetHeight = Math.max(1, Math.round(height * density));
        if (canvas.width === targetWidth && canvas.height === targetHeight) return;
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        lastFrame = -1;
        if (!document.hidden) paint(performance.now());
    };
    const animate = (time: number) => {
        paint(time);
        frame = window.requestAnimationFrame(animate);
    };
    const syncVisibility = () => {
        if (frame !== undefined) window.cancelAnimationFrame(frame);
        frame = undefined;
        if (!document.hidden) {
            paint(performance.now());
            frame = window.requestAnimationFrame(animate);
        }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", syncVisibility);
    resize();
    syncVisibility();
    return () => {
        observer.disconnect();
        document.removeEventListener("visibilitychange", syncVisibility);
        if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
}
