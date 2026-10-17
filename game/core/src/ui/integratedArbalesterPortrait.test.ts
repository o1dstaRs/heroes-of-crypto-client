import { CreatureVals } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import { resolveLeftSidebarPortraitAnimation } from "./leftSidebarPortraitAnimation";
import { resolveIntegratedArbalesterPortrait } from "./integratedArbalesterPortrait";

describe("integrated Arbalester sidebar portrait", () => {
    test("restores source frames at the slowed cycle duration", () => {
        const portrait = resolveIntegratedArbalesterPortrait(
            CreatureVals.ARBALESTER,
            resolveLeftSidebarPortraitAnimation(CreatureVals.ARBALESTER),
        );
        expect(portrait?.src).toContain("arbalester_v8_atlas.webp");
        expect(portrait?.meta.frameCount).toBe(100);
        expect(portrait?.meta.totalDurationSec).toBe(241 / 24 / 0.93);
        expect(portrait?.meta.loopDurationMs).toBe(Math.round((241 / 24 / 0.93) * 1000));
    });

    test("leaves another creature's portrait untouched", () => {
        const fallback = resolveLeftSidebarPortraitAnimation(CreatureVals.SQUIRE);
        expect(resolveIntegratedArbalesterPortrait(CreatureVals.SQUIRE, fallback)).toBe(fallback);
    });
});
