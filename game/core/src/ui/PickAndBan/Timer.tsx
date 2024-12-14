import { Box, Typography } from "@mui/joy";
import React from "react";

export const Timer = ({ localSeconds, isYourTurn }: { localSeconds: number; isYourTurn: boolean }) => (
    <Box
        sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1, // Surrounding element with lower z-index
        }}
    >
        <Typography
            sx={{
                color: isYourTurn && localSeconds < 400000 ? "red" : "white",
                fontWeight: "bold",
                fontSize: isYourTurn && localSeconds < 400000 ? "6rem" : "4rem",
                zIndex: 2,
                textShadow: "0 0 15px rgba(0, 0, 0, 1)",
                fontFamily: "DigitalDream, sans-serif",
                animation: localSeconds < 400000 ? "pulseEffect 1s infinite forwards" : "none", // Pulsing effect if less than 400000 seconds
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "auto", // Ensure always centered
            }}
        >
            {localSeconds > 0 ? `${localSeconds}` : 0}
        </Typography>
    </Box>
);
