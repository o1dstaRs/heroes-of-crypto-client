import LanguageRoundedIcon from "@mui/icons-material/LanguageRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import { Box, Button, CircularProgress, Option, Select, Sheet, Stack, Typography } from "@mui/joy";
import { Artifact } from "@heroesofcrypto/common";
import React, { useMemo } from "react";
import { useNavigate } from "react-router";

import { SUPPORTED_LANGUAGES, setLanguage, t, tf, useTranslation } from "../../i18n/i18n";

import { images } from "../../generated/image_imports";
import { CurrencyIcon } from "../GoldCurrencyIcon";
import { hocColors, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "../hocTheme";
import { LeagueTransitionReveal } from "../LeagueTransitionReveal";
import { useRankedSeason } from "../useRankedSeason";
import { MatchHistory } from "./MatchHistory";
import { matchReplayPath, normalizeMatchSetup } from "./matchHistoryModel";
import { CreatureIcon, creatureName, timeAgo, winRateColor, winRatePct } from "./portalFormat";
import { CalibrationProgress } from "./CalibrationProgress";
import { usePlayerPortal } from "./usePlayerPortal";
import { useRankedStanding } from "./useRankedStanding";

const profileBackgroundUrl = new URL("../../../images/background_dark.webp", import.meta.url).toString();
const logoUrl = new URL("../../../images/logo_hoc.webp", import.meta.url).toString();
const portalScrollSx = {
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(220,177,88,0.68) rgba(7,5,4,0.72)",
    "&::-webkit-scrollbar": {
        width: "8px",
        height: "8px",
    },
    "&::-webkit-scrollbar-track": {
        borderRadius: "999px",
        background: "rgba(7,5,4,0.72)",
    },
    "&::-webkit-scrollbar-thumb": {
        border: "2px solid rgba(7,5,4,0.9)",
        borderRadius: "999px",
        background: "rgba(220,177,88,0.68)",
    },
    "&::-webkit-scrollbar-thumb:hover": {
        background: "rgba(239,212,154,0.84)",
    },
    "&::-webkit-scrollbar-corner": {
        background: "transparent",
    },
    "@media (forced-colors: active)": {
        scrollbarColor: "auto",
    },
} as const;

const nestedPortalScrollSx = {
    ...portalScrollSx,
    overflowX: "hidden",
    pr: 0.5,
    "&:focus-visible": {
        outline: `2px solid ${hocColors.gold}`,
        outlineOffset: "3px",
    },
} as const;

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

type RecentFormMatch = { draw?: boolean; won?: boolean };
type RecentFormResult = "draw" | "empty" | "loss" | "win";

const RecentForm: React.FC<{ matches: readonly RecentFormMatch[] }> = ({ matches }) => {
    const results: RecentFormResult[] = matches
        .slice(0, 10)
        .map((match) => (match.draw ? "draw" : match.won ? "win" : "loss"))
        .reverse();
    const padded: RecentFormResult[] = [
        ...Array<RecentFormResult>(Math.max(0, 10 - results.length)).fill("empty"),
        ...results,
    ];
    const wins = results.filter((result) => result === "win").length;
    const draws = results.filter((result) => result === "draw").length;
    const losses = results.filter((result) => result === "loss").length;
    const labels: Record<RecentFormResult, string> = {
        draw: t("Draw"),
        empty: t("No result"),
        loss: t("Defeat"),
        win: t("Victory"),
    };
    const colors: Record<RecentFormResult, { background: string; border: string; shadow?: string }> = {
        draw: { background: "#8f99a4", border: "rgba(174,181,190,0.72)" },
        empty: { background: "rgba(239,228,204,0.08)", border: "rgba(239,228,204,0.2)" },
        loss: { background: "#ff5a5a", border: "rgba(255,90,90,0.8)", shadow: "0 0 7px rgba(255,90,90,0.24)" },
        win: { background: "#46d160", border: "rgba(70,209,96,0.78)", shadow: "0 0 7px rgba(70,209,96,0.28)" },
    };

    return (
        <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 0.25, sm: 0.85 }}
            alignItems={{ xs: "flex-start", sm: "center" }}
            sx={{ mt: 0.7, minWidth: 0 }}
        >
            <Typography level="body-xs" textColor={hocColors.muted} sx={{ flexShrink: 0 }}>
                {t("Recent form")}
            </Typography>
            <Stack
                component="span"
                role="img"
                aria-label={`${t("Recent form")}: ${wins} ${t("Wins")}, ${draws} ${t("Draw")}, ${losses} ${t("Losses")}`}
                direction="row"
                spacing={0.65}
                alignItems="center"
                sx={{ minHeight: 22 }}
            >
                {padded.map((result, index) => (
                    <Box
                        component="i"
                        key={`${index}:${result}`}
                        title={labels[result]}
                        aria-hidden="true"
                        sx={{
                            display: "block",
                            width: 12,
                            height: 12,
                            flexShrink: 0,
                            border: `1px solid ${colors[result].border}`,
                            borderRadius: "50%",
                            bgcolor: colors[result].background,
                            boxShadow: colors[result].shadow ?? "inset 0 0 0 2px rgba(0,0,0,0.18)",
                        }}
                    />
                ))}
            </Stack>
        </Stack>
    );
};

/** Tier-aware artifact lookup for the stats row: name + codex icon, straight from the shared catalog. */
export const playerPortalArtifactInfo = (tier: 1 | 2, artifactId: number): Artifact.ArtifactProperties | undefined =>
    tier === 1
        ? Artifact.TIER1_ARTIFACTS[artifactId as Artifact.Tier1Artifact]
        : Artifact.TIER2_ARTIFACTS[artifactId as Artifact.Tier2Artifact];

export const playerPortalCreatureLineupLabel = (creatureIds: readonly number[]): string =>
    [...new Set(creatureIds)].map(creatureName).join(" + ");

type PortalUsageStat = { games?: number | null; wins?: number | null };

export function playerPortalMostPlayedFirst<T extends PortalUsageStat>(stats: readonly T[]): T[] {
    return [...stats].sort(
        (a, b) =>
            (b.games ?? 0) - (a.games ?? 0) ||
            winRatePct(b.wins ?? 0, b.games ?? 0) - winRatePct(a.wins ?? 0, a.games ?? 0),
    );
}

const compactArtworkSx = {
    width: 36,
    height: 36,
    flex: "0 0 36px",
    border: "1px solid rgba(220,177,88,0.28)",
    borderRadius: "6px",
    bgcolor: "rgba(0,0,0,0.35)",
    objectFit: "cover",
} as const;

const StrategyStatCard: React.FC<{
    artwork: React.ReactNode;
    badge?: string;
    games: number;
    label: string;
    wins: number;
}> = ({ artwork, badge, games, label, wins }) => {
    const pct = winRatePct(wins, games);
    const strong = pct >= 55;
    const weak = pct <= 45;
    const gamesLabel = games === 1 ? tf("{count} game", { count: games }) : tf("{count} games", { count: games });

    return (
        <Sheet
            component="article"
            variant="soft"
            aria-label={`${label}: ${gamesLabel}, ${pct}%`}
            sx={{
                display: "grid",
                gridTemplateColumns: "auto minmax(0, 1fr) auto",
                alignItems: "center",
                gap: 1.4,
                minHeight: 68,
                py: 0.85,
                pr: 1.4,
                pl: 1,
                overflow: "hidden",
                border: "1px solid",
                borderColor: strong ? "rgba(70,209,96,0.2)" : weak ? "rgba(255,90,90,0.16)" : "rgba(239,228,204,0.08)",
                borderRadius: "8px",
                bgcolor: "rgba(0,0,0,0.27)",
                backgroundImage: strong
                    ? "linear-gradient(90deg, rgba(70,209,96,0.075), rgba(0,0,0,0.27) 44%)"
                    : "none",
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", minWidth: 54 }}>{artwork}</Box>
            <Box sx={{ display: "grid", gap: 0.15, minWidth: 0 }}>
                {badge && (
                    <Typography
                        level="body-xs"
                        sx={{ color: hocColors.gold, fontSize: "0.63rem", letterSpacing: "0.07em" }}
                    >
                        {badge}
                    </Typography>
                )}
                <Typography
                    level="body-sm"
                    title={label}
                    noWrap
                    sx={{ color: "rgba(251,244,232,0.9)", fontWeight: 600, lineHeight: 1.25 }}
                >
                    {label}
                </Typography>
                <Typography level="body-xs" sx={{ color: "rgba(251,244,232,0.42)" }}>
                    {gamesLabel}
                </Typography>
            </Box>
            <Typography
                level="body-sm"
                sx={{ color: winRateColor(pct), fontWeight: 700, whiteSpace: "nowrap", textAlign: "right" }}
            >
                {pct}%
            </Typography>
        </Sheet>
    );
};

const CompactStatRow: React.FC<{
    artwork: React.ReactNode;
    badge?: string;
    games: number;
    label: string;
    wins: number;
}> = ({ artwork, badge, games, label, wins }) => {
    const pct = winRatePct(wins, games);
    const gamesLabel = games === 1 ? tf("{count} game", { count: games }) : tf("{count} games", { count: games });
    const color = winRateColor(pct);

    return (
        <Sheet
            component="article"
            variant="plain"
            aria-label={`${label}: ${gamesLabel}, ${pct}%`}
            sx={{
                display: "grid",
                gridTemplateColumns: "36px minmax(0, 1fr) auto",
                alignItems: "center",
                gap: 1,
                minHeight: 44,
                py: 0.4,
                px: 0.35,
                borderBottom: "1px solid rgba(239,228,204,0.055)",
                bgcolor: "transparent",
                transition: "background-color 120ms ease",
                "&:hover": { bgcolor: "rgba(220,177,88,0.045)" },
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", minWidth: 36 }}>{artwork}</Box>
            <Typography level="body-sm" title={label} noWrap sx={{ color: "rgba(251,244,232,0.82)", fontWeight: 500 }}>
                {label}
            </Typography>
            <Stack direction="row" spacing={{ xs: 0.75, sm: 1 }} alignItems="center" sx={{ whiteSpace: "nowrap" }}>
                {badge && (
                    <Typography
                        level="body-xs"
                        sx={{ minWidth: 20, color: hocColors.gold, fontSize: "0.65rem", textAlign: "center" }}
                    >
                        {badge}
                    </Typography>
                )}
                <Typography level="body-xs" sx={{ minWidth: 50, color: hocColors.muted, textAlign: "right" }}>
                    {gamesLabel}
                </Typography>
                <Box
                    aria-hidden="true"
                    sx={{
                        display: { xs: "none", sm: "block" },
                        width: 62,
                        height: 7,
                        overflow: "hidden",
                        borderRadius: "999px",
                        bgcolor: "rgba(239,228,204,0.1)",
                    }}
                >
                    <Box sx={{ width: `${pct}%`, height: "100%", borderRadius: "inherit", bgcolor: color }} />
                </Box>
                <Typography level="body-xs" sx={{ minWidth: 36, color, fontWeight: 700, textAlign: "right" }}>
                    {pct}%
                </Typography>
            </Stack>
        </Sheet>
    );
};

const CreatureStrategyArtwork: React.FC<{ creatureIds: readonly number[] }> = ({ creatureIds }) => {
    const uniqueIds = [...new Set(creatureIds)];
    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                minWidth: { xs: 46, sm: 54 },
                "& .MuiAvatar-root": { width: { xs: 46, sm: 54 }, height: { xs: 46, sm: 54 } },
            }}
        >
            {uniqueIds.map((id, index) => (
                <Box
                    key={id}
                    sx={{
                        ml: index === 0 ? 0 : { xs: "-27px", sm: "-24px" },
                        filter: index === 0 ? "none" : "drop-shadow(-4px 0 5px rgba(0,0,0,0.58))",
                    }}
                >
                    <CreatureIcon creatureId={id} size={54} />
                </Box>
            ))}
        </Box>
    );
};

const StrategyGroup: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({
    title,
    subtitle,
    children,
}) => (
    <Box component="section" sx={{ minWidth: 0 }}>
        <Typography
            level="body-xs"
            sx={{ color: hocColors.mutedStrong, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}
        >
            {title}
        </Typography>
        <Typography level="body-xs" textColor={hocColors.muted} sx={{ minHeight: "1.4em", mb: 1 }}>
            {subtitle}
        </Typography>
        <Stack spacing={0.75}>{children}</Stack>
    </Box>
);

const ArtifactStatRow: React.FC<{ tier: 1 | 2; artifactId: number; games: number; wins: number }> = ({
    tier,
    artifactId,
    games,
    wins,
}) => {
    const info = playerPortalArtifactInfo(tier, artifactId);
    const src = info ? (images as Record<string, string>)[info.imageKey] : undefined;
    // Artifact names come from the shared catalog and stay in English, like creature names do.
    const label = info?.name ?? tf("Artifact {id}", { id: artifactId });
    const artwork = src ? (
        <Box component="img" src={src} alt={label} sx={{ ...compactArtworkSx, objectFit: "contain" }} />
    ) : (
        <Box sx={{ ...compactArtworkSx, display: "grid", placeItems: "center", color: hocColors.gold }}>T{tier}</Box>
    );
    return <CompactStatRow artwork={artwork} badge={`T${tier}`} games={games} label={label} wins={wins} />;
};

const ComboRow: React.FC<{ creatureIds: number[]; games: number; wins: number }> = ({ creatureIds, games, wins }) => {
    const label = playerPortalCreatureLineupLabel(creatureIds);
    return (
        <StrategyStatCard
            artwork={<CreatureStrategyArtwork creatureIds={creatureIds} />}
            games={games}
            label={label}
            wins={wins}
        />
    );
};

export const PlayerPortalPage: React.FC = () => {
    const navigate = useNavigate();
    const { data, loading, error, reload } = usePlayerPortal();
    const standing = useRankedStanding(data?.total_games_played ?? 0);
    const { t, language } = useTranslation();
    const { currency, seasons } = useRankedSeason();

    const combos = data?.combos ?? [];
    const displayedCombos = useMemo(() => {
        const trios = combos.filter((combo) => new Set(combo.creature_ids ?? []).size === 3);
        return trios.length > 0 ? trios : combos.filter((combo) => new Set(combo.creature_ids ?? []).size > 3);
    }, [combos]);
    const bestCombos = useMemo(
        () =>
            [...displayedCombos]
                .filter((c) => (c.games ?? 0) >= 2)
                .sort((a, b) => winRatePct(b.wins ?? 0, b.games ?? 0) - winRatePct(a.wins ?? 0, a.games ?? 0))
                .slice(0, 6),
        [displayedCombos],
    );
    const mostPlayedCombos = useMemo(() => [...displayedCombos].slice(0, 6), [displayedCombos]);
    // Dense usage lists are ordered by sample size; win rate only breaks equal-game ties.
    const creatureStats = useMemo(() => playerPortalMostPlayedFirst(data?.creature_stats ?? []), [data]);
    const matches = data?.recent_matches ?? [];
    const totalGold = Math.max(0, Number(data?.gold ?? 0));
    // New payloads carry independently aggregated pairs. Keep deriving them from legacy full-lineup payloads
    // as a rollout fallback so the client and auth server can deploy in either order.
    const strongestPairs = useMemo(() => {
        const directPairs = combos
            .filter((combo) => new Set(combo.creature_ids ?? []).size === 2)
            .map((combo) => {
                const [a, b] = [...new Set(combo.creature_ids ?? [])].sort((x, y) => x - y);
                return { a, b, games: combo.games ?? 0, wins: combo.wins ?? 0 };
            });
        if (directPairs.length > 0) {
            return directPairs
                .filter((pair) => pair.games >= 3)
                .sort((x, y) => winRatePct(y.wins, y.games) - winRatePct(x.wins, x.games) || y.games - x.games)
                .slice(0, 8);
        }
        const byPair = new Map<string, { a: number; b: number; games: number; wins: number }>();
        for (const combo of combos) {
            const games = combo.games ?? 0;
            if (!games) {
                continue;
            }
            const wins = combo.wins ?? 0;
            const ids = [...new Set(combo.creature_ids ?? [])].sort((x, y) => x - y);
            for (let i = 0; i < ids.length; i += 1) {
                for (let j = i + 1; j < ids.length; j += 1) {
                    const key = `${ids[i]}:${ids[j]}`;
                    const entry = byPair.get(key) ?? { a: ids[i], b: ids[j], games: 0, wins: 0 };
                    entry.games += games;
                    entry.wins += wins;
                    byPair.set(key, entry);
                }
            }
        }
        return [...byPair.values()]
            .filter((pair) => pair.games >= 3)
            .sort((x, y) => winRatePct(y.wins, y.games) - winRatePct(x.wins, x.games) || y.games - x.games)
            .slice(0, 8);
    }, [combos]);
    // Artifact win rates across the recent-matches window (draws excluded, empty slots skipped).
    const artifactStats = useMemo(() => {
        const byArtifact = new Map<string, { tier: 1 | 2; artifactId: number; games: number; wins: number }>();
        for (const match of matches) {
            if (match.draw) {
                continue;
            }
            const setup = normalizeMatchSetup(match.player_setup);
            for (const [tier, artifactId] of [
                [1, setup.artifactTier1],
                [2, setup.artifactTier2],
            ] as const) {
                if (!artifactId) {
                    continue;
                }
                const key = `${tier}:${artifactId}`;
                const entry = byArtifact.get(key) ?? { tier, artifactId, games: 0, wins: 0 };
                entry.games += 1;
                entry.wins += match.won ? 1 : 0;
                byArtifact.set(key, entry);
            }
        }
        return playerPortalMostPlayedFirst([...byArtifact.values()]);
    }, [matches]);
    const overallPct = data ? winRatePct(data.wins ?? 0, data.total_games_played ?? 0) : 0;

    return (
        <Box
            sx={{
                position: "fixed",
                inset: 0,
                bgcolor: hocColors.black,
                overflowY: "auto",
                overflowX: "hidden",
                ...portalScrollSx,
                px: { xs: 1.5, md: 3 },
                py: { xs: 1.5, md: 2.5 },
                backgroundImage: `linear-gradient(112deg, rgba(7,5,4,0.97), rgba(7,5,4,0.89) 52%, rgba(7,5,4,0.96)), url(${profileBackgroundUrl})`,
                backgroundPosition: "center top",
                backgroundSize: "cover",
                backgroundAttachment: "fixed",
            }}
        >
            {import.meta.env.DEV && (
                <LeagueTransitionReveal active={false} enabled={false} gameId="portal-league-reveal-preview" />
            )}
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
                                    {t("COMMANDER PROFILE")}
                                </Typography>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
                                    <Typography
                                        level="h2"
                                        sx={{ color: hocColors.parchment, overflowWrap: "anywhere", lineHeight: 1.05 }}
                                    >
                                        {data?.username || t("Player Profile")}
                                    </Typography>
                                    {data ? (
                                        <Sheet
                                            variant="soft"
                                            aria-label={`${t(currency.name)}: ${totalGold.toLocaleString(language === "ru" ? "ru-RU" : "en-US")}`}
                                            title={`${t(currency.name)} (${currency.symbol})`}
                                            sx={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 0.45,
                                                px: 0.8,
                                                py: 0.3,
                                                border: "1px solid rgba(220,177,88,0.28)",
                                                borderRadius: "999px",
                                                bgcolor: "rgba(220,177,88,0.08)",
                                                color: hocColors.gold,
                                            }}
                                        >
                                            <CurrencyIcon iconSvg={currency.iconSvg} size={17} />
                                            <Typography level="body-sm" sx={{ color: "inherit", fontWeight: 800 }}>
                                                {totalGold.toLocaleString(language === "ru" ? "ru-RU" : "en-US")}{" "}
                                                {currency.symbol}
                                            </Typography>
                                        </Sheet>
                                    ) : null}
                                </Stack>
                                {data?.last_login ? (
                                    <Typography level="body-sm" textColor={hocColors.muted} sx={{ mt: 0.3 }}>
                                        {tf("last seen {when}", { when: timeAgo(data.last_login) })}
                                    </Typography>
                                ) : null}
                                <RecentForm matches={matches} />
                            </Box>
                        </Stack>
                        <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            sx={{ alignSelf: { xs: "stretch", sm: "center" } }}
                        >
                            {/* Language of preference (owner 2026-08-06): applies immediately to this
                                profile, the pick phase and the in-game chrome; persisted per browser. */}
                            <Select
                                value={language}
                                onChange={(_event, code) => {
                                    if (code) {
                                        setLanguage(code);
                                    }
                                }}
                                variant="soft"
                                startDecorator={<LanguageRoundedIcon />}
                                aria-label={t("Language")}
                                sx={{ ...hocSoftButtonSx, minWidth: { sm: 140 }, whiteSpace: "nowrap" }}
                            >
                                {SUPPORTED_LANGUAGES.map(({ code, label }) => (
                                    <Option key={code} value={code}>
                                        {label}
                                    </Option>
                                ))}
                            </Select>
                            <Button
                                fullWidth
                                variant="soft"
                                startDecorator={<RefreshRoundedIcon />}
                                sx={{ ...hocSoftButtonSx, minWidth: { sm: 126 }, whiteSpace: "nowrap" }}
                                onClick={reload}
                                disabled={loading}
                            >
                                {t("Refresh")}
                            </Button>
                            <Button
                                fullWidth
                                variant="solid"
                                startDecorator={<SportsEsportsRoundedIcon />}
                                sx={{ ...hocPrimaryButtonSx, minWidth: { sm: 154 }, whiteSpace: "nowrap" }}
                                onClick={() => navigate("/play")}
                            >
                                {t("Ranked arena")}
                            </Button>
                        </Stack>
                    </Stack>
                </Sheet>

                {loading && (
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 6, justifyContent: "center" }}>
                        <CircularProgress />
                        <Typography textColor={hocColors.muted}>{t("Loading your profile…")}</Typography>
                    </Stack>
                )}
                {!loading && error && (
                    <Sheet variant="outlined" sx={{ p: 2, ...hocPanelSx }}>
                        <Typography textColor={hocColors.danger}>{error}</Typography>
                    </Sheet>
                )}

                {!loading && !error && data && (
                    <Stack spacing={2}>
                        {/* Ladder standing first: while calibrating, "3 / 5 placement matches" is the
                            headline number — the lifetime totals below it are not the ranked story yet. */}
                        {standing && (
                            <Sheet variant="outlined" sx={{ p: { xs: 1.75, sm: 2.25 }, ...hocPanelSx }}>
                                <CalibrationProgress standing={standing} />
                            </Sheet>
                        )}
                        {/* Overview */}
                        <Box
                            sx={{
                                display: "grid",
                                gridTemplateColumns: {
                                    xs: "repeat(2, minmax(0, 1fr))",
                                    sm: "repeat(3, minmax(0, 1fr))",
                                    lg: "repeat(4, minmax(0, 1fr))",
                                },
                                gap: 1.25,
                            }}
                        >
                            <StatCard label={t("Wins")} value={data.wins ?? 0} color="#46d160" />
                            <StatCard label={t("Losses")} value={data.losses ?? 0} color="#ff5a5a" />
                            <StatCard label={t("Win rate")} value={`${overallPct}%`} color={winRateColor(overallPct)} />
                            <StatCard label={t("Games")} value={data.total_games_played ?? 0} />
                        </Box>

                        {/* The public profile's strategy-card language, consolidated into one panel so
                            line-ups, winning trios and duos read as one family rather than three widgets. */}
                        <Section title={t("Winning strategies")}>
                            <Box
                                sx={{
                                    display: "grid",
                                    gap: 2,
                                    gridTemplateColumns: {
                                        xs: "1fr",
                                        md: "repeat(2, minmax(0, 1fr))",
                                        lg: "repeat(3, minmax(0, 1fr))",
                                    },
                                }}
                            >
                                <StrategyGroup
                                    title={t("Favourite combos")}
                                    subtitle={t("Your most-played creature line-ups")}
                                >
                                    {mostPlayedCombos.length === 0 && (
                                        <Typography level="body-sm" textColor={hocColors.muted}>
                                            {t("Play a few matches to build up combo stats.")}
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
                                </StrategyGroup>

                                <StrategyGroup
                                    title={t("Best winning strategies")}
                                    subtitle={t("Highest win rate (2+ games)")}
                                >
                                    {bestCombos.length === 0 && (
                                        <Typography level="body-sm" textColor={hocColors.muted}>
                                            {t("Not enough repeated line-ups yet.")}
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
                                </StrategyGroup>

                                <StrategyGroup
                                    title={t("Strongest pairs")}
                                    subtitle={t("Creature duos that win together (3+ games)")}
                                >
                                    {strongestPairs.length === 0 && (
                                        <Typography level="body-sm" textColor={hocColors.muted}>
                                            {t("Field the same duo a few times to reveal your best pairings.")}
                                        </Typography>
                                    )}
                                    {strongestPairs.map((pair) => (
                                        <ComboRow
                                            key={`pair_${pair.a}_${pair.b}`}
                                            creatureIds={[pair.a, pair.b]}
                                            games={pair.games}
                                            wins={pair.wins}
                                        />
                                    ))}
                                </StrategyGroup>
                            </Box>
                        </Section>

                        {/* Usage-heavy records stay compact so games played, win rate and ranking scan quickly. */}
                        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                            <Section
                                title={t("Artifacts")}
                                subtitle={t("Most played first · win rate across recent matches")}
                            >
                                <Stack
                                    spacing={0.5}
                                    role="region"
                                    aria-label={t("Artifact statistics")}
                                    tabIndex={0}
                                    sx={{ maxHeight: 420, overflowY: "auto", ...nestedPortalScrollSx }}
                                >
                                    {artifactStats.length === 0 && (
                                        <Typography level="body-sm" textColor={hocColors.muted}>
                                            {t("Pick artifacts in ranked drafts to build up artifact stats.")}
                                        </Typography>
                                    )}
                                    {artifactStats.map((stat) => (
                                        <ArtifactStatRow
                                            key={`art_${stat.tier}_${stat.artifactId}`}
                                            tier={stat.tier}
                                            artifactId={stat.artifactId}
                                            games={stat.games}
                                            wins={stat.wins}
                                        />
                                    ))}
                                </Stack>
                            </Section>

                            <Section title={t("Creatures")} subtitle={t("Most played first · win rate by creature")}>
                                <Stack
                                    spacing={0.5}
                                    role="region"
                                    aria-label={t("Creature statistics")}
                                    tabIndex={0}
                                    sx={{ maxHeight: 420, overflowY: "auto", ...nestedPortalScrollSx }}
                                >
                                    {creatureStats.length === 0 && (
                                        <Typography level="body-sm" textColor={hocColors.muted}>
                                            {t("No creature stats yet.")}
                                        </Typography>
                                    )}
                                    {creatureStats.map((stat) => {
                                        const creatureId = stat.creature_id ?? 0;
                                        return (
                                            <CompactStatRow
                                                key={creatureId}
                                                artwork={<CreatureIcon creatureId={creatureId} size={36} />}
                                                games={stat.games ?? 0}
                                                label={creatureName(creatureId)}
                                                wins={stat.wins ?? 0}
                                            />
                                        );
                                    })}
                                </Stack>
                            </Section>
                        </Box>

                        {/* Match history */}
                        <Section
                            title={t("Match history")}
                            subtitle={tf("{count} most recent finished matches", { count: matches.length })}
                        >
                            <MatchHistory
                                filterable
                                matches={matches}
                                onReplay={(match) => navigate(matchReplayPath(match))}
                                seasons={seasons}
                            />
                        </Section>
                    </Stack>
                )}
            </Box>
        </Box>
    );
};
