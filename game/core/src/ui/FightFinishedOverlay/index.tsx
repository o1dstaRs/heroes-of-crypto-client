import { TeamVals, TeamType } from "@heroesofcrypto/common";

import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import Avatar from "@mui/joy/Avatar";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import { motion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";

import { HOC_GAME_FONT_FAMILY } from "../../fontFamilies";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { IFightDeathEntry, IFightStatsReport, IVisibleState } from "../../scenes/VisibleState";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { UNIT_NAME_TO_ID } from "../unit_ui_constants";
import { GOLD, PARCHMENT, WOOD_DARK, imgSrc, teamColor, teamName } from "../FightStats/CasualtyChart";
import { CasualtyChartPanel } from "../FightStats/CasualtyChartPanel";
import { DamageBreakdown } from "../FightStats/DamageBreakdown";
import { t, tf, useTranslation } from "../../i18n/i18n";

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
    teamWin: TeamVals.UPPER,
    fightStats: {
        winner: TeamVals.UPPER,
        series: [
            // HP percentages carry the board-share line: green edges ahead early, red takes the fight back
            // and closes it out — a swing rather than a straight slide, so the preview shows the shape the
            // chart exists to show.
            {
                lap: 1,
                lowerKilled: 0,
                upperKilled: 0,
                lowerKilledPct: 0,
                upperKilledPct: 0,
                lowerHpPct: 100,
                upperHpPct: 100,
            },
            {
                lap: 2,
                lowerKilled: 74,
                upperKilled: 80,
                lowerKilledPct: 37,
                upperKilledPct: 40,
                lowerHpPct: 78,
                upperHpPct: 62,
            },
            {
                lap: 3,
                lowerKilled: 128,
                upperKilled: 126,
                lowerKilledPct: 64,
                upperKilledPct: 63,
                lowerHpPct: 40,
                upperHpPct: 52,
            },
            {
                lap: 4,
                lowerKilled: 160,
                upperKilled: 152,
                lowerKilledPct: 80,
                upperKilledPct: 76,
                lowerHpPct: 18,
                upperHpPct: 44,
            },
            {
                lap: 5,
                lowerKilled: 171,
                upperKilled: 200,
                lowerKilledPct: 86,
                upperKilledPct: 100,
                lowerHpPct: 0,
                upperHpPct: 26,
            },
        ],
        lowerDeaths: [
            { name: "Peasant", smallTextureName: "peasant_512", died: 200, start: 200, team: TeamVals.LOWER },
        ],
        upperDeaths: [
            { name: "Peasant", smallTextureName: "peasant_512", died: 171, start: 200, team: TeamVals.UPPER },
        ],
        damageByUnit: [
            { name: "Peasant", smallTextureName: "peasant_512", damage: 1600, team: TeamVals.UPPER },
            { name: "Squire", smallTextureName: "squire_512", damage: 1315, team: TeamVals.UPPER },
            { name: "Arbalester", smallTextureName: "arbalester_512", damage: 1080, team: TeamVals.UPPER },
            { name: "Blacksmith", smallTextureName: "blacksmith_512", damage: 760, team: TeamVals.UPPER },
            { name: "Peasant", smallTextureName: "peasant_512", damage: 1370, team: TeamVals.LOWER },
            { name: "Squire", smallTextureName: "squire_512", damage: 1160, team: TeamVals.LOWER },
            { name: "Arbalester", smallTextureName: "arbalester_512", damage: 920, team: TeamVals.LOWER },
            { name: "Blacksmith", smallTextureName: "blacksmith_512", damage: 610, team: TeamVals.LOWER },
        ],
        lowerStartTotal: 200,
        upperStartTotal: 200,
        lowerKilledTotal: 200,
        upperKilledTotal: 171,
        totalLaps: 5,
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
                        {t("No casualties — flawless.")}
                    </Typography>
                )}
                {deaths.map((d) => (
                    <Tooltip
                        key={d.name}
                        title={tf("{name}: {died} of {start} lost", {
                            name: d.name,
                            died: d.died,
                            start: d.start,
                        })}
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

const SummaryStatCard: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string;
    valueColor: string;
}> = ({ icon, label, value, valueColor }) => (
    <Box
        sx={{
            position: "relative",
            flex: 1,
            minWidth: 0,
            height: 104,
            px: 1,
            py: 1.1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            borderRadius: "9px",
            border: "1px solid rgba(53,51,48,.86)",
            backgroundColor: "transparent",
            isolation: "isolate",
            boxShadow: "inset 0 0 0 2px rgba(0,0,0,.82), inset 0 0 0 3px rgba(82,72,62,.1), 0 3px 8px rgba(0,0,0,.68)",
            "&::before": {
                content: '\"\"',
                position: "absolute",
                inset: 0,
                zIndex: -1,
                borderRadius: "inherit",
                opacity: 0.9,
                backgroundImage: `linear-gradient(180deg, rgba(17,17,16,.82), rgba(7,7,7,.94)), url(${imgSrc(
                    "fight_results_dragonfire_panel_texture",
                )})`,
                backgroundRepeat: "no-repeat, repeat",
                backgroundSize: "cover, 160px 80px",
                pointerEvents: "none",
            },
            "&::after": {
                content: '\"\"',
                position: "absolute",
                inset: 4,
                zIndex: 1,
                border: "1px solid rgba(45,44,42,.62)",
                borderRadius: "6px",
                pointerEvents: "none",
            },
        }}
    >
        <Box sx={{ height: 30, display: "flex", alignItems: "center", justifyContent: "center", mb: 0.15 }}>{icon}</Box>
        <Typography
            sx={{
                color: "#bfa56f",
                fontFamily: HOC_GAME_FONT_FAMILY,
                fontSize: "0.67rem",
                fontWeight: 700,
                letterSpacing: "0.035em",
                lineHeight: 1.15,
                whiteSpace: "nowrap",
            }}
        >
            {label}
        </Typography>
        <Typography
            sx={{
                mt: 0.35,
                color: valueColor,
                fontFamily: HOC_GAME_FONT_FAMILY,
                fontSize: "1.42rem",
                fontWeight: 500,
                letterSpacing: "0.025em",
                lineHeight: 1,
                textShadow: `0 0 9px ${valueColor}40, 0 2px 2px #000`,
                whiteSpace: "nowrap",
            }}
        >
            {value}
        </Typography>
    </Box>
);

const fellPercentage = (killedTotal: number, startTotal: number, fallbackPct: number): number =>
    Math.round(Math.min(100, Math.max(0, startTotal > 0 ? (killedTotal / startTotal) * 100 : fallbackPct)));

interface FightFinishedOverlayProps {
    mode?: "sandbox" | "ranked";
    canReplay?: boolean;
    /** Set for vs-AI matches: the tiered bot identity ("AI — Hard (v0.7)"), shown under the banner. */
    opponentLabel?: string;
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
    mode = "sandbox",
    opponentLabel,
    onReplay,
    backLabel = "Back to Lobby",
    onPlayAgainVsAi,
    onBackToLobby,
}) => {
    useTranslation();
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
    const lowerFellPct = fellPercentage(
        stats.lowerKilledTotal,
        stats.lowerStartTotal,
        finalSample?.lowerKilledPct ?? 0,
    );
    const upperFellPct = fellPercentage(
        stats.upperKilledTotal,
        stats.upperStartTotal,
        finalSample?.upperKilledPct ?? 0,
    );
    const topDamage = Math.max(0, ...(stats.damageByUnit ?? []).map((entry) => entry.damage));
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
                overflowX: "hidden",
                overflowY: "auto",
                p: { xs: 1, sm: 2 },
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
                    aria-label={t("Close fight results")}
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

                {/* Trophy medallion overlaps a restrained metal title plate, matching the compact
                    forged header in the selected results-screen direction. */}
                <Box sx={{ height: 76, flexShrink: 0, display: "flex", justifyContent: "center", mb: 1.1 }}>
                    <Box sx={{ position: "relative", width: "68%", minWidth: 520, maxWidth: 650, height: 72 }}>
                        <Box
                            sx={{
                                position: "absolute",
                                inset: "6px 0 4px 54px",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                pl: 2.5,
                                border: "1px solid rgba(48,47,44,.78)",
                                backgroundColor: "transparent",
                                isolation: "isolate",
                                boxShadow:
                                    "inset 0 0 0 2px rgba(0,0,0,.84), inset 0 0 0 3px rgba(82,72,62,.08), 0 5px 12px rgba(0,0,0,.62)",
                                "&::before": {
                                    content: '\"\"',
                                    position: "absolute",
                                    inset: 0,
                                    zIndex: -1,
                                    opacity: 0.9,
                                    backgroundImage: `linear-gradient(180deg, rgba(18,18,17,.91), rgba(8,8,8,.96)), url(${imgSrc(
                                        "fight_results_dragonfire_panel_texture",
                                    )})`,
                                    backgroundRepeat: "no-repeat, repeat",
                                    backgroundSize: "cover, 160px 80px",
                                    pointerEvents: "none",
                                },
                            }}
                        >
                            <Typography
                                sx={{
                                    color: winnerColor,
                                    fontWeight: 600,
                                    fontFamily: HOC_GAME_FONT_FAMILY,
                                    letterSpacing: "0.075em",
                                    fontSize: "clamp(1.65rem, 4vw, 2.25rem)",
                                    lineHeight: 1,
                                    textShadow: `0 0 14px ${winnerColor}72, 0 2px 2px #000`,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {isDraw ? "DRAW" : `${teamName(stats.winner).toUpperCase()} TEAM WINS`}
                            </Typography>
                            {opponentLabel && (
                                <Typography
                                    sx={{ color: GOLD, opacity: 0.82, fontSize: "0.67rem", fontWeight: 700, mt: 0.35 }}
                                >
                                    vs {opponentLabel}
                                </Typography>
                            )}
                        </Box>

                        <Box
                            sx={{
                                position: "absolute",
                                left: 0,
                                top: -2,
                                width: 78,
                                height: 78,
                                borderRadius: "50%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background:
                                    "radial-gradient(circle at 48% 38%, rgba(57,48,39,.96), rgba(9,9,9,.98) 68%)",
                                border: "2px solid rgba(59,55,50,.9)",
                                boxShadow:
                                    "inset 0 0 0 3px rgba(0,0,0,.88), inset 0 0 0 5px rgba(88,72,57,.1), 0 5px 12px rgba(0,0,0,.8)",
                                zIndex: 2,
                            }}
                        >
                            {isDraw ? (
                                <Typography sx={{ color: GOLD, fontSize: "2rem", lineHeight: 1 }}>⚖</Typography>
                            ) : (
                                <Box
                                    component="img"
                                    src={imgSrc("fight_results_trophy_v1")}
                                    alt="Victory trophy"
                                    sx={{ width: 55, height: 55, objectFit: "contain" }}
                                />
                            )}
                        </Box>
                    </Box>
                </Box>

                <Stack direction="row" spacing={1.25} sx={{ flexShrink: 0, mb: 1.5, px: 0.25 }}>
                    <SummaryStatCard
                        label="BATTLE LENGTH"
                        value={`L${Math.max(0, stats.totalLaps)}`}
                        valueColor="#d8bd83"
                        icon={<HourglassTopRoundedIcon sx={{ color: "#b69254", fontSize: 29 }} />}
                    />
                    <SummaryStatCard
                        label={`${teamName(TeamVals.LOWER as TeamType).toUpperCase()} LOSSES`}
                        value={`${lowerFellPct}% FELL`}
                        valueColor={teamColor(TeamVals.LOWER as TeamType)}
                        icon={<ShieldRoundedIcon sx={{ color: teamColor(TeamVals.LOWER as TeamType), fontSize: 30 }} />}
                    />
                    <SummaryStatCard
                        label={`${teamName(TeamVals.UPPER as TeamType).toUpperCase()} LOSSES`}
                        value={`${upperFellPct}% FELL`}
                        valueColor={teamColor(TeamVals.UPPER as TeamType)}
                        icon={<ShieldRoundedIcon sx={{ color: teamColor(TeamVals.UPPER as TeamType), fontSize: 30 }} />}
                    />
                    <SummaryStatCard
                        label="TOP DAMAGE"
                        value={Math.round(topDamage).toLocaleString("en-US")}
                        valueColor="#d5ad61"
                        icon={
                            <Typography
                                aria-hidden
                                sx={{ color: "#b69254", fontFamily: HOC_GAME_FONT_FAMILY, fontSize: 27, lineHeight: 1 }}
                            >
                                ⚔
                            </Typography>
                        }
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
                        "@media (max-width: 899px), (max-height: 760px)": {
                            overflow: "visible",
                        },
                    }}
                >
                    <Box
                        sx={{
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            "@media (max-width: 899px), (max-height: 760px)": {
                                height: "auto",
                            },
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
                                "@media (max-width: 899px), (max-height: 760px)": {
                                    overflowY: "visible",
                                },
                            }}
                        >
                            <ResultsSectionPlaque label={t("DAMAGE DEALT")} />
                            <DamageBreakdown entries={stats.damageByUnit ?? []} />
                        </Box>

                        {/* Casualty rosters remain pinned to the bottom. */}
                        <Box sx={{ flexShrink: 0 }}>
                            {/* "1px", not 1: MUI reads a unitless height <= 1 as a fraction, so
                                `height: 1` is 100%. Harmless while the parent was auto-height, but the
                                parent has a definite height now and the rule would blow it up to fill. */}
                            <Box
                                sx={{
                                    position: "relative",
                                    height: "1.8px",
                                    my: 2,
                                    background:
                                        "linear-gradient(90deg, transparent, rgba(53,47,42,.6) 6%, rgba(73,59,47,.65) 50%, rgba(53,47,42,.6) 94%, transparent)",
                                    boxShadow: "0 2px 8px rgba(0,0,0,.34), 0 -1px 0 rgba(0,0,0,.94)",
                                }}
                            />

                            <Stack direction="row" spacing={3}>
                                <CasualtyColumn
                                    team={TeamVals.LOWER as TeamType}
                                    deaths={stats.lowerDeaths}
                                    killedTotal={stats.lowerKilledTotal}
                                    startTotal={stats.lowerStartTotal}
                                    fallbackPct={stats.series.at(-1)?.lowerKilledPct ?? 0}
                                />
                                <CasualtyColumn
                                    team={TeamVals.UPPER as TeamType}
                                    deaths={stats.upperDeaths}
                                    killedTotal={stats.upperKilledTotal}
                                    startTotal={stats.upperStartTotal}
                                    fallbackPct={stats.series.at(-1)?.upperKilledPct ?? 0}
                                />
                            </Stack>
                        </Box>
                    </Box>
                </Box>

                <Stack
                    direction="row"
                    spacing={2}
                    sx={{
                        alignItems: "center",
                        justifyContent: "center",
                        flexWrap: "wrap",
                        rowGap: 1.25,
                        mt: 2,
                        pt: 1,
                        flexShrink: 0,
                    }}
                >
                    {canReplay && (
                        <ActionButton
                            label={t("REPLAY")}
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
                            label={t("REMATCH")}
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
                            label={t("+ NEW BATTLE")}
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
                            label={playAgainBusy ? t("Starting…") : `⚔ ${t("Play Again vs AI")}`}
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
                                            err instanceof Error ? t(err.message) : t("Unable to start an AI match"),
                                        );
                                    });
                            }}
                        />
                    )}
                    {!showSandboxActions && onBackToLobby && (
                        <ActionButton
                            label={t(backLabel)}
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
                            label={t("Close")}
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
