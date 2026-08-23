import { describe, expect, it } from "bun:test";

import { isPreviewPlayGameForEnvironment, PREVIEW_PLACEMENT_GAME_ID } from "./previewPlayGate";

describe("preview play routing", () => {
    it("recognizes the reserved preview id only when previews are enabled", () => {
        expect(isPreviewPlayGameForEnvironment(PREVIEW_PLACEMENT_GAME_ID, true)).toBe(true);
        expect(isPreviewPlayGameForEnvironment(PREVIEW_PLACEMENT_GAME_ID, false)).toBe(false);
        expect(isPreviewPlayGameForEnvironment("ranked-game-id", true)).toBe(false);
    });
});
