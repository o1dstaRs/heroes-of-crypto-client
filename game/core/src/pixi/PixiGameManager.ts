// game/core/src/PixiGameManager.ts
import {
    UnitProperties,
    GridSettings,
    HoCConstants,
    GridType,
    TeamType,
    Augment,
    IDamageStatistic,
    SynergyWithLevel,
    FactionType,
} from "@heroesofcrypto/common";
import { createContext, useContext } from "react";
import { Signal } from "typed-signals";

import { Settings } from "../settings";
import {
    IHoverInfo,
    IVisibleButton,
    IVisibleOverallImpact,
    IVisibleState,
    VisibleButtonState,
} from "../state/visible_state";
import { EDGES_SIZE, MAX_FPS } from "../statics";
import { FpsCalculator } from "../utils/FpsCalculator";
import { HotKey, hotKeyPress } from "../utils/hotkeys";
import { PixiApp } from "./PixiApp";
import { PixiSceneManager } from "./PixiSceneManager";
import { loadPixiTextures, PreloadedPixiTextures } from "./PixiTextureLoader";

import type { PixiScene, PixiSceneContext, SceneConstructor, SceneEntry } from "./PixiScene";

// Narrower shape some of your legacy userData carried (from Box2D days)
type LegacyUnitFlag = { unit_type?: number };

// Type guard to safely use unknown userData coming from GetUserData()
function isUnitUserData(x: unknown): x is UnitProperties & LegacyUnitFlag {
    if (!x || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    // minimum fields we rely on here
    const hasAmountAlive = typeof o["amount_alive"] === "number";
    const hasAbilities = Array.isArray(o["abilities"]);
    // legacy flag is optional, don’t require it to be present
    return hasAmountAlive && hasAbilities;
}

export class PixiGameManager {
    public m_fpsCalculator = new FpsCalculator(200, 1000, MAX_FPS);
    public readonly m_settings = new Settings();

    public m_scene: PixiScene | null = null;
    public m_lMouseDown = false;
    public m_rMouseDown = false;

    private m_mouse = { x: 0, y: 0 };

    private sceneBaseHotKeys: HotKey[] = [];
    private sceneHotKeys: HotKey[] = [];
    private allHotKeys: HotKey[] = [];
    private stepHotKeys: HotKey[] = [];

    public readonly groupedScenes: { name: string; scenes: SceneEntry[] }[] = [];
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
    public readonly onUnitSelected = new Signal<(unitProperties: UnitProperties) => void>();
    public readonly onDamageStatisticsUpdated = new Signal<(damageStats: IDamageStatistic[]) => void>();
    public readonly onPossibleSynergiesUpdated = new Signal<(possible: Map<TeamType, SynergyWithLevel[]>) => void>();
    public readonly onRaceSelected = new Signal<(raceName: string) => void>();
    public readonly onVisibleStateUpdated = new Signal<(visibleState: IVisibleState) => void>();
    public readonly onVisibleOverallImpactUpdated = new Signal<(impact: IVisibleOverallImpact) => void>();
    public readonly onHoverInfoUpdated = new Signal<(hover: IHoverInfo) => void>();

    private m_hoveringCanvas = false;
    private m_keyMap: Record<string, boolean> = {};

    private isInitialized = false;
    private activateScene: (entry: SceneEntry) => void = () => {};
    private started = false;
    private lastSentEmptyHoverInfo = false;

    // PixiJS bits
    private pixiApp: PixiApp | null = null;
    private pixiSceneManager: PixiSceneManager | null = null;
    private textures: PreloadedPixiTextures | null = null;

    public constructor() {
        this.flatScenes = [];
    }

    public async init(
        glCanvas: HTMLCanvasElement,
        debugCanvas: HTMLCanvasElement,
        wrapper: HTMLDivElement,
        activateScene: (entry: SceneEntry) => void,
    ) {
        if (this.isInitialized) return;
        this.activateScene = activateScene;

        // Debug/UI canvas input
        debugCanvas.addEventListener("mousedown", (e) => this.HandleMouseDown(e));
        debugCanvas.addEventListener("mouseup", (e) => this.HandleMouseUp(e));
        debugCanvas.addEventListener("mousemove", (e) => this.HandleMouseMove(e));

        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape") this.HandleEscapeKey(true);
        });

        debugCanvas.addEventListener("mouseenter", () => {
            this.m_hoveringCanvas = true;
        });
        debugCanvas.addEventListener("mouseleave", () => {
            this.m_hoveringCanvas = false;
        });

        // Resize handling
        const onResize = () => {
            const { clientWidth, clientHeight } = wrapper;
            if (debugCanvas.width !== clientWidth || debugCanvas.height !== clientHeight) {
                debugCanvas.width = glCanvas.width = clientWidth;
                debugCanvas.height = glCanvas.height = clientHeight;

                if (this.pixiApp) this.pixiApp.resize(clientWidth, clientHeight);
                this.m_scene?.Resize(clientWidth, clientHeight);
            }
        };
        window.addEventListener("resize", onResize);
        window.addEventListener("orientationchange", onResize);
        onResize();

        // Init PixiJS
        this.pixiApp = new PixiApp();
        await this.pixiApp.init(glCanvas, wrapper.clientWidth, wrapper.clientHeight);

        // Load textures
        this.textures = await loadPixiTextures();

        // Scene manager + default grid settings
        const gridSettings = new GridSettings(32, 1024, 0, 1024, 0, 32, 16);
        this.pixiSceneManager = new PixiSceneManager(this.pixiApp, gridSettings);

        // Keyboard global handlers
        window.addEventListener("keydown", (e) => this.HandleKey(e, true));
        window.addEventListener("keyup", (e) => this.HandleKey(e, false));

        // Right-click context menu off (only inside main)
        window.addEventListener(
            "contextmenu",
            (e) => {
                if (e.target instanceof HTMLElement && e.target.closest("main")) e.preventDefault();
            },
            true,
        );

        this.LoadGame();
        this.isInitialized = true;
    }

    public setScene(title: string, constructor: SceneConstructor) {
        this.sceneTitle = title;
        this.sceneConstructor = constructor;
    }

    public HomeCamera(): void {
        let edgesSize = EDGES_SIZE;
        if (this.started) edgesSize = 0;

        const zoom = this.m_scene ? this.m_scene.GetDefaultViewZoom(edgesSize) : 25;
        if (this.pixiSceneManager) {
            const center = this.m_scene ? this.m_scene.getCenter() : { x: 0, y: 512 };
            this.pixiSceneManager.setCameraPosition(center.x, center.y);
            this.pixiSceneManager.setCameraZoom(zoom);
        }
    }

    public HandleEscapeKey(down: boolean): void {
        if (down && this.m_scene) this.m_scene.Deselect(true);
    }

    public HandleMouseMove(e: MouseEvent): void {
        this.m_mouse.x = e.offsetX;
        this.m_mouse.y = e.offsetY;

        const world = { x: e.offsetX, y: e.offsetY };
        this.m_scene?.MouseMove(world, this.m_lMouseDown);

        if (this.m_rMouseDown && this.pixiSceneManager) {
            const cameraPos = this.pixiSceneManager.getCameraPosition();
            const zoom = this.pixiSceneManager.getCameraZoom();
            const f = 1 / zoom;
            this.pixiSceneManager.setCameraPosition(cameraPos.x - e.movementX * f, cameraPos.y + e.movementY * f);
        }
    }

    public HandleMouseDown(e: MouseEvent): void {
        const world = { x: e.offsetX, y: e.offsetY };

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
        if (this.m_scene && this.m_scene.startScene()) this.started = true;
        this.onHasStarted.emit(this.started);
    }

    public Uninitialize(): void {
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

    public LoadGame(restartScene = false): void {
        const SceneClass = this.sceneConstructor;
        if (!SceneClass) return;

        this.m_scene?.Destroy();
        this.started = false;

        const context: PixiSceneContext = {
            pixiSceneManager: this.pixiSceneManager!, // set in init()
            textures: this.textures!, // set in init()
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
            if (firstHk && hk !== firstHk) {
                console.error(`Conflicting keys "${hk.description}" and "${firstHk.description}"`);
            }
        }

        if (!restartScene) this.HomeCamera();
        this.UpdateHoverInfo();
    }

    public Accept(): void {
        if (this.m_scene?.sc_selectedBody && !this.started) {
            const getter = this.m_scene.sc_selectedBody.GetUserData;
            const raw = getter ? getter() : undefined;

            if (!isUnitUserData(raw)) return; // type guard

            // Optional legacy gate; keep if you still rely on unit_type === 1
            if (raw.unit_type !== undefined && raw.unit_type !== 1) return;

            // Apply selected amount & refresh
            raw.amount_alive = this.m_settings.m_amountOfSelectedUnits;

            this.m_scene.sc_selectedUnitProperties = raw;
            this.m_scene.sc_unitPropertiesUpdateNeeded = true;
            this.m_scene.refreshScene(raw);
            this.UpdateHoverInfo();
        }
    }

    public Clone(): void {
        if (this.m_scene?.sc_selectedBody && !this.started) {
            this.m_scene.cloneObject();
        }
    }

    public Split(newAmount: number): void {
        if (this.m_scene?.sc_selectedBody && !this.started) {
            const isCloned = this.m_scene.cloneObject(newAmount);
            if (isCloned) {
                const getter = this.m_scene.sc_selectedBody.GetUserData;
                const current = getter ? getter() : undefined;

                if (isUnitUserData(current) && typeof current.amount_alive === "number") {
                    const secondPart = current.amount_alive - newAmount;
                    if (secondPart > 0) {
                        this.m_settings.m_amountOfSelectedUnits = secondPart;
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
        if (this.pixiSceneManager) this.pixiSceneManager.setGridType(gridType);
    }

    public SimulationLoop(): void {
        if (this.m_fpsCalculator.addFrame() <= 0) return;

        // Update scene
        this.m_scene?.RunStep(this.m_settings, this.m_fpsCalculator.getFps());

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
        if (this.m_scene?.sc_unitPropertiesUpdateNeeded) {
            if (this.m_scene.sc_selectedUnitProperties) {
                this.onUnitSelected.emit(structuredClone(this.m_scene.sc_selectedUnitProperties));
                this.onRaceSelected.emit("");
            } else {
                this.onRaceSelected.emit(this.m_scene?.sc_selectedFactionName ?? "");
                this.onUnitSelected.emit({} as UnitProperties);
            }

            if (this.m_scene?.sc_visibleOverallImpact) {
                this.onVisibleOverallImpactUpdated.emit(structuredClone(this.m_scene.sc_visibleOverallImpact));
            } else {
                this.onVisibleOverallImpactUpdated.emit({} as IVisibleOverallImpact);
            }
            this.m_scene.sc_unitPropertiesUpdateNeeded = false;
        }

        if (this.m_scene?.sc_factionNameUpdateNeeded) {
            if (this.m_scene.sc_selectedFactionName) this.onRaceSelected.emit(this.m_scene.sc_selectedFactionName);
            else this.onRaceSelected.emit("");
            this.m_scene.sc_factionNameUpdateNeeded = false;
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
