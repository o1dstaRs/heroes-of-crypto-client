import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React from "react";

import { hocColors } from "./hocTheme";
import { connectionSeatName, opponentConnectionLabel, type OpponentConnectionNotice } from "./opponentConnection";

/**
 * Presence of the OTHER seats, spelled out in a floating strip: "opponent disconnected, AI takes over in
 * 12s", "the AI is playing their turns, they forfeit in 2:31", "opponent is away" when they stayed connected
 * but the server took their seat over after missed turns, and a short "opponent is back". Without it the
 * pause read as the game freezing.
 *
 * Once the matchup strip is on screen the same notices ride beside the player's name there instead
 * ({@link MatchupPlayer.connection}); this banner covers the stretch before it appears — ranked placement.
 */
export const OpponentConnectionBadge: React.FC<{
    notices: readonly OpponentConnectionNotice[];
    viewerTeam: number | undefined;
    top: number;
}> = ({ notices, viewerTeam, top }) => {
    if (!notices.length) {
        return null;
    }
    return (
        <Box
            sx={{
                position: "fixed",
                top,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 6990,
                pointerEvents: "none",
            }}
        >
            <Stack spacing={0.5} alignItems="center">
                {notices.map((notice) => {
                    const label = opponentConnectionLabel(notice, connectionSeatName(notice.team, viewerTeam));
                    const back = label.tone === "good";
                    return (
                        <Typography
                            key={notice.playerId}
                            level="body-sm"
                            sx={{
                                px: 1.25,
                                py: 0.4,
                                borderRadius: 8,
                                border: `1px solid ${back ? hocColors.green : hocColors.orangeBorder}`,
                                bgcolor: "rgba(12, 8, 6, 0.86)",
                                color: back ? hocColors.green : hocColors.gold,
                                boxShadow: "0 6px 18px rgba(0,0,0,0.55)",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {label.full}
                        </Typography>
                    );
                })}
            </Stack>
        </Box>
    );
};

export default OpponentConnectionBadge;
