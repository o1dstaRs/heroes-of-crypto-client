import { isPortraitForegroundDecodePending, type PortraitImageStub } from "./decodedImageCache";

export interface SidebarPortraitPage {
    src: string;
    firstFrame: number;
    frameCount: number;
    cols: number;
    rows: number;
}

type Entry = {
    src: string;
    owners: Set<object>;
    currentOwners: Set<object>;
    image?: PortraitImageStub;
    loading?: PortraitImageStub;
    used: number;
    retryAt: number;
};

/** Current/lookahead pages share three download slots and a small return-to-unit cache. */
export class SidebarPortraitPagePool {
    private readonly entries = new Map<string, Entry>();
    private readonly active = new Set<Entry>();
    private timer?: ReturnType<typeof setTimeout>;
    public constructor(
        private readonly createImage: () => PortraitImageStub = () => new Image() as unknown as PortraitImageStub,
        private readonly canDecode: () => boolean = () => !isPortraitForegroundDecodePending(),
        private readonly now: () => number = () => performance.now(),
        private readonly idleBytes = 16 * 1024 * 1024,
    ) {}
    public update(owner: object, pages: readonly SidebarPortraitPage[]): void {
        const wanted = new Set(pages.map((page) => page.src));
        // Acquire before releasing so a shared page cannot be aborted during a handoff.
        for (const src of wanted) {
            let entry = this.entries.get(src);
            if (!entry) {
                entry = { src, owners: new Set(), currentOwners: new Set(), used: this.now(), retryAt: 0 };
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
    public get(src: string): HTMLImageElement | undefined {
        const entry = this.entries.get(src);
        if (entry?.image) {
            entry.used = this.now();
            return entry.image as HTMLImageElement;
        }
        return undefined;
    }
    public get decodedBytes(): number {
        return [...this.entries.values()].reduce((sum, entry) => sum + this.bytes(entry), 0);
    }
    private bytes(entry: Entry): number {
        return entry.image ? entry.image.naturalWidth * (entry.image.naturalHeight ?? 0) * 4 : 0;
    }
    private trim(): void {
        const idle: Entry[] = [];
        for (const entry of this.entries.values()) {
            if (entry.owners.size) continue;
            if (entry.loading) {
                // Chromium can leave decode() pending after an in-flight request is cancelled.
                // Release our slot now; a late completion cannot reclaim this removed entry.
                this.entries.delete(entry.src);
                this.active.delete(entry);
                entry.loading.src = "";
                entry.loading = undefined;
            } else if (entry.image) idle.push(entry);
            else this.entries.delete(entry.src);
        }
        let bytes = idle.reduce((sum, entry) => sum + this.bytes(entry), 0);
        for (const entry of idle.sort((a, b) => a.used - b.used)) {
            if (bytes <= this.idleBytes) break;
            bytes -= this.bytes(entry);
            this.entries.delete(entry.src);
            entry.image!.src = "";
            entry.image = undefined;
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
            (entry) => entry.owners.size && !entry.image && !entry.loading,
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
        const image = this.createImage();
        this.active.add(next);
        next.loading = image;
        image.decoding = "async";
        image.fetchPriority = next.currentOwners.size ? "high" : "low";
        image.src = next.src;
        const loaded =
            typeof image.decode === "function"
                ? image.decode()
                : new Promise<void>((resolve, reject) => {
                      image.onload = resolve;
                      image.onerror = () => reject(new Error("Portrait page failed"));
                  });
        void loaded.then(
            () => this.finish(next, image, image.naturalWidth > 0),
            () => this.finish(next, image, false),
        );
        // Network latency used to serialize every multi-megabyte page with its predecessor.
        // Overlap the bounded lookahead window; decoded memory still follows the same page budget.
        this.pump();
    }
    private finish(entry: Entry, image: PortraitImageStub, ready: boolean): void {
        this.active.delete(entry);
        entry.loading = undefined;
        if (this.entries.get(entry.src) === entry && entry.owners.size) {
            if (ready) {
                entry.image = image;
                entry.used = this.now();
            } else entry.retryAt = this.now() + 2000;
        } else image.src = "";
        this.trim();
        this.pump();
    }
}

export const sidebarPortraitPagePool = new SidebarPortraitPagePool();
