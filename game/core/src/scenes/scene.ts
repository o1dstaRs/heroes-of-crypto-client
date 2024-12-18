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

import { DrawControllers } from "@box2d/controllers";
import {
    b2AABB,
    b2Body,
    b2Draw,
    b2BodyType,
    b2Color,
    b2Contact,
    b2ContactImpulse,
    b2ContactListener,
    b2DestructionListener,
    b2Fixture,
    b2Joint,
    b2LinearStiffness,
    b2MouseJoint,
    b2MouseJointDef,
    b2PointState,
    b2Profile,
    b2Vec2,
    b2World,
    DrawAABBs,
    DrawCenterOfMasses,
    DrawJoints,
    DrawShapes,
    XY,
} from "@box2d/core";
import { b2ParticleGroup, DrawParticleSystems } from "@box2d/particles";
import {
    AttackType,
    FactionType,
    HoCConstants,
    MovementType,
    GridType,
    HoCMath,
    HoCLib,
    TeamType,
    Augment,
    IAuraOnMap,
    UnitProperties,
    AbilityHelper,
    IDamageStatistic,
    SynergyWithLevel,
} from "@heroesofcrypto/common";

import { Settings } from "../settings";
import {
    IVisibleButton,
    IVisibleDamage,
    IVisibleImpact,
    IVisibleOverallImpact,
    IVisibleState,
    VisibleButtonState,
} from "../state/visible_state";
import { EDGES_SIZE, MAX_FPS, MAX_X } from "../statics";
import { g_camera } from "../utils/camera";
import { DefaultShader } from "../utils/gl/defaultShader";
import { PreloadedTextures } from "../utils/gl/preload";
import { HotKey } from "../utils/hotkeys";
import { SceneLog } from "./scene_log";
import { SceneSettings } from "./scene_settings";

const temp = {
    aabb: new b2AABB(),
};

const STEPS_BETWEEN_MOUSE_ACTIONS_MIN = 4;
const MAX_CONTACT_POINTS = 4096;

export interface SceneContext {
    gl: WebGLRenderingContext;
    shader: DefaultShader;
    textures: PreloadedTextures;
    draw: b2Draw;
}

export interface SceneConstructor {
    new (context: SceneContext): Scene;
}

export interface SceneEntry {
    group: string;
    name: string;
    SceneClass: SceneConstructor;
}

const sceneGroups = {
    Heroes: [] as SceneEntry[],
};
export type SceneGroup = keyof typeof sceneGroups;

export function registerScene(group: SceneGroup, name: string, constructor: SceneConstructor) {
    sceneGroups[group].push({
        group,
        name,
        SceneClass: constructor,
    });
}

export function getScenesGrouped() {
    return Object.keys(sceneGroups)
        .sort()
        .map((name) => {
            const scenes = sceneGroups[name as SceneGroup].sort((a, b) => (a.name < b.name ? -1 : 1));
            return {
                name,
                scenes,
            };
        });
}

export class DestructionListener extends b2DestructionListener {
    public test: Scene;

    public constructor(test: Scene) {
        super();

        this.test = test;
    }

    public SayGoodbyeJoint(joint: b2Joint): void {
        if (this.test.sc_mouseJoint === joint) {
            this.test.sc_mouseJoint = null;
        } else {
            this.test.JointDestroyed(joint);
        }
    }

    public SayGoodbyeFixture(_fixture: b2Fixture): void {}

    public SayGoodbyeParticleGroup(group: b2ParticleGroup) {
        this.test.ParticleGroupDestroyed(group);
    }
}

export class ContactPoint {
    public fixtureA!: b2Fixture;

    public fixtureB!: b2Fixture;

    public readonly normal = new b2Vec2();

    public readonly position = new b2Vec2();

    public state = b2PointState.b2_nullState;

    public normalImpulse = 0;

    public tangentImpulse = 0;

    public separation = 0;
}

const formatValueAveMax = (step: number, ave: number, max: number) =>
    `${step.toFixed(2)} [${ave.toFixed(2)}] (${max.toFixed(2)})`;

export abstract class Scene extends b2ContactListener {
    private sceneStarted = false;

    public sc_world: b2World;

    public readonly sc_debugLines: Array<[string, string]> = [];

    public readonly sc_statisticLines: Array<[string, string]> = [];

    public readonly sc_points = Array.from({ length: MAX_CONTACT_POINTS }, () => new ContactPoint());

    public readonly sc_mouseTracerPosition = new b2Vec2();

    public readonly sc_mouseTracerVelocity = new b2Vec2();

    public readonly sc_mouseWorld = new b2Vec2();

    public readonly sc_sceneLog = new SceneLog();

    public readonly sc_maxProfile = new b2Profile();

    public readonly sc_totalProfile = new b2Profile();

    public readonly sc_sceneSettings: SceneSettings;

    public sc_currentActiveShotRange?: HoCMath.IXYDistance;

    public sc_currentActiveAuraRanges: IAuraOnMap[] = [];

    public sc_unitInfoLines: Array<[string, string]> = [];

    public sc_attackDamageSpreadStr = "";

    public sc_attackRangeDamageDivisorStr = "";

    public sc_attackKillSpreadStr = "";

    public sc_hoverInfoArr: string[] = [];

    public sc_hoverUnitNameStr = "";

    public sc_hoverUnitLevel = 0;

    public sc_hoverUnitMovementType = MovementType.NO_TYPE;

    public sc_mouseJoint: b2MouseJoint | null = null;

    public sc_pointCount = 0;

    public sc_destructionListener: DestructionListener;

    public sc_mouseTracing = false;

    public sc_calculatingPlacement = true;

    public sc_stepCount: HoCLib.RefNumber = new HoCLib.RefNumber(0);

    public sc_fps = MAX_FPS;

    public sc_selectedBody?: b2Body;

    public sc_selectedUnitProperties?: UnitProperties;

    public sc_selectedFactionName?: FactionType;

    public sc_selectedAttackType: AttackType;

    public sc_visibleState?: IVisibleState;

    public sc_visibleOverallImpact?: IVisibleOverallImpact;

    public sc_groundBody: b2Body;

    public sc_possibleSynergiesPerTeam: Map<TeamType, SynergyWithLevel[]> = new Map();

    public sc_isSelection = false;

    public sc_hoverAttackIsTargetingObstacle = false;

    public sc_mouseDropStep = 0;

    public sc_mouseDownStep = 0;

    public sc_hoverTextUpdateNeeded = false;

    public sc_visibleStateUpdateNeeded = false;

    public sc_visibleButtonGroup: IVisibleButton[] = [];

    public sc_unitPropertiesUpdateNeeded = false;

    public sc_factionNameUpdateNeeded = false;

    public sc_damageStatsUpdateNeeded = false;

    public sc_possibleSynergiesUpdateNeeded = false;

    public sc_damageForAnimation: IVisibleDamage;

    public sc_gridTypeUpdateNeeded = false;

    public sc_moveBlocked = false;

    public sc_augmentChanged = false;

    public sc_buttonGroupUpdated = false;

    protected sc_isAnimating = false;

    protected sc_isAIActive = false;

    protected sc_renderSpellBookOverlay = false;

    protected constructor(sceneSettings: SceneSettings, gravity: XY = { x: 0, y: -10 }) {
        super();

        this.sc_world = b2World.Create(gravity);
        this.sc_sceneSettings = sceneSettings;

        this.sc_destructionListener = new DestructionListener(this);
        this.sc_world.SetDestructionListener(this.sc_destructionListener);
        this.sc_world.SetContactListener(this);

        this.sc_groundBody = this.sc_world.CreateBody();
        this.sc_visibleState = undefined;
        this.sc_selectedAttackType = AttackType.NO_TYPE;
        this.sc_damageForAnimation = {
            amount: 0,
            render: false,
            unitPosition: { x: 0, y: 0 },
            unitIsSmall: true,
        };
    }

    public setupControls() {}

    protected selectedSmallUnit(): boolean {
        return !!this.sc_selectedBody && this.sc_selectedBody.GetUserData()?.size === 1;
    }

    protected selectedLargeUnit(): boolean {
        return !!this.sc_selectedBody && this.sc_selectedBody.GetUserData()?.size === 2;
    }

    protected abstract verifyButtonsTrigger(): void;

    public abstract propagateAugmentation(teamType: TeamType, augmentType: Augment.AugmentType): boolean;

    public abstract propagateSynergy(
        teamType: TeamType,
        faction: FactionType,
        synergyName: string,
        synergyLevel: number,
    ): boolean;

    public abstract getNumberOfUnitsAvailableForPlacement(teamType: TeamType): number;

    public abstract propagateButtonClicked(buttonName: string, buttonState: VisibleButtonState): void;

    public getDamageStatisics(): IDamageStatistic[] {
        return [];
    }

    public Deselect(_onlyWhenNotStarted = false, _refreshStats = true) {
        if (this.sceneStarted && _onlyWhenNotStarted) {
            if (this.sc_selectedBody) {
                this.sc_unitInfoLines.length = 0;
                this.sc_selectedUnitProperties = undefined;
                this.sc_visibleOverallImpact = undefined;
                this.setSelectedUnitProperties(this.sc_selectedBody.GetUserData());
            }
            this.sc_renderSpellBookOverlay = false;
            return;
        }

        if (this.sc_selectedBody) {
            this.sc_selectedBody.SetIsActive(false);
            this.sc_selectedBody = undefined;
        }
        this.sc_unitInfoLines.length = 0;
        if (_refreshStats) {
            this.sc_selectedUnitProperties = undefined;
            this.sc_visibleOverallImpact = undefined;
            this.sc_unitPropertiesUpdateNeeded = true;
        }
        this.sc_currentActiveShotRange = undefined;
        this.sc_currentActiveAuraRanges = [];
    }

    public getBaseHotkeys(): HotKey[] {
        return [];
    }

    public getHotkeys(): HotKey[] {
        return [];
    }

    public JointDestroyed(_joint: b2Joint): void {}

    public ParticleGroupDestroyed(_group: b2ParticleGroup) {}

    public BeginContact(_contact: b2Contact): void {}

    public EndContact(_contact: b2Contact): void {}

    protected abstract landAttack(): boolean;

    protected abstract finishDrop(positionToDropTo: XY): void;

    protected abstract handleMouseDownForSelectedBody(): void;

    protected abstract selectUnitPreStart(
        team: TeamType,
        isSmallUnit: boolean,
        position: XY,
        rangeShotDistance: number,
        auraRanges: number[],
        auraIsBuff: boolean[],
    ): void;

    public abstract cloneObject(newAmount?: number): boolean;

    public abstract deleteObject(): void;

    public abstract refreshScene(unitData: UnitProperties): void;

    public abstract setGridType(gridType: GridType): void;

    public abstract getGridType(): GridType;

    public PostSolve(_contact: b2Contact, _impulse: b2ContactImpulse): void {}

    public MouseDown(p: b2Vec2): void {
        this.sc_mouseWorld.Copy(p);

        this.sc_mouseTracing = true;
        this.sc_mouseTracerPosition.Copy(p);
        this.sc_mouseTracerVelocity.SetZero();

        if (this.sc_mouseJoint !== null) {
            this.sc_world.DestroyJoint(this.sc_mouseJoint);
            this.sc_mouseJoint = null;
        }

        if (this.sc_isAnimating) {
            return;
        }

        if (this.sc_renderSpellBookOverlay) {
            this.verifyButtonsTrigger();
            return;
        }

        if (this.sc_stepCount.getValue() - this.sc_mouseDownStep < STEPS_BETWEEN_MOUSE_ACTIONS_MIN) {
            return;
        }
        this.sc_mouseDownStep = this.sc_stepCount.getValue();

        let hit_fixture: b2Fixture | undefined;

        // Query the world for overlapping shapes.
        this.sc_world.QueryPointAABB(p, (fixture) => {
            const body = fixture.GetBody();
            if (body.GetType() === b2BodyType.b2_dynamicBody) {
                const inside = fixture.TestPoint(p);
                if (inside) {
                    hit_fixture = fixture;
                    return false; // We are done, terminate the query.
                }
            }
            return true; // Continue the query.
        });

        if (hit_fixture || this.sc_isSelection || this.sc_hoverAttackIsTargetingObstacle) {
            if (this.sc_mouseDropStep === this.sc_stepCount.getValue()) {
                return;
            }

            let attackLanded = false;
            const body = hit_fixture?.GetBody();

            if (this.sc_isSelection || this.sc_hoverAttackIsTargetingObstacle) {
                attackLanded = this.landAttack();
            } else {
                if (this.sceneStarted) {
                    if (!this.sc_isAIActive) {
                        attackLanded = this.landAttack();
                    }
                } else {
                    if (body && this.sc_selectedBody !== body) {
                        if (this.sc_selectedBody) {
                            this.sc_selectedBody.SetIsActive(false);
                        }
                        this.sc_selectedBody = body;
                    }
                }
            }

            if (!attackLanded && body) {
                this.setSelectedUnitProperties(body.GetUserData());

                if (this.sc_sceneSettings.isDraggable()) {
                    const md = new b2MouseJointDef();
                    md.bodyA = this.sc_groundBody;
                    md.bodyB = body;
                    md.target.Copy(p);
                    md.maxForce = 1000 * body.GetMass();
                    const frequencyHz = 5;
                    const dampingRatio = 0.7;
                    b2LinearStiffness(md, frequencyHz, dampingRatio, md.bodyA, md.bodyB);
                    this.sc_mouseJoint = this.sc_world.CreateJoint(md) as b2MouseJoint;
                    body.SetAwake(true);
                } else if (!this.sceneStarted) {
                    body.SetIsActive(true);
                    const unitData = body.GetUserData();
                    this.selectUnitPreStart(
                        unitData.team,
                        unitData.size === 1,
                        body.GetPosition(),
                        unitData.shot_distance,
                        unitData.aura_ranges,
                        unitData.aura_is_buff,
                    );
                }
            }
        } else if (this.sc_selectedBody) {
            this.handleMouseDownForSelectedBody();
        } else {
            this.verifyButtonsTrigger();
        }
    }

    public ShiftMouseDown(p: b2Vec2): void {
        if (this.sc_isAnimating) {
            return;
        }

        if (this.sc_stepCount.getValue() - this.sc_mouseDownStep < STEPS_BETWEEN_MOUSE_ACTIONS_MIN) {
            this.sc_mouseDownStep = this.sc_stepCount.getValue();
            return;
        }
        this.sc_mouseDownStep = this.sc_stepCount.getValue();

        let hit_fixture: b2Fixture | undefined;

        // Query the world for overlapping shapes.
        this.sc_world.QueryPointAABB(p, (fixture) => {
            const body = fixture.GetBody();
            if (body.GetType() === b2BodyType.b2_dynamicBody) {
                const inside = fixture.TestPoint(p);
                if (inside) {
                    hit_fixture = fixture;
                    return false;
                }
            }
            return true;
        });

        if (hit_fixture) {
            this.setSelectedUnitProperties(hit_fixture.GetBody().GetUserData());
        }
    }

    protected hover(): void {}

    public resetRightControls(): void {}

    public MouseUp(): void {
        this.sc_mouseTracing = false;
        this.sc_calculatingPlacement = true;

        if (this.sc_mouseJoint) {
            this.sc_world.DestroyJoint(this.sc_mouseJoint);
            this.sc_mouseJoint = null;
        }
    }

    public abstract requestTime(team: number): void;

    public startScene(): boolean {
        if (!this.sceneStarted) {
            this.sceneStarted = true;
            this.destroyTempFixtures();
            this.sc_hoverUnitNameStr = "";
            this.sc_hoverUnitLevel = 0;
            this.sc_hoverUnitMovementType = MovementType.NO_TYPE;
        }

        return this.sceneStarted;
    }

    protected abstract destroyTempFixtures(): void;

    public MouseMove(p: b2Vec2, leftDrag: boolean): void {
        this.sc_mouseWorld.Copy(p);

        if (this.sc_sceneSettings.isDraggable() && leftDrag && this.sc_mouseJoint) {
            this.sc_mouseJoint.SetTarget(p);
        }

        if (this.sc_isAnimating) {
            return;
        }

        this.hover();
    }

    public Resize(_width: number, _height: number) {}

    public RunStep(settings: Settings, fps: number) {
        this.sc_fps = fps;
        this.sc_statisticLines.length = 0;
        this.Step(settings, settings.m_hertz > 0 ? 1 / settings.m_hertz : 0);
    }

    public addDebug(label: string, value: string | number | boolean): void {
        this.sc_debugLines.push([label, `${value}`]);
    }

    public cleanupHoverText(updateNeeded = true): void {
        this.sc_attackDamageSpreadStr = "";
        this.sc_attackRangeDamageDivisorStr = "";
        this.sc_hoverUnitNameStr = "";
        this.sc_hoverInfoArr = [];
        this.sc_selectedAttackType = AttackType.NO_TYPE;
        this.sc_attackKillSpreadStr = "";
        this.sc_hoverUnitLevel = 0;
        this.sc_hoverUnitMovementType = MovementType.NO_TYPE;
        this.sc_hoverTextUpdateNeeded = updateNeeded;
    }

    protected setSelectedUnitProperties(unitProperties: UnitProperties): void {
        this.sc_selectedUnitProperties = unitProperties;

        const visibleAbilitiesImpact: IVisibleImpact[] = [];
        const visibleBuffsImpact: IVisibleImpact[] = [];
        const visibleDebuffsImpact: IVisibleImpact[] = [];

        for (let i = 0; i < unitProperties.abilities.length; i++) {
            const abilityName = unitProperties.abilities[i];
            const abilityDescription = unitProperties.abilities_descriptions[i];
            const isStackPowered = unitProperties.abilities_stack_powered[i];
            const isAura = unitProperties.abilities_auras[i];

            if (!abilityName || !abilityDescription) {
                break;
            }

            visibleAbilitiesImpact.push({
                name: abilityName,
                smallTextureName: AbilityHelper.abilityToTextureName(abilityName),
                description: abilityDescription,
                laps: Number.MAX_SAFE_INTEGER,
                stackPower: unitProperties.stack_power,
                isStackPowered: isStackPowered,
                isAura: isAura,
            });
        }

        if (
            unitProperties.applied_effects.length === unitProperties.applied_effects_laps.length &&
            unitProperties.applied_effects.length === unitProperties.applied_effects_descriptions.length
        ) {
            for (let i = 0; i < unitProperties.applied_effects.length; i++) {
                const lapsRemaining = unitProperties.applied_effects_laps[i];
                if (lapsRemaining < 1) {
                    continue;
                }

                const effectName = unitProperties.applied_effects[i];
                const description = unitProperties.applied_effects_descriptions[i];

                visibleDebuffsImpact.push({
                    name: effectName,
                    smallTextureName: AbilityHelper.abilityToTextureName(effectName),
                    description: description,
                    laps: lapsRemaining,
                    stackPower: 0,
                    isStackPowered: false,
                    isAura: false,
                });
            }
        }

        if (
            unitProperties.applied_buffs.length === unitProperties.applied_buffs_laps.length &&
            unitProperties.applied_buffs.length === unitProperties.applied_buffs_descriptions.length
        ) {
            for (let i = 0; i < unitProperties.applied_buffs.length; i++) {
                const lapsRemaining = unitProperties.applied_buffs_laps[i];
                if (lapsRemaining < 1) {
                    continue;
                }

                const buffName = unitProperties.applied_buffs[i];

                const description = unitProperties.applied_buffs_descriptions[i].split(";")[0];

                visibleBuffsImpact.push({
                    name: buffName,
                    smallTextureName: AbilityHelper.abilityToTextureName(buffName),
                    description: description,
                    laps: lapsRemaining,
                    stackPower: 0,
                    isStackPowered: false,
                    isAura: false,
                });
            }
        }

        if (
            unitProperties.applied_debuffs.length === unitProperties.applied_debuffs_laps.length &&
            unitProperties.applied_debuffs.length === unitProperties.applied_debuffs_descriptions.length
        ) {
            for (let i = 0; i < unitProperties.applied_debuffs.length; i++) {
                const lapsRemaining = unitProperties.applied_debuffs_laps[i];
                if (lapsRemaining < 1) {
                    continue;
                }

                const debuffName = unitProperties.applied_debuffs[i];
                const description = unitProperties.applied_debuffs_descriptions[i].split(";")[0];

                visibleDebuffsImpact.push({
                    name: debuffName,
                    smallTextureName: AbilityHelper.abilityToTextureName(debuffName),
                    description: description,
                    laps: lapsRemaining,
                    stackPower: 0,
                    isStackPowered: false,
                    isAura: false,
                });
            }
        }

        visibleBuffsImpact.sort((a, b) => {
            if (a.laps === b.laps) return 0;
            if (a.laps === Number.MAX_SAFE_INTEGER) return -1;
            if (b.laps === Number.MAX_SAFE_INTEGER) return 1;
            if (a.laps === HoCConstants.NUMBER_OF_LAPS_TOTAL) return 1;
            if (b.laps === HoCConstants.NUMBER_OF_LAPS_TOTAL) return -1;
            return a.laps - b.laps;
        });
        visibleDebuffsImpact.sort((a, b) => {
            if (a.laps === b.laps) return 0;
            if (a.laps === Number.MAX_SAFE_INTEGER) return -1;
            if (b.laps === Number.MAX_SAFE_INTEGER) return 1;
            if (a.laps === HoCConstants.NUMBER_OF_LAPS_TOTAL) return 1;
            if (b.laps === HoCConstants.NUMBER_OF_LAPS_TOTAL) return -1;
            return a.laps - b.laps;
        });

        this.sc_visibleOverallImpact = {
            abilities: visibleAbilitiesImpact,
            buffs: visibleBuffsImpact,
            debuffs: visibleDebuffsImpact,
        };

        this.sc_unitPropertiesUpdateNeeded = true;
    }

    public addStatistic(label: string, value: string | number | boolean): void {
        this.sc_statisticLines.push([label, `${value}`]);
    }

    public Step(settings: Settings, timeStep: number): void {
        this.sc_world.SetAllowSleeping(settings.m_enableSleep);
        this.sc_world.SetWarmStarting(settings.m_enableWarmStarting);
        this.sc_world.SetContinuousPhysics(settings.m_enableContinuous);
        this.sc_world.SetSubStepping(settings.m_enableSubStepping);

        this.sc_pointCount = 0;

        this.sc_world.Step(timeStep, {
            velocityIterations: settings.m_velocityIterations,
            positionIterations: settings.m_positionIterations,
            particleIterations: settings.m_particleIterations,
        });

        const draw = settings.m_debugDraw;
        const { aabb } = temp;
        g_camera.unproject({ x: 0, y: g_camera.getHeight() }, aabb.lowerBound);
        g_camera.unproject({ x: g_camera.getWidth(), y: 0 }, aabb.upperBound);

        if (settings.m_drawShapes) {
            DrawShapes(draw, this.sc_world, aabb);
        }
        if (settings.m_drawParticles) {
            DrawParticleSystems(draw, this.sc_world);
        }
        if (settings.m_drawJoints) {
            DrawJoints(draw, this.sc_world);
        }
        if (settings.m_drawAABBs) {
            DrawAABBs(draw, this.sc_world);
        }
        if (settings.m_drawCOMs) {
            DrawCenterOfMasses(draw, this.sc_world);
        }
        if (settings.m_drawControllers) {
            DrawControllers(draw, this.sc_world);
        }

        if (timeStep > 0) {
            this.sc_stepCount.increment();
        }

        if (settings.m_drawStats) {
            this.addStatistic("Bodies", this.sc_world.GetBodyCount());
            this.addStatistic("Contacts", this.sc_world.GetContactCount());
            this.addStatistic("Joints", this.sc_world.GetJointCount());
            this.addStatistic("Proxies", this.sc_world.GetProxyCount());
            this.addStatistic("Height", this.sc_world.GetTreeHeight());
            this.addStatistic("Balance", this.sc_world.GetTreeBalance());
            this.addStatistic("Quality", this.sc_world.GetTreeQuality().toFixed(2));
        }

        // Track maximum profile times
        {
            const p = this.sc_world.GetProfile();
            this.sc_maxProfile.step = Math.max(this.sc_maxProfile.step, p.step);
            this.sc_maxProfile.collide = Math.max(this.sc_maxProfile.collide, p.collide);
            this.sc_maxProfile.solve = Math.max(this.sc_maxProfile.solve, p.solve);
            this.sc_maxProfile.solveInit = Math.max(this.sc_maxProfile.solveInit, p.solveInit);
            this.sc_maxProfile.solveVelocity = Math.max(this.sc_maxProfile.solveVelocity, p.solveVelocity);
            this.sc_maxProfile.solvePosition = Math.max(this.sc_maxProfile.solvePosition, p.solvePosition);
            this.sc_maxProfile.solveTOI = Math.max(this.sc_maxProfile.solveTOI, p.solveTOI);
            this.sc_maxProfile.broadphase = Math.max(this.sc_maxProfile.broadphase, p.broadphase);

            this.sc_totalProfile.step += p.step;
            this.sc_totalProfile.collide += p.collide;
            this.sc_totalProfile.solve += p.solve;
            this.sc_totalProfile.solveInit += p.solveInit;
            this.sc_totalProfile.solveVelocity += p.solveVelocity;
            this.sc_totalProfile.solvePosition += p.solvePosition;
            this.sc_totalProfile.solveTOI += p.solveTOI;
            this.sc_totalProfile.broadphase += p.broadphase;
        }

        if (settings.m_drawProfile) {
            const p = this.sc_world.GetProfile();

            const aveProfile = new b2Profile();
            if (this.sc_stepCount.getValue() > 0) {
                const scale = 1 / this.sc_stepCount.getValue();
                aveProfile.step = scale * this.sc_totalProfile.step;
                aveProfile.collide = scale * this.sc_totalProfile.collide;
                aveProfile.solve = scale * this.sc_totalProfile.solve;
                aveProfile.solveInit = scale * this.sc_totalProfile.solveInit;
                aveProfile.solveVelocity = scale * this.sc_totalProfile.solveVelocity;
                aveProfile.solvePosition = scale * this.sc_totalProfile.solvePosition;
                aveProfile.solveTOI = scale * this.sc_totalProfile.solveTOI;
                aveProfile.broadphase = scale * this.sc_totalProfile.broadphase;
            }

            this.addDebug("Step [ave] (max)", formatValueAveMax(p.step, aveProfile.step, this.sc_maxProfile.step));
            this.addDebug(
                "Collide [ave] (max)",
                formatValueAveMax(p.collide, aveProfile.collide, this.sc_maxProfile.collide),
            );
            this.addDebug("Solve [ave] (max)", formatValueAveMax(p.solve, aveProfile.solve, this.sc_maxProfile.solve));
            this.addDebug(
                "Solve Init [ave] (max)",
                formatValueAveMax(p.solveInit, aveProfile.solveInit, this.sc_maxProfile.solveInit),
            );
            this.addDebug(
                "Solve Velocity [ave] (max)",
                formatValueAveMax(p.solveVelocity, aveProfile.solveVelocity, this.sc_maxProfile.solveVelocity),
            );
            this.addDebug(
                "Solve Position [ave] (max)",
                formatValueAveMax(p.solvePosition, aveProfile.solvePosition, this.sc_maxProfile.solvePosition),
            );
            this.addDebug(
                "Solve TOI [ave] (max)",
                formatValueAveMax(p.solveTOI, aveProfile.solveTOI, this.sc_maxProfile.solveTOI),
            );
            this.addDebug(
                "Broad-Phase [ave] (max)",
                formatValueAveMax(p.broadphase, aveProfile.broadphase, this.sc_maxProfile.broadphase),
            );
        }

        if (this.sc_sceneSettings.isDraggable() && this.sc_mouseTracing && !this.sc_mouseJoint) {
            const delay = 0.1;
            const acceleration = new b2Vec2();
            acceleration.x =
                (2 / delay) *
                ((1 / delay) * (this.sc_mouseWorld.x - this.sc_mouseTracerPosition.x) - this.sc_mouseTracerVelocity.x);
            acceleration.y =
                (2 / delay) *
                ((1 / delay) * (this.sc_mouseWorld.y - this.sc_mouseTracerPosition.y) - this.sc_mouseTracerVelocity.y);
            this.sc_mouseTracerVelocity.AddScaled(timeStep, acceleration);
            this.sc_mouseTracerPosition.AddScaled(timeStep, this.sc_mouseTracerVelocity);
        }

        if (settings.m_drawContactPoints) {
            const k_impulseScale = 0.1;
            const k_axisScale = 0.3;

            for (let i = 0; i < this.sc_pointCount; ++i) {
                const point = this.sc_points[i];

                if (point.state === b2PointState.b2_addState) {
                    // Add
                    draw.DrawPoint(point.position, 10, new b2Color(0.3, 0.95, 0.3));
                } else if (point.state === b2PointState.b2_persistState) {
                    // Persist
                    draw.DrawPoint(point.position, 5, new b2Color(0.3, 0.3, 0.95));
                }

                if (settings.m_drawContactNormals) {
                    const p1 = point.position;
                    const p2 = b2Vec2.Add(p1, b2Vec2.Scale(k_axisScale, point.normal, b2Vec2.s_t0), new b2Vec2());
                    draw.DrawSegment(p1, p2, new b2Color(0.9, 0.9, 0.9));
                } else if (settings.m_drawContactImpulse) {
                    const p1 = point.position;
                    const p2 = b2Vec2.AddScaled(p1, k_impulseScale * point.normalImpulse, point.normal, new b2Vec2());
                    draw.DrawSegment(p1, p2, new b2Color(0.9, 0.9, 0.3));
                }

                if (settings.m_drawFrictionImpulse) {
                    const tangent = b2Vec2.CrossVec2One(point.normal, new b2Vec2());
                    const p1 = point.position;
                    const p2 = b2Vec2.AddScaled(p1, k_impulseScale * point.tangentImpulse, tangent, new b2Vec2());
                    draw.DrawSegment(p1, p2, new b2Color(0.9, 0.9, 0.3));
                }
            }
        }
    }

    public GetDefaultViewZoom(edgesSize = EDGES_SIZE) {
        const widthRatio = window.innerWidth / (2048 + edgesSize);
        const heightRatio = window.innerHeight / (2048 + edgesSize);
        return Math.min(widthRatio, heightRatio);
    }

    public getCenter(): XY {
        return {
            x: 0,
            y: MAX_X,
        };
    }

    public Destroy() {}
}
