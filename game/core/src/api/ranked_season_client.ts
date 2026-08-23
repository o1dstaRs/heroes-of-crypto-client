import { axiosMMInstance, buildApiUrl, endpoints, HOST_MATCHMAKING_API } from "./axios";

export interface RankedSeasonCurrency {
    name: string;
    symbol: string;
    /** Validated raw SVG from the public season endpoint. Render it only through an encoded image URL. */
    iconSvg: string | null;
}

export const CANONICAL_GOLD_CURRENCY: Readonly<RankedSeasonCurrency> = Object.freeze({
    name: "Gold",
    symbol: "G",
    iconSvg: null,
});

export interface RankedSeasonSummary {
    sequence: number;
    name: string;
    startsAt: number;
    endsAt: number;
    currency: RankedSeasonCurrency;
}

export interface RankedSeasonSnapshot {
    current: RankedSeasonSummary | null;
    next: RankedSeasonSummary | null;
}

export type RankedSeasonCatalog = readonly RankedSeasonSummary[];

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};

const normalizedCurrencyText = (value: unknown, fallback: string, maxLength: number): string => {
    if (typeof value !== "string") {
        return fallback;
    }
    const normalized = value.trim();
    return normalized && normalized.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(normalized)
        ? normalized
        : fallback;
};

/**
 * The API validates SVG before publishing it, but the browser still treats the response as untrusted data.
 * Keep only a bounded SVG document and later encode it as an <img> data URL; malformed values use bundled gold.
 */
export const normalizeRankedSeasonCurrency = (value: unknown): RankedSeasonCurrency => {
    const currency = asRecord(value);
    const rawIconSvg = typeof currency.iconSvg === "string" ? currency.iconSvg.trim() : "";
    const iconBytes = rawIconSvg ? new TextEncoder().encode(rawIconSvg).byteLength : 0;
    const hasActiveSvgContent =
        /<(?:script|foreignObject|iframe|object|embed)(?:\s|>)/i.test(rawIconSvg) ||
        /\son[a-z]+\s*=/i.test(rawIconSvg) ||
        /(?:href|xlink:href)\s*=\s*["']?\s*(?:javascript:|data:text\/html)/i.test(rawIconSvg) ||
        /<!\s*(?:doctype|entity)/i.test(rawIconSvg);
    const iconSvg =
        iconBytes > 0 &&
        iconBytes <= 16 * 1024 &&
        /^<svg(?:\s|>)/i.test(rawIconSvg) &&
        /<\/svg>\s*$/i.test(rawIconSvg) &&
        !hasActiveSvgContent
            ? rawIconSvg
            : null;
    return {
        name: normalizedCurrencyText(currency.name, CANONICAL_GOLD_CURRENCY.name, 40),
        symbol: normalizedCurrencyText(currency.symbol, CANONICAL_GOLD_CURRENCY.symbol, 8),
        iconSvg,
    };
};

/** Raw seasonal artwork is never inserted into the DOM; percent-encoding makes it an inert image source. */
export const currencyIconSvgDataUrl = (iconSvg: string | null | undefined): string | undefined => {
    if (!iconSvg) {
        return undefined;
    }
    try {
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg)}`;
    } catch {
        return undefined;
    }
};

type RankedSeasonStatus = "active" | "finished" | "upcoming";

const normalizeSeason = (value: unknown, status: RankedSeasonStatus): RankedSeasonSummary | null => {
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
        currency: normalizeRankedSeasonCurrency(season.currency),
    };
};

export const normalizeRankedSeasonSnapshot = (value: unknown): RankedSeasonSnapshot => {
    const snapshot = asRecord(value);
    return {
        current: normalizeSeason(snapshot.current, "active"),
        next: normalizeSeason(snapshot.next, "upcoming"),
    };
};

/** Normalize the public `/seasons` response into one deterministic, de-duplicated timeline. */
export const normalizeRankedSeasonCatalog = (value: unknown): RankedSeasonCatalog => {
    const rawSeasons = asRecord(value).seasons;
    if (!Array.isArray(rawSeasons)) {
        return [];
    }

    const bySequence = new Map<number, RankedSeasonSummary>();
    for (const rawSeason of rawSeasons) {
        const status = asRecord(rawSeason).status;
        if (status !== "active" && status !== "finished" && status !== "upcoming") {
            continue;
        }
        const season = normalizeSeason(rawSeason, status);
        if (season && !bySequence.has(season.sequence)) {
            bySequence.set(season.sequence, season);
        }
    }

    return [...bySequence.values()].sort(
        (left, right) => left.startsAt - right.startsAt || left.endsAt - right.endsAt || left.sequence - right.sequence,
    );
};

/** Resolve the currency that was active when a historical event finished; gaps are legacy Gold. */
export const rankedSeasonCurrencyAt = (
    seasons: RankedSeasonCatalog,
    timestamp: number | null | undefined,
): Readonly<RankedSeasonCurrency> => {
    const eventTime = Number(timestamp);
    if (!Number.isFinite(eventTime) || eventTime <= 0) {
        return CANONICAL_GOLD_CURRENCY;
    }

    let matchingSeason: RankedSeasonSummary | undefined;
    for (const season of seasons) {
        if (
            eventTime >= season.startsAt &&
            eventTime < season.endsAt &&
            (!matchingSeason ||
                season.startsAt > matchingSeason.startsAt ||
                (season.startsAt === matchingSeason.startsAt && season.sequence > matchingSeason.sequence))
        ) {
            matchingSeason = season;
        }
    }
    return matchingSeason?.currency ?? CANONICAL_GOLD_CURRENCY;
};

/** The legacy server transport still says "gold" in insufficient-funds errors. */
export const isInsufficientSeasonCurrencyError = (value: unknown): boolean => {
    const error = asRecord(value);
    const response = asRecord(error.response);
    const candidates = [
        typeof value === "string" ? value : "",
        typeof error.message === "string" ? error.message : "",
        typeof response.data === "string" ? response.data : "",
    ];
    return candidates.some((candidate) => /\bnot enough gold\b/i.test(candidate));
};

export const fetchRankedSeasonSnapshot = async (): Promise<RankedSeasonSnapshot> => {
    const response = await axiosMMInstance.get(buildApiUrl(HOST_MATCHMAKING_API, endpoints.mm.seasonCurrent));
    return normalizeRankedSeasonSnapshot(response.data);
};

export const fetchRankedSeasonCatalog = async (): Promise<RankedSeasonCatalog> => {
    const response = await axiosMMInstance.get(buildApiUrl(HOST_MATCHMAKING_API, endpoints.mm.seasons));
    return normalizeRankedSeasonCatalog(response.data);
};
