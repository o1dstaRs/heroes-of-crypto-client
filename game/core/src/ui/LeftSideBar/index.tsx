import CalendarTodayRoundedIcon from "@mui/icons-material/CalendarTodayRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import FactoryRoundedIcon from "@mui/icons-material/FactoryRounded";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import TerrainRoundedIcon from "@mui/icons-material/TerrainRounded";
import TimelapseRoundedIcon from "@mui/icons-material/TimelapseRounded";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Card from "@mui/joy/Card";
import Divider from "@mui/joy/Divider";
import GlobalStyles from "@mui/joy/GlobalStyles";
import LinearProgress from "@mui/joy/LinearProgress";
import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton, { listItemButtonClasses } from "@mui/joy/ListItemButton";
import ListItemContent from "@mui/joy/ListItemContent";
import Sheet from "@mui/joy/Sheet";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";

import { useManager } from "../../manager";
import { IVisibleState } from "../../state/state";
import { TeamType } from "../../units/units_stats";
import UnitStatsListItem from "../UnitStatsListItem";
import ColorSchemeToggle from "./ColorSchemeToggle";
import * as pack from "../../../package.json";

export default function LeftSideBar({ started = false }: { started: boolean }) {
    const [visibleState, setVisibleState] = useState<IVisibleState>({} as IVisibleState);

    const manager = useManager();
    useEffect(() => {
        const connection3 = manager.onVisibleStateUpdated.connect(setVisibleState);
        return () => {
            connection3.disconnect();
        };
    }, [manager]);

    let messageBoxVariant: "plain" | "outlined" | "soft" | "solid" | undefined;
    let messageBoxColor: "primary" | "neutral" | "danger" | "success" | "warning" | undefined;
    let messageBoxTitle;
    let messageBoxText;
    let messageBoxButtonText;
    let requestAdditionalTimeButtonRendered = false;
    let progressBar: React.JSX.Element;
    let progressValue = started ? 0 : 80;
    if (visibleState.secondsMax) {
        progressValue = 100 - (visibleState.secondsRemaining / visibleState.secondsMax) * 100;
    }
    const progress = <LinearProgress variant="outlined" determinate={started} value={progressValue} sx={{ my: 1 }} />;
    const defaultIcon =
        visibleState.lapNumber &&
        visibleState.lapNumber < visibleState.numberOfLapsTillStopNarrowing &&
        !(visibleState.lapNumber % visibleState.numberOfLapsTillNarrowing) ? (
            <ZoomInMapIcon />
        ) : (
            <TimelapseRoundedIcon />
        );

    if (started) {
        messageBoxVariant = "soft";
        if (visibleState.hasFinished) {
            messageBoxColor = "neutral";
            messageBoxTitle = "Fight finished";
            messageBoxText = "Refresh the page to start a new one";
            messageBoxButtonText = "";
            progressBar = <span />;
        } else {
            if (progressValue <= 45) {
                messageBoxColor = "success";
                messageBoxButtonText = "";
            } else if (progressValue <= 70) {
                messageBoxColor = "warning";
                messageBoxButtonText = "";
            } else {
                messageBoxColor = "danger";
                if (visibleState.canRequestAdditionalTime) {
                    messageBoxButtonText = "Use additional time";
                    requestAdditionalTimeButtonRendered = true;
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
            progressBar = progress;
        }
    } else {
        progressBar = progress;
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

    // @ts-ignore: skip styles
    return (
        <Sheet
            className="Sidebar"
            sx={{
                position: {
                    xs: "fixed",
                    md: "sticky",
                },
                transform: {
                    xs: "translateX(calc(100% * (var(--SideNavigation-slideIn, 0) - 1)))",
                    md: "none",
                },
                transition: "transform 0.4s, width 0.4s",
                zIndex: 10000,
                height: "100dvh",
                width: "var(--Sidebar-width)",
                top: 0,
                p: 2,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                borderRight: "1px solid",
                borderColor: "divider",
            }}
        >
            <GlobalStyles
                styles={(theme) => ({
                    ":root": {
                        "--Sidebar-width": "220px",
                        [theme.breakpoints.up("lg")]: {
                            "--Sidebar-width": "240px",
                        },
                    },
                })}
            />
            <Box
                className="Sidebar-overlay"
                sx={{
                    position: "fixed",
                    zIndex: 9998,
                    top: 0,
                    left: 0,
                    width: "100vw",
                    height: "100vh",
                    opacity: "var(--SideNavigation-slideIn)",
                    backgroundColor: "var(--joy-palette-background-backdrop)",
                    transition: "opacity 0.4s",
                    transform: {
                        xs: "translateX(calc(100% * (var(--SideNavigation-slideIn, 0) - 1) + var(--SideNavigation-slideIn, 0) * var(--Sidebar-width, 0px)))",
                        lg: "translateX(-100%)",
                    },
                }}
                //        onClick={() => closeSidebar()}
                onClick={() => {}}
            />
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <Typography level="title-lg">v{pack.version}</Typography>
                <ColorSchemeToggle sx={{ ml: "auto" }} />
            </Box>
            <Box
                sx={{
                    minHeight: 0,
                    overflow: "hidden auto",
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    [`& .${listItemButtonClasses.root}`]: {
                        gap: 1.5,
                    },
                }}
            >
                <List
                    size="sm"
                    sx={{
                        gap: 1,
                        "--List-nestedInsetStart": "30px",
                        "--ListItem-radius": (theme) => theme.vars.radius.sm,
                    }}
                >
                    <ListItem>
                        <ListItemButton>
                            <TerrainRoundedIcon />
                            <ListItemContent>
                                <Typography level="title-sm">Terrain</Typography>
                            </ListItemContent>
                        </ListItemButton>
                    </ListItem>

                    <ListItem>
                        <ListItemButton>
                            <FactoryRoundedIcon />
                            <ListItemContent>
                                <Typography level="title-sm">Town</Typography>
                            </ListItemContent>
                        </ListItemButton>
                    </ListItem>

                    <ListItem>
                        <ListItemButton selected>
                            <DashboardRoundedIcon />
                            <ListItemContent>
                                <Typography level="title-sm">Fight</Typography>
                            </ListItemContent>
                        </ListItemButton>
                    </ListItem>

                    <Divider />

                    <UnitStatsListItem />
                </List>

                <List
                    size="sm"
                    sx={{
                        mt: "auto",
                        flexGrow: 0,
                        "--ListItem-radius": (theme) => theme.vars.radius.sm,
                        "--List-gap": "8px",
                        mb: 2,
                    }}
                />

                <Card
                    invertedColors
                    variant={messageBoxVariant}
                    color={messageBoxColor}
                    size="sm"
                    sx={{ boxShadow: "none" }}
                >
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography level="title-sm">{messageBoxTitle}</Typography>
                        {/* eslint-disable-next-line no-nested-ternary */}
                        {started ? (
                            visibleState.hasFinished ? (
                                <RefreshRoundedIcon />
                            ) : (
                                defaultIcon
                            )
                        ) : (
                            <InfoRoundedIcon />
                        )}
                    </Stack>
                    <Typography level="body-xs">{messageBoxText}</Typography>
                    {progressBar}

                    {messageBoxButtonText ? (
                        <Button
                            onClick={() =>
                                requestAdditionalTimeButtonRendered
                                    ? manager.RequestTime(visibleState.teamTypeTurn)
                                    : manager.StartGame()
                            }
                            onMouseDown={() =>
                                requestAdditionalTimeButtonRendered
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
            </Box>
            <Divider />
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <CalendarTodayRoundedIcon />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography level="title-sm">Day 1</Typography>
                    <Typography level="body-xs">Week 1</Typography>
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography level="title-sm">Next fight in</Typography>
                    <Typography level="body-xs">2 days</Typography>
                </Box>
            </Box>
        </Sheet>
    );
}
