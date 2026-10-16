import { describe, expect, test } from "bun:test";

import { BATTLEFIELD_TEXTURE_KEYS, FINAL_STATIC_BATTLEFIELD_TEXTURES } from "./battlefieldTextureKeys";
import {
    isCoreTextureAssetKey,
    isDeferredLegacyCreatureAssetKey,
    isLazyBattlefieldCreatureAssetKey,
    isProductionOmittedAssetKey,
} from "./imageAssetTiers";
import {
    isProductionOmittedDisabledUnitAnimationAssetKey,
    isProductionOmittedEnvironmentAssetKey,
    isProductionOmittedLegacyUiAssetKey,
    isProductionOmittedUnreferencedAssetKey,
} from "./productionImageAssetPolicy";

// A production build leaves out every image these rules mark omitted, and a creature whose board image is left out
// has no URL to load, so it never appears on the board. The approved images once matched the legacy
// `_battlefield_side_right_` rule, and 44 of the 57 were dropped from production builds.
describe("creature board images", () => {
    test("every one survives a production build", () => {
        for (const key of BATTLEFIELD_TEXTURE_KEYS) {
            expect(isProductionOmittedAssetKey(key), key).toBe(false);
            expect(isProductionOmittedDisabledUnitAnimationAssetKey(key), key).toBe(false);
            expect(isProductionOmittedEnvironmentAssetKey(key), key).toBe(false);
            expect(isProductionOmittedLegacyUiAssetKey(key), key).toBe(false);
            expect(isProductionOmittedUnreferencedAssetKey(key), key).toBe(false);
        }
    });

    test("they load on demand for the fight, never as legacy art or in the blocking core tier", () => {
        expect(BATTLEFIELD_TEXTURE_KEYS.size).toBe(Object.keys(FINAL_STATIC_BATTLEFIELD_TEXTURES).length);
        for (const key of BATTLEFIELD_TEXTURE_KEYS) {
            expect(isLazyBattlefieldCreatureAssetKey(key), key).toBe(true);
            expect(isDeferredLegacyCreatureAssetKey(key), key).toBe(false);
            expect(isCoreTextureAssetKey(key), key).toBe(false);
        }
    });
});
