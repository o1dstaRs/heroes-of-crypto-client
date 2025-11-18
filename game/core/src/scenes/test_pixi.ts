// game/core/src/scenes/test_pixi.ts
import { Sprite, Graphics, Container, Text, TextStyle } from "pixi.js";
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
    /** placement-preview hover (for active selection: overlay OR board move) */
    private hoverPlacementCell?: HoCMath.XY;
    private hoverPlacementCellTeam?: TeamType;
    private hoverSelectedCells?: HoCMath.XY[];
    private hoverSelectedCellsSwitchToRed = false;
    private lastPlacementUnitId?: string;
    private lastPlacementTimestampSec = 0;
    private readonly hoverRearmDelaySec = 2.0;
    private unitBadges: Map<string, { container: Container; circle: Graphics; text: Text; iconSide: number }> =
        new Map();
    /** silhouette used both for overlay preview and for board hover/move */
    private hoverSilhouette?: Sprite;
    private hoverSilhouetteOutline?: Sprite;
    private hoverSilhouetteKey?: string;
    /** passive hover highlight for an already placed unit (no selection) */
    private hoveredUnitHighlight?: { x: number; y: number; w: number; h: number };
    /** UnitChip-style hover tween state for already placed units */
    private boardHoverScale = 1;
    private boardHoverTargetScale = 1;
    private boardHoverYOffset = 0;
    private boardHoverTargetYOffset = 0;
    private boardHoverProps?: UnitProperties;
    private boardHoverCenter?: HoCMath.XY;
    private cellToUnitPreRound?: Map<string, Unit>;
    private unitSprites: Map<string, Sprite> = new Map();
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
    /** Active-board-selection state (move existing unit) */
    private draggingUnitId?: string;
    private draggingUnitTeam?: TeamType;
    /** Is there an actual *active* selection (overlay or board)? */
    private hasActiveSelection = false;
    /** True if the active selection came from overlay; false if from board. */
    private selectionFromOverlay = false;
    /** Phase for animating the hover glow (shimmer effect) */
    private hoverGlowPhase = 0;
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
        // Overlay selection: creates a *new* unit type selection (not tied to board unit)
        this.unitsOverlay = new UnitsOverlay(
            this.pixiSceneManager.getApplication(),
            (name: string) => this.texAny(name),
            (unitProperties: UnitProperties | null) => {
                if (unitProperties) {
                    // Active overlay selection
                    this.hasActiveSelection = true;
                    this.selectionFromOverlay = true;
                    this.draggingUnitId = undefined;
                    this.draggingUnitTeam = undefined;
                    this.sc_selectedUnitProperties = unitProperties;
                    this.setSelectedUnitProperties(unitProperties);
                } else {
                    // Overlay cleared → clear common state; overlay already fired UnitSelected(null)
                    this.clearBoardSelection(false);
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
        this.attachToWorldRoot(this.cornerGfxWorld, 90);
        this.attachToWorldRoot(this.placementGraphics, 100);
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
        const texName = unitToTextureName(props.name, TextureType.SMALL, props.size);
        const tex = this.texAny(texName);
        if (!tex) return undefined;
        if (!sprite) {
            sprite = new Sprite(tex);
            sprite.anchor.set(0.5);
            sprite.scale.y = -1; // y-up → flip in Pixi
            this.attachToWorldRoot(sprite, 120);
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
        // Use grid cell size so badges are consistent across unit sizes
        const gs = this.sc_sceneSettings.getGridSettings();
        const iconSide = gs.getCellSize();
        this.ensureUnitBadge(unit, props, iconSide, pos);
        return { sprite, scale };
    }
    private startSpawnAnimation(sprite: Sprite, endScale: number): void {
        const endScaleX = endScale;
        const endScaleY = -endScale;
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
            duration: 0.25,
        });
    }
    private updateSpawnAnimations(dt: number): void {
        if (!dt || this.spawnAnimations.length === 0) return;
        const easeOutCubic = (t: number) => {
            const u = 1 - t;
            return 1 - u * u * u;
        };
        this.spawnAnimations = this.spawnAnimations.filter((anim) => {
            if (!anim.sprite.parent) return false;
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
                return false;
            }
            return true;
        });
    }
    private updateBoardHoverTween(dt: number): void {
        if (!dt) return;
        const lerp = (from: number, to: number, speed: number) => {
            if (from === to) return from;
            const step = Math.min(1, speed * dt); // simple exponential-ish smoothing
            return from + (to - from) * step;
        };
        // Fast but smooth – ~150–200ms glide like UnitChip
        this.boardHoverScale = lerp(this.boardHoverScale, this.boardHoverTargetScale, 8);
        this.boardHoverYOffset = lerp(this.boardHoverYOffset, this.boardHoverTargetYOffset, 8);
        if (this.boardHoverProps && this.boardHoverCenter && !this.hasActiveSelection) {
            this.updateBoardHoverSilhouette(this.boardHoverProps, this.boardHoverCenter);
        }
    }
    private syncUnitSprites(): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const cellSize = gs.getCellSize();
        for (const [id, unit] of this.unitsHolder.getAllUnits()) {
            const sprite = this.unitSprites.get(id);
            if (!sprite) continue;
            const pos = unit.getPosition();
            const inGrid = GridMath.isPositionWithinGrid(gs, pos);
            const badge = this.unitBadges.get(id);
            if (!inGrid) {
                sprite.visible = false;
                if (badge) badge.container.visible = false;
                continue;
            }
            sprite.visible = true;
            sprite.x = pos.x;
            sprite.y = pos.y;
            const props = unit.getUnitProperties();
            this.ensureUnitBadge(unit, props, cellSize, pos);
        }
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
    private drawHoverPlacementCell(gfx: Graphics): void {
        const cells = this.hoverSelectedCells;
        if (!cells || cells.length === 0) return;
        const gs = this.sc_sceneSettings.getGridSettings();
        const size = gs.getCellSize();
        const half = size / 2;
        let strokeColor = 0xffffff;
        let fillColor = 0xffffff;
        let fillAlpha = 0.18;
        if (this.hoverSelectedCellsSwitchToRed) {
            strokeColor = 0xff5555;
            fillColor = 0xff3333;
            fillAlpha = 0.25;
        }
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
    /** Draw passive board-hover highlight (when there is no active selection) */
    private drawHoveredUnitHighlight(gfx: Graphics): void {
        const r = this.hoveredUnitHighlight;
        if (!r) return;
        const cx = r.x + r.w * 0.5;
        const cy = r.y + r.h * 0.5;
        const iconSide = Math.max(r.w, r.h);
        // Modulate for shimmer: gentle pulse using sine wave
        const pulse = (Math.sin(this.hoverGlowPhase) + 1) / 2; // 0 to 1
        const pulseFactor = 0.05 + pulse * 0.1; // subtle 5-15% variation
        // --- Under-glow ellipse (like UnitChip.glow), but stronger ---
        const baseW = iconSide * 0.95;
        const baseH = iconSide * 0.28;
        const yOffset = iconSide * 0.48;
        const underLayers = 5;
        for (let i = 0; i < underLayers; i++) {
            const t = (i + 1) / underLayers;
            const w = baseW * (1 + 0.3 * t) * (1 + pulseFactor);
            const h = baseH * (1 + 0.4 * t) * (1 + pulseFactor);
            const alpha = 0.3 * (1 - t * 0.75) * (1 - pulseFactor * 0.5); // slightly dim when expanding
            // Y-flip: move light to the correct side in world coords
            gfx.ellipse(cx, cy - yOffset, w * 0.5, h * 0.5).fill({ color: 0xffffff, alpha });
        }
        // --- Around-glow ring (stronger) ---
        const baseR = iconSide * 0.6;
        const aroundLayers = 6;
        for (let i = 0; i < aroundLayers; i++) {
            const t = (i + 1) / aroundLayers;
            const rg = baseR * (1 + 0.45 * t) * (1 + pulseFactor);
            const alpha = 0.22 * (1 - t * 0.8) * (1 - pulseFactor * 0.5);
            gfx.circle(cx, cy, rg).fill({ color: 0xffffff, alpha });
        }
    }
    private updatePlacementHoverRearm(): void {
        if (!this.lastPlacementUnitId) return;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.hasFightStarted() || this.hasActiveSelection) {
            this.lastPlacementUnitId = undefined;
            return;
        }
        // If hover is already active from normal logic, do nothing.
        if (this.hoveredUnitHighlight) return;
        const nowSec = HoCLib.getTimeMillis() / 1000;
        if (nowSec - this.lastPlacementTimestampSec < this.hoverRearmDelaySec) return;
        const unit = this.unitsHolder.getAllUnits().get(this.lastPlacementUnitId);
        if (!unit) {
            this.lastPlacementUnitId = undefined;
            return;
        }
        const rect = this.getHighlightRectForUnit(unit);
        if (!rect) {
            this.lastPlacementUnitId = undefined;
            return;
        }
        const p = this.sc_mouseWorld;
        const inside = p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
        if (inside) {
            // Re-arm the hover highlight on the just-placed unit
            this.hoveredUnitHighlight = rect;
        }
        // One-shot: either we re-armed or cursor left the area; in both cases stop tracking.
        this.lastPlacementUnitId = undefined;
    }
    private resetHover(resetSelectedCells = true): void {
        if (resetSelectedCells) {
            this.hoverSelectedCells = undefined;
            this.hoverSelectedCellsSwitchToRed = false;
        }
        this.sc_hoverAttackIsTargetingObstacle = false;
        this.sc_moveBlocked = false;
        this.sc_isSelection = false;
        this.clearHoverSilhouette();
    }
    private clearHoverSilhouette(): void {
        if (this.hoverSilhouette) this.hoverSilhouette.visible = false;
        if (this.hoverSilhouetteOutline) this.hoverSilhouetteOutline.visible = false;
    }
    /** Silhouette for placement preview (overlay/board move) */
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
    /** Silhouette for passive board-hover (no selection) – styled like UnitChip hover */
    private updateBoardHoverSilhouette(props: UnitProperties, center: HoCMath.XY): void {
        const texName = unitToTextureName(props.name, TextureType.SMALL, props.size);
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
        const targetSize = props.size === 2 ? 256 : 128;
        const baseWidth = tex.width || 1;
        const baseScale = targetSize / baseWidth;
        const scale = baseScale * this.boardHoverScale;
        const outlineScale = scale * 1.08;
        const y = center.y + this.boardHoverYOffset;
        sprite.scale.set(scale, -scale);
        outline.scale.set(outlineScale, -outlineScale);
        sprite.x = center.x;
        sprite.y = y;
        outline.x = center.x;
        outline.y = y;
        // “Light + enlarge” like UnitChip: bright sprite + soft outer halo
        outline.visible = true;
        outline.alpha = 0.35;
        outline.tint = 0xffffff;
        sprite.visible = true;
        sprite.alpha = 1.0;
        sprite.tint = 0xffffff;
    }
    private updateHoverPlacementCell(worldPos: HoCMath.XY): void {
        const gs = this.sc_sceneSettings.getGridSettings();
        const selected = this.sc_selectedUnitProperties;
        // reset preview state
        this.hoverPlacementCell = undefined;
        this.hoverPlacementCellTeam = undefined;
        this.hoverSelectedCells = undefined;
        this.hoverSelectedCellsSwitchToRed = false;
        this.clearHoverSilhouette();
        if (!selected || !this.hasActiveSelection) return;
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
        if (!teamFromPlacement) {
            this.resetHover();
            return;
        }
        // If we are moving an existing unit, force it to stay on its own side
        if (this.draggingUnitTeam && teamFromPlacement !== this.draggingUnitTeam) {
            // We still want the preview footprint to match unit size (1x1 vs 2x2),
            // even though it's invalid (wrong side) -> red rectangle with correct size.
            let cells: HoCMath.XY[];
            if (isLarge) {
                const allowedForThatSide = this.allowedPlacementCellHashesPerTeam.get(teamFromPlacement) ?? undefined;
                const occupiedKeys: string[] = [];
                cells =
                    this.pathHelper.getClosestSquareCellIndices(
                        this.sc_mouseWorld,
                        allowedForThatSide,
                        occupiedKeys,
                        undefined,
                        undefined,
                        undefined,
                    ) ?? [];
                if (cells.length === 0) {
                    cells = [cell]; // fallback
                }
            } else {
                cells = [cell];
            }
            this.hoverSelectedCells = cells;
            this.hoverSelectedCellsSwitchToRed = true;
            this.hoverPlacementCell = cell;
            this.hoverPlacementCellTeam = teamFromPlacement;
            this.clearHoverSilhouette();
            return;
        }
        const allowedForTeam =
            (teamFromPlacement && this.allowedPlacementCellHashesPerTeam.get(teamFromPlacement)) ?? undefined;
        let candidateCells: HoCMath.XY[];
        if (isLarge) {
            const occupiedKeys: string[] = [];
            candidateCells =
                this.pathHelper.getClosestSquareCellIndices(
                    this.sc_mouseWorld,
                    allowedForTeam,
                    occupiedKeys,
                    undefined,
                    undefined,
                    undefined,
                ) ?? [];
        } else {
            candidateCells = [cell];
        }
        if (!allowedForTeam || allowedForTeam.size === 0) {
            this.hoverSelectedCells = candidateCells;
            this.hoverSelectedCellsSwitchToRed = true;
            this.hoverPlacementCell = cell;
            this.hoverPlacementCellTeam = teamFromPlacement;
            return;
        }
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
        // Allow reusing cells occupied by the same unit when repositioning
        if (!invalid) {
            for (const c of candidateCells) {
                const occId = this.grid.getOccupantUnitId(c);
                if (occId && this.unitsHolder.getAllUnits().has(occId)) {
                    if (!(this.draggingUnitId && occId === this.draggingUnitId)) {
                        invalid = true;
                        break;
                    }
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
            if (possiblePosition) mockUnit.setPosition(possiblePosition.x, possiblePosition.y, false);
            const lowerLeftPlacement = this.getPlacement(TeamVals.LOWER, 0);
            const upperRightPlacement = this.getPlacement(TeamVals.UPPER, 0);
            const lowerRightPlacement = this.getPlacement(TeamVals.LOWER, 1);
            const upperLeftPlacement = this.getPlacement(TeamVals.UPPER, 1);
            // Geometry rules
            if (
                !this.pathHelper.isAllowedPreStartUnitPosition(
                    mockUnit,
                    candidateCells,
                    this.unitsHolder,
                    lowerLeftPlacement,
                    upperRightPlacement,
                    lowerRightPlacement,
                    upperLeftPlacement,
                )
            ) {
                invalid = true;
            }
            // Capacity / max-army-size rules:
            // If we're placing a *new* unit (not moving an existing one)
            // and the team is already at or above its max size -> mark as invalid (red)
            if (!invalid && !this.draggingUnitId) {
                const fightProps = FightStateManager.getInstance().getFightProperties();
                if (lowerLeftPlacement && upperRightPlacement) {
                    const alliesPlacedCount = this.unitsHolder.getAllAlliesPlaced(
                        teamFromPlacement,
                        lowerLeftPlacement,
                        upperRightPlacement,
                        lowerRightPlacement,
                        upperLeftPlacement,
                    ).length;
                    const maxUnitsForTeam = fightProps.getNumberOfUnitsAvailableForPlacement(teamFromPlacement);
                    if (alliesPlacedCount >= maxUnitsForTeam) {
                        invalid = true;
                    }
                }
            }
        }
        this.hoverSelectedCellsSwitchToRed = invalid;
        this.hoverPlacementCell = cell;
        this.hoverSelectedCells = candidateCells;
        this.hoverPlacementCellTeam = teamFromPlacement;
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
    }
    private ensureUnitBadge(unit: Unit, props: UnitProperties, iconSide: number, pos: HoCMath.XY): void {
        const id = unit.getId();
        let entry = this.unitBadges.get(id);
        if (!entry) {
            const container = new Container();
            const circle = new Graphics();
            const text = new Text({
                text: "0",
                style: new TextStyle({
                    fill: 0x000000,
                    fontSize: 14,
                    fontWeight: "700",
                }),
            });
            text.anchor.set(0.5);
            // Y-flip the number so it’s upright in world coordinates
            text.scale.y = -1;
            container.addChild(circle, text);
            this.attachToWorldRoot(container, 130); // above units
            entry = { container, circle, text, iconSide };
            this.unitBadges.set(id, entry);
        } else {
            entry.iconSide = iconSide;
        }
        const amount = unit.getAmountAlive();
        entry.text.text = String(amount);
        // Badge size: based on ONE cell (same for size-1 & size-2 units)
        const br = Math.max(10, Math.floor(iconSide * 0.18));
        entry.circle.clear().circle(0, 0, br).fill({ color: 0xffffff, alpha: 1 });
        const fs = Math.max(12, Math.floor(iconSide * 0.22));
        entry.text.style = new TextStyle({
            fill: 0x000000,
            fontSize: fs,
            fontWeight: "700",
        });
        // Compute full stack bounds: 1×1 vs 2×2 cells
        const w = iconSide * (props.size === 2 ? 2 : 1);
        const h = iconSide * (props.size === 2 ? 2 : 1);
        // Small inset from the very edge
        const margin = Math.max(4, Math.floor(iconSide * 0.12));
        // Top-right in Y-up world → +X, +Y from center, minus margin
        const offsetX = w * 0.5 - margin;
        const offsetY = h * 0.5 - margin;
        entry.container.x = pos.x + offsetX;
        entry.container.y = pos.y + offsetY;
        entry.container.visible = amount > 0;
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
        this.layoutCornerMarkersWorld();
    }
    private layoutCornerMarkersWorld(): void {
        const g = this.cornerGfxWorld;
        if (!g) return;
        g.visible = true;
        g.renderable = true;
        g.alpha = 1;
        const gs = this.sc_sceneSettings.getGridSettings();
        const minX = gs.getMinX();
        const maxX = gs.getMaxX();
        const minY = gs.getMinY();
        const maxY = gs.getMaxY();
        const s = 256;
        const eps = 0.75;
        const r = 6;
        g.clear();
        const corner = (x0: number, y0: number, x1: number, y1: number) => {
            g.rect(x0, y0, x1 - x0, y1 - y0).fill({ color: 0xff0000, alpha: 1 });
            const cx = (x0 + x1) * 0.5;
            const cy = (y0 + y1) * 0.5;
            g.circle(cx, cy, r).fill({ color: 0x000000, alpha: 1 });
            g.circle(cx, cy, r * 0.5).fill({ color: 0xffffff, alpha: 1 });
        };
        corner(minX + eps, minY + eps, minX + s - eps, minY + s - eps);
        corner(maxX - s + eps, minY + eps, maxX - eps, minY + s - eps);
        corner(minX + eps, maxY - s + eps, minX + s - eps, maxY - eps);
        corner(maxX - s + eps, maxY - eps, maxX - eps, maxY - s + eps);
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
    private clearBoardSelection(_notifyUnitDeselected: boolean = true): void {
        this.hasActiveSelection = false;
        this.selectionFromOverlay = false;
        this.draggingUnitId = undefined;
        this.draggingUnitTeam = undefined;
        this.sc_selectedUnitProperties = undefined;
        this.hoverPlacementCell = undefined;
        this.hoverPlacementCellTeam = undefined;
        this.hoverSelectedCells = undefined;
        this.hoverSelectedCellsSwitchToRed = false;
        this.hoveredUnitHighlight = undefined;
        // reset UnitChip-style hover tween state
        this.boardHoverProps = undefined;
        this.boardHoverCenter = undefined;
        this.boardHoverTargetScale = 1;
        this.boardHoverTargetYOffset = 0;
        // cancel delayed hover re-arm
        // this.lastPlacementUnitId = undefined;
        // this.lastPlacementTimestampSec = 0;
        this.clearHoverSilhouette();
    }
    private tryPlaceUnit(): void {
        console.log("tryPlaceUnit called");
        const selected = this.sc_selectedUnitProperties;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (!this.hasActiveSelection || !selected) {
            console.log("No active selection");
            return;
        }
        if (fightProps.hasFightStarted()) {
            console.log("Fight already started, no placement");
            return;
        }
        if (!this.hoverSelectedCells || this.hoverSelectedCells.length === 0 || this.hoverSelectedCellsSwitchToRed) {
            console.log("No valid hoverSelectedCells or hover is red, abort placement");
            // board selection: clicking elsewhere cancels
            if (!this.selectionFromOverlay) {
                this.clearBoardSelection();
            }
            return;
        }
        const teamType = this.hoverPlacementCellTeam;
        if (!teamType) {
            console.log("No hoverPlacementCellTeam, abort placement");
            if (!this.selectionFromOverlay) {
                this.clearBoardSelection();
            }
            return;
        }
        const gs = this.sc_sceneSettings.getGridSettings();
        const cellsToOccupy = this.hoverSelectedCells;
        for (const c of cellsToOccupy) {
            const h = (c.x << 4) | c.y;
            if (!this.allowedPlacementCellHashes.has(h)) {
                console.log("Cell not in allowed placement hashes", c);
                if (!this.selectionFromOverlay) this.clearBoardSelection();
                return;
            }
        }
        // For repositioning, we allow replacing own cells, so don't early abort here.
        if (!this.draggingUnitId && !this.grid.areAllCellsEmpty(cellsToOccupy)) {
            console.log("Some cells already occupied, abort (new placement)");
            return;
        }
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
        const placePos = GridMath.getPositionForCells(gs, cellsToOccupy);
        if (!placePos) {
            console.log("Failed to compute position for cells");
            if (!this.selectionFromOverlay) this.clearBoardSelection();
            return;
        }
        // Decide whether this is a move (existing unit) or a new unit
        let unit: Unit | undefined;
        if (this.draggingUnitId) {
            unit = this.unitsHolder.getAllUnits().get(this.draggingUnitId);
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
        // If we are repositioning, clear previous occupancy for this unit
        if (this.draggingUnitId) {
            // assuming cleanupAll exists in your Grid implementation
            this.grid.cleanupAll(unit.getId(), unit.getAttackRange(), unit.isSmallSize());
        }
        const hasMadeOfFire = unit.hasAbilityActive("Made of Fire");
        const hasMadeOfWater = unit.hasAbilityActive("Made of Water");
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
            if (!this.selectionFromOverlay) this.clearBoardSelection();
            return;
        }
        unit.setPosition(placePos.x, placePos.y);
        const ensured = this.ensureUnitSprite(unit, selected);
        if (!ensured) {
            console.log("Failed to ensure unit sprite");
            if (!this.selectionFromOverlay) this.clearBoardSelection();
            return;
        }
        const { sprite, scale } = ensured;
        this.startSpawnAnimation(sprite, scale);
        this.unitsHolder.refreshStackPowerForAllUnits();
        console.log(
            `Placed ${selected.name} (size=${selected.size}) at (${placePos.x}, ${placePos.y}) for team ${teamType}`,
        );
        // Success → clear selection / hover
        if (this.selectionFromOverlay) {
            this.sc_selectedUnitProperties = undefined;
            this.hoverSelectedCells = undefined;
            this.hoverSelectedCellsSwitchToRed = false;
            this.clearHoverSilhouette();
            if (this.unitsOverlay) this.unitsOverlay.clearSelection(true);
            this.hasActiveSelection = false;
            this.selectionFromOverlay = false;
        } else {
            // Board move: clear selection + notify UI (same as overlay Deselect)
            this.clearBoardSelection();
            this.Deselect(false, true);
        }
        if (!fightProps.hasFightStarted()) {
            this.lastPlacementUnitId = unit.getId();
            this.lastPlacementTimestampSec = HoCLib.getTimeMillis() / 1000;
        } else {
            this.lastPlacementUnitId = undefined;
        }
    }
    protected destroyTempFixtures(): void {}
    public override MouseDown(p: HoCMath.XY): void {
        this.sc_mouseWorld = p;
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (!fightProps.hasFightStarted()) {
            // CASE 1: we already have an active selection (overlay or board) → attempt to place/move
            if (this.hasActiveSelection && this.sc_selectedUnitProperties) {
                this.updateHoverPlacementCell(p);
                // For board selection, clicking invalid area should deselect instead of trying to place
                if (
                    !this.hoverSelectedCells ||
                    this.hoverSelectedCells.length === 0 ||
                    this.hoverSelectedCellsSwitchToRed
                ) {
                    if (!this.selectionFromOverlay) {
                        // Clicked elsewhere while moving from board → deselect
                        this.clearBoardSelection();
                        this.Deselect(false, true);
                        return;
                    }
                    return; // overlay selection keeps selection
                }
                this.tryPlaceUnit();
                return;
            }
            // CASE 2: no active selection yet → maybe click on existing unit to start move
            const unit = this.getUnitAtPosition(p);
            if (unit) {
                const props = unit.getUnitProperties();
                this.lastPlacementUnitId = undefined;
                this.lastPlacementTimestampSec = 0;
                this.hasActiveSelection = true;
                this.selectionFromOverlay = false;
                this.draggingUnitId = unit.getId();
                this.draggingUnitTeam = unit.getTeam();
                this.sc_selectedUnitProperties = props;
                // 🔔 fire UnitSelected-style event so the rest of the UI updates
                this.setSelectedUnitProperties(props);
                // clear passive hover, now this is an active selection
                this.boardHoverProps = undefined;
                this.boardHoverCenter = undefined;
                this.boardHoverTargetScale = 1;
                this.boardHoverTargetYOffset = 0;
                // show preview at current mouse/cell
                this.updateHoverPlacementCell(p);
                return;
            }
        }
        super.MouseDown(p);
    }
    private getHighlightRectForUnit(unit: Unit): { x: number; y: number; w: number; h: number } | undefined {
        const props = unit.getUnitProperties();
        const gs = this.sc_sceneSettings.getGridSettings();
        const size = gs.getCellSize();
        const pos = unit.getPosition();
        let w = size;
        let h = size;
        if (props.size === 2) {
            w = size * 2;
            h = size * 2;
        }
        return {
            x: pos.x - w / 2 + 1,
            y: pos.y - h / 2 + 1,
            w: w - 2,
            h: h - 2,
        };
    }
    protected override hover(): void {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.hasFightStarted()) return;
        // --- CASE 1: active selection from OVERLAY ---
        if (this.hasActiveSelection && this.sc_selectedUnitProperties && this.selectionFromOverlay) {
            this.hoveredUnitHighlight = undefined;
            this.updateHoverPlacementCell(this.sc_mouseWorld);
            return;
        }
        // --- CASE 2: active selection from BOARD (move existing unit) ---
        if (
            this.hasActiveSelection &&
            this.sc_selectedUnitProperties &&
            !this.selectionFromOverlay &&
            this.draggingUnitId
        ) {
            const selectedUnit = this.unitsHolder.getAllUnits().get(this.draggingUnitId);
            if (selectedUnit) {
                // Keep light on the selected stack (UnitChip-style "selected" glow)
                this.hoveredUnitHighlight = this.getHighlightRectForUnit(selectedUnit);
            } else {
                this.hoveredUnitHighlight = undefined;
            }
            // Also keep showing placement preview as mouse moves
            this.updateHoverPlacementCell(this.sc_mouseWorld);
            return;
        }
        // --- CASE 3: no active selection → pure hover over already placed units ---
        const p = this.sc_mouseWorld;
        const nowSec = HoCLib.getTimeMillis() / 1000;
        const unit = this.getUnitAtPosition(p);
        if (!unit) {
            this.hoveredUnitHighlight = undefined;
            this.clearHoverSilhouette(); // just in case
            return;
        }
        const lastPlacementActive =
            this.lastPlacementUnitId && nowSec - this.lastPlacementTimestampSec < this.hoverRearmDelaySec;
        if (lastPlacementActive && unit.getId() === this.lastPlacementUnitId) {
            this.hoveredUnitHighlight = undefined;
            this.clearHoverSilhouette();
            return;
        }
        this.hoveredUnitHighlight = this.getHighlightRectForUnit(unit);
    }
    public override MouseMove(p: HoCMath.XY, leftDrag: boolean): void {
        super.MouseMove(p, leftDrag);
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.hasFightStarted()) {
            this.hoverPlacementCell = undefined;
            this.hoverPlacementCellTeam = undefined;
        }
    }
    public override Deselect(_onlyWhenNotStarted = false, _refreshStats = true): void {
        // First let the base class clear its own selection state
        super.Deselect(_onlyWhenNotStarted, _refreshStats);
        // Then clear Sandbox-specific selection / hover state
        // No active selection anymore (overlay or board)
        this.hasActiveSelection = false;
        this.selectionFromOverlay = false;
        this.draggingUnitId = undefined;
        this.draggingUnitTeam = undefined;
        // Clear placement hover (red/white rectangle)
        this.hoverPlacementCell = undefined;
        this.hoverPlacementCellTeam = undefined;
        this.hoverSelectedCells = undefined;
        this.hoverSelectedCellsSwitchToRed = false;
        // Clear passive board-hover highlight
        this.hoveredUnitHighlight = undefined;
        // Reset UnitChip-style hover tween state
        this.boardHoverProps = undefined;
        this.boardHoverCenter = undefined;
        this.boardHoverScale = 1;
        this.boardHoverTargetScale = 1;
        this.boardHoverYOffset = 0;
        this.boardHoverTargetYOffset = 0;
        // Cancel delayed hover re-arm (ESC should fully reset)
        // this.lastPlacementUnitId = undefined;
        // this.lastPlacementTimestampSec = 0;
        // Also clear silhouettes / flags used by hover previews
        this.resetHover(false); // clears silhouette + internal flags, but we already nulled selected cells above
    }
    public override Step(_settings: Settings, timeStep: number): void {
        if (timeStep > 0) this.sc_stepCount.increment();
        this.sc_isAnimating = this.pixiSceneManager.isAnimating();
        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.hasFightStarted()) {
            this.clearHoverSilhouette();
            this.lastPlacementUnitId = undefined;
        }
        this.ensureBackgroundSprite();
        this.layoutBackgroundSquare();
        this.ensurePlacementGraphicsWorld();
        this.attachToWorldRoot(this.placementGraphics, 100);
        this.spawnPulsePhase += timeStep * 3.7;
        setSpawnFlowPhase(this.spawnPulsePhase);
        // Update hover glow phase for shimmer (slow gentle cycle, ~2-3 seconds per loop)
        this.hoverGlowPhase += timeStep * ((Math.PI * 2) / 2.5); // radians per second for sine
        if (this.hoverGlowPhase > Math.PI * 2) this.hoverGlowPhase -= Math.PI * 2;
        // 🔁 maybe re-arm hover on the last placed unit
        this.updatePlacementHoverRearm();
        if (this.placementGraphics) {
            this.drawPlacements();
        }
        this.syncUnitSprites();
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
            this.drawHoverPlacementCell(g);
            // passive board-hover highlight (no active selection)
            if (this.hoveredUnitHighlight) {
                this.drawHoveredUnitHighlight(g);
            }
        }
    }
}
registerScene("Heroes", "Sandbox", Sandbox);
