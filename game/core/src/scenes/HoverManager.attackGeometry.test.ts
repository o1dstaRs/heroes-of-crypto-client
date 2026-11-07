import { afterEach, describe, expect, test } from "bun:test";
import { GridConstants, GridMath, GridSettings, type HoCMath, type UnitProperties } from "@heroesofcrypto/common";
import { Container, Graphics } from "pixi.js";

import { releaseBoardMirror, setBoardMirror } from "../pixi/boardMirror";
import { placementZonePolygon } from "../pixi/PixiDrawablePlacement";
import { HoverManager, type ISandboxHoverContext, type RangeTargetEdgeVisual } from "./HoverManager";
import { CREATURE_ATTACK_FOREGROUND_Z_INDEX } from "./RenderableUnit";
import { tunedCellFillPolygon } from "./movementAreaVisual";
import { projectBattlefieldPoint, rangeAttackCellSideCenter } from "./sandbox/BattlefieldVisualGrid";

type XY = HoCMath.XY;
type Visuals = { hoverAttackOrigin?: Graphics };
const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const roots: Container[] = [];
afterEach(() => {
    for (const root of roots.splice(0)) {
        releaseBoardMirror(root);
        root.destroy({ children: true });
    }
});

function fixture(width = 1, height = 1, mirrored = false) {
    const root = new Container({ sortableChildren: true });
    root.position.set(800, 650);
    root.scale.set(mirrored ? -0.8 : 0.8, -0.54);
    roots.push(root);
    setBoardMirror(root, mirrored);
    const liveProps = { size: 1, footprint_width: width, footprint_height: height } as UnitProperties;
    const active = { getUnitProperties: () => liveProps, getName: () => "Wolf" };
    const hover = new HoverManager({
        sceneSettings: { getGridSettings: () => gs },
        getCurrentActiveUnit: () => active,
        // The selection cache must not shrink a rectangular active unit's attack origin.
        getSelectedUnitProperties: () => ({ size: 1 }),
        getCameraScale: () => ({ x: Math.abs(root.scale.x), y: Math.abs(root.scale.y) }),
        attachToWorldRoot: (child: Container, depth: number) => {
            child.zIndex = depth;
            root.addChild(child);
        },
        texAny: () => undefined,
    } as unknown as ISandboxHoverContext);
    const visuals = hover as unknown as Visuals;
    const melee = (anchor: XY) => {
        hover.hoverAttackFromCell = anchor;
        const logical = GridMath.getPositionForFootprintAnchor(gs, anchor, width, height);
        hover.updateHoverSilhouette(logical);
        const from = projectBattlefieldPoint(logical, gs);
        hover.drawAttackArrow(from, { x: from.x + 128, y: from.y + 64 }, undefined, undefined, "melee");
        return visuals.hoverAttackOrigin!;
    };
    const edge = (cell: XY, side: GridMath.RangeAttackCellSide): RangeTargetEdgeVisual => {
        const center = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        const h = gs.getHalfStep();
        const vertical = side === GridMath.RangeAttackCellSide.LEFT || side === GridMath.RangeAttackCellSide.RIGHT;
        const seam = rangeAttackCellSideCenter(cell, side, gs);
        return {
            cell,
            side,
            from: projectBattlefieldPoint({ x: seam.x - (vertical ? 0 : h), y: seam.y - (vertical ? h : 0) }, gs),
            to: projectBattlefieldPoint({ x: seam.x + (vertical ? 0 : h), y: seam.y + (vertical ? h : 0) }, gs),
            // Offset the decoration: its socket must never become the precision endpoint.
            markerCenter: projectBattlefieldPoint(center, gs),
            notchTip: projectBattlefieldPoint(seam, gs),
            aimPosition: GridMath.getRangeAttackSideCenter(gs, cell, side, { x: -500, y: 400 }),
            shootable: true,
            rangeDivisor: 1,
            markerScale: 1,
        };
    };
    return { root, hover, visuals, melee, edge };
}

describe("melee landing outlines", () => {
    for (const mirrored of [false, true]) {
        for (const [width, height] of [
            [1, 1],
            [2, 1],
            [1, 2],
            [2, 2],
        ]) {
            test(`${width}x${height}, mirrored ${mirrored}: live footprint stays above figures without sword artwork`, () => {
                const { root, hover, melee } = fixture(width, height, mirrored);
                const anchor = { x: 8, y: 7 };
                const outline = melee(anchor);
                const cells = GridMath.getFootprintCellsForAnchor(anchor, width, height);
                expect(hover.hoverBattlefieldFootprintCells).toHaveLength(cells.length);
                expect(hover.hoverBattlefieldFootprintCells).toEqual(expect.arrayContaining(cells));
                const polygon =
                    cells.length === 1
                        ? tunedCellFillPolygon(anchor, gs, 0.055)
                        : placementZonePolygon(cells, gs, 0.055);
                const side = { x: (polygon[0] + polygon[2]) / 2, y: (polygon[1] + polygon[3]) / 2 };
                const screen = root.toGlobal(side);
                expect(outline.containsPoint(outline.toLocal(screen))).toBe(true);
                const center = projectBattlefieldPoint(
                    GridMath.getPositionForFootprintAnchor(gs, anchor, width, height),
                    gs,
                );
                expect(outline.containsPoint(center)).toBe(false);
                expect(outline.context.instructions.every((instruction) => instruction.action === "stroke")).toBe(true);
                expect(outline.zIndex).toBeGreaterThan(CREATURE_ATTACK_FOREGROUND_Z_INDEX + 1);
                expect(outline.visible).toBe(true);
                expect(outline.eventMode).toBe("none");
            });
        }
    }

    test("reuses the border and replaces it when the landing changes", () => {
        const { melee } = fixture(2, 1);
        const first = melee({ x: 4, y: 4 });
        const oldX = first.getLocalBounds().x;
        const oldY = first.getLocalBounds().y;
        const next = melee({ x: 10, y: 9 });
        expect(next).toBe(first);
        expect(next.getLocalBounds().x).not.toBe(oldX);
        expect(next.getLocalBounds().y).not.toBe(oldY);
    });

    test("keeps the origin visible even when a short melee segment has no sword marker", () => {
        const { hover, visuals } = fixture();
        hover.hoverAttackFromCell = { x: 8, y: 7 };
        hover.drawAttackArrow({ x: 20, y: 40 }, { x: 20, y: 40 }, undefined, undefined, "melee");
        expect(visuals.hoverAttackOrigin?.visible).toBe(true);
        expect(visuals.hoverAttackOrigin?.context.instructions).toHaveLength(2);
    });
});

test("ranged targeting does not add a graphics guide over the authored arrow", () => {
    const { root, hover, edge } = fixture();
    const selected = edge({ x: 9, y: 10 }, GridMath.RangeAttackCellSide.LEFT);
    const from = { x: -700, y: 300 };
    const childrenBefore = root.children.length;
    hover.drawRangeTargetEdge(selected, from);
    hover.drawRangeTerminalArrowhead({ x: -200, y: 600 }, from);
    expect(root.children).toHaveLength(childrenBefore);
});

describe("attack preview cleanup", () => {
    for (const clear of ["clearAttackVisuals", "clearHoverSilhouette", "hideSilhouettesOnly", "clear"] as const) {
        test(`${clear} removes the landing border`, () => {
            const { hover, melee } = fixture();
            const origin = melee({ x: 8, y: 7 });
            hover[clear]();
            expect(origin.visible).toBe(false);
            expect(origin.context.instructions).toHaveLength(0);
        });
    }
});
