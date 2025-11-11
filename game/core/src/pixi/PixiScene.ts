// game/core/src/pixi/PixiScene.ts
import { Texture } from "pixi.js";
import {
    HoCConstants,
    HoCLib,
    Augment,
    IAuraOnMap,
    UnitProperties,
    IDamageStatistic,
    IVisibleDamage,
    AttackVals,
    MovementVals,
    TeamType,
    FactionType,
    AttackType,
    GridType,
    SynergyWithLevel,
} from "@heroesofcrypto/common";

import { Settings } from "../settings";
import {
    IVisibleButton,
    IVisibleImpact,
    IVisibleOverallImpact,
    IVisibleState,
    VisibleButtonState,
} from "../state/visible_state";
import { EDGES_SIZE, MAX_FPS } from "../statics";
import { HotKey } from "../utils/hotkeys";
import { SceneLog } from "../scenes/scene_log";
import { SceneSettings } from "../scenes/scene_settings";
import { PixiSceneManager } from "./PixiSceneManager";
import { PreloadedPixiTextures } from "./PixiTextureLoader";
import { UnitsOverlay } from "../scenes/UnitsOverlay";

const STEPS_BETWEEN_MOUSE_ACTIONS_MIN = 4;

/** Minimal shape of objects your scene selects / manipulates. */
export interface BodyLike {
    GetUserData: <T = unknown>() => T | undefined;
}

/** If you later model a drag/constraint, replace this with a real type. */
export type MouseJointLike = object | null;

/** Screen/world 2D coordinate */
export interface XY {
    x: number;
    y: number;
}

export interface PixiSceneContext {
    pixiSceneManager: PixiSceneManager;
    textures: PreloadedPixiTextures;
}

export interface SceneConstructor {
    new (context: PixiSceneContext): PixiScene;
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
    console.log("SSSSS2");
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
            return { name, scenes };
        });
}

export abstract class PixiScene {
    private sceneStarted = false;
    public readonly sc_debugLines: Array<[string, string]> = [];
    public readonly sc_statisticLines: Array<[string, string]> = [];
    public readonly sc_sceneLog = new SceneLog();
    public readonly sc_maxProfile = { step: 0, collide: 0, solve: 0 }; // parity with old UI
    public readonly sc_totalProfile = { step: 0, collide: 0, solve: 0 }; // parity with old UI
    public readonly sc_sceneSettings: SceneSettings;
    public sc_currentActiveShotRange?: { xy: XY; distance: number };
    public sc_currentActiveAuraRanges: IAuraOnMap[] = [];
    public sc_unitInfoLines: Array<[string, string]> = [];
    public sc_attackDamageSpreadStr = "";
    public sc_attackRangeDamageDivisorStr = "";
    public sc_attackKillSpreadStr = "";
    public sc_hoverInfoArr: string[] = [];
    public sc_hoverUnitNameStr = "";
    public sc_hoverUnitLevel = 0;
    public sc_hoverUnitMovementType = MovementVals.NO_MOVEMENT;
    public sc_pointCount = 0; // parity field
    public sc_mouseTracing = false;
    public sc_calculatingPlacement = true;
    public sc_stepCount: HoCLib.RefNumber = new HoCLib.RefNumber(0);
    public sc_fps = MAX_FPS;
    // Previously Box2D objects — keep flexible but typed.
    public sc_selectedBody: BodyLike | undefined;
    public sc_selectedUnitProperties?: UnitProperties;
    public sc_selectedFactionType?: FactionType;
    public sc_selectedAttackType: AttackType = AttackVals.NO_ATTACK;
    public sc_visibleState?: IVisibleState;
    public sc_visibleOverallImpact?: IVisibleOverallImpact;
    public sc_groundBody: BodyLike | undefined;
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
    public sc_damageForAnimation: IVisibleDamage = {
        amount: 0,
        render: false,
        unitPosition: { x: 0, y: 0 },
        unitIsSmall: true,
    };
    public sc_gridTypeUpdateNeeded = false;
    public sc_moveBlocked = false;
    public sc_augmentChanged = false;
    public sc_buttonGroupUpdated = false;
    protected sc_isAnimating = false;
    protected sc_isAIActive = false;
    protected sc_renderSpellBookOverlay = false;
    // PixiJS components
    protected pixiSceneManager!: PixiSceneManager;
    protected textures!: PreloadedPixiTextures;
    protected constructor(sceneSettings: SceneSettings) {
        this.sc_sceneSettings = sceneSettings;
    }
    /** Call this from your scene’s constructor: `this.initialize(context)` */
    protected initialize(context: PixiSceneContext) {
        this.pixiSceneManager = context.pixiSceneManager;
        this.textures = context.textures;
    }
    public setupControls() {}
    protected selectedSmallUnit(): boolean {
        const data = this.sc_selectedBody?.GetUserData?.() as { size?: number } | undefined;
        return !!data && data.size === 1;
    }
    protected selectedLargeUnit(): boolean {
        const data = this.sc_selectedBody?.GetUserData?.() as { size?: number } | undefined;
        return !!data && data.size === 2;
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
            }
            this.sc_renderSpellBookOverlay = false;
            return;
        }

        if (this.sc_selectedBody) {
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
    // ---- helper: dynamic access without fighting the strict key type
    protected texAny(key: string): Texture | undefined {
        return (this.textures as unknown as Record<string, Texture>)[key];
    }
    public getBaseHotkeys(): HotKey[] {
        return [];
    }
    public getHotkeys(): HotKey[] {
        return [];
    }
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
    /** MouseDown from screen coords (already converted to world if needed by caller) */
    public MouseDown(_p: XY): void {
        // If needed, convert via camera: const world = this.pixiSceneManager.unproject(_p)
        this.sc_mouseTracing = true;

        // Clear previous drag analogue
        if (this.sc_mouseJoint !== null) {
            this.sc_mouseJoint = null;
        }

        if (this.sc_isAnimating) return;

        if (this.sc_renderSpellBookOverlay) {
            this.verifyButtonsTrigger();
            return;
        }

        if (this.sc_stepCount.getValue() - this.sc_mouseDownStep < STEPS_BETWEEN_MOUSE_ACTIONS_MIN) {
            return;
        }
        this.sc_mouseDownStep = this.sc_stepCount.getValue();

        // If you expose a hit-test on the scene manager, you can use it here:
        // const hit = this.pixiSceneManager.hitTest(_p.x, _p.y);
        const hit_fixture: BodyLike | undefined = undefined;

        if (hit_fixture || this.sc_isSelection || this.sc_hoverAttackIsTargetingObstacle) {
            if (this.sc_mouseDropStep === this.sc_stepCount.getValue()) return;

            let attackLanded = false;

            if (this.sc_isSelection || this.sc_hoverAttackIsTargetingObstacle) {
                attackLanded = this.landAttack();
            } else {
                if (this.sceneStarted) {
                    if (!this.sc_isAIActive) {
                        attackLanded = this.landAttack();
                    }
                } else {
                    // Pre-start selection logic placeholder (if you keep a body)
                }
            }

            if (!attackLanded) {
                // Optionally: setSelectedUnitProperties(...) based on hit
            }
        } else if (this.sc_selectedBody) {
            this.handleMouseDownForSelectedBody();
        } else {
            this.verifyButtonsTrigger();
        }
    }
    public ShiftMouseDown(_p: XY): void {
        if (this.sc_isAnimating) return;

        if (this.sc_stepCount.getValue() - this.sc_mouseDownStep < STEPS_BETWEEN_MOUSE_ACTIONS_MIN) {
            this.sc_mouseDownStep = this.sc_stepCount.getValue();
            return;
        }
        this.sc_mouseDownStep = this.sc_stepCount.getValue();

        // e.g. const hit = this.pixiSceneManager.hitTest(_p.x, _p.y);
        // if (hit) this.setSelectedUnitProperties(hit.GetUserData?.() as UnitProperties);
    }
    protected hover(): void {}
    public resetRightControls(): void {}
    public MouseUp(): void {
        this.sc_mouseTracing = false;
        this.sc_calculatingPlacement = true;

        if (this.sc_mouseJoint) {
            this.sc_mouseJoint = null;
        }
    }
    // Mouse joint equivalent holder for API parity
    protected sc_mouseJoint: MouseJointLike = null;
    public abstract requestTime(team: number): void;
    public startScene(): boolean {
        if (!this.sceneStarted) {
            this.sceneStarted = true;
            this.destroyTempFixtures();
            this.sc_hoverUnitNameStr = "";
            this.sc_hoverUnitLevel = 0;
            this.sc_hoverUnitMovementType = MovementVals.NO_MOVEMENT;
        }
        return this.sceneStarted;
    }
    protected abstract destroyTempFixtures(): void;
    public MouseMove(_p: XY, _leftDrag: boolean): void {
        // If you had a drag target: if (this.sc_sceneSettings.isDraggable() && _leftDrag && this.sc_mouseJoint) { ... }
        if (this.sc_isAnimating) return;
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
        this.sc_selectedAttackType = AttackVals.NO_ATTACK;
        this.sc_attackKillSpreadStr = "";
        this.sc_hoverUnitLevel = 0;
        this.sc_hoverUnitMovementType = MovementVals.NO_MOVEMENT;
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

            if (!abilityName || !abilityDescription) break;

            visibleAbilitiesImpact.push({
                name: abilityName,
                smallTextureName: "",
                description: abilityDescription,
                laps: Number.MAX_SAFE_INTEGER,
                stackPower: unitProperties.stack_power,
                isStackPowered,
                isAura,
            });
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
    /** Main per-frame scene update (no Box2D). */
    public Step(settings: Settings, timeStep: number): void {
        if (timeStep > 0) this.sc_stepCount.increment();

        // Example: update scene manager, animations, AI, etc.
        // this.pixiSceneManager.update(timeStep);
        //
        if (settings.m_drawStats) {
            this.addStatistic("Objects", 0);
            this.addStatistic("Textures", 0);
        }
    }
    public GetDefaultViewZoom(edgesPx = EDGES_SIZE): number {
        console.log("szzolotu GetDefaultViewZoom");
        const gs = this.sc_sceneSettings.getGridSettings();
        const minX = gs.getMinX();
        const minY = gs.getMinY();
        const maxX = gs.getMaxX();
        const maxY = gs.getMaxY();

        const worldW = maxX - minX;
        const worldH = maxY - minY;

        // Read current render size from Pixi (device pixels already accounted for by renderer)
        const app = this.pixiSceneManager.getApplication();
        const viewW = Math.max(1, app.renderer.width - edgesPx);
        const viewH = Math.max(1, app.renderer.height - edgesPx);

        // Fit whole board
        return Math.min(viewW / worldW, viewH / worldH);
    }
    public getUnitsOverlay(): UnitsOverlay | undefined {
        return undefined;
    }
    public HomeCamera(edgesPx = EDGES_SIZE): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const minX = gs.getMinX();
        const minY = gs.getMinY();
        const maxX = gs.getMaxX();
        const maxY = gs.getMaxY();

        const worldW = Math.max(1, maxX - minX);
        const worldH = Math.max(1, maxY - minY);

        // Your renderer is fixed to 2048×2048; if not, read from renderer.width/height instead.
        const viewW = Math.max(1, 2048 - edgesPx * 2);
        const viewH = Math.max(1, 2048 - edgesPx * 2);

        const zoom = Math.min(viewW / worldW, viewH / worldH);
        const cx = (minX + maxX) * 0.5;
        const cy = (minY + maxY) * 0.5;

        this.pixiSceneManager.setCameraPosition(cx, cy);
        this.pixiSceneManager.setCameraZoom(zoom);
    }
    public getCenter(): XY {
        return { x: 0, y: 1024 };
    }
    public Destroy() {}
}
