import { describe, expect, test } from "bun:test";

import { AttackVals, TeamVals } from "@heroesofcrypto/common";

import type { PlaySnapshot, PlayUnitState } from "../api/play_protocol";
import {
    createInitialPlayerPlacementActions,
    createModelPlacementActions,
    fallbackPlacementAnchors,
    isDefaultPlacementCell,
} from "./rankedPlacementGeometry";

/**
 * The auto-placement geometry for the SIDE-oriented ranked board, with rectangular footprints in the mix.
 * Everything here validates PLACE_UNIT payloads the way the server will: whole bodies inside the team's
 * side zone (LOWER x 1-3, UPPER x 12-14, y 1-14), no overlaps, nothing already placed disturbed.
 */

let unitSeq = 0;
const makeUnit = (overrides: Partial<PlayUnitState>): PlayUnitState =>
    ({
        id: overrides.id ?? `u${++unitSeq}`,
        team: TeamVals.LOWER,
        name: "Stub",
        attackType: AttackVals.MELEE,
        size: 1,
        footprintWidth: 0,
        footprintHeight: 0,
        cells: [],
        initiative: 10,
        dead: false,
        placed: false,
        ...overrides,
    }) as PlayUnitState;

const makeSnapshot = (units: PlayUnitState[]): PlaySnapshot => ({ units }) as PlaySnapshot;

const bodyOf = (action: { cells?: { x: number; y: number }[] }): { x: number; y: number }[] => action.cells ?? [];

describe("side-zone model placement with rectangular footprints", () => {
    test("a mixed roster lands whole-bodied, overlap-free, ranged at the back — both teams", () => {
        for (const team of [TeamVals.LOWER, TeamVals.UPPER]) {
            const units = [
                makeUnit({ id: "giant", team, size: 2, footprintWidth: 2, footprintHeight: 2 }),
                makeUnit({ id: "tower", team, size: 2, footprintWidth: 1, footprintHeight: 2 }),
                makeUnit({ id: "wagon", team, size: 2, footprintWidth: 2, footprintHeight: 1 }),
                makeUnit({ id: "sword", team }),
                makeUnit({ id: "archer", team, attackType: AttackVals.RANGE }),
            ];
            const actions = createModelPlacementActions(makeSnapshot(units), team);
            expect(actions.map((action) => action.unitId).sort()).toEqual(
                ["archer", "giant", "sword", "tower", "wagon"].sort(),
            );
            const seen = new Set<string>();
            for (const action of actions) {
                for (const cell of bodyOf(action)) {
                    expect(isDefaultPlacementCell(cell, team)).toBe(true);
                    const key = `${cell.x}:${cell.y}`;
                    expect(seen.has(key)).toBe(false);
                    seen.add(key);
                }
            }
            // The two-cell bodies really are two cells, and the square four.
            const byId = new Map(actions.map((action) => [action.unitId, bodyOf(action)]));
            expect(byId.get("giant")).toHaveLength(4);
            expect(byId.get("tower")).toHaveLength(2);
            expect(byId.get("wagon")).toHaveLength(2);
            // Ranged hides on the back column of the SIDE zone (x, not y).
            const backX = team === TeamVals.UPPER ? 14 : 1;
            for (const cell of byId.get("archer")!) {
                expect(cell.x).toBe(backX);
            }
            // The vertical body stands upright (one column), the horizontal one lies flat (one row).
            expect(new Set(byId.get("tower")!.map((cell) => cell.x)).size).toBe(1);
            expect(new Set(byId.get("wagon")!.map((cell) => cell.y)).size).toBe(1);
        }
    });

    test("the biggest body places first and placed stacks are never disturbed or overlapped", () => {
        const blocker = makeUnit({
            id: "blocker",
            placed: true,
            cells: [
                { x: 3, y: 7 },
                { x: 3, y: 8 },
                { x: 2, y: 7 },
                { x: 2, y: 8 },
            ],
        });
        const units = [
            makeUnit({ id: "sword" }),
            makeUnit({ id: "giant", size: 2, footprintWidth: 2, footprintHeight: 2 }),
            blocker,
        ];
        const actions = createModelPlacementActions(makeSnapshot(units), TeamVals.LOWER);
        expect(actions.map((action) => action.unitId)).toEqual(["giant", "sword"]);
        const blocked = new Set(blocker.cells.map((cell) => `${cell.x}:${cell.y}`));
        for (const action of actions) {
            for (const cell of bodyOf(action)) {
                expect(blocked.has(`${cell.x}:${cell.y}`)).toBe(false);
            }
        }
    });

    test("fallback anchors never let a body spill past the zone edge", () => {
        // A 3-wide melee body on the depth-3 zone has exactly one legal column per team; every
        // candidate the ladder still offers keeps the whole body in-zone at any candidate y.
        for (const team of [TeamVals.LOWER, TeamVals.UPPER]) {
            for (const [width, height] of [
                [3, 1],
                [2, 1],
                [1, 2],
                [1, 3],
                [2, 2],
            ] as const) {
                for (const ranged of [false, true]) {
                    const anchors = fallbackPlacementAnchors(team, width, height, ranged);
                    expect(anchors.length).toBeGreaterThan(0);
                    for (const anchor of anchors) {
                        for (let dx = 0; dx < width; dx++) {
                            for (let dy = 0; dy < height; dy++) {
                                expect(isDefaultPlacementCell({ x: anchor.x - dx, y: anchor.y - dy }, team)).toBe(true);
                            }
                        }
                    }
                }
            }
            const wideAnchors = fallbackPlacementAnchors(team, 3, 1, false);
            expect(new Set(wideAnchors.map((anchor) => anchor.x)).size).toBe(1);
        }
    });
});

describe("initial line placement on the side zones", () => {
    test("a fresh army forms one vertical, centred, overlap-free line with its front edge on the centre column", () => {
        for (const team of [TeamVals.LOWER, TeamVals.UPPER]) {
            const units = [
                makeUnit({ id: "giant", team, size: 2, footprintWidth: 2, footprintHeight: 2 }),
                makeUnit({ id: "tower", team, size: 2, footprintWidth: 1, footprintHeight: 2 }),
                makeUnit({ id: "wagon", team, size: 2, footprintWidth: 2, footprintHeight: 1 }),
                makeUnit({ id: "sword", team }),
            ];
            const actions = createInitialPlayerPlacementActions(makeSnapshot(units), team);
            expect(actions).toHaveLength(4);
            const frontX = team === TeamVals.UPPER ? 12 : 3;
            const seen = new Set<string>();
            const rows: number[] = [];
            for (const action of actions) {
                const cells = bodyOf(action);
                // Front edge on the column nearest the battlefield centre, whatever the body's width.
                const nearest =
                    team === TeamVals.UPPER
                        ? Math.min(...cells.map((cell) => cell.x))
                        : Math.max(...cells.map((cell) => cell.x));
                expect(nearest).toBe(frontX);
                for (const cell of cells) {
                    expect(isDefaultPlacementCell(cell, team)).toBe(true);
                    const key = `${cell.x}:${cell.y}`;
                    expect(seen.has(key)).toBe(false);
                    seen.add(key);
                    rows.push(cell.y);
                }
            }
            // Bodies span 2+2+1+1 = 6 rows; with the one-cell gaps the 9-row line is centred on y 1-14.
            expect(Math.min(...rows)).toBe(3);
            expect(Math.max(...rows)).toBe(11);
        }
    });

    test("a reconnect with any stack already placed falls back to collision-safe anchors", () => {
        const placedUnit = makeUnit({
            id: "keeper",
            placed: true,
            cells: [{ x: 3, y: 7 }],
        });
        const units = [placedUnit, makeUnit({ id: "sword" })];
        const actions = createInitialPlayerPlacementActions(makeSnapshot(units), TeamVals.LOWER);
        // Only the unplaced stack moves, and not onto the placed one.
        expect(actions.map((action) => action.unitId)).toEqual(["sword"]);
        for (const cell of bodyOf(actions[0])) {
            expect(`${cell.x}:${cell.y}`).not.toBe("3:7");
            expect(isDefaultPlacementCell(cell, TeamVals.LOWER)).toBe(true);
        }
    });
});
