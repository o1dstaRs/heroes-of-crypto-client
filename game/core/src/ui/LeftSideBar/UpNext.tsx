import { TeamType } from "@heroesofcrypto/common";

import Avatar from "@mui/joy/Avatar";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Tooltip from "@mui/joy/Tooltip";
import { AnimatePresence, motion } from "framer-motion";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { images } from "../../generated/image_imports";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { IVisibleState, IVisibleUnit } from "../../scenes/VisibleState";
import { getTeamFlagBackground, TeamAmountFlag } from "../TeamAmountFlag";
import { useSynchronizedActiveTurnQueuePulse } from "../activeTurnQueuePulse";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { CREATURE_PORTRAIT_ASPECT } from "../creaturePortraitVisual";
import { UNIT_NAME_TO_ID } from "../unit_ui_constants";
import { resolveUnitImage } from "../unitImage";
import { prefetchUnitAtlas } from "./UnitStatsListItem";
import { useSidebarMetrics } from "./sidebarMetrics";

import { commonTooltipSx } from "./tooltipStyles";
const stopImg = new URL("../../../images/stop.webp", import.meta.url).toString();
const hourglassImg = images.hourglass;

const queueItemTransition = {
    type: "spring" as const,
    stiffness: 420,
    damping: 34,
    mass: 0.7,
};

const QUEUE_SCROLLBAR_HEIGHT_PX = 6;

// --- Custom Style for "Heroes" Aesthetic Tooltips ---

// The full-queue overlay is bound to the Alt key (see UpNextOverlay's `event.altKey` handler), but that
// key is labelled Option on Apple keyboards — the hint has to name the key the player can actually see.
const FULL_QUEUE_KEY_LABEL = /mac|iphone|ipad|ipod/i.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
        navigator.platform ??
        navigator.userAgent,
)
    ? "Option (⌥)"
    : "Alt";

// Copied from UnitStatsListItem.tsx
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

export const UpNext: React.FC = () => {
    const [visibleState, setVisibleState] = useState<IVisibleState>({} as IVisibleState);
    const [stableVisibleUnits, setStableVisibleUnits] = useState<IVisibleUnit[]>([]);
    const [queueScroll, setQueueScroll] = useState({ visible: false, progress: 0, thumbFraction: 1 });
    const queueScrollRef = useRef<HTMLDivElement | null>(null);

    const manager = usePixiManager();
    const metrics = useSidebarMetrics();

    useEffect(() => {
        const connection = manager.onVisibleStateUpdated.connect(setVisibleState);
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    const visibleUnits = visibleState.upNext;
    const visibleUnitsSignature = useMemo(
        () =>
            (visibleUnits ?? [])
                .map((unit) =>
                    [
                        unit.id,
                        unit.amount,
                        unit.teamType,
                        unit.stackPower,
                        unit.isStackPowered ? 1 : 0,
                        unit.isSkipping ? 1 : 0,
                        unit.isOnHourglass ? 1 : 0,
                    ].join(":"),
                )
                .join("|"),
        [visibleUnits],
    );
    useEffect(() => {
        const nextVisibleUnits = visibleState.upNext ?? [];
        if (nextVisibleUnits.length > 0) {
            setStableVisibleUnits(nextVisibleUnits);
            return;
        }

        if (visibleState.hasFinished || !visibleState.lapNumber) {
            setStableVisibleUnits([]);
        }
    }, [visibleState.hasFinished, visibleState.lapNumber, visibleUnitsSignature]);

    const displayedUnits = useMemo(() => [...stableVisibleUnits].reverse(), [stableVisibleUnits]);
    // handleNextUnitActivation appends the acting unit before the queue is reversed for display, so the
    // first portrait is always the creature currently taking its turn.
    const activeUnitId = displayedUnits[0]?.id;
    const activeTurnPulseRef = useSynchronizedActiveTurnQueuePulse(activeUnitId);

    // Pre-decode the up-next units' animation atlases during idle time so that selecting any of
    // them later is instant (the decoded image is already cached). requestIdleCallback keeps this
    // off the critical path; setTimeout is the fallback for browsers without it.
    useEffect(() => {
        const names = stableVisibleUnits.map((u) => u.name).filter((n): n is string => !!n);
        if (!names.length) return;
        const schedule =
            (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ??
            ((cb: () => void) => window.setTimeout(cb, 200));
        const handle = schedule(() => {
            for (const n of names) prefetchUnitAtlas(n);
        });
        return () => {
            if ((window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback) {
                (window as unknown as { cancelIdleCallback: (h: number) => void }).cancelIdleCallback(handle as number);
            } else {
                window.clearTimeout(handle as number);
            }
        };
    }, [stableVisibleUnits]);

    const portraitHeight = (width: number) => Math.round(width / CREATURE_PORTRAIT_ASPECT);
    const markerPx = Math.round(Math.max(12, metrics.avatarPx * 0.28));
    // The former current-unit arrow reserved this much room above the portrait. Keep the portrait at the
    // reviewed coordinate after removing that arrow, leaving a stable empty corner zone for the selected
    // replacement treatment instead of pulling the entire queue upward.
    const queuePortraitTopInsetPx = Math.max(20, Math.round(metrics.avatarPx * 0.36));
    // Every queue card now has the same size. Snap the viewport to a whole number of those equal slots so
    // its right edge never exposes a sliced portrait.
    const queueGapPx = Math.round(metrics.gapPx * 0.5);
    // Centre the complete portrait row between the queue's upper divider and the visible lower frame.
    // Move the viewport with the cards so the current-unit corner treatment, amount flags, level pips and
    // overlay scrollbar keep their authored relationship and none is clipped by the old viewport edge.
    const queueVerticalOffsetPx = -Math.round(metrics.gapPx * 1.9);
    const visibleQueueCount = Math.max(
        1,
        Math.floor((metrics.contentWidth + queueGapPx) / (metrics.avatarPx + queueGapPx)),
    );
    const stripWidth = visibleQueueCount * metrics.avatarPx + (visibleQueueCount - 1) * queueGapPx;

    const updateQueueScroll = useCallback(() => {
        const strip = queueScrollRef.current;
        if (!strip) return;
        const maxScroll = Math.max(0, strip.scrollWidth - strip.clientWidth);
        const next = {
            visible: maxScroll > 1,
            progress: maxScroll > 0 ? strip.scrollLeft / maxScroll : 0,
            thumbFraction: strip.scrollWidth > 0 ? Math.min(1, strip.clientWidth / strip.scrollWidth) : 1,
        };
        setQueueScroll((current) =>
            current.visible === next.visible &&
            Math.abs(current.progress - next.progress) < 0.001 &&
            Math.abs(current.thumbFraction - next.thumbFraction) < 0.001
                ? current
                : next,
        );
    }, []);

    useLayoutEffect(() => {
        const strip = queueScrollRef.current;
        if (!strip) return;
        updateQueueScroll();
        const observer = new ResizeObserver(updateQueueScroll);
        observer.observe(strip);
        return () => observer.disconnect();
    }, [displayedUnits.length, stripWidth, updateQueueScroll]);

    const setQueueScrollFromPointer = useCallback(
        (clientX: number, track: HTMLDivElement) => {
            const strip = queueScrollRef.current;
            if (!strip || !queueScroll.visible) return;
            const bounds = track.getBoundingClientRect();
            const thumbWidth = bounds.width * queueScroll.thumbFraction;
            const usableTrack = Math.max(1, bounds.width - thumbWidth);
            const thumbLeft = Math.max(0, Math.min(usableTrack, clientX - bounds.left - thumbWidth / 2));
            strip.scrollLeft = (thumbLeft / usableTrack) * (strip.scrollWidth - strip.clientWidth);
        },
        [queueScroll.thumbFraction, queueScroll.visible],
    );

    return (
        <>
            <Tooltip
                title={`Hold ${FULL_QUEUE_KEY_LABEL} to see the full turn order`}
                placement="top"
                sx={commonTooltipSx}
            >
                {/* Container Box acts as the trigger, separated from Tooltip styles */}
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: `${Math.round(metrics.gapPx * 0.5)}px`,
                        pt: `${Math.round(metrics.gapPx * 0.5)}px`,
                    }}
                >
                    {/* Keep the original fading side rules, but remove the centre plaque and bridge the
                        vacated space with the same bronze hairline. */}
                    <Box
                        aria-hidden="true"
                        sx={{
                            width: "100%",
                            height: "1px",
                            background:
                                "linear-gradient(90deg, transparent 0%, rgba(132,91,52,.58) 28%, rgba(132,91,52,.58) 72%, transparent 100%)",
                        }}
                    />

                    {/* Width is snapped to a whole number of avatars so the strip never shows a sliced one
                        at its right edge — anything that does not fit completely lives behind the scroller. */}
                    <Box
                        sx={{
                            overflow: "visible",
                            position: "relative",
                            width: `${stripWidth}px`,
                            maxWidth: "100%",
                            transform: `translateY(calc(${queueVerticalOffsetPx}px + 3%))`,
                        }}
                    >
                        <Stack
                            ref={queueScrollRef}
                            direction="row"
                            onScroll={updateQueueScroll}
                            onWheel={(event) => {
                                const strip = event.currentTarget;
                                if (strip.scrollWidth <= strip.clientWidth) return;
                                strip.scrollLeft +=
                                    Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
                                event.stopPropagation();
                            }}
                            sx={{
                                gap: `${queueGapPx}px`,
                                overflowX: "auto",
                                flexWrap: "nowrap",
                                pt: `${queuePortraitTopInsetPx}px`,
                                // The strip has always scrolled, but with the scrollbar hidden there was
                                // nothing to tell the player the queue continues past the last avatar. A slim
                                // bronze bar under the row both shows that and gives it a drag handle.
                                pb: `${Math.round(metrics.gapPx * 0.4)}px`,
                                // The actual scrolling element has no native bar, so overflow can never
                                // change its measured height. The draggable replacement below is absolute.
                                scrollbarWidth: "none",
                                "&::-webkit-scrollbar": { display: "none", width: 0, height: 0 },
                            }}
                        >
                            <AnimatePresence initial={false} mode="popLayout">
                                {displayedUnits.map((unit) => (
                                    <motion.div
                                        key={unit.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.82, x: 24 }}
                                        animate={{
                                            opacity: 1,
                                            scale: 1,
                                            x: 0,
                                            y: 0,
                                            rotate: 0,
                                            filter: "brightness(1)",
                                        }}
                                        exit={{
                                            opacity: 0,
                                            scale: 0.72,
                                            x: -28,
                                            y: -14,
                                            rotate: -8,
                                            filter: "brightness(1.55)",
                                        }}
                                        transition={queueItemTransition}
                                        style={{
                                            position: "relative",
                                            flexShrink: 0,
                                            transformOrigin: "50% 50%",
                                            willChange: "transform, opacity, filter",
                                        }}
                                    >
                                        <Box
                                            ref={unit.id === activeUnitId ? activeTurnPulseRef : undefined}
                                            aria-current={unit.id === activeUnitId ? "true" : undefined}
                                            data-active-turn-portrait={unit.id === activeUnitId ? "true" : undefined}
                                            sx={{
                                                position: "relative",
                                                display: "inline-block",
                                                lineHeight: 0,
                                                transformOrigin: "50% 50%",
                                                willChange:
                                                    unit.id === activeUnitId
                                                        ? "transform, opacity, box-shadow"
                                                        : "auto",
                                                zIndex: unit.id === activeUnitId ? 1 : "auto",
                                                outline:
                                                    unit.id === activeUnitId
                                                        ? "1px solid rgba(232, 194, 112, 0.9)"
                                                        : "none",
                                                outlineOffset: "-1px",
                                                boxShadow:
                                                    unit.id === activeUnitId
                                                        ? "inset 0 0 12px rgba(225, 173, 74, 0.28), 0 0 10px rgba(225, 173, 74, 0.48)"
                                                        : "none",
                                            }}
                                        >
                                            {unit.name && UNIT_NAME_TO_ID[unit.name.trim()] !== undefined ? (
                                                <CreaturePortraitImage
                                                    creatureId={UNIT_NAME_TO_ID[unit.name.trim()]}
                                                    alt={unit.name}
                                                    sx={{
                                                        width: `${metrics.avatarPx}px`,
                                                        height: `${portraitHeight(metrics.avatarPx)}px`,
                                                        flexShrink: 0,
                                                        borderRadius: 0,
                                                        transform: "translateZ(0)",
                                                        transition:
                                                            "width 160ms ease-out, height 160ms ease-out, opacity 160ms ease-out",
                                                    }}
                                                />
                                            ) : (
                                                <Avatar
                                                    // @ts-ignore: src params
                                                    src={resolveUnitImage(unit.smallTextureName, unit.name)}
                                                    variant="plain"
                                                    sx={{
                                                        // Sized off the bar so a 1024x768 screen still shows a
                                                        // couple of queued units instead of one clipped avatar.
                                                        width: `${metrics.avatarPx}px`,
                                                        height: `${portraitHeight(metrics.avatarPx)}px`,
                                                        flexShrink: 0,
                                                        borderRadius: 0,
                                                        imageRendering: "auto",
                                                        transform: "translateZ(0)",
                                                        transition:
                                                            "width 160ms ease-out, height 160ms ease-out, opacity 160ms ease-out",
                                                    }}
                                                />
                                            )}
                                            <StackPowerOverlay
                                                stackPower={unit.isStackPowered ? unit.stackPower : 0}
                                                teamType={unit.teamType}
                                                isAura={false}
                                            />
                                            {unit.isSkipping ? (
                                                <img
                                                    src={stopImg}
                                                    alt="Skipping"
                                                    style={{
                                                        position: "absolute",
                                                        top: 0,
                                                        left: 0, // Top Left
                                                        width: `${markerPx}px`,
                                                        height: `${markerPx}px`,
                                                        zIndex: 2,
                                                        transition: "opacity 140ms ease-out",
                                                    }}
                                                />
                                            ) : unit.isOnHourglass ? (
                                                <img
                                                    src={hourglassImg}
                                                    alt="On Hourglass"
                                                    style={{
                                                        position: "absolute",
                                                        top: 0,
                                                        left: 0, // Top Left
                                                        width: `${markerPx}px`,
                                                        height: `${markerPx}px`,
                                                        zIndex: 2,
                                                        transition: "opacity 140ms ease-out",
                                                    }}
                                                />
                                            ) : null}
                                            <TeamAmountFlag
                                                amount={unit.amount}
                                                teamType={unit.teamType}
                                                right="0"
                                                scale={0.85}
                                            />
                                        </Box>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </Stack>
                        {queueScroll.visible && (
                            <Box
                                role="scrollbar"
                                aria-orientation="horizontal"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(queueScroll.progress * 100)}
                                onPointerDown={(event) => {
                                    event.currentTarget.setPointerCapture(event.pointerId);
                                    setQueueScrollFromPointer(event.clientX, event.currentTarget);
                                }}
                                onPointerMove={(event) => {
                                    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                                    setQueueScrollFromPointer(event.clientX, event.currentTarget);
                                }}
                                onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                                sx={{
                                    position: "absolute",
                                    zIndex: 20,
                                    right: 0,
                                    bottom: 0,
                                    left: 0,
                                    height: `${QUEUE_SCROLLBAR_HEIGHT_PX}px`,
                                    borderRadius: `${QUEUE_SCROLLBAR_HEIGHT_PX / 2}px`,
                                    background: "rgba(0,0,0,0.35)",
                                    cursor: "ew-resize",
                                    touchAction: "none",
                                }}
                            >
                                <Box
                                    sx={{
                                        position: "absolute",
                                        top: 0,
                                        bottom: 0,
                                        left: `${queueScroll.progress * (1 - queueScroll.thumbFraction) * 100}%`,
                                        width: `${queueScroll.thumbFraction * 100}%`,
                                        minWidth: "18px",
                                        borderRadius: "inherit",
                                        background: "rgba(202,162,79,0.72)",
                                        boxShadow: "inset 0 0 0 1px rgba(255,220,150,.12)",
                                        pointerEvents: "none",
                                    }}
                                />
                            </Box>
                        )}
                    </Box>
                </Box>
            </Tooltip>
        </>
    );
};
