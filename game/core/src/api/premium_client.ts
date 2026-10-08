import { axiosGameInstance, endpoints } from "./axios";

export interface PremiumEvidence {
    evidenceId: string;
    independentFamilies: number;
    scoreRate: number | null;
    interval95: [number, number];
    status: "none" | "limited" | "supported";
    caveat: string;
}
export interface PremiumChoice {
    kind: "creature" | "bundle" | "artifact" | "doctrine";
    value: number;
    label: string;
    reasons: string[];
    evidence?: PremiumEvidence;
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
