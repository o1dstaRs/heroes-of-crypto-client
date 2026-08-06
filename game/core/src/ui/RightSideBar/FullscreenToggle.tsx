import React, { useCallback, useEffect, useState } from "react";
import Box from "@mui/joy/Box";
import Tooltip from "@mui/joy/Tooltip";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import { hocColors } from "../hocTheme";

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
                    color: `${hocColors.gold} !important`,
                    transition: "transform 0.3s ease, color 0.2s ease",
                    "&:hover": { color: "#f0ca75", transform: "scale(1.1)" },
                    "& .MuiSvgIcon-root": { color: "inherit !important" },
                }}
            >
                <Icon sx={{ fontSize: 22, color: "inherit !important" }} />
            </Box>
        </Tooltip>
    );
};
