import Box from "@mui/joy/Box";
import React, { useCallback, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { registerVolumeSlot, VOLUME_SLOT_PRIORITY } from "./audio/volumeSlot";
import { registerBattleSystemControls } from "./social/systemControlsMode";
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
/**
 * Height a host must reserve beneath its own content: one line, so whichever is taller — the controls or
 * the footer plate beside them.
 */
export const GAME_SYSTEM_CONTROLS_STACK_HEIGHT_PX = Math.max(
    GAME_SYSTEM_CONTROL_SIZE_PX,
    GAME_SYSTEM_CONTROLS_CENTER_HEIGHT_PX,
);
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
    leading?: { content: React.ReactNode; width: number };
    centerInRow?: boolean;
    centerMinWidth?: number;
    onHeightChange?: (height: number) => void;
    sidebarWidth?: number;
    priority?: number;
    zIndex?: number;
    /** Keep sound and fullscreen in the shared bottom-right row. */
    rightStack?: boolean;
}> = ({
    center,
    leading,
    centerInRow = false,
    centerMinWidth = GAME_SYSTEM_CONTROLS_CENTER_MIN_WIDTH_PX,
    onHeightChange,
    sidebarWidth,
    priority = VOLUME_SLOT_PRIORITY.gameControls,
    zIndex = 60,
    rightStack = false,
}) => {
    const controlsRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const controls = controlsRef.current;
        if (!controls || !onHeightChange) return;
        const measure = () => onHeightChange(Math.ceil(controls.getBoundingClientRect().height));
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(controls);
        return () => observer.disconnect();
    }, [onHeightChange, rightStack]);
    // The corner row is rebuilt when the footer changes shape (placement plate → fight). A layout
    // effect keyed only on priority would keep publishing the detached node, and the speaker —
    // portaled into that node — vanishes for the rest of the fight.
    const releaseVolumeSlot = useRef<() => void>(() => {});
    const volumeSlotRef = useCallback(
        (element: HTMLDivElement | null) => {
            releaseVolumeSlot.current();
            releaseVolumeSlot.current = element ? registerVolumeSlot(element, priority) : () => {};
        },
        [priority],
    );

    useLayoutEffect(() => registerBattleSystemControls(), []);

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
                alignSelf: "flex-end",
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
     * One line, always: the footer plate takes the space left of the corner controls and the controls
     * keep the corner. The plate caps itself at this slot's width, so it can never cross the host's left
     * edge, and the slot is a size container — on a sidebar too narrow for the plate's authored 209px the
     * lettering scales down with the plate instead of outgrowing its own background.
     */
    const controls = rightStack ? (
        <Box
            data-game-system-controls
            ref={controlsRef}
            sx={{
                position: "fixed",
                left: GAME_SYSTEM_CONTROLS_SIDE_INSET,
                right: GAME_SYSTEM_CONTROLS_SIDE_INSET,
                bottom: GAME_SYSTEM_CONTROLS_BOTTOM_INSET,
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: GAME_SYSTEM_CONTROLS_STACK_GAP,
                pointerEvents: "none",
                ...anchorSx,
            }}
        >
            {leading && <Box sx={{ width: leading.width, minWidth: 0, pointerEvents: "auto" }}>{leading.content}</Box>}
            <Box
                sx={{
                    flex: centerInRow ? `1 1 ${centerMinWidth}px` : "1 1 auto",
                    minWidth: 0,
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
        <Box data-game-system-controls ref={controlsRef} sx={{ ...gameSystemControlsSx, ...anchorSx }}>
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

export const GAME_SYSTEM_CONTROLS_CENTER_MIN_WIDTH_PX = 209;

export const GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX =
    GAME_SYSTEM_CONTROL_SIZE_PX * 3 + GAME_SYSTEM_CONTROLS_STACK_GAP_PX * 2;

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
