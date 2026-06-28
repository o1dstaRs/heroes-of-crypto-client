import { ToFactionName } from "@heroesofcrypto/common";
import { Avatar, Box, Tooltip, Typography } from "@mui/joy";
import React from "react";

import { resolveUnitImage } from "../unitImage";
import { UNIT_ID_TO_NAME } from "../unit_ui_constants";
import { hocColors } from "../hocTheme";

export const creatureName = (creatureId: number): string => UNIT_ID_TO_NAME[creatureId] ?? `#${creatureId}`;

export const creatureIcon = (creatureId: number): string | undefined =>
    resolveUnitImage(undefined, UNIT_ID_TO_NAME[creatureId]);

export const factionName = (faction: number): string => ToFactionName[faction] || "Neutral";

export const winRatePct = (wins: number, games: number): number => (games > 0 ? Math.round((wins / games) * 100) : 0);

/** Color-codes a win rate: green when winning, gold around even, red when losing. */
export const winRateColor = (pct: number): string => {
    if (pct >= 60) {
        return "#46d160";
    }
    if (pct >= 45) {
        return hocColors.gold;
    }
    return "#ff5a5a";
};

export const streakLabel = (currentStreak: number): string => {
    if (currentStreak > 0) {
        return `${currentStreak}W streak`;
    }
    if (currentStreak < 0) {
        return `${-currentStreak}L streak`;
    }
    return "No streak";
};

export const timeAgo = (ms: number): string => {
    if (!ms) {
        return "";
    }
    const diff = Date.now() - ms;
    if (diff < 0) {
        return "just now";
    }
    const mins = Math.floor(diff / 60000);
    if (mins < 1) {
        return "just now";
    }
    if (mins < 60) {
        return `${mins}m ago`;
    }
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
        return `${hours}h ago`;
    }
    const days = Math.floor(hours / 24);
    if (days < 30) {
        return `${days}d ago`;
    }
    const months = Math.floor(days / 30);
    return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
};

/** A small creature portrait with a name tooltip. */
export const CreatureIcon: React.FC<{ creatureId: number; size?: number }> = ({ creatureId, size = 32 }) => (
    <Tooltip title={creatureName(creatureId)} size="sm" variant="soft">
        <Avatar
            src={creatureIcon(creatureId)}
            alt={creatureName(creatureId)}
            variant="plain"
            sx={{
                width: size,
                height: size,
                borderRadius: "22%",
                bgcolor: "rgba(0,0,0,0.35)",
                border: `1px solid ${hocColors.orangeBorder}`,
                flexShrink: 0,
            }}
        />
    </Tooltip>
);

/** A horizontal win-rate bar with the percentage label. */
export const WinRateBar: React.FC<{ wins: number; games: number; width?: number | string }> = ({
    wins,
    games,
    width = 120,
}) => {
    const pct = winRatePct(wins, games);
    const color = winRateColor(pct);
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, width }}>
            <Box
                sx={{
                    position: "relative",
                    flex: 1,
                    height: 8,
                    borderRadius: 4,
                    bgcolor: "rgba(255,255,255,0.08)",
                    overflow: "hidden",
                }}
            >
                <Box sx={{ position: "absolute", inset: 0, width: `${pct}%`, bgcolor: color, borderRadius: 4 }} />
            </Box>
            <Typography level="body-xs" sx={{ color, minWidth: 34, textAlign: "right", fontWeight: 600 }}>
                {pct}%
            </Typography>
        </Box>
    );
};
