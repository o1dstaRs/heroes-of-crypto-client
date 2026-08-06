import { ToGridType, GridType, GridVals } from "@heroesofcrypto/common";
import React, { useState, useEffect } from "react";
import Box from "@mui/joy/Box";
import FormControl from "@mui/joy/FormControl";
import RadioGroup from "@mui/joy/RadioGroup";
import Radio from "@mui/joy/Radio";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { hocDisplayFontFamily, hocFantasyRadioSx } from "../hocTheme";

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

    return (
        <Box
            sx={{
                ...hocFantasyRadioSx,
                m: 1.25,
                p: 1.25,
                display: "flex",
                border: "1px solid rgba(126,83,44,.45)",
                background: "rgba(0,0,0,.28)",
                boxShadow: "inset 0 0 13px rgba(0,0,0,.75)",
            }}
        >
            <Box sx={{ width: "100%" }}>
                <FormControl>
                    <RadioGroup
                        aria-label="map-settings"
                        name="map-settings"
                        value={gridType}
                        onChange={handleMapSettingChange}
                        sx={{ "& .MuiRadio-label": { letterSpacing: "0.05em" } }}
                    >
                        <Radio
                            value={GridVals.NORMAL}
                            label="NORMAL"
                            sx={{
                                color: "rgba(255, 143, 0, 0.5)",
                                "&.Mui-checked": {
                                    color: "#FF8F00",
                                },
                                "& .MuiTypography-root": {
                                    color: "rgba(255, 143, 0, 0.5)",
                                    fontFamily: hocDisplayFontFamily,
                                    fontWeight: 460,
                                    fontSynthesis: "weight",
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
                            label="LAVA"
                            sx={{
                                color: "rgba(255, 143, 0, 0.5)",
                                "&.Mui-checked": {
                                    color: "#FF8F00",
                                },
                                "& .MuiTypography-root": {
                                    color: "rgba(255, 143, 0, 0.5)",
                                    fontFamily: hocDisplayFontFamily,
                                    fontWeight: 460,
                                    fontSynthesis: "weight",
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
                            label="CEMETERY"
                            sx={{
                                color: "rgba(255, 143, 0, 0.5)",
                                "&.Mui-checked": {
                                    color: "#FF8F00",
                                },
                                "& .MuiTypography-root": {
                                    color: "rgba(255, 143, 0, 0.5)",
                                    fontFamily: hocDisplayFontFamily,
                                    fontWeight: 460,
                                    fontSynthesis: "weight",
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
        </Box>
    );
};

export default MapSettingsRadioButtons;
