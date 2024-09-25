import { TeamType } from "@heroesofcrypto/common";
import DiceIcon from "@mui/icons-material/Casino";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import FactoryRoundedIcon from "@mui/icons-material/FactoryRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import TerrainRoundedIcon from "@mui/icons-material/TerrainRounded";
import TimelapseRoundedIcon from "@mui/icons-material/TimelapseRounded";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import Avatar from "@mui/joy/Avatar";
import Badge from "@mui/joy/Badge";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Card from "@mui/joy/Card";
import Divider from "@mui/joy/Divider";
import LinearProgress from "@mui/joy/LinearProgress";
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
import { BAR_SIZE_PIXELS_STR } from "../../statics";
import { UnitStatsListItem } from "../UnitStatsListItem";
import ColorSchemeToggle from "./ColorSchemeToggle";

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

const MessageBox = ({ gameStarted }: { gameStarted: boolean }) => {
    const [visibleState, setVisibleState] = useState<IVisibleState>({} as IVisibleState);

    const manager = useManager();

    useEffect(() => {
        const connection = manager.onVisibleStateUpdated.connect(setVisibleState);
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    let messageBoxVariant: "plain" | "outlined" | "soft" | "solid" | undefined;
    let messageBoxColor: "primary" | "neutral" | "danger" | "success" | "warning" | undefined;
    let messageBoxTitle;
    let messageBoxText;
    let messageBoxButtonText;
    let messageBoxRequestAdditionalTimeButtonRendered = false;
    let messageBoxProgressBar: React.JSX.Element;
    let messageBoxProgressValue = gameStarted ? 0 : 80;
    if (visibleState.secondsMax) {
        messageBoxProgressValue = 100 - (visibleState.secondsRemaining / visibleState.secondsMax) * 100;
    }
    const progress = (
        <LinearProgress
            variant="outlined"
            determinate={gameStarted}
            value={messageBoxProgressValue}
            sx={{ my: 1, overflow: "hidden" }}
        />
    );
    const defaultIcon =
        visibleState.lapNumber &&
        visibleState.lapNumber < visibleState.numberOfLapsTillStopNarrowing &&
        !(visibleState.lapNumber % visibleState.numberOfLapsTillNarrowing) ? (
            <ZoomInMapIcon />
        ) : (
            <TimelapseRoundedIcon />
        );

    if (gameStarted) {
        messageBoxVariant = "soft";
        if (visibleState.hasFinished) {
            messageBoxColor = "neutral";
            messageBoxTitle = "Fight finished";
            messageBoxText = "Refresh the page to start a new one";
            messageBoxButtonText = "";
            messageBoxProgressBar = <span />;
        } else {
            if (messageBoxProgressValue <= 45) {
                messageBoxColor = "success";
                messageBoxButtonText = "";
            } else if (messageBoxProgressValue <= 70) {
                messageBoxColor = "warning";
                messageBoxButtonText = "";
            } else {
                messageBoxColor = "danger";
                if (visibleState.canRequestAdditionalTime) {
                    messageBoxButtonText = "Use additional time";
                    messageBoxRequestAdditionalTimeButtonRendered = true;
                }
            }
            messageBoxTitle = `Lap ${visibleState.lapNumber}`;
            if (!visibleState.teamTypeTurn) {
                messageBoxText = "Calculating next turn.";
            } else if (visibleState.teamTypeTurn === TeamType.LOWER) {
                messageBoxText = "Green team is making a turn";
            } else {
                messageBoxText = "Red team is making a turn";
            }
            messageBoxProgressBar = progress;
        }
    } else {
        messageBoxProgressBar = progress;
        messageBoxVariant = "solid";
        messageBoxColor = "primary";
        messageBoxTitle = "To start";
        messageBoxText =
            "Place the units from both teams on the board. Make sure to have at least one unit on both the top and bottom sides.";
        if (visibleState.canBeStarted) {
            messageBoxButtonText = "Start";
        } else {
            messageBoxButtonText = "";
        }
    }

    return (
        <Card invertedColors variant={messageBoxVariant} color={messageBoxColor} size="sm" sx={{ boxShadow: "none" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography level="title-sm">{messageBoxTitle}</Typography>
                {(() => {
                    if (gameStarted) {
                        if (visibleState.hasFinished) {
                            return <RefreshRoundedIcon />;
                        }
                        return defaultIcon;
                    }
                    return <InfoRoundedIcon />;
                })()}
            </Stack>
            <Typography level="body-xs">{messageBoxText}</Typography>
            {messageBoxProgressBar}

            {messageBoxButtonText ? (
                <Button
                    onClick={() =>
                        messageBoxRequestAdditionalTimeButtonRendered
                            ? manager.RequestTime(visibleState.teamTypeTurn)
                            : manager.StartGame()
                    }
                    onMouseDown={() =>
                        messageBoxRequestAdditionalTimeButtonRendered
                            ? manager.RequestTime(visibleState.teamTypeTurn)
                            : manager.StartGame()
                    }
                    size="sm"
                    variant="solid"
                >
                    {messageBoxButtonText}
                </Button>
            ) : (
                <span />
            )}
        </Card>
    );
};

export default function LeftSideBar({ gameStarted }: { gameStarted: boolean }) {
    const [badgeVisible, setBadgeVisible] = useState(false);
    const [buttonsVisible] = useState({
        prediction: false,
        terrain: false,
        factory: false,
        dashboard: false,
    });
    const { setMode } = useColorScheme();
    const theme = useTheme();

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

    // @ts-ignore: skip styles
    return (
        <Sheet
            className="Sidebar"
            sx={{
                position: "fixed",
                zIndex: 1,
                height: "100dvh",
                width: BAR_SIZE_PIXELS_STR,
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

                    <UnitStatsListItem />

                    <Box sx={{ flexGrow: 1 }} />

                    <MessageBox gameStarted={gameStarted} />

                    <UpNext />
                </List>
            </Box>
        </Sheet>
    );
}
