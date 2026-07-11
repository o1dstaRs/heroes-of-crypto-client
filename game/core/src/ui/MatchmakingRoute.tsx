import { CustomEventSource } from "@heroesofcrypto/common";
import PersonSearchRoundedIcon from "@mui/icons-material/PersonSearchRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import { Alert, Box, Button, CircularProgress, Sheet, Stack, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { buildApiUrl, endpoints, HOST_MATCHMAKING_API } from "../api/axios";
import { createVsAiGame } from "../api/vs_ai_client";
import { markVsAiGame } from "../utils/aiOpponent";
import { useAuthContext } from "./auth/context/auth_context";
import { hocColors, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "./hocTheme";
import { PlayerPortalSidebar } from "./PlayerPortal/PlayerPortalSidebar";
import { WalletLinker } from "./WalletLinker";

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
    const { startGameSearch, stopGameSearch, confirmGame, getCurrentGame, user, requestCode } = useAuthContext();

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

    // A logged-in but email-unverified account (is_active === false) cannot enter matchmaking:
    // the server rejects POST /queue with "Activate your account to join the matchmaking queue".
    // Gate the whole ranked flow on activation so the user gets a clear "verify your email" path
    // instead of a doomed Find Opponent click that surfaces as a meaningless "Connection aborted".
    const needsActivation = user?.is_active === false;
    const accountEmail = user?.email ?? "";
    const vsAiRequested = searchParams.get("mode") === "vs-ai";

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
        };

        streamRef.current = source;
    }, [closeStream, navigate]);

    useEffect(() => closeStream, [closeStream]);

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
    }, [needsActivation, queueSize, secondsRemaining, state]);

    const handleStart = async () => {
        if (needsActivation || aiStartInFlightRef.current) {
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
            const game = await createVsAiGame();
            const gameId = game.id;
            if (!gameId) {
                throw new Error("AI match response was incomplete");
            }
            // Remember the game is vs the bot so the pick phase (which never sees the opponent's
            // playerId) can label the opponent as the AI.
            markVsAiGame(gameId);
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
    }, [closeStream, getCurrentGame, navigate, needsActivation, openStream]);

    // A /play?mode=vs-ai deep link starts the AI match on arrival. Consume the mode before starting
    // so browser Back or a remount cannot unintentionally create another match.
    useEffect(() => {
        if (!vsAiRequested || vsAiAutoStartedRef.current || needsActivation || state !== "idle") {
            return;
        }
        vsAiAutoStartedRef.current = true;
        const nextSearchParams = new URLSearchParams(searchParams);
        nextSearchParams.delete("mode");
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

                        {!needsActivation && <WalletLinker />}

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

                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                            {!needsActivation && (state === "idle" || state === "error" || state === "starting-ai") ? (
                                <>
                                    <Button
                                        fullWidth
                                        variant="solid"
                                        disabled={state === "starting-ai"}
                                        onClick={handleStart}
                                        startDecorator={<PersonSearchRoundedIcon />}
                                        sx={hocPrimaryButtonSx}
                                    >
                                        Find Opponent
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

                        {error && (
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
