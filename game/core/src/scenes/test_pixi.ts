// game/core/src/scenes/test_pixi.ts
import { Sprite, Graphics } from "pixi.js";
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
    PlacementPositionType,
    PlacementType,
    PathHelper,
    Grid,
    GridMath,
    IPlacement,
    Unit,
    UnitsHolder,
    UnitVals,
    AbilityFactory,
    EffectFactory,
} from "@heroesofcrypto/common";

import { Settings } from "../settings";
import { UnitsOverlay } from "./UnitsOverlay";
import { VisibleButtonState, IVisibleButton } from "../state/visible_state";
import { SceneSettings } from "../scenes/scene_settings";
import { PixiScene, PixiSceneContext, registerScene } from "../pixi/PixiScene";
import {
    DrawableRectanglePlacement,
    DrawableSquarePlacement,
    IDrawablePlacement,
    setSpawnFlowPhase,
} from "../pixi/PixiDrawablePlacement";

export class Sandbox extends PixiScene {
    private readonly grid: Grid;
    private readonly allowedPlacementCellHashes: Set<number>;
    private readonly allowedPlacementCellHashesPerTeam: Map<TeamType, Set<number>>;
    private readonly pathHelper: PathHelper;
    private gridType: GridType;
    private hourglassButton: IVisibleButton;
    private shieldButton: IVisibleButton;
    private nextButton: IVisibleButton;
    private aiButton: IVisibleButton;
    private selectedAttackTypeButton: IVisibleButton;
    private spellBookButton: IVisibleButton;
    private unitsOverlay: UnitsOverlay;
    private bgSprite?: Sprite;
    private spawnPulsePhase = 0;
    private bgKey: "background_dark" | "background_light" = "background_dark";
    private cornerGfxWorld?: Graphics;
    private placementGraphics?: Graphics;
    private upperPlacements: [IDrawablePlacement?, IDrawablePlacement?];
    private lowerPlacements: [IDrawablePlacement?, IDrawablePlacement?];
    private hoverPlacementCell?: HoCMath.XY; // cell currently hovered for placement
    private hoverPlacementCellTeam?: TeamType; // LOWER / UPPER (optional, if you care)
    private hoverSelectedCells?: HoCMath.XY[];
    private cellToUnitPreRound?: Map<string, Unit>;
    private hoverSelectedCellsSwitchToRed = false;
    private readonly unitsHolder: UnitsHolder;
    private readonly abilityFactory: AbilityFactory;
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

        this.gridType = FightStateManager.getInstance().getFightProperties().getGridType();
        this.pixiSceneManager.setGridType(this.gridType);
        this.sc_gridTypeUpdateNeeded = true;
        this.abilityFactory = new AbilityFactory(new EffectFactory());

        this.lowerPlacements = [];
        this.upperPlacements = [];
        this.allowedPlacementCellHashes = new Set();
        this.allowedPlacementCellHashesPerTeam = new Map([
            [TeamVals.UPPER, new Set()],
            [TeamVals.LOWER, new Set()],
        ]);

        const fp = FightStateManager.getInstance().getFightProperties();
        fp.setDefaultPlacementPerTeam(TeamVals.LOWER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        fp.setDefaultPlacementPerTeam(TeamVals.UPPER, Augment.DefaultPlacementLevel1.THREE_BY_THREE);

        this.grid = new Grid(
            this.sc_sceneSettings.getGridSettings(),
            FightStateManager.getInstance().getFightProperties().getGridType(),
        );
        this.unitsHolder = new UnitsHolder(this.grid);

        // buttons (unchanged)
        this.hourglassButton = {
            name: "Hourglass",
            text: "Wait",
            state: VisibleButtonState.FIRST,
            isVisible: true,
            isDisabled: true,
            numberOfOptions: 1,
            selectedOption: 1,
        };
        this.shieldButton = {
            name: "LuckShield",
            text: "Cleanup randomized luck and skip turn",
            state: VisibleButtonState.FIRST,
            isVisible: true,
            isDisabled: true,
            numberOfOptions: 1,
            selectedOption: 1,
        };
        this.nextButton = {
            name: "Next",
            text: "Skip turn",
            state: VisibleButtonState.FIRST,
            isVisible: true,
            isDisabled: true,
            numberOfOptions: 1,
            selectedOption: 1,
        };
        this.aiButton = {
            name: "AI",
            text: "Switch AI state",
            state: this.sc_isAIActive ? VisibleButtonState.SECOND : VisibleButtonState.FIRST,
            isVisible: true,
            isDisabled: false,
            numberOfOptions: 1,
            selectedOption: 1,
        };
        this.selectedAttackTypeButton = {
            name: "AttackType",
            text: "Switch attack type",
            state: VisibleButtonState.FIRST,
            isVisible: true,
            isDisabled: true,
            numberOfOptions: 3,
            selectedOption: 1,
        };
        this.spellBookButton = {
            name: "Spellbook",
            text: "Select spell",
            state: VisibleButtonState.FIRST,
            isVisible: true,
            isDisabled: true,
            numberOfOptions: 1,
            selectedOption: 1,
        };
        this.sc_visibleButtonGroup = [
            this.hourglassButton,
            this.shieldButton,
            this.nextButton,
            this.aiButton,
            this.selectedAttackTypeButton,
            this.spellBookButton,
        ];

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

        this.unitsOverlay = new UnitsOverlay(
            this.pixiSceneManager.getApplication(),
            (name: string) => this.texAny(name),
            (unitProperties: UnitProperties | null) => {
                if (unitProperties) {
                    // Store selected unit properties for placement
                    this.sc_selectedUnitProperties = unitProperties;
                    // This computes sc_visibleOverallImpact + sets the flag
                    this.setSelectedUnitProperties(unitProperties);
                } else {
                    // Proper clear path
                    this.sc_selectedUnitProperties = undefined;
                    this.Deselect(false, true);
                }
            },
        );
        this.unitsOverlay.build();

        this.initializePlacements();
    }
    public override getUnitsOverlay(): UnitsOverlay | undefined {
        return this.unitsOverlay;
    }
    public CameraChanged(): void {
        // After camera fit, PixiSceneManager may swap the world root container.
        this.attachToWorldRoot(this.cornerGfxWorld, 90);
        this.attachToWorldRoot(this.placementGraphics, 100);

        // Reposition (don’t redraw geometry) so quads don’t disappear.
        this.layoutCornerMarkersWorld();
    }
    private getPlacement(teamType: TeamType, placementIndex: number): IPlacement | undefined {
        const placements = teamType === TeamVals.LOWER ? this.lowerPlacements : this.upperPlacements;
        if (placementIndex in placements && placements[placementIndex]) {
            return placements[placementIndex];
        }

        return undefined;
    }
    private drawHoverPlacementCell(gfx: Graphics): void {
        const cells = this.hoverSelectedCells;
        if (!cells || cells.length === 0) return;

        const gs = this.sc_sceneSettings.getGridSettings();
        const size = gs.getCellSize();
        const half = size / 2;

        // ---- choose color: red if invalid, otherwise per-team ----
        let strokeColor = 0xffffff;
        let fillColor = 0xffffff;
        let fillAlpha = 0.18;

        if (this.hoverSelectedCellsSwitchToRed) {
            strokeColor = 0xff5555;
            fillColor = 0xff3333;
            fillAlpha = 0.25;
        }

        // ---- merge all cells into one bounding rect (so 4 cells draw as a single quad) ----
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        for (const c of cells) {
            const pos = GridMath.getPositionForCell(c, gs.getMinX(), gs.getStep(), gs.getHalfStep());

            const left = pos.x - half;
            const right = pos.x + half;
            const bottom = pos.y - half;
            const top = pos.y + half;

            if (left < minX) minX = left;
            if (right > maxX) maxX = right;
            if (bottom < minY) minY = bottom;
            if (top > maxY) maxY = top;
        }

        const w = maxX - minX - 2;
        const h = maxY - minY - 2;

        gfx.rect(minX + 1, minY + 1, w, h)
            .stroke({ width: 2, color: strokeColor, alpha: 1 })
            .fill({ color: fillColor, alpha: fillAlpha });
    }
    protected isAllowedPreStartMousePosition(unit: Unit, cells: HoCMath.XY[]): boolean {
        const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
        const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);

        if (!lowerLeftPlacement || !upperRightPlacement) {
            return false;
        }

        const lowerRightPlacement = this.getPlacement(TeamVals.LOWER, 1);
        const upperLeftPlacement = this.getPlacement(TeamVals.UPPER, 1);

        const mouseWorld = this.sc_mouseWorld;
        const gridSettings = this.sc_sceneSettings.getGridSettings();

        // --- core placement rule: team must be in its placement rectangles
        const isInTeamPlacement =
            ((unit.getTeam() === TeamVals.LOWER || unit.getTeam() === TeamVals.NO_TEAM) &&
                ((lowerLeftPlacement.isAllowed(mouseWorld) ?? false) ||
                    (lowerRightPlacement?.isAllowed(mouseWorld) ?? false))) ||
            ((unit.getTeam() === TeamVals.UPPER || unit.getTeam() === TeamVals.NO_TEAM) &&
                ((upperRightPlacement.isAllowed(mouseWorld) ?? false) ||
                    (upperLeftPlacement?.isAllowed(mouseWorld) ?? false)));

        // Determine which team the mouse is targeting (proposed team)
        let proposedTeam: TeamType = TeamVals.NO_TEAM;
        if (
            (lowerLeftPlacement.isAllowed(mouseWorld) ?? false) ||
            (lowerRightPlacement?.isAllowed(mouseWorld) ?? false)
        ) {
            proposedTeam = TeamVals.LOWER;
        } else if (
            (upperRightPlacement.isAllowed(mouseWorld) ?? false) ||
            (upperLeftPlacement?.isAllowed(mouseWorld) ?? false)
        ) {
            proposedTeam = TeamVals.UPPER;
        }

        // how many allies of this team are already placed on the field
        const alliesPlacedCount = this.unitsHolder.getAllAlliesPlaced(
            proposedTeam,
            lowerLeftPlacement,
            upperRightPlacement,
            lowerRightPlacement,
            upperLeftPlacement,
        ).length;

        const maxUnitsForTeam = FightStateManager.getInstance()
            .getFightProperties()
            .getNumberOfUnitsAvailableForPlacement(proposedTeam);

        const canPlaceMore = alliesPlacedCount < maxUnitsForTeam;

        // if the unit is already on the grid, we allow "reposition" even if cap is reached
        const isInsideGridAtOwnPosition = GridMath.isPositionWithinGrid(gridSettings, unit.getPosition());

        const isInPlacementAndAllowedCount = isInTeamPlacement && (canPlaceMore || isInsideGridAtOwnPosition);

        // --- extra "side lanes" where you can drag units but not place inside the grid
        const inRightLane =
            mouseWorld.x >= GridConstants.MAX_X &&
            mouseWorld.x < GridConstants.MAX_X + gridSettings.getTwoSteps() &&
            mouseWorld.y < GridConstants.MAX_Y &&
            mouseWorld.y >= GridConstants.MIN_Y;

        const inLeftLane =
            mouseWorld.x < GridConstants.MIN_X &&
            mouseWorld.x >= GridConstants.MIN_X - gridSettings.getTwoSteps() &&
            mouseWorld.y >= GridConstants.STEP * PathHelper.Y_FACTION_ICONS_OFFSET &&
            mouseWorld.y < GridConstants.MAX_Y;

        const baseAllowed = isInPlacementAndAllowedCount || inRightLane || inLeftLane;

        // --- for large units, if we have a candidate square selection, validate that shape
        if (!baseAllowed || unit.isSmallSize()) {
            return baseAllowed;
        }

        return this.pathHelper.areCellsFormingSquare(cells);
    }
    private buildLargeUnitCells(baseCell: HoCMath.XY): HoCMath.XY[] {
        // Simple bottom-left anchored 2×2:
        //  [ (x, y)     (x+1, y) ]
        //  [ (x, y+1)   (x+1, y+1) ]
        return [
            { x: baseCell.x, y: baseCell.y },
            { x: baseCell.x + 1, y: baseCell.y },
            { x: baseCell.x, y: baseCell.y + 1 },
            { x: baseCell.x + 1, y: baseCell.y + 1 },
        ];
    }
    private resetHover(resetSelectedCells = true): void {
        if (resetSelectedCells) {
            this.hoverSelectedCells = undefined;
            this.hoverSelectedCellsSwitchToRed = false;
        }

        // this.hoverAttackUnits = undefined;
        // this.hoverAOECells = undefined;
        // this.hoverActivePath = undefined;
        // this.hoverAttackFromCell = undefined;
        // this.hoverAttackIsSmallSize = undefined;
        // this.hoverRangeAttackPosition = undefined;
        // this.hoverRangeAttackObstacle = undefined;
        this.sc_hoverAttackIsTargetingObstacle = false;
        // this.hoverRangeAttackDivisors = [];
        // this.hoverActiveShotRange = undefined;
        // this.hoverActiveAuraRanges = [];
        // if (this.hoverRangeAttackLine) {
        //     this.ground.DestroyFixture(this.hoverRangeAttackLine);
        //     this.hoverRangeAttackLine = undefined;
        // }
        // this.rangeResponseUnits = undefined;
        // this.rangeResponseAttackDivisor = 1;
        this.sc_moveBlocked = false;
        this.sc_isSelection = false;
    }
    private updateHoverPlacementCell(worldPos: HoCMath.XY): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const selected = this.sc_selectedUnitProperties;

        // reset
        this.hoverPlacementCell = undefined;
        this.hoverPlacementCellTeam = undefined;
        this.hoverSelectedCells = undefined;
        this.hoverSelectedCellsSwitchToRed = false;

        if (!selected) return; // no unit selected → no hover

        const cell = GridMath.getCellForPosition(gs, worldPos);
        if (!cell) return;

        const isLarge = selected.size === 2;

        // ---------------------------------------------------------
        // 1) Determine which team this hovered cell belongs to
        //    (because selected.team is NO_TEAM in Sandbox)
        // ---------------------------------------------------------
        const cellHash = (cell.x << 4) | cell.y;
        let teamFromPlacement: TeamType | undefined;

        if (this.allowedPlacementCellHashesPerTeam.get(TeamVals.LOWER)?.has(cellHash)) {
            teamFromPlacement = TeamVals.LOWER;
        } else if (this.allowedPlacementCellHashesPerTeam.get(TeamVals.UPPER)?.has(cellHash)) {
            teamFromPlacement = TeamVals.UPPER;
        }

        // If the cell is not in any placement area, we can still show red 1×1 hover and bail for large.
        if (!teamFromPlacement) {
            this.resetHover();
            return;
        }

        const allowedForTeam =
            (teamFromPlacement && this.allowedPlacementCellHashesPerTeam.get(teamFromPlacement)) ?? undefined;

        let candidateCells: HoCMath.XY[];

        if (isLarge) {
            console.log("LARGE UNIT → using getClosestSquareCellIndices");
            const occupiedKeys: string[] = []; // Sandbox: no pre-round units yet

            candidateCells =
                this.pathHelper.getClosestSquareCellIndices(
                    this.sc_mouseWorld,
                    allowedForTeam,
                    occupiedKeys,
                    undefined, // unitCells
                    undefined, // allowedToMoveThere
                    undefined, // currentActiveKnownPaths
                ) ?? [];
        } else {
            candidateCells = [cell];
        }

        // No legal area for this team
        if (!allowedForTeam || allowedForTeam.size === 0) {
            this.hoverSelectedCells = candidateCells;
            this.hoverSelectedCellsSwitchToRed = true;
            this.hoverPlacementCell = cell;
            this.hoverPlacementCellTeam = teamFromPlacement;
            console.log("RETURN 1");
            return;
        }

        // ---------------------------------------------------------
        // 2) Use original helper for large units, 1×1 for small
        // ---------------------------------------------------------

        console.log("candidateCells:", candidateCells);

        // ---------------------------------------------------------
        // 3) Validate candidates:
        //    - large → must be 4 cells forming a square
        //    - inside global allowedPlacementCellHashes
        //    - empty on grid
        //    - respect isAllowedPreStartMousePosition
        // ---------------------------------------------------------
        let invalid = false;

        if (isLarge) {
            if (candidateCells?.length !== 4) {
                this.resetHover();
                return;
            } else if (!this.pathHelper.areCellsFormingSquare(candidateCells)) {
                invalid = true;
            }
        }

        for (const c of candidateCells) {
            const h = (c.x << 4) | c.y;
            if (!this.allowedPlacementCellHashes.has(h)) {
                this.resetHover();
                return;
            }
        }

        if (!invalid) {
            for (const c of candidateCells) {
                const h = (c.x << 4) | c.y;

                console.log(this.allowedPlacementCellHashes);
                console.log(this.allowedPlacementCellHashes.size);

                console.log("candidateCell", c);
                console.log(this.allowedPlacementCellHashes.has(h));

                const currentOccuppantId = this.grid.getOccupantUnitId(c);
                if (currentOccuppantId && this.unitsHolder.getAllUnits().has(currentOccuppantId)) {
                    invalid = true;
                    break;
                }
            }
        }

        // Optional: use isAllowedPreStartMousePosition
        if (!invalid && teamFromPlacement) {
            // Create a mock unit with correct team just for this check
            const mockUnit = Unit.createUnit(
                selected,
                this.sc_sceneSettings.getGridSettings(),
                teamFromPlacement,
                UnitVals.CREATURE,
                this.abilityFactory,
                this.abilityFactory.getEffectsFactory(),
                false,
            );

            console.log("mockUnit");
            console.log(mockUnit);

            if (!this.isAllowedPreStartMousePosition(mockUnit, candidateCells)) {
                console.log("SSSS");
                invalid = true;
            }
        }

        console.log(`invalid ${invalid}`);

        this.hoverSelectedCellsSwitchToRed = invalid;

        // ---------------------------------------------------------
        // 4) Update hover team + base cell
        // ---------------------------------------------------------
        this.hoverPlacementCell = cell;
        this.hoverSelectedCells = candidateCells;
        this.hoverPlacementCellTeam = teamFromPlacement;
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
        // this.fillActiveRanges(teamType, isSmallUnit, position, auraRanges, auraIsBuff);
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
    private ensureCornerMarkersWorld(): void {
        if (!this.cornerGfxWorld) this.cornerGfxWorld = new Graphics();
        this.attachToWorldRoot(this.cornerGfxWorld, 90);
        // only draw if we just created or after camera changes
        this.layoutCornerMarkersWorld();
    }
    private layoutCornerMarkersWorld(): void {
        const g = this.cornerGfxWorld;
        if (!g) return;

        // Always ensure the layer is alive and visible
        g.visible = true;
        g.renderable = true;
        g.alpha = 1;

        const gs = this.sc_sceneSettings.getGridSettings();
        const minX = gs.getMinX(); // world bottom-left.x
        const maxX = gs.getMaxX(); // world top-right.x (before y-flip)
        const minY = gs.getMinY(); // world bottom-left.y
        const maxY = gs.getMaxY(); // world top-right.y

        const s = 256; // side length
        const eps = 0.75; // inset to avoid edge scissor
        const r = 6; // debug dot radius (screen-independent)

        g.clear();

        // Helper draws a quad AND a small debug circle to confirm visibility even if height gets inverted
        const corner = (x0: number, y0: number, x1: number, y1: number) => {
            // robust rect fill API in v8
            g.rect(x0, y0, x1 - x0, y1 - y0).fill({ color: 0xff0000, alpha: 1 });
            // debug dot near the inner corner
            const cx = (x0 + x1) * 0.5;
            const cy = (y0 + y1) * 0.5;
            g.circle(cx, cy, r).fill({ color: 0x000000, alpha: 1 }); // black dot center
            g.circle(cx, cy, r * 0.5).fill({ color: 0xffffff, alpha: 1 }); // white inner dot
        };

        // Bottom-left (x grows right; your world is y-up so "bottom" is minY in world coords)
        corner(minX + eps, minY + eps, minX + s - eps, minY + s - eps);
        // Bottom-right
        corner(maxX - s + eps, minY + eps, maxX - eps, minY + s - eps);
        // Top-left
        corner(minX + eps, maxY - s + eps, minX + s - eps, maxY - eps);
        // Top-right
        corner(maxX - s + eps, maxY - s + eps, maxX - eps, maxY - eps);
    }
    private attachToWorldRoot(gfx: Graphics | undefined, zIndex: number): void {
        if (!gfx) return;
        const worldRoot = this.pixiSceneManager.getWorldRoot();
        if (gfx.parent !== worldRoot) {
            // move to the new world root
            gfx.removeFromParent();
            worldRoot.addChild(gfx);
        }
        if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
        gfx.zIndex = zIndex;
    }
    public override Resize(w: number, h: number): void {
        this.layoutBackgroundSquare();
        this.unitsOverlay.onResize(w, h);

        this.attachToWorldRoot(this.cornerGfxWorld, 90);
        this.attachToWorldRoot(this.placementGraphics, 100);

        // IMPORTANT: relayout AFTER reattaching
        this.layoutCornerMarkersWorld();
    }
    protected verifyButtonsTrigger(): void {}
    public propagateAugmentation(_t: TeamType, _a: Augment.AugmentType): boolean {
        return false;
    }
    public propagateSynergy(_t: TeamType, _f: FactionType, _n: string, _l: number): boolean {
        return false;
    }
    public getNumberOfUnitsAvailableForPlacement(_t: TeamType): number {
        return 0;
    }
    public propagateButtonClicked(_n: string, _s: VisibleButtonState): void {}
    protected landAttack(): boolean {
        return false;
    }
    protected finishDrop(_p: HoCMath.XY): void {}
    protected handleMouseDownForSelectedBody(): void {}
    public cloneObject(_n?: number): boolean {
        return false;
    }
    public deleteObject(): void {}
    public refreshScene(_u: UnitProperties): void {}
    public setGridType(gridType: GridType): void {
        this.gridType = gridType;
        this.pixiSceneManager.setGridType(gridType);
        this.sc_gridTypeUpdateNeeded = true;
        this.layoutCornerMarkersWorld();
    }
    public getGridType(): GridType {
        return this.gridType;
    }
    public requestTime(_team: number): void {}
    private tryPlaceUnit(p: HoCMath.XY): void {
        const allPlacements = [...this.lowerPlacements, ...this.upperPlacements].filter(
            Boolean,
        ) as IDrawablePlacement[];

        let targetPlacement: IDrawablePlacement | undefined;
        for (const placement of allPlacements) {
            if (placement.isAllowed(p)) {
                targetPlacement = placement;
                break;
            }
        }

        if (!targetPlacement || !this.sc_selectedUnitProperties) {
            return;
        }

        let teamType: TeamType | undefined;
        if (this.lowerPlacements.includes(targetPlacement)) {
            teamType = TeamVals.LOWER;
        } else if (this.upperPlacements.includes(targetPlacement)) {
            teamType = TeamVals.UPPER;
        }

        if (!teamType) {
            return;
        }

        const isSmallUnit = this.sc_selectedUnitProperties.size === 1;

        const possiblePositions = targetPlacement.possibleCellPositions(isSmallUnit);
        HoCLib.shuffle(possiblePositions);

        let closestPosition: HoCMath.XY | undefined;
        let minDistance = Infinity;
        for (const pos of possiblePositions) {
            const distance = Math.sqrt(Math.pow(pos.x - p.x, 2) + Math.pow(pos.y - p.y, 2));
            if (distance < minDistance) {
                minDistance = distance;
                closestPosition = pos;
            }
        }

        if (closestPosition) {
            console.log(
                `Placing ${this.sc_selectedUnitProperties.name} at position (${closestPosition.x}, ${closestPosition.y}) in ${teamType} placement`,
            );

            // TODO: if you want full integration, construct a Unit and call this.unitsHolder.addUnit(...)
            // and update grid occupancy here.

            this.sc_selectedUnitProperties = undefined;
            if (this.unitsOverlay) {
                this.unitsOverlay.clearSelection(true);
            }
        }
    }
    protected destroyTempFixtures(): void {}
    public override MouseDown(p: HoCMath.XY): void {
        let overlayHandled = false;

        if (this.unitsOverlay) {
            overlayHandled = this.unitsOverlay.handlePointerDown(p.x, p.y);
        }

        if (!overlayHandled && this.unitsOverlay && this.unitsOverlay.hasSelection()) {
            // Click somewhere that overlay did not handle (outside its rect)
            // → clear selection, but still allow board logic.
            this.unitsOverlay.clearSelection(true);
        }

        if (overlayHandled) {
            // overlay ate the click (toggle, chip, or empty area inside overlay)
            return;
        }

        // If we have a selected unit from the overlay and the fight hasn't started,
        // try to place the unit in an empty placement area
        if (this.sc_selectedUnitProperties && !FightStateManager.getInstance().getFightProperties().hasFightStarted()) {
            this.tryPlaceUnit(p);
        }

        if (this.sc_isAnimating) return;
        this.verifyButtonsTrigger();
    }
    protected override hover(): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();

        // Only show hover placement pre-fight
        if (!fightProps.hasFightStarted()) {
            this.updateHoverPlacementCell(this.sc_mouseWorld);
        }
    }
    public override MouseMove(p: HoCMath.XY, leftDrag: boolean): void {
        // Let base class keep sc_mouseWorld, hover() etc.
        super.MouseMove(p, leftDrag);

        const fightProps = FightStateManager.getInstance().getFightProperties();

        if (!fightProps.hasFightStarted()) {
            // sc_mouseWorld is already set by base, but we can be explicit if you like:
            this.updateHoverPlacementCell(this.sc_mouseWorld);
        } else {
            this.hoverPlacementCell = undefined;
            this.hoverPlacementCellTeam = undefined;
        }
    }
    public override Step(_settings: Settings, timeStep: number): void {
        if (timeStep > 0) this.sc_stepCount.increment();
        this.sc_isAnimating = this.pixiSceneManager.isAnimating();

        this.ensureBackgroundSprite();
        this.layoutBackgroundSquare();

        // this.ensureCornerMarkersWorld();
        this.ensurePlacementGraphicsWorld();

        // this.attachToWorldRoot(this.cornerGfxWorld, 90);
        this.attachToWorldRoot(this.placementGraphics, 100);

        this.spawnPulsePhase += timeStep * 3.7; // accumulate
        setSpawnFlowPhase(this.spawnPulsePhase);

        // always redraw placements (geometry is cached in placements themselves)
        if (this.placementGraphics) {
            this.drawPlacements();
        }
    }
    private initializePlacements(): void {
        this.lowerPlacements = [];
        this.upperPlacements = [];

        const fp = FightStateManager.getInstance().getFightProperties();
        const augLower = fp.getAugmentPlacement(TeamVals.LOWER);
        const augUpper = fp.getAugmentPlacement(TeamVals.UPPER);
        const placementType = fp.getPlacementType();

        if (placementType === PlacementType.RECTANGLE) {
            // 3 rows tall, full board width is handled by RectanglePlacement itself.
            const heightRows = 3;
            this.lowerPlacements.push(
                new DrawableRectanglePlacement(
                    this.sc_sceneSettings.getGridSettings(),
                    PlacementPositionType.LOWER_LEFT,
                    heightRows,
                ),
            );
            this.upperPlacements.push(
                new DrawableRectanglePlacement(
                    this.sc_sceneSettings.getGridSettings(),
                    PlacementPositionType.UPPER_LEFT,
                    heightRows,
                ),
            );
        } else {
            // (unchanged) square halves driven by augment sizes
            if (0 in augLower) {
                this.lowerPlacements.push(
                    new DrawableSquarePlacement(
                        this.sc_sceneSettings.getGridSettings(),
                        PlacementPositionType.LOWER_LEFT,
                        augLower[0],
                    ),
                );
            }
            if (1 in augLower) {
                this.lowerPlacements.push(
                    new DrawableSquarePlacement(
                        this.sc_sceneSettings.getGridSettings(),
                        PlacementPositionType.LOWER_RIGHT,
                        augLower[1],
                    ),
                );
            }
            if (0 in augUpper) {
                this.upperPlacements.push(
                    new DrawableSquarePlacement(
                        this.sc_sceneSettings.getGridSettings(),
                        PlacementPositionType.UPPER_RIGHT,
                        augUpper[0],
                    ),
                );
            }
            if (1 in augUpper) {
                this.upperPlacements.push(
                    new DrawableSquarePlacement(
                        this.sc_sceneSettings.getGridSettings(),
                        PlacementPositionType.UPPER_LEFT,
                        augUpper[1],
                    ),
                );
            }
        }

        // rebuild allowed hashes (kept as before)
        this.allowedPlacementCellHashes.clear();
        this.allowedPlacementCellHashesPerTeam.clear();
        this.allowedPlacementCellHashesPerTeam.set(TeamVals.UPPER, new Set());
        this.allowedPlacementCellHashesPerTeam.set(TeamVals.LOWER, new Set());

        const addHashes = (team: TeamType, p?: IDrawablePlacement) => {
            if (!p) return;
            const target = this.allowedPlacementCellHashesPerTeam.get(team);
            for (const hash of p.possibleCellHashes()) {
                this.allowedPlacementCellHashes.add(hash);
                target?.add(hash);
            }
        };

        addHashes(TeamVals.LOWER, this.lowerPlacements[0]);
        addHashes(TeamVals.LOWER, this.lowerPlacements[1]);
        addHashes(TeamVals.UPPER, this.upperPlacements[0]);
        addHashes(TeamVals.UPPER, this.upperPlacements[1]);
    }
    private drawPlacements(): void {
        if (!this.placementGraphics) return;
        const g = this.placementGraphics;
        g.clear();

        const props = FightStateManager.getInstance().getFightProperties();
        if (!props.hasFightStarted()) {
            let team: TeamType | undefined = undefined;
            const draw = (p?: IDrawablePlacement) => p && p.draw(g);

            if (team === undefined) {
                draw(this.lowerPlacements[0]);
                draw(this.lowerPlacements[1]);
                draw(this.upperPlacements[0]);
                draw(this.upperPlacements[1]);
            } else if (team === TeamVals.LOWER) {
                draw(this.lowerPlacements[0]);
                draw(this.lowerPlacements[1]);
            } else if (team === TeamVals.UPPER) {
                draw(this.upperPlacements[0]);
                draw(this.upperPlacements[1]);
            }

            // ✨ hover highlight on top
            this.drawHoverPlacementCell(g);
        }
    }
}

registerScene("Heroes", "Sandbox", Sandbox);
