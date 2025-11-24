// game/core/src/scenes/Sandbox.ts
import { v4 as uuidv4 } from "uuid";
import { Sprite, Graphics, Container } from "pixi.js";
import {
    Augment,
    FightStateManager,
    GridConstants,
    GridSettings,
    HoCLib,
    HoCMath,
    UnitProperties,
    GridType,
    TeamType,
    TeamVals,
    FactionType,
    PathHelper,
    Grid,
    GridMath,
    IPlacement,
    Unit,
    UnitsHolder,
    UnitVals,
    AbilityFactory,
    EffectFactory,
    SpecificSynergy,
    ToLifeSynergy,
    ToChaosSynergy,
    ToMightSynergy,
    ToNatureSynergy,
    FactionVals,
    GridVals,
    HoCConstants,
    SpellTargetType,
    AttackVals,
    AttackHandler,
    MoveHandler,
    IWeightedRoute,
    Spell,
    HoCConfig,
} from "@heroesofcrypto/common";
import { Settings } from "../settings";
import { UnitsOverlay } from "./UnitsOverlay";
import { VisibleButtonState, IVisibleUnit } from "../state/visible_state";
import { SceneSettings } from "../scenes/scene_settings";
import { PixiScene, PixiSceneContext, registerScene } from "../pixi/PixiScene";
import { setSpawnFlowPhase } from "../pixi/PixiDrawablePlacement";
import { PlacementManager } from "./PlacementManager";
import { RenderableUnit } from "@/pixi/RenderableUnit";
import { PixiRenderableSpell } from "@/spells/renderable_spell";
import { HoverManager } from "./HoverManager";
import { ButtonManager } from "./ButtonManager";
export class Sandbox extends PixiScene {
    private readonly grid: Grid;
    private readonly pathHelper: PathHelper;
    private readonly attackHandler?: AttackHandler;
    private readonly moveHandler?: MoveHandler;
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
    private canAttackByMeleeTargets?: boolean;
    private spawnPulseDirection = 1;
    private performingAIAction = false;
    private hasInitializedLap = false;
    private gameplayGraphics?: Graphics;
    private currentActiveSpell?: PixiRenderableSpell;
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
        // this.pixiSceneManager.setGridType(FightStateManager.getInstance().getFightProperties().getGridType());
        this.sc_gridTypeUpdateNeeded = true;
        this.abilityFactory = new AbilityFactory(new EffectFactory());
        const fp = FightStateManager.getInstance().getFightProperties();
        fp.setDefaultPlacementPerTeam(TeamVals.LOWER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        fp.setDefaultPlacementPerTeam(TeamVals.UPPER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        this.grid = new Grid(
            this.sc_sceneSettings.getGridSettings(),
            FightStateManager.getInstance().getFightProperties().getGridType(),
        );
        this.unitsHolder = new UnitsHolder(this.grid);
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
                    // clear board selection
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
                    // deselected from overlay
                    if (this.selectionFromOverlay) {
                        this.Deselect(false, true);
                    }
                }
            },
        );
        this.unitsOverlay.build();

        // Initialize Managers
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

                // 👇 NEW: Implement setters to sync state from Manager to Sandbox (PixiScene)
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

        // visible state updater
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
        this.attachToWorldRoot(this.gameplayGraphics, 55);
        this.attachToWorldRoot(this.centerTerrainSprite, 50);
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
        // this.unitsFactory.refreshBarFixturesForAllUnits(this.unitsHolder.getAllUnitsIterator());
    }
    protected destroySpecificUnits(unitsToDestroy: RenderableUnit[]): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.hasFightStarted() || !unitsToDestroy.length) return;

        const destroyedUnitIds = new Set<string>();

        for (const utd of unitsToDestroy) {
            const unitId = utd.getId();
            if (destroyedUnitIds.has(unitId)) continue;

            // 1) Remove from UnitsHolder
            const deleted = this.unitsHolder.deleteUnitById(unitId);
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
            // this.refreshSynergyVisualEffect();

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
            // We must update sc_selectedUnitProperties so PixiGameManager sends the
            // correct new amount to React.
            this.sc_selectedUnitProperties = { ...unit.getUnitProperties() };

            // 5. Flag for update (Accept() does this too, but good to be explicit)
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

                // Compare current unit position vs target position with a small epsilon
                // to avoid floating point strict equality issues.
                const dx = Math.abs(currentPos.x - placePos.x);
                const dy = Math.abs(currentPos.y - placePos.y);

                if (dx < 0.1 && dy < 0.1) {
                    console.log("Dropped at exact same position. Ignoring action (keeping selection).");
                    return; // ⬅️ Return early. Do NOT clearBoardSelection.
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
        // We must capture where the unit WAS before we remove it.
        // If the new placement fails, we must put it back to prevent Aggregation Matrix corruption.
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
                // Put the unit back exactly where it was.
                // This increments the AggrMatrix back to its original state.
                this.grid.occupyCells(
                    cellsToRestore,
                    unit.getId(),
                    unit.getTeam(),
                    unit.getAttackRange(),
                    hasMadeOfFire,
                    hasMadeOfWater,
                );
            } else if (!this.draggingUnitId) {
                // If it was a new unit (not a move) and failed, we clean it up from memory
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
            // Ideally rollback here too, but sprite failure is rare/fatal
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
    protected destroyTempFixtures(): void {}
    public override MouseDown(p: HoCMath.XY): void {
        this.sc_mouseWorld = p;
        const fightProps = FightStateManager.getInstance().getFightProperties();

        // 1. FIGHT STARTED INTERACTION
        if (fightProps.hasFightStarted()) {
            if (this.currentActiveUnit && this.currentActiveKnownPaths && !this.sc_moveBlocked) {
                const gs = this.sc_sceneSettings.getGridSettings();
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

            // If hover is invalid or empty, handle deselect
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
    private executeMoveSequence(unit: RenderableUnit, path: HoCMath.XY[], overrideFootprint?: HoCMath.XY[]): void {
        if (!path || path.length === 0) return;

        const gs = this.sc_sceneSettings.getGridSettings();

        // For logging, still keep the last path cell
        const destCell = path[path.length - 1];

        this.grid.cleanupAll(unit.getId(), unit.getAttackRange(), unit.isSmallSize());

        let cellsToOccupy: HoCMath.XY[];

        if (!unit.isSmallSize()) {
            if (overrideFootprint && overrideFootprint.length === 4) {
                cellsToOccupy = overrideFootprint;
            } else {
                // Fallback (shouldn't normally be hit once overrideFootprint is wired)
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

        if (occupied) {
            this.gridMatrix = this.grid.getMatrix();
            this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();

            const newWorldPos = GridMath.getPositionForCells(gs, cellsToOccupy);
            if (newWorldPos) {
                unit.setPosition(newWorldPos.x, newWorldPos.y);

                this.sc_sceneLog.updateLog(`${unit.getName()} moved to (${destCell.x}, ${destCell.y})`);

                this.finishTurn();
            }
        } else {
            console.error(
                `Critical: Unit ${unit.getName()} failed to occupy target footprint (dest ${destCell.x}, ${destCell.y})`,
            );
            // Optional: restore old footprint here if you want a full rollback.
        }
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
                return;
            }

            if (this.hoverManager.isCellReachableForActiveUnit(cell)) {
                this.hoverManager.updateActiveMoveSilhouetteForCell(cell);
            } else {
                this.hoverManager.clearHoverSilhouette();
            }
            return;
        }

        // CASE 1: Active selection from OVERLAY (New Unit)
        // We usually don't highlight a "ghost" unit from the overlay, just the placement square
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
        // First let the base class clear its own selection state (overlay linkage, etc.)
        super.Deselect(_onlyWhenNotStarted, _refreshStats);

        // Stop board selection animation if any
        if (this.selectedBoardUnit) {
            this.selectedBoardUnit.setBoardSelected(false);
            this.selectedBoardUnit = undefined;
        }

        // Then clear Sandbox-specific selection / hover state
        this.hasActiveSelection = false;
        this.selectionFromOverlay = false;
        this.draggingUnitId = undefined;
        this.draggingUnitTeam = undefined;

        // Clear placement hover (red/white rectangle)
        this.hoverManager.hoverPlacementCell = undefined;
        this.hoverManager.hoverPlacementCellTeam = undefined;
        this.hoverManager.hoverSelectedCells = undefined;
        this.hoverManager.hoverSelectedCellsSwitchToRed = false;

        // Clear passive board-hover highlight
        this.hoverManager.hoveredUnitHighlight = undefined;

        // Reset UnitChip-style hover tween state
        this.hoverManager.resetBoardHoverState();

        // Also clear silhouettes / flags used by hover previews
        this.hoverManager.resetHover(false); // clears silhouette + internal flags, but we already nulled selected cells above
    }
    private updateUnitsOverlayVisibility(): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const started = fightProps.hasFightStarted();

        // Hide/show the Pixi overlay container
        if (this.unitsOverlay?.container) {
            this.unitsOverlay.container.visible = !started;
        }

        // When fight starts, clear any overlay selection so nothing “sticks”
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

            // 🔥 new: reset lap initialization state
            this.hasInitializedLap = false;

            FightStateManager.getInstance().getFightProperties().startFight();
            return super.startScene();
        }

        return false;
    }
    private ensureGameplayGraphics(): void {
        if (!this.gameplayGraphics) this.gameplayGraphics = new Graphics();
        this.attachToWorldRoot(this.gameplayGraphics, 55); // Above terrain, below units
    }
    public override Step(_settings: Settings, timeStep: number): void {
        if (timeStep > 0) this.sc_stepCount.increment();
        this.sc_isAnimating = this.pixiSceneManager.isAnimating();

        const fightStateManager = FightStateManager.getInstance();
        const fightProps = fightStateManager.getFightProperties();
        const fightStarted = fightProps.hasFightStarted();

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
        // CORE GAME LOGIC (Ported from Box2D Step)
        // ==========================================================================================

        if (fightStarted) {
            // this.clearHoverSilhouette();
            this.hoverManager.setLastPlacement(undefined);

            // --- A. TURN TIMER LOGIC ---
            if (HoCLib.getTimeMillis() >= fightProps.getCurrentTurnEnd()) {
                if (this.currentActiveUnit) {
                    // Handle Timeout: Decrease Morale and Skip
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
                // Check if fight is over or needs unit shuffle
                const unitsUpper = this.unitsHolder.getAllAllies(TeamVals.UPPER);
                const unitsLower = this.unitsHolder.getAllAllies(TeamVals.LOWER);

                if (!unitsUpper.length || !unitsLower.length) {
                    this.finishFight(unitsLower as RenderableUnit[], unitsUpper as RenderableUnit[]);
                } else {
                    // If queue is empty, it might be a new lap or start of game
                    // MODIFIED: Removed !fightProps.getAlreadyMadeTurnSize() to allow lap flip when all turns are made
                    if (!fightProps.getHourglassQueueSize() && !fightProps.getUpNextQueueSize()) {
                        this.handleLapFlip(unitsUpper as RenderableUnit[], unitsLower as RenderableUnit[]);
                    }

                    // Dequeue next unit
                    const nextUnitId = fightProps.dequeueNextUnitId();
                    const nextUnit = nextUnitId ? this.unitsHolder.getAllUnits().get(nextUnitId) : undefined;

                    if (nextUnit) {
                        this.handleNextUnitActivation(nextUnit as RenderableUnit);
                    }
                }
            }

            // --- C. AI LOGIC ---
            if (
                this.currentActiveUnit &&
                (this.sc_isAIActive || this.currentActiveUnit?.hasAbilityActive("AI Driven")) &&
                !this.performingAIAction &&
                !this.sc_isAnimating // Don't run AI while animations are playing
            ) {
                this.performingAIAction = true;
                setTimeout(() => {
                    // const wasAIActive = this.sc_isAIActive;
                    this.sc_isAIActive = true;
                    this.buttonManager.sc_isAIActive = true;
                    // this.refreshButtons();
                    // this.performAIAction(wasAIActive);
                }, 750);
            }
        } else {
            // Pre-fight logic
            this.checkStartCondition();
            this.hoverManager.update(timeStep);

            // Ensure placement hover is updated every frame if we have an active selection
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

        // 4. Draw Gameplay Visuals (Ranges, Paths)
        // if (fightStarted && this.gameplayGraphics) {
        //     this.drawGameplayVisuals(this.gameplayGraphics);
        // }
        if (this.gameplayGraphics) {
            this.drawGameplayVisuals(this.gameplayGraphics);
        }

        // 5. Sync Logical Units to Pixi Sprites
        for (const unit of this.unitsHolder.getAllUnits().values()) {
            const rUnit = unit as RenderableUnit;
            rUnit.syncVisual(this.pixiSceneManager.getWorldRoot(), this.sc_sceneSettings.getGridSettings());
            rUnit.stepSpawnAnimation(timeStep);
            // Call the render method on the unit to update bars/effects
            // rUnit.render(this.sc_fps || 60, this.sc_isAnimating, this.sc_sceneLog);
        }
    }
    private drawGameplayVisuals(g: Graphics): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const fightStarted = fightProps.hasFightStarted();

        // 1. Draw Shot Range (single yellow ring, no inner fill)
        if (this.sc_currentActiveShotRange) {
            const { xy, distance } = this.sc_currentActiveShotRange;
            const gs = this.sc_sceneSettings.getGridSettings();
            const cellSize = gs.getCellSize();

            // Always yellow
            const baseColor = 0xffff00; // pure yellow
            const ringWidth = fightStarted ? 3 : 2;

            // Just the main ring – no fill/halo
            g.circle(xy.x, xy.y, distance).stroke({
                width: ringWidth,
                color: baseColor,
                alpha: fightStarted ? 0.95 : 0.8,
            });

            // Small pulsing ticks around the ring (to make the radius very clear)
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

            // Outer yellow blur effect (simulated glow for limited visibility)
            const glowSteps = 12;
            const glowSpread = cellSize * 0.8; // Adjust spread based on desired blur extent
            const glowBaseAlpha = fightStarted ? 0.25 : 0.2;

            for (let i = 1; i <= glowSteps; i++) {
                const fraction = i / glowSteps;
                const glowRadius = distance + fraction * glowSpread;
                const glowAlpha = glowBaseAlpha * (1 - fraction) * (0.7 + 0.3 * pulse); // Pulse for dynamic effect

                g.circle(xy.x, xy.y, glowRadius).stroke({
                    width: 1.5,
                    color: baseColor,
                    alpha: glowAlpha,
                });
            }
        }

        // 2. Draw Active Path (keep your existing one)
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

        // 3. Active Unit “light” highlight (unchanged)
        if (this.currentActiveUnit) {
            this.hoverManager.hoveredUnitHighlight = this.hoverManager.getHighlightRectForUnit(this.currentActiveUnit);
            this.hoverManager.drawHoveredUnitHighlight(g);
        }
    }
    private handleNextUnitActivation(nextUnit: RenderableUnit): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();

        // ✅ Mark this as the active unit for this turn
        this.currentActiveUnit = nextUnit;

        // 1. Update "Up Next" UI State
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

        // 2. Check Skip
        if (nextUnit.isSkippingThisTurn()) {
            // now this.currentActiveUnit is already set
            this.currentActiveUnit.decreaseMorale(
                HoCConstants.MORALE_CHANGE_FOR_SKIP,
                fightProps.getAdditionalMoralePerTeam(this.currentActiveUnit.getTeam()),
            );
            this.sc_sceneLog.updateLog(`${this.currentActiveUnit.getName()} skip turn`);
            this.finishTurn();
            return;
        }

        // 3. Activate Unit
        this.sc_moveBlocked = false;
        this.refreshUnits();
        this.gridMatrix = this.grid.getMatrix();
        this.gridMatrixNoUnits = this.grid.getMatrixNoUnits();

        nextUnit.setBoardSelected(true);

        fightProps.startTurn(nextUnit.getTeam());
        this.refreshVisibleStateIfNeeded();

        // 4. Setup Unit State
        nextUnit.refreshPreTurnState(this.sc_sceneLog);
        this.currentActiveUnit = nextUnit;
        this.buttonManager.setButtonsRefreshLocked(false);

        // Update Sidebar UI
        const props = nextUnit.getUnitProperties();
        this.sc_selectedUnitProperties = props;
        this.setSelectedUnitProperties(props);
        this.sc_unitPropertiesUpdateNeeded = true;

        // 5. Calculate Attack Options
        const canLandRange =
            this.attackHandler?.canLandRangeAttack(nextUnit, this.grid.getEnemyAggrMatrixByUnitId(nextUnit.getId())) ??
            false;

        nextUnit.refreshPossibleAttackTypes(canLandRange);

        // 6. Setup Pathfinding – "possible path" for white light visualization
        const currentCell = GridMath.getCellForPosition(
            this.sc_sceneSettings.getGridSettings(),
            nextUnit.getPosition(),
        );

        if (currentCell) {
            this.updateCurrentMovePath(currentCell);
        }

        // 7. Shot range circle (if ranged)
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
        // We iterate a copy or be careful with indices because we might modify the array via deleteUnitById
        for (const u of units) {
            u.applyArmageddonDamage(wave, this.sc_sceneLog);
            if (u.isDead()) {
                killed = true;
                this.sc_sceneLog.updateLog(`${u.getName()} died`);

                // 1) Remove from Holder
                const deleted = this.unitsHolder.deleteUnitById(u.getId(), wave === 1);
                if (deleted) {
                    // 2) Cleanup Grid & Visuals
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
    private handleLapFlip(unitsUpper: RenderableUnit[], unitsLower: RenderableUnit[]): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();

        // 0. Reset flags on all units (as seen in legacy code "for (const u of units)... setResponded(false)")
        const allCurrentUnits = [...unitsUpper, ...unitsLower];
        for (const u of allCurrentUnits) {
            u.setResponded(false);
            u.setOnHourglass(false);
        }

        // 1. Apply lap-based damage facts / "dry center" effects
        if (this.attackHandler?.getDamageStatisticHolder().has(fightProps.getCurrentLap())) {
            fightProps.encounterDamageDealFact();
        }

        // 2. Advance lap – but NOT on the very first initialization
        if (this.hasInitializedLap) {
            fightProps.flipLap();

            // Dry Center check (visuals + logic)
            if (fightProps.isTimeToDryCenter()) {
                this.ensureCenterTerrainSprite(); // This handles the texture swap internally based on fight props
                this.grid.cleanupCenterObstacle();
            }
        } else {
            this.hasInitializedLap = true; // first lap, no increment
        }

        // 3. Armageddon Wave Logic (Replaces old Armageddon body iteration)
        const armageddonWave = fightProps.getArmageddonWave();
        let gotArmageddonKills = false;

        if (armageddonWave) {
            // Process damage on all units
            gotArmageddonKills = this.performArmageddon(unitsLower, armageddonWave) || gotArmageddonKills;
            gotArmageddonKills = this.performArmageddon(unitsUpper, armageddonWave) || gotArmageddonKills;

            // If kills happened, refresh lists
            if (gotArmageddonKills) {
                const unitsForAllTeams = this.unitsHolder.refreshUnitsForAllTeams();
                unitsLower = unitsForAllTeams[TeamVals.LOWER - 1] as RenderableUnit[];
                unitsUpper = unitsForAllTeams[TeamVals.UPPER - 1] as RenderableUnit[];

                // Check Win Condition immediately after Armageddon
                if (!unitsLower?.length || !unitsUpper?.length) {
                    this.finishFight(unitsLower, unitsUpper);
                    return; // Fight over
                }
            }
        }

        // 4. Narrowing / Obstacle Spawning Logic
        const distancesDecreased = this.unitsHolder.haveDistancesToClosestEnemiesDecreased();
        let spawnedObstacles = false;

        if (!distancesDecreased || fightProps.isNarrowingLap()) {
            let encounterCurrent = false;
            if (
                !distancesDecreased &&
                !fightProps.hasDamageDealFactPerLap(fightProps.getCurrentLap() - 1) &&
                !fightProps.isNarrowingLap()
            ) {
                fightProps.encounterAdditionalNarrowingLap();
                encounterCurrent = true;
            }

            // Spawn logic
            const spawnLog = this.spawnObstacles(encounterCurrent);
            if (spawnLog) this.sc_sceneLog.updateLog(spawnLog);

            fightProps.increaseStepsMoraleMultiplier();
            spawnedObstacles = true;
            this.refreshVisibleStateIfNeeded(true);
        }

        // If obstacles spawned, refresh grid/units again as they might have killed overlapping units
        if (!fightProps.hasFightFinished() && spawnedObstacles) {
            if (!gotArmageddonKills) {
                const unitsForAllTeams = this.unitsHolder.refreshUnitsForAllTeams();
                unitsLower = unitsForAllTeams[TeamVals.LOWER - 1] as RenderableUnit[];
                unitsUpper = unitsForAllTeams[TeamVals.UPPER - 1] as RenderableUnit[];
            }
            this.unitsHolder.refreshStackPowerForAllUnits();
        }

        // 5. Re-Shuffle and sort by speed (initiative)
        const allUnits = [...unitsUpper, ...unitsLower];
        HoCLib.shuffle(allUnits);
        allUnits.sort((a, b) => b.getSpeed() - a.getSpeed());

        // 6. Morale RNG Logic (Ported from Source)
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

        // 7. Prefetch turn order queues for the (possibly new) lap
        fightProps.prefetchNextUnitsToTurn(this.unitsHolder.getAllUnits(), unitsUpper, unitsLower);
    }
    private spawnObstacles(encounterCurrent = false): string | undefined {
        // TODO: port
        console.log(encounterCurrent);
        return undefined;
    }
    private drawPlacements(): void {
        if (!this.placementGraphics) return;
        const g = this.placementGraphics;
        g.clear();

        const props = FightStateManager.getInstance().getFightProperties();
        if (!props.hasFightStarted()) {
            let team: TeamType | undefined = undefined;

            // Let PlacementManager draw spawn lights for the requested team(s)
            this.placementManager.draw(g, team);

            this.hoverManager.drawHoverPlacementCell(g);

            // passive board-hover highlight (no active selection)
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
            // this.refreshVisibleStateIfNeeded();
            if (this.sc_visibleState) {
                if (!this.sc_visibleState.canBeStarted) {
                    this.sc_visibleState.canBeStarted = true;
                    this.sc_visibleStateUpdateNeeded = true;
                }
            }
        } else {
            // this.refreshVisibleStateIfNeeded();
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

        // cleanup range attack state
        this.hoverRangeAttackDivisors = [];
        // if (this.hoverRangeAttackLine) {
        //     this.ground.DestroyFixture(this.hoverRangeAttackLine);
        //     this.hoverRangeAttackLine = undefined;
        // }
        // this.rangeResponseAttackDivisor = 1;
        // this.rangeResponseUnits = undefined;

        // cleanup magic attack state
        // this.hoveredSpell = undefined;
        this.currentActiveSpell = undefined;
        this.currentEnemiesCellsWithinMovementRange = undefined;

        // // handle units state
        // this.hoverAttackUnits = undefined;
        // this.hoverAttackFromCell = undefined;
        // this.hoverAttackIsSmallSize = undefined;

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

        // refresh UI
        this.sc_renderSpellBookOverlay = false;
        this.buttonManager.sc_renderSpellBookOverlay = false;
        // this.adjustSpellBookSprite();
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
    protected verifyButtonsTrigger(): void {}
    protected updateCurrentMovePath(currentCell: HoCMath.XY): void {
        if (!this.currentActiveUnit) {
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
        } else {
            this.cleanActivePaths();
        }
    }
}
registerScene("Heroes", "Sandbox", Sandbox);
