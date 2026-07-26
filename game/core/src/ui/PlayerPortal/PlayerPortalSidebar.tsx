import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import MilitaryTechRoundedIcon from "@mui/icons-material/MilitaryTechRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import { Avatar, Box, Button, CircularProgress, IconButton, Sheet, Stack, Tooltip, Typography } from "@mui/joy";
import React from "react";
import { useNavigate } from "react-router";

import { hocColors, hocPanelSx, hocSoftButtonSx } from "../hocTheme";
import {
    matchReplayPath,
    matchResultPresentation,
    type MatchResultTone,
    type PortalMatchData,
} from "./matchHistoryModel";
import { CreatureIcon, streakLabel, timeAgo, winRateColor, winRatePct } from "./portalFormat";
import { usePlayerPortal } from "./usePlayerPortal";

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
            px: 1,
            py: 1.3,
            textAlign: "center",
            borderRadius: "10px",
            bgcolor: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(239,228,204,0.08)",
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

const RecentMatchRow: React.FC<{
    match: PortalMatchData;
    navigationDisabled: boolean;
    onReplay: () => void;
}> = ({ match, navigationDisabled, onReplay }) => {
    const result = matchResultPresentation(match);
    const color = RESULT_COLORS[result.tone];
    const roster = (match.creature_ids ?? []).slice(0, 5);
    const replayAvailable = !!match.replay_available;

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
                            {result.label}
                        </Box>{" "}
                        <Box component="span" sx={{ color: hocColors.muted }}>
                            vs
                        </Box>{" "}
                        {match.opponent_username || "Unknown rival"}
                    </Typography>
                    <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mt: 0.2 }}>
                        <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                            {timeAgo(match.finished_time ?? 0) || "Recently"}
                        </Typography>
                        {result.detail && (
                            <Typography level="body-xs" sx={{ color }}>
                                · {result.detail}
                            </Typography>
                        )}
                    </Stack>
                </Box>
                <Tooltip
                    title={
                        navigationDisabled
                            ? "Leave matchmaking before opening a replay"
                            : replayAvailable
                              ? "Watch replay"
                              : "Replay unavailable"
                    }
                    size="sm"
                    variant="soft"
                >
                    <span style={{ display: "inline-flex" }}>
                        <IconButton
                            aria-label={`Replay ${result.label.toLowerCase()} against ${match.opponent_username || "opponent"}`}
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
    const { data, loading, error, reload } = usePlayerPortal();

    const overallPct = data ? winRatePct(data.wins ?? 0, data.total_games_played ?? 0) : 0;
    const recent = (data?.recent_matches ?? []).slice(0, 3);
    const displayName = data?.username || "Your Profile";

    return (
        <Sheet
            component="aside"
            aria-label="Player profile summary"
            variant="outlined"
            sx={{
                position: { lg: "sticky" },
                top: { lg: 24 },
                alignSelf: "start",
                minWidth: 0,
                minHeight: { lg: 724 },
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                borderRadius: "22px",
                ...hocPanelSx,
                bgcolor: "rgba(12,8,5,0.91)",
                borderColor: "rgba(255,143,0,0.25)",
                boxShadow: "0 28px 80px rgba(0,0,0,0.48)",
                backdropFilter: "blur(16px)",
            }}
        >
            <Box
                sx={{
                    position: "relative",
                    p: { xs: 2.25, sm: 2.75 },
                    borderBottom: "1px solid rgba(239,228,204,0.09)",
                    background:
                        "radial-gradient(circle at 92% 0%, rgba(255,143,0,0.18), transparent 40%), linear-gradient(135deg, rgba(255,143,0,0.1), transparent 60%)",
                }}
            >
                <Stack direction="row" spacing={1.25} alignItems="center">
                    <Avatar
                        variant="soft"
                        sx={{
                            width: 54,
                            height: 54,
                            flexShrink: 0,
                            color: hocColors.gold,
                            bgcolor: "rgba(0,0,0,0.36)",
                            border: `1px solid ${hocColors.orangeBorder}`,
                            boxShadow: "0 0 0 5px rgba(255,143,0,0.07)",
                            fontWeight: 850,
                        }}
                    >
                        {playerInitials(displayName)}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography level="body-xs" sx={{ color: hocColors.gold, letterSpacing: "0.12em" }}>
                            COMMANDER PROFILE
                        </Typography>
                        <Typography level="title-lg" noWrap sx={{ color: hocColors.parchment, mt: 0.2 }}>
                            {displayName}
                        </Typography>
                        <Stack direction="row" spacing={0.6} alignItems="center" sx={{ mt: 0.35 }}>
                            <MilitaryTechRoundedIcon sx={{ color: hocColors.gold, fontSize: 15 }} />
                            <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                                {streakLabel(data?.current_streak ?? 0)}
                                {data?.best_win_streak ? ` · best ${data.best_win_streak}W` : ""}
                            </Typography>
                        </Stack>
                    </Box>
                    <Tooltip
                        title={
                            navigationDisabled ? "Leave matchmaking before opening your profile" : "Open full profile"
                        }
                        size="sm"
                        variant="soft"
                    >
                        <span style={{ display: "inline-flex" }}>
                            <IconButton
                                aria-label="Open full profile"
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

            <Stack spacing={2} sx={{ flex: 1, minHeight: 0, p: { xs: 2.25, sm: 2.75 } }}>
                {loading && (
                    <Stack spacing={1.25} alignItems="center" justifyContent="center" sx={{ flex: 1, minHeight: 320 }}>
                        <CircularProgress
                            size="md"
                            sx={{
                                "--CircularProgress-progressColor": hocColors.orange,
                                "--CircularProgress-trackColor": "rgba(255,143,0,0.16)",
                            }}
                        />
                        <Typography level="body-sm" sx={{ color: hocColors.muted }}>
                            Loading your battle record…
                        </Typography>
                    </Stack>
                )}

                {!loading && error && (
                    <Stack spacing={1.25} alignItems="center" justifyContent="center" sx={{ flex: 1, minHeight: 320 }}>
                        <HistoryRoundedIcon sx={{ color: hocColors.danger, fontSize: 36 }} />
                        <Typography level="body-sm" sx={{ color: hocColors.muted, textAlign: "center" }}>
                            {error}
                        </Typography>
                        <Button size="sm" variant="soft" sx={hocSoftButtonSx} onClick={reload}>
                            Try again
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
                            <StatBlock label="Wins" value={data.wins ?? 0} color="#55d878" />
                            <StatBlock label="Losses" value={data.losses ?? 0} color={hocColors.danger} />
                            <StatBlock label="Win rate" value={`${overallPct}%`} color={winRateColor(overallPct)} />
                        </Box>

                        <Box sx={{ minWidth: 0 }}>
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
                                        Recent battles
                                    </Typography>
                                </Stack>
                                <Typography level="body-xs" sx={{ color: hocColors.muted }}>
                                    Last {recent.length}
                                </Typography>
                            </Stack>

                            {recent.length > 0 ? (
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
                                        Your finished ranked matches will appear here.
                                    </Typography>
                                </Sheet>
                            )}
                        </Box>

                        <Box sx={{ flex: 1 }} />
                        <Button
                            fullWidth
                            variant="soft"
                            disabled={navigationDisabled}
                            onClick={() => navigate("/portal")}
                            endDecorator={<ArrowForwardRoundedIcon />}
                            title={navigationDisabled ? "Leave matchmaking before opening your profile" : undefined}
                            sx={{ ...hocSoftButtonSx, minHeight: 48 }}
                        >
                            View full profile
                        </Button>
                    </>
                )}
            </Stack>
        </Sheet>
    );
};
