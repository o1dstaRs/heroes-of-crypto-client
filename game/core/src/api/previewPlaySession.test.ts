import { describe, expect, test } from "bun:test";

import { GridMath, GridVals, TeamVals, getCreaturesByLevel } from "@heroesofcrypto/common";

import { PlayActionType } from "./play_protocol";
import { applyPreviewPlayAction, getPreviewPlaySnapshot, startPreviewPlaySession } from "./previewPlaySession";

describe("battlefield framing comparison layout", () => {
    test("aligns every level-four creature footprint to the bottom row", () => {
        startPreviewPlaySession({
            userTeam: TeamVals.LOWER,
            gridType: GridVals.NORMAL,
            lowerArmy: [...getCreaturesByLevel(4)],
            upperArmy: [],
            spreadLowerArmyAcrossBoard: true,
        });
        const units = getPreviewPlaySnapshot()?.units ?? [];

        expect(units.length).toBeGreaterThan(0);
        expect(units.every((unit) => unit.placed)).toBe(true);
        expect(units.every((unit) => Math.min(...unit.cells.map((cell) => cell.y)) === 0)).toBe(true);
        expect(new Set(units.map((unit) => unit.baseCell.x)).size).toBe(units.length);
    });

    test("keeps integer, unique cells after a creature is temporarily hidden", () => {
        startPreviewPlaySession({
            userTeam: TeamVals.LOWER,
            gridType: GridVals.NORMAL,
            lowerArmy: [...getCreaturesByLevel(1)].slice(1),
            upperArmy: [],
            spreadLowerArmyAcrossBoard: true,
        });
        const units = getPreviewPlaySnapshot()?.units ?? [];

        expect(units.every((unit) => Number.isInteger(unit.baseCell.x) && unit.baseCell.y === 0)).toBe(true);
        expect(new Set(units.map((unit) => unit.baseCell.x)).size).toBe(units.length);
    });

    test("centres every two-cell level-one creature on its horizontal footprint", () => {
        startPreviewPlaySession({
            userTeam: TeamVals.LOWER,
            gridType: GridVals.NORMAL,
            lowerArmy: [...getCreaturesByLevel(1)],
            upperArmy: [],
            spreadLowerArmyAcrossBoard: true,
        });
        const units = getPreviewPlaySnapshot()?.units ?? [];

        for (const name of ["Wolf", "Centaur", "Wolf Rider"]) {
            const unit = units.find((candidate) => candidate.name === name);
            expect(unit).toBeDefined();
            expect(unit?.cells).toHaveLength(2);
            expect(unit?.cells.every((cell) => cell.y === 0)).toBe(true);
            expect(unit?.cells.map((cell) => cell.x).sort((a, b) => a - b)).toEqual([
                (unit?.baseCell.x ?? 0) - 1,
                unit?.baseCell.x ?? 0,
            ]);
        }
    });

    test("centres Nomad on its fixed two-cell horizontal footprint", () => {
        startPreviewPlaySession({
            userTeam: TeamVals.LOWER,
            gridType: GridVals.NORMAL,
            lowerArmy: [...getCreaturesByLevel(2)],
            upperArmy: [],
            spreadLowerArmyAcrossBoard: true,
        });
        const nomad = getPreviewPlaySnapshot()?.units.find((candidate) => candidate.name === "Nomad");

        expect(nomad).toBeDefined();
        expect(nomad?.cells).toHaveLength(2);
        expect(nomad?.cells.every((cell) => cell.y === 0)).toBe(true);
        expect(nomad?.cells.map((cell) => cell.x).sort((a, b) => a - b)).toEqual([
            (nomad?.baseCell.x ?? 0) - 1,
            nomad?.baseCell.x ?? 0,
        ]);
    });

    test("lays an all-level comparison roster out on four visible rows", () => {
        startPreviewPlaySession({
            userTeam: TeamVals.LOWER,
            gridType: GridVals.NORMAL,
            lowerArmy: [1, 2, 3, 4, 5, 6, 7, 8],
            upperArmy: [],
            spreadLowerArmyAcrossBoard: true,
            comparisonRowSizes: [2, 2, 2, 2],
        });
        const units = getPreviewPlaySnapshot()?.units ?? [];

        expect(units).toHaveLength(8);
        expect(units.every((unit) => unit.placed)).toBe(true);
        expect(new Set(units.map((unit) => Math.min(...unit.cells.map((cell) => cell.y)))).size).toBe(4);
        expect(units.every((unit) => unit.cells.every((cell) => cell.y >= 0 && cell.y < 16))).toBe(true);
    });

    test("packs six shadow-editor creatures across the top with one empty cell between footprints", () => {
        startPreviewPlaySession({
            userTeam: TeamVals.LOWER,
            gridType: GridVals.NORMAL,
            lowerArmy: [...getCreaturesByLevel(1)].slice(0, 6),
            upperArmy: [],
            spreadLowerArmyAcrossBoard: true,
            comparisonRowSizes: [6],
            comparisonRowGroundYs: [15],
            comparisonHorizontalGapCells: 1,
        });
        const units = [...(getPreviewPlaySnapshot()?.units ?? [])].sort(
            (left, right) =>
                Math.min(...left.cells.map((cell) => cell.x)) - Math.min(...right.cells.map((cell) => cell.x)),
        );

        expect(units).toHaveLength(6);
        expect(units.every((unit) => Math.min(...unit.cells.map((cell) => cell.y)) === 15)).toBe(true);
        for (let index = 1; index < units.length; index += 1) {
            const previousRight = Math.max(...units[index - 1].cells.map((cell) => cell.x));
            const currentLeft = Math.min(...units[index].cells.map((cell) => cell.x));
            expect(currentLeft - previousRight - 1).toBe(1);
        }
    });

    test("preserves six independent shadow-editor slots when some are empty", () => {
        startPreviewPlaySession({
            userTeam: TeamVals.LOWER,
            gridType: GridVals.NORMAL,
            lowerArmy: [1, 0, 2, 0, 3, 0],
            upperArmy: [],
            spreadLowerArmyAcrossBoard: true,
            comparisonRowSizes: [6],
            comparisonRowGroundYs: [15],
            comparisonFixedSlotCount: 6,
        });
        const units = getPreviewPlaySnapshot()?.units ?? [];

        expect(units).toHaveLength(3);
        for (const unit of units) {
            const slotIndex = Number(unit.id.match(/preview-lower-(\d+)-/)?.[1]);
            const footprintWidth = new Set(unit.cells.map((cell) => cell.x)).size;
            const expectedAnchorX = Math.round((slotIndex * 15) / 5);
            expect(unit.baseCell.x).toBe(Math.max(footprintWidth - 1, expectedAnchorX));
        }

        startPreviewPlaySession({
            userTeam: TeamVals.LOWER,
            gridType: GridVals.NORMAL,
            lowerArmy: [0, 0, 0, 0, 0, 0],
            upperArmy: [],
            spreadLowerArmyAcrossBoard: true,
            comparisonRowSizes: [6],
            comparisonRowGroundYs: [15],
            comparisonFixedSlotCount: 6,
        });
        expect(getPreviewPlaySnapshot()?.units).toHaveLength(0);
    });
});

describe("preview placement round trip", () => {
    test("a two-cell placement comes back with the same cells and a max-corner base cell", () => {
        // The fake server is the only end-to-end exercise of a rectangular PLACE_UNIT the client has: the
        // action carries the cell LIST and the base cell is re-derived from it. Deriving the wrong corner
        // rebuilds the body in the wrong direction on the next hydrate, which is invisible for a square.
        startPreviewPlaySession({
            userTeam: TeamVals.LOWER,
            gridType: GridVals.NORMAL,
            lowerArmy: [...getCreaturesByLevel(1)],
            upperArmy: [],
            spreadLowerArmyAcrossBoard: true,
        });
        const wolf = getPreviewPlaySnapshot()?.units.find((unit) => unit.name === "Wolf");
        expect(wolf).toBeDefined();

        const baseCell = { x: 9, y: 2 };
        const cells = GridMath.getFootprintCellsForAnchor(baseCell, wolf!.footprintWidth, wolf!.footprintHeight);
        expect(cells).toHaveLength(2);

        const response = applyPreviewPlayAction({
            actionId: "place-1",
            gameId: "preview-placement",
            playerId: "preview-player-lower",
            expectedSequence: getPreviewPlaySnapshot()?.latestSequence ?? 0,
            type: PlayActionType.PLACE_UNIT,
            unitId: wolf!.id,
            cells,
        });
        expect(response.accepted).toBe(true);

        const placed = getPreviewPlaySnapshot()?.units.find((unit) => unit.id === wolf!.id);
        expect(placed?.cells).toEqual(cells);
        expect(placed?.baseCell).toEqual(baseCell);
    });
});
