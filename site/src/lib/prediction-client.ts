/**
 * Prediction-market client for the arena: reads the viewer's own bets and places new ones.
 *
 * The market is parimutuel with NO commission. A stake buys a share of the losing side's pool
 * proportional to its size within the winning pool, and the stake itself always comes back on a
 * win. Draws burn every stake. `proposedReturn` mirrors the server's settle math exactly, so the
 * number previewed on the button is the number paid out if the market closes as it stands.
 */

import { getAuthToken } from "./auth-state";

export interface PredictionBet {
    gameId: string;
    playerId: string;
    predictedPlayerId: string;
    amount: number;
    placedAt: number;
    status: "open" | "won" | "lost" | "burned" | "refunded";
    payout: number;
    settledAt: number;
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};

const asInteger = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const normalizeBet = (value: unknown): PredictionBet | null => {
    const row = asRecord(value);
    const gameId = asString(row.gameId);
    const predictedPlayerId = asString(row.predictedPlayerId);
    if (!gameId || !predictedPlayerId) {
        return null;
    }
    const status = asString(row.status);
    return {
        gameId,
        playerId: asString(row.playerId),
        predictedPlayerId,
        amount: Math.max(0, asInteger(row.amount)),
        placedAt: Math.max(0, asInteger(row.placedAt)),
        status:
            status === "won" || status === "lost" || status === "burned" || status === "refunded" ? status : "open",
        payout: Math.max(0, asInteger(row.payout)),
        settledAt: Math.max(0, asInteger(row.settledAt)),
    };
};

/**
 * Total gold returned for staking `amount` on a side that currently holds `sidePool` against
 * `otherPool` — the stake back plus its pro-rata share of the other side, floored. Mirrors the
 * server's computeParimutuelPayouts for the marginal bettor (asserted by a server-side test).
 */
export const proposedReturn = (amount: number, sidePool: number, otherPool: number): number => {
    if (amount <= 0) {
        return 0;
    }
    return amount + Math.floor((amount * Math.max(0, otherPool)) / (Math.max(0, sidePool) + amount));
};

/** Implied win probability of a side, as the market prices it (0.5 when nothing is staked yet). */
export const impliedShare = (sidePool: number, otherPool: number): number => {
    const total = Math.max(0, sidePool) + Math.max(0, otherPool);
    return total <= 0 ? 0.5 : Math.max(0, sidePool) / total;
};

const authHeaders = (): Record<string, string> => {
    const token = getAuthToken();
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: token } : {}),
    };
};

const errorMessage = async (response: Response, fallback: string): Promise<string> => {
    try {
        const text = await response.text();
        return text && text.length < 200 ? text : fallback;
    } catch {
        return fallback;
    }
};

export interface PredictionEndpoints {
    /** POST — place one immutable bet. */
    bet: string;
    /** GET — the viewer's own bets (optionally ?gameIds=a,b). */
    bets: string;
}

export const fetchMyBets = async (
    endpoints: PredictionEndpoints,
    gameIds: readonly string[] = [],
): Promise<PredictionBet[]> => {
    if (!getAuthToken()) {
        return [];
    }
    const query = gameIds.length ? `?gameIds=${encodeURIComponent(gameIds.join(","))}` : "";
    const response = await fetch(`${endpoints.bets}${query}`, { headers: authHeaders() });
    if (!response.ok) {
        return [];
    }
    const payload = asRecord(await response.json());
    const bets = Array.isArray(payload.bets) ? payload.bets : [];
    return bets.map(normalizeBet).filter((bet): bet is PredictionBet => bet !== null);
};

export const placeBet = async (
    endpoints: PredictionEndpoints,
    gameId: string,
    predictedPlayerId: string,
    amount: number,
): Promise<PredictionBet> => {
    const response = await fetch(endpoints.bet, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ gameId, predictedPlayerId, amount }),
    });
    if (!response.ok) {
        throw new Error(await errorMessage(response, "Could not place the prediction"));
    }
    const payload = asRecord(await response.json());
    const bet = normalizeBet(payload.bet);
    if (!bet) {
        throw new Error("Could not place the prediction");
    }
    return bet;
};
