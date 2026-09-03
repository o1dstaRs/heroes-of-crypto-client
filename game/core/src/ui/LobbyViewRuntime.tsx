import { LobbyStatus, type LobbyObject, type LobbyPlayerObject } from "@heroesofcrypto/common";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import { Alert, Box, Button, Chip, CircularProgress, Input, Sheet, Stack, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import {
    fetchLobby,
    fetchLobbyShoutStatus,
    joinLobby,
    leaveLobby,
    openLobbyEventStream,
    setLobbyReady,
    shoutLobbyToArena,
    startLobby,
    type LobbyShoutStatus,
} from "../api/lobby_client";
import { fetchPublicPlayerStats, socialErrorMessage, type PublicPlayerStats } from "../api/social_client";
import { t } from "../i18n/i18n";
import { standingLabel } from "../i18n/standing";
import { useAuthContext } from "./auth/context/auth_context";
import { ArenaNavBar } from "./ArenaNavBar";
import { ARENA_COLUMN_WIDTH, arenaCardSx, arenaScreenSx, arenaTitleSx, arenaWashSx } from "./arenaBackdrop";
import { CurrencyIcon } from "./GoldCurrencyIcon";
import { hocColors, hocDangerAlertSx, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "./hocTheme";
import { lobbyShoutCooldownLabel } from "./lobbyShout";
import { LeagueEmblem } from "./PlayerPortal/LeagueEmblem";
import { useCurrentLobby } from "./social/CurrentLobbyContext";
import { startVisibleInterval } from "./visibleInterval";
import { useRankedSeason } from "./useRankedSeason";

const whole = (value: number | undefined): number => Math.max(0, Math.trunc(Number(value) || 0));

const PlayerCard: React.FC<{
    isYou: boolean;
    placeholder: string;
    player?: LobbyPlayerObject;
    stats?: PublicPlayerStats;
}> = ({ player, placeholder, isYou, stats }) => {
    const { currency } = useRankedSeason();
    if (!player) {
        return (
            <Sheet
                sx={{
                    minHeight: 152,
                    flex: 1,
                    display: "grid",
                    placeItems: "center",
                    border: "1px dashed rgba(220,177,88,0.24)",
                    borderRadius: "14px",
                    bgcolor: "rgba(0,0,0,0.2)",
                }}
            >
                <Stack alignItems="center" spacing={0.5}>
                    <Typography level="title-md" sx={{ color: hocColors.muted }}>
                        {placeholder}
                    </Typography>
                    <Typography level="body-xs" sx={{ color: "rgba(239,228,204,0.38)" }}>
                        {t("Share the room or invite a friend")}
                    </Typography>
                </Stack>
            </Sheet>
        );
    }

    const placed = stats?.state === "placed";
    const league = placed ? whole(stats.league) : 0;
    const wealth = placed ? whole(stats.wealth) : 0;
    const standing = placed
        ? standingLabel(wealth, stats?.wealthName ?? "", stats?.leagueName ?? stats?.standingTitle ?? "")
        : player.league || t("Unranked");

    return (
        <Sheet
            sx={{
                flex: 1,
                minHeight: 152,
                p: { xs: 1.4, sm: 1.75 },
                borderRadius: "14px",
                border: `1px solid ${player.ready ? "rgba(85,216,120,0.36)" : "rgba(220,177,88,0.2)"}`,
                background: player.ready
                    ? "linear-gradient(120deg, rgba(20,54,30,0.72), rgba(8,7,6,0.94) 54%)"
                    : "linear-gradient(120deg, rgba(50,32,10,0.58), rgba(8,7,6,0.94) 54%)",
            }}
        >
            <Stack direction="row" spacing={1.25} alignItems="center">
                <LeagueEmblem league={league} wealth={wealth} label={standing} size={72} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={0.65} alignItems="center">
                        <Typography level="title-lg" noWrap sx={{ minWidth: 0, color: hocColors.parchment }}>
                            {player.username || t("Player")}
                        </Typography>
                        {isYou ? (
                            <Typography level="body-xs" sx={{ color: hocColors.gold, fontWeight: 800 }}>
                                {t("YOU")}
                            </Typography>
                        ) : null}
                    </Stack>
                    <Typography level="body-sm" sx={{ color: hocColors.gold, fontWeight: 700 }}>
                        {standing}
                    </Typography>
                    {stats ? (
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.6 }}>
                            <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                                {whole(stats.mmr).toLocaleString()} MMR
                            </Typography>
                            <Stack direction="row" spacing={0.3} alignItems="center">
                                <CurrencyIcon iconSvg={currency.iconSvg} size={13} />
                                <Typography level="body-xs" sx={{ color: hocColors.gold, fontWeight: 800 }}>
                                    {whole(stats.gold).toLocaleString()} {currency.symbol}
                                </Typography>
                            </Stack>
                        </Stack>
                    ) : null}
                </Box>
                <Chip
                    size="sm"
                    color={player.ready ? "success" : "neutral"}
                    variant={player.ready ? "solid" : "soft"}
                    sx={{ flexShrink: 0 }}
                >
                    {player.ready ? t("Ready") : t("Not ready")}
                </Chip>
            </Stack>
        </Sheet>
    );
};

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
    const [playerStats, setPlayerStats] = useState<Record<string, PublicPlayerStats>>({});
    const [shoutStatus, setShoutStatus] = useState<LobbyShoutStatus | null>(null);
    const [shouting, setShouting] = useState(false);
    const [shoutNotice, setShoutNotice] = useState("");
    const [shoutFailed, setShoutFailed] = useState(false);
    const autoJoinedRef = useRef(false);
    const navigatedRef = useRef(false);
    const { setLobbyId } = useCurrentLobby();

    // Tell the app-wide SocialDock which lobby we're in so friends can be invited; clear on unmount.
    useEffect(() => {
        setLobbyId(lobbyId ?? null);
        return () => setLobbyId(null);
    }, [lobbyId, setLobbyId]);

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

    useEffect(() => {
        const playerIds = Array.from(
            new Set([lobby?.host?.player_id ?? "", lobby?.guest?.player_id ?? ""].filter(Boolean)),
        );
        if (!playerIds.length) {
            return;
        }
        let active = true;
        void Promise.all(
            playerIds.map(async (playerId) => {
                try {
                    return await fetchPublicPlayerStats(playerId);
                } catch {
                    return null;
                }
            }),
        ).then((profiles) => {
            if (!active) {
                return;
            }
            setPlayerStats((current) => {
                const next = { ...current };
                for (const profile of profiles) {
                    if (profile) {
                        next[profile.playerId] = profile;
                    }
                }
                return next;
            });
        });
        return () => {
            active = false;
        };
    }, [lobby?.guest?.player_id, lobby?.host?.player_id]);

    useEffect(() => {
        if (!lobbyId || !isHost || lobby?.is_private || status !== LobbyStatus.LOBBY_OPEN) {
            setShoutStatus(null);
            return;
        }
        let active = true;
        void fetchLobbyShoutStatus(lobbyId)
            .then((next) => {
                if (active) {
                    setShoutStatus(next);
                }
            })
            .catch(() => {
                if (active) {
                    setShoutStatus({ canShout: false, nextAllowedAt: 0 });
                }
            });
        return () => {
            active = false;
        };
    }, [isHost, lobby?.is_private, lobbyId, status]);

    // Carry the two PLAYERS into their game the moment the server creates it. A non-member watcher is
    // deliberately NOT auto-navigated — they get an explicit "Spectate" button below so opening a shared
    // link to a running game doesn't yank them straight into a fight they only meant to watch.
    useEffect(() => {
        if (lobby && status === LobbyStatus.LOBBY_STARTED && lobby.game_id && isMember && !navigatedRef.current) {
            navigatedRef.current = true;
            // Stamp the origin: entering the game THROUGH a lobby room gives a "Back to lobby" exit.
            navigate(`/game/${lobby.game_id}`, { state: { from: "lobby", lobbyId } });
        }
    }, [lobby, status, isMember, navigate]);

    // Watch a running lobby game (any public game is observable). Reuses the game route's observer mode.
    const spectate = useCallback(() => {
        if (lobby?.game_id) {
            navigate(`/game/${lobby.game_id}`, { state: { from: "lobby", lobbyId } });
        }
    }, [lobby?.game_id, lobbyId, navigate]);

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

    // Countdown ticker while starting or while the chat-shout cooldown is visible.
    useEffect(() => {
        if (status !== LobbyStatus.LOBBY_STARTING && (shoutStatus?.nextAllowedAt ?? 0) <= Date.now()) {
            return;
        }
        return startVisibleInterval(() => setNowMs(Date.now()), status === LobbyStatus.LOBBY_STARTING ? 250 : 1000);
    }, [shoutStatus?.nextAllowedAt, status]);

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

    const handleShout = useCallback(async () => {
        if (!lobbyId) {
            return;
        }
        setShouting(true);
        setShoutNotice("");
        setShoutFailed(false);
        try {
            const next = await shoutLobbyToArena(lobbyId);
            setShoutStatus(next);
            setNowMs(Date.now());
            setShoutNotice(t("Lobby shared to Arena Chat — anyone can join from the link."));
        } catch (err) {
            setShoutFailed(true);
            setShoutNotice(socialErrorMessage(err, t("Could not share this lobby to Arena Chat")));
            void fetchLobbyShoutStatus(lobbyId)
                .then(setShoutStatus)
                .catch(() => undefined);
        } finally {
            setShouting(false);
        }
    }, [lobbyId]);

    const shareLink = useMemo(
        () => (lobbyId && typeof window !== "undefined" ? `${window.location.origin}/lobby/${lobbyId}` : ""),
        [lobbyId],
    );
    const countdownSeconds =
        status === LobbyStatus.LOBBY_STARTING && lobby?.start_at_ms
            ? Math.max(0, Math.ceil((lobby.start_at_ms - nowMs) / 1000))
            : 0;
    const shoutCooldown = lobbyShoutCooldownLabel(shoutStatus?.nextAllowedAt ?? 0, nowMs);
    const canShout =
        !!shoutStatus &&
        !shoutCooldown &&
        (shoutStatus.canShout || (shoutStatus.nextAllowedAt > 0 && nowMs >= shoutStatus.nextAllowedAt));

    if (!lobby) {
        return (
            <Box sx={arenaScreenSx}>
                <Box aria-hidden="true" sx={arenaWashSx} />
                <ArenaNavBar current="lobbies" />
                <Stack alignItems="center" sx={{ position: "relative", zIndex: 1, py: 8 }}>
                    {error ? <Alert sx={hocDangerAlertSx}>{error}</Alert> : <CircularProgress />}
                </Stack>
            </Box>
        );
    }

    if (status === LobbyStatus.LOBBY_CLOSED) {
        return (
            <Box sx={arenaScreenSx}>
                <Box aria-hidden="true" sx={arenaWashSx} />
                <ArenaNavBar current="lobbies" />
                <Stack alignItems="center" sx={{ position: "relative", zIndex: 1, py: 8 }}>
                    <Sheet sx={{ ...arenaCardSx, p: 4, textAlign: "center" }}>
                        <Typography sx={{ color: hocColors.parchment, mb: 2 }}>This lobby has been closed.</Typography>
                        <Button sx={hocPrimaryButtonSx} onClick={() => navigate("/lobbies")}>
                            Back to lobbies
                        </Button>
                    </Sheet>
                </Stack>
            </Box>
        );
    }

    const needsPin = !isMember && status === LobbyStatus.LOBBY_OPEN && lobby.is_private;

    return (
        <Box sx={arenaScreenSx}>
            <Box aria-hidden="true" sx={arenaWashSx} />
            <ArenaNavBar current="lobbies" />
            <Stack
                spacing={2}
                sx={{
                    position: "relative",
                    zIndex: 1,
                    width: ARENA_COLUMN_WIDTH,
                    maxWidth: 920,
                    mx: "auto",
                    py: { xs: 2, md: 3 },
                }}
            >
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5}>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography
                            level="body-xs"
                            sx={{ color: hocColors.gold, fontWeight: 800, letterSpacing: "0.14em" }}
                        >
                            {lobby.is_private ? t("PRIVATE LOBBY") : t("OPEN LOBBY")}
                        </Typography>
                        <Typography level="h2" noWrap sx={{ ...arenaTitleSx, minWidth: 0, mt: 0.2 }}>
                            {lobby.name || t("Lobby")}
                        </Typography>
                    </Box>
                    <Button
                        variant="plain"
                        sx={{ ...hocSoftButtonSx, flexShrink: 0 }}
                        onClick={() => void handleLeave()}
                    >
                        Leave
                    </Button>
                </Stack>

                {error ? <Alert sx={hocDangerAlertSx}>{error}</Alert> : null}

                {shareLink ? (
                    <Sheet
                        sx={{
                            p: { xs: 1.5, sm: 2 },
                            borderRadius: "14px",
                            border: "1px solid rgba(220,177,88,0.2)",
                            background:
                                "linear-gradient(110deg, rgba(49,32,10,0.54), rgba(8,7,6,0.94) 54%, rgba(18,12,7,0.88))",
                        }}
                    >
                        <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1.5}
                            alignItems={{ xs: "stretch", sm: "center" }}
                        >
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography level="title-sm" sx={{ color: hocColors.parchment }}>
                                    {t("Bring in an opponent")}
                                </Typography>
                                <Typography level="body-xs" sx={{ color: hocColors.muted, mt: 0.25 }}>
                                    {lobby.is_private
                                        ? t("Share the link and PIN with the player you want to invite.")
                                        : t(
                                              "Copy the link for a friend, or announce this room to everyone in Arena Chat.",
                                          )}
                                </Typography>
                            </Box>
                            <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
                                <Button
                                    size="sm"
                                    startDecorator={<ContentCopyRoundedIcon />}
                                    sx={hocSoftButtonSx}
                                    onClick={() => void navigator.clipboard?.writeText(shareLink)}
                                >
                                    {t("Copy link")}
                                </Button>
                                {isHost && !lobby.is_private && status === LobbyStatus.LOBBY_OPEN ? (
                                    <Button
                                        size="sm"
                                        startDecorator={<CampaignRoundedIcon />}
                                        sx={{ ...hocPrimaryButtonSx, minWidth: 156 }}
                                        loading={shouting}
                                        disabled={!canShout || shouting}
                                        title={
                                            shoutCooldown
                                                ? `${t("Available again in")} ${shoutCooldown}`
                                                : t("Post a public join link to Arena Chat")
                                        }
                                        onClick={() => void handleShout()}
                                    >
                                        {shoutCooldown ? `${t("Shout again")} · ${shoutCooldown}` : t("Shout to chat")}
                                    </Button>
                                ) : null}
                            </Stack>
                        </Stack>
                        {shoutNotice ? (
                            <Typography
                                level="body-xs"
                                sx={{ mt: 1, color: shoutFailed ? hocColors.danger : hocColors.green }}
                            >
                                {shoutNotice}
                            </Typography>
                        ) : null}
                    </Sheet>
                ) : null}

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <PlayerCard
                        player={lobby.host}
                        stats={lobby.host?.player_id ? playerStats[lobby.host.player_id] : undefined}
                        placeholder={t("Waiting for host…")}
                        isYou={isHost}
                    />
                    <PlayerCard
                        player={lobby.guest}
                        stats={lobby.guest?.player_id ? playerStats[lobby.guest.player_id] : undefined}
                        placeholder={t("Waiting for an opponent…")}
                        isYou={isGuest}
                    />
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

                {!isMember && status === LobbyStatus.LOBBY_STARTED && lobby.game_id ? (
                    <Sheet sx={{ ...hocPanelSx, p: 2 }}>
                        <Typography sx={{ color: hocColors.parchment, mb: 1 }}>
                            This game is already in progress — the lobby is full.
                        </Typography>
                        <Typography level="body-sm" sx={{ color: hocColors.muted, mb: 1.5 }}>
                            Every game is public, so you can watch it live.
                        </Typography>
                        <Button sx={hocPrimaryButtonSx} onClick={spectate}>
                            Spectate live
                        </Button>
                    </Sheet>
                ) : null}

                {!isMember && (status === LobbyStatus.LOBBY_FULL || status === LobbyStatus.LOBBY_STARTING) ? (
                    <Sheet sx={{ ...hocPanelSx, p: 2 }}>
                        <Typography sx={{ color: hocColors.muted }}>
                            This lobby is full — you can watch here once the game starts.
                        </Typography>
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

                {isMember && status === LobbyStatus.LOBBY_STARTING ? (
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
