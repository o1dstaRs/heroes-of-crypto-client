import { describe, expect, test } from "bun:test";

import {
    GAME_SYSTEM_CONTROL_SIZE_PX,
    GAME_SYSTEM_CONTROLS_BOTTOM_INSET,
    GAME_SYSTEM_CONTROLS_CENTER_WIDTH,
    GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX,
    GAME_SYSTEM_CONTROLS_SIDE_INSET,
    GAME_SYSTEM_CONTROLS_STACK_GAP_PX,
    gameSystemControlsSx,
} from "./GameSystemControls";
import { VOLUME_SLOT_PRIORITY } from "./audio/volumeSlot";

describe("game system controls", () => {
    test("anchors fullscreen, exit, and sound to one viewport-wide row", () => {
        expect(gameSystemControlsSx.position).toBe("fixed");
        expect(gameSystemControlsSx.left).toBe(GAME_SYSTEM_CONTROLS_SIDE_INSET);
        expect(gameSystemControlsSx.right).toBe(GAME_SYSTEM_CONTROLS_SIDE_INSET);
        expect(gameSystemControlsSx.bottom).toBe(GAME_SYSTEM_CONTROLS_BOTTOM_INSET);
        expect(gameSystemControlsSx.gridTemplateColumns).toBe("32px minmax(0, 1fr) 32px");
        expect(GAME_SYSTEM_CONTROLS_CENTER_WIDTH).toContain("209px");
    });

    /**
     * The centre cell alone sets the row's height (ranked footer, ranked panel, EXIT FIGHT). Centring the
     * 32px side cells against it floated them up by half the difference — measured 48px above the row's own
     * bottom inset with a 96px centre — so in a fight the speaker hovered above the social dock's buttons.
     */
    test("keeps fullscreen and sound on the bottom line whatever the centre grows to", () => {
        expect(gameSystemControlsSx.alignItems).toBe("end");
    });

    test("the centred plate's empty flank matches the social, sound and fullscreen row", () => {
        expect(GAME_SYSTEM_CONTROLS_CORNER_FLANK_PX).toBe(
            GAME_SYSTEM_CONTROL_SIZE_PX * 3 + GAME_SYSTEM_CONTROLS_STACK_GAP_PX * 2,
        );
    });

    test("lets a full-screen draft own the sound control over the hidden sidebar", () => {
        expect(VOLUME_SLOT_PRIORITY.draftControls).toBeGreaterThan(VOLUME_SLOT_PRIORITY.gameControls);
    });
});
