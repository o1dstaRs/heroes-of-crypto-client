import { Chip } from "@mui/joy";
import React from "react";

// Compact inline countdown that lives in the status row (next to the turn/upgrade chips).
// Turns urgent (red, pulsing) only in the final seconds of your own turn — otherwise it's a
// calm neutral chip. Previously this was an absolutely-centered 6rem number that floated over
// the creature grid because its "urgent" threshold (< 400000) was effectively always true.
const URGENT_SECONDS = 10;

export const Timer = ({ localSeconds, isYourTurn }: { localSeconds: number; isYourTurn: boolean }) => {
    const seconds = localSeconds > 0 ? localSeconds : 0;
    const urgent = isYourTurn && seconds <= URGENT_SECONDS;
    return (
        <Chip
            variant={urgent ? "solid" : "soft"}
            color={urgent ? "danger" : "neutral"}
            sx={{
                fontFamily: "DigitalDream, sans-serif",
                fontWeight: "bold",
                minWidth: 56,
                justifyContent: "center",
                animation: urgent ? "pulseEffect 1s infinite forwards" : "none",
            }}
        >
            {`0:${seconds.toString().padStart(2, "0")}`}
        </Chip>
    );
};
