import Box from "@mui/joy/Box";
import React from "react";

import type { PublicPlayerStats } from "../api/social_client";

type RecordProfile = Pick<PublicPlayerStats, "wins" | "draws" | "losses" | "winRatePct">;

const count = (value: number | undefined): string =>
    typeof value === "number" && Number.isFinite(value) ? String(Math.max(0, Math.trunc(value))) : "—";

export const rankedRecordText = (profile?: RecordProfile) => ({
    record: `W${count(profile?.wins)} T${count(profile?.draws)} L${count(profile?.losses)}`,
    winRate:
        typeof profile?.winRatePct === "number" && Number.isFinite(profile.winRatePct)
            ? `${Math.round(profile.winRatePct)}%`
            : "—%",
});

export const PlayerRankedRecord: React.FC<{
    profile?: RecordProfile;
    color: string;
    reversed?: boolean;
    compact?: boolean;
}> = ({ profile, color, reversed = false, compact = true }) => {
    const text = rankedRecordText(profile);
    return (
        <Box
            data-player-ranked-record
            aria-label={`Ranked record: ${text.record}. Win rate: ${text.winRate}`}
            sx={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: reversed ? "flex-end" : "flex-start",
                columnGap: compact ? "5px" : "8px",
                rowGap: "2px",
                minWidth: 0,
                mt: compact ? "3px" : "5px",
                color,
                fontSize: compact ? "0.6rem" : "0.68rem",
                fontWeight: 900,
                fontVariantNumeric: "lining-nums tabular-nums",
                lineHeight: 1.2,
                textShadow: "0 1px 2px #000",
            }}
        >
            <Box component="span" data-player-record sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
                {text.record}
            </Box>
            <Box component="span" data-player-win-rate sx={{ whiteSpace: "nowrap" }}>
                {text.winRate}
                {!compact && " WIN RATE"}
            </Box>
        </Box>
    );
};
