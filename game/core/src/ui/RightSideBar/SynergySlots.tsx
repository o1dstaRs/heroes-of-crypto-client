import {
    ChaosSynergyNames,
    LifeSynergyNames,
    MightSynergyNames,
    NatureSynergyNames,
    SynergyKeysToPower,
    SynergyWithLevel,
    TeamType,
} from "@heroesofcrypto/common";
import Box from "@mui/joy/Box";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";

import { usePixiManager } from "../../pixi/PixiGameManager";
import { SYNERGY_KEY_TO_IMAGE, SYNERGY_NAME_TO_DESCRIPTION } from "../LeftSideBar/SynergiesConstants";

const SYNERGIES = [
    { key: "Life:1", label: "Life Supply", name: LifeSynergyNames.PLUS_SUPPLY_PERCENTAGE, variant: 1 },
    { key: "Life:2", label: "Life Morale & Luck", name: LifeSynergyNames.PLUS_MORALE_AND_LUCK, variant: 2 },
    { key: "Chaos:1", label: "Chaos Movement", name: ChaosSynergyNames.MOVEMENT, variant: 1 },
    { key: "Chaos:2", label: "Chaos Break", name: ChaosSynergyNames.BREAK_ON_ATTACK, variant: 2 },
    { key: "Might:1", label: "Might Aura Range", name: MightSynergyNames.PLUS_AURAS_RANGE, variant: 1 },
    {
        key: "Might:2",
        label: "Might Ability Power",
        name: MightSynergyNames.PLUS_STACK_ABILITIES_POWER,
        variant: 2,
    },
    { key: "Nature:1", label: "Nature Board Units", name: NatureSynergyNames.INCREASE_BOARD_UNITS, variant: 1 },
    { key: "Nature:2", label: "Nature Fly Armor", name: NatureSynergyNames.PLUS_FLY_ARMOR, variant: 2 },
] as const;

const levelsBySynergy = (
    possible: Map<TeamType, SynergyWithLevel[]> | null,
    teamType: TeamType,
): Record<string, number> => {
    const levels: Record<string, number> = {};
    for (const entry of possible?.get(teamType) ?? []) {
        const synergy = SYNERGIES.find(({ name }) => name === entry.synergy);
        if (synergy) {
            levels[synergy.key] = Math.max(levels[synergy.key] ?? 0, entry.level ?? 0);
        }
    }
    return levels;
};

/**
 * Fill the description's `{}` placeholders with the synergy's real numbers for its level. The raw
 * templates rendered literally before ("The entire army gets +{} morale and +{} luck"), which read
 * as a broken tooltip — substitute each placeholder in order from the power table.
 */
export const substitutedSynergyDescription = (imageKey: string): string => {
    const template = (SYNERGY_NAME_TO_DESCRIPTION as Record<string, string>)[imageKey] ?? "";
    const powers = (SynergyKeysToPower as Record<string, number[]>)[imageKey] ?? [];
    let index = 0;
    return template.replace(/\{\}/g, () => {
        const value = powers[index];
        index += 1;
        return value !== undefined ? `${value}` : "?";
    });
};

/** Applied entries arrive as "Faction:variantNumber:level" — index the ACTIVE level by "Faction:variant". */
export const appliedSynergyLevelByKey = (entries: readonly string[]): Record<string, number> => {
    const applied: Record<string, number> = {};
    for (const entry of entries) {
        const [faction, variant, level] = entry.split(":");
        const parsedLevel = Number(level);
        if (faction && variant && Number.isFinite(parsedLevel) && parsedLevel > 0) {
            applied[`${faction}:${variant}`] = parsedLevel;
        }
    }
    return applied;
};

/** The three level pips under a synergy tile: filled up to `level`, dimmed sockets for the rest. */
const LevelDots: React.FC<{ level: number; active: boolean }> = ({ level, active }) => (
    <Box sx={{ display: "flex", justifyContent: "center", gap: "2px", mt: "1px" }}>
        {[1, 2, 3].map((dot) => (
            <Box
                key={dot}
                sx={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    backgroundColor:
                        dot <= level ? (active ? "#FFB300" : "rgba(255,179,0,0.45)") : "rgba(255,255,255,0.18)",
                    transition: "background-color 0.25s",
                }}
            />
        ))}
    </Box>
);

export const SynergySlots: React.FC<{ teamType: TeamType; size?: number | string }> = ({ teamType, size = 22 }) => {
    const manager = usePixiManager();
    const [possible, setPossible] = useState<Map<TeamType, SynergyWithLevel[]> | null>(null);
    // Bumped after every pick/loadout refresh so the applied-state (read straight from the fight) rerenders.
    const [, setSynergyRevision] = useState(0);
    useEffect(() => {
        const connection = manager.onPossibleSynergiesUpdated.connect((sMap: Map<TeamType, SynergyWithLevel[]>) => {
            setPossible(new Map(sMap));
            setSynergyRevision((revision) => revision + 1);
        });
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    const levels = levelsBySynergy(possible, teamType);
    const applied = appliedSynergyLevelByKey(manager.GetAppliedSynergies(teamType));

    return (
        <Box
            sx={{
                display: "flex",
                flex: "1 1 auto",
                minWidth: 0,
                flexWrap: "nowrap",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                gap: 0.2,
            }}
        >
            {SYNERGIES.map(({ key, label, name, variant }) => {
                const unlockedLevel = levels[key] ?? 0;
                const isUnlocked = unlockedLevel > 0;
                const appliedLevel = applied[key] ?? 0;
                const isChosen = appliedLevel > 0;
                const [faction] = key.split(":");
                const imageKey = `${faction}:${variant}:${isChosen ? appliedLevel : Math.max(unlockedLevel, 1)}`;
                const src = (SYNERGY_KEY_TO_IMAGE as Record<string, string>)[imageKey];
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
                                    {isChosen
                                        ? ` — level ${appliedLevel}`
                                        : isUnlocked
                                          ? ` — level ${unlockedLevel}`
                                          : ""}
                                </Typography>
                                <Typography level="body-xs">
                                    {isUnlocked
                                        ? substitutedSynergyDescription(imageKey)
                                        : "Field two units of this faction to unlock"}
                                </Typography>
                                {isUnlocked && !isChosen && (
                                    <Typography level="body-xs" sx={{ mt: 0.25, fontStyle: "italic", opacity: 0.8 }}>
                                        Click to field this synergy instead
                                    </Typography>
                                )}
                            </Box>
                        }
                    >
                        <Box
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                minWidth: 0,
                                flex: `1 1 ${typeof size === "number" ? `${size}px` : size}`,
                                cursor: isUnlocked ? "pointer" : "default",
                            }}
                            onClick={() => {
                                // One of two per faction (owner call): clicking an unlocked, unchosen
                                // synergy switches the team's pick; the engine strips the other variant.
                                if (isUnlocked && !isChosen) {
                                    manager.SelectSynergyVariant(teamType, faction, name);
                                }
                            }}
                        >
                            <Box
                                component="img"
                                src={src}
                                alt={label}
                                sx={{
                                    width: size,
                                    height: "auto",
                                    maxWidth: size,
                                    minWidth: 0,
                                    aspectRatio: "1 / 1",
                                    objectFit: "contain",
                                    filter: isChosen ? "none" : "grayscale(100%) brightness(0.55)",
                                    opacity: isChosen ? 1 : isUnlocked ? 0.75 : 0.5,
                                    transition: "filter 0.25s, opacity 0.25s",
                                }}
                            />
                            <LevelDots level={isChosen ? appliedLevel : unlockedLevel} active={isChosen} />
                        </Box>
                    </Tooltip>
                );
            })}
        </Box>
    );
};

export default SynergySlots;
