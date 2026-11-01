import { afterEach, describe, expect, test } from "bun:test";
import { Container } from "pixi.js";
import {
    AbilityFactory,
    AttackHandler,
    AttackVals,
    EffectFactory,
    FightStateManager,
    FireWallHelper,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    SpellHelper,
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
    type HoCMath,
    type TeamType,
    type AttackType,
} from "@heroesofcrypto/common";

import { PlayAimKind, type PlayAim } from "../api/play_protocol";
import { releaseBoardMirror, setBoardMirror } from "../pixi/boardMirror";
import { OpponentAimOverlay } from "./OpponentAimOverlay";
import { resolveOpponentAimGeometry, type AimGeometryContext } from "./opponentAimGeometry";
import { rangeTargetEdgeEvaluationAim } from "./rangeTargetEdges";
import { projectBattlefieldPoint, rangeAttackFootprintEdgePoint } from "./sandbox/BattlefieldVisualGrid";

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

function createTestUnit(
    options: {
        team?: TeamType;
        attackType?: AttackType;
        rangeShots?: number;
        shotDistance?: number;
        footprintWidth?: number;
        footprintHeight?: number;
        abilities?: string[];
        spells?: string[];
    } = {},
): Unit {
    const team = options.team ?? TeamVals.RIGHT;
    const effects = new EffectFactory();
    const abilities = options.abilities ?? [];
    return Unit.createUnit(
        {
            ...HoCConfig.getCreatureConfig(team, "Nature", "Dryad", "", 10),
            attack_type: options.attackType ?? AttackVals.MELEE,
            attack_type_selected: options.attackType ?? AttackVals.MELEE,
            range_shots: options.rangeShots ?? 0,
            shot_distance: options.shotDistance ?? 16,
            footprint_width: options.footprintWidth ?? 1,
            footprint_height: options.footprintHeight ?? 1,
            abilities,
            abilities_descriptions: abilities.map(() => ""),
            abilities_stack_powered: abilities.map(() => false),
            abilities_auras: abilities.map(() => false),
            spells: options.spells ?? [],
        },
        gs,
        team,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
}

function placeUnit(grid: Grid, unitsHolder: UnitsHolder, unit: Unit, cell: HoCMath.XY): void {
    const position = GridMath.getPositionForFootprintAnchor(
        gs,
        cell,
        unit.getFootprintWidth(),
        unit.getFootprintHeight(),
    );
    unit.setPosition(position.x, position.y);
    grid.occupyCells(unit.getCells(), unit.getId(), unit.getTeam(), unit.getAttackRange(), false, false);
    unitsHolder.addUnit(unit);
}

function createCombatTestContext() {
    FightStateManager.getInstance().reset();
    const grid = new Grid(gs, GridVals.NORMAL);
    const unitsHolder = new UnitsHolder(grid);
    const attackHandler = new AttackHandler(
        gs,
        grid,
        { getLog: () => "", updateLog: () => {}, hasBeenUpdated: () => false },
        { add: () => {}, get: () => [], has: () => false, clear: () => {} },
    );
    return { grid, unitsHolder, attackHandler };
}

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
        getObstacleIntersections: fight.attackHandler.getObstacleIntersections.bind(fight.attackHandler),
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

    test("move-and-shoot evaluates and draws from the proposed rectangular footprint", () => {
        const f = fixture(TeamVals.LEFT, 2, 1);
        const screen = createTestUnit({ team: TeamVals.RIGHT });
        const target = createTestUnit({ team: TeamVals.RIGHT });
        placeUnit(f.grid, f.unitsHolder, screen, { x: 9, y: 7 });
        placeUnit(f.grid, f.unitsHolder, target, { x: 12, y: 7 });
        const position = { ...f.actor.getPosition() };
        const attackFrom = { x: 9, y: 9 };
        const origin = GridMath.getPositionForFootprintAnchor(gs, attackFrom, 2, 1);
        const endpoint = rangeTargetEdgeEvaluationAim(gs, target.getBaseCell(), 0, origin);

        const geometry = resolveOpponentAimGeometry(
            f.aim({ targetUnitId: target.getId(), targetSide: 1, attackFrom }),
            f.context,
        )!;

        expect(geometry.ghost).toEqual(origin);
        expect(geometry.ray).toEqual({
            from: rangeAttackFootprintEdgePoint(origin, endpoint, 2, 1, gs),
            to: endpoint,
        });
        expect(geometry.cells).toContainEqual(target.getBaseCell());
        expect(geometry.cells).not.toContainEqual(screen.getBaseCell());
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
        const target = createTestUnit({ team: TeamVals.RIGHT });
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

    test("a spell that spares its central target marks only the surrounding victims", () => {
        const f = fixture();
        const spell = f.actor.getSpells().find((entry) => entry.getName() === "Fire Strike")!;
        const target = createTestUnit({ team: TeamVals.RIGHT });
        const splash = createTestUnit({ team: TeamVals.RIGHT });
        placeUnit(f.grid, f.unitsHolder, target, { x: 12, y: 7 });
        placeUnit(f.grid, f.unitsHolder, splash, { x: 12, y: 8 });
        const geometry = resolveOpponentAimGeometry(
            f.aim({ kind: PlayAimKind.SPELL, spellName: "Fire Strike", targetUnitId: target.getId() }),
            {
                ...f.context,
                spell,
                spellSparesTarget: true,
                spellSplash: [splash],
            },
        )!;
        expect(geometry.cells).toEqual(splash.getCells());
        expect(geometry.cells).not.toContainEqual(target.getBaseCell());
    });

    test("Meteorite never promises a partial or empty legal footprint", () => {
        const f = fixture();
        const spell = f.actor.getSpells().find((entry) => entry.getName() === "Meteorite")!;
        for (const cell of [
            { x: 12, y: 7 },
            { x: 15, y: 15 },
        ]) {
            expect(
                resolveOpponentAimGeometry(f.aim({ kind: PlayAimKind.SPELL, spellName: "Meteorite", cell }), {
                    ...f.context,
                    spell,
                })?.cells,
            ).toEqual([]);
        }
    });

    test("Large Caliber uses the engine's first-impact splash cells", () => {
        const f = fixture(TeamVals.LEFT, 1, 1, ["Large Caliber"]);
        const target = createTestUnit({ team: TeamVals.RIGHT });
        const splash = createTestUnit({ team: TeamVals.RIGHT });
        placeUnit(f.grid, f.unitsHolder, target, { x: 12, y: 7 });
        placeUnit(f.grid, f.unitsHolder, splash, { x: 12, y: 8 });
        const geometry = resolveOpponentAimGeometry(f.aim({ targetUnitId: target.getId() }), f.context)!;
        expect(geometry.cells).toContainEqual(target.getBaseCell());
        expect(geometry.cells).toContainEqual(splash.getBaseCell());
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
