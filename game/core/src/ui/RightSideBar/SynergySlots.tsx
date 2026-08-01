import {
    ChaosSynergyNames,
    LifeSynergyNames,
    MightSynergyNames,
    NatureSynergyNames,
    SynergyWithLevel,
    TeamType,
} from "@heroesofcrypto/common";
import Box from "@mui/joy/Box";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";

import { usePixiManager } from "../../pixi/PixiGameManager";
import { SYNERGY_KEY_TO_IMAGE, SYNERGY_NAME_TO_DESCRIPTION } from "../LeftSideBar/SynergiesConstants";

/**
 * The four racial synergies, always all four, lit as the army fills out.
 *
 * There is nothing to choose here — the engine assigns them (FightProperties.setSynergyUnitsPerFactions):
 * each faction gets its FIRST synergy at level min(floor(units / 2), MAX), and the second variant is pinned
 * to NO_SYNERGY. So a slot is a fixed thing that only changes brightness, and "2 units of a race" is exactly
 * what turns it on. Sandbox used to let the player pick a variant per faction, which the pick screen never
 * offered; this mirrors the pick screen instead.
 */
// Which variant each faction actually awards, read off FightProperties.setSynergyUnitsPerFactions: it gives
// exactly one per faction the level and pins the other to NO_SYNERGY. It is NOT uniformly the first one —
// Nature awards PLUS_FLY_ARMOR (2), the other three award their first. Assuming 1 across the board left the
// Nature slot permanently dark and wearing the wrong art.
const FACTIONS = [
    { key: "Life", label: "Life", variant: 1, name: LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE },
    { key: "Nature", label: "Nature", variant: 2, name: NatureSynergyNames.PLUS_FLY_ARMOR },
    { key: "Chaos", label: "Chaos", variant: 1, name: ChaosSynergyNames.MOVEMENT },
    { key: "Might", label: "Might", variant: 1, name: MightSynergyNames.PLUS_AURAS_RANGE },
] as const;

/**
 * Levels straight off the signal's payload rather than FightProperties.getSynergiesPerTeam().
 *
 * The pick screen can use that call because by then the draft is committed; during Sandbox placement it is
 * still empty, so slots never lit however many units were on the board. This map is the composition-derived
 * one the scene pushes on every army change — the same source the old chooser used to decide what was on
 * offer — so it is live from the first unit placed.
 */
const levelsByFaction = (
    possible: Map<TeamType, SynergyWithLevel[]> | null,
    teamType: TeamType,
): Record<string, number> => {
    const levels: Record<string, number> = {};
    // `entry.synergy` is the synergy's NAME (LifeSynergyNames.* and friends), not a "Faction:variant" key.
    for (const entry of possible?.get(teamType) ?? []) {
        const faction = FACTIONS.find((f) => f.name === entry.synergy);
        if (faction) {
            levels[faction.key] = Math.max(levels[faction.key] ?? 0, entry.level ?? 0);
        }
    }
    return levels;
};

export const SynergySlots: React.FC<{ teamType: TeamType; size?: number }> = ({ teamType, size = 22 }) => {
    const manager = usePixiManager();
    // The levels live on FightProperties, which is not React state — this signal is the only thing that says
    // the army changed, so it is what re-reads them.
    const [possible, setPossible] = useState<Map<TeamType, SynergyWithLevel[]> | null>(null);
    useEffect(() => {
        const connection = manager.onPossibleSynergiesUpdated.connect((sMap: Map<TeamType, SynergyWithLevel[]>) => {
            setPossible(new Map(sMap));
        });
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    const levels = levelsByFaction(possible, teamType);

    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
            {FACTIONS.map(({ key, label, variant }) => {
                const level = levels[key] ?? 0;
                const isActive = level > 0;
                // The image map is keyed by level too, but every level of a variant shares one icon, so an
                // unlit slot can safely borrow level 1's art.
                const src = (SYNERGY_KEY_TO_IMAGE as Record<string, string>)[
                    `${key}:${variant}:${isActive ? level : 1}`
                ];
                // Keyed `Faction:variant:level` like the image lookup above — the two-part key this used to
                // build matched no entry at all, so every tooltip body came out blank. An unlit slot previews
                // level 1's text, same as it borrows level 1's art.
                const description = (SYNERGY_NAME_TO_DESCRIPTION as Record<string, string>)[
                    `${key}:${variant}:${isActive ? level : 1}`
                ];
                return (
                    <Tooltip
                        key={key}
                        variant="soft"
                        placement="top"
                        sx={{ zIndex: 10000 }}
                        title={
                            <Box sx={{ maxWidth: 220, py: 0.25 }}>
                                <Typography level="title-sm">
                                    {label}
                                    {isActive ? ` — level ${level}` : ""}
                                </Typography>
                                <Typography level="body-xs">
                                    {isActive ? description : "Field two units of this faction to unlock"}
                                </Typography>
                            </Box>
                        }
                    >
                        <Box
                            component="img"
                            src={src}
                            alt={label}
                            sx={{
                                width: size,
                                height: size,
                                // Unlit slots stay visible but plainly inert: drained of colour and dimmed,
                                // so four of them read as a row of empty sockets rather than four buffs.
                                filter: isActive ? "none" : "grayscale(100%) brightness(0.55)",
                                opacity: isActive ? 1 : 0.5,
                                transition: "filter 0.25s, opacity 0.25s",
                            }}
                        />
                    </Tooltip>
                );
            })}
        </Box>
    );
};

export default SynergySlots;
