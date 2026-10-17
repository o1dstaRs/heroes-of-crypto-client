import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { BufferImageSource, Texture } from "pixi.js";

import { AtlasPrewarmSources } from "../pixi/atlasPrewarmSources";
import { Sandbox } from "./Sandbox";

afterEach(() => mock.restore());

interface PrewarmScene {
    stepAtlasPrewarm(): void;
    atlasPrewarmQuietScans: number;
    atlasPrewarmNextQuietScanAt: number;
    currentActiveUnit: object | undefined;
}

const fixture = () => {
    let now = 0;
    let moving = false;
    let attacking = false;
    let flying = false;
    spyOn(performance, "now").mockImplementation(() => now);
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 1, height: 1 }),
    });
    const ready = new AtlasPrewarmSources(() => 17);
    const unit = {
        prewarmCombatAtlasFrame: (sources: WeakSet<object>) => (sources.has(texture.source) ? undefined : texture),
    };
    const scan = mock(unit.prewarmCombatAtlasFrame);
    unit.prewarmCombatAtlasFrame = scan;
    const upload = mock(() => {
        texture.source._gpuData[17] = { destroy: () => undefined } as never;
        return true;
    });
    const cancel = mock(() => {});
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map([["unit", unit]]) },
        currentActiveUnit: unit,
        atlasPrewarmUnitCount: 1,
        atlasPrewarmQuietScans: 0,
        atlasPrewarmNextQuietScanAt: 0,
        prewarmedAtlasSources: ready,
        atlasTexturePrewarmer: { cancel },
        moveAnimManager: { isMoving: () => moving },
        rangedProjectiles: { hasActive: () => flying },
        oneShotPresentationActive: () => attacking,
        uploadAtlasFrame: upload,
    }) as PrewarmScene;
    return {
        scene,
        texture,
        scan,
        upload,
        cancel,
        at: (time: number) => (now = time),
        moving: (value: boolean) => (moving = value),
        attacking: (value: boolean) => (attacking = value),
        flying: (value: boolean) => (flying = value),
    };
};

test("a quiet scene notices a GC-evicted atlas and prepares it again before its next draw", () => {
    const f = fixture();
    f.scene.stepAtlasPrewarm();
    expect(f.upload).toHaveBeenCalledTimes(1);
    for (let frame = 0; frame <= 180; frame++) f.scene.stepAtlasPrewarm();
    const scans = f.scan.mock.calls.length;
    delete f.texture.source._gpuData[17];
    for (let frame = 0; frame < 60; frame++) {
        f.at(frame * 16);
        f.scene.stepAtlasPrewarm();
    }
    expect(f.scan.mock.calls.length).toBe(scans);
    f.at(1000);
    f.scene.stepAtlasPrewarm();
    expect(f.upload).toHaveBeenCalledTimes(2);
    expect(f.texture.source._gpuData[17]).toBeDefined();
    f.texture.destroy(true);
});

test("movement and attacks pause optional preparation, including a bitmap already awaiting upload", () => {
    const f = fixture();
    f.upload.mockImplementationOnce(() => false);
    f.scene.stepAtlasPrewarm();
    f.moving(true);
    f.scene.stepAtlasPrewarm();
    f.moving(false);
    f.attacking(true);
    f.scene.stepAtlasPrewarm();
    f.attacking(false);
    f.flying(true);
    f.scene.stepAtlasPrewarm();
    expect(f.scan).toHaveBeenCalledTimes(1);
    expect(f.upload).toHaveBeenCalledTimes(1);
    expect(f.cancel).not.toHaveBeenCalled();
    f.flying(false);
    f.scene.stepAtlasPrewarm();
    expect(f.upload).toHaveBeenCalledTimes(2);
    f.texture.destroy(true);
});

test("a newly discovered atlas leaves the quiet backoff while asynchronous preparation finishes", () => {
    const f = fixture();
    f.scene.atlasPrewarmQuietScans = 180;
    f.upload.mockImplementationOnce(() => false);
    f.scene.stepAtlasPrewarm();
    expect(f.scene.atlasPrewarmQuietScans).toBe(0);
    expect(f.upload).toHaveBeenCalledTimes(1);
    f.at(16);
    f.scene.stepAtlasPrewarm();
    expect(f.upload).toHaveBeenCalledTimes(2);
    f.texture.destroy(true);
});
