import { TeamVals, TeamType } from "@heroesofcrypto/common";

import Avatar from "@mui/joy/Avatar";
import Box from "@mui/joy/Box";
import Divider from "@mui/joy/Divider";
import Stack from "@mui/joy/Stack";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useMemo, useState } from "react";

import { images } from "../../generated/image_imports";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { IVisibleState, IVisibleUnit } from "../../scenes/VisibleState";
import { TeamAmountFlag } from "../TeamAmountFlag";
import { resolveUnitImage } from "../unitImage";
import { prefetchUnitAtlas } from "./UnitStatsListItem";

const stopImg = new URL("../../../images/icon_skip_black.webp", import.meta.url).toString();
const hourglassImg = images.hourglass;

const queueItemTransition = {
    type: "spring",
    stiffness: 420,
    damping: 34,
    mass: 0.7,
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

// Copied from UnitStatsListItem.tsx
const StackPowerOverlay: React.FC<{ stackPower: number; teamType: TeamType; isAura: boolean }> = ({
    stackPower,
    teamType,
    isAura,
}) => {
    if (stackPower <= 0) return null;
    const isLower = teamType === TeamVals.LOWER;
    const activeColor = isLower
        ? "rgba(0, 255, 0, 1)"
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

    return (
        <>
            <Divider />
            <Tooltip title="Click ALT to see who is turning next" placement="top" sx={commonTooltipSx}>
                {/* Container Box acts as the trigger, separated from Tooltip styles */}
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
                                                    width: index === 0 ? "84px" : "72px",
                                                    height: index === 0 ? "84px" : "72px",
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
                                                    width: "20px",
                                                    height: "20px",
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
                                                    width: "20px",
                                                    height: "20px",
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
