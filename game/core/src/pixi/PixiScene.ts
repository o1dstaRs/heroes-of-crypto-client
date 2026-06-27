// game/core/src/pixi/PixiScene.ts
import { Texture } from "pixi.js";
import { Signal } from "typed-signals";
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
    FactionVals,
    AttackType,
    GridType,
    SynergyWithLevel,
    AbilityHelper,
    GridSettings,
    type GameAction,
    type GameEvent,
} from "@heroesofcrypto/common";
import type {
    AuthoritativeGameSnapshot,
    SceneGameActionTransport,
    SceneGameActionTransportResult,
} from "../game_action_transport";
import type { SandboxReplay } from "../replay/sandbox_replay";

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
import { PixiApp } from "./PixiApp";
import { PixiDrawer } from "./PixiDrawer";
import { SimplePhysicsManager } from "./SimplePhysicsManager";
import { PreloadedPixiTextures } from "./PixiTextureLoader";
import { images as rawImageUrls } from "../generated/image_imports";
import { UnitsOverlay } from "../scenes/UnitsOverlay";

export interface AuthoritativeSnapshotOptions {
    /**
     * Set when the caller already animated+applied this snapshot's board changes
     * (e.g. by playing the matching authoritative action record). The scene should
     * then skip its destructive full rebuild (which would restart unit animations)
     * and only reconcile lightweight state (turn queue, visible state).
     */
    skipBoardRebuild?: boolean;
}

const STEPS_BETWEEN_MOUSE_ACTIONS_MIN = 2;

/** Minimal shape of objects your scene selects / manipulates. */
export interface BodyLike {
    GetUserData: <T = unknown>() => T | undefined;
}

/** If you later model a drag/constraint, replace this with a real type. */
export type MouseJointLike = object | null;

export interface PixiSceneContext {
    pixiApp: PixiApp;
    textures: PreloadedPixiTextures;
    gridSettings: GridSettings;
    onHasStarted: Signal<(started: boolean) => void>;
    gameActionTransport?: SceneGameActionTransport;
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
    protected sc_onHasStarted!: Signal<(started: boolean) => void>;
    // PixiJS components
    protected pixiApp!: PixiApp;
    protected textures!: PreloadedPixiTextures;
    protected drawer!: PixiDrawer;
    protected physicsManager!: SimplePhysicsManager;
    protected sc_gameActionTransport?: SceneGameActionTransport;
    protected animating = false;
    protected constructor(sceneSettings: SceneSettings) {
        this.sc_sceneSettings = sceneSettings;
    }
    /** Call this from your scene’s constructor: `this.initialize(context)` */
    protected initialize(context: PixiSceneContext) {
        this.pixiApp = context.pixiApp;
        this.textures = context.textures;
        this.sc_onHasStarted = context.onHasStarted;
        this.sc_gameActionTransport = context.gameActionTransport;

        // Physics - initialized here as it doesn't need Grid
        this.physicsManager = new SimplePhysicsManager();
        // Drawer must be initialized by subclass (e.g. Sandbox) after Grid creation
    }
    public setGameActionTransport(transport?: SceneGameActionTransport): void {
        this.sc_gameActionTransport = transport;
    }
    public applyAuthoritativeSnapshot(
        _snapshot: AuthoritativeGameSnapshot,
        _options?: AuthoritativeSnapshotOptions,
    ): void {}
    public applyAuthoritativeVfx(_events: GameEvent[]): void {}
    public applyAuthoritativeReplaySnapshot(snapshot: AuthoritativeGameSnapshot): void {
        this.applyAuthoritativeSnapshot(snapshot);
    }
    public playAuthoritativeActionRecord(
        _action: GameAction,
        _events: GameEvent[],
        _stateAfter?: unknown,
    ): Promise<boolean> {
        return Promise.resolve(false);
    }
    public selectAuthoritativeUnit(_unitId: string): void {}
    // Ranked move-intent relay (implemented by Sandbox); no-ops in the base scene.
    public setMoveIntentSink(
        _sink?: (unitId: string | undefined, cell: HoCMath.XY | undefined) => void,
    ): void {}
    public setOpponentMoveIntent(_intent?: { unitId: string; cell: HoCMath.XY }): void {}
    protected dispatchExternalGameAction(
        action: Parameters<SceneGameActionTransport>[0],
    ): SceneGameActionTransportResult {
        if (!this.sc_gameActionTransport) {
            return { handled: false };
        }
        return this.sc_gameActionTransport(action);
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
    public abstract getNumberOfPlacedUnits(teamType: TeamType): number;
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
        const preloaded = (this.textures as unknown as Record<string, Texture>)[key];
        if (preloaded) {
            return preloaded;
        }
        // Fallback: lazily build the texture straight from the raw image-URL map (the same path
        // UnitChip/Up-Next use successfully). The bundle preload can drop a key when a concurrent
        // WebP decode flakes out — notably unit `_128` board sprites in ranked, which then render
        // as bare team-colour markers. Resolving from the URL recovers them.
        const url = (rawImageUrls as unknown as Record<string, string>)[key];
        if (!url) {
            return undefined;
        }
        try {
            return Texture.from(url);
        } catch {
            return undefined;
        }
    };
    public getBaseHotkeys(): HotKey[] {
        return [];
    }
    public getHotkeys(): HotKey[] {
        return [];
    }
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
        this.verifyButtonsTrigger();
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
    protected canShowHoverForActiveUnit(): boolean {
        return true;
    }
    protected hover(): void {}
    /** Optional hook for scenes to react to background asset loading progress (Tier 2) */
    public onBackgroundAssetLoad?(progress: number): void;
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
    /** Overridden by scenes that support replaying the previous fight. */
    public rematchLastFight(): boolean {
        return false;
    }
    public getCurrentSandboxReplay(): SandboxReplay | undefined {
        return undefined;
    }
    public canPlayCurrentSandboxReplay(): boolean {
        return false;
    }
    public playSandboxReplay(_replay: SandboxReplay, _throughSequence?: number): boolean | Promise<boolean> {
        return false;
    }
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
    public RunStep(timeStep: number) {
        // FPS is set once per rendered frame by the loop driver; this may run multiple times per
        // frame (fixed-timestep accumulator), so only advance the sim here.
        this.sc_statisticLines.length = 0;
        this.Step(timeStep);
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
        this.sc_selectedFactionType = FactionVals.NO_FACTION as FactionType;
        this.sc_factionNameUpdateNeeded = true;

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

        // Update physics
        this.physicsManager.update(timeStep * 1000); // Physics wants ms? physicsManager.update(deltaTimeMs)

        // Draw overlays / helpers
        // Check drawer exists because it's initialized by subclass
        if (this.drawer) {
            this.drawer.update(timeStep * 1000);
        }
    }
    public Destroy() {
        if (this.drawer) this.drawer.destroy();
    }
    // ------- Delegates from Manager -------
    public fitWorldToViewport(minX: number, minY: number, maxX: number, maxY: number, padding = 0): void {
        const { width, height } = this.getViewportSize(); // CSS pixels
        const worldW = Math.max(1, maxX - minX);
        const worldH = Math.max(1, maxY - minY);
        const viewW = Math.max(1, width - padding * 2);
        const viewH = Math.max(1, height - padding * 2);

        const zoom = Math.min(viewW / worldW, viewH / worldH);
        const cx = (minX + maxX) * 0.5;
        const cy = (minY + maxY) * 0.5;

        // Use direct cam control if possible or via PixiSceneManager?
        // Original code used this.pixiApp.setCameraZoom/Position
        // PixiSceneManager delegates to PixiApp? Or usage changed?
        // Using this.pixiSceneManager as it exposes setCamera methods in HomeCamera example
        this.pixiApp.setCameraZoom(zoom);
        // y-up: flip Y via scale if needed, but setCameraZoom handles generic zoom.
        this.pixiApp.setCameraZoom(zoom);
        // y-up: flip Y via scale if needed, but setCameraZoom handles generic zoom.
        // If we need manual root manipulation:
        this.pixiApp.getCamera(); // Assuming this exists or use pixiApp.getCamera()
        // Wait, fitWorldToViewport logic in broken file lines 567 used this.pixiApp.getCamera()
        // Let's use logic consistent with HomeCamera (lines 540 in clean file uses pixiSceneManager)
        // But logic in broken file lines 569 changed scale.set(zoom, -zoom).
        // Let's assume standard setCameraZoom is safer.
        this.pixiApp.setCameraPosition(cx, cy);
    }
    public getViewportSize(): { width: number; height: number } {
        const app = this.pixiApp.getApplication(); // Use pixiApp directly as restored
        const renderer = app.renderer as { width?: number; height?: number } | null | undefined;
        if (renderer?.width && renderer?.height) {
            return { width: renderer.width, height: renderer.height };
        }
        return { width: window.innerWidth || 2048, height: window.innerHeight || 2048 };
    }
    // ------- Drawer delegates -------
    public drawPath(
        color: number,
        currentActivePath?: HoCMath.XY[],
        currentActiveUnitPositions?: HoCMath.XY[],
        hoverAttackFromHashes?: Set<number>,
        drawSolid = true,
    ): void {
        this.drawer?.drawPath(color, currentActivePath, currentActiveUnitPositions, hoverAttackFromHashes, drawSolid);
    }
    public drawAttackTo(targetPosition: HoCMath.XY, size: number): void {
        this.drawer?.drawAttackTo(targetPosition, size);
    }
    public drawHoverCells(cells?: HoCMath.XY[], hoverSelectedCellsSwitchToRed = false): void {
        this.drawer?.drawHoverCells(cells, hoverSelectedCellsSwitchToRed);
    }
    public setHoleLayers(numberOfLayers: number): void {
        this.drawer?.setHoleLayers(numberOfLayers);
    }
    public setGridType(gridType: GridType): void {
        this.drawer?.setGridType(gridType);
    }
    // ------- Animation flags -------
    public setAnimating(animating: boolean) {
        this.sc_isAnimating = animating;
        // Old code used this.animating = animating; but sc_isAnimating is standard prefix
    }
    public isAnimating(): boolean {
        return this.sc_isAnimating;
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
        const { width, height } = this.getViewportSize();
        const viewW = Math.max(1, width - edgesPx);
        const viewH = Math.max(1, height - edgesPx);

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
        const { width: viewW, height: viewH } = this.getViewportSize();

        const z = Math.min(viewW / worldW, viewH / worldH); // fit
        const cx = (minX + maxX) * 0.5; // 0
        const cy = (minY + maxY) * 0.5; // 1024

        this.pixiApp.setCameraZoom(z);
        this.pixiApp.setCameraPosition(cx, cy);
    }
    public getCenter(): HoCMath.XY {
        return { x: 0, y: 1024 };
    }
}
