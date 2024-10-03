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
    Augment,
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
    SpellMultiplierType,
    Spell,
    SpellHelper,
    MovementType,
    SpellPowerType,
    HoCMath,
    IWeightedRoute,
    PathHelper,
    TeamType,
    IAuraOnMap,
    UnitProperties,
    AbilityHelper,
    PlacementType,
    SquarePlacement,
} from "@heroesofcrypto/common";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

import { evaluateAffectedUnits } from "../abilities/aoe_range_ability";
import { nextStandingTargets } from "../abilities/abilities_helper";
import { processPenetratingBiteAbility } from "../abilities/penetrating_bite_ability";
import { processRapidChargeAbility } from "../abilities/rapid_charge_ability";
import { AIActionType, findTarget } from "../ai/ai";
import { Drawer } from "../draw/drawer";
import { getAbsorptionTarget } from "../effects/effects_helper";
import { AttackHandler, IAttackObstacle } from "../handlers/attack_handler";
import { MoveHandler } from "../handlers/move_handler";
import { Button } from "../menu/button";
import { ObstacleGenerator } from "../obstacles/obstacle_generator";
import { DrawableSquarePlacement } from "../draw/drawable_square_placement";
import { Settings } from "../settings";
import { RenderableSpell } from "../spells/renderable_spell";
import { hasAlreadyAppliedSpell, isMirrored } from "../spells/spells_helper";
import { FightStateManager } from "../state/fight_state_manager";
import { IVisibleButton, IVisibleUnit, VisibleButtonState } from "../state/visible_state";
import {
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
import { RenderableUnit } from "../units/renderable_unit";

class Sandbox extends GLScene {
    private ground: b2Body;

    private placementsCleanedUp = false;

    private currentActiveUnit?: RenderableUnit;

    private currentActivePath?: XY[];

    private currentActivePathHashes?: Set<number>;

    private currentActiveKnownPaths?: Map<number, IWeightedRoute[]>;

    private currentActiveSpell?: RenderableSpell;

    private currentEnemiesCellsWithinMovementRange?: XY[];

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

    private hoverAttackFromCell?: XY;

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

    private armageddonWave = 0;

    private readonly allowedPlacementCellHashes: Set<number>;

    private readonly obstacleGenerator: ObstacleGenerator;

    private upperPlacements: [DrawableSquarePlacement?, DrawableSquarePlacement?];

    private lowerPlacements: [DrawableSquarePlacement?, DrawableSquarePlacement?];

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

    public readonly spellBookButton: IVisibleButton;

    public readonly selectedAttackTypeButton: IVisibleButton;

    public readonly hourGlassButton: IVisibleButton;

    public readonly shieldButton: IVisibleButton;

    public readonly nextButton: IVisibleButton;

    public readonly aiButton: IVisibleButton;

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

        this.ground = this.sc_world.CreateBody();
        this.grid = new Grid(
            this.sc_sceneSettings.getGridSettings(),
            FightStateManager.getInstance().getFightProperties().getGridType(),
        );

        this.unitsHolder = new UnitsHolder(this.grid);
        this.unitsFactory = new UnitsFactory(
            this.sc_world,
            this.gl,
            this.shader,
            this.digitNormalTextures,
            this.digitDamageTextures,
            this.sc_sceneSettings.getGridSettings(),
            this.sc_stepCount,
            textures,
            this.grid,
            this.unitsHolder,
            new AbilityFactory(new EffectFactory()),
        );

        this.refreshVisibleStateIfNeeded();
        this.gridMatrix = this.grid.getMatrix();
        this.obstacleGenerator = new ObstacleGenerator(this.sc_world, textures);
        this.drawer = new Drawer(this.grid, this.sc_world, this.gl, this.shader, this.textures, this.obstacleGenerator);
        this.drawer.setGridType(this.grid.getGridType());
        this.sc_gridTypeUpdateNeeded = true;

        this.lowerPlacements = [];
        this.upperPlacements = [];
        this.allowedPlacementCellHashes = new Set();
        FightStateManager.getInstance()
            .getFightProperties()
            .setDefaultPlacementPerTeam(TeamType.LOWER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        FightStateManager.getInstance()
            .getFightProperties()
            .setDefaultPlacementPerTeam(TeamType.UPPER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        this.initializePlacements(false);

        this.background = new Sprite(gl, shader, this.textures.background_dark.texture);
        this.spellBookOverlay = new Sprite(gl, shader, this.textures.book_1024.texture);

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
        this.moveHandler = new MoveHandler(
            this.sc_sceneSettings.getGridSettings(),
            this.grid,
            this.unitsHolder,
            this.unitsFactory,
        );

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
                if (this.currentActiveUnit.selectAttackType(AttackType.MELEE)) {
                    this.refreshButtons(true);
                }
                if (
                    (this.currentActiveUnit.getAttackTypeSelection() === AttackType.MELEE ||
                        this.currentActiveUnit.getAttackTypeSelection() === AttackType.MELEE_MAGIC) &&
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
                            this.hoverAttackFromCell = attackedCell;
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
                if (this.currentActiveUnit.selectAttackType(AttackType.MELEE)) {
                    this.refreshButtons(true);
                }
                if (
                    (this.currentActiveUnit.getAttackTypeSelection() === AttackType.MELEE ||
                        this.currentActiveUnit.getAttackTypeSelection() === AttackType.MELEE_MAGIC) &&
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
                            this.hoverAttackFromCell = attackedCell;
                        }
                    }
                }
                this.landAttack();
            } else if (action?.actionType() === AIActionType.RANGE_ATTACK) {
                if (this.currentActiveUnit.selectAttackType(AttackType.RANGE)) {
                    this.refreshButtons(true);
                }
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
                        const moveInitiated = this.moveHandler.applyMoveModifiers(
                            cellToMove,
                            FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                            this.currentActiveUnit,
                            action?.currentActiveKnownPaths(),
                        );
                        if (moveInitiated) {
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
                            const movePaths = action
                                ?.currentActiveKnownPaths()
                                ?.get((cellToMove.x << 4) | cellToMove.y);
                            if (movePaths?.length && this.sc_selectedBody) {
                                const path = movePaths[0].route;
                                this.drawer.startMoveAnimation(this.sc_selectedBody, this.currentActiveUnit, path);
                            }
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
                        const moveInitiated = this.moveHandler.applyMoveModifiers(
                            cellToMove,
                            FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                            this.currentActiveUnit,
                            action?.currentActiveKnownPaths(),
                        );
                        if (moveInitiated) {
                            this.currentActiveUnit.setPosition(
                                position.x - this.sc_sceneSettings.getGridSettings().getHalfStep(),
                                position.y - this.sc_sceneSettings.getGridSettings().getHalfStep(),
                                false,
                            );

                            this.grid.occupyCells(
                                cells,
                                this.currentActiveUnit.getId(),
                                this.currentActiveUnit.getTeam(),
                                this.currentActiveUnit.getAttackRange(),
                            );

                            const movePaths = action
                                ?.currentActiveKnownPaths()
                                ?.get((cellToMove.x << 4) | cellToMove.y);
                            if (movePaths?.length && this.sc_selectedBody) {
                                const path = movePaths[0].route;
                                this.drawer.startMoveAnimation(this.sc_selectedBody, this.currentActiveUnit, path);
                            }
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

        this.hourGlassButton = {
            name: "Hourglass",
            text: "Wait",
            state: VisibleButtonState.FIRST,
            isVisible: true,
            isDisabled: true,
            numberOfOptions: 1,
            selectedOption: 1,
        };
        this.shieldButton = {
            name: "LuckShield",
            text: "Cleanup randomized luck and skip turn",
            state: VisibleButtonState.FIRST,
            isVisible: true,
            isDisabled: true,
            numberOfOptions: 1,
            selectedOption: 1,
        };
        this.nextButton = {
            name: "Next",
            text: "Skip turn",
            state: VisibleButtonState.FIRST,
            isVisible: true,
            isDisabled: true,
            numberOfOptions: 1,
            selectedOption: 1,
        };
        this.aiButton = {
            name: "AI",
            text: "Switch AI state",
            state: this.sc_isAIActive ? VisibleButtonState.SECOND : VisibleButtonState.FIRST,
            isVisible: true,
            isDisabled: false,
            numberOfOptions: 1,
            selectedOption: 1,
        };
        this.selectedAttackTypeButton = {
            name: "AttackType",
            text: "Switch attack type",
            state: VisibleButtonState.FIRST,
            isVisible: true,
            isDisabled: true,
            numberOfOptions: 3,
            selectedOption: 1,
        };
        this.spellBookButton = {
            name: "Spellbook",
            text: "Select spell",
            state: VisibleButtonState.FIRST,
            isVisible: true,
            isDisabled: true,
            numberOfOptions: 1,
            selectedOption: 1,
        };

        this.sc_visibleButtonGroup = [
            this.hourGlassButton,
            this.shieldButton,
            this.nextButton,
            this.aiButton,
            this.selectedAttackTypeButton,
            this.spellBookButton,
        ];

        HoCLib.interval(this.visibleStateUpdate, 500);
        HoCLib.interval(this.sendFightState, 1000000);
    }

    private checkHourGlassCondition(): boolean {
        if (!this.currentActiveUnit) {
            return false;
        }

        const fightState = FightStateManager.getInstance().getFightProperties();

        const lowerTeamUnitsAlive = fightState.getTeamUnitsAlive(TeamType.LOWER);
        const upperTeamUnitsAlive = fightState.getTeamUnitsAlive(TeamType.UPPER);

        const moreThanOneUnitAlive =
            (this.currentActiveUnit.getTeam() === TeamType.LOWER && lowerTeamUnitsAlive > 1) ||
            (this.currentActiveUnit.getTeam() === TeamType.UPPER && upperTeamUnitsAlive > 1);
        if (
            moreThanOneUnitAlive &&
            !fightState.hourGlassIncludes(this.currentActiveUnit.getId()) &&
            !fightState.hasAlreadyMadeTurn(this.currentActiveUnit.getId()) &&
            !fightState.hasAlreadyHourGlass(this.currentActiveUnit.getId())
        ) {
            return true;
        }

        return false;
    }

    private checkCastCondition(): boolean {
        if (!this.currentActiveUnit) {
            return false;
        }

        return (
            this.currentActiveUnit &&
            this.currentActiveUnit.getSpellsCount() > 0 &&
            this.currentActiveUnit.getCanCastSpells()
        );
    }

    private refreshButtons(forceUpdate = false): void {
        if (this.sc_visibleState && this.sc_visibleState.hasFinished) {
            this.hourGlassButton.isDisabled = true;
            this.shieldButton.isDisabled = true;
            this.nextButton.isDisabled = true;
            this.aiButton.isDisabled = true;
            this.selectedAttackTypeButton.isDisabled = true;
            this.spellBookButton.isDisabled = true;
            this.sc_buttonGroupUpdated = true;
            return;
        }

        const previousAIButtonState = this.aiButton.state;
        const previousHourGlassButtonState = this.hourGlassButton.state;
        const previousNextButtonState = this.nextButton.state;
        const previousShieldButtonState = this.shieldButton.state;
        const previousSpellBookButtonState = this.spellBookButton.state;
        const previousSelectedAttackTypeButtonNew = this.selectedAttackTypeButton.state;
        if (this.sc_isAIActive) {
            this.aiButton.state = VisibleButtonState.SECOND;
            this.hourGlassButton.isDisabled = true;
            this.shieldButton.isDisabled = true;
            this.nextButton.isDisabled = true;
            this.selectedAttackTypeButton.isDisabled = true;
            this.spellBookButton.isDisabled = true;
        } else if (this.sc_renderSpellBookOverlay) {
            this.hourGlassButton.isDisabled = true;
            this.shieldButton.isDisabled = true;
            this.nextButton.isDisabled = true;
            this.selectedAttackTypeButton.isDisabled = true;
            this.spellBookButton.isDisabled = false;
        } else {
            this.aiButton.state = VisibleButtonState.FIRST;
            this.shieldButton.isDisabled = false;
            this.nextButton.isDisabled = false;
            this.selectedAttackTypeButton.isDisabled = false;
            this.spellBookButton.isDisabled = false;

            if (this.checkHourGlassCondition()) {
                this.hourGlassButton.isDisabled = false;
            } else {
                this.hourGlassButton.isDisabled = true;
            }

            if (this.checkCastCondition()) {
                this.spellBookButton.isDisabled = false;
            } else {
                this.spellBookButton.isDisabled = true;
            }
        }

        if (this.currentActiveUnit) {
            const attackTypeSelectionIndex = this.currentActiveUnit.getAttackTypeSelectionIndex();
            const currentIdx = attackTypeSelectionIndex[0] + 1;
            const numberOfOptions = attackTypeSelectionIndex[1];
            if (currentIdx <= 0) {
                this.selectedAttackTypeButton.numberOfOptions = 1;
                this.selectedAttackTypeButton.isDisabled = true;
            } else {
                const currentCell = GridMath.getCellForPosition(
                    this.sc_sceneSettings.getGridSettings(),
                    this.currentActiveUnit.getPosition(),
                );
                switch (this.currentActiveUnit.getAttackTypeSelection()) {
                    case AttackType.RANGE:
                        this.currentActiveSpell = undefined;
                        this.spellBookButton.customSpriteName = undefined;
                        this.selectedAttackTypeButton.state = VisibleButtonState.SECOND;
                        break;
                    case AttackType.MAGIC:
                        this.selectedAttackTypeButton.state = VisibleButtonState.THIRD;
                        break;
                    default:
                        this.currentActiveSpell = undefined;
                        this.spellBookButton.customSpriteName = undefined;
                        this.selectedAttackTypeButton.state = VisibleButtonState.FIRST;
                        if (currentCell) {
                            this.updateCurrentMovePath(currentCell);
                        }
                }
                this.selectedAttackTypeButton.numberOfOptions = attackTypeSelectionIndex[1];
                this.selectedAttackTypeButton.selectedOption = currentIdx;
                if (numberOfOptions <= 1) {
                    this.selectedAttackTypeButton.isDisabled = true;
                }
            }
        }

        this.sc_buttonGroupUpdated =
            forceUpdate ||
            previousAIButtonState !== this.aiButton.state ||
            previousHourGlassButtonState !== this.hourGlassButton.state ||
            previousSpellBookButtonState !== this.spellBookButton.state ||
            previousShieldButtonState !== this.shieldButton.state ||
            previousSelectedAttackTypeButtonNew !== this.selectedAttackTypeButton.state ||
            previousNextButtonState !== this.nextButton.state;
    }

    public propagateButtonClicked(buttonName: string, buttonState: VisibleButtonState): void {
        if (
            !this.currentActiveUnit ||
            (this.currentActiveUnit && this.currentActiveUnit.hasAbilityActive("AI Driven"))
        ) {
            return;
        }

        if (buttonName === "AI") {
            this.sc_isAIActive = buttonState === VisibleButtonState.FIRST;
            this.refreshButtons();
            this.resetHover();
        } else if (!this.sc_isAIActive) {
            if (buttonName === "Hourglass" && this.checkHourGlassCondition()) {
                this.currentActiveUnit.decreaseMorale(HoCConstants.MORALE_CHANGE_FOR_SHIELD_OR_CLOCK);
                this.currentActiveUnit.setOnHourglass(true);
                FightStateManager.getInstance().getFightProperties().enqueueHourGlass(this.currentActiveUnit.getId());
                this.currentActiveUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                );
                this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} wait turn`);
                this.finishTurn(true); // hourglass finish
            } else if (buttonName === "Next" && this.currentActiveUnit) {
                this.currentActiveUnit.decreaseMorale(HoCConstants.MORALE_CHANGE_FOR_SKIP);
                this.currentActiveUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                );
                this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} skip turn`);
                this.finishTurn();
            } else if (buttonName === "LuckShield" && this.currentActiveUnit) {
                this.currentActiveUnit.cleanupLuckPerTurn();
                this.currentActiveUnit.decreaseMorale(HoCConstants.MORALE_CHANGE_FOR_SHIELD_OR_CLOCK);
                this.currentActiveUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                );
                this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} shield turn`);
                this.finishTurn();
            } else if (buttonName === "Spellbook" && this.checkCastCondition()) {
                this.sc_renderSpellBookOverlay = !this.sc_renderSpellBookOverlay;
                if (!this.sc_renderSpellBookOverlay) {
                    this.hoveredSpell = undefined;
                }
                this.adjustSpellBookSprite();
                // this.spellBookButtonNew.customSpriteName = undefined;
                // this.refreshButtons(true);
            } else if (buttonName === "AttackType" && this.currentActiveUnit) {
                if (this.currentActiveUnit.selectNextAttackType()) {
                    this.currentEnemiesCellsWithinMovementRange = undefined;
                    // this.currentActiveUnitSwitchedAttackAuto = true;
                    this.sc_unitPropertiesUpdateNeeded = true;
                    this.refreshButtons(true);
                }
            }
        }
    }

    public initializePlacements(initArrays = true): void {
        if (initArrays) {
            this.lowerPlacements = [];
            this.upperPlacements = [];
        }

        const augmentPlacementsLowerTeam = FightStateManager.getInstance()
            .getFightProperties()
            .getAugmentPlacement(TeamType.LOWER);

        if (0 in augmentPlacementsLowerTeam) {
            this.lowerPlacements.push(
                new DrawableSquarePlacement(
                    this.sc_sceneSettings.getGridSettings(),
                    PlacementType.LOWER_LEFT,
                    augmentPlacementsLowerTeam[0],
                ),
            );
        }
        if (1 in augmentPlacementsLowerTeam) {
            this.lowerPlacements.push(
                new DrawableSquarePlacement(
                    this.sc_sceneSettings.getGridSettings(),
                    PlacementType.LOWER_RIGHT,
                    augmentPlacementsLowerTeam[1],
                ),
            );
        }

        const augmentPlacementsUpperTeam = FightStateManager.getInstance()
            .getFightProperties()
            .getAugmentPlacement(TeamType.UPPER);
        if (0 in augmentPlacementsUpperTeam) {
            this.upperPlacements.push(
                new DrawableSquarePlacement(
                    this.sc_sceneSettings.getGridSettings(),
                    PlacementType.UPPER_RIGHT,
                    augmentPlacementsUpperTeam[0],
                ),
            );
        }
        if (1 in augmentPlacementsUpperTeam) {
            this.upperPlacements.push(
                new DrawableSquarePlacement(
                    this.sc_sceneSettings.getGridSettings(),
                    PlacementType.UPPER_LEFT,
                    augmentPlacementsUpperTeam[1],
                ),
            );
        }

        this.allowedPlacementCellHashes.clear();
        if (0 in this.lowerPlacements && this.lowerPlacements[0]) {
            for (const hash of this.lowerPlacements[0].possibleCellHashes()) {
                this.allowedPlacementCellHashes.add(hash);
            }
        }
        if (0 in this.upperPlacements && this.upperPlacements[0]) {
            for (const hash of this.upperPlacements[0].possibleCellHashes()) {
                this.allowedPlacementCellHashes.add(hash);
            }
        }
        if (1 in this.lowerPlacements && this.lowerPlacements[1]) {
            for (const hash of this.lowerPlacements[1].possibleCellHashes()) {
                this.allowedPlacementCellHashes.add(hash);
            }
        }
        if (1 in this.upperPlacements && this.upperPlacements[1]) {
            for (const hash of this.upperPlacements[1].possibleCellHashes()) {
                this.allowedPlacementCellHashes.add(hash);
            }
        }
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
                const systemMoveResult = this.moveHandler.moveUnitTowardsCenter(cell, GridConstants.UPDATE_UP, laps);
                if (systemMoveResult.log) {
                    logs.push(systemMoveResult.log);
                }
                for (const uId in systemMoveResult.unitIdsDestroyed) {
                    if (this.unitsHolder.deleteUnitById(uId)) {
                        const unitBody = this.unitsFactory.getUnitBody(uId);
                        if (unitBody) {
                            this.sc_world.DestroyBody(unitBody);
                        }
                        this.unitsFactory.deleteUnitBody(uId);
                    }
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
                const systemMoveResult = this.moveHandler.moveUnitTowardsCenter(cell, GridConstants.UPDATE_DOWN, laps);
                if (systemMoveResult.log) {
                    logs.push(systemMoveResult.log);
                }
                for (const uId in systemMoveResult.unitIdsDestroyed) {
                    if (this.unitsHolder.deleteUnitById(uId)) {
                        const unitBody = this.unitsFactory.getUnitBody(uId);
                        if (unitBody) {
                            this.sc_world.DestroyBody(unitBody);
                        }
                        this.unitsFactory.deleteUnitBody(uId);
                    }
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
                const systemMoveResult = this.moveHandler.moveUnitTowardsCenter(cell, GridConstants.UPDATE_RIGHT, laps);
                if (systemMoveResult.log) {
                    logs.push(systemMoveResult.log);
                }
                for (const uId in systemMoveResult.unitIdsDestroyed) {
                    if (this.unitsHolder.deleteUnitById(uId)) {
                        const unitBody = this.unitsFactory.getUnitBody(uId);
                        if (unitBody) {
                            this.sc_world.DestroyBody(unitBody);
                        }
                        this.unitsFactory.deleteUnitBody(uId);
                    }
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
                const systemMoveResult = this.moveHandler.moveUnitTowardsCenter(cell, GridConstants.UPDATE_LEFT, laps);
                if (systemMoveResult.log) {
                    logs.push(systemMoveResult.log);
                }
                for (const uId in systemMoveResult.unitIdsDestroyed) {
                    if (this.unitsHolder.deleteUnitById(uId)) {
                        const unitBody = this.unitsFactory.getUnitBody(uId);
                        if (unitBody) {
                            this.sc_world.DestroyBody(unitBody);
                        }
                        this.unitsFactory.deleteUnitBody(uId);
                    }
                }
                this.grid.occupyByHole({ x: cellX, y: cellY });
            }
            laps--;
        }
        this.gridMatrix = this.grid.getMatrix();

        return logs.join("\n");
    }

    private spawnUnits(): void {
        this.unitsFactory.spawn(TeamType.LOWER, this.sc_selectedFactionName);
        this.unitsFactory.spawn(TeamType.UPPER, this.sc_selectedFactionName);
    }

    public requestTime(team: number): void {
        FightStateManager.getInstance().getFightProperties().requestAdditionalTurnTime(team);
        if (this.sc_visibleState) {
            this.sc_visibleState.canRequestAdditionalTime = false;
            this.sc_visibleStateUpdateNeeded = true;
        }
    }

    public startScene() {
        this.sc_buttonGroupUpdated = true;
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
        this.allowedPlacementCellHashes.clear();
        this.deselectRaceButtons();
        this.sc_selectedFactionName = FactionType.NO_TYPE;
        this.sc_factionNameUpdateNeeded = true;
    }

    public propagateAugmentation(teamType: TeamType, augmentType: Augment.AugmentType): boolean {
        const canAugment = FightStateManager.getInstance().getFightProperties().canAugment(teamType, augmentType);
        if (!canAugment) {
            return false;
        }

        const augmented = FightStateManager.getInstance().getFightProperties().setAugmentPerTeam(teamType, augmentType);
        if (augmentType.type === "Placement") {
            this.initializePlacements();
            this.destroyNonPlacedUnits(false);
        }
        if (augmented) {
            if (this.sc_selectedBody) {
                this.setSelectedUnitProperties(this.sc_selectedBody.GetUserData());
            }
            this.sc_unitPropertiesUpdateNeeded = true;
        }

        return augmented;
    }

    protected destroyNonPlacedUnits(verifyWithinGridPosition = true): void {
        if (FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
            return;
        }

        for (let b = this.sc_world.GetBodyList(); b; b = b.GetNext()) {
            if (b.GetType() === b2BodyType.b2_dynamicBody) {
                const unitStats = b.GetUserData();
                if (!unitStats) {
                    continue;
                }

                if (
                    this.unitsHolder.deleteUnitIfNotAllowed(
                        unitStats.team,
                        unitStats.team === TeamType.LOWER ? TeamType.UPPER : TeamType.LOWER,
                        unitStats,
                        b.GetPosition(),
                        this.getPlacement(TeamType.LOWER, 0),
                        this.getPlacement(TeamType.UPPER, 0),
                        this.getPlacement(TeamType.LOWER, 1),
                        this.getPlacement(TeamType.UPPER, 1),
                        verifyWithinGridPosition,
                    )
                ) {
                    if (b === this.sc_selectedBody) {
                        b.SetIsActive(false);
                        this.deselect();
                    }
                    this.sc_world.DestroyBody(b);
                    this.unitsFactory.deleteUnitBody(unitStats.id);
                }
            }
        }
    }

    private resetHover(resetSelectedCells = true): void {
        if (resetSelectedCells) {
            this.sc_hoverUnitNameStr = "";
            this.sc_hoverUnitLevel = 0;
            this.sc_hoverUnitMovementType = MovementType.NO_TYPE;
            this.hoverSelectedCells = undefined;
            this.hoverSelectedCellsSwitchToRed = false;
        }

        this.hoverAttackUnits = undefined;
        this.hoverAOECells = undefined;
        this.hoverActivePath = undefined;
        this.hoverAttackFromCell = undefined;
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

    private getPlacement(teamType: TeamType, placementIndex: number): SquarePlacement | undefined {
        const placements = teamType === TeamType.LOWER ? this.lowerPlacements : this.upperPlacements;
        if (placementIndex in placements && placements[placementIndex]) {
            return placements[placementIndex];
        }

        return undefined;
    }

    public cloneObject(newAmount?: number): boolean {
        let cloned = false;

        if (this.sc_selectedBody) {
            const selectedUnitData = this.sc_selectedBody.GetUserData();
            const selectedUnit = this.unitsHolder.getAllUnits().get(selectedUnitData.id);
            if (!selectedUnit) {
                return cloned;
            }

            const lowerLeftPlacement = this.getPlacement(TeamType.LOWER, 0);
            const upperRightPlacement = this.getPlacement(TeamType.UPPER, 0);

            if (!lowerLeftPlacement || !upperRightPlacement) {
                return cloned;
            }

            if (
                this.unitsHolder.getAllAlliesPlaced(
                    selectedUnit.getTeam(),
                    lowerLeftPlacement,
                    upperRightPlacement,
                    this.getPlacement(TeamType.LOWER, 1),
                    this.getPlacement(TeamType.UPPER, 1),
                ).length >=
                FightStateManager.getInstance()
                    .getFightProperties()
                    .getNumberOfUnitsAvailableForPlacement(selectedUnit.getTeam())
            ) {
                return cloned;
            }

            let placement: SquarePlacement;
            if (selectedUnit.getTeam() === TeamType.LOWER) {
                placement = lowerLeftPlacement;
            } else {
                placement = upperRightPlacement;
            }

            const isSmallUnit = selectedUnit.getSize() === 1;
            const allowedCells = placement.possibleCellPositions(isSmallUnit);
            HoCLib.shuffle(allowedCells);

            for (const cell of allowedCells) {
                if (this.unitsFactory.spawnSelected(selectedUnit, cell, false, newAmount)) {
                    this.unitsHolder.refreshStackPowerForAllUnits();
                    this.unitsFactory.refreshBarFixturesForAllUnits(this.unitsHolder.getAllUnitsIterator());
                    cloned = true;
                    break;
                }
            }
        }

        return cloned;
    }

    public deleteObject() {
        if (this.sc_selectedBody) {
            const selectedUnitData = this.sc_selectedBody.GetUserData();
            this.deselect();
            if (this.unitsHolder.deleteUnitById(selectedUnitData.id)) {
                this.sc_world.DestroyBody(this.sc_selectedBody);
                this.unitsFactory.deleteUnitBody(selectedUnitData.id);
            }
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
                this.currentActiveUnit.getAttack(),
                hoverAttackUnit,
                true,
                hoverRangeAttackDivisor,
                abilityMultiplier,
            );
            let maxDmg = this.currentActiveUnit.calculateAttackDamageMax(
                this.currentActiveUnit.getAttack(),
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
            this.sc_hoverUnitLevel = 0;
            this.sc_hoverUnitMovementType = MovementType.NO_TYPE;
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
                                (this.hoveredSpell.getMultiplierType() === SpellMultiplierType.UNIT_AMOUNT
                                    ? this.currentActiveUnit.getAmountAlive()
                                    : this.currentActiveUnit.getAmountAlive() * this.hoveredSpell.getPower()
                                ).toString(),
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
                            this.hoverUnit.getAuraRanges(),
                            this.hoverUnit.getAuraIsBuff(),
                            true,
                        );

                        this.hoverSelectedCells = undefined;
                        if (hoverUnitCell && this.hoverUnit.canMove()) {
                            this.hoverActivePath = this.pathHelper.getMovePath(
                                hoverUnitCell,
                                this.gridMatrix,
                                this.hoverUnit.getSteps(),
                                this.grid.getAggrMatrixByTeam(this.hoverUnit.getOppositeTeam()),
                                this.hoverUnit.canFly(),
                                this.hoverUnit.isSmallSize(),
                            ).cells;
                        } else {
                            this.hoverActivePath = undefined;
                        }
                    } else {
                        this.resetHover();
                    }
                }

                // const currentUnitCell = GridMath.getCellForPosition(
                //     this.sc_sceneSettings.getGridSettings(),
                //     this.currentActiveUnit.getPosition(),
                // );

                if (
                    this.currentActiveUnit &&
                    (this.currentActiveUnit.getAttackTypeSelection() === AttackType.MAGIC || this.currentActiveSpell)
                ) {
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
                            this.hoverUnit?.getBaseCell(),
                            this.currentActiveUnit.getId(),
                            this.hoverUnit?.getId(),
                            this.currentActiveUnit.getTarget(),
                            this.currentActiveUnit.getTeam(),
                            this.hoverUnit?.getTeam(),
                            this.currentActiveUnit.getName(),
                            this.hoverUnit?.getName(),
                            this.hoverUnit?.getLevel(),
                            this.hoverUnit?.getHp(),
                            this.hoverUnit?.getMaxHp(),
                            this.hoverUnit?.isSmallSize(),
                            this.currentActiveUnit.getStackPower(),
                            this.hoverUnit?.getMagicResist(),
                            this.hoverUnit?.hasMindAttackResistance(),
                            this.hoverUnit?.canBeHealed(),
                            this.currentEnemiesCellsWithinMovementRange,
                        )
                    ) {
                        if (hoverUnitCell) {
                            if (!this.currentActiveSpell.isBuff() && this.hoverUnit) {
                                this.hoverAttackUnits = [[this.hoverUnit]];
                            } else {
                                this.hoverAttackFromCell = hoverUnitCell;
                            }
                            this.hoverAttackIsSmallSize = this.hoverUnit?.isSmallSize();
                            this.sc_moveBlocked = true;
                        }
                    } else {
                        this.hoverAttackFromCell = undefined;
                        this.hoverAttackIsSmallSize = undefined;
                        this.hoverAttackUnits = undefined;
                    }

                    return;
                }

                this.hoverSelectedCells = undefined;

                // if (
                //     !this.currentActiveSpell &&
                //     !this.currentActiveUnitSwitchedAttackAuto &&
                //     currentUnitCell &&
                //     this.currentActiveUnit.getAttackType() === AttackType.RANGE &&
                //     this.currentActiveUnit.getAttackTypeSelection() !== AttackType.RANGE &&
                //     !this.attackHandler.canBeAttackedByMelee(
                //         this.currentActiveUnit.getPosition(),
                //         this.currentActiveUnit.isSmallSize(),
                //         this.grid.getEnemyAggrMatrixByUnitId(this.currentActiveUnit.getId()),
                //     ) &&
                //     this.currentActiveUnit.getRangeShots() > 0 &&
                //     !this.currentActiveUnit.hasDebuffActive("Range Null Field Aura") &&
                //     !this.currentActiveUnit.hasDebuffActive("Rangebane")
                // ) {
                //     this.selectAttack(AttackType.RANGE, true);
                //     this.currentActiveUnitSwitchedAttackAuto = true;
                //     this.switchToSelectedAttackType = undefined;

                //     console.log("Switch to RANGE");
                // }

                if (
                    (this.currentActiveUnit.getAttackTypeSelection() === AttackType.MELEE ||
                        this.currentActiveUnit.getAttackTypeSelection() === AttackType.MELEE_MAGIC) &&
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
                            ) &&
                            (!this.currentActiveUnit.getTarget() ||
                                this.currentActiveUnit.getTarget() === this.hoverUnit.getId())
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

                            this.hoverAttackFromCell = this.pathHelper.calculateClosestAttackFrom(
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
                                this.hoverAttackFromCell,
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

                            if (this.hoverAttackFromCell && this.currentActiveKnownPaths) {
                                const paths = this.currentActiveKnownPaths.get(
                                    (this.hoverAttackFromCell.x << 4) | this.hoverAttackFromCell.y,
                                );
                                let rapidChargeCellsNumber = 1;
                                if (paths?.length) {
                                    rapidChargeCellsNumber = paths[0].route.length;
                                }

                                abilityMultiplier *= processRapidChargeAbility(
                                    this.currentActiveUnit,
                                    rapidChargeCellsNumber,
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

                            const warAngerAuraEffect = this.currentActiveUnit.getAuraEffect("War Anger");
                            let attackRate = this.currentActiveUnit.getAttack();
                            if (warAngerAuraEffect) {
                                const cells: XY[] = this.hoverAttackFromCell
                                    ? [this.hoverAttackFromCell]
                                    : this.currentActiveUnit.getCells();
                                if (!this.currentActiveUnit.isSmallSize() && this.hoverAttackFromCell) {
                                    cells.push({ x: this.hoverAttackFromCell.x - 1, y: this.hoverAttackFromCell.y });
                                    cells.push({ x: this.hoverAttackFromCell.x, y: this.hoverAttackFromCell.y - 1 });
                                    cells.push({
                                        x: this.hoverAttackFromCell.x - 1,
                                        y: this.hoverAttackFromCell.y - 1,
                                    });
                                }

                                const newAttackRate =
                                    attackRate -
                                    this.currentActiveUnit.getCurrentAttackModIncrease() +
                                    this.unitsHolder.getUnitAuraAttackMod(this.currentActiveUnit, cells);
                                attackRate = Math.max(1, newAttackRate);
                            }

                            const minDmg =
                                this.currentActiveUnit.calculateAttackDamageMin(
                                    attackRate,
                                    hoverAttackUnit,
                                    false,
                                    isRangedAttacker ? 2 : 1,
                                    abilityMultiplier,
                                ) + processPenetratingBiteAbility(this.currentActiveUnit, hoverAttackUnit);
                            let maxDmg =
                                this.currentActiveUnit.calculateAttackDamageMax(
                                    attackRate,
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
                                    this.grid.getAggrMatrixByTeam(hoverAttackUnit.getOppositeTeam()),
                                    hoverAttackUnit.canFly(),
                                    hoverAttackUnit.isSmallSize(),
                                ).cells;
                            } else {
                                this.hoverActivePath = undefined;
                            }
                        } else {
                            this.hoverAttackFromCell = undefined;
                        }
                    } else {
                        this.hoverAttackUnits = undefined;
                        this.hoverAttackFromCell = undefined;
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
                                this.grid.getAggrMatrixByTeam(this.hoverUnit.getOppositeTeam()),
                                this.hoverUnit.canFly(),
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
                        this.grid.getAggrMatrixByTeam(this.hoverUnit.getOppositeTeam()),
                        this.hoverUnit.canFly(),
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
                                isThroughShot,
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
                    this.sc_isSelection = false;

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

                if (
                    GridMath.isCellWithinGrid(this.sc_sceneSettings.getGridSettings(), mouseCell) &&
                    this.currentActivePathHashes?.has((mouseCell.x << 4) | mouseCell.y)
                ) {
                    this.updateHoverInfoWithButtonAction(mouseCell);

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
                            this.currentActiveUnit.getTarget(),
                            this.currentActiveUnit.getTeam(),
                            undefined,
                            this.currentActiveUnit.getName(),
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            this.currentActiveUnit.getStackPower(),
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            mouseCell,
                        ) &&
                        GridMath.isCellWithinGrid(this.sc_sceneSettings.getGridSettings(), mouseCell)
                    ) {
                        this.hoverAttackFromCell = mouseCell;
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
                        this.currentActiveUnit.getTarget(),
                        this.currentActiveUnit.getTeam(),
                        undefined,
                        this.currentActiveUnit.getName(),
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        this.currentActiveUnit.getStackPower(),
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        mouseCell,
                    ) &&
                    GridMath.isCellWithinGrid(this.sc_sceneSettings.getGridSettings(), mouseCell)
                ) {
                    this.hoverAttackFromCell = mouseCell;
                    this.sc_moveBlocked = true;
                } else {
                    this.resetHover();
                }
            }
        } else if (
            (this.lowerPlacements[0]?.isAllowed(this.sc_mouseWorld) ?? false) ||
            (this.lowerPlacements[1]?.isAllowed(this.sc_mouseWorld) ?? false) ||
            (this.upperPlacements[0]?.isAllowed(this.sc_mouseWorld) ?? false) ||
            (this.upperPlacements[1]?.isAllowed(this.sc_mouseWorld) ?? false) ||
            this.isButtonHover(mouseCell) ||
            this.sc_selectedBody ||
            (mouseCell &&
                mouseCell.y >= 0 &&
                mouseCell.y < GRID_SIZE &&
                this.cellToUnitPreRound &&
                this.cellToUnitPreRound.has(`${mouseCell.x}:${mouseCell.y}`))
        ) {
            this.resetHover();
            if (!mouseCell) {
                return;
            }
            this.hoverUnit = undefined;

            const cellKey = `${mouseCell.x}:${mouseCell.y}`;

            if (
                !this.sc_selectedBody &&
                !this.cellToUnitPreRound?.has(cellKey) &&
                ((this.lowerPlacements[0]?.isAllowed(this.sc_mouseWorld) ?? false) ||
                    (this.lowerPlacements[1]?.isAllowed(this.sc_mouseWorld) ?? false) ||
                    (this.upperPlacements[0]?.isAllowed(this.sc_mouseWorld) ?? false) ||
                    (this.upperPlacements[1]?.isAllowed(this.sc_mouseWorld) ?? false))
            ) {
                return;
            }

            if (this.isButtonHover(mouseCell)) {
                this.updateHoverInfoWithButtonAction(mouseCell);
                this.hoverSelectedCells = [mouseCell];
                this.hoverSelectedCellsSwitchToRed = false;
                return;
            }

            const selectedUnitProperties = this.sc_selectedBody?.GetUserData();
            if (selectedUnitProperties) {
                const selectedUnit = this.unitsHolder.getAllUnits().get(selectedUnitProperties.id);
                if (!selectedUnit) {
                    return;
                }

                if (this.cellToUnitPreRound) {
                    const hoverUnit = this.cellToUnitPreRound.get(cellKey);
                    if (
                        hoverUnit &&
                        !GridMath.isPositionWithinGrid(this.sc_sceneSettings.getGridSettings(), hoverUnit.getPosition())
                    ) {
                        this.sc_hoverUnitNameStr = hoverUnit.getName();
                        this.sc_hoverUnitLevel = hoverUnit.getLevel();
                        this.sc_hoverUnitMovementType = hoverUnit.getMovementType();
                        this.sc_selectedAttackType = hoverUnit.getAttackType();
                        this.sc_hoverTextUpdateNeeded = true;
                    }
                }

                if (!this.isAllowedPreStartMousePosition(selectedUnit)) {
                    return;
                }

                if (selectedUnitProperties.size === 1) {
                    if (this.cellToUnitPreRound) {
                        const hoverUnit = this.cellToUnitPreRound.get(cellKey);
                        if (!hoverUnit) {
                            this.hoverSelectedCells = [mouseCell];
                            if (this.grid.areAllCellsEmpty(this.hoverSelectedCells)) {
                                this.hoverSelectedCellsSwitchToRed = false;
                            } else {
                                this.hoverSelectedCellsSwitchToRed = true;
                            }
                            return;
                        }

                        if (hoverUnit.getId() === selectedUnitProperties.id) {
                            if (
                                GridMath.isPositionWithinGrid(
                                    this.sc_sceneSettings.getGridSettings(),
                                    hoverUnit.getPosition(),
                                )
                            ) {
                                this.hoverActivePath = this.pathHelper.getMovePath(
                                    hoverUnit.getBaseCell(),
                                    this.gridMatrix,
                                    hoverUnit.getSteps(),
                                    undefined,
                                    hoverUnit.canFly(),
                                    hoverUnit.isSmallSize(),
                                ).cells;
                                this.hoverUnit = hoverUnit;
                            }

                            this.fillActiveAuraRanges(
                                hoverUnit.isSmallSize(),
                                hoverUnit.getPosition(),
                                hoverUnit.getAuraRanges(),
                                hoverUnit.getAuraIsBuff(),
                                true,
                            );
                            this.hoverActiveShotRange = {
                                xy: hoverUnit.getPosition(),
                                distance: hoverUnit.getRangeShotDistance() * STEP,
                            };
                            return;
                        }

                        if (this.unitIdToCellsPreRound && !hoverUnit.isSmallSize()) {
                            this.hoverSelectedCells = this.unitIdToCellsPreRound.get(hoverUnit.getId());
                            this.hoverSelectedCellsSwitchToRed = false;

                            if (
                                GridMath.isPositionWithinGrid(
                                    this.sc_sceneSettings.getGridSettings(),
                                    hoverUnit.getPosition(),
                                )
                            ) {
                                this.hoverActivePath = this.pathHelper.getMovePath(
                                    hoverUnit.getBaseCell(),
                                    this.gridMatrix,
                                    hoverUnit.getSteps(),
                                    undefined,
                                    hoverUnit.canFly(),
                                    hoverUnit.isSmallSize(),
                                ).cells;
                                this.hoverUnit = hoverUnit;
                            }

                            this.fillActiveAuraRanges(
                                hoverUnit.isSmallSize(),
                                hoverUnit.getPosition(),
                                hoverUnit.getAuraRanges(),
                                hoverUnit.getAuraIsBuff(),
                                true,
                            );
                            this.hoverActiveShotRange = {
                                xy: hoverUnit.getPosition(),
                                distance: hoverUnit.getRangeShotDistance() * STEP,
                            };
                            return;
                        }

                        this.hoverSelectedCells = [mouseCell];
                        this.hoverSelectedCellsSwitchToRed = false;
                        if (
                            GridMath.isPositionWithinGrid(
                                this.sc_sceneSettings.getGridSettings(),
                                hoverUnit.getPosition(),
                            )
                        ) {
                            this.hoverActivePath = this.pathHelper.getMovePath(
                                hoverUnit.getBaseCell(),
                                this.gridMatrix,
                                hoverUnit.getSteps(),
                                undefined,
                                hoverUnit.canFly(),
                                hoverUnit.isSmallSize(),
                            ).cells;
                            this.hoverUnit = hoverUnit;
                        }

                        this.fillActiveAuraRanges(
                            hoverUnit.isSmallSize(),
                            hoverUnit.getPosition(),
                            hoverUnit.getAuraRanges(),
                            hoverUnit.getAuraIsBuff(),
                            true,
                        );

                        this.hoverActiveShotRange = {
                            xy: hoverUnit.getPosition(),
                            distance: hoverUnit.getRangeShotDistance() * STEP,
                        };
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
                        return;
                    }

                    if (unit.getId() === selectedUnitProperties.id) {
                        if (
                            GridMath.isPositionWithinGrid(this.sc_sceneSettings.getGridSettings(), unit.getPosition())
                        ) {
                            this.hoverActivePath = this.pathHelper.getMovePath(
                                unit.getBaseCell(),
                                this.gridMatrix,
                                unit.getSteps(),
                                undefined,
                                unit.canFly(),
                                unit.isSmallSize(),
                            ).cells;
                            this.hoverUnit = unit;
                        }
                        this.fillActiveAuraRanges(
                            unit.isSmallSize(),
                            unit.getPosition(),
                            unit.getAuraRanges(),
                            unit.getAuraIsBuff(),
                            true,
                        );
                        this.hoverActiveShotRange = {
                            xy: unit.getPosition(),
                            distance: unit.getRangeShotDistance() * STEP,
                        };
                        return;
                    }

                    if (this.unitIdToCellsPreRound) {
                        if (
                            GridMath.isPositionWithinGrid(this.sc_sceneSettings.getGridSettings(), unit.getPosition())
                        ) {
                            this.hoverActivePath = this.pathHelper.getMovePath(
                                unit.getBaseCell(),
                                this.gridMatrix,
                                unit.getSteps(),
                                undefined,
                                unit.canFly(),
                                unit.isSmallSize(),
                            ).cells;
                            this.hoverUnit = unit;
                        }

                        this.fillActiveAuraRanges(
                            unit.isSmallSize(),
                            unit.getPosition(),
                            unit.getAuraRanges(),
                            unit.getAuraIsBuff(),
                            true,
                        );

                        if (unit.isSmallSize()) {
                            this.hoverSelectedCells = [mouseCell];
                            this.hoverSelectedCellsSwitchToRed = false;
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
            } else if (this.cellToUnitPreRound && this.unitIdToCellsPreRound) {
                const unit = this.cellToUnitPreRound.get(cellKey);
                if (unit) {
                    if (!GridMath.isPositionWithinGrid(this.sc_sceneSettings.getGridSettings(), unit.getPosition())) {
                        this.sc_hoverUnitNameStr = unit.getName();
                        this.sc_hoverUnitLevel = unit.getLevel();
                        this.sc_hoverUnitMovementType = unit.getMovementType();
                        this.sc_selectedAttackType = unit.getAttackType();
                        this.sc_hoverTextUpdateNeeded = true;
                    } else {
                        this.hoverActivePath = this.pathHelper.getMovePath(
                            unit.getBaseCell(),
                            this.gridMatrix,
                            unit.getSteps(),
                            undefined,
                            unit.canFly(),
                            unit.isSmallSize(),
                        ).cells;
                        this.hoverUnit = unit;
                    }

                    this.fillActiveAuraRanges(
                        unit.isSmallSize(),
                        unit.getPosition(),
                        unit.getAuraRanges(),
                        unit.getAuraIsBuff(),
                        true,
                    );

                    this.hoverActiveShotRange = {
                        xy: unit.getPosition(),
                        distance: unit.getRangeShotDistance() * STEP,
                    };

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
        } else {
            this.resetHover();
        }
    }

    public getViewportSize(): XY {
        return {
            x: g_camera.getWidth(),
            y: g_camera.getHeight(),
        };
    }

    public getNumberOfUnitsAvailableForPlacement(teamType: TeamType): number {
        return FightStateManager.getInstance().getFightProperties().getNumberOfUnitsAvailableForPlacement(teamType);
    }

    protected isAllowedPreStartMousePosition(unit: Unit, checkUnitSize = false): boolean {
        if (!checkUnitSize || unit.isSmallSize()) {
            const lowerLeftPlacement = this.getPlacement(TeamType.LOWER, 0);
            const upperRightPlacement = this.getPlacement(TeamType.UPPER, 0);

            if (!lowerLeftPlacement || !upperRightPlacement) {
                return false;
            }

            const lowerRightPlacement = this.getPlacement(TeamType.LOWER, 1);
            const upperLeftPlacement = this.getPlacement(TeamType.UPPER, 1);

            const isAllowed =
                ((unit.getTeam() === TeamType.LOWER &&
                    ((lowerLeftPlacement.isAllowed(this.sc_mouseWorld) ?? false) ||
                        (this.lowerPlacements[1]?.isAllowed(this.sc_mouseWorld) ?? false))) ||
                    (unit.getTeam() === TeamType.UPPER &&
                        ((upperRightPlacement.isAllowed(this.sc_mouseWorld) ?? false) ||
                            (this.upperPlacements[1]?.isAllowed(this.sc_mouseWorld) ?? false)))) &&
                (this.unitsHolder.getAllAlliesPlaced(
                    unit.getTeam(),
                    lowerLeftPlacement,
                    upperRightPlacement,
                    lowerRightPlacement,
                    upperLeftPlacement,
                ).length <
                    FightStateManager.getInstance()
                        .getFightProperties()
                        .getNumberOfUnitsAvailableForPlacement(unit.getTeam()) ||
                    GridMath.isPositionWithinGrid(this.sc_sceneSettings.getGridSettings(), unit.getPosition()));
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
            this.hoverSelectedCells &&
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

        this.sc_mouseDropStep = this.sc_stepCount.getValue();
        const positionToDropTo = this.getPositionToDropTo(this.sc_selectedBody);

        if (positionToDropTo && !this.sc_isAIActive) {
            let castStarted = false;
            let moveInitiated = false;
            const cellIndices = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), positionToDropTo);
            if (FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
                if (this.sc_moveBlocked) {
                    castStarted = this.cast();
                    moveInitiated = true;
                } else {
                    const selectedUnitData = this.sc_selectedBody.GetUserData();
                    const selectedUnit = this.unitsHolder.getAllUnits().get(selectedUnitData.id);
                    if (
                        this.currentActiveKnownPaths?.get((cellIndices.x << 4) | cellIndices.y)?.length &&
                        selectedUnit
                    ) {
                        moveInitiated = this.moveHandler.applyMoveModifiers(
                            cellIndices,
                            FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                            selectedUnit,
                            this.currentActiveKnownPaths,
                        );
                    }
                }
            } else {
                moveInitiated = true;
            }

            if (!this.sc_moveBlocked || castStarted) {
                if (moveInitiated) {
                    if (!this.sc_sceneSettings.isDraggable()) {
                        this.sc_selectedBody.SetIsActive(false);
                    }
                    const selectedUnitData = this.sc_selectedBody.GetUserData();

                    const movePaths = this.currentActiveKnownPaths?.get((cellIndices.x << 4) | cellIndices.y);
                    const selectedUnit = this.unitsHolder.getAllUnits().get(selectedUnitData.id);
                    if (movePaths?.length && selectedUnit) {
                        const path = movePaths[0].route;
                        this.drawer.startMoveAnimation(this.sc_selectedBody, selectedUnit, path);
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
        this.unitsFactory.refreshBarFixturesForAllUnits(this.unitsHolder.getAllUnitsIterator());
    }

    protected landAttack(): boolean {
        if (!this.currentActiveSpell) {
            const meleeAttackResult = this.attackHandler.handleMeleeAttack(
                this.unitsHolder,
                this.drawer,
                this.grid,
                this.moveHandler,
                this.sc_damageForAnimation,
                this.currentActiveKnownPaths,
                this.currentActiveUnit,
                this.getHoverAttackUnit(),
                this.sc_selectedBody,
                this.hoverAttackFromCell,
            );
            if (meleeAttackResult.completed) {
                for (const uId of meleeAttackResult.unitIdsDied) {
                    if (this.unitsHolder.deleteUnitById(uId, true /* check for resurrection */)) {
                        const unitBody = this.unitsFactory.getUnitBody(uId);
                        if (unitBody) {
                            this.sc_world.DestroyBody(unitBody);
                        }
                        this.unitsFactory.deleteUnitBody(uId);
                    }
                }
                this.unitsFactory.refreshBarFixturesForAllUnits(this.unitsHolder.getAllUnitsIterator());
                this.resetHover();
                this.sc_damageStatsUpdateNeeded = true;
                this.finishTurn();
                return true;
            }
        }

        const rangeAttackResult = this.attackHandler.handleRangeAttack(
            this.unitsHolder,
            this.drawer,
            this.grid,
            this.hoverRangeAttackDivisors,
            this.rangeResponseAttackDivisor,
            this.sc_damageForAnimation,
            this.currentActiveUnit,
            this.hoverAttackUnits,
            this.rangeResponseUnits,
            this.hoverRangeAttackPosition,
            this.sc_isSelection,
        );
        if (rangeAttackResult.completed) {
            for (const uId of rangeAttackResult.unitIdsDied) {
                if (this.unitsHolder.deleteUnitById(uId, true /* check for resurrection */)) {
                    const unitBody = this.unitsFactory.getUnitBody(uId);
                    if (unitBody) {
                        this.sc_world.DestroyBody(unitBody);
                    }
                    this.unitsFactory.deleteUnitBody(uId);
                }
            }
            this.unitsFactory.refreshBarFixturesForAllUnits(this.unitsHolder.getAllUnitsIterator());
            this.resetHover();
            this.sc_damageStatsUpdateNeeded = true;
            this.finishTurn();
            return true;
        }

        const magicAttackResult = this.attackHandler.handleMagicAttack(
            this.gridMatrix,
            this.drawer,
            this.unitsHolder,
            this.unitsFactory,
            this.grid,
            this.currentActiveSpell,
            this.currentActiveUnit,
            this.hoverUnit,
            this.currentEnemiesCellsWithinMovementRange,
        );
        if (magicAttackResult.completed) {
            for (const uId of magicAttackResult.unitIdsDied) {
                if (this.unitsHolder.deleteUnitById(uId, true /* check for resurrection */)) {
                    const unitBody = this.unitsFactory.getUnitBody(uId);
                    if (unitBody) {
                        this.sc_world.DestroyBody(unitBody);
                    }
                    this.unitsFactory.deleteUnitBody(uId);
                }
            }
            this.unitsFactory.refreshBarFixturesForAllUnits(this.unitsHolder.getAllUnitsIterator());
            this.resetHover();
            this.finishTurn();
            return true;
        }
        this.cleanupHoverText();

        return false;
    }

    protected cleanupHoverText(): void {
        this.sc_attackDamageSpreadStr = "";
        this.sc_attackRangeDamageDivisorStr = "";
        this.sc_hoverUnitNameStr = "";
        this.sc_hoverInfoArr = [];
        this.sc_hoverTextUpdateNeeded = true;
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
        this.currentActiveSpell = undefined;
        this.currentEnemiesCellsWithinMovementRange = undefined;

        // handle units state
        this.hoverAttackUnits = undefined;
        this.hoverAttackFromCell = undefined;
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
            console.log(
                `Finished turn ${this.currentActiveUnit.getName()} lap ${FightStateManager.getInstance()
                    .getFightProperties()
                    .getCurrentLap()}`,
            );
        }
        this.currentActiveUnit = undefined;
        this.sc_selectedAttackType = AttackType.NO_TYPE;

        // refresh UI
        this.sc_renderSpellBookOverlay = false;
        this.adjustSpellBookSprite();
        this.unitsHolder.refreshStackPowerForAllUnits();
        this.unitsFactory.refreshBarFixturesForAllUnits(this.unitsHolder.getAllUnitsIterator());
    };

    protected verifyButtonsTrigger() {
        if (!this.sc_mouseWorld) {
            return;
        }

        const cell = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), this.sc_mouseWorld);
        if (!cell) {
            return;
        }

        if (!FightStateManager.getInstance().getFightProperties().hasFightStarted() && this.lifeButton.isHover(cell)) {
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
        } else if (this.hoveredSpell) {
            if (
                this.hoveredSpell.getSpellTargetType() === SpellTargetType.RANDOM_CLOSE_TO_CASTER ||
                this.hoveredSpell.getSpellTargetType() === SpellTargetType.ALL_FLYING ||
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
                            if (randomCell && this.unitsFactory.spawnSelected(unitToSummon, randomCell, true)) {
                                this.unitsHolder.refreshStackPowerForAllUnits();
                                this.unitsFactory.refreshBarFixturesForAllUnits(this.unitsHolder.getAllUnitsIterator());
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
                            this.unitsHolder.getAllEnemyUnitsBuffs(this.currentActiveUnit.getTeam()),
                            this.unitsHolder.getAllEnemyUnitsDebuffs(this.currentActiveUnit.getTeam()),
                            this.unitsHolder.getAllTeamUnitsMagicResist(this.currentActiveUnit.getTeam()),
                            this.unitsHolder.getAllEnemyUnitsMagicResist(this.currentActiveUnit.getTeam()),
                            this.unitsHolder.getAllTeamUnitsHp(this.currentActiveUnit.getTeam()),
                            this.unitsHolder.getAllTeamUnitsMaxHp(this.currentActiveUnit.getTeam()),
                            this.unitsHolder.getAllTeamUnitsCanFly(this.currentActiveUnit.getTeam()),
                            this.unitsHolder.getAllEnemyUnitsCanFly(this.currentActiveUnit.getTeam()),
                        )
                    ) {
                        if (this.hoveredSpell.getSpellTargetType() === SpellTargetType.ALL_FLYING) {
                            for (const u of this.unitsHolder.getAllAllies(this.currentActiveUnit.getTeam())) {
                                if (u.getMagicResist() === 100 || !u.canFly()) {
                                    continue;
                                }

                                if (!hasAlreadyAppliedSpell(u, this.hoveredSpell)) {
                                    u.applyBuff(
                                        this.hoveredSpell,
                                        undefined,
                                        undefined,
                                        u.getId() === this.currentActiveUnit.getId(),
                                    );
                                }
                            }

                            for (const u of this.unitsHolder.getAllEnemyUnits(this.currentActiveUnit.getTeam())) {
                                if (u.getMagicResist() === 100 || !u.canFly()) {
                                    continue;
                                }

                                if (!hasAlreadyAppliedSpell(u, this.hoveredSpell)) {
                                    u.applyBuff(
                                        this.hoveredSpell,
                                        undefined,
                                        undefined,
                                        u.getId() === this.currentActiveUnit.getId(),
                                    );
                                }
                            }
                        } else if (this.hoveredSpell.getSpellTargetType() === SpellTargetType.ALL_ALLIES) {
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
                                    if (u.canBeHealed()) {
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
                                    }
                                } else {
                                    if (!hasAlreadyAppliedSpell(u, this.hoveredSpell)) {
                                        if (this.hoveredSpell.getMultiplierType() === SpellMultiplierType.UNIT_AMOUNT) {
                                            const newSpell = new Spell({
                                                spellProperties: this.hoveredSpell.getSpellProperties(),
                                                amount: this.hoveredSpell.getAmount(),
                                            });
                                            newSpell.setPower(this.currentActiveUnit.getAmountAlive());
                                            const infoArr: string[] = [];

                                            for (const descStr of this.hoveredSpell.getDesc()) {
                                                infoArr.push(
                                                    descStr.replace(
                                                        /\{\}/g,
                                                        (this.hoveredSpell.getMultiplierType() ===
                                                        SpellMultiplierType.UNIT_AMOUNT
                                                            ? this.currentActiveUnit.getAmountAlive()
                                                            : this.currentActiveUnit.getAmountAlive() *
                                                              this.hoveredSpell.getPower()
                                                        ).toString(),
                                                    ),
                                                );
                                            }
                                            newSpell.setDesc(infoArr);

                                            u.applyBuff(
                                                newSpell,
                                                undefined,
                                                undefined,
                                                u.getId() === this.currentActiveUnit.getId(),
                                            );
                                        } else {
                                            u.applyBuff(
                                                this.hoveredSpell,
                                                undefined,
                                                undefined,
                                                u.getId() === this.currentActiveUnit.getId(),
                                            );
                                        }
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

                                if (
                                    !hasAlreadyAppliedSpell(debuffTarget, this.hoveredSpell) &&
                                    !(
                                        this.hoveredSpell.getPowerType() === SpellPowerType.MIND &&
                                        debuffTarget.hasMindAttackResistance()
                                    )
                                ) {
                                    const laps = this.hoveredSpell.getLapsTotal();
                                    debuffTarget.applyDebuff(
                                        this.hoveredSpell,
                                        undefined,
                                        undefined,
                                        debuffTarget.getId() === this.currentActiveUnit.getId(),
                                    );
                                    if (
                                        isMirrored(debuffTarget) &&
                                        !hasAlreadyAppliedSpell(this.currentActiveUnit, this.hoveredSpell) &&
                                        !(
                                            this.hoveredSpell.getPowerType() === SpellPowerType.MIND &&
                                            this.currentActiveUnit.hasMindAttackResistance()
                                        )
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
                        this.unitsFactory.refreshBarFixturesForAllUnits(this.unitsHolder.getAllUnitsIterator());
                        this.finishTurn();
                    } else {
                        this.currentActiveSpell = undefined;
                    }
                }
            } else {
                this.currentActiveSpell = this.hoveredSpell;
                if (this.currentActiveUnit) {
                    const currentCell = GridMath.getCellForPosition(
                        this.sc_sceneSettings.getGridSettings(),
                        this.currentActiveUnit.getPosition(),
                    );
                    if (currentCell) {
                        this.updateCurrentMovePath(currentCell);
                    }

                    if (
                        this.currentActiveUnit.getAttackTypeSelection() !== AttackType.MAGIC &&
                        this.currentActiveSpell
                    ) {
                        this.selectAttack(AttackType.MAGIC, true);
                        // this.currentActiveUnitSwitchedAttackAuto = true;
                        this.switchToSelectedAttackType = undefined;
                        console.log("Switch to MAGIC");
                    }

                    if (
                        currentCell &&
                        this.currentActiveSpell &&
                        this.currentActiveSpell.getSpellTargetType() === SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE
                    ) {
                        const movementCells = this.pathHelper.getMovePath(
                            currentCell,
                            this.grid.getMatrixNoUnits(),
                            this.currentActiveUnit.getSteps(),
                            undefined,
                            this.currentActiveUnit.canFly(),
                            this.currentActiveUnit.isSmallSize(),
                        ).cells;
                        for (const c of movementCells) {
                            const possibleEnemyId = this.grid.getOccupantUnitId(c);
                            if (!possibleEnemyId) {
                                continue;
                            }

                            const possibleEnemyUnit = this.unitsHolder.getAllUnits().get(possibleEnemyId);
                            if (
                                !possibleEnemyUnit ||
                                possibleEnemyUnit.getTeam() === this.currentActiveUnit.getTeam() ||
                                !possibleEnemyUnit.isSmallSize()
                            ) {
                                continue;
                            }

                            const enemyBaseCell = possibleEnemyUnit.getBaseCell();
                            if (!this.currentEnemiesCellsWithinMovementRange) {
                                this.currentEnemiesCellsWithinMovementRange = [];
                            }
                            this.currentEnemiesCellsWithinMovementRange.push(enemyBaseCell);
                        }
                    } else {
                        this.currentEnemiesCellsWithinMovementRange = undefined;
                    }
                }
            }
            this.sc_renderSpellBookOverlay = false;
            this.adjustSpellBookSprite();
            this.hoveredSpell = undefined;
        }
    }

    protected adjustSpellBookSprite(): void {
        if (this.currentActiveSpell) {
            this.spellBookButton.customSpriteName = SpellHelper.spellToTextureNames(
                this.currentActiveSpell.getName(),
            )[0];
        } else {
            this.spellBookButton.customSpriteName = undefined;
        }
        this.refreshButtons(true);
    }

    protected cleanActivePaths(): void {
        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.currentActivePathHashes = undefined;
    }

    protected finishFight(unitsLower?: Unit[], unitsUpper?: Unit[]): void {
        this.canAttackByMeleeTargets = undefined;
        let result = "Draw!";
        if (unitsUpper?.length && !unitsLower?.length) {
            result = "Red team wins!";
        } else if (!unitsUpper?.length && unitsLower?.length) {
            result = "Green team wins!";
        }
        FightStateManager.getInstance().getFightProperties().finishFight();
        this.cleanActivePaths();
        this.sc_sceneLog.updateLog(`Fight finished! ${result}`);
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
                    // this.currentActiveUnit = undefined;
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
                    this.currentActiveUnit.setPosition(positionToDropTo.x, positionToDropTo.y);
                }

                this.finishTurn();
            } else if (GridMath.isPositionWithinGrid(this.sc_sceneSettings.getGridSettings(), positionToDropTo)) {
                const unitStats = this.sc_selectedBody.GetUserData();
                if (unitStats) {
                    let refreshUnitPosition = false;

                    if (unitStats.size === 1) {
                        const cell = GridMath.getCellForPosition(
                            this.sc_sceneSettings.getGridSettings(),
                            positionToDropTo,
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
                            GridMath.getCellsAroundPosition(this.sc_sceneSettings.getGridSettings(), positionToDropTo),
                            unitStats.id,
                            unitStats.team,
                            unitStats.attack_range,
                        );
                    }
                    const unit = this.unitsHolder.getAllUnits().get(unitStats.id);
                    if (unit && refreshUnitPosition) {
                        this.sc_selectedBody.SetTransformXY(
                            positionToDropTo.x,
                            positionToDropTo.y,
                            this.sc_selectedBody.GetAngle(),
                        );

                        unit.setPosition(positionToDropTo.x, positionToDropTo.y);
                        this.applyAugments(unit, false, true);
                        this.refreshUnits();
                    }
                }
            } else {
                const unitStats = this.sc_selectedBody.GetUserData();
                const preStartUnitCell = GridMath.getCellForPosition(
                    this.sc_sceneSettings.getGridSettings(),
                    positionToDropTo,
                );

                if (preStartUnitCell) {
                    const cellKey = `${preStartUnitCell.x}:${preStartUnitCell.y}`;
                    if (
                        unitStats &&
                        (!this.cellToUnitPreRound?.has(cellKey) ||
                            this.cellToUnitPreRound?.get(cellKey)?.getId() === unitStats.id)
                    ) {
                        this.sc_selectedBody.SetTransformXY(
                            positionToDropTo.x,
                            positionToDropTo.y,
                            this.sc_selectedBody.GetAngle(),
                        );

                        this.grid.cleanupAll(unitStats.id, unitStats.attack_range, unitStats.size === 1);
                        const unit = this.unitsHolder.getAllUnits().get(unitStats.id);
                        if (unit) {
                            unit.setPosition(positionToDropTo.x, positionToDropTo.y);
                            this.applyAugments(unit, false, true);
                            this.refreshUnits();
                        }
                    }
                }
            }
            this.unitsHolder.refreshStackPowerForAllUnits();
            this.unitsFactory.refreshBarFixturesForAllUnits(this.unitsHolder.getAllUnitsIterator());
        } else {
            this.finishFight();
        }

        // this.currentActiveUnit = undefined;
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

    private selectAttack(selectedAttackType: AttackType, force = false): boolean {
        // console.log(`SELECT ATTACK ${selectedAttackType}`);
        if (!this.currentActiveUnit) {
            return false;
        }

        let hasOption = true;
        const isRange = this.currentActiveUnit.getAttackType() === AttackType.RANGE;
        const isMagic = this.currentActiveUnit.getCanCastSpells() && this.currentActiveUnit.getSpellsCount() > 0;

        if (isRange || isMagic) {
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
                    this.currentActiveSpell = undefined;
                    this.adjustSpellBookSprite();
                }
                this.sc_selectedAttackType = this.currentActiveUnit.getAttackTypeSelection();
            }
        }

        if (hasOption && (this.currentActiveUnit.getAttackType() === AttackType.RANGE || isMagic)) {
            if (this.switchToSelectedAttackType) {
                if (force) {
                    if (this.currentActiveUnit.selectAttackType(this.switchToSelectedAttackType)) {
                        this.refreshButtons(true);
                    }
                    if (this.switchToSelectedAttackType !== AttackType.MAGIC) {
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
                    this.switchToSelectedAttackType = undefined;
                }
            } else {
                this.switchToSelectedAttackType = selectedAttackType;
            }

            if (this.switchToSelectedAttackType) {
                if (this.currentActiveUnit.selectAttackType(this.switchToSelectedAttackType)) {
                    this.refreshButtons(true);
                    return true;
                }
            }

            if (this.currentActiveUnit.hasAbilityActive("Area Throw") || !this.currentActiveSpell) {
                if (
                    this.currentActiveUnit.getAttackTypeSelection() === AttackType.MELEE ||
                    this.currentActiveUnit.getAttackTypeSelection() === AttackType.MELEE_MAGIC
                ) {
                    const currentCell = GridMath.getCellForPosition(
                        this.sc_sceneSettings.getGridSettings(),
                        this.currentActiveUnit.getPosition(),
                    );
                    if (currentCell) {
                        this.updateCurrentMovePath(currentCell);
                    }
                } else if (
                    this.currentActiveUnit.getAttackTypeSelection() === AttackType.RANGE &&
                    this.currentActiveUnit.hasAbilityActive("Area Throw")
                ) {
                    this.cleanActivePaths();
                }
            }

            this.sc_selectedAttackType = this.currentActiveUnit.getAttackTypeSelection();
            this.refreshButtons(true);
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

        if (
            this.currentActiveUnit.canMove() &&
            this.currentActiveSpell?.getSpellTargetType() !== SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE
        ) {
            const movePath = this.pathHelper.getMovePath(
                currentCell,
                this.gridMatrix,
                this.currentActiveUnit.getSteps(),
                this.grid.getAggrMatrixByTeam(this.currentActiveUnit.getOppositeTeam()),
                this.currentActiveUnit.canFly(),
                this.currentActiveUnit.isSmallSize(),
            );
            this.currentActivePath = movePath.cells;
            this.currentActiveKnownPaths = movePath.knownPaths;
            this.currentActivePathHashes = movePath.hashes;
        } else {
            this.cleanActivePaths();
        }
    }

    protected applyAugments(unit: Unit, skipSelection = false, force = false): void {
        const augmentArmor = FightStateManager.getInstance().getFightProperties().getAugmentArmor(unit.getTeam());
        const augmentArmorPower = Augment.getArmorPower(augmentArmor);
        unit.deleteBuff("Armor Augment");
        let anyAugmentApplied = false;
        if (
            augmentArmor &&
            GridMath.isPositionWithinGrid(this.sc_sceneSettings.getGridSettings(), unit.getPosition())
        ) {
            const augmentArmorBuff = new Spell({
                spellProperties: HoCConfig.getSpellConfig(
                    FactionType.NO_TYPE,
                    "Armor Augment",
                    HoCConstants.NUMBER_OF_LAPS_TOTAL,
                ),
                amount: 1,
            });
            const infoArr: string[] = [];
            for (const descStr of augmentArmorBuff.getDesc()) {
                infoArr.push(
                    descStr.replace(/\{\}/g, augmentArmorPower.toString()).replace(/\[\]/g, augmentArmor.toString()),
                );
            }
            augmentArmorBuff.setDesc(infoArr);
            augmentArmorBuff.setPower(augmentArmorPower);
            unit.applyBuff(augmentArmorBuff);
            anyAugmentApplied = true;
        }

        const augmentMight = FightStateManager.getInstance().getFightProperties().getAugmentMight(unit.getTeam());
        const augmentMightPower = Augment.getMightPower(augmentMight);
        unit.deleteBuff("Might Augment");
        if (
            augmentMight &&
            unit.getAttackType() !== AttackType.RANGE &&
            GridMath.isPositionWithinGrid(this.sc_sceneSettings.getGridSettings(), unit.getPosition())
        ) {
            const augmentMightBuff = new Spell({
                spellProperties: HoCConfig.getSpellConfig(
                    FactionType.NO_TYPE,
                    "Might Augment",
                    HoCConstants.NUMBER_OF_LAPS_TOTAL,
                ),
                amount: 1,
            });
            const infoArr: string[] = [];
            for (const descStr of augmentMightBuff.getDesc()) {
                infoArr.push(
                    descStr.replace(/\{\}/g, augmentMightPower.toString()).replace(/\[\]/g, augmentMight.toString()),
                );
            }
            augmentMightBuff.setDesc(infoArr);
            augmentMightBuff.setPower(augmentMightPower);
            unit.applyBuff(augmentMightBuff);
            anyAugmentApplied = true;
        }

        const augmentSniper = FightStateManager.getInstance().getFightProperties().getAugmentSniper(unit.getTeam());
        const augmentSniperPower = Augment.getSniperPower(augmentSniper);
        unit.deleteBuff("Sniper Augment");
        if (
            augmentSniper &&
            unit.getAttackType() === AttackType.RANGE &&
            GridMath.isPositionWithinGrid(this.sc_sceneSettings.getGridSettings(), unit.getPosition())
        ) {
            const augmentSniperBuff = new Spell({
                spellProperties: HoCConfig.getSpellConfig(
                    FactionType.NO_TYPE,
                    "Sniper Augment",
                    HoCConstants.NUMBER_OF_LAPS_TOTAL,
                ),
                amount: 1,
            });
            const infoArr: string[] = [];
            for (const descStr of augmentSniperBuff.getDesc()) {
                infoArr.push(
                    descStr
                        .replace(/\{\}/, augmentSniperPower[0].toString())
                        .replace(/\{\}/, augmentSniperPower[1].toString())
                        .replace(/\[\]/g, augmentSniper.toString()),
                );
            }
            augmentSniperBuff.setDesc(infoArr);
            augmentSniperBuff.setPower(augmentSniperPower[0]);
            unit.applyBuff(augmentSniperBuff, augmentSniperPower[0], augmentSniperPower[1]);
            anyAugmentApplied = true;
        }

        const augmentMovement = FightStateManager.getInstance().getFightProperties().getAugmentMovement(unit.getTeam());
        const augmentMovementPower = Augment.getMovementPower(augmentMovement);
        unit.deleteBuff("Movement Augment");
        if (
            augmentMovement &&
            GridMath.isPositionWithinGrid(this.sc_sceneSettings.getGridSettings(), unit.getPosition())
        ) {
            const augmentMovementBuff = new Spell({
                spellProperties: HoCConfig.getSpellConfig(
                    FactionType.NO_TYPE,
                    "Movement Augment",
                    HoCConstants.NUMBER_OF_LAPS_TOTAL,
                ),
                amount: 1,
            });
            const infoArr: string[] = [];
            for (const descStr of augmentMovementBuff.getDesc()) {
                infoArr.push(
                    descStr
                        .replace(/\{\}/g, augmentMovementPower.toString())
                        .replace(/\[\]/g, augmentMovement.toString()),
                );
            }
            augmentMovementBuff.setDesc(infoArr);
            augmentMovementBuff.setPower(augmentMovementPower);
            unit.applyBuff(augmentMovementBuff);
            anyAugmentApplied = true;
        }

        if (
            (force || (anyAugmentApplied && !skipSelection)) &&
            this.sc_selectedBody &&
            this.sc_selectedBody.GetUserData().id === unit.getId()
        ) {
            this.refreshUnits();
            this.setSelectedUnitProperties(unit.getAllProperties());
            this.sc_unitPropertiesUpdateNeeded = true;
            if (unit.getRangeShotDistance()) {
                this.sc_currentActiveShotRange = {
                    xy: unit.getPosition(),
                    distance: unit.getRangeShotDistance() * STEP,
                };
            }
        }
    }

    public refreshUnits(): void {
        this.unitsHolder.refreshAuraEffectsForAllUnits();
        this.unitsHolder.refreshStackPowerForAllUnits();
        // need to call it twice to make sure aura effects are applied
        this.unitsHolder.refreshAuraEffectsForAllUnits();
        this.unitsHolder.refreshStackPowerForAllUnits();
        this.unitsFactory.refreshBarFixturesForAllUnits(this.unitsHolder.getAllUnitsIterator());
    }

    public Step(settings: Settings, timeStep: number): number {
        this.sc_isAnimating = this.drawer.isAnimating();
        if (this.sc_isAnimating) {
            this.cleanupHoverText();
        }
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

        this.drawer.animate(this.sc_fps);
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
                    if (this.sc_augmentChanged) {
                        this.applyAugments(unit, false, true);
                    }

                    this.moveHandler.updateLargeUnitsCache(bodyPosition);

                    if (FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
                        if (unit) {
                            if (unitStats.team === TeamType.UPPER) {
                                if (
                                    (this.upperPlacements[0]?.isAllowed(bodyPosition) ?? false) ||
                                    (this.upperPlacements[1]?.isAllowed(bodyPosition) ?? false) ||
                                    fightProperties.getFirstTurnMade()
                                ) {
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
                                } else if (
                                    this.unitsHolder.deleteUnitIfNotAllowed(
                                        TeamType.UPPER,
                                        TeamType.LOWER,
                                        unitStats,
                                        b.GetPosition(),
                                        this.getPlacement(TeamType.LOWER, 0),
                                        this.getPlacement(TeamType.UPPER, 0),
                                        this.getPlacement(TeamType.LOWER, 1),
                                        this.getPlacement(TeamType.UPPER, 1),
                                    )
                                ) {
                                    this.sc_world.DestroyBody(b);
                                    this.unitsFactory.deleteUnitBody(unitStats.id);
                                }
                            } else if (
                                (this.lowerPlacements[0]?.isAllowed(bodyPosition) ?? false) ||
                                (this.lowerPlacements[1]?.isAllowed(bodyPosition) ?? false) ||
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
                                    unit.setResponded(false);
                                    unit.setOnHourglass(false);
                                    unit.applyMoraleStepsModifier(
                                        FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                                    );
                                }

                                if (allUnitsMadeTurn && !fightProperties.hasAlreadyMadeTurn(unit.getId())) {
                                    allUnitsMadeTurn = false;
                                }
                            } else if (
                                this.unitsHolder.deleteUnitIfNotAllowed(
                                    TeamType.LOWER,
                                    TeamType.UPPER,
                                    unitStats,
                                    b.GetPosition(),
                                    this.getPlacement(TeamType.LOWER, 0),
                                    this.getPlacement(TeamType.UPPER, 0),
                                    this.getPlacement(TeamType.LOWER, 1),
                                    this.getPlacement(TeamType.UPPER, 1),
                                )
                            ) {
                                this.sc_world.DestroyBody(b);
                                this.unitsFactory.deleteUnitBody(unitStats.id);
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

            this.sc_augmentChanged = false;

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
                if (FightStateManager.getInstance().getFightProperties().isTimeToDryCenter()) {
                    this.drawer.switchToDryCenter();
                    this.grid.cleanupCenterObstacle();
                }
                this.armageddonWave = FightStateManager.getInstance().getFightProperties().getArmageddonWave();

                if (FightStateManager.getInstance().getFightProperties().isNarrowingLap()) {
                    // can generate logs on destroy events
                    this.sc_sceneLog.updateLog(this.spawnObstacles());
                    FightStateManager.getInstance().getFightProperties().increaseStepsMoraleMultiplier();
                }

                let gotArmageddonKills = false;
                if (this.armageddonWave) {
                    const unitsForAllTeams = this.unitsHolder.refreshUnitsForAllTeams();
                    unitsLower = unitsForAllTeams[TeamType.LOWER - 1];
                    unitsUpper = unitsForAllTeams[TeamType.UPPER - 1];
                    this.unitsHolder.refreshStackPowerForAllUnits();
                    this.unitsFactory.refreshBarFixturesForAllUnits(this.unitsHolder.getAllUnitsIterator());

                    if (!unitsLower?.length || !unitsUpper?.length) {
                        fightFinished = true;
                        this.finishFight(unitsLower, unitsUpper);
                        this.sc_isAIActive = false;
                        this.refreshButtons();
                    } else {
                        if (unitsLower) {
                            for (const ul of unitsLower) {
                                ul.applyArmageddonDamage(this.armageddonWave, this.sc_sceneLog);
                                if (ul.isDead()) {
                                    gotArmageddonKills = true;
                                    this.sc_sceneLog.updateLog(`${ul.getName()} died`);
                                    if (this.unitsHolder.deleteUnitById(ul.getId(), this.armageddonWave === 1)) {
                                        const unitBody = this.unitsFactory.getUnitBody(ul.getId());
                                        if (unitBody) {
                                            this.sc_world.DestroyBody(unitBody);
                                        }
                                        this.unitsFactory.deleteUnitBody(ul.getId());
                                    }
                                }
                            }
                        }

                        if (unitsUpper) {
                            for (const uu of unitsUpper) {
                                uu.applyArmageddonDamage(this.armageddonWave, this.sc_sceneLog);
                                if (uu.isDead()) {
                                    gotArmageddonKills = true;
                                    this.sc_sceneLog.updateLog(`${uu.getName()} died`);
                                    if (this.unitsHolder.deleteUnitById(uu.getId(), this.armageddonWave === 1)) {
                                        const unitBody = this.unitsFactory.getUnitBody(uu.getId());
                                        if (unitBody) {
                                            this.sc_world.DestroyBody(unitBody);
                                        }
                                        this.unitsFactory.deleteUnitBody(uu.getId());
                                    }
                                }
                            }
                        }
                    }
                }

                if (gotArmageddonKills) {
                    const unitsForAllTeams = this.unitsHolder.refreshUnitsForAllTeams();
                    unitsLower = unitsForAllTeams[TeamType.LOWER - 1];
                    unitsUpper = unitsForAllTeams[TeamType.UPPER - 1];

                    if (!unitsLower?.length || !unitsUpper?.length) {
                        fightFinished = true;
                        this.finishFight(unitsLower, unitsUpper);
                        this.sc_isAIActive = false;
                        this.refreshButtons();
                    }
                }

                if (!fightFinished && FightStateManager.getInstance().getFightProperties().isNarrowingLap()) {
                    // spawn may actually delete units due to overlap with obstacles
                    // so we have to refresh all the units here
                    if (!gotArmageddonKills) {
                        const unitsForAllTeams = this.unitsHolder.refreshUnitsForAllTeams();
                        unitsLower = unitsForAllTeams[TeamType.LOWER - 1];
                        unitsUpper = unitsForAllTeams[TeamType.UPPER - 1];
                    }

                    this.unitsHolder.refreshStackPowerForAllUnits();
                    this.unitsFactory.refreshBarFixturesForAllUnits(this.unitsHolder.getAllUnitsIterator());
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
                        this.finishFight(unitsLower, unitsUpper);
                        fightFinished = true;
                        this.sc_isAIActive = false;
                        this.refreshButtons();
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
                                if (chance < Math.abs(u.getMorale()) && !u.hasMindAttackResistance()) {
                                    if (isPlusMorale) {
                                        const buff = new Spell({
                                            spellProperties: HoCConfig.getSpellConfig(FactionType.NO_TYPE, "Morale"),
                                            amount: 1,
                                        });
                                        u.applyBuff(buff);
                                        FightStateManager.getInstance()
                                            .getFightProperties()
                                            .enqueueMoralePlus(u.getId());
                                        this.sc_sceneLog.updateLog(`${u.getName()} is on Morale this lap!`);
                                    } else {
                                        const debuff = new Spell({
                                            spellProperties: HoCConfig.getSpellConfig(FactionType.NO_TYPE, "Dismorale"),
                                            amount: 1,
                                        });
                                        u.applyDebuff(debuff);
                                        FightStateManager.getInstance()
                                            .getFightProperties()
                                            .enqueueMoraleMinus(u.getId());
                                        this.sc_sceneLog.updateLog(`${u.getName()} is on Dismorale this lap!`);
                                    }
                                }
                            }
                        }

                        FightStateManager.getInstance().prefetchNextUnitsToTurn(
                            this.unitsHolder.getAllUnits(),
                            unitsUpper,
                            unitsLower,
                        );
                        this.refreshButtons();

                        const nextUnitId = FightStateManager.getInstance().getFightProperties().dequeueNextUnitId();
                        const nextUnit = nextUnitId ? this.unitsHolder.getAllUnits().get(nextUnitId) : undefined;

                        if (nextUnit) {
                            this.cleanupHoverText();
                            this.applyAugments(nextUnit, true);
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
                                this.currentActiveUnit = nextUnit as RenderableUnit;
                                this.refreshButtons(true);
                                this.sc_selectedAttackType = this.currentActiveUnit.getAttackTypeSelection();
                                this.currentActiveUnit.decreaseMorale(HoCConstants.MORALE_CHANGE_FOR_SKIP);
                                this.currentActiveUnit.applyMoraleStepsModifier(
                                    FightStateManager.getInstance().getFightProperties().getStepsMoraleMultiplier(),
                                );
                                this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} skip turn`);
                                this.finishTurn();
                            } else {
                                this.sc_moveBlocked = false;
                                this.refreshUnits();

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
                                    this.currentActiveUnit = nextUnit as RenderableUnit;
                                    this.refreshButtons(true);
                                    nextUnit.refreshPossibleAttackTypes(
                                        this.attackHandler.canLandRangeAttack(
                                            nextUnit,
                                            this.grid.getEnemyAggrMatrixByUnitId(nextUnit.getId()),
                                        ),
                                    );
                                    this.sc_selectedAttackType = this.currentActiveUnit.getAttackTypeSelection();
                                    this.currentActiveSpell = undefined;
                                    this.adjustSpellBookSprite();
                                    // this.currentActiveUnitSwitchedAttackAuto = false;
                                    // this.grid.print(nextUnit.getId());
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
                                                    this.hoverAttackFromCell,
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
                                        nextUnit.getAuraRanges(),
                                        nextUnit.getAuraIsBuff(),
                                    );
                                    FightStateManager.getInstance().getFightProperties().markFirstTurn();
                                }
                            }
                        } else {
                            this.finishFight(unitsLower, unitsUpper);
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
                    setTimeout(() => {
                        const wasAIActive = this.sc_isAIActive;
                        this.sc_isAIActive = true;
                        this.refreshButtons();
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
                if (u instanceof RenderableUnit) {
                    // Since u is a RenderableUnit, we can safely call render()
                    (u as RenderableUnit).render(this.sc_fps, this.sc_isAnimating, this.sc_sceneLog);
                }
                // u.render(this.sc_fps, this.sc_isAnimating, this.sc_sceneLog);
                if (
                    !upperAllowed &&
                    ((this.upperPlacements[0]?.isAllowed(u.getPosition()) ?? false) ||
                        (this.upperPlacements[1]?.isAllowed(u.getPosition()) ?? false))
                ) {
                    upperAllowed = true;
                }
                if (
                    !lowerAllowed &&
                    ((this.lowerPlacements[0]?.isAllowed(u.getPosition()) ?? false) ||
                        (this.lowerPlacements[1]?.isAllowed(u.getPosition()) ?? false))
                ) {
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
            const team = this.sc_selectedBody?.GetUserData()?.team;
            if (!team) {
                if (0 in this.lowerPlacements && this.lowerPlacements[0]) {
                    this.lowerPlacements[0].draw(settings.m_debugDraw);
                }
                if (0 in this.upperPlacements && this.upperPlacements[0]) {
                    this.upperPlacements[0].draw(settings.m_debugDraw);
                }
                if (1 in this.lowerPlacements && this.lowerPlacements[1]) {
                    this.lowerPlacements[1].draw(settings.m_debugDraw);
                }
                if (1 in this.upperPlacements && this.upperPlacements[1]) {
                    this.upperPlacements[1].draw(settings.m_debugDraw);
                }
            } else if (team === TeamType.LOWER) {
                if (0 in this.lowerPlacements && this.lowerPlacements[0]) {
                    this.lowerPlacements[0].draw(settings.m_debugDraw);
                }
                if (1 in this.lowerPlacements && this.lowerPlacements[1]) {
                    this.lowerPlacements[1].draw(settings.m_debugDraw);
                }
            } else if (team === TeamType.UPPER) {
                if (0 in this.upperPlacements && this.upperPlacements[0]) {
                    this.upperPlacements[0].draw(settings.m_debugDraw);
                }
                if (1 in this.upperPlacements && this.upperPlacements[1]) {
                    this.upperPlacements[1].draw(settings.m_debugDraw);
                }
            }
        } else {
            this.placementsCleanedUp = true;
        }

        const themeLightColor = isLightMode ? Drawer.COLOR_LIGHT_ORANGE : Drawer.COLOR_LIGHT_YELLOW;
        const themeMainColor = isLightMode ? Drawer.COLOR_GREY : Drawer.COLOR_LIGHT_GREY;

        const isEnemy =
            this.hoverUnit && this.currentActiveUnit && this.hoverUnit.getTeam() !== this.currentActiveUnit.getTeam();

        if (this.currentActivePath && this.currentActiveUnit) {
            let hoverAttackFromHashes: Set<number> | undefined;
            if (this.hoverAttackFromCell) {
                hoverAttackFromHashes = new Set();
                hoverAttackFromHashes.add((this.hoverAttackFromCell.x << 4) | this.hoverAttackFromCell.y);
                if (!this.currentActiveUnit.isSmallSize()) {
                    hoverAttackFromHashes.add(((this.hoverAttackFromCell.x - 1) << 4) | this.hoverAttackFromCell.y);
                    hoverAttackFromHashes.add(
                        ((this.hoverAttackFromCell.x - 1) << 4) | (this.hoverAttackFromCell.y - 1),
                    );
                    hoverAttackFromHashes.add((this.hoverAttackFromCell.x << 4) | (this.hoverAttackFromCell.y - 1));
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
                    undefined,
                    FightStateManager.getInstance().getFightProperties().hasFightStarted(),
                );
            }
        }

        if (this.sc_currentActiveAuraRanges.length && !this.sc_renderSpellBookOverlay) {
            for (const aura of this.sc_currentActiveAuraRanges) {
                const isBuff = aura.isBuff ?? true;
                if (aura.range) {
                    this.drawer.drawAuraArea(settings.m_debugDraw, aura.xy, aura.range, isBuff, aura.isSmallUnit);
                }
            }
        }
        if (this.hoverActiveAuraRanges.length && !this.sc_renderSpellBookOverlay) {
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
                    this.grid,
                    this.unitsHolder,
                    this.hoverAttackFromCell,
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
        } else if (hoverAttackUnit && this.currentActiveUnit?.hasAbilityActive("Skewer Strike")) {
            const targetPos = GridMath.getCellForPosition(
                this.sc_sceneSettings.getGridSettings(),
                hoverAttackUnit.getPosition(),
            );
            if (targetPos) {
                const targetList = nextStandingTargets(
                    this.currentActiveUnit,
                    hoverAttackUnit,
                    this.grid,
                    this.unitsHolder,
                    this.hoverAttackFromCell,
                    false,
                    true,
                );
                targetList.push(hoverAttackUnit);
                for (const target of targetList) {
                    this.drawer.drawAttackTo(settings.m_debugDraw, target.getPosition(), target.getSize());
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
                this.hoverAttackFromCell,
            )) {
                this.drawer.drawAttackTo(settings.m_debugDraw, enemy.getPosition(), enemy.getSize());
            }
        } else if (this.hoverAOECells?.length) {
            this.drawer.drawAOECells(settings.m_debugDraw, this.unitsHolder, this.hoverAOECells);
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

        if (!this.sc_renderSpellBookOverlay) {
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

        if (this.hoverAttackFromCell && !this.sc_renderSpellBookOverlay) {
            this.drawer.drawAttackFrom(
                settings.m_debugDraw,
                GridMath.getPositionForCell(
                    this.hoverAttackFromCell,
                    this.sc_sceneSettings.getGridSettings().getMinX(),
                    this.sc_sceneSettings.getGridSettings().getStep(),
                    this.sc_sceneSettings.getGridSettings().getHalfStep(),
                ),
                this.hoverAttackIsSmallSize !== undefined
                    ? this.hoverAttackIsSmallSize
                    : !!this.currentActiveUnit?.isSmallSize(),
            );
        }

        if (FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
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
                this.drawer.renderTerrainSpritesFront(isLightMode);
                if (this.currentEnemiesCellsWithinMovementRange && !this.hoverAttackUnits?.length) {
                    this.drawer.drawHighlightedCells(
                        settings.m_debugDraw,
                        isLightMode,
                        this.currentEnemiesCellsWithinMovementRange,
                    );
                }
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
