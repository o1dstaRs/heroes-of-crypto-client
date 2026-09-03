import type { Container, Filter } from "pixi.js";

type FilterHost = Pick<Container, "filters">;

/** Detach and release filters owned by a display surface before that surface is reused. */
export const destroyContainerFilters = (host: FilterHost): void => {
    const filters = host.filters ?? [];
    host.filters = [];
    for (const filter of new Set<Filter>(filters)) filter.destroy();
};
