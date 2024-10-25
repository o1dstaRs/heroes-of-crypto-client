import { TeamType } from "@heroesofcrypto/common";

import Avatar from "@mui/joy/Avatar";
import Badge from "@mui/joy/Badge";
import Box from "@mui/joy/Box";
import Divider from "@mui/joy/Divider";
import Stack from "@mui/joy/Stack";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";

import { images } from "../../generated/image_imports";
import { useManager } from "../../manager";
import stopImg from "../../../images/stop.webp";
import hourglassImg from "../../../images/hourglass.webp";
import { IVisibleState, IVisibleUnit } from "../../state/visible_state";

export const UpNext: React.FC = () => {
    const [visibleState, setVisibleState] = useState<IVisibleState>({} as IVisibleState);

    const manager = useManager();

    useEffect(() => {
        const connection = manager.onVisibleStateUpdated.connect(setVisibleState);
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    const visibleUnits: IVisibleUnit[] = visibleState.upNext ?? [];

    return (
        <>
            <Divider />
            <Tooltip title="Click ALT to see who is turning next" style={{ zIndex: 1 }}>
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
                            {visibleUnits.length > 0 &&
                                [...visibleUnits].reverse().map((unit, index) => (
                                    <Box key={index} sx={{ position: "relative" }}>
                                        <Avatar
                                            // @ts-ignore: src params
                                            src={images[unit.smallTextureName]}
                                            variant="plain"
                                            sx={{
                                                transform: "rotateX(-180deg)",
                                                width: index === 0 ? "84px" : "72px",
                                                height: index === 0 ? "84px" : "72px",
                                                flexShrink: 0,
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
                                            // @ts-ignore: style params
                                            color="#ff0000"
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
                                                        unit.teamType === TeamType.UPPER
                                                            ? `rgba(244, 67, 54, ${index === 0 ? 1 : 0.6})`
                                                            : `rgba(76, 175, 80, ${index === 0 ? 1 : 0.6})`,
                                                },
                                            }}
                                        />
                                    </Box>
                                ))}
                        </Stack>
                    </Box>
                </Box>
            </Tooltip>
        </>
    );
};
