import { expect, test } from "bun:test";
import { BufferImageSource } from "pixi.js";

import { AtlasPrewarmSources } from "./atlasPrewarmSources";

const source = () => new BufferImageSource({ resource: new Uint8Array(4), width: 1, height: 1 });
const allocation = () => ({ destroy: () => undefined }) as never;

test("GPU eviction and context replacement invalidate readiness even without source events", () => {
    const texture = source();
    const ready = new AtlasPrewarmSources(() => 17);
    texture._gpuData[17] = allocation();
    ready.add(texture);
    expect(ready.has(texture)).toBe(true);

    // Pixi's GCManagedHash removes the renderer's allocation directly, without emitting source.unload.
    delete texture._gpuData[17];
    expect(ready.has(texture)).toBe(false);
    texture._gpuData[17] = allocation();
    expect(ready.has(texture)).toBe(false);
    ready.add(texture);
    expect(ready.has(texture)).toBe(true);

    texture._gpuData[17] = allocation();
    expect(ready.has(texture)).toBe(false);
    texture.destroy();
});

test("unload, destruction and renderer replacement cannot reuse the old preparation", () => {
    const texture = source();
    let renderer = 17;
    const ready = new AtlasPrewarmSources(() => renderer);
    texture._gpuData[17] = allocation();
    ready.add(texture);
    texture.unload();
    expect(ready.has(texture)).toBe(false);

    texture._gpuData[17] = allocation();
    ready.add(texture);
    texture._gpuData[18] = allocation();
    renderer = 18;
    expect(ready.has(texture)).toBe(false);
    ready.add(texture);
    expect(ready.has(texture)).toBe(true);
    texture.destroy();
    expect(ready.has(texture)).toBe(false);
});

test("failed uploads stay attempted without keeping GPU resources alive or retrying every frame", () => {
    const texture = source();
    const ready = new AtlasPrewarmSources(() => 17);
    ready.add(texture);
    for (let frame = 0; frame < 600; frame++) expect(ready.has(texture)).toBe(true);
    expect(texture._gpuData[17]).toBeUndefined();
    expect(texture.listenerCount("unload")).toBe(0);
    expect(texture.listenerCount("destroy")).toBe(0);
    expect(ready.delete(texture)).toBe(true);
    expect(ready.has(texture)).toBe(false);
    texture.destroy();
});
