import { expect, test } from "bun:test";
import { CreatureVals } from "@heroesofcrypto/common";
import { resolveLeftSidebarPortraitArt } from "./leftSidebarPortraitArt";

test("Champion uses the approved independent left-screen canvas", () => {
    expect(resolveLeftSidebarPortraitArt(CreatureVals.CHAMPION)).toMatchObject({
        source: expect.stringContaining("champion_left_screen_x2.webp"),
        usesFraming: false,
        fit: "contain",
        baseScale: 1,
    });
});
