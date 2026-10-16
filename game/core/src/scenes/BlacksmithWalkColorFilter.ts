import { ColorMatrixFilter, type Filter, type Sprite } from "pixi.js";

// Match detail-locked-v3's opaque RGB mean and 95th-percentile highlights to
// blacksmith_battlefield_side_right_distance_readable_v1. One transfer per pose
// removes exposure/white-balance pumping without changing texture geometry or alpha.
export const BLACKSMITH_WALK_COLOR_TRANSFERS = [
    [1.015754, 0.992887, 0.957396, -0.069944, -0.042986, -0.026007],
    [1.021738, 0.981424, 0.890802, -0.078175, -0.047969, -0.017556],
    [0.986067, 0.967773, 0.936947, -0.087657, -0.055174, -0.034274],
    [0.974947, 0.959657, 0.929679, -0.048786, -0.027724, -0.012312],
    [0.972899, 0.939993, 0.904771, -0.077846, -0.042192, -0.021293],
    [0.911759, 0.863491, 0.819123, -0.050169, -0.026466, -0.018717],
    [0.956041, 0.971064, 0.938759, -0.046539, -0.026684, -0.005754],
    [0.981626, 0.968183, 0.933958, -0.057402, -0.028842, -0.014426],
] as const;

const sharedFilters = new Map<number, ColorMatrixFilter>();
const ownedFilters = new Set<Filter>();

/** Immutable filters can be shared by stacks displaying the same pose. */
export function blacksmithWalkColorFilter(frameIndex: number): ColorMatrixFilter | undefined {
    const transfer = BLACKSMITH_WALK_COLOR_TRANSFERS[frameIndex];
    if (!transfer) return undefined;
    let filter = sharedFilters.get(frameIndex);
    if (!filter) {
        const [r, g, b, ro, go, bo] = transfer;
        filter = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
        filter.matrix = [r, 0, 0, 0, ro, 0, g, 0, 0, go, 0, 0, b, 0, bo, 0, 0, 0, 1, 0];
        sharedFilters.set(frameIndex, filter);
        ownedFilters.add(filter);
    }
    return filter;
}

/** Swap grade with the texture, before any render; preserve unrelated gameplay filters. */
export function syncBlacksmithWalkColorFilter(sprite: Sprite, frameIndex: number): void {
    const desired = blacksmithWalkColorFilter(frameIndex);
    const installed = sprite.filters ?? [];
    const current = installed.find((filter) => ownedFilters.has(filter));
    if (current === desired) return;
    const remaining = installed.filter((filter) => !ownedFilters.has(filter));
    sprite.filters = desired ? [desired, ...remaining] : remaining.length ? remaining : null;
}
