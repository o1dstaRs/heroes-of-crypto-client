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

/**
 * Two owner rules about the pre-fight board, pinned against the SOURCE.
 *
 * Source-contract rather than render tests for the same reason the sidebar ones are: this repo has no
 * DOM/GL harness, and the regression class is a refactor quietly dropping a rule. Reading the text also
 * keeps these runnable when the local art source lacks a portrait the scene modules import.
 */
const sandboxSource = (): string => readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
const drawerSource = (): string => readFileSync(join(import.meta.dir, "SandboxDrawer.ts"), "utf8");

describe("free-space wash under placed units", () => {
    test("the placement pass draws a footprint wash, fed from the grid rather than the unit list", () => {
        const sandbox = sandboxSource();
        expect(sandbox).toContain("occupiedFootprints: this.occupiedBoardFootprints()");
        // Grid-confirmed membership: a bench creature and the placement preview both carry cells, and
        // only the grid knows which ones are actually held.
        const collector = sandbox.slice(
            sandbox.indexOf("private occupiedBoardFootprints("),
            sandbox.indexOf("private occupiedBoardFootprints(") + 900,
        );
        expect(collector).toContain("this.grid.getOccupantUnitId(cell) === unit.getId()");
        expect(collector).toContain("unit.isDead()");
    });

    test("the wash is drawn pre-fight only, under the zones and under the hover preview", () => {
        const drawer = drawerSource();
        const placements = drawer.slice(
            drawer.indexOf("public static drawPlacements("),
            drawer.indexOf("private static drawOccupiedFootprints("),
        );
        // Inside the pre-fight branch: a wash over a live fight would be permanent board clutter.
        expect(placements).toContain("if (!fightProps.hasFightStarted())");
        const washCall = placements.indexOf("SandboxDrawer.drawOccupiedFootprints(");
        const hoverCall = placements.indexOf("hoverManager.drawHoverPlacementCell(");
        expect(washCall).toBeGreaterThan(placements.indexOf("if (!fightProps.hasFightStarted())"));
        // The cell the player is about to click must read on top of the informational wash.
        expect(hoverCall).toBeGreaterThan(washCall);
    });

    test("one rounded shape per footprint, so a 2x1 body is not drawn as two tiles", () => {
        const drawer = drawerSource();
        const helper = drawer.slice(drawer.indexOf("private static drawOccupiedFootprints("));
        expect(helper).toContain("placementZonePolygon(cells, gs)");
        expect(helper).toContain("0xffffff");
    });
});

describe("units are selected by their cells, never by their sprite", () => {
    test("getUnitAtPosition resolves occupancy and the bench, with no sprite hit-test", () => {
        const sandbox = sandboxSource();
        const resolver = sandbox.slice(
            sandbox.indexOf("private getUnitAtPosition("),
            sandbox.indexOf("private getLogicalBattlefieldPoint("),
        );
        // Comments are stripped first: the block explains WHY the sprite path is gone, and naming it in
        // prose must not read as calling it.
        const code = resolver
            .split("\n")
            .filter((line) => !line.trim().startsWith("//"))
            .join("\n");
        expect(code).toContain("this.grid.getOccupantUnitId(cell)");
        expect(code).toContain("this.getBenchUnitAtPosition(worldPos)");
        // The rule: a full-body silhouette reaches past the ground it holds, so hit-testing the art let
        // a click select a unit whose cells the cursor never touched.
        expect(code).not.toContain("getUnitSpriteAtPosition(");
        expect(code).not.toContain("spriteHitDepth(");
    });
});
