import { getDecodedImage, isPortraitForegroundDecodePending, type PortraitImageStub } from "./decodedImageCache";

export interface SidebarPortraitPage {
    src: string;
    firstFrame: number;
    frameCount: number;
    cols: number;
    rows: number;
}

/** What the canvas draws: a decoded bitmap, or the borrowed first-frame poster until its bitmap is ready. */
export type SidebarPortraitDrawable = CanvasImageSource & { width: number; height: number; close?: () => void };

/**
 * Decode a downloaded page into an ImageBitmap off the main thread. The HTTP cache already holds the file
 * (the page's <img> request fetched it), so this reads it back and decodes it on a worker thread.
 */
export type PreparePortraitPage = (src: string) => Promise<SidebarPortraitDrawable>;

const prepareBitmap: PreparePortraitPage = async (src) => {
    const response = await fetch(src, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Portrait page request failed: ${response.status}`);
    return createImageBitmap(await response.blob());
};

type Entry = {
    src: string;
    owners: Set<object>;
    currentOwners: Set<object>;
    drawable?: SidebarPortraitDrawable;
    /** The drawable is the shared first-frame poster: never closed here, and replaced by a bitmap. */
    borrowedPoster?: boolean;
    loading?: PortraitImageStub;
    preparing?: boolean;
    used: number;
    retryAt: number;
};

/**
 * Current/lookahead pages share three download slots and a small return-to-unit cache.
 *
 * Pages are drawn as ImageBitmaps. A 2D canvas that draws an <img> decodes it again, synchronously on the
 * main thread, whenever the page is rasterized: with a page change every half second the playing portrait
 * cost a 33-36 ms main-thread stall twice a second for as long as a unit was selected (measured
 * 2026-11-20). A bitmap is decoded once, off the main thread, and draws in well under a millisecond.
 */
export class SidebarPortraitPagePool {
    private readonly entries = new Map<string, Entry>();
    private readonly active = new Set<Entry>();
    private timer?: ReturnType<typeof setTimeout>;
    public constructor(
        private readonly createImage: () => PortraitImageStub = () => new Image() as unknown as PortraitImageStub,
        private readonly canDecode: () => boolean = () => !isPortraitForegroundDecodePending(),
        private readonly now: () => number = () => performance.now(),
        private readonly idleBytes = 16 * 1024 * 1024,
        private readonly prepare: PreparePortraitPage = prepareBitmap,
    ) {}
    public update(owner: object, pages: readonly SidebarPortraitPage[]): void {
        const wanted = new Set(pages.map((page) => page.src));
        // Acquire before releasing so a shared page cannot be aborted during a handoff.
        for (const src of wanted) {
            let entry = this.entries.get(src);
            if (!entry) {
                entry = { src, owners: new Set(), currentOwners: new Set(), used: this.now(), retryAt: 0 };
                // Frame zero was decoded as the poster before this canvas mounted. Draw it at once and
                // swap in its bitmap when that is ready.
                const poster = getDecodedImage(src);
                if (poster) {
                    entry.drawable = poster as unknown as SidebarPortraitDrawable;
                    entry.borrowedPoster = true;
                }
                this.entries.set(src, entry);
            }
            entry.owners.add(owner);
        }
        for (const entry of this.entries.values()) {
            if (!wanted.has(entry.src)) entry.owners.delete(owner);
            if (entry.src === pages[0]?.src) entry.currentOwners.add(owner);
            else entry.currentOwners.delete(owner);
            if (entry.loading) entry.loading.fetchPriority = entry.currentOwners.size ? "high" : "low";
        }
        this.trim();
        this.pump();
    }
    public release(owner: object): void {
        for (const entry of this.entries.values()) {
            entry.owners.delete(owner);
            entry.currentOwners.delete(owner);
        }
        this.trim();
        this.pump();
    }
    public get(src: string): SidebarPortraitDrawable | undefined {
        const entry = this.entries.get(src);
        if (entry?.drawable) {
            entry.used = this.now();
            return entry.drawable;
        }
        return undefined;
    }
    public get decodedBytes(): number {
        return [...this.entries.values()].reduce((sum, entry) => sum + this.bytes(entry), 0);
    }
    private bytes(entry: Entry): number {
        return entry.drawable ? entry.drawable.width * entry.drawable.height * 4 : 0;
    }
    private drop(entry: Entry): void {
        this.entries.delete(entry.src);
        if (!entry.borrowedPoster) entry.drawable?.close?.();
        entry.drawable = undefined;
    }
    private trim(): void {
        const idle: Entry[] = [];
        for (const entry of this.entries.values()) {
            if (entry.owners.size) continue;
            if (entry.loading) {
                // Chromium can leave a cancelled request pending. Release our slot now; a late
                // completion cannot reclaim this removed entry.
                this.entries.delete(entry.src);
                this.active.delete(entry);
                entry.loading.src = "";
                entry.loading = undefined;
            } else if (entry.preparing) {
                // The bitmap still decoding is closed when it lands (see finishPrepare).
                this.active.delete(entry);
                this.drop(entry);
            } else if (entry.drawable) idle.push(entry);
            else this.entries.delete(entry.src);
        }
        let bytes = idle.reduce((sum, entry) => sum + this.bytes(entry), 0);
        for (const entry of idle.sort((a, b) => a.used - b.used)) {
            if (bytes <= this.idleBytes) break;
            bytes -= this.bytes(entry);
            this.drop(entry);
        }
    }
    private schedule(delay: number): void {
        if (this.timer !== undefined) return;
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.pump();
        }, delay);
    }
    private pump(): void {
        const waiting = [...this.entries.values()].filter(
            (entry) =>
                entry.owners.size && !entry.loading && !entry.preparing && (!entry.drawable || entry.borrowedPoster),
        );
        if (!waiting.length) {
            if (this.timer !== undefined) clearTimeout(this.timer);
            this.timer = undefined;
            return;
        }
        if (this.active.size >= 3) return;
        if (!this.canDecode()) {
            this.schedule(40);
            return;
        }
        // A visible frame must not wait behind speculative pages from a held portrait.
        const next = waiting
            .sort((a, b) => Number(b.currentOwners.size > 0) - Number(a.currentOwners.size > 0))
            .find((entry) => entry.retryAt <= this.now());
        if (!next) {
            this.schedule(Math.max(40, Math.min(...waiting.map((entry) => entry.retryAt - this.now()))));
            return;
        }
        this.active.add(next);
        if (next.borrowedPoster) {
            // The poster's file is already downloaded; only its bitmap is missing.
            this.startPrepare(next);
        } else {
            const image = this.createImage();
            next.loading = image;
            image.decoding = "async";
            image.fetchPriority = next.currentOwners.size ? "high" : "low";
            // Wait for the download only: decoding through the element would decode the page a second
            // time, and the canvas never draws it.
            const loaded = new Promise<void>((resolve, reject) => {
                image.onload = () => resolve();
                image.onerror = () => reject(new Error("Portrait page failed"));
            });
            image.src = next.src;
            void loaded.then(
                () => this.finishDownload(next, image, image.naturalWidth > 0),
                () => this.finishDownload(next, image, false),
            );
        }
        // Network latency used to serialize every multi-megabyte page with its predecessor.
        // Overlap the bounded lookahead window; decoded memory still follows the same page budget.
        this.pump();
    }
    private finishDownload(entry: Entry, image: PortraitImageStub, ready: boolean): void {
        if (entry.loading !== image) return;
        entry.loading = undefined;
        // The element only carried the request; the bitmap is decoded from the cached response.
        image.src = "";
        if (this.entries.get(entry.src) !== entry || !entry.owners.size) {
            this.active.delete(entry);
        } else if (ready) {
            this.startPrepare(entry);
            return;
        } else {
            this.active.delete(entry);
            entry.retryAt = this.now() + 2000;
        }
        this.trim();
        this.pump();
    }
    private startPrepare(entry: Entry): void {
        entry.preparing = true;
        void this.prepare(entry.src).then(
            (bitmap) => this.finishPrepare(entry, bitmap),
            () => this.finishPrepare(entry, undefined),
        );
    }
    private finishPrepare(entry: Entry, bitmap: SidebarPortraitDrawable | undefined): void {
        entry.preparing = false;
        this.active.delete(entry);
        if (this.entries.get(entry.src) !== entry || !entry.owners.size) {
            bitmap?.close?.();
        } else if (bitmap) {
            if (!entry.borrowedPoster) entry.drawable?.close?.();
            entry.drawable = bitmap;
            entry.borrowedPoster = false;
            entry.used = this.now();
        } else {
            // A poster keeps drawing meanwhile; either way the bitmap is retried later.
            entry.retryAt = this.now() + 2000;
        }
        this.trim();
        this.pump();
    }
}

export const sidebarPortraitPagePool = new SidebarPortraitPagePool();
