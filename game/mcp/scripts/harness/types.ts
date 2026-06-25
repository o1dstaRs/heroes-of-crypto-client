import type {
    DraftAction,
    LegalAction,
    PublicDraftState,
    PublicMatchState,
    SubmitActionResult,
    SubmitDraftActionResult,
    TeamName,
} from "../../src/types";

export type HarnessPhase = "draft" | "fight";
export type HarnessControllerKind = "builtin" | "model";
export type HarnessScenario = "draft" | "quickstart" | "approach" | "priority_targets" | "spell_duel" | "summon_duel";
export type HarnessStyle = "balanced" | "aggressive" | "defensive";
export type HarnessAction = DraftAction | LegalAction;
export type HarnessState = PublicDraftState | PublicMatchState;
export type HarnessActionResult = SubmitDraftActionResult | SubmitActionResult;

export interface HarnessActorConfig {
    team: TeamName;
    controller: HarnessControllerKind;
    modelName?: string;
    modelApiBase?: string;
    style: HarnessStyle;
    timeoutMs: number;
}

export interface HarnessRunOptions {
    matchId?: string;
    scenario: HarnessScenario;
    lower: HarnessActorConfig;
    upper: HarnessActorConfig;
    maxActions: number;
    includeMechanicsContext: boolean;
}

export interface HarnessDecisionRecord {
    index: number;
    phase: HarnessPhase;
    team: TeamName;
    controller: HarnessControllerKind;
    modelName?: string;
    source: "model" | "builtin_fallback" | "builtin";
    actionId: string;
    actionKind: string;
    summary: string;
    legalActionCount: number;
    stateVersion: number;
    accepted: boolean;
    elapsedMs: number;
    explanation?: string;
    modelError?: string;
    modelRawContent?: string;
    rejectionReason?: string;
    message?: string;
    eventTypes: string[];
}

export interface HarnessMetrics {
    totalActions: number;
    draftActions: number;
    fightActions: number;
    modelDecisions: number;
    builtinDecisions: number;
    fallbackDecisions: number;
    rejectedActions: number;
    spellCasts: number;
    summons: number;
    unitsKilled: number;
    fightFinished: boolean;
    winner?: TeamName;
    finalLap?: number;
}

export interface HarnessReplay {
    version: 1;
    matchId: string;
    scenario: HarnessScenario;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    actors: {
        lower: HarnessActorConfig;
        upper: HarnessActorConfig;
    };
    metrics: HarnessMetrics;
    decisions: HarnessDecisionRecord[];
    finalState: PublicMatchState;
}
