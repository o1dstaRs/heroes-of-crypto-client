import React from "react";

import { Box, Badge, Tooltip } from "@mui/joy";

import revealSmallImage from "../../../images/icon_reveal_128.webp";

const RevealIcon: React.FC<{
    revealsRemaining: number;
}> = ({ revealsRemaining }) => (
    <Tooltip title={"Number of reveals remaining"} placement="top">
        <Box
            sx={{
                position: "absolute",
                top: "6%", // Anchor to the bottom side
                left: "50%",
                zIndex: 50,
                cursor: "pointer",
                "&:hover": {
                    cursor: "help",
                },
            }}
        >
            <img
                src={revealSmallImage}
                alt="Reveal Icon"
                style={{
                    width: "45%",
                    margin: "0 auto",
                    filter: "brightness(1)", // Base filter
                }}
            />
            <Badge
                badgeContent={<strong>{revealsRemaining}</strong>}
                sx={{
                    position: "absolute",
                    top: "20%",
                    left: "42%",
                    transform: "translateX(-50%) scale(0.8)",
                    animation: "pulse 2s infinite",
                    "& .MuiBadge-badge": {
                        color: "rgb(0, 0, 0)",
                        backgroundColor: "rgb(115, 239, 245)",
                    },
                }}
            />
        </Box>
    </Tooltip>
);

export default RevealIcon;
