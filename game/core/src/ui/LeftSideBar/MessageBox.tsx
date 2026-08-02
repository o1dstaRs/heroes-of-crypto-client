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
import { hocColors, hocStartButtonSx } from "../hocTheme";
import { useViewerTeam } from "../context/ViewerTeamContext";
import { meteorIconDataUrl } from "../meteorIcon";
import { TurnTimerBar } from "./TurnTimerBar";
import { useSidebarMetrics } from "./sidebarMetrics";

import { commonTooltipSx } from "./tooltipStyles";

// The start button used to be a 73-frame sprite atlas ping-ponging at 12fps, with the word START painted
// into the artwork. It is now drawn in CSS and labelled in the app's own typeface, like every other action
// button in the bar. The frame size the atlas used is kept as the button's footprint so sidebarMetrics'
// startButtonScale (which divides the available width by exactly this) still lands on the same size.
const START_BUTTON_FRAME = { width: 344, height: 128 };

const StartButton = ({ onClick, scale, disabled }: { onClick?: () => void; scale: number; disabled?: boolean }) => {
    const button = (
        <Button
            variant="plain"
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            sx={{
                ...hocStartButtonSx,
                // The old art could overhang the bar unnoticed — its frame was mostly transparent glow, and
                // startButtonScale bottoms out at 0.3 regardless of how narrow the bar gets. A solid button
                // would show that overhang, so the bar's width wins and the art's size is only a ceiling.
                width: "100%",
                maxWidth: `${START_BUTTON_FRAME.width * scale}px`,
                // Two thirds of the old art's height: the atlas frame was mostly glow around the word.
                height: `${START_BUTTON_FRAME.height * scale * 0.66}px`,
                minHeight: 0,
                margin: "0 auto",
                fontSize: `${Math.max(0.72, 1.5 * scale)}rem`,
                letterSpacing: "0.16em",
                ...(disabled ? { cursor: "not-allowed" } : {}),
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
                    background:
                        "radial-gradient(circle at center, rgba(65, 8, 8, 0.08) 0%, rgba(28, 4, 4, 0.2) 50%, rgba(10, 2, 2, 0.48) 100%)",
                    backdropFilter: "saturate(0.78)",
                    zIndex: 1,
                    pointerEvents: "none",
                    "@keyframes countdown-enter": {
                        from: { opacity: 0, transform: "scale(1.1)" },
                        to: { opacity: 1, transform: "scale(1)" },
                    },
                    "@keyframes countdown-ring": {
                        "0%, 100%": { boxShadow: "0 0 34px rgba(255, 74, 58, 0.2)" },
                        "50%": { boxShadow: "0 0 58px rgba(255, 74, 58, 0.38)" },
                    },
                }}
            >
                <Box
                    sx={{
                        position: "relative",
                        width: "clamp(150px, 18vw, 230px)",
                        aspectRatio: "1",
                        borderRadius: "50%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "1px solid rgba(255, 184, 153, 0.5)",
                        background:
                            "radial-gradient(circle at 42% 35%, rgba(111, 24, 20, 0.82), rgba(31, 6, 7, 0.94) 72%)",
                        boxShadow:
                            "inset 0 0 0 7px rgba(255, 255, 255, 0.025), inset 0 0 42px rgba(255, 83, 64, 0.13), 0 0 34px rgba(255, 74, 58, 0.2), 0 18px 55px rgba(0, 0, 0, 0.48)",
                        animation:
                            "countdown-enter 220ms cubic-bezier(0.2, 0.8, 0.2, 1), countdown-ring 1s ease-in-out infinite",
                        "&::before": {
                            content: '\"\"',
                            position: "absolute",
                            inset: 9,
                            borderRadius: "50%",
                            border: "1px solid rgba(255, 212, 174, 0.18)",
                        },
                    }}
                >
                    <Typography
                        level="body-xs"
                        sx={{
                            color: "rgba(255, 220, 198, 0.72)",
                            fontSize: "clamp(0.58rem, 0.75vw, 0.72rem)",
                            fontWeight: 700,
                            letterSpacing: "0.32em",
                            lineHeight: 1,
                            ml: "0.32em",
                            mb: 0.5,
                        }}
                    >
                        TIME
                    </Typography>
                    <Typography
                        sx={{
                            color: "#fff7f2",
                            fontSize: "clamp(4.6rem, 9vw, 7.5rem)",
                            fontWeight: 300,
                            fontVariantNumeric: "tabular-nums",
                            lineHeight: 0.88,
                            letterSpacing: "-0.06em",
                            textShadow: "0 2px 18px rgba(255, 86, 64, 0.34)",
                            mr: "0.06em",
                        }}
                    >
                        {countdown}
                    </Typography>
                    <Typography
                        level="body-xs"
                        sx={{
                            color: "rgba(255, 220, 198, 0.52)",
                            fontSize: "clamp(0.52rem, 0.65vw, 0.65rem)",
                            letterSpacing: "0.16em",
                            lineHeight: 1,
                            mt: 1,
                        }}
                    >
                        SECONDS LEFT
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
                    gap: `${metrics.gapPx}px`,
                }}
            >
                {visibleState.canBeStarted ? (
                    <StartButton onClick={() => manager.StartGame()} scale={metrics.startButtonScale} />
                ) : (
                    <StartButton scale={metrics.startButtonScale} disabled />
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
                        sx={{
                            gap: `${metrics.gapPx}px`,
                            width: "100%",
                            // Bounded by the Start button above and centred on it. Spanning the whole bar
                            // instead put the pair WIDER than the button, and on a bar narrower than its
                            // own content the row overflowed symmetrically — the green box ran off the
                            // panel's left edge. Same expression the button caps itself with, so the two
                            // stay aligned at every bar width.
                            maxWidth: `${START_BUTTON_FRAME.width * metrics.startButtonScale}px`,
                            mx: "auto",
                        }}
                    >
                        {[
                            {
                                key: "green",
                                color: "success" as const,
                                label: "Green AI",
                                checked: greenAi,
                                team: TeamVals.LOWER,
                            },
                            {
                                key: "red",
                                color: "danger" as const,
                                label: "Red AI",
                                checked: redAi,
                                team: TeamVals.UPPER,
                            },
                        ].map(({ key, color, label, checked, team }) => (
                            <Checkbox
                                key={key}
                                size="md"
                                color={color}
                                variant="outlined"
                                label={label}
                                checked={checked}
                                onChange={(e) => toggleTeamAi(team, e.target.checked)}
                                sx={{
                                    // They used to sit as two small labels huddled in the middle of the bar
                                    // with the width around them unused. Each now claims half the button's
                                    // width above, so the whole half is a click target rather than just the
                                    // box and its word. The 45% basis (not 50%) leaves the gap its room
                                    // before flex-wrap would kick in; minWidth lets a very narrow bar shrink
                                    // them past their label instead of bursting the row.
                                    flex: "1 1 45%",
                                    minWidth: 0,
                                    justifyContent: "center",
                                    // Joy gives the label `flex: 1 1 0%`, so it stretched to fill the
                                    // control: the box sat hard against the left of its half and the text
                                    // ran left-aligned inside a much wider label, leaving dead space to its
                                    // right. The pair read as shoved left under a centred button even
                                    // though the row itself was exactly the button's width.
                                    //
                                    // `0 1 auto` sizes the label to its text so justifyContent can centre
                                    // box and text together. All three parts matter: flex-grow 0 is the fix
                                    // itself, the `auto` basis is what makes the label its text's width
                                    // (leaving Joy's 0% basis collapses it to nothing), and flex-shrink 1
                                    // keeps the text wrapping instead of overflowing on a very narrow bar.
                                    "& .MuiCheckbox-label": { flex: "0 1 auto" },
                                    fontSize: `${0.85 * metrics.fontScale}rem`,
                                }}
                            />
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
                    // Joy's soft variant paints a flat neutral grey — rgb(23, 23, 23), opaque, and cold
                    // against the hide behind it. A dark BROWN wash instead, mostly opaque so the card still
                    // reads as a panel rather than a stain: over the bar's rgb(25, 13, 9) this lands on
                    // about rgb(15, 10, 6) — a clear step below the hide around it, so the card sits IN the
                    // bar rather than floating on it. The pigment keeps the hide's hue: dropping to neutral
                    // black at this depth reads as a hole cut in the leather.
                    backgroundColor: "rgba(11, 9, 5, 0.7)",
                }}
            >
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={0.5}>
                    <Typography
                        level="title-sm"
                        sx={{
                            fontSize: `${0.72 * metrics.fontScale}rem`,
                            lineHeight: 1.15,
                            // Red marks a turn YOU can act on, matching the timer fill under it — the side
                            // that has something to do is the side that gets the loud colour.
                            ...(cannotAct ? {} : { color: hocColors.danger }),
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
                        enemyTurn={cannotAct}
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
                                    fontSize: `${0.62 * metrics.fontScale}rem`,
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
