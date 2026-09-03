import { Alert, Box, Button, CircularProgress, Divider, Stack, Textarea, Typography } from "@mui/joy";
import { DockPanelShell } from "./DockPanelShell";
import React, { useCallback, useEffect, useRef, useState } from "react";

import {
    fetchFriendMessages,
    formatLastSeen,
    markFriendMessagesRead,
    sendFriendMessage,
    setFriendMuted,
    socialErrorMessage,
    type FriendConversation,
    type FriendEntry,
    type FriendMessage,
} from "../../api/social_client";
import {
    hocColors,
    hocDangerAlertSx,
    hocInputSx,
    hocPrimaryButtonSx,
    hocSoftButtonSx,
    hocSpinnerSx,
} from "../hocTheme";
import { startVisibleInterval } from "../visibleInterval";

interface ConversationPanelProps {
    friend: FriendEntry | null;
    onClose: () => void;
    onActivity: () => void;
    onMutedChange: (playerId: string, muted: boolean) => void;
}

const mergeMessages = (current: FriendMessage[], incoming: FriendMessage[]): FriendMessage[] => {
    const byId = new Map(current.map((message) => [message.id, message]));
    for (const message of incoming) {
        byId.set(message.id, message);
    }
    return [...byId.values()].sort(
        (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
    );
};

export const ConversationPanel: React.FC<ConversationPanelProps> = ({ friend, onClose, onActivity, onMutedChange }) => {
    const [conversation, setConversation] = useState<FriendConversation | null>(null);
    const [draft, setDraft] = useState("");
    const [loading, setLoading] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [sending, setSending] = useState(false);
    const [muting, setMuting] = useState(false);
    const [error, setError] = useState("");
    const messageListRef = useRef<HTMLDivElement | null>(null);

    const acknowledge = useCallback(
        async (playerId: string): Promise<void> => {
            await markFriendMessagesRead(playerId);
            onActivity();
        },
        [onActivity],
    );

    const loadLatest = useCallback(
        async (initial: boolean): Promise<void> => {
            if (!friend) {
                return;
            }
            if (initial) {
                setLoading(true);
            }
            try {
                const result = await fetchFriendMessages(friend.playerId);
                setConversation((current) =>
                    current && !initial
                        ? { ...result, messages: mergeMessages(current.messages, result.messages) }
                        : result,
                );
                if (result.friend.unreadCount > 0) {
                    await acknowledge(friend.playerId);
                }
                if (initial) {
                    window.requestAnimationFrame(() => {
                        const list = messageListRef.current;
                        if (list) {
                            list.scrollTop = list.scrollHeight;
                        }
                    });
                }
            } catch (err) {
                if (initial) {
                    setError(socialErrorMessage(err, "Could not load this conversation"));
                }
            } finally {
                if (initial) {
                    setLoading(false);
                }
            }
        },
        [acknowledge, friend],
    );

    useEffect(() => {
        if (!friend) {
            setConversation(null);
            setDraft("");
            setError("");
            return;
        }
        setConversation(null);
        setDraft("");
        setError("");
        let initial = true;
        return startVisibleInterval(() => {
            void loadLatest(initial);
            initial = false;
        }, 5_000);
    }, [friend?.playerId, loadLatest]);

    const loadOlder = async (): Promise<void> => {
        if (!friend || !conversation?.messages.length || loadingOlder) {
            return;
        }
        const list = messageListRef.current;
        const oldHeight = list?.scrollHeight ?? 0;
        setLoadingOlder(true);
        try {
            const result = await fetchFriendMessages(friend.playerId, conversation.messages[0].createdAt);
            setConversation((current) =>
                current
                    ? {
                          ...current,
                          friend: result.friend,
                          hasMore: result.hasMore,
                          messages: mergeMessages(result.messages, current.messages),
                      }
                    : result,
            );
            window.requestAnimationFrame(() => {
                if (list) {
                    list.scrollTop += list.scrollHeight - oldHeight;
                }
            });
        } catch (err) {
            setError(socialErrorMessage(err, "Could not load older messages"));
        } finally {
            setLoadingOlder(false);
        }
    };

    const submit = async (): Promise<void> => {
        const message = draft.trim();
        if (!friend || !message || sending) {
            return;
        }
        setSending(true);
        setError("");
        try {
            const sent = await sendFriendMessage(friend.playerId, message);
            setConversation((current) =>
                current ? { ...current, messages: mergeMessages(current.messages, [sent]) } : current,
            );
            setDraft("");
            onActivity();
            window.requestAnimationFrame(() => {
                const list = messageListRef.current;
                if (list) {
                    list.scrollTop = list.scrollHeight;
                }
            });
        } catch (err) {
            setError(socialErrorMessage(err, "Could not send your message"));
        } finally {
            setSending(false);
        }
    };

    const toggleMuted = async (): Promise<void> => {
        if (!friend || !conversation || muting) {
            return;
        }
        const muted = !conversation.friend.muted;
        setMuting(true);
        setError("");
        try {
            await setFriendMuted(friend.playerId, muted);
            setConversation((current) => (current ? { ...current, friend: { ...current.friend, muted } } : current));
            onMutedChange(friend.playerId, muted);
            onActivity();
        } catch (err) {
            setError(socialErrorMessage(err, "Could not update notification settings"));
        } finally {
            setMuting(false);
        }
    };

    const activeFriend = conversation?.friend ?? friend;

    return (
        <DockPanelShell open={!!friend} onClose={onClose} width={520}>
            <Stack direction="row" alignItems="center" spacing={1.2} sx={{ px: 2, py: 1.5 }}>
                <Box
                    sx={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        bgcolor: activeFriend?.online ? hocColors.green : "rgba(239, 228, 204, 0.25)",
                        boxShadow: activeFriend?.online ? `0 0 7px ${hocColors.green}` : "none",
                    }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography level="title-lg" noWrap sx={{ color: hocColors.gold }}>
                        {activeFriend?.username ?? "Conversation"}
                    </Typography>
                    <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                        {activeFriend?.online ? "Online" : formatLastSeen(activeFriend?.lastOnlineAt ?? 0)}
                    </Typography>
                </Box>
                <Button
                    size="sm"
                    variant="outlined"
                    disabled={muting || !conversation}
                    sx={hocSoftButtonSx}
                    onClick={() => void toggleMuted()}
                >
                    {activeFriend?.muted ? "Unmute alerts" : "Mute alerts"}
                </Button>
                <Button size="sm" variant="outlined" sx={hocSoftButtonSx} onClick={onClose}>
                    Close
                </Button>
            </Stack>
            <Divider sx={{ bgcolor: hocColors.orangeBorder }} />

            {error ? (
                <Alert size="sm" sx={{ ...hocDangerAlertSx, mx: 1.5, mt: 1 }}>
                    {error}
                </Alert>
            ) : null}

            <Box
                ref={messageListRef}
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    px: 1.5,
                    py: 1.25,
                    bgcolor: "rgba(5, 4, 3, 0.28)",
                }}
            >
                {loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                        <CircularProgress size="sm" sx={hocSpinnerSx} />
                    </Box>
                ) : conversation?.messages.length ? (
                    <Stack spacing={0.8}>
                        {conversation.hasMore ? (
                            <Button
                                size="sm"
                                variant="plain"
                                loading={loadingOlder}
                                sx={{ color: hocColors.muted, alignSelf: "center" }}
                                onClick={() => void loadOlder()}
                            >
                                Load older messages
                            </Button>
                        ) : null}
                        {conversation.messages.map((message) => {
                            const incoming = message.senderId === activeFriend?.playerId;
                            return (
                                <Box
                                    key={message.id}
                                    sx={{
                                        alignSelf: incoming ? "flex-start" : "flex-end",
                                        maxWidth: "82%",
                                        px: 1.2,
                                        py: 0.8,
                                        borderRadius: incoming ? "4px 12px 12px" : "12px 4px 12px 12px",
                                        bgcolor: incoming ? hocColors.panelSoft : hocColors.orangeSoft,
                                        border: `1px solid ${incoming ? "rgba(255,143,0,0.15)" : hocColors.orangeBorder}`,
                                    }}
                                >
                                    <Typography
                                        level="body-sm"
                                        sx={{
                                            color: hocColors.parchment,
                                            whiteSpace: "pre-wrap",
                                            overflowWrap: "anywhere",
                                        }}
                                    >
                                        {message.body}
                                    </Typography>
                                    <Typography
                                        level="body-xs"
                                        sx={{ color: hocColors.muted, textAlign: "right", mt: 0.25 }}
                                    >
                                        {new Date(message.createdAt).toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                        {!incoming && message.readAt > 0 ? " · Read" : ""}
                                    </Typography>
                                </Box>
                            );
                        })}
                    </Stack>
                ) : (
                    <Typography level="body-sm" sx={{ color: hocColors.muted, textAlign: "center", py: 4 }}>
                        No messages yet. Say hello to {activeFriend?.username}.
                    </Typography>
                )}
            </Box>

            <Divider sx={{ bgcolor: hocColors.orangeBorder }} />
            <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ p: 1.5 }}>
                <Textarea
                    minRows={2}
                    maxRows={4}
                    slotProps={{ textarea: { maxLength: 500 } }}
                    placeholder={`Message ${activeFriend?.username ?? "friend"}…`}
                    value={draft}
                    disabled={!conversation || sending}
                    sx={{ ...hocInputSx, flex: 1 }}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void submit();
                        }
                    }}
                />
                <Button
                    disabled={!conversation || !draft.trim() || sending}
                    loading={sending}
                    sx={hocPrimaryButtonSx}
                    onClick={() => void submit()}
                >
                    Send
                </Button>
            </Stack>
        </DockPanelShell>
    );
};
