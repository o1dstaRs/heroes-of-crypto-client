import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import { Box, Button, CircularProgress, Sheet, Stack, Typography } from "@mui/joy";
import React, { useMemo } from "react";
import { useNavigate } from "react-router";

import { hocColors, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "../hocTheme";
import { MatchHistory } from "./MatchHistory";
import { matchReplayPath } from "./matchHistoryModel";
import {
    CreatureIcon,
    creatureName,
    factionName,
    streakLabel,
    timeAgo,
    winRateColor,
    winRatePct,
    WinRateBar,
} from "./portalFormat";
import { usePlayerPortal } from "./usePlayerPortal";

const profileBackgroundUrl = new URL("../../../images/background_dark.webp", import.meta.url).toString();
const logoUrl = new URL("../../../images/logo_hoc.webp", import.meta.url).toString();

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
    title,
    subtitle,
    children,
}) => (
    <Sheet
        variant="outlined"
        sx={{
            p: { xs: 1.5, sm: 2.25 },
            minWidth: 0,
            borderRadius: "16px",
            ...hocPanelSx,
            bgcolor: "rgba(12,8,5,0.91)",
            borderColor: "rgba(255,143,0,0.27)",
            backdropFilter: "blur(14px)",
        }}
    >
        <Box sx={{ mb: 1.25 }}>
            <Typography level="title-md" textColor={hocColors.gold}>
                {title}
            </Typography>
            {subtitle && (
                <Typography level="body-xs" textColor={hocColors.muted}>
                    {subtitle}
                </Typography>
            )}
        </Box>
        {children}
    </Sheet>
);

const StatCard: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color }) => (
    <Sheet
        variant="soft"
        sx={{
            bgcolor: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(239,228,204,0.08)",
            borderRadius: "12px",
            p: 1.5,
            minWidth: 110,
            textAlign: "center",
        }}
    >
        <Typography level="h2" sx={{ color: color ?? hocColors.parchment, lineHeight: 1.1 }}>
            {value}
        </Typography>
        <Typography level="body-xs" textColor={hocColors.muted}>
            {label}
        </Typography>
    </Sheet>
);

const ComboRow: React.FC<{ creatureIds: number[]; games: number; wins: number }> = ({ creatureIds, games, wins }) => (
    <Sheet
        variant="soft"
        sx={{
            bgcolor: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(239,228,204,0.06)",
            borderRadius: "10px",
            p: 1,
            display: "flex",
            alignItems: "center",
            gap: 1,
        }}
    >
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", flex: 1 }}>
            {creatureIds.map((id, i) => (
                <CreatureIcon key={`${id}_${i}`} creatureId={id} size={30} />
            ))}
        </Stack>
        <Typography level="body-xs" textColor={hocColors.muted} sx={{ minWidth: 56, textAlign: "right" }}>
            {games} game{games === 1 ? "" : "s"}
        </Typography>
        <WinRateBar wins={wins} games={games} width={110} />
    </Sheet>
);

export const PlayerPortalPage: React.FC = () => {
    const navigate = useNavigate();
    const { data, loading, error, reload } = usePlayerPortal();

    const combos = data?.combos ?? [];
    const bestCombos = useMemo(
        () =>
            [...combos]
                .filter((c) => (c.games ?? 0) >= 2)
                .sort((a, b) => winRatePct(b.wins ?? 0, b.games ?? 0) - winRatePct(a.wins ?? 0, a.games ?? 0))
                .slice(0, 6),
        [combos],
    );
    const mostPlayedCombos = useMemo(() => [...combos].slice(0, 6), [combos]);
    const creatureStats = (data?.creature_stats ?? []).slice(0, 14);
    const factionStats = data?.faction_stats ?? [];
    const matches = data?.recent_matches ?? [];
    const overallPct = data ? winRatePct(data.wins ?? 0, data.total_games_played ?? 0) : 0;

    return (
        <Box
            sx={{
                position: "fixed",
                inset: 0,
                bgcolor: hocColors.black,
                overflowY: "auto",
                px: { xs: 1.5, md: 3 },
                py: { xs: 1.5, md: 2.5 },
                backgroundImage: `linear-gradient(112deg, rgba(7,5,4,0.97), rgba(7,5,4,0.89) 52%, rgba(7,5,4,0.96)), url(${profileBackgroundUrl})`,
                backgroundPosition: "center top",
                backgroundSize: "cover",
                backgroundAttachment: "fixed",
            }}
        >
            <Box sx={{ maxWidth: 1480, mx: "auto" }}>
                <Sheet
                    component="header"
                    variant="outlined"
                    sx={{
                        mb: 2,
                        p: { xs: 1.5, sm: 2 },
                        borderRadius: "18px",
                        ...hocPanelSx,
                        bgcolor: "rgba(9,6,4,0.85)",
                        borderColor: "rgba(255,143,0,0.25)",
                        boxShadow: "0 18px 48px rgba(0,0,0,0.42)",
                        backdropFilter: "blur(16px)",
                    }}
                >
                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        alignItems={{ xs: "stretch", sm: "center" }}
                        justifyContent="space-between"
                        spacing={1.5}
                        sx={{ minWidth: 0 }}
                    >
                        <Stack direction="row" spacing={1.35} alignItems="center" sx={{ minWidth: 0 }}>
                            <Box
                                component="img"
                                src={logoUrl}
                                alt="Heroes of Crypto"
                                sx={{
                                    width: { xs: 46, sm: 56 },
                                    height: { xs: 46, sm: 56 },
                                    flexShrink: 0,
                                    objectFit: "contain",
                                    filter: "drop-shadow(0 0 10px #ff8f0055)",
                                }}
                            />
                            <Box sx={{ minWidth: 0 }}>
                                <Typography
                                    level="body-xs"
                                    sx={{ color: hocColors.gold, fontWeight: 800, letterSpacing: "0.16em" }}
                                >
                                    COMMANDER PROFILE
                                </Typography>
                                <Typography
                                    level="h2"
                                    sx={{ color: hocColors.parchment, overflowWrap: "anywhere", lineHeight: 1.05 }}
                                >
                                    {data?.username || "Player Profile"}
                                </Typography>
                                <Typography level="body-sm" textColor={hocColors.muted} sx={{ mt: 0.3 }}>
                                    {streakLabel(data?.current_streak ?? 0)}
                                    {data?.best_win_streak ? ` · best win streak ${data.best_win_streak}` : ""}
                                    {data?.last_login ? ` · last seen ${timeAgo(data.last_login)}` : ""}
                                </Typography>
                            </Box>
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ alignSelf: { xs: "stretch", sm: "center" } }}>
                            <Button
                                fullWidth
                                variant="soft"
                                startDecorator={<RefreshRoundedIcon />}
                                sx={{ ...hocSoftButtonSx, minWidth: { sm: 126 }, whiteSpace: "nowrap" }}
                                onClick={reload}
                                disabled={loading}
                            >
                                Refresh
                            </Button>
                            <Button
                                fullWidth
                                variant="solid"
                                startDecorator={<SportsEsportsRoundedIcon />}
                                sx={{ ...hocPrimaryButtonSx, minWidth: { sm: 154 }, whiteSpace: "nowrap" }}
                                onClick={() => navigate("/play")}
                            >
                                Ranked arena
                            </Button>
                        </Stack>
                    </Stack>
                </Sheet>

                {loading && (
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 6, justifyContent: "center" }}>
                        <CircularProgress />
                        <Typography textColor={hocColors.muted}>Loading your profile…</Typography>
                    </Stack>
                )}
                {!loading && error && (
                    <Sheet variant="outlined" sx={{ p: 2, ...hocPanelSx }}>
                        <Typography textColor={hocColors.danger}>{error}</Typography>
                    </Sheet>
                )}

                {!loading && !error && data && (
                    <Stack spacing={2}>
                        {/* Overview */}
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: {
                                    xs: "repeat(2, minmax(0, 1fr))",
                                    sm: "repeat(3, minmax(0, 1fr))",
                                    lg: "repeat(6, minmax(0, 1fr))",
                                },
                                gap: 1.25,
                            }}
                        >
                            <StatCard label="Wins" value={data.wins ?? 0} color="#46d160" />
                            <StatCard label="Losses" value={data.losses ?? 0} color="#ff5a5a" />
                            <StatCard label="Win rate" value={`${overallPct}%`} color={winRateColor(overallPct)} />
                            <StatCard label="Games" value={data.total_games_played ?? 0} />
                            <StatCard
                                label="Current streak"
                                value={Math.abs(data.current_streak ?? 0)}
                                color={(data.current_streak ?? 0) >= 0 ? "#46d160" : "#ff5a5a"}
                            />
                            <StatCard label="Best streak" value={data.best_win_streak ?? 0} color={hocColors.gold} />
                        </Box>

                        {/* Combos & strategies */}
                        <Box
                            sx={{
                                display: "grid",
                                gap: 2,
                                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                            }}
                        >
                            <Section title="Favourite combos" subtitle="Your most-played creature line-ups">
                                <Stack spacing={0.75}>
                                    {mostPlayedCombos.length === 0 && (
                                        <Typography level="body-sm" textColor={hocColors.muted}>
                                            Play a few matches to build up combo stats.
                                        </Typography>
                                    )}
                                    {mostPlayedCombos.map((c, i) => (
                                        <ComboRow
                                            key={`mp_${i}`}
                                            creatureIds={c.creature_ids ?? []}
                                            games={c.games ?? 0}
                                            wins={c.wins ?? 0}
                                        />
                                    ))}
                                </Stack>
                            </Section>

                            <Section title="Best winning strategies" subtitle="Highest win rate (2+ games)">
                                <Stack spacing={0.75}>
                                    {bestCombos.length === 0 && (
                                        <Typography level="body-sm" textColor={hocColors.muted}>
                                            Not enough repeated line-ups yet.
                                        </Typography>
                                    )}
                                    {bestCombos.map((c, i) => (
                                        <ComboRow
                                            key={`bc_${i}`}
                                            creatureIds={c.creature_ids ?? []}
                                            games={c.games ?? 0}
                                            wins={c.wins ?? 0}
                                        />
                                    ))}
                                </Stack>
                            </Section>
                        </Box>

                        {/* Creature & faction stats */}
                        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" } }}>
                            <Section title="Creatures" subtitle="Win rate by creature you field">
                                <Stack spacing={0.5}>
                                    {creatureStats.length === 0 && (
                                        <Typography level="body-sm" textColor={hocColors.muted}>
                                            No creature stats yet.
                                        </Typography>
                                    )}
                                    {creatureStats.map((stat) => (
                                        <Box
                                            key={stat.creature_id}
                                            sx={{ display: "flex", alignItems: "center", gap: 1 }}
                                        >
                                            <CreatureIcon creatureId={stat.creature_id ?? 0} size={28} />
                                            <Typography
                                                level="body-sm"
                                                noWrap
                                                textColor={hocColors.mutedStrong}
                                                sx={{ flex: 1, minWidth: 0 }}
                                            >
                                                {creatureName(stat.creature_id ?? 0)}
                                            </Typography>
                                            <Typography
                                                level="body-xs"
                                                textColor={hocColors.muted}
                                                sx={{ minWidth: 50, textAlign: "right" }}
                                            >
                                                {stat.games ?? 0} g
                                            </Typography>
                                            <WinRateBar wins={stat.wins ?? 0} games={stat.games ?? 0} width={120} />
                                        </Box>
                                    ))}
                                </Stack>
                            </Section>

                            <Section title="Factions" subtitle="Win rate by faction fielded">
                                <Stack spacing={0.5}>
                                    {factionStats.length === 0 && (
                                        <Typography level="body-sm" textColor={hocColors.muted}>
                                            No faction stats yet.
                                        </Typography>
                                    )}
                                    {factionStats.map((stat) => (
                                        <Box key={stat.faction} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                            <Typography
                                                level="body-sm"
                                                textColor={hocColors.mutedStrong}
                                                sx={{ flex: 1 }}
                                            >
                                                {factionName(stat.faction ?? 0)}
                                            </Typography>
                                            <Typography
                                                level="body-xs"
                                                textColor={hocColors.muted}
                                                sx={{ minWidth: 50, textAlign: "right" }}
                                            >
                                                {stat.games ?? 0} g
                                            </Typography>
                                            <WinRateBar wins={stat.wins ?? 0} games={stat.games ?? 0} width={110} />
                                        </Box>
                                    ))}
                                </Stack>
                            </Section>
                        </Box>

                        {/* Match history */}
                        <Section title="Match history" subtitle={`${matches.length} most recent finished matches`}>
                            <MatchHistory
                                filterable
                                matches={matches}
                                onReplay={(match) => navigate(matchReplayPath(match))}
                            />
                        </Section>
                    </Stack>
                )}
            </Box>
        </Box>
    );
};
