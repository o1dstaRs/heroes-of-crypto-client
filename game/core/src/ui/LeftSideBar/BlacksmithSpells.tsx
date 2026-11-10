import React from "react";
import { Box, Tooltip, Typography } from "@mui/joy";

import { images } from "../../generated/image_imports";
import { commonTooltipSx } from "./tooltipStyles";

const BLACKSMITH_SPELLS = [
    {
        name: "Craft",
        icon: images.craft_256,
        description:
            "Craft allies in a 2×2 area: each may gain a second attack, a frozen weapon, be stunned, or nothing. Requires stack power 4.",
    },
    {
        name: "Armor Rune",
        icon: images.armor_rune_256,
        description: "50% chance to add +1 armor (stacks). Requires stack power 1.",
    },
    {
        name: "Weapon Rune",
        icon: images.weapon_rune_256,
        description: "50% chance to add +1 attack (stacks). Requires stack power 1.",
    },
] as const;

/** Inspection only: casting continues through the spellbook and its normal targeting rules. */
export function BlacksmithSpells({ spells, size }: { spells: string[]; size: number }) {
    return (
        <Box aria-label="Blacksmith magic spells" sx={{ display: "flex", gap: "8px", py: "4px" }}>
            {BLACKSMITH_SPELLS.map(({ name, icon, description }) => {
                const remaining = spells.filter((spell) => spell === name || spell === `System:${name}`).length;
                return (
                    <Tooltip key={name} title={`${name}: ${description} Remaining: ${remaining}.`} sx={commonTooltipSx}>
                        <Box
                            tabIndex={0}
                            aria-label={`${name}, ${remaining} remaining`}
                            sx={{ width: size, minWidth: 0, textAlign: "center", opacity: remaining ? 1 : 0.4 }}
                        >
                            <Box sx={{ position: "relative", width: size, height: size }}>
                                <Box
                                    component="img"
                                    src={icon}
                                    alt={name}
                                    sx={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                        borderRadius: "12%",
                                        border: "1px solid #8e7146",
                                        boxShadow: "0 2px 6px #000",
                                    }}
                                />
                                <Box
                                    component="span"
                                    sx={{
                                        position: "absolute",
                                        right: 2,
                                        bottom: 2,
                                        px: "4px",
                                        borderRadius: "3px",
                                        background: "rgba(12,9,5,.92)",
                                        color: "#ead3a0",
                                        fontSize: Math.max(11, Math.round(size * 0.23)),
                                        lineHeight: 1.3,
                                    }}
                                >
                                    {remaining}
                                </Box>
                            </Box>
                            <Typography
                                sx={{ mt: "4px", fontSize: Math.max(8, Math.round(size * 0.15)), color: "#dcc69e" }}
                            >
                                {name}
                            </Typography>
                        </Box>
                    </Tooltip>
                );
            })}
        </Box>
    );
}
