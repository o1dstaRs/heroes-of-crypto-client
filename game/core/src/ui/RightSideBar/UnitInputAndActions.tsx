import React, { useState, useRef, useEffect } from "react";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Input from "@mui/joy/Input";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import { TeamType } from "@heroesofcrypto/common";

import { useManager } from "../../manager";

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

    const manager = useManager();

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
            manager.m_settings.m_amountOfSelectedUnits = count;
            manager.Accept();
            setUnitCount(count.toString());
            changedRef.current = false;
        }
    };

    return (
        <Box sx={{ width: "100%", maxWidth: 400, marginTop: 2 }}>
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
                    slotProps={{
                        input: {
                            min: DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT,
                        },
                    }}
                />
                <Stack direction="row" spacing={2}>
                    <Button
                        variant="solid"
                        color="primary"
                        onClick={() => {
                            handleAccept(parseInt(unitCount) || DEFAULT_NUMBER_OF_UNITS_TO_ACCEPT);
                        }}
                        sx={{ flexGrow: 1 }}
                    >
                        Accept
                    </Button>
                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={() => {
                            manager.Clone();
                        }}
                        sx={{ flexGrow: 1 }}
                    >
                        Clone
                    </Button>
                </Stack>
            </Stack>
        </Box>
    );
};

export default UnitInputAndActions;
