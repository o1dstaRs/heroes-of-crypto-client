import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    CreatureVals,
    FightStateManager,
    Grid,
    GridConstants,
    GridSettings,
    GridVals,
    TeamVals,
    scatteredMountainsForSeed,
} from "@heroesofcrypto/common";

import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import { PlayTransientCellKind } from "../api/play_protocol";
import { RankedPlayScene, authoritativeSnapshotToSandboxSceneState } from "./RankedPlayScene";
import { Sandbox, type SandboxSceneState, type SandboxSceneUnitState } from "./Sandbox";

/**
 * The BOARD in a replay: the Cemetery's barrels, and the terrain spells lay on it (smoke, vines, fire walls).
 *
 * Both are restored in live play by steps that run AFTER hydrateSceneState — applyScatteredMountainsFromSnapshot
 * and syncRankedTransientTerrain. A replay never runs either: it turns each snapshot into a SandboxSceneState
 * and hydrates it, and a hydrate actively destroys both (refreshWithNewType re-carves the classic mountain
 * pair over any scattered layout; reset() builds a fresh FightProperties whose terrain stores are empty). So
 * a replayed fight showed no barrels and no fire wall at all — the board they were fought on was gone.
 *
 * These cover the two halves of the fix: the state CARRIES them (mapper + sandbox capture), and the hydrate
 * puts them back. The scattered stones' hydrate is driven on every map in RankedPlayScene.barrelPlacement.test.ts.
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

const gridSettings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);

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

        test("a normal board carries deployed artifact barrels", () => {
            const state = authoritativeSnapshotToSandboxSceneState(
                snapshotWith({
                    gridType: GridVals.NORMAL,
                    scatteredStandingCells: [packed({ x: 7, y: 7 })],
                    scatteredStandingCount: 1,
                }),
            );

            expect(state.scatteredMountains).toEqual([{ x: 7, y: 7, variant: expect.any(Number) }]);
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

    describe("the sandbox's own replays record and restore the same board", () => {
        const originalFight = FightStateManager.getInstance().getFightProperties();
        beforeEach(() => FightStateManager.getInstance().reset());
        afterEach(() => FightStateManager.getInstance().setFightProperties(originalFight));

        const captureScene = (scattered: boolean, standing: { x: number; y: number }[]) =>
            Object.assign(Object.create(Sandbox.prototype), {
                unitsHolder: { getAllUnits: () => new Map() },
                grid: {
                    getOccupantUnitId: () => "",
                    getArtifactBarrels: () => [],
                    getScatteredMountainsStanding: () => standing,
                },
                dungeonVisuals: {
                    isCenterDried: () => false,
                    hasScatteredMountains: () => scattered,
                    getScatteredMountains: () => [
                        { x: 4, y: 4, variant: 1 },
                        { x: 9, y: 3, variant: 2 },
                    ],
                },
                getFightResultSetup: () => undefined,
            }) as { captureSceneState(): SandboxSceneState };

        test("the capture records the board, not just the units on it", () => {
            const fightProps = FightStateManager.getInstance().getFightProperties();
            fightProps.getSmokeClouds().add({ x: 1, y: 2 }, 3);
            fightProps.getVines().add({ x: 3, y: 4 }, 2, TeamVals.RIGHT);
            fightProps.getFireWalls().add({ x: 5, y: 6 }, 1);
            fightProps.restoreStepsMoraleMultiplier(3);

            // Only STANDING stones: a destroyed one's cell may well be occupied by a unit by now.
            const state = captureScene(true, [{ x: 9, y: 3 }]).captureSceneState();

            expect(state.scatteredMountains).toEqual([{ x: 9, y: 3, variant: 2 }]);
            expect(state.terrainCells).toEqual([
                { kind: "smoke", x: 1, y: 2, lapsRemaining: 3 },
                { kind: "vine", x: 3, y: 4, lapsRemaining: 2, team: TeamVals.RIGHT },
                expect.objectContaining({ kind: "fire_wall", x: 5, y: 6, lapsRemaining: 1 }),
            ]);
            expect(state.stepsMoraleMultiplier).toBe(3);
        });

        test("scattered mode is read from the visuals, which still know it with every stone destroyed", () => {
            expect(captureScene(true, []).captureSceneState().scatteredMountains).toEqual([]);
            expect(captureScene(false, []).captureSceneState().scatteredMountains).toBeUndefined();
        });

        /**
         * A real hydrate on a real grid. Presentation dependencies are stubbed; the reset, the re-carve, the
         * terrain/queue restores and the post-rebuild Water Shield prune run through production code.
         */
        const hydrateScene = (units: Map<string, unknown>) => {
            const scene = Object.create(RankedPlayScene.prototype);
            const activations: string[][] = [];
            Object.assign(scene, {
                grid: new Grid(gridSettings, GridVals.NORMAL),
                sc_sceneSettings: { getGridSettings: () => gridSettings },
                unitsHolder: {
                    getAllUnits: () => units,
                    addUnit: () => undefined,
                    refreshStackPowerForAllUnits: () => undefined,
                },
                // Rebuilding sprites is not under test: the rebuild hands back the scripted board unit.
                createRenderableUnitFromSceneState: (state: SandboxSceneUnitState) => units.get(state.properties.id),
                dungeonVisuals: {
                    setScatteredMountains: () => undefined,
                    clearHoleLayers: () => undefined,
                    setCenterDried: () => undefined,
                },
                placementManager: { rebuildFromFightProps: () => undefined },
                hoverManager: { clear: () => undefined },
                combatVisuals: { clear: () => undefined },
                rangedProjectiles: { clear: () => undefined },
                drawnNarrowingLaps: new Set(),
                revealedOpponentUnitIds: new Set(),
                drawer: { getUnitsContainer: () => undefined },
                layoutVersion: 0,
                destroySpecificUnits: () => undefined,
                clearPlacementBench: () => undefined,
                renderNarrowingLayers: () => undefined,
                refreshUnits: () => undefined,
                refreshVisibleStateIfNeeded: () => undefined,
                updateUnitsOverlayVisibility: () => undefined,
                destroyTempFixtures: () => undefined,
                updateDungeonAtmosphere: () => undefined,
                fightStatsTracker: { start: () => undefined },
                updateLiveFightStats: () => undefined,
                // The activation reads the queue, so record what it would have seen.
                handleNextUnitActivation: () =>
                    activations.push([
                        ...FightStateManager.getInstance().getFightProperties().getUpNextQueueIterable(),
                    ]),
            });
            return {
                scene: scene as { hydrateSceneState(state: SandboxSceneState): void; getUpNextUnitIds(): unknown },
                activations,
            };
        };

        test("the hydrate restores the terrain, queue and movement penalty its reset destroyed, before activation", () => {
            const active = { getId: () => "active", isDead: () => false, hasAbilityActive: () => false };
            const { scene, activations } = hydrateScene(new Map([["active", active]]));
            const fightProps = FightStateManager.getInstance().getFightProperties();
            fightProps.getSmokeClouds().add({ x: 9, y: 9 }, 2);

            scene.hydrateSceneState({
                ...authoritativeSnapshotToSandboxSceneState(snapshotWith({ currentUnitId: "active" })),
                terrainCells: [
                    { kind: "smoke", x: 1, y: 2, lapsRemaining: 3 },
                    { kind: "vine", x: 3, y: 4, lapsRemaining: 2, team: TeamVals.RIGHT },
                    { kind: "fire_wall", x: 5, y: 6, lapsRemaining: 1 },
                ],
                upNext: ["u2", "u1"],
                stepsMoraleMultiplier: 2,
            });

            const restored = FightStateManager.getInstance().getFightProperties();
            expect(restored.getSmokeClouds().has({ x: 1, y: 2 })).toBe(true);
            // Wholesale replacement: the previous board's smoke does not linger.
            expect(restored.getSmokeClouds().has({ x: 9, y: 9 })).toBe(false);
            expect(restored.getVines().toJSON()).toEqual([{ x: 3, y: 4, l: 2, t: TeamVals.RIGHT }]);
            expect(restored.getFireWalls().toJSON()).toEqual([expect.objectContaining({ x: 5, y: 6, l: 1 })]);
            expect(restored.getStepsMoraleMultiplier()).toBe(2);
            expect(activations).toEqual([["u2", "u1"]]);
            // Ranked overrides getUpNextUnitIds(), so it keeps its own authoritative copy of the queue too.
            expect(scene.getUpNextUnitIds()).toEqual(["u2", "u1"]);
        });

        test.each([
            ["absorbed its hit laps ago", [], true],
            ["still holds it", ["Water Shield"], false],
        ])("the shield a rebuild re-grants is taken back from a unit that %s", (_case, appliedBuffs, pruned) => {
            // trySeedWaterShield re-seeds every freshly built unit, so without this a replay re-lit the ring
            // on units that absorbed their hit laps ago — twice per replayed action.
            const calls: string[] = [];
            const mermaid = {
                getId: () => "mermaid",
                isDead: () => false,
                hasAbilityActive: (name: string) => name === "Water Shield",
                hasBuffActive: (name: string) => name === "Water Shield",
                deleteBuff: (name: string) => calls.push(`delete ${name}`),
                markWaterShieldSpent: () => calls.push("spent"),
            };
            const { scene } = hydrateScene(new Map([["mermaid", mermaid]]));
            const state = authoritativeSnapshotToSandboxSceneState(snapshotWith({}));

            scene.hydrateSceneState({
                ...state,
                units: [
                    {
                        properties: { id: "mermaid", amount_alive: 1, applied_buffs: appliedBuffs },
                        team: TeamVals.LEFT,
                        placed: false,
                        dead: false,
                        cells: [],
                        baseCell: { x: 0, y: 0 },
                    } as unknown as SandboxSceneUnitState,
                ],
            });

            expect(calls).toEqual(pruned ? ["delete Water Shield", "spent"] : []);
        });
    });
});
