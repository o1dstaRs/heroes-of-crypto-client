import { expect, test } from "bun:test";
import { images } from "../generated/image_imports";
import { CREATURE_PORTRAIT_ASSET_KEYS } from "./creaturePortraitAssetKeys";
import { isProductionOmittedAssetKey } from "./imageAssetTiers";
import {
    isProductionOmittedDisabledUnitAnimationAssetKey,
    isProductionOmittedEnvironmentAssetKey,
    isProductionOmittedLegacyUiAssetKey,
    isProductionOmittedUnreferencedAssetKey,
} from "./productionImageAssetPolicy";

test("production retains every card, sidebar and full-body portrait source used by the local selectors", () => {
    for (const key of CREATURE_PORTRAIT_ASSET_KEYS) {
        expect(isProductionOmittedAssetKey(key), key).toBe(false);
        expect(isProductionOmittedDisabledUnitAnimationAssetKey(key), key).toBe(false);
        expect(isProductionOmittedEnvironmentAssetKey(key), key).toBe(false);
        expect(isProductionOmittedLegacyUiAssetKey(key), key).toBe(false);
        expect(isProductionOmittedUnreferencedAssetKey(key), key).toBe(false);
        expect((images as Record<string, string>)[key], key).toBeString();
    }
});
