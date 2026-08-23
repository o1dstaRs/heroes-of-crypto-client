import { PortalMatchKind, type ResponsePlayerPortalObject } from "@heroesofcrypto/common";
import { siteUrlBase } from "../../api/site_origin";

type PortalMatchBase = NonNullable<ResponsePlayerPortalObject["recent_matches"]>[number];

export interface PortalUnitPerformanceData {
    creature_id?: number;
    damage_dealt?: number;
}

export interface PortalMatchSetupData {
    artifact_tier_1?: number;
    artifact_tier_2?: number;
    doctrine?: number;
    augment_placement?: number;
    augment_armor?: number;
    augment_might?: number;
    augment_empower?: number;
    augment_sniper?: number;
    augment_movement?: number;
    synergies?: string[];
    complete?: boolean;
}

export type MatchAugmentKind = "Placement" | "Armor" | "Might" | "Empower" | "Sniper" | "Movement";

export interface MatchAugmentChoice {
    kind: MatchAugmentKind;
    level: number;
}

export interface MatchTeamSetup {
    artifactTier1: number;
    artifactTier2: number;
    doctrine: number;
    augments: MatchAugmentChoice[];
    synergies: string[];
    available: boolean;
    complete: boolean;
}

/**
 * Forward-compatible view of PortalMatch. The optional fields are duplicated here so the client can
 * ship alongside the protobuf update without coupling this component to generated-code timing.
 */
export type PortalMatchData = PortalMatchBase & {
    duration_ms?: number;
    total_laps?: number;
    player_damage?: number;
    opponent_damage?: number;
    replay_available?: boolean;
    player_top_units?: PortalUnitPerformanceData[];
    opponent_top_units?: PortalUnitPerformanceData[];
    draw?: boolean;
    player_abandoned?: boolean;
    player_setup?: PortalMatchSetupData;
    opponent_setup?: PortalMatchSetupData;
    match_kind?: PortalMatchKind;
    mmr_before?: number;
    mmr_after?: number;
    mmr_delta?: number;
    gold_earned?: number;
    opponent_player_id?: string;
    outcome_reason?: string;
};

export type MatchHistoryFilter = "all" | "wins" | "losses";
export type MatchResultTone = "draw" | "loss" | "win";

export interface MatchResultPresentation {
    detail: string;
    label: "Defeat" | "Draw" | "Victory";
    tone: MatchResultTone;
}

export type MatchKindTone = "calibration" | "lobby" | "ranked" | "unknown";

export interface MatchKindPresentation {
    label: "Calibration" | "Lobby" | "Match" | "Ranked";
    /**
     * Why a CALIBRATION match's own outcome_reason kept it from advancing the calibration counter —
     * empty for every other reason (a fully played-out "normal" game, or a non-calibration match kind).
     * Only "normal" advances the counter (ranked_math.ts RankedOutcomeReason); a forfeit or disconnect
     * still moves MMR and win/loss at reduced weight, so the badge alone reads identically to a game
     * that counted, and this is the string that explains the difference.
     */
    detail: string;
    /**
     * Whether this kind's MMR movement is shown to the player. Calibration games DO move a rating, but
     * it is the *provisional* one the server deliberately keeps hidden (ranked_math.ts: "Calibrating
     * players track a hidden provisional MMR"), and for a fresh calibrator it does not even decide
     * where they place — that comes from the calibration WIN COUNT via seedMmrForCalibrationWins. So a
     * "MMR -40" on a placement game reads as a penalty the player can neither see the total of nor act
     * on. The number stays in the history record for audit; it just is not surfaced here.
     */
    showsMmr: boolean;
    /**
     * Whether this kind can pay currency. Calibration CAN: placement games mint nothing from the
     * result itself (the server gates that on `goldMintingEnabled && !calibrating`), but a player who
     * wagered on their own game still takes the pot, credited straight to the profile by wager.ts with
     * no calibration gate. So the reward is real during placement and the chip stays.
     */
    showsGold: boolean;
    tone: MatchKindTone;
}

const finiteNonNegative = (value: number | undefined): number =>
    Number.isFinite(value) ? Math.max(0, Number(value)) : 0;

const nonNegativeInteger = (value: number | undefined): number => Math.floor(finiteNonNegative(value));

/** Normalizes the optional wire setup while preserving message presence for legacy-match fallback UI. */
export const normalizeMatchSetup = (setup: PortalMatchSetupData | undefined): MatchTeamSetup => {
    const complete = setup?.complete === true;
    const placement = Math.min(2, nonNegativeInteger(setup?.augment_placement));
    const leveledAugments: Array<[MatchAugmentKind, number]> = [
        ["Armor", Math.min(3, nonNegativeInteger(setup?.augment_armor))],
        ["Might", Math.min(3, nonNegativeInteger(setup?.augment_might))],
        ["Empower", Math.min(3, nonNegativeInteger(setup?.augment_empower))],
        ["Sniper", Math.min(3, nonNegativeInteger(setup?.augment_sniper))],
        ["Movement", Math.min(2, nonNegativeInteger(setup?.augment_movement))],
    ];

    return {
        artifactTier1: nonNegativeInteger(setup?.artifact_tier_1),
        artifactTier2: nonNegativeInteger(setup?.artifact_tier_2),
        doctrine: nonNegativeInteger(setup?.doctrine),
        // Placement's enum is zero-based: value 0 is the free Level 1 choice, not "none".
        augments: complete
            ? [
                  { kind: "Placement", level: placement + 1 },
                  ...leveledAugments.filter(([, level]) => level > 0).map(([kind, level]) => ({ kind, level })),
              ]
            : [],
        synergies: complete
            ? [
                  ...new Set(
                      (setup?.synergies ?? []).map((synergy) => synergy.trim()).filter((synergy) => synergy.length > 0),
                  ),
              ]
            : [],
        available: !!setup,
        complete,
    };
};

export const matchResultPresentation = (match: PortalMatchData): MatchResultPresentation => {
    const detail = match.abandoned ? (match.player_abandoned ? "You left" : "Opponent left") : "";
    if (match.draw) {
        return { detail, label: "Draw", tone: "draw" };
    }
    return match.won ? { detail, label: "Victory", tone: "win" } : { detail, label: "Defeat", tone: "loss" };
};

const CALIBRATION_MISS_DETAIL: Record<string, string> = {
    concede: "Didn't count toward calibration — a player conceded",
    disconnect: "Didn't count toward calibration — a player disconnected",
    double_disconnect: "Didn't count toward calibration — both players disconnected",
    cancel: "Didn't count toward calibration — cancelled before it started",
};

export const matchKindPresentation = (match: PortalMatchData): MatchKindPresentation => {
    const reason = match.outcome_reason ?? "";
    const calibrationDetail = reason && reason !== "normal" ? (CALIBRATION_MISS_DETAIL[reason] ?? "") : "";
    switch (match.match_kind) {
        case PortalMatchKind.RANKED:
            return { detail: "", label: "Ranked", showsGold: true, showsMmr: true, tone: "ranked" };
        case PortalMatchKind.CALIBRATION:
            return {
                detail: calibrationDetail,
                label: "Calibration",
                showsGold: true,
                showsMmr: false,
                tone: "calibration",
            };
        case PortalMatchKind.LOBBY:
            return { detail: "", label: "Lobby", showsGold: false, showsMmr: false, tone: "lobby" };
        default:
            return { detail: "", label: "Match", showsGold: false, showsMmr: false, tone: "unknown" };
    }
};

export const formatSignedMatchValue = (value: number | undefined): string => {
    if (!Number.isFinite(value)) {
        return "";
    }
    const normalized = Math.round(Number(value));
    return normalized > 0 ? `+${normalized}` : String(normalized);
};

export const filterPortalMatches = (
    matches: readonly PortalMatchData[],
    filter: MatchHistoryFilter,
): PortalMatchData[] => {
    if (filter === "wins") {
        return matches.filter((match) => !match.draw && !!match.won);
    }
    if (filter === "losses") {
        return matches.filter((match) => !match.draw && !match.won);
    }
    return [...matches];
};

export const formatMatchDuration = (durationMs: number | undefined): string => {
    const totalSeconds = Math.floor(finiteNonNegative(durationMs) / 1000);
    if (totalSeconds <= 0) {
        return "";
    }
    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    }
    const totalMinutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (totalMinutes < 60) {
        return seconds ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
};

export const formatMatchDamage = (damage: number | undefined): string => {
    const normalized = Math.round(finiteNonNegative(damage));
    if (normalized < 1000) {
        return String(normalized);
    }
    if (normalized < 1_000_000) {
        const value = normalized / 1000;
        return `${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, "")}k`;
    }
    const value = normalized / 1_000_000;
    return `${value.toFixed(1).replace(/\.0$/, "")}m`;
};

export const normalizePerformances = (
    performances: readonly PortalUnitPerformanceData[] | undefined,
): PortalUnitPerformanceData[] =>
    (performances ?? [])
        .filter((performance) => finiteNonNegative(performance.creature_id) > 0)
        .map((performance) => ({
            creature_id: finiteNonNegative(performance.creature_id),
            damage_dealt: finiteNonNegative(performance.damage_dealt),
        }))
        .sort((a, b) => (b.damage_dealt ?? 0) - (a.damage_dealt ?? 0));

export const matchReplayPath = (match: PortalMatchData): string =>
    `/game/${encodeURIComponent(match.game_id ?? "")}/replay?team=${encodeURIComponent(String(match.team ?? 0))}`;

export const matchOpponentProfileHref = (match: PortalMatchData, language: string): string => {
    const playerId = (match.opponent_player_id ?? "").trim();
    if (!playerId) {
        return "";
    }

    const path = language === "ru" ? "/ru/profile/" : "/profile/";
    const url = new URL(path, siteUrlBase());
    url.searchParams.set("playerId", playerId);
    const username = (match.opponent_username ?? "").trim();
    if (username) {
        url.searchParams.set("username", username);
    }
    return url.toString();
};
