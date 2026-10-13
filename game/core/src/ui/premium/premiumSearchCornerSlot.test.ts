import { describe, expect, test } from "bun:test";

import {
    GAME_SYSTEM_CONTROLS_BOTTOM_INSET,
    GAME_SYSTEM_CONTROL_SIZE_PX,
    GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX,
    GAME_SYSTEM_CONTROLS_SIDE_INSET,
} from "../GameSystemControls";
import { SYSTEM_DOCK_STEP_PX } from "../social/systemControlsMode";
import {
    PREMIUM_SEARCH_CORNER_GAP_PX,
    PREMIUM_SEARCH_CORNER_SLOT_HEIGHT_PX,
    premiumSearchCornerSlotSx,
} from "./premiumSearchCornerSlot";

describe("Ask Premium corner lane", () => {
    test("the pill is centred on the medallions and sits one gap to their left", () => {
        const closed = premiumSearchCornerSlotSx(false);
        const overhang = (PREMIUM_SEARCH_CORNER_SLOT_HEIGHT_PX - GAME_SYSTEM_CONTROL_SIZE_PX) / 2;

        expect(closed.position).toBe("fixed");
        expect(closed.top).toBe("auto");
        expect(closed.transform).toBe("none");
        expect(closed.bottom).toBe(`calc(${GAME_SYSTEM_CONTROLS_BOTTOM_INSET} - ${overhang}px)`);
        expect(closed.right).toBe(
            `calc(${GAME_SYSTEM_CONTROLS_SIDE_INSET} + ${
                GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX + PREMIUM_SEARCH_CORNER_GAP_PX
            }px)`,
        );
        // 44px pill on a 32px row overhangs by 6px, so its centre is the medallion centre.
        expect(overhang).toBe(6);
    });

    test("an open fan keeps the pill left of every fanned button", () => {
        const open = premiumSearchCornerSlotSx(true);
        expect(open.right).toBe(
            `calc(${GAME_SYSTEM_CONTROLS_SIDE_INSET} + ${
                GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX + PREMIUM_SEARCH_CORNER_GAP_PX + 3 * SYSTEM_DOCK_STEP_PX
            }px)`,
        );
    });
});
