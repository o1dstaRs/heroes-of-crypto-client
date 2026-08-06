import { TeamVals, TeamType } from "@heroesofcrypto/common";

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
import { GOLD, PARCHMENT, WOOD_DARK, imgSrc, teamColor, teamName } from "../FightStats/CasualtyChart";
import { CasualtyChartPanel } from "../FightStats/CasualtyChartPanel";
import { DamageBreakdown } from "../FightStats/DamageBreakdown";

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
            { lap: 1, lowerKilled: 0, upperKilled: 0, lowerKilledPct: 0, upperKilledPct: 0 },
            { lap: 2, lowerKilled: 74, upperKilled: 80, lowerKilledPct: 37, upperKilledPct: 40 },
            { lap: 3, lowerKilled: 128, upperKilled: 126, lowerKilledPct: 64, upperKilledPct: 63 },
            { lap: 4, lowerKilled: 160, upperKilled: 152, lowerKilledPct: 80, upperKilledPct: 76 },
            { lap: 5, lowerKilled: 171, upperKilled: 200, lowerKilledPct: 86, upperKilledPct: 100 },
        ],
        lowerDeaths: [
            { name: "Peasant", smallTextureName: "peasant_512", died: 200, start: 200, team: TeamVals.LOWER },
        ],
        upperDeaths: [
            { name: "Peasant", smallTextureName: "peasant_512", died: 171, start: 200, team: TeamVals.UPPER },
        ],
        damageByUnit: [
            { name: "Peasant", smallTextureName: "peasant_512", damage: 1600, team: TeamVals.UPPER },
            { name: "Peasant", smallTextureName: "peasant_512", damage: 1370, team: TeamVals.LOWER },
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
}> = ({ team, deaths, killedTotal, startTotal }) => {
    const color = teamColor(team);
    const pct = startTotal > 0 ? Math.round((killedTotal / startTotal) * 100) : 0;
    const frameImage =
        team === TeamVals.LOWER
            ? imgSrc("fight_results_fallen_green_frame_v3")
            : imgSrc("fight_results_fallen_red_frame_v3");

    return (
        <Box sx={{ flex: 1, minWidth: 220 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
                <Box
                    sx={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        backgroundColor: color,
                        boxShadow: `0 0 8px ${color}`,
                    }}
                />
                <Typography sx={{ color: PARCHMENT, fontWeight: 700 }}>{teamName(team)} army</Typography>
                <Typography sx={{ color, fontWeight: 700, ml: "auto" }}>
                    {killedTotal} / {startTotal} fell ({pct}%)
                </Typography>
            </Stack>
            <Box
                sx={{
                    position: "relative",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 1,
                    p: 1.25,
                    borderRadius: 0,
                    border: "none",
                    backgroundColor: "rgba(0,0,0,0.25)",
                    minHeight: 68,
                    "&::after": {
                        content: '""',
                        position: "absolute",
                        inset: 0,
                        zIndex: 3,
                        pointerEvents: "none",
                        boxSizing: "border-box",
                        backgroundImage: `url(${frameImage})`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                        backgroundSize: "100% 100%",
                        filter: team === TeamVals.LOWER ? "brightness(1.55) saturate(.9)" : "brightness(1.08)",
                    },
                }}
            >
                {deaths.length === 0 && (
                    <Typography sx={{ color: PARCHMENT, opacity: 0.6, fontStyle: "italic", p: 1 }}>
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
                        <Box sx={{ position: "relative" }}>
                            <Avatar
                                src={imgSrc(d.smallTextureName)}
                                variant="plain"
                                sx={{
                                    width: 52,
                                    height: 52,
                                    borderRadius: "14%",
                                    border: `2px solid ${color}99`,
                                    filter: "grayscale(55%) brightness(0.82)",
                                }}
                            />
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

const ActionButton: React.FC<{ label: string; disabled?: boolean; primary?: boolean; onClick: () => void }> = ({
    disabled,
    label,
    primary,
    onClick,
}) => (
    <Box
        onClick={disabled ? undefined : onClick}
        sx={{
            px: primary ? 3.4 : 3,
            py: primary ? 1.35 : 1.1,
            minWidth: primary ? 160 : 138,
            borderRadius: 0,
            cursor: disabled ? "not-allowed" : "pointer",
            fontWeight: 800,
            letterSpacing: "0.04em",
            fontSize: "0.95rem",
            fontFamily: HOC_GAME_FONT_FAMILY,
            userSelect: "none",
            border: "none",
            color: disabled ? `${PARCHMENT}66` : primary ? "#f3d08a" : PARCHMENT,
            backgroundColor: "transparent",
            backgroundImage: primary
                ? `linear-gradient(180deg, rgba(255,211,111,.28), rgba(153,91,12,.16)), url(${imgSrc("ui_start_button_plate_trimmed")})`
                : `linear-gradient(180deg, rgba(255,255,255,.025), rgba(0,0,0,.12)), url(${imgSrc("ui_start_button_plate_trimmed")})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            backgroundSize: "100% 100%",
            textShadow: primary ? "0 2px 2px #090501, 0 0 8px rgba(225,170,67,.4)" : "0 2px 2px #090501",
            boxShadow: primary ? `0 0 13px ${GOLD}55` : "0 3px 7px rgba(0,0,0,.5)",
            opacity: disabled ? 0.45 : 1,
            transition: "all 0.15s ease",
            "&:hover": {
                transform: disabled ? "none" : "translateY(-1px)",
                boxShadow: disabled ? (primary ? `0 0 16px ${GOLD}66` : "none") : `0 0 20px ${GOLD}aa`,
                backgroundColor: "transparent",
                backgroundImage: primary
                    ? `linear-gradient(180deg, rgba(255,224,142,.38), rgba(172,105,18,.2)), url(${imgSrc("ui_start_button_plate_trimmed")})`
                    : `linear-gradient(180deg, rgba(255,205,112,.12), rgba(95,55,12,.12)), url(${imgSrc("ui_start_button_plate_trimmed")})`,
            },
            "&:active": { transform: "translateY(0)" },
        }}
    >
        {label}
    </Box>
);

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
    const manager = usePixiManager();
    const previewMode =
        import.meta.env.DEV && new URLSearchParams(window.location.search).get("fight-results-preview") === "1";
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
                backgroundImage: `url(${imgSrc("fight_results_obsidian_ember_background")})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
            }}
        >
            {/* Winner-coloured glow behind the card */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8 }}
                style={{
                    position: "absolute",
                    width: "70vw",
                    height: "70vh",
                    background: `radial-gradient(circle, ${winnerColor}33 0%, transparent 65%)`,
                    pointerEvents: "none",
                }}
            />

            <Box
                component={motion.div}
                initial={{ opacity: 0, scale: 0.9, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 24 }}
                sx={{
                    position: "relative",
                    width: "92%",
                    maxWidth: 880,
                    // Fixed footprint — the card is always the size it used to be when the chart
                    // filled it (content overflowed, so it sat at maxHeight). Pinning height instead
                    // of maxHeight keeps it identical from fight to fight: a 2-creature skirmish and
                    // a 16-creature brawl now open the same box instead of the card jumping in size.
                    height: "90vh",
                    maxHeight: "90vh",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    borderRadius: "6px",
                    border: "none",
                    // Near-black with a warm cast, matching the game's other panels (the sidebar wells
                    // sit at rgba(18,11,4) / rgba(11,9,5) / rgba(12,12,12)) instead of the lighter
                    // brown this card used to be. Still 95% opaque, so the board reads faintly through.
                    background: "linear-gradient(160deg, rgba(30,18,7,0.71) 0%, rgba(9,6,2,0.71) 100%)",
                    boxShadow: "0 16px 48px rgba(0,0,0,0.85)",
                    padding: "28px 32px",
                    // Reuse the command deck's approved metal-and-ember frame. A pseudo-element keeps
                    // the 9-slice artwork independent from the card's layout, so replacing the old 2px
                    // CSS stroke does not move or resize any results content.
                    "&::before": {
                        content: '""',
                        position: "absolute",
                        inset: 0,
                        zIndex: 5,
                        pointerEvents: "none",
                        boxSizing: "border-box",
                        border: "16px solid transparent",
                        borderImageSource: `url(${imgSrc("ui_outer_frame_3_9slice")})`,
                        borderImageSlice: "58",
                        borderImageWidth: "16px",
                        borderImageRepeat: "stretch",
                    },
                }}
            >
                {/* Close button */}
                <Box
                    component="button"
                    aria-label="Close fight results"
                    onClick={() => setDismissed(true)}
                    sx={{
                        position: "absolute",
                        top: 10,
                        right: 12,
                        width: 42,
                        height: 42,
                        border: 0,
                        backgroundColor: "transparent",
                        backgroundImage: `url(${imgSrc("fight_results_close_button_v1")})`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center",
                        backgroundSize: "contain",
                        cursor: "pointer",
                        zIndex: 6,
                        filter: "drop-shadow(0 2px 3px rgba(0,0,0,.75))",
                        transition: "transform .14s ease, filter .14s ease",
                        "&:hover": {
                            transform: "scale(1.06)",
                            filter: "drop-shadow(0 0 6px rgba(231,168,57,.5))",
                        },
                    }}
                />

                {/* Winner banner (or draw banner — armageddon can wipe both sides on the same lap) */}
                {/* The cup sits BESIDE the headline, not over it. Stacked, it cost the card a whole line of
                    height at the top — and this card has a fixed footprint, so that line came straight out
                    of the roster at the bottom, which ended up under the action buttons. */}
                <Stack sx={{ alignItems: "center", textAlign: "center", mb: 1.25, flexShrink: 0 }}>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", justifyContent: "center" }}>
                        <Typography sx={{ fontSize: "2.2rem", lineHeight: 1 }}>{isDraw ? "⚖️" : "🏆"}</Typography>
                        <Typography
                            sx={{
                                color: winnerColor,
                                fontWeight: 900,
                                fontFamily: HOC_GAME_FONT_FAMILY,
                                letterSpacing: "0.08em",
                                fontSize: "2rem",
                                textShadow: `0 0 18px ${winnerColor}aa`,
                            }}
                        >
                            {isDraw ? "DRAW" : `${teamName(stats.winner).toUpperCase()} TEAM WINS`}
                        </Typography>
                    </Stack>
                    {opponentLabel && (
                        <Typography sx={{ color: GOLD, opacity: 0.9, fontSize: "0.85rem", fontWeight: 700, mt: 0.25 }}>
                            vs {opponentLabel}
                        </Typography>
                    )}
                </Stack>

                {/* Stats take the slack between the banner and the actions. Only this middle band
                    scrolls, so a long roster never pushes the buttons out of the fixed-size card —
                    and the scrollbar itself stays hidden. */}
                <Box
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: "auto",
                        // The band clips at its own edge, so without this the last row of portraits ended
                        // flush against the buttons and read as running under them.
                        pb: 1.5,
                        scrollbarWidth: "none",
                        msOverflowStyle: "none",
                        "&::-webkit-scrollbar": { width: 0, height: 0, display: "none" },
                    }}
                >
                    {/* Every block lands in the same place from fight to fight: the chart holds a
                        fixed band under the banner, the damage stats follow it directly, and the
                        roster is pushed down onto the buttons by `mt: auto`. A 1v1 whose damage list
                        is one row therefore looks like a full fight with a gap in the middle, rather
                        than a differently-shaped card.

                        `mt: auto` rather than `justifyContent`: an auto margin only ever eats POSITIVE
                        free space, so once the content overflows it is simply 0 and the band scrolls
                        from the top — where `flex-end` would push the overflowing top out of reach. */}
                    <Box
                        sx={{
                            minHeight: "100%",
                            display: "flex",
                            flexDirection: "column",
                        }}
                    >
                        <CasualtyChartPanel series={stats.series} ornateResultsFrame />

                        {/* Damage stats — pinned directly under the chart. */}
                        <Box sx={{ flexShrink: 0 }}>
                            <Typography
                                sx={{
                                    color: GOLD,
                                    fontWeight: 700,
                                    fontSize: "0.8rem",
                                    letterSpacing: "0.06em",
                                    mb: 1,
                                }}
                            >
                                DAMAGE DEALT
                            </Typography>
                            <DamageBreakdown entries={stats.damageByUnit ?? []} />
                        </Box>

                        {/* Casualty rosters — pinned to the bottom; the card's spare room opens up
                            above this block, between it and the damage stats. */}
                        <Box sx={{ flexShrink: 0, mt: "auto" }}>
                            {/* "1px", not 1: MUI reads a unitless height <= 1 as a fraction, so
                                `height: 1` is 100%. Harmless while the parent was auto-height, but the
                                parent has a definite height now and the rule would blow it up to fill. */}
                            <Box sx={{ height: "1px", backgroundColor: `${GOLD}44`, my: 2 }} />

                            <Typography
                                sx={{
                                    color: GOLD,
                                    fontWeight: 700,
                                    fontSize: "0.8rem",
                                    letterSpacing: "0.06em",
                                    mb: 1,
                                }}
                            >
                                FALLEN
                            </Typography>
                            <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
                                <CasualtyColumn
                                    team={TeamVals.LOWER as TeamType}
                                    deaths={stats.lowerDeaths}
                                    killedTotal={stats.lowerKilledTotal}
                                    startTotal={stats.lowerStartTotal}
                                />
                                <CasualtyColumn
                                    team={TeamVals.UPPER as TeamType}
                                    deaths={stats.upperDeaths}
                                    killedTotal={stats.upperKilledTotal}
                                    startTotal={stats.upperStartTotal}
                                />
                            </Stack>
                        </Box>
                    </Box>
                </Box>

                <Stack direction="row" spacing={2} sx={{ justifyContent: "center", mt: 2, pt: 1, flexShrink: 0 }}>
                    {canReplay && <ActionButton label="Replay" onClick={replayFight} />}
                    {showRematchAction && (
                        <ActionButton
                            label="⚔ Rematch"
                            primary
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
                            label="+ New Battle"
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
