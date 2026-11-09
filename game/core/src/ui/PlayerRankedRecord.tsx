import Box from "@mui/joy/Box";
import React from "react";

import type { PublicPlayerStats } from "../api/social_client";

type RecordProfile = Pick<PublicPlayerStats, "wins" | "draws" | "losses" | "totalGames" | "winRatePct">;

const count = (value: number | undefined): number | undefined =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined;

export const rankedRecordText = (profile?: RecordProfile) => {
    const wins = count(profile?.wins);
    const draws = count(profile?.draws);
    const losses = count(profile?.losses);
    const hasGames = (count(profile?.totalGames) ?? 0) > 0 || (wins ?? 0) + (draws ?? 0) + (losses ?? 0) > 0;
    return {
        record:
            hasGames && wins !== undefined && draws !== undefined && losses !== undefined
                ? `W${wins} T${draws} L${losses}`
                : "",
        winRate:
            hasGames &&
            typeof profile?.winRatePct === "number" &&
            Number.isFinite(profile.winRatePct) &&
            profile.winRatePct >= 0 &&
            profile.winRatePct <= 100
                ? `${Math.round(profile.winRatePct)}%`
                : "",
    };
};

export const PlayerRankedRecord: React.FC<{
    profile?: RecordProfile;
    color: string;
    reversed?: boolean;
    compact?: boolean;
}> = ({ profile, color, reversed = false, compact = true }) => {
    const text = rankedRecordText(profile);
    if (!text.record && !text.winRate) return null;
    return (
        <Box
            data-player-ranked-record
            aria-label={[text.record && `Ranked record: ${text.record}`, text.winRate && `Win rate: ${text.winRate}`]
                .filter(Boolean)
                .join(". ")}
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
            {text.record && (
                <Box component="span" data-player-record sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    {text.record}
                </Box>
            )}
            {text.winRate && (
                <Box component="span" data-player-win-rate sx={{ whiteSpace: "nowrap" }}>
                    {text.winRate}
                    {!compact && " WIN RATE"}
                </Box>
            )}
        </Box>
    );
};
