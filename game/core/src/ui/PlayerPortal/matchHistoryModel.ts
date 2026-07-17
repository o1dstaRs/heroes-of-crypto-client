import type { ResponsePlayerPortalObject } from "@heroesofcrypto/common";

type PortalMatchBase = NonNullable<ResponsePlayerPortalObject["recent_matches"]>[number];

export interface PortalUnitPerformanceData {
    creature_id?: number;
    damage_dealt?: number;
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
};

export type MatchHistoryFilter = "all" | "wins" | "losses";
export type MatchResultTone = "draw" | "loss" | "win";

export interface MatchResultPresentation {
    detail: string;
    label: "Defeat" | "Draw" | "Victory";
    tone: MatchResultTone;
}

const finiteNonNegative = (value: number | undefined): number =>
    Number.isFinite(value) ? Math.max(0, Number(value)) : 0;

export const matchResultPresentation = (match: PortalMatchData): MatchResultPresentation => {
    const detail = match.abandoned ? (match.player_abandoned ? "You left" : "Opponent left") : "";
    if (match.draw) {
        return { detail, label: "Draw", tone: "draw" };
    }
    return match.won ? { detail, label: "Victory", tone: "win" } : { detail, label: "Defeat", tone: "loss" };
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
