import { TeamVals, TeamType } from "@heroesofcrypto/common";

import Avatar from "@mui/joy/Avatar";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import { motion } from "framer-motion";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { usePixiManager } from "../../pixi/PixiGameManager";
import { IFightDeathEntry, IFightStatsReport, IVisibleState } from "../../scenes/VisibleState";
import { CasualtyChart, GOLD, PARCHMENT, WOOD_DARK, imgSrc, teamColor, teamName } from "../FightStats/CasualtyChart";

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
    onReplay?: () => void | Promise<void>;
}

// =============================================================================
// Overlay
// =============================================================================
export const FightFinishedOverlay: React.FC<FightFinishedOverlayProps> = ({
    canReplay: canReplayOverride,
    mode = "sandbox",
    onReplay,
}) => {
    const manager = usePixiManager();
    const [visibleState, setVisibleState] = useState<IVisibleState>({} as IVisibleState);
    const [dismissed, setDismissed] = useState(false);
    const replayTimers = useRef<number[]>([]);

    useEffect(() => {
        const connection = manager.onVisibleStateUpdated.connect((s: IVisibleState) => {
            setVisibleState(s);
            // A new fight has begun — re-arm the overlay for next time.
            if (!s.hasFinished) setDismissed(false);
        });
        return () => {
            connection.disconnect();
            replayTimers.current.forEach(window.clearTimeout);
            replayTimers.current = [];
        };
    }, [manager]);

    const stats: IFightStatsReport | undefined = visibleState.fightStats;

    const subtitle = useMemo(() => {
        if (!stats) return "";
        const laps = stats.totalLaps;
        const total = stats.lowerKilledTotal + stats.upperKilledTotal;
        return `${total} units fell over ${laps} ${laps === 1 ? "lap" : "laps"}`;
    }, [stats]);

    // Only a finished fight (with a real winner) shows this overlay.
    if (
        !visibleState.hasFinished ||
        !stats ||
        dismissed ||
        visibleState.teamWin === undefined ||
        visibleState.teamWin === TeamVals.NO_TEAM ||
        stats.winner === TeamVals.NO_TEAM ||
        stats.winner !== visibleState.teamWin
    ) {
        return null;
    }

    const winnerColor = teamColor(stats.winner);
    const canReplay = canReplayOverride ?? manager.CanPlayCurrentSandboxReplay();
    const showSandboxActions = mode === "sandbox";
    const clearReplayTimers = (): void => {
        replayTimers.current.forEach(window.clearTimeout);
        replayTimers.current = [];
    };
    const replayFight = (): void => {
        clearReplayTimers();
        setDismissed(true);
        if (onReplay) {
            void onReplay();
            return;
        }

        const replay = manager.GetCurrentSandboxReplay();
        if (!replay?.actions.length) {
            return;
        }

        manager.PlaySandboxReplay(replay, 0);
        const stepDelayMs = 550;
        for (let sequence = 1; sequence <= replay.actions.length; sequence += 1) {
            replayTimers.current.push(
                window.setTimeout(() => {
                    manager.PlaySandboxReplay(replay, sequence);
                }, sequence * stepDelayMs),
            );
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

            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 24 }}
                style={{
                    position: "relative",
                    width: "92%",
                    maxWidth: 880,
                    maxHeight: "90vh",
                    overflowY: "auto",
                    borderRadius: 18,
                    border: `2px solid ${GOLD}`,
                    background: "linear-gradient(160deg, #3a1d08 0%, #1c0d03 100%)",
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

                {/* Winner banner */}
                <Stack sx={{ alignItems: "center", textAlign: "center", mb: 2 }}>
                    <Typography sx={{ fontSize: "2.2rem", lineHeight: 1, mb: 0.5 }}>🏆</Typography>
                    <Typography
                        sx={{
                            color: winnerColor,
                            fontWeight: 900,
                            letterSpacing: "0.08em",
                            fontSize: "2rem",
                            textShadow: `0 0 18px ${winnerColor}aa`,
                        }}
                    >
                        {teamName(stats.winner).toUpperCase()} TEAM WINS
                    </Typography>
                    <Typography sx={{ color: PARCHMENT, opacity: 0.75, fontSize: "0.95rem" }}>{subtitle}</Typography>
                </Stack>

                {/* Legend */}
                <Stack direction="row" spacing={3} sx={{ justifyContent: "center", mb: 0.5 }}>
                    {[TeamVals.LOWER, TeamVals.UPPER].map((t) => (
                        <Stack key={t} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <Box
                                sx={{
                                    width: 22,
                                    height: 4,
                                    borderRadius: 2,
                                    backgroundColor: teamColor(t as TeamType),
                                }}
                            />
                            <Typography sx={{ color: PARCHMENT, fontSize: "0.82rem", opacity: 0.85 }}>
                                {teamName(t as TeamType)} army losses
                            </Typography>
                        </Stack>
                    ))}
                </Stack>

                {/* Chart */}
                <Typography sx={{ color: GOLD, fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.06em", mb: 0.5 }}>
                    CASUALTIES OVER TIME
                </Typography>
                <CasualtyChart series={stats.series} />

                <Box sx={{ height: 1, backgroundColor: `${GOLD}44`, my: 2 }} />

                {/* Casualty rosters */}
                <Typography sx={{ color: GOLD, fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.06em", mb: 1 }}>
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

                <Stack direction="row" spacing={2} sx={{ justifyContent: "center", mt: 3 }}>
                    {canReplay && <ActionButton label="Replay" onClick={replayFight} />}
                    {showSandboxActions && (
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
                    {!showSandboxActions && (
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
                {showSandboxActions && (
                    <Typography
                        sx={{ color: PARCHMENT, opacity: 0.45, fontSize: "0.72rem", textAlign: "center", mt: 1.5 }}
                    >
                        Replay watches the finished fight again · Rematch uses the same army · New Battle clears the
                        board
                    </Typography>
                )}
            </motion.div>
        </Box>
    );
};
