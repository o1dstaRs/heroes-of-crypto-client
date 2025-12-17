import React, { useState, useRef, useEffect } from "react";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Input from "@mui/joy/Input";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import { TeamType } from "@heroesofcrypto/common";

import { usePixiManager } from "../../pixi/PixiGameManager";
import { images } from "../../generated/image_imports";

const DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT = 1;

const UnitInputAndActions = ({
    selectedUnitCount,
    selectedTeamType,
}: {
    selectedUnitCount: number;
    selectedTeamType: TeamType;
}) => {
    const changedRef = useRef(false);
    const [unitCount, setUnitCount] = useState("");
    const [previousCanPlaceUnits, setPreviousCanPlaceUnits] = useState<number | null>(null);

    const [placementChanged, setPlacementChanged] = useState(false);

    const manager = usePixiManager();

    useEffect(() => {
        const connection = manager.onPlacementChanged.connect((hasChanged) => {
            setPlacementChanged(hasChanged);
        });

        return () => {
            connection.disconnect();
        };
    }, [manager]);

    const changeUnitCount = (value: string) => {
        changedRef.current = !!selectedUnitCount;
        setUnitCount(value);
    };

    let canPlaceUnits = null;
    if (selectedUnitCount > 0) {
        if (!changedRef.current) {
            const selectedUnitCountString = selectedUnitCount.toString();
            if (selectedUnitCountString !== unitCount) {
                setUnitCount(selectedUnitCount.toString());
            }
        }

        canPlaceUnits =
            selectedTeamType !== undefined
                ? manager.GetNumberOfUnitsAvailableForPlacement(selectedTeamType)
                : previousCanPlaceUnits;
    } else if (unitCount !== "") {
        setUnitCount("");
    }

    useEffect(() => {
        if (selectedTeamType !== undefined) {
            const currentCanPlaceUnits = manager.GetNumberOfUnitsAvailableForPlacement(selectedTeamType);
            setPreviousCanPlaceUnits(currentCanPlaceUnits);
        }
    }, [selectedTeamType, manager]);

    useEffect(() => {
        if (placementChanged && selectedTeamType !== undefined) {
            const currentCanPlaceUnits = manager.GetNumberOfUnitsAvailableForPlacement(selectedTeamType);
            setPreviousCanPlaceUnits(currentCanPlaceUnits);
            if (placementChanged) {
                setPlacementChanged(false);
            }
        }
    }, [placementChanged, selectedTeamType, manager]);

    const handleAccept = (count: number) => {
        if (!Number.isNaN(count) && count > 0) {
            manager.setAmountOfSelectedObjects(Math.floor(count));
            manager.Accept();
            setUnitCount(count.toString());
            changedRef.current = false;
        }
    };

    return (
        <Box sx={{ width: "100%", marginTop: 2 }}>
            {canPlaceUnits !== null && (
                <Typography sx={{ color: "orange", fontWeight: "bold", paddingTop: 1, paddingBottom: 2 }}>
                    Max units for the team: {canPlaceUnits}
                </Typography>
            )}

            <Stack spacing={1}>
                <Input
                    type="number"
                    value={unitCount}
                    onChange={(e) => changeUnitCount(e.target.value)}
                    placeholder="# of units"
                    variant="outlined"
                    sx={{
                        color: "rgba(255, 143, 0, 0.5)",
                        borderColor: "rgba(255, 143, 0, 0.5)",
                        "--Input-focusedHighlight": "#FF8F00",
                        "--Input-focusedThickness": "2px",
                        "&:hover": {
                            borderColor: "#FF8F00",
                            color: "#FF8F00",
                        },
                        "&:focus-within": {
                            borderColor: "#FF8F00",
                            color: "#FF8F00",
                            "--Input-focusedHighlight": "#FF8F00",
                        },
                        "&::before": {
                            boxShadow: "none !important",
                            outline: "none !important",
                        },
                        "&.Mui-focused::before": {
                            boxShadow: "0 0 0 var(--Input-focusedThickness) var(--Input-focusedHighlight) !important",
                        },
                        "&.Mui-focused": {
                            borderColor: "#FF8F00",
                            color: "#FF8F00",
                            boxShadow: "none",
                            outline: "none",
                            "& input::placeholder": {
                                color: "#FF8F00",
                                opacity: 0.6,
                            },
                        },
                        "& input::placeholder": {
                            color: "rgba(255, 143, 0, 0.5)",
                            opacity: 0.6,
                        },
                        transition: "all 0.2s ease",
                    }}
                    slotProps={{
                        input: {
                            min: DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT,
                        },
                    }}
                />
                <Stack direction="row" spacing={2}>
                    <Button
                        variant="plain"
                        onClick={() => {
                            handleAccept(parseInt(unitCount) || DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT);
                        }}
                        sx={{
                            flex: 1,
                            minWidth: 0,
                            backgroundImage: `url(${images.button})`,
                            backgroundSize: "100% 100%",
                            backgroundRepeat: "no-repeat",
                            color: "white",
                            height: "40px",
                            "&:hover": {
                                filter: "brightness(1.5) saturate(1.2)",
                                backgroundColor: "transparent",
                            },
                        }}
                    >
                        <img src={images.accept_text} alt="Accept" style={{ height: "40%" }} />
                    </Button>
                    <Button
                        variant="plain"
                        onClick={() => {
                            manager.Clone();
                        }}
                        sx={{
                            flex: 1,
                            minWidth: 0,
                            backgroundImage: `url(${images.button})`,
                            backgroundSize: "100% 100%",
                            backgroundRepeat: "no-repeat",
                            color: "white",
                            height: "40px",
                            "&:hover": {
                                filter: "brightness(1.5) saturate(1.2)",
                                backgroundColor: "transparent",
                            },
                        }}
                    >
                        <img src={images.clone_text} alt="Clone" style={{ height: "40%" }} />
                    </Button>
                </Stack>
            </Stack>
        </Box>
    );
};

export default UnitInputAndActions;
