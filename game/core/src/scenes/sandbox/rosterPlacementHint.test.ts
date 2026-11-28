import { describe, expect, test } from "bun:test";
import { TeamVals, type HoCMath } from "@heroesofcrypto/common";

import { rosterPlacementHint } from "./rosterPlacementHint";

const hash = ({ x, y }: HoCMath.XY): number => (x << 4) | y;
const green = { team: TeamVals.LEFT, hasStackSlot: true, cellHashes: new Set([0x16, 0x17, 0x26, 0x27]) };
const red = { team: TeamVals.RIGHT, hasStackSlot: true, cellHashes: new Set([0xd6, 0xd7, 0xe6, 0xe7]) };

describe("Sandbox roster placement hint", () => {
    test("explains the stack limit even when the board still has empty tiles", () => {
        const zones = [green, red].map((zone) => ({ ...zone, hasStackSlot: false }));
        expect(rosterPlacementHint("Squire", 1, 1, zones, () => true)).toMatchObject({ reason: "stack-limit" });
    });

    test("needs a complete footprint inside one deployment zone", () => {
        const occupied = new Set([0x16, 0x27, 0xd6, 0xe7]);
        const empty = (cells: HoCMath.XY[]) => cells.every((cell) => !occupied.has(hash(cell)));
        expect(rosterPlacementHint("Angel", 2, 2, [green, red], empty)).toMatchObject({
            reason: "footprint",
            width: 2,
            height: 2,
        });
        expect(rosterPlacementHint("Squire", 1, 1, [green, red], empty)).toBeUndefined();

        occupied.delete(0xd6);
        occupied.delete(0xe7);
        expect(rosterPlacementHint("Angel", 2, 2, [green, red], empty)).toMatchObject({
            reason: "one-zone",
            team: TeamVals.RIGHT,
        });
        occupied.clear();
        expect(rosterPlacementHint("Angel", 2, 2, [green, red], empty)).toBeUndefined();
    });

    test("checks a rectangular creature in its actual orientation", () => {
        const row = { ...green, cellHashes: new Set([0x16, 0x26]) };
        expect(rosterPlacementHint("Wide creature", 2, 1, [row], () => true)).toBeUndefined();
        expect(rosterPlacementHint("Tall creature", 1, 2, [row], () => true)).toMatchObject({ reason: "footprint" });
    });

    test("shows only the available side when the other has no stack slot", () => {
        const fullGreen = { ...green, hasStackSlot: false };
        expect(rosterPlacementHint("Squire", 1, 1, [fullGreen, red], () => true)).toMatchObject({
            reason: "one-zone",
            team: TeamVals.RIGHT,
        });
        // A co-op player can only place in their own zone.
        expect(rosterPlacementHint("Squire", 1, 1, [fullGreen], () => true)).toMatchObject({ reason: "stack-limit" });
    });
});
