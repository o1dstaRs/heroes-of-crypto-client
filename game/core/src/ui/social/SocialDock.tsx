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
import { useLocation, useNavigate } from "react-router";

import { ConversationPanel } from "./ConversationPanel";
import { useCurrentLobby } from "./CurrentLobbyContext";
import { PredictionsPanel } from "./PredictionsPanel";
import { useSocial } from "./SocialProvider";
import {
    blockPlayer,
    fetchFriends,
    fetchNotifications,
    formatLastSeen,
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

const dockButtonSx = {
    width: 46,
    height: 46,
    borderRadius: "50%",
    fontSize: 20,
    bgcolor: hocColors.panel,
    border: `1px solid ${hocColors.orangeBorder}`,
    color: hocColors.parchment,
    boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
    "&:hover": { bgcolor: hocColors.panelSoft, borderColor: hocColors.orange },
};

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
        <Modal open={open} onClose={onClose}>
            <ModalDialog variant="outlined" sx={{ ...hocPanelSx, width: 420, maxWidth: "94vw" }}>
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
                                    <Stack
                                        direction="row"
                                        spacing={1}
                                        alignItems="center"
                                        justifyContent="space-between"
                                    >
                                        <Typography level="body-sm" sx={{ color: hocColors.parchment }}>
                                            {notificationText(notification)}
                                        </Typography>
                                        <Typography
                                            level="body-xs"
                                            sx={{ color: hocColors.muted, whiteSpace: "nowrap" }}
                                        >
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
            </ModalDialog>
        </Modal>
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
    const [suggestions, setSuggestions] = useState<{ id: string; username: string }[]>([]);
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
        if (query.trim().length < 2) {
            setSuggestions([]);
            return;
        }
        searchTimer.current = window.setTimeout(() => {
            void searchPlayers(query)
                .then(setSuggestions)
                .catch(() => setSuggestions([]));
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

    return (
        <Modal open={open} onClose={onClose}>
            <ModalDialog variant="outlined" sx={{ ...hocPanelSx, width: 480, maxWidth: "96vw" }}>
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
                {suggestions.length > 0 ? (
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                        {suggestions.map((hit) => (
                            <Chip
                                key={hit.id}
                                size="sm"
                                variant="outlined"
                                sx={{ ...hocSoftButtonSx, cursor: "pointer" }}
                                onClick={() => void submitRequest(hit.username)}
                            >
                                {hit.username}
                            </Chip>
                        ))}
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
                                            onClick={() =>
                                                void act(() => setFriendMuted(friend.playerId, !friend.muted))
                                            }
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
            </ModalDialog>
        </Modal>
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

    const active = authenticated && user?.is_active !== false;
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

    return (
        <>
            <Stack
                direction="row"
                spacing={inGame ? 0.6 : 1}
                sx={{
                    position: "fixed",
                    top: inGame ? 10 : "auto",
                    bottom: inGame ? "auto" : 18,
                    right: inGame ? 10 : 18,
                    zIndex: 1400,
                    opacity: inGame ? 0.82 : 1,
                    transition: "opacity 150ms ease",
                    "&:hover": { opacity: 1 },
                }}
            >
                <IconButton
                    aria-label="Predictions"
                    sx={{ ...dockButtonSx, ...(inGame ? { width: 38, height: 38, fontSize: 16 } : {}) }}
                    onClick={() => setPredictionsOpen(true)}
                >
                    <span role="img" aria-hidden>
                        🎯
                    </span>
                </IconButton>
                <IconButton
                    aria-label="Friends"
                    sx={{ ...dockButtonSx, ...(inGame ? { width: 38, height: 38, fontSize: 16 } : {}) }}
                    onClick={() => {
                        social.requestNotificationPermission();
                        setFriendsOpen(true);
                    }}
                >
                    <span role="img" aria-hidden>
                        👥
                    </span>
                </IconButton>
                <Box sx={{ position: "relative" }}>
                    <IconButton
                        aria-label="Notifications"
                        sx={{ ...dockButtonSx, ...(inGame ? { width: 38, height: 38, fontSize: 16 } : {}) }}
                        onClick={() => {
                            social.requestNotificationPermission();
                            setTrayOpen(true);
                        }}
                    >
                        <span role="img" aria-hidden>
                            🔔
                        </span>
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
