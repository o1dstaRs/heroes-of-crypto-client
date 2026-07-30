import { SYNERGY_KEY_TO_IMAGE, SYNERGY_NAME_TO_DESCRIPTION } from "./SynergiesConstants";
import { SynergyKeysToPower } from "@heroesofcrypto/common";
import Box from "@mui/joy/Box";
import Tooltip from "@mui/joy/Tooltip";
import React, { useMemo } from "react";

import { useSidebarMetrics } from "./sidebarMetrics";

import { commonTooltipSx } from "./tooltipStyles";
const SynergiesRow = ({
    synergies,
    wrap = false,
    column = false,
}: {
    synergies: string[];
    wrap?: boolean;
    // Stack the badges vertically. Used where the strip is pinned into a corner beside the portrait rather
    // than laid across the bar, where a horizontal run would cover the art.
    column?: boolean;
}) => {
    const metrics = useSidebarMetrics();
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
                display: "flex",
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
                    dotColor = "green";
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
                    <Box key={synergyKey} sx={{ textAlign: "center" }}>
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
                                    width: `${wrap ? 36 : metrics.synergyIcon}px`,
                                    height: `${wrap ? 36 : metrics.synergyIcon}px`,
                                    display: "block", // Prevents any extra space from inline display
                                    imageRendering: "auto",
                                    transform: "translateZ(0)",
                                    transition: "opacity 160ms ease-out, transform 160ms ease-out",
                                    willChange: "opacity, transform",
                                }}
                            />
                        </Tooltip>
                        <Box sx={{ display: "flex", justifyContent: "center", mt: 0.5 }}>
                            {Array.from({ length: level }, (_, dotIndex) => (
                                <Box
                                    key={dotIndex}
                                    sx={{
                                        width: "4px",
                                        height: "4px",
                                        backgroundColor: dotColor,
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
