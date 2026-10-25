import { expect, test } from "bun:test";
import { images } from "../generated/image_imports";
import { LEFT_SIDEBAR_PORTRAIT_ATLASES } from "../ui/leftSidebarPortraitAnimationSources";
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

test("production retains every versioned sidebar animation even when battlefield animations are disabled", () => {
    const filenames = [
        ...Object.values(LEFT_SIDEBAR_PORTRAIT_ATLASES).map((src) =>
            new URL(src, "http://localhost").pathname.split("/").pop()!,
        ),
        "arbalester_v8_atlas.webp",
    ];
    for (const filename of filenames) {
        const key = filename.replace(/\.webp$/, "");
        expect(CREATURE_PORTRAIT_ASSET_KEYS.has(key), key).toBe(true);
        expect(isProductionOmittedAssetKey(key), key).toBe(false);
        expect(isProductionOmittedDisabledUnitAnimationAssetKey(key), key).toBe(false);
        expect(isProductionOmittedEnvironmentAssetKey(key), key).toBe(false);
        expect(isProductionOmittedLegacyUiAssetKey(key), key).toBe(false);
        expect(isProductionOmittedUnreferencedAssetKey(key), key).toBe(false);
    }
});
