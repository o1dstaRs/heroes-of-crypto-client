import { UnitProperties } from "@heroesofcrypto/common";
import DiceIcon from "@mui/icons-material/Casino";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import FactoryRoundedIcon from "@mui/icons-material/FactoryRounded";
import TerrainRoundedIcon from "@mui/icons-material/TerrainRounded";
import Box from "@mui/joy/Box";
import Divider from "@mui/joy/Divider";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import Sheet from "@mui/joy/Sheet";
import { useColorScheme } from "@mui/joy/styles";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState, useCallback, useMemo } from "react";

import { EDGES_SIZE } from "../../statics";
import { MessageBox } from "./MessageBox";
import { useManager } from "../../manager";
import greenOverlayImage from "../../../images/overlay_green.webp";
import redOverlayImage from "../../../images/overlay_red.webp";
import { UnitStatsListItem } from "./UnitStatsListItem";
import { UpNext } from "./UpNext";
import SynergiesRow from "./SynergiesRow";
import { IWindowSize } from "../../state/visible_state";

export default function LeftSideBar({ gameStarted, windowSize }: { gameStarted: boolean; windowSize: IWindowSize }) {
    const [badgeVisible, setBadgeVisible] = useState(false);
    const [barSize, setBarSize] = useState(280);
    const [buttonsVisible] = useState({
        prediction: false,
        terrain: false,
        factory: false,
        dashboard: false,
    });
    const [unitProperties, setUnitProperties] = useState<UnitProperties>({} as UnitProperties);

    const { setMode } = useColorScheme();
    const manager = useManager();

    const adjustBarSize = useCallback(() => {
        const additionalBoardPixels = gameStarted ? 0 : 512;
        const edgesSize = gameStarted ? 0 : EDGES_SIZE;
        const widthRatio = windowSize.width / (2048 + edgesSize + additionalBoardPixels);
        const heightRatio = windowSize.height / (2048 + edgesSize);

        const scaleRatio = Math.min(widthRatio, heightRatio);
        const scaledBoardSize = (2048 + additionalBoardPixels) * scaleRatio;

        const edgeSizeWidth = gameStarted ? 0 : edgesSize / 2;
        const rightBarEndAtBoard = (windowSize.width - scaledBoardSize) / 2;
        setBarSize(rightBarEndAtBoard > edgeSizeWidth ? rightBarEndAtBoard : edgeSizeWidth);
    }, [gameStarted, windowSize.width, windowSize.height]);

    // Handle bar size updates
    useEffect(() => {
        adjustBarSize();
    }, [adjustBarSize]);

    // Handle badge visibility
    useEffect(() => {
        const interval = setInterval(() => {
            setBadgeVisible(true);
            const timeout = setTimeout(() => {
                setBadgeVisible(false);
            }, 5000);
            return () => clearTimeout(timeout);
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    // Handle unit selection
    useEffect(() => {
        const connection = manager.onUnitSelected.connect(setUnitProperties);
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    // Set dark mode
    useEffect(() => {
        setMode("dark");
    }, [setMode]);

    const shouldColumnize = useMemo(() => {
        return windowSize.width / windowSize.height >= 16 / 9;
    }, [windowSize.width, windowSize.height]);

    return (
        <Sheet
            className="Sidebar"
            sx={{
                position: "fixed",
                zIndex: 1,
                height: "100dvh",
                width: `${barSize}px`,
                top: 0,
                left: 0,
                p: 2,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                borderRight: "1px solid",
                borderColor: "divider",
                overflowY: "auto",
                overflowX: "hidden",
            }}
        >
            {unitProperties.team ? (
                <>
                    <Box
                        component="img"
                        src={unitProperties.team === 2 ? greenOverlayImage : redOverlayImage}
                        sx={{
                            position: "absolute",
                            width: "350px",
                            height: "100%",
                            top: 0,
                            right: -350,
                            transform: "rotate(65deg)",
                            transformOrigin: "top left",
                            opacity: 1,
                            zIndex: 0,
                        }}
                    />
                    <SynergiesRow synergies={unitProperties.synergies} />
                </>
            ) : (
                <Box sx={{ height: "40px" }} />
            )}

            <Box
                sx={{
                    minHeight: 0,
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <List
                    size="sm"
                    sx={{
                        gap: 1,
                        "--List-nestedInsetStart": "30px",
                        "--ListItem-radius": (t) => t.vars.radius.sm,
                    }}
                >
                    {Object.values(buttonsVisible).some((visible) => visible) && (
                        <Box display="flex" width="100%">
                            {buttonsVisible.prediction && (
                                <ListItem sx={{ flexGrow: 1, flexBasis: 0, position: "relative" }}>
                                    <ListItemButton disabled>
                                        <DiceIcon />
                                    </ListItemButton>
                                    {badgeVisible && (
                                        <Box
                                            sx={{
                                                position: "absolute",
                                                top: -17,
                                                right: -32,
                                                backgroundColor: "#FFD700",
                                                color: "#000000",
                                                borderRadius: "10px",
                                                padding: "4px 8px",
                                                fontSize: "0.7rem",
                                                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                                                zIndex: 3,
                                                "&::after": {
                                                    content: '""',
                                                    position: "absolute",
                                                    bottom: -5,
                                                    left: 8,
                                                    width: 0,
                                                    height: 0,
                                                    borderLeft: "4px solid transparent",
                                                    borderRight: "4px solid transparent",
                                                    borderTop: "5px solid #FFD700",
                                                },
                                            }}
                                        >
                                            Prediction
                                        </Box>
                                    )}
                                </ListItem>
                            )}

                            {buttonsVisible.terrain && (
                                <ListItem sx={{ flexGrow: 1, flexBasis: 0 }}>
                                    <ListItemButton>
                                        <TerrainRoundedIcon />
                                    </ListItemButton>
                                </ListItem>
                            )}

                            {buttonsVisible.factory && (
                                <ListItem sx={{ flexGrow: 1, flexBasis: 0 }}>
                                    <ListItemButton>
                                        <FactoryRoundedIcon />
                                    </ListItemButton>
                                </ListItem>
                            )}

                            {buttonsVisible.dashboard && (
                                <ListItem sx={{ flexGrow: 1, flexBasis: 0 }}>
                                    <ListItemButton selected>
                                        <DashboardRoundedIcon />
                                        <Box sx={{ marginLeft: 2 }}>
                                            <Typography level="title-sm">Fight</Typography>
                                        </Box>
                                    </ListItemButton>
                                </ListItem>
                            )}
                        </Box>
                    )}

                    <Divider />

                    <UnitStatsListItem barSize={barSize} columnize={shouldColumnize} unitProperties={unitProperties} />

                    <Box sx={{ flexGrow: 1 }} />

                    <MessageBox gameStarted={gameStarted} />

                    <UpNext />
                </List>
            </Box>
        </Sheet>
    );
}
