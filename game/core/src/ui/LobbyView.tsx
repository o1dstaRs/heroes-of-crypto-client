import { LobbyStatus, type LobbyObject, type LobbyPlayerObject } from "@heroesofcrypto/common";
import { Alert, Box, Button, Chip, CircularProgress, Input, Sheet, Stack, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import {
    fetchLobby,
    joinLobby,
    leaveLobby,
    openLobbyEventStream,
    setLobbyReady,
    startLobby,
} from "../api/lobby_client";
import { useAuthContext } from "./auth/context/auth_context";
import { hocColors, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "./hocTheme";

const PlayerCard: React.FC<{ player?: LobbyPlayerObject; placeholder: string; isYou: boolean }> = ({
    player,
    placeholder,
    isYou,
}) => (
    <Sheet sx={{ ...hocPanelSx, p: 2, flex: 1, minHeight: 132 }}>
        {player ? (
            <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography level="title-md" sx={{ color: hocColors.parchment }}>
                        {player.username || "Player"} {isYou ? "(you)" : ""}
                    </Typography>
                    <Chip color={player.ready ? "success" : "neutral"} variant={player.ready ? "solid" : "soft"}>
                        {player.ready ? "Ready" : "Not ready"}
                    </Chip>
                </Stack>
                <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                    {player.league || "Unranked"} · Rating {player.rating ?? 0}
                </Typography>
            </Stack>
        ) : (
            <Stack alignItems="center" justifyContent="center" sx={{ height: "100%" }}>
                <Typography sx={{ color: hocColors.muted }}>{placeholder}</Typography>
            </Stack>
        )}
    </Sheet>
);

export const LobbyView: React.FC = () => {
    const { lobbyId } = useParams<{ lobbyId: string }>();
    const navigate = useNavigate();
    const { user } = useAuthContext();
    const myUsername = user?.username ?? "";

    const [lobby, setLobby] = useState<LobbyObject | null>(null);
    const [error, setError] = useState("");
    const [pin, setPin] = useState("");
    const [busy, setBusy] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const autoJoinedRef = useRef(false);
    const navigatedRef = useRef(false);

    // Load initial state + subscribe to live updates.
    useEffect(() => {
        if (!lobbyId) {
            return;
        }
        const controller = new AbortController();
        let active = true;
        void (async () => {
            try {
                const initial = await fetchLobby(lobbyId);
                if (active) {
                    setLobby(initial);
                }
            } catch {
                if (active) {
                    setError("Lobby not found");
                }
            }
            try {
                await openLobbyEventStream(lobbyId, (next) => active && setLobby(next), controller.signal);
            } catch {
                /* stream ended / aborted */
            }
        })();
        return () => {
            active = false;
            controller.abort();
        };
    }, [lobbyId]);

    const isHost = !!lobby?.host && lobby.host.username === myUsername;
    const isGuest = !!lobby?.guest && lobby.guest.username === myUsername;
    const isMember = isHost || isGuest;
    const me = isHost ? lobby?.host : isGuest ? lobby?.guest : undefined;
    const bothReady = !!lobby?.host?.ready && !!lobby?.guest?.ready;
    const status = lobby?.status ?? LobbyStatus.LOBBY_OPEN;

    // Navigate into the game once the server has created it.
    useEffect(() => {
        if (lobby && status === LobbyStatus.LOBBY_STARTED && lobby.game_id && !navigatedRef.current) {
            navigatedRef.current = true;
            navigate(`/game/${lobby.game_id}`);
        }
    }, [lobby, status, navigate]);

    // Auto-join public lobbies the moment we arrive (private ones prompt for a PIN below).
    useEffect(() => {
        if (!lobbyId || !lobby || isMember || autoJoinedRef.current) {
            return;
        }
        if (status === LobbyStatus.LOBBY_OPEN && !lobby.is_private) {
            autoJoinedRef.current = true;
            void joinLobby(lobbyId, "")
                .then(setLobby)
                .catch(() => setError("Could not join this lobby"));
        }
    }, [lobbyId, lobby, isMember, status]);

    // Countdown ticker while starting.
    useEffect(() => {
        if (status !== LobbyStatus.LOBBY_STARTING) {
            return;
        }
        const handle = window.setInterval(() => setNowMs(Date.now()), 250);
        return () => window.clearInterval(handle);
    }, [status]);

    const handleJoinPrivate = useCallback(async () => {
        if (!lobbyId) {
            return;
        }
        if (!/^\d{4}$/.test(pin)) {
            setError("Enter the 4-digit PIN");
            return;
        }
        setBusy(true);
        try {
            setLobby(await joinLobby(lobbyId, pin));
            setError("");
        } catch {
            setError("Incorrect PIN or lobby is no longer open");
        } finally {
            setBusy(false);
        }
    }, [lobbyId, pin]);

    const toggleReady = useCallback(async () => {
        if (!lobbyId || !me) {
            return;
        }
        setBusy(true);
        try {
            setLobby(await setLobbyReady(lobbyId, !me.ready));
        } catch {
            setError("Failed to update ready status");
        } finally {
            setBusy(false);
        }
    }, [lobbyId, me]);

    const handleStart = useCallback(async () => {
        if (!lobbyId) {
            return;
        }
        setBusy(true);
        try {
            setLobby(await startLobby(lobbyId));
        } catch {
            setError("Both players must be ready to start");
            setBusy(false);
        }
    }, [lobbyId]);

    const handleLeave = useCallback(async () => {
        if (lobbyId) {
            await leaveLobby(lobbyId).catch(() => undefined);
        }
        navigate("/lobbies");
    }, [lobbyId, navigate]);

    const shareLink = useMemo(
        () => (lobbyId && typeof window !== "undefined" ? `${window.location.origin}/lobby/${lobbyId}` : ""),
        [lobbyId],
    );
    const countdownSeconds =
        status === LobbyStatus.LOBBY_STARTING && lobby?.start_at_ms
            ? Math.max(0, Math.ceil((lobby.start_at_ms - nowMs) / 1000))
            : 0;

    if (!lobby) {
        return (
            <Box
                sx={{
                    minHeight: "100vh",
                    bgcolor: hocColors.black,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                {error ? <Alert color="danger">{error}</Alert> : <CircularProgress />}
            </Box>
        );
    }

    if (status === LobbyStatus.LOBBY_CLOSED) {
        return (
            <Box
                sx={{
                    minHeight: "100vh",
                    bgcolor: hocColors.black,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <Sheet sx={{ ...hocPanelSx, p: 4, textAlign: "center" }}>
                    <Typography sx={{ color: hocColors.parchment, mb: 2 }}>This lobby has been closed.</Typography>
                    <Button sx={hocPrimaryButtonSx} onClick={() => navigate("/lobbies")}>
                        Back to lobbies
                    </Button>
                </Sheet>
            </Box>
        );
    }

    const needsPin = !isMember && status === LobbyStatus.LOBBY_OPEN && lobby.is_private;

    return (
        <Box sx={{ minHeight: "100vh", bgcolor: hocColors.black, p: 3, display: "flex", justifyContent: "center" }}>
            <Stack spacing={2} sx={{ width: "100%", maxWidth: 720, position: "relative" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography level="h2" sx={{ color: hocColors.parchment }}>
                        {lobby.name || "Lobby"} {lobby.is_private ? "🔒" : ""}
                    </Typography>
                    <Button variant="plain" sx={hocSoftButtonSx} onClick={() => void handleLeave()}>
                        Leave
                    </Button>
                </Stack>

                {error ? <Alert color="danger">{error}</Alert> : null}

                {shareLink ? (
                    <Sheet sx={{ ...hocPanelSx, p: 2 }}>
                        <Typography level="body-sm" sx={{ color: hocColors.muted, mb: 1 }}>
                            Invite a friend with this link{lobby.is_private ? " (they'll also need the PIN)" : ""}:
                        </Typography>
                        <Stack direction="row" spacing={1}>
                            <Input value={shareLink} readOnly sx={{ flex: 1 }} />
                            <Button sx={hocSoftButtonSx} onClick={() => void navigator.clipboard?.writeText(shareLink)}>
                                Copy
                            </Button>
                        </Stack>
                    </Sheet>
                ) : null}

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <PlayerCard player={lobby.host} placeholder="Waiting for host…" isYou={isHost} />
                    <PlayerCard player={lobby.guest} placeholder="Waiting for an opponent…" isYou={isGuest} />
                </Stack>

                {needsPin ? (
                    <Sheet sx={{ ...hocPanelSx, p: 2 }}>
                        <Typography sx={{ color: hocColors.parchment, mb: 1 }}>
                            This is a private lobby — enter the PIN to join.
                        </Typography>
                        <Stack direction="row" spacing={1}>
                            <Input
                                placeholder="4-digit PIN"
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                slotProps={{ input: { inputMode: "numeric", maxLength: 4 } }}
                            />
                            <Button sx={hocPrimaryButtonSx} loading={busy} onClick={() => void handleJoinPrivate()}>
                                Join
                            </Button>
                        </Stack>
                    </Sheet>
                ) : null}

                {isMember && status === LobbyStatus.LOBBY_FULL ? (
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button sx={hocSoftButtonSx} loading={busy} onClick={() => void toggleReady()}>
                            {me?.ready ? "Cancel ready" : "Ready"}
                        </Button>
                        <Button
                            sx={hocPrimaryButtonSx}
                            disabled={!bothReady || busy}
                            onClick={() => void handleStart()}
                        >
                            Start game
                        </Button>
                    </Stack>
                ) : null}

                {status === LobbyStatus.LOBBY_STARTING ? (
                    <Box
                        sx={{
                            position: "fixed",
                            inset: 0,
                            bgcolor: "rgba(0,0,0,0.75)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 1300,
                        }}
                    >
                        <Typography level="body-lg" sx={{ color: hocColors.muted }}>
                            Game starting in
                        </Typography>
                        <Typography sx={{ color: hocColors.parchment, fontSize: 96, fontWeight: 700, lineHeight: 1 }}>
                            {countdownSeconds}
                        </Typography>
                    </Box>
                ) : null}
            </Stack>
        </Box>
    );
};
