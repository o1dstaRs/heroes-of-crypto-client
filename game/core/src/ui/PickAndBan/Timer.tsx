import { Box, Typography } from "@mui/joy";
import React from "react";

const SECONDS_TO_RED_TEXT = 10;

export const Timer = ({
    localSeconds,
    isYourTurn,
    width,
}: {
    localSeconds: number;
    isYourTurn: boolean;
    width: number;
}) => (
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
                color: isYourTurn && localSeconds < SECONDS_TO_RED_TEXT ? "red" : "white",
                fontWeight: "bold",
                fontSize: isYourTurn && localSeconds < SECONDS_TO_RED_TEXT ? `${width / 8}px` : `${width / 10}px`,
                zIndex: 2,
                textShadow: "0 0 15px rgba(0, 0, 0, 1)",
                fontFamily: "DigitalDream, sans-serif",
                animation: localSeconds < SECONDS_TO_RED_TEXT ? "pulseEffect 1s infinite forwards" : "none", // Pulsing effect if less than 400000 seconds
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
