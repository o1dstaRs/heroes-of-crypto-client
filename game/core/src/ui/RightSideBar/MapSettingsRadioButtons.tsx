import { ToGridType, GridType, GridVals } from "@heroesofcrypto/common";
import React, { useState, useEffect } from "react";
import Box from "@mui/joy/Box";
import FormControl from "@mui/joy/FormControl";
import RadioGroup from "@mui/joy/RadioGroup";
import Radio from "@mui/joy/Radio";
import Button from "@mui/joy/Button";
import { usePixiManager } from "../../pixi/PixiGameManager";

const MapSettingsRadioButtons: React.FC = () => {
    const [gridType, setGridType] = useState<GridType>(GridVals.NORMAL);
    const manager = usePixiManager();

    useEffect(() => {
        const connection = manager.onGridTypeChanged.connect((newGridType: GridType) => {
            setGridType(newGridType);
        });

        return () => {
            connection.disconnect();
        };
    }, [manager]);

    const handleMapSettingChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newGridType = ToGridType[event.target.value.toString()];
        setGridType(newGridType);
        manager.SetGridType(newGridType);
    };

    const handleRandomButtonClick = () => {
        // Filter out NO_TYPE from the grid types
        const availableGridTypes = [
            GridVals.NORMAL,
            GridVals.LAVA_CENTER,
            GridVals.BLOCK_CENTER,
            // GridType.WATER_CENTER,
        ];

        // Randomly select a grid type from the filtered list
        const randomGridType = availableGridTypes[Math.floor(Math.random() * availableGridTypes.length)];

        setGridType(randomGridType);
        manager.SetGridType(randomGridType);
    };

    return (
        <Box sx={{ padding: 1, display: "flex" }}>
            {/* Left side: Radio buttons */}
            <Box sx={{ flex: 1 }}>
                <FormControl>
                    <RadioGroup
                        aria-label="map-settings"
                        name="map-settings"
                        value={gridType}
                        onChange={handleMapSettingChange}
                    >
                        <Radio
                            value={GridVals.NORMAL}
                            label="Normal"
                            sx={{
                                color: "rgba(255, 143, 0, 0.5)",
                                "&.Mui-checked": {
                                    color: "#FF8F00",
                                },
                                "& .MuiTypography-root": {
                                    color: "rgba(255, 143, 0, 0.5)",
                                },
                                "&.Mui-checked .MuiTypography-root": {
                                    color: "#FF8F00",
                                },
                                "&:hover": {
                                    "& .MuiTypography-root": { color: "rgba(255, 143, 0, 0.8)" },
                                    color: "rgba(255, 143, 0, 0.8)",
                                },
                            }}
                        />
                        <Radio
                            value={GridVals.LAVA_CENTER}
                            label="Lava"
                            sx={{
                                color: "rgba(255, 143, 0, 0.5)",
                                "&.Mui-checked": {
                                    color: "#FF8F00",
                                },
                                "& .MuiTypography-root": {
                                    color: "rgba(255, 143, 0, 0.5)",
                                },
                                "&.Mui-checked .MuiTypography-root": {
                                    color: "#FF8F00",
                                },
                                "&:hover": {
                                    "& .MuiTypography-root": { color: "rgba(255, 143, 0, 0.8)" },
                                    color: "rgba(255, 143, 0, 0.8)",
                                },
                            }}
                        />
                        <Radio
                            value={GridVals.BLOCK_CENTER}
                            label="Mountain"
                            sx={{
                                color: "rgba(255, 143, 0, 0.5)",
                                "&.Mui-checked": {
                                    color: "#FF8F00",
                                },
                                "& .MuiTypography-root": {
                                    color: "rgba(255, 143, 0, 0.5)",
                                },
                                "&.Mui-checked .MuiTypography-root": {
                                    color: "#FF8F00",
                                },
                                "&:hover": {
                                    "& .MuiTypography-root": { color: "rgba(255, 143, 0, 0.8)" },
                                    color: "rgba(255, 143, 0, 0.8)",
                                },
                            }}
                        />
                        {/* <Radio value={GridType.WATER_CENTER} label="Water" /> */}
                    </RadioGroup>
                </FormControl>
            </Box>

            {/* Right side: Random button */}
            <Box sx={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
                <Button
                    variant="outlined"
                    onClick={handleRandomButtonClick}
                    sx={{
                        height: "100%",
                        width: "100%",
                        borderColor: "#FF8F00",
                        color: "#FF8F00",
                        "&:hover": {
                            borderColor: "#FF8F00",
                            backgroundColor: "rgba(255, 143, 0, 0.1)",
                        },
                        "&:active": {
                            backgroundColor: "rgba(255, 143, 0, 0.2)",
                        },
                    }}
                >
                    Random
                </Button>
            </Box>
        </Box>
    );
};

export default MapSettingsRadioButtons;
