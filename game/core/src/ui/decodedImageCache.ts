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
const locked = new Set<string>();
const pinned = new Set<string>();
const queued: Array<{ src: string; lock: boolean }> = [];
let active = 0;

let createImage: (() => PortraitImageStub) | null = null;

export function installPortraitImageFactoryForTests(next: (() => PortraitImageStub) | null): void {
    createImage = next;
}

export function resetPortraitImageCacheForTests(): void {
    retained.clear();
    pending.clear();
    locked.clear();
    pinned.clear();
    queued.length = 0;
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
        if (locked.has(src) || pinned.has(src)) continue;
        retained.delete(src);
        return true;
    }
    return false;
};

const remember = (src: string, image: PortraitImageStub, lock: boolean): void => {
    if (image.naturalWidth <= 0) return;
    retained.delete(src);
    retained.set(src, image);
    if (lock) locked.add(src);
    while (creatureCount() > PORTRAIT_DECODE_CACHE_LIMIT && evictOldestCreature()) {
        // Drop the oldest unpinned cutout until the band fits.
    }
};

export function warmDecodedImage(src: string | undefined, options?: { lock?: boolean }): Promise<boolean> {
    if (!src) return Promise.resolve(false);
    const queuedIndex = queued.findIndex((job) => job.src === src);
    if (queuedIndex >= 0) queued.splice(queuedIndex, 1);
    if (retained.has(src)) {
        const image = retained.get(src)!;
        retained.delete(src);
        retained.set(src, image);
        if (options?.lock) locked.add(src);
        return Promise.resolve(true);
    }
    const existing = pending.get(src);
    if (existing) {
        if (options?.lock) {
            return existing.then((ok) => {
                if (ok) locked.add(src);
                return ok;
            });
        }
        return existing;
    }
    const image = allocateImage();
    if (!image) return Promise.resolve(false);

    const job = new Promise<boolean>((resolve) => {
        const finish = (ok: boolean) => {
            pending.delete(src);
            if (ok) remember(src, image, !!options?.lock);
            resolve(ok && image.naturalWidth > 0);
        };
        image.decoding = "async";
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
    while (active < PORTRAIT_DECODE_CONCURRENCY && queued.length > 0) {
        const job = queued.shift()!;
        active += 1;
        void warmDecodedImage(job.src, { lock: job.lock }).finally(() => {
            active -= 1;
            pump();
        });
    }
};

/** Decode later, two at a time, so opening the roster does not decode every cutout on the click. */
export function enqueueDecodedImage(src: string | undefined, options?: { lock?: boolean }): void {
    if (!src || retained.has(src) || pending.has(src) || queued.some((job) => job.src === src)) return;
    queued.push({ src, lock: !!options?.lock });
    pump();
}
