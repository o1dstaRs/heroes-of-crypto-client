import { describe, expect, test } from "bun:test";
import { GridSettings, TeamVals, type TeamType, type Unit } from "@heroesofcrypto/common";

import type { SandboxSceneUnitState } from "./Sandbox";
import { RankedPlayScene } from "./RankedPlayScene";
import { unprojectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

interface PlacementScene {
    viewerTeam?: TeamType;
    rankedPlacementLocked: boolean;
    shouldRenderUnplacedUnitBench(unit: SandboxSceneUnitState): boolean;
    getUnplacedUnitBenchPosition(index: number, total: number): { x: number; y: number } | undefined;
    canSelectUnitForPlacement(unit: Unit): boolean;
    getBenchUnitAtPosition(point: { x: number; y: number }): Unit | undefined;
    commitPlacementSplit(source: Unit, amount: number, cells: { x: number; y: number }[]): boolean;
}

const state = (team: TeamType, overrides: Partial<SandboxSceneUnitState> = {}): SandboxSceneUnitState =>
    ({ team, placed: false, dead: false, cells: [], ...overrides }) as SandboxSceneUnitState;

const scene = (viewerTeam?: TeamType): PlacementScene =>
    Object.assign(Object.create(RankedPlayScene.prototype), {
        viewerTeam,
        rankedPlacementLocked: false,
        sc_sceneSettings: { getGridSettings: () => new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06) },
        sc_gameActionTransport: () => {
            throw Error("Locked placement must not reach the transport");
        },
    }) as PlacementScene;

describe("ranked split fallback visibility", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        test(`team ${team}: a split with no free neighboring cell has a visible selectable fallback`, () => {
            const target = scene(team);
            const peeled = state(team);
            expect(target.shouldRenderUnplacedUnitBench(peeled)).toBe(true);
            const position = target.getUnplacedUnitBenchPosition(0, 1)!;
            expect(Number.isFinite(position.x)).toBe(true);
            expect(Number.isFinite(position.y)).toBe(true);
            expect(target.canSelectUnitForPlacement({ getTeam: () => team } as Unit)).toBe(true);
            expect(target.shouldRenderUnplacedUnitBench(state(team, { dead: true }))).toBe(false);
            const opponent = team === TeamVals.LEFT ? TeamVals.RIGHT : TeamVals.LEFT;
            expect(target.shouldRenderUnplacedUnitBench(state(opponent))).toBe(false);
        });

        test(`team ${team}: Ready prevents selecting or splitting even with an old selected unit`, () => {
            const target = scene(team);
            target.rankedPlacementLocked = true;
            const selected = { getTeam: () => team } as Unit;
            expect(target.canSelectUnitForPlacement(selected)).toBe(false);
            expect(target.commitPlacementSplit(selected, 1, [{ x: 1, y: 1 }])).toBe(false);
        });
    }

    test("spectators do not gain an unplaced army bench", () => {
        const target = scene();
        expect(target.shouldRenderUnplacedUnitBench(state(TeamVals.LEFT))).toBe(false);
        expect(target.shouldRenderUnplacedUnitBench(state(TeamVals.RIGHT))).toBe(false);
        expect(target.canSelectUnitForPlacement({ getTeam: () => TeamVals.LEFT } as Unit)).toBe(false);
        expect(target.getUnplacedUnitBenchPosition(0, 0)).toBeUndefined();
    });

    test("clicking a bench sprite survives the battlefield's inverse projection", () => {
        const target = scene(TeamVals.RIGHT);
        const unit = { getTeam: () => TeamVals.RIGHT } as Unit;
        const visibleCenter = target.getUnplacedUnitBenchPosition(0, 1)!;
        Object.assign(target, {
            placementBenchHitBoxes: new Map([["peeled", { center: visibleCenter, radius: 30 }]]),
            unitsHolder: { getAllUnits: () => new Map([["peeled", unit]]) },
        });
        const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
        const logicalPointer = unprojectBattlefieldPoint(visibleCenter, settings)!;
        expect(logicalPointer).toBeDefined();
        expect(Math.abs(logicalPointer.y - visibleCenter.y)).toBeGreaterThan(30);
        expect(target.getBenchUnitAtPosition(logicalPointer)).toBe(unit);
        const farPointer = unprojectBattlefieldPoint({ x: visibleCenter.x + 200, y: visibleCenter.y }, settings)!;
        expect(target.getBenchUnitAtPosition(farPointer)).toBeUndefined();
    });
});
