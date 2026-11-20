import { FightStateManager, GridConstants, GridSettings } from "@heroesofcrypto/common";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { Sandbox } from "./Sandbox";

const gridSettings = () =>
    new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );

const hoverScene = () => {
    let updates = 0;
    let lastPoint: { x: number; y: number } | undefined;
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        hasActiveSelection: true,
        sc_selectedUnitProperties: { id: "stack" },
        sc_mouseWorld: { x: 0, y: 0 },
        selectionFromOverlay: false,
        draggingUnitId: "stack",
        placementDragPointerOrigin: { x: 0, y: 0 },
        placementDragPointerMoved: true,
        layoutVersion: 1,
        placementHoverKey: "",
        sc_sceneSettings: { getGridSettings: () => gridSettings() },
        hoverManager: {
            updateHoverPlacementCell(point: { x: number; y: number }) {
                updates += 1;
                lastPoint = point;
            },
        },
        unitsHolder: {
            getAllUnits: () => new Map([["stack", { getPosition: () => ({ x: 0, y: 64 }) }]]),
        },
    }) as unknown as {
        refreshPlacementHover: () => void;
        placementHoverKey: string;
        placementDragPointerMoved: boolean;
        sc_mouseWorld: { x: number; y: number };
        hasActiveSelection: boolean;
    };
    return {
        scene,
        updates: () => updates,
        lastPoint: () => lastPoint,
    };
};

const originalFight = FightStateManager.getInstance().getFightProperties();
beforeEach(() => FightStateManager.getInstance().reset());
afterEach(() => FightStateManager.getInstance().setFightProperties(originalFight));

describe("placement hover cache", () => {
    test("a still pointer does not rescan the board, and a new cell does", () => {
        const { scene, updates } = hoverScene();

        scene.refreshPlacementHover();
        scene.refreshPlacementHover();
        expect(updates()).toBe(1);

        scene.sc_mouseWorld = { x: 0, y: 400 };
        scene.refreshPlacementHover();
        expect(updates()).toBe(2);
    });

    test("dropping the selection clears the cache and does not scan", () => {
        const { scene, updates } = hoverScene();
        scene.refreshPlacementHover();
        scene.hasActiveSelection = false;

        scene.refreshPlacementHover();

        expect(updates()).toBe(1);
        expect(scene.placementHoverKey).toBe("");
    });

    test("before the drag threshold, the hover stays on the unit rather than the pointer", () => {
        const { scene, updates, lastPoint } = hoverScene();
        scene.placementDragPointerMoved = false;
        scene.sc_mouseWorld = { x: 0, y: 400 };

        scene.refreshPlacementHover();

        expect(updates()).toBe(1);
        expect(lastPoint()).toEqual({ x: 0, y: 64 });
    });

    const clickScene = () => {
        const { scene } = hoverScene();
        const calls: string[] = [];
        Object.assign(scene, {
            hoverManager: {
                hoverSelectedCells: [{ x: 1, y: 1 }],
                hoverSelectedCellsSwitchToRed: false,
                hoverPlacementCellTeam: 1,
                updateHoverPlacementCell: (point: { x: number; y: number }) =>
                    calls.push(`hover ${point.x},${point.y}`),
                setLastPlacement: () => undefined,
                resetBoardHoverState: () => undefined,
            },
            grid: { getArtifactBarrels: () => [] },
            getLogicalBattlefieldPoint: (point: { x: number; y: number }) => point,
            handleCreatureAnimationLabBoardClick: () => false,
            handlePlacementBenchToggleAt: () => false,
            getGridUnitAtPosition: () => undefined,
            getBenchUnitAtPosition: () => undefined,
            tryPlaceUnit: () => calls.push("place"),
        });
        return { scene: scene as typeof scene & { MouseDown(point: { x: number; y: number }): void }, calls };
    };

    test("a click still aims at the pointer, not the cached preview", () => {
        const { scene, calls } = clickScene();
        // The cached preview is still the one drawn under the unit before the drag threshold.
        scene.placementDragPointerMoved = false;
        scene.refreshPlacementHover();
        calls.length = 0;

        scene.MouseDown({ x: 0, y: 400 });

        expect(calls).toEqual(["hover 0,400", "place"]);
    });

    test("picking a unit up previews it where it stands, not under the clicked torso", () => {
        const { scene, calls } = clickScene();
        const unit = {
            getId: () => "other",
            getTeam: () => 1,
            getPosition: () => ({ x: 0, y: 128 }),
            getUnitProperties: () => ({ id: "other" }),
            setBoardSelected: () => undefined,
        };
        scene.hasActiveSelection = false;
        Object.assign(scene, {
            draggingUnitId: undefined,
            placementBenchHitBoxes: new Map(),
            getUnitAtPosition: () => unit,
            canSelectUnitForPlacement: () => true,
            setSelectedUnitProperties: () => undefined,
            hover: () => undefined,
        });

        scene.MouseDown({ x: 10, y: 150 });

        expect(calls).toEqual(["hover 0,128"]);
    });
});
