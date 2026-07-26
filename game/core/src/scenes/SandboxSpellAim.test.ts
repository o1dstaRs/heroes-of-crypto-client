import { describe, expect, test } from "bun:test";

import { cellTargetedSpellBlockCells } from "./Sandbox";

const key = (c: { x: number; y: number }) => `${c.x},${c.y}`;

describe("cell-targeted spell aim footprint", () => {
    // The engine reads action.targetCell as the CENTRE for Meteor Shower (meteorShowerCast walks -1..1 on
    // both axes). If the preview anchored it at a corner instead, the highlighted block and the block that
    // actually burns would be one cell apart in each direction.
    test("Meteor Shower covers the 3x3 centred on the aimed cell", () => {
        const cells = cellTargetedSpellBlockCells("Meteor Shower", { x: 7, y: 7 });

        expect(cells).toHaveLength(9);
        const got = new Set(cells.map(key));
        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                expect(got.has(key({ x: 7 + dx, y: 7 + dy }))).toBe(true);
            }
        }
    });

    // Meteorite (and Smoke / Craft) have no centre cell, so their 2x2 hangs up-and-right of the cursor —
    // the corner convention meteoriteCast reads.
    test("Meteorite covers the 2x2 anchored at the aimed cell's bottom-left corner", () => {
        const cells = cellTargetedSpellBlockCells("Meteorite", { x: 4, y: 5 });

        expect(cells).toHaveLength(4);
        expect(new Set(cells.map(key))).toEqual(new Set(["4,5", "5,5", "4,6", "5,6"]));
    });

    test("anything that is not Meteor Shower keeps the 2x2 corner footprint", () => {
        for (const name of ["Smoke", "Craft", "Fire Strike"]) {
            expect(cellTargetedSpellBlockCells(name, { x: 0, y: 0 })).toHaveLength(4);
        }
    });

    test("the footprint moves with the cursor and never drifts", () => {
        const a = cellTargetedSpellBlockCells("Meteor Shower", { x: 2, y: 3 });
        const b = cellTargetedSpellBlockCells("Meteor Shower", { x: 5, y: 3 });

        expect(a.map((c) => key({ x: c.x + 3, y: c.y }))).toEqual(b.map(key));
    });
});
