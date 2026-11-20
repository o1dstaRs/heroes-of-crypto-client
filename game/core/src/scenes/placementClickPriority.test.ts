/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { shouldCommitPlacementBeforeUnitSelection } from "./placementClickPriority";

const validPlacement = {
    hasActiveSelection: true,
    hasSelectedUnit: true,
    hasValidPlacementCells: true,
    clickedOccupiedUnit: false,
    clickedBenchUnit: false,
};

describe("placement click priority", () => {
    test("commits a green empty-cell placement even when another sprite overhangs the pointer", () => {
        expect(shouldCommitPlacementBeforeUnitSelection(validPlacement)).toBe(true);
    });

    test.each([
        ["keeps selection priority for a unit that actually occupies the clicked cell", { clickedOccupiedUnit: true }],
        ["keeps placement-bench creatures selectable", { clickedBenchUnit: true }],
        ["never commits a red or missing placement preview", { hasValidPlacementCells: false }],
    ])("%s", (_, override) => {
        expect(shouldCommitPlacementBeforeUnitSelection({ ...validPlacement, ...override })).toBe(false);
    });

    // OWNER RULE (2026-08-28): a unit is picked — to select it or to attack it — by the cells it stands on,
    // never by its drawn sprite. The click handler is not drivable without a live scene, so this pins it.
    test("checks the green placement target before falling back to full-sprite unit selection", () => {
        const sandbox = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        const placementInput = sandbox.slice(
            sandbox.indexOf("// 2. PRE-FIGHT PLACEMENT INTERACTION"),
            sandbox.indexOf("// 3. UNIT SELECTION"),
        );
        const commitPriority = placementInput.indexOf("shouldCommitPlacementBeforeUnitSelection({");
        const spriteFallback = placementInput.indexOf(
            "const unitUnderMouse = clickedBenchUnit ?? this.getUnitAtPosition(p);",
        );

        expect(placementInput).toContain("const clickedGridUnit = this.getGridUnitAtPosition(p);");
        expect(commitPriority).toBeGreaterThan(-1);
        expect(spriteFallback).toBeGreaterThan(commitPriority);
    });
});
