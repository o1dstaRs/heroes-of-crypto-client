import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CreatureVals, GridConstants, GridVals, TeamVals, scatteredMountainsForSeed } from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import { PlayTransientCellKind } from "../api/play_protocol";
import { authoritativeSnapshotToSandboxSceneState } from "./RankedPlayScene";

/**
 * The BOARD in a replay: the Cemetery's barrels, and the terrain spells lay on it (smoke, vines, fire walls).
 *
 * Both are restored in live play by steps that run AFTER hydrateSceneState — applyScatteredMountainsFromSnapshot
 * and syncRankedTransientTerrain. A replay never runs either: it turns each snapshot into a SandboxSceneState
 * and hydrates it, and a hydrate actively destroys both (refreshWithNewType re-carves the classic mountain
 * pair over any scattered layout; reset() builds a fresh FightProperties whose terrain stores are empty). So
 * a replayed fight showed no barrels and no fire wall at all — the board they were fought on was gone.
 *
 * These pin the two halves of the fix: the state CARRIES them (mapper + sandbox capture), and the hydrate
 * puts them back before anything paths on the rebuilt board.
 */
const snapshotWith = (overrides: Partial<AuthoritativeGameSnapshot>): AuthoritativeGameSnapshot => ({
    gameId: "game-1",
    viewerTeam: TeamVals.LEFT,
    phase: 1,
    gridType: GridVals.NORMAL,
    currentLap: 3,
    fightStarted: true,
    fightFinished: false,
    currentUnitId: "",
    currentTurnTeam: 0,
    latestSequence: 1,
    narrowingLayers: 0,
    centerDried: false,
    units: [],
    upNext: [],
    ...overrides,
});

const packed = (cell: { x: number; y: number }): number => cell.x * GridConstants.GRID_SIZE + cell.y;

describe("replay board terrain", () => {
    describe("the barrels travel inside the scene state", () => {
        const seededStones = scatteredMountainsForSeed("game-1");

        test("a scattered board carries the stones the server still reports standing", () => {
            const standing = seededStones.slice(0, 3);
            const state = authoritativeSnapshotToSandboxSceneState(
                snapshotWith({
                    gridType: GridVals.BLOCK_CENTER,
                    scatteredStandingCells: standing.map((rock) => packed(rock.cell)),
                    scatteredStandingCount: standing.length,
                }),
            );

            expect(state.scatteredMountains).toHaveLength(standing.length);
            expect(new Set(state.scatteredMountains?.map((stone) => `${stone.x}:${stone.y}`))).toEqual(
                new Set(standing.map((rock) => `${rock.cell.x}:${rock.cell.y}`)),
            );
            // The art variant travels too, or a replayed stone would be redrawn as a different barrel.
            for (const rock of standing) {
                const restored = state.scatteredMountains?.find(
                    (stone) => stone.x === rock.cell.x && stone.y === rock.cell.y,
                );
                expect(restored?.variant).toBe(rock.variant);
            }
        });

        test("every stone destroyed is an EMPTY layout, not an absent one", () => {
            // The difference matters: undefined means "classic pair", and an empty array is what stops the
            // pair ghosting back onto a scattered board whose stones have all been knocked out.
            const state = authoritativeSnapshotToSandboxSceneState(
                snapshotWith({
                    gridType: GridVals.BLOCK_CENTER,
                    scatteredStandingCells: [],
                    scatteredStandingCount: 0,
                }),
            );

            expect(state.scatteredMountains).toEqual([]);
        });

        test("a classic-pair board (older server, no scattered state) keeps its mountains", () => {
            const state = authoritativeSnapshotToSandboxSceneState(snapshotWith({ gridType: GridVals.BLOCK_CENTER }));

            expect(state.scatteredMountains).toBeUndefined();
        });

        test("a board that is not BLOCK_CENTER never carries stones", () => {
            const state = authoritativeSnapshotToSandboxSceneState(
                snapshotWith({
                    gridType: GridVals.NORMAL,
                    scatteredStandingCells: [packed({ x: 7, y: 7 })],
                    scatteredStandingCount: 1,
                }),
            );

            expect(state.scatteredMountains).toBeUndefined();
        });
    });

    describe("smoke, vines and fire walls travel inside the scene state", () => {
        test("each kind is carried with its remaining laps", () => {
            const state = authoritativeSnapshotToSandboxSceneState(
                snapshotWith({
                    transientCellsCount: 3,
                    transientCells: [
                        { kind: PlayTransientCellKind.SMOKE, x: 1, y: 2, lapsRemaining: 3, team: 0 },
                        { kind: PlayTransientCellKind.VINE, x: 3, y: 4, lapsRemaining: 2, team: TeamVals.RIGHT },
                        { kind: PlayTransientCellKind.FIRE_WALL, x: 5, y: 6, lapsRemaining: 1, team: 0 },
                    ],
                }),
            );

            expect(state.terrainCells).toEqual([
                { kind: "smoke", x: 1, y: 2, lapsRemaining: 3, team: 0 },
                // A vine snares the OTHER side only, so the team that threw it has to survive the replay.
                { kind: "vine", x: 3, y: 4, lapsRemaining: 2, team: TeamVals.RIGHT },
                { kind: "fire_wall", x: 5, y: 6, lapsRemaining: 1, team: 0 },
            ]);
        });

        test("a cleared board carries an empty list, so a replayed cast can expire", () => {
            // transientCellsCount present with no cells is the server saying "nothing burning": without the
            // empty list the previous hydrate's terrain would linger for the rest of the replay.
            const state = authoritativeSnapshotToSandboxSceneState(
                snapshotWith({ transientCellsCount: 0, transientCells: [] }),
            );

            expect(state.terrainCells).toEqual([]);
        });

        test("an unknown kind is dropped rather than replayed as the wrong terrain", () => {
            const state = authoritativeSnapshotToSandboxSceneState(
                snapshotWith({
                    transientCellsCount: 1,
                    transientCells: [{ kind: 99, x: 1, y: 1, lapsRemaining: 2, team: 0 }],
                }),
            );

            expect(state.terrainCells).toEqual([]);
        });

        test("a server too old to carry the cells leaves the journal-tail rebuild alone", () => {
            const state = authoritativeSnapshotToSandboxSceneState(snapshotWith({}));

            expect(state.terrainCells).toBeUndefined();
        });
    });

    describe("the rest of the board state the live path restores after a hydrate", () => {
        test("the movement penalty travels, so late-lap move ranges are the ones that were played", () => {
            const state = authoritativeSnapshotToSandboxSceneState(snapshotWith({ stepsMoraleMultiplier: -3 }));

            expect(state.stepsMoraleMultiplier).toBe(-3);
        });

        test("a unit that has already retaliated replays as one that has", () => {
            const state = authoritativeSnapshotToSandboxSceneState(
                snapshotWith({
                    units: [
                        {
                            id: "u1",
                            team: TeamVals.LEFT,
                            name: "Peasant",
                            creatureId: CreatureVals.PEASANT,
                            amountAlive: 10,
                            amountDied: 0,
                            hp: 10,
                            maxHp: 10,
                            attackType: 0,
                            size: 1,
                            baseCell: { x: 1, y: 1 },
                            cells: [{ x: 1, y: 1 }],
                            initiative: 0,
                            morale: 0,
                            dead: false,
                            placed: true,
                            stackPower: 1,
                            rangeShots: 0,
                            luck: 0,
                            onHourglass: false,
                            responded: true,
                        },
                    ],
                }),
            );

            expect(state.units[0]?.responded).toBe(true);
        });
    });

    /**
     * Source-level, in the same spirit as replayTurnStatusIcons.test.ts: capture and hydrate both build real
     * Pixi sprites, so the wiring is pinned where it lives.
     */
    describe("the sandbox's own replays record and restore the same board", () => {
        const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        const sliceBetween = (from: string, to: string): string => {
            const start = source.indexOf(from);
            expect(start).toBeGreaterThanOrEqual(0);
            const end = source.indexOf(to, start);
            expect(end).toBeGreaterThan(start);
            return source.slice(start, end);
        };
        const capture = sliceBetween(
            "private captureSceneState(): SandboxSceneState {",
            "private captureScatteredMountains(",
        );
        const hydrate = sliceBetween(
            "protected hydrateSceneState(snapshot: SandboxSceneState): void {",
            "private restoreInspectedUnit(",
        );

        test("the capture records the board, not just the units on it", () => {
            expect(capture).toContain("scatteredMountains: this.captureScatteredMountains()");
            expect(capture).toContain("terrainCells: Sandbox.captureTerrainCells(fightProps)");
            expect(capture).toContain("stepsMoraleMultiplier: fightProps.getStepsMoraleMultiplier()");
            expect(capture).toContain("responded: unit.getResponded()");
        });

        test("a rebuilt unit is handed its retaliation state back", () => {
            const rebuildUnit = sliceBetween(
                "private createRenderableUnitFromSceneState(",
                "private captureSceneState(",
            );
            expect(rebuildUnit).toContain("setResponded(unitState.responded ?? false)");
        });

        test("the shield a rebuild re-grants is taken back from whoever already spent it", () => {
            // trySeedWaterShield re-seeds every freshly built unit, so without this a replay re-lit the ring
            // on units that absorbed their hit laps ago — twice per replayed action.
            expect(hydrate).toContain("this.pruneRebuiltWaterShields(snapshot)");
            const ranked = readFileSync(join(import.meta.dir, "RankedPlayScene.ts"), "utf8");
            // One post-hydrate implementation, on the path a replay actually takes. (Ranked keeps its own
            // no-rebuild reconcile for LIVE units, which is a different path and stays.)
            expect(ranked).not.toContain("authoritativelyShielded");
        });

        test("scattered mode is read from the visuals, which still know it with every stone destroyed", () => {
            const captureStones = sliceBetween("private captureScatteredMountains(", "/** Smoke, vines and fire walls");
            expect(captureStones).toContain("this.dungeonVisuals?.hasScatteredMountains()");
            // Only STANDING stones: a destroyed one's cell may well be occupied by a unit by now.
            expect(captureStones).toContain("this.grid.getScatteredMountainsStanding()");
        });

        test("the hydrate re-stamps the board AFTER the reset that destroys it and BEFORE units occupy cells", () => {
            const recarve = hydrate.indexOf("this.grid.refreshWithNewType(snapshot.gridType)");
            const stones = hydrate.indexOf("this.applySceneStateScatteredMountains(snapshot.scatteredMountains)");
            const terrain = hydrate.indexOf("Sandbox.applySceneStateTerrainCells(fightProps, snapshot.terrainCells)");
            const occupy = hydrate.indexOf("this.grid.occupyCells(cells, unit.getId()");
            expect(recarve).toBeGreaterThanOrEqual(0);
            expect(stones).toBeGreaterThan(recarve);
            expect(terrain).toBeGreaterThan(recarve);
            expect(occupy).toBeGreaterThan(stones);
            expect(occupy).toBeGreaterThan(terrain);
        });
    });
});
