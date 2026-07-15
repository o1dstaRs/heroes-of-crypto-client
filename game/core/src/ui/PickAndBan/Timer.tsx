import { Chip } from "@mui/joy";
import React from "react";

// Compact inline countdown that lives in the status row (next to the turn/upgrade chips).
// Turns urgent (red, pulsing) only in the final seconds of your own turn — otherwise it's a
// calm neutral chip. Previously this was an absolutely-centered 6rem number that floated over
// the creature grid because its "urgent" threshold (< 400000) was effectively always true.
const URGENT_SECONDS = 10;

export const Timer = ({ localSeconds, isYourTurn }: { localSeconds: number; isYourTurn: boolean }) => {
    const totalSeconds = localSeconds > 0 ? localSeconds : 0;
    const urgent = isYourTurn && totalSeconds <= URGENT_SECONDS;
    // Some phases (e.g. PERK at 70s) run past a minute — divmod into minutes:seconds instead of
    // always prefixing "0:" (which rendered a 69-second countdown as the nonsensical "0:69").
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
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
            {`${minutes}:${seconds.toString().padStart(2, "0")}`}
        </Chip>
    );
};
