import { ColorMatrixFilter, type Filter, type Sprite } from "pixi.js";

// Match the existing base cutout's skin to the mean palette of the eight authored
// lab walk poses. Gain-only grading preserves black shadows, alpha and geometry.
export const ABOMINATION_BASE_COLOR_GAINS = [1.014815, 0.9578, 0.894565] as const;
let baseFilter: ColorMatrixFilter | undefined;

export const isAbominationBasePalette = (filter: Filter): boolean => filter === baseFilter;

export function syncAbominationBasePalette(sprite: Sprite, enabled: boolean): void {
    if (enabled && !baseFilter) {
        const [r, g, b] = ABOMINATION_BASE_COLOR_GAINS;
        baseFilter = new ColorMatrixFilter({ resolution: "inherit", antialias: "inherit" });
        baseFilter.matrix = [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];
    }
    if (!baseFilter) return;
    const installed = sprite.filters ?? [];
    if (installed.includes(baseFilter) === enabled) return;
    const remaining = installed.filter((filter) => filter !== baseFilter);
    sprite.filters = enabled ? [baseFilter, ...remaining] : remaining.length ? remaining : null;
}
