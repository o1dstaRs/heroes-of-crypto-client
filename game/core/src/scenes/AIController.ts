import {
    AI,
    AttackVals,
    DEFAULT_AI_VERSION,
    getAIStrategy,
    Grid,
    GridMath,
    HoCMath,
    HoCLib,
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
    // Re-assert authoritative aura gates (Hidden / Range Null Field) right before an AI decision.
    ensureAuthoritativeAuraState?(): void;
    /**
     * The team the generic "AI toggle" (isAIActive) may auto-play, or undefined for no restriction.
     * Sandbox returns undefined so single-player autobattle drives whichever unit is active (both
     * teams). Ranked returns the local player's team so the toggle only auto-plays the player's own
     * units — never the opponent's (which the toggle isn't otherwise team-gated against). The
     * separate local-model team path is unaffected.
     */
    getToggleAiControlledTeam?(): TeamType | undefined;
    /**
     * Whether the given team is fully handed over to the AI via the sandbox "AI side" checkboxes.
     * Such a team auto-plays every turn (independent of the manual AI toggle / local-model path), and
     * the human cannot act for it. Undefined hook (or false) means the team is human-controlled.
     */
    isTeamAiControlled?(team: TeamType): boolean;
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
        // True when this move is the approach of a move+melee attack — drives the Rapid Charge dash.
        rapidCharge?: boolean,
    ): boolean;
    /**
     * Break the destructible center mountain: optionally walk to attackFromCell first, then issue an
     * obstacle_attack against the mountain cell at targetWorldPosition. onComplete fires once the
     * strike has landed (after any move). Returns false when the strike couldn't be started.
     */
    executeObstacleAttackSequence(
        unit: RenderableUnit,
        targetWorldPosition: HoCMath.XY,
        attackFromCell?: HoCMath.XY,
        onComplete?: () => void,
    ): boolean;
    refreshUnits(): void;
}

/**
 * AIController manages AI decision-making and action execution.
 * Extracted from Sandbox to improve code organization.
 */
export class AIController {
    private static readonly MOVE_ACTION_TIMEOUT_MS = 6000;
    // Grace window for the turn-action loop guard (see turnActionAttemptUnitId). Comfortably exceeds a
    // normal optimistic-submit → animation → authoritative-handoff round-trip, so it never blocks a
    // legitimate next action, but bounds how long a dropped/never-acknowledged submit can hold the
    // guard before we let the AI re-evaluate (the server turn-timer / reject-streak END_TURN then recovers).
    private static readonly TURN_ACTION_GUARD_GRACE_MS = 4000;
    // Catch-all backstop above the per-move watchdog: performingAction gates shouldTriggerAI(), and every
    // early-return path in performAction() hands the flag's reset to a completion callback (animation done,
    // authoritative handoff, or the MOVE watchdog). If any such callback never fires — a stalled/interrupted
    // animation, a cast/local-model path with no move watchdog — the flag wedges true and the AI silently
    // stops taking actions for the rest of the match. If it has been held longer than this window we
    // force-clear it so the next poll re-evaluates a fresh action. Comfortably exceeds MOVE_ACTION_TIMEOUT_MS
    // plus an optimistic-submit round-trip so it never fires on a legitimately in-flight action.
    private static readonly PERFORMING_ACTION_STALL_MS = 10000;
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
    // Unit we last submitted a strategy wait_turn (hourglass) for. If decideTurn re-emits wait_turn for the
    // SAME still-active unit, the hourglass isn't taking (server refused it / active-unit not yet synced) —
    // re-waiting spins into a skip, so recover with a real action (findTarget). Cleared when a different unit
    // becomes active. Mirrors auraWaitAttemptUnitId / spellCastAttemptUnitId.
    private strategyWaitAttemptUnitId: string | undefined;
    // Unit we last submitted a turn-resolving action (move/attack/end-turn) for. In ranked these submit
    // OPTIMISTICALLY (fire-and-forget), so a server rejection leaves the same unit active and the
    // ~60fps AI poll would recompute the SAME doomed action against the still-stale scene and resubmit
    // it every frame — the observed reject storm. While this id stays the active unit we refuse to
    // resubmit and wait for the authoritative snapshot to hand off the turn. Cleared when a DIFFERENT
    // unit becomes active (turn advanced) or after TURN_ACTION_GUARD_GRACE_MS so a dropped submit can't
    // wedge the unit. Mirrors the spellCastAttemptUnitId / auraWaitAttemptUnitId loop guards.
    private turnActionAttemptUnitId: string | undefined;
    private turnActionAttemptAtMs = 0;
    // AI State
    public isAIActive = false;
    public performingAction = false;
    // Timestamp performingAction last went true; the stall watchdog (PERFORMING_ACTION_STALL_MS) uses it to
    // recover from a wedged flag. 0 when idle.
    private performingActionSinceMs = 0;
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
        this.performingActionSinceMs = 0;
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
        this.recoverIfActionStalled();
        const currentUnit = this.context.getCurrentActiveUnit();
        if (!currentUnit) return false;
        return this.shouldAutoPlay(currentUnit) && !this.performingAction;
    }
    /**
     * Break a wedged performingAction flag. performingAction is the gate for shouldTriggerAI(); if a
     * per-path completion callback never fires (stalled animation, a cast/local-model path without a move
     * watchdog, an interrupted handoff), the flag stays true and the AI stops acting for the rest of the
     * match. Once it has been held past PERFORMING_ACTION_STALL_MS we clear it — leaving the toggle and the
     * turn-action guard intact — so the very next poll recomputes a fresh action; if that still can't
     * progress the turn, the server turn-timer / reject-streak END_TURN advances it. Runs each frame from
     * shouldTriggerAI(), which the update loop polls even while performingAction blocks a fresh trigger.
     */
    private recoverIfActionStalled(): void {
        if (!this.performingAction || this.performingActionSinceMs <= 0) return;
        if (HoCLib.getTimeMillis() - this.performingActionSinceMs < AIController.PERFORMING_ACTION_STALL_MS) return;
        console.warn(
            `AI action watchdog: performingAction stalled > ${AIController.PERFORMING_ACTION_STALL_MS}ms — clearing to unwedge the AI`,
        );
        this.performingAction = false;
        this.performingActionSinceMs = 0;
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
        return (
            this.shouldControlUnit(unit) ||
            playerAIEnabled ||
            unit.hasAbilityActive("AI Driven") ||
            !!this.context.isTeamAiControlled?.(unit.getTeam())
        );
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
        this.performingActionSinceMs = HoCLib.getTimeMillis();
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
     * Force the AI to play the CURRENT unit's turn once, regardless of the player's toggle. Used by the
     * sandbox turn-timeout takeover: a single missed turn is played by the AI without flipping the
     * persistent AI toggle on. Returns false (and does nothing) if a unit is missing or an AI action is
     * already in flight, so the caller can fall back to a plain skip.
     */
    public forceCurrentTurn(delayMs: number, onComplete?: () => void): boolean {
        const currentUnit = this.context.getCurrentActiveUnit();
        if (!currentUnit || this.performingAction) {
            return false;
        }
        this.performingAction = true;
        this.performingActionSinceMs = HoCLib.getTimeMillis();
        const wasAIActive = this.isAIActive;

        setTimeout(async () => {
            const unit = this.context.getCurrentActiveUnit();
            if (!unit) {
                this.performingAction = false;
                this.restoreAIState(wasAIActive);
                onComplete?.();
                return;
            }
            // Cosmetic only: show the AI button as active during the forced turn. The logical toggle
            // (isAIActive) is left untouched so a single missed turn doesn't turn AI on for good.
            this.context.getButtonManager().sc_isAIActive = true;
            this.context.getButtonManager().refreshButtons(true);
            try {
                await this.performAction(wasAIActive);
            } catch (err) {
                console.error("Forced AI turn failed", err);
                this.endTurnIfStillActive(unit);
                this.finishAIAction(wasAIActive);
            } finally {
                onComplete?.();
            }
        }, delayMs);
        return true;
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

        // Turn-action loop guard: if we already submitted a turn-resolving action for THIS still-active
        // unit, don't recompute + resubmit it every frame while waiting for the authoritative handoff
        // (ranked submits are optimistic, so a rejection keeps the unit active — that is the reject
        // storm). The guard clears as soon as a different unit is active (turn advanced) or after a grace
        // window (dropped submit), so it re-arms each turn and can never permanently wedge the AI.
        if (this.turnActionAttemptUnitId && this.turnActionAttemptUnitId !== currentUnit.getId()) {
            this.turnActionAttemptUnitId = undefined;
        }
        // Clear the wait-loop guard once the turn has genuinely advanced to a different unit.
        if (this.strategyWaitAttemptUnitId && this.strategyWaitAttemptUnitId !== currentUnit.getId()) {
            this.strategyWaitAttemptUnitId = undefined;
        }
        if (this.turnActionAttemptUnitId === currentUnit.getId()) {
            if (HoCLib.getTimeMillis() - this.turnActionAttemptAtMs < AIController.TURN_ACTION_GUARD_GRACE_MS) {
                this.finishAIAction(wasAIActive);
                return;
            }
            this.turnActionAttemptUnitId = undefined;
        }
        this.turnActionAttemptUnitId = currentUnit.getId();
        this.turnActionAttemptAtMs = HoCLib.getTimeMillis();

        if (this.shouldControlUnit(currentUnit)) {
            const actionPerformed = await this.performLocalModelAction(currentUnit, wasAIActive);
            if (actionPerformed) {
                return;
            }
        }

        // Re-assert the authoritative aura gates (Hidden / Range Null Field) from the last snapshot
        // before BOTH the spell decision AND findTarget read them. A local aura recompute
        // (refreshStackPowerForAllUnits, re-run after each AI action) can otherwise leave a stale gate,
        // so the AI proposes an action the engine rejects: a range shot from a unit the server has inside
        // a Range Null Field (attack_not_available), OR a spell cast on a unit the server has Hidden —
        // chooseBestSpell filters Hidden out of its enemy list, so a stale-un-Hidden target slips in and
        // the cast is refused (spell_not_available). Reasserting here fixes both. Nothing between this and
        // findTarget mutates aura state (a rejected/declined cast returns without applying). No-op in sandbox.
        this.context.ensureAuthoritativeAuraState?.();

        // Route production AI through the shipped learned strategy (v0.5: tuned weights + strategic
        // hourglass). This is the SAME entry point (getAIStrategy(DEFAULT_AI_VERSION).decideTurn) that
        // measured the ~68%-vs-v0.4 win rate in the sim — the client previously bypassed it via
        // AI.findTarget + local handlers. Gated so we can A/B / roll back: default ON in the browser
        // bundle (process.env is build-time-replaced; undefined → "on"), consistent with other V05_* gates.
        const USE_STRATEGY = (process.env.V05_CLIENT_AI ?? "on") !== "off";
        if (USE_STRATEGY) {
            let strategyActions: GameAction[] = [];
            try {
                strategyActions = getAIStrategy(DEFAULT_AI_VERSION).decideTurn(currentUnit, {
                    grid: this.context.getGrid(),
                    matrix: this.context.getGridMatrix(),
                    unitsHolder: this.context.getUnitsHolder(),
                    pathHelper: this.context.getPathHelper(),
                    attackHandler: this.context.getAttackHandler(),
                    fightProperties: FightStateManager.getInstance().getFightProperties(),
                });
            } catch (err) {
                // Never regress to a dead turn: a strategy throw drops us onto the proven findTarget path.
                console.error("v0.5 decideTurn threw; falling back to base AI", err);
                strategyActions = [];
            }
            // Empty plan → fall back too (decideTurn never returns [] in practice, but be defensive).
            if (
                strategyActions.length &&
                (await this.performStrategyActions(currentUnit, strategyActions, wasAIActive))
            ) {
                return;
            }
        }

        // Fallback: the pre-v0.5 spell + AI.findTarget path (kept intact for A/B, rollback, and as the
        // safety net whenever the strategy declines / throws so a turn is never left dead).
        await this.performFindTargetAction(currentUnit, wasAIActive);
    }
    /**
     * Execute a v0.5 GameAction[] plan (from decideTurn) via the same animation-preserving primitives the
     * findTarget handlers use — so ranked transport (applyGameAction / execute* route sandbox=local-engine
     * vs ranked=deferred automatically) and animations are identical to the human/handler path. Preserves
     * the exact finishAIAction / scheduleMoveWatchdog / endTurnIfStillActive discipline. Returns true when
     * the plan was taken (turn driven to completion via callbacks); false to fall back to findTarget.
     */
    private async performStrategyActions(
        currentUnit: RenderableUnit,
        actions: GameAction[],
        wasAIActive: boolean,
    ): Promise<boolean> {
        // The strike/move/etc. is the plan's payload; leading select_attack_type entries are re-derived and
        // applied via selectAttackType() inside each strike handler (so we don't double-select).
        // v0.5's meleeByPolicy emits a move+strike as a SEPARATE move_unit + in-place melee_attack (the sim
        // applies the full move handler for ~+2.5pp). Our transport drives ONE authoritative action per turn,
        // so without this we'd run only the move and the unit "walks next to the enemy but doesn't attack".
        // Fold the pair into a single path-bearing melee_attack, which executeStrategyMelee drives as one
        // move+attack in both sandbox and ranked.
        const payload = actions.filter((a) => a.type !== "select_attack_type");
        const [p0, p1] = payload;
        if (payload.length === 2 && p0?.type === "move_unit" && p1?.type === "melee_attack") {
            return this.executeStrategyMelee(
                currentUnit,
                { ...p1, path: p0.path, hasLavaCell: p0.hasLavaCell, hasWaterCell: p0.hasWaterCell },
                wasAIActive,
            );
        }
        const primary = actions.find((a) => a.type !== "select_attack_type");
        if (!primary) {
            // Only attack-type setup was emitted — apply it and end so the unit still progresses.
            for (const a of actions) {
                this.context.applyGameAction(this.modelAction(currentUnit, a));
            }
            this.endTurnIfStillActive(currentUnit);
            this.finishAIAction(wasAIActive);
            return true;
        }

        switch (primary.type) {
            case "move_unit":
                return this.executeStrategyMove(currentUnit, primary.path, primary.targetCells, wasAIActive);
            case "melee_attack":
                return this.executeStrategyMelee(currentUnit, primary, wasAIActive);
            case "range_attack":
                return this.executeStrategyRange(currentUnit, primary, wasAIActive);
            case "obstacle_attack":
                return this.executeStrategyObstacle(currentUnit, primary, wasAIActive);
            case "cast_spell": {
                // Loop guard mirrors tryCastSpell: don't re-cast for the same still-active unit (optimistic
                // ranked submit that got rejected keeps the unit active).
                if (this.spellCastAttemptUnitId === currentUnit.getId()) {
                    return false;
                }
                this.spellCastAttemptUnitId = currentUnit.getId();
                if (!this.context.applyGameAction(this.modelAction(currentUnit, primary))) {
                    return false; // engine/transport rejected — fall back to findTarget this turn
                }
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(wasAIActive);
                return true;
            }
            case "wait_turn": {
                // Loop guard: if we already submitted a wait for this STILL-active unit, the hourglass isn't
                // taking (the server refused it — the unit already waited this lap / the active unit hasn't
                // synced) and re-waiting just spins ~4s then dies as "skips turn". Recover with a real action
                // via findTarget instead of wasting the turn.
                if (this.strategyWaitAttemptUnitId === currentUnit.getId()) {
                    return false;
                }
                this.strategyWaitAttemptUnitId = currentUnit.getId();
                // Ranked submits wait_turn straight to the server WITHOUT running the local engine, so the
                // client's fightProperties never learns this unit hourglassed — canHourglass stays stale-true
                // and decideTurn re-emits wait_turn on re-up. Optimistically mirror the server's per-unit
                // hourglass flag so canHourglass is correct immediately; every authoritative snapshot re-syncs
                // onHourglass (Sandbox restore), so this self-heals and clears next lap.
                const applied = this.context.applyGameAction(this.modelAction(currentUnit, primary));
                if (applied) {
                    currentUnit.setOnHourglass(true);
                }
                this.finishAIAction(wasAIActive);
                return true;
            }
            case "end_turn": {
                // End the turn: no animation, just submit and release the AI lock.
                this.context.applyGameAction(this.modelAction(currentUnit, primary));
                this.finishAIAction(wasAIActive);
                return true;
            }
            default: {
                // Any other engine action (e.g. defend_turn): apply generically and end.
                if (!this.context.applyGameAction(this.modelAction(currentUnit, primary))) {
                    return false;
                }
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(wasAIActive);
                return true;
            }
        }
    }
    /**
     * Drive a strategy move_unit via executeMoveSequence. Mirrors handleMoveOnly's completion/watchdog
     * discipline, but consumes the strategy-supplied path + footprint directly (no re-derivation).
     */
    private executeStrategyMove(
        currentUnit: RenderableUnit,
        path: HoCMath.XY[],
        targetCells: HoCMath.XY[] | undefined,
        wasAIActive: boolean,
    ): boolean {
        if (!path?.length || !currentUnit.canMove()) {
            return false;
        }
        const moveAction = this.modelAction(currentUnit, {
            type: "move_unit",
            unitId: currentUnit.getId(),
            path,
            targetCells,
        });
        const isAuthoritative = this.context.isAuthoritativeAction?.(moveAction) ?? false;
        const watchdog = isAuthoritative ? undefined : this.scheduleMoveWatchdog(currentUnit, wasAIActive);
        const moveStarted = this.context.executeMoveSequence(
            currentUnit,
            path,
            targetCells,
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
            // A bare move keeps the unit ACTIVE server-side — the ranked transport never ends the turn for
            // a move (RankedPlayScene TURN_ENDING_ACTION_TYPES excludes move_unit, "keeps the unit active to
            // still strike"). executeMoveSequence's authoritative path submits the move and returns WITHOUT
            // firing onComplete, so without this the turn dangled until the server's turn timer fired
            // ("<unit> turn timed out"). End it explicitly; the follow-up end_turn is sequenced right after
            // the move (dispatch is synchronous + in order) so the server records a clean move, not a skip.
            // endTurnIfStillActive is a no-op if the move already advanced the active unit.
            this.endTurnIfStillActive(currentUnit);
            this.finishAIAction(wasAIActive);
        }
        return true;
    }
    /**
     * Drive a strategy melee_attack. With a path: move (rapid charge) then strike (mirrors
     * handleMoveAndMeleeAttack); without: strike in place (mirrors handleMeleeAttack). Guards a Hidden
     * target or a No-Melee attacker down to a plain advance/end so we never submit a doomed strike.
     */
    private async executeStrategyMelee(
        currentUnit: RenderableUnit,
        action: Extract<GameAction, { type: "melee_attack" }>,
        wasAIActive: boolean,
    ): Promise<boolean> {
        const target = this.context.getUnitsHolder().getAllUnits().get(action.targetId);
        if (!target) {
            return false;
        }
        // v0.5's excludeHiddenAttack should already keep Hidden targets out, and its planner never melees a
        // No-Melee unit — but guard anyway: downgrade to a plain advance along the planned path (or end) so
        // a stale gate can't push a rejected strike (attack_not_available / attack_type_not_available).
        if (currentUnit.hasAbilityActive("No Melee") || target.hasBuffActive("Hidden")) {
            if (action.path?.length && currentUnit.canMove()) {
                return this.executeStrategyMove(currentUnit, action.path, undefined, wasAIActive);
            }
            this.endTurnIfStillActive(currentUnit);
            this.finishAIAction(wasAIActive);
            return true;
        }
        const attackFrom = action.attackFrom ?? currentUnit.getBaseCell();
        // Select the melee stance first, exactly as the handlers do (No-Melee / MELEE_MAGIC guarded inside).
        if (this.selectAttackType(currentUnit, AttackVals.MELEE)) {
            this.context.getButtonManager().refreshButtons(true);
            this.context.refreshUnits();
        }
        const authoritativeAction = this.modelAction(currentUnit, {
            type: "melee_attack",
            attackerId: currentUnit.getId(),
            targetId: target.getId(),
            attackFrom,
            path: action.path,
        });

        if (action.path?.length) {
            // Ranked: the deferred replay drives the whole move+attack in one submit (mirror
            // handleMoveAndMeleeAttack's authoritative branch).
            if (this.context.isAuthoritativeAction?.(authoritativeAction)) {
                const completed = await this.context.executeAttackSequence(
                    currentUnit,
                    target,
                    attackFrom,
                    authoritativeAction,
                );
                if (!completed) {
                    // The server declined the move+strike (e.g. a 2x2 unit's planned landing filled after we
                    // decided, or the target shifted). Don't burn the turn as a "skips turn" — return false so
                    // performAction falls back to the base findTarget path, which advances / retargets / ends
                    // cleanly (mirrors the sim's advance-then-defend recovery). No finishAIAction here: the
                    // fallback owns turn completion (same contract as the cast_spell rejection above).
                    return false;
                }
                this.finishAIAction(wasAIActive);
                return true;
            }
            // Sandbox: animate the approach, then strike in the move's completion callback.
            const watchdog = this.scheduleMoveWatchdog(currentUnit, wasAIActive);
            const moveStarted = this.context.executeMoveSequence(
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
                            authoritativeAction,
                        );
                        if (!completed) {
                            this.endTurnIfStillActive(currentUnit);
                        }
                    } catch (err) {
                        console.error("AI strategy move-and-melee failed", err);
                        this.endTurnIfStillActive(currentUnit);
                    } finally {
                        this.finishAIAction(wasAIActive);
                    }
                },
                // replayAction MUST be undefined: this move only ANIMATES the approach. Submitting a
                // standalone move_unit here (in any authoritative/deferring scene) makes the server treat
                // the move as the unit's whole turn and SKIP the strike ("moved to (x,y)" then "skips
                // turn") — the exact regression this guards. The strike itself submits the ONE combined
                // melee_attack (WITH path) via executeAttackSequence below, so the server moves-then-
                // strikes atomically. Mirrors Sandbox.ts's proven move+melee player path (replayAction
                // undefined on the move, combined action on the strike).
                undefined, // replayAction — animate only; never submit a lone move_unit
                true, // rapidCharge — this AI walk feeds into a melee strike
            );
            if (!moveStarted) {
                clearTimeout(watchdog);
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(wasAIActive);
            }
            return true;
        }

        // No move — strike in place.
        const completed = await this.context.executeAttackSequence(
            currentUnit,
            target,
            attackFrom,
            authoritativeAction,
        );
        if (!completed) {
            // Declined in-place strike -> recover via findTarget instead of skipping (see the charge branch).
            return false;
        }
        this.finishAIAction(wasAIActive);
        return true;
    }
    /** Drive a strategy range_attack (mirror handleRangeAttack). */
    private async executeStrategyRange(
        currentUnit: RenderableUnit,
        action: Extract<GameAction, { type: "range_attack" }>,
        wasAIActive: boolean,
    ): Promise<boolean> {
        const target = this.context.getUnitsHolder().getAllUnits().get(action.targetId);
        const gs = this.context.getSceneSettings().getGridSettings();
        const attackFrom = GridMath.getCellForPosition(gs, currentUnit.getPosition());
        if (!target || !attackFrom) {
            return false;
        }
        if (this.selectAttackType(currentUnit, AttackVals.RANGE)) {
            this.context.getButtonManager().refreshButtons(true);
            this.context.refreshUnits();
        }
        const completed = await this.context.executeAttackSequence(
            currentUnit,
            target,
            attackFrom,
            this.modelAction(currentUnit, {
                type: "range_attack",
                attackerId: currentUnit.getId(),
                targetId: target.getId(),
            }),
        );
        if (!completed) {
            // Declined shot (e.g. server has the shooter in a Range Null Field) -> recover via findTarget
            // instead of skipping (see executeStrategyMelee).
            return false;
        }
        this.finishAIAction(wasAIActive);
        return true;
    }
    /** Drive a strategy obstacle_attack (mirror handleObstacleAttack). targetPosition is already world XY. */
    private executeStrategyObstacle(
        currentUnit: RenderableUnit,
        action: Extract<GameAction, { type: "obstacle_attack" }>,
        wasAIActive: boolean,
    ): boolean {
        // Mining is a melee strike (ranged units never emit this).
        if (this.selectAttackType(currentUnit, AttackVals.MELEE)) {
            this.context.getButtonManager().refreshButtons(true);
            this.context.refreshUnits();
        }
        const watchdog = this.scheduleMoveWatchdog(currentUnit, wasAIActive);
        const started = this.context.executeObstacleAttackSequence(
            currentUnit,
            action.targetPosition,
            action.attackFrom,
            () => {
                clearTimeout(watchdog);
                this.endTurnIfStillActive(currentUnit);
                this.finishAIAction(wasAIActive);
            },
        );
        if (!started) {
            clearTimeout(watchdog);
            this.endTurnIfStillActive(currentUnit);
            this.finishAIAction(wasAIActive);
        }
        return true;
    }
    /**
     * The pre-v0.5 decision path: spell heuristics + AI.findTarget + the move/attack handlers. Kept as the
     * fallback whenever the v0.5 strategy is gated off, declines, or throws — so a turn is never left dead.
     */
    private async performFindTargetAction(currentUnit: RenderableUnit, wasAIActive: boolean): Promise<void> {
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

        let actionPerformed = false;
        if (action?.actionType() === AI.AIActionType.MOVE_AND_MELEE_ATTACK) {
            actionPerformed = await this.handleMoveAndMeleeAttack(currentUnit, action, wasAIActive);
            if (actionPerformed) return; // Early return handled internally with callbacks
        } else if (action?.actionType() === AI.AIActionType.OBSTACLE_ATTACK) {
            actionPerformed = await this.handleObstacleAttack(currentUnit, action, wasAIActive);
            if (actionPerformed) return; // Early return handled internally with callbacks
        } else if (action?.actionType() === AI.AIActionType.MELEE_ATTACK) {
            actionPerformed = await this.handleMeleeAttack(currentUnit, action, wasAIActive);
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
        // Use real pathfinding (mirroring the server's enemiesCellsWithinMovementRangeForActive), NOT
        // straight-line distance: a close-as-the-crow-flies enemy can be unreachable around obstacles or
        // beyond the actual step budget, and the engine's canCastSpell rejects a Castling swap to an
        // unreachable cell — so the distance estimate made the AI fire doomed casts (spell_not_available).
        // Path on the unit-less matrix so enemy-occupied swap destinations are pathable.
        const castlingReach = new Set(
            this.context
                .getPathHelper()
                .getMovePath(
                    caster.getBaseCell(),
                    this.context.getGrid().getMatrixNoUnits(),
                    caster.getSteps(),
                    undefined,
                    caster.canFly(),
                    caster.isSmallSize(),
                    caster.canTraverseLava(),
                )
                .cells.map((c) => (c.x << 4) | c.y),
        );
        const enemiesInRange = enemies
            .filter((e) => e.isSmallSize() && castlingReach.has((e.getBaseCell().x << 4) | e.getBaseCell().y))
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
                    ).filter((a) => (isHeal ? a.canBeHealed() && a.getHp() < a.getMaxHp() : !a.hasBuffActive(name)));
                    if (benef.length) {
                        consider(benef.length * MASS_VALUE, { spellName: name });
                    }
                } else if (tt === SpellTargetType.ANY_ALLY) {
                    let target: Unit | undefined;
                    let value = 0;
                    if (isHeal) {
                        for (const a of allyCandidates) {
                            if (!a.canBeHealed()) {
                                continue; // Mechanism units (Tsar Cannon) can't be healed — don't propose a doomed cast
                            }
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
    /**
     * Farthest cell along `route` the unit can actually reach within `steps` this turn (the route is
     * planned on an unbounded path, so its tail can exceed the step budget). Used to downgrade an
     * out-of-reach move+attack to a plain advance instead of submitting a doomed strike.
     */
    private farthestReachableRouteCell(
        route: HoCMath.XY[],
        knownPaths: Map<number, IWeightedRoute[]> | undefined,
        steps: number,
    ): HoCMath.XY | undefined {
        if (!knownPaths) {
            return undefined;
        }
        let best: HoCMath.XY | undefined;
        for (const cell of route) {
            const weight = knownPaths.get((cell.x << 4) | cell.y)?.[0]?.weight;
            if (weight !== undefined && weight <= steps) {
                best = cell;
            }
        }
        return best;
    }
    private async handleMoveAndMeleeAttack(
        currentUnit: RenderableUnit,
        action: AI.IAIAction,
        wasAIActive: boolean,
    ): Promise<boolean> {
        // No-Melee units (e.g. Tsar Cannon) can never melee. If the planner produced a move+melee for
        // one — which happens when its range shot is blocked this turn so it has no usable attack — don't
        // fire the doomed select_attack_type(MELEE) + strike (both are rejected as attack_type_not_available
        // / attack_not_available). Just advance toward the planned cell so it can line up a range shot next
        // turn.
        if (currentUnit.hasAbilityActive("No Melee")) {
            const moveTo = action.cellToMove();
            if (moveTo) {
                return this.handleMoveOnly(currentUnit, action, wasAIActive, moveTo);
            }
            return false;
        }
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
        // Reachability guard: the planner picks the strike-from cell using an UNBOUNDED path (so it can
        // head toward distant targets), so attackFromCell can sit beyond this turn's step budget. A
        // move+attack there is rejected by the server as attack_not_available — and the AI re-proposes
        // it every trigger, looping until the rejection-streak escape ends the turn. If attackFrom is out
        // of reach this turn, advance toward it with a plain capped move instead of a doomed strike.
        const routeWeight = movePaths?.[0]?.weight;
        if (route && routeWeight !== undefined && routeWeight > currentUnit.getSteps()) {
            const reachable = this.farthestReachableRouteCell(route, knownPaths, currentUnit.getSteps());
            if (reachable) {
                return this.handleMoveOnly(currentUnit, action, wasAIActive, reachable);
            }
            this.endTurnIfStillActive(currentUnit);
            this.finishAIAction(wasAIActive);
            return true;
        }
        // Adjacency guard: even when attackFromCell is reachable, the planner can cap the move SHORT of
        // the target (target unreachable this turn) yet still emit a move+attack, leaving attackFrom not
        // actually adjacent to the target — which the engine rejects (attack_not_available). Detect that
        // and just advance to the reachable cell this turn; the strike lands once the unit is adjacent.
        if (route && !this.context.getGrid().areCellsAdjacent([attackFromCell], unitToAttack.getCells())) {
            return this.handleMoveOnly(currentUnit, action, wasAIActive, attackFromCell);
        }
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
                true, // rapidCharge — this AI walk feeds into a melee strike
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
     * Handle OBSTACLE_ATTACK: break the destructible center mountain. cellToAttack is the struck
     * center cell; cellToMove is the (reachable) cell to strike from. Reuses the player's
     * obstacle-attack path via the context and manages its own turn-completion in the onComplete
     * callback (the obstacle_attack itself ends the unit's turn).
     */
    private async handleObstacleAttack(
        currentUnit: RenderableUnit,
        action: AI.IAIAction,
        wasAIActive: boolean,
    ): Promise<boolean> {
        const targetCell = action.cellToAttack();
        const attackFromCell = action.cellToMove();
        if (!targetCell) return false;

        // Mining is a melee strike (ranged units never produce this action — they hold/shoot).
        if (this.selectAttackType(currentUnit, AttackVals.MELEE)) {
            this.context.getButtonManager().refreshButtons(true);
            this.context.refreshUnits();
        }
        this.context.setSelectedAttackType(currentUnit.getAttackTypeSelection());
        this.context.setCurrentActiveKnownPaths(action.currentActiveKnownPaths());

        const gs = this.context.getSceneSettings().getGridSettings();
        const targetWorldPos = GridMath.getPositionForCell(targetCell, gs.getMinX(), gs.getStep(), gs.getHalfStep());

        const aiActive = wasAIActive;
        const watchdog = this.scheduleMoveWatchdog(currentUnit, aiActive);
        const started = this.context.executeObstacleAttackSequence(currentUnit, targetWorldPos, attackFromCell, () => {
            clearTimeout(watchdog);
            // A landed strike ends the unit's turn via the engine (active unit already advanced, so
            // this is a no-op); if it somehow didn't, end it so the AI loop can't stall.
            this.endTurnIfStillActive(currentUnit);
            this.finishAIAction(aiActive);
        });
        if (!started) {
            clearTimeout(watchdog);
            this.endTurnIfStillActive(currentUnit);
            this.finishAIAction(aiActive);
        }
        return true;
    }
    /**
     * Handle MELEE_ATTACK action type (no move needed).
     */
    private async handleMeleeAttack(
        currentUnit: RenderableUnit,
        action: AI.IAIAction,
        wasAIActive: boolean,
    ): Promise<boolean> {
        // A No-Melee unit can never land this strike. If a melee plan still reached this handler (its
        // range shot was blocked this turn), advance toward the planned cell instead of submitting a
        // rejected melee — mirrors the guard in handleMoveAndMeleeAttack.
        if (currentUnit.hasAbilityActive("No Melee")) {
            const moveTo = action.cellToMove();
            if (moveTo) {
                return this.handleMoveOnly(currentUnit, action, wasAIActive, moveTo);
            }
            return false;
        }
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

        // The planner can cap a melee approach SHORT of the target (target out of reach this turn) yet
        // still label it MELEE_ATTACK with a moved attack-from cell — leaving attackFrom reachable but
        // NOT adjacent to the target, which the engine rejects (attack_not_available). Detect that and
        // just advance to the (reachable) cell this turn; the strike lands once the unit is adjacent.
        if (!this.context.getGrid().areCellsAdjacent([attackFromCell], targetUnit.getCells())) {
            return this.handleMoveOnly(currentUnit, action, wasAIActive, attackFromCell);
        }

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
    /**
     * Mirror the engine's canWaitOnHourglass so the AI never submits a wait_turn the server rejects as
     * hourglass_not_available (the unit already acted/hourglassed this round, is already queued, or is
     * its team's last unit alive).
     */
    private canHourglassWait(unit: Unit): boolean {
        const fp = FightStateManager.getInstance().getFightProperties();
        return (
            fp.getTeamUnitsAlive(unit.getTeam()) > 1 &&
            !fp.hourglassIncludes(unit.getId()) &&
            !fp.hasAlreadyMadeTurn(unit.getId()) &&
            !fp.hasAlreadyHourglass(unit.getId())
        );
    }
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
        const waitAction = this.modelAction(currentUnit, { type: "wait_turn", unitId: currentUnit.getId() });
        // canHourglassWait reads the local FightStateManager, authoritative only when the local engine
        // runs the turn (sandbox). In ranked the turn is deferred to the server, so that hourglass/turn
        // state is stale and the server rejects the wait as hourglass_not_available. Detect ranked by
        // probing whether a turn-resolving MOVE would be deferred to the authoritative server — true ONLY
        // in ranked. (Probing the wait action itself always read false — wait_turn is never in the
        // deferred set — so the gate never fired; this is the corrected check.) Skip the wait in ranked.
        const deferredToServer =
            this.context.isAuthoritativeAction?.({
                type: "move_unit",
                unitId: currentUnit.getId(),
            } as unknown as GameAction) ?? false;
        if (
            plan.bestScore <= plan.currentScore &&
            plan.bestScore < plan.coverableTargets &&
            plan.currentThreats === 0 &&
            this.auraWaitAttemptUnitId !== currentUnit.getId() &&
            !deferredToServer &&
            this.canHourglassWait(currentUnit)
        ) {
            this.auraWaitAttemptUnitId = currentUnit.getId();
            const waited = this.context.applyGameAction(waitAction);
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

        const gs = this.context.getSceneSettings().getGridSettings();
        const moveToPos = GridMath.getPositionForCell(cellToMove, gs.getMinX(), gs.getStep(), gs.getHalfStep());

        // Same 2x2 footprint correction as handleMoveAndMeleeAttack: land the large unit where the
        // silhouette shows instead of letting the move fallback mis-anchor it by one cell diagonally.
        // (Always computed — it feeds the action's targetCells regardless of whether we draw a silhouette.)
        let moveFootprint: HoCMath.XY[] | undefined;
        if (moveToPos && !currentUnit.isSmallSize()) {
            moveToPos.x -= gs.getHalfStep();
            moveToPos.y -= gs.getHalfStep();
            moveFootprint = GridMath.getCellsAroundPosition(gs, moveToPos);
        }

        const moveAction = this.modelAction(currentUnit, {
            type: "move_unit",
            unitId: currentUnit.getId(),
            path: route,
            targetCells: moveFootprint,
        });
        const isAuthoritative = this.context.isAuthoritativeAction?.(moveAction) ?? false;

        // Only paint the local "intent" silhouette for LIVE (sandbox) moves. In ranked the move is
        // deferred and the authoritative server replay actually drives the unit, so a local silhouette
        // at the AI's locally-chosen cell would linger at a cell the replayed move can differ from
        // (the mismatch a viewer sees as "silhouette here, unit goes there"). The replay path shows its
        // own destination silhouette for opponent moves; the viewer's own moves show none — matching a
        // human player and handleMoveAndMeleeAttack, which likewise skips the silhouette when authoritative.
        if (moveToPos && !isAuthoritative) {
            this.context.getHoverManager().showSilhouetteForUnit(currentUnit.getUnitProperties(), moveToPos);
        }
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
            // See executeStrategyMove: a ranked bare move never ends the turn server-side and the deferred
            // submit doesn't fire onComplete, so end the turn explicitly or the unit dangles into a timeout.
            this.endTurnIfStillActive(currentUnit);
            this.finishAIAction(wasAIActive);
        }

        return true;
    }
    private selectAttackType(unit: RenderableUnit, attackType: AttackType): boolean {
        const current = unit.getAttackTypeSelection();
        if (current === attackType) {
            return false;
        }
        // No-Melee units (e.g. Tsar Cannon) can never adopt a melee stance; the engine rejects
        // select_attack_type(MELEE/MELEE_MAGIC) for them as attack_type_not_available. Refuse it here so
        // NO caller (move+melee, melee, obstacle, ...) ever submits a doomed attack-type switch.
        if (
            (attackType === AttackVals.MELEE || attackType === AttackVals.MELEE_MAGIC) &&
            unit.hasAbilityActive("No Melee")
        ) {
            return false;
        }
        // MELEE_MAGIC units (a melee strike plus innate magic) report their melee stance as MELEE_MAGIC,
        // and their possibleAttackTypes omit plain MELEE — so submitting select_attack_type(MELEE) for
        // them is both unnecessary (they can already melee-attack) and rejected by the engine as
        // attack_type_not_available. Treat MELEE and MELEE_MAGIC as the same melee stance so the AI
        // doesn't fire a doomed attack-type switch before its (accepted) melee attack.
        if (
            (attackType === AttackVals.MELEE && current === AttackVals.MELEE_MAGIC) ||
            (attackType === AttackVals.MELEE_MAGIC && current === AttackVals.MELEE)
        ) {
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
