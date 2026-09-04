import { ToGridType, GridType, GridVals } from "@heroesofcrypto/common";
import React, { useState, useEffect } from "react";
import Box from "@mui/joy/Box";
import FormControl from "@mui/joy/FormControl";
import RadioGroup from "@mui/joy/RadioGroup";
import Radio from "@mui/joy/Radio";
import Typography from "@mui/joy/Typography";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { hocDisplayFontFamily, hocFantasyRadioSx } from "../hocTheme";

const TEST_MAP_VALUE = "test" as const;
type MapSettingValue = GridType | typeof TEST_MAP_VALUE;
type TestNarrowingLevel = 0 | 1 | 2 | 3 | 4 | 5;

const MapSettingsRadioButtons: React.FC = () => {
    const manager = usePixiManager();
    const [mapSetting, setMapSetting] = useState<MapSettingValue>(() =>
        manager.IsTestBoardBackground() ? TEST_MAP_VALUE : GridVals.NORMAL,
    );
    const [testNarrowingLevel, setTestNarrowingLevel] = useState<TestNarrowingLevel>(
        () => manager.GetTestBoardNarrowingLevel() as TestNarrowingLevel,
    );

    useEffect(() => {
        const connection = manager.onGridTypeChanged.connect((newGridType: GridType) => {
            if (!manager.IsTestBoardBackground()) setMapSetting(newGridType);
        });
        const testConnection = manager.onTestBoardBackgroundChanged.connect((enabled: boolean) => {
            if (enabled) setMapSetting(TEST_MAP_VALUE);
        });
        const testLevelConnection = manager.onTestBoardNarrowingLevelChanged.connect((level: number) => {
            setTestNarrowingLevel(level as TestNarrowingLevel);
        });

        return () => {
            connection.disconnect();
            testConnection.disconnect();
            testLevelConnection.disconnect();
        };
    }, [manager]);

    const handleMapSettingChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value.toString();
        if (value === TEST_MAP_VALUE) {
            setMapSetting(TEST_MAP_VALUE);
            manager.SetGridType(GridVals.NORMAL);
            manager.SetTestBoardBackground(true);
            return;
        }

        const newGridType = ToGridType[value];
        if (newGridType === undefined) return;
        manager.SetTestBoardBackground(false);
        setMapSetting(newGridType);
        manager.SetGridType(newGridType);
    };

    const handleTestNarrowingLevelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const level = Number(event.target.value);
        if (level !== 0 && level !== 1 && level !== 2 && level !== 3 && level !== 4 && level !== 5) return;
        setTestNarrowingLevel(level);
        manager.SetTestBoardNarrowingLevel(level);
    };

    // Radio change does not fire when its already-selected option is clicked. Cemetery is deliberately a
    // sandbox experiment surface, so another click on BARRELS means "give me another board", not a no-op.
    const handleBarrelsClick = () => {
        if (mapSetting === GridVals.BLOCK_CENTER) {
            manager.RerollScatteredMountains();
        }
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
                        value={mapSetting}
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
                            label="FIRE PIT"
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
                            label="BARRELS"
                            onClick={handleBarrelsClick}
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
                            value={TEST_MAP_VALUE}
                            label="TEST"
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
                    {mapSetting === TEST_MAP_VALUE && (
                        <Box
                            sx={{
                                mt: 0.5,
                                ml: 3.25,
                                p: 0.75,
                                borderLeft: "1px solid rgba(255,143,0,.35)",
                            }}
                        >
                            <Typography
                                level="body-xs"
                                sx={{
                                    mb: 0.4,
                                    color: "rgba(255,143,0,.72)",
                                    fontFamily: hocDisplayFontFamily,
                                    letterSpacing: "0.08em",
                                }}
                            >
                                NARROWING LEVEL
                            </Typography>
                            <RadioGroup
                                aria-label="test-narrowing-level"
                                name="test-narrowing-level"
                                orientation="horizontal"
                                value={String(testNarrowingLevel)}
                                onChange={handleTestNarrowingLevelChange}
                                sx={{ gap: 1.25 }}
                            >
                                <Radio value="0" label="0" size="sm" />
                                <Radio value="1" label="1" size="sm" />
                                <Radio value="2" label="2" size="sm" />
                                <Radio value="3" label="3" size="sm" />
                                <Radio value="4" label="4" size="sm" />
                                <Radio value="5" label="5" size="sm" />
                            </RadioGroup>
                        </Box>
                    )}
                </FormControl>
            </Box>
        </Box>
    );
};

export default MapSettingsRadioButtons;
