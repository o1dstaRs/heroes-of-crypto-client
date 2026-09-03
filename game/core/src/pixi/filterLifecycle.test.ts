import { expect, test } from "bun:test";
import type { Container, Filter } from "pixi.js";

import { destroyContainerChildren, destroyContainerFilters } from "./filterLifecycle";

test("detaches and destroys each container filter once", () => {
    const destroyCalls = [0, 0];
    const filters = destroyCalls.map((_, index) => ({ destroy: () => destroyCalls[index]++ })) as unknown as Filter[];
    const host = { filters: [filters[0], filters[1], filters[0]] } as Pick<Container, "filters">;

    destroyContainerFilters(host);
    destroyContainerFilters(host);

    expect(host.filters).toEqual([]);
    expect(destroyCalls).toEqual([1, 1]);
});

test("destroys every detached child subtree while preserving its host", () => {
    const destroyOptions: unknown[] = [];
    const children = [
        { destroy: (options?: unknown) => destroyOptions.push(options) },
        { destroy: (options?: unknown) => destroyOptions.push(options) },
    ];
    let removeCalls = 0;
    const host = {
        removeChildren: () => {
            removeCalls += 1;
            return children;
        },
    };

    destroyContainerChildren(host);

    expect(removeCalls).toBe(1);
    expect(destroyOptions).toEqual([{ children: true }, { children: true }]);
});
