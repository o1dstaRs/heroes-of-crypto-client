import {
    createAIStrategy,
    DEFAULT_AI_VERSION,
    enumerateCandidates,
    FightStateManager,
    GridMath,
    HoCLib,
    SpellHelper,
    type GameAction,
    type IDecisionContext,
    type Unit,
} from "@heroesofcrypto/common";
import { snapshotBattle, restoreBattle } from "../../../heroes-of-crypto-common/src/simulation/battle_snapshot";
import { makeRng } from "../../../heroes-of-crypto-common/src/simulation/army";

import type { PremiumTurnAdvice } from "../api/premium_client";
import { runAiSearchSimulation } from "./aiSearchGuard";
import { premiumMoveDrawing } from "./PremiumTurnOverlay";

/** A player clicks move-and-melee as one attack; a standalone move cannot promise a follow-up cast or shot. */
export const premiumHumanActions = (actions: GameAction[]): GameAction[] | undefined => {
    const result: GameAction[] = [];
    let move: Extract<GameAction, { type: "move_unit" }> | undefined;
    let completed = false;
    for (const action of actions) {
        if (action.type === "end_turn" && (move || completed)) continue;
        if (completed) return undefined;
        if (action.type === "select_attack_type") {
            if (move) return undefined;
            result.push(action);
            continue;
        }
        if (action.type === "move_unit") {
            if (move) return undefined;
            move = action;
            continue;
        }
        if (move) {
            if (action.type !== "melee_attack" || action.attackerId !== move.unitId) return undefined;
            result.push({ ...action, path: move.path, hasLavaCell: move.hasLavaCell, hasWaterCell: move.hasWaterCell });
            move = undefined;
        } else result.push(action);
        completed = true;
    }
    if (move) result.push(move);
    return result;
};

/** Local sandbox advice uses the combat policy without executing actions or changing the live fight. */
export const sandboxPremiumAdvice = (unit: Unit, context: IDecisionContext, revision: number): PremiumTurnAdvice => {
    const fight = context.fightProperties!;
    const singleton = FightStateManager.getInstance();
    const previousFight = singleton.getFightProperties();
    const previousRandom = HoCLib.captureDeterministicRandomState();
    const battle = snapshotBattle(context.unitsHolder, context.grid, fight);
    const attackTypes = unit.getPossibleAttackTypes().slice();
    const selectedAttackType = unit.getAttackTypeSelection();
    return runAiSearchSimulation(() => {
        try {
            singleton.setFightProperties(fight);
            // A separate seeded stream keeps merely looking at advice from consuming combat randomness.
            HoCLib.setDeterministicRandomSource(makeRng(fight.getCurrentLap() * 65537 + revision));
            const incumbent = createAIStrategy(DEFAULT_AI_VERSION).decideTurn(unit, context);
            const { candidates } = enumerateCandidates(unit, context, incumbent, {
                maxMoveDestinations: 12,
                maxMeleePairs: 24,
                maxShotAims: 24,
                maxAreaThrowCells: 12,
                preserveAttackTargetCoverage: true,
                enrichIncumbentMetadata: true,
            });
            const score = (candidate: (typeof candidates)[number]) =>
                candidate.features.expectedKill * 1e9 + Math.max(0, candidate.features.expectedDamage) * 100;
            const ordered = [...candidates].sort(
                (a, b) => Number(b.kind === "incumbent") - Number(a.kind === "incumbent") || score(b) - score(a),
            );
            const options: PremiumTurnAdvice["options"] = [];
            const seen = new Set<string>();
            for (const candidate of ordered) {
                const actions = premiumHumanActions(candidate.actions);
                if (!actions?.length) continue;
                if (
                    actions.some((action) => {
                        if (action.type === "select_attack_type")
                            return action.attackType !== selectedAttackType && !attackTypes.includes(action.attackType);
                        if (action.type !== "cast_spell" || !action.targetId) return false;
                        const target = context.unitsHolder.getAllUnits().get(action.targetId);
                        return (
                            !target ||
                            !SpellHelper.isTargetedSpellLineOfSightClear(
                                action.spellName,
                                context.grid,
                                (cell) => GridMath.isCellWithinGrid(context.grid.getSettings(), cell),
                                unit.getBaseCell(),
                                target.getBaseCell(),
                                SpellHelper.isInterceptedThrownSpell(action.spellName)
                                    ? (id) => context.unitsHolder.getAllUnits().get(id)?.getTeam() === unit.getTeam()
                                    : undefined,
                                target.getCells(),
                            )
                        );
                    })
                )
                    continue;
                const option = { id: String(options.length), label: candidate.kind, reasons: [], actions };
                const drawing = premiumMoveDrawing(
                    option,
                    unit,
                    context.unitsHolder.getAllUnits(),
                    context.grid.getSettings(),
                );
                if (!drawing) continue;
                const identity = JSON.stringify([drawing.label, drawing.point, drawing.cells]);
                if (seen.has(identity)) continue;
                seen.add(identity);
                options.push({ ...option, actions: structuredClone(actions) });
                if (options.length === 2) break;
            }
            return {
                sequence: revision,
                lap: fight.getCurrentLap(),
                unitId: unit.getId(),
                status: options.length ? "ready" : "unavailable",
                options,
            };
        } finally {
            try {
                restoreBattle(battle, context.unitsHolder, context.grid, fight);
            } finally {
                HoCLib.restoreDeterministicRandomState(previousRandom);
                singleton.setFightProperties(previousFight);
            }
        }
    });
};
