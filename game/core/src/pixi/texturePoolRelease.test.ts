import { afterEach, describe, expect, test } from "bun:test";
import { FilterSystem, TexturePool, type Texture } from "pixi.js";

import { releaseIdlePooledTextures } from "./texturePoolRelease";

interface IFilterSlots {
    _pushFilterData(): { inputTexture: Texture | null; backTexture: Texture | null };
    _popFilterData(): unknown;
    _filterStack: { inputTexture: Texture | null; backTexture: Texture | null }[];
    _findFilterResolution?(rootResolution: number): number;
    _getPreviousFilterData?(): { inputTexture: Texture | null } | null;
}

/** Last frame drew a filter inside a filter: pop hands each slot's texture back but leaves it on the slot. */
const frameWithNestedFilter = (): { filter: IFilterSlots; lastFrameNestedTexture: Texture } => {
    const filter = new FilterSystem({} as never) as unknown as IFilterSlots;
    filter._pushFilterData();
    const nested = filter._pushFilterData();
    const lastFrameNestedTexture = TexturePool.getOptimalTexture(256, 256, 2, false);
    nested.inputTexture = lastFrameNestedTexture;
    filter._popFilterData();
    TexturePool.returnTexture(lastFrameNestedTexture);
    filter._popFilterData();
    return { filter, lastFrameNestedTexture };
};

describe("releasing Pixi's idle pooled textures", () => {
    afterEach(() => {
        TexturePool.clear();
    });

    test("destroys what sits idle but lets a texture still in use come back to its bucket", () => {
        const inUse = TexturePool.getOptimalTexture(300, 200, 1, false);
        const idle = TexturePool.getOptimalTexture(300, 200, 1, false);
        TexturePool.returnTexture(idle);

        releaseIdlePooledTextures();

        expect(idle.destroyed).toBe(true);
        const keys = TexturePool as unknown as {
            _poolKeyHash?: Record<number, number>;
            _poolKey?: Record<number, number>;
        };
        expect((keys._poolKeyHash ?? keys._poolKey)?.[idle.uid]).toBeUndefined();
        expect((keys._poolKeyHash ?? keys._poolKey)?.[inUse.uid]).toBeDefined();
        expect(() => TexturePool.returnTexture(inUse)).not.toThrow();
        expect(TexturePool.getOptimalTexture(300, 200, 1, false)).toBe(inUse);
    });

    test("a nested filter's next frame finds no destroyed leftover once the renderer's filter stack forgets it", () => {
        const { filter, lastFrameNestedTexture } = frameWithNestedFilter();

        releaseIdlePooledTextures({ filter });

        expect(lastFrameNestedTexture.destroyed).toBe(true);
        expect(filter._filterStack[1].inputTexture).toBeNull();
        expect(filter._filterStack[1].backTexture).toBeNull();
        filter._pushFilterData();
        filter._pushFilterData();
        if (filter._findFilterResolution) expect(filter._findFilterResolution(1)).toBe(1);
        else {
            expect(filter._getPreviousFilterData).toBeFunction();
            expect(filter._getPreviousFilterData!()?.inputTexture).toBeFalsy();
        }
    });

    test("the legacy filter API reads a destroyed leftover, while 8.22 uses the enclosing filter", () => {
        const { filter } = frameWithNestedFilter();

        releaseIdlePooledTextures();

        expect(filter._filterStack[1].inputTexture?.destroyed).toBe(true);
        filter._pushFilterData();
        filter._pushFilterData();
        if (filter._findFilterResolution) expect(() => filter._findFilterResolution!(1)).toThrow();
        else {
            expect(filter._getPreviousFilterData).toBeFunction();
            expect(filter._getPreviousFilterData!()?.inputTexture).toBeFalsy();
        }
    });

    test("Pixi clear invalidates a borrowed target: 8.20 throws, 8.21+ destroys it on return", () => {
        const inUse = TexturePool.getOptimalTexture(300, 200, 1, false);

        TexturePool.clear();

        if ("_buckets" in TexturePool) {
            expect(() => TexturePool.returnTexture(inUse)).not.toThrow();
            expect(inUse.destroyed).toBe(true);
        } else {
            expect(() => TexturePool.returnTexture(inUse)).toThrow();
        }
    });

    test("reclaims every idle format/scale-mode bucket in the 8.21+ pool while retaining borrowed targets", () => {
        const target = (uid: number, width: number, height: number) => ({
            uid,
            width,
            height,
            destroyed: false,
            destroyedSource: false,
            destroy(destroySource = false) {
                this.destroyed = true;
                this.destroyedSource = destroySource;
            },
        });
        const borrowedColor = target(1, 2560, 1440);
        const borrowedNearest = target(2, 512, 512);
        const idleColor = target(3, 2560, 1440);
        const idleColorSecond = target(4, 2560, 1440);
        const idleFloat = target(5, 512, 512);
        const idleNearest = target(6, 512, 512);
        const idle = [idleColor, idleColorSecond, idleFloat, idleNearest];
        // These are the field shapes of upstream 8.21 TexturePool: buckets separated by format and
        // scale mode, plus ownership/style records for both idle and currently borrowed textures.
        const pool = {
            _buckets: new Map([
                [100, [idleColor, idleColorSecond]],
                [200, [idleFloat]],
                [300, [idleNearest]],
            ]),
            _poolKey: { 1: 100, 2: 300, 3: 100, 4: 100, 5: 200, 6: 300 } as Record<number, number>,
            _poolStyle: Object.fromEntries([1, 2, 3, 4, 5, 6].map((uid) => [uid, { uid }])),
        };
        type Slot = { inputTexture: ReturnType<typeof target> | null; backTexture: ReturnType<typeof target> | null };
        const active: Slot = { inputTexture: borrowedColor, backTexture: borrowedNearest };
        const inactive: Slot = { inputTexture: idleColor, backTexture: idleNearest };
        const renderer = { filter: { _filterStack: [active, inactive], _filterStackIndex: 1 } };
        const retainedBuckets = [...pool._buckets.values()];

        releaseIdlePooledTextures(renderer, pool);

        expect(idle.every((texture) => texture.destroyed && texture.destroyedSource)).toBe(true);
        expect([...pool._buckets.values()]).toEqual([[], [], []]);
        expect([...pool._buckets.values()].every((bucket, index) => bucket === retainedBuckets[index])).toBe(true);
        expect(pool._poolKey).toEqual({ 1: 100, 2: 300 });
        expect(Object.keys(pool._poolStyle)).toEqual(["1", "2"]);
        expect(borrowedColor.destroyed).toBe(false);
        expect(borrowedNearest.destroyed).toBe(false);
        expect(active).toEqual({ inputTexture: borrowedColor, backTexture: borrowedNearest });
        expect(inactive).toEqual({ inputTexture: null, backTexture: null });

        // Upstream returnTexture resolves the original bucket through this ownership record. Both
        // users can hand their still-valid targets back, and the next cleanup can reclaim them too.
        pool._buckets.get(pool._poolKey[borrowedColor.uid])!.push(borrowedColor);
        pool._buckets.get(pool._poolKey[borrowedNearest.uid])!.push(borrowedNearest);
        expect(pool._buckets.get(100)).toEqual([borrowedColor]);
        expect(pool._buckets.get(300)).toEqual([borrowedNearest]);
        renderer.filter._filterStackIndex = 0;
        releaseIdlePooledTextures(renderer, pool);
        expect(borrowedColor.destroyed).toBe(true);
        expect(borrowedNearest.destroyed).toBe(true);
        expect(pool._poolKey).toEqual({});
        expect(pool._poolStyle).toEqual({});
        expect(renderer.filter._filterStack).toEqual([
            { inputTexture: null, backTexture: null },
            { inputTexture: null, backTexture: null },
        ]);
        expect(() => releaseIdlePooledTextures(renderer, pool)).not.toThrow();
    });

    test("repeated real pool cleanup retains no ownership records for destroyed targets", () => {
        const pool = TexturePool as unknown as {
            _poolKeyHash?: Record<number, number>;
            _poolKey?: Record<number, number>;
        };
        const ownership = pool._poolKeyHash ?? pool._poolKey!;
        const initialOwnershipCount = Object.keys(ownership).length;
        const borrowed = TexturePool.getOptimalTexture(128, 128, 1, false);
        for (let index = 0; index < 100; index++) {
            const idle = TexturePool.getOptimalTexture(128, 128, 1, false);
            TexturePool.returnTexture(idle);
            releaseIdlePooledTextures();
            expect(idle.destroyed).toBe(true);
        }
        expect(Object.keys(ownership).length).toBe(initialOwnershipCount + 1);
        expect(borrowed.destroyed).toBe(false);
        TexturePool.returnTexture(borrowed);
        releaseIdlePooledTextures();
        expect(Object.keys(ownership).length).toBe(initialOwnershipCount);
    });

    test("a destruction callback cannot reborrow the idle texture currently being destroyed", () => {
        const inUse = TexturePool.getOptimalTexture(300, 200, 1, false);
        const idle = TexturePool.getOptimalTexture(300, 200, 1, false);
        TexturePool.returnTexture(idle);
        let requestedDuringDestroy: Texture | undefined;
        idle.once("destroy", () => {
            requestedDuringDestroy = TexturePool.getOptimalTexture(300, 200, 1, false);
        });

        releaseIdlePooledTextures();

        expect(requestedDuringDestroy).toBeDefined();
        expect(requestedDuringDestroy).not.toBe(idle);
        expect(requestedDuringDestroy?.destroyed).toBe(false);
        expect(inUse.destroyed).toBe(false);
        TexturePool.returnTexture(inUse);
        TexturePool.returnTexture(requestedDuringDestroy!);
        releaseIdlePooledTextures();
    });
});
