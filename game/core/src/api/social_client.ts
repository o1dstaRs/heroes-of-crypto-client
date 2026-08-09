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
