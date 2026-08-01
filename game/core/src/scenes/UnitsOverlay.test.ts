import { describe, expect, test } from "bun:test";
import { Container } from "pixi.js";

import { isVisibleThroughAncestor } from "./UnitsOverlay";

describe("UnitsOverlay chip visibility", () => {
    test("collapsed level rows cannot answer chip hit-tests", () => {
        const rows = new Container();
        const collapsedRow = new Container();
        const bucket = new Container();
        const chip = new Container();

        rows.addChild(collapsedRow);
        collapsedRow.addChild(bucket);
        bucket.addChild(chip);

        expect(isVisibleThroughAncestor(chip, rows)).toBe(true);

        // The accordion hides the row, not each bucket or chip. Their local flags stay true and their old
        // bounds remain available, which was how hidden L1 chips intercepted visible L4 clicks.
        collapsedRow.visible = false;
        expect(chip.visible).toBe(true);
        expect(bucket.visible).toBe(true);
        expect(isVisibleThroughAncestor(chip, rows)).toBe(false);
    });

    test("only objects attached to the requested overlay branch are eligible", () => {
        const rows = new Container();
        const detachedRow = new Container();
        const bucket = new Container();
        const chip = new Container();

        detachedRow.addChild(bucket);
        bucket.addChild(chip);

        expect(isVisibleThroughAncestor(chip, rows)).toBe(false);
    });
});
