import React, { useEffect, useState } from "react";
import { TeamVals, TeamType } from "@heroesofcrypto/common";
import Avatar from "@mui/joy/Avatar";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import { IVisibleState, IVisibleUnit } from "../../scenes/VisibleState";
import { unitsOverlayTopBandLayout } from "../../scenes/UnitsOverlay";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { CreaturePortraitImage } from "../CreaturePortraitImage";
import { CREATURE_PORTRAIT_ASPECT } from "../creaturePortraitVisual";
import { UNIT_NAME_TO_ID } from "../unit_ui_constants";
import { resolveUnitImage } from "../unitImage";
import { TeamAmountFlag } from "../TeamAmountFlag";
import { upNextWideSmokyChainsBackgroundSurface } from "../upNextBackground";
const stopImg = new URL("../../../images/stop.webp", import.meta.url).toString();
const hourglassImg = new URL("../../../images/hourglass.webp", import.meta.url).toString();

// Copied from UnitStatsListItem.tsx / UpNext.tsx
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

export const UpNextOverlay: React.FC = () => {
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

    if (!altPressed || visibleState.lapNumber <= 0) return null;

    const topBand = unitsOverlayTopBandLayout(window.innerWidth, window.innerHeight);
    // Keep the approved portrait aspect, but use the whole available band when the queue is short. Once
    // fitting every portrait would make them too small to read, keep a comfortable card size and let the
    // complete queue scroll instead. This also means a scrollbar exists only when it is genuinely useful.
    const portraitGap = 8;
    const displayedUnits = [...visibleUnits].reverse();
    const availableRowWidth = Math.max(60, topBand.width - 32);
    const maxPortraitHeight = Math.max(60, Math.floor(topBand.height - 86));
    const fittedPortraitWidth = displayedUnits.length
        ? Math.floor((availableRowWidth - portraitGap * Math.max(0, displayedUnits.length - 1)) / displayedUnits.length)
        : Math.round(maxPortraitHeight * CREATURE_PORTRAIT_ASPECT);
    const fittedPortraitHeight = Math.floor(fittedPortraitWidth / CREATURE_PORTRAIT_ASPECT);
    const minimumReadableHeight = Math.min(maxPortraitHeight, 156);
    const needsScroll = displayedUnits.length > 0 && fittedPortraitHeight < minimumReadableHeight;
    const portraitHeight = needsScroll
        ? Math.min(maxPortraitHeight, 256)
        : Math.max(60, Math.min(maxPortraitHeight, fittedPortraitHeight));
    const portraitWidth = Math.round(portraitHeight * CREATURE_PORTRAIT_ASPECT);

    return (
        <Box
            sx={{
                position: "fixed",
                top: topBand.y,
                left: topBand.x,
                width: topBand.width,
                height: topBand.height,
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
                        color: "white",
                        mb: 2,
                        textShadow: "0 2px 4px rgba(0, 0, 0, 0.95)",
                    }}
                >
                    Lap {visibleState.lapNumber}
                </Typography>
            </Box>
            <Stack
                direction="row"
                spacing={1}
                sx={{
                    position: "relative",
                    zIndex: 1,
                    justifyContent: needsScroll ? "flex-start" : "center",
                    width: needsScroll ? "100%" : "auto",
                    maxWidth: "100%",
                    overflowX: needsScroll ? "auto" : "hidden",
                    overflowY: "hidden",
                    flexShrink: 0,
                    scrollbarWidth: needsScroll ? "thin" : "none",
                    scrollbarColor: needsScroll
                        ? "rgba(177, 132, 57, 0.82) rgba(19, 12, 8, 0.72)"
                        : "transparent transparent",
                    "&::-webkit-scrollbar": {
                        height: needsScroll ? "6px" : 0,
                        display: needsScroll ? "block" : "none",
                    },
                    "&::-webkit-scrollbar-track": {
                        background: "rgba(19, 12, 8, 0.72)",
                        borderRadius: "3px",
                        boxShadow: "inset 0 0 2px rgba(0, 0, 0, 0.9)",
                    },
                    "&::-webkit-scrollbar-thumb": {
                        background: "linear-gradient(90deg, rgba(112, 76, 29, 0.92), rgba(190, 144, 66, 0.92))",
                        border: "1px solid rgba(218, 174, 91, 0.45)",
                        borderRadius: "3px",
                    },
                    "&::-webkit-scrollbar-thumb:hover": {
                        background: "linear-gradient(90deg, rgba(137, 94, 35, 0.96), rgba(212, 166, 78, 0.96))",
                    },
                }}
            >
                {displayedUnits.map((unit, index) => (
                    <Box key={index} sx={{ position: "relative" }}>
                        <Box sx={{ position: "relative", display: "inline-block" }}>
                            {unit.name && UNIT_NAME_TO_ID[unit.name.trim()] !== undefined ? (
                                <CreaturePortraitImage
                                    creatureId={UNIT_NAME_TO_ID[unit.name.trim()]}
                                    alt={unit.name}
                                    sx={{
                                        width: `${portraitWidth}px`,
                                        height: `${portraitHeight}px`,
                                        flexShrink: 0,
                                        borderRadius: "3px",
                                        border: "1px solid rgba(180, 142, 74, 0.82)",
                                        boxShadow: "0 5px 14px rgba(0, 0, 0, 0.9), inset 0 0 0 1px rgba(0, 0, 0, 0.82)",
                                    }}
                                />
                            ) : (
                                <Avatar
                                    // @ts-ignore: src params
                                    src={resolveUnitImage(unit.smallTextureName, unit.name)}
                                    variant="plain"
                                    sx={{
                                        width: `${portraitWidth}px`,
                                        height: `${portraitHeight}px`,
                                        flexShrink: 0,
                                        borderRadius: "3px",
                                        border: "1px solid rgba(180, 142, 74, 0.82)",
                                        boxShadow: "0 5px 14px rgba(0, 0, 0, 0.9), inset 0 0 0 1px rgba(0, 0, 0, 0.82)",
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
                ))}
            </Stack>
        </Box>
    );
};
