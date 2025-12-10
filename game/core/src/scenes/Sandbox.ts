// game/core/src/scenes/Sandbox.ts
import { v4 as uuidv4 } from "uuid";
import { Sprite, Graphics, Container, Text as PixiText, TextStyle } from "pixi.js";
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

export class Sandbox extends PixiScene {
    private readonly grid: Grid;
    private readonly pathHelper: PathHelper;
    private canAttackByMeleeTargets?: IAttackTargets;
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
    private hoverRangeAttackDivisors: number[] = [];
    private currentActiveUnit?: RenderableUnit;
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
        for (const utd of unitsToDestroy) {
            const unitId = utd.getId();
            if (destroyedUnitIds.has(unitId)) continue;
            // 1) Remove from UnitsHolder
            const deleted = this.unitsHolder.deleteUnitById(unitId, isDead);
            if (!deleted) continue;
            // 2) Cleanup grid occupancy (we still have the Unit instance `utd`)
            this.grid.cleanupAll(unitId, utd.getAttackRange(), utd.isSmallSize());
            // 3) Remove Pixi visuals + selection
            utd.destroyVisuals();
            if (this.selectedBoardUnit === utd) {
                this.selectedBoardUnit = undefined;
            }
            destroyedUnitIds.add(unitId);
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
            this.refreshUnits();
            if (this.sc_selectedUnitProperties) {
                this.setSelectedUnitProperties(this.sc_selectedUnitProperties);
            }
            this.sc_unitPropertiesUpdateNeeded = true;
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
    protected landAttack(): boolean {
        return false;
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
    protected finishDrop(_p: HoCMath.XY): void { }
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
    public deleteObject(): void { }
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
        console.log("tryPlaceUnit called");
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
        } else {
            occupied = this.grid.occupyCells(
                cellsToOccupy,
                unit.getId(),
                unit.getTeam(),
                unit.getAttackRange(),
                hasMadeOfFire,
                hasMadeOfWater,
            );
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
        if (this.selectionFromOverlay) {
            this.sc_selectedUnitProperties = undefined;
            this.hoverManager.resetHover(true);
            if (this.unitsOverlay) this.unitsOverlay.clearSelection(true);
            this.hasActiveSelection = false;
            this.selectionFromOverlay = false;
        } else {
            // Board move
            if (this.selectedBoardUnit) {
                this.selectedBoardUnit.setBoardSelected(false);
                this.selectedBoardUnit = undefined;
            }
            this.clearBoardSelection();
            this.Deselect(false, true);
        }
        if (!fightProps.hasFightStarted()) {
            this.hoverManager.setLastPlacement(unit.getId());
        } else {
            this.hoverManager.setLastPlacement(undefined);
        }
    }
    protected destroyTempFixtures(): void {
        this.updateUnitsOverlayVisibility();
    }
    public override MouseDown(p: HoCMath.XY): void {
        this.sc_mouseWorld = p;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        // 1. FIGHT STARTED INTERACTION
        if (fightProps.hasFightStarted()) {
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
        if (this.hasActiveSelection && this.sc_selectedUnitProperties) {
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
            return;
        }
        super.MouseDown(p);
    }
    private floatingTexts: {
        text: PixiText;
        life: number;
        maxLife: number;
        startY: number;
        startX: number;
        velX: number;
        velY: number;
    }[] = [];
    private showFloatingDamage(pos: HoCMath.XY, amount: number, direction?: HoCMath.XY): void {
        const text = new PixiText({
            text: `-${amount}`,
            style: new TextStyle({
                fontFamily: "Arial",
                fontSize: 36,
                fontWeight: "bold",
                fill: 0xff0000,
                stroke: { color: 0xffffff, width: 4 },
                dropShadow: {
                    color: 0x000000,
                    blur: 4,
                    angle: Math.PI / 6,
                    distance: 2,
                },
            }),
        });

        text.anchor.set(0.5);
        text.x = pos.x;
        text.y = pos.y - 40; // Start slightly above unit center
        text.scale.y = -1; // Flip Y because world is flipped

        // Ensure high Z-index
        this.attachToWorldRoot(text, 300);

        // Calculate velocity based on direction or default up
        let vx = 0;
        let vy = -80; // Default float "up" (Negative Y in Pixi)

        if (direction) {
            // Normalized direction * speed
            const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
            if (len > 0.001) {
                vx = (direction.x / len) * 100; // Speed 100
                vy = (direction.y / len) * 100;
            }
        }

        this.floatingTexts.push({
            text,
            life: 1.5,
            maxLife: 1.5,
            startY: text.y,
            startX: text.x,
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
        };

        const attackerBefore = { amount: attacker.getAmountAlive(), health: attacker.getHp() };

        const result = this.attackHandler.handleMeleeAttack(
            this.unitsHolder,
            this.moveHandler,
            damageForAnimation,
            this.currentActiveKnownPaths,
            attacker,
            target,
            attackFrom,
        );

        // 1. Target Damage
        if (damageForAnimation.amount > 0) {
            // Target damage floats away from attacker
            // attacker might have moved to `attackFrom`

            // Recalculate attacker visual center at `attackFrom`
            // (assuming attackFrom is anchor position)
            const gs = this.sc_sceneSettings.getGridSettings();

            // Attacker visual pos:
            // If attacker is large, we need to offset from `attackFrom` same way
            const aSize = attacker.getSize();
            const aOffset = aSize > 1 ? (aSize - 1) * 0.5 * gs.getCellSize() : 0;
            const aCenter = { x: attackFrom.x + aOffset, y: attackFrom.y + aOffset };

            // Target visual pos:
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rTarget = target as any;
            const tVis =
                typeof rTarget.getVisualCenter === "function" ? rTarget.getVisualCenter(gs) : target.getPosition();

            const dir = { x: tVis.x - aCenter.x, y: tVis.y - aCenter.y };
            this.showFloatingDamage(tVis, damageForAnimation.amount, dir);
        }

        // 2. Attacker Damage (Counter-Attack)
        const attackerAfter = { amount: attacker.getAmountAlive(), health: attacker.getHp() };

        const stackLost = attackerBefore.amount - attackerAfter.amount;
        const hpLost = attackerBefore.health - attackerAfter.health;

        if (stackLost > 0 || hpLost > 0) {
            const maxHp = attacker.getMaxHp();
            const totalHpBefore = (attackerBefore.amount - 1) * maxHp + attackerBefore.health;
            const totalHpAfter = (attackerAfter.amount - 1) * maxHp + attackerAfter.health;
            const damageTaken = totalHpBefore - totalHpAfter;

            if (damageTaken > 0) {
                // Attacker damage floats away from target
                const gs = this.sc_sceneSettings.getGridSettings();

                const aVis = attacker.getVisualCenter(gs);

                // Target visual center
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const rTarget = target as any;
                const tVis =
                    typeof rTarget.getVisualCenter === "function" ? rTarget.getVisualCenter(gs) : target.getPosition();

                const dir = { x: aVis.x - tVis.x, y: aVis.y - tVis.y };
                this.showFloatingDamage(aVis, damageTaken, dir);
            }
        }

        // Handle animations if needed (e.g. movement, hits)
        if (result.animationData) {
            // TODO: Port animation playback logic (move, bullet, etc)
            // For now, we rely on state updates, but movement might jump without animation.
        }

        if (result.completed) {
            const unitsDied: RenderableUnit[] = [];
            for (const uId of result.unitIdsDied) {
                const u = this.unitsHolder.getAllUnits().get(uId);
                // Note: If unit was already removed from map but is in result, we might miss it here if we don't look carefully.
                // But unitsHolder.getAllUnits() should still have it until we delete it.
                if (u) {
                    unitsDied.push(u as RenderableUnit);
                }
            }
            if (unitsDied.length > 0) {
                this.destroySpecificUnits(unitsDied, true, true);
            }
            this.unitsHolder.refreshStackPowerForAllUnits();

            // Log interaction
            console.log(`Attack completed. Died: ${result.unitIdsDied.join(", ")}`);

            this.finishTurn();
            // Clear hover state
            this.hoverManager.clearHoverSilhouette();
            this.hoverManager.hoverAttackFromCell = undefined;
        }

        this.sc_moveBlocked = false;
        // Trigger UI update
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
        this.currentActivePath = undefined;
        this.currentActiveKnownPaths = undefined;
        this.currentActivePathHashes = undefined;
        this.hoverManager.clearHoverSilhouette();
        this.hoverManager.hoveredUnitHighlight = undefined;
        this.sc_moveBlocked = true;
    }
    protected override hover(): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
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
            const gs = this.sc_sceneSettings.getGridSettings();
            const cell = GridMath.getCellForPosition(gs, this.sc_mouseWorld);
            if (!cell) {
                this.hoverManager.clearHoverSilhouette();
                this.hoverManager.hoverAttackFromCell = undefined;
                return;
            }

            // Check for melee attack target
            let isAttacking = false;
            this.hoverManager.hoverAttackFromCell = undefined; // Reset state
            // Only checking for attack if we have melee targets calculated
            if (this.canAttackByMeleeTargets && this.currentActiveUnit) {
                const targetUnit = this.getUnitAtPosition(this.sc_mouseWorld);
                if (targetUnit && targetUnit.getTeam() !== this.currentActiveUnit.getTeam()) {
                    let attackFrom: HoCMath.XY | undefined;
                    let visualTargetCell: HoCMath.XY | undefined; // Store the cell we actually targeted for visual feedback

                    // Check if mouse cell is actually part of the target unit (for precise targeting)
                    const isMouseInsideUnit = targetUnit.getCells().some(c => c.x === cell.x && c.y === cell.y);

                    if (isMouseInsideUnit) {
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
                        if (attackFrom) {
                            visualTargetCell = cell;
                        }
                    }

                    // Fallback: If specific cell is not reachable (e.g. far side) or mouse is outside
                    if (!attackFrom) {
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
                        // In fallback, visualTargetCell remains undefined, so we'll use distance-based logic later
                    }

                    if (attackFrom) {
                        this.hoverManager.hoverAttackFromCell = attackFrom;
                        this.hoverManager.updateAttackTargetHighlight(targetUnit);
                        this.hoverManager.hoverAttackFromCell = attackFrom;
                        this.hoverManager.updateAttackTargetHighlight(targetUnit);
                        let attackFromPos: HoCMath.XY | undefined;

                        // Refined Logic: Use the footprint map to find the true center for large units
                        if (!this.currentActiveUnit.isSmallSize() && this.canAttackByMeleeTargets) {
                            const hash = (attackFrom.x << 4) | attackFrom.y;
                            const footprint =
                                this.canAttackByMeleeTargets.attackCellHashesToLargeCells.get(hash);
                            if (footprint && footprint.length > 0) {
                                // Find top-left cell (min x, min y)
                                let minX = Number.MAX_SAFE_INTEGER;
                                let minY = Number.MAX_SAFE_INTEGER;
                                for (const c of footprint) {
                                    if (c.x < minX) minX = c.x;
                                    if (c.y < minY) minY = c.y;
                                }
                                // Position at center of top-left cell
                                attackFromPos = GridMath.getPositionForCell(
                                    { x: minX, y: minY },
                                    gs.getMinX(),
                                    gs.getStep(),
                                    gs.getHalfStep(),
                                );
                                // Apply correction to center the visual (assuming alignment needs shifting from the anchor)
                                attackFromPos.x -= gs.getHalfStep();
                                attackFromPos.y -= gs.getHalfStep();
                            }
                        }

                        // Fallback / Small Unit
                        if (!attackFromPos) {
                            attackFromPos = GridMath.getPositionForCell(
                                attackFrom,
                                gs.getMinX(),
                                gs.getStep(),
                                gs.getHalfStep(),
                            );
                            // If it's a large unit but we fell back (no footprint found?), apply the offset blindly
                            if (!this.currentActiveUnit.isSmallSize()) {
                                attackFromPos.x -= gs.getHalfStep();
                                attackFromPos.y -= gs.getHalfStep();
                            }
                        }

                        this.hoverManager.updateHoverSilhouette(attackFromPos);

                        // Target visual center
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const rTarget = targetUnit as any;
                        let tVis =
                            typeof rTarget.getVisualCenter === "function"
                                ? rTarget.getVisualCenter(gs)
                                : targetUnit.getPosition();

                        // Standard geometric center for damage text
                        const centerVis = { x: tVis.x, y: tVis.y };

                        // If we targeted a specific cell (Priority 1), force visual to that cell
                        if (visualTargetCell) {
                            tVis = GridMath.getPositionForCell(
                                visualTargetCell,
                                gs.getMinX(),
                                gs.getStep(),
                                gs.getHalfStep(),
                            );
                        } else if (!targetUnit.isSmallSize() && attackFromPos) {
                            // Fallback: finding closest cell logic
                            const targetCells = targetUnit.getCells();
                            let closestDist = Number.MAX_VALUE;
                            let closestPos = tVis;

                            for (const cell of targetCells) {
                                const cellPos = GridMath.getPositionForCell(
                                    cell,
                                    gs.getMinX(),
                                    gs.getStep(),
                                    gs.getHalfStep(),
                                );
                                const d = (cellPos.x - attackFromPos.x) ** 2 + (cellPos.y - attackFromPos.y) ** 2;
                                if (d < closestDist) {
                                    closestDist = d;
                                    closestPos = cellPos;
                                }
                            }
                            tVis = closestPos;
                        }

                        // Calculate projected damage
                        const attackRate = this.currentActiveUnit.getAttack();
                        const abilityPower = FightStateManager.getInstance()
                            .getFightProperties()
                            .getAdditionalAbilityPowerPerTeam(this.currentActiveUnit.getTeam());

                        const minDmg = this.currentActiveUnit.calculateAttackDamageMin(
                            attackRate,
                            targetUnit,
                            false, // Melee
                            abilityPower,
                            1, // Range divisor
                            1, // Multiplier
                        );
                        let maxDmg = this.currentActiveUnit.calculateAttackDamageMax(
                            attackRate,
                            targetUnit,
                            false, // Melee
                            abilityPower,
                            1, // Range divisor
                            1, // Multiplier
                        );

                        this.hoverManager.drawDamagePrediction(
                            `${minDmg}-${maxDmg}`,
                            centerVis,
                            !targetUnit.isSmallSize(), // isLargeTarget
                        );
                        this.hoverManager.drawAttackArrow(attackFromPos, tVis);
                        isAttacking = true;
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
    // --- Animation State ---
    private ensureGameplayGraphics(): void {
        if (!this.gameplayGraphics) this.gameplayGraphics = new Graphics();
        this.attachToWorldRoot(this.gameplayGraphics, 55); // Above terrain, below units
    }
    public override Step(timeStep: number): void {
        if (timeStep > 0) this.sc_stepCount.increment();
        this.sc_isAnimating = this.pixiSceneManager.isAnimating();
        const fightStateManager = FightStateManager.getInstance();
        const fightProps = fightStateManager.getFightProperties();
        const fightStarted = fightProps.hasFightStarted();

        // Update floating texts
        if (this.floatingTexts.length > 0) {
            this.floatingTexts = this.floatingTexts.filter((ft) => {
                ft.life -= timeStep;
                if (ft.life <= 0) {
                    ft.text.destroy();
                    return false;
                }
                const progress = 1 - ft.life / ft.maxLife;
                ft.text.alpha = 1 - Math.pow(progress, 3); // Slow fade out at end

                // Use velocity if set, otherwise default float up
                // Note: progress (0 to 1).
                // x = startX + velX * progress
                // y = startY + velY * progress (minus because up?)

                // If velocity was calculated with Y growing means...
                // In showFloatingDamage I set vy positive for "UP"?
                // Wait. Pixi Y: Down is positive usually.
                // Grid Y: Up is often positive in HoC logic?
                // Visuals: If `text.scale.y = -1`, then +Y is DOWN in local space? No, +Y is UP in world space if parent is flipped?
                // WorldRoot usually has Y flipped?
                // Let's rely on standard Pixi: +Y is Down.
                // But `text.scale.y = -1` flips the text object itself.

                // Let's just trust common sense:
                // Previous code: `ft.text.y = ft.startY - progress * 80;` -> Minus Y is UP.
                // So default vy should be -80.
                // In showFloatingDamage I set vy=80 then used it?
                // I need to check how I used it. I haven't used it yet in Step.

                // Let's implement:
                // If velY is defined as "Direction Y" relative to world.
                // If I want to move UP, and Y is Down, I need Negative Y.
                // My calculate in showFloatingDamage used `dir.y`.
                // If Attacker is at (0,0) and Target at (0, 100). Dir is (0, 100).
                // Target is visually BELOW attacker? Or ABOVE?
                // In HoC grid, usually (0,0) is bottom left?

                // Assuming standard cartesian movement for "Direction":
                // If dir is (dx, dy), I want text to move by (dx, dy).
                // But World Space Y?
                // Let's stick to: Vector Math works in World Coords.
                // So `text.x = startX + velX * progress`.
                // `text.y = startY + velY * progress`.
                // I just need to make sure default vy is correct.
                // Old code: `startY - 80`. So `-80` is UP.
                // So default vy = -80.

                ft.text.x = ft.startX + ft.velX * progress;
                ft.text.y = ft.startY + ft.velY * progress;

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
        this.spawnPulsePhase += timeStep * 3.7;
        setSpawnFlowPhase(this.spawnPulsePhase);
        this.hoverGlowPhase += timeStep * ((Math.PI * 2) / 2.5);
        if (this.hoverGlowPhase > Math.PI * 2) this.hoverGlowPhase -= Math.PI * 2;

        // 3. Clear dynamic graphics every frame
        this.gameplayGraphics?.clear();

        // ==========================================================================================
        // CORE GAME LOGIC
        // ==========================================================================================
        if (fightStarted) {
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
                    this.finishFight(unitsLower, unitsUpper);
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
                this.performingAIAction = true;
                setTimeout(() => {
                    this.sc_isAIActive = true;
                    this.buttonManager.sc_isAIActive = true;
                    // this.performAIAction(wasAIActive);
                }, 750);
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
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const fightStarted = fightProps.hasFightStarted();

        // 1. Shot range ring
        if (this.sc_currentActiveShotRange && !this.isActiveUnitMoving) {
            const { xy, distance } = this.sc_currentActiveShotRange;
            const gs = this.sc_sceneSettings.getGridSettings();
            const cellSize = gs.getCellSize();
            const baseColor = 0xffff00;
            const ringWidth = fightStarted ? 3 : 2;

            g.circle(xy.x, xy.y, distance).stroke({
                width: ringWidth,
                color: baseColor,
                alpha: fightStarted ? 0.95 : 0.8,
            });

            const steps = 8;
            const pulse = (Math.sin(this.hoverGlowPhase) + 1) / 2;
            const tickLen = cellSize * (0.25 + 0.15 * pulse);
            for (let i = 0; i < steps; i++) {
                const angle = (Math.PI * 2 * i) / steps;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const r0 = distance - tickLen * 0.5;
                const r1 = distance + tickLen * 0.5;
                const x0 = xy.x + cos * r0;
                const y0 = xy.y + sin * r0;
                const x1 = xy.x + cos * r1;
                const y1 = xy.y + sin * r1;
                g.moveTo(x0, y0)
                    .lineTo(x1, y1)
                    .stroke({
                        width: 1.5,
                        color: baseColor,
                        alpha: 0.6 + 0.3 * pulse,
                    });
            }

            const glowSteps = 12;
            const glowSpread = cellSize * 0.8;
            const glowBaseAlpha = fightStarted ? 0.25 : 0.2;
            for (let i = 1; i <= glowSteps; i++) {
                const fraction = i / glowSteps;
                const glowRadius = distance + fraction * glowSpread;
                const glowAlpha = glowBaseAlpha * (1 - fraction) * (0.7 + 0.3 * pulse);
                g.circle(xy.x, xy.y, glowRadius).stroke({
                    width: 1.5,
                    color: baseColor,
                    alpha: glowAlpha,
                });
            }
        }

        // 2. Active path lights
        if (this.currentActivePath && this.currentActiveUnit && !this.sc_isAnimating) {
            const path = this.currentActivePath;
            if (path.length > 0) {
                const gs = this.sc_sceneSettings.getGridSettings();
                for (let i = 0; i < path.length; i++) {
                    const pos = GridMath.getPositionForCell(path[i], gs.getMinX(), gs.getStep(), gs.getHalfStep());
                    const baseRadius = gs.getCellSize() * 0.18;
                    const phase = this.hoverGlowPhase + i * 0.4;
                    const wave = (Math.sin(phase) + 1) / 2;
                    const innerRadius = baseRadius * (0.9 + 0.2 * wave);
                    const outerRadius = baseRadius * 1.8 * (0.9 + 0.25 * wave);
                    const innerAlpha = 0.38 + 0.2 * wave;
                    const outerAlpha = 0.08 + 0.06 * wave;
                    g.circle(pos.x, pos.y, outerRadius).fill({
                        color: 0xffffff,
                        alpha: outerAlpha,
                    });
                    g.circle(pos.x, pos.y, innerRadius).fill({
                        color: 0xffffff,
                        alpha: innerAlpha,
                    });
                }
            }
        }

        // 3. Active unit highlight
        if (this.currentActiveUnit) {
            this.hoverManager.hoveredUnitHighlight = this.hoverManager.getHighlightRectForUnit(this.currentActiveUnit);
            this.hoverManager.drawHoveredUnitHighlight(g);
        }

        // 4. Lingering tracks
        if (this.lingeringTracks.length) {
            for (const t of this.lingeringTracks) {
                const k = t.life / t.maxLife;
                const numRings = 4;
                for (let r = 0; r < numRings; r++) {
                    const frac = r / (numRings - 1);
                    const ringRadius = t.radius * (0.35 + frac * (0.55 + 0.5 * (1 - k)));
                    const ringWidth = 0.8 * (1 - frac) + 0.4;
                    const ringAlpha = 0.55 * k * (1 - frac) * (0.8 + 0.2 * Math.sin(t.phase + frac * Math.PI));
                    g.circle(t.x, t.y, ringRadius).stroke({
                        width: ringWidth,
                        color: 0xffffff,
                        alpha: ringAlpha,
                    });
                }
                const innerRadius = t.radius * 0.3 * k;
                const innerAlpha = 0.32 * k * (0.7 + 0.3 * Math.sin(t.phase));
                g.circle(t.x, t.y, innerRadius).fill({
                    color: 0xffffff,
                    alpha: innerAlpha,
                });
            }
        }
    }
    private handleNextUnitActivation(nextUnit: RenderableUnit): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        this.currentActiveUnit = nextUnit;

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
            this.sc_visibleState.lapNumber = FightStateManager.getInstance().getFightProperties().getCurrentLap();
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
                    this.finishFight(unitsLower, unitsUpper);
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
        if (!this.placementGraphics) return;
        const g = this.placementGraphics;
        g.clear();
        const props = FightStateManager.getInstance().getFightProperties();
        if (!props.hasFightStarted()) {
            let team: TeamType | undefined = undefined;
            this.placementManager.draw(g, team);
            this.hoverManager.drawHoverPlacementCell(g);
            if (this.hoverManager.hoveredUnitHighlight) {
                this.hoverManager.drawHoveredUnitHighlight(g);
            }
        }
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
        }
        this.currentActiveUnit = undefined;
        this.sc_selectedAttackType = AttackVals.NO_ATTACK;
        this.sc_renderSpellBookOverlay = false;
        this.buttonManager.sc_renderSpellBookOverlay = false;
        this.unitsHolder.refreshStackPowerForAllUnits();
        this.buttonManager.refreshButtons(true);
    };
    protected finishFight(unitsLower?: Unit[], unitsUpper?: Unit[]): void {
        if (this.currentActiveUnit) {
            this.currentActiveUnit.setBoardSelected(false);
            this.currentActiveUnit = undefined;
        }
        this.sc_currentActiveShotRange = undefined;
        this.canAttackByMeleeTargets = undefined;
        let result = "Draw!";
        if (unitsUpper?.length && !unitsLower?.length) {
            result = "Red team wins!";
        } else if (!unitsUpper?.length && unitsLower?.length) {
            result = "Green team wins!";
        }
        FightStateManager.getInstance().getFightProperties().finishFight();
        this.cleanActivePaths();
        this.sc_sceneLog.updateLog(`Fight finished! ${result}`);
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
    protected verifyButtonsTrigger(): void { }
    protected updateCurrentMovePath(currentCell: HoCMath.XY): void {
        if (!this.currentActiveUnit || this.moveAnimation) {
            return;
        }
        if (
            this.currentActiveUnit.canMove() &&
            this.currentActiveSpell?.getSpellTargetType() !== SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE
        ) {
            const movePath = this.pathHelper.getMovePath(
                currentCell,
                this.gridMatrix,
                this.currentActiveUnit.getSteps(),
                this.grid.getAggrMatrixByTeam(this.currentActiveUnit.getOppositeTeam()),
                this.currentActiveUnit.canFly(),
                this.currentActiveUnit.isSmallSize(),
                this.currentActiveUnit.hasAbilityActive("Made of Fire"),
            );
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
            }
        } else {
            this.cleanActivePaths();
        }
    }
}

registerScene("Heroes", "Sandbox", Sandbox);
