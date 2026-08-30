import { LobbyStatus, type LobbyObject } from "@heroesofcrypto/common";
import { Box, Button, Sheet, Stack, Typography } from "@mui/joy";
import React from "react";

import type { PublicPlayerStats } from "../api/social_client";
import { t } from "../i18n/i18n";
import { standingLabel } from "../i18n/standing";
import { arenaBadgeSx } from "./arenaBackdrop";
import { CurrencyIcon } from "./GoldCurrencyIcon";
import { hocColors, hocSoftButtonSx } from "./hocTheme";
import { lobbyAgeLabel } from "./lobbyDiscovery";
import { LeagueEmblem } from "./PlayerPortal/LeagueEmblem";
import { useRankedSeason } from "./useRankedSeason";

export interface LobbyDiscoveryCardProps {
    dense: boolean;
    isFriendLobby: boolean;
    lobby: LobbyObject;
    onJoin: () => void;
    stats?: PublicPlayerStats;
}

const whole = (value: number | undefined): number => Math.max(0, Math.trunc(Number(value) || 0));

export const LobbyDiscoveryCard: React.FC<LobbyDiscoveryCardProps> = ({
    dense,
    isFriendLobby,
    lobby,
    onJoin,
    stats,
}) => {
    const { currency } = useRankedSeason();
    const host = lobby.host;
    const placed = stats?.state === "placed";
    const league = placed ? whole(stats.league) : 0;
    const wealth = placed ? whole(stats.wealth) : 0;
    const standing = placed
        ? standingLabel(wealth, stats?.wealthName ?? "", stats?.leagueName ?? stats?.standingTitle ?? "")
        : host?.league || t("Unranked");
    const roomName = lobby.name || `${host?.username ?? t("Player")}'s lobby`;

    return (
        <Sheet
            sx={{
                position: "relative",
                overflow: "hidden",
                p: dense ? 1.1 : { xs: 1.35, sm: 1.7 },
                borderRadius: dense ? "10px" : "14px",
                border: `1px solid ${isFriendLobby ? "rgba(85,216,120,0.36)" : "rgba(220,177,88,0.2)"}`,
                background: isFriendLobby
                    ? "linear-gradient(110deg, rgba(21,55,31,0.72), rgba(9,8,6,0.94) 48%, rgba(19,13,7,0.88))"
                    : "linear-gradient(110deg, rgba(50,33,10,0.56), rgba(9,8,6,0.94) 48%, rgba(19,13,7,0.86))",
                boxShadow: dense ? "none" : "0 12px 30px rgba(0,0,0,0.25)",
                transition: "transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease",
                "&:hover": {
                    borderColor: isFriendLobby ? "rgba(85,216,120,0.64)" : "rgba(220,177,88,0.48)",
                    transform: "translateY(-1px)",
                    boxShadow: dense ? "none" : "0 16px 38px rgba(0,0,0,0.34)",
                },
            }}
        >
            <Stack direction="row" spacing={{ xs: 1, sm: 1.35 }} alignItems="center">
                <LeagueEmblem league={league} wealth={wealth} label={standing} size={dense ? 48 : 64} />

                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                        <Typography
                            level={dense ? "title-sm" : "title-md"}
                            noWrap
                            title={roomName}
                            sx={{ minWidth: 0, color: hocColors.parchment, fontWeight: 800 }}
                        >
                            {roomName}
                        </Typography>
                        {isFriendLobby ? (
                            <Typography
                                level="body-xs"
                                sx={{
                                    ...arenaBadgeSx,
                                    flexShrink: 0,
                                    py: 0.2,
                                    color: hocColors.green,
                                    borderColor: "rgba(85,216,120,0.3)",
                                    bgcolor: "rgba(85,216,120,0.08)",
                                }}
                            >
                                {t("Friend")}
                            </Typography>
                        ) : null}
                    </Stack>

                    <Typography level="body-xs" noWrap sx={{ mt: 0.2, color: hocColors.muted }}>
                        {t("Hosted by")}{" "}
                        <Box component="span" sx={{ color: hocColors.gold, fontWeight: 700 }}>
                            {host?.username ?? t("Player")}
                        </Box>
                        {` · ${standing} · ${lobbyAgeLabel(lobby.created_time)} ${t("ago")}`}
                    </Typography>

                    {!dense && stats ? (
                        <Stack
                            direction="row"
                            spacing={1.2}
                            alignItems="center"
                            sx={{ mt: 0.65, color: hocColors.muted }}
                        >
                            <Typography level="body-xs" sx={{ color: "inherit", fontVariantNumeric: "tabular-nums" }}>
                                {whole(stats.leaderboardRank) > 0 ? `#${whole(stats.leaderboardRank)} · ` : ""}
                                {whole(stats.mmr).toLocaleString()} MMR
                            </Typography>
                            <Stack direction="row" spacing={0.35} alignItems="center">
                                <CurrencyIcon iconSvg={currency.iconSvg} size={14} />
                                <Typography level="body-xs" sx={{ color: hocColors.gold, fontWeight: 800 }}>
                                    {whole(stats.gold).toLocaleString()} {currency.symbol}
                                </Typography>
                            </Stack>
                        </Stack>
                    ) : null}
                </Box>

                <Stack spacing={0.65} alignItems="flex-end" sx={{ flexShrink: 0 }}>
                    {!dense ? (
                        <Typography
                            level="body-xs"
                            sx={{
                                ...arenaBadgeSx,
                                color: lobby.status === LobbyStatus.LOBBY_OPEN ? hocColors.green : hocColors.muted,
                            }}
                        >
                            {lobby.status === LobbyStatus.LOBBY_OPEN ? t("Open") : t("Full")}
                        </Typography>
                    ) : null}
                    <Button
                        size="sm"
                        sx={{
                            ...hocSoftButtonSx,
                            minWidth: dense ? 62 : 84,
                            color: isFriendLobby ? hocColors.green : hocColors.parchment,
                        }}
                        disabled={lobby.status !== LobbyStatus.LOBBY_OPEN}
                        onClick={onJoin}
                    >
                        {t("Join")}
                    </Button>
                </Stack>
            </Stack>
        </Sheet>
    );
};
