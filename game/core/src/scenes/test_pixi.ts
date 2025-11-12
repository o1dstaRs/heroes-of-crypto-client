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
} from "@heroesofcrypto/common";

import { Settings } from "../settings";
import { UnitsOverlay } from "./UnitsOverlay";
import { VisibleButtonState, IVisibleButton } from "../state/visible_state";
import { SceneSettings } from "../scenes/scene_settings";
import { PixiScene, PixiSceneContext, registerScene } from "../pixi/PixiScene";
import { DrawableRectanglePlacement, DrawableSquarePlacement, IDrawablePlacement } from "../pixi/PixiDrawablePlacement";

export class Sandbox extends PixiScene {
    private gridType: GridType;
    private hourglassButton: IVisibleButton;
    private shieldButton: IVisibleButton;
    private nextButton: IVisibleButton;
    private aiButton: IVisibleButton;
    private selectedAttackTypeButton: IVisibleButton;
    private spellBookButton: IVisibleButton;
    private unitsOverlay: UnitsOverlay;
    private bgSprite?: Sprite;
    private bgKey: "background_dark" | "background_light" = "background_dark";
    private cornerGfxWorld?: Graphics;
    private placementGraphics?: Graphics;
    private readonly allowedPlacementCellHashes: Set<number>;
    private readonly allowedPlacementCellHashesPerTeam: Map<TeamType, Set<number>>;
    private placementsDirty = true;
    private upperPlacements: [IDrawablePlacement?, IDrawablePlacement?];
    private lowerPlacements: [IDrawablePlacement?, IDrawablePlacement?];
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

        this.initialize(context);

        this.gridType = FightStateManager.getInstance().getFightProperties().getGridType();
        this.pixiSceneManager.setGridType(this.gridType);
        this.sc_gridTypeUpdateNeeded = true;

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

        this.unitsOverlay = new UnitsOverlay(this.pixiSceneManager.getApplication(), (name: string) =>
            this.texAny(name),
        );
        this.unitsOverlay.build();

        this.initializePlacements();
        this.placementsDirty = true;
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

        // Ensure placements redraw once (verts recompute against new transforms).
        this.placementsDirty = true;
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

        this.placementsDirty = true;
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
        this.placementsDirty = true;
    }
    public getGridType(): GridType {
        return this.gridType;
    }
    public requestTime(_team: number): void {}
    protected destroyTempFixtures(): void {}
    public override MouseDown(_p: HoCMath.XY): void {
        if (this.sc_isAnimating) return;
        this.verifyButtonsTrigger();
    }
    public override MouseMove(_p: HoCMath.XY, _leftDrag: boolean): void {}
    public override Step(_settings: Settings, timeStep: number): void {
        if (timeStep > 0) this.sc_stepCount.increment();
        this.sc_isAnimating = this.pixiSceneManager.isAnimating();

        this.ensureBackgroundSprite();
        this.layoutBackgroundSquare();

        this.ensureCornerMarkersWorld();
        this.ensurePlacementGraphicsWorld();

        // <- reattach every frame in case camera swapped the world container
        this.attachToWorldRoot(this.cornerGfxWorld, 90);
        this.attachToWorldRoot(this.placementGraphics, 100);

        if (this.placementsDirty) {
            this.drawPlacements();
            this.placementsDirty = false;
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

        this.placementsDirty = true;
    }
    private drawPlacements(): void {
        if (!this.placementGraphics) return;
        const g = this.placementGraphics;
        g.clear();

        const props = FightStateManager.getInstance().getFightProperties();
        if (!props.hasFightStarted()) {
            let team: TeamType | undefined = undefined; // swap if needed
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
        }
    }
}

registerScene("Heroes", "Sandbox", Sandbox);
