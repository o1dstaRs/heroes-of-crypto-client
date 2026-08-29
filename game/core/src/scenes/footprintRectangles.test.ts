import { afterEach, describe, expect, test } from "bun:test";

import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridMath,
    GridSettings,
    HoCConfig,
    HoCMath,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";

import { footprintHeightOf, footprintWidthOf, meleeSwordTargetPoint } from "./HoverManager";
import { Sandbox } from "./Sandbox";
import { SandboxDrawer, type IFootprintExtent, type IGameplayDrawContext } from "./SandboxDrawer";
import { projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";

/**
 * The rectangular-footprint contract for the sandbox's interaction surface.
 *
 * No shipped creature is rectangular yet, so the shapes here come from the engine's QA override — the
 * same hook the browser exposes as `globalThis.__hocFootprintOverrides` — which is the only way to get a
 * real 2x1 Unit today. The 1x1 and 2x2 expectations are pinned alongside them on purpose: they are the
 * shapes that actually ship, and every formula in this area must keep answering for them exactly what it
 * answered before footprints existed.
 */

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

const overrides = (value?: string): void => {
    (globalThis as { __hocFootprintOverrides?: string }).__hocFootprintOverrides = value;
};

const createUnit = (factionName: string, creatureName: string, textureName: string): Unit => {
    const effectFactory = new EffectFactory();
    return Unit.createUnit(
        HoCConfig.getCreatureConfig(TeamVals.LOWER, factionName, creatureName, textureName, 1),
        gridSettings,
        TeamVals.LOWER,
        UnitVals.CREATURE,
        new AbilityFactory(effectFactory),
        effectFactory,
        false,
    );
};

/** A stand-in with just the two fields the geometry helpers below read off the scene. */
const sceneStandIn = (occupied: ReadonlyMap<number, string> = new Map<number, string>()) => ({
    sc_sceneSettings: { getGridSettings: () => gridSettings },
    grid: {
        getOccupantUnitId: (cell: HoCMath.XY) => occupied.get((cell.x << 4) | cell.y),
    },
});

const sandboxInternals = Sandbox.prototype as unknown as {
    footprintCenterForAnchor: (unit: Unit, anchor: HoCMath.XY) => HoCMath.XY;
    placementSplitFootprints: (unit: Unit, cell: HoCMath.XY) => HoCMath.XY[][];
    findOpponentLargeUnitFootprint: (unit: Unit, cell: HoCMath.XY) => HoCMath.XY[] | undefined;
};

afterEach(() => {
    overrides(undefined);
});

describe("rectangular footprints on the sandbox interaction surface", () => {
    test("a QA-overridden creature really occupies its WxH rectangle, anchored top-right", () => {
        overrides("White Tiger=2x1");
        const tiger = createUnit("Nature", "White Tiger", "white_tiger_512");

        expect(tiger.getFootprintWidth()).toBe(2);
        expect(tiger.getFootprintHeight()).toBe(1);

        const anchor = { x: 5, y: 7 };
        const center = GridMath.getPositionForFootprintAnchor(gridSettings, anchor, 2, 1);
        tiger.setPosition(center.x, center.y);

        // The whole round trip the interaction code leans on: centre -> anchor -> cells -> centre.
        expect(tiger.getBaseCell()).toEqual(anchor);
        expect(tiger.getCells()).toEqual([
            { x: 5, y: 7 },
            { x: 4, y: 7 },
        ]);
        expect(GridMath.getPositionForCells(gridSettings, tiger.getCells())).toEqual(center);
    });

    test("footprint sides fall back to `size` for properties that predate footprints", () => {
        const properties = HoCConfig.getCreatureConfig(TeamVals.LOWER, "Nature", "Satyr", "satyr_512", 1);
        expect(footprintWidthOf(properties)).toBe(1);
        expect(footprintHeightOf(properties)).toBe(1);

        // A wire/snapshot bag that carries only the legacy scalar still describes a square body.
        const legacy = { size: 2 } as unknown as typeof properties;
        expect(footprintWidthOf(legacy)).toBe(2);
        expect(footprintHeightOf(legacy)).toBe(2);
    });

    test("an anchor becomes the body's centre, and the shipped shapes keep their exact old answer", () => {
        const scene = sceneStandIn();
        const anchor = { x: 5, y: 7 };
        const anchorCenter = GridMath.getPositionForCell(
            anchor,
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const half = gridSettings.getHalfStep();

        const small = createUnit("Life", "Peasant", "peasant_512");
        // A one-cell body stands on its cell's centre — what getPositionForCell alone used to return.
        expect(sandboxInternals.footprintCenterForAnchor.call(scene, small, anchor)).toEqual(anchorCenter);

        const large = createUnit("Nature", "Gargantuan", "gargantuan_512");
        expect(large.getFootprintWidth()).toBe(2);
        expect(large.getFootprintHeight()).toBe(2);
        // Verbatim the engine's own `position - halfStep` when a 2x2 steps onto an attack-from cell
        // (AttackHandler): the body hangs DOWN-LEFT of the anchor, never up-right.
        expect(sandboxInternals.footprintCenterForAnchor.call(scene, large, anchor)).toEqual({
            x: anchorCenter.x - half,
            y: anchorCenter.y - half,
        });

        overrides("White Tiger=2x1,Hyena=1x2");
        const wide = createUnit("Nature", "White Tiger", "white_tiger_512");
        expect(sandboxInternals.footprintCenterForAnchor.call(scene, wide, anchor)).toEqual({
            x: anchorCenter.x - half,
            y: anchorCenter.y,
        });

        const tall = createUnit("Might", "Hyena", "hyena_512");
        expect(sandboxInternals.footprintCenterForAnchor.call(scene, tall, anchor)).toEqual({
            x: anchorCenter.x,
            y: anchorCenter.y - half,
        });
    });

    test("a split-off stack is offered its OWN shape, never a square, and never off the board", () => {
        overrides("White Tiger=2x1");
        const wide = createUnit("Nature", "White Tiger", "white_tiger_512");
        const scene = sceneStandIn();

        const candidates = sandboxInternals.placementSplitFootprints.call(scene, wide, { x: 6, y: 3 });
        expect(candidates).toEqual([
            [
                { x: 7, y: 3 },
                { x: 6, y: 3 },
            ],
            [
                { x: 6, y: 3 },
                { x: 5, y: 3 },
            ],
        ]);

        // Column 0 can only be reached by the block that starts there; the other one hangs off the board.
        expect(sandboxInternals.placementSplitFootprints.call(scene, wide, { x: 0, y: 3 })).toEqual([
            [
                { x: 1, y: 3 },
                { x: 0, y: 3 },
            ],
        ]);
    });

    test("the opponent-intent ghost picks a free block of the right shape around the relayed cell", () => {
        overrides("White Tiger=2x1");
        const wide = createUnit("Nature", "White Tiger", "white_tiger_512");

        // Nothing in the way: the relayed cell is the block's minimum corner, which is how the
        // destination cell is sent (getMoveDestinationSilhouetteCell).
        expect(sandboxInternals.findOpponentLargeUnitFootprint.call(sceneStandIn(), wide, { x: 6, y: 3 })).toEqual([
            { x: 7, y: 3 },
            { x: 6, y: 3 },
        ]);

        // With that block occupied by someone else, the ghost slides onto the other one covering the cell.
        const blocked = new Map<number, string>([[(7 << 4) | 3, "someone-else"]]);
        expect(
            sandboxInternals.findOpponentLargeUnitFootprint.call(sceneStandIn(blocked), wide, { x: 6, y: 3 }),
        ).toEqual([
            { x: 6, y: 3 },
            { x: 5, y: 3 },
        ]);
    });

    test("the melee blade stops on the edge of the target's rectangle, per axis", () => {
        const target = { x: 0, y: 0 };
        const halfCell = gridSettings.getHalfStep();

        // A 2x1 target reaches a whole cell out sideways and half a cell out vertically.
        expect(meleeSwordTargetPoint({ x: -1000, y: 0 }, target, halfCell * 2, halfCell)).toEqual({
            x: -halfCell * 2,
            y: 0,
        });
        expect(meleeSwordTargetPoint({ x: 0, y: 1000 }, target, halfCell * 2, halfCell)).toEqual({
            x: 0,
            y: halfCell,
        });

        // One extent still describes a square target, exactly as every caller used to pass it.
        expect(meleeSwordTargetPoint({ x: -1000, y: 0 }, target, halfCell)).toEqual({ x: -halfCell, y: 0 });
    });
});

/** Just enough of the Pixi Graphics chaining API to record what the drawer asked for. */
const recorder = () => {
    const polygons: number[][] = [];
    const graphics = {
        poly(points: number[]) {
            polygons.push([...points]);
            return graphics;
        },
        rect: () => graphics,
        circle: () => graphics,
        moveTo: () => graphics,
        lineTo: () => graphics,
        stroke: () => graphics,
        fill: () => graphics,
    };
    return { graphics, polygons };
};

/** The outermost aura sheet — the first thing drawn for a hovered unit's aura, at its full extent. */
const auraOutline = (footprint: IFootprintExtent, range: number, xy: HoCMath.XY): number[] => {
    const { graphics, polygons } = recorder();
    SandboxDrawer.drawGameplayVisuals(
        graphics as never,
        {
            fightProps: { hasFightStarted: () => true },
            isActiveUnitMoving: false,
            gridSettings,
            hoverGlowPhase: 0,
            sc_isAnimating: false,
            hoverManager: { drawHoverBattlefieldFootprint: () => undefined },
            hoveredAuraRanges: { xy, auraRanges: [{ range, isBuff: true }], footprint },
        } as unknown as IGameplayDrawContext,
    );
    return polygons[0];
};

describe("aura squares hug the owner's body", () => {
    const range = 2;
    const cellSize = gridSettings.getCellSize();
    const xy = { x: 0, y: 0 };
    const extentFor = (side: number) => (range + side / 2) * cellSize - cellSize * 0.055;

    test("a square body draws exactly the square it always did", () => {
        for (const side of [1, 2]) {
            const extent = extentFor(side);
            expect(auraOutline({ width: side, height: side }, range, xy)).toEqual(
                projectedRectPoints(xy.x - extent, xy.y - extent, xy.x + extent, xy.y + extent, gridSettings),
            );
        }
    });

    test("a 2x1 body draws a WIDER-than-tall field instead of over-promising a cell of reach", () => {
        const wide = auraOutline({ width: 2, height: 1 }, range, xy);
        expect(wide).toEqual(
            projectedRectPoints(
                xy.x - extentFor(2),
                xy.y - extentFor(1),
                xy.x + extentFor(2),
                xy.y + extentFor(1),
                gridSettings,
            ),
        );
        // And it is genuinely not the square a 2x2 owner would get.
        expect(wide).not.toEqual(auraOutline({ width: 2, height: 2 }, range, xy));
    });
});

/**
 * The client's two AI seats hand the engine a move's `targetCells` themselves, so they have to expand a
 * destination the same way the engine does — from the ANCHOR, growing towards -x / -y.
 *
 * Both used to detour through the destination cell's own CENTRE and expand from there. That is off by one
 * for a SQUARE body: at a cell centre the surrounding-cells expansion returns the block growing up-and-right
 * of the anchor, while the anchor's real body grows down-and-left, so a 2x2 claimed {x..x+1} x {y..y+1}
 * where the engine occupies {x-1..x} x {y-1..y}. A 2x1 and a 1x2 land on the same cells either way, which is
 * why only a square exposes it — and why this test pins the square case first.
 */
describe("a client AI seat expands a move destination from the anchor", () => {
    const anchor: HoCMath.XY = { x: 8, y: 8 };
    const key = (cells: readonly HoCMath.XY[]) =>
        cells
            .map((c) => `${c.x},${c.y}`)
            .sort()
            .join(" ");

    // What the cell-centre round trip produced, kept explicit so the regression cannot come back quietly.
    const viaCellCentre = (unit: Unit) =>
        GridMath.getFootprintCellsForPosition(
            gridSettings,
            GridMath.getPositionForCell(
                anchor,
                gridSettings.getMinX(),
                gridSettings.getStep(),
                gridSettings.getHalfStep(),
            ),
            unit.getFootprintWidth(),
            unit.getFootprintHeight(),
        );

    test("a 2x2 body hangs down-and-left of its anchor, which the cell-centre route got wrong", () => {
        const queen = createUnit("Nature", "Arachna Queen", "arachna_queen_512");
        expect([queen.getFootprintWidth(), queen.getFootprintHeight()]).toEqual([2, 2]);

        const correct = GridMath.getFootprintCellsForAnchor(anchor, 2, 2);
        expect(key(correct)).toBe("7,7 7,8 8,7 8,8");
        // The old route really did name a different block — otherwise this test proves nothing.
        expect(key(viaCellCentre(queen))).toBe("8,8 8,9 9,8 9,9");
        expect(key(viaCellCentre(queen))).not.toBe(key(correct));
    });

    test("a rectangle lands on the same cells either way, which is why a square had to be checked", () => {
        overrides("White Tiger=2x1,Hyena=1x2");
        for (const [faction, name, texture] of [
            ["Nature", "White Tiger", "white_tiger_512"],
            ["Might", "Hyena", "hyena_512"],
        ] as const) {
            const unit = createUnit(faction, name, texture);
            const correct = GridMath.getFootprintCellsForAnchor(
                anchor,
                unit.getFootprintWidth(),
                unit.getFootprintHeight(),
            );
            expect(key(viaCellCentre(unit))).toBe(key(correct));
        }
    });

    test("a one-cell body is its own destination", () => {
        const peasant = createUnit("Life", "Peasant", "peasant_512");
        expect([peasant.getFootprintWidth(), peasant.getFootprintHeight()]).toEqual([1, 1]);
        expect(key(viaCellCentre(peasant))).toBe("8,8");
        expect(key(GridMath.getFootprintCellsForAnchor(anchor, 1, 1))).toBe("8,8");
    });
});
