import { HeadlessDraft } from "./draft";
import { HeadlessMatch } from "./headless_match";
import type { AIDraftDecision, AIReason, AIStyle, PlayAiDraftResult, SubmitDraftActionResult, TeamName } from "./types";

export class HeadlessMatchStore {
    private activeDraft: HeadlessDraft | undefined;
    private activeMatch: HeadlessMatch | undefined;
    public createDraft(matchId?: string): HeadlessDraft {
        this.activeDraft = new HeadlessDraft({ matchId });
        this.activeMatch = undefined;
        return this.activeDraft;
    }
    public createQuickstart(matchId?: string): HeadlessMatch {
        this.activeDraft = undefined;
        this.activeMatch = HeadlessMatch.createQuickstart({ matchId });
        return this.activeMatch;
    }
    public createApproachScenario(matchId?: string): HeadlessMatch {
        this.activeDraft = undefined;
        this.activeMatch = HeadlessMatch.createApproachScenario({ matchId });
        return this.activeMatch;
    }
    public createPriorityTargetScenario(matchId?: string): HeadlessMatch {
        this.activeDraft = undefined;
        this.activeMatch = HeadlessMatch.createPriorityTargetScenario({ matchId });
        return this.activeMatch;
    }
    public createSpellDuelScenario(matchId?: string): HeadlessMatch {
        this.activeDraft = undefined;
        this.activeMatch = HeadlessMatch.createSpellDuelScenario({ matchId });
        return this.activeMatch;
    }
    public createSummonScenario(matchId?: string): HeadlessMatch {
        this.activeDraft = undefined;
        this.activeMatch = HeadlessMatch.createSummonScenario({ matchId });
        return this.activeMatch;
    }
    public getDraft(matchId: string): HeadlessDraft | undefined {
        return this.activeDraft?.getId() === matchId ? this.activeDraft : undefined;
    }
    public getDraftOrThrow(matchId: string): HeadlessDraft {
        const draft = this.getDraft(matchId);
        if (!draft) {
            throw new Error(`Unknown draft ${matchId}. Create a draft first.`);
        }
        return draft;
    }
    public submitDraftAction(input: { matchId: string; team: TeamName; actionId: string }): SubmitDraftActionResult {
        const draft = this.getDraftOrThrow(input.matchId);
        const result = draft.submitAction({ team: input.team, actionId: input.actionId });
        if (result.completed) {
            const match = HeadlessMatch.createFromDraft({
                matchId: draft.getId(),
                lowerCreatures: draft.getPickedCreatures("LOWER"),
                upperCreatures: draft.getPickedCreatures("UPPER"),
            });
            this.activeMatch = match;
            result.completedMatch = match.getState();
        }
        return result;
    }
    public playAiDraft(options: {
        matchId: string;
        reason: AIReason;
        style?: AIStyle;
        team?: TeamName;
        maxActions?: number;
    }): PlayAiDraftResult {
        const draft = this.getDraftOrThrow(options.matchId);
        const maxActions = options.maxActions ?? 16;
        const decisions: AIDraftDecision[] = [];
        const actionResults: SubmitDraftActionResult[] = [];

        for (let i = 0; i < maxActions; i++) {
            const state = draft.getState();
            if (state.phase === "complete") {
                return {
                    completed: true,
                    team: options.team,
                    stoppedReason: "draft_complete",
                    decisions,
                    actionResults,
                    state,
                    completedMatch: this.get(options.matchId)?.getState(),
                };
            }

            const activeTeam = state.activeTeams[0];
            if (!activeTeam) {
                return {
                    completed: false,
                    team: options.team,
                    stoppedReason: "no_legal_actions",
                    decisions,
                    actionResults,
                    state,
                };
            }
            if (options.team && activeTeam !== options.team) {
                return {
                    completed: false,
                    team: options.team,
                    stoppedReason: "wrong_team",
                    decisions,
                    actionResults,
                    state,
                };
            }

            const legalActions = draft.listLegalActions(activeTeam);
            if (!legalActions.length) {
                return {
                    completed: false,
                    team: activeTeam,
                    stoppedReason: "no_legal_actions",
                    decisions,
                    actionResults,
                    state,
                };
            }

            const decision = draft.chooseAction({
                reason: options.reason,
                style: options.style,
                team: activeTeam,
            });
            const result = this.submitDraftAction({
                matchId: options.matchId,
                team: activeTeam,
                actionId: decision.actionId,
            });
            decisions.push(decision);
            actionResults.push(result);

            if (result.message) {
                return {
                    completed: false,
                    team: activeTeam,
                    stoppedReason: "action_rejected",
                    decisions,
                    actionResults,
                    state: result.state,
                    completedMatch: result.completedMatch,
                };
            }
            if (result.completed) {
                return {
                    completed: true,
                    team: activeTeam,
                    stoppedReason: "draft_complete",
                    decisions,
                    actionResults,
                    state: result.state,
                    completedMatch: result.completedMatch,
                };
            }
        }

        return {
            completed: false,
            team: options.team,
            stoppedReason: "max_actions",
            decisions,
            actionResults,
            state: draft.getState(),
            completedMatch: this.get(options.matchId)?.getState(),
        };
    }
    public get(matchId: string): HeadlessMatch | undefined {
        return this.activeMatch?.getId() === matchId ? this.activeMatch : undefined;
    }
    public getOrThrow(matchId: string): HeadlessMatch {
        const match = this.get(matchId);
        if (!match) {
            throw new Error(`Unknown match ${matchId}. Create a match first.`);
        }
        return match;
    }
}
