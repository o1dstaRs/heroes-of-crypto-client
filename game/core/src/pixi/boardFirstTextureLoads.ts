import { isLazyBattlefieldCreatureAssetKey } from "./imageAssetTiers";

/**
 * Board-first loading. The immediate goal is always a playable game, and a creature without its board image is
 * simply missing from the board. So the image that puts a creature on the board starts downloading the moment it is
 * asked for, while any other on-demand texture (animation sheets, idle frames, spell and ability icons, effects)
 * waits until every board image already downloading has settled: on a slow connection the units come first and the
 * richer art streams in after. An extra never waits longer than EXTRA_TEXTURE_MAX_WAIT_MS, so a stalled board image
 * cannot starve it.
 *
 * A board image that fails is retried after boardImageRetryDelayMs (PixiScene.texAny), so a dropped download never
 * leaves a unit invisible for the rest of the match.
 */

export const EXTRA_TEXTURE_MAX_WAIT_MS = 10_000;
const BOARD_IMAGE_RETRY_BASE_MS = 1_000;
const BOARD_IMAGE_RETRY_MAX_MS = 15_000;

/** Every texture a creature can stand on the board with: approved figures, cutouts and the older chips. */
export const isBoardImageTextureKey = (key: string): boolean => isLazyBattlefieldCreatureAssetKey(key);

/** Wait before asking again after `failures` failed downloads: 1s, 2s, 4s… up to 15s. */
export const boardImageRetryDelayMs = (failures: number): number =>
    Math.min(BOARD_IMAGE_RETRY_MAX_MS, BOARD_IMAGE_RETRY_BASE_MS * 2 ** Math.max(0, failures - 1));

export interface BoardFirstLoads {
    /** Start a board image now; start anything else once the board images downloading now have settled. */
    load<T>(key: string, start: () => Promise<T>): Promise<T>;
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
    let waiters: Array<() => void> = [];

    const track = (download: Promise<unknown>): void => {
        inFlight.add(download);
        const settle = (): void => {
            inFlight.delete(download);
            if (inFlight.size === 0) {
                const ready = waiters;
                waiters = [];
                ready.forEach((resolve) => resolve());
            }
        };
        download.then(settle, settle);
    };

    const afterBoardImages = (): Promise<void> => {
        if (inFlight.size === 0) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            const timer = setTimeout(resolve, maxExtraWaitMs);
            waiters.push(() => {
                clearTimeout(timer);
                resolve();
            });
        });
    };

    return {
        load: <T>(key: string, start: () => Promise<T>): Promise<T> => {
            if (isBoardImage(key)) {
                const download = start();
                track(download);
                return download;
            }
            return afterBoardImages().then(start);
        },
        afterBoardImages,
        boardImagesInFlight: () => inFlight.size,
    };
};

/** The instance every scene loads through: downloads are shared across scenes, and so is their order. */
export const boardFirstTextureLoads = createBoardFirstLoads();
