import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Grid, GridConstants, GridMath, GridSettings, GridVals, TeamVals, type GridType } from "@heroesofcrypto/common";
import { AlphaFilter, type Container, DOMAdapter, type Sprite, Texture } from "pixi.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    HoverManager,
    type ISandboxHoverContext,
    RANGE_TARGET_EDGE_LENGTH_SCALE,
    RANGE_TARGET_EDGE_INWARD_OFFSET_FRACTION,
    RANGE_TARGET_EDGE_SELECTED_SCALE,
    RANGE_TARGET_EDGE_TOP_ROW_SCALE,
    RANGED_ATTACK_TRAJECTORY_VISIBLE,
    SHOT_ARROWHEAD_NATIVE_SCREEN_ANGLE,
    SHOT_ARROWHEAD_SIZE_SCALE,
    SHOT_GOLD_ARROWHEAD_AXIS_ANCHOR_Y,
    SHOT_ORC_ARROWHEAD_AXIS_ANCHOR_Y,
    type RangeTargetEdgeVisual,
    rangeTargetEdgeMarkerDisplayLength,
    rangeTargetEdgeMarkerPosition,
    rangeTargetEdgeMarkerRowScale,
    rangeTargetEdgeTrajectoryEndpoint,
} from "./HoverManager";
import {
    closestRangeTargetEdge,
    distanceToRangeTargetEdgeSegment,
    optimalRangeTargetEdge,
    rangeAimOptions,
    rangeTargetEdgeEvaluationAim,
    rangeTargetEdgeIsSelectable,
    rangeTargetEdgeMarkerAngle,
    rangeTargetEdgeMarkerCell,
    rangeTargetEdgeOutwardNotchTip,
    rangeTargetExteriorEdges,
    rangeTrajectoryFootprintExit,
} from "./rangeTargetEdges";
import { Sandbox } from "./Sandbox";

// Filters probe shader precision through a canvas; headless tests have none to offer.
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const matrix = Array.from({ length: GridConstants.GRID_SIZE }, () =>
    Array.from({ length: GridConstants.GRID_SIZE }, () => 0),
);
const targetCell = { x: 8, y: 8 };
const cellCenter = (cell: { x: number; y: number }) =>
    GridMath.getPositionForCell(cell, gridSettings.getMinX(), gridSettings.getStep(), gridSettings.getHalfStep());

const selectableSides = (attackerCell: { x: number; y: number }) => {
    const attackerPosition = cellCenter(attackerCell);
    const targetPosition = cellCenter(targetCell);
    return [
        GridMath.RangeAttackCellSide.LEFT,
        GridMath.RangeAttackCellSide.RIGHT,
        GridMath.RangeAttackCellSide.DOWN,
        GridMath.RangeAttackCellSide.UP,
    ].filter((side) =>
        rangeTargetEdgeIsSelectable(
            matrix,
            gridSettings,
            targetCell,
            side,
            attackerPosition,
            targetPosition,
            true,
            true,
            TeamVals.LEFT,
            false,
        ),
    );
};

const candidate = (id: string, rangeDivisor: number, aimPosition: { x: number; y: number }, shootable = true) => ({
    id,
    rangeDivisor,
    aimPosition,
    shootable,
    cell: { x: 8, y: 8 },
    side: GridMath.RangeAttackCellSide.LEFT,
});

describe("ranged target edge selection", () => {
    test("applies the approved final target-arrow scale", () => {
        expect(RANGE_TARGET_EDGE_SELECTED_SCALE).toBe(1);
        expect(SHOT_ARROWHEAD_SIZE_SCALE).toBeCloseTo(0.8 * 0.7 * 0.9 * 1.15 * 1.15 * 1.2 * 1.07);
    });

    test("keeps the current size on the bottom row and reduces the top row by ten percent", () => {
        expect(RANGE_TARGET_EDGE_TOP_ROW_SCALE).toBe(0.9);
        expect(rangeTargetEdgeMarkerRowScale(0, 14)).toBe(1);
        expect(rangeTargetEdgeMarkerRowScale(6.5, 14)).toBeCloseTo(0.95);
        expect(rangeTargetEdgeMarkerRowScale(13, 14)).toBe(0.9);
        expect(rangeTargetEdgeMarkerRowScale(-1, 14)).toBe(1);
        expect(rangeTargetEdgeMarkerRowScale(14, 14)).toBe(0.9);
    });

    test("keeps the separated-arrow shooter-to-target trajectory visible", () => {
        expect(RANGED_ATTACK_TRAJECTORY_VISIBLE).toBe(true);
    });

    test("shortens the already reduced target-edge arrows by another 15 percent", () => {
        expect(RANGE_TARGET_EDGE_LENGTH_SCALE).toBeCloseTo(0.68);
    });

    test("moves every target-edge arrow inward by 50 percent of a cell", () => {
        expect(RANGE_TARGET_EDGE_INWARD_OFFSET_FRACTION).toBe(0.5);
        expect(rangeTargetEdgeMarkerPosition({ x: 120, y: 80 }, 50, GridMath.RangeAttackCellSide.LEFT)).toEqual({
            x: 145,
            y: 80,
        });
        expect(rangeTargetEdgeMarkerPosition({ x: 120, y: 80 }, 50, GridMath.RangeAttackCellSide.RIGHT)).toEqual({
            x: 95,
            y: 80,
        });
        expect(rangeTargetEdgeMarkerPosition({ x: 120, y: 80 }, 50, GridMath.RangeAttackCellSide.DOWN)).toEqual({
            x: 120,
            y: 105,
        });
        expect(rangeTargetEdgeMarkerPosition({ x: 120, y: 80 }, 50, GridMath.RangeAttackCellSide.UP)).toEqual({
            x: 120,
            y: 55,
        });
    });

    test("places every marker in the cell immediately outside its target side", () => {
        expect(rangeTargetEdgeMarkerCell(targetCell, GridMath.RangeAttackCellSide.LEFT)).toEqual({ x: 7, y: 8 });
        expect(rangeTargetEdgeMarkerCell(targetCell, GridMath.RangeAttackCellSide.RIGHT)).toEqual({ x: 9, y: 8 });
        expect(rangeTargetEdgeMarkerCell(targetCell, GridMath.RangeAttackCellSide.DOWN)).toEqual({ x: 8, y: 7 });
        expect(rangeTargetEdgeMarkerCell(targetCell, GridMath.RangeAttackCellSide.UP)).toEqual({ x: 8, y: 9 });
    });

    test("draws one reused, untinted, unfiltered arrowhead sized by the approved scale and its row", () => {
        expect(SHOT_GOLD_ARROWHEAD_AXIS_ANCHOR_Y).toBeCloseTo(144 / 260);
        expect(SHOT_ORC_ARROWHEAD_AXIS_ANCHOR_Y).toBeCloseTo(144.5 / 260);
        expect(SHOT_ARROWHEAD_NATIVE_SCREEN_ANGLE).toBe(0);
        const attached: Container[] = [];
        const requested: string[] = [];
        const hover = new HoverManager({
            sceneSettings: { getGridSettings: () => gridSettings },
            getCurrentActiveUnit: () => ({ getName: () => "Elf" }),
            getCameraScale: () => ({ x: 1, y: 1 }),
            attachToWorldRoot: (child: Container) => attached.push(child),
            texAny: (key: string) => (requested.push(key), Texture.WHITE),
        } as unknown as ISandboxHoverContext);
        const edge = (markerScale: number) =>
            ({ markerCenter: { x: 0, y: 0 }, markerScale }) as unknown as RangeTargetEdgeVisual;
        const fullSize =
            (rangeTargetEdgeMarkerDisplayLength(gridSettings.getCellSize()) * SHOT_ARROWHEAD_SIZE_SCALE) /
            Texture.WHITE.width;

        hover.drawRangeTargetEdge(edge(1), { x: -500, y: 0 });
        const marker = attached[0] as Sprite;
        expect(attached).toHaveLength(1);
        expect(Math.abs(marker.scale.x)).toBeCloseTo(fullSize);
        // A stale tint or filter from elsewhere never survives a redraw: the authored art is final.
        marker.tint = 0x4dff83;
        marker.filters = [new AlphaFilter()];
        marker.roundPixels = true;
        hover.drawRangeTargetEdge(edge(RANGE_TARGET_EDGE_TOP_ROW_SCALE), { x: -500, y: 0 });

        expect(attached).toEqual([marker]);
        expect(Math.abs(marker.scale.x)).toBeCloseTo(fullSize * RANGE_TARGET_EDGE_TOP_ROW_SCALE);
        expect(marker.tint).toBe(0xffffff);
        expect(marker.filters ?? []).toEqual([]);
        expect(marker.roundPixels).toBe(false);
        expect(marker.anchor.x).toBe(0.66);
        // Every ranged creature uses the approved Orc bronze set (shotTrajectoryUsesOrcPalette).
        expect(requested).toContain("shot_trajectory_orc_bronze_arrowhead_distant_match_v8");
        expect(marker.anchor.y).toBeCloseTo(SHOT_ORC_ARROWHEAD_AXIS_ANCHOR_Y);
        marker.destroy();
    });

    test("the scene scales each edge marker by the row of the cell it sits in", () => {
        const target = {
            getId: () => "target",
            getCells: () => [{ x: 8, y: 13 }],
            getPosition: () => cellCenter({ x: 8, y: 13 }),
            isSmallSize: () => true,
        };
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            sc_sceneSettings: { getGridSettings: () => gridSettings },
            grid: { getMatrix: () => matrix },
            unitsHolder: { getAllUnits: () => new Map() },
            attackHandler: {
                evaluateRangeAttack: () => ({ affectedUnits: [[target]], rangeAttackDivisors: [1] }),
            },
        }) as { rangeTargetEdgeVisuals(attacker: unknown, target: unknown): RangeTargetEdgeVisual[] };
        const shooter = {
            hasAbilityActive: () => false,
            getPosition: () => cellCenter({ x: 2, y: 2 }),
            isSmallSize: () => true,
            getTeam: () => TeamVals.LEFT,
        };
        const edges = scene.rangeTargetEdgeVisuals(shooter, target);
        expect(edges.length).toBeGreaterThan(0);
        for (const edge of edges) {
            const row = rangeTargetEdgeMarkerCell(edge.cell, edge.side).y;
            expect(edge.markerScale).toBe(rangeTargetEdgeMarkerRowScale(row, GridConstants.GRID_SIZE));
            expect(edge.markerScale).toBeLessThan(1);
        }
    });

    test("snaps to the exact hovered shootable segment and ignores distant pointers", () => {
        const left = { id: "left", from: { x: 0, y: 0 }, to: { x: 0, y: 100 } };
        const right = { id: "right", from: { x: 100, y: 0 }, to: { x: 100, y: 100 } };
        const marker = {
            id: "marker",
            from: { x: 200, y: 0 },
            to: { x: 200, y: 100 },
            markerCenter: { x: 50, y: 40 },
        };
        expect(distanceToRangeTargetEdgeSegment({ x: 96, y: 40 }, right.from, right.to)).toBe(4);
        expect(closestRangeTargetEdge([left, right], { x: 96, y: 40 }, 12)?.id).toBe("right");
        expect(closestRangeTargetEdge([left, right], { x: 50, y: 40 }, 12)).toBeUndefined();
        expect(closestRangeTargetEdge([left, right, marker], { x: 50, y: 40 }, 12)?.id).toBe("marker");
    });

    test("chooses retained damage before distance, then the nearest edge to the shooter", () => {
        const shooter = { x: 0, y: 0 };
        const closeHalf = candidate("close-half", 2, { x: 10, y: 0 });
        const farFull = candidate("far-full", 1, { x: 100, y: 0 });
        const nearFull = candidate("near-full", 1, { x: 80, y: 0 });
        const blockedBest = candidate("blocked-best", 1, { x: 1, y: 0 }, false);

        expect(optimalRangeTargetEdge([closeHalf, farFull], shooter)?.id).toBe("far-full");
        expect(optimalRangeTargetEdge([farFull, nearFull, blockedBest], shooter)?.id).toBe("near-full");
        expect(optimalRangeTargetEdge([blockedBest], shooter)).toBeUndefined();
    });

    test("a Double Shot may aim through a blocked edge, but a clean edge still wins", () => {
        const shooter = { x: 0, y: 0 };
        const closeHalf = candidate("close-half", 2, { x: 10, y: 0 });
        const blockedBest = candidate("blocked-best", 1, { x: 1, y: 0 }, false);
        const blockedFar = candidate("blocked-far", 1, { x: 90, y: 0 }, false);

        // Shot one hits whatever screens the target; shot two carries on to it.
        expect(optimalRangeTargetEdge([blockedBest], shooter, { allowIntercepted: true })?.id).toBe("blocked-best");
        expect(optimalRangeTargetEdge([blockedFar, blockedBest], shooter, { allowIntercepted: true })?.id).toBe(
            "blocked-best",
        );
        // Never trade a shot that reaches the target for one a screen would eat.
        expect(optimalRangeTargetEdge([blockedBest, closeHalf], shooter, { allowIntercepted: true })?.id).toBe(
            "close-half",
        );
        // Without the opt-in nothing changes for a single-shot attacker.
        expect(optimalRangeTargetEdge([blockedBest], shooter)).toBeUndefined();
    });

    test("one aim policy answers both the single-shot and the two-shot attacker", () => {
        expect(rangeAimOptions(true)).toEqual({ allowIntercepted: true });
        expect(rangeAimOptions(false)).toEqual({ allowIntercepted: false });
    });

    test("keeps enumeration order on an exact optimal-edge tie", () => {
        const first = {
            id: "first",
            rangeDivisor: 1,
            aimPosition: { x: 10, y: 0 },
            shootable: true,
            cell: { x: 8, y: 8 },
            side: GridMath.RangeAttackCellSide.LEFT,
        };
        const second = { ...first, id: "second", aimPosition: { x: -10, y: 0 } };
        expect(optimalRangeTargetEdge([first, second], { x: 0, y: 0 })?.id).toBe("first");
    });

    test("a mage trajectory lands on the one optimal exterior edge, like a shot", () => {
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            sc_sceneSettings: { getGridSettings: () => gridSettings },
            grid: { getOccupantUnitId: () => undefined },
            throwTransparency: () => undefined,
        }) as {
            optimalSpellTrajectoryAim(spell: unknown, caster: unknown, target: unknown): GridMath.IClosestSideCenter;
        };
        const cells = [
            { x: 8, y: 8 },
            { x: 9, y: 8 },
            { x: 8, y: 9 },
            { x: 9, y: 9 },
        ];
        for (const [casterCell, side, edgeCell] of [
            [{ x: 2, y: 8 }, GridMath.RangeAttackCellSide.LEFT, { x: 8, y: 8 }],
            [{ x: 9, y: 15 }, GridMath.RangeAttackCellSide.UP, { x: 9, y: 9 }],
        ] as const) {
            const casterPosition = cellCenter(casterCell);
            const aim = scene.optimalSpellTrajectoryAim(
                { getName: () => "Vine Throw" },
                { getPosition: () => casterPosition },
                { getCells: () => cells },
            );
            expect(aim).toEqual({
                cell: edgeCell,
                side,
                position: rangeTargetEdgeEvaluationAim(gridSettings, edgeCell, side, casterPosition),
            });
        }
    });

    test("draws the Fire Strike fallback rail only when terrain refuses the cast", () => {
        // A valid cast already owns exactly one HoverManager beam; a second rail here doubled it.
        const strokes = (gridType: GridType, target: { x: number; y: number }) => {
            let drawn = 0;
            const g = {
                moveTo: () => g,
                lineTo: () => g,
                poly: () => g,
                circle: () => g,
                fill: () => g,
                stroke: () => (drawn++, g),
            };
            const unit = (cell: { x: number; y: number }) => ({
                getPosition: () => cellCenter(cell),
                getTeam: () => TeamVals.LEFT,
            });
            const scene = Object.assign(Object.create(Sandbox.prototype), {
                currentActiveSpell: { getName: () => "Fire Strike" },
                hoveredThrowTarget: () => ({
                    caster: unit({ x: 2, y: 7 }),
                    from: { x: 2, y: 7 },
                    target: unit(target),
                    to: target,
                }),
                sc_sceneSettings: { getGridSettings: () => gridSettings },
                grid: new Grid(gridSettings, gridType),
                unitsHolder: { getAllUnits: () => new Map() },
                throwTransparency: () => undefined,
                optimalSpellTrajectoryAim: () => undefined,
                highlightScatteredObstaclesAlongTrajectory: () => undefined,
                hoverGlowPhase: 0,
            }) as { drawInterceptedThrowAim(g: unknown): void };
            scene.drawInterceptedThrowAim(g);
            return drawn;
        };
        expect(strokes(GridVals.NORMAL, { x: 13, y: 7 })).toBe(0);
        expect(strokes(GridVals.BLOCK_CENTER, { x: 13, y: 7 })).toBeGreaterThan(0);
    });

    test("keeps the approved arrowhead screen-straight and rotates only in 90-degree steps", () => {
        expect(rangeTargetEdgeMarkerAngle(GridMath.RangeAttackCellSide.LEFT)).toBe(0);
        expect(rangeTargetEdgeMarkerAngle(GridMath.RangeAttackCellSide.RIGHT)).toBe(Math.PI);
        expect(rangeTargetEdgeMarkerAngle(GridMath.RangeAttackCellSide.DOWN)).toBe(Math.PI / 2);
        expect(rangeTargetEdgeMarkerAngle(GridMath.RangeAttackCellSide.UP)).toBe(-Math.PI / 2);
    });

    test("keeps a diagonal terminal arrow collinear with its casing trajectory", () => {
        const trajectoryFrom = { x: 20, y: 30 };
        const markerPosition = { x: 170, y: 110 };
        const endpoint = rangeTargetEdgeTrajectoryEndpoint(
            trajectoryFrom,
            markerPosition,
            GridMath.RangeAttackCellSide.UP,
            100,
            { x: 1.7, y: 0.85 },
        );
        const trajectory = {
            x: markerPosition.x - trajectoryFrom.x,
            y: markerPosition.y - trajectoryFrom.y,
        };
        const toEndpoint = { x: endpoint.x - trajectoryFrom.x, y: endpoint.y - trajectoryFrom.y };
        const cross = trajectory.x * toEndpoint.y - trajectory.y * toEndpoint.x;

        expect(cross).toBeCloseTo(0, 8);
        expect(Math.hypot(toEndpoint.x, toEndpoint.y)).toBeLessThan(Math.hypot(trajectory.x, trajectory.y));
    });

    test("points the center notch outside each target edge", () => {
        const center = { x: 50, y: 60 };
        expect(rangeTargetEdgeOutwardNotchTip(center, GridMath.RangeAttackCellSide.LEFT, 5)).toEqual({
            x: 45,
            y: 60,
        });
        expect(rangeTargetEdgeOutwardNotchTip(center, GridMath.RangeAttackCellSide.RIGHT, 5)).toEqual({
            x: 55,
            y: 60,
        });
        expect(rangeTargetEdgeOutwardNotchTip(center, GridMath.RangeAttackCellSide.DOWN, 5)).toEqual({
            x: 50,
            y: 55,
        });
        expect(rangeTargetEdgeOutwardNotchTip(center, GridMath.RangeAttackCellSide.UP, 5)).toEqual({
            x: 50,
            y: 65,
        });
    });

    test("starts a ranged trajectory where it exits the shooter's footprint", () => {
        expect(rangeTrajectoryFootprintExit({ x: 0, y: 0 }, { x: 100, y: 20 }, 10, 10)).toEqual({
            x: 10,
            y: 2,
        });
        expect(rangeTrajectoryFootprintExit({ x: 0, y: 0 }, { x: 20, y: -100 }, 10, 10)).toEqual({
            x: 2,
            y: -10,
        });
        expect(rangeTrajectoryFootprintExit({ x: 4, y: 7 }, { x: 4, y: 7 }, 10, 10)).toEqual({ x: 4, y: 7 });
    });

    test("returns every exposed large-unit segment separately and omits internal seams", () => {
        const edges = rangeTargetExteriorEdges([
            { x: 8, y: 8 },
            { x: 9, y: 8 },
            { x: 8, y: 9 },
            { x: 9, y: 9 },
        ]);

        expect(edges).toHaveLength(8);
        for (const side of [
            GridMath.RangeAttackCellSide.LEFT,
            GridMath.RangeAttackCellSide.RIGHT,
            GridMath.RangeAttackCellSide.DOWN,
            GridMath.RangeAttackCellSide.UP,
        ]) {
            expect(edges.filter((edge) => edge.side === side)).toHaveLength(2);
        }
        expect(edges).not.toContainEqual({ cell: { x: 8, y: 8 }, side: GridMath.RangeAttackCellSide.RIGHT });
        expect(edges).not.toContainEqual({ cell: { x: 8, y: 8 }, side: GridMath.RangeAttackCellSide.UP });
    });

    test.each([
        [
            "left and upper from an upper-left",
            { x: 2, y: 12 },
            [GridMath.RangeAttackCellSide.LEFT, GridMath.RangeAttackCellSide.UP],
        ],
        [
            "right and lower from a lower-right",
            { x: 12, y: 2 },
            [GridMath.RangeAttackCellSide.RIGHT, GridMath.RangeAttackCellSide.DOWN],
        ],
    ])("matches the live aim resolver: %s shooter", (_, shooter, sides) => {
        expect(selectableSides(shooter).sort()).toEqual([...sides].sort());
    });

    test("keeps right and upper evaluation endpoints inside the target cell", () => {
        const attackerPosition = cellCenter({ x: 12, y: 12 });
        for (const side of [GridMath.RangeAttackCellSide.RIGHT, GridMath.RangeAttackCellSide.UP]) {
            const aim = rangeTargetEdgeEvaluationAim(gridSettings, targetCell, side, attackerPosition);
            expect(GridMath.getCellForPosition(gridSettings, aim)).toEqual(targetCell);
        }
    });

    test("an attack click targets the cells a unit stands on, never its drawn sprite", () => {
        // OWNER CALL (2026-08-28), the same rule selection follows. Sprite hit-testing aimed the strike at
        // whatever art was drawn over the clicked cell instead of what occupies it: clicking a Crusader
        // struck the Troglodyte next to it, and when the mis-picked body was not adjacent the reachability
        // guard dropped the click with no strike, no message and no request. Excluding just the acting unit
        // was not enough — any third creature's overhanging art could win the pick.
        const source = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");
        const attackClick = source.slice(
            source.indexOf("// Unit Attack Interaction"),
            source.indexOf("if (this.currentActiveUnit && this.currentActiveKnownPaths"),
        );
        const code = attackClick
            .split("\n")
            .filter((line) => !line.trim().startsWith("//"))
            .join("\n");

        // The engine-validated melee resolve first (it also drew the cursor), then grid occupancy.
        const resolved = code.indexOf("pointerMeleeAttack?.target");
        const occupiedCell = code.indexOf("this.unitsHolder.getAllUnits().get(occupantId)");
        expect(resolved).toBeGreaterThanOrEqual(0);
        expect(occupiedCell).toBeGreaterThan(resolved);

        // Comments are stripped first: the block explains WHY the sprite pick is gone, and naming it in
        // prose must not read as calling it.
        expect(code).not.toContain("getUnitSpriteAtPosition(");
        expect(code).not.toContain("spriteHitDepth(");
    });
});
