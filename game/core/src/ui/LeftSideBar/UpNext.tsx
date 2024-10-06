import { TeamType } from "@heroesofcrypto/common";

import Avatar from "@mui/joy/Avatar";
import Badge from "@mui/joy/Badge";
import Box from "@mui/joy/Box";
import Divider from "@mui/joy/Divider";
import Stack from "@mui/joy/Stack";
import { useTheme } from "@mui/joy/styles";
import Typography from "@mui/joy/Typography";
import React, { useEffect, useState } from "react";

import { images } from "../../generated/image_imports";
import { useManager } from "../../manager";
import { IVisibleState, IVisibleUnit } from "../../state/visible_state";

export const UpNext: React.FC = () => {
    const [visibleState, setVisibleState] = useState<IVisibleState>({} as IVisibleState);
    const theme = useTheme();

    const manager = useManager();

    useEffect(() => {
        const connection = manager.onVisibleStateUpdated.connect(setVisibleState);
        return () => {
            connection.disconnect();
        };
    }, [manager]);

    const visibleUnits: IVisibleUnit[] = visibleState.upNext ?? [];
    const boxShadow =
        theme.palette.mode === "dark"
            ? "-100px 15px 15px 50px rgba(0, 0, 0, 0.3)"
            : "-100px 15px 15px 50px rgba(255, 255, 255, 0.3)";

    return (
        <>
            <Divider />
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
                            visibleUnits.map((unit, index) => (
                                <Box key={index} sx={{ position: "relative" }}>
                                    <Avatar
                                        // @ts-ignore: src params
                                        src={images[unit.smallTextureName]}
                                        variant="plain"
                                        sx={{
                                            transform: "rotateX(-180deg)",
                                            width: index === visibleUnits.length - 1 ? "84px" : "72px",
                                            height: index === visibleUnits.length - 1 ? "84px" : "72px",
                                            flexShrink: 0,
                                            boxShadow: index === visibleUnits.length - 1 ? boxShadow : "none",
                                        }}
                                    />
                                    <Badge
                                        badgeContent={unit.amount.toString()}
                                        // @ts-ignore: style params
                                        color="#ff0000"
                                        sx={{
                                            position: "absolute",
                                            bottom: index === visibleUnits.length - 1 ? 12 : 18,
                                            right: index === visibleUnits.length - 1 ? 21 : 16,
                                            zIndex: 1,
                                            "& .MuiBadge-badge": {
                                                fontSize: "0.9rem",
                                                height: "22px",
                                                minWidth: "22px",
                                                color: "white",
                                                backgroundColor:
                                                    unit.teamType === TeamType.UPPER
                                                        ? `rgba(244, 67, 54, ${
                                                              index === visibleUnits.length - 1 ? 1 : 0.6
                                                          })`
                                                        : `rgba(76, 175, 80, ${
                                                              index === visibleUnits.length - 1 ? 1 : 0.6
                                                          })`,
                                            },
                                        }}
                                    />
                                </Box>
                            ))}
                    </Stack>
                </Box>
            </Box>
        </>
    );
};
