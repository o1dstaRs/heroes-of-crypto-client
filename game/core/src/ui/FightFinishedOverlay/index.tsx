import { TeamVals, TeamType } from "@heroesofcrypto/common";

import Avatar from "@mui/joy/Avatar";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import { motion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";

import { fetchPublicRankedMatch, type PublicRankedMatch } from "../../api/ranked_match_client";
import { fetchPublicPlayerStats, type PublicPlayerStats } from "../../api/social_client";
import { HOC_GAME_FONT_FAMILY } from "../../fontFamilies";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { IFightDeathEntry, IFightStatsReport, IVisibleState } from "../../scenes/VisibleState";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { LeagueEmblem } from "../PlayerPortal/LeagueEmblem";
import { UNIT_NAME_TO_ID } from "../unit_ui_constants";
import { GOLD, PARCHMENT, WOOD_DARK, imgSrc, teamColor, teamName } from "../FightStats/CasualtyChart";
import { CasualtyChartPanel } from "../FightStats/CasualtyChartPanel";
import { DamageBreakdown } from "../FightStats/DamageBreakdown";

// Shared logic is migrating LEFT/RIGHT to LOWER/UPPER without changing the numeric wire values.
// Keep the results preview and live overlay compatible with either checked-out common revision.
const teamValues = TeamVals as unknown as Record<string, number>;
const LOWER_TEAM = (teamValues.LEFT ?? teamValues.LOWER ?? 2) as TeamType;
const UPPER_TEAM = (teamValues.RIGHT ?? teamValues.UPPER ?? 1) as TeamType;

const RESULTS_PREVIEW_STATE: IVisibleState = {
    canBeStarted: false,
    hasFinished: true,
    secondsRemaining: 0,
    secondsMax: 60,
    hasAdditionalTime: false,
    lapNumber: 5,
    numberOfLapsTillNarrowing: 0,
    numberOfLapsTillStopNarrowing: 0,
    canRequestAdditionalTime: false,
    upNext: [],
    lapsNarrowed: 0,
    teamWin: UPPER_TEAM,
    fightStats: {
        winner: UPPER_TEAM,
        series: [
            { lap: 1, leftKilled: 0, rightKilled: 0, leftKilledPct: 0, rightKilledPct: 0 },
            { lap: 2, leftKilled: 74, rightKilled: 80, leftKilledPct: 37, rightKilledPct: 40 },
            { lap: 3, leftKilled: 128, rightKilled: 126, leftKilledPct: 64, rightKilledPct: 63 },
            { lap: 4, leftKilled: 160, rightKilled: 152, leftKilledPct: 80, rightKilledPct: 76 },
            { lap: 5, leftKilled: 171, rightKilled: 200, leftKilledPct: 86, rightKilledPct: 100 },
        ],
        leftDeaths: [{ name: "Peasant", smallTextureName: "peasant_512", died: 200, start: 200, team: LOWER_TEAM }],
        rightDeaths: [{ name: "Peasant", smallTextureName: "peasant_512", died: 171, start: 200, team: UPPER_TEAM }],
        damageByUnit: [
            { name: "Peasant", smallTextureName: "peasant_512", damage: 1600, team: UPPER_TEAM },
            { name: "Squire", smallTextureName: "squire_512", damage: 1315, team: UPPER_TEAM },
            { name: "Arbalester", smallTextureName: "arbalester_512", damage: 1080, team: UPPER_TEAM },
            { name: "Blacksmith", smallTextureName: "blacksmith_512", damage: 760, team: UPPER_TEAM },
            { name: "Peasant", smallTextureName: "peasant_512", damage: 1370, team: LOWER_TEAM },
            { name: "Squire", smallTextureName: "squire_512", damage: 1160, team: LOWER_TEAM },
            { name: "Arbalester", smallTextureName: "arbalester_512", damage: 920, team: LOWER_TEAM },
            { name: "Blacksmith", smallTextureName: "blacksmith_512", damage: 610, team: LOWER_TEAM },
        ],
        leftStartTotal: 200,
        rightStartTotal: 200,
        leftKilledTotal: 200,
        rightKilledTotal: 171,
        totalLaps: 5,
    },
};

const RESULTS_PREVIEW_MATCH: PublicRankedMatch = {
    gameId: "fight-results-preview",
    winnerPlayerId: "preview-upper",
    players: [
        {
            playerId: "preview-lower",
            username: "RuneWarden",
            side: "lower",
            result: "loss",
            calibration: false,
            mmrBefore: 1838,
            mmrAfter: 1816,
            delta: -22,
            goldEarned: 0,
        },
        {
            playerId: "preview-upper",
            username: "VoidSeraph",
            side: "upper",
            result: "win",
            calibration: false,
            mmrBefore: 1818,
            mmrAfter: 1840,
            delta: 22,
            goldEarned: 22,
        },
    ],
};

const RESULTS_PREVIEW_PROFILES: Record<string, PublicPlayerStats> = {
    "preview-lower": {
        playerId: "preview-lower",
        username: "RuneWarden",
        state: "placed",
        mmr: 1816,
        league: 3,
        leagueName: "Marshal",
        wealth: 2,
        wealthName: "Stacked",
        standingTitle: "Stacked Marshal",
    },
    "preview-upper": {
        playerId: "preview-upper",
        username: "VoidSeraph",
        state: "placed",
        mmr: 1840,
        league: 4,
        leagueName: "Overlord",
        wealth: 1,
        wealthName: "Ragged",
        standingTitle: "Ragged Overlord",
    },
};

// =============================================================================
// Casualty roster column (per team): unit icons + how many fell
// =============================================================================
const CasualtyColumn: React.FC<{
    team: TeamType;
    deaths: IFightDeathEntry[];
    killedTotal: number;
    startTotal: number;
    fallbackPct: number;
}> = ({ team, deaths, killedTotal, startTotal, fallbackPct }) => {
    const color = teamColor(team);
    const fellPct = Math.round(
        Math.min(100, Math.max(0, startTotal > 0 ? (killedTotal / startTotal) * 100 : fallbackPct)),
    );
    return (
        <Box sx={{ flex: 1, minWidth: 220 }}>
            <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "center", mb: 0.75, minHeight: 22, whiteSpace: "nowrap" }}
            >
                <Box
                    aria-hidden
                    sx={{
                        width: 11,
                        height: 11,
                        flexShrink: 0,
                        borderRadius: "50%",
                        backgroundColor: color,
                        boxShadow: `0 0 7px ${color}`,
                    }}
                />
                <Typography
                    sx={{
                        color: PARCHMENT,
                        fontFamily: HOC_GAME_FONT_FAMILY,
                        fontSize: "0.82rem",
                        fontWeight: 800,
                        letterSpacing: "0.025em",
                        lineHeight: 1,
                    }}
                >
                    {teamName(team).toUpperCase()} ARMY
                </Typography>
                <Typography
                    sx={{
                        color,
                        fontFamily: HOC_GAME_FONT_FAMILY,
                        fontSize: "0.82rem",
                        fontWeight: 800,
                        letterSpacing: "0.025em",
                        lineHeight: 1,
                    }}
                >
                    {fellPct}% FELL
                </Typography>
            </Stack>
            <Box
                sx={{
                    position: "relative",
                    display: "flex",
                    flexWrap: "nowrap",
                    gap: 1,
                    p: 0.75,
                    borderRadius: "14px",
                    border: "2px solid rgba(55,52,49,.9)",
                    backgroundColor: "transparent",
                    height: 92,
                    minHeight: 92,
                    maxHeight: 92,
                    overflowX: "auto",
                    overflowY: "hidden",
                    overscrollBehaviorX: "contain",
                    scrollbarWidth: "thin",
                    scrollbarColor: "rgba(74,67,60,.58) transparent",
                    boxShadow:
                        "inset 0 0 0 1px rgba(6,6,6,.98), inset 0 0 0 3px rgba(82,72,62,.12), 0 3px 8px rgba(0,0,0,.7)",
                    "&::-webkit-scrollbar": { height: "4px" },
                    "&::-webkit-scrollbar-track": { background: "transparent" },
                    "&::-webkit-scrollbar-thumb": {
                        backgroundColor: "rgba(74,67,60,.58)",
                        borderRadius: "2px",
                    },
                    "&::before": {
                        content: '\"\"',
                        position: "absolute",
                        inset: "4px",
                        zIndex: 0,
                        pointerEvents: "none",
                        background: "linear-gradient(160deg, rgba(30,18,7,.62), rgba(9,6,2,.62))",
                        // Combined with the 62%-alpha warm gradient, this leaves the loss well about 51%
                        // transparent without fading its portraits, counters or forged frame.
                        opacity: 0.79,
                        borderRadius: "10px",
                    },
                    "&::after": {
                        content: '""',
                        position: "absolute",
                        inset: "3px",
                        zIndex: 3,
                        pointerEvents: "none",
                        boxSizing: "border-box",
                        border: "1px solid rgba(40,39,37,.92)",
                        borderRadius: "11px",
                    },
                }}
            >
                {deaths.length === 0 && (
                    <Typography
                        sx={{ color: PARCHMENT, opacity: 0.6, fontStyle: "italic", p: 1, whiteSpace: "nowrap" }}
                    >
                        No casualties — flawless.
                    </Typography>
                )}
                {deaths.map((d) => (
                    <Tooltip
                        key={d.name}
                        title={`${d.name}: ${d.died} of ${d.start} lost`}
                        placement="top"
                        sx={{
                            backgroundColor: "#2d1606",
                            border: `2px solid ${GOLD}`,
                            color: PARCHMENT,
                            zIndex: 10001,
                        }}
                    >
                        <Box sx={{ position: "relative", zIndex: 1, flexShrink: 0 }}>
                            {UNIT_NAME_TO_ID[d.name.trim()] !== undefined ? (
                                <CreaturePortraitImage
                                    creatureId={UNIT_NAME_TO_ID[d.name.trim()]}
                                    alt={d.name}
                                    sx={{
                                        width: 60,
                                        height: 80,
                                        borderRadius: "7px",
                                        border: "none",
                                        filter: "grayscale(55%) brightness(0.82)",
                                    }}
                                />
                            ) : (
                                <Avatar
                                    src={imgSrc(d.smallTextureName)}
                                    variant="plain"
                                    sx={{
                                        width: 60,
                                        height: 80,
                                        borderRadius: "7px",
                                        border: "none",
                                        filter: "grayscale(55%) brightness(0.82)",
                                    }}
                                />
                            )}
                            <Box
                                sx={{
                                    position: "absolute",
                                    bottom: -4,
                                    right: -4,
                                    px: 0.5,
                                    minWidth: 20,
                                    height: 20,
                                    borderRadius: "10px",
                                    backgroundColor: WOOD_DARK,
                                    border: `1.5px solid ${color}`,
                                    color: PARCHMENT,
                                    fontSize: "0.72rem",
                                    fontWeight: 800,
                                    lineHeight: "17px",
                                    textAlign: "center",
                                }}
                            >
                                ×{d.died}
                            </Box>
                        </Box>
                    </Tooltip>
                ))}
            </Box>
        </Box>
    );
};

const ActionButton: React.FC<{
    label: string;
    disabled?: boolean;
    primary?: boolean;
    tone?: "gray" | "brown" | "olive" | "gold" | "brightGold";
    frameTone?: "gray" | "brown" | "olive" | "gold" | "brightGold";
    labelColor?: string;
    leadingIcon?: string;
    backgroundOpacity?: number;
    visualOpacity?: number;
    onClick: () => void;
}> = ({
    backgroundOpacity,
    disabled,
    frameTone,
    label,
    labelColor,
    leadingIcon,
    primary,
    tone,
    visualOpacity = 1,
    onClick,
}) => {
    const resolvedTone = tone ?? (primary ? "gold" : "gray");
    const resolvedFrameTone = frameTone ?? resolvedTone;
    const resolvedBackgroundOpacity = backgroundOpacity ?? visualOpacity;
    const backgroundBrightness = Math.min(1, resolvedBackgroundOpacity + 0.35);
    const hasWarmText = resolvedTone !== "gray";
    const plateImage = imgSrc("ui_start_button_plate_trimmed");
    const backgroundImage =
        resolvedFrameTone === "gray"
            ? `linear-gradient(180deg, rgba(132,138,141,.58), rgba(27,30,32,.74)), url(${plateImage})`
            : resolvedFrameTone === "brown"
              ? `linear-gradient(180deg, rgba(84,53,35,.34), rgba(29,20,15,.52)), url(${plateImage})`
              : resolvedFrameTone === "olive"
                ? `linear-gradient(180deg, rgba(104,94,48,.36), rgba(35,31,18,.5)), url(${plateImage})`
                : resolvedFrameTone === "brightGold"
                  ? `linear-gradient(180deg, rgba(255,229,145,.46), rgba(190,112,15,.3)), url(${plateImage})`
                  : `linear-gradient(180deg, rgba(255,211,111,.28), rgba(153,91,12,.16)), url(${plateImage})`;
    const hoverBackgroundImage =
        resolvedFrameTone === "gray"
            ? `linear-gradient(180deg, rgba(155,161,164,.66), rgba(38,41,43,.78)), url(${plateImage})`
            : resolvedFrameTone === "brown"
              ? `linear-gradient(180deg, rgba(105,67,43,.4), rgba(38,25,18,.56)), url(${plateImage})`
              : resolvedFrameTone === "olive"
                ? `linear-gradient(180deg, rgba(126,113,57,.44), rgba(44,39,21,.54)), url(${plateImage})`
                : resolvedFrameTone === "brightGold"
                  ? `linear-gradient(180deg, rgba(255,239,174,.58), rgba(211,133,25,.36)), url(${plateImage})`
                  : `linear-gradient(180deg, rgba(255,224,142,.38), rgba(172,105,18,.2)), url(${plateImage})`;
    const edgeColor =
        resolvedFrameTone === "gray"
            ? "rgba(61,60,58,.92)"
            : resolvedFrameTone === "brown"
              ? "rgba(60,53,47,.86)"
              : resolvedFrameTone === "olive"
                ? "rgba(65,62,51,.88)"
                : "rgba(78,65,50,.92)";
    const textColor = resolvedTone === "brown" ? "#d8b77f" : resolvedTone === "olive" ? "#dfcf91" : "#f3d08a";
    const restingShadow =
        resolvedTone === "brown"
            ? "inset 0 0 0 1px rgba(190,129,82,.05), 0 3px 8px rgba(0,0,0,.72)"
            : resolvedTone === "olive"
              ? "inset 0 0 0 1px rgba(207,190,113,.06), 0 3px 8px rgba(0,0,0,.68)"
              : hasWarmText
                ? "inset 0 0 0 1px rgba(255,221,139,.06), 0 3px 8px rgba(0,0,0,.72)"
                : "inset 0 0 0 1px rgba(214,158,101,.05), 0 3px 8px rgba(0,0,0,.7)";
    const hoverShadow = `0 0 20px ${GOLD}aa`;

    return (
        <Box
            onClick={disabled ? undefined : onClick}
            sx={{
                px: primary ? 3.4 : 3,
                py: 0,
                minWidth: primary ? 160 : 138,
                height: primary ? "42px" : "40px",
                boxSizing: "border-box",
                position: "relative",
                borderRadius: "10px",
                overflow: "hidden",
                cursor: disabled ? "not-allowed" : "var(--hoc-cursor-interactive), pointer",
                fontWeight: 800,
                letterSpacing: "0.04em",
                // Enlarge only the label/icon content by 20%; the fixed button dimensions stay unchanged.
                fontSize: "16.8px",
                fontFamily: HOC_GAME_FONT_FAMILY,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                userSelect: "none",
                border: `1px solid ${edgeColor}`,
                color: disabled ? `${PARCHMENT}66` : (labelColor ?? (hasWarmText ? textColor : PARCHMENT)),
                backgroundColor: "transparent",
                backgroundClip: "padding-box",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                backgroundSize: "100% 100%",
                textShadow: hasWarmText ? "0 2px 2px #090501, 0 0 8px rgba(225,170,67,.4)" : "0 2px 2px #090501",
                boxShadow: restingShadow,
                opacity: disabled ? 0.45 : 1,
                transition: "all 0.15s ease",
                // Repaint only the outer ring from the illustrated plate above the colour wash.
                // Its translucent edge preserves each button's tone while keeping the engraved
                // frame crisp instead of burying it under the background gradient.
                "&::after": {
                    content: '""',
                    position: "absolute",
                    inset: 0,
                    zIndex: 2,
                    p: "4px",
                    pointerEvents: "none",
                    backgroundImage: `url(${plateImage})`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                    backgroundSize: "100% 100%",
                    opacity: 0.32,
                    filter: "brightness(.5) saturate(.45)",
                    WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                    WebkitMaskComposite: "xor",
                    maskComposite: "exclude",
                },
                "&:hover": {
                    transform: disabled ? "none" : "translateY(-1px)",
                    boxShadow: disabled ? (hasWarmText ? `0 0 16px ${GOLD}66` : "none") : hoverShadow,
                    backgroundColor: "transparent",
                    "& .action-button-fill": { backgroundImage: hoverBackgroundImage },
                },
                "&:active": { transform: "translateY(0)" },
            }}
        >
            <Box
                aria-hidden
                className="action-button-fill"
                sx={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 0,
                    pointerEvents: "none",
                    opacity: resolvedBackgroundOpacity,
                    // Keep the translucent field readable against the newly lighter results panel;
                    // the frame and label remain on separate, fully crisp layers.
                    filter: `brightness(${backgroundBrightness})`,
                    backgroundImage,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                    backgroundSize: "100% 100%",
                    transition: "background-image .15s ease, opacity .15s ease, filter .15s ease",
                    // Keep the plate and leather field in one opacity group. Independent translucent
                    // layers compound their alphas and make the requested transparency look denser.
                    "&::before": {
                        content: '""',
                        position: "absolute",
                        inset: "4px",
                        pointerEvents: "none",
                        borderRadius: "5px",
                        opacity: 0.85,
                        background:
                            "linear-gradient(115deg, rgba(43,24,9,.62), rgba(72,44,17,.34), rgba(28,14,6,.68)), repeating-linear-gradient(14deg, rgba(255,255,255,.018) 0 1px, rgba(0,0,0,.04) 1px 3px), #130c07",
                    },
                }}
            />
            <Box
                component="span"
                sx={{
                    position: "relative",
                    zIndex: 3,
                    opacity: visualOpacity,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.42em",
                }}
            >
                {leadingIcon && (
                    <Box
                        component="span"
                        aria-hidden
                        sx={{
                            fontSize: "1.16em",
                            lineHeight: 1,
                            display: "inline-block",
                            flexShrink: 0,
                            // Size the visible crossed swords to the REMATCH capitals rather than to
                            // the taller fallback-font line box.
                            transform: "translateY(-0.06em)",
                        }}
                    >
                        {leadingIcon}
                    </Box>
                )}
                {label}
            </Box>
        </Box>
    );
};

const ResultsSectionPlaque: React.FC<{ label: string }> = ({ label }) => (
    <Stack direction="row" sx={{ alignItems: "center", mb: 1, px: 0.25 }}>
        <Box
            sx={{
                flex: 1,
                height: "1px",
                background: "linear-gradient(90deg, transparent, rgba(66,59,52,.45))",
            }}
        />
        <Box
            sx={{
                position: "relative",
                // Both section plates use the width of the longer DAMAGE DEALT caption instead of
                // spanning a large part of the results card.
                width: "160px",
                // Five percent lower than the previous 34px plate.
                height: "32.3px",
                mx: 1.25,
                clipPath: "polygon(12px 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 12px 100%, 0 50%)",
                background: "linear-gradient(180deg, rgba(138,91,48,.05), rgba(66,36,19,.05))",
                filter: "drop-shadow(0 2px 3px rgba(0,0,0,.58))",
            }}
        >
            <Box
                sx={{
                    position: "absolute",
                    inset: "1px",
                    clipPath: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background:
                        "linear-gradient(180deg, rgba(48,42,35,.16), rgba(22,18,15,.16)), radial-gradient(circle at 50% 0%, rgba(190,125,59,.02), transparent 68%)",
                    boxShadow: "inset 0 1px rgba(255,219,157,.12), inset 0 -1px rgba(0,0,0,.72)",
                }}
            >
                <Typography
                    sx={{
                        color: GOLD,
                        fontWeight: 700,
                        fontSize: "15px",
                        letterSpacing: "0.08em",
                        lineHeight: 1,
                        textAlign: "center",
                        textShadow: "0 2px 2px rgba(0,0,0,.9)",
                    }}
                >
                    {label}
                </Typography>
            </Box>
        </Box>
        <Box
            sx={{
                flex: 1,
                height: "1px",
                background: "linear-gradient(90deg, rgba(66,59,52,.45), transparent)",
            }}
        />
    </Stack>
);

type ResultParticipant = Readonly<{
    team: TeamType;
    playerId?: string;
    username: string;
    isAi: boolean;
    calibration: boolean;
    mmrAfter?: number;
    mmrDelta?: number;
    goldEarned?: number;
    showRewards: boolean;
    settled: boolean;
    result: "win" | "loss" | "draw";
    profile?: PublicPlayerStats;
}>;

const signedResult = (value: number): string => `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString("en-US")}`;

const participantStanding = (participant: ResultParticipant): string => {
    if (participant.isAi) return "AI PLAYER";
    if (participant.calibration || participant.profile?.state === "calibration") return "CALIBRATING";
    return (
        participant.profile?.standingTitle ||
        participant.profile?.leagueName ||
        participant.profile?.wealthName ||
        "RANKED PLAYER"
    );
};

const ResultParticipantCard: React.FC<{
    participant: ResultParticipant;
    reversed?: boolean;
    showRankedDetails?: boolean;
    viewerPlayerId?: string;
}> = ({ participant, reversed = false, showRankedDetails = false, viewerPlayerId }) => {
    const color = teamColor(participant.team);
    const won = participant.result === "win";
    const resultLabel = participant.result === "draw" ? "DRAW" : won ? "WINNER" : "DEFEATED";
    const visibleMmr = participant.calibration
        ? undefined
        : Number.isFinite(participant.mmrAfter)
          ? participant.mmrAfter
          : participant.profile?.mmr;
    const mmrDelta = Number.isFinite(participant.mmrDelta) ? Number(participant.mmrDelta) : 0;
    const goldEarned = Number.isFinite(participant.goldEarned) ? Math.max(0, Number(participant.goldEarned)) : 0;
    const isViewer = !!viewerPlayerId && participant.playerId === viewerPlayerId;
    const avatar = participant.profile ? (
        <LeagueEmblem
            label={`${participant.username} — ${participantStanding(participant)}`}
            league={participant.profile.league ?? 0}
            wealth={participant.profile.wealth ?? 0}
            size={76}
        />
    ) : (
        <Avatar
            variant="solid"
            sx={{
                width: 68,
                height: 68,
                color: "#fff2cb",
                bgcolor: `${color}38`,
                border: `2px solid ${color}b8`,
                boxShadow: `0 0 16px ${color}35, inset 0 0 13px rgba(0,0,0,.58)`,
                fontFamily: HOC_GAME_FONT_FAMILY,
                fontSize: participant.isAi ? "1.75rem" : "1.45rem",
            }}
        >
            {participant.isAi ? "⚙" : participant.username.trim().slice(0, 1).toUpperCase() || "?"}
        </Avatar>
    );

    return (
        <Box
            sx={{
                position: "relative",
                flex: "1 1 0",
                minWidth: 0,
                height: 118,
                px: 1.5,
                display: "flex",
                flexDirection: reversed ? "row-reverse" : "row",
                alignItems: "center",
                gap: 1.25,
                overflow: "hidden",
                borderRadius: "10px",
                border: `1px solid ${won ? `${color}bc` : "rgba(61,59,55,.94)"}`,
                background: reversed
                    ? `linear-gradient(270deg, ${color}2c, rgba(12,11,10,.94) 56%)`
                    : `linear-gradient(90deg, ${color}2c, rgba(12,11,10,.94) 56%)`,
                boxShadow: won
                    ? `inset 0 0 0 2px rgba(0,0,0,.72), 0 0 15px ${color}2c, 0 4px 10px rgba(0,0,0,.72)`
                    : "inset 0 0 0 2px rgba(0,0,0,.72), 0 4px 10px rgba(0,0,0,.7)",
                "&::after": {
                    content: '""',
                    position: "absolute",
                    inset: 4,
                    border: "1px solid rgba(255,238,194,.055)",
                    borderRadius: "6px",
                    pointerEvents: "none",
                },
            }}
        >
            <Box sx={{ flexShrink: 0, filter: won ? "none" : "saturate(.72) brightness(.82)" }}>{avatar}</Box>
            <Box sx={{ minWidth: 0, flex: 1, textAlign: reversed ? "right" : "left", zIndex: 1 }}>
                <Stack
                    direction={reversed ? "row-reverse" : "row"}
                    spacing={0.6}
                    sx={{ alignItems: "center", mb: 0.15, minWidth: 0 }}
                >
                    <Typography
                        sx={{
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: PARCHMENT,
                            fontFamily: HOC_GAME_FONT_FAMILY,
                            fontSize: "1rem",
                            fontWeight: 800,
                            letterSpacing: ".035em",
                            lineHeight: 1.1,
                        }}
                    >
                        {participant.username}
                    </Typography>
                    {isViewer && (
                        <Box
                            component="span"
                            sx={{
                                px: 0.55,
                                py: 0.15,
                                borderRadius: "4px",
                                border: `1px solid ${color}82`,
                                color,
                                fontSize: "0.54rem",
                                fontWeight: 900,
                                letterSpacing: ".08em",
                                lineHeight: 1.2,
                            }}
                        >
                            YOU
                        </Box>
                    )}
                </Stack>
                {showRankedDetails && (
                    <>
                        <Typography
                            sx={{
                                color,
                                opacity: 0.92,
                                fontFamily: HOC_GAME_FONT_FAMILY,
                                fontSize: "0.64rem",
                                fontWeight: 800,
                                letterSpacing: ".065em",
                                lineHeight: 1.15,
                            }}
                        >
                            {participantStanding(participant)}
                        </Typography>
                        <Typography
                            sx={{
                                mt: 0.45,
                                color: "#e4d4b2",
                                fontFamily: HOC_GAME_FONT_FAMILY,
                                fontSize: "0.88rem",
                                fontWeight: 800,
                                lineHeight: 1,
                            }}
                        >
                            {participant.isAi
                                ? "RATING —"
                                : participant.calibration
                                  ? "MMR HIDDEN"
                                  : visibleMmr !== undefined
                                    ? `${Math.round(visibleMmr).toLocaleString("en-US")} MMR`
                                    : "MMR —"}
                        </Typography>
                    </>
                )}
                <Stack
                    direction={reversed ? "row-reverse" : "row"}
                    spacing={0.55}
                    sx={{ mt: 0.65, alignItems: "center", minHeight: 20 }}
                >
                    {!participant.showRewards ? (
                        <Typography sx={{ color: "#9d927e", fontSize: "0.61rem", fontWeight: 800 }}>
                            {teamName(participant.team).toUpperCase()} ARMY
                        </Typography>
                    ) : participant.settled ? (
                        <>
                            {!participant.calibration && !participant.isAi && (
                                <Box
                                    sx={{
                                        px: 0.75,
                                        py: 0.35,
                                        borderRadius: "5px",
                                        bgcolor: mmrDelta >= 0 ? "rgba(92,156,111,.15)" : "rgba(176,72,76,.14)",
                                        border: `1px solid ${mmrDelta >= 0 ? "rgba(116,201,138,.35)" : "rgba(223,100,105,.32)"}`,
                                        color: mmrDelta >= 0 ? "#94d9a5" : "#ee9a90",
                                        fontSize: "0.64rem",
                                        fontWeight: 900,
                                        lineHeight: 1,
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {signedResult(mmrDelta)} MMR
                                </Box>
                            )}
                            {!participant.isAi && (
                                <Box
                                    sx={{
                                        px: 0.75,
                                        py: 0.35,
                                        borderRadius: "5px",
                                        bgcolor: "rgba(197,145,45,.12)",
                                        border: "1px solid rgba(225,178,82,.3)",
                                        color: "#f1cc76",
                                        fontSize: "0.64rem",
                                        fontWeight: 900,
                                        lineHeight: 1,
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    +{Math.round(goldEarned).toLocaleString("en-US")} GOLD
                                </Box>
                            )}
                        </>
                    ) : (
                        <Typography sx={{ color: "#9d927e", fontSize: "0.61rem", fontWeight: 800 }}>
                            FINAL REWARDS PENDING…
                        </Typography>
                    )}
                </Stack>
            </Box>
            <Box
                sx={{
                    position: "absolute",
                    top: 7,
                    ...(reversed ? { left: 8 } : { right: 8 }),
                    color: won ? color : "rgba(207,196,174,.55)",
                    fontFamily: HOC_GAME_FONT_FAMILY,
                    fontSize: "0.55rem",
                    fontWeight: 900,
                    letterSpacing: ".1em",
                    lineHeight: 1,
                }}
            >
                {resultLabel}
            </Box>
        </Box>
    );
};

const CompactBattleStat: React.FC<{ label: string; value: string; valueColor?: string }> = ({
    label,
    value,
    valueColor = "#d8bd83",
}) => (
    <Box
        sx={{
            position: "relative",
            flex: 1,
            minWidth: 0,
            height: 35,
            px: 1.1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.55,
            textAlign: "center",
            borderRadius: "7px",
            border: "1px solid rgba(53,51,48,.86)",
            background: "linear-gradient(180deg, rgba(17,17,16,.88), rgba(7,7,7,.94))",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,.82), 0 3px 7px rgba(0,0,0,.62)",
        }}
    >
        <Typography
            sx={{
                color: "#bfa56f",
                fontFamily: HOC_GAME_FONT_FAMILY,
                fontSize: "0.6rem",
                fontWeight: 800,
                letterSpacing: "0.035em",
                lineHeight: 1,
                whiteSpace: "nowrap",
            }}
        >
            {label}
        </Typography>
        <Typography
            sx={{
                color: valueColor,
                fontFamily: HOC_GAME_FONT_FAMILY,
                fontSize: "0.8rem",
                fontWeight: 900,
                letterSpacing: "0.025em",
                lineHeight: 1,
                textShadow: `0 0 8px ${valueColor}35, 0 1px 2px #000`,
                whiteSpace: "nowrap",
            }}
        >
            {value}
        </Typography>
    </Box>
);

const fellPercentage = (killedTotal: number, startTotal: number, fallbackPct: number): number =>
    Math.round(Math.min(100, Math.max(0, startTotal > 0 ? (killedTotal / startTotal) * 100 : fallbackPct)));

interface FightResultPlayerRef {
    playerId?: string;
    team: TeamType;
    label?: string;
    isAi?: boolean;
}

interface FightFinishedOverlayProps {
    mode?: "sandbox" | "ranked";
    canReplay?: boolean;
    /** Ranked game id used to load the authoritative post-match MMR and gold settlement. */
    gameId?: string;
    /** The two seats already known by the ranked board; profiles fill in asynchronously. */
    players?: readonly FightResultPlayerRef[];
    /** Marks the signed-in participant without exposing observer-only assumptions. */
    viewerPlayerId?: string;
    onReplay?: () => void | Promise<void>;
    backLabel?: string;
    // Ranked-only post-match actions. Both are optional so the overlay degrades to the old bare
    // "Close" button for any caller that doesn't wire them (e.g. a future non-vs-AI ranked surface).
    onPlayAgainVsAi?: () => void | Promise<void>;
    onBackToLobby?: () => void;
}

// =============================================================================
// Overlay
// =============================================================================
export const FightFinishedOverlay: React.FC<FightFinishedOverlayProps> = ({
    canReplay: canReplayOverride,
    gameId,
    mode = "sandbox",
    players = [],
    viewerPlayerId,
    onReplay,
    backLabel = "Back to Lobby",
    onPlayAgainVsAi,
    onBackToLobby,
}) => {
    const manager = usePixiManager();
    const previewParams = new URLSearchParams(window.location.search);
    const previewMode = import.meta.env.DEV && previewParams.get("fight-results-preview") === "1";
    const requestedPreviewBackground = previewParams.get("fight-results-bg");
    const previewBackground =
        import.meta.env.DEV && requestedPreviewBackground?.startsWith("/@fs/") ? requestedPreviewBackground : undefined;
    const [visibleState, setVisibleState] = useState<IVisibleState>({} as IVisibleState);
    const [dismissed, setDismissed] = useState(false);
    const [replayResult, setReplayResult] = useState(false);
    const [playAgainBusy, setPlayAgainBusy] = useState(false);
    const [playAgainError, setPlayAgainError] = useState("");
    const [rankedMatch, setRankedMatch] = useState<PublicRankedMatch | null>(null);
    const [profiles, setProfiles] = useState<Record<string, PublicPlayerStats>>({});
    const replayInProgress = useRef(false);
    const replayTimers = useRef<number[]>([]);

    useEffect(() => {
        setVisibleState(manager.GetCurrentVisibleState());
        const connection = manager.onVisibleStateUpdated.connect((s: IVisibleState) => {
            setVisibleState(s);
            // A new fight has begun — re-arm the overlay for next time.
            if (!s.hasFinished) {
                setDismissed(false);
                if (!replayInProgress.current) {
                    setReplayResult(false);
                }
                setPlayAgainBusy(false);
                setPlayAgainError("");
            }
        });
        return () => {
            connection.disconnect();
            replayTimers.current.forEach(window.clearTimeout);
            replayTimers.current = [];
        };
    }, [manager]);

    const renderedState = previewMode ? RESULTS_PREVIEW_STATE : visibleState;
    const stats: IFightStatsReport | undefined = renderedState.fightStats;

    useEffect(() => {
        if (previewMode || mode !== "ranked" || !gameId || !renderedState.hasFinished) {
            return undefined;
        }
        let cancelled = false;
        let retryTimer: number | undefined;
        const load = async (attempt: number): Promise<void> => {
            try {
                const result = await fetchPublicRankedMatch(gameId);
                if (!cancelled) setRankedMatch(result);
            } catch {
                // Settlement is intentionally written after combat completion. A short retry window keeps
                // the overlay from flashing empty rewards during that normal handoff.
                if (!cancelled && attempt < 7) {
                    retryTimer = window.setTimeout(() => void load(attempt + 1), Math.min(400 * attempt, 1600));
                }
            }
        };
        setRankedMatch(null);
        void load(1);
        return () => {
            cancelled = true;
            if (retryTimer !== undefined) window.clearTimeout(retryTimer);
        };
    }, [gameId, mode, previewMode, renderedState.hasFinished]);

    const activeMatch = previewMode ? RESULTS_PREVIEW_MATCH : rankedMatch;
    const profileCandidates = activeMatch
        ? activeMatch.players.map((player) => ({
              playerId: player.playerId,
              isAi: players.some((candidate) => candidate.playerId === player.playerId && candidate.isAi),
          }))
        : players.map((player) => ({ playerId: player.playerId, isAi: player.isAi }));
    const profileKey = profileCandidates
        .map((player) => `${player.playerId ?? ""}:${player.isAi ? "ai" : "human"}`)
        .sort()
        .join("|");

    useEffect(() => {
        if (previewMode) {
            setProfiles(RESULTS_PREVIEW_PROFILES);
            return undefined;
        }
        if (mode !== "ranked") {
            setProfiles({});
            return undefined;
        }
        let cancelled = false;
        const ids = profileCandidates
            .filter((player) => player.playerId && !player.isAi)
            .map((player) => player.playerId as string);
        if (ids.length === 0) return undefined;
        void Promise.all(
            ids.map(async (playerId) => {
                try {
                    return [playerId, await fetchPublicPlayerStats(playerId)] as const;
                } catch {
                    return undefined;
                }
            }),
        ).then((results) => {
            if (cancelled) return;
            const resolved = results.filter((result): result is readonly [string, PublicPlayerStats] => !!result);
            if (resolved.length > 0) setProfiles((current) => ({ ...current, ...Object.fromEntries(resolved) }));
        });
        return () => {
            cancelled = true;
        };
        // profileKey represents the stable seat identities; profileCandidates itself is rebuilt while rendering.
    }, [mode, previewMode, profileKey]);

    // A finished fight shows this overlay — for BOTH players, and when a completed game is (re)loaded.
    // teamWin === TeamVals.NO_TEAM is a genuine DRAW (e.g. armageddon wiping both sides on the same lap),
    // NOT "no winner yet" — that in-progress state is represented by teamWin === undefined instead (see
    // RankedPlayScene.applyRankedFightStats), so NO_TEAM is a valid, overlay-showing value here. We
    // intentionally do NOT gate on the per-team start totals: when a finished game is loaded cold, the
    // losing team's units have been cleaned up server-side, so its start total reconstructs as 0 — gating
    // on that would silently swallow the results overlay. The percentage math (percent() / CasualtyRoster)
    // already guards against a 0 total, so a missing start total just degrades that team's casualty
    // figures rather than hiding the whole overlay.
    if (
        !renderedState.hasFinished ||
        !stats ||
        dismissed ||
        renderedState.teamWin === undefined ||
        stats.winner !== renderedState.teamWin
    ) {
        return null;
    }

    const isDraw = stats.winner === TeamVals.NO_TEAM;
    const winnerColor = isDraw ? GOLD : teamColor(stats.winner);
    const canSandboxReplay = manager.CanPlayCurrentSandboxReplay();
    const canReplay = previewMode || (canReplayOverride ?? canSandboxReplay);
    const showSandboxActions = mode === "sandbox" && (previewMode || canSandboxReplay);
    const showRematchAction = showSandboxActions && !replayResult;
    const finalSample = stats.series.at(-1);
    const leftFellPct = fellPercentage(stats.leftKilledTotal, stats.leftStartTotal, finalSample?.leftKilledPct ?? 0);
    const rightFellPct = fellPercentage(
        stats.rightKilledTotal,
        stats.rightStartTotal,
        finalSample?.rightKilledPct ?? 0,
    );
    const topDamage = Math.max(0, ...(stats.damageByUnit ?? []).map((entry) => entry.damage));
    const resultParticipants = ([LOWER_TEAM, UPPER_TEAM] as TeamType[]).map((team): ResultParticipant => {
        const side = team === LOWER_TEAM ? "lower" : "upper";
        const settlement = activeMatch?.players.find((player) => player.side === side);
        const seat = players.find(
            (player) => player.team === team || (!!settlement?.playerId && player.playerId === settlement.playerId),
        );
        const playerId = settlement?.playerId ?? seat?.playerId;
        const profile = playerId ? profiles[playerId] : undefined;
        const fallbackResult = isDraw ? "draw" : stats.winner === team ? "win" : "loss";
        const fallbackName = seat?.label || (team === LOWER_TEAM ? "Green Player" : "Red Player");
        return {
            team,
            playerId,
            username: settlement?.username || profile?.username || fallbackName,
            isAi: !!seat?.isAi,
            calibration: settlement?.calibration ?? profile?.state === "calibration",
            mmrAfter: settlement?.mmrAfter ?? profile?.mmr,
            mmrDelta: settlement?.delta,
            goldEarned: settlement?.goldEarned,
            showRewards: previewMode || mode === "ranked",
            settled: !!settlement,
            result: settlement?.result ?? fallbackResult,
            profile,
        };
    });
    const resultsBackground = previewBackground ?? imgSrc("fight_results_moonlit_castle_background");
    const splitBackgroundImage = previewBackground
        ? `url(${resultsBackground})`
        : `url(${imgSrc("fight_results_moonlit_fire_overlay_v9")}), url(${resultsBackground})`;
    const clearReplayTimers = (): void => {
        replayTimers.current.forEach(window.clearTimeout);
        replayTimers.current = [];
    };
    const replayFight = async (): Promise<void> => {
        if (previewMode) return;
        clearReplayTimers();
        setDismissed(true);
        replayInProgress.current = true;
        try {
            if (onReplay) {
                await onReplay();
                setReplayResult(true);
                return;
            }

            const replay = manager.GetCurrentSandboxReplay();
            if (!replay?.actions.length) {
                return;
            }

            await manager.PlaySandboxReplay(replay);
            setReplayResult(true);
        } finally {
            replayInProgress.current = false;
            setDismissed(false);
        }
    };

    return (
        <Box
            sx={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                zIndex: 9998,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#050504",
                overflow: "hidden",
            }}
        >
            {/* Preserve both illustrated edges at tall/full-screen aspect ratios. Each half renders
                the same full canvas but pins its important outer edge; any necessary crop therefore
                disappears from the quiet centre. The animated fire uses the identical split and stays
                registered to the braziers. */}
            <Box
                aria-hidden
                sx={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 0,
                    display: "flex",
                    pointerEvents: "none",
                }}
            >
                {(["left", "right"] as const).map((edge) => (
                    <Box
                        key={edge}
                        sx={{
                            width: "50%",
                            height: "100%",
                            flexShrink: 0,
                            backgroundImage: splitBackgroundImage,
                            backgroundSize: previewBackground ? "cover" : "cover, cover",
                            backgroundPosition: previewBackground ? `${edge} center` : `${edge} center, ${edge} center`,
                            backgroundRepeat: previewBackground ? "no-repeat" : "no-repeat, no-repeat",
                        }}
                    />
                ))}
            </Box>

            <Box
                component={motion.div}
                initial={{ opacity: 0, scale: 0.9, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 24 }}
                sx={{
                    position: "relative",
                    zIndex: 2,
                    width: "94.5%",
                    maxWidth: 960,
                    // The reference is a compact, almost-square forged results plaque. Keep that
                    // silhouette on large screens while still respecting short laptop viewports.
                    height: "min(97.5vh, 940px)",
                    maxHeight: "97.5vh",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    isolation: "isolate",
                    textTransform: "uppercase",
                    borderRadius: "11px",
                    border: "none",
                    backgroundColor: "transparent",
                    boxShadow: "0 22px 60px rgba(0,0,0,.92), 0 0 24px rgba(0,0,0,.72)",
                    padding: "18px 22px 16px",
                    "&::before": {
                        content: '""',
                        position: "absolute",
                        inset: 0,
                        zIndex: -1,
                        pointerEvents: "none",
                        borderRadius: "11px",
                        // Keep only a warm tint from the dense raster while the battlefield remains clearly visible.
                        // 30% opaque means 70% transparent.
                        // Foreground UI stays fully opaque.
                        opacity: 0.3,
                        backgroundImage: `url(${imgSrc("fight_results_burnished_bronze_panel_background_v1")})`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                        backgroundSize: "cover",
                    },
                    "&::after": {
                        content: '""',
                        position: "absolute",
                        inset: 0,
                        zIndex: 5,
                        pointerEvents: "none",
                        boxSizing: "border-box",
                        border: "2px solid rgba(48,47,45,.94)",
                        borderRadius: "11px",
                        boxShadow:
                            "inset 0 0 0 2px rgba(3,3,3,.99), inset 0 0 0 4px rgba(82,72,62,.1), inset 0 0 18px rgba(0,0,0,.86)",
                    },
                }}
            >
                <Box
                    aria-hidden
                    sx={{
                        position: "absolute",
                        inset: 9,
                        zIndex: 4,
                        pointerEvents: "none",
                        border: "1px solid rgba(42,41,39,.66)",
                        borderRadius: "5px",
                    }}
                />
                {/* Close button */}
                <Box
                    component="button"
                    aria-label="Close fight results"
                    onClick={() => setDismissed(true)}
                    sx={{
                        position: "absolute",
                        top: 10,
                        right: 12,
                        width: 27,
                        height: 27,
                        p: 0,
                        border: "1px solid rgba(88,67,47,.72)",
                        borderRadius: "50%",
                        background: "linear-gradient(180deg, rgba(44,32,23,.96), rgba(17,13,10,.98))",
                        color: "#d7b77a",
                        fontFamily: HOC_GAME_FONT_FAMILY,
                        fontSize: "28.8px",
                        fontWeight: 400,
                        lineHeight: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "var(--hoc-cursor-interactive), pointer",
                        zIndex: 6,
                        boxShadow: "inset 0 0 0 1px rgba(226,182,111,.08), 0 2px 4px rgba(0,0,0,.72)",
                        transition:
                            "transform .14s ease, border-color .14s ease, color .14s ease, box-shadow .14s ease",
                        "&:hover": {
                            transform: "scale(1.04)",
                            borderColor: "rgba(209,155,76,.92)",
                            color: "#f0cf91",
                            boxShadow: "inset 0 0 0 1px rgba(226,182,111,.12), 0 0 5px rgba(190,123,48,.3)",
                        },
                    }}
                >
                    ×
                </Box>

                {/* The fight is framed as two players, not two abstract team colours. Rank emblems
                    double as avatars; exact settlement numbers arrive from the public ranked result. */}
                <Stack direction="row" spacing={0.9} sx={{ flexShrink: 0, mb: 0.8, px: 0.25 }}>
                    <ResultParticipantCard
                        participant={resultParticipants[0]}
                        showRankedDetails={mode === "ranked" || !!previewMode}
                        viewerPlayerId={viewerPlayerId}
                    />
                    <Box
                        sx={{
                            width: 126,
                            height: 118,
                            flexShrink: 0,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "10px",
                            border: "1px solid rgba(65,61,56,.94)",
                            background: "radial-gradient(circle at 50% 34%, rgba(96,69,34,.32), rgba(10,9,8,.96) 68%)",
                            boxShadow: "inset 0 0 0 2px rgba(0,0,0,.76), 0 4px 10px rgba(0,0,0,.72)",
                        }}
                    >
                        <Box
                            sx={{
                                width: 62,
                                height: 62,
                                mb: 0.2,
                                borderRadius: "50%",
                                display: "grid",
                                placeItems: "center",
                                border: `2px solid ${winnerColor}8f`,
                                background: "radial-gradient(circle at 48% 38%, #3a3026, #090909 70%)",
                                boxShadow: `inset 0 0 0 3px rgba(0,0,0,.84), 0 0 13px ${winnerColor}35`,
                            }}
                        >
                            {isDraw ? (
                                <Typography sx={{ color: GOLD, fontSize: "1.7rem", lineHeight: 1 }}>⚖</Typography>
                            ) : (
                                <Box
                                    component="img"
                                    src={imgSrc("fight_results_trophy_v1")}
                                    alt="Victory trophy"
                                    sx={{ width: 45, height: 45, objectFit: "contain" }}
                                />
                            )}
                        </Box>
                        <Typography
                            sx={{
                                color: winnerColor,
                                fontFamily: HOC_GAME_FONT_FAMILY,
                                fontSize: "0.74rem",
                                fontWeight: 900,
                                letterSpacing: ".075em",
                                lineHeight: 1.05,
                                textAlign: "center",
                                textShadow: `0 0 9px ${winnerColor}45, 0 2px 2px #000`,
                            }}
                        >
                            {isDraw ? "DRAW" : "VICTORY"}
                        </Typography>
                        <Typography
                            sx={{
                                mt: 0.28,
                                color: "#a99878",
                                fontSize: "0.54rem",
                                fontWeight: 800,
                                letterSpacing: ".055em",
                                lineHeight: 1,
                            }}
                        >
                            {mode === "ranked" || previewMode ? "RANKED" : "BATTLE"} · {Math.max(0, stats.totalLaps)}{" "}
                            LAPS
                        </Typography>
                    </Box>
                    <ResultParticipantCard
                        participant={resultParticipants[1]}
                        reversed
                        showRankedDetails={mode === "ranked" || !!previewMode}
                        viewerPlayerId={viewerPlayerId}
                    />
                </Stack>

                <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0, mb: 1.25, px: 0.25 }}>
                    <CompactBattleStat label="LENGTH" value={`${Math.max(0, stats.totalLaps)} LAPS`} />
                    <CompactBattleStat
                        label="GREEN LOST"
                        value={`${leftFellPct}%`}
                        valueColor={teamColor(LOWER_TEAM)}
                    />
                    <CompactBattleStat label="RED LOST" value={`${rightFellPct}%`} valueColor={teamColor(UPPER_TEAM)} />
                    <CompactBattleStat
                        label="TOP DAMAGE"
                        value={Math.round(topDamage).toLocaleString("en-US")}
                        valueColor="#d5ad61"
                    />
                </Stack>

                {/* The middle band itself never moves. Only the damage list may scroll, so the chart,
                    casualty wells and action buttons retain the same coordinates for every fight. */}
                <Box
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        overflow: "hidden",
                        pb: 1.5,
                    }}
                >
                    <Box
                        sx={{
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                        }}
                    >
                        <CasualtyChartPanel series={stats.series} ornateResultsFrame />

                        {/* Damage stays in the fixed space between the chart and roster. Longer lists
                            scroll here instead of moving or resizing any surrounding container. */}
                        <Box
                            sx={{
                                flex: 1,
                                minHeight: 0,
                                overflowY: "auto",
                                overflowX: "hidden",
                                overscrollBehavior: "contain",
                                scrollbarWidth: "thin",
                                scrollbarColor: "rgba(74,67,60,.58) transparent",
                                "&::-webkit-scrollbar": { width: "5px" },
                                "&::-webkit-scrollbar-track": { background: "transparent" },
                                "&::-webkit-scrollbar-thumb": {
                                    backgroundColor: "rgba(74,67,60,.58)",
                                    borderRadius: "3px",
                                },
                            }}
                        >
                            <ResultsSectionPlaque label="DAMAGE DEALT" />
                            <DamageBreakdown entries={stats.damageByUnit ?? []} />
                        </Box>

                        {/* Casualty rosters remain pinned to the bottom. */}
                        <Box sx={{ flexShrink: 0 }}>
                            <Stack direction="row" spacing={3} sx={{ px: 1, pt: 2 }}>
                                <CasualtyColumn
                                    team={LOWER_TEAM}
                                    deaths={stats.leftDeaths}
                                    killedTotal={stats.leftKilledTotal}
                                    startTotal={stats.leftStartTotal}
                                    fallbackPct={stats.series.at(-1)?.leftKilledPct ?? 0}
                                />
                                <CasualtyColumn
                                    team={UPPER_TEAM}
                                    deaths={stats.rightDeaths}
                                    killedTotal={stats.rightKilledTotal}
                                    startTotal={stats.rightStartTotal}
                                    fallbackPct={stats.series.at(-1)?.rightKilledPct ?? 0}
                                />
                            </Stack>
                        </Box>
                    </Box>
                </Box>

                <Stack
                    direction="row"
                    spacing={2}
                    sx={{ alignItems: "center", justifyContent: "center", mt: 2, pt: 1, flexShrink: 0 }}
                >
                    {canReplay && (
                        <ActionButton
                            label="REPLAY"
                            labelColor="#dfcf91"
                            tone="gray"
                            frameTone="brown"
                            backgroundOpacity={0.5}
                            visualOpacity={0.9}
                            onClick={replayFight}
                        />
                    )}
                    {showRematchAction && (
                        <ActionButton
                            label="REMATCH"
                            leadingIcon="⚔"
                            labelColor="#dfcf91"
                            primary
                            tone="olive"
                            backgroundOpacity={0.56}
                            visualOpacity={0.8}
                            onClick={() => {
                                if (previewMode) return;
                                console.log("[Rematch] button clicked");
                                clearReplayTimers();
                                setDismissed(true);
                                manager.Rematch();
                            }}
                        />
                    )}
                    {showSandboxActions && (
                        <ActionButton
                            label="+ NEW BATTLE"
                            labelColor="#dfcf91"
                            tone="brown"
                            backgroundOpacity={0.5}
                            visualOpacity={0.7}
                            onClick={() => {
                                if (previewMode) return;
                                clearReplayTimers();
                                setDismissed(true);
                                manager.StartOver();
                            }}
                        />
                    )}
                    {!showSandboxActions && onPlayAgainVsAi && (
                        <ActionButton
                            label={playAgainBusy ? "Starting…" : "⚔ Play Again vs AI"}
                            primary
                            disabled={playAgainBusy}
                            onClick={() => {
                                if (playAgainBusy) return;
                                setPlayAgainError("");
                                setPlayAgainBusy(true);
                                Promise.resolve(onPlayAgainVsAi())
                                    // On success the caller navigates away; only clear the busy flag on
                                    // failure so a rejected click stays clickable instead of stuck.
                                    .catch((err: unknown) => {
                                        setPlayAgainBusy(false);
                                        setPlayAgainError(
                                            err instanceof Error ? err.message : "Unable to start an AI match",
                                        );
                                    });
                            }}
                        />
                    )}
                    {!showSandboxActions && onBackToLobby && (
                        <ActionButton
                            label={backLabel}
                            primary={!onPlayAgainVsAi}
                            onClick={() => {
                                clearReplayTimers();
                                setDismissed(true);
                                onBackToLobby();
                            }}
                        />
                    )}
                    {!showSandboxActions && !onPlayAgainVsAi && !onBackToLobby && (
                        <ActionButton
                            label="Close"
                            primary
                            onClick={() => {
                                clearReplayTimers();
                                setDismissed(true);
                            }}
                        />
                    )}
                </Stack>
                {!showSandboxActions && playAgainError && (
                    <Typography
                        sx={{
                            color: "#ff8a8a",
                            opacity: 0.9,
                            fontSize: "0.78rem",
                            textAlign: "center",
                            mt: 1,
                            flexShrink: 0,
                        }}
                    >
                        {playAgainError}
                    </Typography>
                )}
            </Box>
        </Box>
    );
};
