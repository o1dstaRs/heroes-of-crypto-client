import {
    getAbilityReference,
    getSpellReference,
    getSynergyReference,
    getStrategyPrimer,
    getUnitRoster,
    RULES_SUMMARY,
} from "../../src/resources";
import type { TeamName } from "../../src/types";
import { extractActionIdFromModelContent } from "./action_selection";
import { fetchOpenAiChatContent, normalizeOpenAiBaseUrl } from "./openai_base";
import { buildModelChoicePrompt } from "./prompt_builder";
import type { HarnessAction, HarnessPhase, HarnessState, HarnessStyle } from "./types";

interface ChooseInput {
    phase: HarnessPhase;
    team: TeamName;
    state: HarnessState;
    legalActions: HarnessAction[];
    style: HarnessStyle;
    modelApiBase: string;
    modelName: string;
    timeoutMs: number;
    includeMechanicsContext: boolean;
}

export interface ModelChoice {
    actionId?: string;
    explanation?: string;
    elapsedMs: number;
    rawContent?: string;
    error?: string;
}

const compactAction = (action: HarnessAction): Record<string, unknown> => ({
    id: action.id,
    kind: action.kind,
    team: action.team,
    summary: action.summary,
    tacticalTags: action.tacticalTags,
    risks: action.risks,
    evaluation: action.evaluation,
});

const resolveModelName = async (modelApiBase: string, requestedModelName: string): Promise<string> => {
    if (requestedModelName && requestedModelName !== "auto") {
        return requestedModelName;
    }

    const response = await fetch(`${modelApiBase}/models`);
    if (!response.ok) {
        return requestedModelName || "local-model";
    }
    const body = (await response.json()) as {
        data?: Array<{ id?: string; active?: boolean; installed?: boolean }>;
    };
    return (
        body.data?.find((model) => model.active && model.id)?.id ??
        body.data?.find((model) => model.installed && model.id)?.id ??
        body.data?.find((model) => model.id)?.id ??
        requestedModelName ??
        "local-model"
    );
};

const createSessionId = (): string => `hoc-mcp-${Date.now()}-${crypto.randomUUID()}`;

const filterRecordByKeys = (record: unknown, keys: Set<string>): Record<string, unknown> => {
    if (!record || typeof record !== "object") {
        return {};
    }
    return Object.fromEntries(
        Object.entries(record as Record<string, unknown>).filter(([key]) => keys.has(key) || keys.has(key.toLowerCase())),
    );
};

const filterSpells = (record: unknown, spellNames: Set<string>): Record<string, unknown> => {
    if (!record || typeof record !== "object") {
        return {};
    }

    const ret: Record<string, unknown> = {};
    for (const [school, spells] of Object.entries(record as Record<string, unknown>)) {
        if (!spells || typeof spells !== "object") {
            continue;
        }
        const filtered = Object.fromEntries(
            Object.entries(spells as Record<string, unknown>).filter(([spell]) => spellNames.has(spell)),
        );
        if (Object.keys(filtered).length) {
            ret[school] = filtered;
        }
    }
    return ret;
};

export const buildMechanicsContext = (input: {
    state: HarnessState;
    legalActions: HarnessAction[];
}): Record<string, unknown> => {
    const actionPayload = input.legalActions.map(compactAction);
    const searchText = JSON.stringify({ state: input.state, legalActions: actionPayload }).toLowerCase();
    const relevantUnits = getUnitRoster()
        .filter((unit) => searchText.includes(unit.name.toLowerCase()))
        .slice(0, 80);
    const abilityNames = new Set<string>();
    const spellNames = new Set<string>();

    for (const unit of relevantUnits) {
        for (const ability of unit.abilities) {
            abilityNames.add(ability);
            abilityNames.add(ability.toLowerCase());
        }
        for (const spell of unit.spells) {
            const [, spellName = spell] = spell.split(":");
            spellNames.add(spellName);
        }
    }
    const synergies = getSynergyReference();

    return {
        rulesSummary: RULES_SUMMARY,
        strategyPrimer: getStrategyPrimer(),
        relevantUnits,
        relevantAbilities: filterRecordByKeys(getAbilityReference(), abilityNames),
        relevantSpells: filterSpells(getSpellReference(), spellNames),
        synergies: {
            thresholds: synergies.thresholds,
            factions: synergies.factions,
            notes: synergies.notes,
        },
    };
};

export const chooseActionWithModel = async (input: ChooseInput): Promise<ModelChoice> => {
    const startedAt = performance.now();
    if (process.env.HOC_MODEL_DISABLED === "1") {
        return {
            elapsedMs: Math.round(performance.now() - startedAt),
            error: "model_disabled",
        };
    }

    const modelApiBase = normalizeOpenAiBaseUrl(input.modelApiBase);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
        const modelName = await resolveModelName(modelApiBase, input.modelName);
        const { content: rawContent } = await fetchOpenAiChatContent({
            modelApiBase,
            signal: controller.signal,
            body: {
                model: modelName,
                session_id: createSessionId(),
                temperature: Number(process.env.HOC_MODEL_TEMPERATURE ?? 0),
                max_tokens: 220,
                enable_thinking: false,
                messages: [
                    {
                        role: "user",
                        content: buildModelChoicePrompt({
                            phase: input.phase,
                            team: input.team,
                            style: input.style,
                            state: input.state,
                            legalActions: input.legalActions,
                            includeMechanicsContext: input.includeMechanicsContext,
                        }),
                    },
                ],
            },
        });
        const { actionId, explanation } = extractActionIdFromModelContent(rawContent, input.legalActions);
        const legalActionId = actionId && input.legalActions.some((action) => action.id === actionId) ? actionId : undefined;
        return {
            actionId: legalActionId,
            explanation,
            rawContent,
            elapsedMs: Math.round(performance.now() - startedAt),
            error: legalActionId ? undefined : "invalid_action_id",
        };
    } catch (err) {
        return {
            elapsedMs: Math.round(performance.now() - startedAt),
            error: (err as Error).message,
        };
    } finally {
        clearTimeout(timeout);
    }
};
