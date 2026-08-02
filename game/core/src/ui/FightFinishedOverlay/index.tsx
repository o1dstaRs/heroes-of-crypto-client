import { TeamVals, TeamType } from "@heroesofcrypto/common";

import Avatar from "@mui/joy/Avatar";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import { motion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";

import { usePixiManager } from "../../pixi/PixiGameManager";
import { IFightDeathEntry, IFightStatsReport, IVisibleState } from "../../scenes/VisibleState";
import { GOLD, PARCHMENT, WOOD_DARK, imgSrc, teamColor, teamName } from "../FightStats/CasualtyChart";
import { CasualtyChartPanel } from "../FightStats/CasualtyChartPanel";
import { DamageBreakdown } from "../FightStats/DamageBreakdown";

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
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 1,
                    p: 1,
                    borderRadius: "10px",
                    border: `1px solid ${GOLD}55`,
                    backgroundColor: "rgba(0,0,0,0.25)",
                    minHeight: 64,
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
            px: 3,
            py: 1.1,
            borderRadius: "10px",
            cursor: disabled ? "not-allowed" : "pointer",
            fontWeight: 800,
            letterSpacing: "0.04em",
            fontSize: "0.95rem",
            userSelect: "none",
            border: `2px solid ${GOLD}`,
            color: disabled ? `${PARCHMENT}66` : primary ? WOOD_DARK : PARCHMENT,
            background: primary ? `linear-gradient(180deg, #f3d488 0%, ${GOLD} 100%)` : "transparent",
            boxShadow: primary ? `0 0 16px ${GOLD}66` : "none",
            opacity: disabled ? 0.45 : 1,
            transition: "all 0.15s ease",
            "&:hover": {
                transform: disabled ? "none" : "translateY(-1px)",
                boxShadow: disabled ? (primary ? `0 0 16px ${GOLD}66` : "none") : `0 0 20px ${GOLD}aa`,
                background: disabled
                    ? primary
                        ? `linear-gradient(180deg, #f3d488 0%, ${GOLD} 100%)`
                        : "transparent"
                    : primary
                      ? `linear-gradient(180deg, #ffe5a0 0%, ${GOLD} 100%)`
                      : `${GOLD}22`,
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

    const stats: IFightStatsReport | undefined = visibleState.fightStats;

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
        !visibleState.hasFinished ||
        !stats ||
        dismissed ||
        visibleState.teamWin === undefined ||
        stats.winner !== visibleState.teamWin
    ) {
        return null;
    }

    const isDraw = stats.winner === TeamVals.NO_TEAM;
    const winnerColor = isDraw ? GOLD : teamColor(stats.winner);
    const canSandboxReplay = manager.CanPlayCurrentSandboxReplay();
    const canReplay = canReplayOverride ?? canSandboxReplay;
    const showSandboxActions = mode === "sandbox" && canSandboxReplay;
    const showRematchAction = showSandboxActions && !replayResult;
    const clearReplayTimers = (): void => {
        replayTimers.current.forEach(window.clearTimeout);
        replayTimers.current = [];
    };
    const replayFight = async (): Promise<void> => {
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
                backgroundColor: "rgba(0,0,0,0.72)",
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
                    borderRadius: "18px",
                    border: `2px solid ${GOLD}`,
                    // Near-black with a warm cast, matching the game's other panels (the sidebar wells
                    // sit at rgba(18,11,4) / rgba(11,9,5) / rgba(12,12,12)) instead of the lighter
                    // brown this card used to be. Still 95% opaque, so the board reads faintly through.
                    background: "linear-gradient(160deg, rgba(30,18,7,0.95) 0%, rgba(9,6,2,0.95) 100%)",
                    boxShadow: "0 16px 48px rgba(0,0,0,0.85)",
                    padding: "28px 32px",
                }}
            >
                {/* Close button */}
                <Box
                    onClick={() => setDismissed(true)}
                    sx={{
                        position: "absolute",
                        top: 14,
                        right: 16,
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        border: `1.5px solid ${GOLD}`,
                        color: PARCHMENT,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        fontSize: "1.1rem",
                        lineHeight: 1,
                        "&:hover": { backgroundColor: `${GOLD}22` },
                    }}
                >
                    ✕
                </Box>

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
                        <CasualtyChartPanel series={stats.series} />

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
