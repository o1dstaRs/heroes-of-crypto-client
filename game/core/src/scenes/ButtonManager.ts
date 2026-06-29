// game/core/src/scenes/ButtonManager.ts
import {
    FightStateManager,
    ISceneLog,
    AttackType,
    HoCMath,
    TeamVals,
    AttackVals,
    Unit,
    GridMath,
    GridSettings,
    SpellHelper,
} from "@heroesofcrypto/common";
import type { GameAction } from "@heroesofcrypto/common";
import { PixiRenderableSpell } from "./RenderableSpell";
import { VisibleButtonState, IVisibleButton, IVisibleState } from "./VisibleState";

export interface ISandboxButtonContext {
    getCurrentActiveUnit(): Unit | undefined;
    getSceneLog(): ISceneLog;
    getGridSettings(): GridSettings;

    // Actions
    applyGameAction(action: GameAction): boolean;
    refreshUnits(): void;
    updateCurrentMovePath(cell: HoCMath.XY): void;

    // State Setters (The Fix: Allow Manager to update Sandbox state)
    setUnitPropertiesUpdateNeeded(needed: boolean): void;
    setCurrentEnemiesCellsWithinMovementRange(cells: HoCMath.XY[] | undefined): void;
    setSelectedAttackType(type: AttackType): void;
    setCurrentActiveSpell(spell: PixiRenderableSpell | undefined): void;
    /** The currently armed spell (single-target spells wait for a target click). */
    getCurrentActiveSpell(): PixiRenderableSpell | undefined;

    // 👇 NEW: Push UI state back to Sandbox
    setVisibleButtons(buttons: IVisibleButton[], updated: boolean): void;
    setAIActive(active: boolean): void;
    setSpellBookOverlay(active: boolean): void;
    isInputLockedByAI(): boolean;
    /**
     * Whether the local player may act on the current active unit. Sandbox controls both teams, so
     * this is always true there. Ranked overrides it: on the opponent's turn the active unit is theirs,
     * so all action buttons (incl. the purely-local spellbook overlay) must be disabled.
     */
    canControlCurrentActiveUnit(): boolean;

    getVisibleState(): IVisibleState | undefined;
}

export class ButtonManager {
    private context: ISandboxButtonContext;
    private hourglassButton: IVisibleButton;
    private shieldButton: IVisibleButton;
    private nextButton: IVisibleButton;
    private aiButton: IVisibleButton;
    private selectedAttackTypeButton: IVisibleButton;
    private spellBookButton: IVisibleButton;
    public sc_isAIActive = false;
    public sc_renderSpellBookOverlay = false;
    private buttonsRefreshLocked = false;
    private lastVisibleButtonGroup: IVisibleButton[] = [];
    public constructor(context: ISandboxButtonContext, isAIActive: boolean) {
        this.context = context;
        this.sc_isAIActive = isAIActive;
        this.hourglassButton = this.createBaseButton("Hourglass", "Wait");
        this.shieldButton = this.createBaseButton("LuckShield", "Cleanup randomized luck and skip turn");
        this.nextButton = this.createBaseButton("Next", "Skip turn");
        this.aiButton = this.createBaseButton("AI", "Switch AI state");
        this.selectedAttackTypeButton = this.createBaseButton("AttackType", "Switch attack type");
        this.spellBookButton = this.createBaseButton("Spellbook", "Select spell");
        this.recomputeButtons(true);
    }
    private createBaseButton(name: string, text: string): IVisibleButton {
        return {
            name,
            text,
            state: VisibleButtonState.FIRST,
            isVisible: true,
            isDisabled: true,
            numberOfOptions: 1,
            selectedOption: 1,
        };
    }
    public refreshButtons(forceUpdate = false): void {
        this.recomputeButtons(forceUpdate);
    }
    private checkHourglassCondition(): boolean {
        const currentActiveUnit = this.context.getCurrentActiveUnit();
        if (!currentActiveUnit) {
            return false;
        }

        const fightState = FightStateManager.getInstance().getFightProperties();

        // Must have fight started to use hourglass
        if (!fightState.hasFightStarted()) {
            return false;
        }

        const lowerTeamUnitsAlive = fightState.getTeamUnitsAlive(TeamVals.LOWER);
        const upperTeamUnitsAlive = fightState.getTeamUnitsAlive(TeamVals.UPPER);
        const unitTeam = currentActiveUnit.getTeam();

        const moreThanOneUnitAlive =
            (unitTeam === TeamVals.LOWER && lowerTeamUnitsAlive > 1) ||
            (unitTeam === TeamVals.UPPER && upperTeamUnitsAlive > 1);

        const unitId = currentActiveUnit.getId();
        const inHourglassQueue = fightState.hourglassIncludes(unitId);
        const hasAlreadyMadeTurn = fightState.hasAlreadyMadeTurn(unitId);
        const hasAlreadyHourglass = fightState.hasAlreadyHourglass(unitId);

        if (moreThanOneUnitAlive && !inHourglassQueue && !hasAlreadyMadeTurn && !hasAlreadyHourglass) {
            return true;
        }
        return false;
    }
    private checkCastCondition(): boolean {
        const currentActiveUnit = this.context.getCurrentActiveUnit();
        if (!currentActiveUnit) return false;
        return currentActiveUnit && currentActiveUnit.getSpellsCount() > 0 && currentActiveUnit.getCanCastSpells();
    }
    private recomputeButtons(forceUpdate = false): void {
        const prevButtonsJSON = JSON.stringify(this.lastVisibleButtonGroup);
        const fightProps = FightStateManager.getInstance().getFightProperties();
        const fightStarted = fightProps.hasFightStarted();
        const visibleState = this.context.getVisibleState();
        const fightFinished = visibleState?.hasFinished ?? false;
        const buttons: IVisibleButton[] = [];
        const pushAll = (
            hourglass: IVisibleButton,
            shield: IVisibleButton,
            next: IVisibleButton,
            ai: IVisibleButton,
            attackType: IVisibleButton,
            spellBook: IVisibleButton,
        ) => {
            buttons.push(hourglass, shield, next, ai, attackType, spellBook);
            // Update local references
            this.hourglassButton = hourglass;
            this.shieldButton = shield;
            this.nextButton = next;
            this.aiButton = ai;
            this.selectedAttackTypeButton = attackType;
            this.spellBookButton = spellBook;
        };

        // 1. Base Button Definitions
        const baseHourglass: IVisibleButton = { ...this.hourglassButton, isDisabled: false };
        const baseShield: IVisibleButton = { ...this.shieldButton, isDisabled: false };
        const baseNext: IVisibleButton = { ...this.nextButton, isDisabled: false };
        const baseAI: IVisibleButton = {
            ...this.aiButton,
            isDisabled: false,
            state: this.sc_isAIActive ? VisibleButtonState.SECOND : VisibleButtonState.FIRST,
        };
        const baseAttackType: IVisibleButton = { ...this.selectedAttackTypeButton, isDisabled: true };
        const baseSpellBook: IVisibleButton = {
            ...this.spellBookButton,
            isDisabled: true,
            customSpriteName: undefined,
        };

        // 2. Locked/Finished State
        if (this.buttonsRefreshLocked || fightFinished) {
            const disabled = (b: IVisibleButton): IVisibleButton => ({ ...b, isDisabled: true });
            pushAll(
                disabled(baseHourglass),
                disabled(baseShield),
                disabled(baseNext),
                disabled(baseAI),
                disabled(baseAttackType),
                disabled(baseSpellBook),
            );

            this.lastVisibleButtonGroup = buttons;
            // 👇 Fix: Push to Context
            this.context.setVisibleButtons(buttons, forceUpdate || prevButtonsJSON !== JSON.stringify(buttons));
            return;
        }

        const currentActiveUnit = this.context.getCurrentActiveUnit();
        const inputLockedByAI = this.context.isInputLockedByAI();
        const hasActiveUnit = !!currentActiveUnit;

        // 3. AI Button specific check
        if (!currentActiveUnit?.hasAbilityActive("AI Driven")) {
            baseAI.isDisabled = false;
        }

        // 4. Determine specific button states
        let hourglassButton = { ...baseHourglass };
        let shieldButton = { ...baseShield };
        let nextButton = { ...baseNext };
        let aiButton = { ...baseAI };
        let attackTypeButton = { ...baseAttackType };
        let spellBookButton = { ...baseSpellBook };

        // Ranked: on the opponent's turn the active unit is theirs — the local player must not be able
        // to wait/end-turn/switch attack type or (the reported bug) open their spellbook. Sandbox always
        // returns true here, so its behavior is unchanged.
        const canControlActive = this.context.canControlCurrentActiveUnit();
        if (!canControlActive && this.sc_renderSpellBookOverlay) {
            // Control was lost while the book was open (e.g. the turn timer handed off mid-overlay) —
            // close it so it doesn't linger over the opponent's turn.
            this.sc_renderSpellBookOverlay = false;
            this.context.setSpellBookOverlay(false);
        }

        if (this.sc_isAIActive || inputLockedByAI || !canControlActive) {
            hourglassButton.isDisabled = true;
            shieldButton.isDisabled = true;
            nextButton.isDisabled = true;
            attackTypeButton.isDisabled = true;
            spellBookButton.isDisabled = true;
        } else if (this.sc_renderSpellBookOverlay) {
            hourglassButton.isDisabled = true;
            shieldButton.isDisabled = true;
            nextButton.isDisabled = true;
            attackTypeButton.isDisabled = true;
            spellBookButton.isDisabled = false;
        } else {
            shieldButton.isDisabled = !(fightStarted && hasActiveUnit);
            nextButton.isDisabled = !(fightStarted && hasActiveUnit);
            attackTypeButton.isDisabled = !(fightStarted && hasActiveUnit);

            hourglassButton.isDisabled = !this.checkHourglassCondition();
            spellBookButton.isDisabled = !this.checkCastCondition();

            if (hasActiveUnit) {
                const active = currentActiveUnit!;
                const [idx, options] = active.getAttackTypeSelectionIndex();
                const currentIdx = idx + 1;

                if (currentIdx <= 0 || options <= 1) {
                    // Only one usable attack type (e.g. an Archer in a Range Null Field falls back
                    // to melee). The button is disabled, but its icon must still match the actually
                    // selected type — otherwise it keeps the stale previous icon (e.g. bow).
                    let singleState = VisibleButtonState.FIRST;
                    switch (active.getAttackTypeSelection()) {
                        case AttackVals.RANGE:
                            singleState = VisibleButtonState.SECOND;
                            break;
                        case AttackVals.MAGIC:
                            singleState = VisibleButtonState.THIRD;
                            break;
                        default:
                            singleState = VisibleButtonState.FIRST;
                            break;
                    }
                    attackTypeButton = {
                        ...attackTypeButton,
                        isDisabled: true,
                        state: singleState,
                        numberOfOptions: 1,
                        selectedOption: 1,
                    };
                } else {
                    let state = VisibleButtonState.FIRST;

                    switch (active.getAttackTypeSelection()) {
                        case AttackVals.RANGE:
                            state = VisibleButtonState.SECOND;
                            break;
                        case AttackVals.MAGIC:
                            state = VisibleButtonState.THIRD;
                            break;
                        default:
                            state = VisibleButtonState.FIRST;
                            // Side effect: recalc path if switching back to melee
                            const currentCell = GridMath.getCellForPosition(
                                this.context.getGridSettings(),
                                active.getPosition(),
                            );
                            if (currentCell) {
                                this.context.updateCurrentMovePath(currentCell);
                            }
                            break;
                    }

                    attackTypeButton = {
                        ...attackTypeButton,
                        isDisabled: !fightStarted,
                        state,
                        numberOfOptions: options,
                        selectedOption: currentIdx,
                    };
                }
            }
        }

        // Show the armed spell's icon on the spellbook button (parity with legacy adjustSpellBookSprite).
        // Only clear the armed spell on an EXPLICIT attack-type change (see "AttackType" case), not on
        // every recompute — otherwise arming a spell while the unit is still on MELEE disarms it instantly.
        const armedSpell = this.context.getCurrentActiveSpell();
        if (armedSpell) {
            spellBookButton.customSpriteName = SpellHelper.spellToTextureNames(armedSpell.getName())[0];
        }

        pushAll(hourglassButton, shieldButton, nextButton, aiButton, attackTypeButton, spellBookButton);

        this.lastVisibleButtonGroup = buttons;
        // 👇 Fix: Push to Context
        this.context.setVisibleButtons(buttons, forceUpdate || prevButtonsJSON !== JSON.stringify(buttons));
    }
    public propagateButtonClicked(name: string, _state: VisibleButtonState): void {
        const currentActiveUnit = this.context.getCurrentActiveUnit();
        // The AI toggle itself must stay clickable while AI-driven input locks the board — otherwise
        // enabling AI locks the player out of ever turning it back off (the lock is true *because*
        // the toggle is on). Every other button stays blocked. Switching mid-turn for an "AI Driven"
        // ability unit is still blocked by the guard below.
        if (name !== "AI" && this.context.isInputLockedByAI()) {
            return;
        }
        // An AI-Driven unit is AI-controlled for its whole turn — the player can't interact with any
        // button, including the AI toggle (it's restored to their prior choice when the turn ends).
        if (currentActiveUnit?.hasAbilityActive("AI Driven")) {
            return;
        }
        if (!currentActiveUnit && name !== "AI") {
            // No active unit: only the AI toggle is meaningful.
            return;
        }
        // Ranked: it's not the local player's turn (active unit is the opponent's). Block every
        // unit-action button — including the spellbook, which is otherwise a purely-local overlay
        // toggle the server never gets a chance to reject. The AI toggle stays available.
        if (name !== "AI" && !this.context.canControlCurrentActiveUnit()) {
            return;
        }

        const fightProps = FightStateManager.getInstance().getFightProperties();
        if (fightProps.hasFightFinished()) return;

        const active = currentActiveUnit;

        switch (name) {
            case "Next": {
                if (!active || !fightProps.hasFightStarted()) return;
                // Pressing Next ends the turn WITHOUT acting — a voluntary skip, so it drops morale
                // (reason "skip"), matching the legacy. A move/attack finishes the turn via its own
                // path with reason "manual", which is not penalized.
                if (this.context.applyGameAction({ type: "end_turn", unitId: active.getId(), reason: "skip" })) {
                    this.refreshButtons(true);
                }
                return;
            }
            case "Hourglass": {
                if (!active || !fightProps.hasFightStarted()) return;
                // Added missing condition check
                if (!this.checkHourglassCondition()) return;

                if (this.context.applyGameAction({ type: "wait_turn", unitId: active.getId() })) {
                    this.refreshButtons(true);
                }
                return;
            }
            case "AI": {
                this.sc_isAIActive = !this.sc_isAIActive;
                // 👇 Fix: Push AI state
                this.context.setAIActive(this.sc_isAIActive);
                this.context.getSceneLog().updateLog(`AI ${this.sc_isAIActive ? "enabled" : "disabled"} by player`);
                this.refreshButtons(true);
                return;
            }
            case "Spellbook": {
                this.sc_renderSpellBookOverlay = !this.sc_renderSpellBookOverlay;
                // 👇 Fix: Push Spellbook state
                this.context.setSpellBookOverlay(this.sc_renderSpellBookOverlay);
                this.context
                    .getSceneLog()
                    .updateLog(this.sc_renderSpellBookOverlay ? "Spellbook opened" : "Spellbook closed");
                this.refreshButtons(true);
                return;
            }
            case "LuckShield": {
                if (!active || !fightProps.hasFightStarted()) return;
                if (this.context.applyGameAction({ type: "defend_turn", unitId: active.getId() })) {
                    this.refreshButtons(true);
                }
                return;
            }
            case "AttackType": {
                if (!active || !fightProps.hasFightStarted()) return;
                const possibleAttackTypes = active.getPossibleAttackTypes();
                if (!possibleAttackTypes.length) return;
                const currentAttackType = active.getAttackTypeSelection();
                const currentIndex = possibleAttackTypes.indexOf(currentAttackType);
                const baseIndex = currentIndex >= 0 ? currentIndex : -1;
                let selected = false;
                for (let offset = 1; offset <= possibleAttackTypes.length; offset++) {
                    const nextAttackType = possibleAttackTypes[(baseIndex + offset) % possibleAttackTypes.length];
                    if (nextAttackType === currentAttackType) {
                        continue;
                    }
                    if (
                        this.context.applyGameAction({
                            type: "select_attack_type",
                            unitId: active.getId(),
                            attackType: nextAttackType,
                        })
                    ) {
                        selected = true;
                        break;
                    }
                }
                if (selected) {
                    this.context.setCurrentEnemiesCellsWithinMovementRange(undefined);
                    // Manually switching attack type drops any armed spell (don't keep a spell ready
                    // while the player explicitly chose a melee/range attack instead).
                    this.context.setCurrentActiveSpell(undefined);
                    this.context.setUnitPropertiesUpdateNeeded(true);
                    this.refreshButtons(true);
                    this.context.setSelectedAttackType(active.getAttackTypeSelection());
                    this.context.refreshUnits();
                }
                this.refreshButtons(true);
                return;
            }
        }
    }
    public setButtonsRefreshLocked(locked: boolean): void {
        this.buttonsRefreshLocked = locked;
        this.refreshButtons(true);
    }
}
