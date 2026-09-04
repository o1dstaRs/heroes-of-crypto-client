import { CreatureVals } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import { resolveLeftSidebarPortraitAnimation } from "./leftSidebarPortraitAnimation";

describe("left sidebar portrait animation", () => {
    test("uses the exact Peasant portrait-frame contract", () => {
        const animation = resolveLeftSidebarPortraitAnimation(CreatureVals.PEASANT);

        expect(animation).not.toBeNull();
        expect(animation?.src).toContain("peasant_left_screen_idle_atlas.webp");
        expect(animation?.meta).toMatchObject({
            frameWidth: 572,
            frameHeight: 808,
            atlasWidth: 3432,
            atlasHeight: 4848,
            frameCount: 34,
            fps: 9.936,
            layout: { cols: 6, rows: 6 },
        });
    });

    test("does not replace other creatures' portraits", () => {
        expect(resolveLeftSidebarPortraitAnimation(CreatureVals.SQUIRE)).toBeNull();
    });
});
