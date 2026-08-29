import React, { useCallback } from "react";
import Box from "@mui/joy/Box";
import Tooltip from "@mui/joy/Tooltip";

import { images as rawImages } from "../../generated/image_imports";
import { t, useTranslation } from "../../i18n/i18n";

import { toggleFullscreen } from "../fullscreen";
import { useFullscreenActive } from "../useFullscreenActive";

const images = rawImages as Record<string, string>;
const fullscreenControlImage = images.ui_control_fullscreen_forged_bronze_v1;

/**
 * Bottom-bar fullscreen toggle using the same forged medallion treatment as the
 * pre-fight controls. The tooltip and accessible label still expose the current action.
 */
export const FullscreenToggle: React.FC = () => {
    useTranslation();
    const isFullscreen = useFullscreenActive();

    const toggle = useCallback(() => toggleFullscreen(), []);
    const fullscreenLabel = isFullscreen ? t("Exit fullscreen") : t("Fullscreen");

    return (
        <Tooltip title={fullscreenLabel} placement="top" size="sm" variant="soft">
            <Box
                component="button"
                type="button"
                aria-label={fullscreenLabel}
                onClick={toggle}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 32,
                    width: 32,
                    cursor: "pointer",
                    border: 0,
                    p: 0,
                    bgcolor: "transparent",
                    backgroundImage: `url(${fullscreenControlImage})`,
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "contain",
                    transition: "filter 140ms ease, transform 140ms ease",
                    "&:hover": { filter: "brightness(1.12)", transform: "scale(1.06)" },
                }}
            />
        </Tooltip>
    );
};
