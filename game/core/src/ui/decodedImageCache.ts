/**
 * Keep decoded sidebar bitmaps alive. A detached Image that has finished `decode()` is what lets the
 * next `<img>` with the same URL paint from the browser cache instead of decoding a 1144×1616 cutout
 * on the frame the player selects it.
 *
 * Faction backgrounds and glow masks are locked: there are only a handful and every card shares them.
 * Creature cutouts are capped so walking the roster cannot retain every full-size portrait at once.
 */

export interface PortraitImageStub {
    decoding: string;
    fetchPriority?: "high" | "low" | "auto";
    src: string;
    naturalWidth: number;
    decode?: () => Promise<void>;
    onload: (() => void) | null;
    onerror: (() => void) | null;
}

/** One roster band, plus the unit on screen. A full cutout is about 7 MB decoded. */
export const PORTRAIT_DECODE_CACHE_LIMIT = 18;
export const PORTRAIT_DECODE_CONCURRENCY = 2;

const retained = new Map<string, PortraitImageStub>();
const pending = new Map<string, Promise<boolean>>();
const loadingImages = new Map<string, PortraitImageStub>();
const pendingLocks = new Set<string>();
const locked = new Set<string>();
const pinned = new Set<string>();
const held = new Map<string, number>();
export interface PortraitImagePrefetch {
    src: string | undefined;
    lock?: boolean;
}

const defaultPrefetchOwner = {};
const defaultForegroundOwner = {};
const queued: Array<{ src: string; lock: boolean; owners: Set<object> }> = [];
const foreground = new Map<object, Set<string>>();
let active = 0;
let cacheEpoch = 0;

let createImage: (() => PortraitImageStub) | null = null;

export function installPortraitImageFactoryForTests(next: (() => PortraitImageStub) | null): void {
    createImage = next;
}

export function resetPortraitImageCacheForTests(): void {
    cacheEpoch += 1;
    retained.clear();
    pending.clear();
    loadingImages.clear();
    pendingLocks.clear();
    locked.clear();
    pinned.clear();
    held.clear();
    queued.length = 0;
    foreground.clear();
    active = 0;
    createImage = null;
}

const allocateImage = (): PortraitImageStub | null => {
    if (createImage) return createImage();
    if (typeof Image !== "function") return null;
    return new Image() as unknown as PortraitImageStub;
};

export function isDecodedImageReady(src: string | undefined): boolean {
    return !src || retained.has(src);
}

export function pinDecodedImages(srcs: Array<string | undefined>): void {
    pinned.clear();
    for (const src of srcs) {
        if (src) pinned.add(src);
    }
}

const creatureCount = (): number => {
    let count = 0;
    for (const src of retained.keys()) {
        if (!locked.has(src)) count += 1;
    }
    return count;
};

const evictOldestCreature = (): boolean => {
    for (const src of retained.keys()) {
        if (locked.has(src) || pinned.has(src) || held.has(src)) continue;
        retained.delete(src);
        return true;
    }
    return false;
};

const trim = (): void => {
    while (creatureCount() > PORTRAIT_DECODE_CACHE_LIMIT && evictOldestCreature()) {
        // Drop the oldest unpinned cutout until the band fits.
    }
};

const remember = (src: string, image: PortraitImageStub, lock: boolean): void => {
    if (image.naturalWidth <= 0) return;
    retained.delete(src);
    retained.set(src, image);
    if (lock) locked.add(src);
    trim();
};

/** Keep a pending pair through its React handoff without replacing the displayed portrait's pins. */
export function retainDecodedImages(srcs: readonly (string | undefined)[]): () => void {
    const sources = [...new Set(srcs.filter((src): src is string => !!src))];
    const epoch = cacheEpoch;
    let disposed = false;
    for (const src of sources) held.set(src, (held.get(src) ?? 0) + 1);
    return () => {
        if (disposed || epoch !== cacheEpoch) return;
        disposed = true;
        for (const src of sources) {
            const remaining = (held.get(src) ?? 0) - 1;
            if (remaining > 0) held.set(src, remaining);
            else held.delete(src);
        }
        trim();
    };
}

/** Replace only this owner's foreground wait; obsolete shared requests remain in flight. */
export function setDecodedImageForeground(owner: object, srcs: readonly (string | undefined)[]): void {
    const sources = new Set(srcs.filter((src): src is string => !!src && !retained.has(src)));
    if (sources.size > 0) foreground.set(owner, sources);
    else foreground.delete(owner);
}

export function clearDecodedImageForeground(owner: object): void {
    foreground.delete(owner);
    pump();
}

const markForeground = (src: string, owner: object): void => {
    const sources = foreground.get(owner) ?? new Set<string>();
    sources.add(src);
    foreground.set(owner, sources);
};

export function warmDecodedImage(
    src: string | undefined,
    options?: { lock?: boolean; priority?: "high" | "low"; foregroundOwner?: object },
): Promise<boolean> {
    if (!src) return Promise.resolve(false);
    const queuedIndex = queued.findIndex((job) => job.src === src);
    const shouldLock = !!options?.lock || (queuedIndex >= 0 && queued[queuedIndex].lock);
    if (queuedIndex >= 0) queued.splice(queuedIndex, 1);
    if (retained.has(src)) {
        const image = retained.get(src)!;
        retained.delete(src);
        retained.set(src, image);
        if (shouldLock) locked.add(src);
        return Promise.resolve(true);
    }
    const existing = pending.get(src);
    if (existing) {
        if (options?.priority === "high") {
            markForeground(src, options.foregroundOwner ?? defaultForegroundOwner);
            const loading = loadingImages.get(src);
            if (loading) loading.fetchPriority = "high";
        }
        if (shouldLock) {
            pendingLocks.add(src);
        }
        return existing;
    }
    const image = allocateImage();
    if (!image) return Promise.resolve(false);
    const epoch = cacheEpoch;
    if (options?.priority === "high") markForeground(src, options.foregroundOwner ?? defaultForegroundOwner);
    if (shouldLock) pendingLocks.add(src);
    loadingImages.set(src, image);

    const job = new Promise<boolean>((resolve) => {
        const finish = (ok: boolean) => {
            if (epoch !== cacheEpoch) {
                resolve(false);
                return;
            }
            pending.delete(src);
            loadingImages.delete(src);
            for (const [owner, sources] of foreground) {
                sources.delete(src);
                if (sources.size === 0) foreground.delete(owner);
            }
            if (ok) remember(src, image, pendingLocks.has(src));
            pendingLocks.delete(src);
            resolve(ok && image.naturalWidth > 0);
            pump();
        };
        image.decoding = "async";
        image.fetchPriority = options?.priority ?? "auto";
        image.src = src;
        if (typeof image.decode === "function") {
            image.decode().then(
                () => finish(true),
                () => finish(false),
            );
            return;
        }
        image.onload = () => finish(true);
        image.onerror = () => finish(false);
    });
    pending.set(src, job);
    return job;
}

const pump = (): void => {
    while (foreground.size === 0 && active < PORTRAIT_DECODE_CONCURRENCY && queued.length > 0) {
        const job = queued.shift()!;
        const epoch = cacheEpoch;
        active += 1;
        void warmDecodedImage(job.src, { lock: job.lock, priority: "low" }).finally(() => {
            if (epoch !== cacheEpoch) return;
            active -= 1;
            pump();
        });
    }
};

const queueImage = (request: PortraitImagePrefetch, owner: object): void => {
    const { src } = request;
    if (!src) return;
    if (retained.has(src)) {
        if (request.lock) locked.add(src);
        return;
    }
    const loading = pending.get(src);
    if (loading) {
        if (request.lock) pendingLocks.add(src);
        return;
    }
    const existing = queued.find((job) => job.src === src);
    if (existing) {
        existing.lock ||= !!request.lock;
        existing.owners.add(owner);
        return;
    }
    queued.push({ src, lock: !!request.lock, owners: new Set([owner]) });
};

/** Drop obsolete speculative work without interrupting any already-started or shared image. */
export function clearDecodedImagePrefetch(owner: object): void {
    for (let index = queued.length - 1; index >= 0; index -= 1) {
        queued[index].owners.delete(owner);
        if (queued[index].owners.size === 0) queued.splice(index, 1);
    }
}

/** Replace one roster or turn queue's band; other owners keep their requests. */
export function replaceDecodedImagePrefetch(owner: object, requests: readonly PortraitImagePrefetch[]): void {
    clearDecodedImagePrefetch(owner);
    for (const request of requests) queueImage(request, owner);
    pump();
}

/** Decode later, two at a time, so opening the roster does not decode every cutout on the click. */
export function enqueueDecodedImage(src: string | undefined, options?: { lock?: boolean }): void {
    queueImage({ src, ...options }, defaultPrefetchOwner);
    pump();
}
