import { Box, Button, Chip, CircularProgress, Divider, Sheet, Stack, Typography } from "@mui/joy";
import React, { useMemo } from "react";
import { useNavigate } from "react-router";

import { hocColors, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "../hocTheme";
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

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
    title,
    subtitle,
    children,
}) => (
    <Sheet variant="outlined" sx={{ p: 2, borderRadius: "md", ...hocPanelSx }}>
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
            borderRadius: "md",
            p: 1.5,
            minWidth: 110,
            flex: "1 1 110px",
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
        sx={{ bgcolor: "rgba(0,0,0,0.25)", borderRadius: "sm", p: 1, display: "flex", alignItems: "center", gap: 1 }}
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
        <Box sx={{ position: "fixed", inset: 0, bgcolor: hocColors.black, overflowY: "auto", px: { xs: 1.5, md: 4 }, py: 3 }}>
            <Box sx={{ maxWidth: 1200, mx: "auto" }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                    <Box>
                        <Typography level="h2" textColor={hocColors.gold}>
                            {data?.username || "Player Profile"}
                        </Typography>
                        <Typography level="body-sm" textColor={hocColors.muted}>
                            {streakLabel(data?.current_streak ?? 0)}
                            {data?.best_win_streak ? ` · best win streak ${data.best_win_streak}` : ""}
                            {data?.last_login ? ` · last seen ${timeAgo(data.last_login)}` : ""}
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                        <Button variant="soft" sx={hocSoftButtonSx} onClick={reload} disabled={loading}>
                            Refresh
                        </Button>
                        <Button variant="solid" sx={hocPrimaryButtonSx} onClick={() => navigate("/play")}>
                            Back
                        </Button>
                    </Stack>
                </Stack>

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
                        <Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap" }}>
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
                        </Stack>

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
                                        <Box
                                            key={stat.faction}
                                            sx={{ display: "flex", alignItems: "center", gap: 1 }}
                                        >
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
                            <Stack spacing={0.75}>
                                {matches.length === 0 && (
                                    <Typography level="body-sm" textColor={hocColors.muted}>
                                        No finished matches yet.
                                    </Typography>
                                )}
                                {matches.map((match) => (
                                    <Sheet
                                        key={match.game_id}
                                        variant="soft"
                                        sx={{
                                            bgcolor: "rgba(0,0,0,0.25)",
                                            borderRadius: "sm",
                                            p: 1,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 1.5,
                                            flexWrap: { xs: "wrap", md: "nowrap" },
                                        }}
                                    >
                                        <Chip
                                            size="sm"
                                            variant="solid"
                                            sx={{
                                                bgcolor: match.won ? "rgba(70,209,96,0.85)" : "rgba(255,90,90,0.85)",
                                                color: "#0b0b0b",
                                                fontWeight: 700,
                                                minWidth: 34,
                                            }}
                                        >
                                            {match.won ? "WIN" : "LOSS"}
                                        </Chip>
                                        <Typography
                                            level="body-sm"
                                            textColor={hocColors.mutedStrong}
                                            sx={{ minWidth: 130 }}
                                            noWrap
                                        >
                                            vs {match.opponent_username || "Unknown"}
                                            {match.abandoned ? " (abandoned)" : ""}
                                        </Typography>
                                        <Stack direction="row" spacing={0.5} sx={{ flex: 1, flexWrap: "wrap" }}>
                                            {(match.creature_ids ?? []).map((id, i) => (
                                                <CreatureIcon key={`me_${match.game_id}_${id}_${i}`} creatureId={id} size={24} />
                                            ))}
                                            {(match.opponent_creature_ids ?? []).length > 0 && (
                                                <>
                                                    <Divider orientation="vertical" sx={{ mx: 0.5 }} />
                                                    {(match.opponent_creature_ids ?? []).map((id, i) => (
                                                        <Box
                                                            key={`op_${match.game_id}_${id}_${i}`}
                                                            sx={{ opacity: 0.55 }}
                                                        >
                                                            <CreatureIcon creatureId={id} size={24} />
                                                        </Box>
                                                    ))}
                                                </>
                                            )}
                                        </Stack>
                                        <Typography
                                            level="body-xs"
                                            textColor={hocColors.muted}
                                            sx={{ minWidth: 64, textAlign: "right" }}
                                        >
                                            {timeAgo(match.finished_time ?? 0)}
                                        </Typography>
                                    </Sheet>
                                ))}
                            </Stack>
                        </Section>
                    </Stack>
                )}
            </Box>
        </Box>
    );
};
