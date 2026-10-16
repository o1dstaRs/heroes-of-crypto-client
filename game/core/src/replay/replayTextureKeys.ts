import { approvedAnimationAssetKeysForUnit } from "../pixi/creatureAnimationSettings";
import { getSplitBundles } from "../pixi/PixiTextureLoader";
import { TextureType, unitToTextureName } from "../pixi/PixiUnitsFactory";
import type { SandboxReplay } from "./sandbox_replay";
import { GridVals } from "@heroesofcrypto/common";
import { lavaPitTextureKeys } from "../scenes/sandbox/lavaPitAssets";

/** Include later summons too, so their first action never begins with missing artwork. */
export function replayTextureKeys(replay: SandboxReplay, sequence: number): string[] {
    const keys = new Set<string>();
    const names = new Set<string>();
    for (const state of [
        replay.initialState,
        ...replay.actions.slice(0, sequence).map((record) => record.stateAfter),
    ]) {
        if (state.gridType === GridVals.LAVA_CENTER) {
            for (const key of lavaPitTextureKeys(!!state.centerDried)) keys.add(key);
        }
        for (const unit of state.units) names.add(unit.properties.name);
    }
    for (const name of names) {
        keys.add(unitToTextureName(name, TextureType.SMALL));
        for (const key of approvedAnimationAssetKeysForUnit(name)) keys.add(key);
    }
    // These effects are selected dynamically by attacks, passives and spell casts during presentation.
    const bundles = getSplitBundles();
    for (const bundle of [
        bundles.lazyCombatEffectAssets,
        bundles.lazyProjectileAssets,
        bundles.lazyAbilityAssets,
        bundles.lazySpellAssets,
    ]) {
        for (const key of Object.keys(bundle)) keys.add(key);
    }
    return [...keys];
}
