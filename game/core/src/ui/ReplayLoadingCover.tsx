import { Box, CircularProgress, Stack, Typography } from "@mui/joy";
import React from "react";

import { t, useTranslation } from "../i18n/i18n";
import { hocColors, hocSpinnerSx } from "./hocTheme";

/** A quick start shows only the dark cover; the label appears once loading is long enough to notice. */
export const REPLAY_COVER_LABEL_DELAY_MS = 350;
export const REPLAY_COVER_FADE_MS = 320;

/**
 * Covers the board while a replay prepares its opening: the opening board is built, its art is loaded and the
 * HUD settles before anything is shown, so a replay starts on a still board instead of flashing whatever the
 * view held. It comes up at once (the results screen and the route's loader beneath it are the same dark),
 * and fades out onto the opening board.
 */
export const ReplayLoadingCover: React.FC<{ visible: boolean }> = ({ visible }) => {
    useTranslation();
    return (
        <Box
            aria-hidden={!visible}
            data-testid="replay-loading-cover"
            sx={{
                position: "absolute",
                inset: 0,
                // Above the board and both sidebars, below the Exit Replay badge (7000) so a slow load can be left.
                zIndex: 6990,
                display: "grid",
                placeItems: "center",
                bgcolor: "#07090d",
                pointerEvents: visible ? "auto" : "none",
                opacity: visible ? 1 : 0,
                visibility: visible ? "visible" : "hidden",
                // Up at once; down as a fade, hidden only after it has finished.
                transition: visible
                    ? "none"
                    : `opacity ${REPLAY_COVER_FADE_MS}ms ease-out, visibility 0s linear ${REPLAY_COVER_FADE_MS}ms`,
                "@keyframes hoc-replay-cover-label": {
                    from: { opacity: 0 },
                    to: { opacity: 1 },
                },
            }}
        >
            {visible && (
                <Stack
                    spacing={2}
                    alignItems="center"
                    sx={{
                        opacity: 0,
                        animation: `hoc-replay-cover-label 240ms ease-out ${REPLAY_COVER_LABEL_DELAY_MS}ms forwards`,
                    }}
                >
                    <CircularProgress sx={hocSpinnerSx} />
                    <Typography sx={{ color: hocColors.parchment }}>{t("Loading replay")}</Typography>
                </Stack>
            )}
        </Box>
    );
};
