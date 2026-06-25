#!/usr/bin/env bun
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { HeadlessMatchStore } from "../src/session_store";
import type { DraftAction, LegalAction, PublicDraftState, PublicMatchState, TeamName } from "../src/types";
import { extractActionIdFromModelContent } from "./harness/action_selection";
import { fetchOpenAiChatContent, normalizeOpenAiBaseUrl } from "./harness/openai_base";
import { buildModelChoicePrompt } from "./harness/prompt_builder";

type AnyAction = DraftAction | LegalAction;

const args = new Set(Bun.argv.slice(2));
const autoHuman = args.has("--auto-human") || process.env.HOC_AUTO_HUMAN === "1";
const maxActionsArg = Bun.argv.find((arg) => arg.startsWith("--max-actions="));
const maxActions = maxActionsArg ? Number(maxActionsArg.split("=")[1]) : Number(process.env.HOC_MAX_ACTIONS ?? 500);
const modelApiBase = normalizeOpenAiBaseUrl(process.env.HOC_MODEL_API_BASE || "http://127.0.0.1:9091/");
const modelName = process.env.HOC_MODEL_NAME || "auto";
const style = (process.env.HOC_AI_STYLE || "balanced") as "balanced" | "aggressive" | "defensive";
const humanTeam = (process.env.HOC_HUMAN_TEAM || "LOWER") as TeamName;
const modelTeam = humanTeam === "LOWER" ? "UPPER" : "LOWER";
const requestTimeoutMs = Number(process.env.HOC_MODEL_TIMEOUT_MS ?? 20000);

const rl = createInterface({ input, output });

const usage = (): void => {
    console.log(`Usage: bun scripts/model-opponent.ts play [--auto-human] [--max-actions=N]

Environment:
  HOC_MODEL_API_BASE     OpenAI-compatible API base or server root. Default: http://127.0.0.1:9091/
  HOC_MODEL_NAME         Model name sent to /chat/completions. Default: auto
  HOC_HUMAN_TEAM         LOWER or UPPER. Default: LOWER
  HOC_AI_STYLE           balanced, aggressive, defensive. Default: balanced
  HOC_MODEL_DISABLED     1 to skip model HTTP calls and use the built-in scorer
`);
};

const resolveModelName = async (): Promise<string> => {
    if (modelName !== "auto") {
        return modelName;
    }

    const response = await fetch(`${modelApiBase}/models`);
    if (!response.ok) {
        return "local-model";
    }
    const body = (await response.json()) as {
        data?: Array<{ id?: string; active?: boolean; installed?: boolean }>;
    };
    return (
        body.data?.find((model) => model.active && model.id)?.id ??
        body.data?.find((model) => model.installed && model.id)?.id ??
        body.data?.find((model) => model.id)?.id ??
        "local-model"
    );
};

const createSessionId = (): string => `hoc-opponent-${Date.now()}-${crypto.randomUUID()}`;

const chooseWithModel = async (inputData: {
    phase: "draft" | "fight";
    team: TeamName;
    state: PublicDraftState | PublicMatchState;
    legalActions: AnyAction[];
}): Promise<string | undefined> => {
    if (process.env.HOC_MODEL_DISABLED === "1") {
        return undefined;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
        const resolvedModelName = await resolveModelName();
        const { content } = await fetchOpenAiChatContent({
            modelApiBase,
            signal: controller.signal,
            body: {
                model: resolvedModelName,
                session_id: createSessionId(),
                temperature: Number(process.env.HOC_MODEL_TEMPERATURE ?? 0),
                max_tokens: 220,
                enable_thinking: false,
                messages: [
                    {
                        role: "user",
                        content: buildModelChoicePrompt({
                            phase: inputData.phase,
                            team: inputData.team,
                            style,
                            state: inputData.state,
                            legalActions: inputData.legalActions,
                            includeMechanicsContext: true,
                        }),
                    },
                ],
            },
        });
        const actionId = extractActionIdFromModelContent(content, inputData.legalActions).actionId;
        if (actionId && inputData.legalActions.some((action) => action.id === actionId)) {
            return actionId;
        }
        console.warn("model did not return a legal actionId; using built-in scorer");
        return undefined;
    } catch (err) {
        console.warn(`model request failed: ${(err as Error).message}; using built-in scorer`);
        return undefined;
    } finally {
        clearTimeout(timeout);
    }
};

const chooseFromPrompt = async (legalActions: AnyAction[]): Promise<string> => {
    for (const [index, action] of legalActions.entries()) {
        console.log(`${index + 1}. ${action.summary}`);
    }

    while (true) {
        const answer = (await rl.question("Choose action number or actionId: ")).trim();
        const asNumber = Number(answer);
        if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= legalActions.length) {
            return legalActions[asNumber - 1].id;
        }
        if (legalActions.some((action) => action.id === answer)) {
            return answer;
        }
        console.log("Invalid action. Choose one of the listed legal actions.");
    }
};

const printDraftState = (state: PublicDraftState): void => {
    console.log(
        `\nDraft ${state.matchId}: ${state.draftPhase} active=${state.activeTeams.join(",") || "none"} ` +
            `lower=${state.lower.picked.length} upper=${state.upper.picked.length} bans=${state.banned.length}`,
    );
};

const printMatchState = (state: PublicMatchState): void => {
    console.log(`\nFight ${state.matchId}: ${state.phase} active=${state.activeTeam ?? "none"} lap=${state.grid.currentLap}`);
    for (const unit of state.units) {
        console.log(
            `  ${unit.team} ${unit.name} hp=${unit.hp}/${unit.maxHp} alive=${unit.amountAlive} cells=${unit.cells
                .map((cell) => `${cell.x}:${cell.y}`)
                .join(",")}`,
        );
    }
};

const run = async (): Promise<void> => {
    if (args.has("-h") || args.has("--help") || args.has("help")) {
        usage();
        return;
    }

    console.log(`Model opponent: ${modelName} at ${modelApiBase}`);
    console.log(`Human team: ${humanTeam}; model team: ${modelTeam}; style: ${style}`);

    const store = new HeadlessMatchStore();
    const matchId = `local-model-${Date.now()}`;
    const draft = store.createDraft(matchId);
    let actionsTaken = 0;

    while (!draft.isComplete()) {
        if (actionsTaken++ > maxActions) {
            throw new Error(`Stopped after ${maxActions} actions`);
        }

        const state = draft.getState();
        const activeTeam = state.activeTeams[0];
        if (!activeTeam) {
            throw new Error("Draft has no active team");
        }

        printDraftState(state);
        const legalActions = draft.listLegalActions(activeTeam);
        let actionId: string;
        if (activeTeam === modelTeam || autoHuman) {
            actionId =
                (await chooseWithModel({ phase: "draft", team: activeTeam, state, legalActions })) ??
                draft.chooseAction({ reason: "pc_opponent", style, team: activeTeam }).actionId;
            console.log(`${activeTeam} chooses ${legalActions.find((action) => action.id === actionId)?.summary}`);
        } else {
            actionId = await chooseFromPrompt(legalActions);
        }

        const result = store.submitDraftAction({ matchId, team: activeTeam, actionId });
        if (result.message) {
            throw new Error(result.message);
        }
    }

    let match = store.getOrThrow(matchId);
    while (match.getState().phase !== "finished") {
        if (actionsTaken++ > maxActions) {
            throw new Error(`Stopped after ${maxActions} actions`);
        }

        const state = match.getState();
        const activeTeam = state.activeTeam;
        if (!activeTeam) {
            throw new Error("Fight has no active team");
        }

        printMatchState(state);
        const legalActions = match.listLegalActions(activeTeam);
        let actionId: string;
        if (activeTeam === modelTeam || autoHuman) {
            actionId =
                (await chooseWithModel({ phase: "fight", team: activeTeam, state, legalActions })) ??
                match.chooseAction({ reason: "pc_opponent", style, team: activeTeam }).actionId;
            console.log(`${activeTeam} chooses ${legalActions.find((action) => action.id === actionId)?.summary}`);
        } else {
            actionId = await chooseFromPrompt(legalActions);
        }

        const result = match.submitAction({ team: activeTeam, actionId });
        if (!result.completed) {
            throw new Error(result.message || result.rejectionReason || "Action was rejected");
        }
        match = store.getOrThrow(matchId);
    }

    const finalState = match.getState();
    printMatchState(finalState);
    console.log(`Winner: ${finalState.winner ?? "none"}`);
};

try {
    await run();
} finally {
    rl.close();
}
