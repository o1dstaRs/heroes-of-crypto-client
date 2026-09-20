import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import React from "react";

import { synergyEffectAtLevel, synergyLadder, synergyNextLevel } from "./synergyLadder";

/**
 * What a synergy gives, as the whole ladder rather than the one rung the army is standing on.
 *
 * The draft rail used to say only "(lvl 1): Improves movement steps by 1 cells", which answers what you have
 * and nothing about what another two units of that faction would buy. Here every level is printed —
 * 1 / 2 / 3 — with the one in force in gold, so the cost of the next rung is a number, not a guess.
 */
export const SynergyLadderTip: React.FC<{
    faction: string;
    /** The 1-or-2 of the faction's pair — the same variant the icon and the description keys carry. */
    variant: number | string;
    /** The synergy's own name ("Movement", "Flying armor"). */
    label: string;
    /** The level the drafted army has now; 0 while the synergy is still locked. */
    level: number;
    /** The level a staged, unconfirmed pick would light. Equal to `level` when nothing is staged. */
    previewLevel?: number;
    /** Units of this faction already confirmed — what the "more units" line counts from. */
    units: number;
}> = ({ faction, variant, label, level, previewLevel = level, units }) => {
    const previewing = previewLevel > level;
    const shownLevel = previewing ? previewLevel : level;
    const ladder = synergyLadder(faction, variant);
    const next = synergyNextLevel(units);

    return (
        <Box sx={{ maxWidth: 260, py: 0.25 }}>
            <Typography level="title-sm" sx={{ color: "#f3ead6" }}>
                {faction} — {label}
                {shownLevel ? ` · lvl ${shownLevel}` : ""}
            </Typography>
            <Typography level="body-xs" sx={{ mt: 0.25, opacity: 0.85 }}>
                {synergyEffectAtLevel(faction, variant, shownLevel || 1)}
            </Typography>
            {ladder.map((row, rowIndex) => (
                <Box
                    key={rowIndex}
                    sx={{ display: "flex", alignItems: "center", gap: 0.25, mt: 0.4, flexWrap: "wrap" }}
                >
                    {row.label && (
                        <Typography level="body-xs" sx={{ minWidth: 44, opacity: 0.6 }}>
                            {row.label}
                        </Typography>
                    )}
                    {row.values.map((value, valueIndex) => {
                        const valueLevel = valueIndex + 1;
                        const isCurrent = level > 0 && valueLevel === level;
                        // A staged pick outlines the rung it would reach as well, in the same gold but
                        // dashed: the number is not yours yet.
                        const isPreview = previewing && valueLevel === previewLevel;
                        return (
                            <React.Fragment key={valueLevel}>
                                {valueIndex > 0 && (
                                    <Typography level="body-xs" sx={{ opacity: 0.3, px: 0.15 }}>
                                        /
                                    </Typography>
                                )}
                                <Typography
                                    level="body-xs"
                                    sx={{
                                        px: 0.5,
                                        borderRadius: "4px",
                                        fontVariantNumeric: "tabular-nums",
                                        fontWeight: isCurrent || isPreview ? 800 : 500,
                                        color: isCurrent || isPreview ? "#FFB300" : "rgba(243,234,214,0.7)",
                                        border: `1px ${isPreview && !isCurrent ? "dashed" : "solid"} ${
                                            isCurrent || isPreview ? "#FFB300" : "transparent"
                                        }`,
                                        bgcolor: isCurrent ? "rgba(255,179,0,0.12)" : "transparent",
                                    }}
                                >
                                    {value}
                                </Typography>
                            </React.Fragment>
                        );
                    })}
                </Box>
            ))}
            <Typography level="body-xs" sx={{ mt: 0.4, opacity: 0.7 }}>
                {previewing
                    ? `Confirming this pick → lvl ${previewLevel}`
                    : next
                      ? `${next.unitsAway} more ${faction} unit${next.unitsAway === 1 ? "" : "s"} → lvl ${next.level}`
                      : "Maxed at lvl 3"}
            </Typography>
        </Box>
    );
};

export default SynergyLadderTip;
