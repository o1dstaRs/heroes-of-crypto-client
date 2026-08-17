import CasinoRoundedIcon from "@mui/icons-material/CasinoRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    IconButton,
    Input,
    Modal,
    ModalDialog,
    Stack,
    Typography,
} from "@mui/joy";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";

import { setVolumeSlot } from "../audio/volumeSlot";
import { CurrencyIcon } from "../GoldCurrencyIcon";
import { useRankedSeason } from "../useRankedSeason";
import { ConversationPanel } from "./ConversationPanel";
import { useCurrentLobby } from "./CurrentLobbyContext";
import { DockPanelShell } from "./DockPanelShell";
import { PredictionsPanel } from "./PredictionsPanel";
import { getSocialDockSlot, getSocialDockSlotServerSnapshot, subscribeSocialDockSlot } from "./socialDockSlot";
import { useSocial } from "./SocialProvider";
import {
    blockPlayer,
    fetchFriends,
    fetchNotifications,
    formatLastSeen,
    searchHitPresenceLabel,
    markNotificationsSeen,
    removeFriend,
    searchPlayers,
    sendFriendRequest,
    sendLobbyInvite,
    setFriendMuted,
    socialErrorMessage,
    unblockPlayer,
    type FriendsOverview,
    type FriendEntry,
    type PlayerSearchHit,
    type SocialNotification,
} from "../../api/social_client";
import { useAuthContext } from "../auth/context/auth_context";
import {
    hocColors,
    hocDangerAlertSx,
    hocPanelSx,
    hocInputSx,
    hocPrimaryButtonSx,
    hocSoftButtonSx,
    hocSpinnerSx,
} from "../hocTheme";

/**
 * Floating social dock: notification bell, friends list, and direct messages mounted once above
 * the router. During a fight it collapses to smaller controls and suppresses unsolicited request
 * popups, while leaving conversations available on demand.
 */

const dockButtonTones = {
    predictions: {
        color: "#d3ad67",
        background: "rgba(42, 31, 16, 0.94)",
        backgroundHover: "rgba(54, 40, 20, 0.98)",
        border: "rgba(211, 173, 103, 0.34)",
        glow: "rgba(211, 173, 103, 0.1)",
    },
    friends: {
        color: "#71aaa6",
        background: "rgba(16, 38, 37, 0.94)",
        backgroundHover: "rgba(21, 49, 47, 0.98)",
        border: "rgba(113, 170, 166, 0.32)",
        glow: "rgba(113, 170, 166, 0.09)",
    },
    notifications: {
        color: "#c98272",
        background: "rgba(47, 27, 23, 0.94)",
        backgroundHover: "rgba(59, 34, 29, 0.98)",
        border: "rgba(201, 130, 114, 0.32)",
        glow: "rgba(201, 130, 114, 0.09)",
    },
} as const;

const dockButtonSx = (
    tone: (typeof dockButtonTones)[keyof typeof dockButtonTones],
    active: boolean,
    compact: boolean,
) => ({
    width: compact ? 38 : 46,
    height: compact ? 38 : 46,
    minWidth: compact ? 38 : 46,
    minHeight: compact ? 38 : 46,
    borderRadius: "50%",
    color: tone.color,
    bgcolor: tone.background,
    border: `1px solid ${tone.border}`,
    boxShadow: active
        ? `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px ${tone.glow}, 0 6px 16px rgba(0,0,0,0.48)`
        : "inset 0 1px 0 rgba(255,255,255,0.05), 0 5px 14px rgba(0,0,0,0.42)",
    transition: "transform 140ms ease, background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
    "& svg": {
        fontSize: compact ? 20 : 24,
        filter: `drop-shadow(0 0 3px ${tone.glow})`,
    },
    "&:hover": {
        color: tone.color,
        bgcolor: tone.backgroundHover,
        borderColor: tone.border,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px ${tone.glow}, 0 6px 18px rgba(0,0,0,0.5)`,
    },
    "&:active": {
        transform: "translateY(1px)",
    },
});

const notificationText = (notification: SocialNotification): string => {
    switch (notification.type) {
        case "friend_request":
            return `${notification.fromUsername ?? "Someone"} sent you a friend request`;
        case "friend_accepted":
            return `${notification.fromUsername ?? "Someone"} accepted your friend request`;
        case "friend_message":
            return `${notification.fromUsername ?? "Someone"}: ${notification.body ?? "New message"}`;
        case "lobby_invite":
            return `${notification.fromUsername ?? "Someone"} invited you to a lobby`;
        default:
            return notification.body ?? "Notification";
    }
};

/**
 * Season gold on a friend row or a search hit, so you can tell how rich someone is before you send the
 * request and afterwards without leaving the panel.
 *
 * `undefined` is NOT zero: an older matchmaking server does not send the field, and a player who has
 * never entered ranked has no season profile to read it from. Both draw a dash — claiming someone has 0
 * gold when we simply do not know would be a lie about their account.
 */
const GoldBadge: React.FC<{ amount?: number }> = ({ amount }) => {
    const { currency } = useRankedSeason();
    if (amount === undefined) {
        return (
            <Typography
                level="body-xs"
                title="No season profile yet"
                sx={{ color: hocColors.muted, whiteSpace: "nowrap", flexShrink: 0 }}
            >
                —
            </Typography>
        );
    }
    const whole = Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0;
    return (
        <Stack
            component="span"
            direction="row"
            spacing={0.3}
            alignItems="center"
            aria-label={`${currency.name}: ${whole}`}
            title={`${currency.name} (${currency.symbol})`}
            sx={{ flexShrink: 0, color: hocColors.gold }}
        >
            <CurrencyIcon iconSvg={currency.iconSvg} size={12} />
            <Typography level="body-xs" sx={{ color: "inherit", fontWeight: 800 }}>
                {whole.toLocaleString("en-US")}
            </Typography>
        </Stack>
    );
};

const OnlineDot: React.FC<{ online: boolean }> = ({ online }) => (
    <Box
        component="span"
        sx={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            flex: "0 0 9px",
            bgcolor: online ? hocColors.green : "rgba(239, 228, 204, 0.25)",
            boxShadow: online ? `0 0 6px ${hocColors.green}` : "none",
        }}
    />
);

/** Server-side minimum for a username prefix search; below it the endpoint returns nothing anyway. */
const MIN_SEARCH_CHARS = 2;

/**
 * A search result row. Previously these were Joy `Chip`s carrying hocSoftButtonSx, but Joy resolves a
 * Chip's fill and label colour from its own variant variables rather than from the root `sx`, so the
 * outlined neutral chip rendered as near-white text on a near-white pill — unreadable on this panel.
 * Drawn as a plain framed row instead, matching the friend rows underneath.
 */
const searchRowSx = {
    p: 0.75,
    borderRadius: 8,
    border: `1px solid ${hocColors.orangeBorder}`,
    bgcolor: hocColors.orangeSoft,
} as const;

interface NotificationsTrayProps {
    open: boolean;
    onClose: () => void;
    onMessage: (friend: FriendEntry) => void;
}

const NotificationsTray: React.FC<NotificationsTrayProps> = ({ open, onClose, onMessage }) => {
    const social = useSocial();
    const navigate = useNavigate();
    const [items, setItems] = useState<SocialNotification[]>([]);
    const [loading, setLoading] = useState(false);

    // Which tray entries do something when clicked, and what that is. Messages open the conversation;
    // lobby invites route straight into the lobby room.
    const isClickable = (notification: SocialNotification): boolean =>
        (notification.type === "friend_message" && !!notification.fromPlayerId) ||
        (notification.type === "lobby_invite" && !!notification.lobbyId);

    const activate = (notification: SocialNotification): void => {
        if (notification.type === "friend_message" && notification.fromPlayerId) {
            onMessage({
                playerId: notification.fromPlayerId,
                username: notification.fromUsername ?? "Friend",
                online: false,
                lastOnlineAt: 0,
                muted: false,
                unreadCount: 0,
            });
        } else if (notification.type === "lobby_invite" && notification.lobbyId) {
            onClose();
            navigate(`/lobby/${notification.lobbyId}`);
        }
    };

    useEffect(() => {
        if (!open) {
            return;
        }
        let cancelled = false;
        setLoading(true);
        void (async () => {
            try {
                const result = await fetchNotifications();
                if (!cancelled) {
                    setItems(result.notifications);
                }
                // Seen = the badge goes to 0; the entries stay listed (and re-readable) forever.
                await markNotificationsSeen();
                social.clearUnseen();
            } catch {
                /* tray shows the empty state; the next poll refreshes the badge */
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open]);

    const pendingIds = new Set(social.pendingIncoming.map((request) => request.requestId));

    return (
        <DockPanelShell open={open} onClose={onClose} width={420} maxWidth="94vw">
            <Typography level="title-lg" sx={{ color: hocColors.gold }}>
                Notifications
            </Typography>
            <Divider sx={{ bgcolor: hocColors.orangeBorder }} />
            {loading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                    <CircularProgress size="sm" sx={hocSpinnerSx} />
                </Box>
            ) : items.length === 0 ? (
                <Typography level="body-sm" sx={{ color: hocColors.muted, py: 2 }}>
                    Nothing here yet. Friend requests and updates will appear in this tray.
                </Typography>
            ) : (
                <Stack spacing={1} sx={{ maxHeight: "55vh", overflowY: "auto", pr: 0.5 }}>
                    {items.map((notification) => {
                        const actionable =
                            notification.type === "friend_request" &&
                            !!notification.requestId &&
                            pendingIds.has(notification.requestId);
                        const clickable = isClickable(notification);
                        return (
                            <Box
                                key={notification.id}
                                role={clickable ? "button" : undefined}
                                tabIndex={clickable ? 0 : undefined}
                                onClick={() => {
                                    if (clickable) {
                                        activate(notification);
                                    }
                                }}
                                onKeyDown={(event) => {
                                    if ((event.key === "Enter" || event.key === " ") && clickable) {
                                        event.preventDefault();
                                        activate(notification);
                                    }
                                }}
                                sx={{
                                    p: 1.25,
                                    borderRadius: 8,
                                    border: `1px solid ${notification.seenAt === 0 ? hocColors.orangeBorder : "rgba(255,143,0,0.14)"}`,
                                    bgcolor: notification.seenAt === 0 ? hocColors.orangeSoft : "transparent",
                                    cursor: clickable ? "pointer" : "default",
                                    "&:hover": clickable ? { borderColor: hocColors.orangeBorder } : undefined,
                                }}
                            >
                                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                                    <Typography level="body-sm" sx={{ color: hocColors.parchment }}>
                                        {notificationText(notification)}
                                    </Typography>
                                    <Typography level="body-xs" sx={{ color: hocColors.muted, whiteSpace: "nowrap" }}>
                                        {formatLastSeen(notification.createdAt)}
                                    </Typography>
                                </Stack>
                                {actionable && notification.requestId ? (
                                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                        <Button
                                            size="sm"
                                            sx={hocPrimaryButtonSx}
                                            onClick={() => void social.respond(notification.requestId ?? "", true)}
                                        >
                                            Accept
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outlined"
                                            sx={hocSoftButtonSx}
                                            onClick={() => void social.respond(notification.requestId ?? "", false)}
                                        >
                                            Decline
                                        </Button>
                                    </Stack>
                                ) : null}
                            </Box>
                        );
                    })}
                </Stack>
            )}
            <Button variant="outlined" sx={{ ...hocSoftButtonSx, mt: 1 }} onClick={onClose}>
                Close
            </Button>
        </DockPanelShell>
    );
};

interface FriendsPanelProps {
    open: boolean;
    onClose: () => void;
    onMessage: (friend: FriendEntry) => void;
}

const FriendsPanel: React.FC<FriendsPanelProps> = ({ open, onClose, onMessage }) => {
    const social = useSocial();
    const { lobbyId: currentLobbyId } = useCurrentLobby();
    const [overview, setOverview] = useState<FriendsOverview | null>(null);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<PlayerSearchHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const searchTimer = useRef<number | undefined>(undefined);

    const reload = useCallback(async (): Promise<void> => {
        try {
            setOverview(await fetchFriends());
        } catch {
            /* keep the last known list; the panel is not critical path */
        }
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }
        setMessage(null);
        setLoading(true);
        void reload().finally(() => setLoading(false));
        // Refresh online dots while the panel stays open.
        const handle = window.setInterval(() => void reload(), 30_000);
        return () => window.clearInterval(handle);
    }, [open, reload]);

    // The pending-request list can change from the popup/tray while we're open.
    useEffect(() => {
        if (open) {
            void reload();
        }
    }, [open, social.pendingIncoming.length, reload]);

    useEffect(() => {
        window.clearTimeout(searchTimer.current);
        if (query.trim().length < MIN_SEARCH_CHARS) {
            setSuggestions([]);
            setSearching(false);
            return;
        }
        // Announce the search the moment the player passes the threshold, not 300ms later: the heading
        // appears immediately so typing never looks like it did nothing, and only the rows arrive late.
        setSearching(true);
        searchTimer.current = window.setTimeout(() => {
            void searchPlayers(query)
                .then(setSuggestions)
                .catch(() => setSuggestions([]))
                .finally(() => setSearching(false));
        }, 300);
        return () => window.clearTimeout(searchTimer.current);
    }, [query]);

    const submitRequest = async (username: string): Promise<void> => {
        if (!username.trim() || busy) {
            return;
        }
        setBusy(true);
        setMessage(null);
        try {
            const result = await sendFriendRequest(username);
            setMessage(
                result.status === "accepted"
                    ? { kind: "ok", text: `You and ${result.username} are now friends` }
                    : { kind: "ok", text: `Friend request sent to ${result.username}` },
            );
            setQuery("");
            setSuggestions([]);
            await reload();
        } catch (err) {
            setMessage({ kind: "error", text: socialErrorMessage(err, "Could not send the friend request") });
        } finally {
            setBusy(false);
        }
    };

    // Only offered while the player is actually in a lobby room (currentLobbyId set by LobbyView).
    const invite = async (friend: FriendEntry): Promise<void> => {
        if (!currentLobbyId || busy) {
            return;
        }
        setBusy(true);
        setMessage(null);
        try {
            await sendLobbyInvite(friend.playerId, currentLobbyId);
            setMessage({ kind: "ok", text: `Lobby invite sent to ${friend.username}` });
        } catch (err) {
            setMessage({ kind: "error", text: socialErrorMessage(err, "Could not send the lobby invite") });
        } finally {
            setBusy(false);
        }
    };

    const act = async (action: () => Promise<unknown>): Promise<void> => {
        if (busy) {
            return;
        }
        setBusy(true);
        setMessage(null);
        try {
            await action();
            await reload();
            social.refreshNow();
        } catch (err) {
            setMessage({ kind: "error", text: socialErrorMessage(err, "Action failed") });
        } finally {
            setBusy(false);
        }
    };

    const sectionTitle = (text: string): React.ReactElement => (
        <Typography level="title-sm" sx={{ color: hocColors.sidebarTitle, mt: 1 }}>
            {text}
        </Typography>
    );

    /** Whether a search hit is already a friend or already has a request in flight, so the row can say so. */
    const relationTo = (playerId: string): "friend" | "requested" | "none" => {
        if (overview?.friends.some((friend) => friend.playerId === playerId)) {
            return "friend";
        }
        if (overview?.outgoing.some((request) => request.toPlayerId === playerId)) {
            return "requested";
        }
        return "none";
    };

    return (
        <DockPanelShell open={open} onClose={onClose} width={480}>
            <Typography level="title-lg" sx={{ color: hocColors.gold }}>
                Friends
            </Typography>
            <Divider sx={{ bgcolor: hocColors.orangeBorder }} />

            <Stack direction="row" spacing={1}>
                <Input
                    size="sm"
                    placeholder="Add a friend by username…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            void submitRequest(query);
                        }
                    }}
                    sx={{ ...hocInputSx, flex: 1 }}
                />
                <Button
                    size="sm"
                    disabled={busy || query.trim().length < 3}
                    sx={hocPrimaryButtonSx}
                    onClick={() => void submitRequest(query)}
                >
                    Add
                </Button>
            </Stack>
            {query.trim().length >= MIN_SEARCH_CHARS ? (
                <Stack spacing={0.5}>
                    {sectionTitle(
                        searching
                            ? `Searching for “${query.trim()}”…`
                            : `Players matching “${query.trim()}” (${suggestions.length})`,
                    )}
                    {suggestions.length === 0 ? (
                        searching ? null : (
                            <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                                No players found — check the spelling, or invite them to the game.
                            </Typography>
                        )
                    ) : (
                        suggestions.map((hit) => {
                            const relation = relationTo(hit.id);
                            const status = searchHitPresenceLabel(hit);
                            return (
                                <Box key={hit.id} sx={searchRowSx}>
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        {hit.online === undefined ? null : <OnlineDot online={hit.online} />}
                                        <Typography
                                            level="body-sm"
                                            sx={{ color: hocColors.parchment, flex: 1, minWidth: 0 }}
                                            noWrap
                                        >
                                            {hit.username}
                                        </Typography>
                                        <GoldBadge amount={hit.gold} />
                                        {status ? (
                                            <Typography
                                                level="body-xs"
                                                sx={{
                                                    color: hit.online ? hocColors.green : hocColors.muted,
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {status}
                                            </Typography>
                                        ) : null}
                                        {relation === "none" ? (
                                            <Button
                                                size="sm"
                                                sx={hocPrimaryButtonSx}
                                                disabled={busy}
                                                onClick={() => void submitRequest(hit.username)}
                                            >
                                                Add
                                            </Button>
                                        ) : (
                                            // Already connected: say so instead of offering an Add that the
                                            // server would only reject.
                                            <Typography
                                                level="body-xs"
                                                sx={{ color: hocColors.mutedStrong, whiteSpace: "nowrap" }}
                                            >
                                                {relation === "friend" ? "Friend" : "Requested"}
                                            </Typography>
                                        )}
                                    </Stack>
                                </Box>
                            );
                        })
                    )}
                </Stack>
            ) : null}
            {message ? (
                <Alert
                    size="sm"
                    sx={
                        message.kind === "error"
                            ? hocDangerAlertSx
                            : {
                                  bgcolor: "rgba(70,209,96,0.12)",
                                  color: hocColors.parchment,
                                  border: `1px solid ${hocColors.greenDeep}`,
                              }
                    }
                >
                    {message.text}
                </Alert>
            ) : null}

            {loading || !overview ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                    <CircularProgress size="sm" sx={hocSpinnerSx} />
                </Box>
            ) : (
                <Stack spacing={0.75} sx={{ maxHeight: "52vh", overflowY: "auto", pr: 0.5 }}>
                    {overview.incoming.length > 0 ? (
                        <>
                            {sectionTitle(`Requests (${overview.incoming.length})`)}
                            {overview.incoming.map((request) => (
                                <Stack key={request.requestId} direction="row" alignItems="center" spacing={1}>
                                    <Typography level="body-sm" sx={{ color: hocColors.parchment, flex: 1 }}>
                                        {request.fromUsername}
                                    </Typography>
                                    <Button
                                        size="sm"
                                        sx={hocPrimaryButtonSx}
                                        disabled={busy}
                                        onClick={() => void act(() => social.respond(request.requestId, true))}
                                    >
                                        Accept
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outlined"
                                        sx={hocSoftButtonSx}
                                        disabled={busy}
                                        onClick={() => void act(() => social.respond(request.requestId, false))}
                                    >
                                        Decline
                                    </Button>
                                </Stack>
                            ))}
                        </>
                    ) : null}

                    {sectionTitle(`Friends (${overview.friends.length})`)}
                    {overview.friends.length === 0 ? (
                        <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                            No friends yet — send a request by username above.
                        </Typography>
                    ) : (
                        overview.friends.map((friend) => (
                            <Box
                                key={friend.playerId}
                                sx={{
                                    p: 1,
                                    borderRadius: 8,
                                    border: `1px solid ${friend.unreadCount > 0 ? hocColors.orangeBorder : "rgba(255,143,0,0.12)"}`,
                                    bgcolor: friend.unreadCount > 0 ? hocColors.orangeSoft : "transparent",
                                }}
                            >
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <OnlineDot online={friend.online} />
                                    <Typography level="body-sm" sx={{ color: hocColors.parchment, flex: 1 }}>
                                        {friend.username}
                                    </Typography>
                                    {friend.unreadCount > 0 ? (
                                        <Chip size="sm" sx={{ bgcolor: hocColors.danger, color: "#fff" }}>
                                            {friend.unreadCount > 99 ? "99+" : friend.unreadCount}
                                        </Chip>
                                    ) : null}
                                    <GoldBadge amount={friend.gold} />
                                    <Typography
                                        level="body-xs"
                                        sx={{
                                            color: friend.online ? hocColors.green : hocColors.muted,
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {friend.online ? "Online" : formatLastSeen(friend.lastOnlineAt)}
                                    </Typography>
                                </Stack>
                                <Stack direction="row" spacing={0.7} sx={{ mt: 0.8, flexWrap: "wrap" }}>
                                    <Button size="sm" sx={hocPrimaryButtonSx} onClick={() => onMessage(friend)}>
                                        Message
                                    </Button>
                                    {currentLobbyId ? (
                                        <Button
                                            size="sm"
                                            variant="outlined"
                                            sx={hocSoftButtonSx}
                                            disabled={busy}
                                            onClick={() => void invite(friend)}
                                        >
                                            Invite
                                        </Button>
                                    ) : null}
                                    <Button
                                        size="sm"
                                        variant="outlined"
                                        sx={hocSoftButtonSx}
                                        disabled={busy}
                                        onClick={() => void act(() => setFriendMuted(friend.playerId, !friend.muted))}
                                    >
                                        {friend.muted ? "Unmute alerts" : "Mute alerts"}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outlined"
                                        sx={hocSoftButtonSx}
                                        disabled={busy}
                                        onClick={() => void act(() => removeFriend(friend.playerId))}
                                    >
                                        Remove
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outlined"
                                        sx={{
                                            ...hocSoftButtonSx,
                                            borderColor: "rgba(255,90,63,0.5)",
                                            color: hocColors.danger,
                                        }}
                                        disabled={busy}
                                        onClick={() => void act(() => blockPlayer(friend.playerId))}
                                    >
                                        Block
                                    </Button>
                                </Stack>
                            </Box>
                        ))
                    )}

                    {overview.outgoing.length > 0 ? (
                        <>
                            {sectionTitle(`Sent (${overview.outgoing.length})`)}
                            {overview.outgoing.map((request) => (
                                <Stack key={request.requestId} direction="row" alignItems="center" spacing={1}>
                                    <Typography level="body-sm" sx={{ color: hocColors.muted, flex: 1 }}>
                                        {request.toUsername}
                                    </Typography>
                                    <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                                        pending
                                    </Typography>
                                </Stack>
                            ))}
                        </>
                    ) : null}

                    {overview.blocked.length > 0 ? (
                        <>
                            {sectionTitle(`Blocked (${overview.blocked.length})`)}
                            {overview.blocked.map((blocked) => (
                                <Stack key={blocked.playerId} direction="row" alignItems="center" spacing={1}>
                                    <Typography level="body-sm" sx={{ color: hocColors.muted, flex: 1 }}>
                                        {blocked.username}
                                    </Typography>
                                    <Button
                                        size="sm"
                                        variant="outlined"
                                        sx={hocSoftButtonSx}
                                        disabled={busy}
                                        onClick={() => void act(() => unblockPlayer(blocked.playerId))}
                                    >
                                        Unblock
                                    </Button>
                                </Stack>
                            ))}
                        </>
                    ) : null}
                </Stack>
            )}
            <Button variant="outlined" sx={{ ...hocSoftButtonSx, mt: 1 }} onClick={onClose}>
                Close
            </Button>
        </DockPanelShell>
    );
};

export const SocialDock: React.FC = () => {
    const { authenticated, user } = useAuthContext();
    const social = useSocial();
    const location = useLocation();
    const [trayOpen, setTrayOpen] = useState(false);
    const [friendsOpen, setFriendsOpen] = useState(false);
    const [conversationFriend, setConversationFriend] = useState<FriendEntry | null>(null);
    const [predictionsOpen, setPredictionsOpen] = useState(false);
    const fightDockSlot = React.useSyncExternalStore(
        subscribeSocialDockSlot,
        getSocialDockSlot,
        getSocialDockSlotServerSnapshot,
    );
    const floatingVolumeSlotRef = useRef<HTMLDivElement | null>(null);

    /** Keep music beside the three social controls both while floating and in the fight sidebar. */
    const active = authenticated && user?.is_active !== false;
    // Depends on `active` too: a logged-out dock renders nothing, so the slot element only appears once the
    // player is active. Without it in the deps the effect would never see that element and the speaker
    // would stay in the corner it collides in.
    React.useLayoutEffect(() => {
        if (!active) {
            return undefined;
        }
        setVolumeSlot(floatingVolumeSlotRef.current);
        return () => setVolumeSlot(null);
    }, [fightDockSlot, active]);

    const inGame = location.pathname.startsWith("/game/");
    if (!active) {
        return null;
    }

    const openConversation = (friend: FriendEntry): void => {
        setTrayOpen(false);
        setFriendsOpen(false);
        setConversationFriend(friend);
    };

    const popup = social.popupRequest;
    const popupVisible = !!popup && !trayOpen && !friendsOpen && !conversationFriend && !inGame;

    const dockControls = (
        <Stack
            direction="row"
            spacing={inGame ? 0.6 : 1}
            // DockPanelShell's click-outside dismissal skips anything inside this row: these buttons
            // toggle their own panel, and letting the outside-click fire as well would close it on the
            // way down and reopen it on the way up.
            data-social-dock-button="true"
            sx={{
                position: fightDockSlot ? "relative" : "fixed",
                top: "auto",
                bottom: fightDockSlot ? "auto" : inGame ? 12 : 18,
                right: fightDockSlot ? "auto" : inGame ? 10 : 18,
                width: fightDockSlot ? "100%" : "auto",
                justifyContent: fightDockSlot ? "center" : "flex-start",
                zIndex: 1400,
                opacity: inGame ? 0.82 : 1,
                transition: "opacity 150ms ease",
                "&:hover": { opacity: 1 },
            }}
        >
            {/* ThemeMusic portals the speaker in here. First in the row on purpose:
                the control expands a volume slider to its right, so anchoring it at the left edge grows
                the right-anchored row leftward into empty screen instead of shoving the buttons. */}
            <Box
                ref={floatingVolumeSlotRef}
                data-volume-control="social-dock"
                data-volume-size={inGame ? "compact" : "default"}
                sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}
            />
            <IconButton
                aria-label="Bets and predictions"
                aria-pressed={predictionsOpen}
                title="Bets and predictions"
                sx={dockButtonSx(dockButtonTones.predictions, predictionsOpen, inGame)}
                onClick={() => setPredictionsOpen((wasOpen) => !wasOpen)}
            >
                <CasinoRoundedIcon aria-hidden="true" />
            </IconButton>
            <IconButton
                aria-label="Friends"
                aria-pressed={friendsOpen}
                title="Friends"
                sx={dockButtonSx(dockButtonTones.friends, friendsOpen, inGame)}
                onClick={() => {
                    social.requestNotificationPermission();
                    setFriendsOpen((wasOpen) => !wasOpen);
                }}
            >
                <GroupsRoundedIcon aria-hidden="true" />
            </IconButton>
            <Box sx={{ position: "relative" }}>
                <IconButton
                    aria-label="Notifications"
                    aria-pressed={trayOpen}
                    title="Notifications"
                    sx={dockButtonSx(dockButtonTones.notifications, trayOpen, inGame)}
                    onClick={() => {
                        social.requestNotificationPermission();
                        setTrayOpen((wasOpen) => !wasOpen);
                    }}
                >
                    <NotificationsRoundedIcon aria-hidden="true" />
                </IconButton>
                {social.unseenCount > 0 ? (
                    <Box
                        sx={{
                            position: "absolute",
                            top: -4,
                            right: -4,
                            minWidth: 20,
                            height: 20,
                            px: 0.5,
                            borderRadius: 10,
                            bgcolor: hocColors.danger,
                            color: "#fff",
                            border: "2px solid #160b07",
                            boxShadow: "0 3px 10px rgba(0,0,0,0.55)",
                            fontSize: 11,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            pointerEvents: "none",
                        }}
                    >
                        {social.unseenCount > 99 ? "99+" : social.unseenCount}
                    </Box>
                ) : null}
            </Box>
        </Stack>
    );

    return (
        <>
            {fightDockSlot ? createPortal(dockControls, fightDockSlot) : dockControls}

            <PredictionsPanel open={predictionsOpen} onClose={() => setPredictionsOpen(false)} />
            <NotificationsTray open={trayOpen} onClose={() => setTrayOpen(false)} onMessage={openConversation} />
            <FriendsPanel open={friendsOpen} onClose={() => setFriendsOpen(false)} onMessage={openConversation} />
            <ConversationPanel
                friend={conversationFriend}
                onClose={() => setConversationFriend(null)}
                onActivity={social.refreshNow}
                onMutedChange={(playerId, muted) =>
                    setConversationFriend((current) =>
                        current?.playerId === playerId ? { ...current, muted } : current,
                    )
                }
            />

            <Modal open={popupVisible} onClose={() => popup && social.dismissPopup(popup.requestId)}>
                <ModalDialog variant="outlined" sx={{ ...hocPanelSx, width: 380, maxWidth: "92vw" }}>
                    <Typography level="title-lg" sx={{ color: hocColors.gold }}>
                        Friend request
                    </Typography>
                    <Typography level="body-md" sx={{ color: hocColors.parchment }}>
                        <b>{popup?.fromUsername}</b> wants to add you as a friend.
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                        <Button
                            sx={hocPrimaryButtonSx}
                            onClick={() => popup && void social.respond(popup.requestId, true)}
                        >
                            Accept
                        </Button>
                        <Button
                            variant="outlined"
                            sx={hocSoftButtonSx}
                            onClick={() => popup && void social.respond(popup.requestId, false)}
                        >
                            Decline
                        </Button>
                        <Button
                            variant="plain"
                            sx={{ color: hocColors.muted, ml: "auto" }}
                            onClick={() => popup && social.dismissPopup(popup.requestId)}
                        >
                            Later
                        </Button>
                    </Stack>
                </ModalDialog>
            </Modal>
        </>
    );
};
