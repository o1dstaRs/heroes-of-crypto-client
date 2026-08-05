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
import { images } from "../../generated/image_imports";
import { nextLapHazard } from "../nextLapHazard";
import { IVisibleState } from "../../scenes/VisibleState";
import { hocColors, hocDisplayFontFamily, hocDisplayLetterSpacing } from "../hocTheme";
import { useViewerTeam } from "../context/ViewerTeamContext";
import { meteorIconDataUrl } from "../meteorIcon";
import { TurnTimerBar } from "./TurnTimerBar";
import { stonePlateSx } from "./UnitStatsListItem";
import { useSidebarMetrics } from "./sidebarMetrics";

import { commonTooltipSx } from "./tooltipStyles";

// Exact crop supplied for the new command-panel direction. Only the frame and stone surface remain baked
// into the high-resolution 432x114 plate; START is live HoC Forge text, so the same type system can be used
// for other controls without changing this button's footprint or accessibility semantics.
const START_BUTTON_FRAME = { width: 432, height: 114 };
const START_BUTTON_HEIGHT_FACTOR = 0.9;
const AiOrbToggleImage = ({ active, team }: { active: boolean; team: "green" | "red" }) => {
    // Both states share the exact same bright ring. The inactive state only covers the inner sphere.
    const src = team === "green" ? images.ui_ai_toggle_orb_green_on : images.ui_ai_toggle_orb_red_on;

    return (
        <Box sx={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
            <Box
                component="img"
                src={src}
                alt=""
                draggable={false}
                sx={{ display: "block", width: "100%", height: "100%", objectFit: "fill" }}
            />
            {!active && (
                // Cover only the coloured sphere: the surrounding luminous ring stays identical to ON.
                <Box
                    sx={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        width: "57%",
                        height: "57%",
                        borderRadius: "50%",
                        transform: "translate(-50%, -50%)",
                        background:
                            team === "green"
                                ? "radial-gradient(circle at 48% 44%, #1e221e, #141714 62%, #0b0d0b)"
                                : "radial-gradient(circle at 48% 44%, #211c1a, #171311 62%, #0d0b0a)",
                        boxShadow: "inset 0 2px 6px rgba(0,0,0,.6), 0 1px 3px rgba(0,0,0,.72)",
                    }}
                />
            )}
        </Box>
    );
};

const StartButton = ({ onClick, scale, disabled }: { onClick?: () => void; scale: number; disabled?: boolean }) => {
    const button = (
        <Button
            variant="plain"
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            sx={{
                position: "relative",
                overflow: "hidden",
                p: 0,
                border: 0,
                borderRadius: 0,
                outline: 0,
                backgroundColor: "transparent",
                backgroundImage: `url(${images.ui_start_button_plate_trimmed})`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                backgroundSize: "100% 100%",
                color: "#cda078",
                fontFamily: hocDisplayFontFamily,
                fontSize: `${Math.max(16, Math.round(39 * scale))}px`,
                fontStyle: "normal",
                // HoC Forge ships as one master face; the browser's weight synthesis thickens that same
                // geometry for the primary CTA instead of substituting an unrelated bold font.
                fontWeight: 800,
                fontSynthesis: "weight",
                letterSpacing: hocDisplayLetterSpacing,
                textTransform: "uppercase",
                lineHeight: 1,
                WebkitTextStroke: "0.06em rgba(43,25,15,.96)",
                paintOrder: "stroke fill",
                textShadow: "0 .075em 0 #070504, 0 -.022em 0 rgba(255,222,178,.24), 0 .12em .08em rgba(0,0,0,.82)",
                boxShadow: "none",
                transition: "filter 140ms ease, transform 80ms ease",
                // The old art could overhang the bar unnoticed — its frame was mostly transparent glow, and
                // startButtonScale bottoms out at 0.3 regardless of how narrow the bar gets. A solid button
                // would show that overhang, so the bar's width wins and the art's size is only a ceiling.
                width: "100%",
                maxWidth: `${START_BUTTON_FRAME.width * scale}px`,
                height: "auto",
                // Preserve the reduced width while making only the plate height another 10% slimmer.
                aspectRatio: `${START_BUTTON_FRAME.width} / ${START_BUTTON_FRAME.height * START_BUTTON_HEIGHT_FACTOR}`,
                minHeight: 0,
                margin: "0 auto",
                "&:hover:not(:disabled)": {
                    backgroundColor: "transparent",
                    filter: "brightness(1.09) contrast(1.04) drop-shadow(0 0 7px rgba(224,83,34,.38))",
                    transform: "translateY(-1px) scale(1.012)",
                },
                "&:active": { transform: "translateY(1px)" },
                "&.Mui-disabled": {
                    cursor: "not-allowed",
                    opacity: 1,
                    color: "#c69a72",
                    backgroundColor: "transparent",
                    filter: "brightness(.78) saturate(.82)",
                },
            }}
        >
            Start
        </Button>
    );

    if (!disabled) {
        return button;
    }

    return (
        <Tooltip title="Place units for both teams to start" placement="top" variant="solid" sx={commonTooltipSx}>
            {/* Joy disables pointer events on a disabled Button, which would swallow the tooltip's hover. */}
            <Box sx={{ display: "flex", width: "100%", justifyContent: "center" }}>{button}</Box>
        </Tooltip>
    );
};

export const MessageBox = ({ gameStarted }: { gameStarted: boolean }) => {
    const [visibleState, setVisibleState] = useState<IVisibleState>({} as IVisibleState);
    const [countdown, setCountdown] = useState<number | null>(null);
    const countdownInterval = useRef<NodeJS.Timeout | null>(null);
    const manager = usePixiManager();
    const metrics = useSidebarMetrics();
    const aiToggleSize = Math.max(30, Math.round(42 * metrics.startButtonScale));
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
            <Box
                aria-hidden="true"
                sx={{
                    position: "fixed",
                    inset: 0,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    zIndex: 1,
                    pointerEvents: "none",
                    "@keyframes countdown-enter": {
                        from: { opacity: 0, transform: "translateY(12px) scale(0.96)" },
                        to: { opacity: 1, transform: "translateY(0) scale(1)" },
                    },
                }}
            >
                <Box
                    sx={{
                        position: "relative",
                        width: "clamp(648px, 58.65vw, 843px)",
                        aspectRatio: "1425 / 1104",
                        animation: "countdown-enter 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                        "&::before": {
                            content: '\"\"',
                            position: "absolute",
                            inset: 0,
                            p: "2px",
                            boxSizing: "border-box",
                            borderRadius: "14px",
                            clipPath: "polygon(9% 0, 91% 0, 100% 15%, 100% 85%, 91% 100%, 9% 100%, 0 85%, 0 15%)",
                            background:
                                "linear-gradient(135deg, #38100c 0%, #c64930 24%, #56150f 50%, #ec6a47 76%, #2b0a08 100%)",
                            WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                            WebkitMaskComposite: "xor",
                            maskComposite: "exclude",
                        },
                    }}
                >
                    <Typography
                        sx={{
                            position: "absolute",
                            left: "50%",
                            top: "50.5%",
                            zIndex: 2,
                            transform: "translate(-50%, -50%) scaleX(.86)",
                            color: "transparent",
                            fontSize: "clamp(18.45rem, 26.4vw, 26.1rem)",
                            fontFamily: hocDisplayFontFamily,
                            fontWeight: 400,
                            fontVariantNumeric: "tabular-nums",
                            fontSynthesis: "none",
                            lineHeight: 0.72,
                            letterSpacing: "-0.025em",
                            opacity: 0.65,
                            backgroundImage:
                                "repeating-linear-gradient(135deg, rgba(255,190,170,.11) 0 1px, transparent 1px 7px), linear-gradient(180deg, #ff735c 0%, #d94735 52%, #9d2b23 100%)",
                            backgroundClip: "text",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            WebkitTextStroke: "0.012em rgba(255,105,83,.86)",
                            paintOrder: "stroke fill",
                            filter: "drop-shadow(0 0 .035em rgba(255,69,47,.48))",
                            textShadow: "none",
                        }}
                    >
                        {countdown}
                    </Typography>
                </Box>
            </Box>
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
                    gap: `${Math.max(10, metrics.gapPx)}px`,
                    pt: `${Math.max(12, Math.round(metrics.gapPx * 1.35))}px`,
                    position: "relative",
                    "&::before": {
                        content: '\"\"',
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: "2.25px",
                        background:
                            "linear-gradient(90deg, transparent, rgba(118,56,29,.72) 6%, #bd6537 50%, rgba(118,56,29,.72) 94%, transparent)",
                        boxShadow: "0 2px 8px rgba(211,70,26,.2), 0 -1px 0 rgba(0,0,0,.9)",
                    },
                    "&::after": {
                        content: '\"\"',
                        position: "absolute",
                        top: "-3px",
                        left: "50%",
                        width: "8px",
                        height: "8px",
                        transform: "translateX(-50%) rotate(45deg)",
                        background: "#d06d36",
                        border: "2px solid #1a0e09",
                        boxShadow: "0 0 7px rgba(231,83,32,.46)",
                    },
                }}
            >
                {visibleState.canBeStarted ? (
                    <StartButton onClick={() => manager.StartGame()} scale={metrics.startButtonScale} />
                ) : (
                    <StartButton scale={metrics.startButtonScale} disabled />
                )}
                {/* Sandbox only: hand a side to the AI. The compact AI + green/red icon group stays centred
                    against the Start plate instead of repeating a long team label beside each switch. */}
                {isSandbox && (
                    <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="center"
                        sx={{
                            position: "relative",
                            gap: `${Math.max(7, metrics.gapPx * 0.7)}px`,
                            width: "fit-content",
                            maxWidth: `${START_BUTTON_FRAME.width * metrics.startButtonScale}px`,
                            mx: "auto",
                        }}
                    >
                        <Typography
                            sx={{
                                // Keep the label outside the controls' layout width: the midpoint between
                                // the two equal AI squares must stay exactly on the START plate's centre.
                                position: "absolute",
                                top: "50%",
                                right: `calc(100% + ${Math.max(7, metrics.gapPx * 0.7)}px)`,
                                transform: "translateY(-50%)",
                                color: "#c4b69d",
                                fontFamily: hocDisplayFontFamily,
                                fontSynthesis: "weight",
                                fontWeight: 700,
                                fontSize: `${1.08 * metrics.fontScale}rem`,
                                letterSpacing: hocDisplayLetterSpacing,
                                lineHeight: 1,
                                textShadow: "0 1px 0 #000",
                            }}
                        >
                            AI
                        </Typography>
                        {[
                            {
                                key: "green" as const,
                                color: "success" as const,
                                label: "Green AI",
                                checked: greenAi,
                                team: TeamVals.LOWER,
                            },
                            {
                                key: "red" as const,
                                color: "danger" as const,
                                label: "Red AI",
                                checked: redAi,
                                team: TeamVals.UPPER,
                            },
                        ].map(({ key, color, label, checked, team }) => (
                            <Tooltip key={key} title={label} placement="top" variant="solid" sx={commonTooltipSx}>
                                <Checkbox
                                    aria-label={label}
                                    size="md"
                                    color={color}
                                    variant="outlined"
                                    checked={checked}
                                    uncheckedIcon={<AiOrbToggleImage active={false} team={key} />}
                                    checkedIcon={<AiOrbToggleImage active team={key} />}
                                    onChange={(e) => toggleTeamAi(team, e.target.checked)}
                                    sx={{
                                        flex: "0 0 auto",
                                        isolation: "isolate",
                                        width: `${aiToggleSize}px`,
                                        height: `${aiToggleSize}px`,
                                        minWidth: 0,
                                        p: 0,
                                        "--Checkbox-size": `${aiToggleSize}px`,
                                        "&::before": {
                                            content: '""',
                                            position: "absolute",
                                            zIndex: 0,
                                            inset: "-30.4%",
                                            borderRadius: "50%",
                                            pointerEvents: "none",
                                            opacity: 0,
                                            transform: "scale(.82)",
                                            background: `radial-gradient(circle, ${
                                                key === "green" ? "rgba(48,255,99,.90)" : "rgba(255,55,38,.90)"
                                            } 0%, ${
                                                key === "green" ? "rgba(34,208,76,.59)" : "rgba(232,42,31,.59)"
                                            } 38%, transparent 72%)`,
                                            filter: "blur(2.85px)",
                                            transition: "opacity 140ms ease, transform 140ms ease",
                                        },
                                        "& .MuiCheckbox-checkbox": {
                                            position: "relative",
                                            zIndex: 1,
                                            inset: 0,
                                            width: "100%",
                                            height: "100%",
                                            p: 0,
                                            overflow: "visible",
                                            border: 0,
                                            borderRadius: 0,
                                            background: "transparent",
                                            boxShadow: "none",
                                            transition: "filter 140ms ease, transform 90ms ease",
                                        },
                                        "&:hover .MuiCheckbox-checkbox": {
                                            background: "transparent",
                                            filter: "brightness(1.36)",
                                        },
                                        "&:hover::before": {
                                            opacity: 1,
                                            transform: "scale(1)",
                                        },
                                        "&:active .MuiCheckbox-checkbox": {
                                            transform: "translateY(1px) scale(.98)",
                                        },
                                    }}
                                />
                            </Tooltip>
                        ))}
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

    // Which side the person watching owns. Ranked hands it over directly; the sandbox has no viewer team,
    // but the moment exactly one side is given to the AI the human owns the other, and the panel can talk
    // in the same terms ranked does — "Your turn", and nothing at all while the machine plays.
    //
    // Deliberately left undefined when NOBODY is AI-controlled (one person playing both sides) and when
    // BOTH are (two AIs clashing): in neither case is there a "you", so the heading goes back to naming
    // the team outright. Read off the manager rather than the checkbox state above, because the toolbar's
    // own AI button flips it without this panel hearing about it.
    const aiTeams = [TeamVals.LOWER, TeamVals.UPPER].filter((team) => manager.IsTeamAiControlled(team));
    const sandboxHumanTeam =
        isSandbox && aiTeams.length === 1
            ? aiTeams[0] === TeamVals.LOWER
                ? TeamVals.UPPER
                : TeamVals.LOWER
            : undefined;
    const perspectiveTeam = viewerTeam ?? sandboxHumanTeam;

    const turnTeam = visibleState.teamTypeTurn;
    const isEnemyTurn = perspectiveTeam !== undefined && turnTeam !== undefined && turnTeam !== perspectiveTeam;
    // Whether the human can do anything at all with the clock that is running: the opponent's turn, or any
    // turn an AI is playing for itself. Both mean the additional-time button has nothing to act on.
    const isAiTurn = !!turnTeam && manager.IsTeamAiControlled(turnTeam);
    const cannotAct = isEnemyTurn || isAiTurn;

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
        } else if (perspectiveTeam !== undefined) {
            // Frame the turn from the watcher's side instead of by absolute team colours. On the other
            // side's turn the heading is left EMPTY on purpose — the button below says "Enemy turn" for
            // the whole of it, and printing it twice was the only thing in this card saying the same word
            // to itself. The header row keeps its height either way: the hazard icon beside it sits in a
            // fixed slot.
            messageBoxTitle = visibleState.teamTypeTurn === perspectiveTeam ? "Your turn" : "";
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
                    // Use the exact same inset-stone surface as the stats readout above.
                    background: stonePlateSx.background,
                }}
            >
                {visibleState.hasFinished && (
                    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={0.5}>
                        <Typography level="title-sm">{messageBoxTitle}</Typography>
                        <RefreshRoundedIcon />
                    </Stack>
                )}
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
                        enemyTurn={cannotAct}
                        heading={
                            <Typography
                                level="title-sm"
                                sx={{
                                    // A further 20% increase requested for the active-turn callout.
                                    fontSize: `${1.0368 * metrics.fontScale}rem`,
                                    lineHeight: 1.05,
                                    ...(cannotAct ? {} : { color: hocColors.danger }),
                                }}
                            >
                                {messageBoxTitle}
                            </Typography>
                        }
                        footerIndicator={
                            <Box
                                sx={{
                                    width: 22,
                                    height: 22,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: hocColors.gold,
                                    filter: `drop-shadow(0 0 3px ${hocColors.gold}66)`,
                                    "& svg": { color: "inherit" },
                                }}
                            >
                                {defaultIcon}
                            </Box>
                        }
                        // The slot is always filled, so the card never changes height: the control greys out
                        // when the reserve is unavailable instead of vanishing and reflowing everything below
                        // it. It rides under the groove rather than across the card — it does one thing, to
                        // this clock, and at full width it read as a separate action rather than as the rest
                        // of the timer.
                        footer={
                            <Button
                                onClick={() => manager.RequestTime(visibleState.teamTypeTurn)}
                                onMouseDown={() => manager.RequestTime(visibleState.teamTypeTurn)}
                                size="sm"
                                variant="solid"
                                disabled={cannotAct || !visibleState.canRequestAdditionalTime}
                                sx={{
                                    width: "100%",
                                    minHeight: 0,
                                    py: "1px",
                                    // A hairline in the timer's own gold, dimmer than the groove's 1.5px
                                    // frame so it reads as belonging to the gauge without competing with
                                    // it — the two are the same object, one above the other.
                                    border: `1px solid ${hocColors.gold}80`,
                                    // Keep the narrower plate; make the live label another 15% larger and
                                    // heavier without changing the button's own dimensions.
                                    fontSize: `${0.8556 * metrics.fontScale}rem`,
                                    fontWeight: 800,
                                    transition: "border-color 140ms ease, box-shadow 140ms ease, filter 140ms ease",
                                    // Lights up under the cursor: the hairline goes to full gold and a soft
                                    // glow comes up around it, so the control announces itself as pressable
                                    // on a card where everything else is a readout. Gated on :not(:disabled)
                                    // — on the opponent's clock, or with the reserve spent, it stays inert
                                    // rather than inviting a click that does nothing.
                                    "&:hover:not(:disabled)": {
                                        borderColor: hocColors.gold,
                                        boxShadow: `0 0 10px 1px ${hocColors.gold}59, inset 0 0 9px ${hocColors.gold}33`,
                                        filter: "brightness(1.14)",
                                    },
                                }}
                            >
                                {/* On the other side's clock this stops being an action and becomes the
                                    label for the wait. */}
                                {cannotAct ? "Enemy turn" : "Use additional time"}
                            </Button>
                        }
                    />
                )}
            </Card>
        </>
    );
};
