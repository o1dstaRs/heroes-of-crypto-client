// game/core/src/PixiGameManager.ts
import { Application, Container } from "pixi.js";
import {
    UnitProperties,
    GridSettings,
    HoCConstants,
    Augment,
    IDamageStatistic,
    SynergyWithLevel,
    FactionVals,
    TeamType,
    FactionType,
    GridType,
} from "@heroesofcrypto/common";
import { createContext, useContext } from "react";
import { Signal } from "typed-signals";

import {
    IHoverInfo,
    IVisibleButton,
    IVisibleOverallImpact,
    IVisibleState,
    VisibleButtonState,
} from "../scenes/VisibleState";
import { MAX_FPS } from "../statics";
import { FpsCalculator } from "./FpsCalculator";
import { HotKey, hotKeyPress } from "../utils/hotkeys";
import type { UnitsOverlay } from "../scenes/UnitsOverlay";
import { PixiApp } from "./PixiApp";
import { PixiSceneManager } from "./PixiSceneManager";
import { preloadPixiTextures, PreloadedPixiTextures } from "./PixiTextureLoader";

import "../scenes";
import type { PixiScene, PixiSceneContext, SceneConstructor, SceneEntry } from "./PixiScene";
import { getScenesGrouped } from "./PixiScene";

// A scene that (optionally) exposes the overlay
type SceneWithUnitsOverlay = PixiScene & {
    getUnitsOverlay?: () => UnitsOverlay | undefined;
};

// Safe accessor
function getUnitsOverlayFromScene(scene: PixiScene | null): UnitsOverlay | undefined {
    const s = scene as SceneWithUnitsOverlay | null;
    return s?.getUnitsOverlay?.();
}

export class PixiGameManager {
    public m_fpsCalculator = new FpsCalculator(200, 1000, MAX_FPS);
    public m_scene: PixiScene | null = null;
    public m_lMouseDown = false;
    public m_rMouseDown = false;
    private m_mouse = { x: 0, y: 0 };
    private sceneBaseHotKeys: HotKey[] = [];
    private sceneHotKeys: HotKey[] = [];
    private allHotKeys: HotKey[] = [];
    private stepHotKeys: HotKey[] = [];
    public readonly groupedScenes: { name: string; scenes: SceneEntry[] }[] = getScenesGrouped();
    public readonly flatScenes: SceneEntry[] = [];
    private sceneConstructor: SceneConstructor | null = null;
    private sceneTitle = "Heroes";
    public readonly onHasStarted = new Signal<(started: boolean) => void>();
    public readonly onHasButtonsGroupUpdate = new Signal<(updated: boolean) => void>();
    public readonly onPlacementChanged = new Signal<(changed: boolean) => void>();
    public readonly onAugmentChanged = new Signal<(changed: boolean) => void>();
    public readonly onGridTypeChanged = new Signal<(gridType: GridType) => void>();
    public readonly onAttackLanded = new Signal<(attackMessage: string) => void>();
    public readonly onDamageReceived = new Signal<(attackDamage: number) => void>();
    // public readonly onUnitSelected = new Signal<(unitProperties: UnitProperties) => void>();
    public readonly onDamageStatisticsUpdated = new Signal<(damageStats: IDamageStatistic[]) => void>();
    public readonly onPossibleSynergiesUpdated = new Signal<(possible: Map<TeamType, SynergyWithLevel[]>) => void>();
    // public readonly onFactionSelected = new Signal<(factionType: FactionType) => void>();
    public readonly onVisibleStateUpdated = new Signal<(visibleState: IVisibleState) => void>();
    // public readonly onVisibleOverallImpactUpdated = new Signal<(impact: IVisibleOverallImpact) => void>();
    public readonly onHoverInfoUpdated = new Signal<(hover: IHoverInfo) => void>();
    public readonly onSelectionCombined = new Signal<
        (payload: { unit: UnitProperties | null; impact: IVisibleOverallImpact | null; faction: FactionType }) => void
    >();
    private m_hoveringCanvas = false;
    private m_keyMap: Record<string, boolean> = {};
    private isInitialized = false;
    private activateScene: (entry: SceneEntry) => void = () => {};
    private started = false;
    private lastSentEmptyHoverInfo = false;
    private amountOfSelectedObjects = 1;
    private pixiApp: PixiApp | null = null;
    private pixiSceneManager: PixiSceneManager | null = null;
    private textures: PreloadedPixiTextures | null = null;
    private forwardOverlayInteraction?: (e: PointerEvent) => void;
    private overlayDebugCanvas?: HTMLCanvasElement;
    public constructor() {
        for (const { scenes } of this.groupedScenes) this.flatScenes.push(...scenes);
    }
    /** Throwing getters to keep TypeScript happy without ‘never’ intersections */
    private get _pixiApp(): PixiApp {
        if (!this.pixiApp) throw new Error("PixiGameManager: pixiApp not initialized yet");
        return this.pixiApp;
    }
    private get _pixiSceneManager(): PixiSceneManager {
        if (!this.pixiSceneManager) throw new Error("PixiGameManager: pixiSceneManager not initialized yet");
        return this.pixiSceneManager;
    }
    private get _textures(): PreloadedPixiTextures {
        if (!this.textures) throw new Error("PixiGameManager: textures not initialized yet");
        return this.textures;
    }
    public async init(
        glCanvas: HTMLCanvasElement,
        debugCanvas: HTMLCanvasElement,
        wrapper: HTMLDivElement,
        activateScene: (entry: SceneEntry) => void,
    ) {
        if (this.isInitialized) return;
        this.activateScene = activateScene;

        // Input handlers (unchanged) ...
        debugCanvas.addEventListener("mousedown", (e) => this.HandleMouseDown(e));
        debugCanvas.addEventListener("mouseup", (e) => this.HandleMouseUp(e));
        debugCanvas.addEventListener("mousemove", (e) => this.HandleMouseMove(e));
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape") this.HandleEscapeKey(true);
        });
        debugCanvas.addEventListener("mouseenter", () => (this.m_hoveringCanvas = true));
        debugCanvas.addEventListener("mouseleave", () => (this.m_hoveringCanvas = false));

        // Init Pixi using wrapper size
        this.pixiApp = new PixiApp(); // sync constructor
        await this.pixiApp.init(glCanvas, 2048, 2048); // async init, safe to await here

        // Preload textures & scene manager
        this.textures = await preloadPixiTextures();
        const gridSettings = new GridSettings(32, 1024, 0, 1024, 0, 32, 16);
        this.pixiSceneManager = new PixiSceneManager(this.pixiApp, gridSettings);

        window.addEventListener("keydown", (e) => this.HandleKey(e, true));
        window.addEventListener("keyup", (e) => this.HandleKey(e, false));
        window.addEventListener(
            "contextmenu",
            (e) => {
                if (e.target instanceof HTMLElement && e.target.closest("main")) e.preventDefault();
            },
            true,
        );

        // --- IMPORTANT: don't set glCanvas.width/height; let Pixi own it. ---
        // Only resize via Pixi + notify scene.
        const onResize = () => {
            const rect = wrapper.getBoundingClientRect();
            const w = Math.max(1, Math.floor(rect.width));
            const h = Math.max(1, Math.floor(rect.height));

            // keep debugCanvas in CSS pixels for overlays if you use it
            if (debugCanvas.width !== w || debugCanvas.height !== h) {
                debugCanvas.width = w;
                debugCanvas.height = h;
            }

            this.pixiApp!.resize(w, h);
            this.m_scene?.Resize(w, h);

            // camera is screen-anchored; keep neutral
            this.fitViewToWindow();
        };
        window.addEventListener("resize", onResize);
        window.addEventListener("orientationchange", onResize);
        onResize(); // first sizing pass

        this.LoadGame();

        const initialOverlay = getUnitsOverlayFromScene(this.m_scene);
        if (initialOverlay) {
            const forwardOverlayInteraction = (e: PointerEvent) => {
                // 🔥 FIX: If the fight has started, do not let the overlay intercept clicks.
                // This ensures clicks pass through to HandleMouseDown for unit movement.
                if (this.started) return;

                // Use debugCanvas for bounds (assuming it overlays the Pixi canvas perfectly)
                const canvas = debugCanvas;
                const cr = canvas.getBoundingClientRect();
                // Scale for high-DPI: convert CSS pixels to canvas logical pixels
                const scaleX = canvas.width / cr.width;
                const scaleY = canvas.height / cr.height;
                const gx = (e.clientX - cr.left) * scaleX;
                const gy = (e.clientY - cr.top) * scaleY;
                const overlay = getUnitsOverlayFromScene(this.m_scene);
                if (overlay && overlay.handlePointerDown(gx, gy)) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };
            debugCanvas.addEventListener("pointerdown", forwardOverlayInteraction);
            this.forwardOverlayInteraction = forwardOverlayInteraction; // For cleanup if needed
            this.overlayDebugCanvas = debugCanvas;
        }

        // Do a second fit on the next frame after scene/backdrop layout
        this._pixiApp.getTicker().addOnce(() => this.fitViewToWindow());

        this.isInitialized = true;
    }
    private screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
        if (!this.pixiSceneManager || !this.pixiApp) {
            return { x: screenX, y: screenY }; // fallback (shouldn't normally happen)
        }

        const app = this.pixiApp.getApplication();
        const cam = this.pixiSceneManager.getCameraPosition();
        const zoom = this.pixiSceneManager.getCameraZoom();

        const viewW = app.renderer.width;
        const viewH = app.renderer.height;

        // Screen (0..viewW, 0..viewH) → centered, then scaled by zoom.
        // Y is flipped (screen Y down, world Y up).
        const nx = screenX - viewW * 0.5;
        const ny = screenY - viewH * 0.5;

        return {
            x: cam.x + nx / zoom,
            y: cam.y - ny / zoom,
        };
    }
    public getApplication(): Application {
        return this._pixiApp.getApplication();
    }
    /** Layer behind units for terrain/background drawing. */
    public getTerrainContainer(): Container {
        return this._pixiApp.getTerrainContainer();
    }
    public setScene(title: string, constructor: SceneConstructor) {
        this.sceneTitle = title;
        this.sceneConstructor = constructor;
    }
    /** Fit board to window (no manual zoom controls). */
    private fitViewToWindow(): void {
        if (!this.pixiSceneManager) return;

        // Pull the scene’s current grid bounds and fit to them.
        const gs = this.m_scene?.sc_sceneSettings?.getGridSettings?.();
        if (!gs) return;

        this.pixiSceneManager.fitWorldToViewport(gs.getMinX(), gs.getMinY(), gs.getMaxX(), gs.getMaxY(), 0);

        // Tell scene the camera/container may have changed.
        this.m_scene?.CameraChanged?.();
    }
    public HomeCamera(): void {
        this.fitViewToWindow();
    }
    public HandleEscapeKey(down: boolean): void {
        if (down && this.m_scene) this.m_scene.Deselect(true);
    }
    public HandleMouseMove(e: MouseEvent): void {
        this.m_mouse.x = e.offsetX;
        this.m_mouse.y = e.offsetY;

        // Convert from canvas pixels → world coords
        const world = this.screenToWorld(e.offsetX, e.offsetY);
        this.m_scene?.MouseMove(world, this.m_lMouseDown);

        // Keep optional right-click panning (no zoom UI)
        if (this.m_rMouseDown && this.pixiSceneManager) {
            const cameraPos = this.pixiSceneManager.getCameraPosition();
            const z = this.pixiSceneManager.getCameraZoom();
            const f = 1 / z;
            this.pixiSceneManager.setCameraPosition(cameraPos.x - e.movementX * f, cameraPos.y + e.movementY * f);
        }
    }
    public HandleMouseDown(e: MouseEvent): void {
        const world = this.screenToWorld(e.offsetX, e.offsetY);

        switch (e.button) {
            case 0: // left
                this.m_lMouseDown = true;
                if (e.shiftKey) this.m_scene?.ShiftMouseDown(world);
                else this.m_scene?.MouseDown(world);
                this.UpdateHoverInfo();
                break;
            case 2: // right
                this.m_rMouseDown = true;
                break;
        }
    }
    public getAmountOfSelectedObjects(): number {
        return this.amountOfSelectedObjects;
    }
    public setAmountOfSelectedObjects(newAmount: number): void {
        if (newAmount >= 0) {
            this.amountOfSelectedObjects = newAmount;
        }
    }
    public HandleMouseUp(e: MouseEvent): void {
        switch (e.button) {
            case 0:
                this.m_lMouseDown = false;
                this.m_scene?.MouseUp();
                break;
            case 2:
                this.m_rMouseDown = false;
                break;
        }
    }
    private HandleKey(e: KeyboardEvent, down: boolean): void {
        if (this.m_hoveringCanvas || !down) {
            const { key } = e;
            const hotKey = this.allHotKeys.find((hk) => hk.key === key);
            if (hotKey) {
                const wasDown = !!this.m_keyMap[key];
                if (wasDown !== down) {
                    if (!hotKey.step) hotKey.callback(down);
                    this.m_keyMap[key] = down;
                }
                if (this.m_hoveringCanvas) e.preventDefault();
                if (key === "Escape") this.UpdateHoverInfo();
            }
        }
    }
    public DecrementTest(): void {
        const index = this.flatScenes.findIndex((e) => e.name === this.sceneTitle) - 1;
        if (index < 0) this.activateScene(this.flatScenes[this.flatScenes.length - 1]);
        else this.activateScene(this.flatScenes[index]);
    }
    public IncrementTest(): void {
        const index = this.flatScenes.findIndex((e) => e.name === this.sceneTitle) + 1;
        if (index >= this.flatScenes.length) this.activateScene(this.flatScenes[0]);
        else this.activateScene(this.flatScenes[index]);
    }
    public StartGame(): void {
        console.log("JJJJJJ");
        if (this.m_scene && this.m_scene.startScene()) this.started = true;
        this.onHasStarted.emit(this.started);
        this.fitViewToWindow(); // keep neutral after start too
    }
    public Uninitialize(): void {
        if (this.overlayDebugCanvas && this.forwardOverlayInteraction) {
            this.overlayDebugCanvas.removeEventListener("pointerup", this.forwardOverlayInteraction);
        }
        this.overlayDebugCanvas = undefined;
        this.forwardOverlayInteraction = undefined;

        this.isInitialized = false;
        this.pixiApp?.destroy();
        this.pixiSceneManager?.destroy();
    }
    public RequestTime(team?: number): void {
        if (this.started && this.m_scene && team !== undefined) this.m_scene.requestTime(team);
    }
    public GetButtonGroup(): IVisibleButton[] {
        return this.m_scene?.sc_visibleButtonGroup ?? [];
    }
    public PropagateButtonClicked(buttonName: string, buttonState: VisibleButtonState): void {
        this.m_scene?.propagateButtonClicked(buttonName, buttonState);
    }
    public LoadGame(_restartScene = false): void {
        const SceneClass = this.sceneConstructor;
        if (!SceneClass) return;

        this.m_scene?.Destroy();
        this.started = false;

        const context: PixiSceneContext = {
            pixiSceneManager: this._pixiSceneManager,
            textures: this._textures,
        };
        this.m_scene = new SceneClass(context);

        this.m_scene.setupControls();
        this.sceneBaseHotKeys = this.m_scene.getBaseHotkeys();
        this.sceneHotKeys = this.m_scene.getHotkeys();
        this.allHotKeys = [
            hotKeyPress("r", "Reset Camera", () => this.HomeCamera()),
            hotKeyPress("R", "Reset Camera", () => this.HomeCamera()),
            hotKeyPress("s", "Start Scene", () => this.StartGame()),
            hotKeyPress("S", "Start Scene", () => this.StartGame()),
            ...this.sceneBaseHotKeys,
            ...this.sceneHotKeys,
        ];
        this.stepHotKeys = this.allHotKeys.filter((hk) => hk.step);

        for (const hk of this.allHotKeys) {
            const firstHk = this.allHotKeys.find((hk2) => hk.key === hk2.key);
            if (firstHk && hk !== firstHk)
                console.error(`Conflicting keys "${hk.description}" and "${firstHk.description}"`);
        }

        // Initial neutral view (no zoom math); then one more on next frame
        this.fitViewToWindow();
        this._pixiApp.getTicker().addOnce(() => this.fitViewToWindow());

        this.UpdateHoverInfo();
    }
    public Accept(): void {
        if (this.m_scene?.sc_selectedUnitProperties && !this.started) {
            const newAmount = this.getAmountOfSelectedObjects();
            if (newAmount > 0) {
                this.m_scene.refreshScene({
                    ...this.m_scene.sc_selectedUnitProperties,
                    amount_alive: Math.floor(newAmount),
                });
                this.m_scene.sc_unitPropertiesUpdateNeeded = true;
                this.UpdateHoverInfo();
            }
        }
    }
    public Clone(): void {
        if (this.m_scene?.sc_selectedUnitProperties && !this.started) this.m_scene.cloneObject();
    }
    public Split(newAmount: number): void {
        if (this.m_scene?.sc_selectedUnitProperties && !this.started) {
            const isCloned = this.m_scene.cloneObject(newAmount);
            if (isCloned) {
                const amountAlive = this.m_scene?.sc_selectedUnitProperties?.amount_alive;
                if (amountAlive > 0) {
                    const secondPart = Math.floor(amountAlive - newAmount);
                    if (secondPart > 0) {
                        this.setAmountOfSelectedObjects(secondPart);
                        this.Accept();
                    }
                }
            }
        }
    }
    public PropagateAugmentation(teamType: TeamType, augmentType: Augment.AugmentType): boolean {
        const augmented = this.m_scene?.propagateAugmentation(teamType, augmentType);
        if (augmented && augmentType.type === "Placement") this.onPlacementChanged.emit(true);
        if (augmented) {
            this.m_scene!.sc_augmentChanged = true;
            this.onAugmentChanged.emit(augmented);
        }
        return augmented || false;
    }
    public PropagateSynergy(
        teamType: TeamType,
        faction: FactionType,
        synergyName: string,
        synergyLevel: number,
    ): boolean {
        return this.m_scene?.propagateSynergy(teamType, faction, synergyName, synergyLevel) ?? false;
    }
    public GetNumberOfUnitsAvailableForPlacement(teamType: TeamType): number {
        return this.m_scene?.getNumberOfUnitsAvailableForPlacement(teamType) ?? HoCConstants.MAX_UNITS_PER_TEAM;
    }
    public SetGridType(gridType: GridType): void {
        this.m_scene?.setGridType(gridType);
        // grid change might affect ideal zoom; refit
        this.fitViewToWindow();
    }
    private lastTime = 0;
    public SimulationLoop(currentTime: number): void {
        if (this.m_fpsCalculator.addFrame() <= 0) return;

        // First frame init
        if (this.lastTime === 0) {
            this.lastTime = currentTime;
            return;
        }

        // Calculate delta time in seconds
        let dt = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Cap dt to prevent huge jumps (e.g. if tab was backgrounded)
        // 0.1s = 10fps minimum
        if (dt > 0.1) dt = 0.1;

        // Update scene
<<<<<<< HEAD
        this.m_scene?.RunStep(this.m_settings, this.m_fpsCalculator.getFps(), dt);
=======
        this.m_scene?.RunStep(this.m_fpsCalculator.getFps());
>>>>>>> aa2e759 (A bit project tree restructuring)

        // Hotkeys
        if (this.m_hoveringCanvas) {
            for (const hk of this.stepHotKeys) if (this.m_keyMap[hk.key]) hk.callback(true);
        } else {
            if (this.sceneHasHoverInfo()) {
                this.onHoverInfoUpdated.emit({} as IHoverInfo);
                this.m_scene?.cleanupHoverText();
            }
        }

        // Hover text
        if (this.m_scene?.sc_hoverTextUpdateNeeded) {
            this.UpdateHoverInfo();
            this.m_scene.sc_hoverTextUpdateNeeded = false;
        }

        // Logs
        if (this.m_scene?.sc_sceneLog.hasBeenUpdated()) {
            this.onAttackLanded.emit(this.m_scene.sc_sceneLog.getLog());
        }

        // Unit / faction updates
        const scene = this.m_scene;
        if (scene) {
            // ✅ Combined selection: unit + impact + faction
            if (scene.sc_unitPropertiesUpdateNeeded || scene.sc_factionNameUpdateNeeded) {
                const unit = (scene.sc_selectedUnitProperties ?? null) as UnitProperties | null;
                const impact = (scene.sc_visibleOverallImpact ?? null) as IVisibleOverallImpact | null;
                const faction = (scene.sc_selectedFactionType ??
                    (FactionVals.NO_FACTION as FactionType)) as FactionType;
                this.onSelectionCombined.emit({ unit, impact, faction });

                // mark both handled
                scene.sc_unitPropertiesUpdateNeeded = false;
                scene.sc_factionNameUpdateNeeded = false;
            }

            // 🧹 remove the old separate emitters here:
            // - onUnitSelected
            // - onOverallImpactUpdated
            // - onFactionSelected (for selection purposes)
        }

        // Damage animation surface
        if (this.m_scene?.sc_damageForAnimation.render) {
            console.log("EMIT2");
            this.onDamageReceived.emit(this.m_scene.sc_damageForAnimation.amount);
            this.m_scene.sc_damageForAnimation.render = false;
            this.m_scene.sc_damageForAnimation.amount = 0;
            this.m_scene.sc_damageForAnimation.unitPosition = { x: 0, y: 0 };
            this.m_scene.sc_damageForAnimation.unitIsSmall = true;
        }

        // Damage stats
        if (this.m_scene?.sc_damageStatsUpdateNeeded) {
            console.log("EMIT3");
            this.onDamageStatisticsUpdated.emit(structuredClone(this.m_scene.getDamageStatisics()));
            this.m_scene.sc_damageStatsUpdateNeeded = false;
        }

        // Synergies
        if (this.m_scene?.sc_possibleSynergiesUpdateNeeded) {
            console.log("EMIT4");
            this.onPossibleSynergiesUpdated.emit(this.m_scene.sc_possibleSynergiesPerTeam);
            this.m_scene.sc_possibleSynergiesUpdateNeeded = false;
        }

        // Visible state
        if (this.m_scene?.sc_visibleStateUpdateNeeded) {
            if (this.m_scene.sc_visibleState) {
                this.onVisibleStateUpdated.emit(structuredClone(this.m_scene.sc_visibleState as IVisibleState));
            } else {
                this.onVisibleStateUpdated.emit({} as IVisibleState);
            }
            this.m_scene.sc_visibleStateUpdateNeeded = false;
        }

        // Grid type
        if (this.m_scene?.sc_gridTypeUpdateNeeded) {
            console.log("EMIT6");
            this.onGridTypeChanged.emit(this.m_scene.getGridType());
            this.m_scene.sc_gridTypeUpdateNeeded = false;
        }

        // Buttons group
        if (this.m_scene?.sc_buttonGroupUpdated) {
            console.log("EMIT7");
            this.onHasButtonsGroupUpdate.emit(true);
            this.m_scene.sc_buttonGroupUpdated = false;
        }
    }
    private sceneHasHoverInfo(): boolean {
        return (
            !!this.m_scene?.sc_attackDamageSpreadStr ||
            !!this.m_scene?.sc_attackRangeDamageDivisorStr ||
            !!this.m_scene?.sc_hoverUnitNameStr ||
            !!this.m_scene?.sc_hoverInfoArr?.length
        );
    }
    public UpdateHoverInfo(): void {
        if (this.sceneHasHoverInfo() && this.m_scene) {
            this.onHoverInfoUpdated.emit({
                attackType: this.m_scene.sc_selectedAttackType,
                damageSpread: this.m_scene.sc_attackDamageSpreadStr,
                damageRangeDivisor: this.m_scene.sc_attackRangeDamageDivisorStr,
                killsSpread: this.m_scene.sc_attackKillSpreadStr,
                unitName: this.m_scene.sc_hoverUnitNameStr,
                unitLevel: this.m_scene.sc_hoverUnitLevel,
                unitMovementType: this.m_scene.sc_hoverUnitMovementType,
                information: this.m_scene.sc_hoverInfoArr,
            });
            this.lastSentEmptyHoverInfo = false;
        } else if (!this.lastSentEmptyHoverInfo) {
            this.onHoverInfoUpdated.emit({} as IHoverInfo);
            this.lastSentEmptyHoverInfo = true;
        }
    }
}

export const PixiManagerContext = createContext(new PixiGameManager());
export const usePixiManager = () => useContext(PixiManagerContext);
