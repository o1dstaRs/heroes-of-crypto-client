import { Box, Sheet } from "@mui/joy";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import React from "react";
// react-router, NOT react-router-dom: the app mounts its Router from the former (v8), and the two
// packages carry separate contexts — importing the dom variant here finds no Router at all.
import { useLocation } from "react-router";

import { hocPanelSx } from "../hocTheme";
import {
    DOCK_BUTTON_MARKER,
    DOCK_PANEL_COLUMN_WIDTH,
    dockPanelWidth,
    shouldDismissOnOutsidePointer,
} from "./dockPanelBehaviour";

/**
 * The frame around a social dock panel (notifications, friends, a conversation, predictions).
 *
 * It ALWAYS docks: a card in the bottom-right corner that grows out of the dock buttons it was opened
 * from, with no backdrop anywhere. Checking a bet or answering a friend is something you do *while*
 * doing whatever you were doing — reading your profile, watching a fight — not instead of it.
 *
 * This used to be two different things. Inside a fight it docked, because a modal dims and blurs the
 * board the player is watching and steals the pointer so a turn cannot be taken while a friend list is
 * open. Everywhere else it was a centred modal, on the reasoning that there was "nothing behind it worth
 * protecting". But the portal IS worth protecting: blanking a profile you are reading to show a friend
 * list is the same interruption, minus the excuse. One behaviour now, in both places.
 *
 * Losing the modal loses its backdrop, which was how a click outside dismissed it — so the two
 * dismissals it implied are restored explicitly: Escape closes anywhere, and out of a fight a click
 * outside closes too. In a fight it deliberately does NOT, because out there a stray click belongs to
 * the board.
 *
 * The in-fight width follows the strip left beside the board. The board is square and centred, scaling
 * to min(viewport width, viewport height), so each side strip is (100vw - min(100vw, 100vh)) / 2 — the
 * same quantity RightSideBar computes in JS. Expressing it in CSS keeps the two in step through a resize
 * without subscribing to anything. It is clamped because a tall narrow window leaves a strip too thin to
 * read, and a very wide one leaves more room than a panel needs.
 */

// Re-exported from dockPanelBehaviour (where it is unit-tested alongside the dismissal rule) so the
// existing importers of this module keep working.
export { DOCK_PANEL_COLUMN_WIDTH };

/** Height reserved at the bottom for the dock buttons the panel is opened from. */
const DOCK_BUTTON_STRIP = 58;

export interface DockPanelShellProps {
    open: boolean;
    onClose: () => void;
    /** Panel width OUTSIDE a fight; in a fight the panel follows the sidebar column instead. */
    width: number;
    maxWidth?: string;
    children: React.ReactNode;
}

export const useInGame = (): boolean => useLocation().pathname.startsWith("/game/");

export const DockPanelShell: React.FC<DockPanelShellProps> = ({ open, onClose, width, maxWidth, children }) => {
    const inGame = useInGame();
    const reduceMotion = useReducedMotion();
    const panelRef = React.useRef<HTMLDivElement | null>(null);

    // Escape closes the panel wherever it is. The modal used to give this for free.
    React.useEffect(() => {
        if (!open) {
            return undefined;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, onClose]);

    // Out of a fight, a click anywhere else closes — the backdrop's job, without the backdrop. Inside a
    // fight it must not: a click on the board is a move, not a dismissal.
    React.useEffect(() => {
        if (!open || inGame) {
            return undefined;
        }
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            const dismiss = shouldDismissOnOutsidePointer({
                open,
                inGame,
                insidePanel: !target || !!panelRef.current?.contains(target),
                onDockButton: target instanceof Element && !!target.closest(`[${DOCK_BUTTON_MARKER}='true']`),
            });
            if (dismiss) {
                onClose();
            }
        };
        window.addEventListener("pointerdown", onPointerDown);
        return () => window.removeEventListener("pointerdown", onPointerDown);
    }, [open, inGame, onClose]);

    return (
        <AnimatePresence>
            {open ? (
                <Box
                    component={motion.div}
                    ref={panelRef}
                    // Grows out of the dock buttons it was opened from, and shrinks back into them when
                    // dismissed, so the panel reads as belonging to the button rather than arriving from
                    // nowhere. AnimatePresence is what lets the CLOSE animate at all — without it React
                    // would unmount the card the instant `open` flips.
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 14 }}
                    animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 10 }}
                    transition={
                        reduceMotion ? { duration: 0.12 } : { type: "spring", stiffness: 460, damping: 34, mass: 0.7 }
                    }
                    sx={{
                        position: "fixed",
                        right: 8,
                        bottom: DOCK_BUTTON_STRIP,
                        transformOrigin: "bottom right",
                        // Never taller than the space above the dock buttons, so it cannot run under them
                        // or off the top of the window.
                        maxHeight: `calc(100vh - ${DOCK_BUTTON_STRIP + 24}px)`,
                        width: dockPanelWidth(inGame, width, maxWidth),
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
                            // The panel takes clicks; the wrapper does not, so whatever is behind keeps
                            // every pixel this does not physically cover.
                            pointerEvents: "auto",
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                            p: 1.5,
                            width: "100%",
                            minHeight: 0,
                            overflowY: "auto",
                            // Opaque rather than a translucent card: it sits directly on the animated
                            // board or a busy profile, and a see-through panel over moving art is
                            // unreadable.
                            bgcolor: "rgba(10, 8, 6, 0.96)",
                            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.55)",
                        }}
                    >
                        {children}
                    </Sheet>
                </Box>
            ) : null}
        </AnimatePresence>
    );
};

export default DockPanelShell;
