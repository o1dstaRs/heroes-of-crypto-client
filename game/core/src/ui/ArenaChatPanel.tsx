import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import { Box, Button, IconButton, Input, Stack, Tooltip, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useRef, useState } from "react";

import {
    chatSegments,
    fetchArenaChat,
    postArenaChat,
    reportArenaChat,
    socialErrorMessage,
    upvoteArenaChat,
    type ArenaChatMessage,
} from "../api/social_client";
import { t, useTranslation } from "../i18n/i18n";
import { hocColors, hocInputSx, hocPrimaryButtonSx } from "./hocTheme";

const POLL_INTERVAL_MS = 4000;
const MAX_LENGTH = 300;
/** Keep the rendered room bounded however long the tab stays open. */
const MAX_RENDERED = 120;

const timeLabel = (createdAt: number): string =>
    new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * The Ranked Arena's public chat room.
 *
 * Polls with a cursor rather than holding a socket: the arena already runs a matchmaking SSE stream,
 * and a second live connection per player for a low-traffic room is not worth the fan-out. Each tick
 * asks only for lines newer than the newest one held.
 *
 * Rendering is deliberately dumb about safety. A link in a stored message is internal BY
 * CONSTRUCTION — the server refuses external ones at post time — so this component never has to
 * adjudicate a URL, only display it.
 */
export const ArenaChatPanel: React.FC<{ selfUsername?: string }> = ({ selfUsername }) => {
    useTranslation();
    const [messages, setMessages] = useState<ArenaChatMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState("");
    const [sending, setSending] = useState(false);
    const mountedRef = useRef(true);
    const newestRef = useRef(0);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    const merge = useCallback((incoming: ArenaChatMessage[]) => {
        if (!incoming.length) {
            return;
        }
        setMessages((previous) => {
            const seen = new Set(previous.map((message) => message.id));
            const next = [...previous, ...incoming.filter((message) => !seen.has(message.id))];
            return next.slice(-MAX_RENDERED);
        });
        newestRef.current = Math.max(newestRef.current, ...incoming.map((message) => message.createdAt));
    }, []);

    const refresh = useCallback(async () => {
        try {
            merge(await fetchArenaChat(newestRef.current));
        } catch {
            // A dropped poll is not worth a banner — the next tick recovers, and a chat that shouts
            // about its own network is more annoying than one that quietly catches up.
        }
    }, [merge]);

    useEffect(() => {
        mountedRef.current = true;
        void refresh();
        const handle = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
        return () => {
            mountedRef.current = false;
            window.clearInterval(handle);
        };
    }, [refresh]);

    // Follow the tail only when the reader is already at it, so scrolling back through history is
    // not yanked away by an arriving line.
    useEffect(() => {
        const element = scrollRef.current;
        if (!element) {
            return;
        }
        const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
        if (atBottom) {
            element.scrollTop = element.scrollHeight;
        }
    }, [messages]);

    const send = useCallback(async () => {
        const body = draft.trim();
        if (!body || sending) {
            return;
        }
        setSending(true);
        setError("");
        try {
            const posted = await postArenaChat(body);
            merge([posted.message]);
            setDraft("");
        } catch (err) {
            // The server's wording names the rule that was hit — a blocked word, an outside link, or
            // posting too fast — which is the only useful thing to show here.
            setError(socialErrorMessage(err, t("Could not send that message")));
        } finally {
            if (mountedRef.current) {
                setSending(false);
            }
        }
    }, [draft, sending, merge]);

    /** Apply a server result to the one message it concerns, without disturbing the rest of the room. */
    const patch = useCallback((messageId: string, change: Partial<ArenaChatMessage>) => {
        setMessages((previous) =>
            previous.map((message) => (message.id === messageId ? { ...message, ...change } : message)),
        );
    }, []);

    const toggleUpvote = useCallback(
        async (message: ArenaChatMessage) => {
            // Optimistic: a vote that feels instant is the whole point of a vote button. The server
            // answer replaces the guess, and a failure reloads so a wrong count is never left standing.
            patch(message.id, {
                upvotes: message.upvotes + (message.youVoted ? -1 : 1),
                youVoted: !message.youVoted,
            });
            try {
                const result = await upvoteArenaChat(message.id);
                patch(message.id, { upvotes: result.upvotes, youVoted: result.voted });
            } catch (err) {
                setError(socialErrorMessage(err, t("Could not register that vote")));
                void refresh();
            }
        },
        [patch, refresh],
    );

    const report = useCallback(
        async (message: ArenaChatMessage) => {
            try {
                const result = await reportArenaChat(message.id);
                setError("");
                if (result.hidden) {
                    // Enough distinct players reported it; it is gone for everyone on the next load.
                    setMessages((previous) => previous.filter((entry) => entry.id !== message.id));
                } else {
                    patch(message.id, { youReported: true });
                }
            } catch (err) {
                setError(socialErrorMessage(err, t("Could not report that message")));
            }
        },
        [patch],
    );

    return (
        <Stack spacing={0.75}>
            <Typography level="title-md" sx={{ color: hocColors.sidebarTitle }}>
                {t("Arena chat")}
            </Typography>

            <Box
                ref={scrollRef}
                sx={{
                    maxHeight: 220,
                    overflowY: "auto",
                    pr: 0.5,
                    border: `1px solid ${hocColors.orangeBorder}`,
                    borderRadius: "8px",
                    bgcolor: "rgba(0,0,0,0.24)",
                    p: 1,
                }}
            >
                {messages.length === 0 ? (
                    <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                        {t("Nothing said yet — say hello, or tag someone with @.")}
                    </Typography>
                ) : (
                    messages.map((message) => {
                        const votes = message.upvotes ?? 0;
                        const mine = message.youVoted === true;
                        const reported = message.youReported === true;
                        return (
                            <Stack
                                key={message.id}
                                direction="row"
                                alignItems="flex-start"
                                spacing={0.5}
                                sx={{ mb: 0.4 }}
                            >
                                <Typography level="body-sm" sx={{ color: hocColors.parchment, flex: 1, minWidth: 0 }}>
                                    <Box component="span" sx={{ color: hocColors.muted, mr: 0.75, fontSize: "0.78em" }}>
                                        {timeLabel(message.createdAt)}
                                    </Box>
                                    <Box component="span" sx={{ color: hocColors.gold, fontWeight: 700, mr: 0.5 }}>
                                        {message.username}
                                    </Box>
                                    {chatSegments(message.body, selfUsername).map((segment, index) => {
                                        const key = `${message.id}:${index}`;
                                        if (segment.kind === "mention") {
                                            return (
                                                <Box
                                                    key={key}
                                                    component="span"
                                                    sx={{
                                                        color: segment.isSelf ? hocColors.green : hocColors.orange,
                                                        fontWeight: segment.isSelf ? 800 : 600,
                                                    }}
                                                >
                                                    {segment.text}
                                                </Box>
                                            );
                                        }
                                        if (segment.kind === "link") {
                                            return (
                                                <Box
                                                    key={key}
                                                    component="a"
                                                    href={segment.href}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    sx={{ color: hocColors.orange, textDecoration: "underline" }}
                                                >
                                                    {segment.text}
                                                </Box>
                                            );
                                        }
                                        return <React.Fragment key={key}>{segment.text}</React.Fragment>;
                                    })}
                                </Typography>
                                <Tooltip title={t("Upvote")} size="sm">
                                    <IconButton
                                        size="sm"
                                        variant="plain"
                                        onClick={() => void toggleUpvote(message)}
                                        sx={{ color: mine ? hocColors.green : hocColors.muted, minHeight: 20, px: 0.4 }}
                                    >
                                        <ThumbUpOutlinedIcon sx={{ fontSize: 14 }} />
                                        {votes > 0 ? (
                                            <Box component="span" sx={{ ml: 0.3, fontSize: 12 }}>
                                                {votes}
                                            </Box>
                                        ) : null}
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title={reported ? t("Reported") : t("Report")} size="sm">
                                    <IconButton
                                        size="sm"
                                        variant="plain"
                                        disabled={reported}
                                        onClick={() => void report(message)}
                                        sx={{
                                            color: reported ? hocColors.danger : hocColors.muted,
                                            minHeight: 20,
                                            px: 0.4,
                                        }}
                                    >
                                        <FlagOutlinedIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                        );
                    })
                )}
            </Box>

            {error ? (
                <Typography level="body-xs" sx={{ color: hocColors.danger }}>
                    {error}
                </Typography>
            ) : null}

            <Stack direction="row" spacing={1}>
                <Input
                    size="sm"
                    placeholder={t("Message the arena — @name to tag someone")}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value.slice(0, MAX_LENGTH))}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void send();
                        }
                    }}
                    sx={{ ...hocInputSx, flex: 1 }}
                />
                <Button
                    size="sm"
                    sx={hocPrimaryButtonSx}
                    loading={sending}
                    disabled={!draft.trim()}
                    onClick={() => void send()}
                    startDecorator={<SendRoundedIcon />}
                >
                    {t("Send")}
                </Button>
            </Stack>
        </Stack>
    );
};
