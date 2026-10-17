import { afterEach, describe, expect, test } from "bun:test";

import { Grid, GridSettings, GridVals, TeamVals, type GridType, type HoCMath } from "@heroesofcrypto/common";

import { PlayPhase } from "../api/play_protocol";
import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import {
    BARREL_SHADOW_EDITOR_LAYOUT,
    isBarrelShadowEditorActive,
    setBarrelShadowEditorActive,
} from "../ui/barrelShadowTuning";
import { RankedPlayScene } from "./RankedPlayScene";

const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
const originalEditorState = isBarrelShadowEditorActive();
afterEach(() => setBarrelShadowEditorActive(originalEditorState));

type Barrel = NonNullable<AuthoritativeGameSnapshot["artifactBarrels"]>[number];

function fixture(map: GridType) {
    const grid = new Grid(settings, map);
    const artwork = new Map<string, HoCMath.XY>();
    const scene = Object.assign(Object.create(RankedPlayScene.prototype), {
        grid,
        refreshGridMatrices: () => undefined,
        dungeonVisuals: {
            setScatteredMountains: (cells: HoCMath.XY[]) => {
                artwork.clear();
                for (const { x, y } of cells) artwork.set(`${x}:${y}`, { x, y });
            },
            removeScatteredMountainAt: (x: number, y: number) => artwork.delete(`${x}:${y}`),
        },
    }) as { applyScatteredMountainsFromSnapshot(snapshot: AuthoritativeGameSnapshot): void };
    return { grid, artwork, scene };
}

function snapshot(map: GridType, barrels: Barrel[]): AuthoritativeGameSnapshot {
    return {
        gameId: "barrel-editor-isolation",
        viewerTeam: TeamVals.LEFT,
        phase: PlayPhase.PLAY,
        gridType: map,
        currentLap: 1,
        fightStarted: true,
        fightFinished: false,
        currentUnitId: "",
        currentTurnTeam: TeamVals.LEFT,
        latestSequence: 1,
        narrowingLayers: 0,
        centerDried: false,
        units: [],
        upNext: [],
        artifactBarrels: barrels,
        artifactBarrelsCount: barrels.length,
        scatteredStandingCells: barrels.map(({ cell }) => cell.x * 16 + cell.y),
        scatteredStandingCount: barrels.length,
    };
}

describe("ranked barrel editor map isolation", () => {
    for (const map of [GridVals.NORMAL, GridVals.WATER_CENTER, GridVals.LAVA_CENTER]) {
        test(`map ${map} retains authoritative barrel occupancy while the editor is open`, () => {
            const baseline = fixture(map);
            const edited = fixture(map);
            const barrel: Barrel = { team: TeamVals.LEFT, index: 0, cell: { x: 1, y: 1 } };
            for (const barrels of [[barrel], [{ ...barrel, cell: { x: 1, y: 2 } }], []]) {
                const state = snapshot(map, barrels);
                setBarrelShadowEditorActive(false);
                baseline.scene.applyScatteredMountainsFromSnapshot(state);
                setBarrelShadowEditorActive(true);
                edited.scene.applyScatteredMountainsFromSnapshot(state);
                edited.scene.applyScatteredMountainsFromSnapshot(state);

                expect(edited.grid.getArtifactBarrels()).toEqual(barrels);
                expect(edited.grid.getScatteredMountainsStanding()).toEqual(
                    baseline.grid.getScatteredMountainsStanding(),
                );
                expect(edited.grid.getMatrix()).toEqual(baseline.grid.getMatrix());
                expect(edited.artwork).toEqual(baseline.artwork);
                for (const cell of BARREL_SHADOW_EDITOR_LAYOUT) {
                    expect(edited.grid.getOccupantUnitId(cell)).toBe("");
                }
            }
        });
    }

    test("the Cemetery still supports the editor's nine-barrel layout", () => {
        const { grid, artwork, scene } = fixture(GridVals.BLOCK_CENTER);
        setBarrelShadowEditorActive(true);

        scene.applyScatteredMountainsFromSnapshot(snapshot(GridVals.BLOCK_CENTER, []));

        const cells = BARREL_SHADOW_EDITOR_LAYOUT.map(({ x, y }) => ({ x, y }));
        expect(grid.getScatteredMountainsStanding()).toEqual(cells);
        expect([...artwork.values()]).toEqual(cells);
        for (const cell of cells) expect(grid.getOccupantUnitId(cell)).toBe("B");
    });
});
