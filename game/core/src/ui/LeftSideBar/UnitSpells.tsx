import React, { useMemo } from "react";
import { HoCConfig } from "@heroesofcrypto/common";
import { Box, Tooltip, Typography } from "@mui/joy";

import { images, type ImageKey } from "../../generated/image_imports";
import { spellIconTextureKey } from "../../scenes/spellIcons";
import { creatureCatalogEntryByName } from "../creatureCatalog";
import { commonTooltipSx } from "./tooltipStyles";

export interface IUnitSpellEntry {
    name: string;
    remaining: number;
    icon?: string;
    description: string;
}

const parseSpell = (entry: string): { faction: string; name: string } => {
    const separator = entry.indexOf(":");
    if (separator < 0) return { faction: "System", name: entry.trim() };
    return { faction: entry.slice(0, separator) || "System", name: entry.slice(separator + 1).trim() };
};

const describeSpell = (faction: string, name: string): string => {
    try {
        const config = HoCConfig.getSpellConfig(faction, name);
        return `${config.desc.join(" ")} Requires stack power ${config.minimal_caster_stack_power}.`;
    } catch {
        return "";
    }
};

/**
 * Every spell the creature is drafted with, then any it gained, in book order, with the scrolls left of each.
 * A spell whose scrolls ran out stays listed (dimmed, 0 left) so the player still sees what the caster had.
 */
export const unitSpellEntries = (unitName: string, spells: readonly string[]): IUnitSpellEntry[] => {
    const factions = new Map<string, string>();
    const remaining = new Map<string, number>();
    const note = (entry: string): string => {
        const spell = parseSpell(entry);
        if (spell.name && !factions.has(spell.name)) factions.set(spell.name, spell.faction);
        return spell.name;
    };
    for (const entry of creatureCatalogEntryByName(unitName)?.config.spells ?? []) note(entry);
    for (const entry of spells) {
        const name = note(entry);
        if (name) remaining.set(name, (remaining.get(name) ?? 0) + 1);
    }
    return [...factions].map(([name, faction]) => ({
        name,
        remaining: remaining.get(name) ?? 0,
        icon: (images as Partial<Record<ImageKey, string>>)[spellIconTextureKey(name) as ImageKey],
        description: describeSpell(faction, name),
    }));
};

const ROW_SLOTS = 3;
const GAP_PX = 8;

/** Inspection only: casting continues through the spellbook and its normal targeting rules. */
export function UnitSpells({ unitName, spells, size }: { unitName: string; spells: string[]; size: number }) {
    const entries = useMemo(() => unitSpellEntries(unitName, spells), [unitName, spells]);
    if (!entries.length) return null;
    // One row, like the abilities above: a caster with more than three spells gets smaller tiles in the
    // same width, and its names move into the tooltips.
    const crowded = entries.length > ROW_SLOTS;
    const rowWidth = ROW_SLOTS * size + (ROW_SLOTS - 1) * GAP_PX;
    const tile = crowded ? Math.floor((rowWidth - (entries.length - 1) * GAP_PX) / entries.length) : size;
    return (
        <Box aria-label={`${unitName} magic spells`} sx={{ display: "flex", gap: `${GAP_PX}px`, py: "4px" }}>
            {entries.map(({ name, icon, description, remaining }) => (
                <Tooltip
                    key={name}
                    title={`${name}: ${description ? `${description} ` : ""}Remaining: ${remaining}.`}
                    sx={commonTooltipSx}
                >
                    <Box
                        tabIndex={0}
                        aria-label={`${name}, ${remaining} remaining`}
                        sx={{ width: tile, minWidth: 0, textAlign: "center", opacity: remaining ? 1 : 0.4 }}
                    >
                        <Box sx={{ position: "relative", width: tile, height: tile }}>
                            {icon ? (
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
                            ) : (
                                <Box
                                    sx={{
                                        width: "100%",
                                        height: "100%",
                                        borderRadius: "12%",
                                        border: "1px solid #8e7146",
                                        background: "rgba(12,9,5,.92)",
                                    }}
                                />
                            )}
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
                                    fontSize: Math.max(11, Math.round(tile * 0.23)),
                                    lineHeight: 1.3,
                                }}
                            >
                                {remaining}
                            </Box>
                        </Box>
                        {!crowded && (
                            <Typography
                                sx={{ mt: "4px", fontSize: Math.max(8, Math.round(tile * 0.15)), color: "#dcc69e" }}
                            >
                                {name}
                            </Typography>
                        )}
                    </Box>
                </Tooltip>
            ))}
        </Box>
    );
}
