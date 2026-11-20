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
import { GridConstants, GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, type Graphics } from "pixi.js";

import { placementZonePolygon } from "../pixi/PixiDrawablePlacement";
import { Sandbox } from "./Sandbox";
import { SandboxDrawer, type IPlacementDrawContext } from "./SandboxDrawer";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const key = (cell: HoCMath.XY) => `${cell.x}:${cell.y}`;

describe("free-space wash under placed units", () => {
    test("collects only the cells the grid confirms each living unit holds", () => {
        const held = new Map<string, string>();
        const unit = (id: string, cells: HoCMath.XY[], { dead = false, onGrid = true } = {}) => {
            if (onGrid) for (const cell of cells) held.set(key(cell), id);
            return { getId: () => id, getCells: () => cells, isDead: () => dead };
        };
        const knight = unit("knight", [
            { x: 3, y: 2 },
            { x: 4, y: 2 },
        ]);
        // A bench creature and the placement preview both carry cells; only the grid knows they hold none.
        const bench = unit("bench", [{ x: 6, y: 2 }], { onGrid: false });
        const corpse = unit("corpse", [{ x: 8, y: 2 }], { dead: true });
        const halfOn = unit("half", [
            { x: 10, y: 2 },
            { x: 11, y: 2 },
        ]);
        held.set(key({ x: 11, y: 2 }), "barrel");
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            unitsHolder: { getAllUnits: () => new Map([knight, bench, corpse, halfOn].map((u) => [u.getId(), u])) },
            grid: { getOccupantUnitId: (cell: HoCMath.XY) => held.get(key(cell)) },
        }) as { occupiedBoardFootprints(): HoCMath.XY[][] };

        expect(scene.occupiedBoardFootprints()).toEqual([
            [
                { x: 3, y: 2 },
                { x: 4, y: 2 },
            ],
            [{ x: 10, y: 2 }],
        ]);
    });

    const drawPlacements = (fightStarted: boolean) => {
        const calls: string[] = [];
        const polygons: number[][] = [];
        const graphics = {
            clear: () => (calls.push("clear"), graphics),
            poly: (points: number[]) => (calls.push("wash"), polygons.push(points), graphics),
            fill: () => graphics,
            stroke: () => graphics,
        };
        const frames = new Container();
        const frame = new Container();
        frames.addChild(frame);
        const footprint = [
            { x: 3, y: 2 },
            { x: 4, y: 2 },
        ];
        SandboxDrawer.drawPlacements({
            fightProps: { hasFightStarted: () => fightStarted },
            placementManager: {
                draw: () => calls.push("zones"),
                concealPersistentZones: () => calls.push("conceal"),
            },
            hoverManager: { drawHoverPlacementCell: () => calls.push("hover") },
            placementGraphics: graphics as unknown as Graphics,
            placementFrameContainer: frames,
            occupiedFootprints: [footprint, [{ x: 9, y: 1 }]],
            gridSettings,
        } as unknown as IPlacementDrawContext);
        const keptFrame = frame.parent === frames;
        frames.destroy({ children: true });
        return { calls, polygons, footprint, keptFrame };
    };

    test("pre-fight, one rounded wash per footprint is drawn over the zones and under the hover preview", () => {
        const { calls, polygons, footprint, keptFrame } = drawPlacements(false);
        // The cell the player is about to click must read on top of the informational wash.
        expect(calls).toEqual(["clear", "zones", "wash", "wash", "hover"]);
        // A 2x1 body is one shape, not two tiles.
        expect(polygons[0]).toEqual(placementZonePolygon(footprint, gridSettings));
        // The shown zone must not detach its cached frame.
        expect(keptFrame).toBe(true);
    });

    test("once the fight starts the wash and zones are gone", () => {
        const { calls, keptFrame } = drawPlacements(true);
        expect(calls).toEqual(["clear", "conceal"]);
        expect(keptFrame).toBe(false);
    });
});

describe("units are selected by their cells, never by their sprite", () => {
    test("getUnitAtPosition resolves occupancy and the bench, with no sprite hit-test", () => {
        // OWNER CALL (2026-08-28): picking a unit goes by the CELLS it stands on, never by its drawn
        // silhouette. Kept as a source guard: a sprite pick cannot be ruled out by any finite set of
        // stub positions, only by its absence from the resolver.
        const sandbox = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
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
        expect(code).not.toContain("getUnitSpriteAtPosition(");
        expect(code).not.toContain("spriteHitDepth(");
    });
});
