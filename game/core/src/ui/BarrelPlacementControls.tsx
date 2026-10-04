import type { TeamType } from "@heroesofcrypto/common";
import { Box, Button, Stack, Typography } from "@mui/joy";
import React, { useEffect, useState } from "react";

import { images } from "../generated/image_imports";
import { usePixiManager } from "../pixi/PixiGameManager";

interface BarrelPlacementControlsProps {
    team: TeamType;
    barrels?: { index: number; cell: { x: number; y: number } }[];
    disabled?: boolean;
}

export default function BarrelPlacementControls({ team, barrels, disabled = false }: BarrelPlacementControlsProps) {
    const manager = usePixiManager();
    const [localBarrels, setLocalBarrels] = useState(() => manager.GetBarrelPlacementState(team));
    const [placing, setPlacing] = useState<number>();
    useEffect(() => {
        const update = () => {
            setLocalBarrels(manager.GetBarrelPlacementState(team));
            setPlacing(manager.GetBarrelPlacementIndex(team));
        };
        const changed = update;
        update();
        const stateBinding = manager.onVisibleStateUpdated.connect(update);
        const artifactBinding = manager.onArtifactChanged.connect(changed);
        return () => {
            stateBinding.disconnect();
            artifactBinding.disconnect();
            manager.CancelBarrelPlacement();
        };
    }, [manager, team]);
    const positions = barrels ?? localBarrels;
    const positionKey = positions.map((barrel) => `${barrel.index}:${barrel.cell.x}:${barrel.cell.y}`).join(";");
    useEffect(() => {
        setPlacing(undefined);
    }, [positionKey]);
    useEffect(() => {
        if (disabled) {
            manager.CancelBarrelPlacement();
            setPlacing(undefined);
        }
    }, [disabled, manager]);

    return (
        <Stack spacing={0.5} sx={{ px: 0.5, py: 0.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Box
                    component="img"
                    src={images.artifact_t1_barrel_barricade_256}
                    alt=""
                    sx={{ width: 32, height: 32 }}
                />
                <Typography level="title-sm">Barrel Barricade · {positions.length}/2 placed</Typography>
            </Box>
            {[0, 1].map((index) => {
                const barrel = positions.find((entry) => entry.index === index);
                return (
                    <Stack key={index} direction="row" spacing={0.5} alignItems="center">
                        <Typography level="body-xs" sx={{ flex: 1 }}>
                            Barrel {index + 1}
                            {barrel ? ` · ${barrel.cell.x + 1}, ${barrel.cell.y + 1}` : " · unplaced"}
                        </Typography>
                        <Button
                            size="sm"
                            variant={placing === index ? "solid" : "soft"}
                            disabled={disabled}
                            onClick={() => {
                                if (manager.BeginBarrelPlacement(team, index)) setPlacing(index);
                            }}
                        >
                            {barrel ? "Move" : "Place"}
                        </Button>
                        {barrel && (
                            <Button
                                size="sm"
                                variant="plain"
                                disabled={disabled}
                                onClick={() => manager.RemovePlacedBarrel(team, index)}
                            >
                                Remove
                            </Button>
                        )}
                    </Stack>
                );
            })}
            {placing !== undefined ? (
                <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography level="body-xs" sx={{ flex: 1 }}>
                        Click an empty cell in your deployment zone. Esc cancels.
                    </Typography>
                    <Button
                        size="sm"
                        variant="plain"
                        onClick={() => {
                            manager.CancelBarrelPlacement();
                            setPlacing(undefined);
                        }}
                    >
                        Cancel
                    </Button>
                </Stack>
            ) : (
                !disabled && (
                    <Typography level="body-xs">
                        One hit destroys a barrel. Unplaced barrels are placed automatically when you are ready.
                    </Typography>
                )
            )}
        </Stack>
    );
}
