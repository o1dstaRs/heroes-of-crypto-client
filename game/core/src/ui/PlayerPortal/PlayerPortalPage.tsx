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
import { useRankedSeason } from "../useRankedSeason";
import { MatchHistory } from "./MatchHistory";
import { matchReplayPath, normalizeMatchSetup } from "./matchHistoryModel";
import { CreatureIcon, creatureName, timeAgo, winRateColor, winRatePct, WinRateBar } from "./portalFormat";
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
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {src ? (
                <Box
                    component="img"
                    src={src}
                    alt={label}
                    sx={{ width: 28, height: 28, objectFit: "contain", borderRadius: "6px", flexShrink: 0 }}
                />
            ) : (
                <Box sx={{ width: 28, height: 28, flexShrink: 0 }} />
            )}
            <Typography level="body-sm" noWrap textColor={hocColors.mutedStrong} sx={{ flex: 1, minWidth: 0 }}>
                {label}
            </Typography>
            <Typography level="body-xs" textColor={hocColors.muted} sx={{ minWidth: 30, textAlign: "right" }}>
                T{tier}
            </Typography>
            <Typography level="body-xs" textColor={hocColors.muted} sx={{ minWidth: 50, textAlign: "right" }}>
                {tf("{count} g", { count: games })}
            </Typography>
            <WinRateBar wins={wins} games={games} width={110} />
        </Box>
    );
};

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
            {games === 1 ? tf("{count} game", { count: games }) : tf("{count} games", { count: games })}
        </Typography>
        <WinRateBar wins={wins} games={games} width={110} />
    </Sheet>
);

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
    // ALL creatures, best win rate first (ties: more games first) — the list scrolls instead of cutting off.
    const creatureStats = useMemo(
        () =>
            [...(data?.creature_stats ?? [])].sort(
                (a, b) =>
                    winRatePct(b.wins ?? 0, b.games ?? 0) - winRatePct(a.wins ?? 0, a.games ?? 0) ||
                    (b.games ?? 0) - (a.games ?? 0),
            ),
        [data],
    );
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
        return [...byArtifact.values()].sort(
            (x, y) => winRatePct(y.wins, y.games) - winRatePct(x.wins, x.games) || y.games - x.games,
        );
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

                        {/* Combos & strategies */}
                        <Box
                            sx={{
                                display: "grid",
                                gap: 2,
                                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                            }}
                        >
                            <Section title={t("Favourite combos")} subtitle={t("Your most-played creature line-ups")}>
                                <Stack spacing={0.75}>
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
                                </Stack>
                            </Section>

                            <Section title={t("Best winning strategies")} subtitle={t("Highest win rate (2+ games)")}>
                                <Stack spacing={0.75}>
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
                                </Stack>
                            </Section>
                        </Box>

                        {/* Pairs & artifacts */}
                        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                            <Section
                                title={t("Strongest pairs")}
                                subtitle={t("Creature duos that win together (3+ games)")}
                            >
                                <Stack spacing={0.75}>
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
                                </Stack>
                            </Section>

                            <Section
                                title={t("Artifacts")}
                                subtitle={t("Win rate by artifact across your recent matches")}
                            >
                                <Stack
                                    spacing={0.5}
                                    role="region"
                                    aria-label={t("Artifact statistics")}
                                    tabIndex={0}
                                    sx={{ maxHeight: 340, overflowY: "auto", ...nestedPortalScrollSx }}
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
                        </Box>

                        <Section title={t("Creatures")} subtitle={t("Win rate by creature you field — best first")}>
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
                                {creatureStats.map((stat) => (
                                    <Box key={stat.creature_id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
                                            {tf("{count} g", { count: stat.games ?? 0 })}
                                        </Typography>
                                        <WinRateBar wins={stat.wins ?? 0} games={stat.games ?? 0} width={120} />
                                    </Box>
                                ))}
                            </Stack>
                        </Section>

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
