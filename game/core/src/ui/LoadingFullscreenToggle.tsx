import Box from "@mui/joy/Box";
import React from "react";

import { FullscreenToggle } from "./RightSideBar/FullscreenToggle";

/**
 * Loading-screen fullscreen control. The Pixi loading artwork sits below the HTML input canvas, so this
 * small React overlay keeps the same clickable forged medallion used by the draft and battle footers.
 */
export const LoadingFullscreenToggle: React.FC = () => (
    <Box
        sx={{
            position: "fixed",
            left: "1rem",
            bottom: "1rem",
            zIndex: 60,
            width: 32,
            height: 32,
        }}
    >
        <FullscreenToggle />
    </Box>
);
