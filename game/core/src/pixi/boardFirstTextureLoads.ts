import { isLazyBattlefieldCreatureAssetKey } from "./imageAssetTiers";

/**
 * Board-first loading. The immediate goal is always a playable game, and a creature without its board image is
 * simply missing from the board. So the image that puts a creature on the board starts downloading the moment it is
 * asked for. Visible roster portraits and controls have a separate bounded lane: they must not wait behind
 * optional animation sheets or a board image that has stalled. Optional art waits for board images and has
 * its own smaller concurrency limit. A newer visible roster takes precedence over queued cards from an old level.
 *
 * A board image that fails is retried after boardImageRetryDelayMs (PixiScene.texAny), so a dropped download never
 * leaves a unit invisible for the rest of the match.
 */

export const EXTRA_TEXTURE_MAX_WAIT_MS = 10_000;
// Keep animation sheets and optional icons from filling every browser connection before the
// player selects another creature. Board-first ordering alone cannot bypass downloads already started.
export const MAX_CONCURRENT_EXTRA_TEXTURE_LOADS = 2;
export const MAX_CONCURRENT_VISIBLE_TEXTURE_LOADS = 4;
const BOARD_IMAGE_RETRY_BASE_MS = 1_000;
const BOARD_IMAGE_RETRY_MAX_MS = 15_000;

/** Every texture a creature can stand on the board with: approved figures, cutouts and the older chips. */
export const isBoardImageTextureKey = (key: string): boolean => isLazyBattlefieldCreatureAssetKey(key);

/** Wait before asking again after `failures` failed downloads: 1s, 2s, 4s… up to 15s. */
export const boardImageRetryDelayMs = (failures: number): number =>
    Math.min(BOARD_IMAGE_RETRY_MAX_MS, BOARD_IMAGE_RETRY_BASE_MS * 2 ** Math.max(0, failures - 1));

export interface TextureLoadOptions {
    priority?: "visible";
    /** The current visible surface; replacing this token puts its queued requests ahead of the old surface. */
    group?: object;
}

export interface BoardFirstLoads {
    /** Board images start now; visible art bypasses optional work; optional art waits for board images. */
    load<T>(key: string, start: () => Promise<T>, options?: TextureLoadOptions): Promise<T>;
    /** Move a shared queued request into the current visible lane without starting a duplicate download. */
    promote(download: Promise<unknown>, options: TextureLoadOptions): void;
    /** Resolves once no board image is downloading, or after EXTRA_TEXTURE_MAX_WAIT_MS at the latest. */
    afterBoardImages(): Promise<void>;
    /** Board images downloading right now. */
    boardImagesInFlight(): number;
}

export const createBoardFirstLoads = (
    isBoardImage: (key: string) => boolean = isBoardImageTextureKey,
    maxExtraWaitMs: number = EXTRA_TEXTURE_MAX_WAIT_MS,
): BoardFirstLoads => {
    const inFlight = new Set<Promise<unknown>>();
    const boardWaiters = new Set<() => void>();
    let activeExtras = 0;
    let activeVisible = 0;
    let currentVisibleGroup: object | undefined;
    interface QueuedLoad {
        start: () => Promise<unknown>;
        resolve: (value: unknown) => void;
        reject: (error: unknown) => void;
        result: Promise<unknown>;
        options: TextureLoadOptions;
        state: "queued" | "waiting-board" | "started";
        cancelBoardWait?: () => void;
    }
    const queuedLoads = new Map<Promise<unknown>, QueuedLoad>();
    const extraQueue: QueuedLoad[] = [];
    const visibleQueue: QueuedLoad[] = [];

    const track = (download: Promise<unknown>): void => {
        inFlight.add(download);
        const settle = (): void => {
            inFlight.delete(download);
            if (inFlight.size === 0) {
                [...boardWaiters].forEach((resolve) => resolve());
            }
        };
        download.then(settle, settle);
    };

    const waitForBoardImages = (): { promise: Promise<void>; cancel: () => void } => {
        if (inFlight.size === 0) {
            return { promise: Promise.resolve(), cancel: () => undefined };
        }
        let finish!: () => void;
        const promise = new Promise<void>((resolve) => {
            const timer = setTimeout(() => finish(), maxExtraWaitMs);
            finish = () => {
                clearTimeout(timer);
                boardWaiters.delete(finish);
                resolve();
            };
            boardWaiters.add(finish);
        });
        return { promise, cancel: finish };
    };

    const startLoad = (job: QueuedLoad, visible: boolean): void => {
        job.state = "started";
        queuedLoads.delete(job.result);
        // Normalize a synchronous loader failure too, so it cannot leak a concurrency slot.
        void Promise.resolve()
            .then(job.start)
            .then(job.resolve, job.reject)
            .finally(() => {
                if (visible) activeVisible--;
                else activeExtras--;
                pumpQueues();
            });
    };

    const pumpQueues = (): void => {
        while (activeVisible < MAX_CONCURRENT_VISIBLE_TEXTURE_LOADS && visibleQueue.length > 0) {
            const preferred = visibleQueue.findIndex((job) => job.options.group === currentVisibleGroup);
            const [job] = visibleQueue.splice(preferred < 0 ? 0 : preferred, 1);
            activeVisible++;
            startLoad(job, true);
        }
        while (activeExtras < MAX_CONCURRENT_EXTRA_TEXTURE_LOADS && extraQueue.length > 0) {
            const job = extraQueue.shift()!;
            activeExtras++;
            job.state = "waiting-board";
            void Promise.resolve().then(async () => {
                if (job.state !== "waiting-board") return;
                // A board image requested later in the same sync pass still goes first.
                const wait = waitForBoardImages();
                job.cancelBoardWait = wait.cancel;
                await wait.promise;
                // Promoting an optional request releases its reservation and cancels this wait.
                if (job.state !== "waiting-board") return;
                job.cancelBoardWait = undefined;
                startLoad(job, false);
            });
        }
    };

    return {
        load: <T>(key: string, start: () => Promise<T>, options: TextureLoadOptions = {}): Promise<T> => {
            if (isBoardImage(key)) {
                const download = start();
                track(download);
                return download;
            }
            let resolve!: (value: unknown) => void;
            let reject!: (error: unknown) => void;
            const result = new Promise<T>((res, rej) => {
                resolve = res as (value: unknown) => void;
                reject = rej;
            });
            const job: QueuedLoad = { start, resolve, reject, result, options, state: "queued" };
            queuedLoads.set(result, job);
            if (options.priority === "visible") {
                currentVisibleGroup = options.group;
                visibleQueue.push(job);
            } else extraQueue.push(job);
            pumpQueues();
            return result;
        },
        promote: (download, options) => {
            if (options.priority !== "visible") return;
            currentVisibleGroup = options.group;
            const job = queuedLoads.get(download);
            if (!job) return;
            if (job.options.priority !== "visible") {
                if (job.state === "waiting-board") {
                    job.state = "queued";
                    activeExtras--;
                    job.cancelBoardWait?.();
                    job.cancelBoardWait = undefined;
                } else {
                    const index = extraQueue.indexOf(job);
                    if (index >= 0) extraQueue.splice(index, 1);
                }
                visibleQueue.push(job);
            }
            job.options = options;
            pumpQueues();
        },
        afterBoardImages: () => waitForBoardImages().promise,
        boardImagesInFlight: () => inFlight.size,
    };
};

/** The instance every scene loads through: downloads are shared across scenes, and so is their order. */
export const boardFirstTextureLoads = createBoardFirstLoads();
