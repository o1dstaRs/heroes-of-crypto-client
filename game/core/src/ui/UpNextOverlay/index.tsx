import React, { useEffect, useState } from "react";
import { TeamType } from "@heroesofcrypto/common";
import Avatar from "@mui/joy/Avatar";
import Badge from "@mui/joy/Badge";
import Box from "@mui/joy/Box";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import { images } from "../../generated/image_imports";
import { IVisibleState, IVisibleUnit } from "../../state/visible_state";
import { useManager } from "../../manager";
import stopImg from "../../../images/stop.webp";
import hourglassImg from "../../../images/hourglass.webp";

export const UpNextOverlay: React.FC = () => {
    const [visibleState, setVisibleState] = useState<IVisibleState>({} as IVisibleState);
    const [altPressed, setAltPressed] = useState<boolean>(false);

    const manager = useManager();

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

    return (
        <Box
            sx={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                backgroundColor: "rgba(0, 0, 0, 0.8)",
                padding: 2,
                borderRadius: 2,
                zIndex: 9999, // Increased z-index to ensure it's on top
                overflowX: "auto",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
            }}
        >
            <Typography
                level="h4"
                sx={{
                    color: "white",
                    mb: 2,
                }}
            >
                Lap {visibleState.lapNumber}
            </Typography>
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
                            <Avatar
                                // @ts-ignore: src params
                                src={images[unit.smallTextureName]}
                                variant="plain"
                                sx={{
                                    width: index === 0 ? "86.4px" : "72px",
                                    height: index === 0 ? "86.4px" : "72px",
                                    flexShrink: 0,
                                    transform: "rotateX(-180deg)",
                                }}
                            />
                            {unit.isSkipping ? (
                                <img
                                    src={stopImg}
                                    alt="Skipping"
                                    style={{
                                        position: "absolute",
                                        top: 0,
                                        right: index === 0 ? 10.5 : 8,
                                        width: "20px",
                                        height: "20px",
                                        zIndex: 2,
                                        transform: "rotate(180deg)",
                                    }}
                                />
                            ) : unit.isOnHourglass ? (
                                <img
                                    src={hourglassImg}
                                    alt="On Hourglass"
                                    style={{
                                        position: "absolute",
                                        top: 0,
                                        right: index === 0 ? 10.5 : 8,
                                        width: "20px",
                                        height: "20px",
                                        zIndex: 2,
                                        transform: "rotate(180deg)",
                                    }}
                                />
                            ) : null}
                            <Badge
                                badgeContent={unit.amount.toString()}
                                sx={{
                                    position: "absolute",
                                    bottom: index === 0 ? 12 : 18,
                                    right: index === 0 ? 21 : 16,
                                    zIndex: 1,
                                    "& .MuiBadge-badge": {
                                        fontSize: "0.9rem",
                                        height: "22px",
                                        minWidth: "22px",
                                        color: "white",
                                        backgroundColor:
                                            index === 0
                                                ? unit.teamType === TeamType.UPPER
                                                    ? "rgba(244, 67, 54, 1)"
                                                    : "rgba(76, 175, 80, 1)"
                                                : unit.teamType === TeamType.UPPER
                                                  ? "rgba(244, 67, 54, 0.6)"
                                                  : "rgba(76, 175, 80, 0.6)",
                                    },
                                }}
                            />
                        </Box>
                    ))}
            </Stack>
        </Box>
    );
};
