import { v4 as uuidv4 } from "uuid";

import { axiosMMInstance, buildApiUrl, endpoints, HOST_MATCHMAKING_API } from "./axios";
import type { PresenceActivity } from "../ui/social/presenceActivity";

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
    /** How many friends are online right now (absent from an older server). */
    friendsOnline?: number;
    /** The viewer's own live ranked/lobby game, for the "return to your match" banner. */
    liveGame?: { gameId: string; stage: FriendGameStage };
}

export interface SocialNotification {
    id: string;
    type:
        | "friend_request"
        | "friend_accepted"
        | "friend_message"
        | "lobby_invite"
        | "sandbox_invite"
        | "chat_mention"
        | "chat_reply"
        | "system";
    fromPlayerId?: string;
    fromUsername?: string;
    requestId?: string;
    messageId?: string;
    lobbyId?: string;
    /** Co-op sandbox session id carried by a `sandbox_invite` — the direct link is /sandbox/<id>. */
    sandboxId?: string;
    body?: string;
    createdAt: number;
    seenAt: number;
    /** Invites only: when this player joined the room through the invite. */
    acceptedAt?: number;
    /** Invites only: whether the room can still be joined (false = closed, greyed and dead in the tray). */
    roomOpen?: boolean;
}

export const isRoomInvite = (notification: Pick<SocialNotification, "type">): boolean =>
    notification.type === "sandbox_invite" || notification.type === "lobby_invite";

/** The room an invite leads to, or undefined when the invite carries no room or the room has closed. */
export const inviteTarget = (
    notification: Pick<SocialNotification, "type" | "sandboxId" | "lobbyId" | "roomOpen">,
): string | undefined => {
    if (notification.roomOpen === false) {
        return undefined;
    }
    if (notification.type === "sandbox_invite" && notification.sandboxId) {
        return `/sandbox/${encodeURIComponent(notification.sandboxId)}`;
    }
    if (notification.type === "lobby_invite" && notification.lobbyId) {
        return `/lobby/${encodeURIComponent(notification.lobbyId)}`;
    }
    return undefined;
};

/** The short state word the tray appends to an invite: "accepted", "closed", or nothing. */
export const inviteStateLabel = (
    notification: Pick<SocialNotification, "type" | "acceptedAt" | "roomOpen">,
): string | undefined => {
    if (!isRoomInvite(notification)) {
        return undefined;
    }
    if (notification.roomOpen === false) {
        return "closed";
    }
    return notification.acceptedAt ? "accepted" : undefined;
};

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
    /** The ranked/lobby game the friend is in right now (only while it is live) and where it stands. */
    inGameId?: string;
    gameStage?: FriendGameStage;
    /** Waiting in the ranked matchmaking queue. */
    inQueue?: boolean;
    /** What their client last reported while online; `lobbyOpen` says whether that lobby still takes a guest. */
    activity?: PresenceActivity & { lobbyOpen?: boolean };
}

/**
 * The status word for a friend row, most binding state first: a live game, then the queue, then what their
 * client reports, then plain online/offline (the caller renders the latter).
 */
export const friendActivityLabel = (
    friend: Pick<FriendEntry, "inGameId" | "gameStage" | "inQueue" | "activity" | "online">,
): string | undefined => {
    const inGame = friendGameLabel(friend);
    if (inGame) {
        return inGame;
    }
    if (!friend.online) {
        return undefined;
    }
    if (friend.inQueue) {
        return "In the queue";
    }
    switch (friend.activity?.kind) {
        case "lobby":
            return "In a lobby";
        case "lobbies":
            return "Browsing lobbies";
        case "sandbox":
            return "In the sandbox";
        case "coop":
            return "In a co-op sandbox";
        case "arena":
            return "In the arena";
        case "game":
            return "Spectating";
        default:
            return undefined;
    }
};

/** A friend sitting in a joinable lobby can be joined straight from their row, unless you are in a game. */
export const joinableFriendLobbyId = (
    friend: Pick<FriendEntry, "inGameId" | "activity" | "online">,
    viewerInGameId: string | undefined,
): string | undefined =>
    friend.online &&
    !friend.inGameId &&
    !viewerInGameId &&
    friend.activity?.kind === "lobby" &&
    friend.activity.lobbyOpen
        ? friend.activity.lobbyId
        : undefined;

export type FriendGameStage = "confirming" | "pick" | "play";

/** What the friends row says next to a friend who is in a game. Undefined when they are not. */
export const friendGameLabel = (friend: Pick<FriendEntry, "inGameId" | "gameStage">): string | undefined => {
    if (!friend.inGameId) {
        return undefined;
    }
    switch (friend.gameStage) {
        case "play":
            return "In game · Fighting";
        case "pick":
            return "In game · Drafting";
        default:
            return "In game · Starting";
    }
};

/**
 * Spectating is offered for a friend's draft or fight, and never while YOU are in a game yourself: your
 * own match is what the game route would send you to. A match that is still being accepted has nothing
 * to watch yet.
 */
export const canSpectateFriend = (
    friend: Pick<FriendEntry, "inGameId" | "gameStage">,
    viewerInGameId: string | undefined,
): boolean => !!friend.inGameId && (friend.gameStage === "pick" || friend.gameStage === "play") && !viewerInGameId;

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
    /** The viewer's own live game, if any — while present, no friend can be spectated. */
    viewerInGameId?: string;
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

export const presencePing = (activity?: PresenceActivity): Promise<PresencePingResult> =>
    post(
        endpoints.social.presencePing,
        activity ? { activity: activity.kind, ...(activity.lobbyId ? { lobbyId: activity.lobbyId } : {}) } : {},
    );

/** Notification types that mean "a friend is asking for you" — they get the friend-invite sound. */
export const isFriendInviteNotification = (type: SocialNotification["type"]): boolean =>
    type === "friend_request" || type === "lobby_invite" || type === "sandbox_invite";

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
 * player at bet time; this keeps a player's own draft out of the UI before they can click it.
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

/**
 * This player's bets, newest first (all statuses). Pass `gameIds` to ask about specific games: the unscoped
 * list stops at the server's 200 newest, so only a scoped read reliably answers "did I bet on this game".
 */
export const fetchMyPredictionBets = async (gameIds?: readonly string[]): Promise<PredictionBet[]> => {
    const path = gameIds?.length
        ? `${endpoints.social.predictionBets}?gameIds=${gameIds.map(encodeURIComponent).join(",")}`
        : endpoints.social.predictionBets;
    const result = await get<{ bets?: PredictionBet[] }>(path);
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

/* --------------------------------------------------------------- arena chat */

export interface ArenaChatMessage {
    id: string;
    playerId: string;
    username: string;
    body: string;
    /** Player ids this line tagged — already resolved server-side against real accounts. */
    mentions: string[];
    /** How many upvotes the line has. The voter IDS stay on the server — see youVoted. */
    upvotes: number;
    /** Whether YOU voted, resolved server-side so the client never needs its own player id. */
    youVoted: boolean;
    /** Whether YOU reported. Other people's reports are nobody else's business and are not sent. */
    youReported: boolean;
    seasonSequence: number;
    createdAt: number;
    /** Present when this line replies to another. The quote is denormalized at post time on the
     * server, so it renders even after the original left the room. */
    replyToId?: string;
    replyToPlayerId?: string;
    replyToUsername?: string;
    replyToSnippet?: string;
}

/**
 * The arena room's history, oldest-first. `after` is the newest createdAt already held, which makes
 * this the polling cursor: an open arena pulls only what landed since, not the whole backlog.
 */
export const fetchArenaChat = async (after = 0): Promise<ArenaChatMessage[]> => {
    const query = after > 0 ? `?after=${encodeURIComponent(String(after))}` : "";
    const result = await get<{ messages?: ArenaChatMessage[] }>(`${endpoints.social.arenaChat}${query}`);
    return Array.isArray(result.messages) ? result.messages : [];
};

/**
 * Post one line. The server refuses stop words, external links, over-long text and too-fast posting
 * with a human message — surface it with socialErrorMessage rather than inventing wording here, so
 * the player is told which rule they hit.
 */
/** Toggle your upvote. A second call removes it — the vote is set membership, not a counter. */
export const upvoteArenaChat = (messageId: string): Promise<{ upvotes: number; voted: boolean }> =>
    post(endpoints.social.arenaChatUpvote, { messageId });

/** Report a line. Hidden for everyone once enough distinct players report it. */
export const reportArenaChat = (messageId: string): Promise<{ reports: number; hidden: boolean }> =>
    post(endpoints.social.arenaChatReport, { messageId });

export const postArenaChat = (
    body: string,
    replyToMessageId?: string,
): Promise<{ message: ArenaChatMessage; mentioned: string[] }> =>
    post(endpoints.social.arenaChatPost, { body, ...(replyToMessageId ? { replyToMessageId } : {}) });

/** The public ranked-profile slice the chat's player card shows. Served without auth; a player who
 * never entered ranked 404s (surface as "no ranked record" rather than an error). */
export interface PublicPlayerStats {
    playerId: string;
    username: string;
    state?: "calibration" | "placed" | "recalibration";
    /** 0 until placed — the provisional calibration MMR is never public. */
    mmr?: number;
    league?: number;
    leagueName?: string;
    /** Gold third inside the league: 1 Ragged, 2 Stacked, 3 Whale (0 = unplaced). */
    wealth?: number;
    wealthName?: string;
    standingTitle?: string;
    leaderboardRank?: number;
    calibration?: { required: number; gamesPlayed: number };
    wins?: number;
    losses?: number;
    draws?: number;
    totalGames?: number;
    winRatePct?: number;
    winStreak?: number;
    lossStreak?: number;
    gold?: number;
    peakMmr?: number;
    lastRankedGameAt?: number;
    /** Public recent form. Creature ids are optional until the ranked profile API exposes each lineup. */
    recentGames?: Array<{
        gameId: string;
        finishedTime: number;
        result: "win" | "loss" | "draw";
        mmrDelta?: number;
        creatureIds?: number[];
        opponent?: { playerId: string; username: string } | null;
    }>;
    /** The public profile's aggregate picks, used when historical matches predate lineup storage. */
    playstyle?: {
        topCreatures?: Array<{
            creatureId: number;
            name?: string;
            games?: number;
            winRatePct?: number;
        }>;
    } | null;
}

export const fetchPublicPlayerStats = async (playerId: string): Promise<PublicPlayerStats> => {
    const response = await axiosMMInstance.get(`${endpoints.mm.rankedProfile}/${encodeURIComponent(playerId)}`, {
        headers: authHeaders(),
    });
    return response.data as PublicPlayerStats;
};

/** One rendered run of a chat line: plain text, a resolved @tag, or an internal link. */
export type ChatSegment =
    | { kind: "text"; text: string }
    | { kind: "mention"; text: string; isSelf: boolean }
    | { kind: "link"; text: string; href: string };

/**
 * Split a message into renderable runs.
 *
 * Only two things are ever given special treatment, and both are safe by construction: an @tag
 * (plain highlighting, no navigation) and a link — which the SERVER has already guaranteed is
 * internal, since an external one could not have been posted. This function therefore never has to
 * decide whether a URL is safe to render; it only has to find it.
 */
export const chatSegments = (body: string, selfUsername?: string): ChatSegment[] => {
    const segments: ChatSegment[] = [];
    const pattern = /(?<![\w@])@([A-Za-z0-9][A-Za-z0-9_.-]{2,49})|((?:https?:\/\/|www\.)[^\s<>"']+)/g;
    let cursor = 0;
    for (const match of body.matchAll(pattern)) {
        const index = match.index ?? 0;
        if (index > cursor) {
            segments.push({ kind: "text", text: body.slice(cursor, index) });
        }
        if (match[1]) {
            const handle = match[1].replace(/[.]+$/, "");
            segments.push({
                kind: "mention",
                text: `@${handle}`,
                isSelf: !!selfUsername && handle.toLowerCase() === selfUsername.toLowerCase(),
            });
            cursor = index + 1 + handle.length;
        } else {
            const raw = match[2];
            segments.push({ kind: "link", text: raw, href: /^https?:\/\//i.test(raw) ? raw : `https://${raw}` });
            cursor = index + raw.length;
        }
    }
    if (cursor < body.length) {
        segments.push({ kind: "text", text: body.slice(cursor) });
    }
    return segments;
};
