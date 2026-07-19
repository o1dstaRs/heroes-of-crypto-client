import { CustomEventSource } from "@heroesofcrypto/common";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import PersonSearchRoundedIcon from "@mui/icons-material/PersonSearchRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import TimerRoundedIcon from "@mui/icons-material/TimerRounded";
import { Alert, Box, Button, Sheet, Stack, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { buildApiUrl, endpoints, HOST_MATCHMAKING_API } from "../api/axios";
import { createVsAiGame } from "../api/vs_ai_client";
import { markVsAiGame } from "../utils/aiOpponent";
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
const rankedBackgroundUrl = new URL("../../images/background_dark.webp", import.meta.url).toString();
const logoUrl = new URL("../../images/logo_hoc.webp", import.meta.url).toString();

const ArenaFeature: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
    <Stack
        direction="row"
        spacing={0.75}
        alignItems="center"
        justifyContent="center"
        sx={{
            minWidth: 0,
            px: 1.15,
            py: 0.75,
            borderRadius: "999px",
            bgcolor: "rgba(0,0,0,0.32)",
            border: "1px solid rgba(239,228,204,0.1)",
            color: hocColors.mutedStrong,
            "& svg": { color: hocColors.gold, fontSize: 17 },
        }}
    >
        {icon}
        <Typography level="body-xs" sx={{ color: "inherit", fontWeight: 650, whiteSpace: "nowrap" }}>
            {label}
        </Typography>
    </Stack>
);

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

    const navigationLocked =
        state === "searching" || state === "confirming" || state === "accepted" || state === "starting-ai";
    const shortGameId =
        pendingGameId.length > 16 ? `${pendingGameId.slice(0, 8)}…${pendingGameId.slice(-5)}` : pendingGameId;
    const presentation = (() => {
        if (needsActivation) {
            return {
                accent: hocColors.gold,
                eyebrow: "ACCOUNT ACTIVATION",
                headline: "Verify before entering the arena",
                description: "Activate your account to unlock ranked matchmaking and practice battles.",
            };
        }
        if (penalized) {
            return {
                accent: hocColors.danger,
                eyebrow: "QUEUE COOLDOWN",
                headline: `Search unlocks in ${penaltySeconds}s`,
                description: "Ranked matches must be accepted in time. The queue will reopen automatically.",
            };
        }
        if (state === "searching") {
            return {
                accent: hocColors.orange,
                eyebrow: "MATCHMAKING",
                headline: "Scouting for a worthy rival",
                description: queueSize
                    ? `${queueSize} ${queueSize === 1 ? "commander is" : "commanders are"} currently in the queue.`
                    : "Stay ready while we search the live ranked queue.",
            };
        }
        if (state === "confirming") {
            return {
                accent: "#ffd166",
                eyebrow: "OPPONENT FOUND",
                headline: "Your rival is ready",
                description: "Accept before the timer expires to lock in the match.",
            };
        }
        if (state === "accepted") {
            return {
                accent: "#55d878",
                eyebrow: "MATCH ACCEPTED",
                headline: "You’re locked in",
                description: "Waiting for your opponent to accept. The arena will open automatically.",
            };
        }
        if (state === "starting-ai") {
            return {
                accent: hocColors.gold,
                eyebrow: "PRACTICE ARENA",
                headline: "Summoning a training opponent",
                description: "Preparing a private match against the default AI commander.",
            };
        }
        if (state === "error") {
            return {
                accent: hocColors.danger,
                eyebrow: "CONNECTION ISSUE",
                headline: "The arena link was interrupted",
                description: "Try the ranked queue again, or sharpen your strategy against the AI.",
            };
        }
        return {
            accent: hocColors.orange,
            eyebrow: "READY FOR BATTLE",
            headline: "Choose your next opponent",
            description: "Enter the ranked queue for a live duel, or practice your draft against the AI.",
        };
    })();

    return (
        <Box
            sx={{
                position: "fixed",
                inset: 0,
                overflowY: "auto",
                bgcolor: hocColors.black,
                color: hocColors.parchment,
                backgroundImage: `linear-gradient(105deg, rgba(7,5,4,0.97) 0%, rgba(7,5,4,0.88) 46%, rgba(7,5,4,0.95) 100%), url(${rankedBackgroundUrl})`,
                backgroundPosition: "center",
                backgroundSize: "cover",
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
                            : "radial-gradient(circle at 28% 35%, rgba(255,143,0,0.1), transparent 31%), radial-gradient(circle at 88% 8%, rgba(220,177,88,0.07), transparent 24%), linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.45))",
                    transition: "background 320ms ease",
                }}
            />

            <Box
                component="header"
                sx={{
                    position: "relative",
                    zIndex: 1,
                    width: "min(1480px, calc(100% - 32px))",
                    mx: "auto",
                    pt: { xs: 2, md: 2.5 },
                }}
            >
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={{ xs: 1.25, sm: 2 }}
                    alignItems={{ xs: "stretch", sm: "center" }}
                    justifyContent="space-between"
                    sx={{
                        px: { xs: 1.25, md: 1.75 },
                        py: 1.1,
                        borderRadius: "16px",
                        bgcolor: "rgba(9,6,4,0.78)",
                        border: "1px solid rgba(239,228,204,0.1)",
                        boxShadow: "0 12px 34px rgba(0,0,0,0.34)",
                        backdropFilter: "blur(16px)",
                    }}
                >
                    <Button
                        variant="plain"
                        onClick={() => navigate("/")}
                        disabled={navigationLocked}
                        title={navigationLocked ? "Leave matchmaking before navigating away" : "Open battle sandbox"}
                        sx={{
                            justifyContent: "flex-start",
                            px: 0.5,
                            color: hocColors.parchment,
                            "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
                            "&.Mui-disabled": { color: hocColors.muted },
                        }}
                    >
                        <Stack direction="row" spacing={1.15} alignItems="center">
                            <Box
                                component="img"
                                src={logoUrl}
                                alt="Heroes of Crypto"
                                sx={{
                                    width: 38,
                                    height: 38,
                                    objectFit: "contain",
                                    filter: "drop-shadow(0 0 8px #ff8f0066)",
                                }}
                            />
                            <Box sx={{ textAlign: "left" }}>
                                <Typography
                                    level="title-md"
                                    sx={{ color: "inherit", fontWeight: 800, lineHeight: 1.05 }}
                                >
                                    Heroes of Crypto
                                </Typography>
                                <Typography level="body-xs" sx={{ color: hocColors.gold, letterSpacing: "0.13em" }}>
                                    RANKED ARENA
                                </Typography>
                            </Box>
                        </Stack>
                    </Button>

                    <Stack
                        component="nav"
                        aria-label="Game navigation"
                        direction="row"
                        spacing={0.5}
                        sx={{ width: { xs: "100%", sm: "auto" }, pb: { xs: 0.25, sm: 0 } }}
                    >
                        <Button
                            aria-label="Custom games"
                            size="sm"
                            variant="soft"
                            aria-current="page"
                            startDecorator={<SportsEsportsRoundedIcon />}
                            sx={{
                                ...hocSoftButtonSx,
                                flex: { xs: 1, sm: "0 0 auto" },
                                minWidth: 0,
                                px: { xs: 0.75, sm: 1.25 },
                                color: hocColors.gold,
                            }}
                        >
                            Ranked
                        </Button>
                        <Button
                            size="sm"
                            variant="plain"
                            disabled={navigationLocked}
                            onClick={() => navigate("/lobbies")}
                            title={navigationLocked ? "Leave matchmaking before navigating away" : undefined}
                            startDecorator={<GroupsRoundedIcon />}
                            sx={{
                                color: hocColors.mutedStrong,
                                flex: { xs: 1, sm: "0 0 auto" },
                                minWidth: 0,
                                px: { xs: 0.75, sm: 1.25 },
                                "&:hover": { bgcolor: hocColors.orangeSoft },
                            }}
                        >
                            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                                Custom
                            </Box>
                        </Button>
                        <Button
                            aria-label="Sandbox"
                            size="sm"
                            variant="plain"
                            disabled={navigationLocked}
                            onClick={() => navigate("/")}
                            title={navigationLocked ? "Leave matchmaking before navigating away" : undefined}
                            startDecorator={<HomeRoundedIcon />}
                            sx={{
                                color: hocColors.mutedStrong,
                                flex: { xs: 1, sm: "0 0 auto" },
                                minWidth: 0,
                                px: { xs: 0.75, sm: 1.25 },
                                "&:hover": { bgcolor: hocColors.orangeSoft },
                            }}
                        >
                            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                                Sandbox
                            </Box>
                        </Button>
                        <Button
                            size="sm"
                            variant="plain"
                            disabled={navigationLocked}
                            onClick={() => navigate("/portal")}
                            title={navigationLocked ? "Leave matchmaking before navigating away" : undefined}
                            startDecorator={<AccountCircleRoundedIcon />}
                            sx={{
                                color: hocColors.mutedStrong,
                                flex: { xs: 1, sm: "0 0 auto" },
                                minWidth: 0,
                                px: { xs: 0.75, sm: 1.25 },
                                "&:hover": { bgcolor: hocColors.orangeSoft },
                            }}
                        >
                            Profile
                        </Button>
                    </Stack>
                </Stack>
            </Box>

            <Box
                role="main"
                sx={{
                    position: "relative",
                    zIndex: 1,
                    width: "min(1480px, calc(100% - 32px))",
                    mx: "auto",
                    py: { xs: 2, md: 3 },
                    display: "grid",
                    gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(560px, 1fr) minmax(370px, 420px)" },
                    gap: { xs: 2, md: 3 },
                    alignItems: "start",
                }}
            >
                <Sheet
                    component="section"
                    aria-labelledby="ranked-heading"
                    variant="outlined"
                    sx={{
                        minHeight: { lg: 724 },
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                        borderRadius: "22px",
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
                            py: { xs: 3, md: 4.5 },
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
                        <Box
                            component="img"
                            src={logoUrl}
                            alt=""
                            aria-hidden="true"
                            sx={{
                                position: "absolute",
                                width: { xs: 190, md: 260 },
                                height: { xs: 190, md: 260 },
                                right: { xs: -75, md: -55 },
                                top: { xs: -45, md: -70 },
                                objectFit: "contain",
                                opacity: 0.085,
                                filter: "grayscale(0.35)",
                                pointerEvents: "none",
                            }}
                        />
                        <Typography
                            level="body-xs"
                            sx={{ color: hocColors.gold, fontWeight: 800, letterSpacing: "0.2em", mb: 1.1 }}
                        >
                            LIVE RANKED COMBAT
                        </Typography>
                        <Typography
                            id="ranked-heading"
                            level="h1"
                            sx={{
                                maxWidth: 700,
                                color: hocColors.parchment,
                                fontSize: { xs: "2rem", sm: "2.65rem", md: "3.15rem" },
                                lineHeight: 1.02,
                                letterSpacing: "-0.035em",
                            }}
                        >
                            Command the arena.
                        </Typography>
                        <Typography
                            level="body-md"
                            sx={{ color: hocColors.muted, maxWidth: 620, mt: 1.35, lineHeight: 1.65 }}
                        >
                            Draft your army, adapt your build, and face another commander in a match that counts.
                        </Typography>
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, max-content)" },
                                gap: 0.8,
                                maxWidth: "100%",
                                mt: 2.2,
                                "& > :last-child": { gridColumn: { xs: "1 / -1", sm: "auto" } },
                            }}
                        >
                            <ArenaFeature icon={<GroupsRoundedIcon />} label="Live PvP" />
                            <ArenaFeature icon={<ShieldRoundedIcon />} label="Full army draft" />
                            <ArenaFeature icon={<AccountCircleRoundedIcon />} label="Tracked results" />
                        </Box>
                    </Box>

                    <Box
                        aria-live="polite"
                        sx={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            px: { xs: 2.25, sm: 4 },
                            py: { xs: 3.25, md: 4 },
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
                                display: "grid",
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
                                            SECONDS
                                        </Typography>
                                    </Stack>
                                ) : state === "accepted" ? (
                                    <CheckCircleRoundedIcon />
                                ) : state === "starting-ai" ? (
                                    <SmartToyRoundedIcon />
                                ) : penalized ? (
                                    <TimerRoundedIcon />
                                ) : needsActivation || state === "error" ? (
                                    <ShieldRoundedIcon />
                                ) : (
                                    <PersonSearchRoundedIcon />
                                )}
                            </Box>
                        </Box>

                        <Typography
                            level="body-xs"
                            sx={{ color: presentation.accent, fontWeight: 800, letterSpacing: "0.18em" }}
                        >
                            {presentation.eyebrow}
                        </Typography>
                        <Typography
                            level="h2"
                            sx={{ color: hocColors.parchment, mt: 0.75, fontSize: { xs: "1.55rem", sm: "2rem" } }}
                        >
                            {presentation.headline}
                        </Typography>
                        <Typography level="body-sm" sx={{ color: hocColors.muted, maxWidth: 540, mt: 0.8 }}>
                            {presentation.description}
                        </Typography>
                        <Typography
                            level="body-xs"
                            sx={{
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

                        <Stack spacing={1.25} sx={{ width: "100%", maxWidth: 650, mt: 2.75 }}>
                            {needsActivation && (
                                <>
                                    <Alert variant="soft" color="warning" sx={{ textAlign: "left" }}>
                                        Verify your email to play online. We sent a verification code to{" "}
                                        {accountEmail || "your email address"}.
                                    </Alert>
                                    <Button
                                        fullWidth
                                        variant="solid"
                                        onClick={handleResend}
                                        disabled={resendState === "sending" || !accountEmail}
                                        sx={{ ...hocPrimaryButtonSx, minHeight: 50 }}
                                    >
                                        {resendState === "sending"
                                            ? "Sending…"
                                            : resendState === "sent"
                                              ? "Email sent — check your inbox"
                                              : "Resend verification email"}
                                    </Button>
                                    <Typography level="body-xs" textColor={hocColors.muted}>
                                        Enter the code from the email to activate your account, then reload this page.
                                    </Typography>
                                </>
                            )}

                            {!needsActivation && (state === "idle" || state === "error" || state === "starting-ai") ? (
                                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.15}>
                                    <Button
                                        fullWidth
                                        variant="solid"
                                        disabled={state === "starting-ai" || penalized}
                                        onClick={handleStart}
                                        startDecorator={<PersonSearchRoundedIcon />}
                                        endDecorator={!penalized ? <ArrowForwardRoundedIcon /> : undefined}
                                        sx={{ ...hocPrimaryButtonSx, minHeight: 54, fontSize: "0.96rem" }}
                                    >
                                        {penalized ? `Search again in ${penaltySeconds}s` : "Find ranked opponent"}
                                    </Button>
                                    <Button
                                        fullWidth
                                        variant="soft"
                                        loading={state === "starting-ai"}
                                        disabled={state === "starting-ai"}
                                        onClick={handlePlayAi}
                                        startDecorator={<SmartToyRoundedIcon />}
                                        sx={{ ...hocSoftButtonSx, minHeight: 54, fontSize: "0.96rem" }}
                                    >
                                        Practice vs AI
                                    </Button>
                                </Stack>
                            ) : null}

                            {state === "searching" ? (
                                <Button
                                    fullWidth
                                    variant="soft"
                                    onClick={handleCancel}
                                    sx={{ ...hocSoftButtonSx, minHeight: 52 }}
                                >
                                    Leave ranked queue
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
                                    {state === "accepted" ? "Match accepted" : "Accept ranked match"}
                                </Button>
                            ) : null}

                            {penalized && (
                                <Alert variant="soft" color="warning" sx={{ textAlign: "left" }}>
                                    You didn&apos;t accept the last match. You can search again in {penaltySeconds}s.
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
                                    MATCH REF · {shortGameId}
                                </Typography>
                            )}
                        </Stack>
                    </Box>

                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
                            borderTop: "1px solid rgba(239,228,204,0.09)",
                            bgcolor: "rgba(0,0,0,0.2)",
                        }}
                    >
                        {[
                            ["LIVE DUEL", "Real opponent"],
                            ["FULL DRAFT", "Army & loadout"],
                            ["RANKED RECORD", "Profile history"],
                        ].map(([label, value], index) => (
                            <Box
                                key={label}
                                sx={{
                                    px: 2.25,
                                    py: 1.5,
                                    borderLeft: { xs: "none", sm: index ? "1px solid rgba(239,228,204,0.07)" : "none" },
                                    borderTop: { xs: index ? "1px solid rgba(239,228,204,0.07)" : "none", sm: "none" },
                                }}
                            >
                                <Typography level="body-xs" sx={{ color: hocColors.gold, fontWeight: 800 }}>
                                    {label}
                                </Typography>
                                <Typography level="body-xs" sx={{ color: hocColors.muted, mt: 0.2 }}>
                                    {value}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                </Sheet>

                <PlayerPortalSidebar navigationDisabled={navigationLocked} />
            </Box>
        </Box>
    );
};
