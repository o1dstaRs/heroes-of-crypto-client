import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import LoopRoundedIcon from "@mui/icons-material/LoopRounded";
import MilitaryTechRoundedIcon from "@mui/icons-material/MilitaryTechRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import { Box, Button, IconButton, Sheet, Stack, ToggleButtonGroup, Tooltip, Typography } from "@mui/joy";
import React, { useMemo, useState } from "react";

import { hocColors } from "../hocTheme";
import {
    filterPortalMatches,
    formatMatchDamage,
    formatMatchDuration,
    matchResultPresentation,
    normalizePerformances,
    type MatchHistoryFilter,
    type MatchResultTone,
    type PortalMatchData,
    type PortalUnitPerformanceData,
} from "./matchHistoryModel";
import { CreatureIcon, creatureName, timeAgo } from "./portalFormat";

const RESULT_COLORS: Record<MatchResultTone, string> = {
    draw: hocColors.gold,
    loss: hocColors.danger,
    win: "#46d160",
};

interface MatchHistoryProps {
    compact?: boolean;
    filterable?: boolean;
    matches: readonly PortalMatchData[];
    onReplay: (match: PortalMatchData) => void;
}

interface RosterStripProps {
    compact: boolean;
    creatureIds: readonly number[];
    label: string;
    muted?: boolean;
}

const RosterStrip: React.FC<RosterStripProps> = ({ compact, creatureIds, label, muted = false }) => (
    <Box sx={{ minWidth: 0, opacity: muted ? 0.72 : 1 }}>
        <Typography
            level="body-xs"
            sx={{ color: hocColors.muted, fontSize: compact ? "0.63rem" : "0.68rem", mb: 0.35 }}
        >
            {label}
        </Typography>
        <Stack direction="row" spacing={0.35} sx={{ flexWrap: "wrap", minHeight: compact ? 20 : 28 }}>
            {creatureIds.slice(0, 8).map((creatureId, index) => (
                <CreatureIcon
                    key={`${label}_${creatureId}_${index}`}
                    creatureId={creatureId}
                    size={compact ? 20 : 28}
                />
            ))}
            {creatureIds.length === 0 && (
                <Typography level="body-xs" textColor={hocColors.muted}>
                    Unknown roster
                </Typography>
            )}
        </Stack>
    </Box>
);

const MetadataItem: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
    <Stack direction="row" spacing={0.4} alignItems="center">
        <Box sx={{ color: hocColors.muted, display: "flex", "& svg": { fontSize: 14 } }}>{icon}</Box>
        <Typography level="body-xs" textColor={hocColors.muted} sx={{ whiteSpace: "nowrap" }}>
            {label}
        </Typography>
    </Stack>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <Box sx={{ minWidth: 0 }}>
        <Typography level="body-xs" textColor={hocColors.muted}>
            {label}
        </Typography>
        <Typography level="title-sm" textColor={hocColors.parchment} sx={{ mt: 0.1 }}>
            {value}
        </Typography>
    </Box>
);

const PerformanceList: React.FC<{
    label: string;
    performances: readonly PortalUnitPerformanceData[];
}> = ({ label, performances }) => (
    <Box sx={{ minWidth: 0 }}>
        <Typography level="body-xs" textColor={hocColors.muted} sx={{ mb: 0.75 }}>
            {label}
        </Typography>
        <Stack spacing={0.65}>
            {performances.slice(0, 3).map((performance, index) => {
                const creatureId = performance.creature_id ?? 0;
                return (
                    <Stack
                        key={`${creatureId}_${index}`}
                        direction="row"
                        spacing={0.75}
                        alignItems="center"
                        sx={{ minWidth: 0 }}
                    >
                        <Box
                            sx={{
                                borderRadius: "7px",
                                boxShadow: index === 0 ? `0 0 0 1px ${hocColors.gold}` : "none",
                                flexShrink: 0,
                            }}
                        >
                            <CreatureIcon creatureId={creatureId} size={30} />
                        </Box>
                        <Typography level="body-xs" textColor={hocColors.mutedStrong} noWrap sx={{ flex: 1 }}>
                            {creatureName(creatureId)}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: index === 0 ? hocColors.gold : hocColors.muted }}>
                            {formatMatchDamage(performance.damage_dealt)} dmg
                        </Typography>
                    </Stack>
                );
            })}
            {performances.length === 0 && (
                <Typography level="body-xs" textColor={hocColors.muted}>
                    No damage data
                </Typography>
            )}
        </Stack>
    </Box>
);

const ReplayIconButton: React.FC<{
    available: boolean;
    compact: boolean;
    onClick: () => void;
}> = ({ available, compact, onClick }) => (
    <Tooltip title={available ? "Replay match" : "Replay unavailable for this match"} size="sm" variant="soft">
        <span style={{ display: "inline-flex" }}>
            <IconButton
                aria-label={available ? "Replay match" : "Replay unavailable"}
                disabled={!available}
                size={compact ? "sm" : "md"}
                variant="plain"
                onClick={onClick}
                sx={{
                    color: hocColors.gold,
                    minWidth: compact ? 34 : 42,
                    minHeight: compact ? 34 : 42,
                    "&:hover": { bgcolor: hocColors.orangeSoft },
                    "&.Mui-disabled": { color: "rgba(239, 228, 204, 0.25)" },
                }}
            >
                <ReplayRoundedIcon fontSize="small" />
            </IconButton>
        </span>
    </Tooltip>
);

const MatchCard: React.FC<{
    compact: boolean;
    expanded: boolean;
    match: PortalMatchData;
    onExpand: () => void;
    onReplay: () => void;
}> = ({ compact, expanded, match, onExpand, onReplay }) => {
    const result = matchResultPresentation(match);
    const resultColor = RESULT_COLORS[result.tone];
    const playerPerformances = normalizePerformances(match.player_top_units);
    const opponentPerformances = normalizePerformances(match.opponent_top_units);
    const topPlayer = playerPerformances[0];
    const duration = formatMatchDuration(match.duration_ms);
    const laps = Math.max(0, Number(match.total_laps ?? 0));
    const replayAvailable = !!match.replay_available;
    const opponent = match.opponent_username || "Unknown opponent";
    const exactFinished = match.finished_time ? new Date(match.finished_time).toLocaleString() : "Unknown";

    return (
        <Sheet
            component="article"
            variant="soft"
            sx={{
                position: "relative",
                overflow: "hidden",
                boxSizing: "border-box",
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                border: `1px solid ${expanded ? hocColors.orangeBorder : "rgba(255,255,255,0.08)"}`,
                borderRadius: "8px",
                bgcolor: expanded ? "rgba(25,15,8,0.84)" : "rgba(0,0,0,0.27)",
                transition: "border-color 150ms ease, background-color 150ms ease",
            }}
        >
            <Box sx={{ position: "absolute", inset: "0 auto 0 0", width: 3, bgcolor: resultColor }} />
            <Box sx={{ p: compact ? 1 : 1.25, pl: compact ? 1.25 : 1.5 }}>
                <Stack direction="row" spacing={0.75} alignItems="center">
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography level={compact ? "body-xs" : "body-sm"} noWrap sx={{ color: hocColors.parchment }}>
                            <Box component="span" sx={{ color: resultColor, fontWeight: 800 }}>
                                {result.label}
                            </Box>{" "}
                            vs {opponent}
                        </Typography>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25, flexWrap: "wrap" }}>
                            <Typography level="body-xs" textColor={hocColors.muted} sx={{ whiteSpace: "nowrap" }}>
                                {timeAgo(match.finished_time ?? 0)}
                            </Typography>
                            {result.detail && (
                                <Typography level="body-xs" sx={{ color: resultColor, whiteSpace: "nowrap" }}>
                                    {result.detail}
                                </Typography>
                            )}
                        </Stack>
                    </Box>
                    <ReplayIconButton available={replayAvailable} compact={compact} onClick={onReplay} />
                    <Tooltip
                        title={expanded ? "Collapse match details" : "Expand match details"}
                        size="sm"
                        variant="soft"
                    >
                        <IconButton
                            aria-expanded={expanded}
                            aria-label={expanded ? "Collapse match details" : "Expand match details"}
                            size={compact ? "sm" : "md"}
                            variant="plain"
                            onClick={onExpand}
                            sx={{
                                color: hocColors.mutedStrong,
                                minWidth: compact ? 34 : 42,
                                minHeight: compact ? 34 : 42,
                                "&:hover": { bgcolor: hocColors.orangeSoft },
                            }}
                        >
                            <ExpandMoreRoundedIcon
                                fontSize="small"
                                sx={{
                                    transform: expanded ? "rotate(180deg)" : "none",
                                    transition: "transform 150ms ease",
                                }}
                            />
                        </IconButton>
                    </Tooltip>
                </Stack>

                <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mt: 0.75, flexWrap: "wrap" }}>
                    {duration && <MetadataItem icon={<AccessTimeRoundedIcon />} label={duration} />}
                    {laps > 0 && (
                        <MetadataItem icon={<LoopRoundedIcon />} label={`${laps} ${laps === 1 ? "lap" : "laps"}`} />
                    )}
                    {topPlayer && (
                        <Stack direction="row" spacing={0.45} alignItems="center" sx={{ minWidth: 0 }}>
                            <MilitaryTechRoundedIcon sx={{ color: hocColors.gold, fontSize: 15 }} />
                            <CreatureIcon creatureId={topPlayer.creature_id ?? 0} size={20} />
                            <Typography level="body-xs" sx={{ color: hocColors.gold, whiteSpace: "nowrap" }}>
                                {formatMatchDamage(topPlayer.damage_dealt)} dmg
                            </Typography>
                        </Stack>
                    )}
                </Stack>

                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: compact
                            ? "minmax(0, 1fr) minmax(0, 1fr)"
                            : { xs: "1fr", sm: "minmax(0, 1fr) minmax(0, 1fr)" },
                        gap: compact ? 0.75 : 1.5,
                        mt: 0.9,
                    }}
                >
                    <RosterStrip compact={compact} creatureIds={match.creature_ids ?? []} label="Your army" />
                    <RosterStrip
                        compact={compact}
                        creatureIds={match.opponent_creature_ids ?? []}
                        label={`${opponent}'s army`}
                        muted
                    />
                </Box>
            </Box>

            {expanded && (
                <Box
                    sx={{
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                        px: compact ? 1.25 : 1.5,
                        py: 1.25,
                    }}
                >
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: compact
                                ? "repeat(2, minmax(0, 1fr))"
                                : { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
                            gap: 1.25,
                        }}
                    >
                        <Metric label="Duration" value={duration || "Unknown"} />
                        <Metric label="Laps" value={laps > 0 ? String(laps) : "Unknown"} />
                        <Metric label="Your damage" value={formatMatchDamage(match.player_damage)} />
                        <Metric label="Opponent damage" value={formatMatchDamage(match.opponent_damage)} />
                    </Box>

                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: compact ? "1fr" : { xs: "1fr", sm: "minmax(0, 1fr) minmax(0, 1fr)" },
                            gap: compact ? 1.25 : 2,
                            mt: 1.5,
                        }}
                    >
                        <PerformanceList label="Your top damage" performances={playerPerformances} />
                        <PerformanceList label={`${opponent}'s top damage`} performances={opponentPerformances} />
                    </Box>

                    <Stack
                        direction={compact ? "column" : { xs: "column", sm: "row" }}
                        spacing={1}
                        alignItems={compact ? "stretch" : { xs: "stretch", sm: "center" }}
                        justifyContent="space-between"
                        sx={{ mt: 1.5 }}
                    >
                        <Typography level="body-xs" textColor={hocColors.muted}>
                            Finished {exactFinished}
                        </Typography>
                        <Button
                            aria-label="Replay match"
                            disabled={!replayAvailable}
                            size="sm"
                            variant="soft"
                            startDecorator={<ReplayRoundedIcon />}
                            onClick={onReplay}
                            sx={{
                                color: hocColors.parchment,
                                bgcolor: hocColors.orangeSoft,
                                border: `1px solid ${hocColors.orangeBorder}`,
                                borderRadius: "7px",
                                "&:hover": { bgcolor: "rgba(255, 143, 0, 0.24)" },
                            }}
                        >
                            {replayAvailable ? "Replay match" : "Replay unavailable"}
                        </Button>
                    </Stack>
                </Box>
            )}
        </Sheet>
    );
};

export const MatchHistory: React.FC<MatchHistoryProps> = ({
    compact = false,
    filterable = false,
    matches,
    onReplay,
}) => {
    const [filter, setFilter] = useState<MatchHistoryFilter>("all");
    const [expandedGameId, setExpandedGameId] = useState<string>();
    const filteredMatches = useMemo(() => filterPortalMatches(matches, filter), [filter, matches]);
    const wins = useMemo(() => filterPortalMatches(matches, "wins").length, [matches]);
    const losses = useMemo(() => filterPortalMatches(matches, "losses").length, [matches]);

    return (
        <Stack spacing={1} sx={{ width: "100%", maxWidth: "100%", minWidth: 0, overflow: "hidden" }}>
            {filterable && matches.length > 0 && (
                <ToggleButtonGroup
                    aria-label="Filter match history"
                    size="sm"
                    buttonFlex={1}
                    value={filter}
                    onChange={(_, value) => {
                        if (value) {
                            setFilter(value as MatchHistoryFilter);
                            setExpandedGameId(undefined);
                        }
                    }}
                    sx={{
                        alignSelf: "flex-start",
                        width: { xs: "100%", sm: "auto" },
                        maxWidth: "100%",
                        boxSizing: "border-box",
                        borderRadius: "7px",
                        "& button": {
                            minWidth: 0,
                            px: 1,
                            whiteSpace: "nowrap",
                            color: hocColors.mutedStrong,
                            borderColor: hocColors.orangeBorder,
                            borderRadius: "7px",
                            "&[aria-pressed='true']": { bgcolor: hocColors.orangeSoft, color: hocColors.parchment },
                        },
                    }}
                >
                    <Button value="all">All {matches.length}</Button>
                    <Button value="wins">Wins {wins}</Button>
                    <Button value="losses">Losses {losses}</Button>
                </ToggleButtonGroup>
            )}

            {filteredMatches.length === 0 && (
                <Typography level={compact ? "body-xs" : "body-sm"} textColor={hocColors.muted}>
                    {matches.length === 0 ? "No finished matches yet." : `No ${filter} in recent matches.`}
                </Typography>
            )}

            {filteredMatches.map((match) => {
                const gameId = match.game_id ?? "";
                const expanded = expandedGameId === gameId;
                return (
                    <MatchCard
                        key={gameId}
                        compact={compact}
                        expanded={expanded}
                        match={match}
                        onExpand={() => setExpandedGameId(expanded ? undefined : gameId)}
                        onReplay={() => onReplay(match)}
                    />
                );
            })}
        </Stack>
    );
};
