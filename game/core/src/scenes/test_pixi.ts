import { Sprite } from "pixi.js";
import {
    Augment,
    FactionType,
    FightStateManager,
    GridConstants,
    GridSettings,
    GridType,
    HoCLib,
    TeamType,
    HoCMath,
    UnitProperties,
} from "@heroesofcrypto/common";

import { Settings } from "../settings";
import { VisibleButtonState, IVisibleButton } from "../state/visible_state";
import { SceneSettings } from "../scenes/scene_settings";
import { PixiScene, PixiSceneContext, registerScene } from "../pixi/PixiScene";

// Simple alias to keep signatures tidy
interface XY {
    x: number;
    y: number;
}

export class Sandbox extends PixiScene {
    /** Keep grid type locally (we don't mutate a Grid instance in this minimal scene) */
    private gridType: GridType;

    // ui/buttons (kept minimal but present so UI doesn’t crash if referenced)
    private hourglassButton: IVisibleButton;
    private shieldButton: IVisibleButton;
    private nextButton: IVisibleButton;
    private aiButton: IVisibleButton;
    private selectedAttackTypeButton: IVisibleButton;
    private spellBookButton: IVisibleButton;

    private bgSprite?: Sprite;
    private bgKey: "background_dark" | "background_light" = "background_dark";

    public constructor(context: PixiSceneContext) {
        // Build grid settings FIRST so we can pass a valid SceneSettings to super()
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

        // Required Pixi linkage
        this.initialize(context);

        // Start with the fight’s current grid type
        this.gridType = FightStateManager.getInstance().getFightProperties().getGridType();
        this.pixiSceneManager.setGridType(this.gridType);
        this.sc_gridTypeUpdateNeeded = true;

        // ---- Minimal buttons ----
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

        // Visible state updater — lightweight & safe
        const visibleStateUpdate = () => {
            if (!this.sc_visibleState) return;
            const fightProps = FightStateManager.getInstance().getFightProperties();
            this.sc_visibleState.secondsMax =
                (fightProps.getCurrentTurnEnd() - fightProps.getCurrentTurnStart()) / 1000;
            const remaining = (fightProps.getCurrentTurnEnd() - HoCLib.getTimeMillis()) / 1000;
            this.sc_visibleState.secondsRemaining = remaining > 0 ? remaining : 0;
            this.sc_visibleStateUpdateNeeded = true;
        };
        HoCLib.interval(visibleStateUpdate, 500);
    }

    /** Create background sprite once and add to the terrain/back layer */
    private ensureBackgroundSprite(): void {
        if (this.bgSprite) return;

        const tex =
            this.texAny(this.bgKey) ??
            this.texAny(this.bgKey === "background_dark" ? "background_light" : "background_dark");
        if (!tex) return;

        const bg = new Sprite(tex);
        bg.anchor.set(0.5); // center-based positioning

        // Add behind the camera, so it sits at the very back and isn’t scaled by camera
        const stage = this.pixiSceneManager.getApplication().stage;
        stage.addChildAt(bg, 0);

        this.bgSprite = bg;
        this.layoutBackgroundSquare();
    }

    private layoutBackgroundSquare(): void {
        if (!this.bgSprite) return;

        const { width: vw, height: vh } = this.pixiSceneManager.getViewportSize();

        // square that fits inside the viewport
        const size = Math.min(vw, vh);

        this.bgSprite.x = vw * 0.5;
        this.bgSprite.y = vh * 0.5;
        this.bgSprite.width = size;
        this.bgSprite.height = size;

        // theme toggle (optional)
        const isLightMode = typeof localStorage !== "undefined" && localStorage.getItem("joy-mode") === "light";
        const wantKey = isLightMode ? "background_light" : "background_dark";
        const wantTex = this.texAny(wantKey);
        if (wantTex && this.bgKey !== wantKey) {
            this.bgKey = wantKey;
            this.bgSprite.texture = wantTex;
        }
    }

    public override Resize(_width: number, _height: number): void {
        this.layoutBackgroundSquare(); // ✅ refit on window resize
    }

    // ===================== Required abstract implementations (minimal) =====================

    protected verifyButtonsTrigger(): void {
        /* no-op for minimal */
    }

    public propagateAugmentation(_teamType: TeamType, _augmentType: Augment.AugmentType): boolean {
        return false;
    }

    public propagateSynergy(
        _teamType: TeamType,
        _faction: FactionType,
        _synergyName: string,
        _synergyLevel: number,
    ): boolean {
        return false;
    }

    public getNumberOfUnitsAvailableForPlacement(_teamType: TeamType): number {
        return 0;
    }

    public propagateButtonClicked(_buttonName: string, _buttonState: VisibleButtonState): void {
        /* no-op */
    }

    protected landAttack(): boolean {
        return false;
    }

    protected finishDrop(_positionToDropTo: XY): void {
        /* no-op */
    }

    protected handleMouseDownForSelectedBody(): void {
        /* no-op */
    }

    public cloneObject(_newAmount?: number): boolean {
        return false;
    }

    public deleteObject(): void {
        /* no-op */
    }

    public refreshScene(_unitData: UnitProperties): void {
        /* no-op */
    }

    public setGridType(gridType: GridType): void {
        this.gridType = gridType;
        this.pixiSceneManager.setGridType(gridType);
        this.sc_gridTypeUpdateNeeded = true;
    }

    public getGridType(): GridType {
        return this.gridType;
    }

    public requestTime(_team: number): void {
        /* no-op */
    }

    protected destroyTempFixtures(): void {
        /* no-op */
    }

    // ===================== Input hooks (minimal) =====================

    public override MouseDown(_p: XY): void {
        if (this.sc_isAnimating) return;
        this.verifyButtonsTrigger();
    }

    public override MouseMove(_p: XY, _leftDrag: boolean): void {
        // minimal hover — intentionally empty
    }

    // ===================== Per-frame =====================

    public override Step(_settings: Settings, timeStep: number): void {
        console.log("ssssss3");

        if (timeStep > 0) this.sc_stepCount.increment();
        this.sc_isAnimating = this.pixiSceneManager.isAnimating();

        this.ensureBackgroundSprite();
        this.layoutBackgroundSquare();
    }

    protected selectUnitPreStart(
        _teamType: TeamType,
        _isSmallUnit: boolean,
        position: HoCMath.XY,
        rangeShotDistance = 0,
        _auraRanges: number[] = [],
        _auraIsBuff: boolean[] = [],
    ): void {
        // Minimal: if a range is passed, expose it via the scene’s shot-range field so drawers can use it.
        this.sc_currentActiveShotRange =
            rangeShotDistance > 0 ? { xy: position, distance: rangeShotDistance * GridConstants.STEP } : undefined;

        // Minimal aura reset (keep it empty for now)
        this.sc_currentActiveAuraRanges = [];
    }
}

registerScene("Heroes", "Sandbox", Sandbox);
