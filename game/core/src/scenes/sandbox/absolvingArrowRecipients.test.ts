import { expect, test } from "bun:test";
import type { IVisibleDamage } from "@heroesofcrypto/common";
import { absolvingArrowRecipientIds } from "./absolvingArrowRecipients";
import { animationAtlases } from "../../generated/animation_atlases";
import { commonFlagFrameAt } from "./CommonFlagPops";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../../pixi/imageAssetTiers";

test("cleansed allies pop once even on a miss, and counter-shot recipients stay with their source", () => {
    const damage = {
        missed: true,
        absolutions: [
            { sourceUnitId: "monk", unitId: "ally", liftedNames: ["Stun", "Weakness"] },
            { sourceUnitId: "monk", unitId: "ally", liftedNames: ["Break"] },
            { sourceUnitId: "monk", unitId: "unaffected", liftedNames: [] },
            { sourceUnitId: "monk", unitId: "monk", liftedNames: ["Stun"] },
            { sourceUnitId: "responder", unitId: "other-ally", liftedNames: ["Freeze"] },
        ],
    } as IVisibleDamage;
    expect(absolvingArrowRecipientIds(damage, "monk")).toEqual(["ally"]);
    expect(absolvingArrowRecipientIds(damage, "responder")).toEqual(["other-ally"]);
    expect(absolvingArrowRecipientIds(undefined, "monk")).toEqual([]);
    expect(absolvingArrowRecipientIds({} as IVisibleDamage, "monk")).toEqual([]);
});

test("gold feather is available on demand and plays all nine cels in exactly one second", () => {
    const meta = animationAtlases["Vfx Absolving Arrow"].pop;
    expect(meta.frameCount).toBe(9);
    expect(meta.loopDurationMs).toBe(1000);
    let elapsed = 0;
    for (const [frame, duration] of meta.frameDurationsMs!.entries()) {
        expect(commonFlagFrameAt("absolving_arrow", elapsed)).toBe(frame);
        expect(commonFlagFrameAt("absolving_arrow", elapsed + duration - 0.01)).toBe(frame);
        elapsed += duration;
    }
    expect(elapsed).toBe(1000);
    expect(commonFlagFrameAt("absolving_arrow", elapsed)).toBeUndefined();
    expect(isLazyCombatEffectAssetKey("vfx_absolving_arrow_pop_atlas")).toBe(true);
    expect(isProductionOmittedAssetKey("vfx_absolving_arrow_pop_atlas")).toBe(false);
});
