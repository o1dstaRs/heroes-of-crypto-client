import { HoCConstants, TeamVals } from "@heroesofcrypto/common";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import TimelapseRoundedIcon from "@mui/icons-material/TimelapseRounded";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import Button from "@mui/joy/Button";
import Tooltip from "@mui/joy/Tooltip";
import Card from "@mui/joy/Card";
import LinearProgress from "@mui/joy/LinearProgress";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import Box from "@mui/joy/Box";
import React, { useEffect, useState, useRef } from "react";

import { usePixiManager } from "../../pixi/PixiGameManager";
import { IVisibleState } from "../../state/visible_state";
const meteorSvg = new URL("../../../images/meteor.svg", import.meta.url).toString();
import { images } from "../../generated/image_imports";

// --- Configuration for the Start Button Atlas ---
const START_BUTTON_META = {
    frameWidth: 344,
    frameHeight: 128,
    cols: 5,
    rows: 15,
    frameCount: 73,
    fps: 12,
};

const BUTTON_SCALE = 0.6;

// --- Custom Style for "Heroes" Aesthetic Tooltips ---
const commonTooltipSx = {
    backgroundColor: "#2d1606", // Deep dark brown/wood
    border: "2px solid #dcb158", // Metallic gold/bronze border
    color: "#efe4cc", // Parchment/Cream text for contrast
    borderRadius: "8px",
    boxShadow: "0 6px 12px rgba(0,0,0,0.8)",
    fontSize: "0.85rem",
    fontWeight: 500,
    maxWidth: "280px",
    zIndex: 10000,
};

// 1. Animated Button Component (Ping-Pong Loop)
const AnimatedStartButton = ({ onClick }: { onClick: () => void }) => {
    const [frameIndex, setFrameIndex] = useState(0);
    const requestRef = useRef<number>();
    const previousTimeRef = useRef<number>();
    // Track direction: 1 for forward, -1 for backward
    const directionRef = useRef<number>(1);

    const frameInterval = 1000 / START_BUTTON_META.fps;

    const animate = (time: number) => {
        if (previousTimeRef.current !== undefined) {
            const deltaTime = time - previousTimeRef.current;

            if (deltaTime >= frameInterval) {
                setFrameIndex((prev) => {
                    let next = prev + directionRef.current;

                    // Ping-pong logic: Reverse direction at ends
                    if (next >= START_BUTTON_META.frameCount - 1) {
                        next = START_BUTTON_META.frameCount - 1;
                        directionRef.current = -1;
                    } else if (next <= 0) {
                        next = 0;
                        directionRef.current = 1;
                    }
                    return next;
                });
                // Adjust for drift
                previousTimeRef.current = time - (deltaTime % frameInterval);
            }
        } else {
            previousTimeRef.current = time;
        }
        requestRef.current = requestAnimationFrame(animate);
    };

    useEffect(() => {
        requestRef.current = requestAnimationFrame(animate);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, []);

    const col = frameIndex % START_BUTTON_META.cols;
    const row = Math.floor(frameIndex / START_BUTTON_META.cols);

    const bgPosX = -(col * START_BUTTON_META.frameWidth);
    const bgPosY = -(row * START_BUTTON_META.frameHeight);

    return (
        <Box
            onClick={onClick}
            sx={{
                width: `${START_BUTTON_META.frameWidth * BUTTON_SCALE}px`,
                height: `${START_BUTTON_META.frameHeight * BUTTON_SCALE}px`,
                cursor: "pointer",
                overflow: "hidden",
                margin: "0 auto",
                marginTop: 2,
                transition: "transform 0.1s",
                "&:active": {
                    transform: "scale(0.95)",
                },
                backgroundImage: `url(${images["button_start_atlas"]})`,
                backgroundRepeat: "no-repeat",
                backgroundSize: `${START_BUTTON_META.frameWidth * START_BUTTON_META.cols * BUTTON_SCALE}px ${
                    START_BUTTON_META.frameHeight * START_BUTTON_META.rows * BUTTON_SCALE
                }px`,
                backgroundPosition: `${bgPosX * BUTTON_SCALE}px ${bgPosY * BUTTON_SCALE}px`,
            }}
        />
    );
};

// 2. Disabled Button Component (Static)
const DisabledStartButton = () => {
    return (
        <Tooltip title="Place units for both teams to start" placement="top" variant="solid" sx={commonTooltipSx}>
            <Box
                sx={{
                    width: `${START_BUTTON_META.frameWidth * BUTTON_SCALE}px`,
                    height: `${START_BUTTON_META.frameHeight * BUTTON_SCALE}px`,
                    overflow: "hidden",
                    margin: "0 auto",
                    marginTop: 2,
                    filter: "grayscale(100%) brightness(0.7) opacity(0.6)",
                    cursor: "not-allowed",
                    backgroundImage: `url(${images["button_start_atlas"]})`,
                    backgroundRepeat: "no-repeat",
                    backgroundSize: `${START_BUTTON_META.frameWidth * START_BUTTON_META.cols * BUTTON_SCALE}px ${
                        START_BUTTON_META.frameHeight * START_BUTTON_META.rows * BUTTON_SCALE
                    }px`,
                    backgroundPosition: `0px 0px`,
                }}
            />
        </Tooltip>
    );
};

export const MessageBox = ({ gameStarted }: { gameStarted: boolean }) => {
    const [visibleState, setVisibleState] = useState<IVisibleState>({} as IVisibleState);
    const [countdown, setCountdown] = useState<number | null>(null);
    const countdownInterval = useRef<NodeJS.Timeout | null>(null);
    const manager = usePixiManager();

    useEffect(() => {
        const connection = manager.onVisibleStateUpdated.connect(setVisibleState);
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    // Countdown Logic
    useEffect(() => {
        if (visibleState.secondsRemaining > 0) {
            if (visibleState.secondsRemaining <= 5) {
                setCountdown(Math.ceil(visibleState.secondsRemaining));
                if (countdownInterval.current) {
                    clearInterval(countdownInterval.current);
                }
                countdownInterval.current = setInterval(() => {
                    setCountdown((prevCountdown) => {
                        if (prevCountdown && prevCountdown > 1) {
                            return prevCountdown - 1;
                        }
                        clearInterval(countdownInterval.current!);
                        countdownInterval.current = null;
                        return null;
                    });
                }, 1000);
            } else {
                if (countdownInterval.current) {
                    clearInterval(countdownInterval.current);
                    countdownInterval.current = null;
                }
                setCountdown(null);
            }
        } else {
            if (countdownInterval.current) {
                clearInterval(countdownInterval.current);
                countdownInterval.current = null;
            }
            setCountdown(null);
        }
    }, [visibleState.secondsRemaining]);

    // --- CASE 1: Game NOT Started ---
    if (!gameStarted) {
        return (
            <Box sx={{ width: "100%", display: "flex", justifyContent: "center", pb: 2 }}>
                {visibleState.canBeStarted ? (
                    <AnimatedStartButton onClick={() => manager.StartGame()} />
                ) : (
                    <DisabledStartButton />
                )}
            </Box>
        );
    }

    // --- CASE 2: Game Started ---
    let messageBoxVariant: "plain" | "outlined" | "soft" | "solid" | undefined = "soft";
    let messageBoxColor: "primary" | "neutral" | "danger" | "success" | "warning" | undefined = "neutral";
    let messageBoxTitle = "";
    let messageBoxText = "";
    let messageBoxButtonText = "";
    let messageBoxProgressValue = 0;

    if (visibleState.secondsMax) {
        messageBoxProgressValue = 100 - (visibleState.secondsRemaining / visibleState.secondsMax) * 100;
    }

    if (visibleState.hasFinished) {
        messageBoxColor = "neutral";
        messageBoxTitle = "Fight finished";
        messageBoxText = "Refresh the page to start a new one";
        messageBoxButtonText = "";
    } else {
        if (messageBoxProgressValue <= 45 && !countdown) {
            messageBoxColor = "neutral";
            messageBoxButtonText = "";
        } else if (messageBoxProgressValue <= 80 && !countdown) {
            messageBoxColor = "warning";
            messageBoxButtonText = "";
        } else {
            messageBoxColor = "danger";
            if (visibleState.canRequestAdditionalTime) {
                messageBoxButtonText = "Use additional time";
            }
        }
        messageBoxTitle = `Lap ${visibleState.lapNumber}`;
        if (!visibleState.teamTypeTurn) {
            messageBoxText = "Calculating next turn.";
        } else if (visibleState.teamTypeTurn === TeamVals.LOWER) {
            messageBoxText = "Green team is making a turn";
        } else {
            messageBoxText = "Red team is making a turn";
        }
    }

    const progress = (
        <LinearProgress
            variant="outlined"
            determinate={true}
            value={messageBoxProgressValue}
            sx={{
                my: 1,
                overflow: "hidden",
            }}
        />
    );

    // --- ICON LOGIC ---
    let defaultIcon: React.ReactNode = <TimelapseRoundedIcon />;

    const isNarrowingTurn =
        visibleState.lapNumber !== undefined &&
        visibleState.numberOfLapsTillNarrowing !== undefined &&
        visibleState.lapNumber < visibleState.numberOfLapsTillStopNarrowing &&
        visibleState.lapNumber % visibleState.numberOfLapsTillNarrowing === 0 &&
        visibleState.lapsNarrowed < HoCConstants.MAX_NARROWING_LAPS_TOTAL;

    const isArmageddonTurn =
        visibleState.lapNumber && visibleState.lapNumber >= HoCConstants.NUMBER_OF_LAPS_FIRST_ARMAGEDDON;

    if (isArmageddonTurn) {
        defaultIcon = (
            <Tooltip title="Armageddon wave after this turn." placement="top" sx={{ ...commonTooltipSx, zIndex: 2 }}>
                {/* Wrapped in a Box to separate styling context */}
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <Box component="img" src={meteorSvg} sx={{ width: 26, height: 26 }} />
                </Box>
            </Tooltip>
        );
    } else if (isNarrowingTurn) {
        defaultIcon = (
            <Tooltip
                title="The map will narrow after this turn."
                placement="top"
                sx={{ ...commonTooltipSx, zIndex: 2 }}
            >
                {/* Wrapped in a Box so ZoomInMapIcon doesn't inherit Tooltip's SX */}
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <ZoomInMapIcon style={{ fontSize: "24px", color: "yellow" }} />
                </Box>
            </Tooltip>
        );
    }

    return (
        <>
            {countdown !== null && (
                <div
                    style={{
                        position: "fixed",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: "100vh",
                        height: "100%",
                        backgroundColor: "rgba(255, 0, 0, 0.2)",
                        color: "#fff",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        zIndex: 0,
                        pointerEvents: "none",
                    }}
                >
                    <Typography
                        fontSize="43vw"
                        style={{
                            lineHeight: 1,
                            margin: 0,
                            color: "white",
                            opacity: 0.55,
                        }}
                    >
                        {countdown}
                    </Typography>
                </div>
            )}
            <Card
                invertedColors
                variant={messageBoxVariant}
                color={messageBoxColor}
                size="sm"
                sx={{ boxShadow: "none" }}
            >
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography level="title-sm">{messageBoxTitle}</Typography>
                    {visibleState.hasFinished ? <RefreshRoundedIcon /> : defaultIcon}
                </Stack>
                <Typography level="body-xs">{messageBoxText}</Typography>
                {!visibleState.hasFinished && progress}

                {messageBoxButtonText ? (
                    <Button
                        onClick={() => manager.RequestTime(visibleState.teamTypeTurn)}
                        onMouseDown={() => manager.RequestTime(visibleState.teamTypeTurn)}
                        size="sm"
                        variant="solid"
                    >
                        {messageBoxButtonText}
                    </Button>
                ) : (
                    <span />
                )}
            </Card>
        </>
    );
};
