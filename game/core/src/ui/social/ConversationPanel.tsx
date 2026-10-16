import ChatBubbleRoundedIcon from "@mui/icons-material/ChatBubbleRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import NotificationsOffRoundedIcon from "@mui/icons-material/NotificationsOffRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import { Alert, Box, Button, CircularProgress, IconButton, Stack, Textarea, Typography } from "@mui/joy";
import { DockPanelHeader, DockPanelShell } from "./DockPanelShell";
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
import { hocColors, hocDangerAlertSx, hocInputSx, hocPrimaryButtonSx, hocSpinnerSx } from "../hocTheme";
import { startVisibleInterval } from "../visibleInterval";

interface ConversationPanelProps {
    friend: FriendEntry | null;
    preview?: boolean;
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

export const ConversationPanel: React.FC<ConversationPanelProps> = ({
    friend,
    preview = false,
    onClose,
    onActivity,
    onMutedChange,
}) => {
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
        if (preview) {
            const now = Date.now();
            setConversation({
                friend,
                hasMore: false,
                messages: [
                    {
                        id: "mock-message-1",
                        conversationId: "mock-conversation",
                        senderId: friend.playerId,
                        recipientId: "mock-me",
                        body: "I opened a friends-first lobby. Want the last seat?",
                        createdAt: now - 4 * 60_000,
                        readAt: now - 3 * 60_000,
                    },
                    {
                        id: "mock-message-2",
                        conversationId: "mock-conversation",
                        senderId: "mock-me",
                        recipientId: friend.playerId,
                        body: "Absolutely — joining after this round.",
                        createdAt: now - 2 * 60_000,
                        readAt: now - 60_000,
                    },
                ],
            });
            return undefined;
        }
        let initial = true;
        return startVisibleInterval(() => {
            void loadLatest(initial);
            initial = false;
        }, 5_000);
    }, [friend?.playerId, loadLatest, preview]);

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
            const sent = preview
                ? {
                      id: `mock-message-${Date.now()}`,
                      conversationId: "mock-conversation",
                      senderId: "mock-me",
                      recipientId: friend.playerId,
                      body: message,
                      createdAt: Date.now(),
                      readAt: 0,
                  }
                : await sendFriendMessage(friend.playerId, message);
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
            if (!preview) {
                await setFriendMuted(friend.playerId, muted);
            }
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
        <DockPanelShell open={!!friend} onClose={onClose} width={500} anchorOffset={106}>
            <DockPanelHeader
                title={activeFriend?.username ?? "Conversation"}
                subtitle={activeFriend?.online ? "Online now" : formatLastSeen(activeFriend?.lastOnlineAt ?? 0)}
                leading={
                    <Box
                        sx={{
                            position: "relative",
                            width: 34,
                            height: 34,
                            display: "grid",
                            placeItems: "center",
                            borderRadius: "50%",
                            color: hocColors.gold,
                            bgcolor: "rgba(220,177,88,0.1)",
                            border: "1px solid rgba(220,177,88,0.28)",
                        }}
                    >
                        <ChatBubbleRoundedIcon sx={{ fontSize: 18 }} />
                        <Box
                            sx={{
                                position: "absolute",
                                right: -1,
                                bottom: 0,
                                width: 9,
                                height: 9,
                                borderRadius: "50%",
                                bgcolor: activeFriend?.online ? hocColors.green : "rgba(239,228,204,0.3)",
                                border: "2px solid #0b0805",
                            }}
                        />
                    </Box>
                }
                action={
                    <IconButton
                        size="sm"
                        variant="plain"
                        disabled={muting || !conversation}
                        aria-label={activeFriend?.muted ? "Unmute alerts" : "Mute alerts"}
                        title={activeFriend?.muted ? "Unmute alerts" : "Mute alerts"}
                        onClick={() => void toggleMuted()}
                        sx={{
                            minWidth: 30,
                            minHeight: 30,
                            borderRadius: "50%",
                            color: activeFriend?.muted ? hocColors.danger : hocColors.muted,
                            "&:hover": { color: hocColors.parchment, bgcolor: "rgba(220,177,88,0.1)" },
                        }}
                    >
                        {activeFriend?.muted ? (
                            <NotificationsOffRoundedIcon sx={{ fontSize: 18 }} />
                        ) : (
                            <NotificationsActiveRoundedIcon sx={{ fontSize: 18 }} />
                        )}
                    </IconButton>
                }
                onClose={onClose}
            />

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
                    bgcolor: "rgba(0,0,0,0.16)",
                    borderRadius: "12px",
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
                                        borderRadius: incoming ? "5px 14px 14px" : "14px 5px 14px 14px",
                                        background: incoming
                                            ? "linear-gradient(145deg, rgba(48,34,22,0.88), rgba(24,17,11,0.94))"
                                            : "linear-gradient(145deg, rgba(122,68,5,0.9), rgba(72,39,4,0.95))",
                                        border: `1px solid ${incoming ? "rgba(220,177,88,0.16)" : "rgba(220,177,88,0.38)"}`,
                                        boxShadow: "0 5px 14px rgba(0,0,0,0.16)",
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

            <Stack
                direction="row"
                spacing={0.75}
                alignItems="flex-end"
                sx={{ p: 0.35, pt: 0.6, borderTop: "1px solid rgba(220,177,88,0.14)" }}
            >
                <Textarea
                    minRows={1}
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
                <IconButton
                    aria-label="Send message"
                    title="Send"
                    disabled={!conversation || !draft.trim() || sending}
                    loading={sending}
                    sx={{
                        ...hocPrimaryButtonSx,
                        width: 38,
                        height: 38,
                        minWidth: 38,
                        minHeight: 38,
                        borderRadius: "50%",
                    }}
                    onClick={() => void submit()}
                >
                    <SendRoundedIcon sx={{ fontSize: 19 }} />
                </IconButton>
            </Stack>
        </DockPanelShell>
    );
};
