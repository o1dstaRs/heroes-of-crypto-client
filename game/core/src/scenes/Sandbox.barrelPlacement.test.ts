import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    Artifact,
    FightStateManager,
    Grid,
    GridMath,
    GridSettings,
    GridVals,
    TeamVals,
    type GameAction,
    type HoCMath,
    type TeamType,
} from "@heroesofcrypto/common";

import { Sandbox, type IPlacementSelectionCapture, type SceneActionEngine } from "./Sandbox";

const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
const point = (cell: HoCMath.XY) =>
    GridMath.getPositionForCell(cell, settings.getMinX(), settings.getStep(), settings.getHalfStep());
const originalFight = FightStateManager.getInstance().getFightProperties();
beforeEach(() => {
    FightStateManager.getInstance().reset();
    FightStateManager.getInstance()
        .getFightProperties()
        .setArtifactPerTeam(TeamVals.LEFT, Artifact.ArtifactTier.TIER_1, Artifact.Tier1Artifact.BARREL_BARRICADE);
});
afterEach(() => FightStateManager.getInstance().setFightProperties(originalFight));

interface TestScene {
    MouseDown(p: HoCMath.XY): void;
    MouseMove(p: HoCMath.XY, leftDrag: boolean): void;
    MouseUp(): void;
    beginBarrelPlacement(team: TeamType, index: number): boolean;
    cancelBarrelPlacement(): void;
    getBarrelPlacementIndex(team: TeamType): number | undefined;
    capturePlacementSelection(): IPlacementSelectionCapture;
    restorePlacementSelection(capture: IPlacementSelectionCapture): void;
    propagateArtifact(team: TeamType, tier: number, id: number): boolean;
    canMoveArtifactBarrel(team: TeamType): boolean;
    sc_mouseWorld: HoCMath.XY;
}

const fixture = () => {
    const grid = new Grid(settings, GridVals.NORMAL);
    grid.placeArtifactBarrel(TeamVals.LEFT, 0, { x: 1, y: 1 });
    grid.placeArtifactBarrel(TeamVals.LEFT, 1, { x: 2, y: 1 });
    const actions: GameAction[] = [];
    const previews: { cell: HoCMath.XY; valid: boolean }[] = [];
    const legacyHover: unknown[][] = [];
    const hover = {
        hoverSelectedCells: undefined as HoCMath.XY[] | undefined,
        hoverSelectedCellsSwitchToRed: false,
        clear: () => {
            hover.hoverSelectedCells = undefined;
            hover.hoverSelectedCellsSwitchToRed = false;
        },
    };
    let editable = true;
    const scene = Object.create(Sandbox.prototype) as TestScene;
    const methods = Sandbox.prototype as unknown as TestScene;
    Object.assign(scene, {
        grid,
        unitsHolder: { getAllUnits: () => new Map() },
        sc_sceneSettings: { getGridSettings: () => settings },
        sc_mouseWorld: point({ x: 1, y: 1 }),
        hasActiveSelection: false,
        selectionFromOverlay: false,
        placementDragPointerMoved: false,
        barrelDragPointerMoved: false,
        getLogicalBattlefieldPoint: (p: HoCMath.XY) => p,
        canMoveArtifactBarrel: (team: TeamType) => editable && methods.canMoveArtifactBarrel.call(scene, team),
        getPlacement: (team: TeamType) => ({
            possibleCellPositions: () =>
                Array.from({ length: 9 }, (_, index) => ({
                    x: (index % 3) + (team === TeamVals.LEFT ? 0 : 13),
                    y: Math.floor(index / 3),
                })),
            possibleCellHashes: () =>
                new Set(Array.from({ length: 9 }, (_, index) => ((index % 3) << 4) | Math.floor(index / 3))),
        }),
        Deselect: () => scene.cancelBarrelPlacement(),
        drawHoverCells: (...args: unknown[]) => {
            legacyHover.push(args);
        },
        hoverManager: hover,
        dungeonVisuals: {
            previewBarrelPlacement: (_source: HoCMath.XY | undefined, cell: HoCMath.XY, valid: boolean) =>
                previews.push({ cell, valid }),
            clearBarrelPlacementPreview: () => undefined,
        },
        createActionEngine: (): SceneActionEngine => ({
            apply: (action) => {
                actions.push(action);
                return {
                    completed:
                        action.type === "place_barrel" &&
                        grid.placeArtifactBarrel(action.team, action.barrelIndex, action.cell),
                    events: [],
                };
            },
        }),
        applyTurnEngineEvents: () => undefined,
        snapshotRenderableUnits: () => new Map(),
        syncArtifactBarrelVisuals: () => undefined,
        refreshAfterLoadoutChange: () => undefined,
    });
    return {
        scene,
        grid,
        actions,
        previews,
        hover,
        legacyHover,
        setEditable: (value: boolean) => {
            editable = value;
        },
    };
};

describe("barrel board placement", () => {
    test("clicking the other barrel switches the selected slot", () => {
        const { scene, actions } = fixture();
        scene.MouseDown(point({ x: 1, y: 1 }));
        scene.MouseUp();
        scene.MouseDown(point({ x: 2, y: 1 }));
        scene.MouseUp();
        expect(scene.getBarrelPlacementIndex(TeamVals.LEFT)).toBe(1);
        expect(actions).toEqual([]);
    });
    test("selecting a barrel uses the unit footprint and does not cover the barrel", () => {
        const { scene, previews, hover, legacyHover } = fixture();
        scene.MouseDown(point({ x: 1, y: 1 }));
        expect(hover.hoverSelectedCells).toEqual([{ x: 1, y: 1 }]);
        expect(hover.hoverSelectedCellsSwitchToRed).toBe(false);
        expect(previews).toEqual([]);
        expect(legacyHover.every((args) => args.length === 0)).toBe(true);
        scene.MouseMove(point({ x: 2, y: 1 }), true);
        expect(hover.hoverSelectedCells).toEqual([{ x: 2, y: 1 }]);
        expect(hover.hoverSelectedCellsSwitchToRed).toBe(true);
        expect(previews.at(-1)).toEqual({ cell: { x: 2, y: 1 }, valid: false });
        scene.cancelBarrelPlacement();
        expect(hover.hoverSelectedCells).toBeUndefined();
        expect(hover.hoverSelectedCellsSwitchToRed).toBe(false);
    });
    test("click selects an owned barrel and the next click moves that slot", () => {
        const { scene, grid, actions } = fixture();
        scene.MouseDown(point({ x: 1, y: 1 }));
        scene.MouseUp();
        expect(scene.getBarrelPlacementIndex(TeamVals.LEFT)).toBe(0);
        expect(actions).toEqual([]);
        scene.MouseDown(point({ x: 0, y: 0 }));
        scene.MouseUp();
        expect(actions).toEqual([{ type: "place_barrel", team: TeamVals.LEFT, barrelIndex: 0, cell: { x: 0, y: 0 } }]);
        expect(grid.getOccupantUnitId({ x: 1, y: 1 })).toBe("");
        expect(grid.getOccupantUnitId({ x: 0, y: 0 })).toBe("B");
        expect(scene.getBarrelPlacementIndex(TeamVals.LEFT)).toBeUndefined();
    });
    test("drag keeps the origin occupied until release and previews invalid destinations", () => {
        const { scene, grid, actions, previews } = fixture();
        scene.MouseDown(point({ x: 1, y: 1 }));
        scene.MouseMove(point({ x: 2, y: 1 }), true);
        expect(previews.at(-1)?.valid).toBe(false);
        expect(actions).toEqual([]);
        expect(grid.getOccupantUnitId({ x: 1, y: 1 })).toBe("B");
        scene.MouseMove(point({ x: 0, y: 2 }), true);
        expect(previews.at(-1)).toEqual({ cell: { x: 0, y: 2 }, valid: true });
        scene.MouseUp();
        expect(actions).toHaveLength(1);
        expect(grid.getArtifactBarrels(TeamVals.LEFT).find((entry) => entry.index === 0)?.cell).toEqual({ x: 0, y: 2 });
    });
    test("occupied and outside-zone drops retain the source and never submit an illegal move", () => {
        const { scene, grid, actions } = fixture();
        scene.MouseDown(point({ x: 1, y: 1 }));
        scene.MouseMove(point({ x: 2, y: 1 }), true);
        scene.MouseUp();
        scene.MouseDown(point({ x: 8, y: 8 }));
        expect(actions).toEqual([]);
        expect(grid.getOccupantUnitId({ x: 1, y: 1 })).toBe("B");
        expect(scene.getBarrelPlacementIndex(TeamVals.LEFT)).toBe(0);
        scene.cancelBarrelPlacement();
        expect(scene.getBarrelPlacementIndex(TeamVals.LEFT)).toBeUndefined();
    });
    test("a co-op snapshot rebuild preserves a barrel drag and a lock cancels it", () => {
        const { scene, actions, setEditable } = fixture();
        scene.MouseDown(point({ x: 1, y: 1 }));
        scene.MouseMove(point({ x: 0, y: 2 }), true);
        const capture = scene.capturePlacementSelection();
        scene.cancelBarrelPlacement();
        scene.restorePlacementSelection(capture);
        scene.MouseUp();
        expect(actions).toHaveLength(1);
        scene.beginBarrelPlacement(TeamVals.LEFT, 1);
        setEditable(false);
        scene.MouseMove(point({ x: 0, y: 0 }), true);
        expect(scene.getBarrelPlacementIndex(TeamVals.LEFT)).toBeUndefined();
        expect(scene.beginBarrelPlacement(TeamVals.LEFT, 0)).toBe(false);
    });
    test("the local artifact selection immediately reserves an adjacent pair", () => {
        const { scene, grid } = fixture();
        grid.clearArtifactBarrels(TeamVals.LEFT);
        expect(
            scene.propagateArtifact(
                TeamVals.LEFT,
                Artifact.ArtifactTier.TIER_1,
                Artifact.Tier1Artifact.BARREL_BARRICADE,
            ),
        ).toBe(true);
        const [first, second] = grid.getArtifactBarrels(TeamVals.LEFT);
        expect(Math.abs(first.cell.x - second.cell.x) + Math.abs(first.cell.y - second.cell.y)).toBe(1);
        expect(grid.getOccupantUnitId(first.cell)).toBe("B");
        expect(grid.getOccupantUnitId(second.cell)).toBe("B");
    });
});
