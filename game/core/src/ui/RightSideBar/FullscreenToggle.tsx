import React, { useCallback, useEffect, useState } from "react";
import Box from "@mui/joy/Box";
import Tooltip from "@mui/joy/Tooltip";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";

/**
 * Bottom-bar fullscreen toggle. Shows the expand arrows to enter fullscreen and the
 * collapse arrows to exit. Styled to match the sidebar's orange accent.
 */
export const FullscreenToggle: React.FC = () => {
    const [isFullscreen, setIsFullscreen] = useState<boolean>(!!document.fullscreenElement);

    useEffect(() => {
        const onChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    const toggle = useCallback(() => {
        try {
            const p = document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen();
            void p?.catch(() => {});
        } catch {
            /* fullscreen unsupported */
        }
    }, []);

    const Icon = isFullscreen ? FullscreenExitIcon : FullscreenIcon;

    return (
        <Tooltip title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} placement="top" size="sm" variant="soft">
            <Box
                onClick={toggle}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 32,
                    width: 32,
                    cursor: "pointer",
                    color: "rgba(255, 143, 0, 0.8)",
                    transition: "transform 0.3s ease, color 0.2s ease",
                    "&:hover": { color: "#FF8F00", transform: "scale(1.1)" },
                }}
            >
                <Icon sx={{ fontSize: 22 }} />
            </Box>
        </Tooltip>
    );
};
