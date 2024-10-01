import { TeamType } from "@heroesofcrypto/common";
import DiceIcon from "@mui/icons-material/Casino";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import FactoryRoundedIcon from "@mui/icons-material/FactoryRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import TerrainRoundedIcon from "@mui/icons-material/TerrainRounded";
import Avatar from "@mui/joy/Avatar";
import Badge from "@mui/joy/Badge";
import Box from "@mui/joy/Box";
import Divider from "@mui/joy/Divider";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import Sheet from "@mui/joy/Sheet";
import Stack from "@mui/joy/Stack";
import { useTheme, useColorScheme } from "@mui/joy/styles";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";

import * as packageJson from "../../../package.json";
import { images } from "../../generated/image_imports";
import { useManager } from "../../manager";
import { IVisibleState, IVisibleUnit } from "../../state/visible_state";
import { EDGES_SIZE } from "../../statics";
import ColorSchemeToggle from "./ColorSchemeToggle";
import { MessageBox } from "./MessageBox";
import { UnitStatsListItem } from "./UnitStatsListItem";

const UpNext: React.FC = () => {
    const [visibleState, setVisibleState] = useState<IVisibleState>({} as IVisibleState);
    const theme = useTheme();

    const manager = useManager();

    useEffect(() => {
        const connection = manager.onVisibleStateUpdated.connect(setVisibleState);
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    const visibleUnits: IVisibleUnit[] = visibleState.upNext ?? [];
    const boxShadow =
        theme.palette.mode === "dark"
            ? "-100px 15px 15px 50px rgba(0, 0, 0, 0.3)"
            : "-100px 15px 15px 50px rgba(255, 255, 255, 0.3)";

    return (
        <>
            <Divider />
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, minHeight: 80 }}>
                <Typography level="title-md">Up next</Typography>

                <Box sx={{ overflow: "hidden" }}>
                    <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                            overflowX: "auto",
                            flexWrap: "nowrap",
                            "&::-webkit-scrollbar": { display: "none" },
                            scrollbarWidth: "none",
                        }}
                    >
                        {visibleUnits.length > 0 &&
                            visibleUnits.map((unit, index) => (
                                <Box key={index} sx={{ position: "relative" }}>
                                    <Avatar
                                        // @ts-ignore: src params
                                        src={images[unit.smallTextureName]}
                                        variant="plain"
                                        sx={{
                                            transform: "rotateX(-180deg)",
                                            width: index === visibleUnits.length - 1 ? "84px" : "72px",
                                            height: index === visibleUnits.length - 1 ? "84px" : "72px",
                                            flexShrink: 0,
                                            boxShadow: index === visibleUnits.length - 1 ? boxShadow : "none",
                                        }}
                                    />
                                    <Badge
                                        badgeContent={unit.amount.toString()}
                                        // @ts-ignore: style params
                                        color="#ff0000"
                                        sx={{
                                            position: "absolute",
                                            bottom: index === visibleUnits.length - 1 ? 12 : 18,
                                            right: index === visibleUnits.length - 1 ? 21 : 16,
                                            zIndex: 1,
                                            "& .MuiBadge-badge": {
                                                fontSize: "0.9rem",
                                                height: "22px",
                                                minWidth: "22px",
                                                color: "white",
                                                backgroundColor:
                                                    unit.teamType === TeamType.UPPER
                                                        ? `rgba(244, 67, 54, ${
                                                              index === visibleUnits.length - 1 ? 1 : 0.6
                                                          })`
                                                        : `rgba(76, 175, 80, ${
                                                              index === visibleUnits.length - 1 ? 1 : 0.6
                                                          })`,
                                            },
                                        }}
                                    />
                                </Box>
                            ))}
                    </Stack>
                </Box>
            </Box>
        </>
    );
};

export default function LeftSideBar({ gameStarted }: { gameStarted: boolean }) {
    const [badgeVisible, setBadgeVisible] = useState(false);
    const [barSize, setBarSize] = useState(280); // Initialize bar size state
    const [buttonsVisible] = useState({
        prediction: false,
        terrain: false,
        factory: false,
        dashboard: false,
    });
    const { setMode } = useColorScheme();
    const theme = useTheme();

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

    // Set the default mode to dark before rendering
    useEffect(() => {
        setMode("dark"); // Set dark mode by default
    }, [setMode]);

    // Adjust bar size on window resize
    useEffect(() => {
        window.addEventListener("resize", adjustBarSize);
        adjustBarSize(); // Initial call to set the size based on the initial window dimensions

        return () => window.removeEventListener("resize", adjustBarSize);
    }, [gameStarted]);

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
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <a
                    href="https://heroesofcrypto.io/patches"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", textDecoration: "none", color: "inherit" }}
                >
                    <Typography level="title-lg">v{packageJson.version}</Typography>
                    <OpenInNewRoundedIcon
                        sx={{
                            color: theme.palette.mode === "dark" ? "white" : "black",
                            fontSize: 16,
                            ml: 0.5,
                        }}
                    />
                </a>
                <ColorSchemeToggle sx={{ ml: "auto" }} defaultMode="dark" />
            </Box>
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

                    <Divider />

                    <UnitStatsListItem barSize={barSize} />

                    <Box sx={{ flexGrow: 1 }} />

                    <MessageBox gameStarted={gameStarted} />

                    <UpNext />
                </List>
            </Box>
        </Sheet>
    );
}
