import { afterEach, describe, expect, test } from "bun:test";
import { GridConstants, GridMath, GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container, Sprite, Texture } from "pixi.js";

import { HoverManager, type ISandboxHoverContext } from "./HoverManager";
import { rangeTrajectoryFootprintExit } from "./rangeTargetEdges";
import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

type XY = HoCMath.XY;
const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const SHOOTER_DEPTH = 3275.2;
const cellCenter = (x: number, y: number) =>
    GridMath.getPositionForCell({ x, y }, gs.getMinX(), gs.getStep(), gs.getHalfStep());
const shooterCell = cellCenter(3, 4);
/** The projected rail of an aim from a cell centre toward a target point, as the hover draws it. */
const rail = (from: XY, target: XY) => ({
    start: projectBattlefieldPoint(rangeTrajectoryFootprintExit(from, target, gs.getHalfStep(), gs.getHalfStep()), gs),
    end: projectBattlefieldPoint(target, gs),
});

const roots: Container[] = [];
afterEach(() => {
    for (const root of roots.splice(0)) root.destroy({ children: true });
});

function board() {
    const world = new Container({ sortableChildren: true });
    const units = new Container({ sortableChildren: true });
    units.zIndex = 1000;
    world.addChild(units);
    roots.push(world);
    const figure = new Sprite(Texture.WHITE);
    figure.zIndex = SHOOTER_DEPTH;
    units.addChild(figure);
    let attaches = 0;
    const hover = new HoverManager({
        sceneSettings: { getGridSettings: () => gs },
        getCameraScale: () => ({ x: 1, y: 1 }),
        getCurrentActiveUnit: () => ({ getName: () => "Arbalester" }),
        texAny: () => Texture.WHITE,
        attachToWorldRoot: (child: Container, zIndex: number) => {
            attaches += 1;
            world.addChild(child);
            child.zIndex = zIndex;
        },
        attachToUnitDepthRoot: (child: Container, zIndex: number) => {
            attaches += 1;
            units.addChild(child);
            child.zIndex = zIndex;
        },
        // Sandbox's rule, reduced to its direction test.
        getRangeAimDepth: (from: XY, to: XY) => (to.y > from.y ? SHOOTER_DEPTH : undefined),
    } as unknown as ISandboxHoverContext);
    const aim = (target: XY, rememberAnimation = true) => {
        const { start, end } = rail(shooterCell, target);
        const joint = hover.drawRangeTerminalArrowhead(end, start);
        hover.drawAttackArrow(start, joint, undefined, undefined, "arrow", rememberAnimation);
    };
    const pieces = () =>
        [...world.children, ...units.children].filter((child) => child !== units && child !== figure && child.visible);
    return { world, units, aim, pieces, attaches: () => attaches };
}

describe("ranged aim behind its shooter", () => {
    test("an aim into the back rows runs on the ground behind the figure, which hides it", () => {
        const { units, aim, pieces } = board();
        aim(cellCenter(3, 6));
        // The shaft graphics, fletching, at least one casing and the target-edge arrowhead.
        expect(pieces().length).toBeGreaterThanOrEqual(4);
        for (const piece of pieces()) {
            expect(piece.parent).toBe(units);
            // Under the shooter's figure, above its ground shadow.
            expect(piece.zIndex).toBeLessThan(SHOOTER_DEPTH);
            expect(piece.zIndex).toBeGreaterThan(SHOOTER_DEPTH - 0.5);
        }
    });

    test("an aim across or toward the front rows stays painted over the board", () => {
        for (const target of [cellCenter(5, 4), cellCenter(4, 2)]) {
            const { world, units, aim, pieces } = board();
            aim(target);
            expect(pieces().length).toBeGreaterThanOrEqual(4);
            for (const piece of pieces()) {
                expect(piece.parent).toBe(world);
                expect(piece.zIndex).toBeGreaterThan(units.zIndex);
            }
        }
    });

    test("the animated aim keeps its layer between frames and moves only when it turns", () => {
        const { world, aim, pieces, attaches } = board();
        aim(cellCenter(3, 6));
        const placed = attaches();
        for (let frame = 0; frame < 3; frame += 1) aim(cellCenter(3, 6), false);
        expect(attaches()).toBe(placed);
        aim(cellCenter(5, 4));
        expect(attaches()).toBeGreaterThan(placed);
        for (const piece of pieces()) expect(piece.parent).toBe(world);
    });
});

describe("which aims run behind the shooter", () => {
    const scene = () => {
        const units = new Container();
        roots.push(units);
        const figure = new Sprite(Texture.WHITE);
        figure.zIndex = SHOOTER_DEPTH;
        units.addChild(figure);
        const shooter = {
            sprite: figure,
            getFigureDepth: RenderableUnit.prototype.getFigureDepth,
            getPosition: () => shooterCell,
            getFootprintWidth: () => 1,
            getFootprintHeight: () => 1,
        };
        const sandbox = Object.assign(Object.create(Sandbox.prototype), {
            currentActiveUnit: shooter,
            drawer: { getUnitsContainer: () => units },
            sc_sceneSettings: { getGridSettings: () => gs },
        }) as { rangeAimFigureDepth(from: XY, to: XY): number | undefined };
        const depthFor = (from: XY, target: XY) => {
            const { start, end } = rail(from, target);
            return sandbox.rangeAimFigureDepth(start, end);
        };
        return Object.assign(depthFor, { figure });
    };

    test("from the shooter's own cell toward the back rows, straight or slanted", () => {
        const depthFor = scene();
        expect(depthFor(shooterCell, cellCenter(3, 6))).toBe(SHOOTER_DEPTH);
        expect(depthFor(shooterCell, cellCenter(4, 6))).toBe(SHOOTER_DEPTH);
    });

    test("not across the row or toward the front rows", () => {
        const depthFor = scene();
        expect(depthFor(shooterCell, cellCenter(5, 4))).toBeUndefined();
        expect(depthFor(shooterCell, cellCenter(4, 2))).toBeUndefined();
    });

    test("not for a move-then-shoot aim that starts at another cell", () => {
        const depthFor = scene();
        expect(depthFor(cellCenter(5, 4), cellCenter(5, 7))).toBeUndefined();
        expect(depthFor(cellCenter(1, 4), cellCenter(1, 7))).toBeUndefined();
    });

    test("not while the figure is hidden", () => {
        const depthFor = scene();
        depthFor.figure.visible = false;
        expect(depthFor(shooterCell, cellCenter(3, 6))).toBeUndefined();
    });
});
