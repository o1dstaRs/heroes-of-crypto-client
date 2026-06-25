import { CustomEventSource } from "@heroesofcrypto/common";
import { Alert, Box, Button, CircularProgress, Sheet, Stack, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { buildApiUrl, endpoints, HOST_MATCHMAKING_API } from "../api/axios";
import { useAuthContext } from "./auth/context/auth_context";
import { hocColors, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "./hocTheme";
import { WalletLinker } from "./WalletLinker";

type MatchmakingEvent = {
    ps?: string;
    po?: number;
    r?: number;
    c?: number;
};

type MatchmakingState = "idle" | "searching" | "confirming" | "accepted" | "error";

const STORAGE_KEY = "accessToken";

const matchEventUrl = () => buildApiUrl(HOST_MATCHMAKING_API, endpoints.mm.events);

export const MatchmakingRoute: React.FC = () => {
    const navigate = useNavigate();
    const { startGameSearch, stopGameSearch, confirmGame, getCurrentGame } = useAuthContext();

    const streamRef = useRef<CustomEventSource<MatchmakingEvent> | null>(null);
    const acceptedGameIdRef = useRef("");
    const [state, setState] = useState<MatchmakingState>("idle");
    const [pendingGameId, setPendingGameId] = useState("");
    const [queueSize, setQueueSize] = useState<number | null>(null);
    const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
    const [error, setError] = useState("");

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
        if (state === "error") {
            return "Connection error";
        }
        return "Ready";
    }, [queueSize, secondsRemaining, state]);

    const handleStart = async () => {
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
                    p: 3,
                    borderRadius: "md",
                    ...hocPanelSx,
                }}
            >
                <Stack spacing={2.25}>
                    <Box>
                        <Typography level="h3" textColor={hocColors.parchment}>
                            Ranked Match
                        </Typography>
                        <Typography level="body-sm" textColor={hocColors.muted}>
                            {statusText}
                        </Typography>
                    </Box>

                    <WalletLinker />

                    {(state === "searching" || state === "accepted") && (
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <CircularProgress size="sm" />
                            <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                                {state === "accepted" ? "Waiting for the other player" : "Queue stream connected"}
                            </Typography>
                        </Stack>
                    )}

                    {pendingGameId && (
                        <Typography level="body-xs" textColor="rgba(239, 228, 204, 0.46)">
                            Game {pendingGameId}
                        </Typography>
                    )}

                    <Stack direction="row" spacing={1}>
                        {state === "idle" || state === "error" ? (
                            <Button fullWidth variant="solid" onClick={handleStart} sx={hocPrimaryButtonSx}>
                                Find Opponent
                            </Button>
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
    );
};
