import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    Artifact,
    FightStateManager,
    Grid,
    GridMath,
    GridSettings,
    GridVals,
    TeamVals,
    scatteredMountainsForSeed,
    type GameAction,
    type GridType,
    type HoCMath,
    type TeamType,
} from "@heroesofcrypto/common";

import { createGameActionFromPlayAction, createPlayActionFromGameAction } from "../api/game_action_play_codec";
import { encodePlayAction, PlayActionType, PlayPhase, type PlayAction } from "../api/play_protocol";
import type { AuthoritativeGameSnapshot, SceneGameActionTransport } from "../game_action_transport";
import {
    RankedPlayScene,
    authoritativeSnapshotToSandboxSceneState,
    canMoveRankedArtifactBarrel,
} from "./RankedPlayScene";
import type { SandboxSceneState, SceneActionEngine } from "./Sandbox";

const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
const originalFight = FightStateManager.getInstance().getFightProperties();
beforeEach(() => FightStateManager.getInstance().reset());
afterEach(() => FightStateManager.getInstance().setFightProperties(originalFight));

type Barrel = NonNullable<AuthoritativeGameSnapshot["artifactBarrels"]>[number];
interface SceneHarness {
    sc_gameActionTransport?: SceneGameActionTransport;
    barrelPlacementAvailable: boolean;
    viewerTeam?: TeamType;
    sc_mouseWorld: HoCMath.XY;
    canMoveArtifactBarrel(team: TeamType): boolean;
    beginBarrelPlacement(team: TeamType, index: number): boolean;
    getBarrelPlacementIndex(team: TeamType): number | undefined;
    commitBarrelPlacement(): void;
    removePlacedBarrel(team: TeamType, index: number): boolean;
    createActionEngine(): SceneActionEngine;
    hydrateSceneState(state: SandboxSceneState): void;
    applyScatteredMountainsFromSnapshot(
        snapshot: AuthoritativeGameSnapshot,
        options?: { reinstallLayout?: boolean },
    ): void;
}

const cases = [GridVals.NORMAL, GridVals.WATER_CENTER, GridVals.LAVA_CENTER, GridVals.BLOCK_CENTER].flatMap((map) =>
    [TeamVals.LEFT, TeamVals.RIGHT].map((team) => ({ map, team })),
);

const fixture = (map: GridType, team: TeamType) => {
    FightStateManager.getInstance()
        .getFightProperties()
        .setArtifactPerTeam(team, Artifact.ArtifactTier.TIER_1, Artifact.Tier1Artifact.BARREL_BARRICADE);
    const grid = new Grid(settings, map);
    const scene = Object.create(RankedPlayScene.prototype) as SceneHarness;
    const artwork = new Map<string, HoCMath.XY>();
    const submitted: { action: GameAction; wire: PlayAction; bytes: Uint8Array }[] = [];
    let accepted = true;
    const transport: SceneGameActionTransport = (action) => {
        const wire = createPlayActionFromGameAction(action, {
            actionId: "barrel-action",
            gameId: "barrel-game",
            playerId: "player",
            expectedSequence: 1,
            team,
        });
        submitted.push({ action, wire, bytes: encodePlayAction(wire) });
        return { handled: true, completed: accepted };
    };
    Object.assign(scene, {
        grid,
        viewerTeam: team,
        barrelPlacementAvailable: true,
        sc_gameActionTransport: transport,
        sc_sceneSettings: { getGridSettings: () => settings },
        isPlayingAuthoritativeReplay: () => false,
        refreshGridMatrices: () => undefined,
        unitsHolder: { getAllUnits: () => new Map(), refreshStackPowerForAllUnits: () => undefined },
        getPlacement: () => ({
            possibleCellHashes: () => new Set([0, 1, 2].map((y) => ((team === TeamVals.LEFT ? 1 : 14) << 4) | y)),
        }),
        dungeonVisuals: {
            setScatteredMountains: (cells: HoCMath.XY[]) => {
                artwork.clear();
                for (const cell of cells) artwork.set(`${cell.x}:${cell.y}`, { x: cell.x, y: cell.y });
            },
            removeScatteredMountainAt: (x: number, y: number) => artwork.delete(`${x}:${y}`),
            clearBarrelPlacementPreview: () => undefined,
            clearHoleLayers: () => undefined,
            setCenterDried: () => undefined,
        },
        // Unrelated presentation dependencies of the actual hydrate. Grid/terrain, lifecycle restoration,
        // placement permissions and the ranked transport still execute through their production methods.
        placementManager: { rebuildFromFightProps: () => undefined },
        hoverManager: { clear: () => undefined },
        combatVisuals: { clear: () => undefined },
        rangedProjectiles: { clear: () => undefined },
        drawnNarrowingLaps: new Set(),
        revealedOpponentUnitIds: new Set(),
        drawer: { getUnitsContainer: () => undefined },
        layoutVersion: 0,
        clearPlacementBench: () => undefined,
        drawPlacementBenchBackdrops: () => undefined,
        renderNarrowingLayers: () => undefined,
        refreshSynergyNumbers: () => undefined,
        refreshUnits: () => undefined,
        refreshVisibleStateIfNeeded: () => undefined,
        updateUnitsOverlayVisibility: () => undefined,
        destroyTempFixtures: () => undefined,
        updateDungeonAtmosphere: () => undefined,
        fightStatsTracker: { start: () => undefined },
        updateLiveFightStats: () => undefined,
        Deselect: () => undefined,
        drawHoverCells: () => undefined,
    });
    const x = team === TeamVals.LEFT ? 1 : 14;
    const barrels: Barrel[] = [
        { team, index: 0, cell: { x, y: 1 } },
        { team, index: 1, cell: { x, y: 2 } },
    ];
    const neutral =
        map === GridVals.BLOCK_CENTER ? scatteredMountainsForSeed("barrel-game").map((rock) => rock.cell) : [];
    const snapshot = (owned: Barrel[], fields: Partial<AuthoritativeGameSnapshot> = {}): AuthoritativeGameSnapshot => ({
        gameId: "barrel-game",
        viewerTeam: team,
        phase: PlayPhase.PLACEMENT,
        gridType: map,
        currentLap: 0,
        fightStarted: false,
        fightFinished: false,
        currentUnitId: "",
        currentTurnTeam: 0,
        latestSequence: 1,
        narrowingLayers: 0,
        centerDried: false,
        units: [],
        upNext: [],
        artifactBarrels: owned,
        artifactBarrelsCount: owned.length,
        scatteredStandingCells: [...neutral, ...owned.map((barrel) => barrel.cell)].map((cell) => cell.x * 16 + cell.y),
        scatteredStandingCount: neutral.length + owned.length,
        ...fields,
    });
    const expectBoard = (owned: Barrel[]) => {
        expect(grid.getArtifactBarrels()).toEqual(owned);
        const standing = [...neutral, ...owned.map((barrel) => barrel.cell)];
        expect(grid.getScatteredMountainsStanding()).toEqual(expect.arrayContaining(standing));
        expect(grid.getScatteredMountainsStanding()).toHaveLength(standing.length);
        expect([...artwork.values()]).toEqual(expect.arrayContaining(standing));
        expect(artwork.size).toBe(standing.length);
        for (const cell of standing) expect(grid.getOccupantUnitId(cell)).toBe("B");
        for (const y of [0, 1, 2]) {
            if (!owned.some((barrel) => barrel.cell.x === x && barrel.cell.y === y)) {
                expect(grid.getOccupantUnitId({ x, y })).toBe("");
                expect(artwork.has(`${x}:${y}`)).toBe(false);
            }
        }
    };
    return {
        scene,
        grid,
        barrels,
        snapshot,
        expectBoard,
        submitted,
        setAccepted: (value: boolean) => (accepted = value),
    };
};

describe("ranked Barrel Barricade scene routing", () => {
    for (const { map, team } of cases) {
        test(`map ${map}, team ${team}: cold hydrate, moves, removals, empty lists and reconnects preserve truth`, () => {
            const { scene, barrels, snapshot, expectBoard } = fixture(map, team);
            scene.hydrateSceneState(authoritativeSnapshotToSandboxSceneState(snapshot(barrels)));
            expectBoard(barrels);

            const moved = [{ ...barrels[0], cell: { ...barrels[0].cell, y: 0 } }, barrels[1]];
            for (const owned of [moved, [barrels[1]], []]) {
                scene.applyScatteredMountainsFromSnapshot(snapshot(owned));
                expectBoard(owned);
                // A repeated snapshot cannot resurrect removed terrain or lose ownership.
                scene.applyScatteredMountainsFromSnapshot(snapshot(owned));
                expectBoard(owned);
            }

            const reconnected = fixture(map, team);
            reconnected.scene.hydrateSceneState(authoritativeSnapshotToSandboxSceneState(snapshot([moved[0]])));
            reconnected.expectBoard([moved[0]]);
            const destroyed = snapshot([], { phase: PlayPhase.PLAY, fightStarted: true, currentLap: 1 });
            reconnected.scene.applyScatteredMountainsFromSnapshot(destroyed);
            reconnected.expectBoard([]);
            // Replay/reconnect hydration must also honor the authoritative empty ownership marker.
            reconnected.scene.hydrateSceneState(authoritativeSnapshotToSandboxSceneState(destroyed));
            reconnected.expectBoard([]);
        });

        test(`map ${map}, team ${team}: actual placement callers submit both slots without committing locally`, () => {
            const { scene, grid, barrels, snapshot, expectBoard, submitted, setAccepted } = fixture(map, team);
            scene.applyScatteredMountainsFromSnapshot(snapshot(barrels));
            for (const barrelIndex of [0, 1]) {
                expect(scene.beginBarrelPlacement(team, barrelIndex)).toBe(true);
                const cell = { x: barrels[0].cell.x, y: 0 };
                scene.sc_mouseWorld = GridMath.getPositionForCell(
                    cell,
                    settings.getMinX(),
                    settings.getStep(),
                    settings.getHalfStep(),
                );
                scene.commitBarrelPlacement();
                expect(scene.getBarrelPlacementIndex(team)).toBeUndefined();
                expect(scene.removePlacedBarrel(team, barrelIndex)).toBe(true);
                expectBoard(barrels);
                const [placed, removed] = submitted.slice(-2);
                expect(placed.action).toEqual({ type: "place_barrel", team, barrelIndex, cell });
                expect(placed.wire).toMatchObject({
                    type: PlayActionType.PLACE_BARREL,
                    team,
                    amount: barrelIndex + 1,
                    targetCell: cell,
                });
                expect(removed.action).toEqual({ type: "unplace_barrel", team, barrelIndex });
                expect(removed.wire).toMatchObject({
                    type: PlayActionType.UNPLACE_BARREL,
                    team,
                    amount: barrelIndex + 1,
                });
                for (const entry of [placed, removed]) {
                    expect(entry.bytes.length).toBeGreaterThan(0);
                    expect(createGameActionFromPlayAction(entry.wire)).toEqual(entry.action);
                }
            }
            setAccepted(false);
            const before = grid.getArtifactBarrels();
            expect(scene.beginBarrelPlacement(team, 0)).toBe(true);
            scene.commitBarrelPlacement();
            expect(scene.getBarrelPlacementIndex(team)).toBe(0);
            expect(grid.getArtifactBarrels()).toEqual(before);
            expect(scene.removePlacedBarrel(team, 0)).toBe(false);
            expect(grid.getArtifactBarrels()).toEqual(before);
        });
    }

    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        test(`team ${team}: the real scene blocks foreign, locked, Setup, disconnected and finished placement`, () => {
            const { scene, snapshot, submitted } = fixture(GridVals.NORMAL, team);
            const opponent = team === TeamVals.LEFT ? TeamVals.RIGHT : TeamVals.LEFT;
            expect(scene.beginBarrelPlacement(opponent, 0)).toBe(false);
            expect(scene.removePlacedBarrel(opponent, 0)).toBe(false);
            for (const fields of [
                { viewerTeam: undefined },
                { viewerPlacementReady: true },
                { placementSplit: true, placementStage: 0 },
                { phase: PlayPhase.PLAY },
                { fightStarted: true },
                { fightFinished: true },
            ]) {
                scene.barrelPlacementAvailable = canMoveRankedArtifactBarrel(snapshot([], fields), team);
                expect(scene.beginBarrelPlacement(team, 0)).toBe(false);
                expect(scene.removePlacedBarrel(team, 0)).toBe(false);
            }
            scene.barrelPlacementAvailable = canMoveRankedArtifactBarrel(
                snapshot([], { placementSplit: true, placementStage: 1 }),
                team,
            );
            expect(scene.beginBarrelPlacement(team, 0)).toBe(true);
            FightStateManager.getInstance()
                .getFightProperties()
                .setArtifactPerTeam(team, Artifact.ArtifactTier.TIER_1, Artifact.Tier1Artifact.NO_ARTIFACT);
            expect(scene.beginBarrelPlacement(team, 1)).toBe(false);
            expect(scene.removePlacedBarrel(team, 0)).toBe(false);
            FightStateManager.getInstance()
                .getFightProperties()
                .setArtifactPerTeam(team, Artifact.ArtifactTier.TIER_1, Artifact.Tier1Artifact.BARREL_BARRICADE);
            scene.sc_gameActionTransport = undefined;
            expect(scene.beginBarrelPlacement(team, 1)).toBe(false);
            expect(scene.removePlacedBarrel(team, 0)).toBe(false);
            expect(scene.createActionEngine().apply({ type: "unplace_barrel", team, barrelIndex: 0 }).completed).toBe(
                false,
            );
            expect(submitted).toEqual([]);
        });
    }
});
