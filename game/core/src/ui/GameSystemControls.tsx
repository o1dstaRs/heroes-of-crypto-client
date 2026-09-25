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
export const GAME_SYSTEM_CONTROLS_STACK_GAP = "0.33rem";
/** Both corner medallions (fullscreen, sound) are square and this size; other rows align against it. */
export const GAME_SYSTEM_CONTROL_SIZE_PX = 32;

/**
 * Draft variant: both system buttons share the right-hand corner, on ONE line — sound immediately left of
 * fullscreen, which keeps the corner itself. The social dock's medallion continues that same line further
 * left, so every corner control reads as a single row.
 */
export const GAME_SYSTEM_CONTROLS_STACK_GAP_PX = 5.28;
/** The footer plate (EXIT FIGHT, PLAY RANKED) that a host can put in the centre slot. */
export const GAME_SYSTEM_CONTROLS_CENTER_HEIGHT_PX = 35.2;
/** That plate's authored width, and so the width below which the footer row wraps instead of squeezing. */
export const GAME_SYSTEM_CONTROLS_CENTER_MIN_WIDTH_PX = 209;
/**
 * Height a host must reserve beneath its own content. The footer is one line wherever the plate fits
 * beside the controls and wraps to two where it does not, so reserve the taller of the two shapes.
 */
export const GAME_SYSTEM_CONTROLS_STACK_HEIGHT_PX =
    GAME_SYSTEM_CONTROL_SIZE_PX + GAME_SYSTEM_CONTROLS_STACK_GAP_PX + GAME_SYSTEM_CONTROLS_CENTER_HEIGHT_PX;
/** Sound and fullscreen, the pair the social dock measures from. */
export const GAME_SYSTEM_CONTROLS_STACK_WIDTH_PX = GAME_SYSTEM_CONTROL_SIZE_PX * 2 + GAME_SYSTEM_CONTROLS_STACK_GAP_PX;
/**
 * The whole right-hand corner: the social medallion, sound and fullscreen, with the same gap between
 * each. A centred plate reserves an empty flank of this width on the left so the plate stays on the
 * row's midpoint instead of centring in whatever space is left of the buttons.
 */
export const GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX =
    GAME_SYSTEM_CONTROL_SIZE_PX * 3 + GAME_SYSTEM_CONTROLS_STACK_GAP_PX * 2;
export const gameSystemControlsStackSx = {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: GAME_SYSTEM_CONTROLS_STACK_GAP,
    pointerEvents: "auto",
} as const;

const volumeSlotSx = {
    width: GAME_SYSTEM_CONTROL_SIZE_PX,
    height: GAME_SYSTEM_CONTROL_SIZE_PX,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
} as const;

export const gameSystemControlsSx = {
    position: "fixed",
    left: GAME_SYSTEM_CONTROLS_SIDE_INSET,
    right: GAME_SYSTEM_CONTROLS_SIDE_INSET,
    bottom: GAME_SYSTEM_CONTROLS_BOTTOM_INSET,
    display: "grid",
    gridTemplateColumns: `${GAME_SYSTEM_CONTROL_SIZE_PX}px minmax(0, 1fr) ${GAME_SYSTEM_CONTROL_SIZE_PX}px`,
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
 * span the viewport during picks, or the right sidebar during placement and combat.
 */
export const GameSystemControls: React.FC<{
    center?: React.ReactNode;
    sidebarWidth?: number;
    priority?: number;
    zIndex?: number;
    /** Stack sound above fullscreen in the right corner instead of splitting them across the row. */
    rightStack?: boolean;
    /**
     * Centre `center` on the row. The corner controls stay on the right; an equal empty flank on the
     * left keeps the plate on the midpoint. Off for a centre that must use all the width beside the
     * buttons (the ranked fight panel).
     */
    centerInRow?: boolean;
}> = ({
    center,
    sidebarWidth,
    priority = VOLUME_SLOT_PRIORITY.gameControls,
    zIndex = 60,
    rightStack = false,
    centerInRow = false,
}) => {
    const volumeSlotRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => registerVolumeSlot(volumeSlotRef.current, priority), [priority]);

    const anchorSx = {
        ...(sidebarWidth !== undefined
            ? { left: `calc(100% - ${sidebarWidth}px + ${GAME_SYSTEM_CONTROLS_SIDE_INSET})` }
            : {}),
        zIndex,
    };

    const cornerRow = (
        <Box
            sx={{
                ...gameSystemControlsStackSx,
                // The social dock's medallion continues this row one control further left, but it is a
                // fixed element of its own and takes no space here. The padding is its slot, and the
                // fixed width is that slot plus sound and fullscreen, so a matching empty flank can
                // centre the plate.
                boxSizing: "border-box",
                width: GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX,
                flexShrink: 0,
                gap: `${GAME_SYSTEM_CONTROLS_STACK_GAP_PX}px`,
                pl: `${GAME_SYSTEM_CONTROL_SIZE_PX + GAME_SYSTEM_CONTROLS_STACK_GAP_PX}px`,
            }}
        >
            <Box ref={volumeSlotRef} sx={volumeSlotSx} />
            <FullscreenToggle />
        </Box>
    );

    /**
     * One line. The corner controls keep the right edge. A plate that asks to be centred
     * (`centerInRow`) sits on the row's midpoint, with an empty flank matching the corner; anything
     * else uses the width beside the buttons.
     */
    const controls = rightStack ? (
        <Box
            data-game-system-controls
            sx={{
                position: "fixed",
                left: GAME_SYSTEM_CONTROLS_SIDE_INSET,
                right: GAME_SYSTEM_CONTROLS_SIDE_INSET,
                bottom: GAME_SYSTEM_CONTROLS_BOTTOM_INSET,
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: GAME_SYSTEM_CONTROLS_STACK_GAP,
                pointerEvents: "none",
                ...anchorSx,
            }}
        >
            {centerInRow ? (
                <Box
                    sx={{
                        display: "grid",
                        flex: "1 1 100%",
                        width: "100%",
                        minWidth: 0,
                        gridTemplateColumns: `${GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX}px minmax(0, 1fr) ${GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX}px`,
                        alignItems: "end",
                    }}
                >
                    <Box aria-hidden />
                    <Box
                        sx={{
                            minWidth: 0,
                            containerType: "inline-size",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            pointerEvents: center ? "auto" : "none",
                        }}
                    >
                        {center}
                    </Box>
                    {cornerRow}
                </Box>
            ) : (
                <>
                    <Box
                        sx={{
                            flex: "1 1 auto",
                            // Its own line as soon as the plate cannot keep its authored width beside the
                            // controls; below that threshold this slot no longer fits, and the row wraps.
                            minWidth: `min(100%, ${GAME_SYSTEM_CONTROLS_CENTER_MIN_WIDTH_PX}px)`,
                            containerType: "inline-size",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            // An empty centre slot must not swallow clicks aimed at whatever sits behind it.
                            pointerEvents: center ? "auto" : "none",
                        }}
                    >
                        {center}
                    </Box>
                    {cornerRow}
                </>
            )}
        </Box>
    ) : (
        <Box data-game-system-controls sx={{ ...gameSystemControlsSx, ...anchorSx }}>
            <Box sx={{ display: "flex", justifyContent: "flex-start", pointerEvents: "auto" }}>
                <FullscreenToggle />
            </Box>
            <Box
                sx={{
                    width: sidebarWidth !== undefined ? "100%" : GAME_SYSTEM_CONTROLS_CENTER_WIDTH,
                    minWidth: 0,
                    justifySelf: "center",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    // An empty centre slot must not swallow clicks aimed at whatever sits behind it.
                    pointerEvents: center ? "auto" : "none",
                }}
            >
                {center}
            </Box>
            <Box ref={volumeSlotRef} sx={{ ...volumeSlotSx, pointerEvents: "auto" }} />
        </Box>
    );

    return typeof document === "undefined" ? controls : createPortal(controls, document.body);
};

export default GameSystemControls;
