import Box from "@mui/joy/Box";
import React, { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { registerVolumeSlot, VOLUME_SLOT_PRIORITY } from "./audio/volumeSlot";
import { FullscreenToggle } from "./RightSideBar/FullscreenToggle";

export const GAME_SYSTEM_CONTROLS_SIDE_INSET = "1rem";
export const GAME_SYSTEM_CONTROLS_BOTTOM_INSET = "1rem";
export const GAME_SYSTEM_CONTROLS_CENTER_WIDTH = "min(209px, calc(100vw - 8rem))";

export const gameSystemControlsSx = {
    position: "fixed",
    left: GAME_SYSTEM_CONTROLS_SIDE_INSET,
    right: GAME_SYSTEM_CONTROLS_SIDE_INSET,
    bottom: GAME_SYSTEM_CONTROLS_BOTTOM_INSET,
    display: "grid",
    gridTemplateColumns: "32px minmax(0, 1fr) 32px",
    alignItems: "center",
    pointerEvents: "none",
} as const;

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
