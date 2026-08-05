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
    heading?: React.ReactNode;
    // Ranked only: whose clock is running. Your own gets the red fill; theirs gets the calm amber one.
    enemyTurn?: boolean;
    /**
     * Rendered directly under the groove, in the groove's own column — clear of the lap medallion on one
     * side and the seconds on the other. The additional-time control goes here rather than across the card:
     * it does one thing, to this clock, and at full card width it read as a separate action rather than as
     * the second half of the timer.
     */
    footer?: React.ReactNode;
    footerIndicator?: React.ReactNode;
}

export const TurnTimerBar: React.FC<TurnTimerBarProps> = ({
    lapNumber,
    secondsRemaining,
    secondsMax,
    heading,
    enemyTurn = false,
    footer,
    footerIndicator,
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

    // The fill carries the state rather than just filling space. The two sides are the other way round from
    // how this started: RED is now your own clock — the one you have to act on, and the one worth making
    // urgent — while the opponent's runs warm amber, deepening under CRITICAL_SECONDS, because nothing is
    // being asked of you while it drains. The old fill was a grey-white gradient, the same colour whether
    // you had fifty seconds or four, which left the number doing all the work.
    const palette = !enemyTurn
        ? { light: "#ff8a73", base: "#f4593f", dark: "#c2351f", glow: "rgba(255,90,63,0.34)" }
        : critical
          ? { light: "#ffb36b", base: "#ef6c3a", dark: "#b83a17", glow: "rgba(239,108,58,0.38)" }
          : { light: "#ffe6ab", base: "#e8b558", dark: "#a87526", glow: "rgba(232,181,88,0.28)" };
    const { light: fillLight, base: fillBase, dark: fillDark, glow: fillGlow } = palette;

    const gapPx = Math.round(metrics.gapPx * 0.7);
    const secondsWidth = Math.round(24 * metrics.fontScale);
    // The row's height comes from the lap medallion, which is a good deal taller than the groove and is
    // centred against it — so the row's bottom edge sits this far below the groove's. The footer is a
    // sibling of that row, so without pulling it back up by the same amount it would open a gap the size of
    // the medallion's overhang, whatever margin it was given.
    const medallionOverhangPx = Math.round((medallion - grooveHeight) / 2);
    // Drawn a touch narrower than the groove on each side rather than flush with it: matching the groove
    // exactly made the two edges fight, the pill's round end against the bar's square one.
    const footerInsetPx = 8;
    // A seam between the groove and the control under it, about a third of that control's own height. It is
    // expressed off the groove rather than measured off the button: the button's height comes from its font
    // and padding, both of which already scale with the sidebar, and so does the groove — so one third of
    // the groove tracks one third of the button at every size, without having to read the DOM for it.
    const footerGapPx = Math.round(grooveHeight / 3);

    return (
        <Box sx={{ width: "100%", my: "2px" }}>
            {heading && (
                <Box
                    sx={{
                        pl: `${medallion + gapPx + footerInsetPx}px`,
                        pr: `${secondsWidth + gapPx + footerInsetPx}px`,
                        // Let the turn label sit lower than the medallion's top and tuck it tightly against
                        // the timer groove without moving the groove itself.
                        mb: "-3px",
                        position: "relative",
                        zIndex: 1,
                        transform: "translateY(2px)",
                        textAlign: "center",
                    }}
                >
                    {heading}
                </Box>
            )}
            <Box sx={{ display: "flex", alignItems: "center", gap: `${gapPx}px`, width: "100%" }}>
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
                            boxShadow: `0 0 5px ${fillGlow}`,
                            // Glossy top sheen so the fill looks like a polished gauge, not a flat block.
                            "&::after": {
                                content: '""',
                                position: "absolute",
                                inset: 0,
                                borderRadius: "7px",
                                background:
                                    "linear-gradient(180deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.04) 46%, rgba(255,255,255,0) 62%)",
                                pointerEvents: "none",
                            },
                        }}
                    />
                </Box>

                {/* Seconds remaining. */}
                <Typography
                    sx={{
                        flexShrink: 0,
                        minWidth: `${secondsWidth}px`,
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

            {/* The timer's second line, hard against the groove and inset to exactly its span — past the lap
                medallion on one side, past the seconds on the other. The 1px is the seam, not a gap: any
                more and the two stop reading as one gauge. It sits OUTSIDE the row above rather than inside the
                groove's column, so the medallion and the seconds stay centred on the groove itself instead
                of drifting down to the middle of groove-plus-footer. */}
            {footer && (
                <Box
                    sx={{
                        // `flex`, not the default block: an inline child leaves a few pixels of line-height
                        // under it, which is exactly the seam this is trying to close.
                        display: "flex",
                        position: "relative",
                        pl: `${medallion + gapPx + footerInsetPx}px`,
                        pr: `${secondsWidth + gapPx + footerInsetPx}px`,
                        justifyContent: "center",
                        mt: `${footerGapPx - medallionOverhangPx}px`,
                        // Keep a visible seam of background between the timer and the smaller action.
                        transform: `translateY(${Math.round(4 * metrics.fontScale)}px)`,
                    }}
                >
                    <Box
                        sx={{
                            display: "flex",
                            // Wide enough for the enlarged heroic label at narrow fullscreen widths while
                            // still leaving clear air at both ends of the timer groove.
                            flex: "0 0 78%",
                            maxWidth: "78%",
                            "& > *": { flex: 1, whiteSpace: "nowrap" },
                        }}
                    >
                        {footer}
                    </Box>
                    {footerIndicator && (
                        <Box
                            sx={{
                                position: "absolute",
                                // Match the seconds column exactly. The seconds are right-aligned inside
                                // this same-width slot, so its visual centre lands directly above the icon.
                                // The visible time includes the trailing "s" beyond the two digits. Nudge
                                // the icon to the visual centre of the complete label rather than the digits.
                                right: `-${Math.round(5 * metrics.fontScale)}px`,
                                top: "50%",
                                width: `${secondsWidth}px`,
                                transform: "translateY(-50%)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            {footerIndicator}
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
};
