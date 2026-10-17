import type { buildAtlasPingPongTiming } from "../../scenes/atlasAnimationTiming";
import {
    sidebarPortraitPagePool,
    type SidebarPortraitPage,
    type SidebarPortraitPagePool,
} from "../sidebarPortraitPagePool";

type Timing = Pick<ReturnType<typeof buildAtlasPingPongTiming>, "frameForElapsed">;

export interface PagedSidebarAtlas {
    frameWidth: number;
    frameHeight: number;
    fps: number;
    pages: readonly SidebarPortraitPage[];
}

/** Current plus the next two distinct pages in the actual loop/ping-pong order. */
export function sidebarPageWindow(format: PagedSidebarAtlas, timing: Timing, elapsed: number): SidebarPortraitPage[] {
    const pages: SidebarPortraitPage[] = [];
    const step = 1000 / Math.max(0.01, format.fps);
    for (let index = 0; index < 50 && pages.length < 3; index++) {
        const frame = timing.frameForElapsed(elapsed + index * step);
        const page = format.pages.find(
            (candidate) => frame >= candidate.firstFrame && frame < candidate.firstFrame + candidate.frameCount,
        );
        if (page && !pages.includes(page)) pages.push(page);
    }
    return pages;
}

/** Start after selection settles; a missing page holds the last cel without a blank or a catch-up burst. */
export function playPagedSidebarAtlas(
    canvas: HTMLCanvasElement,
    format: PagedSidebarAtlas,
    timing: Timing,
    onFirstFrame: () => void,
    pool: SidebarPortraitPagePool = sidebarPortraitPagePool,
): (() => void) | undefined {
    const context = canvas.getContext("2d");
    if (!context) return;
    const owner = {};
    let elapsed = 0;
    let lastTime: number | undefined;
    let lastPaintedFrame = -1;
    let paintedPage: string | undefined;
    let requestedFrame = -1;
    let started = false;
    let stopped = false;
    let frame: number | undefined;
    let timer: number | undefined;
    let windowKey = "";
    const request = (time: number) => {
        const next = timing.frameForElapsed(time);
        if (next === requestedFrame) return;
        requestedFrame = next;
        const wanted = sidebarPageWindow(format, timing, time);
        const signature = wanted.map((page) => page.src).join("\n");
        if (signature === windowKey) return;
        windowKey = signature;
        pool.update(owner, wanted);
    };
    const paint = (time: number) => {
        const next = timing.frameForElapsed(time);
        const page = format.pages.find(
            (candidate) => next >= candidate.firstFrame && next < candidate.firstFrame + candidate.frameCount,
        );
        const image = page && pool.get(page.src);
        if (!page || !image) return false;
        if (next === lastPaintedFrame) return true;
        const local = next - page.firstFrame;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(
            image,
            (local % page.cols) * format.frameWidth,
            Math.floor(local / page.cols) * format.frameHeight,
            format.frameWidth,
            format.frameHeight,
            0,
            0,
            canvas.width,
            canvas.height,
        );
        if (paintedPage !== page.src) {
            paintedPage = page.src;
            canvas.dataset.sidebarPage = page.src;
        }
        lastPaintedFrame = next;
        if (!started) {
            started = true;
            onFirstFrame();
        }
        return true;
    };
    const animate = (time: number) => {
        if (stopped || document.hidden) return;
        const delta = lastTime === undefined || !started ? 0 : Math.max(0, Math.min(250, time - lastTime));
        lastTime = time;
        const candidate = elapsed + delta;
        request(candidate);
        if (paint(candidate)) elapsed = candidate;
        frame = window.requestAnimationFrame(animate);
    };
    const resize = () => {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (width <= 0 || height <= 0) return;
        const density = Math.min(window.devicePixelRatio || 1, format.frameWidth / width, format.frameHeight / height);
        const targetWidth = Math.max(1, Math.round(width * density));
        const targetHeight = Math.max(1, Math.round(height * density));
        if (canvas.width === targetWidth && canvas.height === targetHeight) return;
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        lastPaintedFrame = -1;
        if (started && !document.hidden) paint(elapsed);
    };
    const syncVisibility = () => {
        if (frame !== undefined) window.cancelAnimationFrame(frame);
        if (timer !== undefined) window.clearTimeout(timer);
        frame = timer = undefined;
        lastTime = undefined;
        if (document.hidden) {
            pool.release(owner);
            requestedFrame = -1;
            windowKey = "";
        } else {
            // Fast unit switches never start their optional image downloads.
            timer = window.setTimeout(
                () => {
                    timer = undefined;
                    if (!stopped && !document.hidden) animate(performance.now());
                },
                started ? 0 : 120,
            );
        }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", syncVisibility);
    resize();
    syncVisibility();
    return () => {
        stopped = true;
        observer.disconnect();
        document.removeEventListener("visibilitychange", syncVisibility);
        if (frame !== undefined) window.cancelAnimationFrame(frame);
        if (timer !== undefined) window.clearTimeout(timer);
        pool.release(owner);
    };
}
