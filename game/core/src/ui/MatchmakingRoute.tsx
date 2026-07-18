import { CustomEventSource } from "@heroesofcrypto/common";
import PersonSearchRoundedIcon from "@mui/icons-material/PersonSearchRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import { Alert, Box, Button, CircularProgress, Sheet, Stack, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { buildApiUrl, endpoints, HOST_MATCHMAKING_API } from "../api/axios";
import { createVsAiGame } from "../api/vs_ai_client";
import {
    DEFAULT_VS_AI_DIFFICULTY,
    markVsAiGame,
    parseVsAiDifficulty,
    VS_AI_DIFFICULTIES,
    VS_AI_DIFFICULTY_VERSIONS,
    type VsAiDifficulty,
} from "../utils/aiOpponent";
import { useAuthContext } from "./auth/context/auth_context";
import { hocColors, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "./hocTheme";
import { PlayerPortalSidebar } from "./PlayerPortal/PlayerPortalSidebar";

type MatchmakingEvent = {
    ps?: string;
    po?: number;
    r?: number;
    c?: number;
};

type MatchmakingState = "idle" | "searching" | "confirming" | "accepted" | "starting-ai" | "error";

const STORAGE_KEY = "accessToken";

const matchEventUrl = () => buildApiUrl(HOST_MATCHMAKING_API, endpoints.mm.events);

export const MatchmakingRoute: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { startGameSearch, stopGameSearch, confirmGame, getCurrentGame, user, requestCode, me } = useAuthContext();

    const streamRef = useRef<CustomEventSource<MatchmakingEvent> | null>(null);
    const acceptedGameIdRef = useRef("");
    const aiStartInFlightRef = useRef(false);
    const vsAiAutoStartedRef = useRef(false);
    const [state, setState] = useState<MatchmakingState>("idle");
    const [pendingGameId, setPendingGameId] = useState("");
    const [queueSize, setQueueSize] = useState<number | null>(null);
    const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

    // No-accept penalty: the server sets match_making_cooldown_till (ms epoch) when a player lets a found
    // match expire without accepting, and rejects re-queue until it passes. Surface it as a live countdown
    // instead of a bare "connection aborted" so the player knows why they can't search and for how long.
    const [nowMs, setNowMs] = useState(() => Date.now());
    const cooldownTill = Number(user?.match_making_cooldown_till ?? 0) || 0;
    const penaltySeconds = cooldownTill > nowMs ? Math.ceil((cooldownTill - nowMs) / 1000) : 0;
    const penalized = penaltySeconds > 0;

    // A logged-in but email-unverified account (is_active === false) cannot enter matchmaking:
    // the server rejects POST /queue with "Activate your account to join the matchmaking queue".
    // Gate the whole ranked flow on activation so the user gets a clear "verify your email" path
    // instead of a doomed Find Opponent click that surfaces as a meaningless "Connection aborted".
    const needsActivation = user?.is_active === false;
    const accountEmail = user?.email ?? "";
    const vsAiRequested = searchParams.get("mode") === "vs-ai";
    // AI difficulty tier for "Play vs AI" (default Normal). A ?difficulty= deep-link param seeds the
    // selector so /play?mode=vs-ai&difficulty=brutal starts the requested tier.
    const [aiDifficulty, setAiDifficulty] = useState<VsAiDifficulty>(
        () => parseVsAiDifficulty(searchParams.get("difficulty")) ?? DEFAULT_VS_AI_DIFFICULTY,
    );

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
                setState("searching");
                return;
            }

            setPendingGameId(event.ps);

            if (event.r !== undefined && event.r < 0) {
                acceptedGameIdRef.current = "";
                setState("idle");
                setPendingGameId("");
                setSecondsRemaining(null);
                // The found match window closed. If WE let it expire the server just set a no-accept
                // cooldown — refresh /me so the penalty countdown renders (a no-op if we weren't at fault).
                void me().catch(() => undefined);
                return;
            }

            if (event.c === 1) {
                setState("accepted");
                closeStream();
                navigate(`/game/${event.ps}`);
                return;
            }

            setState(acceptedGameIdRef.current === event.ps ? "accepted" : "confirming");
        };

        source.onerror = (err: Error) => {
            setError(err.message);
            setState((current) => (current === "accepted" ? current : "error"));
            // A dropped stream right after a found match is usually the accept window expiring. Pull the
            // fresh /me so a no-accept penalty renders as a countdown instead of just "connection aborted".
            void me().catch(() => undefined);
        };

        streamRef.current = source;
    }, [closeStream, navigate, me]);

    useEffect(() => closeStream, [closeStream]);

    // Refresh /me on arrival so a penalty applied in a previous session/route shows immediately.
    useEffect(() => {
        void me().catch(() => undefined);
    }, [me]);

    // Tick the countdown while a penalty is active, then stop once it elapses.
    useEffect(() => {
        if (cooldownTill <= Date.now()) {
            return undefined;
        }
        setNowMs(Date.now());
        const id = window.setInterval(() => {
            const t = Date.now();
            setNowMs(t);
            if (t >= cooldownTill) {
                window.clearInterval(id);
            }
        }, 500);
        return () => window.clearInterval(id);
    }, [cooldownTill]);

    useEffect(() => {
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

                setPendingGameId(game.id);
                setState("confirming");
                openStream();
            })
            .catch(() => {
                // No current game is a normal state on this route.
            });

        return () => {
            cancelled = true;
        };
    }, [getCurrentGame, navigate, openStream]);

    const statusText = useMemo(() => {
        if (needsActivation) {
            return "Email verification required";
        }
        if (penalized) {
            return `Match not accepted — search again in ${penaltySeconds}s`;
        }
        if (state === "searching") {
            return queueSize ? `Looking for opponent (${queueSize} in queue)` : "Looking for opponent";
        }
        if (state === "confirming") {
            return secondsRemaining && secondsRemaining > 0
                ? `Match found. Accept within ${secondsRemaining}s.`
                : "Match found.";
        }
        if (state === "accepted") {
            return secondsRemaining && secondsRemaining > 0
                ? `Accepted. Waiting for opponent: ${secondsRemaining}s left.`
                : "Accepted. Waiting for opponent.";
        }
        if (state === "starting-ai") {
            return "Preparing AI match";
        }
        if (state === "error") {
            return "Connection error";
        }
        return "Ready";
    }, [needsActivation, penalized, penaltySeconds, queueSize, secondsRemaining, state]);

    const handleStart = async () => {
        if (needsActivation || penalized || aiStartInFlightRef.current) {
            return;
        }
        setError("");
        acceptedGameIdRef.current = "";
        setState("searching");
        closeStream();
        openStream();
        try {
            await startGameSearch();
        } catch (err) {
            closeStream();
            setState("error");
            setError((err as Error)?.message ?? "Unable to enter matchmaking");
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
        setState("starting-ai");
        closeStream();
        try {
            const game = await createVsAiGame(aiDifficulty);
            const gameId = game.id;
            if (!gameId) {
                throw new Error("AI match response was incomplete");
            }
            // Remember the game is vs the bot (and at which tier) so the pick phase — which never sees
            // the opponent's playerId — can label the opponent as the AI at the chosen difficulty.
            markVsAiGame(gameId, aiDifficulty);
            navigate(`/game/${gameId}`);
        } catch (err) {
            try {
                const currentGame = await getCurrentGame();
                if (currentGame?.id && !currentGame.abandoned) {
                    if (currentGame.confirmed) {
                        navigate(`/game/${currentGame.id}`);
                    } else {
                        setPendingGameId(currentGame.id);
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
                    ? "Leave matchmaking before starting an AI match"
                    : message || "Unable to start an AI match",
            );
        } finally {
            aiStartInFlightRef.current = false;
        }
    }, [aiDifficulty, closeStream, getCurrentGame, navigate, needsActivation, openStream]);

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
            setError((err as Error)?.message ?? "Unable to leave matchmaking");
        } finally {
            acceptedGameIdRef.current = "";
            closeStream();
            setState("idle");
            setPendingGameId("");
            setQueueSize(null);
            setSecondsRemaining(null);
        }
    };

    const handleAccept = async () => {
        if (!pendingGameId) {
            return;
        }

        setError("");
        acceptedGameIdRef.current = pendingGameId;
        setState("accepted");
        try {
            await confirmGame(pendingGameId);
        } catch (err) {
            acceptedGameIdRef.current = "";
            setState("confirming");
            setError((err as Error)?.message ?? "Unable to accept match");
        }
    };

    return (
        <>
            <Box
                sx={{
                    position: "fixed",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: hocColors.black,
                    px: 2,
                }}
            >
                <Sheet
                    variant="outlined"
                    sx={{
                        width: 420,
                        maxWidth: "100%",
                        boxSizing: "border-box",
                        p: { xs: 2, sm: 3 },
                        borderRadius: "md",
                        ...hocPanelSx,
                    }}
                >
                    <Stack spacing={2.25}>
                        <Box>
                            <Typography level="h3" textColor={hocColors.parchment}>
                                Play
                            </Typography>
                            <Typography level="body-sm" textColor={hocColors.muted}>
                                {statusText}
                            </Typography>
                        </Box>

                        {needsActivation && (
                            <Stack spacing={1.5}>
                                <Alert variant="soft" color="warning">
                                    Verify your email to play online. We sent a verification code to{" "}
                                    {accountEmail || "your email address"}.
                                </Alert>
                                <Button
                                    fullWidth
                                    variant="solid"
                                    onClick={handleResend}
                                    disabled={resendState === "sending" || !accountEmail}
                                    sx={hocPrimaryButtonSx}
                                >
                                    {resendState === "sending"
                                        ? "Sending…"
                                        : resendState === "sent"
                                          ? "Email sent — check your inbox"
                                          : "Resend verification email"}
                                </Button>
                                <Typography level="body-xs" textColor={hocColors.muted}>
                                    Enter the code from the email to activate your account, then reload this page to
                                    play online.
                                </Typography>
                            </Stack>
                        )}

                        {(state === "searching" || state === "accepted" || state === "starting-ai") && (
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <CircularProgress size="sm" />
                                <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                                    {state === "accepted"
                                        ? "Waiting for the other player"
                                        : state === "starting-ai"
                                          ? "Creating AI match"
                                          : "Queue stream connected"}
                                </Typography>
                            </Stack>
                        )}

                        {pendingGameId && (
                            <Typography level="body-xs" textColor="rgba(239, 228, 204, 0.46)">
                                Game {pendingGameId}
                            </Typography>
                        )}

                        {!needsActivation && (state === "idle" || state === "error" || state === "starting-ai") && (
                            <Stack spacing={0.75}>
                                <Typography level="body-xs" textColor={hocColors.muted}>
                                    AI difficulty (AI {VS_AI_DIFFICULTY_VERSIONS[aiDifficulty]}
                                    {aiDifficulty === "brutal" ? " + search" : ""})
                                </Typography>
                                <Stack direction="row" spacing={0} role="radiogroup" aria-label="AI difficulty">
                                    {VS_AI_DIFFICULTIES.map((difficulty, index) => {
                                        const selected = difficulty === aiDifficulty;
                                        return (
                                            <Button
                                                key={difficulty}
                                                size="sm"
                                                variant={selected ? "solid" : "soft"}
                                                role="radio"
                                                aria-checked={selected}
                                                disabled={state === "starting-ai"}
                                                onClick={() => setAiDifficulty(difficulty)}
                                                sx={{
                                                    ...(selected ? hocPrimaryButtonSx : hocSoftButtonSx),
                                                    flex: 1,
                                                    textTransform: "capitalize",
                                                    borderRadius: 0,
                                                    ...(index === 0 && {
                                                        borderTopLeftRadius: 6,
                                                        borderBottomLeftRadius: 6,
                                                    }),
                                                    ...(index === VS_AI_DIFFICULTIES.length - 1 && {
                                                        borderTopRightRadius: 6,
                                                        borderBottomRightRadius: 6,
                                                    }),
                                                }}
                                            >
                                                {difficulty}
                                            </Button>
                                        );
                                    })}
                                </Stack>
                            </Stack>
                        )}

                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                            {!needsActivation && (state === "idle" || state === "error" || state === "starting-ai") ? (
                                <>
                                    <Button
                                        fullWidth
                                        variant="solid"
                                        disabled={state === "starting-ai" || penalized}
                                        onClick={handleStart}
                                        startDecorator={<PersonSearchRoundedIcon />}
                                        sx={hocPrimaryButtonSx}
                                    >
                                        {penalized ? `Search again in ${penaltySeconds}s` : "Find Opponent"}
                                    </Button>
                                    <Button
                                        fullWidth
                                        variant="soft"
                                        loading={state === "starting-ai"}
                                        disabled={state === "starting-ai"}
                                        onClick={handlePlayAi}
                                        startDecorator={<SmartToyRoundedIcon />}
                                        sx={hocSoftButtonSx}
                                    >
                                        Play vs AI
                                    </Button>
                                </>
                            ) : null}

                            {state === "searching" ? (
                                <Button fullWidth variant="soft" onClick={handleCancel} sx={hocSoftButtonSx}>
                                    Leave Queue
                                </Button>
                            ) : null}

                            {state === "confirming" || (state === "accepted" && pendingGameId) ? (
                                <Button
                                    fullWidth
                                    variant="solid"
                                    disabled={state === "accepted"}
                                    onClick={handleAccept}
                                    sx={hocPrimaryButtonSx}
                                >
                                    Accept Match
                                </Button>
                            ) : null}
                        </Stack>

                        {penalized && (
                            <Alert variant="soft" color="warning">
                                You didn&apos;t accept the last match. You can search again in {penaltySeconds}s.
                            </Alert>
                        )}

                        {error && !penalized && (
                            <Alert variant="soft" color="danger">
                                {error}
                            </Alert>
                        )}
                    </Stack>
                </Sheet>
            </Box>
            <PlayerPortalSidebar />
        </>
    );
};
