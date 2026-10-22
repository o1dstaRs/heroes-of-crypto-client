import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

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
    }) as Sandbox & {
        refreshPlacementHover: () => void;
        placementHoverKey: string;
        placementDragPointerMoved: boolean;
    };
    return {
        scene,
        updates: () => updates,
        lastPoint: () => lastPoint,
    };
};

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

    test("a click still aims at the pointer, not the cached preview", () => {
        const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        const mouseDown = source.slice(
            source.indexOf("// 2. PRE-FIGHT PLACEMENT INTERACTION"),
            source.indexOf("private closeSpellBook"),
        );
        expect(mouseDown).toContain("this.hoverManager.updateHoverPlacementCell(p)");
        expect(mouseDown).toContain("this.hoverManager.updateHoverPlacementCell(unit.getPosition())");
        expect(mouseDown).not.toContain("refreshPlacementHover");
    });
});
