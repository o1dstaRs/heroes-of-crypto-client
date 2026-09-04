import { CreatureVals } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import {
    CREATURE_PORTRAIT_BACKGROUND_MOTION_KEYFRAMES,
    resolveCreaturePortraitBackgroundMotion,
} from "./creaturePortraitBackgroundMotion";

describe("creature portrait background motion", () => {
    test.each([
        [CreatureVals.ORC, "chaos"],
        [CreatureVals.PEASANT, "life"],
        [CreatureVals.CENTAUR, "might"],
        [CreatureVals.WOLF, "nature"],
    ] as const)("maps creature %s to its faction motion", (creatureId, kind) => {
        const motion = resolveCreaturePortraitBackgroundMotion(creatureId);

        expect(motion?.kind).toBe(kind);
        expect(motion?.glowSrc).toContain(`${kind}_portrait_bg_emissive_glow_v1.webp`);
        expect(motion?.primaryAnimation).toContain(`hocPortrait${kind[0].toUpperCase()}${kind.slice(1)}`);
        expect(motion?.secondaryAnimation).toContain(`hocPortrait${kind[0].toUpperCase()}${kind.slice(1)}`);
    });

    test("keeps every animation loop seamless", () => {
        for (const frames of Object.values(CREATURE_PORTRAIT_BACKGROUND_MOTION_KEYFRAMES)) {
            expect(frames).toHaveProperty("0%, 100%");
            for (const frame of Object.values(frames)) {
                expect(frame).not.toHaveProperty("transform");
            }
        }
    });
});
