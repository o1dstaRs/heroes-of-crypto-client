import { v4 as uuidv4 } from "uuid";
import { Sprite, Graphics, Container, Text as PixiText, TextStyle, Texture, BlurFilter } from "pixi.js";
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
    SpellTargetType,
    Spell,
    HoCMath,
    IWeightedRoute,
    PathHelper,
    TeamType,
    TeamVals,
    UnitProperties,
    IPlacement,
    Unit,
    IAttackTargets,
    FightStateManager,
    UnitsHolder,
    MoveHandler,
    SpecificSynergy,
    ToLifeSynergy,
    ToChaosSynergy,
    ToMightSynergy,
    ToNatureSynergy,
    FactionVals,
    GridVals,
    AttackVals,
    UnitVals,
    IVisibleDamage,
    ISystemMoveResult,
    AbilityHelper,
    AllAbilities,
    IDamageStatistic,
} from "@heroesofcrypto/common";
import { UnitsOverlay } from "./UnitsOverlay";
import { DamageStatisticHolder } from "./DamageStats";
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
import { MAX_HOLE_LAYERS } from "@/statics";

interface IFlickeringLight extends Graphics {
    _flickerOffset: number;
    _flickerSpeed: number;
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
    private currentEnemiesCellsWithinMovementRange?: HoCMath.XY[];
    private unitsOverlay: UnitsOverlay;
    private bgSprite?: Sprite;
    private placementManager: PlacementManager;
    private spawnPulsePhase = 0;
    private bgKey = "background_new";
    private placementGraphics?: Graphics;
    private centerTerrainSprite?: Sprite;
    private selectedBoardUnit?: RenderableUnit;
    private moveAnimation?: {
        unit: RenderableUnit;
        worldPath: HoCMath.XY[]; // world coordinates along the path (includes start + each cell center)
        currentSegment: number; // segment index in worldPath
        t: number; // progress [0..1] along current segment
        speed: number; // world units per second
        destCell: HoCMath.XY; // final destination cell for logging
        /** Last world position where a large-unit track cluster was dropped */
        lastTrackWorld: HoCMath.XY;
        onComplete?: () => void;
    };
    private moveTrackPath?: HoCMath.XY[];
    private moveTrackProgress = 0; // float index along moveTrackPath (0..length)
    /** Lingering “footprints” / grey glow left after movement. */
    private lingeringTracks: {
        x: number;
        y: number;
        radius: number;
        life: number; // seconds remaining
        maxLife: number; // initial life in seconds
        phase: number;
        team: TeamType;
    }[] = [];
    private isActiveUnitMoving = false;
    private lastTrackDropIndex: number = -1;
    private gridMatrix: number[][];
    private gridMatrixNoUnits: number[][];
    private cellToUnitPreRound?: Map<string, Unit>;
    private readonly unitsHolder: UnitsHolder;
    private readonly abilityFactory: AbilityFactory;
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
    private atmosphereLights: Graphics[] = []; // [NEW] For flickering animation
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
    private holeContainer: Container;
    private drawnNarrowingLaps: Set<number> = new Set();
    // Spellbook
    private spellBookContainer: Container;
    private spellBookOverlay?: SpellBookOverlay;
    private digitTextures?: Map<number, Texture>;
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

        this.holeContainer = new Container();
        this.holeContainer.sortableChildren = true;

        this.spellBookContainer = new Container();
        this.spellBookContainer.visible = false;
        this.spellBookContainer.sortableChildren = false;
        this.spellBookContainer.zIndex = 7000;
        // Fix for coordinates: The spell system uses a centered X and Y-up (Cartesian) system with top approx 1380.
        // We attach to stage (Screen Space).
        this.spellBookContainer.scale.y = -1;
        const { width } = context.pixiApp.getApplication().screen;
        this.spellBookContainer.position.set(width / 2, 1508);

        // Add Book Background Graphic
        const bookTex = this.texAny("book_1024");
        if (bookTex) {
            const bookSprite = new Sprite(bookTex);
            bookSprite.anchor.set(0.5, 0);
            bookSprite.scale.set(-1, -1);
            bookSprite.position.set(0, 1380);
            this.spellBookContainer.addChild(bookSprite);
        }

        context.pixiApp.getApplication().stage.addChild(this.spellBookContainer);
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

        // Global input for closing spellbook
        context.pixiApp.getApplication().stage.eventMode = "static";
        context.pixiApp.getApplication().stage.on("pointerdown", (_e) => {
            if (this.sc_renderSpellBookOverlay) {
                this.sc_renderSpellBookOverlay = false;
                this.buttonManager.sc_renderSpellBookOverlay = false;
                this.spellBookOverlay?.setOpen(false);
                this.pixiApp.getWorldRoot().filters = [];
            }
        });

        this.buttonManager = new ButtonManager(
            {
                getCurrentActiveUnit: () => this.currentActiveUnit,
                getSceneLog: () => this.sc_sceneLog,
                getGridSettings: () => this.sc_sceneSettings.getGridSettings(),
                finishTurn: (h) => this.finishTurn(h),
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
                getVisibleState: () => this.sc_visibleState,
                setVisibleButtons: (buttons, updated) => {
                    this.sc_visibleButtonGroup = buttons;
                    this.sc_buttonGroupUpdated = updated;
                },
                setAIActive: (active) => {
                    this.sc_isAIActive = active;
                    this.aiController.isAIActive = active; // Sync AIController state
                },
                setSpellBookOverlay: (active) => {
                    this.sc_renderSpellBookOverlay = active;
                    this.spellBookOverlay?.setOpen(active);
                    this.pixiApp.getWorldRoot().filters = active ? [new BlurFilter(8)] : [];
                },
            },
            this.sc_isAIActive,
        );

        this.moveHandler = new MoveHandler(this.sc_sceneSettings.getGridSettings(), this.grid, this.unitsHolder);

        HoCLib.interval(() => {
            if (!this.sc_visibleState) return;
            const fightProps = FightStateManager.getInstance().getFightProperties();
            this.sc_visibleState.secondsMax =
                (fightProps.getCurrentTurnEnd() - fightProps.getCurrentTurnStart()) / 1000;
            const remaining = (fightProps.getCurrentTurnEnd() - HoCLib.getTimeMillis()) / 1000;
            this.sc_visibleState.secondsRemaining = remaining > 0 ? remaining : 0;
            this.sc_visibleStateUpdateNeeded = true;
        }, 500);

        // Initialize AI Controller with IAIContext implementation
        this.aiController = new AIController({
            getCurrentActiveUnit: () => this.currentActiveUnit,
            getGrid: () => this.grid,
            getGridMatrix: () => this.gridMatrix,
            getUnitsHolder: () => this.unitsHolder,
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
            executeAttackSequence: (attacker, target, attackFrom) =>
                this.executeAttackSequence(attacker, target, attackFrom),
            executeMoveSequence: (unit, path, overrideFootprint, onComplete) =>
                this.executeMoveSequence(unit, path, overrideFootprint, onComplete),
            finishTurn: () => this.finishTurn(),
            refreshUnits: () => this.refreshUnits(),
        });

        this.spellBookOverlay = new SpellBookOverlay(
            context.pixiApp.getApplication().stage,
            context.pixiApp.getApplication().screen.width,
            context.pixiApp.getApplication().screen.height,
        );
    }
    public override getUnitsOverlay(): UnitsOverlay | undefined {
        return this.unitsOverlay;
    }
    public override CameraChanged(): void {
        // [FIXED] Use attachToWorldRoot with High Z-Index to ensure it overlays units
        this.attachToWorldRoot(this.placementGraphics, 6000);
        // spellBookContainer attached to stage in init
        this.attachToWorldRoot(this.gameplayGraphics, 55); // Ranges below units (Units > 100)
        this.attachToWorldRoot(this.centerTerrainSprite, 50);
        this.hoverManager.onCameraChanged();
    }
    private getPlacement(teamType: TeamType, placementIndex: number): IPlacement | undefined {
        return this.placementManager.getPlacement(teamType, placementIndex);
    }
    /** Get unit by world position using grid occupancy */
    private getUnitAtPosition(worldPos: HoCMath.XY): Unit | undefined {
        const gs = this.sc_sceneSettings.getGridSettings();
        const cell = GridMath.getCellForPosition(gs, worldPos);
        if (!cell) return undefined;
        const occupantId = this.grid.getOccupantUnitId(cell);
        if (!occupantId) return undefined;
        return this.unitsHolder.getAllUnits().get(occupantId);
    }
    private ensureCenterTerrainSprite(): void {
        // Decide which texture key to use based on grid type
        let texKey: string | undefined;
        switch (FightStateManager.getInstance().getFightProperties().getGridType()) {
            case GridVals.WATER_CENTER:
                texKey = "water_256";
                break;
            case GridVals.LAVA_CENTER:
                texKey = "lava_256";
                break;
            case GridVals.BLOCK_CENTER:
                texKey = "mountain_432_412";
                break;
            default:
                texKey = undefined;
                break;
        }
        // If no special center terrain → hide if exists and bail
        if (!texKey) {
            if (this.centerTerrainSprite) {
                this.centerTerrainSprite.visible = false;
            }
            return;
        }
        const tex = this.texAny(texKey);
        if (!tex) {
            if (this.centerTerrainSprite) {
                this.centerTerrainSprite.visible = false;
            }
            return;
        }
        // Lazily create sprite
        if (!this.centerTerrainSprite) {
            this.centerTerrainSprite = new Sprite(tex);
            this.centerTerrainSprite.anchor.set(0.5);
            // Place it under units & placements but above background
            this.attachToWorldRoot(this.centerTerrainSprite, 50);
            this.centerTerrainSprite.scale.y = -1; // world y-up
        } else {
            if (this.centerTerrainSprite.texture !== tex) {
                this.centerTerrainSprite.texture = tex;
            }
            this.attachToWorldRoot(this.centerTerrainSprite, 50);
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const centerX = (gs.getMinX() + gs.getMaxX()) * 0.5;
        const centerY = (gs.getMinY() + gs.getMaxY()) * 0.5;
        const cellSize = gs.getCellSize();
        // Target area: 4x4 cells in the middle
        const targetW = cellSize * 4;
        const targetH = cellSize * 4;
        const texW = tex.width || 1;
        const texH = tex.height || 1;
        const sx = targetW / texW;
        const sy = targetH / texH;
        this.centerTerrainSprite.scale.set(sx, -sy);
        this.centerTerrainSprite.x = centerX;
        this.centerTerrainSprite.y = centerY;
        this.centerTerrainSprite.visible = true;
    }
    /**
     * Drop a 2x2 cluster of lingering tracks at a given world position for a large (2x2) unit.
     */
    private dropLargeUnitTrackAtPosition(unit: RenderableUnit, worldPos: HoCMath.XY, gs: GridSettings): void {
        const cellSize = gs.getCellSize();

        // FIX: The worldPos passed here is the Visual Center of the 2x2 unit.
        // That center lies exactly on the grid line between the anchor cell and the next cell.
        // We subtract half a cell size to shift the coordinate back into the "Anchor Cell"
        // so getCellForPosition doesn't round up to the next neighbor (+1 shift).
        const halfSize = cellSize * 0.5;
        const adjustedPos = { x: worldPos.x - halfSize, y: worldPos.y - halfSize };

        const anchorCell = GridMath.getCellForPosition(gs, adjustedPos);
        if (!anchorCell) return;

        const footprintCells: HoCMath.XY[] = [
            { x: anchorCell.x, y: anchorCell.y },
            { x: anchorCell.x + 1, y: anchorCell.y },
            { x: anchorCell.x, y: anchorCell.y + 1 },
            { x: anchorCell.x + 1, y: anchorCell.y + 1 },
        ];

        for (const c of footprintCells) {
            const pos = GridMath.getPositionForCell(c, gs.getMinX(), gs.getStep(), gs.getHalfStep());
            if (!pos) continue;
            this.lingeringTracks.push({
                x: pos.x,
                y: pos.y,
                radius: cellSize * 0.5,
                life: 2.0,
                maxLife: 2.0,
                phase: Math.random() * Math.PI * 2,
                team: unit.getTeam(),
            });
        }
    }
    /**
     * Step movement animation for the active moving unit.
     * Uses a piecewise-linear interpolation along worldPath and drops lingering track decals.
     * For large units (2x2), tracks are dropped as 2x2 clusters along the path of travel.
     */
    private stepMoveAnimation(dt: number): void {
        const anim = this.moveAnimation;
        if (!anim) return;

        const gs = this.sc_sceneSettings.getGridSettings();
        const cellSize = gs.getCellSize();
        const { unit, worldPath, speed } = anim;
        const isLargeUnit = !unit.isSmallSize();

        if (!worldPath || worldPath.length < 2 || speed <= 0) {
            // Degenerate case – just snap to end and finish.
            const end = worldPath[worldPath.length - 1] ?? unit.getPosition();
            unit.setPosition(end.x, end.y);
            this.finishMoveAnimation();
            return;
        }

        let remaining = speed * dt;

        while (remaining > 0 && this.moveAnimation) {
            const a = this.moveAnimation!;
            const segIndex = a.currentSegment;

            if (segIndex >= a.worldPath.length - 1) {
                // Reached the very end of the path.
                const end = a.worldPath[a.worldPath.length - 1];
                unit.setPosition(end.x, end.y);
                this.moveTrackProgress = this.moveTrackPath ? this.moveTrackPath.length : a.worldPath.length - 1;
                this.finishMoveAnimation();
                return;
            }

            const p0 = a.worldPath[segIndex];
            const p1 = a.worldPath[segIndex + 1];
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const segLen = Math.sqrt(dx * dx + dy * dy) || 1e-6;
            const segRemaining = (1 - a.t) * segLen;

            let newPos: HoCMath.XY;

            if (remaining >= segRemaining) {
                // We can finish this segment and move to the next.
                a.t = 1;
                newPos = { x: p1.x, y: p1.y };
                unit.setPosition(newPos.x, newPos.y);
                a.currentSegment += 1;
                a.t = 0;
                remaining -= segRemaining;
            } else {
                // Move partially along the current segment.
                const deltaT = remaining / segLen;
                a.t += deltaT;
                const nx = p0.x + dx * a.t;
                const ny = p0.y + dy * a.t;
                newPos = { x: nx, y: ny };
                unit.setPosition(newPos.x, newPos.y);
                remaining = 0;
            }

            // --- Track dropping ---
            if (isLargeUnit) {
                // For big units: drop 2x2 footprints along the world-space path between lastTrackWorld and newPos
                const spacing = cellSize * 0.9; // ~one cluster per cell travelled
                let lx = a.lastTrackWorld.x;
                let ly = a.lastTrackWorld.y;

                let vx = newPos.x - lx;
                let vy = newPos.y - ly;
                let dist = Math.sqrt(vx * vx + vy * vy);

                // March along the segment, dropping clusters every `spacing`
                while (dist >= spacing && dist > 1e-6) {
                    const stepT = spacing / dist;
                    lx += vx * stepT;
                    ly += vy * stepT;

                    this.dropLargeUnitTrackAtPosition(unit, { x: lx, y: ly }, gs);

                    vx = newPos.x - lx;
                    vy = newPos.y - ly;
                    dist = Math.sqrt(vx * vx + vy * vy);
                }

                a.lastTrackWorld = { x: lx, y: ly };
            }

            // Update track head [0..pathLength] – segment index + local t.
            this.moveTrackProgress = a.currentSegment + a.t;

            // Small units still use the grid-path based tracking
            if (!isLargeUnit && this.moveTrackPath && this.moveTrackPath.length > 0) {
                const idx = Math.floor(this.moveTrackProgress);
                if (idx >= 0 && idx < this.moveTrackPath.length && idx !== this.lastTrackDropIndex) {
                    const cell = this.moveTrackPath[idx];
                    const pos = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
                    if (pos) {
                        this.lingeringTracks.push({
                            x: pos.x,
                            y: pos.y,
                            radius: cellSize * 0.5,
                            life: 2.0,
                            maxLife: 2.0,
                            phase: Math.random() * Math.PI * 2,
                            team: unit.getTeam(),
                        });
                        this.lastTrackDropIndex = idx;
                    }
                }
            }
        }
    }
    private finishMoveAnimation(): void {
        const anim = this.moveAnimation;
        if (!anim) return;
        const { unit, worldPath, destCell, onComplete } = anim;
        const end = worldPath[worldPath.length - 1] ?? unit.getPosition();

        // Ensure we end up exactly at the intended destination.
        unit.setPosition(end.x, end.y);

        // Final 2x2 track cluster at destination for big units
        if (!unit.isSmallSize()) {
            const gs = this.sc_sceneSettings.getGridSettings();
            this.dropLargeUnitTrackAtPosition(unit, end, gs);
        }

        this.sc_sceneLog.updateLog(`${unit.getName()} moved to(${destCell.x}, ${destCell.y})`);

        this.moveAnimation = undefined;
        this.moveTrackPath = undefined;
        this.moveTrackProgress = 0;
        this.sc_moveBlocked = false;
        this.isActiveUnitMoving = false;
        this.hoverManager.setSilhouetteLocked(false);
        this.hoverManager.clearHoverSilhouette(true);
        if (this.sc_visibleState) {
            this.sc_visibleStateUpdateNeeded = true;
        }
        // Apply one final sync and default idle to reset any move effects
        unit.syncVisual(this.pixiApp.getCamera(), this.sc_sceneSettings.getGridSettings());
        // Reset sprite transform if we manipulated it
        unit.setSpriteRotation(0);

        // If a callback is provided (e.g. "Move then Attack"), run it instead of finishing turn immediately.
        if (onComplete) {
            onComplete();
        } else {
            // Standard move-only action ends the turn.
            this.finishTurn();
        }
    }
    private updateLingeringTracks(dt: number): void {
        if (!this.lingeringTracks.length) return;
        this.lingeringTracks = this.lingeringTracks.filter((t) => {
            t.life -= dt;
            t.phase += dt * 2; // for pulsing
            return t.life > 0;
        });
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
        if (this.bgSprite) return;
        const tex = this.texAny("background_new");
        if (!tex) return;
        const bg = new Sprite(tex);
        bg.anchor.set(0.5);
        const stage = this.pixiApp.getApplication().stage;
        stage.addChildAt(bg, 0);
        this.bgSprite = bg;
        this.layoutBackgroundSquare();
    } // [FIX] Added missing brace
    private dungeonOverlay?: Container;
    private updateDungeonAtmosphere(started: boolean, alpha: number): void {
        const stage = this.pixiApp.getApplication().stage;

        // Hide if not started
        if (!started) {
            if (this.dungeonOverlay) {
                this.dungeonOverlay.visible = false;
            }
            return;
        }

        // Create Container if missing
        if (!this.dungeonOverlay) {
            this.dungeonOverlay = new Container();
            stage.addChildAt(this.dungeonOverlay, 1); // Above background (0)
        }

        const overlayContainer = this.dungeonOverlay;
        overlayContainer.visible = true;
        overlayContainer.alpha = alpha; // Control fade

        // If already populated, just return (avoid rebuilding every frame)
        if (overlayContainer.children.length > 0) return;

        const { width: vw, height: vh } = this.getViewportSize();
        const size = Math.min(vw, vh);
        const x = vw * 0.5;
        const y = vh * 0.5;
        const halfSize = size / 2;

        // 1. Dark Night Overlay
        const overlay = new Graphics();
        overlay.rect(x - halfSize, y - halfSize, size, size).fill({ color: 0x000000, alpha: 0.6 }); // Slightly darker night
        overlayContainer.addChild(overlay);

        // 2. Perimeter Lights (Fire Pits)
        const radius = size * 0.25; // Large glow spread
        const blur = new BlurFilter(45);
        this.atmosphereLights = []; // Reset tracker

        // Push lights OUTWARDS (Away from center)
        // User requested "further from sides" -> increased from 0.12 to 0.22
        // Update: User requested "closer into camera" -> reduced to 0.18
        const margin = size * 0.18;
        const tl = { x: x - halfSize - margin, y: y - halfSize - margin };
        const tr = { x: x + halfSize + margin, y: y - halfSize - margin };
        const bl = { x: x - halfSize - margin, y: y + halfSize + margin };
        const br = { x: x + halfSize + margin, y: y + halfSize + margin };

        // Generate positions around the perimeter
        const lightsInit: Array<{ x: number; y: number }> = [];
        const steps = 6; // More lights due to larger perimeter

        // Helper to add jitter
        const jitter = () => (Math.random() - 0.5) * (size * 0.05);

        // Top Edge (TL -> TR)
        for (let i = 0; i <= steps; i++) {
            lightsInit.push({ x: tl.x + (tr.x - tl.x) * (i / steps) + jitter(), y: tl.y + jitter() });
        }
        // Right Edge (TR -> BR)
        for (let i = 0; i <= steps; i++) {
            lightsInit.push({ x: tr.x + jitter(), y: tr.y + (br.y - tr.y) * (i / steps) + jitter() });
        }
        // Bottom Edge (BR -> BL)
        for (let i = 0; i <= steps; i++) {
            lightsInit.push({ x: br.x + (bl.x - br.x) * (i / steps) + jitter(), y: br.y + jitter() });
        }
        // Left Edge (BL -> TL)
        for (let i = 0; i <= steps; i++) {
            lightsInit.push({ x: bl.x + jitter(), y: bl.y + (tl.y - bl.y) * (i / steps) + jitter() });
        }

        // Draw Lights
        lightsInit.forEach((pos) => {
            const light = new Graphics();
            // Core (Intense Orange)
            light.circle(0, 0, radius * 0.4).fill({ color: 0xffaa00, alpha: 0.5 });
            // Outer Glow (Reddish)
            light.circle(0, 0, radius * 0.8).fill({ color: 0xff4500, alpha: 0.3 });

            // Store offset/speed for flickering in the Graphics object itself (hacky but effective)
            const fLight = light as unknown as IFlickeringLight;
            fLight._flickerOffset = Math.random() * 100;
            fLight._flickerSpeed = 2 + Math.random() * 3;

            light.position.set(pos.x, pos.y);
            light.filters = [blur];
            overlayContainer.addChild(light);
            this.atmosphereLights.push(light);
        });
    }
    /**
     * Move fire perimeter lights inward toward the center when map narrows.
     * @param inwardOffset - Number of cells to move inward (based on narrowing laps)
     */
    private moveFiresInward(inwardOffset: number): void {
        if (!this.atmosphereLights || this.atmosphereLights.length === 0) return;

        const { width: vw, height: vh } = this.getViewportSize();
        const size = Math.min(vw, vh);
        const x = vw * 0.5;
        const y = vh * 0.5;
        const halfSize = size / 2;

        // Calculate the inward shift based on cell size and offset
        const cellSize = this.sc_sceneSettings.getGridSettings().getCellSize();
        const inwardShift = (inwardOffset + 1) * cellSize * 0.5;

        // Recalculate margin adjusted for narrowing
        const baseMargin = size * 0.22;
        const adjustedMargin = baseMargin - inwardShift;

        const tl = { x: x - halfSize - adjustedMargin, y: y - halfSize - adjustedMargin };
        const tr = { x: x + halfSize + adjustedMargin, y: y - halfSize - adjustedMargin };
        const bl = { x: x - halfSize - adjustedMargin, y: y + halfSize + adjustedMargin };
        const br = { x: x + halfSize + adjustedMargin, y: y + halfSize + adjustedMargin };

        // Reposition each light based on its index position on the perimeter
        const steps = 6;
        const lightsPerEdge = steps + 1; // 7 lights per edge

        this.atmosphereLights.forEach((light, idx) => {
            let newPos: { x: number; y: number };
            const edgeIndex = Math.floor(idx / lightsPerEdge);
            const posOnEdge = (idx % lightsPerEdge) / steps;

            switch (edgeIndex) {
                case 0: // Top Edge
                    newPos = { x: tl.x + (tr.x - tl.x) * posOnEdge, y: tl.y };
                    break;
                case 1: // Right Edge
                    newPos = { x: tr.x, y: tr.y + (br.y - tr.y) * posOnEdge };
                    break;
                case 2: // Bottom Edge
                    newPos = { x: br.x + (bl.x - br.x) * posOnEdge, y: br.y };
                    break;
                case 3: // Left Edge
                    newPos = { x: bl.x, y: bl.y + (tl.y - bl.y) * posOnEdge };
                    break;
                default:
                    newPos = { x: light.x, y: light.y };
            }

            light.position.set(newPos.x, newPos.y);
        });
    }
    private layoutBackgroundSquare(): void {
        if (!this.bgSprite) return;
        const { width: vw, height: vh } = this.getViewportSize();
        const size = Math.min(vw, vh);
        this.bgSprite.x = vw * 0.5;
        this.bgSprite.y = vh * 0.5;
        this.bgSprite.width = size;
        this.bgSprite.height = size;
        const wantKey = "background_new";
        const wantTex = this.texAny(wantKey);
        if (wantTex && this.bgKey !== wantKey) {
            this.bgKey = wantKey;
            this.bgSprite.texture = wantTex;
        }

        // Update overlay if active
        if (this.dungeonOverlay && this.dungeonOverlay.visible) {
            this.updateDungeonAtmosphere(true, this.atmosphereAlpha);
        }
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
                id: uuidv4(),
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
    public override Resize(w: number, h: number): void {
        // 1) Let the base scene update camera, worldRoot, etc.
        super.Resize(w, h);
        // 2) Background is in screen-space
        this.layoutBackgroundSquare();

        // Update SpellBook Container Position on Resize to keep it centered
        if (this.spellBookContainer) {
            // Content Size approx 1350x1150 based on layout
            // Scale to fit this content into the screen
            const scaleW = w / 1350;
            const scaleH = h / 1150;

            // "Always occupy full camera view" => Scale to fit (Contain)
            // Remove cap of 1 to allow Upscaling on large screens
            const scale = Math.min(scaleW, scaleH);

            this.spellBookContainer.scale.set(scale, -scale);
            // Shift up by 1/12 of the screen height as requested
            this.spellBookContainer.position.set(w / 2, 1508 * scale - h / 12);
        }
        if (this.spellBookOverlay) {
            this.spellBookOverlay.resize(w, h);
        }

        // [FIX] Force rebuild of dungeon atmosphere on resize
        if (this.dungeonOverlay) {
            this.dungeonOverlay.removeChildren();
        }

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
        // 4) Anything that lives in world space and might have been attached
        this.attachToWorldRoot(this.placementGraphics, 6000); // Overlay on top
        // Holes
        this.attachToWorldRoot(this.holeContainer, 20);
        this.attachToWorldRoot(this.gameplayGraphics, 55);
        this.attachToWorldRoot(this.centerTerrainSprite, 50);
        this.attachToWorldRoot(this.centerTerrainSprite, 50);
        this.attachToWorldRoot(this.centerTerrainSprite, 50);
        // this.attachToWorldRoot(this.spellBookContainer, 7000); // attached to stage
        this.spellBookOverlay?.resize(w, h);
        this.hoverManager.onCameraChanged();
    }
    private spawnObstacles(encounterCurrent = false): string | undefined {
        console.log(`spawnObstacles ${encounterCurrent}`);

        // 1. Calculate exactly how many layers should be active based on original logic
        const fp = FightStateManager.getInstance().getFightProperties();

        if (fp.getCurrentLap() > HoCConstants.NUMBER_OF_LAPS_TILL_STOP_NARROWING) {
            return undefined;
        }

        const calculatedLaps =
            Math.floor((fp.getCurrentLap() - (encounterCurrent ? 1 : 0)) / fp.getNumberOfLapsTillNarrowing()) +
            fp.getAdditionalNarrowingLaps();

        // If calculated laps is 0 or less (early game), do nothing.
        if (calculatedLaps < 1) {
            return undefined;
        }

        // Cap at max laps if necessary
        const totalLaps = Math.min(calculatedLaps, MAX_HOLE_LAYERS || 5);

        const gs = this.sc_sceneSettings.getGridSettings();
        const minCellX = gs.getMinX() / gs.getCellSize();
        const maxCellX = gs.getMaxX() / gs.getCellSize();
        const minCellY = gs.getMinY() / gs.getCellSize();
        const maxCellY = gs.getMaxY() / gs.getCellSize();

        const logs: string[] = [];

        this.attachToWorldRoot(this.holeContainer, 20);

        // 2. Loop from 1 up to totalLaps (Outermost ring -> Inwards)
        for (let layer = 1; layer <= totalLaps; layer++) {
            // A. VISUALS: Spawn the sprite for this layer if not already present
            if (!this.drawnNarrowingLaps.has(layer)) {
                this.spawnHoleLayer(layer);
                this.drawnNarrowingLaps.add(layer);
                // Move fire lights inward as map narrows
                this.moveFiresInward(layer);
            }

            // B. LOGIC: Define the grid offset for this specific ring
            // layer 1 = offset 0 (Edge)
            // layer 2 = offset 1 (Edge + 1)
            const offset = layer - 1;

            // Process the 4 edges for this specific ring (offset)
            // 1. TOP EDGE
            for (let i = minCellX + offset; i < maxCellX - offset; i++) {
                const cellX = i + maxCellX;
                const cell = { x: cellX, y: offset };

                const systemMoveResult = this.moveHandler.moveUnitTowardsCenter(
                    cell,
                    GridConstants.UPDATE_UP,
                    layer, // Pass actual layer count to logic if needed
                );
                this.handleSystemMoveResult(systemMoveResult, logs);
                this.grid.occupyByHole(cell);
            }

            // 2. BOTTOM EDGE
            for (let i = minCellX + offset; i < maxCellX - offset; i++) {
                const cellX = i + maxCellX;
                const cellY = maxCellY - layer; // effectively max - 1 - offset

                const cell = { x: cellX, y: cellY };

                const systemMoveResult = this.moveHandler.moveUnitTowardsCenter(cell, GridConstants.UPDATE_DOWN, layer);
                this.handleSystemMoveResult(systemMoveResult, logs);
                this.grid.occupyByHole(cell);
            }

            // 3. LEFT EDGE
            for (let i = minCellY + offset; i < maxCellY - offset; i++) {
                const cellX = offset;
                const cellY = i;

                const cell = { x: cellX, y: cellY };

                const systemMoveResult = this.moveHandler.moveUnitTowardsCenter(
                    cell,
                    GridConstants.UPDATE_RIGHT,
                    layer,
                );
                this.handleSystemMoveResult(systemMoveResult, logs);
                this.grid.occupyByHole(cell);
            }

            // 4. RIGHT EDGE
            for (let i = minCellY + offset; i < maxCellY - offset; i++) {
                const cellX = (maxCellX << 1) - layer; // Logic from original: max*2 - laps
                // If maxCellX is width, then (2*max - layer) might be specific to your coordinate system.
                // Keeping your original math:

                const cellY = i;
                const cell = { x: cellX, y: cellY };

                const systemMoveResult = this.moveHandler.moveUnitTowardsCenter(cell, GridConstants.UPDATE_LEFT, layer);
                this.handleSystemMoveResult(systemMoveResult, logs);
                this.grid.occupyByHole(cell);
            }
        }

        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();

        return logs.join("\n");
    }
    private spawnHoleLayer(layerIndex: number): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const cellSize = gs.getCellSize();
        // World coordinate bounds
        const worldMinX = gs.getMinX(); // e.g., -1024
        const worldMaxX = gs.getMaxX(); // e.g., 1024
        const worldMinY = gs.getMinY(); // e.g., 0
        const worldMaxY = gs.getMaxY(); // e.g., 2048

        // Cell counts
        const cellCountX = (worldMaxX - worldMinX) / cellSize; // e.g., 16
        const cellCountY = (worldMaxY - worldMinY) / cellSize; // e.g., 16

        // Offset for this layer (layer 1 = edge, layer 2 = edge+1, etc.)
        const offset = layerIndex - 1;

        // Create a Graphics object to draw all hole cells for this layer
        const holeGfx = new Graphics();

        // Simple black semi-transparent cell
        const drawHoleCell = (cellIdxX: number, cellIdxY: number) => {
            // Convert cell index to world coordinates
            const worldX = worldMinX + cellIdxX * cellSize;
            const worldY = worldMinY + cellIdxY * cellSize;

            holeGfx.rect(worldX, worldY, cellSize, cellSize).fill({ color: 0x000000, alpha: 0.7 });
        };

        // TOP EDGE (y = offset, x varies across width)
        for (let x = offset; x < cellCountX - offset; x++) {
            drawHoleCell(x, offset);
        }

        // BOTTOM EDGE (y = cellCountY - layerIndex, x varies across width)
        for (let x = offset; x < cellCountX - offset; x++) {
            drawHoleCell(x, cellCountY - layerIndex);
        }

        // LEFT EDGE (x = offset, y varies excluding corners already drawn)
        for (let y = offset + 1; y < cellCountY - offset - 1; y++) {
            drawHoleCell(offset, y);
        }

        // RIGHT EDGE (x = cellCountX - layerIndex, y varies excluding corners)
        for (let y = offset + 1; y < cellCountY - offset - 1; y++) {
            drawHoleCell(cellCountX - layerIndex, y);
        }

        this.holeContainer.addChild(holeGfx);
    }
    private handleSystemMoveResult(result: ISystemMoveResult, logs: string[]) {
        if (result.log) {
            logs.push(result.log);
        }
        for (const [uId, newPosition] of result.unitIdToNewPosition.entries()) {
            const unit = this.unitsHolder.getAllUnits().get(uId);
            if (unit) {
                const rUnit = unit as RenderableUnit;
                rUnit.setPosition(newPosition.x, newPosition.y);
                rUnit.syncVisual(this.pixiApp.getCamera(), this.sc_sceneSettings.getGridSettings());
            } else {
                if (!result.unitIdsDestroyed.includes(uId)) {
                    result.unitIdsDestroyed.push(uId);
                }
            }
        }
        const unitsToDestroy: RenderableUnit[] = [];
        for (const uId of result.unitIdsDestroyed) {
            const unit = this.unitsHolder.getAllUnits().get(uId);
            if (unit) {
                unitsToDestroy.push(unit as RenderableUnit);
            }
        }
        if (unitsToDestroy.length > 0) {
            this.destroySpecificUnits(unitsToDestroy);
        }
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
    public getNumberOfUnitsAvailableForPlacement(_t: TeamType): number {
        return 0;
    }
    public override propagateButtonClicked(name: string, state: VisibleButtonState): void {
        this.buttonManager.propagateButtonClicked(name, state);
    }
    // Helper to capture total health state and amount of all units
    // Helper to capture total health state and amount of all units
    private captureHealthState(): Map<string, { hp: number; maxHp: number; amount: number; pos: HoCMath.XY }> {
        const m = new Map<string, { hp: number; maxHp: number; amount: number; pos: HoCMath.XY }>();
        for (const u of this.unitsHolder.getAllUnits().values()) {
            m.set(u.getId(), {
                hp: u.getHp(), // Note: Use getHp() to match logic in showDamageVisualsFromDiff which constructs total from (amount-1)*max + hp
                maxHp: u.getMaxHp(),
                amount: u.getAmountAlive(),
                pos: { ...u.getPosition() }, // Clone position
            });
        }
        return m;
    }
    private showDamageVisualsFromDiff(
        preState: Map<string, { hp: number; amount: number }>,
        attackerCell?: HoCMath.XY,
        ignoredUnitIds?: Set<string>,
        forcedDirection?: HoCMath.XY,
    ): void {
        const gs = this.sc_sceneSettings.getGridSettings();

        for (const [id, oldState] of preState) {
            if (ignoredUnitIds && ignoredUnitIds.has(id)) {
                console.log(`[DEBUG] showDamageVisualsFromDiff: Ignoring ${id}`);
                continue;
            } else if (ignoredUnitIds) {
                console.log(
                    `[DEBUG] showDamageVisualsFromDiff: Processing ${id} (Not in ignored: ${Array.from(ignoredUnitIds).join(",")})`,
                );
            }

            const u = this.unitsHolder.getAllUnits().get(id);
            if (!u) continue;

            const newTotal = u.getCumulativeHp();

            if (newTotal < oldState.hp) {
                const diff = oldState.hp - newTotal;
                const unitsDied = Math.max(0, oldState.amount - u.getAmountAlive());

                // Determine direction
                let direction: HoCMath.XY | undefined = forcedDirection;
                if (!direction && attackerCell) {
                    const attPos = GridMath.getPositionForCell(
                        attackerCell,
                        gs.getMinX(),
                        gs.getStep(),
                        gs.getHalfStep(),
                    );
                    if (attPos) {
                        const center = u instanceof RenderableUnit ? u.getVisualCenter(gs) : u.getPosition();
                        direction = { x: center.x - attPos.x, y: center.y - attPos.y };
                    }
                }

                const center = u instanceof RenderableUnit ? u.getVisualCenter(gs) : u.getPosition();
                console.log(`[DEBUG] showDamageVisualsFromDiff: Showing damage for ${id}, diff=${diff}`);
                this.showFloatingDamage(center, diff, direction, unitsDied);

                // UI Update
                if (this.sc_selectedUnitProperties && this.sc_selectedUnitProperties.id === id) {
                    this.sc_selectedUnitProperties = { ...u.getUnitProperties() };
                    this.sc_unitPropertiesUpdateNeeded = true;
                }
            }
        }
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
    protected handleMouseDownForSelectedBody(): void { }
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
                // 6. Attempt to occupy the grid
                const hasMadeOfFire = newUnit.hasAbilityActive("Made of Fire");
                const hasMadeOfWater = newUnit.hasAbilityActive("Made of Water");
                const occupied = this.grid.occupyCells(
                    cellsToOccupy,
                    newUnit.getId(),
                    newUnit.getTeam(),
                    newUnit.getAttackRange(),
                    hasMadeOfFire,
                    hasMadeOfWater,
                );
                if (occupied) {
                    this.layoutVersion++;
                    this.gridMatrix = this.grid.getMatrix();
                    this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
                    // 7. Finalize Position and Visuals
                    const placePos = GridMath.getPositionForCells(gs, cellsToOccupy);
                    if (placePos) {
                        newUnit.setPosition(placePos.x, placePos.y);
                    }
                    const scale = newUnit.ensureVisual(this.pixiApp.getCamera(), gs);
                    if (scale) {
                        newUnit.startSpawnAnimation(scale);
                    }
                    // 8. Refresh State
                    this.unitsHolder.refreshStackPowerForAllUnits();
                    this.refreshSynergyNumbers(selectedUnit.getTeam());
                    this.refreshUnits();
                    cloned = true;
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
            // 1. Remove from Units Holder
            this.unitsHolder.deleteUnitById(u.id);
            // 2. Remove from Grid
            const pos = unit.getPosition();
            if (pos) {
                this.grid.cleanupAll(unit.getId(), unit.getAttackRange(), unit.isSmallSize());
            }

            // 3. Destroy Visuals
            this.destroySpecificUnits([unit as RenderableUnit], true);

            // 4. Update Board State
            this.refreshSynergyNumbers(unit.getTeam());
            this.refreshUnits();

            // 5. Clear Selection
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
        // force as we might have changed the number of laps till narrowing
        this.refreshVisibleStateIfNeeded(true);
    }
    private refreshVisibleStateIfNeeded(force = false) {
        if (!this.sc_visibleState || force) {
            this.sc_visibleState = {
                canBeStarted: false,
                hasFinished: false,
                secondsRemaining: -1,
                secondsMax: Number.MAX_SAFE_INTEGER,
                teamTypeTurn: undefined,
                hasAdditionalTime: false,
                lapNumber: 0,
                numberOfLapsTillNarrowing: FightStateManager.getInstance()
                    .getFightProperties()
                    .getNumberOfLapsTillNarrowing(),
                numberOfLapsTillStopNarrowing: HoCConstants.NUMBER_OF_LAPS_TILL_STOP_NARROWING,
                canRequestAdditionalTime: !!FightStateManager.getInstance()
                    .getFightProperties()
                    .requestAdditionalTurnTime(undefined, true),
                upNext: [],
                lapsNarrowed: FightStateManager.getInstance().getFightProperties().getLapsNarrowed(),
            };
            this.sc_visibleStateUpdateNeeded = true;
        }
    }
    public getGridType(): GridType {
        return FightStateManager.getInstance().getFightProperties().getGridType();
    }
    public requestTime(_team: number): void { }
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
        // ==================================================================================
        // 6. PREPARE ROLLBACK STATE
        // ==================================================================================
        let cellsToRestore: HoCMath.XY[] | undefined;
        if (this.draggingUnitId) {
            const currentPos = unit.getPosition();
            const anchorCell = GridMath.getCellForPosition(gs, currentPos);
            if (anchorCell) {
                if (unit.isSmallSize()) {
                    cellsToRestore = [anchorCell];
                } else {
                    // Reconstruct 2x2 footprint relative to anchor
                    cellsToRestore = [
                        { x: anchorCell.x, y: anchorCell.y },
                        { x: anchorCell.x + 1, y: anchorCell.y },
                        { x: anchorCell.x, y: anchorCell.y + 1 },
                        { x: anchorCell.x + 1, y: anchorCell.y + 1 },
                    ];
                }
            }
            // DESTRUCTIVE ACTION: Remove from grid
            this.grid.cleanupAll(unit.getId(), unit.getAttackRange(), unit.isSmallSize());
        }
        // 7. Attempt to Occupy New Cells
        const hasMadeOfFire = unit.hasAbilityActive("Made of Fire");
        const hasMadeOfWater = unit.hasAbilityActive("Made of Water");
        let occupied = false;
        if (cellsToOccupy.length === 1) {
            occupied = this.grid.occupyCell(
                cellsToOccupy[0],
                unit.getId(),
                unit.getTeam(),
                unit.getAttackRange(),
                hasMadeOfFire,
                hasMadeOfWater,
            );
            if (occupied) this.layoutVersion++; // Invalidate board layout
        } else {
            occupied = this.grid.occupyCells(
                cellsToOccupy,
                unit.getId(),
                unit.getTeam(),
                unit.getAttackRange(),
                hasMadeOfFire,
                hasMadeOfWater,
            );
            if (occupied) this.layoutVersion++; // Invalidate board layout
        }
        // ==================================================================================
        // 8. ROLLBACK ON FAILURE
        // ==================================================================================
        if (!occupied) {
            if (this.draggingUnitId && cellsToRestore) {
                this.grid.occupyCells(
                    cellsToRestore,
                    unit.getId(),
                    unit.getTeam(),
                    unit.getAttackRange(),
                    hasMadeOfFire,
                    hasMadeOfWater,
                );
                this.layoutVersion++; // Invalidate board layout (Rollback)
            } else if (!this.draggingUnitId) {
                this.unitsHolder.deleteUnitById(unit.getId());
            }
            if (!this.selectionFromOverlay) this.clearBoardSelection();
            return;
        }
        // 9. Success: Finalize Updates
        unit.setPosition(placePos.x, placePos.y);
        this.refreshSynergyNumbers(unit.getTeam());
        this.refreshUnits();
        const scale = unit.ensureVisual(this.pixiApp.getCamera(), gs);
        if (!scale) {
            console.log("Failed to ensure unit sprite");
            if (!this.selectionFromOverlay) this.clearBoardSelection();
            return;
        }
        // Sync pathfinding matrices
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        unit.startSpawnAnimation(scale);
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
        const fightProps = FightStateManager.getInstance().getFightProperties();
        // 1. FIGHT STARTED INTERACTION
        if (fightProps.hasFightStarted()) {
            // [AI Driven Check] If the current unit is controlled by AI (e.g. Berserker), block user input.
            if (this.currentActiveUnit?.hasAbilityActive("AI Driven")) {
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
                                        // Fallback: This should ideally not happen if attackFrom was valid
                                        console.warn(
                                            "Large Unit Move-Attack: No route found in knownPaths. Executing direct attack.",
                                        );
                                        this.executeAttackSequence(
                                            this.currentActiveUnit,
                                            targetUnit as RenderableUnit,
                                            attackFrom,
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
                                        // Fallback: Calculate path explicitly
                                        const movePaths = this.pathHelper.getMovePath(
                                            GridMath.getCellForPosition(gs, currentPos)!,
                                            this.grid.getMatrix(),
                                            this.currentActiveUnit.getSteps(),
                                            undefined,
                                            this.currentActiveUnit.hasAbilityActive("Flying"),
                                            this.currentActiveUnit.isSmallSize(),
                                            false,
                                        );

                                        const destKey = (attackFrom.x << 4) | attackFrom.y;
                                        const fallbackRoutes = movePaths.knownPaths.get(destKey);

                                        if (fallbackRoutes && fallbackRoutes.length > 0) {
                                            this.executeMoveSequence(
                                                this.currentActiveUnit,
                                                fallbackRoutes[0].route,
                                                undefined,
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
                                                "Move-Attack path calculation failed, executing direct attack.",
                                            );
                                            this.executeAttackSequence(
                                                this.currentActiveUnit,
                                                targetUnit as RenderableUnit,
                                                attackFrom,
                                            );
                                        }
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
    private floatingTexts: {
        container: Container;
        life: number;
        maxLife: number;
        startY: number;
        startX: number;
        velX: number;
        velY: number;
    }[] = [];
    private showFloatingDamage(pos: HoCMath.XY, amount: number, direction?: HoCMath.XY, unitsDied?: number): void {
        const container = new Container();

        // 1. Damage Text
        const textStyle = new TextStyle({
            fontFamily: "Arial",
            fontSize: 60, // [RESTORED] Bigger font
            fontWeight: "900",
            fill: "#ff3333",
            stroke: { color: "#4a0000", width: 5 },
            dropShadow: {
                color: "#000000",
                blur: 4,
                angle: Math.PI / 6,
                distance: 2,
            },
        });

        const damageText = new PixiText({ text: `-${amount}`, style: textStyle });
        damageText.anchor.set(0.5);
        container.addChild(damageText);

        // 2. Skull + Count if units died
        if (unitsDied && unitsDied > 0) {
            // New Skull Image
            const skullTex = Texture.from(images.skull || "/skull.webp");
            const skullSprite = new Sprite(skullTex);
            skullSprite.anchor.set(0.5);
            skullSprite.width = 40; // [FIXED] Explicit size
            skullSprite.height = 40;

            const countStyle = new TextStyle({
                fontFamily: "Arial",
                fontSize: 40, // [FIXED] Bigger font for count
                fontWeight: "bold",
                fill: "#ffffff",
                stroke: { color: "#000000", width: 4 },
            });
            const countText = new PixiText({ text: `${unitsDied}`, style: countStyle });
            countText.anchor.set(0.5);

            // Container scale.y is -1.
            const lineY = 55; // Lower it a bit more due to larger text
            skullSprite.position.set(-25, lineY);
            countText.position.set(25, lineY);

            container.addChild(skullSprite, countText);
        }

        // Correct for Y-Up world
        container.scale.y = -1;

        // Initial Position
        container.position.set(pos.x, pos.y + 20);

        // [FIXED] Use attachToWorldRoot with High Z-Index to ensure it overlays units
        this.attachToWorldRoot(container, 2000);

        // Velocity: Match direction of attack
        let vx = 0;
        let vy = 80; // Default up

        if (direction) {
            const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
            if (len > 0.001) {
                // Scale velocity by 80
                // Note: direction is likely the attack vector (Attacker -> Target).
                // "Animation direction ... direction of attack" -> Text flies ALONG the attack?
                // Or "knockback" (Target -> Away)?
                // Usually "direction" passed here comes from `showFloatingDamage` call.
                // In `landAttack`, we pass `target.getPosition().sub(attacker.getPosition())`?
                // I need to verify what `direction` is.
                // Assuming it is the vector.
                vx = (direction.x / len) * 80;
                vy = (direction.y / len) * 80;
            }
        }

        this.floatingTexts.push({
            container,
            life: 1.5,
            maxLife: 1.5,
            startY: pos.y + 20,
            startX: pos.x,
            velX: vx,
            velY: vy,
        });
    }
    private async executeAttackSequence(attacker: RenderableUnit, target: Unit, attackFrom: HoCMath.XY): Promise<void> {
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

        // Check for Range Attack
        // If attackFrom is current position AND target is far away (or strictly defined as range target), use Range logic.
        // We can check if it is in canAttackByRangeTargets if available, or deduce from distance.
        const dist = HoCMath.getDistance(attackFrom, target.getPosition());
        const isRange =
            attacker.getAttackType() === AttackVals.RANGE &&
            (this.canAttackByRangeTargets?.has(target.getId()) ||
                (dist > GridConstants.STEP * 1.5 &&
                    attackFrom.x === attacker.getPosition().x &&
                    attackFrom.y === attacker.getPosition().y));

        if (isRange) {
            const evalResult = this.attackHandler.evaluateRangeAttack(
                this.unitsHolder.getAllUnits(),
                attacker,
                attacker.getPosition(), // From
                target.getPosition(), // To
                false, // isThroughShot
                false, // isSelection
                attacker.hasAbilityActive("Large Caliber") || attacker.hasAbilityActive("Area Throw"),
            );

            // Response Logic (lightweight version of legacy)
            let responseDivisor = 1;
            let responseUnits: Unit[] | undefined = undefined;

            // Check if target can respond (Range vs Range)
            if (
                target.getAttackType() === AttackVals.RANGE &&
                target.getRangeShots() > 0 &&
                !target.hasDebuffActive("Range Null Field Aura") &&
                !target.hasDebuffActive("Rangebane") &&
                !this.attackHandler.canBeAttackedByMelee(
                    target.getPosition(),
                    target.isSmallSize(),
                    this.grid.getEnemyAggrMatrixByUnitId(target.getId()),
                )
            ) {
                const respEval = this.attackHandler.evaluateRangeAttack(
                    this.unitsHolder.getAllUnits(),
                    target,
                    target.getPosition(),
                    attacker.getPosition(),
                    false,
                    false,
                    target.hasAbilityActive("Large Caliber") || target.hasAbilityActive("Area Throw"),
                );
                responseDivisor = respEval.rangeAttackDivisors[0] ?? 1;
                responseUnits = respEval.affectedUnits[0];
            }

            if (
                this.attackHandler.handleRangeAttack(
                    this.unitsHolder,
                    evalResult.rangeAttackDivisors,
                    responseDivisor,
                    damageForAnimation,
                    attacker,
                    evalResult.affectedUnits,
                    responseUnits,
                    attacker.getPosition(),
                    false, // isAOE
                    true, // decreaseNumberOfShots
                ).completed
            ) {
                this.sc_damageStatsUpdateNeeded = true;
            }
        } else if (
            this.attackHandler.handleMeleeAttack(
                this.unitsHolder,
                this.moveHandler,
                damageForAnimation,
                this.currentActiveKnownPaths,
                attacker,
                target,
                attackFrom,
            ).completed
        ) {
            this.sc_damageStatsUpdateNeeded = true;
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

                    // Stagger animations by 1000ms
                    if (index === 0) {
                        this.showFloatingDamage(pos, dmg.amount, dir, dmg.unitsDied);
                    } else {
                        setTimeout(() => {
                            this.showFloatingDamage(pos, dmg.amount, dir, dmg.unitsDied);
                        }, index * 1000);
                    }
                });
            } else {
                this.showFloatingDamage(spawnPos, damageForAnimation.amount, dir, targetDiedCount);
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

                // Pass simplified stackLost as unitsDied
                this.showFloatingDamage(spawnPos, damageTaken, dir, stackLost);
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

            // Deduct already shown damage
            let alreadyShown = 0;
            if (uId === target.getId()) {
                if (damageForAnimation.hits && damageForAnimation.hits.length > 0) {
                    alreadyShown = damageForAnimation.hits.reduce((sum, h) => sum + h.amount, 0);
                    // If amount was used for logic but not equal to sum, this fixes it.
                    // Also handles case where amount was only first shot.
                    console.log(`[DEBUG] executeAttackSequence: Using hits sum for alreadyShown: ${alreadyShown}`);
                } else {
                    alreadyShown = damageForAnimation.amount;
                }
            }

            const unaccountedDiff = diff - alreadyShown;

            // FIX: If we have detailed hits, we trust them to fully represent the attack's visual impact on the target.
            // Any "unaccounted" difference here is likely a synchronization artifact (e.g. double counting) rather than hidden damage.
            // We suppress the aggregate animation for the target if hits were shown.
            // But for secondary targets (AOE, skewer strike, etc.), always show damage if they took any.
            const isSecondaryTarget = uId !== target.getId();

            const shouldShowDamage =
                unaccountedDiff > 0 &&
                (isSecondaryTarget || !damageForAnimation.hits || damageForAnimation.hits.length === 0);

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

                this.showFloatingDamage(spawnPos, unaccountedDiff, primaryAttackDir, diedCount);
            }
        }

        // Handle animations if needed (e.g. movement, hits)
        // if (result.animationData) {
        // TODO: Port animation playback logic (move, bullet, etc)
        // For now, we rely on state updates, but movement might jump without animation.

        // Cleanup and finish turn
        // Cleanup and finish turn
        const performCleanup = () => {
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

            this.finishTurn();

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
            setTimeout(performCleanup, maxDelay);
        } else {
            performCleanup();
        }
    }
    private executeMoveSequence(
        unit: RenderableUnit,
        path: HoCMath.XY[],
        overrideFootprint?: HoCMath.XY[],
        onComplete?: () => void,
    ): void {
        if (!path || path.length === 0) return;
        const gs = this.sc_sceneSettings.getGridSettings();
        const cellSize = gs.getCellSize();
        const isLargeUnit = !unit.isSmallSize();
        const hasFootprintOverride = !!overrideFootprint && overrideFootprint.length === 4;

        // For large units right now, `path` is actually just the final 2x2 footprint cells,
        // not a real route → detect that pattern and treat it as "teleport" destination only.
        const pathLooksLikeFootprintOnly = isLargeUnit && hasFootprintOverride && path.length <= 4;

        // Default destCell for logging / track anchor.
        let destCell = path[path.length - 1];

        // Capture starting world position *before* changing grid.
        const startPos = unit.getPosition();

        // --- Grid occupancy update ---
        this.grid.cleanupAll(unit.getId(), unit.getAttackRange(), unit.isSmallSize());

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

        const hasMadeOfFire = unit.hasAbilityActive("Made of Fire");
        const hasMadeOfWater = unit.hasAbilityActive("Made of Water");
        const occupied = this.grid.occupyCells(
            cellsToOccupy,
            unit.getId(),
            unit.getTeam(),
            unit.getAttackRange(),
            hasMadeOfFire,
            hasMadeOfWater,
        );
        if (!occupied) {
            console.error(
                `Critical: Unit ${unit.getName()} failed to occupy target footprint (dest ${destCell.x}, ${destCell.y})`,
            );
            return;
        }

        // Sync matrices
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();

        const newWorldPos = GridMath.getPositionForCells(gs, cellsToOccupy);
        if (!newWorldPos) {
            console.error(
                `Critical: Failed to compute world position for cells when moving ${unit.getName()} -> (${destCell.x}, ${destCell.y})`,
            );
            return;
        }

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

        // --- Track effect path ---
        if (pathLooksLikeFootprintOnly) {
            // For large units we ignore moveTrackPath and rely on world-space tracking.
            this.moveTrackPath = undefined;
        } else {
            this.moveTrackPath = [...path];
        }

        this.moveTrackProgress = 0;
        this.lastTrackDropIndex = -1;

        // --- Movement animation state ---
        this.moveAnimation = {
            unit,
            worldPath,
            currentSegment: 0,
            t: 0,
            // Adjusted speed based on user feedback (was 12)
            speed: cellSize * 16,
            destCell,
            lastTrackWorld: { x: startPos.x, y: startPos.y },
            onComplete,
        };

        // Immediately drop starting 2x2 tracks for big units
        if (isLargeUnit) {
            this.dropLargeUnitTrackAtPosition(unit, startPos, gs);
        }

        this.isActiveUnitMoving = true;
        if (this.sc_visibleState) {
            this.sc_visibleStateUpdateNeeded = true;
        }

        // Once movement starts, kill previews & silhouettes.
        const fightProperties = FightStateManager.getInstance().getFightProperties();

        this.moveHandler.applyMoveModifiers(
            destCell,
            unit,
            fightProperties.getAdditionalAbilityPowerPerTeam(unit.getTeam()),
            fightProperties.getAdditionalMoralePerTeam(unit.getTeam()),
            this.currentActiveKnownPaths,
        );

        this.hoverManager.setSilhouetteLocked(true);
        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.currentActivePathHashes = undefined;
        this.hoverManager.clearHoverSilhouette();
        this.hoverManager.hoveredUnitHighlight = undefined;
        this.sc_moveBlocked = true;
    }
    protected override hover(): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();

        // 0. Spellbook Interaction
        if (this.sc_renderSpellBookOverlay && this.currentActiveUnit && this.sc_mouseWorld) {
            if (this.currentActiveUnit instanceof RenderableUnit) {
                const hoveredSpell = this.currentActiveUnit.getHoveredSpell(this.sc_mouseWorld);
                this.currentActiveSpell = hoveredSpell;

                // If hovering inside spellbook, skip other board interactions?
                // Probably yes, to avoid clicking units "through" the book.
                // Assuming SpellBook renders on top.
                if (hoveredSpell) {
                    this.hoverManager.clear();
                    return;
                }
            }
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
            if (this.sc_isAnimating || this.isActiveUnitMoving || !this.sc_mouseWorld) {
                this.hoverManager.clearHoverSilhouette();
                return;
            }
            // [AI Driven Check] If the current unit is controlled by AI (e.g. Berserker), don't show movement visuals.
            if (this.currentActiveUnit.hasAbilityActive("AI Driven")) {
                this.hoverManager.clearHoverSilhouette();
                return;
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
            // Only checking for attack if we have melee targets calculated
            if (this.canAttackByMeleeTargets && this.currentActiveUnit) {
                const targetUnit = this.getUnitAtPosition(this.sc_mouseWorld);
                if (targetUnit && targetUnit.getTeam() !== this.currentActiveUnit.getTeam()) {
                    let attackFrom: HoCMath.XY | undefined;

                    // Check if mouse cell is actually part of the target unit (for precise targeting)
                    const isMouseInsideUnit = targetUnit.getCells().some((c) => c.x === cell.x && c.y === cell.y);

                    const isRangedUnit = this.currentActiveUnit.getAttackType() === AttackVals.RANGE;
                    const canStaticRangeAttack = this.canAttackByRangeTargets?.has(targetUnit.getId());
                    let isRangeAttackContext = false;

                    let skipMeleeCheck = this.currentActiveUnit.hasAbilityActive("No Melee");

                    const canPerformRangeAttack =
                        this.currentActiveUnit.getAttackType() === AttackVals.RANGE &&
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
                    if (
                        canPerformRangeAttack &&
                        !isRangeAttackContext &&
                        isRangedUnit &&
                        !this.currentActiveUnit.hasAbilityActive("Handyman")
                    ) {
                        // Handyman behaves as melee for some reason? Legacy checked it.
                        // If we are not adjacent/melee preferred, try finding a shooting spot
                        // Or if strictly out of range
                        // Let's assume user wants to shoot if possible

                        const shotDist = this.currentActiveUnit.getRangeShotDistance();
                        const attackRangeForCalc = Math.max(1, shotDist); // Use Shot Distance for pathfinding!

                        // Try to find a spot within shot_distance using existing pathfinding
                        // Note: calculateClosestAttackFrom checks REACHABLE cells.
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
                        this.hoverManager.addTargetHighlight(targetUnit);

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

                        // If we targeted a specific cell (Priority 1), force visual to that cell
                        // FIX TRAJECTORY: Use Centers for Large Units for the Arrow
                        // Calculate Attacker Center (Start)
                        // If attackFromPos is defined, it is a Cell Center (0.5).
                        // FIX TRAJECTORY: Use Centers for Large Units for the Arrow

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
                        let multiplier = 1;

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

                        // Double Shot Logic
                        if (isRangeAttackContext && this.currentActiveUnit.hasAbilityActive("Double Shot")) {
                            multiplier = 2; // Display double damage
                        }

                        const minDmg = this.currentActiveUnit.calculateAttackDamageMin(
                            attackRate,
                            targetUnit,
                            isMelee,
                            abilityPower,
                            rangeDivisor,
                            multiplier,
                        );
                        const maxDmg = this.currentActiveUnit.calculateAttackDamageMax(
                            attackRate,
                            targetUnit,
                            isMelee,
                            abilityPower,
                            rangeDivisor,
                            multiplier,
                        );

                        const minKills = targetUnit.calculatePossibleLosses(minDmg);
                        const maxKills = targetUnit.calculatePossibleLosses(maxDmg);

                        let predictionText = "";
                        let iconPath: string | undefined = undefined;

                        if (maxKills > 0) {
                            predictionText = minKills === maxKills ? `${minKills}` : `${minKills}-${maxKills}`;
                            iconPath = images.skull_white;
                        } else {
                            predictionText = minDmg === maxDmg ? `${minDmg}` : `${minDmg}-${maxDmg}`;
                            // iconPath remains undefined
                        }

                        this.hoverManager.drawDamagePrediction(
                            predictionText,
                            centerVis,
                            !targetUnit.isSmallSize(), // isLargeTarget
                            iconPath,
                        );
                        this.hoverManager.drawAttackArrow(arrowStartPos, tVis);
                        isAttacking = true;

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

                        // Add Red Highlight for Secondary Targets
                        for (const enemy of secondaryTargets) {
                            this.hoverManager.addTargetHighlight(enemy);
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
    private updateUnitsOverlayVisibility(): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const started = fightProps.hasFightStarted();
        if (this.unitsOverlay?.container) {
            this.unitsOverlay.container.visible = !started;
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
            this.unitsHolder.increaseUnitsSupplyIfNeededPerTeam(TeamVals.LOWER);
            this.unitsHolder.increaseUnitsSupplyIfNeededPerTeam(TeamVals.UPPER);
            this.unitsHolder.haveDistancesToClosestEnemiesDecreased();
            this.hasInitializedLap = false;
            FightStateManager.getInstance().getFightProperties().startFight();

            // Update team unit counts for hourglass/shield button conditions
            const fightProps = FightStateManager.getInstance().getFightProperties();
            let lowerCount = 0;
            let upperCount = 0;
            for (const unit of this.unitsHolder.getAllUnits().values()) {
                if (unit.getTeam() === TeamVals.LOWER) lowerCount++;
                else if (unit.getTeam() === TeamVals.UPPER) upperCount++;
            }
            fightProps.setTeamUnitsAlive(TeamVals.LOWER, lowerCount);
            fightProps.setTeamUnitsAlive(TeamVals.UPPER, upperCount);

            return super.startScene();
        }
        return false;
    }
    public override Destroy(): void {
        super.Destroy();
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
    public override Step(timeStep: number): void {
        this.cleanupDeadUnits();
        if (timeStep > 0) this.sc_stepCount.increment();
        this.sc_isAnimating = this.isAnimating();
        const fightStateManager = FightStateManager.getInstance();
        const fightProps = fightStateManager.getFightProperties();
        const fightStarted = fightProps.hasFightStarted();

        // AI section - delegate to AIController
        if (fightStarted && this.currentActiveUnit && this.aiController.shouldTriggerAI()) {
            this.aiController.triggerAIAction(1500);
        }

        // Update floating texts
        if (this.floatingTexts.length > 0) {
            this.floatingTexts = this.floatingTexts.filter((ft) => {
                ft.life -= timeStep;
                if (ft.life <= 0) {
                    ft.container.destroy();
                    return false;
                }
                const progress = 1 - ft.life / ft.maxLife;
                ft.container.alpha = 1 - Math.pow(progress, 3); // Slow fade out at end

                // Use velocity (total displacement) if set, otherwise default float up
                ft.container.x = ft.startX + ft.velX * progress;
                ft.container.y = ft.startY + ft.velY * progress;

                return true;
            });
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
            if (this.atmosphereAlpha < 1 || this.atmosphereLights.length > 0) {
                // Fade In
                if (this.atmosphereAlpha < 1) {
                    this.atmosphereAlpha += timeStep / 3;
                    if (this.atmosphereAlpha > 1) this.atmosphereAlpha = 1;
                    this.updateDungeonAtmosphere(true, this.atmosphereAlpha);
                }

                // Fire Flicker
                const now = HoCLib.getTimeMillis() / 1000;
                for (const light of this.atmosphereLights) {
                    const fLight = light as unknown as IFlickeringLight;
                    const offset = fLight._flickerOffset || 0;
                    const speed = fLight._flickerSpeed || 1;
                    const flicker = 0.8 + 0.2 * Math.sin(now * speed + offset); // Base 0.8, varies +/- 0.2
                    light.alpha = flicker;
                    // Optional: slight scale pulse?
                    // const s = 1.0 + 0.05 * Math.sin(now * speed * 1.5 + offset);
                    // light.scale.set(s, s);
                }
            }

            this.cleanupDeadUnits();
            this.hoverManager.setLastPlacement(undefined);

            // --- A. TURN TIMER LOGIC ---
            if (HoCLib.getTimeMillis() >= fightProps.getCurrentTurnEnd()) {
                if (this.currentActiveUnit) {
                    this.currentActiveUnit.decreaseMorale(
                        HoCConstants.MORALE_CHANGE_FOR_SKIP,
                        fightProps.getAdditionalMoralePerTeam(this.currentActiveUnit.getTeam()),
                    );
                    this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} skip turn`);
                }
                this.finishTurn();
            }

            if (this.cellToUnitPreRound) {
                this.cellToUnitPreRound = undefined;
            }

            // --- B. WIN CONDITION & NEXT UNIT SELECTION ---
            if (!this.currentActiveUnit) {
                const unitsUpper = this.unitsHolder.getAllAllies(TeamVals.UPPER) as RenderableUnit[];
                const unitsLower = this.unitsHolder.getAllAllies(TeamVals.LOWER) as RenderableUnit[];

                // No enemies on one side → finish fight
                if (!unitsUpper.length || !unitsLower.length) {
                    this.finishFight(unitsLower.length ? TeamVals.LOWER : TeamVals.UPPER);
                } else {
                    // --- New: replicate old "allUnitsMadeTurn" behaviour ---

                    // 1) First-lap initialization guard
                    //    (same idea as old `turnFlipped` check: when fight just started and
                    //     nothing is in hourglass or up-next queues yet, we need to seed the lap)
                    const initFirstLap =
                        fightProps.getCurrentLap() === 1 &&
                        !fightProps.getHourglassQueueSize() &&
                        !fightProps.getUpNextQueueSize();

                    // 2) True when EVERY living unit has an entry in alreadyMadeTurn
                    const allUnitsMadeTurn =
                        unitsUpper.every((u) => fightProps.hasAlreadyMadeTurn(u.getId())) &&
                        unitsLower.every((u) => fightProps.hasAlreadyMadeTurn(u.getId()));

                    if ((initFirstLap || allUnitsMadeTurn) && !fightProps.hasFightFinished()) {
                        this.handleLapFlip(unitsUpper, unitsLower, allUnitsMadeTurn);
                    }

                    // After possible lap flip, fight may have ended
                    if (!fightProps.hasFightFinished()) {
                        // FIX: Ensure 'upNextQueue' is fresh (e.g. handle Hourglass changes) before picking next unit
                        fightProps.prefetchNextUnitsToTurn(this.unitsHolder.getAllUnits(), unitsUpper, unitsLower);

                        const nextUnitId = fightProps.dequeueNextUnitId();
                        const nextUnit = nextUnitId ? this.unitsHolder.getAllUnits().get(nextUnitId) : undefined;
                        if (nextUnit) {
                            this.handleNextUnitActivation(nextUnit as RenderableUnit);
                        }
                    }
                }
            }

            // --- Movement animation (visual travel along route) ---
            if (this.moveAnimation) {
                this.stepMoveAnimation(timeStep);
            }

            // --- C. AI LOGIC - delegate to AIController ---
            if (
                this.currentActiveUnit &&
                this.aiController.shouldTriggerAI() &&
                !this.sc_isAnimating &&
                !this.moveAnimation
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
        this.updateLingeringTracks(timeStep);
        if (this.gameplayGraphics) {
            this.drawGameplayVisuals(this.gameplayGraphics);
        }

        for (const unit of this.unitsHolder.getAllUnits().values()) {
            const rUnit = unit as RenderableUnit;
            // Use PixiDrawer's unit container (Z=1000), not worldRoot directly.
            // This ensures units are ALWAYS above terrain (Z=20) and overlay (Z=60) but depth sorted inside.
            rUnit.syncVisual(this.drawer.getUnitsContainer(), this.sc_sceneSettings.getGridSettings());
            if (this.isActiveUnitMoving && this.moveAnimation?.unit === rUnit) {
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
                        !isHovered && !isShifted && u.getAttackType() === AttackVals.RANGE
                            ? u.getRangeShotDistance() * GridConstants.STEP
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
            lingeringTracks: this.lingeringTracks,
            hoveredMoveRange: this.sc_placementMoveRange,
        });
    }
    private handleNextUnitActivation(nextUnit: RenderableUnit): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const gs = this.sc_sceneSettings.getGridSettings();
        const worldRoot = this.pixiApp.getCamera();

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
        for (const unitIdNext of FightStateManager.getInstance().getFightProperties().getUpNextQueueIterable()) {
            const unitNext = this.unitsHolder.getAllUnits().get(unitIdNext);
            if (!unitNext) continue;
            unitsNext.unshift({
                amount: unitNext.getAmountAlive(),
                smallTextureName: unitNext.getSmallTextureName(),
                teamType: unitNext.getTeam(),
                isOnHourglass: unitNext.isOnHourglass(),
                isSkipping: unitNext.isSkippingThisTurn(),
            });
        }
        if (nextUnit) {
            unitsNext.push({
                amount: nextUnit.getAmountAlive(),
                smallTextureName: nextUnit.getSmallTextureName(),
                teamType: nextUnit.getTeam(),
                isOnHourglass: nextUnit.isOnHourglass(),
                isSkipping: nextUnit.isSkippingThisTurn(),
            });
        }
        if (this.sc_visibleState) {
            this.sc_visibleState.upNext = unitsNext;
            this.sc_visibleState.teamTypeTurn = nextUnit.getTeam();
            this.sc_visibleState.lapNumber = fightProps.hasFightStarted() ? fightProps.getCurrentLap() : 0;
            this.sc_visibleStateUpdateNeeded = true;
        }

        if (nextUnit.isSkippingThisTurn()) {
            this.currentActiveUnit.decreaseMorale(
                HoCConstants.MORALE_CHANGE_FOR_SKIP,
                fightProps.getAdditionalMoralePerTeam(this.currentActiveUnit.getTeam()),
            );
            this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} skip turn`);
            this.finishTurn();
            return;
        }

        this.sc_moveBlocked = false;
        this.refreshUnits();
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();
        nextUnit.setBoardSelected(true);
        fightProps.startTurn(nextUnit.getTeam());
        this.refreshVisibleStateIfNeeded();
        nextUnit.refreshPreTurnState(this.sc_sceneLog);
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

        fightProps.markFirstTurn();
        this.buttonManager.setButtonsRefreshLocked(false);
        this.buttonManager.refreshButtons(true);
    }
    private performArmageddon(units: RenderableUnit[], wave: number): boolean {
        let killed = false;
        for (const u of units) {
            // Replicating logic from Unit.applyArmageddonDamage to show visual feedback
            const NUMBER_OF_ARMAGEDDON_WAVES = 4;
            const MIN_ARMAGEDDON_DAMAGE_FIRST_WAVE = 75;

            const aw = Math.floor(wave);
            if (aw > 0 && aw <= NUMBER_OF_ARMAGEDDON_WAVES) {
                const canHitPartially = aw === 1;
                const part = aw / NUMBER_OF_ARMAGEDDON_WAVES;
                const props = u.getUnitProperties();
                const unitsTotal = props.amount_died + props.amount_alive;
                let armageddonDamage = 0;

                if (canHitPartially) {
                    armageddonDamage = Math.max(
                        MIN_ARMAGEDDON_DAMAGE_FIRST_WAVE,
                        Math.floor(props.max_hp * unitsTotal * part),
                    );
                } else {
                    const unitsDamaged = Math.ceil(unitsTotal * part);
                    armageddonDamage = unitsDamaged * props.max_hp;
                }

                this.showFloatingDamage(u.getPosition(), armageddonDamage);
            }

            u.applyArmageddonDamage(wave, this.sc_sceneLog);
            if (u.isDead()) {
                killed = true;
                this.sc_sceneLog.updateLog(`${u.getName()} died`);
                const deleted = this.unitsHolder.deleteUnitById(u.getId(), wave === 1);
                if (deleted) {
                    this.grid.cleanupAll(u.getId(), u.getAttackRange(), u.isSmallSize());
                    u.destroyVisuals();
                    if (this.selectedBoardUnit === u) {
                        this.selectedBoardUnit = undefined;
                    }
                }
            }
        }
        return killed;
    }
    private handleLapFlip(unitsUpper: RenderableUnit[], unitsLower: RenderableUnit[], allUnitsMadeTurn: boolean): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();

        const allCurrentUnits = [...unitsUpper, ...unitsLower];
        for (const u of allCurrentUnits) {
            u.setResponded(false);
            u.setOnHourglass(false);
        }

        if (this.attackHandler?.getDamageStatisticHolder().has(fightProps.getCurrentLap())) {
            fightProps.encounterDamageDealFact();
        }

        if (this.hasInitializedLap) {
            fightProps.flipLap();
            if (fightProps.isTimeToDryCenter()) {
                this.ensureCenterTerrainSprite();
                this.grid.cleanupCenterObstacle();
            }
        } else {
            this.hasInitializedLap = true;
        }

        const armageddonWave = fightProps.getArmageddonWave();
        let gotArmageddonKills = false;
        if (armageddonWave) {
            gotArmageddonKills = this.performArmageddon(unitsLower, armageddonWave) || gotArmageddonKills;
            gotArmageddonKills = this.performArmageddon(unitsUpper, armageddonWave) || gotArmageddonKills;
            if (gotArmageddonKills) {
                const unitsForAllTeams = this.unitsHolder.refreshUnitsForAllTeams();
                unitsLower = unitsForAllTeams[TeamVals.LOWER - 1] as RenderableUnit[];
                unitsUpper = unitsForAllTeams[TeamVals.UPPER - 1] as RenderableUnit[];
                if (!unitsLower?.length || !unitsUpper?.length) {
                    this.finishFight(unitsLower?.length ? TeamVals.LOWER : TeamVals.UPPER);
                    return;
                }
            }
        }

        const distancesDecreased = this.unitsHolder.haveDistancesToClosestEnemiesDecreased();
        let spawnedObstacles = false;
        if (allUnitsMadeTurn && (!distancesDecreased || fightProps.isNarrowingLap())) {
            let encounterCurrent = false;
            if (
                !distancesDecreased &&
                !FightStateManager.getInstance()
                    .getFightProperties()
                    .hasDamageDealFactPerLap(
                        FightStateManager.getInstance().getFightProperties().getCurrentLap() - 1,
                    ) &&
                !FightStateManager.getInstance().getFightProperties().isNarrowingLap()
            ) {
                FightStateManager.getInstance().getFightProperties().encounterAdditionalNarrowingLap();
                encounterCurrent = true;
            }
            const spawnLog = this.spawnObstacles(encounterCurrent);
            if (spawnLog) this.sc_sceneLog.updateLog(spawnLog);
            fightProps.increaseStepsMoraleMultiplier();
            spawnedObstacles = true;
            this.refreshVisibleStateIfNeeded(true);
        }

        if (!fightProps.hasFightFinished() && spawnedObstacles) {
            if (!gotArmageddonKills) {
                const unitsForAllTeams = this.unitsHolder.refreshUnitsForAllTeams();
                unitsLower = unitsForAllTeams[TeamVals.LOWER - 1] as RenderableUnit[];
                unitsUpper = unitsForAllTeams[TeamVals.UPPER - 1] as RenderableUnit[];
            }
            this.unitsHolder.refreshStackPowerForAllUnits();
        }

        const allUnits = [...unitsUpper, ...unitsLower];
        HoCLib.shuffle(allUnits);
        allUnits.sort((a, b) => b.getSpeed() - a.getSpeed());

        HoCLib.shuffle(unitsUpper);
        HoCLib.shuffle(unitsLower);
        unitsUpper.sort((a, b) => b.getSpeed() - a.getSpeed());
        unitsLower.sort((a, b) => b.getSpeed() - a.getSpeed());

        for (const u of allUnits) {
            if (!u.getMorale()) continue;
            const isPlusMorale = u.getMorale() > 0;
            const chance = HoCLib.getRandomInt(0, 100);
            if (chance < Math.abs(u.getMorale()) && !u.hasMindAttackResistance()) {
                if (isPlusMorale) {
                    const buff = new Spell({
                        spellProperties: HoCConfig.getSpellConfig("System", "Morale"),
                        amount: 1,
                    });
                    u.applyBuff(buff);
                    fightProps.enqueueMoralePlus(u.getId());
                    this.sc_sceneLog.updateLog(`${u.getName()} is on Morale this lap!`);
                } else {
                    const debuff = new Spell({
                        spellProperties: HoCConfig.getSpellConfig("System", "Dismorale"),
                        amount: 1,
                    });
                    u.applyDebuff(debuff);
                    fightProps.enqueueMoraleMinus(u.getId());
                    this.sc_sceneLog.updateLog(`${u.getName()} is on Dismorale this lap!`);
                }
            }
        }

        fightProps.prefetchNextUnitsToTurn(this.unitsHolder.getAllUnits(), unitsUpper, unitsLower);
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
    protected finishTurn = (isHourglass = false): void => {
        this.buttonManager.setButtonsRefreshLocked(true);
        if (!isHourglass && this.currentActiveUnit) {
            this.currentActiveUnit.minusLap();
        }
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
        if (!isHourglass && this.currentActiveUnit) {
            FightStateManager.getInstance()
                .getFightProperties()
                .addAlreadyMadeTurn(this.currentActiveUnit.getTeam(), this.currentActiveUnit.getId());
            FightStateManager.getInstance().getFightProperties().removeFromUpNext(this.currentActiveUnit.getId());
            this.currentActiveUnit.setOnHourglass(false);
        }
        // Ensure visual state is reset (Orange Badge -> Default)
        this.currentActiveUnit?.setActiveTurn(false);
        const gs = this.sc_sceneSettings.getGridSettings();
        const worldRoot = this.pixiApp.getCamera();
        this.currentActiveUnit?.syncVisual(worldRoot, gs);
        this.currentActiveUnit = undefined;
        this.sc_selectedAttackType = AttackVals.NO_ATTACK;
        this.sc_renderSpellBookOverlay = false;
        this.buttonManager.sc_renderSpellBookOverlay = false;
        this.spellBookOverlay?.setOpen(false);
        this.pixiApp.getWorldRoot().filters = [];
        this.unitsHolder.refreshStackPowerForAllUnits();
        this.buttonManager.refreshButtons(true);
    };
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
    protected finishFight(teamWin: TeamType): void {
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
    protected verifyButtonsTrigger(): void { }
    protected updateCurrentMovePath(currentCell: HoCMath.XY): void {
        if (!this.currentActiveUnit || this.moveAnimation) {
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

                this.canAttackByMeleeTargets = this.currentActiveUnit.attackMeleeAllowed(
                    enemyTeam,
                    positions,
                    adjacentEnemies,
                    movePath.cells,
                    movePath.knownPaths,
                );

                this.canAttackByRangeTargets = undefined;
                // Range Attack Logic
                // We use attackHandler.canLandRangeAttack to check general ability (no range bane, no adjacent enemies block)
                if (
                    this.currentActiveUnit.getAttackType() === AttackVals.RANGE &&
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
