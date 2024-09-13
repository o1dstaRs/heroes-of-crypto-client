/*
 * -----------------------------------------------------------------------------
 * This file is part of the browser implementation of the Heroes of Crypto game client.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { b2Body, b2BodyType, b2EdgeShape, b2Fixture, b2Vec2, XY } from "@box2d/core";
import {
    AttackType,
    HoCConfig,
    AbilityFactory,
    FactionType,
    EffectFactory,
    Grid,
    GridConstants,
    GridMath,
    GridType,
    GridSettings,
    HoCConstants,
    HoCLib,
    SpellTargetType,
    Spell,
    SpellHelper,
    SpellPowerType,
    HoCMath,
    IWeightedRoute,
    PathHelper,
    TeamType,
    IAuraOnMap,
    UnitProperties,
    AbilityHelper,
} from "@heroesofcrypto/common";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

import { evaluateAffectedUnits } from "../abilities/aoe_range_ability";
import { nextStandingTargets } from "../abilities/fire_breath_ability";
import { processPenetratingBiteAbility } from "../abilities/penetrating_bite_ability";
import { processRapidChargeAbility } from "../abilities/rapid_charge_ability";
import { AIActionType, findTarget } from "../ai/ai";
import { Drawer } from "../draw/drawer";
import { getAbsorptionTarget } from "../effects/effects_helper";
import { AttackHandler, IAttackObstacle } from "../handlers/attack_handler";
import { MoveHandler } from "../handlers/move_handler";
import { Button } from "../menu/button";
import { ObstacleGenerator } from "../obstacles/obstacle_generator";
import { PlacementType, SquarePlacement } from "../placement/square_placement";
import { Settings } from "../settings";
import { RenderableSpell } from "../spells/renderable_spell";
import { hasAlreadyAppliedSpell, isMirrored } from "../spells/spells_helper";
import { FightStateManager } from "../state/fight_state_manager";
import { IVisibleUnit } from "../state/visible_state";
import {
    FIGHT_BUTTONS_LEFT_POSITION_X,
    FIGHT_BUTTONS_RIGHT_POSITION_X,
    GRID_SIZE,
    HALF_STEP,
    MAX_X,
    MAX_Y,
    MIN_X,
    MIN_Y,
    MOVEMENT_DELTA,
    NO_VELOCITY,
    STEP,
    UNIT_SIZE_DELTA,
} from "../statics";
import { IAttackTargets, Unit } from "../units/units";
import { UnitsFactory } from "../units/units_factory";
import { UnitsHolder } from "../units/units_holder";
import { g_camera } from "../utils/camera";
import { DefaultShader } from "../utils/gl/defaultShader";
import { PreloadedTextures } from "../utils/gl/preload";
import { Sprite } from "../utils/gl/Sprite";
import { getLapString } from "../utils/strings";
import { GLScene } from "./gl_scene";
import { registerScene, SceneContext } from "./scene";
import { SceneSettings } from "./scene_settings";

class Sandbox extends GLScene {
    private ground: b2Body;

    private placementsCleanedUp = false;

    private currentActiveUnit?: Unit;

    private currentActiveUnitSwitchedAttackAuto = false;

    private currentActivePath?: XY[];

    private currentActivePathHashes?: Set<number>;

    private currentActiveKnownPaths?: Map<number, IWeightedRoute[]>;

    private currentActiveSpell?: RenderableSpell;

    private hoverActivePath?: XY[];

    private hoverActiveShotRange?: HoCMath.IXYDistance;

    private hoverRangeAttackLine?: b2Fixture;

    private hoverRangeAttackDivisors: number[] = [];

    private hoverRangeAttackPosition?: XY;

    private hoverRangeAttackObstacle?: IAttackObstacle;

    private hoverActiveAuraRanges: IAuraOnMap[] = [];

    private hoverAttackUnits?: Array<Unit[]>;

    private hoverAOECells?: XY[];

    private hoverUnit?: Unit;

    private hoverAttackFrom?: XY;

    private hoverAttackIsSmallSize?: boolean;

    private hoverSelectedCells?: XY[];

    private hoverSelectedCellsSwitchToRed = false;

    private hoveredSpell?: RenderableSpell;

    private rangeResponseUnits?: Unit[];

    private rangeResponseAttackDivisor = 1;

    private canAttackByMeleeTargets?: IAttackTargets;

    private cellToUnitPreRound?: Map<string, Unit>;

    private unitIdToCellsPreRound?: Map<string, XY[]>;

    private switchToSelectedAttackType?: AttackType;

    private gridMatrix: number[][];

    private performingAIAction = false;

    private readonly allowedPlacementCellHashes: Set<number>;

    private readonly obstacleGenerator: ObstacleGenerator;

    private readonly upperPlacement: SquarePlacement;

    private readonly lowerPlacement: SquarePlacement;

    private readonly unitsFactory: UnitsFactory;

    private readonly unitsHolder: UnitsHolder;

    private readonly grid: Grid;

    private readonly pathHelper: PathHelper;

    private readonly attackHandler: AttackHandler;

    private readonly moveHandler: MoveHandler;

    private readonly textures: PreloadedTextures;

    private readonly digitNormalTextures: Map<number, WebGLTexture>;

    private readonly digitDamageTextures: Map<number, WebGLTexture>;

    private readonly drawer: Drawer;

    private readonly visibleStateUpdate: () => void;

    private readonly performAIAction: (wasAIActive: boolean) => void;

    private readonly sendFightState: () => Promise<void>;

    public readonly gl: WebGLRenderingContext;

    public readonly shader: DefaultShader;

    public readonly background: Sprite;

    public readonly spellBookOverlay: Sprite;

    public readonly spellBookWhiteSprite: Sprite;

    public readonly spellBookBlackSprite: Sprite;

    public readonly spellBookButton: Button;

    public readonly selectedAttackTypeButton: Button;

    public readonly hourGlassButton: Button;

    public readonly shieldButton: Button;

    public readonly nextButton: Button;

    public readonly aiButton: Button;

    public readonly lifeButton: Button;

    public readonly natureButton: Button;

    public readonly orderButton: Button;

    public readonly mightButton: Button;

    public readonly chaosButton: Button;

    public readonly deathButton: Button;

    public constructor({ gl, shader, textures }: SceneContext) {
        super(
            gl,
            new SceneSettings(
                new GridSettings(GRID_SIZE, MAX_Y, MIN_Y, MAX_X, MIN_X, MOVEMENT_DELTA, UNIT_SIZE_DELTA),
                false,
            ),
        );
        this.gl = gl;
        this.shader = shader;
        this.textures = textures;
        this.pathHelper = new PathHelper(this.sc_sceneSettings.getGridSettings());

        this.digitNormalTextures = new Map([
            [0, textures.zero_white.texture],
            [1, textures.one_white.texture],
            [2, textures.two_white.texture],
            [3, textures.three_white.texture],
            [4, textures.four_white.texture],
            [5, textures.five_white.texture],
            [6, textures.six_white.texture],
            [7, textures.seven_white.texture],
            [8, textures.eight_white.texture],
            [9, textures.nine_white.texture],
            [-1, textures.damage.texture],
        ]);

        this.digitDamageTextures = new Map([
            [0, textures.zero_damage.texture],
            [1, textures.one_damage.texture],
            [2, textures.two_damage.texture],
            [3, textures.three_damage.texture],
            [4, textures.four_damage.texture],
            [5, textures.five_damage.texture],
            [6, textures.six_damage.texture],
            [7, textures.seven_damage.texture],
            [8, textures.eight_damage.texture],
            [9, textures.nine_damage.texture],
            [-1, textures.m_damage.texture],
        ]);

        this.unitsFactory = new UnitsFactory(
            this.sc_world,
            this.gl,
            this.shader,
            this.digitNormalTextures,
            this.digitDamageTextures,
            this.sc_sceneSettings.getGridSettings(),
            textures,
            new AbilityFactory(new EffectFactory()),
        );
        this.unitsHolder = new UnitsHolder(this.sc_world, this.sc_sceneSettings.getGridSettings(), this.unitsFactory);

        this.ground = this.sc_world.CreateBody();
        this.grid = new Grid(
            this.sc_sceneSettings.getGridSettings(),
            FightStateManager.getInstance().getFightProperties().getGridType(),
        );
        this.refreshVisibleStateIfNeeded();
        this.gridMatrix = this.grid.getMatrix();
        this.obstacleGenerator = new ObstacleGenerator(this.sc_world, textures);
        this.drawer = new Drawer(
            this.sc_sceneSettings.getGridSettings(),
            this.sc_world,
            this.gl,
            this.shader,
            this.textures,
            this.obstacleGenerator,
        );
        this.drawer.setGridType(this.grid.getGridType());
        this.sc_gridTypeUpdateNeeded = true;

        this.lowerPlacement = new SquarePlacement(this.sc_sceneSettings.getGridSettings(), PlacementType.LOWER, 5);
        this.upperPlacement = new SquarePlacement(this.sc_sceneSettings.getGridSettings(), PlacementType.UPPER, 5);

        this.allowedPlacementCellHashes = new Set([
            ...this.lowerPlacement.possibleCellHashes(),
            ...this.upperPlacement.possibleCellHashes(),
        ]);

        this.background = new Sprite(gl, shader, this.textures.background_dark.texture);
        this.spellBookOverlay = new Sprite(gl, shader, this.textures.book_1024.texture);
        this.spellBookWhiteSprite = new Sprite(gl, shader, this.textures.spellbook_white_128.texture);
        this.spellBookBlackSprite = new Sprite(gl, shader, this.textures.spellbook_black_128.texture);

        const fightButtonsPositionX = this.sc_renderControlsRightSide
            ? FIGHT_BUTTONS_RIGHT_POSITION_X
            : FIGHT_BUTTONS_LEFT_POSITION_X;

        this.spellBookButton = new Button(
            this.sc_sceneSettings.getGridSettings(),
            this.spellBookWhiteSprite,
            new b2Vec2(fightButtonsPositionX, 1344),
            this.spellBookBlackSprite,
        );
        this.selectedAttackTypeButton = new Button(
            this.sc_sceneSettings.getGridSettings(),
            new Sprite(gl, shader, this.textures.melee_white_128.texture),
            new b2Vec2(fightButtonsPositionX, 1216),
            new Sprite(gl, shader, this.textures.melee_black_128.texture),
        );
        this.hourGlassButton = new Button(
            this.sc_sceneSettings.getGridSettings(),
            new Sprite(gl, shader, this.textures.hourglass_white_128.texture),
            new b2Vec2(fightButtonsPositionX, 1088),
            new Sprite(gl, shader, this.textures.hourglass_black_128.texture),
        );
        this.shieldButton = new Button(
            this.sc_sceneSettings.getGridSettings(),
            new Sprite(gl, shader, this.textures.shield_white_128.texture),
            new b2Vec2(fightButtonsPositionX, 960),
            new Sprite(gl, shader, this.textures.shield_black_128.texture),
        );
        this.nextButton = new Button(
            this.sc_sceneSettings.getGridSettings(),
            new Sprite(gl, shader, this.textures.next_white_128.texture),
            new b2Vec2(fightButtonsPositionX, 832),
            new Sprite(gl, shader, this.textures.next_black_128.texture),
        );
        this.aiButton = new Button(
            this.sc_sceneSettings.getGridSettings(),
            new Sprite(gl, shader, this.textures.ai_white_128.texture),
            new b2Vec2(fightButtonsPositionX, 704),
            new Sprite(gl, shader, this.textures.ai_black_128.texture),
            new Sprite(gl, shader, this.textures.ai_active_128.texture),
        );
        this.lifeButton = new Button(
            this.sc_sceneSettings.getGridSettings(),
            new Sprite(gl, shader, this.textures.life_128.texture),
            new b2Vec2(-1088, 64),
        );
        this.natureButton = new Button(
            this.sc_sceneSettings.getGridSettings(),
            new Sprite(gl, shader, this.textures.nature_128.texture),
            new b2Vec2(-1216, 64),
        );
        this.orderButton = new Button(
            this.sc_sceneSettings.getGridSettings(),
            new Sprite(gl, shader, this.textures.order_128.texture),
            new b2Vec2(-1344, 64),
        );
        this.mightButton = new Button(
            this.sc_sceneSettings.getGridSettings(),
            new Sprite(gl, shader, this.textures.might_128.texture),
            new b2Vec2(-1088, 192),
        );
        this.chaosButton = new Button(
            this.sc_sceneSettings.getGridSettings(),
            new Sprite(gl, shader, this.textures.chaos_128.texture),
            new b2Vec2(-1216, 192),
        );
        this.deathButton = new Button(
            this.sc_sceneSettings.getGridSettings(),
            new Sprite(gl, shader, this.textures.death_locked_128.texture),
            new b2Vec2(-1344, 192),
        );

        switch (HoCLib.getRandomInt(0, 4)) {
            case 0:
                this.lifeButton.setIsSelected(true);
                this.sc_selectedFactionName = FactionType.LIFE;
                this.sc_factionNameUpdateNeeded = true;
                break;
            case 1:
                this.natureButton.setIsSelected(true);
                this.sc_selectedFactionName = FactionType.NATURE;
                this.sc_factionNameUpdateNeeded = true;
                break;
            // case 4:
            //     this.deathButton.setIsSelected(true);
            //     this.m_selectedRaceName = FactionType.DEATH;
            //     this.m_race_name_update_needed = true;
            //     break;
            case 2:
                this.mightButton.setIsSelected(true);
                this.sc_selectedFactionName = FactionType.MIGHT;
                this.sc_factionNameUpdateNeeded = true;
                break;
            case 3:
                this.chaosButton.setIsSelected(true);
                this.sc_selectedFactionName = FactionType.CHAOS;
                this.sc_factionNameUpdateNeeded = true;
                break;
            // case 5:
            //     this.orderButton.setIsSelected(true);
            //     this.m_selectedRaceName = "Order";
            //     this.m_race_name_update_needed = true;
            //     break;
            default:
                this.deselectRaceButtons();
        }

        this.spawnUnits();
        this.attackHandler = new AttackHandler(this.sc_sceneSettings.getGridSettings(), this.grid, this.sc_sceneLog);
        this.moveHandler = new MoveHandler(this.sc_sceneSettings.getGridSettings(), this.grid, this.unitsHolder);

        // update remaining time every half a second
        this.visibleStateUpdate = () => {
            this.refreshVisibleStateIfNeeded();
            if (this.sc_visibleState) {
                const fightProperties = FightStateManager.getInstance().getFightProperties();
                this.sc_visibleState.secondsMax =
                    (fightProperties.getCurrentTurnEnd() - fightProperties.getCurrentTurnStart()) / 1000;
                const remaining = (fightProperties.getCurrentTurnEnd() - HoCLib.getTimeMillis()) / 1000;
                this.sc_visibleState.secondsRemaining = remaining > 0 ? remaining : 0;
                this.sc_visibleStateUpdateNeeded = true;
            }
        };

        this.performAIAction = (wasAIActive: boolean) => {
            if (!this.currentActiveUnit) {
                return;
            }

            const action = findTarget(this.currentActiveUnit, this.grid, this.gridMatrix, this.pathHelper);
            if (action?.actionType() === AIActionType.MOVE_AND_MELEE_ATTACK) {
                this.currentActiveUnit.selectAttackType(AttackType.MELEE);
                if (
                    this.currentActiveUnit.getAttackTypeSelection() === AttackType.MELEE &&
                    this.currentActiveUnit.hasAbilityActive("Area Throw")
                ) {
                    const currentCell = GridMath.getCellForPosition(
                        this.sc_sceneSettings.getGridSettings(),
                        this.currentActiveUnit.getPosition(),
                    );
                    if (currentCell) {
                        this.updateCurrentMovePath(currentCell);
                    }
                }
                this.sc_selectedAttackType = this.currentActiveUnit.getAttackTypeSelection();
                this.currentActiveKnownPaths = action.currentActiveKnownPaths();
                const cellToAttack = action.cellToAttack();
                if (cellToAttack) {
                    const targetUnitId = this.grid.getOccupantUnitId(cellToAttack);
                    if (targetUnitId !== undefined) {
                        const unitToAttack = this.unitsHolder.getAllUnits().get(targetUnitId);
                        if (unitToAttack) {
                            this.hoverAttackUnits = [[unitToAttack]];
                        }
                        const attackedCell = action.cellToMove();
                        if (attackedCell) {
                            this.hoverAttackFrom = attackedCell;
                            if (this.currentActiveUnit.isSmallSize()) {
                                this.hoverSelectedCells = [attackedCell];
                            } else {
                                const position = GridMath.getPositionForCell(
                                    attackedCell,
                                    this.sc_sceneSettings.getGridSettings().getMinX(),
                                    this.sc_sceneSettings.getGridSettings().getStep(),
                                    this.sc_sceneSettings.getGridSettings().getHalfStep(),
                                );
                                this.hoverSelectedCells = GridMath.getCellsAroundPosition(
                                    this.sc_sceneSettings.getGridSettings(),
                                    {
                                        x: position.x - this.sc_sceneSettings.getGridSettings().getHalfStep(),
                                        y: position.y - this.sc_sceneSettings.getGridSettings().getHalfStep(),
                                    },
                                );
                            }
                        }
                    }
                }
                this.landAttack();
            } else if (action?.actionType() === AIActionType.MELEE_ATTACK) {
                this.currentActiveUnit.selectAttackType(AttackType.MELEE);
                if (
                    this.currentActiveUnit.getAttackTypeSelection() === AttackType.MELEE &&
                    this.currentActiveUnit.hasAbilityActive("Area Throw")
                ) {
                    const currentCell = GridMath.getCellForPosition(
                        this.sc_sceneSettings.getGridSettings(),
                        this.currentActiveUnit.getPosition(),
                    );
                    if (currentCell) {
                        this.updateCurrentMovePath(currentCell);
                    }
                }
                this.currentActiveKnownPaths = action.currentActiveKnownPaths();
                const cellToAttack = action.cellToAttack();
                if (cellToAttack) {
                    const targetUnitId = this.grid.getOccupantUnitId(cellToAttack);
                    if (targetUnitId !== undefined) {
                        const unitToAttack = this.unitsHolder.getAllUnits().get(targetUnitId);
                        if (unitToAttack) {
                            this.hoverAttackUnits = [[unitToAttack]];
                        }
                        const attackedCell = action.cellToMove();
                        if (attackedCell) {
                            this.hoverAttackFrom = attackedCell;
                        }
                    }
                }
                this.landAttack();
            } else if (action?.actionType() === AIActionType.RANGE_ATTACK) {
                this.currentActiveUnit.selectAttackType(AttackType.RANGE);
                if (
                    this.currentActiveUnit.getAttackTypeSelection() === AttackType.RANGE &&
                    this.currentActiveUnit.hasAbilityActive("Area Throw")
                ) {
                    this.cleanActivePaths();
                } else {
                    this.currentActiveKnownPaths = action.currentActiveKnownPaths();
                }
                const cellToAttack = action.cellToAttack();
                if (cellToAttack) {
                    const targetUnitId = this.grid.getOccupantUnitId(cellToAttack);
                    if (targetUnitId !== undefined) {
                        const unit = this.unitsHolder.getAllUnits().get(targetUnitId);
                        if (unit) {
                            this.rangeResponseUnits = [unit];
                        }
                    }
                }
                // for (const unit of this.unitsHolder.getAllUnits().values()) {
                //    if(unit.getCell() !== undefined && unit.getCell() === action.cellToAttack()) {
                //        this.rangeResponseUnit = unit;
                //    }
                // }
                this.landAttack();
            } else {
                // from attack_handler:405 moveHandler.startMoving() refactor for small and big units
                const cellToMove = action?.cellToMove();
                if (cellToMove) {
                    if (this.currentActiveUnit.isSmallSize()) {
                        this.hoverSelectedCells = [cellToMove];
                        const moveStarted = this.moveHandler.startMoving(
                            cellToMove,
                            this.drawer,
                            FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                            this.sc_selectedBody,
                            action?.currentActiveKnownPaths(),
                        );
                        if (moveStarted) {
                            const position = GridMath.getPositionForCell(
                                cellToMove,
                                this.sc_sceneSettings.getGridSettings().getMinX(),
                                this.sc_sceneSettings.getGridSettings().getStep(),
                                this.sc_sceneSettings.getGridSettings().getHalfStep(),
                            );
                            this.currentActiveUnit.setPosition(position.x, position.y);
                            this.grid.occupyCell(
                                cellToMove,
                                this.currentActiveUnit.getId(),
                                this.currentActiveUnit.getTeam(),
                                this.currentActiveUnit.getAttackRange(),
                            );
                        }
                    } else {
                        const position = GridMath.getPositionForCell(
                            cellToMove,
                            this.sc_sceneSettings.getGridSettings().getMinX(),
                            this.sc_sceneSettings.getGridSettings().getStep(),
                            this.sc_sceneSettings.getGridSettings().getHalfStep(),
                        );
                        const cells = GridMath.getCellsAroundPosition(this.sc_sceneSettings.getGridSettings(), {
                            x: position.x - this.sc_sceneSettings.getGridSettings().getHalfStep(),
                            y: position.y - this.sc_sceneSettings.getGridSettings().getHalfStep(),
                        });
                        this.hoverSelectedCells = cells;
                        const moveStarted = this.moveHandler.startMoving(
                            cellToMove,
                            this.drawer,
                            FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                            this.sc_selectedBody,
                            action?.currentActiveKnownPaths(),
                        );
                        if (moveStarted) {
                            this.currentActiveUnit.setPosition(
                                position.x - this.sc_sceneSettings.getGridSettings().getHalfStep(),
                                position.y - this.sc_sceneSettings.getGridSettings().getHalfStep(),
                            );

                            this.grid.occupyCells(
                                cells,
                                this.currentActiveUnit.getId(),
                                this.currentActiveUnit.getTeam(),
                                this.currentActiveUnit.getAttackRange(),
                            );
                        }
                    }
                }
            }

            // finish turn
            this.finishTurn();
            this.sc_isAIActive = wasAIActive;
            this.performingAIAction = false;
        };

        this.sendFightState = async () => {
            this.refreshVisibleStateIfNeeded();
            if (this.sc_visibleState) {
                const fightProperties = FightStateManager.getInstance().getFightProperties();

                try {
                    console.log("Before sending data");
                    // console.log(fight.toObject());
                    const postResponse = await axios.post("http://localhost:8080/fights", fightProperties.serialize(), {
                        headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
                    });
                    // console.log(fight.serializeBinary ());
                    console.log("After sending data");
                    // console.log(postResponse.headers);
                    console.log(postResponse.headers);
                    console.log(postResponse.data);
                } catch (err) {
                    console.error(err);
                }
            }
        };

        HoCLib.interval(this.visibleStateUpdate, 500);
        HoCLib.interval(this.sendFightState, 1000000);
    }

    private spawnObstacles(): string | undefined {
        if (
            FightStateManager.getInstance().getFightProperties().getCurrentLap() >=
            HoCConstants.NUMBER_OF_LAPS_TILL_STOP_NARROWING
        ) {
            return undefined;
        }

        let laps = Math.floor(
            FightStateManager.getInstance().getFightProperties().getCurrentLap() /
                FightStateManager.getInstance().getFightProperties().getNumberOfLapsTillNarrowing(),
        );
        if (laps < 1) {
            return undefined;
        }

        const prevLap = laps - 1;
        const minCellX =
            this.sc_sceneSettings.getGridSettings().getMinX() / this.sc_sceneSettings.getGridSettings().getCellSize();
        const maxCellX =
            this.sc_sceneSettings.getGridSettings().getMaxX() / this.sc_sceneSettings.getGridSettings().getCellSize();
        const minCellY =
            this.sc_sceneSettings.getGridSettings().getMinY() / this.sc_sceneSettings.getGridSettings().getCellSize();
        const maxCellY =
            this.sc_sceneSettings.getGridSettings().getMaxY() / this.sc_sceneSettings.getGridSettings().getCellSize();

        const logs: string[] = [];

        this.drawer.setHoleLayers(laps);

        while (laps) {
            for (let i = minCellX + prevLap; i < maxCellX - prevLap; i++) {
                const cellX = i + maxCellX;
                const cellY = prevLap;
                this.drawer.addTerrainObstacle(
                    this.obstacleGenerator.generateHole({ x: i * STEP, y: prevLap * STEP }, STEP, STEP),
                );
                const cell = { x: cellX, y: cellY };
                const log = this.moveHandler.moveUnitTowardsCenter(cell, GridConstants.UPDATE_UP, laps);
                if (log) {
                    logs.push(log);
                }
                this.grid.occupyByHole(cell);
            }
            for (let i = minCellX + prevLap; i < maxCellX - prevLap; i++) {
                const cellX = i + maxCellX;
                const cellY = maxCellY - laps;
                this.drawer.addTerrainObstacle(
                    this.obstacleGenerator.generateHole({ x: i * STEP, y: (maxCellY - laps) * STEP }, STEP, STEP),
                );
                const cell = { x: cellX, y: cellY };
                const log = this.moveHandler.moveUnitTowardsCenter(cell, GridConstants.UPDATE_DOWN, laps);
                if (log) {
                    logs.push(log);
                }
                this.grid.occupyByHole({ x: cellX, y: cellY });
            }
            for (let i = minCellY + prevLap; i < maxCellY - prevLap; i++) {
                const cellX = prevLap;
                const cellY = i;
                this.drawer.addTerrainObstacle(
                    this.obstacleGenerator.generateHole({ x: (minCellX + prevLap) * STEP, y: i * STEP }, STEP, STEP),
                );
                const cell = { x: cellX, y: cellY };
                const log = this.moveHandler.moveUnitTowardsCenter(cell, GridConstants.UPDATE_RIGHT, laps);
                if (log) {
                    logs.push(log);
                }
                this.grid.occupyByHole({ x: cellX, y: cellY });
            }
            for (let i = minCellY + prevLap; i < maxCellY - prevLap; i++) {
                const cellX = (maxCellX << 1) - laps;
                const cellY = i;
                this.drawer.addTerrainObstacle(
                    this.obstacleGenerator.generateHole({ x: (maxCellX - laps) * STEP, y: i * STEP }, STEP, STEP),
                );
                const cell = { x: cellX, y: cellY };
                const log = this.moveHandler.moveUnitTowardsCenter(cell, GridConstants.UPDATE_LEFT, laps);
                if (log) {
                    logs.push(log);
                }
                this.grid.occupyByHole({ x: cellX, y: cellY });
            }
            laps--;
        }
        this.gridMatrix = this.grid.getMatrix();

        return logs.join("\n");
    }

    private spawnUnits(): void {
        this.unitsHolder.spawn(TeamType.LOWER, this.sc_selectedFactionName);
        this.unitsHolder.spawn(TeamType.UPPER, this.sc_selectedFactionName);
    }

    public requestTime(team: number): void {
        FightStateManager.getInstance().getFightProperties().requestAdditionalTurnTime(team);
        if (this.sc_visibleState) {
            this.sc_visibleState.canRequestAdditionalTime = false;
            this.sc_visibleStateUpdateNeeded = true;
        }
    }

    public startScene() {
        super.startScene();
        FightStateManager.getInstance().getFightProperties().startFight();
    }

    public setGridType(gridType: GridType): void {
        if (FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
            return;
        }

        FightStateManager.getInstance().getFightProperties().setGridType(gridType);
        this.grid.refreshWithNewType(FightStateManager.getInstance().getFightProperties().getGridType());
        this.drawer.setGridType(FightStateManager.getInstance().getFightProperties().getGridType());
        this.gridMatrix = this.grid.getMatrix();
    }

    public getGridType(): GridType {
        return FightStateManager.getInstance().getFightProperties().getGridType();
    }

    public resetRightControls(): void {
        const fightButtonsPositionX = this.sc_renderControlsRightSide
            ? FIGHT_BUTTONS_RIGHT_POSITION_X
            : FIGHT_BUTTONS_LEFT_POSITION_X;

        this.spellBookButton.setPosition(new b2Vec2(fightButtonsPositionX, 1344));
        this.selectedAttackTypeButton.setPosition(new b2Vec2(fightButtonsPositionX, 1216));
        this.hourGlassButton.setPosition(new b2Vec2(fightButtonsPositionX, 1088));
        this.shieldButton.setPosition(new b2Vec2(fightButtonsPositionX, 960));
        this.nextButton.setPosition(new b2Vec2(fightButtonsPositionX, 832));
        this.aiButton.setPosition(new b2Vec2(fightButtonsPositionX, 704));
    }

    private deselectRaceButtons(): void {
        this.lifeButton.setIsSelected(false);
        this.natureButton.setIsSelected(false);
        // this.orderButton.setIsSelected(false);
        this.mightButton.setIsSelected(false);
        this.chaosButton.setIsSelected(false);
        // this.deathButton.setIsSelected(false);
    }

    private isButtonHover(cell?: XY): boolean {
        return (
            !!cell &&
            (this.lifeButton.isHover(cell) ||
                this.natureButton.isHover(cell) ||
                this.mightButton.isHover(cell) ||
                // this.orderButton.isHover(cell) ||
                this.chaosButton.isHover(cell)) // ||
            // this.deathButton.isHover(cell))
        );
    }

    protected destroyTempFixtures(): void {
        this.destroyPlacements();
        this.deselectRaceButtons();
        this.sc_selectedFactionName = FactionType.NO_TYPE;
        this.sc_factionNameUpdateNeeded = true;
    }

    protected destroyNonPlacedUnits(): void {
        if (FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
            return;
        }

        for (let b = this.sc_world.GetBodyList(); b; b = b.GetNext()) {
            if (b.GetType() === b2BodyType.b2_dynamicBody) {
                const unitStats = b.GetUserData();
                if (!unitStats) {
                    continue;
                }

                this.unitsHolder.deleteUnitIfNotAllowed(
                    this.grid,
                    unitStats.team === TeamType.LOWER ? TeamType.UPPER : TeamType.LOWER,
                    this.lowerPlacement,
                    this.upperPlacement,
                    b,
                );
            }
        }
    }

    private resetHover(resetSelectedCells = true): void {
        if (resetSelectedCells) {
            this.sc_hoverUnitNameStr = "";
            this.hoverSelectedCells = undefined;
            this.hoverSelectedCellsSwitchToRed = false;
        }

        this.hoverAttackUnits = undefined;
        this.hoverAOECells = undefined;
        this.hoverActivePath = undefined;
        this.hoverAttackFrom = undefined;
        this.hoverAttackIsSmallSize = undefined;
        this.hoverRangeAttackPosition = undefined;
        this.hoverRangeAttackObstacle = undefined;
        this.hoverRangeAttackDivisors = [];
        this.hoverActiveShotRange = undefined;
        this.hoverActiveAuraRanges = [];
        if (this.hoverRangeAttackLine) {
            this.ground.DestroyFixture(this.hoverRangeAttackLine);
            this.hoverRangeAttackLine = undefined;
        }
        this.rangeResponseUnits = undefined;
        this.rangeResponseAttackDivisor = 1;
        this.sc_moveBlocked = false;
        this.sc_isSelection = false;
    }

    public cloneObject(newAmount?: number) {
        if (this.sc_selectedBody) {
            const selectedUnitData = this.sc_selectedBody.GetUserData();

            let placement: SquarePlacement;
            if (selectedUnitData.team === TeamType.LOWER) {
                placement = this.lowerPlacement;
            } else {
                placement = this.upperPlacement;
            }

            const isSmallUnit = selectedUnitData.size === 1;
            const allowedCells = placement.possibleCellPositions(isSmallUnit);
            HoCLib.shuffle(allowedCells);

            for (const cell of allowedCells) {
                if (this.unitsHolder.spawnSelected(this.grid, selectedUnitData, cell, false, newAmount)) {
                    this.unitsHolder.refreshStackPowerForAllUnits();
                    break;
                }
            }
        }
    }

    public deleteObject() {
        if (this.sc_selectedBody) {
            const selectedUnitData = this.sc_selectedBody.GetUserData();
            this.unitsHolder.deleteUnitById(this.grid, selectedUnitData.id);
            this.deselect();
        }
    }

    protected fillRangeAttackInfo(hoverAttackUnit?: Unit): void {
        if (!this.currentActiveUnit) {
            return;
        }

        const hoverRangeAttackDivisor = this.hoverRangeAttackDivisors.length
            ? this.hoverRangeAttackDivisors[0] ?? 1
            : 1;
        const divisorStr = hoverRangeAttackDivisor > 1 ? `1/${hoverRangeAttackDivisor} ` : "";

        if (hoverAttackUnit) {
            let abilityMultiplier = 1;
            const paralysisAttackerEffect = this.currentActiveUnit.getEffect("Paralysis");
            if (paralysisAttackerEffect) {
                abilityMultiplier *= (100 - paralysisAttackerEffect.getPower()) / 100;
            }

            const minDmg = this.currentActiveUnit.calculateAttackDamageMin(
                hoverAttackUnit,
                true,
                hoverRangeAttackDivisor,
                abilityMultiplier,
            );
            let maxDmg = this.currentActiveUnit.calculateAttackDamageMax(
                hoverAttackUnit,
                true,
                hoverRangeAttackDivisor,
                abilityMultiplier,
            );
            const luckyStrikeAbility = this.currentActiveUnit.getAbility("Lucky Strike");
            if (luckyStrikeAbility) {
                maxDmg = Math.floor(maxDmg * this.currentActiveUnit.calculateAbilityMultiplier(luckyStrikeAbility));
            }
            const minDied = hoverAttackUnit.calculatePossibleLosses(minDmg);
            const maxDied = hoverAttackUnit.calculatePossibleLosses(maxDmg);
            if (minDied !== maxDied) {
                this.sc_attackKillSpreadStr = `${minDied}-${maxDied}`;
            } else if (minDied) {
                this.sc_attackKillSpreadStr = minDied.toString();
            }

            this.sc_attackDamageSpreadStr = `${minDmg}-${maxDmg}`;
        } else {
            this.sc_attackKillSpreadStr = "";
            this.sc_attackDamageSpreadStr = "";
        }

        this.sc_attackRangeDamageDivisorStr = divisorStr;
        this.sc_hoverTextUpdateNeeded = true;
    }

    protected initializePossibleRangeResponse(fromUnit: Unit, responsePosition: XY): void {
        const hoverUnitCell = GridMath.getCellForPosition(
            this.sc_sceneSettings.getGridSettings(),
            fromUnit.getPosition(),
        );

        if (
            hoverUnitCell &&
            fromUnit.getAttackType() === AttackType.RANGE &&
            fromUnit.getRangeShots() > 0 &&
            !this.attackHandler.canBeAttackedByMelee(
                fromUnit.getPosition(),
                fromUnit.isSmallSize(),
                this.grid.getEnemyAggrMatrixByUnitId(fromUnit.getId()),
            ) &&
            !fromUnit.hasDebuffActive("Range Null Field Aura") &&
            !fromUnit.hasDebuffActive("Rangebane")
        ) {
            const evaluatedRangeResponse = this.attackHandler.evaluateRangeAttack(
                this.unitsHolder.getAllUnits(),
                fromUnit,
                fromUnit.getPosition(),
                responsePosition,
            );
            this.rangeResponseAttackDivisor = evaluatedRangeResponse.rangeAttackDivisors.shift() ?? 1;

            this.rangeResponseUnits = evaluatedRangeResponse.affectedUnits.shift();
        }
    }

    private getHoverAttackUnit(): Unit | undefined {
        if (!this.hoverAttackUnits?.length) {
            return undefined;
        }

        const units = this.hoverAttackUnits[0];
        if (!units?.length) {
            return undefined;
        }

        return units[0];
    }

    private updateHoverInfoWithButtonAction(mouseCell: XY): void {
        if (this.spellBookButton.isHover(mouseCell) && this.currentActiveUnit?.getSpellsCount()) {
            this.sc_hoverInfoArr = ["Select spell"];
            this.sc_hoverTextUpdateNeeded = true;
            return;
        }

        if (this.aiButton.isHover(mouseCell)) {
            if (this.sc_isAIActive) {
                this.sc_hoverInfoArr = ["Turn off AI"];
            } else {
                this.sc_hoverInfoArr = ["Turn on AI"];
            }
            this.sc_hoverTextUpdateNeeded = true;
            return;
        }

        if (this.shieldButton.isHover(mouseCell)) {
            this.sc_hoverInfoArr = ["Clean up randomized luck", "and skip turn"];
            this.sc_hoverTextUpdateNeeded = true;
            return;
        }

        if (this.nextButton.isHover(mouseCell)) {
            this.sc_hoverInfoArr = ["Skip turn"];
            this.sc_hoverTextUpdateNeeded = true;
            return;
        }

        if (this.hourGlassButton.isHover(mouseCell)) {
            this.sc_hoverInfoArr = ["Wait"];
            this.sc_hoverTextUpdateNeeded = true;
            return;
        }

        if (this.selectedAttackTypeButton.isHover(mouseCell)) {
            this.sc_hoverInfoArr = ["Switch attack type"];
            this.sc_hoverTextUpdateNeeded = true;
            return;
        }

        if (this.lifeButton.isHover(mouseCell)) {
            this.sc_hoverInfoArr = ["Load Life faction units"];
            this.sc_hoverTextUpdateNeeded = true;
            return;
        }

        if (this.natureButton.isHover(mouseCell)) {
            this.sc_hoverInfoArr = ["Load Nature faction units"];
            this.sc_hoverTextUpdateNeeded = true;
            return;
        }

        if (this.mightButton.isHover(mouseCell)) {
            this.sc_hoverInfoArr = ["Load Might faction units"];
            this.sc_hoverTextUpdateNeeded = true;
            return;
        }

        if (this.chaosButton.isHover(mouseCell)) {
            this.sc_hoverInfoArr = ["Load Chaos faction units"];
            this.sc_hoverTextUpdateNeeded = true;
        }
    }

    protected hover(): void {
        if (this.sc_isAnimating || !this.sc_mouseWorld) {
            this.resetHover();
            return;
        }

        if (this.sc_hoverUnitNameStr) {
            this.sc_hoverUnitNameStr = "";
            this.sc_hoverTextUpdateNeeded = true;
        }

        if (!this.sc_hoverInfoArr || this.sc_hoverInfoArr.length) {
            this.sc_hoverInfoArr = [];
            this.sc_hoverTextUpdateNeeded = true;
        }

        if (this.sc_attackDamageSpreadStr || this.sc_attackKillSpreadStr || this.sc_attackRangeDamageDivisorStr) {
            this.sc_attackDamageSpreadStr = "";
            this.sc_attackRangeDamageDivisorStr = "";
            this.sc_attackKillSpreadStr = "";
            this.sc_hoverTextUpdateNeeded = true;
        }

        const mouseCell = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), this.sc_mouseWorld);
        if (FightStateManager.getInstance().getFightProperties().hasFightStarted() && this.currentActiveUnit) {
            if (!mouseCell) {
                this.resetHover();
                return;
            }

            if (this.sc_renderSpellBookOverlay) {
                this.hoveredSpell = this.currentActiveUnit.getHoveredSpell(this.sc_mouseWorld);
                if (this.hoveredSpell) {
                    const infoArr: string[] = [];
                    for (const descStr of this.hoveredSpell.getDesc()) {
                        infoArr.push(
                            descStr.replace(
                                /\{\}/g,
                                (this.currentActiveUnit.getAmountAlive() * this.hoveredSpell.getPower()).toString(),
                            ),
                        );
                    }
                    this.sc_hoverInfoArr = infoArr;
                    this.sc_hoverTextUpdateNeeded = true;
                }
                this.resetHover(false);
                return;
            }

            const unitId = this.grid.getOccupantUnitId(mouseCell);

            if (unitId && this.unitsHolder.getAllUnits().has(unitId)) {
                this.hoverUnit = this.unitsHolder.getAllUnits().get(unitId);
                let hoverUnitCell: XY | undefined = undefined;
                this.hoverSelectedCellsSwitchToRed = false;

                this.hoverActiveShotRange = undefined;
                if (this.hoverUnit) {
                    hoverUnitCell = GridMath.getCellForPosition(
                        this.sc_sceneSettings.getGridSettings(),
                        this.hoverUnit.getPosition(),
                    );

                    if (this.hoverUnit.getId() !== this.currentActiveUnit.getId()) {
                        if (
                            this.attackHandler.canLandRangeAttack(
                                this.hoverUnit,
                                this.grid.getEnemyAggrMatrixByUnitId(this.hoverUnit.getId()),
                            )
                        ) {
                            this.hoverActiveShotRange = {
                                xy: this.hoverUnit.getPosition(),
                                distance: this.hoverUnit.getRangeShotDistance() * STEP,
                            };
                        }

                        this.fillActiveAuraRanges(
                            this.hoverUnit.isSmallSize(),
                            this.hoverUnit.getPosition(),
                            this.hoverUnit.getAllProperties().aura_ranges,
                            this.hoverUnit.getAllProperties().aura_is_buff,
                            true,
                        );

                        this.hoverSelectedCells = undefined;
                        if (hoverUnitCell && this.hoverUnit.canMove()) {
                            this.hoverActivePath = this.pathHelper.getMovePath(
                                hoverUnitCell,
                                this.gridMatrix,
                                this.hoverUnit.getSteps(),
                                this.grid.getAggrMatrixByTeam(
                                    this.hoverUnit.getTeam() === TeamType.LOWER ? TeamType.UPPER : TeamType.LOWER,
                                ),
                                this.hoverUnit.getCanFly(),
                                this.hoverUnit.isSmallSize(),
                            ).cells;
                        } else {
                            this.hoverActivePath = undefined;
                        }
                    } else {
                        this.resetHover();
                    }
                }

                const currentUnitCell = GridMath.getCellForPosition(
                    this.sc_sceneSettings.getGridSettings(),
                    this.currentActiveUnit.getPosition(),
                );

                if (
                    this.currentActiveUnit &&
                    (this.currentActiveUnit.getAttackTypeSelection() === AttackType.MAGIC || this.currentActiveSpell)
                ) {
                    // if (
                    //     this.currentActiveUnit.getAttackTypeSelection() !== AttackType.MAGIC &&
                    //     this.currentActiveSpell
                    // ) {
                    //     this.selectAttack(AttackType.MAGIC, currentUnitCell, true);
                    //     this.currentActiveUnitSwitchedAttackAuto = true;
                    //     this.switchToSelectedAttackType = undefined;
                    //     console.log("Switch to MAGIC");
                    //     console.log("this.currentActiveSpell");
                    //     console.log(this.currentActiveSpell);
                    // }

                    if (
                        this.currentActiveSpell &&
                        SpellHelper.canCastSpell(
                            false,
                            this.sc_sceneSettings.getGridSettings(),
                            this.gridMatrix,
                            this.hoverUnit?.getBuffs(),
                            this.currentActiveSpell,
                            this.currentActiveUnit.getSpells(),
                            this.hoverUnit?.getSpells(),
                            undefined,
                            this.currentActiveUnit.getId(),
                            this.hoverUnit?.getId(),
                            this.currentActiveUnit.getTeam(),
                            this.hoverUnit?.getTeam(),
                            this.currentActiveUnit.getName(),
                            this.hoverUnit?.getName(),
                            this.hoverUnit?.getLevel(),
                            this.hoverUnit?.getHp(),
                            this.hoverUnit?.getMaxHp(),
                            this.currentActiveUnit.getStackPower(),
                            this.hoverUnit?.getMagicResist(),
                        )
                    ) {
                        if (hoverUnitCell) {
                            if (!this.currentActiveSpell.isBuff() && this.hoverUnit) {
                                this.hoverAttackUnits = [[this.hoverUnit]];
                            } else {
                                this.hoverAttackFrom = hoverUnitCell;
                            }
                            this.hoverAttackIsSmallSize = this.hoverUnit?.isSmallSize();
                            this.sc_moveBlocked = true;
                        }
                    } else {
                        this.hoverAttackFrom = undefined;
                        this.hoverAttackIsSmallSize = undefined;
                        this.hoverAttackUnits = undefined;
                    }

                    return;
                }

                this.hoverSelectedCells = undefined;

                if (
                    !this.currentActiveSpell &&
                    !this.currentActiveUnitSwitchedAttackAuto &&
                    currentUnitCell &&
                    this.currentActiveUnit.getAttackType() === AttackType.RANGE &&
                    this.currentActiveUnit.getAttackTypeSelection() !== AttackType.RANGE &&
                    !this.attackHandler.canBeAttackedByMelee(
                        this.currentActiveUnit.getPosition(),
                        this.currentActiveUnit.isSmallSize(),
                        this.grid.getEnemyAggrMatrixByUnitId(this.currentActiveUnit.getId()),
                    ) &&
                    this.currentActiveUnit.getRangeShots() > 0 &&
                    !this.currentActiveUnit.hasDebuffActive("Range Null Field Aura") &&
                    !this.currentActiveUnit.hasDebuffActive("Rangebane")
                ) {
                    this.selectAttack(AttackType.RANGE, currentUnitCell, true);
                    this.currentActiveUnitSwitchedAttackAuto = true;
                    this.switchToSelectedAttackType = undefined;

                    console.log("Switch to RANGE");
                }

                if (
                    this.currentActiveUnit.getAttackTypeSelection() === AttackType.MELEE &&
                    !this.currentActiveUnit.hasAbilityActive("No Melee")
                ) {
                    if (this.hoverRangeAttackLine) {
                        this.ground.DestroyFixture(this.hoverRangeAttackLine);
                        this.hoverRangeAttackLine = undefined;
                    }
                    this.hoverRangeAttackPosition = undefined;
                    this.hoverRangeAttackDivisors = [];
                    this.rangeResponseAttackDivisor = 1;
                    this.rangeResponseUnits = undefined;
                    if (this.canAttackByMeleeTargets?.unitIds.has(unitId)) {
                        if (
                            this.hoverUnit &&
                            !(
                                this.currentActiveUnit.hasDebuffActive("Cowardice") &&
                                this.currentActiveUnit.getCumulativeHp() < this.hoverUnit.getCumulativeHp()
                            )
                        ) {
                            this.hoverAttackUnits = [[this.hoverUnit]];
                        } else {
                            this.hoverAttackUnits = undefined;
                        }

                        this.hoverActivePath = undefined;

                        const hoverAttackUnit = this.getHoverAttackUnit();

                        if (hoverAttackUnit) {
                            const unitCell = GridMath.getCellForPosition(
                                this.sc_sceneSettings.getGridSettings(),
                                hoverAttackUnit.getPosition(),
                            );

                            if (!unitCell) {
                                this.hoverAttackUnits = undefined;
                                return;
                            }

                            this.hoverAttackFrom = this.pathHelper.calculateClosestAttackFrom(
                                this.sc_mouseWorld,
                                this.canAttackByMeleeTargets.attackCells,
                                hoverAttackUnit.isSmallSize()
                                    ? [unitCell]
                                    : GridMath.getCellsAroundPosition(
                                          this.sc_sceneSettings.getGridSettings(),
                                          hoverAttackUnit.getPosition(),
                                      ),
                                this.currentActiveUnit.isSmallSize(),
                                this.currentActiveUnit.getAttackRange(),
                                hoverAttackUnit.isSmallSize(),
                                hoverAttackUnit.getTeam(),
                                this.canAttackByMeleeTargets.attackCellHashesToLargeCells,
                            );
                            this.hoverAttackIsSmallSize = undefined;
                            let abilityMultiplier = 1;
                            const abilitiesWithPositionCoeff = AbilityHelper.getAbilitiesWithPosisionCoefficient(
                                this.currentActiveUnit.getAbilities(),
                                this.hoverAttackFrom,
                                GridMath.getCellForPosition(
                                    this.sc_sceneSettings.getGridSettings(),
                                    hoverAttackUnit.getPosition(),
                                ),
                                hoverAttackUnit.isSmallSize(),
                                this.currentActiveUnit.getTeam(),
                            );

                            if (abilitiesWithPositionCoeff.length) {
                                for (const awpc of abilitiesWithPositionCoeff) {
                                    abilityMultiplier *= this.currentActiveUnit.calculateAbilityMultiplier(awpc);
                                }
                            }

                            if (this.hoverAttackFrom) {
                                abilityMultiplier *= processRapidChargeAbility(
                                    this.currentActiveUnit,
                                    HoCMath.getDistance(
                                        this.currentActiveUnit.getPosition(),
                                        GridMath.getPositionForCell(
                                            this.hoverAttackFrom,
                                            this.sc_sceneSettings.getGridSettings().getMinX(),
                                            this.sc_sceneSettings.getGridSettings().getStep(),
                                            this.sc_sceneSettings.getGridSettings().getHalfStep(),
                                        ),
                                    ),
                                    this.sc_sceneSettings.getGridSettings(),
                                );
                            }

                            const isRangedAttacker =
                                this.currentActiveUnit.getAttackType() === AttackType.RANGE &&
                                !this.currentActiveUnit.hasAbilityActive("Handyman");

                            const paralysisAttackerEffect = this.currentActiveUnit.getEffect("Paralysis");
                            if (paralysisAttackerEffect) {
                                abilityMultiplier *= (100 - paralysisAttackerEffect.getPower()) / 100;
                            }

                            const deepWoundsEffect = hoverAttackUnit.getEffect("Deep Wounds");
                            if (
                                deepWoundsEffect &&
                                (this.currentActiveUnit.hasAbilityActive("Deep Wounds Level 1") ||
                                    this.currentActiveUnit.hasAbilityActive("Deep Wounds Level 2") ||
                                    this.currentActiveUnit.hasAbilityActive("Deep Wounds Level 3"))
                            ) {
                                abilityMultiplier *= 1 + deepWoundsEffect.getPower() / 100;
                            }

                            const minDmg =
                                this.currentActiveUnit.calculateAttackDamageMin(
                                    hoverAttackUnit,
                                    false,
                                    isRangedAttacker ? 2 : 1,
                                    abilityMultiplier,
                                ) + processPenetratingBiteAbility(this.currentActiveUnit, hoverAttackUnit);
                            let maxDmg =
                                this.currentActiveUnit.calculateAttackDamageMax(
                                    hoverAttackUnit,
                                    false,
                                    isRangedAttacker ? 2 : 1,
                                    abilityMultiplier,
                                ) + processPenetratingBiteAbility(this.currentActiveUnit, hoverAttackUnit);
                            const luckyStrikeAbility = this.currentActiveUnit.getAbility("Lucky Strike");
                            if (luckyStrikeAbility) {
                                maxDmg = Math.floor(
                                    maxDmg * this.currentActiveUnit.calculateAbilityMultiplier(luckyStrikeAbility),
                                );
                            }
                            const minDied = hoverAttackUnit.calculatePossibleLosses(minDmg);
                            const maxDied = hoverAttackUnit.calculatePossibleLosses(maxDmg);
                            this.sc_attackDamageSpreadStr = `${minDmg}-${maxDmg}`;
                            if (minDied !== maxDied) {
                                this.sc_attackKillSpreadStr = `${minDied}-${maxDied}`;
                            } else if (minDied) {
                                this.sc_attackKillSpreadStr = minDied.toString();
                            }
                            this.sc_hoverTextUpdateNeeded = true;

                            if (hoverAttackUnit.canMove()) {
                                this.hoverActivePath = this.pathHelper.getMovePath(
                                    unitCell,
                                    this.gridMatrix,
                                    hoverAttackUnit.getSteps(),
                                    this.grid.getAggrMatrixByTeam(
                                        hoverAttackUnit.getTeam() === TeamType.LOWER ? TeamType.UPPER : TeamType.LOWER,
                                    ),
                                    hoverAttackUnit.getCanFly(),
                                    hoverAttackUnit.isSmallSize(),
                                ).cells;
                            } else {
                                this.hoverActivePath = undefined;
                            }
                        }
                    } else {
                        this.hoverAttackUnits = undefined;
                        this.hoverAttackFrom = undefined;
                        this.hoverAttackIsSmallSize = undefined;
                        if (!this.hoverUnit) {
                            this.hoverActivePath = undefined;
                            return;
                        }
                        const unitCell = GridMath.getCellForPosition(
                            this.sc_sceneSettings.getGridSettings(),
                            this.hoverUnit.getPosition(),
                        );
                        if (!unitCell) {
                            this.hoverActivePath = undefined;
                            return;
                        }

                        if (this.hoverUnit.canMove()) {
                            this.hoverActivePath = this.pathHelper.getMovePath(
                                unitCell,
                                this.gridMatrix,
                                this.hoverUnit.getSteps(),
                                this.grid.getAggrMatrixByTeam(
                                    this.hoverUnit.getTeam() === TeamType.LOWER ? TeamType.UPPER : TeamType.LOWER,
                                ),
                                this.hoverUnit.getCanFly(),
                                this.hoverUnit.isSmallSize(),
                            ).cells;
                        } else {
                            this.hoverActivePath = undefined;
                        }
                    }
                } else if (this.currentActiveUnit.getAttackTypeSelection() === AttackType.RANGE) {
                    this.hoverAOECells = undefined;

                    if (!this.hoverUnit) {
                        this.hoverActivePath = undefined;
                        return;
                    }
                    const unitCell = GridMath.getCellForPosition(
                        this.sc_sceneSettings.getGridSettings(),
                        this.hoverUnit.getPosition(),
                    );

                    if (!unitCell) {
                        this.hoverActivePath = undefined;
                        return;
                    }

                    const previousHover = this.hoverActivePath;

                    this.hoverActivePath = this.pathHelper.getMovePath(
                        unitCell,
                        this.gridMatrix,
                        this.hoverUnit.getSteps(),
                        this.grid.getAggrMatrixByTeam(
                            this.hoverUnit.getTeam() === TeamType.LOWER ? TeamType.UPPER : TeamType.LOWER,
                        ),
                        this.hoverUnit.getCanFly(),
                        this.hoverUnit.isSmallSize(),
                    ).cells;

                    if (previousHover !== this.hoverActivePath) {
                        if (this.hoverRangeAttackLine) {
                            this.ground.DestroyFixture(this.hoverRangeAttackLine);
                            this.hoverRangeAttackLine = undefined;
                            this.hoverRangeAttackPosition = undefined;
                        }
                    }

                    if (!this.hoverRangeAttackLine && this.hoverUnit.getTeam() !== this.currentActiveUnit.getTeam()) {
                        const shape = new b2EdgeShape();

                        const isThroughShot = this.currentActiveUnit.hasAbilityActive("Through Shot");

                        this.hoverRangeAttackPosition = GridMath.getClosestSideCenter(
                            this.gridMatrix,
                            this.sc_sceneSettings.getGridSettings(),
                            this.sc_mouseWorld,
                            this.currentActiveUnit.getPosition(),
                            this.hoverUnit.getPosition(),
                            this.currentActiveUnit.isSmallSize(),
                            this.hoverUnit.isSmallSize(),
                            this.currentActiveUnit.getTeam(),
                            isThroughShot,
                        );

                        if (this.hoverRangeAttackPosition) {
                            const currentUnitPosition = this.currentActiveUnit.getPosition();
                            if (isThroughShot) {
                                this.hoverRangeAttackPosition = GridMath.projectLineToFieldEdge(
                                    this.sc_sceneSettings.getGridSettings(),
                                    currentUnitPosition.x,
                                    currentUnitPosition.y,
                                    this.hoverRangeAttackPosition.x,
                                    this.hoverRangeAttackPosition.y,
                                );
                            }

                            shape.SetTwoSided(currentUnitPosition, this.hoverRangeAttackPosition);
                            this.hoverRangeAttackLine = this.ground.CreateFixture({
                                shape,
                                isSensor: true,
                            });

                            const evaluatedRangeAttack = this.attackHandler.evaluateRangeAttack(
                                this.unitsHolder.getAllUnits(),
                                this.currentActiveUnit,
                                this.currentActiveUnit.getPosition(),
                                this.hoverRangeAttackPosition,
                            );
                            this.hoverRangeAttackDivisors = evaluatedRangeAttack.rangeAttackDivisors;
                            this.hoverAttackUnits = evaluatedRangeAttack.affectedUnits;
                            this.hoverRangeAttackObstacle = evaluatedRangeAttack.attackObstacle;

                            const hoverAttackUnit = this.getHoverAttackUnit();

                            if (
                                hoverAttackUnit &&
                                !(
                                    this.currentActiveUnit.hasDebuffActive("Cowardice") &&
                                    this.currentActiveUnit.getCumulativeHp() < hoverAttackUnit.getCumulativeHp()
                                )
                            ) {
                                // if we are attacking RANGE unit,
                                // it has to response back
                                this.initializePossibleRangeResponse(
                                    hoverAttackUnit,
                                    this.currentActiveUnit.getPosition(),
                                );
                                this.fillRangeAttackInfo(hoverAttackUnit);
                            } else {
                                this.hoverAttackUnits = undefined;
                            }
                        } else {
                            this.hoverAttackUnits = undefined;
                        }
                    }
                } else {
                    this.resetHover(false);
                }
            } else if (
                this.currentActiveUnit.hasAbilityActive("Area Throw") &&
                this.currentActiveUnit.getAttackTypeSelection() === AttackType.RANGE &&
                GridMath.isCellWithinGrid(this.sc_sceneSettings.getGridSettings(), mouseCell) &&
                !this.grid.getOccupantUnitId(mouseCell)
            ) {
                this.resetHover(false);

                const shape = new b2EdgeShape();

                const cellPosition = GridMath.getPositionForCell(
                    mouseCell,
                    this.sc_sceneSettings.getGridSettings().getMinX(),
                    this.sc_sceneSettings.getGridSettings().getStep(),
                    this.sc_sceneSettings.getGridSettings().getHalfStep(),
                );

                if (cellPosition) {
                    shape.SetTwoSided(this.currentActiveUnit.getPosition(), cellPosition);
                    this.hoverRangeAttackLine = this.ground.CreateFixture({
                        shape,
                        isSensor: true,
                    });

                    this.hoverRangeAttackPosition = cellPosition;

                    const evaluatedRangeAttack = this.attackHandler.evaluateRangeAttack(
                        this.unitsHolder.getAllUnits(),
                        this.currentActiveUnit,
                        this.currentActiveUnit.getPosition(),
                        this.hoverRangeAttackPosition,
                    );
                    this.hoverRangeAttackDivisors = evaluatedRangeAttack.rangeAttackDivisors;
                    this.hoverAttackUnits = evaluatedRangeAttack.affectedUnits;
                    this.hoverRangeAttackObstacle = evaluatedRangeAttack.attackObstacle;

                    const hoverAttackUnit = this.getHoverAttackUnit();
                    if (hoverAttackUnit) {
                        if (
                            !(
                                this.currentActiveUnit.hasDebuffActive("Cowardice") &&
                                this.currentActiveUnit.getCumulativeHp() < hoverAttackUnit.getCumulativeHp()
                            )
                        ) {
                            // if we are attacking RANGE unit,
                            // it has to response back
                            this.initializePossibleRangeResponse(hoverAttackUnit, this.currentActiveUnit.getPosition());
                            this.fillRangeAttackInfo(hoverAttackUnit);
                            this.sc_isSelection = true;
                        }
                    } else if (!this.hoverRangeAttackObstacle) {
                        this.hoverRangeAttackDivisors = [
                            this.attackHandler.getRangeAttackDivisor(this.currentActiveUnit, cellPosition),
                            this.attackHandler.getRangeAttackDivisor(this.currentActiveUnit, cellPosition),
                        ];
                        this.hoverAOECells = [
                            ...GridMath.getCellsAroundCell(this.sc_sceneSettings.getGridSettings(), mouseCell),
                            mouseCell,
                        ];
                        this.fillRangeAttackInfo(hoverAttackUnit);
                        this.sc_isSelection = true;

                        this.hoverAttackUnits = evaluateAffectedUnits(this.hoverAOECells, this.unitsHolder, this.grid);

                        this.rangeResponseUnits = undefined;
                        this.rangeResponseAttackDivisor = 1;
                    }
                }
            } else {
                this.resetHover(false);
                this.hoverUnit = undefined;

                const fightProperties = FightStateManager.getInstance().getFightProperties();
                const lowerTeamUnitsAlive = fightProperties.getTeamUnitsAlive(TeamType.UPPER);
                const upperTeamUnitsAlive = fightProperties.getTeamUnitsAlive(TeamType.LOWER);

                const moreThanOneUnitAlive =
                    (this.currentActiveUnit.getTeam() === TeamType.LOWER && lowerTeamUnitsAlive > 1) ||
                    (this.currentActiveUnit.getTeam() === TeamType.UPPER && upperTeamUnitsAlive > 1);
                if (
                    (GridMath.isCellWithinGrid(this.sc_sceneSettings.getGridSettings(), mouseCell) &&
                        this.currentActivePathHashes?.has((mouseCell.x << 4) | mouseCell.y)) ||
                    (!this.sc_isAIActive &&
                        ((this.spellBookButton.isHover(mouseCell) && this.currentActiveUnit.getSpellsCount()) ||
                            this.shieldButton.isHover(mouseCell) ||
                            this.nextButton.isHover(mouseCell) ||
                            (moreThanOneUnitAlive &&
                                this.hourGlassButton.isHover(mouseCell) &&
                                !fightProperties.hourGlassIncludes(this.currentActiveUnit.getId()) &&
                                !fightProperties.hasAlreadyHourGlass(this.currentActiveUnit.getId())) ||
                            (this.selectedAttackTypeButton.isHover(mouseCell) && this.switchToSelectedAttackType))) ||
                    this.aiButton.isHover(mouseCell)
                ) {
                    this.updateHoverInfoWithButtonAction(mouseCell);

                    if (
                        this.selectedAttackTypeButton.isHover(mouseCell) ||
                        this.shieldButton.isHover(mouseCell) ||
                        this.nextButton.isHover(mouseCell) ||
                        this.aiButton.isHover(mouseCell) ||
                        this.hourGlassButton.isHover(mouseCell)
                    ) {
                        this.hoverSelectedCells = [mouseCell];
                        this.hoverSelectedCellsSwitchToRed = false;
                        this.resetHover(false);
                        return;
                    }

                    if (
                        this.currentActiveSpell &&
                        SpellHelper.canCastSpell(
                            false,
                            this.sc_sceneSettings.getGridSettings(),
                            this.gridMatrix,
                            undefined,
                            this.currentActiveSpell,
                            this.currentActiveUnit.getSpells(),
                            undefined,
                            undefined,
                            this.currentActiveUnit.getId(),
                            undefined,
                            this.currentActiveUnit.getTeam(),
                            undefined,
                            this.currentActiveUnit.getName(),
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            this.currentActiveUnit.getStackPower(),
                            undefined,
                            mouseCell,
                        ) &&
                        GridMath.isCellWithinGrid(this.sc_sceneSettings.getGridSettings(), mouseCell)
                    ) {
                        this.hoverAttackFrom = mouseCell;
                        this.sc_moveBlocked = true;
                    } else if (this.currentActiveUnit.isSmallSize()) {
                        this.hoverSelectedCells = [mouseCell];
                        if (!this.hoverSelectedCells || this.grid.areAllCellsEmpty(this.hoverSelectedCells)) {
                            this.hoverSelectedCellsSwitchToRed = false;
                        } else {
                            this.hoverSelectedCellsSwitchToRed = true;
                        }
                        this.resetHover(false);
                    } else {
                        this.hoverSelectedCells = this.pathHelper.getClosestSquareCellIndices(
                            this.sc_mouseWorld,
                            this.allowedPlacementCellHashes,
                            this.cellToUnitPreRound ? Array.from(this.cellToUnitPreRound.keys()) : undefined,
                            GridMath.getCellsAroundPosition(
                                this.sc_sceneSettings.getGridSettings(),
                                this.currentActiveUnit.getPosition(),
                            ),
                            this.currentActivePathHashes,
                            this.currentActiveKnownPaths,
                        );
                        if (
                            this.hoverSelectedCells?.length === 4 &&
                            this.grid.areAllCellsEmpty(this.hoverSelectedCells) &&
                            this.currentActiveKnownPaths?.has((mouseCell.x << 4) | mouseCell.y)
                        ) {
                            this.hoverSelectedCellsSwitchToRed = false;
                        } else {
                            this.hoverSelectedCellsSwitchToRed = true;
                        }
                        this.resetHover(false);
                    }
                } else if (
                    SpellHelper.canCastSpell(
                        false,
                        this.sc_sceneSettings.getGridSettings(),
                        this.gridMatrix,
                        undefined,
                        this.currentActiveSpell,
                        this.currentActiveUnit.getSpells(),
                        undefined,
                        undefined,
                        this.currentActiveUnit.getId(),
                        undefined,
                        this.currentActiveUnit.getTeam(),
                        undefined,
                        this.currentActiveUnit.getName(),
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        this.currentActiveUnit.getStackPower(),
                        undefined,
                        mouseCell,
                    ) &&
                    GridMath.isCellWithinGrid(this.sc_sceneSettings.getGridSettings(), mouseCell)
                ) {
                    this.hoverAttackFrom = mouseCell;
                    this.sc_moveBlocked = true;
                } else {
                    this.resetHover();
                }
            }
        } else if (
            this.lowerPlacement.isAllowed(this.sc_mouseWorld) ||
            this.upperPlacement.isAllowed(this.sc_mouseWorld) ||
            this.isButtonHover(mouseCell) ||
            this.sc_selectedBody ||
            (mouseCell &&
                mouseCell.y >= 0 &&
                mouseCell.y < GRID_SIZE &&
                this.cellToUnitPreRound &&
                this.cellToUnitPreRound.has(`${mouseCell.x}:${mouseCell.y}`))
        ) {
            if (!mouseCell) {
                this.resetHover();
                return;
            }

            const cellKey = `${mouseCell.x}:${mouseCell.y}`;

            if (
                !this.sc_selectedBody &&
                !this.cellToUnitPreRound?.has(cellKey) &&
                (this.lowerPlacement.isAllowed(this.sc_mouseWorld) || this.upperPlacement.isAllowed(this.sc_mouseWorld))
            ) {
                this.resetHover();
                return;
            }

            if (this.isButtonHover(mouseCell)) {
                this.updateHoverInfoWithButtonAction(mouseCell);
                this.hoverSelectedCells = [mouseCell];
                this.hoverSelectedCellsSwitchToRed = false;
                this.resetHover(false);
                return;
            }

            const selectedUnitProperties = this.sc_selectedBody?.GetUserData();
            if (selectedUnitProperties) {
                const selectedUnit = this.unitsHolder.getAllUnits().get(selectedUnitProperties.id);
                if (!selectedUnit) {
                    this.resetHover(true);
                    return;
                }

                if (this.cellToUnitPreRound) {
                    const hoverUnit = this.cellToUnitPreRound.get(cellKey);
                    if (
                        hoverUnit &&
                        !GridMath.isPositionWithinGrid(this.sc_sceneSettings.getGridSettings(), hoverUnit.getPosition())
                    ) {
                        this.sc_hoverUnitNameStr = hoverUnit.getName();
                        this.sc_selectedAttackType = hoverUnit.getAttackType();
                        this.sc_hoverTextUpdateNeeded = true;
                    }
                }

                if (!this.isAllowedPreStartMousePosition(selectedUnit)) {
                    this.resetHover(true);
                    return;
                }

                if (selectedUnitProperties.size === 1) {
                    if (this.cellToUnitPreRound) {
                        const unit = this.cellToUnitPreRound.get(cellKey);
                        if (!unit) {
                            this.hoverSelectedCells = [mouseCell];
                            if (this.grid.areAllCellsEmpty(this.hoverSelectedCells)) {
                                this.hoverSelectedCellsSwitchToRed = false;
                            } else {
                                this.hoverSelectedCellsSwitchToRed = true;
                            }
                            this.resetHover(false);
                            return;
                        }

                        if (unit.getId() === selectedUnitProperties.id) {
                            this.resetHover();
                            return;
                        }

                        if (this.unitIdToCellsPreRound && !unit.isSmallSize()) {
                            this.hoverSelectedCells = this.unitIdToCellsPreRound.get(unit.getId());
                            this.hoverSelectedCellsSwitchToRed = false;
                            this.resetHover(false);
                            return;
                        }

                        this.hoverSelectedCells = [mouseCell];
                        this.hoverSelectedCellsSwitchToRed = false;
                    } else {
                        this.hoverSelectedCells = [mouseCell];
                        if (this.grid.areAllCellsEmpty(this.hoverSelectedCells)) {
                            this.hoverSelectedCellsSwitchToRed = false;
                        } else {
                            this.hoverSelectedCellsSwitchToRed = true;
                        }
                    }
                } else if (this.cellToUnitPreRound) {
                    const unit = this.cellToUnitPreRound.get(`${mouseCell.x}:${mouseCell.y}`);
                    if (!unit) {
                        this.hoverSelectedCells = this.pathHelper.getClosestSquareCellIndices(
                            this.sc_mouseWorld,
                            this.allowedPlacementCellHashes,
                            Array.from(this.cellToUnitPreRound.keys()),
                            this.unitIdToCellsPreRound?.get(selectedUnitProperties.id),
                        );
                        if (
                            this.hoverSelectedCells?.length === 4 &&
                            this.grid.areAllCellsEmpty(this.hoverSelectedCells)
                        ) {
                            this.hoverSelectedCellsSwitchToRed = false;
                        } else {
                            this.hoverSelectedCellsSwitchToRed = true;
                        }
                        this.resetHover(false);
                        return;
                    }

                    if (unit.getId() === selectedUnitProperties.id) {
                        this.resetHover();
                        return;
                    }

                    if (this.unitIdToCellsPreRound) {
                        if (unit.isSmallSize()) {
                            this.hoverSelectedCells = [mouseCell];
                            this.hoverSelectedCellsSwitchToRed = false;
                            this.resetHover(false);
                            return;
                        }
                        this.hoverSelectedCells = this.unitIdToCellsPreRound.get(unit.getId());
                        this.hoverSelectedCellsSwitchToRed = false;
                    } else {
                        this.hoverSelectedCells = this.pathHelper.getClosestSquareCellIndices(
                            this.sc_mouseWorld,
                            this.allowedPlacementCellHashes,
                            Array.from(this.cellToUnitPreRound.keys()),
                        );
                        if (
                            this.hoverSelectedCells?.length === 4 &&
                            this.grid.areAllCellsEmpty(this.hoverSelectedCells)
                        ) {
                            this.hoverSelectedCellsSwitchToRed = false;
                        } else {
                            this.hoverSelectedCellsSwitchToRed = true;
                        }
                    }
                } else {
                    this.hoverSelectedCells = this.pathHelper.getClosestSquareCellIndices(
                        this.sc_mouseWorld,
                        this.allowedPlacementCellHashes,
                    );
                    if (this.hoverSelectedCells?.length === 4 && this.grid.areAllCellsEmpty(this.hoverSelectedCells)) {
                        this.hoverSelectedCellsSwitchToRed = false;
                    } else {
                        this.hoverSelectedCellsSwitchToRed = true;
                    }
                }
                this.resetHover(false);
            } else if (this.cellToUnitPreRound && this.unitIdToCellsPreRound) {
                const unit = this.cellToUnitPreRound.get(cellKey);
                if (unit) {
                    if (!GridMath.isPositionWithinGrid(this.sc_sceneSettings.getGridSettings(), unit.getPosition())) {
                        this.sc_hoverUnitNameStr = unit.getName();
                        this.sc_selectedAttackType = unit.getAttackType();
                        this.sc_hoverTextUpdateNeeded = true;
                    }

                    this.hoverSelectedCells = this.unitIdToCellsPreRound.get(unit.getId());
                    this.hoverSelectedCellsSwitchToRed = false;
                } else {
                    this.hoverSelectedCells = [mouseCell];
                    if (this.hoverSelectedCells) {
                        if (this.grid.areAllCellsEmpty(this.hoverSelectedCells)) {
                            this.hoverSelectedCellsSwitchToRed = false;
                        } else {
                            this.hoverSelectedCellsSwitchToRed = true;
                        }
                    }
                }
            } else {
                this.hoverSelectedCells = [mouseCell];
                if (this.hoverSelectedCells) {
                    if (this.grid.areAllCellsEmpty(this.hoverSelectedCells)) {
                        this.hoverSelectedCellsSwitchToRed = false;
                    } else {
                        this.hoverSelectedCellsSwitchToRed = true;
                    }
                }
            }
            this.resetHover(false);
        } else {
            this.resetHover();
        }
    }

    private destroyPlacements(): void {
        const upperPlacementFixture = this.upperPlacement.getFixture();
        const lowerPlacementFixture = this.lowerPlacement.getFixture();
        if (upperPlacementFixture) {
            this.ground.DestroyFixture(upperPlacementFixture);
            this.upperPlacement.setDestroyed();
        }
        if (lowerPlacementFixture) {
            this.ground.DestroyFixture(lowerPlacementFixture);
            this.lowerPlacement.setDestroyed();
        }
        this.allowedPlacementCellHashes.clear();
    }

    public getViewportSize(): XY {
        return {
            x: g_camera.getWidth(),
            y: g_camera.getHeight(),
        };
    }

    protected isAllowedPreStartMousePosition(unit: Unit, checkUnitSize = false): boolean {
        if (!checkUnitSize || unit.isSmallSize()) {
            const isAllowed =
                (this.lowerPlacement.isAllowed(this.sc_mouseWorld) && unit.getTeam() === TeamType.LOWER) ||
                (this.upperPlacement.isAllowed(this.sc_mouseWorld) && unit.getTeam() === TeamType.UPPER);
            return (
                isAllowed ||
                (!isAllowed &&
                    this.sc_mouseWorld.x >= MAX_X &&
                    this.sc_mouseWorld.x < MAX_X + this.sc_sceneSettings.getGridSettings().getTwoSteps() &&
                    this.sc_mouseWorld.y < MAX_Y &&
                    this.sc_mouseWorld.y >= MIN_Y) ||
                (!isAllowed &&
                    this.sc_mouseWorld.x < MIN_X &&
                    this.sc_mouseWorld.x >= MIN_X - this.sc_sceneSettings.getGridSettings().getTwoSteps() &&
                    this.sc_mouseWorld.y >= STEP * PathHelper.Y_FACTION_ICONS_OFFSET &&
                    this.sc_mouseWorld.y < MAX_Y)
            );
        }
        return this.pathHelper.areCellsFormingSquare(true, this.hoverSelectedCells);
    }

    protected getPositionToDropTo(body?: b2Body): XY | undefined {
        if (!body) {
            return undefined;
        }

        const unitStats = body.GetUserData();
        if (!unitStats) {
            return undefined;
        }

        // game has started
        const mouseCell = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), this.sc_mouseWorld);
        if (
            FightStateManager.getInstance().getFightProperties().hasFightStarted() &&
            this.currentActiveUnit &&
            this.currentActiveUnit.getId() === unitStats.id &&
            mouseCell &&
            (this.currentActivePathHashes?.has((mouseCell.x << 4) | mouseCell.y) ||
                (this.currentActiveSpell &&
                    GridMath.isCellWithinGrid(this.sc_sceneSettings.getGridSettings(), mouseCell) &&
                    this.currentActiveSpell.getSpellTargetType() === SpellTargetType.FREE_CELL))
        ) {
            if (unitStats.size === 1 || this.currentActiveSpell) {
                if (this.grid.areAllCellsEmpty([mouseCell])) {
                    return GridMath.getPositionForCell(
                        mouseCell,
                        this.sc_sceneSettings.getGridSettings().getMinX(),
                        this.sc_sceneSettings.getGridSettings().getStep(),
                        this.sc_sceneSettings.getGridSettings().getHalfStep(),
                    );
                }

                return undefined;
            }

            if (
                !this.hoverSelectedCells ||
                !this.pathHelper.areCellsFormingSquare(false, this.hoverSelectedCells) ||
                !this.grid.areAllCellsEmpty(this.hoverSelectedCells, unitStats.id)
            ) {
                return undefined;
            }

            return GridMath.getPositionForCells(this.sc_sceneSettings.getGridSettings(), this.hoverSelectedCells);
        }

        const unit = this.unitsHolder.getAllUnits().get(unitStats.id);
        if (!unit) {
            return undefined;
        }

        // pre-start
        if (
            !FightStateManager.getInstance().getFightProperties().hasFightStarted() &&
            mouseCell &&
            this.isAllowedPreStartMousePosition(unit, true)
        ) {
            if (unit.isSmallSize()) {
                return GridMath.getPositionForCell(
                    mouseCell,
                    this.sc_sceneSettings.getGridSettings().getMinX(),
                    this.sc_sceneSettings.getGridSettings().getStep(),
                    this.sc_sceneSettings.getGridSettings().getHalfStep(),
                );
            }

            return GridMath.getPositionForCells(this.sc_sceneSettings.getGridSettings(), this.hoverSelectedCells);
        }

        return undefined;
    }

    protected handleMouseDownForSelectedBody(): void {
        if (!this.sc_selectedBody) {
            return;
        }

        this.sc_mouseDropStep = this.sc_stepCount;
        const positionToDropTo = this.getPositionToDropTo(this.sc_selectedBody);

        if (positionToDropTo && !this.sc_isAIActive) {
            let castStarted = false;
            let moveStarted = false;
            if (FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
                if (this.sc_moveBlocked) {
                    castStarted = this.cast();
                    moveStarted = true;
                } else {
                    const cellIndices = GridMath.getCellForPosition(
                        this.sc_sceneSettings.getGridSettings(),
                        positionToDropTo,
                    );
                    if (
                        cellIndices &&
                        this.currentActiveKnownPaths?.get((cellIndices.x << 4) | cellIndices.y)?.length
                    ) {
                        moveStarted = this.moveHandler.startMoving(
                            cellIndices,
                            this.drawer,
                            FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                            this.sc_selectedBody,
                            this.currentActiveKnownPaths,
                        );
                    }
                }
            } else {
                moveStarted = true;
                this.sc_selectedBody.SetTransformXY(
                    positionToDropTo.x,
                    positionToDropTo.y,
                    this.sc_selectedBody.GetAngle(),
                );
            }

            if (!this.sc_moveBlocked || castStarted) {
                if (moveStarted) {
                    if (!this.sc_sceneSettings.isDraggable()) {
                        this.sc_selectedBody.SetIsActive(false);
                    }
                    if (!this.sc_moveBlocked) {
                        this.finishDrop(positionToDropTo);
                    }
                    this.deselect(false, !FightStateManager.getInstance().getFightProperties().hasFightStarted());
                    this.sc_mouseJoint = null;
                }
            }
        } else {
            this.verifyButtonsTrigger();
        }
    }

    public refreshScene(): void {
        this.unitsHolder.refreshStackPowerForAllUnits();
    }

    protected landAttack(): boolean {
        if (!this.currentActiveSpell) {
            if (
                this.attackHandler.handleMeleeAttack(
                    this.unitsHolder,
                    this.drawer,
                    this.grid,
                    this.moveHandler,
                    this.sc_stepCount,
                    this.currentActiveKnownPaths,
                    this.currentActiveUnit,
                    this.getHoverAttackUnit(),
                    this.sc_selectedBody,
                    this.hoverAttackFrom,
                )
            ) {
                this.resetHover();
                this.sc_damageStatsUpdateNeeded = true;
                this.finishTurn();
                return true;
            }
        }

        if (
            this.attackHandler.handleRangeAttack(
                this.unitsHolder,
                this.drawer,
                this.grid,
                this.hoverRangeAttackDivisors,
                this.rangeResponseAttackDivisor,
                this.sc_stepCount,
                this.currentActiveUnit,
                this.hoverAttackUnits,
                this.rangeResponseUnits,
                this.hoverRangeAttackPosition,
                this.sc_isSelection,
            )
        ) {
            this.resetHover();
            this.sc_damageStatsUpdateNeeded = true;
            this.finishTurn();
            return true;
        }

        if (
            this.attackHandler.handleMagicAttack(
                this.gridMatrix,
                this.unitsHolder,
                this.grid,
                this.currentActiveSpell,
                this.currentActiveUnit,
                this.hoverUnit,
            )
        ) {
            this.resetHover();
            this.finishTurn();
            return true;
        }

        return false;
    }

    protected finishTurn = (isHourGlass = false): void => {
        if (!isHourGlass && this.currentActiveUnit) {
            this.currentActiveUnit.minusLap();
        }

        // cleanup range attack state
        this.hoverRangeAttackDivisors = [];
        if (this.hoverRangeAttackLine) {
            this.ground.DestroyFixture(this.hoverRangeAttackLine);
            this.hoverRangeAttackLine = undefined;
        }
        this.rangeResponseAttackDivisor = 1;
        this.rangeResponseUnits = undefined;

        // cleanup magic attack state
        this.hoveredSpell = undefined;
        console.log("RESET SPELL 2");
        this.currentActiveSpell = undefined;

        // handle units state
        this.hoverAttackUnits = undefined;
        this.hoverAttackFrom = undefined;
        this.hoverAttackIsSmallSize = undefined;
        if (this.sc_selectedBody) {
            this.sc_selectedBody.SetIsActive(false);
            this.sc_selectedBody = undefined;
        }
        if (!isHourGlass && this.currentActiveUnit) {
            FightStateManager.getInstance()
                .getFightProperties()
                .addAlreadyMadeTurn(this.currentActiveUnit.getTeam(), this.currentActiveUnit.getId());
            this.currentActiveUnit.setOnHourglass(false);
        }
        this.currentActiveUnit = undefined;
        this.sc_selectedAttackType = AttackType.NO_TYPE;

        // refresh UI
        this.sc_renderSpellBookOverlay = false;
        this.adjustSpellBookSprite();
        this.unitsHolder.refreshStackPowerForAllUnits();
    };

    protected verifyButtonsTrigger() {
        if (!this.sc_mouseWorld) {
            return;
        }

        const cell = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), this.sc_mouseWorld);
        if (!cell) {
            return;
        }

        if (this.aiButton.isHover(cell)) {
            this.sc_isAIActive = !this.sc_isAIActive;
            this.resetHover();
        } else if (this.spellBookButton.isHover(cell) && !this.sc_isAIActive) {
            if (this.currentActiveUnit?.getCanCastSpells()) {
                this.sc_renderSpellBookOverlay = !this.sc_renderSpellBookOverlay;
            } else {
                this.sc_renderSpellBookOverlay = false;
            }
            if (!this.sc_renderSpellBookOverlay) {
                this.hoveredSpell = undefined;
            }
        } else if (this.nextButton.isHover(cell) && !this.sc_renderSpellBookOverlay && !this.sc_isAIActive) {
            if (this.currentActiveUnit) {
                this.currentActiveUnit.decreaseMorale(HoCConstants.MORALE_CHANGE_FOR_SKIP);
                this.currentActiveUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                );
                this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} skip turn`);
            }
            this.finishTurn();
        } else if (this.shieldButton.isHover(cell) && !this.sc_renderSpellBookOverlay && !this.sc_isAIActive) {
            if (this.currentActiveUnit) {
                this.currentActiveUnit.cleanupLuckPerTurn();
                this.currentActiveUnit.decreaseMorale(HoCConstants.MORALE_CHANGE_FOR_SHIELD_OR_CLOCK);
                this.currentActiveUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                );
                this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} shield turn`);
            }
            this.finishTurn();
        } else if (
            !FightStateManager.getInstance().getFightProperties().hasFightStarted() &&
            this.lifeButton.isHover(cell)
        ) {
            this.deselectRaceButtons();
            this.lifeButton.setIsSelected(true);
            this.destroyNonPlacedUnits();
            this.sc_selectedFactionName = FactionType.LIFE;
            this.sc_factionNameUpdateNeeded = true;
            this.spawnUnits();
            this.resetHover();
            this.sc_selectedBody = undefined;
            this.sc_currentActiveShotRange = undefined;
            this.sc_currentActiveAuraRanges = [];
        } else if (
            !FightStateManager.getInstance().getFightProperties().hasFightStarted() &&
            this.natureButton.isHover(cell)
        ) {
            this.deselectRaceButtons();
            this.natureButton.setIsSelected(true);
            this.destroyNonPlacedUnits();
            this.sc_selectedFactionName = FactionType.NATURE;
            this.sc_factionNameUpdateNeeded = true;
            this.spawnUnits();
            this.resetHover();
            this.sc_selectedBody = undefined;
            this.sc_currentActiveShotRange = undefined;
            this.sc_currentActiveAuraRanges = [];
            // } else if (!this.m_started && this.orderButton.isHover(cell)) {
            //     this.deselectRaceButtons();
            //     this.orderButton.setIsSelected(true);
            //     this.destroyNonPlacedUnits();
            //     this.m_selectedRaceName = "Order";
            //     this.m_race_name_update_needed = true;
            //     this.spawnUnits();
            //     this.resetHover();
            //     this.m_selectedBody = undefined;
            //     this.sc_currentActiveShotRange = undefined;
            //     this.sc_currentActiveAuraRanges = [];
        } else if (
            !FightStateManager.getInstance().getFightProperties().hasFightStarted() &&
            this.mightButton.isHover(cell)
        ) {
            this.deselectRaceButtons();
            this.mightButton.setIsSelected(true);
            this.destroyNonPlacedUnits();
            this.sc_selectedFactionName = FactionType.MIGHT;
            this.sc_factionNameUpdateNeeded = true;
            this.spawnUnits();
            this.resetHover();
            this.sc_selectedBody = undefined;
            this.sc_currentActiveShotRange = undefined;
            this.sc_currentActiveAuraRanges = [];
        } else if (
            !FightStateManager.getInstance().getFightProperties().hasFightStarted() &&
            this.chaosButton.isHover(cell)
        ) {
            this.deselectRaceButtons();
            this.chaosButton.setIsSelected(true);
            this.destroyNonPlacedUnits();
            this.sc_selectedFactionName = FactionType.CHAOS;
            this.sc_factionNameUpdateNeeded = true;
            this.spawnUnits();
            this.resetHover();
            this.sc_selectedBody = undefined;
            this.sc_currentActiveShotRange = undefined;
            this.sc_currentActiveAuraRanges = [];
            // } else if (!this.m_started && this.deathButton.isHover(cell)) {
            //     this.deselectRaceButtons();
            //     this.deathButton.setIsSelected(true);
            //     this.destroyNonPlacedUnits();
            //     this.m_selectedRaceName = FactionType.DEATH;
            //     this.m_race_name_update_needed = true;
            //     this.spawnUnits();
            //     this.resetHover();
            //     this.m_selectedBody = undefined;
        } else if (this.currentActiveUnit && !this.sc_renderSpellBookOverlay && !this.sc_isAIActive) {
            const fightState = FightStateManager.getInstance().getFightProperties();

            const lowerTeamUnitsAlive = fightState.getTeamUnitsAlive(TeamType.UPPER);
            const upperTeamUnitsAlive = fightState.getTeamUnitsAlive(TeamType.LOWER);

            const moreThanOneUnitAlive =
                (this.currentActiveUnit.getTeam() === TeamType.LOWER && lowerTeamUnitsAlive > 1) ||
                (this.currentActiveUnit.getTeam() === TeamType.UPPER && upperTeamUnitsAlive > 1);
            if (
                moreThanOneUnitAlive &&
                this.hourGlassButton.isHover(cell) &&
                !fightState.hourGlassIncludes(this.currentActiveUnit.getId()) &&
                !fightState.hasAlreadyHourGlass(this.currentActiveUnit.getId())
            ) {
                this.currentActiveUnit.decreaseMorale(HoCConstants.MORALE_CHANGE_FOR_SHIELD_OR_CLOCK);
                this.currentActiveUnit.setOnHourglass(true);
                FightStateManager.getInstance().getFightProperties().enqueueHourGlass(this.currentActiveUnit.getId());
                this.currentActiveUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                );
                this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} clock turn`);
                this.finishTurn(true); // hourglass finish
            } else if (
                this.selectedAttackTypeButton.isHover(cell) &&
                (this.currentActiveUnit.getAttackType() === AttackType.RANGE ||
                    this.currentActiveUnit.getAttackType() === AttackType.MAGIC)
            ) {
                const currentUnitCell = GridMath.getCellForPosition(
                    this.sc_sceneSettings.getGridSettings(),
                    this.currentActiveUnit.getPosition(),
                );
                if (
                    this.currentActiveUnit.getAttackTypeSelection() === AttackType.RANGE ||
                    this.currentActiveUnit.getAttackTypeSelection() === AttackType.MAGIC
                ) {
                    console.log("SELECT 1 or 2");
                    this.selectAttack(
                        this.currentActiveUnit.getAttackType() === AttackType.RANGE
                            ? AttackType.RANGE
                            : AttackType.MAGIC,
                        currentUnitCell,
                        true,
                    );
                    this.sc_unitPropertiesUpdateNeeded = true;
                } else {
                    console.log("SELECT 0");
                    this.selectAttack(AttackType.MELEE, currentUnitCell, true);
                    this.sc_unitPropertiesUpdateNeeded = true;
                }
                this.currentActiveUnitSwitchedAttackAuto = true;
            }
        } else if (this.hoveredSpell) {
            console.log("this.hoveredSpell");
            console.log(this.hoveredSpell);
            if (
                this.hoveredSpell.getSpellTargetType() === SpellTargetType.RANDOM_CLOSE_TO_CASTER ||
                this.hoveredSpell.getSpellTargetType() === SpellTargetType.ALL_ALLIES ||
                this.hoveredSpell.getSpellTargetType() === SpellTargetType.ALL_ENEMIES
            ) {
                if (this.currentActiveUnit) {
                    const randomCell = GridMath.getRandomCellAroundPosition(
                        this.sc_sceneSettings.getGridSettings(),
                        this.gridMatrix,
                        this.currentActiveUnit.getTeam(),
                        this.currentActiveUnit.getPosition(),
                    );

                    if (SpellHelper.canCastSummon(this.hoveredSpell, this.gridMatrix, randomCell)) {
                        const amountToSummon = this.currentActiveUnit.getAmountAlive() * this.hoveredSpell.getPower();

                        const possibleUnit = this.unitsHolder.getSummonedUnitByName(
                            this.currentActiveUnit.getTeam(),
                            this.hoveredSpell.getSummonUnitName(),
                        );

                        if (possibleUnit) {
                            possibleUnit.increaseAmountAlive(amountToSummon);
                        } else {
                            const unitToSummon = this.unitsFactory.makeCreature(
                                this.hoveredSpell.getSummonUnitRace(),
                                this.hoveredSpell.getSummonUnitName(),
                                this.currentActiveUnit.getTeam(),
                                amountToSummon,
                            );
                            if (
                                randomCell &&
                                this.unitsHolder.spawnSelected(
                                    this.grid,
                                    unitToSummon.getAllProperties(),
                                    randomCell,
                                    true,
                                )
                            ) {
                                this.unitsHolder.refreshStackPowerForAllUnits();
                            }
                        }

                        if (this.currentActiveUnit) {
                            this.sc_sceneLog.updateLog(
                                `${this.currentActiveUnit.getName()} summoned ${amountToSummon} x ${this.hoveredSpell.getSummonUnitName()}`,
                            );
                        }

                        this.currentActiveUnit.useSpell(this.hoveredSpell.getName());
                        this.finishTurn();
                    } else if (
                        SpellHelper.canMassCastSpell(
                            this.hoveredSpell,
                            this.unitsHolder.getAllTeamUnitsBuffs(this.currentActiveUnit.getTeam()),
                            this.unitsHolder.getAllEnemyUnitsDebuffs(this.currentActiveUnit.getTeam()),
                            this.unitsHolder.getAllTeamUnitsMagicResist(this.currentActiveUnit.getTeam()),
                            this.unitsHolder.getAllEnemyUnitsMagicResist(this.currentActiveUnit.getTeam()),
                            this.unitsHolder.getAllTeamUnitsHp(this.currentActiveUnit.getTeam()),
                            this.unitsHolder.getAllTeamUnitsMaxHp(this.currentActiveUnit.getTeam()),
                        )
                    ) {
                        if (this.hoveredSpell.getSpellTargetType() === SpellTargetType.ALL_ALLIES) {
                            const isHeal = this.hoveredSpell.getPowerType() === SpellPowerType.HEAL;
                            if (!isHeal) {
                                this.sc_sceneLog.updateLog(
                                    `${this.currentActiveUnit.getName()} cast ${this.hoveredSpell.getName()} on allies`,
                                );
                            }

                            for (const u of this.unitsHolder.getAllAllies(this.currentActiveUnit.getTeam())) {
                                if (u.getMagicResist() === 100) {
                                    continue;
                                }

                                if (isHeal) {
                                    const healPower = u.applyHeal(
                                        Math.floor(
                                            this.hoveredSpell.getPower() * this.currentActiveUnit.getAmountAlive(),
                                        ),
                                    );
                                    u.applyHeal(healPower);
                                    if (healPower) {
                                        this.sc_sceneLog.updateLog(
                                            `${this.currentActiveUnit.getName()} mass healed ${u.getName()} for ${healPower} hp`,
                                        );
                                    }
                                } else {
                                    if (!hasAlreadyAppliedSpell(u, this.hoveredSpell)) {
                                        u.applyBuff(
                                            this.hoveredSpell,
                                            undefined,
                                            undefined,
                                            u.getId() === this.currentActiveUnit.getId(),
                                        );
                                    }
                                }
                            }
                        } else {
                            this.sc_sceneLog.updateLog(
                                `${this.currentActiveUnit.getName()} cast ${this.hoveredSpell.getName()} on enemies`,
                            );

                            for (const u of this.unitsHolder.getAllEnemyUnits(this.currentActiveUnit.getTeam())) {
                                let debuffTarget = u;

                                // effect can be absorbed
                                const absorptionTarget = getAbsorptionTarget(u, this.grid, this.unitsHolder);
                                if (absorptionTarget) {
                                    debuffTarget = absorptionTarget;
                                }

                                if (debuffTarget.getMagicResist() === 100) {
                                    continue;
                                }

                                if (HoCLib.getRandomInt(0, 100) < Math.floor(debuffTarget.getMagicResist())) {
                                    this.sc_sceneLog.updateLog(
                                        `${debuffTarget.getName()} resisted from ${this.hoveredSpell.getName()}`,
                                    );
                                    continue;
                                }

                                if (!hasAlreadyAppliedSpell(debuffTarget, this.hoveredSpell)) {
                                    const laps = this.hoveredSpell.getLapsTotal();
                                    debuffTarget.applyDebuff(
                                        this.hoveredSpell,
                                        undefined,
                                        undefined,
                                        debuffTarget.getId() === this.currentActiveUnit.getId(),
                                    );
                                    if (
                                        isMirrored(debuffTarget) &&
                                        !hasAlreadyAppliedSpell(this.currentActiveUnit, this.hoveredSpell)
                                    ) {
                                        this.currentActiveUnit.applyDebuff(
                                            this.hoveredSpell,
                                            undefined,
                                            undefined,
                                            true,
                                        );
                                        this.sc_sceneLog.updateLog(
                                            `${debuffTarget.getName()} mirrored ${this.hoveredSpell.getName()} to ${this.currentActiveUnit.getName()} for ${getLapString(
                                                laps,
                                            )}`,
                                        );
                                    }
                                }
                            }
                        }

                        this.currentActiveUnit.useSpell(this.hoveredSpell.getName());
                        this.unitsHolder.refreshStackPowerForAllUnits();
                        this.finishTurn();
                    } else {
                        console.log("RESET SPELL 3");
                        this.currentActiveSpell = undefined;
                    }
                }
            } else {
                console.log("SET SPELL");
                this.currentActiveSpell = this.hoveredSpell;
                if (
                    this.currentActiveUnit &&
                    this.currentActiveUnit.getAttackTypeSelection() !== AttackType.MAGIC &&
                    this.currentActiveSpell
                ) {
                    this.selectAttack(AttackType.MAGIC, this.currentActiveUnit.getBaseCell(), true);
                    this.currentActiveUnitSwitchedAttackAuto = true;
                    this.switchToSelectedAttackType = undefined;
                    console.log("Switch to MAGIC");
                    console.log("this.currentActiveSpell");
                    console.log(this.currentActiveSpell);
                }
            }
            this.adjustSpellBookSprite();
            this.sc_renderSpellBookOverlay = false;
            this.hoveredSpell = undefined;
        }
    }

    protected adjustSpellBookSprite(): void {
        if (this.currentActiveSpell) {
            this.spellBookButton.switchSprites(
                this.currentActiveSpell.getSprite(),
                this.currentActiveSpell.getSprite(),
                false,
            );
        } else {
            this.spellBookButton.switchSprites(this.spellBookWhiteSprite, this.spellBookBlackSprite, false);
        }
    }

    protected cleanActivePaths(): void {
        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.currentActivePathHashes = undefined;
    }

    protected finishFight(): void {
        this.canAttackByMeleeTargets = undefined;
        FightStateManager.getInstance().getFightProperties().finishFight();
        this.cleanActivePaths();
        this.sc_sceneLog.updateLog(`Fight finished!`);
        this.refreshVisibleStateIfNeeded();
        if (this.sc_visibleState) {
            this.sc_visibleState.hasFinished = true;
            this.sc_visibleStateUpdateNeeded = true;
        }
    }

    protected finishDrop(positionToDropTo: XY) {
        if (this.sc_selectedBody) {
            if (this.currentActiveUnit) {
                if (!this.currentActivePath) {
                    this.currentActiveUnit = undefined;
                    this.sc_selectedAttackType = AttackType.NO_TYPE;
                    return;
                }

                let refreshUnitPosition = false;

                if (this.currentActiveUnit.isSmallSize()) {
                    const cell = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), positionToDropTo);
                    if (cell && this.grid.areAllCellsEmpty([cell], this.currentActiveUnit.getId())) {
                        refreshUnitPosition = this.grid.occupyCell(
                            cell,
                            this.currentActiveUnit.getId(),
                            this.currentActiveUnit.getTeam(),
                            this.currentActiveUnit.getAttackRange(),
                        );
                    }
                } else {
                    const cells = GridMath.getCellsAroundPosition(
                        this.sc_sceneSettings.getGridSettings(),
                        positionToDropTo,
                    );
                    if (this.grid.areAllCellsEmpty(cells, this.currentActiveUnit.getId())) {
                        refreshUnitPosition = this.grid.occupyCells(
                            cells,
                            this.currentActiveUnit.getId(),
                            this.currentActiveUnit.getTeam(),
                            this.currentActiveUnit.getAttackRange(),
                        );
                    }
                }

                if (refreshUnitPosition) {
                    this.currentActiveUnit.setPosition(
                        this.sc_selectedBody.GetPosition().x,
                        this.sc_selectedBody.GetPosition().y,
                    );
                }

                this.finishTurn();
            } else if (
                GridMath.isPositionWithinGrid(
                    this.sc_sceneSettings.getGridSettings(),
                    this.sc_selectedBody.GetPosition(),
                )
            ) {
                const unitStats = this.sc_selectedBody.GetUserData();
                if (unitStats) {
                    let refreshUnitPosition = false;

                    if (unitStats.size === 1) {
                        const cell = GridMath.getCellForPosition(
                            this.sc_sceneSettings.getGridSettings(),
                            this.sc_selectedBody.GetPosition(),
                        );
                        if (cell) {
                            refreshUnitPosition = this.grid.occupyCell(
                                cell,
                                unitStats.id,
                                unitStats.team,
                                unitStats.attack_range,
                            );
                        }
                    } else {
                        refreshUnitPosition = this.grid.occupyCells(
                            GridMath.getCellsAroundPosition(
                                this.sc_sceneSettings.getGridSettings(),
                                this.sc_selectedBody.GetPosition(),
                            ),
                            unitStats.id,
                            unitStats.team,
                            unitStats.attack_range,
                        );
                    }
                    const unit = this.unitsHolder.getAllUnits().get(unitStats.id);
                    if (unit && refreshUnitPosition) {
                        unit.setPosition(this.sc_selectedBody.GetPosition().x, this.sc_selectedBody.GetPosition().y);
                    }
                }
            } else {
                const unitStats = this.sc_selectedBody.GetUserData();
                if (unitStats) {
                    this.grid.cleanupAll(unitStats.id, unitStats.attack_range, unitStats.size === 1);
                    const unit = this.unitsHolder.getAllUnits().get(unitStats.id);
                    if (unit) {
                        unit.setPosition(this.sc_selectedBody.GetPosition().x, this.sc_selectedBody.GetPosition().y);
                    }
                }
            }
            this.unitsHolder.refreshStackPowerForAllUnits();
        } else {
            this.finishFight();
        }

        this.currentActiveUnit = undefined;
        this.sc_selectedAttackType = AttackType.NO_TYPE;
    }

    private refreshVisibleStateIfNeeded() {
        if (!this.sc_visibleState) {
            this.sc_visibleState = {
                canBeStarted: false,
                hasFinished: false,
                secondsRemaining: -1,
                secondsMax: Number.MAX_SAFE_INTEGER,
                teamTypeTurn: undefined,
                hasAdditionalTime: false,
                lapNumber: 0,
                numberOfLapsTillNarrowing: FightStateManager.getInstance()
                    .getFightProperties()
                    .getNumberOfLapsTillNarrowing(),
                numberOfLapsTillStopNarrowing: HoCConstants.NUMBER_OF_LAPS_TILL_STOP_NARROWING,
                canRequestAdditionalTime: !!FightStateManager.getInstance()
                    .getFightProperties()
                    .requestAdditionalTurnTime(undefined, true),
                upNext: [],
            };
            this.sc_visibleStateUpdateNeeded = true;
        }
    }

    private selectAttack(selectedAttackType: AttackType, currentUnitCell?: XY, force = false): boolean {
        // console.log(`SELECT ATTACK ${selectedAttackType}`);
        if (!this.currentActiveUnit || !currentUnitCell) {
            return false;
        }

        let hasOption = true;
        const isRange = this.currentActiveUnit.getAttackType() === AttackType.RANGE;
        const isMagic = this.currentActiveUnit.getAttackType() === AttackType.MAGIC;

        if (currentUnitCell && (isRange || isMagic)) {
            if (
                isRange &&
                (this.attackHandler.canBeAttackedByMelee(
                    this.currentActiveUnit.getPosition(),
                    this.currentActiveUnit.isSmallSize(),
                    this.grid.getEnemyAggrMatrixByUnitId(this.currentActiveUnit.getId()),
                ) ||
                    this.currentActiveUnit.getRangeShots() <= 0 ||
                    this.currentActiveUnit.hasDebuffActive("Range Null Field Aura") ||
                    this.currentActiveUnit.hasDebuffActive("Rangebane"))
            ) {
                hasOption = false;
                if (this.currentActiveUnit.selectAttackType(AttackType.MELEE)) {
                    this.selectedAttackTypeButton.switchSprites(
                        new Sprite(this.gl, this.shader, this.textures.range_white_128.texture),
                        new Sprite(this.gl, this.shader, this.textures.range_black_128.texture),
                    );
                    console.log("RESET SPELL 4");
                    this.currentActiveSpell = undefined;
                    this.adjustSpellBookSprite();
                }
                this.sc_selectedAttackType = this.currentActiveUnit.getAttackTypeSelection();
            } else if (isMagic && !this.currentActiveUnit.getCanCastSpells()) {
                hasOption = false;
            } else if (
                this.currentActiveUnit.getAttackTypeSelection() === AttackType.RANGE ||
                this.currentActiveUnit.getAttackTypeSelection() === AttackType.MAGIC
            ) {
                this.selectedAttackTypeButton.switchSprites(
                    new Sprite(this.gl, this.shader, this.textures.melee_white_128.texture),
                    new Sprite(this.gl, this.shader, this.textures.melee_black_128.texture),
                );
            } else if (this.currentActiveUnit.getAttackType() === AttackType.RANGE) {
                this.selectedAttackTypeButton.switchSprites(
                    new Sprite(this.gl, this.shader, this.textures.range_white_128.texture),
                    new Sprite(this.gl, this.shader, this.textures.range_black_128.texture),
                );
            } else {
                this.selectedAttackTypeButton.switchSprites(
                    new Sprite(this.gl, this.shader, this.textures.magic_white_128.texture),
                    new Sprite(this.gl, this.shader, this.textures.magic_black_128.texture),
                );
            }
        }

        if (
            hasOption &&
            (this.currentActiveUnit.getAttackType() === AttackType.RANGE ||
                this.currentActiveUnit.getAttackType() === AttackType.MAGIC)
        ) {
            if (this.switchToSelectedAttackType) {
                if (force) {
                    this.currentActiveUnit.selectAttackType(this.switchToSelectedAttackType);
                    if (this.switchToSelectedAttackType !== AttackType.MAGIC) {
                        console.log("RESET SPELL 1");
                        this.currentActiveSpell = undefined;
                        this.adjustSpellBookSprite();
                    }
                    if (this.currentActiveUnit.getAttackTypeSelection() === AttackType.RANGE) {
                        this.sc_currentActiveShotRange = {
                            xy: this.currentActiveUnit.getPosition(),
                            distance: this.currentActiveUnit.getRangeShotDistance() * STEP,
                        };
                    } else {
                        this.sc_currentActiveShotRange = undefined;
                    }
                    if (this.switchToSelectedAttackType === AttackType.MELEE) {
                        if (this.currentActiveUnit.getAttackType() === AttackType.RANGE) {
                            this.selectedAttackTypeButton.switchSprites(
                                new Sprite(this.gl, this.shader, this.textures.range_white_128.texture),
                                new Sprite(this.gl, this.shader, this.textures.range_black_128.texture),
                            );
                        } else {
                            this.selectedAttackTypeButton.switchSprites(
                                new Sprite(this.gl, this.shader, this.textures.magic_white_128.texture),
                                new Sprite(this.gl, this.shader, this.textures.magic_black_128.texture),
                            );
                        }
                    } else if (
                        this.switchToSelectedAttackType === AttackType.RANGE ||
                        this.switchToSelectedAttackType === AttackType.MAGIC
                    ) {
                        this.selectedAttackTypeButton.switchSprites(
                            new Sprite(this.gl, this.shader, this.textures.melee_white_128.texture),
                            new Sprite(this.gl, this.shader, this.textures.melee_black_128.texture),
                        );
                    }
                    this.switchToSelectedAttackType = undefined;
                }
            } else {
                this.switchToSelectedAttackType = selectedAttackType;
            }

            if (this.currentActiveUnit.hasAbilityActive("Area Throw")) {
                if (this.currentActiveUnit.getAttackTypeSelection() === AttackType.MELEE) {
                    const currentCell = GridMath.getCellForPosition(
                        this.sc_sceneSettings.getGridSettings(),
                        this.currentActiveUnit.getPosition(),
                    );
                    if (currentCell) {
                        this.updateCurrentMovePath(currentCell);
                    }
                } else if (this.currentActiveUnit.getAttackTypeSelection() === AttackType.RANGE) {
                    this.cleanActivePaths();
                }
            }

            this.sc_selectedAttackType = this.currentActiveUnit.getAttackTypeSelection();
            return true;
        }
        return false;
    }

    protected cast(): boolean {
        if (
            this.currentActiveSpell &&
            this.currentActiveSpell.getSpellTargetType() === SpellTargetType.FREE_CELL &&
            this.currentActiveUnit
        ) {
            const mouseCell = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), this.sc_mouseWorld);
            if (GridMath.isCellWithinGrid(this.sc_sceneSettings.getGridSettings(), mouseCell)) {
                this.finishTurn();
                return true;
            }
        }
        return false;
    }

    protected getAvailableCells(cellsToPickFrom: XY[]): XY[] {
        const cells: XY[] = [];
        const occupiedCells: string[] = [];
        if (this.currentActiveUnit && !this.unitIdToCellsPreRound) {
            if (!this.currentActiveUnit.isSmallSize()) {
                const cellsAroundPosition = GridMath.getCellsAroundPosition(
                    this.sc_sceneSettings.getGridSettings(),
                    this.currentActiveUnit.getPosition(),
                );
                for (const cellAroundPosition of cellsAroundPosition) {
                    occupiedCells.push(`${cellAroundPosition.x}:${cellAroundPosition.y}`);
                }
            }
        }

        for (const c of cellsToPickFrom) {
            const cellKey = `${c.x}:${c.y}`;
            if (
                (!this.unitIdToCellsPreRound && occupiedCells.includes(cellKey)) ||
                (this.unitIdToCellsPreRound && !this.unitIdToCellsPreRound.has(cellKey)) ||
                !this.grid.getOccupantUnitId(c)
            ) {
                cells.push(c);
            }
        }

        return cells;
    }

    private fillActiveAuraRanges(
        isSmallUnit: boolean,
        position: XY,
        auraRanges: number[] = [],
        auraIsBuff: boolean[] = [],
        forHover: boolean = false,
    ): void {
        let auraMapRanges: IAuraOnMap[];
        if (forHover) {
            this.hoverActiveAuraRanges = [];
            auraMapRanges = this.hoverActiveAuraRanges;
        } else {
            this.sc_currentActiveAuraRanges = [];
            auraMapRanges = this.sc_currentActiveAuraRanges;
        }

        if (auraRanges.length === auraIsBuff.length) {
            for (let i = 0; i < auraRanges.length; i++) {
                auraMapRanges.push({
                    xy: position,
                    range: auraRanges[i] * STEP,
                    isBuff: auraIsBuff[i],
                    isSmallUnit: isSmallUnit,
                });
            }
        }
    }

    protected selectUnitPreStart(
        isSmallUnit: boolean,
        position: XY,
        rangeShotDistance = 0,
        auraRanges: number[] = [],
        auraIsBuff: boolean[] = [],
    ): void {
        if (rangeShotDistance > 0) {
            this.sc_currentActiveShotRange = {
                xy: position,
                distance: rangeShotDistance * STEP,
            };
        } else {
            this.sc_currentActiveShotRange = undefined;
        }
        this.fillActiveAuraRanges(isSmallUnit, position, auraRanges, auraIsBuff);
    }

    protected updateCurrentMovePath(currentCell: XY): void {
        if (!this.currentActiveUnit) {
            return;
        }

        if (this.currentActiveUnit.canMove()) {
            const movePath = this.pathHelper.getMovePath(
                currentCell,
                this.gridMatrix,
                this.currentActiveUnit.getSteps(),
                this.grid.getAggrMatrixByTeam(
                    this.currentActiveUnit.getTeam() === TeamType.LOWER ? TeamType.UPPER : TeamType.LOWER,
                ),
                this.currentActiveUnit.getCanFly(),
                this.currentActiveUnit.isSmallSize(),
            );
            this.currentActivePath = movePath.cells;
            this.currentActiveKnownPaths = movePath.knownPaths;
            this.currentActivePathHashes = movePath.hashes;
        } else {
            this.cleanActivePaths();
        }
    }

    public Step(settings: Settings, timeStep: number): number {
        this.sc_isAnimating = this.drawer.isAnimating();
        super.Step(settings, timeStep);
        this.background.setRect(
            this.sc_sceneSettings.getGridSettings().getMinX(),
            this.sc_sceneSettings.getGridSettings().getMinY(),
            this.sc_sceneSettings.getGridSettings().getMaxY(),
            this.sc_sceneSettings.getGridSettings().getMaxY(),
        );
        const isLightMode = localStorage.getItem("joy-mode") === "light";
        this.background.render();
        this.drawer.renderTerrainSpritesBack(isLightMode);
        this.drawer.renderHole();

        this.drawer.animate(this.sc_fps, this.sc_stepCount);
        if (!this.sc_isAnimating) {
            if (this.hoverActiveShotRange) {
                settings.m_debugDraw.DrawCircle(
                    this.hoverActiveShotRange.xy,
                    this.hoverActiveShotRange.distance,
                    isLightMode ? Drawer.COLOR_ORANGE : Drawer.COLOR_YELLOW,
                );
            }

            const drawActiveShotRange =
                !this.currentActiveUnit ||
                (this.currentActiveUnit && this.currentActiveUnit.getAttackTypeSelection() === AttackType.RANGE);
            if (drawActiveShotRange && this.sc_currentActiveShotRange) {
                settings.m_debugDraw.DrawCircle(
                    this.sc_currentActiveShotRange.xy,
                    this.sc_currentActiveShotRange.distance,
                    isLightMode ? Drawer.COLOR_ORANGE : Drawer.COLOR_YELLOW,
                );
            }

            const units: Unit[] = [];
            const bodies: Map<string, b2Body> = new Map();
            const positions: Map<string, XY> = new Map();
            const fightProperties = FightStateManager.getInstance().getFightProperties();

            let unitsUpper: Unit[] | undefined = [];
            let unitsLower: Unit[] | undefined = [];
            let allUnitsMadeTurn = true;

            if (FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
                if (HoCLib.getTimeMillis() >= fightProperties.getCurrentTurnEnd()) {
                    if (this.currentActiveUnit) {
                        this.currentActiveUnit.decreaseMorale(HoCConstants.MORALE_CHANGE_FOR_SKIP);
                        this.currentActiveUnit.applyMoraleStepsModifier(fightProperties.getStepsMoraleMultiplier());
                        this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} skip turn`);
                    }
                    this.finishTurn();
                }
                if (this.cellToUnitPreRound) {
                    this.cellToUnitPreRound = undefined;
                }
                if (this.unitIdToCellsPreRound) {
                    this.unitIdToCellsPreRound = undefined;
                }
            } else {
                this.cellToUnitPreRound = new Map();
                this.unitIdToCellsPreRound = new Map();
            }

            this.moveHandler.clearLargeUnitsCache();

            for (let b = this.sc_world.GetBodyList(); b; b = b.GetNext()) {
                const bodyPosition = b.GetPosition();
                if (this.sc_renderSpellBookOverlay) {
                    b.SetEnabled(false);
                } else {
                    b.SetEnabled(true);
                }

                if (FightStateManager.getInstance().getFightProperties().hasFightStarted() && !this.currentActiveUnit) {
                    b.SetIsActive(false);
                    this.deselect();
                }

                if (b.GetType() === b2BodyType.b2_dynamicBody) {
                    const unitStats = b.GetUserData();
                    const isSmallUnit = unitStats.size === 1;

                    if (!unitStats) {
                        continue;
                    }

                    // fit into cells
                    b.SetLinearVelocity(NO_VELOCITY);
                    // this is needed to keep all the objects within the grid during placement calculation
                    if (this.sc_calculatingPlacement) {
                        b.SetTransformXY(
                            isSmallUnit
                                ? Math.floor(Math.round(bodyPosition.x) / STEP) * STEP + HALF_STEP
                                : Math.floor(Math.round(bodyPosition.x) / STEP) * STEP,
                            isSmallUnit
                                ? Math.floor(Math.round(bodyPosition.y) / STEP) * STEP + HALF_STEP
                                : Math.floor(Math.round(bodyPosition.y) / STEP) * STEP,
                            b.GetAngle(),
                        );
                        const unitId = unitStats.id;
                        if (unitId) {
                            this.unitsHolder.getAllUnits().get(unitId)?.setPosition(bodyPosition.x, bodyPosition.y);
                        }
                    }

                    const unit = this.unitsHolder.getUnitByStats(unitStats as UnitProperties);
                    if (!unit) {
                        continue;
                    }

                    this.moveHandler.updateLargeUnitsCache(bodyPosition);

                    if (FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
                        if (unit) {
                            if (unitStats.team === TeamType.UPPER) {
                                if (this.upperPlacement.isAllowed(bodyPosition) || fightProperties.getFirstTurnMade()) {
                                    units.push(unit);
                                    bodies.set(unit.getId(), b);
                                    positions.set(unit.getId(), b.GetPosition());
                                    unitsUpper.push(unit);
                                    let occupiedCells = false;

                                    if (!this.placementsCleanedUp) {
                                        if (unitStats.size === 1) {
                                            const cell = GridMath.getCellForPosition(
                                                this.sc_sceneSettings.getGridSettings(),
                                                b.GetPosition(),
                                            );
                                            if (cell) {
                                                if (this.grid.areAllCellsEmpty([cell])) {
                                                    occupiedCells = this.grid.occupyCell(
                                                        cell,
                                                        unitStats.id,
                                                        unitStats.team,
                                                        unitStats.attack_range,
                                                    );
                                                }
                                            }
                                        } else {
                                            const cells = GridMath.getCellsAroundPosition(
                                                this.sc_sceneSettings.getGridSettings(),
                                                b.GetPosition(),
                                            );
                                            if (this.grid.areAllCellsEmpty(cells)) {
                                                occupiedCells = this.grid.occupyCells(
                                                    GridMath.getCellsAroundPosition(
                                                        this.sc_sceneSettings.getGridSettings(),
                                                        b.GetPosition(),
                                                    ),
                                                    unitStats.id,
                                                    unitStats.team,
                                                    unitStats.attack_range,
                                                );
                                            }
                                        }

                                        if (occupiedCells) {
                                            unit.setPosition(bodyPosition.x, bodyPosition.y);
                                        }
                                        // unit.randomizeLuckPerTurn();
                                        unit.setResponded(false);
                                        unit.setOnHourglass(false);
                                        unit.applyMoraleStepsModifier(
                                            FightStateManager.getInstance()
                                                .getFightProperties()
                                                .getStepsMoraleMultiplier(),
                                        );
                                    }

                                    if (allUnitsMadeTurn && !fightProperties.hasAlreadyMadeTurn(unit.getId())) {
                                        allUnitsMadeTurn = false;
                                    }
                                } else {
                                    this.unitsHolder.deleteUnitIfNotAllowed(
                                        this.grid,
                                        TeamType.LOWER,
                                        this.lowerPlacement,
                                        this.upperPlacement,
                                        b,
                                    );
                                }
                            } else if (
                                this.lowerPlacement.isAllowed(bodyPosition) ||
                                fightProperties.getFirstTurnMade()
                            ) {
                                units.push(unit);
                                bodies.set(unit.getId(), b);
                                positions.set(unit.getId(), b.GetPosition());
                                unitsLower.push(unit);
                                let occupiedCells = false;

                                if (!this.placementsCleanedUp) {
                                    if (unitStats.size === 1) {
                                        const cell = GridMath.getCellForPosition(
                                            this.sc_sceneSettings.getGridSettings(),
                                            b.GetPosition(),
                                        );
                                        if (cell) {
                                            if (this.grid.areAllCellsEmpty([cell])) {
                                                occupiedCells = this.grid.occupyCell(
                                                    cell,
                                                    unitStats.id,
                                                    unitStats.team,
                                                    unitStats.attack_range,
                                                );
                                            }
                                        }
                                    } else {
                                        const cells = GridMath.getCellsAroundPosition(
                                            this.sc_sceneSettings.getGridSettings(),
                                            b.GetPosition(),
                                        );

                                        if (this.grid.areAllCellsEmpty(cells)) {
                                            occupiedCells = this.grid.occupyCells(
                                                GridMath.getCellsAroundPosition(
                                                    this.sc_sceneSettings.getGridSettings(),
                                                    b.GetPosition(),
                                                ),
                                                unitStats.id,
                                                unitStats.team,
                                                unitStats.attack_range,
                                            );
                                        }
                                    }

                                    if (occupiedCells) {
                                        unit.setPosition(bodyPosition.x, bodyPosition.y);
                                    }
                                    // unit.randomizeLuckPerTurn();
                                    unit.setResponded(false);
                                    unit.setOnHourglass(false);
                                    unit.applyMoraleStepsModifier(
                                        FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                                    );
                                }

                                if (allUnitsMadeTurn && !fightProperties.hasAlreadyMadeTurn(unit.getId())) {
                                    allUnitsMadeTurn = false;
                                }
                            } else {
                                this.unitsHolder.deleteUnitIfNotAllowed(
                                    this.grid,
                                    TeamType.UPPER,
                                    this.lowerPlacement,
                                    this.upperPlacement,
                                    b,
                                );
                            }
                        }
                    } else if (this.cellToUnitPreRound && this.unitIdToCellsPreRound) {
                        if (!unit) {
                            continue;
                        }
                        const cells: XY[] = [];

                        if (isSmallUnit) {
                            const cell = GridMath.getCellForPosition(
                                this.sc_sceneSettings.getGridSettings(),
                                bodyPosition,
                            );
                            if (cell) {
                                this.cellToUnitPreRound.set(`${cell.x}:${cell.y}`, unit);
                                cells.push(cell);
                            }
                        } else {
                            const cellOne = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), {
                                x: bodyPosition.x + HALF_STEP,
                                y: bodyPosition.y + HALF_STEP,
                            });
                            if (cellOne) {
                                this.cellToUnitPreRound.set(`${cellOne.x}:${cellOne.y}`, unit);
                                cells.push(cellOne);
                            }
                            const cellTwo = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), {
                                x: bodyPosition.x - HALF_STEP,
                                y: bodyPosition.y - HALF_STEP,
                            });
                            if (cellTwo) {
                                this.cellToUnitPreRound.set(`${cellTwo.x}:${cellTwo.y}`, unit);
                                cells.push(cellTwo);
                            }
                            const cellThree = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), {
                                x: bodyPosition.x + HALF_STEP,
                                y: bodyPosition.y - HALF_STEP,
                            });
                            if (cellThree) {
                                this.cellToUnitPreRound.set(`${cellThree.x}:${cellThree.y}`, unit);
                                cells.push(cellThree);
                            }
                            const cellFour = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), {
                                x: bodyPosition.x - HALF_STEP,
                                y: bodyPosition.y + HALF_STEP,
                            });
                            if (cellFour) {
                                this.cellToUnitPreRound.set(`${cellFour.x}:${cellFour.y}`, unit);
                                cells.push(cellFour);
                            }
                        }

                        this.unitIdToCellsPreRound.set(unit.getId(), cells);
                    }
                }
            }

            let turnFlipped =
                fightProperties.getCurrentLap() === 1 &&
                !FightStateManager.getInstance().getFightProperties().getAlreadyMadeTurnSize() &&
                !FightStateManager.getInstance().getFightProperties().getHourGlassQueueSize();

            let fightFinished = fightProperties.getFightFinished();

            if (
                FightStateManager.getInstance().getFightProperties().hasFightStarted() &&
                allUnitsMadeTurn &&
                !fightFinished
            ) {
                for (const u of units) {
                    // u.randomizeLuckPerTurn();
                    u.setResponded(false);
                    u.setOnHourglass(false);
                    u.applyMoraleStepsModifier(
                        FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                    );
                }
                FightStateManager.getInstance().getFightProperties().flipLap();
                if (FightStateManager.getInstance().getFightProperties().isNarrowingLap()) {
                    // can generate logs on destroy events
                    this.sc_sceneLog.updateLog(this.spawnObstacles());
                    FightStateManager.getInstance().getFightProperties().increaseStepsMoraleMultiplier();

                    // spawn may actually delete units due to overlap with obstacles
                    // so we have to refresh all the units here
                    const unitsForAllTeams = this.unitsHolder.refreshUnitsForAllTeams();
                    unitsLower = unitsForAllTeams[TeamType.LOWER - 1];
                    unitsUpper = unitsForAllTeams[TeamType.UPPER - 1];
                    this.unitsHolder.refreshStackPowerForAllUnits();
                    if (unitsLower) {
                        for (const ul of unitsLower) {
                            ul.applyMoraleStepsModifier(
                                FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                            );
                        }
                    }

                    if (unitsUpper) {
                        for (const uu of unitsUpper) {
                            uu.applyMoraleStepsModifier(
                                FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                            );
                        }
                    }
                }
                turnFlipped = true;
            }

            if (FightStateManager.getInstance().getFightProperties().hasFightStarted() && !fightFinished) {
                if (!this.currentActiveUnit) {
                    if (!unitsLower?.length || !unitsUpper?.length) {
                        this.finishFight();
                        fightFinished = true;
                        this.sc_isAIActive = false;
                    }

                    if (!fightFinished) {
                        HoCLib.shuffle(unitsUpper);
                        HoCLib.shuffle(unitsLower);
                        units.sort((a: Unit, b: Unit) => {
                            if (a.getSpeed() > b.getSpeed()) {
                                return -1;
                            } else if (b.getSpeed() > a.getSpeed()) {
                                return 1;
                            }
                            return 0;
                        });
                        unitsUpper.sort((a: Unit, b: Unit) => {
                            if (a.getSpeed() > b.getSpeed()) {
                                return -1;
                            } else if (b.getSpeed() > a.getSpeed()) {
                                return 1;
                            }
                            return 0;
                        });
                        unitsLower.sort((a: Unit, b: Unit) => {
                            if (a.getSpeed() > b.getSpeed()) {
                                return -1;
                            } else if (b.getSpeed() > a.getSpeed()) {
                                return 1;
                            }
                            return 0;
                        });

                        FightStateManager.getInstance()
                            .getFightProperties()
                            .setTeamUnitsAlive(TeamType.UPPER, unitsUpper.length);
                        FightStateManager.getInstance()
                            .getFightProperties()
                            .setTeamUnitsAlive(TeamType.LOWER, unitsLower.length);

                        if (turnFlipped) {
                            for (const u of units) {
                                if (!u.getMorale()) {
                                    continue;
                                }

                                let isPlusMorale = false;
                                if (u.getMorale() > 0) {
                                    isPlusMorale = true;
                                }

                                const chance = HoCLib.getRandomInt(0, 100);
                                if (chance < Math.abs(u.getMorale())) {
                                    if (isPlusMorale) {
                                        const buff = new Spell({
                                            spellProperties: HoCConfig.getSpellConfig(FactionType.NO_TYPE, "Morale"),
                                            amount: 1,
                                        });
                                        u.applyBuff(buff);
                                        FightStateManager.getInstance()
                                            .getFightProperties()
                                            .enqueueMoralePlus(u.getId());
                                    } else {
                                        const debuff = new Spell({
                                            spellProperties: HoCConfig.getSpellConfig(FactionType.NO_TYPE, "Dismorale"),
                                            amount: 1,
                                        });
                                        u.applyDebuff(debuff);
                                        FightStateManager.getInstance()
                                            .getFightProperties()
                                            .enqueueMoraleMinus(u.getId());
                                    }
                                }
                            }
                        }

                        FightStateManager.getInstance().prefetchNextUnitsToTurn(
                            this.unitsHolder.getAllUnits(),
                            unitsUpper,
                            unitsLower,
                        );

                        const nextUnitId = FightStateManager.getInstance().getFightProperties().dequeueNextUnitId();
                        const nextUnit = nextUnitId ? this.unitsHolder.getAllUnits().get(nextUnitId) : undefined;

                        if (nextUnit) {
                            console.log(nextUnit.getAbilities());
                            const unitsNext: IVisibleUnit[] = [];
                            for (const unitIdNext of FightStateManager.getInstance()
                                .getFightProperties()
                                .getUpNextQueueIterable()) {
                                const unitNext = this.unitsHolder.getAllUnits().get(unitIdNext);
                                if (unitNext) {
                                    unitsNext.unshift({
                                        amount: unitNext.getAmountAlive(),
                                        smallTextureName: unitNext.getSmallTextureName(),
                                        teamType: unitNext.getTeam(),
                                    });
                                }
                            }
                            if (nextUnit) {
                                unitsNext.push({
                                    amount: nextUnit.getAmountAlive(),
                                    smallTextureName: nextUnit.getSmallTextureName(),
                                    teamType: nextUnit.getTeam(),
                                });
                            }

                            if (this.sc_visibleState) {
                                this.sc_visibleState.upNext = unitsNext;
                            }

                            if (nextUnit.isSkippingThisTurn()) {
                                this.currentActiveUnit = nextUnit;
                                this.sc_selectedAttackType = this.currentActiveUnit.getAttackTypeSelection();
                                this.currentActiveUnit.decreaseMorale(HoCConstants.MORALE_CHANGE_FOR_SKIP);
                                this.currentActiveUnit.applyMoraleStepsModifier(
                                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                                );
                                this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} skip turn`);
                                this.finishTurn();
                            } else {
                                this.sc_moveBlocked = false;
                                this.unitsHolder.refreshAuraEffectsForAllUnits();
                                this.unitsHolder.refreshStackPowerForAllUnits();
                                // need to call it twice to make sure aura effects are applied
                                this.unitsHolder.refreshAuraEffectsForAllUnits();
                                this.unitsHolder.refreshStackPowerForAllUnits();

                                this.gridMatrix = this.grid.getMatrix();
                                this.refreshVisibleStateIfNeeded();
                                if (this.sc_visibleState) {
                                    this.sc_visibleState.teamTypeTurn = nextUnit.getTeam();
                                    this.sc_visibleState.lapNumber = fightProperties.getCurrentLap();
                                    this.sc_visibleState.canRequestAdditionalTime = !!FightStateManager.getInstance()
                                        .getFightProperties()
                                        .requestAdditionalTurnTime(this.sc_visibleState.teamTypeTurn, true);
                                    FightStateManager.getInstance().getFightProperties().startTurn(nextUnit.getTeam());
                                    this.visibleStateUpdate();
                                }

                                this.switchToSelectedAttackType = undefined;
                                const unitBody = bodies.get(nextUnit.getId());
                                if (!unitBody) {
                                    this.canAttackByMeleeTargets = undefined;
                                    this.cleanActivePaths();
                                } else {
                                    unitBody.SetIsActive(true);
                                    this.setSelectedUnitProperties(unitBody.GetUserData());
                                    nextUnit.refreshPreTurnState(this.sc_sceneLog);
                                    this.sc_hoverTextUpdateNeeded = true;
                                    this.sc_selectedBody = unitBody;
                                    this.currentActiveUnit = nextUnit;
                                    this.sc_selectedAttackType = this.currentActiveUnit.getAttackTypeSelection();
                                    this.currentActiveSpell = undefined;
                                    this.adjustSpellBookSprite();
                                    this.currentActiveUnitSwitchedAttackAuto = false;
                                    this.grid.print(nextUnit.getId());
                                    const currentCell = GridMath.getCellForPosition(
                                        this.sc_sceneSettings.getGridSettings(),
                                        unitBody.GetPosition(),
                                    );
                                    if (currentCell) {
                                        this.updateCurrentMovePath(currentCell);
                                        const enemyTeam =
                                            this.currentActiveUnit.getTeam() === TeamType.LOWER
                                                ? unitsUpper
                                                : unitsLower;
                                        if (
                                            (this.currentActivePath && this.currentActiveKnownPaths) ||
                                            !this.currentActiveUnit.canMove()
                                        ) {
                                            this.canAttackByMeleeTargets = this.currentActiveUnit.attackMeleeAllowed(
                                                enemyTeam,
                                                positions,
                                                this.unitsHolder.allEnemiesAroundUnit(
                                                    this.currentActiveUnit,
                                                    false,
                                                    this.grid,
                                                    this.hoverAttackFrom,
                                                ),
                                                this.currentActivePath,
                                                this.currentActiveKnownPaths,
                                            );
                                        } else {
                                            this.canAttackByMeleeTargets = undefined;
                                        }
                                    } else {
                                        this.canAttackByMeleeTargets = undefined;
                                    }
                                    if (nextUnit.getAttackTypeSelection() === AttackType.RANGE) {
                                        this.sc_currentActiveShotRange = {
                                            xy: nextUnit.getPosition(),
                                            distance: nextUnit.getRangeShotDistance() * STEP,
                                        };
                                    } else {
                                        this.sc_currentActiveShotRange = undefined;
                                    }
                                    this.fillActiveAuraRanges(
                                        nextUnit.isSmallSize(),
                                        nextUnit.getPosition(),
                                        nextUnit.getAllProperties().aura_ranges,
                                        nextUnit.getAllProperties().aura_is_buff,
                                    );
                                    FightStateManager.getInstance().getFightProperties().markFirstTurn();
                                }
                            }
                        } else {
                            this.finishFight();
                        }
                    }
                }

                // AI section
                if (
                    this.currentActiveUnit &&
                    (this.sc_isAIActive || this.currentActiveUnit?.hasAbilityActive("AI Driven")) &&
                    !this.performingAIAction
                ) {
                    this.performingAIAction = true;
                    const wasAIActive = this.sc_isAIActive;
                    this.sc_isAIActive = true;
                    setTimeout(() => {
                        this.performAIAction(wasAIActive);
                    }, 750);
                }
            }

            if (this.sc_calculatingPlacement) {
                this.sc_calculatingPlacement = false;
            }
        }

        let lowerAllowed = false;
        let upperAllowed = false;
        if (!this.sc_renderSpellBookOverlay) {
            for (const u of this.unitsHolder.getAllUnitsIterator()) {
                u.render(this.sc_fps, this.sc_stepCount, isLightMode, this.sc_isAnimating);
                if (!upperAllowed && this.upperPlacement.isAllowed(u.getPosition())) {
                    upperAllowed = true;
                }
                if (!lowerAllowed && this.lowerPlacement.isAllowed(u.getPosition())) {
                    lowerAllowed = true;
                }
            }
        }

        if (lowerAllowed && upperAllowed) {
            this.refreshVisibleStateIfNeeded();
            if (this.sc_visibleState) {
                if (!this.sc_visibleState.canBeStarted) {
                    this.sc_visibleState.canBeStarted = true;
                    this.sc_visibleStateUpdateNeeded = true;
                }
            }
        } else {
            this.refreshVisibleStateIfNeeded();
            if (this.sc_visibleState) {
                if (this.sc_visibleState.canBeStarted) {
                    this.sc_visibleState.canBeStarted = false;
                    this.sc_visibleStateUpdateNeeded = true;
                }
            }
        }

        if (!FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
            this.sc_isAIActive = false;
            this.lowerPlacement.draw(settings.m_debugDraw);
            this.upperPlacement.draw(settings.m_debugDraw);
        } else {
            this.placementsCleanedUp = true;
        }

        const themeLightColor = isLightMode ? Drawer.COLOR_LIGHT_ORANGE : Drawer.COLOR_LIGHT_YELLOW;
        const themeMainColor = isLightMode ? Drawer.COLOR_GREY : Drawer.COLOR_LIGHT_GREY;

        const isEnemy =
            this.hoverUnit && this.currentActiveUnit && this.hoverUnit.getTeam() !== this.currentActiveUnit.getTeam();

        if (this.currentActivePath && this.currentActiveUnit) {
            let hoverAttackFromHashes: Set<number> | undefined;
            if (this.hoverAttackFrom) {
                hoverAttackFromHashes = new Set();
                hoverAttackFromHashes.add((this.hoverAttackFrom.x << 4) | this.hoverAttackFrom.y);
                if (!this.currentActiveUnit.isSmallSize()) {
                    hoverAttackFromHashes.add(((this.hoverAttackFrom.x - 1) << 4) | this.hoverAttackFrom.y);
                    hoverAttackFromHashes.add(((this.hoverAttackFrom.x - 1) << 4) | (this.hoverAttackFrom.y - 1));
                    hoverAttackFromHashes.add((this.hoverAttackFrom.x << 4) | (this.hoverAttackFrom.y - 1));
                }
            }

            const currentUnitCellPositions: XY[] = [];
            if (this.currentActiveUnit.isSmallSize()) {
                currentUnitCellPositions.push(this.currentActiveUnit.getPosition());
            } else {
                currentUnitCellPositions.push({
                    x: this.currentActiveUnit.getPosition().x + HALF_STEP,
                    y: this.currentActiveUnit.getPosition().y + HALF_STEP,
                });
                currentUnitCellPositions.push({
                    x: this.currentActiveUnit.getPosition().x + HALF_STEP,
                    y: this.currentActiveUnit.getPosition().y - HALF_STEP,
                });
                currentUnitCellPositions.push({
                    x: this.currentActiveUnit.getPosition().x - HALF_STEP,
                    y: this.currentActiveUnit.getPosition().y - HALF_STEP,
                });
                currentUnitCellPositions.push({
                    x: this.currentActiveUnit.getPosition().x - HALF_STEP,
                    y: this.currentActiveUnit.getPosition().y + HALF_STEP,
                });
            }
            if (!this.sc_isAnimating && !this.sc_renderSpellBookOverlay) {
                this.drawer.drawPath(
                    settings.m_debugDraw,
                    themeMainColor,
                    this.currentActivePath,
                    currentUnitCellPositions,
                    hoverAttackFromHashes,
                );
            }
        }

        if (this.hoverUnit && !this.sc_isAnimating) {
            const hoverUnitCellPositions: XY[] = [];
            if (this.hoverUnit.isSmallSize()) {
                hoverUnitCellPositions.push(this.hoverUnit.getPosition());
            } else {
                hoverUnitCellPositions.push({
                    x: this.hoverUnit.getPosition().x + HALF_STEP,
                    y: this.hoverUnit.getPosition().y + HALF_STEP,
                });
                hoverUnitCellPositions.push({
                    x: this.hoverUnit.getPosition().x + HALF_STEP,
                    y: this.hoverUnit.getPosition().y - HALF_STEP,
                });
                hoverUnitCellPositions.push({
                    x: this.hoverUnit.getPosition().x - HALF_STEP,
                    y: this.hoverUnit.getPosition().y - HALF_STEP,
                });
                hoverUnitCellPositions.push({
                    x: this.hoverUnit.getPosition().x - HALF_STEP,
                    y: this.hoverUnit.getPosition().y + HALF_STEP,
                });
            }

            if (!this.sc_renderSpellBookOverlay) {
                this.drawer.drawPath(
                    settings.m_debugDraw,
                    isEnemy ? themeLightColor : themeMainColor,
                    this.hoverActivePath,
                    hoverUnitCellPositions,
                );
            }
        }

        if (this.sc_currentActiveAuraRanges.length) {
            for (const aura of this.sc_currentActiveAuraRanges) {
                const isBuff = aura.isBuff ?? true;
                if (aura.range) {
                    this.drawer.drawAuraArea(settings.m_debugDraw, aura.xy, aura.range, isBuff, aura.isSmallUnit);
                }
            }
        }
        if (this.hoverActiveAuraRanges.length) {
            for (const aura of this.hoverActiveAuraRanges) {
                const isBuff = aura.isBuff ?? true;
                if (aura.range) {
                    this.drawer.drawAuraArea(settings.m_debugDraw, aura.xy, aura.range, isBuff, aura.isSmallUnit);
                }
            }
        }

        const hoverAttackUnit = this.getHoverAttackUnit();

        if (this.sc_renderSpellBookOverlay) {
            if (this.hoveredSpell) {
                this.drawer.drawHoverArea(settings.m_debugDraw, isLightMode, this.hoveredSpell.getOnPagePosition());
            }
        } else if (hoverAttackUnit && this.currentActiveUnit?.hasAbilityActive("Fire Breath")) {
            const targetPos = GridMath.getCellForPosition(
                this.sc_sceneSettings.getGridSettings(),
                hoverAttackUnit.getPosition(),
            );
            if (targetPos) {
                const targetList = nextStandingTargets(
                    this.currentActiveUnit,
                    hoverAttackUnit,
                    targetPos,
                    this.grid,
                    this.unitsHolder,
                    this.hoverAttackFrom,
                );
                targetList.push(hoverAttackUnit);
                for (const target of targetList) {
                    if (
                        hoverAttackUnit.getId() === target.getId() ||
                        (target.getMagicResist() < 100 && !target.hasAbilityActive("Fire Element"))
                    ) {
                        this.drawer.drawAttackTo(settings.m_debugDraw, target.getPosition(), target.getSize());
                    }
                }
            }
        } else if (this.hoverAttackUnits && this.currentActiveUnit?.hasAbilityActive("Through Shot")) {
            for (const unitList of this.hoverAttackUnits) {
                for (const u of unitList) {
                    this.drawer.drawAttackTo(settings.m_debugDraw, u.getPosition(), u.getSize());
                }
            }
        } else if (this.hoverAttackUnits && this.currentActiveUnit?.hasAbilityActive("Lightning Spin")) {
            for (const enemy of this.unitsHolder.allEnemiesAroundUnit(
                this.currentActiveUnit,
                true,
                this.grid,
                this.hoverAttackFrom,
            )) {
                this.drawer.drawAttackTo(settings.m_debugDraw, enemy.getPosition(), enemy.getSize());
            }
        } else if (this.hoverAOECells?.length) {
            const positionsToDraw: XY[] = [];
            const cellKeys: number[] = [];

            for (const c of this.hoverAOECells) {
                const cellPosition = GridMath.getPositionForCell(
                    c,
                    this.sc_sceneSettings.getGridSettings().getMinX(),
                    this.sc_sceneSettings.getGridSettings().getStep(),
                    this.sc_sceneSettings.getGridSettings().getHalfStep(),
                );

                if (!cellPosition) {
                    continue;
                }

                const cellKey = (c.x << 4) | c.y;
                if (cellKeys.includes(cellKey)) {
                    continue;
                }

                const occupantId = this.grid.getOccupantUnitId(c);

                if (occupantId) {
                    const occupantUnit = this.unitsHolder.getAllUnits().get(occupantId);
                    if (!occupantUnit) {
                        continue;
                    }

                    for (const oc of occupantUnit.getCells()) {
                        const occupantCellPosition = GridMath.getPositionForCell(
                            oc,
                            this.sc_sceneSettings.getGridSettings().getMinX(),
                            this.sc_sceneSettings.getGridSettings().getStep(),
                            this.sc_sceneSettings.getGridSettings().getHalfStep(),
                        );
                        const occupantCellKey = (oc.x << 4) | oc.y;

                        if (occupantCellPosition && !cellKeys.includes(occupantCellKey)) {
                            positionsToDraw.push(occupantCellPosition);
                            cellKeys.push(occupantCellKey);
                        }
                    }

                    continue;
                }

                positionsToDraw.push(cellPosition);
                cellKeys.push(cellKey);
            }

            for (const p of positionsToDraw) {
                this.drawer.drawAttackTo(settings.m_debugDraw, p, 1);
            }
        } else if (this.hoverAttackUnits?.length) {
            const units = this.hoverAttackUnits[0];
            for (const u of units) {
                this.drawer.drawAttackTo(settings.m_debugDraw, u.getPosition(), u.getSize());
            }
        } else if (this.hoverRangeAttackObstacle) {
            this.drawer.drawAttackTo(
                settings.m_debugDraw,
                this.hoverRangeAttackObstacle.position,
                this.hoverRangeAttackObstacle.size,
            );
        }

        if (
            !this.sc_renderSpellBookOverlay ||
            this.spellBookButton.isHover(
                GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), this.sc_mouseWorld),
            )
        ) {
            if (this.hoverSelectedCellsSwitchToRed && this.hoverSelectedCells) {
                this.hoverSelectedCells = this.getAvailableCells(this.hoverSelectedCells);
            }
            this.drawer.drawHoverCells(
                settings.m_debugDraw,
                isLightMode,
                this.hoverSelectedCells,
                this.hoverSelectedCellsSwitchToRed,
            );
        }

        if (this.hoverAttackFrom && !this.sc_renderSpellBookOverlay) {
            this.drawer.drawAttackFrom(
                settings.m_debugDraw,
                GridMath.getPositionForCell(
                    this.hoverAttackFrom,
                    this.sc_sceneSettings.getGridSettings().getMinX(),
                    this.sc_sceneSettings.getGridSettings().getStep(),
                    this.sc_sceneSettings.getGridSettings().getHalfStep(),
                ),
                this.hoverAttackIsSmallSize !== undefined
                    ? this.hoverAttackIsSmallSize
                    : !!this.currentActiveUnit?.isSmallSize(),
            );
        }
        if (
            FightStateManager.getInstance().getFightProperties().hasFightStarted() &&
            this.currentActiveUnit &&
            this.currentActiveUnit.getAttackType() !== AttackType.MELEE
            // && this.currentActiveUnit.getAttackType() !== AttackType.RANGE
        ) {
            const currentUnitCell = GridMath.getCellForPosition(
                this.sc_sceneSettings.getGridSettings(),
                this.currentActiveUnit.getPosition(),
            );

            let toSelectAttackType = AttackType.MELEE;
            // if (this.currentActiveSpell) {
            //     toSelectAttackType = AttackType.MAGIC;
            // } else
            if (this.currentActiveUnit.getAttackTypeSelection() === AttackType.MELEE) {
                if (this.currentActiveUnit.getAttackType() === AttackType.MAGIC) {
                    toSelectAttackType = AttackType.MAGIC;
                } else if (this.currentActiveUnit.getAttackType() === AttackType.RANGE) {
                    toSelectAttackType = AttackType.RANGE;
                }
            }

            if (
                !this.sc_renderSpellBookOverlay &&
                this.selectAttack(toSelectAttackType, currentUnitCell) &&
                !this.currentActiveUnit.hasAbilityActive("No Melee")
            ) {
                this.selectedAttackTypeButton.render(settings.m_debugDraw, isLightMode, 0.8);
            }
        }

        if (FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
            if (this.currentActiveUnit?.getCanCastSpells()) {
                this.spellBookButton.render(settings.m_debugDraw, isLightMode);
            }

            if (this.sc_renderSpellBookOverlay) {
                this.spellBookOverlay.setRect(
                    this.sc_sceneSettings.getGridSettings().getMinX(),
                    this.sc_sceneSettings.getGridSettings().getMinY(),
                    this.sc_sceneSettings.getGridSettings().getMaxY(),
                    this.sc_sceneSettings.getGridSettings().getMaxY(),
                );
                this.spellBookOverlay.render();
                if (this.currentActiveUnit) {
                    this.currentActiveUnit.renderSpells(1);
                }
            } else {
                this.hourGlassButton.render(settings.m_debugDraw, isLightMode);
                this.shieldButton.render(settings.m_debugDraw, isLightMode);
                this.nextButton.render(settings.m_debugDraw, isLightMode);
                this.aiButton.render(settings.m_debugDraw, isLightMode, 1, this.sc_isAIActive);
                this.drawer.renderTerrainSpritesFront(isLightMode);
            }
        } else {
            this.lifeButton.render(settings.m_debugDraw, isLightMode);
            this.natureButton.render(settings.m_debugDraw, isLightMode);
            // this.orderButton.render(settings.m_debugDraw, isLightMode);
            this.mightButton.render(settings.m_debugDraw, isLightMode);
            this.chaosButton.render(settings.m_debugDraw, isLightMode);
            this.deathButton.render(settings.m_debugDraw, isLightMode);
            this.drawer.renderTerrainSpritesFront(isLightMode);
        }

        return timeStep;
    }
}

registerScene("Heroes", "Sandbox", Sandbox);
