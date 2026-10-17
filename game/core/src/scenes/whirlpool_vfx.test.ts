import { expect, mock, test } from "bun:test";
import { type GameEvent, type GridSettings } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { spellFootprint } from "./sandbox/SpellFootprint";
import type { WhirlpoolFootprint } from "./sandbox/WhirlpoolSprites";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";
import { isUnitAnimationAtlasKey } from "../pixi/unitAtlasKeys";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "../pixi/productionImageAssetPolicy";

// Exercise the shared live/replay renderer using the actual non-damaging event shape.
test("Whirlpool renders its aimed floor cell without needing damaged entries or a surviving unit", () => {
    const gs = {
        getCellSize: () => 64,
        getStep: () => 64,
        getHalfStep: () => 32,
        getMinX: () => 0,
        getMaxX: () => 1024,
        getMinY: () => 0,
        getMaxY: () => 1024,
    } as GridSettings;
    const spawn = mock<(footprint: WhirlpoolFootprint) => void>(() => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => gs },
        combatVisuals: { spawnWhirlpool: spawn },
        unitsHolder: { getAllUnits: () => new Map() },
    });
    const event: GameEvent = {
        type: "spell_cast",
        casterId: "dragon",
        targetId: "target",
        spellName: "Whirlpool",
        targetCell: { x: 3, y: 5 },
        unitIdsDied: [],
        animations: [],
    };
    scene.renderSpellDamageVfx([event]);
    expect(spawn.mock.calls).toEqual([[spellFootprint([event.targetCell!], gs)]]);
    scene.renderSpellDamageVfx([{ ...event, spellName: "Slow" }]);
    scene.renderSpellDamageVfx([{ ...event, targetCell: undefined }]);
    expect(spawn).toHaveBeenCalledTimes(1);
});

test("the Whirlpool atlas ships in production and is loaded only when needed", () => {
    expect(isLazyCombatEffectAssetKey("vfx_whirlpool_swirl_atlas")).toBe(true);
    expect(isUnitAnimationAtlasKey("vfx_whirlpool_swirl_atlas")).toBe(false);
    expect(isProductionOmittedDisabledUnitAnimationAssetKey("vfx_whirlpool_swirl_atlas")).toBe(false);
    expect(isProductionOmittedAssetKey("vfx_whirlpool_swirl_atlas")).toBe(false);
});
