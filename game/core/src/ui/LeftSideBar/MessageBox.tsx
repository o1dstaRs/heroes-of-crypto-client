import { TeamVals, type TeamType } from "@heroesofcrypto/common";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import TimelapseRoundedIcon from "@mui/icons-material/TimelapseRounded";
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import Button from "@mui/joy/Button";
import Checkbox from "@mui/joy/Checkbox";
import Tooltip from "@mui/joy/Tooltip";
import Card from "@mui/joy/Card";
import LinearProgress from "@mui/joy/LinearProgress";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import Box from "@mui/joy/Box";
import React, { useEffect, useState, useRef } from "react";

import { usePixiManager } from "../../pixi/PixiGameManager";
import { nextLapHazard } from "../nextLapHazard";
import { IVisibleState } from "../../scenes/VisibleState";
import { hocColors } from "../hocTheme";
import { useViewerTeam } from "../context/ViewerTeamContext";
import { images } from "../../generated/image_imports";
import { meteorIconDataUrl } from "../meteorIcon";
import { TurnTimerBar } from "./TurnTimerBar";
import { useSidebarMetrics } from "./sidebarMetrics";

// --- Configuration for the Start Button Atlas ---
const START_BUTTON_META = {
    frameWidth: 344,
    frameHeight: 128,
    cols: 5,
    rows: 15,
    frameCount: 73,
    fps: 12,
};

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
const AnimatedStartButton = ({ onClick, scale }: { onClick: () => void; scale: number }) => {
    const [frameIndex, setFrameIndex] = useState(0);
    const requestRef = useRef<number | undefined>(undefined);
    const previousTimeRef = useRef<number | undefined>(undefined);
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
                width: `${START_BUTTON_META.frameWidth * scale}px`,
                height: `${START_BUTTON_META.frameHeight * scale}px`,
                cursor: "pointer",
                overflow: "hidden",
                margin: "0 auto",
                transition: "transform 0.1s",
                "&:active": {
                    transform: "scale(0.95)",
                },
                backgroundImage: `url(${images["button_start_atlas"]})`,
                backgroundRepeat: "no-repeat",
                backgroundSize: `${START_BUTTON_META.frameWidth * START_BUTTON_META.cols * scale}px ${
                    START_BUTTON_META.frameHeight * START_BUTTON_META.rows * scale
                }px`,
                backgroundPosition: `${bgPosX * scale}px ${bgPosY * scale}px`,
            }}
        />
    );
};

// 2. Disabled Button Component (Static)
const DisabledStartButton = ({ scale }: { scale: number }) => {
    return (
        <Tooltip title="Place units for both teams to start" placement="top" variant="solid" sx={commonTooltipSx}>
            <Box
                sx={{
                    width: `${START_BUTTON_META.frameWidth * scale}px`,
                    height: `${START_BUTTON_META.frameHeight * scale}px`,
                    overflow: "hidden",
                    margin: "0 auto",
                    filter: "grayscale(100%) brightness(0.7) opacity(0.6)",
                    cursor: "not-allowed",
                    backgroundImage: `url(${images["button_start_atlas"]})`,
                    backgroundRepeat: "no-repeat",
                    backgroundSize: `${START_BUTTON_META.frameWidth * START_BUTTON_META.cols * scale}px ${
                        START_BUTTON_META.frameHeight * START_BUTTON_META.rows * scale
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
    const metrics = useSidebarMetrics();
    // Set only in ranked play (the viewer has a fixed side); undefined in sandbox/observer.
    const viewerTeam = useViewerTeam();
    // Sandbox-only "AI side" toggles: hand green (LOWER) / red (UPPER) entirely to the AI. Such a team
    // auto-plays every turn and the human can't act for it. Lets you play vs the AI, or clash two AIs.
    const isSandbox = viewerTeam === undefined;
    const [greenAi, setGreenAi] = useState(false);
    const [redAi, setRedAi] = useState(false);
    useEffect(() => {
        // Reflect any state the scene already holds (e.g. set, then panel re-rendered).
        setGreenAi(manager.IsTeamAiControlled(TeamVals.LOWER));
        setRedAi(manager.IsTeamAiControlled(TeamVals.UPPER));
    }, [manager]);
    const toggleTeamAi = (team: TeamType, checked: boolean) => {
        if (team === TeamVals.LOWER) {
            setGreenAi(checked);
        } else {
            setRedAi(checked);
        }
        manager.SetTeamAiControlled(team, checked);
    };

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

    const hasTimer =
        Number.isFinite(visibleState.secondsMax) && visibleState.secondsMax > 0 && visibleState.secondsRemaining >= 0;
    const timerProgressValue = hasTimer
        ? Math.max(0, Math.min(100, 100 - (visibleState.secondsRemaining / visibleState.secondsMax) * 100))
        : 0;
    const countdownOverlay =
        countdown !== null ? (
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
        ) : null;

    // --- CASE 1: Game NOT Started ---
    if (!gameStarted && !hasTimer) {
        return (
            <Box
                sx={{
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: `${metrics.gapPx}px`,
                }}
            >
                {visibleState.canBeStarted ? (
                    <AnimatedStartButton onClick={() => manager.StartGame()} scale={metrics.startButtonScale} />
                ) : (
                    <DisabledStartButton scale={metrics.startButtonScale} />
                )}
                {/* Sandbox only: hand a side to the AI. That team auto-plays and the human can't act for
                    it (its toolbar/board are locked on its turn). Check both to watch two AIs clash.
                    The pair wraps rather than overflowing once the bar gets narrow. */}
                {isSandbox && (
                    <Stack
                        direction="row"
                        useFlexGap
                        flexWrap="wrap"
                        justifyContent="center"
                        sx={{ gap: `${metrics.gapPx}px`, width: "100%" }}
                    >
                        <Checkbox
                            size="sm"
                            color="success"
                            variant="outlined"
                            label="Green AI"
                            checked={greenAi}
                            onChange={(e) => toggleTeamAi(TeamVals.LOWER, e.target.checked)}
                            sx={{ fontSize: `${0.75 * metrics.fontScale}rem` }}
                        />
                        <Checkbox
                            size="sm"
                            color="danger"
                            variant="outlined"
                            label="Red AI"
                            checked={redAi}
                            onChange={(e) => toggleTeamAi(TeamVals.UPPER, e.target.checked)}
                            sx={{ fontSize: `${0.75 * metrics.fontScale}rem` }}
                        />
                    </Stack>
                )}
            </Box>
        );
    }

    if (!gameStarted) {
        const remainingSeconds = Math.max(0, Math.ceil(visibleState.secondsRemaining));
        return (
            <>
                {countdownOverlay}
                <Card
                    invertedColors
                    variant="soft"
                    color={countdown ? "danger" : timerProgressValue > 80 ? "warning" : "neutral"}
                    size="sm"
                    sx={{ boxShadow: "none", p: `${metrics.gapPx}px`, gap: `${Math.round(metrics.gapPx * 0.5)}px` }}
                >
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography level="title-sm" sx={{ fontSize: `${0.78 * metrics.fontScale}rem` }}>
                            Placement
                        </Typography>
                        <TimelapseRoundedIcon />
                    </Stack>
                    <Typography level="body-xs" sx={{ fontSize: `${0.7 * metrics.fontScale}rem` }}>
                        {remainingSeconds > 0 ? `${remainingSeconds}s until auto-start` : "Starting fight."}
                    </Typography>
                    <LinearProgress
                        variant="outlined"
                        determinate
                        value={timerProgressValue}
                        sx={{
                            my: 1,
                            overflow: "hidden",
                        }}
                    />
                </Card>
            </>
        );
    }

    // --- CASE 2: Game Started ---
    let messageBoxVariant: "plain" | "outlined" | "soft" | "solid" | undefined = "soft";
    let messageBoxColor: "primary" | "neutral" | "danger" | "success" | "warning" | undefined = "neutral";
    let messageBoxTitle = "";
    let messageBoxText = "";
    let messageBoxProgressValue = 0;

    messageBoxProgressValue = timerProgressValue;

    if (visibleState.hasFinished) {
        messageBoxColor = "neutral";
        messageBoxTitle = "Fight finished";
        messageBoxText = "Refresh the page to start a new one";
    } else {
        // The additional-time button is rendered unconditionally below (disabled when the reserve is
        // spent), so nothing here decides whether it exists — only the panel's colour tracks the clock.
        if (messageBoxProgressValue <= 45 && !countdown) {
            messageBoxColor = "neutral";
        } else if (messageBoxProgressValue <= 80 && !countdown) {
            messageBoxColor = "warning";
        } else {
            messageBoxColor = "danger";
        }
        // The lap now lives in the timer medallion, so the heading carries whose turn it is.
        if (!visibleState.teamTypeTurn) {
            messageBoxTitle = "Calculating next turn";
        } else if (viewerTeam !== undefined) {
            // Ranked: frame the turn from the viewer's perspective instead of absolute colors.
            messageBoxTitle = visibleState.teamTypeTurn === viewerTeam ? "Your turn" : "Enemy turn";
        } else if (visibleState.teamTypeTurn === TeamVals.LOWER) {
            messageBoxTitle = "Green team's turn";
        } else {
            messageBoxTitle = "Red team's turn";
        }
        messageBoxText = "";
    }

    // --- ICON LOGIC ---
    let defaultIcon: React.ReactNode = <TimelapseRoundedIcon />;

    // Shared with the bottom-centre NextLapHazardBadge and the UpNextOverlay icon, so all three warnings
    // agree on what is coming (and armageddon outranks narrowing the same way in each).
    const hazard = nextLapHazard(visibleState);
    const isNarrowingTurn = hazard?.kind === "narrowing";
    const isArmageddonTurn = hazard?.kind === "armageddon";

    if (isArmageddonTurn) {
        defaultIcon = (
            <Tooltip title="Armageddon wave after this turn." placement="top" sx={{ ...commonTooltipSx, zIndex: 2 }}>
                {/* Wrapped in a Box to separate styling context */}
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <Box component="img" src={meteorIconDataUrl} sx={{ width: 26, height: 26 }} />
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

    // Ranked: it's the opponent's turn when the active team is set and isn't ours.
    const isEnemyTurn =
        viewerTeam !== undefined && visibleState.teamTypeTurn !== undefined && visibleState.teamTypeTurn !== viewerTeam;

    return (
        <>
            {countdownOverlay}
            <Card
                invertedColors
                variant={messageBoxVariant}
                color={messageBoxColor}
                size="sm"
                // Trimmed down deliberately: this card and the queue are pinned to the bottom, so every
                // pixel it gives back goes to the unit card above it.
                sx={{
                    boxShadow: "none",
                    p: `${Math.round(metrics.gapPx * 0.6)}px`,
                    gap: `${Math.round(metrics.gapPx * 0.35)}px`,
                }}
            >
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={0.5}>
                    <Typography
                        level="title-sm"
                        sx={{
                            fontSize: `${0.72 * metrics.fontScale}rem`,
                            lineHeight: 1.15,
                            ...(isEnemyTurn ? { color: hocColors.danger } : {}),
                        }}
                    >
                        {messageBoxTitle}
                    </Typography>
                    {/* Fixed slot: the hazard icons (narrowing / armageddon) swap in at different intrinsic
                        sizes, and without this the header row grew and nudged the timer. */}
                    <Box
                        sx={{
                            flex: "none",
                            width: 22,
                            height: 22,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        {visibleState.hasFinished ? <RefreshRoundedIcon /> : defaultIcon}
                    </Box>
                </Stack>
                {messageBoxText && (
                    <Typography level="body-xs" sx={{ fontSize: `${0.7 * metrics.fontScale}rem` }}>
                        {messageBoxText}
                    </Typography>
                )}
                {!visibleState.hasFinished && (
                    <TurnTimerBar
                        lapNumber={visibleState.lapNumber}
                        secondsRemaining={visibleState.secondsRemaining}
                        secondsMax={visibleState.secondsMax}
                        enemyTurn={isEnemyTurn}
                    />
                )}

                {/* The slot is always rendered, so the card never changes height: the button greys out when
                    the reserve is unavailable instead of vanishing and reflowing everything below it. */}
                {!visibleState.hasFinished && (
                    <Button
                        onClick={() => manager.RequestTime(visibleState.teamTypeTurn)}
                        onMouseDown={() => manager.RequestTime(visibleState.teamTypeTurn)}
                        size="sm"
                        variant="solid"
                        disabled={!visibleState.canRequestAdditionalTime}
                        sx={{ minHeight: 0, py: "2px", fontSize: `${0.68 * metrics.fontScale}rem` }}
                    >
                        Use additional time
                    </Button>
                )}
            </Card>
        </>
    );
};
