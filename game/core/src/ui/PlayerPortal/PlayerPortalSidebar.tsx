import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import { Avatar, Box, Button, CircularProgress, IconButton, Sheet, Stack, Tooltip, Typography } from "@mui/joy";
import React from "react";
import { useNavigate } from "react-router";

import { rankedSeasonCurrencyAt } from "../../api/ranked_season_client";
import { t, tf, useTranslation } from "../../i18n/i18n";
import { useAuthContext } from "../auth/context/auth_context";
import { CurrencyIcon } from "../GoldCurrencyIcon";
import { hocColors, hocPanelSx, hocSoftButtonSx } from "../hocTheme";
import { useRankedSeason } from "../useRankedSeason";
import { CalibrationProgress } from "./CalibrationProgress";
import { LivePredictionMarkets } from "./LivePredictionMarkets";
import {
    formatSignedMatchValue,
    matchKindPresentation,
    matchReplayPath,
    matchResultPresentation,
    type MatchResultTone,
    type PortalMatchData,
} from "./matchHistoryModel";
import { CreatureIcon, timeAgo, winRateColor, winRatePct } from "./portalFormat";
import { usePlayerPortal } from "./usePlayerPortal";
import { useRankedStanding } from "./useRankedStanding";

const RESULT_COLORS: Record<MatchResultTone, string> = {
    draw: hocColors.gold,
    loss: hocColors.danger,
    win: "#55d878",
};

const StatBlock: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color }) => (
    <Sheet
        variant="soft"
        sx={{
            minWidth: 0,
            px: 0.5,
            py: 0.55,
            textAlign: "center",
            bgcolor: "transparent",
            border: 0,
        }}
    >
        <Typography level="h4" sx={{ color: color ?? hocColors.parchment, lineHeight: 1.05 }}>
            {value}
        </Typography>
        <Typography level="body-xs" sx={{ color: hocColors.muted, mt: 0.4 }}>
            {label}
        </Typography>
    </Sheet>
);

const playerInitials = (username: string): string => {
    const words = username.trim().split(/\s+/).filter(Boolean);
    if (words.length > 1) {
        return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }
    return username.slice(0, 2).toUpperCase() || "HC";
};

type RecentFormMatch = { draw?: boolean; won?: boolean };
type RecentFormResult = "draw" | "empty" | "loss" | "win";

const SidebarRecentForm: React.FC<{ matches: readonly RecentFormMatch[] }> = ({ matches }) => {
    // Portal history is newest-first. Reverse the ten real results so the latest sits at the right,
    // with empty positions padded on the left for commanders who have played fewer than ten games.
    const results: RecentFormResult[] = matches
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
        loss: { background: "#ff5a5a", border: "rgba(255,90,90,0.8)", shadow: "0 0 6px rgba(255,90,90,0.22)" },
        win: { background: "#55d878", border: "rgba(85,216,120,0.78)", shadow: "0 0 6px rgba(85,216,120,0.26)" },
    };

    return (
        <Box sx={{ mt: 0.55, minWidth: 0 }}>
            <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                {t("Recent form")}
            </Typography>
            <Stack
                component="span"
                role="img"
                aria-label={`${t("Recent form")}: ${wins} ${t("Wins")}, ${draws} ${t("Draw")}, ${losses} ${t("Losses")}`}
                direction="row"
                spacing={0.45}
                alignItems="center"
                sx={{ minHeight: 18, mt: 0.15 }}
            >
                {padded.map((result, index) => (
                    <Box
                        component="i"
                        key={`${index}:${result}`}
                        title={labels[result]}
                        aria-hidden="true"
                        sx={{
                            display: "block",
                            width: 10,
                            height: 10,
                            flexShrink: 0,
                            border: `1px solid ${colors[result].border}`,
                            borderRadius: "50%",
                            bgcolor: colors[result].background,
                            boxShadow: colors[result].shadow ?? "inset 0 0 0 2px rgba(0,0,0,0.18)",
                        }}
                    />
                ))}
            </Stack>
        </Box>
    );
};

const RecentMatchRow: React.FC<{
    match: PortalMatchData;
    navigationDisabled: boolean;
    onReplay: () => void;
}> = ({ match, navigationDisabled, onReplay }) => {
    const result = matchResultPresentation(match);
    const color = RESULT_COLORS[result.tone];
    const roster = (match.creature_ids ?? []).slice(0, 5);
    const replayAvailable = !!match.replay_available;
    // The rewards this battle actually moved. Driven by the SAME kind rules the full history uses, so the
    // two lists can never disagree about a match: ranked shows both, a calibration game shows only its
    // gold (its rating movement is the hidden provisional one), a lobby game shows neither.
    const { seasons } = useRankedSeason();
    const kind = matchKindPresentation(match);
    const mmrDelta = formatSignedMatchValue(match.mmr_delta);
    const goldEarned = Number.isFinite(match.gold_earned) ? Math.max(0, Math.round(Number(match.gold_earned))) : 0;
    const rewardCurrency = rankedSeasonCurrencyAt(seasons, match.finished_time);
    // The model keeps its result labels in English as the stable key; localize at the render edge.
    const resultLabel = t(result.label);
    const opponentName = match.opponent_username || t("Unknown rival");

    return (
        <Sheet
            component="article"
            variant="soft"
            sx={{
                position: "relative",
                overflow: "hidden",
                p: 1.25,
                pl: 1.5,
                borderRadius: "11px",
                bgcolor: "rgba(0,0,0,0.28)",
                border: "1px solid rgba(239,228,204,0.08)",
                transition: "border-color 150ms ease, background-color 150ms ease",
                "&:hover": {
                    bgcolor: "rgba(255,143,0,0.055)",
                    borderColor: "rgba(255,143,0,0.24)",
                },
            }}
        >
            <Box sx={{ position: "absolute", inset: "0 auto 0 0", width: 3, bgcolor: color }} />
            <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography level="body-sm" noWrap sx={{ color: hocColors.parchment, fontWeight: 650 }}>
                        <Box component="span" sx={{ color, fontWeight: 850 }}>
                            {resultLabel}
                        </Box>{" "}
                        <Box component="span" sx={{ color: hocColors.muted }}>
                            {t("vs")}
                        </Box>{" "}
                        {opponentName}
                    </Typography>
                    <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mt: 0.2 }}>
                        <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                            {timeAgo(match.finished_time ?? 0) || t("Recently")}
                        </Typography>
                        {result.detail && (
                            <Typography level="body-xs" sx={{ color }}>
                                · {t(result.detail)}
                            </Typography>
                        )}
                        {kind.showsMmr && mmrDelta && (
                            <Typography level="body-xs" sx={{ color: "#c7bfff", fontWeight: 800 }}>
                                {tf("MMR {amount}", { amount: mmrDelta })}
                            </Typography>
                        )}
                        {kind.showsGold && goldEarned > 0 && (
                            <Stack
                                component="span"
                                direction="row"
                                spacing={0.25}
                                alignItems="center"
                                title={`${rewardCurrency.name} (${rewardCurrency.symbol})`}
                                sx={{ color: hocColors.gold }}
                            >
                                <CurrencyIcon iconSvg={rewardCurrency.iconSvg} size={12} />
                                <Typography level="body-xs" sx={{ color: "inherit", fontWeight: 800 }}>
                                    +{goldEarned}
                                </Typography>
                            </Stack>
                        )}
                    </Stack>
                </Box>
                <Tooltip
                    title={
                        navigationDisabled
                            ? t("Leave matchmaking before opening a replay")
                            : replayAvailable
                              ? t("Watch replay")
                              : t("Replay unavailable")
                    }
                    size="sm"
                    variant="soft"
                >
                    <span style={{ display: "inline-flex" }}>
                        <IconButton
                            aria-label={tf("Replay {result} against {opponent}", {
                                result: resultLabel.toLowerCase(),
                                opponent: match.opponent_username || t("opponent"),
                            })}
                            size="sm"
                            variant="plain"
                            disabled={navigationDisabled || !replayAvailable}
                            onClick={onReplay}
                            sx={{
                                color: hocColors.gold,
                                "&:hover": { bgcolor: hocColors.orangeSoft },
                                "&.Mui-disabled": { color: "rgba(239,228,204,0.22)" },
                            }}
                        >
                            <ReplayRoundedIcon fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
            </Stack>

            {roster.length > 0 && (
                <Stack direction="row" spacing={0.45} alignItems="center" sx={{ mt: 1 }}>
                    {roster.map((creatureId, index) => (
                        <CreatureIcon
                            key={`${match.game_id}_${creatureId}_${index}`}
                            creatureId={creatureId}
                            size={26}
                        />
                    ))}
                    {(match.creature_ids?.length ?? 0) > roster.length && (
                        <Typography level="body-xs" sx={{ color: hocColors.muted, ml: 0.3 }}>
                            +{(match.creature_ids?.length ?? 0) - roster.length}
                        </Typography>
                    )}
                </Stack>
            )}
        </Sheet>
    );
};

export interface PlayerPortalSidebarProps {
    navigationDisabled?: boolean;
}

/** In-flow profile summary shown alongside ranked matchmaking. */
export const PlayerPortalSidebar: React.FC<PlayerPortalSidebarProps> = ({ navigationDisabled = false }) => {
    const navigate = useNavigate();
    const { user } = useAuthContext();
    const { data, loading, error, reload } = usePlayerPortal();
    // Ranked standing rides its own small call (see useRankedStanding); re-read whenever the portal
    // payload reloads so finishing a placement match updates the pips without a page refresh.
    const standing = useRankedStanding(data?.total_games_played ?? 0);
    // Subscribes this subtree to the profile language picker, so switching repaints it without a reload.
    const { language } = useTranslation();
    const { currency } = useRankedSeason();
    const [predictionsVisible, setPredictionsVisible] = React.useState(false);
    const [recentBattlesExpanded, setRecentBattlesExpanded] = React.useState(false);
    const handlePredictionsVisibility = React.useCallback((visible: boolean) => {
        setPredictionsVisible(visible);
        if (visible) setRecentBattlesExpanded(false);
    }, []);

    const overallPct = data ? winRatePct(data.wins ?? 0, data.total_games_played ?? 0) : 0;
    const recent = (data?.recent_matches ?? []).slice(0, 3);
    const recentFormMatches = (data?.recent_matches ?? []).slice(0, 10);
    const displayName = data?.username || t("Your Profile");
    const rawGold = Number(data?.gold ?? 0);
    const gold = Number.isFinite(rawGold) ? Math.max(0, Math.trunc(rawGold)) : 0;
    const localizedGold = gold.toLocaleString(language === "ru" ? "ru-RU" : "en-US");
    const showRecentBattles = !predictionsVisible || recentBattlesExpanded;

    return (
        <Box
            sx={{
                position: { lg: "sticky" },
                top: { lg: 24 },
                alignSelf: "start",
                minWidth: 0,
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                gap: 1,
            }}
        >
            <Sheet
                component="aside"
                aria-label={t("Player profile summary")}
                variant="outlined"
                sx={{
                    minWidth: 0,
                    minHeight: predictionsVisible ? undefined : { lg: 724 },
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    borderRadius: predictionsVisible ? "18px" : "22px",
                    ...hocPanelSx,
                    bgcolor: "rgba(12,8,5,0.91)",
                    borderColor: predictionsVisible ? "rgba(255,143,0,0.16)" : "rgba(255,143,0,0.25)",
                    boxShadow: predictionsVisible ? "0 16px 48px rgba(0,0,0,0.34)" : "0 28px 80px rgba(0,0,0,0.48)",
                    backdropFilter: "blur(16px)",
                }}
            >
                <Box
                    sx={{
                        position: "relative",
                        p: predictionsVisible ? { xs: 1.5, sm: 1.75 } : { xs: 2.25, sm: 2.75 },
                        borderBottom: "1px solid rgba(239,228,204,0.09)",
                        background:
                            "radial-gradient(circle at 92% 0%, rgba(255,143,0,0.18), transparent 40%), linear-gradient(135deg, rgba(255,143,0,0.1), transparent 60%)",
                    }}
                >
                    <Stack direction="row" spacing={predictionsVisible ? 1 : 1.25} alignItems="center">
                        <Avatar
                            variant="soft"
                            sx={{
                                width: predictionsVisible ? 46 : 54,
                                height: predictionsVisible ? 46 : 54,
                                flexShrink: 0,
                                color: hocColors.gold,
                                bgcolor: "rgba(0,0,0,0.36)",
                                border: `1px solid ${hocColors.orangeBorder}`,
                                boxShadow: predictionsVisible
                                    ? "0 0 0 3px rgba(255,143,0,0.055)"
                                    : "0 0 0 5px rgba(255,143,0,0.07)",
                                fontWeight: 850,
                            }}
                        >
                            {playerInitials(displayName)}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                                <Typography level="title-lg" noWrap sx={{ minWidth: 0, color: hocColors.parchment }}>
                                    {displayName}
                                </Typography>
                                {data && (
                                    <Stack
                                        component="span"
                                        direction="row"
                                        spacing={0.3}
                                        alignItems="center"
                                        aria-label={`${t(currency.name)}: ${localizedGold}`}
                                        title={`${t(currency.name)} (${currency.symbol})`}
                                        sx={{ flexShrink: 0, color: hocColors.gold }}
                                    >
                                        <CurrencyIcon iconSvg={currency.iconSvg} size={14} />
                                        <Typography level="body-xs" sx={{ color: "inherit", fontWeight: 800 }}>
                                            {localizedGold} {currency.symbol}
                                        </Typography>
                                    </Stack>
                                )}
                            </Stack>
                            <SidebarRecentForm matches={recentFormMatches} />
                        </Box>
                        <Tooltip
                            title={
                                navigationDisabled
                                    ? t("Leave matchmaking before opening your profile")
                                    : t("Open full profile")
                            }
                            size="sm"
                            variant="soft"
                        >
                            <span style={{ display: "inline-flex" }}>
                                <IconButton
                                    aria-label={t("Open full profile")}
                                    variant="soft"
                                    disabled={navigationDisabled}
                                    onClick={() => navigate("/portal")}
                                    sx={{ ...hocSoftButtonSx, borderRadius: "10px" }}
                                >
                                    <ChevronRightRoundedIcon />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>
                </Box>

                {/* Placement progress sits directly under the identity block: while calibrating it is the
                single most actionable thing on this panel ("two more and you are placed"). */}
                {standing && (
                    <Box sx={{ px: { xs: 2.25, sm: 2.75 }, pt: 1.5 }}>
                        <CalibrationProgress standing={standing} dense />
                    </Box>
                )}

                <Stack
                    spacing={predictionsVisible ? 1.15 : 2}
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        p: predictionsVisible ? { xs: 1.5, sm: 1.75 } : { xs: 2.25, sm: 2.75 },
                    }}
                >
                    {loading && (
                        <Stack
                            spacing={1.25}
                            alignItems="center"
                            justifyContent="center"
                            sx={{ flex: 1, minHeight: 320 }}
                        >
                            <CircularProgress
                                size="md"
                                sx={{
                                    "--CircularProgress-progressColor": hocColors.orange,
                                    "--CircularProgress-trackColor": "rgba(255,143,0,0.16)",
                                }}
                            />
                            <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                                {t("Loading your battle record…")}
                            </Typography>
                        </Stack>
                    )}

                    {!loading && error && (
                        <Stack
                            spacing={1.25}
                            alignItems="center"
                            justifyContent="center"
                            sx={{ flex: 1, minHeight: 320 }}
                        >
                            <HistoryRoundedIcon sx={{ color: hocColors.danger, fontSize: 36 }} />
                            <Typography level="body-sm" sx={{ color: hocColors.muted, textAlign: "center" }}>
                                {error}
                            </Typography>
                            <Button size="sm" variant="soft" sx={hocSoftButtonSx} onClick={reload}>
                                {t("Try again")}
                            </Button>
                        </Stack>
                    )}

                    {!loading && !error && data && (
                        <>
                            <Box
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                                    gap: 0.8,
                                }}
                            >
                                <StatBlock label={t("Wins")} value={data.wins ?? 0} color="#55d878" />
                                <StatBlock label={t("Losses")} value={data.losses ?? 0} color={hocColors.danger} />
                                <StatBlock
                                    label={t("Win rate")}
                                    value={`${overallPct}%`}
                                    color={winRateColor(overallPct)}
                                />
                            </Box>

                            <Box sx={{ minWidth: 0 }}>
                                {predictionsVisible ? (
                                    <Button
                                        fullWidth
                                        size="sm"
                                        variant="plain"
                                        aria-label={
                                            recentBattlesExpanded
                                                ? t("Collapse recent battles")
                                                : t("Expand recent battles")
                                        }
                                        aria-expanded={recentBattlesExpanded}
                                        onClick={() => setRecentBattlesExpanded((expanded) => !expanded)}
                                        startDecorator={
                                            <HistoryRoundedIcon sx={{ color: hocColors.muted, fontSize: 15 }} />
                                        }
                                        endDecorator={
                                            <ExpandMoreRoundedIcon
                                                sx={{
                                                    fontSize: 17,
                                                    opacity: 0.7,
                                                    transform: recentBattlesExpanded ? "rotate(180deg)" : "none",
                                                    transition: "transform 160ms ease",
                                                }}
                                            />
                                        }
                                        sx={{
                                            justifyContent: "flex-start",
                                            minHeight: 28,
                                            mb: recentBattlesExpanded ? 0.75 : 0,
                                            px: 0.25,
                                            py: 0.15,
                                            color: hocColors.muted,
                                            bgcolor: "transparent",
                                            "&:hover": { bgcolor: "rgba(255,143,0,0.035)", color: hocColors.gold },
                                        }}
                                    >
                                        <Stack
                                            component="span"
                                            direction="row"
                                            alignItems="center"
                                            justifyContent="space-between"
                                            sx={{ flex: 1, minWidth: 0 }}
                                        >
                                            <Typography level="body-sm" sx={{ color: "inherit", fontWeight: 600 }}>
                                                {t("Recent battles")}
                                            </Typography>
                                            <Typography level="body-xs" sx={{ color: hocColors.muted, opacity: 0.72 }}>
                                                {recent.length}
                                            </Typography>
                                        </Stack>
                                    </Button>
                                ) : (
                                    <Stack
                                        direction="row"
                                        spacing={1}
                                        alignItems="center"
                                        justifyContent="space-between"
                                        sx={{ mb: 1 }}
                                    >
                                        <Stack direction="row" spacing={0.75} alignItems="center">
                                            <HistoryRoundedIcon sx={{ color: hocColors.gold, fontSize: 18 }} />
                                            <Typography level="title-sm" sx={{ color: hocColors.parchment }}>
                                                {t("Recent battles")}
                                            </Typography>
                                        </Stack>
                                        <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                                            {tf("Last {count}", { count: recent.length })}
                                        </Typography>
                                    </Stack>
                                )}

                                {showRecentBattles &&
                                    (recent.length > 0 ? (
                                        <Stack spacing={0.9}>
                                            {recent.map((match) => (
                                                <RecentMatchRow
                                                    key={match.game_id}
                                                    match={match}
                                                    navigationDisabled={navigationDisabled}
                                                    onReplay={() => navigate(matchReplayPath(match))}
                                                />
                                            ))}
                                        </Stack>
                                    ) : (
                                        <Sheet
                                            variant="soft"
                                            sx={{
                                                p: 2.5,
                                                textAlign: "center",
                                                borderRadius: "11px",
                                                bgcolor: "rgba(0,0,0,0.25)",
                                                border: "1px dashed rgba(239,228,204,0.14)",
                                            }}
                                        >
                                            <HistoryRoundedIcon sx={{ color: hocColors.gold, fontSize: 28 }} />
                                            <Typography level="body-sm" sx={{ color: hocColors.muted, mt: 0.6 }}>
                                                {t("Your finished matches will appear here.")}
                                            </Typography>
                                        </Sheet>
                                    ))}
                            </Box>

                            <Box sx={{ flex: 1 }} />
                            {!predictionsVisible && (
                                <Button
                                    fullWidth
                                    variant="soft"
                                    disabled={navigationDisabled}
                                    onClick={() => navigate("/portal")}
                                    endDecorator={<ArrowForwardRoundedIcon />}
                                    title={
                                        navigationDisabled
                                            ? t("Leave matchmaking before opening your profile")
                                            : undefined
                                    }
                                    sx={{ ...hocSoftButtonSx, minHeight: 48 }}
                                >
                                    {t("View full profile")}
                                </Button>
                            )}
                        </>
                    )}
                </Stack>
            </Sheet>

            {data && (
                <LivePredictionMarkets
                    viewerUsername={displayName}
                    viewerGameId={user?.in_game_id}
                    gold={gold}
                    onBetPlaced={reload}
                    onVisibilityChange={handlePredictionsVisibility}
                />
            )}
        </Box>
    );
};
