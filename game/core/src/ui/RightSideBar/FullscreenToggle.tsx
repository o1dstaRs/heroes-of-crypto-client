import React, { useCallback, useEffect, useState } from "react";
import Box from "@mui/joy/Box";
import Tooltip from "@mui/joy/Tooltip";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";

import { isFullscreenActive, onFullscreenChange, toggleFullscreen } from "../fullscreen";

/**
 * Bottom-bar fullscreen toggle. Shows the expand arrows to enter fullscreen and the
 * collapse arrows to exit. Styled to match the sidebar's orange accent.
 */
export const FullscreenToggle: React.FC = () => {
    const [isFullscreen, setIsFullscreen] = useState<boolean>(isFullscreenActive());

    useEffect(() => onFullscreenChange(() => setIsFullscreen(isFullscreenActive())), []);

    const toggle = useCallback(() => toggleFullscreen(), []);

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
