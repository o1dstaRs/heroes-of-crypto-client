import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import Box from "@mui/joy/Box";
import IconButton from "@mui/joy/IconButton";
import Tooltip from "@mui/joy/Tooltip";
import React from "react";
import { createPortal } from "react-dom";

import { pickExitCloseButtonSx } from "./exitFightButtonSx";

export const GAME_CORNER_SLOT_INSET = "1rem";
export const GAME_CORNER_SLOT_TOP = "calc(max(0px, calc(1rem - 2vh)) + 1vh)";
/** Above the sidebars and the system-control row, below Joy's modal layer (1300+ is the confirm dialog). */
export const GAME_CORNER_SLOT_Z_INDEX = 1450;

/**
 * The top-right corner every game screen reserves for leaving: draft, sandbox and ranked combat all park
 * the same control here instead of spending the bottom-centre slot on it.
 *
 * Portalled to the body so a sidebar's own overflow clipping — and its transform-created stacking context —
 * cannot swallow a control that is anchored to the VIEWPORT, not to the bar it is declared in.
 */
export const GameCornerSlot: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const slot = (
        <Box
            data-game-corner-slot
            sx={{
                position: "fixed",
                top: GAME_CORNER_SLOT_TOP,
                right: GAME_CORNER_SLOT_INSET,
                zIndex: GAME_CORNER_SLOT_Z_INDEX,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 1,
            }}
        >
            {children}
        </Box>
    );

    return typeof document === "undefined" ? slot : createPortal(slot, document.body);
};

/** Image-only close button. Callers own the confirmation step. */
export const GameCornerExitButton: React.FC<{
    onClick: () => void;
    disabled?: boolean;
    label?: string;
}> = ({ onClick, disabled = false, label = "Exit fight" }) => (
    <Tooltip title={label} variant="soft" size="sm" placement="left">
        <IconButton aria-label={label} disabled={disabled} onClick={onClick} sx={pickExitCloseButtonSx} />
    </Tooltip>
);

export default GameCornerSlot;

export const GameCornerStartOverButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <Tooltip title="Clear the board and start a new sandbox" describeChild variant="soft" size="sm" placement="bottom">
        <IconButton
            aria-label="Start over"
            onClick={onClick}
            sx={{
                ...pickExitCloseButtonSx,
                // Reuse the close artwork's outer 32px at its native 256px proportions.
                // Both controls then have the same visible frame as well as the same hit area.
                border: "4px solid transparent",
                borderImageSource: pickExitCloseButtonSx.backgroundImage,
                borderImageSlice: 32,
                backgroundImage: "linear-gradient(135deg, #381410, #1d0b08)",
                color: "#cfab70",
            }}
        >
            <RestartAltRoundedIcon sx={{ fontSize: 18, color: "inherit" }} />
        </IconButton>
    </Tooltip>
);
