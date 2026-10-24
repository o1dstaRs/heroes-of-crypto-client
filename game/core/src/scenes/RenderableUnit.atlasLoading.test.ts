import { afterEach, expect, spyOn, test } from "bun:test";
import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";
import { BufferImageSource, Cache, Texture } from "pixi.js";

import { RenderableUnit } from "./RenderableUnit";
import { images } from "../imageAssets";

const url = images.peasant_idle_red_atlas_quarter;
const units: RenderableUnit[] = [];
const parents: Texture[] = [];
afterEach(() => {
    for (const unit of units.splice(0)) unit.destroyVisuals();
    if (Cache.has(url)) Cache.remove(url);
    for (const parent of parents.splice(0)) if (!parent.destroyed) parent.destroy(true);
});
const create = (resolver: (key: string) => Texture | undefined = () => undefined) => {
    const gs = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const effects = new EffectFactory();
    const unit = RenderableUnit.fromBase(
        Unit.createUnit(
            HoCConfig.getCreatureConfig(TeamVals.LEFT, "Life", "Peasant", "peasant_512", 10),
            gs,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        ),
        resolver,
    );
    units.push(unit);
    return unit;
};
const sheet = () => {
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 576 }),
    });
    parents.push(texture);
    return texture;
};

test("two seconds of cold-frame retries do not probe missing cache entries or emit repeated warnings", () => {
    const unit = create();
    const get = spyOn(Cache, "get");
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
        for (let frame = 0; frame < 120; frame++) expect(unit.prewarmDefaultAtlasFrame()).toBeUndefined();
        expect(get).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    } finally {
        get.mockRestore();
        warn.mockRestore();
    }
});

test("a delayed cached atlas becomes drawable on the next retry", () => {
    const unit = create();
    expect(unit.prewarmDefaultAtlasFrame()).toBeUndefined();
    const parent = sheet();
    Cache.set(url, parent);
    const first = unit.prewarmDefaultAtlasFrame();
    expect(first?.source).toBe(parent.source);
    expect(first?.width).toBe(192);
    expect(unit.prewarmDefaultAtlasFrame()).toBe(first);
});

test("a destroyed atlas source cannot reuse stale wrappers and a replacement retains its own source", () => {
    const unit = create();
    const old = sheet();
    Cache.set(url, old);
    const first = unit.prewarmDefaultAtlasFrame();
    old.source.destroy();
    expect(unit.prewarmDefaultAtlasFrame()).toBeUndefined();
    Cache.remove(url);
    const next = sheet();
    Cache.set(url, next);
    const second = unit.prewarmDefaultAtlasFrame();
    expect(second?.source).toBe(next.source);
    expect(second).not.toBe(first);
});

test("scene-resolved atlases avoid the global texture cache", () => {
    const parent = sheet();
    const unit = create(() => parent);
    const get = spyOn(Cache, "get");
    try {
        expect(unit.prewarmDefaultAtlasFrame()?.source).toBe(parent.source);
        expect(get).not.toHaveBeenCalled();
    } finally {
        get.mockRestore();
    }
});
