export const TERMINAL_MATCHMAKING_STREAM_ERROR = "Max reconnection attempts reached";

export interface MatchmakingCurrentGame {
    id?: string;
    confirmed?: boolean;
    abandoned?: boolean;
}

/** Accept only persisted player ids from the matchmaking stream; malformed decoration is ignored. */
export const matchmakingOpponentId = (value: unknown): string => {
    if (typeof value !== "string") {
        return "";
    }
    const normalized = value.trim();
    return normalized.length === 36 && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : "";
};

export type ConfirmFailureResolution = "accepted" | "rejected" | "unknown";
export type TerminalHandoffResolution = "navigate" | "retry-confirm" | "recover";

export const isAcceptedMatchHandoff = (acceptedGameId: string, pendingGameId: string): boolean =>
    acceptedGameId.length > 0 && acceptedGameId === pendingGameId;

export const isCurrentAcceptAttempt = ({
    acceptedGameId,
    attempt,
    currentAttempt,
    expectedGameId,
    mounted,
    pendingGameId,
}: {
    acceptedGameId: string;
    attempt: number;
    currentAttempt: number;
    expectedGameId: string;
    mounted: boolean;
    pendingGameId: string;
}): boolean =>
    mounted &&
    attempt === currentAttempt &&
    expectedGameId === pendingGameId &&
    isAcceptedMatchHandoff(acceptedGameId, pendingGameId);

/**
 * A matchmaking stream can briefly drop while an accepted match is being promoted. The stream owns
 * the eventual navigation frame, so a retryable transport error during that narrow handoff is not a
 * player-facing failure. A terminal reconnect failure still needs to be surfaced.
 */
export const shouldSurfaceMatchmakingStreamError = (
    message: string,
    acceptedGameId: string,
    pendingGameId: string,
    sourceIsCurrent = true,
): boolean =>
    sourceIsCurrent &&
    (!isAcceptedMatchHandoff(acceptedGameId, pendingGameId) || message === TERMINAL_MATCHMAKING_STREAM_ERROR);

type ConfirmFailureEvidence = {
    code?: unknown;
    message?: unknown;
    response?: { status?: unknown };
};

/** Only transport uncertainty, a request timeout, or a server fault can plausibly hide a committed write. */
export const isAmbiguousConfirmFailure = (value: unknown): boolean => {
    const error = (value ?? {}) as ConfirmFailureEvidence;
    const status = Number(error.response?.status);
    if (Number.isInteger(status) && status > 0) {
        return status === 408 || status >= 500;
    }

    const code = typeof error.code === "string" ? error.code.toUpperCase() : "";
    if (["ECONNABORTED", "ERR_NETWORK", "ETIMEDOUT"].includes(code)) {
        return true;
    }

    const message = typeof error.message === "string" ? error.message : "";
    return /network error|failed to fetch|load failed|connection aborted|timed? ?out|internal server error|bad gateway|service unavailable|status code 5\d{2}/i.test(
        message,
    );
};

/**
 * POST /confirm can lose its response after the write committed. GET /current is the authority for
 * whether this player's seat was actually confirmed; a failed reconciliation leaves the result unknown
 * and lets the independent matchmaking stream finish the handoff.
 */
export const resolveConfirmFailure = (
    expectedGameId: string,
    currentGame: MatchmakingCurrentGame | null,
    reconciliationSucceeded: boolean,
    ambiguousFailure: boolean,
): ConfirmFailureResolution => {
    if (!reconciliationSucceeded) {
        return ambiguousFailure ? "unknown" : "rejected";
    }
    if (currentGame?.id === expectedGameId && currentGame.confirmed === true && !currentGame.abandoned) {
        return "accepted";
    }
    return "rejected";
};

export const resolveTerminalHandoff = (
    expectedGameId: string,
    currentGame: MatchmakingCurrentGame | null,
    reconciliationSucceeded: boolean,
): TerminalHandoffResolution => {
    if (!reconciliationSucceeded || currentGame?.id !== expectedGameId || currentGame.abandoned) {
        return "recover";
    }
    return currentGame.confirmed === true ? "navigate" : "retry-confirm";
};
