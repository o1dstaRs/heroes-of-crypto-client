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

import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { b2Body, b2BodyType, b2Color, b2EdgeShape, b2Fixture, b2Vec2, XY } from "@box2d/core";
import {
    FactionType,
    TeamType,
    AttackType,
    UnitProperties,
    Grid,
    GridSettings,
    GridConstants,
    GridMath,
    HoCMath,
    HoCLib,
} from "@heroesofcrypto/common";
import { Fight } from "@heroesofcrypto/common/src/generated/protobuf/v1/fight_pb";
import { StringList } from "@heroesofcrypto/common/src/generated/protobuf/v1/types_pb";

import { getAbilitiesWithPosisionCoefficient } from "../abilities/abilities";
import { AbilitiesFactory } from "../abilities/abilities_factory";
import { nextStandingTargets } from "../abilities/fire_breath_ability";
import { allEnemiesAroundLargeUnit } from "../abilities/lightning_spin_ability";
import { Drawer } from "../draw/drawer";
import { EffectsFactory } from "../effects/effects_factory";
import { AttackHandler, IAttackObstacle } from "../handlers/attack_handler";
import { MoveHandler } from "../handlers/move_handler";
import { Button } from "../menu/button";
import { Frame } from "../menu/frame";
import { ObstacleGenerator } from "../obstacles/obstacle_generator";
import { IWeightedRoute, PathHelper } from "../path/path_helper";
import { AIActionType, findTarget } from "../ai/ai";
import { PlacementType, SquarePlacement } from "../placement/square_placement";
import { Settings } from "../settings";
import { canBeCasted, Spell, SpellTargetType } from "../spells/spells";
import { SpellsFactory } from "../spells/spells_factory";
import { FightStateManager } from "../state/fight_state_manager";
import {
    FIGHT_BUTTONS_LEFT_POSITION_X,
    FIGHT_BUTTONS_RIGHT_POSITION_X,
    GRID_SIZE,
    HALF_STEP,
    MAX_X,
    MAX_Y,
    MIN_X,
    MIN_Y,
    MORALE_CHANGE_FOR_SHIELD_OR_CLOCK,
    MORALE_CHANGE_FOR_SKIP,
    MOVEMENT_DELTA,
    NO_VELOCITY,
    NUMBER_OF_LAPS_TILL_NARROWING_BLOCK,
    NUMBER_OF_LAPS_TILL_NARROWING_NORMAL,
    NUMBER_OF_LAPS_TILL_STOP_NARROWING,
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
import { GLScene } from "./gl_scene";
import { registerScene, SceneContext } from "./scene";
import { SceneSettings } from "./scene_settings";

const COLOR_ORANGE = new b2Color(0.909803921568627, 0.282352941176471, 0.203921568627451);
const COLOR_YELLOW = new b2Color(1, 0.952941176470588, 0.427450980392157);
const COLOR_GREY = new b2Color(0.5, 0.5, 0.5);
const COLOR_LIGHT_GREY = new b2Color(0.847058823529412, 0.847058823529412, 0.847058823529412);
const COLOR_LIGHT_ORANGE = new b2Color(0.968627450980392, 0.745098039215686, 0.427450980392157);
const COLOR_LIGHT_YELLOW = new b2Color(1, 1, 0.749019607843137);

class TestHeroes extends GLScene {
    private ground: b2Body;

    private placementsCleanedUp = false;

    private currentActiveUnit?: Unit;

    private currentActiveUnitSwitchedAttackAuto = false;

    private currentActivePath?: XY[];

    private currentActivePathHashes: Set<number> = new Set();

    private currentActiveKnownPaths?: Map<number, IWeightedRoute[]>;

    private currentActiveSpell?: Spell;

    private hoverActivePath?: XY[];

    private hoverActiveShotRange?: HoCMath.IXYDistance;

    private hoverRangeAttackLine?: b2Fixture;

    private hoverRangeAttackDivisor = 1;

    private hoverRangeAttackPoint?: XY;

    private hoverRangeAttackObstacle?: IAttackObstacle;

    private hoverAttackUnits?: Unit[];

    private hoverUnit?: Unit;

    private hoverAttackFrom?: XY;

    private hoverAttackIsSmallSize?: boolean;

    private hoverSelectedCells?: XY[];

    private hoverSelectedCellsSwitchToRed = false;

    private hoveredSpell?: Spell;

    private rangeResponseUnit?: Unit;

    private rangeResponseAttackDivisor = 1;

    private canAttackByMeleeTargets?: IAttackTargets;

    private cellToUnitPreRound?: Map<string, Unit>;

    private unitIdToCellsPreRound?: Map<string, XY[]>;

    private switchToSelectedAttackType?: AttackType;

    private gridMatrix: number[][];

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

    private readonly sendFightState: () => Promise<void>;

    public readonly gl: WebGLRenderingContext;

    public readonly shader: DefaultShader;

    public readonly background: Sprite;

    public readonly spellBookOverlay: Sprite;

    public readonly buffsFrame: Frame;

    public readonly debuffsFrame: Frame;

    public readonly abilitiesFrame: Frame;

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
            new SpellsFactory(this.gl, this.shader, this.digitNormalTextures, textures),
            new AbilitiesFactory(this.gl, this.shader, textures, new EffectsFactory(this.gl, this.shader, textures)),
        );
        this.unitsHolder = new UnitsHolder(this.sc_world, this.sc_sceneSettings.getGridSettings(), this.unitsFactory);

        this.ground = this.sc_world.CreateBody();
        this.grid = new Grid(GRID_SIZE, NUMBER_OF_LAPS_TILL_NARROWING_BLOCK, NUMBER_OF_LAPS_TILL_NARROWING_NORMAL);
        this.refreshVisibleStateIfNeeded();
        this.gridMatrix = this.grid.getMatrix();
        this.obstacleGenerator = new ObstacleGenerator(this.sc_world, textures);
        this.drawer = new Drawer(
            this.sc_sceneSettings.getGridSettings(),
            this.sc_world,
            this.gl,
            this.shader,
            this.textures,
            this.grid.getGridType(),
            this.obstacleGenerator,
        );

        this.lowerPlacement = new SquarePlacement(this.sc_sceneSettings.getGridSettings(), PlacementType.LOWER, 5);
        this.upperPlacement = new SquarePlacement(this.sc_sceneSettings.getGridSettings(), PlacementType.UPPER, 5);

        this.allowedPlacementCellHashes = new Set([
            ...this.lowerPlacement.possibleCellHashes(),
            ...this.upperPlacement.possibleCellHashes(),
        ]);

        this.background = new Sprite(gl, shader, this.textures.background_dark.texture);
        this.spellBookOverlay = new Sprite(gl, shader, this.textures.book_1024.texture);
        this.abilitiesFrame = new Frame(
            this.sc_sceneSettings.getGridSettings(),
            { x: this.sc_sceneSettings.getGridSettings().getMinX() - 576, y: 1470 },
            512,
            512,
            new Sprite(gl, shader, this.textures.frame_black_512.texture),
            new Sprite(gl, shader, this.textures.frame_black_512.texture),
            new Sprite(gl, shader, this.textures.abilities_white_font.texture),
            new Sprite(gl, shader, this.textures.abilities_white_font.texture),
        );
        this.buffsFrame = new Frame(
            this.sc_sceneSettings.getGridSettings(),
            { x: this.sc_sceneSettings.getGridSettings().getMinX() - 576, y: 958 },
            512,
            512,
            new Sprite(gl, shader, this.textures.frame_black_512.texture),
            new Sprite(gl, shader, this.textures.frame_black_512.texture),
            new Sprite(gl, shader, this.textures.buffs_white_font.texture),
            new Sprite(gl, shader, this.textures.buffs_white_font.texture),
        );
        this.debuffsFrame = new Frame(
            this.sc_sceneSettings.getGridSettings(),
            { x: this.sc_sceneSettings.getGridSettings().getMinX() - 576, y: 446 },
            512,
            512,
            new Sprite(gl, shader, this.textures.frame_black_512.texture),
            new Sprite(gl, shader, this.textures.frame_black_512.texture),
            new Sprite(gl, shader, this.textures.debuffs_white_font.texture),
            new Sprite(gl, shader, this.textures.debuffs_white_font.texture),
        );
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
        this.attackHandler = new AttackHandler(
            this.sc_world,
            this.sc_sceneSettings.getGridSettings(),
            this.sc_sceneLog,
        );
        this.moveHandler = new MoveHandler(this.sc_sceneSettings.getGridSettings(), this.grid, this.unitsHolder);

        // update remaining time every half a second
        this.visibleStateUpdate = () => {
            this.refreshVisibleStateIfNeeded();
            if (this.sc_visibleState) {
                const fightState = FightStateManager.getInstance().getFightState();
                this.sc_visibleState.secondsMax = (fightState.currentTurnEnd - fightState.currentTurnStart) / 1000;
                const remaining = (fightState.currentTurnEnd - HoCLib.getTimeMillis()) / 1000;
                this.sc_visibleState.secondsRemaining = remaining > 0 ? remaining : 0;
                this.sc_visibleStateUpdateNeeded = true;
            }
        };

        this.sendFightState = async () => {
            this.refreshVisibleStateIfNeeded();
            if (this.sc_visibleState) {
                const fightState = FightStateManager.getInstance().getFightState();

                const fight = new Fight();
                fight.setId(HoCLib.uuidToUint8Array(fightState.id));
                fight.setCurrentLap(fightState.currentLap);
                fight.setFirstTurnMade(fightState.firstTurnMade);
                fight.setFightFinished(fightState.fightFinished);
                fight.setPreviousTurnTeam(fightState.previousTurnTeam);
                fight.setHighestSpeedThisTurn(fightState.highestSpeedThisTurn);
                fight.setAlreadyMadeTurnList(Array.from(fightState.alreadyMadeTurn));
                const alreadyMadeTurnByUpperTeam = fightState.alreadyMadeTurnByTeam.get(TeamType.UPPER);
                const alreadyMadeTurnByLowerTeam = fightState.alreadyMadeTurnByTeam.get(TeamType.LOWER);
                const alreadyMadeTurnByUpperTeamList = new StringList();
                const alreadyMadeTurnByLowerTeamList = new StringList();
                if (alreadyMadeTurnByUpperTeam?.size) {
                    alreadyMadeTurnByUpperTeamList.setValuesList(Array.from(alreadyMadeTurnByUpperTeam));
                }
                if (alreadyMadeTurnByLowerTeam?.size) {
                    alreadyMadeTurnByLowerTeamList.setValuesList(Array.from(alreadyMadeTurnByLowerTeam));
                }
                const alreadyMadeTurnByTeamMap = fight.getAlreadyMadeTurnByTeamMap();
                alreadyMadeTurnByTeamMap.set(TeamType.UPPER, alreadyMadeTurnByUpperTeamList);
                alreadyMadeTurnByTeamMap.set(TeamType.LOWER, alreadyMadeTurnByLowerTeamList);
                fight.setAlreadyHourGlassList(Array.from(fightState.alreadyHourGlass));
                fight.setAlreadyRepliedAttackList(Array.from(fightState.alreadyRepliedAttack));
                const upperTeamUnitsAlive = fightState.teamUnitsAlive.get(TeamType.UPPER) ?? 0;
                const lowerTeamUnitsAlive = fightState.teamUnitsAlive.get(TeamType.LOWER) ?? 0;
                const teamUnitsAliveMap = fight.getTeamUnitsAliveMap();
                teamUnitsAliveMap.set(TeamType.UPPER, upperTeamUnitsAlive);
                teamUnitsAliveMap.set(TeamType.LOWER, lowerTeamUnitsAlive);
                fight.setHourGlassQueueList(fightState.hourGlassQueue);
                fight.setMoralePlusQueueList(fightState.moralePlusQueue);
                fight.setMoraleMinusQueueList(fightState.moraleMinusQueue);
                fight.setCurrentTurnStart(Math.round(fightState.currentTurnStart));
                fight.setCurrentTurnEnd(Math.round(fightState.currentTurnEnd));
                const currentLapTotalTimePerTeam = fight.getCurrentLapTotalTimePerTeamMap();
                const upperCurrentLapTotalTime = fightState.currentLapTotalTimePerTeam.get(TeamType.UPPER) ?? 0;
                const lowerCurrentLapTotalTime = fightState.currentLapTotalTimePerTeam.get(TeamType.LOWER) ?? 0;
                currentLapTotalTimePerTeam.set(TeamType.UPPER, upperCurrentLapTotalTime);
                currentLapTotalTimePerTeam.set(TeamType.LOWER, lowerCurrentLapTotalTime);
                fight.setUpNextList(fightState.upNext);
                fight.setStepsMoraleMultiplier(fightState.stepsMoraleMultiplier);
                const hasAdditionalTimeRequestedPerTeam = fight.getHasAdditionalTimeRequestedPerTeamMap();
                const upperAdditionalTimeRequested =
                    fightState.hasAdditionalTimeRequestedPerTeam.get(TeamType.UPPER) ?? false;
                const lowerAdditionalTimeRequested =
                    fightState.hasAdditionalTimeRequestedPerTeam.get(TeamType.LOWER) ?? false;
                hasAdditionalTimeRequestedPerTeam.set(TeamType.UPPER, upperAdditionalTimeRequested);
                hasAdditionalTimeRequestedPerTeam.set(TeamType.LOWER, lowerAdditionalTimeRequested);

                try {
                    console.log("Before sending data");
                    // console.log(fight.toObject());
                    const postResponse = await axios.post("http://localhost:8080/fights", fight.serializeBinary(), {
                        headers: { "Content-Type": "application/octet-stream", "x-request-id": uuidv4() },
                    });
                    // console.log(fight.serializeBinary());
                    console.log("After sending data");
                    // console.log(postResponse.headers);
                    console.log(postResponse.headers);
                    console.log(postResponse.data);
                } catch (err) {
                    console.error(err);
                }

                // console.log(fightState);
                // console.log(fight.toObject());
            }
        };

        HoCLib.interval(this.visibleStateUpdate, 500);
        HoCLib.interval(this.sendFightState, 1000000);
    }

    private spawnObstacles(): string | undefined {
        if (FightStateManager.getInstance().getFightState().currentLap >= NUMBER_OF_LAPS_TILL_STOP_NARROWING) {
            return undefined;
        }

        let laps = Math.floor(
            FightStateManager.getInstance().getFightState().currentLap / this.grid.getNumberOfLapsTillNarrowing(),
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
                this.grid.occupyByHole(this.sc_sceneSettings.getGridSettings(), cell);
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
                this.grid.occupyByHole(this.sc_sceneSettings.getGridSettings(), { x: cellX, y: cellY });
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
                this.grid.occupyByHole(this.sc_sceneSettings.getGridSettings(), { x: cellX, y: cellY });
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
                this.grid.occupyByHole(this.sc_sceneSettings.getGridSettings(), { x: cellX, y: cellY });
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
        FightStateManager.getInstance().requestAdditionalTurnTime(team);
        if (this.sc_visibleState) {
            this.sc_visibleState.canRequestAdditionalTime = false;
            this.sc_visibleStateUpdateNeeded = true;
        }
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
        if (this.sc_started) {
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
        this.hoverActivePath = undefined;
        this.hoverAttackFrom = undefined;
        this.hoverAttackIsSmallSize = undefined;
        this.hoverRangeAttackPoint = undefined;
        this.hoverRangeAttackObstacle = undefined;
        this.hoverRangeAttackDivisor = 1;
        this.hoverActiveShotRange = undefined;
        if (this.hoverRangeAttackLine) {
            this.ground.DestroyFixture(this.hoverRangeAttackLine);
            this.hoverRangeAttackLine = undefined;
        }
        this.rangeResponseUnit = undefined;
        this.rangeResponseAttackDivisor = 1;
        this.sc_moveBlocked = false;
    }

    public cloneObject() {
        if (this.sc_selectedBody) {
            const selectedUnitData = this.sc_selectedBody.GetUserData();

            let placement: SquarePlacement;
            if (selectedUnitData.team === TeamType.LOWER) {
                placement = this.lowerPlacement;
            } else {
                placement = this.upperPlacement;
            }

            const isSmallUnit = selectedUnitData.size === 1;
            const allowedPositions = placement.possibleCellPositions(isSmallUnit);
            HoCLib.shuffle(allowedPositions);

            for (const pos of allowedPositions) {
                if (this.unitsHolder.spawnSelected(this.grid, selectedUnitData, pos, false)) {
                    this.unitsHolder.refreshStackPowerForAllUnits();
                    break;
                }
            }
        }
    }

    private getHoverAttackUnit(): Unit | undefined {
        if (!this.hoverAttackUnits?.length) {
            return undefined;
        }

        return this.hoverAttackUnits[0];
    }

    private updateHoverInfoWithButtonAction(mouseCell: XY): void {
        if (this.spellBookButton.isHover(mouseCell)) {
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
            this.sc_hoverInfoArr = ["End turn"];
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

        if (this.sc_attackDamageSpreadStr || this.sc_attackKillSpreadStr) {
            this.sc_attackDamageSpreadStr = "";
            this.sc_attackRangeDamageDivisorStr = "";
            this.sc_attackKillSpreadStr = "";
            this.sc_hoverTextUpdateNeeded = true;
        }

        const mouseCell = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), this.sc_mouseWorld);
        if (this.sc_started && this.currentActiveUnit) {
            if (!mouseCell) {
                this.resetHover();
                return;
            }

            if (this.sc_renderSpellBookOverlay) {
                this.hoveredSpell = this.currentActiveUnit.getHoveredSpell(this.sc_mouseWorld);
                if (this.hoveredSpell) {
                    this.sc_hoverInfoArr = this.hoveredSpell.getDesc();
                    this.sc_hoverTextUpdateNeeded = true;
                }
                this.resetHover(false);
                return;
            }

            const unitId = this.grid.getOccupantUnitId(mouseCell);

            if (unitId && this.unitsHolder.getAllUnits().has(unitId)) {
                const unit = this.unitsHolder.getAllUnits().get(unitId);
                this.hoverUnit = unit;
                this.hoverSelectedCellsSwitchToRed = false;

                const currentUnitCell = GridMath.getCellForPosition(
                    this.sc_sceneSettings.getGridSettings(),
                    this.currentActiveUnit.getPosition(),
                );

                if (
                    this.currentActiveUnit &&
                    (this.currentActiveUnit.getAttackTypeSelection() === AttackType.MAGIC || this.currentActiveSpell)
                ) {
                    if (
                        this.currentActiveUnit.getAttackTypeSelection() !== AttackType.MAGIC &&
                        this.currentActiveSpell
                    ) {
                        this.selectAttack(AttackType.MAGIC, currentUnitCell, true);
                        this.currentActiveUnitSwitchedAttackAuto = true;
                        this.switchToSelectedAttackType = undefined;
                        console.log("Switch to MAGIC");
                    }

                    let hoverUnitCell: XY | undefined;

                    if (this.hoverUnit) {
                        this.hoverSelectedCells = undefined;
                        hoverUnitCell = GridMath.getCellForPosition(
                            this.sc_sceneSettings.getGridSettings(),
                            this.hoverUnit.getPosition(),
                        );
                        if (hoverUnitCell) {
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
                        }
                    }

                    if (
                        canBeCasted(
                            false,
                            this.sc_sceneSettings.getGridSettings(),
                            this.gridMatrix,
                            this.hoverUnit?.getBuffs(),
                            this.currentActiveSpell,
                            this.currentActiveUnit.getSpells(),
                            undefined,
                            this.currentActiveUnit.getId(),
                            this.hoverUnit?.getId(),
                            this.currentActiveUnit.getTeam(),
                            this.hoverUnit?.getTeam(),
                            this.currentActiveUnit.getName(),
                            this.hoverUnit?.getName(),
                            this.hoverUnit?.getMagicResist(),
                        )
                    ) {
                        if (hoverUnitCell) {
                            this.hoverAttackFrom = hoverUnitCell;
                            this.hoverAttackIsSmallSize = this.hoverUnit?.isSmallSize();
                            this.sc_moveBlocked = true;
                        }
                    } else {
                        this.hoverAttackFrom = undefined;
                        this.hoverAttackIsSmallSize = undefined;
                    }

                    return;
                }

                this.hoverSelectedCells = undefined;

                if (
                    !this.currentActiveUnitSwitchedAttackAuto &&
                    currentUnitCell &&
                    this.currentActiveUnit.getAttackType() === AttackType.RANGE &&
                    this.currentActiveUnit.getAttackTypeSelection() !== AttackType.RANGE &&
                    !this.attackHandler.canBeAttackedByMelee(
                        this.currentActiveUnit.getPosition(),
                        this.currentActiveUnit.isSmallSize(),
                        this.grid.getEnemyAggrMatrixByUnitId(this.currentActiveUnit.getId()),
                    ) &&
                    this.currentActiveUnit.getRangeShots() > 0
                ) {
                    //                    if (this.grid.canBeAttackedByMelee(currentUnitCell, this.currentActiveUnit.getId())) {
                    //                        this.currentActiveUnit.selectAttackType(AttackType.MELEE);
                    //                        console.log("Switch to MELEE");
                    //                    } else if (this.currentActiveUnit.getRangeShots() > 0) {
                    //                    this.currentActiveUnit.selectAttackType(AttackType.RANGE);
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
                    this.hoverRangeAttackPoint = undefined;
                    this.hoverRangeAttackDivisor = 1;
                    this.hoverActiveShotRange = undefined;
                    this.rangeResponseAttackDivisor = 1;
                    this.rangeResponseUnit = undefined;
                    if (this.canAttackByMeleeTargets?.unitIds.has(unitId)) {
                        if (unit) {
                            this.hoverAttackUnits = [unit];
                        } else {
                            this.hoverAttackUnits = unit;
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
                                    : GridMath.getCellsAroundPoint(
                                          this.sc_sceneSettings.getGridSettings(),
                                          hoverAttackUnit.getPosition(),
                                      ),
                                this.currentActiveUnit.isSmallSize(),
                                this.currentActiveUnit.getAttackRange(),
                                hoverAttackUnit,
                                this.canAttackByMeleeTargets.attackCellHashesToLargeCells,
                            );
                            this.hoverAttackIsSmallSize = undefined;
                            let abilityMultiplier = 1;
                            const abilitiesWithPositionCoeff = getAbilitiesWithPosisionCoefficient(
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

                                console.log(`hover abilityMultiplier: ${abilityMultiplier}`);
                            }

                            const isRangedAttacker =
                                this.currentActiveUnit.getAttackType() === AttackType.RANGE &&
                                !this.currentActiveUnit.hasAbilityActive("Handyman");
                            const minDmg = this.currentActiveUnit.calculateAttackDamageMin(
                                hoverAttackUnit,
                                false,
                                isRangedAttacker ? 2 : 1,
                                abilityMultiplier,
                            );
                            const maxDmg = this.currentActiveUnit.calculateAttackDamageMax(
                                hoverAttackUnit,
                                false,
                                isRangedAttacker ? 2 : 1,
                                abilityMultiplier,
                            );
                            const minDied = hoverAttackUnit.calculatePossibleLosses(minDmg);
                            const maxDied = hoverAttackUnit.calculatePossibleLosses(maxDmg);
                            this.sc_attackDamageSpreadStr = `${minDmg}-${maxDmg}`;
                            if (minDied !== maxDied) {
                                this.sc_attackKillSpreadStr = `${minDied}-${maxDied}`;
                            } else if (minDied) {
                                this.sc_attackKillSpreadStr = minDied.toString();
                            }
                            this.sc_hoverTextUpdateNeeded = true;

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
                        }
                    } else {
                        this.hoverAttackUnits = undefined;
                        this.hoverAttackFrom = undefined;
                        this.hoverAttackIsSmallSize = undefined;
                        if (!unit) {
                            this.hoverActivePath = undefined;
                            return;
                        }
                        const unitCell = GridMath.getCellForPosition(
                            this.sc_sceneSettings.getGridSettings(),
                            unit.getPosition(),
                        );
                        if (!unitCell) {
                            this.hoverActivePath = undefined;
                            return;
                        }

                        this.hoverActivePath = this.pathHelper.getMovePath(
                            unitCell,
                            this.gridMatrix,
                            unit.getSteps(),
                            this.grid.getAggrMatrixByTeam(
                                unit.getTeam() === TeamType.LOWER ? TeamType.UPPER : TeamType.LOWER,
                            ),
                            unit.getCanFly(),
                            unit.isSmallSize(),
                        ).cells;

                        if (
                            this.attackHandler.canLandRangeAttack(
                                unit,
                                this.grid.getEnemyAggrMatrixByUnitId(unit.getId()),
                            )
                        ) {
                            this.hoverActiveShotRange = {
                                xy: unit.getPosition(),
                                distance: unit.getRangeShotDistance() * STEP,
                            };
                        }
                    }
                } else if (this.currentActiveUnit.getAttackTypeSelection() === AttackType.RANGE) {
                    if (!unit) {
                        this.hoverActivePath = undefined;
                        return;
                    }
                    const unitCell = GridMath.getCellForPosition(
                        this.sc_sceneSettings.getGridSettings(),
                        unit.getPosition(),
                    );
                    this.hoverActiveShotRange = undefined;
                    if (!unitCell) {
                        this.hoverActivePath = undefined;
                        return;
                    }

                    const previousHover = this.hoverActivePath;

                    this.hoverActivePath = this.pathHelper.getMovePath(
                        unitCell,
                        this.gridMatrix,
                        unit.getSteps(),
                        this.grid.getAggrMatrixByTeam(
                            unit.getTeam() === TeamType.LOWER ? TeamType.UPPER : TeamType.LOWER,
                        ),
                        unit.getCanFly(),
                        unit.isSmallSize(),
                    ).cells;

                    if (
                        this.attackHandler.canLandRangeAttack(unit, this.grid.getEnemyAggrMatrixByUnitId(unit.getId()))
                    ) {
                        this.hoverActiveShotRange = {
                            xy: unit.getPosition(),
                            distance: unit.getRangeShotDistance() * STEP,
                        };
                    }

                    if (previousHover !== this.hoverActivePath) {
                        if (this.hoverRangeAttackLine) {
                            this.ground.DestroyFixture(this.hoverRangeAttackLine);
                            this.hoverRangeAttackLine = undefined;
                            this.hoverRangeAttackPoint = undefined;
                        }
                    }

                    if (!this.hoverRangeAttackLine && unit.getTeam() !== this.currentActiveUnit.getTeam()) {
                        const shape = new b2EdgeShape();

                        this.hoverRangeAttackPoint =
                            GridMath.getClosestSideCenter(
                                this.gridMatrix,
                                this.sc_sceneSettings.getGridSettings(),
                                this.sc_mouseWorld,
                                this.currentActiveUnit.getPosition(),
                                unit.getPosition(),
                                this.currentActiveUnit.isSmallSize(),
                                unit.isSmallSize(),
                            ) ?? unit.getPosition();

                        shape.SetTwoSided(this.currentActiveUnit.getPosition(), this.hoverRangeAttackPoint);
                        this.hoverRangeAttackLine = this.ground.CreateFixture({
                            shape,
                            isSensor: true,
                        });

                        const evaluatedRangeAttack = this.attackHandler.evaluateRangeAttack(
                            this.unitsHolder.getAllUnits(),
                            this.hoverRangeAttackLine,
                            this.currentActiveUnit,
                            unit,
                        );
                        this.hoverRangeAttackDivisor = evaluatedRangeAttack.rangeAttackDivisor;
                        this.hoverAttackUnits = evaluatedRangeAttack.targetUnits;
                        this.hoverRangeAttackObstacle = evaluatedRangeAttack.attackObstacle;

                        const hoverAttackUnit = this.getHoverAttackUnit();

                        if (hoverAttackUnit) {
                            const hoverUnitCell = GridMath.getCellForPosition(
                                this.sc_sceneSettings.getGridSettings(),
                                hoverAttackUnit.getPosition(),
                            );

                            // if we are attacking RANGE unit,
                            // it has to response back
                            if (
                                hoverUnitCell &&
                                hoverAttackUnit.getAttackType() === AttackType.RANGE &&
                                hoverAttackUnit.getRangeShots() > 0 &&
                                !this.attackHandler.canBeAttackedByMelee(
                                    hoverAttackUnit.getPosition(),
                                    hoverAttackUnit.isSmallSize(),
                                    this.grid.getEnemyAggrMatrixByUnitId(hoverAttackUnit.getId()),
                                )
                            ) {
                                const evaluatedRangeResponse = this.attackHandler.evaluateRangeAttack(
                                    this.unitsHolder.getAllUnits(),
                                    this.hoverRangeAttackLine,
                                    hoverAttackUnit,
                                    this.currentActiveUnit,
                                );
                                this.rangeResponseAttackDivisor = evaluatedRangeResponse.rangeAttackDivisor;
                                this.rangeResponseUnit = evaluatedRangeResponse.targetUnits.shift();
                            }

                            const divisorStr =
                                this.hoverRangeAttackDivisor > 1 ? `1/${this.hoverRangeAttackDivisor} ` : "";

                            const minDmg = this.currentActiveUnit.calculateAttackDamageMin(
                                hoverAttackUnit,
                                true,
                                this.hoverRangeAttackDivisor,
                            );
                            const maxDmg = this.currentActiveUnit.calculateAttackDamageMax(
                                hoverAttackUnit,
                                true,
                                this.hoverRangeAttackDivisor,
                            );
                            const minDied = hoverAttackUnit.calculatePossibleLosses(minDmg);
                            const maxDied = hoverAttackUnit.calculatePossibleLosses(maxDmg);
                            if (minDied !== maxDied) {
                                this.sc_attackKillSpreadStr = `${minDied}-${maxDied}`;
                            } else if (minDied) {
                                this.sc_attackKillSpreadStr = minDied.toString();
                            }

                            this.sc_attackDamageSpreadStr = `${minDmg}-${maxDmg}`;
                            this.sc_attackRangeDamageDivisorStr = divisorStr;
                            this.sc_hoverTextUpdateNeeded = true;
                        }
                    }
                } else {
                    this.resetHover(false);
                }
            } else {
                this.hoverUnit = undefined;
                const fightState = FightStateManager.getInstance().getFightState();

                const lowerTeamUnitsAlive = fightState.teamUnitsAlive.get(TeamType.UPPER) ?? 0;
                const upperTeamUnitsAlive = fightState.teamUnitsAlive.get(TeamType.LOWER) ?? 0;

                const moreThanOneUnitAlive =
                    (this.currentActiveUnit.getTeam() === TeamType.LOWER && lowerTeamUnitsAlive > 1) ||
                    (this.currentActiveUnit.getTeam() === TeamType.UPPER && upperTeamUnitsAlive > 1);
                if (
                    (GridMath.isCellWithinGrid(this.sc_sceneSettings.getGridSettings(), mouseCell) &&
                        this.currentActivePathHashes.has((mouseCell.x << 4) | mouseCell.y)) ||
                    (!this.sc_isAIActive &&
                        ((this.spellBookButton.isHover(mouseCell) && this.currentActiveUnit.getSpellsCount()) ||
                            this.shieldButton.isHover(mouseCell) ||
                            this.nextButton.isHover(mouseCell) ||
                            (moreThanOneUnitAlive &&
                                this.hourGlassButton.isHover(mouseCell) &&
                                !fightState.hourGlassQueue.includes(this.currentActiveUnit.getId()) &&
                                !fightState.alreadyHourGlass.has(this.currentActiveUnit.getId())) ||
                            (this.selectedAttackTypeButton.isHover(mouseCell) && this.switchToSelectedAttackType))) ||
                    this.aiButton.isHover(mouseCell)
                ) {
                    this.updateHoverInfoWithButtonAction(mouseCell);

                    if (
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
                        canBeCasted(
                            false,
                            this.sc_sceneSettings.getGridSettings(),
                            this.gridMatrix,
                            undefined,
                            this.currentActiveSpell,
                            this.currentActiveUnit.getSpells(),
                            undefined,
                            this.currentActiveUnit.getId(),
                            undefined,
                            this.currentActiveUnit.getTeam(),
                            undefined,
                            this.currentActiveUnit.getName(),
                            undefined,
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
                            this.cellToUnitPreRound,
                            GridMath.getCellsAroundPoint(
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
                    canBeCasted(
                        false,
                        this.sc_sceneSettings.getGridSettings(),
                        this.gridMatrix,
                        undefined,
                        this.currentActiveSpell,
                        this.currentActiveUnit.getSpells(),
                        undefined,
                        this.currentActiveUnit.getId(),
                        undefined,
                        this.currentActiveUnit.getTeam(),
                        undefined,
                        this.currentActiveUnit.getName(),
                        undefined,
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
                            this.cellToUnitPreRound,
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
                            this.cellToUnitPreRound,
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

    protected getPointToDropTo(body?: b2Body): XY | undefined {
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
            this.sc_started &&
            this.currentActiveUnit &&
            this.currentActiveUnit.getId() === unitStats.id &&
            mouseCell &&
            (this.currentActivePathHashes.has((mouseCell.x << 4) | mouseCell.y) ||
                (this.currentActiveSpell &&
                    GridMath.isCellWithinGrid(this.sc_sceneSettings.getGridSettings(), mouseCell) &&
                    this.currentActiveSpell.getSpellTargetType() === SpellTargetType.FREE_CELL))
        ) {
            if (unitStats.size === 1 || this.currentActiveSpell) {
                if (this.grid.areAllCellsEmpty([mouseCell])) {
                    return GridMath.getPointForCell(
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

            return GridMath.getPointForCells(this.sc_sceneSettings.getGridSettings(), this.hoverSelectedCells);
        }

        const unit = this.unitsHolder.getAllUnits().get(unitStats.id);
        if (!unit) {
            return undefined;
        }

        // pre-start
        if (!this.sc_started && mouseCell && this.isAllowedPreStartMousePosition(unit, true)) {
            if (unit.isSmallSize()) {
                return GridMath.getPointForCell(
                    mouseCell,
                    this.sc_sceneSettings.getGridSettings().getMinX(),
                    this.sc_sceneSettings.getGridSettings().getStep(),
                    this.sc_sceneSettings.getGridSettings().getHalfStep(),
                );
            }

            return GridMath.getPointForCells(this.sc_sceneSettings.getGridSettings(), this.hoverSelectedCells);
        }

        return undefined;
    }

    protected handleMouseDownForSelectedBody(): void {
        if (!this.sc_selectedBody) {
            return;
        }

        this.sc_mouseDropStep = this.sc_stepCount;
        const pointToDropTo = this.getPointToDropTo(this.sc_selectedBody);

        if (pointToDropTo && !this.sc_isAIActive) {
            let castStarted = false;
            let moveStarted = false;
            if (this.sc_started) {
                if (this.sc_moveBlocked) {
                    castStarted = this.cast();
                    moveStarted = true;
                } else {
                    const cellIndices = GridMath.getCellForPosition(
                        this.sc_sceneSettings.getGridSettings(),
                        pointToDropTo,
                    );
                    if (
                        cellIndices &&
                        this.currentActiveKnownPaths?.get((cellIndices.x << 4) | cellIndices.y)?.length
                    ) {
                        moveStarted = this.moveHandler.startMoving(
                            cellIndices,
                            this.drawer,
                            FightStateManager.getInstance().getStepsMoraleMultiplier(),
                            this.sc_selectedBody,
                            this.currentActiveKnownPaths,
                        );
                    }
                }
            } else {
                moveStarted = true;
                this.sc_selectedBody.SetTransformXY(pointToDropTo.x, pointToDropTo.y, this.sc_selectedBody.GetAngle());
            }

            if (!this.sc_moveBlocked || castStarted) {
                if (moveStarted) {
                    if (!this.sc_sceneSettings.isDraggable()) {
                        this.sc_selectedBody.SetIsActive(false);
                    }
                    if (!this.sc_moveBlocked) {
                        this.finishDrop(pointToDropTo);
                    }
                    this.deselect(false, !this.sc_started);
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

    protected refreshFrames(unitId: string): void {
        this.abilitiesFrame.cleanupFrameables();
        this.buffsFrame.cleanupFrameables();
        this.debuffsFrame.cleanupFrameables();
        const selectedUnit = this.unitsHolder.getAllUnits().get(unitId);
        if (selectedUnit) {
            for (const ability of selectedUnit.getAbilities()) {
                this.abilitiesFrame.addFrameable(ability);
            }

            for (const buff of selectedUnit.getBuffs()) {
                this.buffsFrame.addFrameable(buff);
            }

            for (const effect of selectedUnit.getEffects()) {
                this.debuffsFrame.addFrameable(effect);
            }

            for (const debuff of selectedUnit.getDebuffs()) {
                this.debuffsFrame.addFrameable(debuff);
            }
        }
    }

    protected landAttack(): boolean {
        if (
            this.attackHandler.handleMeleeAttack(
                this.unitsHolder,
                this.drawer,
                this.grid,
                this.moveHandler,
                this.sc_stepCount,
                this.currentActiveKnownPaths,
                this.currentActiveSpell,
                this.currentActiveUnit,
                this.getHoverAttackUnit(),
                this.sc_selectedBody,
                this.hoverAttackFrom,
            )
        ) {
            this.sc_damageStatsUpdateNeeded = true;
            this.finishTurn();
            return true;
        }

        if (
            this.attackHandler.handleRangeAttack(
                this.unitsHolder,
                this.drawer,
                this.grid,
                this.hoverRangeAttackDivisor,
                this.rangeResponseAttackDivisor,
                this.sc_stepCount,
                this.currentActiveUnit,
                this.hoverAttackUnits,
                this.rangeResponseUnit,
                this.hoverRangeAttackPoint,
            )
        ) {
            this.sc_damageStatsUpdateNeeded = true;
            this.finishTurn();
            return true;
        }

        if (
            this.attackHandler.handleMagicAttack(
                this.gridMatrix,
                this.currentActiveSpell,
                this.currentActiveUnit,
                this.hoverUnit,
            )
        ) {
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
        this.hoverRangeAttackDivisor = 1;
        if (this.hoverRangeAttackLine) {
            this.ground.DestroyFixture(this.hoverRangeAttackLine);
            this.hoverRangeAttackLine = undefined;
        }
        this.rangeResponseAttackDivisor = 1;
        this.rangeResponseUnit = undefined;

        // cleanup magic attack state
        this.hoveredSpell = undefined;
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
            FightStateManager.getInstance().addAlreadyMadeTurn(
                this.currentActiveUnit.getTeam(),
                this.currentActiveUnit.getId(),
            );
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
                this.currentActiveUnit.decreaseMorale(MORALE_CHANGE_FOR_SKIP);
                this.currentActiveUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getStepsMoraleMultiplier(),
                );
                this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} skip turn`);
            }
            this.finishTurn();
        } else if (this.shieldButton.isHover(cell) && !this.sc_renderSpellBookOverlay && !this.sc_isAIActive) {
            if (this.currentActiveUnit) {
                this.currentActiveUnit.cleanupLuckPerTurn();
                this.currentActiveUnit.decreaseMorale(MORALE_CHANGE_FOR_SHIELD_OR_CLOCK);
                this.currentActiveUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getStepsMoraleMultiplier(),
                );
                this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} shield turn`);
            }
            this.finishTurn();
        } else if (!this.sc_started && this.lifeButton.isHover(cell)) {
            this.deselectRaceButtons();
            this.lifeButton.setIsSelected(true);
            this.destroyNonPlacedUnits();
            this.sc_selectedFactionName = FactionType.LIFE;
            this.sc_factionNameUpdateNeeded = true;
            this.spawnUnits();
            this.resetHover();
            this.sc_selectedBody = undefined;
            this.sc_currentActiveShotRange = undefined;
        } else if (!this.sc_started && this.natureButton.isHover(cell)) {
            this.deselectRaceButtons();
            this.natureButton.setIsSelected(true);
            this.destroyNonPlacedUnits();
            this.sc_selectedFactionName = FactionType.NATURE;
            this.sc_factionNameUpdateNeeded = true;
            this.spawnUnits();
            this.resetHover();
            this.sc_selectedBody = undefined;
            this.sc_currentActiveShotRange = undefined;
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
        } else if (!this.sc_started && this.mightButton.isHover(cell)) {
            this.deselectRaceButtons();
            this.mightButton.setIsSelected(true);
            this.destroyNonPlacedUnits();
            this.sc_selectedFactionName = FactionType.MIGHT;
            this.sc_factionNameUpdateNeeded = true;
            this.spawnUnits();
            this.resetHover();
            this.sc_selectedBody = undefined;
            this.sc_currentActiveShotRange = undefined;
        } else if (!this.sc_started && this.chaosButton.isHover(cell)) {
            this.deselectRaceButtons();
            this.chaosButton.setIsSelected(true);
            this.destroyNonPlacedUnits();
            this.sc_selectedFactionName = FactionType.CHAOS;
            this.sc_factionNameUpdateNeeded = true;
            this.spawnUnits();
            this.resetHover();
            this.sc_selectedBody = undefined;
            this.sc_currentActiveShotRange = undefined;
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
            const fightState = FightStateManager.getInstance().getFightState();

            const lowerTeamUnitsAlive = fightState.teamUnitsAlive.get(TeamType.UPPER) ?? 0;
            const upperTeamUnitsAlive = fightState.teamUnitsAlive.get(TeamType.LOWER) ?? 0;

            const moreThanOneUnitAlive =
                (this.currentActiveUnit.getTeam() === TeamType.LOWER && lowerTeamUnitsAlive > 1) ||
                (this.currentActiveUnit.getTeam() === TeamType.UPPER && upperTeamUnitsAlive > 1);
            if (
                moreThanOneUnitAlive &&
                this.hourGlassButton.isHover(cell) &&
                !fightState.hourGlassQueue.includes(this.currentActiveUnit.getId()) &&
                !fightState.alreadyHourGlass.has(this.currentActiveUnit.getId())
            ) {
                this.currentActiveUnit.decreaseMorale(MORALE_CHANGE_FOR_SHIELD_OR_CLOCK);
                this.currentActiveUnit.setOnHourglass(true);
                FightStateManager.getInstance().enqueueHourGlass(this.currentActiveUnit.getId());
                this.currentActiveUnit.applyMoraleStepsModifier(
                    FightStateManager.getInstance().getStepsMoraleMultiplier(),
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
                    this.selectAttack(
                        this.currentActiveUnit.getAttackType() === AttackType.RANGE
                            ? AttackType.RANGE
                            : AttackType.MAGIC,
                        currentUnitCell,
                        true,
                    );
                    this.sc_unitPropertiesUpdateNeeded = true;
                } else {
                    this.selectAttack(AttackType.MELEE, currentUnitCell, true);
                    this.sc_unitPropertiesUpdateNeeded = true;
                }
                this.currentActiveUnitSwitchedAttackAuto = true;
            }
        } else if (this.hoveredSpell) {
            if (this.hoveredSpell.getSpellTargetType() === SpellTargetType.RANDOM_CLOSE_TO_CASTER) {
                if (this.currentActiveUnit) {
                    const randomCell = GridMath.getRandomCellAroundPosition(
                        this.sc_sceneSettings.getGridSettings(),
                        this.gridMatrix,
                        this.currentActiveUnit.getTeam(),
                        this.currentActiveUnit.getPosition(),
                    );

                    const possibleUnit = this.unitsHolder.getSummonedUnitByName(
                        this.currentActiveUnit.getTeam(),
                        this.hoveredSpell.getSummonUnitName(),
                    );

                    if (
                        (possibleUnit || randomCell) &&
                        canBeCasted(
                            false,
                            this.sc_sceneSettings.getGridSettings(),
                            this.gridMatrix,
                            this.hoverUnit?.getBuffs(),
                            this.hoveredSpell,
                            this.currentActiveUnit?.getSpells(),
                            randomCell,
                            this.currentActiveUnit?.getId(),
                            possibleUnit?.getId(),
                            this.currentActiveUnit?.getTeam(),
                            this.hoverUnit?.getTeam(),
                            this.currentActiveUnit?.getName(),
                            this.hoverUnit?.getName(),
                            this.hoverUnit?.getMagicResist(),
                        )
                    ) {
                        if (this.hoveredSpell.isSummon()) {
                            const amountToSummon =
                                this.currentActiveUnit.getAmountAlive() * this.hoveredSpell.getPower();

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
                        }
                        this.currentActiveUnit.useSpell(this.hoveredSpell);
                        this.finishTurn();
                    } else {
                        this.currentActiveSpell = undefined;
                    }
                }
            } else {
                this.currentActiveSpell = this.hoveredSpell;
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

    protected finishFight(): void {
        this.canAttackByMeleeTargets = undefined;
        FightStateManager.getInstance().finishFight();
        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.sc_sceneLog.updateLog(`Fight finished!`);
        this.refreshVisibleStateIfNeeded();
        if (this.sc_visibleState) {
            this.sc_visibleState.hasFinished = true;
            this.sc_visibleStateUpdateNeeded = true;
        }
    }

    protected finishDrop(pointToDropTo: XY) {
        if (this.sc_selectedBody) {
            if (this.currentActiveUnit) {
                if (!this.currentActivePath) {
                    this.currentActiveUnit = undefined;
                    this.sc_selectedAttackType = AttackType.NO_TYPE;
                    return;
                }

                let refreshUnitPosition = false;

                if (this.currentActiveUnit.isSmallSize()) {
                    const cell = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), pointToDropTo);
                    if (cell && this.grid.areAllCellsEmpty([cell], this.currentActiveUnit.getId())) {
                        refreshUnitPosition = this.grid.occupyCell(
                            cell,
                            this.currentActiveUnit.getId(),
                            this.currentActiveUnit.getTeam(),
                            this.currentActiveUnit.getAttackRange(),
                        );
                    }
                } else {
                    const cells = GridMath.getCellsAroundPoint(this.sc_sceneSettings.getGridSettings(), pointToDropTo);
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
                            GridMath.getCellsAroundPoint(
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
                numberOfLapsTillNarrowing: this.grid.getNumberOfLapsTillNarrowing(),
                numberOfLapsTillStopNarrowing: NUMBER_OF_LAPS_TILL_STOP_NARROWING,
                canRequestAdditionalTime: !!FightStateManager.getInstance().requestAdditionalTurnTime(undefined, true),
            };
            this.sc_visibleStateUpdateNeeded = true;
        }
    }

    private selectAttack(selectedAttackType: AttackType, currentUnitCell?: XY, force = false): boolean {
        if (!this.currentActiveUnit || !currentUnitCell) {
            return false;
        }

        let hasOption = true;
        const isRange = this.currentActiveUnit.getAttackType() === AttackType.RANGE;
        const isMagic = this.currentActiveUnit.getAttackType() === AttackType.MAGIC;

        if (currentUnitCell && (isRange || isMagic)) {
            if (
                isRange &&
                this.attackHandler.canBeAttackedByMelee(
                    this.currentActiveUnit.getPosition(),
                    this.currentActiveUnit.isSmallSize(),
                    this.grid.getEnemyAggrMatrixByUnitId(this.currentActiveUnit.getId()),
                )
            ) {
                hasOption = false;
                if (this.currentActiveUnit.selectAttackType(AttackType.MELEE)) {
                    this.selectedAttackTypeButton.switchSprites(
                        new Sprite(this.gl, this.shader, this.textures.range_white_128.texture),
                        new Sprite(this.gl, this.shader, this.textures.range_black_128.texture),
                    );
                    this.currentActiveSpell = undefined;
                    this.adjustSpellBookSprite();
                }
                this.sc_selectedAttackType = this.currentActiveUnit.getAttackTypeSelection();
            } else if (isRange && this.currentActiveUnit.getRangeShots() <= 0) {
                hasOption = false;
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
                const cellsAroundPoint = GridMath.getCellsAroundPoint(
                    this.sc_sceneSettings.getGridSettings(),
                    this.currentActiveUnit.getPosition(),
                );
                for (const cellAroundPoint of cellsAroundPoint) {
                    occupiedCells.push(`${cellAroundPoint.x}:${cellAroundPoint.y}`);
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

    protected selectUnitPreStart(position: XY, rangeShotDistance = 0): void {
        if (rangeShotDistance > 0) {
            this.sc_currentActiveShotRange = {
                xy: position,
                distance: rangeShotDistance * STEP,
            };
        } else {
            this.sc_currentActiveShotRange = undefined;
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
        if (this.sc_started) {
            this.buffsFrame.render(isLightMode);
            this.debuffsFrame.render(isLightMode);
            this.abilitiesFrame.render(isLightMode);
        }

        this.drawer.animate(this.sc_fps, this.sc_stepCount);
        if (!this.sc_isAnimating) {
            if (this.hoverActiveShotRange) {
                settings.m_debugDraw.DrawCircle(
                    this.hoverActiveShotRange.xy,
                    this.hoverActiveShotRange.distance,
                    isLightMode ? COLOR_ORANGE : COLOR_YELLOW,
                );
            }

            const drawActiveShotRange =
                !this.currentActiveUnit ||
                (this.currentActiveUnit && this.currentActiveUnit.getAttackTypeSelection() === AttackType.RANGE);
            if (drawActiveShotRange && this.sc_currentActiveShotRange) {
                settings.m_debugDraw.DrawCircle(
                    this.sc_currentActiveShotRange.xy,
                    this.sc_currentActiveShotRange.distance,
                    isLightMode ? COLOR_ORANGE : COLOR_YELLOW,
                );
            }

            const units: Unit[] = [];
            const bodies: Map<string, b2Body> = new Map();
            const positions: Map<string, XY> = new Map();
            const fightState = FightStateManager.getInstance().getFightState();

            let unitsUpper: Unit[] | undefined = [];
            let unitsLower: Unit[] | undefined = [];
            let allUnitsMadeTurn = true;

            if (this.sc_started) {
                if (HoCLib.getTimeMillis() >= fightState.currentTurnEnd) {
                    if (this.currentActiveUnit) {
                        this.currentActiveUnit.decreaseMorale(MORALE_CHANGE_FOR_SKIP);
                        this.currentActiveUnit.applyMoraleStepsModifier(
                            FightStateManager.getInstance().getStepsMoraleMultiplier(),
                        );
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

                if (this.sc_started && !this.currentActiveUnit) {
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

                    if (this.sc_started) {
                        if (unit) {
                            if (unitStats.team === TeamType.UPPER) {
                                if (this.upperPlacement.isAllowed(bodyPosition) || fightState.firstTurnMade) {
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
                                            const cells = GridMath.getCellsAroundPoint(
                                                this.sc_sceneSettings.getGridSettings(),
                                                b.GetPosition(),
                                            );
                                            if (this.grid.areAllCellsEmpty(cells)) {
                                                occupiedCells = this.grid.occupyCells(
                                                    GridMath.getCellsAroundPoint(
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
                                        unit.randomizeLuckPerTurn();
                                        unit.setAttackMultiplier(1);
                                        unit.setResponded(false);
                                        unit.setOnHourglass(false);
                                        unit.applyMoraleStepsModifier(
                                            FightStateManager.getInstance().getStepsMoraleMultiplier(),
                                        );
                                    }

                                    if (allUnitsMadeTurn && !fightState.alreadyMadeTurn.has(unit.getId())) {
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
                            } else if (this.lowerPlacement.isAllowed(bodyPosition) || fightState.firstTurnMade) {
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
                                        const cells = GridMath.getCellsAroundPoint(
                                            this.sc_sceneSettings.getGridSettings(),
                                            b.GetPosition(),
                                        );

                                        if (this.grid.areAllCellsEmpty(cells)) {
                                            occupiedCells = this.grid.occupyCells(
                                                GridMath.getCellsAroundPoint(
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
                                    unit.randomizeLuckPerTurn();
                                    unit.setAttackMultiplier(1);
                                    unit.setResponded(false);
                                    unit.setOnHourglass(false);
                                    unit.applyMoraleStepsModifier(
                                        FightStateManager.getInstance().getStepsMoraleMultiplier(),
                                    );
                                }

                                if (allUnitsMadeTurn && !fightState.alreadyMadeTurn.has(unit.getId())) {
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
                fightState.currentLap === 1 &&
                !FightStateManager.getInstance().getFightState().alreadyMadeTurn.size &&
                !FightStateManager.getInstance().getFightState().hourGlassQueue.length;

            let { fightFinished } = fightState;

            if (this.sc_started && allUnitsMadeTurn && !fightFinished) {
                for (const u of units) {
                    u.randomizeLuckPerTurn();
                    u.setAttackMultiplier(1);
                    u.setResponded(false);
                    u.setOnHourglass(false);
                    u.applyMoraleStepsModifier(FightStateManager.getInstance().getStepsMoraleMultiplier());
                }
                FightStateManager.getInstance().flipLap();
                if (FightStateManager.getInstance().isForestLap(this.grid.getNumberOfLapsTillNarrowing())) {
                    // can generate logs on destroy events
                    this.sc_sceneLog.updateLog(this.spawnObstacles());
                    FightStateManager.getInstance().increaseStepsMoraleMultiplier();

                    // spawn may actually delete units due to overlap with obstacles
                    // so we have to refresh all the units here
                    const unitsForAllTeams = this.unitsHolder.refreshUnitsForAllTeams();
                    unitsLower = unitsForAllTeams[TeamType.LOWER - 1];
                    unitsUpper = unitsForAllTeams[TeamType.UPPER - 1];
                    this.unitsHolder.refreshStackPowerForAllUnits();
                    if (unitsLower) {
                        for (const ul of unitsLower) {
                            ul.applyMoraleStepsModifier(FightStateManager.getInstance().getStepsMoraleMultiplier());
                        }
                    }

                    if (unitsUpper) {
                        for (const uu of unitsUpper) {
                            uu.applyMoraleStepsModifier(FightStateManager.getInstance().getStepsMoraleMultiplier());
                        }
                    }
                }
                turnFlipped = true;
            }

            if (this.sc_started && !fightFinished) {
                if (!this.currentActiveUnit) {
                    if (!unitsLower?.length || !unitsUpper?.length) {
                        this.finishFight();
                        fightFinished = true;
                        this.sc_isAIActive = false;
                    }

                    if (!fightFinished) {
                        HoCLib.shuffle(unitsUpper);
                        HoCLib.shuffle(unitsLower);
                        units.sort((a: Unit, b: Unit) =>
                            // eslint-disable-next-line no-nested-ternary
                            a.getSpeed() > b.getSpeed() ? -1 : b.getSpeed() > a.getSpeed() ? 1 : 0,
                        );
                        unitsUpper.sort((a: Unit, b: Unit) =>
                            // eslint-disable-next-line no-nested-ternary
                            a.getSpeed() > b.getSpeed() ? -1 : b.getSpeed() > a.getSpeed() ? 1 : 0,
                        );
                        unitsLower.sort((a: Unit, b: Unit) =>
                            // eslint-disable-next-line no-nested-ternary
                            a.getSpeed() > b.getSpeed() ? -1 : b.getSpeed() > a.getSpeed() ? 1 : 0,
                        );

                        FightStateManager.getInstance().setTeamUnitsAlive(TeamType.UPPER, unitsUpper.length);
                        FightStateManager.getInstance().setTeamUnitsAlive(TeamType.LOWER, unitsLower.length);

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
                                        FightStateManager.getInstance().enqueueMoralePlus(u.getId());
                                        u.setAttackMultiplier(1.25);
                                    } else {
                                        FightStateManager.getInstance().enqueueMoraleMinus(u.getId());
                                        u.setAttackMultiplier(0.8);
                                    }
                                }
                            }
                        }

                        FightStateManager.getInstance().prefetchNextUnitsToTurn(
                            this.unitsHolder.getAllUnits(),
                            unitsUpper,
                            unitsLower,
                        );

                        const nextUnitId = FightStateManager.getInstance().dequeueNextUnitId();
                        const nextUnit = nextUnitId ? this.unitsHolder.getAllUnits().get(nextUnitId) : undefined;

                        if (nextUnit) {
                            if (nextUnit.isSkippingThisTurn()) {
                                this.currentActiveUnit = nextUnit;
                                this.sc_selectedAttackType = this.currentActiveUnit.getAttackTypeSelection();
                                this.currentActiveUnit.decreaseMorale(MORALE_CHANGE_FOR_SKIP);
                                this.currentActiveUnit.applyMoraleStepsModifier(
                                    FightStateManager.getInstance().getStepsMoraleMultiplier(),
                                );
                                this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} skip turn`);
                                this.finishTurn();
                            } else {
                                this.sc_moveBlocked = false;
                                this.unitsHolder.refreshStackPowerForAllUnits();
                                this.gridMatrix = this.grid.getMatrix();
                                this.refreshVisibleStateIfNeeded();
                                if (this.sc_visibleState) {
                                    this.sc_visibleState.teamTypeTurn = nextUnit.getTeam();
                                    this.sc_visibleState.lapNumber = fightState.currentLap;
                                    this.sc_visibleState.canRequestAdditionalTime =
                                        !!FightStateManager.getInstance().requestAdditionalTurnTime(
                                            this.sc_visibleState.teamTypeTurn,
                                            true,
                                        );
                                    FightStateManager.getInstance().startTurn(nextUnit.getTeam());
                                    this.visibleStateUpdate();
                                }

                                this.switchToSelectedAttackType = undefined;
                                const unitBody = bodies.get(nextUnit.getId());
                                if (!unitBody) {
                                    this.canAttackByMeleeTargets = undefined;
                                    this.currentActivePath = undefined;
                                } else {
                                    unitBody.SetIsActive(true);
                                    this.addUnitData(unitBody.GetUserData());
                                    nextUnit.refreshPreTurnState(this.sc_sceneLog);
                                    this.sc_hoverTextUpdateNeeded = true;
                                    this.sc_selectedBody = unitBody;
                                    this.currentActiveUnit = nextUnit;
                                    this.sc_selectedAttackType = this.currentActiveUnit.getAttackTypeSelection();
                                    this.currentActiveSpell = undefined;
                                    this.adjustSpellBookSprite();
                                    this.currentActiveUnitSwitchedAttackAuto = false;
                                    this.grid.print(nextUnit.getId());
                                    const currentPos = GridMath.getCellForPosition(
                                        this.sc_sceneSettings.getGridSettings(),
                                        unitBody.GetPosition(),
                                    );
                                    if (currentPos) {
                                        const movePath = this.pathHelper.getMovePath(
                                            currentPos,
                                            this.gridMatrix,
                                            nextUnit.getSteps(),
                                            this.grid.getAggrMatrixByTeam(
                                                this.currentActiveUnit.getTeam() === TeamType.LOWER
                                                    ? TeamType.UPPER
                                                    : TeamType.LOWER,
                                            ),
                                            nextUnit.getCanFly(),
                                            nextUnit.isSmallSize(),
                                        );
                                        this.currentActivePath = movePath.cells;
                                        this.currentActiveKnownPaths = movePath.knownPaths;
                                        this.currentActivePathHashes = movePath.hashes;
                                        const enemyTeam =
                                            this.currentActiveUnit.getTeam() === TeamType.LOWER
                                                ? unitsUpper
                                                : unitsLower;
                                        this.canAttackByMeleeTargets = this.pathHelper.attackMeleeAllowed(
                                            this.currentActiveUnit,
                                            this.currentActivePath,
                                            this.currentActiveKnownPaths,
                                            enemyTeam,
                                            positions,
                                        );
                                        if (nextUnit.getAttackTypeSelection() === AttackType.RANGE) {
                                            this.sc_currentActiveShotRange = {
                                                xy: nextUnit.getPosition(),
                                                distance: nextUnit.getRangeShotDistance() * STEP,
                                            };
                                        } else {
                                            this.sc_currentActiveShotRange = undefined;
                                        }
                                    } else {
                                        this.canAttackByMeleeTargets = undefined;
                                    }
                                    FightStateManager.getInstance().markFirstTurn();
                                }
                            }
                        } else {
                            this.finishFight();
                        }
                    }
                }

                // AI section
                if (this.currentActiveUnit && this.sc_isAIActive) {
                    const action = findTarget(this.currentActiveUnit, this.grid, this.gridMatrix, this.pathHelper);
                    if (action?.actionType() === AIActionType.MOVE_AND_M_ATTACK) {
                        this.currentActiveUnit.selectAttackType(AttackType.MELEE);
                        this.sc_selectedAttackType = this.currentActiveUnit.getAttackTypeSelection();
                        this.currentActiveKnownPaths = action.currentActiveKnownPaths();
                        const cellToAttack = action.cellToAttack();
                        if (cellToAttack) {
                            const targetUnitId = this.grid.getOccupantUnitId(cellToAttack);
                            if (targetUnitId !== undefined) {
                                const unitToAttack = this.unitsHolder.getAllUnits().get(targetUnitId);
                                if (unitToAttack) {
                                    this.hoverAttackUnits = [unitToAttack];
                                }
                                const attackedCell = action.cellToMove();
                                if (attackedCell) {
                                    this.hoverAttackFrom = attackedCell;
                                    if (this.currentActiveUnit.isSmallSize()) {
                                        this.hoverSelectedCells = [attackedCell];
                                    } else {
                                        const position = GridMath.getPointForCell(
                                            attackedCell,
                                            this.sc_sceneSettings.getGridSettings().getMinX(),
                                            this.sc_sceneSettings.getGridSettings().getStep(),
                                            this.sc_sceneSettings.getGridSettings().getHalfStep(),
                                        );
                                        this.hoverSelectedCells = GridMath.getCellsAroundPoint(
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
                    } else if (action?.actionType() === AIActionType.M_ATTACK) {
                        this.currentActiveUnit.selectAttackType(AttackType.MELEE);
                        this.currentActiveKnownPaths = action.currentActiveKnownPaths();
                        const cellToAttack = action.cellToAttack();
                        if (cellToAttack) {
                            const targetUnitId = this.grid.getOccupantUnitId(cellToAttack);
                            if (targetUnitId !== undefined) {
                                const unitToAttack = this.unitsHolder.getAllUnits().get(targetUnitId);
                                if (unitToAttack) {
                                    this.hoverAttackUnits = [unitToAttack];
                                }
                                const attackedCell = action.cellToMove();
                                if (attackedCell) {
                                    this.hoverAttackFrom = attackedCell;
                                }
                            }
                        }
                        this.landAttack();
                    } else if (action?.actionType() === AIActionType.R_ATTACK) {
                        this.currentActiveUnit.selectAttackType(AttackType.RANGE);
                        this.currentActiveKnownPaths = action.currentActiveKnownPaths();
                        const cellToAttack = action.cellToAttack();
                        if (cellToAttack) {
                            const targetUnitId = this.grid.getOccupantUnitId(cellToAttack);
                            if (targetUnitId !== undefined) {
                                this.rangeResponseUnit = this.unitsHolder.getAllUnits().get(targetUnitId);
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
                                    FightStateManager.getInstance().getStepsMoraleMultiplier(),
                                    this.sc_selectedBody,
                                    action?.currentActiveKnownPaths(),
                                );
                                if (moveStarted) {
                                    const position = GridMath.getPointForCell(
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
                                const position = GridMath.getPointForCell(
                                    cellToMove,
                                    this.sc_sceneSettings.getGridSettings().getMinX(),
                                    this.sc_sceneSettings.getGridSettings().getStep(),
                                    this.sc_sceneSettings.getGridSettings().getHalfStep(),
                                );
                                const cells = GridMath.getCellsAroundPoint(this.sc_sceneSettings.getGridSettings(), {
                                    x: position.x - this.sc_sceneSettings.getGridSettings().getHalfStep(),
                                    y: position.y - this.sc_sceneSettings.getGridSettings().getHalfStep(),
                                });
                                this.hoverSelectedCells = cells;
                                const moveStarted = this.moveHandler.startMoving(
                                    cellToMove,
                                    this.drawer,
                                    FightStateManager.getInstance().getStepsMoraleMultiplier(),
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
                }
            }

            if (this.sc_calculatingPlacement) {
                this.sc_calculatingPlacement = false;
            }
        }

        // if (!this.sc_renderSpellBookOverlay) {
        // this.drawer.drawGrid(settings.m_debugDraw, this.moveHandler.getLargeUnitsCache());
        // }

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

        if (this.sc_started) {
            const unitsNext: Unit[] = [];
            for (const unitIdNext of FightStateManager.getInstance().getFightState().upNext) {
                const unitNext = this.unitsHolder.getAllUnits().get(unitIdNext);
                if (unitNext) {
                    unitsNext.push(unitNext);
                }
            }
            if (this.currentActiveUnit) {
                unitsNext.push(this.currentActiveUnit);
            }
            this.drawer.renderUpNextFonts(
                settings.m_debugDraw,
                this.sc_fps,
                this.sc_stepCount,
                isLightMode,
                unitsNext,
                this.sc_isAnimating,
                this.currentActiveUnit?.getId(),
            );
            this.placementsCleanedUp = true;
        } else {
            this.sc_isAIActive = false;
            this.lowerPlacement.draw(settings.m_debugDraw);
            this.upperPlacement.draw(settings.m_debugDraw);
        }

        const themeLightColor = isLightMode ? COLOR_LIGHT_ORANGE : COLOR_LIGHT_YELLOW;
        const themeMainColor = isLightMode ? COLOR_GREY : COLOR_LIGHT_GREY;

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
        } else if (this.hoverAttackUnits && this.currentActiveUnit?.hasAbilityActive("Lightning Spin")) {
            for (const enemy of allEnemiesAroundLargeUnit(
                this.currentActiveUnit,
                true,
                this.unitsHolder,
                this.grid,
                this.sc_sceneSettings.getGridSettings(),
                this.hoverAttackFrom,
            )) {
                this.drawer.drawAttackTo(settings.m_debugDraw, enemy.getPosition(), enemy.getSize());
            }
        } else if (hoverAttackUnit) {
            this.drawer.drawAttackTo(settings.m_debugDraw, hoverAttackUnit.getPosition(), hoverAttackUnit.getSize());
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
                GridMath.getPointForCell(
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
        if (this.sc_started && this.currentActiveUnit && this.currentActiveUnit.getAttackType() !== AttackType.MELEE) {
            const currentUnitCell = GridMath.getCellForPosition(
                this.sc_sceneSettings.getGridSettings(),
                this.currentActiveUnit.getPosition(),
            );

            let toSelectAttackType = AttackType.MELEE;
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
            if (this.currentActiveUnit.getCanCastSpells()) {
                this.spellBookButton.render(settings.m_debugDraw, isLightMode);
            }
        }

        if (this.sc_started) {
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

registerScene("Heroes", "TestFight", TestHeroes);
