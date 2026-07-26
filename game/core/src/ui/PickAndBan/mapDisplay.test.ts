import { GridVals } from "@heroesofcrypto/common";
import { describe, expect, it } from "bun:test";

import { getMapDisplay } from "./mapDisplay";

describe("getMapDisplay (ranked map reveal presentation)", () => {
    it("maps each ranked grid type to its user-facing name and image", () => {
        expect(getMapDisplay(GridVals.NORMAL)).toMatchObject({ name: "Standard", imageKey: "board_icon" });
        expect(getMapDisplay(GridVals.LAVA_CENTER)).toMatchObject({ name: "Lava", imageKey: "lava_256" });
        expect(getMapDisplay(GridVals.BLOCK_CENTER)).toMatchObject({ name: "Mountains", imageKey: "mountain_432_412" });
    });

    it("still resolves Water (disabled in ranked, but mapped for robustness)", () => {
        expect(getMapDisplay(GridVals.WATER_CENTER)).toMatchObject({ name: "Water", imageKey: "water_256" });
    });

    it("returns undefined for the unrevealed (0) and any unknown grid type — the badge shows 'Map: ?'", () => {
        expect(getMapDisplay(0)).toBeUndefined();
        expect(getMapDisplay(GridVals.NO_TYPE)).toBeUndefined();
        expect(getMapDisplay(99)).toBeUndefined();
    });

    it("gives every revealed map a non-empty accent colour and blurb", () => {
        for (const gv of [GridVals.NORMAL, GridVals.LAVA_CENTER, GridVals.BLOCK_CENTER]) {
            const d = getMapDisplay(gv);
            expect(d).toBeDefined();
            expect(d!.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(d!.blurb.length).toBeGreaterThan(0);
        }
    });
});
