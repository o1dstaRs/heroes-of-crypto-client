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

import { b2Clamp, b2Vec2 } from "@box2d/core";
import { DebugDraw } from "@box2d/debug-draw";
import { UnitProperties, HoCConstants, GridType, TeamType, Augment } from "@heroesofcrypto/common";
import { createContext, useContext } from "react";
import { Signal } from "typed-signals";

import "./scenes";
import { getScenesGrouped, Scene, SceneConstructor, SceneEntry } from "./scenes/scene";
import { Settings } from "./settings";
import { IVisibleButton, IVisibleOverallImpact, IVisibleState, VisibleButtonState } from "./state/visible_state";
import { EDGES_SIZE, MAX_FPS } from "./statics";
import { DamageStatisticHolder, IDamageStatistic, IHoverInfo } from "./stats/damage_stats";
import type { SceneControlGroup } from "./ui";
import { g_camera } from "./utils/camera";
import { FpsCalculator } from "./utils/FpsCalculator";
import { createDefaultShader } from "./utils/gl/defaultShader";
import { clearGlCanvas, initGlCanvas, resizeGlCanvas } from "./utils/gl/glUtils";
import { PreloadedTextures, preloadTextures } from "./utils/gl/preload";
import { HotKey, hotKeyPress } from "./utils/hotkeys";

export class GameManager {
    public m_fpsCalculator = new FpsCalculator(200, 1000, MAX_FPS);

    public readonly m_settings = new Settings();

    public m_scene: Scene | null = null;

    public m_lMouseDown = false;

    public m_rMouseDown = false;

    public m_ctx: CanvasRenderingContext2D | null = null;

    private m_mouse = new b2Vec2();

    private sceneBaseHotKeys: HotKey[] = [];

    private sceneHotKeys: HotKey[] = [];

    private allHotKeys: HotKey[] = [];

    private stepHotKeys: HotKey[] = [];

    public readonly groupedScenes = getScenesGrouped();

    public readonly flatScenes: SceneEntry[] = [];

    private sceneConstructor: SceneConstructor | null = null;

    private sceneTitle = "Heroes";

    public readonly onHasStarted = new Signal<(_started: boolean) => void>();

    public readonly onHasButtonsGroupUpdate = new Signal<(_updated: boolean) => void>();

    public readonly onPlacementChanged = new Signal<(_changed: boolean) => void>();

    public readonly onAugmentChanged = new Signal<(_changed: boolean) => void>();

    public readonly onGridTypeChanged = new Signal<(_gridType: GridType) => void>();

    public readonly onAttackLanded = new Signal<(_attackMessage: string) => void>();

    public readonly onDamageReceived = new Signal<(_attackDamage: number) => void>();

    public readonly onUnitSelected = new Signal<(_unitProperties: UnitProperties) => void>();

    public readonly onDamageStatisticsUpdated = new Signal<(_damageStats: IDamageStatistic[]) => void>();

    public readonly onRaceSelected = new Signal<(_raceName: string) => void>();

    public readonly onVisibleStateUpdated = new Signal<(_visibleState: IVisibleState) => void>();

    public readonly onVisibleOverallImpactUpdated = new Signal<
        (_visibleOverallImpact: IVisibleOverallImpact) => void
    >();

    public readonly onHoverInfoUpdated = new Signal<(_visibleState: IHoverInfo) => void>();

    private m_hoveringCanvas = false;

    private m_keyMap: { [s: string]: boolean } = {};

    private gl: WebGLRenderingContext | null = null;

    private textures: PreloadedTextures | null = null;

    private isInitialized = false;

    private defaultShader: ReturnType<typeof createDefaultShader> | null = null;

    private activateScene: (entry: SceneEntry) => void = () => {};

    private setSceneControlGroups: (groups: SceneControlGroup[]) => void = () => {};

    private started = false;

    public constructor() {
        for (const { scenes } of this.groupedScenes) {
            this.flatScenes.push(...scenes);
        }
    }

    public async init(
        glCanvas: HTMLCanvasElement,
        debugCanvas: HTMLCanvasElement,
        wrapper: HTMLDivElement,
        activateScene: (entry: SceneEntry) => void,
        setSceneControlGroups: (groups: SceneControlGroup[]) => void,
    ) {
        if (this.isInitialized) {
            return;
        }
        this.activateScene = activateScene;
        this.setSceneControlGroups = setSceneControlGroups;
        debugCanvas.addEventListener("mousedown", (e) => this.HandleMouseDown(e));
        debugCanvas.addEventListener("mouseup", (e) => this.HandleMouseUp(e));
        debugCanvas.addEventListener("mousemove", (e) => this.HandleMouseMove(e));
        // debugCanvas.addEventListener("wheel", (e) => this.HandleMouseWheel(e));
        debugCanvas.addEventListener("mouseenter", () => {
            this.m_hoveringCanvas = true;
        });
        debugCanvas.addEventListener("mouseleave", () => {
            this.m_hoveringCanvas = false;
        });

        const onResize = () => {
            const { clientWidth, clientHeight } = wrapper;
            if (debugCanvas.width !== clientWidth || debugCanvas.height !== clientHeight) {
                debugCanvas.width = glCanvas.width = clientWidth;
                debugCanvas.height = glCanvas.height = clientHeight;
                g_camera.resize(clientWidth, clientHeight);
                this.m_scene?.Resize(clientWidth, clientHeight);
                this.gl && resizeGlCanvas(glCanvas, this.gl, clientWidth, wrapper.clientHeight);
            }
        };
        window.addEventListener("resize", onResize);
        window.addEventListener("orientationchange", onResize);
        onResize();

        this.m_ctx = debugCanvas.getContext("2d");
        if (!this.m_ctx) throw new Error("Could not create 2d context for debug-draw");
        this.m_settings.m_debugDraw = new DebugDraw(this.m_ctx);

        // disable context menu to use right-click
        window.addEventListener(
            "contextmenu",
            (e) => {
                if (e.target instanceof HTMLElement && e.target.closest("main")) {
                    e.preventDefault();
                }
            },
            true,
        );

        window.addEventListener("keydown", (e: KeyboardEvent): void => this.HandleKey(e, true));
        window.addEventListener("keyup", (e: KeyboardEvent): void => this.HandleKey(e, false));

        await this.prepareGl(glCanvas);
        this.LoadGame();
        this.isInitialized = true;
    }

    private async prepareGl(glCanvas: HTMLCanvasElement) {
        this.gl = initGlCanvas(glCanvas);
        this.textures = await preloadTextures(this.gl);
        this.defaultShader = createDefaultShader(this.gl);
    }

    public setScene(title: string, constructor: SceneConstructor) {
        this.sceneTitle = title;
        this.sceneConstructor = constructor;
    }

    public HomeCamera(): void {
        let edgesSize = EDGES_SIZE;
        if (this.started) {
            edgesSize = 0;
        }

        const zoom = this.m_scene ? this.m_scene.GetDefaultViewZoom(edgesSize) : 25;
        const center = this.m_scene ? this.m_scene.getCenter() : b2Vec2.ZERO;
        g_camera.setPositionAndZoom(center.x, center.y, zoom);
    }

    public ZoomCamera(zoom: number): void {
        g_camera.setZoom(b2Clamp(g_camera.getZoom() * zoom, 0.5, 500));
    }

    public HandleMouseMove(e: MouseEvent): void {
        const element = new b2Vec2(e.offsetX, e.offsetY);
        const world = g_camera.unproject(element, new b2Vec2());

        this.m_mouse.Copy(element);

        this.m_scene?.MouseMove(world, this.m_lMouseDown);

        if (this.m_rMouseDown) {
            const { x, y } = g_camera.getCenter();
            const f = 1 / g_camera.getZoom();
            g_camera.setPosition(x - e.movementX * f, y + e.movementY * f);
        }
    }

    public HandleMouseDown(e: MouseEvent): void {
        const element = new b2Vec2(e.offsetX, e.offsetY);
        const world = g_camera.unproject(element, new b2Vec2());

        switch (e.button) {
            case 0: // left mouse button
                this.m_lMouseDown = true;
                if (e.shiftKey) {
                    this.m_scene?.ShiftMouseDown(world);
                } else {
                    this.m_scene?.MouseDown(world);
                }
                this.UpdateHoverInfo();
                break;
            case 2: // right mouse button
                this.m_rMouseDown = true;
                break;
        }
    }

    public HandleMouseUp(e: MouseEvent): void {
        switch (e.button) {
            case 0: // left mouse button
                this.m_lMouseDown = false;
                this.m_scene?.MouseUp();
                break;
            case 2: // right mouse button
                this.m_rMouseDown = false;
                break;
        }
    }

    public HandleMouseWheel(e: WheelEvent): void {
        if (this.m_hoveringCanvas) {
            if (e.deltaY < 0) {
                this.ZoomCamera(1.1);
            } else if (e.deltaY > 0) {
                this.ZoomCamera(1 / 1.1);
            }
            e.preventDefault();
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
                if (key === "Escape") {
                    this.UpdateHoverInfo();
                }
            }
        }
    }

    public DecrementTest(): void {
        const index = this.flatScenes.findIndex((e) => e.name === this.sceneTitle) - 1;
        if (index < 0) {
            this.activateScene(this.flatScenes[this.flatScenes.length - 1]);
        } else if (index >= 0) {
            this.activateScene(this.flatScenes[index]);
        }
    }

    public IncrementTest(): void {
        const index = this.flatScenes.findIndex((e) => e.name === this.sceneTitle) + 1;
        if (index >= this.flatScenes.length) {
            this.activateScene(this.flatScenes[0]);
        } else if (index > 0) {
            this.activateScene(this.flatScenes[index]);
        }
    }

    public StartGame(): void {
        if (this.m_scene) {
            if (this.m_scene.startScene()) {
                this.started = true;
            }
        }
        this.onHasStarted.emit(this.started);
    }

    public Uninitialize(): void {
        this.isInitialized = false;
    }

    public RequestTime(team?: number): void {
        if (this.started && this.m_scene && team !== undefined) {
            this.m_scene.requestTime(team);
        }
    }

    public GetButtonGroup(): IVisibleButton[] {
        return this.m_scene?.sc_visibleButtonGroup ?? [];
    }

    public PropagateButtonClicked(buttonName: string, buttonState: VisibleButtonState): void {
        this.m_scene?.propagateButtonClicked(buttonName, buttonState);
    }

    public LoadGame(restartScene = false): void {
        const SceneClass = this.sceneConstructor;
        if (
            !SceneClass ||
            !this.m_ctx ||
            !this.gl ||
            !this.defaultShader ||
            !this.textures ||
            !this.m_settings.m_debugDraw
        )
            return;

        this.m_scene?.Destroy();
        this.started = false;
        this.m_scene = new SceneClass({
            gl: this.gl,
            shader: this.defaultShader,
            textures: this.textures,
        });

        // if (this.m_scene) {
        // this.m_scene.switchStarted(this.started);
        // }
        this.m_scene.setupControls();
        this.sceneBaseHotKeys = this.m_scene.getBaseHotkeys();
        this.sceneHotKeys = this.m_scene.getHotkeys();
        this.allHotKeys = [
            ...[
                hotKeyPress("r", "Reset Camera", () => this.HomeCamera()),
                // hotKeyPress("+", "Zoom In", () => this.ZoomCamera(1.1)),
                // hotKeyPress("-", "Zoom Out", () => this.ZoomCamera(0.9)),
                hotKeyPress("s", "Start Scene", () => this.StartGame()),
                hotKeyPress("S", "Start Scene", () => this.StartGame()),
            ],
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
        if (!restartScene) {
            this.HomeCamera();
        }

        // Slice to force an update (and thus a reset) of the UI
        this.setSceneControlGroups(this.m_scene.sc_testControlGroups.slice());
        this.UpdateHoverInfo();
    }

    public Accept(): void {
        if (this.m_scene?.sc_selectedBody && !this.started) {
            const userData = this.m_scene.sc_selectedBody.GetUserData();
            if (!userData || userData.unit_type !== 1) {
                return;
            }

            userData.amount_alive = this.m_settings.m_amountOfSelectedUnits;
            this.m_scene.sc_selectedUnitProperties = userData;
            this.m_scene.sc_unitPropertiesUpdateNeeded = true;
            this.m_scene.refreshScene();
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

            if (isCloned && this.m_scene.sc_selectedBody.GetUserData().amount_alive) {
                const secondPart = this.m_scene.sc_selectedBody.GetUserData().amount_alive - newAmount;
                if (secondPart > 0) {
                    this.m_settings.m_amountOfSelectedUnits = secondPart;
                    this.Accept();
                }
            }
        }
    }

    public PropagateAugmentation(teamType: TeamType, augmentType: Augment.AugmentType): boolean {
        const augmented = this.m_scene?.propagateAugmentation(teamType, augmentType);
        if (augmented && augmentType.type === "Placement") {
            this.onPlacementChanged.emit(true);
        }
        if (augmented) {
            if (this.m_scene) {
                this.m_scene.sc_augmentChanged = true;
            }
            this.onAugmentChanged.emit(augmented);
        }
        return augmented || false;
    }

    public GetNumberOfUnitsAvailableForPlacement(teamType: TeamType): number {
        return this.m_scene?.getNumberOfUnitsAvailableForPlacement(teamType) ?? HoCConstants.MAX_UNITS_PER_TEAM;
    }

    public SetGridType(gridType: GridType): void {
        this.m_scene?.setGridType(gridType);
    }

    public SimulationLoop(): void {
        const draw = this.m_settings.m_debugDraw;
        if (this.m_fpsCalculator.addFrame() <= 0 || !this.gl || !this.defaultShader || !this.m_ctx || !draw) return;

        clearGlCanvas(this.gl, 0, 0, 0, 0);
        this.gl.enable(this.gl.BLEND);
        this.defaultShader.use();
        this.defaultShader.uMVMatrix.set(false, g_camera.modelView);
        this.defaultShader.uPMatrix.set(false, g_camera.projection);

        const center = g_camera.getCenter();
        const zoom = g_camera.getZoom();
        draw.Prepare(center.x, center.y, zoom, true);

        this.m_scene?.RunStep(this.m_settings, this.m_fpsCalculator.getFps());
        if (this.m_hoveringCanvas) {
            for (const hk of this.stepHotKeys) {
                if (this.m_keyMap[hk.key]) hk.callback(true);
            }
        } else {
            if (this.sceneHasHoverInfo()) {
                this.onHoverInfoUpdated.emit({} as IHoverInfo);
                this.m_scene?.cleanupHoverText();
            }
        }

        draw.Finish();

        //        if (this.m_settings.m_drawFpsMeter) this.DrawFpsMeter(this.m_ctx);

        if (this.m_scene?.sc_hoverTextUpdateNeeded) {
            this.UpdateHoverInfo();
            this.m_scene.sc_hoverTextUpdateNeeded = false;
        }

        if (this.m_scene?.sc_sceneLog.hasBeenUpdated()) {
            this.onAttackLanded.emit(this.m_scene?.sc_sceneLog.getLog());
        }

        if (this.m_scene?.sc_unitPropertiesUpdateNeeded) {
            if (this.m_scene?.sc_selectedUnitProperties) {
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
            if (this.m_scene?.sc_selectedFactionName) {
                this.onRaceSelected.emit(this.m_scene?.sc_selectedFactionName ?? "");
            } else {
                // this.onUnitSelected.emit(structuredClone(this.m_scene?.sc_selectedUnitProperties));
                this.onRaceSelected.emit("");
            }

            this.m_scene.sc_factionNameUpdateNeeded = false;
        }

        if (this.m_scene?.sc_damageForAnimation.render) {
            this.onDamageReceived.emit(this.m_scene.sc_damageForAnimation.amount);
            this.m_scene.sc_damageForAnimation.render = false;
            this.m_scene.sc_damageForAnimation.amount = 0;
            this.m_scene.sc_damageForAnimation.unitPosition = { x: 0, y: 0 };
            this.m_scene.sc_damageForAnimation.unitIsSmall = true;
        }

        if (this.m_scene?.sc_damageStatsUpdateNeeded) {
            // this.onDamageStatisticsUpdated.emit([] as IDamageStatistic[]);
            this.onDamageStatisticsUpdated.emit(structuredClone(DamageStatisticHolder.getInstance().get()));

            this.m_scene.sc_damageStatsUpdateNeeded = false;
        }

        if (this.m_scene?.sc_visibleStateUpdateNeeded) {
            if (this.m_scene?.sc_visibleState) {
                // this.onVisibleStateUpdated.emit({} as IVisibleState);
                this.onVisibleStateUpdated.emit(structuredClone(this.m_scene?.sc_visibleState as IVisibleState));
            } else {
                this.onVisibleStateUpdated.emit({} as IVisibleState);
            }
            this.m_scene.sc_visibleStateUpdateNeeded = false;
        }

        if (this.m_scene?.sc_gridTypeUpdateNeeded) {
            this.onGridTypeChanged.emit(this.m_scene?.getGridType());
            this.m_scene.sc_gridTypeUpdateNeeded = false;
        }

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

    public UpdateHoverInfo() {
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
        } else {
            this.onHoverInfoUpdated.emit({} as IHoverInfo);
        }
    }
}

export const ManagerContext = createContext(new GameManager());
export const useManager = () => useContext(ManagerContext);
