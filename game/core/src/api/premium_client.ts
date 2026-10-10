import { axiosGameInstance, endpoints } from "./axios";

export interface PremiumOutcomeEvidence {
    evidenceId: string;
    independentFamilies: number;
    scoreRate: number | null;
    interval95: [number, number];
    status: "none" | "limited" | "supported";
    caveat: string;
}
export interface PremiumMetricEvidence {
    evidenceId: string;
    evidenceKind: "observed-health-metrics" | "observed-combat-metrics";
    independentFamilies: number;
    status: "none" | "limited" | "supported";
    metrics: Record<
        string,
        {
            description: string;
            mean: number | null;
            minFamilyMean: number | null;
            maxFamilyMean: number | null;
        }
    >;
    caveat: string;
}
export type PremiumEvidence = PremiumOutcomeEvidence | PremiumMetricEvidence;
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
    options: { id: string; label: string; reasons: string[] }[];
}
export interface PremiumAdvice {
    entitlement: { active: boolean; reason: string };
    stage?: "draft" | "setup" | "board" | "fight";
    revision: string;
    choices?: PremiumChoice[];
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
