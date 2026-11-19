import { SYNERGY_KEY_TO_IMAGE, SYNERGY_NAME_TO_DESCRIPTION } from "./SynergiesConstants";
import { SynergyKeysToPower } from "@heroesofcrypto/common";
import Box from "@mui/joy/Box";
import Tooltip from "@mui/joy/Tooltip";
import React, { useMemo } from "react";

import { useSidebarMetrics } from "./sidebarMetrics";

import { commonTooltipSx } from "./tooltipStyles";

export const SYNERGY_LEVEL_INDICATOR_HEIGHT_PX = 8;

const SynergiesRow = ({
    synergies,
    wrap = false,
    column = false,
    size,
    inline = false,
}: {
    synergies: string[];
    wrap?: boolean;
    // Stack the badges vertically. Used where the strip is pinned into a corner beside the portrait rather
    // than laid across the bar, where a horizontal run would cover the art.
    column?: boolean;
    // Badge edge in px. The placement roster packs four of these beside six creature slots, so it asks for
    // half-size icons to keep the strip on one line; everything else keeps the metrics-driven default.
    size?: number;
    /**
     * Drop this component's own box out of the layout so the badges become direct children of whatever is
     * laying them out. In the Buffs well they share one wrapping row with the buff tiles; as a nested flex
     * container this row counted as a SINGLE item, so a couple of badges took a whole line to themselves
     * and pushed every buff onto the next one, out of sight behind a scrollbar.
     */
    inline?: boolean;
}) => {
    const metrics = useSidebarMetrics();
    // Reserve a band below the art: overlaying pips on its rim hides the level against the icon.
    const badgeSize = size ?? (wrap ? 36 : metrics.synergyIcon);
    const iconSize = badgeSize;
    const sortedSynergies = useMemo(
        () =>
            [...synergies].sort((a, b) => {
                const partsA = a.split(":");
                const partsB = b.split(":");

                const levelA = partsA.length >= 3 ? parseInt(partsA[2]) : 0;
                const levelB = partsB.length >= 3 ? parseInt(partsB[2]) : 0;

                return levelB - levelA;
            }),
        [synergies],
    );

    return (
        <Box
            sx={{
                display: inline ? "contents" : "flex",
                // The strip wraps instead of overflowing: four synergy badges do not fit a 128px bar on
                // one line, and the row is a fixed part of the sidebar's height budget.
                flexDirection: column ? "column" : "row",
                gap: `${metrics.gapPx * 0.6}px`,
                rowGap: wrap ? 1.5 : `${metrics.gapPx * 0.5}px`,
                flexWrap: column ? "nowrap" : "wrap",
                justifyContent: wrap ? "center" : "flex-start",
                // Shrink to content when inlined (the Buffs row puts these beside the buff tiles); only the
                // standalone wrapped variant claims the full width.
                width: wrap ? "100%" : "auto",
                alignItems: "flex-start",
            }}
        >
            {sortedSynergies.map((synergyKey) => {
                const level = synergyKey.split(":").length < 3 ? 0 : parseInt(synergyKey.split(":")[2]);
                let dotColor: string;

                if (synergyKey.startsWith("Nature:")) {
                    dotColor = "#51b660";
                } else if (synergyKey.startsWith("Life:")) {
                    dotColor = "rgb(213, 167, 74)";
                } else if (synergyKey.startsWith("Chaos:")) {
                    dotColor = "rgb(216, 92, 40)";
                } else if (synergyKey.startsWith("Might:")) {
                    dotColor = "rgb(211, 38, 31)";
                } else {
                    dotColor = "gray";
                }

                return (
                    <Box
                        key={synergyKey}
                        data-sidebar-synergy={synergyKey}
                        sx={{
                            width: inline && size !== undefined ? `${badgeSize}px` : "auto",
                            height:
                                inline && size !== undefined
                                    ? `${badgeSize + SYNERGY_LEVEL_INDICATOR_HEIGHT_PX}px`
                                    : "auto",
                            textAlign: "center",
                            flex: "none",
                        }}
                    >
                        <Tooltip
                            title={`Level ${level}: ${(
                                SYNERGY_NAME_TO_DESCRIPTION[synergyKey as keyof typeof SYNERGY_NAME_TO_DESCRIPTION] ||
                                "Unknown Synergy"
                            )
                                .replace(/\{\}/, SynergyKeysToPower[synergyKey]?.[0]?.toString() || "0")
                                .replace(/\{\}/, SynergyKeysToPower[synergyKey]?.[1]?.toString() || "0")}`}
                            placement="bottom"
                            sx={commonTooltipSx}
                        >
                            <Box
                                component="img"
                                src={SYNERGY_KEY_TO_IMAGE[synergyKey as keyof typeof SYNERGY_KEY_TO_IMAGE]}
                                sx={{
                                    width: `${iconSize}px`,
                                    height: `${iconSize}px`,
                                    mx: "auto",
                                    display: "block", // Prevents any extra space from inline display
                                    imageRendering: "auto",
                                    transform: "translateZ(0)",
                                    transition: "opacity 160ms ease-out, transform 160ms ease-out",
                                    willChange: "opacity, transform",
                                }}
                            />
                        </Tooltip>
                        <Box
                            aria-label={`Synergy level ${level}`}
                            sx={{
                                display: "flex",
                                justifyContent: "center",
                                height: "4px",
                                mt: "4px",
                            }}
                        >
                            {Array.from({ length: level }, (_, dotIndex) => (
                                <Box
                                    key={dotIndex}
                                    data-synergy-level-dot
                                    sx={{
                                        width: "4px",
                                        height: "4px",
                                        backgroundColor: dotColor,
                                        boxShadow: `0 0 2px ${dotColor}, 0 0 0 1px rgba(255,235,190,.25)`,
                                        borderRadius: "50%",
                                        margin: "0 2px",
                                    }}
                                />
                            ))}
                        </Box>
                    </Box>
                );
            })}
        </Box>
    );
};

export default SynergiesRow;
