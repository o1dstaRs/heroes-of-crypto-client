import { TeamVals, type GameEvent } from "@heroesofcrypto/common";

import { HeadlessMatchStore } from "../../src/session_store";
import type { TeamName } from "../../src/types";
import { chooseActionWithModel } from "./model_client";
import type {
    HarnessAction,
    HarnessActorConfig,
    HarnessDecisionRecord,
    HarnessMetrics,
    HarnessPhase,
    HarnessReplay,
    HarnessRunOptions,
    HarnessScenario,
    HarnessState,
} from "./types";

const teamNameFromValue = (team: number): TeamName | undefined => {
    if (team === TeamVals.LOWER) {
        return "LOWER";
    }
    if (team === TeamVals.UPPER) {
        return "UPPER";
    }
    return undefined;
};

const initialMetrics = (): HarnessMetrics => ({
    totalActions: 0,
    draftActions: 0,
    fightActions: 0,
    modelDecisions: 0,
    builtinDecisions: 0,
    fallbackDecisions: 0,
    rejectedActions: 0,
    spellCasts: 0,
    summons: 0,
    unitsKilled: 0,
    fightFinished: false,
});

const actorForTeam = (team: TeamName, lower: HarnessActorConfig, upper: HarnessActorConfig): HarnessActorConfig =>
    team === "LOWER" ? lower : upper;

const createScenario = (store: HeadlessMatchStore, scenario: HarnessScenario, matchId: string): void => {
    if (scenario === "quickstart") {
        store.createQuickstart(matchId);
    } else if (scenario === "approach") {
        store.createApproachScenario(matchId);
    } else if (scenario === "priority_targets") {
        store.createPriorityTargetScenario(matchId);
    } else if (scenario === "spell_duel") {
        store.createSpellDuelScenario(matchId);
    } else if (scenario === "summon_duel") {
        store.createSummonScenario(matchId);
    } else {
        throw new Error(`Scenario ${scenario} must be created through draft flow`);
    }
};

const eventTypesFromResult = (result: unknown): string[] => {
    if (!result || typeof result !== "object" || !("events" in result)) {
        return [];
    }
    const events = (result as { events?: GameEvent[] }).events ?? [];
    return events.map((event) => event.type);
};

const applyEventMetrics = (metrics: HarnessMetrics, result: unknown): void => {
    if (!result || typeof result !== "object" || !("events" in result)) {
        return;
    }
    const events = (result as { events?: GameEvent[] }).events ?? [];
    for (const event of events) {
        if (event.type === "spell_cast") {
            metrics.spellCasts += 1;
            metrics.unitsKilled += event.unitIdsDied.length;
        } else if (event.type === "unit_summoned") {
            metrics.summons += 1;
        } else if (event.type === "unit_attacked" || event.type === "area_attacked") {
            metrics.unitsKilled += event.unitIdsDied.length;
        } else if (event.type === "unit_destroyed") {
            metrics.unitsKilled += 1;
        } else if (event.type === "fight_finished") {
            metrics.fightFinished = true;
            metrics.winner = teamNameFromValue(event.winningTeam);
        }
    }
};

const stateVersion = (state: HarnessState): number => state.stateVersion;

const chooseBuiltinAction = (
    store: HeadlessMatchStore,
    phase: HarnessPhase,
    matchId: string,
    team: TeamName,
    actor: HarnessActorConfig,
): string => {
    if (phase === "draft") {
        return store
            .getDraftOrThrow(matchId)
            .chooseAction({ reason: "benchmark", style: actor.style, team }).actionId;
    }
    return store.getOrThrow(matchId).chooseAction({ reason: "benchmark", style: actor.style, team }).actionId;
};

const chooseHarnessAction = async (input: {
    store: HeadlessMatchStore;
    phase: HarnessPhase;
    matchId: string;
    team: TeamName;
    actor: HarnessActorConfig;
    state: HarnessState;
    legalActions: HarnessAction[];
    includeMechanicsContext: boolean;
}): Promise<{
    actionId: string;
    source: HarnessDecisionRecord["source"];
    elapsedMs: number;
    explanation?: string;
    modelError?: string;
    modelRawContent?: string;
}> => {
    const startedAt = performance.now();
    if (input.actor.controller === "model") {
        const modelChoice = await chooseActionWithModel({
            phase: input.phase,
            team: input.team,
            state: input.state,
            legalActions: input.legalActions,
            style: input.actor.style,
            modelApiBase: input.actor.modelApiBase ?? "http://127.0.0.1:9091/",
            modelName: input.actor.modelName ?? "local-model",
            timeoutMs: input.actor.timeoutMs,
            includeMechanicsContext: input.includeMechanicsContext,
        });
        if (modelChoice.actionId) {
            return {
                actionId: modelChoice.actionId,
                source: "model",
                elapsedMs: modelChoice.elapsedMs,
                explanation: modelChoice.explanation,
                modelRawContent: modelChoice.rawContent,
            };
        }

        return {
            actionId: chooseBuiltinAction(input.store, input.phase, input.matchId, input.team, input.actor),
            source: "builtin_fallback",
            elapsedMs: modelChoice.elapsedMs,
            explanation: modelChoice.error,
            modelError: modelChoice.error,
            modelRawContent: modelChoice.rawContent,
        };
    }

    return {
        actionId: chooseBuiltinAction(input.store, input.phase, input.matchId, input.team, input.actor),
        source: "builtin",
        elapsedMs: Math.round(performance.now() - startedAt),
    };
};

const recordDecision = (input: {
    decisions: HarnessDecisionRecord[];
    metrics: HarnessMetrics;
    phase: HarnessPhase;
    team: TeamName;
    actor: HarnessActorConfig;
    source: HarnessDecisionRecord["source"];
    action: HarnessAction;
    legalActionCount: number;
    state: HarnessState;
    result: unknown;
    elapsedMs: number;
    explanation?: string;
    modelError?: string;
    modelRawContent?: string;
}): void => {
    const accepted =
        !!input.result &&
        typeof input.result === "object" &&
        ("events" in input.result ? (input.result as { completed?: boolean }).completed === true : !("message" in input.result));

    input.metrics.totalActions += 1;
    if (input.phase === "draft") {
        input.metrics.draftActions += 1;
    } else {
        input.metrics.fightActions += 1;
    }
    if (input.source === "model") {
        input.metrics.modelDecisions += 1;
    } else if (input.source === "builtin_fallback") {
        input.metrics.fallbackDecisions += 1;
    } else {
        input.metrics.builtinDecisions += 1;
    }
    if (!accepted) {
        input.metrics.rejectedActions += 1;
    }
    applyEventMetrics(input.metrics, input.result);

    input.decisions.push({
        index: input.decisions.length + 1,
        phase: input.phase,
        team: input.team,
        controller: input.actor.controller,
        modelName: input.actor.modelName,
        source: input.source,
        actionId: input.action.id,
        actionKind: input.action.kind,
        summary: input.action.summary,
        legalActionCount: input.legalActionCount,
        stateVersion: stateVersion(input.state),
        accepted,
        elapsedMs: input.elapsedMs,
        explanation: input.explanation,
        modelError: input.modelError,
        modelRawContent: input.modelRawContent?.slice(0, 2000),
        rejectionReason:
            input.result && typeof input.result === "object" && "rejectionReason" in input.result
                ? String((input.result as { rejectionReason?: unknown }).rejectionReason ?? "")
                : undefined,
        message:
            input.result && typeof input.result === "object" && "message" in input.result
                ? String((input.result as { message?: unknown }).message ?? "")
                : undefined,
        eventTypes: eventTypesFromResult(input.result),
    });
};

export const runHarnessMatch = async (options: HarnessRunOptions): Promise<HarnessReplay> => {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const matchId = options.matchId ?? `mcp-harness-${startedAtMs}`;
    const store = new HeadlessMatchStore();
    const decisions: HarnessDecisionRecord[] = [];
    const metrics = initialMetrics();

    if (options.scenario === "draft") {
        const draft = store.createDraft(matchId);
        while (!draft.isComplete()) {
            if (metrics.totalActions >= options.maxActions) {
                throw new Error(`Stopped after ${options.maxActions} actions`);
            }
            const state = draft.getState();
            const team = state.activeTeams[0];
            if (!team) {
                throw new Error("Draft has no active team");
            }
            const actor = actorForTeam(team, options.lower, options.upper);
            const legalActions = draft.listLegalActions(team);
            const choice = await chooseHarnessAction({
                store,
                phase: "draft",
                matchId,
                team,
                actor,
                state,
                legalActions,
                includeMechanicsContext: options.includeMechanicsContext,
            });
            const action = legalActions.find((candidate) => candidate.id === choice.actionId);
            if (!action) {
                throw new Error(`Harness selected non-legal draft action ${choice.actionId}`);
            }
            const result = store.submitDraftAction({ matchId, team, actionId: action.id });
            recordDecision({
                decisions,
                metrics,
                phase: "draft",
                team,
                actor,
                source: choice.source,
                action,
                legalActionCount: legalActions.length,
                state,
                result,
                elapsedMs: choice.elapsedMs,
                explanation: choice.explanation,
                modelError: choice.modelError,
                modelRawContent: choice.modelRawContent,
            });
        }
    } else {
        createScenario(store, options.scenario, matchId);
    }

    let match = store.getOrThrow(matchId);
    while (match.getState().phase !== "finished") {
        if (metrics.totalActions >= options.maxActions) {
            throw new Error(`Stopped after ${options.maxActions} actions`);
        }
        const state = match.getState();
        const team = state.activeTeam;
        if (!team) {
            throw new Error("Fight has no active team");
        }
        const actor = actorForTeam(team, options.lower, options.upper);
        const legalActions = match.listLegalActions(team);
        const choice = await chooseHarnessAction({
            store,
            phase: "fight",
            matchId,
            team,
            actor,
            state,
            legalActions,
            includeMechanicsContext: options.includeMechanicsContext,
        });
        const action = legalActions.find((candidate) => candidate.id === choice.actionId);
        if (!action) {
            throw new Error(`Harness selected non-legal fight action ${choice.actionId}`);
        }
        const result = match.submitAction({ team, actionId: action.id });
        recordDecision({
            decisions,
            metrics,
            phase: "fight",
            team,
            actor,
            source: choice.source,
            action,
            legalActionCount: legalActions.length,
            state,
            result,
            elapsedMs: choice.elapsedMs,
            explanation: choice.explanation,
            modelError: choice.modelError,
            modelRawContent: choice.modelRawContent,
        });
        if (!result.completed) {
            break;
        }
        match = store.getOrThrow(matchId);
    }

    const finalState = match.getState();
    metrics.fightFinished = finalState.phase === "finished";
    metrics.winner = finalState.winner ?? metrics.winner;
    metrics.finalLap = finalState.grid.currentLap;

    const finishedAtMs = Date.now();
    return {
        version: 1,
        matchId,
        scenario: options.scenario,
        startedAt,
        finishedAt: new Date(finishedAtMs).toISOString(),
        durationMs: finishedAtMs - startedAtMs,
        actors: {
            lower: options.lower,
            upper: options.upper,
        },
        metrics,
        decisions,
        finalState,
    };
};
