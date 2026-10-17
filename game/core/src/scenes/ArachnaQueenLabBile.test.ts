import { expect, test } from "bun:test";
import { queenBiteBilePose, isQueenBite, QUEEN_BILE_SCALE, type QueenBite } from "./ArachnaQueenLabBile";
import { isCoreTextureAssetKey, isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";

test("queen painted bile loads in the core bundle at the requested 22 percent reduction", () => {
    expect(QUEEN_BILE_SCALE).toBe(0.78);
    expect(isCoreTextureAssetKey("arachna_queen_bile_sprites_v1")).toBe(true);
    expect(isProductionOmittedAssetKey("arachna_queen_bile_sprites_v1")).toBe(false);
});

test("queen bile releases at jaw impact in each target direction and keeps its release origin", () => {
    for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down"] as QueenBite[]) {
        expect(isQueenBite(state)).toBe(true);
        expect(queenBiteBilePose(state, 2, 249).burstSeconds).toBe(-1);
        const hit = queenBiteBilePose(state, 3, 250);
        expect(hit.burstSeconds).toBe(0);
        expect<unknown>(hit.origin).toEqual(hit.mouth);
        expect(hit.direction[0]).toBeGreaterThan(0);
        expect(Math.sign(hit.direction[1])).toBe(state.endsWith("_up") ? -1 : state.endsWith("_down") ? 1 : 0);
        expect(Math.hypot(...hit.direction)).toBeCloseTo(1);
        const recovery = queenBiteBilePose(state, 4, 450);
        expect(recovery.origin).toEqual(hit.origin);
        expect(recovery.mouth).not.toEqual(hit.mouth);
        expect(recovery.burstSeconds).toBeCloseTo(0.2);
        expect(queenBiteBilePose(state, 5, 570).burstSeconds).toBe(-1);
        for (const facing of [-1, 1]) expect(Math.sign(hit.direction[0] * facing)).toBe(facing);
    }
    expect(isQueenBite("death")).toBe(false);
    expect(isQueenBite("hit")).toBe(false);
});
