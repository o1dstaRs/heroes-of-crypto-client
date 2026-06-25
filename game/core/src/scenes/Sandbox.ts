import { Sprite, Graphics, Container, Texture, BlurFilter } from "pixi.js";
import { PixiDrawer } from "../pixi/PixiDrawer";
import { SandboxDrawer } from "./SandboxDrawer";
import {
    AttackHandler,
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
    AttackType,
    SpellTargetType,
    SpellPowerType,
    SpellHelper,
    ToFactionName,
    HoCMath,
    IWeightedRoute,
    PathHelper,
    TeamType,
    TeamVals,
    UnitProperties,
    IPlacement,
    Unit,
    IAttackTargets,
    IAttackObstacle,
    FightStateManager,
    UnitsHolder,
    MoveHandler,
    SpecificSynergy,
    ToLifeSynergy,
    ToChaosSynergy,
    ToMightSynergy,
    ToNatureSynergy,
    FactionVals,
    AttackVals,
    MovementVals,
    GridVals,
    UnitVals,
    IVisibleDamage,
    AbilityHelper,
    AllAbilities,
    IDamageStatistic,
    GameAction,
    GameActionEngine,
    TurnEngine,
    GameEvent,
    type IGameActionResult,
} from "@heroesofcrypto/common";
import { UnitsOverlay } from "./UnitsOverlay";
import { DamageStatisticHolder } from "./DamageStats";
import { FightStatsTracker } from "./FightStatsTracker";
import { VisibleButtonState, IVisibleUnit } from "./VisibleState";
import { images } from "../generated/image_imports";
import { SceneSettings } from "./SceneSettings";
import { PixiScene, PixiSceneContext, registerScene } from "../pixi/PixiScene";
import { setSpawnFlowPhase } from "../pixi/PixiDrawablePlacement";
import { PlacementManager } from "./PlacementManager";
import { RenderableUnit } from "./RenderableUnit";
import { PixiRenderableSpell } from "./RenderableSpell";
import { HoverManager } from "./HoverManager";
import { ButtonManager } from "./ButtonManager";
import { SpellBookOverlay } from "./SpellBookOverlay";
import { AIController } from "./AIController";
import { DungeonVisuals } from "./sandbox/DungeonVisuals";
import { SmokeLayer } from "./sandbox/SmokeLayer";
import { WindLayer } from "./sandbox/WindLayer";
import { createCinematicFilter } from "./sandbox/CinematicFilter";
import { LightingLayer } from "./sandbox/LightingLayer";
import { MoveAnimationManager } from "./sandbox/MoveAnimationManager";
import { CombatVisuals } from "./sandbox/CombatVisuals";
import { RangedProjectiles, BIG_PROJECTILE_UNITS } from "./sandbox/RangedProjectiles";
import type { AuthoritativeGameSnapshot } from "../game_action_transport";
import { cloneReplayData, SandboxReplayRecorder, type SandboxReplay } from "../replay/sandbox_replay";

/** One unit captured at fight start, enough to recreate it exactly on "Rematch". */
interface IUnitFightSnapshot {
    properties: UnitProperties;
    team: TeamType;
    position: HoCMath.XY;
}

/** Full board snapshot taken at fight start (pre-supply) for "Rematch". */
interface IFightSnapshot {
    units: IUnitFightSnapshot[];
    gridType: GridType;
}

export type SceneActionEngine = Pick<GameActionEngine, "apply">;

export interface SandboxSceneUnitState {
    properties: UnitProperties;
    team: TeamType;
    placed: boolean;
    dead: boolean;
    cells: HoCMath.XY[];
    baseCell: HoCMath.XY;
    attackType?: AttackType;
}

export interface SandboxSceneState {
    gridType: GridType;
    currentLap: number;
    fightStarted: boolean;
    fightFinished: boolean;
    currentUnitId?: string;
    narrowingLayers?: number;
    centerDried?: boolean;
    units: SandboxSceneUnitState[];
}

interface MountainEdgeTarget {
    visualPosition: HoCMath.XY;
    actionPosition: HoCMath.XY;
    cell: HoCMath.XY;
}

interface PlacementBenchHitBox {
    center: HoCMath.XY;
    radius: number;
}

export class Sandbox extends PixiScene {
    private readonly grid: Grid;
    private readonly pathHelper: PathHelper;
    private canAttackByMeleeTargets?: IAttackTargets;
    private canAttackByRangeTargets?: Set<string>;
    // --- Components ---
    private readonly attackHandler: AttackHandler;
    private readonly moveHandler: MoveHandler;
    private hoverManager: HoverManager;
    private buttonManager: ButtonManager;
    private readonly fightStatsTracker = new FightStatsTracker();
    private lastFightSnapshot?: IFightSnapshot;
    // Set while hovering a ranged attack whose line of sight is blocked by the central
    // mountain — the shot (and the click) is redirected to the obstacle instead of the enemy.
    private hoverRangeAttackObstacle?: IAttackObstacle;
    private currentEnemiesCellsWithinMovementRange?: HoCMath.XY[];
    protected unitsOverlay: UnitsOverlay;
    private placementManager: PlacementManager;
    private spawnPulsePhase = 0;
    private bgKey = "background_new";
    private placementGraphics?: Graphics;
    private placementBenchGraphics?: Graphics;
    private readonly placementBenchHitBoxes = new Map<string, PlacementBenchHitBox>();
    private selectedBoardUnit?: RenderableUnit;
    private isActiveUnitMoving = false;
    private gridMatrix: number[][];
    private gridMatrixNoUnits: number[][];
    private cellToUnitPreRound?: Map<string, Unit>;
    protected readonly unitsHolder: UnitsHolder;
    private readonly abilityFactory: AbilityFactory;
    private readonly replayRecorder = new SandboxReplayRecorder(() => this.captureSceneState());
    private replayRecordingSuspended = false;
    private replayPlaybackActive = false;
    private pendingReplayRecords: { action: GameAction; result: IGameActionResult }[] = [];
    /** Active-board-selection state (move existing unit) */
    private draggingUnitId?: string;
    private draggingUnitTeam?: TeamType;
    /** Is there an actual *active* selection (overlay or board)? */
    private hasActiveSelection = false;
    /** True if the active selection came from overlay; false if from board. */
    private selectionFromOverlay = false;
    /** Phase for animating the hover glow (shimmer effect) */
    private hoverGlowPhase = 0;
    private hoverRangeAttackDivisors: number[] = []; // Unified Range Visualization
    private sc_hoveredShotRange?: { xy: HoCMath.XY; distance: number };
    private sc_hoveredAuraRanges?: {
        xy: HoCMath.XY;
        auraRanges: { range: number; isBuff: boolean }[];
        isSmall: boolean;
    };
    // Movement Visualization
    private sc_placementMoveRange?: HoCMath.XY[];
    private sc_lastCalcRef?: { unitId: string; x: number; y: number; steps: number; layoutVersion: number };
    private layoutVersion = 0; // Tracks board topology changes during placement
    private atmosphereAlpha = 0; // [NEW] Transition alpha for night/lights
    // --- Scene Setup ---
    private currentActiveUnit?: RenderableUnit;
    private currentShiftedUnit?: RenderableUnit;
    private currentActivePathHashes?: Set<number>;
    private currentActivePath?: HoCMath.XY[];
    private currentActiveKnownPaths?: Map<number, IWeightedRoute[]>;
    private spawnPulseDirection = 1;
    // AIController manages AI decision-making (created in constructor after super())
    private aiController!: AIController;
    private hasInitializedLap = false;
    private gameplayGraphics?: Graphics;
    private currentActiveSpell?: PixiRenderableSpell;
    private hoveredSpell?: PixiRenderableSpell;
    private spellHoverInfoKey = "";
    private drawnNarrowingLaps: Set<number> = new Set();
    // Debug: render the cell grid once (helps verify attack trajectories / cell alignment).
    private gridDebugRendered = false;
    // Spellbook
    private spellBookContainer: Container;
    private spellBookOverlay?: SpellBookOverlay;
    private digitTextures?: Map<number, Texture>;
    // [NEW] Sub-Managers
    private dungeonVisuals: DungeonVisuals;
    private moveAnimManager: MoveAnimationManager;
    private smokeLayer?: SmokeLayer;
    private windLayer?: WindLayer;
    private lightingLayer?: LightingLayer;
    protected combatVisuals: CombatVisuals;
    private rangedProjectiles: RangedProjectiles;
    // Screen-shake state (e.g. Armageddon wave): offsets the world root with a decaying jitter.
    private shakeTimeLeft = 0;
    private shakeDuration = 0;
    private shakeMagnitude = 0;
    private appliedShakeX = 0;
    private appliedShakeY = 0;
    private sandboxAuthoritativeSequence = -1;
    public constructor(context: PixiSceneContext) {
        const gs = new GridSettings(
            GridConstants.GRID_SIZE,
            GridConstants.MAX_Y,
            GridConstants.MIN_Y,
            GridConstants.MAX_X,
            GridConstants.MIN_X,
            GridConstants.MOVEMENT_DELTA,
            GridConstants.UNIT_SIZE_DELTA,
        );
        super(new SceneSettings(gs, false));
        this.pathHelper = new PathHelper(this.sc_sceneSettings.getGridSettings());
        this.initialize(context);
        this.sc_gridTypeUpdateNeeded = true;
        this.abilityFactory = new AbilityFactory(new EffectFactory());
        const fp = FightStateManager.getInstance().getFightProperties();
        fp.setDefaultPlacementPerTeam(TeamVals.LOWER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        fp.setDefaultPlacementPerTeam(TeamVals.UPPER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        this.grid = new Grid(
            this.sc_sceneSettings.getGridSettings(),
            FightStateManager.getInstance().getFightProperties().getGridType(),
        );
        this.drawer = new PixiDrawer(this.grid, this.pixiApp.getApplication(), this.pixiApp.getWorldRoot());

        // --- Init Sub-Managers (Early) ---
        this.dungeonVisuals = new DungeonVisuals({
            getStage: () => this.pixiApp.getApplication().stage,
            getWorldRoot: () => this.pixiApp.getWorldRoot(),
            getViewportSize: () => this.getViewportSize(),
            getGridSettings: () => this.sc_sceneSettings.getGridSettings(),
            texAny: (n) => this.texAny(n),
            attachToWorldRoot: (o, z) => this.attachToWorldRoot(o, z ?? 0),
        });

        this.moveAnimManager = new MoveAnimationManager({
            getGridSettings: () => this.sc_sceneSettings.getGridSettings(),
            updateSceneLog: (msg) => this.sc_sceneLog.updateLog(msg),
            finishTurn: () => this.finishTurn(),
            setMoveBlocked: (b) => {
                this.sc_moveBlocked = b;
            },
            getHoverManager: () => this.hoverManager,
            getWorldRoot: () => this.pixiApp.getWorldRoot(),
            requestVisibleStateUpdate: () => {
                if (this.sc_visibleState) this.sc_visibleStateUpdateNeeded = true;
            },
        });

        // Procedural smoke for movement tracks — its own layer so the fBM shader only touches dust.
        this.smokeLayer = new SmokeLayer();
        this.attachToWorldRoot(this.smokeLayer.getContainer(), 50);
        this.windLayer = new WindLayer();
        this.attachToWorldRoot(this.windLayer.getContainer(), 50);

        // Cinematic full-scene grade + vignette: post-process the whole game world (camera), which
        // leaves the React/DOM UI untouched and limits the blast radius if the shader misbehaves.
        const cinematic = createCinematicFilter();
        if (cinematic) {
            // Match the display resolution. A camera-wide Filter.from defaults to resolution 1, so it
            // rasterizes the entire world to a 1x render texture and upscales it on HiDPI/Retina
            // displays → the whole scene looks blocky/pixelated (the DOM UI is unaffected).
            cinematic.resolution = this.pixiApp.getApplication().renderer.resolution;
            this.pixiApp.getCamera().filters = [cinematic];
        }

        // Warm torch lighting (additive pools) that follows the action over the darkened dungeon.
        // zIndex must sit ABOVE the units (they use ~3200-4800 via `4000 - pos.y`) so the light
        // actually falls on them, but below placement UI (6000).
        this.lightingLayer = new LightingLayer(this.sc_sceneSettings.getGridSettings());
        this.attachToWorldRoot(this.lightingLayer.getContainer(), 5500);

        this.combatVisuals = new CombatVisuals({
            getGridSettings: () => this.sc_sceneSettings.getGridSettings(),
            attachToWorldRoot: (o, z) => this.attachToWorldRoot(o, z ?? 0),
            getUnitsHolder: () => this.unitsHolder,
            getSelectedUnitProperties: () => this.sc_selectedUnitProperties,
            updateSelectedUnitProperties: (p) => {
                this.sc_selectedUnitProperties = p;
            },
            setUnitPropertiesUpdateNeeded: (b) => {
                this.sc_unitPropertiesUpdateNeeded = b;
            },
        });

        this.rangedProjectiles = new RangedProjectiles({
            getGridSettings: () => this.sc_sceneSettings.getGridSettings(),
            attachToWorldRoot: (o, z) => this.attachToWorldRoot(o, z ?? 0),
        });

        // Hole container init is now in DungeonVisuals
        // We need to attach it here
        this.attachToWorldRoot(this.dungeonVisuals.getHoleContainer(), 1);
        this.spellBookContainer = new Container();
        this.spellBookContainer.visible = false;
        this.spellBookContainer.sortableChildren = true;
        this.spellBookContainer.zIndex = 7000;
        const { width, height } = context.pixiApp.getApplication().screen;
        this.spellBookContainer.position.set(width / 2, height / 2);

        // Add Book Background Graphic
        const bookTex = this.texAny("book_1024");
        if (bookTex) {
            const bookSprite = new Sprite(bookTex);
            bookSprite.anchor.set(0.5);
            bookSprite.position.set(0, 0);
            bookSprite.zIndex = 0;
            this.spellBookContainer.addChild(bookSprite);
        }

        context.pixiApp.getUIContainer().sortableChildren = true;
        context.pixiApp.getUIContainer().addChild(this.spellBookContainer);
        context.pixiApp.getApplication().stage.sortableChildren = true;

        this.unitsHolder = new UnitsHolder(this.grid);
        this.attackHandler = new AttackHandler(
            this.sc_sceneSettings.getGridSettings(),
            this.grid,
            this.sc_sceneLog,
            new DamageStatisticHolder(),
        );
        this.moveHandler = new MoveHandler(this.sc_sceneSettings.getGridSettings(), this.grid, this.unitsHolder);
        this.refreshVisibleStateIfNeeded();
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        this.placementManager = new PlacementManager(this.sc_sceneSettings.getGridSettings());

        this.unitsOverlay = new UnitsOverlay(
            context.pixiApp.getApplication(),
            (name) => this.texAny(name),
            (props) => {
                if (props) {
                    this.selectionFromOverlay = true;
                    this.hasActiveSelection = true;
                    if (this.selectedBoardUnit) {
                        this.selectedBoardUnit.setBoardSelected(false);
                        this.selectedBoardUnit = undefined;
                    }
                    this.draggingUnitId = undefined;
                    this.draggingUnitTeam = undefined;
                    this.sc_selectedUnitProperties = props;
                    this.setSelectedUnitProperties(props);
                    this.hoverManager.resetHover(true);
                } else {
                    if (this.selectionFromOverlay) {
                        this.Deselect(false, true);
                    }
                }
            },
            (name) => {
                const p = this.unitsOverlay?.getUnitProperties(name);
                return p ? p.amount_alive : 99;
            },
        );
        this.unitsOverlay.build();
        if (this.sc_gameActionTransport) {
            this.unitsOverlay.setVisible(false);
        }

        this.hoverManager = new HoverManager({
            grid: this.grid,
            pathHelper: this.pathHelper,
            unitsHolder: this.unitsHolder,
            sceneSettings: this.sc_sceneSettings,
            placementManager: this.placementManager,
            abilityFactory: this.abilityFactory,
            texAny: (name) => this.texAny(name),
            attachToWorldRoot: (obj, z) => this.attachToWorldRoot(obj, z),
            getPlacement: (t, i) => this.getPlacement(t, i),
            getMouseWorld: () => this.sc_mouseWorld,
            getCurrentActiveUnit: () => this.currentActiveUnit,
            getCurrentActivePathHashes: () => this.currentActivePathHashes,
            getDraggingUnitId: () => this.draggingUnitId,
            getDraggingUnitTeam: () => this.draggingUnitTeam,
            getSelectedUnitProperties: () => this.sc_selectedUnitProperties,
            hasActiveSelection: () => this.hasActiveSelection,
        });

        // Spellbook open/close and spell selection are handled authoritatively in MouseDown()
        // (see the "SPELLBOOK" block there). A separate stage 'pointerdown' closer used to race
        // with MouseDown and swallow spell-selection clicks, so it has been removed.
        context.pixiApp.getApplication().stage.eventMode = "static";

        this.buttonManager = new ButtonManager(
            {
                getCurrentActiveUnit: () => this.currentActiveUnit,
                getSceneLog: () => this.sc_sceneLog,
                getGridSettings: () => this.sc_sceneSettings.getGridSettings(),
                applyGameAction: (action) => this.applyGameAction(action),
                refreshUnits: () => this.refreshUnits(),
                updateCurrentMovePath: (c) => this.updateCurrentMovePath(c),
                setUnitPropertiesUpdateNeeded: (n) => {
                    this.sc_unitPropertiesUpdateNeeded = n;
                },
                setCurrentEnemiesCellsWithinMovementRange: (c) => {
                    this.currentEnemiesCellsWithinMovementRange = c;
                },
                setSelectedAttackType: (t) => {
                    this.sc_selectedAttackType = t;
                },
                setCurrentActiveSpell: (s) => {
                    this.currentActiveSpell = s;
                },
                getCurrentActiveSpell: () => this.currentActiveSpell,
                getVisibleState: () => this.sc_visibleState,
                isInputLockedByAI: () => this.isBoardInputLockedByAI(),
                setVisibleButtons: (buttons, updated) => {
                    this.sc_visibleButtonGroup = buttons;
                    this.sc_buttonGroupUpdated = updated;
                },
                setAIActive: (active) => {
                    this.sc_isAIActive = active;
                    this.aiController.isAIActive = active; // Sync AIController state
                    if (active) {
                        this.clearBoardHoverPreviews();
                    }
                },
                setSpellBookOverlay: (active) => {
                    this.sc_renderSpellBookOverlay = active;
                    this.spellBookOverlay?.setOpen(active);
                    this.pixiApp.getWorldRoot().filters = active ? [new BlurFilter({ strength: 8 })] : [];
                },
            },
            this.sc_isAIActive,
        );

        this.moveHandler = new MoveHandler(this.sc_sceneSettings.getGridSettings(), this.grid, this.unitsHolder);

        HoCLib.interval(() => this.updateVisibleTurnTimer(), 500);

        // Initialize AI Controller with IAIContext implementation
        this.aiController = new AIController({
            getCurrentActiveUnit: () => this.currentActiveUnit,
            getGrid: () => this.grid,
            getGridMatrix: () => this.gridMatrix,
            getUnitsHolder: () => this.unitsHolder,
            getAttackHandler: () => this.attackHandler,
            getPathHelper: () => this.pathHelper,
            getHoverManager: () => this.hoverManager,
            getButtonManager: () => this.buttonManager,
            getSceneSettings: () => this.sc_sceneSettings,
            getSceneLog: () => this.sc_sceneLog,
            setCurrentActiveKnownPaths: (paths) => {
                this.currentActiveKnownPaths = paths;
            },
            setSelectedAttackType: (type) => {
                this.sc_selectedAttackType = type;
            },
            isAuthoritativeAction: (action) => this.shouldDeferActionToAuthoritativeReplay(action),
            applyGameAction: (action) => this.applyGameAction(action),
            executeAttackSequence: (attacker, target, attackFrom, replayAction) =>
                this.executeAttackSequence(attacker, target, attackFrom, replayAction),
            executeMoveSequence: (unit, path, overrideFootprint, onComplete, replayAction) =>
                this.executeMoveSequence(unit, path, overrideFootprint, onComplete, replayAction),
            refreshUnits: () => this.refreshUnits(),
        });

        this.spellBookOverlay = new SpellBookOverlay(
            context.pixiApp.getUIContainer(),
            context.pixiApp.getApplication().screen.width,
            context.pixiApp.getApplication().screen.height,
        );
        // --- Init Sub-Managers Moved UP ---
    }
    protected updateVisibleTurnTimer(): void {
        if (!this.sc_visibleState) return;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        this.sc_visibleState.secondsMax = (fightProps.getCurrentTurnEnd() - fightProps.getCurrentTurnStart()) / 1000;
        const remaining = (fightProps.getCurrentTurnEnd() - HoCLib.getTimeMillis()) / 1000;
        this.sc_visibleState.secondsRemaining = remaining > 0 ? remaining : 0;
        this.sc_visibleStateUpdateNeeded = true;
    }
    public override getUnitsOverlay(): UnitsOverlay | undefined {
        return this.sc_gameActionTransport ? undefined : this.unitsOverlay;
    }
    public override setGameActionTransport(transport?: Parameters<PixiScene["setGameActionTransport"]>[0]): void {
        super.setGameActionTransport(transport);
        this.updateUnitsOverlayVisibility();
    }
    protected selectSceneUnitForPlacement(unitId: string): boolean {
        const unit = this.unitsHolder.getAllUnits().get(unitId) as RenderableUnit | undefined;
        if (!unit || FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
            return false;
        }

        if (this.selectedBoardUnit && this.selectedBoardUnit !== unit) {
            this.selectedBoardUnit.setBoardSelected(false);
        }
        this.selectedBoardUnit = unit;
        this.selectedBoardUnit.setBoardSelected(true);
        this.hasActiveSelection = true;
        this.selectionFromOverlay = false;
        this.draggingUnitId = unit.getId();
        this.draggingUnitTeam = unit.getTeam();
        this.sc_selectedUnitProperties = unit.getUnitProperties();
        this.setSelectedUnitProperties(this.sc_selectedUnitProperties);
        this.sc_unitPropertiesUpdateNeeded = true;
        this.hoverManager.resetBoardHoverState();
        this.hoverManager.resetHover(true);
        return true;
    }
    public override selectAuthoritativeUnit(unitId: string): void {
        this.selectSceneUnitForPlacement(unitId);
    }
    protected shouldRenderUnplacedUnitBench(_unitState: SandboxSceneUnitState): boolean {
        return false;
    }
    protected getUnplacedUnitBenchGroupKey(_unitState: SandboxSceneUnitState): string {
        return "default";
    }
    protected getUnplacedUnitBenchPosition(
        index: number,
        total: number,
        _unitState?: SandboxSceneUnitState,
    ): HoCMath.XY | undefined {
        if (total <= 0) {
            return undefined;
        }

        const gs = this.sc_sceneSettings.getGridSettings();
        const cell = gs.getCellSize();
        const columns = Math.min(4, total);
        const rows = Math.ceil(total / columns);
        const column = index % columns;
        const row = Math.floor(index / columns);
        const centerX = (gs.getMinX() + gs.getMaxX()) / 2;
        const centerY = (gs.getMinY() + gs.getMaxY()) / 2;

        return {
            x: centerX + (column - (columns - 1) / 2) * cell * 1.45,
            y: centerY + (row - (rows - 1) / 2) * cell * 1.35,
        };
    }
    protected shouldGhostUnplacedUnitBenchUnit(_unitState: SandboxSceneUnitState): boolean {
        return false;
    }
    protected getCurrentActiveUnit(): RenderableUnit | undefined {
        return this.currentActiveUnit;
    }
    private clearPlacementBench(): void {
        this.placementBenchHitBoxes.clear();
        this.placementBenchGraphics?.clear();
    }
    private ensurePlacementBenchGraphicsWorld(): Graphics {
        if (!this.placementBenchGraphics) {
            this.placementBenchGraphics = new Graphics();
        }
        this.attachToWorldRoot(this.placementBenchGraphics, 2500);
        return this.placementBenchGraphics;
    }
    private drawPlacementBenchBackdrops(positionGroups: HoCMath.XY[][]): void {
        const groups = positionGroups.filter((positions) => positions.length > 0);
        if (!groups.length) {
            this.placementBenchGraphics?.clear();
            return;
        }

        const graphics = this.ensurePlacementBenchGraphicsWorld().clear();
        const gs = this.sc_sceneSettings.getGridSettings();
        const cell = gs.getCellSize();
        const radius = Math.max(6, cell * 0.18);

        for (const positions of groups) {
            const minX = Math.min(...positions.map((position) => position.x)) - cell * 0.95;
            const maxX = Math.max(...positions.map((position) => position.x)) + cell * 0.95;
            const minY = Math.min(...positions.map((position) => position.y)) - cell * 0.9;
            const maxY = Math.max(...positions.map((position) => position.y)) + cell * 0.9;

            graphics
                .roundRect(minX, minY, maxX - minX, maxY - minY, radius)
                .fill({ color: 0x05070c, alpha: 0.56 })
                .stroke({ color: 0xf6d87c, alpha: 0.28, width: Math.max(1, cell * 0.025) });
        }
    }
    private renderUnplacedBenchUnit(
        unit: RenderableUnit,
        position: HoCMath.XY,
        unitState: SandboxSceneUnitState,
    ): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const worldRoot = this.drawer.getUnitsContainer();
        const cell = gs.getCellSize();
        const isLarge = unit.getUnitProperties().size === 2;

        unit.setPosition(position.x, position.y);
        unit.ensureVisual(worldRoot, gs);
        unit.syncVisual(worldRoot, gs);
        unit.setVisualGhost(this.shouldGhostUnplacedUnitBenchUnit(unitState));
        this.placementBenchHitBoxes.set(unit.getId(), {
            center: { x: position.x, y: position.y },
            radius: cell * (isLarge ? 1.05 : 0.7),
        });
    }
    private getBenchUnitAtPosition(worldPos: HoCMath.XY): Unit | undefined {
        const hitEntries = Array.from(this.placementBenchHitBoxes.entries()).reverse();
        for (const [unitId, hitBox] of hitEntries) {
            const dx = worldPos.x - hitBox.center.x;
            const dy = worldPos.y - hitBox.center.y;
            if (dx * dx + dy * dy <= hitBox.radius * hitBox.radius) {
                return this.unitsHolder.getAllUnits().get(unitId);
            }
        }
        return undefined;
    }
    public override applyAuthoritativeSnapshot(snapshot: AuthoritativeGameSnapshot): void {
        if (snapshot.latestSequence <= this.sandboxAuthoritativeSequence) {
            return;
        }
        this.sandboxAuthoritativeSequence = snapshot.latestSequence;

        const units: SandboxSceneUnitState[] = [];
        for (const unitState of snapshot.units) {
            const team = unitState.team as TeamType;
            let baseProperties: UnitProperties;
            try {
                baseProperties = this.unitsOverlay.getUnitProperties(unitState.name);
            } catch {
                this.sc_sceneLog.updateLog(`Cannot restore ${unitState.name} from server snapshot`);
                continue;
            }

            units.push({
                properties: {
                    ...baseProperties,
                    id: unitState.id,
                    team,
                    amount_alive: Math.max(0, Math.floor(unitState.amountAlive)),
                    amount_died: Math.max(0, Math.floor(unitState.amountDied)),
                    hp: unitState.hp || baseProperties.hp,
                    max_hp: unitState.maxHp || baseProperties.max_hp,
                    attack_type_selected: unitState.attackType || baseProperties.attack_type_selected,
                    stack_power: unitState.stackPower || baseProperties.stack_power,
                } as UnitProperties,
                team,
                placed: unitState.placed,
                dead: unitState.dead,
                cells: unitState.cells,
                baseCell: unitState.baseCell,
                attackType: unitState.attackType as AttackType,
            });
        }

        this.hydrateSceneState({
            gridType: snapshot.gridType as GridType,
            currentLap: snapshot.currentLap,
            fightStarted: snapshot.fightStarted,
            fightFinished: snapshot.fightFinished,
            currentUnitId: snapshot.currentUnitId || undefined,
            units,
        });
    }
    public override CameraChanged(): void {
        this.attachToWorldRoot(this.placementGraphics, 90);
        this.attachToWorldRoot(this.gameplayGraphics, 55); // Ranges below units (Units > 100)
        this.dungeonVisuals.attachCenterTerrainSprite();
        this.hoverManager.onCameraChanged();
    }
    protected getPlacement(teamType: TeamType, placementIndex: number): IPlacement | undefined {
        return this.placementManager.getPlacement(teamType, placementIndex);
    }
    /** Get unit by world position using grid occupancy */
    private getUnitAtPosition(worldPos: HoCMath.XY): Unit | undefined {
        const gs = this.sc_sceneSettings.getGridSettings();
        const cell = GridMath.getCellForPosition(gs, worldPos);
        if (cell) {
            const occupantId = this.grid.getOccupantUnitId(cell);
            if (occupantId) {
                return this.unitsHolder.getAllUnits().get(occupantId);
            }
        }
        if (!FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
            return this.getBenchUnitAtPosition(worldPos);
        }
        return undefined;
    }
    protected canSelectUnitForPlacement(_unit: Unit): boolean {
        return true;
    }
    protected ensureCenterTerrainSprite(): void {
        this.dungeonVisuals.ensureCenterTerrainSprite();
    }
    private stepMoveAnimation(dt: number): void {
        this.moveAnimManager.update(dt);
        this.isActiveUnitMoving = this.moveAnimManager.isMoving();
    }
    protected selectUnitPreStart(
        _teamType: TeamType,
        _isSmallUnit: boolean,
        position: HoCMath.XY,
        rangeShotDistance = 0,
        _auraRanges: number[] = [],
        _auraIsBuff: boolean[] = [],
    ): void {
        if (rangeShotDistance > 0) {
            this.sc_currentActiveShotRange = {
                xy: position,
                distance: rangeShotDistance * GridConstants.STEP,
            };
        } else {
            this.sc_currentActiveShotRange = undefined;
        }
    }
    private ensurePlacementGraphicsWorld(): void {
        if (!this.placementGraphics) this.placementGraphics = new Graphics();
        this.attachToWorldRoot(this.placementGraphics, 100);
    }
    private ensureBackgroundSprite(): void {
        this.dungeonVisuals.ensureBackgroundSprite();
    }
    private layoutBackgroundSquare(): void {
        this.dungeonVisuals.layoutBackgroundSquare(this.atmosphereAlpha);
    }
    private updateDungeonAtmosphere(started: boolean, alpha: number): void {
        this.dungeonVisuals.updateDungeonAtmosphere(started, alpha);
    }
    /**
     * Move fire perimeter lights inward toward the center when map narrows.
     * @param inwardOffset - Number of cells to move inward (based on narrowing laps)
     */
    private moveFiresInward(inwardOffset: number): void {
        this.dungeonVisuals.moveFiresInward(inwardOffset);
    }
    private attachToWorldRoot(obj: Graphics | Sprite | Container | undefined, zIndex: number): void {
        if (!obj) return;
        const worldRoot = this.pixiApp.getWorldRoot();
        if (obj.parent !== worldRoot) {
            obj.removeFromParent();
            worldRoot.addChild(obj);
        }
        if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
        obj.zIndex = zIndex;
    }
    private createUnitForTeam(teamType: TeamType, amount?: number): RenderableUnit | undefined {
        const selected = this.sc_selectedUnitProperties;
        if (!selected || teamType === TeamVals.NO_TEAM) return undefined;
        const unit = Unit.createUnit(
            // we need to re-create unitProperties with the right team
            {
                ...selected,
                id: HoCLib.createSecureUuid(),
                team: teamType,
                ...(amount !== undefined && amount > 0 ? { amount_alive: amount } : {}),
            },
            this.sc_sceneSettings.getGridSettings(),
            teamType,
            UnitVals.CREATURE,
            this.abilityFactory,
            this.abilityFactory.getEffectsFactory(),
            false,
        );
        const renderableUnit = RenderableUnit.fromBase(unit, this.texAny);
        if (!this.unitsHolder.getAllUnits().has(unit.getId())) {
            this.unitsHolder.addUnit(renderableUnit);
        }

        // Setup spellbook support
        if (renderableUnit.getSpellsCount() > 0) {
            // Lazy init digit textures
            if (!this.digitTextures) {
                this.digitTextures = new Map<number, Texture>();
                for (let i = 0; i <= 9; i++) {
                    const tex = this.texAny(`digit_${i}`);
                    if (tex) this.digitTextures.set(i, tex);
                }
                const minusOne = this.texAny("digit_-1"); // For damage or specials?
                if (minusOne) this.digitTextures.set(-1, minusOne);
            }
            renderableUnit.setSpellBookLayer(this.spellBookContainer, this.digitTextures);
        }

        if (!this.unitsHolder.getAllUnits().has(unit.getId())) {
            this.unitsHolder.addUnit(renderableUnit);
        }
        return renderableUnit;
    }
    private createSummonedRenderableUnit(
        team: TeamType,
        faction: FactionType,
        unitName: string,
        amount: number,
    ): RenderableUnit | undefined {
        let properties: UnitProperties;
        try {
            properties = HoCConfig.getCreatureConfig(team, ToFactionName[faction], unitName, "", amount);
        } catch {
            this.sc_sceneLog.updateLog(`Cannot summon ${unitName}`);
            return undefined;
        }

        const baseUnit = Unit.createUnit(
            { ...properties, id: HoCLib.createSecureUuid(), team },
            this.sc_sceneSettings.getGridSettings(),
            team,
            UnitVals.CREATURE,
            this.abilityFactory,
            this.abilityFactory.getEffectsFactory(),
            true,
        );
        const renderableUnit = RenderableUnit.fromBase(baseUnit, this.texAny);
        if (renderableUnit.getSpellsCount() > 0) {
            this.ensureDigitTextures();
            if (this.digitTextures) {
                renderableUnit.setSpellBookLayer(this.spellBookContainer, this.digitTextures);
            }
        }
        return renderableUnit;
    }
    private createSplitRenderableUnit(sourceUnit: Unit, amount: number): RenderableUnit | undefined {
        if (amount <= 0) {
            return undefined;
        }
        const sourceProperties = sourceUnit.getUnitProperties();
        const baseUnit = Unit.createUnit(
            {
                ...sourceProperties,
                id: HoCLib.createSecureUuid(),
                team: sourceUnit.getTeam(),
                hp: sourceProperties.max_hp,
                amount_alive: amount,
                amount_died: 0,
                attack_type_selected: sourceProperties.attack_type,
            },
            this.sc_sceneSettings.getGridSettings(),
            sourceUnit.getTeam(),
            UnitVals.CREATURE,
            this.abilityFactory,
            this.abilityFactory.getEffectsFactory(),
            false,
        );
        const renderableUnit = RenderableUnit.fromBase(baseUnit, this.texAny);
        if (renderableUnit.getSpellsCount() > 0) {
            this.ensureDigitTextures();
            if (this.digitTextures) {
                renderableUnit.setSpellBookLayer(this.spellBookContainer, this.digitTextures);
            }
        }
        return renderableUnit;
    }
    protected hydrateSceneState(snapshot: SandboxSceneState): void {
        FightStateManager.getInstance().reset();
        const fightProps = FightStateManager.getInstance().getFightProperties();
        fightProps.setDefaultPlacementPerTeam(TeamVals.LOWER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        fightProps.setDefaultPlacementPerTeam(TeamVals.UPPER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        fightProps.setGridType(snapshot.gridType);
        this.grid.refreshWithNewType(snapshot.gridType);
        this.placementManager.rebuildFromFightProps();

        this.currentActiveUnit?.setActiveTurn(false);
        this.currentActiveUnit = undefined;
        this.currentShiftedUnit = undefined;
        this.selectedBoardUnit = undefined;
        this.draggingUnitId = undefined;
        this.draggingUnitTeam = undefined;
        this.hasActiveSelection = false;
        this.selectionFromOverlay = false;
        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.currentActivePathHashes = undefined;
        this.currentActiveSpell = undefined;
        this.currentEnemiesCellsWithinMovementRange = undefined;
        this.cellToUnitPreRound = undefined;
        this.canAttackByMeleeTargets = undefined;
        this.canAttackByRangeTargets = undefined;
        this.hoverRangeAttackObstacle = undefined;
        this.sc_currentActiveShotRange = undefined;
        this.sc_currentActiveAuraRanges = [];
        this.sc_selectedUnitProperties = undefined;
        this.sc_visibleOverallImpact = undefined;
        this.sc_unitPropertiesUpdateNeeded = true;
        this.sc_moveBlocked = false;
        this.sc_isAnimating = false;
        this.drawnNarrowingLaps.clear();
        this.dungeonVisuals.clearHoleLayers();
        this.dungeonVisuals.setCenterDried(!!snapshot.centerDried);
        if (snapshot.centerDried) {
            this.grid.cleanupCenterObstacle();
        }
        this.hoverManager.clear();
        this.combatVisuals.clear();
        this.rangedProjectiles.clear();

        const existingUnits = Array.from(this.unitsHolder.getAllUnits().values()) as RenderableUnit[];
        if (existingUnits.length) {
            this.destroySpecificUnits(existingUnits, true, false);
        }
        this.clearPlacementBench();

        const gs = this.sc_sceneSettings.getGridSettings();
        const unitsContainer = this.drawer.getUnitsContainer();
        const benchPositions = new Map<string, HoCMath.XY>();
        const benchPositionsByGroup = new Map<string, HoCMath.XY[]>();
        if (!snapshot.fightStarted) {
            const benchUnitStates = snapshot.units.filter(
                (unitState) => !unitState.dead && !unitState.placed && this.shouldRenderUnplacedUnitBench(unitState),
            );
            const benchGroups = new Map<string, SandboxSceneUnitState[]>();
            for (const unitState of benchUnitStates) {
                const groupKey = this.getUnplacedUnitBenchGroupKey(unitState);
                const group = benchGroups.get(groupKey);
                if (group) {
                    group.push(unitState);
                } else {
                    benchGroups.set(groupKey, [unitState]);
                }
            }
            for (const [groupKey, group] of benchGroups.entries()) {
                group.forEach((unitState, index) => {
                    const position = this.getUnplacedUnitBenchPosition(index, group.length, unitState);
                    if (position) {
                        benchPositions.set(unitState.properties.id, position);
                        const groupPositions = benchPositionsByGroup.get(groupKey);
                        if (groupPositions) {
                            groupPositions.push(position);
                        } else {
                            benchPositionsByGroup.set(groupKey, [position]);
                        }
                    }
                });
            }
            this.drawPlacementBenchBackdrops([...benchPositionsByGroup.values()]);
        }

        for (const unitState of snapshot.units) {
            const unit = this.createRenderableUnitFromSceneState(unitState);
            this.unitsHolder.addUnit(unit);
            if (!unitState.placed || !unitState.cells.length) {
                const benchPosition = benchPositions.get(unitState.properties.id);
                if (benchPosition) {
                    this.renderUnplacedBenchUnit(unit, benchPosition, unitState);
                }
                continue;
            }

            const position =
                GridMath.getPositionForCells(gs, unitState.cells) ??
                GridMath.getPositionForCell(unitState.baseCell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
            if (position) {
                unit.setPosition(position.x, position.y);
            }

            this.grid.occupyCells(
                unitState.cells,
                unit.getId(),
                unit.getTeam(),
                unit.getAttackRange(),
                unit.hasAbilityActive("Made of Fire"),
                unit.hasAbilityActive("Made of Water"),
            );

            if (!unitState.dead) {
                unit.ensureVisual(unitsContainer, gs);
                unit.syncVisual(unitsContainer, gs);
            }
        }

        const mutableFightProps = fightProps as unknown as {
            currentLap: number;
            fightStarted: boolean;
            fightFinished: boolean;
        };
        mutableFightProps.currentLap = Math.max(1, Math.floor(snapshot.currentLap || 1));
        mutableFightProps.fightStarted = snapshot.fightStarted;
        mutableFightProps.fightFinished = snapshot.fightFinished;
        fightProps.setTeamUnitsAlive(
            TeamVals.LOWER,
            snapshot.units.filter((unit) => unit.team === TeamVals.LOWER && !unit.dead).length,
        );
        fightProps.setTeamUnitsAlive(
            TeamVals.UPPER,
            snapshot.units.filter((unit) => unit.team === TeamVals.UPPER && !unit.dead).length,
        );

        this.layoutVersion++;
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        this.unitsHolder.refreshStackPowerForAllUnits();
        if (snapshot.narrowingLayers) {
            this.renderNarrowingLayers(snapshot.narrowingLayers);
            this.gridMatrix = this.grid.getMatrix();
            this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        }
        if (!snapshot.fightStarted) {
            this.refreshSynergyNumbers(TeamVals.LOWER);
            this.refreshSynergyNumbers(TeamVals.UPPER);
        }
        this.refreshUnits();
        this.refreshVisibleStateIfNeeded(true);
        this.updateUnitsOverlayVisibility();

        if (snapshot.fightStarted) {
            super.startScene();
            this.atmosphereAlpha = Math.max(this.atmosphereAlpha, 1);
            this.updateDungeonAtmosphere(true, this.atmosphereAlpha);
            const activeUnit = snapshot.currentUnitId
                ? (this.unitsHolder.getAllUnits().get(snapshot.currentUnitId) as RenderableUnit | undefined)
                : undefined;
            if (activeUnit && !activeUnit.isDead()) {
                this.handleNextUnitActivation(activeUnit);
            }
            this.fightStatsTracker.start(this.unitsHolder.getAllUnits().values());
            this.updateLiveFightStats();
        } else {
            this.sc_visibleStateUpdateNeeded = true;
        }
    }
    private createRenderableUnitFromSceneState(unitState: SandboxSceneUnitState): RenderableUnit {
        const base = Unit.createUnit(
            unitState.properties,
            this.sc_sceneSettings.getGridSettings(),
            unitState.team,
            UnitVals.CREATURE,
            this.abilityFactory,
            this.abilityFactory.getEffectsFactory(),
            false,
        );
        const renderableUnit = RenderableUnit.fromBase(base, this.texAny);
        if (renderableUnit.getSpellsCount() > 0) {
            this.ensureDigitTextures();
            if (this.digitTextures) {
                renderableUnit.setSpellBookLayer(this.spellBookContainer, this.digitTextures);
            }
        }
        renderableUnit.refreshPossibleAttackTypes(true);
        if (unitState.attackType !== undefined) {
            renderableUnit.selectAttackType(unitState.attackType);
        }
        return renderableUnit;
    }
    private captureSceneState(): SandboxSceneState {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const units: SandboxSceneUnitState[] = [];

        for (const unit of this.unitsHolder.getAllUnits().values()) {
            const cells = unit.getCells().map((cell) => ({ x: cell.x, y: cell.y }));
            const occupiedCells = cells.filter((cell) => this.grid.getOccupantUnitId(cell) === unit.getId());
            const baseCell = unit.getBaseCell();
            units.push({
                properties: unit.getAllProperties(),
                team: unit.getTeam(),
                placed: occupiedCells.length > 0,
                dead: unit.isDead(),
                cells: occupiedCells,
                baseCell: { x: baseCell.x, y: baseCell.y },
                attackType: unit.getAttackTypeSelection(),
            });
        }

        return {
            gridType: fightProps.getGridType(),
            currentLap: fightProps.hasFightStarted() ? fightProps.getCurrentLap() : 0,
            fightStarted: fightProps.hasFightStarted(),
            fightFinished: fightProps.hasFightFinished(),
            currentUnitId: this.currentActiveUnit?.getId(),
            narrowingLayers: fightProps.hasFightStarted()
                ? Math.min(Math.max(0, fightProps.getLapsNarrowed()), HoCConstants.MAX_HOLE_LAYERS)
                : 0,
            centerDried: this.dungeonVisuals.isCenterDried(),
            units,
        };
    }
    public override getCurrentSandboxReplay(): SandboxReplay | undefined {
        return this.replayRecorder.getCurrentReplay();
    }
    public override canPlayCurrentSandboxReplay(): boolean {
        return !!this.getCurrentSandboxReplay()?.actions.length;
    }
    public override async playSandboxReplay(
        replay: SandboxReplay,
        throughSequence = replay.actions.length,
    ): Promise<boolean> {
        const sequence = Math.max(0, Math.min(Math.floor(throughSequence), replay.actions.length));
        if (!replay.initialState) {
            return false;
        }

        const finalRecord = sequence > 0 ? replay.actions[sequence - 1] : undefined;
        const finalWinner = replay.actions
            .slice(0, sequence)
            .flatMap((record) => record.events)
            .reduce<Extract<GameEvent, { type: "fight_finished" }> | undefined>(
                (winner, event) => (event.type === "fight_finished" ? event : winner),
                undefined,
            );

        this.replayPlaybackActive = true;
        this.replayRecordingSuspended = true;
        this.pendingReplayRecords = [];
        try {
            this.hydrateSceneState(cloneReplayData(replay.initialState));
            this.sc_sceneLog.clear();
            if (sequence <= 0) {
                return true;
            }

            const records = replay.actions.slice(0, sequence);
            const startFightIndex = records.findIndex((record) => record.action.type === "start_fight");

            for (let index = 0; index < records.length; index += 1) {
                const record = records[index];
                const previousState = index > 0 ? records[index - 1]?.stateAfter : replay.initialState;

                if (this.shouldApplyReplayRecordAsCheckpoint(record, index, startFightIndex)) {
                    this.hydrateSceneState(cloneReplayData(record.stateAfter));
                    continue;
                }

                if (previousState) {
                    this.hydrateSceneState(cloneReplayData(previousState));
                }

                const played = await this.playSandboxReplayRecord(record);
                if (!played) {
                    console.warn("Replay could not animate action", record.action.type, record.action);
                }
                this.hydrateSceneState(cloneReplayData(record.stateAfter));
                await this.delayReplay(180);
            }

            if (finalRecord?.stateAfter) {
                this.hydrateSceneState(cloneReplayData(finalRecord.stateAfter));
                if (finalRecord.stateAfter.fightFinished && finalWinner?.type === "fight_finished") {
                    this.finishFight(finalWinner.winningTeam, { mechanicsAlreadyApplied: true });
                }
            }
            return true;
        } finally {
            this.replayRecordingSuspended = false;
            this.replayPlaybackActive = false;
        }
    }
    public override async playAuthoritativeActionRecord(
        action: GameAction,
        events: GameEvent[],
        stateAfter?: unknown,
    ): Promise<boolean> {
        if (!events.length) {
            return false;
        }

        const record: SandboxReplay["actions"][number] = {
            sequence: 0,
            clientTimeMs: Date.now(),
            action: cloneReplayData(action),
            events: cloneReplayData(events),
            stateAfter: this.isSandboxSceneState(stateAfter) ? cloneReplayData(stateAfter) : this.captureSceneState(),
        };

        const priorPlaybackActive = this.replayPlaybackActive;
        this.replayPlaybackActive = true;
        try {
            const played = await this.playSandboxReplayRecord(record);
            if (!played) {
                this.applyReplayEvents(record.events);
            }
            return true;
        } finally {
            this.replayPlaybackActive = priorPlaybackActive;
        }
    }
    private delayReplay(ms: number): Promise<void> {
        return new Promise((resolve) => {
            globalThis.setTimeout(resolve, ms);
        });
    }
    private isSandboxSceneState(value: unknown): value is SandboxSceneState {
        if (!value || typeof value !== "object") {
            return false;
        }
        const state = value as Partial<SandboxSceneState>;
        if (!Array.isArray(state.units)) {
            return false;
        }
        return state.units.every((unit) => !!unit && typeof unit === "object" && "properties" in unit);
    }
    private shouldApplyReplayRecordAsCheckpoint(
        record: SandboxReplay["actions"][number],
        index: number,
        startFightIndex: number,
    ): boolean {
        if (startFightIndex >= 0 && index <= startFightIndex) {
            return true;
        }
        return (
            record.action.type === "start_fight" ||
            record.action.type === "place_unit" ||
            record.action.type === "split_unit" ||
            record.action.type === "delete_unit"
        );
    }
    private async playSandboxReplayRecord(record: SandboxReplay["actions"][number]): Promise<boolean> {
        const action = cloneReplayData(record.action);
        const replayActorId = this.getReplayTurnActorId(action);
        if (replayActorId && !this.ensureReplayActiveUnit(replayActorId)) {
            return false;
        }
        switch (action.type) {
            case "start_fight": {
                const started = this.startScene();
                this.advanceAfterNoActiveUnitIfNeeded();
                return started;
            }
            case "move_unit":
                return this.playReplayMoveRecord(record);
            case "melee_attack":
            case "range_attack":
                return this.playReplayAttackRecord(record);
            case "obstacle_attack":
                return this.playReplayObstacleAttackAction(action);
            case "area_throw_attack":
                return this.playReplayAreaThrowAction(action);
            case "cast_spell":
                return this.playReplayCastSpellAction(action);
            case "end_turn":
            case "wait_turn":
            case "defend_turn":
            case "select_attack_type":
                return this.playReplayControlRecord(record);
            case "place_unit":
            case "split_unit":
            case "delete_unit":
                return this.applyGameAction(action);
            default:
                return false;
        }
    }
    private getReplayTurnActorId(action: GameAction): string | undefined {
        switch (action.type) {
            case "end_turn":
            case "wait_turn":
            case "defend_turn":
            case "select_attack_type":
            case "move_unit":
                return action.unitId;
            case "melee_attack":
            case "range_attack":
            case "obstacle_attack":
            case "area_throw_attack":
                return action.attackerId;
            case "cast_spell":
                return action.casterId;
            case "start_fight":
            case "place_unit":
            case "split_unit":
            case "delete_unit":
                return undefined;
            default:
                return undefined;
        }
    }
    private ensureReplayActiveUnit(unitId: string): boolean {
        const unit = this.unitsHolder.getAllUnits().get(unitId) as RenderableUnit | undefined;
        if (!unit || unit.isDead()) {
            return false;
        }

        if (this.currentActiveUnit?.getId() === unitId) {
            return true;
        }

        if (this.currentActiveUnit) {
            this.currentActiveUnit.setActiveTurn(false);
            this.currentActiveUnit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
        }
        this.handleNextUnitActivation(unit);
        return true;
    }
    private async playReplayControlRecord(record: SandboxReplay["actions"][number]): Promise<boolean> {
        const action = record.action;
        const actorId = this.getReplayTurnActorId(action);
        const actor = actorId ? (this.unitsHolder.getAllUnits().get(actorId) as RenderableUnit | undefined) : undefined;

        switch (action.type) {
            case "end_turn":
                if (actor) {
                    this.sc_sceneLog.updateLog(`${actor.getName()} skips turn`);
                }
                break;
            case "wait_turn":
                if (actor) {
                    this.sc_sceneLog.updateLog(`${actor.getName()} waits (hourglass)`);
                }
                break;
            case "defend_turn":
                if (actor) {
                    this.sc_sceneLog.updateLog(`${actor.getName()} uses Luck Shield`);
                }
                break;
            case "select_attack_type":
                break;
            default:
                return false;
        }

        this.applyReplayEvents(record.events);
        await this.delayReplay(220);
        return true;
    }
    private playReplayMoveRecord(record: SandboxReplay["actions"][number]): Promise<boolean> {
        const action = cloneReplayData(record.action);
        if (action.type !== "move_unit") {
            return Promise.resolve(false);
        }

        const unit = this.unitsHolder.getAllUnits().get(action.unitId) as RenderableUnit | undefined;
        const moveEvent = record.events.find(
            (event): event is Extract<GameEvent, { type: "unit_moved" }> =>
                event.type === "unit_moved" && event.unitId === action.unitId,
        );
        if (!unit || !moveEvent) {
            return Promise.resolve(false);
        }

        this.currentActiveUnit = unit;
        unit.setActiveTurn(true);
        unit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
        return this.playRecordedMoveAnimation(unit, moveEvent);
    }
    private playRecordedMoveAnimation(
        unit: RenderableUnit,
        moveEvent: Extract<GameEvent, { type: "unit_moved" }>,
    ): Promise<boolean> {
        const worldPath = this.createRecordedMoveWorldPath(unit, moveEvent);
        if (worldPath.length < 2) {
            unit.setPosition(moveEvent.to.x, moveEvent.to.y);
            unit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
            return Promise.resolve(true);
        }

        return new Promise((resolve) => {
            const gs = this.sc_sceneSettings.getGridSettings();
            const speed = gs.getCellSize() * 16;
            this.moveAnimManager.startMoveAnimation(
                unit,
                worldPath,
                speed,
                this.getRecordedMoveDestCell(moveEvent),
                this.shouldUseRecordedMoveTrack(unit, moveEvent) ? moveEvent.path : undefined,
                () => resolve(true),
            );
            this.isActiveUnitMoving = true;
            if (this.sc_visibleState) {
                this.sc_visibleStateUpdateNeeded = true;
            }

            this.hoverManager.setSilhouetteLocked(true);
            this.currentActivePath = undefined;
            this.currentActiveKnownPaths = undefined;
            this.currentActivePathHashes = undefined;
            this.hoverManager.clearHoverSilhouette();
            this.hoverManager.hoveredUnitHighlight = undefined;
            this.sc_moveBlocked = true;
        });
    }
    private createRecordedMoveWorldPath(
        unit: RenderableUnit,
        moveEvent: Extract<GameEvent, { type: "unit_moved" }>,
    ): HoCMath.XY[] {
        const gs = this.sc_sceneSettings.getGridSettings();
        const worldPath: HoCMath.XY[] = [{ x: moveEvent.from.x, y: moveEvent.from.y }];
        unit.setPosition(moveEvent.from.x, moveEvent.from.y);

        if (!moveEvent.path.length || this.isRecordedMoveFootprintOnly(unit, moveEvent)) {
            this.pushReplayWorldPathPoint(worldPath, moveEvent.to);
            return worldPath;
        }

        let offsetX = 0;
        let offsetY = 0;
        if (!unit.isSmallSize()) {
            const lastPathCell = moveEvent.path[moveEvent.path.length - 1];
            const lastCellPos = GridMath.getPositionForCell(lastPathCell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
            if (lastCellPos) {
                offsetX = moveEvent.to.x - lastCellPos.x;
                offsetY = moveEvent.to.y - lastCellPos.y;
            }
        }

        for (const cell of moveEvent.path) {
            const pos = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
            if (pos) {
                this.pushReplayWorldPathPoint(worldPath, { x: pos.x + offsetX, y: pos.y + offsetY });
            }
        }
        this.pushReplayWorldPathPoint(worldPath, moveEvent.to);
        return worldPath;
    }
    private pushReplayWorldPathPoint(path: HoCMath.XY[], point: HoCMath.XY): void {
        const last = path[path.length - 1];
        if (!last || Math.abs(last.x - point.x) > 0.01 || Math.abs(last.y - point.y) > 0.01) {
            path.push({ x: point.x, y: point.y });
        }
    }
    private isRecordedMoveFootprintOnly(
        unit: RenderableUnit,
        moveEvent: Extract<GameEvent, { type: "unit_moved" }>,
    ): boolean {
        return (
            !unit.isSmallSize() &&
            moveEvent.targetCells.length === moveEvent.path.length &&
            moveEvent.path.length > 0 &&
            moveEvent.path.every((cell) =>
                moveEvent.targetCells.some((targetCell) => targetCell.x === cell.x && targetCell.y === cell.y),
            )
        );
    }
    private shouldUseRecordedMoveTrack(
        unit: RenderableUnit,
        moveEvent: Extract<GameEvent, { type: "unit_moved" }>,
    ): boolean {
        return moveEvent.path.length > 0 && !this.isRecordedMoveFootprintOnly(unit, moveEvent);
    }
    private getRecordedMoveDestCell(moveEvent: Extract<GameEvent, { type: "unit_moved" }>): HoCMath.XY {
        if (moveEvent.targetCells.length) {
            return moveEvent.targetCells[0];
        }
        if (moveEvent.path.length) {
            return moveEvent.path[moveEvent.path.length - 1];
        }
        return (
            GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), moveEvent.to) ?? {
                x: Math.round(moveEvent.to.x),
                y: Math.round(moveEvent.to.y),
            }
        );
    }
    private async playReplayAttackRecord(record: SandboxReplay["actions"][number]): Promise<boolean> {
        const action = cloneReplayData(record.action);
        if (action.type !== "melee_attack" && action.type !== "range_attack") {
            return false;
        }

        const attacker = this.unitsHolder.getAllUnits().get(action.attackerId) as RenderableUnit | undefined;
        const target = this.unitsHolder.getAllUnits().get(action.targetId) as RenderableUnit | undefined;
        const attackEvent = record.events.find(
            (event): event is Extract<GameEvent, { type: "unit_attacked" }> =>
                event.type === "unit_attacked" && event.attackerId === action.attackerId,
        );
        if (!attacker || !target || !attackEvent) {
            return false;
        }

        this.currentActiveUnit = attacker;
        attacker.setActiveTurn(true);
        attacker.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
        this.sc_moveBlocked = true;

        if (attackEvent.attackType === "range") {
            await this.playReplayProjectile(attacker, target);
            if (attacker.getAbility("Double Shot") && attackEvent.damage.hits && attackEvent.damage.hits.length > 1) {
                void this.playReplayProjectile(attacker, target);
            }
        } else {
            await this.playReplayOneShot(attacker, "attack", 360);
        }

        this.sc_sceneLog.updateLog(`${attacker.getName()} attk ${target.getName()} (${attackEvent.damage.amount})`);
        this.showReplayAttackDamage(attacker, target, attackEvent, record);
        this.applyReplayAttackRecoil(attacker, attackEvent);
        await this.delayReplay(this.getReplayAttackDamageHoldMs(attackEvent));
        this.applyReplayEvents(record.events);
        this.sc_moveBlocked = false;
        await this.delayReplay(420);
        return true;
    }
    private async playReplayProjectile(attacker: RenderableUnit, target: RenderableUnit): Promise<void> {
        const gs = this.sc_sceneSettings.getGridSettings();
        const muzzle = attacker.getVisualCenter(gs);
        const targetPosition = target.getVisualCenter(gs);
        const bigProjectile = BIG_PROJECTILE_UNITS.has(attacker.getName().toLowerCase());
        await this.rangedProjectiles.fire({ from: muzzle, to: targetPosition, big: bigProjectile });
    }
    private playReplayOneShot(unit: RenderableUnit, stateName: string, timeoutMs: number): Promise<void> {
        return new Promise((resolve) => {
            let done = false;
            const finish = (): void => {
                if (done) {
                    return;
                }
                done = true;
                clearTimeout(timeout);
                resolve();
            };
            const timeout = setTimeout(finish, timeoutMs);
            unit.playOneShotAnimation(stateName, finish);
        });
    }
    private showReplayAttackDamage(
        attacker: RenderableUnit,
        target: RenderableUnit,
        attackEvent: Extract<GameEvent, { type: "unit_attacked" }>,
        record: SandboxReplay["actions"][number],
    ): void {
        const damage = attackEvent.damage;
        const damageUnitId = damage.unitId ?? attackEvent.targetId;
        const victim = (this.unitsHolder.getAllUnits().get(damageUnitId) as RenderableUnit | undefined) ?? target;
        const gs = this.sc_sceneSettings.getGridSettings();
        const attackerCenter = attacker.getVisualCenter(gs);
        const victimCenter = victim.getVisualCenter(gs);
        const direction = { x: victimCenter.x - attackerCenter.x, y: victimCenter.y - attackerCenter.y };
        const spawnPos = this.offsetReplayDamagePosition(damage.unitPosition ?? victimCenter, victim, direction);
        const hits = damage.hits ?? [];

        if (!damage.render || (damage.amount <= 0 && !hits.length)) {
            const fallbackDamage = this.getReplayUnitDamage(record, damageUnitId);
            if (fallbackDamage.amount <= 0) {
                return;
            }
            this.combatVisuals.showFloatingDamage(spawnPos, fallbackDamage.amount, direction, fallbackDamage.unitsDied);
            return;
        }

        if (hits.length) {
            hits.forEach((hit, index) => {
                if (hit.amount <= 0) {
                    return;
                }
                const pos = { ...spawnPos };
                setTimeout(() => {
                    this.combatVisuals.showFloatingDamage(pos, hit.amount, direction, hit.unitsDied);
                }, index * 240);
            });
            return;
        }

        this.combatVisuals.showFloatingDamage(
            spawnPos,
            damage.amount,
            direction,
            this.getReplayUnitLoss(record, damageUnitId),
        );
    }
    private offsetReplayDamagePosition(position: HoCMath.XY, unit: RenderableUnit, direction: HoCMath.XY): HoCMath.XY {
        const gs = this.sc_sceneSettings.getGridSettings();
        const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
        const spawnPos = { x: position.x, y: position.y };
        if (len <= 0.001) {
            spawnPos.y += gs.getCellSize();
            return spawnPos;
        }

        const radius = unit.isSmallSize() ? gs.getCellSize() * 0.5 : gs.getCellSize();
        const margin = gs.getCellSize() * 0.5;
        spawnPos.x += (direction.x / len) * (radius + margin);
        spawnPos.y += (direction.y / len) * (radius + margin);
        return spawnPos;
    }
    private getReplayUnitLoss(record: SandboxReplay["actions"][number], unitId: string): number {
        return this.getReplayUnitDamage(record, unitId).unitsDied;
    }
    private getReplayUnitDamage(
        record: SandboxReplay["actions"][number],
        unitId: string,
    ): { amount: number; unitsDied: number } {
        const before = this.unitsHolder.getAllUnits().get(unitId);
        if (!before) {
            return { amount: 0, unitsDied: 0 };
        }
        const after = record.stateAfter.units.find((unitState) => unitState.properties.id === unitId);
        const beforeAmount = before.getAmountAlive();
        const beforeTotalHp = before.getCumulativeHp();
        const afterAmount = Math.max(0, Math.floor(after?.properties.amount_alive ?? 0));
        const maxHp = Math.max(1, after?.properties.max_hp ?? before.getMaxHp());
        const afterHp = afterAmount > 0 ? Math.max(0, after?.properties.hp ?? maxHp) : 0;
        const afterTotalHp = afterAmount > 0 ? (afterAmount - 1) * maxHp + afterHp : 0;
        return {
            amount: Math.max(0, beforeTotalHp - afterTotalHp),
            unitsDied: Math.max(0, beforeAmount - afterAmount),
        };
    }
    private applyReplayAttackRecoil(
        attacker: RenderableUnit,
        attackEvent: Extract<GameEvent, { type: "unit_attacked" }>,
    ): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const attackerCenter = attacker.getVisualCenter(gs);
        for (const animation of attackEvent.animations) {
            const unitId = animation.affectedUnitId ?? animation.bodyUnitId;
            const unit = unitId
                ? (this.unitsHolder.getAllUnits().get(unitId) as RenderableUnit | undefined)
                : undefined;
            if (!unit) {
                continue;
            }
            const from = animation.fromPosition ?? attackerCenter;
            const to = animation.toPosition;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0.001) {
                const magnitude = gs.getCellSize() * 0.28;
                unit.applyRecoil((dx / len) * magnitude, (dy / len) * magnitude);
            }
        }
    }
    private getReplayAttackDamageHoldMs(attackEvent: Extract<GameEvent, { type: "unit_attacked" }>): number {
        const hitCount = attackEvent.damage.hits?.length ?? 0;
        return Math.max(520, (Math.max(1, hitCount) - 1) * 240 + 520);
    }
    protected applyReplayEvents(events: GameEvent[]): void {
        const visibleEvents = events.filter((event) => event.type !== "fight_finished");
        if (!visibleEvents.length) {
            return;
        }
        this.applyTurnEngineEvents(visibleEvents, this.snapshotRenderableUnits());
    }
    private async playReplayObstacleAttackAction(
        action: Extract<GameAction, { type: "obstacle_attack" }>,
    ): Promise<boolean> {
        const unit = this.unitsHolder.getAllUnits().get(action.attackerId) as RenderableUnit | undefined;
        if (!unit) {
            return false;
        }
        this.currentActiveUnit = unit;
        unit.setActiveTurn(true);

        if (!action.attackFrom) {
            return this.applyObstacleAttackAction(unit, action.targetPosition, undefined, action);
        }

        const currentPos = unit.getPosition();
        const attackFromPos = this.getObstacleAttackFromPosition(unit, action.attackFrom);
        if (
            action.path?.length &&
            attackFromPos &&
            (Math.abs(currentPos.x - attackFromPos.x) > 0.1 || Math.abs(currentPos.y - attackFromPos.y) > 0.1)
        ) {
            await new Promise<void>((resolve) => {
                const started = this.executeMoveSequence(
                    unit,
                    action.path!,
                    unit.isSmallSize() ? undefined : this.getLargeUnitObstacleFootprint(action.attackFrom!),
                    resolve,
                );
                if (!started) {
                    resolve();
                }
            });
        }

        return this.applyObstacleAttackAction(unit, action.targetPosition, action.attackFrom, action);
    }
    private async playReplayAreaThrowAction(
        action: Extract<GameAction, { type: "area_throw_attack" }>,
    ): Promise<boolean> {
        const unit = this.unitsHolder.getAllUnits().get(action.attackerId) as RenderableUnit | undefined;
        const gs = this.sc_sceneSettings.getGridSettings();
        const cellPosition = GridMath.getPositionForCell(
            action.targetCell,
            gs.getMinX(),
            gs.getStep(),
            gs.getHalfStep(),
        );
        if (!unit || !cellPosition) {
            return false;
        }
        this.currentActiveUnit = unit;
        await this.performAreaThrow(unit, action.targetCell, cellPosition);
        return true;
    }
    private async playReplayCastSpellAction(action: Extract<GameAction, { type: "cast_spell" }>): Promise<boolean> {
        const caster = this.unitsHolder.getAllUnits().get(action.casterId) as RenderableUnit | undefined;
        if (!caster) {
            return false;
        }

        this.currentActiveUnit = caster;
        const unitSnapshot = this.snapshotRenderableUnits();
        const result = this.createActionEngine().apply(action);
        if (!result.completed) {
            return false;
        }

        this.cleanupAfterSpell(result.events, unitSnapshot);
        await this.delayReplay(250);
        return true;
    }
    private captureFightSnapshot(): IFightSnapshot {
        const units: IUnitFightSnapshot[] = [];
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            units.push({
                // getAllProperties() returns a deep (structuredClone) copy, so the snapshot
                // is isolated from in-fight mutations.
                properties: unit.getAllProperties(),
                team: unit.getTeam(),
                position: { ...unit.getPosition() },
            });
        }
        return {
            units,
            gridType: FightStateManager.getInstance().getFightProperties().getGridType(),
        };
    }
    /**
     * Recreate and restart the exact same fight (same units, positions, map) captured at
     * the start of the previous fight. Returns false if there is nothing to rematch.
     */
    public override rematchLastFight(): boolean {
        const snapshot = this.lastFightSnapshot;
        console.log("[Rematch] start; snapshot units =", snapshot?.units.length ?? "none");
        if (!snapshot || !snapshot.units.length) {
            console.warn("[Rematch] aborted: no saved fight snapshot");
            return false;
        }

        try {
            this.replayRecorder.reset();
            this.pendingReplayRecords = [];
            this.replayRecordingSuspended = true;
            // 1. Reset shared fight state (laps/queues/started/finished). This also randomizes
            //    the grid type, so we re-apply the saved one below.
            FightStateManager.getInstance().reset();

            // reset() also wipes the per-team placement config; re-apply it (mirrors the scene
            // constructor) so getAugmentPlacement / rebuildFromFightProps don't throw.
            const freshProps = FightStateManager.getInstance().getFightProperties();
            freshProps.setDefaultPlacementPerTeam(TeamVals.LOWER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
            freshProps.setDefaultPlacementPerTeam(TeamVals.UPPER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);

            // 2. Clear leftover combat VFX + wipe the current board (force, since units may be
            //    mid/post-fight). destroySpecificUnits frees each unit's grid occupancy.
            this.combatVisuals.clear();
            this.rangedProjectiles.clear();
            const existing = Array.from(this.unitsHolder.getAllUnits().values()) as RenderableUnit[];
            if (existing.length) this.destroySpecificUnits(existing, true, false);
            console.log("[Rematch] wiped", existing.length, "units");

            // Drop selection/hover that referenced now-destroyed units so the side panels
            // don't show stale info from the previous fight.
            this.selectedBoardUnit = undefined;
            this.currentShiftedUnit = undefined;
            this.sc_selectedUnitProperties = undefined;
            this.sc_unitPropertiesUpdateNeeded = true;
            this.hoverManager.clear();

            // 3. Restore the original map geometry + placement zones (setGridType no-ops once a
            //    fight has started, which is why we reset() first).
            this.setGridType(snapshot.gridType);
            this.placementManager.rebuildFromFightProps();

            // 4. Recreate every unit at its saved position through the common placement action
            //    so rematch uses the same occupancy validation and placement event as normal setup.
            const gs = this.sc_sceneSettings.getGridSettings();
            const unitsContainer = this.drawer.getUnitsContainer();
            for (const snap of snapshot.units) {
                const base = Unit.createUnit(
                    { ...snap.properties, id: HoCLib.createSecureUuid(), team: snap.team },
                    gs,
                    snap.team,
                    UnitVals.CREATURE,
                    this.abilityFactory,
                    this.abilityFactory.getEffectsFactory(),
                    false,
                );
                const unit = RenderableUnit.fromBase(base, this.texAny);
                this.unitsHolder.addUnit(unit);

                if (unit.getSpellsCount() > 0) {
                    this.ensureDigitTextures();
                    if (this.digitTextures) unit.setSpellBookLayer(this.spellBookContainer, this.digitTextures);
                }

                // Derive the footprint cells from the saved position.
                unit.setPosition(snap.position.x, snap.position.y);
                const cells = unit.getCells();
                const placementResult = this.createActionEngine().apply({
                    type: "place_unit",
                    unitId: unit.getId(),
                    team: unit.getTeam(),
                    unitName: unit.getName(),
                    cells,
                });
                if (!placementResult.completed) {
                    this.unitsHolder.deleteUnitById(unit.getId());
                    console.warn("[Rematch] skipped invalid placement for", unit.getName(), unit.getId(), cells);
                    continue;
                }

                // Snap to the exact cell-center position the placement flow uses.
                const placeEvent = placementResult.events.find((event) => event.type === "unit_placed");
                const placePos =
                    placeEvent?.type === "unit_placed" ? placeEvent.position : GridMath.getPositionForCells(gs, cells);
                if (placePos) unit.setPosition(placePos.x, placePos.y);
                const scale = unit.ensureVisual(unitsContainer, gs);
                if (scale) unit.startSpawnAnimation(scale);
            }
            console.log("[Rematch] recreated", snapshot.units.length, "units");

            // 5. Refresh derived state.
            this.gridMatrix = this.grid.getMatrix();
            this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
            this.unitsHolder.refreshStackPowerForAllUnits();
            this.refreshSynergyNumbers(TeamVals.LOWER);
            this.refreshSynergyNumbers(TeamVals.UPPER);
            this.refreshUnits();

            // 6. Start the fight again (re-snapshots, re-applies supply, calls startFight()).
            this.replayRecordingSuspended = false;
            const started = this.startScene();
            console.log("[Rematch] startScene() ->", started);
            return started;
        } catch (err) {
            console.error("[Rematch] FAILED:", err);
            return false;
        } finally {
            this.replayRecordingSuspended = false;
        }
    }
    private ensureDigitTextures(): void {
        if (this.digitTextures) return;
        this.digitTextures = new Map<number, Texture>();
        for (let i = 0; i <= 9; i++) {
            const tex = this.texAny(`digit_${i}`);
            if (tex) this.digitTextures.set(i, tex);
        }
        const minusOne = this.texAny("digit_-1");
        if (minusOne) this.digitTextures.set(-1, minusOne);
    }
    public override Resize(w: number, h: number): void {
        // 1) Let the base scene update camera, worldRoot, etc.
        super.Resize(w, h);
        // 2) Background is in screen-space
        this.layoutBackgroundSquare();

        // Update SpellBook Container Position on Resize to keep it centered
        if (this.spellBookContainer) {
            const scale = Math.min(w / 1120, h / 980) * 0.88;
            this.spellBookContainer.scale.set(scale);
            this.spellBookContainer.position.set(w / 2, h / 2);
        }
        if (this.spellBookOverlay) {
            this.spellBookOverlay.resize(w, h);
        }

        // [FIX] Force rebuild of dungeon atmosphere on resize
        this.dungeonVisuals.onResize();

        // 3) Overlay only exists / matters pre-fight
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const fightStarted = fightProps.hasFightStarted();
        if (!fightStarted && this.unitsOverlay) {
            this.unitsOverlay.onResize(w, h);
            // Placement graphics only used pre-fight
            this.attachToWorldRoot(this.placementGraphics, 100);
        } else if (fightStarted && this.unitsOverlay) {
            // Make sure it’s gone once fight has started
            this.unitsOverlay.destroy();
        }
        // 4) Anything that lives in world space and might have been attached.
        // Placement zones must stay below unit sprites; otherwise placed units show badges/stack
        // overlays while their actual art is painted over by the pre-fight placement tint.
        this.attachToWorldRoot(this.placementGraphics, 90);
        // Holes
        this.attachToWorldRoot(this.dungeonVisuals.getHoleContainer(), 20);
        this.attachToWorldRoot(this.gameplayGraphics, 55);
        this.dungeonVisuals.attachCenterTerrainSprite();
        this.spellBookOverlay?.resize(w, h);
        this.hoverManager.onCameraChanged();
    }
    public refreshUnits(): void {
        // those need to be applied first
        this.unitsHolder.applyAugments();
        // now we can refresh unit properties
        this.unitsHolder.refreshAuraEffectsForAllUnits();
        this.unitsHolder.refreshStackPowerForAllUnits();
        // need to call it twice to make sure aura effects are applied
        this.unitsHolder.refreshAuraEffectsForAllUnits();
        this.unitsHolder.refreshStackPowerForAllUnits();
    }
    protected destroySpecificUnits(unitsToDestroy: RenderableUnit[], force = false, isDead = false): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if ((!force && fightProps.hasFightStarted()) || !unitsToDestroy.length) return;
        const destroyedUnitIds = new Set<string>();
        // console.log(`Sandbox: destroySpecificUnits count=${unitsToDestroy.length} force=${force} isDead=${isDead}`);
        for (const utd of unitsToDestroy) {
            const unitId = utd.getId();
            if (destroyedUnitIds.has(unitId)) continue;
            this.layoutVersion++;
            // 1) Remove from UnitsHolder
            const deleted = this.unitsHolder.deleteUnitById(unitId, isDead);
            // console.log(`Sandbox: deleteUnitById(${unitId}) -> ${deleted}`);

            if (deleted) {
                // 2) Cleanup grid occupancy (we still have the Unit instance `utd`)
                this.grid.cleanupAll(unitId, utd.getAttackRange(), utd.isSmallSize());

                // 3) Cleanup Physics Body (if exists) - logic matching test_heroes.ts
                /*
                 * Even though Sandbox.ts might be moving away from direct Box2D usage for everything,
                 * if units have bodies, they must be destroyed to prevent "ghost" obstacles.
                 */
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const context = this as any; // Cast to access inherited/mixed properties if needed, or assume this is the same context.
                // Accessing physics world from GLScene if present
                if (context.sc_world) {
                    // We need to look up the body. test_heroes uses unitsFactory.getUnitBody(id).
                    // We need to check if we can access unitsFactory.
                    try {
                        if (context.unitsFactory) {
                            const unitBody = context.unitsFactory.getUnitBody(unitId);
                            if (unitBody) {
                                context.sc_world.DestroyBody(unitBody);
                            }
                            context.unitsFactory.deleteUnitBody(unitId);
                        }
                    } catch (e) {
                        console.error("Error destroying physics body for unit " + unitId, e);
                    }
                }

                // 4) Remove Pixi visuals + selection
                // Spawn the "broken mirror" shatter from the unit's current sprite before tearing it
                // down (only for real deaths — not placement/force cleanup or resurrections).
                if (isDead) {
                    const shatterInfo = utd.getShatterInfo();
                    if (shatterInfo) {
                        this.combatVisuals?.spawnShatter(shatterInfo);
                    }
                }
                // console.log(`Sandbox: calling destroyVisuals for ${unitId}`);
                utd.destroyVisuals();
                if (this.selectedBoardUnit === utd) {
                    this.selectedBoardUnit = undefined;
                }
                if (this.currentShiftedUnit === utd) {
                    this.currentShiftedUnit = undefined;
                }
                destroyedUnitIds.add(unitId);
            } else {
                const resurrectionMsg = `${utd.getName()} is resurrecting!`;
                this.sc_sceneLog.updateLog(resurrectionMsg);
                // Visual Resurrection Sequence: Death -> Wait -> Spawn(Idle)
                utd.playOneShotAnimation("death", () => {
                    // Enter ghost mode during the wait
                    utd.setVisualGhost(true);
                    setTimeout(() => {
                        const currentScale = utd.getCurrentVisualScale();
                        // Exit ghost mode and start spawn animation
                        utd.setVisualGhost(false);
                        utd.startSpawnAnimation(currentScale);
                    }, 2500);
                });
            }
        }
        this.unitsHolder.refreshStackPowerForAllUnits();
    }
    protected destroyNonPlacedUnits(verifyWithinGridPosition = true): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.hasFightStarted()) return;
        const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
        const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
        const lowerRightPlacement = this.getPlacement(TeamVals.LOWER, 1);
        const upperLeftPlacement = this.getPlacement(TeamVals.UPPER, 1);
        if (!lowerLeftPlacement && !upperRightPlacement && !lowerRightPlacement && !upperLeftPlacement) {
            return;
        }
        // Snapshot units BEFORE we start deleting them from UnitsHolder
        const unitsSnapshot = Array.from(this.unitsHolder.getAllUnits().values()) as RenderableUnit[];
        for (const unit of unitsSnapshot) {
            const unitId = unit.getId();
            const shouldDelete = this.unitsHolder.deleteUnitIfNotAllowed(
                unitId,
                lowerLeftPlacement,
                upperRightPlacement,
                lowerRightPlacement,
                upperLeftPlacement,
                verifyWithinGridPosition,
            );
            if (!shouldDelete) continue;
            // UnitsHolder has already removed the unit at this point,
            // but we still have the original `unit` object for grid cleanup:
            this.grid.cleanupAll(unitId, unit.getAttackRange(), unit.isSmallSize());
            // Remove Pixi visuals + selection
            unit.destroyVisuals();
        }
        this.unitsHolder.refreshStackPowerForAllUnits();
    }
    public propagateAugmentation(teamType: TeamType, augmentType: Augment.AugmentType): boolean {
        const fp = FightStateManager.getInstance().getFightProperties();
        const canAugment = fp.canAugment(teamType, augmentType);
        if (!canAugment) return false;
        const augmented = fp.setAugmentPerTeam(teamType, augmentType);
        if (augmentType.type === "Placement") {
            this.placementManager.rebuildFromFightProps();
            this.destroyNonPlacedUnits(false);
            const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
            const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
            if (lowerLeftPlacement && upperRightPlacement) {
                const targetTeamSize = fp.getNumberOfUnitsAvailableForPlacement(teamType);
                const alliesPlacedCount = this.unitsHolder.getAllAlliesPlaced(
                    teamType,
                    lowerLeftPlacement,
                    upperRightPlacement,
                    this.getPlacement(TeamVals.LOWER, 1),
                    this.getPlacement(TeamVals.UPPER, 1),
                ).length;
                if (alliesPlacedCount > targetTeamSize) {
                    const unitsToCleanup = this.unitsHolder.toCleanupRandomUnitsTillTeamSize(
                        targetTeamSize,
                        teamType,
                        lowerLeftPlacement,
                        upperRightPlacement,
                        this.getPlacement(TeamVals.LOWER, 1),
                        this.getPlacement(TeamVals.UPPER, 1),
                    );
                    if (unitsToCleanup.length) {
                        this.destroySpecificUnits(unitsToCleanup as RenderableUnit[]);
                    }
                }
            }
        }
        if (augmented) {
            this.refreshUnits();
            if (this.sc_selectedUnitProperties) {
                const unitId = this.sc_selectedUnitProperties.id;
                if (unitId) {
                    const unit = this.unitsHolder.getAllUnits().get(unitId);
                    if (unit) {
                        this.sc_selectedUnitProperties = { ...unit.getUnitProperties() };
                    }
                }
                this.setSelectedUnitProperties(this.sc_selectedUnitProperties);
            }
            this.sc_unitPropertiesUpdateNeeded = true;
        }
        return augmented;
    }
    public propagateSynergy(
        teamType: TeamType,
        faction: FactionType,
        synergyName: string,
        synergyLevel: number,
    ): boolean {
        let specificSynergy: SpecificSynergy | undefined = undefined;
        let isNatureSynergy = false;
        if (faction === FactionVals.LIFE) {
            specificSynergy = ToLifeSynergy[synergyName];
        } else if (faction === FactionVals.CHAOS) {
            specificSynergy = ToChaosSynergy[synergyName];
        } else if (faction === FactionVals.MIGHT) {
            specificSynergy = ToMightSynergy[synergyName];
        } else if (faction === FactionVals.NATURE) {
            specificSynergy = ToNatureSynergy[synergyName];
            isNatureSynergy = true;
        }
        if (specificSynergy) {
            const hasUpdated = FightStateManager.getInstance()
                .getFightProperties()
                .updateSynergyPerTeam(teamType, faction, specificSynergy, synergyLevel);

            if (hasUpdated) {
                this.refreshUnits();
                if (this.sc_selectedUnitProperties) {
                    const unitId = this.sc_selectedUnitProperties.id;
                    if (unitId) {
                        const unit = this.unitsHolder.getAllUnits().get(unitId);
                        if (unit) {
                            this.sc_selectedUnitProperties = { ...unit.getUnitProperties() };
                        }
                    }
                    this.setSelectedUnitProperties(this.sc_selectedUnitProperties);
                }
                this.sc_unitPropertiesUpdateNeeded = true;
            }

            // some synergies may affect the board state
            if (hasUpdated && isNatureSynergy) {
                const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
                const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
                if (lowerLeftPlacement && upperRightPlacement) {
                    const targetTeamSize = FightStateManager.getInstance()
                        .getFightProperties()
                        .getNumberOfUnitsAvailableForPlacement(teamType);
                    if (
                        this.unitsHolder.getAllAlliesPlaced(
                            teamType,
                            lowerLeftPlacement,
                            upperRightPlacement,
                            this.getPlacement(TeamVals.LOWER, 1),
                            this.getPlacement(TeamVals.UPPER, 1),
                        ).length > targetTeamSize
                    ) {
                        const unitsToCleanupFromTheBoard = this.unitsHolder.toCleanupRandomUnitsTillTeamSize(
                            targetTeamSize,
                            teamType,
                            lowerLeftPlacement,
                            upperRightPlacement,
                            this.getPlacement(TeamVals.LOWER, 1),
                            this.getPlacement(TeamVals.UPPER, 1),
                        );
                        if (unitsToCleanupFromTheBoard.length) {
                            this.destroySpecificUnits(unitsToCleanupFromTheBoard as RenderableUnit[]);
                        }
                    }
                }
            }
            return hasUpdated;
        }
        return false;
    }
    public getNumberOfUnitsAvailableForPlacement(teamType: TeamType): number {
        return FightStateManager.getInstance().getFightProperties().getNumberOfUnitsAvailableForPlacement(teamType);
    }
    public override propagateButtonClicked(name: string, state: VisibleButtonState): void {
        this.buttonManager.propagateButtonClicked(name, state);
    }
    // Helper to capture total health state and amount of all units
    private captureHealthState(): Map<string, { hp: number; maxHp: number; amount: number; pos: HoCMath.XY }> {
        return this.combatVisuals.captureHealthState();
    }
    // AI action logic has been moved to AIController
    protected refreshSynergyNumbers(teamType: TeamType): void {
        const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
        const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
        if (!lowerLeftPlacement || !upperRightPlacement) {
            return;
        }
        const teamUnits = this.unitsHolder.getAllAlliesPlaced(
            teamType,
            lowerLeftPlacement,
            upperRightPlacement,
            this.getPlacement(TeamVals.LOWER, 1),
            this.getPlacement(TeamVals.UPPER, 1),
        );
        let uniqueNamesLife: string[] = [];
        let uniqueNamesChaos: string[] = [];
        let uniqueNamesMight: string[] = [];
        let uniqueNamesNature: string[] = [];
        for (const ltu of teamUnits) {
            if (ltu.getFaction() === FactionVals.LIFE) {
                if (!uniqueNamesLife.includes(ltu.getName())) {
                    uniqueNamesLife.push(ltu.getName());
                }
            } else if (ltu.getFaction() === FactionVals.CHAOS) {
                if (!uniqueNamesChaos.includes(ltu.getName())) {
                    uniqueNamesChaos.push(ltu.getName());
                }
            } else if (ltu.getFaction() === FactionVals.MIGHT) {
                if (!uniqueNamesMight.includes(ltu.getName())) {
                    uniqueNamesMight.push(ltu.getName());
                }
            } else if (ltu.getFaction() === FactionVals.NATURE) {
                if (!uniqueNamesNature.includes(ltu.getName())) {
                    uniqueNamesNature.push(ltu.getName());
                }
            }
        }
        FightStateManager.getInstance()
            .getFightProperties()
            .setSynergyUnitsPerFactions(
                teamType,
                uniqueNamesLife.length,
                uniqueNamesChaos.length,
                uniqueNamesMight.length,
                uniqueNamesNature.length,
            );
        const synergies = this.sc_possibleSynergiesPerTeam.get(teamType);
        const newSynergies = FightStateManager.getInstance().getFightProperties().getPossibleSynergies(teamType);
        this.sc_possibleSynergiesPerTeam.set(teamType, newSynergies);
        this.sc_possibleSynergiesUpdateNeeded = synergies !== newSynergies;
    }
    protected handleMouseDownForSelectedBody(): void {}
    public cloneObject(newAmount?: number): boolean {
        let cloned = false;
        if (this.sc_selectedUnitProperties) {
            const selectedUnit = this.unitsHolder.getAllUnits().get(this.sc_selectedUnitProperties.id);
            if (!selectedUnit?.getTeam()) {
                return cloned;
            }
            // 1. Army Cap Check
            // Count all units of this team currently on the board/holder
            const currentTeamCount = Array.from(this.unitsHolder.getAllUnits().values()).filter(
                (u) => u.getTeam() === selectedUnit.getTeam(),
            ).length;
            const limit = FightStateManager.getInstance()
                .getFightProperties()
                .getNumberOfUnitsAvailableForPlacement(selectedUnit.getTeam());
            if (currentTeamCount >= limit) {
                return cloned;
            }
            const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
            const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
            if (!lowerLeftPlacement || !upperRightPlacement) {
                return cloned;
            }
            let placement: IPlacement;
            if (selectedUnit.getTeam() === TeamVals.LOWER) {
                placement = lowerLeftPlacement;
            } else {
                placement = upperRightPlacement;
            }
            const isSmallUnit = selectedUnit.getSize() === 1;
            const allowedCells = placement.possibleCellPositions(isSmallUnit);
            HoCLib.shuffle(allowedCells);
            const gs = this.sc_sceneSettings.getGridSettings();
            // Prepare the set of all valid placement hashes for this team to verify boundaries
            const teamAllowedHashes = this.placementManager.getAllowedPlacementCellHashesForTeam(
                selectedUnit.getTeam(),
            );
            for (const cell of allowedCells) {
                // 2. Define the full footprint
                let cellsToOccupy: HoCMath.XY[] = [cell];
                if (!isSmallUnit) {
                    cellsToOccupy = [
                        { x: cell.x, y: cell.y },
                        { x: cell.x + 1, y: cell.y },
                        { x: cell.x, y: cell.y + 1 },
                        { x: cell.x + 1, y: cell.y + 1 },
                    ];
                }
                // 3. CHECK: Boundaries (Ensure EVERY cell is inside the placement zone)
                // Even if the anchor is valid, a large unit might spill out.
                if (teamAllowedHashes) {
                    let allInside = true;
                    for (const c of cellsToOccupy) {
                        const h = (c.x << 4) | c.y;
                        if (!teamAllowedHashes.has(h)) {
                            allInside = false;
                            break;
                        }
                    }
                    if (!allInside) continue; // Skip this position if it bleeds out
                }
                // 4. CHECK: Vacancy (Are these cells free?)
                if (!this.grid.areAllCellsEmpty(cellsToOccupy)) {
                    continue;
                }
                // 5. Create the logical unit
                const newUnit = this.createUnitForTeam(selectedUnit.getTeam(), newAmount);
                if (!newUnit) break;
                const placementAction: GameAction = {
                    type: "place_unit",
                    unitId: newUnit.getId(),
                    team: newUnit.getTeam(),
                    unitName: newUnit.getName(),
                    cells: cellsToOccupy,
                };
                const placementResult = this.createActionEngine().apply(placementAction);
                if (placementResult.completed) {
                    this.layoutVersion++;
                    this.gridMatrix = this.grid.getMatrix();
                    this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
                    // 7. Finalize Position and Visuals
                    const placeEvent = placementResult.events.find((event) => event.type === "unit_placed");
                    const placePos =
                        placeEvent?.type === "unit_placed"
                            ? placeEvent.position
                            : GridMath.getPositionForCells(gs, cellsToOccupy);
                    if (placePos) newUnit.setPosition(placePos.x, placePos.y);
                    const scale = newUnit.ensureVisual(this.drawer.getUnitsContainer(), gs);
                    if (scale) {
                        newUnit.startSpawnAnimation(scale);
                    }
                    // 8. Refresh State
                    this.unitsHolder.refreshStackPowerForAllUnits();
                    this.refreshSynergyNumbers(selectedUnit.getTeam());
                    this.refreshUnits();
                    cloned = true;
                    this.flushPendingReplayRecords();
                    this.grid.print(newUnit.getId());
                    break; // Stop after successful clone
                } else {
                    // If grid occupation failed unexpectedly, cleanup
                    this.unitsHolder.deleteUnitById(newUnit.getId());
                }
            }
        }
        return cloned;
    }
    public deleteObject(): void {
        const u = this.sc_selectedUnitProperties;
        if (!u || !u.id || FightStateManager.getInstance().getFightProperties().hasFightStarted()) return;

        const unit = this.unitsHolder.getAllUnits().get(u.id);
        if (unit) {
            const action: GameAction = { type: "delete_unit", unitId: u.id };
            const unitSnapshot = this.snapshotRenderableUnits();
            const result = this.createActionEngine().apply(action);
            if (!result.completed) return;
            this.applyTurnEngineEvents(result.events, unitSnapshot);

            this.refreshSynergyNumbers(unit.getTeam());
            this.refreshUnits();

            this.Deselect();
        }
    }
    public override refreshScene(u: UnitProperties): void {
        // 1. Safety checks
        if (FightStateManager.getInstance().getFightProperties().hasFightStarted() || !u.id) return;
        const unit = this.unitsHolder.getAllUnits().get(u.id);
        if (unit) {
            // 2. Update the Game Logic
            unit.setAmountAlive(u.amount_alive);
            // 3. Refresh Visuals (Stack power, HP bars, etc.)
            this.refreshUnits();
            // 4. CRITICAL FIX: Sync the UI State
            this.sc_selectedUnitProperties = { ...unit.getUnitProperties() };
            this.sc_unitPropertiesUpdateNeeded = true;
        }
    }
    public override setGridType(gridType: GridType): void {
        super.setGridType(gridType);
        if (FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
            return;
        }
        FightStateManager.getInstance().getFightProperties().setGridType(gridType);
        this.grid.refreshWithNewType(FightStateManager.getInstance().getFightProperties().getGridType());
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        // Fresh terrain starts wet (un-dried) — reset the dried sprite state.
        this.dungeonVisuals?.setCenterDried(false);
        // force as we might have changed the number of laps till narrowing
        this.refreshVisibleStateIfNeeded(true);
    }
    private refreshVisibleStateIfNeeded(force = false) {
        if (!this.sc_visibleState || force) {
            const fightProps = FightStateManager.getInstance().getFightProperties();
            const fightFinished = fightProps.hasFightFinished();
            // Preserve terminal state only while the authoritative fight state is terminal. Vite
            // refreshes can rebuild this object while carrying stale React-facing state; do not let
            // that resurrect the fight-finished overlay for an active or pre-fight board.
            const prevHasFinished = fightFinished ? (this.sc_visibleState?.hasFinished ?? false) : false;
            const prevTeamWin = fightFinished ? this.sc_visibleState?.teamWin : undefined;
            const prevFightStats = this.sc_visibleState?.fightStats;
            const nextFightStats =
                fightFinished || prevFightStats?.winner === TeamVals.NO_TEAM ? prevFightStats : undefined;
            const prevTeamTypeTurn = this.sc_visibleState?.teamTypeTurn;
            const prevLapNumber = this.sc_visibleState?.lapNumber ?? 0;
            const prevUpNext = this.sc_visibleState?.upNext ?? [];
            this.sc_visibleState = {
                canBeStarted: false,
                hasFinished: prevHasFinished,
                teamWin: prevTeamWin,
                secondsRemaining: -1,
                secondsMax: Number.MAX_SAFE_INTEGER,
                teamTypeTurn: prevTeamTypeTurn,
                hasAdditionalTime: false,
                lapNumber: prevLapNumber,
                numberOfLapsTillNarrowing: FightStateManager.getInstance()
                    .getFightProperties()
                    .getNumberOfLapsTillNarrowing(),
                numberOfLapsTillStopNarrowing: HoCConstants.NUMBER_OF_LAPS_TILL_STOP_NARROWING,
                canRequestAdditionalTime: !!FightStateManager.getInstance()
                    .getFightProperties()
                    .requestAdditionalTurnTime(undefined, true),
                upNext: prevUpNext,
                lapsNarrowed: FightStateManager.getInstance().getFightProperties().getLapsNarrowed(),
                // Preserve accumulated fight stats (the ALT-view casualties / "damage dealt")
                // across a forced rebuild; otherwise they're wiped on every lap flip and only
                // reappear on the next casualty sample, so the ALT view looks broken.
                fightStats: nextFightStats,
            };
            this.sc_visibleStateUpdateNeeded = true;
        }
    }
    public getGridType(): GridType {
        return FightStateManager.getInstance().getFightProperties().getGridType();
    }
    public requestTime(_team: number): void {}
    private clearBoardSelection(_notifyUnitDeselected: boolean = true): void {
        // stop board selection animation if any
        if (this.selectedBoardUnit) {
            this.selectedBoardUnit.setBoardSelected(false);
            this.selectedBoardUnit = undefined;
        }
        this.hasActiveSelection = false;
        this.selectionFromOverlay = false;
        this.draggingUnitId = undefined;
        this.draggingUnitTeam = undefined;
        this.sc_selectedUnitProperties = undefined;
        this.hoverManager.resetHover(true);
        this.hoverManager.resetBoardHoverState();
    }
    private tryPlaceUnit(): void {
        const selected = this.sc_selectedUnitProperties;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        // 1. Basic Validations
        if (!this.hasActiveSelection || !selected) {
            console.log("No active selection");
            return;
        }
        if (fightProps.hasFightStarted()) {
            console.log("Fight already started, no placement");
            return;
        }
        if (
            !this.hoverManager.hoverSelectedCells ||
            this.hoverManager.hoverSelectedCells.length === 0 ||
            this.hoverManager.hoverSelectedCellsSwitchToRed
        ) {
            console.log("No valid hoverSelectedCells or hover is red, abort placement");
            if (!this.selectionFromOverlay) {
                this.clearBoardSelection();
            }
            return;
        }
        const teamType = this.hoverManager.hoverPlacementCellTeam;
        if (!teamType) {
            console.log("No hoverPlacementCellTeam, abort placement");
            if (!this.selectionFromOverlay) {
                this.clearBoardSelection();
            }
            return;
        }
        // 2. Validate Placement Hashes
        const gs = this.sc_sceneSettings.getGridSettings();
        const cellsToOccupy = this.hoverManager.hoverSelectedCells;
        for (const c of cellsToOccupy) {
            const h = (c.x << 4) | c.y;
            if (!this.placementManager.getAllowedPlacementCellHashes().has(h)) {
                console.log("Cell not in allowed placement hashes", c);
                if (!this.selectionFromOverlay) this.clearBoardSelection();
                return;
            }
        }
        // Calculate the target world position derived from the hover cells
        const placePos = GridMath.getPositionForCells(gs, cellsToOccupy);
        if (this.draggingUnitId && placePos) {
            const unit = this.unitsHolder.getAllUnits().get(this.draggingUnitId);
            if (unit) {
                const currentPos = unit.getPosition();
                const dx = Math.abs(currentPos.x - placePos.x);
                const dy = Math.abs(currentPos.y - placePos.y);
                if (dx < 0.1 && dy < 0.1) {
                    console.log("Dropped at exact same position. Ignoring action (keeping selection).");
                    return;
                }
            }
        }
        // ------------------------------------------------------------------
        // 3. Check Collision (unless moving existing unit, then we ignore self-collision for now)
        if (!this.draggingUnitId && !this.grid.areAllCellsEmpty(cellsToOccupy)) {
            console.log("Some cells already occupied, abort (new placement)");
            return;
        }
        // 4. Check Team Cap (only for new units)
        const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
        const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
        const lowerRightPlacement = this.getPlacement(TeamVals.LOWER, 1);
        const upperLeftPlacement = this.getPlacement(TeamVals.UPPER, 1);
        if (!this.draggingUnitId && lowerLeftPlacement && upperRightPlacement) {
            const alliesPlacedCount = this.unitsHolder.getAllAlliesPlaced(
                teamType,
                lowerLeftPlacement,
                upperRightPlacement,
                lowerRightPlacement,
                upperLeftPlacement,
            ).length;
            const maxUnitsForTeam = fightProps.getNumberOfUnitsAvailableForPlacement(teamType);
            if (alliesPlacedCount >= maxUnitsForTeam) {
                console.log(
                    `Team ${teamType} reached placement cap ${alliesPlacedCount}/${maxUnitsForTeam}, abort (new placement)`,
                );
                return;
            }
        }
        if (!placePos) {
            console.log("Failed to compute position for cells");
            if (!this.selectionFromOverlay) this.clearBoardSelection();
            return;
        }
        // 5. Resolve Unit Instance
        let unit: RenderableUnit | undefined;
        if (this.draggingUnitId) {
            unit = this.unitsHolder.getAllUnits().get(this.draggingUnitId) as RenderableUnit;
            if (!unit) console.log("Dragging unit not found, will create new");
        }
        if (!unit) {
            unit = this.createUnitForTeam(teamType);
        }
        if (!unit) {
            console.log("Failed to create or resolve unit");
            if (!this.selectionFromOverlay) this.clearBoardSelection();
            return;
        }
        const wasRepositioningPlacedUnit =
            !!this.draggingUnitId && unit.getCells().some((cell) => this.grid.getOccupantUnitId(cell) === unit.getId());
        const placementAction: GameAction = {
            type: "place_unit",
            unitId: unit.getId(),
            team: unit.getTeam(),
            unitName: unit.getName(),
            cells: cellsToOccupy,
        };
        const placementResult = this.createActionEngine().apply(placementAction);
        if (!placementResult.completed) {
            if (!this.draggingUnitId) {
                this.unitsHolder.deleteUnitById(unit.getId());
            }
            if (!this.selectionFromOverlay) this.clearBoardSelection();
            return;
        }
        // 9. Success: Finalize Updates
        const placeEvent = placementResult.events.find((event) => event.type === "unit_placed");
        const placedPosition = placeEvent?.type === "unit_placed" ? placeEvent.position : placePos;
        unit.setPosition(placedPosition.x, placedPosition.y);
        this.layoutVersion++;
        this.refreshSynergyNumbers(unit.getTeam());
        this.refreshUnits();
        this.flushPendingReplayRecords();
        const scale = unit.ensureVisual(this.drawer.getUnitsContainer(), gs);
        if (!scale) {
            console.log("Failed to ensure unit sprite");
            if (!this.selectionFromOverlay) this.clearBoardSelection();
            return;
        }
        // Sync pathfinding matrices
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        if (!wasRepositioningPlacedUnit) {
            unit.startSpawnAnimation(scale);
        }
        this.unitsHolder.refreshStackPowerForAllUnits();
        // 10. Clear Selection / Hover State
        // 10. Update Selection (Don't Clear)
        // Set the placed unit as the selected board unit to show its visuals immediately
        if (this.selectionFromOverlay) {
            this.sc_selectedUnitProperties = undefined;
            this.hoverManager.resetHover(true);
            if (this.unitsOverlay) this.unitsOverlay.clearSelection(true);
            this.hasActiveSelection = false;
            this.selectionFromOverlay = false;
        } else {
            // Board move - Deselect on drop
            if (this.selectedBoardUnit) {
                this.selectedBoardUnit.setBoardSelected(false);
                this.selectedBoardUnit = undefined;
            }
            this.clearBoardSelection();
            this.Deselect(false, true);
        }
        // Cooldown removed as per user request
        this.hoverManager.setLastPlacement(undefined);
    }
    protected destroyTempFixtures(): void {
        this.updateUnitsOverlayVisibility();
    }
    public override ShiftMouseDown(p: HoCMath.XY): void {
        this.sc_mouseWorld = p;
        if (this.sc_isAnimating) return;

        const unit = this.getUnitAtPosition(p);
        if (unit && unit instanceof RenderableUnit) {
            if (
                !FightStateManager.getInstance().getFightProperties().hasFightStarted() &&
                !this.canSelectUnitForPlacement(unit)
            ) {
                return;
            }
            // Set shifted unit (Toggle if same)
            if (this.currentShiftedUnit && this.currentShiftedUnit.getId() === unit.getId()) {
                this.currentShiftedUnit = undefined;
            } else {
                this.currentShiftedUnit = unit;
            }

            // Force Sidebar Update
            const props = unit.getUnitProperties();
            this.sc_selectedUnitProperties = props;
            this.setSelectedUnitProperties(props);
            this.sc_unitPropertiesUpdateNeeded = true;

            // Update Board Selection Visuals
            if (this.selectedBoardUnit && this.selectedBoardUnit !== unit) {
                this.selectedBoardUnit.setBoardSelected(false);
            }
            this.selectedBoardUnit = unit;
            this.selectedBoardUnit.setBoardSelected(true);

            // Reset interaction states to ensure clean inspection
            this.draggingUnitId = undefined;
            this.draggingUnitTeam = undefined;
            this.draggingUnitId = undefined;
            this.draggingUnitTeam = undefined;
            this.hasActiveSelection = false; // Inspection only, do not enter placement/clone mode
            this.selectionFromOverlay = false;
            this.selectionFromOverlay = false;

            // Optional: Log
            // console.log("Shift+Click Shifted Unit:", unit.getName());
        }
    }
    /** MouseDown from screen coords (already converted to world if needed by caller) */
    public override MouseDown(p: HoCMath.XY): void {
        this.sc_mouseWorld = p;

        // --- SPELLBOOK: while the book is open, a click selects a spell or closes the book. ---
        // This is the authoritative spellbook input handler (the stage pointerdown closer was
        // removed to avoid a click-ordering race that swallowed spell-selection clicks).
        if (this.sc_renderSpellBookOverlay) {
            this.handleSpellbookClick(p);
            return;
        }

        const fightProps = FightStateManager.getInstance().getFightProperties();
        // 1. FIGHT STARTED INTERACTION
        if (fightProps.hasFightStarted()) {
            // If AI owns the current turn, board input should not preview or execute player actions.
            if (this.isBoardInputLockedByAI()) {
                this.clearBoardHoverPreviews();
                return;
            }

            // --- SPELL CASTING (single-target): a spell is armed, so this click chooses the target. ---
            if (this.currentActiveSpell && this.currentActiveUnit) {
                const spellTarget = this.getUnitAtPosition(p);
                if (spellTarget && !spellTarget.isDead()) {
                    if (this.castSpellOnTarget(spellTarget)) {
                        return;
                    }
                    // Target invalid per spell rules — keep the spell armed for another pick.
                    this.sc_sceneLog.updateLog(
                        `Cannot cast ${this.currentActiveSpell.getName()} on ${spellTarget.getName()}`,
                    );
                    return;
                }
                // Clicked empty ground — cancel the armed spell.
                this.currentActiveSpell = undefined;
                this.sc_sceneLog.updateLog("Spell cancelled");
                this.buttonManager.refreshButtons(true);
                return;
            }

            // --- OBSTACLE ATTACK: striking the destructible center on BLOCK_CENTER maps. ---
            if (this.attemptObstacleAttack(p)) {
                return;
            }
            // A ranged shot whose line of sight is blocked by the mountain hits the mountain
            // instead of the enemy behind it (the hover step armed this).
            if (this.hoverRangeAttackObstacle && this.attemptObstacleAttack(this.hoverRangeAttackObstacle.position)) {
                return;
            }
            // --- AREA THROW: Gargantuan-style AOE fired at a cell (incl. empty/terrain). ---
            if (this.attemptAreaThrowAttack(p)) {
                return;
            }

            const gs = this.sc_sceneSettings.getGridSettings();

            // Melee Attack Interaction
            if (this.hoverManager.hoverAttackFromCell && this.currentActiveUnit) {
                const cell = GridMath.getCellForPosition(gs, p);
                if (cell) {
                    const occupantId = this.grid.getOccupantUnitId(cell);
                    if (occupantId) {
                        const targetUnit = this.unitsHolder.getAllUnits().get(occupantId);
                        if (targetUnit && targetUnit.getTeam() !== this.currentActiveUnit.getTeam()) {
                            const attackFrom = this.hoverManager.hoverAttackFromCell;
                            const currentPos = this.currentActiveUnit.getPosition();

                            // Check if we need to move (attackFrom is different from current unit visual center/position)
                            // Note: For large units, getPosition() returns the anchor. attackFrom might be different even if same "logical" place?
                            // However, pathHelper usually returns specific anchor cell.
                            // Let's rely on pathfinding check or simple distance check.

                            // If standard adjacent attack without movement, just attack.
                            // If attackFrom is far, we need a path.
                            // Distance check to prevent zero-length moves (more robust than isSameCell)
                            // currentPos is already defined in outer scope
                            const targetPos = GridMath.getPositionForCell(
                                attackFrom,
                                gs.getMinX(),
                                gs.getStep(),
                                gs.getHalfStep(),
                            );
                            let isAtTarget = false;

                            if (targetPos) {
                                const dx = Math.abs(currentPos.x - targetPos.x);
                                const dy = Math.abs(currentPos.y - targetPos.y);
                                if (dx < 0.1 && dy < 0.1) {
                                    isAtTarget = true;
                                }
                            }

                            if (isAtTarget) {
                                // No movement needed (already at attack spot)
                                this.executeAttackSequence(
                                    this.currentActiveUnit,
                                    targetUnit as RenderableUnit,
                                    attackFrom,
                                );
                            } else {
                                // Movement needed!
                                const props = this.currentActiveUnit.getUnitProperties();

                                // Large Unit Logic (Adapted from test_heroes.ts "AI" working logic)
                                if (props.size === 2) {
                                    const key = (attackFrom.x << 4) | attackFrom.y;
                                    const routes = this.currentActiveKnownPaths?.get(key);

                                    if (routes && routes.length > 0) {
                                        const route = routes[0].route;

                                        // Calculate footprint exactly as test_heroes.ts does for large units
                                        // It shifts the center by -halfStep, effectively treating attackFrom as Top-Right ??
                                        // or ensuring collision detection center alignment.
                                        const position = GridMath.getPositionForCell(
                                            attackFrom,
                                            gs.getMinX(),
                                            gs.getStep(),
                                            gs.getHalfStep(),
                                        );
                                        if (!position) {
                                            return;
                                        }
                                        const candidate = GridMath.getCellsAroundPosition(gs, {
                                            x: position.x - gs.getHalfStep(),
                                            y: position.y - gs.getHalfStep(),
                                        });

                                        this.executeMoveSequence(
                                            this.currentActiveUnit,
                                            route, // Use the actual route!
                                            candidate, // overrideFootprint
                                            () => {
                                                if (this.currentActiveUnit) {
                                                    this.executeAttackSequence(
                                                        this.currentActiveUnit,
                                                        targetUnit as RenderableUnit,
                                                        attackFrom,
                                                    );
                                                }
                                            },
                                        );
                                    } else {
                                        console.warn(
                                            "Large Unit Move-Attack: no authorized route found in known paths.",
                                        );
                                    }
                                } else {
                                    // Small Unit Logic (Route based)
                                    const key = (attackFrom.x << 4) | attackFrom.y;
                                    const routes = this.currentActiveKnownPaths?.get(key);
                                    let route: HoCMath.XY[] | undefined;

                                    if (routes && routes.length > 0) {
                                        route = routes[0].route;
                                    }

                                    if (route && route.length > 0) {
                                        this.executeMoveSequence(this.currentActiveUnit, route, undefined, () => {
                                            if (this.currentActiveUnit) {
                                                this.executeAttackSequence(
                                                    this.currentActiveUnit,
                                                    targetUnit as RenderableUnit,
                                                    attackFrom,
                                                );
                                            }
                                        });
                                    } else {
                                        console.warn("Move-Attack: no authorized route found in known paths.");
                                    }
                                }
                            }

                            return;
                        }
                    }
                }
            }
            if (this.currentActiveUnit && this.currentActiveKnownPaths && !this.sc_moveBlocked) {
                const cell = GridMath.getCellForPosition(gs, p);
                if (!cell) return;
                const props = this.currentActiveUnit.getUnitProperties();
                const currentPos = this.currentActiveUnit.getPosition();
                if (props.size === 2) {
                    const candidate = this.hoverManager.findLargeUnitMoveCandidate(cell);
                    if (!candidate) return;
                    const targetPos = GridMath.getPositionForCells(gs, candidate);
                    if (targetPos) {
                        const dx = Math.abs(currentPos.x - targetPos.x);
                        const dy = Math.abs(currentPos.y - targetPos.y);
                        if (dx < 0.1 && dy < 0.1) {
                            console.log("Move target is same as current position. Ignoring.");
                            return;
                        }
                    }
                    this.executeMoveSequence(this.currentActiveUnit, candidate, candidate);
                    return;
                } else {
                    if (!this.hoverManager.isCellReachableForActiveUnit(cell)) return;
                    const key = (cell.x << 4) | cell.y;
                    const routes = this.currentActiveKnownPaths.get(key);
                    if (routes && routes.length > 0) {
                        const route = routes[0].route;
                        if (route.length > 0) {
                            const destCell = route[route.length - 1];
                            const targetPos = GridMath.getPositionForCell(
                                destCell,
                                gs.getMinX(),
                                gs.getStep(),
                                gs.getHalfStep(),
                            );
                            const dx = Math.abs(currentPos.x - targetPos.x);
                            const dy = Math.abs(currentPos.y - targetPos.y);
                            if (dx < 0.1 && dy < 0.1) {
                                console.log("Move target is same as current position. Ignoring.");
                                return;
                            }
                        }
                        this.executeMoveSequence(this.currentActiveUnit, route);
                        return;
                    }
                }
            }
            return;
        }
        // 2. PRE-FIGHT PLACEMENT INTERACTION
        const unitUnderMouse = this.getUnitAtPosition(p);
        if (unitUnderMouse && !this.canSelectUnitForPlacement(unitUnderMouse)) {
            this.clearBoardSelection();
            this.Deselect(false, true);
            return;
        }
        const isSameBenchSelection =
            unitUnderMouse &&
            this.draggingUnitId === unitUnderMouse.getId() &&
            this.placementBenchHitBoxes.has(unitUnderMouse.getId());
        if (isSameBenchSelection) {
            return;
        }
        // Allow switching selection to another unit immediately, instead of trying to place and failing
        const isSwitchingSelection =
            unitUnderMouse && (!this.draggingUnitId || unitUnderMouse.getId() !== this.draggingUnitId);

        if (this.hasActiveSelection && this.sc_selectedUnitProperties && !isSwitchingSelection) {
            this.hoverManager.updateHoverPlacementCell(p);
            if (
                !this.hoverManager.hoverSelectedCells ||
                this.hoverManager.hoverSelectedCells.length === 0 ||
                this.hoverManager.hoverSelectedCellsSwitchToRed
            ) {
                if (!this.selectionFromOverlay) {
                    if (this.selectedBoardUnit) {
                        this.selectedBoardUnit.setBoardSelected(false);
                        this.selectedBoardUnit = undefined;
                    }
                    this.clearBoardSelection();
                    this.Deselect(false, true);
                    return;
                }
                return;
            }
            this.tryPlaceUnit();
            return;
        }

        // 3. UNIT SELECTION (Clicking a unit on board)
        const unit = this.getUnitAtPosition(p);
        if (unit) {
            const ru = unit as RenderableUnit;
            if (this.selectedBoardUnit && this.selectedBoardUnit !== ru) {
                this.selectedBoardUnit.setBoardSelected(false);
            }
            this.selectedBoardUnit = ru;
            this.selectedBoardUnit.setBoardSelected(true);
            const props = unit.getUnitProperties();
            this.hoverManager.setLastPlacement(undefined);
            this.hasActiveSelection = true;
            this.selectionFromOverlay = false;
            this.draggingUnitId = unit.getId();
            this.draggingUnitTeam = unit.getTeam();
            this.sc_selectedUnitProperties = props;
            this.setSelectedUnitProperties(props);
            this.hoverManager.resetBoardHoverState();
            this.hoverManager.updateHoverPlacementCell(p);

            // Force immediate visual update to show ranges instantly
            this.gameplayGraphics?.clear();
            this.hover(); // Recalculate ranges/paths based on new selection
            if (this.gameplayGraphics) {
                this.drawGameplayVisuals(this.gameplayGraphics);
            }
            return;
        }
        super.MouseDown(p);
    }
    /** Close the spellbook overlay and clear its blur filter. */
    private closeSpellBook(): void {
        if (!this.sc_renderSpellBookOverlay) {
            return;
        }
        this.setHoveredSpell(undefined);
        this.sc_renderSpellBookOverlay = false;
        this.buttonManager.sc_renderSpellBookOverlay = false;
        this.spellBookOverlay?.setOpen(false);
        // Hide the book + its spell cells immediately (they live under spellBookContainer) and
        // drop the dim/blur filter, so the overlay is gone this frame rather than next render.
        if (this.spellBookContainer) {
            this.spellBookContainer.visible = false;
        }
        this.pixiApp.getWorldRoot().filters = [];
    }
    private setHoveredSpell(spell: PixiRenderableSpell | undefined, caster?: RenderableUnit): void {
        if (this.hoveredSpell !== spell) {
            this.hoveredSpell?.setHighlighted(false);
            spell?.setHighlighted(true);
            this.hoveredSpell = spell;
        }
        this.setSpellHoverInfo(spell, caster);
    }
    private setSpellHoverInfo(spell: PixiRenderableSpell | undefined, caster?: RenderableUnit): void {
        const lines = spell && caster ? spell.getHoverInfo(caster.getStackPower()) : [];
        const key = lines.join("\n");
        if (this.spellHoverInfoKey === key) return;

        this.spellHoverInfoKey = key;
        this.sc_attackDamageSpreadStr = "";
        this.sc_attackRangeDamageDivisorStr = "";
        this.sc_attackKillSpreadStr = "";
        this.sc_hoverUnitNameStr = "";
        this.sc_hoverUnitLevel = 0;
        this.sc_hoverUnitMovementType = MovementVals.NO_MOVEMENT;
        this.sc_selectedAttackType = AttackVals.NO_ATTACK;
        this.sc_hoverInfoArr = lines;
        this.sc_hoverTextUpdateNeeded = true;
    }
    /**
     * Map a world-space point to global/screen space for spell hit-testing. The spellbook is
     * attached to the UI container, so spell hover/pick compares this
     * against each icon's global getBounds().
     */
    private spellbookGlobalFromWorld(worldPos: HoCMath.XY): HoCMath.XY {
        // isHover() hit-tests against each icon's global getBounds(), so return the click in
        // global (screen) space to match.
        return this.pixiApp.worldToScreen(worldPos.x, worldPos.y);
    }
    /**
     * Handle a click while the spellbook overlay is open.
     * - Single-target spell (ANY_ALLY / ANY_ENEMY / ANY_UNIT / ENEMY_WITHIN_MOVEMENT_RANGE):
     *   arm it and close the book; the next board click on a unit casts it (see castSpellOnTarget).
     * - Click outside the spells: just close the book.
     * - Mass-cast / summon / free-cell types are not wired yet (Phases 3-4 in
     *   PIXI_GAMEPLAY_PARITY_PLAN.md); they close the book with a log for now.
     */
    private handleSpellbookClick(worldPos: HoCMath.XY): void {
        const caster = this.currentActiveUnit;
        const hovered =
            caster instanceof RenderableUnit
                ? caster.getHoveredSpell(this.spellbookGlobalFromWorld(worldPos), true)
                : undefined;
        if (!hovered || !caster) {
            this.closeSpellBook();
            return;
        }

        if (!hovered.canUse(caster.getStackPower())) {
            this.setHoveredSpell(hovered, caster);
            this.sc_sceneLog.updateLog(`${hovered.getName()} is unavailable`);
            return;
        }

        const targetType = hovered.getSpellTargetType();
        const isSingleTarget =
            targetType === SpellTargetType.ANY_ALLY ||
            targetType === SpellTargetType.ANY_ENEMY ||
            targetType === SpellTargetType.ANY_UNIT ||
            targetType === SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE;

        const isMassOrSummon =
            targetType === SpellTargetType.RANDOM_CLOSE_TO_CASTER ||
            targetType === SpellTargetType.ALL_FLYING ||
            targetType === SpellTargetType.ALL_ALLIES ||
            targetType === SpellTargetType.ALL_ENEMIES;

        if (!isSingleTarget) {
            this.closeSpellBook();
            if (isMassOrSummon && this.currentActiveUnit instanceof RenderableUnit) {
                // Mass-cast / summon spells apply immediately (no target click needed).
                this.castMassOrSummonSpell(hovered, this.currentActiveUnit);
            } else {
                // FREE_CELL / AUTO / NO_TYPE are not wired yet (see PIXI_GAMEPLAY_PARITY_PLAN.md).
                this.sc_sceneLog.updateLog(`${hovered.getName()}: this spell type is not supported yet`);
            }
            return;
        }

        // Arm the spell; the next board click on a valid unit casts it.
        this.currentActiveSpell = hovered;
        this.closeSpellBook();
        this.sc_sceneLog.updateLog(`${caster.getName()} prepares ${hovered.getName()} - pick a target`);

        // Switch to the MAGIC attack type (parity with legacy) so the toolbar shows the scepter and
        // the melee hover/attack positions are suppressed while a spell is armed.
        if (
            this.applyGameAction({ type: "select_attack_type", unitId: caster.getId(), attackType: AttackVals.MAGIC })
        ) {
            this.sc_selectedAttackType = caster.getAttackTypeSelection();
        }

        // Recompute movement/targeting paths now that a spell is armed (parity with legacy).
        const currentCell = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), caster.getPosition());
        if (currentCell) {
            this.updateCurrentMovePath(currentCell);
        }

        // Castling (ENEMY_WITHIN_MOVEMENT_RANGE) swaps the caster with a small enemy inside its
        // movement range. canCastSpell — and thus the hover highlight + cast validation — needs the
        // list of those enemies' base cells, so compute it here (parity with the legacy arming path).
        this.currentEnemiesCellsWithinMovementRange = undefined;
        if (currentCell && targetType === SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE && caster.canMove()) {
            const moveCells = this.pathHelper.getMovePath(
                currentCell,
                this.gridMatrixNoUnits,
                caster.getSteps(),
                undefined,
                caster.canFly(),
                caster.isSmallSize(),
                caster.hasAbilityActive("Made of Fire"),
            ).cells;
            const enemies: HoCMath.XY[] = [];
            for (const c of moveCells) {
                const enemyId = this.grid.getOccupantUnitId(c);
                if (!enemyId) continue;
                const enemy = this.unitsHolder.getAllUnits().get(enemyId);
                if (!enemy || enemy.getTeam() === caster.getTeam() || !enemy.isSmallSize()) continue;
                enemies.push(enemy.getBaseCell());
            }
            this.currentEnemiesCellsWithinMovementRange = enemies.length ? enemies : undefined;
        }

        // Refresh the toolbar so the spellbook button shows the armed spell's icon immediately.
        this.buttonManager.refreshButtons(true);
    }
    /**
     * Cast the currently-armed single-target spell on `targetUnit` via the shared magic-attack
     * handler (handles heal / resurrect / buff / debuff, magic-resist rolls, and spell consumption).
     * Returns true if the spell was applied (turn finished), false if the target was invalid.
     */
    private castSpellOnTarget(targetUnit: Unit): boolean {
        const caster = this.currentActiveUnit;
        const spell = this.currentActiveSpell;
        if (!spell || !caster) {
            return false;
        }

        // Castling (POSITION_CHANGE) swaps caster↔target. The engine teleports both instantly, so
        // capture their pre-swap positions and animate them arcing to their new cells afterwards.
        const isSwap = spell.getPowerType() === SpellPowerType.POSITION_CHANGE;
        const oldCasterPos = isSwap ? { ...caster.getPosition() } : undefined;
        const oldTargetPos = isSwap ? { ...targetUnit.getPosition() } : undefined;

        const action: GameAction = {
            type: "cast_spell",
            casterId: caster.getId(),
            spellName: spell.getName(),
            targetId: targetUnit.getId(),
            targetCell: targetUnit.getBaseCell(),
        };
        if (this.shouldDeferActionToAuthoritativeReplay(action)) {
            return this.submitActionForAuthoritativeReplay(action);
        }
        const unitSnapshot = this.snapshotRenderableUnits();
        const result = this.createActionEngine().apply(action);
        if (!result.completed) {
            return false;
        }

        if (isSwap && oldCasterPos && oldTargetPos) {
            // Clear armed-spell state now; the turn ends when the swap animation finishes.
            this.currentActiveSpell = undefined;
            this.currentEnemiesCellsWithinMovementRange = undefined;
            this.hoverManager.clearHoverSilhouette();
            this.hoverManager.clearAttackVisuals();
            this.hoverManager.hoverAttackFromCell = undefined;
            this.sc_moveBlocked = true;
            this.sc_visibleStateUpdateNeeded = true;
            this.unitsHolder.refreshStackPowerForAllUnits();
            this.moveAnimManager.startSwapAnimation(
                caster,
                oldCasterPos,
                caster.getPosition(),
                targetUnit as RenderableUnit,
                oldTargetPos,
                targetUnit.getPosition(),
                () => {
                    this.sc_moveBlocked = false;
                    this.applyTurnEngineEvents(result.events, unitSnapshot);
                },
            );
            return true;
        }

        this.cleanupAfterSpell(result.events, unitSnapshot);
        return true;
    }
    /**
     * Shared post-cast cleanup: remove units killed by the spell, refresh stacks, clear the
     * armed spell + hover visuals, and end the caster's turn.
     */
    private cleanupAfterSpell(
        commonEvents?: GameEvent[],
        unitSnapshot: ReadonlyMap<string, RenderableUnit> = this.snapshotRenderableUnits(),
    ): void {
        const unitsDied: RenderableUnit[] = [];
        for (const u of this.unitsHolder.getAllUnits().values()) {
            if (u.isDead()) {
                unitsDied.push(u as RenderableUnit);
            }
        }
        if (unitsDied.length > 0) {
            this.destroySpecificUnits(unitsDied, true, true);
        }
        this.unitsHolder.refreshStackPowerForAllUnits();

        this.currentActiveSpell = undefined;
        this.currentEnemiesCellsWithinMovementRange = undefined;
        this.hoverManager.clearHoverSilhouette();
        this.hoverManager.clearAttackVisuals();
        this.hoverManager.hoverAttackFromCell = undefined;
        this.sc_moveBlocked = false;
        this.sc_visibleStateUpdateNeeded = true;
        if (commonEvents) {
            this.applyTurnEngineEvents(commonEvents, unitSnapshot);
        } else {
            this.finishTurn();
        }
    }
    /**
     * Apply a mass-cast spell (ALL_ALLIES / ALL_ENEMIES / ALL_FLYING) or a summon spell
     * (RANDOM_CLOSE_TO_CASTER) immediately on selection. Ports the legacy dispatch
     * (test_heroes.ts:3771-4007). Ends the turn if anything was applied.
     */
    private castMassOrSummonSpell(spell: PixiRenderableSpell, caster: RenderableUnit): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const team = caster.getTeam();

        // 1. Summon path (e.g. RANDOM_CLOSE_TO_CASTER summon spells).
        const randomCell = GridMath.getRandomGridCellAroundPosition(gs, this.gridMatrix, team, caster.getPosition());
        const amountToSummon = Math.floor(caster.getAmountAlive() * spell.getPower());
        if (amountToSummon > 0 && SpellHelper.canCastSummon(spell, this.gridMatrix, randomCell)) {
            const action: GameAction = {
                type: "cast_spell",
                casterId: caster.getId(),
                spellName: spell.getName(),
                targetCell: randomCell,
            };
            if (this.shouldDeferActionToAuthoritativeReplay(action)) {
                this.submitActionForAuthoritativeReplay(action);
                return;
            }
            const unitSnapshot = this.snapshotRenderableUnits();
            const result = this.createActionEngine().apply(action);
            if (result.completed) {
                this.cleanupAfterSpell(result.events, unitSnapshot);
            } else {
                this.sc_sceneLog.updateLog(result.message ?? `Cannot cast ${spell.getName()}`);
                this.currentActiveSpell = undefined;
            }
            return;
        }

        // 2. Mass-cast path (buff allies / debuff enemies / buff flyers).
        if (
            spell.getSpellTargetType() === SpellTargetType.ALL_FLYING ||
            spell.getSpellTargetType() === SpellTargetType.ALL_ALLIES ||
            spell.getSpellTargetType() === SpellTargetType.ALL_ENEMIES
        ) {
            const action: GameAction = {
                type: "cast_spell",
                casterId: caster.getId(),
                spellName: spell.getName(),
            };
            if (this.shouldDeferActionToAuthoritativeReplay(action)) {
                this.submitActionForAuthoritativeReplay(action);
                return;
            }
            const unitSnapshot = this.snapshotRenderableUnits();
            const result = this.createActionEngine().apply(action);
            if (result.completed) {
                this.cleanupAfterSpell(result.events, unitSnapshot);
            } else {
                this.sc_sceneLog.updateLog(`Cannot cast ${spell.getName()}`);
                this.currentActiveSpell = undefined;
            }
            return;
        }

        // 3. Nothing applicable — cancel quietly.
        this.sc_sceneLog.updateLog(`Cannot cast ${spell.getName()}`);
        this.currentActiveSpell = undefined;
    }
    /**
     * Attempt to attack the destructible center obstacle (BLOCK_CENTER maps). Ranged units land
     * automatically; melee units move to a cell adjacent to the obstacle, then land the hit. When
     * the obstacle's hits run out, the center is cleared and the map reverts to NORMAL. Ports the
     * obstacle branch of legacy landAttack (test_heroes.ts:3445-3485).
     * Returns true if an obstacle hit was landed (turn consumed).
     */
    private attemptObstacleAttack(worldPos: HoCMath.XY): boolean {
        const unit = this.currentActiveUnit;
        if (!unit) {
            return false;
        }
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.getGridType() !== GridVals.BLOCK_CENTER || fightProps.getObstacleHitsLeft() <= 0) {
            return false;
        }

        const centerCells = this.grid.getCenterCells();
        const mountainTarget = this.getMountainEdgeTarget(worldPos, centerCells);
        if (!mountainTarget) {
            return false;
        }

        const canLandRangeHit =
            unit.getAttackTypeSelection() === AttackVals.RANGE &&
            this.attackHandler.canLandRangeAttack(unit, this.grid.getEnemyAggrMatrixByUnitId(unit.getId()));

        // Melee attackers need a cell adjacent to the obstacle to strike from; ranged units auto-land.
        let attackFromCell = canLandRangeHit ? undefined : this.hoverManager.hoverAttackFromCell;
        if (attackFromCell && !this.canMeleeAttackObstacleFromCell(attackFromCell, centerCells, unit)) {
            attackFromCell = undefined;
        }
        if (!canLandRangeHit && unit.getAttackTypeSelection() === AttackVals.MAGIC) {
            return false;
        }
        if (!canLandRangeHit && !attackFromCell) {
            attackFromCell = this.findObstacleAttackFromCell(centerCells, mountainTarget.visualPosition);
            if (!attackFromCell) {
                return false;
            }
        }

        return this.executeObstacleAttackSequence(unit, mountainTarget.actionPosition, attackFromCell);
    }
    private executeObstacleAttackSequence(
        unit: RenderableUnit,
        targetPosition: HoCMath.XY,
        attackFromCell?: HoCMath.XY,
    ): boolean {
        if (!attackFromCell) {
            return this.applyObstacleAttackAction(unit, targetPosition);
        }

        const attackFromPos = this.getObstacleAttackFromPosition(unit, attackFromCell);
        if (!attackFromPos) {
            return false;
        }

        const currentPos = unit.getPosition();
        const alreadyAtAttackCell =
            Math.abs(currentPos.x - attackFromPos.x) < 0.1 && Math.abs(currentPos.y - attackFromPos.y) < 0.1;
        if (alreadyAtAttackCell) {
            return this.applyObstacleAttackAction(unit, targetPosition, attackFromCell);
        }

        const routes = this.currentActiveKnownPaths?.get((attackFromCell.x << 4) | attackFromCell.y);
        const route = routes?.[0]?.route;
        if (!route?.length) {
            return false;
        }

        const footprint = unit.isSmallSize() ? undefined : this.getLargeUnitObstacleFootprint(attackFromCell);
        if (!unit.isSmallSize() && !footprint) {
            return false;
        }

        this.executeMoveSequence(unit, route, footprint, () => {
            this.applyObstacleAttackAction(unit, targetPosition, attackFromCell);
        });
        return true;
    }
    private applyObstacleAttackAction(
        unit: RenderableUnit,
        worldPos: HoCMath.XY,
        attackFromCell?: HoCMath.XY,
        replayAction?: Extract<GameAction, { type: "obstacle_attack" }>,
    ): boolean {
        const routeMetadata = attackFromCell
            ? this.currentActiveKnownPaths?.get((attackFromCell.x << 4) | attackFromCell.y)?.[0]
            : undefined;
        const action: GameAction = replayAction
            ? cloneReplayData(replayAction)
            : {
                  type: "obstacle_attack",
                  attackerId: unit.getId(),
                  targetPosition: worldPos,
                  attackFrom: attackFromCell,
                  path: routeMetadata?.route,
                  hasLavaCell: routeMetadata?.hasLavaCell,
                  hasWaterCell: routeMetadata?.hasWaterCell,
              };
        const unitSnapshot = this.snapshotRenderableUnits();
        const result = this.createActionEngine().apply(action);
        if (!result.completed) {
            return false;
        }

        this.unitsHolder.refreshStackPowerForAllUnits();
        this.hoverManager.clearHoverSilhouette();
        this.hoverManager.clearAttackVisuals();
        this.hoverManager.hoverAttackFromCell = undefined;
        this.sc_moveBlocked = false;
        this.sc_visibleStateUpdateNeeded = true;
        this.refreshUnits();
        this.applyTurnEngineEvents(result.events, unitSnapshot);
        return true;
    }
    /** Find a reachable cell adjacent to the center obstacle for a melee strike, if any. */
    private findObstacleAttackFromCell(
        centerCells: HoCMath.XY[],
        preferredWorldPos: HoCMath.XY | undefined = this.sc_mouseWorld,
    ): HoCMath.XY | undefined {
        const unit = this.currentActiveUnit;
        if (!unit) {
            return undefined;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const candidates: HoCMath.XY[] = [];
        const seen = new Set<number>();
        const currentCell = GridMath.getCellForPosition(gs, unit.getPosition());
        const addCandidate = (cell?: HoCMath.XY): void => {
            if (!cell) {
                return;
            }
            const key = (cell.x << 4) | cell.y;
            if (seen.has(key) || !this.canMeleeAttackObstacleFromCell(cell, centerCells, unit)) {
                return;
            }
            seen.add(key);
            candidates.push(cell);
        };

        // Already adjacent → strike without moving.
        addCandidate(currentCell);

        // Prefer route-backed cells. For large units, movement paths are keyed by the anchor cell,
        // while `currentActivePath` also contains the other cells in the 2x2 footprint.
        if (this.currentActiveKnownPaths) {
            for (const [key, routes] of this.currentActiveKnownPaths) {
                if (!routes?.length) {
                    continue;
                }
                const routeCell = routes[0].cell ?? { x: key >> 4, y: key & 0xf };
                addCandidate(routeCell);
            }
        }

        // Fallback for path sets that carry only cells. Non-stationary cells still need route
        // metadata, otherwise the shared obstacle handler rejects the melee attack.
        if (this.currentActivePath) {
            for (const cell of this.currentActivePath) {
                const stationary = currentCell !== undefined && currentCell.x === cell.x && currentCell.y === cell.y;
                if (stationary || this.currentActiveKnownPaths?.get((cell.x << 4) | cell.y)?.length) {
                    addCandidate(cell);
                }
            }
        }

        if (!candidates.length) {
            return undefined;
        }
        if (!preferredWorldPos) {
            return candidates[0];
        }

        let closest = candidates[0];
        let closestDistance = Number.MAX_SAFE_INTEGER;
        for (const candidate of candidates) {
            const pos = this.getObstacleAttackFromPosition(unit, candidate);
            if (!pos) {
                continue;
            }
            const distance = HoCMath.getDistance(preferredWorldPos, pos);
            if (distance < closestDistance) {
                closestDistance = distance;
                closest = candidate;
            }
        }
        return closest;
    }
    private canMeleeAttackObstacleFromCell(
        attackFromCell: HoCMath.XY,
        centerCells: HoCMath.XY[],
        unit: RenderableUnit,
    ): boolean {
        if (unit.hasAbilityActive("No Melee")) {
            return false;
        }
        const gridSize = this.sc_sceneSettings.getGridSettings().getGridSize();
        const innerCenterHashes = new Set<number>([
            ((gridSize / 2) << 4) | (gridSize / 2),
            ((gridSize / 2 - 1) << 4) | (gridSize / 2 - 1),
            ((gridSize / 2) << 4) | (gridSize / 2 - 1),
            ((gridSize / 2 - 1) << 4) | (gridSize / 2),
        ]);
        const attackFromCells = [attackFromCell];
        if (!unit.isSmallSize()) {
            attackFromCells.push(
                { x: attackFromCell.x, y: attackFromCell.y - 1 },
                { x: attackFromCell.x - 1, y: attackFromCell.y },
                { x: attackFromCell.x - 1, y: attackFromCell.y - 1 },
            );
        }

        const attackableCenterCells = centerCells.filter((cell) => !innerCenterHashes.has((cell.x << 4) | cell.y));
        for (const cell of attackFromCells) {
            if (innerCenterHashes.has((cell.x << 4) | cell.y)) {
                break;
            }
            if (
                attackableCenterCells.some(
                    (center) => Math.abs(cell.x - center.x) <= 1 && Math.abs(cell.y - center.y) <= 1,
                )
            ) {
                return true;
            }
        }
        return false;
    }
    private getObstacleAttackFromPosition(unit: RenderableUnit, attackFromCell: HoCMath.XY): HoCMath.XY | undefined {
        const gs = this.sc_sceneSettings.getGridSettings();
        const position = GridMath.getPositionForCell(attackFromCell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        if (!position) {
            return undefined;
        }
        if (!unit.isSmallSize()) {
            position.x -= gs.getHalfStep();
            position.y -= gs.getHalfStep();
        }
        return position;
    }
    private getLargeUnitObstacleFootprint(attackFromCell: HoCMath.XY): HoCMath.XY[] | undefined {
        const gs = this.sc_sceneSettings.getGridSettings();
        const position = GridMath.getPositionForCell(attackFromCell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        if (!position) {
            return undefined;
        }
        return GridMath.getCellsAroundPosition(gs, {
            x: position.x - gs.getHalfStep(),
            y: position.y - gs.getHalfStep(),
        });
    }
    private getMountainEdgeTarget(worldPos: HoCMath.XY, centerCells: HoCMath.XY[]): MountainEdgeTarget | undefined {
        const gs = this.sc_sceneSettings.getGridSettings();
        const hoveredCell = GridMath.getCellForPosition(gs, worldPos);
        if (!hoveredCell || !centerCells.some((c) => c.x === hoveredCell.x && c.y === hoveredCell.y)) {
            return undefined;
        }

        const minCellX = Math.min(...centerCells.map((c) => c.x));
        const maxCellX = Math.max(...centerCells.map((c) => c.x));
        const minCellY = Math.min(...centerCells.map((c) => c.y));
        const maxCellY = Math.max(...centerCells.map((c) => c.y));
        const halfStep = gs.getHalfStep();
        const insideOffset = Math.min(halfStep * 0.25, Math.max(1, gs.getStep() * 0.01));
        const candidates: MountainEdgeTarget[] = [];

        const addCandidate = (cell: HoCMath.XY, visualPosition: HoCMath.XY, actionPosition: HoCMath.XY): void => {
            candidates.push({
                cell: { ...cell },
                visualPosition: { ...visualPosition },
                actionPosition: { ...actionPosition },
            });
        };

        for (let x = minCellX; x <= maxCellX; x++) {
            const topCell = { x, y: maxCellY };
            const topCenter = GridMath.getPositionForCell(topCell, gs.getMinX(), gs.getStep(), halfStep);
            addCandidate(
                topCell,
                { x: topCenter.x, y: topCenter.y + halfStep },
                { x: topCenter.x, y: topCenter.y + halfStep - insideOffset },
            );

            const bottomCell = { x, y: minCellY };
            const bottomCenter = GridMath.getPositionForCell(bottomCell, gs.getMinX(), gs.getStep(), halfStep);
            addCandidate(
                bottomCell,
                { x: bottomCenter.x, y: bottomCenter.y - halfStep },
                { x: bottomCenter.x, y: bottomCenter.y - halfStep + insideOffset },
            );
        }

        for (let y = minCellY; y <= maxCellY; y++) {
            const leftCell = { x: minCellX, y };
            const leftCenter = GridMath.getPositionForCell(leftCell, gs.getMinX(), gs.getStep(), halfStep);
            addCandidate(
                leftCell,
                { x: leftCenter.x - halfStep, y: leftCenter.y },
                { x: leftCenter.x - halfStep + insideOffset, y: leftCenter.y },
            );

            const rightCell = { x: maxCellX, y };
            const rightCenter = GridMath.getPositionForCell(rightCell, gs.getMinX(), gs.getStep(), halfStep);
            addCandidate(
                rightCell,
                { x: rightCenter.x + halfStep, y: rightCenter.y },
                { x: rightCenter.x + halfStep - insideOffset, y: rightCenter.y },
            );
        }

        const hoveredSideCandidates = candidates.filter(
            (candidate) => candidate.cell.x === hoveredCell.x && candidate.cell.y === hoveredCell.y,
        );
        const eligibleCandidates = hoveredSideCandidates.length ? hoveredSideCandidates : candidates;
        let closest = eligibleCandidates[0];
        let closestDistance = Number.MAX_SAFE_INTEGER;
        for (const candidate of eligibleCandidates) {
            const distance = HoCMath.getDistance(worldPos, candidate.visualPosition);
            if (distance < closestDistance) {
                closestDistance = distance;
                closest = candidate;
            }
        }
        return {
            cell: { ...closest.cell },
            visualPosition: { ...closest.visualPosition },
            actionPosition: { ...closest.actionPosition },
        };
    }
    /**
     * When the active unit hovers the destructible center obstacle, preview the attack:
     * a ranged unit shows it can shoot in place; a melee unit projects to the reachable cell
     * closest to the cursor (move silhouette). Only shows when the unit can actually attack the
     * hovered mountain cell, and clears the "Hit the mountain" info as soon as it cannot. Returns
     * true when the obstacle is being targeted, so hover() skips the normal unit/cell hover logic.
     */
    private updateObstacleHover(): boolean {
        // Clear any stale "Hit the mountain" state and report "not targeting the mountain".
        const notHovering = (): boolean => {
            if (this.sc_hoverInfoArr[0] === "Hit the mountain") {
                this.sc_hoverInfoArr = [];
                this.sc_hoverTextUpdateNeeded = true;
                this.hoverManager.hoverAttackFromCell = undefined;
                this.hoverManager.clearHoverSilhouette();
                this.hoverManager.clearAttackVisuals();
            }
            return false;
        };
        const showHit = (): void => {
            if (this.sc_hoverInfoArr[0] !== "Hit the mountain") {
                this.sc_hoverInfoArr = ["Hit the mountain"];
                this.sc_hoverTextUpdateNeeded = true;
            }
        };

        const unit = this.currentActiveUnit;
        if (!unit || !this.sc_mouseWorld) {
            return notHovering();
        }
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.getGridType() !== GridVals.BLOCK_CENTER || fightProps.getObstacleHitsLeft() <= 0) {
            return notHovering();
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const centerCells = this.grid.getCenterCells();
        const mountainTarget = this.getMountainEdgeTarget(this.sc_mouseWorld, centerCells);
        if (!mountainTarget) {
            return notHovering();
        }
        this.hoverManager.clearAttackVisuals();

        const canRangeObstacle = this.attackHandler.canLandRangeAttack(
            unit,
            this.grid.getEnemyAggrMatrixByUnitId(unit.getId()),
        );

        // Ranged attackers can shoot the mountain in place (unless pinned into melee). Show
        // "Hit the mountain" plus a trajectory arrow from the unit to the selected visible edge. Uses
        // getAttackTypeSelection() to match the click path (handleObstacleAttack), so units like the
        // Tsar Cannon (RANGE selection, No Melee) preview correctly.
        if (unit.getAttackTypeSelection() === AttackVals.RANGE && canRangeObstacle) {
            this.hoverManager.hoverAttackFromCell = undefined;
            this.hoverManager.drawAttackArrow(unit.getVisualCenter(gs), mountainTarget.visualPosition);
            showHit();
            return true;
        }

        // Melee: only if the unit can reach a legal cell adjacent to the mountain. Pick the
        // attack-from cell closest to the cursor so the silhouette tracks the hovered side.
        if (unit.getAttackTypeSelection() === AttackVals.MAGIC || unit.hasAbilityActive("No Melee")) {
            return notHovering();
        }
        const attackFromCell = this.findObstacleAttackFromCell(centerCells, mountainTarget.visualPosition);
        if (!attackFromCell) {
            return notHovering();
        }
        this.hoverManager.hoverAttackFromCell = attackFromCell;
        const attackFromPos = this.getObstacleAttackFromPosition(unit, attackFromCell);
        if (attackFromPos) {
            this.hoverManager.updateHoverSilhouette(attackFromPos);
            this.hoverManager.drawAttackArrow(attackFromPos, mountainTarget.visualPosition);
        }
        showHit();
        return true;
    }
    /**
     * Area Throw (e.g. Gargantuan): when the active ranged unit hovers any in-grid cell that
     * isn't an enemy unit, preview the 3x3 splash AREA it will hit. Returns true while previewing
     * so hover() skips the normal unit/cell hover logic (parity with legacy drawAOECells).
     */
    private updateAreaThrowHover(): boolean {
        this.hoverManager.clearAOEArea();
        this.hoverManager.clearAttackVisuals();
        const clearInfo = (): boolean => {
            if (this.sc_hoverInfoArr[0] === "Area attack") {
                this.sc_hoverInfoArr = [];
                this.sc_hoverTextUpdateNeeded = true;
            }
            return false;
        };

        const cells = this.getAreaThrowCells(this.sc_mouseWorld);
        if (!cells) {
            return clearInfo();
        }

        this.hoverManager.drawAOEArea(cells);
        // Outline every unit caught in the splash in red — same highlight as a single target.
        for (const affectedGroup of AllAbilities.evaluateAffectedUnits(cells, this.unitsHolder, this.grid) ?? []) {
            for (const affectedUnit of affectedGroup) {
                this.hoverManager.addTargetHighlight(affectedUnit);
            }
        }
        if (this.sc_hoverInfoArr[0] !== "Area attack") {
            this.sc_hoverInfoArr = ["Area attack"];
            this.sc_hoverTextUpdateNeeded = true;
        }
        return true;
    }
    /**
     * For mass / AOE ranged attackers (Cyclops = Large Caliber, Tsar Cannon = Through Shot,
     * Gargantuan = Area Throw), outline EVERY unit the shot will hit — not just the one under the
     * cursor — reusing the red target highlight. Returns true when it applied an AOE highlight, so
     * the caller skips the single-target highlight.
     */
    private highlightRangeAttackUnits(targetUnit: Unit): boolean {
        const attacker = this.currentActiveUnit;
        if (!attacker) {
            return false;
        }
        const largeCaliber = attacker.hasAbilityActive("Large Caliber");
        const areaThrow = attacker.hasAbilityActive("Area Throw");
        const throughShot = attacker.hasAbilityActive("Through Shot");
        if (!largeCaliber && !areaThrow && !throughShot) {
            return false;
        }
        const evalResult = this.attackHandler.evaluateRangeAttack(
            this.unitsHolder.getAllUnits(),
            attacker,
            attacker.getPosition(),
            targetUnit.getPosition(),
            throughShot, // isThroughShot
            false, // isSelection
            largeCaliber || areaThrow, // splash (Large Caliber / Area Throw)
        );
        const seen = new Set<string>();
        for (const affectedGroup of evalResult.affectedUnits) {
            for (const affectedUnit of affectedGroup) {
                if (seen.has(affectedUnit.getId())) {
                    continue;
                }
                seen.add(affectedUnit.getId());
                this.hoverManager.addTargetHighlight(affectedUnit);
            }
        }
        // Always include the unit directly under the cursor.
        if (!seen.has(targetUnit.getId())) {
            this.hoverManager.addTargetHighlight(targetUnit);
            seen.add(targetUnit.getId());
        }
        return seen.size > 0;
    }
    /**
     * The 3x3 splash cells for an Area Throw aimed at worldPos, or undefined when the active unit
     * can't area-throw there (not an Area Throw range unit, off-grid, or aiming directly at an
     * enemy unit — that goes through the normal single-target path).
     */
    private getAreaThrowCells(worldPos?: HoCMath.XY): HoCMath.XY[] | undefined {
        const unit = this.currentActiveUnit;
        if (!unit || !worldPos || !unit.hasAbilityActive("Area Throw")) {
            return undefined;
        }
        // Only while the unit is in RANGE mode and has shots. Switching to melee drops the area
        // preview so the normal move/melee hover takes over (parity with legacy).
        if (unit.getAttackTypeSelection() !== AttackVals.RANGE || unit.getRangeShots() <= 0) {
            return undefined;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const mouseCell = GridMath.getCellForPosition(gs, worldPos);
        if (!mouseCell || !GridMath.isCellWithinGrid(gs, mouseCell)) {
            return undefined;
        }
        const occupantId = this.grid.getOccupantUnitId(mouseCell);
        if (occupantId && occupantId !== "L" && occupantId !== "W") {
            return undefined; // aiming at an enemy unit → single-target preview handles it
        }
        return [...GridMath.getCellsAroundCell(gs, mouseCell), mouseCell];
    }
    /** Execute an Area Throw at the clicked cell. Returns true if it handled the click. */
    private attemptAreaThrowAttack(worldPos: HoCMath.XY): boolean {
        const unit = this.currentActiveUnit;
        const cells = this.getAreaThrowCells(worldPos);
        if (!unit || !cells) {
            return false;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const mouseCell = GridMath.getCellForPosition(gs, worldPos);
        if (!mouseCell) {
            return false;
        }
        const cellPosition = GridMath.getPositionForCell(mouseCell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        if (!cellPosition) {
            return false;
        }
        void this.performAreaThrow(unit, mouseCell, cellPosition);
        return true;
    }
    private async performAreaThrow(
        unit: RenderableUnit,
        mouseCell: HoCMath.XY,
        cellPosition: HoCMath.XY,
    ): Promise<void> {
        // Snapshot health so the floating damage numbers can be derived from the diff.
        const preState = new Map<string, { hp: number; amount: number }>();
        for (const u of this.unitsHolder.getAllUnits().values()) {
            preState.set(u.getId(), { hp: u.getCumulativeHp(), amount: u.getAmountAlive() });
        }

        const action: GameAction = {
            type: "area_throw_attack",
            attackerId: unit.getId(),
            targetCell: mouseCell,
        };

        const muzzle = unit.getVisualCenter(this.sc_sceneSettings.getGridSettings());
        const bigProjectile = BIG_PROJECTILE_UNITS.has(unit.getName().toLowerCase());
        await this.rangedProjectiles.fire({ from: muzzle, to: cellPosition, big: bigProjectile });

        const unitSnapshot = this.snapshotRenderableUnits();
        const result = this.createActionEngine().apply(action);
        if (!result.completed) {
            return;
        }

        this.combatVisuals.showDamageVisualsFromDiff(preState, mouseCell);
        this.sc_damageStatsUpdateNeeded = true;
        this.unitsHolder.refreshStackPowerForAllUnits();
        this.hoverManager.clearAOEArea();
        this.hoverManager.clearAttackVisuals();
        this.hoverManager.clearHoverSilhouette();
        this.cleanupDeadUnits();
        this.refreshUnits();
        this.applyTurnEngineEvents(result.events, unitSnapshot);
    }
    private async executeAttackSequence(
        attacker: RenderableUnit,
        target: Unit,
        attackFrom: HoCMath.XY,
        replayAction?: Extract<GameAction, { type: "melee_attack" }> | Extract<GameAction, { type: "range_attack" }>,
    ): Promise<boolean> {
        this.sc_moveBlocked = true;

        // Create a local damage object for animation
        const damageForAnimation: IVisibleDamage = {
            render: false,
            amount: 0,
            unitPosition: { x: 0, y: 0 },
            unitIsSmall: true,
            hits: [],
        };

        // Pre-calculate primary attack direction (Target - Attacker) for uniform visuals
        const gs = this.sc_sceneSettings.getGridSettings();
        const tVis = target instanceof RenderableUnit ? target.getVisualCenter(gs) : target.getPosition();
        // Use 'attackFrom' cell to ensure direction is accurate even if unit moves during sequence
        const attPos = GridMath.getPositionForCell(attackFrom, gs.getMinX(), gs.getStep(), gs.getHalfStep());
        const primaryAttackDir = attPos ? { x: tVis.x - attPos.x, y: tVis.y - attPos.y } : { x: 0, y: -1 };

        const attackerBefore = { amount: attacker.getAmountAlive(), health: attacker.getHp() };

        // 1. Target Damage

        // Capture Target Start Amount specifically for death calc
        const targetBeforeAmount = target.getAmountAlive();

        // SNAPSHOT for AOE / Secondary Damage
        // We capture state of ALL units to detect side-effects/AOE
        const unitSnapshots = new Map<string, { amount: number; hp: number; maxHp: number; pos: HoCMath.XY }>();
        for (const u of this.unitsHolder.getAllUnits().values()) {
            unitSnapshots.set(u.getId(), {
                amount: u.getAmountAlive(),
                hp: u.getHp(),
                maxHp: u.getMaxHp(),
                pos: { ...u.getPosition() }, // Clone position
            });
        }

        // Capture the scene-log position so we can read the engine's *isolated* Fire Shield amounts
        // ("X received (N) from Fire Shield") afterwards. The HP-snapshot deltas below lump the burn
        // in with the retaliation on the same unit, so we split them back out into a separate number.
        const logSizeBeforeAttack = this.sc_sceneLog.getLogSize();
        const actionEventSnapshot = this.snapshotRenderableUnits();
        let attackActionEvents: GameEvent[] | undefined;
        let attackTurnEventsApplied = false;
        let attackCleanupWatchdog: ReturnType<typeof setTimeout> | undefined;
        const clearAttackCleanupWatchdog = (): void => {
            if (attackCleanupWatchdog !== undefined) {
                clearTimeout(attackCleanupWatchdog);
                attackCleanupWatchdog = undefined;
            }
        };
        const applyAttackTurnEventsOnce = (): void => {
            if (!attackActionEvents || attackTurnEventsApplied) {
                return;
            }
            attackTurnEventsApplied = true;
            this.applyTurnEngineEvents(attackActionEvents, actionEventSnapshot);
        };
        const scheduleAttackCleanupWatchdog = (): void => {
            clearAttackCleanupWatchdog();
            attackCleanupWatchdog = setTimeout(() => {
                if (
                    attackTurnEventsApplied ||
                    !attackActionEvents ||
                    !this.currentActiveUnit ||
                    this.currentActiveUnit.getId() !== attacker.getId()
                ) {
                    return;
                }

                const fightProps = FightStateManager.getInstance().getFightProperties();
                if (!fightProps.hasAlreadyMadeTurn(attacker.getId())) {
                    return;
                }

                console.warn("Recovering delayed attack cleanup for completed turn", {
                    attackerId: attacker.getId(),
                    attackerName: attacker.getName(),
                });
                this.hoverManager.clearHoverSilhouette();
                this.hoverManager.clearAttackVisuals();
                this.hoverManager.hoverAttackFromCell = undefined;
                this.sc_moveBlocked = false;
                this.sc_visibleStateUpdateNeeded = true;
                applyAttackTurnEventsOnce();
            }, 3500);
        };
        const applyAttackActionResult = (result: ReturnType<GameActionEngine["apply"]>): boolean => {
            if (!result.completed) {
                this.sc_moveBlocked = false;
                return false;
            }
            const attackEvent = result.events.find((event) => event.type === "unit_attacked");
            if (attackEvent?.type !== "unit_attacked") {
                this.sc_moveBlocked = false;
                return false;
            }

            damageForAnimation.amount = attackEvent.damage.amount;
            damageForAnimation.render = attackEvent.damage.render;
            damageForAnimation.unitPosition = { ...attackEvent.damage.unitPosition };
            damageForAnimation.unitIsSmall = attackEvent.damage.unitIsSmall;
            damageForAnimation.unitId = attackEvent.damage.unitId;
            damageForAnimation.hits = attackEvent.damage.hits?.map((hit) => ({ ...hit }));
            attackActionEvents = result.events;
            scheduleAttackCleanupWatchdog();
            this.sc_damageStatsUpdateNeeded = true;
            return true;
        };

        // Check for Range Attack
        // If attackFrom is current position AND target is far away (or strictly defined as range target), use Range logic.
        // We can check if it is in canAttackByRangeTargets if available, or deduce from distance.
        const dist = HoCMath.getDistance(attackFrom, target.getPosition());
        const isRange =
            replayAction?.type === "range_attack" ||
            (attacker.getAttackTypeSelection() === AttackVals.RANGE &&
                (this.canAttackByRangeTargets?.has(target.getId()) ||
                    (dist > GridConstants.STEP * 1.5 &&
                        attackFrom.x === attacker.getPosition().x &&
                        attackFrom.y === attacker.getPosition().y)));

        if (isRange) {
            const action: GameAction =
                replayAction?.type === "range_attack"
                    ? cloneReplayData(replayAction)
                    : {
                          type: "range_attack",
                          attackerId: attacker.getId(),
                          targetId: target.getId(),
                      };
            if (this.shouldDeferActionToAuthoritativeReplay(action)) {
                return this.submitActionForAuthoritativeReplay(action);
            }

            // Fire the projectile BEFORE applying damage so the stack-count drop, damage
            // number and death skull all land in sync with the projectile's arrival.
            const muzzle = attacker.getVisualCenter(gs);
            const bigProjectile = BIG_PROJECTILE_UNITS.has(attacker.getName().toLowerCase());
            await this.rangedProjectiles.fire({ from: muzzle, to: tVis, big: bigProjectile });

            if (!applyAttackActionResult(this.createActionEngine().apply(action))) {
                return false;
            }

            // Double Shot: a second projectile timed to land as the staggered second damage
            // number appears (~240ms later). Gated on the ability so Through Shot (which also
            // yields multiple hits) doesn't spawn extra projectiles at the primary target.
            if (attacker.getAbility("Double Shot") && damageForAnimation.hits && damageForAnimation.hits.length > 1) {
                this.rangedProjectiles.fire({ from: muzzle, to: tVis, big: bigProjectile });
            }
        } else {
            const routeMetadata = this.currentActiveKnownPaths?.get((attackFrom.x << 4) | attackFrom.y)?.[0];
            const action: GameAction =
                replayAction?.type === "melee_attack"
                    ? cloneReplayData(replayAction)
                    : {
                          type: "melee_attack",
                          attackerId: attacker.getId(),
                          targetId: target.getId(),
                          attackFrom,
                          path: routeMetadata?.route,
                          hasLavaCell: routeMetadata?.hasLavaCell,
                          hasWaterCell: routeMetadata?.hasWaterCell,
                      };
            if (this.shouldDeferActionToAuthoritativeReplay(action)) {
                return this.submitActionForAuthoritativeReplay(action);
            }
            if (!applyAttackActionResult(this.createActionEngine().apply(action))) {
                return false;
            }
        }

        // 1. Target Damage
        if (damageForAnimation.amount > 0) {
            const gs = this.sc_sceneSettings.getGridSettings();
            const aCenter = attacker.getVisualCenter(gs);

            const rTarget = target as RenderableUnit;
            const tVis =
                typeof rTarget.getVisualCenter === "function" ? rTarget.getVisualCenter(gs) : target.getPosition();

            // Calculate trajectory direction (Attacker -> Target)
            const dir = { x: tVis.x - aCenter.x, y: tVis.y - aCenter.y };
            const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);

            let spawnPos = { x: tVis.x, y: tVis.y };
            if (len > 0.001) {
                // Normalize
                const ndx = dir.x / len;
                const ndy = dir.y / len;

                // Push text out by radius + margin
                // Small unit radius ~0.5 cell, Large ~1.0 cell. Add extra margin.
                const targetRadius = target.isSmallSize() ? gs.getCellSize() * 0.5 : gs.getCellSize() * 1.0;
                const margin = gs.getCellSize() * 0.5;
                spawnPos.x += ndx * (targetRadius + margin);
                spawnPos.y += ndy * (targetRadius + margin);
            } else {
                // Fallback for overlapping? Just push up
                spawnPos.y += gs.getCellSize();
            }

            // Calculation of actual dead count (Stack Size Diff)
            const targetAfterAmount = target.getAmountAlive();
            const targetDiedCount = Math.max(0, targetBeforeAmount - targetAfterAmount);

            if (damageForAnimation.hits && damageForAnimation.hits.length > 0) {
                const totalHits = damageForAnimation.hits.length;
                damageForAnimation.hits.forEach((dmg, index) => {
                    // Capture spawnPos for the closure.
                    const pos = { ...spawnPos };

                    // Apply Spatial Offsets matching Melee/Ranged logic
                    // Strategy: First hit is "Deep" (+30), Second hit is "Further" (+70)
                    if (len > 0.001) {
                        // dir is already computed (tVis - aCenter)
                        const ndx = dir.x / len;
                        const ndy = dir.y / len;
                        let offset = 0;
                        if (totalHits === 1) {
                            offset = 20;
                        } else {
                            if (index === 0) {
                                offset = 75;
                            } else if (index === 1) {
                                offset = 20;
                            }
                        }
                        pos.x += ndx * offset;
                        pos.y += ndy * offset;
                    }

                    // Stagger multi-hit numbers slightly so they read as distinct hits
                    // (the floating-number system also stacks any that still overlap).
                    if (index === 0) {
                        this.combatVisuals.showFloatingDamage(pos, dmg.amount, dir, dmg.unitsDied);
                    } else {
                        setTimeout(() => {
                            this.combatVisuals.showFloatingDamage(pos, dmg.amount, dir, dmg.unitsDied);
                        }, index * 240);
                    }
                });
            } else {
                this.combatVisuals.showFloatingDamage(spawnPos, damageForAnimation.amount, dir, targetDiedCount);
            }
        }

        // Parse the engine's isolated Fire Shield burns from the new log lines, keyed by the burned
        // unit's name, so the snapshot deltas can be split into pure + Fire Shield numbers. Also
        // collect Petrifying Gaze kills ("N <name> killed by Petrifying Gaze") with their count, so
        // that hit can be styled differently (grey damage + a recoil jerk on the target) AND its
        // kill count shown is the gaze-only count, not the target's total deaths.
        const fireShieldByName = new Map<string, number>();
        const petrifyKillsByName = new Map<string, number>();
        for (const entry of this.sc_sceneLog.getEntriesSince(logSizeBeforeAttack)) {
            const fsMatch = entry.match(/^(.+?) received \((\d+)\) from Fire Shield/);
            if (fsMatch) {
                fireShieldByName.set(fsMatch[1], (fireShieldByName.get(fsMatch[1]) ?? 0) + parseInt(fsMatch[2], 10));
                continue;
            }
            const pgMatch = entry.match(/^(\d+) (.+?) killed by Petrifying Gaze$/);
            if (pgMatch) {
                const nm = pgMatch[2];
                petrifyKillsByName.set(nm, (petrifyKillsByName.get(nm) ?? 0) + parseInt(pgMatch[1], 10));
            }
        }

        // 2. Attacker Damage (Counter-Attack)
        const attackerAfter = { amount: attacker.getAmountAlive(), health: attacker.getHp() };

        const stackLost = Math.max(0, attackerBefore.amount - attackerAfter.amount);
        const hpLost = attackerBefore.health - attackerAfter.health;

        if (stackLost > 0 || hpLost > 0) {
            const maxHp = attacker.getMaxHp();
            const totalHpBefore = (attackerBefore.amount - 1) * maxHp + attackerBefore.health;
            const totalHpAfter = (attackerAfter.amount - 1) * maxHp + attackerAfter.health;
            const damageTaken = totalHpBefore - totalHpAfter;

            if (damageTaken > 0) {
                // Attacker damage floats away from target
                // const gs = this.sc_sceneSettings.getGridSettings(); // Hoisted

                const aVis = attacker.getVisualCenter(gs);

                // Target visual center
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const rTarget = target as any;
                const tVis =
                    typeof rTarget.getVisualCenter === "function" ? rTarget.getVisualCenter(gs) : target.getPosition();

                // Direction: Target -> Attacker
                const dir = { x: aVis.x - tVis.x, y: aVis.y - tVis.y };
                const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);

                let spawnPos = { x: aVis.x, y: aVis.y };
                if (len > 0.001) {
                    const ndx = dir.x / len;
                    const ndy = dir.y / len;

                    const attackerRadius = attacker.isSmallSize() ? gs.getCellSize() * 0.5 : gs.getCellSize() * 1.0;
                    const margin = gs.getCellSize() * 0.5;
                    spawnPos.x += ndx * (attackerRadius + margin);
                    spawnPos.y += ndy * (attackerRadius + margin);
                } else {
                    spawnPos.y += gs.getCellSize();
                }

                // Split the attacker's HP loss into the pure (retaliation) hit and the Fire Shield
                // burn, shown as two separate numbers (parity with the log). Fire Shield is amber and
                // staggered so it reads as its own distinct hit instead of a single summed number.
                const attackerFireShield = fireShieldByName.get(attacker.getName()) ?? 0;
                const pureDamage = Math.max(0, damageTaken - attackerFireShield);
                if (pureDamage > 0) {
                    this.combatVisuals.showFloatingDamage(spawnPos, pureDamage, dir, stackLost);
                }
                if (attackerFireShield > 0) {
                    const fsPos = { ...spawnPos };
                    setTimeout(() => {
                        this.combatVisuals.showFloatingDamage(
                            fsPos,
                            attackerFireShield,
                            dir,
                            pureDamage > 0 ? 0 : stackLost,
                            "#ffb13c",
                            "#7a3800",
                        );
                    }, 280);
                }
            }
        }

        // 3. Secondary / AOE Damage
        // Compare current state with snapshot
        // We iterate keys of snapshot to ensure we catch units that might have been deleted/died
        for (const uId of unitSnapshots.keys()) {
            const snap = unitSnapshots.get(uId);
            if (!snap) continue;

            const u = this.unitsHolder.getAllUnits().get(uId);
            // If unit is missing, it means it died and was removed. Treat as 0/0.
            const currentAmount = u ? u.getAmountAlive() : 0;
            const currentHp = u ? u.getHp() : 0;

            // Skip Attacker (Recall: Attacker damage is fully handled in Loop 2 via 'attackerAfter')
            if (uId === attacker.getId()) continue;

            // Calculate total HP lost
            // Use snapshot MaxHP to ensure we can calc damage even if unit died/vanished
            const unitMaxHp = snap.maxHp;
            const totalHpBefore = (snap.amount - 1) * unitMaxHp + snap.hp;
            const totalHpAfter = (currentAmount - 1) * unitMaxHp + currentHp;
            const diff = totalHpBefore - totalHpAfter;

            const diedCount = Math.max(0, snap.amount - currentAmount);

            // Deduct damage the attack's own hit numbers already showed (Section 1). Key off the
            // unit the handler ACTUALLY hit (damageForAnimation.unitId — e.g. the first enemy on a
            // ranged shot's line of fire), NOT the clicked `target`. When a different enemy
            // intercepts the ray (or the target is switched after a kill) those differ, and keying
            // on `target` left this at 0 — so Section 3 drew the full diff (standard + Petrifying
            // Gaze = the sum) instead of the isolated gaze.
            const primaryVictimId = damageForAnimation.unitId ?? target.getId();
            let alreadyShown = 0;
            if (uId === primaryVictimId) {
                if (damageForAnimation.hits && damageForAnimation.hits.length > 0) {
                    alreadyShown = damageForAnimation.hits.reduce((sum, h) => sum + h.amount, 0);
                } else {
                    alreadyShown = damageForAnimation.amount;
                }
            }

            const unaccountedDiff = diff - alreadyShown;

            // Show any damage beyond what the attack's own hit numbers already covered. For a normal
            // hit, diff === sum(hits), so unaccountedDiff is 0 and nothing extra draws. When it's
            // positive there's genuinely-hidden damage the hits didn't account for — most notably a
            // Fire Shield reflection burning the TARGET on its counter-attack. This used to be
            // suppressed for the primary target whenever hits existed, which is exactly why Fire
            // Shield damage never animated. (Over-counting would make this negative, which `> 0`
            // already ignores.)
            const shouldShowDamage = unaccountedDiff > 0;

            if (shouldShowDamage) {
                // Use primary 'primaryAttackDir' so it matches the attacker's main attack angle

                // Use snapshot position (pre-attack) to avoid artifacts if unit was knocked back/moved
                // Unit snapshot stores World Coordinates directly
                const visPos = snap.pos;

                // Important: Clone position to avoid mutating Unit's internal state
                // Match offset logic from 'executeAttackSequence' setup (lines 2464+)
                // "Push text out by radius + margin" to avoid overlapping the unit model
                const gs = this.sc_sceneSettings.getGridSettings();
                const targetRadius = gs.getCellSize() * 0.5; // Assume small for genericAOE (or check unit size if possible)
                const margin = gs.getCellSize() * 0.5;
                const baseOffset = targetRadius + margin;

                const spawnPos = { ...visPos };
                if (primaryAttackDir) {
                    const len = Math.sqrt(
                        primaryAttackDir.x * primaryAttackDir.x + primaryAttackDir.y * primaryAttackDir.y,
                    );
                    if (len > 0.001) {
                        const ndx = primaryAttackDir.x / len;
                        const ndy = primaryAttackDir.y / len;

                        // Apply Base Offset (Radius+Margin) + Animation Offset (20)
                        // This matches the Primary Target logic roughly (SpawnPos = Center + Radius + Margin).
                        // And then we add the "20" for the hit animation itself.
                        const totalOffset = baseOffset + 20;

                        spawnPos.x += ndx * totalOffset;
                        spawnPos.y += ndy * totalOffset;
                    }
                }

                // Extra damage on the PRIMARY target beyond the main hit — Medusa's Petrifying Gaze,
                // a Fire Shield burn, etc. Stagger it a beat after the standard attack number so it
                // reads as its own distinct hit instead of looking summed into the standard damage.
                // Style by source: Petrifying Gaze (when it killed) → light grey + yank the target
                // back along the attack direction; Fire Shield burn → amber; otherwise red.
                const uName = u?.getName();
                const isPetrified = !!uName && petrifyKillsByName.has(uName);
                // For Petrifying Gaze, show only the gaze's own kill count (parsed from the log),
                // not the target's total deaths (which include the main attack's kills).
                const extraDiedCount = isPetrified ? (petrifyKillsByName.get(uName!) ?? 0) : diedCount;
                const uFireShield = uName ? (fireShieldByName.get(uName) ?? 0) : 0;
                const isFsBurn = uFireShield > 0 && Math.abs(unaccountedDiff - uFireShield) <= 2;
                const fsFill = isPetrified ? "#d8d8d8" : isFsBurn ? "#ffb13c" : "#ff3333";
                const fsStroke = isPetrified ? "#5a5a5a" : isFsBurn ? "#7a3800" : "#4a0000";

                if (isPetrified && u instanceof RenderableUnit && primaryAttackDir) {
                    // "Yank" the target away from the attacker (recoil), then it springs back.
                    const len = Math.sqrt(
                        primaryAttackDir.x * primaryAttackDir.x + primaryAttackDir.y * primaryAttackDir.y,
                    );
                    if (len > 0.001) {
                        const mag = this.sc_sceneSettings.getGridSettings().getCellSize() * 0.35;
                        u.applyRecoil((primaryAttackDir.x / len) * mag, (primaryAttackDir.y / len) * mag);
                    }
                }

                if (uId === primaryVictimId) {
                    setTimeout(() => {
                        this.combatVisuals.showFloatingDamage(
                            spawnPos,
                            unaccountedDiff,
                            primaryAttackDir,
                            extraDiedCount,
                            fsFill,
                            fsStroke,
                        );
                    }, 300);
                } else {
                    this.combatVisuals.showFloatingDamage(
                        spawnPos,
                        unaccountedDiff,
                        primaryAttackDir,
                        extraDiedCount,
                        fsFill,
                        fsStroke,
                    );
                }
            }
        }

        const performCleanup = () => {
            clearAttackCleanupWatchdog();
            const unitsDied: RenderableUnit[] = [];
            for (const u of this.unitsHolder.getAllUnits().values()) {
                if (u.isDead()) {
                    unitsDied.push(u as RenderableUnit);
                }
            }

            if (unitsDied.length > 0) {
                this.destroySpecificUnits(unitsDied, true, true);
            }

            this.unitsHolder.refreshStackPowerForAllUnits();

            if (attackActionEvents) {
                applyAttackTurnEventsOnce();
            } else {
                this.finishTurn();
            }

            // Clear hover state
            this.hoverManager.clearHoverSilhouette();
            this.hoverManager.clearAttackVisuals();
            this.hoverManager.hoverAttackFromCell = undefined;

            this.sc_moveBlocked = false;
            this.sc_visibleStateUpdateNeeded = true;
        };

        // Calculate max delay from animations
        let maxDelay = 0;
        if (damageForAnimation.hits && damageForAnimation.hits.length > 1) {
            // Last hit is at (length - 1) * 1000 ms.
            // Add a bit of time for the text to appear/float (e.g. 500ms)
            maxDelay = (damageForAnimation.hits.length - 1) * 1000 + 500;
        }

        if (maxDelay > 0) {
            console.log(`[DEBUG] executeAttackSequence: Delaying cleanup by ${maxDelay}ms for animations.`);
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    performCleanup();
                    resolve();
                }, maxDelay);
            });
        } else {
            performCleanup();
        }
        return true;
    }
    private executeMoveSequence(
        unit: RenderableUnit,
        path: HoCMath.XY[],
        overrideFootprint?: HoCMath.XY[],
        onComplete?: () => void,
        replayAction?: Extract<GameAction, { type: "move_unit" }>,
    ): boolean {
        if (!path || path.length === 0) return false;
        const gs = this.sc_sceneSettings.getGridSettings();
        const cellSize = gs.getCellSize();
        const isLargeUnit = !unit.isSmallSize();
        const hasFootprintOverride = !!overrideFootprint && overrideFootprint.length === 4;

        // Large direct moves pass the final 2x2 footprint as `path`; large move-attacks pass a real route.
        const pathLooksLikeFootprintOnly =
            isLargeUnit &&
            hasFootprintOverride &&
            path.length === overrideFootprint!.length &&
            path.every((cell) =>
                overrideFootprint!.some((candidate) => candidate.x === cell.x && candidate.y === cell.y),
            );

        // Default destCell for logging / track anchor.
        let destCell = path[path.length - 1];

        // Capture starting world position before the common move mutates the shared unit object.
        const startPos = { ...unit.getPosition() };

        let cellsToOccupy: HoCMath.XY[];
        if (isLargeUnit) {
            if (hasFootprintOverride) {
                cellsToOccupy = overrideFootprint!;
            } else {
                // Fallback if we somehow don't get a footprint override.
                cellsToOccupy = [
                    { x: destCell.x, y: destCell.y },
                    { x: destCell.x + 1, y: destCell.y },
                    { x: destCell.x, y: destCell.y + 1 },
                    { x: destCell.x + 1, y: destCell.y + 1 },
                ];
            }
        } else {
            cellsToOccupy = [destCell];
        }

        const routeMetadata = this.currentActiveKnownPaths?.get((destCell.x << 4) | destCell.y)?.[0];
        const action: GameAction = replayAction
            ? cloneReplayData(replayAction)
            : {
                  type: "move_unit",
                  unitId: unit.getId(),
                  path,
                  targetCells: cellsToOccupy,
                  hasLavaCell: routeMetadata?.hasLavaCell,
                  hasWaterCell: routeMetadata?.hasWaterCell,
              };
        if (this.shouldDeferActionToAuthoritativeReplay(action)) {
            return this.submitActionForAuthoritativeReplay(action);
        }
        const moveResult = this.createActionEngine().apply(action);
        if (!moveResult.completed) {
            console.error(
                `Critical: Unit ${unit.getName()} failed to move to target footprint (dest ${destCell.x}, ${destCell.y}): ${moveResult.rejectionReason ?? "unknown"}`,
            );
            return false;
        }
        const moveEvent = moveResult.events.find((event) => event.type === "unit_moved");

        // Sync matrices
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();

        const newWorldPos =
            moveEvent?.type === "unit_moved" ? moveEvent.to : GridMath.getPositionForCells(gs, cellsToOccupy);
        if (!newWorldPos) {
            console.error(
                `Critical: Failed to compute world position for cells when moving ${unit.getName()} -> (${destCell.x}, ${destCell.y})`,
            );
            return false;
        }

        unit.setPosition(startPos.x, startPos.y);

        // For large units, recompute a sensible anchor destCell
        if (pathLooksLikeFootprintOnly) {
            const anchor = GridMath.getCellForPosition(gs, newWorldPos);
            if (anchor) {
                destCell = anchor;
            }
        }

        // --- Build world-space path for visual animation ---
        const worldPath: HoCMath.XY[] = [];
        worldPath.push({ x: startPos.x, y: startPos.y });

        if (pathLooksLikeFootprintOnly) {
            // Large unit: we only know start and final footprint -> straight line A -> B.
            worldPath.push({ x: newWorldPos.x, y: newWorldPos.y });
        } else {
            // Calculate offset if needed (for Large Units following an anchor path)
            let offsetX = 0;
            let offsetY = 0;

            // If Large Unit, align the path visual to the Unit's Center, not the Anchor Cell center.
            if (isLargeUnit && path.length > 0) {
                const startCellPos = GridMath.getPositionForCell(path[0], gs.getMinX(), gs.getStep(), gs.getHalfStep());
                if (startCellPos) {
                    // If path[0] corresponds to our current location (start), calculating offset relative to current Center
                    // startPos is unit.getPosition() (Center).
                    // But path[0] might be the *next* cell?
                    // Usually path[0] is the start cell or the first step.
                    // If path includes start cell:
                    // Offset = BoxCenter - CellCenter.
                    // Let's assume constant offset for the whole path based on destination alignment, which is safer.

                    // Align LAST path node to LAST world pos (Target Center)
                    const lastPathCell = path[path.length - 1];
                    const lastCellPos = GridMath.getPositionForCell(
                        lastPathCell,
                        gs.getMinX(),
                        gs.getStep(),
                        gs.getHalfStep(),
                    );
                    if (lastCellPos) {
                        offsetX = newWorldPos.x - lastCellPos.x;
                        offsetY = newWorldPos.y - lastCellPos.y;
                    }
                }
            }

            // Small units (or future large units with real route): follow the full route.
            for (let i = 0; i < path.length; i++) {
                const cell = path[i];
                const pos = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
                if (pos) {
                    const targetX = pos.x + offsetX;
                    const targetY = pos.y + offsetY;
                    const last = worldPath[worldPath.length - 1];

                    // Avoid duplicates
                    if (!last || Math.abs(last.x - targetX) > 0.01 || Math.abs(last.y - targetY) > 0.01) {
                        worldPath.push({ x: targetX, y: targetY });
                    }
                }
            }
            // Ensure last point matches logical final position strictly.
            const last = worldPath[worldPath.length - 1];
            if (!last || Math.abs(last.x - newWorldPos.x) > 0.01 || Math.abs(last.y - newWorldPos.y) > 0.01) {
                worldPath.push({ x: newWorldPos.x, y: newWorldPos.y });
            }
        }

        const moveSpeed = cellSize * 16; // Adjusted speed based on user feedback (was 12)

        const handleMoveComplete = (): void => {
            if (onComplete) {
                onComplete();
            } else {
                this.finishMovedUnitTurn(unit);
            }
            this.flushPendingReplayRecords();
        };

        this.moveAnimManager.startMoveAnimation(
            unit,
            worldPath,
            moveSpeed,
            destCell,
            pathLooksLikeFootprintOnly ? undefined : path, // trackPath
            handleMoveComplete,
        );

        this.isActiveUnitMoving = true;
        if (this.sc_visibleState) {
            this.sc_visibleStateUpdateNeeded = true;
        }

        this.hoverManager.setSilhouetteLocked(true);
        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.currentActivePathHashes = undefined;
        this.hoverManager.clearHoverSilhouette();
        this.hoverManager.hoveredUnitHighlight = undefined;
        this.sc_moveBlocked = true;
        return true;
    }
    private finishMovedUnitTurn(unit: RenderableUnit): void {
        const action: GameAction = {
            type: "end_turn",
            unitId: unit.getId(),
            reason: "manual",
        };
        const unitSnapshot = this.snapshotRenderableUnits();
        const result = this.createActionEngine().apply(action);
        if (!result.completed) {
            this.sc_sceneLog.updateLog(
                result.message ?? `Cannot finish move turn: ${result.rejectionReason ?? "unknown"}`,
            );
            return;
        }
        this.applyTurnEngineEvents(result.events, unitSnapshot);
        this.advanceAfterNoActiveUnitIfNeeded();
    }
    private advanceAfterNoActiveUnitIfNeeded(): void {
        if (this.currentActiveUnit) {
            return;
        }

        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (!fightProps.hasFightStarted() || fightProps.hasFightFinished()) {
            return;
        }

        const unitSnapshot = this.snapshotRenderableUnits();
        const result = this.createTurnEngine().advanceAfterNoActiveUnit({
            centerAlreadyDried: this.dungeonVisuals.isCenterDried(),
            damageDealtThisLap: this.attackHandler?.getDamageStatisticHolder().has(fightProps.getCurrentLap()) ?? false,
        });
        this.applyTurnEngineEvents(result.events, unitSnapshot);

        if (result.nextUnit) {
            this.handleNextUnitActivation(result.nextUnit as RenderableUnit);
        }
    }
    private isBoardInputLockedByAI(): boolean {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        return (
            fightProps.hasFightStarted() &&
            !fightProps.hasFightFinished() &&
            (this.sc_isAIActive ||
                !!this.currentActiveUnit?.hasAbilityActive("AI Driven") ||
                this.aiController?.shouldControlCurrentUnit())
        );
    }
    private clearBoardHoverPreviews(): void {
        this.hoverManager.clearAttackVisuals();
        this.hoverManager.clearHoverSilhouette();
        this.hoverManager.clearAuraVisuals();
        this.hoverManager.clearAOEArea();
        this.hoverManager.clearSpellPreview();
        this.hoverManager.hoverAttackFromCell = undefined;
        this.hoverManager.hoveredUnitHighlight = undefined;
        this.hoverRangeAttackObstacle = undefined;
        this.sc_hoveredAuraRanges = undefined;
        this.sc_hoveredShotRange = undefined;
    }
    protected override canShowHoverForActiveUnit(): boolean {
        return true;
    }
    protected override hover(): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();

        if (this.isBoardInputLockedByAI()) {
            this.clearBoardHoverPreviews();
            this.setHoveredSpell(undefined);
            return;
        }

        // Ranked mode: suppress hover visuals when the active unit is on the enemy team.
        // The viewer should only see their own unit's previews, not the opponent's.
        if (!this.canShowHoverForActiveUnit()) {
            this.clearBoardHoverPreviews();
            this.setHoveredSpell(undefined);
            return;
        }

        // 0. Spellbook Interaction
        if (this.sc_renderSpellBookOverlay && this.currentActiveUnit && this.sc_mouseWorld) {
            if (this.currentActiveUnit instanceof RenderableUnit) {
                const hoveredSpell = this.currentActiveUnit.getHoveredSpell(
                    this.spellbookGlobalFromWorld(this.sc_mouseWorld),
                    true,
                );
                this.setHoveredSpell(hoveredSpell, this.currentActiveUnit);

                // If hovering inside spellbook, skip other board interactions?
                // Probably yes, to avoid clicking units "through" the book.
                // Assuming SpellBook renders on top.
                if (hoveredSpell) {
                    this.hoverManager.clear();
                    return;
                }
            }
        } else {
            this.setHoveredSpell(undefined);
        }

        // --- 1. Generic Hover Logic (Pre & Post Fight) ---
        // Populates sc_hoveredAuraRanges / sc_hoveredShotRange for generic drawing via SandboxDrawer
        this.hoverManager.clearAuraVisuals(); // Ensure previous frame visual is cleared
        this.sc_hoveredAuraRanges = undefined;
        this.sc_hoveredShotRange = undefined;

        // Always calculate hovered unit visuals (unless moving active unit)
        if (this.sc_mouseWorld && !this.isActiveUnitMoving) {
            const hoverTargetUnit = this.getUnitAtPosition(this.sc_mouseWorld);
            if (hoverTargetUnit && !hoverTargetUnit.isDead()) {
                // Aura Calculations
                const auraRanges = hoverTargetUnit.getAuraRanges();
                if (auraRanges && auraRanges.length > 0) {
                    const bonus = FightStateManager.getInstance()
                        .getFightProperties()
                        .getAdditionalAuraRangePerTeam(hoverTargetUnit.getTeam());
                    const ab = hoverTargetUnit.getAuraIsBuff();

                    for (let i = 0; i < auraRanges.length; i++) {
                        const r = auraRanges[i];
                        if (r <= 0) continue;
                        const isBuff = ab && i < ab.length ? ab[i] : true;
                        const radiusPixel = (r + bonus) * GridConstants.STEP;

                        this.hoverManager.drawAuraArea(
                            hoverTargetUnit.getPosition(),
                            radiusPixel,
                            isBuff,
                            hoverTargetUnit.isSmallSize(),
                            0.7,
                        );
                    }
                }

                // Range Attack Visuals (Only if Ranged)
                if (
                    hoverTargetUnit.getAttackType() === AttackVals.RANGE &&
                    !hoverTargetUnit.hasAbilityActive("Handyman")
                ) {
                    if (hoverTargetUnit.hasAbilityActive("Sniper")) {
                        hoverTargetUnit.setRangeShotDistance(
                            Number(
                                (
                                    GridMath.getDistanceToFurthestCorner(
                                        hoverTargetUnit.getPosition(),
                                        this.sc_sceneSettings.getGridSettings(),
                                    ) /
                                        this.sc_sceneSettings.getGridSettings().getStep() -
                                    0.45
                                ).toFixed(2),
                            ),
                        );
                    }
                    const dist = hoverTargetUnit.getRangeShotDistance();
                    if (dist > 0) {
                        this.sc_hoveredShotRange = {
                            xy: hoverTargetUnit.getPosition(),
                            distance: dist * GridConstants.STEP,
                        };
                    }
                }
            }
        }

        // --- FIGHT MODE: active unit move-hover silhouette ---
        if (fightProps.hasFightStarted()) {
            if (!this.currentActiveUnit) {
                this.hoverManager.clearHoverSilhouette();
                return;
            }
            if (this.sc_isAnimating || this.isActiveUnitMoving || this.sc_moveBlocked || !this.sc_mouseWorld) {
                // While a projectile is in flight / the unit is landing an attack, it can't move —
                // don't draw the move-preview silhouette.
                this.hoverManager.clearHoverSilhouette();
                return;
            }
            if (this.currentActiveUnit.hasAbilityActive("AI Driven")) {
                this.hoverManager.clearHoverSilhouette();
                return;
            }

            // --- SPELL TARGETING HOVER: a single-target spell is armed. Preview its effect on the
            // unit under the cursor — green silhouette for buffs/heals, red for debuffs/damage — and
            // only when the spell is actually castable on that unit (reusing SpellHelper.canCastSpell,
            // which already encodes team / magic-resist / healable / mind-resist / stack rules). A
            // colored beam caster→target + a persistent icon/name badge above the caster make it
            // obvious which spell is about to fire. Castling (position swap) is special: every valid
            // swap target is highlighted up-front in dark yellow, not just the one under the cursor.---
            if (this.currentActiveSpell && this.currentActiveUnit) {
                const spell = this.currentActiveSpell;
                const caster = this.currentActiveUnit;
                const gs2 = this.sc_sceneSettings.getGridSettings();
                const hoveredUnit = this.getUnitAtPosition(this.sc_mouseWorld);
                this.hoverManager.clearAttackVisuals();
                this.hoverManager.clearHoverSilhouette();
                this.hoverManager.hoverAttackFromCell = undefined;

                // Castling reads as dark yellow; buffs/heals green; debuffs/damage red.
                const isSwap = spell.getSpellTargetType() === SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE;
                const spellColor = isSwap ? 0xb8860b : spell.isBuff() ? 0x1aa84a : 0xaa0000;
                const casterPos = caster.getVisualCenter(gs2);
                const iconTex = this.texAny(SpellHelper.spellToTextureNames(spell.getName())[0]) ?? Texture.EMPTY;

                let targetCenter: HoCMath.XY | undefined;
                if (isSwap && this.currentEnemiesCellsWithinMovementRange) {
                    // Highlight every small enemy within movement range so the player sees all options.
                    for (const c of this.currentEnemiesCellsWithinMovementRange) {
                        const id = this.grid.getOccupantUnitId(c);
                        const u = id ? this.unitsHolder.getAllUnits().get(id) : undefined;
                        if (u && !u.isDead()) {
                            this.hoverManager.addTargetHighlight(u, spellColor);
                        }
                    }
                    // Beam only to the one actually under the cursor (if it's a valid swap target).
                    const rTarget = hoveredUnit as RenderableUnit;
                    if (
                        hoveredUnit &&
                        !hoveredUnit.isDead() &&
                        typeof rTarget.getVisualCenter === "function" &&
                        SpellHelper.canCastSpell(
                            false,
                            gs2,
                            this.gridMatrix,
                            caster,
                            hoveredUnit,
                            spell,
                            hoveredUnit.getBaseCell(),
                            hoveredUnit.getMagicResist(),
                            hoveredUnit.hasMindAttackResistance(),
                            hoveredUnit.canBeHealed(),
                            this.currentEnemiesCellsWithinMovementRange,
                        )
                    ) {
                        targetCenter = rTarget.getVisualCenter(gs2);
                    }
                } else if (
                    hoveredUnit &&
                    !hoveredUnit.isDead() &&
                    SpellHelper.canCastSpell(
                        false,
                        gs2,
                        this.gridMatrix,
                        caster,
                        hoveredUnit,
                        spell,
                        hoveredUnit.getBaseCell(),
                        hoveredUnit.getMagicResist(),
                        hoveredUnit.hasMindAttackResistance(),
                        hoveredUnit.canBeHealed(),
                        this.currentEnemiesCellsWithinMovementRange,
                    )
                ) {
                    this.hoverManager.addTargetHighlight(hoveredUnit, spellColor);
                    const rTarget = hoveredUnit as RenderableUnit;
                    targetCenter =
                        typeof rTarget.getVisualCenter === "function"
                            ? rTarget.getVisualCenter(gs2)
                            : hoveredUnit.getPosition();
                }

                this.hoverManager.drawSpellCastPreview({
                    casterPos,
                    targetPos: targetCenter,
                    iconTex,
                    label: spell.getName(),
                    color: spellColor,
                });
                return;
            }

            // MAGIC attack type still shows the move silhouette (so you can position the caster);
            // we just suppress melee attack targeting downstream by not computing melee targets.

            // [Global Sniper Check] Ensure range is up-to-date before any calculations
            if (this.currentActiveUnit.hasAbilityActive("Sniper")) {
                this.currentActiveUnit.setRangeShotDistance(
                    Number(
                        (
                            GridMath.getDistanceToFurthestCorner(
                                this.currentActiveUnit.getPosition(),
                                this.sc_sceneSettings.getGridSettings(),
                            ) /
                                this.sc_sceneSettings.getGridSettings().getStep() -
                            0.45
                        ).toFixed(2),
                    ),
                );
            }
            const gs = this.sc_sceneSettings.getGridSettings();
            const cell = GridMath.getCellForPosition(gs, this.sc_mouseWorld);
            if (!cell) {
                this.hoverManager.clearHoverSilhouette();
                this.hoverManager.hoverAttackFromCell = undefined;
                this.hoverManager.clearAuraVisuals();
                this.sc_hoveredShotRange = undefined;
                return;
            }

            this.hoverManager.clearAuraVisuals(); // Ensure legacy visual is cleared
            // Generic Aura logic moved to top of function (sc_hoveredAuraRanges)

            // Generic Range logic moved to top of function (sc_hoveredShotRange)

            // Check for melee attack target
            let isAttacking = false;

            this.hoverManager.hoverAttackFromCell = undefined; // Reset state
            this.hoverRangeAttackObstacle = undefined; // Reset blocked-shot state

            // --- OBSTACLE HOVER: previewing an attack on the destructible center (BLOCK_CENTER). ---
            if (this.updateObstacleHover()) {
                return;
            }

            // --- AREA THROW HOVER: preview the splash area for Gargantuan-style AOE units. ---
            if (this.updateAreaThrowHover()) {
                return;
            }

            // Only checking for attack if we have melee targets calculated
            if (this.canAttackByMeleeTargets && this.currentActiveUnit) {
                const targetUnit = this.getUnitAtPosition(this.sc_mouseWorld);
                // A unit with the "Hidden" buff cannot be hovered/targeted for attack; show a
                // "Hidden" hover message instead (cleared once the cursor leaves the unit).
                const isHiddenEnemy =
                    !!targetUnit &&
                    targetUnit.getTeam() !== this.currentActiveUnit.getTeam() &&
                    targetUnit.hasBuffActive("Hidden");
                if (isHiddenEnemy) {
                    if (this.sc_hoverInfoArr[0] !== "Hidden") {
                        this.sc_hoverInfoArr = ["Hidden"];
                        this.sc_hoverTextUpdateNeeded = true;
                    }
                } else if (this.sc_hoverInfoArr[0] === "Hidden") {
                    this.sc_hoverInfoArr = [];
                    this.sc_hoverTextUpdateNeeded = true;
                }
                if (
                    targetUnit &&
                    targetUnit.getTeam() !== this.currentActiveUnit.getTeam() &&
                    !targetUnit.hasBuffActive("Hidden")
                ) {
                    let attackFrom: HoCMath.XY | undefined;

                    // Check if mouse cell is actually part of the target unit (for precise targeting)
                    const isMouseInsideUnit = targetUnit.getCells().some((c) => c.x === cell.x && c.y === cell.y);

                    const isRangedUnit = this.currentActiveUnit.getAttackTypeSelection() === AttackVals.RANGE;
                    const canStaticRangeAttack = this.canAttackByRangeTargets?.has(targetUnit.getId());
                    let isRangeAttackContext = false;

                    let skipMeleeCheck = this.currentActiveUnit.hasAbilityActive("No Melee");

                    const canPerformRangeAttack =
                        this.currentActiveUnit.getAttackTypeSelection() === AttackVals.RANGE &&
                        this.currentActiveUnit.getRangeShots() > 0 &&
                        !this.attackHandler.canBeAttackedByMelee(
                            this.currentActiveUnit.getPosition(),
                            this.currentActiveUnit.isSmallSize(),
                            this.grid.getEnemyAggrMatrixByUnitId(this.currentActiveUnit.getId()),
                        ) &&
                        !this.currentActiveUnit.hasDebuffActive("Range Null Field Aura") &&
                        !this.currentActiveUnit.hasDebuffActive("Rangebane");

                    // 1. Static Range Priority
                    // Relaxed check: Allow visualization even if technically out of 'shot_distance' (for Penalty logic)
                    if (
                        canPerformRangeAttack &&
                        (canStaticRangeAttack || (isRangedUnit && !this.currentActiveUnit.hasAbilityActive("Handyman")))
                    ) {
                        const dist = HoCMath.getDistance(
                            this.currentActiveUnit.getPosition(),
                            targetUnit.getPosition(),
                        );

                        // If Valid Attack OR (Long Range Visual Context - Not Adjacent)
                        if (canStaticRangeAttack || dist > GridConstants.STEP * 1.5) {
                            // If not adjacent (or forced No Melee), prefer shooting
                            if (
                                dist > GridConstants.STEP * 1.5 ||
                                this.currentActiveUnit.hasAbilityActive("No Melee")
                            ) {
                                isRangeAttackContext = true;
                                skipMeleeCheck = true;
                            }
                        }
                    }

                    // 2. Move-and-Shoot Logic (if not static shooting)
                    if (canPerformRangeAttack && !isRangeAttackContext && isRangedUnit) {
                        if (this.currentActiveUnit.hasAbilityActive("Sniper")) {
                            this.currentActiveUnit.setRangeShotDistance(
                                Number(
                                    (
                                        GridMath.getDistanceToFurthestCorner(
                                            this.currentActiveUnit.getPosition(),
                                            this.sc_sceneSettings.getGridSettings(),
                                        ) /
                                            this.sc_sceneSettings.getGridSettings().getStep() -
                                        0.45
                                    ).toFixed(2),
                                ),
                            );
                        }
                        const shotDist = this.currentActiveUnit.getRangeShotDistance();
                        const attackRangeForCalc = Math.max(1, shotDist); // Use Shot Distance for pathfinding!

                        const possibleShootPos = this.pathHelper.calculateClosestAttackFrom(
                            this.sc_mouseWorld,
                            this.canAttackByMeleeTargets.attackCells,
                            this.currentActiveUnit.getCells(),
                            targetUnit.getCells(),
                            this.currentActiveUnit.isSmallSize(),
                            attackRangeForCalc,
                            targetUnit.isSmallSize(),
                            TeamVals.NO_TEAM,
                            this.canAttackByMeleeTargets.attackCellHashesToLargeCells,
                        );

                        // Valid if position found AND distance implies shooting (not melee)
                        if (possibleShootPos) {
                            const distFromDest = HoCMath.getDistance(possibleShootPos, targetUnit.getPosition());
                            if (distFromDest > GridConstants.STEP * 1.5) {
                                // Found a valid SHOOTING position
                                attackFrom = possibleShootPos;
                                isRangeAttackContext = true;
                                skipMeleeCheck = true;
                            }
                        }
                    }

                    if (!skipMeleeCheck && isMouseInsideUnit) {
                        attackFrom = this.pathHelper.calculateClosestAttackFrom(
                            this.sc_mouseWorld,
                            this.canAttackByMeleeTargets.attackCells,
                            this.currentActiveUnit.getCells(),
                            [cell], // Priority 1: Specific hovered cell
                            this.currentActiveUnit.isSmallSize(),
                            this.currentActiveUnit.getAttackRange(),
                            true, // Treat single cell as small target
                            TeamVals.NO_TEAM,
                            this.canAttackByMeleeTargets.attackCellHashesToLargeCells,
                        );
                    }

                    // Fallback: Melee if not found
                    if (!attackFrom && !skipMeleeCheck) {
                        attackFrom = this.pathHelper.calculateClosestAttackFrom(
                            this.sc_mouseWorld,
                            this.canAttackByMeleeTargets.attackCells,
                            this.currentActiveUnit.getCells(),
                            targetUnit.getCells(),
                            this.currentActiveUnit.isSmallSize(),
                            this.currentActiveUnit.getAttackRange(),
                            targetUnit.isSmallSize(),
                            TeamVals.NO_TEAM,
                            this.canAttackByMeleeTargets.attackCellHashesToLargeCells,
                        );
                    }

                    if (attackFrom || isRangeAttackContext) {
                        // Clear previous frame's highlights/visuals before adding new ones
                        this.hoverManager.clearAttackVisuals();
                        // Mass/AOE ranged units (Cyclops/Tsar Cannon/Gargantuan) outline every unit
                        // the shot will hit; everyone else highlights just the single target.
                        if (!this.highlightRangeAttackUnits(targetUnit)) {
                            this.hoverManager.addTargetHighlight(targetUnit);
                        }

                        let attackFromPos: HoCMath.XY | undefined;
                        let attackFromCell: HoCMath.XY;

                        if (attackFrom) {
                            attackFromCell = attackFrom;
                            this.hoverManager.hoverAttackFromCell = attackFrom;

                            // Refined Logic (Melee / Move-to-Shoot): Use footprint map for large units
                            if (!this.currentActiveUnit.isSmallSize() && this.canAttackByMeleeTargets) {
                                const hash = (attackFrom.x << 4) | attackFrom.y;
                                const footprint = this.canAttackByMeleeTargets.attackCellHashesToLargeCells.get(hash);
                                if (footprint && footprint.length > 0) {
                                    let minX = Number.MAX_SAFE_INTEGER;
                                    let minY = Number.MAX_SAFE_INTEGER;
                                    for (const c of footprint) {
                                        if (c.x < minX) minX = c.x;
                                        if (c.y < minY) minY = c.y;
                                    }
                                    attackFromPos = GridMath.getPositionForCell(
                                        { x: minX, y: minY },
                                        gs.getMinX(),
                                        gs.getStep(),
                                        gs.getHalfStep(),
                                    );

                                    attackFromPos.x -= gs.getHalfStep();
                                    attackFromPos.y -= gs.getHalfStep();
                                }
                            }

                            if (!attackFromPos) {
                                attackFromPos = GridMath.getPositionForCell(
                                    attackFrom,
                                    gs.getMinX(),
                                    gs.getStep(),
                                    gs.getHalfStep(),
                                );
                                if (!this.currentActiveUnit.isSmallSize()) {
                                    attackFromPos.x -= gs.getHalfStep();
                                    attackFromPos.y -= gs.getHalfStep();
                                }
                            }

                            this.hoverManager.updateHoverSilhouette(attackFromPos);
                        } else {
                            // Static Range Attack (No movement)
                            attackFromPos = this.currentActiveUnit.getPosition();
                            attackFromCell = GridMath.getCellForPosition(gs, attackFromPos);
                            this.hoverManager.hoverAttackFromCell = attackFromCell;
                            this.hoverManager.hideSilhouettesOnly();
                        }

                        // Target visual center
                        let tVis: HoCMath.XY;
                        if (targetUnit instanceof RenderableUnit) {
                            tVis = targetUnit.getVisualCenter(gs);
                        } else {
                            tVis = targetUnit.getPosition();
                        }

                        const centerVis = { x: tVis.x, y: tVis.y };
                        let arrowStartPos: HoCMath.XY;

                        if (!attackFromPos) {
                            // PRIORITIZE VISUAL CENTER if available (matches sprite exactly)
                            if (!this.currentActiveUnit.isSmallSize()) {
                                arrowStartPos = { ...this.currentActiveUnit.getVisualCenter(gs) };
                            } else {
                                arrowStartPos = { ...this.currentActiveUnit.getCenter() };
                            }
                        } else {
                            arrowStartPos = { ...attackFromPos };
                        }

                        let arrowEndPos: HoCMath.XY | undefined;

                        arrowEndPos = GridMath.getClosestSideCenter(
                            this.grid.getMatrix(),
                            gs,
                            this.sc_mouseWorld,
                            arrowStartPos,
                            targetUnit.getPosition(),
                            this.currentActiveUnit.isSmallSize(),
                            targetUnit.isSmallSize(),
                            this.currentActiveUnit.getTeam(),
                            this.currentActiveUnit.hasAbilityActive("Through Shot"),
                        );

                        // Fallback
                        if (!arrowEndPos) {
                            // Ensure arrowEndPos is assigned a concrete value here
                            let rawPos: HoCMath.XY;
                            if (targetUnit instanceof RenderableUnit) {
                                rawPos = targetUnit.getVisualCenter(gs);
                            } else {
                                rawPos = targetUnit.getPosition();
                            }
                            // Clone to avoid mutation if getPosition returns a reference
                            const fallbackPos = { ...rawPos };

                            if (!(targetUnit instanceof RenderableUnit)) {
                                fallbackPos.x += gs.getHalfStep();
                                fallbackPos.y += gs.getHalfStep();
                            }
                            arrowEndPos = fallbackPos;
                        }
                        const finalArrowEndPos = arrowEndPos!;
                        tVis = finalArrowEndPos;

                        // Calculate projected damage
                        const attackRate = this.currentActiveUnit.getAttack();
                        const abilityPower = FightStateManager.getInstance()
                            .getFightProperties()
                            .getAdditionalAbilityPowerPerTeam(this.currentActiveUnit.getTeam());

                        let isMelee = !isRangeAttackContext;
                        let rangeDivisor = 1;
                        let multiplier = 1; // Initialize BEFORE position logic usage

                        // --- [FIX] Calculate Exact Attack Position for Multipliers (e.g. Backstab) ---
                        // We need to know WHERE the attack comes from to trigger position-based abilities.
                        // Logic from test_heroes.ts:
                        let hoverAttackFromCell: HoCMath.XY | undefined;
                        if (isMelee) {
                            // strict melee movement math for Melee attacks
                            // If we are already next to it, or moving to it.
                            // We leverage pathHelper.calculateClosestAttackFrom just like test_heroes.
                            if (this.canAttackByMeleeTargets && this.canAttackByMeleeTargets.attackCells.length > 0) {
                                hoverAttackFromCell = this.pathHelper.calculateClosestAttackFrom(
                                    this.sc_mouseWorld,
                                    this.canAttackByMeleeTargets.attackCells,
                                    this.currentActiveUnit.getCells(),
                                    targetUnit.isSmallSize() ? [targetUnit.getBaseCell()] : targetUnit.getCells(),
                                    this.currentActiveUnit.isSmallSize(),
                                    this.currentActiveUnit.getAttackRange(),
                                    targetUnit.isSmallSize(),
                                    targetUnit.getTeam(),
                                    this.canAttackByMeleeTargets.attackCellHashesToLargeCells,
                                );
                            } else {
                                // Fallback for adjacent stationary attack
                                hoverAttackFromCell = this.currentActiveUnit.getBaseCell();
                            }
                        } else {
                            // Range: From current position
                            hoverAttackFromCell = this.currentActiveUnit.getBaseCell();
                        }

                        // Apply Positional Ability Multipliers (Backstab)
                        if (hoverAttackFromCell) {
                            const abilitiesWithPositionCoeff = AbilityHelper.getAbilitiesWithPosisionCoefficient(
                                this.currentActiveUnit.getAbilities(),
                                hoverAttackFromCell,
                                targetUnit.getBaseCell(),
                                targetUnit.isSmallSize(),
                                this.currentActiveUnit.getTeam(),
                            );
                            if (abilitiesWithPositionCoeff && abilitiesWithPositionCoeff.length) {
                                for (const awpc of abilitiesWithPositionCoeff) {
                                    multiplier *= this.currentActiveUnit.calculateAbilityMultiplier(awpc, abilityPower);
                                }
                            }
                        }

                        // Sync 'attackFromCell' usage for downstream logic (War Anger/Rapid Charge)
                        // But wait! attackFromCell was used EARLIER (lines 3156 or passed from earlier).
                        // If we overwrite it here, it only affects logic BELOW (which is what we want for damage calcs).
                        if (hoverAttackFromCell) {
                            attackFromCell = hoverAttackFromCell; // Update local 'attackFromCell' variable
                        }

                        // [Insert Positional Logic Here]

                        // Melee Penalty for Ranged Units doing Melee
                        if (
                            isMelee &&
                            this.currentActiveUnit.getAttackType() === AttackVals.RANGE &&
                            !this.currentActiveUnit.hasAbilityActive("Handyman")
                        ) {
                            rangeDivisor = 2; // Penalty
                        }

                        // distance-based penalties
                        // We use the guaranteed non-null finalArrowEndPos
                        const distRes = HoCMath.getDistance(arrowStartPos, finalArrowEndPos) / GridConstants.STEP;
                        if (isRangeAttackContext) {
                            if (distRes > this.currentActiveUnit.getRangeShotDistance()) {
                                rangeDivisor = 2;
                            }
                        }

                        // Double Shot Logic (Legacy check)
                        if (isRangeAttackContext && this.currentActiveUnit.hasAbilityActive("Double Shot")) {
                            multiplier = 2; // Display double damage
                        }

                        // --- [PORTED] Advanced Damage Logic from test_heroes.ts ---

                        // 1. Ability Multipliers (Large Caliber, Area Throw)
                        const largeCaliberAbility = this.currentActiveUnit.getAbility("Large Caliber");
                        if (largeCaliberAbility) {
                            multiplier *= this.currentActiveUnit.calculateAbilityMultiplier(
                                largeCaliberAbility,
                                abilityPower,
                            );
                        }
                        const areaThrowAbility = this.currentActiveUnit.getAbility("Area Throw");
                        if (areaThrowAbility) {
                            multiplier *= this.currentActiveUnit.calculateAbilityMultiplier(
                                areaThrowAbility,
                                abilityPower,
                            );
                        }

                        // 2. Rapid Charge
                        if (attackFromCell && this.currentActiveKnownPaths) {
                            const key = (attackFromCell.x << 4) | attackFromCell.y;
                            const paths = this.currentActiveKnownPaths.get(key);
                            let rapidChargeCellsNumber = 1;
                            if (paths && paths.length > 0) {
                                rapidChargeCellsNumber = paths[0].route.length;
                            }
                            multiplier *= AllAbilities.processRapidChargeAbility(
                                this.currentActiveUnit,
                                rapidChargeCellsNumber,
                            );
                        }

                        // 3. Paralysis (Attacker Effect)
                        const paralysisAttackerEffect = this.currentActiveUnit.getEffect("Paralysis");
                        if (paralysisAttackerEffect) {
                            multiplier *= (100 - paralysisAttackerEffect.getPower()) / 100;
                        }

                        // 4. Deep Wounds (Target Effect -> Attacker Bonus)
                        const deepWoundsEffect = targetUnit.getEffect("Deep Wounds");
                        if (
                            deepWoundsEffect &&
                            (this.currentActiveUnit.hasAbilityActive("Deep Wounds Level 1") ||
                                this.currentActiveUnit.hasAbilityActive("Deep Wounds Level 2") ||
                                this.currentActiveUnit.hasAbilityActive("Deep Wounds Level 3"))
                        ) {
                            multiplier *= 1 + deepWoundsEffect.getPower() / 100;
                        }

                        // 5. War Anger (Attack Rate Modification based on Position)
                        const warAngerAuraEffect = this.currentActiveUnit.getAuraEffect("War Anger");
                        let effectiveAttackRate = attackRate;

                        if (warAngerAuraEffect) {
                            const cells: HoCMath.XY[] = attackFromCell
                                ? [attackFromCell]
                                : this.currentActiveUnit.getCells();
                            if (!this.currentActiveUnit.isSmallSize() && attackFromCell) {
                                cells.push({ x: attackFromCell.x + 1, y: attackFromCell.y });
                                cells.push({ x: attackFromCell.x, y: attackFromCell.y + 1 });
                                cells.push({ x: attackFromCell.x + 1, y: attackFromCell.y + 1 });
                            }

                            const newAttackRate =
                                attackRate -
                                this.currentActiveUnit.getCurrentAttackModIncrease() +
                                this.unitsHolder.getUnitAuraAttackMod(this.currentActiveUnit, cells);
                            effectiveAttackRate = Math.max(1, newAttackRate);
                        }

                        let minDmg =
                            this.currentActiveUnit.calculateAttackDamageMin(
                                effectiveAttackRate,
                                targetUnit,
                                isMelee,
                                abilityPower,
                                rangeDivisor,
                                multiplier,
                            ) + AllAbilities.processPenetratingBiteAbility(this.currentActiveUnit, targetUnit);

                        let maxDmg =
                            this.currentActiveUnit.calculateAttackDamageMax(
                                effectiveAttackRate,
                                targetUnit,
                                isMelee,
                                abilityPower,
                                rangeDivisor,
                                multiplier,
                            ) + AllAbilities.processPenetratingBiteAbility(this.currentActiveUnit, targetUnit);

                        // Lucky Strike (Legacy)
                        const luckyStrikeAbility = this.currentActiveUnit.getAbility("Lucky Strike");
                        if (luckyStrikeAbility) {
                            maxDmg = Math.floor(
                                maxDmg *
                                    this.currentActiveUnit.calculateAbilityMultiplier(luckyStrikeAbility, abilityPower),
                            );
                        }

                        let totalMinKills = targetUnit.calculatePossibleLosses(minDmg);
                        let totalMaxKills = targetUnit.calculatePossibleLosses(maxDmg);
                        let totalMinDmg = minDmg;
                        let totalMaxDmg = maxDmg;

                        // --- Multi-Target Highlight (AOE) ---
                        const secondaryTargets: Unit[] = [];

                        // Common AOE (Lightning Spin, Fire Breath, Skewer Strike) - Usually Melee triggered?
                        // If Move-and-Shoot (Range), we probably shouldn't trigger Melee AOE visuals unless logic supports it.
                        // Assuming these are Melee abilities for now.
                        if (!isRangeAttackContext && attackFromCell) {
                            if (this.currentActiveUnit.hasAbilityActive("Lightning Spin")) {
                                const enemiesAround = this.unitsHolder.allEnemiesAroundUnit(
                                    this.currentActiveUnit,
                                    true,
                                    attackFromCell,
                                );
                                for (const enemy of enemiesAround) {
                                    if (enemy.getId() !== targetUnit.getId() && !enemy.isDead()) {
                                        secondaryTargets.push(enemy);
                                    }
                                }
                            }

                            if (
                                this.currentActiveUnit.hasAbilityActive("Fire Breath") ||
                                this.currentActiveUnit.hasAbilityActive("Skewer Strike")
                            ) {
                                const targets = AbilityHelper.nextStandingTargets(
                                    this.currentActiveUnit,
                                    targetUnit,
                                    this.grid,
                                    this.unitsHolder,
                                    attackFromCell,
                                    true,
                                    this.currentActiveUnit.hasAbilityActive("Skewer Strike"),
                                );

                                for (const enemy of targets) {
                                    if (enemy.getId() !== targetUnit.getId() && !enemy.isDead()) {
                                        secondaryTargets.push(enemy);
                                    }
                                }
                            }

                            if (this.currentActiveUnit.hasAbilityActive("Chain Lightning")) {
                                const targets = AllAbilities.getChainLightningTargets(
                                    targetUnit,
                                    this.grid,
                                    this.unitsHolder,
                                );
                                for (const enemy of targets) {
                                    if (enemy.getId() !== targetUnit.getId() && !enemy.isDead()) {
                                        secondaryTargets.push(enemy);
                                    }
                                }
                            }
                        }

                        // Calculate stats for secondary targets
                        for (const enemy of secondaryTargets) {
                            // Apply same modifiers to secondary targets
                            // Note: Double Shot might physically mean 2 hits, but for stats we aggregate.
                            // Assuming AOE scales with the same buffs (War Anger, Rapid Charge, etc).

                            // Penetrating Bite applies to secondary?
                            // Usually Penetrating Bite is "on attack target".
                            // Skewer Strike description: "Deals damage to unit behind".
                            // Assume simplified: Base dmg logic applies.
                            // But explicit "Penetrating Bite" additive probably only on primary?
                            // test_heroes.ts adds it explicitly: + processPenetratingBiteAbility...
                            // It doesn't seem to loop for AOE in the test logic I saw.
                            // I will exclude Penetrating Bite from secondary for safety unless known otherwise.

                            const sMin = this.currentActiveUnit.calculateAttackDamageMin(
                                effectiveAttackRate,
                                enemy,
                                isMelee,
                                abilityPower,
                                rangeDivisor,
                                multiplier,
                            );
                            const sMax = this.currentActiveUnit.calculateAttackDamageMax(
                                effectiveAttackRate,
                                enemy,
                                isMelee,
                                abilityPower,
                                rangeDivisor,
                                multiplier,
                            );

                            // Lucky Strike for Secondary?
                            let sMaxFinal = sMax;
                            if (luckyStrikeAbility) {
                                sMaxFinal = Math.floor(
                                    sMax *
                                        this.currentActiveUnit.calculateAbilityMultiplier(
                                            luckyStrikeAbility,
                                            abilityPower,
                                        ),
                                );
                            }

                            totalMinDmg += sMin;
                            totalMaxDmg += sMaxFinal;
                            totalMinKills += enemy.calculatePossibleLosses(sMin);
                            totalMaxKills += enemy.calculatePossibleLosses(sMaxFinal);
                        }

                        const dmgStr = totalMinDmg === totalMaxDmg ? `${totalMinDmg}` : `${totalMinDmg}-${totalMaxDmg}`;
                        let killStr: string | undefined;
                        let iconPath: string | undefined;

                        if (totalMaxKills > 0) {
                            killStr =
                                totalMinKills === totalMaxKills
                                    ? `${totalMinKills}`
                                    : `${totalMinKills}-${totalMaxKills}`;
                            iconPath = images.skull_white;
                        }

                        // Ranged shot whose line of sight crosses the central mountain is blocked:
                        // aim at the mountain (parity with legacy), not the enemy behind it.
                        let blockedByObstacle: IAttackObstacle | undefined;
                        if (isRangeAttackContext && !this.currentActiveUnit.hasAbilityActive("Through Shot")) {
                            const fp = FightStateManager.getInstance().getFightProperties();
                            if (fp.getGridType() === GridVals.BLOCK_CENTER && fp.getObstacleHitsLeft() > 0) {
                                blockedByObstacle = this.attackHandler.evaluateRangeAttack(
                                    this.unitsHolder.getAllUnits(),
                                    this.currentActiveUnit,
                                    this.currentActiveUnit.getPosition(),
                                    targetUnit.getPosition(),
                                    false,
                                    this.sc_isSelection,
                                    this.currentActiveUnit.hasAbilityActive("Large Caliber") ||
                                        this.currentActiveUnit.hasAbilityActive("Area Throw"),
                                ).attackObstacle;
                            }
                        }

                        if (blockedByObstacle) {
                            this.hoverRangeAttackObstacle = blockedByObstacle;
                            this.hoverManager.drawAttackArrow(arrowStartPos, blockedByObstacle.position);
                            this.sc_hoverInfoArr = ["Hit the mountain"];
                            this.sc_hoverTextUpdateNeeded = true;
                            isAttacking = true;
                        } else {
                            this.hoverManager.drawDamagePrediction(
                                dmgStr,
                                killStr,
                                centerVis,
                                !targetUnit.isSmallSize(), // isLargeTarget
                                iconPath,
                            );
                            this.hoverManager.drawAttackArrow(arrowStartPos, tVis);
                            isAttacking = true;

                            // Add Red Highlight for Secondary Targets (Hidden units are not targetable)
                            for (const enemy of secondaryTargets) {
                                if (!enemy.hasBuffActive("Hidden")) {
                                    this.hoverManager.addTargetHighlight(enemy);
                                }
                            }
                        }
                    }
                }
            }

            if (!isAttacking) {
                this.hoverManager.clearAttackVisuals();
            }

            if (!isAttacking) {
                this.hoverManager.hoverAttackFromCell = undefined;
                if (this.hoverManager.isCellReachableForActiveUnit(cell)) {
                    this.hoverManager.updateActiveMoveSilhouetteForCell(cell);
                } else {
                    this.hoverManager.clearHoverSilhouette();
                }
            }

            return;
        }
        // CASE 1: Active selection from OVERLAY (New Unit)
        if (this.hasActiveSelection && this.sc_selectedUnitProperties && this.selectionFromOverlay) {
            this.hoverManager.hoveredUnitHighlight = undefined;
            this.hoverManager.updateHoverPlacementCell(this.sc_mouseWorld);
            return;
        }
        // CASE 2: Active selection from BOARD (Moving existing unit)
        if (
            this.hasActiveSelection &&
            this.sc_selectedUnitProperties &&
            !this.selectionFromOverlay &&
            this.draggingUnitId
        ) {
            this.hoverManager.calculateActiveSelectionHighlight();
            this.hoverManager.updateHoverPlacementCell(this.sc_mouseWorld);
            return;
        }
        // CASE 3: No active selection → just passive hover highlight (mouse over unit)
        this.hoverManager.update(1 / 60);
        this.hoverManager.calculatePassiveHover();

        // Unified Visual Target: Hovered > Shifted > Selected
        let targetUnit: RenderableUnit | undefined;
        if (this.hoverManager.hoveredUnitId) {
            targetUnit = this.unitsHolder.getAllUnits().get(this.hoverManager.hoveredUnitId) as RenderableUnit;
        } else if (this.currentShiftedUnit) {
            targetUnit = this.currentShiftedUnit;
        } else if (this.selectedBoardUnit) {
            targetUnit = this.selectedBoardUnit;
        }

        // --- 1. Attack & Aura Range Visualization ---
        if (targetUnit) {
            // Attack Range
            if (targetUnit.getAttackType() === AttackVals.RANGE) {
                if (targetUnit.hasAbilityActive("Sniper")) {
                    targetUnit.setRangeShotDistance(
                        Number(
                            (
                                GridMath.getDistanceToFurthestCorner(
                                    targetUnit.getPosition(),
                                    this.sc_sceneSettings.getGridSettings(),
                                ) /
                                    this.sc_sceneSettings.getGridSettings().getStep() -
                                0.45
                            ).toFixed(2),
                        ),
                    );
                }
                const shotDist = targetUnit.getRangeShotDistance();
                if (shotDist > 0) {
                    this.sc_hoveredShotRange = {
                        xy: targetUnit.getVisualCenter(this.sc_sceneSettings.getGridSettings()),
                        distance: shotDist * GridConstants.STEP,
                    };
                } else {
                    this.sc_hoveredShotRange = undefined;
                }
                if (targetUnit) {
                    const ar = targetUnit.getAuraRanges();
                    const ab = targetUnit.getAuraIsBuff();
                    const finalAuras: { range: number; isBuff: boolean }[] = [];
                    if (ar && ar.length) {
                        for (let i = 0; i < ar.length; i++) {
                            if (ar[i] > 0) {
                                finalAuras.push({
                                    range: ar[i] + fightProps.getAdditionalAuraRangePerTeam(targetUnit.getTeam()),
                                    isBuff: ab && i < ab.length ? ab[i] : true,
                                });
                            }
                        }
                    }
                    if (finalAuras.length > 0) {
                        this.sc_hoveredAuraRanges = {
                            xy: targetUnit.getVisualCenter(this.sc_sceneSettings.getGridSettings()),
                            auraRanges: finalAuras,
                            isSmall: targetUnit.isSmallSize(),
                        };
                    } else {
                        this.sc_hoveredAuraRanges = undefined;
                    }
                } else {
                    this.sc_hoveredAuraRanges = undefined;
                }
            } else {
                this.sc_hoveredShotRange = undefined;
                this.sc_hoveredAuraRanges = undefined;
            }
        } else {
            this.sc_hoveredShotRange = undefined;
            this.sc_hoveredAuraRanges = undefined;
        }

        // --- 2. Movement Visualization (Placement Phase) ---
        if (!fightProps.hasFightStarted()) {
            if (targetUnit && targetUnit.canMove()) {
                const pos = targetUnit.getPosition();
                const cell = GridMath.getCellForPosition(this.sc_sceneSettings.getGridSettings(), pos);
                if (cell) {
                    const key = {
                        unitId: targetUnit.getId(),
                        x: cell.x,
                        y: cell.y,
                        steps: targetUnit.getSteps(),
                        layoutVersion: this.layoutVersion,
                    };

                    // Optimization: If nothing changed for this unit's path, reuse last calculation
                    if (
                        !this.sc_lastCalcRef ||
                        this.sc_lastCalcRef.unitId !== key.unitId ||
                        this.sc_lastCalcRef.x !== key.x ||
                        this.sc_lastCalcRef.y !== key.y ||
                        this.sc_lastCalcRef.steps !== key.steps ||
                        this.sc_lastCalcRef.layoutVersion !== key.layoutVersion
                    ) {
                        const tempMatrix = this.gridMatrix.map((row) => [...row]);
                        const size = targetUnit.isSmallSize() ? 1 : 2;
                        const gsVal = this.sc_sceneSettings.getGridSettings().getGridSize();
                        for (let i = 0; i < size; i++) {
                            for (let j = 0; j < size; j++) {
                                const cx = cell.x + i;
                                const cy = cell.y + j;
                                if (cx >= 0 && cx < gsVal && cy >= 0 && cy < gsVal) {
                                    tempMatrix[cx][cy] = 0; // Treat self footprint as free for pathfinding starts
                                }
                            }
                        }

                        const movePath = this.pathHelper.getMovePath(
                            cell,
                            tempMatrix,
                            targetUnit.getSteps(),
                            this.grid.getAggrMatrixByTeam(targetUnit.getOppositeTeam()),
                            targetUnit.canFly(),
                            targetUnit.isSmallSize(),
                            targetUnit.hasAbilityActive("Made of Fire"),
                        );
                        this.sc_placementMoveRange = movePath.cells;
                        this.sc_lastCalcRef = key;
                    }
                } else {
                    this.sc_placementMoveRange = undefined;
                    this.sc_lastCalcRef = undefined;
                }
            } else {
                this.sc_placementMoveRange = undefined;
                this.sc_lastCalcRef = undefined;
            }
        }
    }
    public override MouseMove(p: HoCMath.XY, leftDrag: boolean): void {
        super.MouseMove(p, leftDrag);
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.hasFightStarted()) {
            this.hoverManager.hoverPlacementCell = undefined;
            this.hoverManager.hoverPlacementCellTeam = undefined;
        }
    }
    public override Deselect(_onlyWhenNotStarted = false, _refreshStats = true): void {
        // ESC routes here (HandleEscapeKey -> Deselect); also close the spellbook and drop its
        // overlays. closeSpellBook() is a no-op when the book isn't open.
        this.closeSpellBook();
        super.Deselect(_onlyWhenNotStarted, _refreshStats);
        if (this.selectedBoardUnit) {
            this.selectedBoardUnit.setBoardSelected(false);
            this.selectedBoardUnit = undefined;
        }
        this.currentShiftedUnit = undefined;
        this.hasActiveSelection = false;
        this.selectionFromOverlay = false;
        this.draggingUnitId = undefined;
        this.draggingUnitTeam = undefined;
        this.hoverManager.hoverPlacementCell = undefined;
        this.hoverManager.hoverPlacementCellTeam = undefined;
        this.hoverManager.hoverSelectedCells = undefined;
        this.hoverManager.hoverSelectedCellsSwitchToRed = false;
        this.hoverManager.hoveredUnitHighlight = undefined;
        this.hoverManager.resetBoardHoverState();
        this.hoverManager.resetHover(false);
        this.hoverManager.clear();
        this.sc_hoveredAuraRanges = undefined;
        this.sc_hoveredShotRange = undefined;
    }
    protected updateUnitsOverlayVisibility(): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const started = fightProps.hasFightStarted();
        if (this.unitsOverlay?.container) {
            this.unitsOverlay.container.visible = !started && !this.sc_gameActionTransport;
        }
        if (started) {
            this.unitsOverlay.clearSelection(true);
            this.hasActiveSelection = false;
            this.selectionFromOverlay = false;
            this.sc_selectedUnitProperties = undefined;
            this.hoverManager.clearHoverSilhouette();
            this.hoverManager.hoverSelectedCells = undefined;
            this.hoverManager.hoverSelectedCellsSwitchToRed = false;
        }
    }
    public override startScene() {
        const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
        const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
        if (!lowerLeftPlacement || !upperRightPlacement) {
            return false;
        }

        // Add keyboard listeners for Alt key
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);

        if (
            this.unitsHolder.getAllAlliesPlaced(
                TeamVals.LOWER,
                lowerLeftPlacement,
                upperRightPlacement,
                this.getPlacement(TeamVals.LOWER, 1),
                this.getPlacement(TeamVals.UPPER, 1),
            ).length &&
            this.unitsHolder.getAllAlliesPlaced(
                TeamVals.UPPER,
                lowerLeftPlacement,
                upperRightPlacement,
                this.getPlacement(TeamVals.LOWER, 1),
                this.getPlacement(TeamVals.UPPER, 1),
            ).length
        ) {
            this.sc_buttonGroupUpdated = true;
            // Snapshot the exact roster + positions BEFORE the supply bump, so "Rematch"
            // can recreate the identical fight (supply is re-applied on the next startScene).
            this.lastFightSnapshot = this.captureFightSnapshot();
            this.hasInitializedLap = false;
            const action: GameAction = { type: "start_fight" };
            const unitSnapshot = this.snapshotRenderableUnits();
            const startResult = this.createActionEngine().apply(action);
            if (!startResult.completed) {
                this.sc_sceneLog.updateLog(startResult.message ?? "Cannot start fight");
                return false;
            }
            this.applyTurnEngineEvents(startResult.events, unitSnapshot);

            // Reset the previous fight's accumulated stats. This matters on Rematch, where
            // the scene + attack handler are reused (New Battle gets fresh ones via LoadGame).
            // The holder is exposed as the shared IStatisticHolder interface, so cast to the
            // concrete client type that has clear().
            (this.attackHandler.getDamageStatisticHolder() as DamageStatisticHolder).clear();
            this.sc_sceneLog.clear();
            this.sc_damageStatsUpdateNeeded = true;

            // Snapshot the starting roster so we can chart casualties over the fight.
            this.fightStatsTracker.start(this.unitsHolder.getAllUnits().values());
            this.refreshVisibleStateIfNeeded();
            this.updateLiveFightStats();

            return super.startScene();
        }
        return false;
    }
    public override Destroy(): void {
        super.Destroy();
        // Floating damage numbers are parented to the shared worldRoot; destroy them so
        // they don't linger after the scene is replaced (e.g. on "New Battle").
        this.combatVisuals?.clear();
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
    }
    private handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight") {
            const fightProps = FightStateManager.getInstance().getFightProperties();
            if (!fightProps.hasFightStarted()) {
                this.unitsOverlay.setShowAllAmounts(true);
            }
        }
    };
    private handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === "Alt") {
            this.unitsOverlay.setShowAllAmounts(false);
        }
    };
    // --- Animation State ---
    private ensureGameplayGraphics(): void {
        if (!this.gameplayGraphics) this.gameplayGraphics = new Graphics();
        this.attachToWorldRoot(this.gameplayGraphics, 55); // Above terrain, below units
    }
    private hasAnySceneUnits(): boolean {
        return this.unitsHolder.getAllUnits().size > 0;
    }
    private recoverEmptyStartedFightState(): void {
        FightStateManager.getInstance().reset();
        const fightProps = FightStateManager.getInstance().getFightProperties();
        fightProps.setDefaultPlacementPerTeam(TeamVals.LOWER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        fightProps.setDefaultPlacementPerTeam(TeamVals.UPPER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);

        this.currentActiveUnit = undefined;
        this.currentActiveSpell = undefined;
        this.cleanActivePaths();
        this.hoverManager.clear();
        this.sc_moveBlocked = false;

        if (this.sc_visibleState) {
            this.sc_visibleState.hasFinished = false;
            this.sc_visibleState.teamWin = undefined;
            this.sc_visibleState.fightStats = undefined;
            this.sc_visibleState.teamTypeTurn = undefined;
            this.sc_visibleState.lapNumber = 0;
            this.sc_visibleState.upNext = [];
            this.sc_visibleStateUpdateNeeded = true;
        }

        this.sc_onHasStarted.emit(false);
    }
    public override Step(timeStep: number): void {
        this.cleanupDeadUnits();
        if (timeStep > 0) this.sc_stepCount.increment();
        this.sc_isAnimating = this.isAnimating();
        const fightStateManager = FightStateManager.getInstance();
        const fightProps = fightStateManager.getFightProperties();
        const fightStarted = fightProps.hasFightStarted();

        if (fightStarted && !this.hasAnySceneUnits()) {
            this.recoverEmptyStartedFightState();
            return;
        }

        // AI section - delegate to AIController
        if (
            fightStarted &&
            !this.replayPlaybackActive &&
            this.currentActiveUnit &&
            this.aiController.shouldTriggerAI()
        ) {
            this.aiController.triggerAIAction(1500);
        }

        // Debug grid overlay: draw the cell grid once so attack trajectories / cell coverage are visible.
        if (!this.gridDebugRendered) {
            this.drawer.drawGrid();
            this.gridDebugRendered = true;
        }

        if (this.dungeonVisuals) {
            this.dungeonVisuals.update(timeStep);
        }
        if (this.combatVisuals) {
            this.combatVisuals.update(timeStep);
        }
        this.updateScreenShake(timeStep);
        if (this.rangedProjectiles) {
            this.rangedProjectiles.update(timeStep);
        }

        // 1. Update Visual Overlays
        if (fightStarted) {
            this.unitsOverlay?.destroy();
            this.placementGraphics?.clear();
        }

        // 2. Background & Static Elements
        this.ensureBackgroundSprite();
        this.layoutBackgroundSquare();
        this.ensureCenterTerrainSprite();
        this.ensurePlacementGraphicsWorld();
        this.ensureGameplayGraphics();
        this.spawnPulsePhase += timeStep * 1.85;
        setSpawnFlowPhase(this.spawnPulsePhase);
        this.hoverGlowPhase += timeStep * ((Math.PI * 2) / 2.5);
        if (this.hoverGlowPhase > Math.PI * 2) this.hoverGlowPhase -= Math.PI * 2;

        // 3. Clear dynamic graphics every frame
        this.gameplayGraphics?.clear();

        // ==========================================================================================
        // CORE GAME LOGIC
        // ==========================================================================================
        if (fightStarted) {
            // Atmosphere Transition & Animation
            if (this.atmosphereAlpha < 1 || this.dungeonVisuals.hasAtmosphereLights()) {
                // Fade In
                if (this.atmosphereAlpha < 1) {
                    this.atmosphereAlpha += timeStep / 3;
                    if (this.atmosphereAlpha > 1) this.atmosphereAlpha = 1;
                    this.updateDungeonAtmosphere(true, this.atmosphereAlpha);
                }

                // Fire flicker (driven by the actual DungeonVisuals lights).
                this.dungeonVisuals.updateAtmosphereFlicker(HoCLib.getTimeMillis() / 1000);
            }

            this.cleanupDeadUnits();
            if (this.fightStatsTracker.sample(this.unitsHolder.getAllUnits().values(), fightProps.getCurrentLap())) {
                this.updateLiveFightStats();
            }
            this.hoverManager.setLastPlacement(undefined);

            // --- A. TURN TIMER LOGIC ---
            if (
                !this.sc_gameActionTransport &&
                !this.replayPlaybackActive &&
                HoCLib.getTimeMillis() >= fightProps.getCurrentTurnEnd()
            ) {
                this.finishTurn(false, "timeout");
            }

            if (this.cellToUnitPreRound) {
                this.cellToUnitPreRound = undefined;
            }

            // --- B. WIN CONDITION & NEXT UNIT SELECTION ---
            if (!this.replayPlaybackActive) {
                this.advanceAfterNoActiveUnitIfNeeded();
            }

            // --- Movement animation + ground-track fade ---
            // Always step: this advances the travel animation while a unit is moving, and keeps
            // fading the lingering ground tracks afterwards. Gating it on isMoving() froze the
            // tracks on screen forever once the move finished.
            this.stepMoveAnimation(timeStep);
            const lingeringTracks = this.moveAnimManager.getLingeringTracks();
            // Ground units kick up dust; flying units displace air into wind.
            this.smokeLayer?.update(
                timeStep,
                lingeringTracks.filter((t) => !t.flying),
            );
            this.windLayer?.update(
                timeStep,
                lingeringTracks.filter((t) => t.flying),
            );
            this.lightingLayer?.update(timeStep);

            // --- C. AI LOGIC - delegate to AIController ---
            if (
                this.currentActiveUnit &&
                !this.replayPlaybackActive &&
                this.aiController.shouldTriggerAI() &&
                !this.sc_isAnimating &&
                !this.moveAnimManager.isMoving()
            ) {
                this.aiController.triggerAIAction(2000);
            }
        } else {
            // Pre-fight logic
            this.checkStartCondition();
            this.hoverManager.update(timeStep);
            if (this.hasActiveSelection && this.sc_selectedUnitProperties && this.sc_mouseWorld) {
                this.hoverManager.updateHoverPlacementCell(this.sc_mouseWorld);
            }
            if (this.placementGraphics) {
                this.drawPlacements();
            }
        }

        // ==========================================================================================
        // RENDERING SYNCHRONIZATION
        // ==========================================================================================
        // this.updateLingeringTracks(timeStep); // Handled by moveAnimManager.update
        if (this.gameplayGraphics) {
            this.drawGameplayVisuals(this.gameplayGraphics);
        }

        // Suppress the active-unit aura while the active unit is mid-move or mid-attack so the
        // action reads clearly; the aura returns as soon as it's idle again.
        if (this.currentActiveUnit) {
            this.currentActiveUnit.setSuppressActiveAura(this.isActiveUnitMoving || this.sc_isAnimating);
        }

        for (const unit of this.unitsHolder.getAllUnits().values()) {
            const rUnit = unit as RenderableUnit;
            // Use PixiDrawer's unit container (Z=1000), not worldRoot directly.
            // This ensures units are ALWAYS above terrain (Z=20) and overlay (Z=60) but depth sorted inside.
            rUnit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
            if (this.isActiveUnitMoving && this.moveAnimManager.getMovingUnit() === rUnit) {
                rUnit.applyMoveEffect(this.spawnPulsePhase);
            } else {
                rUnit.stepSpawnAnimation(timeStep);
            }
        }

        // Update SpellBook
        if (this.spellBookContainer) {
            this.spellBookContainer.visible = !!this.sc_renderSpellBookOverlay;
        }
        if (this.sc_renderSpellBookOverlay && this.spellBookOverlay && this.currentActiveUnit) {
            for (const unit of this.unitsHolder.getAllUnits().values()) {
                const rUnit = unit as RenderableUnit;
                if (rUnit !== this.currentActiveUnit) {
                    rUnit.hideSpells();
                }
            }
            this.spellBookOverlay.render(this.currentActiveUnit);
        }
    }
    private drawGameplayVisuals(g: Graphics): void {
        let sidebarUnitRanges:
            | {
                  xy: HoCMath.XY;
                  attackRange: number;
                  auraRanges: { range: number; isBuff: boolean }[];
                  isSmall: boolean;
              }
            | undefined;

        if (this.selectedBoardUnit) {
            const u = this.selectedBoardUnit;
            if (u === this.currentActiveUnit) {
                // If the selected board unit IS the current active unit, we rely on standard active unit visuals?
                // Or maybe we want to force sidebar visuals too?
            } else {
                // If the selected unit is also the hovered unit OR shift-selected, we want the "Interactive/Yellow" ring to take precedence.
                // So we suppress the "Sidebar/Blue" ring by setting attackRange to 0 here.
                const isHovered = this.hoverManager.hoveredUnitId === u.getId();
                const isShifted = this.currentShiftedUnit?.getId() === u.getId();
                // Restore Aura Range logic
                const ar = u.getAuraRanges();
                const ab = u.getAuraIsBuff();
                const fightProps = FightStateManager.getInstance().getFightProperties();
                const auraRanges =
                    ar && ar.length > 0
                        ? ar
                              .map((range, i) => ({
                                  range: range + fightProps.getAdditionalAuraRangePerTeam(u.getTeam()),
                                  isBuff: ab && i < ab.length ? ab[i] : true,
                              }))
                              .filter((a) => a.range > 0)
                        : [];

                sidebarUnitRanges = {
                    xy: u.getPosition(),
                    attackRange:
                        !isHovered && !isShifted && u.getAttackType() === AttackVals.RANGE && u.getRangeShots() > 0
                            ? (() => {
                                  if (u.hasAbilityActive("Sniper")) {
                                      u.setRangeShotDistance(
                                          Number(
                                              (
                                                  GridMath.getDistanceToFurthestCorner(
                                                      u.getPosition(),
                                                      this.sc_sceneSettings.getGridSettings(),
                                                  ) /
                                                      this.sc_sceneSettings.getGridSettings().getStep() -
                                                  0.45
                                              ).toFixed(2),
                                          ),
                                      );
                                  }
                                  return u.getRangeShotDistance() * GridConstants.STEP;
                              })()
                            : 0,
                    auraRanges,
                    isSmall: u.isSmallSize(),
                };
            }
        }

        // Calculate shift-selected range
        let shiftSelectedShotRange: { xy: HoCMath.XY; distance: number } | undefined;
        if (this.currentShiftedUnit?.getAttackType() === AttackVals.RANGE) {
            const dist = this.currentShiftedUnit.getRangeShotDistance();
            if (dist > 0) {
                shiftSelectedShotRange = {
                    xy: this.currentShiftedUnit.getPosition(),
                    distance: dist * GridConstants.STEP,
                };
            }
        }

        const fightProps = FightStateManager.getInstance().getFightProperties();
        const currentActiveShotRange = this.sc_currentActiveShotRange;

        SandboxDrawer.drawGameplayVisuals(g, {
            fightProps,
            currentActiveShotRange,
            shiftSelectedShotRange,
            hoveredShotRange: this.sc_hoveredShotRange,
            isActiveUnitMoving: this.isActiveUnitMoving,
            gridSettings: this.sc_sceneSettings.getGridSettings(),
            hoverGlowPhase: this.hoverGlowPhase,
            currentActivePath: this.currentActivePath,
            sc_isAnimating: this.sc_isAnimating,
            currentActiveUnit: this.currentActiveUnit,
            hoverManager: this.hoverManager,
            sidebarUnitRanges,
            hoveredAuraRanges: this.sc_hoveredAuraRanges,
            lingeringTracks: this.moveAnimManager.getLingeringTracks(),
            hoveredMoveRange: this.sc_placementMoveRange,
        });
    }
    private snapshotRenderableUnits(): Map<string, RenderableUnit> {
        const snapshot = new Map<string, RenderableUnit>();
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            snapshot.set(unit.getId(), unit as RenderableUnit);
        }
        return snapshot;
    }
    private createTurnEngine(): TurnEngine {
        const context = {
            fightProperties: FightStateManager.getInstance().getFightProperties(),
            grid: this.grid,
            unitsHolder: this.unitsHolder,
            moveHandler: this.moveHandler,
            sceneLog: this.sc_sceneLog,
            canLandRangeAttack: (unit: Unit) => this.canLandRangeAttack(unit),
        } satisfies ConstructorParameters<typeof TurnEngine>[0] & { canLandRangeAttack?: (unit: Unit) => boolean };
        return new TurnEngine(context);
    }
    protected createActionEngine(): SceneActionEngine {
        const context = {
            fightProperties: FightStateManager.getInstance().getFightProperties(),
            grid: this.grid,
            unitsHolder: this.unitsHolder,
            moveHandler: this.moveHandler,
            sceneLog: this.sc_sceneLog,
            attackHandler: this.attackHandler,
            canLandRangeAttack: (unit: Unit) => this.canLandRangeAttack(unit),
            getCurrentActiveUnitId: () => this.currentActiveUnit?.getId(),
            getCurrentActiveKnownPaths: () => this.currentActiveKnownPaths,
            getCurrentEnemiesCellsWithinMovementRange: () => this.currentEnemiesCellsWithinMovementRange,
            createSummonedUnit: ({ team, faction, unitName, amount }) =>
                this.createSummonedRenderableUnit(team, faction, unitName, amount),
            canPlaceUnit: (unit, cells, action) => this.canPlaceUnitWithCommonRules(unit, cells, action),
            canSplitUnit: (unit) => this.canSplitUnitWithCommonRules(unit),
            createSplitUnit: (unit, amount) => this.createSplitRenderableUnit(unit, amount),
        } satisfies ConstructorParameters<typeof GameActionEngine>[0] & {
            canLandRangeAttack?: (unit: Unit) => boolean;
        };
        const engine = new GameActionEngine(context);
        return this.createReplayRecordingActionEngine(engine);
    }
    protected shouldDeferActionToAuthoritativeReplay(_action: GameAction): boolean {
        return false;
    }
    protected isPlayingAuthoritativeReplay(): boolean {
        return this.replayPlaybackActive;
    }
    private submitActionForAuthoritativeReplay(action: GameAction): boolean {
        const result = this.createActionEngine().apply(action);
        if (!result.completed) {
            this.sc_moveBlocked = false;
            this.sc_sceneLog.updateLog(result.message ?? result.rejectionReason ?? "Action rejected");
            return false;
        }
        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.currentActivePathHashes = undefined;
        this.hoverManager.clearHoverSilhouette();
        this.hoverManager.clearAttackVisuals();
        this.hoverManager.hoverAttackFromCell = undefined;
        this.sc_moveBlocked = false;
        this.sc_visibleStateUpdateNeeded = true;
        return true;
    }
    private canLandRangeAttack(unit: Unit): boolean {
        return (
            this.attackHandler?.canLandRangeAttack(unit, this.grid.getEnemyAggrMatrixByUnitId(unit.getId())) ?? false
        );
    }
    private createReplayRecordingActionEngine(engine: SceneActionEngine): SceneActionEngine {
        return {
            apply: (action: GameAction) => {
                const shouldRecord = !this.replayRecordingSuspended;
                if (shouldRecord) {
                    this.replayRecorder.beginAction();
                }

                const result = engine.apply(action);
                if (shouldRecord && result.completed) {
                    this.pendingReplayRecords.push({
                        action: cloneReplayData(action),
                        result: {
                            ...result,
                            events: cloneReplayData(result.events),
                        },
                    });
                }
                return result;
            },
        };
    }
    private flushPendingReplayRecords(): void {
        if (this.replayRecordingSuspended) {
            this.pendingReplayRecords = [];
            return;
        }

        const records = this.pendingReplayRecords.splice(0);
        for (const record of records) {
            this.replayRecorder.recordAction(record.action, record.result);
        }
    }
    private canPlaceUnitWithCommonRules(
        unit: Unit,
        cells: HoCMath.XY[],
        action: Extract<GameAction, { type: "place_unit" }>,
    ): boolean {
        const teamAllowedHashes = this.placementManager.getAllowedPlacementCellHashesForTeam(action.team);
        if (!teamAllowedHashes || cells.some((cell) => !teamAllowedHashes.has((cell.x << 4) | cell.y))) {
            return false;
        }

        const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
        const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
        if (!lowerLeftPlacement || !upperRightPlacement) {
            return false;
        }

        const unitAlreadyPlaced = unit.getCells().some((cell) => this.grid.getOccupantUnitId(cell) === unit.getId());
        if (unitAlreadyPlaced) {
            return true;
        }

        const lowerRightPlacement = this.getPlacement(TeamVals.LOWER, 1);
        const upperLeftPlacement = this.getPlacement(TeamVals.UPPER, 1);
        const alliesPlacedCount = this.unitsHolder
            .getAllAlliesPlaced(
                action.team,
                lowerLeftPlacement,
                upperRightPlacement,
                lowerRightPlacement,
                upperLeftPlacement,
            )
            .filter((ally) => ally.getId() !== unit.getId()).length;
        return (
            alliesPlacedCount <
            FightStateManager.getInstance().getFightProperties().getNumberOfUnitsAvailableForPlacement(action.team)
        );
    }
    private canSplitUnitWithCommonRules(unit: Unit): boolean {
        const maxUnits = FightStateManager.getInstance()
            .getFightProperties()
            .getNumberOfUnitsAvailableForPlacement(unit.getTeam());
        const currentUnits = Array.from(this.unitsHolder.getAllUnits().values()).filter(
            (candidate) => candidate.getTeam() === unit.getTeam() && !candidate.isDead(),
        ).length;
        return currentUnits < maxUnits;
    }
    private applyGameAction(action: GameAction): boolean {
        const unitSnapshot = this.snapshotRenderableUnits();
        const result = this.createActionEngine().apply(action);
        this.applyTurnEngineEvents(result.events, unitSnapshot);
        return result.completed;
    }
    private applyTurnEngineEvents(events: GameEvent[], unitSnapshot: ReadonlyMap<string, RenderableUnit>): void {
        const armageddonWaves = new Set<number>();
        let shouldRefreshVisibleState = false;
        let sawFightFinished = false;
        const activeUnitIdAtStart = this.currentActiveUnit?.getId();

        for (const event of events) {
            switch (event.type) {
                case "fight_started":
                    shouldRefreshVisibleState = true;
                    break;
                case "lap_initialized":
                case "lap_flipped":
                    this.hasInitializedLap = true;
                    shouldRefreshVisibleState = true;
                    break;
                case "center_dried":
                    this.dungeonVisuals.setCenterDried(true);
                    this.gridMatrix = this.grid.getMatrix();
                    this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
                    shouldRefreshVisibleState = true;
                    break;
                case "center_obstacle_cleared":
                    this.drawer.switchToDryCenter();
                    this.drawer.setGridType(GridVals.NORMAL);
                    this.gridMatrix = this.grid.getMatrix();
                    this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
                    shouldRefreshVisibleState = true;
                    break;
                case "narrowing_applied":
                    this.renderNarrowingLayers(event.layers);
                    this.gridMatrix = this.grid.getMatrix();
                    this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
                    shouldRefreshVisibleState = true;
                    break;
                case "unit_moved_by_system":
                    this.syncSystemMovedUnit(event.unitId, event.position, unitSnapshot);
                    break;
                case "unit_summoned":
                    this.syncSummonedUnit(event);
                    shouldRefreshVisibleState = true;
                    break;
                case "unit_destroyed":
                    this.destroyEventDeletedUnit(event.unitId, unitSnapshot);
                    shouldRefreshVisibleState = true;
                    break;
                case "unit_resurrected":
                    this.syncResurrectedUnit(event, unitSnapshot);
                    shouldRefreshVisibleState = true;
                    break;
                case "armageddon_applied": {
                    const unit = unitSnapshot.get(event.unitId);
                    if (unit) {
                        this.combatVisuals.showFloatingDamage(unit.getPosition(), event.damage);
                    }
                    if (!armageddonWaves.has(event.wave)) {
                        armageddonWaves.add(event.wave);
                        this.triggerScreenShake(12 + event.wave * 3, 0.5);
                    }
                    break;
                }
                case "turn_completed":
                    if (this.currentActiveUnit?.getId() === event.unitId || activeUnitIdAtStart === event.unitId) {
                        this.finishTurnVisualState(event.hourglass);
                    }
                    shouldRefreshVisibleState = true;
                    break;
                case "fight_finished":
                    sawFightFinished = true;
                    this.finishFight(event.winningTeam, { mechanicsAlreadyApplied: true });
                    shouldRefreshVisibleState = true;
                    break;
                case "morale_applied":
                case "unit_skipped":
                case "unit_waited":
                case "unit_defended":
                case "attack_type_selected":
                case "unit_moved":
                case "unit_placed":
                case "unit_split":
                case "unit_attacked":
                case "obstacle_attacked":
                case "area_attacked":
                case "spell_cast":
                case "next_unit_selected":
                    shouldRefreshVisibleState = true;
                    break;
                case "unit_deleted":
                    this.destroyEventDeletedUnit(event.unitId, unitSnapshot);
                    shouldRefreshVisibleState = true;
                    break;
            }
        }

        if (shouldRefreshVisibleState) {
            this.refreshVisibleStateIfNeeded(true);
            if (!sawFightFinished) {
                this.updateLiveFightStats();
            }
        }
        this.flushPendingReplayRecords();
    }
    private renderNarrowingLayers(layers: number): void {
        this.attachToWorldRoot(this.dungeonVisuals.getHoleContainer(), 20);
        for (let layer = 1; layer <= layers; layer++) {
            if (this.drawnNarrowingLaps.has(layer)) {
                continue;
            }
            this.dungeonVisuals.spawnHoleLayer(layer);
            this.occupyNarrowingLayer(layer);
            this.drawnNarrowingLaps.add(layer);
            this.moveFiresInward(layer);
        }
    }
    private occupyNarrowingLayer(layer: number): void {
        const gs = this.grid.getSettings();
        const minCellX = gs.getMinX() / gs.getCellSize();
        const maxCellX = gs.getMaxX() / gs.getCellSize();
        const minCellY = gs.getMinY() / gs.getCellSize();
        const maxCellY = gs.getMaxY() / gs.getCellSize();
        const offset = layer - 1;

        for (let i = minCellX + offset; i < maxCellX - offset; i++) {
            this.grid.occupyByHole({ x: i + maxCellX, y: offset });
            this.grid.occupyByHole({ x: i + maxCellX, y: maxCellY - layer });
        }
        for (let i = minCellY + offset; i < maxCellY - offset; i++) {
            this.grid.occupyByHole({ x: offset, y: i });
            this.grid.occupyByHole({ x: (maxCellX << 1) - layer, y: i });
        }
    }
    private syncSystemMovedUnit(
        unitId: string,
        position: HoCMath.XY,
        unitSnapshot: ReadonlyMap<string, RenderableUnit>,
    ): void {
        const unit =
            (this.unitsHolder.getAllUnits().get(unitId) as RenderableUnit | undefined) ?? unitSnapshot.get(unitId);
        if (!unit) {
            return;
        }
        unit.setPosition(position.x, position.y);
        unit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
    }
    private syncSummonedUnit(event: Extract<GameEvent, { type: "unit_summoned" }>): void {
        const unit = this.unitsHolder.getAllUnits().get(event.unitId) as RenderableUnit | undefined;
        if (!unit) {
            return;
        }

        this.layoutVersion++;
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        unit.setPosition(event.position.x, event.position.y);
        if (unit.getSpellsCount() > 0) {
            this.ensureDigitTextures();
            if (this.digitTextures) {
                unit.setSpellBookLayer(this.spellBookContainer, this.digitTextures);
            }
        }
        const scale = unit.ensureVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
        if (!event.merged && scale) {
            unit.startSpawnAnimation(scale);
        } else {
            unit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
        }
        this.refreshUnits();
    }
    private destroyEventDeletedUnit(unitId: string, unitSnapshot: ReadonlyMap<string, RenderableUnit>): void {
        const unit = unitSnapshot.get(unitId);
        if (!unit) {
            return;
        }

        // "Broken mirror" shatter from the unit's current sprite before tearing it down.
        const shatterInfo = unit.getShatterInfo();
        if (shatterInfo) {
            this.combatVisuals?.spawnShatter(shatterInfo);
        }

        this.layoutVersion++;
        unit.destroyVisuals();
        if (this.selectedBoardUnit === unit) {
            this.selectedBoardUnit = undefined;
        }
        if (this.currentShiftedUnit === unit) {
            this.currentShiftedUnit = undefined;
        }
        if (this.currentActiveUnit === unit) {
            this.currentActiveUnit = undefined;
        }
    }
    private syncResurrectedUnit(
        event: Extract<GameEvent, { type: "unit_resurrected" }>,
        unitSnapshot: ReadonlyMap<string, RenderableUnit>,
    ): void {
        const unit =
            (this.unitsHolder.getAllUnits().get(event.unitId) as RenderableUnit | undefined) ??
            unitSnapshot.get(event.unitId);
        if (!unit) {
            return;
        }

        unit.setPosition(event.position.x, event.position.y);
        unit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
        unit.playOneShotAnimation("death", () => {
            unit.setVisualGhost(true);
            setTimeout(() => {
                const currentScale = unit.getCurrentVisualScale();
                unit.setVisualGhost(false);
                unit.startSpawnAnimation(currentScale);
            }, 2500);
        });
    }
    /**
     * Override the UpNext turn queue. Sandbox returns undefined so the engine-maintained
     * fightProperties queue is used. Ranked (snapshot-driven, no local turn loop) overrides
     * this to supply the authoritative queue from the server snapshot.
     */
    protected getUpNextUnitIds(): string[] | undefined {
        return undefined;
    }
    protected syncAuthoritativeActiveUnit(currentUnitId: string | undefined, lapNumber?: number): void {
        if (!currentUnitId) {
            return;
        }

        const activeUnit = this.unitsHolder.getAllUnits().get(currentUnitId) as RenderableUnit | undefined;
        if (!activeUnit || activeUnit.isDead()) {
            return;
        }

        this.handleNextUnitActivation(activeUnit);
        if (this.sc_visibleState && lapNumber !== undefined) {
            this.sc_visibleState.lapNumber = Math.max(lapNumber || 0, 0);
            this.sc_visibleStateUpdateNeeded = true;
        }
    }
    private handleNextUnitActivation(nextUnit: RenderableUnit): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const gs = this.sc_sceneSettings.getGridSettings();
        const worldRoot = this.drawer.getUnitsContainer();

        // Clear Shifted Unit override so UI reverts to Active Unit
        this.currentShiftedUnit = undefined;

        if (this.currentActiveUnit) {
            this.currentActiveUnit.setActiveTurn(false);
            this.currentActiveUnit.syncVisual(worldRoot, gs);
        }
        this.currentActiveUnit = nextUnit;
        nextUnit.setActiveTurn(true);
        nextUnit.syncVisual(worldRoot, gs);

        const unitsNext: IVisibleUnit[] = [];
        const seenUnitIds = new Set<string>([nextUnit.getId()]);
        const upNextOverride = this.getUpNextUnitIds();
        const upNextQueue =
            upNextOverride ?? FightStateManager.getInstance().getFightProperties().getUpNextQueueIterable();
        for (const unitIdNext of upNextQueue) {
            if (seenUnitIds.has(unitIdNext)) continue;
            seenUnitIds.add(unitIdNext);
            const unitNext = this.unitsHolder.getAllUnits().get(unitIdNext);
            if (!unitNext) continue;
            unitsNext.unshift({
                id: unitNext.getId(),
                amount: unitNext.getAmountAlive(),
                smallTextureName: unitNext.getSmallTextureName(),
                name: unitNext.getName(),
                teamType: unitNext.getTeam(),
                isOnHourglass: unitNext.isOnHourglass(),
                isSkipping: unitNext.isSkippingThisTurn(),
                stackPower: unitNext.getStackPower(),
                isStackPowered: unitNext.getStackPower() > 0,
            });
        }
        if (nextUnit) {
            unitsNext.push({
                id: nextUnit.getId(),
                amount: nextUnit.getAmountAlive(),
                smallTextureName: nextUnit.getSmallTextureName(),
                name: nextUnit.getName(),
                teamType: nextUnit.getTeam(),
                isOnHourglass: nextUnit.isOnHourglass(),
                isSkipping: nextUnit.isSkippingThisTurn(),
                stackPower: nextUnit.getStackPower(),
                isStackPowered: nextUnit.getStackPower() > 0,
            });
        }
        if (this.sc_visibleState) {
            this.sc_visibleState.upNext = unitsNext;
            this.sc_visibleState.teamTypeTurn = nextUnit.getTeam();
            this.sc_visibleState.lapNumber = fightProps.hasFightStarted() ? fightProps.getCurrentLap() : 0;
            this.sc_visibleStateUpdateNeeded = true;
        }

        if (nextUnit.isSkippingThisTurn()) {
            return;
        }

        this.sc_moveBlocked = false;
        this.refreshUnits();
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        nextUnit.setBoardSelected(true);
        this.refreshVisibleStateIfNeeded();
        this.currentActiveUnit = nextUnit;
        this.buttonManager.setButtonsRefreshLocked(false);

        const props = nextUnit.getUnitProperties();
        this.sc_selectedUnitProperties = props;
        this.setSelectedUnitProperties(props);
        this.sc_unitPropertiesUpdateNeeded = true;

        const canLandRange =
            this.attackHandler?.canLandRangeAttack(nextUnit, this.grid.getEnemyAggrMatrixByUnitId(nextUnit.getId())) ??
            false;
        nextUnit.refreshPossibleAttackTypes(canLandRange);

        const currentCell = GridMath.getCellForPosition(
            this.sc_sceneSettings.getGridSettings(),
            nextUnit.getPosition(),
        );
        if (currentCell) {
            this.updateCurrentMovePath(currentCell);
        }

        const rangeShotCells = nextUnit.getRangeShotDistance();
        if (rangeShotCells > 0) {
            this.sc_currentActiveShotRange = {
                xy: nextUnit.getPosition(),
                distance: rangeShotCells * GridConstants.STEP,
            };
        } else {
            this.sc_currentActiveShotRange = undefined;
        }

        this.buttonManager.setButtonsRefreshLocked(false);
        this.buttonManager.refreshButtons(true);
    }
    /**
     * Start a screen shake (decaying random offset of the world root). Re-triggering while a
     * shake is in progress takes the stronger/longer of the two so waves don't cut each other off.
     */
    public triggerScreenShake(magnitude = 16, durationSeconds = 0.5): void {
        this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
        this.shakeDuration = Math.max(this.shakeDuration, durationSeconds);
        this.shakeTimeLeft = this.shakeDuration;
    }
    private updateScreenShake(timeStep: number): void {
        const worldRoot = this.pixiApp.getWorldRoot();
        // Undo the previous frame's offset first so the world's base position is preserved.
        worldRoot.x -= this.appliedShakeX;
        worldRoot.y -= this.appliedShakeY;
        this.appliedShakeX = 0;
        this.appliedShakeY = 0;
        if (this.shakeTimeLeft <= 0) {
            return;
        }
        this.shakeTimeLeft = Math.max(0, this.shakeTimeLeft - timeStep);
        const progress = this.shakeDuration > 0 ? this.shakeTimeLeft / this.shakeDuration : 0; // 1 -> 0
        const amplitude = this.shakeMagnitude * progress; // linear decay to zero
        const offsetX = (Math.random() * 2 - 1) * amplitude;
        const offsetY = (Math.random() * 2 - 1) * amplitude;
        worldRoot.x += offsetX;
        worldRoot.y += offsetY;
        this.appliedShakeX = offsetX;
        this.appliedShakeY = offsetY;
        if (this.shakeTimeLeft <= 0) {
            this.shakeMagnitude = 0;
            this.shakeDuration = 0;
        }
    }
    private drawPlacements(): void {
        SandboxDrawer.drawPlacements({
            fightProps: FightStateManager.getInstance().getFightProperties(),
            placementManager: this.placementManager,
            hoverManager: this.hoverManager,
            placementGraphics: this.placementGraphics,
        });
    }
    private checkStartCondition(): void {
        let lowerAllowed = false;
        let upperAllowed = false;
        if (!this.sc_renderSpellBookOverlay) {
            for (const u of this.unitsHolder.getAllUnitsIterator()) {
                if (
                    !upperAllowed &&
                    ((this.placementManager.getPlacement(TeamVals.UPPER, 0)?.isAllowed(u.getPosition()) ?? false) ||
                        (this.placementManager.getPlacement(TeamVals.UPPER, 1)?.isAllowed(u.getPosition()) ?? false))
                ) {
                    upperAllowed = true;
                }
                if (
                    !lowerAllowed &&
                    ((this.placementManager.getPlacement(TeamVals.LOWER, 0)?.isAllowed(u.getPosition()) ?? false) ||
                        (this.placementManager.getPlacement(TeamVals.LOWER, 1)?.isAllowed(u.getPosition()) ?? false))
                ) {
                    lowerAllowed = true;
                }
            }
        }
        if (lowerAllowed && upperAllowed) {
            if (this.sc_visibleState) {
                if (!this.sc_visibleState.canBeStarted) {
                    this.sc_visibleState.canBeStarted = true;
                    this.sc_visibleStateUpdateNeeded = true;
                }
            }
        } else {
            if (this.sc_visibleState) {
                if (this.sc_visibleState.canBeStarted) {
                    this.sc_visibleState.canBeStarted = false;
                    this.sc_visibleStateUpdateNeeded = true;
                }
            }
        }
        this.sc_onHasStarted.connect((started) => {
            // Trigger Dungeon Atmosphere
            // Trigger Dungeon Atmosphere
            this.updateDungeonAtmosphere(started, this.atmosphereAlpha);

            if (this.sc_visibleState) {
                this.sc_visibleState.canBeStarted = false;
                this.sc_visibleState.hasFinished = false;
                this.sc_visibleStateUpdateNeeded = true;
            }
            // If fight ended (started=false), ensure we reset
            if (!started) {
                // Clear state
                this.currentActiveUnit = undefined;
                this.currentActiveSpell = undefined;
                this.cleanActivePaths();
                this.hoverManager.clear();
            }
        });
    }
    public override getDamageStatisics(): IDamageStatistic[] {
        return this.attackHandler.getDamageStatisticHolder().get();
    }
    protected finishTurn = (isHourglass = false, skipReason?: "effect" | "timeout"): void => {
        if (!this.currentActiveUnit) {
            this.finishTurnVisualState(isHourglass);
            return;
        }

        const action: GameAction = isHourglass
            ? { type: "wait_turn", unitId: this.currentActiveUnit.getId() }
            : {
                  type: "end_turn",
                  unitId: this.currentActiveUnit.getId(),
                  reason: skipReason ?? "manual",
              };
        const unitSnapshot = this.snapshotRenderableUnits();
        const result = this.createActionEngine().apply(action);
        if (!result.completed) {
            this.sc_sceneLog.updateLog(result.message ?? `Cannot finish turn: ${result.rejectionReason ?? "unknown"}`);
            return;
        }
        this.applyTurnEngineEvents(result.events, unitSnapshot);
    };
    private finishTurnVisualState(_isHourglass = false): void {
        this.buttonManager.setButtonsRefreshLocked(true);
        this.sc_currentActiveShotRange = undefined;
        if (this.currentActiveUnit) {
            this.currentActiveUnit.setBoardSelected(false);
        }
        this.hoverRangeAttackDivisors = [];
        this.currentActiveSpell = undefined;
        this.currentEnemiesCellsWithinMovementRange = undefined;

        if (
            this.currentActiveUnit &&
            this.currentActiveUnit.refreshPossibleAttackTypes(
                this.attackHandler?.canLandRangeAttack(
                    this.currentActiveUnit,
                    this.grid.getEnemyAggrMatrixByUnitId(this.currentActiveUnit.getId()),
                ) ?? false,
            )
        ) {
            this.refreshUnits();
        }
        // Ensure visual state is reset (Orange Badge -> Default)
        this.currentActiveUnit?.setActiveTurn(false);
        const gs = this.sc_sceneSettings.getGridSettings();
        const worldRoot = this.drawer.getUnitsContainer();
        this.currentActiveUnit?.syncVisual(worldRoot, gs);
        this.currentActiveUnit = undefined;
        this.sc_selectedAttackType = AttackVals.NO_ATTACK;
        this.sc_renderSpellBookOverlay = false;
        this.sc_currentActiveShotRange = undefined;
        this.buttonManager.sc_renderSpellBookOverlay = false;
        this.spellBookOverlay?.setOpen(false);
        this.pixiApp.getWorldRoot().filters = [];
        this.buttonManager.refreshButtons(true);
    }
    protected cleanupDeadUnits(): void {
        const unitsToDestroy: RenderableUnit[] = [];
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            if (unit.getAmountAlive() <= 0) {
                unitsToDestroy.push(unit as RenderableUnit);
            }
        }
        if (unitsToDestroy.length > 0) {
            console.log(`Sandbox: cleanupDeadUnits found ${unitsToDestroy.length} dead units`);
            this.destroySpecificUnits(unitsToDestroy, true, true);
        }
    }
    /**
     * Push the current casualty stats into the visible state so the ALT "up next"
     * overlay can show the live chart/percentages mid-fight. Winner is NO_TEAM until
     * the fight actually ends (finishFight overwrites this with the real winner).
     */
    private updateLiveFightStats(): void {
        if (!this.sc_visibleState) return;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        this.sc_visibleState.fightStats = this.fightStatsTracker.buildReport(
            TeamVals.NO_TEAM,
            this.unitsHolder.getAllUnits().values(),
            fightProps.getCurrentLap(),
        );
        this.sc_visibleStateUpdateNeeded = true;
    }
    protected finishFight(teamWin: TeamType, opts: { mechanicsAlreadyApplied?: boolean } = {}): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        // Guard re-entry: the win-condition check runs every frame while there is no active unit,
        // so without marking the shared fight state finished we'd re-enter here and log
        // "Fight finished!" (and reset state) on every frame.
        if (opts.mechanicsAlreadyApplied && this.sc_visibleState?.hasFinished) {
            return;
        }
        if (fightProps.hasFightFinished() && !opts.mechanicsAlreadyApplied) {
            return;
        }
        if (!fightProps.hasFightFinished()) {
            fightProps.finishFight();
        }

        this.cleanupDeadUnits();
        this.selectedBoardUnit = undefined; // Force clear selection
        this.currentShiftedUnit = undefined;
        this.sc_currentActiveShotRange = undefined;
        this.sc_hoveredShotRange = undefined;
        this.hoverManager.clear();

        if (this.gameplayGraphics) this.gameplayGraphics.clear();

        // 3520 (approx)
        this.currentActiveUnit = undefined;
        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.sc_sceneLog.updateLog(`Fight finished! ${teamWin === TeamVals.LOWER ? "Green" : "Red"} team wins!`);
        this.refreshVisibleStateIfNeeded();
        if (this.sc_visibleState) {
            this.sc_visibleState.hasFinished = true;
            this.sc_visibleState.teamWin = teamWin;
            this.sc_visibleState.fightStats = this.fightStatsTracker.buildReport(
                teamWin,
                this.unitsHolder.getAllUnits().values(),
                fightProps.getCurrentLap(),
            );
            this.sc_visibleStateUpdateNeeded = true;
        }
        this.buttonManager.refreshButtons(true);
    }
    protected cleanActivePaths(): void {
        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.currentActivePathHashes = undefined;
    }
    // --- Tier 2 Asset Loading Feedback ---
    private assetsLoadedLogged = false;
    public override onBackgroundAssetLoad(progress: number): void {
        // Simple visual feedback: show a small progress bar in bottom right corner
        // or just log to console if UI is too complex.
        // Let's create/update a dedicated graphics object.
        if (!this.gameplayGraphics) return;

        // If complete, clear it
        if (progress >= 1.0) {
            if (!this.assetsLoadedLogged) {
                this.sc_sceneLog.updateLog("Animations fully loaded.");
                this.assetsLoadedLogged = true;
            }
            return;
        }

        // Use Scene Log for non-intrusive feedback
        // "Loading Animations: 45%"
        const pct = Math.floor(progress * 100);
        if (pct % 10 === 0) {
            this.sc_sceneLog.updateLog(`Loading Animations... ${pct}%`);
        }
    }
    protected verifyButtonsTrigger(): void {}
    protected updateCurrentMovePath(currentCell: HoCMath.XY): void {
        if (!this.currentActiveUnit || this.moveAnimManager.isMoving()) {
            return;
        }
        if (
            (this.currentActiveUnit.canMove() || this.currentActiveUnit.hasEffectActive("Paralysis")) &&
            this.currentActiveSpell?.getSpellTargetType() !== SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE
        ) {
            let movePath;
            if (this.currentActiveUnit.canMove()) {
                movePath = this.pathHelper.getMovePath(
                    currentCell,
                    this.gridMatrix,
                    this.currentActiveUnit.getSteps(),
                    this.grid.getAggrMatrixByTeam(this.currentActiveUnit.getOppositeTeam()),
                    this.currentActiveUnit.canFly(),
                    this.currentActiveUnit.isSmallSize(),
                    this.currentActiveUnit.hasAbilityActive("Made of Fire"),
                );
            } else {
                // Paralysis: Can't move, but treat as staying at current cell to allow attack targeting
                // Fix: Must use unit's base cell, not the cursor's currentCell, otherwise it thinks we teleported to cursor
                const unitCell = this.currentActiveUnit.getBaseCell();
                movePath = {
                    cells: [unitCell],
                    knownPaths: new Map<number, IWeightedRoute[]>(), // No paths to travel
                    hashes: new Set<number>([(unitCell.x << 4) | unitCell.y]),
                };
                // Explicitly valid "move" to self
                movePath.knownPaths.set((unitCell.x << 4) | unitCell.y, []);
            }

            this.currentActivePath = movePath.cells;
            this.currentActiveKnownPaths = movePath.knownPaths;
            this.currentActivePathHashes = movePath.hashes;

            if (this.currentActiveUnit) {
                const enemyTeam = this.unitsHolder.getAllEnemyUnits(this.currentActiveUnit.getTeam());
                const positions = new Map<string, HoCMath.XY>();
                for (const u of this.unitsHolder.getAllUnits().values()) {
                    positions.set(u.getId(), u.getPosition());
                }
                const adjacentEnemies = this.unitsHolder.allEnemiesAroundUnit(this.currentActiveUnit, false, undefined);

                // MAGIC attack type is spell-casting mode — it has no melee attack positions, so
                // skip the melee-target computation (keeps the move silhouette but drops the red
                // melee highlights / attack-from cells while casting).
                if (this.currentActiveUnit.getAttackTypeSelection() === AttackVals.MAGIC) {
                    this.canAttackByMeleeTargets = undefined;
                } else {
                    this.canAttackByMeleeTargets = this.currentActiveUnit.attackMeleeAllowed(
                        enemyTeam,
                        positions,
                        adjacentEnemies,
                        movePath.cells,
                        movePath.knownPaths,
                    );
                }

                this.canAttackByRangeTargets = undefined;
                // Range Attack Logic
                // We use attackHandler.canLandRangeAttack to check general ability (no range bane, no adjacent enemies block)
                // [Active Unit Sniper Check]
                if (this.currentActiveUnit.hasAbilityActive("Sniper")) {
                    this.currentActiveUnit.setRangeShotDistance(
                        Number(
                            (
                                GridMath.getDistanceToFurthestCorner(
                                    this.currentActiveUnit.getPosition(),
                                    this.sc_sceneSettings.getGridSettings(),
                                ) /
                                    this.sc_sceneSettings.getGridSettings().getStep() -
                                0.45
                            ).toFixed(2),
                        ),
                    );
                }

                if (
                    this.currentActiveUnit.getAttackTypeSelection() === AttackVals.RANGE &&
                    this.currentActiveUnit.getRangeShots() > 0 &&
                    this.attackHandler.canLandRangeAttack(
                        this.currentActiveUnit,
                        this.grid.getEnemyAggrMatrixByUnitId(this.currentActiveUnit.getId()),
                    )
                ) {
                    this.canAttackByRangeTargets = new Set<string>();
                    // const rangeDist = this.currentActiveUnit.getRangeShotDistance() * GridConstants.STEP; // Unused
                    // const attackerPos = this.currentActiveUnit.getPosition(); // Unused

                    for (const enemy of enemyTeam) {
                        // Relaxed: Allow long range shots (penalty applied later).
                        if (!enemy.hasBuffActive("Hidden")) {
                            // Additionally check if unit is hittable (e.g. not dead, effectively already checked by being in enemyTeam mostly)
                            this.canAttackByRangeTargets.add(enemy.getId());
                        }
                    }
                }
            }
        } else {
            this.cleanActivePaths();
        }
    }
}

registerScene("Heroes", "Sandbox", Sandbox);
