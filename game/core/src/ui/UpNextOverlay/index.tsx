import React, { useEffect, useState } from "react";
import { HoCConstants, TeamVals, TeamType } from "@heroesofcrypto/common";
import Avatar from "@mui/joy/Avatar";
import Badge from "@mui/joy/Badge";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import { images } from "../../generated/image_imports";
import { IVisibleState, IVisibleUnit } from "../../scenes/VisibleState";
import { usePixiManager } from "../../pixi/PixiGameManager";
import { CasualtyChart, CasualtyPercents } from "../FightStats/CasualtyChart";
const stopImg = new URL("../../../images/icon_skip_black.webp", import.meta.url).toString();
const hourglassImg = new URL("../../../images/hourglass.webp", import.meta.url).toString();
const meteorSvg = new URL("../../../images/meteor.svg", import.meta.url).toString();
import ZoomInMapIcon from "@mui/icons-material/ZoomInMap";
import { Tooltip } from "@mui/joy";

// Copied from UnitStatsListItem.tsx / UpNext.tsx
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

    const maxVisibleUnits = Math.floor(window.innerWidth / 90); // Estimate based on each unit and space

    const fightStats = visibleState.fightStats;
    const lastSample = fightStats?.series?.length ? fightStats.series[fightStats.series.length - 1] : undefined;

    let defaultIcon =
        visibleState.lapNumber !== undefined &&
        visibleState.numberOfLapsTillNarrowing !== undefined &&
        visibleState.lapNumber < visibleState.numberOfLapsTillStopNarrowing &&
        visibleState.lapNumber % visibleState.numberOfLapsTillNarrowing === 0 &&
        visibleState.lapsNarrowed < HoCConstants.MAX_NARROWING_LAPS_TOTAL ? (
            <Tooltip title="The map will narrow after this turn." placement="top" sx={{ zIndex: 9999 }}>
                <ZoomInMapIcon sx={{ color: "white", pb: 2, width: 50, height: 50 }} />
            </Tooltip>
        ) : (
            <React.Fragment />
        );

    if (visibleState.lapNumber && visibleState.lapNumber >= HoCConstants.NUMBER_OF_LAPS_FIRST_ARMAGEDDON) {
        defaultIcon = (
            <Tooltip title="Armageddon wave after this turn." placement="top" sx={{ zIndex: 9999 }}>
                <Box component="img" src={meteorSvg} sx={{ width: 50, height: 50, pb: 2 }} />
            </Tooltip>
        );
    }

    return (
        <Box
            sx={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                backgroundColor: "rgba(0, 0, 0, 0.92)",
                backdropFilter: "blur(2px)",
                padding: 2,
                borderRadius: 2,
                zIndex: 9998, // Increased z-index to ensure it's on top
                overflowX: "auto",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
            }}
        >
            {fightStats && lastSample && (
                <Box
                    sx={{
                        position: "absolute",
                        top: 18,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "min(440px, 82vw)",
                        opacity: 1,
                        pointerEvents: "none",
                    }}
                >
                    <CasualtyPercents
                        lowerKilledPct={lastSample.lowerKilledPct}
                        upperKilledPct={lastSample.upperKilledPct}
                    />
                    <CasualtyChart series={fightStats.series} drawDurationSec={0.5} />
                </Box>
            )}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Typography
                    level="h4"
                    sx={{
                        color: "white",
                        mb: 2,
                        mr: 2,
                    }}
                >
                    Lap {visibleState.lapNumber}
                </Typography>
                {defaultIcon}
            </Box>
            <Stack
                direction="row"
                spacing={1}
                sx={{
                    justifyContent: "center",
                }}
            >
                {[...visibleUnits]
                    .slice(-maxVisibleUnits)
                    .reverse()
                    .map((unit, index) => (
                        <Box key={index} sx={{ position: "relative" }}>
                            <Box sx={{ position: "relative", display: "inline-block" }}>
                                <Avatar
                                    // @ts-ignore: src params
                                    src={images[unit.smallTextureName]}
                                    variant="plain"
                                    sx={{
                                        width: index === 0 ? "86.4px" : "72px",
                                        height: index === 0 ? "86.4px" : "72px",
                                        flexShrink: 0,
                                        borderRadius: "15%",
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
                            <Badge
                                badgeContent={unit.amount.toString()}
                                max={99999}
                                sx={{
                                    position: "absolute",
                                    top: 16,
                                    right: 8,
                                    zIndex: 1,
                                    "& .MuiBadge-badge": {
                                        fontSize: "1rem",
                                        fontWeight: "bold",
                                        height: "26px",
                                        minWidth: "26px",
                                        width: "26px",
                                        borderRadius: "50%",
                                        padding: 0,
                                        color: "black",
                                        backgroundColor: "white",
                                        boxShadow: "0 0 2px 1px rgba(0,0,0,0.3)",
                                    },
                                }}
                            />
                        </Box>
                    ))}
            </Stack>
        </Box>
    );
};
