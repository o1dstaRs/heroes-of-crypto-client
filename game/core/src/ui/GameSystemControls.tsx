import Box from "@mui/joy/Box";
import React, { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { registerVolumeSlot, VOLUME_SLOT_PRIORITY } from "./audio/volumeSlot";
import { FullscreenToggle } from "./RightSideBar/FullscreenToggle";

export const GAME_SYSTEM_CONTROLS_SIDE_INSET = "1rem";
export const GAME_SYSTEM_CONTROLS_BOTTOM_INSET = "1rem";
/**
 * Horizontal room a page must leave in the bottom-left corner for FullscreenCorner: the button itself plus
 * its inset from the edge plus a small gap. Pages whose content reaches that corner (the arena's chat room)
 * step their content clear by this much instead of letting the button land on it.
 */
export const FULLSCREEN_CORNER_CLEARANCE = "3.5rem";

export const GAME_SYSTEM_CONTROLS_CENTER_WIDTH = "min(209px, calc(100vw - 8rem))";

export const gameSystemControlsSx = {
    position: "fixed",
    left: GAME_SYSTEM_CONTROLS_SIDE_INSET,
    right: GAME_SYSTEM_CONTROLS_SIDE_INSET,
    bottom: GAME_SYSTEM_CONTROLS_BOTTOM_INSET,
    display: "grid",
    gridTemplateColumns: "32px minmax(0, 1fr) 32px",
    // END, not centre: the centre cell is whatever the phase puts there — the ranked footer, the ranked
    // panel, an EXIT FIGHT button — and it alone sets the row's height. Centring floated the 32px side
    // cells up by half the difference, so in a fight the speaker hovered above the social dock's buttons
    // while the row's own bottom inset said otherwise (owner report 2026-09-19). Anchoring the sides to
    // the bottom keeps fullscreen and volume on the dock's line whatever the centre grows to.
    alignItems: "end",
    pointerEvents: "none",
} as const;

/**
 * The fullscreen toggle on its own, pinned where the game row puts it.
 *
 * Screens outside a match — the arena at /play — have no phase row to hang controls on, but a player who
 * went fullscreen for a fight still wants the button when they come back out to queue (owner request
 * 2026-09-20). Sharing GameSystemControls' insets is the point: the button must not shift by a pixel
 * between the arena and the pick/fight screens, which it would the moment the two carried their own
 * numbers.
 *
 * Only the LEFT cell, deliberately. The full row would also lay an empty, click-catching 32px box in the
 * bottom-right corner, which on these screens is exactly where the social dock draws its own buttons.
 * Volume is left to whoever owns the slot there (the dock outranks this row anyway — see volumeSlot).
 *
 * Portalled to the body for the same reason the row is: it must not be clipped by a scrolling page.
 */
export const FullscreenCorner: React.FC<{ zIndex?: number }> = ({ zIndex = 60 }) => {
    if (typeof document === "undefined") {
        return null;
    }
    return createPortal(
        <Box
            data-fullscreen-corner
            sx={{
                position: "fixed",
                left: GAME_SYSTEM_CONTROLS_SIDE_INSET,
                bottom: GAME_SYSTEM_CONTROLS_BOTTOM_INSET,
                display: "flex",
                pointerEvents: "auto",
                zIndex,
                // A scrolling page slides its content under this button on the way past. The medallion is
                // cut out, so page text showed straight through it; a dark disc behind keeps the control
                // readable at every scroll position without reading as a second button.
                borderRadius: "50%",
                bgcolor: "rgba(10, 8, 6, 0.62)",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.45)",
                backdropFilter: "blur(2px)",
            }}
        >
            <FullscreenToggle />
        </Box>,
        document.body,
    );
};

/**
 * One viewport-anchored home for the controls that must not jump when the game changes phase.
 *
 * Portalling to the document body keeps the row out of the sidebars' overflow clipping. The three slots
 * remain fixed at bottom-left / bottom-centre / bottom-right in picks, placement and combat, regardless of
 * which game surface happens to own them.
 */
export const GameSystemControls: React.FC<{
    center?: React.ReactNode;
    priority?: number;
    zIndex?: number;
}> = ({ center, priority = VOLUME_SLOT_PRIORITY.gameControls, zIndex = 60 }) => {
    const volumeSlotRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => registerVolumeSlot(volumeSlotRef.current, priority), [priority]);

    const controls = (
        <Box data-game-system-controls sx={{ ...gameSystemControlsSx, zIndex }}>
            <Box sx={{ display: "flex", justifyContent: "flex-start", pointerEvents: "auto" }}>
                <FullscreenToggle />
            </Box>
            <Box
                sx={{
                    width: GAME_SYSTEM_CONTROLS_CENTER_WIDTH,
                    minWidth: 0,
                    justifySelf: "center",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "auto",
                }}
            >
                {center}
            </Box>
            <Box
                ref={volumeSlotRef}
                sx={{
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    pointerEvents: "auto",
                }}
            />
        </Box>
    );

    return typeof document === "undefined" ? controls : createPortal(controls, document.body);
};

export default GameSystemControls;
