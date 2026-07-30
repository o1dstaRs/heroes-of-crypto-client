import { TeamVals, TeamType } from "@heroesofcrypto/common";

import Avatar from "@mui/joy/Avatar";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Tooltip from "@mui/joy/Tooltip";
import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useMemo, useState } from "react";

import { images } from "../../generated/image_imports";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { IVisibleState, IVisibleUnit } from "../../scenes/VisibleState";
import { TeamAmountFlag } from "../TeamAmountFlag";
import { resolveUnitImage } from "../unitImage";
import { prefetchUnitAtlas, SectionTitle } from "./UnitStatsListItem";
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
    const isLower = teamType === TeamVals.LOWER;
    const activeColor = isLower
        ? "rgba(0, 210, 0, 1)"
        : teamType === TeamVals.UPPER
          ? "rgba(255, 0, 0, 1)"
          : "rgba(255, 255, 255, 0.85)";
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
                        backgroundColor: i < stackPower ? activeColor : emptyColor,
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

    const leadAvatar = Math.round(metrics.avatarPx * 1.16);
    const markerPx = Math.round(Math.max(12, metrics.avatarPx * 0.28));
    // How many avatars fit end to end without the last one being sliced: the first slot is the enlarged
    // lead, every following slot is a normal avatar plus the gap before it.
    const queueGapPx = Math.round(metrics.gapPx * 0.5);
    const visibleQueueCount = Math.max(
        1,
        1 + Math.floor((metrics.contentWidth - leadAvatar) / (metrics.avatarPx + queueGapPx)),
    );
    const stripWidth = leadAvatar + (visibleQueueCount - 1) * (metrics.avatarPx + queueGapPx);

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
                    <SectionTitle title="Up next" metrics={metrics} />

                    {/* Width is snapped to a whole number of avatars so the strip never shows a sliced one
                        at its right edge — anything that does not fit completely lives behind the scroller. */}
                    <Box sx={{ overflow: "hidden", width: `${stripWidth}px`, maxWidth: "100%" }}>
                        <Stack
                            direction="row"
                            sx={{
                                gap: `${queueGapPx}px`,
                                overflowX: "auto",
                                flexWrap: "nowrap",
                                // The strip has always scrolled, but with the scrollbar hidden there was
                                // nothing to tell the player the queue continues past the last avatar. A slim
                                // bronze bar under the row both shows that and gives it a drag handle.
                                pb: `${Math.round(metrics.gapPx * 0.4)}px`,
                                "&::-webkit-scrollbar": { height: "6px" },
                                "&::-webkit-scrollbar-track": {
                                    background: "rgba(0,0,0,0.35)",
                                    borderRadius: "3px",
                                },
                                "&::-webkit-scrollbar-thumb": {
                                    background: "rgba(202,162,79,0.65)",
                                    borderRadius: "3px",
                                    "&:hover": { background: "rgba(202,162,79,0.9)" },
                                },
                                scrollbarWidth: "thin",
                                scrollbarColor: "rgba(202,162,79,0.65) rgba(0,0,0,0.35)",
                            }}
                        >
                            <AnimatePresence initial={false} mode="popLayout">
                                {displayedUnits.map((unit, index) => (
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
                                        <Box sx={{ position: "relative", display: "inline-block" }}>
                                            <Avatar
                                                // @ts-ignore: src params
                                                src={resolveUnitImage(unit.smallTextureName, unit.name)}
                                                variant="plain"
                                                sx={{
                                                    // Sized off the bar so a 1024x768 screen still shows a
                                                    // couple of queued units instead of one clipped avatar.
                                                    width: `${index === 0 ? leadAvatar : metrics.avatarPx}px`,
                                                    height: `${index === 0 ? leadAvatar : metrics.avatarPx}px`,
                                                    flexShrink: 0,
                                                    borderRadius: "15%",
                                                    imageRendering: "auto",
                                                    transform: "translateZ(0)",
                                                    transition:
                                                        "width 160ms ease-out, height 160ms ease-out, opacity 160ms ease-out",
                                                }}
                                            />
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
                                        <TeamAmountFlag amount={unit.amount} teamType={unit.teamType} />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </Stack>
                    </Box>
                </Box>
            </Tooltip>
        </>
    );
};
