import { Box, Button, Chip, CircularProgress, Divider, Sheet, Stack, Typography } from "@mui/joy";
import React from "react";
import { useNavigate } from "react-router";

import { hocColors, hocPanelSx, hocSoftButtonSx } from "../hocTheme";
import { CreatureIcon, streakLabel, timeAgo, winRateColor, winRatePct } from "./portalFormat";
import { usePlayerPortal } from "./usePlayerPortal";

const StatBlock: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color }) => (
    <Box sx={{ textAlign: "center", flex: 1 }}>
        <Typography level="h4" sx={{ color: color ?? hocColors.parchment, lineHeight: 1.1 }}>
            {value}
        </Typography>
        <Typography level="body-xs" textColor={hocColors.muted}>
            {label}
        </Typography>
    </Box>
);

/** Compact profile summary shown as a right-hand bar on the post-login screen. */
export const PlayerPortalSidebar: React.FC = () => {
    const navigate = useNavigate();
    const { data, loading, error } = usePlayerPortal();

    const overallPct = data ? winRatePct(data.wins ?? 0, data.total_games_played ?? 0) : 0;
    const recent = (data?.recent_matches ?? []).slice(0, 5);

    return (
        <Sheet
            variant="outlined"
            sx={{
                position: "fixed",
                top: 0,
                right: 0,
                bottom: 0,
                width: { xs: "0", md: "26vw" },
                minWidth: { md: 300 },
                display: { xs: "none", md: "flex" },
                flexDirection: "column",
                p: 2,
                borderRadius: 0,
                overflowY: "auto",
                ...hocPanelSx,
            }}
        >
            <Stack spacing={1.5} sx={{ height: "100%" }}>
                <Box>
                    <Typography level="title-lg" textColor={hocColors.gold}>
                        {data?.username || "Your Profile"}
                    </Typography>
                    <Typography level="body-xs" textColor={hocColors.muted}>
                        {streakLabel(data?.current_streak ?? 0)}
                        {data?.best_win_streak ? ` · best ${data.best_win_streak}W` : ""}
                    </Typography>
                </Box>

                {loading && (
                    <Stack direction="row" spacing={1} alignItems="center">
                        <CircularProgress size="sm" />
                        <Typography level="body-sm" textColor={hocColors.muted}>
                            Loading profile…
                        </Typography>
                    </Stack>
                )}
                {!loading && error && (
                    <Typography level="body-sm" textColor={hocColors.danger}>
                        {error}
                    </Typography>
                )}

                {!loading && !error && data && (
                    <>
                        <Sheet
                            variant="soft"
                            sx={{ bgcolor: "rgba(0,0,0,0.3)", borderRadius: "md", p: 1.25 }}
                        >
                            <Stack direction="row" divider={<Divider orientation="vertical" />}>
                                <StatBlock label="Wins" value={data.wins ?? 0} color="#46d160" />
                                <StatBlock label="Losses" value={data.losses ?? 0} color="#ff5a5a" />
                                <StatBlock
                                    label="Win rate"
                                    value={`${overallPct}%`}
                                    color={winRateColor(overallPct)}
                                />
                            </Stack>
                        </Sheet>

                        <Typography level="title-sm" textColor={hocColors.parchment}>
                            Recent matches
                        </Typography>
                        <Stack spacing={0.75}>
                            {recent.length === 0 && (
                                <Typography level="body-xs" textColor={hocColors.muted}>
                                    No finished matches yet.
                                </Typography>
                            )}
                            {recent.map((match) => (
                                <Sheet
                                    key={match.game_id}
                                    variant="soft"
                                    sx={{
                                        bgcolor: "rgba(0,0,0,0.25)",
                                        borderRadius: "sm",
                                        p: 0.75,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                    }}
                                >
                                    <Chip
                                        size="sm"
                                        variant="solid"
                                        sx={{
                                            bgcolor: match.won ? "rgba(70,209,96,0.85)" : "rgba(255,90,90,0.85)",
                                            color: "#0b0b0b",
                                            fontWeight: 700,
                                            minWidth: 26,
                                        }}
                                    >
                                        {match.won ? "W" : "L"}
                                    </Chip>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography level="body-xs" noWrap textColor={hocColors.mutedStrong}>
                                            vs {match.opponent_username || "Unknown"}
                                        </Typography>
                                        <Stack direction="row" spacing={0.25}>
                                            {(match.creature_ids ?? []).slice(0, 6).map((id, i) => (
                                                <CreatureIcon key={`${match.game_id}_${id}_${i}`} creatureId={id} size={18} />
                                            ))}
                                        </Stack>
                                    </Box>
                                    <Typography level="body-xs" textColor={hocColors.muted}>
                                        {timeAgo(match.finished_time ?? 0)}
                                    </Typography>
                                </Sheet>
                            ))}
                        </Stack>

                        <Box sx={{ flex: 1 }} />
                        <Button fullWidth variant="soft" sx={hocSoftButtonSx} onClick={() => navigate("/portal")}>
                            Full profile →
                        </Button>
                    </>
                )}
            </Stack>
        </Sheet>
    );
};
