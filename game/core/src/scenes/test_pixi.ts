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
import { TextureType, unitToTextureName } from "@/pixi/PixiUnitsFactory";

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
    private hoverSilhouette?: Sprite;
    private hoverSilhouetteOutline?: Sprite;
    private hoverSilhouetteKey?: string;
    private hoverSelectedCells?: HoCMath.XY[];
    private cellToUnitPreRound?: Map<string, Unit>;
    private unitSprites: Map<string, Sprite> = new Map();
    private hoverSelectedCellsSwitchToRed = false;
    private readonly unitsHolder: UnitsHolder;
    private readonly abilityFactory: AbilityFactory;
    private spawnAnimations: {
        sprite: Sprite;
        startScaleX: number;
        startScaleY: number;
        endScaleX: number;
        endScaleY: number;
        elapsed: number;
        duration: number;
    }[] = [];
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
    private ensureUnitSprite(unit: Unit, props: UnitProperties): { sprite: Sprite; scale: number } | undefined {
        const id = unit.getId();
        let sprite = this.unitSprites.get(id);

        // --- texture key based on unit props (same logic as hover) ---
        const texName = unitToTextureName(props.name, TextureType.SMALL, props.size);
        const tex = this.texAny(texName);
        if (!tex) {
            return undefined;
        }

        if (!sprite) {
            sprite = new Sprite(tex);
            sprite.anchor.set(0.5);
            // y-up world → flip vertically in Pixi
            sprite.scale.y = -1;
            this.attachToWorldRoot(sprite, 120); // above placements & hover
            this.unitSprites.set(id, sprite);
        } else {
            sprite.texture = tex;
        }

        const pos = unit.getPosition();
        const targetSize = props.size === 2 ? 256 : 128;
        const baseWidth = tex.width || 1;
        const scale = targetSize / baseWidth;

        sprite.scale.set(scale, -scale);
        sprite.x = pos.x;
        sprite.y = pos.y;
        sprite.visible = true;
        sprite.alpha = 1;
        sprite.tint = 0xffffff;

        return { sprite, scale };
    }
    private startSpawnAnimation(sprite: Sprite, endScale: number): void {
        const endScaleX = endScale;
        const endScaleY = -endScale; // keep y-flip

        // Start a bit bigger and fade in → "materializing" feel
        const startScaleX = endScaleX * 1.3;
        const startScaleY = endScaleY * 1.3;

        sprite.scale.set(startScaleX, startScaleY);
        sprite.alpha = 0;

        this.spawnAnimations.push({
            sprite,
            startScaleX,
            startScaleY,
            endScaleX,
            endScaleY,
            elapsed: 0,
            duration: 0.25, // ~0.25s animation
        });
    }
    private updateSpawnAnimations(dt: number): void {
        if (!dt || this.spawnAnimations.length === 0) return;

        // Simple ease-out (cubic)
        const easeOutCubic = (t: number) => {
            const u = 1 - t;
            return 1 - u * u * u;
        };

        this.spawnAnimations = this.spawnAnimations.filter((anim) => {
            // If sprite was removed, drop animation
            if (!anim.sprite.parent) {
                return false;
            }

            anim.elapsed += dt;
            const t = Math.min(anim.elapsed / anim.duration, 1);
            const e = easeOutCubic(t);

            const sx = anim.startScaleX + (anim.endScaleX - anim.startScaleX) * e;
            const sy = anim.startScaleY + (anim.endScaleY - anim.startScaleY) * e;

            anim.sprite.scale.set(sx, sy);
            anim.sprite.alpha = e;

            if (t >= 1) {
                anim.sprite.scale.set(anim.endScaleX, anim.endScaleY);
                anim.sprite.alpha = 1;
                return false; // finished
            }
            return true;
        });
    }
    private syncUnitSprites(): void {
        const gs = this.sc_sceneSettings.getGridSettings();

        for (const [id, unit] of this.unitsHolder.getAllUnits()) {
            const sprite = this.unitSprites.get(id);
            if (!sprite) continue;

            const pos = unit.getPosition();
            // optional: hide if outside board
            if (!GridMath.isPositionWithinGrid(gs, pos)) {
                sprite.visible = false;
                continue;
            }

            sprite.visible = true;
            sprite.x = pos.x;
            sprite.y = pos.y;
        }
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
        this.clearHoverSilhouette();
    }
    private clearHoverSilhouette(): void {
        if (this.hoverSilhouette) {
            this.hoverSilhouette.visible = false;
        }
        if (this.hoverSilhouetteOutline) {
            this.hoverSilhouetteOutline.visible = false;
        }
    }
    private updateHoverSilhouette(boundsCenter: HoCMath.XY): void {
        const selected = this.sc_selectedUnitProperties;

        if (!selected || this.hoverSelectedCellsSwitchToRed || !this.hoverSelectedCells?.length) {
            this.clearHoverSilhouette();
            return;
        }

        const texName = unitToTextureName(selected.name, TextureType.SMALL, selected.size);
        const tex = this.texAny(texName);

        if (!tex) {
            this.clearHoverSilhouette();
            return;
        }

        if (!this.hoverSilhouette) {
            this.hoverSilhouette = new Sprite(tex);
            this.hoverSilhouette.anchor.set(0.5);
            this.attachToWorldRoot(this.hoverSilhouette, 110);
            this.hoverSilhouette.scale.y = -1;
        } else if (this.hoverSilhouetteKey !== texName) {
            this.hoverSilhouette.texture = tex;
        }

        if (!this.hoverSilhouetteOutline) {
            this.hoverSilhouetteOutline = new Sprite(tex);
            this.hoverSilhouetteOutline.anchor.set(0.5);
            this.attachToWorldRoot(this.hoverSilhouetteOutline, 109);
            this.hoverSilhouetteOutline.scale.y = -1;
        } else if (this.hoverSilhouetteKey !== texName) {
            this.hoverSilhouetteOutline.texture = tex;
        }

        this.hoverSilhouetteKey = texName;

        const sprite = this.hoverSilhouette;
        const outline = this.hoverSilhouetteOutline;

        const targetSize = selected.size === 2 ? 256 : 128;

        const baseWidth = tex.width || 1;
        const scale = targetSize / baseWidth;
        const outlineScale = scale * 1.06;

        sprite.scale.set(scale, -scale);
        outline.scale.set(outlineScale, -outlineScale);

        sprite.x = boundsCenter.x;
        sprite.y = boundsCenter.y;
        outline.x = boundsCenter.x;
        outline.y = boundsCenter.y;

        outline.visible = true;
        outline.alpha = 0.9;
        outline.tint = 0xffffff;

        sprite.visible = true;
        sprite.alpha = 0.8;
        sprite.tint = 0x000000;
    }
    private updateHoverPlacementCell(worldPos: HoCMath.XY): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const selected = this.sc_selectedUnitProperties;

        // reset
        this.hoverPlacementCell = undefined;
        this.hoverPlacementCellTeam = undefined;
        this.hoverSelectedCells = undefined;
        this.hoverSelectedCellsSwitchToRed = false;
        this.clearHoverSilhouette();

        if (!selected) return; // no unit selected → no hover

        const cell = GridMath.getCellForPosition(gs, worldPos);
        if (!cell) return;

        const isLarge = selected.size === 2;

        const cellHash = (cell.x << 4) | cell.y;
        let teamFromPlacement: TeamType | undefined;

        if (this.allowedPlacementCellHashesPerTeam.get(TeamVals.LOWER)?.has(cellHash)) {
            teamFromPlacement = TeamVals.LOWER;
        } else if (this.allowedPlacementCellHashesPerTeam.get(TeamVals.UPPER)?.has(cellHash)) {
            teamFromPlacement = TeamVals.UPPER;
        }

        // If the cell is not in any placement area, nothing to show
        if (!teamFromPlacement) {
            this.resetHover();
            return;
        }

        const allowedForTeam =
            (teamFromPlacement && this.allowedPlacementCellHashesPerTeam.get(teamFromPlacement)) ?? undefined;

        let candidateCells: HoCMath.XY[];

        if (isLarge) {
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
            return;
        }

        let invalid = false;

        // Large units must have 4 cells forming a square
        if (isLarge) {
            if (candidateCells?.length !== 4) {
                this.resetHover();
                return;
            } else if (!this.pathHelper.areCellsFormingSquare(candidateCells)) {
                invalid = true;
            }
        }

        // All cells must be in allowed placement hashes
        for (const c of candidateCells) {
            const h = (c.x << 4) | c.y;
            if (!this.allowedPlacementCellHashes.has(h)) {
                this.resetHover();
                return;
            }
        }

        // All cells must be empty on grid
        if (!invalid) {
            for (const c of candidateCells) {
                const currentOccuppantId = this.grid.getOccupantUnitId(c);
                if (currentOccuppantId && this.unitsHolder.getAllUnits().has(currentOccuppantId)) {
                    invalid = true;
                    break;
                }
            }
        }

        if (!invalid && teamFromPlacement) {
            const mockUnit = Unit.createUnit(
                selected,
                this.sc_sceneSettings.getGridSettings(),
                teamFromPlacement,
                UnitVals.CREATURE,
                this.abilityFactory,
                this.abilityFactory.getEffectsFactory(),
                false,
            );
            const possiblePosition = GridMath.getPositionForCells(gs, candidateCells);
            if (possiblePosition) {
                mockUnit.setPosition(possiblePosition.x, possiblePosition.y, false);
            }

            if (
                !this.pathHelper.isAllowedPreStartUnitPosition(
                    mockUnit,
                    candidateCells,
                    this.unitsHolder,
                    this.getPlacement(TeamVals.LOWER, 0),
                    this.getPlacement(TeamVals.UPPER, 0),
                    this.getPlacement(TeamVals.LOWER, 1),
                    this.getPlacement(TeamVals.UPPER, 1),
                )
            ) {
                invalid = true;
            }
        }

        this.hoverSelectedCellsSwitchToRed = invalid;
        this.hoverPlacementCell = cell;
        this.hoverSelectedCells = candidateCells;
        this.hoverPlacementCellTeam = teamFromPlacement;

        // ---------------------------------------------------------
        // 5) Compute bounds center and update silhouette (only if valid)
        // ---------------------------------------------------------
        if (!invalid && candidateCells.length > 0) {
            const size = gs.getCellSize();
            const half = size / 2;

            let minX = Number.POSITIVE_INFINITY;
            let maxX = Number.NEGATIVE_INFINITY;
            let minY = Number.POSITIVE_INFINITY;
            let maxY = Number.NEGATIVE_INFINITY;

            for (const c of candidateCells) {
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

            const centerX = (minX + maxX) * 0.5;
            const centerY = (minY + maxY) * 0.5;

            this.updateHoverSilhouette({ x: centerX, y: centerY });
        } else {
            this.clearHoverSilhouette();
        }
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
    private attachToWorldRoot(obj: Graphics | Sprite | undefined, zIndex: number): void {
        if (!obj) return;
        const worldRoot = this.pixiSceneManager.getWorldRoot();
        if (obj.parent !== worldRoot) {
            obj.removeFromParent();
            worldRoot.addChild(obj);
        }
        if (!worldRoot.sortableChildren) worldRoot.sortableChildren = true;
        obj.zIndex = zIndex;
    }
    private createUnitForTeam(teamType: TeamType): Unit | undefined {
        const selected = this.sc_selectedUnitProperties;
        if (!selected || teamType === TeamVals.NO_TEAM) return undefined;

        const unit = Unit.createUnit(
            selected,
            this.sc_sceneSettings.getGridSettings(),
            teamType,
            UnitVals.CREATURE,
            this.abilityFactory,
            this.abilityFactory.getEffectsFactory(),
            false,
        );

        // Register inside holder if not already there
        if (!this.unitsHolder.getAllUnits().has(unit.getId())) {
            this.unitsHolder.addUnit(unit);
        }

        return unit;
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
    private tryPlaceUnit(): void {
        console.log("tryPlaceUnit called");

        const selected = this.sc_selectedUnitProperties;
        const fightProps = FightStateManager.getInstance().getFightProperties();

        if (!selected) {
            console.log("No selected unit");
            return;
        }
        if (fightProps.hasFightStarted()) {
            console.log("Fight already started, no placement");
            return;
        }

        // Must have a valid hover shape
        if (!this.hoverSelectedCells || this.hoverSelectedCells.length === 0 || this.hoverSelectedCellsSwitchToRed) {
            console.log("No valid hoverSelectedCells or hover is red, abort placement");
            return;
        }

        const teamType = this.hoverPlacementCellTeam;
        if (!teamType) {
            console.log("No hoverPlacementCellTeam, abort placement");
            return;
        }

        const gs = this.sc_sceneSettings.getGridSettings();
        const cellsToOccupy = this.hoverSelectedCells;

        // Defensive check: ensure all cells are inside allowed hashes and empty
        for (const c of cellsToOccupy) {
            const h = (c.x << 4) | c.y;
            if (!this.allowedPlacementCellHashes.has(h)) {
                console.log("Cell not in allowed placement hashes", c);
                return;
            }
        }

        if (!this.grid.areAllCellsEmpty(cellsToOccupy)) {
            console.log("Some cells already occupied, abort");
            return;
        }

        // Double-check per-team cap (defensive; hover already checked via isAllowedPreStartMousePosition)
        const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
        const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
        const lowerRightPlacement = this.getPlacement(TeamVals.LOWER, 1);
        const upperLeftPlacement = this.getPlacement(TeamVals.UPPER, 1);

        if (lowerLeftPlacement && upperRightPlacement) {
            const alliesPlacedCount = this.unitsHolder.getAllAlliesPlaced(
                teamType,
                lowerLeftPlacement,
                upperRightPlacement,
                lowerRightPlacement,
                upperLeftPlacement,
            ).length;

            const maxUnitsForTeam = fightProps.getNumberOfUnitsAvailableForPlacement(teamType);

            if (alliesPlacedCount >= maxUnitsForTeam) {
                console.log(`Team ${teamType} reached placement cap ${alliesPlacedCount}/${maxUnitsForTeam}, abort`);
                return;
            }
        }

        // Compute world position from the same cells as silhouette
        const placePos = GridMath.getPositionForCells(gs, cellsToOccupy);
        if (!placePos) {
            console.log("Failed to compute position for cells");
            return;
        }

        // Create unit for this team
        const unit = this.createUnitForTeam(teamType);
        if (!unit) {
            console.log("Failed to create unit");
            return;
        }

        const hasMadeOfFire = unit.hasAbilityActive("Made of Fire");
        const hasMadeOfWater = unit.hasAbilityActive("Made of Water");

        // Occupy cells on grid
        let occupied = false;
        if (cellsToOccupy.length === 1) {
            const c = cellsToOccupy[0];
            console.log("Try occupy single cell", c);
            occupied = this.grid.occupyCell(
                c,
                unit.getId(),
                unit.getTeam(),
                unit.getAttackRange(),
                hasMadeOfFire,
                hasMadeOfWater,
            );
        } else {
            console.log("Try occupy cells", cellsToOccupy);
            occupied = this.grid.occupyCells(
                cellsToOccupy,
                unit.getId(),
                unit.getTeam(),
                unit.getAttackRange(),
                hasMadeOfFire,
                hasMadeOfWater,
            );
        }

        if (!occupied) {
            console.log("Grid reject occupy");
            return;
        }

        // Commit logical position
        unit.setPosition(placePos.x, placePos.y);

        // Create/update sprite and trigger spawn animation
        const ensured = this.ensureUnitSprite(unit, selected);
        if (!ensured) {
            console.log("Failed to ensure unit sprite");
            return;
        }

        const { sprite, scale } = ensured;
        this.startSpawnAnimation(sprite, scale);

        // Recompute stack power, etc.
        this.unitsHolder.refreshStackPowerForAllUnits();

        console.log(
            `Placed ${selected.name} (size=${selected.size}) at (${placePos.x}, ${placePos.y}) for team ${teamType}`,
        );

        // Clean up selection + silhouette
        this.sc_selectedUnitProperties = undefined;
        this.clearHoverSilhouette();
        if (this.unitsOverlay) {
            this.unitsOverlay.clearSelection(true);
        }

        // Also clear hover cells so next click must come from new hover
        this.hoverSelectedCells = undefined;
        this.hoverSelectedCellsSwitchToRed = false;
    }
    protected destroyTempFixtures(): void {}
    public override MouseDown(p: HoCMath.XY): void {
        // keep world position up to date
        this.sc_mouseWorld = p;

        const fightProps = FightStateManager.getInstance().getFightProperties();

        // If we have a selected unit from the overlay and the fight hasn't started,
        // update hover for this click position and then try to place from hover.
        if (this.sc_selectedUnitProperties && !fightProps.hasFightStarted()) {
            this.updateHoverPlacementCell(p);
            this.tryPlaceUnit();
            return; // don't propagate to base, we handled this click
        }

        // No pre-start placement → base behavior (hotkeys, buttons, etc.)
        super.MouseDown(p);
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

        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.hasFightStarted()) {
            this.clearHoverSilhouette();
        }

        this.ensureBackgroundSprite();
        this.layoutBackgroundSquare();

        this.ensurePlacementGraphicsWorld();
        this.attachToWorldRoot(this.placementGraphics, 100);

        this.spawnPulsePhase += timeStep * 3.7;
        setSpawnFlowPhase(this.spawnPulsePhase);

        if (this.placementGraphics) {
            this.drawPlacements();
        }
        this.syncUnitSprites();

        // ✨ new: animate newly spawned units
        this.updateSpawnAnimations(timeStep);
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
