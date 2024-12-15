import React from "react";

import { Box, Badge } from "@mui/joy";

import revealSmallImage from "../../../images/icon_reveal_128.webp";

const RevealIcon: React.FC<{
    revealsRemaining: number;
}> = ({ revealsRemaining }) => (
    <Box
        sx={{
            position: "absolute",
            top: "0%", // Anchor to the bottom side
            left: "50%",
            // transform: "translate(-50%, 50%)",
            zIndex: 50,
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
            badgeContent={revealsRemaining}
            // @ts-ignore: style params
            color="success"
            sx={{
                position: "absolute",
                // bottom: 2.5,
                transform: "scale(0.8) translate(50%, 50%)",
                // opacity: 0.75,
            }}
        />
    </Box>
);

export default RevealIcon;
