import { v4 as uuidv4 } from "uuid";

import { axiosMMInstance, buildApiUrl, endpoints, HOST_MATCHMAKING_API } from "./axios";

/**
 * Client for the authenticated social API (notifications, friends/blocks, presence). Plain JSON
 * over the matchmaking host; the Authorization header carries the raw session token like the rest
 * of the app (see auth_utils.setSession / player_portal_client.authHeaders).
 */

const STORAGE_KEY = "accessToken";

const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem(STORAGE_KEY);
    return {
        "x-request-id": uuidv4(),
        ...(token ? { Authorization: token } : {}),
    };
};

export interface PendingIncomingRequest {
    requestId: string;
    fromPlayerId: string;
    fromUsername: string;
    createdAt: number;
}

export interface PresencePingResult {
    unseenCount: number;
    pendingIncoming: PendingIncomingRequest[];
}

export interface SocialNotification {
    id: string;
    type: "friend_request" | "friend_accepted" | "friend_message" | "lobby_invite" | "system";
    fromPlayerId?: string;
    fromUsername?: string;
    requestId?: string;
    messageId?: string;
    lobbyId?: string;
    body?: string;
    createdAt: number;
    seenAt: number;
}

export interface FriendEntry {
    playerId: string;
    username: string;
    online: boolean;
    lastOnlineAt: number;
    muted: boolean;
    unreadCount: number;
    /**
     * Season gold. OPTIONAL for the same reason presence is: an older matchmaking server does not send it,
     * and a player who has never entered ranked has no season profile to read it from. Both cases mean
     * "no figure", which the row draws as a dash — never as a zero the player has not earned.
     */
    gold?: number;
}

export interface FriendMessage {
    id: string;
    conversationId: string;
    senderId: string;
    recipientId: string;
    body: string;
    createdAt: number;
    readAt: number;
}

export interface FriendConversation {
    friend: FriendEntry;
    messages: FriendMessage[];
    hasMore: boolean;
}

export interface FriendsOverview {
    friends: FriendEntry[];
    incoming: PendingIncomingRequest[];
    outgoing: { requestId: string; toPlayerId: string; toUsername: string; createdAt: number }[];
    blocked: { playerId: string; username: string; createdAt: number }[];
}

export interface PlayerSearchHit {
    id: string;
    username: string;
    /**
     * Presence for the search row, same figures the friends list shows. OPTIONAL on purpose: a client can
     * run against a matchmaking server that predates the enriched player-search response, and a missing
     * field must read as "not known" rather than as "offline since never". Callers should branch on
     * `undefined` instead of coercing to a boolean.
     */
    online?: boolean;
    lastOnlineAt?: number;
    /** Season gold, on the same optional terms as the presence pair above. */
    gold?: number;
}

const post = async <T>(path: string, body?: Record<string, unknown>): Promise<T> => {
    const url = buildApiUrl(HOST_MATCHMAKING_API, path);
    const response = await axiosMMInstance.post(url, body ?? {}, { headers: authHeaders() });
    return response.data as T;
};

const get = async <T>(path: string): Promise<T> => {
    const url = buildApiUrl(HOST_MATCHMAKING_API, path);
    const response = await axiosMMInstance.get(url, { headers: authHeaders() });
    return response.data as T;
};

export const presencePing = (): Promise<PresencePingResult> => post(endpoints.social.presencePing);

export const fetchNotifications = (): Promise<{ notifications: SocialNotification[]; unseenCount: number }> =>
    get(endpoints.social.notifications);

export const markNotificationsSeen = (): Promise<{ ok: boolean }> => post(endpoints.social.notificationsSeen);

export const sendFriendRequest = (username: string): Promise<{ status: "requested" | "accepted"; username: string }> =>
    post(endpoints.social.friendRequest, { username });

export const respondFriendRequest = (requestId: string, accept: boolean): Promise<{ accepted: boolean }> =>
    post(endpoints.social.friendRespond, { requestId, accept });

export const removeFriend = (playerId: string): Promise<{ ok: boolean }> =>
    post(endpoints.social.friendRemove, { playerId });

/** Invite a friend into the lobby you're currently in; it lands in their notification tray. */
export const sendLobbyInvite = async (toPlayerId: string, lobbyId: string): Promise<void> => {
    await post(endpoints.social.friendInvite, { toPlayerId, lobbyId });
};

export const blockPlayer = (playerId: string): Promise<{ ok: boolean }> =>
    post(endpoints.social.friendBlock, { playerId });

export const unblockPlayer = (playerId: string): Promise<{ ok: boolean }> =>
    post(endpoints.social.friendUnblock, { playerId });

export const fetchFriends = (): Promise<FriendsOverview> => get(endpoints.social.friends);

export const fetchFriendMessages = (playerId: string, before?: number): Promise<FriendConversation> => {
    const query = new URLSearchParams({ playerId });
    if (before) {
        query.set("before", String(before));
    }
    return get(`${endpoints.social.friendMessages}?${query.toString()}`);
};

export const sendFriendMessage = (playerId: string, message: string): Promise<FriendMessage> =>
    post(endpoints.social.friendMessage, { playerId, message });

export const markFriendMessagesRead = (playerId: string): Promise<{ ok: boolean }> =>
    post(endpoints.social.friendMessagesRead, { playerId });

export const setFriendMuted = (playerId: string, muted: boolean): Promise<{ muted: boolean }> =>
    post(endpoints.social.friendMute, { playerId, muted });

export interface RankedBanPreference {
    creatureId: number;
    creatureName: string;
}

/** The player's stored ranked pre-game ban ("the ONE unit I never want in my drafts"). */
export const fetchRankedBan = (): Promise<RankedBanPreference> => get(endpoints.social.rankedBan);

/** Set (or clear with 0) the ranked pre-game ban preference. */
export const setRankedBan = (creatureId: number): Promise<RankedBanPreference> =>
    post(endpoints.social.rankedBan, { creatureId });

export interface RankedStanding {
    state: "calibration" | "placed" | "recalibration";
    mmr: number;
    peakMmr: number;
    league: number;
    leagueName: string;
    /** Gold third inside the league: 1 Ragged, 2 Stacked, 3 Whale (0 = unplaced). */
    wealth: number;
    wealthName: string;
    /** Wealth and league in one line, as the server renders it: "Whale Marshal". */
    standingTitle: string;
    leaderboardRank: number;
    calibration: {
        required: number;
        gamesPlayed: number;
        remaining: number;
        wins: number;
        draws: number;
        losses: number;
    };
    previous: { league: number; leagueName: string; mmr: number } | null;
    wins: number;
    losses: number;
    draws: number;
    totalGames: number;
    winStreak: number;
    lossStreak: number;
    gold: number;
}

/** The signed-in player's own ranked standing (calibration progress, or league once placed). */
export const fetchRankedStanding = (): Promise<RankedStanding> => get(endpoints.social.rankedStanding);

export interface PredictionSeat {
    playerId: string;
    username: string;
    pool: number;
    bets: number;
}

export interface PredictionMarket {
    gameId: string;
    pickEndTime: number;
    totalPool: number;
    totalBets: number;
    seats: PredictionSeat[];
}

export interface PredictionBet {
    gameId: string;
    playerId: string;
    predictedPlayerId: string;
    amount: number;
    placedAt: number;
    seasonSequence?: number;
    status: "open" | "won" | "lost" | "burned" | "refunded";
    payout: number;
    settledAt: number;
}

export interface PredictionMarketViewer {
    gameId?: string;
    username?: string;
}

/**
 * Markets a signed-in spectator may back. The server is still authoritative and rejects either
 * player at bet time; this keeps a commander's own draft out of the UI before they can click it.
 * Username matching covers the current auth payload, which intentionally carries no player id.
 */
export const eligiblePredictionMarkets = (
    markets: readonly PredictionMarket[],
    viewer: PredictionMarketViewer,
): PredictionMarket[] => {
    const gameId = viewer.gameId?.trim() ?? "";
    const username = viewer.username?.trim().toLocaleLowerCase() ?? "";
    return markets.filter(
        (market) =>
            (!gameId || market.gameId !== gameId) &&
            (!username || !market.seats.some((seat) => seat.username.trim().toLocaleLowerCase() === username)),
    );
};

export const settledPredictionBetsForSeason = (
    bets: readonly PredictionBet[],
    seasonSequence: number | undefined,
): PredictionBet[] =>
    seasonSequence === undefined
        ? []
        : bets.filter((bet) => bet.status !== "open" && bet.seasonSequence === seasonSequence);

/** Games still drafting, with both sides' stake pools. Public — no token needed. */
export const fetchPredictionMarkets = async (): Promise<PredictionMarket[]> => {
    const result = await get<{ markets?: PredictionMarket[] }>(endpoints.social.predictionMarkets);
    return result.markets ?? [];
};

/** Every bet this player has placed, newest first (all statuses). */
export const fetchMyPredictionBets = async (): Promise<PredictionBet[]> => {
    const result = await get<{ bets?: PredictionBet[] }>(endpoints.social.predictionBets);
    return result.bets ?? [];
};

/** Stake gold on one side of a drafting game. One immutable bet per game. */
export const placePredictionBet = async (
    gameId: string,
    predictedPlayerId: string,
    amount: number,
): Promise<PredictionBet> => {
    const result = await post<{ bet: PredictionBet }>(endpoints.social.predictionBet, {
        gameId,
        predictedPlayerId,
        amount,
    });
    return result.bet;
};

/**
 * Total gold returned for staking `amount` on a side holding `sidePool` against `otherPool` — the
 * stake back plus its pro-rata share of the other side, floored. Mirrors the server's settle math
 * exactly, so the previewed number is the number paid if the market closes as it stands.
 */
export const predictionReturn = (amount: number, sidePool: number, otherPool: number): number =>
    amount <= 0 ? 0 : amount + Math.floor((amount * Math.max(0, otherPool)) / (Math.max(0, sidePool) + amount));

export const searchPlayers = async (query: string): Promise<PlayerSearchHit[]> => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
        return [];
    }
    const path = `${endpoints.social.playerSearch}?q=${encodeURIComponent(trimmed)}`;
    const result = await get<{ players: PlayerSearchHit[] }>(path);
    return result.players ?? [];
};

/** Server Http errors arrive as plain-text bodies; surface them as human-readable messages. */
export const socialErrorMessage = (err: unknown, fallback: string): string => {
    const data = (err as { response?: { data?: unknown } })?.response?.data;
    if (typeof data === "string" && data.length > 0 && data.length < 200) {
        return data;
    }
    if (data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string") {
        return (data as { message: string }).message;
    }
    return fallback;
};

/** "Online" / "5m ago" / "3h ago" / "12d ago" — the friends list's last-seen phrasing. */
export const formatLastSeen = (lastOnlineAt: number, now: number = Date.now()): string => {
    if (!lastOnlineAt) {
        return "never";
    }
    const deltaMs = Math.max(0, now - lastOnlineAt);
    const minutes = Math.floor(deltaMs / 60_000);
    if (minutes < 1) {
        return "just now";
    }
    if (minutes < 60) {
        return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }
    return `${Math.floor(hours / 24)}d ago`;
};

/**
 * The presence caption for one add-friend search row: "Online", or the last-seen phrasing above.
 *
 * Returns undefined when the server sent no presence at all — a client can be talking to a matchmaking
 * build that predates the enriched player-search response. That case means UNKNOWN and must render as
 * nothing: labelling a player "never" because the field is missing would be a confident lie about
 * somebody who might be online right now. `lastOnlineAt` of 0 is different — the server DID answer, and
 * genuinely has no record — so it keeps formatLastSeen's honest "never".
 */
export const searchHitPresenceLabel = (hit: PlayerSearchHit, now: number = Date.now()): string | undefined => {
    if (hit.online === undefined) {
        return undefined;
    }
    return hit.online ? "Online" : formatLastSeen(hit.lastOnlineAt ?? 0, now);
};

/* ------------------------------------------------------------- ranked wagers */

export interface WagerIntentState {
    amount: number;
    gold: number;
}

export interface WagerState {
    gameId: string;
    status: "negotiating" | "raised" | "locked" | "settled" | "burned" | "refunded";
    /** The per-player amount currently being played for (the floor until locked/raised). */
    amount: number;
    raisedTo: number;
    deadlineAt: number;
    myStake: number;
    opponentStake: number;
    myTurn: boolean;
    winnerPlayerId: string;
    payout: number;
}

/** The caller's standing next-match stake + live purse (drives the arena stake box). */
export const fetchWagerIntent = async (): Promise<WagerIntentState> =>
    get<WagerIntentState>(endpoints.social.wagerIntent);

/** Arm/replace (amount > 0) or clear (amount = 0) the next-match stake. Escrow moves immediately. */
export const setWagerIntent = async (amount: number): Promise<WagerIntentState> =>
    post<WagerIntentState>(endpoints.social.wagerIntent, { amount });

/** The live wager on one of MY games, or null when none formed / I am not a participant. */
export const fetchWager = async (gameId: string): Promise<WagerState | null> => {
    const result = await get<{ wager: WagerState | null }>(
        `${endpoints.social.wager}?gameId=${encodeURIComponent(gameId)}`,
    );
    return result.wager;
};

export const callWager = async (gameId: string): Promise<void> => {
    await post(endpoints.social.wagerCall, { gameId });
};

export const raiseWager = async (gameId: string, amount: number): Promise<void> => {
    await post(endpoints.social.wagerRaise, { gameId, amount });
};
