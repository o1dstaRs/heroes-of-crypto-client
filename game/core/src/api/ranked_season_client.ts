import { axiosMMInstance, buildApiUrl, endpoints, HOST_MATCHMAKING_API } from "./axios";

export interface RankedSeasonSummary {
    sequence: number;
    name: string;
    startsAt: number;
    endsAt: number;
}

export interface RankedSeasonSnapshot {
    current: RankedSeasonSummary | null;
    next: RankedSeasonSummary | null;
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};

const normalizeSeason = (value: unknown, status: "active" | "upcoming"): RankedSeasonSummary | null => {
    const season = asRecord(value);
    const sequence = Number(season.sequence);
    const name = typeof season.name === "string" ? season.name.trim() : "";
    const startsAt = Number(season.startsAt);
    const endsAt = Number(season.endsAt);
    if (
        season.status !== status ||
        !Number.isInteger(sequence) ||
        sequence < 1 ||
        !name ||
        !Number.isFinite(startsAt) ||
        startsAt <= 0 ||
        !Number.isFinite(endsAt) ||
        endsAt <= startsAt
    ) {
        return null;
    }
    return {
        sequence,
        name,
        startsAt: Math.trunc(startsAt),
        endsAt: Math.trunc(endsAt),
    };
};

export const normalizeRankedSeasonSnapshot = (value: unknown): RankedSeasonSnapshot => {
    const snapshot = asRecord(value);
    return {
        current: normalizeSeason(snapshot.current, "active"),
        next: normalizeSeason(snapshot.next, "upcoming"),
    };
};

export const fetchRankedSeasonSnapshot = async (): Promise<RankedSeasonSnapshot> => {
    const response = await axiosMMInstance.get(buildApiUrl(HOST_MATCHMAKING_API, endpoints.mm.seasonCurrent));
    return normalizeRankedSeasonSnapshot(response.data);
};
