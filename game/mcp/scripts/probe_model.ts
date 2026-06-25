#!/usr/bin/env bun
import { HeadlessMatchStore } from "../src/session_store";
import { extractActionIdFromModelContent } from "./harness/action_selection";
import { fetchOpenAiChatContent, normalizeOpenAiBaseUrl } from "./harness/openai_base";
import { buildModelChoicePrompt } from "./harness/prompt_builder";

const modelApiBase = normalizeOpenAiBaseUrl(process.env.HOC_MODEL_API_BASE || "http://127.0.0.1:9091/");
const requestedModelName = process.env.HOC_MODEL_NAME || "auto";
const timeoutMs = Number(process.env.HOC_MODEL_TIMEOUT_MS ?? 20000);

const resolveModelName = async (): Promise<string> => {
    if (requestedModelName !== "auto") {
        return requestedModelName;
    }

    const response = await fetch(`${modelApiBase}/models`);
    if (!response.ok) {
        throw new Error(`/models returned HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
        data?: Array<{ id?: string; active?: boolean; installed?: boolean }>;
    };
    const model =
        body.data?.find((candidate) => candidate.active && candidate.id)?.id ??
        body.data?.find((candidate) => candidate.installed && candidate.id)?.id ??
        body.data?.find((candidate) => candidate.id)?.id;
    if (!model) {
        throw new Error("/models returned no model ids");
    }
    return model;
};

const createSessionId = (suffix: string): string => `hoc-probe-${suffix}-${Date.now()}-${crypto.randomUUID()}`;

const complete = async (model: string, prompt: string, maxTokens: number): Promise<string> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const { content } = await fetchOpenAiChatContent({
            modelApiBase,
            signal: controller.signal,
            body: {
                model,
                session_id: createSessionId(String(maxTokens)),
                messages: [{ role: "user", content: prompt }],
                max_tokens: maxTokens,
                temperature: Number(process.env.HOC_MODEL_TEMPERATURE ?? 0),
                enable_thinking: false,
            },
        });
        return content;
    } finally {
        clearTimeout(timeout);
    }
};

try {
    const modelName = await resolveModelName();
    const controlContent = await complete(modelName, 'Reply exactly with this JSON and nothing else: {"actionIndex":1}', 40);

    const store = new HeadlessMatchStore();
    const match = store.createQuickstart(`probe-${Date.now()}`);
    const state = match.getState();
    const legalActions = match.listLegalActions("LOWER");
    const prompt = buildModelChoicePrompt({
        phase: "fight",
        team: "LOWER",
        style: "balanced",
        state,
        legalActions,
        includeMechanicsContext: true,
    });
    const choiceContent = await complete(modelName, prompt, 80);
    const parsedChoice = extractActionIdFromModelContent(choiceContent, legalActions);
    const chosenAction = legalActions.find((action) => action.id === parsedChoice.actionId);

    const result = {
        apiBase: modelApiBase,
        model: modelName,
        control: {
            ok: /"actionIndex"\s*:\s*1/.test(controlContent),
            rawContent: controlContent.slice(0, 500),
        },
        legalChoice: {
            ok: !!chosenAction,
            actionSummary: chosenAction?.summary,
            rawContent: choiceContent.slice(0, 500),
        },
    };

    console.log(JSON.stringify(result, null, 2));
    process.exit(result.legalChoice.ok ? 0 : 2);
} catch (err) {
    console.log(
        JSON.stringify(
            {
                apiBase: modelApiBase,
                model: requestedModelName,
                error: (err as Error).message,
            },
            null,
            2,
        ),
    );
    process.exit(1);
}
