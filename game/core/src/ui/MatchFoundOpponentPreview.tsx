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
            px: { xs: 1, sm: 1.3 },
            py: 1,
            textAlign: "left",
            borderRadius: "4px",
            bgcolor: "rgba(0,0,0,0.34)",
            border: "1px solid rgba(220,177,88,0.18)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025)",
        }}
    >
        <Typography
            level="body-xs"
            sx={{ color: hocColors.muted, fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase" }}
        >
            {label}
        </Typography>
        <Box sx={{ mt: 0.25, color: hocColors.parchment, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
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
                    maxWidth: 760,
                    mt: 2.2,
                    p: 1.5,
                    borderRadius: "6px",
                    borderColor: "rgba(220,177,88,0.28)",
                    bgcolor: "rgba(8,7,6,0.72)",
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

    return (
        <Sheet
            variant="outlined"
            aria-label={`${t("OPPONENT FOUND")}: ${stats.username}`}
            sx={{
                position: "relative",
                width: "100%",
                maxWidth: 760,
                mt: 2.2,
                p: { xs: 1.4, sm: 1.8 },
                overflow: "hidden",
                borderRadius: "6px",
                borderColor: accepted ? "rgba(85,216,120,0.48)" : "rgba(255,209,102,0.56)",
                background: accepted
                    ? "linear-gradient(112deg, rgba(20,54,30,0.82), rgba(8,8,7,0.94) 54%, rgba(15,12,7,0.9))"
                    : "linear-gradient(112deg, rgba(78,52,10,0.78), rgba(8,8,7,0.94) 54%, rgba(25,14,5,0.9))",
                boxShadow: accepted
                    ? "0 16px 38px rgba(0,0,0,0.42), inset 0 1px 0 rgba(165,255,185,0.08)"
                    : "0 16px 38px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,231,171,0.1)",
            }}
        >
            <Box
                aria-hidden="true"
                sx={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    background:
                        "radial-gradient(circle at 12% 34%, rgba(255,215,120,0.13), transparent 28%), repeating-linear-gradient(135deg, transparent 0 18px, rgba(255,255,255,0.012) 18px 19px)",
                }}
            />
            <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={{ xs: 1.3, sm: 1.8 }}
                alignItems={{ xs: "center", sm: "stretch" }}
                sx={{ position: "relative" }}
            >
                <Stack direction="row" spacing={1.35} alignItems="center" sx={{ minWidth: 0, flex: "1 1 300px" }}>
                    <LeagueEmblem league={league} wealth={wealth} label={standing} size={94} />
                    <Box sx={{ minWidth: 0, textAlign: "left" }}>
                        <Typography
                            level="body-xs"
                            sx={{
                                color: accepted ? hocColors.green : "#ffd166",
                                fontFamily: hocDisplayFontFamily,
                                fontWeight: 700,
                                letterSpacing: "0.16em",
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
                                fontSize: { xs: "1.45rem", sm: "1.75rem" },
                                lineHeight: 1.05,
                            }}
                        >
                            {stats.username}
                        </Typography>
                        <Typography level="body-sm" sx={{ mt: 0.35, color: hocColors.gold, fontWeight: 700 }}>
                            {standing}
                            {placed && whole(stats.leaderboardRank) > 0
                                ? ` · ${t("Rank")} #${whole(stats.leaderboardRank)}`
                                : ""}
                        </Typography>
                    </Box>
                </Stack>

                <Box
                    sx={{
                        width: { xs: "100%", sm: "min(430px, 58%)" },
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 0.7,
                    }}
                >
                    <MatchMetric label={`${t("Rating")} · MMR`}>
                        <Typography level="title-md" sx={{ color: hocColors.parchment, fontWeight: 800 }}>
                            {placed ? number.format(whole(stats.mmr)) : t("Hidden")}
                        </Typography>
                    </MatchMetric>
                    <MatchMetric label={t(currency.name)}>
                        <Stack direction="row" spacing={0.55} alignItems="center">
                            <CurrencyIcon iconSvg={currency.iconSvg} prominent size={23} />
                            <Typography level="title-md" sx={{ color: hocColors.parchment, fontWeight: 800 }}>
                                {number.format(whole(stats.gold))}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: hocColors.gold, fontWeight: 800 }}>
                                {currency.symbol}
                            </Typography>
                        </Stack>
                    </MatchMetric>
                    <MatchMetric label={`${t("Record")} · W–L–D`}>
                        <Typography level="title-md" sx={{ color: hocColors.parchment, fontWeight: 800 }}>
                            {wins}–{losses}–{draws}
                        </Typography>
                    </MatchMetric>
                    <MatchMetric label={t("Win rate")}>
                        <Typography level="title-md" sx={{ color: hocColors.parchment, fontWeight: 800 }}>
                            {winRate.toFixed(1).replace(/\.0$/, "")}%
                        </Typography>
                    </MatchMetric>
                </Box>
            </Stack>
        </Sheet>
    );
};
