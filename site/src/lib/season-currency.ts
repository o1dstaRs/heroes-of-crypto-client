export interface SeasonCurrency {
    name: string;
    symbol: string;
    /** Raw, server-validated SVG markup. It must only be consumed through seasonCurrencyIconUrl(). */
    iconSvg: string;
}

export interface SeasonCurrencyWindow {
    sequence: number;
    name: string;
    startsAt: number;
    endsAt: number;
    currency: SeasonCurrency;
}

export interface SeasonCurrencyCatalog {
    currentSequence: number;
    current: SeasonCurrencyWindow | null;
    seasons: SeasonCurrencyWindow[];
}

export const LEGACY_SEASON_CURRENCY: SeasonCurrency = {
    name: "Gold",
    symbol: "G",
    iconSvg: "",
};

export const LEGACY_SEASON_CURRENCY_ICON_URL = "/assets/icons/currency/gold.svg";

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};

const asString = (value: unknown, fallback: string): string =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;

const asInteger = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;

export function normalizeSeasonCurrency(
    value: unknown,
    fallback: SeasonCurrency = LEGACY_SEASON_CURRENCY,
): SeasonCurrency {
    const row = asRecord(value);
    return {
        name: asString(row.name, fallback.name),
        symbol: asString(row.symbol, fallback.symbol),
        iconSvg: asString(row.iconSvg, fallback.iconSvg),
    };
}

export function normalizeSeasonCurrencyCatalog(value: unknown): SeasonCurrencyCatalog {
    const row = asRecord(value);
    const seasons = (Array.isArray(row.seasons) ? row.seasons : [])
        .map((value): SeasonCurrencyWindow | null => {
            const season = asRecord(value);
            const sequence = Math.max(0, asInteger(season.sequence));
            const startsAt = Math.max(0, asInteger(season.startsAt));
            const endsAt = Math.max(0, asInteger(season.endsAt));
            if (!sequence || endsAt <= startsAt) {
                return null;
            }
            return {
                sequence,
                name: asString(season.name, `Season ${sequence}`),
                startsAt,
                endsAt,
                currency: normalizeSeasonCurrency(season.currency),
            };
        })
        .filter((season): season is SeasonCurrencyWindow => season !== null)
        .sort((left, right) => left.startsAt - right.startsAt || left.sequence - right.sequence);
    const currentSequence = Math.max(0, asInteger(row.currentSequence));
    return {
        currentSequence,
        current: seasons.find((season) => season.sequence === currentSequence) ?? null,
        seasons,
    };
}

export function seasonCurrencyForTimestamp(
    catalog: SeasonCurrencyCatalog | null | undefined,
    timestamp: number,
    fallback: SeasonCurrency = LEGACY_SEASON_CURRENCY,
): SeasonCurrency {
    if (!catalog || !Number.isFinite(timestamp) || timestamp <= 0) {
        return fallback;
    }
    return (
        catalog.seasons.find((season) => timestamp >= season.startsAt && timestamp < season.endsAt)?.currency ??
        fallback
    );
}

export interface SeasonCurrencyCatalogUrlOptions {
    baseUrl?: string;
    production?: boolean;
}

const runtimeIsProduction = (): boolean => {
    const hostname = globalThis.location?.hostname ?? "";
    return (
        hostname === "heroesofcrypto.io" ||
        hostname.endsWith(".heroesofcrypto.io") ||
        import.meta.env.PROD === true ||
        import.meta.env.VITE_IS_PROD === "true"
    );
};

const sameHostOrigin = (port: string | number | undefined): string | undefined => {
    if (!port || typeof globalThis.location === "undefined") {
        return undefined;
    }
    return `${globalThis.location.protocol}//${globalThis.location.hostname}:${port}`;
};

const runtimeBaseUrl = (production: boolean): string =>
    String(
        sameHostOrigin(import.meta.env.VITE_ARENA_SAME_HOST_API_PORT as string | undefined) ||
            import.meta.env.VITE_HOST_MATCHMAKING_API ||
            import.meta.env.VITE_MATCHMAKING_API ||
            (production ? "https://mm.heroesofcrypto.io" : "http://localhost:3001"),
    ).replace(/\/+$/, "");

export function buildSeasonCurrencyCatalogUrl(options: SeasonCurrencyCatalogUrlOptions = {}): string {
    const production = options.production ?? runtimeIsProduction();
    const baseUrl = (options.baseUrl ?? runtimeBaseUrl(production)).replace(/\/+$/, "");
    return `${baseUrl}${production ? "/v1/seasons" : "/v1/mm/seasons"}`;
}

export async function fetchSeasonCurrencyCatalog(): Promise<SeasonCurrencyCatalog> {
    const response = await fetch(buildSeasonCurrencyCatalogUrl(), {
        cache: "no-store",
        headers: { Accept: "application/json" },
    });
    if (!response.ok) {
        throw new Error(`Season currency request failed with status ${response.status}`);
    }
    return normalizeSeasonCurrencyCatalog(await response.json());
}

/**
 * Turns validated SVG markup into an encoded image URL. Callers assign this URL to an `<img src>`;
 * they must never inject `iconSvg` into HTML or the DOM as markup.
 */
export function seasonCurrencyIconUrl(currency?: Pick<SeasonCurrency, "iconSvg"> | string | null): string {
    const iconSvg = (typeof currency === "string" ? currency : currency?.iconSvg)?.trim() ?? "";
    if (!/^<svg(?:\s|>)/i.test(iconSvg)) {
        return LEGACY_SEASON_CURRENCY_ICON_URL;
    }
    try {
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg)}`;
    } catch {
        return LEGACY_SEASON_CURRENCY_ICON_URL;
    }
}
