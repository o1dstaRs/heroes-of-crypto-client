import type {
    AIDraftDecision,
    AIDraftRequest,
    AITurnDecision,
    AITurnRequest,
    DraftAction,
    GameAIPlayer,
    LegalAction,
} from "./types";

const PREMIUM_RANGED_THREATS = ["Tsar Cannon", "Gargantuan"];
const MAX_DRAFT_RANGED_UNITS = 3;

const isPremiumRangedDraftAction = (action: DraftAction): boolean =>
    PREMIUM_RANGED_THREATS.some((name) => action.summary.includes(name) || action.evaluation.notes.includes(name));

const isDraftPickAction = (action: DraftAction): boolean =>
    action.kind === "pick_unit" || action.kind === "pick_initial_pair";

const isDraftCreatureRanged = (creature: AIDraftRequest["state"]["lower"]["picked"][number]): boolean =>
    creature.attackRange > 1 || creature.attackType === "range" || creature.rangeShots > 0;

const ownRangedCount = (request: Pick<AIDraftRequest, "state" | "team">): number => {
    const picked = request.team === "LOWER" ? request.state.lower.picked : request.state.upper.picked;
    return picked.filter(isDraftCreatureRanged).length;
};

const actionRangedCount = (action: DraftAction): number =>
    action.evaluation.rangedCount ?? (action.tacticalTags.includes("ranged") ? 1 : 0);

const draftRangedBalanceScore = (action: DraftAction, request?: Pick<AIDraftRequest, "state" | "team">): number => {
    if (!request || !isDraftPickAction(action)) {
        return 0;
    }

    const currentRanged = ownRangedCount(request);
    const addedRanged = actionRangedCount(action);
    if (addedRanged <= 0) {
        return currentRanged >= 2 ? 85 : 0;
    }

    const afterPickRanged = currentRanged + addedRanged;
    if (afterPickRanged > MAX_DRAFT_RANGED_UNITS) {
        return -10000;
    }
    if (afterPickRanged === MAX_DRAFT_RANGED_UNITS && !isPremiumRangedDraftAction(action)) {
        return -65;
    }
    return 0;
};

const capAwareDraftActions = (request: AIDraftRequest): DraftAction[] => {
    const viableActions = request.legalActions.filter(
        (action) =>
            !isDraftPickAction(action) || ownRangedCount(request) + actionRangedCount(action) <= MAX_DRAFT_RANGED_UNITS,
    );
    return viableActions.length ? viableActions : request.legalActions;
};

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

export const scoreDraftAction = (
    action: DraftAction,
    style: AIDraftRequest["style"],
    request?: Pick<AIDraftRequest, "state" | "team">,
): number => {
    let score = action.evaluation.value;

    if (action.kind === "pick_initial_pair") {
        score += 80;
    } else if (action.kind === "pick_unit") {
        score += 70;
    } else if (action.kind === "ban_unit") {
        score += action.evaluation.deniesOpponent ? 68 : 48;
    } else if (action.kind === "reveal") {
        score += 20;
    }

    if (action.kind === "pick_unit" && action.tacticalTags.includes("ranged")) {
        score += 42;
    }
    if (action.kind === "pick_initial_pair" && action.tacticalTags.includes("ranged")) {
        score += 28;
    }
    if (action.kind === "ban_unit" && action.tacticalTags.includes("ranged")) {
        score += 30;
    }
    if (isPremiumRangedDraftAction(action)) {
        score += action.kind === "ban_unit" ? 95 : 120;
    }

    if (style === "aggressive") {
        if (action.tacticalTags.includes("damage")) {
            score += 18;
        }
        if (action.tacticalTags.includes("ranged") || action.tacticalTags.includes("caster")) {
            score += 12;
        }
    }
    if (style === "defensive") {
        if (action.tacticalTags.includes("durable")) {
            score += 18;
        }
        if (action.risks.length) {
            score -= 8;
        }
    }
    if (style === "balanced" && !action.risks.length) {
        score += 6;
    }
    score += draftRangedBalanceScore(action, request);

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

export class RuleBasedDraftAI {
    public chooseDraftAction(request: AIDraftRequest): AIDraftDecision {
        if (!request.legalActions.length) {
            throw new Error(`No legal draft actions are available for ${request.team}`);
        }

        const style = request.style ?? "balanced";
        const action = [...capAwareDraftActions(request)].sort((left, right) => {
            const scoreDelta = scoreDraftAction(right, style, request) - scoreDraftAction(left, style, request);
            if (scoreDelta !== 0) {
                return scoreDelta;
            }
            return left.id.localeCompare(right.id);
        })[0];

        return {
            actionId: action.id,
            action,
            confidence: Math.min(0.95, Math.max(0.35, scoreDraftAction(action, style, request) / 180)),
            explanation: action.summary,
        };
    }
}
