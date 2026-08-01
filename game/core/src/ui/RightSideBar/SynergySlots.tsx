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

export const SynergySlots: React.FC<{ teamType: TeamType; size?: number }> = ({ teamType, size = 22 }) => {
    const manager = usePixiManager();
    const [possible, setPossible] = useState<Map<TeamType, SynergyWithLevel[]> | null>(null);
    useEffect(() => {
        const connection = manager.onPossibleSynergiesUpdated.connect((sMap: Map<TeamType, SynergyWithLevel[]>) => {
            setPossible(new Map(sMap));
        });
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    const levels = levelsBySynergy(possible, teamType);

    return (
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.25 }}>
            {SYNERGIES.map(({ key, label, variant }) => {
                const level = levels[key] ?? 0;
                const isActive = level > 0;
                const [faction] = key.split(":");
                const imageKey = `${faction}:${variant}:${isActive ? level : 1}`;
                const src = (SYNERGY_KEY_TO_IMAGE as Record<string, string>)[imageKey];
                const description = (SYNERGY_NAME_TO_DESCRIPTION as Record<string, string>)[imageKey];
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
