import { Assets, Rectangle, Texture } from "pixi.js";
import { images } from "../imageAssets";

export interface ArbalesterIdlePage {
    imageKey: string;
    firstFrame: number;
    frameCount: number;
    cols: number;
    rows: number;
    width: number;
    height: number;
}

export interface ArbalesterIdlePages {
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    durations: readonly number[];
    pages: readonly ArbalesterIdlePage[];
}

/** Reject partial/stale page manifests rather than sampling outside a decoded texture. */
export function arbalesterIdlePages(meta: unknown): ArbalesterIdlePages | undefined {
    if (!meta || typeof meta !== "object") return;
    const value = meta as Record<string, unknown>;
    const { frameWidth, frameHeight, frameCount, pages } = value;
    if (frameWidth !== 384 || frameHeight !== 384 || !Number.isInteger(frameCount) || Number(frameCount) < 1) return;
    if (!Array.isArray(pages) || !pages.length) return;
    let expected = 0;
    const checked: ArbalesterIdlePage[] = [];
    for (const raw of pages) {
        if (!raw || typeof raw !== "object") return;
        const page = raw as ArbalesterIdlePage;
        if (
            !/^arbalester_idle_page_\d{2}_atlas$/.test(page.imageKey) ||
            page.firstFrame !== expected ||
            ![page.frameCount, page.cols, page.rows].every((number) => Number.isInteger(number) && number > 0) ||
            page.frameCount > page.cols * page.rows ||
            page.width !== page.cols * frameWidth ||
            page.height !== page.rows * frameHeight ||
            page.width > 4096 ||
            page.height > 4096
        )
            return;
        checked.push({ ...page });
        expected += page.frameCount;
    }
    if (expected !== frameCount || new Set(checked.map((page) => page.imageKey)).size !== checked.length) return;
    const durations = Array.isArray(value.frameDurationsMs)
        ? value.frameDurationsMs
        : Array.from({ length: Number(frameCount) }, () => 1000 / Number(value.fps));
    if (durations.length !== frameCount || !durations.every((duration) => Number.isFinite(duration) && duration > 0))
        return;
    return { frameWidth, frameHeight, frameCount: Number(frameCount), durations: [...durations], pages: checked };
}

export interface ArbalesterPageResource {
    frames: readonly Texture[];
    unload(): Promise<void>;
}

type PageLoader = (page: ArbalesterIdlePage, format: ArbalesterIdlePages) => Promise<ArbalesterPageResource>;
interface PageEntry {
    owners: Set<symbol>;
    resource?: ArbalesterPageResource;
    loading?: Promise<void>;
    unloading?: Promise<void>;
    retryAt: number;
    page: ArbalesterIdlePage;
    format: ArbalesterIdlePages;
}

/** Shared leases keep one stack from unloading another stack's visible page. */
export class ArbalesterIdlePagePool {
    private readonly entries = new Map<string, PageEntry>();
    public constructor(
        private readonly loader: PageLoader,
        private readonly now = () => performance.now(),
    ) {}
    public retain(page: ArbalesterIdlePage, format: ArbalesterIdlePages, owner: symbol): void {
        let entry = this.entries.get(page.imageKey);
        if (!entry) {
            entry = { owners: new Set(), retryAt: 0, page, format };
            this.entries.set(page.imageKey, entry);
        }
        entry.owners.add(owner);
        this.load(entry);
    }
    public frame(page: ArbalesterIdlePage, localFrame: number): Texture | undefined {
        const entry = this.entries.get(page.imageKey);
        if (!entry) return;
        this.load(entry);
        return entry.resource?.frames[localFrame];
    }
    public release(page: ArbalesterIdlePage, owner: symbol): void {
        const entry = this.entries.get(page.imageKey);
        if (!entry) return;
        entry.owners.delete(owner);
        if (!entry.owners.size) this.evict(entry);
    }
    private load(entry: PageEntry): void {
        if (!entry.owners.size || entry.resource || entry.loading || entry.unloading || this.now() < entry.retryAt)
            return;
        entry.loading = Promise.resolve()
            .then(() => (entry.owners.size ? this.loader(entry.page, entry.format) : undefined))
            .then((resource) => {
                entry.resource = resource;
            })
            .catch(() => {
                entry.retryAt = this.now() + 1000;
            })
            .finally(() => {
                entry.loading = undefined;
                if (!entry.owners.size) this.evict(entry);
            });
    }
    private evict(entry: PageEntry): void {
        if (entry.loading || entry.unloading || entry.owners.size) return;
        const resource = entry.resource;
        entry.resource = undefined;
        if (!resource) {
            this.entries.delete(entry.page.imageKey);
            return;
        }
        // A unit can reclaim this entry while its previous decode is being released. Wait for that
        // unload before loading again, otherwise Pixi may return the texture that is about to die.
        entry.unloading = Promise.resolve()
            .then(() => resource.unload())
            .catch(() => undefined)
            .finally(() => {
                entry.unloading = undefined;
                if (entry.owners.size) this.load(entry);
                else this.entries.delete(entry.page.imageKey);
            });
    }
}

const sharedPagePool = new ArbalesterIdlePagePool(async (page, format) => {
    const url = (images as Record<string, string>)[page.imageKey];
    if (!url) throw new Error(`Missing native animation page: ${page.imageKey}`);
    const parent = await Assets.load<Texture>(url);
    if (parent.width !== page.width || parent.height !== page.height) {
        await Assets.unload(url);
        throw new Error(`Native animation page dimensions differ: ${page.imageKey}`);
    }
    parent.source.scaleMode = "linear";
    const frames = Array.from(
        { length: page.frameCount },
        (_, index) =>
            new Texture({
                source: parent.source,
                frame: new Rectangle(
                    (index % page.cols) * format.frameWidth,
                    Math.floor(index / page.cols) * format.frameHeight,
                    format.frameWidth,
                    format.frameHeight,
                ),
            }),
    );
    return {
        frames,
        async unload() {
            for (const frame of frames) frame.destroy(false);
            await Assets.unload(url);
        },
    };
});

/** Keeps current/next pages; a late decode holds the last valid pose rather than flashing a placeholder. */
export class ArbalesterIdlePager {
    private readonly owner = Symbol("arbalester-idle");
    private readonly retained = new Set<number>();
    private readonly ends: number[];
    private readonly duration: number;
    private displayedPage?: number;
    private disposed = false;
    public constructor(
        public readonly format: ArbalesterIdlePages,
        private readonly pool = sharedPagePool,
    ) {
        let total = 0;
        this.ends = format.durations.map((duration) => (total += duration));
        this.duration = total;
        this.retain(0);
        this.retain(1 % format.pages.length);
    }
    public frameIndex(elapsedMs: number): number {
        const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) % this.duration;
        let low = 0;
        let high = this.ends.length - 1;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (elapsed < this.ends[middle]) high = middle;
            else low = middle + 1;
        }
        return low;
    }
    public showFrame(elapsedMs: number, apply: (texture: Texture, frameIndex: number) => void): boolean {
        if (this.disposed) return false;
        const frame = this.frameIndex(elapsedMs);
        const pageIndex = this.format.pages.findIndex((page) => frame < page.firstFrame + page.frameCount);
        const nextIndex = (pageIndex + 1) % this.format.pages.length;
        this.retain(pageIndex);
        this.retain(nextIndex);
        const page = this.format.pages[pageIndex];
        const texture = this.pool.frame(page, frame - page.firstFrame);
        if (texture && !texture.destroyed) {
            apply(texture, frame);
            this.displayedPage = pageIndex;
        }
        for (const retained of this.retained) {
            if (retained === pageIndex || retained === nextIndex || retained === this.displayedPage) continue;
            this.pool.release(this.format.pages[retained], this.owner);
            this.retained.delete(retained);
        }
        return !!texture && !texture.destroyed;
    }
    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const index of this.retained) this.pool.release(this.format.pages[index], this.owner);
        this.retained.clear();
    }
    private retain(index: number): void {
        this.retained.add(index);
        this.pool.retain(this.format.pages[index], this.format, this.owner);
    }
}
