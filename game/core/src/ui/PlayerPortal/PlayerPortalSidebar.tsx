import { Box, Button, CircularProgress, Divider, Sheet, Stack, Typography } from "@mui/joy";
import React from "react";
import { useNavigate } from "react-router";

import { hocColors, hocPanelSx, hocSoftButtonSx } from "../hocTheme";
import { MatchHistory } from "./MatchHistory";
import { matchReplayPath } from "./matchHistoryModel";
import { streakLabel, winRateColor, winRatePct } from "./portalFormat";
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
                width: { xs: "0", md: "clamp(340px, 30vw, 440px)" },
                boxSizing: "border-box",
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
                        <Sheet variant="soft" sx={{ bgcolor: "rgba(0,0,0,0.3)", borderRadius: "md", p: 1.25 }}>
                            <Stack direction="row" divider={<Divider orientation="vertical" />}>
                                <StatBlock label="Wins" value={data.wins ?? 0} color="#46d160" />
                                <StatBlock label="Losses" value={data.losses ?? 0} color="#ff5a5a" />
                                <StatBlock label="Win rate" value={`${overallPct}%`} color={winRateColor(overallPct)} />
                            </Stack>
                        </Sheet>

                        <Typography level="title-sm" textColor={hocColors.parchment}>
                            Recent matches
                        </Typography>
                        <MatchHistory compact matches={recent} onReplay={(match) => navigate(matchReplayPath(match))} />

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
