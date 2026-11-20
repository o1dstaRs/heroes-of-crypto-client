import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ColorMatrixFilter, Container, Sprite, Texture } from "pixi.js";
import {
    AbilityFactory,
    AttackHandler,
    AttackVals,
    EffectFactory,
    FightStateManager,
    Grid,
    GridConstants,
    GridMath,
    GridSettings,
    GridVals,
    HoCConfig,
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
    type HoCMath,
    type TeamType,
} from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";
import { DungeonVisuals } from "./sandbox/DungeonVisuals";

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
const cellOf = (point: XY) => GridMath.getCellForPosition(settings, point);

const originalFight = FightStateManager.getInstance().getFightProperties();
beforeEach(() => FightStateManager.getInstance().reset());
afterEach(() => FightStateManager.getInstance().setFightProperties(originalFight));

/** A Cemetery board: a shooter on the left, an enemy on the right and three standing barrels between them. */
const fixture = (attackerAbilities: string[] = [], meleeAttackerCell?: XY) => {
    const grid = new Grid(settings, GridVals.NORMAL);
    const holder = new UnitsHolder(grid);
    const effects = new EffectFactory();
    const create = (team: TeamType, base: XY, ranged: boolean, abilities: string[] = []) => {
        const unit = Unit.createUnit(
            {
                ...HoCConfig.getCreatureConfig(team, "Life", "Peasant", "", 100),
                attack_type: ranged ? AttackVals.RANGE : AttackVals.MELEE,
                attack_type_selected: ranged ? AttackVals.RANGE : AttackVals.MELEE,
                range_shots: ranged ? 10 : 0,
                shot_distance: 16,
                abilities,
                abilities_descriptions: abilities.map(() => ""),
                abilities_stack_powered: abilities.map(() => false),
                abilities_auras: abilities.map(() => false),
            },
            settings,
            team,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        );
        const point = position(base);
        unit.setPosition(point.x, point.y);
        expect(grid.occupyCells(unit.getCells(), unit.getId(), team, unit.getAttackRange(), false, false)).toBe(true);
        holder.addUnit(unit);
        return unit;
    };
    const attacker = meleeAttackerCell
        ? create(TeamVals.LEFT, meleeAttackerCell, false, attackerAbilities)
        : create(TeamVals.LEFT, { x: 2, y: 7 }, true, attackerAbilities);
    const enemy = (cell: XY) => create(TeamVals.RIGHT, cell, false);
    enemy({ x: 12, y: 7 });
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
    ];
    grid.setScatteredMountains(barrels);
    const fight = FightStateManager.getInstance().getFightProperties();
    fight.startFight();
    fight.startTurn(attacker.getTeam(), 1000);

    const calls: string[] = [];
    let highlighted: XY[] = [];
    const casingJoint = { x: -1, y: -1 };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        grid,
        unitsHolder: holder,
        attackHandler: handler,
        currentActiveUnit: attacker,
        sc_sceneSettings: { getGridSettings: () => settings },
        sc_mouseWorld: position(barrels[0]),
        sc_hoverInfoArr: [],
        isAreaThrowAiming: () => false,
        isLargeCaliberBarrelAiming: () => false,
        isFreeThroughShotAiming: () => false,
        getLiveAggrForcedTarget: () => undefined,
        executeObstacleAttackSequence: mock(() => true),
        dungeonVisuals: {
            highlightScatteredMountains: (points: XY[]) => {
                highlighted = points.map(cellOf);
                calls.push("highlight barrels");
            },
            clearScatteredMountainHighlight: () => {
                highlighted = [];
            },
        },
        hoverManager: {
            clearAttackVisuals: () => {},
            clearObstacleHighlight: () => {},
            highlightObstacles: () => {},
            clearHoverSilhouette: (force?: boolean) => calls.push(`clear ghost${force ? " (forced)" : ""}`),
            drawRangeTerminalArrowhead: () => {
                calls.push("arrowhead");
                return casingJoint;
            },
            drawAttackArrow: (_from: XY, to: XY) => calls.push(to === casingJoint ? "arrow to socket" : "arrow"),
        },
    });
    return { grid, attacker, enemy, barrels, scene, calls, highlighted: () => highlighted };
};

describe("Cemetery barrel targeting", () => {
    test("only a still-standing barrel is a target", () => {
        const f = fixture();
        expect(f.scene.isHoveringAttackableObstacle(position(f.barrels[0]))).toBe(true);
        expect(f.scene.updateObstacleHover()).toBe(true);

        expect(f.grid.clearScatteredMountainAt(f.barrels[0].x, f.barrels[0].y)).toBe(true);
        expect(f.scene.isHoveringAttackableObstacle(position(f.barrels[0]))).toBe(false);
        expect(f.scene.updateObstacleHover()).toBe(false);
        expect(f.scene.isHoveringAttackableObstacle(position(f.barrels[1]))).toBe(true);
    });

    test("hovering a standing barrel highlights it before attack-type gating", () => {
        const f = fixture();
        f.attacker.getAttackTypeSelection = () => AttackVals.MAGIC;
        f.scene.sc_mouseWorld = position(f.barrels[1]);

        expect(f.scene.updateObstacleHover()).toBe(true);

        expect(f.highlighted()).toEqual([f.barrels[1]]);
        expect(f.calls).not.toContain("arrowhead");
    });

    test("ranged aim on a barrel clears the movement ghost, then ends its arrow in the arrowhead's socket", () => {
        const f = fixture();

        expect(f.scene.updateObstacleHover()).toBe(true);

        expect(f.calls).toEqual([
            "highlight barrels",
            "clear ghost (forced)",
            "arrowhead",
            "arrow to socket",
            "highlight barrels",
        ]);
        expect(f.highlighted()).toEqual([f.barrels[0]]);
    });

    test("a click strikes the canonical barrel centre the hover previews, not the raw pointer", () => {
        const f = fixture();
        const centre = position(f.barrels[1]);
        const pointer = { x: centre.x + settings.getHalfStep() * 0.6, y: centre.y - settings.getHalfStep() * 0.6 };
        expect(cellOf(pointer)).toEqual(f.barrels[1]);

        expect(f.scene.attemptObstacleAttack(pointer)).toBe(true);

        expect(f.scene.executeObstacleAttackSequence).toHaveBeenCalledWith(f.attacker, centre, undefined);
    });

    test.each(["isAreaThrowAiming", "isLargeCaliberBarrelAiming", "isFreeThroughShotAiming"])(
        "the barrel resolver stands aside while %s owns the shot",
        (mode) => {
            const f = fixture();
            f.scene[mode] = () => true;
            expect(f.scene.isHoveringAttackableObstacle(position(f.barrels[0]))).toBe(false);
            expect(f.scene.attemptObstacleAttack(position(f.barrels[0]))).toBe(false);
            expect(f.scene.executeObstacleAttackSequence).not.toHaveBeenCalled();
        },
    );

    test("a trajectory marks the barrels the engine intersects; a blast marks only standing barrels in it", () => {
        const f = fixture();
        f.grid.clearScatteredMountainAt(f.barrels[1].x, f.barrels[1].y);

        f.scene.highlightScatteredObstaclesAlongTrajectory(f.attacker.getPosition(), position({ x: 12, y: 7 }));
        expect(f.highlighted()).toEqual([f.barrels[0], f.barrels[2]]);

        // Area Throw flies OVER the barrels on its line and breaks every barrel in the 3x3 it lands on.
        f.scene.highlightScatteredObstaclesInCells([f.barrels[1], f.barrels[2], { x: 9, y: 7 }]);
        expect(f.highlighted()).toEqual([f.barrels[2]]);
    });
});

// OWNER CALL: a blow aimed at a barrel hits the units in its riders' reach too, and the barrel hover prices
// those victims with the same rider projection the unit-target hover uses (lightningSpinHover.test.ts holds
// that projection to the combat engine).
describe("barrel-aimed melee riders", () => {
    test.each([
        ["Lightning Spin", { x: 3, y: 8 }],
        ["Skewer Strike", { x: 5, y: 7 }],
        ["Fire Breath", { x: 5, y: 7 }],
    ] as const)("a %s blow at a barrel forecasts its damage on the unit it reaches", (source, victimCell) => {
        const f = fixture([source], { x: 3, y: 7 });
        const victim = f.enemy(victimCell);
        const attackFrom = f.attacker.getBaseCell();
        const highlightedUnits: string[] = [];
        const forecasts: XY[] = [];
        const priced: string[] = [];
        const project = f.scene.projectMeleeRiderDamage;
        Object.assign(f.scene, {
            resolveMountainAttackFrom: () => attackFrom,
            getObstacleAttackFromPosition: () => f.attacker.getPosition(),
            isStrikeInFlight: () => false,
            projectMeleeRiderDamage(this: unknown, rider: string, base: unknown, struck: Unit, ...rest: unknown[]) {
                priced.push(`${rider} -> ${struck.getId()}`);
                return project.call(this, rider, base, struck, ...rest);
            },
        });
        Object.assign(f.scene.hoverManager, {
            updateHoverSilhouette: () => {},
            addTargetHighlight: (unit: Unit) => highlightedUnits.push(unit.getId()),
            addAOEDamagePrediction: (_damage: string, _kills: string | undefined, anchor: XY) => forecasts.push(anchor),
        });
        (f.attacker as unknown as { getBattlefieldPreviewAt(): undefined }).getBattlefieldPreviewAt = () => undefined;

        expect(f.scene.updateObstacleHover()).toBe(true);

        expect(highlightedUnits).toEqual([victim.getId()]);
        expect(priced).toEqual([`${source} -> ${victim.getId()}`]);
        expect(forecasts).toEqual([victim.getPosition()]);
    });
});

describe("barrel danger overlay", () => {
    test("a red alpha wash sits exactly over each authored barrel silhouette and lights only the targeted ones", () => {
        // DungeonVisuals asks for a canvas; supply a stub only for this test so no global outlives it.
        const globals = globalThis as { document?: unknown };
        const stubbedDocument = typeof globals.document !== "object" || globals.document === null;
        if (stubbedDocument) {
            globals.document = {
                createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
                querySelector: () => null,
            };
        }
        const fightState = FightStateManager.getInstance();
        fightState.getFightProperties().setGridType(GridVals.NORMAL);
        const root = new Container();
        let visuals: DungeonVisuals | undefined;
        try {
            visuals = new DungeonVisuals({
                getStage: () => root,
                getWorldRoot: () => root,
                getViewportSize: () => ({ width: 1024, height: 1024 }),
                getGridSettings: () => settings,
                getMovableArtifactBarrelCells: () => [],
                texAny: () => undefined,
                attachToWorldRoot: (object) => root.addChild(object),
                attachToUnitDepthRoot: (object) => root.addChild(object),
            });
            const internals = visuals as unknown as {
                mountainTileTextures: Texture[];
                mountainHitPointTileTextures: Texture[];
                scatteredMountainSprites: Sprite[];
                scatteredMountainDangerOverlays: Sprite[];
                tombstoneRedFilter?: ColorMatrixFilter;
            };
            internals.mountainTileTextures = [new Texture({ source: Texture.WHITE.source })];
            internals.mountainHitPointTileTextures = [new Texture({ source: Texture.WHITE.source })];
            visuals.setScatteredMountains(
                [
                    { x: 4, y: 7, variant: 0 },
                    { x: 8, y: 7, variant: 0 },
                ],
                true,
            );
            const overlays = internals.scatteredMountainDangerOverlays;
            expect(overlays).toHaveLength(2);
            overlays.forEach((overlay, index) => {
                const sprite = internals.scatteredMountainSprites[index];
                expect(overlay.texture).toBe(sprite.texture);
                expect([overlay.x, overlay.y, overlay.scale.x, overlay.scale.y]).toEqual([
                    sprite.x,
                    sprite.y,
                    sprite.scale.x,
                    sprite.scale.y,
                ]);
                expect(overlay.filters).toEqual([internals.tombstoneRedFilter!]);
                expect(overlay.alpha).toBe(0.15);
                expect(overlay.visible).toBe(false);
            });

            visuals.highlightScatteredMountains([position({ x: 8, y: 7 })]);
            expect(overlays.map((overlay) => overlay.visible)).toEqual([false, true]);
            visuals.clearScatteredMountainHighlight();
            expect(overlays.map((overlay) => overlay.visible)).toEqual([false, false]);
        } finally {
            visuals?.destroy();
            root.destroy({ children: true });
            if (stubbedDocument) delete globals.document;
        }
    });
});
