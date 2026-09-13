import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Box, IconButton, Sheet, Stack, Typography } from "@mui/joy";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import React from "react";
// react-router, NOT react-router-dom: the app mounts its Router from the former (v8), and the two
// packages carry separate contexts — importing the dom variant here finds no Router at all.
import { useLocation } from "react-router";

import { hocColors, hocPanelSx } from "../hocTheme";
import { t } from "../../i18n/i18n";
import { playUiPopupSound } from "../audio/uiSounds";
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
    anchorOffset?: number;
    open: boolean;
    onClose: () => void;
    /** Panel width OUTSIDE a fight; in a fight the panel follows the sidebar column instead. */
    width: number;
    maxWidth?: string;
    children: React.ReactNode;
}

export const useInGame = (): boolean => useLocation().pathname.startsWith("/game/");

export const DockPanelShell: React.FC<DockPanelShellProps> = ({
    anchorOffset = 66,
    open,
    onClose,
    width,
    maxWidth,
    children,
}) => {
    const inGame = useInGame();
    const reduceMotion = useReducedMotion();
    const panelRef = React.useRef<HTMLDivElement | null>(null);

    // Every dock panel opens on a click (a dock button, a friend's Message, a tray row), so the popup
    // sound rides the open transition here rather than in each button.
    React.useEffect(() => {
        if (open) {
            playUiPopupSound();
        }
    }, [open]);

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
                        right: { xs: 8, sm: 12 },
                        bottom: { xs: DOCK_BUTTON_STRIP, sm: DOCK_BUTTON_STRIP + 4 },
                        transformOrigin: "bottom right",
                        // Never taller than the space above the dock buttons, so it cannot run under them
                        // or off the top of the window.
                        maxHeight: `calc(100vh - ${DOCK_BUTTON_STRIP + 24}px)`,
                        width: dockPanelWidth(inGame, width, maxWidth),
                        // Above the board and the fight chrome, below the dock buttons themselves (1400).
                        zIndex: 1390,
                        display: "flex",
                        pointerEvents: "none",
                        "&::after": {
                            content: '""',
                            position: "absolute",
                            right: `${anchorOffset}px`,
                            bottom: -7,
                            width: 14,
                            height: 14,
                            bgcolor: "#0b0805",
                            borderRight: "1px solid rgba(220,177,88,0.38)",
                            borderBottom: "1px solid rgba(220,177,88,0.38)",
                            transform: "rotate(45deg)",
                            pointerEvents: "none",
                        },
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
                            position: "relative",
                            gap: 0.75,
                            p: 1.2,
                            width: "100%",
                            minHeight: 0,
                            overflow: "hidden",
                            // Opaque rather than a translucent card: it sits directly on the animated
                            // board or a busy profile, and a see-through panel over moving art is
                            // unreadable.
                            borderRadius: "18px",
                            borderColor: "rgba(220, 177, 88, 0.38)",
                            background:
                                "radial-gradient(circle at 88% 0%, rgba(220,177,88,0.11), transparent 38%), linear-gradient(155deg, rgba(22,14,8,0.985), rgba(7,6,5,0.99) 58%, rgba(14,9,5,0.99))",
                            boxShadow:
                                "0 18px 52px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,226,166,0.08), inset 0 0 28px rgba(0,0,0,0.32)",
                            backdropFilter: "blur(14px)",
                        }}
                    >
                        {children}
                    </Sheet>
                </Box>
            ) : null}
        </AnimatePresence>
    );
};

export interface DockPanelHeaderProps {
    action?: React.ReactNode;
    leading?: React.ReactNode;
    onClose: () => void;
    subtitle?: React.ReactNode;
    title: React.ReactNode;
}

export const DockPanelHeader: React.FC<DockPanelHeaderProps> = ({ action, leading, onClose, subtitle, title }) => (
    <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ minHeight: 42, px: 0.35, pb: 0.8, borderBottom: "1px solid rgba(220,177,88,0.16)" }}
    >
        {leading ? (
            <Box sx={{ display: "grid", placeItems: "center", flex: "0 0 auto" }}>{leading}</Box>
        ) : (
            <Box
                aria-hidden="true"
                sx={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    bgcolor: hocColors.gold,
                    boxShadow: "0 0 10px rgba(220,177,88,0.52)",
                    flex: "0 0 7px",
                }}
            />
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography level="title-md" noWrap sx={{ color: hocColors.parchment, fontWeight: 800 }}>
                {title}
            </Typography>
            {subtitle ? (
                <Typography level="body-xs" noWrap sx={{ color: hocColors.muted }}>
                    {subtitle}
                </Typography>
            ) : null}
        </Box>
        {action}
        <IconButton
            size="sm"
            variant="plain"
            aria-label={t("Close")}
            title={t("Close")}
            onClick={onClose}
            sx={{
                minWidth: 30,
                minHeight: 30,
                color: hocColors.muted,
                borderRadius: "50%",
                "&:hover": { color: hocColors.parchment, bgcolor: "rgba(220,177,88,0.12)" },
            }}
        >
            <CloseRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
    </Stack>
);

export default DockPanelShell;
