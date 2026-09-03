import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import ReplyRoundedIcon from "@mui/icons-material/ReplyRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import { Box, IconButton, Input, Sheet, Stack, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    chatSegments,
    fetchArenaChat,
    fetchPublicPlayerStats,
    postArenaChat,
    reportArenaChat,
    socialErrorMessage,
    upvoteArenaChat,
    type ArenaChatMessage,
    type PublicPlayerStats,
} from "../api/social_client";
import { siteUrlBase } from "../api/site_origin";
import { t, tf, useTranslation } from "../i18n/i18n";
import { hocColors, hocInputSx } from "./hocTheme";
import { startVisibleInterval } from "./visibleInterval";

const POLL_INTERVAL_MS = 4000;
const MAX_LENGTH = 300;
/** Keep the rendered room bounded however long the tab stays open. */
const MAX_RENDERED = 120;
/** Exported so a chat notification can force the room open before navigating to the arena. */
export const ARENA_CHAT_OPEN_KEY = "hoc:arenaChatOpen";
const COLLAPSE_KEY = ARENA_CHAT_OPEN_KEY;
/** How long a jumped-to original stays highlighted after clicking a reply's quote. */
const FLASH_MS = 1400;

/** The site's full-profile page for a player, language-aware (same shape matchHistoryModel builds). */
export const playerProfileHref = (playerId: string, username: string, language: string): string => {
    const url = new URL(language === "ru" ? "/ru/profile/" : "/profile/", siteUrlBase());
    url.searchParams.set("playerId", playerId);
    if (username) {
        url.searchParams.set("username", username);
    }
    return url.toString();
};

/** What the in-chat player card is looking at: resolved stats, still fetching, or a 404'd rookie. */
interface PlayerCardState {
    playerId: string;
    username: string;
    stats: PublicPlayerStats | null;
    loading: boolean;
    /** True when the server answered 404 — a real account with no ranked record, not an error. */
    unranked: boolean;
}

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
    const { language } = useTranslation();
    const [messages, setMessages] = useState<ArenaChatMessage[]>([]);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState("");
    const [sending, setSending] = useState(false);
    const [open, setOpen] = useState<boolean>(() => window.localStorage.getItem(COLLAPSE_KEY) !== "0");
    /** The message the next send answers, shown as a chip over the input until sent or cancelled. */
    const [replyTo, setReplyTo] = useState<ArenaChatMessage | null>(null);
    /** Briefly highlights the original after clicking a reply's quote, so the jump lands somewhere. */
    const [flashId, setFlashId] = useState("");
    /** The player card opened by clicking a speaker's name; null when closed. One at a time. */
    const [playerCard, setPlayerCard] = useState<PlayerCardState | null>(null);
    const mountedRef = useRef(true);
    const newestRef = useRef(0);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const flashTimerRef = useRef(0);

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
        const stopPolling = startVisibleInterval(() => void refresh(), POLL_INTERVAL_MS);
        return () => {
            mountedRef.current = false;
            stopPolling();
        };
    }, [refresh, open]);

    useEffect(() => {
        window.localStorage.setItem(COLLAPSE_KEY, open ? "1" : "0");
    }, [open]);

    useEffect(() => () => window.clearTimeout(flashTimerRef.current), []);

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
            const posted = await postArenaChat(body, replyTo?.id);
            merge([posted.message]);
            setDraft("");
            setReplyTo(null);
        } catch (err) {
            // The server's wording names the rule that was hit — a blocked word, an outside link, or
            // posting too fast — which is the only useful thing to show here.
            setError(socialErrorMessage(err, t("Could not send that message")));
        } finally {
            if (mountedRef.current) {
                setSending(false);
            }
        }
    }, [draft, sending, merge, replyTo]);

    const beginReply = useCallback((message: ArenaChatMessage) => {
        setReplyTo(message);
        inputRef.current?.focus();
    }, []);

    /** Open (or toggle closed) the stats card for a speaker. Fetches the PUBLIC ranked profile. */
    const openPlayerCard = useCallback((playerId: string, username: string) => {
        setPlayerCard((previous) => {
            if (previous?.playerId === playerId) {
                return null;
            }
            void (async () => {
                try {
                    const stats = await fetchPublicPlayerStats(playerId);
                    if (mountedRef.current) {
                        setPlayerCard((current) =>
                            current?.playerId === playerId ? { ...current, stats, loading: false } : current,
                        );
                    }
                } catch (err) {
                    // 404 means "never entered ranked" — a real answer, not a failure.
                    const status = (err as { response?: { status?: number } })?.response?.status;
                    if (mountedRef.current) {
                        setPlayerCard((current) =>
                            current?.playerId === playerId
                                ? { ...current, loading: false, unranked: status === 404 }
                                : current,
                        );
                    }
                }
            })();
            return { playerId, username, stats: null, loading: true, unranked: false };
        });
    }, []);

    /** Scroll a reply's original into view, if it is still in the rendered room. */
    const jumpToMessage = useCallback((messageId: string) => {
        const row = scrollRef.current?.querySelector(`[data-mid="${messageId}"]`);
        if (!row) {
            return;
        }
        row.scrollIntoView({ block: "center", behavior: "smooth" });
        setFlashId(messageId);
        window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = window.setTimeout(() => {
            if (mountedRef.current) {
                setFlashId("");
            }
        }, FLASH_MS);
    }, []);

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
                                            data-mid={message.id}
                                            direction="row"
                                            alignItems="flex-start"
                                            spacing={0.5}
                                            sx={{
                                                px: 0.5,
                                                py: 0.15,
                                                mx: -0.5,
                                                borderRadius: "6px",
                                                transition: "background-color 120ms ease",
                                                bgcolor: flashId === message.id ? "rgba(255,143,0,0.16)" : undefined,
                                                "&:hover": {
                                                    bgcolor:
                                                        flashId === message.id
                                                            ? "rgba(255,143,0,0.16)"
                                                            : "rgba(255,255,255,0.04)",
                                                },
                                                // Actions stay out of the way until the row is under the pointer. On a
                                                // touch screen there is no hover to wait for, so they are always shown.
                                                "&:hover .hoc-chat-action": { opacity: 1 },
                                                "@media (hover: none)": { ".hoc-chat-action": { opacity: 1 } },
                                            }}
                                        >
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                {message.replyToId ? (
                                                    // The quoted original: a slim accent-barred line above the reply,
                                                    // carried on the message itself so it renders even after the
                                                    // original left the room. Clicking jumps to the original if it is
                                                    // still on screen.
                                                    <Stack
                                                        direction="row"
                                                        alignItems="center"
                                                        spacing={0.5}
                                                        onClick={() =>
                                                            message.replyToId && jumpToMessage(message.replyToId)
                                                        }
                                                        sx={{
                                                            mt: 0.25,
                                                            pl: 0.75,
                                                            py: 0.1,
                                                            borderLeft: `2px solid ${speakerColor(
                                                                message.replyToUsername ?? "",
                                                            )}`,
                                                            borderRadius: "2px",
                                                            cursor: "pointer",
                                                            opacity: 0.85,
                                                            "&:hover": { opacity: 1 },
                                                        }}
                                                    >
                                                        <ReplyRoundedIcon
                                                            sx={{ fontSize: 12, color: hocColors.muted, flexShrink: 0 }}
                                                        />
                                                        <Typography
                                                            level="body-xs"
                                                            sx={{
                                                                minWidth: 0,
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                whiteSpace: "nowrap",
                                                            }}
                                                        >
                                                            <Box
                                                                component="span"
                                                                sx={{
                                                                    color: speakerColor(message.replyToUsername ?? ""),
                                                                    fontWeight: 700,
                                                                    mr: 0.5,
                                                                }}
                                                            >
                                                                {message.replyToUsername}
                                                            </Box>
                                                            <Box component="span" sx={{ color: hocColors.muted }}>
                                                                {message.replyToSnippet}
                                                            </Box>
                                                        </Typography>
                                                    </Stack>
                                                ) : null}
                                                <Typography
                                                    level="body-sm"
                                                    sx={{ color: hocColors.parchment, minWidth: 0 }}
                                                >
                                                    <Box
                                                        component="span"
                                                        sx={{ color: hocColors.muted, mr: 0.75, fontSize: "0.78em" }}
                                                    >
                                                        {timeLabel(message.createdAt)}
                                                    </Box>
                                                    <Box
                                                        component="span"
                                                        role="button"
                                                        tabIndex={0}
                                                        title={t("View stats")}
                                                        onClick={() =>
                                                            openPlayerCard(message.playerId, message.username)
                                                        }
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter" || event.key === " ") {
                                                                event.preventDefault();
                                                                openPlayerCard(message.playerId, message.username);
                                                            }
                                                        }}
                                                        sx={{
                                                            color: speakerColor(message.username),
                                                            fontWeight: 700,
                                                            mr: 0.5,
                                                            cursor: "pointer",
                                                            "&:hover": { textDecoration: "underline" },
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
                                                        return (
                                                            <React.Fragment key={key}>{segment.text}</React.Fragment>
                                                        );
                                                    })}
                                                </Typography>
                                            </Box>
                                            <IconButton
                                                className="hoc-chat-action"
                                                size="sm"
                                                variant="plain"
                                                title={t("Reply")}
                                                onClick={() => beginReply(message)}
                                                sx={{
                                                    opacity: 0,
                                                    transition: "opacity 120ms ease",
                                                    color: hocColors.muted,
                                                    minHeight: 20,
                                                    px: 0.4,
                                                    "&:hover": { color: hocColors.orange },
                                                }}
                                            >
                                                <ReplyRoundedIcon sx={{ fontSize: 14 }} />
                                            </IconButton>
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

                        {playerCard ? (
                            // The clicked speaker's public ranked card, pinned between the room and the
                            // composer — no popper to position, and it reads the same on touch.
                            <Box
                                sx={{
                                    px: 1,
                                    py: 0.75,
                                    borderRadius: "8px",
                                    border: `1px solid ${hocColors.orangeBorder}`,
                                    bgcolor: "rgba(255,143,0,0.06)",
                                }}
                            >
                                <Stack direction="row" alignItems="center" spacing={0.75}>
                                    <Typography
                                        level="body-sm"
                                        sx={{ color: speakerColor(playerCard.username), fontWeight: 700 }}
                                    >
                                        {playerCard.username}
                                    </Typography>
                                    {playerCard.stats?.standingTitle ? (
                                        <Typography level="body-xs" sx={{ color: hocColors.gold }}>
                                            {playerCard.stats.standingTitle}
                                        </Typography>
                                    ) : null}
                                    <Box sx={{ flex: 1 }} />
                                    <Box
                                        component="a"
                                        href={playerProfileHref(playerCard.playerId, playerCard.username, language)}
                                        target="_blank"
                                        rel="noreferrer"
                                        sx={{
                                            color: hocColors.orange,
                                            fontSize: 12,
                                            textDecoration: "underline",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {t("Full profile")}
                                    </Box>
                                    <IconButton
                                        size="sm"
                                        variant="plain"
                                        title={t("Close")}
                                        onClick={() => setPlayerCard(null)}
                                        sx={{ minHeight: 18, px: 0.3, color: hocColors.muted }}
                                    >
                                        <CloseRoundedIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </Stack>
                                <Typography level="body-xs" sx={{ color: hocColors.muted, mt: 0.25 }}>
                                    {playerCard.loading
                                        ? t("Loading stats…")
                                        : playerCard.unranked || !playerCard.stats
                                          ? t("No ranked record yet")
                                          : [
                                                playerCard.stats.state === "placed"
                                                    ? tf("MMR {value}", { value: playerCard.stats.mmr ?? 0 })
                                                    : tf("Calibration {done}/{total}", {
                                                          done: playerCard.stats.calibration?.gamesPlayed ?? 0,
                                                          total: playerCard.stats.calibration?.required ?? 0,
                                                      }),
                                                (playerCard.stats.leaderboardRank ?? 0) > 0
                                                    ? tf("rank #{rank}", {
                                                          rank: playerCard.stats.leaderboardRank ?? 0,
                                                      })
                                                    : "",
                                                `${playerCard.stats.wins ?? 0}–${playerCard.stats.losses ?? 0}–${playerCard.stats.draws ?? 0}`,
                                                tf("{pct}% wins", { pct: playerCard.stats.winRatePct ?? 0 }),
                                                tf("{amount} gold", { amount: playerCard.stats.gold ?? 0 }),
                                            ]
                                                .filter(Boolean)
                                                .join(" · ")}
                                </Typography>
                            </Box>
                        ) : null}

                        {error ? (
                            <Typography level="body-xs" sx={{ color: hocColors.danger }}>
                                {error}
                            </Typography>
                        ) : null}

                        {replyTo ? (
                            // The armed reply, pinned over the input until sent or dismissed (× or
                            // Escape). Styled like the quote a sent reply will carry, so what you see
                            // here is what the room gets.
                            <Stack
                                direction="row"
                                alignItems="center"
                                spacing={0.5}
                                sx={{
                                    pl: 0.75,
                                    py: 0.3,
                                    borderLeft: `2px solid ${hocColors.orange}`,
                                    borderRadius: "2px",
                                    bgcolor: "rgba(255,143,0,0.08)",
                                }}
                            >
                                <ReplyRoundedIcon sx={{ fontSize: 13, color: hocColors.orange, flexShrink: 0 }} />
                                <Typography
                                    level="body-xs"
                                    sx={{
                                        flex: 1,
                                        minWidth: 0,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    <Box component="span" sx={{ color: hocColors.orange, fontWeight: 700, mr: 0.5 }}>
                                        {tf("Replying to {name}", { name: replyTo.username })}
                                    </Box>
                                    <Box component="span" sx={{ color: hocColors.muted }}>
                                        {replyTo.body}
                                    </Box>
                                </Typography>
                                <IconButton
                                    size="sm"
                                    variant="plain"
                                    title={t("Cancel reply")}
                                    onClick={() => setReplyTo(null)}
                                    sx={{ minHeight: 18, px: 0.3, color: hocColors.muted }}
                                >
                                    <CloseRoundedIcon sx={{ fontSize: 14 }} />
                                </IconButton>
                            </Stack>
                        ) : null}

                        <Input
                            size="sm"
                            slotProps={{ input: { ref: inputRef } }}
                            placeholder={
                                replyTo
                                    ? tf("Reply to {name}…", { name: replyTo.username })
                                    : t("Message the arena — @name to tag someone")
                            }
                            value={draft}
                            onChange={(event) => setDraft(event.target.value.slice(0, MAX_LENGTH))}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    void send();
                                }
                                if (event.key === "Escape" && replyTo) {
                                    setReplyTo(null);
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
