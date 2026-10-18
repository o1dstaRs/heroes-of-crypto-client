import { afterEach, describe, expect, test } from "bun:test";
import { Container } from "pixi.js";
import { AttackVals, FireWallHelper, GridMath, SpellHelper, TeamVals, type TeamType } from "@heroesofcrypto/common";

import {
    createCombatTestContext,
    createTestUnit,
    placeUnit,
    testGridSettings as gs,
} from "../../../heroes-of-crypto-common/test/helpers/combat";
import { PlayAimKind, type PlayAim } from "../api/play_protocol";
import { releaseBoardMirror, setBoardMirror } from "../pixi/boardMirror";
import { OpponentAimOverlay } from "./OpponentAimOverlay";
import { resolveOpponentAimGeometry, type AimGeometryContext } from "./opponentAimGeometry";
import { rangeTargetEdgeEvaluationAim } from "./rangeTargetEdges";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";

const mirrorOwner = {};
afterEach(() => releaseBoardMirror(mirrorOwner));

function fixture(team: TeamType = TeamVals.LEFT, width = 1, height = 1, abilities: string[] = []) {
    const fight = createCombatTestContext();
    const actor = createTestUnit({
        team,
        attackType: AttackVals.RANGE,
        rangeShots: 20,
        shotDistance: 16,
        footprintWidth: width,
        footprintHeight: height,
        abilities,
        spells: ["Chaos:Fire Wall", "Chaos:Meteorite", "Life:Heal", "Life:Fire Strike", "System:Resurrection"],
    });
    placeUnit(fight.grid, fight.unitsHolder, actor, { x: 7, y: 7 });
    const context: AimGeometryContext = {
        actor,
        units: fight.unitsHolder.getAllUnits(),
        grid: fight.grid,
        settings: gs,
        evaluateRange: fight.attackHandler.evaluateRangeAttack.bind(fight.attackHandler),
    };
    const aim = (overrides: Partial<PlayAim> = {}): PlayAim => ({
        kind: PlayAimKind.RANGED,
        unitId: actor.getId(),
        cell: { x: 12, y: 7 },
        ...overrides,
    });
    return { ...fight, actor, context, aim };
}

describe("opponent aim geometry", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT])
        for (const mirrored of [false, true]) {
            for (const offset of [
                [-5, 0],
                [-5, -5],
                [0, -5],
                [5, -5],
                [5, 0],
                [5, 5],
                [0, 5],
                [-5, 5],
            ]) {
                test(`aim from team ${team}, mirror ${mirrored}, direction ${offset}`, () => {
                    setBoardMirror(mirrorOwner, mirrored);
                    const f = fixture(team);
                    const target = createTestUnit({
                        team: team === TeamVals.LEFT ? TeamVals.RIGHT : TeamVals.LEFT,
                        footprintWidth: 2,
                        footprintHeight: 1,
                    });
                    const cell = { x: 7 + offset[0], y: 7 + offset[1] };
                    placeUnit(f.grid, f.unitsHolder, target, cell);
                    const before = JSON.stringify(f.grid.getMatrix());
                    for (let side = 1; side <= 4; side++) {
                        const geometry = resolveOpponentAimGeometry(
                            f.aim({ cell, targetUnitId: target.getId(), targetSide: side }),
                            f.context,
                        )!;
                        const endpoint = rangeTargetEdgeEvaluationAim(gs, cell, side - 1, f.actor.getPosition());
                        expect(geometry.ray?.to).toEqual(endpoint);
                        const center = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
                        expect(
                            Math.max(Math.abs(endpoint.x - center.x), Math.abs(endpoint.y - center.y)),
                        ).toBeLessThanOrEqual(gs.getHalfStep() + 1);
                        const overlay = new OpponentAimOverlay();
                        const root = new Container();
                        root.scale.set(mirrored ? -1 : 1, -1);
                        root.addChild(overlay.graphics);
                        overlay.paint(geometry, gs);
                        const projected = projectBattlefieldPoint(endpoint, gs);
                        const onScreen = overlay.graphics.toGlobal(projected);
                        expect(onScreen.x).toBeCloseTo(projected.x * (mirrored ? -1 : 1));
                        expect(onScreen.y).toBeCloseTo(-projected.y);
                        overlay.destroy();
                        root.destroy();
                    }
                    expect(JSON.stringify(f.grid.getMatrix())).toBe(before);
                });
            }
        }

    for (const [width, height] of [
        [1, 1],
        [2, 2],
        [3, 1],
        [1, 3],
        [3, 2],
    ]) {
        test(`a ${width}x${height} movement ghost uses the exact resolved anchor`, () => {
            const f = fixture(TeamVals.LEFT, width, height);
            const cell = { x: 12, y: 11 };
            const geometry = resolveOpponentAimGeometry(f.aim({ kind: PlayAimKind.MOVE, cell }), f.context)!;
            expect(geometry.cells).toEqual(f.actor.getFootprintCellsForAnchor(cell));
            expect(geometry.ghost).toEqual(GridMath.getPositionForFootprintAnchor(gs, cell, width, height));
            expect(geometry.ray).toBeUndefined();
            expect(resolveOpponentAimGeometry(f.aim({ kind: PlayAimKind.MOVE, cell: { x: 0, y: 0 } }), f.context))[
                width > 1 || height > 1 ? "toBeUndefined" : "toBeDefined"
            ]();
        });
    }

    test("melee shows the approach and defender without relocating either unit", () => {
        const f = fixture(TeamVals.LEFT, 2, 1);
        const victim = createTestUnit({ team: TeamVals.RIGHT });
        placeUnit(f.grid, f.unitsHolder, victim, { x: 12, y: 7 });
        const position = { ...f.actor.getPosition() };
        const geometry = resolveOpponentAimGeometry(
            f.aim({ kind: PlayAimKind.MELEE, targetUnitId: victim.getId(), attackFrom: { x: 11, y: 7 } }),
            f.context,
        )!;
        expect(geometry.ghost).toEqual(GridMath.getPositionForFootprintAnchor(gs, { x: 11, y: 7 }, 2, 1));
        expect(geometry.cells).toEqual(victim.getCells());
        expect(f.actor.getPosition()).toEqual(position);
    });

    test("ranged previews mark the actual interceptor and piercing shots continue through every victim", () => {
        for (const through of [false, true]) {
            const f = fixture(TeamVals.LEFT, 1, 1, through ? ["Through Shot"] : []);
            const screen = createTestUnit({ team: TeamVals.RIGHT });
            const target = createTestUnit({ team: TeamVals.RIGHT });
            placeUnit(f.grid, f.unitsHolder, screen, { x: 9, y: 7 });
            placeUnit(f.grid, f.unitsHolder, target, { x: 12, y: 7 });
            const geometry = resolveOpponentAimGeometry(
                f.aim({ targetUnitId: target.getId(), aimDirection: through ? 1 : undefined }),
                f.context,
            )!;
            expect(geometry.cells).toContainEqual(screen.getBaseCell());
            if (through) {
                expect(geometry.cells).toContainEqual(target.getBaseCell());
                expect(geometry.ray!.to.x).toBeGreaterThan(target.getPosition().x);
            } else expect(geometry.ray!.to).toEqual(screen.getPosition());
        }
    });

    test("free area throws show a clipped 3x3 at the resolved impact cell", () => {
        const f = fixture(TeamVals.LEFT, 1, 1, ["Area Throw"]);
        const geometry = resolveOpponentAimGeometry(f.aim({ cell: { x: 15, y: 15 } }), f.context)!;
        expect(geometry.cells).toHaveLength(4);
        expect(geometry.cells).toContainEqual({ x: 15, y: 15 });
        expect(geometry.cells.every((cell) => GridMath.isCellWithinGrid(gs, cell))).toBe(true);
    });

    for (let orientation = 1; orientation <= 4; orientation++)
        test(`Fire Wall orientation ${orientation} uses shared burnable cells`, () => {
            const f = fixture();
            const spell = f.actor.getSpells().find((entry) => entry.getName() === "Fire Wall")!;
            const cell = { x: 1, y: 1 };
            const geometry = resolveOpponentAimGeometry(
                f.aim({ kind: PlayAimKind.SPELL, cell, spellName: "Fire Wall", targetOrientation: orientation }),
                { ...f.context, spell },
            )!;
            expect(geometry.cells).toEqual(
                FireWallHelper.fireWallLitCells(f.grid, (c) => GridMath.isCellWithinGrid(gs, c), cell, orientation - 1),
            );
            expect(geometry.ray).toBeUndefined();
        });

    test("Meteorite uses the shared spell footprint; heals and resurrection have no projectile beam", () => {
        const f = fixture();
        const target = createTestUnit({ team: TeamVals.LEFT });
        placeUnit(f.grid, f.unitsHolder, target, { x: 12, y: 7 });
        for (const name of ["Meteorite", "Heal", "Resurrection"]) {
            const spell = f.actor.getSpells().find((entry) => entry.getName() === name)!;
            const geometry = resolveOpponentAimGeometry(
                f.aim({ kind: PlayAimKind.SPELL, spellName: name, targetUnitId: target.getId() }),
                { ...f.context, spell },
            )!;
            expect(geometry.ray).toBeUndefined();
            expect(geometry.cells).toEqual(
                name === "Meteorite"
                    ? SpellHelper.cellTargetedSpellBlockCells(name, { x: 12, y: 7 })
                    : target.getCells(),
            );
        }
    });

    test("projectile spells use the resolved impact and splash without consuming a charge", () => {
        const f = fixture();
        const spell = f.actor.getSpells().find((entry) => entry.getName() === "Fire Strike")!;
        const target = createTestUnit({ team: TeamVals.RIGHT });
        placeUnit(f.grid, f.unitsHolder, target, { x: 12, y: 7 });
        const impact = createTestUnit({ team: TeamVals.RIGHT });
        placeUnit(f.grid, f.unitsHolder, impact, { x: 9, y: 7 });
        const amount = spell.getAmount();
        const geometry = resolveOpponentAimGeometry(
            f.aim({ kind: PlayAimKind.SPELL, spellName: "Fire Strike", targetUnitId: target.getId() }),
            { ...f.context, spell, spellImpact: impact },
        )!;
        expect(geometry.ray?.to).toEqual(impact.getPosition());
        expect(geometry.cells).toEqual(impact.getCells());
        expect(spell.getAmount()).toBe(amount);
    });

    test("missing actors/targets, malformed hints, and occupied landing footprints draw nothing", () => {
        const f = fixture(TeamVals.LEFT, 2, 2);
        expect(resolveOpponentAimGeometry(f.aim({ unitId: "previous" }), f.context)).toBeUndefined();
        expect(resolveOpponentAimGeometry(f.aim({ targetUnitId: "missing" }), f.context)).toBeUndefined();
        expect(resolveOpponentAimGeometry(f.aim({ cell: { x: NaN, y: 1 } }), f.context)).toBeUndefined();
        expect(resolveOpponentAimGeometry(f.aim({ targetSide: 5 }), f.context)).toBeUndefined();
        const blocker = createTestUnit();
        placeUnit(f.grid, f.unitsHolder, blocker, { x: 12, y: 7 });
        expect(resolveOpponentAimGeometry(f.aim({ kind: PlayAimKind.MOVE }), f.context)).toBeUndefined();
    });
});
