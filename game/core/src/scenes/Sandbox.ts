import { v4 as uuidv4 } from "uuid";
import { Sprite, Graphics, Container, Text as PixiText, TextStyle, Texture } from "pixi.js";
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
    AI,
    IDamageStatistic,
} from "@heroesofcrypto/common";
import { UnitsOverlay } from "./UnitsOverlay";
import { DamageStatisticHolder } from "./DamageStats";
import { VisibleButtonState, IVisibleUnit } from "./VisibleState";
import { SceneSettings } from "./SceneSettings";
import { PixiScene, PixiSceneContext, registerScene } from "../pixi/PixiScene";
import { setSpawnFlowPhase } from "../pixi/PixiDrawablePlacement";
import { PlacementManager } from "./PlacementManager";
import { RenderableUnit } from "./RenderableUnit";
import { PixiRenderableSpell } from "./RenderableSpell";
import { HoverManager } from "./HoverManager";
import { ButtonManager } from "./ButtonManager";
import { MAX_HOLE_LAYERS } from "@/statics";
import { images } from "../generated/image_imports";

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
    private bgKey: "background_dark" | "background_light" = "background_dark";
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
    // --- Scene Setup ---
    private currentActiveUnit?: RenderableUnit;
    private currentShiftedUnit?: RenderableUnit;
    private currentActivePathHashes?: Set<number>;
    private currentActivePath?: HoCMath.XY[];
    private currentActiveKnownPaths?: Map<number, IWeightedRoute[]>;
    private spawnPulseDirection = 1;
    private performingAIAction = false;
    private hasInitializedLap = false;
    private gameplayGraphics?: Graphics;
    private currentActiveSpell?: PixiRenderableSpell;
    private holeContainer: Container;
    private drawnNarrowingLaps: Set<number> = new Set();
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

        this.holeContainer = new Container();
        this.holeContainer.sortableChildren = true;
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
            context.pixiSceneManager.getApplication(),
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
                },
                setSpellBookOverlay: (active) => {
                    this.sc_renderSpellBookOverlay = active;
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
    }
    public override getUnitsOverlay(): UnitsOverlay | undefined {
        return this.unitsOverlay;
    }
    public override CameraChanged(): void {
        this.attachToWorldRoot(this.placementGraphics, 100);
        this.attachToWorldRoot(this.gameplayGraphics, 55);
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
        const { unit, worldPath, destCell } = anim;
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
        if (this.sc_visibleState) {
            this.sc_visibleStateUpdateNeeded = true;
        }
        // Apply one final sync and default idle to reset any move effects
        unit.syncVisual(this.pixiSceneManager.getWorldRoot(), this.sc_sceneSettings.getGridSettings());
        // Reset sprite transform if we manipulated it
        unit.setSpriteRotation(0);
        // End the turn as before.
        this.finishTurn();
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
        const tex =
            this.texAny(this.bgKey) ??
            this.texAny(this.bgKey === "background_dark" ? "background_light" : "background_dark");
        if (!tex) return;
        const bg = new Sprite(tex);
        bg.anchor.set(0.5);
        const stage = this.pixiSceneManager.getApplication().stage;
        stage.addChildAt(bg, 0);
        this.bgSprite = bg;
        this.layoutBackgroundSquare();
    }
    private layoutBackgroundSquare(): void {
        if (!this.bgSprite) return;
        const { width: vw, height: vh } = this.pixiSceneManager.getViewportSize();
        const size = Math.min(vw, vh);
        this.bgSprite.x = vw * 0.5;
        this.bgSprite.y = vh * 0.5;
        this.bgSprite.width = size;
        this.bgSprite.height = size;
        const isLightMode = typeof localStorage !== "undefined" && localStorage.getItem("joy-mode") === "light";
        const wantKey = isLightMode ? "background_light" : "background_dark";
        const wantTex = this.texAny(wantKey);
        if (wantTex && this.bgKey !== wantKey) {
            this.bgKey = wantKey;
            this.bgSprite.texture = wantTex;
        }
    }
    private attachToWorldRoot(obj: Graphics | Sprite | Container | undefined, zIndex: number): void {
        if (!obj) return;
        const worldRoot = this.pixiSceneManager.getWorldRoot();
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
        return renderableUnit;
    }
    public override Resize(w: number, h: number): void {
        // 1) Let the base scene update camera, worldRoot, etc.
        super.Resize(w, h);
        // 2) Background is in screen-space
        this.layoutBackgroundSquare();
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
        // to the old worldRoot should be re-attached to the new one.
        this.attachToWorldRoot(this.holeContainer, 20);
        this.attachToWorldRoot(this.gameplayGraphics, 55);
        this.attachToWorldRoot(this.centerTerrainSprite, 50);
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
        const texName = `spacehole_${layerIndex}`;
        const tex = this.texAny(texName);
        if (!tex) return;

        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5);

        const gs = this.sc_sceneSettings.getGridSettings();
        const centerX = gs.getMinX() + gs.getMaxX();
        const centerY = (gs.getMinY() + gs.getMaxY()) * 0.5;

        sprite.x = centerX;
        sprite.y = centerY;

        // Ensure scale is correct for coordinate system (Y up)
        sprite.scale.y = 2;
        sprite.scale.x = 2;

        this.holeContainer.addChild(sprite);
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
                rUnit.syncVisual(this.pixiSceneManager.getWorldRoot(), this.sc_sceneSettings.getGridSettings());
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
    private captureHealthState(): Map<string, { hp: number; amount: number }> {
        const m = new Map<string, { hp: number; amount: number }>();
        for (const u of this.unitsHolder.getAllUnits().values()) {
            m.set(u.getId(), { hp: u.getCumulativeHp(), amount: u.getAmountAlive() });
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
            if (ignoredUnitIds && ignoredUnitIds.has(id)) continue;

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
                this.showFloatingDamage(center, diff, direction, unitsDied);

                // UI Update
                if (this.sc_selectedUnitProperties && this.sc_selectedUnitProperties.id === id) {
                    this.sc_selectedUnitProperties = { ...u.getUnitProperties() };
                    this.sc_unitPropertiesUpdateNeeded = true;
                }
            }
        }
    }
    protected landAttack(): boolean {
        if (!this.currentActiveUnit) return false;

        // 1. MELEE
        if (!this.currentActiveSpell) {
            const preHealth = this.captureHealthState();

            const damageForAnimation: IVisibleDamage = {
                amount: 0,
                render: false,
                unitPosition: { x: 0, y: 0 },
                unitIsSmall: true,
                hits: [],
            };

            const meleeAttackResult = this.attackHandler.handleMeleeAttack(
                this.unitsHolder,
                this.moveHandler,
                damageForAnimation,
                this.currentActiveKnownPaths,
                this.currentActiveUnit,
                this.hoverManager.hoverAttackUnits?.[0]?.[0],
                this.hoverManager.hoverAttackFromCell,
            );

            // Handle visual logic using detailed hits if available
            const ignoredIds = new Set<string>();
            const targetUnit = this.hoverManager.hoverAttackUnits?.[0]?.[0];
            let direction: HoCMath.XY | undefined;

            if (targetUnit && damageForAnimation.hits && damageForAnimation.hits.length > 0) {
                ignoredIds.add(targetUnit.getId());

                const gs = this.sc_sceneSettings.getGridSettings();
                const center =
                    targetUnit instanceof RenderableUnit ? targetUnit.getVisualCenter(gs) : targetUnit.getPosition();
                const attCell =
                    this.hoverManager.hoverAttackFromCell ||
                    (this.currentActiveUnit
                        ? GridMath.getCellForPosition(gs, this.currentActiveUnit.getPosition())
                        : undefined);
                let direction: HoCMath.XY | undefined;

                if (attCell) {
                    const attPos = GridMath.getPositionForCell(attCell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
                    if (attPos) {
                        direction = { x: center.x - attPos.x, y: center.y - attPos.y };
                    }
                }

                if (damageForAnimation.hits && damageForAnimation.hits.length > 0) {
                    // Visualize hits
                    for (let i = 0; i < damageForAnimation.hits.length; i++) {
                        const hit = damageForAnimation.hits[i];
                        let pos = { ...center };

                        if (direction && damageForAnimation.hits.length > 1) {
                            const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
                            if (len > 0.001) {
                                const ndx = direction.x / len;
                                const ndy = direction.y / len;
                                // Strategy: First hit is "Deep" (+75), Second hit is "Closer" (+20)
                                // "away from attacker" = +Direction
                                let offset = 0;
                                if (i === 0) {
                                    offset = 75;
                                } else if (i === 1) {
                                    offset = 20;
                                }

                                pos.x += ndx * offset;
                                pos.y += ndy * offset;
                            }
                        }

                        // Use the per-hit unitsDied value we captured in AttackHandler
                        if (i === 0) {
                            this.showFloatingDamage(pos, hit.amount, direction, hit.unitsDied);
                        } else {
                            setTimeout(() => {
                                this.showFloatingDamage(pos, hit.amount, direction, hit.unitsDied);
                            }, i * 1000);
                        }
                    }
                }
            }

            this.showDamageVisualsFromDiff(
                preHealth,
                this.hoverManager.hoverAttackFromCell,
                ignoredIds,
                direction, // Pass primary attack direction for AoE uniformity
            );

            if (this.hoverManager.hoverAttackFromCell) {
                // Animation logic if needed
            }
            if (meleeAttackResult.completed) {
                for (const uId of meleeAttackResult.unitIdsDied) {
                    const unit = this.unitsHolder.getAllUnits().get(uId);
                    this.unitsHolder.deleteUnitById(uId, true);
                    this.layoutVersion++;
                    this.grid.cleanupAll(uId, 0, true);
                    if (unit && unit instanceof RenderableUnit) {
                        unit.destroyVisuals();
                    }
                }
                if (this.sc_selectedUnitProperties) {
                    const u = this.unitsHolder.getAllUnits().get(this.sc_selectedUnitProperties.id);
                    if (u) {
                        this.sc_selectedUnitProperties = { ...u.getUnitProperties() };
                    }
                    this.sc_unitPropertiesUpdateNeeded = true;
                }
                this.sc_damageStatsUpdateNeeded = true;
                return true;
            }
        }

        // 2. RANGED
        if (this.hoverManager.hoverAttackUnits && this.hoverManager.hoverAttackUnits.length > 0) {
            const preHealth = this.captureHealthState();

            const rangeDamageData: IVisibleDamage = {
                amount: 0,
                render: false,
                unitPosition: { x: 0, y: 0 },
                unitIsSmall: true,
                hits: [],
            };

            const rangeAttackResult = this.attackHandler.handleRangeAttack(
                this.unitsHolder,
                this.hoverRangeAttackDivisors,
                1,
                rangeDamageData,
                this.currentActiveUnit,
                this.hoverManager.hoverAttackUnits,
                [],
                this.sc_hoveredShotRange?.xy,
                false,
                false,
            );

            // Handle visual logic using detailed hits if available
            const ignoredIds = new Set<string>();
            const targetUnit = this.hoverManager.hoverAttackUnits?.[0]?.[0];
            let direction: HoCMath.XY | undefined; // Lifted declaration

            if (targetUnit && rangeDamageData.hits && rangeDamageData.hits.length > 0) {
                ignoredIds.add(targetUnit.getId());

                const gs = this.sc_sceneSettings.getGridSettings();
                const center =
                    targetUnit instanceof RenderableUnit ? targetUnit.getVisualCenter(gs) : targetUnit.getPosition();
                const attCell = this.currentActiveUnit.getPosition()
                    ? GridMath.getCellForPosition(gs, this.currentActiveUnit.getPosition())
                    : undefined;
                // Note: Range attack doesn't strictly have "hoverAttackFromCell". Uses unit position.

                if (attCell) {
                    const attPos = GridMath.getPositionForCell(attCell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
                    if (attPos) {
                        direction = { x: center.x - attPos.x, y: center.y - attPos.y };
                    }
                }

                if (rangeDamageData.hits && rangeDamageData.hits.length > 0) {
                    // Visualize hits
                    for (let i = 0; i < rangeDamageData.hits.length; i++) {
                        const hit = rangeDamageData.hits[i];
                        let pos = { ...center };

                        if (direction && rangeDamageData.hits.length > 1) {
                            const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
                            if (len > 0.001) {
                                const ndx = direction.x / len;
                                const ndy = direction.y / len;
                                // Strategy: First hit is "Deep" (+75), Second hit is "Closer" (+20)
                                // "away from attacker" = +Direction
                                let offset = 0;
                                if (i === 0) {
                                    offset = 75;
                                } else if (i === 1) {
                                    offset = 20;
                                }
                                pos.x += ndx * offset;
                                pos.y += ndy * offset;
                            }
                        }

                        // Use the per-hit unitsDied value we captured in AttackHandler
                        if (i === 0) {
                            this.showFloatingDamage(pos, hit.amount, direction, hit.unitsDied);
                        } else {
                            setTimeout(() => {
                                this.showFloatingDamage(pos, hit.amount, direction, hit.unitsDied);
                            }, i * 1000);
                        }
                    }
                }
            }

            this.showDamageVisualsFromDiff(
                preHealth,
                undefined,
                ignoredIds,
                direction, // Pass primary direction for AoE uniformity
            );

            if (rangeAttackResult.completed) {
                for (const uId of rangeAttackResult.unitIdsDied) {
                    const unit = this.unitsHolder.getAllUnits().get(uId);
                    this.unitsHolder.deleteUnitById(uId, true);
                    this.layoutVersion++;
                    this.grid.cleanupAll(uId, 0, true);
                    if (unit && unit instanceof RenderableUnit) {
                        unit.destroyVisuals();
                    }
                }
                if (this.sc_selectedUnitProperties) {
                    const u = this.unitsHolder.getAllUnits().get(this.sc_selectedUnitProperties.id);
                    if (u) {
                        this.sc_selectedUnitProperties = { ...u.getUnitProperties() };
                    }
                    this.sc_unitPropertiesUpdateNeeded = true;
                }
                this.sc_damageStatsUpdateNeeded = true;
                return true;
            }
        }

        return false;
    }
    private performAIAction(wasAIActive: boolean): void {
        if (!this.currentActiveUnit) return;

        let actionPerformed = false;

        const action = AI.findTarget(
            this.currentActiveUnit,
            this.grid,
            this.gridMatrix,
            this.unitsHolder,
            this.pathHelper,
        );

        if (action?.actionType() === AI.AIActionType.MOVE_AND_MELEE_ATTACK) {
            if (this.currentActiveUnit.selectAttackType(AttackVals.MELEE)) {
                this.buttonManager.refreshButtons(true);
                this.refreshUnits();
            }
            // "Area Throw" checks ommitted for brevity unless critical
            this.sc_selectedAttackType = this.currentActiveUnit.getAttackTypeSelection();
            this.currentActiveKnownPaths = action.currentActiveKnownPaths();
            const cellToAttack = action.cellToAttack();

            if (cellToAttack) {
                const targetUnitId = this.grid.getOccupantUnitId(cellToAttack);
                if (targetUnitId !== undefined) {
                    const unitToAttack = this.unitsHolder.getAllUnits().get(targetUnitId);
                    if (unitToAttack) {
                        this.hoverManager.hoverAttackUnits = [[unitToAttack]];
                    }
                    const attackedCell = action.cellToMove();
                    if (attackedCell) {
                        this.hoverManager.hoverAttackFromCell = attackedCell;
                        if (this.currentActiveUnit.isSmallSize()) {
                            this.hoverManager.hoverSelectedCells = [attackedCell];
                        } else {
                            const position = GridMath.getPositionForCell(
                                attackedCell,
                                this.sc_sceneSettings.getGridSettings().getMinX(),
                                this.sc_sceneSettings.getGridSettings().getStep(),
                                this.sc_sceneSettings.getGridSettings().getHalfStep(),
                            );
                            this.hoverManager.hoverSelectedCells = GridMath.getCellsAroundPosition(
                                this.sc_sceneSettings.getGridSettings(),
                                {
                                    x: position.x - this.sc_sceneSettings.getGridSettings().getHalfStep(),
                                    y: position.y - this.sc_sceneSettings.getGridSettings().getHalfStep(),
                                },
                            );
                        }
                    }
                }
            }
            // Trigger attack
            // Instead of `landAttack`, Sandbox prefers `executeAttackSequence`.
            // But `executeAttackSequence` expects a click-like structure.
            // Let's call `MouseDown` logic? No, too risky.
            // Let's try to reuse `landAttack` if we implement it properly or use `executeAttackSequence` manually.
            if (this.hoverManager.hoverAttackUnits?.[0]?.[0]) {
                // We need to move first if separate move?
                // AI actions like MOVE_AND_MELEE are bundled.
                // `test_heroes` `landAttack` handles both move and attack via `attackHandler`.
                actionPerformed = this.landAttack(); // Rely on our ported landAttack
            }
        } else if (action?.actionType() === AI.AIActionType.MELEE_ATTACK) {
            if (this.currentActiveUnit.selectAttackType(AttackVals.MELEE)) {
                this.buttonManager.refreshButtons(true);
                this.refreshUnits();
            }
            this.currentActiveKnownPaths = action.currentActiveKnownPaths();
            const cellToAttack = action.cellToAttack();
            if (cellToAttack) {
                const targetUnitId = this.grid.getOccupantUnitId(cellToAttack);
                if (targetUnitId) {
                    const u = this.unitsHolder.getAllUnits().get(targetUnitId);
                    if (u) this.hoverManager.hoverAttackUnits = [[u]];
                    const fromCell = action.cellToMove();
                    if (fromCell) this.hoverManager.hoverAttackFromCell = fromCell;
                }
            }
            actionPerformed = this.landAttack();
        } else if (action?.actionType() === AI.AIActionType.RANGE_ATTACK) {
            if (this.currentActiveUnit.selectAttackType(AttackVals.RANGE)) {
                this.buttonManager.refreshButtons(true);
                this.refreshUnits();
            }
            this.currentActiveKnownPaths = action.currentActiveKnownPaths();
            // Setup hover for range
            // ...
            // For now, minimal support or use landAttack
            actionPerformed = this.landAttack();
        } else {
            // Move only
            const cellToMove = action?.cellToMove();
            if (cellToMove && this.currentActiveUnit.canMove()) {
                // Sandbox move logic
                // We can use `executeMoveSequence` if we have the path
                const movePaths = action?.currentActiveKnownPaths()?.get((cellToMove.x << 4) | cellToMove.y);
                if (movePaths?.length) {
                    const route = movePaths[0].route;
                    this.executeMoveSequence(this.currentActiveUnit, route);
                    actionPerformed = true;
                }
            }
        }

        if (!actionPerformed) {
            this.currentActiveUnit.decreaseMorale(
                HoCConstants.MORALE_CHANGE_FOR_SKIP,
                FightStateManager.getInstance()
                    .getFightProperties()
                    .getAdditionalMoralePerTeam(this.currentActiveUnit.getTeam()),
            );
            this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} skip turn`);
        }

        this.finishTurn();
        this.sc_isAIActive = wasAIActive;
        this.performingAIAction = false;
    }
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
    protected finishDrop(_p: HoCMath.XY): void {}
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
                    const scale = newUnit.ensureVisual(this.pixiSceneManager.getWorldRoot(), gs);
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
    public deleteObject(): void {}
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
    public setGridType(gridType: GridType): void {
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
        const scale = unit.ensureVisual(this.pixiSceneManager.getWorldRoot(), gs);
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
        console.log(
            `Placed ${selected.name} (size=${selected.size}) at (${placePos.x}, ${placePos.y}) for team ${teamType}`,
        );
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
                            this.executeAttackSequence(
                                this.currentActiveUnit,
                                targetUnit as RenderableUnit,
                                this.hoverManager.hoverAttackFromCell,
                            );
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
                pos: u.getPosition(),
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
            );
        } else {
            this.attackHandler.handleMeleeAttack(
                this.unitsHolder,
                this.moveHandler,
                damageForAnimation,
                this.currentActiveKnownPaths,
                attacker,
                target,
                attackFrom,
            );
        }

        // 1. Target Damage
        if (damageForAnimation.amount > 0) {
            // Target damage floats away from attacker
            // attacker might have moved to `attackFrom`

            // Recalculate attacker visual center at `attackFrom`
            // Since handleMeleeAttack updates the logical position of the unit to `attackFrom`,
            // we can simply ask the unit for its visual center.
            const gs = this.sc_sceneSettings.getGridSettings();
            const aCenter = attacker.getVisualCenter(gs);

            // Target visual pos:

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rTarget = target as any;
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
                        if (index === 0) {
                            offset = 75;
                        } else if (index === 1) {
                            offset = 20;
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
                alreadyShown = damageForAnimation.amount;
            }

            const unaccountedDiff = diff - alreadyShown;

            if (unaccountedDiff > 0) {
                // Use primary 'primaryAttackDir' so it matches the attacker's main attack angle
                // Need visual center. If unitRef is valid, use it.

                let visPos: HoCMath.XY;
                const unitRef = u || this.unitsHolder.getAllUnits().get(uId); // Re-introduce unitRef for visPos
                if (unitRef) {
                    const ru = unitRef as RenderableUnit;
                    visPos = typeof ru.getVisualCenter === "function" ? ru.getVisualCenter(gs) : unitRef.getPosition();
                } else {
                    // Unit Gone -> Use snapshot position
                    visPos = snap.pos;
                }

                this.showFloatingDamage(visPos, unaccountedDiff, primaryAttackDir, diedCount);
            }
        }

        // Handle animations if needed (e.g. movement, hits)
        // if (result.animationData) {
        // TODO: Port animation playback logic (move, bullet, etc)
        // For now, we rely on state updates, but movement might jump without animation.

        // Cleanup and finish turn
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
    }
    private executeMoveSequence(unit: RenderableUnit, path: HoCMath.XY[], overrideFootprint?: HoCMath.XY[]): void {
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
            // Large unit: we only know start and final footprint → straight line A → B.
            worldPath.push({ x: newWorldPos.x, y: newWorldPos.y });
        } else {
            // Small units (or future large units with real route): follow the full route.
            for (let i = 0; i < path.length; i++) {
                const cell = path[i];
                const pos = GridMath.getPositionForCell(cell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
                if (pos) {
                    const last = worldPath[worldPath.length - 1];
                    if (!last || last.x !== pos.x || last.y !== pos.y) {
                        worldPath.push(pos);
                    }
                }
            }
            // Ensure last point matches logical final position.
            const last = worldPath[worldPath.length - 1];
            if (!last || last.x !== newWorldPos.x || last.y !== newWorldPos.y) {
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

        // [MoraleDebug] Verify paths are available before clearing
        const debugKey = (destCell.x << 4) | destCell.y;
        console.log(
            `[MoraleDebug] Applying move modifiers. Unit: ${unit.getName()}, Dest: ${destCell.x},${destCell.y}, Key: ${debugKey}`,
        );
        console.log(`[MoraleDebug] KnownPaths size: ${this.currentActiveKnownPaths?.size}`);
        if (this.currentActiveKnownPaths?.has(debugKey)) {
            console.log(`[MoraleDebug] Path found for key.`);
        } else {
            console.log(`[MoraleDebug] Path NOT found for key!`);
        }

        this.moveHandler.applyMoveModifiers(
            destCell,
            unit,
            fightProperties.getAdditionalAbilityPowerPerTeam(unit.getTeam()),
            fightProperties.getAdditionalMoralePerTeam(unit.getTeam()),
            this.currentActiveKnownPaths,
        );

        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.currentActivePathHashes = undefined;
        this.hoverManager.clearHoverSilhouette();
        this.hoverManager.hoveredUnitHighlight = undefined;
        this.sc_moveBlocked = true;
    }
    protected override hover(): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();

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
            if (this.sc_isAnimating || !this.sc_mouseWorld) {
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
                    let skipMeleeCheck = false;

                    // 1. Static Range Priority
                    // Relaxed check: Allow visualization even if technically out of 'shot_distance' (for Penalty logic)
                    if (
                        canStaticRangeAttack ||
                        (isRangedUnit && !this.currentActiveUnit.hasAbilityActive("Handyman"))
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
                    if (!isRangeAttackContext && isRangedUnit && !this.currentActiveUnit.hasAbilityActive("Handyman")) {
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

                                    console.log("ssss-1");
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
                                console.log("attackFromPos-2");
                                console.log(attackFromPos);
                                console.log("ssss-2");
                            }

                            this.hoverManager.updateHoverSilhouette(attackFromPos);
                        } else {
                            // Static Range Attack (No movement)
                            attackFromPos = this.currentActiveUnit.getPosition();
                            attackFromCell = GridMath.getCellForPosition(gs, attackFromPos);
                            this.hoverManager.hoverAttackFromCell = attackFromCell;
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

                            console.log(`ssss1`);
                        } else {
                            // Moving to new Anchor
                            arrowStartPos = { ...attackFromPos };
                            // attackFromPos is Center of Anchor Cell (0.5).
                            // Convert to Top-Left of Anchor Cell (0.0)
                            // if (!this.currentActiveUnit.isSmallSize()) {
                            //     arrowStartPos.x -= gs.getHalfStep();
                            //     arrowStartPos.y -= gs.getHalfStep();
                            // }
                            // Add Center Offset (since we are using Grid Math)
                            // const centerOffset = this.currentActiveUnit.isSmallSize() ? gs.getHalfStep() : gs.getStep();
                            // arrowStartPos.x += centerOffset;
                            // arrowStartPos.y += centerOffset;
                            // away from the top-left position where the texture is drawn.
                            // const centerOffset = gs.getStep(); // One full cell size in world space.

                            // attackFromPos is the top-left (anchor) of the new sprite position.
                            // Add 1 cell size in X and Y to get the visual center.
                            // arrowStartPos.x += centerOffset;
                            // arrowStartPos.y += centerOffset;

                            console.log(`Calculated move-attack start: (${arrowStartPos.x}, ${arrowStartPos.y})`);
                        }

                        // Range Offset Logic (-0.5/-1.0)
                        if (isRangeAttackContext) {
                            const userOffset = this.currentActiveUnit.isSmallSize() ? gs.getHalfStep() : gs.getStep();
                            arrowStartPos.x -= userOffset;
                            arrowStartPos.y -= userOffset;
                            console.log(`ssss3`);
                        }
                        // Calculate Target Center (End)
                        // Use Legacy Helper for precise side selection for ALL units.
                        // This handles both Small (2 edges) and Large (outer perimeter edges) correctly.
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
                        console.log("attackFromPos4");
                        console.log(attackFromPos);
                        console.log(`ssss4`);

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

                        this.hoverManager.drawDamagePrediction(
                            `${minDmg}-${maxDmg}`,
                            centerVis,
                            !targetUnit.isSmallSize(), // isLargeTarget
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
        console.log(`Sandbox: KeyDown key='${e.key}' code='${e.code}' alt=${e.altKey}`);
        if (e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight") {
            const fightProps = FightStateManager.getInstance().getFightProperties();
            if (!fightProps.hasFightStarted()) {
                console.log("Sandbox: Showing all amounts");
                this.unitsOverlay.setShowAllAmounts(true);
            } else {
                console.log("Sandbox: Fight started, ignoring Alt");
            }
        }
    };
    private handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === "Alt") {
            console.log("Sandbox: Alt released");
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
        this.sc_isAnimating = this.pixiSceneManager.isAnimating();
        const fightStateManager = FightStateManager.getInstance();
        const fightProps = fightStateManager.getFightProperties();
        const fightStarted = fightProps.hasFightStarted();

        // AI section
        if (
            fightStarted &&
            this.currentActiveUnit &&
            (this.sc_isAIActive || this.currentActiveUnit?.hasAbilityActive("AI Driven")) &&
            !this.performingAIAction
        ) {
            this.performingAIAction = true;
            setTimeout(() => {
                if (!this.currentActiveUnit) {
                    this.performingAIAction = false;
                    return;
                }
                const wasAIActive = this.sc_isAIActive;
                this.sc_isAIActive = true;
                this.buttonManager.refreshButtons(true);
                this.performAIAction(wasAIActive);
            }, 750);
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

            // --- C. AI LOGIC ---
            if (
                this.currentActiveUnit &&
                (this.sc_isAIActive || this.currentActiveUnit?.hasAbilityActive("AI Driven")) &&
                !this.performingAIAction &&
                !this.sc_isAnimating &&
                !this.moveAnimation
            ) {
                const wasAIActive = this.sc_isAIActive;
                this.performingAIAction = true;
                setTimeout(() => {
                    this.sc_isAIActive = true;
                    this.buttonManager.sc_isAIActive = true;
                    this.performAIAction(wasAIActive);
                }, 1000); // 1000ms delay for smoothness
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
            rUnit.syncVisual(this.pixiSceneManager.getWorldRoot(), this.sc_sceneSettings.getGridSettings());
            if (this.isActiveUnitMoving && this.moveAnimation?.unit === rUnit) {
                rUnit.applyMoveEffect(this.spawnPulsePhase);
            } else {
                rUnit.stepSpawnAnimation(timeStep);
            }
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
        const worldRoot = this.pixiSceneManager.getWorldRoot();

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
            console.log(
                `Finished turn ${this.currentActiveUnit.getName()} lap ${FightStateManager.getInstance()
                    .getFightProperties()
                    .getCurrentLap()}`,
            );
            // Ensure visual state is reset (Orange Badge -> Default)
            this.currentActiveUnit.setActiveTurn(false);
            const gs = this.sc_sceneSettings.getGridSettings();
            const worldRoot = this.pixiSceneManager.getWorldRoot();
            this.currentActiveUnit.syncVisual(worldRoot, gs);
        }
        this.currentActiveUnit = undefined;
        this.sc_selectedAttackType = AttackVals.NO_ATTACK;
        this.sc_renderSpellBookOverlay = false;
        this.buttonManager.sc_renderSpellBookOverlay = false;
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
    protected verifyButtonsTrigger(): void {}
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
                movePath = {
                    cells: [currentCell],
                    knownPaths: new Map<number, IWeightedRoute[]>(), // No paths to travel
                    hashes: new Set<number>([(currentCell.x << 4) | currentCell.y]),
                };
                // Explicitly valid "move" to self
                movePath.knownPaths.set((currentCell.x << 4) | currentCell.y, []);
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
