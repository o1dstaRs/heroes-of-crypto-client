import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import React from "react";

import { hocColors } from "../hocTheme";
import { useSidebarMetrics } from "./sidebarMetrics";

// The turn timer ticks every 500ms (see Sandbox.updateVisibleTurnTimer), so matching the bar's
// width transition to that cadence makes it drain continuously instead of stepping twice a second.
const TICK_TRANSITION = "width 0.5s linear, box-shadow 0.5s linear";
// Below this many seconds the frame pulses red to signal the turn is almost over.
const CRITICAL_SECONDS = 5;

interface TurnTimerBarProps {
    lapNumber: number;
    secondsRemaining: number;
    secondsMax: number;
    // Ranked only: tint the fill red while the opponent is the one on the clock.
    enemyTurn?: boolean;
}

export const TurnTimerBar: React.FC<TurnTimerBarProps> = ({
    lapNumber,
    secondsRemaining,
    secondsMax,
    enemyTurn = false,
}) => {
    const metrics = useSidebarMetrics();
    const hasTimer = Number.isFinite(secondsMax) && secondsMax > 0 && secondsRemaining >= 0;
    const remainingPct = hasTimer ? Math.max(0, Math.min(100, (secondsRemaining / secondsMax) * 100)) : 0;
    const secondsLeft = Math.max(0, Math.ceil(secondsRemaining));
    const critical = hasTimer && secondsRemaining > 0 && secondsRemaining <= CRITICAL_SECONDS;
    // Medallion, groove and seconds together must fit a 116px-wide bar on 1024x768, so all three come off
    // the same measured width instead of the 40px/18px constants that used to push the timer off-screen.
    const medallion = Math.round(Math.max(26, Math.min(40, metrics.contentWidth * 0.22)));
    const grooveHeight = Math.round(Math.max(12, medallion * 0.45));

    // On the opponent's turn the fill goes red; otherwise it stays neutral so it does not
    // read as green-team ownership.
    const fillLight = enemyTurn ? "#ff8a73" : "#f4f6f8";
    const fillBase = enemyTurn ? "#f4593f" : "#d5dbe3";
    const fillDark = enemyTurn ? "#c2351f" : "#a8b1bf";
    const fillGlow = enemyTurn ? "rgba(255, 90, 63, 0.5)" : "rgba(226, 232, 240, 0.45)";

    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                gap: `${Math.round(metrics.gapPx * 0.7)}px`,
                width: "100%",
                my: "2px",
            }}
        >
            {/* Lap medallion — a gold coin so the lap number reads as part of the timer. */}
            <Box
                sx={{
                    flexShrink: 0,
                    width: medallion,
                    height: medallion,
                    borderRadius: "50%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "radial-gradient(circle at 50% 32%, rgba(74, 50, 20, 0.96), rgba(18, 11, 4, 0.98))",
                    border: `2px solid ${hocColors.gold}`,
                    boxShadow:
                        "0 0 0 1px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255, 220, 150, 0.3), 0 2px 5px rgba(0,0,0,0.6), 0 0 4px rgba(220, 177, 88, 0.25)",
                }}
            >
                <Typography
                    sx={{
                        fontSize: `${medallion * 0.0125}rem`,
                        lineHeight: 1,
                        letterSpacing: "0.1em",
                        fontWeight: "xl",
                        textTransform: "uppercase",
                        color: hocColors.gold,
                    }}
                >
                    Lap
                </Typography>
                <Typography
                    sx={{
                        fontSize: `${medallion * 0.0263}rem`,
                        lineHeight: 1.15,
                        fontWeight: "xl",
                        color: hocColors.parchment,
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    {lapNumber || 1}
                </Typography>
            </Box>

            {/* Gold-framed groove holding the gradient fill. */}
            <Box
                sx={{
                    position: "relative",
                    flex: 1,
                    minWidth: 0,
                    height: grooveHeight,
                    borderRadius: `${grooveHeight / 2}px`,
                    padding: "2px",
                    boxSizing: "border-box",
                    background: "linear-gradient(180deg, rgba(0,0,0,0.5), rgba(0,0,0,0.32))",
                    border: `1.5px solid ${hocColors.gold}`,
                    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,0,0,0.45)",
                    overflow: "hidden",
                    ...(critical
                        ? {
                              animation: "hocTimerCritical 0.9s ease-in-out infinite",
                              "@keyframes hocTimerCritical": {
                                  "0%, 100%": {
                                      borderColor: hocColors.gold,
                                      boxShadow: "inset 0 2px 4px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,0,0,0.45)",
                                  },
                                  "50%": {
                                      borderColor: hocColors.danger,
                                      boxShadow: `inset 0 2px 4px rgba(0,0,0,0.65), 0 0 9px 1px ${hocColors.danger}`,
                                  },
                              },
                              "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                          }
                        : {}),
                }}
            >
                <Box
                    sx={{
                        position: "relative",
                        height: "100%",
                        width: `${remainingPct}%`,
                        borderRadius: "7px",
                        transition: TICK_TRANSITION,
                        background: `linear-gradient(180deg, ${fillLight} 0%, ${fillBase} 52%, ${fillDark} 100%)`,
                        boxShadow: `0 0 7px ${fillGlow}`,
                        // Glossy top sheen so the fill looks like a polished gauge, not a flat block.
                        "&::after": {
                            content: '""',
                            position: "absolute",
                            inset: 0,
                            borderRadius: "7px",
                            background:
                                "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.05) 42%, rgba(255,255,255,0) 60%)",
                            pointerEvents: "none",
                        },
                    }}
                />
            </Box>

            {/* Seconds remaining. */}
            <Typography
                sx={{
                    flexShrink: 0,
                    minWidth: `${Math.round(24 * metrics.fontScale)}px`,
                    textAlign: "right",
                    fontWeight: "xl",
                    fontSize: `${0.85 * metrics.fontScale}rem`,
                    fontVariantNumeric: "tabular-nums",
                    color: critical ? hocColors.danger : hocColors.parchment,
                    textShadow: "0 1px 2px rgba(0,0,0,0.7)",
                }}
            >
                {secondsLeft}s
            </Typography>
        </Box>
    );
};
