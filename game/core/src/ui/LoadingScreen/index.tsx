import React from "react";
import Box, { BoxProps } from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";

// ----------------------------------------------------------------------

export default function LoadingScreen({ sx, ...other }: BoxProps) {
    return (
        <Box
            sx={{
                px: 5,
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                width: "100vw",
                height: "100dvh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "background.default",
                ...sx,
            }}
            {...other}
        >
            <LinearProgress color="inherit" sx={{ width: 1, maxWidth: 360 }} />
        </Box>
    );
}
