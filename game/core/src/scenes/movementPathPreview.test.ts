import { describe, expect, test } from "bun:test";
import { FightProperties, GridConstants, GridMath, GridSettings, TeamVals, type HoCMath } from "@heroesofcrypto/common";
import type { Graphics } from "pixi.js";

import { HoverManager, combatFootprintCellsForBase } from "./HoverManager";
import { SandboxDrawer, type IGameplayDrawContext } from "./SandboxDrawer";
import type { RenderableUnit } from "./RenderableUnit";
import { tunedCellFillPolygon } from "./movementAreaVisual";
import { projectBattlefieldPoint, projectedPolyline } from "./sandbox/BattlefieldVisualGrid";

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

const detour = [
    { x: 3, y: 4 },
    { x: 4, y: 5 },
    { x: 5, y: 5 },
    { x: 6, y: 5 },
    { x: 7, y: 4 },
];

function setup(width = 1, height = 1, route = detour) {
    const fightProps = new FightProperties();
    fightProps.startFight();
    // This wall sits on the direct line, while the selected route walks around it.
    fightProps.getFireWalls().add({ x: 5, y: 4 }, 3);
    const origin = route[0];
    const destination = route[route.length - 1];
    const unit = {
        canMove: () => true,
        canFly: () => false,
        getBaseCell: () => origin,
        getCells: () => GridMath.getFootprintCellsForAnchor(origin, width, height),
        getPosition: () => GridMath.getPositionForFootprintAnchor(gs, origin, width, height),
        getFootprintWidth: () => width,
        getFootprintHeight: () => height,
        getUnitProperties: () => ({
            size: width === 1 && height === 1 ? 1 : 2,
            footprint_width: width,
            footprint_height: height,
        }),
        getAuraRanges: () => [],
        getAuraIsBuff: () => [],
        getTeam: () => TeamVals.LEFT,
    } as unknown as RenderableUnit;
    const context = {
        fightProps,
        isActiveUnitMoving: false,
        gridSettings: gs,
        hoverGlowPhase: 0,
        sc_isAnimating: false,
        currentActiveUnit: unit,
        currentActiveKnownPaths: new Map([
            [
                (destination.x << 4) | destination.y,
                [
                    {
                        cell: destination,
                        route,
                        weight: route.length - 1,
                        firstAggrMet: false,
                        hasLavaCell: false,
                        hasWaterCell: false,
                    },
                ],
            ],
        ]),
        hoverManager: {
            hoverBattlefieldFootprintCells: combatFootprintCellsForBase(destination, width, height),
            drawHoverBattlefieldFootprint: () => {},
        },
    } as unknown as IGameplayDrawContext;
    const polygons: { points: number[]; closed: boolean | undefined }[] = [];
    const dots: HoCMath.XY[] = [];
    const g = {
        poly(points: number[], closed?: boolean) {
            polygons.push({ points: [...points], closed });
            return g;
        },
        circle(x: number, y: number) {
            dots.push({ x, y });
            return g;
        },
        stroke: () => g,
        fill: () => g,
    } as unknown as Graphics;
    const draw = () => {
        polygons.length = 0;
        dots.length = 0;
        SandboxDrawer.drawGameplayVisuals(g, context);
    };
    return { context, fightProps, unit, polygons, dots, draw };
}

describe("projected movement with Fire Wall", () => {
    test("draws the selected route around fire rather than a straight line or all reachable cells", () => {
        const scene = setup();
        // Alternative routes must not replace the first route that movement execution will choose.
        const alternatives = scene.context.currentActiveKnownPaths!.get((7 << 4) | 4)!;
        alternatives.push({ ...alternatives[0], route: [detour[0], detour[detour.length - 1]] });

        scene.draw();

        const expected = projectedPolyline(
            detour.map((cell) => GridMath.getPositionForFootprintAnchor(gs, cell, 1, 1)),
            gs,
        );
        expect(scene.polygons).toEqual([
            { points: expected, closed: false },
            { points: expected, closed: false },
        ]);
        expect(scene.dots).toEqual(
            detour
                .slice(1)
                .map((cell) => projectBattlefieldPoint(GridMath.getPositionForFootprintAnchor(gs, cell, 1, 1), gs)),
        );
    });

    test("highlights fire crossed en route even when the destination is safe", () => {
        const scene = setup();
        scene.fightProps.getFireWalls().add({ x: 5, y: 5 }, 3);

        scene.draw();

        expect(scene.polygons.filter((polygon) => polygon.closed !== false)).toEqual([
            { points: tunedCellFillPolygon({ x: 5, y: 5 }, gs), closed: undefined },
        ]);
    });

    test("uses the landing from the melee hover preview for an approach path", () => {
        const scene = setup(2, 1);
        const destination = detour[detour.length - 1];
        const hover = Object.assign(Object.create(HoverManager.prototype), {
            context: { getCurrentActiveUnit: () => scene.unit },
            hoverAttackFromCell: destination,
            drawHoverBattlefieldFootprint: () => {},
        }) as HoverManager;
        hover.updateHoverSilhouette(GridMath.getPositionForFootprintAnchor(gs, destination, 2, 1));
        scene.context.hoverManager = hover;

        scene.draw();

        expect(hover.hoverBattlefieldFootprintCells).toEqual(combatFootprintCellsForBase(destination, 2, 1));
        expect(scene.polygons.filter((polygon) => polygon.closed === false)[1].points).toEqual(
            projectedPolyline(
                detour.map((cell) => GridMath.getPositionForFootprintAnchor(gs, cell, 2, 1)),
                gs,
            ),
        );
    });

    for (const [width, height] of [
        [2, 1],
        [1, 2],
        [2, 2],
    ]) {
        test(`centres the route on a ${width}x${height} body and highlights fire under its non-anchor cells`, () => {
            const route = [
                { x: 5, y: 5 },
                { x: 6, y: 5 },
                { x: 7, y: 5 },
            ];
            const scene = setup(width, height, route);
            scene.fightProps.getFireWalls().clear();
            const burningCell = width > 1 ? { x: 6, y: 5 } : { x: 7, y: 4 };
            scene.fightProps.getFireWalls().add(burningCell, 3);
            // The footprint order does not determine its anchor (move and melee previews can differ).
            scene.context.hoverManager.hoverBattlefieldFootprintCells!.reverse();

            scene.draw();

            const expected = projectedPolyline(
                route.map((cell) => GridMath.getPositionForFootprintAnchor(gs, cell, width, height)),
                gs,
            );
            expect(scene.polygons.filter((polygon) => polygon.closed === false)).toEqual([
                { points: expected, closed: false },
                { points: expected, closed: false },
            ]);
            expect(scene.polygons.filter((polygon) => polygon.closed !== false)).toEqual([
                { points: tunedCellFillPolygon(burningCell, gs), closed: undefined },
            ]);
        });
    }

    test("does not mark the fire the creature already occupies as a new crossing", () => {
        const scene = setup(2, 2);
        scene.fightProps.getFireWalls().clear();
        scene.fightProps.getFireWalls().add(detour[0], 3);

        scene.draw();

        expect(scene.polygons.every((polygon) => polygon.closed === false)).toBeTrue();
        expect(scene.polygons).toHaveLength(2);
    });

    for (const state of [
        "flying",
        "no fire",
        "placement",
        "animating",
        "moving",
        "immobilized",
        "no landing",
        "unreachable",
    ] as const) {
        test(`hides the travel path when ${state}`, () => {
            const scene = setup();
            switch (state) {
                case "flying":
                    scene.unit.canFly = () => true;
                    break;
                case "no fire":
                    scene.fightProps.getFireWalls().clear();
                    break;
                case "placement":
                    scene.context.fightProps = new FightProperties();
                    scene.context.fightProps.getFireWalls().add({ x: 5, y: 4 }, 3);
                    break;
                case "animating":
                    scene.context.sc_isAnimating = true;
                    break;
                case "moving":
                    scene.context.isActiveUnitMoving = true;
                    break;
                case "immobilized":
                    scene.unit.canMove = () => false;
                    break;
                case "no landing":
                    scene.context.hoverManager.hoverBattlefieldFootprintCells = undefined;
                    break;
                case "unreachable":
                    scene.context.currentActiveKnownPaths!.clear();
                    break;
            }

            scene.draw();

            expect(scene.polygons).toHaveLength(0);
            expect(scene.dots).toHaveLength(0);
        });
    }

    test("removes the path as soon as the last Fire Wall expires", () => {
        const scene = setup();
        scene.draw();
        expect(scene.polygons).toHaveLength(2);

        for (let lap = 0; lap < 3; lap += 1) scene.fightProps.getFireWalls().minusAllLaps();
        scene.draw();

        expect(scene.polygons).toHaveLength(0);
        expect(scene.dots).toHaveLength(0);
    });

    test("shows no travel when aiming at the creature's current cell", () => {
        const scene = setup(1, 1, [detour[0]]);

        scene.draw();

        expect(scene.polygons).toHaveLength(0);
        expect(scene.dots).toHaveLength(0);
    });
});
