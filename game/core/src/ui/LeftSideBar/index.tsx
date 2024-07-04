import { TeamType } from "@heroesofcrypto/common";
import CalendarTodayRoundedIcon from "@mui/icons-material/CalendarTodayRounded";
import DiceIcon from "@mui/icons-material/Casino";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import FactoryRoundedIcon from "@mui/icons-material/FactoryRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import TerrainRoundedIcon from "@mui/icons-material/TerrainRounded";
import TimelapseRoundedIcon from "@mui/icons-material/TimelapseRounded";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
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
import { useTheme } from "@mui/joy/styles";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";

import * as packageJson from "../../../package.json";
import { useManager } from "../../manager";
import { IVisibleState } from "../../state/state";
import UnitStatsListItem from "../UnitStatsListItem";
import ColorSchemeToggle from "./ColorSchemeToggle";

interface ICalendarInfoProps {
    day: number;
    week: number;
    daysUntilNextFight: number;
}

const CalendarInfo: React.FC<ICalendarInfoProps> = ({ day, week, daysUntilNextFight }) => (
    <>
        <Divider />
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <CalendarTodayRoundedIcon />
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography level="title-sm">Day {day}</Typography>
                <Typography level="body-xs">Week {week}</Typography>
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography level="title-sm">Next fight in</Typography>
                <Typography level="body-xs">{daysUntilNextFight} days</Typography>
            </Box>
        </Box>
    </>
);

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
            sx={{ my: 1, overflow: "hidden auto" }}
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
        messageBoxText = "Put both teams units into placements. At least one on each side.";
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

    // @ts-ignore: skip styles
    return (
        <Sheet
            className="Sidebar"
            sx={{
                position: "fixed",
                zIndex: 1,
                height: "100dvh",
                width: "220px",
                top: 0,
                left: 0,
                p: 2,
                // flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                borderRight: "1px solid",
                borderColor: "divider",
                overflowY: "auto", // Allow vertical scrolling
                overflowX: "hidden", // Prevent horizontal scrolling
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
                            ml: 0.5, // Add some margin to the left of the icon
                        }}
                    />
                </a>
                <ColorSchemeToggle sx={{ ml: "auto" }} />
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

                        <ListItem sx={{ flexGrow: 1, flexBasis: 0 }}>
                            <ListItemButton>
                                <TerrainRoundedIcon />
                            </ListItemButton>
                        </ListItem>

                        <ListItem sx={{ flexGrow: 1, flexBasis: 0 }}>
                            <ListItemButton>
                                <FactoryRoundedIcon />
                            </ListItemButton>
                        </ListItem>

                        <ListItem sx={{ flexGrow: 1, flexBasis: 0 }}>
                            <ListItemButton selected>
                                <DashboardRoundedIcon />
                                <Box sx={{ marginLeft: 2 }}>
                                    <Typography level="title-sm">Fight</Typography>
                                </Box>
                            </ListItemButton>
                        </ListItem>
                    </Box>

                    <Divider />

                    <UnitStatsListItem />

                    <Box sx={{ flexGrow: 1 }} />

                    <MessageBox gameStarted={gameStarted} />

                    <CalendarInfo day={1} week={1} daysUntilNextFight={2} />
                </List>
            </Box>
        </Sheet>
    );
}
