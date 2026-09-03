import { expect, test } from "bun:test";

import { SmokeCloudLayer } from "./SmokeCloudLayer";
import { WindLayer } from "./WindLayer";

test.each([
    ["smoke cloud", () => new SmokeCloudLayer()],
    ["wind", () => new WindLayer()],
])("%s filter is released when the scene destroys its container", (_name, createLayer) => {
    const layer = createLayer();
    const internals = layer as unknown as { filter?: { destroy(): void } };
    internals.filter?.destroy();
    let destroyCalls = 0;
    internals.filter = { destroy: () => destroyCalls++ };

    layer.getContainer().destroy({ children: true });

    expect(destroyCalls).toBe(1);
    expect(internals.filter).toBeUndefined();
});
