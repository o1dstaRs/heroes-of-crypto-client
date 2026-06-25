export interface SelectableAction {
    id: string;
    kind: string;
    summary: string;
    tacticalTags?: string[];
    risks?: string[];
    evaluation?: unknown;
}

export const actionLabel = (index: number): string => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return alphabet[index] ?? String(index + 1);
};

export const actionChoices = (actions: SelectableAction[]): Array<{
    label: string;
    index: number;
    kind: string;
    summary: string;
    tacticalTags?: string[];
    risks?: string[];
    evaluation?: unknown;
}> =>
    actions.map((action, index) => ({
        label: actionLabel(index),
        index: index + 1,
        kind: action.kind,
        summary: action.summary,
        tacticalTags: action.tacticalTags?.length ? action.tacticalTags : undefined,
        risks: action.risks?.length ? action.risks : undefined,
        evaluation: action.evaluation,
    }));

const normalize = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

const tokens = (value: string): string[] =>
    normalize(value)
        .split(/\s+/)
        .filter((token) => token.length > 2 && !["the", "and", "for", "with", "only", "json"].includes(token));

const actionByIndex = (actions: SelectableAction[], value: unknown): string | undefined => {
    const index = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
    return Number.isInteger(index) && index >= 1 && index <= actions.length ? actions[index - 1].id : undefined;
};

const actionByLabel = (actions: SelectableAction[], value: unknown): string | undefined => {
    if (typeof value !== "string") {
        return undefined;
    }
    const label = value.trim().toUpperCase();
    const index = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].indexOf(label);
    return index >= 0 && index < actions.length ? actions[index].id : undefined;
};

export const extractActionIdFromModelContent = (
    content: string,
    actions: SelectableAction[],
): { actionId?: string; explanation?: string } => {
    const trimmed = content
        .replace(/\0/g, "")
        .replace(/<think>[\s\S]*?<\/think>/gi, " ")
        .trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]) as {
                actionId?: unknown;
                actionIndex?: unknown;
                index?: unknown;
                actionLabel?: unknown;
                label?: unknown;
                choice?: unknown;
                explanation?: unknown;
            };
            const actionId =
                (typeof parsed.actionId === "string" && actions.some((action) => action.id === parsed.actionId)
                    ? parsed.actionId
                    : undefined) ??
                actionByIndex(actions, parsed.actionIndex) ??
                actionByIndex(actions, parsed.index) ??
                actionByIndex(actions, parsed.choice) ??
                actionByLabel(actions, parsed.actionLabel) ??
                actionByLabel(actions, parsed.label) ??
                actionByLabel(actions, parsed.choice);
            return {
                actionId,
                explanation: typeof parsed.explanation === "string" ? parsed.explanation : undefined,
            };
        } catch {
            // Fall through to loose parsing.
        }
    }

    const bare = trimmed.replace(/^[`"'\s]+|[`"'\s.]+$/g, "");

    if (actions.some((action) => action.id === bare)) {
        return { actionId: bare };
    }

    const labelMatch =
        bare.match(/^\s*(?:choice|action|option|move|answer)?\s*[:#-]?\s*([A-Z])\b/i) ??
        bare.match(/\b(?:choose|pick|select|selected|answer|option|move|choice|action)\s*(?:is|:|#|-)?\s*([A-Z])\b/i);
    if (labelMatch) {
        const actionId = actionByLabel(actions, labelMatch[1]);
        if (actionId) {
            return { actionId, explanation: trimmed.slice(0, 240) };
        }
    }

    const indexMatch =
        bare.match(/^\s*(?:choice|action|option|move|answer)?\s*[:#-]?\s*(\d+)\b/i) ??
        bare.match(/\b(?:choose|pick|select|selected|answer|option|move|choice|action)\s*(?:is|:|#|-)?\s*(\d+)\b/i);
    if (indexMatch) {
        const actionId = actionByIndex(actions, indexMatch[1]);
        if (actionId) {
            return { actionId, explanation: trimmed.slice(0, 240) };
        }
    }

    const textTokens = tokens(trimmed);
    if (textTokens.length) {
        const scored = actions
            .map((action) => {
                const actionText = normalize(`${action.kind} ${action.summary}`);
                const score = textTokens.reduce((sum, token) => sum + (actionText.includes(token) ? 1 : 0), 0);
                return { action, score };
            })
            .sort((left, right) => right.score - left.score);
        if ((scored[0]?.score ?? 0) >= 2 && scored[0].score > (scored[1]?.score ?? 0)) {
            return { actionId: scored[0].action.id, explanation: trimmed.slice(0, 240) };
        }
    }

    return {
        explanation: trimmed.length ? trimmed.slice(0, 240) : undefined,
    };
};
