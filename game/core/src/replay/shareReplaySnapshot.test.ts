import { describe, expect, test } from "bun:test";

import { shareReplaySnapshot } from "./shareReplaySnapshot";

const unit = (id: string) => ({
    properties: { id, hp: 10, buffs: ["Blessing"], spellAmounts: [2, 1] },
    cells: [
        { x: 2, y: 3 },
        { x: 2, y: 4 },
    ],
    responded: false,
});
const state = () => ({
    currentLap: 1,
    units: [unit("a"), unit("b")],
    upNext: ["a", "b"],
    terrainCells: [{ x: 1, y: 2, lapsRemaining: 2 }],
    artifactBarrels: [{ team: 2, index: 0, cell: { x: 2, y: 1 } }],
});

describe("immutable replay snapshot sharing", () => {
    test("a coordinate shared by board and presentation checkpoints is adopted safely twice", () => {
        const position = { x: 2, y: 3 };
        const cells = [position];
        const board = shareReplaySnapshot({ cells });
        const presentation = shareReplaySnapshot({ units: [{ id: "a", cells, baseCell: position }] });
        expect(presentation.units[0].cells).toBe(board.cells);
        expect(presentation.units[0].baseCell).toBe(board.cells[0]);
    });

    test("a shallow-frozen input is copied before its children are made immutable", () => {
        const input = Object.freeze({ cells: Object.freeze([{ x: 2, y: 3 }]) });
        const next = shareReplaySnapshot(input);
        expect(next).toEqual(input);
        expect(Object.isFrozen(next.cells[0])).toBe(true);
    });
    test("retains identical snapshots once, including all of their nested data", () => {
        const previous = shareReplaySnapshot(state());
        const next = shareReplaySnapshot(state(), previous);
        expect(next).toBe(previous);
        expect(Object.isFrozen(next)).toBe(true);
        expect(Object.isFrozen(next.units[0].properties.spellAmounts)).toBe(true);
        expect(Object.isFrozen(next.artifactBarrels[0].cell)).toBe(true);
        expect(() => {
            next.units[0].properties.spellAmounts[0] = 99;
        }).toThrow();
        expect(next.units[0].properties.spellAmounts[0]).toBe(2);
    });

    test("a change owns its path and shares only the unchanged data", () => {
        const previous = shareReplaySnapshot(state());
        const changed = state();
        changed.currentLap = 2;
        changed.units[0].properties.hp = 4;
        changed.units[0].responded = true;
        const expected = structuredClone(changed);
        const next = shareReplaySnapshot(changed, previous);
        expect(next).toEqual(expected);
        expect(next).not.toBe(previous);
        expect(next.units).not.toBe(previous.units);
        expect(next.units[0]).not.toBe(previous.units[0]);
        expect(next.units[1]).toBe(previous.units[1]);
        expect(next.units[0].properties.buffs).toBe(previous.units[0].properties.buffs);
        expect(next.units[0].cells).toBe(previous.units[0].cells);
        expect(next.terrainCells).toBe(previous.terrainCells);
        expect(previous.units[0].properties.hp).toBe(10);
    });

    test("preserves roster order, summons, removals and returned units by identity", () => {
        const previous = shareReplaySnapshot(state());
        const next = shareReplaySnapshot({ ...state(), units: [unit("b"), unit("new"), unit("a")] }, previous);
        expect(next.units.map((item) => item.properties.id)).toEqual(["b", "new", "a"]);
        expect(next.units[0]).toBe(previous.units[1]);
        expect(next.units[2]).toBe(previous.units[0]);
        const removed = shareReplaySnapshot({ ...state(), units: [unit("new"), unit("a")] }, next);
        expect(removed.units[0]).toBe(next.units[1]);
        expect(removed.units[1]).toBe(previous.units[0]);
    });

    test("also shares authoritative units whose id is at the top level", () => {
        const previous = shareReplaySnapshot({
            units: [
                { id: "a", hp: 10 },
                { id: "b", hp: 9 },
            ],
        });
        const next = shareReplaySnapshot(
            {
                units: [
                    { id: "b", hp: 9 },
                    { id: "a", hp: 5 },
                ],
            },
            previous,
        );
        expect(next.units[0]).toBe(previous.units[1]);
        expect(next.units[1].hp).toBe(5);
        expect(previous.units[0].hp).toBe(10);
    });

    test("terrain, casts and turn queues remain independent at each checkpoint", () => {
        const previous = shareReplaySnapshot(state());
        const changed = state();
        changed.units[0].properties.spellAmounts[0] = 1;
        changed.terrainCells[0].lapsRemaining = 1;
        changed.artifactBarrels = [];
        changed.upNext.reverse();
        const next = shareReplaySnapshot(changed, previous);
        expect(next).toEqual(changed);
        expect(next.upNext).toEqual(["b", "a"]);
        expect(previous.upNext).toEqual(["a", "b"]);
        expect(previous.terrainCells[0].lapsRemaining).toBe(2);
        expect(previous.artifactBarrels).toHaveLength(1);
        expect(previous.units[0].properties.spellAmounts[0]).toBe(2);
    });

    test("keeps absent fields distinct from explicit undefined, empty arrays, zero and negative zero", () => {
        const previous = shareReplaySnapshot<Record<string, unknown>>({ count: 0, value: undefined });
        const absent = shareReplaySnapshot<Record<string, unknown>>({ count: 0 }, previous);
        expect(Object.hasOwn(absent, "value")).toBe(false);
        const changed = shareReplaySnapshot<Record<string, unknown>>({ count: -0, value: [] }, previous);
        expect(Object.is(changed.count, -0)).toBe(true);
        expect(changed.value).toEqual([]);
        expect(changed).not.toBe(previous);
    });

    test("preserves sparse-array holes separately from explicit undefined entries", () => {
        const before = shareReplaySnapshot([undefined, undefined]);
        const sparse = new Array<undefined>(2);
        sparse[1] = undefined;
        const next = shareReplaySnapshot(sparse, before);
        expect(Object.hasOwn(next, 0)).toBe(false);
        expect(Object.hasOwn(next, 1)).toBe(true);
        expect(next).not.toBe(before);
    });
});
