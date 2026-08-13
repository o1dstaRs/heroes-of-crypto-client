import { Box, Modal, ModalDialog, Sheet } from "@mui/joy";
import React from "react";
// react-router, NOT react-router-dom: the app mounts its Router from the former (v8), and the two
// packages carry separate contexts — importing the dom variant here finds no Router at all.
import { useLocation } from "react-router";

import { hocPanelSx } from "../hocTheme";

/**
 * The frame around a social dock panel (notifications, friends, a conversation, predictions).
 *
 * OUT of a fight it is a normal centred modal — there is nothing behind it worth protecting.
 *
 * INSIDE a fight it is not (owner call): a modal dims and blurs the board, which is exactly the thing the
 * player is watching, and it steals the pointer so a turn cannot be taken while a friend list is open.
 * The panel instead docks into the RIGHT SIDEBAR column — the strip beside the board that already holds
 * the fight's own chrome — with no backdrop at all, so checking a bet or answering a friend is something
 * you do *while* playing rather than instead of playing.
 *
 * The column is the space left over beside the board, and the board is square and centred: it scales to
 * min(viewport width, viewport height), so each side strip is (100vw - min(100vw, 100vh)) / 2. That is the
 * same quantity RightSideBar computes in JS; expressing it in CSS keeps the two in step through a resize
 * without this component subscribing to anything. It is clamped because a tall narrow window leaves a
 * strip too thin to read, and a very wide one leaves more room than a panel needs.
 */
export const DOCK_PANEL_COLUMN_WIDTH = "clamp(300px, calc((100vw - min(100vw, 100vh)) / 2 - 16px), 460px)";

/** Height reserved at the bottom for the dock buttons the panel is opened from. */
const DOCK_BUTTON_STRIP = 58;

export interface DockPanelShellProps {
    open: boolean;
    onClose: () => void;
    /** Width of the CENTRED modal outside a fight; the docked panel always follows the sidebar column. */
    width: number;
    maxWidth?: string;
    children: React.ReactNode;
}

export const useInGame = (): boolean => useLocation().pathname.startsWith("/game/");

export const DockPanelShell: React.FC<DockPanelShellProps> = ({ open, onClose, width, maxWidth, children }) => {
    const inGame = useInGame();

    if (!inGame) {
        return (
            <Modal open={open} onClose={onClose}>
                <ModalDialog variant="outlined" sx={{ ...hocPanelSx, width, maxWidth: maxWidth ?? "96vw" }}>
                    {children}
                </ModalDialog>
            </Modal>
        );
    }

    if (!open) {
        return null;
    }

    return (
        <Box
            sx={{
                position: "fixed",
                right: 8,
                bottom: DOCK_BUTTON_STRIP,
                // Never taller than the strip beside the board, so it cannot run under the dock buttons
                // or off the top of the window.
                maxHeight: `calc(100vh - ${DOCK_BUTTON_STRIP + 24}px)`,
                width: DOCK_PANEL_COLUMN_WIDTH,
                // Above the board and the fight chrome, below the dock buttons themselves (1400).
                zIndex: 1390,
                display: "flex",
                pointerEvents: "none",
            }}
        >
            <Sheet
                variant="outlined"
                sx={{
                    ...hocPanelSx,
                    // The panel takes clicks; the wrapper does not, so the board keeps every pixel this
                    // does not physically cover.
                    pointerEvents: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    p: 1.5,
                    width: "100%",
                    minHeight: 0,
                    overflowY: "auto",
                    // Opaque rather than the modal's translucent card: it sits directly on the animated
                    // board, and a see-through panel over moving art is unreadable.
                    bgcolor: "rgba(10, 8, 6, 0.96)",
                    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.55)",
                }}
            >
                {children}
            </Sheet>
        </Box>
    );
};

export default DockPanelShell;
