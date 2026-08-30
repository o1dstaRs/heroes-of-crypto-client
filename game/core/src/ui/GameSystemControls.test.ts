import { describe, expect, test } from "bun:test";

import {
    GAME_SYSTEM_CONTROLS_BOTTOM_INSET,
    GAME_SYSTEM_CONTROLS_CENTER_WIDTH,
    GAME_SYSTEM_CONTROLS_SIDE_INSET,
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

    test("lets a full-screen draft own the sound control over the hidden sidebar", () => {
        expect(VOLUME_SLOT_PRIORITY.draftControls).toBeGreaterThan(VOLUME_SLOT_PRIORITY.gameControls);
    });
});
