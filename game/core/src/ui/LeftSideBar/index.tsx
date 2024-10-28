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
import React, { useEffect, useState } from "react";

import { EDGES_SIZE } from "../../statics";
import { MessageBox } from "./MessageBox";
import { useManager } from "../../manager";
import greenOverlayImage from "../../../images/overlay_green.webp";
import redOverlayImage from "../../../images/overlay_red.webp";
import { UnitStatsListItem } from "./UnitStatsListItem";
import { UpNext } from "./UpNext";
import SynergiesRow from "./SynergiesRow";

export default function LeftSideBar({ gameStarted }: { gameStarted: boolean }) {
    const [badgeVisible, setBadgeVisible] = useState(false);
    const [barSize, setBarSize] = useState(280); // Initialize bar size state
    const [buttonsVisible] = useState({
        prediction: false,
        terrain: false,
        factory: false,
        dashboard: false,
    });
    const [unitProperties, setUnitProperties] = useState({} as UnitProperties);

    const { setMode } = useColorScheme();
    const manager = useManager();

    const adjustBarSize = () => {
        const additionalBoardPixels = gameStarted ? 0 : 512;
        const edgesSize = gameStarted ? 0 : EDGES_SIZE;
        const widthRatio = window.innerWidth / (2048 + edgesSize + additionalBoardPixels);
        const heightRatio = window.innerHeight / (2048 + edgesSize);

        const scaleRatio = Math.min(widthRatio, heightRatio);
        const scaledBoardSize = (2048 + additionalBoardPixels) * scaleRatio;

        const edgeSizeWidth = gameStarted ? 0 : edgesSize / 2;
        const rightBarEndAtBoard = (window.innerWidth - scaledBoardSize) / 2;
        setBarSize(rightBarEndAtBoard > edgeSizeWidth ? rightBarEndAtBoard : edgeSizeWidth);
    };

    useEffect(() => {
        const interval = setInterval(() => {
            setBadgeVisible(true);
            setTimeout(() => {
                setBadgeVisible(false);
            }, 5000); // Badge disappears after 5 seconds
        }, 10000); // Badge appears every 10 seconds

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const connection1 = manager.onUnitSelected.connect(setUnitProperties);
        return () => {
            connection1.disconnect();
        };
    });

    // Set the default mode to dark before rendering
    useEffect(() => {
        setMode("dark"); // Set dark mode by default
    }, [setMode]);

    // Adjust bar size on window resize
    useEffect(() => {
        adjustBarSize(); // Initial call to set the size based on the initial window dimensions

        window.addEventListener("resize", adjustBarSize);
        window.addEventListener("wheel", adjustBarSize);
        document.addEventListener("fullscreenchange", adjustBarSize);

        return () => {
            window.removeEventListener("resize", adjustBarSize);
            window.removeEventListener("wheel", adjustBarSize);
            document.removeEventListener("fullscreenchange", adjustBarSize);
        };
    }, [gameStarted]);

    const shouldColumnize = () => {
        return window.innerWidth / window.innerHeight >= 16 / 9;
    };

    // @ts-ignore: skip styles
    return (
        <Sheet
            className="Sidebar"
            sx={{
                position: "fixed",
                zIndex: 1,
                height: "100dvh",
                width: `${barSize}px`, // Use dynamic bar size
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
                            width: "350px", // Stripe width
                            height: "100%",
                            top: 0, // Set y position to the top of the screen
                            right: -350, // Set y position to the top of the screen
                            transform: "rotate(65deg)", // Rotate to make the stripe go from bottom left to top right
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
                    // overflow: "hidden auto",
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

                    <UnitStatsListItem
                        barSize={barSize}
                        columnize={shouldColumnize()}
                        unitProperties={unitProperties}
                    />

                    <Box sx={{ flexGrow: 1 }} />

                    <MessageBox gameStarted={gameStarted} />

                    <UpNext />
                </List>
            </Box>
        </Sheet>
    );
}
