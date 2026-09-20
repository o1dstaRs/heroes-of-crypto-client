import Box from "@mui/joy/Box";
import React, { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { registerVolumeSlot, VOLUME_SLOT_PRIORITY } from "./audio/volumeSlot";
import { FullscreenToggle } from "./RightSideBar/FullscreenToggle";

export const GAME_SYSTEM_CONTROLS_SIDE_INSET = "1rem";
export const GAME_SYSTEM_CONTROLS_BOTTOM_INSET = "1rem";
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
/** Width of that row — the grid reserves it on BOTH flanks so the centre slot stays centred. */
export const GAME_SYSTEM_CONTROLS_STACK_WIDTH_PX = GAME_SYSTEM_CONTROL_SIZE_PX * 2 + GAME_SYSTEM_CONTROLS_STACK_GAP_PX;
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
 * One footer row for fullscreen, the primary action and sound.
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
}> = ({ center, sidebarWidth, priority = VOLUME_SLOT_PRIORITY.gameControls, zIndex = 60, rightStack = false }) => {
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
                // fixed element of its own and takes no space here. Reserve its slot so the footer plate
                // beside it stops short of the medallion instead of sliding underneath it.
                pl: `${GAME_SYSTEM_CONTROL_SIZE_PX + GAME_SYSTEM_CONTROLS_STACK_GAP_PX}px`,
            }}
        >
            <Box ref={volumeSlotRef} sx={volumeSlotSx} />
            <FullscreenToggle />
        </Box>
    );

    /**
     * One line: the footer plate takes the space left of the corner controls, the controls keep the
     * corner. The plate caps itself at this slot's width, so it can never cross the host's left edge.
     * Where the host is too narrow for both — the plate is 209px of authored artwork — the row wraps and
     * the plate gets the full width on the line above rather than shrinking to a sliver. The slot is a
     * size container either way, so the lettering scales with the plate instead of outgrowing it.
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
