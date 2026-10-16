import { expect, test } from "bun:test";
import type { Graphics } from "pixi.js";

import { SmokeCloudLayer, type ISmokeCloudCell } from "./SmokeCloudLayer";

const cloud = { x: 5, y: 6, l: 3 };
const project = ({ x, y }: { x: number; y: number }) => ({ x: x * 64, y: y * 64 });
const advance = (layer: SmokeCloudLayer, frames: number, cells: readonly ISmokeCloudCell[]) => {
    for (let frame = 0; frame < frames; frame++) layer.update(1 / 240, cells, 64, project);
};
const hasSmoke = (layer: SmokeCloudLayer) =>
    layer.getContainer().getChildAt<Graphics>(0).context.instructions.length > 0;

test("dispersed smoke finishes fading within 0.8 real seconds at the scene's 60 Hz timestep", () => {
    const layer = new SmokeCloudLayer();
    advance(layer, 180, [cloud]);
    expect(hasSmoke(layer)).toBe(true);

    advance(layer, 30, []);
    expect(hasSmoke(layer)).toBe(true);
    advance(layer, 16, []);
    expect(hasSmoke(layer)).toBe(false);

    // Repeated empty ranked snapshots cannot revive geometry after the fade completes.
    advance(layer, 60, []);
    expect(hasSmoke(layer)).toBe(false);
    layer.destroy();
});

test("a cloud recast during fadeout stays visible until the new authoritative cloud disappears", () => {
    const layer = new SmokeCloudLayer();
    advance(layer, 180, [cloud]);
    advance(layer, 30, []);
    advance(layer, 60, [{ ...cloud, l: 4 }]);
    expect(hasSmoke(layer)).toBe(true);

    advance(layer, 46, []);
    expect(hasSmoke(layer)).toBe(false);
    layer.destroy();
});
