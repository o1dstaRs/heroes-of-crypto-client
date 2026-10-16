import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import IconButton from "@mui/joy/IconButton";
import Tooltip from "@mui/joy/Tooltip";
import React from "react";
import { createPortal } from "react-dom";

import { PICK_EXIT_CLOSE_BUTTON_SIZE_PX, pickExitCloseButtonSx } from "./exitFightButtonSx";
import { hocSidebarImageButtonSx } from "./hocTheme";

export const GAME_CORNER_SLOT_INSET = "1rem";
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
                top: GAME_CORNER_SLOT_INSET,
                right: GAME_CORNER_SLOT_INSET,
                zIndex: GAME_CORNER_SLOT_Z_INDEX,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "0.5rem",
            }}
        >
            {children}
        </Box>
    );

    return typeof document === "undefined" ? slot : createPortal(slot, document.body);
};

/** The compact red close button itself. Callers own the confirmation step. */
export const GameCornerExitButton: React.FC<{
    onClick: () => void;
    disabled?: boolean;
    label?: string;
}> = ({ onClick, disabled = false, label = "Exit fight" }) => (
    <Tooltip title={label} variant="soft" size="sm" placement="left">
        <IconButton aria-label={label} disabled={disabled} onClick={onClick} sx={pickExitCloseButtonSx}>
            ✕
        </IconButton>
    </Tooltip>
);

export const GameCornerStartOverButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <Tooltip title="Clear the board and start a new sandbox" describeChild variant="soft" size="sm" placement="bottom">
        <Button
            aria-label="Start over"
            onClick={onClick}
            sx={{
                ...hocSidebarImageButtonSx("neutral"),
                width: "auto",
                minWidth: 0,
                height: `${PICK_EXIT_CLOSE_BUTTON_SIZE_PX}px`,
                minHeight: `${PICK_EXIT_CLOSE_BUTTON_SIZE_PX}px`,
                px: 1.25,
                fontSize: "0.7rem",
                whiteSpace: "nowrap",
            }}
        >
            Start over
        </Button>
    </Tooltip>
);

export default GameCornerSlot;
