import {
    Artifact,
    ArtifactRequest,
    Perk,
    PerkRequest,
    CREATURES_JSON,
    CreatureByLevel,
    CreatureLevels,
    CreaturePoolByLevel,
    CreatureVals,
    CustomEventSource,
    PickBanRequest,
    PickHelper,
    PickPairRequest,
    PickPhaseVals,
    TeamVals,
    type TeamType,
} from "@heroesofcrypto/common";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import { buildApiUrl, endpoints, HOST_GAME_API } from "../../api/axios";
import { getLocalModelOpponentConfig, type LocalModelOpponentConfig } from "../../scenes/LocalModelOpponent";
import type { IPickPhaseEventData } from "../context/PickBanContext";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";

interface DraftChoice {
    label: string;
    index: number;
    type: "pick_pair" | "pick" | "ban" | "artifact" | "perk";
    summary: string;
    pairIndex?: number;
    pair?: [number, number];
    creatureId?: number;
    artifactId?: number;
    artifactTier?: number;
    perkId?: number;
    score: number;
    tags: string[];
}

interface CreatureConfig {
    name: string;
    attack_type?: string;
    attack_damage_max?: number;
    range_shots?: number;
    shot_distance?: number;
    exp?: number;
    level?: number;
    abilities?: string[];
}

interface LocalModelDraftLogEntry {
    id: string;
    timestamp: string;
    kind: "decision" | "result";
    team: string;
    phase: string;
    state: {
        signature: string;
        activeTeams: string[];
        picked: Array<{ id: number; name: string }>;
        knownOpponentPicked: Array<{ id: number; name: string }>;
        banned: Array<{ id: number; name: string }>;
        initialPairs: Array<Array<{ id: number; name: string }>>;
        secondsRemaining: number;
        revealsRemaining: number;
    };
    prompt?: string;
    model?: string;
    choices?: Array<{
        label: string;
        index: number;
        type: DraftChoice["type"];
        summary: string;
        creatureId?: number;
        pairIndex?: number;
        pair?: [number, number];
        score: number;
        tags: string[];
    }>;
    rawResponse?: string;
    selectedChoice?: {
        label: string;
        index: number;
        type: DraftChoice["type"];
        summary: string;
        creatureId?: number;
        pairIndex?: number;
        pair?: [number, number];
        score: number;
        tags: string[];
    };
    usedFallback?: boolean;
    completed?: boolean;
    error?: string;
}

interface DraftChoiceDecision {
    choice: DraftChoice;
    decisionId: string;
    usedFallback: boolean;
    error?: string;
}

const actionLabels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const KEY_RANGED_NAMES = new Set(["Tsar Cannon", "Gargantuan"]);
const MAX_MODEL_RANGED_UNITS = 3;
const LOCAL_MODEL_DRAFT_LOG_KEY = "hoc.localModelDraftLog";
const LOCAL_MODEL_DRAFT_LOG_LIMIT = 120;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

const normalizeVisibleCreature = (creatureId: number): number | undefined =>
    creatureId && creatureId !== CreatureVals.NO_CREATURE ? creatureId : undefined;

const teamName = (team: TeamType): string => (team === TeamVals.LOWER ? "LOWER/GREEN" : "UPPER/RED");

const phaseName = (phase: number): string => {
    switch (phase) {
        case PickPhaseVals.INITIAL_PICK:
            return "initial pair";
        case PickPhaseVals.EXTENDED_PICK:
            return "extended pick";
        case PickPhaseVals.EXTENDED_BAN:
            return "extended ban";
        case PickPhaseVals.PICK:
            return "pick";
        case PickPhaseVals.BAN:
            return "ban";
        case PickPhaseVals.PERK:
            return "perk";
        case PickPhaseVals.ARTIFACT_1:
            return "tier 1 artifact";
        case PickPhaseVals.ARTIFACT_2:
            return "tier 2 artifact";
        case PickPhaseVals.AUGMENTS:
        case PickPhaseVals.AUGMENTS_SCOUT:
            return "handoff";
        default:
            return `phase ${phase}`;
    }
};

const nextDraftDecisionId = (): string => `lm-draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const namedCreature = (creatureId: number): { id: number; name: string } => ({
    id: creatureId,
    name: creatureName(creatureId),
});

const serializeDraftChoice = (choice: DraftChoice): NonNullable<LocalModelDraftLogEntry["selectedChoice"]> => ({
    label: choice.label,
    index: choice.index,
    type: choice.type,
    summary: choice.summary,
    creatureId: choice.creatureId,
    pairIndex: choice.pairIndex,
    pair: choice.pair,
    score: choice.score,
    tags: choice.tags,
});

const draftStateSummary = (event: IPickPhaseEventData): LocalModelDraftLogEntry["state"] => ({
    signature: draftSignature(event),
    activeTeams: event.a.map(teamName),
    picked: event.p.filter(normalizeVisibleCreature).map(namedCreature),
    knownOpponentPicked: event.op.filter(normalizeVisibleCreature).map(namedCreature),
    banned: event.b.filter(normalizeVisibleCreature).map(namedCreature),
    initialPairs: event.ip.map((pair) => pair.map(namedCreature)),
    secondsRemaining: event.t,
    revealsRemaining: event.r,
});

const recordLocalModelDraftLog = (entry: LocalModelDraftLogEntry): void => {
    console.info("[local model draft log]", entry);
    if (typeof window === "undefined") {
        return;
    }
    const globalState = window as Window & {
        __hocLocalModelDraftLog?: LocalModelDraftLogEntry[];
        __hocDumpLocalModelDraftLog?: () => string;
    };
    const current = globalState.__hocLocalModelDraftLog ?? [];
    const next = [...current, entry].slice(-LOCAL_MODEL_DRAFT_LOG_LIMIT);
    globalState.__hocLocalModelDraftLog = next;
    globalState.__hocDumpLocalModelDraftLog = () => JSON.stringify(globalState.__hocLocalModelDraftLog ?? [], null, 2);
    try {
        window.localStorage.setItem(LOCAL_MODEL_DRAFT_LOG_KEY, JSON.stringify(next));
    } catch {
        // The console/in-memory copy is enough if localStorage is unavailable.
    }
};

const creatureConfigs = (() => {
    const byName = new Map<string, CreatureConfig>();
    for (const faction of Object.keys(CREATURES_JSON)) {
        const creatures = CREATURES_JSON[faction as keyof typeof CREATURES_JSON] as Record<string, CreatureConfig>;
        for (const creature of Object.values(creatures)) {
            byName.set(creature.name, creature);
        }
    }
    return byName;
})();

const creatureName = (creatureId: number): string => UNIT_ID_TO_NAME[creatureId] ?? `Creature ${creatureId}`;

const creatureConfig = (creatureId: number): CreatureConfig | undefined =>
    creatureConfigs.get(creatureName(creatureId));

const isRangedCreature = (creatureId: number): boolean => {
    const config = creatureConfig(creatureId);
    return config?.attack_type === "RANGE" || (config?.range_shots ?? 0) > 0;
};

const rangedCreatureCount = (creatureIds: number[]): number =>
    creatureIds.filter((creatureId) => normalizeVisibleCreature(creatureId) && isRangedCreature(creatureId)).length;

const scoreCreature = (creatureId: number, intent: "pick" | "ban"): number => {
    const config = creatureConfig(creatureId);
    const name = creatureName(creatureId);
    const level = CreatureLevels[creatureId as keyof typeof CreatureLevels] ?? config?.level ?? 1;
    const ranged = isRangedCreature(creatureId);
    const maxDamage = config?.attack_damage_max ?? 0;
    const shots = config?.range_shots ?? 0;
    const distance = config?.shot_distance ?? 0;
    const abilityText = (config?.abilities ?? []).join(" ");
    const keyRangedBonus = KEY_RANGED_NAMES.has(name) ? (intent === "pick" ? 260 : 240) : 0;
    const rangedBonus = ranged ? (intent === "pick" ? 95 : 105) : 0;
    const pressureBonus =
        maxDamage * (ranged ? 3 : 1.2) +
        shots * (ranged ? 5 : 0) +
        distance * (ranged ? 6 : 0) +
        (abilityText.includes("Double Shot") ? 50 : 0) +
        (abilityText.includes("Through Shot") ? 70 : 0) +
        (abilityText.includes("Area Throw") ? 60 : 0) +
        (abilityText.includes("Large Caliber") ? 45 : 0);

    return Math.round(level * 35 + (config?.exp ?? 0) / 8 + rangedBonus + keyRangedBonus + pressureBonus);
};

const choiceTags = (creatureId: number): string[] => {
    const name = creatureName(creatureId);
    return [
        ...(KEY_RANGED_NAMES.has(name) ? ["must-secure-or-ban"] : []),
        ...(isRangedCreature(creatureId) ? ["ranged"] : ["melee"]),
        `level-${CreatureLevels[creatureId as keyof typeof CreatureLevels] ?? "?"}`,
    ];
};

const balanceDraftPickScore = (baseScore: number, ownRangedCount: number, creatureIds: number[]): number => {
    const addedRangedCount = rangedCreatureCount(creatureIds);
    if (addedRangedCount <= 0) {
        return ownRangedCount >= 2 ? baseScore + 85 : baseScore;
    }

    const hasKeyRanged = creatureIds.some((creatureId) => KEY_RANGED_NAMES.has(creatureName(creatureId)));
    const afterPickRangedCount = ownRangedCount + addedRangedCount;
    if (afterPickRangedCount > MAX_MODEL_RANGED_UNITS) {
        return baseScore - 10000;
    }
    if (afterPickRangedCount === MAX_MODEL_RANGED_UNITS && !hasKeyRanged) {
        return baseScore - 65;
    }
    return baseScore;
};

const choiceCreatureIds = (choice: DraftChoice): number[] =>
    choice.pair ?? (choice.creatureId === undefined ? [] : [choice.creatureId]);

const remainingByLevel = (picked: number[]): number[] => {
    const remaining: number[] = [...CreaturePoolByLevel];
    for (const creatureId of picked) {
        const level = CreatureLevels[creatureId as keyof typeof CreatureLevels];
        if (level) {
            remaining[level - 1] = Math.max(0, (remaining[level - 1] ?? 0) - 1);
        }
    }
    return remaining;
};

const allCreatureIds = (): number[] => Object.values(CreatureByLevel).flatMap((ids) => ids as number[]);

const draftSignature = (event: IPickPhaseEventData): string =>
    [
        event.pp,
        event.a.join(","),
        event.p.join(","),
        event.op.join(","),
        event.b.join(","),
        event.ip.map((pair) => pair.join(":")).join(","),
    ].join("|");

const buildDraftChoices = (event: IPickPhaseEventData, failedChoiceIds: Set<string>): DraftChoice[] => {
    const labels = actionLabels.split("");
    const ownPicked = event.p.filter(normalizeVisibleCreature);
    const knownOpponentPicked = event.op.filter(normalizeVisibleCreature);
    const unavailable = new Set([...event.b, ...ownPicked, ...knownOpponentPicked]);
    const ownRangedCount = rangedCreatureCount(ownPicked);
    const choices: DraftChoice[] = [];

    if (event.pp === PickPhaseVals.PERK) {
        // The AI takes the Scout doctrine (3 reveals, 6 upgrade points) by default.
        const perkId = Perk.Perk.THREE_REVEALS;
        const choiceId = `perk:${perkId}`;
        if (!failedChoiceIds.has(choiceId)) {
            choices.push({
                label: labels[0] ?? "1",
                index: 1,
                type: "perk",
                perkId,
                score: 1,
                summary: `Perk: ${Perk.getPerkProperties(perkId).name}`,
                tags: ["perk"],
            });
        }
        return choices;
    }

    if (event.pp === PickPhaseVals.INITIAL_PICK) {
        // Each bundle is [l1Creature, l2Creature, tier1ArtifactId]; the AI scores by the two creatures.
        for (const [bundleIndex, bundle] of event.ip.entries()) {
            const choiceId = `pair:${bundleIndex}`;
            if (failedChoiceIds.has(choiceId)) {
                continue;
            }
            const creaturePair: [number, number] = [bundle[0], bundle[1]];
            const baseScore = creaturePair.reduce((total, creatureId) => total + scoreCreature(creatureId, "pick"), 0);
            const score = balanceDraftPickScore(baseScore, ownRangedCount, creaturePair);
            choices.push({
                label: labels[choices.length] ?? String(choices.length + 1),
                index: choices.length + 1,
                type: "pick_pair",
                pairIndex: bundleIndex,
                pair: creaturePair,
                score,
                summary: `Pick bundle ${bundleIndex + 1}: ${creaturePair.map(creatureName).join(" + ")}`,
                tags: creaturePair.flatMap(choiceTags),
            });
        }
        return choices;
    }

    if (event.pp === PickPhaseVals.ARTIFACT_1 || event.pp === PickPhaseVals.ARTIFACT_2) {
        // The AI picks one strong, generic artifact of the phase's tier. Tier 1: Veteran Helm (+5% atk/def);
        // Tier 2: Warlord's Edge (+15% atk).
        const tier = event.pp === PickPhaseVals.ARTIFACT_1 ? 1 : 2;
        const artifactId = tier === 1 ? Artifact.Tier1Artifact.VETERAN_HELM : Artifact.Tier2Artifact.WARLORDS_EDGE;
        const props = Artifact.getArtifactProperties(tier as Artifact.ArtifactTier, artifactId);
        const choiceId = `artifact:${tier}:${artifactId}`;
        if (!failedChoiceIds.has(choiceId)) {
            choices.push({
                label: labels[0] ?? "1",
                index: 1,
                type: "artifact",
                artifactId,
                artifactTier: tier,
                score: 1,
                summary: `Pick Tier ${tier} artifact: ${props.name}`,
                tags: ["artifact"],
            });
        }
        return choices;
    }

    const isBan = event.pp === PickPhaseVals.EXTENDED_BAN || event.pp === PickPhaseVals.BAN;
    const isPick = event.pp === PickPhaseVals.EXTENDED_PICK || event.pp === PickPhaseVals.PICK;
    if (!isBan && !isPick) {
        return choices;
    }

    const ownRemainingByLevel = remainingByLevel(ownPicked);
    for (const creatureId of allCreatureIds()) {
        const choiceId = `${isBan ? "ban" : "pick"}:${creatureId}`;
        if (failedChoiceIds.has(choiceId) || unavailable.has(creatureId)) {
            continue;
        }

        const level = CreatureLevels[creatureId as keyof typeof CreatureLevels];
        if (!level) {
            continue;
        }
        if (isPick && (ownRemainingByLevel[level - 1] ?? 0) <= 0) {
            continue;
        }
        if (isBan && !PickHelper.canBanCreatureLevel(level, event.b, knownOpponentPicked, ownPicked)) {
            continue;
        }

        const baseScore = scoreCreature(creatureId, isBan ? "ban" : "pick");
        choices.push({
            label: labels[choices.length] ?? String(choices.length + 1),
            index: choices.length + 1,
            type: isBan ? "ban" : "pick",
            creatureId,
            score: isPick ? balanceDraftPickScore(baseScore, ownRangedCount, [creatureId]) : baseScore,
            summary: `${isBan ? "Ban" : "Pick"} ${creatureName(creatureId)}`,
            tags: choiceTags(creatureId),
        });
    }

    const rankedChoices = choices.sort((a, b) => b.score - a.score);
    if (isPick) {
        const capSafeChoices = rankedChoices.filter(
            (choice) => ownRangedCount + rangedCreatureCount(choiceCreatureIds(choice)) <= MAX_MODEL_RANGED_UNITS,
        );
        if (capSafeChoices.length) {
            return capSafeChoices.slice(0, labels.length);
        }
    }
    return rankedChoices.slice(0, labels.length);
};

const modelUrl = (base: string, path: string): string => `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

const resolveModelName = async (config: LocalModelOpponentConfig): Promise<string> => {
    if (config.modelName && config.modelName !== "auto") {
        return config.modelName;
    }
    const response = await fetch(modelUrl(config.apiBase, "/models"));
    if (!response.ok) {
        return config.modelName || "local-model";
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

const readChatContent = (responseJson: unknown): string => {
    const content = (responseJson as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message
        ?.content;
    return typeof content === "string" ? content.replace(/\0/g, "").trim() : "";
};

const extractChoice = (content: string, choices: DraftChoice[]): DraftChoice | undefined => {
    const cleaned = content
        .replace(/<think>[\s\S]*?<\/think>/gi, " ")
        .replace(/^[`"'\s]+|[`"'\s.]+$/g, "")
        .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]) as {
                actionIndex?: unknown;
                choice?: unknown;
                label?: unknown;
                index?: unknown;
                creatureId?: unknown;
                pairIndex?: unknown;
            };
            const label = String(parsed.label ?? parsed.choice ?? "")
                .trim()
                .toUpperCase();
            const byLabel = choices.find((choice) => choice.label === label);
            if (byLabel) return byLabel;
            const index = Number(parsed.actionIndex ?? parsed.index ?? parsed.choice);
            if (Number.isInteger(index) && index >= 1 && index <= choices.length) {
                return choices[index - 1];
            }
            const creatureId = Number(parsed.creatureId);
            if (Number.isInteger(creatureId)) {
                return choices.find((choice) => choice.creatureId === creatureId);
            }
            const pairIndex = Number(parsed.pairIndex);
            if (Number.isInteger(pairIndex)) {
                return choices.find((choice) => choice.pairIndex === pairIndex);
            }
        } catch {
            // Fall through to loose parsing.
        }
    }
    const bracketLabelMatch = cleaned.match(/^\s*[*_\s]*(?:\[\s*([A-Z])\s*\]|\(\s*([A-Z])\s*\))/i);
    if (bracketLabelMatch) {
        return choices.find((choice) => choice.label === (bracketLabelMatch[1] ?? bracketLabelMatch[2]).toUpperCase());
    }
    const labelMatch =
        cleaned.match(/^\s*(?:choice|action|option|answer)?\s*[:#-]?\s*([A-Z])\b/i) ??
        cleaned.match(/\b(?:choose|pick|ban|select|selected|answer|option|choice|action)\s*(?:is|:|#|-)?\s*([A-Z])\b/i);
    if (labelMatch) {
        return choices.find((choice) => choice.label === labelMatch[1].toUpperCase());
    }
    const indexMatch =
        cleaned.match(/^\s*\(?\s*(\d+)\s*\)?\b/i) ??
        cleaned.match(/^\s*(?:choice|action|option|answer)?\s*[:#-]?\s*(\d+)\b/i) ??
        cleaned.match(/\b(?:choose|pick|ban|select|selected|answer|option|choice|action)\s*(?:is|:|#|-)?\s*(\d+)\b/i);
    if (indexMatch) {
        const index = Number(indexMatch[1]);
        return Number.isInteger(index) && index >= 1 && index <= choices.length ? choices[index - 1] : undefined;
    }
    return undefined;
};

const buildDraftPrompt = (
    config: LocalModelOpponentConfig,
    event: IPickPhaseEventData,
    choices: DraftChoice[],
): string =>
    [
        `You are drafting for Heroes of Crypto team ${teamName(config.modelTeam)}.`,
        `Style: ${config.style}. Current phase: ${phaseName(event.pp)}.`,
        "Goal: draft a stronger army than the opponent before the fight starts.",
        "This game version rewards out-picking the opponent in ranged units.",
        `Balanced roster rule: do not finish with more than ${MAX_MODEL_RANGED_UNITS} ranged units. Once you have 2-3 ranged units, prioritize durable frontline, caster/support, tempo, or faction synergy unless Tsar Cannon/Gargantuan is still the best legal secure-or-deny action.`,
        "Critical priority: secure Tsar Cannon and Gargantuan when legal; if you cannot secure them, ban them or ensure they stay banned.",
        "Prefer ranged pressure, Double Shot, Through Shot, Area Throw, Large Caliber, high damage, and strong level-4 stacks.",
        `Your picked creatures: ${event.p.filter(normalizeVisibleCreature).map(creatureName).join(", ") || "none"} (${rangedCreatureCount(event.p.filter(normalizeVisibleCreature))}/${MAX_MODEL_RANGED_UNITS} ranged).`,
        `Known opponent creatures: ${event.op.filter(normalizeVisibleCreature).map(creatureName).join(", ") || "hidden/none"}.`,
        `Banned creatures: ${event.b.map(creatureName).join(", ") || "none"}.`,
        "Legal choices:",
        ...choices.map(
            (choice) => `${choice.label}. ${choice.summary}; score ${choice.score}; tags ${choice.tags.join(", ")}`,
        ),
        'Return JSON only: {"actionIndex": 1}. Use the 1-based index of exactly one listed legal choice. Do not explain.',
    ].join("\n");

const chooseDraftChoice = async (
    config: LocalModelOpponentConfig,
    event: IPickPhaseEventData,
    choices: DraftChoice[],
): Promise<DraftChoiceDecision> => {
    const decisionId = nextDraftDecisionId();
    const fallback = [...choices].sort((a, b) => b.score - a.score)[0];
    const prompt = buildDraftPrompt(config, event, choices);
    try {
        const model = await resolveModelName(config);
        const response = await fetch(modelUrl(config.apiBase, "/chat/completions"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                session_id: `hoc-draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                stream: false,
                temperature: Number(
                    (import.meta.env as Record<string, string | undefined>).VITE_HOC_MODEL_TEMPERATURE ?? 0,
                ),
                max_tokens: 80,
                enable_thinking: false,
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a deterministic controller for a local strategy-game draft. Choose one legal draft action. Output only valid JSON.",
                    },
                    { role: "user", content: prompt },
                ],
            }),
        });
        if (!response.ok) {
            const error = `http_${response.status}`;
            recordLocalModelDraftLog({
                id: decisionId,
                timestamp: new Date().toISOString(),
                kind: "decision",
                team: teamName(config.modelTeam),
                phase: phaseName(event.pp),
                state: draftStateSummary(event),
                prompt,
                model,
                choices: choices.map(serializeDraftChoice),
                selectedChoice: serializeDraftChoice(fallback),
                usedFallback: true,
                error,
            });
            return { choice: fallback, decisionId, usedFallback: true, error };
        }
        const rawResponse = readChatContent(await response.json());
        const parsedChoice = extractChoice(rawResponse, choices);
        const choice = parsedChoice ?? fallback;
        const error = parsedChoice ? undefined : "no_parseable_choice";
        recordLocalModelDraftLog({
            id: decisionId,
            timestamp: new Date().toISOString(),
            kind: "decision",
            team: teamName(config.modelTeam),
            phase: phaseName(event.pp),
            state: draftStateSummary(event),
            prompt,
            model,
            choices: choices.map(serializeDraftChoice),
            rawResponse,
            selectedChoice: serializeDraftChoice(choice),
            usedFallback: !parsedChoice,
            error,
        });
        return { choice, decisionId, usedFallback: !parsedChoice, error };
    } catch (err) {
        const error = (err as Error).message;
        recordLocalModelDraftLog({
            id: decisionId,
            timestamp: new Date().toISOString(),
            kind: "decision",
            team: teamName(config.modelTeam),
            phase: phaseName(event.pp),
            state: draftStateSummary(event),
            prompt,
            choices: choices.map(serializeDraftChoice),
            selectedChoice: serializeDraftChoice(fallback),
            usedFallback: true,
            error,
        });
        return { choice: fallback, decisionId, usedFallback: true, error };
    }
};

const postPickBody = async (path: string, body: Uint8Array, authorization: string): Promise<void> => {
    const requestBody = new ArrayBuffer(body.byteLength);
    new Uint8Array(requestBody).set(body);
    const response = await fetch(buildApiUrl(HOST_GAME_API, path), {
        method: "POST",
        headers: {
            "Content-Type": "application/octet-stream",
            "x-request-id": uuidv4(),
            Authorization: authorization,
        },
        body: requestBody,
    });
    if (!response.ok) {
        const text = new TextDecoder().decode(new Uint8Array(await response.arrayBuffer()));
        throw new Error(text || `HTTP ${response.status}`);
    }
};

const submitDraftChoice = async (choice: DraftChoice, authorization: string): Promise<void> => {
    if (choice.type === "pick_pair") {
        const request = new PickPairRequest({ pair_index: choice.pairIndex ?? 0 });
        await postPickBody(endpoints.game.pickPair, request.serializeBinary(), authorization);
        return;
    }

    if (choice.type === "artifact") {
        const request = new ArtifactRequest({ artifact: choice.artifactId ?? 0, level: choice.artifactTier ?? 0 });
        await postPickBody(endpoints.game.artifact, request.serializeBinary(), authorization);
        return;
    }

    if (choice.type === "perk") {
        const request = new PerkRequest({ perk: choice.perkId ?? 0 });
        await postPickBody(endpoints.game.perk, request.serializeBinary(), authorization);
        return;
    }

    const request = new PickBanRequest({ creature: choice.creatureId ?? 0 });
    await postPickBody(
        choice.type === "ban" ? endpoints.game.ban : endpoints.game.pick,
        request.serializeBinary(),
        authorization,
    );
};

export const LocalModelDraftOpponent: React.FC<{ eventUrl: string; userTeam: TeamType }> = ({ eventUrl, userTeam }) => {
    const config = useMemo(() => getLocalModelOpponentConfig(), []);
    const [modelEvent, setModelEvent] = useState<IPickPhaseEventData | null>(null);
    const completedSignaturesRef = useRef(new Set<string>());
    const inFlightRef = useRef(false);

    useEffect(() => {
        if (!config.enabled || !config.authorization || config.modelTeam === userTeam) {
            return undefined;
        }

        const eventSource = new CustomEventSource<IPickPhaseEventData>(eventUrl, {
            token: config.authorization,
            debug: false,
        });
        eventSource.onmessage = setModelEvent;
        eventSource.onerror = (error: Error) => {
            console.warn("[local model draft] SSE error", error.message);
        };
        return () => {
            eventSource.close();
        };
    }, [config.authorization, config.enabled, config.modelTeam, eventUrl, userTeam]);

    useEffect(() => {
        const authorization = config.authorization;
        if (!config.enabled || config.modelTeam === userTeam || !authorization || !modelEvent || modelEvent.ia) {
            return;
        }
        if (!modelEvent.a.includes(config.modelTeam)) {
            return;
        }
        if (modelEvent.pp === PickPhaseVals.AUGMENTS || modelEvent.pp === PickPhaseVals.AUGMENTS_SCOUT) {
            return;
        }

        const signature = draftSignature(modelEvent);
        if (completedSignaturesRef.current.has(signature) || inFlightRef.current) {
            return;
        }

        inFlightRef.current = true;
        void (async () => {
            const failedChoiceIds = new Set<string>();
            await sleep(700);
            for (let attempt = 0; attempt < 6; attempt++) {
                const choices = buildDraftChoices(modelEvent, failedChoiceIds);
                if (!choices.length) {
                    recordLocalModelDraftLog({
                        id: nextDraftDecisionId(),
                        timestamp: new Date().toISOString(),
                        kind: "decision",
                        team: teamName(config.modelTeam),
                        phase: phaseName(modelEvent.pp),
                        state: draftStateSummary(modelEvent),
                        choices: [],
                        usedFallback: false,
                        error: "no_legal_choices",
                    });
                    break;
                }
                const decision = await chooseDraftChoice(config, modelEvent, choices);
                const choice = decision.choice;
                const failedId =
                    choice.type === "pick_pair"
                        ? `pair:${choice.pairIndex ?? 0}`
                        : choice.type === "artifact"
                          ? `artifact:${choice.artifactTier ?? 0}:${choice.artifactId ?? 0}`
                          : choice.type === "perk"
                            ? `perk:${choice.perkId ?? 0}`
                            : `${choice.type}:${choice.creatureId ?? 0}`;
                try {
                    console.info("[local model draft]", choice.summary);
                    await submitDraftChoice(choice, authorization);
                    recordLocalModelDraftLog({
                        id: decision.decisionId,
                        timestamp: new Date().toISOString(),
                        kind: "result",
                        team: teamName(config.modelTeam),
                        phase: phaseName(modelEvent.pp),
                        state: draftStateSummary(modelEvent),
                        selectedChoice: serializeDraftChoice(choice),
                        usedFallback: decision.usedFallback,
                        completed: true,
                    });
                    completedSignaturesRef.current.add(signature);
                    return;
                } catch (err) {
                    const message = (err as Error).message;
                    console.warn("[local model draft] rejected", choice.summary, message);
                    recordLocalModelDraftLog({
                        id: decision.decisionId,
                        timestamp: new Date().toISOString(),
                        kind: "result",
                        team: teamName(config.modelTeam),
                        phase: phaseName(modelEvent.pp),
                        state: draftStateSummary(modelEvent),
                        selectedChoice: serializeDraftChoice(choice),
                        usedFallback: decision.usedFallback,
                        completed: false,
                        error: message,
                    });
                    if (/not your turn|current phase/i.test(message)) {
                        completedSignaturesRef.current.add(signature);
                        return;
                    }
                    failedChoiceIds.add(failedId);
                    await sleep(250);
                }
            }
        })().finally(() => {
            inFlightRef.current = false;
        });
    }, [config, modelEvent, userTeam]);

    return null;
};
