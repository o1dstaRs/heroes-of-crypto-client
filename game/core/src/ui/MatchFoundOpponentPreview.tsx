import { Box, Sheet, Skeleton, Stack, Typography } from "@mui/joy";
import React from "react";

import type { RankedSeasonCurrency } from "../api/ranked_season_client";
import type { PublicPlayerStats } from "../api/social_client";
import { t } from "../i18n/i18n";
import { standingLabel } from "../i18n/standing";
import { CurrencyIcon } from "./GoldCurrencyIcon";
import { hocColors, hocDisplayFontFamily } from "./hocTheme";
import { LeagueEmblem } from "./PlayerPortal/LeagueEmblem";

export interface MatchFoundOpponentPreviewProps {
    accepted: boolean;
    currency: Readonly<RankedSeasonCurrency>;
    language: string;
    loading: boolean;
    stats: PublicPlayerStats | null;
}

const whole = (value: number | undefined): number => Math.max(0, Math.trunc(Number(value) || 0));

const MatchMetric: React.FC<{
    children: React.ReactNode;
    label: string;
}> = ({ children, label }) => (
    <Box
        sx={{
            minWidth: 0,
            px: { xs: 1.1, sm: 1.35 },
            py: { xs: 1, sm: 0.35 },
            textAlign: { xs: "left", sm: "center" },
            borderLeft: "1px solid rgba(239,228,204,0.1)",
            "&:first-of-type": { borderLeft: 0 },
            "&:nth-of-type(odd)": { borderLeft: { xs: 0, sm: "1px solid rgba(239,228,204,0.1)" } },
            "&:nth-of-type(n + 3)": {
                borderTop: { xs: "1px solid rgba(239,228,204,0.08)", sm: 0 },
            },
            "&:last-of-type": {
                gridColumn: { xs: "1 / -1", sm: "auto" },
            },
        }}
    >
        <Typography
            level="body-xs"
            sx={{ color: hocColors.muted, fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase" }}
        >
            {label}
        </Typography>
        <Box sx={{ mt: 0.3, color: hocColors.parchment, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            {children}
        </Box>
    </Box>
);

/** The accept-window dossier: enough information to recognize and size up the rival at one glance. */
export const MatchFoundOpponentPreview: React.FC<MatchFoundOpponentPreviewProps> = ({
    accepted,
    currency,
    language,
    loading,
    stats,
}) => {
    const locale = language === "ru" ? "ru-RU" : "en-US";
    const number = new Intl.NumberFormat(locale);

    if (!stats) {
        return (
            <Sheet
                variant="outlined"
                sx={{
                    width: "100%",
                    maxWidth: 820,
                    mt: 2.2,
                    p: { xs: 1.5, sm: 2 },
                    borderRadius: "12px",
                    borderColor: "rgba(220,177,88,0.2)",
                    bgcolor: "rgba(8,7,6,0.76)",
                }}
            >
                <Stack direction="row" spacing={1.4} alignItems="center">
                    <Skeleton variant="circular" width={68} height={68} animation={loading ? "pulse" : false} />
                    <Box sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                        {loading ? (
                            <>
                                <Skeleton width="38%" />
                                <Skeleton width="62%" />
                            </>
                        ) : (
                            <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                                {t("Opponent profile unavailable")}
                            </Typography>
                        )}
                    </Box>
                    {loading ? (
                        <Typography level="body-xs" sx={{ color: hocColors.gold }}>
                            {t("Reading opponent record…")}
                        </Typography>
                    ) : null}
                </Stack>
            </Sheet>
        );
    }

    const placed = stats.state === "placed";
    const league = placed ? whole(stats.league) : 0;
    const wealth = placed ? whole(stats.wealth) : 0;
    const standing = placed
        ? standingLabel(wealth, stats.wealthName ?? "", stats.leagueName ?? stats.standingTitle ?? "")
        : `${t("Calibrating")} ${whole(stats.calibration?.gamesPlayed)} / ${Math.max(1, whole(stats.calibration?.required))}`;
    const wins = whole(stats.wins);
    const losses = whole(stats.losses);
    const draws = whole(stats.draws);
    const winRate = Math.max(0, Math.min(100, Number(stats.winRatePct) || 0));
    const leaderboardRank = whole(stats.leaderboardRank);

    return (
        <Sheet
            variant="outlined"
            aria-label={`${t("OPPONENT FOUND")}: ${stats.username}`}
            sx={{
                position: "relative",
                width: "100%",
                maxWidth: 820,
                mt: 2.2,
                overflow: "hidden",
                borderRadius: "14px",
                borderColor: accepted ? "rgba(85,216,120,0.34)" : "rgba(255,209,102,0.36)",
                background: accepted
                    ? "linear-gradient(118deg, rgba(19,48,28,0.82), rgba(8,8,7,0.96) 52%, rgba(14,12,8,0.92))"
                    : "linear-gradient(118deg, rgba(58,39,12,0.78), rgba(8,8,7,0.96) 52%, rgba(22,14,7,0.92))",
                boxShadow: accepted
                    ? "0 18px 44px rgba(0,0,0,0.38), inset 0 1px 0 rgba(165,255,185,0.055)"
                    : "0 18px 44px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,231,171,0.065)",
            }}
        >
            <Box
                aria-hidden="true"
                sx={{
                    position: "absolute",
                    top: 0,
                    left: { xs: 20, sm: 28 },
                    width: 96,
                    height: 2,
                    borderRadius: "0 0 99px 99px",
                    background: accepted
                        ? "linear-gradient(90deg, #55d878, rgba(85,216,120,0.2))"
                        : "linear-gradient(90deg, #ffd166, rgba(255,143,0,0.2))",
                    boxShadow: accepted ? "0 0 18px rgba(85,216,120,0.34)" : "0 0 18px rgba(255,183,0,0.3)",
                }}
            />
            <Box
                aria-hidden="true"
                sx={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    background: "radial-gradient(circle at 10% 30%, rgba(255,215,120,0.1), transparent 30%)",
                }}
            />
            <Box sx={{ position: "relative", p: { xs: 1.6, sm: 2.2 } }}>
                <Stack direction="row" spacing={{ xs: 1.25, sm: 1.8 }} alignItems="center" sx={{ minWidth: 0 }}>
                    <LeagueEmblem league={league} wealth={wealth} label={standing} size={104} />
                    <Box sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                        <Typography
                            level="body-xs"
                            sx={{
                                color: accepted ? hocColors.green : "#ffd166",
                                fontFamily: hocDisplayFontFamily,
                                fontWeight: 700,
                                letterSpacing: "0.16em",
                                textTransform: "uppercase",
                            }}
                        >
                            {accepted ? t("MATCH ACCEPTED") : t("YOU’RE FACING")}
                        </Typography>
                        <Typography
                            level="h2"
                            noWrap
                            title={stats.username}
                            sx={{
                                mt: 0.2,
                                color: hocColors.parchment,
                                fontSize: { xs: "1.45rem", sm: "2rem" },
                                lineHeight: 1.05,
                            }}
                        >
                            {stats.username}
                        </Typography>
                        <Typography level="body-sm" sx={{ mt: 0.35, color: hocColors.gold, fontWeight: 700 }}>
                            {standing}
                        </Typography>
                        <Typography level="body-xs" sx={{ mt: 0.45, color: hocColors.muted }}>
                            {number.format(whole(stats.totalGames))} {t("Ranked games")} ·{" "}
                            {winRate.toFixed(1).replace(/\.0$/, "")}% {t("Win rate").toLowerCase()}
                        </Typography>
                    </Box>
                </Stack>

                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(5, minmax(0, 1fr))" },
                        mt: { xs: 1.5, sm: 1.8 },
                        pt: { xs: 0, sm: 1.3 },
                        borderTop: { xs: 0, sm: "1px solid rgba(239,228,204,0.09)" },
                    }}
                >
                    <MatchMetric label={t("Rank")}>
                        <Typography level="title-lg" sx={{ color: hocColors.parchment, fontWeight: 800 }}>
                            {placed && leaderboardRank > 0 ? `#${number.format(leaderboardRank)}` : "—"}
                        </Typography>
                    </MatchMetric>
                    <MatchMetric label={`${t("Rating")} · MMR`}>
                        <Typography level="title-lg" sx={{ color: hocColors.parchment, fontWeight: 800 }}>
                            {placed ? number.format(whole(stats.mmr)) : t("Hidden")}
                        </Typography>
                    </MatchMetric>
                    <MatchMetric label={t(currency.name)}>
                        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent={{ sm: "center" }}>
                            <CurrencyIcon iconSvg={currency.iconSvg} prominent size={23} />
                            <Typography level="title-lg" sx={{ color: hocColors.parchment, fontWeight: 800 }}>
                                {number.format(whole(stats.gold))}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: hocColors.gold, fontWeight: 800 }}>
                                {currency.symbol}
                            </Typography>
                        </Stack>
                    </MatchMetric>
                    <MatchMetric label={`${t("Record")} · W–L–D`}>
                        <Typography level="title-lg" sx={{ color: hocColors.parchment, fontWeight: 800 }}>
                            {wins}–{losses}–{draws}
                        </Typography>
                    </MatchMetric>
                    <MatchMetric label={t("Win rate")}>
                        <Typography level="title-lg" sx={{ color: hocColors.parchment, fontWeight: 800 }}>
                            {winRate.toFixed(1).replace(/\.0$/, "")}%
                        </Typography>
                    </MatchMetric>
                </Box>
            </Box>
        </Sheet>
    );
};
