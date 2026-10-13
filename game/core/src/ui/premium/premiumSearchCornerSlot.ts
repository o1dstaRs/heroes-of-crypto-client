import {
    GAME_SYSTEM_CONTROLS_BOTTOM_INSET,
    GAME_SYSTEM_CONTROL_SIZE_PX,
    GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX,
    GAME_SYSTEM_CONTROLS_SIDE_INSET,
} from "../GameSystemControls";
import { SYSTEM_DOCK_STEP_PX } from "../social/systemControlsMode";

/** The in-game Ask Premium pill. Taller than the 32px medallions, centred on their line. */
export const PREMIUM_SEARCH_CORNER_SLOT_HEIGHT_PX = 44;
export const PREMIUM_SEARCH_CORNER_SLOT_WIDTH_PX = 168;
/** Space between the pill's right edge and the nearest corner button. */
export const PREMIUM_SEARCH_CORNER_GAP_PX = 10;

/**
 * Fixed corner placement for Ask Premium: the same vertical centre as the system, sound and fullscreen
 * medallions, with its right edge one gap to the left of that whole group. An open fan shifts it left by
 * the three extra buttons so it stays clear of them. One style object — a second `translateY` on the
 * slot was losing the cascade and leaving the pill a row above the medallions.
 */
export const premiumSearchCornerSlotSx = (menuOpen: boolean) => {
    const overhang = (PREMIUM_SEARCH_CORNER_SLOT_HEIGHT_PX - GAME_SYSTEM_CONTROL_SIZE_PX) / 2;
    const fanShift = menuOpen ? 3 * SYSTEM_DOCK_STEP_PX : 0;
    return {
        position: "fixed" as const,
        top: "auto" as const,
        transform: "none" as const,
        bottom: `calc(${GAME_SYSTEM_CONTROLS_BOTTOM_INSET} - ${overhang}px)`,
        right: `calc(${GAME_SYSTEM_CONTROLS_SIDE_INSET} + ${
            GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX + PREMIUM_SEARCH_CORNER_GAP_PX + fanShift
        }px)`,
        transition: "right 210ms ease",
    };
};
