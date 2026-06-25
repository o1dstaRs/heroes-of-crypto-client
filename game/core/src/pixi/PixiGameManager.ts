// game/core/src/pixi/PixiGameManager.ts
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
    FightStateManager,
    type GameAction,
    type GameEvent,
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
// import { PixiSceneManager } from "./PixiSceneManager"; // Deprecated
import { PreloadedPixiTextures } from "./PixiTextureLoader";

import "../scenes";
import type { PixiScene, PixiSceneContext, SceneConstructor, SceneEntry } from "./PixiScene";
import type { AuthoritativeSnapshotOptions } from "./PixiScene";
import type { LoadingScreen } from "../scenes/LoadingScreen";
import { getScenesGrouped } from "./PixiScene";
import type { AuthoritativeGameSnapshot, SceneGameActionTransport } from "../game_action_transport";
import type { SandboxReplay } from "../replay/sandbox_replay";

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
    public readonly onHasButtonsGroupUpdate = new Signal<(buttons: IVisibleButton[]) => void>();
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
    public readonly onLoadingChanged = new Signal<(loading: boolean) => void>();
    private m_hoveringCanvas = false;
    private m_keyMap: Record<string, boolean> = {};
    private isInitialized = false;
    private _isLoading = true;
    public get isLoading(): boolean {
        return this._isLoading;
    }
    private activateScene: (entry: SceneEntry) => void = () => {};
    private started = false;
    private lastSentEmptyHoverInfo = false;
    private amountOfSelectedObjects = 1;
    private pixiApp: PixiApp | null = null;
    // private pixiSceneManager: PixiSceneManager | null = null; // Deprecated
    private textures: PreloadedPixiTextures | null = null;
    private forwardOverlayInteraction?: (e: PointerEvent) => void;
    private overlayDebugCanvas?: HTMLCanvasElement;
    private gameActionTransport?: SceneGameActionTransport;
    private lastAuthoritativeViewportKey = "";
    private overlayMouseSuppression?: {
        clientX: number;
        clientY: number;
        expiresAt: number;
        down: boolean;
        up: boolean;
    };
    private lifecycleId = 0;
    private initEventCleanups: Array<() => void> = [];
    private static readonly OVERLAY_MOUSE_SUPPRESSION_MS = 350;
    private static readonly OVERLAY_MOUSE_SUPPRESSION_DISTANCE_PX = 8;
    public constructor() {
        for (const { scenes } of this.groupedScenes) this.flatScenes.push(...scenes);
    }
    /** Throwing getters to keep TypeScript happy without ‘never’ intersections */
    private get _pixiApp(): PixiApp {
        if (!this.pixiApp) throw new Error("PixiGameManager: pixiApp not initialized yet");
        return this.pixiApp;
    }
    /*
    private get _pixiSceneManager(): PixiSceneManager {
        if (!this.pixiSceneManager) throw new Error("PixiGameManager: pixiSceneManager not initialized yet");
        return this.pixiSceneManager;
    }
    */
    private get _textures(): PreloadedPixiTextures {
        if (!this.textures) throw new Error("PixiGameManager: textures not initialized yet");
        return this.textures;
    }
    private shouldSuppressOverlayMouseEvent(e: MouseEvent, phase: "down" | "up"): boolean {
        const suppression = this.overlayMouseSuppression;
        if (!suppression) return false;

        if (performance.now() > suppression.expiresAt) {
            this.overlayMouseSuppression = undefined;
            return false;
        }

        const dx = e.clientX - suppression.clientX;
        const dy = e.clientY - suppression.clientY;
        const maxDistance = PixiGameManager.OVERLAY_MOUSE_SUPPRESSION_DISTANCE_PX;
        if (dx * dx + dy * dy > maxDistance * maxDistance) return false;

        if (phase === "down") {
            if (!suppression.down) return false;
            suppression.down = false;
        } else {
            if (!suppression.up) return false;
            suppression.up = false;
        }

        if (!suppression.down && !suppression.up) this.overlayMouseSuppression = undefined;
        return true;
    }
    private addInitEventListener(
        target: EventTarget,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void {
        target.addEventListener(type, listener, options);
        this.initEventCleanups.push(() => target.removeEventListener(type, listener, options));
    }
    private removeInitEventListeners(): void {
        for (const cleanup of this.initEventCleanups.splice(0)) {
            cleanup();
        }
    }
    public async init(
        glCanvas: HTMLCanvasElement,
        debugCanvas: HTMLCanvasElement,
        wrapper: HTMLDivElement,
        activateScene: (entry: SceneEntry) => void,
    ) {
        if (this.isInitialized) return;
        const lifecycleId = ++this.lifecycleId;
        const isCurrentLifecycle = () => lifecycleId === this.lifecycleId;
        this.activateScene = activateScene;

        // Input handlers (unchanged) ...
        this.addInitEventListener(debugCanvas, "mousedown", (e) => this.HandleMouseDown(e as MouseEvent));
        this.addInitEventListener(debugCanvas, "mouseup", (e) => this.HandleMouseUp(e as MouseEvent));
        this.addInitEventListener(debugCanvas, "mousemove", (e) => this.HandleMouseMove(e as MouseEvent));
        this.addInitEventListener(window, "keydown", (e) => {
            if (!(e instanceof KeyboardEvent)) return;
            if (e.key === "Escape") this.HandleEscapeKey(true);
        });
        this.addInitEventListener(debugCanvas, "mouseenter", () => (this.m_hoveringCanvas = true));
        this.addInitEventListener(debugCanvas, "mouseleave", () => (this.m_hoveringCanvas = false));

        // Init Pixi using wrapper size
        const pixiApp = new PixiApp(); // sync constructor
        this.pixiApp = pixiApp;
        await pixiApp.init(glCanvas, 2048, 2048); // async init, safe to await here
        if (!isCurrentLifecycle()) {
            pixiApp.destroy();
            return;
        }

        // Declare loadingScreen early so onResize can close over it
        let loadingScreen: LoadingScreen | undefined;
        const cleanupLoadingScreen = () => {
            if (!loadingScreen) return;
            if (!loadingScreen.destroyed) {
                loadingScreen.removeFromParent();
                loadingScreen.destroy();
            }
            loadingScreen = undefined;
        };

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
            this.m_scene?.Resize(w, h); // Resize scene first
            loadingScreen?.resize(w, h); // Resize loader if active
            this.fitViewToWindow();
        };

        this.addInitEventListener(window, "resize", onResize);
        this.addInitEventListener(window, "orientationchange", onResize);
        onResize(); // first sizing pass to set correct canvas size
        if (!isCurrentLifecycle()) {
            pixiApp.destroy();
            return;
        }

        // --- NEW: TIERED LOADING ---
        const stage = this.pixiApp.getStage();
        // Now use the CORRECT CURRENT dimensions after onResize()
        const { width, height } = this.pixiApp.getApplication().renderer;

        // 1. Show Blocking Loading Screen
        const { LoadingScreen } = await import("../scenes/LoadingScreen");
        if (!isCurrentLifecycle()) {
            pixiApp.destroy();
            return;
        }
        loadingScreen = new LoadingScreen(width, height);
        // Ensure it's on top of everything (UI container usually) but for now just add to stage
        stage.addChild(loadingScreen);

        // 2. Load Core Assets (Blocking)
        // Ensure starting state
        this._isLoading = true;
        this.onLoadingChanged.emit(true);

        loadingScreen.setProgress(0.1);
        const { preloadCoreAssets, preloadAnimationAssets } = await import("./PixiTextureLoader");
        if (!isCurrentLifecycle()) {
            cleanupLoadingScreen();
            pixiApp.destroy();
            return;
        }

        this.textures = (await preloadCoreAssets((p) => {
            if (!isCurrentLifecycle()) return;
            // scale 0.1 -> 1.0
            if (loadingScreen) loadingScreen.setProgress(0.1 + p * 0.9);
        })) as PreloadedPixiTextures;
        if (!isCurrentLifecycle()) {
            cleanupLoadingScreen();
            pixiApp.destroy();
            return;
        }

        // 3. Remove Loading Screen & Start Game
        cleanupLoadingScreen();

        // 4. Init Scene Manager & Game
        // const gridSettings = new GridSettings(32, 1024, 0, 1024, 0, 32, 16);
        // this.pixiSceneManager = new PixiSceneManager(this.pixiApp, gridSettings);

        this.addInitEventListener(window, "keydown", (e) => this.HandleKey(e as KeyboardEvent, true));
        this.addInitEventListener(window, "keyup", (e) => this.HandleKey(e as KeyboardEvent, false));
        this.addInitEventListener(
            window,
            "contextmenu",
            (e) => {
                if (!(e instanceof MouseEvent)) return;
                if (e.target instanceof HTMLElement && e.target.closest("main")) e.preventDefault();
            },
            true,
        );

        this.LoadGame();

        // 5. Tier 2: Background Load Animations
        // We can pass a callback to update UI if needed
        preloadAnimationAssets((p) => {
            if (!isCurrentLifecycle()) return;
            // TODO: Emit signal to UI / Scene about progress
            // For now just log
            // console.log("Background Asset Load:", p);
            this.m_scene?.onBackgroundAssetLoad?.(p);
        }).then((newTextures) => {
            if (!isCurrentLifecycle()) return;
            this.textures = { ...this.textures, ...newTextures } as PreloadedPixiTextures;
            // Notify scene that assets are fully ready?
            // Ideally Pixi handles texture updates automatically if we reference them by new Texture objects?
            // Actually Pixi Assets cache uses string keys. If we request texture by name, it should appear.
            // But existing Sprites showing "missing" texture won't auto-update unless re-assigned.
            // However, separating "Core" vs "Anim" likely means TIER 2 assets are ONLY used for animations
            // that trigger LATER. If user tries to play animation immediately, it might be missing.
            // We'll rely on the fact that these are mostly specialized animations.
            this.m_scene?.onBackgroundAssetLoad?.(1.0);
        });

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
                    this.overlayMouseSuppression = {
                        clientX: e.clientX,
                        clientY: e.clientY,
                        expiresAt: performance.now() + PixiGameManager.OVERLAY_MOUSE_SUPPRESSION_MS,
                        down: true,
                        up: true,
                    };
                    e.preventDefault();
                    e.stopPropagation();
                }
            };
            debugCanvas.addEventListener("pointerdown", forwardOverlayInteraction);
            this.initEventCleanups.push(() =>
                debugCanvas.removeEventListener("pointerdown", forwardOverlayInteraction),
            );
            this.forwardOverlayInteraction = forwardOverlayInteraction; // For cleanup if needed
            this.overlayDebugCanvas = debugCanvas;
        }

        // Do a second fit on the next frame after scene/backdrop layout
        this._pixiApp.getTicker().addOnce(() => this.fitViewToWindow());

        this.isInitialized = true;
        // Signal readiness only after LoadGame() has created m_scene. Ranked routes apply the
        // authoritative snapshot as soon as this flips; emitting earlier can drop the first PLAY
        // snapshot and leave a direct fight link with an empty board until another SSE event arrives.
        this._isLoading = false;
        this.onLoadingChanged.emit(false);
    }
    private screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
        if (!this.pixiApp) return { x: screenX, y: screenY };
        return this.pixiApp.screenToWorld(screenX, screenY);
    }
    public getApplication(): Application {
        return this._pixiApp.getApplication();
    }
    /** Layer behind units for terrain/background drawing. */
    public getTerrainContainer(): Container {
        return this._pixiApp.getTerrainContainer();
    }
    public setScene(title: string, constructor: SceneConstructor) {
        const changed = this.sceneTitle !== title || this.sceneConstructor !== constructor;
        this.sceneTitle = title;
        this.sceneConstructor = constructor;
        if (this.isInitialized && changed) {
            this.LoadGame(true);
        }
    }
    public SetGameActionTransport(transport?: SceneGameActionTransport): void {
        this.gameActionTransport = transport;
        this.m_scene?.setGameActionTransport(transport);
    }
    public ApplyAuthoritativeSnapshot(
        snapshot: AuthoritativeGameSnapshot,
        options?: AuthoritativeSnapshotOptions,
    ): void {
        this.m_scene?.applyAuthoritativeSnapshot(snapshot, options);
        const wasStarted = this.started;
        this.started = snapshot.fightStarted && !snapshot.fightFinished;
        this.onHasStarted.emit(this.started);
        if (this.shouldFitAuthoritativeSnapshot(snapshot, wasStarted)) {
            this.fitViewToWindow();
        }
        this.emitAuthoritativeDamageStats(snapshot);
        this.UpdateHoverInfo();
    }
    public ApplyAuthoritativeVfx(events: GameEvent[]): void {
        this.m_scene?.applyAuthoritativeVfx(events);
    }
    public ApplyAuthoritativeReplaySnapshot(snapshot: AuthoritativeGameSnapshot): void {
        this.m_scene?.applyAuthoritativeReplaySnapshot(snapshot);
        const wasStarted = this.started;
        this.started = snapshot.fightStarted && !snapshot.fightFinished;
        this.onHasStarted.emit(this.started);
        if (this.shouldFitAuthoritativeSnapshot(snapshot, wasStarted)) {
            this.fitViewToWindow();
        }
        this.emitAuthoritativeDamageStats(snapshot);
        this.UpdateHoverInfo();
    }
    public PlayAuthoritativeActionRecord(
        action: GameAction,
        events: GameEvent[],
        stateAfter?: AuthoritativeGameSnapshot,
    ): Promise<boolean> {
        return this.m_scene?.playAuthoritativeActionRecord(action, events, stateAfter) ?? Promise.resolve(false);
    }
    public SelectAuthoritativeUnit(unitId: string): void {
        this.m_scene?.selectAuthoritativeUnit(unitId);
        this.UpdateHoverInfo();
    }
    /** Fit board to window (no manual zoom controls). */
    private fitViewToWindow(): void {
        if (!this.m_scene) return;

        const gs = this.m_scene?.sc_sceneSettings?.getGridSettings?.();
        if (!gs) return;

        this.m_scene.fitWorldToViewport(gs.getMinX(), gs.getMinY(), gs.getMaxX(), gs.getMaxY(), 0);

        this.m_scene?.CameraChanged?.();
    }
    private emitAuthoritativeDamageStats(snapshot: AuthoritativeGameSnapshot): void {
        if (snapshot.damageStats) {
            this.onDamageStatisticsUpdated.emit(structuredClone(snapshot.damageStats));
        }
    }
    private shouldFitAuthoritativeSnapshot(snapshot: AuthoritativeGameSnapshot, wasStarted: boolean): boolean {
        const viewportKey = [
            snapshot.gridType,
            snapshot.fightStarted ? 1 : 0,
            snapshot.fightFinished ? 1 : 0,
            snapshot.narrowingLayers ?? 0,
            snapshot.centerDried ? 1 : 0,
        ].join(":");
        const shouldFit = viewportKey !== this.lastAuthoritativeViewportKey || wasStarted !== this.started;
        this.lastAuthoritativeViewportKey = viewportKey;
        return shouldFit;
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

        // Keep optional right-click panning (no zoom UI) - DISABLED by request
        // if (this.m_rMouseDown && this.pixiSceneManager) {
        //     const cameraPos = this.pixiSceneManager.getCameraPosition();
        //     const z = this.pixiSceneManager.getCameraZoom();
        //     const f = 1 / z;
        //     this.pixiSceneManager.setCameraPosition(cameraPos.x - e.movementX * f, cameraPos.y + e.movementY * f);
        // }
    }
    public HandleMouseDown(e: MouseEvent): void {
        if (this.shouldSuppressOverlayMouseEvent(e, "down")) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

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
        if (this.shouldSuppressOverlayMouseEvent(e, "up")) {
            this.m_lMouseDown = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }

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
        if (this.m_scene && this.m_scene.startScene()) this.started = true;
        this.onHasStarted.emit(this.started);
        this.fitViewToWindow(); // keep neutral after start too
    }
    /** Replay the previous fight with the exact same units, positions and map. */
    public Rematch(): void {
        console.log("[Rematch] manager.Rematch; m_scene =", !!this.m_scene);
        if (this.m_scene && this.m_scene.rematchLastFight()) this.started = true;
        this.onHasStarted.emit(this.started);
        this.fitViewToWindow();
    }
    public GetCurrentSandboxReplay(): SandboxReplay | undefined {
        return this.m_scene?.getCurrentSandboxReplay();
    }
    public CanPlayCurrentSandboxReplay(): boolean {
        return this.m_scene?.canPlayCurrentSandboxReplay() ?? false;
    }
    public GetCurrentVisibleState(): IVisibleState {
        return this.m_scene?.sc_visibleState
            ? structuredClone(this.m_scene.sc_visibleState as IVisibleState)
            : ({} as IVisibleState);
    }
    public async PlaySandboxReplay(replay: SandboxReplay, throughSequence?: number): Promise<boolean> {
        const applied = (await this.m_scene?.playSandboxReplay(replay, throughSequence)) ?? false;
        if (applied) {
            const sequence = throughSequence ?? replay.actions.length;
            const state =
                sequence <= 0
                    ? replay.initialState
                    : replay.actions[Math.min(sequence, replay.actions.length) - 1]?.stateAfter;
            this.started = state ? state.fightStarted && !state.fightFinished : false;
            this.onHasStarted.emit(this.started);
            this.fitViewToWindow();
            this.UpdateHoverInfo();
        }
        return applied;
    }
    /** Clear the board and return to unit placement for a brand-new fight. */
    public StartOver(): void {
        FightStateManager.getInstance().reset();
        this.LoadGame(true); // destroys the scene, rebuilds it fresh, sets started = false
        this.onHasStarted.emit(false);
        this.fitViewToWindow();
    }
    public Uninitialize(): void {
        this.lifecycleId++;
        this.removeInitEventListeners();
        if (this.overlayDebugCanvas && this.forwardOverlayInteraction) {
            this.overlayDebugCanvas.removeEventListener("pointerdown", this.forwardOverlayInteraction);
        }
        this.overlayDebugCanvas = undefined;
        this.forwardOverlayInteraction = undefined;
        this.overlayMouseSuppression = undefined;

        this.m_scene?.Destroy();
        this.m_scene = null;
        this.isInitialized = false;
        this._isLoading = true;
        this.pixiApp?.destroy();
        this.pixiApp = null;
        this.textures = null;
        this.started = false;
        this.lastTime = 0;
        this.simAccumulator = 0;
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
        this.lastAuthoritativeViewportKey = "";

        const gridSettings = new GridSettings(32, 1024, 0, 1024, 0, 32, 16);

        const context: PixiSceneContext = {
            pixiApp: this._pixiApp,
            textures: this._textures,
            gridSettings: gridSettings,
            onHasStarted: this.onHasStarted,
            gameActionTransport: this.gameActionTransport,
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
    public Delete(): void {
        if (this.m_scene?.sc_selectedUnitProperties && !this.started) this.m_scene.deleteObject();
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
    private simAccumulator = 0;
    // Fixed-timestep simulation: advance the game a constant amount per REAL second so that
    // speed/animations are identical on every machine and refresh rate. We tick at 60 Hz and hand
    // Step() the legacy 1/240 value, which reproduces the old "60fps feel" for everyone — no
    // animation-constant retune required. SIM_STEP/SIM_HZ are the knobs to retune overall speed.
    private static readonly SIM_HZ = 60;
    private static readonly SIM_DT = 1 / PixiGameManager.SIM_HZ;
    private static readonly SIM_STEP = 1 / 240;
    private static readonly MAX_SIM_STEPS = 5;
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

        // Smoothed FPS for the on-screen counter — once per rendered frame.
        if (this.m_scene) this.m_scene.sc_fps = this.m_fpsCalculator.getFps();

        // Fixed-timestep simulation. Advance the sim in constant SIM_DT real-time slices, as many
        // as fit this frame, so game/animation speed is independent of frame rate and hardware.
        // The step cap (plus the dt clamp above) prevents a "spiral of death" on very slow frames.
        this.simAccumulator += dt;
        let simSteps = 0;
        while (this.simAccumulator >= PixiGameManager.SIM_DT && simSteps < PixiGameManager.MAX_SIM_STEPS) {
            this.m_scene?.RunStep(PixiGameManager.SIM_STEP);
            this.simAccumulator -= PixiGameManager.SIM_DT;
            simSteps++;
        }
        if (simSteps >= PixiGameManager.MAX_SIM_STEPS) {
            // Hit the cap on a heavy frame — drop the backlog instead of accumulating lag.
            this.simAccumulator = 0;
        }

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
            this.onDamageReceived.emit(this.m_scene.sc_damageForAnimation.amount);
            this.m_scene.sc_damageForAnimation.render = false;
            this.m_scene.sc_damageForAnimation.amount = 0;
            this.m_scene.sc_damageForAnimation.unitPosition = { x: 0, y: 0 };
            this.m_scene.sc_damageForAnimation.unitIsSmall = true;
        }

        // Damage stats
        if (this.m_scene?.sc_damageStatsUpdateNeeded) {
            this.onDamageStatisticsUpdated.emit(structuredClone(this.m_scene.getDamageStatisics()));
            this.m_scene.sc_damageStatsUpdateNeeded = false;
        }

        // Synergies
        if (this.m_scene?.sc_possibleSynergiesUpdateNeeded) {
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
            this.onGridTypeChanged.emit(this.m_scene.getGridType());
            this.m_scene.sc_gridTypeUpdateNeeded = false;
        }

        // Buttons group
        if (this.m_scene?.sc_buttonGroupUpdated) {
            this.onHasButtonsGroupUpdate.emit(this.m_scene?.sc_visibleButtonGroup ?? []);
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
