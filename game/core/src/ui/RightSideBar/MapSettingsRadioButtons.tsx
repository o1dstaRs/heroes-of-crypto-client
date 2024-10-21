import { GridType, ToGridType } from "@heroesofcrypto/common";
import React, { useState, useEffect } from "react";
import Box from "@mui/joy/Box";
import FormControl from "@mui/joy/FormControl";
import RadioGroup from "@mui/joy/RadioGroup";
import Radio from "@mui/joy/Radio";
import Button from "@mui/joy/Button";
import { useManager } from "../../manager";

const MapSettingsRadioButtons: React.FC = () => {
    const [gridType, setGridType] = useState<GridType>(GridType.NORMAL);
    const manager = useManager();

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
            GridType.NORMAL,
            GridType.LAVA_CENTER,
            GridType.BLOCK_CENTER,
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
                        <Radio value={GridType.NORMAL} label="Normal" />
                        <Radio value={GridType.LAVA_CENTER} label="Lava" />
                        <Radio value={GridType.BLOCK_CENTER} label="Mountain" />
                        {/* <Radio value={GridType.WATER_CENTER} label="Water" /> */}
                    </RadioGroup>
                </FormControl>
            </Box>

            {/* Right side: Random button */}
            <Box sx={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleRandomButtonClick}
                    sx={{ height: "100%", width: "100%" }}
                >
                    Random
                </Button>
            </Box>
        </Box>
    );
};

export default MapSettingsRadioButtons;
