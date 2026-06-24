import type { AITurnDecision, AITurnRequest, GameAIPlayer, LegalAction } from "./types";

export const scoreAction = (action: LegalAction, style: AITurnRequest["style"]): number => {
    let score = 0;

    if (action.kind === "range_attack") {
        score += 110;
    } else if (action.kind === "melee_attack") {
        score += 100;
    } else if (action.kind === "cast_spell") {
        score += 105;
    } else if (action.kind === "select_attack_type") {
        score += 60;
    } else if (action.kind === "move_unit") {
        score += 65;
    } else if (action.kind === "defend_turn") {
        score += style === "defensive" ? 75 : 25;
    } else if (action.kind === "wait_turn") {
        score += style === "defensive" ? 70 : 20;
    } else if (action.kind === "end_turn") {
        score += 5;
    }

    if (style === "aggressive" && action.tacticalTags.includes("damage")) {
        score += 25;
    }
    if (style === "balanced" && action.risks.length === 0) {
        score += 5;
    }
    if (action.evaluation?.priorityScore) {
        score += action.evaluation.priorityScore;
    }
    if (action.evaluation?.damage?.killsTarget) {
        score += style === "defensive" ? 35 : 55;
    }
    if (action.evaluation?.targetValue) {
        score += Math.round(action.evaluation.targetValue * 0.35);
    }
    if (action.evaluation?.spell?.estimatedValue) {
        score += action.evaluation.spell.estimatedValue;
    }
    if (style === "defensive" && action.evaluation?.retaliation) {
        score -= 20;
    }

    return score;
};

export class RuleBasedModelAI implements GameAIPlayer {
    public chooseAction(request: AITurnRequest): AITurnDecision {
        if (!request.legalActions.length) {
            throw new Error(`No legal actions are available for ${request.team}`);
        }

        const style = request.style ?? "balanced";
        const action = [...request.legalActions].sort((left, right) => {
            const scoreDelta = scoreAction(right, style) - scoreAction(left, style);
            if (scoreDelta !== 0) {
                return scoreDelta;
            }
            return left.id.localeCompare(right.id);
        })[0];

        return {
            actionId: action.id,
            action: action.action,
            confidence: Math.min(0.95, Math.max(0.35, scoreAction(action, style) / 140)),
            explanation: action.summary,
        };
    }
}
