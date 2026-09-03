import type { Container, DestroyOptions, Filter } from "pixi.js";

type FilterHost = Pick<Container, "filters">;
type DestroyableChild = {
    destroy(options?: DestroyOptions): void;
};
type ChildHost = {
    removeChildren(): DestroyableChild[];
};

/** Detach and release filters owned by a display surface before that surface is reused. */
export const destroyContainerFilters = (host: FilterHost): void => {
    const filters = host.filters ?? [];
    host.filters = [];
    for (const filter of new Set<Filter>(filters)) filter.destroy();
};

/**
 * Empty a persistent Pixi layer without destroying the layer itself.
 *
 * The camera's cursor overlay survives scene replacement, while everything placed inside it belongs to
 * the outgoing scene. Container.removeChildren() only detaches those objects; explicitly destroying each
 * subtree releases Text canvases, geometry buffers, and event handlers before the next fight adds its own.
 */
export const destroyContainerChildren = (host: ChildHost): void => {
    for (const child of host.removeChildren()) child.destroy({ children: true });
};
