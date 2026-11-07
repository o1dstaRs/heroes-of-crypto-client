import { CreatureVals } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import { resolveLeftSidebarPortraitAnimation } from "./leftSidebarPortraitAnimation";
import { LEFT_SIDEBAR_PORTRAIT_ATLASES } from "./leftSidebarPortraitAnimationSources";
import { UNIT_ID_TO_NAME } from "./unit_ui_constants";

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

    test("resolves every supplied creature video to the left battle card", () => {
        expect(Object.keys(LEFT_SIDEBAR_PORTRAIT_ATLASES)).toHaveLength(54);
        for (const [creatureId, name] of Object.entries(UNIT_ID_TO_NAME)) {
            const slug = name.toLowerCase().replaceAll(" ", "_");
            const animation = resolveLeftSidebarPortraitAnimation(Number(creatureId));
            if (name === "Peasant") continue;
            if (slug in LEFT_SIDEBAR_PORTRAIT_ATLASES) {
                expect(animation?.src).toContain(`${slug}_left_screen_idle_atlas.webp`);
                if (slug === "squire") {
                    expect(animation?.meta).toMatchObject({
                        frameCount: 60,
                        totalDurationSec: 145 / 24,
                        layout: { cols: 10, rows: 6 },
                    });
                } else if (slug === "blacksmith") {
                    expect(animation?.meta).toMatchObject({
                        frameCount: 98,
                        fps: (100 * 24) / 241,
                        layout: { cols: 10, rows: 10 },
                    });
                    expect(animation?.meta.totalDurationSec).toBeCloseTo((98 * 241) / (100 * 24));
                } else {
                    expect(animation?.meta).toMatchObject({
                        frameCount: 100,
                        totalDurationSec: 241 / 24,
                        fps: (100 * 24) / 241,
                        layout: { cols: 10, rows: 10 },
                    });
                }
            } else {
                expect(["Unknown", "Thunderbird", "Arachna Queen"]).toContain(name);
                expect(animation).toBeNull();
            }
        }
    });
});
