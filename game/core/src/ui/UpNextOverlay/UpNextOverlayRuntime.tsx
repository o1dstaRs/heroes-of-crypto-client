import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TeamType } from "@heroesofcrypto/common";
import Avatar from "@mui/joy/Avatar";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import { IVisibleState, IVisibleUnit } from "../../scenes/VisibleState";
import { unitsOverlayTopBandLayout } from "../../scenes/UnitsOverlay";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { UNIT_NAME_TO_ID } from "../unit_ui_constants";
import { resolveUnitImage } from "../unitImage";
import { getTeamFlagBackground, TeamAmountFlag } from "../TeamAmountFlag";
import { ACTIVE_TURN_QUEUE_PULSE_MAX_SCALE, useSynchronizedActiveTurnQueuePulse } from "../activeTurnQueuePulse";
import { upNextWideSmokyChainsBackgroundSurface } from "../upNextBackground";
import {
    ACTIVE_TURN_GLOW_MARGIN_PX,
    type IQueueScrollState,
    queueScrollState,
    upNextQueueCardWidth,
    upNextQueueFit,
} from "./upNextQueueLayout";
import { hocColors, hocDisplayFontFamily } from "../hocTheme";
import { AltExitStrip } from "../exitRules/AltExitStrip";
import type { IExitStanding } from "../exitRules/exitRulesModel";
const stopImg = new URL("../../../images/stop.webp", import.meta.url).toString();
const hourglassImg = new URL("../../../images/hourglass.webp", import.meta.url).toString();

// The regular top band stops 4.5% of the fitted artwork band above the painted battlefield seam.
// Extending its 95%-high rectangle by this ratio lands the Option panel exactly on that seam.
const OPTION_PANEL_BOTTOM_EXTENSION = 0.045 / 0.95;
const OPTION_PANEL_BOTTOM_TRIM = 0.002;

// Copied from UnitStatsListItem.tsx / UpNext.tsx
const StackPowerOverlay: React.FC<{ stackPower: number; teamType: TeamType; isAura: boolean }> = ({
    stackPower,
    teamType,
    isAura,
}) => {
    if (stackPower <= 0) return null;
    const activeBackground = getTeamFlagBackground(teamType);
    const emptyColor = "rgba(34, 34, 34, 0.7)";

    return (
        <Box
            sx={{
                position: "absolute",
                bottom: "5%",
                left: "50%",
                transform: "translateX(-50%)",
                width: isAura ? "70%" : "85%", // Narrower for circles to stay inside curves
                height: "12%",
                minHeight: "4px",
                display: "flex",
                flexDirection: "row",
                gap: "2%",
                zIndex: 10,
                pointerEvents: "none",
            }}
        >
            {Array.from({ length: 5 }).map((_, i) => (
                <Box
                    key={`pip_${i}`}
                    sx={{
                        flex: 1,
                        background: i < stackPower ? activeBackground : emptyColor,
                        borderRadius: "2px",
                        border: `1px solid rgba(0, 0, 0, 0.8)`,
                        boxSizing: "border-box",
                    }}
                />
            ))}
        </Box>
    );
};

/**
 * The queue's own scrollbar, drawn rather than borrowed.
 *
 * It exists only while the queue really scrolls, sits on the band under the cards, and is always visible —
 * which the native bar is not on macOS, where it is an overlay that fades out while idle.
 */
const QueueScrollBar: React.FC<{ state: IQueueScrollState }> = ({ state }) => (
    <Box
        aria-hidden="true"
        sx={{
            position: "relative",
            zIndex: 1,
            mt: "6px",
            width: "100%",
            height: "6px",
            // The band is a column flex container that can run out of room; without this the track is the
            // item that shrinks, and a 0px-tall scrollbar is the same as no scrollbar at all.
            flexShrink: 0,
            borderRadius: "3px",
            background: "rgba(19, 12, 8, 0.72)",
            boxShadow: "inset 0 0 2px rgba(0, 0, 0, 0.9)",
            overflow: "hidden",
        }}
    >
        <Box
            sx={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${state.offset * 100}%`,
                width: `${Math.max(8, state.thumb * 100)}%`,
                borderRadius: "3px",
                background: "linear-gradient(90deg, rgba(112, 76, 29, 0.92), rgba(190, 144, 66, 0.92))",
                border: "1px solid rgba(218, 174, 91, 0.45)",
                boxSizing: "border-box",
            }}
        />
    </Box>
);

/** `exitStanding`: a seated player's exit rules reading, shown under the queue (board casualties, leave outcome). */
export const UpNextOverlay: React.FC<{ exitStanding?: IExitStanding }> = ({ exitStanding }) => {
    const [visibleState, setVisibleState] = useState<IVisibleState>({} as IVisibleState);
    const [altPressed, setAltPressed] = useState<boolean>(false);

    const manager = usePixiManager();

    useEffect(() => {
        const connection = manager.onVisibleStateUpdated.connect(setVisibleState);
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.altKey) {
                setAltPressed(true);
            }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (!event.altKey) {
                setAltPressed(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    const visibleUnits: IVisibleUnit[] = visibleState.upNext ?? [];
    const displayedUnits = [...visibleUnits].reverse();
    const activeUnitId = displayedUnits[0]?.id;
    const overlayVisible = altPressed && visibleState.lapNumber > 0;
    const activeTurnPulseRef = useSynchronizedActiveTurnQueuePulse(activeUnitId, overlayVisible);

    const topBand = unitsOverlayTopBandLayout(window.innerWidth, window.innerHeight);
    // Keep the approved portrait aspect, but use the whole available band when the queue is short. Once
    // fitting every portrait would make them too small to read, keep a comfortable card size and let the
    // complete queue scroll instead. This also means a scrollbar exists only when it is genuinely useful.
    const availableRowWidth = Math.max(60, topBand.width - 32);
    const optionPanelHeight = Math.min(
        window.innerHeight - topBand.y,
        topBand.height * (1 + OPTION_PANEL_BOTTOM_EXTENSION - OPTION_PANEL_BOTTOM_TRIM),
    );
    const maxPortraitHeight = Math.max(60, Math.floor((optionPanelHeight - 86) / ACTIVE_TURN_QUEUE_PULSE_MAX_SCALE));
    const minimumReadableHeight = Math.min(maxPortraitHeight, 156);
    // Sized against the row's real width, borders and active-card glow included — see upNextQueueLayout.
    const { portraitHeight, needsScroll } = upNextQueueFit(
        displayedUnits.length,
        availableRowWidth,
        maxPortraitHeight,
        minimumReadableHeight,
    );
    const cardWidth = upNextQueueCardWidth(portraitHeight);
    const cardHeight = portraitHeight + 2;
    const activeCardMaxWidth = Math.ceil(cardWidth * ACTIVE_TURN_QUEUE_PULSE_MAX_SCALE);
    const activeCardMaxHeight = Math.ceil(cardHeight * ACTIVE_TURN_QUEUE_PULSE_MAX_SCALE);
    const activeCardSlotWidth = activeCardMaxWidth + ACTIVE_TURN_GLOW_MARGIN_PX * 2;
    const activeCardSlotHeight = activeCardMaxHeight + ACTIVE_TURN_GLOW_MARGIN_PX * 2;

    // How much of the queue is on screen, and where — the numbers the drawn bar needs. Null while the
    // whole queue fits, which is also when no bar is drawn at all. Re-measured whenever the row's box or
    // its cards change size, because the portraits settle a frame after the queue itself does.
    const scrollRowRef = useRef<HTMLDivElement | null>(null);
    const [queueScroll, setQueueScroll] = useState<IQueueScrollState | null>(null);
    const handleQueueScroll = useCallback(() => setQueueScroll(queueScrollState(scrollRowRef.current)), []);
    useLayoutEffect(() => {
        handleQueueScroll();
        const row = scrollRowRef.current;
        if (!overlayVisible || !row) {
            return undefined;
        }
        window.addEventListener("resize", handleQueueScroll);
        const observer = new ResizeObserver(handleQueueScroll);
        observer.observe(row);
        for (const card of Array.from(row.children)) {
            observer.observe(card);
        }
        return () => {
            window.removeEventListener("resize", handleQueueScroll);
            observer.disconnect();
        };
    }, [handleQueueScroll, overlayVisible, displayedUnits.length, portraitHeight, needsScroll]);

    if (!overlayVisible) return null;

    return (
        <Box
            sx={{
                position: "fixed",
                top: topBand.y,
                left: topBand.x,
                width: topBand.width,
                height: optionPanelHeight,
                padding: 2,
                boxSizing: "border-box",
                zIndex: 9998, // Increased z-index to ensure it's on top
                overflow: "visible",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                backdropFilter: "brightness(0.72)",
                WebkitBackdropFilter: "brightness(0.72)",
                boxShadow: "inset 0 -24px 34px rgba(0, 0, 0, 0.22)",
                ...upNextWideSmokyChainsBackgroundSurface,
            }}
        >
            <Box
                sx={{
                    position: "relative",
                    zIndex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <Typography
                    level="h4"
                    sx={{
                        mb: 2,
                        fontFamily: hocDisplayFontFamily,
                        fontSize: "1.35rem",
                        fontWeight: 570,
                        fontSynthesis: "weight",
                        WebkitTextStroke: "0.0114em currentColor",
                        paintOrder: "stroke fill",
                        letterSpacing: "0.13em",
                        textTransform: "uppercase",
                        color: hocColors.gold,
                        textShadow: "0 2px 4px rgba(0, 0, 0, 0.95)",
                    }}
                >
                    LAP {visibleState.lapNumber}
                </Typography>
            </Box>
            <Stack
                direction="row"
                spacing={1}
                sx={{
                    position: "relative",
                    zIndex: 1,
                    alignItems: "center",
                    justifyContent: needsScroll ? "flex-start" : "center",
                    width: needsScroll ? "100%" : "auto",
                    maxWidth: needsScroll ? "100%" : "none",
                    overflowX: needsScroll ? "auto" : "visible",
                    overflowY: needsScroll ? "hidden" : "visible",
                    flexShrink: 0,
                    // The queue draws its OWN bar (QueueScrollBar, below) and hides the native one. A
                    // styled ::-webkit-scrollbar is an OVERLAY on macOS: it claims no layout space and
                    // fades out while idle, so it was invisible in exactly the moment it had something to
                    // say — the queue ran past the band's edge and nothing showed that it continued
                    // (owner report 2026-09-19). Measured in headless Chromium: a 6px ::-webkit-scrollbar
                    // and a `scrollbar-width: thin` both reserve 0px there.
                    scrollbarWidth: "none",
                    "&::-webkit-scrollbar": { display: "none" },
                }}
                ref={scrollRowRef}
                onScroll={handleQueueScroll}
            >
                {displayedUnits.map((unit) => {
                    const isActiveTurn = unit.id === activeUnitId;

                    return (
                        <Box
                            key={unit.id}
                            sx={{
                                position: "relative",
                                width: `${isActiveTurn ? activeCardSlotWidth : cardWidth}px`,
                                height: `${isActiveTurn ? activeCardSlotHeight : cardHeight}px`,
                                flex: "0 0 auto",
                                lineHeight: 0,
                                zIndex: isActiveTurn ? 2 : 1,
                            }}
                        >
                            <Box
                                sx={{
                                    position: "absolute",
                                    top: isActiveTurn
                                        ? `${ACTIVE_TURN_GLOW_MARGIN_PX + (activeCardMaxHeight - cardHeight) / 2}px`
                                        : 0,
                                    left: "50%",
                                    width: `${cardWidth}px`,
                                    height: `${cardHeight}px`,
                                    transform: "translateX(-50%)",
                                }}
                            >
                                <Box
                                    ref={isActiveTurn ? activeTurnPulseRef : undefined}
                                    aria-current={isActiveTurn ? "true" : undefined}
                                    data-active-turn-portrait={isActiveTurn ? "true" : undefined}
                                    sx={{
                                        position: "relative",
                                        width: "100%",
                                        height: "100%",
                                        transformOrigin: "50% 50%",
                                        willChange: isActiveTurn ? "transform, opacity, box-shadow" : "auto",
                                        border: "1px solid transparent",
                                        borderRadius: "3px",
                                        boxSizing: "border-box",
                                        boxShadow: isActiveTurn
                                            ? "none"
                                            : "0 5px 14px rgba(0, 0, 0, 0.9), inset 0 0 0 1px rgba(0, 0, 0, 0.82)",
                                    }}
                                >
                                    <Box sx={{ position: "absolute", inset: 0 }}>
                                        {unit.name && UNIT_NAME_TO_ID[unit.name.trim()] !== undefined ? (
                                            <CreaturePortraitImage
                                                creatureId={UNIT_NAME_TO_ID[unit.name.trim()]}
                                                alt={unit.name}
                                                sx={{
                                                    width: "100%",
                                                    height: "100%",
                                                    flexShrink: 0,
                                                    borderRadius: "2px",
                                                }}
                                            />
                                        ) : (
                                            <Avatar
                                                // @ts-ignore: src params
                                                src={resolveUnitImage(unit.smallTextureName, unit.name)}
                                                variant="plain"
                                                sx={{
                                                    width: "100%",
                                                    height: "100%",
                                                    flexShrink: 0,
                                                    borderRadius: "2px",
                                                }}
                                            />
                                        )}
                                        <StackPowerOverlay
                                            stackPower={unit.isStackPowered ? unit.stackPower : 0}
                                            teamType={unit.teamType}
                                            isAura={false}
                                        />
                                    </Box>
                                    {unit.isSkipping ? (
                                        <img
                                            src={stopImg}
                                            alt="Skipping"
                                            style={{
                                                position: "absolute",
                                                top: 0,
                                                left: 0,
                                                width: "20px",
                                                height: "20px",
                                                zIndex: 2,
                                            }}
                                        />
                                    ) : unit.isOnHourglass ? (
                                        <img
                                            src={hourglassImg}
                                            alt="On Hourglass"
                                            style={{
                                                position: "absolute",
                                                top: 0,
                                                left: 0,
                                                width: "20px",
                                                height: "20px",
                                                zIndex: 2,
                                            }}
                                        />
                                    ) : null}
                                    <TeamAmountFlag amount={unit.amount} teamType={unit.teamType} />
                                </Box>
                            </Box>
                        </Box>
                    );
                })}
            </Stack>
            {needsScroll && queueScroll && <QueueScrollBar state={queueScroll} />}
            {exitStanding && <AltExitStrip standing={exitStanding} />}
        </Box>
    );
};
