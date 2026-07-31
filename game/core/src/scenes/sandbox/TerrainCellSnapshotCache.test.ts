import { describe, expect, test } from "bun:test";

import { TerrainCellSnapshotCache } from "./TerrainCellSnapshotCache";

class TestStore {
    public revision = 0;
    public cells: { x: number; y: number }[] = [];
    public serializations = 0;
    public getRevision(): number {
        return this.revision;
    }
    public toJSON(): { x: number; y: number }[] {
        this.serializations += 1;
        return this.cells.map((cell) => ({ ...cell }));
    }
}

describe("TerrainCellSnapshotCache", () => {
    test("reuses a store snapshot until its revision changes", () => {
        const cache = new TerrainCellSnapshotCache<{ x: number; y: number }>();
        const store = new TestStore();
        store.cells = [{ x: 1, y: 2 }];

        const initial = cache.get(store);
        expect(store.serializations).toBe(1);
        expect(cache.get(store)).toBe(initial);
        expect(store.serializations).toBe(1);

        store.cells = [{ x: 3, y: 4 }];
        store.revision += 1;
        expect(cache.get(store)).toEqual([{ x: 3, y: 4 }]);
        expect(store.serializations).toBe(2);
    });

    test("refreshes when ranked hydration replaces a store with the same revision", () => {
        const cache = new TerrainCellSnapshotCache<{ x: number; y: number }>();
        const firstStore = new TestStore();
        firstStore.cells = [{ x: 1, y: 2 }];
        const nextStore = new TestStore();
        nextStore.cells = [{ x: 7, y: 8 }];

        cache.get(firstStore);
        expect(cache.get(nextStore)).toEqual([{ x: 7, y: 8 }]);
        expect(firstStore.serializations).toBe(1);
        expect(nextStore.serializations).toBe(1);
    });
});
