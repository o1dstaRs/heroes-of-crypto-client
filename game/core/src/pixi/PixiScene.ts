// game/core/src/pixi/PixiScene.ts
import { Texture } from "pixi.js";
import {
    HoCConstants,
    HoCLib,
    HoCMath,
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
    AbilityHelper,
} from "@heroesofcrypto/common";

import {
    IVisibleButton,
    IVisibleImpact,
    IVisibleOverallImpact,
    IVisibleState,
    VisibleButtonState,
} from "../scenes/VisibleState";
import { EDGES_SIZE, MAX_FPS } from "../statics";
import { HotKey } from "../utils/hotkeys";
import { SceneLog } from "../scenes/SceneLog";
import { SceneSettings } from "../scenes/SceneSettings";
import { PixiSceneManager } from "./PixiSceneManager";
import { PreloadedPixiTextures } from "./PixiTextureLoader";
import { UnitsOverlay } from "../scenes/UnitsOverlay";

const STEPS_BETWEEN_MOUSE_ACTIONS_MIN = 2;

/** Minimal shape of objects your scene selects / manipulates. */
export interface BodyLike {
    GetUserData: <T = unknown>() => T | undefined;
}

/** If you later model a drag/constraint, replace this with a real type. */
export type MouseJointLike = object | null;

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
    private sc_sceneStarted = false;
    public readonly sc_debugLines: Array<[string, string]> = [];
    public readonly sc_statisticLines: Array<[string, string]> = [];
    public readonly sc_sceneLog = new SceneLog();
    public readonly sc_maxProfile = { step: 0, collide: 0, solve: 0 }; // parity with old UI
    public readonly sc_totalProfile = { step: 0, collide: 0, solve: 0 }; // parity with old UI
    public readonly sc_sceneSettings: SceneSettings;
    public sc_currentActiveShotRange?: { xy: HoCMath.XY; distance: number };
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
    public sc_selectedUnitProperties?: Readonly<UnitProperties>;
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
    protected sc_mouseWorld: HoCMath.XY = { x: 0, y: 0 };
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
        // 🔗 Always clear UnitsOverlay chip selection when we deselect in the scene
        const overlay = this.getUnitsOverlay?.();
        if (overlay && overlay.hasSelection()) {
            // notify = false to avoid calling onUnitSelected(null) → Deselect() recursion
            overlay.clearSelection(false);
        }

        if (this.sc_sceneStarted && _onlyWhenNotStarted) {
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
    protected texAny = (key: string): Texture | undefined => {
        return (this.textures as unknown as Record<string, Texture>)[key];
    };
    public getBaseHotkeys(): HotKey[] {
        return [];
    }
    public getHotkeys(): HotKey[] {
        return [];
    }
    protected abstract landAttack(): boolean;
    protected abstract finishDrop(positionToDropTo: HoCMath.XY): void;
    protected abstract handleMouseDownForSelectedBody(): void;
    protected abstract selectUnitPreStart(
        team: TeamType,
        isSmallUnit: boolean,
        position: HoCMath.XY,
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
    public MouseDown(_p: HoCMath.XY): void {
        // Treat _p as world coords (caller already converted if needed).
        this.sc_mouseWorld = _p;

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

        const hit_fixture: BodyLike | undefined = undefined;

        if (hit_fixture || this.sc_isSelection || this.sc_hoverAttackIsTargetingObstacle) {
            if (this.sc_mouseDropStep === this.sc_stepCount.getValue()) return;

            let attackLanded = false;

            if (this.sc_isSelection || this.sc_hoverAttackIsTargetingObstacle) {
                attackLanded = this.landAttack();
            } else {
                if (this.sc_sceneStarted) {
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
    public CameraChanged(): void {
        // default no-op; scenes can override to reattach overlays, relayout, etc.
    }
    public ShiftMouseDown(_p: HoCMath.XY): void {
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
        if (!this.sc_sceneStarted) {
            this.sc_sceneStarted = true;
            this.destroyTempFixtures();
            this.sc_hoverUnitNameStr = "";
            this.sc_hoverUnitLevel = 0;
            this.sc_hoverUnitMovementType = MovementVals.NO_MOVEMENT;
        }
        return this.sc_sceneStarted;
    }
    protected abstract destroyTempFixtures(): void;
    public MouseMove(_p: HoCMath.XY, _leftDrag: boolean): void {
        if (this.sc_isAnimating) return;

        // Remember last world position
        this.sc_mouseWorld = _p;

        // If you had drag logic, it would live here.
        this.hover();
    }
    public Resize(_width: number, _height: number) {}
    public RunStep(fps: number) {
        this.sc_fps = fps;
        this.sc_statisticLines.length = 0;
        this.Step(1 / 240);
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
                smallTextureName: AbilityHelper.abilityToTextureName(abilityName),
                description: abilityDescription,
                laps: Number.MAX_SAFE_INTEGER,
                stackPower: unitProperties.stack_power,
                isStackPowered,
                isAura,
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
    /** Main per-frame scene update (no Box2D). */
    public Step(timeStep: number): void {
        if (timeStep > 0) this.sc_stepCount.increment();

        // Example: update scene manager, animations, AI, etc.
        // this.pixiSceneManager.update(timeStep);
        //
    }
    public GetDefaultViewZoom(edgesPx = EDGES_SIZE): number {
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
    public HomeCamera(): void {
        const minX = -1024,
            maxX = 1024;
        const minY = 0,
            maxY = 2048;

        const worldW = maxX - minX; // 2048
        const worldH = maxY - minY; // 2048

        // read renderer size (you locked to 2048×2048, but this is general)
        const app = this.pixiSceneManager.getApplication();
        const viewW = app.renderer.width;
        const viewH = app.renderer.height;

        const z = Math.min(viewW / worldW, viewH / worldH); // fit
        const cx = (minX + maxX) * 0.5; // 0
        const cy = (minY + maxY) * 0.5; // 1024

        this.pixiSceneManager.setCameraZoom(z);
        this.pixiSceneManager.setCameraPosition(cx, cy);
    }
    public getCenter(): HoCMath.XY {
        return { x: 0, y: 1024 };
    }
    public Destroy() {}
}
