import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import { Box, IconButton, Input, Sheet, Stack, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    chatSegments,
    fetchArenaChat,
    postArenaChat,
    reportArenaChat,
    socialErrorMessage,
    upvoteArenaChat,
    type ArenaChatMessage,
} from "../api/social_client";
import { t, tf, useTranslation } from "../i18n/i18n";
import { hocColors, hocInputSx } from "./hocTheme";

const POLL_INTERVAL_MS = 4000;
const MAX_LENGTH = 300;
/** Keep the rendered room bounded however long the tab stays open. */
const MAX_RENDERED = 120;
const COLLAPSE_KEY = "hoc:arenaChatOpen";

const timeLabel = (createdAt: number): string =>
    new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Give each speaker a stable colour so the room is skimmable without avatars — an avatar per row is
 * an extra element and an extra request each, and the room is bounded at {@link MAX_RENDERED} rows.
 */
const SPEAKER_COLORS = ["#8ec7ff", "#c9a0ff", "#ffd479", "#7fe0c0", "#ff9db0", "#a5d86e"] as const;

const speakerColor = (username: string): string => {
    let hash = 0;
    for (let index = 0; index < username.length; index++) {
        hash = (hash * 31 + username.charCodeAt(index)) >>> 0;
    }
    return SPEAKER_COLORS[hash % SPEAKER_COLORS.length];
};

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
    const [open, setOpen] = useState<boolean>(() => window.localStorage.getItem(COLLAPSE_KEY) !== "0");
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

    // A collapsed or backgrounded room costs nothing: a player who parked the arena in a tab for an
    // hour was otherwise paying a request every 4s to fill a scroll box nobody was looking at. The
    // cursor makes catching up cheap, so the wake-up poll returns the whole gap in one response.
    useEffect(() => {
        mountedRef.current = true;
        if (!open) {
            return () => {
                mountedRef.current = false;
            };
        }
        const tick = () => {
            if (!document.hidden) {
                void refresh();
            }
        };
        tick();
        const handle = window.setInterval(tick, POLL_INTERVAL_MS);
        document.addEventListener("visibilitychange", tick);
        return () => {
            mountedRef.current = false;
            window.clearInterval(handle);
            document.removeEventListener("visibilitychange", tick);
        };
    }, [refresh, open]);

    useEffect(() => {
        window.localStorage.setItem(COLLAPSE_KEY, open ? "1" : "0");
    }, [open]);

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
    }, [messages, open]);

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

    const speakers = useMemo(() => new Set(messages.map((message) => message.username)).size, [messages]);

    return (
        <Sheet
            variant="plain"
            sx={{
                // Without this the panel is content-box, and `width: 100%` puts the padding and border
                // OUTSIDE the grid column — the room ends up ~22px wider than the card above it.
                boxSizing: "border-box",
                width: "100%",
                p: 1.25,
                borderRadius: "12px",
                // No border and no card shadow. The room used to be a frame around a frame around a
                // frame — panel, scroll box, input — which is a lot of rectangles for six lines of
                // text. A tint is enough to say "this is a region" on a dark page.
                border: "none",
                boxShadow: "none",
                bgcolor: "rgba(12,8,5,0.55)",
                color: hocColors.parchment,
            }}
        >
            {/* Full width of the region on purpose. The arena card centres its content in an 860px
                column, but matching that here just made the room narrower than the space it owns —
                and a chat line benefits from every pixel of width it can get. */}
            <Stack spacing={open ? 0.75 : 0} sx={{ width: "100%" }}>
                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    onClick={() => setOpen((previous) => !previous)}
                    sx={{
                        cursor: "pointer",
                        userSelect: "none",
                        "&:hover .hoc-chat-caret": { color: hocColors.orange },
                    }}
                >
                    <Box
                        sx={{
                            width: 7,
                            height: 7,
                            flexShrink: 0,
                            borderRadius: "50%",
                            bgcolor: hocColors.green,
                            boxShadow: `0 0 6px ${hocColors.green}`,
                        }}
                    />
                    <Typography level="title-sm" sx={{ color: hocColors.sidebarTitle }}>
                        {t("Arena chat")}
                    </Typography>
                    <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                        {speakers > 0 ? tf("{count} talking", { count: speakers }) : t("quiet")}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <ExpandMoreRoundedIcon
                        className="hoc-chat-caret"
                        sx={{
                            fontSize: 18,
                            color: hocColors.muted,
                            transition: "transform 160ms ease, color 160ms ease",
                            transform: open ? "rotate(180deg)" : "none",
                        }}
                    />
                </Stack>

                {open ? (
                    <>
                        <Box
                            ref={scrollRef}
                            sx={{
                                minHeight: 96,
                                maxHeight: 240,
                                display: "block",
                                overflowY: "auto",
                                pr: 0.5,
                                py: 0.25,
                                scrollbarWidth: "thin",
                            }}
                        >
                            {messages.length === 0 ? (
                                <Box sx={{ display: "grid", placeItems: "center", minHeight: 90 }}>
                                    <Typography level="body-sm" sx={{ color: hocColors.muted, textAlign: "center" }}>
                                        {t("Nothing said yet — say hello, or tag someone with @.")}
                                    </Typography>
                                </Box>
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
                                            sx={{
                                                px: 0.5,
                                                py: 0.15,
                                                mx: -0.5,
                                                borderRadius: "6px",
                                                transition: "background-color 120ms ease",
                                                "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
                                                // Actions stay out of the way until the row is under the pointer. On a
                                                // touch screen there is no hover to wait for, so they are always shown.
                                                "&:hover .hoc-chat-action": { opacity: 1 },
                                                "@media (hover: none)": { ".hoc-chat-action": { opacity: 1 } },
                                            }}
                                        >
                                            <Typography
                                                level="body-sm"
                                                sx={{ color: hocColors.parchment, flex: 1, minWidth: 0 }}
                                            >
                                                <Box
                                                    component="span"
                                                    sx={{ color: hocColors.muted, mr: 0.75, fontSize: "0.78em" }}
                                                >
                                                    {timeLabel(message.createdAt)}
                                                </Box>
                                                <Box
                                                    component="span"
                                                    sx={{
                                                        color: speakerColor(message.username),
                                                        fontWeight: 700,
                                                        mr: 0.5,
                                                    }}
                                                >
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
                                                                    color: segment.isSelf
                                                                        ? hocColors.green
                                                                        : hocColors.orange,
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
                                                                sx={{
                                                                    color: hocColors.orange,
                                                                    textDecoration: "underline",
                                                                }}
                                                            >
                                                                {segment.text}
                                                            </Box>
                                                        );
                                                    }
                                                    return <React.Fragment key={key}>{segment.text}</React.Fragment>;
                                                })}
                                            </Typography>
                                            <IconButton
                                                className="hoc-chat-action"
                                                size="sm"
                                                variant="plain"
                                                title={t("Upvote")}
                                                onClick={() => void toggleUpvote(message)}
                                                sx={{
                                                    // A row that already carries a score keeps it on screen; a bare
                                                    // row only offers the button once the pointer is on it.
                                                    opacity: votes > 0 || mine ? 1 : 0,
                                                    transition: "opacity 120ms ease",
                                                    color: mine ? hocColors.green : hocColors.muted,
                                                    minHeight: 20,
                                                    px: 0.4,
                                                }}
                                            >
                                                <ThumbUpOutlinedIcon sx={{ fontSize: 14 }} />
                                                {votes > 0 ? (
                                                    <Box component="span" sx={{ ml: 0.3, fontSize: 12 }}>
                                                        {votes}
                                                    </Box>
                                                ) : null}
                                            </IconButton>
                                            <IconButton
                                                className="hoc-chat-action"
                                                size="sm"
                                                variant="plain"
                                                disabled={reported}
                                                title={reported ? t("Reported") : t("Report")}
                                                onClick={() => void report(message)}
                                                sx={{
                                                    opacity: reported ? 1 : 0,
                                                    transition: "opacity 120ms ease",
                                                    color: reported ? hocColors.danger : hocColors.muted,
                                                    minHeight: 20,
                                                    px: 0.4,
                                                }}
                                            >
                                                <FlagOutlinedIcon sx={{ fontSize: 14 }} />
                                            </IconButton>
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
                            endDecorator={
                                <Stack direction="row" alignItems="center" spacing={0.5}>
                                    {draft.length > MAX_LENGTH - 60 ? (
                                        <Typography
                                            level="body-xs"
                                            sx={{
                                                color: draft.length >= MAX_LENGTH ? hocColors.danger : hocColors.muted,
                                            }}
                                        >
                                            {MAX_LENGTH - draft.length}
                                        </Typography>
                                    ) : null}
                                    <IconButton
                                        size="sm"
                                        variant="plain"
                                        title={t("Send")}
                                        loading={sending}
                                        disabled={!draft.trim()}
                                        onClick={() => void send()}
                                        sx={{ color: draft.trim() ? hocColors.orange : hocColors.muted }}
                                    >
                                        <SendRoundedIcon sx={{ fontSize: 18 }} />
                                    </IconButton>
                                </Stack>
                            }
                            // A hairline that lights up on focus, rather than a fourth box. The rule
                            // also does the job the removed scroll-box border was doing: separating
                            // what has been said from what you are about to say.
                            sx={{
                                ...hocInputSx,
                                bgcolor: "transparent",
                                border: "none",
                                borderRadius: 0,
                                px: 0,
                                borderBottom: `1px solid rgba(255,143,0,0.22)`,
                                "--Input-focusedThickness": "0px",
                                "&::before": { display: "none" },
                                "&:hover": { borderBottomColor: "rgba(255,143,0,0.45)" },
                                "&:focus-within": { borderBottomColor: hocColors.orange },
                            }}
                        />
                    </>
                ) : null}
            </Stack>
        </Sheet>
    );
};
