import {
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
    type: "pick_pair" | "pick" | "ban";
    summary: string;
    pairIndex?: number;
    pair?: [number, number];
    creatureId?: number;
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

const actionLabels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const KEY_RANGED_NAMES = new Set(["Tsar Cannon", "Gargantuan"]);

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
        case PickPhaseVals.AUGMENTS:
        case PickPhaseVals.AUGMENTS_SCOUT:
            return "handoff";
        default:
            return `phase ${phase}`;
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

const creatureConfig = (creatureId: number): CreatureConfig | undefined => creatureConfigs.get(creatureName(creatureId));

const isRangedCreature = (creatureId: number): boolean => {
    const config = creatureConfig(creatureId);
    return config?.attack_type === "RANGE" || (config?.range_shots ?? 0) > 0;
};

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
    const choices: DraftChoice[] = [];

    if (event.pp === PickPhaseVals.INITIAL_PICK) {
        for (const [pairIndex, pair] of event.ip.entries()) {
            const choiceId = `pair:${pairIndex}`;
            if (failedChoiceIds.has(choiceId)) {
                continue;
            }
            const score = pair.reduce((total, creatureId) => total + scoreCreature(creatureId, "pick"), 0);
            choices.push({
                label: labels[choices.length] ?? String(choices.length + 1),
                index: choices.length + 1,
                type: "pick_pair",
                pairIndex,
                pair,
                score,
                summary: `Pick pair ${pairIndex + 1}: ${pair.map(creatureName).join(" + ")}`,
                tags: pair.flatMap(choiceTags),
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
        if (
            isBan &&
            !PickHelper.canBanCreatureLevel(level, event.b, knownOpponentPicked, ownPicked)
        ) {
            continue;
        }

        choices.push({
            label: labels[choices.length] ?? String(choices.length + 1),
            index: choices.length + 1,
            type: isBan ? "ban" : "pick",
            creatureId,
            score: scoreCreature(creatureId, isBan ? "ban" : "pick"),
            summary: `${isBan ? "Ban" : "Pick"} ${creatureName(creatureId)}`,
            tags: choiceTags(creatureId),
        });
    }

    return choices.sort((a, b) => b.score - a.score).slice(0, labels.length);
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
                choice?: unknown;
                label?: unknown;
                index?: unknown;
                creatureId?: unknown;
                pairIndex?: unknown;
            };
            const label = String(parsed.label ?? parsed.choice ?? "").trim().toUpperCase();
            const byLabel = choices.find((choice) => choice.label === label);
            if (byLabel) return byLabel;
            const index = Number(parsed.index ?? parsed.choice);
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
    const labelMatch =
        cleaned.match(/^\s*(?:choice|action|option|answer)?\s*[:#-]?\s*([A-Z])\b/i) ??
        cleaned.match(/\b(?:choose|pick|ban|select|selected|answer|option|choice|action)\s*(?:is|:|#|-)?\s*([A-Z])\b/i);
    if (labelMatch) {
        return choices.find((choice) => choice.label === labelMatch[1].toUpperCase());
    }
    const indexMatch =
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
): string => [
    `You are drafting for Heroes of Crypto team ${teamName(config.modelTeam)}.`,
    `Style: ${config.style}. Current phase: ${phaseName(event.pp)}.`,
    "Goal: draft a stronger army than the opponent before the fight starts.",
    "This game version rewards out-picking the opponent in ranged units.",
    "Critical priority: secure Tsar Cannon and Gargantuan when legal; if you cannot secure them, ban them or ensure they stay banned.",
    "Prefer ranged pressure, Double Shot, Through Shot, Area Throw, Large Caliber, high damage, and strong level-4 stacks.",
    `Your picked creatures: ${event.p.filter(normalizeVisibleCreature).map(creatureName).join(", ") || "none"}.`,
    `Known opponent creatures: ${event.op.filter(normalizeVisibleCreature).map(creatureName).join(", ") || "hidden/none"}.`,
    `Banned creatures: ${event.b.map(creatureName).join(", ") || "none"}.`,
    "Legal choices:",
    ...choices.map((choice) => `${choice.label}. ${choice.summary}; score ${choice.score}; tags ${choice.tags.join(", ")}`),
    "Return only one listed choice label, such as A. Do not explain.",
].join("\n");

const chooseDraftChoice = async (
    config: LocalModelOpponentConfig,
    event: IPickPhaseEventData,
    choices: DraftChoice[],
): Promise<DraftChoice> => {
    const fallback = [...choices].sort((a, b) => b.score - a.score)[0];
    try {
        const model = await resolveModelName(config);
        const response = await fetch(modelUrl(config.apiBase, "/chat/completions"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                session_id: `hoc-draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                stream: false,
                temperature: Number((import.meta.env as Record<string, string | undefined>).VITE_HOC_MODEL_TEMPERATURE ?? 0),
                max_tokens: 80,
                enable_thinking: false,
                messages: [{ role: "user", content: buildDraftPrompt(config, event, choices) }],
            }),
        });
        if (!response.ok) {
            return fallback;
        }
        return extractChoice(readChatContent(await response.json()), choices) ?? fallback;
    } catch {
        return fallback;
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

    const request = new PickBanRequest({ creature: choice.creatureId ?? 0 });
    await postPickBody(choice.type === "ban" ? endpoints.game.ban : endpoints.game.pick, request.serializeBinary(), authorization);
};

export const LocalModelDraftOpponent: React.FC<{ eventUrl: string }> = ({ eventUrl }) => {
    const config = useMemo(() => getLocalModelOpponentConfig(), []);
    const [modelEvent, setModelEvent] = useState<IPickPhaseEventData | null>(null);
    const completedSignaturesRef = useRef(new Set<string>());
    const inFlightRef = useRef(false);

    useEffect(() => {
        if (!config.enabled || !config.authorization) {
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
    }, [config.authorization, config.enabled, eventUrl]);

    useEffect(() => {
        const authorization = config.authorization;
        if (!config.enabled || !authorization || !modelEvent || modelEvent.ia) {
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
                    break;
                }
                const choice = await chooseDraftChoice(config, modelEvent, choices);
                const failedId =
                    choice.type === "pick_pair" ? `pair:${choice.pairIndex ?? 0}` : `${choice.type}:${choice.creatureId ?? 0}`;
                try {
                    console.info("[local model draft]", choice.summary);
                    await submitDraftChoice(choice, authorization);
                    completedSignaturesRef.current.add(signature);
                    return;
                } catch (err) {
                    console.warn("[local model draft] rejected", choice.summary, (err as Error).message);
                    failedChoiceIds.add(failedId);
                    await sleep(250);
                }
            }
        })().finally(() => {
            inFlightRef.current = false;
        });
    }, [config, modelEvent]);

    return null;
};
