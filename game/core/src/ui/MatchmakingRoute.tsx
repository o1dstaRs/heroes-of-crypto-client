import { CustomEventSource } from "@heroesofcrypto/common";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import TimerRoundedIcon from "@mui/icons-material/TimerRounded";
import { Alert, Box, Button, Sheet, Stack, Tooltip, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { buildApiUrl, endpoints, HOST_MATCHMAKING_API } from "../api/axios";
import { createVsAiGame } from "../api/vs_ai_client";
import { fetchPublicPlayerStats, type PublicPlayerStats } from "../api/social_client";
import { tf, useTranslation } from "../i18n/i18n";
import { markVsAiGame } from "../utils/aiOpponent";
import { getPreGameDoctrine, setPreGameDoctrine } from "../utils/preGameDoctrine";
import { ArenaChatPanel } from "./ArenaChatPanel";
import {
    clearMatchReadyAlert,
    isFreshMatchReady,
    requestMatchReadyPermission,
    signalMatchReady,
} from "./matchReadyAlert";
import { PublicLobbiesPanel } from "./PublicLobbiesPanel";
import { RankedBanPicker } from "./RankedBanPicker";
import { WagerStakeBox } from "./WagerStakeBox";
import { Doctrine } from "@heroesofcrypto/common";
import { useAuthContext } from "./auth/context/auth_context";
import {
    hocActionPrimaryButtonSx,
    hocActionSoftButtonSx,
    hocColors,
    hocDisplayFontFamily,
    hocPanelSx,
    hocPrimaryButtonSx,
    hocSoftButtonSx,
} from "./hocTheme";
import { DoctrineIcon } from "./DoctrineIcon";
import { ArenaNavBar } from "./ArenaNavBar";
import { ARENA_IDLE_WASH, arenaBackgroundUrl } from "./arenaBackdrop";
import { startBackgroundAssetPrefetch } from "./assetPrefetch";
import { getDoctrineCopy } from "./doctrineCopy";
import { isMockPortalEnabled } from "./PlayerPortal/mockPortal";
import { PlayerPortalSidebar } from "./PlayerPortal/PlayerPortalSidebar";
import { useRankedSeason } from "./useRankedSeason";
import { useRankedStanding } from "./PlayerPortal/useRankedStanding";
import { PracticeAiIcon, RankedSearchIcon, StatsPanelIcon } from "./svg/navigation";
import {
    isAcceptedMatchHandoff,
    isAmbiguousConfirmFailure,
    isCurrentAcceptAttempt,
    matchmakingOpponentId,
    type MatchmakingCurrentGame,
    resolveConfirmFailure,
    resolveTerminalHandoff,
    shouldSurfaceMatchmakingStreamError,
    TERMINAL_MATCHMAKING_STREAM_ERROR,
} from "./matchmakingAcceptTransition";
import { MatchFoundOpponentPreview } from "./MatchFoundOpponentPreview";

type MatchmakingEvent = {
    ps?: string;
    po?: number;
    r?: number;
    c?: number;
    /** Recipient-specific opponent player id; older servers omit it. */
    oi?: string;
};

type MatchmakingState = "idle" | "searching" | "confirming" | "accepted" | "starting-ai" | "error";

const STORAGE_KEY = "accessToken";

const matchEventUrl = () => buildApiUrl(HOST_MATCHMAKING_API, endpoints.mm.events);
const MOCK_MATCH_ID = "mock-ranked-match-2026-08-29";
const MOCK_OPPONENT_STATS: PublicPlayerStats = {
    playerId: "00000000-0000-4000-8000-000000000029",
    username: "EmberWarden",
    state: "placed",
    mmr: 1842,
    league: 4,
    leagueName: "Overlord",
    wealth: 3,
    wealthName: "Whale",
    standingTitle: "Overlord Whale",
    leaderboardRank: 17,
    wins: 142,
    losses: 89,
    draws: 6,
    totalGames: 237,
    winRatePct: 59.9,
    winStreak: 4,
    lossStreak: 0,
    gold: 1330,
};

/** m:ss for a queue wait (h:mm:ss past the hour, which realistically never happens). */
const formatQueueDuration = (totalSeconds: number): string => {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(seconds / 60);
    const paddedSeconds = String(seconds % 60).padStart(2, "0");
    if (minutes < 60) {
        return `${minutes}:${paddedSeconds}`;
    }
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${paddedSeconds}`;
};

/** Joy's decorator→label gap on this button, held as a constant so the fit test never depends on it. */
const PRACTICE_LABEL_GAP = 8;

/**
 * "Practice vs AI" lives in the narrow third of the action row, where its own wording is the widest thing
 * that has to fit. One breakpoint cannot serve both shipped languages: measured at this button's font, the
 * English label needs ~112px of room and the Russian ("Тренировка против ИИ") ~183px, so anywhere between a
 * 640px and a 900px viewport the English label still fits while the Russian one does not. So the button
 * measures rather than guesses, and falls back to the bare icon exactly when the label would not fit —
 * below `sm` the row stacks to one column and the label always fits again.
 *
 * The measuring copy is absolutely positioned, so hiding the real label never changes what is measured.
 * Measuring the live label instead is what would oscillate: hide it, the button fits, show it, it does not.
 */
const PracticeVsAiButton: React.FC<{ loading: boolean; onClick: () => void }> = ({ loading, onClick }) => {
    const { t, language } = useTranslation();
    const label = t("Practice vs AI");
    const buttonRef = useRef<HTMLButtonElement>(null);
    const probeRef = useRef<HTMLSpanElement>(null);
    const [labelFits, setLabelFits] = useState(true);

    useEffect(() => {
        const button = buttonRef.current;
        const probe = probeRef.current;
        if (!button || !probe) {
            return undefined;
        }
        const measure = (): void => {
            const style = getComputedStyle(button);
            const decorator = button.querySelector(".MuiButton-startDecorator");
            const room =
                button.clientWidth -
                parseFloat(style.paddingLeft) -
                parseFloat(style.paddingRight) -
                (decorator?.getBoundingClientRect().width ?? 0) -
                PRACTICE_LABEL_GAP;
            setLabelFits(probe.getBoundingClientRect().width <= room);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(button);
        // The display face is preloaded but still resolves after first paint; until it does the probe is
        // measuring the fallback serif and can drop a label that the real face would have fitted.
        document.fonts?.ready.then(measure).catch(() => undefined);
        return () => observer.disconnect();
    }, [label, language]);

    return (
        <Tooltip title={labelFits ? "" : label} variant="soft" placement="top">
            <Button
                ref={buttonRef}
                fullWidth
                variant="soft"
                aria-label={label}
                loading={loading}
                disabled={loading}
                onClick={onClick}
                startDecorator={<PracticeAiIcon sx={{ fontSize: 24 }} />}
                sx={{
                    ...hocActionSoftButtonSx,
                    minHeight: 58,
                    fontFamily: hocDisplayFontFamily,
                    fontSize: "0.92rem",
                    // Collapsed with the label so the lone icon sits centred rather than off to one side.
                    "--Button-gap": labelFits ? `${PRACTICE_LABEL_GAP}px` : "0px",
                }}
            >
                <Box
                    component="span"
                    sx={{
                        position: "relative",
                        whiteSpace: "nowrap",
                        // Only once the label is gone: the probe still measures at its natural width (an
                        // absolutely positioned box is clipped, not resized), but it stops widening the
                        // button's scrollable overflow, which is what turns an invisible probe into a
                        // phantom scrollbar the first time an ancestor is given overflow: auto.
                        ...(labelFits ? {} : { width: 0, overflow: "hidden" }),
                    }}
                >
                    <Box
                        component="span"
                        ref={probeRef}
                        aria-hidden
                        sx={{ position: "absolute", visibility: "hidden", whiteSpace: "nowrap" }}
                    >
                        {label}
                    </Box>
                    {labelFits ? label : null}
                </Box>
            </Button>
        </Tooltip>
    );
};

export const MatchmakingRoute: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { t, language } = useTranslation();
    const { startGameSearch, stopGameSearch, confirmGame, getCurrentGame, user, requestCode, me } = useAuthContext();
    // Development-only match-found preview. Pair with ?mockPortal=1 so no live queue or player is touched.
    const mockMatchMode = isMockPortalEnabled() ? searchParams.get("mockMatch") : null;
    const mockMatchPreview = mockMatchMode === "found" || mockMatchMode === "accepted";
    const mockMatchAccepted = mockMatchMode === "accepted";

    const streamRef = useRef<CustomEventSource<MatchmakingEvent> | null>(null);
    const acceptedGameIdRef = useRef(mockMatchAccepted ? MOCK_MATCH_ID : "");
    const pendingGameIdRef = useRef(mockMatchPreview ? MOCK_MATCH_ID : "");
    const acceptAttemptRef = useRef(0);
    /** The match we have already announced, so the repeating stream tick does not re-toast every second. */
    const alertedGameIdRef = useRef("");
    const mountedRef = useRef(true);
    const aiStartInFlightRef = useRef(false);
    const vsAiAutoStartedRef = useRef(false);
    const [state, setState] = useState<MatchmakingState>(
        mockMatchPreview ? (mockMatchAccepted ? "accepted" : "confirming") : "idle",
    );
    // The backend-free preview should land on the thing it exists to demonstrate. Live players keep
    // the compact arena default and opt into this panel with the stats toggle as before.
    const [profileSummaryOpen, setProfileSummaryOpen] = useState(() => isMockPortalEnabled());
    // Players currently on the arena (queue + live games) — polled from the public mm endpoint.
    const [onlineNow, setOnlineNow] = useState<{ searching: number; playing: number; online: number }>();
    const { currency, snapshot: seasonSnapshot } = useRankedSeason();
    // Only a PLACED player may stake. Treated as "cannot" until the standing actually loads, so the
    // control never flashes into view for a calibrating player on a slow request.
    const rankedStanding = useRankedStanding();
    const canStake = rankedStanding?.state === "placed";

    // Arena idle time is the cheapest place to pull board art: queue, chat, and browsing all happen
    // before a match exists. Do not abort on leave — this is once per tab and low-priority, and aborting
    // would also drop remaining URLs if the player hops to the portal then queues.
    useEffect(() => {
        startBackgroundAssetPrefetch();
    }, []);

    useEffect(() => {
        if (isMockPortalEnabled()) {
            setOnlineNow({ searching: 4, playing: 20, online: 24 });
            return undefined;
        }
        let cancelled = false;
        const poll = async (): Promise<void> => {
            try {
                const response = await fetch(buildApiUrl(HOST_MATCHMAKING_API, endpoints.mm.online));
                if (!response.ok) return;
                const data = (await response.json()) as { searching: number; playing: number; online: number };
                if (!cancelled) setOnlineNow(data);
            } catch {
                // Non-critical decoration — stay silent on failure.
            }
        };
        void poll();
        const interval = setInterval(() => void poll(), 15_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    const [pendingGameId, setPendingGameId] = useState(mockMatchPreview ? MOCK_MATCH_ID : "");
    const [opponentPlayerId, setOpponentPlayerId] = useState("");
    const [opponentStats, setOpponentStats] = useState<PublicPlayerStats | null>(
        mockMatchPreview ? MOCK_OPPONENT_STATS : null,
    );
    const [opponentStatsLoading, setOpponentStatsLoading] = useState(false);
    const updatePendingGameId = useCallback((gameId: string) => {
        pendingGameIdRef.current = gameId;
        setPendingGameId(gameId);
    }, []);
    // When this tab entered the queue — the fallback anchor for the "time in queue" readout while
    // the server's own enqueue timestamp is still in flight.
    const [searchStartedAt, setSearchStartedAt] = useState(0);
    const [queueSize, setQueueSize] = useState<number | null>(null);
    const [secondsRemaining, setSecondsRemaining] = useState<number | null>(mockMatchPreview ? 28 : null);
    const [error, setError] = useState("");
    const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
    // Pre-game doctrine (scouting doctrine): free to toggle until the player queues/starts; the chosen
    // value is locked into localStorage and read back by the in-game DOCTRINE pick phase to auto-commit.
    const [preGameDoctrine, setPreGameDoctrineState] = useState<Doctrine.Doctrine>(() => getPreGameDoctrine());

    // No-accept penalty: the server sets match_making_cooldown_till (ms epoch) when a player lets a found
    // match expire without accepting, and rejects re-queue until it passes. Surface it as a live countdown
    // instead of a bare "connection aborted" so the player knows why they can't search and for how long.
    const [nowMs, setNowMs] = useState(() => Date.now());
    const cooldownTill = Number(user?.match_making_cooldown_till ?? 0) || 0;
    const penaltySeconds = cooldownTill > nowMs ? Math.ceil((cooldownTill - nowMs) / 1000) : 0;
    const penalized = penaltySeconds > 0;

    // How long we have been looking for an opponent. The server's match_making_queue_added_time is the
    // authority — it survives a page reload and a re-queue keeps the original enqueue timestamp — so take
    // whichever start is earlier, with the local one covering the gap before POST /queue answers.
    const isSearching = state === "searching";
    const queueAddedAtMs = Number(user?.match_making_queue_added_time ?? 0) || 0;
    const searchAnchorMs =
        searchStartedAt > 0 && queueAddedAtMs > 0
            ? Math.min(searchStartedAt, queueAddedAtMs)
            : searchStartedAt || queueAddedAtMs;
    const queueElapsedLabel =
        isSearching && searchAnchorMs > 0 ? formatQueueDuration((nowMs - searchAnchorMs) / 1000) : "";
    const activeSeason = seasonSnapshot?.current ?? null;
    const nextSeason = seasonSnapshot?.next ?? null;
    const seasonMilestone = activeSeason?.endsAt ?? nextSeason?.startsAt ?? 0;
    const seasonMilestoneLabel = useMemo(
        () =>
            seasonMilestone > 0
                ? new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZoneName: "short",
                  }).format(seasonMilestone)
                : "",
        [language, seasonMilestone],
    );

    // A logged-in but email-unverified account (is_active === false) cannot enter matchmaking:
    // the server rejects POST /queue with "Activate your account to join the matchmaking queue".
    // Gate the whole ranked flow on activation so the user gets a clear "verify your email" path
    // instead of a doomed Find Opponent click that surfaces as a meaningless "Connection aborted".
    const needsActivation = user?.is_active === false;
    const accountEmail = user?.email ?? "";
    const vsAiRequested = searchParams.get("mode") === "vs-ai";
    // "Play vs AI" always uses the default AI (server's DEFAULT_AI_VERSION, tier-less seat) — no
    // difficulty picker. createVsAiGame() with no tier makes the server pick the default opponent.

    const closeStream = useCallback(() => {
        streamRef.current?.close();
        streamRef.current = null;
    }, []);

    const openStream = useCallback(() => {
        if (streamRef.current) {
            return;
        }

        const token = localStorage.getItem(STORAGE_KEY) ?? undefined;
        const source = new CustomEventSource<MatchmakingEvent>(matchEventUrl(), {
            token,
            maxReconnectAttempts: 8,
            reconnectDelay: 1000,
        });

        source.onmessage = (event: MatchmakingEvent) => {
            setError("");
            setQueueSize(typeof event.po === "number" ? event.po : null);
            setSecondsRemaining(typeof event.r === "number" ? event.r : null);

            if (!event.ps) {
                // Back to searching: nothing is waiting on the player, so stop shouting.
                clearMatchReadyAlert();
                alertedGameIdRef.current = "";
                setOpponentPlayerId("");
                setState("searching");
                return;
            }

            updatePendingGameId(event.ps);
            const nextOpponentPlayerId = matchmakingOpponentId(event.oi);
            if (nextOpponentPlayerId) {
                setOpponentPlayerId(nextOpponentPlayerId);
            }

            if (event.r !== undefined && event.r < 0) {
                // The window closed — whatever we were flashing is moot.
                clearMatchReadyAlert();
                alertedGameIdRef.current = "";
                acceptedGameIdRef.current = "";
                acceptAttemptRef.current += 1;
                setState("idle");
                updatePendingGameId("");
                setOpponentPlayerId("");
                setSecondsRemaining(null);
                // The found match window closed. If WE let it expire the server just set a no-accept
                // cooldown — refresh /me so the penalty countdown renders (a no-op if we weren't at fault).
                void me().catch(() => undefined);
                return;
            }

            if (event.c === 1) {
                // Both seats are in and we are navigating into the game: the alert has done its job.
                clearMatchReadyAlert();
                // Keep the completed handoff marker through close/navigation. closeStream aborts the
                // underlying fetch; if its rejection lands before unmount it is still an intentional close.
                acceptedGameIdRef.current = event.ps;
                acceptAttemptRef.current += 1;
                setState("accepted");
                closeStream();
                navigate(`/game/${event.ps}`);
                return;
            }

            // A match is waiting on this player. Announce it once, then keep the tab title counting down
            // so a glance at the tab strip is enough — the accept window is short and missing it costs a
            // no-accept cooldown. Already-accepted seats are just waiting on the opponent, so stay quiet.
            const secondsLeft = typeof event.r === "number" ? event.r : null;
            if (acceptedGameIdRef.current !== event.ps) {
                const fresh = isFreshMatchReady(event.ps, alertedGameIdRef.current, secondsLeft);
                if (fresh) {
                    alertedGameIdRef.current = event.ps;
                }
                signalMatchReady(secondsLeft, fresh);
            } else {
                clearMatchReadyAlert();
            }

            setState(acceptedGameIdRef.current === event.ps ? "accepted" : "confirming");
        };

        source.onerror = (err: Error) => {
            const acceptedGameId = acceptedGameIdRef.current;
            const pendingId = pendingGameIdRef.current;
            const acceptedHandoff = isAcceptedMatchHandoff(acceptedGameId, pendingId);
            const isTerminal = err.message === TERMINAL_MATCHMAKING_STREAM_ERROR;
            if (
                !shouldSurfaceMatchmakingStreamError(
                    err.message,
                    acceptedGameId,
                    pendingId,
                    streamRef.current === source,
                )
            ) {
                return;
            }

            if (acceptedHandoff && isTerminal) {
                const attempt = acceptAttemptRef.current;
                closeStream();
                // The stream is permanently closed, so unlock immediately even if /current itself hangs.
                // A successful reconciliation below can still route or restore the same match's Accept.
                setError(err.message);
                setState("error");

                void (async () => {
                    let currentGame: MatchmakingCurrentGame | null = null;
                    let reconciliationSucceeded = false;
                    try {
                        currentGame = await getCurrentGame();
                        reconciliationSucceeded = true;
                    } catch {
                        // The recoverable error state is already visible; a future Find retries the ingress.
                    }

                    if (
                        !isCurrentAcceptAttempt({
                            acceptedGameId: acceptedGameIdRef.current,
                            attempt,
                            currentAttempt: acceptAttemptRef.current,
                            expectedGameId: acceptedGameId,
                            mounted: mountedRef.current,
                            pendingGameId: pendingGameIdRef.current,
                        })
                    ) {
                        return;
                    }

                    const resolution = resolveTerminalHandoff(acceptedGameId, currentGame, reconciliationSucceeded);
                    if (resolution === "navigate") {
                        acceptAttemptRef.current += 1;
                        setError("");
                        navigate(`/game/${acceptedGameId}`);
                        return;
                    }

                    acceptedGameIdRef.current = "";
                    acceptAttemptRef.current += 1;
                    if (resolution === "retry-confirm") {
                        setState("confirming");
                    }
                })();
                return;
            }

            setError(err.message);
            setState((current) => (current === "accepted" ? current : "error"));
            // A dropped stream right after a found match is usually the accept window expiring. Pull the
            // fresh /me so a no-accept penalty renders as a countdown instead of just "connection aborted".
            void me().catch(() => undefined);
        };

        streamRef.current = source;
    }, [closeStream, getCurrentGame, navigate, me, updatePendingGameId]);

    useEffect(() => {
        if (mockMatchPreview) {
            setOpponentStats(MOCK_OPPONENT_STATS);
            setOpponentStatsLoading(false);
            return undefined;
        }
        if (!opponentPlayerId) {
            setOpponentStats(null);
            setOpponentStatsLoading(false);
            return undefined;
        }
        let cancelled = false;
        setOpponentStats(null);
        setOpponentStatsLoading(true);
        void fetchPublicPlayerStats(opponentPlayerId)
            .then((stats) => {
                if (!cancelled) {
                    setOpponentStats(stats);
                }
            })
            .catch(() => {
                // The Accept action stays primary if the decorative public profile cannot be read.
            })
            .finally(() => {
                if (!cancelled) {
                    setOpponentStatsLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [mockMatchPreview, opponentPlayerId]);

    // A terminal accepted-stream failure may reconcile to the same still-unconfirmed game. Re-opening
    // here makes the restored Accept button useful: its successful retry still needs the authoritative
    // c=1 navigation frame. Ordinary confirming transitions already have a live source and are a no-op.
    useEffect(() => {
        if (!mockMatchPreview && state === "confirming" && pendingGameIdRef.current && !streamRef.current) {
            openStream();
        }
    }, [mockMatchPreview, openStream, state]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            acceptedGameIdRef.current = "";
            acceptAttemptRef.current += 1;
            // Leaving the queue screen must restore the tab title; a stray interval would keep
            // rewriting it over whatever page the player moved to.
            clearMatchReadyAlert();
            closeStream();
        };
    }, [closeStream]);

    // Refresh /me on arrival so a penalty applied in a previous session/route shows immediately.
    useEffect(() => {
        void me().catch(() => undefined);
    }, [me]);

    // Tick while the queue timer runs or a penalty is active; the penalty tick stops once it elapses.
    useEffect(() => {
        if (!isSearching && cooldownTill <= Date.now()) {
            return undefined;
        }
        setNowMs(Date.now());
        const id = window.setInterval(() => {
            const t = Date.now();
            setNowMs(t);
            if (!isSearching && t >= cooldownTill) {
                window.clearInterval(id);
            }
        }, 500);
        return () => window.clearInterval(id);
    }, [cooldownTill, isSearching]);

    // Stamp the local queue-entry time on every path into the searching state (the Find button, and a
    // stream update that puts us back in the queue), and drop it once the search is over.
    useEffect(() => {
        setSearchStartedAt((previous) => (isSearching ? previous || Date.now() : 0));
    }, [isSearching]);

    useEffect(() => {
        if (mockMatchPreview) {
            return undefined;
        }
        let cancelled = false;

        getCurrentGame()
            .then((game) => {
                if (cancelled || !game?.id || game.abandoned) {
                    return;
                }

                if (game.confirmed) {
                    navigate(`/game/${game.id}`);
                    return;
                }

                updatePendingGameId(game.id);
                setState("confirming");
                openStream();
            })
            .catch(() => {
                // No current game is a normal state on this route.
            });

        return () => {
            cancelled = true;
        };
    }, [getCurrentGame, mockMatchPreview, navigate, openStream, updatePendingGameId]);

    const statusText = useMemo(() => {
        if (needsActivation) {
            return t("Email verification required");
        }
        if (penalized) {
            return tf("Match not accepted — search again in {seconds}s", { seconds: penaltySeconds });
        }
        if (state === "searching") {
            return queueSize
                ? tf("Looking for opponent ({count} in queue)", { count: queueSize })
                : t("Looking for opponent");
        }
        if (state === "confirming") {
            return secondsRemaining && secondsRemaining > 0
                ? tf("Match found. Accept within {seconds}s.", { seconds: secondsRemaining })
                : t("Match found.");
        }
        if (state === "accepted") {
            return secondsRemaining && secondsRemaining > 0
                ? tf("Accepted. Waiting for opponent: {seconds}s left.", { seconds: secondsRemaining })
                : t("Accepted. Waiting for opponent.");
        }
        if (state === "starting-ai") {
            return t("Preparing AI match");
        }
        if (state === "error") {
            return t("Connection error");
        }
        return t("Ready");
    }, [needsActivation, penalized, penaltySeconds, queueSize, secondsRemaining, state, t]);

    const handleStart = async () => {
        if (needsActivation || penalized || aiStartInFlightRef.current) {
            return;
        }
        setError("");
        // Ask here, not on page load: this is a real click, and it is the one moment where "let us tell
        // you when your match is ready" explains itself. Declining costs nothing — the tab title still
        // flashes.
        requestMatchReadyPermission();
        acceptedGameIdRef.current = "";
        acceptAttemptRef.current += 1;
        alertedGameIdRef.current = "";
        setOpponentPlayerId("");
        setState("searching");
        closeStream();
        openStream();
        try {
            await startGameSearch();
        } catch (err) {
            closeStream();
            setState("error");
            setError((err as Error)?.message ?? t("Unable to enter matchmaking"));
            // The server rejects re-queue during a no-accept cooldown (429); refresh /me so the render
            // switches from the raw error to the penalty countdown.
            void me().catch(() => undefined);
        }
    };

    const handlePlayAi = useCallback(async () => {
        if (needsActivation || aiStartInFlightRef.current) {
            return;
        }

        aiStartInFlightRef.current = true;
        setError("");
        acceptedGameIdRef.current = "";
        acceptAttemptRef.current += 1;
        setState("starting-ai");
        setOpponentPlayerId("");
        closeStream();
        try {
            const game = await createVsAiGame();
            const gameId = game.id;
            if (!gameId) {
                throw new Error("AI match response was incomplete");
            }
            // Remember the game is vs the bot so the pick phase — which never sees the opponent's
            // playerId — can label the opponent as the AI (version-only, tier-less default seat).
            markVsAiGame(gameId);
            navigate(`/game/${gameId}`);
        } catch (err) {
            try {
                const currentGame = await getCurrentGame();
                if (currentGame?.id && !currentGame.abandoned) {
                    if (currentGame.confirmed) {
                        navigate(`/game/${currentGame.id}`);
                    } else {
                        updatePendingGameId(currentGame.id);
                        setState("confirming");
                        openStream();
                    }
                    return;
                }
            } catch {
                // No recoverable current game; surface the original vs-AI error.
            }

            const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
            setState("error");
            setError(
                message === "Already in game"
                    ? t("Leave matchmaking before starting an AI match")
                    : message || t("Unable to start an AI match"),
            );
        } finally {
            aiStartInFlightRef.current = false;
        }
    }, [closeStream, getCurrentGame, navigate, needsActivation, openStream, updatePendingGameId]);

    // A /play?mode=vs-ai deep link starts the AI match on arrival (optionally at ?difficulty=<tier>).
    // Consume the params before starting so browser Back or a remount cannot unintentionally create
    // another match.
    useEffect(() => {
        if (!vsAiRequested || vsAiAutoStartedRef.current || needsActivation || state !== "idle") {
            return;
        }
        vsAiAutoStartedRef.current = true;
        const nextSearchParams = new URLSearchParams(searchParams);
        nextSearchParams.delete("mode");
        nextSearchParams.delete("difficulty");
        setSearchParams(nextSearchParams, { replace: true });
        void handlePlayAi();
    }, [handlePlayAi, needsActivation, searchParams, setSearchParams, state, vsAiRequested]);

    const handleResend = async () => {
        if (!accountEmail || resendState === "sending") {
            return;
        }
        setResendState("sending");
        try {
            await requestCode(accountEmail);
            setResendState("sent");
        } catch {
            setResendState("idle");
        }
    };

    const handleCancel = async () => {
        setError("");
        try {
            await stopGameSearch();
        } catch (err) {
            setError((err as Error)?.message ?? t("Unable to leave matchmaking"));
        } finally {
            acceptedGameIdRef.current = "";
            acceptAttemptRef.current += 1;
            closeStream();
            setState("idle");
            updatePendingGameId("");
            setOpponentPlayerId("");
            setQueueSize(null);
            setSecondsRemaining(null);
        }
    };

    const handleAccept = async () => {
        if (!pendingGameId) {
            return;
        }

        if (mockMatchPreview) {
            acceptedGameIdRef.current = pendingGameId;
            setState("accepted");
            return;
        }

        setError("");
        const gameId = pendingGameId;
        const attempt = acceptAttemptRef.current + 1;
        acceptAttemptRef.current = attempt;
        acceptedGameIdRef.current = gameId;
        setState("accepted");
        try {
            await confirmGame(gameId);
        } catch (err) {
            let currentGame: MatchmakingCurrentGame | null = null;
            let reconciliationSucceeded = false;
            try {
                currentGame = await getCurrentGame();
                reconciliationSucceeded = true;
            } catch {
                // Unknown is not rejection: keep the accepted handoff alive and let its SSE retry finish it.
            }

            if (
                !isCurrentAcceptAttempt({
                    acceptedGameId: acceptedGameIdRef.current,
                    attempt,
                    currentAttempt: acceptAttemptRef.current,
                    expectedGameId: gameId,
                    mounted: mountedRef.current,
                    pendingGameId: pendingGameIdRef.current,
                })
            ) {
                return;
            }

            const resolution = resolveConfirmFailure(
                gameId,
                currentGame,
                reconciliationSucceeded,
                isAmbiguousConfirmFailure(err),
            );
            if (resolution !== "rejected") {
                return;
            }

            acceptedGameIdRef.current = "";
            acceptAttemptRef.current += 1;
            setState("confirming");
            setError((err as Error)?.message ?? t("Unable to accept match"));
        }
    };

    const navigationLocked =
        state === "searching" || state === "confirming" || state === "accepted" || state === "starting-ai";
    const shortGameId =
        pendingGameId.length > 16 ? `${pendingGameId.slice(0, 8)}…${pendingGameId.slice(-5)}` : pendingGameId;
    const showStatusPresentation = state !== "idle" || needsActivation || penalized;
    const presentation = (() => {
        if (needsActivation) {
            return {
                accent: hocColors.gold,
                eyebrow: t("ACCOUNT ACTIVATION"),
                headline: t("Verify before entering the arena"),
                description: t("Activate your account to unlock ranked matchmaking and practice battles."),
            };
        }
        if (penalized) {
            return {
                accent: hocColors.danger,
                eyebrow: t("QUEUE COOLDOWN"),
                headline: tf("Search unlocks in {seconds}s", { seconds: penaltySeconds }),
                description: t("Ranked matches must be accepted in time. The queue will reopen automatically."),
            };
        }
        if (state === "searching") {
            return {
                accent: hocColors.orange,
                eyebrow: t("MATCHMAKING"),
                headline: t("Scouting for a worthy rival"),
                description: queueSize
                    ? tf(
                          queueSize === 1
                              ? "{count} player is currently in the queue."
                              : "{count} players are currently in the queue.",
                          {
                              count: queueSize,
                          },
                      )
                    : t("Stay ready while we search the live ranked queue."),
            };
        }
        if (state === "confirming") {
            return {
                accent: "#ffd166",
                eyebrow: t("OPPONENT FOUND"),
                headline: t("Your rival is ready"),
                description: t("Accept before the timer expires to lock in the match."),
            };
        }
        if (state === "accepted") {
            return {
                accent: "#55d878",
                eyebrow: t("MATCH ACCEPTED"),
                headline: t("You’re locked in"),
                description: t("Waiting for your opponent to accept. The arena will open automatically."),
            };
        }
        if (state === "starting-ai") {
            return {
                accent: hocColors.gold,
                eyebrow: t("PRACTICE ARENA"),
                headline: t("Summoning a training opponent"),
                description: t("Preparing a private match against the default AI player."),
            };
        }
        if (state === "error") {
            return {
                accent: hocColors.danger,
                eyebrow: t("CONNECTION ISSUE"),
                headline: t("The arena link was interrupted"),
                description: t("Try the ranked queue again, or sharpen your strategy against the AI."),
            };
        }
        return {
            accent: hocColors.orange,
            eyebrow: "",
            headline: "",
            description: "",
        };
    })();

    return (
        <Box
            sx={{
                position: "fixed",
                inset: 0,
                overflowY: "auto",
                bgcolor: "#050504",
                color: hocColors.parchment,
                backgroundImage: `url(${arenaBackgroundUrl})`,
                backgroundPosition: "center",
                backgroundSize: "cover",
                backgroundRepeat: "no-repeat",
                "@keyframes arenaPulse": {
                    "0%": { transform: "scale(0.7)", opacity: 0.58 },
                    "70%, 100%": { transform: "scale(1.35)", opacity: 0 },
                },
                "@keyframes matchFoundGlow": {
                    "0%, 100%": {
                        boxShadow: "0 28px 80px rgba(0,0,0,0.52), 0 0 0 1px rgba(255,209,102,0.18)",
                    },
                    "50%": {
                        boxShadow:
                            "0 28px 80px rgba(0,0,0,0.52), 0 0 0 1px rgba(255,209,102,0.72), 0 0 54px rgba(255,183,0,0.28)",
                    },
                },
                "@keyframes acceptAttention": {
                    "0%, 100%": { transform: "translateY(0)", boxShadow: "0 8px 26px rgba(85,216,120,0.24)" },
                    "50%": { transform: "translateY(-2px)", boxShadow: "0 12px 38px rgba(85,216,120,0.48)" },
                },
            }}
        >
            <Box
                aria-hidden="true"
                sx={{
                    position: "fixed",
                    inset: 0,
                    pointerEvents: "none",
                    background:
                        state === "confirming"
                            ? "radial-gradient(circle at 34% 58%, rgba(255,209,102,0.2), transparent 38%), radial-gradient(circle at 78% 35%, rgba(255,143,0,0.12), transparent 32%), linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.38))"
                            : ARENA_IDLE_WASH,
                    transition: "background 320ms ease",
                }}
            />

            <ArenaNavBar
                current="ranked"
                locked={navigationLocked}
                width={profileSummaryOpen ? "min(1480px, calc(100% - 32px))" : "min(1040px, calc(100% - 32px))"}
            />

            <Box
                role="main"
                sx={{
                    position: "relative",
                    zIndex: 1,
                    width: profileSummaryOpen ? "min(1480px, calc(100% - 32px))" : "min(1040px, calc(100% - 32px))",
                    mx: "auto",
                    py: { xs: 2, md: 3 },
                    display: "grid",
                    gridTemplateColumns: {
                        xs: "minmax(0, 1fr)",
                        lg: profileSummaryOpen ? "minmax(560px, 1fr) minmax(370px, 420px)" : "minmax(0, 1fr)",
                    },
                    gap: { xs: 2, md: 3 },
                    alignItems: "start",
                    transition: "width 220ms ease",
                }}
            >
                <Sheet
                    component="section"
                    aria-labelledby="ranked-heading"
                    variant="outlined"
                    sx={{
                        minWidth: 0,
                        minHeight: profileSummaryOpen ? { lg: 724 } : undefined,
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                        borderRadius: "10px",
                        ...hocPanelSx,
                        bgcolor: "rgba(12,8,5,0.91)",
                        borderColor:
                            state === "confirming"
                                ? "rgba(255,209,102,0.9)"
                                : state === "accepted"
                                  ? "rgba(85,216,120,0.62)"
                                  : "rgba(255,143,0,0.3)",
                        boxShadow:
                            state === "confirming"
                                ? "0 28px 80px rgba(0,0,0,0.52), 0 0 46px rgba(255,183,0,0.2)"
                                : state === "accepted"
                                  ? "0 28px 80px rgba(0,0,0,0.52), 0 0 40px rgba(85,216,120,0.13)"
                                  : "0 28px 80px rgba(0,0,0,0.52)",
                        animation: state === "confirming" ? "matchFoundGlow 1.65s ease-in-out infinite" : "none",
                        transition: "border-color 280ms ease, box-shadow 280ms ease, background-color 280ms ease",
                        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                        backdropFilter: "blur(16px)",
                    }}
                >
                    <Box
                        sx={{
                            position: "relative",
                            overflow: "hidden",
                            px: { xs: 2.25, sm: 4, md: 5 },
                            py: { xs: 2.5, md: 3 },
                            borderBottom: "1px solid rgba(239,228,204,0.09)",
                            background:
                                state === "confirming"
                                    ? "linear-gradient(112deg, rgba(255,209,102,0.2), rgba(255,143,0,0.07) 58%, transparent)"
                                    : state === "accepted"
                                      ? "linear-gradient(112deg, rgba(85,216,120,0.13), rgba(220,177,88,0.035) 58%, transparent)"
                                      : "linear-gradient(112deg, rgba(255,143,0,0.12), rgba(220,177,88,0.035) 58%, transparent)",
                            transition: "background 280ms ease",
                        }}
                    >
                        <Typography
                            level="body-xs"
                            sx={{
                                display: activeSeason || nextSeason || seasonSnapshot ? "block" : "none",
                                color: hocColors.gold,
                                fontWeight: 800,
                                fontSize: { xs: "0.68rem", sm: "0.75rem" },
                                lineHeight: 1.5,
                                letterSpacing: { xs: "0.09em", sm: "0.13em" },
                                mb: 1.1,
                            }}
                        >
                            {activeSeason ? (
                                <>
                                    {activeSeason.name} · {t("ENDS")}{" "}
                                    <time
                                        dateTime={new Date(activeSeason.endsAt).toISOString()}
                                        title={new Date(activeSeason.endsAt).toLocaleString(
                                            language === "ru" ? "ru-RU" : "en-US",
                                        )}
                                    >
                                        {seasonMilestoneLabel}
                                    </time>
                                </>
                            ) : nextSeason ? (
                                <>
                                    {t("PRESEASON")} · {nextSeason.name} {t("STARTS")}{" "}
                                    <time
                                        dateTime={new Date(nextSeason.startsAt).toISOString()}
                                        title={new Date(nextSeason.startsAt).toLocaleString(
                                            language === "ru" ? "ru-RU" : "en-US",
                                        )}
                                    >
                                        {seasonMilestoneLabel}
                                    </time>
                                </>
                            ) : seasonSnapshot ? (
                                `${t("PRESEASON")} · ${t("NO SCHEDULED END")}`
                            ) : null}
                        </Typography>
                        <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={{ xs: 1.5, sm: 1 }}
                            alignItems={{ xs: "flex-start", sm: "center" }}
                            justifyContent="space-between"
                        >
                            <Typography
                                id="ranked-heading"
                                level="h1"
                                sx={{
                                    maxWidth: 700,
                                    color: hocColors.parchment,
                                    fontSize: { xs: "2rem", sm: "2.45rem", md: "2.75rem" },
                                    lineHeight: 1.02,
                                    letterSpacing: "-0.035em",
                                }}
                            >
                                {t("Ranked Arena")}
                            </Typography>
                            <Stack direction="row" spacing={0.75} alignItems="center">
                                {onlineNow !== undefined && (
                                    <Tooltip
                                        title={tf("{online} online · {searching} searching · {playing} in battle", {
                                            online: onlineNow.online,
                                            searching: onlineNow.searching,
                                            playing: onlineNow.playing,
                                        })}
                                        size="sm"
                                        variant="soft"
                                    >
                                        <Stack
                                            component="span"
                                            direction="row"
                                            spacing={0.7}
                                            alignItems="center"
                                            aria-label={tf("{count} players online", { count: onlineNow.online })}
                                            sx={{
                                                minHeight: 38,
                                                px: 1.15,
                                                borderRadius: "10px",
                                                color: hocColors.parchment,
                                                bgcolor: "rgba(0,0,0,0.3)",
                                                border: "1px solid rgba(220,177,88,0.3)",
                                                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)",
                                            }}
                                        >
                                            <Box
                                                aria-hidden="true"
                                                sx={{
                                                    width: 7,
                                                    height: 7,
                                                    flexShrink: 0,
                                                    borderRadius: "50%",
                                                    bgcolor: hocColors.green,
                                                    boxShadow: `0 0 7px ${hocColors.green}`,
                                                }}
                                            />
                                            <GroupsRoundedIcon sx={{ color: hocColors.gold, fontSize: 19 }} />
                                            <Typography level="body-sm" sx={{ color: "inherit", fontWeight: 800 }}>
                                                {onlineNow.online}
                                            </Typography>
                                            <Typography
                                                level="body-xs"
                                                sx={{
                                                    display: { xs: "none", sm: "block" },
                                                    color: hocColors.muted,
                                                    fontSize: "0.65rem",
                                                    fontWeight: 700,
                                                    letterSpacing: "0.08em",
                                                    textTransform: "uppercase",
                                                }}
                                            >
                                                {t("Online")}
                                            </Typography>
                                        </Stack>
                                    </Tooltip>
                                )}
                                <Tooltip
                                    title={profileSummaryOpen ? t("Hide player stats") : t("Show player stats")}
                                    size="sm"
                                    variant="soft"
                                >
                                    <Button
                                        size="sm"
                                        variant="outlined"
                                        aria-label={
                                            profileSummaryOpen ? t("Hide player stats") : t("Show player stats")
                                        }
                                        aria-expanded={profileSummaryOpen}
                                        aria-controls="ranked-profile-summary"
                                        onClick={() => setProfileSummaryOpen((open) => !open)}
                                        startDecorator={<StatsPanelIcon sx={{ fontSize: 22 }} />}
                                        sx={{
                                            minHeight: 38,
                                            px: 1.15,
                                            borderRadius: "10px",
                                            color: hocColors.parchment,
                                            bgcolor: profileSummaryOpen ? "rgba(255,143,0,0.14)" : "rgba(0,0,0,0.3)",
                                            borderColor: "rgba(220,177,88,0.3)",
                                            fontSize: "0.72rem",
                                            fontWeight: 750,
                                            "&:hover": {
                                                color: hocColors.gold,
                                                bgcolor: "rgba(255,143,0,0.2)",
                                                borderColor: hocColors.orangeBorder,
                                            },
                                        }}
                                    >
                                        <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                                            {profileSummaryOpen ? t("Hide stats") : t("Show stats")}
                                        </Box>
                                    </Button>
                                </Tooltip>
                            </Stack>
                        </Stack>
                    </Box>

                    <Box
                        aria-live="polite"
                        sx={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            px: { xs: 2.25, sm: 3.5 },
                            py: { xs: 3, md: showStatusPresentation ? 4 : 3 },
                            textAlign: "center",
                            background:
                                state === "confirming"
                                    ? "radial-gradient(circle at 50% 43%, rgba(255,209,102,0.16), transparent 47%)"
                                    : state === "accepted"
                                      ? "radial-gradient(circle at 50% 43%, rgba(85,216,120,0.11), transparent 47%)"
                                      : "transparent",
                            transition: "background 280ms ease",
                        }}
                    >
                        <Box
                            sx={{
                                position: "relative",
                                width: 126,
                                height: 126,
                                display: showStatusPresentation ? "grid" : "none",
                                placeItems: "center",
                                mb: 2.25,
                            }}
                        >
                            {(state === "searching" || state === "starting-ai" || state === "confirming") && (
                                <>
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            inset: 3,
                                            borderRadius: "50%",
                                            border: `1px solid ${presentation.accent}`,
                                            animation:
                                                state === "confirming"
                                                    ? "arenaPulse 1.35s ease-out infinite"
                                                    : "arenaPulse 2.1s ease-out infinite",
                                            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                                        }}
                                    />
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            inset: 3,
                                            borderRadius: "50%",
                                            border: `1px solid ${presentation.accent}`,
                                            animation:
                                                state === "confirming"
                                                    ? "arenaPulse 1.35s 0.45s ease-out infinite"
                                                    : "arenaPulse 2.1s 0.7s ease-out infinite",
                                            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                                        }}
                                    />
                                </>
                            )}
                            <Box
                                title={queueElapsedLabel ? `Searching for ${queueElapsedLabel}` : undefined}
                                sx={{
                                    position: "relative",
                                    zIndex: 1,
                                    width: 98,
                                    height: 98,
                                    borderRadius: "50%",
                                    display: "grid",
                                    placeItems: "center",
                                    color: presentation.accent,
                                    bgcolor: "rgba(0,0,0,0.42)",
                                    border: `1px solid ${presentation.accent}99`,
                                    boxShadow: `0 0 0 8px ${presentation.accent}12, 0 0 38px ${presentation.accent}24`,
                                    "& svg": { fontSize: 40 },
                                }}
                            >
                                {state === "confirming" ? (
                                    <Stack spacing={0} alignItems="center">
                                        <Typography level="h2" sx={{ color: presentation.accent, lineHeight: 0.95 }}>
                                            {secondsRemaining && secondsRemaining > 0 ? secondsRemaining : "!"}
                                        </Typography>
                                        <Typography
                                            level="body-xs"
                                            sx={{ color: hocColors.muted, fontSize: "0.62rem", letterSpacing: "0.1em" }}
                                        >
                                            {t("SECONDS")}
                                        </Typography>
                                    </Stack>
                                ) : state === "accepted" ? (
                                    <CheckCircleRoundedIcon />
                                ) : state === "starting-ai" ? (
                                    <PracticeAiIcon />
                                ) : queueElapsedLabel ? (
                                    // Ticking text is hidden from the aria-live region above so screen
                                    // readers get the status line instead of a reading every second.
                                    <Stack spacing={0} alignItems="center" aria-hidden="true">
                                        <Typography
                                            level="h3"
                                            sx={{
                                                color: presentation.accent,
                                                lineHeight: 0.95,
                                                fontVariantNumeric: "tabular-nums",
                                            }}
                                        >
                                            {queueElapsedLabel}
                                        </Typography>
                                        <Typography
                                            level="body-xs"
                                            sx={{ color: hocColors.muted, fontSize: "0.62rem", letterSpacing: "0.1em" }}
                                        >
                                            {t("IN QUEUE")}
                                        </Typography>
                                    </Stack>
                                ) : penalized ? (
                                    <TimerRoundedIcon />
                                ) : needsActivation || state === "error" ? (
                                    <ShieldRoundedIcon />
                                ) : (
                                    <RankedSearchIcon />
                                )}
                            </Box>
                        </Box>

                        <Typography
                            level="body-xs"
                            sx={{
                                display: showStatusPresentation ? "block" : "none",
                                color: presentation.accent,
                                fontWeight: 800,
                                letterSpacing: "0.18em",
                            }}
                        >
                            {presentation.eyebrow}
                        </Typography>
                        <Typography
                            level="h2"
                            sx={{
                                display: showStatusPresentation ? "block" : "none",
                                color: hocColors.parchment,
                                mt: 0.75,
                                fontSize: { xs: "1.55rem", sm: "2rem" },
                            }}
                        >
                            {presentation.headline}
                        </Typography>
                        <Typography
                            level="body-sm"
                            sx={{
                                display: showStatusPresentation ? "block" : "none",
                                color: hocColors.muted,
                                maxWidth: 540,
                                mt: 0.8,
                            }}
                        >
                            {presentation.description}
                        </Typography>
                        <Typography
                            level="body-xs"
                            sx={{
                                display: showStatusPresentation ? "block" : "none",
                                color: hocColors.muted,
                                mt: 1.25,
                                px: 1.2,
                                py: 0.55,
                                borderRadius: "999px",
                                bgcolor: "rgba(255,255,255,0.035)",
                                border: "1px solid rgba(255,255,255,0.07)",
                            }}
                        >
                            {statusText}
                        </Typography>

                        {(state === "confirming" || state === "accepted") && pendingGameId ? (
                            <MatchFoundOpponentPreview
                                accepted={state === "accepted"}
                                currency={currency}
                                language={language}
                                loading={opponentStatsLoading}
                                stats={opponentStats}
                            />
                        ) : null}

                        <Stack
                            spacing={{ xs: 1.25, md: profileSummaryOpen && !showStatusPresentation ? 0 : 1.25 }}
                            sx={{
                                width: "100%",
                                maxWidth: 860,
                                mt: showStatusPresentation ? 2.75 : 0,
                                flex: profileSummaryOpen && !showStatusPresentation ? 1 : undefined,
                                justifyContent:
                                    profileSummaryOpen && !showStatusPresentation ? "space-evenly" : "flex-start",
                            }}
                        >
                            {needsActivation && (
                                <>
                                    <Alert variant="soft" color="warning" sx={{ textAlign: "left" }}>
                                        {tf(
                                            "Verify your email to play online. We sent a verification code to {email}.",
                                            {
                                                email: accountEmail || t("your email address"),
                                            },
                                        )}
                                    </Alert>
                                    <Button
                                        fullWidth
                                        variant="solid"
                                        onClick={handleResend}
                                        disabled={resendState === "sending" || !accountEmail}
                                        sx={{ ...hocPrimaryButtonSx, minHeight: 50 }}
                                    >
                                        {resendState === "sending"
                                            ? t("Sending…")
                                            : resendState === "sent"
                                              ? t("Email sent — check your inbox")
                                              : t("Resend verification email")}
                                    </Button>
                                    <Typography level="body-xs" textColor={hocColors.muted}>
                                        {t(
                                            "Enter the code from the email to activate your account, then reload this page.",
                                        )}
                                    </Typography>
                                </>
                            )}

                            {!needsActivation && (state === "idle" || state === "error" || state === "starting-ai") && (
                                <Box
                                    sx={{
                                        alignSelf: "stretch",
                                        mt: showStatusPresentation || !profileSummaryOpen ? 2.5 : 0,
                                        // The doctrine tiles are already outlined, so wrapping them in
                                        // a second outlined, shadowed, gradient-filled card put three
                                        // borders between the page and a radio button. The heading and
                                        // the spacing group them; the frame was redundant.
                                        px: 0,
                                        py: { xs: 0.25, sm: 0.5 },
                                    }}
                                >
                                    <Typography
                                        level="title-sm"
                                        sx={{
                                            mb: 1.25,
                                            color: hocColors.sidebarTitle,
                                            fontFamily: hocDisplayFontFamily,
                                            fontWeight: 400,
                                            letterSpacing: "0.1em",
                                            textAlign: "left",
                                            textTransform: "uppercase",
                                        }}
                                    >
                                        {t("Choose your doctrine")}
                                    </Typography>
                                    <Box
                                        role="radiogroup"
                                        aria-label={t("Choose your doctrine")}
                                        sx={{
                                            display: "grid",
                                            gridTemplateColumns: {
                                                xs: "minmax(0, 1fr)",
                                                sm: "repeat(3, minmax(0, 1fr))",
                                            },
                                            gap: { xs: 1, sm: 1.25 },
                                        }}
                                    >
                                        {[...Doctrine.DOCTRINE_LIST]
                                            .sort((a, b) => a.upgradePoints - b.upgradePoints)
                                            .map((p) => {
                                                const isSelected = preGameDoctrine === p.id;
                                                const copy = getDoctrineCopy(p.id);
                                                // The doctrine is locked in before the draft and quietly sets the
                                                // augment budget spent much later at placement, so the full
                                                // what/costs/why lives on hover rather than only in the card.
                                                const hover = copy ? (
                                                    <Box sx={{ maxWidth: 320, p: 0.5, display: "grid", gap: 0.75 }}>
                                                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                                            <DoctrineIcon doctrineId={p.id} size={38} />
                                                            <Typography level="title-sm" sx={{ color: "common.white" }}>
                                                                {t(p.name)}
                                                            </Typography>
                                                        </Box>
                                                        <Typography level="body-xs" sx={{ color: "common.white" }}>
                                                            {t(copy.detail)}
                                                        </Typography>
                                                        <Typography level="body-xs" sx={{ color: hocColors.gold }}>
                                                            {t(copy.budget)}
                                                        </Typography>
                                                        <Typography
                                                            level="body-xs"
                                                            sx={{ color: "common.white", opacity: 0.85 }}
                                                        >
                                                            {t(copy.why)}
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    t(p.description)
                                                );
                                                const selectDoctrine = (): void => {
                                                    setPreGameDoctrineState(p.id);
                                                    setPreGameDoctrine(p.id);
                                                };
                                                return (
                                                    <Tooltip
                                                        key={p.id}
                                                        title={hover}
                                                        variant="soft"
                                                        placement="top"
                                                        arrow
                                                        enterDelay={150}
                                                        enterTouchDelay={0}
                                                        sx={{ maxWidth: 340, bgcolor: "rgba(12,14,18,0.97)" }}
                                                    >
                                                        <Sheet
                                                            role="radio"
                                                            aria-checked={isSelected}
                                                            tabIndex={0}
                                                            variant="outlined"
                                                            onClick={selectDoctrine}
                                                            onKeyDown={(event) => {
                                                                if (event.key === "Enter" || event.key === " ") {
                                                                    event.preventDefault();
                                                                    selectDoctrine();
                                                                }
                                                            }}
                                                            sx={{
                                                                minWidth: 0,
                                                                cursor: "pointer",
                                                                position: "relative",
                                                                borderColor: isSelected
                                                                    ? hocColors.gold
                                                                    : "rgba(112,75,42,0.68)",
                                                                background: isSelected
                                                                    ? "linear-gradient(180deg, rgba(122,68,5,0.96), rgba(47,25,4,0.98))"
                                                                    : "linear-gradient(180deg, rgba(15,15,14,0.98), rgba(3,3,3,0.98))",
                                                                boxShadow: isSelected
                                                                    ? "0 0 0 1px rgba(220,177,88,0.34), 0 8px 22px rgba(0,0,0,0.56), inset 0 1px 0 rgba(255,227,166,0.12)"
                                                                    : "0 7px 16px rgba(0,0,0,0.45), inset 0 0 14px rgba(0,0,0,0.5)",
                                                                transition:
                                                                    "border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease",
                                                                borderRadius: "3px",
                                                                p: { xs: 1.25, sm: 1.5 },
                                                                minHeight: { xs: 132, sm: 160 },
                                                                display: "flex",
                                                                flexDirection: "column",
                                                                alignItems: "center",
                                                                justifyContent: "center",
                                                                gap: 0.55,
                                                                textAlign: "center",
                                                                "&:hover": {
                                                                    borderColor: hocColors.gold,
                                                                    transform: "translateY(-2px)",
                                                                    boxShadow:
                                                                        "0 10px 24px rgba(0,0,0,0.58), 0 0 16px rgba(220,177,88,0.12)",
                                                                },
                                                                "&:focus-visible": {
                                                                    outline: `2px solid ${hocColors.orange}`,
                                                                    outlineOffset: "2px",
                                                                },
                                                            }}
                                                        >
                                                            {isSelected && (
                                                                <CheckCircleRoundedIcon
                                                                    sx={{
                                                                        position: "absolute",
                                                                        top: 8,
                                                                        right: 8,
                                                                        fontSize: 19,
                                                                        color: hocColors.gold,
                                                                        filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.8))",
                                                                    }}
                                                                />
                                                            )}
                                                            <Box
                                                                sx={{
                                                                    width: 62,
                                                                    height: 62,
                                                                    borderRadius: "50%",
                                                                    overflow: "hidden",
                                                                    boxShadow: isSelected
                                                                        ? "0 0 0 2px rgba(220,177,88,.68), 0 4px 14px rgba(0,0,0,.62)"
                                                                        : "0 0 0 1px rgba(204,161,91,.5), 0 3px 10px rgba(0,0,0,.52)",
                                                                }}
                                                            >
                                                                <DoctrineIcon doctrineId={p.id} />
                                                            </Box>
                                                            <Typography
                                                                level="title-md"
                                                                sx={{
                                                                    color: hocColors.parchment,
                                                                    fontFamily: hocDisplayFontFamily,
                                                                    fontWeight: 400,
                                                                    letterSpacing: "0.035em",
                                                                }}
                                                            >
                                                                {t(p.name)}
                                                            </Typography>
                                                            <Typography
                                                                level="body-xs"
                                                                sx={{ color: hocColors.gold, fontWeight: 700 }}
                                                            >
                                                                {tf("{count} upgrade pts", {
                                                                    count: p.upgradePoints,
                                                                })}
                                                            </Typography>
                                                            {copy && (
                                                                <Typography
                                                                    level="body-xs"
                                                                    sx={{
                                                                        color: hocColors.mutedStrong,
                                                                        lineHeight: 1.3,
                                                                    }}
                                                                >
                                                                    {t(copy.tagline)}
                                                                </Typography>
                                                            )}
                                                        </Sheet>
                                                    </Tooltip>
                                                );
                                            })}
                                    </Box>
                                </Box>
                            )}

                            {!needsActivation && (state === "idle" || state === "error" || state === "starting-ai") && (
                                <Sheet
                                    variant="outlined"
                                    sx={{
                                        alignSelf: "stretch",
                                        overflow: "hidden",
                                        borderRadius: "3px",
                                        borderColor: "rgba(112,75,42,0.62)",
                                        background: "linear-gradient(180deg, rgba(21,21,19,0.94), rgba(6,6,6,0.96))",
                                        boxShadow: "0 7px 18px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(150,130,98,0.1)",
                                    }}
                                >
                                    <RankedBanPicker />
                                    {/* No stake against a bot: a wager only forms when BOTH seats hold an intent and
                                        the AI seat never sets one, so gold armed on the way into a vs-AI match can
                                        never ride it — it just sits escrowed until a human turns up. Hence "idle"
                                        and "error" but not "starting-ai". Calibration games never stake either: the
                                        server refuses the intent until the player is placed. */}
                                    {(state === "idle" || state === "error") && canStake ? (
                                        <WagerStakeBox currency={currency} />
                                    ) : null}
                                </Sheet>
                            )}
                            {!needsActivation && (state === "idle" || state === "error" || state === "starting-ai") ? (
                                <Box
                                    sx={{
                                        display: "grid",
                                        // Two thirds to the ranked queue, one third to practice. Equal halves
                                        // read as equal offers; this screen exists for the ranked match, and
                                        // the sizes should say which button is the point of it.
                                        gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" },
                                        gap: 1.15,
                                    }}
                                >
                                    <Button
                                        fullWidth
                                        variant="solid"
                                        disabled={state === "starting-ai" || penalized}
                                        onClick={handleStart}
                                        startDecorator={<RankedSearchIcon sx={{ fontSize: 24 }} />}
                                        endDecorator={!penalized ? <ArrowForwardRoundedIcon /> : undefined}
                                        sx={{
                                            ...hocActionPrimaryButtonSx,
                                            minHeight: 58,
                                            fontFamily: hocDisplayFontFamily,
                                            fontSize: "0.92rem",
                                        }}
                                    >
                                        {penalized
                                            ? tf("Search again in {seconds}s", { seconds: penaltySeconds })
                                            : t("Find ranked opponent")}
                                    </Button>
                                    <PracticeVsAiButton loading={state === "starting-ai"} onClick={handlePlayAi} />
                                </Box>
                            ) : null}

                            {/* Open lobbies live right here rather than behind a separate browse screen: a
                                player who does not want the ranked queue can see a human is already
                                waiting without navigating away from the arena. */}
                            {!needsActivation && (state === "idle" || state === "error" || state === "starting-ai") ? (
                                <Box sx={{ pt: 0.5 }}>
                                    {/* Its own box, and only when somebody is actually waiting: an empty
                                        "no open lobbies" card is column space spent on absence. The browse
                                        button above still reaches the full list and the create control. */}
                                    <PublicLobbiesPanel dense boxed hideWhenEmpty hideCreate />
                                </Box>
                            ) : null}

                            {state === "searching" ? (
                                <Button
                                    fullWidth
                                    variant="soft"
                                    onClick={handleCancel}
                                    sx={{ ...hocSoftButtonSx, minHeight: 52 }}
                                >
                                    {t("Leave ranked queue")}
                                </Button>
                            ) : null}

                            {state === "confirming" || (state === "accepted" && pendingGameId) ? (
                                <Button
                                    fullWidth
                                    variant="solid"
                                    disabled={state === "accepted"}
                                    onClick={handleAccept}
                                    startDecorator={state === "accepted" ? <CheckCircleRoundedIcon /> : undefined}
                                    endDecorator={state === "confirming" ? <ArrowForwardRoundedIcon /> : undefined}
                                    sx={{
                                        ...(state === "confirming"
                                            ? {
                                                  bgcolor: "#55d878",
                                                  color: "#07130a",
                                                  border: "1px solid #b8ffc8",
                                                  fontWeight: 900,
                                                  boxShadow: "0 8px 26px rgba(85,216,120,0.3)",
                                                  animation: "acceptAttention 1.4s ease-in-out infinite",
                                                  "&:hover": {
                                                      bgcolor: "#8aea9f",
                                                      color: "#07130a",
                                                      boxShadow: "0 12px 40px rgba(85,216,120,0.5)",
                                                  },
                                                  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                                              }
                                            : hocPrimaryButtonSx),
                                        minHeight: 64,
                                        fontSize: "1.06rem",
                                        "&.Mui-disabled": {
                                            bgcolor: "rgba(85,216,120,0.16)",
                                            color: "rgba(210,255,220,0.68)",
                                            border: "1px solid rgba(85,216,120,0.35)",
                                        },
                                    }}
                                >
                                    {state === "accepted" ? t("Match accepted") : t("Accept ranked match")}
                                </Button>
                            ) : null}

                            {penalized && (
                                <Alert variant="soft" color="warning" sx={{ textAlign: "left" }}>
                                    {tf("You didn't accept the last match. You can search again in {seconds}s.", {
                                        seconds: penaltySeconds,
                                    })}
                                </Alert>
                            )}

                            {error && !penalized && (
                                <Alert variant="soft" color="danger" sx={{ textAlign: "left" }}>
                                    {error}
                                </Alert>
                            )}

                            {pendingGameId && (
                                <Typography
                                    level="body-xs"
                                    title={pendingGameId}
                                    sx={{ color: "rgba(239,228,204,0.4)", letterSpacing: "0.08em" }}
                                >
                                    {t("MATCH REF")} · {shortGameId}
                                </Typography>
                            )}
                        </Stack>
                    </Box>
                </Sheet>

                {profileSummaryOpen && (
                    <Box id="ranked-profile-summary" sx={{ minWidth: 0 }}>
                        <PlayerPortalSidebar navigationDisabled={navigationLocked} />
                    </Box>
                )}

                {/* The room belongs to the arena, not to the queue card — nesting it inside the card made
                    a conversation look like one more step of matchmaking, and it inherited the card's
                    narrow column. Spanning every grid column keeps it below both the card and the stats
                    sidebar whichever of them is open. Mounted through EVERY queue state on purpose:
                    waiting in the search queue is prime talking time, and a room that vanishes when you
                    press Find reads as a bug (it once did, via a state gate that hid it mid-search). */}
                {!needsActivation ? (
                    <Box sx={{ gridColumn: "1 / -1", minWidth: 0 }}>
                        <ArenaChatPanel selfUsername={user?.username} />
                    </Box>
                ) : null}
            </Box>
        </Box>
    );
};
