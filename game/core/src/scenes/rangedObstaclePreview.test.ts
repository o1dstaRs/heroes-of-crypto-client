import { beforeEach, describe, expect, test } from "bun:test";
import {
    AbilityFactory,
    AttackHandler,
    AttackVals,
    createSequenceGameRuntime,
    EffectFactory,
    FightStateManager,
    GameActionEngine,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    MoveHandler,
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
    type GameAction,
    type HoCMath,
    type TeamType,
} from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";
import { projectRangedObstacles } from "./rangedObstaclePreview";
import { PlayAimKind } from "../api/play_protocol";
import { resolveOpponentAimGeometry } from "./opponentAimGeometry";

type XY = HoCMath.XY;
const settings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const position = (cell: XY) =>
    GridMath.getPositionForCell(cell, settings.getMinX(), settings.getStep(), settings.getHalfStep());
const cell = (point: XY) => GridMath.getCellForPosition(settings, point);
const rotate = (point: XY, turns: number): XY => {
    for (let i = 0; i < turns; i++) point = { x: 15 - point.y, y: point.x };
    return point;
};

beforeEach(() => FightStateManager.getInstance().reset());

function fixture(abilities: string[] = [], turns = 0, owned = false) {
    const grid = new Grid(settings, GridVals.NORMAL);
    const holder = new UnitsHolder(grid);
    const effects = new EffectFactory();
    const create = (team: TeamType, base: XY, ranged: boolean) => {
        const names = ranged ? abilities : [];
        const unit = Unit.createUnit(
            {
                ...HoCConfig.getCreatureConfig(team, "Life", "Peasant", "", 100),
                attack_type: ranged ? AttackVals.RANGE : AttackVals.MELEE,
                attack_type_selected: ranged ? AttackVals.RANGE : AttackVals.MELEE,
                range_shots: ranged ? 10 : 0,
                shot_distance: 16,
                abilities: names,
                abilities_descriptions: names.map(() => ""),
                abilities_stack_powered: names.map(() => false),
                abilities_auras: names.map(() => false),
            },
            settings,
            team,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        );
        const point = position(rotate(base, turns));
        unit.setPosition(point.x, point.y);
        expect(grid.occupyCells(unit.getCells(), unit.getId(), team, unit.getAttackRange(), false, false)).toBe(true);
        holder.addUnit(unit);
        return unit;
    };
    const attacker = create(TeamVals.LEFT, { x: 2, y: 7 }, true);
    const target = create(TeamVals.RIGHT, { x: 12, y: 7 }, false);
    const log = { getLog: () => "", updateLog: () => {}, hasBeenUpdated: () => false };
    const handler = new AttackHandler(settings, grid, log, {
        add: () => {},
        get: () => [],
        has: () => false,
        clear: () => {},
    });
    const barrels = [
        { x: 4, y: 7 },
        { x: 6, y: 7 },
        { x: 8, y: 7 },
    ].map((point) => rotate(point, turns));
    if (owned) {
        expect(grid.placeArtifactBarrel(TeamVals.LEFT, 0, barrels[0])).toBe(true);
        expect(grid.placeArtifactBarrel(TeamVals.RIGHT, 0, barrels[1])).toBe(true);
    } else grid.setScatteredMountains(barrels);
    const fight = FightStateManager.getInstance().getFightProperties();
    fight.startFight();
    fight.startTurn(attacker.getTeam(), 1000);
    const engine = new GameActionEngine({
        grid,
        unitsHolder: holder,
        fightProperties: fight,
        attackHandler: handler,
        moveHandler: new MoveHandler(settings, grid, holder),
        sceneLog: log,
        getCurrentActiveUnitId: () => attacker.getId(),
        runtime: createSequenceGameRuntime({ nowMillis: [1400] }),
    });
    const preview = (aim = target.getPosition(), obstacleTarget = false) =>
        projectRangedObstacles({
            attacker,
            grid,
            units: holder.getAllUnits(),
            handler,
            aim,
            obstacleTarget,
        });
    const fire = (action: GameAction) => {
        const result = engine.apply(action);
        expect(result.completed).toBe(true);
        return result.events
            .filter((event) => event.type === "obstacle_attacked")
            .map((event) => cell(event.targetPosition));
    };
    return { grid, holder, attacker, target, handler, preview, fire, barrels };
}

describe("ranged barrel projection agrees with accepted attacks", () => {
    for (const turns of [0, 1, 2, 3])
        for (const ability of [undefined, "Double Shot", "Crafted Double Shot"]) {
            test(`${ability ?? "single shot"}, rotation ${turns}: only projected barrels are struck`, () => {
                const f = fixture(ability ? [ability] : [], turns);
                const before = f.grid.getScatteredMountainsStanding();
                const preview = f.preview();
                const expected = f.barrels.slice(0, ability ? 2 : 1);
                expect(preview.hits.map((hit) => cell(hit.position))).toEqual(expected);
                expect(f.grid.getScatteredMountainsStanding()).toEqual(before);
                const actual = f.fire(
                    preview.blocker
                        ? {
                              type: "obstacle_attack",
                              attackerId: f.attacker.getId(),
                              targetPosition: preview.blocker.position,
                          }
                        : { type: "range_attack", attackerId: f.attacker.getId(), targetId: f.target.getId() },
                );
                expect(actual).toEqual(expected);
            });
        }

    test("owned barricade barrels on a normal map follow the same Double Shot projection", () => {
        const f = fixture(["Double Shot"], 0, true);
        const expected = f.preview().hits.map((hit) => cell(hit.position));
        expect(expected).toEqual(f.barrels.slice(0, 2));
        expect(f.fire({ type: "range_attack", attackerId: f.attacker.getId(), targetId: f.target.getId() })).toEqual(
            expected,
        );
    });

    test.each(["Large Caliber", "Area Throw"])(
        "%s highlights all blast barrels and skips untouched barrels on the line",
        (ability) => {
            const f = fixture(["Double Shot", ability]);
            const blast = [
                { x: 11, y: 6 },
                { x: 11, y: 8 },
                { x: 13, y: 8 },
            ];
            f.grid.setScatteredMountains([f.barrels[0], ...blast]);
            expect(f.preview().hits.map((hit) => cell(hit.position))).toEqual(blast);
            const actual = f.fire({ type: "range_attack", attackerId: f.attacker.getId(), targetId: f.target.getId() });
            expect(new Set(actual.map((point) => `${point.x}:${point.y}`))).toEqual(
                new Set(blast.map((point) => `${point.x}:${point.y}`)),
            );
            expect(f.grid.getScatteredMountainsStanding()).toEqual([f.barrels[0]]);
        },
    );

    test("Break removes the second projected barrel along with Double Shot", () => {
        const f = fixture(["Double Shot"]);
        f.attacker.applyEffect(new EffectFactory().makeEffect("Break")!);
        expect(f.preview().hits.map((hit) => cell(hit.position))).toEqual([f.barrels[0]]);
    });

    test("one barrel absorbs only the first projectile and leaves the creature reachable", () => {
        const f = fixture(["Double Shot"]);
        f.grid.setScatteredMountains([f.barrels[0]]);
        const preview = f.preview();
        expect(preview.hits.map((hit) => cell(hit.position))).toEqual([f.barrels[0]]);
        expect(preview.blocker).toBeUndefined();
        const before = f.target.getCumulativeHp();
        expect(f.fire({ type: "range_attack", attackerId: f.attacker.getId(), targetId: f.target.getId() })).toEqual([
            f.barrels[0],
        ]);
        expect(f.target.getCumulativeHp()).toBeLessThan(before);
    });

    test("hovering a rear barrel colors the first two hits red, leaving the untouched hovered barrel unmarked", () => {
        const f = fixture(["Double Shot"]);
        let highlighted: XY[] = [];
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            grid: f.grid,
            unitsHolder: f.holder,
            attackHandler: f.handler,
            currentActiveUnit: f.attacker,
            sc_sceneSettings: { getGridSettings: () => settings },
            sc_mouseWorld: position(f.barrels[2]),
            sc_hoverInfoArr: [],
            isAreaThrowAiming: () => false,
            isLargeCaliberBarrelAiming: () => false,
            dungeonVisuals: {
                highlightScatteredMountains: (points: XY[]) => {
                    highlighted = points.map(cell);
                },
            },
            hoverManager: {
                clearAttackVisuals: () => {},
                clearHoverSilhouette: () => {},
                clearObstacleHighlight: () => {},
                drawRangeTerminalArrowhead: (point: XY) => point,
                drawAttackArrow: () => {},
                highlightObstacles: () => {},
            },
        }) as { updateObstacleHover(): boolean };
        expect(scene.updateObstacleHover()).toBe(true);
        expect(highlighted).toEqual(f.barrels.slice(0, 2));
    });

    test("the opponent's Double Shot projects and highlights the same two barrels", () => {
        const f = fixture(["Double Shot"]);
        const geometry = resolveOpponentAimGeometry(
            {
                kind: PlayAimKind.RANGED,
                unitId: f.attacker.getId(),
                cell: f.target.getBaseCell(),
                targetUnitId: f.target.getId(),
            },
            {
                actor: f.attacker,
                units: f.holder.getAllUnits(),
                grid: f.grid,
                settings,
                evaluateRange: f.handler.evaluateRangeAttack.bind(f.handler),
                getObstacleIntersections: f.handler.getObstacleIntersections.bind(f.handler),
            },
        )!;
        expect(geometry.barrelCells).toEqual(f.barrels.slice(0, 2));
        expect(geometry.cells).toEqual(f.barrels.slice(0, 2));
        expect(cell(geometry.ray!.to)).toEqual(f.barrels[1]);
    });

    test("the opponent's direct rear-barrel aim marks the two actual hits rather than the hovered barrel", () => {
        const f = fixture(["Double Shot"]);
        const geometry = resolveOpponentAimGeometry(
            {
                kind: PlayAimKind.RANGED,
                unitId: f.attacker.getId(),
                cell: f.barrels[2],
            },
            {
                actor: f.attacker,
                units: f.holder.getAllUnits(),
                grid: f.grid,
                settings,
                evaluateRange: f.handler.evaluateRangeAttack.bind(f.handler),
                getObstacleIntersections: f.handler.getObstacleIntersections.bind(f.handler),
            },
        )!;
        expect(geometry.barrelCells).toEqual(f.barrels.slice(0, 2));
        expect(geometry.cells).not.toContainEqual(f.barrels[2]);
    });

    test("free Through Shot with Double Shot marks both barrels the accepted attack removes", () => {
        const f = fixture(["Through Shot", "Double Shot"]);
        const barrels = [
            { x: 13, y: 7 },
            { x: 14, y: 7 },
            { x: 15, y: 7 },
        ];
        f.grid.setScatteredMountains(barrels);
        let highlighted: XY[] = [];
        const aim = position({ x: 14, y: 7 });
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            grid: f.grid,
            unitsHolder: f.holder,
            attackHandler: f.handler,
            currentActiveUnit: f.attacker,
            sc_sceneSettings: { getGridSettings: () => settings },
            sc_mouseWorld: aim,
            sc_hoverInfoArr: [],
            isFreeThroughShotAiming: () => true,
            isAttackBlockedByAggr: () => undefined,
            dungeonVisuals: {
                highlightScatteredMountains: (points: XY[]) => {
                    highlighted = points.map(cell);
                },
            },
            hoverManager: {
                clearAOEArea: () => {},
                clearAttackVisuals: () => {},
                clearHoverSilhouette: () => {},
                clearObstacleHighlight: () => {},
                drawRangeTerminalArrowhead: (point: XY) => point,
                drawAttackArrow: () => {},
                addTargetHighlight: () => {},
                addAOEDamagePrediction: () => {},
            },
        }) as { updateFreeThroughShotHover(): boolean };
        expect(scene.updateFreeThroughShotHover()).toBe(true);
        expect(highlighted).toEqual(barrels.slice(0, 2));
        expect(
            f.fire({ type: "range_attack", attackerId: f.attacker.getId(), targetId: "", targetPosition: aim }),
        ).toEqual(highlighted);
    });

    test("relayed aim keeps both barrels red between paints and clears them when the aim ends", () => {
        const f = fixture(["Double Shot"]);
        let highlighted: XY[] = [];
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            grid: f.grid,
            unitsHolder: f.holder,
            attackHandler: f.handler,
            currentActiveUnit: f.attacker,
            sc_sceneSettings: { getGridSettings: () => settings },
            canControlCurrentActiveUnit: () => false,
            isPlayingActionAnimation: () => false,
            setOpponentSpellIntent: () => {},
            opponentAim: {
                kind: PlayAimKind.RANGED,
                unitId: f.attacker.getId(),
                targetUnitId: f.target.getId(),
                cell: f.target.getBaseCell(),
                expiresAt: performance.now() + 10_000,
            },
            opponentAimOverlay: { paint: () => {}, clear: () => {}, graphics: {} },
            dungeonVisuals: {
                highlightScatteredMountains: (points: XY[]) => {
                    highlighted = points.map(cell);
                },
                clearScatteredMountainHighlight: () => {
                    highlighted = [];
                },
            },
            hoverManager: { clearOpponentIntentSilhouette: () => {} },
        }) as { renderOpponentAim(): void; setOpponentAim(): void };
        scene.renderOpponentAim();
        expect(highlighted).toEqual(f.barrels.slice(0, 2));
        highlighted = [];
        scene.renderOpponentAim();
        expect(highlighted).toEqual(f.barrels.slice(0, 2));
        scene.setOpponentAim();
        expect(highlighted).toEqual([]);
    });
});
