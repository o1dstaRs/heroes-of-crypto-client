import { axiosGameInstance, endpoints } from "./axios";
import type { GameAction } from "@heroesofcrypto/common";

import type { PremiumEvidence } from "./premium_search_stream";
export type { PremiumEvidence, PremiumOutcomeEvidence, PremiumMetricEvidence } from "./premium_search_stream";

export interface PremiumChoice {
    kind: "creature" | "bundle" | "artifact" | "doctrine";
    value: number;
    label: string;
    reasons: string[];
    evidence?: PremiumEvidence;
}
export interface PremiumTurnAdvice {
    sequence: number;
    lap: number;
    unitId: string;
    status: "ready" | "waiting" | "automatic" | "unavailable";
    options: {
        id: string;
        label: string;
        reasons: string[];
        actions?: GameAction[];
        assessment?: PremiumTurnAssessment;
    }[];
}

export interface PremiumTurnAssessment {
    recommended: boolean;
    purpose: "attack" | "ally-spell" | "enemy-spell" | "spell" | "move" | "wait" | "defend" | "obstacle";
    attackMode: number;
    resources: {
        usesAmmunition: boolean;
        usesSpellCharge: boolean;
        spendsSelfResurrection: boolean;
        usesHourglass: boolean;
        baseMoraleChange: number;
        baseLuckChange: number;
    };
    position?: {
        plannedAnchor: { x: number; y: number };
        crossesLava: boolean;
        crossesWater: boolean;
        touchingEnemies: { id: string; name: string }[];
    };
    damage?: {
        kind: "chance-weighted-shot-hp";
        enemyHpLoss: number;
        alliedHpLoss: number;
        primaryHpLoss: number;
        primaryTarget: { id: string; name: string };
        aimedTarget?: { id: string; name: string; hpLoss?: number };
        limits: string[];
    };
}

export interface PremiumTurnPreview extends PremiumTurnAdvice {
    gameId: string;
}
export interface PremiumAdvice {
    entitlement: { active: boolean; reason: string };
    stage?: "draft" | "setup" | "board" | "fight";
    revision: string;
    choices?: PremiumChoice[];
    offers?: Pick<PremiumChoice, "kind" | "value" | "label">[];
    draftLevel?: number;
    augments?: { kind: string; value: number }[];
    synergies?: { faction: number; synergy: number; factionName: string; name: string; level: number }[];
    reasons?: string[];
    evidence?: PremiumEvidence;
    snapshot?: { snapshotId: string; fights: number; status: string } | null;
    canAutoArrange?: boolean;
    canUndo?: boolean;
    ready?: boolean;
    budget?: number;
    policy?: string;
    turn?: PremiumTurnAdvice;
}
export type PremiumOperation = "setup" | "automatic" | "formation" | "undo";
const premiumUrl = (id: string): string =>
    `${endpoints.game.playSnapshot.replace("play-snapshot", "premium")}/${encodeURIComponent(id)}`;
export const fetchPremium = async (id = "account", signal?: AbortSignal): Promise<PremiumAdvice> =>
    (await axiosGameInstance.get<PremiumAdvice>(premiumUrl(id), { signal })).data;
export const applyPremium = async (
    gameId: string,
    revision: string,
    operation: PremiumOperation,
): Promise<PremiumAdvice> =>
    (await axiosGameInstance.post<PremiumAdvice>(premiumUrl(gameId), { revision, operation })).data;
