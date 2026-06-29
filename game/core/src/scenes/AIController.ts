import {
    AI,
    AttackVals,
    Grid,
    GridMath,
    HoCMath,
    IWeightedRoute,
    PathHelper,
    SpellHelper,
    SpellPowerType,
    SpellTargetType,
    Unit,
    UnitsHolder,
    FightStateManager,
} from "@heroesofcrypto/common";
import type { AttackHandler, AttackType, GameAction, Spell, TeamType } from "@heroesofcrypto/common";
import { RenderableUnit } from "./RenderableUnit";
import { HoverManager } from "./HoverManager";
import { ButtonManager } from "./ButtonManager";
import { SceneSettings } from "./SceneSettings";
import {
    chooseLocalModelAction,
    createLocalModelFightStateSummary,
    createLocalModelActions,
    describeLocalModelActiveUnit,
    getLocalModelTeamName,
    getLocalModelOpponentConfig,
    markLocalModelAction,
    recordLocalModelFightLog,
    type LocalModelLegalAction,
    type LocalModelOpponentConfig,
} from "./LocalModelOpponent";

/**
 * Simple log interface for scene logging.
 */
export interface ISceneLogForAI {
    updateLog(message: string): void;
}

/**
 * Interface defining the context needed by AIController.
 * Implemented by Sandbox to provide necessary methods and state.
 */
export interface IAIContext {
    // State accessors
    getCurrentActiveUnit(): RenderableUnit | undefined;
    getGrid(): Grid;
    getGridMatrix(): number[][];
    getUnitsHolder(): UnitsHolder;
    getAttackHandler(): AttackHandler;
    getPathHelper(): PathHelper;
    getHoverManager(): HoverManager;
    getButtonManager(): ButtonManager;
    getSceneSettings(): SceneSettings;
    getSceneLog(): ISceneLogForAI;

    // State setters
    setCurrentActiveKnownPaths(paths: Map<number, IWeightedRoute[]> | undefined): void;
    setSelectedAttackType(type: number): void;

    // Actions
    isAuthoritativeAction?(action: GameAction): boolean;
    /**
     * The team the generic "AI toggle" (isAIActive) may auto-play, or undefined for no restriction.
     * Sandbox returns undefined so single-player autobattle drives whichever unit is active (both
     * teams). Ranked returns the local player's team so the toggle only auto-plays the player's own
     * units — never the opponent's (which the toggle isn't otherwise team-gated against). The
     * separate local-model team path is unaffected.
     */
    getToggleAiControlledTeam?(): TeamType | undefined;
    applyGameAction(action: GameAction): boolean;
    executeAttackSequence(
        attacker: RenderableUnit,
        target: Unit,
        attackFrom: HoCMath.XY,
        replayAction?: Extract<GameAction, { type: "melee_attack" }> | Extract<GameAction, { type: "range_attack" }>,
    ): Promise<boolean>;
    executeMoveSequence(
        unit: RenderableUnit,
        path: HoCMath.XY[],
        overrideFootprint?: HoCMath.XY[],
        onComplete?: () => void,
        replayAction?: Extract<GameAction, { type: "move_unit" }>,
    ): boolean;
    refreshUnits(): void;
}

/**
 * AIController manages AI decision-making and action execution.
 * Extracted from Sandbox to improve code organization.
 */
export class AIController {
    private static readonly MOVE_ACTION_TIMEOUT_MS = 6000;
    private context: IAIContext;
    private readonly localModelOpponent: LocalModelOpponentConfig;
    private localModelTeamOverride?: TeamType;
    private localModelTeamOverrideSet = false;
    private lastLocalModelUnitId: string | undefined;
    private attackTypeSetupUnitId: string | undefined;
    // Unit we last tried to cast a spell for. If it's STILL the active unit on the next decision, the
    // cast didn't advance the turn (rejected) — so we attack instead of re-casting, breaking any loop.
    private spellCastAttemptUnitId: string | undefined;
    // Aura-bearer we last hourglassed (waited) to reposition later this round. Cleared when a different
    // unit becomes active, so the same unit doesn't try to wait twice on the same turn.
    private auraWaitAttemptUnitId: string | undefined;
    // AI State
    public isAIActive = false;
    public performingAction = false;
    public constructor(context: IAIContext) {
        this.context = context;
        this.localModelOpponent = getLocalModelOpponentConfig();
    }
    /**
     * Restore the AI toggle to the player's pre-auto-turn choice. AI-Driven units force AI on for
     * their turn (and the toggle is disabled); afterwards we put it back where it was — keep it on
     * only if the player had enabled AI for the whole fight, otherwise turn it back off.
     */
    private restoreAIState(_priorAIActive: boolean): void {
        // isAIActive is the player's toggle, set only via the AI button — AI turns no longer mutate
        // it, so a manual toggle-off during an in-flight AI action sticks instead of being reverted
        // to this stale captured value (the bug where you couldn't switch the toggle back off). Just
        // re-sync the button visual to the live toggle.
        const buttonManager = this.context.getButtonManager();
        buttonManager.sc_isAIActive = this.isAIActive;
        buttonManager.refreshButtons(true);
    }
    private finishAIAction(priorAIActive: boolean): void {
        this.restoreAIState(priorAIActive);
        this.performingAction = false;
    }
    private endTurnIfStillActive(unit: RenderableUnit): void {
        const currentUnit = this.context.getCurrentActiveUnit();
        if (currentUnit?.getId() === unit.getId()) {
            this.context.applyGameAction(this.modelAction(unit, { type: "end_turn", unitId: unit.getId() }));
        }
    }
    private scheduleMoveWatchdog(
        unit: RenderableUnit,
        priorAIActive: boolean,
        onTimeout?: () => void,
    ): ReturnType<typeof setTimeout> {
        return setTimeout(() => {
            if (!this.performingAction) {
                return;
            }

            const currentUnit = this.context.getCurrentActiveUnit();
            if (currentUnit?.getId() !== unit.getId()) {
                this.finishAIAction(priorAIActive);
                return;
            }

            onTimeout?.();
            this.endTurnIfStillActive(unit);
            this.finishAIAction(priorAIActive);
        }, AIController.MOVE_ACTION_TIMEOUT_MS);
    }
    /**
     * Check if AI should be triggered for the current turn.
     */
    public shouldTriggerAI(): boolean {
        const currentUnit = this.context.getCurrentActiveUnit();
        if (!currentUnit) return false;
        return this.shouldAutoPlay(currentUnit) && !this.performingAction;
    }
    /**
     * Whether the AI should auto-play this unit, ignoring whether an action is already in flight.
     * The player's AI toggle only applies to the toggle's controlled team (the local player's units
     * in ranked); AI-Driven units and the local-model team always auto-play. Used both to decide a
     * fresh trigger and to re-validate a queued action right before it runs (the player may have
     * toggled AI off during the trigger delay).
     */
    private shouldAutoPlay(unit: Unit): boolean {
        const playerAIEnabled = !this.localModelOpponent.enabled && this.isAIActive && this.toggleAiControlsUnit(unit);
        return this.shouldControlUnit(unit) || playerAIEnabled || unit.hasAbilityActive("AI Driven");
    }
    /**
     * Whether the AI toggle is allowed to auto-play this unit. Restricted to the toggle's controlled
     * team (the local player's team in ranked); unrestricted when no team is configured (sandbox).
     */
    private toggleAiControlsUnit(unit: Unit): boolean {
        const controlledTeam = this.context.getToggleAiControlledTeam?.();
        return controlledTeam === undefined || unit.getTeam() === controlledTeam;
    }
    public shouldControlCurrentUnit(): boolean {
        const currentUnit = this.context.getCurrentActiveUnit();
        return !!currentUnit && this.shouldControlUnit(currentUnit);
    }
    public setLocalModelTeamOverride(team: TeamType | undefined): void {
        this.localModelTeamOverride = team;
        this.localModelTeamOverrideSet = true;
    }
    private shouldControlUnit(unit: Unit): boolean {
        const modelTeam = this.localModelTeamOverrideSet
            ? this.localModelTeamOverride
            : this.localModelOpponent.modelTeam;
        return this.localModelOpponent.enabled && unit.getTeam() === modelTeam;
    }
    private modelAction<T extends GameAction>(unit: Unit, action: T): T {
        return this.shouldControlUnit(unit) ? markLocalModelAction(action) : action;
    }
    /**
     * Trigger AI action with proper delay.
     * @param delayMs - Delay in milliseconds before AI acts
     * @param onComplete - Optional callback after AI action completes
     */
    public triggerAIAction(delayMs: number, onComplete?: () => void): void {
        if (!this.shouldTriggerAI()) return;

        this.performingAction = true;
        const wasAIActive = this.isAIActive;

        setTimeout(async () => {
            const currentUnit = this.context.getCurrentActiveUnit();
            // Re-validate before acting: during the trigger delay the player may have toggled AI off
            // (or the active unit may have changed). Without this, a queued action would run — and
            // previously also force the toggle back on — making it impossible to switch AI off.
            if (!currentUnit || !this.shouldAutoPlay(currentUnit)) {
                this.performingAction = false;
                this.restoreAIState(wasAIActive);
                onComplete?.();
                return;
            }

            // Reflect the in-progress AI turn on the button (cosmetic) — including AI-Driven turns
            // that run while the player's toggle is off. The logical toggle (isAIActive) is left
            // untouched so the player's choice remains the single source of truth.
            if (!this.shouldControlUnit(currentUnit)) {
                this.context.getButtonManager().sc_isAIActive = true;
            }
            this.context.getButtonManager().refreshButtons(true);

            try {
                await this.performAction(wasAIActive);
            } catch (err) {
                console.error("AI action failed", err);
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(wasAIActive);
            } finally {
                onComplete?.();
            }
        }, delayMs);
    }
    /**
     * Main AI action logic - decides and executes the best action for current unit.
     */
    public async performAction(wasAIActive: boolean): Promise<void> {
        const currentUnit = this.context.getCurrentActiveUnit();
        if (!currentUnit) {
            this.finishAIAction(wasAIActive);
            return;
        }

        let actionPerformed = false;

        if (this.shouldControlUnit(currentUnit)) {
            actionPerformed = await this.performLocalModelAction(currentUnit, wasAIActive);
            if (actionPerformed) {
                return;
            }
        }

        // Spell casting: the built-in AI.findTarget only does move/attack, so evaluate the active
        // unit's spells (heal/buff allies, debuff/Castling enemies, summon) here. Cast only when it
        // beats just attacking, so the unit still progresses the fight to a finish.
        if (this.tryCastSpell(currentUnit, wasAIActive)) {
            return;
        }

        const action = AI.findTarget(
            currentUnit,
            this.context.getGrid(),
            this.context.getGridMatrix(),
            this.context.getUnitsHolder(),
            this.context.getPathHelper(),
        );

        if (action?.actionType() === AI.AIActionType.MOVE_AND_MELEE_ATTACK) {
            actionPerformed = await this.handleMoveAndMeleeAttack(currentUnit, action, wasAIActive);
            if (actionPerformed) return; // Early return handled internally with callbacks
        } else if (action?.actionType() === AI.AIActionType.MELEE_ATTACK) {
            actionPerformed = await this.handleMeleeAttack(currentUnit, action);
        } else if (action?.actionType() === AI.AIActionType.RANGE_ATTACK) {
            actionPerformed = await this.handleRangeAttack(currentUnit, action);
        } else {
            // Move only. For aura emitters, reposition to keep the most allies (buff aura) / enemies
            // (debuff aura) inside the aura — or hourglass to reposition after others move — instead of
            // the default rush toward the enemy.
            if (this.tryAuraReposition(currentUnit, action, wasAIActive)) return;
            const moveHandled = this.handleMoveOnly(currentUnit, action, wasAIActive);
            if (moveHandled) return; // Early return - callback handles cleanup
        }

        if (!actionPerformed) {
            this.endTurnIfStillActive(currentUnit);
        }

        this.finishAIAction(wasAIActive);
    }
    /** Estimated value of the active unit simply attacking this turn (max damage it can deal). */
    private estimateAttackValue(caster: Unit): number {
        return Math.max(0, caster.getAttackDamageMax()) * Math.max(0, caster.getAmountAlive());
    }
    /**
     * Pick the best spell the caster should cast this turn, or undefined to fall through to move/attack.
     * Covers ally heals/buffs, enemy debuffs, Castling (swap with a small enemy in move range) and
     * summons. Each candidate is scored on a shared scale and only cast when it beats attacking, and
     * already-applied buffs/debuffs and full-HP heal targets are skipped so the AI can't loop forever.
     */
    private chooseBestSpell(
        caster: Unit,
    ): { spellName: string; targetUnitId?: string; targetCell?: HoCMath.XY } | undefined {
        const spells = caster.getSpells();
        if (!spells.length || caster.getStackPower() < 1) {
            return undefined;
        }
        const team = caster.getTeam();
        const holder = this.context.getUnitsHolder();
        const allies = holder.getAllAllies(team).filter((u) => !u.isDead());
        const enemies = holder.getAllEnemyUnits(team).filter((u) => !u.isDead() && !u.hasBuffActive("Hidden"));
        if (!allies.length) {
            return undefined;
        }
        const gs = this.context.getSceneSettings().getGridSettings();
        const gridMatrix = this.context.getGridMatrix();
        const MASS_VALUE = 12;
        const attackValue = this.estimateAttackValue(caster);
        const threat = (u: Unit): number => Math.max(1, u.getAttackDamageMax()) * Math.max(1, u.getAmountAlive());
        // Small enemy cells the caster could reach — the "within movement range" set Castling needs.
        const castlingSteps = Math.max(1, Math.ceil(caster.getSteps())) + 1;
        const enemiesInRange = enemies
            .filter(
                (e) => e.isSmallSize() && HoCMath.getDistance(caster.getBaseCell(), e.getBaseCell()) <= castlingSteps,
            )
            .map((e) => e.getBaseCell());
        // Authoritative castability gate (same as the engine's handleMagicAttack) so we never pick a
        // single-target cast the server would reject as spell_not_available.
        const canCast = (spell: Spell, target?: Unit): boolean =>
            !!SpellHelper.canCastSpell(
                false,
                gs,
                gridMatrix,
                caster,
                target,
                spell,
                target?.getBaseCell(),
                target?.getMagicResist(),
                target?.hasMindAttackResistance(),
                target?.canBeHealed(),
                enemiesInRange,
            );

        let best: { spellName: string; targetUnitId?: string; targetCell?: HoCMath.XY } | undefined;
        let bestValue = 0;
        const consider = (
            value: number,
            choice: { spellName: string; targetUnitId?: string; targetCell?: HoCMath.XY },
        ): void => {
            if (value > bestValue) {
                bestValue = value;
                best = choice;
            }
        };

        for (const spell of spells) {
            if (spell.getLapsTotal() <= 0 || !spell.isRemaining()) {
                continue;
            }
            if (spell.getMinimalCasterStackPower() > caster.getStackPower()) {
                continue;
            }
            const tt = spell.getSpellTargetType();
            const pt = spell.getPowerType();
            const name = spell.getName();
            const isHeal = pt === SpellPowerType.HEAL;
            const allyCandidates = spell.isSelfCastAllowed()
                ? allies
                : allies.filter((a) => a.getId() !== caster.getId());

            // Summon (e.g. RANDOM_CLOSE_TO_CASTER): spawn allies near the caster.
            if (spell.isSummon() && tt === SpellTargetType.RANDOM_CLOSE_TO_CASTER) {
                const amount = Math.floor(caster.getAmountAlive() * spell.getPower());
                const cell = GridMath.getRandomGridCellAroundPosition(gs, gridMatrix, team, caster.getPosition());
                if (amount > 0 && cell && SpellHelper.canCastSummon(spell, gridMatrix, cell)) {
                    consider(amount * 8, { spellName: name, targetCell: cell });
                }
                continue;
            }

            // Beneficial: heal the most-hurt ally / buff allies not already carrying this buff.
            if (spell.isBuff() || isHeal) {
                if (tt === SpellTargetType.ALL_ALLIES || tt === SpellTargetType.ALL_FLYING) {
                    const benef = (
                        tt === SpellTargetType.ALL_FLYING ? allyCandidates.filter((a) => a.canFly()) : allyCandidates
                    ).filter((a) => (isHeal ? a.getHp() < a.getMaxHp() : !a.hasBuffActive(name)));
                    if (benef.length) {
                        consider(benef.length * MASS_VALUE, { spellName: name });
                    }
                } else if (tt === SpellTargetType.ANY_ALLY) {
                    let target: Unit | undefined;
                    let value = 0;
                    if (isHeal) {
                        for (const a of allyCandidates) {
                            const missing = a.getMaxHp() - a.getHp();
                            if (missing > value) {
                                value = missing;
                                target = a;
                            }
                        }
                    } else {
                        for (const a of allyCandidates) {
                            if (a.hasBuffActive(name)) {
                                continue;
                            }
                            const v = threat(a);
                            if (v > value) {
                                value = v;
                                target = a;
                            }
                        }
                    }
                    if (target && canCast(spell, target)) {
                        consider(value, { spellName: name, targetUnitId: target.getId() });
                    }
                }
                continue;
            }

            // Castling (POSITION_CHANGE): swap with a strong small enemy within the caster's reach.
            if (pt === SpellPowerType.POSITION_CHANGE && tt === SpellTargetType.ENEMY_WITHIN_MOVEMENT_RANGE) {
                const steps = Math.max(1, Math.ceil(caster.getSteps())) + 1;
                let target: Unit | undefined;
                let value = 0;
                for (const e of enemies) {
                    if (!e.isSmallSize()) {
                        continue;
                    }
                    const d = HoCMath.getDistance(caster.getBaseCell(), e.getBaseCell());
                    if (d > steps) {
                        continue;
                    }
                    const v = threat(e);
                    if (v > value) {
                        value = v;
                        target = e;
                    }
                }
                if (target && canCast(spell, target)) {
                    consider(value, {
                        spellName: name,
                        targetUnitId: target.getId(),
                        targetCell: target.getBaseCell(),
                    });
                }
                continue;
            }

            // Debuff enemies (ANY_ENEMY / ALL_ENEMIES) not already carrying this debuff.
            if (!enemies.length) {
                continue;
            }
            if (tt === SpellTargetType.ALL_ENEMIES) {
                const benef = enemies.filter((e) => !e.hasDebuffActive(name));
                if (benef.length) {
                    consider(benef.length * MASS_VALUE, { spellName: name });
                }
            } else if (tt === SpellTargetType.ANY_ENEMY) {
                let target: Unit | undefined;
                let value = 0;
                for (const e of enemies) {
                    if (e.hasDebuffActive(name)) {
                        continue;
                    }
                    const v = threat(e);
                    if (v > value) {
                        value = v;
                        target = e;
                    }
                }
                if (target && canCast(spell, target)) {
                    consider(value, {
                        spellName: name,
                        targetUnitId: target.getId(),
                        targetCell: target.getBaseCell(),
                    });
                }
            }
        }

        if (!best || bestValue <= attackValue) {
            return undefined;
        }
        return best;
    }
    /** Cast the chosen spell (if any) as an authoritative action and end the AI's turn. */
    private tryCastSpell(caster: RenderableUnit, wasAIActive: boolean): boolean {
        // Loop guard: in ranked the cast is submitted optimistically, so if the server rejects it the
        // same unit stays active. If we already tried a cast for this exact active unit, don't try
        // again — attack instead — so a rejected/odd cast can't wedge the unit on its turn. The guard
        // clears as soon as a DIFFERENT unit is active (the turn advanced), so it re-arms each turn.
        if (this.spellCastAttemptUnitId && this.spellCastAttemptUnitId !== caster.getId()) {
            this.spellCastAttemptUnitId = undefined;
        }
        if (this.spellCastAttemptUnitId === caster.getId()) {
            return false;
        }
        const choice = this.chooseBestSpell(caster);
        if (!choice) {
            return false;
        }
        this.spellCastAttemptUnitId = caster.getId();
        const action = this.modelAction(caster, {
            type: "cast_spell",
            casterId: caster.getId(),
            spellName: choice.spellName,
            targetId: choice.targetUnitId,
            targetCell: choice.targetCell,
        });
        const completed = this.context.applyGameAction(action);
        if (!completed) {
            // Engine/transport rejected — fall back to a normal move/attack this turn.
            return false;
        }
        this.endTurnIfStillActive(caster);
        this.finishAIAction(wasAIActive);
        return true;
    }
    private async performLocalModelAction(currentUnit: RenderableUnit, wasAIActive: boolean): Promise<boolean> {
        if (this.lastLocalModelUnitId !== currentUnit.getId()) {
            this.lastLocalModelUnitId = currentUnit.getId();
            this.attackTypeSetupUnitId = undefined;
        }
        const allowAttackTypeSetup = this.attackTypeSetupUnitId !== currentUnit.getId();
        const legalActions = createLocalModelActions({
            matchId: "ui-local-model",
            stateVersion: FightStateManager.getInstance().getFightProperties().getCurrentLap(),
            activeUnit: currentUnit,
            grid: this.context.getGrid(),
            unitsHolder: this.context.getUnitsHolder(),
            attackHandler: this.context.getAttackHandler(),
            fightProperties: FightStateManager.getInstance().getFightProperties(),
            pathHelper: this.context.getPathHelper(),
            allowAttackTypeSetup,
        });

        const choice = await chooseLocalModelAction({
            config: this.localModelOpponent,
            activeUnit: currentUnit,
            unitsHolder: this.context.getUnitsHolder(),
            actions: legalActions,
            matchId: "ui-local-model",
            stateVersion: FightStateManager.getInstance().getFightProperties().getCurrentLap(),
        });
        if (!choice.action) {
            const reason = choice.error ?? choice.rawContent?.slice(0, 80) ?? "invalid model action";
            this.recordLocalModelResult(
                currentUnit,
                undefined,
                choice.decisionId,
                false,
                `fallback_builtin_ai:${reason}`,
            );
            return false;
        }

        if (choice.action.action.type === "select_attack_type") {
            this.attackTypeSetupUnitId = currentUnit.getId();
        } else {
            this.attackTypeSetupUnitId = undefined;
        }
        return this.executeLocalModelAction(currentUnit, choice.action, wasAIActive, choice.decisionId);
    }
    private recordLocalModelResult(
        currentUnit: RenderableUnit,
        legalAction: LocalModelLegalAction | undefined,
        decisionId: string | undefined,
        completed: boolean,
        error?: string,
    ): void {
        if (!decisionId) {
            return;
        }
        recordLocalModelFightLog({
            id: decisionId,
            timestamp: new Date().toISOString(),
            kind: "result",
            matchId: "ui-local-model",
            stateVersion: FightStateManager.getInstance().getFightProperties().getCurrentLap(),
            team: getLocalModelTeamName(currentUnit.getTeam()),
            activeUnit: describeLocalModelActiveUnit(currentUnit),
            stateSummary: createLocalModelFightStateSummary(currentUnit, this.context.getUnitsHolder()),
            selectedAction: legalAction
                ? {
                      index: legalAction.index,
                      label: legalAction.label,
                      kind: legalAction.kind,
                      summary: legalAction.summary,
                      action: legalAction.action,
                  }
                : undefined,
            completed,
            error,
        });
    }
    private async executeLocalModelAction(
        currentUnit: RenderableUnit,
        legalAction: LocalModelLegalAction,
        wasAIActive: boolean,
        decisionId?: string,
    ): Promise<boolean> {
        const action = legalAction.action;
        if (action.type === "select_attack_type") {
            if (this.context.applyGameAction(this.modelAction(currentUnit, action))) {
                this.finishAIAction(wasAIActive);
                this.recordLocalModelResult(currentUnit, legalAction, decisionId, true);
                return true;
            }

            this.recordLocalModelResult(currentUnit, legalAction, decisionId, false, "attack_type_setup_failed");
            return false;
        }

        if (action.type === "move_unit") {
            if (!action.path?.length) {
                this.recordLocalModelResult(currentUnit, legalAction, decisionId, false, "missing_path");
                return false;
            }
            const replayAction = this.modelAction(currentUnit, action);
            const isAuthoritative = this.context.isAuthoritativeAction?.(replayAction) ?? false;
            const watchdog = isAuthoritative
                ? undefined
                : this.scheduleMoveWatchdog(currentUnit, wasAIActive, () => {
                      this.recordLocalModelResult(currentUnit, legalAction, decisionId, false, "move_timeout");
                  });
            const started = this.context.executeMoveSequence(
                currentUnit,
                action.path,
                action.targetCells,
                () => {
                    if (!watchdog) {
                        return;
                    }
                    clearTimeout(watchdog);
                    this.endTurnIfStillActive(currentUnit);
                    this.recordLocalModelResult(currentUnit, legalAction, decisionId, true);
                    this.finishAIAction(wasAIActive);
                },
                replayAction,
            );
            if (!started) {
                if (watchdog) {
                    clearTimeout(watchdog);
                }
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(wasAIActive);
                this.recordLocalModelResult(currentUnit, legalAction, decisionId, false, "move_not_started");
            } else if (isAuthoritative) {
                this.recordLocalModelResult(currentUnit, legalAction, decisionId, true);
                this.finishAIAction(wasAIActive);
            }
            return true;
        }

        if (action.type === "melee_attack") {
            const target = this.context.getUnitsHolder().getAllUnits().get(action.targetId);
            const attackFrom = action.attackFrom ?? currentUnit.getBaseCell();
            if (!target || !attackFrom) {
                this.recordLocalModelResult(currentUnit, legalAction, decisionId, false, "missing_melee_target");
                return false;
            }

            const replayAction = this.modelAction(currentUnit, action);
            if (this.context.isAuthoritativeAction?.(replayAction)) {
                const completed = await this.context.executeAttackSequence(
                    currentUnit,
                    target,
                    attackFrom,
                    replayAction,
                );
                if (!completed) {
                    this.endTurnIfStillActive(currentUnit);
                }
                this.finishAIAction(wasAIActive);
                this.recordLocalModelResult(
                    currentUnit,
                    legalAction,
                    decisionId,
                    completed,
                    completed ? undefined : "melee_failed",
                );
                return true;
            }

            if (action.path?.length) {
                const watchdog = this.scheduleMoveWatchdog(currentUnit, wasAIActive, () => {
                    this.recordLocalModelResult(
                        currentUnit,
                        legalAction,
                        decisionId,
                        false,
                        "move_before_melee_timeout",
                    );
                });
                const started = this.context.executeMoveSequence(
                    currentUnit,
                    action.path,
                    undefined,
                    async () => {
                        clearTimeout(watchdog);
                        try {
                            const completed = await this.context.executeAttackSequence(
                                currentUnit,
                                target,
                                attackFrom,
                                this.modelAction(currentUnit, action),
                            );
                            if (!completed) {
                                this.endTurnIfStillActive(currentUnit);
                            }
                            this.recordLocalModelResult(
                                currentUnit,
                                legalAction,
                                decisionId,
                                completed,
                                completed ? undefined : "melee_after_move_failed",
                            );
                        } catch (err) {
                            this.endTurnIfStillActive(currentUnit);
                            this.recordLocalModelResult(
                                currentUnit,
                                legalAction,
                                decisionId,
                                false,
                                `melee_after_move_error:${(err as Error).message}`,
                            );
                        } finally {
                            this.finishAIAction(wasAIActive);
                        }
                    },
                    this.modelAction(currentUnit, {
                        type: "move_unit",
                        unitId: currentUnit.getId(),
                        path: action.path,
                    }),
                );
                if (!started) {
                    clearTimeout(watchdog);
                    this.endTurnIfStillActive(currentUnit);
                    this.finishAIAction(wasAIActive);
                    this.recordLocalModelResult(
                        currentUnit,
                        legalAction,
                        decisionId,
                        false,
                        "move_before_melee_not_started",
                    );
                }
                return true;
            }

            const completed = await this.context.executeAttackSequence(
                currentUnit,
                target,
                attackFrom,
                this.modelAction(currentUnit, action),
            );
            if (!completed) {
                this.endTurnIfStillActive(currentUnit);
            }
            this.finishAIAction(wasAIActive);
            this.recordLocalModelResult(
                currentUnit,
                legalAction,
                decisionId,
                completed,
                completed ? undefined : "melee_failed",
            );
            return true;
        }

        if (action.type === "range_attack") {
            const target = this.context.getUnitsHolder().getAllUnits().get(action.targetId);
            const gs = this.context.getSceneSettings().getGridSettings();
            const attackFrom = GridMath.getCellForPosition(gs, currentUnit.getPosition());
            if (!target || !attackFrom) {
                this.recordLocalModelResult(currentUnit, legalAction, decisionId, false, "missing_range_target");
                return false;
            }
            const completed = await this.context.executeAttackSequence(
                currentUnit,
                target,
                attackFrom,
                this.modelAction(currentUnit, action),
            );
            if (!completed) {
                this.endTurnIfStillActive(currentUnit);
            }
            this.finishAIAction(wasAIActive);
            this.recordLocalModelResult(
                currentUnit,
                legalAction,
                decisionId,
                completed,
                completed ? undefined : "range_failed",
            );
            return true;
        }

        if (this.context.applyGameAction(this.modelAction(currentUnit, action))) {
            this.finishAIAction(wasAIActive);
            this.recordLocalModelResult(currentUnit, legalAction, decisionId, true);
            return true;
        }

        this.recordLocalModelResult(currentUnit, legalAction, decisionId, false, "apply_game_action_failed");
        return false;
    }
    /**
     * Handle MOVE_AND_MELEE_ATTACK action type.
     * Returns true if action was initiated (may be async via callbacks).
     */
    private async handleMoveAndMeleeAttack(
        currentUnit: RenderableUnit,
        action: AI.IAIAction,
        wasAIActive: boolean,
    ): Promise<boolean> {
        if (this.selectAttackType(currentUnit, AttackVals.MELEE)) {
            this.context.getButtonManager().refreshButtons(true);
            this.context.refreshUnits();
        }

        this.context.setSelectedAttackType(currentUnit.getAttackTypeSelection());
        this.context.setCurrentActiveKnownPaths(action.currentActiveKnownPaths());

        const cellToAttack = action.cellToAttack();
        const attackFromCell = action.cellToMove();

        if (!cellToAttack || !attackFromCell) return false;

        const targetUnitId = this.context.getGrid().getOccupantUnitId(cellToAttack);
        if (targetUnitId === undefined) return false;

        const unitToAttack = this.context.getUnitsHolder().getAllUnits().get(targetUnitId);
        if (!unitToAttack) return false;

        // Get route
        const knownPaths = action.currentActiveKnownPaths();
        const movePaths = knownPaths?.get((attackFromCell.x << 4) | attackFromCell.y);
        const route = movePaths && Array.isArray(movePaths) && movePaths.length > 0 ? movePaths[0].route : undefined;
        const authoritativeAction = this.modelAction(currentUnit, {
            type: "melee_attack",
            attackerId: currentUnit.getId(),
            targetId: unitToAttack.getId(),
            attackFrom: attackFromCell,
            path: route,
        });
        if (this.context.isAuthoritativeAction?.(authoritativeAction)) {
            const attackCompleted = await this.context.executeAttackSequence(
                currentUnit,
                unitToAttack,
                attackFromCell,
                authoritativeAction,
            );
            if (!attackCompleted) {
                this.endTurnIfStillActive(currentUnit);
            }
            this.finishAIAction(wasAIActive);
            return true;
        }

        // Show silhouette
        const gs = this.context.getSceneSettings().getGridSettings();
        const attackFromPos = GridMath.getPositionForCell(attackFromCell, gs.getMinX(), gs.getStep(), gs.getHalfStep());

        // For large (2x2) units the AI emits the top-right anchor cell and the stored position is
        // the 2x2 center (anchor - halfStep). Build the occupied footprint from that center and
        // hand it to executeMoveSequence so the unit lands exactly where the silhouette shows;
        // otherwise the move fallback mis-anchors it by one cell diagonally (wrong stand/attack pos).
        let moveFootprint: HoCMath.XY[] | undefined;
        if (attackFromPos) {
            if (!currentUnit.isSmallSize()) {
                attackFromPos.x -= gs.getHalfStep();
                attackFromPos.y -= gs.getHalfStep();
                moveFootprint = GridMath.getCellsAroundPosition(gs, attackFromPos);
            }
            this.context.getHoverManager().showSilhouetteForUnit(currentUnit.getUnitProperties(), attackFromPos);
        }

        // Execute move then attack
        if (route && Array.isArray(route) && route.length > 0) {
            const target = unitToAttack;
            const attackCell = attackFromCell;
            const aiActive = wasAIActive;
            const watchdog = this.scheduleMoveWatchdog(currentUnit, aiActive);

            const moveStarted = this.context.executeMoveSequence(
                currentUnit,
                route,
                moveFootprint,
                async () => {
                    clearTimeout(watchdog);
                    try {
                        const attackCompleted = await this.context.executeAttackSequence(
                            currentUnit,
                            target,
                            attackCell,
                            authoritativeAction,
                        );
                        if (!attackCompleted) {
                            this.endTurnIfStillActive(currentUnit);
                        }
                    } catch (err) {
                        console.error("AI move-and-attack failed", err);
                        this.endTurnIfStillActive(currentUnit);
                    } finally {
                        this.finishAIAction(aiActive);
                    }
                },
                this.modelAction(currentUnit, {
                    type: "move_unit",
                    unitId: currentUnit.getId(),
                    path: route,
                    targetCells: moveFootprint,
                }),
            );
            if (!moveStarted) {
                clearTimeout(watchdog);
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(aiActive);
            }
            return true; // Callback handles cleanup
        } else {
            // No route - attack directly
            const attackCompleted = await this.context.executeAttackSequence(
                currentUnit,
                unitToAttack,
                attackFromCell,
                this.modelAction(currentUnit, {
                    type: "melee_attack",
                    attackerId: currentUnit.getId(),
                    targetId: unitToAttack.getId(),
                    attackFrom: attackFromCell,
                }),
            );
            if (!attackCompleted) {
                this.endTurnIfStillActive(currentUnit);
            }
            this.finishAIAction(wasAIActive);
            return true;
        }
    }
    /**
     * Handle MELEE_ATTACK action type (no move needed).
     */
    private async handleMeleeAttack(currentUnit: RenderableUnit, action: AI.IAIAction): Promise<boolean> {
        if (this.selectAttackType(currentUnit, AttackVals.MELEE)) {
            this.context.getButtonManager().refreshButtons(true);
            this.context.refreshUnits();
        }

        this.context.setCurrentActiveKnownPaths(action.currentActiveKnownPaths());

        const cellToAttack = action.cellToAttack();
        const gs = this.context.getSceneSettings().getGridSettings();
        const attackFromCell = action.cellToMove() || GridMath.getCellForPosition(gs, currentUnit.getPosition());

        if (!cellToAttack || !attackFromCell) return false;

        const targetUnitId = this.context.getGrid().getOccupantUnitId(cellToAttack);
        if (!targetUnitId) return false;

        const targetUnit = this.context.getUnitsHolder().getAllUnits().get(targetUnitId);
        if (!targetUnit) return false;

        return this.context.executeAttackSequence(
            currentUnit,
            targetUnit,
            attackFromCell,
            this.modelAction(currentUnit, {
                type: "melee_attack",
                attackerId: currentUnit.getId(),
                targetId: targetUnit.getId(),
                attackFrom: attackFromCell,
            }),
        );
    }
    /**
     * Handle RANGE_ATTACK action type.
     */
    private async handleRangeAttack(currentUnit: RenderableUnit, action: AI.IAIAction): Promise<boolean> {
        if (this.selectAttackType(currentUnit, AttackVals.RANGE)) {
            this.context.getButtonManager().refreshButtons(true);
            this.context.refreshUnits();
        }

        this.context.setCurrentActiveKnownPaths(action.currentActiveKnownPaths());

        const cellToAttack = action.cellToAttack();
        const gs = this.context.getSceneSettings().getGridSettings();
        const attackFromCell = GridMath.getCellForPosition(gs, currentUnit.getPosition());

        if (!cellToAttack || !attackFromCell) return false;

        const targetUnitId = this.context.getGrid().getOccupantUnitId(cellToAttack);
        if (!targetUnitId) return false;

        const targetUnit = this.context.getUnitsHolder().getAllUnits().get(targetUnitId);
        if (!targetUnit) return false;

        return this.context.executeAttackSequence(
            currentUnit,
            targetUnit,
            attackFromCell,
            this.modelAction(currentUnit, {
                type: "range_attack",
                attackerId: currentUnit.getId(),
                targetId: targetUnit.getId(),
            }),
        );
    }
    /**
     * Aura-aware turn for a unit that emits a buff/debuff aura. Moves it onto the reachable cell that
     * keeps the most allies (buff) / enemies (debuff) inside the aura; if no move improves coverage but
     * targets are still out of reach (and it's not under melee pressure), hourglasses once so it can
     * reposition after the others have moved this round. Returns true if it took the unit's turn.
     */
    private tryAuraReposition(
        currentUnit: RenderableUnit,
        action: AI.IAIAction | undefined,
        wasAIActive: boolean,
    ): boolean {
        if (this.auraWaitAttemptUnitId && this.auraWaitAttemptUnitId !== currentUnit.getId()) {
            this.auraWaitAttemptUnitId = undefined;
        }
        const gs = this.context.getSceneSettings().getGridSettings();
        const plan = AI.planAuraMove(
            currentUnit,
            action?.currentActiveKnownPaths(),
            gs,
            this.context.getGridMatrix(),
            this.context.getUnitsHolder(),
        );
        if (!plan) return false; // not an aura emitter

        const baseCell = currentUnit.getBaseCell();
        const movesElsewhere = plan.bestCell.x !== baseCell.x || plan.bestCell.y !== baseCell.y;

        // 1) A reachable cell covers more targets — move there.
        if (plan.bestScore > plan.currentScore && movesElsewhere && currentUnit.canMove()) {
            this.auraWaitAttemptUnitId = undefined;
            if (this.handleMoveOnly(currentUnit, action, wasAIActive, plan.bestCell)) return true;
        }

        // 2) No move helps yet but targets remain out of range and we're not under melee pressure —
        //    wait (once) so allies/enemies move first, then reposition on the later activation.
        if (
            plan.bestScore <= plan.currentScore &&
            plan.bestScore < plan.coverableTargets &&
            plan.currentThreats === 0 &&
            this.auraWaitAttemptUnitId !== currentUnit.getId()
        ) {
            this.auraWaitAttemptUnitId = currentUnit.getId();
            const waited = this.context.applyGameAction(
                this.modelAction(currentUnit, { type: "wait_turn", unitId: currentUnit.getId() }),
            );
            if (waited) {
                this.finishAIAction(wasAIActive);
                return true;
            }
        }

        // 3) Neither moving nor waiting helps. Don't let the default AI move drag the aura off its
        //    targets: if findTarget's move would cover fewer than standing still, just hold position.
        const defaultCell = action?.cellToMove();
        if (defaultCell) {
            const defaultScore = AI.auraCoverageScore(currentUnit, defaultCell, gs, this.context.getUnitsHolder());
            if (defaultScore < plan.currentScore) {
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(wasAIActive);
                return true;
            }
        }
        return false; // fall through to the default move (it doesn't lose coverage)
    }
    /**
     * Handle move-only action.
     * Returns true if move was initiated (cleanup handled via callback).
     */
    private handleMoveOnly(
        currentUnit: RenderableUnit,
        action: AI.IAIAction | undefined,
        wasAIActive: boolean,
        overrideCell?: HoCMath.XY,
    ): boolean {
        const cellToMove = overrideCell ?? action?.cellToMove();
        if (!cellToMove || !currentUnit.canMove()) return false;

        const knownPaths = action?.currentActiveKnownPaths();
        const movePaths = knownPaths?.get((cellToMove.x << 4) | cellToMove.y);
        if (!movePaths || !Array.isArray(movePaths) || movePaths.length === 0) return false;

        const route = movePaths[0].route;

        // Show silhouette
        const gs = this.context.getSceneSettings().getGridSettings();
        const moveToPos = GridMath.getPositionForCell(cellToMove, gs.getMinX(), gs.getStep(), gs.getHalfStep());

        // Same 2x2 footprint correction as handleMoveAndMeleeAttack: land the large unit where the
        // silhouette shows instead of letting the move fallback mis-anchor it by one cell diagonally.
        let moveFootprint: HoCMath.XY[] | undefined;
        if (moveToPos) {
            if (!currentUnit.isSmallSize()) {
                moveToPos.x -= gs.getHalfStep();
                moveToPos.y -= gs.getHalfStep();
                moveFootprint = GridMath.getCellsAroundPosition(gs, moveToPos);
            }
            this.context.getHoverManager().showSilhouetteForUnit(currentUnit.getUnitProperties(), moveToPos);
        }

        // Execute move with cleanup callback
        const moveAction = this.modelAction(currentUnit, {
            type: "move_unit",
            unitId: currentUnit.getId(),
            path: route,
            targetCells: moveFootprint,
        });
        const isAuthoritative = this.context.isAuthoritativeAction?.(moveAction) ?? false;
        const watchdog = isAuthoritative ? undefined : this.scheduleMoveWatchdog(currentUnit, wasAIActive);
        const moveStarted = this.context.executeMoveSequence(
            currentUnit,
            route,
            moveFootprint,
            () => {
                if (!watchdog) {
                    return;
                }
                clearTimeout(watchdog);
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(wasAIActive);
            },
            moveAction,
        );
        if (!moveStarted) {
            if (watchdog) {
                clearTimeout(watchdog);
            }
            this.endTurnIfStillActive(currentUnit);
            this.finishAIAction(wasAIActive);
        } else if (isAuthoritative) {
            this.finishAIAction(wasAIActive);
        }

        return true;
    }
    private selectAttackType(unit: RenderableUnit, attackType: AttackType): boolean {
        if (unit.getAttackTypeSelection() === attackType) {
            return false;
        }
        return this.context.applyGameAction(
            this.modelAction(unit, {
                type: "select_attack_type",
                unitId: unit.getId(),
                attackType,
            }),
        );
    }
}
